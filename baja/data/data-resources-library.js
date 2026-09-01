function (graph, genegraph_panel_layout, tracks) {

    // Same contract as the ML Models Library: `tracks` is the set this library loads onto,
    // handed down from whoever opened it rather than decided here.

    // Data Resources — the shelf the user lands on from a track's Layers menu. Each card is
    // a class of data that can be added to the board as track layers; RNASeq opens the
    // RNASeq Library (baja/data/rnaseq-library.js), which lists the individual datasets.
    //   exec('baja/data/data-resources-library.js', graph, genegraph_panel_layout)
    //
    // Navy demo look-and-feel, matching manchester/clinical-library.js.

    return (async () => {
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // Each resource: what it is, and what opening it does. `open` runs after the shelf
        // closes. `ready:false` cards are shown greyed with a note instead of being hidden,
        // so the catalogue reads as complete.
        const RESOURCES = [
            {
                key: 'rnaseq',
                title: 'RNASeq',
                badge: 'Coverage',
                ready: true,
                blurb: 'Per-base read depth from the RNASeq reference tree, organised by species and tissue. '
                    + 'Choosing a dataset adds it as a coverage layer to every track on the board.',
                open: async () => { await exec('baja/data/rnaseq-library.js', graph, genegraph_panel_layout, tracks); }
            },
            {
                key: 'patents',
                title: 'Patents',
                badge: 'IP',
                ready: true,
                blurb: 'Sequence-matched patent hits from the 2020-2026 transcript-keyed index. '
                    + 'Adds the hits as an interval layer, stacked into lanes, so published IP '
                    + 'claims sit alongside the region you are designing against.',
                open: async () => { await exec('baja/data/patents.js', graph, genegraph_panel_layout, tracks); }
            },
            {
                key: 'mydata',
                title: 'My data',
                badge: 'Personal',
                ready: true,
                blurb: 'Files you have uploaded to your own big-data folder — bigwig coverage, '
                    + 'intervals and tables you can drop onto a track as a layer.',
                open: async () => { await exec('baja/data/my-data.js', graph, genegraph_panel_layout, tracks); }
            },
            {
                key: 'public',
                title: 'Public data',
                badge: 'Reference',
                ready: true,
                blurb: 'Shared public reference tracks configured for this deployment.',
                // NB: public-data.js takes (graph, layout, presetResource) -- it has no tracks
                // parameter. Passing the array here made presetResource truthy, so the card
                // skipped its own list and tried to arm the track array as a resource. It
                // picks its targets up from the all-tracks flag instead, via for-each-track.
                open: async () => { await exec('baja/data/public-data.js', graph, genegraph_panel_layout); }
            }
        ];

        // ---- Overlay panel --------------------------------------------------------------
        try { const old = document.getElementById('baja-data-resources'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const overlay = document.createElement('div');
        overlay.id = 'baja-data-resources';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;padding:16px 22px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
            + 'display:flex;align-items:center;gap:16px;box-shadow:0 6px 20px rgba(0,0,0,0.35);';
        header.innerHTML = ''
            + '<div style="display:flex;flex-direction:column;gap:2px;">'
            + '<div style="font:700 19px Arial;">Data Resources</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;">Pick a class of data to add to the board as track layers</div>'
            + '</div>'
            + '<button id="dr-close" style="cursor:pointer;flex:0 0 auto;margin-left:auto;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">✕ Close</button>';

        const shelf = document.createElement('div');
        shelf.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px;display:grid;'
            + 'grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;align-content:start;';

        overlay.appendChild(header); overlay.appendChild(shelf);
        document.body.appendChild(overlay);

        let onKey = null;
        const close = () => {
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
        };
        onKey = (e) => { try { if (e.key === 'Escape') { close(); restoreHover(); } } catch (er) { } };
        document.addEventListener('keydown', onKey, true);
        header.querySelector('#dr-close').onclick = () => { close(); restoreHover(); };

        for (const r of RESOURCES) {
            const card = document.createElement('div');
            card.style.cssText = 'background:#0b2545;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:16px 18px;'
                + 'display:flex;flex-direction:column;gap:9px;box-shadow:0 6px 18px rgba(0,0,0,0.28);'
                + (r.ready ? 'cursor:pointer;' : 'opacity:0.55;');
            if (r.ready) {
                card.onmouseenter = () => { card.style.borderColor = '#12c2e0'; card.style.transform = 'translateY(-2px)'; };
                card.onmouseleave = () => { card.style.borderColor = 'rgba(255,255,255,0.12)'; card.style.transform = ''; };
            }
            card.innerHTML = ''
                + '<div style="display:flex;align-items:center;gap:8px;">'
                + '<span style="flex:0 0 auto;border-radius:999px;padding:3px 9px;font:700 10.5px Arial;background:rgba(18,194,224,0.16);color:#4fd0e6;">' + esc(r.badge) + '</span>'
                + (r.ready ? '' : '<span style="color:#8fb8c8;font:11.5px Arial;margin-left:auto;">coming soon</span>')
                + '</div>'
                + '<div style="font:700 15px Arial;color:#eaf6f9;">' + esc(r.title) + '</div>'
                + '<div style="font:12px/1.55 Arial;color:#9fb3c8;">' + esc(r.blurb) + '</div>';
            if (r.ready) {
                card.onclick = async () => {
                    close();
                    try { await r.open(); }
                    catch (e) { try { graph.setMessage(' Could not open ' + r.title + ': ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { } restoreHover(); }
                };
            }
            shelf.appendChild(card);
        }
    })();
}
