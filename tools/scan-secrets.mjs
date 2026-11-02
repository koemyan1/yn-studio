// Scans the project (and dist/ after a build) for keys that must never be committed or shipped to browsers.
// Run: node tools/scan-secrets.mjs      Exit code 1 = something found. Prints file + line + pattern name, never the secret.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'android', 'ios']);
const SKIP_FILES = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|mp4|zip|pdf|lock)$/i;
const SELF = new Set(['tools/scan-secrets.mjs', 'server/security/env.js', 'tests/secrets.test.mjs']);

const PATTERNS = [
  ['Supabase service_role JWT', /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, v => { try { return JSON.parse(Buffer.from(v.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { return false; } }],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g],
  ['Telegram bot token', /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g],
  ['Stripe / generic live secret', /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g],
  ['Hard-coded secret assignment', /\b(?:BAKONG_API_TOKEN|ABA_PAYWAY_API_KEY|SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|VAPID_PRIVATE_KEY)\s*[:=]\s*['"]?[A-Za-z0-9._\-+/]{16,}/g,  v => !/[:=]\s*['"]?(?:YOUR_|your_|<|xxx|process\.env|env\.)/.test(v)],
  ['Secret in a VITE_ variable', /\bVITE_[A-Z_]*(?:SERVICE_ROLE|SECRET|PRIVATE|API_KEY|TOKEN)[A-Z_]*\s*=\s*\S+/g],
];

export function scanText(text, file = '') {
  const hits = [];
  for (const [name, re, confirm] of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (confirm && !confirm(m[0])) continue;
      hits.push({ file, line: text.slice(0, m.index).split('\n').length, name });
    }
  }
  return hits;
}

export function scanDir(dir = root, base = root) {
  const hits = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) hits.push(...scanDir(full, base)); continue; }
    if (SKIP_FILES.test(e.name) || SELF.has(rel) || fs.statSync(full).size > 3_000_000) continue;
    if (/^\.env(\.|$)/.test(e.name) && !/example$/.test(e.name)) { hits.push({ file: rel, line: 1, name: 'A real .env file is in the project folder (must not be zipped or committed)' }); continue; }
    hits.push(...scanText(fs.readFileSync(full, 'utf8'), rel));
  }
  return hits;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const hits = scanDir();
  if (!hits.length) { console.log('No secrets found.'); process.exit(0); }
  for (const h of hits) console.error(`${h.file}:${h.line}  ${h.name}`);
  console.error(`\n${hits.length} problem(s). Rotate any key that was real, then remove it from the file.`);
  process.exit(1);
}
