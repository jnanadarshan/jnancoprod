// Visual font manager for the Configuration panel, with a Visual <-> Code (ESPHome font: block) toggle.
// Source of truth stays the hidden #configCustomFonts textarea (font IDs) plus the fontOverrides map
// (file / size / icon / bold per ID), so every existing feature keeps working.
// Globals used from index.html: elements, fontOverrides, getAvailableFonts, getFontSpecs, generateFontYaml,
// generatedFontCodeOutput, fontCodeSectionDetails, drawPreview, renderElementList, updateEditorForm, applyImportedData.
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const ta = $('configCustomFonts');
    if (!ta || !$('fmVisual')) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const LS = {
        get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
    };

    const CATALOG = [
        { key: 'roboto', label: 'Roboto', file: 'fonts/Roboto-Regular.ttf', slug: 'roboto' },
        { key: 'roboto_bold', label: 'Roboto Bold', file: 'fonts/Roboto-Bold.ttf', slug: 'roboto_bold', bold: true },
        { key: 'open_sans', label: 'Open Sans', file: 'fonts/OpenSans-Regular.ttf', slug: 'open_sans' },
        { key: 'open_sans_bold', label: 'Open Sans Bold', file: 'fonts/OpenSans-Bold.ttf', slug: 'open_sans_bold', bold: true },
        { key: 'symbols', label: 'Material Symbols (icons)', file: 'fonts/MaterialSymbols-Regular.ttf', slug: 'material_symbols', icon: true },
        { key: 'google', label: 'Google Font (auto-download)', file: 'gfonts://Roboto', slug: '' },
        { key: 'custom', label: 'Custom .ttf file', file: 'fonts/MyFont.ttf', slug: '' }
    ];
    const byKey = k => CATALOG.find(c => c.key === k);
    const slug = s => String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'font';
    const bareId = id => String(id || '').trim().replace(/^id\(\s*|\s*\)$/g, '');
    const validId = id => /^[A-Za-z_]\w*$/.test(id);

    function kindOf(file) {
        const c = CATALOG.find(x => x.file === file && x.key !== 'google' && x.key !== 'custom');
        if (c) return c.key;
        return /^gfonts:\/\//.test(file) ? 'google' : 'custom';
    }
    const familyOf = file => decodeURIComponent(String(file).replace(/^gfonts:\/\//, '').replace(/@.*$/, '').replace(/\+/g, ' '));
    function autoId(e) {
        const base = e.kind === 'google' ? slug(familyOf(e.file)) : e.kind === 'custom' ? slug(e.file.split('/').pop()) : byKey(e.kind).slug;
        return `${base}_${e.size}`;
    }
    function uniqueId(want, entries, self) {
        let id = want, n = 2;
        while (entries.some(x => x !== self && x.id === id)) id = `${want}_${n++}`;
        return id;
    }

    // ---- model <-> app state -------------------------------------------------------------
    function readEntries() {
        return getFontSpecs().map(s => {
            const ov = fontOverrides[s.id] || {};
            const kind = kindOf(s.file);
            return { id: s.id, size: s.size, file: s.file, icon: !!s.icon, bold: ov.bold !== undefined ? !!ov.bold : /bold/i.test(s.id + ' ' + s.file), bpp: ov.bpp || 1, kind };
        });
    }
    function usage() {
        const u = {};
        elements.forEach(el => { const id = bareId(el.fontId); if (id) u[id] = (u[id] || 0) + 1; });
        return u;
    }
    function commit(entries, renames) {
        if (renames) elements.forEach(el => { const id = bareId(el.fontId); if (renames[id]) el.fontId = `id(${renames[id]})`; });
        const ov = {};
        entries.forEach(e => { ov[e.id] = { file: e.file, size: e.size, icon: e.icon, bold: e.bold, bpp: e.bpp || 1 }; });
        fontOverrides = ov;
        ta.value = entries.map(e => `id(${e.id})`).join(', ');
        ta.dispatchEvent(new Event('input', { bubbles: true })); // refreshes dropdowns + saves cache
        try { drawPreview(); renderElementList(); updateEditorForm(); } catch (err) { /* UI not ready */ }
        render();
    }

    // ---- visual view ---------------------------------------------------------------------
    function sample(e) {
        const px = Math.max(8, Math.min(e.size, 36));
        if (e.icon) return `<span class="fm-sample fm-sample-icons" style="font-size:${px}px"><span class="material-symbols-outlined" style="font-size:${px}px">home</span><span class="material-symbols-outlined" style="font-size:${px}px">sunny</span><span class="material-symbols-outlined" style="font-size:${px}px">wifi</span></span>`;
        return `<span class="fm-sample" style="font-size:${px}px;font-weight:${e.bold ? 700 : 400}">Aa Bb 0123 &deg;C</span>`;
    }
    function card(e, i, used) {
        const opts = CATALOG.map(c => `<option value="${c.key}"${c.key === e.kind ? ' selected' : ''}>${esc(c.label)}</option>`).join('');
        let extra = '';
        if (e.kind === 'google') extra = `<label class="fm-f fm-wide">Google Fonts name<input type="text" data-f="family" value="${esc(familyOf(e.file))}" placeholder="e.g. Inconsolata" spellcheck="false"></label>`;
        if (e.kind === 'custom') extra = `<label class="fm-f fm-wide">File path (next to your YAML)<input type="text" data-f="file" value="${esc(e.file)}" placeholder="fonts/MyFont.ttf" spellcheck="false"></label>`;
        const n = used[e.id] || 0;
        return `<div class="fm-card" data-i="${i}">
            <div class="fm-card-top"><div class="fm-preview" title="Shown at its real pixel size (max 36px). Preview is approximate.">${sample(e)}</div>
                <button type="button" class="fm-del" data-act="del" title="Remove font"><span class="material-symbols-outlined">delete</span></button></div>
            <div class="fm-fields">
                <label class="fm-f fm-wide">Font<select data-f="kind">${opts}</select></label>
                ${extra}
                <label class="fm-f">Size (px)<input type="number" data-f="size" min="4" max="200" value="${e.size}"></label>
                <label class="fm-f fm-grow">ID in your YAML<input type="text" data-f="id" value="${esc(e.id)}" spellcheck="false" autocomplete="off"></label>
                ${e.icon ? '' : `<label class="fm-f" title="Bits per pixel: 1 = jagged (default), 4 = smooth anti-aliasing. Changes flash size and the preview.">Bits / px<select data-f="bpp">${[1, 2, 4, 8].map(b => `<option${b === (e.bpp || 1) ? ' selected' : ''}>${b}</option>`).join('')}</select></label>`}
                ${e.icon ? '' : `<div class="fm-f fm-wide"><button type="button" class="dd-btn-sm" data-act="ttf" title="The preview rasterises text with this exact font file, like ESPHome does at compile time"><span class="material-symbols-outlined">upload_file</span>Use my .ttf for the exact preview</button></div>`}
            </div>
            <div class="fm-meta"><span>${n ? `Used by ${n} element${n === 1 ? '' : 's'}` : 'Not used yet'}</span><span class="fm-file" title="${esc(e.file)}">${esc(e.file)}</span></div>
            <div class="fm-err" role="alert"></div>
        </div>`;
    }
    function renderVisual() {
        const entries = readEntries(), used = usage();
        $('fmVisual').innerHTML =
            (entries.length ? entries.map((e, i) => card(e, i, used)).join('') : '<p class="fm-empty">No fonts yet. Add one to start using text and icons.</p>') +
            `<div class="fm-add"><button type="button" data-act="add-text"><span class="material-symbols-outlined">add</span>Add text font</button>
             <button type="button" data-act="add-icon"><span class="material-symbols-outlined">add_reaction</span>Add icon font</button></div>`;
    }

    function onVisualChange(ev) {
        const t = ev.target, c = t.closest('.fm-card'); if (!c || !t.dataset.f) return;
        const entries = readEntries(), i = +c.dataset.i, e = entries[i], f = t.dataset.f;
        const oldId = e.id, wasAuto = e.id === autoId(e);
        const fail = msg => { c.querySelector('.fm-err').textContent = msg; if (f === 'id') t.value = oldId; };
        c.querySelector('.fm-err').textContent = '';

        if (f === 'id') {
            const v = t.value.trim();
            if (!validId(v)) return fail('Use letters, digits and underscores; do not start with a digit.');
            if (entries.some(x => x !== e && x.id === v)) return fail('Another font already uses this ID.');
            e.id = v;
        } else if (f === 'bpp') {
            e.bpp = parseInt(t.value, 10) || 1;
        } else if (f === 'size') {
            const v = parseInt(t.value, 10);
            if (!(v >= 4 && v <= 200)) return fail('Size must be between 4 and 200.');
            e.size = v;
        } else if (f === 'kind') {
            const cat = byKey(t.value);
            e.kind = cat.key; e.file = cat.file; e.icon = !!cat.icon; e.bold = !!cat.bold;
        } else if (f === 'family') {
            const fam = t.value.trim(); if (!fam) return fail('Enter a font name.');
            e.file = 'gfonts://' + fam.replace(/\s+/g, '+'); e.icon = false;
        } else if (f === 'file') {
            const v = t.value.trim(); if (!v) return fail('Enter a file path.');
            e.file = v; e.icon = /material|symbol|icon/i.test(v); e.bold = /bold/i.test(v);
        }
        const renames = {};
        // keep auto-generated IDs (roboto_12) in step with size / font changes; references are updated too
        if (f !== 'id' && wasAuto) { const nid = uniqueId(autoId(e), entries, e); if (nid !== oldId) { e.id = nid; renames[oldId] = nid; } }
        else if (f === 'id' && e.id !== oldId) renames[oldId] = e.id;
        commit(entries, renames);
    }

    function onVisualClick(ev) {
        const b = ev.target.closest('[data-act]'); if (!b) return;
        const act = b.dataset.act, entries = readEntries();
        if (act === 'ttf') {
            const e = entries[+b.closest('.fm-card').dataset.i], inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.ttf,.otf';
            inp.addEventListener('change', async () => { const file = inp.files[0]; if (!file || !window.DD) return; const name = (String(e.file).split('/').pop() || file.name).replace(/^gfonts:\/\//, '') || file.name; const key = /\.(ttf|otf)$/i.test(name) ? name : file.name; await DD.fontEngine.addFile(key, await file.arrayBuffer()); if (!/\.(ttf|otf)$/i.test(String(e.file))) { e.file = 'fonts/' + file.name; e.kind = 'custom'; commit(entries); } DD.toast('Exact preview enabled for <b>' + e.id + '</b>.'); drawPreview(); });
            inp.click(); return;
        }
        if (act === 'add-text' || act === 'add-icon') {
            const kind = act === 'add-icon' ? 'symbols' : 'roboto', cat = byKey(kind);
            const e = { kind, file: cat.file, size: act === 'add-icon' ? 24 : 16, icon: !!cat.icon, bold: false };
            e.id = uniqueId(autoId(e), entries, null);
            entries.push(e); commit(entries);
        } else if (act === 'del') {
            const i = +b.closest('.fm-card').dataset.i, e = entries[i], n = usage()[e.id] || 0;
            const go = () => { entries.splice(i, 1); commit(entries); };
            if (!n) go(); else DD.confirm(`"${e.id}" is used by ${n} element${n === 1 ? '' : 's'}. They will keep pointing at it until you pick another font.`, { title: 'Remove font?', confirmLabel: 'Remove', danger: true }).then(ok => { if (ok) go(); });
        }
    }

    // ---- code view -----------------------------------------------------------------------
    function currentYaml() {
        const was = fontCodeSectionDetails.open;
        generateFontYaml(); fontCodeSectionDetails.open = was;
        return generatedFontCodeOutput.value;
    }
    function fillCode() { $('fmYaml').value = currentYaml(); setMsg(''); }
    function setMsg(text, bad) { const m = $('fmMsg'); m.textContent = text; m.classList.toggle('bad', !!bad); }
    function applyCode() {
        const parsed = window.parseEsphomeFonts ? window.parseEsphomeFonts($('fmYaml').value) : [];
        if (!parsed.length) { setMsg('No fonts found. Each entry needs at least "id:" and "file:".', true); return; }
        const seen = new Set(), dup = parsed.find(p => seen.size === seen.add(p.id).size);
        if (dup) { setMsg(`ID "${dup.id}" appears twice.`, true); return; }
        const bad = parsed.find(p => !validId(p.id));
        if (bad) { setMsg(`"${bad.id}" is not a valid ID.`, true); return; }
        commit(parsed.map(p => ({ id: p.id, size: p.size, file: p.file, icon: p.icon, bold: p.bold, bpp: p.bpp || 1, kind: kindOf(p.file) })));
        fillCode(); setMsg(`Applied ${parsed.length} font${parsed.length === 1 ? '' : 's'}.`);
    }

    // ---- view toggle ---------------------------------------------------------------------
    let view = LS.get('ddFontView', 'visual') === 'code' ? 'code' : 'visual';
    function setView(v) {
        view = v; LS.set('ddFontView', v);
        document.querySelectorAll('#fontMgr .fm-toggle button').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        $('fmVisual').hidden = v !== 'visual'; $('fmCode').hidden = v !== 'code';
        if (v === 'code') fillCode(); else renderVisual();
    }
    function render() { if (view === 'code') fillCode(); else renderVisual(); }

    $('fmVisual').addEventListener('change', onVisualChange);
    $('fmVisual').addEventListener('click', onVisualClick);
    $('fmVisual').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
    $('fmApply').addEventListener('click', applyCode);
    $('fmRevert').addEventListener('click', fillCode);
    document.querySelectorAll('#fontMgr .fm-toggle button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

    // Re-render when other code replaces the design (TXT / YAML import) or elements change fonts
    const origApply = window.applyImportedData;
    if (typeof origApply === 'function') window.applyImportedData = function () { const r = origApply.apply(this, arguments); render(); return r; };
    // refresh 'used by' counts whenever Settings is opened
    const fab = $('settingsFab'); if (fab) fab.addEventListener('click', () => setTimeout(render, 0));
    const cfg = $('configDetailsElement'); if (cfg) cfg.addEventListener('toggle', () => { if (cfg.open) render(); });
    window.fontMgrRender = render;
    setView(view);
})();
