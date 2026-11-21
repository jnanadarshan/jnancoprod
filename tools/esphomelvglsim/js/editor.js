// Stage: renders the screen, draws the selection overlay and handles design + interact input.
import { app, engine, makeRenderer, findNode, currentList, currentPage, changed, select, history, createWidget, uniqueId, setPage, saveUi, walk, toJSON } from './app.js';
import { isContainer, WIDGETS } from './widgets.js';
import { dump, fromNodes, toNodes, revive, newUid } from './yaml.js';
import { h, toast, anyModalOpen } from './ui.js';
import { optionList } from './layout.js';

const ALIGN_F = { TOP_LEFT: [0, 0], TOP_MID: [.5, 0], TOP_RIGHT: [1, 0], LEFT_MID: [0, .5], CENTER: [.5, .5], RIGHT_MID: [1, .5], BOTTOM_LEFT: [0, 1], BOTTOM_MID: [.5, 1], BOTTOM_RIGHT: [1, 1] };
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function createEditor() {
    const wrap = document.getElementById('stage-wrap'), device = document.getElementById('device');
    const screen = document.getElementById('screen'), overlay = document.getElementById('overlay');
    const sctx = screen.getContext('2d'), octx = overlay.getContext('2d');
    const renderer = makeRenderer(mkCanvas);
    const off = mkCanvas(1, 1), offCtx = off.getContext('2d');
    let raf = 0, guides = [], drag = null, animating = false, inlineEdit = null;
    const dpr = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const W = () => app.doc.display.width, H = () => app.doc.display.height;

    // ---------------------------------------------------------------- rendering
    function request() { if (!raf) raf = requestAnimationFrame(frame); }
    function hasAnimated() { let a = false; walk(currentList(), n => { if (n.type === 'spinner') a = true; }); return a; }
    function frame() {
        raf = 0;
        const w = W(), hh = H(), z = app.ui.zoom, d = dpr();
        // runtime hidden overrides are read by the layout through _rtHidden
        walk(currentList(), n => { const v = app.runtime.hidden.get(n.uid); if (v === undefined) delete n._rtHidden; else n._rtHidden = v; });
        const cw = Math.round(w * z * d), ch = Math.round(hh * z * d);
        if (screen.width !== cw || screen.height !== ch) { screen.width = overlay.width = cw; screen.height = overlay.height = ch; }
        screen.style.width = overlay.style.width = (w * z) + 'px'; screen.style.height = overlay.style.height = (hh * z) + 'px';
        device.style.setProperty('--sw', (w * z) + 'px'); device.style.setProperty('--sh', (hh * z) + 'px');
        device.classList.toggle('frame', !!app.ui.frame);
        let res;
        try {
            if (app.ui.pixel) {
                if (off.width !== w || off.height !== hh) { off.width = w; off.height = hh; }
                offCtx.setTransform(1, 0, 0, 1, 0, 0);
                res = renderer.render(offCtx, app.doc, app.editTop ? currentPageForTop() : currentPage(), w, hh, { scale: 1 });
                drawDropdownList(offCtx, 1);
                if (app.ui.rgb565) quantize(offCtx, w, hh);
                sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.imageSmoothingEnabled = false; sctx.clearRect(0, 0, cw, ch);
                sctx.drawImage(off, 0, 0, cw, ch);
            } else {
                sctx.setTransform(z * d, 0, 0, z * d, 0, 0); sctx.imageSmoothingEnabled = true;
                res = renderer.render(sctx, app.doc, app.editTop ? currentPageForTop() : currentPage(), w, hh, { scale: z * d });
                drawDropdownList(sctx, z * d);
            }
        } catch (e) { console.error('render failed', e); }
        app.layout = res || { all: [], byId: new Map() };
        drawOverlay();
        animating = app.mode === 'interact' || hasAnimated();
        if (animating && hasAnimated()) request();
    }
    function currentPageForTop() { return currentPage(); }
    function quantize(c, w, hh) {
        const d = c.getImageData(0, 0, w, hh), p = d.data;
        for (let i = 0; i < p.length; i += 4) { p[i] = (p[i] >> 3) * 255 / 31 | 0; p[i + 1] = (p[i + 1] >> 2) * 255 / 63 | 0; p[i + 2] = (p[i + 2] >> 3) * 255 / 31 | 0; }
        c.putImageData(d, 0, 0);
    }
    function drawDropdownList(ctx, s) {
        const uid = app.runtime.open; if (!uid) return;
        const n = app.layout && app.layout.all.find(x => x.uid === uid) || (findNode(uid) || {}).node; if (!n || !n._r) return;
        const E = engine.cur, st = n._st || E.resolve(n, 'main', null, null), f = E.font(st.text_font), opts = optionList(n.props.options);
        const pad = 8, ih = f.lh + pad, r = n._r, listH = Math.min(opts.length * ih + 8, H() - (r.y + r.h) - 2);
        const up = String(n.props.dir || '').toUpperCase() === 'TOP' || listH < ih * 2;
        const y0 = up ? r.y - Math.min(opts.length * ih + 8, r.y - 2) : r.y + r.h + 2, hh = up ? Math.min(opts.length * ih + 8, r.y - 2) : listH;
        const p = E.palette(), sel = Number(app.runtime.vals.get(uid)?.selected_index ?? n.props.selected_index ?? 0);
        ctx.save(); ctx.fillStyle = p.card; ctx.strokeStyle = p.border; ctx.lineWidth = 2; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 10 * s;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(r.x, y0, r.w, hh, 6) : ctx.rect(r.x, y0, r.w, hh); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke(); ctx.clip();
        ctx.font = f.css; ctx.textBaseline = 'middle';
        opts.forEach((o, i) => { const y = y0 + 4 + i * ih; if (i === sel) { ctx.fillStyle = p.primary; ctx.fillRect(r.x + 2, y, r.w - 4, ih); ctx.fillStyle = '#fff'; } else ctx.fillStyle = p.text; ctx.fillText(o, r.x + pad, y + ih / 2); });
        ctx.restore();
        n._list = { x: r.x, y: y0 + 4, w: r.w, ih, count: opts.length };
    }

    // ---------------------------------------------------------------- overlay
    function drawOverlay() {
        const z = app.ui.zoom, d = dpr(), w = overlay.width, hh = overlay.height;
        octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, w, hh); octx.setTransform(d, 0, 0, d, 0, 0);
        if (app.ui.grid && app.ui.snap > 1 && app.mode === 'design') {
            const g = app.ui.snap * z; if (g >= 6) { octx.fillStyle = app.ui.darkUi ? 'rgba(255,255,255,.18)' : 'rgba(30,40,90,.18)'; for (let x = 0; x <= W() * z; x += g) for (let y = 0; y <= H() * z; y += g) octx.fillRect(x - .5, y - .5, 1, 1); }
        }
        if (app.mode !== 'design') return;
        const R = n => ({ x: n._r.x * z, y: n._r.y * z, w: n._r.w * z, h: n._r.h * z });
        const hov = app.hover && app.hover !== app.sel && nodeInLayout(app.hover);
        if (hov && hov._r) { const r = R(hov); octx.strokeStyle = 'rgba(99,102,241,.7)'; octx.lineWidth = 1; octx.setLineDash([4, 3]); octx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1); octx.setLineDash([]); }
        const sel = app.sel && nodeInLayout(app.sel);
        if (sel && sel._r) {
            const f = findNode(app.sel), par = f && f.parent && nodeInLayout(f.parent.uid);
            if (par && par._c) { const c = { x: par._c.x * z, y: par._c.y * z, w: par._c.w * z, h: par._c.h * z }; octx.strokeStyle = 'rgba(245,158,11,.75)'; octx.setLineDash([3, 3]); octx.strokeRect(c.x + .5, c.y + .5, c.w - 1, c.h - 1); octx.setLineDash([]); }
            const r = R(sel);
            octx.strokeStyle = '#6366f1'; octx.lineWidth = 2; octx.strokeRect(r.x, r.y, r.w, r.h);
            if (!inLayoutFlow(app.sel) || true) handles(r).forEach(hd => { octx.fillStyle = '#fff'; octx.strokeStyle = '#6366f1'; octx.lineWidth = 1.5; octx.fillRect(hd.x - 4, hd.y - 4, 8, 8); octx.strokeRect(hd.x - 4, hd.y - 4, 8, 8); });
            const label = `${sel.props.id || sel.type}  ${sel._r.x},${sel._r.y}  ${sel._r.w}×${sel._r.h}`;
            octx.font = '600 11px Inter, system-ui, sans-serif'; const tw = octx.measureText(label).width + 12;
            const by = r.y > 22 ? r.y - 22 : r.y + r.h + 4; octx.fillStyle = '#6366f1'; octx.beginPath(); octx.roundRect ? octx.roundRect(r.x, by, tw, 18, 5) : octx.rect(r.x, by, tw, 18); octx.fill();
            octx.fillStyle = '#fff'; octx.textBaseline = 'middle'; octx.fillText(label, r.x + 6, by + 9);
        }
        guides.forEach(g => { octx.strokeStyle = '#ec4899'; octx.lineWidth = 1; octx.beginPath(); if (g.x !== undefined) { octx.moveTo(g.x * z + .5, 0); octx.lineTo(g.x * z + .5, H() * z); } else { octx.moveTo(0, g.y * z + .5); octx.lineTo(W() * z, g.y * z + .5); } octx.stroke(); });
    }
    const handles = r => [['nw', r.x, r.y], ['n', r.x + r.w / 2, r.y], ['ne', r.x + r.w, r.y], ['e', r.x + r.w, r.y + r.h / 2], ['se', r.x + r.w, r.y + r.h], ['s', r.x + r.w / 2, r.y + r.h], ['sw', r.x, r.y + r.h], ['w', r.x, r.y + r.h / 2]].map(([k, x, y]) => ({ k, x, y }));
    const nodeInLayout = uid => app.layout && app.layout.all.find(n => n.uid === uid);

    // ---------------------------------------------------------------- geometry helpers
    function toCanvas(e) { const r = screen.getBoundingClientRect(); return { x: (e.clientX - r.left) / app.ui.zoom, y: (e.clientY - r.top) / app.ui.zoom }; }
    function hit(x, y, pred) {
        const list = (app.layout && app.layout.all) || [];
        for (let i = list.length - 1; i >= 0; i--) { const n = list[i], r = n._r; if (r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && (!pred || pred(n))) return n; }
        return null;
    }
    function parentLayoutOf(uid) {
        const f = findNode(uid); if (!f) return null;
        const props = f.parent ? f.parent.props : (app.editTop ? (app.doc.topLayer && app.doc.topLayer.props) : currentPage().props);
        const l = props && props.layout;
        if (f.parent && f.parent.type === 'list' && !l) return 'flex';
        if (!l) return null; if (typeof l === 'string') return /^\d*x\d*$/i.test(l) ? 'grid' : l.toLowerCase();
        return String(l.type || '').toLowerCase() || null;
    }
    function inLayoutFlow(uid) { const f = findNode(uid); if (!f) return false; const L = parentLayoutOf(uid); if (!L || L === 'none') return false; const p = f.node.props; return !(p.floating === true || p.ignore_layout === true || (p.flags && (p.flags.floating || p.flags.ignore_layout))); }
    function parentContent(uid) {
        const f = findNode(uid); const p = f && f.parent && nodeInLayout(f.parent.uid);
        return p && p._c ? p._c : { x: 0, y: 0, w: W(), h: H() };
    }
    const alignF = n => ALIGN_F[String(n.props.align || 'TOP_LEFT').toUpperCase()] || [0, 0];
    const toNum = (v, of) => typeof v === 'number' ? v : (typeof v === 'string' && /%$/.test(v) ? Math.round(parseFloat(v) / 100 * of) : (parseFloat(v) || 0));

    // ---------------------------------------------------------------- design-mode pointer
    screen.style.touchAction = overlay.style.touchAction = 'none';
    overlay.addEventListener('pointerdown', e => {
        if (e.button !== 0 || inlineEdit) return;
        const p = toCanvas(e);
        if (app.mode === 'interact') return interactDown(e, p);
        try { overlay.setPointerCapture(e.pointerId); } catch (er) { /* unsupported */ }
        const sel = app.sel && nodeInLayout(app.sel);
        if (sel && sel._r) {
            const z = app.ui.zoom, r = { x: sel._r.x * z, y: sel._r.y * z, w: sel._r.w * z, h: sel._r.h * z };
            const hd = handles(r).find(hd => Math.abs(hd.x - p.x * z) <= 6 && Math.abs(hd.y - p.y * z) <= 6);
            if (hd) { startDrag('resize', sel, p, hd.k); return; }
        }
        let n = hit(p.x, p.y);
        if (n && e.altKey) { const f = findNode(n.uid); if (f && f.parent) n = nodeInLayout(f.parent.uid) || n; }
        if (!n) { select(null); return; }
        // clicking inside the selected container's child area keeps drilling: plain click selects the deepest
        if (n.uid !== app.sel) select(n.uid);
        startDrag('move', n, p);
    });
    function startDrag(kind, n, p, handle) {
        const f = findNode(n.uid); if (!f) return;
        if (kind === 'move' && inLayoutFlow(n.uid)) { drag = { kind: 'blocked', n, p0: p }; return; }
        const pr = n.props, pc = parentContent(n.uid);
        drag = { kind, handle, n, p0: p, moved: false, r0: { ...n._r }, pc, ax: toNum(pr.x, pc.w), ay: toNum(pr.y, pc.h), w0: n._r.w, h0: n._r.h, f: alignF(n), pctWarned: false };
    }
    overlay.addEventListener('pointermove', e => {
        const p = toCanvas(e);
        if (app.mode === 'interact') return interactMove(e, p);
        if (!drag) { const n = hit(p.x, p.y); const id = n ? n.uid : null; if (id !== app.hover) { app.hover = id; drawOverlay(); } overlay.style.cursor = cursorFor(p); return; }
        if (drag.kind === 'blocked') { if (!drag.told && Math.hypot(p.x - drag.p0.x, p.y - drag.p0.y) > 4) { drag.told = true; toast('This widget is positioned by its parent\'s <b>layout</b>. Reorder it in <b>Layers</b>, or tick <b>floating</b> to place it freely.'); } return; }
        let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
        if (!drag.moved && Math.hypot(dx, dy) * app.ui.zoom < 3) return;
        drag.moved = true;
        const pr = drag.n.props, snap = e.altKey ? 0 : app.ui.snap;
        if (drag.kind === 'move') {
            let nx = drag.r0.x + dx, ny = drag.r0.y + dy;
            if (snap > 1) { nx = drag.pc.x + Math.round((nx - drag.pc.x) / snap) * snap; ny = drag.pc.y + Math.round((ny - drag.pc.y) / snap) * snap; }
            const g = smartGuides(drag.n, nx, ny, drag.r0.w, drag.r0.h, e.altKey); nx = g.x; ny = g.y; guides = g.lines;
            pr.x = Math.round(drag.ax + (nx - drag.r0.x)); pr.y = Math.round(drag.ay + (ny - drag.r0.y));
            if (pr.x === 0 && drag.ax === 0 && !('x' in drag.n.props)) delete pr.x;
        } else {
            const hd = drag.handle; let nw = drag.w0, nh = drag.h0, ox = drag.ax, oy = drag.ay;
            const sn = v => snap > 1 ? Math.round(v / snap) * snap : Math.round(v);
            if (hd.includes('e')) { nw = Math.max(4, sn(drag.w0 + dx)); ox = drag.ax + drag.f[0] * (nw - drag.w0); }
            if (hd.includes('w')) { nw = Math.max(4, sn(drag.w0 - dx)); const ddx = drag.w0 - nw; ox = drag.ax + ddx * (1 - drag.f[0]); }
            if (hd.includes('s')) { nh = Math.max(4, sn(drag.h0 + dy)); oy = drag.ay + drag.f[1] * (nh - drag.h0); }
            if (hd.includes('n')) { nh = Math.max(4, sn(drag.h0 - dy)); const ddy = drag.h0 - nh; oy = drag.ay + ddy * (1 - drag.f[1]); }
            if (hd.includes('e') || hd.includes('w')) pr.width = nw;
            if (hd.includes('n') || hd.includes('s')) pr.height = nh;
            if (!inLayoutFlow(drag.n.uid)) { if (hd.includes('w') || hd.includes('e')) pr.x = Math.round(ox); if (hd.includes('n') || hd.includes('s')) pr.y = Math.round(oy); }
            if (pr.x === 0 && drag.ax === 0) delete pr.x; if (pr.y === 0 && drag.ay === 0) delete pr.y;
        }
        changed('geometry');
    });
    const endDrag = () => { if (drag && drag.moved) { guides = []; changed('doc'); } drag = null; guides = []; drawOverlay(); };
    overlay.addEventListener('pointerup', e => { if (app.mode === 'interact') return interactUp(e, toCanvas(e)); endDrag(); });
    overlay.addEventListener('pointercancel', endDrag);
    overlay.addEventListener('pointerleave', () => { if (!drag && app.hover) { app.hover = null; drawOverlay(); } });
    overlay.addEventListener('dblclick', e => { if (app.mode !== 'design') return; const p = toCanvas(e), n = hit(p.x, p.y); if (n && ['label', 'button', 'checkbox', 'textarea'].includes(n.type)) startInlineEdit(n); });
    function cursorFor(p) {
        if (app.mode === 'interact') return 'pointer';
        const sel = app.sel && nodeInLayout(app.sel);
        if (sel && sel._r) { const z = app.ui.zoom, r = { x: sel._r.x * z, y: sel._r.y * z, w: sel._r.w * z, h: sel._r.h * z }; const hd = handles(r).find(hd => Math.abs(hd.x - p.x * z) <= 6 && Math.abs(hd.y - p.y * z) <= 6); if (hd) return { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }[hd.k]; }
        const n = hit(p.x, p.y); return n ? (inLayoutFlow(n.uid) ? 'pointer' : 'move') : 'default';
    }
    function smartGuides(n, x, y, w, hh, off) {
        const lines = []; if (off) return { x, y, lines };
        const thr = 4 / Math.max(.5, app.ui.zoom) * 2, pc = parentContent(n.uid), xs = [pc.x, pc.x + pc.w / 2, pc.x + pc.w], ys = [pc.y, pc.y + pc.h / 2, pc.y + pc.h];
        const f = findNode(n.uid); (f ? f.arr : []).forEach(s => { if (s.uid === n.uid) return; const r = nodeInLayout(s.uid); if (r && r._r) { xs.push(r._r.x, r._r.x + r._r.w / 2, r._r.x + r._r.w); ys.push(r._r.y, r._r.y + r._r.h / 2, r._r.y + r._r.h); } });
        let bx = null, by = null;
        [[x, 0], [x + w / 2, w / 2], [x + w, w]].forEach(([v, o]) => xs.forEach(c => { const d = Math.abs(v - c); if (d <= thr && (!bx || d < bx.d)) bx = { d, x: c - o, line: c }; }));
        [[y, 0], [y + hh / 2, hh / 2], [y + hh, hh]].forEach(([v, o]) => ys.forEach(c => { const d = Math.abs(v - c); if (d <= thr && (!by || d < by.d)) by = { d, y: c - o, line: c }; }));
        if (bx) { x = Math.round(bx.x); lines.push({ x: bx.line }); }
        if (by) { y = Math.round(by.y); lines.push({ y: by.line }); }
        return { x, y, lines };
    }

    // ---------------------------------------------------------------- inline text editing
    function startInlineEdit(n) {
        const key = n.type === 'textarea' ? 'text' : 'text', z = app.ui.zoom;
        const inp = h('input', { class: 'inline-edit', value: typeof n.props[key] === 'string' ? n.props[key] : '' });
        Object.assign(inp.style, { left: n._r.x * z + 'px', top: n._r.y * z + 'px', width: Math.max(80, n._r.w * z) + 'px', height: Math.max(24, n._r.h * z) + 'px' });
        device.append(inp); inp.focus(); inp.select(); inlineEdit = inp;
        const done = ok => { if (!inlineEdit) return; inlineEdit = null; if (ok) { const f = findNode(n.uid); if (f) { f.node.props[key] = inp.value; changed('doc'); } } inp.remove(); };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
        inp.addEventListener('blur', () => done(true));
    }

    // ---------------------------------------------------------------- palette drop
    wrap.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/lvgl-widget')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    wrap.addEventListener('drop', e => {
        const type = e.dataTransfer.getData('text/lvgl-widget'); if (!type) return; e.preventDefault();
        const p = toCanvas(e); addWidgetAt(type, p);
    });
    function addWidgetAt(type, p) {
        if (app.mode !== 'design') setMode('design');
        let target = p ? hit(p.x, p.y, n => isContainer(n.type)) : (app.sel && (() => { const f = findNode(app.sel); return f && isContainer(f.node.type) ? nodeInLayout(f.node.uid) : null; })());
        const node = createWidget(type);
        const list = target ? findNode(target.uid).node.children : currentList();
        const layoutOwner = target ? findNode(target.uid).node : (app.editTop ? app.doc.topLayer : currentPage());
        const hasLayout = layoutOwner && layoutOwner.props && layoutOwner.props.layout && !(typeof layoutOwner.props.layout === 'object' && /none/i.test(layoutOwner.props.layout.type || ''));
        if (p && !hasLayout) {
            const c = target ? target._c : { x: 0, y: 0, w: W(), h: H() };
            const snap = app.ui.snap > 1 ? app.ui.snap : 1;
            node.props.x = Math.max(0, Math.round((p.x - c.x) / snap) * snap); node.props.y = Math.max(0, Math.round((p.y - c.y) / snap) * snap);
            if (WIDGETS[type] && /^\d+%$/.test(String(node.props.width))) { delete node.props.x; delete node.props.y; }
        }
        list.push(node); changed('doc', true); select(node.uid);
        if (target) toast(`Added inside <b>${target.props.id || target.type}</b>`);
    }

    // ---------------------------------------------------------------- interact mode (simulates LVGL behaviour)
    const rt = app.runtime;
    const CLICKABLE = new Set(['button', 'switch', 'checkbox', 'slider', 'arc', 'dropdown', 'roller', 'textarea', 'buttonmatrix', 'keyboard', 'tabview', 'spinbox', 'obj', 'list']);
    let ia = null;
    const stateSet = (uid, k, v) => { const o = rt.st.get(uid) || {}; o[k] = v; rt.st.set(uid, o); };
    const hasState = (n, k) => { const o = rt.st.get(n.uid); if (o && k in o) return o[k]; const s = n.props.state; return !!(s && s[k] === true); };
    const setVal = (n, k, v) => { const o = rt.vals.get(n.uid) || {}; o[k] = v; rt.vals.set(n.uid, o); };
    function clickTarget(n) { let cur = n; while (cur) { if (CLICKABLE.has(cur.type) && cur.props.clickable !== false) return cur; const f = findNode(cur.uid); cur = f && f.parent ? nodeInLayout(f.parent.uid) : null; } return null; }
    function interactDown(e, p) {
        try { overlay.setPointerCapture(e.pointerId); } catch (er) { /* unsupported */ }
        // open dropdown list takes the click first
        if (rt.open) {
            const dn = nodeInLayout(rt.open);
            if (dn && dn._list && p.x >= dn._list.x && p.x < dn._list.x + dn._list.w && p.y >= dn._list.y && p.y < dn._list.y + dn._list.ih * dn._list.count) { const idx = Math.floor((p.y - dn._list.y) / dn._list.ih); setVal(dn, 'selected_index', idx); fire(dn, 'on_value'); fire(dn, 'on_change'); }
            rt.open = null; request(); return;
        }
        const n0 = hit(p.x, p.y); const n = n0 && clickTarget(n0); if (!n) return;
        ia = { n, p0: p };
        stateSet(n.uid, 'pressed', true);
        if (n.type === 'buttonmatrix' || n.type === 'keyboard') { const c = (n._cells || []).find(c => p.x >= c.x && p.x < c.x + c.w && p.y >= c.y && p.y < c.y + c.h); if (c) { rt.pressedCell = { uid: n.uid, key: c.key }; ia.cell = c; } }
        if (n.type === 'slider' || (n.type === 'arc' && n.props.adjustable === true)) valueFromPoint(n, p);
        fire(n, 'on_press'); request();
    }
    function interactMove(e, p) {
        const n0 = hit(p.x, p.y); overlay.style.cursor = n0 && clickTarget(n0) ? 'pointer' : 'default';
        if (!ia) return;
        if (ia.n.type === 'slider' || (ia.n.type === 'arc' && ia.n.props.adjustable === true)) { valueFromPoint(ia.n, p); request(); }
    }
    function interactUp(e, p) {
        if (!ia) return; const n = ia.n; ia = null;
        stateSet(n.uid, 'pressed', false); rt.pressedCell = null;
        const r = n._r, inside = r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
        if (inside) {
            if ((n.type === 'button' && n.props.checkable === true) || n.type === 'switch' || n.type === 'checkbox' || n.props.checkable === true || (n.props.flags && n.props.flags.checkable)) { stateSet(n.uid, 'checked', !hasState(n, 'checked')); fire(n, 'on_value'); fire(n, 'on_change'); }
            if (n.type === 'dropdown') rt.open = n.uid;
            if (n.type === 'roller') { const opts = optionList(n.props.options), cur = Number(rt.vals.get(n.uid)?.selected_index ?? n.props.selected_index ?? 0), f = engine.cur.font((n._st || {}).text_font), rowH = f.lh + Number((n._st || {}).text_line_space || 0); const k = Math.round((p.y - (r.y + r.h / 2)) / rowH); if (k) { let ni = cur + k; ni = String(n.props.mode || '').toUpperCase() === 'INFINITE' ? ((ni % opts.length) + opts.length) % opts.length : Math.max(0, Math.min(opts.length - 1, ni)); setVal(n, 'selected_index', ni); fire(n, 'on_value'); } }
            if (n.type === 'tabview' && n._tab) { const T = n._tab, c = n._c, vert = T.pos === 'LEFT' || T.pos === 'RIGHT', cnt = Math.max(1, T.tabs.length); const inBar = T.pos === 'TOP' ? p.y < c.y + T.barH : T.pos === 'BOTTOM' ? p.y > c.y + c.h - T.barH : T.pos === 'LEFT' ? p.x < c.x + T.barH : p.x > c.x + c.w - T.barH; if (inBar) { const i = Math.floor(vert ? (p.y - c.y) / (c.h / cnt) : (p.x - c.x) / (c.w / cnt)); rt.tab.set(n.uid, Math.max(0, Math.min(cnt - 1, i))); } }
            if (n.type === 'textarea') { allLayout().forEach(o => { if (o.type === 'textarea') stateSet(o.uid, 'focused', o.uid === n.uid); }); }
            if (n.type === 'keyboard') keyboardKey(n, p);
            fire(n, 'on_click'); fire(n, 'on_short_click'); fire(n, 'on_release');
        }
        request();
    }
    function keyboardKey(n, p) {
        const c = (n._cells || []).find(c => p.x >= c.x && p.x < c.x + c.w && p.y >= c.y && p.y < c.y + c.h); if (!c) return;
        const taId = n.props.textarea, ta = taId && allLayout().find(o => o.props.id === taId) || allLayout().find(o => o.type === 'textarea' && hasState(o, 'focused'));
        const t = c.text;
        if (t === 'ABC' || t === 'abc' || t === '1#') { setVal(n, 'mode', t === 'ABC' ? 'TEXT_UPPER' : t === 'abc' ? 'TEXT_LOWER' : 'TEXT_SPECIAL'); request(); return; }
        if (!ta) return;
        let cur = String(rt.vals.get(ta.uid)?.text ?? ta.props.text ?? '');
        if (t === '\uF55A') cur = cur.slice(0, -1); else if (t === '\uF3BE') cur += '\n'; else if (t.length === 1 || t === ' ') cur += t; else if (t === '\uF00C') { fire(n, 'on_ready'); return; } else return;
        setVal(ta, 'text', cur); fire(ta, 'on_value');
    }
    function valueFromPoint(n, p) {
        const r = n._r, min = Number(n.props.min_value ?? 0), max = Number(n.props.max_value ?? 100);
        let f;
        if (n.type === 'slider') { f = r.h > r.w ? 1 - (p.y - r.y) / r.h : (p.x - r.x) / r.w; }
        else {
            const cx = r.x + r.w / 2, cy = r.y + r.h / 2; let a = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI;
            const rot = Number(n.props.rotation || 0), bs = Number(n.props.start_angle ?? 135) + rot; let be = Number(n.props.end_angle ?? 45) + rot; while (be <= bs) be += 360;
            while (a < bs) a += 360; if (a > be) a = (a - be < bs + 360 - a) ? be : bs; f = (a - bs) / (be - bs);
        }
        const v = Math.round(min + Math.max(0, Math.min(1, f)) * (max - min));
        const old = rt.vals.get(n.uid)?.value; if (old !== v) { setVal(n, 'value', v); fire(n, 'on_value'); }
    }
    const allLayout = () => (app.layout && app.layout.all) || [];
    // run the subset of LVGL actions that change what you see
    function fire(n, trig) {
        const t = n.props[trig]; if (!t) return;
        const list = Array.isArray(t) ? t : Array.isArray(t.then) ? t.then : (t.then ? [t.then] : []);
        const log = [];
        list.forEach(step => {
            if (!step || typeof step !== 'object') return;
            const [act] = Object.keys(step), arg = step[act];
            const byId = id => allLayout().find(o => o.props.id === id) || (app.doc.pages.flatMap(pg => { const out = []; walk(pg.widgets, x => out.push(x)); return out; }).find(o => o.props.id === id));
            const ids = v => [].concat(v && typeof v === 'object' && !Array.isArray(v) ? v.id : v).filter(Boolean);
            switch (act) {
                case 'lvgl.page.next': setPage((app.pageIndex + 1) % app.doc.pages.length); log.push(act); break;
                case 'lvgl.page.previous': setPage((app.pageIndex - 1 + app.doc.pages.length) % app.doc.pages.length); log.push(act); break;
                case 'lvgl.page.show': { const id = typeof arg === 'string' ? arg : arg && arg.id; const i = app.doc.pages.findIndex(pg => pg.id === id); if (i >= 0) setPage(i); log.push(act + ' ' + id); break; }
                case 'lvgl.widget.hide': case 'lvgl.widget.show': ids(arg).forEach(id => { const o = byId(id); if (o) rt.hidden.set(o.uid, act.endsWith('hide')); }); log.push(act); break;
                case 'lvgl.widget.disable': case 'lvgl.widget.enable': ids(arg).forEach(id => { const o = byId(id); if (o) stateSet(o.uid, 'disabled', act.endsWith('disable')); }); log.push(act); break;
                case 'lvgl.label.update': case 'lvgl.textarea.update': case 'lvgl.button.update': { const o = arg && byId(arg.id); if (o && typeof arg.text === 'string') setVal(o, 'text', arg.text); log.push(act); break; }
                case 'lvgl.slider.update': case 'lvgl.bar.update': case 'lvgl.arc.update': { const o = arg && byId(arg.id); if (o && typeof arg.value === 'number') setVal(o, 'value', arg.value); log.push(act); break; }
                case 'lvgl.widget.update': { const o = arg && byId(arg.id); if (o && arg.state) Object.keys(arg.state).forEach(k => stateSet(o.uid, k, arg.state[k] === true)); log.push(act); break; }
                case 'lambda': log.push('lambda (not simulated)'); break;
                default: log.push(act + ' (not simulated)');
            }
        });
        if (log.length) toast(`<b>${n.props.id || n.type}</b> ${trig} → ${log.join(', ')}`, null, null, 2200);
        request();
    }

    // ---------------------------------------------------------------- keyboard
    let clip = null;
    document.addEventListener('keydown', e => {
        if (anyModalOpen() || inlineEdit) return;
        const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
        const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        const stop = () => { e.preventDefault(); e.stopPropagation(); };
        if (mod && k === 'z') { stop(); e.shiftKey ? history.redo() : history.undo(); return; }
        if (mod && k === 'y') { stop(); history.redo(); return; }
        if (mod && (k === '=' || k === '+')) { stop(); setZoom(app.ui.zoom * 1.25); return; }
        if (mod && k === '-') { stop(); setZoom(app.ui.zoom / 1.25); return; }
        if (mod && k === '0') { stop(); fit(); return; }
        if (app.mode === 'interact') {
            const ta = allLayout().find(o => o.type === 'textarea' && hasState(o, 'focused'));
            if (ta && !mod) { let cur = String(rt.vals.get(ta.uid)?.text ?? ta.props.text ?? ''); if (e.key === 'Backspace') cur = cur.slice(0, -1); else if (e.key === 'Enter') { if (ta.props.one_line) { fire(ta, 'on_ready'); return; } cur += '\n'; } else if (e.key.length === 1) cur += e.key; else return; stop(); setVal(ta, 'text', cur); fire(ta, 'on_value'); request(); }
            return;
        }
        const f = app.sel && findNode(app.sel);
        if (mod && k === 'c' && f) { stop(); clip = toJSON(f.node); try { navigator.clipboard.writeText(dump(fromNodes([f.node]))); } catch (er) { /* ok */ } toast('Copied ' + (f.node.props.id || f.node.type)); return; }
        if (mod && k === 'v') { stop(); paste(); return; }
        if (mod && k === 'd' && f) { stop(); clip = toJSON(f.node); paste(f); return; }
        if (!f) return;
        if (k === 'delete' || k === 'backspace') { stop(); f.arr.splice(f.index, 1); select(null); changed('doc', true); return; }
        if (k === 'escape') { stop(); select(f.parent ? f.parent.uid : null); return; }
        if (k === '[' || k === ']') { stop(); const j = k === ']' ? f.index + 1 : f.index - 1; if (j >= 0 && j < f.arr.length) { const [m] = f.arr.splice(f.index, 1); f.arr.splice(j, 0, m); changed('doc', true); } return; }
        if (k.startsWith('arrow')) {
            stop(); if (inLayoutFlow(f.node.uid)) { toast('Positioned by the parent layout.'); return; }
            const step = e.shiftKey ? 10 : 1, pr = f.node.props, pc = parentContent(f.node.uid);
            if (k === 'arrowleft' || k === 'arrowright') pr.x = toNum(pr.x, pc.w) + (k === 'arrowright' ? step : -step);
            else pr.y = toNum(pr.y, pc.h) + (k === 'arrowdown' ? step : -step);
            changed('doc');
        }
    });
    function paste(after) {
        if (!clip) return;
        const node = revive(JSON.parse(clip));
        const reid = n => { n.uid = newUid(); if (n.props && n.props.id) n.props.id = uniqueId(String(n.props.id).replace(/_\d+$/, '')); (n.children || []).forEach(reid); };
        reid(node);
        if (typeof node.props.x === 'number') node.props.x += 10; if (typeof node.props.y === 'number') node.props.y += 10;
        const list = after ? after.arr : (app.sel && findNode(app.sel) ? findNode(app.sel).arr : currentList());
        const at = after ? after.index + 1 : list.length; list.splice(at, 0, node);
        changed('doc', true); select(node.uid);
    }

    // ---------------------------------------------------------------- zoom + mode
    function setZoom(z) { app.ui.zoom = Math.max(0.25, Math.min(8, Math.round(z * 100) / 100)); saveUi(); request(); app.emitZoom && app.emitZoom(); }
    function fit() { const r = wrap.getBoundingClientRect(), pad = app.ui.frame ? 90 : 48; setZoom(Math.max(0.25, Math.min((r.width - pad) / W(), (r.height - pad) / H()))); }
    wrap.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); setZoom(app.ui.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
    function setMode(m) { app.mode = m; app.runtime.open = null; if (m === 'design') { app.runtime.st.forEach(o => { delete o.pressed; delete o.focused; }); } device.classList.toggle('interact', m === 'interact'); app.emitMode && app.emitMode(); request(); }
    window.addEventListener('resize', request);

    return { request, setZoom, fit, setMode, addWidgetAt, drawOverlay, renderer, startInlineEdit };
}
