// Device fingerprint for security events: type (mobile / tablet / desktop / bot), OS + version, browser + version,
// brand / model when the browser exposes it. Zero dependencies.
//
// Honest limits (so nobody over-trusts the output):
//  - Everything comes from request headers the visitor controls. Attackers lie freely; honest users are mostly accurate.
//  - Desktop browsers never reveal a hardware model. iPhones/iPads never reveal the exact model (only "iPhone").
//  - Chrome on Android hides the phone model in the User-Agent. It is only known when the browser also sends the
//    Sec-CH-UA-Model client hint (we ask for it with the Accept-CH header, see shield.js), otherwise model stays null.
//  - An iPad in "desktop site" mode identifies itself as a Mac.

const clean = (v, max = 60) => {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f<>"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
};
const unq = v => clean(String(v ?? '').replace(/^"+|"+$/g, ''));
const trimVer = v => {
  if (!v) return null;
  const s = String(v).replace(/_/g, '.');
  const m = /^(\d+)\.0\.0\.0$/.exec(s);          // Chrome's "reduced" UA: 126.0.0.0 -> 126
  return clean(m ? m[1] : s, 24);
};

/* --------------------------------- bots / tools --------------------------------- */
const SCANNERS = /(sqlmap|nikto|nmap|masscan|acunetix|nessus|openvas|wpscan|dirbuster|gobuster|feroxbuster|ffuf|wfuzz|hydra|havij|zgrab|nuclei|arachni|w3af|metasploit|jaeles|skipfish|whatweb|commix|xsser|netsparker|appscan)/i;
const KNOWN_BOTS = [
  ['Googlebot', /googlebot|google-inspectiontool|apis-google|adsbot-google|mediapartners-google|storebot-google/i],
  ['Bingbot', /bingbot|bingpreview|msnbot/i],
  ['Facebook crawler', /facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher/i],
  ['Telegram preview', /telegrambot/i],
  ['WhatsApp preview', /^whatsapp\//i],
  ['Twitter/X crawler', /twitterbot/i],
  ['LinkedIn crawler', /linkedinbot/i],
  ['Slack preview', /slackbot|slack-imgproxy/i],
  ['Discord preview', /discordbot/i],
  ['Yandex bot', /yandex(?:bot|images|metrika)/i],
  ['Baidu spider', /baiduspider/i],
  ['DuckDuckBot', /duckduckbot/i],
  ['Apple bot', /applebot/i],
  ['Semrush bot', /semrushbot/i],
  ['Ahrefs bot', /ahrefsbot/i],
  ['UptimeRobot', /uptimerobot/i],
  ['Render health check', /^render\//i],
  ['Cloudflare', /cloudflare-(?:healthchecks|traffic-manager|certificate)/i],
  ['HeadlessChrome', /headlesschrome/i],
  ['PhantomJS', /phantomjs/i],
];
// name/version style HTTP clients and scripts
const TOOLS = /^(curl|wget|httpie|python-requests|python-urllib3?|python-httpx|aiohttp|go-http-client|java|apache-httpclient|okhttp|libwww-perl|node-fetch|axios|undici|got|postmanruntime|insomnia|scrapy|mechanize|php|ruby|guzzlehttp|restsharp|powershell|winhttp|lwp-trivial|jakarta commons-httpclient|colly|requests)\b[\/ ]?([\d.]+)?/i;
const GENERIC_BOT = /(?:^|[^a-z])(?:[a-z0-9._-]*(?:bot|crawler|spider|scraper|slurp)|crawl(?:er)?|headless|selenium|puppeteer|playwright|webdriver)(?:[^a-z]|$)/i;

function detectBot(ua) {
  if (!ua) return { name: 'no user agent', version: null };
  const sc = SCANNERS.exec(ua);
  if (sc) { const n = sc[1].toLowerCase(); const v = new RegExp(n + '[/ ]v?([\\d.]+)', 'i').exec(ua); return { name: n, version: v ? clean(v[1], 24) : null, scanner: true }; }
  for (const [name, re] of KNOWN_BOTS) if (re.test(ua)) { const v = /(?:bot|spider)[\/ ]v?([\d.]+)/i.exec(ua) || /headlesschrome\/([\d.]+)/i.exec(ua); return { name, version: v ? trimVer(v[1]) : null }; }
  const t = TOOLS.exec(ua.trim());
  if (t) return { name: clean(t[1]), version: clean(t[2], 24) };
  if (GENERIC_BOT.test(ua)) { const m = /([a-z0-9._-]*(?:bot|crawler|spider|scraper|slurp))[\/ ]?v?([\d.]+)?/i.exec(ua); return { name: clean(m?.[1] || 'unknown bot'), version: clean(m?.[2], 24) }; }
  return null;
}

/* ------------------------------------ OS ------------------------------------ */
const WIN = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.1': 'XP', '5.2': 'XP x64' };
function detectOs(ua, hints) {
  let os = null, ver = null, m;
  if ((m = /Windows Phone (?:OS )?([\d.]+)/i.exec(ua))) { os = 'Windows Phone'; ver = m[1]; }
  else if ((m = /Windows NT ([\d.]+)/i.exec(ua))) { os = 'Windows'; ver = WIN[m[1]] || m[1]; }
  else if ((m = /Android[ /]([\d.]+)/i.exec(ua))) { os = 'Android'; ver = m[1]; }
  else if (/Android/i.test(ua)) { os = 'Android'; }
  else if ((m = /(?:iPhone|CPU|iPad|iPod)[^)]*?OS ([\d_]+)/i.exec(ua))) { os = /iPad/i.test(ua) ? 'iPadOS' : 'iOS'; ver = m[1].replace(/_/g, '.'); }
  else if ((m = /Mac OS X ([\d_.]+)/i.exec(ua))) { os = 'macOS'; ver = m[1].replace(/_/g, '.'); }
  else if (/CrOS/i.test(ua)) { os = 'ChromeOS'; }
  else if (/HarmonyOS/i.test(ua)) { os = 'HarmonyOS'; }
  else if ((m = /\b(Ubuntu|Fedora|Debian|Linux)\b/i.exec(ua))) { os = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); if (os === 'Linux' && /X11/.test(ua)) ver = null; }
  else if (/FreeBSD|OpenBSD|NetBSD/i.test(ua)) { os = 'BSD'; }
  // Client hints are more accurate than the (frozen / reduced) User-Agent when the browser sent them.
  const hp = unq(hints?.platform), hv = unq(hints?.platformVersion);
  if (hp) {
    if (!os || (os === 'Linux' && hp !== 'Linux')) { os = hp === 'Chrome OS' ? 'ChromeOS' : hp; ver = null; }
    if (hv && os === hp) {
      if (hp === 'Windows') { const major = parseInt(hv, 10); if (Number.isFinite(major)) ver = major >= 13 ? '11' : '10'; }
      else ver = hv.replace(/(\.0)+$/, '') || ver;   // Android "13.0.0" -> "13", macOS "14.5.0" -> "14.5"
    }
  }
  return { os, osVersion: trimVer(ver) };
}

/* --------------------------------- browser --------------------------------- */
const BROWSERS = [
  ['Facebook app', /\b(?:FBAV|FB_IAB)\/([\d.]+)/],
  ['Instagram app', /Instagram ([\d.]+)/],
  ['TikTok app', /(?:musical_ly|BytedanceWebview|TikTok)[_\/ ]?(?:[a-z_]*?)([\d.]+)?/i],
  ['Telegram app', /Telegram(?:Android)?\/?([\d.]+)?/],
  ['Line app', /\bLine\/([\d.]+)/],
  ['WeChat', /MicroMessenger\/([\d.]+)/],
  ['Snapchat', /Snapchat\/([\d.]+)/],
  ['Edge', /\b(?:Edg|EdgA|EdgiOS|Edge)\/([\d.]+)/],
  ['Opera', /\b(?:OPR|OPT|Opera)\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['UC Browser', /UCBrowser\/([\d.]+)/],
  ['Yandex Browser', /YaBrowser\/([\d.]+)/],
  ['Vivaldi', /Vivaldi\/([\d.]+)/],
  ['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /\b(?:Chrome|CriOS)\/([\d.]+)/],
  ['Chromium', /Chromium\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*Safari\//],
  ['Internet Explorer', /(?:MSIE |Trident\/.*rv:)([\d.]+)/],
];
function detectBrowser(ua) {
  for (const [name, re] of BROWSERS) {
    const m = re.exec(ua);
    if (m) return { browser: name, browserVersion: trimVer(m[1]) };
  }
  if (/; wv\)/.test(ua)) return { browser: 'Android WebView', browserVersion: null };
  if (/Mobile\/\w+$/.test(ua) || /AppleWebKit/.test(ua)) return { browser: 'WebKit app', browserVersion: null };
  return { browser: null, browserVersion: null };
}

/* ------------------------------ brand / model ------------------------------ */
const BRANDS = [
  ['Samsung', /^(?:SM-|GT-|SCH-|SGH-|SAMSUNG)/i], ['Google', /^Pixel/i], ['Xiaomi', /^(?:Redmi|POCO|Mi |MI |Xiaomi)/i],
  ['Huawei', /^HUAWEI/i], ['Honor', /^HONOR/i], ['OPPO', /^(?:OPPO|CPH\d{4})/i], ['vivo', /^(?:vivo|V\d{4}[A-Z]{0,2}$)/i],
  ['realme', /^(?:realme|RMX\d{4})/i], ['OnePlus', /^(?:ONEPLUS|OnePlus|(?:KB|LE|GM|HD|IN)\d{4}$)/i], ['Infinix', /^Infinix/i],
  ['Tecno', /^TECNO/i], ['itel', /^itel/i], ['Nokia', /^Nokia/i], ['Motorola', /^(?:moto|XT\d{4})/i], ['Sony', /^(?:Xperia|SO-\d)/i],
  ['Lenovo', /^Lenovo/i], ['ASUS', /^(?:ASUS|ZenFone)/i], ['Amazon', /^(?:KF[A-Z]{2,}|Kindle)/i],
];
function detectModel(ua, hints, os) {
  let brand = null, model = null;
  if (/iPhone/.test(ua)) return { brand: 'Apple', model: 'iPhone' };
  if (/iPad/.test(ua)) return { brand: 'Apple', model: 'iPad' };
  if (/iPod/.test(ua)) return { brand: 'Apple', model: 'iPod' };
  const hm = unq(hints?.model);
  if (hm) model = hm;
  else if (os === 'Android') {
    const m = /Android[ /][\d.]+;\s*([^;)]+?)(?:\s+Build\/|\s*[;)])/i.exec(ua);
    const raw = m ? clean(m[1].replace(/^[a-z]{2}-[a-z]{2};\s*/i, ''), 40) : null;
    if (raw && !/^(?:K|Mobile|Tablet|Linux|U|wv)$/i.test(raw)) model = raw;   // "K" is Chrome's reduced-UA placeholder
  }
  if (model) for (const [b, re] of BRANDS) if (re.test(model)) { brand = b; break; }
  if (!model && /Macintosh/.test(ua)) brand = 'Apple', model = 'Mac';
  return { brand, model };
}

/* ----------------------------------- type ----------------------------------- */
function detectType(ua, os, hints, bot) {
  if (bot) return 'bot';
  if (/iPad|Tablet|PlayBook|Silk\/|Kindle|\bKF[A-Z]{2,}\b/i.test(ua)) return 'tablet';
  if (os === 'Android' && !/Mobile/i.test(ua) && hints?.mobile !== '?1') return 'tablet';
  if (/iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile|\bMobile\b/i.test(ua) || os === 'Android' || hints?.mobile === '?1') return 'mobile';
  if (os) return 'desktop';
  return 'unknown';
}

/**
 * @param {string} ua   User-Agent header
 * @param {{model?:string, platform?:string, platformVersion?:string, mobile?:string}} [hints]  Sec-CH-UA-* client hints
 */
export function parseDevice(ua, hints = null) {
  const raw = String(ua || '').slice(0, 400);
  const bot = detectBot(raw);
  const { os, osVersion } = detectOs(raw, hints);
  let { browser, browserVersion } = detectBrowser(raw);
  if (bot) { browser = bot.name; browserVersion = bot.version; }
  const type = detectType(raw, os, hints, bot);
  const { brand, model } = type === 'bot' && !os ? { brand: null, model: null } : detectModel(raw, hints, os);
  const d = { type, os, osVersion, browser, browserVersion, brand, model, bot: bot ? bot.name : null };
  d.summary = [
    type[0].toUpperCase() + type.slice(1),
    os ? os + (osVersion ? ' ' + osVersion : '') : null,
    browser ? browser + (browserVersion ? ' ' + browserVersion : '') : null,
    brand || model ? [brand, model].filter(Boolean).join(' ') : null,
  ].filter(Boolean).join(' · ');
  return d;
}

/** Pick the client-hint headers we care about out of a request's (lower-cased) header bag. */
export function hintsFromHeaders(h = {}) {
  const pick = k => (h[k] === undefined ? undefined : String(h[k]).slice(0, 80));
  const out = { model: pick('sec-ch-ua-model'), platform: pick('sec-ch-ua-platform'), platformVersion: pick('sec-ch-ua-platform-version'), mobile: pick('sec-ch-ua-mobile') };
  return Object.values(out).some(v => v !== undefined) ? out : null;
}
