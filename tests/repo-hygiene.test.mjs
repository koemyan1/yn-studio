// Keeps the repo layout from drifting back into a mess. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('every SQL script in supabase/sql is listed in RUN-ORDER.md', () => {
  const order = read('supabase/sql/RUN-ORDER.md');
  const missing = fs.readdirSync(path.join(root, 'supabase/sql')).filter((f) => f.endsWith('.sql') && !order.includes('`' + f + '`'));
  assert.deepEqual(missing, [], 'add these to supabase/sql/RUN-ORDER.md: ' + missing.join(', '));
});

test('supabase/migrations only holds timestamped files (the CLI runs them in name order)', () => {
  const dir = path.join(root, 'supabase/migrations');
  const bad = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql') && !/^\d{8,14}_/.test(f)) : [];
  assert.deepEqual(bad, [], 'rename with a timestamp or move to supabase/sql: ' + bad.join(', '));
});

test('the repo root stays tidy (no loose changelogs, setup guides or SQL)', () => {
  const stray = fs.readdirSync(root).filter((f) => /^CHANGELOG-/.test(f) || /-SETUP\.md$/.test(f) || /\.sql$/.test(f) || /\.txt$/.test(f));
  assert.deepEqual(stray, [], 'move to docs/ or supabase/sql/: ' + stray.join(', '));
});

test('relative markdown links in the main docs resolve', () => {
  const files = ['README.md', 'CHANGELOG.md', 'supabase/README.md', 'supabase/sql/RUN-ORDER.md', 'SECURITY-REPORT.md'].filter((f) => fs.existsSync(path.join(root, f)));
  const broken = [];
  for (const f of files) {
    const dir = path.dirname(path.join(root, f));
    for (const m of read(f).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      if (!fs.existsSync(path.resolve(dir, target))) broken.push(`${f} -> ${target}`);
    }
  }
  assert.deepEqual(broken, [], 'broken links:\n' + broken.join('\n'));
});

test('checkout calls the server-side order function', () => {
  assert.match(read('src/main.tsx'), /rpc\('yn_place_order'/);
  assert.match(read('supabase/sql/supabase-server-side-order.sql'), /create or replace function public\.yn_place_order/);
});
