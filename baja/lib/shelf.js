function (opts) {

    // Reusable "bookshelf" overlay — a titled grid of cards, each with a badge, a name and a
    // one-line description, that runs an action when clicked.
    //
    //   await exec('baja/lib/shelf.js', {
    //       id: 'baja-data-library',          // DOM id, so re-opening replaces rather than stacks
    //       title: 'Data Library',
    //       subtitle: '10 data sources — click one to add it to your tracks',
    //       books: [{ title, badge, blurb, ready, open, section, note }],
    //                                       // section: full-width heading when the name changes
    //                                       // note: true  -> a line of prose, not a card
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

        // A shelf can hold other SHELVES. A book carrying `books` -- an array, or a function
        // returning one (may be async, so a sub-library can be fetched when it is opened rather
        // than built up front) -- is a sub-library: clicking it walks INTO it, in this same
        // overlay, instead of dropping the user into a side menu. Only a LEAF, a book with an
        // `open` and no `books`, performs an action.
        //
        // That is the whole point: one idiom the entire way down. You are looking at a library
        // until the moment something is actually loaded, so "which source, then which class of
        // variant" is two more shelves rather than a shelf that turns into a popup menu.
        // A card with both is treated as a sub-library; put the action on a leaf inside it.
        const stack = [{ title: o.title || 'Library', subtitle: o.subtitle || '', books: books }];
        const level = () => stack[stack.length - 1];
        const asBooks = async (b) => {
            const src = (typeof b.books === 'function') ? await b.books() : b.books;
            return Array.isArray(src) ? src : [];
        };
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
            + '<button id="shelf-up" style="display:none;cursor:pointer;flex:0 0 auto;border-radius:8px;'
            + 'padding:9px 14px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);'
            + 'background:transparent;color:#fff;">\u2039 Back</button>'
            + '<div style="display:flex;flex-direction:column;gap:2px;min-width:0;">'
            + '<div id="shelf-title" style="font:700 19px Arial;">' + esc(o.title || 'Library') + '</div>'
            + '<div id="shelf-sub" style="font:12.5px Arial;color:#9fb3c8;">' + esc(o.subtitle || '') + '</div>'
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
        // `reason` tells onClose WHY the shelf went away, which is the difference between the
        // user leaving and the shelf getting out of the way of the thing it just launched:
        //
        //   'dismiss'  the ✕, Escape at the top level, or Close in a reference view
        //   'open'     a card was activated -- the shelf closes first so the action has the
        //              screen, and whatever it opens is the continuation of this session
        //
        // Without it a caller cannot tell the two apart, because both arrive here as a close.
        const close = (reason) => {
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            try { if (typeof o.onClose === 'function') o.onClose(reason || 'dismiss'); } catch (e) { }
        };
        // Escape walks OUT one level before it closes: inside a sub-library it is the same
        // gesture as Back, which is what a nested view has to mean, or three levels down the
        // only way out is to lose your place entirely.
        // Escape unwinds ONE thing at a time, innermost first: an open reference view, then a
        // sub-library, and only at the top does it close. Popping a level while a detail pane
        // was open would have left the pane sitting over a shelf it no longer belonged to.
        let detailBack = null;
        onKey = (e) => {
            try {
                if (e.key !== 'Escape') return;
                if (detailBack) { detailBack(); return; }
                if (stack.length > 1) { up(); return; }
                close('dismiss');
            } catch (er) { }
        };
        document.addEventListener('keydown', onKey, true);
        header.querySelector('#shelf-x').onclick = () => close('dismiss');

        const q = header.querySelector('#shelf-q');
        const render = () => {
            const lv = level();
            // The header carries the trail, so a shelf three deep still says where it sits.
            try { header.querySelector('#shelf-title').textContent = lv.title || 'Library'; } catch (e) { }
            try {
                const trail = stack.slice(0, -1).map((l) => l.title).join(' \u203a ');
                header.querySelector('#shelf-sub').textContent = (trail ? trail + ' \u203a ' : '') + (lv.subtitle || '');
            } catch (e) { }
            // Not while a reference view is up: the search box stays live behind it, and a
            // keystroke there would otherwise put the shelf's Back button back on screen.
            try { header.querySelector('#shelf-up').style.display = (!detailBack && stack.length > 1 ? '' : 'none'); } catch (e) { }
            const needle = ('' + (q.value || '')).trim().toLowerCase();
            shelf.innerHTML = '';
            const shown = (lv.books || []).filter((b) => !needle
                || ((b.title || '') + ' ' + (b.blurb || '') + ' ' + (b.badge || '')).toLowerCase().indexOf(needle) >= 0);
            if (!shown.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'grid-column:1/-1;color:#9fb3c8;font:13px Arial;padding:24px;';
                empty.textContent = 'Nothing matches.';
                shelf.appendChild(empty);
                return;
            }
            // SECTIONS. A book carrying `section` opens a full-width heading when the name
            // changes, so one shelf can hold two kinds of thing without reading as one list --
            // the selection library's tools and the things currently selected, say. Books with
            // no `section` render exactly as before, so every existing shelf is untouched.
            //
            // Headings come off the books that SURVIVED the search filter, so a section whose
            // cards were all filtered out does not leave its title standing over nothing.
            //
            // A book with `note: true` is not a card at all: a full-width line of prose. It is
            // how a section says something when it has nothing to show -- "nothing is selected
            // yet" belongs under the Selected items heading, not in place of it.
            let lastSection = null;
            for (const b of shown) {
                const sec = b.section || null;
                if (sec !== lastSection) {
                    lastSection = sec;
                    if (sec) {
                        const sh = document.createElement('div');
                        sh.style.cssText = 'grid-column:1/-1;margin:6px 0 -2px;font:700 11px Arial;'
                            + 'letter-spacing:1.6px;text-transform:uppercase;color:#7f9bb8;';
                        sh.textContent = sec;
                        shelf.appendChild(sh);
                    }
                }
                if (b.note) {
                    const nt = document.createElement('div');
                    nt.style.cssText = 'grid-column:1/-1;color:#9fb3c8;font:13px/1.6 Arial;'
                        + 'padding:2px 2px 6px;';
                    nt.textContent = ('' + (b.blurb || b.title || '')).trim();
                    shelf.appendChild(nt);
                    continue;
                }
                const ready = (b.ready !== false);
                const card = document.createElement('div');
                card.style.cssText = 'background:#0b2545;border:1px solid rgba(255,255,255,0.12);border-radius:12px;'
                    + 'padding:16px 18px;display:flex;flex-direction:column;gap:9px;'
                    + 'box-shadow:0 6px 18px rgba(0,0,0,0.28);' + (ready ? 'cursor:pointer;' : 'opacity:0.55;');
                if (ready) {
                    card.onmouseenter = () => { card.style.borderColor = '#12c2e0'; card.style.transform = 'translateY(-2px)'; };
                    card.onmouseleave = () => { card.style.borderColor = 'rgba(255,255,255,0.12)'; card.style.transform = ''; };
                }
                // `accent: 'sunset'` is the warm look the canvas uses for its own prompts
                // (setSunsetMessage), and it marks the cards that are TOOLS rather than
                // things -- a card that arms a gesture on the canvas, not one that opens a
                // level or acts on something already selected. Same shelf, one visual break,
                // so the two kinds are not read as one list.
                const __sun = (b.accent === 'sunset');
                if (__sun) {
                    card.style.background = 'linear-gradient(160deg,#2b1503 0%,#4a2408 55%,#6b3410 100%)';
                    card.style.borderColor = 'rgba(255,163,72,0.55)';
                    card.onmouseenter = () => { card.style.borderColor = '#ffb35c'; card.style.transform = 'translateY(-2px)'; };
                    card.onmouseleave = () => { card.style.borderColor = 'rgba(255,163,72,0.55)'; card.style.transform = ''; };
                }
                card.innerHTML = ''
                    + '<div style="display:flex;align-items:center;gap:8px;">'
                    + (b.icon ? ('<span style="flex:0 0 auto;width:26px;height:26px;border-radius:8px;'
                        + 'display:inline-flex;align-items:center;justify-content:center;font:16px/1 Arial;'
                        + 'background:' + (__sun ? 'rgba(255,163,72,0.18)' : 'rgba(18,194,224,0.14)') + ';">'
                        + esc(b.icon) + '</span>') : '')
                    + (b.badge ? ('<span style="flex:0 0 auto;border-radius:999px;padding:3px 9px;font:700 10.5px Arial;'
                        + 'background:' + (__sun ? 'rgba(255,163,72,0.18)' : 'rgba(18,194,224,0.16)') + ';'
                        + 'color:' + (__sun ? '#ffc98a' : '#4fd0e6') + ';">' + esc(b.badge) + '</span>') : '')
                    + (ready ? '' : '<span style="color:#8fb8c8;font:11.5px Arial;margin-left:auto;">coming soon</span>')
                    + '</div>'
                    // The › marks a card that opens ANOTHER library rather than loading
                    // something, so the difference is visible before the click, not after it.
                    + '<div style="font:700 15px Arial;color:' + (__sun ? '#ffe6c7' : '#eaf6f9') + ';">' + esc(b.title)
                    + (b.books ? ' <span style="color:#4fd0e6;font:700 15px Arial;">\u203a</span>' : '') + '</div>'
                    + '<div style="font:12px/1.55 Arial;color:' + (__sun ? '#e0b48a' : '#9fb3c8') + ';">'
                    + esc(b.blurb || '') + '</div>';
                if (ready) {
                    card.onclick = async () => {
                        // Three kinds of card, in the order they take precedence: a sub-library
                        // walks in, a documented book shows its reference view, a leaf acts.
                        if (b.books) {
                            let sub = [];
                            try { sub = await asBooks(b); }
                            catch (e) {
                                try { if (graph && graph.setMessage) graph.setMessage(' Could not open ' + b.title + ': ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                                return;
                            }
                            // An empty sub-library would look like a card that does nothing at
                            // all, which is the failure this whole file exists to avoid.
                            if (!sub.length) {
                                try { if (graph && graph.setMessage) graph.setMessage(' ' + b.title + ' has nothing in it yet. '); } catch (e2) { }
                                return;
                            }
                            stack.push({ title: b.title, subtitle: b.subtitle || b.blurb || '', books: sub });
                            q.value = '';
                            render();
                            try { shelf.scrollTop = 0; } catch (e) { }
                            try { q.focus(); } catch (e) { }
                            return;
                        }
                        // A book WITH docs opens its reference view first; the action is then an
                        // explicit choice there. Without docs the card runs the action directly,
                        // so shelves that predate this are unaffected.
                        if (b.docs) { showDetail(b); return; }
                        if (typeof b.open !== 'function') return;
                        close('open');
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
                detailBack = null;
                // The header's Back belongs to the shelf again, and says so.
                try { header.querySelector('#shelf-up').style.display = (stack.length > 1 ? '' : 'none'); } catch (e) { }
            };
            detailBack = back;
            // While the reference view is up, the header Back would pop the shelf UNDER it.
            try { header.querySelector('#shelf-up').style.display = 'none'; } catch (e) { }
            try { pane.querySelector('#shelf-back').onclick = back; } catch (e) { }
            try { pane.querySelector('#shelf-done').onclick = () => close('dismiss'); } catch (e) { }
            try {
                const lb = pane.querySelector('#shelf-load');
                if (lb) lb.onclick = async () => {
                    close('open');
                    try { await b.open(); }
                    catch (e) {
                        try { if (graph && graph.setMessage) graph.setMessage(' Could not open ' + b.title + ': ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                    }
                };
            } catch (e) { }
        };

        // Walking out of a sub-library: pop one level, drop the search so the parent is not
        // shown pre-filtered by a word that was typed for the child.
        const up = () => {
            if (detailBack) { detailBack(); return; }
            if (stack.length > 1) { stack.pop(); q.value = ''; render(); try { shelf.scrollTop = 0; } catch (e) { } }
        };
        try { header.querySelector('#shelf-up').onclick = up; } catch (e) { }

        q.oninput = render;
        render();
        try { q.focus(); } catch (e) { }
        return true;
    })();
}
