const CACHE='yn-studio-v4';
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/yn-logo.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
/* Speed: built files in /assets/ never change (their names contain a hash) -> serve from cache instantly.
   Pictures / icons / fonts -> show the cached copy right away and refresh it in the background.
   Page loads (HTML) -> network first so a new deploy shows up, with the cached copy as the offline fallback. */
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
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
