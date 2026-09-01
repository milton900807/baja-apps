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

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:rgba(6,14,26,0.74);'
                + 'display:flex;align-items:stretch;justify-content:center;padding:22px;font-family:Arial,Helvetica,sans-serif;';

            const pane = document.createElement('div');
            pane.style.cssText = 'width:100%;max-width:940px;height:100%;display:flex;flex-direction:column;'
                + 'background:#0b2545;color:#e8f0fb;border:1px solid rgba(255,255,255,0.14);border-radius:12px;'
                + 'box-shadow:0 24px 60px rgba(0,0,0,0.5);overflow:hidden;';

            const head = document.createElement('div');
            head.style.cssText = 'flex:0 0 auto;display:flex;align-items:flex-end;gap:16px;padding:18px 24px 15px;'
                + 'border-bottom:1px solid rgba(255,255,255,0.12);';
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
            scroll.style.cssText = 'flex:1 1 auto;overflow:auto;padding:16px 24px 26px;';

            let onKey = null;
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            };
            const openShelf = (it) => {
                // Close this one first: two full-screen overlays stacked would leave the user
                // closing twice to get back to the canvas.
                close();
                try { graph.setMessage(' Opening ' + it.name + '… '); } catch (e) { }
                try { Promise.resolve(exec(it.path, graph, genegraph_panel_layout)).catch((e) => {
                    try { graph.setMessage(' ' + it.name + ' failed: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                }); } catch (e) {
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
                n.style.cssText = 'font:12.5px Arial;color:#9fb3c8;margin-bottom:10px;';
                n.textContent = shelf.note;
                scroll.appendChild(n);

                for (const it of shelf.items) {
                    const card = document.createElement('div');
                    card.style.cssText = 'cursor:pointer;border:1px solid rgba(255,255,255,0.12);border-radius:10px;'
                        + 'background:rgba(255,255,255,0.04);padding:14px 16px;margin-bottom:10px;';
                    card.innerHTML = '<div style="display:flex;align-items:center;gap:10px;">'
                        + '<div style="font:700 15.5px Arial;flex:1 1 auto;">' + esc(it.name) + '</div>'
                        + '<div style="color:#7f9bb8;">▸</div></div>'
                        + '<div style="font:13px/1.55 Arial;color:#c3d2e2;margin-top:5px;">' + esc(it.blurb) + '</div>';
                    card.onmouseenter = () => { card.style.background = 'rgba(255,255,255,0.09)'; };
                    card.onmouseleave = () => { card.style.background = 'rgba(255,255,255,0.04)'; };
                    card.onclick = () => openShelf(it);
                    scroll.appendChild(card);
                }
            }

            onKey = (e) => { try { if (e.key === 'Escape') { close(); restoreHover(); } } catch (er) { } };
            x.onclick = () => { close(); restoreHover(); };
            overlay.onclick = (ev) => { if (ev.target === overlay) { close(); restoreHover(); } };
            document.addEventListener('keydown', onKey, true);

            pane.appendChild(head); pane.appendChild(scroll);
            overlay.appendChild(pane);
            document.body.appendChild(overlay);
        } catch (e) {
            try { graph.setMessage(' Could not open the library: ' + e + ' '); } catch (e2) { }
        }
        return graph;
    })();
}
