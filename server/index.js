import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing server environment variables. Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Allow camera access for the admin package scanner, including standalone PWAs.
app.use((_req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(self)'); next(); });
app.use(express.json({ limit: '20kb' }));

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = (password) => typeof password === 'string' && password.length >= 6;

app.post('/api/auth/signup', async (req, res) => {
  let createdUserId = null;
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name, role: 'customer' }
    });
    if (error) {
      const already = /already|registered|exists/i.test(error.message || '');
      return res.status(already ? 409 : 400).json({ error: already ? 'This email is already registered. Please sign in instead.' : error.message });
    }
    createdUserId = data.user.id;
    const { error: profileError } = await admin.from('profiles').upsert(
      { user_id: createdUserId, name, email, role: 'customer' }, { onConflict: 'user_id' }
    );
    if (profileError) throw new Error(`Account was created but profile setup failed: ${profileError.message}`);
    await admin.from('notifications').insert({ user_id: createdUserId, target_role: 'admin', title: 'New customer account', message: `${name} · ${email}`, type: 'account', link: '/admin/customers' });
    return res.status(201).json({ ok: true, userId: createdUserId, email, name });
  } catch (error) {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId).catch(() => {});
    console.error('Signup error:', error);
    return res.status(500).json({ error: error.message || 'Unable to create account.' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`YN Studio server listening on ${port}`));
