# Live visitors (admin page `/admin/live`)

Shows how many people are on the website right now, on a world map, with their city, page and device. $0, no SQL to run.

## How it works
- Every customer page sends a tiny heartbeat (`POST /api/presence`) about every 20 seconds while the tab is visible. A visitor counts as online until 45 seconds after the last one.
- The server keeps the visitors **in memory only** (nothing is saved to Supabase). A deploy or a Render free-tier sleep starts the count from zero.
- The page asks `GET /api/admin/live` every 5 seconds. That route sits under `/api/admin`, so it needs a signed-in admin like every other admin API.
- The admin page never receives IP addresses. Bots, admin pages and the theme-editor preview are not counted. Visitors who send Do-Not-Track / Global Privacy Control are not counted.

## Location accuracy
Location comes from the visitor's IP address, the same source as the Security page: Cloudflare headers first, the free lookup for gaps. It is **approximate**: usually the right city, but phone networks and VPNs can show another one.
For the best cities turn on Cloudflare **Rules → Settings → Managed Transforms → Add visitor location headers** (free).

## Privacy note
Visitors' approximate location is processed in memory. If your site has a privacy page, add one line saying you count visitors on the site to see how many are online.

## Limits
Max 4000 live sessions, 12 per IP address (stops fake counts), heartbeat route limited to 30 per minute per IP.
