const CACHE='yn-studio-v5';
const IMG_CACHE='yn-img-v1',IMG_MAX=150;
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/yn-logo.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==IMG_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
/* Speed: built files in /assets/ never change (their names contain a hash) -> serve from cache instantly.
   Pictures / icons / fonts -> show the cached copy right away and refresh it in the background.
   Page loads (HTML) -> network first so a new deploy shows up, with the cached copy as the offline fallback. */
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  /* Supabase Storage pictures (products / banners): the file names are unique, so a cached copy never goes stale.
     Served from the phone instantly; fetched with CORS so the cache stores a normal (small) response, and trimmed to the newest IMG_MAX. */
  if(url.origin!==self.location.origin&&req.destination==='image'&&/\.supabase\.co$/.test(url.hostname)&&url.pathname.includes('/storage/v1/object/public/')){
    e.respondWith(caches.open(IMG_CACHE).then(async c=>{const hit=await c.match(req.url);if(hit)return hit;
      try{const r=await fetch(new Request(req.url,{mode:'cors',credentials:'omit'}));if(r.ok){c.put(req.url,r.clone());c.keys().then(k=>{if(k.length>IMG_MAX)for(let i=0;i<k.length-IMG_MAX;i++)c.delete(k[i])})}return r}catch{return fetch(req)}}));
    return;
  }
  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(url.pathname.startsWith('/assets/')){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}return r})));
    return;
  }
  if(req.mode==='navigate'||req.destination==='document'){
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put('/index.html',c));return r}).catch(()=>caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}return r}).catch(()=>hit);
    return hit||net;
  }));
});
/* ---- Phone push notifications (Android + iPhone Home Screen app) ---- */
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch{d={title:'YN Studio',body:e.data?e.data.text():''}}
  const title=d.title||'YN Studio';
  e.waitUntil(self.registration.showNotification(title,{body:d.body||'',icon:'/icon-192.png',badge:'/favicon-32.png',tag:d.tag||'yn',renotify:true,data:{url:d.url||'/'}}))
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'/';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus' in c){c.focus();if('navigate' in c)return c.navigate(url).catch(()=>{});return}}
    return self.clients.openWindow(url)
  }))
});
