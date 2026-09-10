function (graph, layout) {

    // Camera-view bookmarks. Save the current view (the grid's x/y window) under a name and
    // return to it later; rename or delete the ones you have. Reached from Navigate ▸
    // Bookmarks. Rendered as a shelf (baja/lib/shelf.js), the same idiom Navigate itself uses.
    //
    // Bookmarks live on the graph for the session and in localStorage keyed by the design, so
    // they survive a reload without changing the saved .baja format. Four numbers and a name
    // each -- a camera position, not the data.

    return (async () => {
        // The grid that owns the camera. Same resolution view-history.js uses.
        const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
        const grid = (gg && gg.grid) ? gg.grid : gg;
        if (!grid || !grid.getxmin || !grid.setxmin) {
            try { graph.setError('This view has no camera to bookmark.', 6); } catch (e) { }
            return;
        }

        const snap = () => ({ xmin: grid.getxmin(), xmax: grid.getxmax(), ymin: grid.getymin(), ymax: grid.getymax() });

        // Animate the camera to a saved view (cubic ease-out), superseding any in-flight move.
        let __animId = 0;
        const goTo = (st) => {
            if (!st) return;
            const from = snap(), to = st, startMs = Date.now(), DUR = 600, myId = ++__animId;
            const ease = (p) => 1 - Math.pow(1 - p, 3);
            const step = () => {
                if (myId !== __animId) return;
                const p = Math.min(1, (Date.now() - startMs) / DUR), e = ease(p);
                try {
                    grid.setxmin(from.xmin + (to.xmin - from.xmin) * e);
                    grid.setxmax(from.xmax + (to.xmax - from.xmax) * e);
                    grid.setymin(from.ymin + (to.ymin - from.ymin) * e);
                    grid.setymax(from.ymax + (to.ymax - from.ymax) * e);
                    if (grid.rescale) grid.rescale();
                    if (graph.wake) graph.wake();
                } catch (e2) { }
                if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };

        // ---- persistence ---------------------------------------------------------------
        const key = (function () {
            let who = '';
            try { who = (typeof getUser === 'function') ? ('' + (getUser() || '')) : ''; } catch (e) { }
            const where = ('' + (graph.file || graph.folder || 'workbench')).replace(/\.baja$/i, '');
            return 'baja.camera.bookmarks.v1:' + who + ':' + where;
        })();
        const load = () => {
            if (Array.isArray(graph.__cameraBookmarks)) return graph.__cameraBookmarks;
            let arr = [];
            try { const raw = localStorage.getItem(key); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) arr = p; } } catch (e) { arr = []; }
            graph.__cameraBookmarks = arr;
            return arr;
        };
        const persist = () => {
            try { localStorage.setItem(key, JSON.stringify(graph.__cameraBookmarks || [])); } catch (e) { }
        };

        const fmtCoord = (n) => {
            const a = Math.abs(+n);
            if (!isFinite(a)) return '' + n;
            if (a >= 1e6) return (+n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
            if (a >= 1e3) return (+n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
            return '' + Math.round(+n);
        };
        const describe = (b) => 'x ' + fmtCoord(b.xmin) + '–' + fmtCoord(b.xmax)
            + (b.at ? ('  ·  ' + new Date(b.at).toLocaleDateString()) : '');

        // ---- the shelf, rebuilt after every change so the list stays current -----------
        const open = async () => {
            const bms = load();
            const books = [];
            books.push({
                title: 'Save current view…', badge: 'New', ready: true, leaf: true,
                blurb: 'Name the view you are looking at now and keep it here.',
                open: async () => {
                    const st = snap();
                    let name = '';
                    try {
                        name = await exec('baja/lib/prompt-name.js', {
                            title: 'Save this view',
                            message: 'The current zoom and position, kept under a name.',
                            label: 'Bookmark name',
                            placeholder: 'e.g. Exon 3 close-up',
                            confirmLabel: 'Save',
                            validate: (v) => (('' + v).trim().length ? '' : 'Give the bookmark a name.')
                        });
                    } catch (e) { name = null; }
                    if (!name) { open(); return; }
                    const list = load();
                    // A repeated name replaces its view rather than making a second entry with
                    // the same label -- "update this bookmark" is what saving over a name means.
                    const existing = list.find((b) => ('' + b.name).toLowerCase() === ('' + name).trim().toLowerCase());
                    if (existing) { existing.xmin = st.xmin; existing.xmax = st.xmax; existing.ymin = st.ymin; existing.ymax = st.ymax; existing.at = Date.now(); }
                    else { list.push({ name: ('' + name).trim(), xmin: st.xmin, xmax: st.xmax, ymin: st.ymin, ymax: st.ymax, at: Date.now() }); }
                    graph.__cameraBookmarks = list; persist();
                    try { graph.setMessage(' Bookmark "' + ('' + name).trim() + '" saved. '); } catch (e) { }
                    open();
                }
            });
            if (bms.length) books.push({ title: 'Saved views', section: true, note: true });
            bms.forEach((b, i) => books.push({
                title: b.name || ('view ' + (i + 1)), badge: 'View', ready: true, blurb: describe(b),
                books: () => [
                    { title: 'Go to this view', badge: 'Camera', ready: true, leaf: true, blurb: 'Move the camera here.', open: () => { goTo(b); } },
                    {
                        title: 'Rename…', badge: 'Edit', ready: true, leaf: true, blurb: 'Change this bookmark’s name.',
                        open: async () => {
                            let nm = '';
                            try {
                                nm = await exec('baja/lib/prompt-name.js', {
                                    title: 'Rename bookmark', label: 'Bookmark name', value: b.name || '',
                                    confirmLabel: 'Rename', validate: (v) => (('' + v).trim().length ? '' : 'Give the bookmark a name.')
                                });
                            } catch (e) { nm = null; }
                            if (nm) { b.name = ('' + nm).trim(); persist(); }
                            open();
                        }
                    },
                    {
                        title: 'Delete', badge: 'Remove', ready: true, leaf: true, blurb: 'Forget this view.',
                        open: () => {
                            const list = load();
                            const idx = list.indexOf(b);
                            if (idx >= 0) { list.splice(idx, 1); graph.__cameraBookmarks = list; persist(); }
                            try { graph.setMessage(' Bookmark deleted. '); } catch (e) { }
                            open();
                        }
                    }
                ]
            }));

            await exec('baja/lib/shelf.js', {
                id: 'baja-bookmarks-library',
                title: 'Bookmarks',
                subtitle: 'Save the current camera view with a name, and return to it later',
                graph: graph,
                books: books
            });
        };

        await open();
    })();
}
