function (opts) {

    // Maximised, scrollable, searchable picker.
    //   exec('baja/lib/pick-list.js', {
    //       title: 'Compounds', subtitle: '18 on TARDBP',
    //       items: [{ label, sub, ref }],
    //       onPick: (item) => { ... }
    //   })
    //
    // A side menu is bounded by the canvas height, so a track carrying a hundred oligos gave a
    // list that had to be paged through blindly. This fills the viewport and adds a search box,
    // which is the part that actually matters at that size: with 100 compounds the useful
    // interaction is "type ASO-4", not "scroll".
    //
    // Purely a chooser -- it reports the pick and closes. What happens next is the caller's
    // business, so the same picker serves compounds, tracks or anything else with a name.
    //
    // MANY AT ONCE, with multi: true. onPick is then handed an ARRAY, once, when Done is
    // pressed, and the rows carry a checkbox instead of a chevron:
    //   exec('baja/lib/pick-list.js', { title, items, multi: true,
    //                                   onPick: (chosen) => { ... } })
    // The filter and "select all shown" work together on purpose: typing Pathogenic and
    // pressing select-all is how 40 variants become the 12 that were meant, and picking
    // those one by one is the thing this picker exists to avoid.

    return (async () => {
        const o = opts || {};
        const items = Array.isArray(o.items) ? o.items.filter(Boolean) : [];
        const onPick = (typeof o.onPick === 'function') ? o.onPick : (() => { });
        // DISMISSAL IS AN ANSWER TOO. Without this, a caller that awaits a pick -- one
        // question after another, as choosing two tracks does -- waits for ever when the
        // list is closed with Escape or a click outside it, and the only sign is an editor
        // that has quietly stopped responding to that command.
        const onClose = (typeof o.onClose === 'function') ? o.onClose : (() => { });
        let picked = false;
        const ID = 'baja-pick-list';

        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        try { const old = document.getElementById(ID); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        if (!items.length) return null;

        const overlay = document.createElement('div');
        overlay.id = ID;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:rgba(6,14,26,0.72);'
            + 'display:flex;align-items:stretch;justify-content:center;padding:22px;'
            + 'font-family:Arial,Helvetica,sans-serif;';

        const pane = document.createElement('div');
        pane.style.cssText = 'width:100%;max-width:860px;height:100%;display:flex;flex-direction:column;'
            + 'background:#0b2545;color:#e8f0fb;border:1px solid rgba(255,255,255,0.14);border-radius:12px;'
            + 'box-shadow:0 24px 60px rgba(0,0,0,0.5);overflow:hidden;';

        const head = document.createElement('div');
        head.style.cssText = 'flex:0 0 auto;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.12);';
        head.innerHTML = '<div style="display:flex;align-items:center;gap:14px;">'
            + '<div style="font:700 17px Arial;">' + esc(o.title || 'Choose') + '</div>'
            + '<div id="' + ID + '-count" style="font:12.5px Arial;color:#9fb3c8;">' + esc(o.subtitle || (items.length + ' items')) + '</div>'
            + '</div>';

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:12px;';
        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = 'Filter…';
        search.style.cssText = 'flex:1 1 auto;background:rgba(255,255,255,0.08);color:#e8f0fb;'
            + 'border:1px solid rgba(255,255,255,0.18);border-radius:8px;padding:8px 12px;font:13px Arial;outline:none;';
        const x = document.createElement('button');
        x.textContent = '✕ Close';
        x.style.cssText = 'flex:0 0 auto;cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12.5px Arial;'
            + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';
        bar.appendChild(search); bar.appendChild(x);
        head.appendChild(bar);

        const body = document.createElement('div');
        body.style.cssText = 'flex:1 1 auto;overflow:auto;padding:6px 0;';

        let onKey = null;
        const close = () => {
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            // Only when the list is leaving with nothing chosen: a pick closes it too, and
            // firing both would have every caller handle the same event twice.
            if (!picked) { try { onClose(); } catch (e) { } }
        };

        const multi = !!o.multi;
        const chosen = new Set();
        const rows = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 18px;cursor:pointer;'
                + 'border-bottom:1px solid rgba(255,255,255,0.05);font:13px Arial;';
            row.innerHTML = (multi ? '<span data-box="' + i + '" style="flex:0 0 auto;width:14px;'
                + 'color:#4fd0e6;">☐</span>' : '')
                + '<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                + esc(it.label) + '</span>'
                + (it.sub ? ('<span style="flex:0 0 auto;color:#9fb3c8;font:12px Arial;">' + esc(it.sub) + '</span>') : '')
                + (multi ? '' : '<span style="flex:0 0 auto;color:#7f9bb8;">▸</span>');
            row.onmouseenter = () => { row.style.background = 'rgba(255,255,255,0.07)'; };
            row.onmouseleave = () => { row.style.background = 'transparent'; };
            if (multi) {
                row.onclick = () => {
                    if (chosen.has(it)) chosen.delete(it); else chosen.add(it);
                    markRow(i);
                    countChosen();
                };
            } else {
                row.onclick = () => { picked = true; close(); try { onPick(it); } catch (e) { } };
            }
            body.appendChild(row);
            rows.push({ row: row, it: it, i: i,
                hay: (('' + (it.label || '')) + ' ' + ('' + (it.sub || ''))).toLowerCase() });
        }
        if (multi) {
            for (const it of items) { if (it.checked) chosen.add(it); }
        }
        const markRow = (i) => {
            try {
                const r = rows[i];
                const box = r.row.querySelector('[data-box]');
                if (box) box.textContent = chosen.has(r.it) ? '☑' : '☐';
            } catch (e) { }
        };

        const countEl = () => { try { return document.getElementById(ID + '-count'); } catch (e) { return null; } };
        const applyFilter = () => {
            const q = ('' + (search.value || '')).trim().toLowerCase();
            let shown = 0;
            for (const r of rows) {
                const hit = !q || r.hay.indexOf(q) >= 0;
                r.row.style.display = hit ? 'flex' : 'none';
                if (hit) shown++;
            }
            const c = countEl();
            if (c) c.textContent = q ? (shown + ' of ' + rows.length + ' match “' + q + '”') : (o.subtitle || (items.length + ' items'));
        };
        search.oninput = applyFilter;
        x.onclick = close;

        // THE DONE BAR, only when choosing many. Nothing is run until it is pressed: a
        // picker that fired on every tick would start the work once per variant.
        let countChosen = () => { };
        if (multi) {
            const foot = document.createElement('div');
            foot.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:10px 18px;'
                + 'border-top:1px solid rgba(255,255,255,0.12);font:13px Arial;';
            const mk = (t) => {
                const b = document.createElement('button');
                b.textContent = t;
                b.style.cssText = 'cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12.5px Arial;'
                    + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';
                return b;
            };
            const all = mk('Select all shown'), none = mk('Clear'), done = mk('Done');
            done.style.borderColor = '#1aa3bd'; done.style.color = '#4fd0e6';
            const tally = document.createElement('span');
            tally.style.cssText = 'flex:1 1 auto;color:#9fb3c8;font:12.5px Arial;';
            countChosen = () => {
                tally.textContent = chosen.size
                    ? (chosen.size + ' chosen')
                    : 'none chosen yet';
            };
            all.onclick = () => {
                for (const r of rows) { if (r.row.style.display !== 'none') chosen.add(r.it); }
                for (const r of rows) markRow(r.i);
                countChosen();
            };
            none.onclick = () => {
                chosen.clear();
                for (const r of rows) markRow(r.i);
                countChosen();
            };
            done.onclick = () => {
                picked = true; close();
                try { onPick(items.filter((it) => chosen.has(it))); } catch (e) { }
            };
            foot.appendChild(all); foot.appendChild(none); foot.appendChild(tally); foot.appendChild(done);
            pane.appendChild(foot);
            for (const r of rows) markRow(r.i);
            countChosen();
        }
        overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
        onKey = (e) => {
            try {
                if (e.key === 'Escape') { close(); return; }
                // Enter picks the only remaining match, which is the point of typing a filter.
                if (e.key === 'Enter') {
                    const vis = rows.filter((r) => r.row.style.display !== 'none');
                    if (vis.length === 1) vis[0].row.onclick();
                }
            } catch (er) { }
        };
        document.addEventListener('keydown', onKey, true);

        pane.insertBefore(body, pane.firstChild);
        pane.insertBefore(head, pane.firstChild);
        overlay.appendChild(pane);
        document.body.appendChild(overlay);
        focusUnlessMobile(search);
        return true;
    })();
}
