// LVGL default theme (lv_theme_default), as ESPHome initialises it: primary = blue, secondary = red,
// light or dark mode, small-display metrics. Values are approximations of the C source so the preview
// looks like the device; any explicit style in the YAML overrides them.

const DPI = 130;                          // LV_DPI_DEF
export const dpx = n => n === 0 ? 0 : Math.max(1, Math.round(n * DPI / 160));

export function palette(dark) {
    return dark ? {
        primary: '#2196F3', secondary: '#F44336', scr: '#15171A', card: '#282B30', text: '#FAFAFA',
        grey: '#2F3237', border: '#45484D', muted: '#9E9E9E', shadow: '#000000', knob: '#FFFFFF', track: '#3A3D42'
    } : {
        primary: '#2196F3', secondary: '#F44336', scr: '#FFFFFF', card: '#FFFFFF', text: '#212121',
        grey: '#EEEEEE', border: '#E0E0E0', muted: '#9E9E9E', shadow: '#9E9E9E', knob: '#FFFFFF', track: '#DADADA'
    };
}

export const PAD_DEF = dpx(12), PAD_SMALL = dpx(10), PAD_TINY = dpx(2);
export const RADIUS = dpx(8), BORDER = dpx(2), OUTLINE = dpx(3), CIRCLE = 0x7FFF;

// type default sizes; numbers are px, strings are % or 'SIZE_CONTENT'
export const DEFAULT_SIZE = {
    obj: [dpx(200), dpx(120)], container: ['100%', '100%'], label: ['SIZE_CONTENT', 'SIZE_CONTENT'],
    button: ['SIZE_CONTENT', 'SIZE_CONTENT'], checkbox: ['SIZE_CONTENT', 'SIZE_CONTENT'],
    switch: [Math.round(4 * DPI / 10), Math.round(4 * DPI / 17)], slider: [DPI * 2, Math.round(DPI / 10)],
    bar: [DPI * 2, Math.round(DPI / 10)], arc: [DPI, DPI], spinner: [DPI, DPI], led: [Math.round(DPI / 5), Math.round(DPI / 5)],
    dropdown: [DPI * 1.2 | 0, 'SIZE_CONTENT'], roller: ['SIZE_CONTENT', 'SIZE_CONTENT'], textarea: [DPI * 2, DPI],
    spinbox: [DPI, 'SIZE_CONTENT'], image: ['SIZE_CONTENT', 'SIZE_CONTENT'], line: ['SIZE_CONTENT', 'SIZE_CONTENT'],
    qrcode: ['SIZE_CONTENT', 'SIZE_CONTENT'], buttonmatrix: [DPI * 2, DPI], keyboard: ['100%', '50%'], meter: [DPI * 2, DPI * 2],
    table: ['SIZE_CONTENT', 'SIZE_CONTENT'], tabview: ['100%', '100%'], tileview: ['100%', '100%'], list: [DPI * 2, DPI * 2],
    canvas: [100, 60], animimg: ['SIZE_CONTENT', 'SIZE_CONTENT'], menu: ['100%', '100%']
};

const card = p => ({ bg_color: p.card, bg_opa: 1, radius: RADIUS, border_width: BORDER, border_color: p.border, pad_all: PAD_DEF, text_color: p.text, pad_row: PAD_SMALL, pad_column: PAD_SMALL });
const transp = () => ({ bg_opa: 0, border_width: 0, radius: 0, pad_all: 0 });
const has = (s, k) => s && s.has(k);

// Returns the theme's style for (widget type, part, active states).
export function themeStyle(type, part, states, dark) {
    const p = palette(dark);
    const st = Object.create(null);
    const set = o => Object.assign(st, o);
    const pressedDarken = () => { if (has(states, 'pressed')) st._darken = 0.2; };
    part = part || 'main';
    if (type === 'screen') return set({ bg_color: p.scr, bg_opa: 1, text_color: p.text, text_font: 'montserrat_14', pad_all: 0 });
    if (part === 'scrollbar') return set({ bg_color: p.muted, bg_opa: 0.4, radius: CIRCLE, width: dpx(5) });

    switch (type) {
        case 'obj': case 'list': case 'tileview': case 'menu':
            if (part === 'main') set(card(p)); break;
        case 'container': case 'canvas': case 'image': case 'animimg': case 'qrcode':
            if (part === 'main') set(transp()); break;
        case 'label':
            if (part === 'main') set(transp());
            if (part === 'selected') set({ bg_color: p.primary, bg_opa: 0.3, text_color: p.text });
            break;
        case 'button':
            if (part === 'main') {
                set({ bg_color: p.primary, bg_opa: 1, radius: RADIUS, text_color: '#FFFFFF', pad_left: PAD_DEF, pad_right: PAD_DEF, pad_top: PAD_SMALL, pad_bottom: PAD_SMALL, border_width: 0 });
                if (!dark) set({ shadow_color: p.shadow, shadow_width: dpx(3), shadow_opa: 0.5, shadow_offset_y: dpx(4) });
                if (has(states, 'checked')) set({ bg_color: p.secondary });
                if (has(states, 'disabled')) set({ bg_color: p.grey, text_color: p.muted, shadow_width: 0 });
                pressedDarken();
            }
            break;
        case 'checkbox':
            if (part === 'main') set({ ...transp(), pad_column: dpx(10), text_color: p.text });
            if (part === 'indicator') {
                set({ bg_color: p.card, bg_opa: 1, border_width: BORDER, border_color: p.primary, radius: Math.round(RADIUS / 2), pad_all: dpx(3) });
                if (has(states, 'checked')) set({ bg_color: p.primary, text_color: '#FFFFFF' });
                pressedDarken();
            }
            break;
        case 'switch':
            if (part === 'main') set({ bg_color: p.track, bg_opa: 1, radius: CIRCLE, border_width: 0, pad_all: 0 });
            if (part === 'indicator') set({ bg_color: p.primary, bg_opa: has(states, 'checked') ? 1 : 0, radius: CIRCLE });
            if (part === 'knob') set({ bg_color: p.knob, bg_opa: 1, radius: CIRCLE, pad_all: -dpx(4), shadow_color: '#000000', shadow_opa: dark ? 0 : 0.18, shadow_width: dpx(4), shadow_offset_y: 1 });
            if (part === 'main') pressedDarken();
            break;
        case 'slider': case 'bar':
            if (part === 'main') set({ bg_color: p.primary, bg_opa: 0.2, radius: CIRCLE, border_width: 0, pad_all: 0 });
            if (part === 'indicator') set({ bg_color: p.primary, bg_opa: 1, radius: CIRCLE });
            if (part === 'knob' && type === 'slider') { set({ bg_color: p.primary, bg_opa: 1, radius: CIRCLE, pad_all: dpx(6), shadow_color: '#000000', shadow_opa: dark ? 0 : 0.2, shadow_width: dpx(4), shadow_offset_y: 1 }); pressedDarken(); }
            break;
        case 'arc': case 'spinner':
            if (part === 'main') set({ arc_color: p.track, arc_width: dpx(15), arc_rounded: true, arc_opa: 1, bg_opa: 0, border_width: 0, pad_all: dpx(4) });
            if (part === 'indicator') set({ arc_color: p.primary, arc_width: dpx(15), arc_rounded: true, arc_opa: 1 });
            if (part === 'knob' && type === 'arc') { set({ bg_color: p.primary, bg_opa: 1, radius: CIRCLE, pad_all: dpx(4) }); pressedDarken(); }
            break;
        case 'dropdown':
            if (part === 'main') { set({ ...card(p), pad_all: PAD_SMALL }); pressedDarken(); }
            if (part === 'indicator') set({ text_color: p.text });
            break;
        case 'roller':
            if (part === 'main') set({ ...card(p), pad_all: PAD_SMALL, text_align: 'CENTER', text_line_space: dpx(8) });
            if (part === 'selected') set({ bg_color: p.primary, bg_opa: 1, text_color: '#FFFFFF' });
            break;
        case 'textarea': case 'spinbox':
            if (part === 'main') { set({ ...card(p), pad_all: PAD_SMALL }); if (has(states, 'focused')) set({ border_color: p.primary }); }
            if (part === 'cursor') set({ border_color: p.primary, border_width: dpx(2), bg_color: p.primary, bg_opa: type === 'spinbox' ? 1 : 0 });
            if (part === 'textarea_placeholder') set({ text_color: p.muted });
            break;
        case 'led':
            if (part === 'main') set({ bg_color: p.primary, bg_opa: 1, radius: CIRCLE, border_width: 0, shadow_width: dpx(15), shadow_spread: dpx(5), shadow_opa: 1 });
            break;
        case 'line':
            if (part === 'main') set({ line_color: p.text, line_width: 1, line_opa: 1 });
            break;
        case 'buttonmatrix':
            if (part === 'main') set({ ...card(p), pad_all: PAD_TINY + 2, pad_row: dpx(6), pad_column: dpx(6) });
            if (part === 'items') {
                set({ bg_color: p.grey, bg_opa: 1, radius: RADIUS, text_color: p.text });
                if (has(states, 'checked')) set({ bg_color: p.primary, text_color: '#FFFFFF' });
                pressedDarken();
            }
            break;
        case 'keyboard':
            if (part === 'main') set({ bg_color: dark ? '#202226' : '#E0E0E0', bg_opa: 1, border_width: 0, radius: 0, pad_all: dpx(4), pad_row: dpx(4), pad_column: dpx(4) });
            if (part === 'items') { set({ bg_color: p.card, bg_opa: 1, radius: dpx(6), text_color: p.text, shadow_color: '#000000', shadow_opa: dark ? 0 : 0.15, shadow_width: 1, shadow_offset_y: 1 }); pressedDarken(); }
            break;
        case 'meter':
            if (part === 'main') set({ ...card(p), radius: CIRCLE, pad_all: dpx(10) });
            if (part === 'ticks') set({ text_color: p.text });
            if (part === 'indicator') set({ bg_color: p.text, bg_opa: 1, radius: CIRCLE });
            break;
        case 'table':
            if (part === 'main') set({ ...card(p), pad_all: 0, border_width: BORDER });
            if (part === 'items') set({ bg_opa: 0, border_width: 1, border_color: p.border, pad_all: PAD_SMALL, text_color: p.text });
            break;
        case 'tabview':
            if (part === 'main') set({ bg_color: p.scr, bg_opa: 1, radius: 0, border_width: 0, pad_all: 0 });
            break;
        default:
            if (part === 'main') set(card(p));
    }
    if (part === 'main' && has(states, 'focused') && ['button', 'slider', 'arc', 'dropdown', 'roller', 'checkbox', 'switch'].includes(type)) {
        set({ outline_width: OUTLINE, outline_color: p.primary, outline_opa: 0.5, outline_pad: dpx(2) });
    }
    return st;
}
