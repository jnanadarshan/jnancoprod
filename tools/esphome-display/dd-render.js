// Displaysim renderer + element type registry.
// Replaces the monolith's renderScene: draws in device order (element #1 on top, like the generated lambda),
// understands pages, live data, display profiles (1-bit / grayscale / e-paper emulation) and the new primitives.
(function () {
    'use strict';
    const DD = window.DD;
    const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

    // ------------------------------------------------------------------ colour mapping per profile
    const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const lumOf = rgb => .299 * rgb[0] + .587 * rgb[1] + .114 * rgb[2];
    const PAPER = '#e8e6dd', INK = '#14161a', EPD_RED = '#b3212c', EPD_YELLOW = '#d9b323';
    DD.paper = PAPER;
    // css colour (as the user sees it) -> colour the panel actually shows
    DD.panelColor = function (css, profile) {
        const p = profile || DD.profile(), rgb = hexRgb(css) || [204, 204, 204];
        if (p.mode === 'color') return css;
        const l = lumOf(rgb);
        if (p.mode === 'mono') return (rgb[0] || rgb[1] || rgb[2]) ? '#ffffff' : '#000000';
        if (p.mode === 'gray') { const lv = p.levels || 16, q = Math.round(l / 255 * (lv - 1)) * 255 / (lv - 1); return toHex([q, q, q]); }
        // e-paper: nearest ink by brightness
        if (p.ink === 'bwr' && rgb[0] > 140 && rgb[1] < 110 && rgb[2] < 110) return EPD_RED;
        if (p.ink === 'bwy' && rgb[0] > 150 && rgb[1] > 130 && rgb[2] < 110) return EPD_YELLOW;
        return l < 128 ? INK : PAPER;
    };
    const cssOf = el => { try { return mapColorPreview(el.colorId); } catch (e) { return '#ffffff'; } };

    // ------------------------------------------------------------------ fonts: Go-WASM rasteriser when a TTF is available, canvas text otherwise
    const FE = DD.fontEngine = { ready: false, loaded: new Set(), loading: new Set(), failed: new Set(), cache: new Map(), smooth: false };
    const BUNDLED = { 'Roboto-Regular.ttf': 'fonts/Roboto-Regular.ttf', 'Roboto-Bold.ttf': 'fonts/Roboto-Bold.ttf' };
    function ttfKey(spec) {
        let f = String(spec.file || '');
        if (/^gfonts:\/\//i.test(f)) { const fam = decodeURIComponent(f.slice(9)).split('@')[0].replace(/\+/g, ' '); const w = (fontOverrides[spec.id] || {}).weight || 400; return /^roboto$/i.test(fam) ? (w >= 600 ? 'Roboto-Bold.ttf' : 'Roboto-Regular.ttf') : null; }
        return f.split('/').pop() || null;
    }
    FE.ensure = function (key) {
        if (!key || !FE.ready || FE.loaded.has(key) || FE.loading.has(key) || FE.failed.has(key)) return;
        FE.loading.add(key);
        const done = bytes => { FE.loading.delete(key); if (!bytes) { FE.failed.add(key); return; } const r = window.ddFontLoad(key, new Uint8Array(bytes)); if (r && r.ok) { FE.loaded.add(key); FE.cache.clear(); if (typeof drawPreview === 'function') drawPreview(); } else FE.failed.add(key); };
        const fromIdb = () => DD.idb.get('font:' + key).then(done);
        if (BUNDLED[key]) fetch(BUNDLED[key]).then(r => r.ok ? r.arrayBuffer() : null).then(b => b ? done(b) : fromIdb()).catch(fromIdb);
        else fromIdb();
    };
    FE.addFile = async function (name, buffer) { await DD.idb.put('font:' + name, buffer); FE.failed.delete(name); FE.loaded.delete(name); FE.cache.clear(); FE.ensure(name); };
    DD.fontInfo = function (fontId) {
        const id = String(fontId || '').replace(/^id\(\s*|\s*\)$/g, '');
        let spec = null; try { spec = getFontSpecs().find(s => s.id === id); } catch (e) { /* none */ }
        const ov = fontOverrides[id] || {};
        const m = mapFontPreview(fontId).match(/(\d+)px/);
        const size = spec ? spec.size : (m ? +m[1] : 12);
        return { id, size, bpp: ov.bpp || 1, icon: !!(spec && spec.icon), key: spec ? ttfKey(spec) : null, css: mapFontPreview(fontId) };
    };
    // text bitmap measure/draw through the rasteriser. Returns null when the font is not loaded (caller falls back).
    let curPixel = true;   // Actual view: exact device bitmaps. Design view: smooth vector text, widths matched to the device.
    function rasterText(info, text, force) {
        if ((!force && (FE.smooth || !curPixel)) || !FE.ready || info.icon || !info.key) return null;
        if (!FE.loaded.has(info.key)) { FE.ensure(info.key); return null; }
        const k = `${info.key}|${info.size}|${info.bpp}|${text}`; let r = FE.cache.get(k);
        if (!r) { const out = window.ddFontText(info.key, info.size, info.bpp, text, 0); if (!out) return null; r = { w: out.width, h: out.height, ascent: out.ascent, data: out.data }; if (FE.cache.size > 400) FE.cache.clear(); FE.cache.set(k, r); }
        return r;
    }
    const tintCache = new Map();
    function tinted(r, rgb, key) {
        const k = key + '|' + rgb.join(','); let c = tintCache.get(k);
        if (!c) { c = mk(r.w, r.h); const x = c.getContext('2d'), id = x.createImageData(r.w, r.h); for (let i = 0; i < r.w * r.h; i++) { id.data[i * 4] = rgb[0]; id.data[i * 4 + 1] = rgb[1]; id.data[i * 4 + 2] = rgb[2]; id.data[i * 4 + 3] = r.data[i]; } x.putImageData(id, 0, 0); if (tintCache.size > 300) tintCache.clear(); tintCache.set(k, c); }
        return c;
    }
    DD.textBox = function (el) {
        const info = DD.fontInfo(el.fontId), text = DD.textOf(el), r = rasterText(info, text, true);
        if (r) return { w: r.w, h: r.h, exact: true };
        const c = mk(1, 1).getContext('2d'); c.font = info.css; return { w: Math.round(c.measureText(text).width), h: Math.round(info.size * 1.2), exact: false };
    };
    DD.textOf = function (el) {
        if (el.type === 'clock') return DD.strftime(el.format || '%H:%M');
        let t = el.content || '';
        if (el.args) { try { t = DD.printf(t, el.args); } catch (e) { /* keep */ } }
        return t;
    };

    // ------------------------------------------------------------------ type registry
    // draw(ctx, el, R): R = { css(el), color(css), x, y }, bbox(el) -> {x,y,w,h}
    const T = DD.types = {};
    const ALIGN_X = { LEFT: 0, CENTER: .5, RIGHT: 1 };
    function drawText(ctx, el, R) {
        const info = DD.fontInfo(el.fontId), text = DD.textOf(el), col = R.color(cssOf(el));
        const align = el.align || 'LEFT', fx = ALIGN_X[align] ?? 0;
        const r = rasterText(info, text), x = R.x, y = R.y;
        if (r && r.w) { const rgb = hexRgb(col) || [255, 255, 255]; ctx.drawImage(tinted(r, rgb, `${info.key}|${info.size}|${info.bpp}|${text}`), Math.round(x - fx * r.w), y); return; }
        // smooth (browser) text, squeezed/stretched a hair so it is as wide as the device's glyphs
        const ex = rasterText(info, text, true);
        ctx.font = info.css; ctx.fillStyle = col; ctx.textAlign = align.toLowerCase();
        const mw = ex && !info.icon ? ctx.measureText(text).width : 0, sx = mw > 0 ? ex.w / mw : 1, base = y + (ex ? ex.ascent : Math.round(info.size * .8));
        if (sx !== 1) { ctx.save(); ctx.translate(x, base); ctx.scale(sx, 1); ctx.fillText(text, 0, 0); ctx.restore(); } else ctx.fillText(text, x, base);
        ctx.textAlign = 'start';
    }
    T.text = { draw: drawText };
    T.clock = { draw: drawText };
    T.icon = { draw(ctx, el, R) { const info = DD.fontInfo(el.fontId); ctx.font = info.css; ctx.fillStyle = R.color(cssOf(el)); ctx.textAlign = 'start'; ctx.fillText(iconGlyph(el.iconLigature), R.x, R.y + Math.round(info.size * .8)); } };
    T.bar = { draw(ctx, el, R) { ctx.fillStyle = R.color(cssOf(el)); ctx.fillRect(R.x, R.y, num(el.width, 10), num(el.height, 1)); } };
    T.rectangle = { draw(ctx, el, R) {
        const w = num(el.width, 10), h = num(el.height, 10), radius = num(el.cornerRadius, 0), x = R.x, y = R.y;
        ctx.beginPath(); if (radius > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, radius); else ctx.rect(x, y, w, h); ctx.closePath();
        if (el.fill) { ctx.fillStyle = R.color(cssOf(el)); ctx.fill(); } else { ctx.strokeStyle = R.color(cssOf(el)); ctx.lineWidth = num(el.thickness, 1); ctx.stroke(); }
    } };
    T.circle = { draw(ctx, el, R) { const r = num(el.radius, 10); ctx.beginPath(); ctx.arc(R.x, R.y, r, 0, 2 * Math.PI); ctx.closePath(); if (el.fill) { ctx.fillStyle = R.color(cssOf(el)); ctx.fill(); } else { ctx.strokeStyle = R.color(cssOf(el)); ctx.stroke(); } } };

    // ---- new primitives -----------------------------------------------------------------------------
    // absolute points of a line / triangle (stored as offsets from x,y so moving x,y moves the whole shape)
    DD.pts = el => { const x = num(el.x), y = num(el.y), p = [[x, y], [x + num(el.dx2), y + num(el.dy2)]]; if (el.type === 'triangle') p.push([x + num(el.dx3), y + num(el.dy3)]); return p; };
    const ptsBox = el => { const p = DD.pts(el), xs = p.map(q => q[0]), ys = p.map(q => q[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 }; };
    T.line = { label: 'Line', icon: 'show_chart', group: 'Shapes',
        defaults: (W, H) => ({ x: 10, y: 10, dx2: Math.min(W - 20, 70), dy2: Math.min(H - 20, 30) }),
        bbox: ptsBox, summary: el => { const p = DD.pts(el); return `Line (${p[0][0]},${p[0][1]}) \u2192 (${p[1][0]},${p[1][1]})`; },
        draw(ctx, el, R) { const p = DD.pts(el); ctx.strokeStyle = R.color(cssOf(el)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p[0][0] + .5, p[0][1] + .5); ctx.lineTo(p[1][0] + .5, p[1][1] + .5); ctx.stroke(); } };
    T.hline = { label: 'H line', icon: 'horizontal_rule', group: 'Shapes', defaults: W => ({ x: 0, y: 10, width: Math.min(W, 100) }), bbox: el => ({ x: el.x, y: el.y, w: num(el.width, 10), h: 1 }), summary: el => `H line (${el.width})`,
        draw(ctx, el, R) { ctx.fillStyle = R.color(cssOf(el)); ctx.fillRect(R.x, R.y, num(el.width, 10), 1); } };
    T.vline = { label: 'V line', icon: 'vertical_align_center', group: 'Shapes', defaults: (W, H) => ({ x: 10, y: 0, height: Math.min(H, 60) }), bbox: el => ({ x: el.x, y: el.y, w: 1, h: num(el.height, 10) }), summary: el => `V line (${el.height})`,
        draw(ctx, el, R) { ctx.fillStyle = R.color(cssOf(el)); ctx.fillRect(R.x, R.y, 1, num(el.height, 10)); } };
    T.triangle = { label: 'Triangle', icon: 'change_history', group: 'Shapes',
        defaults: () => ({ x: 20, y: 50, dx2: 40, dy2: 0, dx3: 20, dy3: -35, fill: false }),
        bbox: ptsBox, summary: el => `${el.fill ? 'Filled t' : 'T'}riangle`,
        draw(ctx, el, R) { const p = DD.pts(el); ctx.beginPath(); ctx.moveTo(p[0][0] + .5, p[0][1] + .5); ctx.lineTo(p[1][0] + .5, p[1][1] + .5); ctx.lineTo(p[2][0] + .5, p[2][1] + .5); ctx.closePath(); if (el.fill) { ctx.fillStyle = R.color(cssOf(el)); ctx.fill(); } else { ctx.strokeStyle = R.color(cssOf(el)); ctx.lineWidth = 1; ctx.stroke(); } } };
    const EDGES = { 3: 'TRIANGLE', 4: 'SQUARE', 5: 'PENTAGON', 6: 'HEXAGON', 7: 'HEPTAGON', 8: 'OCTAGON' };
    DD.EDGES = EDGES;
    function polyPoints(el) {
        const n = Math.max(3, Math.min(8, num(el.edges, 6))), r = num(el.radius, 15), flat = el.variation === 'FLAT_TOP';
        const start = flat ? (Math.PI / n) : 0; // pointy top: first vertex straight up
        const pts = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + start + i * 2 * Math.PI / n; pts.push([num(el.x) + Math.cos(a) * r, num(el.y) + Math.sin(a) * r]); } return pts;
    }
    T.polygon = { label: 'Polygon', icon: 'hexagon', group: 'Shapes',
        defaults: () => ({ x: 40, y: 40, radius: 18, edges: 6, variation: 'POINTY_TOP', fill: false }),
        bbox: el => { const r = num(el.radius, 15); return { x: el.x - r, y: el.y - r, w: 2 * r, h: 2 * r }; },
        summary: el => `${el.fill ? 'Filled ' : ''}${(EDGES[el.edges] || 'polygon').toLowerCase()}`,
        draw(ctx, el, R) { const pts = polyPoints(el); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); if (el.fill) { ctx.fillStyle = R.color(cssOf(el)); ctx.fill(); } else { ctx.strokeStyle = R.color(cssOf(el)); ctx.lineWidth = 1; ctx.stroke(); } } };
    T.ring = { label: 'Ring', icon: 'trip_origin', group: 'Shapes',
        defaults: () => ({ x: 40, y: 40, outer: 24, inner: 16 }),
        bbox: el => ({ x: el.x - el.outer, y: el.y - el.outer, w: 2 * el.outer, h: 2 * el.outer }), summary: el => `Ring ${el.inner}–${el.outer}`,
        draw(ctx, el, R) { ctx.beginPath(); ctx.arc(R.x, R.y, num(el.outer, 20), 0, 2 * Math.PI); ctx.arc(R.x, R.y, Math.max(0, num(el.inner, 10)), 0, 2 * Math.PI, true); ctx.fillStyle = R.color(cssOf(el)); ctx.fill('evenodd'); } };
    T.gauge = { label: 'Gauge', icon: 'speed', group: 'Shapes',
        defaults: () => ({ x: 50, y: 50, outer: 30, inner: 20, percent: 70 }),
        bbox: el => ({ x: el.x - el.outer, y: el.y - el.outer, w: 2 * el.outer, h: el.outer + 1 }), summary: el => `Gauge ${typeof el.percent === 'number' ? el.percent + '%' : '(live)'}`,
        draw(ctx, el, R) {
            const o = num(el.outer, 30), i = num(el.inner, 20); let pct = typeof el.percent === 'number' ? el.percent : (el.percent ? num(DD.evalArg(String(el.percent)), 0) : 0); pct = Math.max(0, Math.min(100, pct));
            const col = R.color(cssOf(el));
            ctx.save(); ctx.globalAlpha *= .22; ctx.beginPath(); ctx.arc(R.x, R.y, o, Math.PI, 2 * Math.PI); ctx.arc(R.x, R.y, i, 2 * Math.PI, Math.PI, true); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.restore();
            if (pct > 0) { const end = Math.PI + Math.PI * pct / 100; ctx.beginPath(); ctx.arc(R.x, R.y, o, Math.PI, end); ctx.arc(R.x, R.y, i, end, Math.PI, true); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); }
        } };
    const IMG_ALIGN = { TOP_LEFT: [0, 0], TOP_CENTER: [.5, 0], TOP_RIGHT: [1, 0], CENTER_LEFT: [0, .5], CENTER: [.5, .5], CENTER_RIGHT: [1, .5], BOTTOM_LEFT: [0, 1], BOTTOM_CENTER: [.5, 1], BOTTOM_RIGHT: [1, 1] };
    DD.IMG_ALIGN = Object.keys(IMG_ALIGN);
    function imgBox(el) { const c = DD.imageCanvas(el.imageId); const w = c ? c.width : 32, h = c ? c.height : 32, a = IMG_ALIGN[el.imgAlign || 'TOP_LEFT'] || [0, 0]; return { x: Math.round(el.x - a[0] * w), y: Math.round(el.y - a[1] * h), w, h }; }
    T.image = { label: 'Image', icon: 'image', group: 'Media',
        defaults: () => ({ x: 10, y: 10, imageId: (DD.images[0] || {}).id || '', imgAlign: 'TOP_LEFT', colorOn: '', colorOff: '' }),
        bbox: imgBox, summary: el => `Image ${el.imageId || '(none)'}`,
        draw(ctx, el, R) {
            const c = DD.imageCanvas(el.imageId), b = imgBox(el);
            if (!c) { ctx.save(); ctx.strokeStyle = '#8a90a3'; ctx.setLineDash([3, 3]); ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.moveTo(b.x + b.w, b.y); ctx.lineTo(b.x, b.y + b.h); ctx.stroke(); ctx.restore(); return; }
            let src = c;
            if (c._binary) { // BINARY: the on/off bits take the given colours (default white on black)
                const on = hexRgb(R.color(el.colorOn ? mapColorPreview(el.colorOn) : '#ffffff')), off = hexRgb(R.color(el.colorOff ? mapColorPreview(el.colorOff) : '#000000'));
                const t = mk(c.width, c.height), x = t.getContext('2d'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height), p = d.data;
                for (let i = 0; i < p.length; i += 4) { const lit = p[i] > 127, col = lit ? on : off; p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; }
                x.putImageData(d, 0, 0); src = t;
            } else if (DD.mode() !== 'color') {
                const t = mk(c.width, c.height), x = t.getContext('2d'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height), p = d.data;
                for (let i = 0; i < p.length; i += 4) { const col = hexRgb(DD.panelColor(toHex([p[i], p[i + 1], p[i + 2]]))); p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; }
                x.putImageData(d, 0, 0); src = t;
            }
            ctx.imageSmoothingEnabled = false; ctx.drawImage(src, b.x, b.y);
        } };
    // graph: sensor traces are simulated from the live values so the preview shows a believable curve
    const noise = seed => { let s = 0; for (const c of seed) s = (s * 33 + c.charCodeAt(0)) >>> 0; return i => { const t = i * 12.9898 + s * .001; return (Math.sin(t) * 43758.5453) % 1; }; };
    function graphSeries(el, tr, n) {
        const id = String(tr.sensor || '').replace(/^id\(|\)$/g, ''), base = num(DD.sensorValue(id), 20), f = noise(id || 'x'), out = [];
        for (let i = 0; i < n; i++) out.push(base + Math.sin(i / n * 6.28 * 1.3 + (id.length)) * Math.max(1, Math.abs(base) * .12) + f(i) * Math.max(.5, Math.abs(base) * .03));
        return out;
    }
    T.graph = { label: 'Graph', icon: 'monitoring', group: 'Media',
        defaults: () => ({ x: 5, y: 5, width: 110, height: 50, duration: '1h', xGrid: '10min', yGrid: 5, border: true, lineThickness: 2, traces: [{ sensor: 'temp', color: '', lineType: 'SOLID' }], espId: '' }),
        bbox: el => ({ x: el.x, y: el.y, w: num(el.width, 100), h: num(el.height, 50) }), summary: el => `Graph ${el.width}×${el.height}`,
        draw(ctx, el, R) {
            const x = R.x, y = R.y, w = num(el.width, 100), h = num(el.height, 50), col = R.color(cssOf(el));
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
            ctx.strokeStyle = col; ctx.lineWidth = 1;
            if (el.border !== false) ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
            const dur = (s => { const m = String(s || '1h').match(/(\d+(?:\.\d+)?)\s*(ms|s|min|h|d)/); const u = { ms: .001, s: 1, min: 60, h: 3600, d: 86400 }; return m ? parseFloat(m[1]) * u[m[2]] : 3600; })(el.duration);
            const xg = (s => { if (!s) return 0; const m = String(s).match(/(\d+(?:\.\d+)?)\s*(ms|s|min|h|d)/); const u = { ms: .001, s: 1, min: 60, h: 3600, d: 86400 }; return m ? parseFloat(m[1]) * u[m[2]] : 0; })(el.xGrid);
            ctx.save(); ctx.globalAlpha *= .35; ctx.setLineDash([1, 2]);
            if (xg > 0) for (let t = xg; t < dur; t += xg) { const gx = Math.round(x + w - t / dur * w) + .5; ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
            const traces = (el.traces || []).filter(t => t); const all = traces.map(t => graphSeries(el, t, Math.max(8, Math.round(w / 2))));
            let mn = Infinity, mx = -Infinity; all.forEach(s => s.forEach(v => { mn = Math.min(mn, v); mx = Math.max(mx, v); })); if (!isFinite(mn)) { mn = 0; mx = 1; }
            const yg = num(el.yGrid, 0); if (el.minRange !== undefined && el.minRange !== '') { const r = mx - mn, want = num(el.minRange); if (r < want) { const c = (mx + mn) / 2; mn = c - want / 2; mx = c + want / 2; } }
            if (yg > 0) for (let v = Math.ceil(mn / yg) * yg; v < mx; v += yg) { const gy = Math.round(y + h - (v - mn) / (mx - mn || 1) * h) + .5; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
            ctx.restore();
            traces.forEach((t, ti) => {
                const s = all[ti], tcol = t.color ? R.color(mapColorPreview(t.color)) : col; ctx.strokeStyle = tcol; ctx.lineWidth = Math.max(1, num(el.lineThickness, 3));
                const lt = t.lineType || 'SOLID'; ctx.setLineDash(lt === 'DOTTED' ? [1, 3] : lt === 'DASHED' ? [6, 3] : []);
                ctx.beginPath(); s.forEach((v, i) => { const px = x + i / (s.length - 1) * w, py = y + h - (v - mn) / (mx - mn || 1) * (h - 2) - 1; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
            });
            ctx.restore();
        } };
    T.qr = { label: 'QR code', icon: 'qr_code_2', group: 'Media',
        defaults: () => ({ x: 10, y: 10, value: 'https://esphome.io', ecc: 'LOW', scale: 2, espId: '' }),
        bbox: el => { const n = qrSize(el) * num(el.scale, 2); return { x: el.x, y: el.y, w: n, h: n }; }, summary: el => `QR "${String(el.value || '').slice(0, 14)}"`,
        draw(ctx, el, R) {
            const m = qrModules(el), sc = Math.max(1, num(el.scale, 2)); if (!m) return;
            ctx.fillStyle = R.color(cssOf(el)); for (let yy = 0; yy < m.length; yy++) for (let xx = 0; xx < m.length; xx++) if (m[yy][xx]) ctx.fillRect(R.x + xx * sc, R.y + yy * sc, sc, sc);
        } };
    const ECC = { LOW: 'L', MEDIUM: 'M', QUARTILE: 'Q', HIGH: 'H' };
    function qrModules(el) { const Q = window.qrcode; if (!Q) return null; try { const q = Q(0, ECC[el.ecc || 'LOW'] || 'L'); q.addData(String(el.value || ' ')); q.make(); const n = q.getModuleCount(), out = []; for (let y = 0; y < n; y++) { const row = []; for (let x = 0; x < n; x++) row.push(q.isDark(y, x)); out.push(row); } return out; } catch (e) { return null; } }
    function qrSize(el) { const m = qrModules(el); return m ? m.length : 21; }
    T.clip = { label: 'Clip region', icon: 'crop', group: 'Media', defaults: (W, H) => ({ x: 0, y: 0, width: Math.round(W / 2), height: Math.round(H / 2), editorOnly: true }),
        bbox: el => ({ x: el.x, y: el.y, w: num(el.width, 40), h: num(el.height, 40) }), summary: el => `Clip ${el.width}×${el.height}`,
        draw() { /* only a marker in the editor (see below) */ } };

    // bbox hook for the layout tools and markdown export
    DD.bbox = el => { const t = T[el.type]; return t && t.bbox ? t.bbox(el) : null; };
    DD.isNewType = type => !!(T[type] && T[type].label);

    // ------------------------------------------------------------------ the scene renderer
    DD.currentScene = () => ({ elements, page: DD.page, profile: DD.profile(), pixel: !window.__hiRes, border: screenBorder });
    DD.render = function (ctx, cw, ch, scene) {
        scene = scene || DD.currentScene();
        curPixel = scene.pixel !== false;
        const prof = scene.profile, mode = prof.mode;
        const paper = mode === 'epaper';
        const bg = mode === 'color' ? (document.documentElement && getComputedStyle(document.documentElement).getPropertyValue('--md-canvas-background').trim() || '#000') : (paper ? PAPER : '#000');
        ctx.fillStyle = einkMode && mode === 'color' ? '#ffffff' : bg; ctx.fillRect(0, 0, cw, ch);
        ctx.save();
        const border = scene.border || 0;
        if (border > 0) { ctx.beginPath(); ctx.rect(border, border, Math.max(0, cw - 2 * border), Math.max(0, ch - 2 * border)); ctx.clip(); }
        const list = scene.elements.filter(e => DD.pageOf(e) === scene.page);
        const clips = {}; scene.elements.forEach(e => { if (e.type === 'clip') clips[e.id] = e; });
        const R0 = { color: css => DD.panelColor(css, prof) };
        for (let i = list.length - 1; i >= 0; i--) {            // device order: last element first, #1 ends up on top
            const el = list[i], t = T[el.type];
            if (!t || !t.draw || el.type === 'clip' || el.hidden) continue;
            ctx.save();
            if (el.clipId && clips[el.clipId]) { const c = clips[el.clipId]; ctx.beginPath(); ctx.rect(c.x, c.y, num(c.width, 10), num(c.height, 10)); ctx.clip(); }
            try { t.draw(ctx, el, { ...R0, x: Math.round(num(el.x)), y: Math.round(num(el.y)) }); } catch (e) { console.error('draw', el.type, e); }
            ctx.restore();
        }
        ctx.restore();
        if (scene.pixel && prof.round) { ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.beginPath(); ctx.arc(cw / 2, ch / 2, Math.min(cw, ch) / 2, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); }
        if (scene.pixel && mode !== 'color') postProcess(ctx, cw, ch, prof);
        // editor-only markers for clip regions
        if (scene.markers !== false) list.forEach(e => { if (e.type === 'clip') { ctx.save(); ctx.strokeStyle = '#ec4899'; ctx.setLineDash([3, 3]); ctx.strokeRect(num(e.x) + .5, num(e.y) + .5, num(e.width, 10) - 1, num(e.height, 10) - 1); ctx.restore(); } });
        drawBorderOverlay(ctx, cw, ch);
    };
    // emulate the panel: snap every pixel to what it can show
    function postProcess(ctx, w, h, prof) {
        let d; try { d = ctx.getImageData(0, 0, w, h); } catch (e) { return; }
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
            const c = hexRgb(DD.panelColor(toHex([p[i], p[i + 1], p[i + 2]]), prof));
            // anti-aliased edges: mono thresholds coverage, not "any non-black"
            if (prof.mode === 'mono') { const l = lumOf([p[i], p[i + 1], p[i + 2]]); const v = l >= 96 ? 255 : 0; p[i] = p[i + 1] = p[i + 2] = v; }
            else { p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; }
        }
        ctx.putImageData(d, 0, 0);
    }
    window.renderScene = function (ctx, cw, ch) { DD.render(ctx, cw, ch); };

    // wasm boot
    window.ddFontReady = function () { FE.ready = true; if (typeof drawPreview === 'function') drawPreview(); };
    if (window.ddFontText) FE.ready = true;
})();

// ---- colour strings the generator now writes: Color::WHITE / Color::BLACK and RGBW Color(r, g, b, w)
(function () {
    const orig = window.mapColorPreview;
    window.mapColorPreview = function (c) {
        const k = String(c == null ? '' : c).trim();
        if (k === 'Color::WHITE') return '#FFFFFF'; if (k === 'Color::BLACK') return '#000000';
        const m = k.match(/^Color\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
        if (m) { const w = +m[4]; return '#' + [+m[1], +m[2], +m[3]].map(v => Math.min(255, v + w).toString(16).padStart(2, '0')).join('').toUpperCase(); }
        return orig.apply(this, arguments);
    };
    const origP = window.parseLambdaCode;
    if (origP) window.parseLambdaCode = function () { const r = origP.apply(this, arguments); (r || []).forEach(e => { if (e.colorId === 'Color::WHITE') e.colorId = 'white'; else if (e.colorId === 'Color::BLACK') e.colorId = 'black'; }); return r; };
})();
