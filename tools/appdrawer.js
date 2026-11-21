/* ==========================================================================
   appdrawer.js — shared app launcher for HomeAssistant Tools
   Usage: <script src="../appdrawer.js" defer></script>
   The launcher button mounts into the first element with [data-app-drawer];
   without one it floats in the top-right corner.
   Follows the host page's dark theme (body.dark-mode or body.dark-ui).
   Edit APPS below to rename or add apps.
   ========================================================================== */
(function () {
    if (window.__hatDrawer) return;
    window.__hatDrawer = true;

    var script = document.currentScript;
    var BASE = new URL('./', script ? script.src : location.href).href;

    var ICONS = {
        apps: 'M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z',
        home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
        dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
        widgets: 'M13 13v8h8v-8h-8zM3 21h8v-8H3v8zM3 3v8h8V3H3zm13.66-1.31L11 7.34 16.66 13l5.66-5.66-5.66-5.65z',
        sensors: 'M12 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 2c0-3.31-2.69-6-6-6s-6 2.69-6 6c0 2.22 1.21 4.15 3 5.19l1-1.74c-1.19-.7-2-1.97-2-3.45 0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.48-.81 2.75-2 3.45l1 1.74c1.79-1.04 3-2.97 3-5.19zM12 3C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1-1.73C5.61 18.53 4 15.96 4 13c0-4.42 3.58-8 8-8s8 3.58 8 8c0 2.96-1.61 5.53-4 6.92l1 1.73c2.99-1.73 5-4.95 5-8.65 0-5.52-4.48-10-10-10z'
    };

    var HOME = { name: 'All tools', path: '', icon: 'home' };
    var APPS = [
        { name: 'Displaysim', path: 'displaysim/', icon: 'dashboard' },
        { name: 'ESPHOME LVGL SIM', path: 'esphomelvglsim/', icon: 'widgets' },
        { name: 'MMWAVE Creator', path: 'mmwave/', icon: 'sensors' }
    ];

    function svg(name) {
        return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="' + ICONS[name] + '"/></svg>';
    }

    var CSS = [
        '.hat-btn{all:unset;box-sizing:border-box;width:36px;height:36px;border-radius:50%;display:inline-grid;place-items:center;cursor:pointer;color:inherit;flex:none;transition:background .15s ease}',
        '.hat-btn:hover,.hat-btn[aria-expanded="true"]{background:rgba(99,102,241,.12)}',
        '.hat-btn:focus-visible{outline:3px solid rgba(99,102,241,.4);outline-offset:1px}',
        '.hat-btn.hat-float{position:fixed;top:12px;right:12px;z-index:2147483000;width:42px;height:42px;color:#1b1d3a;background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.8);box-shadow:0 8px 28px rgba(60,60,140,.18);-webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%)}',
        '.hat-dark .hat-btn.hat-float{color:rgba(255,255,255,.92);background:rgba(24,27,52,.72);border-color:rgba(255,255,255,.12)}',
        '.hat-panel{position:fixed;z-index:2147483001;width:320px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:14px;border-radius:18px;font-family:Inter,Roboto,system-ui,sans-serif;letter-spacing:-.003em;',
        'color:#1b1d3a;background:rgba(255,255,255,.86);border:1px solid rgba(255,255,255,.8);box-shadow:0 18px 60px rgba(60,60,140,.25);-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%);',
        'opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top right;pointer-events:none;transition:opacity .16s ease,transform .16s ease}',
        '.hat-panel.hat-open{opacity:1;transform:none;pointer-events:auto}',
        '.hat-dark .hat-panel{color:rgba(255,255,255,.92);background:rgba(22,25,48,.9);border-color:rgba(255,255,255,.11);box-shadow:0 18px 60px rgba(0,0,0,.5)}',
        '.hat-head{display:flex;align-items:center;justify-content:space-between;padding:2px 4px 10px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;opacity:.6}',
        '.hat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
        '.hat-tile{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 6px;border-radius:12px;text-decoration:none;color:inherit;font-size:12px;font-weight:500;line-height:1.25;text-align:center;transition:background .15s ease}',
        '.hat-tile:hover{background:rgba(99,102,241,.1)}',
        '.hat-tile:focus-visible{outline:3px solid rgba(99,102,241,.4);outline-offset:-2px}',
        '.hat-ico{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:rgba(99,102,241,.14);color:#6366f1}',
        '.hat-dark .hat-ico{background:rgba(139,147,255,.18);color:#8b93ff}',
        '.hat-tile.hat-current .hat-ico{background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#fff;box-shadow:0 4px 14px rgba(99,102,241,.35)}',
        '.hat-tile.hat-current{font-weight:700}',
        '.hat-home{display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;border-radius:12px;text-decoration:none;color:inherit;font-size:13px;font-weight:600;border-top:1px solid rgba(30,32,80,.09);transition:background .15s ease}',
        '.hat-dark .hat-home{border-top-color:rgba(255,255,255,.09)}',
        '.hat-home:hover{background:rgba(99,102,241,.1)}',
        '.hat-home:focus-visible{outline:3px solid rgba(99,102,241,.4);outline-offset:-2px}',
        '.hat-home svg{color:#6366f1}.hat-dark .hat-home svg{color:#8b93ff}',
        '@media (prefers-reduced-motion:reduce){.hat-panel,.hat-btn,.hat-tile{transition:none}}'
    ].join('');

    function samePage(path) {
        var target = new URL(path, BASE).pathname.replace(/index\.html?$/, '');
        var here = location.pathname.replace(/index\.html?$/, '');
        if (path === '') return here === target;
        return here.indexOf(target) === 0;
    }

    function init() {
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        // Launcher button
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hat-btn';
        btn.title = 'HomeAssistant Tools';
        btn.setAttribute('aria-label', 'Open app drawer');
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = svg('apps');

        var mount = document.querySelector('[data-app-drawer]');
        if (mount) mount.appendChild(btn);
        else { btn.classList.add('hat-float'); document.body.appendChild(btn); }

        // Panel
        var panel = document.createElement('div');
        panel.className = 'hat-panel';
        panel.setAttribute('role', 'menu');
        panel.setAttribute('aria-label', 'HomeAssistant Tools apps');
        var html = '<div class="hat-head">HomeAssistant Tools</div><div class="hat-grid">';
        APPS.forEach(function (a) {
            var cur = samePage(a.path);
            html += '<a role="menuitem" class="hat-tile' + (cur ? ' hat-current' : '') + '" href="' + new URL(a.path, BASE).href + '"' +
                (cur ? ' aria-current="page"' : '') + '><span class="hat-ico">' + svg(a.icon) + '</span>' + a.name + '</a>';
        });
        html += '</div><a role="menuitem" class="hat-home" href="' + new URL(HOME.path, BASE).href + '">' + svg(HOME.icon) + HOME.name + '</a>';
        panel.innerHTML = html;
        document.body.appendChild(panel);

        // Theme follow
        function syncTheme() {
            var b = document.body.classList;
            document.documentElement.classList.toggle('hat-dark', b.contains('dark-mode') || b.contains('dark-ui'));
        }
        syncTheme();
        new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

        function place() {
            var r = btn.getBoundingClientRect();
            var w = panel.offsetWidth;
            var left = Math.min(Math.max(16, r.right - w), window.innerWidth - w - 16);
            panel.style.left = Math.max(16, left) + 'px';
            panel.style.top = (r.bottom + 8) + 'px';
        }
        function open() {
            place();
            panel.classList.add('hat-open');
            btn.setAttribute('aria-expanded', 'true');
            var first = panel.querySelector('a');
            if (first) first.focus({ preventScroll: true });
        }
        function close(refocus) {
            if (!panel.classList.contains('hat-open')) return;
            panel.classList.remove('hat-open');
            btn.setAttribute('aria-expanded', 'false');
            if (refocus) btn.focus();
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.classList.contains('hat-open') ? close(false) : open();
        });
        document.addEventListener('click', function (e) {
            if (!panel.contains(e.target) && !btn.contains(e.target)) close(false);
        }, true);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && panel.classList.contains('hat-open')) { e.stopPropagation(); close(true); }
        }, true);
        window.addEventListener('resize', function () { if (panel.classList.contains('hat-open')) place(); });
        window.addEventListener('scroll', function () { if (panel.classList.contains('hat-open')) place(); }, true);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
