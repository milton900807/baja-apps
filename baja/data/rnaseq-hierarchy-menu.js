function (graph, genegraph_panel_layout) {
    // Navigate the RNASeq data hierarchy under BIG_DATA (baja-bd/RNASeq/<Species>/<Tissue>/
    // *.bw) as a cascading SIDE MENU. Listing goes through a python exec (list-rnaseq.py)
    // rather than /get-nodes, because that browser confines bigdata to the user's own
    // folder and can't see shared reference data at the BIG_DATA root. Pick a .bw file,
    // then click a track to add it as a coverage (polygon) layer.

    const restoreHover = () => {
        // Reset the mouse BEFORE re-arming the hover. Loading a dataset can leave a
        // click-a-track listener or a 'msg:' mouse mode behind, and re-arming on top of one
        // leaves the canvas in a mode the user never chose.
        try { graph.clearMouseListeners(); } catch (e) { }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
    };

    // Friendly file label: drop the GTEX sample-id prefix and the .RNAseq/.mRNACov and
    // .bw tags, so "GTEX-13X6J-…-SM-5P9HE.Brain_Cerebellar_Hemisphere.RNAseq.bw" reads as
    // "Brain Cerebellar Hemisphere".
    const prettyLabel = (name) => {
        let n = ('' + name).replace(/\.(bw|bigwig)$/i, '');
        n = n.replace(/^GTEX-[A-Za-z0-9-]+\./i, '');     // strip GTEX sample id
        n = n.replace(/\.(RNAseq|mRNACov)$/i, '');       // strip assay tag
        n = n.replace(/[_.]+/g, ' ').trim();             // tidy separators
        return n || ('' + name);
    };

    // List one level of BIG_DATA/RNASeq -> { folders:[{name,sub}], files:[{name,path}] }.
    const listLevel = async (sub) => {
        let em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
        try {
            const r = await exec('py/bio/list-rnaseq.py', em, '' + (sub || ''));
            let folders = [], files = [];
            try { folders = JSON.parse(r.folders); } catch (e) { }
            try { files = JSON.parse(r.files); } catch (e) { }
            return { folders, files, error: (r && r.error) || null };
        } catch (e) {
            return { folders: [], files: [], error: '' + e };
        }
    };

    // After choosing a file, click a track to add the bigwig as a coverage layer.
    const loadBigwigOntoTrack = (filePath, fileName) => {
        // One clicked track, or every track on the canvas when the board-level Layers button
        // asked for it -- see baja/lib/for-each-track.js.
        exec('baja/lib/for-each-track.js', graph,
            'Click a track to add "' + prettyLabel(fileName) + '" as an RNASeq layer.',
            async (t) => {
            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(' ' + (t.name || 'track') + ' has no chromosome defined. ');
                restoreHover(); return;
            }
            const range = { start: t.xi, end: t.xf };
            let TrackLayer = await exec('baja/bio/track-layer.js');
            let em = new EngineMonitor((msg) => { try { log(msg); } catch (e) { } });
            graph.setMessage(' ⠋ Loading ' + prettyLabel(fileName) + '… ');
            // filePath is already a /bd/... path from list-rnaseq.py.
            exec('py/baja/bigwig/view-bigwig.py', em, filePath, range.start, range.end, t.chr).then(async (res) => {
                try {
                    let rv = JSON.parse(res.values);
                    let rs_base = prettyLabel(fileName);
                    let layer = new TrackLayer(rs_base, range.start, 0, range.end, 1);
                    let max_exp = rv.reduce((max, tuple) => Math.max(max, tuple[1]), -Infinity);
                    if (!max_exp) { max_exp = 1.0; }
                    layer.addPolygonPoint(range.start, 0);
                    for (let v of rv) {
                        if (v === NaN) { v = 0; }
                        layer.addPolygonPoint(v[0], v[1] / max_exp);
                    }
                    layer.addPolygonPoint(range.end, 0);
                    layer.sortPolygonPoints();
                    t.addLayer(layer);
                    if (graph.wake) graph.wake();
                    // Shown as a toast so the load is visibly confirmed -- see the note in
                    // baja/data/rnaseq-library.js.
                    graph.setResultMessage(' Added ' + rs_base + ' to ' + (t.name || 'track') + '. ');
                } catch (e) {
                    graph.setMessage(' Failed to load ' + prettyLabel(fileName) + ': ' + e + ' ');
                }
                restoreHover();
            });
        });
    };

    // Cascading side menu: descend folders (species -> tissue -> …), list *.bw files.
    const showLevel = async (sub, title, parent) => {
        graph.setMessage(' Loading ' + title + '… ');
        const { folders, files, error } = await listLevel(sub);

        const items = [];
        if (parent) {
            items.push({ label: '← Back', move: () => { }, click: () => showLevel(parent.sub, parent.title, parent.parent) });
        }
        for (const f of folders) {
            items.push({ label: f.name + ' ▸', move: () => { }, click: () => showLevel(f.sub, f.name, { sub, title, parent }) });
        }
        for (const file of files) {
            items.push({
                label: prettyLabel(file.name), move: () => { },
                click: () => { graph.showSideMenu(null); loadBigwigOntoTrack(file.path, file.name); }
            });
        }
        if (!folders.length && !files.length) {
            items.push({ label: error ? ('(' + error + ')') : '(no RNASeq data here)', move: () => { }, click: () => { } });
        }
        graph.showSideMenu(items);
        try { graph.setMessage(''); } catch (e) { }
    };

    showLevel('', 'RNASeq', null);
}
