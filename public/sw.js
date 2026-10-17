const CACHE='yn-studio-v3';
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/yn-logo.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))))});
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
