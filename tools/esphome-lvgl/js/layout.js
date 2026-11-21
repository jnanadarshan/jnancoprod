// Layout engine: computes absolute rectangles for every widget the way LVGL does:
// px / % / SIZE_CONTENT sizes, x/y relative to the parent's content area, align + align_to,
// and flex / grid layouts. Results are stored on node._r (rect) and node._c (content rect).
import { DEFAULT_SIZE, dpx } from './theme.js';

const ALIGN_F = {
    TOP_LEFT: [0, 0], TOP_MID: [.5, 0], TOP_RIGHT: [1, 0], LEFT_MID: [0, .5], CENTER: [.5, .5], RIGHT_MID: [1, .5],
    BOTTOM_LEFT: [0, 1], BOTTOM_MID: [.5, 1], BOTTOM_RIGHT: [1, 1], DEFAULT: [0, 0]
};
const isPct = v => typeof v === 'string' && /^-?\d+(\.\d+)?%$/.test(v.trim());
const pct = (v, of) => Math.round(parseFloat(v) / 100 * of);
const isContent = v => typeof v === 'string' && /^size_content$/i.test(v.trim());

export function createLayout(engine, opts) {
    const { measure, imageSize, virtualChildren, statesOf } = opts;
    const num = engine.num;
    const all = [];      // flat list in draw order
    const byId = new Map();

    const padOf = st => ({
        t: num(st.pad_top, 0) + num(st.border_width, 0), b: num(st.pad_bottom, 0) + num(st.border_width, 0),
        l: num(st.pad_left, 0) + num(st.border_width, 0), r: num(st.pad_right, 0) + num(st.border_width, 0)
    });
    const hidden = n => n._rtHidden !== undefined ? n._rtHidden : !!(n.props && (n.props.hidden === true || (n.props.flags && n.props.flags.hidden === true)));
    const flag = (n, f) => !!(n.props && (n.props[f] === true || (n.props.flags && n.props.flags[f] === true)));

    // recolor: "#RRGGBB text#" markup is kept in the lines (the renderer colours it) but ignored when measuring
    function textLines(text, fontCss, maxW, letter, longMode, recolor) {
        const raw = String(text == null ? '' : text).split('\n');
        const m = s => measure(recolor ? s.replace(/#[0-9a-f]{6} ([^#]*)#/gi, '$1') : s, fontCss, letter);
        if (!maxW || longMode === 'CLIP' || longMode === 'SCROLL' || longMode === 'SCROLL_CIRCULAR' || longMode === 'DOT') return raw;
        const out = [];
        raw.forEach(line => {
            if (m(line) <= maxW) { out.push(line); return; }
            let cur = '';
            line.split(/(\s+)/).forEach(word => {
                const tryS = cur + word;
                if (m(tryS) <= maxW || !cur) cur = tryS;
                else { out.push(cur.trimEnd()); cur = word.trimStart(); }
            });
            out.push(cur);
        });
        return out;
    }

    // intrinsic content size (inside padding) for SIZE_CONTENT
    function intrinsic(node, st, availW) {
        const p = node.props || {}, f = engine.font(st.text_font), ls = num(st.text_line_space, 0), letter = num(st.text_letter_space, 0);
        const textSize = (t, maxW) => {
            const rc = p.recolor === true, lines = textLines(t, f.css, maxW, letter, p.long_mode, rc);
            const w = Math.max(0, ...lines.map(l => measure(rc ? l.replace(/#[0-9a-f]{6} ([^#]*)#/gi, '$1') : l, f.css, letter)));
            return { w: Math.ceil(w), h: lines.length * f.lh + Math.max(0, lines.length - 1) * ls };
        };
        switch (node.type) {
            case 'label': return textSize(p.text ?? '', availW);
            case 'button': return p.text !== undefined ? textSize(p.text) : null;
            case 'checkbox': { const t = textSize(p.text ?? ''); return { w: f.lh + num(st.pad_column, 0) + t.w, h: Math.max(f.lh, t.h) }; }
            case 'dropdown': case 'spinbox': return { w: 100, h: f.lh };
            case 'textarea': return { w: 100, h: p.one_line ? f.lh : f.lh * 3 };
            case 'roller': {
                const opts = optionList(p.options), rows = num(p.visible_row_count, 3);
                const w = Math.max(40, ...opts.map(o => measure(o, f.css, letter))) + dpx(20);
                return { w: Math.ceil(w), h: rows * f.lh + (rows - 1) * ls };
            }
            case 'image': { const s = imageSize(p.src); const sc = num(p.scale, 1); return s ? { w: Math.round(s.w * sc), h: Math.round(s.h * sc) } : { w: 48, h: 48 }; }
            case 'animimg': { const s = imageSize([].concat(p.src || [])[0]); return s ? { w: s.w, h: s.h } : { w: 48, h: 48 }; }
            case 'line': {
                const pts = pointList(p.points); const lw = num(st.line_width, 1);
                return { w: Math.max(1, ...pts.map(q => q[0])) + lw, h: Math.max(1, ...pts.map(q => q[1])) + lw };
            }
            case 'qrcode': { const s = num(p.size, 100); return { w: s, h: s }; }
            case 'table': return tableSize(node, st, f);
        }
        return null;
    }
    function tableSize(node, st, f) {
        const rows = (node.props.rows || []).map(r => (r && r.cells) || []);
        const cols = Math.max(0, ...rows.map(r => r.length));
        const cell = engine.resolve(node, 'items', null, st), padH = num(cell.pad_left, 8) + num(cell.pad_right, 8), padV = num(cell.pad_top, 8) + num(cell.pad_bottom, 8);
        const widths = Array.from({ length: cols }, (_, c) => {
            const w = node.props.columns && node.props.columns[c] && node.props.columns[c].width;
            return typeof w === 'number' ? w : Math.max(40, ...rows.map(r => r[c] ? measure(String(r[c].text ?? ''), f.css, 0) + padH : 0));
        });
        node._table = { widths, rowH: f.lh + padV, cols, rows };
        return { w: widths.reduce((a, b) => a + b, 0), h: rows.length * (f.lh + padV) };
    }

    function sizeAxis(v, def, of, content, padSum) {
        let s = v !== undefined && v !== null ? v : def;
        if (typeof s === 'number') return s;
        if (isPct(s)) return pct(s, of);
        if (isContent(s)) return content !== null && content !== undefined ? content + padSum : null;
        const n = parseFloat(s); return isNaN(n) ? null : n;
    }

    // measure a node's outer size given the parent's content size
    function sizeOf(node, parentStyle, cw, ch) {
        const st = engine.resolve(node, 'main', statesOf(node), parentStyle);
        node._st = st;
        const p = node.props || {}, pad = padOf(st);
        let def = DEFAULT_SIZE[node.type] || [100, 50];
        if (node.type === 'textarea' && p.one_line === true) def = [def[0], 'SIZE_CONTENT'];
        let w = sizeAxis(p.width, def[0], cw, null, 0), h = sizeAxis(p.height, def[1], ch, null, 0);
        if (w === null || h === null) {
            // fixed width: text wraps inside it; content width: text does not wrap (LVGL behaviour)
            const innerW = w !== null ? Math.max(0, w - pad.l - pad.r) : null;
            let inner = intrinsic(node, st, innerW);
            if (!inner && node.children && node.children.length) inner = childrenExtent(node, st, innerW !== null ? innerW : Math.max(0, cw - pad.l - pad.r), h !== null ? h - pad.t - pad.b : ch);
            if (!inner) inner = { w: 50, h: 30 };
            if (w === null) w = inner.w + pad.l + pad.r;
            if (h === null) h = inner.h + pad.t + pad.b;
        }
        const clamp = (v, mn, mx, of) => { const a = mn !== undefined ? sizeAxis(mn, 0, of, null, 0) : null, b = mx !== undefined ? sizeAxis(mx, 0, of, null, 0) : null; if (a !== null && v < a) v = a; if (b !== null && b > 0 && v > b) v = b; return v; };
        w = clamp(w, p.min_width, p.max_width, cw); h = clamp(h, p.min_height, p.max_height, ch);
        return { w: Math.max(0, Math.round(w)), h: Math.max(0, Math.round(h)), st };
    }
    function childrenExtent(node, st, availW, availH) {
        // provisional layout of children at origin to find how big SIZE_CONTENT has to be
        const tmp = { x: 0, y: 0, w: availW, h: availH };
        const saved = all.length;
        placeChildren(node, st, tmp, true);
        all.length = saved;
        let r = 0, b = 0;
        (node.children || []).forEach(c => { if (c._r && !hidden(c) && !flag(c, 'floating')) { r = Math.max(r, c._r.x + c._r.w); b = Math.max(b, c._r.y + c._r.h); } });
        return { w: r, h: b };
    }

    function parseLayout(node) {
        const l = node && node.props && node.props.layout;
        if (!l) return node && node.type === 'list' ? { type: 'flex', flex_flow: 'COLUMN' } : null;
        if (typeof l === 'string') {
            const m = l.trim().match(/^(\d*)x(\d*)$/i);
            if (m) {
                const kids = (node.children || []).filter(c => !hidden(c)).length;
                let rows = m[1] ? +m[1] : 0, cols = m[2] ? +m[2] : 0;
                if (!rows && !cols) rows = cols = 1;
                if (!rows) rows = Math.max(1, Math.ceil(kids / cols)); if (!cols) cols = Math.max(1, Math.ceil(kids / rows));
                return { type: 'grid', rows: Array(rows).fill('fr(1)'), cols: Array(cols).fill('fr(1)'), shorthand: true };
            }
            if (/^flex$/i.test(l)) return { type: 'flex' };
            if (/^grid$/i.test(l)) return { type: 'grid', rows: ['fr(1)'], cols: ['fr(1)'] };
            return null;
        }
        if (typeof l === 'object') {
            const t = String(l.type || '').toLowerCase();
            if (t === 'none') return null;
            if (t === 'flex') return { type: 'flex', ...l };
            if (t === 'grid') {
                const tracks = v => typeof v === 'number' ? Array(Math.max(1, v)).fill('fr(1)') : Array.isArray(v) ? v : (v ? [v] : ['fr(1)']);
                return { type: 'grid', ...l, rows: tracks(l.grid_rows), cols: tracks(l.grid_columns) };
            }
        }
        return null;
    }

    function placeFree(c, sz, content) {
        const p = c.props || {};
        // LVGL creates keyboards aligned to the bottom of their parent
        const a = ALIGN_F[String(p.align || (c.type === 'keyboard' ? 'BOTTOM_MID' : 'DEFAULT')).toUpperCase()] || ALIGN_F.DEFAULT;
        const ox = isPct(p.x) ? pct(p.x, content.w) : num(p.x, 0), oy = isPct(p.y) ? pct(p.y, content.h) : num(p.y, 0);
        return { x: Math.round(content.x + a[0] * (content.w - sz.w) + ox), y: Math.round(content.y + a[1] * (content.h - sz.h) + oy) };
    }

    function flexPlace(items, L, content, st) {
        const flow = String(L.flex_flow || 'ROW_WRAP').toUpperCase();
        const col = flow.startsWith('COLUMN'), wrap = flow.includes('WRAP'), rev = flow.includes('REVERSE');
        const gapMain = num(L[col ? 'pad_row' : 'pad_column'], num(st[col ? 'pad_row' : 'pad_column'], 0));
        const gapCross = num(L[col ? 'pad_column' : 'pad_row'], num(st[col ? 'pad_column' : 'pad_row'], 0));
        const mainSize = col ? content.h : content.w, crossSize = col ? content.w : content.h;
        const M = o => col ? o.h : o.w, C = o => col ? o.w : o.h;
        const tracks = []; let cur = [], used = 0;
        items.forEach(it => {
            const m = M(it.sz);
            if (wrap && cur.length && used + gapMain + m > mainSize) { tracks.push(cur); cur = []; used = 0; }
            used += (cur.length ? gapMain : 0) + m; cur.push(it);
        });
        if (cur.length) tracks.push(cur);
        const trackCross = tracks.map(t => Math.max(0, ...t.map(it => C(it.sz))));
        const totalCross = trackCross.reduce((a, b) => a + b, 0) + gapCross * Math.max(0, tracks.length - 1);
        const at = String(L.flex_align_track || 'START').toUpperCase();
        let cpos = at === 'END' ? crossSize - totalCross : at === 'CENTER' ? (crossSize - totalCross) / 2 : 0;
        if (tracks.length === 1 && !wrap) trackCross[0] = Math.max(trackCross[0], crossSize); // single track spans the cross axis
        tracks.forEach((t, ti) => {
            const grow = t.reduce((a, it) => a + Math.max(0, num(it.node.props && it.node.props.flex_grow, 0)), 0);
            let sum = t.reduce((a, it) => a + M(it.sz), 0) + gapMain * (t.length - 1);
            const free = mainSize - sum;
            if (grow > 0 && free > 0) { t.forEach(it => { const g = num(it.node.props.flex_grow, 0); if (g > 0) { const add = Math.floor(free * g / grow); if (col) it.sz.h += add; else it.sz.w += add; } }); sum = mainSize; }
            const am = String(L.flex_align_main || 'START').toUpperCase(), n = t.length, rest = Math.max(0, mainSize - sum);
            let start = 0, gap = gapMain;
            if (am === 'END') start = rest; else if (am === 'CENTER') start = rest / 2;
            else if (am === 'SPACE_BETWEEN' && n > 1) gap += rest / (n - 1);
            else if (am === 'SPACE_AROUND') { gap += rest / n; start = rest / n / 2; }
            else if (am === 'SPACE_EVENLY') { gap += rest / (n + 1); start = rest / (n + 1); }
            const ac = String(L.flex_align_cross || 'START').toUpperCase();
            let mpos = start;
            const order = rev ? t.slice().reverse() : t;
            order.forEach(it => {
                const tc = trackCross[ti];
                if (ac === 'STRETCH') { if (col) it.sz.w = tc; else it.sz.h = tc; }
                const off = ac === 'END' ? tc - C(it.sz) : ac === 'CENTER' ? (tc - C(it.sz)) / 2 : 0;
                const mm = rev ? mainSize - mpos - M(it.sz) : mpos;
                it.pos = col ? { x: content.x + Math.round(cpos + off), y: content.y + Math.round(mm) } : { x: content.x + Math.round(mm), y: content.y + Math.round(cpos + off) };
                mpos += M(it.sz) + gap;
            });
            cpos += trackCross[ti] + gapCross;
        });
    }

    function gridPlace(items, L, content, st) {
        const gapR = num(L.pad_row, num(st.pad_row, 0)), gapC = num(L.pad_column, num(st.pad_column, 0));
        const parseT = t => {
            if (typeof t === 'number') return { px: t };
            const s = String(t).trim().toLowerCase();
            let m = s.match(/^fr\((\d+(?:\.\d+)?)\)$/); if (m) return { fr: +m[1] };
            if (s === 'content') return { content: true };
            m = s.match(/^(\d+)(px)?$/); if (m) return { px: +m[1] };
            if (isPct(s)) return { pctv: s };
            return { fr: 1 };
        };
        const cols = L.cols.map(parseT), rows = L.rows.map(parseT);
        // auto placement for items without a cell
        const occupied = new Set(); let next = 0;
        items.forEach(it => {
            const p = it.node.props || {};
            if (p.grid_cell_row_pos !== undefined && p.grid_cell_column_pos !== undefined) { it.r = num(p.grid_cell_row_pos, 0); it.c = num(p.grid_cell_column_pos, 0); }
            else { while (occupied.has(next)) next++; it.r = Math.floor(next / cols.length); it.c = next % cols.length; next++; }
            it.rs = Math.max(1, num(p.grid_cell_row_span, 1)); it.cs = Math.max(1, num(p.grid_cell_column_span, 1));
            for (let r = 0; r < it.rs; r++) for (let c = 0; c < it.cs; c++) occupied.add((it.r + r) * cols.length + it.c + c);
        });
        const size = (tracks, total, gap, key, sk) => {
            const out = tracks.map((t, i) => t.px !== undefined ? t.px : t.pctv ? pct(t.pctv, total) : t.content ? Math.max(0, ...items.filter(it => it[key] === i && it[sk] === 1).map(it => key === 'c' ? it.sz.w : it.sz.h)) : 0);
            const frSum = tracks.reduce((a, t) => a + (t.fr || 0), 0);
            const fixed = out.reduce((a, b) => a + b, 0) + gap * Math.max(0, tracks.length - 1);
            if (frSum > 0) tracks.forEach((t, i) => { if (t.fr) out[i] = Math.max(0, Math.floor((total - fixed) * t.fr / frSum)); });
            return out;
        };
        const cw = size(cols, content.w, gapC, 'c', 'cs'), rh = size(rows, content.h, gapR, 'r', 'rs');
        const starts = (sizes, gap, total, alignKey) => {
            const used = sizes.reduce((a, b) => a + b, 0) + gap * Math.max(0, sizes.length - 1), rest = Math.max(0, total - used);
            const a = String(L[alignKey] || 'START').toUpperCase(), n = sizes.length;
            let s = 0, g = gap;
            if (a === 'END') s = rest; else if (a === 'CENTER') s = rest / 2; else if (a === 'SPACE_BETWEEN' && n > 1) g += rest / (n - 1);
            else if (a === 'SPACE_AROUND') { g += rest / n; s = g / 2 - gap / 2; } else if (a === 'SPACE_EVENLY') { g += rest / (n + 1); s = rest / (n + 1); }
            const out = []; sizes.forEach(v => { out.push(s); s += v + g; }); out.push(s - g); return { out, g };
        };
        const cs = starts(cw, gapC, content.w, 'grid_column_align'), rs = starts(rh, gapR, content.h, 'grid_row_align');
        items.forEach(it => {
            const c0 = Math.min(it.c, cols.length - 1), r0 = Math.min(it.r, rows.length - 1);
            const c1 = Math.min(c0 + it.cs - 1, cols.length - 1), r1 = Math.min(r0 + it.rs - 1, rows.length - 1);
            const x = cs.out[c0], y = rs.out[r0], w = cs.out[c1] + cw[c1] - x, h = rs.out[r1] + rh[r1] - y;
            const p = it.node.props || {}, def = L.shorthand ? 'CENTER' : 'START';
            const ax = String(p.grid_cell_x_align || def).toUpperCase(), ay = String(p.grid_cell_y_align || def).toUpperCase();
            if (ax === 'STRETCH') it.sz.w = w; if (ay === 'STRETCH') it.sz.h = h;
            const fx = ax === 'END' ? w - it.sz.w : ax === 'CENTER' ? (w - it.sz.w) / 2 : 0;
            const fy = ay === 'END' ? h - it.sz.h : ay === 'CENTER' ? (h - it.sz.h) / 2 : 0;
            it.pos = { x: Math.round(content.x + x + fx), y: Math.round(content.y + y + fy) };
        });
    }

    function placeChildren(node, st, content, provisional) {
        const kids = (virtualChildren && virtualChildren(node, st, content)) || { children: node.children || [], content };
        const cbox = kids.content;
        const list = kids.children.filter(c => !hidden(c));
        const L = parseLayout(node);
        const items = list.map(c => ({ node: c, sz: sizeOf(c, st, cbox.w, cbox.h) }));
        const flowItems = L ? items.filter(it => !flag(it.node, 'floating') && !flag(it.node, 'ignore_layout')) : [];
        if (L && L.type === 'flex') flexPlace(flowItems, L, cbox, st);
        if (L && L.type === 'grid') gridPlace(flowItems, L, cbox, st);
        items.forEach(it => {
            if (!it.pos) it.pos = placeFree(it.node, it.sz, cbox);
            const p = it.node.props || {};
            if (L) { it.pos.x += num(p.translate_x, 0); it.pos.y += num(p.translate_y, 0); }
            else { it.pos.x += num(p.translate_x, 0); it.pos.y += num(p.translate_y, 0); }
            place(it.node, it.pos.x, it.pos.y, it.sz, provisional);
        });
        node._kids = list;
    }

    function place(node, x, y, sz, provisional) {
        node._r = { x, y, w: sz.w, h: sz.h };
        const st = sz.st, pad = padOf(st);
        node._c = { x: x + pad.l, y: y + pad.t, w: Math.max(0, sz.w - pad.l - pad.r), h: Math.max(0, sz.h - pad.t - pad.b) };
        if (!provisional) { all.push(node); if (node.props && node.props.id) byId.set(String(node.props.id), node); }
        placeChildren(node, st, node._c, provisional);
    }

    function alignTo(node) {
        const at = node.props && node.props.align_to; if (!at || !at.id) return;
        const t = byId.get(String(at.id)); if (!t || !t._r) return;
        const T = t._r, r = node._r, w = r.w, h = r.h, a = String(at.align || 'OUT_BOTTOM_MID').toUpperCase();
        let x = T.x, y = T.y;
        const midX = T.x + (T.w - w) / 2, midY = T.y + (T.h - h) / 2;
        const map = {
            OUT_TOP_LEFT: [T.x, T.y - h], OUT_TOP_MID: [midX, T.y - h], OUT_TOP_RIGHT: [T.x + T.w - w, T.y - h],
            OUT_BOTTOM_LEFT: [T.x, T.y + T.h], OUT_BOTTOM_MID: [midX, T.y + T.h], OUT_BOTTOM_RIGHT: [T.x + T.w - w, T.y + T.h],
            OUT_LEFT_TOP: [T.x - w, T.y], OUT_LEFT_MID: [T.x - w, midY], OUT_LEFT_BOTTOM: [T.x - w, T.y + T.h - h],
            OUT_RIGHT_TOP: [T.x + T.w, T.y], OUT_RIGHT_MID: [T.x + T.w, midY], OUT_RIGHT_BOTTOM: [T.x + T.w, T.y + T.h - h]
        };
        if (map[a]) [x, y] = map[a]; else { const f = ALIGN_F[a] || [0, 0]; x = T.x + f[0] * (T.w - w); y = T.y + f[1] * (T.h - h); }
        x += num(at.x, 0); y += num(at.y, 0);
        const dx = Math.round(x - r.x), dy = Math.round(y - r.y);
        const shift = n => { if (n._r) { n._r.x += dx; n._r.y += dy; n._c.x += dx; n._c.y += dy; } (n._kids || []).forEach(shift); };
        shift(node);
    }

    function run(roots, screenStyle, W, H, rootProps) {
        all.length = 0; byId.clear();
        const root = { type: 'screen', props: rootProps || {}, children: roots };
        const pad = padOf(screenStyle);
        const content = { x: pad.l, y: pad.t, w: W - pad.l - pad.r, h: H - pad.t - pad.b };
        root._r = { x: 0, y: 0, w: W, h: H }; root._c = content;
        placeChildren(root, screenStyle, content, false);
        all.forEach(alignTo);
        return { all: all.slice(), byId: new Map(byId), root };
    }
    return { run, textLines, parseLayout, padOf };
}

export function optionList(o) {
    if (Array.isArray(o)) return o.map(x => String(x));
    if (typeof o === 'string') return o.split('\n');
    return [];
}
export function pointList(pts) {
    if (!Array.isArray(pts)) return [];
    return pts.map(p => {
        if (p && typeof p === 'object') return [Number(p.x) || 0, Number(p.y) || 0];
        const m = String(p).split(',').map(s => parseFloat(s)); return [m[0] || 0, m[1] || 0];
    });
}
