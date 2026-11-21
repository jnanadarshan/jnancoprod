// Canvas renderer: draws a page the way LVGL's default theme would on the device.
import { createLayout, optionList, pointList } from './layout.js';
import { dpx } from './theme.js';

const SYM = { ok: '\uF00C', down: '\uF078', up: '\uF077', left: '\uF053', right: '\uF054', backspace: '\uF55A', keyboard: '\uF11C', newline: '\uF3BE', close: '\uF00D', image: '\uF03E' };

export function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function rgba(c, a = 1) { const rgb = hexToRgb(c); if (!rgb) return c; return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, a))})`; }
const mix = (c, to, t) => { const a = hexToRgb(c), b = hexToRgb(to); if (!a || !b) return c; return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

export function createRenderer(env) {
    // env: { engine, assets: {get(id), size(id)}, runtime: {states(node), value(node,key), activeTab(node)}, createCanvas(w,h), toNodes(list), now() }
    const { engine, assets, runtime } = env;
    const num = engine.num;
    let ctx = null, scale = 1;
    const measureCache = new Map();
    const mctx = env.createCanvas(4, 4).getContext('2d');
    function measure(text, fontCss, letter = 0) {
        const k = fontCss + '|' + letter + '|' + text; let v = measureCache.get(k);
        if (v === undefined) { mctx.font = fontCss; v = mctx.measureText(text).width + letter * Math.max(0, [...text].length - 1); if (measureCache.size > 4000) measureCache.clear(); measureCache.set(k, v); }
        return v;
    }
    const statesOf = node => runtime.states(node);
    const layout = createLayout(engine, {
        measure, statesOf,
        imageSize: id => assets.size(id),
        virtualChildren: (node, st, content) => virtualChildren(node, st, content)
    });

    // tabview / tileview content lives in props; turn it into nodes for layout and drawing
    function virtualChildren(node, st, content) {
        if (node.type === 'tabview') {
            const tabs = Array.isArray(node.props.tabs) ? node.props.tabs : [];
            const pos = String(node.props.position || 'TOP').toUpperCase(), vert = pos === 'LEFT' || pos === 'RIGHT';
            const sz = node.props.size; const full = vert ? content.w : content.h;
            const bar = typeof sz === 'number' ? sz : /%$/.test(String(sz || '')) ? Math.round(parseFloat(sz) / 100 * full) : Math.round(full * 0.1);
            const barH = Math.max(dpx(30), bar);
            const c = { ...content };
            if (pos === 'TOP') { c.y += barH; c.h -= barH; } else if (pos === 'BOTTOM') c.h -= barH; else if (pos === 'LEFT') { c.x += barH; c.w -= barH; } else c.w -= barH;
            node._tab = { barH, pos, tabs };
            const i = Math.min(runtime.activeTab(node), Math.max(0, tabs.length - 1));
            const t = tabs[i];
            if (!t) return { children: [], content: c };
            if (!t._nodes) Object.defineProperty(t, '_nodes', { value: env.toNodes(t.widgets || []), enumerable: false, writable: true });
            return { children: t._nodes, content: { x: c.x + PADC, y: c.y + PADC, w: c.w - 2 * PADC, h: c.h - 2 * PADC } };
        }
        if (node.type === 'tileview') {
            const tiles = Array.isArray(node.props.tiles) ? node.props.tiles : []; const t = tiles[0];
            if (!t) return { children: [], content };
            if (!t._nodes) Object.defineProperty(t, '_nodes', { value: env.toNodes(t.widgets || []), enumerable: false, writable: true });
            return { children: t._nodes, content };
        }
        return null;
    }
    const PADC = dpx(10);

    // ---------- primitives ----------
    function rr(x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
        else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    }
    const col = (st, k, d) => { let c = engine.color(st[k], d); if (st._darken && c && c[0] === '#') c = mix(c, '#000000', st._darken); return c; };
    function gradientFor(st, x, y, w, h, base) {
        if (st.bg_grad) {
            const g = (env.doc.gradients || []).find(z => z.id === st.bg_grad);
            if (g && Array.isArray(g.stops)) {
                const d = String(g.direction || 'ver').toLowerCase();
                let gr;
                if (d.startsWith('hor')) gr = ctx.createLinearGradient(x, y, x + w, y);
                else if (d === 'radial' && ctx.createRadialGradient) gr = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2);
                else if (d === 'linear' && g.linear) { const P = (v, of) => /%$/.test(String(v)) ? parseFloat(v) / 100 * of : num(v, 0); gr = ctx.createLinearGradient(x + P(g.linear.from_x, w), y + P(g.linear.from_y, h), x + P(g.linear.to_x, w), y + P(g.linear.to_y, h)); }
                else gr = ctx.createLinearGradient(x, y, x, y + h);
                g.stops.forEach(s => { let pos = s.position; pos = /%$/.test(String(pos)) ? parseFloat(pos) / 100 : num(pos, 0); if (pos > 1) pos /= 255; gr.addColorStop(Math.max(0, Math.min(1, pos)), rgba(engine.color(s.color, '#000000'), engine.opa(s.opa, 1))); });
                return gr;
            }
        }
        const dir = String(st.bg_grad_dir || 'NONE').toUpperCase();
        if (dir !== 'HOR' && dir !== 'VER') return null;
        const gr = dir === 'HOR' ? ctx.createLinearGradient(x, y, x + w, y) : ctx.createLinearGradient(x, y, x, y + h);
        const a = engine.opa(st.bg_opa, 1);
        gr.addColorStop(Math.max(0, Math.min(1, num(st.bg_main_stop, 0) / 255)), rgba(base, a * engine.opa(st.bg_main_opa, 1)));
        gr.addColorStop(Math.max(0, Math.min(1, num(st.bg_grad_stop, 255) / 255)), rgba(col(st, 'bg_grad_color', '#000000'), a * engine.opa(st.bg_grad_opa, 1)));
        return gr;
    }
    function shadow(x, y, w, h, r, st) {
        const sw = num(st.shadow_width, 0), so = engine.opa(st.shadow_opa, 1);
        if (sw <= 0 || so <= 0) return;
        const sp = num(st.shadow_spread, 0), ox = num(st.shadow_offset_x, 0), oy = num(st.shadow_offset_y, 0), BIG = 10000;
        ctx.save();
        ctx.shadowColor = rgba(col(st, 'shadow_color', '#000000'), so);
        ctx.shadowBlur = sw * scale; ctx.shadowOffsetX = (ox + BIG) * scale; ctx.shadowOffsetY = oy * scale;
        ctx.fillStyle = '#000';
        rr(x - sp - BIG, y - sp, w + 2 * sp, h + 2 * sp, r + sp); ctx.fill();
        ctx.restore();
    }
    function imageInto(img, x, y, w, h, st, tiled) {
        const iw = img.width, ih = img.height;
        const draw = (c, dx, dy) => ctx.drawImage(c, dx, dy);
        let src = img;
        const rc = st.bg_image_recolor !== undefined ? col(st, 'bg_image_recolor', null) : null, ro = engine.opa(st.bg_image_recolor_opa, 0);
        if (rc && ro > 0) {
            const t = env.createCanvas(iw, ih), tc = t.getContext('2d');
            tc.drawImage(img, 0, 0); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = rgba(rc, ro); tc.fillRect(0, 0, iw, ih); src = t;
        }
        ctx.save(); ctx.globalAlpha *= engine.opa(st.bg_image_opa, 1);
        if (tiled) { for (let ty = y; ty < y + h; ty += ih) for (let tx = x; tx < x + w; tx += iw) draw(src, tx, ty); }
        else draw(src, Math.round(x + (w - iw) / 2), Math.round(y + (h - ih) / 2));
        ctx.restore();
    }
    function box(r, st, opts = {}) {
        const { x, y, w, h } = r; const rad = Math.min(num(st.radius, 0), w / 2, h / 2);
        shadow(x, y, w, h, rad, st);
        const bo = engine.opa(st.bg_opa, 1);
        const base = col(st, 'bg_color', '#FFFFFF');
        const grad = gradientFor(st, x, y, w, h, base);
        if (bo > 0 || grad) { rr(x, y, w, h, rad); ctx.fillStyle = grad || rgba(base, bo); ctx.fill(); }
        if (st.bg_image_src) {
            const img = assets.get(st.bg_image_src);
            if (img) { ctx.save(); rr(x, y, w, h, rad); ctx.clip(); imageInto(img, x, y, w, h, st, st.bg_image_tiled === true); ctx.restore(); }
        }
        if (!opts.noBorder) border(x, y, w, h, rad, st);
        const ow = num(st.outline_width, 0);
        if (ow > 0 && engine.opa(st.outline_opa, 1) > 0) {
            const op = num(st.outline_pad, 0) + ow / 2;
            rr(x - op, y - op, w + 2 * op, h + 2 * op, rad + op); ctx.lineWidth = ow; ctx.strokeStyle = rgba(col(st, 'outline_color', '#000000'), engine.opa(st.outline_opa, 1)); ctx.stroke();
        }
    }
    function border(x, y, w, h, rad, st) {
        const bw = num(st.border_width, 0); if (bw <= 0) return;
        const bopa = engine.opa(st.border_opa, 1); if (bopa <= 0) return;
        ctx.strokeStyle = rgba(col(st, 'border_color', '#000000'), bopa); ctx.lineWidth = bw;
        const side = [].concat(st.border_side || 'FULL').map(s => String(s).toUpperCase());
        if (side.includes('NONE')) return;
        if (side.includes('FULL') || (side.includes('TOP') && side.includes('BOTTOM') && side.includes('LEFT') && side.includes('RIGHT'))) {
            rr(x + bw / 2, y + bw / 2, w - bw, h - bw, Math.max(0, rad - bw / 2)); ctx.stroke(); return;
        }
        ctx.beginPath();
        if (side.includes('TOP')) { ctx.moveTo(x, y + bw / 2); ctx.lineTo(x + w, y + bw / 2); }
        if (side.includes('BOTTOM')) { ctx.moveTo(x, y + h - bw / 2); ctx.lineTo(x + w, y + h - bw / 2); }
        if (side.includes('LEFT')) { ctx.moveTo(x + bw / 2, y); ctx.lineTo(x + bw / 2, y + h); }
        if (side.includes('RIGHT')) { ctx.moveTo(x + w - bw / 2, y); ctx.lineTo(x + w - bw / 2, y + h); }
        ctx.stroke();
    }
    // text with wrapping, alignment, letter spacing, decoration and #RRGGBB recolor markup
    function text(str, r, st, opts = {}) {
        if (str === undefined || str === null || str === '') return;
        const f = engine.font(st.text_font), ls = num(st.text_line_space, 0), letter = num(st.text_letter_space, 0);
        const color = rgba(col(st, 'text_color', '#000000'), engine.opa(st.text_opa, 1));
        const lm = opts.longMode || 'WRAP';
        let lines = layout.textLines(String(str), f.css, opts.wrap === false ? 0 : r.w, letter, lm, !!opts.recolor);
        const totalH = lines.length * f.lh + (lines.length - 1) * ls;
        let y = opts.valign === 'center' ? r.y + (r.h - totalH) / 2 : r.y;
        const align = String(opts.align || st.text_align || 'AUTO').toUpperCase();
        ctx.font = f.css; ctx.textBaseline = 'middle';
        if ('letterSpacing' in ctx) ctx.letterSpacing = letter ? letter + 'px' : '0px';
        if (lm === 'DOT' && opts.clipLines !== false) {
            const maxLines = Math.max(1, Math.floor((r.h + ls) / (f.lh + ls)));
            if (lines.length > maxLines) lines = lines.slice(0, maxLines), lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '...');
            lines = lines.map(l => { if (measure(l, f.css, letter) <= r.w) return l; let s = l; while (s.length > 1 && measure(s + '...', f.css, letter) > r.w) s = s.slice(0, -1); return s + '...'; });
        }
        lines.forEach(line => {
            const segs = opts.recolor ? parseRecolor(line, color) : [{ t: line, c: color }];
            const lw = segs.reduce((a, s) => a + measure(s.t, f.css, letter), 0);
            let x = align === 'CENTER' ? r.x + (r.w - lw) / 2 : align === 'RIGHT' ? r.x + r.w - lw : r.x;
            const cy = y + f.lh / 2;
            segs.forEach(s => {
                ctx.fillStyle = s.c; ctx.textAlign = 'left'; ctx.fillText(s.t, x, cy);
                const sw = measure(s.t, f.css, letter);
                const decor = String(st.text_decor || 'NONE').toUpperCase();
                if (decor !== 'NONE') { ctx.fillRect(x, decor.includes('UNDER') ? cy + f.size * 0.45 : cy, sw, Math.max(1, f.size / 14)); }
                x += sw;
            });
            y += f.lh + ls;
        });
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        return { lines: lines.length, h: totalH, f };
    }
    function parseRecolor(line, def) {
        const out = []; const re = /#([0-9a-f]{6}) ([^#]*)#/gi; let last = 0, m;
        while ((m = re.exec(line))) { if (m.index > last) out.push({ t: line.slice(last, m.index), c: def }); out.push({ t: m[2], c: '#' + m[1] }); last = re.lastIndex; }
        if (last < line.length) out.push({ t: line.slice(last), c: def });
        return out;
    }
    function checkMark(cx, cy, s, color, w) {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(cx - s * .38, cy + s * .02); ctx.lineTo(cx - s * .1, cy + s * .3); ctx.lineTo(cx + s * .4, cy - s * .28); ctx.stroke(); ctx.restore();
    }
    function chevron(cx, cy, s, color, up) {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, s / 5); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); const d = up ? -1 : 1; ctx.moveTo(cx - s / 2, cy - d * s / 4); ctx.lineTo(cx, cy + d * s / 4); ctx.lineTo(cx + s / 2, cy - d * s / 4); ctx.stroke(); ctx.restore();
    }
    const part = (node, p, parentSt) => engine.resolve(node, p, statesOf(node), parentSt);
    const val = (node, k, d) => { const v = runtime.value(node, k); return num(v, d); };

    // ---------- widgets ----------
    const draw = {
        label(n, st) { text(runtime.value(n, 'text') ?? '', n._c, st, { longMode: String(n.props.long_mode || 'WRAP').toUpperCase(), recolor: n.props.recolor === true, wrap: n.props.width !== undefined && n.props.width !== 'SIZE_CONTENT' }); },
        button(n, st) { if (n.props.text !== undefined) text(n.props.text, n._c, st, { align: st.text_align && st.text_align !== 'AUTO' ? st.text_align : 'CENTER', valign: 'center', wrap: false }); },
        checkbox(n, st, ps) {
            const f = engine.font(st.text_font), c = n._c, s = f.lh, ind = part(n, 'indicator', st);
            const bx = { x: c.x, y: Math.round(c.y + (c.h - s) / 2), w: s, h: s };
            box(bx, ind);
            if (statesOf(n).has('checked')) checkMark(bx.x + s / 2, bx.y + s / 2, s * 0.8, col(ind, 'text_color', '#FFFFFF'), Math.max(1.5, s / 8));
            text(n.props.text ?? '', { x: c.x + s + num(st.pad_column, 8), y: c.y, w: Math.max(0, c.w - s), h: c.h }, st, { valign: 'center', wrap: false, align: 'LEFT' });
        },
        switch(n, st) {
            const r = n._r, on = statesOf(n).has('checked');
            const ind = part(n, 'indicator', st), knob = part(n, 'knob', st);
            if (on) box(r, { ...ind, bg_opa: ind.bg_opa === undefined ? 1 : ind.bg_opa, radius: num(ind.radius, r.h) });
            const kp = num(knob.pad_top, -3), kd = r.h + 2 * kp;
            const kx = on ? r.x + r.w - r.h - kp : r.x - kp;
            box({ x: kx + 0, y: r.y - kp, w: kd, h: kd }, knob);
        },
        bar(n, st) { barLike(n, st, false); },
        slider(n, st) { barLike(n, st, true); },
        arc(n, st) { arcLike(n, st, false); },
        spinner(n, st) { arcLike(n, st, true); },
        led(n, st) {
            const r = n._r, b = typeof n.props.brightness === 'string' ? parseFloat(n.props.brightness) / 100 : num(n.props.brightness, 1);
            const bright = Math.max(0, Math.min(1, b > 1 ? b / 255 : b));
            const c = engine.color(n.props.color, col(st, 'bg_color', '#2196F3'));
            const dim = mix(c, '#000000', 0.8 * (1 - bright));
            box(r, { ...st, bg_color: dim, shadow_color: c, shadow_opa: engine.opa(st.shadow_opa, 1) * bright, shadow_width: num(st.shadow_width, 15) * bright, shadow_spread: num(st.shadow_spread, 4) * bright, border_width: 0 });
            const g = ctx.createRadialGradient(r.x + r.w * .35, r.y + r.h * .3, 0, r.x + r.w / 2, r.y + r.h / 2, r.w / 2);
            g.addColorStop(0, `rgba(255,255,255,${0.55 * bright + 0.1})`); g.addColorStop(1, 'rgba(255,255,255,0)');
            rr(r.x, r.y, r.w, r.h, r.w / 2); ctx.fillStyle = g; ctx.fill();
        },
        line(n, st) {
            const pts = pointList(n.props.points); if (pts.length < 2) return;
            ctx.save(); ctx.strokeStyle = rgba(col(st, 'line_color', '#000000'), engine.opa(st.line_opa, 1)); ctx.lineWidth = num(st.line_width, 1);
            const rnd = st.line_rounded === true; ctx.lineCap = rnd ? 'round' : 'butt'; ctx.lineJoin = rnd ? 'round' : 'miter';
            const dw = num(st.line_dash_width, 0), dg = num(st.line_dash_gap, 0); if (dw && dg && ctx.setLineDash) ctx.setLineDash([dw, dg]);
            ctx.beginPath(); pts.forEach((p, i) => { const X = n._r.x + p[0], Y = n._r.y + p[1]; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); ctx.restore();
        },
        image(n, st) {
            const img = assets.get(n.props.src); const r = n._r;
            if (!img) return placeholder(r, n.props.src ? `${n.props.src}` : 'no image');
            const sc = num(n.props.scale, 1), rot = num(n.props.rotation, 0), iw = img.width * sc, ih = img.height * sc;
            ctx.save(); rr(r.x, r.y, r.w, r.h, 0); ctx.clip();
            const px = n.props.pivot_x !== undefined ? num(n.props.pivot_x, 0) : img.width / 2, py = n.props.pivot_y !== undefined ? num(n.props.pivot_y, 0) : img.height / 2;
            ctx.translate(r.x + num(n.props.offset_x, 0) + px * sc, r.y + num(n.props.offset_y, 0) + py * sc);
            if (rot) ctx.rotate(rot * Math.PI / 180);
            ctx.imageSmoothingEnabled = n.props.antialias === true || sc !== 1;
            let src = img;
            const rc = st.image_recolor !== undefined ? col(st, 'image_recolor', null) : null, ro = engine.opa(st.image_recolor_opa, 0);
            if (rc && ro > 0) { const t = env.createCanvas(img.width, img.height), tc = t.getContext('2d'); tc.drawImage(img, 0, 0); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = rgba(rc, ro); tc.fillRect(0, 0, img.width, img.height); src = t; }
            ctx.globalAlpha *= engine.opa(st.image_opa, 1);
            ctx.drawImage(src, -px * sc, -py * sc, iw, ih); ctx.restore();
        },
        animimg(n, st) { const src = [].concat(n.props.src || []); draw.image({ ...n, props: { ...n.props, src: src[0] } }, st); },
        qrcode(n, st) {
            const r = n._r, size = num(n.props.size, Math.min(r.w, r.h));
            const light = engine.color(n.props.light_color, '#FFFFFF'), darkc = engine.color(n.props.dark_color, '#000000');
            ctx.fillStyle = light; ctx.fillRect(r.x, r.y, size, size);
            const Q = env.qrcode; if (!Q) return placeholder(r, 'QR');
            try {
                const q = Q(0, 'M'); q.addData(String(n.props.text ?? '')); q.make();
                const cnt = q.getModuleCount(), m = size / cnt; ctx.fillStyle = darkc;
                for (let y = 0; y < cnt; y++) for (let x = 0; x < cnt; x++) if (q.isDark(y, x)) ctx.fillRect(r.x + Math.floor(x * m), r.y + Math.floor(y * m), Math.ceil(m), Math.ceil(m));
            } catch (e) { placeholder(r, 'QR: text too long'); }
        },
        dropdown(n, st) {
            const opts = optionList(n.props.options), i = Math.max(0, Math.min(val(n, 'selected_index', 0), opts.length - 1));
            const c = n._c, f = engine.font(st.text_font), ind = part(n, 'indicator', st);
            text(n.props.text !== undefined ? n.props.text : (opts[i] ?? ''), { x: c.x, y: c.y, w: c.w - f.size - 4, h: c.h }, st, { valign: 'center', wrap: false, longMode: 'DOT', align: 'LEFT' });
            const dir = String(n.props.dir || 'BOTTOM').toUpperCase();
            chevron(c.x + c.w - f.size / 2, c.y + c.h / 2, f.size * 0.6, col(ind, 'text_color', col(st, 'text_color', '#212121')), dir === 'TOP');
        },
        roller(n, st) {
            const opts = optionList(n.props.options), c = n._c, f = engine.font(st.text_font), ls = num(st.text_line_space, 0), rowH = f.lh + ls;
            const sel = Math.max(0, Math.min(val(n, 'selected_index', 0), opts.length - 1)), selSt = part(n, 'selected', st);
            const mid = c.y + c.h / 2;
            ctx.save(); rr(n._r.x, n._r.y, n._r.w, n._r.h, num(st.radius, 0)); ctx.clip();
            box({ x: n._r.x, y: Math.round(mid - rowH / 2), w: n._r.w, h: rowH }, { ...selSt, radius: 0, border_width: 0, shadow_width: 0 }, { noBorder: true });
            const infinite = String(n.props.mode || '').toUpperCase() === 'INFINITE';
            for (let k = -6; k <= 6; k++) {
                let idx = sel + k; if (infinite) idx = ((idx % opts.length) + opts.length) % opts.length;
                if (idx < 0 || idx >= opts.length) continue;
                text(opts[idx], { x: c.x, y: mid - rowH / 2 + k * rowH + ls / 2, w: c.w, h: f.lh }, k === 0 ? { ...st, text_color: selSt.text_color ?? st.text_color } : st, { align: st.text_align || 'CENTER', wrap: false });
            }
            ctx.restore();
        },
        textarea(n, st) {
            const tv = runtime.value(n, 'text'), c = n._c, has = tv !== undefined && tv !== '', focused = statesOf(n).has('focused');
            let t = has ? String(tv) : '';
            if (has && n.props.password_mode) t = '\u2022'.repeat(t.length);
            const one = n.props.one_line === true;
            if (has) text(t, c, st, { wrap: !one, valign: one ? 'center' : undefined });
            else text(n.props.placeholder_text ?? '', c, part(n, 'textarea_placeholder', st), { wrap: !one, valign: one ? 'center' : undefined });
            if (focused) {
                const f = engine.font(st.text_font), cur = part(n, 'cursor', st);
                const x = c.x + Math.min(c.w - 1, has ? measure(t.split('\n').pop(), f.css) : 0) + 1;
                ctx.fillStyle = col(cur, 'border_color', '#2196F3'); ctx.fillRect(Math.round(x), Math.round(one ? c.y + (c.h - f.lh) / 2 : c.y), Math.max(1, num(cur.border_width, 2)), f.lh);
            }
        },
        spinbox(n, st) {
            const digits = Math.max(1, num(n.props.digits, 4)), dp = Math.max(0, num(n.props.decimal_places, 0)), v = val(n, 'value', 0);
            const neg = v < 0; let s = Math.abs(v).toFixed(dp).replace('.', ''); s = s.padStart(digits, '0').slice(-digits);
            const textStr = (neg ? '-' : (num(n.props.range_from, 0) < 0 ? '+' : '')) + (dp ? s.slice(0, digits - dp) + '.' + s.slice(digits - dp) : s);
            const c = n._c, f = engine.font(st.text_font), cur = part(n, 'cursor', st);
            const total = measure(textStr, f.css), x0 = c.x + (c.w - total) / 2;
            // highlight the selected digit (counted from the right, like LVGL)
            const sd = Math.max(0, Math.min(digits - 1, num(n.props.selected_digit, 0)));
            let idx = textStr.length - 1, count = 0; while (idx >= 0) { if (/\d/.test(textStr[idx])) { if (count === sd) break; count++; } idx--; }
            if (idx >= 0) { const before = measure(textStr.slice(0, idx), f.css), w = measure(textStr[idx], f.css); ctx.fillStyle = rgba(col(cur, 'bg_color', '#2196F3'), engine.opa(cur.bg_opa, 1)); ctx.fillRect(Math.round(x0 + before), Math.round(c.y + (c.h - f.lh) / 2), Math.ceil(w), f.lh); }
            text(textStr, c, st, { align: 'CENTER', valign: 'center', wrap: false });
            if (idx >= 0) { const before = measure(textStr.slice(0, idx), f.css); text(textStr[idx], { x: x0 + before, y: c.y, w: 40, h: c.h }, { ...st, text_color: col(cur, 'text_color', '#FFFFFF') }, { align: 'LEFT', valign: 'center', wrap: false }); }
        },
        buttonmatrix(n, st) { matrix(n, st, (n.props.rows || []).map(r => (r.buttons || []).map(b => ({ text: b.text ?? '', w: num(b.width, 1), checked: !!(b.control && b.control.checked) || b.selected === true, hidden: !!(b.control && b.control.hidden) })))); },
        keyboard(n, st) {
            const mode = String(runtime.value(n, 'mode') || 'TEXT_LOWER').toUpperCase(), k = (t, w = 1, special = false) => ({ text: t, w, special });
            const L = 'qwertyuiop', U = L.toUpperCase();
            let rows;
            if (mode === 'NUMBER') rows = [['1', '2', '3', SYM.backspace].map((t, i) => k(t, 1, i === 3)), ['4', '5', '6', SYM.ok].map((t, i) => k(t, 1, i === 3)), ['7', '8', '9', SYM.left].map((t, i) => k(t, 1, i === 3)), ['+/-', '0', '.', SYM.right].map((t, i) => k(t, 1, i === 3))];
            else if (mode === 'TEXT_SPECIAL') rows = [[k('1#', 1, true), ...'+-/*=%!?#<>'.split('').map(t => k(t)), k(SYM.backspace, 2, true)], [k('abc', 1, true), ...'\\@$()[]{};\'"'.split('').slice(0, 9).map(t => k(t)), k(SYM.newline, 2, true)], [...'_~&^`|:,.'.split('').map(t => k(t))], [k(SYM.keyboard, 2, true), k(SYM.left, 2, true), k(' ', 6), k(SYM.right, 2, true), k(SYM.ok, 2, true)]];
            else { const up = mode === 'TEXT_UPPER', row1 = (up ? U : L).split(''), row2 = (up ? 'ASDFGHJKL' : 'asdfghjkl').split(''), row3 = (up ? 'ZXCVBNM' : 'zxcvbnm').split('');
                rows = [[k('1#', 1, true), ...row1.map(t => k(t)), k(SYM.backspace, 2, true)], [k(up ? 'abc' : 'ABC', 2, true), ...row2.map(t => k(t)), k(SYM.newline, 2, true)], [k('_'), k('-'), ...row3.map(t => k(t)), k('.'), k(','), k(':')], [k(SYM.keyboard, 2, true), k(SYM.left, 2, true), k(' ', 6), k(SYM.right, 2, true), k(SYM.ok, 2, true)]]; }
            matrix(n, st, rows);
        },
        table(n, st) {
            const T = n._table; if (!T) return;
            const items = part(n, 'items', st), c = n._c; let y = c.y;
            T.rows.forEach(row => {
                let x = c.x;
                for (let ci = 0; ci < T.cols; ci++) {
                    const w = T.widths[ci], cell = row[ci];
                    box({ x, y, w, h: T.rowH }, { ...items, radius: 0 });
                    if (cell) text(String(cell.text ?? ''), { x: x + num(items.pad_left, 8), y, w: w - num(items.pad_left, 8) - num(items.pad_right, 8), h: T.rowH }, items, { valign: 'center', wrap: false, longMode: 'DOT' });
                    x += w;
                }
                y += T.rowH;
            });
        },
        tabview(n, st) {
            const T = n._tab; if (!T) return;
            const r = n._c, p = engine.palette(), active = Math.min(runtime.activeTab(n), Math.max(0, T.tabs.length - 1));
            const vert = T.pos === 'LEFT' || T.pos === 'RIGHT';
            const bar = T.pos === 'TOP' ? { x: r.x, y: r.y, w: r.w, h: T.barH } : T.pos === 'BOTTOM' ? { x: r.x, y: r.y + r.h - T.barH, w: r.w, h: T.barH } : T.pos === 'LEFT' ? { x: r.x, y: r.y, w: T.barH, h: r.h } : { x: r.x + r.w - T.barH, y: r.y, w: T.barH, h: r.h };
            box(bar, { bg_color: engine.dark() ? '#202226' : '#FFFFFF', bg_opa: 1, radius: 0, shadow_color: '#000000', shadow_opa: engine.dark() ? 0 : 0.08, shadow_width: 6 });
            const n0 = Math.max(1, T.tabs.length), f = engine.font(st.text_font);
            T.tabs.forEach((t, i) => {
                const cell = vert ? { x: bar.x, y: bar.y + i * bar.h / n0, w: bar.w, h: bar.h / n0 } : { x: bar.x + i * bar.w / n0, y: bar.y, w: bar.w / n0, h: bar.h };
                const on = i === active;
                text(String(t.name ?? t.id ?? `Tab ${i + 1}`), cell, { ...st, text_color: on ? p.primary : st.text_color, text_font: st.text_font }, { align: 'CENTER', valign: 'center', wrap: false, longMode: 'DOT' });
                if (on) { ctx.fillStyle = p.primary; const t3 = dpx(3); if (vert) ctx.fillRect(T.pos === 'LEFT' ? cell.x + cell.w - t3 : cell.x, cell.y, t3, cell.h); else ctx.fillRect(cell.x, T.pos === 'TOP' ? cell.y + cell.h - t3 : cell.y, cell.w, t3); }
            });
            void f;
        },
        meter(n, st) {
            const r = n._c, cx = r.x + r.w / 2, cy = r.y + r.h / 2, R = Math.min(r.w, r.h) / 2;
            const tickSt = part(n, 'ticks', st);
            (n.props.scales || []).forEach(sc => {
                const from = num(sc.range_from, 0), to = num(sc.range_to, 100), range = num(sc.angle_range, 270), rot = num(sc.rotation, 90 + (360 - range) / 2);
                const ang = v => (rot + (v - from) / Math.max(1e-9, to - from) * range) * Math.PI / 180;
                (sc.indicators || []).forEach(ind => {
                    if (ind.arc) { const a = ind.arc; ctx.save(); ctx.strokeStyle = engine.color(a.color, '#2196F3'); ctx.lineWidth = num(a.width, 4); ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, R + num(a.r_mod, 0) - num(a.width, 4) / 2), ang(num(a.start_value, from)), ang(num(a.end_value, num(a.value, to)))); ctx.stroke(); ctx.restore(); }
                    if (ind.tick_style) { /* colours ticks in a range; drawn with the ticks below */ }
                });
                const t = sc.ticks || {}, count = Math.max(2, num(t.count, 12)), major = t.major || null, stride = major ? Math.max(1, num(major.stride, 3)) : 0;
                for (let i = 0; i < count; i++) {
                    const isMaj = stride && i % stride === 0, a = ang(from + (to - from) * i / (count - 1));
                    const len = isMaj ? lenOf(major.length, 15, R) : lenOf(t.length, 10, R), w = isMaj ? num(major.width, 5) : num(t.width, 2);
                    const ro = R + num(t.radial_offset, 0);
                    ctx.strokeStyle = engine.color(isMaj ? major.color : t.color, '#9E9E9E'); ctx.lineWidth = w;
                    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * ro, cy + Math.sin(a) * ro); ctx.lineTo(cx + Math.cos(a) * (ro - len), cy + Math.sin(a) * (ro - len)); ctx.stroke();
                    if (isMaj) {
                        const v = Math.round(from + (to - from) * i / (count - 1)), gap = num(major.label_gap, 4), f = engine.font(tickSt.text_font), lr = ro - len - gap - f.size * 0.7;
                        ctx.font = f.css; ctx.fillStyle = col(tickSt, 'text_color', '#212121'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(String(v), cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
                    }
                }
                (sc.indicators || []).forEach(ind => {
                    if (ind.line) { const l = ind.line, a = ang(num(runtime.indicator ? runtime.indicator(l) : l.value, from)); ctx.save(); ctx.strokeStyle = engine.color(l.color, '#212121'); ctx.lineWidth = num(l.width, 4); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); const L = R + num(l.r_mod, 0); ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.stroke(); ctx.restore(); }
                    if (ind.image) { const img = assets.get(ind.image.src); if (img) { const a = ang(num(ind.image.value, from)); ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.drawImage(img, -num(ind.image.pivot_x, 0), -num(ind.image.pivot_y, img.height / 2)); ctx.restore(); } }
                });
            });
            const ind = part(n, 'indicator', st), kd = dpx(14);
            box({ x: cx - kd / 2, y: cy - kd / 2, w: kd, h: kd }, ind);
        },
        canvas(n, st) { if (n.props.transparent !== true) { ctx.fillStyle = engine.dark() ? '#000000' : '#FFFFFF'; ctx.fillRect(n._r.x, n._r.y, n._r.w, n._r.h); } },
        tileview() {}, obj() {}, container() {}, list() {}
    };
    function lenOf(v, d, R) { if (typeof v === 'string' && /%$/.test(v)) return parseFloat(v) / 100 * R; return num(v, d); }
    function placeholder(r, label) {
        ctx.save(); rr(r.x, r.y, r.w, r.h, 4); ctx.clip();
        ctx.fillStyle = engine.dark() ? '#2a2d35' : '#ECEFF4'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = engine.dark() ? '#4a4f5a' : '#C5CBD6'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.stroke();
        ctx.fillStyle = engine.dark() ? '#9aa3b2' : '#6B7280'; ctx.font = '600 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(label).slice(0, 24), r.x + r.w / 2, r.y + r.h / 2); ctx.restore();
    }
    function barLike(n, st, isSlider) {
        const r = n._r, ind = part(n, 'indicator', st);
        const min = num(n.props.min_value, 0), max = num(n.props.max_value, 100), v = val(n, 'value', 0), sv = num(n.props.start_value, min);
        const mode = String(n.props.mode || 'NORMAL').toUpperCase();
        const vert = r.h > r.w, span = Math.max(1e-9, max - min), clampF = x => Math.max(0, Math.min(1, (x - min) / span));
        let a = 0, b = clampF(v);
        if (mode === 'RANGE') a = clampF(sv); else if (mode === 'SYMMETRICAL') { const z = clampF(Math.max(min, Math.min(max, 0))); a = Math.min(z, b); b = Math.max(z, b); }
        const ir = vert ? { x: r.x, y: r.y + r.h * (1 - b), w: r.w, h: r.h * (b - a) } : { x: r.x + r.w * a, y: r.y, w: r.w * (b - a), h: r.h };
        if (ir.w > 0.5 && ir.h > 0.5) {
            ctx.save(); rr(r.x, r.y, r.w, r.h, Math.min(num(st.radius, 0), r.w / 2, r.h / 2)); ctx.clip();
            box(ir, { ...ind, radius: num(ind.radius, 0) }); ctx.restore();
        }
        if (isSlider) {
            const knob = part(n, 'knob', st), kp = num(knob.pad_top, 5), d = (vert ? r.w : r.h) + 2 * kp;
            const pos = vert ? r.y + r.h * (1 - clampF(v)) : r.x + r.w * clampF(v);
            const kr = vert ? { x: r.x - kp, y: pos - d / 2, w: d, h: d } : { x: pos - d / 2, y: r.y - kp, w: d, h: d };
            box(kr, knob);
            if (mode === 'RANGE') { const p2 = vert ? r.y + r.h * (1 - a) : r.x + r.w * a; box(vert ? { ...kr, y: p2 - d / 2 } : { ...kr, x: p2 - d / 2 }, knob); }
        }
    }
    function arcLike(n, st, spinner) {
        const c = n._c, ind = part(n, 'indicator', st);
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2, R = Math.min(c.w, c.h) / 2;
        const aw = num(st.arc_width, 12), iw = num(ind.arc_width, aw);
        const stroke = (s, from, to, w, opa) => {
            if (engine.opa(s.arc_opa, 1) <= 0 || w <= 0) return;
            ctx.save(); ctx.strokeStyle = rgba(col(s, 'arc_color', '#2196F3'), engine.opa(s.arc_opa, 1) * (opa ?? 1)); ctx.lineWidth = w; ctx.lineCap = s.arc_rounded === false ? 'butt' : 'round';
            ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, R - w / 2), from * Math.PI / 180, to * Math.PI / 180); ctx.stroke(); ctx.restore();
        };
        if (spinner) {
            stroke(st, 0, 360, aw);
            const len = num(n.props.arc_length, 60), t = env.now ? env.now() : 0, spin = parseFloat(String(n.props.spin_time || '1s')) * (/ms$/.test(String(n.props.spin_time)) ? 1 : 1000) || 1000;
            const start = -90 + (t % spin) / spin * 360;
            stroke(ind, start, start + len, iw);
            return;
        }
        const rot = num(n.props.rotation, 0), bs = num(n.props.start_angle, 135) + rot, be0 = num(n.props.end_angle, 45) + rot;
        let be = be0; while (be <= bs) be += 360;
        stroke(st, bs, be, aw);
        const min = num(n.props.min_value, 0), max = num(n.props.max_value, 100), v = Math.max(min, Math.min(max, val(n, 'value', 0)));
        const f = (v - min) / Math.max(1e-9, max - min), sweep = be - bs, mode = String(n.props.mode || 'NORMAL').toUpperCase();
        let is = bs, ie = bs + sweep * f;
        if (mode === 'REVERSE') { is = be - sweep * f; ie = be; }
        if (mode === 'SYMMETRICAL') { const mid = bs + sweep / 2; is = Math.min(mid, bs + sweep * f); ie = Math.max(mid, bs + sweep * f); }
        if (ie - is > 0.1) stroke(ind, is, ie, iw);
        const knob = part(n, 'knob', st);
        if (engine.opa(knob.bg_opa, 1) > 0) {
            const ka = (mode === 'REVERSE' ? is : ie) * Math.PI / 180, kr = R - aw / 2, kd = iw + 2 * num(knob.pad_top, 4);
            box({ x: cx + Math.cos(ka) * kr - kd / 2, y: cy + Math.sin(ka) * kr - kd / 2, w: kd, h: kd }, knob);
        }
    }
    function matrix(n, st, rows) {
        const c = n._c, items0 = engine.resolve(n, 'items', statesOf(n), st), gapR = num(st.pad_row, 4), gapC = num(st.pad_column, 4);
        const rh = rows.length ? (c.h - gapR * (rows.length - 1)) / rows.length : 0;
        const pressed = runtime.matrixPressed ? runtime.matrixPressed(n) : null;
        n._cells = [];
        rows.forEach((row, ri) => {
            const units = row.reduce((a, b) => a + b.w, 0) || 1, free = c.w - gapC * (row.length - 1);
            let x = c.x; const y = c.y + ri * (rh + gapR);
            row.forEach((b, bi) => {
                const w = free * b.w / units; const key = ri + ':' + bi;
                if (!b.hidden) {
                    const states = new Set(statesOf(n)); if (b.checked) states.add('checked'); if (pressed === key) states.add('pressed');
                    let it = engine.resolve(n, 'items', states, st);
                    if (b.special) it = { ...it, bg_color: engine.dark() ? '#3a3d42' : '#C9CDD3' };
                    box({ x, y, w, h: rh }, it);
                    text(b.text, { x, y, w, h: rh }, it, { align: 'CENTER', valign: 'center', wrap: false });
                    n._cells.push({ key, x, y, w, h: rh, text: b.text });
                }
                x += w + gapC;
            });
        });
        void items0;
    }

    // ---------- traversal ----------
    function drawNode(n, parentSt) {
        const st = n._st || engine.resolve(n, 'main', statesOf(n), parentSt);
        const r = n._r; if (!r) return;
        ctx.save();
        const o = engine.opa(st.opa, 1); if (o < 1) ctx.globalAlpha *= o;
        const rot = num(st.transform_rotation, 0), scl = num(st.transform_scale, 1);
        if (rot || scl !== 1) {
            const pxv = st.transform_pivot_x !== undefined ? num(st.transform_pivot_x, 0) : r.w / 2, pyv = st.transform_pivot_y !== undefined ? num(st.transform_pivot_y, 0) : r.h / 2;
            ctx.translate(r.x + pxv, r.y + pyv); if (rot) ctx.rotate(rot * Math.PI / 180); if (scl !== 1) ctx.scale(scl, scl); ctx.translate(-(r.x + pxv), -(r.y + pyv));
        }
        const own = ['switch', 'bar', 'slider', 'arc', 'spinner', 'led', 'line', 'qrcode'];
        if (!own.includes(n.type)) box(r, st);
        else if (['switch', 'bar', 'slider'].includes(n.type)) box(r, st);
        (draw[n.type] || ((nn) => placeholder(nn._r, nn.type)))(n, st, parentSt);
        const kids = n._kids || [];
        if (kids.length) {
            ctx.save();
            const overflow = n.props && (n.props.overflow_visible === true || (n.props.flags && n.props.flags.overflow_visible));
            if (!overflow) { rr(r.x, r.y, r.w, r.h, st.clip_corner === true ? num(st.radius, 0) : 0); ctx.clip(); }
            kids.forEach(k => drawNode(k, st));
            ctx.restore();
        }
        ctx.restore();
    }

    // draw a whole page; returns the layout (rects for hit testing)
    function render(target, doc, page, W, H, opts = {}) {
        ctx = target; scale = opts.scale || 1; env.doc = doc;
        const scr = engine.screen(page, doc.lvglTop);
        ctx.save();
        ctx.clearRect(0, 0, W, H);
        box({ x: 0, y: 0, w: W, h: H }, { ...scr, radius: 0, border_width: 0, shadow_width: 0 });
        let res = { all: [], byId: new Map(), root: null };
        const layers = [];
        if (doc.bottomLayer && doc.bottomLayer.widgets && doc.bottomLayer.widgets.length) layers.push({ props: doc.bottomLayer.props || {}, widgets: doc.bottomLayer.widgets });
        layers.push({ props: page ? page.props || {} : {}, widgets: page ? page.widgets : [], main: true });
        if (doc.topLayer && doc.topLayer.widgets && doc.topLayer.widgets.length) layers.push({ props: doc.topLayer.props || {}, widgets: doc.topLayer.widgets });
        layers.forEach(L => {
            const lr = layout.run(L.widgets || [], scr, W, H, L.props);
            if (L.main) res = lr;
            else { lr.all.forEach(n => res.all.push(n)); }
            (lr.root._kids || []).forEach(k => drawNode(k, scr));
        });
        ctx.restore();
        return res;
    }
    return { render, measure };
}
