// Sends a phone push for every new row in public.notifications (called by a Database Webhook).
// Customer notifications go to that customer's devices; admin notifications go to every admin's devices.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-yn-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const expected = Deno.env.get("YN_PUSH_WEBHOOK_SECRET");
  if (!expected || req.headers.get("x-yn-webhook-secret") !== expected) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
  if (!pub || !priv) return json({ error: "VAPID keys are not configured" }, 500);
  webpush.setVapidDetails(subject, pub, priv);

  const payload = await req.json().catch(() => null);
  const n = payload?.record;
  if (!n || payload?.type !== "INSERT") return json({ ok: true, skipped: "not an insert" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let userIds: string[] = [];
  if (n.target_role === "admin") {
    const { data } = await db.from("profiles").select("user_id").eq("role", "admin");
    userIds = (data || []).map((r: any) => r.user_id).filter(Boolean);
  } else if (n.user_id) {
    userIds = [n.user_id];
  }
  if (!userIds.length) return json({ ok: true, sent: 0 });

  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .in("user_id", userIds);
  if (error) return json({ error: error.message }, 500);
  if (!subs?.length) return json({ ok: true, sent: 0 });

  const body = JSON.stringify({
    title: n.title || "YN Studio",
    body: n.message || "",
    url: n.link || (n.target_role === "admin" ? "/admin/notifications" : "/notifications"),
    tag: n.type || "info",
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86400, urgency: "high" });
        sent++;
      } catch (e: any) {
        // 404 / 410 = the phone unsubscribed or the app was removed: forget it.
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id);
        else console.error("push failed", e?.statusCode, e?.body || String(e));
      }
    }),
  );
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);

  return json({ ok: true, sent, removed: dead.length });
});
