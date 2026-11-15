// OPTIONAL, FREE: pre-compute the YN Vision "fingerprints" of every published product picture and write
// public/vision-index.json, so customers' phones never have to compute them (their first search is then instant).
//
//   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run vision:index
//
// Runs on your own computer / CI with the same free open-source model the browser uses. No paid service, no API key
// besides the public anon key the website already ships. Re-run it (and redeploy) after adding products or changing pictures;
// anything missing from the file is simply computed on the customer's device, so skipping it never breaks anything.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers';
import { imageKey, normalize, vecToBase64 } from '../shared/visionMath.js';

const MODEL = 'Xenova/clip-vit-base-patch32'; // must match VISION_MODEL in src/vision/visionEngine.ts
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the public values).'); process.exit(1); }

const sb = createClient(url, key);
const { data, error } = await sb.from('products').select('id,main_image_url,store_page').eq('status', 'published');
if (error) { console.error(error.message); process.exit(1); }
const rows = (data || []).filter(r => r.main_image_url && !r.store_page);
console.log(`Indexing ${rows.length} product pictures with ${MODEL} …`);

const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });

const items = {};
let n = 0;
for (const r of rows) {
  try {
    const img = await RawImage.fromURL(r.main_image_url);
    const out = await model(await processor(img));
    items[imageKey(r.id, r.main_image_url)] = vecToBase64(normalize(out.image_embeds.data));
  } catch (e) { console.warn('skip', r.id, e.message); }
  if (++n % 10 === 0) console.log(`${n}/${rows.length}`);
}
const file = path.resolve('public', 'vision-index.json');
fs.writeFileSync(file, JSON.stringify({ model: MODEL, built: new Date().toISOString(), items }));
console.log(`Wrote ${Object.keys(items).length} fingerprints to ${file}`);
