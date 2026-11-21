// LVGL Designer: Help, Deploy guide (with Markdown export) and dark mode.
// Globals from index.html: widgetsOnCanvas, screenResolutionSelect, canvas.
(function () {
    'use strict';
    const L = window.LVGL;
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const LS = {
        get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
    };
    const size = () => (/^\d+x\d+$/.test(screenResolutionSelect.value) ? screenResolutionSelect.value : '128x160').split('x').map(Number);

    // ---------------------------------------------------------------- dark mode
    function setDark(on) {
        document.body.classList.toggle('dark-mode', on); LS.set('lvglDark', on ? '1' : '0');
        const b = $('dark-button'); if (b) b.querySelector('i').textContent = on ? 'light_mode' : 'dark_mode';
    }
    setDark(LS.get('lvglDark', window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? '1' : '0') === '1');
    $('dark-button').addEventListener('click', () => setDark(!document.body.classList.contains('dark-mode')));

    // ---------------------------------------------------------------- modal helper
    function makeModal(id, wide) {
        const m = document.createElement('div'); m.id = id; m.className = 'lvgl-modal';
        m.innerHTML = `<div class="lvgl-dialog ${wide ? 'lvgl-wide' : ''}" role="dialog" aria-modal="true"></div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('open'); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('open')) m.classList.remove('open'); });
        return m;
    }

    // ---------------------------------------------------------------- Help
    const help = makeModal('help-modal', true);
    help.firstElementChild.innerHTML = `
        <div class="lvgl-dialog-head"><h3><i class="material-icons-outlined">help_outline</i> Help &mdash; LVGL Designer</h3>
            <button type="button" class="lvgl-x" data-close title="Close"><i class="material-icons-outlined">close</i></button></div>
        <div class="lvgl-dialog-body help">
            <p class="lvgl-lead">Design a touchscreen UI for ESPHome's <b>LVGL</b> component visually, then copy the generated YAML. No hardware needed to try it.</p>

            <h4>Quick start</h4>
            <ol class="help-steps">
                <li><b>Choose a screen size.</b> Use the <i>Size</i> menu above the canvas (or <i>Custom Size</i>).</li>
                <li><b>Add widgets.</b> Drag one from the <i>Toolbox</i> onto the canvas, or press its <span class="help-chip">+</span> button.</li>
                <li><b>Arrange.</b> Drag to move, drag the square handles to resize, and edit exact values in <i>Properties</i>. Hold <kbd>Alt</kbd> to ignore the snap grid.</li>
                <li><b>Style text.</b> Pick a <i>Font</i> in Properties. Need another typeface or icons? Open <span class="help-chip"><i class="material-icons-outlined">font_download</i>Fonts</span>.</li>
                <li><b>Use it.</b> Press <span class="help-chip accent"><i class="material-icons-outlined">rocket_launch</i>Deploy</span> for a step-by-step ESPHome guide with your own YAML filled in.</li>
            </ol>

            <h4>Pages</h4>
            <p>LVGL UIs usually have several screens. The tabs above the canvas are <b>pages</b>: <kbd>+</kbd> adds one, double-click renames, <kbd>&times;</kbd> deletes. New widgets go on the page you are viewing. Each page becomes one entry under <code>lvgl: pages:</code>.</p>

            <h4>Top bar</h4>
            <table class="help-table">
                <tr><td><i class="material-icons-outlined">undo</i></td><td><b>Undo / Redo</b></td><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd>. Covers moves, edits, deletes, imports and fonts.</td></tr>
                <tr><td><i class="material-icons-outlined">font_download</i></td><td><b>Fonts</b></td><td>Add Google Fonts, local <code>.ttf</code> files or icon fonts. Built-in LVGL fonts need no setup. Switch to <i>Code</i> to edit the <code>font:</code> block directly.</td></tr>
                <tr><td><i class="material-icons-outlined">file_upload</i></td><td><b>Import YAML</b></td><td>Bring in an existing ESPHome file. You get a preview and can untick widgets before importing.</td></tr>
                <tr><td><i class="material-icons-outlined">code</i></td><td><b>Generate YAML</b></td><td>Shows the YAML for the whole design (fonts + all pages).</td></tr>
                <tr><td><i class="material-icons-outlined">rocket_launch</i></td><td><b>Deploy</b></td><td>How to put the YAML on a device, plus a Markdown export.</td></tr>
                <tr><td><i class="material-icons-outlined">keyboard</i></td><td>Shortcuts</td><td>All keyboard shortcuts.</td></tr>
            </table>

            <h4>Good to know</h4>
            <ul>
                <li><b>Your work autosaves</b> in this browser. Use Deploy &rarr; Export .md as a portable backup.</li>
                <li><b>Properties the designer can't edit are kept.</b> Importing a file keeps things like <code>bg_color</code>, <code>on_click</code> and <code>!lambda</code> and writes them back, but they are not drawn on the canvas.</li>
                <li><b>Positions are fixed x/y.</b> Alignment (<code>align: CENTER</code>) and percent sizes in an imported file are converted to pixels (percent sizes are written back unchanged until you edit them).</li>
                <li>The preview approximates LVGL's look. Fonts and spacing on the device can differ slightly.</li>
            </ul>

            <h4>Known limitations</h4>
            <ul>
                <li>Nested widgets (children of a container) are flattened to absolute positions.</li>
                <li>Event handlers (<code>on_click</code> &hellip;) and styles are not editable yet; add them in your YAML.</li>
                <li>The interface is not optimised for phones.</li>
            </ul>
        </div>
        <div class="lvgl-dialog-foot"><span class="lvgl-foot-note"></span><button type="button" class="lvgl-btn" data-close><i class="material-icons-outlined">close</i>Close</button></div>`;
    $('help-button').addEventListener('click', () => help.classList.add('open'));

    // ---------------------------------------------------------------- Deploy
    const PRESETS = {
        ili_xpt: {
            label: 'ILI9341 SPI display + XPT2046 resistive touch',
            bus: 'spi:\n  clk_pin: GPIO18\n  mosi_pin: GPIO23\n  miso_pin: GPIO19\n',
            display: 'display:\n  - platform: ili9xxx\n    id: my_display\n    model: ILI9341\n    cs_pin: GPIO5\n    dc_pin: GPIO27\n    reset_pin: GPIO33\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n',
            touch: 'touchscreen:\n  - platform: xpt2046\n    id: my_touch\n    cs_pin: GPIO4\n    interrupt_pin: GPIO36\n    update_interval: 50ms\n'
        },
        ili_i2c: {
            label: 'ILI9341 SPI display + capacitive touch (FT63x6, I2C)',
            bus: 'spi:\n  clk_pin: GPIO18\n  mosi_pin: GPIO23\ni2c:\n  sda: GPIO21\n  scl: GPIO22\n',
            display: 'display:\n  - platform: ili9xxx\n    id: my_display\n    model: ILI9341\n    cs_pin: GPIO5\n    dc_pin: GPIO27\n    reset_pin: GPIO33\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n',
            touch: 'touchscreen:\n  - platform: ft63x6\n    id: my_touch\n'
        },
        ili_notouch: {
            label: 'ILI9341 SPI display, no touch',
            bus: 'spi:\n  clk_pin: GPIO18\n  mosi_pin: GPIO23\n',
            display: 'display:\n  - platform: ili9xxx\n    id: my_display\n    model: ILI9341\n    cs_pin: GPIO5\n    dc_pin: GPIO27\n    reset_pin: GPIO33\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n',
            touch: ''
        },
        other: {
            label: 'Other / I already have a display',
            bus: '',
            display: 'display:\n  - platform: YOUR_DISPLAY_PLATFORM   # see esphome.io/components/display\n    id: my_display\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n    # ...your existing pins and options stay as they are...\n',
            touch: '# touchscreen:   # optional: add yours here and keep its id\n#   - platform: ...\n#     id: my_touch\n'
        }
    };
    let preset = LS.get('lvglPreset', 'ili_xpt'); if (!PRESETS[preset]) preset = 'ili_xpt';
    const indent = (t, n) => t.split('\n').map(l => l ? ' '.repeat(n) + l : l).join('\n');
    const LINKS = {
        symbols: 'https://github.com/google/material-design-icons/tree/master/variablefont',
        gfonts: 'https://fonts.google.com/'
    };

    function compose(key) {
        const P = PRESETS[key] || PRESETS.ili_xpt, seg = [];
        const hasTouch = !!P.touch && !/^#/.test(P.touch);
        seg.push({ k: 'your', label: 'Your existing config', t: 'esphome:\n  name: my-display          # your device name\n# esp32: / wifi: / api: / ota: ...  keep everything you already have\n' });
        const fy = L.fontYaml();
        if (fy) seg.push({ k: 'font', label: 'Fonts (Fonts manager)', t: '# --- Custom fonts ---\n' + fy });
        if (P.bus) seg.push({ k: 'your', label: 'Your wiring (check pins)', t: '# --- Display bus: use the pins you wired ---\n' + P.bus });
        seg.push({ k: 'your', label: 'Your display', t: '# --- Display: LVGL draws everything ---\n' + P.display });
        if (P.touch) seg.push({ k: 'your', label: 'Your touch', t: P.touch });
        seg.push({ k: 'your', label: 'lvgl: settings', t: 'lvgl:\n  buffer_size: 25%\n' + (hasTouch ? '  touchscreens:\n    - my_touch\n' : '') });
        const pages = L.dump({ pages: L.lvglObject().lvgl.pages }).replace(/widgets: \[\]/g, 'widgets: []   # no widgets on this page yet');
        seg.push({ k: 'lvgl', label: 'Pages & widgets (Designer)', t: indent(pages, 2) });
        return { seg, plain: seg.map(s => s.t.replace(/\n$/, '')).join('\n\n') + '\n' };
    }

    function fontRows() {
        const rows = [];
        L.fonts.forEach(f => {
            if (f.kind === 'gfonts') rows.push(`<tr><td><code>${esc(f.id)}</code></td><td>Google Font <b>${esc(f.family)}</b>: nothing to download, ESPHome fetches it while compiling.</td><td></td></tr>`);
            else {
                const base = String(f.file).split('/').pop();
                const link = f.kind === 'icons' ? LINKS.symbols : LINKS.gfonts + '?query=' + encodeURIComponent(base.replace(/\.[a-z0-9]+$/i, ''));
                const hint = f.kind === 'icons' ? `Take <code>MaterialSymbolsOutlined[…].ttf</code> and <b>rename it to ${esc(base)}</b>` : `Save the file as <b>${esc(base)}</b>`;
                rows.push(`<tr><td><code>${esc(base)}</code></td><td>${hint}</td><td><a class="dl-link" href="${link}" target="_blank" rel="noopener"><i class="material-icons-outlined">open_in_new</i>Get</a></td></tr>`);
            }
        });
        return rows.join('');
    }
    function tree() {
        const files = [...new Set(L.fonts.filter(f => f.kind !== 'gfonts').map(f => String(f.file).split('/').pop()))];
        if (!files.length) return '';
        let t = 'esphome/                  \u2190 your ESPHome config folder\n\u251c\u2500 my-display.yaml       \u2190 the file you edit\n\u2514\u2500 fonts/                \u2190 create this folder\n';
        files.forEach((f, i) => { t += `   ${i === files.length - 1 ? '\u2514\u2500' : '\u251c\u2500'} ${f}\n`; });
        return t;
    }

    const deploy = makeModal('deploy-modal', true);
    deploy.firstElementChild.classList.add('lvgl-tall');
    deploy.firstElementChild.innerHTML = `
        <div class="lvgl-dialog-head"><h3><i class="material-icons-outlined">rocket_launch</i> Deploy to ESPHome</h3>
            <button type="button" class="lvgl-x" data-close title="Close"><i class="material-icons-outlined">close</i></button></div>
        <div class="deploy-tabs" role="tablist">
            <button type="button" class="deploy-tab on" data-tab="guide"><i class="material-icons-outlined">school</i>Step-by-step</button>
            <button type="button" class="deploy-tab" data-tab="quick"><i class="material-icons-outlined">bolt</i>Quick reference</button>
            <span class="grow"></span>
            <button type="button" class="lvgl-btn" id="dp-copy"><i class="material-icons-outlined">content_copy</i>Copy YAML</button>
            <button type="button" class="lvgl-btn" id="dp-yaml"><i class="material-icons-outlined">download</i>.yaml</button>
            <button type="button" class="lvgl-btn primary" id="dp-md"><i class="material-icons-outlined">description</i>Export .md</button>
        </div>
        <div class="lvgl-dialog-body deploy-body" id="deploy-body"></div>`;
    let tab = 'guide';

    function guideHtml() {
        const [W, H] = size(), { seg } = compose(preset);
        const opts = Object.entries(PRESETS).map(([k, v]) => `<option value="${k}"${k === preset ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
        const undefinedFonts = [...new Set(widgetsOnCanvas.map(w => w.text_font).filter(f => f && !L.isDefined(f)))];
        const tr = tree();
        return `
        <section class="step"><div class="step-n">0</div><div class="step-c"><h3>Before you start</h3><ul>
            <li>ESPHome installed: <a href="https://esphome.io/guides/getting_started_hassio/" target="_blank" rel="noopener">Home Assistant add-on</a> or <a href="https://esphome.io/guides/getting_started_command_line/" target="_blank" rel="noopener">command line</a>. LVGL needs a recent ESPHome (2023.11 or newer).</li>
            <li>An ESP32 with a display (and a touch panel if you want input) that already works in ESPHome. See the <a href="https://esphome.io/components/display/" target="_blank" rel="noopener">display docs</a> for your model.</li>
            <li>Your design is <b>${W} \u00d7 ${H} px</b> on <b>${L.pages.length} page${L.pages.length === 1 ? '' : 's'}</b> with <b>${widgetsOnCanvas.length} widget${widgetsOnCanvas.length === 1 ? '' : 's'}</b>. Make sure the size matches your real screen. ESP32 boards with PSRAM handle large screens best.</li></ul></div></section>

        <section class="step"><div class="step-n">1</div><div class="step-c"><h3>Fonts</h3>
            <p>LVGL already includes <code>montserrat_8</code> &hellip; <code>montserrat_48</code>, so <b>text works with no files at all</b>. Only fonts you added in the Fonts manager need attention:</p>
            ${L.fonts.length ? `<table class="dtable"><thead><tr><th>File / ID</th><th>What to do</th><th></th></tr></thead><tbody>${fontRows()}</tbody></table>` : '<div class="lvgl-callout tip"><i class="material-icons-outlined">check_circle</i><div>You are only using built-in fonts. Nothing to download.</div></div>'}
            ${tr ? `<p><b>Where to put them:</b> a <code>fonts</code> folder <u>next to your YAML file</u>.</p><pre class="tree">${esc(tr)}</pre>
            <ul><li><b>Home Assistant add-on:</b> the folder is <code>/config/esphome/</code> (upload with the File editor, Samba or Studio Code Server add-on).</li><li><b>Command line:</b> the folder that holds your YAML.</li></ul>` : ''}
            ${undefinedFonts.length ? `<div class="lvgl-callout warn"><i class="material-icons-outlined">warning</i><div>These fonts are used by widgets but not defined: <b>${undefinedFonts.map(esc).join(', ')}</b>. Add them in Fonts, or pick a built-in font.</div></div>` : ''}
        </div></section>

        <section class="step"><div class="step-n">2</div><div class="step-c"><h3>Put the code in your YAML</h3>
            <p>A complete example built from <b>your current design</b>. Pick your hardware, then see where each part goes:</p>
            <label class="plat">Hardware <select id="dp-preset">${opts}</select></label>
            <div class="legend"><span class="lg lg-lvgl">Designer output (pages &amp; widgets)</span>${L.fonts.length ? '<span class="lg lg-font">Fonts</span>' : ''}<span class="lg lg-your">Yours (keep / adjust)</span></div>
            <div class="yaml">${seg.map(s => `<div class="seg seg-${s.k}" data-label="${esc(s.label)}">${esc(s.t.replace(/\n$/, ''))}</div>`).join('')}</div>
            <ul>
                <li><b>Always required by LVGL:</b> the display needs <code>auto_clear_enabled: false</code> and LVGL replaces the usual lambda. The <code>lvgl:</code> block needs a <code>pages:</code> (or <code>widgets:</code>) list. That is what the Designer writes.</li>
                <li>Link touch with <code>touchscreens:</code> under <code>lvgl:</code> (already shown above).</li>
                <li>Pins and the display model are <i>examples</i>. Keep your own working display settings.</li>
                <li>Add behaviour (<code>on_click</code>, <code>on_value</code> &hellip;) to widgets by hand: see the <a href="https://esphome.io/components/lvgl/" target="_blank" rel="noopener">LVGL docs</a>.</li>
            </ul></div></section>

        <section class="step"><div class="step-n">3</div><div class="step-c"><h3>Compile and flash</h3><ul>
            <li><b>Home Assistant:</b> open the device in ESPHome, press <i>Install</i>, choose <i>Wirelessly</i> or <i>Plug into this computer</i>.</li>
            <li><b>Command line:</b> <code>esphome run my-display.yaml</code></li>
            <li>The first LVGL build is slow (several minutes). Later builds are quicker.</li></ul></div></section>

        <section class="step"><div class="step-n">4</div><div class="step-c"><h3>If something looks wrong</h3>
            <table class="dtable"><thead><tr><th>You see</th><th>Fix</th></tr></thead><tbody>
                <tr><td>Error mentioning <code>auto_clear_enabled</code></td><td>Add <code>auto_clear_enabled: false</code> to the display.</td></tr>
                <tr><td>Error: <i>Couldn't find ID</i> (font)</td><td>The <code>text_font</code> must be a built-in name or the <code>id</code> of a <code>font:</code> entry.</td></tr>
                <tr><td>Error: <i>file not found</i></td><td>Check the <code>fonts/</code> folder is next to the YAML and the name matches exactly (case counts).</td></tr>
                <tr><td>Icons or symbols show as empty boxes</td><td>The icon font needs those characters in <code>glyphs:</code>, and the file must be Material Symbols.</td></tr>
                <tr><td>Touch does nothing</td><td>Make sure <code>touchscreens:</code> lists your touch id. Resistive panels (XPT2046) may need calibration.</td></tr>
                <tr><td>Out of memory / reboots</td><td>Lower <code>buffer_size</code> (try 12%), use fewer or smaller fonts, or use a board with PSRAM.</td></tr>
                <tr><td>Position is a few pixels off</td><td>The preview is approximate. Nudge with the arrow keys and re-copy.</td></tr>
            </tbody></table></div></section>

        <section class="step"><div class="step-n">5</div><div class="step-c"><h3>Keep a copy of your design</h3>
            <p><b>Export .md</b> saves a readable summary: description, ASCII sketch of every page, widget table, the full YAML and a JSON spec an AI assistant can use to change your design later.</p>
            <button type="button" class="lvgl-btn primary" id="dp-md2"><i class="material-icons-outlined">description</i>Export .md</button></div></section>`;
    }
    function quickHtml() {
        return `
        <section class="qr"><h3>Where each part goes</h3><table class="dtable"><thead><tr><th>Part</th><th>Goes in</th></tr></thead><tbody>
            <tr><td><span class="lg lg-lvgl">pages &amp; widgets</span></td><td><code>lvgl: pages:</code> (one entry per tab above the canvas)</td></tr>
            <tr><td><span class="lg lg-font">font:</span></td><td>Top level, only for fonts from the Fonts manager. <code>.ttf</code> files in <code>./fonts/</code>, or <code>gfonts://Name</code></td></tr>
            <tr><td><span class="lg lg-your">display:</span></td><td>Yours. Needs <code>auto_clear_enabled: false</code>; reference it by id if you have several</td></tr>
            <tr><td><span class="lg lg-your">touchscreen:</span></td><td>Yours. Link with <code>lvgl: touchscreens: [id]</code></td></tr></tbody></table></section>
        <section class="qr"><h3>Gotchas</h3><ul>
            <li><b>Built-in fonts:</b> <code>text_font: montserrat_20</code> needs no <code>font:</code> entry. Custom fonts need <code>bpp: 4</code> for smooth text.</li>
            <li><b>Icons in labels:</b> use an icon font and list the characters in <code>glyphs:</code>, then put the character in <code>text:</code>.</li>
            <li><b>Coordinates</b> are absolute from the top-left. Imported <code>align:</code> and percent sizes are converted for the canvas.</li>
            <li><b>IDs</b> must be unique across all pages; they are how <code>lvgl.*</code> actions find widgets.</li>
            <li><b>Not drawn but kept:</b> styles, <code>on_*</code> handlers and <code>!lambda</code> from an imported file are written back unchanged.</li>
            <li><b>Memory:</b> <code>buffer_size: 25%</code> is a good start; lower it if you run out of RAM.</li></ul></section>
        <section class="qr"><h3>Docs</h3><ul class="linklist">
            <li><a href="https://esphome.io/components/lvgl/" target="_blank" rel="noopener">LVGL component</a></li>
            <li><a href="https://esphome.io/components/font/" target="_blank" rel="noopener">Font component</a></li>
            <li><a href="https://esphome.io/components/display/" target="_blank" rel="noopener">Display component</a></li>
            <li><a href="https://esphome.io/components/touchscreen/" target="_blank" rel="noopener">Touchscreen</a></li></ul>
            <p class="muted">Want the complete, filled-in example? Use <b>Step-by-step</b> (step 2) or <b>Copy YAML</b>.</p></section>`;
    }
    function renderDeploy() {
        const body = $('deploy-body'); body.innerHTML = tab === 'guide' ? guideHtml() : quickHtml();
        deploy.querySelectorAll('.deploy-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
        const sel = $('dp-preset'); if (sel) sel.addEventListener('change', () => { preset = sel.value; LS.set('lvglPreset', preset); const k = body.scrollTop; renderDeploy(); body.scrollTop = k; });
        const m2 = $('dp-md2'); if (m2) m2.addEventListener('click', exportMd);
    }
    deploy.querySelectorAll('.deploy-tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; renderDeploy(); $('deploy-body').scrollTop = 0; }));
    $('deploy-button').addEventListener('click', () => { renderDeploy(); deploy.classList.add('open'); });
    $('dp-copy').addEventListener('click', e => {
        const b = e.currentTarget, old = b.innerHTML;
        if (!navigator.clipboard) { alert('Clipboard not available. Use the .yaml download.'); return; }
        navigator.clipboard.writeText(compose(preset).plain).then(() => { b.innerHTML = '<i class="material-icons-outlined">done</i>Copied!'; setTimeout(() => { b.innerHTML = old; }, 1500); }).catch(() => alert('Copy failed.'));
    });
    function download(name, text, type) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    $('dp-yaml').addEventListener('click', () => download('lvgl-design.yaml', compose(preset).plain, 'text/yaml;charset=utf-8'));
    $('dp-md').addEventListener('click', exportMd);

    // ---------------------------------------------------------------- Markdown export
    function ascii(W, H, list) {
        const cols = Math.min(72, Math.max(20, Math.round(W / 4))), sx = cols / W, rows = Math.max(8, Math.round(H * sx / 2)), sy = rows / H;
        const g = Array.from({ length: rows }, () => Array(cols).fill(' '));
        const put = (c, r, ch) => { if (r >= 0 && r < rows && c >= 0 && c < cols) g[r][c] = ch; };
        list.forEach((w, n) => {
            const el = w.element, wd = w.width !== undefined ? w.width : (el ? el.offsetWidth : 60), ht = w.height !== undefined ? w.height : (el ? el.offsetHeight : 20);
            const c0 = Math.round(w.x * sx), r0 = Math.round(w.y * sy), c1 = Math.max(c0 + 2, Math.round((w.x + wd) * sx) - 1), r1 = Math.max(r0, Math.round((w.y + ht) * sy) - 1);
            for (let c = c0; c <= c1; c++) { put(c, r0, '-'); put(c, r1, '-'); }
            for (let r = r0; r <= r1; r++) { put(c0, r, '|'); put(c1, r, '|'); }
            [[c0, r0], [c1, r0], [c0, r1], [c1, r1]].forEach(([c, r]) => put(c, r, '+'));
            const tag = `${n + 1}:${w.type}`; for (let i = 0; i < tag.length && c0 + 1 + i < c1; i++) put(c0 + 1 + i, r0, tag[i]);
        });
        const f = '+' + '-'.repeat(cols) + '+';
        return [f, ...g.map(r => '|' + r.join('') + '|'), f].join('\n');
    }
    function buildMarkdown() {
        const [W, H] = size(), now = new Date().toISOString().slice(0, 10), out = [];
        const total = widgetsOnCanvas.length;
        out.push('# ESPHome LVGL Design', '', `> Exported from **LVGL Designer by JDNx Tools** on ${now}. Contains a human-readable description, an approximate ASCII sketch per page, the generated ESPHome YAML and a machine-readable spec for AI agents.`, '');
        out.push('## 1. Overview (for humans)', '', `This is a **${W} x ${H} px** LVGL touchscreen layout with **${L.pages.length}** page${L.pages.length === 1 ? '' : 's'} and **${total}** widget${total === 1 ? '' : 's'}.`, '');
        out.push('| Property | Value |', '|---|---|', `| Resolution | ${W} x ${H} px |`, `| Pages | ${L.pages.map(p => '`' + p.id + '`').join(', ')} |`, `| Custom fonts | ${L.fonts.map(f => '`' + f.id + '`').join(', ') || '_none (built-in LVGL fonts only)_'} |`, '');
        out.push('Coordinates: origin `(0,0)` is the **top-left** pixel; X grows right, Y grows down. Widgets are positioned by their top-left corner. Later widgets in a page are drawn on top of earlier ones.', '');
        out.push('## 2. Pages', '');
        L.pages.forEach(pg => {
            const ws = widgetsOnCanvas.filter(w => L.pageOf(w) === pg.id);
            out.push(`### Page \`${pg.id}\``, '');
            if (!ws.length) { out.push('_No widgets._', ''); return; }
            out.push('```text', ascii(W, H, ws), '```', '', '| # | Widget | ID | Position | Size | Details |', '|---|---|---|---|---|---|');
            ws.forEach((w, i) => {
                const det = [w.text ? `text "${String(w.text).replace(/\|/g, '\\|')}"` : '', w.text_font ? `font \`${w.text_font}\`` : '', typeof w.value === 'number' ? `value ${w.value}` : '', w.options ? `options ${w.options.length}` : ''].filter(Boolean).join(', ');
                out.push(`| ${i + 1} | ${w.type} | \`${w.id}\` | ${w.x},${w.y} | ${w.width !== undefined ? w.width : 'auto'}\u00d7${w.height !== undefined ? w.height : 'auto'} | ${det} |`);
            });
            out.push('');
        });
        out.push('## 3. Generated ESPHome YAML', '', 'Designer output (fonts + pages). Hardware sections are in the Deploy guide.', '', '```yaml', L.fullYaml().trimEnd(), '```', '');
        out.push('## 4. Complete example file', '', '```yaml', compose(preset).plain.trimEnd(), '```', '');
        out.push('## 5. Agent section (machine-readable)', '', '### Instructions for AI agents', '',
            '- Treat the JSON below as the source of truth; the ASCII art is only a sketch.',
            '- Units are pixels, origin top-left. Within a page, later widgets are drawn on top.',
            '- Widget IDs must stay unique across all pages.',
            '- `text_font` is either a built-in LVGL font (`montserrat_14` ...) or the `id` of an entry in `font:`.',
            '- Keep widgets inside the screen (0..' + W + ' x 0..' + H + ').',
            '- To change the design, edit the JSON and regenerate the `lvgl:` YAML: one `pages:` entry per page, one `- <type>:` item per widget with `id, x, y, width, height` and the other fields.',
            '- Event handlers (`on_click`...) and style properties are not part of the visual model and may be added in the YAML.', '');
        const spec = {
            display: { width: W, height: H, origin: 'top-left', units: 'px' },
            fonts: L.fonts.map(f => ({ id: f.id, kind: f.kind, family: f.kind === 'gfonts' ? f.family : undefined, file: f.kind === 'gfonts' ? undefined : f.file, size: f.size, bpp: f.bpp })),
            pages: L.pages.map(pg => ({
                id: pg.id,
                widgets: widgetsOnCanvas.filter(w => L.pageOf(w) === pg.id).map((w, i) => { const { element, extra, page, zIndex, _raw, _ex, ...rest } = w; return { index: i + 1, ...rest }; })
            }))
        };
        out.push('### Layout spec', '', '```json', JSON.stringify(spec, null, 2), '```', '', '---', '_Generated by LVGL Designer by JDNx Tools._', '');
        return out.join('\n');
    }
    function exportMd() { download('lvgl-design.md', buildMarkdown(), 'text/markdown;charset=utf-8'); }
    L.buildMarkdown = buildMarkdown; L.composeDeploy = compose;

    // also offer the .md export in the Generate YAML dialog
    const yamlFoot = document.querySelector('#yaml-modal .rounded-b');
    if (yamlFoot) {
        const b = document.createElement('button'); b.type = 'button'; b.id = 'yaml-md-btn'; b.className = 'lvgl-btn mr-2';
        b.innerHTML = '<i class="material-icons-outlined">description</i>Export .md'; b.addEventListener('click', exportMd); yamlFoot.insertBefore(b, yamlFoot.firstChild);
    }
})();
