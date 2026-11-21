// HomeAssistant Tools: the one service worker for every tool under /tools/.
// Same-origin files are network-first (updates arrive), with the cache as offline fallback.
const VERSION = 'ha-tools-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'appdrawer.js', 'pwa.js', 'shared/jdnx-theme.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  // MMWAVE
  'mmwave/', 'mmwave/index.html', 'mmwave/mmwave-skin.css',
  // ESPHome Display Designer
  'esphome-display/', 'esphome-display/index.html', 'esphome-display/legacy.html',
  'esphome-display/lvgl-ui.css', 'esphome-display/lvgl-ui.js', 'esphome-display/style.css', 'esphome-display/glass.css',
  'esphome-display/guide.css', 'esphome-display/dd.css', 'esphome-display/icons.js', 'esphome-display/favicon.png',
  ...['core', 'render', 'gen', 'samples', 'ui', 'view', 'dialog', 'font', 'boot'].map(n => `esphome-display/dd-${n}.js`),
  'esphome-display/deploy.js', 'esphome-display/fontmanager.js', 'esphome-display/yamlimport.js', 'esphome-display/vendor/qrcode.js',
  'esphome-display/wasm/font.wasm', 'esphome-display/wasm/wasm_exec.js',
  'esphome-display/fonts/Roboto-Regular.ttf', 'esphome-display/fonts/Roboto-Bold.ttf',
  // ESPHome LVGL Designer
  'esphome-lvgl/', 'esphome-lvgl/index.html', 'esphome-lvgl/app.css',
  'esphome-lvgl/vendor/js-yaml.min.js', 'esphome-lvgl/vendor/qrcode.js',
  ...['main', 'app', 'yaml', 'style', 'theme', 'layout', 'render', 'widgets', 'ui', 'editor', 'panels', 'inspector', 'assets', 'guide', 'samples'].map(n => `esphome-lvgl/js/${n}.js`)
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })));
  }
});
