function () {
    // Every /bd/ interval dataset that can be dropped onto a track as a layer, in one place.
    // Keyed by the id used BOTH by the Data menu (baja/data/data-loading-toolbar.js) and by a
    // ?layer=<key> deep link (baja/data/deep-link.js), so the two can never drift apart.
    //
    // Each entry is a bed-hits.js config: see that file for the field meanings. `bed` and
    // `meta` are BIG_DATA paths, resolved server-side by py/data/read-bed-region.py.
    return {
        mirtarbase10_strong: {
            key: 'mirtarbase10_strong',
            label: 'Validated miRNA sites (strong evidence)',
            bed: '/bd/mirtarbase10_hsa_strong_hg38_transcript_hits.bed.gz',
            meta: '/bd/mirtarbase10_hsa_meta.tsv',
            fields: ['miRNA', 'Target gene', 'Evidence', 'Assays', 'PMIDs', 'miRTarBase'],
            idLabel: 'miRNA',
            color: 'rgba(40,150,120,0.55)',
            // Drawn on their side: target sites cluster along a transcript, so horizontal
            // names would overlap within a few pixels of each other.
            verticalLabels: true,
            labelZoomThreshold: 0.4,
            noun: 'validated miRNA site',
        },
        mirtarbase10_all: {
            key: 'mirtarbase10_all',
            label: 'All reported miRNA sites (incl. CLIP)',
            bed: '/bd/mirtarbase10_hsa_all_hg38_transcript_hits.bed.gz',
            meta: '/bd/mirtarbase10_hsa_meta.tsv',
            fields: ['miRNA', 'Target gene', 'Evidence', 'Assays', 'PMIDs', 'miRTarBase'],
            idLabel: 'miRNA',
            color: 'rgba(120,170,70,0.45)',
            // Drawn on their side: target sites cluster along a transcript, so horizontal
            // names would overlap within a few pixels of each other.
            verticalLabels: true,
            labelZoomThreshold: 0.4,
            noun: 'miRNA site',
        },
        aso_sirna_gt: {
            key: 'aso_sirna_gt',
            label: 'ASO / siRNA / gene therapy',
            bed: '/bd/aso_sirna_gt_hg38_transcript_hits.bed.gz',
            // Still the plain 'US<number> <assignee>' label; stage 4 of the patent pipeline
            // writes the packed number‖title‖date‖assignee‖inventors form.
            assignees: '/bd/aso_sirna_gt_assignees.tsv',
            // Lightened with the other patent layers: these stack into lanes deep enough to
            // hide the track under them, and the label now sits on top of the bar.
            color: 'rgba(160,80,160,0.26)',
            // Horizontal -- 'US12186406 ALNYLAM PHARMACEUTICALS' is read left to right -- but
            // only where it fits: avoidLabelOverlap drops a label that would land on one
            // already drawn rather than overprinting it.
            verticalLabels: false,
            avoidLabelOverlap: true,
            labelZoomThreshold: 0.4,
            noun: 'ASO/siRNA/gene-therapy hit',
        },
        assay_panel_patents: {
            key: 'assay_panel_patents',
            label: 'Assay panel patents',
            // The files on disk are named lipid_patents_* because that was the search that
            // produced them. The KEY and the label say what the result actually is, since the
            // key is what a ?layer= deep link exposes and the label is what a user reads.
            //
            // What is in it, measured: 8,853 sequence hits from 12 patents -- really 9 families,
            // three pairs share a sequence listing across a continuation -- spread over 6,017
            // transcripts. 5,705 of the hits are 25-59 nt and two patents alone account for 71%
            // of them, at roughly one hit per transcript across thousands of genes. That is the
            // shape of a claimed assay PANEL, not of a therapeutic targeting a gene, and the
            // assignees agree (Cleveland HeartLab, Complete Omics, Dana-Farber, Scripps).
            //
            // Kept distinct from the ASO/siRNA set for exactly that reason: this is detection
            // chemistry, and a designer needs to know which kind of claim a hit represents.
            bed: '/bd/lipid_patents_hg38_transcript_hits.bed.gz',
            assignees: '/bd/lipid_patents_assignees.tsv',
            color: 'rgba(200,140,50,0.26)',
            verticalLabels: false,
            avoidLabelOverlap: true,
            labelZoomThreshold: 0.4,
            noun: 'assay-panel patent hit',
        },
        patents_2020_2025: {
            key: 'patents_2020_2025',
            label: 'Patents 2020–2025',
            bed: '/bd/patent_hg38_transcript_hits.bed.gz',
            color: 'rgba(70,130,180,0.26)',
            verticalLabels: false,
            avoidLabelOverlap: true,
            labelZoomThreshold: 0.4,
            // NB: no assignees TSV. This BED's column 4 is a sequential record id ('2|2|'),
            // not a patent number, and nothing on disk maps it to one -- so a hit from this
            // index cannot name its patent. The aso_sirna_gt and lipid_patents BEDs DO carry
            // real numbers (12186406, 10859585) with a TSV each. Everything that loads this
            // key goes through baja/data/patents.js, which says the same thing at more length.
            noun: 'patent hit',
        },
    };
}
