/* کاوشگر — سرویس‌ورکر PWA
 * استراتژی‌ها:
 *  - API (/api/*): فقط شبکه — هرگز پاسخ قدیمی برای داده اوسینت نبازبود نمی‌شود
 *  - دارایی‌های ثابت (/_next/static، آیکون‌ها): کش اول
 *  - صفحات: اول شبکه، در قطعی اینترنت نسخه کش یا offline.html
 */
const CACHE = 'kavoshgar-v1';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(
        PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // فونت گوگل و منابع بیرونی → بدون دخالت
  if (url.pathname.startsWith('/api/')) return; // داده زنده اوسینت → فقط شبکه

  // دارایی‌های تغییرناپذیر → کش اول
  const isStatic =
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest';

  event.respondWith(isStatic ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const fallback = await cache.match(req);
    if (fallback) return fallback;
    return new Response('offline', { status: 503, statusText: 'offline' });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok && req.mode === 'navigate') cache.put(req, res.clone());
    if (res) return res;
  } catch (err) {
    /* ادامه به فالبک */
  }
  const hit = await cache.match(req);
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const offline = await cache.match('/offline.html');
    if (offline) return offline;
  }
  return new Response('offline', { status: 503, statusText: 'offline' });
}
