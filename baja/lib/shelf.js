function (opts) {

    // Reusable "bookshelf" overlay — a titled grid of cards, each with a badge, a name and a
    // one-line description, that runs an action when clicked.
    //
    //   await exec('baja/lib/shelf.js', {
    //       id: 'baja-data-library',          // DOM id, so re-opening replaces rather than stacks
    //       title: 'Data Library',
    //       subtitle: '10 data sources — click one to add it to your tracks',
    //       books: [{ title, badge, blurb, ready, open }],
    //       graph,                            // optional, for setMessage on failure
    //       onClose                           // optional, e.g. re-arm the hover highlight
    //   });
    //
    // Extracted because this is the FOURTH shelf in the app (clinical-library, rnaseq-library,
    // data-resources-library and now the data / ML libraries) and the markup had been copied
    // each time. A `ready: false` book renders greyed with a "coming soon" note rather than
    // being hidden, so a catalogue reads as complete instead of silently short.

    return (async () => {
        const o = opts || {};
        const graph = o.graph;
        const books = Array.isArray(o.books) ? o.books : [];
        const id = o.id || 'baja-shelf';
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        try { const old = document.getElementById(id); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;padding:16px 22px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;gap:16px;'
            + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);';
        header.innerHTML = ''
            + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;">'
            + '<div style="font:700 19px Arial;">' + esc(o.title || 'Library') + '</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;">' + esc(o.subtitle || '') + '</div>'
            + '</div>'
            + '<input id="shelf-q" placeholder="Search…" style="flex:1;max-width:340px;margin-left:auto;'
            + 'background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:999px;'
            + 'padding:9px 16px;font:13px Arial;"/>'
            + '<button id="shelf-x" style="cursor:pointer;flex:0 0 auto;border-radius:8px;padding:9px 16px;'
            + 'font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">✕ Close</button>';

        const shelf = document.createElement('div');
        shelf.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px;display:grid;'
            + 'grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;align-content:start;';

        overlay.appendChild(header); overlay.appendChild(shelf);
        document.body.appendChild(overlay);

        let onKey = null;
        const close = () => {
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            try { if (typeof o.onClose === 'function') o.onClose(); } catch (e) { }
        };
        onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
        document.addEventListener('keydown', onKey, true);
        header.querySelector('#shelf-x').onclick = close;

        const q = header.querySelector('#shelf-q');
        const render = () => {
            const needle = ('' + (q.value || '')).trim().toLowerCase();
            shelf.innerHTML = '';
            const shown = books.filter((b) => !needle
                || ((b.title || '') + ' ' + (b.blurb || '') + ' ' + (b.badge || '')).toLowerCase().indexOf(needle) >= 0);
            if (!shown.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'grid-column:1/-1;color:#9fb3c8;font:13px Arial;padding:24px;';
                empty.textContent = 'Nothing matches.';
                shelf.appendChild(empty);
                return;
            }
            for (const b of shown) {
                const ready = (b.ready !== false);
                const card = document.createElement('div');
                card.style.cssText = 'background:#0b2545;border:1px solid rgba(255,255,255,0.12);border-radius:12px;'
                    + 'padding:16px 18px;display:flex;flex-direction:column;gap:9px;'
                    + 'box-shadow:0 6px 18px rgba(0,0,0,0.28);' + (ready ? 'cursor:pointer;' : 'opacity:0.55;');
                if (ready) {
                    card.onmouseenter = () => { card.style.borderColor = '#12c2e0'; card.style.transform = 'translateY(-2px)'; };
                    card.onmouseleave = () => { card.style.borderColor = 'rgba(255,255,255,0.12)'; card.style.transform = ''; };
                }
                card.innerHTML = ''
                    + '<div style="display:flex;align-items:center;gap:8px;">'
                    + (b.badge ? ('<span style="flex:0 0 auto;border-radius:999px;padding:3px 9px;font:700 10.5px Arial;'
                        + 'background:rgba(18,194,224,0.16);color:#4fd0e6;">' + esc(b.badge) + '</span>') : '')
                    + (ready ? '' : '<span style="color:#8fb8c8;font:11.5px Arial;margin-left:auto;">coming soon</span>')
                    + '</div>'
                    + '<div style="font:700 15px Arial;color:#eaf6f9;">' + esc(b.title) + '</div>'
                    + '<div style="font:12px/1.55 Arial;color:#9fb3c8;">' + esc(b.blurb || '') + '</div>';
                if (ready) {
                    card.onclick = async () => {
                        // A book WITH docs opens its reference view first; the action is then an
                        // explicit choice there. Without docs the card runs the action directly,
                        // so shelves that predate this are unaffected.
                        if (b.docs) { showDetail(b); return; }
                        if (typeof b.open !== 'function') return;
                        close();
                        try { await b.open(); }
                        catch (e) {
                            try { if (graph && graph.setMessage) graph.setMessage(' Could not open ' + b.title + ': ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                        }
                    };
                }
                shelf.appendChild(card);
            }
        };
        // ---- Maximised reference view for one book -------------------------------------
        // Fills the same overlay rather than swapping the mainPanel component: the editor
        // canvas underneath is never unmounted, so closing is just showing the shelf again and
        // the editor is exactly as it was left.
        const showDetail = (b) => {
            const d = b.docs || {};
            const links = Array.isArray(d.links) ? d.links : [];
            shelf.style.display = 'none';
            let pane = document.getElementById(id + '-detail');
            if (pane && pane.parentNode) pane.parentNode.removeChild(pane);
            pane = document.createElement('div');
            pane.id = id + '-detail';
            pane.style.cssText = 'flex:1 1 auto;overflow:auto;padding:26px 30px;';
            pane.innerHTML = ''
                + '<div style="max-width:900px;">'
                + (b.badge ? ('<span style="display:inline-block;border-radius:999px;padding:3px 10px;font:700 11px Arial;'
                    + 'background:rgba(18,194,224,0.16);color:#4fd0e6;margin-bottom:8px;">' + esc(b.badge) + '</span>') : '')
                + '<div style="font:800 24px Arial;color:#eaf6f9;margin-bottom:10px;">' + esc(b.title) + '</div>'
                + '<div style="font:14px/1.7 Arial;color:#cfe6ee;margin-bottom:18px;">' + esc(d.summary || b.blurb || '') + '</div>'
                + (d.provenance ? ('<div style="margin-bottom:14px;padding:12px 14px;background:rgba(18,194,224,0.08);'
                    + 'border-left:3px solid #4fd0e6;border-radius:6px;font:13px/1.65 Arial;color:#cfe6ee;">'
                    + '<b style="color:#4fd0e6;">Where it comes from.</b> ' + esc(d.provenance) + '</div>') : '')
                + (d.usage ? ('<div style="margin-bottom:18px;padding:12px 14px;background:rgba(255,255,255,0.05);'
                    + 'border-left:3px solid rgba(255,255,255,0.28);border-radius:6px;font:13px/1.65 Arial;color:#cfe6ee;">'
                    + '<b>On the track.</b> ' + esc(d.usage) + '</div>') : '')
                + (links.length ? ('<div style="font:700 12px Arial;color:#4fd0e6;margin:20px 0 8px;">Documentation &amp; references</div>'
                    + links.map((l) => '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" '
                        + 'style="display:block;text-decoration:none;background:#0b2545;border:1px solid rgba(255,255,255,0.14);'
                        + 'border-radius:10px;padding:12px 14px;margin-bottom:9px;">'
                        + '<div style="font:700 13.5px Arial;color:#eaf6f9;">' + esc(l.title) + ' <span style="color:#4fd0e6;">\u2197</span></div>'
                        + (l.note ? ('<div style="font:12px/1.5 Arial;color:#9fb3c8;margin-top:3px;">' + esc(l.note) + '</div>') : '')
                        + '<div style="font:11.5px Arial;color:#7f97a6;margin-top:4px;word-break:break-all;">' + esc(l.url) + '</div>'
                        + '</a>').join('')) : '')
                + '<div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap;">'
                + (typeof b.open === 'function' ? ('<button id="shelf-load" style="cursor:pointer;border-radius:9px;'
                    + 'padding:11px 18px;font:700 13.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">'
                    + 'Load this data</button>') : '')
                + '<button id="shelf-back" style="cursor:pointer;border-radius:9px;padding:11px 18px;'
                + 'font:700 13.5px Arial;border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;">'
                + '\u2039 Back to the library</button>'
                + '<button id="shelf-done" style="cursor:pointer;border-radius:9px;padding:11px 18px;'
                + 'font:700 13.5px Arial;border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;">'
                + 'Close \u2192 editor</button>'
                + '</div>'
                + '</div>';
            overlay.appendChild(pane);

            const back = () => {
                try { if (pane.parentNode) pane.parentNode.removeChild(pane); } catch (e) { }
                shelf.style.display = '';
            };
            try { pane.querySelector('#shelf-back').onclick = back; } catch (e) { }
            try { pane.querySelector('#shelf-done').onclick = () => close(); } catch (e) { }
            try {
                const lb = pane.querySelector('#shelf-load');
                if (lb) lb.onclick = async () => {
                    close();
                    try { await b.open(); }
                    catch (e) {
                        try { if (graph && graph.setMessage) graph.setMessage(' Could not open ' + b.title + ': ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                    }
                };
            } catch (e) { }
        };

        q.oninput = render;
        render();
        try { q.focus(); } catch (e) { }
        return true;
    })();
}
