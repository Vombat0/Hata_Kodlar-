/* Forklift Hata Kodu — basit, dayanıklı service worker. */
const CACHE_ADI = 'fhk-kabuk-v1';

const TEMEL_YOLLAR = [
  '/',
  '/arama/',
  '/kapsam/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/favicon.svg',
  '/veri/indeks.json',
];

self.addEventListener('install', (olay) => {
  olay.waitUntil(
    caches.open(CACHE_ADI)
      .then((onbellek) => Promise.all(
        TEMEL_YOLLAR.map((yol) => onbellek.add(yol).catch(() => undefined)),
      ))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((anahtarlar) => Promise.all(
        anahtarlar.filter((anahtar) => anahtar !== CACHE_ADI).map((anahtar) => caches.delete(anahtar)),
      ))
      .then(() => self.clients.claim())
      .catch(() => undefined),
  );
});

self.addEventListener('fetch', (olay) => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;

  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;

  if (istek.mode === 'navigate') {
    olay.respondWith(
      fetch(istek)
        .then((yanit) => {
          const kopya = yanit.clone();
          caches.open(CACHE_ADI).then((onbellek) => onbellek.put(istek, kopya)).catch(() => undefined);
          return yanit;
        })
        .catch(() =>
          caches.match(istek)
            .then((bulunan) => bulunan || caches.match('/'))
            .then((bulunan) => bulunan || Response.error()),
        ),
    );
    return;
  }

  olay.respondWith(
    caches.match(istek).then((bulunan) => {
      if (bulunan) return bulunan;
      return fetch(istek).then((yanit) => {
        if (yanit && yanit.ok) {
          const kopya = yanit.clone();
          caches.open(CACHE_ADI).then((onbellek) => onbellek.put(istek, kopya)).catch(() => undefined);
        }
        return yanit;
      });
    }),
  );
});
