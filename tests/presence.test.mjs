import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, cleanPath } from '../server/presence.js';

const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const req = (ip, ua = UA_PC) => ({ sec: { ip, key: ip }, headers: { 'user-agent': ua } });
const clock = () => { let t = Date.UTC(2026, 10, 5, 12, 0, 0); const f = () => t; f.add = ms => { t += ms; }; return f; };
const phnomPenh = { label: 'Phnom Penh, Phnom Penh, Cambodia', country: 'Cambodia', countryCode: 'KH', lat: 11.5625, lng: 104.9160 };
const intel = { describe: () => ({ geo: phnomPenh, device: null, pending: null }) };

test('cleanPath keeps only a plain path', () => {
  assert.equal(cleanPath('/product/abc?token=secret#x'), '/product/abc');
  assert.equal(cleanPath('//evil.com'), null);
  assert.equal(cleanPath('javascript:alert(1)'), null);
  assert.equal(cleanPath('/a<b>c"d'), '/abcd');
  assert.equal(cleanPath('/cart/'), '/cart');
  assert.equal(cleanPath('/'), '/');
});

test('counts visitors, expires them after 45 s, and bye removes at once', () => {
  const now = clock(); const p = createPresence({ intel, now });
  assert.ok(p.beat(req('1.1.1.1'), { sid: 'aaaaaaaa1', path: '/' }));
  assert.ok(p.beat(req('2.2.2.2', UA_PHONE), { sid: 'bbbbbbbb2', path: '/cart' }));
  let s = p.snapshot();
  assert.equal(s.online, 2); assert.equal(s.devices.mobile, 1); assert.equal(s.devices.desktop, 1);
  assert.equal(s.spots[0].count, 2); assert.equal(s.countries[0].code, 'KH');
  now.add(30000); p.beat(req('1.1.1.1'), { sid: 'aaaaaaaa1', path: '/cart' });
  now.add(20000);                       // second visitor is now 50 s silent
  s = p.snapshot(); assert.equal(s.online, 1);
  p.beat(req('1.1.1.1'), { sid: 'aaaaaaaa1', bye: true });
  assert.equal(p.snapshot().online, 0);
  assert.equal(p.snapshot().peakToday.count, 2);
});

test('never exposes IP addresses to the admin page', () => {
  const p = createPresence({ intel }); p.beat(req('203.0.113.77'), { sid: 'cccccccc3', path: '/' });
  const json = JSON.stringify(p.snapshot());
  assert.ok(!json.includes('203.0.113.77'));
  assert.ok(!json.includes('cccccccc3'));
});

test('ignores bad ids, admin pages and bots; admin tab leaves the count', () => {
  const p = createPresence({ intel });
  assert.equal(p.beat(req('1.1.1.1'), { sid: 'short', path: '/' }), false);
  assert.equal(p.beat(req('1.1.1.1'), { sid: 'has space id!', path: '/' }), false);
  assert.equal(p.beat(req('1.1.1.1'), { sid: 'dddddddd4', path: '/' }), true);
  assert.equal(p.beat(req('1.1.1.1'), { sid: 'dddddddd4', path: '/admin/orders' }), false);
  assert.equal(p.snapshot().online, 0);
  p.beat(req('9.9.9.9', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), { sid: 'eeeeeeee5', path: '/' });
  assert.equal(p.snapshot().online, 0);
  assert.equal(p.beat({ headers: {} }, { sid: 'ffffffff6', path: '/' }), false); // no shield data
});

test('one IP cannot inflate the count with made-up ids', () => {
  const p = createPresence({ intel });
  for (let i = 0; i < 60; i++) p.beat(req('5.5.5.5'), { sid: 'forged-id-' + i, path: '/' });
  assert.ok(p.snapshot().online <= 12);
});

test('visitor without a known location still counts', () => {
  const p = createPresence({ intel: { describe: () => ({ geo: null, device: null, pending: null }) } });
  p.beat(req('6.6.6.6'), { sid: 'gggggggg7', path: '/' });
  const s = p.snapshot(); assert.equal(s.online, 1); assert.equal(s.located, 0); assert.equal(s.spots.length, 0);
});

test('location filled in later by the free lookup shows up', async () => {
  let release; const pending = new Promise(r => { release = r; });
  const p = createPresence({ intel: { describe: () => ({ geo: { country: 'Cambodia', countryCode: 'KH', label: 'Cambodia', lat: null, lng: null }, device: null, pending }) } });
  p.beat(req('7.7.7.7'), { sid: 'hhhhhhhh8', path: '/' });
  assert.equal(p.snapshot().located, 0);
  release(phnomPenh); await pending; await new Promise(r => setImmediate(r));
  assert.equal(p.snapshot().located, 1);
});
