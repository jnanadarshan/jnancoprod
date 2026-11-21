// App core: document state, selection, history, persistence, runtime (interactive) state, asset store.
import { emptyDoc, revive, newUid, importYaml, exportYaml, toNodes, fromNodes, dump } from './yaml.js';
import { createStyleEngine } from './style.js';
import { createRenderer } from './render.js';
import { WIDGETS } from './widgets.js';
import { SAMPLES } from './samples.js';

const DOC_KEY = 'lvglStudio.doc', UI_KEY = 'lvglStudio.ui';
const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
};

// ---------------------------------------------------------------- tiny IndexedDB blob store (images, uploaded fonts)
const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
        if (!globalThis.indexedDB) { rej(new Error('no indexedDB')); return; }
        const r = indexedDB.open('lvglStudio', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('blobs');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('blobs', mode); const s = t.objectStore('blobs'); const out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }));
    return {
        get: k => tx('readonly', s => s.get(k)).catch(() => null),
        put: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => null),
        del: k => tx('readwrite', s => s.delete(k)).catch(() => null)
    };
})();

export const app = {
    doc: null, pageIndex: 0, editTop: false, sel: null, hover: null, mode: 'design',
    ui: { zoom: 2, pixel: true, rgb565: false, grid: false, frame: true, darkUi: false, snap: 5, leftTab: 'widgets', inspectorTab: 'props', stylePart: 'main', styleState: 'default' },
    listeners: new Set(), layout: null, idb,
    images: new Map(),       // id -> HTMLImageElement / canvas (processed per type & resize)
    rawImages: new Map(),    // id -> original HTMLImageElement
    runtime: { st: new Map(), vals: new Map(), hidden: new Map(), tab: new Map(), open: null, pressedCell: null }
};
const emit = (what) => app.listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });
app.on = fn => app.listeners.add(fn);

// ---------------------------------------------------------------- tree helpers
export function currentList() {
    if (app.editTop) { if (!app.doc.topLayer) app.doc.topLayer = { props: {}, widgets: [] }; return app.doc.topLayer.widgets; }
    return app.doc.pages[app.pageIndex].widgets;
}
export function currentPage() { return app.doc.pages[app.pageIndex]; }
export function walk(list, fn, parent = null) { (list || []).forEach((n, i) => { fn(n, parent, list, i); walk(n.children, fn, n); }); }
export function findNode(uid) {
    let found = null;
    const scan = list => walk(list, (n, parent, arr, i) => { if (!found && n.uid === uid) found = { node: n, parent, arr, index: i }; });
    scan(currentList());
    return found;
}
export function allNodes() { const out = []; app.doc.pages.forEach(p => walk(p.widgets, n => out.push(n))); if (app.doc.topLayer) walk(app.doc.topLayer.widgets, n => out.push(n)); return out; }
export function allIds() { return new Set(allNodes().map(n => n.props && n.props.id).filter(Boolean).map(String)); }
export function uniqueId(base) {
    const ids = allIds(); base = String(base).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
    let i = 1, id; do { id = `${base}_${i++}`; } while (ids.has(id)); return id;
}
function ensureUids(list) { walk(list, n => { if (!n.uid) n.uid = newUid(); if (!n.children) n.children = []; if (!n.props) n.props = {}; }); }

// ---------------------------------------------------------------- engine + renderer
export const engine = { cur: createStyleEngine(() => app.doc) };
function rebuildEngine() { /* the engine reads app.doc live */ }
const rt = app.runtime;
const runtimeApi = {
    states(n) {
        const s = new Set(), st = n.props && n.props.state;
        if (st && typeof st === 'object') Object.keys(st).forEach(k => { if (st[k] === true) s.add(k); });
        const o = rt.st.get(n.uid); if (o) Object.keys(o).forEach(k => { o[k] ? s.add(k) : s.delete(k); });
        if (app.mode === 'design' && app.sel === n.uid && app.ui.previewState && app.ui.previewState !== 'default') s.add(app.ui.previewState);
        return s;
    },
    value(n, k) { const v = rt.vals.get(n.uid); return v && k in v ? v[k] : n.props[k]; },
    activeTab(n) { return rt.tab.get(n.uid) || 0; },
    matrixPressed(n) { return rt.pressedCell && rt.pressedCell.uid === n.uid ? rt.pressedCell.key : null; }
};
export function makeRenderer(createCanvas) {
    return createRenderer({
        engine: engine.cur, runtime: runtimeApi,
        assets: { get: id => app.images.get(String(id)) || null, size: id => { const i = app.images.get(String(id)); return i ? { w: i.width, h: i.height } : null; } },
        createCanvas, toNodes: list => { const n = toNodes(list); return n; }, qrcode: globalThis.qrcode, now: () => performance.now()
    });
}
export const runtime = runtimeApi;

// ---------------------------------------------------------------- history + persistence
const hist = []; let hi = -1, saveTimer = null, histTimer = null;
// layout caches live on nodes as _r/_c/_st/_kids...: never serialise them
export const toJSON = o => JSON.stringify(o, (k, v) => (k && k[0] === '_') ? undefined : v);
const snapshot = () => toJSON({ doc: app.doc, page: app.pageIndex, sel: app.sel });
function pushHistory() { const s = snapshot(); if (hi >= 0 && hist[hi] === s) return; hist.length = hi + 1; hist.push(s); if (hist.length > 150) hist.shift(); hi = hist.length - 1; emit('history'); }
function restore(s) {
    const o = JSON.parse(s); app.doc = revive(o.doc); ensureAll(); app.pageIndex = Math.min(o.page || 0, app.doc.pages.length - 1); app.sel = o.sel;
    if (app.sel && !findNode(app.sel)) app.sel = null;
    rebuildEngine(); persist(); emit('doc'); emit('select');
}
export const history = {
    undo() { clearTimeout(histTimer); pushHistory(); if (hi > 0) { hi--; restore(hist[hi]); } },
    redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); } },
    canUndo: () => hi > 0 || histPending, canRedo: () => hi < hist.length - 1, push: pushHistory
};
let histPending = false;
function persist() { const ok = LS.set(DOC_KEY, toJSON(app.doc)); if (!ok) emit('storage-full'); }
function ensureAll() {
    const d = app.doc;
    if (!d.pages || !d.pages.length) d.pages = [{ id: 'main_page', props: {}, widgets: [] }];
    d.pages.forEach(p => { p.props = p.props || {}; p.widgets = p.widgets || []; ensureUids(p.widgets); });
    if (d.topLayer) ensureUids(d.topLayer.widgets); if (d.bottomLayer) ensureUids(d.bottomLayer.widgets);
    d.theme = d.theme || { dark_mode: false, overrides: {} }; d.theme.overrides = d.theme.overrides || {};
    ['styleDefs', 'gradients', 'colors', 'fonts', 'images'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    d.lvglTop = d.lvglTop || {}; d.display = d.display || { width: 320, height: 240 };
}
// call after every edit: re-renders, persists, records history (debounced)
export function changed(kind = 'doc', immediateHistory = false) {
    rebuildEngine();
    emit(kind);
    histPending = true; emit('history');
    clearTimeout(saveTimer); saveTimer = setTimeout(persist, 250);
    clearTimeout(histTimer);
    if (immediateHistory) { pushHistory(); histPending = false; }
    else histTimer = setTimeout(() => { pushHistory(); histPending = false; emit('history'); }, 400);
}
export function select(uid) { app.sel = uid; if (app.mode === 'design') app.ui.previewState = 'default'; emit('select'); }
export function setPage(i) { app.pageIndex = Math.max(0, Math.min(i, app.doc.pages.length - 1)); app.editTop = false; app.sel = null; rt.open = null; emit('page'); emit('doc'); emit('select'); saveUi(); }
export function loadDoc(doc, opts = {}) {
    app.doc = revive(doc); ensureAll(); app.pageIndex = 0; app.sel = null; app.editTop = false; resetRuntime();
    rebuildEngine(); persist(); loadAssets(); emit('page'); emit('doc'); emit('select');
    if (opts.history !== false) { clearTimeout(histTimer); pushHistory(); }
}
export function resetRuntime() { rt.st.clear(); rt.vals.clear(); rt.hidden.clear(); rt.tab.clear(); rt.open = null; rt.pressedCell = null; }
export function saveUi() { LS.set(UI_KEY, JSON.stringify({ ...app.ui, pageIndex: app.pageIndex })); }

// ---------------------------------------------------------------- images (blobs in IndexedDB, processed per type/resize)
function processImage(meta, img, createCanvas) {
    let w = img.width, h = img.height;
    const m = String(meta.resize || '').match(/^(\d+)x(\d+)$/i);
    if (m) { const bw = +m[1], bh = +m[2], s = Math.min(bw / w, bh / h); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
    const c = createCanvas(w, h), x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(img, 0, 0, w, h);
    const type = String(meta.type || 'RGB565').toUpperCase(), tr = String(meta.transparency || 'opaque').toLowerCase();
    try {
        const d = x.getImageData(0, 0, w, h), p = d.data;
        for (let i = 0; i < p.length; i += 4) {
            let r = p[i], g = p[i + 1], b = p[i + 2], a = p[i + 3];
            if (type === 'GRAYSCALE') { const l = Math.round(.299 * r + .587 * g + .114 * b); r = g = b = l; }
            if (type === 'BINARY') { const l = .299 * r + .587 * g + .114 * b; r = g = b = l > 127 ? 255 : 0; }
            if (tr === 'opaque') a = 255;
            else if (tr === 'chroma_key' && r === 0 && g === 255 && b === 0) a = 0;
            else if (tr === 'alpha_channel' && type === 'BINARY') a = a > 127 ? 255 : 0;
            p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = a;
        }
        x.putImageData(d, 0, 0);
    } catch (e) { /* tainted canvas: keep as drawn */ }
    return c;
}
let canvasFactory = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function setCanvasFactory(f) { canvasFactory = f; }
export function refreshImage(id) {
    const meta = app.doc.images.find(i => i.id === id), raw = app.rawImages.get(id);
    if (!meta || !raw) { app.images.delete(id); return; }
    app.images.set(id, processImage(meta, raw, canvasFactory));
}
export function loadAssets() {
    app.images.clear();
    app.doc.images.forEach(meta => {
        idb.get('img:' + meta.id).then(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob), img = new Image();
            img.onload = () => { app.rawImages.set(meta.id, img); refreshImage(meta.id); emit('doc'); };
            img.src = url;
        });
    });
    app.doc.fonts.forEach(f => loadFontFace(f));
}
export async function addImageFile(file, id) {
    const blob = file instanceof Blob ? file : new Blob([file]);
    await idb.put('img:' + id, blob);
    return new Promise(res => { const img = new Image(); img.onload = () => { app.rawImages.set(id, img); refreshImage(id); res(img); }; img.onerror = () => res(null); img.src = URL.createObjectURL(blob); });
}
export function renameImage(oldId, newId) {
    idb.get('img:' + oldId).then(b => { if (b) { idb.put('img:' + newId, b); idb.del('img:' + oldId); } });
    const raw = app.rawImages.get(oldId); if (raw) { app.rawImages.set(newId, raw); app.rawImages.delete(oldId); }
    // update references
    const fix = o => { if (Array.isArray(o)) o.forEach(fix); else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if ((k === 'src' || k === 'bg_image_src') && o[k] === oldId) o[k] = newId; else if (k === 'src' && Array.isArray(o[k])) o[k] = o[k].map(s => s === oldId ? newId : s); else fix(o[k]); }); };
    fix(app.doc.pages); fix(app.doc.styleDefs); fix(app.doc.theme); fix(app.doc.topLayer);
    allNodes().forEach(n => fix(n.props));
}

// ---------------------------------------------------------------- fonts: Google Fonts CSS, uploaded .ttf via FontFace
const loadedCss = new Set();
export function loadFontFace(f) {
    if (typeof document === 'undefined') return;
    const addCss = href => { if (loadedCss.has(href)) return; loadedCss.add(href); const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = () => setTimeout(() => emit('doc'), 300); document.head.appendChild(l); };
    if (f.kind === 'gfonts' && f.family) addCss(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@400;700&display=swap`);
    if (f.kind === 'icons') addCss('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined');
    if (f.kind === 'file') idb.get('font:' + f.id).then(buf => {
        if (!buf || !globalThis.FontFace) return;
        new FontFace('lvf_' + f.id, buf).load().then(ff => { document.fonts.add(ff); emit('doc'); }).catch(() => {});
    });
}

// ---------------------------------------------------------------- widget creation
export function createWidget(type, x, y) {
    const def = WIDGETS[type];
    const props = { id: uniqueId(type), ...(def && def.insert ? def.insert({ w: app.doc.display.width, h: app.doc.display.height }) : {}) };
    if (x !== undefined) { props.x = Math.round(x); props.y = Math.round(y); }
    return { uid: newUid(), type, props, children: [] };
}

// ---------------------------------------------------------------- legacy (previous LVGL Designer) migration
export function legacyState() {
    const raw = LS.get('lvglDesignerState', null); if (!raw) return null;
    try { const s = JSON.parse(raw); return s && Array.isArray(s.widgets) && s.widgets.length ? s : null; } catch (e) { return null; }
}
export function migrateLegacy(s) {
    const pagesMeta = (() => { try { return JSON.parse(LS.get('lvglDesignerPages', 'null')); } catch (e) { return null; } })();
    const fonts = (() => { try { return JSON.parse(LS.get('lvglDesignerFonts', '[]')); } catch (e) { return []; } })();
    const [w, h] = String(s.resolution || '320x240').split('x').map(Number);
    const doc = emptyDoc(w || 320, h || 240);
    doc.pages = (pagesMeta && pagesMeta.pages && pagesMeta.pages.length ? pagesMeta.pages : [{ id: 'main_page' }]).map(p => ({ id: p.id, props: {}, widgets: [] }));
    const KEEP = ['id', 'x', 'y', 'width', 'height', 'text', 'value', 'min_value', 'max_value', 'options', 'selected_index', 'dir', 'symbol', 'mode', 'animated', 'anim_time', 'checkable', 'points', 'line_width', 'line_color', 'line_rounded', 'line_dash_width', 'line_dash_gap', 'text_font'];
    (s.widgets || []).forEach(wd => {
        const props = {}; KEEP.forEach(k => { if (wd[k] !== undefined && wd[k] !== '') props[k] = wd[k]; });
        if (wd._raw) Object.keys(wd._raw).forEach(k => { if (wd._raw[k] && wd._raw[k].px === wd[k]) props[k] = wd._raw[k].raw; });
        if (wd.extra) Object.assign(props, revive(wd.extra));
        if (wd.checked) props.state = { checked: true };
        const page = doc.pages.find(p => p.id === wd.page) || doc.pages[0];
        page.widgets.push({ uid: newUid(), type: wd.type === 'btn' ? 'button' : wd.type, props, children: [] });
    });
    doc.fonts = Array.isArray(fonts) ? fonts.map(f => ({ ...f, extra: {} })) : [];
    return doc;
}

// ---------------------------------------------------------------- boot
export function boot() {
    try { const u = JSON.parse(LS.get(UI_KEY, '{}')); Object.assign(app.ui, u); app.pageIndex = u.pageIndex || 0; } catch (e) { /* defaults */ }
    let doc = null;
    try { const raw = LS.get(DOC_KEY, null); if (raw) doc = JSON.parse(raw); } catch (e) { doc = null; }
    if (!doc) doc = sampleDoc();
    const pi = app.pageIndex; loadDoc(doc); app.pageIndex = Math.min(pi, app.doc.pages.length - 1);
    emit('page');
}
export function sampleDoc() { return importYaml(SAMPLES[0].yaml).doc; }
export { exportYaml, importYaml, dump, fromNodes, toNodes, LS };
