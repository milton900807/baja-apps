function (graph, genegraph_panel_layout) {

    // The Institute for RNA Therapeutics Design — a library OF the libraries.
    //   exec('baja/lib/library-of-libraries.js', graph, genegraph_panel_layout)
    //
    // The name used to belong to baja/lib/institute-rna-design.js, which is one shelf among
    // these and now carries the name of what it actually holds: the Library of Modalities.
    //
    // They are scattered across the File, Layers and track menus, and no single place said what
    // any of them was. This is that place: one card each, and clicking one opens it.
    //
    // Grouped by what opening one DOES to you, because that is the distinction a user needs
    // before clicking, not after. A flat list would hide exactly the difference that decides
    // whether it is safe to open one mid-analysis. Ordered by how much it does, most first, so
    // the shelves someone came here to USE are at the top and the reading is at the bottom
    // where it can be scrolled to:
    //
    //   WORKING LIBRARIES  load data onto tracks or run models against them
    //   DATA ROOMS         curated collections you browse; opening an entry brings its subject
    //                      onto the board
    //   READING ROOMS      describe things and change nothing

    return (async () => {
        const restoreHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // Nothing user-facing shows a source path, and a thrown error is exactly where one
        // arrives without anyone deciding to put it there. If the helper cannot be loaded the
        // message still goes out, unchanged -- a message is better than no message.
        let __scrub = (t) => '' + (t == null ? '' : t);
        try { const __sn = await exec('baja/lib/script-name.js'); if (__sn && __sn.scrub) __scrub = __sn.scrub; } catch (e) { }

        // Design Library. Unlike every other card here it cannot be reached by path alone:
        // track-design-menu.js takes (graph, TRACK, layout), so a track has to be settled
        // first. One track and there is nothing to ask; several and that is one more shelf;
        // none and say so, because every designer in there works against a track.
        //
        // Returns false when it opens nothing, which is openShelf's signal to say so on the
        // canvas rather than leave the user looking at nothing after a click.
        const designTargets = () => ((graph && graph.track) || []).filter(Boolean);
        const openDesignFor = (t) => exec('baja/manchester/menu/track-design-menu.js', graph, t, genegraph_panel_layout);
        const openDesignLibrary = async () => {
            const ts = designTargets();
            if (!ts.length) {
                const msg = ' Load a track first — the designers all work against one. ';
                try { graph.setResultMessage(msg); } catch (e) { try { graph.setMessage(msg); } catch (e2) { } }
                return false;
            }
            if (ts.length === 1) return openDesignFor(ts[0]);
            return exec('baja/lib/shelf.js', {
                id: 'baja-design-library-tracks',
                title: 'Design Library',
                subtitle: 'Pick the track to design against',
                graph: graph,
                books: ts.map((t, i) => ({
                    title: t.name || ('track ' + (i + 1)),
                    badge: (t.track_type || 'Track'),
                    blurb: 'Open the designers for ' + (t.name || 'this track')
                        + ' — therapeutics, primer probes, off-targets and the compounds already on it.',
                    open: () => openDesignFor(t)
                }))
            });
        };

        const SHELVES = [
            {
                group: 'Working libraries', note: 'These load data onto tracks or run a model against them.',
                items: [
                    {
                        name: 'Design Library',
                        blurb: 'The designers themselves — siRNA, gapmer and steric-blocking ASOs, primer '
                            + 'probes, off-target search, and the compounds already on a track. Everything '
                            + 'else here brings data to look at; this is what makes something new from it.',
                        open: openDesignLibrary
                    },
                    {
                        name: 'Data Resources Library',
                        blurb: 'The catalogue of loadable data: RNASeq coverage, variants, conservation, '
                            + 'microRNA sites, patents, your own files and public resources. Datasets land '
                            + 'on every track on the board.',
                        path: 'baja/data/data-resources-library.js'
                    },
                    {
                        name: 'Machine Learning Models',
                        blurb: 'The models as things you run: BajaCLIP, BajaSplice, BajaIR and djPrimer, each '
                            + 'writing its prediction onto a track as a layer.',
                        path: 'baja/ml/models-library.js'
                    }
                ]
            },
            {
                group: 'Data rooms', note: 'Curated collections — browse one, and opening an entry brings its subject onto the board.',
                items: [
                    {
                        name: 'The Clinical Compounds Library',
                        blurb: 'Clinical RNA-targeting compounds with their trial records. Opening one loads '
                            + 'its target, maps the compound onto it and zooms to the site.',
                        path: 'manchester/clinical-library.js'
                    }
                ]
            },
            {
                group: 'Reading rooms', note: 'Reference only — these describe things and change nothing on the board.',
                items: [
                    {
                        name: 'The Chemistry of RNA Therapeutics',
                        blurb: 'The PDF shelf: reference reading on oligonucleotide chemistry — backbones, '
                            + 'sugar modifications, conjugates and delivery.',
                        path: 'baja/lib/rna-chemistry-library.js'
                    },
                    {
                        name: 'The Data Loading Library',
                        blurb: 'What each data source IS and how to read it — coverage, public tracks, your '
                            + 'own files, variants, off-target indexes and annotation, each with the '
                            + 'inference it does not support.',
                        path: 'baja/data/data-loading-library.js'
                    },
                    {
                        name: 'Library of Modalities',
                        blurb: 'The design space as a map rather than a tool: every modality with what it '
                            + 'does, what it is for, and the clinical precedent for it — RNA as the target, '
                            + 'RNA as the medicine, and the strategies that cut across both.',
                        path: 'baja/lib/institute-rna-design.js'
                    },
                    {
                        name: 'Institute of Machine Learning Models',
                        blurb: 'Every model with its method, its measured evidence against a control, and '
                            + 'its known limits. Read this before trusting a prediction.',
                        path: 'baja/ml/institute-of-models-library.js'
                    }
                ]
            }
        ];

        try {
            const ID = 'baja-library-of-libraries';
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            // Maximized, exactly like the libraries it opens. This was a 940px card floating on
            // a dimmed backdrop while every shelf it launches (baja/lib/shelf.js) is full-bleed
            // inset:0 -- so the one screen whose job is to introduce the libraries was the only
            // one that did not look like them, and clicking into a library made the window jump.
            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

            // The overlay IS the pane now. Kept as a name so the rest of the function reads the
            // same, and so the header/body still mount in one place.
            const pane = overlay;

            const head = document.createElement('div');
            head.style.cssText = 'flex:0 0 auto;display:flex;align-items:flex-end;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
                + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);';
            const total = SHELVES.reduce((n, s) => n + s.items.length, 0);
            head.innerHTML = '<div><div style="font:700 22px Georgia,\'Times New Roman\',serif;">Institute for RNA Therapeutics Design</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + total + ' libraries · pick one to open it</div></div>';
            const x = document.createElement('button');
            x.textContent = '✕ Close';
            x.style.cssText = 'margin-left:auto;flex:0 0 auto;cursor:pointer;border-radius:8px;padding:8px 14px;'
                + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';
            head.appendChild(x);

            const scroll = document.createElement('div');
            scroll.style.cssText = 'flex:1 1 auto;overflow:auto;padding:18px 22px 28px;';

            let onKey = null;

            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            };
                        // The board-level Layers button announces "Data · will load onto all N tracks…" and sets
            // __bajaApplyAllTracks before a library has even opened: it is a statement of intent that a
            // loader consumes (baja/lib/for-each-track.js). If the user leaves without loading anything,
            // nothing consumes it and the spinner sits there saying data is about to arrive when it is
            // not. Leaving a library is the end of that intent, so both go here.
            const dismiss = () => {
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
                close(); restoreHover();
            };


            const openShelf = (it) => {
                // CLOSED, not hidden.
                //
                // This used to hide the root and raise a pill in the bottom-left corner
                // reading "< Institute for RNA Therapeutics Design", so the shelf you came
                // from could be got back to. The pill was the problem: it sat in a corner of
                // an unrelated full-screen library, named a thing rather than an action, and
                // read as a stray navigation control belonging to whatever was on top of it.
                //
                // Closing the root outright is what every other library in this application
                // does, so a Close now means the same thing everywhere: back to the canvas.
                close();
                // A card is either a path to exec or an open() of its own -- Design needs the
                // second, because it has to settle a track before it can name its arguments.
                const run = () => (typeof it.open === 'function')
                    ? it.open()
                    : exec(it.path, graph, genegraph_panel_layout);
                try {
                    Promise.resolve(run()).then((r) => {
                        // false means it decided there was nothing to open. The root has
                        // already gone, so say so rather than leave the user on a bare canvas
                        // wondering whether the click registered.
                        if (r === false) {
                            try { graph.setMessage(' ' + it.name + ' had nothing to open. '); } catch (e2) { }
                        }
                    }).catch((e) => {
                        try { graph.setMessage(' ' + it.name + ' failed: ' + __scrub(e && e.message ? e.message : e) + ' '); } catch (e2) { }
                    });
                } catch (e) {
                    try { graph.setMessage(' ' + it.name + ' failed: ' + __scrub(e) + ' '); } catch (e2) { }
                }
            };

            for (const shelf of SHELVES) {
                const h = document.createElement('div');
                h.style.cssText = 'margin:14px 0 4px;font:700 11px Arial;letter-spacing:1.6px;'
                    + 'text-transform:uppercase;color:#7f9bb8;';
                h.textContent = shelf.group;
                scroll.appendChild(h);

                const n = document.createElement('div');
                n.style.cssText = 'font:12.5px Arial;color:#9fb3c8;margin-bottom:12px;';
                n.textContent = shelf.note;
                scroll.appendChild(n);

                // A grid, not a stack: at full width a stacked card runs the whole monitor for
                // two lines of text. Same shape the shelves use, so a library and the list of
                // libraries lay their cards out the same way.
                const grid = document.createElement('div');
                grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));'
                    + 'gap:16px;align-content:start;margin-bottom:22px;';
                scroll.appendChild(grid);

                for (const it of shelf.items) {
                    const card = document.createElement('div');
                    // The warm 'sunset' look, in the same values baja/lib/shelf.js uses for it
                    // (ACCENTS.sunset there), so a card here and a card on a shelf are the same
                    // card rather than two that merely resemble each other.
                    //
                    // Warm because every card here OPENS something. Inside a shelf the warm/cool
                    // split separates acting from navigating, and by that reading these would be
                    // cool -- but this window holds nothing else to be cool against. A screen of
                    // uniformly cool cards is not making a distinction, it is just quieter, and
                    // clicking one of these is the most consequential click in the app.
                    card.style.cssText = 'cursor:pointer;border-radius:10px;padding:14px 16px;'
                        + 'display:flex;flex-direction:column;'
                        + 'background:linear-gradient(160deg,#2b1503 0%,#4a2408 55%,#6b3410 100%);'
                        + 'border:1px solid rgba(255,163,72,0.55);'
                        + 'box-shadow:0 6px 18px rgba(0,0,0,0.28);transition:transform .12s ease;';
                    card.innerHTML = '<div style="display:flex;align-items:center;gap:10px;">'
                        + '<div style="font:700 15.5px Arial;color:#ffe6c7;flex:1 1 auto;">' + esc(it.name) + '</div>'
                        + '<div style="color:#ffc98a;">▸</div></div>'
                        + '<div style="font:13px/1.55 Arial;color:#e0b48a;margin-top:5px;">' + esc(it.blurb) + '</div>';
                    card.onmouseenter = () => { card.style.borderColor = '#ffb35c'; card.style.transform = 'translateY(-2px)'; };
                    card.onmouseleave = () => { card.style.borderColor = 'rgba(255,163,72,0.55)'; card.style.transform = ''; };
                    card.onclick = () => openShelf(it);
                    grid.appendChild(card);
                }
            }

            // Escape only while the root is the thing on screen. Hidden behind a library, its
            // listener is still attached, and without this the one Escape that closes the child
            // would tear down the root behind it too -- taking the way back with it.
            onKey = (e) => {
                try {
                    if (e.key !== 'Escape') return;
                    if (overlay.style.display === 'none') return;
                    dismiss();
                } catch (er) { }
            };
            x.onclick = () => { dismiss(); };
            // No click-the-backdrop dismiss any more: full-bleed, the "backdrop" is the empty
            // space between cards, and closing the window on a miss-click there would be a
            // trapdoor. Escape and Close are the ways out, as they are on the shelves.
            document.addEventListener('keydown', onKey, true);

            pane.appendChild(head); pane.appendChild(scroll);
            document.body.appendChild(overlay);
        } catch (e) {
            try { graph.setMessage(' Could not open the library: ' + __scrub(e) + ' '); } catch (e2) { }
        }
        return graph;
    })();
}
