// Left panel (widget palette + layers tree) and the page bar under the stage.
import { app, currentList, findNode, changed, select, setPage, walk, saveUi, toJSON, uniqueId } from './app.js';
import { WIDGETS, GROUPS, isContainer } from './widgets.js';
import { h, icon, toast, popover } from './ui.js';
import { revive, newUid } from './yaml.js';

export function createPanels(editor) {
    const left = document.getElementById('left'), pagebar = document.getElementById('pagebar');

    // ---------------------------------------------------------------- left tabs
    const tabs = h('div', { class: 'tabs' },
        h('button', { class: 'tab', 'data-t': 'widgets', onclick: () => setTab('widgets') }, icon('widgets'), 'Widgets'),
        h('button', { class: 'tab', 'data-t': 'layers', onclick: () => setTab('layers') }, icon('layers'), 'Layers'));
    const palette = h('div', { class: 'palette' }), layers = h('div', { class: 'layers' });
    left.append(tabs, palette, layers);
    function setTab(t) { app.ui.leftTab = t; saveUi(); tabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t)); palette.hidden = t !== 'widgets'; layers.hidden = t !== 'layers'; if (t === 'layers') renderLayers(); }

    // ---------------------------------------------------------------- palette
    const search = h('input', { type: 'search', class: 'pal-search', placeholder: 'Search widgets', spellcheck: 'false' });
    const palList = h('div', { class: 'pal-list' });
    palette.append(search, palList, h('p', { class: 'pal-hint' }, 'Drag onto the screen, or click to add. Drop onto a container to nest it.'));
    function renderPalette() {
        const q = search.value.trim().toLowerCase(); palList.innerHTML = '';
        GROUPS.forEach(g => {
            const items = Object.entries(WIDGETS).filter(([t, w]) => w.group === g && (!q || t.includes(q) || w.label.toLowerCase().includes(q)));
            if (!items.length) return;
            palList.append(h('div', { class: 'pal-group' }, g), h('div', { class: 'pal-grid' }, ...items.map(([t, w]) => {
                const tile = h('button', { class: 'pal-item', draggable: 'true', title: `${w.label} (${t})`, onclick: () => editor.addWidgetAt(t, null) }, icon(w.icon), h('span', null, w.label));
                tile.addEventListener('dragstart', e => { e.dataTransfer.setData('text/lvgl-widget', t); e.dataTransfer.effectAllowed = 'copy'; });
                return tile;
            })));
        });
    }
    search.addEventListener('input', renderPalette);
    renderPalette();

    // ---------------------------------------------------------------- layers tree
    const collapsed = new Set();
    function renderLayers() {
        if (layers.hidden) return;
        layers.innerHTML = '';
        const list = currentList();
        if (!list.length) { layers.append(h('p', { class: 'empty' }, 'No widgets on this page yet.')); return; }
        const root = h('div', { class: 'tree', role: 'tree' });
        const row = (n, depth) => {
            const kids = n.children || [], hasKids = kids.length > 0, isHidden = n.props.hidden === true || app.runtime.hidden.get(n.uid) === true;
            const r = h('div', { class: 'tree-row' + (app.sel === n.uid ? ' on' : '') + (isHidden ? ' dim' : ''), draggable: 'true', 'data-uid': n.uid, role: 'treeitem', style: { paddingLeft: (6 + depth * 14) + 'px' } },
                h('button', { class: 'tw' + (hasKids ? '' : ' none'), onclick: e => { e.stopPropagation(); collapsed.has(n.uid) ? collapsed.delete(n.uid) : collapsed.add(n.uid); renderLayers(); } }, icon(hasKids ? (collapsed.has(n.uid) ? 'chevron_right' : 'expand_more') : 'remove')),
                icon((WIDGETS[n.type] && WIDGETS[n.type].icon) || 'help_outline', 'ti'),
                h('span', { class: 'tl' }, n.props.id ? String(n.props.id) : n.type, h('small', null, n.props.id ? n.type : '')),
                h('button', { class: 'ta', title: isHidden ? 'Show (hidden: true)' : 'Hide (hidden: true)', onclick: e => { e.stopPropagation(); if (n.props.hidden === true) delete n.props.hidden; else n.props.hidden = true; changed('doc', true); } }, icon(n.props.hidden === true ? 'visibility_off' : 'visibility')),
                h('button', { class: 'ta', title: 'More', onclick: e => { e.stopPropagation(); rowMenu(e.currentTarget, n); } }, icon('more_horiz')));
            r.addEventListener('click', () => select(n.uid));
            r.addEventListener('dblclick', () => { const nn = app.layout && app.layout.all.find(x => x.uid === n.uid); if (nn && ['label', 'button', 'checkbox'].includes(n.type)) editor.startInlineEdit(nn); });
            r.addEventListener('dragstart', e => { e.dataTransfer.setData('text/lvgl-node', n.uid); e.dataTransfer.effectAllowed = 'move'; });
            r.addEventListener('dragover', e => {
                if (![...e.dataTransfer.types].includes('text/lvgl-node')) return; e.preventDefault();
                const b = r.getBoundingClientRect(), f = (e.clientY - b.top) / b.height;
                r.classList.remove('d-before', 'd-after', 'd-in'); r.classList.add(f < .3 ? 'd-before' : f > .7 || !isContainer(n.type) ? 'd-after' : 'd-in');
            });
            r.addEventListener('dragleave', () => r.classList.remove('d-before', 'd-after', 'd-in'));
            r.addEventListener('drop', e => {
                e.preventDefault(); const zone = r.classList.contains('d-before') ? 'before' : r.classList.contains('d-in') ? 'in' : 'after';
                r.classList.remove('d-before', 'd-after', 'd-in');
                moveNode(e.dataTransfer.getData('text/lvgl-node'), n.uid, zone);
            });
            root.append(r);
            if (hasKids && !collapsed.has(n.uid)) kids.forEach(k => row(k, depth + 1));
        };
        list.forEach(n => row(n, 0));
        layers.append(root, h('p', { class: 'pal-hint' }, 'Drag rows to reorder or nest. Lower rows are drawn on top.'));
    }
    function moveNode(uid, targetUid, zone) {
        if (!uid || uid === targetUid) return;
        const src = findNode(uid), dst = findNode(targetUid); if (!src || !dst) return;
        let inside = false; walk(src.node.children, n => { if (n.uid === targetUid) inside = true; });
        if (inside) { toast('A widget cannot be moved inside itself.'); return; }
        src.arr.splice(src.index, 1);
        const d2 = findNode(targetUid);
        if (zone === 'in') { d2.node.children.push(src.node); collapsed.delete(targetUid); }
        else d2.arr.splice(d2.index + (zone === 'after' ? 1 : 0), 0, src.node);
        // a moved widget keeps its offsets, which are now relative to the new parent
        changed('doc', true); select(uid);
    }
    function rowMenu(anchor, n) {
        const f = findNode(n.uid); if (!f) return;
        const act = (label, ic, fn) => h('button', { class: 'menu-item', onclick: () => { fn(); document.querySelectorAll('.popover').forEach(p => p.remove()); } }, icon(ic), label);
        popover(anchor, h('div', { class: 'menu' },
            act('Duplicate', 'content_copy', () => { const c = revive(JSON.parse(toJSON(n))); const reid = x => { x.uid = newUid(); if (x.props.id) x.props.id = uniqueId(String(x.props.id).replace(/_\d+$/, '')); (x.children || []).forEach(reid); }; reid(c); f.arr.splice(f.index + 1, 0, c); changed('doc', true); select(c.uid); }),
            act('Bring to front', 'flip_to_front', () => { f.arr.splice(f.index, 1); f.arr.push(n); changed('doc', true); }),
            act('Send to back', 'flip_to_back', () => { f.arr.splice(f.index, 1); f.arr.unshift(n); changed('doc', true); }),
            f.parent ? act('Move out of ' + (f.parent.props.id || f.parent.type), 'north_west', () => { const p = findNode(f.parent.uid); f.arr.splice(f.index, 1); p.arr.splice(p.index + 1, 0, n); changed('doc', true); }) : null,
            act('Wrap in container', 'select_all', () => { const c = { uid: newUid(), type: 'obj', props: { id: uniqueId('obj'), x: n.props.x, y: n.props.y, align: n.props.align, width: 'SIZE_CONTENT', height: 'SIZE_CONTENT' }, children: [n] }; ['x', 'y', 'align'].forEach(k => { if (c.props[k] === undefined) delete c.props[k]; delete n.props[k]; }); f.arr.splice(f.index, 1, c); changed('doc', true); select(c.uid); }),
            act('Delete', 'delete', () => { f.arr.splice(f.index, 1); if (app.sel === n.uid) select(null); changed('doc', true); })
        ), { align: 'right' });
    }

    // ---------------------------------------------------------------- page bar
    const SIZES = ['128x64', '128x128', '160x128', '240x240', '240x320', '320x240', '320x480', '480x320', '480x480', '480x272', '800x480', '1024x600', '1280x720'];
    function renderPages() {
        pagebar.innerHTML = '';
        const tabsEl = h('div', { class: 'pages' }, ...app.doc.pages.map((p, i) => {
            const b = h('button', { class: 'page-tab' + (!app.editTop && i === app.pageIndex ? ' on' : '') + (p.props && p.props.skip ? ' skip' : ''), title: 'Click to open · double-click to rename', onclick: () => setPage(i) }, icon('crop_portrait'), p.id);
            b.addEventListener('dblclick', () => renamePage(i));
            if (app.doc.pages.length > 1) b.append(h('i', { class: 'mi page-x', title: 'Delete page', onclick: e => { e.stopPropagation(); deletePage(i); } }, 'close'));
            return b;
        }), h('button', { class: 'page-tab add', title: 'Add page', onclick: addPage }, icon('add')),
            h('button', { class: 'page-tab layer' + (app.editTop ? ' on' : ''), title: 'top_layer: widgets shown above every page', onclick: () => { app.editTop = !app.editTop; app.sel = null; renderPages(); changed('page'); select(null); } }, icon('layers'), 'Top layer'));
        const [W, H] = [app.doc.display.width, app.doc.display.height];
        const sizeSel = h('select', { class: 'size-sel', title: 'Screen size' }, ...SIZES.map(s => h('option', { value: s, selected: s === `${W}x${H}` ? true : undefined }, s.replace('x', ' × '))));
        if (!SIZES.includes(`${W}x${H}`)) sizeSel.prepend(h('option', { value: `${W}x${H}`, selected: true }, `${W} × ${H}`));
        sizeSel.append(h('option', { value: 'custom' }, 'Custom…'));
        sizeSel.addEventListener('change', () => {
            let v = sizeSel.value;
            if (v === 'custom') { const r = prompt('Screen size in pixels (WIDTHxHEIGHT):', `${W}x${H}`); if (!r) { renderPages(); return; } v = r.trim(); }
            const m = v.match(/^(\d{2,4})\s*x\s*(\d{2,4})$/i); if (!m) { toast('Use the form 320x240.'); renderPages(); return; }
            app.doc.display.width = +m[1]; app.doc.display.height = +m[2]; changed('doc', true); renderPages(); editor.fit();
        });
        const rot = h('button', { class: 'icon-btn', title: 'Rotate (swap width and height)', onclick: () => { const d = app.doc.display; [d.width, d.height] = [d.height, d.width]; changed('doc', true); renderPages(); editor.fit(); } }, icon('screen_rotation'));
        pagebar.append(tabsEl, h('span', { class: 'grow' }), h('span', { class: 'pb-pos', id: 'pb-pos' }), sizeSel, rot);
    }
    const slug = s => String(s).trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    function addPage() { let n = app.doc.pages.length + 1, id = 'page_' + n; while (app.doc.pages.some(p => p.id === id)) id = 'page_' + (++n); app.doc.pages.push({ id, props: {}, widgets: [] }); changed('doc', true); setPage(app.doc.pages.length - 1); }
    function renamePage(i) { const p = app.doc.pages[i], v = prompt('Page id:', p.id); if (!v) return; const id = slug(v); if (app.doc.pages.some((q, j) => j !== i && q.id === id)) { toast('That page id exists.'); return; } p.id = id; changed('doc', true); renderPages(); }
    function deletePage(i) { const p = app.doc.pages[i], n = (() => { let c = 0; walk(p.widgets, () => c++); return c; })(); if (n && !confirm(`Delete page "${p.id}" and its ${n} widget${n === 1 ? '' : 's'}?`)) return; app.doc.pages.splice(i, 1); changed('doc', true); setPage(Math.min(i, app.doc.pages.length - 1)); }

    app.on(k => { if (k === 'doc' || k === 'select' || k === 'page') { renderLayers(); } if (k === 'doc' || k === 'page') renderPages(); });
    setTab(app.ui.leftTab || 'widgets');
    renderPages();
    return { renderLayers, renderPages, setTab };
}
