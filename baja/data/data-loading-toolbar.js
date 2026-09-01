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
    // loads that year's BED via the shared bed-hits.js. Only the 2026 index exists
    // today (it maps to the current, un-dated file); future years get a dated BED.
    const asoBase = {
        key: 'aso_sirna_gt',
        label: 'ASO / siRNA / gene therapy',
        // Dedicated ASO/siRNA/gene-therapy index, built by the pipeline in
        // py/sequence/patent-pipeline (see its README) and deployed to /bd/. `assignees` is the
        // metadata TSV read-bed-region.py joins in — bed-hits.js renders it on-zoom. The
        // deployed TSV is still the plain 'US<number> <assignee>' label, so the callout shows
        // one Patent line; rerun stage 4 for the packed
        // number‖title‖date‖assignee‖inventors form and point this at the _meta.tsv it writes.
        assignees: '/bd/aso_sirna_gt_assignees.tsv',
        color: 'rgba(160,80,160,0.55)',
        noun: 'ASO/siRNA/gene-therapy hit',
    };
    const asoYears = [
        // The dated file the pipeline is meant to emit does not exist yet, so this maps to
        // the current un-dated index, as the comment above always claimed it did.
        { year: '2020–2026', bed: '/bd/aso_sirna_gt_hg38_transcript_hits.bed.gz' },
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
                        exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, cfg);
                    }
                }));
                graph.showSideMenu(items);
            })
        },
        {
            // 2020–2025 patents — the comprehensive transcript-keyed patent index. Click a
            // track to drop its patent hits in as an interval layer (shared bed-hits.js).
            'label': 'Patents 2020–2025', 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                exec('baja/data/bed-hits.js', graph, genegraph_panel_layout, {
                    key: 'patents_2020_2025',
                    label: 'Patents 2020–2025',
                    bed: '/bd/patent_hg38_transcript_hits.bed.gz',
                    color: 'rgba(70,130,180,0.55)',
                    noun: 'patent hit',
                });
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
    const mirnaBase = {
        // Packed label built by the pipeline: miRNA‖gene‖evidence‖assays‖PMIDs‖MIRT id.
        meta: '/bd/mirtarbase10_hsa_meta.tsv',
        fields: ['miRNA', 'Target gene', 'Evidence', 'Assays', 'PMIDs', 'miRTarBase'],
        idLabel: 'miRNA',
    };
    const mirnaSets = [
        {
            key: 'mirtarbase10_strong',
            label: 'Validated miRNA sites (strong evidence)',
            bed: '/bd/mirtarbase10_hsa_strong_hg38_transcript_hits.bed.gz',
            color: 'rgba(40,150,120,0.55)',
            noun: 'validated miRNA site',
        },
        {
            key: 'mirtarbase10_all',
            label: 'All reported miRNA sites (incl. CLIP)',
            bed: '/bd/mirtarbase10_hsa_all_hg38_transcript_hits.bed.gz',
            color: 'rgba(120,170,70,0.45)',
            noun: 'miRNA site',
        },
    ];
    const mirnaItems = mirnaSets.map((m) => ({
        'label': m.label, 'ionfunction': go(async () => {
            graph.clearMouseListeners();
            graph.setMouseMode('navigate');
            // Click a track -> drop that transcript's miRNA target sites in as a layer.
            exec('baja/data/bed-hits.js', graph, genegraph_panel_layout,
                Object.assign({}, mirnaBase, m));
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
}
