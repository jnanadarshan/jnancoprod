// Small DOM toolkit shared by the panels: element builder, modal, toast, popover and form fields.
import { app } from './app.js';
import { STYLE_KEYS } from './widgets.js';

export function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (v === true) e.setAttribute(k, ''); else e.setAttribute(k, v);
    });
    kids.flat().forEach(k => { if (k === null || k === undefined || k === false) return; e.append(k instanceof Node ? k : document.createTextNode(String(k))); });
    return e;
}
export const icon = (name, cls) => h('i', { class: 'mi' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, name);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function toast(msg, action, fn, ms) {
    const root = document.getElementById('toast-root');
    const t = h('div', { class: 'toast', role: 'status' }, icon('info'), h('span', { html: msg }));
    if (action) t.append(h('button', { class: 'btn sm primary', onclick: () => { fn(); t.remove(); } }, action));
    root.append(t); setTimeout(() => t.classList.add('out'), (ms || (action ? 9000 : 2600)) - 300); setTimeout(() => t.remove(), ms || (action ? 9000 : 2600));
}

let openModals = [];
export function modal({ title, iconName, wide, tall, body, foot, onClose, cls }) {
    const back = h('div', { class: 'modal-back' });
    const box = h('div', { class: 'modal' + (wide ? ' wide' : '') + (tall ? ' tall' : '') + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const close = () => { back.remove(); openModals = openModals.filter(m => m !== api); onClose && onClose(); };
    const head = h('div', { class: 'modal-head' }, h('h2', null, iconName ? icon(iconName) : null, title), h('button', { class: 'icon-btn', title: 'Close', onclick: close }, icon('close')));
    const bodyEl = h('div', { class: 'modal-body' }); if (body) bodyEl.append(body);
    box.append(head, bodyEl); if (foot) box.append(h('div', { class: 'modal-foot' }, foot));
    back.append(box); back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    document.getElementById('modal-root').append(back);
    const api = { close, body: bodyEl, box, head };
    openModals.push(api);
    setTimeout(() => { const f = box.querySelector('[autofocus], input, textarea, select, button.primary'); if (f) f.focus(); }, 30);
    return api;
}
export const anyModalOpen = () => openModals.length > 0;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openModals.length) { openModals[openModals.length - 1].close(); e.stopPropagation(); } }, true);

// Escape closes an open popover first (before any modal underneath)
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const ps = document.querySelectorAll('.popover'); if (ps.length) { ps.forEach(p => p.remove()); e.stopPropagation(); } } }, true);

export function popover(anchor, content, opts = {}) {
    closePopovers();
    const p = h('div', { class: 'popover' + (opts.cls ? ' ' + opts.cls : '') }); p.append(content);
    document.body.append(p);
    const r = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
    let x = opts.align === 'right' ? r.right - pw : r.left, y = r.bottom + 6;
    if (x + pw > innerWidth - 8) x = innerWidth - pw - 8; if (x < 8) x = 8; if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 6);
    p.style.left = x + 'px'; p.style.top = y + 'px';
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!p.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { p.remove(); document.removeEventListener('mousedown', off); } }), 0);
    return p;
}
export function closePopovers() { document.querySelectorAll('.popover').forEach(p => p.remove()); }

// ---------- form fields: every field calls onChange(value) with undefined to clear ----------
const toHex = v => {
    if (v === undefined || v === null || v === '') return '';
    const e = app.engineRef && app.engineRef.color(v, null);
    return e && e[0] === '#' ? e : '';
};
export function colorField(value, onChange, opts = {}) {
    const wrap = h('div', { class: 'f-color' + (value === undefined ? ' unset' : '') });
    const sw = h('input', { type: 'color', value: toHex(value) || (opts.placeholder && toHex(opts.placeholder)) || '#2196F3', title: 'Pick a colour' });
    const tx = h('input', { type: 'text', value: value === undefined ? '' : String(value), placeholder: opts.placeholder !== undefined ? String(opts.placeholder) : '0xRRGGBB', spellcheck: 'false', list: 'dl-colors' });
    sw.addEventListener('input', () => { const v = '0x' + sw.value.slice(1).toUpperCase(); tx.value = v; wrap.classList.remove('unset'); onChange(v, true); });
    sw.addEventListener('change', () => onChange('0x' + sw.value.slice(1).toUpperCase(), false));
    tx.addEventListener('change', () => { const v = tx.value.trim(); if (!v) { onChange(undefined); wrap.classList.add('unset'); return; } const norm = /^#[0-9a-f]{6}$/i.test(v) ? '0x' + v.slice(1).toUpperCase() : v; tx.value = norm; const hx = toHex(norm); if (hx) sw.value = hx; wrap.classList.remove('unset'); onChange(norm); });
    wrap.append(sw, tx);
    return wrap;
}
export function opaField(value, onChange, opts = {}) {
    const toPct = v => { if (v === undefined || v === null || v === '') return null; const o = app.engineRef ? app.engineRef.opa(v, null) : null; return o === null ? null : Math.round(o * 100); };
    const cur = toPct(value), ph = toPct(opts.placeholder);
    const wrap = h('div', { class: 'f-opa' + (value === undefined ? ' unset' : '') });
    const rng = h('input', { type: 'range', min: 0, max: 100, step: 1, value: cur ?? ph ?? 100 });
    const out = h('input', { type: 'text', value: value === undefined ? '' : (cur !== null ? cur + '%' : String(value)), placeholder: ph !== null ? ph + '%' : '%', spellcheck: 'false' });
    rng.addEventListener('input', () => { out.value = rng.value + '%'; wrap.classList.remove('unset'); onChange(rng.value + '%', true); });
    rng.addEventListener('change', () => onChange(rng.value + '%', false));
    out.addEventListener('change', () => { let v = out.value.trim().toUpperCase(); if (!v) { onChange(undefined); wrap.classList.add('unset'); return; } if (/^\d+(\.\d+)?$/.test(v)) v = v + '%'; out.value = v; const p = toPct(v); if (p !== null) rng.value = p; onChange(v === 'TRANSP' || v === 'COVER' ? v : v); });
    wrap.append(rng, out); return wrap;
}
export function numField(value, onChange, opts = {}) {
    const i = h('input', { type: opts.allowText ? 'text' : 'number', value: value === undefined || value === null ? '' : (typeof value === 'object' ? '' : value), placeholder: opts.placeholder !== undefined ? String(opts.placeholder) : '', step: opts.step || 1, min: opts.min, max: opts.max, spellcheck: 'false' });
    if (value && typeof value === 'object') { i.placeholder = '(lambda)'; i.title = 'Set by a lambda; editing replaces it'; }
    i.addEventListener('change', () => { const v = i.value.trim(); if (v === '') return onChange(undefined); if (opts.allowText && !/^-?\d+(\.\d+)?$/.test(v)) return onChange(v); const n = Number(v); onChange(isNaN(n) ? undefined : n); });
    return i;
}
export function textField(value, onChange, opts = {}) {
    const isObj = value && typeof value === 'object';
    const i = h(opts.multiline ? 'textarea' : 'input', { type: 'text', rows: opts.multiline ? 3 : undefined, placeholder: isObj ? '(lambda / computed)' : (opts.placeholder || ''), spellcheck: 'false' });
    i.value = isObj ? '' : (value ?? '');
    i.addEventListener('change', () => { const v = i.value; onChange(v === '' && !opts.keepEmpty ? undefined : v); });
    return i;
}
export function enumField(value, options, onChange, opts = {}) {
    const s = h('select', null, h('option', { value: '' }, opts.placeholder ? `${opts.placeholder}` : '(default)'), ...options.map(o => h('option', { value: o, selected: String(value ?? '').toUpperCase() === String(o).toUpperCase() ? true : undefined }, o)));
    if (value !== undefined && value !== null && !options.map(o => String(o).toUpperCase()).includes(String(value).toUpperCase())) s.append(h('option', { value: String(value), selected: true }, String(value)));
    s.addEventListener('change', () => onChange(s.value === '' ? undefined : s.value));
    return s;
}
export function boolField(value, onChange, opts = {}) {
    const s = h('select', { class: 'f-bool' }, h('option', { value: '' }, opts.placeholder !== undefined ? `(default: ${opts.placeholder})` : '(default)'), h('option', { value: 'true', selected: value === true ? true : undefined }, 'true'), h('option', { value: 'false', selected: value === false ? true : undefined }, 'false'));
    s.addEventListener('change', () => onChange(s.value === '' ? undefined : s.value === 'true'));
    return s;
}
export function fontField(value, onChange, builtins, opts = {}) {
    const custom = app.doc.fonts.map(f => f.id);
    const s = h('select', null, h('option', { value: '' }, opts.placeholder ? `(inherit: ${opts.placeholder})` : '(inherit)'),
        custom.length ? h('optgroup', { label: 'Your fonts' }, ...custom.map(f => h('option', { value: f, selected: value === f ? true : undefined }, f))) : null,
        h('optgroup', { label: 'Built-in' }, ...builtins.map(f => h('option', { value: f, selected: value === f ? true : undefined }, f))));
    if (value && !custom.includes(value) && !builtins.includes(value)) s.append(h('option', { value, selected: true }, value + ' (not defined)'));
    s.addEventListener('change', () => onChange(s.value || undefined));
    return s;
}
export function imageField(value, onChange) {
    const s = h('select', null, h('option', { value: '' }, '(none)'), ...app.doc.images.map(i => h('option', { value: i.id, selected: value === i.id ? true : undefined }, i.id + (app.images.has(i.id) ? '' : ' (no file)'))));
    if (value && !app.doc.images.some(i => i.id === value)) s.append(h('option', { value, selected: true }, value + ' (missing)'));
    s.addEventListener('change', () => onChange(s.value || undefined));
    return s;
}
export function field(label, input, opts = {}) {
    const row = h('label', { class: 'field' + (opts.cls ? ' ' + opts.cls : ''), title: opts.title || undefined },
        h('span', { class: 'f-label' }, label, opts.set ? h('i', { class: 'dot', title: 'Set on this widget' }) : null), input);
    if (opts.onReset && opts.set) row.append(h('button', { type: 'button', class: 'f-reset', title: 'Remove this setting', onclick: e => { e.preventDefault(); opts.onReset(); } }, icon('close')));
    return row;
}
export const isStyle = k => STYLE_KEYS.has(k);
export function download(name, text, type) {
    const a = h('a', { href: URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type: type || 'text/plain' })), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
export async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copied to the clipboard'); } catch (e) { toast('Copy failed: select and copy manually.'); } }
