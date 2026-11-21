// Retired: this tool is now part of the single HomeAssistant Tools PWA (../sw.js).
// Remove this app's old caches and unregister so the shared worker takes over.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (/^(lvgl-studio|esphome-display)-v\d+$/.test(k)) await caches.delete(k);
  await self.registration.unregister();
})()));
