function (pt, plate, wells, anchor) {
    // DATE CHOOSER for cells of type DATE.
    //   await exec('baja/plate/views/date-picker.js', pt, plate, wells)
    //
    // A popover anchored to the cell: a month calendar to click a day, arrows and a
    // month/year field to move around, Today and Clear, and a native date field for
    // typing. The value written is YYYY-MM-DD, which the DATE display reads as a local
    // date. Every selected cell gets the same date.
    return (async () => {
        const list = (Array.isArray(wells) ? wells : []).filter(Boolean);
        if (!list.length) { try { pt.setMessage('Select a date cell first.', 2); } catch (e) { } return false; }
        let HM = null;
        try { HM = await exec('baja/history/HM'); } catch (e) { HM = null; }

        const pad = (n) => String(n).padStart(2, '0');
        const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        const parse = (v) => {
            if (v == null || v === '') return null;
            if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
            const s = ('' + v).trim();
            const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        };
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        let picked = parse(list[0].value);
        let view = new Date((picked || today).getFullYear(), (picked || today).getMonth(), 1);

        // Anchor: below the first cell, inside the window.
        let left = 120, top = 120;
        try {
            let el = null;
            try { const c = CurrentLayout.getStashed('graph-canvas'); el = c && c.canvas; if (el && el.nativeElement) el = el.nativeElement; } catch (e) { el = null; }
            if (!el || !el.getBoundingClientRect) el = document.querySelector('canvas[tabindex]') || document.querySelector('canvas');
            const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
            const w = list[0];
            const ax = (anchor && anchor.x != null) ? anchor.x : (w.__screen_x || 0);
            const ay = (anchor && anchor.y != null) ? anchor.y : ((w.__screen_y || 0) + (w.__screen_height || 24));
            left = Math.round(r.left + ax); top = Math.round(r.top + ay + 6);
        } catch (e) { }
        left = Math.max(8, Math.min(left, window.innerWidth - 300));
        top = Math.max(8, Math.min(top, window.innerHeight - 380));

        try { const old = document.getElementById('baja-date-picker'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const box = document.createElement('div');
        box.id = 'baja-date-picker';
        box.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;z-index:2147483000;width:284px;background:#ffffff;color:#0a2540;'
            + 'border-radius:12px;box-shadow:0 12px 40px rgba(10,37,64,0.35);border:1px solid rgba(10,37,64,0.14);'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;padding:12px;user-select:none;';
        const btn = (id, label, extra) => '<button id="' + id + '" type="button" style="cursor:pointer;border-radius:8px;padding:6px 10px;font:600 12px system-ui;border:1px solid #c7d2dd;background:#ffffff;color:#0a2540;' + (extra || '') + '">' + label + '</button>';
        box.innerHTML = ''
            + '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;">'
            + '<button id="dp-prev" type="button" title="Previous month" style="cursor:pointer;border:none;background:transparent;font:700 16px system-ui;color:#0a2540;padding:2px 8px;">&#8249;</button>'
            + '<div id="dp-title" style="font:600 14px system-ui;flex:1;text-align:center;"></div>'
            + '<button id="dp-next" type="button" title="Next month" style="cursor:pointer;border:none;background:transparent;font:700 16px system-ui;color:#0a2540;padding:2px 8px;">&#8250;</button>'
            + '</div>'
            + '<div id="dp-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;"></div>'
            + '<div style="display:flex;gap:6px;align-items:center;margin-top:10px;">'
            + '<input id="dp-input" type="date" style="flex:1;box-sizing:border-box;background:#f4f7fa;color:#0a2540;border:1px solid #c7d2dd;border-radius:8px;padding:6px 8px;font:12.5px system-ui;">'
            + '</div>'
            + '<div style="display:flex;gap:6px;justify-content:space-between;margin-top:10px;">'
            + '<span>' + btn('dp-today', 'Today') + ' ' + btn('dp-clear', 'Clear') + '</span>'
            + '<span>' + btn('dp-cancel', 'Cancel') + ' ' + btn('dp-set', 'Set', 'border-color:#1aa3bd;background:#1aa3bd;color:#ffffff;') + '</span>'
            + '</div>';
        document.body.appendChild(box);
        const $ = (id) => box.querySelector('#' + id);

        const render = () => {
            $('dp-title').textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
            const g = $('dp-grid'); g.innerHTML = '';
            for (const d of ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']) {
                const h = document.createElement('div'); h.textContent = d;
                h.style.cssText = 'text-align:center;font:600 11px system-ui;color:#6b7a90;padding:4px 0;'; g.appendChild(h);
            }
            const first = new Date(view.getFullYear(), view.getMonth(), 1);
            const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
            for (let i = 0; i < first.getDay(); i++) g.appendChild(document.createElement('div'));
            for (let d = 1; d <= days; d++) {
                const date = new Date(view.getFullYear(), view.getMonth(), d);
                const b = document.createElement('button'); b.type = 'button'; b.textContent = '' + d;
                const isPicked = picked && iso(picked) === iso(date);
                const isToday = iso(today) === iso(date);
                b.style.cssText = 'cursor:pointer;border-radius:8px;padding:6px 0;font:12.5px system-ui;border:1px solid transparent;'
                    + (isPicked ? 'background:#1aa3bd;color:#ffffff;font-weight:600;' : 'background:transparent;color:#0a2540;')
                    + (isToday && !isPicked ? 'border-color:#1aa3bd;' : '');
                b.onmouseenter = () => { if (!isPicked) b.style.background = '#e6f6f9'; };
                b.onmouseleave = () => { if (!isPicked) b.style.background = 'transparent'; };
                b.onclick = () => { picked = date; $('dp-input').value = iso(date); render(); };
                b.ondblclick = () => { picked = date; commit(); };
                g.appendChild(b);
            }
            $('dp-input').value = picked ? iso(picked) : '';
        };
        const commit = () => {
            const value = picked ? iso(picked) : '';
            try { if (HM && typeof pushHistory === 'function') pushHistory(HM(plate)); } catch (e) { }
            for (const w of list) { try { w.setValue(value); } catch (e) { } }
            try { pt.updateCalculations && pt.updateCalculations(); } catch (e) { }
            try { pt.setMessage(value ? ('Date set to ' + value) : 'Date cleared', 2); } catch (e) { }
            close();
        };
        let onKey, onDown;
        const close = () => {
            try { if (box.parentNode) box.parentNode.removeChild(box); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { document.removeEventListener('mousedown', onDown, true); } catch (e) { }
        };
        onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
            else if (e.key === 'Enter' && document.activeElement !== $('dp-input')) { e.preventDefault(); e.stopPropagation(); commit(); }
            else if (e.key === 'Tab') { e.stopPropagation(); }   // stays in the popover, not the table
        };
        onDown = (e) => { if (!box.contains(e.target)) close(); };
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
        $('dp-prev').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); };
        $('dp-next').onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); };
        $('dp-today').onclick = () => { picked = new Date(today); view = new Date(today.getFullYear(), today.getMonth(), 1); render(); };
        $('dp-clear').onclick = () => { picked = null; commit(); };
        $('dp-cancel').onclick = close;
        $('dp-set').onclick = commit;
        $('dp-input').onchange = () => { const d = parse($('dp-input').value); if (d) { picked = d; view = new Date(d.getFullYear(), d.getMonth(), 1); render(); } };
        $('dp-input').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const d = parse($('dp-input').value); if (d) picked = d; commit(); } };
        render();
        return true;
    })();
}
