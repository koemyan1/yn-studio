import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use(express.json({ limit: '20kb' }));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const OTP_SECRET = process.env.OTP_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SMTP_USER || !SMTP_PASS || !OTP_SECRET) {
  console.error('Missing server environment variables. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMTP_USER, SMTP_PASS, OTP_SECRET');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

transporter.verify()
  .then(() => console.log(`SMTP connection verified: ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`))
  .catch((error) => console.error('SMTP connection verification failed:', error.message));

const otpHash = (userId, email, code) =>
  crypto.createHash('sha256').update(`${OTP_SECRET}:${userId}:${email.toLowerCase()}:${code}`).digest('hex');

const makeCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = (password) => typeof password === 'string' && password.length >= 6;

async function sendOtp({ userId, email, name }) {
  const code = makeCode();
  const hash = otpHash(userId, email, code);
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);

  const { data: recent } = await admin
    .from('email_otps')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.created_at && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
    const err = new Error('Please wait 60 seconds before requesting another code.');
    err.status = 429;
    throw err;
  }

  await admin.from('email_otps').delete().eq('user_id', userId);

  const { error: insertError } = await admin.from('email_otps').insert({
    user_id: userId,
    email: email.toLowerCase(),
    code_hash: hash,
    expires_at: expires.toISOString(),
    attempts: 0
  });
  if (insertError) throw new Error(`Could not store verification code: ${insertError.message}`);

  const mailResult = await transporter.sendMail({
    from: `"YN Studio" <${SMTP_USER}>`,
    to: email,
    subject: 'Your YN Studio verification code',
    text: `Hi ${name || 'there'},\n\nYour YN Studio verification code is ${code}.\n\nThis code expires in 10 minutes. If you did not create a YN Studio account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>YN Studio</h2><p>Hi ${escapeHtml(name || 'there')},</p><p>Your verification code is:</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;padding:18px 0">${code}</div><p>This code expires in 10 minutes.</p><p>If you did not create a YN Studio account, you can ignore this email.</p></div>`
  });
  console.log(`OTP email accepted by SMTP for ${email}; messageId=${mailResult.messageId}; response=${mailResult.response}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim().slice(0, 120);

    if (!validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!validPassword(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { name: name || email.split('@')[0], role: 'customer' }
    });

    if (error) {
      const already = /already|registered|exists/i.test(error.message || '');
      return res.status(already ? 409 : 400).json({ error: already ? 'This email is already registered. Please sign in instead.' : error.message });
    }

    try {
      await sendOtp({ userId: data.user.id, email, name });
      // Reuse the existing YN Studio Telegram notification pipeline.
      // The bot remains a notification layer; the OTP itself is generated
      // server-side and delivered privately to the customer's email.
      const { error: notificationError } = await admin.from('notifications').insert({
        user_id: data.user.id,
        target_role: 'admin',
        title: 'New customer account',
        message: `${name || email.split('@')[0]} · ${email}`,
        type: 'account',
        link: '/admin/customers'
      });
      if (notificationError) console.warn('Telegram signup notification could not be queued:', notificationError.message);
    } catch (mailError) {
      // Roll back the newly created account if the first OTP could not be sent,
      // so the customer can retry signup cleanly.
      await admin.auth.admin.deleteUser(data.user.id);
      throw mailError;
    }
    return res.json({ ok: true, userId: data.user.id });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to create account.' });
  }
});

app.post('/api/auth/resend', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '');
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!userId || !validEmail(email)) return res.status(400).json({ error: 'Invalid verification request.' });

    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user || data.user.email?.toLowerCase() !== email) {
      return res.status(400).json({ error: 'Invalid verification request.' });
    }
    if (data.user.email_confirmed_at) return res.status(400).json({ error: 'This email is already verified. Please sign in.' });

    await sendOtp({ userId, email, name: data.user.user_metadata?.name || email.split('@')[0] });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Resend error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to resend code.' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const userId = String(req.body?.userId || '');
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();

    if (!userId || !validEmail(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the 6-digit verification code.' });
    }

    const { data: row, error: fetchError } = await admin
      .from('email_otps')
      .select('*')
      .eq('user_id', userId)
      .eq('email', email)
      .maybeSingle();

    if (fetchError || !row) return res.status(400).json({ error: 'Invalid or expired code. Please request a new code.' });

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from('email_otps').delete().eq('id', row.id);
      return res.status(400).json({ error: 'This code has expired. Please request a new code.' });
    }

    if (Number(row.attempts || 0) >= 5) {
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    const expected = otpHash(userId, email, code);
    const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(row.code_hash));
    if (!ok) {
      await admin.from('email_otps').update({ attempts: Number(row.attempts || 0) + 1 }).eq('id', row.id);
      return res.status(400).json({ error: 'Invalid or expired code. Please try again.' });
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true
    });
    if (updateError || !updated?.user?.email_confirmed_at) {
      throw updateError || new Error('Could not verify the email address.');
    }

    await admin.from('email_otps').delete().eq('id', row.id);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Unable to verify the code.' });
  }
});

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  smtp: { host: SMTP_HOST, port: SMTP_PORT, userConfigured: !!SMTP_USER, passwordConfigured: !!SMTP_PASS }
}));

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`YN Studio server listening on ${port}`));
