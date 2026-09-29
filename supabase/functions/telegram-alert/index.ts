const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-yn-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const expected = Deno.env.get('YN_TELEGRAM_WEBHOOK_SECRET');
  const supplied = req.headers.get('x-yn-webhook-secret');
  if (!expected || supplied !== expected) {
    return new Response('Unauthorized', { status: 401, headers: cors });
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatIds = (Deno.env.get('TELEGRAM_CHAT_ID') || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!token || !chatIds.length) {
    return new Response('Telegram secrets are not configured', { status: 500, headers: cors });
  }

  const payload = await req.json().catch(() => null);
  const record = payload?.record || {};
  const title = escapeHtml(record.title || 'YN Studio alert');
  const message = escapeHtml(record.message || 'A new activity occurred.');
  const type = escapeHtml(record.type || 'info');
  const created = escapeHtml(record.created_at ? new Date(record.created_at).toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }) : new Date().toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' }));

  const text = `🔔 <b>YN Studio</b>\n\n<b>${title}</b>\n${message}\n\n<code>${type}</code> · ${created}`;
  const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;

  const results = await Promise.allSettled(chatIds.map(async (chat_id) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!response.ok) throw new Error(await response.text());
  }));

  const failed = results.filter((x) => x.status === 'rejected').length;
  if (failed) return new Response(JSON.stringify({ ok: false, failed }), { status: 502, headers: { ...cors, 'content-type': 'application/json' } });
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'content-type': 'application/json' } });
});
