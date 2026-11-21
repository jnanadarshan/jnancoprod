// Dialogs: import, live YAML, deploy guide, help, markdown export.
import { app, engine, loadDoc, exportYaml, importYaml, makeRenderer, walk, allNodes, LS } from './app.js';
import { lvglObject, fontYaml, imageYaml, colorYaml, dump, fromNodes } from './yaml.js';
import { h, icon, modal, toast, download, copyText, esc } from './ui.js';
import { SAMPLES } from './samples.js';

const mkCanvas = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
const EXAMPLE = `# A two-page thermostat with an image background
display:
  - platform: ili9xxx
    model: ILI9341
    rotation: 90

color:
  - id: accent
    hex: "FF7043"

font:
  - file: "gfonts://Roboto"
    id: big_font
    size: 44
    bpp: 4

lvgl:
  theme:
    button:
      radius: 12
  style_definitions:
    - id: card
      bg_color: 0x1E293B
      bg_opa: 90%
      radius: 16
      border_width: 0
      text_color: 0xF1F5F9
      shadow_width: 18
      shadow_opa: 40%
  pages:
    - id: home
      bg_color: 0x0F172A
      bg_grad_color: 0x334155
      bg_grad_dir: VER
      text_color: 0xE2E8F0
      widgets:
        - obj:
            styles: card
            align: CENTER
            width: 260
            height: 170
            widgets:
              - label:
                  align: TOP_MID
                  text: "Living room"
              - label:
                  id: temp
                  align: CENTER
                  text: "21.5°"
                  text_font: big_font
              - bar:
                  align: BOTTOM_MID
                  width: 200
                  height: 8
                  value: 64
                  indicator:
                    bg_color: accent
        - button:
            align: BOTTOM_RIGHT
            x: -12
            y: -12
            text: "\\uF013"
            bg_color: accent
            on_click:
              then:
                - lvgl.page.next:
    - id: settings
      layout:
        type: flex
        flex_flow: COLUMN
        flex_align_main: CENTER
        flex_align_cross: CENTER
        pad_row: 12
      widgets:
        - label:
            text: "Settings"
            text_font: montserrat_20
        - switch:
            state:
              checked: true
        - slider:
            width: 200
            value: 40
        - button:
            text: "\\uF053 Back"
            on_click:
              then:
                - lvgl.page.previous:
`;

// ---------------------------------------------------------------- import
export function openImport() {
    const ta = h('textarea', { class: 'code imp', spellcheck: 'false', placeholder: 'Paste your ESPHome YAML (the whole file or just the lvgl: block)...' });
    const file = h('input', { type: 'file', accept: '.yaml,.yml,.txt', hidden: true });
    const prev = mkCanvas(320, 240); prev.className = 'imp-prev';
    const info = h('div', { class: 'imp-info' });
    let parsed = null;
    const go = h('button', { class: 'btn primary', disabled: true, onclick: () => { if (!parsed) return; loadDoc(parsed.doc); m.close(); toast(`Imported ${parsed.count} widget${parsed.count === 1 ? '' : 's'} on ${parsed.doc.pages.length} page${parsed.doc.pages.length === 1 ? '' : 's'}.`, 'Undo', () => app.history.undo()); } }, icon('download_done'), 'Open in editor');
    const run = () => {
        const text = ta.value; info.innerHTML = ''; parsed = null; go.disabled = true;
        if (!text.trim()) return;
        try {
            const r = importYaml(text, [app.doc.display.width, app.doc.display.height]);
            let count = 0; r.doc.pages.forEach(p => walk(p.widgets, () => count++));
            parsed = { ...r, count }; go.disabled = false;
            const types = {}; r.doc.pages.forEach(p => walk(p.widgets, n => { types[n.type] = (types[n.type] || 0) + 1; }));
            info.append(h('div', { class: 'chips' }, h('span', { class: 'chip' }, `${r.doc.display.width}\u00d7${r.doc.display.height}${r.display ? '' : ' (size not in file)'}`), h('span', { class: 'chip' }, `${r.doc.pages.length} page(s)`), h('span', { class: 'chip' }, `${count} widgets`), r.doc.fonts.length ? h('span', { class: 'chip' }, `${r.doc.fonts.length} font(s)`) : null, r.doc.images.length ? h('span', { class: 'chip' }, `${r.doc.images.length} image(s)`) : null, r.doc.styleDefs.length ? h('span', { class: 'chip' }, `${r.doc.styleDefs.length} style(s)`) : null),
                h('p', { class: 'hint' }, Object.entries(types).map(([t, c]) => `${t} \u00d7${c}`).join(', ')),
                ...r.warnings.map(w => h('p', { class: 'hint warn' }, icon('warning'), w)));
            // preview with the real renderer
            const R = makeRenderer(mkCanvas), W = r.doc.display.width, H = r.doc.display.height, s = Math.min(2, 340 / Math.max(W, H));
            prev.width = Math.round(W * s); prev.height = Math.round(H * s);
            const ctx = prev.getContext('2d'); ctx.setTransform(s, 0, 0, s, 0, 0);
            const saved = app.doc; app.doc = r.doc; try { R.render(ctx, r.doc, r.doc.pages[0], W, H, { scale: s }); } finally { app.doc = saved; }
        } catch (e) { info.append(h('p', { class: 'hint bad' }, icon('error'), (e.mark ? `Line ${e.mark.line + 1}: ` : '') + (e.reason || e.message))); }
    };
    let t; ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 300); });
    file.addEventListener('change', () => { const f = file.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { ta.value = rd.result; run(); }; rd.readAsText(f); });
    const m = modal({
        title: 'Import ESPHome YAML', iconName: 'file_upload', wide: true,
        body: h('div', { class: 'imp-grid' }, h('div', null, ta, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => file.click() }, icon('upload_file'), 'Choose file'), h('button', { class: 'btn sm', onclick: () => { ta.value = EXAMPLE; run(); } }, icon('auto_awesome'), 'Load example'), file)),
            h('div', null, h('div', { class: 'imp-prev-wrap' }, prev), info)),
        foot: [h('span', { class: 'grow hint' }, 'Replaces the current design. Undo brings it back. Everything the editor does not understand is kept and exported again.'), go]
    });
}

// ---------------------------------------------------------------- live YAML
export function openYaml() {
    const pre = h('textarea', { class: 'code big', spellcheck: 'false' });
    const refresh = () => { pre.value = exportYaml(app.doc); };
    refresh();
    let editing = false;
    const msg = h('span', { class: 'msg' });
    const editBtn = h('button', { class: 'btn', onclick: () => { editing = !editing; pre.readOnly = !editing; editBtn.innerHTML = ''; editBtn.append(icon(editing ? 'close' : 'edit'), editing ? 'Cancel edit' : 'Edit'); applyBtn.hidden = !editing; if (!editing) refresh(); } }, icon('edit'), 'Edit');
    const applyBtn = h('button', { class: 'btn primary', hidden: true, onclick: () => { try { const r = importYaml(pre.value, [app.doc.display.width, app.doc.display.height]); loadDoc(r.doc); msg.textContent = 'Applied.'; msg.className = 'msg ok'; } catch (e) { msg.textContent = (e.mark ? `Line ${e.mark.line + 1}: ` : '') + (e.reason || e.message); msg.className = 'msg bad'; } } }, icon('check'), 'Apply');
    pre.readOnly = true;
    modal({ title: 'Generated YAML', iconName: 'code', wide: true, tall: true, body: h('div', { class: 'yaml-modal' }, h('p', { class: 'hint' }, 'The ', h('code', null, 'color:'), ', ', h('code', null, 'font:'), ', ', h('code', null, 'image:'), ' and ', h('code', null, 'lvgl:'), ' blocks for your design. Add them to your device YAML; see Deploy for a complete file.'), pre),
        foot: [msg, h('span', { class: 'grow' }), editBtn, applyBtn, h('button', { class: 'btn', onclick: () => download('lvgl-design.yaml', pre.value, 'text/yaml') }, icon('download'), '.yaml'), h('button', { class: 'btn primary', onclick: () => copyText(pre.value) }, icon('content_copy'), 'Copy')] });
}

// ---------------------------------------------------------------- deploy
const PRESETS = {
    ili_xpt: { label: 'ILI9341 SPI + XPT2046 resistive touch (shared SPI bus)', bus: 'spi:\n  clk_pin: GPIO18\n  mosi_pin: GPIO23\n  miso_pin: GPIO19\n', display: 'display:\n  - platform: ili9xxx\n    id: my_display\n    model: ILI9341\n    cs_pin: GPIO5\n    dc_pin: GPIO27\n    reset_pin: GPIO33\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n', touch: 'touchscreen:\n  - platform: xpt2046\n    id: my_touch\n    cs_pin: GPIO4\n    interrupt_pin: GPIO36\n    update_interval: 50ms\n' },
    st7789_cst: { label: 'ST7789 SPI + CST816 capacitive touch (I2C)', bus: 'spi:\n  clk_pin: GPIO18\n  mosi_pin: GPIO23\ni2c:\n  sda: GPIO21\n  scl: GPIO22\n', display: 'display:\n  - platform: mipi_spi\n    id: my_display\n    model: ST7789V\n    cs_pin: GPIO5\n    dc_pin: GPIO16\n    reset_pin: GPIO17\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n', touch: 'touchscreen:\n  - platform: cst816\n    id: my_touch\n' },
    rgb_s3: { label: 'ESP32-S3 RGB parallel panel + GT911 (e.g. 4.3"/7")', bus: 'psram:\n  mode: octal\n  speed: 80MHz\ni2c:\n  sda: GPIO19\n  scl: GPIO20\n', display: 'display:\n  - platform: rpi_dpi_rgb   # or mipi_rgb: check your board\n    id: my_display\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n    # ...data pins, timings and dimensions from your board\'s example...\n', touch: 'touchscreen:\n  - platform: gt911\n    id: my_touch\n' },
    other: { label: 'Other / my display already works', bus: '', display: 'display:\n  - platform: YOUR_PLATFORM\n    id: my_display\n    auto_clear_enabled: false   # required by LVGL\n    update_interval: never\n    # ...your existing options...\n', touch: '# touchscreen: add yours and keep its id\n' }
};
function compose(key) {
    const P = PRESETS[key] || PRESETS.ili_xpt, seg = [], d = app.doc;
    const touch = P.touch && !/^#/.test(P.touch);
    seg.push({ k: 'your', label: 'Your device', t: 'esphome:\n  name: my-display\n# esp32: / wifi: / api: / ota: ...  keep what you have\n' });
    if (d.colors.length) seg.push({ k: 'asset', label: 'Colours', t: colorYaml(d) });
    if (d.fonts.length) seg.push({ k: 'asset', label: 'Fonts', t: fontYaml(d) });
    if (d.images.length) seg.push({ k: 'asset', label: 'Images', t: imageYaml(d) });
    if (P.bus) seg.push({ k: 'your', label: 'Bus & memory (check pins)', t: P.bus });
    seg.push({ k: 'your', label: 'Display', t: P.display });
    if (P.touch) seg.push({ k: 'your', label: 'Touch', t: P.touch });
    const lv = lvglObject(d), extra = {};
    if (!('buffer_size' in lv)) extra.buffer_size = '25%';
    if (touch && !lv.touchscreens) extra.touchscreens = ['my_touch'];
    seg.push({ k: 'lvgl', label: 'LVGL (from the designer)', t: dump({ lvgl: { ...extra, ...lv } }) });
    return { seg, plain: seg.map(s => s.t.replace(/\n$/, '')).join('\n\n') + '\n' };
}
export function openDeploy() {
    let preset = LS.get('lvglStudio.preset', 'ili_xpt'); if (!PRESETS[preset]) preset = 'ili_xpt';
    const body = h('div', { class: 'deploy' });
    const render = () => {
        const d = app.doc, { seg } = compose(preset); let count = 0; d.pages.forEach(p => walk(p.widgets, () => count++));
        const files = [...d.fonts.filter(f => f.kind !== 'gfonts').map(f => f.file || `fonts/${f.id}.ttf`), ...d.images.map(i => i.file || `images/${i.id}.png`)];
        const tree = files.length ? 'esphome/                 \u2190 your ESPHome config folder\n\u251c\u2500 my-display.yaml\n' + files.map((f, i) => `${i === files.length - 1 ? '\u2514' : '\u251c'}\u2500 ${f}`).join('\n') : '';
        body.innerHTML = '';
        body.append(
            step(0, 'Before you start', h('ul', null, h('li', null, 'ESPHome 2025 or newer (', h('a', { href: 'https://esphome.io/guides/getting_started_hassio/', target: '_blank', rel: 'noopener' }, 'Home Assistant add-on'), ' or ', h('a', { href: 'https://esphome.io/guides/getting_started_command_line/', target: '_blank', rel: 'noopener' }, 'command line'), ').'),
                h('li', null, `Your design: ${d.display.width}\u00d7${d.display.height}, ${d.pages.length} page(s), ${count} widget(s)${d.theme.dark_mode ? ', dark theme' : ''}.`),
                h('li', null, 'Large screens and images need PSRAM. Without it keep ', h('code', null, 'buffer_size'), ' at 25% or lower.'))),
            step(1, 'Files next to your YAML', files.length ? [h('p', null, 'Copy these files into your ESPHome config folder (Home Assistant: ', h('code', null, '/config/esphome/'), '). Images are converted at compile time; the preview here already shows the result of type, resize and transparency.'), h('pre', { class: 'tree' }, tree), ...d.images.filter(i => app.rawImages.has(i.id)).map(i => h('button', { class: 'btn sm', onclick: () => saveImage(i) }, icon('download'), i.file || i.id))] : h('p', null, 'Nothing to copy: you only use built-in fonts and no images', d.fonts.some(f => f.kind === 'gfonts') ? ' (Google Fonts are downloaded by ESPHome)' : '', '.')),
            step(2, 'Put the code in your YAML', [h('label', { class: 'field inline' }, h('span', { class: 'f-label' }, 'Hardware'), (() => { const s = h('select', null, ...Object.entries(PRESETS).map(([k, v]) => h('option', { value: k, selected: k === preset ? true : undefined }, v.label))); s.addEventListener('change', () => { preset = s.value; LS.set('lvglStudio.preset', preset); render(); }); return s; })()),
                h('div', { class: 'legend' }, h('span', { class: 'lg lg-lvgl' }, 'Designer output'), h('span', { class: 'lg lg-asset' }, 'Assets'), h('span', { class: 'lg lg-your' }, 'Yours (adjust)')),
                h('div', { class: 'yaml-segs' }, ...seg.map(s => h('div', { class: 'seg seg-' + s.k, 'data-label': s.label }, s.t.replace(/\n$/, '')))),
                h('ul', null, h('li', null, h('b', null, 'auto_clear_enabled: false'), ' on the display is required: LVGL replaces the display lambda.'), h('li', null, 'Pins and models are examples; keep your working display settings.'), h('li', null, 'Events you added (', h('code', null, 'on_click'), '\u2026) are included. Add more in the widget YAML tab.'))]),
            step(3, 'Compile and flash', h('ul', null, h('li', null, 'Home Assistant: open the device, press ', h('b', null, 'Install'), '.'), h('li', null, 'Command line: ', h('code', null, 'esphome run my-display.yaml')), h('li', null, 'The first LVGL build takes several minutes.'))),
            step(4, 'Troubleshooting', h('table', { class: 'dtable' }, h('tbody', null, ...[
                ['Error about auto_clear_enabled', 'Add auto_clear_enabled: false to the display.'],
                ['Couldn\'t find ID (font / image / color)', 'The id must exist in font:, image: or color:, or be a built-in montserrat_N font.'],
                ['Image looks wrong or missing', 'LVGL needs type: RGB565. Use transparency: alpha_channel for PNG transparency.'],
                ['Icons show as boxes', 'Icon fonts need the characters listed in glyphs:.'],
                ['Out of memory / reboot loop', 'Lower buffer_size, resize images, use fewer fonts, or use a board with PSRAM.'],
                ['Touch does nothing', 'List your touch id under lvgl: touchscreens:. Resistive panels may need calibration.']
            ].map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b)))))),
            step(5, 'Keep a copy', [h('p', null, 'The Markdown export describes every page with a sketch, a widget table, the YAML and a JSON spec an AI assistant can work with.'), h('button', { class: 'btn primary', onclick: exportMd }, icon('description'), 'Export .md')]));
    };
    render();
    modal({ title: 'Deploy to ESPHome', iconName: 'rocket_launch', wide: true, tall: true, body, foot: [h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => download('lvgl-device.yaml', compose(preset).plain, 'text/yaml') }, icon('download'), '.yaml'), h('button', { class: 'btn primary', onclick: () => copyText(compose(preset).plain) }, icon('content_copy'), 'Copy full YAML')] });
}
function step(n, title, content) { return h('section', { class: 'step' }, h('div', { class: 'step-n' }, String(n)), h('div', { class: 'step-c' }, h('h3', null, title), ...[].concat(content))); }
async function saveImage(meta) { const b = await app.idb.get('img:' + meta.id); if (b) download(String(meta.file || meta.id + '.png').split('/').pop(), b); }

// ---------------------------------------------------------------- markdown export
export function buildMarkdown() {
    const d = app.doc, out = [], W = d.display.width, H = d.display.height, now = new Date().toISOString().slice(0, 10);
    let count = 0; d.pages.forEach(p => walk(p.widgets, () => count++));
    out.push('# ESPHome LVGL Design', '', `> Exported from **LVGL Studio by JDNx Tools** on ${now}: description, a sketch of every page, the ESPHome YAML and a machine-readable spec.`, '');
    out.push('## 1. Overview', '', `A **${W} x ${H} px** LVGL UI with **${d.pages.length}** page(s) and **${count}** widget(s), ${d.theme.dark_mode ? 'dark' : 'light'} theme.`, '',
        '| Property | Value |', '|---|---|', `| Screen | ${W} x ${H} px |`, `| Pages | ${d.pages.map(p => '`' + p.id + '`').join(', ')} |`, `| Fonts | ${d.fonts.map(f => '`' + f.id + '`').join(', ') || 'built-in only'} |`, `| Images | ${d.images.map(i => '`' + i.id + '`').join(', ') || 'none'} |`, `| Styles | ${d.styleDefs.map(s => '`' + s.id + '`').join(', ') || 'none'} |`, '');
    out.push('## 2. Pages', '');
    d.pages.forEach(p => {
        out.push(`### \`${p.id}\``, '');
        const rows = []; walk(p.widgets, (n, parent) => rows.push({ n, depth: depthOf(p.widgets, n) }));
        if (!rows.length) { out.push('_Empty._', ''); return; }
        out.push('```text', ascii(p, W, H), '```', '', '| Widget | ID | Position | Size | Notes |', '|---|---|---|---|---|');
        rows.forEach(({ n, depth }) => { const pr = n.props; out.push(`| ${'\u00a0\u00a0'.repeat(depth)}${n.type} | ${pr.id ? '`' + pr.id + '`' : ''} | ${pr.align || ''} ${pr.x ?? 0},${pr.y ?? 0} | ${pr.width ?? 'auto'} x ${pr.height ?? 'auto'} | ${String(pr.text ?? '').replace(/\|/g, '\\|').slice(0, 40)} |`); });
        out.push('');
    });
    out.push('## 3. ESPHome YAML', '', '```yaml', exportYaml(d).trimEnd(), '```', '');
    out.push('## 4. Agent section', '', '- The YAML above is the source of truth. Widget ids are unique across pages.', '- Coordinates are relative to the parent\'s content area; `align` sets the anchor, `x`/`y` offset it.', '- `text_font` is a built-in `montserrat_N` font or a `font:` id; images are referenced by `image:` id via `src` or `bg_image_src`.', '- Keep `auto_clear_enabled: false` on the display.', '');
    return out.join('\n');
}
function depthOf(list, target, d = 0) { for (const n of list) { if (n === target) return d; const r = depthOf(n.children || [], target, d + 1); if (r >= 0) return r; } return -1; }
function ascii(page, W, H) {
    const cols = Math.min(72, Math.max(24, Math.round(W / 5))), sx = cols / W, rows = Math.max(8, Math.round(H * sx / 2)), sy = rows / H;
    const g = Array.from({ length: rows }, () => Array(cols).fill(' '));
    const put = (c, r, ch) => { if (r >= 0 && r < rows && c >= 0 && c < cols) g[r][c] = ch; };
    let i = 0;
    walk(page.widgets, n => {
        const r = n._r; if (!r) return; i++;
        const c0 = Math.round(r.x * sx), r0 = Math.round(r.y * sy), c1 = Math.max(c0 + 2, Math.round((r.x + r.w) * sx) - 1), r1 = Math.max(r0, Math.round((r.y + r.h) * sy) - 1);
        for (let c = c0; c <= c1; c++) { put(c, r0, '-'); put(c, r1, '-'); } for (let y = r0; y <= r1; y++) { put(c0, y, '|'); put(c1, y, '|'); }
        const tag = `${i}:${n.type}`; for (let k = 0; k < tag.length && c0 + 1 + k < c1; k++) put(c0 + 1 + k, r0, tag[k]);
    });
    const f = '+' + '-'.repeat(cols) + '+'; return [f, ...g.map(r => '|' + r.join('') + '|'), f].join('\n');
}
export function exportMd() { download('lvgl-design.md', buildMarkdown(), 'text/markdown'); }

// ---------------------------------------------------------------- help
export function openHelp() {
    const kb = (...k) => h('span', { class: 'kbd' }, ...k.map((x, i) => [i ? '+' : '', h('kbd', null, x)]).flat());
    modal({ title: 'Help \u2014 LVGL Studio', iconName: 'help', wide: true, tall: true, body: h('div', { class: 'help' },
        h('p', { class: 'lead' }, 'Design ESPHome LVGL screens visually with the LVGL default theme, real layouts, styles, images and fonts, then copy the YAML. Runs offline once installed.'),
        h('h3', null, 'Quick start'),
        h('ol', { class: 'steps' },
            h('li', null, h('b', null, 'Pick the screen size'), ' in the bar under the canvas.'),
            h('li', null, h('b', null, 'Add widgets'), ' from the left panel: drag onto the screen, or click. Drop onto a container (Object, Button, List) to nest it.'),
            h('li', null, h('b', null, 'Arrange'), ': drag to move, handles to resize, double-click text to edit. Alignment guides snap to edges and centres; hold ', h('kbd', null, 'Alt'), ' to move freely.'),
            h('li', null, h('b', null, 'Style'), ' in the right panel: per part (main, indicator, knob\u2026) and state (pressed, checked\u2026). Reuse looks with Styles and the Theme in Assets.'),
            h('li', null, h('b', null, 'Try it'), ' in ', h('b', null, 'Interact'), ' mode: press buttons, drag sliders and arcs, open dropdowns, follow page actions.'),
            h('li', null, h('b', null, 'Deploy'), ' gives a complete device YAML for your hardware.')),
        h('h3', null, 'What the preview shows'),
        h('ul', null,
            h('li', null, 'LVGL\'s default theme (light or ', h('code', null, 'dark_mode'), '), its sizes, radii, shadows, knobs and states.'),
            h('li', null, h('b', null, 'Pixel'), ' view draws at device resolution; ', h('b', null, 'RGB565'), ' adds the 16-bit colour banding of the panel. ', h('b', null, 'HD'), ' is smooth for design work.'),
            h('li', null, 'Layouts are live: ', h('code', null, 'align'), ', ', h('code', null, 'align_to'), ', % and ', h('code', null, 'SIZE_CONTENT'), ' sizes, flex and grid behave like on the device.'),
            h('li', null, 'Images are shown after ESPHome\'s conversion (type, resize, transparency).'),
            h('li', null, 'Fonts are close but not identical: the device renders its own bitmaps.')),
        h('h3', null, 'Keyboard'),
        h('table', { class: 'dtable' }, h('tbody', null, ...[
            [kb('Ctrl', 'Z'), 'Undo'], [kb('Ctrl', 'Y'), 'Redo'], [kb('Ctrl', 'C'), 'Copy widget (also as YAML)'], [kb('Ctrl', 'V'), 'Paste'], [kb('Ctrl', 'D'), 'Duplicate'],
            [kb('Del'), 'Delete'], [kb('\u2190\u2191\u2192\u2193'), 'Nudge 1 px (Shift: 10 px)'], [kb('[', ']'), 'Send backward / bring forward'], [kb('Esc'), 'Select parent'], [kb('Alt'), 'click: select parent \u00b7 drag: no snapping'],
            [kb('Ctrl', '+ / \u2212 / 0'), 'Zoom in / out / fit'], [kb('Ctrl', 'wheel'), 'Zoom']
        ].map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b))))),
        h('h3', null, 'Good to know'),
        h('ul', null,
            h('li', null, 'Everything autosaves in this browser (images in IndexedDB). Export .md or .yaml for a portable copy.'),
            h('li', null, 'Imported YAML is kept losslessly: events, lambdas, ', h('code', null, '!secret'), ' and unknown options are written back.'),
            h('li', null, 'Tabs, tiles, button-matrix rows, tables and meter scales are edited in the widget\'s YAML tab.'),
            h('li', null, 'Install the app (address bar icon, or the Install button) to use it offline.'),
            h('li', null, 'Not sure where to start? Open ', h('b', null, 'Samples'), ' in the top bar for finished designs to build on.'),
            h('li', null, 'The previous designer is still at ', h('a', { href: 'legacy/' }, 'legacy/'), '.'))) });
}
export { compose as composeDeploy };

// ---------------------------------------------------------------- samples gallery
export function openSamples(opts = {}) {
    const grid = h('div', { class: 'samples' });
    const m = modal({ title: 'Samples', iconName: 'auto_awesome', wide: true, tall: true,
        body: h('div', null, h('p', { class: 'lead' }, opts.welcome ? 'Welcome! Start from one of these designs and change anything, or close this to keep the current design. Each sample is plain ESPHome YAML.' : 'Start from a finished design and build on top of it. Each sample is plain ESPHome YAML, so it is also an example of how to write it.'), grid),
        foot: [h('span', { class: 'grow hint' }, 'Opening a sample replaces the current design. Undo brings it back.'), h('button', { class: 'btn', onclick: () => { m.close(); openImport(); } }, icon('file_upload'), 'Import my own YAML')] });
    SAMPLES.forEach(sm => {
        let parsed = null;
        try { parsed = importYaml(sm.yaml); } catch (e) { console.error('sample', sm.id, e); return; }
        const d = parsed.doc, W = d.display.width, H = d.display.height, s = Math.min(260 / W, 170 / H);
        const c = mkCanvas(Math.round(W * s), Math.round(H * s)); c.className = 'sample-prev';
        const R = makeRenderer(mkCanvas), ctx = c.getContext('2d'); ctx.setTransform(s, 0, 0, s, 0, 0);
        const saved = app.doc; app.doc = d; try { R.render(ctx, d, d.pages[0], W, H, { scale: s }); } catch (e) { console.error(e); } finally { app.doc = saved; }
        let n = 0; d.pages.forEach(p => walk(p.widgets, () => n++));
        const open = () => { loadDoc(importYaml(sm.yaml).doc); m.close(); app.fit && app.fit(); toast(`Opened <b>${esc(sm.title)}</b>. Select anything to edit it.`, 'Undo', () => app.history.undo()); };
        const card = h('div', { class: 'sample-card' },
            h('button', { class: 'sample-thumb', title: 'Open ' + sm.title, onclick: open }, c),
            h('div', { class: 'sample-info' },
                h('div', { class: 'sample-title' }, h('b', null, sm.title), h('small', null, `${sm.size} \u00b7 ${d.pages.length} page${d.pages.length === 1 ? '' : 's'} \u00b7 ${n} widgets`)),
                h('p', null, sm.desc),
                h('div', { class: 'chips' }, ...sm.tags.map(t => h('span', { class: 'chip' }, t))),
                h('div', { class: 'row' }, h('button', { class: 'btn primary sm', onclick: open }, icon('open_in_new'), 'Open'), h('button', { class: 'btn sm', onclick: () => yamlView(sm) }, icon('code'), 'View YAML'))));
        grid.append(card);
    });
}
function yamlView(sm) {
    const ta = h('textarea', { class: 'code big', spellcheck: 'false', readonly: true }); ta.value = sm.yaml;
    modal({ title: sm.title + ' \u2014 YAML', iconName: 'code', wide: true, body: ta, foot: [h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: () => download(sm.id + '.yaml', sm.yaml, 'text/yaml') }, icon('download'), '.yaml'), h('button', { class: 'btn primary', onclick: () => copyText(sm.yaml) }, icon('content_copy'), 'Copy')] });
}
