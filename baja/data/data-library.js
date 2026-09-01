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
                open: () => exec('baja/data/rnaseq-library.js', graph, L),
                docs: {
                    summary: 'Per-base RNA-seq read depth, organised by species and tissue. Use it to '
                        + 'see whether the region you are targeting is actually transcribed, and how '
                        + 'strongly, in the tissue you care about.',
                    provenance: 'bigWig coverage files under the deployment\'s RNASeq reference tree. '
                        + 'Human tissue panels are typically GTEx-derived; file names carry the sample '
                        + 'and tissue.',
                    usage: 'Adds a filled coverage layer under the track, scaled to the maximum depth '
                        + 'in the requested window. With a sequence selected, only that span is read.',
                    links: [
                        { title: 'GTEx Portal', url: 'https://gtexportal.org/home/',
                          note: 'Tissue-level expression across human donors — the source of the human tissue panels.' },
                        { title: 'UCSC bigWig format', url: 'https://genome.ucsc.edu/goldenPath/help/bigWig.html',
                          note: 'How the coverage files are stored and indexed for range queries.' }
                    ]
                }
            },
            {
                title: 'Variants', badge: 'Variants', ready: true,
                blurb: 'ClinVar, dbSNP, gnomAD and COSMIC variants over the track region, drawn '
                    + 'as lollipops you can drill into.',
                open: () => exec('baja/data/load-variants.js', graph, L),
                docs: {
                    summary: 'Known sequence variants over the track region, drawn as lollipops you can '
                        + 'drill into. Useful for spotting whether a target site overlaps common '
                        + 'polymorphism or reported pathogenic variation.',
                    provenance: 'Four independent databases, each with different inclusion criteria: '
                        + 'ClinVar (clinically interpreted), dbSNP (broad catalogue of observed variation), '
                        + 'gnomAD (population allele frequencies) and COSMIC (somatic variants in cancer).',
                    usage: 'Variants are placed at their genomic position on the track and can be opened '
                        + 'from the Variants menu for detail.',
                    links: [
                        { title: 'ClinVar', url: 'https://www.ncbi.nlm.nih.gov/clinvar/',
                          note: 'Clinical significance of variants, with submitter-level evidence.' },
                        { title: 'dbSNP', url: 'https://www.ncbi.nlm.nih.gov/snp/',
                          note: 'Reference catalogue of short genetic variation.' },
                        { title: 'gnomAD browser', url: 'https://gnomad.broadinstitute.org/',
                          note: 'Population allele frequencies — the usual check for "is this common?".' },
                        { title: 'COSMIC', url: 'https://cancer.sanger.ac.uk/cosmic',
                          note: 'Somatic mutations in cancer. Licence terms apply to some uses.' }
                    ]
                }
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
                open: () => exec('baja/data/conservation-data.js', graph, L),
                docs: {
                    summary: 'Cross-species conservation along the track. A target site under strong '
                        + 'constraint is more likely to be functional — and more likely to be conserved '
                        + 'in the animal models you might test in.',
                    provenance: 'Conservation scores computed from multiple-species genome alignments. '
                        + 'phyloP scores per-base acceleration or constraint; phastCons scores the '
                        + 'probability that a base falls in a conserved element.',
                    usage: 'Drawn as a coverage-style layer under the track, so it lines up base-for-base '
                        + 'with the sequence.',
                    links: [
                        { title: 'PHAST (phyloP / phastCons)', url: 'http://compgen.cshl.edu/phast/',
                          note: 'The software and the statistical models behind both scores.' },
                        { title: 'UCSC wiggle / conservation track help', url: 'https://genome.ucsc.edu/goldenPath/help/hgWiggleTrackHelp.html',
                          note: 'How continuous scores like conservation are stored and displayed.' }
                    ]
                }
            },
            {
                title: 'Cell lines (bigwig)', badge: 'Coverage', ready: true,
                blurb: 'Per-cell-line bigwig coverage tracks.',
                open: () => exec('baja/bio/cell-lines/bigwig-files-menu.js', graph, L),
                docs: {
                    summary: 'Per-cell-line coverage tracks — useful when you need expression in the '
                        + 'specific line an assay will run in, rather than a tissue average.',
                    provenance: 'bigWig files held in the deployment\'s reference data, one per cell line.',
                    usage: 'Adds a coverage layer per selected file, the same shape as the RNASeq layers.',
                    links: [
                        { title: 'UCSC bigWig format', url: 'https://genome.ucsc.edu/goldenPath/help/bigWig.html',
                          note: 'Indexed binary coverage — why range queries stay fast on large files.' }
                    ]
                }
            },
            {
                title: 'MAF / mutation data', badge: 'Variants', ready: true,
                blurb: 'Mutation Annotation Format data laid over the track.',
                open: () => exec('baja/data/maf-data.js', graph, L),
                docs: {
                    summary: 'Mutation Annotation Format data laid over the track — somatic calls with '
                        + 'their variant classification and affected transcript.',
                    provenance: 'MAF is the tab-delimited format used by large cancer genomics projects '
                        + 'to distribute per-sample somatic mutation calls.',
                    usage: 'Rendered on the track at each mutation\'s position.',
                    links: [
                        { title: 'GDC MAF specification', url: 'https://docs.gdc.cancer.gov/Data/File_Formats/MAF_Format/',
                          note: 'Column-by-column definition of the format.' }
                    ]
                }
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
