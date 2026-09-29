function (layer, graph, sx, sy) {
    // The explanation behind a layer label's round "?" (TrackLayer.__drawDecor).
    //
    //   exec('baja/bio/decor-help.js', layer, graph, screenX, screenY)
    //
    // Shows layer.decor.help = { title, rows: [[term, meaning], ...], note }: centred over a
    // dimmed backdrop on desktop, filling the window on phone-sized screens (large x to leave).
    // Closes on Esc, on the x, or on a press on the backdrop. Opening another replaces it.
    // sx / sy (where the "?" was pressed) are accepted for compatibility and not needed.
    return new Promise((resolve) => {
        const help = layer && layer.decor && layer.decor.help;
        if (!help) { resolve(false); return; }
        const ID = 'baja-decor-help';
        try { const old = document.getElementById(ID); if (old) old.__close(); } catch (e) { }

        // Desktop: a centred panel over a dimmed backdrop. Phone-sized screens: the panel fills
        // the window, with a large x to leave it (a touch target at least 44 px square).
        const mobile = (() => {
            try { return window.matchMedia('(max-width: 700px), (pointer: coarse) and (max-width: 1024px)').matches; }
            catch (e) { return (window.innerWidth || 1000) <= 700; }
        })();

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const back = document.createElement('div');
        back.id = ID;
        back.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;'
            + (mobile ? 'background:#fff;' : 'background:rgba(15,25,40,.28);padding:16px;');
        const box = document.createElement('div');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.style.cssText = mobile
            ? 'position:relative;width:100%;height:100%;overflow:auto;background:#fff;color:#1f2933;'
                + 'font:15px/1.5 Arial,sans-serif;padding:14px 16px 28px 16px;box-sizing:border-box;'
            : 'position:relative;width:min(' + ((help.table || (help.details && help.details.length)) ? 760 : 480) + 'px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;'
                + 'color:#1f2933;border:1px solid #c9d2dc;border-radius:10px;box-shadow:0 12px 40px rgba(15,30,50,.28);'
                + 'font:12.5px/1.45 Arial,sans-serif;padding:14px 16px;box-sizing:border-box;';
        const closeCss = mobile
            ? 'flex:none;width:44px;height:44px;margin:-6px -8px 0 0;border:0;border-radius:22px;background:#eef1f4;'
                + 'font-size:24px;line-height:44px;cursor:pointer;color:#3d4a57;padding:0'
            : 'flex:none;border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:#5b6773;padding:0 2px';
        const rowCss = mobile
            ? 'padding:10px 0;border-top:1px solid #eef1f4'
            : 'display:grid;grid-template-columns:minmax(90px,34%) 1fr;gap:10px;padding:6px 0;border-top:1px solid #eef1f4';
        box.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px' + (mobile ? ';position:sticky;top:-14px;background:#fff;padding-top:14px;margin-top:-14px' : '') + '">'
            + '<div style="font-weight:700;font-size:' + (mobile ? '17px' : '14px') + ';flex:1">' + esc(help.title || 'What this means') + '</div>'
            + '<button type="button" aria-label="Close" style="' + closeCss + '">×</button></div>'
            // optional table: { caption, cols: [...], rows: [[...]] } (a cell may hold a line break)
            + (help.table && help.table.rows && help.table.rows.length
                ? ('<div style="overflow-x:auto;margin:2px 0 10px 0">'
                    + (help.table.caption ? ('<div style="color:#4b5866;margin-bottom:4px">' + esc(help.table.caption) + '</div>') : '')
                    + '<table style="border-collapse:collapse;font-size:' + (mobile ? '13px' : '11.5px') + ';white-space:nowrap">'
                    + (help.table.cols ? ('<tr>' + help.table.cols.map((c) => '<th style="text-align:center;padding:4px 8px;border-bottom:1px solid #c9d2dc;color:#3d4a57">' + esc(c) + '</th>').join('') + '</tr>') : '')
                    + help.table.rows.map((r) => '<tr>' + r.map((c, i) => '<td style="padding:4px 8px;border-bottom:1px solid #eef1f4;text-align:' + (i ? 'center' : 'left')
                        + (i ? '' : ';font-weight:600;color:#3d4a57') + '">' + esc(c).replace(/\n/g, '<br><span style="color:#7b8794;font-size:.9em">') + (('' + c).indexOf('\n') >= 0 ? '</span>' : '') + '</td>').join('') + '</tr>').join('')
                    + '</table></div>')
                : '')
            + (help.rows || []).map((r) =>
                '<div style="' + rowCss + '"><div style="font-weight:600;color:#3d4a57' + (mobile ? ';margin-bottom:3px' : '') + '">'
                + esc(r[0]) + '</div><div>' + esc(r[1]) + '</div></div>').join('')
            // optional expandable blocks: [{ summary, pre }] (monospace, e.g. an alignment)
            + (help.details || []).map((d) => '<details style="margin-top:8px;border-top:1px solid #eef1f4;padding-top:6px">'
                + '<summary style="cursor:pointer;font-weight:600;color:#3d4a57">' + esc(d.summary) + '</summary>'
                + '<pre style="margin:6px 0 0 0;overflow-x:auto;font:11px/1.35 Menlo,Consolas,monospace;background:#f6f8fa;padding:8px;border-radius:6px">'
                + esc(d.pre) + '</pre></details>').join('')
            + (help.note ? ('<div style="margin-top:10px;padding-top:10px;border-top:1px solid #eef1f4;color:#4b5866">'
                + esc(help.note) + '</div>') : '');
        back.appendChild(box);
        document.body.appendChild(back);
        // Cover the VISUAL viewport - the part of the page actually on screen - not the layout
        // viewport: a canvas wider than a phone makes the page wider than the screen, and
        // inset:0 then spans the whole page, pushing the panel and its x off the side.
        // Follows pinch-zoom and scrolling while open.
        const fit = () => {
            const vv = window.visualViewport;
            if (!vv) return;
            back.style.inset = 'auto';
            back.style.left = vv.offsetLeft + 'px';
            back.style.top = vv.offsetTop + 'px';
            back.style.width = vv.width + 'px';
            back.style.height = vv.height + 'px';
        };
        fit();
        try { window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit); } catch (e) { }

        const onKey = (e) => { if (e.key === 'Escape') close(); };
        const onDown = (e) => { if (!box.contains(e.target)) close(); };   // the backdrop (desktop)
        const close = () => {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { document.removeEventListener('mousedown', onDown, true); } catch (e) { }
            try { window.visualViewport.removeEventListener('resize', fit); window.visualViewport.removeEventListener('scroll', fit); } catch (e) { }
            try { back.remove(); } catch (e) { }
        };
        back.__close = close;
        box.querySelector('button').addEventListener('click', close);
        document.addEventListener('keydown', onKey, true);
        // armed on the next tick, so the press that opened it does not close it
        setTimeout(() => { try { document.addEventListener('mousedown', onDown, true); } catch (e) { } }, 0);
        resolve(true);
    });
}
