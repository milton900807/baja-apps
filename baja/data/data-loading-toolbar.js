function (graph, genegraph_panel_layout) {
    // Data toolbar (menu bar) docked in the button panel — shown from the Layers
    // center menu's "Data" item. Menus: RNASeq | IP | Edit Layer.
    const server = window['env']['apiUrl'];
    const go = (fn) => createIonFunction(async () => {
        try { await fn(); } catch (e) { try { graph.setMessage(' ' + e); } catch (_e) { } }
    });

    // ---- RNASeq --------------------------------------------------------------
    const rnaseqItems = [
        {
            'label': 'Load RNASeq', 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                // Side menu that navigates the local RNASeq hierarchy in BIG_DATA
                // (baja-bd/RNASeq/<Species>/<Tissue>/*.bw) and loads a file as a layer.
                await exec('baja/data/rnaseq-hierarchy-menu.js', graph, genegraph_panel_layout);
            })
        }
    ];

    // ---- Patents -------------------------------------------------------------
    // Only the ASO / siRNA / gene-therapy patent set is offered. Clicking it opens a
    // side menu of the patent-index years that are built in BIG_DATA; picking a year
    // loads that year's BED via the shared patent-hits.js. Only the 2026 index exists
    // today (it maps to the current, un-dated file); future years get a dated BED.
    const asoBase = {
        key: 'aso_sirna_gt',
        label: 'ASO / siRNA / gene therapy',
        assignees: '/bd/aso_sirna_gt_assignees.tsv',
        color: 'rgba(160,80,160,0.55)',
        noun: 'ASO/siRNA/gene-therapy hit',
    };
    const asoYears = [
        { year: '2026', bed: '/bd/aso_sirna_gt_hg38_transcript_hits.bed.gz' },
    ];

    const ipItems = [
        {
            'label': 'ASO / siRNA / gene therapy', 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                // Side menu of available patent-index years — pick one to load its BED.
                const items = asoYears.map((y) => ({
                    label: y.year,
                    move: () => { },
                    click: () => {
                        graph.showSideMenu(null);
                        const cfg = Object.assign({}, asoBase, {
                            bed: y.bed,
                            label: asoBase.label + ' (' + y.year + ')',
                        });
                        exec('baja/data/patent-hits.js', graph, genegraph_panel_layout, cfg);
                    }
                }));
                graph.showSideMenu(items);
            })
        },
    ];

    // ---- Variants (major variant databases; by selected range or whole track) ----
    const variantDbs = [
        { db: 'clinvar', label: 'ClinVar' },
        { db: 'dbsnp', label: 'dbSNP' },
        { db: 'gnomad', label: 'gnomAD' },
        { db: 'cosmic', label: 'COSMIC' },
    ];
    const variantItems = variantDbs.map((d) => ({
        'label': d.label, 'ionfunction': go(async () => {
            graph.clearMouseListeners();
            graph.setMouseMode('navigate');
            // Click a track → load this database's variants over the selection or whole track.
            await exec('baja/data/load-variants.js', server, graph, genegraph_panel_layout, d.db, d.label);
        })
    }));

    // ---- Edit Layer ----------------------------------------------------------
    const editItems = [
        {
            'label': 'Edit layers', 'ionfunction': go(async () => {
                // Prompt to click a track, then open its layer editor.
                graph.clearMouseListeners();
                graph.setMouseMode('msg: Click on a track to edit its layers.');
                graph.addMouseDownListener(async (x, y) => {
                    const ti = graph.getTrack(x, y);
                    if (ti < 0) return;
                    const track = graph.track[ti];
                    graph.clearMouseListeners();
                    graph.setMouseMode('navigate');
                    try {
                        // Edit the track's layers through a side menu (hide/show/remove/…)
                        // instead of the full-panel editor.
                        await exec('baja/manchester/menu/track-layers-side-menu.js', track, genegraph_panel_layout, graph);
                    } catch (e) { graph.setMessage(' Could not open the layer menu: ' + e); }
                });
            })
        }
    ];

    let bpanel = {
        wid: 'card',
        data: {
            cards: [
                [
                    {
                        width: '100%',
                        'component': {
                            wid: 'menu',
                            data: {
                                title: '  ',
                                style: 'sub-container',
                                menus: [
                                    { 'label': 'RNASeq', 'items': rnaseqItems },
                                    { 'label': 'Patents', 'items': ipItems },
                                    { 'label': 'Variants', 'items': variantItems },
                                    { 'label': 'Edit Layer', 'items': editItems }
                                ]
                            }
                        }
                    }
                ]
            ]
        }
    };

    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
    CurrentLayout.setComponent('buttonMenuPanel', bpanel);
}
