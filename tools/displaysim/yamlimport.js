// Import an existing ESPHome YAML: read font:/color:/display lambda, preview it, then load it into the designer.
// Uses globals from index.html: elements, colorPalette, einkMode, screenBorder, fontOverrides, renderScene,
// applyImportedData, googleIconsLigatureToCodepoint (icons.js).
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const CACHE_KEY = 'esphomeDisplayDesignerCache';

    const EXAMPLE = `# Example: a small status screen
font:
  - file: "gfonts://Roboto"
    id: font_small
    size: 14
  - file: "gfonts://Roboto"
    id: font_big
    size: 28
  - file: "fonts/MaterialSymbols-Regular.ttf"
    id: font_icons
    size: 32
    glyphs: ["\\uE9B2"]

color:
  - id: accent
    hex: "00BFA5"

display:
  - platform: ili9xxx
    model: ILI9341
    cs_pin: GPIO5
    dc_pin: GPIO27
    lambda: |-
      it.filled_rectangle(0, 0, it.get_width(), 36, id(accent));
      it.print(10, 8, id(font_small), Color(255, 255, 255), "Living room");
      it.printf(it.get_width() / 2, 90, id(font_big), TextAlign::TOP_CENTER, "%.1f C", id(temp).state);
      it.print(10, 150, id(font_icons), "\\uE9B2");
      it.rectangle(5, 130, 230, 70, Color(255, 255, 255));
      it.circle(200, 250, 20);
      it.horizontal_line(10, 120, 220);
`;

    // ---------------------------------------------------------------- YAML text helpers
    const indentOf = l => l.length - l.trimStart().length;
    function stripComment(v) {
        let q = null;
        for (let i = 0; i < v.length; i++) {
            const c = v[i];
            if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; }
            else if (c === '"' || c === "'") q = c;
            else if (c === '#' && (i === 0 || /\s/.test(v[i - 1]))) return v.slice(0, i).trimEnd();
        }
        return v.trimEnd();
    }
    function unquote(v) {
        v = stripComment(String(v || '')).trim();
        if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) v = v.slice(1, -1);
        return v;
    }
    // top-level sections: {key: [lines]}
    function sections(text) {
        const out = {}; let cur = null;
        text.split(/\r?\n/).forEach(line => {
            const m = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
            if (m) { cur = m[1]; (out[cur] = out[cur] || []).push(line.slice(m[1].length + 1)); }
            else if (cur) out[cur].push(line);
        });
        return out;
    }
    // list items (each = array of lines)
    function listItems(lines) {
        const items = []; let base = null, cur = null;
        lines.forEach(line => {
            if (!line.trim() || line.trim().startsWith('#')) { if (cur) cur.push(line); return; }
            const m = line.match(/^(\s*)-\s/) || line.match(/^(\s*)-$/);
            if (m && (base === null || m[1].length === base)) { base = m[1].length; cur = [line]; items.push(cur); }
            else if (cur) cur.push(line);
        });
        return items;
    }
    function keyVal(item, key) {
        const re = new RegExp('^\\s*(?:-\\s+)?' + key + ':\\s*(.*)$');
        for (const l of item) { const m = l.match(re); if (m) return m[1]; }
        return null;
    }
    // page id for a lambda inside display pages: the closest `id:` just above it
    function pageIdAbove(lines, i) { for (let k = i - 1; k >= Math.max(0, i - 6); k--) { const m = lines[k].match(/^\s*(?:-\s+)?id:\s*["']?([\w]+)["']?\s*(?:#.*)?$/); if (m) return m[1]; if (/^\s*pages:\s*$/.test(lines[k])) break; } return null; }
    function lambdasIn(lines) {
        const res = [];
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^(\s*)(?:-\s+)?lambda:\s*(?:!lambda\s*)?(\|[-+]?|>[-+]?)?\s*(.*)$/);
            if (!m) continue;
            const keyCol = lines[i].indexOf('lambda');
            if (m[2]) {
                const body = [];
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim() && indentOf(lines[j]) <= keyCol) break;
                    body.push(lines[j]);
                }
                const nonBlank = body.filter(l => l.trim());
                const strip = nonBlank.length ? Math.min(...nonBlank.map(indentOf)) : 0;
                res.push({ code: body.map(l => l.slice(strip)).join('\n').trim(), line: i, id: pageIdAbove(lines, i) });
            } else if (m[3]) res.push({ code: unquote(m[3]), line: i, id: pageIdAbove(lines, i) });
        }
        return res;
    }

    // ---------------------------------------------------------------- font / color / display parsing
    function parseFonts(lines) {
        return listItems(lines).map(it => {
            const id = unquote(keyVal(it, 'id') || '');
            if (!id) return null;
            let file = unquote(keyVal(it, 'file') || '');
            const family = unquote(keyVal(it, 'family') || '');
            if (!file && family) {
                const type = unquote(keyVal(it, 'type') || 'gfonts');
                file = type === 'gfonts' ? 'gfonts://' + family.replace(/\s+/g, '+') : (unquote(keyVal(it, 'path') || '') || family);
            }
            if (!file) file = unquote(keyVal(it, 'path') || '');
            const size = parseInt(unquote(keyVal(it, 'size') || '20'), 10) || 20;
            const glyphs = it.join('\n');
            const weight = parseInt(unquote(keyVal(it, 'weight') || '0'), 10) || 0;
            const icon = /\\u[eEfF][0-9a-fA-F]{3}|\\U000[0-9a-fA-F]{5}|[-]/.test(glyphs) || /material|symbol|icon|mdi/i.test(id + ' ' + file);
            const bold = /bold|black|heavy/i.test(id + ' ' + file) || weight >= 600 || /@(6|7|8|9)00/.test(file);
            return { id, file: file || 'fonts/' + id + '.ttf', size, icon, bold };
        }).filter(Boolean);
    }
    function parseColors(lines) {
        return listItems(lines).map(it => {
            const id = unquote(keyVal(it, 'id') || '');
            if (!id) return null;
            let hex = unquote(keyVal(it, 'hex') || '').replace(/^(#|0x)/i, '');
            if (!/^[0-9a-f]{6}$/i.test(hex)) {
                const ch = k => {
                    const v = unquote(keyVal(it, k) || '0');
                    if (/%$/.test(v)) return Math.round(parseFloat(v) * 2.55);
                    const n = parseFloat(v); return n <= 1 && /\./.test(v) ? Math.round(n * 255) : Math.round(n);
                };
                const r = ch('red'), g = ch('green'), b = ch('blue');
                hex = [r, g, b].map(n => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, '0')).join('');
            }
            return { name: id, hex: '#' + hex.toUpperCase() };
        }).filter(Boolean);
    }
    const KNOWN_SIZES = { ILI9341: [240, 320], ILI9342: [320, 240], ILI9486: [320, 480], ILI9488: [320, 480], ST7789V: [240, 320], ST7735: [128, 160] };
    function detectDisplay(item) {
        const text = item.join('\n');
        const platform = unquote(keyVal(item, 'platform') || '');
        const out = { platform, eink: /epd|e-?paper|inkplate|gdey|gdew|waveshare|eink/i.test(platform + ' ' + (keyVal(item, 'model') || '')), w: 0, h: 0 };
        const w = keyVal(item, 'width'), h = keyVal(item, 'height');
        if (w && h && /^\d+$/.test(unquote(w)) && /^\d+$/.test(unquote(h))) { out.w = +unquote(w); out.h = +unquote(h); }
        if (!out.w) { const m = text.match(/model:\s*["']?[^\n"']*?(\d{2,4})x(\d{2,4})/i); if (m) { out.w = +m[1]; out.h = +m[2]; } }
        if (!out.w) { const model = unquote(keyVal(item, 'model') || '').toUpperCase().replace(/[\s_-]/g, ''); const k = Object.keys(KNOWN_SIZES).find(x => model.startsWith(x)); if (k) [out.w, out.h] = KNOWN_SIZES[k]; }
        // rotation swaps axes
        const rot = parseInt(unquote(keyVal(item, 'rotation') || '0'), 10);
        if (out.w && (rot === 90 || rot === 270)) [out.w, out.h] = [out.h, out.w];
        return out;
    }

    // ---------------------------------------------------------------- C++ lambda parsing
    function stripCppComments(code) {
        let out = '', q = null;
        for (let i = 0; i < code.length; i++) {
            const c = code[i], n = code[i + 1];
            if (q) { out += c; if (c === '\\') out += code[++i] || ''; else if (c === q) q = null; continue; }
            if (c === '"' || c === "'") { q = c; out += c; continue; }
            if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
            if (c === '/' && n === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i++; continue; }
            out += c;
        }
        return out;
    }
    function splitArgs(s) {
        const out = []; let d = 0, cur = '', q = null;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (q) { cur += c; if (c === '\\') cur += s[++i] || ''; else if (c === q) q = null; continue; }
            if (c === '"' || c === "'") { q = c; cur += c; continue; }
            if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
            if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
            cur += c;
        }
        if (cur.trim() || out.length) out.push(cur.trim());
        return out;
    }
    function findCalls(code) {
        const calls = [], re = /\bit\s*\.\s*(\w+)\s*\(/g; let m;
        while ((m = re.exec(code))) {
            let i = re.lastIndex, d = 1, q = null;
            for (; i < code.length && d > 0; i++) {
                const c = code[i];
                if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
                if (c === '"' || c === "'") q = c; else if (c === '(') d++; else if (c === ')') d--;
            }
            calls.push({ name: m[1], args: splitArgs(code.slice(re.lastIndex, i - 1)), raw: code.slice(m.index, i).replace(/\s+/g, ' ') });
            re.lastIndex = i;
        }
        return calls;
    }
    const isStrLit = a => /^"/.test(a || '');
    function cUnescape(lit) {
        const s = lit.slice(1, -1); let out = '';
        for (let i = 0; i < s.length; i++) {
            if (s[i] !== '\\') { out += s[i]; continue; }
            const c = s[++i];
            if (c === 'n') out += '\n'; else if (c === 't') out += '\t'; else if (c === '"' || c === '\\' || c === "'") out += c;
            else if (c === 'u') { out += String.fromCodePoint(parseInt(s.substr(i + 1, 4), 16)); i += 4; }
            else if (c === 'U') { out += String.fromCodePoint(parseInt(s.substr(i + 1, 8), 16)); i += 8; }
            else out += c;
        }
        return out;
    }
    let reverseIcons = null;
    function iconFor(ch) {
        if (!reverseIcons) {
            reverseIcons = new Map();
            Object.keys(googleIconsLigatureToCodepoint).forEach(name => {
                const cp = parseInt(googleIconsLigatureToCodepoint[name], 16);
                const cur = reverseIcons.get(cp);
                if (!cur || name.length < cur.length) reverseIcons.set(cp, name);
            });
        }
        return reverseIcons.get(ch.codePointAt(0)) || null;
    }

    function parseLambda(codeRaw, ctx) {
        const { W, H, eink } = ctx;
        const warnings = [], els = [];
        const warn = w => { if (!warnings.includes(w)) warnings.push(w); };
        const code = stripCppComments(codeRaw);
        const strippedStrings = code.replace(/"(?:[^"\\]|\\.)*"/g, '""');
        if (/\b(if|else|for|while|switch|auto|int|float|bool|static)\b/.test(strippedStrings))
            warn('The lambda contains logic or variables (if / for / auto ...). Only the fixed <code>it.*</code> draw calls were read; every branch of an <code>if</code> is imported.');

        const num = (expr, what, call) => {
            let e = String(expr || '').replace(/\bit\s*\.\s*get_width\s*\(\s*\)/g, W).replace(/\bit\s*\.\s*get_height\s*\(\s*\)/g, H)
                .replace(/\((?:int|float|uint\d*_t|int\d*_t)\)/g, '').replace(/\b(\d+(?:\.\d+)?)f\b/g, '$1');
            if (!/^[\d\s+\-*/().%]+$/.test(e) || !e.trim()) { warn(`Could not work out ${what} <code>${esc(expr)}</code> in <code>${esc(call.raw.slice(0, 60))}</code>.`); return null; }
            try { const v = Function('"use strict";return (' + e + ')')(); return Number.isFinite(v) ? (/\./.test(e) ? Math.round(v) : Math.trunc(v)) : null; } catch (err) { warn(`Could not evaluate ${what} <code>${esc(expr)}</code>.`); return null; }
        };
        const on = eink ? 'black' : 'white', off = eink ? 'white' : 'black';
        const colorOf = (a, call) => {
            if (!a) return on;
            a = a.trim();
            if (a === 'COLOR_ON') return on; if (a === 'COLOR_OFF') return off;
            if (/^Color::WHITE$/i.test(a)) return 'white'; if (/^Color::BLACK$/i.test(a)) return 'black';
            if (/^Color\(/.test(a)) return a.replace(/\s+/g, ' ').replace(/,(?=\S)/g, ', ');
            const m = a.match(/^id\(\s*(\w+)\s*\)$/); if (m) return `id(${m[1]})`;
            if (/^(white|black|red|green|blue)$/.test(a)) return a;
            warn(`Color expression <code>${esc(a)}</code> is not understood and is shown in grey; pick a color after importing.`);
            return a;
        };
        const fontOf = a => { const m = String(a || '').match(/^id\(\s*(\w+)\s*\)$/); return m ? `id(${m[1]})` : (a || ''); };
        const alignOf = a => {
            const n = a.replace('TextAlign::', '');
            if (!/^(TOP_|LEFT|RIGHT|CENTER)/.test(n) || /^(BASELINE|BOTTOM)/.test(n)) warn(`Text alignment <code>${esc(n)}</code> is approximated (the designer anchors text at its top).`);
            if (/RIGHT/.test(n)) return 'RIGHT';
            if (/CENTER_LEFT|TOP_LEFT|^LEFT/.test(n)) return 'LEFT';
            if (/CENTER|HORIZONTAL/.test(n)) return 'CENTER';
            return 'LEFT';
        };

        // clipping regions: it.start_clipping(l, t, r, b); ...; it.end_clipping();  (non-nested)
        const defs = ctx.defs || { qr: {}, graph: {}, images: [], timeIds: [] }, pref = ctx.keyPrefix || '';
        let clipSeq = 0, body = code;
        const clipEls = [];
        body = body.replace(/it\s*\.\s*start_clipping\s*\(([^)]*)\)\s*;([\s\S]*?)it\s*\.\s*end_clipping\s*\(\s*\)\s*;/g, (all, args, inner) => {
            const v = splitArgs(args).map((q, i) => num(q, ['left', 'top', 'right', 'bottom'][i], { raw: all })); if (v.includes(null) || v.length < 4) { warn('A clipping region with non-numeric bounds was skipped.'); return inner; }
            const key = `${pref}clip${++clipSeq}`; clipEls.push({ type: 'clip', x: v[0], y: v[1], width: v[2] - v[0], height: v[3] - v[1], colorId: 'white', _key: key });
            const inside = parseLambda(inner, { ...ctx, keyPrefix: pref + 'in' + clipSeq + ':' }); inside.els.forEach(e => { e._clip = key; els.push(e); }); warnings.push(...inside.warnings.filter(w => !warnings.includes(w)));
            return '';
        });
        els.push(...clipEls);
        const sizeBox = c0 => c0;
        findCalls(body).forEach(c => {
            const a = c.args, n = c.name;
            if (n === 'line') {
                const v = [0, 1, 2, 3].map(i => num(a[i], ['x1', 'y1', 'x2', 'y2'][i], c)); if (v.includes(null)) return;
                els.push({ type: 'line', x: v[0], y: v[1], dx2: v[2] - v[0], dy2: v[3] - v[1], colorId: colorOf(a[4], c) });
            } else if (n === 'triangle' || n === 'filled_triangle') {
                const v = [0, 1, 2, 3, 4, 5].map(i => num(a[i], 'a point', c)); if (v.includes(null)) return;
                els.push({ type: 'triangle', x: v[0], y: v[1], dx2: v[2] - v[0], dy2: v[3] - v[1], dx3: v[4] - v[0], dy3: v[5] - v[1], fill: n === 'filled_triangle', colorId: colorOf(a[6], c) });
            } else if (n === 'regular_polygon' || n === 'filled_regular_polygon') {
                const v = [0, 1, 2].map(i => num(a[i], ['x', 'y', 'radius'][i], c)); if (v.includes(null)) return;
                const em = /EDGES_(\w+)/.exec(a[3] || ''), vm = /VARIATION_(\w+)/.exec(a.slice(3).join(' ')); const names = { TRIANGLE: 3, SQUARE: 4, PENTAGON: 5, HEXAGON: 6, HEPTAGON: 7, OCTAGON: 8 };
                const colorArg = a.slice(3).find(q => !/EDGES_|VARIATION_/.test(q));
                els.push({ type: 'polygon', x: v[0], y: v[1], radius: v[2], edges: em ? (names[em[1]] || 6) : 6, variation: vm ? vm[1] : 'POINTY_TOP', fill: n === 'filled_regular_polygon', colorId: colorOf(colorArg, c) });
            } else if (n === 'filled_ring') {
                const v = [0, 1, 2, 3].map(i => num(a[i], ['x', 'y', 'outer radius', 'inner radius'][i], c)); if (v.includes(null)) return;
                els.push({ type: 'ring', x: v[0], y: v[1], outer: v[2], inner: v[3], colorId: colorOf(a[4], c) });
            } else if (n === 'filled_gauge') {
                const v = [0, 1, 2, 3].map(i => num(a[i], ['x', 'y', 'outer radius', 'inner radius'][i], c)); if (v.includes(null)) return;
                const pr = (a[4] || '0').trim(), pn = /^-?\d+(\.\d+)?f?$/.test(pr) ? parseFloat(pr) : pr;
                els.push({ type: 'gauge', x: v[0], y: v[1], outer: v[2], inner: v[3], percent: pn, colorId: colorOf(a[5], c) });
            } else if (n === 'image') {
                const x = num(a[0], 'x', c), y = num(a[1], 'y', c); if (x === null || y === null) return;
                const idm = /id\(\s*(\w+)\s*\)/.exec(a[2] || ''); const al = a.slice(3).find(q => /ImageAlign::/.test(q)); const cols = a.slice(3).filter(q => !/ImageAlign::/.test(q));
                els.push({ type: 'image', x, y, imageId: idm ? idm[1] : '', imgAlign: al ? al.replace(/.*ImageAlign::/, '') : 'TOP_LEFT', colorOn: cols[0] ? colorOf(cols[0], c) : '', colorOff: cols[1] ? colorOf(cols[1], c) : '', colorId: 'white' });
            } else if (n === 'qr_code') {
                const x = num(a[0], 'x', c), y = num(a[1], 'y', c); if (x === null || y === null) return;
                const idm = /id\(\s*(\w+)\s*\)/.exec(a[2] || ''), d0 = idm ? defs.qr[idm[1]] : null;
                els.push({ type: 'qr', x, y, value: d0 ? d0.value : 'https://esphome.io', ecc: d0 ? d0.ecc : 'LOW', scale: a[4] ? (num(a[4], 'scale', c) || 1) : 1, espId: idm ? idm[1] : '', colorId: colorOf(a[3], c) });
                if (idm && !d0) warn(`QR code <code>${esc(idm[1])}</code> is not defined in a <code>qr_code:</code> block, so a placeholder value is shown.`);
            } else if (n === 'graph') {
                const x = num(a[0], 'x', c), y = num(a[1], 'y', c); if (x === null || y === null) return;
                const idm = /id\(\s*(\w+)\s*\)/.exec(a[2] || ''), g = idm ? defs.graph[idm[1]] : null;
                els.push({ type: 'graph', x, y, ...(g || { width: 100, height: 50, duration: '1h', xGrid: '', yGrid: 0, border: true, lineThickness: 3, traces: [] }), espId: idm ? idm[1] : '', colorId: colorOf(a[3], c) });
                if (idm && !g) warn(`Graph <code>${esc(idm[1])}</code> is not defined in a <code>graph:</code> block.`);
            } else if (n === 'strftime') {
                let x = num(a[0], 'x', c), y = num(a[1], 'y', c); if (x === null || y === null) return;
                let j = 3, color = null, align = 'LEFT'; while (j < a.length && !isStrLit(a[j])) { if (/^TextAlign::/.test(a[j])) align = alignOf(a[j]); else color = a[j]; j++; }
                if (j >= a.length) { warn(`<code>${esc(c.raw.slice(0, 70))}</code> has no format string and was skipped.`); return; }
                const tm = /id\(\s*(\w+)\s*\)\s*\.\s*now/.exec(a.slice(j + 1).join(','));
                els.push({ type: 'clock', x, y, format: cUnescape(a[j]), align, fontId: fontOf(a[2]), timeId: tm ? tm[1] : 'ha_time', colorId: colorOf(color, c) });
            } else if (n === 'draw_pixel_at') { const x = num(a[0], 'x', c), y = num(a[1], 'y', c); if (x !== null && y !== null) els.push({ type: 'bar', x, y, width: 1, height: 1, colorId: colorOf(a[2], c) }); }
            else if (n === 'legend') { warn('<code>it.legend(...)</code> is not drawn by the designer.'); }
            else if (n === 'printf' || n === 'print') {
                let x = num(a[0], 'x', c), y = num(a[1], 'y', c);
                if (x === null || y === null) return;
                let j = 3, color = null, align = 'LEFT';
                while (j < a.length && !isStrLit(a[j])) { if (/^TextAlign::/.test(a[j])) align = alignOf(a[j]); else color = a[j]; j++; }
                if (j >= a.length) { warn(`<code>${esc(c.raw.slice(0, 70))}</code> has no text literal and was skipped.`); return; }
                let content = cUnescape(a[j]); const args = a.slice(j + 1).join(', ');
                const fontId = fontOf(a[2]), colorId = colorOf(color, c);
                const chars = [...content];
                const lig = chars.length === 1 ? iconFor(chars[0]) : null;
                if (lig) { els.push({ type: 'icon', x, y, iconLigature: lig, fontId, colorId }); return; }
                if (chars.length === 1 && chars[0].codePointAt(0) >= 0xE000) warn(`An icon (code point U+${chars[0].codePointAt(0).toString(16).toUpperCase()}) is not in the Material Symbols (Outlined) set and was imported as text. It may come from an older Material Icons or MDI font, which the designer cannot preview.`);
                if (n === 'print') content = content.replace(/%/g, '%%');
                els.push({ type: 'text', x, y, content, args, align, fontId, colorId });
            } else if (n === 'rectangle' || n === 'filled_rectangle') {
                const [x, y, w, h] = [0, 1, 2, 3].map(i => num(a[i], ['x', 'y', 'width', 'height'][i], c));
                if ([x, y, w, h].includes(null)) return;
                const colorId = colorOf(a[4], c);
                if (n === 'filled_rectangle' && h <= 2) els.push({ type: 'bar', x, y, width: w, height: h, colorId });
                else els.push({ type: 'rectangle', x, y, width: w, height: h, fill: n === 'filled_rectangle', thickness: 1, cornerRadius: 0, colorId });
            } else if (n === 'circle' || n === 'filled_circle') {
                const [x, y, r] = [0, 1, 2].map(i => num(a[i], ['x', 'y', 'radius'][i], c));
                if ([x, y, r].includes(null)) return;
                els.push({ type: 'circle', x, y, radius: r, fill: n === 'filled_circle', colorId: colorOf(a[3], c) });
            } else if (n === 'horizontal_line') {
                const [x, y, w] = [0, 1, 2].map(i => num(a[i], ['x', 'y', 'length'][i], c));
                if ([x, y, w].includes(null)) return;
                els.push({ type: 'hline', x, y, width: w, colorId: colorOf(a[3], c) });
            } else if (n === 'vertical_line') {
                const [x, y, h] = [0, 1, 2].map(i => num(a[i], ['x', 'y', 'length'][i], c));
                if ([x, y, h].includes(null)) return;
                els.push({ type: 'vline', x, y, height: h, colorId: colorOf(a[3], c) });
            } else if (n === 'fill') { /* background: the preview already fills it */ }
            else warn(`<code>it.${esc(n)}(...)</code> is not supported by the designer and was skipped.`);
        });
        return { els, warnings };
    }

    // ---------------------------------------------------------------- component definitions the lambda refers to
    function readDefs(sec) {
        const defs = { qr: {}, graph: {}, images: [], timeIds: [] };
        (sec.qr_code ? listItems(sec.qr_code) : []).forEach(it => { const id = unquote(keyVal(it, 'id') || ''); if (id) defs.qr[id] = { value: unquote(keyVal(it, 'value') || ''), ecc: (unquote(keyVal(it, 'ecc') || 'LOW') || 'LOW').toUpperCase() }; });
        (sec.graph ? listItems(sec.graph) : []).forEach(it => {
            const id = unquote(keyVal(it, 'id') || ''); if (!id) return;
            const text = it.join('\n'), traces = [];
            text.split(/^\s*-\s*sensor:/m).slice(1).forEach(seg => { const sensor = (seg.split('\n')[0] || '').trim().replace(/^id\(|\)$/g, ''); const lt = seg.match(/line_type:\s*(\w+)/), col = seg.match(/^\s*color:\s*(\S+)/m); traces.push({ sensor, color: col ? col[1] : '', lineType: lt ? lt[1].toUpperCase() : 'SOLID' }); });
            const th = text.match(/line_thickness:\s*(\d+)/);
            defs.graph[id] = { width: +unquote(keyVal(it, 'width') || 100), height: +unquote(keyVal(it, 'height') || 50), duration: unquote(keyVal(it, 'duration') || '1h'), xGrid: unquote(keyVal(it, 'x_grid') || ''), yGrid: parseFloat(unquote(keyVal(it, 'y_grid') || '0')) || 0, border: unquote(keyVal(it, 'border') || 'true') !== 'false', lineThickness: th ? +th[1] : 3, traces };
        });
        (sec.image ? listItems(sec.image) : []).forEach(it => { const id = unquote(keyVal(it, 'id') || ''); if (id) defs.images.push({ id, name: id, file: unquote(keyVal(it, 'file') || ''), type: (unquote(keyVal(it, 'type') || 'RGB565') || 'RGB565').toUpperCase(), resize: unquote(keyVal(it, 'resize') || ''), transparency: unquote(keyVal(it, 'transparency') || 'opaque'), dither: (unquote(keyVal(it, 'dither') || 'NONE') || 'NONE').toUpperCase(), invert_alpha: unquote(keyVal(it, 'invert_alpha') || 'false') === 'true' }); });
        return defs;
    }
    // best-effort display profile from platform / model
    function guessProfile(d) {
        const P = window.DD && DD.PROFILES; if (!P) return null;
        const plat = String(d.platform || '').toLowerCase(), model = String(d.model || '').toLowerCase();
        const exact = P.find(x => x.platform && x.platform.toLowerCase() === plat && x.model && x.model.toLowerCase() === model); if (exact) return exact.id;
        if (/epaper|epd|inkplate|it8951/.test(plat)) return 'epd_custom';
        if (/ssd1306|sh1106|pcd8544|st7567|st7920|max7219/.test(plat)) return 'mono_custom';
        if (/ssd1322|ssd1325|ssd1327/.test(plat)) return 'gray_custom';
        return d.w ? 'color_custom' : null;
    }

    // ---------------------------------------------------------------- whole-file analysis
    function analyse(text, opt) {
        opt = opt || {};
        const res = { ok: false, warnings: [], fonts: [], colors: [], lambdas: [], display: {} };
        const sec = sections(text);
        let raw = null;
        if (sec.display) {
            const items = listItems(sec.display);
            items.forEach((it, di) => {
                const d = detectDisplay(it);
                lambdasIn(it).forEach((l, li) => res.lambdas.push({ code: l.code, label: `${d.platform || 'display'} #${di + 1} \u00b7 lambda ${li + 1}`, display: d, di, id: l.id }));
            });
            if (!res.lambdas.length) res.warnings.push('A <code>display:</code> section was found but it has no <code>lambda:</code>.');
        }
        if (!res.lambdas.length && /\bit\s*\.\s*\w+\s*\(/.test(text) && !sec.display) { raw = text; res.lambdas.push({ code: raw, label: 'pasted code', display: {} }); }
        if (!res.lambdas.length) { res.warnings.push('No display lambda (<code>it.printf</code>, <code>it.rectangle</code> ...) was found in this text.'); return res; }
        if (/!include|^packages:/m.test(text)) res.warnings.push('The file uses <code>!include</code> or <code>packages</code>. Fonts, colors or lambdas defined in other files are not read.');

        res.fonts = sec.font ? parseFonts(sec.font) : [];
        res.colors = sec.color ? parseColors(sec.color) : [];
        const pick = Math.min(opt.lambdaIndex || 0, res.lambdas.length - 1);
        res.pick = pick;
        const chosen = res.lambdas[pick];
        res.display = chosen.display || {};
        res.eink = opt.eink !== undefined ? !!opt.eink : !!res.display.eink;
        res.W = opt.W || res.display.w || 0; res.H = opt.H || res.display.h || 0;
        res.sizeKnown = !!(res.display.w) || !!opt.W;
        const cur = (/^\d+x\d+$/.test(configResolutionSelect.value) ? configResolutionSelect.value : '128x160').split('x').map(Number);
        if (!res.W) { res.W = cur[0]; res.H = cur[1]; }
        const defs = readDefs(sec);
        const group = chosen.id ? res.lambdas.filter(l => l.di === chosen.di && l.id) : [];
        if (group.length > 1) {                       // display pages: one lambda per page
            res.pages = group.map(g => g.id); res.elements = [];
            group.forEach(g => { const r = parseLambda(g.code, { W: res.W, H: res.H, eink: res.eink, defs, keyPrefix: g.id + ':' }); r.els.forEach(e => { e.page = g.id; res.elements.push(e); }); res.warnings.push(...r.warnings.filter(w => !res.warnings.includes(w))); });
        } else {
            const parsed = parseLambda(chosen.code, { W: res.W, H: res.H, eink: res.eink, defs, keyPrefix: '' });
            res.elements = parsed.els; res.warnings.push(...parsed.warnings);
        }
        res.images = defs.images; res.profileId = guessProfile(chosen.display || {});

        // fonts used but not defined here -> synthesise from the ID
        const known = new Set(res.fonts.map(f => f.id));
        res.elements.forEach(el => {
            const m = String(el.fontId || '').match(/^id\(\s*(\w+)\s*\)$/); if (!m || known.has(m[1])) return;
            known.add(m[1]);
            const sz = (m[1].match(/(\d+)$/) || [])[1];
            res.fonts.push({ id: m[1], file: 'fonts/' + m[1] + '.ttf', size: sz ? +sz : 12, icon: /material|symbol|icon/i.test(m[1]), bold: /bold/i.test(m[1]), synthetic: true });
            res.warnings.push(`Font <code>${esc(m[1])}</code> is used but not defined in this YAML. A size was guessed from its name.`);
        });
        const colorIds = new Set(res.colors.map(c => c.name));
        const missing = new Set();
        res.elements.forEach(el => { const m = String(el.colorId || '').match(/^id\(\s*(\w+)\s*\)$/); if (m && !colorIds.has(m[1])) missing.add(m[1]); });
        if (missing.size) res.warnings.push(`Color ID${missing.size > 1 ? 's' : ''} <code>${[...missing].map(esc).join('</code>, <code>')}</code> not defined in this YAML (shown grey).`);
        if (!res.elements.length) res.warnings.push('No drawable elements were found in the selected lambda.');
        res.ok = res.elements.length > 0;
        return res;
    }

    // ---------------------------------------------------------------- UI
    let state = null, excluded = new Set(), opts = {};

    function describe(el) {
        if (el.type === 'text') return `"${esc(el.content)}"${el.args ? ' ← <code>' + esc(el.args) + '</code>' : ''}`;
        if (el.type === 'icon') return `icon <code>${esc(el.iconLigature)}</code>`;
        if (el.type === 'bar') return `${el.width}×${el.height}`;
        if (el.type === 'rectangle') return `${el.width}×${el.height}${el.fill ? ' filled' : ''}`;
        return `r=${el.radius}${el.fill ? ' filled' : ''}`;
    }
    function includedElements() { return state.elements.filter((_, i) => !excluded.has(i)); }

    function drawPreview(canvas) {
        const W = state.W, H = state.H, sc = Math.max(1, Math.min(4, Math.floor(380 / Math.max(W, H))));
        canvas.width = W * sc; canvas.height = H * sc;
        const ctx = canvas.getContext('2d'); ctx.setTransform(sc, 0, 0, sc, 0, 0);
        const sv = { elements, colorPalette, einkMode, screenBorder, fontOverrides };
        try {
            elements = includedElements(); colorPalette = state.colors.slice(); einkMode = state.eink; screenBorder = 0;
            fontOverrides = {}; state.fonts.forEach(f => { fontOverrides[f.id] = { file: f.file, size: f.size, icon: f.icon, bold: f.bold }; });
            renderScene(ctx, W, H);
        } catch (e) { console.error('YAML preview failed', e); }
        finally { ({ elements, colorPalette, einkMode, screenBorder, fontOverrides } = sv); }
    }

    function renderResult() {
        const box = $('yamlResult');
        if (!state) { box.innerHTML = ''; $('yamlApply').disabled = true; return; }
        if (!state.ok) {
            box.innerHTML = `<div class="callout warn"><span class="material-symbols-outlined">error</span><div><b>Nothing to import yet.</b><ul>${state.warnings.map(w => '<li>' + w + '</li>').join('')}</ul></div></div>`;
            $('yamlApply').disabled = true; return;
        }
        const lamSel = state.lambdas.length > 1 ? `<label class="yfield">Lambda <select id="yamlLambda">${state.lambdas.map((l, i) => `<option value="${i}"${i === state.pick ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>` : '';
        const rows = state.elements.map((el, i) => `<tr class="${excluded.has(i) ? 'off' : ''}"><td><input type="checkbox" data-i="${i}" ${excluded.has(i) ? '' : 'checked'} aria-label="Include element ${i + 1}"></td><td>${el.type}</td><td>${el.x},${el.y}</td><td>${describe(el)}</td><td><code>${esc(el.colorId)}</code></td></tr>`).join('');
        box.innerHTML = `
            <div class="yaml-grid">
                <div class="yaml-prev"><canvas id="yamlCanvas"></canvas>
                    <div class="yaml-chips"><span class="lg lg-font">${state.fonts.length} font${state.fonts.length === 1 ? '' : 's'}</span><span class="lg lg-color">${state.colors.length} color${state.colors.length === 1 ? '' : 's'}</span><span class="lg lg-lambda">${includedElements().length}/${state.elements.length} elements</span></div>
                </div>
                <div class="yaml-side">
                    <div class="yfields">
                        <label class="yfield">Width <input type="number" id="yamlW" min="1" value="${state.W}"></label>
                        <label class="yfield">Height <input type="number" id="yamlH" min="1" value="${state.H}"></label>
                        <label class="yfield chk"><input type="checkbox" id="yamlEink" ${state.eink ? 'checked' : ''}> E-Ink</label>
                        ${lamSel}
                    </div>
                    ${state.sizeKnown ? '' : '<p class="yaml-hint"><span class="material-symbols-outlined">info</span>The screen size could not be read from the display settings. Check width and height above.</p>'}
                    <div class="yaml-tablewrap"><table class="dtable"><thead><tr><th></th><th>Type</th><th>x,y</th><th>Details</th><th>Color</th></tr></thead><tbody>${rows}</tbody></table></div>
                    <p class="yaml-hint"><span class="material-symbols-outlined">tune</span>Untick anything you do not want. After importing you can edit every element in the designer.</p>
                </div>
            </div>
            ${state.warnings.length ? `<details class="adjusted" open><summary>${state.warnings.length} note${state.warnings.length === 1 ? '' : 's'} about this import</summary><ul>${state.warnings.map(w => '<li>' + w + '</li>').join('')}</ul></details>` : ''}`;
        drawPreview($('yamlCanvas'));
        $('yamlApply').disabled = !includedElements().length;
        box.querySelectorAll('tbody input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
            const i = +cb.dataset.i; cb.checked ? excluded.delete(i) : excluded.add(i);
            cb.closest('tr').classList.toggle('off', !cb.checked);
            drawPreview($('yamlCanvas')); $('yamlApply').disabled = !includedElements().length;
            box.querySelector('.lg-lambda').textContent = `${includedElements().length}/${state.elements.length} elements`;
        }));
        const reparse = () => { opts.W = Math.max(1, +$('yamlW').value || state.W); opts.H = Math.max(1, +$('yamlH').value || state.H); opts.eink = $('yamlEink').checked; analyseAndRender(true); };
        ['yamlW', 'yamlH'].forEach(id => $(id).addEventListener('change', reparse));
        $('yamlEink').addEventListener('change', reparse);
        const ls = $('yamlLambda'); if (ls) ls.addEventListener('change', () => { opts.lambdaIndex = +ls.value; opts.W = opts.H = 0; analyseAndRender(); });
    }

    function analyseAndRender(keepSelection) {
        const text = $('yamlText').value;
        if (!text.trim()) { state = null; renderResult(); return; }
        const prevExcluded = keepSelection ? new Set(excluded) : new Set();
        try {
            state = analyse(text, { lambdaIndex: opts.lambdaIndex, W: opts.W, H: opts.H, eink: opts.eink });
        } catch (e) { console.error(e); state = { ok: false, warnings: ['Could not read this text: ' + esc(e.message)] }; }
        excluded = state.ok ? new Set([...prevExcluded].filter(i => i < state.elements.length)) : new Set();
        renderResult();
    }

    function open() { $('yamlOverlay').classList.add('active'); document.body.style.overflow = 'hidden'; }
    function close() { $('yamlOverlay').classList.remove('active'); document.body.style.overflow = ''; }
    function toast(msg, undo) {
        const t = document.createElement('div'); t.className = 'yaml-toast';
        t.innerHTML = `<span class="material-symbols-outlined">check_circle</span><span>${msg}</span>` + (undo ? '<button type="button">Undo</button>' : '');
        document.body.appendChild(t);
        if (undo) t.querySelector('button').addEventListener('click', undo);
        setTimeout(() => t.remove(), 15000);
    }

    function apply() {
        if (!state || !state.ok) return;
        let snapshot = null; try { snapshot = localStorage.getItem(CACHE_KEY); } catch (e) { /* none */ }
        const els = includedElements().map(e => ({ ...e }));
        // keep only the fonts / colors actually needed (all defined ones stay, they are cheap and match the user's YAML)
        const fontIds = state.fonts.map(f => 'id(' + f.id + ')');
        const colorTokens = ['white', 'black', 'red', 'green', 'blue', ...state.colors.map(c => 'id(' + c.name + ')')];
        els.forEach(e => { const m = String(e.colorId).match(/^id\(\s*(\w+)\s*\)$/); if (m && !colorTokens.includes(e.colorId)) colorTokens.push(e.colorId); });
        fontOverrides = {}; state.fonts.forEach(f => { fontOverrides[f.id] = { file: f.file, size: f.size, icon: f.icon, bold: f.bold }; });
        applyImportedData({
            config: {
                Resolution: `${state.W}x${state.H}`, CustomFonts: fontIds.join(', '), Colors: colorTokens.join(', '),
                Palette: state.colors.map(c => c.name + '=' + c.hex).join(','), EInk: !!state.eink
            },
            fonts: state.fonts.map(f => ({ id: f.id, size: f.size })), elements: els
        });
        if (window.DD) {   // pages, clip regions, images and display type from the file
            if (state.pages && state.pages.length > 1) { DD.pages = state.pages.map(id => ({ id })); DD.page = DD.pages[0].id; }
            else { DD.pages = [{ id: 'page1' }]; DD.page = 'page1'; elements.forEach(e => { delete e.page; }); }
            const clips = {}; elements.forEach(e => { if (e.type === 'clip' && e._key) clips[e._key] = e.id; });
            elements.forEach(e => { if (e._clip && clips[e._clip] !== undefined) e.clipId = clips[e._clip]; delete e._clip; delete e._key; });
            DD.images = (state.images || []).map(m => ({ ...m })); DD.imgCache.clear(); DD.rawImages.clear();
            if (state.profileId) DD.profileId = state.profileId;
            DD.saveMeta(); saveToCache(); if (DD.onPages) DD.onPages(); if (DD.onProfile) DD.onProfile(DD.profile());
            renderElementList(); drawPreview();
        }
        close();
        toast(`Imported ${els.length} element${els.length === 1 ? '' : 's'} at ${state.W}×${state.H}.`, () => {
            try { snapshot === null ? localStorage.removeItem(CACHE_KEY) : localStorage.setItem(CACHE_KEY, snapshot); } catch (e) { /* ignore */ }
            location.reload();
        });
    }

    $('import-yaml-btn').addEventListener('click', open);
    $('yamlClose').addEventListener('click', close);
    $('yamlCancel').addEventListener('click', close);
    $('yamlOverlay').addEventListener('click', e => { if (e.target === $('yamlOverlay')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('yamlOverlay').classList.contains('active')) close(); });
    $('yamlApply').addEventListener('click', apply);
    let timer = null;
    $('yamlText').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { opts = {}; analyseAndRender(); }, 250); });
    $('yamlChoose').addEventListener('click', () => $('yamlFile').click());
    $('yamlFile').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => { $('yamlText').value = String(r.result); opts = {}; analyseAndRender(); };
        r.readAsText(f); e.target.value = '';
    });
    $('yamlExample').addEventListener('click', () => { $('yamlText').value = EXAMPLE; opts = {}; analyseAndRender(); });
    window.parseEsphomeFonts = text => { const sec = sections(text); return parseFonts(sec.font || text.split(/\r?\n/)); };
    window.parseEsphomeYaml = analyse; // handy for tests and scripting
})();
