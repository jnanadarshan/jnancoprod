// LVGL Studio service worker: the app shell is cached on install; fonts and CDN files are cached when first used.
const VERSION = 'lvgl-studio-v3';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'vendor/js-yaml.min.js', 'vendor/qrcode.js', '../shared/jdnx-theme.css',
  'js/main.js', 'js/app.js', 'js/yaml.js', 'js/style.js', 'js/theme.js', 'js/layout.js', 'js/render.js',
  'js/widgets.js', 'js/ui.js', 'js/editor.js', 'js/panels.js', 'js/inspector.js', 'js/assets.js', 'js/guide.js', 'js/samples.js'
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    // network first for the app itself so updates arrive; cache as offline fallback
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    // fonts and CDN assets never change for a given URL: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
  }
});
