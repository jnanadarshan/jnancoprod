// Displaysim sample designs: starting points users can open and build on. Authored bottom-to-top (first drawn first).
(function () {
    'use strict';
    const DD = window.DD;
    const FILES = { roboto: 'fonts/Roboto-Regular.ttf', roboto_bold: 'fonts/Roboto-Bold.ttf' };
    // font spec from an id like roboto_bold_24 / material_symbols_24
    function fontSpec(id, bpp) {
        const m = id.match(/^(.*?)_(\d+)$/), base = m[1], size = +m[2], icon = /material|symbol/.test(base);
        return { file: icon ? 'fonts/MaterialSymbols-Regular.ttf' : (FILES[base] || FILES.roboto), size, icon, bold: /bold/.test(base), bpp: icon ? 1 : bpp };
    }
    // lines / triangles are authored with absolute corner points and stored as offsets from x,y
    const E = (type, p) => { const o = { type, colorId: 'white', ...p }; ['2', '3'].forEach(n => { if (o['x' + n] !== undefined) { o['dx' + n] = o['x' + n] - o.x; o['dy' + n] = o['y' + n] - o.y; delete o['x' + n]; delete o['y' + n]; } }); return o; };
    const txt = (x, y, content, font, o) => E('text', { x, y, content, fontId: `id(${font})`, align: 'LEFT', args: '', ...o });
    const ico = (x, y, name, font, o) => E('icon', { x, y, iconLigature: name, fontId: `id(${font})`, ...o });

    function project(d) {
        const prof = DD.PROFILES.find(x => x.id === d.profile);
        const ids = d.fonts, overrides = {}; ids.forEach(id => { overrides[id] = fontSpec(id, d.bpp ?? 1); });
        const pages = d.pages || [{ id: 'page1' }];
        const authored = d.elements.map((e, i) => ({ ...e }));
        const els = authored.slice().reverse().map((e, i) => ({ id: i + 1, ...e }));   // index 0 = top, like the app
        return {
            format: 'jdnx-displaysim', version: 2, name: d.title,
            config: { resolution: `${prof.w}x${prof.h}`, customFonts: ids.map(i => `id(${i})`).join(', '), colors: 'id(primary_color), id(accent_color), white, black, red, green, blue', einkMode: prof.mode === 'epaper', screenBorder: 0, colorPalette: d.palette || [], fontOverrides: overrides },
            profileId: d.profile, pages, page: pages[0].id, live: { values: d.live || {}, strings: {}, time: { mode: 'fixed', iso: '2025-06-14T21:42:00' } },
            images: d.images || [], elements: els, nextId: els.length + 1
        };
    }
    // a small generated logo so the Image sample works offline
    function logoDataUrl(size, withAlpha) {
        const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
        if (!withAlpha) { x.fillStyle = '#fff'; x.fillRect(0, 0, size, size); }
        const g = x.createLinearGradient(0, 0, size, size); g.addColorStop(0, '#2563eb'); g.addColorStop(1, '#22d3ee');
        x.fillStyle = g; x.beginPath(); x.arc(size / 2, size / 2, size * .46, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.moveTo(size * .28, size * .62); x.lineTo(size * .5, size * .26); x.lineTo(size * .72, size * .62); x.closePath(); x.fill();
        x.fillStyle = '#0f172a'; x.fillRect(size * .44, size * .52, size * .12, size * .2);
        return c.toDataURL('image/png');
    }

    const SAMPLES = [
        { id: 'oled', title: 'OLED status screen', tags: ['1-bit', 'SSD1306', 'icons'], desc: '128×64 monochrome status display: Wi-Fi, temperature, humidity bar and uptime. Everything is on/off pixels.',
          build: () => project({ title: 'OLED status screen', profile: 'ssd1306_64', fonts: ['roboto_10', 'roboto_bold_16', 'roboto_bold_24', 'material_symbols_16'], bpp: 1, live: { temp: 23.4, humidity: 48 }, elements: [
            E('hline', { x: 0, y: 14, width: 128 }), txt(2, 1, 'Kitchen', 'roboto_10'), ico(110, -1, 'wifi', 'material_symbols_16'),
            txt(2, 18, '%.1f', 'roboto_bold_24', { content: '%.1f°C', args: 'id(temp).state' }), ico(100, 22, 'thermostat', 'material_symbols_16'),
            txt(2, 48, 'Hum', 'roboto_10'), E('rectangle', { x: 24, y: 49, width: 80, height: 9, fill: false, thickness: 1 }), E('bar', { x: 26, y: 51, width: 38, height: 5 }), txt(108, 48, '48%', 'roboto_10')] }) },
        { id: 'gray', title: 'Grayscale OLED dashboard', tags: ['16 gray', 'SSD1322', 'bars'], desc: '256×64 grayscale OLED. Colours become shades of gray; the generator writes Color(0, 0, 0, W) so they really show.',
          build: () => project({ title: 'Grayscale OLED dashboard', profile: 'ssd1322', fonts: ['roboto_10', 'roboto_bold_16', 'roboto_bold_24'], bpp: 4, palette: [{ name: 'dim', hex: '#555555' }, { name: 'mid', hex: '#aaaaaa' }], elements: [
            E('hline', { x: 0, y: 16, width: 256, colorId: 'id(dim)' }), txt(4, 2, 'POWER', 'roboto_bold_16', { colorId: 'id(mid)' }), txt(252, 2, '14:32', 'roboto_bold_16', { align: 'RIGHT' }),
            txt(4, 20, '1.84 kW', 'roboto_bold_24'), E('rectangle', { x: 130, y: 22, width: 120, height: 10, fill: false }), E('bar', { x: 132, y: 24, width: 80, height: 6, colorId: 'id(mid)' }),
            E('rectangle', { x: 130, y: 38, width: 120, height: 10, fill: false }), E('bar', { x: 132, y: 40, width: 40, height: 6, colorId: 'id(dim)' }), txt(4, 50, 'Solar 72%   Grid 28%', 'roboto_10', { colorId: 'id(mid)' })] }) },
        { id: 'sensors', title: 'Sensor dashboard (2 pages)', tags: ['colour', 'ILI9341', 'graph', 'pages'], desc: '240×320 colour TFT: header, big readings, a gauge and a live graph on page 1, device info on page 2.',
          build: () => project({ title: 'Sensor dashboard', profile: 'ili9341', fonts: ['roboto_12', 'roboto_16', 'roboto_bold_24', 'roboto_bold_40', 'material_symbols_24'], bpp: 4, palette: [{ name: 'primary_color', hex: '#3d6df2' }, { name: 'accent_color', hex: '#22c55e' }], live: { temp: 21.6, humidity: 47, co2: 62 },
            pages: [{ id: 'overview' }, { id: 'device' }], elements: [
            E('rectangle', { x: 0, y: 0, width: 240, height: 34, fill: true, colorId: 'id(primary_color)' }), txt(10, 7, 'Living room', 'roboto_bold_24'), ico(210, 5, 'wifi', 'material_symbols_24'),
            txt(14, 48, '%.1f°', 'roboto_bold_40', { content: '%.1f°', args: 'id(temp).state' }), txt(16, 98, 'Temperature', 'roboto_12', { colorId: 'id(accent_color)' }),
            E('gauge', { x: 180, y: 90, outer: 44, inner: 32, percent: 'id(co2).state', colorId: 'id(accent_color)' }), txt(180, 96, 'CO₂', 'roboto_12', { align: 'CENTER' }),
            E('hline', { x: 10, y: 118, width: 220, colorId: 'id(primary_color)' }), txt(14, 126, 'Humidity %.0f%%', 'roboto_16', { content: 'Humidity %.0f%%', args: 'id(humidity).state' }),
            E('graph', { x: 10, y: 160, width: 220, height: 110, duration: '1h', xGrid: '10min', yGrid: 2, lineThickness: 2, traces: [{ sensor: 'temp', color: 'id(accent_color)', lineType: 'SOLID' }], colorId: 'id(primary_color)' }),
            txt(120, 290, 'last hour', 'roboto_12', { align: 'CENTER' }),
            E('rectangle', { x: 0, y: 0, width: 240, height: 34, fill: true, colorId: 'id(primary_color)', page: 'device' }), txt(10, 7, 'Device', 'roboto_bold_24', { page: 'device' }),
            txt(14, 52, 'Firmware 2025.11', 'roboto_16', { page: 'device' }), txt(14, 80, 'IP 192.168.1.42', 'roboto_16', { page: 'device' }), E('qr', { x: 60, y: 130, value: 'http://192.168.1.42', scale: 5, ecc: 'MEDIUM', page: 'device' })] }) },
        { id: 'clock', title: 'Digital clock', tags: ['clock', 'ST7789V', 'polygon'], desc: '240×240 IPS: a big strftime clock, date line, ring decoration and hexagon accents. Uses a time: component.',
          build: () => project({ title: 'Digital clock', profile: 'st7789v', fonts: ['roboto_16', 'roboto_bold_24', 'roboto_bold_40'], bpp: 4, palette: [{ name: 'primary_color', hex: '#38bdf8' }], elements: [
            E('ring', { x: 120, y: 120, outer: 112, inner: 108, colorId: 'id(primary_color)' }), E('polygon', { x: 120, y: 28, radius: 8, edges: 6, variation: 'POINTY_TOP', fill: true, colorId: 'id(primary_color)' }),
            E('clock', { x: 120, y: 86, format: '%H:%M', fontId: 'id(roboto_bold_40)', align: 'CENTER', timeId: 'ha_time' }), E('clock', { x: 120, y: 140, format: '%A, %B %d', fontId: 'id(roboto_16)', align: 'CENTER', timeId: 'ha_time', colorId: 'id(primary_color)' }),
            E('hline', { x: 70, y: 170, width: 100, colorId: 'id(primary_color)' }), E('triangle', { x: 112, y: 196, x2: 128, y2: 196, x3: 120, y3: 184, fill: true, colorId: 'id(primary_color)' })] }) },
        { id: 'round', title: 'Round gauge', tags: ['round', 'GC9A01A', 'ring'], desc: 'For 240×240 round screens: filled gauge, ring and a centred reading. Corners outside the circle are cut like on the panel.',
          build: () => project({ title: 'Round gauge', profile: 'gc9a01a', fonts: ['roboto_12', 'roboto_bold_24', 'roboto_bold_40'], bpp: 4, palette: [{ name: 'primary_color', hex: '#22c55e' }, { name: 'accent_color', hex: '#f59e0b' }], live: { power: 72 }, elements: [
            E('ring', { x: 120, y: 120, outer: 116, inner: 112, colorId: 'Color(68, 68, 68)' }), E('gauge', { x: 120, y: 150, outer: 92, inner: 74, percent: 'id(power).state', colorId: 'id(primary_color)' }),
            txt(120, 96, '1.8', 'roboto_bold_40', { align: 'CENTER' }), txt(120, 146, 'kW', 'roboto_bold_24', { align: 'CENTER', colorId: 'id(accent_color)' }), txt(120, 190, 'Solar 72%', 'roboto_12', { align: 'CENTER' })] }) },
        { id: 'epaper', title: 'E-paper weather card', tags: ['e-paper', '2.9in', 'QR'], desc: '296×128 black-and-white e-paper: date, big temperature, icons, divider lines and a QR code. Updates rarely, so no animation.',
          build: () => project({ title: 'E-paper weather card', profile: 'epd290', fonts: ['roboto_12', 'roboto_bold_16', 'roboto_bold_40', 'material_symbols_24'], bpp: 1, live: { temp: 18 }, elements: [
            E('rectangle', { x: 0, y: 0, width: 296, height: 128, fill: false, colorId: 'black' }), txt(8, 6, 'Amsterdam', 'roboto_bold_16', { colorId: 'black' }), E('clock', { x: 288, y: 8, format: '%a %d %b', fontId: 'id(roboto_12)', align: 'RIGHT', timeId: 'ha_time', colorId: 'black' }),
            E('hline', { x: 8, y: 28, width: 280, colorId: 'black' }), ico(10, 40, 'sunny', 'material_symbols_24', { colorId: 'black' }), txt(44, 34, '%.0f°', 'roboto_bold_40', { content: '%.0f°', args: 'id(temp).state', colorId: 'black' }),
            txt(8, 92, 'Light breeze · 54% humidity', 'roboto_12', { colorId: 'black' }), E('qr', { x: 226, y: 36, value: 'https://esphome.io', scale: 2, ecc: 'LOW', colorId: 'black' }), E('vline', { x: 150, y: 36, height: 80, colorId: 'black' })] }) },
        { id: 'pages', title: 'Multi-page OLED menu', tags: ['pages', '1-bit', 'lines'], desc: 'Three pages for a 128×64 OLED, switched with display.page.show_next. Shows clock, network info and a shapes page.',
          build: () => project({ title: 'Multi-page OLED menu', profile: 'ssd1306_64', fonts: ['roboto_10', 'roboto_bold_16', 'roboto_bold_24'], bpp: 1, pages: [{ id: 'time' }, { id: 'network' }, { id: 'shapes' }], elements: [
            E('clock', { x: 64, y: 14, format: '%H:%M', fontId: 'id(roboto_bold_24)', align: 'CENTER', timeId: 'ha_time' }), E('clock', { x: 64, y: 44, format: '%a %d %b', fontId: 'id(roboto_10)', align: 'CENTER', timeId: 'ha_time' }),
            txt(2, 1, 'Network', 'roboto_bold_16', { page: 'network' }), E('hline', { x: 0, y: 18, width: 128, page: 'network' }), txt(2, 24, 'IP  192.168.1.42', 'roboto_10', { page: 'network' }), txt(2, 38, 'RSSI -58 dBm', 'roboto_10', { page: 'network' }), E('qr', { x: 90, y: 24, value: 'esphome.io', scale: 1, page: 'network' }),
            E('triangle', { x: 10, y: 52, x2: 30, y2: 52, x3: 20, y3: 30, fill: true, page: 'shapes' }), E('polygon', { x: 64, y: 38, radius: 18, edges: 6, variation: 'FLAT_TOP', fill: false, page: 'shapes' }), E('circle', { x: 108, y: 38, radius: 14, fill: true, page: 'shapes' }), E('line', { x: 2, y: 2, x2: 125, y2: 12, page: 'shapes' })] }) },
        { id: 'images', title: 'Image badge', tags: ['image', 'colour', 'clip'], desc: 'A generated logo shown as a colour image, a 1-bit dithered copy and inside a clip region. Replace it with your own PNG in Images.',
          build: () => { const url = logoDataUrl(96, true); return project({ title: 'Image badge', profile: 'ili9341', fonts: ['roboto_12', 'roboto_bold_24'], bpp: 4,
            images: [{ id: 'logo', name: 'logo.png', file: 'images/logo.png', type: 'RGB565', resize: '', transparency: 'alpha_channel', dither: 'NONE', invert_alpha: false, dataUrl: url }, { id: 'logo_1bit', name: 'logo.png', file: 'images/logo.png', type: 'BINARY', resize: '', transparency: 'chroma_key', dither: 'FLOYDSTEINBERG', invert_alpha: false, dataUrl: url }],
            elements: [txt(120, 8, 'Image types', 'roboto_bold_24', { align: 'CENTER' }), E('image', { x: 20, y: 50, imageId: 'logo', imgAlign: 'TOP_LEFT' }), txt(68, 150, 'RGB565 + alpha', 'roboto_12', { align: 'CENTER' }),
              E('image', { x: 124, y: 50, imageId: 'logo_1bit', imgAlign: 'TOP_LEFT', colorOn: 'white', colorOff: 'black' }), txt(172, 150, 'BINARY, dithered', 'roboto_12', { align: 'CENTER' }),
              E('clip', { x: 20, y: 200, width: 200, height: 40 }), E('image', { x: 120, y: 230, imageId: 'logo', imgAlign: 'CENTER', clipId: 12 })] }); } }
    ];
    // the clip sample refers to its own clip element by id; fix after numbering
    SAMPLES.forEach(s => { const b = s.build; s.build = () => { const p = b(); p.elements.forEach(e => { if (e.clipId !== undefined) { const clip = p.elements.find(c => c.type === 'clip'); if (clip) e.clipId = clip.id; } }); return p; }; });
    DD.SAMPLES = SAMPLES;

    // ---- render a sample into a thumbnail without touching the real state
    function withProject(p, fn) {
        const keep = { elements, fontOverrides, colorPalette, einkMode, screenBorder, fonts: configCustomFontsTextarea.value, pages: DD.pages, page: DD.page, profileId: DD.profileId, images: DD.images, cache: DD.imgCache, live: DD.live };
        try {
            elements = p.elements; fontOverrides = p.config.fontOverrides; colorPalette = p.config.colorPalette; einkMode = p.config.einkMode; screenBorder = 0; configCustomFontsTextarea.value = p.config.customFonts;
            DD.pages = p.pages; DD.page = p.page; DD.profileId = p.profileId; DD.images = p.images.map(({ dataUrl, ...m }) => m); DD.live = p.live;
            DD.imgCache = new Map(); (p._canvases || []).forEach(([id, c]) => DD.imgCache.set(id, c));
            return fn();
        } finally {
            elements = keep.elements; fontOverrides = keep.fontOverrides; colorPalette = keep.colorPalette; einkMode = keep.einkMode; screenBorder = keep.screenBorder; configCustomFontsTextarea.value = keep.fonts;
            DD.pages = keep.pages; DD.page = keep.page; DD.profileId = keep.profileId; DD.images = keep.images; DD.imgCache = keep.cache; DD.live = keep.live;
        }
    }
    DD.renderProjectTo = function (p, canvas, scale) {
        const [W, H] = p.config.resolution.split('x').map(Number); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        withProject(p, () => DD.render(ctx, W, H, { elements: p.elements, page: p.page, profile: DD.profile(), pixel: true, border: 0, markers: false }));
        if (scale) { canvas.style.width = Math.round(W * scale) + 'px'; canvas.style.height = Math.round(H * scale) + 'px'; }
    };
    // decode embedded sample images once so thumbnails can show them
    function prepare(p) {
        if (p._canvases) return Promise.resolve();
        p._canvases = [];
        return Promise.all((p.images || []).map(m => new Promise(res => { const img = new Image(); img.onload = () => { const { dataUrl, ...meta } = m; p._canvases.push([m.id, DD.processImage(meta, img)]); res(); }; img.onerror = res; img.src = m.dataUrl; })));
    }

    // ---- gallery
    DD.openSamples = function (opts) {
        opts = opts || {};
        const h = DD.h, ic = DD.ic, grid = h('div', { class: 'dd-samples' });
        const m = DD.modal({ title: 'Samples', icon: 'auto_awesome', wide: true, tall: true, body: h('div', null, h('p', { class: 'dd-lead' }, opts.welcome ? 'Welcome! Pick a design to start from and change anything, or close this to keep working on your own.' : 'Start from a finished design and build on top of it. Each one is complete: fonts, colours, pages and live data included.'), grid),
            foot: [h('span', { class: 'dd-grow dd-hint' }, 'Opening a sample replaces the current design (you can undo with Open project / your saved file).'), h('button', { class: 'dd-btn-sm', onclick: () => { m.close(); document.getElementById('import-yaml-btn').click(); } }, ic('integration_instructions'), 'Import my YAML')] });
        SAMPLES.forEach(s => {
            const p = s.build(); const prof = DD.PROFILES.find(x => x.id === p.profileId);
            const thumb = document.createElement('canvas'); thumb.className = 'dd-sample-canvas';
            const open = async () => { if (!opts.welcome && elements.length && !confirm('Replace the current design with this sample?')) return; await DD.loadProject(p); m.close(); DD.toast(`Opened <b>${s.title}</b>. Select anything to edit it.`); };
            const card = h('div', { class: 'dd-sample' }, h('button', { class: 'dd-sample-thumb', title: 'Open ' + s.title, onclick: open }, thumb),
                h('div', { class: 'dd-sample-info' }, h('div', { class: 'dd-sample-title' }, h('b', null, s.title), h('small', null, `${prof.w}×${prof.h} · ${prof.mode === 'epaper' ? 'e-paper' : prof.mode === 'mono' ? '1-bit' : prof.mode === 'gray' ? 'grayscale' : 'colour'} · ${p.pages.length} page${p.pages.length === 1 ? '' : 's'}`)),
                    h('p', null, s.desc), h('div', { class: 'dd-tags' }, ...s.tags.map(t => h('span', { class: 'dd-tag' }, t))), h('button', { class: 'dd-btn-sm primary', onclick: open }, ic('open_in_new'), 'Open')));
            grid.append(card);
            prepare(p).then(() => { const sc = Math.max(1, Math.min(4, Math.floor(280 / Math.max(prof.w, prof.h * 1.4)))); DD.renderProjectTo(p, thumb, sc); thumb.style.imageRendering = 'pixelated'; });
        });
    };
    // first visit: offer the samples
    DD.maybeWelcome = function () { if (!DD.LS.get('dd.welcomed', '') && !elements.length) { DD.LS.set('dd.welcomed', '1'); setTimeout(() => DD.openSamples({ welcome: true }), 600); } };
})();
