//go:build js && wasm

// ddfont: renders TrueType text the way ESPHome's compile-time font step does, for the Displaysim preview.
// ESPHome rasterises each glyph with Pillow/FreeType at `size` pixels, quantises coverage to `bpp` bits
// and lays glyphs out with integer advances. This module mirrors that (without hinting) so text widths
// and anti-aliasing in the preview are close to the device.
//
// JS API (all functions live on globalThis):
//   ddFontLoad(id string, ttf Uint8Array) -> { ok bool, error string, family string }
//   ddFontMetrics(id string, size number) -> { ascent, descent, height, xheight, capheight, baseline }
//   ddFontText(id string, size number, bpp number, text string, letterSpacing number)
//        -> { width, height, ascent, data Uint8Array (width*height alpha 0..255) }
//   ddFontHas(id string) -> bool
package main

import (
	"image"
	"image/draw"
	"math"
	"syscall/js"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

type entry struct {
	f     *opentype.Font
	faces map[int]font.Face
}

var fonts = map[string]*entry{}

func face(e *entry, size int) (font.Face, error) {
	if f, ok := e.faces[size]; ok {
		return f, nil
	}
	f, err := opentype.NewFace(e.f, &opentype.FaceOptions{Size: float64(size), DPI: 72, Hinting: font.HintingNone})
	if err != nil {
		return nil, err
	}
	e.faces[size] = f
	return f, nil
}

func round(v fixed.Int26_6) int { return int(math.Floor(float64(v)/64 + 0.5)) }

func fontLoad(this js.Value, args []js.Value) any {
	id := args[0].String()
	n := args[1].Get("length").Int()
	buf := make([]byte, n)
	js.CopyBytesToGo(buf, args[1])
	f, err := opentype.Parse(buf)
	res := js.Global().Get("Object").New()
	if err != nil {
		res.Set("ok", false)
		res.Set("error", err.Error())
		return res
	}
	fonts[id] = &entry{f: f, faces: map[int]font.Face{}}
	res.Set("ok", true)
	return res
}

func fontHas(this js.Value, args []js.Value) any { _, ok := fonts[args[0].String()]; return ok }

func fontMetrics(this js.Value, args []js.Value) any {
	e, ok := fonts[args[0].String()]
	if !ok {
		return js.Null()
	}
	fc, err := face(e, args[1].Int())
	if err != nil {
		return js.Null()
	}
	m := fc.Metrics()
	res := js.Global().Get("Object").New()
	asc, desc := round(m.Ascent), round(m.Descent)
	res.Set("ascent", asc)
	res.Set("descent", desc)
	res.Set("height", asc+desc)
	res.Set("xheight", round(m.XHeight))
	res.Set("capheight", round(m.CapHeight))
	res.Set("baseline", asc)
	return res
}

func quant(a uint8, bpp int) uint8 {
	if bpp >= 8 {
		return a
	}
	levels := (1 << uint(bpp)) - 1
	if bpp == 1 {
		if a >= 128 {
			return 255
		}
		return 0
	}
	return uint8(math.Floor(float64(a)/255*float64(levels)+0.5) * 255 / float64(levels))
}

func fontText(this js.Value, args []js.Value) any {
	e, ok := fonts[args[0].String()]
	if !ok {
		return js.Null()
	}
	size, bpp, text := args[1].Int(), args[2].Int(), args[3].String()
	letter := 0
	if len(args) > 4 {
		letter = args[4].Int()
	}
	fc, err := face(e, size)
	if err != nil {
		return js.Null()
	}
	m := fc.Metrics()
	asc, desc := round(m.Ascent), round(m.Descent)
	runes := []rune(text)
	// measure with integer advances (what ESPHome stores per glyph)
	width := 0
	adv := make([]int, len(runes))
	for i, r := range runes {
		a, ok := fc.GlyphAdvance(r)
		if !ok {
			a, _ = fc.GlyphAdvance(' ')
		}
		adv[i] = round(a)
		width += adv[i]
		if i < len(runes)-1 {
			width += letter
		}
	}
	h := asc + desc
	if width <= 0 || h <= 0 {
		res := js.Global().Get("Object").New()
		res.Set("width", width)
		res.Set("height", h)
		res.Set("ascent", asc)
		res.Set("data", js.Global().Get("Uint8Array").New(0))
		return res
	}
	pad := size // room for overhang
	img := image.NewAlpha(image.Rect(0, 0, width+2*pad, h+2*pad))
	x := pad
	for i, r := range runes {
		dr, mask, mp, _, ok := fc.Glyph(fixed.Point26_6{X: fixed.I(x), Y: fixed.I(pad + asc)}, r)
		if ok {
			draw.DrawMask(img, dr, image.NewUniform(image.White), image.Point{}, mask, mp, draw.Over)
		}
		x += adv[i] + letter
	}
	// crop back to [0,width) x [0,h): overhang is dropped, like a glyph bitmap clipped to its advance box
	out := make([]byte, width*h)
	for yy := 0; yy < h; yy++ {
		for xx := 0; xx < width; xx++ {
			out[yy*width+xx] = quant(img.AlphaAt(xx+pad, yy+pad).A, bpp)
		}
	}
	arr := js.Global().Get("Uint8Array").New(len(out))
	js.CopyBytesToJS(arr, out)
	res := js.Global().Get("Object").New()
	res.Set("width", width)
	res.Set("height", h)
	res.Set("ascent", asc)
	res.Set("data", arr)
	return res
}

func main() {
	g := js.Global()
	g.Set("ddFontLoad", js.FuncOf(fontLoad))
	g.Set("ddFontHas", js.FuncOf(fontHas))
	g.Set("ddFontMetrics", js.FuncOf(fontMetrics))
	g.Set("ddFontText", js.FuncOf(fontText))
	if cb := g.Get("ddFontReady"); cb.Type() == js.TypeFunction {
		cb.Invoke()
	}
	select {}
}
