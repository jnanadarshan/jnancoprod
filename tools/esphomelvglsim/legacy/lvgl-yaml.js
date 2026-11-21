// LVGL Designer: shared model helpers (pages, fonts), YAML generation, and the text_font property.
// Replaces the old updateCodeOutput() so every other module can rely on one generator.
// Globals from index.html: widgetsOnCanvas, canvas, modalCodeOutput, jsyaml.
(function () {
    'use strict';
    const L = window.LVGL = window.LVGL || {};
    const LS = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
    };
    const FONT_KEY = 'lvglDesignerFonts', PAGE_KEY = 'lvglDesignerPages';

    // ---- ESPHome tags (!lambda, !secret ...) survive import -> edit -> export ----------
    class Tag { constructor(tag, value) { this.tag = tag; this.value = value; } }
    const tagTypes = ['!lambda', '!secret', '!include', '!extend', '!remove'].map(t => new jsyaml.Type(t, {
        kind: 'scalar', construct: d => new Tag(t, d == null ? '' : d),
        instanceOf: Tag, predicate: o => o instanceof Tag && o.tag === t, represent: o => o.value
    }));
    L.Tag = Tag;
    L.schema = jsyaml.DEFAULT_SCHEMA.extend(tagTypes);
    // js-yaml quotes the key `y` (a YAML 1.1 boolean); ESPHome's parser treats it as a plain key, so keep it readable.
    L.dump = obj => jsyaml.dump(obj, { schema: L.schema, indent: 2, lineWidth: -1, noRefs: true }).replace(/^(\s*(?:- )?)'y':/gm, '$1y:');

    // ---- fonts -----------------------------------------------------------------------
    L.BUILTIN_FONTS = ['montserrat_8', 'montserrat_10', 'montserrat_12', 'montserrat_14', 'montserrat_16', 'montserrat_18', 'montserrat_20', 'montserrat_22', 'montserrat_24', 'montserrat_26', 'montserrat_28', 'montserrat_30', 'montserrat_32', 'montserrat_34', 'montserrat_36', 'montserrat_38', 'montserrat_40', 'montserrat_42', 'montserrat_44', 'montserrat_46', 'montserrat_48', 'montserrat_28_compressed', 'simsun_16_cjk', 'unscii_8', 'unscii_16', 'dejavu_16_persian_hebrew'];
    // widgets whose text can use text_font
    L.TEXT_WIDGETS = new Set(['label', 'button', 'checkbox', 'dropdown', 'textarea', 'roller', 'spinbox', 'msgbox', 'keyboard', 'buttonmatrix', 'list', 'table', 'calendar', 'tabview']);
    L.DEFAULT_FONT = 'montserrat_14';
    L.fonts = [];      // custom fonts: {id, kind:'gfonts'|'file'|'icons', file, family, size, bpp, glyphs}
    L.pages = [{ id: 'main_page' }];
    L.current = 'main_page';

    L.loadMeta = function () {
        try { const f = JSON.parse(LS.get(FONT_KEY) || '[]'); if (Array.isArray(f)) L.fonts = f.filter(x => x && x.id); } catch (e) { /* ignore */ }
        try {
            const p = JSON.parse(LS.get(PAGE_KEY) || 'null');
            if (p && Array.isArray(p.pages) && p.pages.length) { L.pages = p.pages; L.current = p.pages.some(x => x.id === p.current) ? p.current : p.pages[0].id; }
        } catch (e) { /* ignore */ }
    };
    L.saveMeta = function () { LS.set(FONT_KEY, JSON.stringify(L.fonts)); LS.set(PAGE_KEY, JSON.stringify({ pages: L.pages, current: L.current })); };

    L.fontSize = function (id) {
        if (!id) return 14;
        const c = L.fonts.find(f => f.id === id); if (c) return c.size || 14;
        const m = String(id).match(/_(\d+)/); return m ? parseInt(m[1], 10) : 14;
    };
    L.allFontIds = () => [...L.BUILTIN_FONTS, ...L.fonts.map(f => f.id)];
    L.isDefined = id => L.BUILTIN_FONTS.includes(id) || L.fonts.some(f => f.id === id);

    const q = s => JSON.stringify(String(s)); // YAML-safe double-quoted string
    L.fontYaml = function () {
        if (!L.fonts.length) return '';
        let y = 'font:\n';
        L.fonts.forEach(f => {
            const file = f.kind === 'gfonts' ? 'gfonts://' + String(f.family || 'Roboto').replace(/\s+/g, '+') : (f.file || 'fonts/' + f.id + '.ttf');
            y += `  - file: ${q(file)}\n    id: ${f.id}\n    size: ${f.size}\n    bpp: ${f.bpp || 4}\n`;
            if (f.glyphs) y += `    glyphs: ${q(f.glyphs)}\n`;
        });
        return y;
    };

    // ---- widget -> YAML node ---------------------------------------------------------
    // Tags survive JSON (localStorage / undo) as {tag, value}; turn them back into real Tag instances.
    L.revive = function r(v) {
        if (Array.isArray(v)) return v.map(r);
        if (v && typeof v === 'object') {
            if (v instanceof Tag) return v;
            const keys = Object.keys(v);
            if (keys.length === 2 && typeof v.tag === 'string' && v.tag[0] === '!' && 'value' in v) return new Tag(v.tag, v.value);
            const o = {}; keys.forEach(k => { o[k] = r(v[k]); }); return o;
        }
        return v;
    };
    const has = v => v !== undefined && v !== null;
    L.widgetNode = function (w) {
        const p = { id: w.id, x: w.x, y: w.y };
        const dim = (key, raw) => { if (has(w[key])) p[key] = (w._raw && w._raw[key] && w._raw[key].px === w[key]) ? w._raw[key].raw : w[key]; else if (raw) p[key] = raw; };
        dim('width'); dim('height');
        if (has(w.text) && w.text !== '') p.text = w.text;
        if (typeof w.value === 'boolean' || typeof w.value === 'number') p.value = w.value;
        if (has(w.min_value)) p.min_value = w.min_value;
        if (has(w.max_value)) p.max_value = w.max_value;
        if (has(w.url) && w.url !== '') p.url = w.url;
        if (w.type === 'line') {
            if (w.points && w.points.length) p.points = w.points.map(pt => ({ x: pt.x ?? 0, y: pt.y ?? 0 }));
            ['line_width', 'line_color', 'line_rounded', 'line_dash_width', 'line_dash_gap'].forEach(k => { if (has(w[k])) p[k] = w[k]; });
        }
        if (w.type === 'dropdown') {
            if (w.options && w.options.length) p.options = w.options.slice();
            if (has(w.selected_index)) p.selected_index = w.selected_index;
            if (has(w.dir) && w.dir !== 'BOTTOM') p.dir = w.dir;
            if (has(w.symbol) && w.symbol !== 'LV_SYMBOL_DOWN') p.symbol = w.symbol;
        }
        if (w.type === 'bar') {
            if (has(w.mode) && w.mode !== 'NORMAL') p.mode = w.mode;
            if (w.animated === false) p.animated = false;
            if (has(w.anim_time) && w.anim_time !== 500) p.anim_time = w.anim_time;
        }
        if (w.type === 'button') {
            if (w.checkable) { p.checkable = true; if (w.checked) p.checked = true; }
            if (w.align && w.align !== 'center') p.align = w.align;
        }
        if (w.text_font) p.text_font = w.text_font;
        if (w.extra && typeof w.extra === 'object') Object.keys(w.extra).forEach(k => { if (!(k in p) || (w._ex && w._ex.includes(k))) p[k] = L.revive(w.extra[k]); });
        return { [w.type]: p };
    };

    L.pageOf = w => (w.page && L.pages.some(p => p.id === w.page)) ? w.page : L.pages[0].id;
    L.lvglObject = function () {
        return {
            lvgl: {
                pages: L.pages.map(pg => ({ id: pg.id, widgets: widgetsOnCanvas.filter(w => L.pageOf(w) === pg.id).map(L.widgetNode) }))
            }
        };
    };
    L.lvglYaml = function () {
        let y = L.dump(L.lvglObject());
        if (!widgetsOnCanvas.length) y = y.replace(/widgets: \[\]/, 'widgets: []   # No widgets placed yet');
        return y;
    };
    L.fullYaml = function () {
        const f = L.fontYaml();
        return (f ? f + '\n' : '') + L.lvglYaml() + '\n# Add on_click / on_value handlers to widgets as needed.\n';
    };

    // ---- preview: apply text_font size/family to widgets ----------------------------
    L.applyFontPreview = function () {
        widgetsOnCanvas.forEach(w => {
            const el = w.element; if (!el) return;
            if (L.TEXT_WIDGETS.has(w.type)) {
                const id = w.text_font || L.DEFAULT_FONT;
                el.style.fontSize = L.fontSize(id) + 'px';
                el.style.fontFamily = /^montserrat|^dejavu/.test(id) || !L.fonts.some(f => f.id === id) ? "Montserrat, Inter, sans-serif" : "Roboto, Inter, sans-serif";
                el.style.lineHeight = '1.2';
            }
        });
    };

    // ---- override the legacy generator ----------------------------------------------
    window.updateCodeOutput = function updateCodeOutput() {
        try { modalCodeOutput.textContent = L.fullYaml(); L.applyFontPreview(); } catch (e) { console.error('YAML generation failed', e); modalCodeOutput.textContent = '# Could not generate YAML: ' + e.message; }
        if (typeof L.afterChange === 'function') L.afterChange();
    };

    // ---- text_font field in the properties panel ------------------------------------
    const origPanel = window.updatePropertiesPanel;
    window.updatePropertiesPanel = function () {
        origPanel.apply(this, arguments);
        try { injectFontField(); } catch (e) { console.error(e); }
    };
    function injectFontField() {
        if (!selectedWidget) return;
        const w = widgetsOnCanvas.find(x => x.id === selectedWidget.dataset.widgetId);
        if (!w || !L.TEXT_WIDGETS.has(w.type)) return;
        const host = propertiesFields; if (host.querySelector('[data-lvgl-font]')) return;
        const cur = w.text_font || '';
        const opts = ['<option value="">Default (montserrat_14)</option>']
            .concat(L.fonts.length ? [`<optgroup label="Your fonts">${L.fonts.map(f => `<option value="${f.id}"${f.id === cur ? ' selected' : ''}>${f.id} (${f.size}px)</option>`).join('')}</optgroup>`] : [])
            .concat([`<optgroup label="Built-in LVGL">${L.BUILTIN_FONTS.map(f => `<option value="${f}"${f === cur ? ' selected' : ''}>${f}</option>`).join('')}</optgroup>`]);
        if (cur && !L.isDefined(cur)) opts.push(`<option value="${cur}" selected>${cur} (not defined)</option>`);
        const box = document.createElement('div'); box.className = 'mb-2'; box.dataset.lvglFont = '1';
        box.innerHTML = `<label class="block text-xs font-medium text-gray-500 mb-1">Font (text_font)</label>
            <select class="widget-property-input w-full px-2 py-1 text-sm border border-gray-300 rounded shadow-sm">${opts.join('')}</select>
            <button type="button" class="lvgl-link-btn" data-open-fonts>Manage fonts&hellip;</button>`;
        host.appendChild(box);
        box.querySelector('select').addEventListener('change', e => {
            const v = e.target.value; if (v) w.text_font = v; else delete w.text_font;
            updateCodeOutput(); saveStateToLocalStorage();
        });
        box.querySelector('[data-open-fonts]').addEventListener('click', () => { if (L.openFonts) L.openFonts(); });
    }

    L.loadMeta();
})();
