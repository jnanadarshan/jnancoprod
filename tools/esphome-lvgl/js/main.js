// Entry point: boots the app, wires the top bar, PWA install and service worker.
import { app, engine, boot, history, saveUi, legacyState, migrateLegacy, loadDoc, LS } from './app.js';
import { createEditor } from './editor.js';
import { createPanels } from './panels.js';
import { createInspector } from './inspector.js';
import { openAssets } from './assets.js';
import { openImport, openYaml, openDeploy, openHelp, exportMd, openSamples } from './guide.js';
import { h, icon, popover, toast } from './ui.js';

const hadDoc = (() => { try { return localStorage.getItem('lvglStudio.doc') !== null; } catch (e) { return false; } })();
boot();
app.engineRef = engine.cur;
app.history = history;
// the interface theme is shared with the other JDNx tools (same localStorage key as Displaysim)
try { const g = localStorage.getItem('darkMode'); if (g !== null) app.ui.darkUi = g === 'true'; else if (window.matchMedia) app.ui.darkUi = app.ui.darkUi ?? matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* default */ }
document.body.classList.toggle('dark-mode', !!app.ui.darkUi);

const editor = createEditor();
createPanels(editor);
createInspector();
app.openAssets = t => openAssets(t);
app.fit = () => requestAnimationFrame(() => editor.fit());

// ---------------------------------------------------------------- top bar
const $ = id => document.getElementById(id);
const on = (id, fn) => $(id).addEventListener('click', fn);
on('btn-undo', () => history.undo()); on('btn-redo', () => history.redo());
on('btn-samples', () => openSamples()); on('btn-assets', () => openAssets('images')); on('btn-import', openImport); on('btn-yaml', openYaml); on('btn-deploy', openDeploy); on('btn-help', openHelp);
on('zoom-in', () => editor.setZoom(app.ui.zoom * 1.25)); on('zoom-out', () => editor.setZoom(app.ui.zoom / 1.25)); on('zoom-fit', () => editor.fit());
on('btn-ui-theme', () => { app.ui.darkUi = !app.ui.darkUi; document.body.classList.toggle('dark-mode', app.ui.darkUi); try { localStorage.setItem('darkMode', String(app.ui.darkUi)); } catch (e) { /* ignore */ } saveUi(); syncTop(); editor.request(); });
document.querySelectorAll('#mode-seg button').forEach(b => b.addEventListener('click', () => editor.setMode(b.dataset.mode)));
app.emitMode = () => { document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === app.mode)); document.body.classList.toggle('interacting', app.mode === 'interact'); if (app.mode === 'interact') toast('Interact mode: press, drag and type like on the device. Page actions work too.'); };
app.emitZoom = () => { $('zoom-val').textContent = Math.round(app.ui.zoom * 100) + '%'; };
on('btn-view', e => {
    const opt = (key, label, hint) => h('label', { class: 'menu-check' }, h('input', { type: 'checkbox', checked: app.ui[key] ? true : undefined, onchange: ev => { app.ui[key] = ev.target.checked; saveUi(); editor.request(); } }), h('span', null, h('b', null, label), h('small', null, hint)));
    const snapSel = h('select', null, ...[0, 1, 2, 5, 10, 20].map(v => h('option', { value: v, selected: v === app.ui.snap ? true : undefined }, v ? `${v} px` : 'off')));
    snapSel.addEventListener('change', () => { app.ui.snap = +snapSel.value; saveUi(); editor.request(); });
    popover(e.currentTarget, h('div', { class: 'menu view-menu' },
        opt('pixel', 'Pixel view', 'Device resolution, scaled up crisp'),
        opt('rgb565', 'RGB565 colours', '16-bit banding like the panel (pixel view)'),
        opt('frame', 'Device frame', 'Bezel around the screen'),
        opt('grid', 'Show grid', 'Dots at the snap spacing'),
        h('label', { class: 'menu-row' }, h('span', null, 'Snap'), snapSel),
        h('hr'),
        h('button', { class: 'menu-item', onclick: () => openSamples() }, icon('auto_awesome'), 'Samples\u2026'),
        h('button', { class: 'menu-item', onclick: exportMd }, icon('description'), 'Export Markdown (.md)'),
        h('button', { class: 'menu-item', onclick: () => { if (confirm('Start a new, empty design? (Undo can bring the current one back.)')) loadDoc({ version: 2, display: { ...app.doc.display }, pages: [{ id: 'main_page', props: {}, widgets: [] }] }); } }, icon('note_add'), 'New design'),
        h('a', { class: 'menu-item', href: 'legacy/' }, icon('history'), 'Open the previous designer')), { align: 'right' });
});
function syncTop() {
    $('btn-undo').disabled = !history.canUndo(); $('btn-redo').disabled = !history.canRedo();
    $('btn-ui-theme').querySelector('.mi').textContent = app.ui.darkUi ? 'light_mode' : 'dark_mode';
    app.emitZoom();
}
// colour ids + common names for every colour field
function syncDatalist() {
    const dl = $('dl-colors'); dl.innerHTML = '';
    app.doc.colors.forEach(c => dl.append(h('option', { value: c.id })));
    ['white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'gray', 'springgreen', 'navy', 'teal', 'purple'].forEach(n => dl.append(h('option', { value: n })));
}
app.on(k => { editor.request(); if (k === 'history' || k === 'doc') syncTop(); if (k === 'doc') syncDatalist(); });
app.on(k => { if (k === 'storage-full') toast('Browser storage is full: the design could not be saved. Export it (YAML / .md) and remove large images.'); });
document.getElementById('overlay').addEventListener('pointermove', e => { const r = e.currentTarget.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / app.ui.zoom), y = Math.floor((e.clientY - r.top) / app.ui.zoom); const p = $('pb-pos'); if (p) p.textContent = `${x}, ${y}`; });
app.emitMode(); syncTop(); syncDatalist();
requestAnimationFrame(() => { editor.fit(); editor.request(); });

// ---------------------------------------------------------------- first visit: show the samples
const legacy = legacyState();
if (!hadDoc && !legacy) setTimeout(() => openSamples({ welcome: true }), 400);
// ---------------------------------------------------------------- previous designer
if (legacy && !hadDoc && !LS.get('lvglStudio.legacyAsked', '')) {
    LS.set('lvglStudio.legacyAsked', '1');
    toast('Found a design from the previous LVGL Designer.', 'Open it', () => { loadDoc(migrateLegacy(legacy)); editor.fit(); }, 14000);
}

// ---------------------------------------------------------------- PWA
const syncInstall = ok => { $('btn-install').hidden = !ok; };
window.HATPWA ? HATPWA.onchange(syncInstall) : window.addEventListener('load', () => window.HATPWA && HATPWA.onchange(syncInstall));
on('btn-install', () => window.HATPWA && HATPWA.install());
