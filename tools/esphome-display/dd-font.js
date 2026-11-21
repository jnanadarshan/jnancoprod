// Loads the Go-WASM font rasteriser (wasm/font.wasm). Everything works without it: text falls back to the browser.
(function () {
    'use strict';
    if (!window.WebAssembly || !/^https?:$/.test(location.protocol) && location.protocol !== 'file:') return;
    const s = document.createElement('script');
    s.src = 'wasm/wasm_exec.js';
    s.onload = function () {
        const go = new Go();
        const start = r => { go.run(r.instance); };
        const url = 'wasm/font.wasm';
        (WebAssembly.instantiateStreaming ? WebAssembly.instantiateStreaming(fetch(url), go.importObject).catch(() => fetch(url).then(r => r.arrayBuffer()).then(b => WebAssembly.instantiate(b, go.importObject))) : fetch(url).then(r => r.arrayBuffer()).then(b => WebAssembly.instantiate(b, go.importObject)))
            .then(start).catch(e => console.warn('Font rasteriser unavailable, using browser text.', e));
    };
    s.onerror = () => console.warn('wasm_exec.js not found; using browser text.');
    document.head.appendChild(s);
})();
