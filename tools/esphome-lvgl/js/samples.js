// Starter designs. Each one is plain ESPHome YAML, so it doubles as an example of how to write it.
export const SAMPLES = [
    {
        id: 'thermostat', title: 'Thermostat', tags: ['arc', 'pages', 'flex'], size: '320 × 240',
        desc: 'Adjustable arc, heat button, fan switch and a settings page reached with lvgl.page.next.',
        yaml: `display:
  - platform: ili9xxx
    model: ILI9341
    rotation: 90
lvgl:
  pages:
    - id: home
      widgets:
        - label:
            id: title
            align: TOP_MID
            y: 10
            text: "Living room"
            text_font: montserrat_20
        - arc:
            id: temp_arc
            align: CENTER
            y: -8
            width: 136
            height: 136
            adjustable: true
            min_value: 10
            max_value: 30
            value: 22
        - label:
            id: temp_label
            align: CENTER
            y: -10
            text: "21.5°C"
            text_font: montserrat_28
        - button:
            id: heat_button
            align: BOTTOM_LEFT
            x: 12
            y: -12
            checkable: true
            text: "\\uF06D Heat"
        - switch:
            id: fan_switch
            align: BOTTOM_MID
            y: -18
        - button:
            id: next_button
            align: BOTTOM_RIGHT
            x: -12
            y: -12
            text: "\\uF013"
            on_click:
              then:
                - lvgl.page.next:
    - id: settings
      bg_color: 0x0F172A
      text_color: 0xE2E8F0
      layout:
        type: flex
        flex_flow: COLUMN
        flex_align_main: CENTER
        flex_align_cross: CENTER
        pad_row: 14
      widgets:
        - label:
            text: "Settings"
            text_font: montserrat_20
        - slider:
            id: brightness
            width: 220
            value: 70
        - dropdown:
            id: mode_select
            width: 220
            options:
              - Comfort
              - Eco
              - Away
        - button:
            text: "\\uF053 Back"
            on_click:
              then:
                - lvgl.page.previous:
`
    },
    {
        id: 'dashboard', title: 'Smart-home dashboard', tags: ['grid', 'style_definitions', 'dark'], size: '480 × 320',
        desc: 'A 2 × 3 grid of tiles sharing one style definition, with symbols, states and a status bar.',
        yaml: `display:
  - platform: rpi_dpi_rgb
    dimensions:
      width: 480
      height: 320
lvgl:
  theme:
    dark_mode: true
  style_definitions:
    - id: tile
      bg_color: 0x1F2433
      radius: 18
      border_width: 0
      shadow_width: 12
      shadow_opa: 35%
      text_color: 0xE5E7EB
      pressed:
        bg_color: 0x2B3245
    - id: tile_on
      bg_color: 0x4F46E5
      bg_grad_color: 0x7C3AED
      bg_grad_dir: HOR
      text_color: 0xFFFFFF
  pages:
    - id: rooms
      bg_color: 0x0B0E17
      widgets:
        - label:
            x: 16
            y: 12
            text: "Good evening"
            text_font: montserrat_20
            text_color: 0xFFFFFF
        - label:
            align: TOP_RIGHT
            x: -16
            y: 16
            text: "\\uF1EB  21:42"
            text_color: 0x9CA3AF
        - obj:
            y: 48
            width: 100%
            height: 272
            bg_opa: TRANSP
            border_width: 0
            pad_all: 12
            pad_row: 12
            pad_column: 12
            layout: 2x3
            widgets:
              - button:
                  styles: [tile, tile_on]
                  grid_cell_x_align: STRETCH
                  grid_cell_y_align: STRETCH
                  checkable: true
                  state:
                    checked: true
                  text: "\\uF0EB\\nLiving room"
              - button:
                  styles: tile
                  grid_cell_x_align: STRETCH
                  grid_cell_y_align: STRETCH
                  checkable: true
                  text: "\\uF0EB\\nKitchen"
              - button:
                  styles: tile
                  grid_cell_x_align: STRETCH
                  grid_cell_y_align: STRETCH
                  text: "\\uF2C9\\n21.5°C"
              - button:
                  styles: tile
                  grid_cell_x_align: STRETCH
                  grid_cell_y_align: STRETCH
                  text: "\\uF023\\nFront door"
              - button:
                  styles: [tile, tile_on]
                  grid_cell_x_align: STRETCH
                  grid_cell_y_align: STRETCH
                  checkable: true
                  state:
                    checked: true
                  text: "\\uF001\\nSpeaker"
              - button:
                  styles: tile
                  grid_cell_x_align: STRETCH
                  grid_cell_y_align: STRETCH
                  text: "\\uF011\\nAll off"
`
    },
    {
        id: 'media', title: 'Media player', tags: ['slider', 'bar', 'flex'], size: '320 × 240',
        desc: 'Album card, progress bar, transport buttons in a flex row and a volume slider.',
        yaml: `display:
  - platform: ili9xxx
    model: ILI9341
    rotation: 90
lvgl:
  pages:
    - id: player
      bg_color: 0x111827
      bg_grad_color: 0x312E81
      bg_grad_dir: VER
      text_color: 0xF9FAFB
      widgets:
        - obj:
            x: 14
            y: 14
            width: 96
            height: 96
            radius: 14
            border_width: 0
            bg_color: 0xF472B6
            bg_grad_color: 0x8B5CF6
            bg_grad_dir: HOR
            widgets:
              - label:
                  align: CENTER
                  text: "\\uF001"
                  text_font: montserrat_36
                  text_color: 0xFFFFFF
        - label:
            x: 124
            y: 30
            text: "Midnight City"
            text_font: montserrat_20
        - label:
            x: 124
            y: 58
            text: "M83"
            text_color: 0xA5B4FC
        - bar:
            x: 14
            y: 128
            width: 292
            height: 6
            value: 42
            bg_color: 0xFFFFFF
            bg_opa: 20%
            indicator:
              bg_color: 0xFFFFFF
        - label:
            x: 14
            y: 140
            text: "1:42"
            text_font: montserrat_12
            text_color: 0x9CA3AF
        - label:
            align: TOP_RIGHT
            x: -14
            y: 140
            text: "4:03"
            text_font: montserrat_12
            text_color: 0x9CA3AF
        - obj:
            y: 160
            width: 100%
            height: 50
            bg_opa: TRANSP
            border_width: 0
            pad_all: 0
            layout:
              type: flex
              flex_flow: ROW
              flex_align_main: SPACE_EVENLY
              flex_align_cross: CENTER
            widgets:
              - button:
                  text: "\\uF048"
                  bg_opa: TRANSP
                  shadow_width: 0
              - button:
                  width: 48
                  height: 48
                  radius: 24
                  bg_color: 0xFFFFFF
                  text_color: 0x111827
                  text: "\\uF04C"
              - button:
                  text: "\\uF051"
                  bg_opa: TRANSP
                  shadow_width: 0
        - slider:
            align: BOTTOM_MID
            y: -12
            width: 220
            height: 6
            value: 65
            bg_color: 0xFFFFFF
            bg_opa: 20%
            indicator:
              bg_color: 0xA5B4FC
            knob:
              bg_color: 0xFFFFFF
              pad_all: 5
`
    },
    {
        id: 'weather', title: 'Weather station', tags: ['meter', 'table', 'recolor'], size: '480 × 320',
        desc: 'Big temperature, a humidity meter, a forecast table and recoloured text.',
        yaml: `display:
  - platform: x
    dimensions:
      width: 480
      height: 320
lvgl:
  pages:
    - id: weather
      bg_color: 0xE0F2FE
      bg_grad_color: 0xFFFFFF
      bg_grad_dir: VER
      widgets:
        - label:
            x: 20
            y: 14
            text: "Amsterdam"
            text_font: montserrat_20
            text_color: 0x0C4A6E
        - label:
            x: 20
            y: 44
            text: "18°"
            text_font: montserrat_48
            text_color: 0x0369A1
        - label:
            x: 20
            y: 108
            recolor: true
            text: "#F59E0B \\uF185# Sunny, light breeze"
            text_color: 0x334155
        - meter:
            align: TOP_RIGHT
            x: -16
            y: 12
            width: 170
            height: 170
            scales:
              - range_from: 0
                range_to: 100
                angle_range: 270
                rotation: 135
                ticks:
                  count: 21
                  width: 2
                  length: 8
                  color: 0x94A3B8
                  major:
                    stride: 5
                    width: 3
                    length: 14
                    color: 0x475569
                    label_gap: 8
                indicators:
                  - arc:
                      color: 0x38BDF8
                      width: 8
                      start_value: 30
                      end_value: 60
                  - line:
                      width: 4
                      color: 0x0EA5E9
                      r_mod: -12
                      value: 54
        - label:
            align: TOP_RIGHT
            x: -70
            y: 186
            text: "Humidity 54%"
            text_color: 0x475569
        - table:
            x: 20
            y: 150
            rows:
              - cells: [{text: "Day"}, {text: "High"}, {text: "Low"}]
              - cells: [{text: "Tue"}, {text: "19°"}, {text: "11°"}]
              - cells: [{text: "Wed"}, {text: "16°"}, {text: "9°"}]
              - cells: [{text: "Thu"}, {text: "21°"}, {text: "12°"}]
`
    },
    {
        id: 'keypad', title: 'Alarm keypad', tags: ['buttonmatrix', 'textarea', 'dark'], size: '240 × 320',
        desc: 'PIN entry with a password text area, a numeric button matrix and an armed LED.',
        yaml: `display:
  - platform: ili9xxx
    model: ILI9341
lvgl:
  theme:
    dark_mode: true
  pages:
    - id: keypad
      widgets:
        - led:
            x: 16
            y: 18
            width: 14
            height: 14
            color: 0xEF4444
        - label:
            x: 40
            y: 14
            text: "Armed: away"
            text_color: 0xFCA5A5
        - textarea:
            id: pin
            align: TOP_MID
            y: 44
            width: 208
            one_line: true
            password_mode: true
            text: "1234"
            text_align: CENTER
        - buttonmatrix:
            id: keys
            align: BOTTOM_MID
            y: -10
            width: 220
            height: 220
            rows:
              - buttons: [{text: "1"}, {text: "2"}, {text: "3"}]
              - buttons: [{text: "4"}, {text: "5"}, {text: "6"}]
              - buttons: [{text: "7"}, {text: "8"}, {text: "9"}]
              - buttons: [{text: "\\uF55A"}, {text: "0"}, {text: "\\uF00C", control: {checked: true}}]
`
    },
    {
        id: 'round', title: 'Round display gauge', tags: ['arc', 'spinner', '240×240'], size: '240 × 240',
        desc: 'For GC9A01-style round screens: two concentric arcs, a reading and a busy spinner.',
        yaml: `display:
  - platform: mipi_spi
    model: GC9A01A
lvgl:
  pages:
    - id: gauge
      bg_color: 0x000000
      text_color: 0xFFFFFF
      widgets:
        - arc:
            align: CENTER
            width: 228
            height: 228
            value: 72
            arc_width: 14
            arc_color: 0x1F2937
            indicator:
              arc_color: 0x22C55E
              arc_width: 14
            knob:
              bg_opa: TRANSP
        - arc:
            align: CENTER
            width: 186
            height: 186
            value: 35
            arc_width: 10
            arc_color: 0x1F2937
            indicator:
              arc_color: 0x38BDF8
              arc_width: 10
            knob:
              bg_opa: TRANSP
        - label:
            align: CENTER
            y: -10
            text: "1.8 kW"
            text_font: montserrat_32
        - label:
            align: CENTER
            y: 24
            text: "Solar \\u00b7 72%"
            text_color: 0x86EFAC
        - spinner:
            align: BOTTOM_MID
            y: -26
            width: 28
            height: 28
            arc_width: 4
            arc_length: 80
            arc_color: 0x1F2937
            indicator:
              arc_color: 0x38BDF8
              arc_width: 4
`
    },
    {
        id: 'wifi', title: 'Wi-Fi setup', tags: ['tabview', 'keyboard'], size: '480 × 320',
        desc: 'A tab view with a password field and LVGL’s on-screen keyboard, plus an info tab.',
        yaml: `display:
  - platform: x
    dimensions:
      width: 480
      height: 320
lvgl:
  pages:
    - id: setup
      widgets:
        - tabview:
            id: tabs
            tabs:
              - name: "\\uF1EB Wi-Fi"
                id: tab_wifi
                widgets:
                  - dropdown:
                      width: 100%
                      options:
                        - HomeNetwork
                        - Guest
                  - textarea:
                      id: password
                      y: 44
                      width: 100%
                      one_line: true
                      password_mode: true
                      placeholder_text: "Password"
                  - keyboard:
                      textarea: password
              - name: "\\uF05A Info"
                id: tab_info
                widgets:
                  - label:
                      text: "Firmware 2025.11\\nIP 192.168.1.42"
`
    }
];
