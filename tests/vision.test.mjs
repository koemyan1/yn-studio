// YN Vision: similarity maths + "it must cost $0" guard. Runs with no network: node --test tests/vision.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalize, dot, meanVector, rankSimilar, matchPercent, imageKey, vecToBase64, base64ToVec } from '../shared/visionMath.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const approx = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test('normalize gives unit length and survives a zero vector', () => {
  approx(Math.hypot(...normalize([3, 4])), 1);
  assert.deepEqual([...normalize([0, 0, 0])], [0, 0, 0]);
});

test('dot of normalised vectors is cosine similarity', () => {
  approx(dot(normalize([1, 0]), normalize([1, 0])), 1);
  approx(dot(normalize([1, 0]), normalize([0, 1])), 0);
  approx(dot(normalize([1, 0]), normalize([-1, 0])), -1);
});

test('meanVector averages and re-normalises', () => {
  const m = meanVector([normalize([1, 0]), normalize([0, 1])]);
  approx(m[0], Math.SQRT1_2); approx(m[1], Math.SQRT1_2);
  assert.equal(meanVector([]).length, 0);
});

test('rankSimilar orders best first, applies min and limit, skips empty vectors', () => {
  const e = [
    { id: 'far', vec: normalize([0, 1]) },
    { id: 'near', vec: normalize([1, 0.1]) },
    { id: 'exact', vec: normalize([1, 0]) },
    { id: 'broken', vec: new Float32Array(0) },
    { id: 'nothing' },
  ];
  assert.deepEqual(rankSimilar([2, 0], e, { min: -1 }).map(r => r.id), ['exact', 'near', 'far']);
  assert.deepEqual(rankSimilar([2, 0], e, { min: 0.5 }).map(r => r.id), ['exact', 'near']);
  assert.deepEqual(rankSimilar([2, 0], e, { limit: 1, min: -1 }).map(r => r.id), ['exact']);
});

test('matchPercent is clamped to 0..100 and increases with the score', () => {
  assert.equal(matchPercent(0.2), 0);
  assert.equal(matchPercent(1), 100);
  assert.ok(matchPercent(0.8) > matchPercent(0.6));
});

test('imageKey changes when the picture changes (so stale fingerprints are dropped)', () => {
  assert.notEqual(imageKey('p1', 'a.jpg'), imageKey('p1', 'b.jpg'));
  assert.equal(imageKey('p1', 'a.jpg'), imageKey('p1', 'a.jpg'));
});

test('base64 round trip keeps every float', () => {
  const v = normalize(Array.from({ length: 512 }, (_, i) => Math.sin(i)));
  assert.deepEqual([...base64ToVec(vecToBase64(v))], [...v]);
});

test('YN Vision stays 100% free: no paid API, key or vendor SDK in the vision code', () => {
  const files = ['src/vision/visionEngine.ts', 'src/vision/VisionSheet.tsx', 'src/vision/YNVision.tsx', 'tools/build-vision-index.mjs'];
  const banned = /openai\.com|api\.openai|googleapis\.com\/v1|vision\.googleapis|rekognition|clarifai|azure|api[_-]?key|Authorization|replicate\.com|pinecone|algolia/i;
  for (const f of files) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!banned.test(src), `${f} mentions a paid/keyed service`);
  }
  const eng = fs.readFileSync(path.join(root, 'src/vision/visionEngine.ts'), 'utf8');
  assert.match(eng, /Xenova\/clip-vit-base-patch32/); // open-source (MIT) model, in-browser
});

test('the text search input is untouched by the camera button', () => {
  const main = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
  assert.match(main, /<input value=\{q\} onChange=\{e=>setQ\(e\.target\.value\)\}/);
  assert.match(main, /<YNVision products=\{visionCatalog\}\/>/);
});
