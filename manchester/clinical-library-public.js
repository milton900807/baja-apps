function (path, config) {

    // PUBLIC entry point for the Clinical Compound Library.
    //   https://<host>/app/manchester/clinical-library-public
    //
    // Boots a read-only VIEWER graph (same shape as manchester/viewer.js — pan/zoom only,
    // no editing UI, no subscription gate) and opens the library on top of it. Clicking a
    // compound loads it into THIS viewer graph, so a public visitor gets the full load
    // behaviour — target transcript, binding site, chemistry zoom — without the editor.
    //
    // manchester/clinical-library.js itself is unchanged: it takes (graph, layout) and calls
    // load-clinical-compound.js with them, so handing it a viewer graph is all that is needed.

    return (async () => {
        // Upper-right spinning badge instead of a `wid: 'progress'` widget — the progress
        // widget mounts into the button-menu panel, which a read-only screen otherwise has no
        // use for. Same treatment as manchester/viewer.js.
        const __spin = await exec('baja/lib/work-spinner.js', 'Loading library…');
        const progressBar = (pct) => { try { __spin.progress(pct); } catch (e) { } };
        try { progressBar(0); } catch (e) { }

        const graph = await exec('flexigraph/gene.js', progressBar);
        // Read-only, and viewer:true gates editor-only actions (e.g. run-off-targets).
        graph.readonly = true;
        graph.viewer = true;
        try { CurrentLayout.stash('graph', graph); } catch (e) { }
        try { progressBar(40); } catch (e) { }

        // ---- Read-only layout: just the gene graph, no toolbar ---------------------------
        const geneGraph = await graph.createComponent();
        geneGraph.height = '100%';

        const genegraph_panel_layout = {
            wid: 'card',
            componentRef: 'geneGraphPanel',
            data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': geneGraph }]] }
        };
        graph.genegraph_panel_layout = genegraph_panel_layout;

        const main_layout = {
            wid: 'card',
            height: '100%',
            componentRef: 'mainPanel',
            data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': genegraph_panel_layout }]] }
        };

        await showWidget(main_layout);
        try { CurrentLayout.stash('mainPanel', main_layout); } catch (e) { }
        try { progressBar(80); } catch (e) { }

        // Pan/zoom only. Deliberately NOT arming mouse-over-highlight: that is the editing
        // hover menu (edit / delete / design), which must not appear on a public screen.
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { if (graph.selectOff) graph.selectOff(); } catch (e) { }
        // Info/stats card hidden by default, same as manchester/viewer.js — chrome a public
        // visitor did not ask for, and its menu leads into track actions.
        try { graph.showDisplay = false; } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        try { progressBar(100); } catch (e) { }
        try { __spin.stop(); } catch (e) { }

        // Keep the URL clean so the page is shareable as-is.
        try {
            const clean = window.location.origin + '/app/manchester/clinical-library-public';
            if (window.location.href !== clean) window.history.replaceState({}, document.title, clean);
        } catch (e) { }

        // ---- Open the library ------------------------------------------------------------
        // A compound may be deep-linked with ?compound=<compound_id>; otherwise show the shelf.
        let wanted = '';
        try { wanted = new URL(window.location.href).searchParams.get('compound') || ''; } catch (e) { }
        if (!wanted && config && config.compound) wanted = '' + config.compound;

        if (wanted) {
            try {
                const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
                const list = await GETJSON(host + '/load-file?path=/data/clinical/manifest.json&key=wd&user=public');
                const hit = (Array.isArray(list) ? list : []).find((c) =>
                    ('' + (c.compound_id || '')).toLowerCase() === wanted.toLowerCase() ||
                    ('' + (c.name || '')).toLowerCase() === wanted.toLowerCase());
                if (hit) {
                    await exec('manchester/load-clinical-compound.js', graph, genegraph_panel_layout, hit);
                    return graph;
                }
                try { graph.setMessage(' No compound "' + wanted + '" in the library. '); } catch (e) { }
            } catch (e) { }
        }

        try { await exec('manchester/clinical-library.js', graph, genegraph_panel_layout); } catch (e) {
            try { await showWidget({ wid: 'html', data: '<hr> Could not open the clinical library: ' + e }); } catch (e2) { }
        }
        return graph;
    })();
}
