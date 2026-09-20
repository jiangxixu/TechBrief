const VERSION='__BUILD_VERSION__';
const PREFIX='techbrief-'+self.registration.scope+'-';
const CACHE=PREFIX+VERSION;
const urls=['./','./index.html','./styles.css','./app.js','./core.js','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./data/catalog.json'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(urls)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{const response=await fetch(event.request,{signal:AbortSignal.timeout(6000)});if(response.ok)await cache.put(event.request,response.clone());return response;}catch{
   const cached=await cache.match(event.request,{ignoreSearch:true});if(cached)return cached;
   if(event.request.mode==='navigate'){const shell=await cache.match(new URL('./index.html',self.registration.scope).href);if(shell)return shell;}
   return new Response('Offline',{status:503,headers:{'Content-Type':'text/plain'}});
  }
 })());
});
