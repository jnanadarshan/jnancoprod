// Displaysim service worker: offline app shell (incl. the Go-WASM font rasteriser and bundled Roboto);
// same-origin files are fetched network-first so updates arrive, with the cache as the offline fallback.
const VERSION = 'esphome-display-v8';
const SHELL = [
  './', 'index.html', 'legacy.html', 'lvgl-ui.css', 'lvgl-ui.js', 'style.css', 'glass.css', 'guide.css', 'dd.css', 'icons.js', 'favicon.png', 'manifest.webmanifest',
  'dd-core.js', 'dd-render.js', 'dd-gen.js', 'dd-samples.js', 'dd-ui.js', 'dd-view.js', 'dd-dialog.js', 'dd-font.js', 'dd-boot.js', 'deploy.js', 'fontmanager.js', 'yamlimport.js',
  'vendor/qrcode.js', '../shared/jdnx-theme.css',
  'wasm/font.wasm', 'wasm/wasm_exec.js', 'fonts/Roboto-Regular.ttf', 'fonts/Roboto-Bold.ttf',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
  }
});
