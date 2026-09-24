/* Slovencina - Offline-Cache */
var CACHE = 'lingua-v13';
var FILES = ['./','index.html','styles.css?v=13','core.js?v=13','ui.js?v=13','events.js?v=13',
  'manifest.json','icons/favicon.ico','icons/icon-32.png','icons/icon-180.png',
  'icons/icon-192.png','icons/icon-512.png','icons/icon-512-maskable.png',
  'data/sk/vocab.json','data/sk/sentences.json','data/sk/phrases.json','data/sk/grammar.json','data/sk/practice.json',
  'data/it/vocab.json','data/it/sentences.json','data/it/phrases.json','data/it/grammar.json','data/it/practice.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(FILES).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Das HTML nie aus dem Cache beantworten - es enthaelt die Versionsnummern
  // der uebrigen Dateien. Sonst bleibt eine alte Fassung dauerhaft haengen.
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () { return caches.match(e.request); })
  );
});
