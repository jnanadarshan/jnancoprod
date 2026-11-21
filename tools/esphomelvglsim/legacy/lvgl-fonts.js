// LVGL Designer: Font manager (Visual <-> Code toggle).
// LVGL ships built-in Montserrat sizes (no setup). Anything else is a custom ESPHome `font:` entry.
// Model lives in LVGL.fonts; widgets pick one through text_font.
(function () {
    'use strict';
    const L = window.LVGL;
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const LS = {
        get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
    };
    const KINDS = [
        { key: 'gfonts', label: 'Google Font (auto-download)' },
        { key: 'file', label: 'Local .ttf file' },
        { key: 'icons', label: 'Icon font (Material Symbols)' }
    ];
    const ICON_FILE = 'fonts/MaterialSymbols-Regular.ttf';
    const slug = s => String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'font';
    const validId = id => /^[A-Za-z_]\w*$/.test(id);
    let view = LS.get('lvglFontView', 'visual') === 'code' ? 'code' : 'visual';

    // ---- modal shell ------------------------------------------------------------------
    const modal = document.createElement('div');
    modal.id = 'fonts-modal'; modal.className = 'lvgl-modal';
    modal.innerHTML = `
        <div class="lvgl-dialog" role="dialog" aria-modal="true" aria-labelledby="fonts-title">
            <div class="lvgl-dialog-head">
                <h3 id="fonts-title"><i class="material-icons-outlined">font_download</i> Fonts</h3>
                <div class="fm-toggle" role="tablist" aria-label="Font editor view">
                    <button type="button" data-view="visual" role="tab"><i class="material-icons-outlined">view_agenda</i>Visual</button>
                    <button type="button" data-view="code" role="tab"><i class="material-icons-outlined">code</i>Code</button>
                </div>
                <button type="button" class="lvgl-x" data-close title="Close"><i class="material-icons-outlined">close</i></button>
            </div>
            <div class="lvgl-dialog-body">
                <div id="fm-visual"></div>
                <div id="fm-code" hidden>
                    <textarea id="fm-yaml" spellcheck="false" aria-label="ESPHome font block"></textarea>
                    <div class="fm-code-actions">
                        <button type="button" class="lvgl-btn" id="fm-apply"><i class="material-icons-outlined">check</i>Apply code</button>
                        <button type="button" class="lvgl-btn" id="fm-revert"><i class="material-icons-outlined">undo</i>Revert</button>
                        <span class="fm-msg" id="fm-msg" role="status"></span>
                    </div>
                    <p class="fm-hint">This is the ESPHome <code>font:</code> block. Edit it or paste your own, then press Apply. Built-in LVGL fonts never need an entry.</p>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('open')) close(); });

    // ---- helpers ------------------------------------------------------------------------
    const usage = () => { const u = {}; widgetsOnCanvas.forEach(w => { if (w.text_font) u[w.text_font] = (u[w.text_font] || 0) + 1; }); return u; };
    function autoId(f) { return (f.kind === 'gfonts' ? slug(f.family) : f.kind === 'icons' ? 'icons' : slug(String(f.file).split('/').pop())) + '_' + f.size; }
    function unique(want, self) { let id = want, n = 2; while (L.BUILTIN_FONTS.includes(id) || L.fonts.some(x => x !== self && x.id === id)) id = `${want}_${n++}`; return id; }
    function commit(renames) {
        if (renames) widgetsOnCanvas.forEach(w => { if (w.text_font && renames[w.text_font]) w.text_font = renames[w.text_font]; });
        L.saveMeta(); updateCodeOutput(); saveStateToLocalStorage();
        if (selectedWidget) updatePropertiesPanel();
        render();
    }

    // ---- visual view ---------------------------------------------------------------------
    function sample(f) {
        const px = Math.max(10, Math.min(f.size, 40));
        if (f.kind === 'icons') return `<span class="fm-sample" style="font-size:${px}px"><i class="material-icons-outlined" style="font-size:${px}px">home</i><i class="material-icons-outlined" style="font-size:${px}px">sunny</i><i class="material-icons-outlined" style="font-size:${px}px">wifi</i></span>`;
        return `<span class="fm-sample" style="font-size:${px}px;font-family:${f.kind === 'gfonts' ? 'Roboto' : 'Inter'},sans-serif">Aa Bb 0123 &deg;C</span>`;
    }
    function card(f, i, used) {
        const kinds = KINDS.map(k => `<option value="${k.key}"${k.key === f.kind ? ' selected' : ''}>${k.label}</option>`).join('');
        const src = f.kind === 'gfonts'
            ? `<label class="fm-f fm-wide">Google Fonts name<input type="text" data-f="family" value="${esc(f.family || '')}" placeholder="e.g. Roboto" spellcheck="false"></label>`
            : `<label class="fm-f fm-wide">File path (next to your YAML)<input type="text" data-f="file" value="${esc(f.file || '')}" placeholder="fonts/MyFont.ttf" spellcheck="false"></label>`;
        const n = used[f.id] || 0;
        return `<div class="fm-card" data-i="${i}">
            <div class="fm-card-top"><div class="fm-preview">${sample(f)}</div>
                <button type="button" class="fm-del" data-act="del" title="Remove font"><i class="material-icons-outlined">delete</i></button></div>
            <div class="fm-fields">
                <label class="fm-f fm-wide">Type<select data-f="kind">${kinds}</select></label>
                ${src}
                <label class="fm-f">Size (px)<input type="number" data-f="size" min="4" max="200" value="${f.size}"></label>
                <label class="fm-f">Bits / px<select data-f="bpp">${[1, 2, 4, 8].map(b => `<option${b === (f.bpp || 4) ? ' selected' : ''}>${b}</option>`).join('')}</select></label>
                <label class="fm-f fm-grow">ID (use as text_font)<input type="text" data-f="id" value="${esc(f.id)}" spellcheck="false" autocomplete="off"></label>
                <label class="fm-f fm-wide">${f.kind === 'icons' ? 'Icons to include (glyphs)' : 'Extra characters (optional glyphs)'}<input type="text" data-f="glyphs" value="${esc(f.glyphs || '')}" placeholder="${f.kind === 'icons' ? 'paste icon characters, e.g. \\uE88A' : 'only if you need symbols like ° or €'}" spellcheck="false"></label>
            </div>
            <div class="fm-meta"><span>${n ? `Used by ${n} widget${n === 1 ? '' : 's'}` : 'Not used yet'}</span></div>
            <div class="fm-err" role="alert"></div>
        </div>`;
    }
    function renderVisual() {
        const used = usage();
        const builtinUsed = Object.keys(used).filter(id => L.BUILTIN_FONTS.includes(id));
        $('fm-visual').innerHTML = `
            <details class="fm-builtin"><summary>Built-in LVGL fonts (no setup needed)</summary>
                <p>Pick these straight from a widget's <b>Font</b> field. ESPHome compiles them in:</p>
                <div class="fm-chips">${L.BUILTIN_FONTS.map(f => `<span class="${used[f] ? 'used' : ''}">${f}</span>`).join('')}</div>
                ${builtinUsed.length ? '' : ''}
            </details>
            ${L.fonts.length ? L.fonts.map((f, i) => card(f, i, used)).join('') : '<p class="fm-empty">No custom fonts yet. Add one if you need a different typeface, a size LVGL does not include, or icons.</p>'}
            <div class="fm-add">
                <button type="button" class="lvgl-btn" data-act="add-gfonts"><i class="material-icons-outlined">add</i>Add Google Font</button>
                <button type="button" class="lvgl-btn" data-act="add-icons"><i class="material-icons-outlined">add_reaction</i>Add icon font</button>
                <button type="button" class="lvgl-btn" data-act="add-file"><i class="material-icons-outlined">upload_file</i>Add .ttf file</button>
            </div>`;
    }
    $('fm-visual').addEventListener('change', e => {
        const t = e.target, c = t.closest('.fm-card'); if (!c || !t.dataset.f) return;
        const i = +c.dataset.i, f = L.fonts[i], key = t.dataset.f, oldId = f.id, wasAuto = f.id === autoId(f), err = c.querySelector('.fm-err');
        err.textContent = '';
        const fail = m => { err.textContent = m; if (key === 'id') t.value = oldId; };
        if (key === 'id') {
            const v = t.value.trim();
            if (!validId(v)) return fail('Use letters, digits and underscores; do not start with a digit.');
            if (L.BUILTIN_FONTS.includes(v) || L.fonts.some(x => x !== f && x.id === v)) return fail('That ID is already taken.');
            f.id = v;
        } else if (key === 'size') {
            const v = parseInt(t.value, 10); if (!(v >= 4 && v <= 200)) return fail('Size must be between 4 and 200.'); f.size = v;
        } else if (key === 'bpp') f.bpp = parseInt(t.value, 10);
        else if (key === 'kind') { f.kind = t.value; if (f.kind === 'icons') f.file = ICON_FILE; else if (f.kind === 'file' && (!f.file || f.file === ICON_FILE)) f.file = 'fonts/MyFont.ttf'; if (f.kind === 'gfonts' && !f.family) f.family = 'Roboto'; }
        else if (key === 'family') { if (!t.value.trim()) return fail('Enter a font name.'); f.family = t.value.trim(); }
        else if (key === 'file') { if (!t.value.trim()) return fail('Enter a file path.'); f.file = t.value.trim(); }
        else if (key === 'glyphs') f.glyphs = t.value;
        const renames = {};
        if (key !== 'id' && key !== 'glyphs' && key !== 'bpp' && wasAuto) { const nid = unique(autoId(f), f); if (nid !== oldId) { f.id = nid; renames[oldId] = nid; } }
        else if (key === 'id' && f.id !== oldId) renames[oldId] = f.id;
        commit(renames);
    });
    $('fm-visual').addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act;
        if (act.startsWith('add-')) {
            const kind = act.slice(4), f = { kind, size: kind === 'icons' ? 32 : 20, bpp: 4, family: 'Roboto', file: kind === 'icons' ? ICON_FILE : 'fonts/MyFont.ttf', glyphs: '' };
            f.id = unique(autoId(f), null); L.fonts.push(f); commit();
        } else if (act === 'del') {
            const i = +b.closest('.fm-card').dataset.i, f = L.fonts[i], n = usage()[f.id] || 0;
            if (n && !confirm(`"${f.id}" is used by ${n} widget${n === 1 ? '' : 's'}. They will keep pointing at it until you pick another font. Remove it anyway?`)) return;
            L.fonts.splice(i, 1); commit();
        }
    });
    $('fm-visual').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });

    // ---- code view -------------------------------------------------------------------------
    function setMsg(t, bad) { const m = $('fm-msg'); m.textContent = t; m.classList.toggle('bad', !!bad); }
    function fillCode() { $('fm-yaml').value = L.fontYaml() || '# No custom fonts. Built-in LVGL fonts (montserrat_14 ...) need no entry.\nfont: []\n'; setMsg(''); }
    // shared with the YAML importer
    L.parseFontList = function (list) {
        return (Array.isArray(list) ? list : []).map(it => {
            if (!it || typeof it !== 'object' || !it.id) return null;
            let file = it.file, family = '', kind = 'file';
            if (file && typeof file === 'object') { if (file.type === 'gfonts' || file.family) { kind = 'gfonts'; family = file.family; } else file = file.path || ''; }
            else if (typeof file === 'string' && /^gfonts:\/\//.test(file)) { kind = 'gfonts'; family = decodeURIComponent(file.replace(/^gfonts:\/\//, '').replace(/@.*$/, '').replace(/\+/g, ' ')); }
            if (kind === 'file' && /symbol|icon|mdi/i.test(String(file) + it.id)) kind = 'icons';
            return { id: String(it.id), kind, family: family || 'Roboto', file: kind === 'gfonts' ? '' : String(file || ''), size: parseInt(it.size, 10) || 20, bpp: parseInt(it.bpp, 10) || 4, glyphs: Array.isArray(it.glyphs) ? it.glyphs.join('') : (it.glyphs ? String(it.glyphs) : '') };
        }).filter(Boolean);
    };
    $('fm-apply').addEventListener('click', () => {
        let doc; try { doc = jsyaml.load($('fm-yaml').value, { schema: L.schema }); } catch (e) { setMsg('YAML error: ' + e.message.split('\n')[0], true); return; }
        const list = Array.isArray(doc) ? doc : (doc && doc.font);
        const fonts = L.parseFontList(list);
        if (!fonts.length && !(Array.isArray(list) && !list.length)) { setMsg('No fonts found. Each entry needs "id:" and "file:".', true); return; }
        const seen = new Set(); const dup = fonts.find(f => (seen.has(f.id) ? true : (seen.add(f.id), false)));
        if (dup) { setMsg(`ID "${dup.id}" appears twice.`, true); return; }
        const bad = fonts.find(f => !validId(f.id)); if (bad) { setMsg(`"${bad.id}" is not a valid ID.`, true); return; }
        L.fonts = fonts; commit(); fillCode(); setMsg(`Applied ${fonts.length} font${fonts.length === 1 ? '' : 's'}.`);
    });
    $('fm-revert').addEventListener('click', fillCode);

    // ---- toggle / open -------------------------------------------------------------------------
    function setView(v) {
        view = v; LS.set('lvglFontView', v);
        modal.querySelectorAll('.fm-toggle button').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        $('fm-visual').hidden = v !== 'visual'; $('fm-code').hidden = v !== 'code';
        if (v === 'code') fillCode(); else renderVisual();
    }
    function render() { if (view === 'code') fillCode(); else renderVisual(); }
    modal.querySelectorAll('.fm-toggle button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    L.openFonts = function () { setView(view); modal.classList.add('open'); };
    $('fonts-button').addEventListener('click', L.openFonts);
    setView(view);
})();
