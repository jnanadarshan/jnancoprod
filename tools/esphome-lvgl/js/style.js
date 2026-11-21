// Style engine: resolves the effective LVGL style of a widget part in a given state.
// Precedence (ESPHome docs): state styles > local styles > style definitions > theme > top-level styles.
import { themeStyle, palette } from './theme.js';
import { TEXT_INHERITED } from './widgets.js';

const STATE_ORDER = ['checked', 'focused', 'focus_key', 'edited', 'scrolled', 'user_1', 'user_2', 'user_3', 'user_4', 'pressed', 'disabled'];
const STYLE_RE = /^(bg_|border_|text_|pad_|shadow_|outline_|arc_|line_|image_|transform_|translate_|margin_|recolor|radius$|opa$|opa_layered$|clip_corner$|blend_mode$|anim_duration$|color_filter_opa$)/;
export const isStyleKey = k => STYLE_RE.test(k) && k !== 'text';
const ALIAS = { shadow_ofs_x: 'shadow_offset_x', shadow_ofs_y: 'shadow_offset_y', transform_angle: 'transform_rotation', transform_zoom: 'transform_scale' };
const isTag = v => v && typeof v === 'object' && typeof v.tag === 'string' && v.tag[0] === '!';

const NAMED = { white: '#FFFFFF', black: '#000000', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', orange: '#FFA500', gray: '#808080', grey: '#808080' };

export function createStyleEngine(docOrGetter) {
    const D = () => (typeof docOrGetter === 'function' ? docOrGetter() : docOrGetter);
    const dark = () => { const d = D(); return !!(d.theme && d.theme.dark_mode); };

    function color(v, fallback) {
        if (v === undefined || v === null || v === '' || isTag(v)) return fallback;
        if (typeof v === 'number') return '#' + (v >>> 0).toString(16).padStart(6, '0').slice(-6).toUpperCase();
        const s = String(v).trim();
        let m = s.match(/^(?:0x|#)([0-9a-f]{6})$/i); if (m) return '#' + m[1].toUpperCase();
        m = s.match(/^(?:0x|#)([0-9a-f]{3})$/i); if (m) return '#' + m[1].split('').map(c => c + c).join('').toUpperCase();
        const c = (D().colors || []).find(x => x.id === s || `id(${x.id})` === s);
        if (c) return color(c.hex, fallback);
        if (NAMED[s.toLowerCase()]) return NAMED[s.toLowerCase()];
        if (/^[a-z]+$/i.test(s)) return s.toLowerCase(); // CSS colour name (canvas understands them)
        return fallback;
    }
    function opa(v, fallback = 1) {
        if (v === undefined || v === null || v === '' || isTag(v)) return fallback;
        if (typeof v === 'number') return v > 1 ? Math.max(0, Math.min(1, v / 255)) : Math.max(0, v);
        const s = String(v).trim().toUpperCase();
        if (s === 'TRANSP') return 0; if (s === 'COVER') return 1;
        const m = s.match(/^(\d+(?:\.\d+)?)%$/); if (m) return Math.max(0, Math.min(1, parseFloat(m[1]) / 100));
        const n = parseFloat(s); if (!isNaN(n)) return n > 1 ? n / 255 : n;
        return fallback;
    }
    function font(id) {
        const fid = String(id || 'montserrat_14');
        let m = fid.match(/^montserrat_(\d+)(_compressed)?$/);
        if (m) { const n = +m[1]; return { css: `500 ${n}px Montserrat, LVSymbols, sans-serif`, size: n, lh: Math.round(n * 1.18), known: true }; }
        m = fid.match(/^unscii_(\d+)$/); if (m) { const n = +m[1]; return { css: `${n}px "Courier New", monospace`, size: n, lh: n + 2, known: true }; }
        if (fid === 'simsun_16_cjk') return { css: '16px SimSun, "Noto Sans SC", sans-serif', size: 16, lh: 18, known: true };
        if (fid === 'dejavu_16_persian_hebrew') return { css: '16px "DejaVu Sans", sans-serif', size: 16, lh: 18, known: true };
        const f = (D().fonts || []).find(x => x.id === fid || `id(${x.id})` === fid);
        if (f) {
            const n = f.size || 14;
            const fam = f.kind === 'icons' ? '"Material Symbols Outlined"' : f.kind === 'gfonts' ? `"${f.family || 'Roboto'}"` : `"lvf_${f.id}", Roboto`;
            return { css: `${n}px ${fam}, LVSymbols, sans-serif`, size: n, lh: Math.round(n * 1.2), known: true, icons: f.kind === 'icons' };
        }
        return { css: '500 14px Montserrat, LVSymbols, sans-serif', size: 14, lh: 16, known: false };
    }

    const defs = () => D().styleDefs || [];
    function applyFlat(st, block) {
        if (!block || typeof block !== 'object') return;
        if (block.styles) [].concat(block.styles).forEach(id => { const d = defs().find(x => x.id === id); if (d) applyFlat(st, d); });
        const keys = Object.keys(block).filter(isStyleKey);
        // pad_all first so explicit sides win inside the same block
        keys.sort((a, b) => (a === 'pad_all' ? -1 : b === 'pad_all' ? 1 : 0));
        keys.forEach(k0 => {
            const v = block[k0]; if (isTag(v) || v === null || v === undefined) return;
            const k = ALIAS[k0] || k0;
            if (k === 'pad_all') { st.pad_top = st.pad_bottom = st.pad_left = st.pad_right = v; }
            st[k] = v; st._set = st._set || new Set(); st._set.add(k);
            if (k === 'pad_all') ['pad_top', 'pad_bottom', 'pad_left', 'pad_right'].forEach(s => st._set.add(s));
        });
    }
    function applyBlock(st, block, part, states) {
        if (!block || typeof block !== 'object') return;
        const src = part === 'main' ? block : block[part];
        if (!src || typeof src !== 'object') return;
        applyFlat(st, src);
        STATE_ORDER.forEach(s => { if (states && states.has(s) && src[s] && typeof src[s] === 'object') applyFlat(st, src[s]); });
    }

    // node: {type, props}; parent: resolved main style of the parent (for inherited text props)
    function resolve(node, part = 'main', states = null, parent = null) {
        const st = Object.create(null);
        const theme = themeStyle(node.type, part, states, dark());
        Object.assign(st, theme);
        const themeKeys = new Set(Object.keys(theme));
        st._set = new Set();
        const ov = D().theme && D().theme.overrides && D().theme.overrides[node.type];
        if (ov) applyBlock(st, ov, part, states);
        if (node.props && node.props.styles && part === 'main') applyFlat(st, { styles: node.props.styles });
        applyBlock(st, node.props, part, states);
        if (parent) TEXT_INHERITED.forEach(k => { if (!themeKeys.has(k) && !st._set.has(k) && parent[k] !== undefined) st[k] = parent[k]; });
        return st;
    }
    function screen(page, top) {
        const st = Object.create(null);
        Object.assign(st, themeStyle('screen', 'main', null, dark()));
        if (top) { if (top.default_font) st.text_font = top.default_font; TEXT_INHERITED.forEach(k => { if (top[k] !== undefined && !isTag(top[k])) st[k] = top[k]; }); }
        st._set = new Set();
        if (page && page.props) applyBlock(st, page.props, 'main', null);
        return st;
    }
    // numeric helpers with sane defaults
    const num = (v, d = 0) => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? parseFloat(v) : d);
    return { resolve, screen, color, opa, font, num, palette: () => palette(dark()), dark };
}
