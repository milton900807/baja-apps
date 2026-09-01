function (graph, genegraph_panel_layout) {

    // Data Library — a bookshelf of every kind of DATA LAYER the app can put on a track.
    //   exec('baja/data/data-library.js', graph, genegraph_panel_layout)
    //
    // The catalogue mirrors the groups in baja/data/data-loading-toolbar.js (RNASeq, Patents,
    // microRNA, Variants, Protein) plus the personal/shared sources, so a user can see what
    // exists and open it directly instead of discovering it by walking submenus.
    //
    // Navy shelf look-and-feel, matching manchester/clinical-library.js.

    return (async () => {
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const L = genegraph_panel_layout;

        // ready:false renders greyed with a note instead of being hidden, so the catalogue
        // reads as complete rather than silently short.
        const BOOKS = [
            {
                title: 'RNASeq', badge: 'Coverage', ready: true,
                blurb: 'Per-base read depth by species and tissue. Adds a coverage layer to the '
                    + 'selected tracks, or to every track when nothing is selected.',
                open: () => exec('baja/data/rnaseq-library.js', graph, L)
            },
            {
                title: 'RNASeq — browse by species', badge: 'Coverage', ready: true,
                blurb: 'The same RNASeq tree as a cascading menu: species → tissue → dataset. '
                    + 'Pick a file, then click one track to add it there only.',
                open: () => exec('baja/data/rnaseq-hierarchy-menu.js', graph, L)
            },
            {
                title: 'Variants', badge: 'Variants', ready: true,
                blurb: 'ClinVar, dbSNP, gnomAD and COSMIC variants over the track region, drawn '
                    + 'as lollipops you can drill into.',
                open: () => exec('baja/data/load-variants.js', graph, L)
            },
            {
                title: 'Patents', badge: 'IP', ready: true,
                blurb: 'Sequence-matched patent hits across the track — where published IP '
                    + 'claims overlap the region you are working on.',
                open: () => exec('baja/data/patents.js', graph, L)
            },
            {
                title: 'Conservation', badge: 'Comparative', ready: true,
                blurb: 'Cross-species conservation score as a track layer — useful for judging '
                    + 'whether a target site is under selective constraint.',
                open: () => exec('baja/data/conservation-data.js', graph, L)
            },
            {
                title: 'Cell lines (bigwig)', badge: 'Coverage', ready: true,
                blurb: 'Per-cell-line bigwig coverage tracks.',
                open: () => exec('baja/bio/cell-lines/bigwig-files-menu.js', graph, L)
            },
            {
                title: 'MAF / mutation data', badge: 'Variants', ready: true,
                blurb: 'Mutation Annotation Format data laid over the track.',
                open: () => exec('baja/data/maf-data.js', graph, L)
            },
            {
                title: 'My data', badge: 'Personal', ready: true,
                blurb: 'Files you have uploaded to your own big-data folder — coverage, '
                    + 'intervals and tables you can drop onto a track.',
                open: () => exec('baja/data/my-data.js', graph, L)
            },
            {
                title: 'Public data', badge: 'Reference', ready: true,
                blurb: 'Shared public reference tracks configured for this deployment.',
                open: () => exec('baja/data/public-data.js', graph, L)
            },
            {
                title: 'Data Resources', badge: 'Index', ready: true,
                blurb: 'The compact picker used from a track menu — the same sources, chosen '
                    + 'in place without leaving the canvas.',
                open: () => exec('baja/data/data-resources-library.js', graph, L)
            }
        ];

        return await exec('baja/lib/shelf.js', {
            id: 'baja-data-library',
            title: 'Data Library',
            subtitle: BOOKS.length + ' data sources — click one to add it to your tracks',
            books: BOOKS,
            graph: graph,
            onClose: restoreHover
        });
    })();
}
