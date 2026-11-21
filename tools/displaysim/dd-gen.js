// Displaysim code generation: lambda (all primitives, pages, clipping, display-profile colours),
// assets (image:, graph:, qr_code:, time:), colour + font blocks adjusted for the display type.
(function () {
    'use strict';
    const DD = window.DD, T = DD.types;
    const num = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
    const hexRgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
    const lum = rgb => .299 * rgb[0] + .587 * rgb[1] + .114 * rgb[2];

    // colour as ESPHome should receive it for this display type
    DD.espColor = function (c) {
        const k = String(c || 'white').trim(), mode = DD.mode(), prof = DD.profile();
        if (/^id\(/.test(k) || /^Color(::|\()/.test(k) && mode === 'color') return mode === 'color' ? espColor(k) : k;
        let css = '#ffffff'; try { css = mapColorPreview(k); } catch (e) { /* keep */ }
        const rgb = hexRgb(css) || [255, 255, 255], black = !(rgb[0] || rgb[1] || rgb[2]);
        if (mode === 'mono') return black ? 'Color::BLACK' : 'Color::WHITE';
        if (mode === 'gray') { if (black) return 'Color::BLACK'; const w = Math.round(lum(rgb)); return w >= 250 ? 'Color::WHITE' : `Color(0, 0, 0, ${w})`; }
        if (mode === 'epaper') { if (prof.ink === 'bwr' && rgb[0] > 140 && rgb[1] < 110 && rgb[2] < 110) return 'Color(255, 0, 0)'; if (prof.ink === 'bwy' && rgb[0] > 150 && rgb[1] > 130 && rgb[2] < 110) return 'Color(255, 255, 0)'; return lum(rgb) < 128 ? 'Color::BLACK' : 'Color::WHITE'; }
        return espColor(k);
    };
    const C = el => DD.espColor(el.colorId);
    const q = s => JSON.stringify(String(s));
    const espId = (el, prefix) => (el.espId && String(el.espId).trim()) || `${prefix}_${el.id}`;
    const L = DD.lambdaFor = function (el) {
        const x = Math.round(num(el.x)), y = Math.round(num(el.y)), col = C(el);
        switch (el.type) {
            case 'text': {
                const font = el.fontId || 'id(default_font)', args = (el.args || '').trim(), align = el.align || 'LEFT';
                let s = `it.printf(${x}, ${y}, ${font}, ${col}, `; if (align !== 'LEFT') s += `TextAlign::${align}, `; s += q(el.content || '');
                if (args) s += args.includes('.state') && !args.endsWith('.c_str()') ? `, ${args}.c_str()` : `, ${args}`;
                return s + ');';
            }
            case 'icon': {
                const font = el.fontId || 'id(default_icon_font)', hex = getIconCodepoint(el.iconLigature);
                if (!hex) return `// Warning: unknown icon ligature: ${el.iconLigature}`;
                try { return `it.printf(${x}, ${y}, ${font}, ${col}, ${JSON.stringify(String.fromCodePoint(parseInt(hex, 16)))}); // Ligature: ${el.iconLigature}`; } catch (e) { return `// Error: could not generate code for icon ${el.iconLigature}`; }
            }
            case 'bar': return `it.filled_rectangle(${x}, ${y}, ${num(el.width, 10)}, ${num(el.height, 1)}, ${col});`;
            case 'rectangle': { const w = num(el.width, 10), h = num(el.height, 10); let s = el.fill ? `it.filled_rectangle(${x}, ${y}, ${w}, ${h}, ${col});` : `it.rectangle(${x}, ${y}, ${w}, ${h}, ${col});`; if (!el.fill && el.thickness > 1) s += ' // Note: Thickness ignored'; if (el.cornerRadius > 0) s += ' // Note: Corner radius ignored'; return s; }
            case 'circle': return el.fill ? `it.filled_circle(${x}, ${y}, ${num(el.radius, 10)}, ${col});` : `it.circle(${x}, ${y}, ${num(el.radius, 10)}, ${col});`;
            case 'line': { const p = DD.pts(el); return `it.line(${p[0][0]}, ${p[0][1]}, ${p[1][0]}, ${p[1][1]}, ${col});`; }
            case 'hline': return `it.horizontal_line(${x}, ${y}, ${num(el.width, 10)}, ${col});`;
            case 'vline': return `it.vertical_line(${x}, ${y}, ${num(el.height, 10)}, ${col});`;
            case 'triangle': { const p = DD.pts(el); return `it.${el.fill ? 'filled_triangle' : 'triangle'}(${p[0][0]}, ${p[0][1]}, ${p[1][0]}, ${p[1][1]}, ${p[2][0]}, ${p[2][1]}, ${col});`; }
            case 'polygon': { const e = 'EDGES_' + (DD.EDGES[num(el.edges, 6)] || 'HEXAGON'); return el.fill ? `it.filled_regular_polygon(${x}, ${y}, ${num(el.radius, 15)}, ${e}, VARIATION_${el.variation || 'POINTY_TOP'}, ${col});` : `it.regular_polygon(${x}, ${y}, ${num(el.radius, 15)}, ${e}, VARIATION_${el.variation || 'POINTY_TOP'}, ${col});`; }
            case 'ring': return `it.filled_ring(${x}, ${y}, ${num(el.outer, 20)}, ${num(el.inner, 10)}, ${col});`;
            case 'gauge': { const p = typeof el.percent === 'number' ? el.percent : (String(el.percent || '0').trim() || '0'); return `it.filled_gauge(${x}, ${y}, ${num(el.outer, 30)}, ${num(el.inner, 20)}, ${p}, ${col});`; }
            case 'image': { if (!el.imageId) return '// Image: pick an image'; const id = `id(${el.imageId})`; const bin = (DD.images.find(i => i.id === el.imageId) || {}).type === 'BINARY'; const al = el.imgAlign && el.imgAlign !== 'TOP_LEFT' ? `, ImageAlign::${el.imgAlign}` : ''; if (bin && (el.colorOn || el.colorOff)) return `it.image(${x}, ${y}, ${id}${al || ', ImageAlign::TOP_LEFT'}, ${DD.espColor(el.colorOn || 'white')}, ${DD.espColor(el.colorOff || 'black')});`; return `it.image(${x}, ${y}, ${id}${al});`; }
            case 'graph': return `it.graph(${x}, ${y}, id(${espId(el, 'graph')}), ${col});`;
            case 'qr': return `it.qr_code(${x}, ${y}, id(${espId(el, 'qr')}), ${col}, ${Math.max(1, num(el.scale, 2))});`;
            case 'clock': { const font = el.fontId || 'id(default_font)', align = el.align || 'LEFT'; return `it.strftime(${x}, ${y}, ${font}, ${col}, ${align !== 'LEFT' ? `TextAlign::${align}, ` : ''}${q(el.format || '%H:%M')}, id(${el.timeId || 'ha_time'}).now());`; }
        }
        return `// Unsupported element type: ${el.type}`;
    };
    function bodyFor(pageEls, indent, clips) {
        let out = '';
        [...pageEls].reverse().forEach(el => {
            if (el.type === 'clip') return;
            const line = L(el), c = el.clipId && clips[el.clipId];
            if (c) { out += `${indent}it.start_clipping(${Math.round(num(c.x))}, ${Math.round(num(c.y))}, ${Math.round(num(c.x) + num(c.width, 10))}, ${Math.round(num(c.y) + num(c.height, 10))});\n${indent}${line}\n${indent}it.end_clipping();\n`; }
            else out += `${indent}${line}\n`;
        });
        return out;
    }
    window.generateLambdaCode = function () {
        const clips = {}; elements.forEach(e => { if (e.type === 'clip') clips[e.id] = e; });
        let code;
        if (DD.pages.length <= 1) code = 'lambda: |-\n' + bodyFor(DD.pageEls(DD.firstPage()), '  ', clips);
        else {
            code = '# Switch pages with display.page.show / show_next / show_previous\npages:\n';
            DD.pages.forEach(pg => { code += `  - id: ${pg.id}\n    lambda: |-\n` + (bodyFor(DD.pageEls(pg.id), '      ', clips) || '      // empty page\n'); });
        }
        generatedCodeOutput.value = code; codeSectionDetails.open = true;
    };

    // ------------------------------------------------------------------ assets: image / graph / qr_code / time
    DD.assetsYaml = function () {
        let y = '';
        const used = new Set(elements.filter(e => e.type === 'image' && e.imageId).map(e => e.imageId));
        const imgs = DD.images.filter(i => used.has(i.id) || !used.size);
        if (imgs.length) {
            y += 'image:\n';
            imgs.forEach(i => { y += `  - file: ${q(i.file || 'images/' + i.id + '.png')}\n    id: ${i.id}\n    type: ${i.type || 'RGB'}\n`; if (i.resize) y += `    resize: ${i.resize}\n`; if (i.transparency && i.transparency !== 'opaque') y += `    transparency: ${i.transparency}\n`; if (i.dither && i.dither !== 'NONE' && /BINARY|RGB111/.test(i.type)) y += `    dither: ${i.dither}\n`; if (i.invert_alpha) y += '    invert_alpha: true\n'; });
        }
        const graphs = elements.filter(e => e.type === 'graph');
        if (graphs.length) {
            y += (y ? '\n' : '') + 'graph:\n';
            graphs.forEach(g => {
                y += `  - id: ${espId(g, 'graph')}\n    width: ${num(g.width, 100)}\n    height: ${num(g.height, 50)}\n    duration: ${g.duration || '1h'}\n`;
                if (g.xGrid) y += `    x_grid: ${g.xGrid}\n`; if (g.yGrid) y += `    y_grid: ${num(g.yGrid)}\n`; if (g.border === false) y += '    border: false\n';
                if (g.minRange !== undefined && g.minRange !== '') y += `    min_range: ${num(g.minRange)}\n`; if (g.maxRange !== undefined && g.maxRange !== '') y += `    max_range: ${num(g.maxRange)}\n`;
                y += '    traces:\n';
                (g.traces || []).forEach(t => { y += `      - sensor: ${String(t.sensor || 'my_sensor').replace(/^id\(|\)$/g, '')}\n        line_thickness: ${Math.max(1, num(g.lineThickness, 3))}\n`; if (t.lineType && t.lineType !== 'SOLID') y += `        line_type: ${t.lineType}\n`; if (t.color) y += `        color: ${t.color}\n`; });
            });
        }
        const qrs = elements.filter(e => e.type === 'qr');
        if (qrs.length) { y += (y ? '\n' : '') + 'qr_code:\n'; qrs.forEach(e => { y += `  - id: ${espId(e, 'qr')}\n    value: ${q(e.value || '')}\n`; if (e.ecc && e.ecc !== 'LOW') y += `    ecc: ${e.ecc}\n`; }); }
        const clocks = elements.filter(e => e.type === 'clock'); const tids = [...new Set(clocks.map(c => c.timeId || 'ha_time'))];
        if (tids.length) { y += (y ? '\n' : '') + 'time:\n'; tids.forEach(id => { y += `  - platform: homeassistant\n    id: ${id}\n`; }); }
        return y;
    };
    // sensors the display reads (graph traces / gauge / text args): helpful stubs for Deploy
    DD.neededSensors = () => DD.sensorIds();

    // ------------------------------------------------------------------ colour + font blocks for the display type
    const origColor = window.generateColorYaml;
    window.generateColorYaml = function () {
        let y = origColor.apply(this, arguments);
        if (DD.mode() === 'gray' && /color:/.test(y)) { // grayscale panels read the white component only
            y = y.replace(/  - id: (\w+)\n    hex: "([0-9A-Fa-f]{6})"([^\n]*)\n/g, (m, id, hex, rest) => { const rgb = hexRgb('#' + hex); return `  - id: ${id}\n    red_int: 0\n    green_int: 0\n    blue_int: 0\n    white_int: ${Math.round(lum(rgb))}${rest}\n`; });
            const t = document.getElementById('generatedColorCodeOutput'); if (t) t.value = y;
        }
        return y;
    };
    // fonts: add bpp (default 1 in ESPHome) and weight for Google Fonts
    const origFont = window.generateFontYaml;
    window.generateFontYaml = function () {
        origFont.apply(this, arguments);
        let y = generatedFontCodeOutput.value; if (!/^font:/m.test(y)) return;
        y = y.replace(/  - file: ("[^"]*")\n    id: (\w+)\n    size: (\d+)\n/g, (m, file, id, size) => {
            const ov = fontOverrides[id] || {}; let out = `  - file: ${file}\n    id: ${id}\n    size: ${size}\n`;
            if (ov.bpp && ov.bpp !== 1) out += `    bpp: ${ov.bpp}\n`;
            return out;
        });
        generatedFontCodeOutput.value = y;
    };
})();
