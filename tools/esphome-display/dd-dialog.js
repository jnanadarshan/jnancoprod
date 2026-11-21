// Custom dialogs (replace alert / confirm / prompt) and custom dropdowns (replace native <select> popups).
// Matches the Displaysim glass style. Loaded after dd-ui.js.
(function () {
    'use strict';
    const DD = window.DD, h = DD.h, ic = DD.ic;

    // ---------------------------------------------------------------- dialogs
    let stack = [];
    function dialog(o) {
        return new Promise(resolve => {
            const back = h('div', { class: 'dd-dlg-back' });
            const input = o.input ? h('input', { type: 'text', class: 'dd-dlg-input', value: o.value || '', placeholder: o.placeholder || '', spellcheck: 'false' }) : null;
            const done = v => { back.remove(); stack = stack.filter(x => x !== api); resolve(v); };
            const okBtn = h('button', { type: 'button', class: 'dd-dlg-btn primary' + (o.danger ? ' danger' : ''), onclick: () => done(o.input ? input.value : true) }, o.confirmLabel || 'OK');
            const noBtn = o.cancel === false ? null : h('button', { type: 'button', class: 'dd-dlg-btn', onclick: () => done(o.input ? null : false) }, o.cancelLabel || 'Cancel');
            const box = h('div', { class: 'dd-dlg', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': o.title || 'Message' },
                h('div', { class: 'dd-dlg-head' }, h('span', { class: 'dd-dlg-icon' + (o.danger ? ' danger' : '') }, ic(o.icon || (o.danger ? 'warning' : o.input ? 'edit' : 'info'))), h('h3', null, o.title || '')),
                h('div', { class: 'dd-dlg-body' }, h('p', null, o.message || ''), input),
                h('div', { class: 'dd-dlg-foot' }, noBtn, okBtn));
            back.append(box); back.addEventListener('mousedown', e => { if (e.target === back && o.cancel !== false) done(o.input ? null : false); });
            const api = { done, input, okBtn }; stack.push(api); document.body.append(back);
            setTimeout(() => { (input || okBtn).focus(); if (input) input.select(); }, 20);
        });
    }
    document.addEventListener('keydown', e => {
        const top = stack[stack.length - 1]; if (!top) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); top.done(top.input ? null : false); }
        else if (e.key === 'Enter' && e.target !== top.okBtn && !(e.target.tagName === 'BUTTON')) { e.preventDefault(); e.stopImmediatePropagation(); top.okBtn.click(); }
    }, true);
    DD.confirm = (message, o) => dialog({ title: 'Please confirm', message, confirmLabel: 'Continue', ...o });
    DD.prompt = (message, value, o) => dialog({ title: 'Enter a value', message, input: true, value, confirmLabel: 'Save', ...o });
    DD.alert = (message, o) => dialog({ title: 'Heads up', message: String(message), cancel: false, ...o });
    window.alert = m => { DD.alert(m); };      // non-blocking replacement

    // "Clear saved data" (two handlers in the page asked with confirm())
    const doClear = async () => {
        if (!(await DD.confirm('This removes every saved element, page, image and setting from this browser. It cannot be undone.', { title: 'Clear all saved data?', confirmLabel: 'Clear data', danger: true, icon: 'delete_sweep' }))) return;
        ['esphomeDisplayDesignerCache', 'ddConfigConfirmed', 'dd.meta', 'dd.welcomed'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
        location.reload();
    };
    window.clearCache = doClear;
    const clr = document.getElementById('clearCacheBtn');
    if (clr) clr.addEventListener('click', e => { e.stopImmediatePropagation(); e.preventDefault(); doClear(); }, true);

    // ---------------------------------------------------------------- custom dropdowns
    const SKIP = el => el.multiple || el.size > 1 || el.dataset.native !== undefined;
    let openList = null;
    function closeList() { if (openList) { openList.el.remove(); openList.btn.classList.remove('open'); openList.btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', openList.off, true); openList = null; } }
    function enhance(sel) {
        if (sel._dd || SKIP(sel)) return; sel._dd = true;
        const btn = h('button', { type: 'button', class: 'dd-select ' + (sel.className || ''), 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: sel.title || '' });
        const label = h('span', { class: 'dd-select-label' }), chev = ic('expand_more');
        btn.append(label, chev); sel.after(btn); sel.classList.add('dd-native-hidden');
        const cs = () => getComputedStyle(sel);
        function sync() {
            const o = sel.options[sel.selectedIndex]; label.textContent = o ? o.textContent.trim() : ''; label.classList.toggle('placeholder', !o || o.value === '');
            btn.disabled = sel.disabled; btn.title = sel.title || ''; btn.hidden = sel.hidden || cs().display === 'none' && sel.style.display === 'none';
            if (sel.style.display === 'none') btn.style.display = 'none'; else btn.style.display = '';
            if (sel.style.width) btn.style.width = sel.style.width;
        }
        // keep in step with script changes: value / selectedIndex setters, option changes, attributes
        ['value', 'selectedIndex'].forEach(p => { const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, p); Object.defineProperty(sel, p, { get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(); }, configurable: true }); });
        new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
        sel.addEventListener('change', sync);
        function open() {
            if (openList && openList.btn === btn) { closeList(); return; } closeList();
            const items = []; const list = h('div', { class: 'dd-list', role: 'listbox' });
            const many = sel.options.length > 12; const q = many ? h('input', { type: 'search', class: 'dd-list-q', placeholder: 'Filter…', spellcheck: 'false' }) : null;
            const body = h('div', { class: 'dd-list-body' });
            const add = (o, parent) => { const it = h('div', { class: 'dd-opt' + (o.selected ? ' on' : '') + (o.disabled ? ' off' : ''), role: 'option', 'data-i': o.index }, h('span', null, o.textContent), o.selected ? ic('check') : null); it._o = o; it.addEventListener('mousedown', e => e.preventDefault()); it.addEventListener('click', () => { if (o.disabled) return; closeList(); if (sel.selectedIndex !== o.index) { sel.selectedIndex = o.index; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); } sync(); btn.focus(); }); items.push(it); (parent || body).append(it); };
            [...sel.children].forEach(c => { if (c.tagName === 'OPTGROUP') { body.append(h('div', { class: 'dd-opt-group' }, c.label)); [...c.children].forEach(o => add(o)); } else add(c); });
            if (q) list.append(q); list.append(body);
            document.body.append(list);
            const r = btn.getBoundingClientRect(); list.style.minWidth = r.width + 'px';
            const lh = Math.min(list.offsetHeight, 320); let top = r.bottom + 6; if (top + lh > innerHeight - 8) top = Math.max(8, r.top - lh - 6);
            list.style.left = Math.max(8, Math.min(r.left, innerWidth - list.offsetWidth - 8)) + 'px'; list.style.top = top + 'px';
            let active = Math.max(0, items.findIndex(i => i._o.selected)); const mark = () => { items.forEach((i, k) => i.classList.toggle('hot', k === active)); const el = items[active]; if (el) el.scrollIntoView({ block: 'nearest' }); }; mark();
            const off = e => { if (!list.contains(e.target) && !btn.contains(e.target)) closeList(); };
            document.addEventListener('mousedown', off, true);
            openList = { el: list, btn, off, items, get active() { return active; }, set active(v) { active = v; mark(); } };
            btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
            if (q) { q.focus(); q.addEventListener('input', () => { const t = q.value.toLowerCase(); items.forEach(i => { i.style.display = i.textContent.toLowerCase().includes(t) ? '' : 'none'; }); const vis = items.filter(i => i.style.display !== 'none'); active = items.indexOf(vis[0]); mark(); }); }
        }
        btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });
        btn.addEventListener('keydown', e => {
            if (!openList || openList.btn !== btn) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } return; }
            const L = openList, vis = () => L.items.map((i, k) => [i, k]).filter(([i]) => i.style.display !== 'none' && !i._o.disabled).map(([, k]) => k);
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeList(); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const v = vis(), at = v.indexOf(L.active); L.active = v[Math.max(0, Math.min(v.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))] ?? L.active; }
            else if (e.key === 'Enter') { e.preventDefault(); L.items[L.active] && L.items[L.active].click(); }
        });
        sync();
    }
    // the popup list also needs arrow keys when its filter box has focus
    document.addEventListener('keydown', e => { if (!openList || e.target.className !== 'dd-list-q') return; openList.btn.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true })); if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) e.preventDefault(); }, true);
    const scan = root => (root.querySelectorAll ? root.querySelectorAll('select') : []).forEach(enhance);
    scan(document);
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.tagName === 'SELECT') enhance(n); else scan(n); } }))).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', closeList); document.addEventListener('scroll', e => { if (openList && !openList.el.contains(e.target)) closeList(); }, true);
    DD.enhanceSelects = scan;
})();
