// Displaysim core: display profiles, pages, live (simulated) data, images, project import/export.
// Classic script: shares the global state of index.html (elements, einkMode, fontOverrides ...).
(function () {
    'use strict';
    const DD = window.DD = window.DD || {};
    const LS = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    };
    DD.LS = LS;
    const META_KEY = 'dd.meta';

    // ------------------------------------------------------------------ display profiles
    // mode: color | mono | gray | epaper. ink (epaper): bw | bwr | bwy. levels: gray levels. Sizes are typical for the module.
    const P = (id, label, group, w, h, mode, platform, model, extra) => ({ id, label, group, w, h, mode, platform, model, ...extra });
    DD.PROFILES = [
        P('color_custom', 'Color display (custom size)', 'Color', 320, 240, 'color', 'ili9xxx', 'ILI9341'),
        P('ili9341', 'ILI9341 TFT 240 × 320', 'Color', 240, 320, 'color', 'ili9xxx', 'ILI9341'),
        P('ili9488', 'ILI9488 TFT 320 × 480', 'Color', 320, 480, 'color', 'ili9xxx', 'ILI9488'),
        P('st7789v', 'ST7789V IPS 240 × 240', 'Color', 240, 240, 'color', 'st7789v', 'Adafruit_1.54in_240x240'),
        P('st7735', 'ST7735 TFT 128 × 160', 'Color', 128, 160, 'color', 'st7735', 'INITR_BLACKTAB'),
        P('gc9a01a', 'GC9A01A round 240 × 240', 'Color', 240, 240, 'color', 'ili9xxx', 'GC9A01A', { round: true }),
        P('ssd1351', 'SSD1351 OLED 128 × 128', 'Color', 128, 128, 'color', 'ssd1351_spi', 'SSD1351 128x128'),
        P('ssd1306_64', 'SSD1306 OLED 128 × 64 (1-bit)', 'Monochrome', 128, 64, 'mono', 'ssd1306_i2c', 'SSD1306 128x64'),
        P('ssd1306_32', 'SSD1306 OLED 128 × 32 (1-bit)', 'Monochrome', 128, 32, 'mono', 'ssd1306_i2c', 'SSD1306 128x32'),
        P('sh1106', 'SH1106 OLED 128 × 64 (1-bit)', 'Monochrome', 128, 64, 'mono', 'ssd1306_i2c', 'SH1106 128x64'),
        P('pcd8544', 'PCD8544 Nokia LCD 84 × 48 (1-bit)', 'Monochrome', 84, 48, 'mono', 'pcd8544', ''),
        P('mono_custom', 'Monochrome (custom size)', 'Monochrome', 128, 64, 'mono', 'ssd1306_i2c', 'SSD1306 128x64'),
        P('ssd1322', 'SSD1322 OLED 256 × 64 (16 gray)', 'Grayscale', 256, 64, 'gray', 'ssd1322_spi', 'SSD1322 256x64', { levels: 16 }),
        P('ssd1327', 'SSD1327 OLED 128 × 128 (16 gray)', 'Grayscale', 128, 128, 'gray', 'ssd1327_i2c', 'SSD1327 128x128', { levels: 16 }),
        P('ssd1325', 'SSD1325 OLED 128 × 64 (16 gray)', 'Grayscale', 128, 64, 'gray', 'ssd1325_spi', 'SSD1325 128x64', { levels: 16 }),
        P('gray_custom', 'Grayscale (custom size)', 'Grayscale', 128, 64, 'gray', 'ssd1322_spi', 'SSD1322 256x64', { levels: 16 }),
        P('epd154', 'E-paper 1.54″ 200 × 200 (B/W)', 'E-paper', 200, 200, 'epaper', 'waveshare_epaper', '1.54in', { ink: 'bw' }),
        P('epd213', 'E-paper 2.13″ 250 × 122 (B/W)', 'E-paper', 250, 122, 'epaper', 'waveshare_epaper', '2.13in-ttgo', { ink: 'bw' }),
        P('epd290', 'E-paper 2.9″ 296 × 128 (B/W)', 'E-paper', 296, 128, 'epaper', 'waveshare_epaper', '2.90in', { ink: 'bw' }),
        P('epd420', 'E-paper 4.2″ 400 × 300 (B/W)', 'E-paper', 400, 300, 'epaper', 'waveshare_epaper', '4.20in', { ink: 'bw' }),
        P('epd750', 'E-paper 7.5″ 800 × 480 (B/W)', 'E-paper', 800, 480, 'epaper', 'waveshare_epaper', '7.50in', { ink: 'bw' }),
        P('epd290r', 'E-paper 2.9″ 296 × 128 (B/W/Red)', 'E-paper', 296, 128, 'epaper', 'waveshare_epaper', '2.90in-bwr', { ink: 'bwr', modelNote: 'Check the exact tri-colour model name in the ESPHome waveshare_epaper docs.' }),
        P('epd_custom', 'E-paper (custom size, B/W)', 'E-paper', 296, 128, 'epaper', 'waveshare_epaper', '2.90in', { ink: 'bw' })
    ];
    DD.MODES = {
        color: { label: 'Colour', how: 'Every colour is shown as given. ESPHome draws RGB565 (16-bit) on most panels.' },
        mono: { label: '1-bit', how: 'A pixel is off only for Color::BLACK; any other colour turns it on. Text uses anti-aliasing only with bpp ≥ 2 (then it is thresholded).' },
        gray: { label: 'Grayscale', how: 'Only the white component is used: Color(255,255,255) would draw black, so the generator writes Color(0, 0, 0, W) / Color::WHITE for you. 16 levels.' },
        epaper: { label: 'E-paper', how: 'Colours are converted by brightness to the nearest ink (black, white' + ', red/yellow on tri-colour panels). Pure saturated colours may come out white.' }
    };
    DD.profileId = null;
    DD.profile = function () {
        let p = DD.PROFILES.find(x => x.id === DD.profileId);
        if (!p) p = DD.PROFILES.find(x => x.id === (einkMode ? 'epd_custom' : 'color_custom'));
        return p;
    };
    DD.mode = () => DD.profile().mode;

    // ------------------------------------------------------------------ resolution helper (same effect as the custom-size UI)
    DD.setResolution = function (w, h) {
        const v = `${w}x${h}`;
        let o = [...configResolutionSelect.options].find(x => x.value === v);
        if (!o) { o = document.createElement('option'); o.value = v; o.textContent = `${w} x ${h}`; configResolutionSelect.appendChild(o); if (!customResolutions.includes(v)) customResolutions.push(v); }
        configResolutionSelect.value = v;
        updateScreenSize();
    };
    DD.size = () => (/^\d+x\d+$/.test(configResolutionSelect.value) ? configResolutionSelect.value : '128x160').split('x').map(Number);

    DD.setProfile = function (id, opts) {
        opts = opts || {};
        const p = DD.PROFILES.find(x => x.id === id); if (!p) return;
        DD.profileId = id;
        const wantEink = p.mode === 'epaper';
        if (wantEink !== !!einkMode) setEinkMode(wantEink); // flips default ink white<->black
        if (opts.resize !== false && !/_custom$/.test(id)) DD.setResolution(p.w, p.h);
        DD.saveMeta(); saveToCache();
        if (DD.onProfile) DD.onProfile(p);
        drawPreview(); if (typeof updateEditorForm === 'function') updateEditorForm();
    };

    // ------------------------------------------------------------------ pages
    DD.pages = [{ id: 'page1' }];
    DD.page = 'page1';
    DD.firstPage = () => DD.pages[0].id;
    DD.pageOf = el => (el && el.page && DD.pages.some(p => p.id === el.page)) ? el.page : DD.firstPage();
    DD.pageEls = pid => elements.filter(e => DD.pageOf(e) === pid);
    DD.setPage = function (id) { if (!DD.pages.some(p => p.id === id)) return; DD.page = id; if (selectedElementId !== null) { const el = elements.find(e => e.id === selectedElementId); if (el && DD.pageOf(el) !== id) selectedElementId = null; } DD.saveMeta(); if (DD.onPages) DD.onPages(); renderElementList(); if (typeof updateEditorForm === 'function') updateEditorForm(); drawPreview(); };
    DD.addPage = function () { let n = DD.pages.length + 1, id = 'page' + n; while (DD.pages.some(p => p.id === id)) id = 'page' + (++n); DD.pages.push({ id }); DD.setPage(id); saveToCache(); };
    DD.renamePage = function (oldId, nid) {
        nid = String(nid).trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1'); if (!nid || nid === oldId || DD.pages.some(p => p.id === nid)) return false;
        DD.pages.find(p => p.id === oldId).id = nid; elements.forEach(e => { if (e.page === oldId) e.page = nid; }); if (DD.page === oldId) DD.page = nid;
        DD.saveMeta(); saveToCache(); if (DD.onPages) DD.onPages(); return true;
    };
    DD.deletePage = function (id) {
        if (DD.pages.length < 2) return;
        elements = elements.filter(e => DD.pageOf(e) !== id || false);
        DD.pages = DD.pages.filter(p => p.id !== id); if (DD.page === id) DD.page = DD.firstPage();
        selectedElementId = null; DD.saveMeta(); saveToCache(); if (DD.onPages) DD.onPages(); renderElementList(); updateEditorForm(); drawPreview();
    };

    // ------------------------------------------------------------------ live (simulated) data
    DD.live = { values: {}, strings: {}, time: { mode: 'now', iso: '2025-06-14T21:42:00' } };
    DD.timeNow = () => DD.live.time.mode === 'fixed' ? new Date(DD.live.time.iso) : new Date();
    const idsIn = s => { const out = []; String(s || '').replace(/id\(\s*(\w+)\s*\)/g, (_, n) => { out.push(n); return _; }); return out; };
    // sensor ids used by element args / gauge percent / graph traces
    DD.sensorIds = function () {
        const set = new Set();
        elements.forEach(el => {
            if (el.args) idsIn(el.args).forEach(n => set.add(n));
            if (el.percent && typeof el.percent === 'string') idsIn(el.percent).forEach(n => set.add(n));
            if (el.type === 'graph') (el.traces || []).forEach(t => { if (t.sensor) set.add(String(t.sensor).replace(/^id\(|\)$/g, '')); });
        });
        return [...set];
    };
    DD.sensorValue = function (id) { const v = DD.live.values[id]; if (v !== undefined && v !== '') return v; return DD.defaultValue(id); };
    // plausible default so a freshly-added sensor shows something sensible
    DD.defaultValue = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return Math.round((15 + (h % 150) / 10) * 10) / 10; };
    const parseArgs = s => { const out = []; let d = 0, cur = '', q = null; for (const c of String(s || '')) { if (q) { cur += c; if (c === q) q = null; continue; } if (c === '"' || c === "'") { q = c; cur += c; continue; } if (c === '(' || c === '[') d++; if (c === ')' || c === ']') d--; if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur.trim()); return out; };
    DD.evalArg = function (a) {
        const m = String(a).match(/id\(\s*(\w+)\s*\)\s*\.\s*(state|raw_state)?/);
        if (m) { const s = DD.live.strings[m[1]]; if (s !== undefined && s !== '') return s; return DD.sensorValue(m[1]); }
        if (/^-?\d+(\.\d+)?f?$/.test(a)) return parseFloat(a);
        const q = String(a).match(/^"(.*)"$/); if (q) return q[1];
        return a;
    };
    // C printf subset: %d %i %u %f %e %g %s %x %c %%, with flags, width, precision
    DD.printf = function (fmt, argsStr) {
        const args = parseArgs(argsStr).map(DD.evalArg); let n = 0;
        return String(fmt).replace(/%([-+ 0#]*)(\d+)?(?:\.(\d+))?([diufFeEgGsxXc%])/g, (all, flags, width, prec, conv) => {
            if (conv === '%') return '%';
            let v = args[n++]; let s;
            if (v === undefined) return all;
            if ('diu'.includes(conv)) s = String(Math.trunc(Number(v)) || 0);
            else if ('fF'.includes(conv)) s = (Number(v) || 0).toFixed(prec === undefined ? 6 : +prec);
            else if ('eE'.includes(conv)) s = (Number(v) || 0).toExponential(prec === undefined ? 6 : +prec);
            else if ('gG'.includes(conv)) s = String(+(Number(v) || 0).toPrecision(prec === undefined ? 6 : Math.max(1, +prec)));
            else if ('xX'.includes(conv)) { s = (Math.trunc(Number(v)) >>> 0).toString(16); if (conv === 'X') s = s.toUpperCase(); }
            else if (conv === 'c') s = String(v).slice(0, 1); else s = String(v);
            if (flags.includes('+') && 'diufFeEgG'.includes(conv) && Number(v) >= 0) s = '+' + s;
            if (width && s.length < +width) s = flags.includes('-') ? s.padEnd(+width) : (flags.includes('0') && 'diufFeEgGxX'.includes(conv) ? (s[0] === '-' || s[0] === '+' ? s[0] + s.slice(1).padStart(+width - 1, '0') : s.padStart(+width, '0')) : s.padStart(+width));
            return s;
        });
    };
    const D2 = (n, w = 2) => String(n).padStart(w, '0');
    const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    DD.strftime = function (fmt, d) {
        d = d || DD.timeNow();
        const h12 = d.getHours() % 12 || 12;
        const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
        return String(fmt).replace(/%([a-zA-Z%])/g, (all, c) => ({
            H: D2(d.getHours()), M: D2(d.getMinutes()), S: D2(d.getSeconds()), I: D2(h12), l: String(h12), p: d.getHours() < 12 ? 'AM' : 'PM',
            d: D2(d.getDate()), e: String(d.getDate()).padStart(2, ' '), m: D2(d.getMonth() + 1), y: D2(d.getFullYear() % 100), Y: String(d.getFullYear()),
            b: MON[d.getMonth()].slice(0, 3), B: MON[d.getMonth()], a: DAY[d.getDay()].slice(0, 3), A: DAY[d.getDay()], j: D2(doy, 3),
            u: String(d.getDay() || 7), w: String(d.getDay()), '%': '%', Z: 'UTC', z: '+0000', T: `${D2(d.getHours())}:${D2(d.getMinutes())}:${D2(d.getSeconds())}`, R: `${D2(d.getHours())}:${D2(d.getMinutes())}`, F: `${d.getFullYear()}-${D2(d.getMonth() + 1)}-${D2(d.getDate())}`
        }[c] ?? all));
    };

    // ------------------------------------------------------------------ images (blobs in IndexedDB, converted like ESPHome)
    DD.images = [];            // {id, name, type, resize, transparency, dither, invert_alpha}
    DD.rawImages = new Map();  // id -> HTMLImageElement
    DD.imgCache = new Map();   // id -> processed canvas
    const idb = (() => {
        let dbp = null;
        const open = () => dbp || (dbp = new Promise((res, rej) => { if (!globalThis.indexedDB) { rej(new Error('no indexedDB')); return; } const r = indexedDB.open('ddStudio', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
        const tx = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('blobs', mode), s = t.objectStore('blobs'), out = fn(s); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }));
        return { get: k => tx('readonly', s => s.get(k)).catch(() => null), put: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => null), del: k => tx('readwrite', s => s.delete(k)).catch(() => null) };
    })();
    DD.idb = idb;
    const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
    const BAYER = null;
    function processImage(meta, img) {
        let w = img.width, h = img.height;
        const m = String(meta.resize || '').match(/^(\d+)x(\d+)$/i);
        if (m) { const bw = +m[1], bh = +m[2], s = Math.min(bw / w, bh / h); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
        const c = mkCanvas(w, h), x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h);
        const type = String(meta.type || 'RGB').toUpperCase(), tr = String(meta.transparency || 'opaque').toLowerCase();
        let d; try { d = x.getImageData(0, 0, w, h); } catch (e) { return c; }
        const p = d.data;
        const lum = i => .299 * p[i] + .587 * p[i + 1] + .114 * p[i + 2];
        if (type === 'BINARY' || type === 'RGB111') {
            if (String(meta.dither || 'NONE').toUpperCase() === 'FLOYDSTEINBERG') {
                // error diffusion on luminance (BINARY) or per channel (RGB111)
                const ch = type === 'BINARY' ? 1 : 3, buf = new Float32Array(w * h * ch);
                for (let i = 0, j = 0; i < p.length; i += 4, j += ch) { if (ch === 1) buf[j] = lum(i); else { buf[j] = p[i]; buf[j + 1] = p[i + 1]; buf[j + 2] = p[i + 2]; } }
                for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) for (let k = 0; k < ch; k++) {
                    const idx = (yy * w + xx) * ch + k, old = buf[idx], nw = old < 128 ? 0 : 255, err = old - nw; buf[idx] = nw;
                    if (xx + 1 < w) buf[idx + ch] += err * 7 / 16; if (yy + 1 < h) { if (xx > 0) buf[idx + w * ch - ch] += err * 3 / 16; buf[idx + w * ch] += err * 5 / 16; if (xx + 1 < w) buf[idx + w * ch + ch] += err * 1 / 16; }
                }
                for (let i = 0, j = 0; i < p.length; i += 4, j += ch) { if (ch === 1) p[i] = p[i + 1] = p[i + 2] = buf[j]; else { p[i] = buf[j]; p[i + 1] = buf[j + 1]; p[i + 2] = buf[j + 2]; } }
            } else for (let i = 0; i < p.length; i += 4) { if (type === 'BINARY') { const v = lum(i) > 127 ? 255 : 0; p[i] = p[i + 1] = p[i + 2] = v; } else { p[i] = p[i] > 127 ? 255 : 0; p[i + 1] = p[i + 1] > 127 ? 255 : 0; p[i + 2] = p[i + 2] > 127 ? 255 : 0; } }
        } else if (type === 'GRAYSCALE') { for (let i = 0; i < p.length; i += 4) { const l = Math.round(lum(i)); p[i] = p[i + 1] = p[i + 2] = l; } }
        else if (type === 'RGB565') { for (let i = 0; i < p.length; i += 4) { p[i] = (p[i] >> 3) * 255 / 31 | 0; p[i + 1] = (p[i + 1] >> 2) * 255 / 63 | 0; p[i + 2] = (p[i + 2] >> 3) * 255 / 31 | 0; } }
        for (let i = 0; i < p.length; i += 4) {
            if (tr === 'opaque') p[i + 3] = 255;
            else if (tr === 'chroma_key') { if (p[i] === 0 && p[i + 1] === 255 && p[i + 2] === 0) p[i + 3] = 0; else p[i + 3] = 255; }
            else if (tr === 'alpha_channel' && type === 'BINARY') p[i + 3] = p[i + 3] > 127 ? 255 : 0;
            if (meta.invert_alpha && (type === 'BINARY' || type === 'GRAYSCALE')) { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; }
        }
        x.putImageData(d, 0, 0);
        c._binary = type === 'BINARY';
        return c;
    }
    DD.processImage = processImage;
    DD.refreshImage = function (id) { const meta = DD.images.find(i => i.id === id), raw = DD.rawImages.get(id); if (!meta || !raw) { DD.imgCache.delete(id); return; } DD.imgCache.set(id, processImage(meta, raw)); };
    DD.imageCanvas = id => DD.imgCache.get(String(id).replace(/^id\(|\)$/g, '')) || null;
    DD.addImageFile = async function (file, id) {
        const blob = file instanceof Blob ? file : new Blob([file]);
        await idb.put('img:' + id, blob);
        return new Promise(res => { const img = new Image(); img.onload = () => { DD.rawImages.set(id, img); DD.refreshImage(id); res(img); }; img.onerror = () => res(null); img.src = URL.createObjectURL(blob); });
    };
    DD.loadImages = function () {
        DD.images.forEach(meta => {
            if (DD.rawImages.has(meta.id)) return;
            idb.get('img:' + meta.id).then(blob => { if (!blob) return; const img = new Image(); img.onload = () => { DD.rawImages.set(meta.id, img); DD.refreshImage(meta.id); if (typeof drawPreview === 'function') drawPreview(); }; img.src = URL.createObjectURL(blob); });
        });
    };
    DD.nextImageId = base => { let id = String(base).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'img_$1') || 'img', n = 2, b = id; while (DD.images.some(i => i.id === id)) id = b + '_' + n++; return id; };

    // ------------------------------------------------------------------ persistence of everything the monolith does not know about
    DD.saveMeta = function () {
        LS.set(META_KEY, JSON.stringify({ pages: DD.pages, page: DD.page, profileId: DD.profileId, live: DD.live, images: DD.images, ui: DD.ui || {} }));
    };
    DD.loadMeta = function () {
        try {
            const m = JSON.parse(LS.get(META_KEY, 'null')); if (!m) return;
            if (Array.isArray(m.pages) && m.pages.length) DD.pages = m.pages;
            DD.page = DD.pages.some(p => p.id === m.page) ? m.page : DD.firstPage();
            DD.profileId = m.profileId || null;
            if (m.live) DD.live = Object.assign({ values: {}, strings: {}, time: { mode: 'now', iso: DD.live.time.iso } }, m.live);
            if (Array.isArray(m.images)) DD.images = m.images;
            DD.ui = m.ui || {};
        } catch (e) { /* ignore */ }
    };
    DD.ui = {};

    // ------------------------------------------------------------------ project (everything, JSON)
    DD.exportProject = async function (withImages) {
        const images = [];
        for (const meta of DD.images) { const o = { ...meta }; if (withImages !== false) { const b = await idb.get('img:' + meta.id); if (b) o.dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } images.push(o); }
        return {
            format: 'jdnx-displaysim', version: 2,
            config: { resolution: configResolutionSelect.value, customFonts: configCustomFontsTextarea.value, colors: configColorsInput.value, einkMode, screenBorder, colorPalette, fontOverrides },
            profileId: DD.profileId, pages: DD.pages, page: DD.page, live: DD.live, images,
            elements: JSON.parse(JSON.stringify(elements, (k, v) => k[0] === '_' ? undefined : v)), nextId
        };
    };
    DD.loadProject = async function (p, opts) {
        opts = opts || {};
        if (!p || !p.config) throw new Error('Not a Displaysim project.');
        const c = p.config;
        elements = []; selectedElementId = null;
        if (c.customFonts !== undefined) configCustomFontsTextarea.value = c.customFonts;
        if (c.colors !== undefined) configColorsInput.value = c.colors;
        colorPalette = Array.isArray(c.colorPalette) ? c.colorPalette.filter(x => x && x.name && /^#[0-9a-f]{6}$/i.test(x.hex)) : [];
        fontOverrides = (c.fontOverrides && typeof c.fontOverrides === 'object') ? c.fontOverrides : {};
        einkMode = !!c.einkMode; screenBorder = Math.max(0, parseInt(c.screenBorder) || 0);
        DD.pages = Array.isArray(p.pages) && p.pages.length ? p.pages : [{ id: 'page1' }];
        DD.page = DD.pages.some(x => x.id === p.page) ? p.page : DD.firstPage();
        DD.profileId = p.profileId || null;
        DD.live = Object.assign({ values: {}, strings: {}, time: { mode: 'now', iso: '2025-06-14T21:42:00' } }, p.live || {});
        DD.images = []; DD.rawImages.clear(); DD.imgCache.clear();
        for (const im of (p.images || [])) {
            const { dataUrl, ...meta } = im; DD.images.push(meta);
            if (dataUrl) { const b = await (await fetch(dataUrl)).blob(); await DD.addImageFile(b, meta.id); }
        }
        if (c.resolution && /^\d+x\d+$/.test(c.resolution)) { const [w, h] = c.resolution.split('x').map(Number); DD.setResolution(w, h); }
        syncDisplayOptionsUI();
        elements = (p.elements || []).map(e => ({ ...e })); nextId = p.nextId || (elements.reduce((m, e) => Math.max(m, +e.id || 0), 0) + 1);
        initializeConfig(); if (window.paletteRender) window.paletteRender();
        if (window.setWorkflowConfirmed) window.setWorkflowConfirmed(true);
        DD.saveMeta(); saveToCache();
        if (DD.onPages) DD.onPages(); if (DD.onProfile) DD.onProfile(DD.profile());
        renderElementList(); updateEditorForm(); updateScreenSize(); drawPreview();
        if (typeof generateLambdaCode === 'function') { generateLambdaCode(); generateFontYaml(); }
    };

    // wrap the monolith persistence so DD state is saved/loaded with it
    const origSave = window.saveToCache;
    window.saveToCache = function () { const r = origSave.apply(this, arguments); try { DD.saveMeta(); } catch (e) { /* ignore */ } return r; };
    const origLoad = window.loadFromCache;
    window.loadFromCache = function () { DD.loadMeta(); return origLoad.apply(this, arguments); };
    DD.loadMeta();
})();
