// ESPHome YAML <-> document model. Lossless by design: anything the editor doesn't understand stays in props.
// Uses the global `jsyaml` (vendor/js-yaml.min.js).
const Y = () => globalThis.jsyaml;

export class Tag { constructor(tag, value) { this.tag = tag; this.value = value; } toJSON() { return { tag: this.tag, value: this.value }; } }
let SCHEMA = null;
export function schema() {
    if (SCHEMA) return SCHEMA;
    const types = ['!lambda', '!secret', '!include', '!extend', '!remove'].map(t => new (Y().Type)(t, {
        kind: 'scalar', construct: d => new Tag(t, d == null ? '' : d), instanceOf: Tag,
        predicate: o => o instanceof Tag && o.tag === t, represent: o => String(o.value)
    }));
    SCHEMA = Y().DEFAULT_SCHEMA.extend(types);
    return SCHEMA;
}
// JSON round trips (localStorage, undo) turn Tags into {tag, value}; bring them back
export function revive(v) {
    if (Array.isArray(v)) return v.map(revive);
    if (v && typeof v === 'object' && !(v instanceof Tag)) {
        const k = Object.keys(v);
        if (k.length === 2 && typeof v.tag === 'string' && v.tag[0] === '!' && 'value' in v) return new Tag(v.tag, v.value);
        const o = {}; k.forEach(x => { o[x] = revive(v[x]); }); return o;
    }
    return v;
}

const HEX = /^0x[0-9a-fA-F]{6}$/;
const PUA = /[\uE000-\uF8FF]/;
export function dump(obj) {
    // strings with LVGL symbols (private-use code points) are written as "\uF013" escapes so they stay visible
    const dq = [];
    const mark = v => {
        if (Array.isArray(v)) return v.map(mark);
        if (v instanceof Tag) return v;
        if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = mark(v[k]); }); return o; }
        if (typeof v === 'string' && HEX.test(v)) return '__HEX__' + v.slice(2).toUpperCase();
        if (typeof v === 'string' && PUA.test(v)) { dq.push(v); return `__DQ${dq.length - 1}__`; }
        return v;
    };
    return Y().dump(mark(revive(obj)), { schema: schema(), indent: 2, lineWidth: -1, noRefs: true })
        .replace(/'?__HEX__([0-9A-F]{6})'?/g, '0x$1')
        .replace(/'?__DQ(\d+)__'?/g, (_, i) => JSON.stringify(dq[+i]).replace(/[\uE000-\uF8FF]/g, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase()))
        .replace(/^(\s*(?:- )?[\w.]+): null$/gm, '$1:')
        .replace(/^(\s*(?:- )?)'y':/gm, '$1y:');
}

// colours: js-yaml reads 0xFF0000 as a number; keep them as "0xFF0000" strings in the model
export function normColors(v, key) {
    if (Array.isArray(v)) return v.map(x => normColors(x, key));
    if (v && typeof v === 'object' && !(v instanceof Tag)) { const o = {}; Object.keys(v).forEach(k => { o[k] = normColors(v[k], k); }); return o; }
    if (typeof v === 'number' && key && /color$/.test(key) && Number.isInteger(v) && v >= 0 && v <= 0xFFFFFF) return '0x' + v.toString(16).padStart(6, '0').toUpperCase();
    return v;
}

let UID = 1;
export const newUid = () => 'u' + (UID++).toString(36) + Math.random().toString(36).slice(2, 5);
export function toNodes(list) {
    return (Array.isArray(list) ? list : []).map(item => {
        if (!item || typeof item !== 'object') return null;
        const type = Object.keys(item)[0]; if (!type) return null;
        const raw = item[type] && typeof item[type] === 'object' ? normColors(item[type]) : {};
        const { widgets, ...props } = raw;
        return { uid: newUid(), type: type === 'btn' ? 'button' : type, props, children: toNodes(widgets) };
    }).filter(Boolean);
}
export function fromNodes(nodes) {
    return (nodes || []).map(n => {
        const { id, ...rest } = n.props || {};
        const p = {}; if (id !== undefined) p.id = id;
        Object.assign(p, rest);
        if (n.children && n.children.length) p.widgets = fromNodes(n.children);
        return { [n.type]: p };
    });
}

const KNOWN_SIZES = { ILI9341: [240, 320], ILI9342: [320, 240], ILI9486: [320, 480], ILI9488: [320, 480], ST7789V: [240, 320], ST7735: [128, 160], ST7796: [320, 480], GC9A01A: [240, 240] };
function detectDisplay(root) {
    let d = root && root.display; if (Array.isArray(d)) d = d[0]; if (!d || typeof d !== 'object') return null;
    let w = 0, h = 0; const dim = d.dimensions || d;
    if (+dim.width > 0 && +dim.height > 0) { w = +dim.width; h = +dim.height; }
    if (!w && typeof d.model === 'string') {
        const m = d.model.match(/(\d{2,4})x(\d{2,4})/i); if (m) { w = +m[1]; h = +m[2]; }
        else { const k = Object.keys(KNOWN_SIZES).find(x => d.model.toUpperCase().replace(/[\s_-]/g, '').startsWith(x)); if (k) [w, h] = KNOWN_SIZES[k]; }
    }
    const rot = +(d.rotation || 0); if (w && (rot === 90 || rot === 270)) [w, h] = [h, w];
    return w ? { width: w, height: h, platform: d.platform, model: d.model } : null;
}

export function parseFonts(list) {
    return (Array.isArray(list) ? list : []).map(it => {
        if (!it || typeof it !== 'object' || !it.id) return null;
        let file = it.file, family = '', kind = 'file';
        if (file && typeof file === 'object') { if (file.type === 'gfonts' || file.family) { kind = 'gfonts'; family = file.family; } else file = file.path || ''; }
        else if (typeof file === 'string' && /^gfonts:\/\//.test(file)) { kind = 'gfonts'; family = decodeURIComponent(file.replace(/^gfonts:\/\//, '').replace(/@.*$/, '').replace(/\+/g, ' ')); }
        if (kind === 'file' && /symbol|icon|mdi/i.test(String(file) + it.id)) kind = 'icons';
        const { id, size, bpp, glyphs, file: _f, ...extra } = it;
        return { id: String(id), kind, family: family || 'Roboto', file: kind === 'gfonts' ? '' : String(file || ''), size: parseInt(size, 10) || 20, bpp: parseInt(bpp, 10) || 4, glyphs: Array.isArray(glyphs) ? glyphs.join('') : (glyphs ? String(glyphs) : ''), extra };
    }).filter(Boolean);
}
export function parseImages(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(it => {
        if (!it || typeof it !== 'object') return;
        if (Array.isArray(it.files)) { const d = it.defaults || {}; it.files.forEach(f => out.push({ ...d, ...f, platform: it.platform })); return; }
        out.push(it);
    });
    return out.filter(i => i.id).map(i => {
        const { id, file, type, resize, transparency, platform, ...extra } = i;
        return { id: String(id), file: String(file || ''), type: type || 'RGB565', resize: resize || '', transparency: transparency || 'opaque', platform: platform || 'file', extra };
    });
}
export function parseColors(list) {
    return (Array.isArray(list) ? list : []).filter(c => c && c.id).map(c => {
        let hex = c.hex ? String(c.hex).replace(/^(#|0x)/i, '') : '';
        if (!/^[0-9a-f]{6}$/i.test(hex)) {
            const ch = k => { const v = c[k]; if (v === undefined) return 0; const s = String(v); if (/%$/.test(s)) return Math.round(parseFloat(s) * 2.55); const n = parseFloat(s); return n <= 1 && /\./.test(s) ? Math.round(n * 255) : Math.round(n); };
            hex = [ch('red'), ch('green'), ch('blue')].map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
        }
        return { id: String(c.id), hex: '0x' + hex.toUpperCase() };
    });
}

export function emptyDoc(w = 320, h = 240) {
    return {
        version: 2, display: { width: w, height: h }, theme: { dark_mode: false, overrides: {} },
        lvglTop: {}, styleDefs: [], gradients: [], pages: [{ id: 'main_page', props: {}, widgets: [] }],
        topLayer: null, bottomLayer: null, colors: [], fonts: [], images: [], rootMode: 'pages'
    };
}

// text -> { doc, warnings } (throws on YAML syntax errors)
export function importYaml(text, fallbackSize) {
    const root = Y().load(text, { schema: schema() });
    if (root == null || typeof root !== 'object') throw new Error('This does not look like ESPHome YAML.');
    const warnings = [];
    let lv = Array.isArray(root) ? { widgets: root } : (root.lvgl !== undefined ? root.lvgl : root);
    if (Array.isArray(lv)) { if (root.lvgl !== undefined) warnings.push('Several lvgl: entries found; only the first is used.'); lv = Array.isArray(root) ? { widgets: root } : lv[0]; }
    lv = normColors(lv || {});
    const disp = detectDisplay(root) || null;
    const doc = emptyDoc(...(fallbackSize || [320, 240]));
    if (disp) doc.display = { width: disp.width, height: disp.height, platform: disp.platform, model: disp.model };
    const { pages, widgets, theme, style_definitions, gradients, top_layer, bottom_layer, ...top } = lv;
    doc.lvglTop = top;
    if (theme && typeof theme === 'object') { const { dark_mode, ...ov } = theme; doc.theme = { dark_mode: dark_mode === true, overrides: ov }; }
    doc.styleDefs = Array.isArray(style_definitions) ? style_definitions : [];
    doc.gradients = Array.isArray(gradients) ? gradients : [];
    if (Array.isArray(pages) && pages.length) {
        doc.pages = pages.map((p, i) => { const { id, widgets: w, ...props } = p || {}; return { id: String(id || `page_${i + 1}`), props, widgets: toNodes(w) }; });
    } else if (Array.isArray(widgets)) { doc.pages = [{ id: 'main_page', props: {}, widgets: toNodes(widgets) }]; doc.rootMode = 'widgets'; }
    else if (!Array.isArray(root) && root.lvgl === undefined) throw new Error('No lvgl: block with pages or widgets was found.');
    const layer = l => { if (!l || typeof l !== 'object') return null; const { widgets: w, ...props } = l; return { props, widgets: toNodes(w) }; };
    doc.topLayer = layer(top_layer); doc.bottomLayer = layer(bottom_layer);
    doc.colors = parseColors(root.color);
    doc.fonts = parseFonts(root.font);
    doc.images = parseImages(root.image);
    if (doc.images.length) warnings.push(`${doc.images.length} image${doc.images.length === 1 ? '' : 's'} referenced; upload the files in Assets to see them.`);
    return { doc, warnings, display: disp };
}

// document -> YAML blocks
export function lvglObject(doc) {
    const lv = { ...(doc.lvglTop || {}) };
    const ov = (doc.theme && doc.theme.overrides) || {};
    if ((doc.theme && doc.theme.dark_mode) || Object.keys(ov).length) lv.theme = { ...(doc.theme.dark_mode ? { dark_mode: true } : {}), ...ov };
    if (doc.styleDefs && doc.styleDefs.length) lv.style_definitions = doc.styleDefs;
    if (doc.gradients && doc.gradients.length) lv.gradients = doc.gradients;
    const layer = l => l && l.widgets && l.widgets.length ? { ...(l.props || {}), widgets: fromNodes(l.widgets) } : undefined;
    if (doc.topLayer) { const t = layer(doc.topLayer); if (t) lv.top_layer = t; }
    if (doc.bottomLayer) { const b = layer(doc.bottomLayer); if (b) lv.bottom_layer = b; }
    if (doc.rootMode === 'widgets' && doc.pages.length === 1) lv.widgets = fromNodes(doc.pages[0].widgets);
    else lv.pages = doc.pages.map(p => ({ id: p.id, ...(p.props || {}), widgets: fromNodes(p.widgets) }));
    return lv;
}
const q = s => JSON.stringify(String(s));
export function fontYaml(doc) {
    if (!doc.fonts || !doc.fonts.length) return '';
    let y = 'font:\n';
    doc.fonts.forEach(f => {
        const file = f.kind === 'gfonts' ? 'gfonts://' + String(f.family || 'Roboto').replace(/\s+/g, '+') : (f.file || 'fonts/' + f.id + '.ttf');
        y += `  - file: ${q(file)}\n    id: ${f.id}\n    size: ${f.size}\n    bpp: ${f.bpp || 4}\n`;
        if (f.glyphs) y += `    glyphs: ${q(f.glyphs)}\n`;
        if (f.extra && Object.keys(f.extra).length) y += dump(f.extra).split('\n').filter(Boolean).map(l => '    ' + l).join('\n') + '\n';
    });
    return y;
}
export function imageYaml(doc) {
    if (!doc.images || !doc.images.length) return '';
    return dump({ image: doc.images.map(i => ({ platform: i.platform || 'file', file: i.file || `images/${i.id}.png`, id: i.id, type: i.type || 'RGB565', ...(i.resize ? { resize: i.resize } : {}), ...(i.transparency && i.transparency !== 'opaque' ? { transparency: i.transparency } : {}), ...(i.extra || {}) })) });
}
export function colorYaml(doc) {
    if (!doc.colors || !doc.colors.length) return '';
    return 'color:\n' + doc.colors.map(c => `  - id: ${c.id}\n    hex: "${String(c.hex).replace(/^(0x|#)/i, '').toUpperCase()}"`).join('\n') + '\n';
}
export function exportYaml(doc) {
    const parts = [colorYaml(doc), fontYaml(doc), imageYaml(doc), dump({ lvgl: lvglObject(doc) })].filter(Boolean);
    return parts.join('\n');
}
