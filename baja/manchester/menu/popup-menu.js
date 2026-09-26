function (graph, items, screenX, screenY, opts) {
    // AN IN-PLACE MENU, in the editor's own language, for the ordinary {label, click} lists
    // the rest of the app is already written in.
    //   await exec('baja/manchester/menu/popup-menu.js', graph, items, sx, sy, { title: '...' })
    //
    // sx, sy are CANVAS pixels -- the units graph.__downScreen and the hit tests use.
    //
    // WHY NOT THE OTHER TWO. showSideMenu collapses to a chip in the top-left corner, so the
    // options for something at the bottom of the canvas appear as far from it as the window
    // allows. showWindowMenu opens the full-screen list, which is the right shape on a phone
    // and the wrong one on a desktop, where it covers the very thing the menu is about. This
    // is a small panel beside the pointer: it is where you pressed, it stays until you choose,
    // press elsewhere, hit Escape or scroll, and it takes the same items either of the others
    // would have taken.
    //
    // ON A PHONE it hands straight back to the full-screen list, which is what a thumb wants.
    //
    // An item may be { label, click, move }, { type:'separator' }, { header:true, label },
    // or carry emphasis:'danger'. A label ending in a chevron is shown as leading somewhere;
    // its click is called with the same coordinates, so a submenu opens where this one was.
    const C = { bg: '#0b2545', line: 'rgba(255,255,255,0.14)', ink: '#eaf6f9',
                dim: '#8fb8c8', hot: 'rgba(26,163,189,0.38)', danger: 'rgba(217,58,43,0.38)' };
    const o = opts || {};

    return (async () => {
        const list = (Array.isArray(items) ? items : []).filter(Boolean);
        if (!list.length) return null;

        // A thumb gets the full-screen list; it is easier to hit and it is what the rest of
        // the mobile app does.
        let phone = false;
        try { phone = (typeof isMobile === 'function') && isMobile(); } catch (e) { phone = false; }
        if (phone) {
            try { graph.showWindowMenu(list, screenX, screenY, 260); } catch (e) { }
            return null;
        }

        try { if (window.__bajaPopupMenu && window.__bajaPopupMenu.destroy) window.__bajaPopupMenu.destroy(); } catch (e) { }
        try { graph.showSideMenu(null); } catch (e) { }     // never two menus at once

        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const labelOf = (it) => ('' + ((it && (it.label || it.name)) || '')).trim();
        const isSub = (it) => /[▸►>]\s*$/.test(labelOf(it));

        const el = document.createElement('div');
        el.id = 'baja-popup-menu';
        el.style.cssText = 'position:fixed;z-index:2147483600;min-width:' + (o.minWidth || 232) + 'px;'
            + 'max-width:' + (o.maxWidth || 360) + 'px;background:' + C.bg + ';color:' + C.ink + ';'
            + 'border:1px solid ' + C.line + ';border-radius:12px;padding:6px;'
            + 'box-shadow:0 18px 44px rgba(0,0,0,0.55);font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;';

        let html = '';
        if (o.title) {
            html += '<div style="padding:8px 10px 6px;border-bottom:1px solid ' + C.line + ';margin-bottom:4px;">'
                + '<div style="font:700 12.5px system-ui,Segoe UI,Arial;color:' + C.ink + ';">' + esc(o.title) + '</div>'
                + (o.subtitle ? '<div style="font:11.5px system-ui,Segoe UI,Arial;color:' + C.dim + ';margin-top:2px;">' + esc(o.subtitle) + '</div>' : '')
                + '</div>';
        }
        list.forEach((it, i) => {
            if (it && (it.type === 'separator' || it.separator)) {
                html += '<div style="height:1px;background:' + C.line + ';margin:5px 8px;"></div>';
                return;
            }
            const lab = labelOf(it);
            if (!lab) return;
            if (it.header || it.type === 'text') {
                html += '<div style="padding:7px 10px 3px;font:600 10.5px system-ui,Segoe UI,Arial;'
                    + 'letter-spacing:.09em;text-transform:uppercase;color:' + C.dim + ';">' + esc(lab) + '</div>';
                return;
            }
            const danger = (it.emphasis === 'danger');
            const arrow = isSub(it);
            html += '<button data-i="' + i + '"' + (it.disabled ? ' disabled' : '')
                + ' style="display:flex;width:100%;align-items:center;gap:10px;box-sizing:border-box;'
                + 'background:transparent;border:0;border-radius:8px;padding:8px 10px;cursor:'
                + (it.disabled ? 'default' : 'pointer') + ';text-align:left;'
                + 'font:' + (danger ? '600' : '500') + ' 13px system-ui,Segoe UI,Arial;'
                + 'color:' + (it.disabled ? C.dim : (danger ? '#ffb4ab' : C.ink)) + ';opacity:' + (it.disabled ? 0.55 : 1) + ';">'
                + '<span style="flex:1 1 auto;">' + esc(lab.replace(/\s*[▸►>]\s*$/, '')) + '</span>'
                + (arrow ? '<span style="color:' + C.dim + ';font-size:12px;">▸</span>' : '')
                + '</button>';
        });
        el.innerHTML = html;
        document.body.appendChild(el);

        // ---- where it goes ---------------------------------------------------------------
        // Canvas pixels to page pixels, through the canvas's own rect and CSS scale, then
        // flipped or clamped so the whole of it is on screen.
        let cv = null;
        try { const fg = graph.graph || graph; cv = fg.canvas.canvas.nativeElement; } catch (e) { cv = null; }
        if (!cv) { try { cv = graph.canvas.getCTX().canvas; } catch (e) { cv = null; } }
        if (!cv) { try { cv = (graph.graph || graph).canvas.getCTX().canvas; } catch (e) { cv = null; } }
        const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const kx = (cv && cv.width) ? r.width / cv.width : 1, ky = (cv && cv.height) ? r.height / cv.height : 1;
        const w = el.offsetWidth, h = el.offsetHeight;
        const px = r.left + (+screenX || 0) * kx, py = r.top + (+screenY || 0) * ky;
        let x = px + 8, y = py + 8;
        if (x + w > window.innerWidth - 8) x = Math.max(8, px - w - 8);
        if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
        el.style.left = Math.max(8, x) + 'px';
        el.style.top = Math.max(8, y) + 'px';

        // ---- closing ---------------------------------------------------------------------
        const pop = {};
        const onDocDown = (e) => { if (!el.contains(e.target)) close(); };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const bs = Array.prototype.slice.call(el.querySelectorAll('button:not([disabled])'));
                if (!bs.length) return;
                let i = bs.indexOf(document.activeElement);
                i = (e.key === 'ArrowDown') ? (i + 1) % bs.length : (i <= 0 ? bs.length - 1 : i - 1);
                bs[i].focus();
            }
        };
        const onWheel = (e) => { if (!el.contains(e.target)) close(); };
        function close() {
            try { document.removeEventListener('mousedown', onDocDown, true); } catch (e) { }
            try { document.removeEventListener('touchstart', onDocDown, true); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { document.removeEventListener('wheel', onWheel, true); } catch (e) { }
            try { window.removeEventListener('blur', close); window.removeEventListener('resize', close); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaPopupMenu === pop) window.__bajaPopupMenu = null;
        }
        pop.el = el; pop.destroy = close;
        window.__bajaPopupMenu = pop;
        // A tick late: the press that opened this is still on its way through the document.
        setTimeout(() => {
            if (window.__bajaPopupMenu !== pop) return;
            document.addEventListener('mousedown', onDocDown, true);
            document.addEventListener('touchstart', onDocDown, true);
            document.addEventListener('keydown', onKey, true);
            document.addEventListener('wheel', onWheel, { capture: true, passive: true });
            window.addEventListener('blur', close);
            window.addEventListener('resize', close);
        }, 0);

        // ---- choosing --------------------------------------------------------------------
        el.addEventListener('click', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-i]') : null;
            if (!b || b.disabled) return;
            e.stopPropagation();
            const it = list[+b.getAttribute('data-i')];
            close();
            // The SAME coordinates go to the handler, so a submenu opens where this one was
            // rather than back at the corner.
            try { const rr = it && it.click && it.click(screenX, screenY); if (rr && rr.catch) rr.catch(() => { }); }
            catch (err) { console.warn('[popup menu]', err); }
        });
        el.addEventListener('mouseover', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-i]') : null;
            for (const x2 of el.querySelectorAll('button[data-i]')) {
                const it = list[+x2.getAttribute('data-i')];
                x2.style.background = (x2 === b && !x2.disabled)
                    ? ((it && it.emphasis === 'danger') ? C.danger : C.hot) : 'transparent';
            }
        });
        el.addEventListener('mouseleave', () => {
            for (const x2 of el.querySelectorAll('button[data-i]')) x2.style.background = 'transparent';
        });
        // The canvas must not see presses on the menu, or choosing an item would also pan it.
        for (const ev of ['mousedown', 'mouseup', 'contextmenu', 'dblclick']) {
            el.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); });
        }
        return pop;
    })();
}
