// LVGL Designer: interaction layer.
// Fixes: scale-aware dragging, zoom clipping, inverted z-order buttons, keyboard shortcuts firing inside
// form controls, deletes not persisting. Adds: undo/redo, resize handles, pages, duplicate/copy/paste, snap, fit.
// Globals from index.html: widgetsOnCanvas, canvas, selectedWidget, currentScale, nextWidgetId, addWidgetToCanvas,
// selectWidget, updateCodeOutput, updatePropertiesPanel, updateElementsList, updateZIndices, updateCanvasSize,
// saveStateToLocalStorage, generateUniqueId, deleteWidgetById, toggleToolbox, isToolboxVisible.
(function () {
    'use strict';
    const L = window.LVGL;
    const $ = id => document.getElementById(id);
    const LS = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage unavailable */ } }
    };
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const S = { snap: LS.get('lvglSnap', 'true') === 'true', grid: 10 };
    let restoring = false;

    // ---------------------------------------------------------------- toast
    L.toast = function (msg, actionLabel, action) {
        const t = document.createElement('div'); t.className = 'lvgl-toast';
        t.innerHTML = `<i class="material-icons-outlined">check_circle</i><span>${msg}</span>` + (actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : '');
        document.body.appendChild(t);
        if (actionLabel) t.querySelector('button').addEventListener('click', () => { action(); t.remove(); });
        setTimeout(() => t.remove(), actionLabel ? 12000 : 2200);
    };

    // ---------------------------------------------------------------- stage (zoom without clipping)
    const host = canvas.parentElement;
    const stage = document.createElement('div'); stage.id = 'canvas-stage';
    host.insertBefore(stage, canvas); stage.appendChild(canvas);
    host.classList.remove('items-center', 'justify-center'); host.classList.add('lvgl-stage-host');
    const overlay = document.createElement('div'); overlay.id = 'sel-overlay'; overlay.hidden = true;
    overlay.innerHTML = '<div class="sel-badge"></div><i class="sel-h sel-h-e" data-h="e"></i><i class="sel-h sel-h-s" data-h="s"></i><i class="sel-h sel-h-se" data-h="se"></i>';
    stage.appendChild(overlay);
    const badge = overlay.querySelector('.sel-badge');

    const canvasSize = () => ({ w: parseFloat(canvas.style.width) || canvas.offsetWidth || 128, h: parseFloat(canvas.style.height) || canvas.offsetHeight || 160 });
    function sizeStage() {
        const c = canvasSize();
        stage.style.width = Math.round(c.w * currentScale) + 'px';
        stage.style.height = Math.round(c.h * currentScale) + 'px';
    }
    window.applyCanvasScale = function () {
        canvas.style.transformOrigin = '0 0';
        canvas.style.transform = `scale(${currentScale})`;
        sizeStage(); syncOverlay();
    };
    function setScale(v) {
        currentScale = Math.max(0.25, Math.min(4, v));
        applyCanvasScale();
        document.querySelectorAll('#scale-controls .scale-button').forEach(b => b.classList.toggle('active-scale', Math.abs(parseFloat(b.dataset.scale) - currentScale) < 0.001));
        saveStateToLocalStorage();
    }
    function fit() {
        const c = canvasSize(), r = host.getBoundingClientRect();
        const s = Math.min((r.width - 40) / c.w, (r.height - 40) / c.h);
        setScale(Math.floor(Math.max(0.25, Math.min(4, s)) * 4) / 4);
    }

    // ---------------------------------------------------------------- selection overlay
    const dataOf = el => el && widgetsOnCanvas.find(w => w.id === el.dataset.widgetId);
    function syncOverlay() {
        const el = selectedWidget;
        if (!el || el.style.display === 'none' || !el.isConnected) { overlay.hidden = true; return; }
        overlay.hidden = false;
        overlay.style.left = el.offsetLeft * currentScale + 'px';
        overlay.style.top = el.offsetTop * currentScale + 'px';
        overlay.style.width = el.offsetWidth * currentScale + 'px';
        overlay.style.height = el.offsetHeight * currentScale + 'px';
        const w = dataOf(el);
        if (w) badge.textContent = `${w.x}, ${w.y}  ·  ${el.offsetWidth}×${el.offsetHeight}`;
    }
    const origSelect = window.selectWidget;
    window.selectWidget = function (el) { const r = origSelect.apply(this, arguments); syncOverlay(); return r; };
    if (window.ResizeObserver) new ResizeObserver(syncOverlay).observe(canvas);

    // ---------------------------------------------------------------- pages
    const tabs = $('page-tabs');
    function renderPageTabs() {
        if (!tabs) return;
        tabs.innerHTML = L.pages.map(p => `<button type="button" class="page-tab${p.id === L.current ? ' on' : ''}" data-page="${esc(p.id)}" title="Click to open, double-click to rename">${esc(p.id)}${L.pages.length > 1 ? `<i class="material-icons-outlined page-x" data-del="${esc(p.id)}" title="Delete page">close</i>` : ''}</button>`).join('') +
            '<button type="button" class="page-tab add" id="page-add" title="Add page"><i class="material-icons-outlined">add</i></button>';
    }
    function applyPageVisibility() {
        widgetsOnCanvas.forEach(w => { if (w.element) w.element.style.display = L.pageOf(w) === L.current ? '' : 'none'; });
        if (selectedWidget && selectedWidget.style.display === 'none') { selectedWidget = null; updatePropertiesPanel(); }
        syncOverlay();
    }
    function switchPage(id) {
        if (id === L.current || !L.pages.some(p => p.id === id)) return;
        L.current = id; if (selectedWidget) { selectedWidget.classList.remove('selected'); selectedWidget = null; updatePropertiesPanel(); }
        applyPageVisibility(); renderPageTabs(); updateElementsList(); L.saveMeta(); pushHistory();
    }
    const slug = s => String(s).trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    function addPage() {
        let n = L.pages.length + 1, id = 'page_' + n; while (L.pages.some(p => p.id === id)) id = 'page_' + (++n);
        L.pages.push({ id }); L.current = id; renderPageTabs(); applyPageVisibility(); updateElementsList(); updateCodeOutput(); L.saveMeta();
    }
    function renamePage(id) {
        const v = prompt('Page ID (letters, digits, underscore):', id); if (v === null) return;
        const nid = slug(v); if (!nid || nid === id) return;
        if (L.pages.some(p => p.id === nid)) { alert('A page with that ID already exists.'); return; }
        L.pages.find(p => p.id === id).id = nid; widgetsOnCanvas.forEach(w => { if (w.page === id) w.page = nid; });
        if (L.current === id) L.current = nid; renderPageTabs(); updateCodeOutput(); L.saveMeta(); saveStateToLocalStorage();
    }
    function deletePage(id) {
        const n = widgetsOnCanvas.filter(w => L.pageOf(w) === id).length;
        if (L.pages.length < 2) return;
        if (n && !confirm(`Delete page "${id}" and its ${n} widget${n === 1 ? '' : 's'}?`)) return;
        widgetsOnCanvas.filter(w => L.pageOf(w) === id).forEach(w => w.element && w.element.remove());
        widgetsOnCanvas = widgetsOnCanvas.filter(w => L.pageOf(w) !== id);
        L.pages = L.pages.filter(p => p.id !== id); if (L.current === id) L.current = L.pages[0].id;
        selectedWidget = null; updatePropertiesPanel(); renderPageTabs(); applyPageVisibility(); updateElementsList(); updateZIndices(); updateCodeOutput(); L.saveMeta(); saveStateToLocalStorage();
    }
    if (tabs) {
        tabs.addEventListener('click', e => {
            const d = e.target.closest('[data-del]'); if (d) { e.stopPropagation(); deletePage(d.dataset.del); return; }
            if (e.target.closest('#page-add')) { addPage(); return; }
            const t = e.target.closest('[data-page]'); if (t) switchPage(t.dataset.page);
        });
        tabs.addEventListener('dblclick', e => { const t = e.target.closest('[data-page]'); if (t) renamePage(t.dataset.page); });
    }
    // new widgets belong to the page you are looking at
    const origAdd = window.addWidgetToCanvas;
    window.addWidgetToCanvas = function (id, type, x, y, loaded) {
        const r = origAdd.apply(this, arguments);
        const w = widgetsOnCanvas.find(v => v.id === id); if (w && !w.page) w.page = L.current;
        const el = w && w.element; if (el) { el.draggable = false; el.style.touchAction = 'none'; if (L.pageOf(w) !== L.current) el.style.display = 'none'; }
        return r;
    };
    // the Elements list shows the current page, top-most first
    const origList = window.updateElementsList;
    window.updateElementsList = function () {
        origList.apply(this, arguments);
        const box = $('elements-list-items'); if (!box) return;
        const items = [...box.querySelectorAll('.elements-list-item')]; let shown = 0;
        items.forEach(it => { const w = widgetsOnCanvas.find(v => v.id === it.dataset.widgetId); const on = !w || L.pageOf(w) === L.current; it.style.display = on ? '' : 'none'; if (on) shown++; });
        items.reverse().forEach(it => box.appendChild(it));
        $('element-count').textContent = shown;
        if (!shown && widgetsOnCanvas.length) { box.insertAdjacentHTML('afterbegin', '<p class="text-xs text-gray-500 italic px-2 empty-page">Nothing on this page yet.</p>'); }
    };
    // z-order buttons were inverted: "up" must raise the widget
    window.moveWidget = function (widgetId, direction) {
        const i = widgetsOnCanvas.findIndex(w => w.id === widgetId); if (i < 0) return;
        const j = direction === 'up' ? i + 1 : i - 1; if (j < 0 || j >= widgetsOnCanvas.length) return;
        const [m] = widgetsOnCanvas.splice(i, 1); widgetsOnCanvas.splice(j, 0, m);
        updateZIndices(); updateElementsList(); updateCodeOutput(); saveStateToLocalStorage();
    };

    // ---------------------------------------------------------------- undo / redo
    const hist = []; let hi = -1, histTimer = null;
    const serial = w => { const { element, ...rest } = w; return rest; };
    function snapshot() {
        return JSON.stringify({ widgets: widgetsOnCanvas.map(serial), pages: L.pages, fonts: L.fonts, res: screenResolutionSelect.value, current: L.current, next: nextWidgetId, sel: selectedWidget ? selectedWidget.dataset.widgetId : null });
    }
    function pushHistory() {
        if (restoring) return;
        const s = snapshot(); if (hi >= 0 && hist[hi].s === s) return;
        hist.length = hi + 1; hist.push({ s }); if (hist.length > 100) hist.shift(); hi = hist.length - 1; updateUndoButtons();
    }
    function restore(entry) {
        const s = JSON.parse(entry.s); restoring = true;
        try {
            if (s.res && s.res !== 'custom' && screenResolutionSelect.value !== s.res) {
                if (!screenResolutionSelect.querySelector(`option[value="${s.res}"]`)) {
                    screenResolutionSelect.querySelectorAll('option[data-is-custom-display="true"]').forEach(o => o.remove());
                    const o = document.createElement('option'); o.value = s.res; o.textContent = s.res + '*'; o.dataset.isCustomDisplay = 'true';
                    screenResolutionSelect.insertBefore(o, screenResolutionSelect.querySelector('option[value="custom"]'));
                }
                screenResolutionSelect.value = s.res; updateCanvasSize(s.res);
            }
            widgetsOnCanvas = []; canvas.innerHTML = ''; selectedWidget = null;
            L.pages = s.pages; L.current = s.current; nextWidgetId = s.next; if (s.fonts) L.fonts = s.fonts;
            s.widgets.forEach(w => addWidgetToCanvas(w.id, w.type, w.x, w.y, w));
            updateZIndices(); updateElementsList(); renderPageTabs(); applyPageVisibility();
            const el = s.sel && canvas.querySelector(`.canvas-widget[data-widget-id="${(window.CSS && CSS.escape) ? CSS.escape(s.sel) : s.sel}"]`);
            if (el && el.style.display !== 'none') selectWidget(el); else updatePropertiesPanel();
        } finally { restoring = false; }
        updateCodeOutput(); saveStateToLocalStorage(); L.saveMeta(); updateUndoButtons();
    }
    function undo() { clearTimeout(histTimer); pushHistory(); if (hi > 0) { hi--; restore(hist[hi]); L.toast('Undone'); } }
    function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); L.toast('Redone'); } }
    function updateUndoButtons() { const u = $('undo-button'), r = $('redo-button'); if (u) u.disabled = hi <= 0; if (r) r.disabled = hi >= hist.length - 1; }
    L.undo = undo; L.redo = redo; L.snapshot = snapshot; L.pushHistory = pushHistory;

    // every mutation ends in updateCodeOutput(): that is our hook for history + persistence + overlay
    L.afterChange = function () {
        if (restoring) return;
        syncOverlay();
        const ub = $('undo-button'); if (ub) ub.disabled = false; // a change is pending; Undo flushes it first
        clearTimeout(histTimer);
        histTimer = setTimeout(() => { pushHistory(); saveStateToLocalStorage(); L.saveMeta(); }, 300);
    };

    // ---------------------------------------------------------------- dragging + resizing (pointer based, zoom aware)
    const snapV = (v, ev) => (S.snap && !(ev && ev.altKey)) ? Math.round(v / S.grid) * S.grid : Math.round(v);
    let drag = null, justDragged = false;
    stage.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        const h = ev.target.closest && ev.target.closest('.sel-h');
        if (h && selectedWidget) {
            const w = dataOf(selectedWidget); if (!w) return;
            drag = { mode: 'resize', h: h.dataset.h, id: ev.pointerId, cx: ev.clientX, cy: ev.clientY, w0: selectedWidget.offsetWidth, h0: selectedWidget.offsetHeight, w, moved: false };
            try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ } ev.preventDefault(); return;
        }
        const el = ev.target.closest && ev.target.closest('.canvas-widget'); if (!el) return;
        if (el !== selectedWidget) selectWidget(el);
        const w = dataOf(el); if (!w) return;
        drag = { mode: 'move', id: ev.pointerId, cx: ev.clientX, cy: ev.clientY, x0: w.x || 0, y0: w.y || 0, w, el, moved: false };
        try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
    });
    stage.addEventListener('pointermove', ev => {
        if (!drag || ev.pointerId !== drag.id) return;
        const dx = (ev.clientX - drag.cx) / currentScale, dy = (ev.clientY - drag.cy) / currentScale;
        if (!drag.moved && Math.hypot(dx, dy) * currentScale < 3) return;
        drag.moved = true; const c = canvasSize(), w = drag.w;
        if (drag.mode === 'move') {
            w.x = Math.max(0, Math.min(snapV(drag.x0 + dx, ev), Math.max(0, c.w - 8)));
            w.y = Math.max(0, Math.min(snapV(drag.y0 + dy, ev), Math.max(0, c.h - 8)));
            selectedWidget.style.left = w.x + 'px'; selectedWidget.style.top = w.y + 'px';
        } else {
            if (drag.h.includes('e')) { w.width = Math.max(4, snapV(drag.w0 + dx, ev)); selectedWidget.style.width = w.width + 'px'; }
            if (drag.h.includes('s')) { w.height = Math.max(4, snapV(drag.h0 + dy, ev)); selectedWidget.style.height = w.height + 'px'; }
        }
        syncOverlay();
    });
    const endDrag = ev => {
        if (!drag || (ev && ev.pointerId !== drag.id)) return;
        const moved = drag.moved; drag = null; justDragged = moved;
        if (moved) { updatePropertiesPanel(); updateCodeOutput(); setTimeout(() => { justDragged = false; }, 0); }
    };
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
    // a drag must not toggle checkable buttons / re-select
    canvas.addEventListener('click', e => { if (justDragged) { e.stopPropagation(); e.preventDefault(); justDragged = false; } }, true);
    // native HTML5 drag of canvas widgets is replaced by the pointer drag above
    canvas.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.canvas-widget')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    // toolbox -> canvas drops: take the zoom into account
    canvas.addEventListener('drop', e => {
        if (!draggedWidgetType) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const r = canvas.getBoundingClientRect(), type = draggedWidgetType, c = canvasSize();
        const x = Math.max(0, Math.min(snapV((e.clientX - r.left) / currentScale, e), c.w - 8));
        const y = Math.max(0, Math.min(snapV((e.clientY - r.top) / currentScale, e), c.h - 8));
        draggedWidgetType = null;
        addWidgetToCanvas(generateUniqueId(type), type, x, y);
    }, true);

    // ---------------------------------------------------------------- duplicate / copy / paste
    let clip = null;
    function copySel() { const w = dataOf(selectedWidget); if (w) { clip = JSON.parse(JSON.stringify(serial(w))); L.toast('Copied ' + w.id); } }
    function pasteClip(offset = 10) {
        if (!clip) return;
        const id = generateUniqueId(clip.type), data = JSON.parse(JSON.stringify(clip));
        delete data.zIndex; data.id = id; data.x = (clip.x || 0) + offset; data.y = (clip.y || 0) + offset; data.page = L.current;
        addWidgetToCanvas(id, clip.type, data.x, data.y, data);
        updateZIndices(); updateElementsList(); updateCodeOutput();
        const el = canvas.querySelector(`.canvas-widget[data-widget-id="${id}"]`); if (el) selectWidget(el);
        clip = JSON.parse(JSON.stringify(serial(dataOf(el))));
    }
    function duplicate() { const w = dataOf(selectedWidget); if (!w) return; clip = JSON.parse(JSON.stringify(serial(w))); pasteClip(10); }

    // ---------------------------------------------------------------- keyboard
    const modalOpen = () => [...document.querySelectorAll('.lvgl-modal.open, #yaml-modal:not(.hidden), #import-modal:not(.hidden), #custom-size-modal:not(.hidden), #keyboard-shortcuts-modal:not(.hidden)')].length > 0;
    const isTyping = t => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    document.addEventListener('keydown', e => {
        if (modalOpen() || isTyping(e.target)) { return; }
        const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        const handled = () => { e.preventDefault(); e.stopImmediatePropagation(); };
        if (mod && k === 'z') { handled(); e.shiftKey ? redo() : undo(); return; }
        if (mod && k === 'y') { handled(); redo(); return; }
        if (mod && k === 's') { handled(); saveStateToLocalStorage(); L.saveMeta(); L.toast('Saved in this browser'); return; }
        if (mod && k === 'd') { handled(); duplicate(); return; }
        if (mod && k === 'c') { if (selectedWidget) { handled(); copySel(); } return; }
        if (mod && k === 'v') { if (clip) { handled(); pasteClip(); } return; }
        if (!selectedWidget || mod) return;
        const w = dataOf(selectedWidget); if (!w) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { handled(); deleteWidgetById(w.id); return; }
        if (e.key === 'Escape') { handled(); selectWidget(null); return; }
        if (e.key.startsWith('Arrow')) {
            handled(); const step = e.shiftKey ? 10 : 1;
            w.x = Math.max(0, (w.x || 0) + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0));
            w.y = Math.max(0, (w.y || 0) + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0));
            selectedWidget.style.left = w.x + 'px'; selectedWidget.style.top = w.y + 'px';
            updatePropertiesPanel(); updateCodeOutput();
        }
    }, true);

    // ---------------------------------------------------------------- toolbar wiring
    const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
    on('undo-button', undo); on('redo-button', redo); on('fit-button', fit);
    on('snap-button', () => { S.snap = !S.snap; LS.set('lvglSnap', S.snap); syncSnap(); });
    function syncSnap() { const b = $('snap-button'); if (b) { b.classList.toggle('on', S.snap); b.title = S.snap ? 'Snap to 10px grid: on (hold Alt to bypass)' : 'Snap to grid: off'; } }
    // preset zoom buttons: route through setScale (also fixes non-integer scales)
    document.querySelectorAll('#scale-controls .scale-button').forEach(b => b.addEventListener('click', e => { e.stopImmediatePropagation(); setScale(parseFloat(b.dataset.scale)); }, true));
    // small screens: close the toolbox after adding a widget, and tap outside to close it
    const backdrop = document.createElement('div'); backdrop.id = 'toolbox-backdrop'; document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => { if (isToolboxVisible) toggleToolbox(); });
    const small = () => window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;
    function syncBackdrop() { backdrop.classList.toggle('on', small() && isToolboxVisible); }
    if (window.toggleToolbox) { const ot = window.toggleToolbox; window.toggleToolbox = function () { ot.apply(this, arguments); syncBackdrop(); }; $('toggle-toolbox-button').addEventListener('click', syncBackdrop); }
    $('toolbox').addEventListener('click', e => { if (e.target.closest('.add-widget-btn') && small() && isToolboxVisible) setTimeout(() => toggleToolbox(), 0); });
    window.addEventListener('resize', () => { syncBackdrop(); syncOverlay(); });

    // ---------------------------------------------------------------- init
    // widgets loaded from storage before this script ran
    widgetsOnCanvas.forEach(w => { if (!w.page) w.page = L.current; if (w.element) { w.element.draggable = false; w.element.style.touchAction = 'none'; } });
    applyCanvasScale(); renderPageTabs(); applyPageVisibility(); updateElementsList(); updateCodeOutput(); syncSnap();
    if (small() && isToolboxVisible && !LS.get('lvglToolboxSeen', '')) { toggleToolbox(); LS.set('lvglToolboxSeen', '1'); }
    syncBackdrop();
    pushHistory();
    L.renderPageTabs = renderPageTabs; L.applyPageVisibility = applyPageVisibility; L.switchPage = switchPage; L.restoreSnapshot = restore; L.setScale = setScale; L.fit = fit;
})();
