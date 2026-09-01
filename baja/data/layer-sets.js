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
            noun: 'miRNA site',
        },
        aso_sirna_gt: {
            key: 'aso_sirna_gt',
            label: 'ASO / siRNA / gene therapy',
            bed: '/bd/aso_sirna_gt_hg38_transcript_hits.bed.gz',
            // Still the plain 'US<number> <assignee>' label; stage 4 of the patent pipeline
            // writes the packed number‖title‖date‖assignee‖inventors form.
            assignees: '/bd/aso_sirna_gt_assignees.tsv',
            color: 'rgba(160,80,160,0.55)',
            noun: 'ASO/siRNA/gene-therapy hit',
        },
        patents_2020_2025: {
            key: 'patents_2020_2025',
            label: 'Patents 2020–2025',
            bed: '/bd/patent_hg38_transcript_hits.bed.gz',
            color: 'rgba(70,130,180,0.55)',
            noun: 'patent hit',
        },
    };
}
