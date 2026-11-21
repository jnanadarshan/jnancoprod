// Displaysim LVGL-style layout helpers (new UI only): brand capsule, panel headings.
(function () {
    'use strict';
    if (!document.body.classList.contains('ui-lvgl')) return;
    const nav = document.querySelector('.top-nav'), left = nav && nav.querySelector('.nav-left-section');
    if (left) {
        left.classList.add('lv-capsule');
        const t = left.querySelector('.title');
        if (t && !t.querySelector('small')) t.innerHTML = '<b>Display Designer</b><small>for ESPHome</small>';
    }
    // headings inside the left column
    const cont = document.querySelector('#elementsDetails .add-elements-container');
    if (cont && !cont.previousElementSibling) {
        const h = (txt) => { const d = document.createElement('div'); d.className = 'lv-h'; d.textContent = txt; return d; };
        cont.before(h('Widgets'));
        const list = document.getElementById('elementList'); if (list) list.before(h('Layers'));
    }
    // the Elements / Properties headers are fixed headings, not collapsible
    ['elementsDetails', 'editorDetails'].forEach(id => { const d = document.getElementById(id); if (d) { d.open = true; d.addEventListener('toggle', () => { if (!d.open) d.open = true; }); } });
    const sum = document.querySelector('#elementsDetails > summary'); if (sum) sum.lastChild.textContent = ' Elements & layers';
})();
