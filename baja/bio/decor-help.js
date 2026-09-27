function (layer, graph, sx, sy) {
    // The explanation behind a layer label's round "?" (TrackLayer.__drawDecor).
    //
    //   exec('baja/bio/decor-help.js', layer, graph, screenX, screenY)
    //
    // Shows layer.decor.help = { title, rows: [[term, meaning], ...], note } in a small panel
    // next to the button. sx / sy are canvas pixels (graph.__downScreen); they are turned into
    // page position through the canvas element's box, so a scaled canvas still lines up.
    // Closes on Esc, on the x, or on any press outside the panel. Opening another replaces it.
    return new Promise((resolve) => {
        const help = layer && layer.decor && layer.decor.help;
        if (!help) { resolve(false); return; }
        const ID = 'baja-decor-help';
        try { const old = document.getElementById(ID); if (old) old.__close(); } catch (e) { }

        let left = 80, top = 80;
        try {
            const cv = graph.canvas.getCTX().canvas;
            const r = cv.getBoundingClientRect();
            left = r.left + sx * (r.width / cv.width);
            top = r.top + sy * (r.height / cv.height);
        } catch (e) { }

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const box = document.createElement('div');
        box.id = ID;
        box.setAttribute('role', 'dialog');
        box.style.cssText = 'position:fixed;z-index:100000;max-width:440px;background:#fff;color:#1f2933;'
            + 'border:1px solid #c9d2dc;border-radius:8px;box-shadow:0 8px 28px rgba(15,30,50,.22);'
            + 'font:12.5px/1.45 Arial,sans-serif;padding:12px 14px 12px 14px;';
        box.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">'
            + '<div style="font-weight:700;font-size:13px;flex:1">' + esc(help.title || 'What this means') + '</div>'
            + '<button type="button" aria-label="Close" style="border:0;background:none;font-size:16px;line-height:1;'
            + 'cursor:pointer;color:#5b6773;padding:0 2px">×</button></div>'
            + (help.rows || []).map((r) =>
                '<div style="display:grid;grid-template-columns:minmax(90px,34%) 1fr;gap:8px;padding:5px 0;'
                + 'border-top:1px solid #eef1f4"><div style="font-weight:600;color:#3d4a57">' + esc(r[0]) + '</div>'
                + '<div>' + esc(r[1]) + '</div></div>').join('')
            + (help.note ? ('<div style="margin-top:8px;padding-top:8px;border-top:1px solid #eef1f4;color:#4b5866">'
                + esc(help.note) + '</div>') : '');
        document.body.appendChild(box);

        // keep it on screen: prefer below-right of the button, flip where it would overflow
        const bw = box.offsetWidth, bh = box.offsetHeight;
        let x = left + 10, y = top + 12;
        if (x + bw > window.innerWidth - 8) x = Math.max(8, left - bw - 10);
        if (y + bh > window.innerHeight - 8) y = Math.max(8, top - bh - 12);
        box.style.left = x + 'px';
        box.style.top = y + 'px';

        const onKey = (e) => { if (e.key === 'Escape') close(); };
        const onDown = (e) => { if (!box.contains(e.target)) close(); };
        const close = () => {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { document.removeEventListener('mousedown', onDown, true); } catch (e) { }
            try { box.remove(); } catch (e) { }
        };
        box.__close = close;
        box.querySelector('button').addEventListener('click', close);
        document.addEventListener('keydown', onKey, true);
        // armed on the next tick, so the press that opened it does not close it
        setTimeout(() => { try { document.addEventListener('mousedown', onDown, true); } catch (e) { } }, 0);
        resolve(true);
    });
}
