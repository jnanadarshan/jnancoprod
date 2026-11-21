// Displaysim preview header + scaling:
//  - page tabs live in the panel header (between "Preview" and the HD switch)
//  - Design view: always fits the panel, smooth edges and text. Actual view: 1:1 device pixels with panel emulation.
//  - zoom - / + buttons, Ctrl/Cmd + mouse wheel and trackpad pinch; Fit resets.
(function () {
    'use strict';
    const DD = window.DD, $ = id => document.getElementById(id), h = DD.h, ic = DD.ic;
    const summary = $('previewSection').querySelector('summary'), content = $('previewSection').querySelector('.details-content');
    const hd = $('hiResSwitch'), hdIn = $('hiResToggle'), fitBtn = $('scaleToFitBtn');
    const DPR = () => Math.max(1, Math.round((window.devicePixelRatio || 1) * 4) / 4);
    const V = DD.view = { mode: DD.LS.get('dd.viewMode', 'design') === 'actual' ? 'actual' : 'design', zoom: null, last: 1 };
    try { const z = parseFloat(DD.LS.get('dd.viewZoom', '')); if (z > 0) V.zoom = z; } catch (e) { /* fit */ }

    // ---- header: pages (existing bar, moved), view switch, zoom
    const pageBar = $('ddPageBar'); pageBar.classList.add('in-header');
    const seg = h('div', { class: 'dd-seg', id: 'ddViewSeg', role: 'tablist', 'aria-label': 'Preview mode' },
        h('button', { type: 'button', 'data-v': 'design', title: 'Design view: always fits the panel, smooth edges and text' }, ic('design_services'), 'Design'),
        h('button', { type: 'button', 'data-v': 'actual', title: 'Actual view: real size (1 device pixel = 1 screen pixel), drawn the way the panel will show it: 1-bit / grayscale / e-paper colours and font bits-per-pixel' }, ic('stat_0'), 'Actual'));
    const zoomVal = h('span', { class: 'dd-zoom-val', id: 'ddZoomVal', title: 'Current zoom' }, '100%');
    const zoom = h('div', { class: 'dd-zoom', id: 'ddZoom' },
        h('button', { type: 'button', id: 'ddZoomOut', title: 'Zoom out (Ctrl + wheel)' }, ic('remove')), zoomVal,
        h('button', { type: 'button', id: 'ddZoomIn', title: 'Zoom in (Ctrl + wheel)' }, ic('add')));
    summary.insertBefore(pageBar, hd); summary.insertBefore(h('span', { class: 'dd-grow' }), hd);
    const liveBtn = h('button', { type: 'button', class: 'dd-live-btn', id: 'ddLiveBtn', title: 'Live data: simulated sensor values and clock', 'aria-haspopup': 'dialog' }, ic('sensors'));
    liveBtn.addEventListener('click', e => { e.stopPropagation(); DD.openLive(liveBtn); });
    summary.insertBefore(seg, hd); summary.insertBefore(liveBtn, hd); summary.insertBefore(zoom, hd);
    fitBtn.title = 'Fit to the panel'; fitBtn.querySelector('.material-symbols-outlined').textContent = 'fit_screen';
    summary.insertBefore(fitBtn, hd);
    [pageBar, seg, zoom, liveBtn].forEach(n => n.addEventListener('click', e => { e.stopPropagation(); }));
    const hint = pageBar.querySelector('.dd-page-hint'); if (hint) hint.remove();
    const note = [...content.children].find(c => c.tagName === 'P');
    if (note) { note.classList.add('dd-note-moved'); const info = h('span', { class: 'material-symbols-outlined dd-info', title: note.textContent.trim() + ' Design view is smooth; Actual view shows device pixels.' }, 'info'); summary.insertBefore(info, pageBar); }

    // the Preview panel is always open: clicking its header must not collapse it
    const prevDet = $('previewSection'); prevDet.open = true;
    summary.addEventListener('click', e => { if (!e.target.closest('button, input, label, select, a, .dd-page, .dd-seg, .dd-zoom, .hd-switch')) e.preventDefault(); });
    prevDet.addEventListener('toggle', () => { if (!prevDet.open) prevDet.open = true; });

    // ---- scale model
    function avail() {
        const cs = getComputedStyle(content), pv = $('screenPreview'), pm = getComputedStyle(pv);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        let sib = 0; [...content.children].forEach(c => { if (c !== pv) { const m = getComputedStyle(c); if (m.display === 'none') return; sib += c.getBoundingClientRect().height + parseFloat(m.marginTop) + parseFloat(m.marginBottom); } });
        const own = parseFloat(pm.marginTop) + parseFloat(pm.marginBottom), SH = 18;            // bezel ring + shadow
        return { w: Math.max(80, content.clientWidth - padX - SH - 10), h: Math.max(120, content.clientHeight - padY - sib - own - SH) };
    }
    function fitScale(bw, bh) { const a = avail(); return Math.min(a.w / bw, a.h / bh); }
    window.computePreviewScale = function (bw, bh) {
        let s;
        const f = fitScale(bw, bh);
        // a zoom the user set is kept across Design / Actual / HD; Actual only snaps it to crisp physical pixels for display
        if (V.zoom != null) { const dpr = DPR(); s = V.mode === 'actual' && V.zoom * dpr >= 1 ? Math.max(1, Math.round(V.zoom * dpr)) / dpr : V.zoom; }
        // Actual: largest scale that fits where every device pixel is a whole block of *physical* screen pixels
        // (so on a 2x display 1.5x is still perfectly crisp: 3 x 3 physical pixels per device pixel)
        else if (V.mode === 'actual') { const dpr = DPR(); s = f * dpr >= 1 ? Math.floor(f * dpr) / dpr : f; }
        else s = f;
        s = Math.max(0.25, Math.min(16, isFinite(s) && s > 0 ? s : 1)); V.last = s; return s;
    };
    // faint grid between device pixels in Actual view (like the gaps on a real LCD / OLED)
    const grid = h('div', { class: 'dd-pixel-grid', 'aria-hidden': 'true' });
    $('screenPreview').insertBefore(grid, $('screenPreview').querySelector('.layout-overlay'));
    function syncGrid() {
        const s = V.last, on = V.mode === 'actual' && s >= 3;
        grid.classList.toggle('on', on); if (!on) return;
        const c = DD.mode() === 'epaper' ? 'rgba(0,0,0,.10)' : 'rgba(0,0,0,.38)';
        grid.style.backgroundImage = `linear-gradient(to right, ${c} 1px, transparent 1px), linear-gradient(to bottom, ${c} 1px, transparent 1px)`;
        grid.style.backgroundSize = `${s}px ${s}px`;
    }
    function apply(redraw = true) { if (redraw) updateScreenSize(); zoomVal.textContent = Math.round(V.last * 100) + '%'; fitBtn.classList.toggle('on', V.zoom == null); syncGrid(); }
    function setZoom(z) { V.zoom = z == null ? null : Math.max(0.25, Math.min(16, z)); DD.LS.set('dd.viewZoom', V.zoom == null ? '' : String(V.zoom)); apply(); }
    function stepZoom(dir) {
        const cur = V.last;
        if (V.mode === 'actual') { const dpr = DPR(), n = Math.round(cur * dpr); setZoom(Math.max(1, n + (dir > 0 ? 1 : -1)) / dpr); }   // whole physical pixels per device pixel
        else setZoom(cur * (dir > 0 ? 1.2 : 1 / 1.2));
    }
    $('ddZoomIn').addEventListener('click', () => stepZoom(1)); $('ddZoomOut').addEventListener('click', () => stepZoom(-1));
    fitBtn.addEventListener('click', e => {      // replaces the old "scale to fit" toggle: the preview always fits, this resets manual zoom
        e.stopImmediatePropagation(); e.preventDefault(); screenPreviewDiv.classList.remove('scale-to-fit');
        setZoom(null);
    }, true);
    // mouse wheel / pinch: Ctrl or Cmd + wheel (a trackpad pinch arrives as ctrl + wheel)
    content.addEventListener('wheel', e => {
        if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault();
        if (V.mode === 'actual') { if (Math.abs(e.deltaY) > 0) stepZoom(e.deltaY < 0 ? 1 : -1); } else setZoom(V.last * Math.exp(-e.deltaY * (e.deltaMode === 1 ? .05 : .0025)));
    }, { passive: false });

    // ---- views
    function setHd(on) { if (hdIn.checked !== on) { hdIn.checked = on; hdIn.dispatchEvent(new Event('change')); } }
    function setView(mode) {
        V.mode = mode; DD.LS.set('dd.viewMode', mode);
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
        document.body.classList.toggle('dd-actual', mode === 'actual');
        setHd(mode === 'design'); hdIn.disabled = mode === 'actual'; hd.classList.toggle('disabled', mode === 'actual');
        hd.title = mode === 'actual' ? 'Actual view always shows exact device pixels' : 'Smooth rendering (Design view). Turn off to see device pixels scaled up.';
        apply(); drawPreview();
    }
    seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setView(b.dataset.v)));

    // keep fitting: panel resize, details toggles, live-data open/close, resolution / profile changes
    const origUSS = window.updateScreenSize; let lastKey = '';
    window.updateScreenSize = function () {
        const key = DD.size().join('x'); if (key !== lastKey) { if (lastKey) { V.zoom = null; DD.LS.set('dd.viewZoom', ''); } lastKey = key; }
        const r = origUSS.apply(this, arguments); zoomVal.textContent = Math.round(V.last * 100) + '%'; fitBtn.classList.toggle('on', V.zoom == null); syncGrid(); return r;
    };
    if (window.ResizeObserver) { let raf = 0; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (V.zoom == null) updateScreenSize(); }); }).observe(content); }
    window.addEventListener('resize', () => { if (V.zoom == null) updateScreenSize(); });
    window.__ddZoomValue = () => V.last;

    isScaleToFit = false; screenPreviewDiv.classList.remove('scale-to-fit');
    setView(V.mode);
})();

// ---- Generate Code popover: one tab bar (Lambda / Fonts / Colors / Assets) instead of stacked collapsible sections
(function () {
    'use strict';
    const drawer = document.getElementById('codeDrawer'); if (!drawer) return;
    const head = drawer.querySelector('.code-drawer-head'), body = drawer.querySelector('.code-drawer-body');
    const title = head.children[1]; if (title) title.textContent = 'Generate code';
    const TABS = [['pillLambda', 'code', 'Lambda'], ['pillFont', 'font_download', 'Fonts'], ['pillColor', 'palette', 'Colors'], ['pillAssets', 'perm_media', 'Assets']];
    const bar = document.createElement('div'); bar.className = 'cd-tabs'; bar.setAttribute('role', 'tablist');
    const btns = TABS.map(([pid, icon, label]) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'cd-tab'; b.setAttribute('role', 'tab');
        b.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${label}`;
        b.addEventListener('click', () => { const p = document.getElementById(pid); if (p && !p.classList.contains('active')) p.click(); });
        bar.append(b); return b;
    });
    head.after(bar);
    function sync() {
        TABS.forEach(([pid], i) => { const p = document.getElementById(pid); btns[i].hidden = !p || p.hidden; btns[i].classList.toggle('on', !!p && p.classList.contains('active')); });
    }
    const dock = document.querySelector('.pill-dock');
    const mo = new MutationObserver(sync);
    if (dock) mo.observe(dock, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    mo.observe(drawer, { attributes: true, attributeFilter: ['class'] });
    // always show fresh code: regenerate the open tab whenever the design changes while the popover is open
    let t = 0;
    function refreshCode() {
        if (!drawer.classList.contains('visible')) return;
        const det = body.querySelector('details[open]'), gen = det && det.querySelector('.code-actions-container button');
        if (gen) gen.click();
    }
    const prevSave = window.saveToCache;
    if (typeof prevSave === 'function') window.saveToCache = function () { const r = prevSave.apply(this, arguments); clearTimeout(t); t = setTimeout(refreshCode, 120); return r; };
    btns.forEach(b => b.addEventListener('click', () => setTimeout(refreshCode, 0)));
    document.querySelectorAll('.pill-dock .pill-btn').forEach(p => p.addEventListener('click', () => setTimeout(refreshCode, 0)));
    sync();
})();
