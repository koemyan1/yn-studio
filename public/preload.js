/* Runs before the app: if a first banner was seen on a previous visit, start fetching it right now. */
try{var c=JSON.parse(localStorage.getItem('yn-cache-banners-v1')||'null'),u=c&&c.d&&c.d[0]&&c.d[0].image_url;
if(u&&/^https:\/\//.test(u)){var o=new URL(u).origin,p=document.createElement('link');p.rel='preconnect';p.href=o;p.crossOrigin='';document.head.appendChild(p);
var l=document.createElement('link');l.rel='preload';l.as='image';l.href=u;l.setAttribute('fetchpriority','high');document.head.appendChild(l)}}catch(e){}

/* If the store set its own loading picture, hide the default animated splash (the custom one takes over) and avoid a white flash. */
try{var lc=JSON.parse(localStorage.getItem('yn-loader-cfg-v1')||'null');
if(lc&&(lc.loader_image||lc.loader_text)){document.documentElement.classList.add('ynCustomLoader');if(lc.loader_bg)document.documentElement.style.background=lc.loader_bg;
if(/^https:\/\//.test(lc.loader_image||'')){var li=document.createElement('link');li.rel='preload';li.as='image';li.href=lc.loader_image;document.head.appendChild(li)}}}catch(e){}
/* failsafe: never leave the splash up forever if the app fails to start */
setTimeout(function(){var b=document.getElementById('ynBoot');if(b)b.classList.add('out')},9000);
