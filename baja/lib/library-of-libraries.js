function (graph, genegraph_panel_layout) {

    // The Library — a library OF the libraries.
    //   exec('baja/lib/library-of-libraries.js', graph, genegraph_panel_layout)
    //
    // They are scattered across the File, Layers and track menus, and no single place said what
    // any of them was. This is that place: one card each, and clicking one opens it.
    //
    // Grouped by what opening one DOES to you, because that is the distinction a user needs
    // before clicking, not after. READING ROOMS describe things and change nothing. DATA ROOMS
    // are curated collections you browse, where opening an entry brings its subject onto the
    // board. WORKING LIBRARIES load data onto tracks or run models against them. A flat list
    // would hide exactly the difference that decides whether it is safe to open one
    // mid-analysis.

    return (async () => {
        const restoreHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const SHELVES = [
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
                        name: 'Institute of Machine Learning Models',
                        blurb: 'Every model with its method, its measured evidence against a control, and '
                            + 'its known limits. Read this before trusting a prediction.',
                        path: 'baja/ml/institute-of-models-library.js'
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
                group: 'Working libraries', note: 'These load data onto tracks or run a model against them.',
                items: [
                    {
                        name: 'Data Resources Library',
                        blurb: 'The catalogue of loadable data: RNASeq coverage, variants, conservation, '
                            + 'microRNA sites, patents, your own files and public resources. Datasets land '
                            + 'on every track on the board.',
                        path: 'baja/data/data-resources-library.js'
                    },
                    {
                        name: 'ML Models Library',
                        blurb: 'The models as things you run: BajaCLIP, BajaSplice, BajaIR and djPrimer, each '
                            + 'writing its prediction onto a track as a layer.',
                        path: 'baja/ml/models-library.js'
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
            head.innerHTML = '<div><div style="font:700 22px Georgia,\'Times New Roman\',serif;">The Library</div>'
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
            let chip = null, watch = null, sawChild = false;

            const dropChip = () => {
                try { if (watch) clearInterval(watch); } catch (e) { }
                watch = null;
                try { if (chip && chip.parentNode) chip.parentNode.removeChild(chip); } catch (e) { }
                chip = null;
            };
            const close = () => {
                dropChip();
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            };

            // Is one of the libraries still on screen? Every one of them -- the four that run on
            // baja/lib/shelf.js and the four with their own overlay -- mounts a position:fixed
            // element on document.body in the same z-index band (2147483000-2147483350). Asking
            // the band makes this a property of the family rather than a list of DOM ids that
            // would silently fall out of step the next time one is added.
            const libraryUp = () => {
                try {
                    const kids = (document.body && document.body.children) || [];
                    for (let i = 0; i < kids.length; i++) {
                        const el = kids[i];
                        if (el === overlay || el === chip) continue;
                        const st = (typeof window !== 'undefined' && window.getComputedStyle)
                            ? window.getComputedStyle(el) : null;
                        if (!st || st.position !== 'fixed' || st.display === 'none') continue;
                        if (parseInt(st.zIndex, 10) >= 2147483000) return true;
                    }
                } catch (e) { }
                return false;
            };

            const backHome = () => {
                dropChip();
                try { overlay.style.display = 'flex'; } catch (e) { }
            };

            // The way back to the root. Bottom-left, clear of every library's own header --
            // shelf.js puts Back top-left and Search/Close top-right, and the four custom ones
            // put Close top-right too.
            const showChip = (name) => {
                try {
                    dropChip();
                    chip = document.createElement('div');
                    chip.title = 'Back to The Library';
                    chip.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483400;cursor:pointer;'
                        + 'display:flex;align-items:center;gap:9px;padding:9px 15px;border-radius:999px;'
                        + 'background:#0b2545;color:#e8f0fb;border:1px solid rgba(255,255,255,0.22);'
                        + 'box-shadow:0 10px 26px rgba(0,0,0,0.5);'
                        + 'font:700 12.5px Arial,Helvetica,sans-serif;';
                    chip.innerHTML = '<span>\u2039 The Library</span>'
                        + (name ? '<span style="font-weight:400;color:#9fb3c8;">' + esc(name) + '</span>' : '');
                    chip.onclick = backHome;
                    document.body.appendChild(chip);

                    // The chip belongs to the library it was raised for, so it goes when that
                    // library does -- otherwise it sits over the canvas offering to reopen a
                    // window the user has already left.
                    sawChild = false;
                    watch = setInterval(() => {
                        try {
                            if (libraryUp()) { sawChild = true; return; }
                            // Not before the child has actually appeared. exec() is async, so for
                            // a moment after the click nothing is up yet, and checking blind would
                            // remove the chip before the thing it belongs to existed.
                            if (sawChild) dropChip();
                        } catch (e) { }
                    }, 500);
                } catch (e) { }
            };

            const openShelf = (it) => {
                // HIDDEN, not destroyed. Every one of these libraries used to be a dead end:
                // its Close puts you on the canvas, so getting back to the shelf you were
                // reading meant finding the menu that opened The Library in the first place.
                // Keeping the root alive underneath makes the chip below a real Back.
                //
                // Hidden rather than left showing, because a child overlay is opaque and
                // full-bleed anyway, and a display:none root cannot take Escape or a stray
                // click meant for the library on top of it.
                try { overlay.style.display = 'none'; } catch (e) { }
                showChip(it.name);
                try {
                    Promise.resolve(exec(it.path, graph, genegraph_panel_layout)).catch((e) => {
                        try { graph.setMessage(' ' + it.name + ' failed: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                        backHome();
                    });
                } catch (e) {
                    try { graph.setMessage(' ' + it.name + ' failed: ' + e + ' '); } catch (e2) { }
                    backHome();
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
                    card.style.cssText = 'cursor:pointer;border:1px solid rgba(255,255,255,0.12);border-radius:10px;'
                        + 'background:rgba(255,255,255,0.04);padding:14px 16px;display:flex;flex-direction:column;';
                    card.innerHTML = '<div style="display:flex;align-items:center;gap:10px;">'
                        + '<div style="font:700 15.5px Arial;flex:1 1 auto;">' + esc(it.name) + '</div>'
                        + '<div style="color:#7f9bb8;">▸</div></div>'
                        + '<div style="font:13px/1.55 Arial;color:#c3d2e2;margin-top:5px;">' + esc(it.blurb) + '</div>';
                    card.onmouseenter = () => { card.style.background = 'rgba(255,255,255,0.09)'; };
                    card.onmouseleave = () => { card.style.background = 'rgba(255,255,255,0.04)'; };
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
                    close(); restoreHover();
                } catch (er) { }
            };
            x.onclick = () => { close(); restoreHover(); };
            // No click-the-backdrop dismiss any more: full-bleed, the "backdrop" is the empty
            // space between cards, and closing the window on a miss-click there would be a
            // trapdoor. Escape and Close are the ways out, as they are on the shelves.
            document.addEventListener('keydown', onKey, true);

            pane.appendChild(head); pane.appendChild(scroll);
            document.body.appendChild(overlay);
        } catch (e) {
            try { graph.setMessage(' Could not open the library: ' + e + ' '); } catch (e2) { }
        }
        return graph;
    })();
}
