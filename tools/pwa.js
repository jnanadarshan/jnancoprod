/* pwa.js: the single PWA for every tool under /tools/. Included (via appdrawer.js) on every page.
   Registers /tools/sw.js, retires the old per-app service workers, and exposes window.HATPWA
   so any page can offer "Install": HATPWA.canInstall(), HATPWA.install(), and the 'hatpwa' event. */
(function () {
    if (window.HATPWA) return;
    var script = document.currentScript;
    var BASE = new URL('./', script ? script.src : location.href).href;
    var deferred = null;
    var listeners = [];
    var api = window.HATPWA = {
        canInstall: function () { return !!deferred; },
        installed: function () { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; },
        onchange: function (fn) { listeners.push(fn); fn(api.canInstall()); },
        install: function () {
            if (!deferred) return Promise.resolve(false);
            var p = deferred; deferred = null; notify();
            p.prompt();
            return p.userChoice.then(function (c) { return c.outcome === 'accepted'; });
        }
    };
    function notify() { listeners.forEach(function (f) { try { f(api.canInstall()); } catch (e) {} }); }

    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; notify(); });
    window.addEventListener('appinstalled', function () { deferred = null; notify(); });

    // make sure every page links the one manifest
    if (!document.querySelector('link[rel="manifest"]')) {
        var l = document.createElement('link'); l.rel = 'manifest'; l.href = BASE + 'manifest.webmanifest'; document.head.appendChild(l);
    }

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        var swUrl = BASE + 'sw.js';
        navigator.serviceWorker.getRegistrations().then(function (regs) {
            // drop any registration inside /tools/ that is not the one shared worker (old per-app PWAs)
            regs.forEach(function (r) {
                if (r.scope.indexOf(BASE) === 0 && r.scope !== BASE) r.unregister();
            });
        }).catch(function () {});
        window.addEventListener('load', function () {
            navigator.serviceWorker.register(swUrl, { scope: BASE }).catch(function () {});
        });
    }
})();
