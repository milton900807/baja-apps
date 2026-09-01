function (graph, genegraph_panel_layout) {

    // ML Models Library — a bookshelf of every predictive model the app can run over a track,
    // each producing a track LAYER.
    //   exec('baja/ml/models-library.js', graph, genegraph_panel_layout)
    //
    // Same set the Predictive-models toolbar and the track menu's Models ▸ offer, gathered in
    // one place with a description of what each model actually predicts — the toolbar gives
    // names only, which is no help if you do not already know them.

    return (async () => {
        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const L = genegraph_panel_layout;

        const BOOKS = [
            {
                title: 'RNA Binding Proteins', badge: 'bajaclip', ready: true,
                blurb: 'Per-position RBP binding score across the track, drawn as a coverage '
                    + 'layer. Run on a selected sequence to score just that range.',
                open: () => exec('baja/bio/rbp/rbp-profile.js', graph, L)
            },
            {
                title: 'Splicing — site strength', badge: 'bajasplice', ready: true,
                blurb: 'Donor / acceptor splice-site strength along the transcript, for judging '
                    + 'whether a site is strong enough to be used.',
                open: () => exec('baja/bio/splicing/splicing-profile.js', graph, L)
            },
            {
                title: 'Splicing — PSI', badge: 'bajasplice', ready: true,
                blurb: 'Percent-spliced-in prediction. Needs the transcript\'s exon structure, '
                    + 'so it always runs on the whole track rather than a selection.',
                open: () => exec('baja/bio/splicing/splicing-profile.js', graph, L)
            },
            {
                title: 'Primer design — djPrimer', badge: 'djprimer', ready: true,
                blurb: 'primer3 designs ranked by an assay-success model, placed on the track '
                    + 'as amplicons with their predicted probability.',
                open: () => exec('baja/manchester/menu/track-design-menu.js', graph, (graph.track || [])[0], L)
            },
            {
                title: 'Train a model', badge: 'Training', ready: true,
                blurb: 'Build a training set from sequences on the board and fit your own '
                    + 'layer model.',
                open: () => exec('baja/ml/training-set-menu.js', graph, L)
            },
            {
                title: 'Model manager', badge: 'Manage', ready: true,
                blurb: 'Inspect, rename and remove the models available to this account.',
                open: () => exec('baja/ml/ml-manager.js', graph, L)
            },
            {
                title: 'Peptide', badge: 'Model', ready: false,
                blurb: 'Peptide-level prediction over the translated sequence. Not wired up yet.',
                open: () => { try { graph.setMessage(' Peptide model — coming soon. '); } catch (e) { } }
            }
        ];

        return await exec('baja/lib/shelf.js', {
            id: 'baja-models-library',
            title: 'ML Models Library',
            subtitle: BOOKS.length + ' models — each one adds its prediction as a track layer',
            books: BOOKS,
            graph: graph,
            onClose: restoreHover
        });
    })();
}
