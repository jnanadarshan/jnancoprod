// Assets dialog: images, colours, fonts, style definitions, theme overrides, gradients.
import { app, engine, changed, addImageFile, refreshImage, renameImage, loadFontFace, allNodes, currentPage, findNode, createWidget, currentList, select, walk } from './app.js';
import { WIDGETS, partsOf } from './widgets.js';
import { themeStyle } from './theme.js';
import { h, icon, modal, toast, field, enumField, numField, textField, colorField } from './ui.js';
import { styleEditor } from './inspector.js';
import { dump, schema, normColors } from './yaml.js';

const slug = s => String(s || 'img').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'i_$1') || 'img';
const validId = id => /^[A-Za-z_]\w*$/.test(id);

export function openAssets(tab = 'images') {
    const tabs = [['images', 'image', 'Images'], ['colors', 'palette', 'Colors'], ['fonts', 'font_download', 'Fonts'], ['styles', 'style', 'Styles'], ['theme', 'format_paint', 'Theme'], ['gradients', 'gradient', 'Gradients']];
    const nav = h('div', { class: 'tabs' }), pane = h('div', { class: 'assets-pane' });
    const m = modal({ title: 'Assets', iconName: 'inventory_2', wide: true, tall: true, body: h('div', { class: 'assets' }, nav, pane), cls: 'assets-modal' });
    const show = t => { tab = t; nav.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t)); pane.innerHTML = ''; ({ images, colors, fonts, styles, theme, gradients })[t](pane, () => show(t)); };
    tabs.forEach(([k, ic, l]) => nav.append(h('button', { class: 'tab', 'data-t': k, onclick: () => show(k) }, icon(ic), l)));
    show(tab);
    return m;
}

// ---------------------------------------------------------------- images
function images(pane, rerender) {
    const W = app.doc.display.width, H = app.doc.display.height;
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const drop = h('div', { class: 'dropzone' }, icon('add_photo_alternate'), h('div', null, h('b', null, 'Drop images here'), ' or ', h('a', { href: '#', onclick: e => { e.preventDefault(); input.click(); } }, 'choose files')), h('small', null, 'PNG with transparency, JPG, SVG… They are stored in this browser. ESPHome converts them at compile time.'), input);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
    input.addEventListener('change', () => addFiles([...input.files]));
    async function addFiles(files) {
        for (const file of files.filter(f => /^image\//.test(f.type))) {
            let id = slug(file.name), i = 2; while (app.doc.images.some(x => x.id === id)) id = slug(file.name) + '_' + i++;
            const meta = { id, file: 'images/' + file.name.replace(/[^\w.-]+/g, '_'), type: 'RGB565', resize: '', transparency: 'opaque', platform: 'file', extra: {} };
            app.doc.images.push(meta);
            const img = await addImageFile(file, id);
            if (img) {
                // sensible defaults: fit large images to the screen, keep transparency of PNGs
                if (img.width > W || img.height > H) meta.resize = `${W}x${H}`;
                if (/png|svg|webp|gif/i.test(file.type) && hasAlpha(img)) meta.transparency = 'alpha_channel';
                refreshImage(id);
            }
        }
        changed('doc', true); rerender();
    }
    pane.append(drop);
    if (!app.doc.images.length) { pane.append(h('p', { class: 'empty' }, 'No images yet. Use them in an Image widget (src) or as a background (bg_image_src) on any widget or page.')); return; }
    const grid = h('div', { class: 'img-grid' });
    app.doc.images.forEach((meta, idx) => {
        const proc = app.images.get(meta.id);
        const thumb = h('div', { class: 'img-thumb' });
        if (proc) { const c = document.createElement('canvas'); c.width = proc.width; c.height = proc.height; c.getContext('2d').drawImage(proc, 0, 0); thumb.append(c); }
        else thumb.append(h('div', { class: 'missing' }, icon('broken_image'), h('span', null, 'No file in this browser')));
        const bytes = proc ? proc.width * proc.height * (String(meta.type).toUpperCase() === 'BINARY' ? 1 / 8 : String(meta.type).toUpperCase() === 'GRAYSCALE' ? 1 : 2) * (meta.transparency === 'alpha_channel' && meta.type !== 'BINARY' ? 1.5 : 1) : 0;
        const idIn = h('input', { type: 'text', value: meta.id, spellcheck: 'false' });
        idIn.addEventListener('change', () => { const v = idIn.value.trim(); if (!validId(v) || app.doc.images.some(x => x !== meta && x.id === v)) { toast('Invalid or duplicate image id.'); idIn.value = meta.id; return; } renameImage(meta.id, v); meta.id = v; refreshImage(v); changed('doc', true); rerender(); });
        const replace = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return; await addImageFile(f, meta.id); if (!meta.file || meta.file.startsWith('images/')) meta.file = 'images/' + f.name.replace(/[^\w.-]+/g, '_'); changed('doc', true); rerender(); } });
        const upd = (k, v) => { if (v === undefined || v === '') { if (k === 'resize') meta.resize = ''; else delete meta[k]; } else meta[k] = v; refreshImage(meta.id); changed('doc', true); rerender(); };
        const uses = (() => { let c = 0; const scan = o => { if (Array.isArray(o)) o.forEach(scan); else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if ((k === 'src' || k === 'bg_image_src') && (o[k] === meta.id || (Array.isArray(o[k]) && o[k].includes(meta.id)))) c++; else scan(o[k]); }); }; allNodes().forEach(n => scan(n.props)); app.doc.pages.forEach(p => scan(p.props)); scan(app.doc.styleDefs); return c; })();
        grid.append(h('div', { class: 'img-card' }, thumb,
            h('div', { class: 'img-meta' },
                field('id', idIn),
                field('file', textField(meta.file, v => upd('file', v), { placeholder: 'images/picture.png' })),
                h('div', { class: 'two' }, field('type', enumField(meta.type, ['RGB565', 'RGB', 'GRAYSCALE', 'BINARY'], v => upd('type', v || 'RGB565'))), field('transparency', enumField(meta.transparency, ['opaque', 'chroma_key', 'alpha_channel'], v => upd('transparency', v || 'opaque')))),
                field('resize', textField(meta.resize, v => upd('resize', v && /^\d+x\d+$/i.test(v.trim()) ? v.trim() : ''), { placeholder: `e.g. ${W}x${H} (keeps aspect)` })),
                h('p', { class: 'hint' }, proc ? `${proc.width}×${proc.height} px · ≈ ${(bytes / 1024).toFixed(1)} KB flash · used ${uses}×` : 'Upload the file to preview it.', String(meta.type).toUpperCase() !== 'RGB565' ? ' · LVGL needs RGB565.' : ''),
                h('div', { class: 'row wrap' },
                    h('button', { class: 'btn sm', onclick: () => { const p = currentPage().props; p.bg_image_src = meta.id; changed('doc', true); toast(`Page background set to <b>${meta.id}</b>`); } }, icon('wallpaper'), 'Page background'),
                    h('button', { class: 'btn sm', onclick: () => { const n = createWidget('image'); n.props.src = meta.id; currentList().push(n); changed('doc', true); select(n.uid); toast(`Image widget added`); } }, icon('add_photo_alternate'), 'Add widget'),
                    app.sel && findNode(app.sel) ? h('button', { class: 'btn sm', onclick: () => { const f = findNode(app.sel); if (f.node.type === 'image') f.node.props.src = meta.id; else f.node.props.bg_image_src = meta.id; changed('doc', true); toast(`Applied to <b>${f.node.props.id || f.node.type}</b>`); } }, icon('ads_click'), 'Use on selection') : null,
                    h('button', { class: 'btn sm', onclick: () => replace.click() }, icon('upload'), proc ? 'Replace' : 'Upload file'), replace,
                    h('button', { class: 'btn sm danger', onclick: () => { if (uses && !confirm(`${meta.id} is used ${uses} time(s). Remove it?`)) return; app.doc.images.splice(idx, 1); app.idb.del('img:' + meta.id); app.images.delete(meta.id); changed('doc', true); rerender(); } }, icon('delete'))))));
    });
    pane.append(grid);
}
function hasAlpha(img) { try { const c = document.createElement('canvas'); const w = Math.min(img.width, 128), hh = Math.min(img.height, 128); c.width = w; c.height = hh; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, hh); const d = x.getImageData(0, 0, w, hh).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true; } catch (e) { /* ignore */ } return false; }

// ---------------------------------------------------------------- colors (ESPHome color: component)
function colors(pane, rerender) {
    pane.append(h('p', { class: 'lead' }, 'Named colours become an ESPHome ', h('code', null, 'color:'), ' block. Use the id anywhere a colour is accepted (it shows up in every colour field).'));
    const list = h('div', { class: 'list' });
    app.doc.colors.forEach((c, i) => {
        const idIn = h('input', { type: 'text', value: c.id, spellcheck: 'false' });
        idIn.addEventListener('change', () => { const v = idIn.value.trim(); if (!validId(v) || app.doc.colors.some(x => x !== c && x.id === v)) { toast('Invalid or duplicate id.'); idIn.value = c.id; return; } const old = c.id; c.id = v; replaceValue(old, v); changed('doc', true); });
        list.append(h('div', { class: 'list-row' }, h('span', { class: 'swatch', style: { background: engine.cur.color(c.hex, '#000') } }), idIn, colorField(c.hex, (v, live) => { c.hex = v; changed(live ? 'style' : 'doc'); if (!live) rerender(); }), h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { app.doc.colors.splice(i, 1); changed('doc', true); rerender(); } }, icon('delete'))));
    });
    pane.append(list, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { let n = app.doc.colors.length + 1, id = 'color_' + n; while (app.doc.colors.some(x => x.id === id)) id = 'color_' + (++n); app.doc.colors.push({ id, hex: '0x2196F3' }); changed('doc', true); rerender(); } }, icon('add'), 'Add colour')),
        h('h4', null, 'LVGL default theme palette'), h('div', { class: 'chips' }, ...Object.entries(engine.cur.palette()).filter(([k]) => ['primary', 'secondary', 'scr', 'card', 'text', 'grey', 'border'].includes(k)).map(([k, v]) => h('span', { class: 'chip' }, h('span', { class: 'swatch sm', style: { background: v } }), `${k} ${v}`))));
}
function replaceValue(oldV, newV) { const fix = o => { if (Array.isArray(o)) o.forEach(fix); else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (o[k] === oldV && /color$|^text_font$/.test(k)) o[k] = newV; else fix(o[k]); }); }; allNodes().forEach(n => fix(n.props)); app.doc.pages.forEach(p => fix(p.props)); fix(app.doc.styleDefs); fix(app.doc.theme); fix(app.doc.lvglTop); }

// ---------------------------------------------------------------- fonts
function fonts(pane, rerender) {
    pane.append(h('p', { class: 'lead' }, 'LVGL already includes ', h('code', null, 'montserrat_8 … 48'), '. Add custom fonts for other typefaces, sizes or icons; they become a ', h('code', null, 'font:'), ' block and can be picked as ', h('code', null, 'text_font'), '.'));
    const list = h('div', { class: 'font-list' });
    const usage = id => allNodes().filter(n => JSON.stringify(n.props).includes(`"${id}"`)).length;
    app.doc.fonts.forEach((f, i) => {
        const set = (k, v) => { f[k] = v; loadFontFace(f); changed('doc', true); rerender(); };
        const fam = f.kind === 'icons' ? '"Material Symbols Outlined"' : f.kind === 'gfonts' ? `"${f.family}"` : `"lvf_${f.id}", sans-serif`;
        const sample = f.kind === 'icons' ? h('span', { class: 'ms-sample', style: { fontFamily: fam, fontSize: Math.min(f.size, 36) + 'px' } }, 'home thermostat lightbulb') : h('span', { style: { fontFamily: fam, fontSize: Math.min(f.size, 36) + 'px' } }, 'Aa Bb 0123 °C');
        const idIn = h('input', { type: 'text', value: f.id, spellcheck: 'false' });
        idIn.addEventListener('change', () => { const v = idIn.value.trim(); if (!validId(v) || app.doc.fonts.some(x => x !== f && x.id === v) || /^montserrat_/.test(v)) { toast('Invalid or duplicate font id.'); idIn.value = f.id; return; } const old = f.id; f.id = v; replaceValue(old, v); changed('doc', true); rerender(); });
        const up = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', hidden: true, onchange: async e => { const file = e.target.files[0]; if (!file) return; await app.idb.put('font:' + f.id, await file.arrayBuffer()); if (!f.file || /MyFont/.test(f.file)) f.file = 'fonts/' + file.name; loadFontFace(f); changed('doc', true); rerender(); toast('Font loaded for the preview'); } });
        list.append(h('div', { class: 'font-card' },
            h('div', { class: 'font-prev' }, sample),
            h('div', { class: 'font-fields' },
                field('type', enumField(f.kind, ['gfonts', 'file', 'icons'], v => { f.kind = v || 'gfonts'; if (f.kind === 'icons' && !f.file) f.file = 'fonts/MaterialSymbols-Regular.ttf'; set('kind', f.kind); })),
                f.kind === 'gfonts' ? field('Google Fonts family', textField(f.family, v => set('family', v || 'Roboto'))) : field('file', textField(f.file, v => set('file', v || ''), { placeholder: 'fonts/MyFont.ttf' })),
                h('div', { class: 'three' }, field('id', idIn), field('size', numField(f.size, v => set('size', v || 14), { min: 4, max: 200 })), field('bpp', enumField(String(f.bpp || 4), ['1', '2', '4', '8'], v => set('bpp', +(v || 4))))),
                field(f.kind === 'icons' ? 'glyphs (icon characters)' : 'glyphs (extra characters)', textField(f.glyphs, v => set('glyphs', v || ''), { placeholder: f.kind === 'icons' ? 'paste icon characters or \\uE88A escapes' : 'optional, e.g. °€' })),
                h('div', { class: 'row wrap' }, f.kind === 'file' ? h('button', { class: 'btn sm', onclick: () => up.click() }, icon('upload'), 'Load .ttf for preview') : null, up,
                    h('small', null, `used by ${usage(f.id)} widget(s)`), h('span', { class: 'grow' }),
                    h('button', { class: 'btn sm danger', onclick: () => { app.doc.fonts.splice(i, 1); changed('doc', true); rerender(); } }, icon('delete'))))));
    });
    pane.append(list, h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => add('gfonts') }, icon('add'), 'Google Font'), h('button', { class: 'btn', onclick: () => add('file') }, icon('upload_file'), 'Local .ttf'), h('button', { class: 'btn', onclick: () => add('icons') }, icon('emoji_symbols'), 'Icon font')));
    function add(kind) { let n = 1, base = kind === 'icons' ? 'icons_32' : kind === 'gfonts' ? 'roboto_20' : 'font_20', id = base; while (app.doc.fonts.some(x => x.id === id)) id = base + '_' + (++n); const f = { id, kind, family: 'Roboto', file: kind === 'icons' ? 'fonts/MaterialSymbols-Regular.ttf' : kind === 'file' ? 'fonts/MyFont.ttf' : '', size: kind === 'icons' ? 32 : 20, bpp: 4, glyphs: '', extra: {} }; app.doc.fonts.push(f); loadFontFace(f); changed('doc', true); rerender(); }
}

// ---------------------------------------------------------------- style definitions
let curStyle = null;
function styles(pane, rerender) {
    const defs = app.doc.styleDefs;
    if (!curStyle || !defs.some(d => d.id === curStyle)) curStyle = defs[0] && defs[0].id;
    const side = h('div', { class: 'style-list' }, ...defs.map(d => h('button', { class: 'style-item' + (d.id === curStyle ? ' on' : ''), onclick: () => { curStyle = d.id; rerender(); } }, icon('style'), d.id, h('small', null, `${allNodes().filter(n => [].concat(n.props.styles || []).includes(d.id)).length}×`))),
        h('button', { class: 'btn sm', onclick: () => { let n = defs.length + 1, id = 'style_' + n; while (defs.some(x => x.id === id)) id = 'style_' + (++n); defs.push({ id, bg_color: '0x1E293B', text_color: '0xFFFFFF', radius: 12 }); curStyle = id; changed('doc', true); rerender(); } }, icon('add'), 'New style'));
    const main = h('div', { class: 'style-main' });
    const d = defs.find(x => x.id === curStyle);
    if (!d) main.append(h('p', { class: 'empty' }, 'Style definitions are reusable bundles of style properties. Create one, then apply it to widgets from the Style tab (styles:).'));
    else {
        const idIn = h('input', { type: 'text', value: d.id }); idIn.addEventListener('change', () => { const v = idIn.value.trim(); if (!validId(v) || defs.some(x => x !== d && x.id === v)) { toast('Invalid or duplicate id.'); idIn.value = d.id; return; } const old = d.id; d.id = v; allNodes().forEach(n => { if (n.props.styles === old) n.props.styles = v; else if (Array.isArray(n.props.styles)) n.props.styles = n.props.styles.map(s => s === old ? v : s); }); curStyle = v; changed('doc', true); rerender(); });
        main.append(h('div', { class: 'row' }, field('id', idIn), h('button', { class: 'btn sm danger', onclick: () => { defs.splice(defs.indexOf(d), 1); changed('doc', true); rerender(); } }, icon('delete'), 'Delete')),
            styleEditor({ parts: ['main'], showStates: false, getTarget: () => d, effective: () => ({}), onChange: live => changed(live ? 'style' : 'doc') }));
    }
    pane.append(h('div', { class: 'split' }, side, main));
}

// ---------------------------------------------------------------- theme
let themeType = 'button';
function theme(pane, rerender) {
    const ov = app.doc.theme.overrides;
    pane.append(h('label', { class: 'chk big' }, h('input', { type: 'checkbox', checked: app.doc.theme.dark_mode ? true : undefined, onchange: e => { app.doc.theme.dark_mode = e.target.checked; changed('doc', true); rerender(); } }), h('span', null, h('b', null, 'dark_mode'), ' — LVGL\'s dark theme for every page')),
        h('p', { class: 'lead' }, 'Per-widget theme styles (', h('code', null, 'lvgl: theme:'), ') change the default look of every widget of a type. Widget styles still win.'),
        h('div', { class: 'row' }, field('widget type', enumField(themeType, Object.keys(WIDGETS), v => { themeType = v || 'button'; rerender(); })),
            h('span', { class: 'chips' }, ...Object.keys(ov).map(t => h('button', { class: 'chip on', onclick: () => { themeType = t; rerender(); } }, t)))));
    pane.append(styleEditor({
        parts: partsOf(themeType), title: `theme: ${themeType}`,
        getTarget: (part, state, create) => { let t = ov[themeType]; if (!t) { if (!create) return null; t = ov[themeType] = {}; } if (part !== 'main') { if (!t[part]) { if (!create) return null; t[part] = {}; } t = t[part]; } if (state !== 'default') { if (!t[state]) { if (!create) return null; t[state] = {}; } t = t[state]; } return t; },
        effective: (part, state) => themeStyle(themeType, part, new Set(state === 'default' ? [] : [state]), app.doc.theme.dark_mode),
        onChange: live => { const t = ov[themeType]; if (t && !Object.keys(t).length) delete ov[themeType]; changed(live ? 'style' : 'doc'); }
    }));
}

// ---------------------------------------------------------------- gradients
function gradients(pane, rerender) {
    pane.append(h('p', { class: 'lead' }, 'Gradients (', h('code', null, 'lvgl: gradients:'), ') are referenced with ', h('code', null, 'bg_grad: id'), '. For a simple two-colour fade, use bg_grad_color + bg_grad_dir in the Style tab instead.'));
    const sw = h('div', { class: 'grad-row' });
    app.doc.gradients.forEach(g => {
        const c = document.createElement('canvas'); c.width = 160; c.height = 40; const x = c.getContext('2d');
        const d = String(g.direction || 'ver').toLowerCase(); const gr = d.startsWith('hor') || d === 'linear' ? x.createLinearGradient(0, 0, 160, 0) : x.createLinearGradient(0, 0, 0, 40);
        (g.stops || []).forEach(s => { let p = s.position; p = /%$/.test(String(p)) ? parseFloat(p) / 100 : +p; if (p > 1) p /= 255; try { gr.addColorStop(Math.max(0, Math.min(1, p || 0)), engine.cur.color(s.color, '#000')); } catch (e) { /* bad stop */ } });
        x.fillStyle = gr; x.fillRect(0, 0, 160, 40); sw.append(h('figure', null, c, h('figcaption', null, g.id)));
    });
    const ta = h('textarea', { class: 'code', spellcheck: 'false', rows: 14 }); ta.value = app.doc.gradients.length ? dump(app.doc.gradients) : `- id: sunset\n  direction: hor\n  stops:\n    - color: 0xFF7E5F\n      position: 0%\n    - color: 0xFEB47B\n      position: 100%\n`;
    const msg = h('span', { class: 'msg' });
    pane.append(sw, ta, h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { try { const v = globalThis.jsyaml.load(ta.value, { schema: schema() }) || []; if (!Array.isArray(v)) throw new Error('Expected a list of gradients.'); app.doc.gradients = normColors(v); changed('doc', true); rerender(); } catch (e) { msg.textContent = e.message; msg.className = 'msg bad'; } } }, icon('check'), 'Apply'), msg));
}
