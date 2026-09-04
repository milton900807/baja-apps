function (graph, genegraph_panel_layout) {

    // The Library — a library OF the libraries.
    //   exec('baja/lib/library-of-libraries.js', graph, genegraph_panel_layout)
    //
    // There are eight of them now, scattered across the File, Layers and track menus, and no
    // single place said what any of them was. This is that place: one card each, and clicking
    // one opens it.
    //
    // Split into READING and WORKING, because that is the distinction a user actually needs
    // before clicking. Two of these describe things and change nothing; the rest load data onto
    // tracks or run models against them. A flat list of eight would hide exactly the difference
    // that decides whether it is safe to open one mid-analysis.

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
                group: 'Working libraries', note: 'These load data onto tracks or run a model against them.',
                items: [
                    {
                        name: 'The Clinical Compounds Library',
                        blurb: 'Clinical RNA-targeting compounds with their trial records. Opening one loads '
                            + 'its target, maps the compound onto it and zooms to the site.',
                        path: 'manchester/clinical-library.js'
                    },
                    {
                        name: 'Data Resources Library',
                        blurb: 'The catalogue of loadable data: RNASeq coverage, your own files and public '
                            + 'resources. Datasets land on every track on the board.',
                        path: 'baja/data/data-resources-library.js'
                    },
                    {
                        name: 'RNASeq Library',
                        blurb: 'The RNASeq datasets on their own, described by species and tissue, laid over '
                            + 'every track as a coverage layer.',
                        path: 'baja/data/rnaseq-library.js'
                    },
                    {
                        name: 'ML Models Library',
                        blurb: 'The models as things you run: BajaCLIP, BajaSplice, BajaIR and djPrimer, each '
                            + 'writing its prediction onto a track as a layer.',
                        path: 'baja/ml/models-library.js'
                    },
                    {
                        name: 'Data Library',
                        blurb: 'The layer sources as a bookshelf, with documentation links for each dataset.',
                        path: 'baja/data/data-library.js'
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
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            };
            const openShelf = (it) => {
                // Close this one first: two full-screen overlays stacked would leave the user
                // closing twice to get back to the canvas.
                close();
                try {
                    Promise.resolve(exec(it.path, graph, genegraph_panel_layout)).catch((e) => {
                        try { graph.setMessage(' ' + it.name + ' failed: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                    });
                } catch (e) {
                    try { graph.setMessage(' ' + it.name + ' failed: ' + e + ' '); } catch (e2) { }
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

            onKey = (e) => { try { if (e.key === 'Escape') { close(); restoreHover(); } } catch (er) { } };
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
