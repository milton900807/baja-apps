function (graph, layout) {

    // Camera-view bookmarks — Navigate ▸ Bookmarks. Save the current view under a name and
    // return to it later; rename or delete the ones you have. Rendered as a shelf
    // (baja/lib/shelf.js), the same idiom Navigate itself uses.
    //
    // ONE store. Bookmarks live in the graph's native `graph.bookmarks` map ({ name -> grid
    // snapshot }), which getState() serializes with the design and the loader rebuilds as
    // MGrids — so they TRAVEL WITH THE FILE and everyone who opens it, or a share of it, gets
    // the same views. Saving goes through graph.setBookmark and travel through
    // graph.goToBookmark, the same methods the rest of the editor uses, so there is no second
    // system to keep in step.

    return (async () => {
        if (!graph.bookmarks || typeof graph.bookmarks !== 'object') graph.bookmarks = {};

        const names = () => Object.keys(graph.bookmarks || {});
        const gridCoord = (b, which) => {
            try { if (b && typeof b['get' + which] === 'function') return b['get' + which](); } catch (e) { }
            return b ? b[which] : undefined;
        };
        const fmt = (n) => {
            const a = Math.abs(+n);
            if (!isFinite(a)) return '' + n;
            if (a >= 1e6) return (+n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
            if (a >= 1e3) return (+n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
            return '' + Math.round(+n);
        };
        const describe = (b) => {
            const xi = gridCoord(b, 'xmin'), xf = gridCoord(b, 'xmax');
            return (xi != null && xf != null) ? ('x ' + fmt(xi) + '–' + fmt(xf)) : 'A saved view.';
        };

        const open = async () => {
            const list = names();
            const books = [];
            books.push({
                title: 'Save current view…', badge: 'New', ready: true, leaf: true,
                blurb: 'Name the view you are looking at now and keep it with the design.',
                open: async () => {
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
                    try { graph.setBookmark(('' + name).trim()); }
                    catch (e) { try { graph.addBookmark(('' + name).trim(), graph.graph.grid); } catch (e2) { } }
                    try { graph.setMessage(' Bookmark "' + ('' + name).trim() + '" saved with the design. '); } catch (e) { }
                    open();
                }
            });
            if (list.length) books.push({ title: 'Saved views', section: true, note: true });
            list.forEach((nm) => {
                const b = graph.bookmarks[nm];
                books.push({
                    title: nm, badge: 'View', ready: true, blurb: describe(b),
                    books: () => [
                        { title: 'Go to this view', badge: 'Camera', ready: true, leaf: true, blurb: 'Move the camera here.', open: () => { try { graph.goToBookmark(graph.bookmarks[nm]); } catch (e) { } } },
                        {
                            title: 'Rename…', badge: 'Edit', ready: true, leaf: true, blurb: 'Change this bookmark’s name.',
                            open: async () => {
                                let nn = '';
                                try {
                                    nn = await exec('baja/lib/prompt-name.js', {
                                        title: 'Rename bookmark', label: 'Bookmark name', value: nm,
                                        confirmLabel: 'Rename', validate: (v) => (('' + v).trim().length ? '' : 'Give the bookmark a name.')
                                    });
                                } catch (e) { nn = null; }
                                nn = nn && ('' + nn).trim();
                                if (nn && nn !== nm) {
                                    graph.bookmarks[nn] = graph.bookmarks[nm];
                                    delete graph.bookmarks[nm];
                                    try { graph.buildBookmark(); } catch (e) { }
                                }
                                open();
                            }
                        },
                        {
                            title: 'Delete', badge: 'Remove', ready: true, leaf: true, blurb: 'Forget this view.',
                            open: () => {
                                try { delete graph.bookmarks[nm]; graph.buildBookmark(); } catch (e) { }
                                try { graph.setMessage(' Bookmark deleted. '); } catch (e) { }
                                open();
                            }
                        }
                    ]
                });
            });

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
