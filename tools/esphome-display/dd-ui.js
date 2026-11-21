// Displaysim UI additions (moderate layout change): File menu, Samples, display profile picker, page tabs,
// Live data panel, new element types in the palette + editor, Images manager, Assets code pill, PWA install.
// Everything is attached to the existing markup; nothing in the current layout is removed.
(function () {
    'use strict';
    const DD = window.DD, T = DD.types, $ = id => document.getElementById(id);
    const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
    function h(tag, attrs, ...kids) {
        const e = document.createElement(tag);
        if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v === undefined || v === null || v === false) return; if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v); else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v); });
        kids.flat().forEach(k => { if (k === null || k === undefined || k === false) return; e.append(k instanceof Node ? k : document.createTextNode(String(k))); });
        return e;
    }
    const ic = n => h('span', { class: 'material-symbols-outlined' }, n);
    DD.h = h; DD.ic = ic;
    const refresh = () => { renderElementList(); drawPreview(); saveToCache(); };

    // ------------------------------------------------------------------ toast + modal
    DD.toast = function (msg, action, fn, ms) {
        let root = $('ddToastRoot'); if (!root) { root = h('div', { id: 'ddToastRoot', 'aria-live': 'polite' }); document.body.append(root); }
        const t = h('div', { class: 'dd-toast' }, ic('info'), h('span', { html: msg })); if (action) t.append(h('button', { class: 'dd-toast-btn', onclick: () => { fn(); t.remove(); } }, action));
        root.append(t); setTimeout(() => t.classList.add('out'), (ms || (action ? 9000 : 2600)) - 300); setTimeout(() => t.remove(), ms || (action ? 9000 : 2600));
    };
    const modals = [];
    DD.modal = function ({ title, icon, wide, tall, body, foot, cls }) {
        const back = h('div', { class: 'info-overlay active dd-modal-back' });
        const box = h('div', { class: 'info-content deploy-modal dd-modal' + (wide ? ' dd-wide' : '') + (tall ? ' dd-tall' : '') + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
        const close = () => { back.remove(); const i = modals.indexOf(api); if (i >= 0) modals.splice(i, 1); if (!modals.length && !($('infoOverlay').classList.contains('active') || $('deployOverlay').classList.contains('active') || ($('yamlOverlay') && $('yamlOverlay').classList.contains('active')))) document.body.style.overflow = ''; };
        const bodyEl = h('div', { class: 'deploy-body dd-modal-body' }, body);
        box.append(h('div', { class: 'deploy-head' }, h('h2', null, icon ? ic(icon) : null, title), h('button', { class: 'drawer-close', title: 'Close', onclick: close }, ic('close'))), bodyEl);
        if (foot) box.append(h('div', { class: 'dd-modal-foot' }, foot));
        back.append(box); back.addEventListener('mousedown', e => { if (e.target === back) close(); });
        document.body.append(back); document.body.style.overflow = 'hidden';
        const api = { close, body: bodyEl, box }; modals.push(api); return api;
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modals.length) { modals[modals.length - 1].close(); e.stopImmediatePropagation(); } }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modals.length) { const ps = document.querySelectorAll('.dd-pop'); if (ps.length) { ps.forEach(p => p.remove()); e.stopPropagation(); } } }, true);
    DD.popover = function (anchor, content, align) {
        document.querySelectorAll('.dd-pop').forEach(p => p.remove());
        const p = h('div', { class: 'dd-pop' }, content); document.body.append(p);
        const r = anchor.getBoundingClientRect(), pw = p.offsetWidth; let x = align === 'right' ? r.right - pw : r.left; x = Math.max(8, Math.min(x, innerWidth - pw - 8)); p.style.left = x + 'px'; p.style.top = (r.bottom + 8) + 'px';
        setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!p.contains(e.target) && !anchor.contains(e.target) && !e.target.closest('.dd-list, .dd-dlg-back')) { p.remove(); document.removeEventListener('mousedown', off); } }), 0);
        return p;
    };
    const closePop = () => document.querySelectorAll('.dd-pop').forEach(p => p.remove());
    const download = (name, data, type) => { const a = h('a', { href: URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain' })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };
    DD.download = download;

    // ------------------------------------------------------------------ top bar: File menu + Samples (+ folded legacy icons)
    const navIcons = document.querySelector('.nav-icons');
    const legacy = ['exportBtn', 'clearCacheBtn', 'export-text-btn', 'export-md-btn', 'import-text-btn', 'import-yaml-btn'].map($).filter(Boolean);
    legacy.forEach(b => b.classList.add('dd-folded'));
    const fileBtn = h('span', { class: 'material-symbols-outlined', id: 'ddFileBtn', title: 'File: import, export, project, clear' }, 'folder_open');
    const sampBtn = h('span', { class: 'material-symbols-outlined', id: 'ddSamplesBtn', title: 'Samples: finished designs to build on' }, 'auto_awesome');
    const instBtn = h('span', { class: 'material-symbols-outlined', id: 'ddInstallBtn', title: 'Install as an app', hidden: true }, 'install_desktop');
    const anchorEl = $('deployBtn') || navIcons.firstChild;
    navIcons.insertBefore(sampBtn, anchorEl.nextSibling); navIcons.insertBefore(fileBtn, sampBtn.nextSibling); navIcons.insertBefore(instBtn, fileBtn.nextSibling);
    function fileMenu() {
        const item = (label, ic_, fn, sub) => h('button', { class: 'dd-menu-item', onclick: () => { closePop(); fn(); } }, ic(ic_), h('span', null, label, sub ? h('small', null, sub) : null));
        const pick = (accept, cb) => { const i = h('input', { type: 'file', accept, hidden: true }); i.addEventListener('change', () => { const f = i.files[0]; if (f) cb(f); i.remove(); }); document.body.append(i); i.click(); };
        const menu = h('div', { class: 'dd-menu' },
            h('div', { class: 'dd-menu-h' }, 'Project'),
            item('Save project (.json)', 'save', async () => download('displaysim-project.json', JSON.stringify(await DD.exportProject(true)), 'application/json'), 'Everything: layout, pages, images, fonts'),
            item('Open project (.json)', 'folder_open', () => pick('.json,application/json', async f => { try { const p = JSON.parse(await f.text()); await DD.loadProject(p); DD.toast('Project opened.'); } catch (e) { DD.toast('Could not open: ' + e.message); } })),
            item('Samples…', 'auto_awesome', () => DD.openSamples()),
            h('div', { class: 'dd-menu-h' }, 'Import'),
            item('From ESPHome YAML', 'integration_instructions', () => $('import-yaml-btn').click()),
            item('From TXT export', 'upload', () => $('import-text-btn').click()),
            h('div', { class: 'dd-menu-h' }, 'Export'),
            item('Lambda + fonts (TXT)', 'download', () => $('export-text-btn').click()),
            item('Markdown (human + AI agent)', 'description', () => $('export-md-btn').click()),
            item('PDF', 'picture_as_pdf', () => $('exportBtn').click()),
            h('div', { class: 'dd-menu-h' }, 'Data'),
            item('Clear saved data', 'delete_sweep', () => $('clearCacheBtn').click()));
        DD.popover(fileBtn, menu, 'right');
    }
    fileBtn.addEventListener('click', fileMenu); sampBtn.addEventListener('click', () => DD.openSamples());

    // ------------------------------------------------------------------ display profile picker (Configuration -> Screen)
    const screenGroup = document.querySelector('.cfg-screen');
    const profSel = h('select', { id: 'ddProfile', title: 'Display type' });
    const profNote = h('p', { class: 'dd-mode-note', id: 'ddModeNote' });
    const smooth = h('input', { type: 'checkbox', id: 'ddSmooth' });
    function fillProfiles() {
        profSel.innerHTML = ''; const groups = {};
        DD.PROFILES.forEach(p => { (groups[p.group] = groups[p.group] || h('optgroup', { label: p.group })).append(h('option', { value: p.id }, p.label)); });
        Object.values(groups).forEach(g => profSel.append(g)); profSel.value = DD.profile().id;
    }
    function syncProfileUI() {
        const p = DD.profile(); if (profSel.value !== p.id) profSel.value = p.id;
        profNote.innerHTML = '';
        profNote.append(h('b', null, DD.MODES[p.mode].label + ': '), DD.MODES[p.mode].how, p.modelNote ? h('em', null, ' ' + p.modelNote) : null);
        if (screenGroup) screenGroup.classList.toggle('dd-mono', p.mode !== 'color');
    }
    if (screenGroup) {
        const head = screenGroup.querySelector('.cfg-heading');
        const box = h('div', { class: 'dd-profile' }, h('label', { for: 'ddProfile' }, 'Display type:'), profSel, profNote,
            h('label', { class: 'dd-check', title: 'Draw text with the browser instead of the exact ESPHome-style rasteriser' }, smooth, 'Smooth text preview (ignore font bpp)'));
        if ($('ddProfileSlot')) $('ddProfileSlot').append(box); else head.after(box);
        fillProfiles(); syncProfileUI();
        profSel.addEventListener('change', () => DD.setProfile(profSel.value, {}));
        smooth.checked = DD.LS.get('dd.smooth', 'false') === 'true'; DD.fontEngine.smooth = smooth.checked;
        smooth.addEventListener('change', () => { DD.fontEngine.smooth = smooth.checked; DD.LS.set('dd.smooth', String(smooth.checked)); drawPreview(); });
        DD.onProfile = syncProfileUI;
        // the legacy E-Ink switch keeps working: it moves the profile to/from e-paper
        const et = $('einkToggle'); if (et) et.addEventListener('change', () => { const m = DD.mode(); if (et.checked && m !== 'epaper') { DD.profileId = 'epd_custom'; } else if (!et.checked && m === 'epaper') { DD.profileId = 'color_custom'; } DD.saveMeta(); syncProfileUI(); drawPreview(); });
    }

    // ------------------------------------------------------------------ page tabs (above the preview)
    const prevHost = $('screenPreview');
    const pageBar = h('div', { id: 'ddPageBar', class: 'dd-pagebar', role: 'tablist', 'aria-label': 'Display pages' });
    prevHost.parentElement.insertBefore(pageBar, prevHost);
    function renderPages() {
        pageBar.innerHTML = '';
        DD.pages.forEach(p => {
            const b = h('button', { class: 'dd-page' + (p.id === DD.page ? ' on' : ''), role: 'tab', title: 'Click to open · double-click to rename', onclick: () => DD.setPage(p.id) }, ic('crop_landscape'), p.id);
            b.addEventListener('dblclick', async () => { const v = await DD.prompt('Letters, digits and underscore only. It is used as the page id in display: pages:.', p.id, { title: 'Rename page', icon: 'edit' }); if (v && !DD.renamePage(p.id, v)) DD.toast('That page id is invalid or already exists.'); });
            if (DD.pages.length > 1) b.append(h('span', { class: 'material-symbols-outlined dd-page-x', title: 'Delete page', onclick: async e => { e.stopPropagation(); const n = DD.pageEls(p.id).length; if (n && !(await DD.confirm(`Page "${p.id}" and its ${n} element${n === 1 ? '' : 's'} will be removed.`, { title: 'Delete page?', confirmLabel: 'Delete', danger: true }))) return; DD.deletePage(p.id); } }, 'close'));
            pageBar.append(b);
        });
        pageBar.append(h('button', { class: 'dd-page add', title: 'Add a display page', onclick: () => DD.addPage() }, ic('add')));
        pageBar.append(h('span', { class: 'dd-page-hint' }, DD.pages.length > 1 ? 'Switch on the device with display.page.show_next' : ''));
    }
    DD.onPages = function () { renderPages(); if (DD.refreshPageSelects) DD.refreshPageSelects(); };

    // ------------------------------------------------------------------ Live data panel
    const note = prevHost.parentElement.querySelector('p');
    function renderLive() {
        const body = renderLive.body; if (!body) return; body.innerHTML = '';
        const ids = DD.sensorIds();
        body.append(h('p', { class: 'dd-hint' }, 'Values used by text like ', h('code', null, 'id(temp).state'), ', gauges and graph traces. Preview only: nothing is exported.'));
        if (!ids.length) body.append(h('p', { class: 'dd-hint' }, 'No sensors used yet. Add text with an argument such as id(temp).state, a gauge percent, or a graph trace.'));
        ids.forEach(id => {
            const inp = h('input', { type: 'text', value: DD.live.strings[id] !== undefined ? DD.live.strings[id] : (DD.live.values[id] !== undefined ? DD.live.values[id] : ''), placeholder: String(DD.defaultValue(id)), spellcheck: 'false' });
            inp.addEventListener('input', () => { const v = inp.value.trim(); delete DD.live.values[id]; delete DD.live.strings[id]; if (v !== '') { if (/^-?\d+(\.\d+)?$/.test(v)) DD.live.values[id] = parseFloat(v); else DD.live.strings[id] = v; } DD.saveMeta(); drawPreview(); });
            body.append(h('label', { class: 'dd-live-row' }, h('code', null, id), inp));
        });
        const tm = DD.live.time, mode = h('select', null, h('option', { value: 'now', selected: tm.mode === 'now' ? true : undefined }, 'Real time (now)'), h('option', { value: 'fixed', selected: tm.mode === 'fixed' ? true : undefined }, 'Fixed time'));
        const dt = h('input', { type: 'datetime-local', value: tm.iso.slice(0, 16), disabled: tm.mode !== 'fixed' ? true : undefined });
        mode.addEventListener('change', () => { tm.mode = mode.value; dt.disabled = tm.mode !== 'fixed'; DD.saveMeta(); drawPreview(); });
        dt.addEventListener('input', () => { if (dt.value) tm.iso = dt.value; DD.saveMeta(); drawPreview(); });
        body.append(h('div', { class: 'dd-live-time' }, h('b', null, 'Clock'), mode, dt));
    }
    // Live data lives in a popover opened from the preview header (see dd-view.js)
    DD.openLive = function (anchor) {
        if (document.querySelector('.dd-pop.dd-live-pop')) { document.querySelectorAll('.dd-pop').forEach(p => p.remove()); return; }
        const body = h('div', { class: 'dd-live-body' }); renderLive.body = body; renderLive();
        const panel = h('div', { class: 'dd-live-panel' }, h('div', { class: 'dd-live-title' }, ic('sensors'), 'Live data', h('small', null, 'simulated sensors & clock')), body);
        const pop = DD.popover(anchor, panel, 'right'); pop.classList.add('dd-live-pop');
        // centre the popover under the button (it is positioned before it gets its width, so redo it), kept inside the window
        const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth;
        pop.style.left = Math.max(8, Math.min(r.left + r.width / 2 - pw / 2, innerWidth - pw - 8)) + 'px';
    };
    setInterval(() => { if (DD.live.time.mode === 'now' && elements.some(e => e.type === 'clock' && DD.pageOf(e) === DD.page)) drawPreview(); }, 1000);

    // ------------------------------------------------------------------ new element types: palette ("More") + list + editor fields
    const addBar = document.querySelector('.add-elements-container');
    const moreBtn = h('button', { id: 'ddMoreBtn', title: 'More elements: lines, triangles, images, graph, QR, clock…' }, ic('add_circle'), 'More');
    addBar.append(moreBtn);
    DD.addElement = function (type) {
        const t = T[type]; if (!t) return;
        const [W, H] = DD.size(); const def = t.defaults ? t.defaults(W, H) : {};
        const colorDefault = einkMode || DD.mode() === 'epaper' ? 'black' : 'white';
        const el = { id: nextId++, type, colorId: colorDefault, page: DD.page, ...def };
        if (type === 'clock') { el.fontId = (getAvailableFonts()[0]) || 'id(roboto_12)'; el.format = '%H:%M'; el.align = 'LEFT'; el.timeId = 'ha_time'; }
        if (type === 'image' && !el.imageId) el.imageId = (DD.images[0] || {}).id || '';
        // stack new elements below the last one on this page so they do not pile up
        if (def.y === undefined || def.editorOnly) { /* keep defaults */ }
        elements.push(el); selectElement(el.id); refresh();
        if (type === 'image' && !DD.images.length) DD.openImages();
        if (type === 'clock') DD.toast('Clock needs a <b>time:</b> component. Deploy adds <code>homeassistant</code> time for you.');
        return el;
    };
    moreBtn.addEventListener('click', () => {
        const groups = {}; Object.entries(T).filter(([k, t]) => t.label).forEach(([k, t]) => { (groups[t.group] = groups[t.group] || []).push([k, t]); });
        const menu = h('div', { class: 'dd-more' }, ...Object.entries(groups).map(([g, items]) => h('div', null, h('div', { class: 'dd-menu-h' }, g), h('div', { class: 'dd-more-grid' }, ...items.map(([k, t]) => h('button', { class: 'dd-more-item', onclick: () => { closePop(); DD.addElement(k); } }, ic(t.icon), t.label))))));
        DD.popover(moreBtn, menu);
    });
    // new elements go on the current page; shown in the list with a proper label
    const origAdd = window.addElement;
    window.addElement = function (type) { origAdd.apply(this, arguments); const el = elements[elements.length - 1]; if (el && !el.page) { el.page = DD.page; saveToCache(); } };
    const origList = window.renderElementList;
    window.renderElementList = function () {
        origList.apply(this, arguments);
        document.querySelectorAll('#elementList li, #popupElementList li').forEach(li => {
            const el = elements.find(e => String(e.id) === li.dataset.id); if (!el) return;
            if (DD.pageOf(el) !== DD.page) { li.style.display = 'none'; return; }
            const t = T[el.type];
            if (t && t.label) { const sp = li.querySelectorAll('.element-label > .material-symbols-outlined:not(.drag-handle)'); if (sp[0]) sp[0].textContent = t.icon; const lab = li.querySelector('.element-label > span:last-child'); if (lab && t.summary) lab.textContent = t.summary(el); }
        });
        const cnt = DD.pageEls(DD.page).length; const ph = document.querySelector('#elementsDetails .empty-hint'); void cnt; void ph;
    };
    // editor fields for the new types ---------------------------------------------------------------------------
    const ed = $('editor-content');
    const fieldsBox = h('div', { id: 'ddFields', class: 'dd-fields' }); ed.append(fieldsBox);
    const FIELDS = {
        line: [['x2', 'End X', 'abs'], ['y2', 'End Y', 'abs']], hline: [['width', 'Width', 'int']], vline: [['height', 'Height', 'int']],
        triangle: [['x2', 'Point 2 X', 'abs'], ['y2', 'Point 2 Y', 'abs'], ['x3', 'Point 3 X', 'abs'], ['y3', 'Point 3 Y', 'abs'], ['fill', 'Filled', 'bool']],
        polygon: [['radius', 'Radius', 'int'], ['edges', 'Edges', 'enum', [3, 4, 5, 6, 7, 8]], ['variation', 'Orientation', 'enum', ['POINTY_TOP', 'FLAT_TOP']], ['fill', 'Filled', 'bool']],
        ring: [['outer', 'Outer radius', 'int'], ['inner', 'Inner radius', 'int']],
        gauge: [['outer', 'Outer radius', 'int'], ['inner', 'Inner radius', 'int'], ['percent', 'Percent', 'text', 'e.g. 70 or id(level).state']],
        image: [['imageId', 'Image', 'image'], ['imgAlign', 'Align at x,y', 'enum', null], ['colorOn', 'On colour (1-bit)', 'text', 'e.g. white / id(c)'], ['colorOff', 'Off colour (1-bit)', 'text', 'e.g. black']],
        graph: [['width', 'Width', 'int'], ['height', 'Height', 'int'], ['duration', 'Duration', 'text', 'e.g. 1h'], ['xGrid', 'X grid', 'text', 'e.g. 10min'], ['yGrid', 'Y grid', 'num'], ['minRange', 'Min range', 'num'], ['maxRange', 'Max range', 'num'], ['lineThickness', 'Line thickness', 'int'], ['border', 'Border', 'bool'], ['espId', 'ESPHome id', 'text', 'graph_<n>']],
        qr: [['value', 'Value', 'text'], ['ecc', 'Error correction', 'enum', ['LOW', 'MEDIUM', 'QUARTILE', 'HIGH']], ['scale', 'Scale', 'int'], ['espId', 'ESPHome id', 'text', 'qr_<n>']],
        clock: [['format', 'Format', 'text', '%H:%M'], ['timeId', 'Time component id', 'text', 'ha_time'], ['align', 'Align', 'enum', ['LEFT', 'CENTER', 'RIGHT']]],
        clip: [['width', 'Width', 'int'], ['height', 'Height', 'int']]
    };
    FIELDS.image[1][3] = DD.IMG_ALIGN;
    const CLOCK_FORMATS = ['%H:%M', '%H:%M:%S', '%I:%M %p', '%a %d %b', '%A, %B %d', '%Y-%m-%d', '%d/%m/%Y'];
    function fieldRow(label, input) { return h('label', { class: 'dd-field' }, h('span', null, label), input); }
    function renderFields(el) {
        fieldsBox.innerHTML = '';
        const upd = (k, v) => { if (v === undefined) delete el[k]; else el[k] = v; refresh(); };
        const t = T[el.type];
        if (t && t.label) {
            fieldsBox.append(h('div', { class: 'dd-field-h' }, ic(t.icon), t.label));
            (FIELDS[el.type] || []).forEach(([k, label, kind, opt]) => {
                let inp;
                if (kind === 'bool') { inp = h('input', { type: 'checkbox' }); inp.checked = el[k] !== false && !!el[k]; inp.addEventListener('change', () => upd(k, inp.checked)); }
                else if (kind === 'enum') { inp = h('select', null, ...opt.map(o => h('option', { value: o, selected: String(el[k]) === String(o) ? true : undefined }, String(o)))); inp.addEventListener('change', () => upd(k, /^\d+$/.test(inp.value) ? +inp.value : inp.value)); }
                else if (kind === 'image') { inp = h('select', null, h('option', { value: '' }, '(none)'), ...DD.images.map(i => h('option', { value: i.id, selected: el[k] === i.id ? true : undefined }, i.id))); inp.addEventListener('change', () => upd(k, inp.value)); }
                else if (kind === 'abs') { const rel = 'd' + k, base = k[0] === 'x' ? 'x' : 'y'; inp = h('input', { type: 'number', value: Math.round(num(el[base]) + num(el[rel])) }); inp.addEventListener('input', () => { const n = parseInt(inp.value); if (!isNaN(n)) { el[rel] = n - num(el[base]); refresh(); } }); }
                else if (kind === 'int' || kind === 'num') { inp = h('input', { type: 'number', step: kind === 'num' ? 'any' : 1, value: el[k] ?? '' }); inp.addEventListener('input', () => { const n = inp.value === '' ? undefined : (kind === 'int' ? parseInt(inp.value) : parseFloat(inp.value)); upd(k, isNaN(n) ? undefined : n); }); }
                else { inp = h('input', { type: 'text', value: el[k] ?? '', placeholder: opt || '', spellcheck: 'false' }); inp.addEventListener('input', () => upd(k, k === 'percent' && /^-?\d+(\.\d+)?$/.test(inp.value.trim()) ? parseFloat(inp.value) : inp.value)); }
                fieldsBox.append(fieldRow(label, inp));
                if (k === 'format') { const sel = h('select', null, h('option', { value: '' }, 'Presets…'), ...CLOCK_FORMATS.map(f => h('option', { value: f }, `${f}  →  ${DD.strftime(f)}`))); sel.addEventListener('change', () => { if (sel.value) { upd('format', sel.value); renderFields(el); } }); fieldsBox.append(fieldRow('', sel)); }
            });
            if (el.type === 'image') fieldsBox.append(h('button', { class: 'dd-btn-sm', onclick: () => DD.openImages() }, ic('image'), 'Manage images…'), el.imageId && (DD.images.find(i => i.id === el.imageId) || {}).type === 'BINARY' ? h('p', { class: 'dd-hint' }, 'BINARY image: on/off bits take the colours above (default white on black).') : null);
            if (el.type === 'graph') {
                fieldsBox.append(h('div', { class: 'dd-field-h sub' }, 'Traces'));
                (el.traces = el.traces || []).forEach((tr, i) => {
                    const sensor = h('input', { type: 'text', value: tr.sensor || '', placeholder: 'sensor id', spellcheck: 'false' }), col = h('input', { type: 'text', value: tr.color || '', placeholder: 'colour id (optional)' }), lt = h('select', null, ...['SOLID', 'DOTTED', 'DASHED'].map(o => h('option', { selected: tr.lineType === o ? true : undefined }, o)));
                    sensor.addEventListener('input', () => { tr.sensor = sensor.value.trim(); refresh(); }); col.addEventListener('input', () => { tr.color = col.value.trim(); refresh(); }); lt.addEventListener('change', () => { tr.lineType = lt.value; refresh(); });
                    fieldsBox.append(h('div', { class: 'dd-trace' }, sensor, col, lt, h('button', { class: 'dd-x', title: 'Remove trace', onclick: () => { el.traces.splice(i, 1); refresh(); renderFields(el); } }, ic('close'))));
                });
                fieldsBox.append(h('button', { class: 'dd-btn-sm', onclick: () => { el.traces.push({ sensor: 'sensor_' + (el.traces.length + 1), color: '', lineType: 'SOLID' }); refresh(); renderFields(el); } }, ic('add'), 'Add trace'));
            }
        }
        // common: page + clip region
        const common = h('div', { class: 'dd-common' });
        if (DD.pages.length > 1) { const sel = h('select', null, ...DD.pages.map(p => h('option', { value: p.id, selected: DD.pageOf(el) === p.id ? true : undefined }, p.id))); sel.addEventListener('change', () => { el.page = sel.value; if (el.page !== DD.page) selectedElementId = null; refresh(); updateEditorForm(); }); common.append(fieldRow('Page', sel)); }
        if (el.type !== 'clip') {
            const clips = elements.filter(e => e.type === 'clip' && DD.pageOf(e) === DD.pageOf(el));
            if (clips.length) { const sel = h('select', null, h('option', { value: '' }, '(none)'), ...clips.map(c => h('option', { value: c.id, selected: String(el.clipId) === String(c.id) ? true : undefined }, `Clip #${c.id} (${c.width}×${c.height})`))); sel.addEventListener('change', () => upd('clipId', sel.value === '' ? undefined : +sel.value)); common.append(fieldRow('Clip to', sel)); }
        }
        if (common.children.length) fieldsBox.append(common);
    }
    DD.refreshPageSelects = () => { const el = elements.find(e => e.id === selectedElementId); if (el) renderFields(el); };
    const origForm = window.updateEditorForm;
    window.updateEditorForm = function () {
        origForm.apply(this, arguments);
        const el = elements.find(e => e.id === selectedElementId);
        if (!el) { fieldsBox.innerHTML = ''; return; }
        const t = T[el.type], isNew = !!(t && t.label);
        if (isNew) {
            ['textSpecific', 'iconSpecific', 'barSpecific', 'rectSpecific', 'circleSpecific'].forEach(i => { const n = $(i); if (n) n.style.display = 'none'; });
            const fs = $('fontSelectContainer'); if (fs) fs.style.display = el.type === 'clock' ? 'block' : 'none';
            const cs = $('colorSelectContainer'); if (cs) cs.style.display = el.type === 'clip' ? 'none' : 'block';
            if (el.type === 'clock' && $('editFontId')) $('editFontId').value = el.fontId || '';
        }
        renderFields(el);
    };
    // the shared font select also drives clock fonts (the monolith only updates text/icon)
    const fsel = $('editFontId'); if (fsel) fsel.addEventListener('change', () => { const el = elements.find(e => e.id === selectedElementId); if (el && el.type === 'clock') { el.fontId = fsel.value; refresh(); } });

    // ------------------------------------------------------------------ Images manager
    DD.openImages = function () {
        const body = h('div', { class: 'dd-images' });
        const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
        const render = () => {
            body.innerHTML = '';
            const [W, H] = DD.size();
            const drop = h('div', { class: 'dd-drop' }, ic('add_photo_alternate'), h('div', null, h('b', null, 'Drop images here'), ' or ', h('a', { href: '#', onclick: e => { e.preventDefault(); input.click(); } }, 'choose files')), h('small', null, 'PNG (with transparency), JPG, SVG… stored in this browser. ESPHome converts them at compile time; the preview shows the converted result.'), input);
            drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
            drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files]); }); input.addEventListener('change', () => add([...input.files]));
            body.append(drop);
            async function add(files) {
                const defType = DD.mode() === 'mono' || DD.mode() === 'epaper' ? 'BINARY' : DD.mode() === 'gray' ? 'GRAYSCALE' : 'RGB565';
                for (const f of files.filter(f => /^image\//.test(f.type))) {
                    const id = DD.nextImageId(f.name), meta = { id, name: f.name, file: 'images/' + f.name.replace(/[^\w.-]+/g, '_'), type: defType, resize: '', transparency: /png|svg|webp|gif/.test(f.type) ? 'alpha_channel' : 'opaque', dither: defType === 'BINARY' ? 'FLOYDSTEINBERG' : 'NONE', invert_alpha: false };
                    DD.images.push(meta); const img = await DD.addImageFile(f, id);
                    if (img && (img.width > W || img.height > H)) meta.resize = `${W}x${H}`;
                    if (meta.type === 'BINARY' && meta.transparency === 'alpha_channel') meta.transparency = 'chroma_key';
                    DD.refreshImage(id);
                }
                DD.saveMeta(); refresh(); render();
            }
            if (!DD.images.length) { body.append(h('p', { class: 'dd-hint' }, 'No images yet. Add one, then use it with an Image element (More → Image).')); return; }
            DD.images.forEach((m, idx) => {
                const proc = DD.imgCache.get(m.id), thumb = h('div', { class: 'dd-thumb' });
                if (proc) { const c = document.createElement('canvas'); c.width = proc.width; c.height = proc.height; c.getContext('2d').drawImage(proc, 0, 0); thumb.append(c); } else thumb.append(h('div', { class: 'dd-missing' }, ic('broken_image'), 'No file in this browser'));
                const upd = (k, v) => { m[k] = v; DD.refreshImage(m.id); DD.saveMeta(); refresh(); render(); };
                const sel = (k, opts) => { const s = h('select', null, ...opts.map(o => h('option', { selected: String(m[k] || opts[0]).toUpperCase() === o.toUpperCase() ? true : undefined }, o))); s.addEventListener('change', () => upd(k, s.value)); return s; };
                const idIn = h('input', { type: 'text', value: m.id, spellcheck: 'false' }); idIn.addEventListener('change', () => { const v = idIn.value.trim().replace(/[^a-zA-Z0-9_]/g, '_'); if (!v || DD.images.some(x => x !== m && x.id === v)) { DD.toast('Invalid or duplicate image id.'); idIn.value = m.id; return; } DD.idb.get('img:' + m.id).then(b => { if (b) { DD.idb.put('img:' + v, b); DD.idb.del('img:' + m.id); } }); const raw = DD.rawImages.get(m.id); if (raw) { DD.rawImages.set(v, raw); DD.rawImages.delete(m.id); } DD.imgCache.delete(m.id); elements.forEach(e => { if (e.imageId === m.id) e.imageId = v; }); m.id = v; DD.refreshImage(v); DD.saveMeta(); refresh(); render(); });
                const resize = h('input', { type: 'text', value: m.resize || '', placeholder: `e.g. ${W}x${H}`, spellcheck: 'false' }); resize.addEventListener('change', () => upd('resize', /^\d+x\d+$/i.test(resize.value.trim()) ? resize.value.trim() : ''));
                const bytes = proc ? Math.round(proc.width * proc.height * ({ BINARY: 1 / 8, GRAYSCALE: 1, RGB565: 2, RGB: 3, RGB111: .5 }[String(m.type).toUpperCase()] || 2)) : 0;
                body.append(h('div', { class: 'dd-img-card' }, thumb, h('div', { class: 'dd-img-meta' },
                    fieldRow('id', idIn), h('div', { class: 'dd-two' }, fieldRow('type', sel('type', ['RGB565', 'RGB', 'GRAYSCALE', 'BINARY', 'RGB111'])), fieldRow('transparency', sel('transparency', ['opaque', 'chroma_key', 'alpha_channel']))),
                    h('div', { class: 'dd-two' }, fieldRow('resize', resize), fieldRow('dither', sel('dither', ['NONE', 'FLOYDSTEINBERG']))),
                    h('label', { class: 'dd-check' }, (() => { const c = h('input', { type: 'checkbox' }); c.checked = !!m.invert_alpha; c.addEventListener('change', () => upd('invert_alpha', c.checked)); return c; })(), 'invert_alpha (swap black and white)'),
                    h('p', { class: 'dd-hint' }, proc ? `${proc.width}×${proc.height} px · ≈ ${(bytes / 1024).toFixed(1)} KB in flash` : 'Upload the file to preview it.'),
                    h('div', { class: 'dd-row' }, h('button', { class: 'dd-btn-sm', onclick: () => { const el = DD.addElement('image'); if (el) { el.imageId = m.id; refresh(); } } }, ic('add_photo_alternate'), 'Add to screen'),
                        h('button', { class: 'dd-btn-sm danger', onclick: async () => { if (elements.some(e => e.imageId === m.id) && !(await DD.confirm(`${m.id} is used on screen. Elements using it will show an empty placeholder.`, { title: 'Remove image?', confirmLabel: 'Remove', danger: true }))) return; DD.images.splice(idx, 1); DD.idb.del('img:' + m.id); DD.imgCache.delete(m.id); DD.saveMeta(); refresh(); render(); } }, ic('delete'), 'Remove')))));
            });
        };
        render(); DD.modal({ title: 'Images', icon: 'image', wide: true, tall: true, body });
    };
    // config panel entry point
    const colorCreator = document.querySelector('.palette-creator');
    if (colorCreator) colorCreator.after(h('div', { class: 'dd-images-row' }, h('div', { class: 'custom-size-title' }, 'Images'), h('button', { type: 'button', class: 'dd-btn-sm', onclick: () => DD.openImages() }, ic('image'), 'Manage images…')));

    // ------------------------------------------------------------------ Assets code pill + drawer section
    const drawerBody = document.querySelector('.code-drawer-body');
    const assetsTa = h('textarea', { id: 'generatedAssetsOutput', readonly: true, placeholder: 'image:, graph:, qr_code: and time: blocks for the elements you added...' });
    const assetsDet = h('details', { id: 'assetsCodeSection' }, h('summary', null, ic('perm_media'), ' Assets Code (images, graph, QR, clock)'), h('div', { class: 'details-content' }, h('p', { class: 'code-note' }, 'Components your lambda refers to: ', h('code', null, 'image:'), ', ', h('code', null, 'graph:'), ', ', h('code', null, 'qr_code:'), ', ', h('code', null, 'time:'), '.'), h('div', { class: 'code-actions-container' }, h('button', { onclick: () => { assetsTa.value = DD.assetsYaml() || '# No assets needed: your design has no images, graphs, QR codes or clocks.\n'; } }, ic('generating_tokens'), 'Generate'), h('button', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(assetsTa.value); DD.toast('Copied'); } }, ic('content_copy'), 'Copy')), h('div', { class: 'code-output' }, assetsTa)));
    drawerBody.append(assetsDet);
    const pillAssets = h('button', { type: 'button', class: 'pill-btn', id: 'pillAssets', title: 'Generate Assets Code (images, graph, QR, clock)' }, ic('perm_media'), 'Assets');
    $('pillLambda').parentElement.insertBefore(pillAssets, $('pillColor'));
    pillAssets.addEventListener('click', () => {
        const drawer = $('codeDrawer'), on = drawer.classList.contains('visible') && pillAssets.classList.contains('active');
        if (on) { $('codeDrawerClose').click(); return; }
        assetsTa.value = DD.assetsYaml() || '# No assets needed: your design has no images, graphs, QR codes or clocks.\n';
        ['codeSection', 'fontCodeSection', 'colorCodeSection'].forEach(i => { $(i).open = false; }); assetsDet.open = true;
        drawer.classList.add('visible'); drawer.setAttribute('aria-hidden', 'false'); document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active')); pillAssets.classList.add('active');
    });
    ['pillLambda', 'pillFont', 'pillColor'].forEach(id => $(id).addEventListener('click', () => { assetsDet.open = false; pillAssets.classList.remove('active'); }));
    const syncAssetsPill = () => { pillAssets.hidden = !(elements.some(e => ['image', 'graph', 'qr', 'clock'].includes(e.type)) || DD.images.length); };
    DD.syncAssetsPill = syncAssetsPill;
    const origRL = window.renderElementList; window.renderElementList = function () { const r = origRL.apply(this, arguments); syncAssetsPill(); return r; };

    // ------------------------------------------------------------------ PWA install
    let deferred = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; instBtn.hidden = false; });
    instBtn.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; instBtn.hidden = true; });
    window.addEventListener('appinstalled', () => { instBtn.hidden = true; });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('sw.js').then(reg => { reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) DD.toast('A new version is ready.', 'Reload', () => location.reload(), 15000); }); }); }).catch(() => { /* offline support unavailable */ });
    }

    // ------------------------------------------------------------------ boot
    DD.loadImages(); renderPages(); syncProfileUI(); syncAssetsPill();
    DD.ensureFontFiles = function () { try { getFontSpecs().forEach(s => { const f = String(s.file || ''); const k = /^gfonts:\/\//i.test(f) ? (/roboto/i.test(f) ? 'Roboto-Regular.ttf' : null) : f.split('/').pop(); if (k && DD.fontEngine.ensure) DD.fontEngine.ensure(k); }); } catch (e) { /* ignore */ } };
    DD.renderPages = renderPages; DD.renderLive = () => { if (renderLive.body && renderLive.body.isConnected) renderLive(); };
    window.DD_UI_READY = true;
})();
