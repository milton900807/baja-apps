function (opts) {

    // Reusable "bookshelf" overlay — a titled grid of cards, each with a badge, a name and a
    // one-line description, that runs an action when clicked.
    //
    //   await exec('baja/lib/shelf.js', {
    //       id: 'baja-data-library',          // DOM id, so re-opening replaces rather than stacks
    //       title: 'Data Library',
    //       subtitle: '10 data sources — click one to add it to your tracks',
    //       books: [{ title, badge, blurb, ready, open, section, note, back, leaf,
    //                 toggle, on }],   toggle: true draws a checkbox; `on` ticks it
    //                                       // back: true  -> the left-pointing tag shape
    //                                       // section: full-width heading when the name changes
    //                                       // note: true  -> a line of prose, not a card
    //       graph,                            // optional, for setMessage on failure
    //       onClose                           // optional, e.g. re-arm the hover highlight
    //   });
    //
    // Extracted because this is the FOURTH shelf in the app (clinical-library, rnaseq-library,
    // data-resources-library and now the data / ML libraries) and the markup had been copied
    // each time. A `ready: false` book renders greyed with a note rather than being hidden,
    // so a catalogue reads as complete instead of silently short. `readyNote` replaces the
    // default "coming soon" for a book that is unavailable for a reason the user can fix.

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
        // A STACK THAT SURVIVES THE NEXT LEVEL.
        //
        // A sub-library opened from a card's `books` walks in on this stack and the path is
        // simply its titles. But the selection library does not work that way: each level
        // closes this shelf with reason 'open' and builds a FRESH one, so its stack was
        // always one deep and there was nothing to draw a path from -- which is why that
        // library had to carry its own back cards.
        //
        // So the stack is stashed under the shelf's id when it closes to make room for a
        // continuation, and adopted by the next shelf with that id. A close the user asked
        // for ('dismiss') clears it: that is the end of the session, and the next open
        // starts at the top.
        try { if (!window.__shelfStacks) { window.__shelfStacks = {}; } } catch (e) { }
        const stashKey = o.id || 'baja-shelf';
        let carried = [];
        try {
            const st = window.__shelfStacks && window.__shelfStacks[stashKey];
            if (Array.isArray(st)) { carried = st; }
        } catch (e) { carried = []; }
        // Re-entering a level already on the path is going BACK to it, not deeper: walking
        // Selection > Track > SNPs > a variant > Back lands on titles that repeat, and
        // without this the path would grow every time instead of unwinding.
        const already = carried.findIndex((l) => l && l.title === (o.title || 'Library'));
        if (already >= 0) { carried = carried.slice(0, already); }
        // A SHELF CAN SEARCH SOMETHING IT DOES NOT HOLD. `search(text)` on the options is
        // an async function returning books; while it is set on a level, what is typed in
        // the box is sent to it rather than matched against the cards, and the cards it
        // returns replace the level's. The books given at open are what an empty box shows.
        // That is how a lookup with thousands of answers -- every gene of a genome -- fits
        // the same idiom as a library of eight: type, and the shelf fills with the hits.
        const stack = carried.concat([{ title: o.title || 'Library', subtitle: o.subtitle || '', books: books,
            search: (typeof o.search === 'function') ? o.search : null, restBooks: books }]);
        const level = () => stack[stack.length - 1];
        const asBooks = async (b) => {
            const src = (typeof b.books === 'function') ? await b.books() : b.books;
            return Array.isArray(src) ? src : [];
        };
        // The yellow that marks Back. LIGHT rather than saturated, and the control it marks is
        // small: Back is the one thing on a shelf that does not act on anything, so it should
        // read as a quiet way out rather than compete with the cards. A pale fill carries the
        // color better at this size than an outline ring would -- a 1px ring around a 10px
        // control is more edge than fill.
        const BACK_YELLOW = '#ffe98a';
        const BACK_RING = 'drop-shadow(1px 0 0 ' + BACK_YELLOW + ') drop-shadow(-1px 0 0 ' + BACK_YELLOW + ')'
            + ' drop-shadow(0 1px 0 ' + BACK_YELLOW + ') drop-shadow(0 -1px 0 ' + BACK_YELLOW + ')';
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
            // THE PATH, NOT A BACK BUTTON.
            //
            // Back says only "one step" and says it in the same place whatever shelf you
            // are on, so three levels down it tells you neither where you are nor how far
            // in. The path says both, and every ancestor in it is the way back to that
            // level -- one click to the top from anywhere, instead of Back three times.
            //
            // It lives in the header for the reason the button did: it is navigation, and
            // navigation among the cards reads as one more thing that acts.
            + '<div style="display:flex;flex-direction:column;gap:3px;min-width:0;">'
            + '<div id="shelf-path" style="font:700 19px Arial;display:flex;align-items:baseline;'
            + 'gap:7px;flex-wrap:wrap;min-width:0;"></div>'
            + '<div id="shelf-sub" style="font:12.5px Arial;color:#9fb3c8;">' + esc(o.subtitle || '') + '</div>'
            + '</div>'
            + '<input id="shelf-q" placeholder="' + esc(o.searchPlaceholder || 'Search…') + '" style="flex:1;max-width:340px;margin-left:auto;'
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
            // 'open' is a continuation -- the shelf is getting out of the way of the level
            // it just launched -- so the path is handed to whatever opens next. Anything
            // else ends the session and the path with it.
            try {
                if (window.__shelfStacks) {
                    if (reason === 'open') { window.__shelfStacks[stashKey] = stack.slice(); }
                    else { delete window.__shelfStacks[stashKey]; }
                }
            } catch (e) { }
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            // Leaving (not a continuation) ends the Layers button's "will load onto all
            // tracks" intent: nothing consumed it, so drop the flag and the status line that
            // was announcing it, or the spinner keeps promising data that is not coming.
            if (reason !== 'open') {
                    // The MESSAGE is cleared whether or not the flag survives.
                    //
                    // This was guarded on __bajaApplyAllTracks still being set, which is only
                    // true when nothing consumed it. Anything that narrows the intent first --
                    // the per-track Design menu, a loader that took the flag and then was
                    // cancelled -- left the flag false and this branch unreached, so the
                    // status line kept announcing a board-wide load that had been abandoned.
                    // Clearing the flag again is harmless; leaving the sentence up is not.
                try {
                    window.__bajaApplyAllTracks = false;
                    if (/will load onto all/i.test('' + (window.__workStatus || ''))) {
                        window.__workStatus = '';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    }
                } catch (e) { }
            }
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

        // The path itself. Ancestors are buttons -- each one walks back to that level -- and
        // the level you are on is plain text, because a control that goes where you already
        // are is a control that does nothing.
        const renderPath = () => {
            const el = header.querySelector('#shelf-path');
            if (!el) { return; }
            el.innerHTML = '';
            stack.forEach((lv2, i) => {
                if (i > 0) {
                    const sep = document.createElement('span');
                    sep.style.cssText = 'color:#5b7fa6;font:700 15px Arial;flex:0 0 auto;';
                    sep.textContent = '\u203a';
                    el.appendChild(sep);
                }
                const last = (i === stack.length - 1);
                const node = document.createElement(last ? 'span' : 'button');
                node.textContent = lv2.title || 'Library';
                if (last) {
                    node.style.cssText = 'font:700 19px Arial;color:#eaf6f9;min-width:0;'
                        + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                } else {
                    node.style.cssText = 'cursor:pointer;background:transparent;border:0;padding:0;'
                        + 'font:600 14px Arial;color:#8ab4ff;max-width:220px;overflow:hidden;'
                        + 'text-overflow:ellipsis;white-space:nowrap;flex:0 0 auto;';
                    node.onmouseenter = () => { node.style.textDecoration = 'underline'; };
                    node.onmouseleave = () => { node.style.textDecoration = 'none'; };
                    node.onclick = () => { goToLevel(i); };
                }
                el.appendChild(node);
            });
        };
        // Walk back to a level on the path. Everything below it is dropped -- clicking an
        // ancestor means "I am there now", not "remember where I was".
        const goToLevel = (i) => {
            if (i < 0 || i >= stack.length - 1) { return; }
            if (detailBack) { try { detailBack(); } catch (e) { } }
            stack.length = i + 1;
            try { q.value = ''; } catch (e) { }
            render();
            try { shelf.scrollTop = 0; } catch (e) { }
        };

        const q = header.querySelector('#shelf-q');
        const render = () => {
            const lv = level();
            // The header carries the trail, so a shelf three deep still says where it sits.
            try { renderPath(); } catch (e) { }
            try { header.querySelector('#shelf-sub').textContent = (lv.subtitle || ''); } catch (e) { }
            // Hits from a search hook are already matches; only a held library is filtered.
            const needle = lv.search ? '' : ('' + (q.value || '')).trim().toLowerCase();
            shelf.innerHTML = '';
            let shown = (lv.books || []).filter((b) => !needle
                || ((b.title || '') + ' ' + (b.blurb || '') + ' ' + (b.badge || '')).toLowerCase().indexOf(needle) >= 0);
            // BACK LIVES IN THE PATH, not among the books. A card that navigates sits in the
            // same grid as the cards that DO something and reads as one of them, so every
            // back card is dropped -- the header path is the way out, and it is in the same
            // place on every shelf.
            //
            // Unconditionally now. It used to be kept whenever the shelf had no parent to
            // pop, because the selection library rebuilds a fresh shelf per level and its
            // own back card was the only way back; the stack now survives that rebuild (see
            // the session stash above), so there is always a path to walk instead.
            shown = shown.filter((b) => !(b && b.back));
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
            // yet" is a line the section says, not a card standing in for one.
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
                // A card that goes BACK takes the same left-pointing tag as the header
                // button, for the same reason and so the two read as one control in two
                // places. `back: true` is the book's to declare -- a shelf whose cards open
                // the next level themselves knows which of them navigate, and guessing from
                // the title would catch a compound that happens to be called 'Back'.
                const isBack = !!b.back;
                const card = document.createElement('div');
                card.style.cssText = 'background:#0b2545;'
                    + (isBack
                        ? 'border:0;clip-path:polygon(0% 50%, 18px 0%, 100% 0%, 100% 100%, 18px 100%);'
                        + 'border-radius:0 12px 12px 0;padding:16px 18px 16px 30px;'
                        + 'filter:' + BACK_RING + ';'
                        : 'border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px 18px;')
                    + 'display:flex;flex-direction:column;gap:9px;'
                    // A DISABLED CARD IS DIMMED PER ELEMENT, NOT WITH opacity ON THE CARD.
                    // Opacity multiplies through every child, so it faded the very note that
                    // explains why the card is disabled -- the one thing on it the user needs
                    // to read. The title and blurb are muted individually below and the note is
                    // left at full strength.
                    + 'box-shadow:0 6px 18px rgba(0,0,0,0.28);'
                    + (ready ? 'cursor:pointer;' : 'background:#0a1c33;border-color:rgba(255,255,255,0.07);');
                if (ready) {
                    // A clipped card has no border to light up, so it brightens instead.
                    card.onmouseenter = () => {
                        if (isBack) card.style.background = '#123663';
                        else card.style.borderColor = '#12c2e0';
                        card.style.transform = 'translateY(-2px)';
                    };
                    card.onmouseleave = () => {
                        if (isBack) card.style.background = '#0b2545';
                        else card.style.borderColor = 'rgba(255,255,255,0.12)';
                        card.style.transform = '';
                    };
                }
                // `sunset` is the warm look the canvas uses for its own prompts
                // (setSunsetMessage), and it marks a card that DOES something.
                //
                // Every LEAF gets it now, without being asked. A shelf holds two kinds of card
                // and the difference is the only thing a reader needs before clicking: one
                // opens another level and costs nothing, the other runs -- loads data onto
                // every track, starts a design, deletes a selection. That was carried by a
                // small '›' at the end of a title, which is a lot of weight for one glyph.
                // Warm for the leaves, cool for the levels, so the two are told apart at a
                // glance across every library rather than only where someone remembered to
                // set an accent.
                //
                // An explicit accent still wins, so a card that has something more particular
                // to say -- a track's violet in the selection library -- keeps saying it.
                // ACCENTS. One card look was a boolean for 'sunset'; it is a small palette now,
                // because a shelf that mixes kinds of card needs more than two states. Each
                // entry is [background, resting border, hover border, chip wash, chip ink,
                // title ink, blurb ink]. Unlisted accents fall through to the default look, so
                // an accent this file does not know is a plain card rather than a broken one.
                const ACCENTS = {
                    // Warm: a TOOL that arms a gesture on the canvas.
                    sunset: ['linear-gradient(160deg,#2b1503 0%,#4a2408 55%,#6b3410 100%)',
                        'rgba(255,163,72,0.55)', '#ffb35c',
                        'rgba(255,163,72,0.18)', '#ffc98a', '#ffe6c7', '#e0b48a'],
                    // Clinical: a VARIANT. A mutation in a list beside tracks, oligos and
                    // annotations is a different kind of thing from all of them -- it is the
                    // finding rather than the apparatus -- and it should be picked out of that
                    // list without reading a word. Magenta because that is already what a
                    // marked variant is drawn in on the karyotype, so the two agree.
                    variant: ['linear-gradient(160deg,#2a0713 0%,#4a0f24 55%,#6b1636 100%)',
                        'rgba(244,114,182,0.55)', '#f9a8d4',
                        'rgba(244,114,182,0.20)', '#f9a8d4', '#ffe4f1', '#e7b9cf'],
                    // RUNS SOMETHING. A card that starts a computation is not a card that
                    // opens a panel, and the difference is what the person is about to spend:
                    // a server call, a minute of waiting, a result that replaces what is on
                    // screen. Every other card in a library is free and instant. Teal, which
                    // nothing else here uses, plus a solid badge with a play mark on it -- so
                    // the badge stops describing the card and starts looking like a button.
                    run: ['linear-gradient(160deg,#04232b 0%,#07414f 55%,#0a5f73 100%)',
                        'rgba(45,212,191,0.60)', '#5eead4',
                        'rgba(45,212,191,0.22)', '#99f6e4', '#e6fffb', '#a7d8d4']
                };
                // `books` is what makes a card a level rather than a leaf -- an array, or a
                // function returning one. Same test the '›' at the end of the title uses, so
                // the color and the glyph cannot disagree about what a card is.
                //
                // `leaf` overrides it, for a shelf whose cards open the next level THEMSELVES
                // rather than by handing back books. The selection library is the one that
                // does: every card there carries an open() that calls the menu's own click
                // handler, so by the books test all of them look like leaves and the whole
                // shelf would come out warm. It says which of its cards act and which navigate.
                const isLeaf = (b.leaf != null) ? !!b.leaf : !b.books;
                // Back is never accented: it is not a leaf that acts, and giving it the warm
                // look would say it does something.
                // EVERY CARD IS SUNSET, node or leaf.
                //
                // The warm look used to mark a LEAF -- a card that acts rather than one that
                // opens another level -- and navy meant "there is more inside". That put two
                // signals on the same card for the same thing: the color and the '›' at the
                // end of the title both said node-or-leaf, so one of them was redundant and the
                // shelf read as two kinds of place rather than one. The chevron keeps saying it;
                // the color is now just the shelf's color.
                //
                // An explicit `accent` still wins. That is a different axis -- what KIND of
                // thing the card is, like a variant among tracks and oligos -- and it is not
                // the node/leaf distinction being removed here.
                const A = isBack ? null : (ACCENTS[b.accent] || ACCENTS.sunset);
                // A SELECTED card is green all over -- background, border, hover -- not a tick
                // in its title: a set built by clicking cards one after another has to be
                // readable at a glance down the shelf. `selected: true` is the book's to say;
                // purely additive, cards without it are unchanged.
                const SEL = b.selected && !isBack
                    ? ['linear-gradient(160deg,#052e16 0%,#14532d 55%,#166534 100%)', 'rgba(74,222,128,0.65)', '#86efac'] : null;
                if (A) {
                    if (ready) {
                        card.style.background = SEL ? SEL[0] : A[0];
                        card.style.borderColor = SEL ? SEL[1] : A[1];
                        card.style.boxShadow = SEL ? '0 0 0 1px rgba(74,222,128,0.35), 0 6px 18px rgba(22,163,74,0.35)' : '';
                        card.onmouseenter = () => { card.style.borderColor = SEL ? SEL[2] : A[2]; card.style.transform = 'translateY(-2px)'; };
                        card.onmouseleave = () => { card.style.borderColor = SEL ? SEL[1] : A[1]; card.style.transform = ''; };
                    } else {
                        // A disabled card keeps the family but drops out of it: the same hue,
                        // darkened and desaturated, so it still belongs to the shelf while
                        // clearly not being available. Set here rather than left to the
                        // stylesheet above, which this assignment would otherwise overwrite.
                        card.style.background = 'linear-gradient(160deg,#1c1208 0%,#2a1a0c 55%,#331f10 100%)';
                        card.style.borderColor = 'rgba(255,163,72,0.18)';
                    }
                }
                card.innerHTML = ''
                    + '<div style="display:flex;align-items:center;gap:8px;">'
                    // A TOGGLE SAYS SO IN BOTH STATES. A card that switches something on and
                    // off is a different kind of thing from one that does a job once, and the
                    // difference has to be visible BEFORE it is clicked rather than inferred
                    // from a badge reading "off" -- which reads just as easily as the name of
                    // what the card would do. The box is drawn either way, at the same size,
                    // so a column of toggles lines up and only the ticks differ. `toggle: true`
                    // is the book's to say; cards without it are unchanged.
                    + (b.toggle ? ('<span aria-hidden="true" style="flex:0 0 auto;width:18px;height:18px;'
                        + 'border-radius:5px;display:inline-flex;align-items:center;justify-content:center;'
                        + 'font:700 13px/1 Arial;'
                        + (b.on ? 'background:#16a34a;border:1px solid #4ade80;color:#f0fdf4;'
                                : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.34);color:transparent;')
                        + '">\u2713</span>') : '')
                    // A SWATCH: a filled dot showing an actual color the card stands for (a
                    // sample's color, say), glowing a little in that color so it reads. Purely
                    // additive -- cards without `swatch` are unchanged.
                    + (b.swatch ? ('<span style="flex:0 0 auto;width:16px;height:16px;border-radius:50%;'
                        + 'background:' + esc(b.swatch) + ';box-shadow:0 0 6px ' + esc(b.swatch) + ';'
                        + 'border:1px solid rgba(255,255,255,0.55);"></span>') : '')
                    // AN ICON IS A GLYPH OR A MATERIAL NAME. An emoji is drawn as text; a
                    // Material Icons name -- `biotech`, `file_download`, the same names the
                    // toolbars use -- is drawn through the icon font, so a card and the button
                    // that opened it can wear the same symbol. A bare identifier is never a
                    // glyph anyone meant to show as a word.
                    + (b.icon ? ('<span style="flex:0 0 auto;width:26px;height:26px;border-radius:8px;'
                        + 'display:inline-flex;align-items:center;justify-content:center;font:16px/1 Arial;'
                        + 'background:' + (A ? A[3] : 'rgba(18,194,224,0.14)') + ';'
                        + 'color:' + (A ? A[4] : '#4fd0e6') + ';">'
                        + (/^[a-z][a-z0-9_]*$/.test('' + b.icon)
                            ? ('<span class="material-icons" style="font-size:18px;line-height:1;">' + esc(b.icon) + '</span>')
                            : esc(b.icon))
                        + '</span>') : '')
                    // A RUN CARD ALWAYS CARRIES ITS BADGE, even with nothing to say in it:
                    // the badge is the part that says "this executes", so a run card without
                    // one would be the only run card that did not look like one.
                    + ((b.badge || b.accent === 'run') ? ('<span style="flex:0 0 auto;border-radius:999px;'
                        + 'padding:3px 9px;font:700 10.5px Arial;'
                        + (b.accent === 'run'
                            ? 'background:#2dd4bf;color:#042f2e;box-shadow:0 0 10px rgba(45,212,191,0.45);'
                            : ('background:' + (A ? A[3] : 'rgba(18,194,224,0.16)') + ';'
                               + 'color:' + (A ? A[4] : '#4fd0e6') + ';'))
                        + '">'
                        + (b.accent === 'run' ? '\u25B6\u2009' : '')
                        + esc(b.badge || 'run') + '</span>') : '')
                    // WHY it is unavailable, when the book says. "coming soon" is right for a
                    // feature that does not exist yet and wrong for one that is merely missing
                    // a prerequisite -- the user can act on the second and not on the first.
                    + (ready ? '' : ('<span style="flex:0 1 auto;min-width:0;margin-left:auto;border-radius:12px;'
                        + 'padding:3px 10px;font:700 11px/1.35 Arial;background:rgba(255,176,32,0.16);'
                        + 'color:#ffb020;border:1px solid rgba(255,176,32,0.45);'
                        // A long reason wraps inside its pill instead of running off the card edge:
                        // it may shrink (flex:0 1), break anywhere, and word-wrap rather than stay
                        // a single nowrap line, so it always sits within the card.
                        + 'white-space:normal;overflow-wrap:anywhere;word-break:break-word;text-align:right;">'
                        + esc(b.readyNote || 'coming soon') + '</span>'))
                    + '</div>'
                    // The › marks a card that opens ANOTHER library rather than loading
                    // something, so the difference is visible before the click, not after it.
                    + '<div style="font:700 15px Arial;color:'
                    + (ready ? (A ? A[5] : '#eaf6f9') : '#9b8571') + ';">' + esc(b.title)
                    + (b.books ? (' <span style="color:'
                        + (ready ? (A ? A[4] : '#4fd0e6') : '#7a6247')
                        + ';font:700 15px Arial;">\u203a</span>') : '') + '</div>'
                    // The blurb of a disabled card carries the instructions for enabling it, so
                    // it is muted rather than faded: readable, visibly secondary to the note.
                    + '<div style="font:12px/1.55 Arial;color:'
                    + (ready ? (A ? A[6] : '#9fb3c8') : '#b39a80') + ';">'
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
                            focusUnlessMobile(q);
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
            // AN OPTION THE MODEL NEEDS BEFORE IT RUNS.
            //
            // Some books cannot act until they know WHICH of something -- which RBP, which
            // cell line. That used to be asked after Load, in a full-screen list that
            // replaced the editor, so the page describing the model and the page choosing
            // what to run it on were two different screens with the canvas unmounted
            // between them. It belongs on the page you are already reading.
            //
            //   docs.choice = { label, note, value, options }
            //     options : an array, or a function returning one (may be async, so a list
            //               that costs a server call is fetched when the page opens)
            //     each    : { value, label, note } -- or a plain string
            //
            // The chosen value is handed to open(): open(value). A book with no choice is
            // called open() with nothing, exactly as before.
            const choice = (d.choice && typeof d.choice === 'object') ? d.choice : null;
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
                + (choice ? ('<div style="font:700 12px Arial;color:#4fd0e6;margin:20px 0 8px;">'
                    + esc(choice.label || 'Choose one') + '</div>'
                    + '<select id="shelf-choice" style="width:100%;max-width:460px;background:#0b2545;'
                    + 'color:#eaf6f9;border:1px solid rgba(255,255,255,0.22);border-radius:9px;'
                    + 'padding:10px 12px;font:13.5px Arial;">'
                    + '<option>Loading\u2026</option></select>'
                    + '<div id="shelf-choice-note" style="font:12px/1.55 Arial;color:#9fb3c8;'
                    + 'margin-top:7px;max-width:640px;"></div>') : '')
                + '<div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap;">'
                + (typeof b.open === 'function' ? ('<button id="shelf-load" style="cursor:pointer;border-radius:9px;'
                    + 'padding:11px 18px;font:700 13.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">'
                    + 'Load</button>') : '')
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
                try { renderPath(); } catch (e) { }
            };
            detailBack = back;
            // While the reference view is up, the header Back would pop the shelf UNDER it.
            try { renderPath(); } catch (e) { }
            try { pane.querySelector('#shelf-back').onclick = back; } catch (e) { }
            try { pane.querySelector('#shelf-done').onclick = () => close('dismiss'); } catch (e) { }
            // Fill the picker. Load is held until the list is in: running with whatever
            // "Loading…" happens to mean is worse than a button that waits a moment.
            let chosen = null;
            const loadBtn = pane.querySelector('#shelf-load');
            if (choice) {
                const sel = pane.querySelector('#shelf-choice');
                const noteEl = pane.querySelector('#shelf-choice-note');
                if (loadBtn) { loadBtn.disabled = true; loadBtn.style.opacity = '0.55'; }
                (async () => {
                    let opts = [];
                    try {
                        opts = (typeof choice.options === 'function') ? await choice.options() : choice.options;
                    } catch (e) { opts = []; }
                    opts = (Array.isArray(opts) ? opts : []).map((o) =>
                        (o && typeof o === 'object') ? o : { value: '' + o, label: '' + o });
                    if (!sel) return;
                    if (!opts.length) {
                        // Say so on the page rather than offering an empty menu.
                        sel.innerHTML = '<option>Nothing to choose from</option>';
                        sel.disabled = true;
                        if (noteEl) { noteEl.textContent = choice.empty || 'This list could not be read.'; }
                        return;
                    }
                    sel.innerHTML = opts.map((o) => '<option value="' + esc(o.value) + '">'
                        + esc(o.label || o.value) + '</option>').join('');
                    const want = ('' + (choice.value == null ? '' : choice.value));
                    const at = opts.findIndex((o) => ('' + o.value) === want);
                    sel.selectedIndex = at >= 0 ? at : 0;
                    const say = () => {
                        const o = opts[sel.selectedIndex] || opts[0];
                        chosen = o ? o.value : null;
                        if (noteEl) { noteEl.textContent = (o && o.note) ? o.note : (choice.note || ''); }
                    };
                    sel.onchange = say;
                    say();
                    if (loadBtn) { loadBtn.disabled = false; loadBtn.style.opacity = ''; }
                })();
            }
            try {
                if (loadBtn) loadBtn.onclick = async () => {
                    if (loadBtn.disabled) return;
                    close('open');
                    try { await b.open(chosen); }
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


        // Typing: a level with a search hook asks it, a little after the last keystroke,
        // and shows what comes back -- unless the box has moved on by then. An empty box
        // puts the level's own books back.
        let searchTimer = null, searchSeq = 0;
        q.oninput = () => {
            const lv = level();
            if (typeof lv.search !== 'function') { render(); return; }
            const text = ('' + (q.value || '')).trim();
            if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
            if (!text) { lv.books = lv.restBooks || []; render(); return; }
            const seq = ++searchSeq;
            searchTimer = setTimeout(async () => {
                searchTimer = null;
                let found = [];
                try { found = await lv.search(text); }
                catch (e) { found = [{ note: true, title: 'The search failed: ' + (e && e.message ? e.message : e), blurb: '' }]; }
                if (seq !== searchSeq || level() !== lv) return;
                lv.books = Array.isArray(found) ? found : [];
                render();
            }, 220);
        };
        render();
        focusUnlessMobile(q);
        return true;
    })();
}
