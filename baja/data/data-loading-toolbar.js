function (graph, genegraph_panel_layout) {
    // Data toolbar (menu bar) docked in the button panel — shown from the Layers
    // center menu's "Data" item. Menus: RNASeq | Patents | microRNA | Variants | Protein |
    // Edit Layer.
    //
    // Every /bd/ interval dataset here comes from baja/data/layer-sets.js, which the ?layer=
    // deep-link handler reads too — one definition, so the menu and a link can't disagree.
    return (async () => {
    const SETS = await exec('baja/data/layer-sets.js');
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
    // Clicking the ASO / siRNA / gene-therapy set opens a side menu of the patent-index
    // years built in BIG_DATA; picking one loads its BED via the shared bed-hits.js. Only
    // one index exists today (the un-dated file); future years get a dated BED and a row here.
    const asoBase = SETS.aso_sirna_gt;
    const asoYears = [
        { year: '2020–2026', bed: asoBase.bed },
    ];

    const ipItems = [
        {
            'label': asoBase.label, 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                // Side menu of available patent-index years — pick one to load its BED.
                const items = asoYears.map((y) => ({
                    label: y.year,
                    move: () => { },
                    click: () => {
                        graph.showSideMenu(null);
                        exec('baja/data/bed-hits.js', graph, genegraph_panel_layout,
                            Object.assign({}, asoBase, {
                                bed: y.bed,
                                label: asoBase.label + ' (' + y.year + ')',
                            }));
                    }
                }));
                graph.showSideMenu(items);
            })
        },
        {
            // 2020–2025 patents — the comprehensive transcript-keyed patent index. Click a
            // track to drop its patent hits in as an interval layer (shared bed-hits.js).
            'label': SETS.patents_2020_2025.label, 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, SETS.patents_2020_2025);
            })
        },
    ];

    // ---- microRNA ------------------------------------------------------------
    // miRTarBase 10.0 target sites, keyed by transcript and placed by locating each
    // published site sequence in the transcript (see py/sequence/mirna-pipeline). Two
    // tiers, because miRTarBase's evidence tiers are not equivalent: the strong set is
    // reporter-assay / western-blot evidence on that specific miRNA-gene pair, the full
    // set adds the CLIP-derived "(Weak)" tier and the pairs that were tested and did
    // NOT repress (the metadata callout names the tier per site).
    const mirnaItems = [SETS.mirtarbase10_strong, SETS.mirtarbase10_all].map((cfg) => ({
        'label': cfg.label, 'ionfunction': go(async () => {
            graph.clearMouseListeners();
            graph.setMouseMode('navigate');
            // Click a track -> drop that transcript's miRNA target sites in as a layer.
            exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, cfg);
        })
    }));

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

    // ---- Protein -------------------------------------------------------------
    const proteinItems = [
        {
            'label': 'Protein Domains', 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                // Prompt to click a track, then map CDD protein domains (via the hosted
                // NCBI CD-Search) onto the track's protein sequence. Tracks with no ORF are
                // reported as not protein coding.
                await exec('baja/manchester/menu/protein-domains.js', graph, genegraph_panel_layout);
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
                                    { 'label': 'microRNA', 'items': mirnaItems },
                                    { 'label': 'Variants', 'items': variantItems },
                                    { 'label': 'Protein', 'items': proteinItems },
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
    })();
}
