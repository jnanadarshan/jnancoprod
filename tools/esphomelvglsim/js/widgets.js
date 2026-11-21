// Widget catalog: what each ESPHome LVGL widget is called, its parts, editable properties and default size.
// Property field types: num, int, text, textarea, bool, enum, options (one per line), points, image, color, font, pct.

export const STATES = ['default', 'checked', 'pressed', 'focused', 'disabled', 'edited', 'focus_key', 'scrolled', 'user_1', 'user_2', 'user_3', 'user_4'];
export const PARTS_ALL = ['main', 'scrollbar', 'indicator', 'knob', 'selected', 'items', 'ticks', 'cursor', 'textarea_placeholder'];
export const ALIGNS = ['TOP_LEFT', 'TOP_MID', 'TOP_RIGHT', 'LEFT_MID', 'CENTER', 'RIGHT_MID', 'BOTTOM_LEFT', 'BOTTOM_MID', 'BOTTOM_RIGHT'];
export const OUT_ALIGNS = ['OUT_TOP_LEFT', 'OUT_TOP_MID', 'OUT_TOP_RIGHT', 'OUT_BOTTOM_LEFT', 'OUT_BOTTOM_MID', 'OUT_BOTTOM_RIGHT', 'OUT_LEFT_TOP', 'OUT_LEFT_MID', 'OUT_LEFT_BOTTOM', 'OUT_RIGHT_TOP', 'OUT_RIGHT_MID', 'OUT_RIGHT_BOTTOM'];
export const FLAGS = ['hidden', 'clickable', 'checkable', 'scrollable', 'floating', 'ignore_layout', 'overflow_visible', 'press_lock', 'scroll_on_focus', 'adv_hittest'];

const BAR_MODES = ['NORMAL', 'RANGE', 'SYMMETRICAL'];

// Each entry: label, icon (Material Icons Outlined), group, parts, container (may hold child widgets),
// insert: props added when created from the toolbox, props: editable fields.
export const WIDGETS = {
    label: {
        label: 'Label', icon: 'text_fields', group: 'Basic', parts: ['main', 'selected', 'scrollbar'],
        insert: () => ({ text: 'Label' }),
        props: [['text', 'textarea'], ['long_mode', 'enum', ['WRAP', 'DOT', 'SCROLL', 'SCROLL_CIRCULAR', 'CLIP']], ['recolor', 'bool']]
    },
    button: {
        label: 'Button', icon: 'smart_button', group: 'Basic', parts: ['main'], container: true,
        insert: () => ({ text: 'Button' }),
        props: [['text', 'text'], ['checkable', 'bool']]
    },
    obj: {
        label: 'Object (card)', icon: 'crop_square', group: 'Layout', parts: ['main', 'scrollbar'], container: true,
        insert: (d) => ({ width: Math.round(d.w * 0.6), height: Math.round(d.h * 0.35) }), props: []
    },
    container: {
        label: 'Container', icon: 'select_all', group: 'Layout', parts: ['main', 'scrollbar'], container: true,
        insert: (d) => ({ width: Math.round(d.w * 0.6), height: Math.round(d.h * 0.35) }), props: []
    },
    image: {
        label: 'Image', icon: 'image', group: 'Basic', parts: ['main'],
        insert: () => ({ src: '' }),
        props: [['src', 'image'], ['scale', 'num'], ['rotation', 'num'], ['offset_x', 'int'], ['offset_y', 'int'], ['pivot_x', 'int'], ['pivot_y', 'int'], ['antialias', 'bool']]
    },
    line: {
        label: 'Line', icon: 'show_chart', group: 'Basic', parts: ['main'],
        insert: () => ({ points: ['0, 0', '60, 30', '120, 0'], line_width: 3, line_color: '0x2196F3', line_rounded: true }),
        props: [['points', 'points']]
    },
    led: {
        label: 'LED', icon: 'lightbulb', group: 'Basic', parts: ['main'],
        insert: () => ({ color: '0x4CAF50', brightness: '100%' }),
        props: [['color', 'color'], ['brightness', 'pct']]
    },
    qrcode: {
        label: 'QR code', icon: 'qr_code_2', group: 'Basic', parts: ['main'],
        insert: () => ({ text: 'esphome.io', size: 100 }),
        props: [['text', 'text'], ['size', 'int'], ['light_color', 'color'], ['dark_color', 'color']]
    },
    switch: {
        label: 'Switch', icon: 'toggle_on', group: 'Input', parts: ['main', 'indicator', 'knob'],
        insert: () => ({}), props: []
    },
    checkbox: {
        label: 'Checkbox', icon: 'check_box', group: 'Input', parts: ['main', 'indicator'],
        insert: () => ({ text: 'Checkbox' }), props: [['text', 'text']]
    },
    slider: {
        label: 'Slider', icon: 'tune', group: 'Input', parts: ['main', 'indicator', 'knob'],
        insert: (d) => ({ width: Math.round(Math.min(220, d.w * 0.7)), value: 40 }),
        props: [['value', 'int'], ['min_value', 'int'], ['max_value', 'int'], ['mode', 'enum', BAR_MODES], ['animated', 'bool']]
    },
    arc: {
        label: 'Arc', icon: 'data_usage', group: 'Input', parts: ['main', 'indicator', 'knob'],
        insert: (d) => { const s = Math.round(Math.min(130, d.w * 0.45, d.h * 0.45)); return { width: s, height: s, value: 60 }; },
        props: [['value', 'int'], ['min_value', 'int'], ['max_value', 'int'], ['start_angle', 'int'], ['end_angle', 'int'], ['rotation', 'int'], ['mode', 'enum', ['NORMAL', 'REVERSE', 'SYMMETRICAL']], ['adjustable', 'bool']]
    },
    dropdown: {
        label: 'Dropdown', icon: 'arrow_drop_down_circle', group: 'Input', parts: ['main', 'indicator'],
        insert: (d) => ({ width: Math.round(Math.min(160, d.w * 0.6)), options: ['Living room', 'Kitchen', 'Bedroom'] }),
        props: [['options', 'options'], ['selected_index', 'int'], ['dir', 'enum', ['BOTTOM', 'TOP', 'LEFT', 'RIGHT']], ['symbol', 'text']]
    },
    roller: {
        label: 'Roller', icon: 'unfold_more', group: 'Input', parts: ['main', 'selected'],
        insert: (d) => ({ width: Math.round(Math.min(120, d.w * 0.45)), options: ['Off', 'Low', 'Medium', 'High'], selected_index: 1 }),
        props: [['options', 'options'], ['selected_index', 'int'], ['visible_row_count', 'int'], ['mode', 'enum', ['NORMAL', 'INFINITE']]]
    },
    textarea: {
        label: 'Text area', icon: 'edit_note', group: 'Input', parts: ['main', 'selected', 'cursor', 'textarea_placeholder'],
        insert: (d) => ({ width: Math.round(Math.min(220, d.w * 0.8)), placeholder_text: 'Type here...', one_line: true }),
        props: [['text', 'text'], ['placeholder_text', 'text'], ['one_line', 'bool'], ['password_mode', 'bool'], ['max_length', 'int'], ['accepted_chars', 'text']]
    },
    spinbox: {
        label: 'Spin box', icon: 'pin', group: 'Input', parts: ['main', 'cursor'],
        insert: () => ({ width: 100, value: 21, digits: 3, decimal_places: 1, range_from: 0, range_to: 500 }),
        props: [['value', 'num'], ['range_from', 'num'], ['range_to', 'num'], ['digits', 'int'], ['decimal_places', 'int'], ['selected_digit', 'int'], ['rollover', 'bool']]
    },
    buttonmatrix: {
        label: 'Button matrix', icon: 'apps', group: 'Input', parts: ['main', 'items'],
        insert: (d) => ({ width: Math.round(d.w * 0.9), height: Math.round(Math.min(100, d.h * 0.3)), rows: [{ buttons: [{ text: '1' }, { text: '2' }, { text: '3' }] }, { buttons: [{ text: 'OK', width: 2 }, { text: 'X' }] }] }),
        props: [['one_checked', 'bool']]
    },
    keyboard: {
        label: 'Keyboard', icon: 'keyboard', group: 'Input', parts: ['main', 'items'],
        insert: () => ({}), props: [['mode', 'enum', ['TEXT_LOWER', 'TEXT_UPPER', 'TEXT_SPECIAL', 'NUMBER']], ['textarea', 'text']]
    },
    bar: {
        label: 'Bar', icon: 'linear_scale', group: 'Display', parts: ['main', 'indicator'],
        insert: (d) => ({ width: Math.round(Math.min(200, d.w * 0.7)), height: 14, value: 70 }),
        props: [['value', 'int'], ['start_value', 'int'], ['min_value', 'int'], ['max_value', 'int'], ['mode', 'enum', BAR_MODES], ['animated', 'bool']]
    },
    spinner: {
        label: 'Spinner', icon: 'autorenew', group: 'Display', parts: ['main', 'indicator'],
        insert: () => ({ width: 60, height: 60 }), props: [['arc_length', 'int'], ['spin_time', 'text']]
    },
    meter: {
        label: 'Meter', icon: 'speed', group: 'Display', parts: ['main', 'ticks', 'indicator', 'items'],
        insert: (d) => { const s = Math.round(Math.min(180, d.w * 0.6, d.h * 0.6)); return { width: s, height: s, scales: [{ range_from: 0, range_to: 100, angle_range: 270, rotation: 135, ticks: { count: 21, width: 2, length: 8, color: '0x9E9E9E', major: { stride: 5, width: 3, length: 14, color: '0x616161', label_gap: 10 } }, indicators: [{ line: { id: 'needle', width: 4, color: '0xF44336', r_mod: -8, value: 60 } }] }] }; },
        props: []
    },
    table: {
        label: 'Table', icon: 'table_chart', group: 'Display', parts: ['main', 'items'],
        insert: () => ({ rows: [{ cells: [{ text: 'Room' }, { text: 'Temp' }] }, { cells: [{ text: 'Living' }, { text: '21.5' }] }, { cells: [{ text: 'Kitchen' }, { text: '20.1' }] }] }),
        props: []
    },
    tabview: {
        label: 'Tab view', icon: 'tab', group: 'Layout', parts: ['main'], container: false,
        insert: () => ({ width: '100%', height: '100%', tabs: [{ name: 'Home', id: 'tab_home', widgets: [] }, { name: 'Settings', id: 'tab_settings', widgets: [] }] }),
        props: [['position', 'enum', ['TOP', 'BOTTOM', 'LEFT', 'RIGHT']], ['size', 'text']]
    },
    tileview: {
        label: 'Tile view', icon: 'view_quilt', group: 'Layout', parts: ['main', 'scrollbar'],
        insert: () => ({ width: '100%', height: '100%', tiles: [{ id: 'tile_1', row: 0, column: 0, widgets: [] }] }), props: []
    },
    list: {
        label: 'List', icon: 'list', group: 'Layout', parts: ['main', 'scrollbar'], container: true,
        insert: (d) => ({ width: Math.round(d.w * 0.7), height: Math.round(d.h * 0.5) }), props: []
    },
    canvas: {
        label: 'Canvas', icon: 'brush', group: 'Display', parts: ['main'],
        insert: () => ({ width: 100, height: 60 }), props: [['transparent', 'bool']]
    },
    animimg: {
        label: 'Animated image', icon: 'movie', group: 'Display', parts: ['main'],
        insert: () => ({ src: [], duration: '1s' }), props: [['duration', 'text']]
    }
};

export const GROUPS = ['Basic', 'Input', 'Display', 'Layout'];
export const isContainer = t => !!(WIDGETS[t] && WIDGETS[t].container);
export const partsOf = t => (WIDGETS[t] && WIDGETS[t].parts) || ['main'];

// Style property catalogue for the Style panel: [key, field type, extra]
export const STYLE_GROUPS = [
    ['Background', [['bg_color', 'color'], ['bg_opa', 'opa'], ['bg_grad_color', 'color'], ['bg_grad_dir', 'enum', ['NONE', 'HOR', 'VER']], ['bg_main_stop', 'int'], ['bg_grad_stop', 'int'], ['bg_image_src', 'image'], ['bg_image_opa', 'opa'], ['bg_image_recolor', 'color'], ['bg_image_recolor_opa', 'opa']]],
    ['Border & radius', [['radius', 'int'], ['border_width', 'int'], ['border_color', 'color'], ['border_opa', 'opa'], ['border_side', 'enum', ['FULL', 'TOP', 'BOTTOM', 'LEFT', 'RIGHT', 'NONE']], ['clip_corner', 'bool']]],
    ['Text', [['text_color', 'color'], ['text_font', 'font'], ['text_align', 'enum', ['LEFT', 'CENTER', 'RIGHT', 'AUTO']], ['text_opa', 'opa'], ['text_letter_space', 'int'], ['text_line_space', 'int'], ['text_decor', 'enum', ['NONE', 'UNDERLINE', 'STRIKETHROUGH']]]],
    ['Padding', [['pad_all', 'int'], ['pad_top', 'int'], ['pad_bottom', 'int'], ['pad_left', 'int'], ['pad_right', 'int'], ['pad_row', 'int'], ['pad_column', 'int']]],
    ['Shadow', [['shadow_color', 'color'], ['shadow_width', 'int'], ['shadow_offset_x', 'int'], ['shadow_offset_y', 'int'], ['shadow_spread', 'int'], ['shadow_opa', 'opa']]],
    ['Outline', [['outline_width', 'int'], ['outline_color', 'color'], ['outline_opa', 'opa'], ['outline_pad', 'int']]],
    ['Arc', [['arc_color', 'color'], ['arc_width', 'int'], ['arc_opa', 'opa'], ['arc_rounded', 'bool']]],
    ['Line', [['line_color', 'color'], ['line_width', 'int'], ['line_rounded', 'bool'], ['line_dash_width', 'int'], ['line_dash_gap', 'int']]],
    ['Image', [['image_recolor', 'color'], ['image_recolor_opa', 'opa'], ['image_opa', 'opa']]],
    ['Opacity & transform', [['opa', 'opa'], ['transform_rotation', 'num'], ['transform_scale', 'num'], ['translate_x', 'int'], ['translate_y', 'int']]]
];
export const STYLE_KEYS = new Set(STYLE_GROUPS.flatMap(g => g[1].map(p => p[0])).concat(['shadow_ofs_x', 'shadow_ofs_y', 'transform_angle', 'transform_zoom', 'text_font']));
export const TEXT_INHERITED = ['text_color', 'text_font', 'text_opa', 'text_align', 'text_letter_space', 'text_line_space', 'text_decor'];
