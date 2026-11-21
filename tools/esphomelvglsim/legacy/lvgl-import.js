// LVGL Designer: YAML import v2.
// Reads a whole ESPHome file (or just an lvgl: block / widget list), keeps ESPHome tags (!lambda, !secret),
// all pages, nested widgets (flattened), alignment and % sizes, and the font: block. Shows a preview with
// per-widget include checkboxes before anything is changed. Undo is available afterwards.
// Globals from index.html: widgetsOnCanvas, canvas, selectedWidget, nextWidgetId, addWidgetToCanvas, updateZIndices,
// updateElementsList, updateCodeOutput, saveStateToLocalStorage, screenResolutionSelect, updateCanvasSize.
(function () {
    'use strict';
    const L = window.LVGL;
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ALIAS = { btn: 'button', obj: 'container', btnmatrix: 'buttonmatrix', textarea: 'textarea', list: 'list', menu: 'list' };
    const SUPPORTED = new Set([...document.querySelectorAll('#toolbox .widget-item')].map(e => e.dataset.widgetType));
    const KNOWN = new Set(['id', 'x', 'y', 'width', 'height', 'text', 'value', 'min_value', 'max_value', 'url', 'options', 'selected_index', 'dir', 'symbol', 'mode', 'animated', 'anim_time', 'checkable', 'text_font', 'widgets', 'align', 'points', 'line_width', 'line_color', 'line_rounded', 'line_dash_width', 'line_dash_gap']);
    const KNOWN_SIZES = { ILI9341: [240, 320], ILI9342: [320, 240], ILI9486: [320, 480], ILI9488: [320, 480], ST7789V: [240, 320], ST7735: [128, 160] };

    const EXAMPLE = `# Example: a two-page thermostat
font:
  - file: "gfonts://Roboto"
    id: big_font
    size: 40

display:
  - platform: ili9xxx
    model: ILI9341

lvgl:
  pages:
    - id: home
      widgets:
        - label:
            id: temp_label
            align: CENTER
            y: -20
            text: "21.5 °C"
            text_font: big_font
        - button:
            id: next_btn
            align: BOTTOM_MID
            y: -10
            width: 120
            height: 40
            on_click:
              then:
                - lvgl.page.next:
            widgets:
              - label:
                  text: "Settings"
                  align: CENTER
    - id: settings
      widgets:
        - slider:
            id: target_slider
            x: 20
            y: 100
            width: 200
            min_value: 10
            max_value: 30
            value: 21
            bg_color: !secret slider_color
`;

    // ---------------------------------------------------------------- analysis
    const ALIGN = {
        TOP_LEFT: [0, 0], TOP_MID: [.5, 0], TOP_RIGHT: [1, 0], LEFT_MID: [0, .5], CENTER: [.5, .5], RIGHT_MID: [1, .5],
        BOTTOM_LEFT: [0, 1], BOTTOM_MID: [.5, 1], BOTTOM_RIGHT: [1, 1]
    };
    const isTag = v => v instanceof L.Tag;

    function detectDisplay(doc) {
        let d = doc && doc.display; if (Array.isArray(d)) d = d[0]; if (!d || typeof d !== 'object') return null;
        let w = 0, h = 0;
        const dim = d.dimensions || d;
        if (Number.isFinite(+dim.width) && Number.isFinite(+dim.height) && +dim.width > 0) { w = +dim.width; h = +dim.height; }
        if (!w && typeof d.model === 'string') {
            const m = d.model.match(/(\d{2,4})x(\d{2,4})/i); if (m) { w = +m[1]; h = +m[2]; }
            else { const k = Object.keys(KNOWN_SIZES).find(x => d.model.toUpperCase().replace(/[\s_-]/g, '').startsWith(x)); if (k) [w, h] = KNOWN_SIZES[k]; }
        }
        if (w && [90, 270].includes(+d.rotation)) [w, h] = [h, w];
        return w ? { w, h, platform: d.platform } : null;
    }

    function analyse(text, opt) {
        opt = opt || {};
        const res = { ok: false, warnings: [], pages: [], widgets: [], fonts: [], notes: [] };
        let doc;
        try { doc = jsyaml.load(text, { schema: L.schema }); }
        catch (e) { res.error = `YAML syntax error${e.mark ? ` (line ${e.mark.line + 1})` : ''}: ${e.reason || e.message}`; return res; }
        if (doc == null || typeof doc !== 'object') { res.error = 'This does not look like YAML for ESPHome.'; return res; }

        let lv = Array.isArray(doc) ? doc : (doc.lvgl !== undefined ? doc.lvgl : doc);
        if (Array.isArray(lv) && doc.lvgl !== undefined) { res.warnings.push('The file has several <code>lvgl:</code> entries. Only the first one is imported.'); lv = lv[0]; }
        let pages = [];
        if (Array.isArray(lv)) pages = [{ id: 'main_page', widgets: lv }];
        else if (lv && Array.isArray(lv.pages)) pages = lv.pages.map((p, i) => ({ id: String((p && p.id) || `page_${i + 1}`), widgets: (p && p.widgets) || [] }));
        else if (lv && Array.isArray(lv.widgets)) pages = [{ id: 'main_page', widgets: lv.widgets }];
        if (!pages.length) { res.error = 'No <code>lvgl:</code> pages or widgets were found. Expected <code>lvgl: pages: - widgets: ...</code>.'; return res; }
        // unique page ids
        const seenP = new Set(); pages.forEach(p => { let id = p.id.replace(/[^a-zA-Z0-9_]/g, '_'), n = 2, base = id; while (seenP.has(id)) id = `${base}_${n++}`; seenP.add(id); p.id = id; });
        res.pages = pages.map(p => p.id);

        const disp = detectDisplay(doc);
        const cur = (/^\d+x\d+$/.test(screenResolutionSelect.value) ? screenResolutionSelect.value : '128x160').split('x').map(Number);
        res.sizeKnown = !!disp || !!opt.W;
        res.W = opt.W || (disp && disp.w) || cur[0]; res.H = opt.H || (disp && disp.h) || cur[1];
        res.fonts = L.parseFontList(doc.font);

        const usedIds = new Set(), counters = {}; const W = res.W, H = res.H;
        const warn = w => { if (!res.warnings.includes(w)) res.warnings.push(w); };
        let nested = 0, kept = 0; const keptKeys = new Set(), skipped = new Set(), converted = new Set(), pct = new Set();

        const fontPx = w => L.fontSize(w.text_font || L.DEFAULT_FONT);
        const num = (v, parent, axis) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') {
                if (/^-?\d+$/.test(v.trim())) return parseInt(v, 10);
                const m = v.trim().match(/^(-?\d+(?:\.\d+)?)%$/); if (m) { pct.add(v.trim()); return Math.round(parseFloat(m[1]) / 100 * (axis === 'x' ? parent.w : parent.h)); }
            }
            return null;
        };
        function convert(node, page, parent) {
            if (!node || typeof node !== 'object' || Array.isArray(node)) return;
            const rawType = Object.keys(node)[0]; if (!rawType) return;
            const props = (node[rawType] && typeof node[rawType] === 'object') ? node[rawType] : {};
            const type = ALIAS[rawType] || rawType;
            if (!SUPPORTED.has(type)) { skipped.add(rawType); return; }
            if (ALIAS[rawType] && rawType !== type) converted.add(`${rawType} → ${type}`);
            const w = { type, page, extra: {}, _ex: [], _raw: {} };
            Object.keys(props).forEach(k => {
                const v = props[k];
                if (k === 'widgets' || k === 'align' || k === 'x' || k === 'y' || k === 'width' || k === 'height') return;
                if (!KNOWN.has(k)) { w.extra[k] = v; kept++; keptKeys.add(k); return; }
                if (isTag(v)) { w.extra[k] = v; w._ex.push(k); if (k === 'text') w.text = '…'; kept++; keptKeys.add(k); return; }
                w[k] = v;
            });
            // the designer adds placeholder text ('Button', 'Label Text'); an imported widget without text must stay empty
            if (w.text === undefined && ['label', 'button', 'checkbox', 'msgbox', 'textarea'].includes(type)) w.text = '';
            if (w.options && !Array.isArray(w.options)) w.options = String(w.options).split('\n');
            if (Array.isArray(w.options)) w.options = w.options.map(String);
            // id
            let id = props.id ? String(props.id).replace(/[^a-zA-Z0-9_]/g, '_') : '';
            if (!id) { counters[type] = (counters[type] || 0); do { id = `${type}_${counters[type]++}`; } while (usedIds.has(id)); }
            if (usedIds.has(id)) { let n = 2; while (usedIds.has(`${id}_${n}`)) n++; warn(`Duplicate ID <code>${esc(id)}</code> was renamed.`); id = `${id}_${n}`; }
            usedIds.add(id); w.id = id;
            // size
            const sizeOf = (key, axis) => {
                const v = props[key];
                if (v === undefined) return undefined;
                if (typeof v === 'string' && /^SIZE_CONTENT$/i.test(v)) { w.extra[key] = v; return undefined; }
                if (isTag(v)) { w.extra[key] = v; w._ex.push(key); return undefined; }
                const n = num(v, parent, axis);
                if (n === null) { warn(`<code>${esc(id)}</code>: ${key} <code>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</code> is not understood; the default size is used.`); return undefined; }
                if (typeof v === 'string' && v.includes('%')) w._raw[key] = { raw: v, px: n };
                return n;
            };
            const ww = sizeOf('width', 'x'), hh = sizeOf('height', 'y');
            if (ww !== undefined) w.width = ww;
            if (hh !== undefined) w.height = hh;
            // geometry (alignment -> absolute)
            const ox = props.x === undefined ? 0 : num(props.x, parent, 'x'), oy = props.y === undefined ? 0 : num(props.y, parent, 'y');
            if ((props.x !== undefined && ox === null) || (props.y !== undefined && oy === null)) warn(`<code>${esc(id)}</code>: x/y is not a plain number and was set to 0.`);
            const estW = w.width !== undefined ? w.width : (type === 'label' ? Math.round(String(w.text || 'Label').length * fontPx(w) * 0.6) : 100);
            const estH = w.height !== undefined ? w.height : (type === 'label' ? Math.round(fontPx(w) * 1.25) : 30);
            let bx = 0, by = 0;
            const al = props.align !== undefined ? String(props.align).toUpperCase() : '';
            if (al) {
                const a = ALIGN[al];
                if (a) { bx = a[0] * (parent.w - estW); by = a[1] * (parent.h - estH); converted.add(`align ${al} → fixed x,y`); }
                else { warn(`<code>${esc(id)}</code>: alignment <code>${esc(al)}</code> is not supported and was ignored.`); }
            }
            w.x = Math.round(parent.x + bx + (ox || 0)); w.y = Math.round(parent.y + by + (oy || 0));
            Object.keys(w).forEach(k => { if (w[k] === undefined) delete w[k]; });
            if (!w._ex.length) delete w._ex; if (!Object.keys(w._raw).length) delete w._raw; if (!Object.keys(w.extra).length) delete w.extra;
            res.widgets.push(w);
            if (Array.isArray(props.widgets)) {
                const box = { x: w.x, y: w.y, w: w.width !== undefined ? w.width : estW, h: w.height !== undefined ? w.height : estH };
                props.widgets.forEach(c => { nested++; convert(c, page, box); });
            }
        }
        pages.forEach(p => (Array.isArray(p.widgets) ? p.widgets : []).forEach(n => convert(n, p.id, { x: 0, y: 0, w: W, h: H })));

        if (nested) warn(`${nested} nested widget${nested === 1 ? ' was' : 's were'} flattened to absolute positions (the designer has no parent/child nesting).`);
        if (converted.size) res.notes.push('Converted: ' + [...converted].map(c => `<code>${esc(c)}</code>`).join(', '));
        if (pct.size) res.notes.push('Percent sizes are shown in pixels and written back as percentages while you leave them unchanged.');
        if (kept) res.notes.push(`${kept} other setting${kept === 1 ? '' : 's'} (${[...keptKeys].slice(0, 8).map(k => '<code>' + esc(k) + '</code>').join(', ')}${keptKeys.size > 8 ? ', …' : ''}) are kept and written back on export, but not drawn.`);
        if (skipped.size) warn(`Unsupported widget type${skipped.size === 1 ? '' : 's'} skipped: <code>${[...skipped].map(esc).join('</code>, <code>')}</code>.`);
        const noSize = res.widgets.filter(w => w.type !== 'label' && (w.width === undefined && !(w.extra && w.extra.width) || w.height === undefined && !(w.extra && w.extra.height))).length;
        if (noSize) res.notes.push(`${noSize} widget${noSize === 1 ? ' has' : 's have'} no width or height in the file, so the designer's default size is used.`);
        const usedFonts = new Set(res.widgets.map(w => w.text_font).filter(Boolean));
        usedFonts.forEach(f => { if (!L.BUILTIN_FONTS.includes(f) && !res.fonts.some(x => x.id === f)) warn(`Font <code>${esc(f)}</code> is used but not defined in this file (it may live in another file).`); });
        res.ok = res.widgets.length > 0;
        if (!res.ok) res.error = 'No supported widgets were found in this YAML.';
        return res;
    }

    // ---------------------------------------------------------------- UI
    const modal = document.createElement('div');
    modal.id = 'import2-modal'; modal.className = 'lvgl-modal';
    modal.innerHTML = `
        <div class="lvgl-dialog lvgl-wide" role="dialog" aria-modal="true" aria-labelledby="imp-title">
            <div class="lvgl-dialog-head"><h3 id="imp-title"><i class="material-icons-outlined">file_upload</i> Import ESPHome YAML</h3>
                <button type="button" class="lvgl-x" data-close title="Close"><i class="material-icons-outlined">close</i></button></div>
            <div class="lvgl-dialog-body">
                <p class="lvgl-lead">Paste your config (the whole file, or just the <code>lvgl:</code> block) or choose a file. It is read, previewed here, and only then loaded into the designer.</p>
                <textarea id="imp-text" class="imp-text" spellcheck="false" placeholder="Paste YAML here..."></textarea>
                <div class="imp-actions">
                    <button type="button" class="lvgl-btn" id="imp-choose"><i class="material-icons-outlined">upload_file</i>Choose file</button>
                    <button type="button" class="lvgl-btn" id="imp-example"><i class="material-icons-outlined">auto_awesome</i>Try an example</button>
                    <input type="file" id="imp-file" accept=".yaml,.yml,.txt,text/plain" hidden>
                </div>
                <div id="imp-result"></div>
            </div>
            <div class="lvgl-dialog-foot"><span class="lvgl-foot-note">Importing replaces your current design. You can undo right after.</span>
                <button type="button" class="lvgl-btn" data-close>Cancel</button>
                <button type="button" class="lvgl-btn primary" id="imp-apply" disabled><i class="material-icons-outlined">download_done</i>Import into designer</button></div>
        </div>`;
    document.body.appendChild(modal);
    let state = null, excluded = new Set(), opts = {}, previewPage = null;
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });

    const included = () => state.widgets.filter((_, i) => !excluded.has(i));
    function miniPreview() {
        const W = state.W, H = state.H, s = Math.min(3, Math.max(0.4, 340 / Math.max(W, H)));
        const page = previewPage && state.pages.includes(previewPage) ? previewPage : state.pages[0];
        const items = state.widgets.map((w, i) => ({ w, i })).filter(o => o.w.page === page && !excluded.has(o.i));
        const defs = { button: [70, 30], slider: [150, 20], bar: [150, 20], switch: [50, 25], arc: [100, 100], dropdown: [150, 30], checkbox: [120, 24] };
        return `<div class="imp-screen" style="width:${Math.round(W * s)}px;height:${Math.round(H * s)}px">` + items.map(({ w }) => {
            const d = defs[w.type] || [100, 30], fs = L.fontSize(w.text_font || L.DEFAULT_FONT);
            const wd = w.width !== undefined ? w.width : (w.type === 'label' ? Math.round(String(w.text || '').length * fs * .6) : d[0]);
            const ht = w.height !== undefined ? w.height : (w.type === 'label' ? Math.round(fs * 1.25) : d[1]);
            const label = w.text !== undefined ? esc(w.text) : '';
            return `<div class="imp-w imp-${w.type}" title="${esc(w.id)}" style="left:${w.x * s}px;top:${w.y * s}px;width:${Math.max(4, wd * s)}px;height:${Math.max(4, ht * s)}px;font-size:${Math.max(6, fs * s)}px">${label || `<i class="material-icons-outlined">${({ slider: 'tune', switch: 'toggle_on', arc: 'donut_large', bar: 'linear_scale', image: 'image', chart: 'show_chart' })[w.type] || ''}</i>`}</div>`;
        }).join('') + '</div>';
    }
    function render() {
        const box = $('imp-result');
        if (!state) { box.innerHTML = ''; $('imp-apply').disabled = true; return; }
        if (state.error) { box.innerHTML = `<div class="lvgl-callout warn"><i class="material-icons-outlined">error</i><div>${state.error}</div></div>`; $('imp-apply').disabled = true; return; }
        const pageSel = state.pages.length > 1 ? `<label class="imp-f">Preview page <select id="imp-page">${state.pages.map(p => `<option${p === (previewPage || state.pages[0]) ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>` : '';
        const rows = state.widgets.map((w, i) => `<tr class="${excluded.has(i) ? 'off' : ''}"><td><input type="checkbox" data-i="${i}" ${excluded.has(i) ? '' : 'checked'} aria-label="Include ${esc(w.id)}"></td><td>${esc(w.page)}</td><td>${w.type}</td><td><code>${esc(w.id)}</code></td><td>${w.x},${w.y}</td><td>${w.width !== undefined ? w.width : '–'}×${w.height !== undefined ? w.height : '–'}</td></tr>`).join('');
        box.innerHTML = `
            <div class="imp-grid">
                <div class="imp-prev">${miniPreview()}
                    <div class="imp-chips"><span class="chip">${state.pages.length} page${state.pages.length === 1 ? '' : 's'}</span><span class="chip">${included().length}/${state.widgets.length} widgets</span><span class="chip">${state.fonts.length} font${state.fonts.length === 1 ? '' : 's'}</span></div></div>
                <div class="imp-side">
                    <div class="imp-fields">
                        <label class="imp-f">Width<input type="number" id="imp-w" min="1" value="${state.W}"></label>
                        <label class="imp-f">Height<input type="number" id="imp-h" min="1" value="${state.H}"></label>
                        ${pageSel}
                    </div>
                    ${state.sizeKnown ? '' : '<p class="imp-hint"><i class="material-icons-outlined">info</i>The screen size could not be read from the file. Check width and height.</p>'}
                    <label class="imp-chk"><input type="checkbox" id="imp-setsize" checked> Set the canvas to ${state.W}×${state.H}</label>
                    ${state.fonts.length ? `<label class="imp-chk"><input type="checkbox" id="imp-fonts" checked> Import ${state.fonts.length} custom font${state.fonts.length === 1 ? '' : 's'} from <code>font:</code></label>` : ''}
                    <div class="imp-table"><table><thead><tr><th></th><th>Page</th><th>Type</th><th>ID</th><th>x,y</th><th>Size</th></tr></thead><tbody>${rows}</tbody></table></div>
                </div>
            </div>
            ${(state.warnings.length || state.notes.length) ? `<details class="imp-notes" open><summary>${state.warnings.length + state.notes.length} note${state.warnings.length + state.notes.length === 1 ? '' : 's'} about this import</summary><ul>${state.warnings.map(w => '<li class="warn">' + w + '</li>').join('')}${state.notes.map(n => '<li>' + n + '</li>').join('')}</ul></details>` : ''}`;
        $('imp-apply').disabled = !included().length;
        box.querySelectorAll('tbody input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
            const i = +cb.dataset.i; cb.checked ? excluded.delete(i) : excluded.add(i);
            const keep = $('imp-result').scrollTop; render(); $('imp-result').scrollTop = keep;
        }));
        const re = () => { opts.W = Math.max(1, +$('imp-w').value || state.W); opts.H = Math.max(1, +$('imp-h').value || state.H); run(true); };
        $('imp-w').addEventListener('change', re); $('imp-h').addEventListener('change', re);
        const ps = $('imp-page'); if (ps) ps.addEventListener('change', () => { previewPage = ps.value; render(); });
    }
    function run(keep) {
        const text = $('imp-text').value;
        if (!text.trim()) { state = null; render(); return; }
        const prev = keep ? new Set(excluded) : new Set();
        try { state = analyse(text, opts); } catch (e) { console.error(e); state = { error: 'Could not read this text: ' + esc(e.message) }; }
        excluded = state.ok ? new Set([...prev].filter(i => i < state.widgets.length)) : new Set();
        render();
    }

    function apply() {
        if (!state || !state.ok) return;
        const list = included(), setSize = $('imp-setsize') && $('imp-setsize').checked, withFonts = $('imp-fonts') && $('imp-fonts').checked;
        L.pushHistory();
        // clear
        widgetsOnCanvas = []; canvas.innerHTML = ''; selectedWidget = null;
        L.pages = state.pages.map(id => ({ id })); L.current = L.pages[0].id;
        if (withFonts) L.fonts = state.fonts.map(f => ({ ...f }));
        if (setSize) {
            const v = `${state.W}x${state.H}`;
            if (!screenResolutionSelect.querySelector(`option[value="${v}"]`)) {
                screenResolutionSelect.querySelectorAll('option[data-is-custom-display="true"]').forEach(o => o.remove());
                const o = document.createElement('option'); o.value = v; o.textContent = v + '*'; o.dataset.isCustomDisplay = 'true';
                screenResolutionSelect.insertBefore(o, screenResolutionSelect.querySelector('option[value="custom"]'));
            }
            screenResolutionSelect.value = v; updateCanvasSize(v);
        }
        let maxN = -1;
        list.forEach(w => {
            const data = JSON.parse(JSON.stringify(w, (k, v) => v)); // plain copy
            if (w.extra) data.extra = w.extra; // keep Tag instances
            addWidgetToCanvas(w.id, w.type, w.x, w.y, data);
            const n = parseInt(String(w.id).split('_').pop(), 10); if (!isNaN(n)) maxN = Math.max(maxN, n);
        });
        nextWidgetId = Math.max(nextWidgetId || 0, maxN + 1);
        updateZIndices(); updateElementsList(); L.renderPageTabs(); L.applyPageVisibility(); updatePropertiesPanel();
        updateCodeOutput(); saveStateToLocalStorage(); L.saveMeta();
        close();
        L.toast(`Imported ${list.length} widget${list.length === 1 ? '' : 's'} on ${state.pages.length} page${state.pages.length === 1 ? '' : 's'}.`, 'Undo', () => L.undo());
    }

    $('imp-text').addEventListener('input', (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { opts = {}; previewPage = null; run(); }, 250); }; })());
    $('imp-choose').addEventListener('click', () => $('imp-file').click());
    $('imp-file').addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return; const r = new FileReader();
        r.onload = () => { $('imp-text').value = String(r.result); opts = {}; previewPage = null; run(); };
        r.readAsText(f); e.target.value = '';
    });
    $('imp-example').addEventListener('click', () => { $('imp-text').value = EXAMPLE; opts = {}; previewPage = null; run(); });
    $('imp-apply').addEventListener('click', apply);
    // replace the legacy import dialog
    $('import-yaml-button').addEventListener('click', e => { e.stopImmediatePropagation(); modal.classList.add('open'); $('imp-text').focus(); }, true);
    L.analyseLvglYaml = analyse;
})();
