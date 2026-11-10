// "Write coin" page helpers. Run: node --test tests/core-write.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCoinUrl, normalizeCoinUrl, maskCoinText, COIN_TOKEN_RE } from '../shared/coinUrl.js';
import { newToken } from '../server/core/crypto.js';

const O = 'https://ynstudio.site';

test('accepts a real coin URL and masks the token', () => {
  const t = newToken();
  const r = parseCoinUrl(`  ${O}/nfc/${t}\n`, O);
  assert.equal(r.ok, true);
  assert.equal(r.url, `${O}/nfc/${t}`);
  assert.equal(r.sameOrigin, true);
  assert.ok(!r.masked.includes(t));
  assert.ok(r.masked.startsWith(`${O}/nfc/${t.slice(0, 4)}`));
});
test('flags a URL for another website but still accepts it', () => {
  const r = parseCoinUrl(`https://example.com/nfc/${newToken()}`, O);
  assert.equal(r.ok, true); assert.equal(r.sameOrigin, false);
});
test('rejects anything that is not exactly /nfc/<43 chars> over https', () => {
  const t = newToken();
  for (const bad of ['', '   ', 'hello', `http://ynstudio.site/nfc/${t}`, `${O}/nfc/${t}?x=1`, `${O}/nfc/${t}#a`, `${O}/nfc/${t}/`, `${O}/nfc/${t.slice(1)}`,
    `${O}/nfc/${t}x`, `${O}/nfc/${t.slice(0, 42)}!`, `${O}/admin/${t}`, `https://u:p@ynstudio.site/nfc/${t}`, `https://ynstudio.site:8443/nfc/${t}`,
    `${O}/nfc/${t} extra`, 'javascript:alert(1)', 'x'.repeat(400)]) {
    assert.equal(parseCoinUrl(bad, O).ok, false, JSON.stringify(bad).slice(0, 60));
  }
});
test('error messages never contain the token', () => {
  const t = newToken();
  const r = parseCoinUrl(`${O}/nfc/${t}?x=1`, O);
  assert.equal(r.ok, false); assert.ok(!r.error.includes(t));
});
test('normalize and mask helpers', () => {
  const t = newToken();
  assert.equal(normalizeCoinUrl(` ${O}/nfc/${t} `), `${O}/nfc/${t}`);
  assert.equal(normalizeCoinUrl('nope'), '');
  assert.ok(!maskCoinText(`${O}/nfc/${t}`).includes(t));
  assert.equal(maskCoinText('https://example.com/menu'), 'https://example.com/menu');
  assert.ok(COIN_TOKEN_RE.test(t));
});
test('the address is never put in browser storage, logs or a request body', () => {
  for (const f of ['WriteCoin.tsx', 'TokenReveal.tsx', 'nfcWrite.ts']) {
    const src = readFileSync(new URL('../src/core/' + f, import.meta.url), 'utf8');
    assert.ok(!/localStorage|sessionStorage|indexedDB|console\./.test(src), f);
    assert.ok(!/fetch\(/.test(src), f);
  }
  // the paste page only talks to the API to read the overview and to regenerate; neither sends a pasted address
  const w = readFileSync(new URL('../src/core/WriteCoin.tsx', import.meta.url), 'utf8');
  assert.ok(!/body:\s*\{[^}]*(good|text)\b/.test(w));
});
test('the reveal screen starts writing by itself and verifies by reading back', () => {
  const t = readFileSync(new URL('../src/core/TokenReveal.tsx', import.meta.url), 'utf8');
  assert.match(t, /writeAndVerify/); assert.match(t, /setTimeout\(run, 0\)/);
  const n = readFileSync(new URL('../src/core/nfcWrite.ts', import.meta.url), 'utf8');
  assert.match(n, /readTag\(signal\)/); assert.match(n, /normalizeCoinUrl\(found\) !== normalizeCoinUrl\(url\)/);
});
