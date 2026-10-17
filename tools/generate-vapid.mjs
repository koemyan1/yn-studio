// Generates a VAPID key pair for phone push notifications.  Run:  node tools/generate-vapid.mjs
// Public key  -> VITE_VAPID_PUBLIC_KEY (Render build env) AND VAPID_PUBLIC_KEY (Supabase secret)
// Private key -> VAPID_PRIVATE_KEY (Supabase secret ONLY). Never put it in the app or in GitHub.
import { generateKeyPairSync } from 'node:crypto';
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const pub = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
const priv = jwk.d;
console.log('\nVAPID_PUBLIC_KEY  =', pub);
console.log('VAPID_PRIVATE_KEY =', priv, '\n');
