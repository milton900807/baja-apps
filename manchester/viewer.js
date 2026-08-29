function (path, config) {

    // Read-only VIEWER for a shared gene-graph (.baja) screen. Same rendering as
    // manchester/editor.js — it reuses the shared graph modules (gene.js / track.js /
    // snpindel.js …), so every feature (sequence, SNP lollipops, codon row, 3D codons,
    // layers, protein, etc.) shows automatically — but with NO editing UI: only pan/zoom
    // navigation. Intended for sharing a screen without write privileges. No subscription
    // gate, and public files load for anyone with the link.

    // Async IIFE so top-level await compiles on both exec()/run() engine paths.
    return (async () => {

        let progressBar;
        const progW = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                progress: 1,
                progressBar: createIonFunction((pb) => { progressBar = pb; })
            }
        };
        await showWidget(progW);
        try { progressBar(0); } catch (e) { }

        // Resolve the .baja path. PREFER a share CODE (?s=…) resolved server-side, so the
        // owner's email (embedded in the path) never appears in the browser URL. Fall back
        // to the path arg, config.path, or a legacy ?path= link.
        const __host0 = window['env']['apiUrl'];
        const __isBaja = (s) => { try { return /\.baja$/i.test(decodeURIComponent('' + (s || ''))); } catch (e) { return /\.baja$/i.test('' + (s || '')); } };
        let __code = '';
        try { __code = new URL(window.location.href).searchParams.get('s') || ''; } catch (e) { }
        let __p = '';
        if (__code) {
            try {
                const __rr = await GETJSON(__host0 + '/share-resolve?code=' + encodeURIComponent(__code));
                if (__rr && __rr.path) __p = '' + __rr.path;
            } catch (e) { }
        }
        if (!__isBaja(__p)) __p = '' + (path || '');
        if (!__isBaja(__p)) {
            try { if (config && typeof config === 'object' && config.path && __isBaja(config.path)) __p = '' + config.path; } catch (e) { }
        }
        if (!__isBaja(__p)) {
            try {
                const __qp = new URL(window.location.href).searchParams.get('path');
                if (__qp) __p = __qp;
            } catch (e) { }
        }
        path = decodeURIComponent('' + __p);

        // Scrub the address bar so the email-bearing path is never displayed: keep only
        // ?s=<code> when we came from a short link, otherwise a bare viewer URL.
        try {
            const __clean = window.location.origin + '/app/manchester/viewer' + (__code ? ('?s=' + encodeURIComponent(__code)) : '');
            if (window.location.href !== __clean) window.history.replaceState({}, document.title, __clean);
        } catch (e) { }

        const graph = await exec('flexigraph/gene.js', progressBar);
        graph.readonly = true;              // signal read-only to any component that checks it
        graph.viewer = true;                // this is the VIEWER (not the editor): gates editor-only
                                            // actions such as running off-targets (run-off-targets.js)
        try { CurrentLayout.stash('graph', graph); } catch (e) { }

        // ---- Load the shared file (public first for a bare share link, else the user's) ----
        if (path.endsWith('.baja')) {
            const host_ = window['env']['apiUrl'];
            const loadFile = async (obj) => {
                try { return await POSTJSON(obj, host_ + '/load-file'); } catch (e) { return { msg: '' + e }; }
            };

            const isUserPath = (config != null && config.user != null) || path.startsWith('/myfiles/');
            let jsonobj = isUserPath
                ? { path: path, key: 'user', user: getUser() }
                : { path: path, user: 'public' };

            let rs = await loadFile(jsonobj);

            // Follow a share pointer ({ shared_from: "<real path>" }).
            if (rs && rs.shared_from) {
                jsonobj.path = ('' + rs.shared_from).startsWith('/') ? rs.shared_from : ('/' + rs.shared_from);
                rs = await loadFile(jsonobj);
            }
            // Fallback: a public lookup that failed → try the signed-in user's copy.
            if ((!rs || (rs.msg && rs.msg.length)) && !isUserPath) {
                let rs2 = await loadFile({ path: path, key: 'user', user: getUser() });
                if (rs2 && !(rs2.msg && rs2.msg.length)) rs = rs2;
            }

            try { progressBar(45); } catch (e) { }

            const hasContent = rs && (rs.viewport || rs.track || rs.tracks || rs.shapes);
            if (!hasContent) {
                await showWidget({ wid: 'html', data: '<hr> Could not open this shared screen. ' + ((rs && rs.msg) ? rs.msg : '') });
                return;
            }

            try {
                await graph.update(rs);
                graph.file = path.substring(path.lastIndexOf('/') + 1);
            } catch (e) {
                await showWidget({ wid: 'html', data: '<hr> Failed to render the shared screen: ' + e });
                return;
            }
        } else {
            await showWidget({ wid: 'html', data: '<hr> Not a shareable screen.' });
            return;
        }

        try { progressBar(70); } catch (e) { }

        // ---- Read-only layout: JUST the gene graph, no top menubar / controls. ----
        const geneGraph = await graph.createComponent();
        geneGraph.height = '100%';

        const genegraph_panel_layout = {
            wid: 'card',
            componentRef: 'geneGraphPanel',
            data: {
                cards: [
                    [
                        { 'width': '100%', 'height': '100%', 'component': geneGraph }
                    ]
                ]
            }
        };
        graph.genegraph_panel_layout = genegraph_panel_layout;

        const main_layout = {
            wid: 'card',
            height: '100%',
            componentRef: 'mainPanel',
            data: {
                cards: [
                    [
                        { 'width': '100%', 'height': '100%', 'component': genegraph_panel_layout }
                    ]
                ]
            }
        };

        await showWidget(main_layout);
        try { CurrentLayout.stash('mainPanel', main_layout); } catch (e) { }
        try { progressBar(100); } catch (e) { }

        // Read-only interaction: pan/zoom only. Intentionally do NOT arm the editing
        // mouse-over-highlight (which exposes edit/delete menus) — this keeps it view-only.
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { if (graph.selectOff) graph.selectOff(); } catch (e) { }
        // Show the small stats card — in a read-only screen its menu offers only
        // navigation (center on a track) and Export, giving the viewer an export entry
        // point without any modifying menus.
        try { graph.showDisplay = true; } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }
    })();
}
