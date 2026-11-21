// Right panel: properties, styles and raw YAML for the selection, or page / screen settings when nothing is selected.
import { app, engine, findNode, currentPage, changed, select, allIds, saveUi, walk } from './app.js';
import { WIDGETS, STATES, ALIGNS, OUT_ALIGNS, STYLE_GROUPS, partsOf, isContainer } from './widgets.js';
import { h, icon, toast, field, colorField, opaField, numField, textField, enumField, boolField, fontField, imageField, popover } from './ui.js';
import { dump, fromNodes, toNodes, schema } from './yaml.js';
import { DEFAULT_SIZE } from './theme.js';

const BUILTIN_FONTS = ['montserrat_8', 'montserrat_10', 'montserrat_12', 'montserrat_14', 'montserrat_16', 'montserrat_18', 'montserrat_20', 'montserrat_22', 'montserrat_24', 'montserrat_26', 'montserrat_28', 'montserrat_30', 'montserrat_32', 'montserrat_34', 'montserrat_36', 'montserrat_38', 'montserrat_40', 'montserrat_42', 'montserrat_44', 'montserrat_46', 'montserrat_48', 'unscii_8', 'unscii_16', 'simsun_16_cjk', 'dejavu_16_persian_hebrew'];
export { BUILTIN_FONTS };

const prune = o => { if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && !(o[k].tag) && Object.keys(o[k]).length === 0) delete o[k]; }); };
const setKey = (obj, k, v) => { if (v === undefined) delete obj[k]; else obj[k] = v; };

// ---------------------------------------------------------------- generic style editor (also used for style definitions + theme)
export function styleEditor({ parts, getTarget, effective, onChange, showStates = true, title }) {
    const root = h('div', { class: 'style-ed' });
    const ui = app.ui;
    let part = parts.includes(ui.stylePart) ? ui.stylePart : 'main';
    let state = ui.styleState || 'default';
    function render() {
        root.innerHTML = '';
        const tgt = getTarget(part, state, false) || {};
        const eff = effective ? effective(part, state) : {};
        const top = h('div', { class: 'style-sel' },
            parts.length > 1 ? field('Part', enumField(part, parts, v => { part = v || 'main'; ui.stylePart = part; saveUi(); render(); }, { placeholder: 'main' })) : null,
            showStates ? field('State', enumField(state === 'default' ? undefined : state, STATES.filter(s => s !== 'default'), v => { state = v || 'default'; ui.styleState = state; saveUi(); if (app.sel && app.mode === 'design') { app.ui.previewState = state; changed('select-state'); } render(); }, { placeholder: 'default' })) : null);
        if (title) root.append(h('div', { class: 'ed-title' }, title));
        root.append(top);
        if (showStates && state !== 'default') root.append(h('p', { class: 'hint' }, icon('visibility'), `Editing the ${state} state. The canvas shows it while this widget is selected.`));
        STYLE_GROUPS.forEach(([gname, props]) => {
            const setCount = props.filter(([k]) => tgt[k] !== undefined).length;
            const open = setCount > 0 || ui['sg_' + gname] === true;
            const det = h('details', { class: 'sgroup', open: open ? true : undefined }, h('summary', null, gname, setCount ? h('span', { class: 'badge' }, setCount) : null));
            det.addEventListener('toggle', () => { ui['sg_' + gname] = det.open; saveUi(); });
            props.forEach(([k, type, opts]) => {
                const v = tgt[k], ph = eff[k];
                const set = (val, live) => { const t = getTarget(part, state, true); setKey(t, k, val); onChange(!!live); if (!live) render(); };
                let input;
                if (type === 'color') input = colorField(v, set, { placeholder: ph });
                else if (type === 'opa') input = opaField(v, set, { placeholder: ph });
                else if (type === 'enum') input = enumField(v, opts, set, { placeholder: ph !== undefined ? String(ph) : undefined });
                else if (type === 'bool') input = boolField(v, set, { placeholder: ph });
                else if (type === 'font') input = fontField(v, set, BUILTIN_FONTS, { placeholder: ph });
                else if (type === 'image') input = imageField(v, set);
                else input = numField(v, set, { placeholder: ph !== undefined && typeof ph !== 'object' ? (ph > 30000 ? 'circle' : ph) : '', allowText: k.startsWith('translate') });
                det.append(field(k, input, { set: v !== undefined, onReset: () => set(undefined) }));
            });
            root.append(det);
        });
        if (part === 'main' && showStates) {
            const r = h('div', { class: 'radius-presets' }, h('span', null, 'Radius'), ...[['0', 0], ['8', 8], ['16', 16], ['pill', 0x7FFF]].map(([l, v]) => h('button', { class: 'chip', onclick: () => { const t = getTarget(part, state, true); t.radius = v; onChange(); render(); } }, l)));
            root.prepend(r);
        }
    }
    render();
    return root;
}

function sizeField(value, onChange, def) {
    const unit = value === undefined ? 'default' : (typeof value === 'string' && /%$/.test(value)) ? '%' : (typeof value === 'string' && /size_content/i.test(value)) ? 'content' : 'px';
    const n = unit === 'px' ? value : unit === '%' ? parseFloat(value) : '';
    const wrap = h('div', { class: 'f-size' });
    const num = h('input', { type: 'number', value: n === undefined ? '' : n, placeholder: unit === 'default' ? String(def) : unit === 'content' ? 'auto' : '', disabled: unit === 'content' || unit === 'default' ? true : undefined });
    const sel = h('select', null, ...[['px', 'px'], ['%', '%'], ['content', 'content'], ['default', 'default']].map(([v, l]) => h('option', { value: v, selected: v === unit ? true : undefined }, l)));
    const emit = () => { const u = sel.value, x = num.value === '' ? null : Number(num.value); num.disabled = u === 'content' || u === 'default'; if (u === 'default') onChange(undefined); else if (u === 'content') onChange('SIZE_CONTENT'); else if (x === null) return; else onChange(u === '%' ? `${x}%` : x); };
    num.addEventListener('change', emit); sel.addEventListener('change', () => { if (sel.value === '%' && num.value === '') num.value = 100; emit(); });
    wrap.append(num, sel); return wrap;
}

export function createInspector() {
    const el = document.getElementById('right');
    let tab = app.ui.inspectorTab || 'props';
    function render() {
        el.innerHTML = '';
        const f = app.sel && findNode(app.sel);
        if (!f) return renderScreen();
        const n = f.node, def = WIDGETS[n.type] || { label: n.type, icon: 'help_outline', props: [], parts: ['main'] };
        el.append(h('div', { class: 'insp-head' }, icon(def.icon), h('div', { class: 'ih-t' }, h('b', null, n.props.id || '(no id)'), h('span', null, def.label + ' · ' + n.type)),
            h('button', { class: 'icon-btn', title: 'Select parent (Esc)', disabled: f.parent ? undefined : true, onclick: () => f.parent && select(f.parent.uid) }, icon('north_west')),
            h('button', { class: 'icon-btn', title: 'Delete (Del)', onclick: () => { f.arr.splice(f.index, 1); select(null); changed('doc', true); } }, icon('delete'))));
        const tabs = h('div', { class: 'tabs small' }, ...[['props', 'tune', 'Properties'], ['style', 'palette', 'Style'], ['yaml', 'code', 'YAML']].map(([k, ic, l]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; app.ui.inspectorTab = k; saveUi(); render(); } }, icon(ic), l)));
        el.append(tabs);
        const body = h('div', { class: 'insp-body' }); el.append(body);
        if (tab === 'props') body.append(propsPanel(f, def));
        else if (tab === 'style') body.append(styleEditor({
            parts: partsOf(n.type),
            getTarget: (part, state, create) => {
                let t = n.props;
                if (part !== 'main') { if (!t[part] || typeof t[part] !== 'object') { if (!create) return null; t[part] = {}; } t = t[part]; }
                if (state !== 'default') { if (!t[state] || typeof t[state] !== 'object') { if (!create) return null; t[state] = {}; } t = t[state]; }
                return t;
            },
            effective: (part, state) => { const s = new Set(state === 'default' ? [] : [state]); const st = engine.cur.resolve(n, part, s, null); return st; },
            onChange: live => { prune(n.props); Object.keys(n.props).forEach(k => n.props[k] && typeof n.props[k] === 'object' && prune(n.props[k])); changed(live ? 'style' : 'doc'); }
        }), stylesChips(n));
        else body.append(yamlPanel(f));
    }

    function stylesChips(n) {
        const cur = [].concat(n.props.styles || []);
        const box = h('div', { class: 'styles-chips' }, h('span', { class: 'f-label' }, 'Style definitions (styles:)'),
            ...cur.map(id => h('span', { class: 'chip on' }, id, h('i', { class: 'mi', onclick: () => { const nx = cur.filter(x => x !== id); if (nx.length) n.props.styles = nx.length === 1 ? nx[0] : nx; else delete n.props.styles; changed('doc'); render(); } }, 'close'))));
        const avail = app.doc.styleDefs.map(s => s.id).filter(id => !cur.includes(id));
        if (avail.length) box.append(enumField(undefined, avail, v => { if (!v) return; const nx = cur.concat(v); n.props.styles = nx.length === 1 ? nx[0] : nx; changed('doc'); render(); }, { placeholder: '+ apply a style' }));
        else box.append(h('small', null, app.doc.styleDefs.length ? '' : 'Create reusable styles in Assets → Styles.'));
        return box;
    }

    function propsPanel(f, def) {
        const n = f.node, p = n.props, box = h('div');
        const upd = (k, v, hist) => { setKey(p, k, v); changed('doc', hist); };
        const sec = (title, ...kids) => h('section', { class: 'psec' }, h('h4', null, title), ...kids);
        const idIn = h('input', { type: 'text', value: p.id || '', spellcheck: 'false' });
        idIn.addEventListener('change', () => {
            const v = idIn.value.trim().replace(/[^a-zA-Z0-9_]/g, '_');
            if (!v) { delete p.id; changed('doc', true); return render(); }
            if (/^\d/.test(v)) { toast('IDs cannot start with a digit.'); idIn.value = p.id || ''; return; }
            if (v !== p.id && allIds().has(v)) { toast('That ID is already used.'); idIn.value = p.id || ''; return; }
            p.id = v; changed('doc', true); render();
        });
        box.append(sec('Identity', field('id', idIn)));

        // geometry
        const ds = DEFAULT_SIZE[n.type] || [100, 50];
        const parentHasLayout = (() => { const o = f.parent ? f.parent.props : currentPage().props; return !!(o && o.layout && !(typeof o.layout === 'object' && /none/i.test(o.layout.type || ''))) || (f.parent && f.parent.type === 'list'); })();
        const geo = sec('Position & size',
            parentHasLayout ? h('p', { class: 'hint' }, icon('info'), 'Placed by the parent layout. x / y apply only when floating.') : null,
            field('align', enumField(p.align, ALIGNS, v => upd('align', v, true), { placeholder: 'TOP_LEFT' })),
            h('div', { class: 'two' }, field('x', numField(p.x, v => upd('x', v), { allowText: true, placeholder: 0 })), field('y', numField(p.y, v => upd('y', v), { allowText: true, placeholder: 0 }))),
            h('div', { class: 'two' }, field('width', sizeField(p.width, v => upd('width', v, true), ds[0])), field('height', sizeField(p.height, v => upd('height', v, true), ds[1]))));
        box.append(geo);
        // align_to
        const at = p.align_to || {};
        const ids = [...allIds()].filter(id => id !== p.id);
        const atBox = h('details', { class: 'sgroup', open: p.align_to ? true : undefined }, h('summary', null, 'Align to another widget'),
            field('target', enumField(at.id, ids, v => { if (!v) delete p.align_to; else p.align_to = { ...at, id: v, align: at.align || 'OUT_BOTTOM_MID' }; changed('doc', true); render(); }, { placeholder: 'none' })),
            p.align_to ? field('align', enumField(at.align, OUT_ALIGNS.concat(ALIGNS), v => { p.align_to.align = v || 'OUT_BOTTOM_MID'; changed('doc'); })) : null,
            p.align_to ? h('div', { class: 'two' }, field('x', numField(at.x, v => { setKey(p.align_to, 'x', v); changed('doc'); })), field('y', numField(at.y, v => { setKey(p.align_to, 'y', v); changed('doc'); }))) : null);
        geo.append(atBox);

        // widget specific
        if (def.props && def.props.length) {
            const s = sec(def.label);
            def.props.forEach(([k, type, opts]) => {
                const v = p[k], set = val => upd(k, val);
                let input;
                if (type === 'text') input = textField(v, set, { keepEmpty: k === 'text' });
                else if (type === 'textarea') input = textField(v, set, { multiline: true, keepEmpty: true });
                else if (type === 'bool') input = boolField(v, set);
                else if (type === 'enum') input = enumField(v, opts, set);
                else if (type === 'color') input = colorField(v, set);
                else if (type === 'image') input = imageField(v, v2 => { set(v2); });
                else if (type === 'pct') input = numField(typeof v === 'string' ? parseFloat(v) : v, val => set(val === undefined ? undefined : `${val}%`), { placeholder: '100', min: 0, max: 100 });
                else if (type === 'options') { input = h('textarea', { rows: 4, spellcheck: 'false', placeholder: 'One option per line' }); input.value = Array.isArray(v) ? v.join('\n') : (v || ''); input.addEventListener('change', () => { const lines = input.value.split('\n').map(x => x.trimEnd()).filter(x => x !== ''); set(lines.length ? lines : undefined); }); }
                else if (type === 'points') { input = h('textarea', { rows: 4, spellcheck: 'false', placeholder: 'x, y per line' }); input.value = (Array.isArray(v) ? v : []).map(q => typeof q === 'object' ? `${q.x}, ${q.y}` : String(q)).join('\n'); input.addEventListener('change', () => { const pts = input.value.split('\n').map(x => x.trim()).filter(x => /^-?\d+\s*,\s*-?\d+$/.test(x)).map(x => x.replace(/\s+/g, '').replace(',', ', ')); set(pts.length ? pts : undefined); }); }
                else input = numField(v, set, { allowText: k === 'rotation' || k === 'scale' ? false : false, step: k === 'scale' ? 0.1 : 1 });
                s.append(field(k, input, { set: v !== undefined }));
            });
            if (n.type === 'image' && !app.doc.images.length) s.append(h('p', { class: 'hint' }, icon('image'), 'Add images in ', h('a', { href: '#', onclick: e => { e.preventDefault(); app.openAssets && app.openAssets('images'); } }, 'Assets → Images'), '.'));
            if (['tabview', 'tileview', 'buttonmatrix', 'table', 'meter', 'animimg'].includes(n.type)) s.append(h('p', { class: 'hint' }, icon('code'), 'Tabs, tiles, rows, cells and scales are edited in the YAML tab.'));
            box.append(s);
        }
        // states + flags
        const stateObj = p.state && typeof p.state === 'object' ? p.state : {};
        const setState = (k, v) => { const s2 = { ...(p.state || {}) }; if (v) s2[k] = true; else delete s2[k]; if (Object.keys(s2).length) p.state = s2; else delete p.state; changed('doc', true); render(); };
        box.append(sec('State & flags',
            h('div', { class: 'checks' },
                ...['checked', 'disabled', 'focused'].map(k => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: stateObj[k] === true ? true : undefined, onchange: e => setState(k, e.target.checked) }), 'state: ' + k)),
                ...['hidden', 'clickable', 'checkable', 'scrollable', 'floating', 'ignore_layout'].map(k => h('label', { class: 'chk', title: k === 'clickable' || k === 'scrollable' ? 'Untick to set it false' : '' },
                    h('input', { type: 'checkbox', checked: (p[k] === true || (p[k] === undefined && (k === 'clickable' || k === 'scrollable') && !['label', 'image', 'container'].includes(n.type))) ? true : undefined, onchange: e => { const on = e.target.checked; const dflt = (k === 'clickable' || k === 'scrollable') && !['label', 'image', 'container'].includes(n.type); upd(k, on === dflt ? undefined : on, true); render(); } }), k)))));

        // layout (containers)
        if (isContainer(n.type) || n.type === 'obj') box.append(layoutSection(p, () => { changed('doc', true); render(); }));
        if (parentHasLayout) {
            const o = f.parent ? f.parent.props.layout : currentPage().props.layout;
            const grid = typeof o === 'string' ? /x/i.test(o) : o && /grid/i.test(o.type || '');
            box.append(grid ? sec('Grid cell', h('div', { class: 'two' }, field('row', numField(p.grid_cell_row_pos, v => upd('grid_cell_row_pos', v), { min: 0 })), field('column', numField(p.grid_cell_column_pos, v => upd('grid_cell_column_pos', v), { min: 0 }))),
                h('div', { class: 'two' }, field('row span', numField(p.grid_cell_row_span, v => upd('grid_cell_row_span', v), { min: 1 })), field('col span', numField(p.grid_cell_column_span, v => upd('grid_cell_column_span', v), { min: 1 }))),
                h('div', { class: 'two' }, field('x align', enumField(p.grid_cell_x_align, ['START', 'END', 'CENTER', 'STRETCH'], v => upd('grid_cell_x_align', v))), field('y align', enumField(p.grid_cell_y_align, ['START', 'END', 'CENTER', 'STRETCH'], v => upd('grid_cell_y_align', v)))))
                : sec('Flex item', field('flex_grow', numField(p.flex_grow, v => upd('flex_grow', v), { min: 0 }))));
        }
        box.append(eventsSection(n, render));
        return box;
    }

    function layoutSection(props, done) {
        const l = props.layout, type = !l ? 'NONE' : typeof l === 'string' ? (/x/i.test(l) ? 'GRID' : l.toUpperCase()) : String(l.type || 'NONE').toUpperCase();
        const obj = () => { if (!props.layout || typeof props.layout !== 'object') props.layout = { type: type.toLowerCase() }; return props.layout; };
        const set = (k, v) => { const o = obj(); setKey(o, k, v); done(); };
        const s = h('section', { class: 'psec' }, h('h4', null, 'Layout (children)'),
            field('type', enumField(type === 'NONE' ? undefined : type, ['FLEX', 'GRID'], v => { if (!v) delete props.layout; else props.layout = v === 'FLEX' ? { type: 'flex', flex_flow: 'ROW_WRAP' } : { type: 'grid', grid_rows: ['fr(1)', 'fr(1)'], grid_columns: ['fr(1)', 'fr(1)'] }; done(); }, { placeholder: 'NONE (free x / y)' })));
        if (type === 'FLEX' && typeof l === 'object') {
            const A = ['START', 'END', 'CENTER', 'SPACE_EVENLY', 'SPACE_AROUND', 'SPACE_BETWEEN'];
            s.append(field('flex_flow', enumField(l.flex_flow, ['ROW', 'COLUMN', 'ROW_WRAP', 'COLUMN_WRAP', 'ROW_REVERSE', 'COLUMN_REVERSE', 'ROW_WRAP_REVERSE', 'COLUMN_WRAP_REVERSE'], v => set('flex_flow', v), { placeholder: 'ROW_WRAP' })),
                field('align main', enumField(l.flex_align_main, A, v => set('flex_align_main', v), { placeholder: 'START' })),
                field('align cross', enumField(l.flex_align_cross, ['START', 'END', 'CENTER', 'STRETCH'], v => set('flex_align_cross', v), { placeholder: 'START' })),
                field('align track', enumField(l.flex_align_track, ['START', 'END', 'CENTER'], v => set('flex_align_track', v), { placeholder: 'START' })),
                h('div', { class: 'two' }, field('pad_row', numField(l.pad_row, v => set('pad_row', v))), field('pad_column', numField(l.pad_column, v => set('pad_column', v)))));
        }
        if (type === 'GRID') {
            if (typeof l === 'string') s.append(h('p', { class: 'hint' }, icon('grid_on'), `Shorthand "${l}" (rows × columns). `, h('a', { href: '#', onclick: e => { e.preventDefault(); const m = l.match(/^(\d*)x(\d*)$/i); props.layout = { type: 'grid', grid_rows: Array(+m[1] || 1).fill('fr(1)'), grid_columns: Array(+m[2] || 1).fill('fr(1)') }; done(); } }, 'Expand to edit')));
            else {
                const tr = v => Array.isArray(v) ? v.join(', ') : (v ?? '');
                const parseTr = v => { const a = v.split(',').map(x => x.trim()).filter(Boolean).map(x => /^\d+$/.test(x) ? +x : x.toLowerCase()); return a.length ? a : undefined; };
                const A = ['START', 'END', 'CENTER', 'SPACE_EVENLY', 'SPACE_AROUND', 'SPACE_BETWEEN'];
                s.append(field('grid_rows', textField(tr(l.grid_rows), v => set('grid_rows', v ? parseTr(v) : undefined), { placeholder: 'e.g. 40, fr(1), content' })),
                    field('grid_columns', textField(tr(l.grid_columns), v => set('grid_columns', v ? parseTr(v) : undefined), { placeholder: 'e.g. fr(1), fr(2)' })),
                    h('div', { class: 'two' }, field('row align', enumField(l.grid_row_align, A, v => set('grid_row_align', v))), field('column align', enumField(l.grid_column_align, A, v => set('grid_column_align', v)))),
                    h('div', { class: 'two' }, field('pad_row', numField(l.pad_row, v => set('pad_row', v))), field('pad_column', numField(l.pad_column, v => set('pad_column', v)))));
            }
        }
        return s;
    }

    function eventsSection(n, rerender) {
        const trig = Object.keys(n.props).filter(k => /^on_/.test(k));
        const s = h('section', { class: 'psec' }, h('h4', null, 'Events'));
        trig.forEach(t => { const v = n.props[t]; const steps = Array.isArray(v) ? v : (v && Array.isArray(v.then) ? v.then : []); s.append(h('div', { class: 'ev' }, h('code', null, t), h('span', null, steps.map(x => x && typeof x === 'object' ? Object.keys(x)[0] : String(x)).join(' → ') || '(see YAML)'), h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { delete n.props[t]; changed('doc', true); rerender(); } }, icon('close')))); });
        const pages = app.doc.pages.map(p => p.id), ids = [...allIds()];
        const add = h('button', { class: 'btn sm', onclick: e => {
            const pick = (trigger, step) => { const cur = n.props[trigger]; const then = cur && Array.isArray(cur.then) ? cur.then : Array.isArray(cur) ? cur : []; then.push(step); n.props[trigger] = { then }; changed('doc', true); rerender(); document.querySelectorAll('.popover').forEach(p => p.remove()); };
            const trg = h('select', null, ...['on_click', 'on_press', 'on_release', 'on_long_press', 'on_value'].map(t => h('option', null, t)));
            const mk = (label, fn) => h('button', { class: 'menu-item', onclick: () => fn(trg.value) }, label);
            popover(e.currentTarget, h('div', { class: 'menu' }, h('label', { class: 'field' }, h('span', { class: 'f-label' }, 'Trigger'), trg),
                mk('Go to next page', t => pick(t, { 'lvgl.page.next': null })), mk('Go to previous page', t => pick(t, { 'lvgl.page.previous': null })),
                ...pages.map(pid => mk(`Show page "${pid}"`, t => pick(t, { 'lvgl.page.show': pid }))),
                ...ids.slice(0, 12).map(id => mk(`Hide ${id}`, t => pick(t, { 'lvgl.widget.hide': id }))),
                ...ids.slice(0, 12).map(id => mk(`Show ${id}`, t => pick(t, { 'lvgl.widget.show': id })))), { align: 'right', cls: 'menu-pop' });
        } }, icon('bolt'), 'Add action');
        s.append(add, h('p', { class: 'hint' }, 'Try them in ', h('b', null, 'Interact'), ' mode. Lambdas and other actions are kept but not simulated.'));
        return s;
    }

    function yamlPanel(f) {
        const ta = h('textarea', { class: 'code', spellcheck: 'false' }); ta.value = dump(fromNodes([f.node]));
        const msg = h('span', { class: 'msg' });
        const apply = () => {
            try {
                const parsed = globalThis.jsyaml.load(ta.value, { schema: schema() });
                const nodes = toNodes(Array.isArray(parsed) ? parsed : [parsed]);
                if (nodes.length !== 1) throw new Error('Expected exactly one widget (a single "- type:" item).');
                const nn = nodes[0]; nn.uid = f.node.uid; f.arr[f.index] = nn; changed('doc', true); msg.textContent = 'Applied.'; msg.className = 'msg ok';
            } catch (e) { msg.textContent = (e.mark ? `Line ${e.mark.line + 1}: ` : '') + (e.reason || e.message); msg.className = 'msg bad'; }
        };
        ta.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); apply(); } });
        return h('div', { class: 'yaml-tab' }, h('p', { class: 'hint' }, 'Everything about this widget, including children, events and lambdas. Ctrl+Enter applies.'), ta, h('div', { class: 'row' }, h('button', { class: 'btn primary sm', onclick: apply }, icon('check'), 'Apply'), msg));
    }

    // ---------------------------------------------------------------- nothing selected: page + screen settings
    function renderScreen() {
        const page = app.editTop ? (app.doc.topLayer || (app.doc.topLayer = { props: {}, widgets: [] })) : currentPage(), p = page.props;
        el.append(h('div', { class: 'insp-head' }, icon(app.editTop ? 'layers' : 'crop_portrait'), h('div', { class: 'ih-t' }, h('b', null, app.editTop ? 'Top layer' : page.id), h('span', null, app.editTop ? 'Shown above every page' : 'Page · select a widget to edit it'))));
        const body = h('div', { class: 'insp-body' }); el.append(body);
        const tabsEl = h('div', { class: 'tabs small' }, ...[['props', 'tune', 'Page'], ['style', 'palette', 'Background'], ['yaml', 'settings', 'Screen & LVGL']].map(([k, ic, l]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; app.ui.inspectorTab = k; saveUi(); render(); } }, icon(ic), l)));
        el.insertBefore(tabsEl, body);
        if (tab === 'style') {
            body.append(styleEditor({ parts: ['main'], showStates: false, getTarget: () => p, effective: () => engine.cur.screen(app.editTop ? null : page, app.doc.lvglTop), onChange: live => changed(live ? 'style' : 'doc') }));
            return;
        }
        if (tab === 'yaml') {
            const top = app.doc.lvglTop, setTop = (k, v) => { setKey(top, k, v); changed('doc', true); };
            body.append(
                h('section', { class: 'psec' }, h('h4', null, 'Display'),
                    h('div', { class: 'two' }, field('width', numField(app.doc.display.width, v => { if (v > 0) { app.doc.display.width = v; changed('doc', true); } })), field('height', numField(app.doc.display.height, v => { if (v > 0) { app.doc.display.height = v; changed('doc', true); } })))),
                h('section', { class: 'psec' }, h('h4', null, 'Theme'),
                    h('label', { class: 'chk big' }, h('input', { type: 'checkbox', checked: app.doc.theme.dark_mode ? true : undefined, onchange: e => { app.doc.theme.dark_mode = e.target.checked; changed('doc', true); } }), 'dark_mode (LVGL dark theme)'),
                    h('button', { class: 'btn sm', onclick: () => app.openAssets && app.openAssets('theme') }, icon('format_paint'), 'Per-widget theme styles…')),
                h('section', { class: 'psec' }, h('h4', null, 'lvgl: settings'),
                    field('default_font', fontField(top.default_font, v => setTop('default_font', v), BUILTIN_FONTS, { placeholder: 'montserrat_14' })),
                    field('buffer_size', textField(top.buffer_size, v => setTop('buffer_size', v), { placeholder: '100% (25% without PSRAM)' })),
                    field('rotation', enumField(top.rotation !== undefined ? String(top.rotation) : undefined, ['0', '90', '180', '270'], v => setTop('rotation', v === undefined ? undefined : Number(v)))),
                    field('page_wrap', boolField(top.page_wrap, v => setTop('page_wrap', v), { placeholder: 'true' })),
                    field('debug_outline', boolField(top.debug_outline, v => setTop('debug_outline', v), { placeholder: 'false' })),
                    h('p', { class: 'hint' }, 'Other lvgl: keys from an imported file (touchscreens, displays, encoders…) are kept as they are.')));
            return;
        }
        if (!app.editTop) body.append(h('section', { class: 'psec' }, h('h4', null, 'Page'),
            field('id', (() => { const i = h('input', { type: 'text', value: page.id }); i.addEventListener('change', () => { const v = i.value.trim().replace(/[^a-zA-Z0-9_]/g, '_'); if (!v || app.doc.pages.some(q => q !== page && q.id === v)) { toast('Invalid or duplicate page id.'); i.value = page.id; return; } page.id = v; changed('doc', true); }); return i; })()),
            field('skip', boolField(p.skip, v => { setKey(p, 'skip', v); changed('doc', true); }, { placeholder: 'false' }))));
        body.append(layoutSection(p, () => { changed('doc', true); render(); }));
        const counts = {}; let total = 0; walk(page.widgets, n => { counts[n.type] = (counts[n.type] || 0) + 1; total++; });
        body.append(h('section', { class: 'psec' }, h('h4', null, `Widgets on this ${app.editTop ? 'layer' : 'page'} (${total})`), h('div', { class: 'chips' }, ...Object.entries(counts).map(([t, c]) => h('span', { class: 'chip' }, `${t} × ${c}`)))));
    }
    app.on(k => { if (k === 'select' || k === 'doc' || k === 'page') render(); if (k === 'geometry') { const f = app.sel && findNode(app.sel); if (f && tab === 'props') { const xs = el.querySelectorAll('.two input[type=text]'); if (xs[0]) xs[0].value = f.node.props.x ?? ''; if (xs[1]) xs[1].value = f.node.props.y ?? ''; } } });
    render();
    return { render };
}
