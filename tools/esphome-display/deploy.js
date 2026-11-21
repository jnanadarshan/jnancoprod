// Deploy guide: builds a "how to use this in ESPHome" walkthrough from the live design.
// Relies on globals from index.html: elements, einkMode, configResolutionSelect, colorPalette,
// generateLambdaCode / generateFontYaml / generateColorYaml, getIconCodepoint, mapColorPreview,
// generatedCodeOutput, generatedFontCodeOutput, window.downloadDisplayMarkdown.
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const LS = {
        get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
    };

    // Hardware presets. "profile" follows the Display type chosen in the designer; pins are examples.
    const BUS = {
        spi: 'spi:\n  clk_pin: GPIO18\n  mosi_pin: GPIO23\n',
        i2c: 'i2c:\n  sda: GPIO21\n  scl: GPIO22\n'
    };
    function profilePreset() {
        const p = (window.DD && DD.profile && DD.profile()) || { platform: 'ili9xxx', model: 'ILI9341', mode: 'color' };
        const plat = p.platform, model = p.model ? `    model: ${/[\s"]/.test(p.model) ? JSON.stringify(p.model.replace(/"/g, '')) : p.model}\n` : '';
        const i2c = /_i2c$/.test(plat), spi = !i2c;
        let display = `  - platform: ${plat}\n${model}`;
        if (i2c) display += '    address: 0x3C\n';
        else if (p.mode === 'epaper') display += '    cs_pin: GPIO5\n    dc_pin: GPIO17\n    busy_pin: GPIO4\n    reset_pin: GPIO16\n    full_update_every: 30\n';
        else display += '    cs_pin: GPIO5\n    dc_pin: GPIO27\n    reset_pin: GPIO33\n';
        display += p.mode === 'epaper' ? '    update_interval: 60s\n' : '    update_interval: 1s\n';
        const nums = { mono: 'Monochrome', gray: 'Grayscale', color: 'Colour', epaper: 'E-paper' };
        return { label: `Match my display type: ${p.label || plat}`, pre: i2c ? BUS.i2c : BUS.spi, display, mode: p.mode, tip: p.modelNote || '', kind: nums[p.mode] };
    }
    const PLATFORMS = {
        get profile() { return profilePreset(); },
        other: {
            label: 'Other / I already have a display',
            pre: '',
            display: '  - platform: YOUR_DISPLAY_PLATFORM   # e.g. st7789v, ssd1306_spi ... see esphome.io/components/display\n    # ...your existing pins and options stay exactly as they are...\n'
        }
    };

    const LINKS = {
        roboto: 'https://fonts.google.com/specimen/Roboto',
        opensans: 'https://fonts.google.com/specimen/Open+Sans',
        symbols: 'https://github.com/google/material-design-icons/tree/master/variablefont',
        mdi: 'https://github.com/Templarian/MaterialDesign-Webfont/raw/master/fonts/materialdesignicons-webfont.ttf'
    };

    // ---------- the generators already emit ESPHome-valid YAML; Deploy just assembles it ----------
    const bare = id => (String(id || '').match(/^id\(\s*(\w+)\s*\)$/) || [, String(id || '').trim()])[1];

    function build() {
        const notes = [];
        generateLambdaCode(); generateFontYaml();
        const colorY = generateColorYaml().split('\n\n')[0].trimEnd() + '\n';
        const fonts = getFontSpecs();
        const fontY = generatedFontCodeOutput.value.trimEnd() + '\n';
        const fontIds = new Set(fonts.map(f => f.id));
        const palette = new Set((colorPalette || []).map(c => c.name));

        const multi = window.DD && DD.pages.length > 1;
        const raw = (generatedCodeOutput.value || '').split('\n').filter(l => !/^#/.test(l));
        const body = multi ? raw.filter(l => l.length) : raw.slice(1).filter(l => l.trim().length);
        const lambdaLines = body.length ? body : ['  // No elements yet - add some in the designer'];

        if (/placeholder: set your real color/.test(colorY)) notes.push('Color IDs used by your elements but not created in Settings got a <b>placeholder</b> color so the file compiles. Change the hex values.');
        if (fonts.some(f => f.icon && f.icons.size)) notes.push('Icon fonts list a <code>glyphs:</code> entry for exactly the icons you used. Without it ESPHome only includes basic letters and you would see empty boxes.');
        if (fonts.some(f => !f.icon && f.extra.size)) notes.push('Text with characters outside ESPHome\'s default set (like <code>/</code> or <code>#</code>) gets an extended <code>glyphs:</code> list.');
        if (/Color\(/.test(lambdaLines.join('\n'))) notes.push('Named colours are written as <code>Color::WHITE</code> / <code>Color::BLACK</code> or <code>Color(r, g, b)</code>, which ESPHome understands.');

        const needed = new Set((window.DD ? DD.sensorIds() : []).filter(n => !fontIds.has(n) && !palette.has(n)));

        return { fonts, fontY, colorY, lambdaLines, needed, notes };
    }

    const indent = (t, n) => t.split('\n').map(l => l ? ' '.repeat(n) + l : l).join('\n');
    function compose(platformKey) {
        const m = build();
        const P = PLATFORMS[platformKey] || PLATFORMS.profile;
        const multi = window.DD && DD.pages.length > 1, seg = [];
        seg.push({ k: 'your', label: 'Your existing config', t: 'esphome:\n  name: my-display          # your device name\n# esp32: / wifi: / api: / ota: ...  keep everything you already have\n' });
        seg.push({ k: 'color', label: '1 \u00b7 Color Code', t: '# --- Color Code (Color Code button) ---\n' + m.colorY });
        seg.push({ k: 'font', label: '2 \u00b7 Font Code', t: '# --- Font Code (Font Code button) ---\n' + m.fontY });
        const assets = window.DD ? DD.assetsYaml() : '';
        if (assets) seg.push({ k: 'font', label: 'Assets Code (images, graph, QR, clock)', t: '# --- Assets Code (Assets button) ---\n' + assets });
        if (P.pre) seg.push({ k: 'your', label: 'Your wiring (check pins)', t: '# --- Display bus: use the pins you wired ---\n' + P.pre });
        if (m.needed.size) {
            let t = '# --- Sensors your display reads (change entity_id) ---\nsensor:\n';
            m.needed.forEach(n => { t += `  - platform: homeassistant\n    id: ${n}\n    entity_id: sensor.CHANGE_ME\n`; });
            seg.push({ k: 'sensor', label: 'Your sensors', t });
        }
        let disp = P.display; if (multi) disp = disp.replace(/^(  - platform:[^\n]*\n)/, '$1    id: my_display\n');
        if (multi) {
            seg.push({ k: 'your', label: 'Your display', t: 'display:\n' + disp });
            seg.push({ k: 'lambda', label: '3 \u00b7 Lambda Code (pages)', t: indent(m.lambdaLines.join('\n'), 4) + '\n' });
            seg.push({ k: 'your', label: 'Switching pages (example)', t: '# Change page every 5 s; use display.page.show / show_previous for buttons\ninterval:\n  - interval: 5s\n    then:\n      - display.page.show_next: my_display\n      - component.update: my_display\n' });
        } else {
            seg.push({ k: 'your', label: 'Your display', t: 'display:\n' + disp + '    lambda: |-\n' });
            seg.push({ k: 'lambda', label: '3 \u00b7 Lambda Code', t: m.lambdaLines.map(l => '      ' + l.replace(/^ {2}/, '')).join('\n') + '\n' });
        }
        return { seg, plain: seg.map(s => s.t).join('\n'), m, P };
    }

    // ---------- rendering ----------
    function fontRows(fonts) {
        if (!fonts.length) return '<tr><td colspan="3">No fonts listed yet. Add font IDs in Settings.</td></tr>';
        const seen = new Set();
        return fonts.filter(f => !/:\/\//.test(f.file) && !seen.has(f.file) && seen.add(f.file)).map(f => {
            const base = f.file.split('/').pop();
            let link, hint;
            if (/^Roboto/i.test(base)) { link = LINKS.roboto; hint = 'Bundled with the designer preview; for ESPHome download the family and use <b>' + esc(base) + '</b> from the <i>static</i> folder'; }
            else if (/^OpenSans/i.test(base)) { link = LINKS.opensans; hint = 'Download family, use <b>' + esc(base) + '</b> from the <i>static</i> folder'; }
            else if (/MaterialSymbols/i.test(base)) { link = LINKS.symbols; hint = 'Take <code>MaterialSymbolsOutlined[\u2026].ttf</code> and <b>rename it to ' + esc(base) + '</b>'; }
            else if (/materialdesignicons/i.test(base)) { link = LINKS.mdi; hint = 'Direct download (note: different icon set than this tool\'s preview)'; }
            else { link = 'https://fonts.google.com/?query=' + encodeURIComponent(base.replace(/\.ttf$/i, '')); hint = 'Search Google Fonts, save the file as <b>' + esc(base) + '</b>'; }
            return `<tr><td><code>${esc(base)}</code></td><td>${hint}</td><td><a class="dl-link" href="${link}" target="_blank" rel="noopener"><span class="material-symbols-outlined">open_in_new</span>Get</a></td></tr>`;
        }).join('');
    }

    function folderTree(fonts) {
        const files = [...new Set(fonts.filter(f => !/:\/\//.test(f.file)).map(f => f.file.split('/').pop()))];
        let t = 'esphome/                  \u2190 your ESPHome config folder\n\u251c\u2500 my-display.yaml       \u2190 the file you edit\n\u2514\u2500 fonts/                \u2190 create this folder\n';
        files.forEach((f, i) => { t += `   ${i === files.length - 1 ? '\u2514\u2500' : '\u251c\u2500'} ${f}\n`; });
        return t;
    }

    function segHtml(seg) {
        return seg.map(s => `<div class="seg seg-${s.k}" data-label="${esc(s.label)}">${esc(s.t.replace(/\n$/, ''))}</div>`).join('');
    }

    function guideHtml(platformKey) {
        const { seg, m } = compose(platformKey);
        const [W, H] = (/^\d+x\d+$/.test(configResolutionSelect.value) ? configResolutionSelect.value : '—x—').split('x');
        const opts = Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}"${k === platformKey ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
        const sensorsNote = m.needed.size
            ? `<div class="callout warn"><span class="material-symbols-outlined">sensors</span><div>Your text reads values from <b>${[...m.needed].map(n => '<code>' + esc(n) + '</code>').join(', ')}</b>. Those IDs must exist in your YAML as sensors. A starter <i>sensors</i> block is included; set the real <code>entity_id</code>.</div></div>`
            : '';
        const mode = window.DD ? DD.mode() : 'color';
        const eink = mode === 'epaper' ? '<li>You designed for <b>e-paper</b>: keep <code>update_interval</code> long (60s+) and prefer black and white.</li>' : mode === 'mono' ? '<li>1-bit display: any colour except <code>Color::BLACK</code> lights a pixel. The generator writes <code>Color::WHITE</code> / <code>Color::BLACK</code> for you.</li>' : mode === 'gray' ? '<li>Grayscale display: only the white channel is used. The generator writes <code>Color(0, 0, 0, W)</code> so your grays show.</li>' : '';
        const pagesLi = window.DD && DD.pages.length > 1 ? `<li>Your design has <b>${DD.pages.length} pages</b>: the display gets a <code>pages:</code> list and an example <code>interval:</code> that switches them.</li>` : '';
        const imgList = window.DD && DD.images.length ? `<section class="step"><div class="step-n">1b</div><div class="step-c"><h3>Image files</h3><p>Copy these into an <code>images/</code> folder next to your YAML (ESPHome converts them at compile time):</p><ul>${DD.images.map(i => `<li><code>${esc(i.file || ('images/' + i.id + '.png'))}</code> \u2192 <b>${esc(i.type)}</b>${i.resize ? ' resized to ' + esc(i.resize) : ''} <button type="button" class="dd-btn-sm" data-save-img="${esc(i.id)}"><span class="material-symbols-outlined">download</span>Save original</button></li>`).join('')}</ul></div></section>` : '';
        return `
        <section class="step"><div class="step-n">0</div><div class="step-c">
            <h3>Before you start</h3>
            <ul>
                <li>ESPHome installed: <a href="https://esphome.io/guides/getting_started_hassio/" target="_blank" rel="noopener">Home Assistant add-on</a> or <a href="https://esphome.io/guides/getting_started_command_line/" target="_blank" rel="noopener">command line</a>.</li>
                <li>An ESP32 (or ESP8266) with a display wired up and already working in ESPHome. If it isn't, start from the <a href="https://esphome.io/components/display/" target="_blank" rel="noopener">display docs</a> for your model.</li>
                <li>Your design is <b>${esc(W)} × ${esc(H)} px</b>. Make sure it matches your real screen.</li>${eink}${pagesLi}
            </ul>
        </div></section>

        <section class="step"><div class="step-n">1</div><div class="step-c">
            <h3>Download the fonts</h3>
            <p>ESPHome bakes fonts into the firmware, so it needs the <code>.ttf</code> files. Based on your Font IDs you need:</p>
            <table class="dtable"><thead><tr><th>File</th><th>What to download</th><th></th></tr></thead><tbody>${fontRows(m.fonts)}</tbody></table>
            <p><b>Where to put them:</b> make a <code>fonts</code> folder <u>next to your YAML file</u>.</p>
            <pre class="tree">${esc(folderTree(m.fonts))}</pre>
            <ul>
                <li><b>Home Assistant add-on:</b> the folder is <code>/config/esphome/</code>. Upload with the <i>File editor</i>, <i>Samba share</i> or <i>Studio Code Server</i> add-on.</li>
                <li><b>Command line:</b> the folder that holds your YAML file.</li>
            </ul>
            <div class="callout tip"><span class="material-symbols-outlined">lightbulb</span><div><b>Shortcut for text fonts:</b> skip the download and write <code>file: "gfonts://Roboto"</code>. ESPHome fetches it for you. Icons still need the Material Symbols file above.</div></div>
        </div></section>

        ${imgList}
        <section class="step"><div class="step-n">2</div><div class="step-c">
            <h3>Put the code in your YAML</h3>
            <p>Below is a complete example built from <b>your current design</b>. Pick your display type, then see where each piece goes:</p>
            <label class="plat">Display type <select id="deployPlatform">${opts}</select></label>
            <div class="legend">
                <span class="lg lg-color">1 Color Code</span><span class="lg lg-font">2 Font Code</span><span class="lg lg-lambda">3 Lambda Code</span><span class="lg lg-your">Yours (keep / adjust)</span>${m.needed.size ? '<span class="lg lg-sensor">Sensors</span>' : ''}
            </div>
            <div class="yaml" id="deployYaml">${segHtml(seg)}</div>
            <ul>
                <li><b>Color</b> and <b>Font</b> blocks live at the top level (no indent), anywhere in the file.</li>
                <li>The <b>Lambda</b> goes inside <code>display:</code> under <code>lambda: |-</code>, indented one level deeper than <code>lambda</code>. The Deploy view already indents it; if you paste the Lambda Code button's output yourself, indent every line by 6 spaces.</li>
                <li>Pins and the display model are <i>examples</i>. Keep your own working display settings.</li>
            </ul>
            ${sensorsNote}
            <details class="adjusted"><summary>What is automatically handled in this YAML?</summary>
                <ul>${(m.notes.length ? m.notes : ['Nothing special needed for this design.']).map(n => '<li>' + n + '</li>').join('')}</ul>
                <p>The three code buttons produce exactly these same blocks; Copy YAML (top right) just wraps them in a full file.</p>
            </details>
        </div></section>

        <section class="step"><div class="step-n">3</div><div class="step-c">
            <h3>Compile and flash</h3>
            <ul>
                <li><b>Home Assistant:</b> open the device in ESPHome, press <i>Install</i>, choose <i>Wirelessly</i> or <i>Plug into this computer</i>.</li>
                <li><b>Command line:</b> <code>esphome run my-display.yaml</code></li>
                <li>The first build downloads tools and takes a few minutes. Later builds are quick.</li>
            </ul>
        </div></section>

        <section class="step"><div class="step-n">4</div><div class="step-c">
            <h3>If something looks wrong</h3>
            <table class="dtable"><thead><tr><th>You see</th><th>Fix</th></tr></thead><tbody>
                <tr><td>Error: <i>Couldn't find ID …</i></td><td>The ID isn't defined. Add the font, color or sensor with exactly that name.</td></tr>
                <tr><td>Error: <i>file not found</i> for a font</td><td>Check the <code>fonts/</code> folder is next to the YAML and the file name matches exactly (case counts).</td></tr>
                <tr><td>Empty boxes instead of icons</td><td>Wrong icon font (use Material Symbols) or the icon is missing from <code>glyphs:</code>.</td></tr>
                <tr><td>Letters like <code>/</code> or <code>#</code> missing</td><td>Add them to the font's <code>glyphs:</code> string.</td></tr>
                <tr><td>Screen stays blank</td><td>Re-check wiring and the display model. Watch the device logs for errors.</td></tr>
                <tr><td>Text sits a few pixels off</td><td>The preview is approximate. Nudge x/y in the designer and re-copy.</td></tr>
                <tr><td>Out of memory when compiling (ESP8266)</td><td>Use fewer or smaller fonts.</td></tr>
            </tbody></table>
        </div></section>

        <section class="step"><div class="step-n">5</div><div class="step-c">
            <h3>Keep a copy of your design</h3>
            <p>The <b>Export .md</b> button (top right) saves a readable summary: description, ASCII preview, all generated code and a JSON spec an AI assistant can use to modify your design later.</p>
            <button type="button" class="deploy-act primary inline" id="deployDlMd2"><span class="material-symbols-outlined">description</span>Export .md</button>
        </div></section>`;
    }

    function quickHtml(platformKey) {
        return `
        <section class="qr">
            <h3>Where each block goes</h3>
            <table class="dtable"><thead><tr><th>Button</th><th>Produces</th><th>Goes in</th></tr></thead><tbody>
                <tr><td><span class="lg lg-color">Color Code</span></td><td><code>color:</code> list</td><td>Top level of the YAML</td></tr>
                <tr><td><span class="lg lg-font">Font Code</span></td><td><code>font:</code> list</td><td>Top level, with <code>.ttf</code> files in <code>./fonts/</code></td></tr>
                <tr><td><span class="lg lg-lambda">Generate Lambda</span></td><td><code>it.printf / it.filled_rectangle …</code></td><td><code>display: - lambda: |-</code> (body indented under <code>lambda</code>)</td></tr>
            </tbody></table>
        </section>
        <section class="qr">
            <h3>Gotchas that bite experienced users too</h3>
            <ul>
                <li><b>The generated blocks are drop-in:</b> font IDs are bare names (<code>roboto_12</code>), colors are <code>Color(r, g, b)</code> or <code>id(...)</code>, and icon fonts carry their <code>glyphs:</code>.</li>
                <li><b>Icons need <code>glyphs:</code></b> listing the code points you draw (e.g. <code>["\\uE88A"]</code>), and the file must be Material Symbols, not MDI.</li>
                <li><b>Default glyph set is small.</b> <code>/ # ' ? @ * &lt; &gt;</code> are missing unless you add <code>glyphs:</code>.</li>
                <li><b>Sensor values:</b> use <code>id(x).state</code>; for text sensors add <code>.c_str()</code>. <code>%.1f</code> expects a float.</li>
                <li><b>Draw order:</b> the lambda draws last element first, so list element #1 ends up on top.</li>
                <li><b>E-Ink:</b> long <code>update_interval</code>, <code>full_update_every</code>, black/white only.</li>
                <li><b>Corner radius / thickness</b> are preview-only; ESPHome ignores them.</li>
                <li><b>Fonts without downloading:</b> <code>file: "gfonts://Roboto"</code> for text. Material Symbols still needs a local file.</li>
            </ul>
        </section>
        <section class="qr">
            <h3>Docs</h3>
            <ul class="linklist">
                <li><a href="https://esphome.io/components/display/" target="_blank" rel="noopener">Display component &amp; lambda API</a></li>
                <li><a href="https://esphome.io/components/font/" target="_blank" rel="noopener">Font component</a></li>
                <li><a href="https://esphome.io/components/color" target="_blank" rel="noopener">Color component</a></li>
                <li><a href="https://fonts.google.com/specimen/Roboto" target="_blank" rel="noopener">Roboto (Google Fonts)</a></li>
                <li><a href="${LINKS.symbols}" target="_blank" rel="noopener">Material Symbols font files</a></li>
            </ul>
            <p class="muted">Want the complete, filled-in example for your design? Switch to <b>Step-by-step</b> (step 2) or press <b>Copy YAML</b>.</p>
        </section>`;
    }

    // ---------- wiring ----------
    let tab = 'guide';
    let platform = LS.get('ddDeployPlatform', 'profile');
    if (!PLATFORMS[platform]) platform = 'profile';

    function render() {
        const body = $('deployBody'), keep = body.scrollTop;
        body.innerHTML = tab === 'guide' ? guideHtml(platform) : quickHtml(platform);
        body.scrollTop = keep;
        document.querySelectorAll('.deploy-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        const sel = $('deployPlatform');
        if (sel) sel.addEventListener('change', () => { platform = sel.value; LS.set('ddDeployPlatform', platform); render(); });
        const md2 = $('deployDlMd2'); if (md2) md2.addEventListener('click', downloadMd);
        document.querySelectorAll('[data-save-img]').forEach(b => b.addEventListener('click', async () => { const meta = DD.images.find(i => i.id === b.dataset.saveImg), blob = await DD.idb.get('img:' + b.dataset.saveImg); if (blob) DD.download(String((meta && meta.file) || meta.id + '.png').split('/').pop(), blob); else alert('The original file is not stored in this browser.'); }));
    }
    function flash(btn, text) {
        const old = btn.innerHTML; btn.innerHTML = `<span class="material-symbols-outlined">done</span>${text}`; btn.classList.add('success');
        setTimeout(() => { btn.innerHTML = old; btn.classList.remove('success'); }, 1500);
    }
    function downloadMd() { if (window.downloadDisplayMarkdown) window.downloadDisplayMarkdown(); }
    function open() { render(); $('deployOverlay').classList.add('active'); document.body.style.overflow = 'hidden'; }
    function close() { $('deployOverlay').classList.remove('active'); document.body.style.overflow = ''; }

    $('deployBtn').addEventListener('click', open);
    $('deployClose').addEventListener('click', close);
    $('deployOverlay').addEventListener('click', e => { if (e.target === $('deployOverlay')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('deployOverlay').classList.contains('active')) close(); });
    document.querySelectorAll('.deploy-tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); $('deployBody').scrollTop = 0; }));
    $('deployDlMd').addEventListener('click', downloadMd);
    $('deployCopyYaml').addEventListener('click', e => {
        const btn = e.currentTarget, text = compose(platform).plain;
        if (!navigator.clipboard) { alert('Clipboard not available. Use the .yaml download instead.'); return; }
        navigator.clipboard.writeText(text).then(() => flash(btn, 'Copied!')).catch(() => alert('Copy failed.'));
    });
    $('deployDlYaml').addEventListener('click', () => {
        const blob = new Blob([compose(platform).plain], { type: 'text/yaml;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'display-design.yaml';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    window.openDeployGuide = open;
})();
