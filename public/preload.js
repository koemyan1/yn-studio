/* Runs before the app: if a first banner was seen on a previous visit, start fetching it right now. */
try{var c=JSON.parse(localStorage.getItem('yn-cache-banners-v1')||'null'),u=c&&c.d&&c.d[0]&&c.d[0].image_url;
if(u&&/^https:\/\//.test(u)){var o=new URL(u).origin,p=document.createElement('link');p.rel='preconnect';p.href=o;p.crossOrigin='';document.head.appendChild(p);
var l=document.createElement('link');l.rel='preload';l.as='image';l.href=u;l.setAttribute('fetchpriority','high');document.head.appendChild(l)}}catch(e){}
