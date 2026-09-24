function (list, screenX, screenY, graph, opts) {
    // A FLOATING MENU AT THE POINTER for any menu list the app already builds -- the same look as the layer
    // menu (baja/manchester/menu/track-layer-popup.js): a navy panel with a cyan edge, rounded, placed where
    // you pressed.
    //   await exec('baja/manchester/menu/floating-menu.js', list, sx, sy, graph, { title, onDismiss, onDone })
    //
    // `list` is the list showSideMenu takes: [{ label, click, move, type?, emphasis?, disabled? }...].
    //   type 'separator'  a rule            type 'text'  a quiet, unclickable line
    //   a label like "— all layers —" is a section heading
    //   emphasis 'danger' (or a label that starts with "Delete") is drawn red
    //   disabled / enabled === false is greyed and inert
    // sx, sy are CANVAS pixels (graph.__downScreen).
    //
    // WHY IT EXISTS. Clicking a variant or an oligo used to bury its menu one level down in the track's side
    // menu, or (oligos) only in the selection window. gene.js's showSideMenu now hands its list to this while a
    // floating session is open (graph.openFloatingMenu / armFloatingMenu), so the menu AND every submenu an item
    // opens with showSideMenu(sub) land here, in place, without rewriting any of those menus.
    //
    // CLOSING. An item closes it and then runs; if that item opens another menu (showSideMenu(sub)) the session
    // is still alive and the next list replaces this one at the same spot. A press elsewhere, Escape, a scroll
    // or a resize dismisses it and ends the session (onDismiss). onDone fires once an item's own work has
    // finished and no new menu took its place.
    return (async () => {
        const o = opts || {};
        // One at a time. The one being replaced is not a "dismiss": the session goes on.
        try { if (window.__bajaFloatingMenu && window.__bajaFloatingMenu.destroy) window.__bajaFloatingMenu.destroy('replaced'); } catch (e) { }
        try { if (window.__bajaLayerPopup && window.__bajaLayerPopup.destroy) window.__bajaLayerPopup.destroy(); } catch (e) { }

        const rows = (Array.isArray(list) ? list : []).filter((it) => it && (it.type === 'separator' || it.label != null));
        if (!rows.length) return null;
        const esc = (t) => ('' + t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const isHeading = (it) => it.type !== 'separator' && it.type !== 'text' && /^[—–-]{1,2}\s.+\s[—–-]{1,2}$/.test(('' + it.label).trim());

        const pop = { el: null, destroy: null };
        const el = document.createElement('div');
        el.id = 'baja-floating-menu';
        el.setAttribute('role', 'menu');
        el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;z-index:2147482500;min-width:232px;max-width:360px;box-sizing:border-box;'
            + 'max-height:calc(100vh - 24px);overflow-y:auto;background:rgba(10,37,64,0.985);border:1px solid #1aa3bd;'
            + 'border-radius:10px;padding:6px;color:#eaf6f9;box-shadow:0 14px 38px rgba(10,37,64,0.45);'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;user-select:none;';
        const ROW = 'display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;min-height:31px;padding:5px 10px;border:0;'
            + 'border-radius:7px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;';
        const rule = '<div style="height:1px;margin:5px 6px;background:rgba(159,196,212,0.22);"></div>';

        let html = '';
        if (o.title) html += '<div style="padding:6px 10px 6px 10px;font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(o.title) + '</div>' + rule;
        const items = [];
        rows.forEach((it, i) => {
            if (it.type === 'separator') { html += rule; return; }
            const label = ('' + it.label).replace(/^\s+/, '');
            if (it.type === 'text') { html += '<div style="padding:5px 10px;color:#9fc4d4;font-size:12px;">' + esc(label) + '</div>'; return; }
            if (isHeading(it)) { html += '<div style="padding:8px 10px 3px 10px;color:#9fc4d4;font-size:11px;letter-spacing:0.4px;text-transform:uppercase;">' + esc(label.replace(/^[—–-]+\s*|\s*[—–-]+$/g, '')) + '</div>'; return; }
            const off = it.disabled === true || it.enabled === false;
            const danger = it.emphasis === 'danger' || /^delete\b/i.test(label);
            const sub = /[▸►›]\s*$/.test(label);
            const shown = label.replace(/\s*[▸►]\s*$/, '');
            items.push(it);
            html += '<button type="button" role="menuitem" data-i="' + (items.length - 1) + '"' + (off ? ' disabled' : '') + ' style="' + ROW
                + (off ? 'opacity:0.38;cursor:default;' : '') + (danger ? 'color:#ff9d92;' : '') + '">'
                + '<span style="flex:1;">' + esc(shown) + '</span>' + (sub ? '<span style="opacity:0.7;">›</span>' : '') + '</button>';
        });
        el.innerHTML = html;
        document.body.appendChild(el);

        // ---- placement: at the pointer, kept inside the window ---------------------------------------------
        let cv = null;
        try { const fg = (graph && graph.graph) || graph; cv = fg.canvas.canvas.nativeElement; } catch (e) { cv = null; }
        if (!cv) { try { cv = graph.canvas.getCTX().canvas; } catch (e) { cv = null; } }
        if (!cv) { try { cv = ((graph && graph.graph) || graph).canvas.getCTX().canvas; } catch (e) { cv = null; } }
        const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const kx = (cv && cv.width) ? r.width / cv.width : 1, ky = (cv && cv.height) ? r.height / cv.height : 1;
        const w = el.offsetWidth, h = el.offsetHeight;
        let x = r.left + (+screenX || 0) * kx + 6, y = r.top + (+screenY || 0) * ky + 6;
        if (x + w > window.innerWidth - 8) x = Math.max(8, r.left + (+screenX || 0) * kx - w - 6);   // flip to the left of the pointer
        if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
        el.style.left = Math.max(8, x) + 'px';
        el.style.top = Math.max(8, y) + 'px';

        // ---- closing ---------------------------------------------------------------------------------------------
        let closed = false;
        const onDocDown = (e) => { if (!el.contains(e.target)) close('dismiss'); };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close('dismiss'); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const bs = Array.from(el.querySelectorAll('button:not([disabled])'));
                if (!bs.length) return;
                let i = bs.indexOf(document.activeElement);
                i = e.key === 'ArrowDown' ? (i + 1) % bs.length : (i <= 0 ? bs.length - 1 : i - 1);
                bs[i].focus();
            }
        };
        const onWheel = (e) => { if (!el.contains(e.target)) close('dismiss'); };
        function close(reason) {
            if (closed) return;
            closed = true;
            try { document.removeEventListener('mousedown', onDocDown, true); } catch (e) { }
            try { document.removeEventListener('touchstart', onDocDown, true); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { document.removeEventListener('wheel', onWheel, true); } catch (e) { }
            try { window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onBlur); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaFloatingMenu === pop) window.__bajaFloatingMenu = null;
            // Only a real dismissal ends the session; an item, or being replaced by the next menu, does not.
            if (reason === 'dismiss' || reason === 'closed') { try { if (o.onDismiss) o.onDismiss(); } catch (e) { } }
        }
        const onBlur = () => close('dismiss');
        pop.el = el; pop.destroy = close;
        window.__bajaFloatingMenu = pop;
        // Attached a tick late: the press that opened this menu is still being delivered.
        setTimeout(() => {
            if (window.__bajaFloatingMenu !== pop || closed) return;
            document.addEventListener('mousedown', onDocDown, true);
            document.addEventListener('touchstart', onDocDown, true);
            document.addEventListener('keydown', onKey, true);
            document.addEventListener('wheel', onWheel, { capture: true, passive: true });
            window.addEventListener('blur', onBlur);
            window.addEventListener('resize', onBlur);
        }, 0);

        // ---- items -----------------------------------------------------------------------------------------------
        el.addEventListener('click', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-i]') : null;
            if (!b || b.disabled) return;
            e.stopPropagation();
            const it = items[+b.getAttribute('data-i')];
            close('item');
            let ret;
            try { ret = it && it.click ? it.click(screenX, screenY) : null; } catch (err) { console.warn('[floating menu]', err); }
            // Once the item's own work is over, and nothing opened another menu in its place, the session ends.
            Promise.resolve(ret).catch(() => { }).then(() => setTimeout(() => { try { if (!window.__bajaFloatingMenu && o.onDone) o.onDone(); } catch (e) { } }, 80));
        });
        el.addEventListener('mouseover', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-i]') : null;
            for (const x of el.querySelectorAll('button[data-i]')) {
                const hot = (x === b && !x.disabled);
                x.style.background = hot ? (/(255, ?157|#ff9d92)/i.test(x.style.color) ? 'rgba(217,58,43,0.38)' : 'rgba(26,163,189,0.38)') : 'transparent';
            }
            // Some menus highlight the thing an item acts on while the pointer is over it.
            if (b && !b.disabled) { const it = items[+b.getAttribute('data-i')]; try { if (it && it.move) it.move(screenX, screenY); } catch (err) { } }
        });
        el.addEventListener('mouseleave', () => { for (const x of el.querySelectorAll('button[data-i]')) x.style.background = 'transparent'; });
        // The canvas must not see presses on the menu.
        for (const ev of ['mousedown', 'mouseup', 'contextmenu', 'dblclick']) el.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); });
        return pop;
    })();
}
