function (graph, genegraph_panel_layout, tracks, runOn) {

    // THE MODEL CATALOGUE, in one place.
    //   let { books, groups } = await exec('baja/ml/models-catalogue.js', graph, L, tracks, runOn)
    //
    // This was the BOOKS array inside baja/ml/models-library.js. It is out here because the
    // library is no longer the only way to reach a model: the track menu lists the same models
    // as a submenu, so a model can be run without going through the reading room first. Two
    // copies of a catalogue drift -- a model added to one and not the other is a model that
    // exists in the shelf and not in the menu, or the reverse -- and neither copy tells you
    // which is out of date.
    //
    // `runOn(title, fn)` is how a book gets its tracks. The caller owns that decision: the
    // library asks which track when several are loaded, the track menu already knows. Every
    // book calls it the same way, so a book does not know or care which one opened it.
    //
    // Every figure and caveat below is taken from the model libraries' own documentation
    // (py/bajair-lib, py/bajaclip-lib, py/bajasplice-lib), not estimated here. Where a library
    // states a limitation, it is repeated rather than smoothed over -- a model shelf that only
    // lists capabilities invites people to over-read the output.

    return (async () => {
        const L = genegraph_panel_layout;
        const __onParentTrack = runOn;
    const BOOKS = [
        {
            title: 'Secretion', badge: 'Secretome', ready: true,
            blurb: 'Is the protein secreted, and where is the signal along the sequence?',
            // No picker: the only choice is which training set, and the default is the
            // better one everywhere. The runner reads the track's own reading frame.
            open: () => __onParentTrack('Secretion',
                (list) => exec('baja/bio/protein/secretion-profile.js', graph, L, list, null, 'light_hm')),
            docs: {
                summary: 'Scores whether a protein is secreted from its sequence alone, and draws '
                    + 'the score along the track as a filled curve with a polynomial fitted over it. '
                    + 'The curve answers "if the protein began at this residue, would it look '
                    + 'secreted?", so it peaks over signal peptides and signal anchors.',
                provenance: 'Gradient-boosted trees over 96 sequence features, trained here on 36,681 '
                    + 'human and mouse proteins — Human Protein Atlas secretome for human, UniProt '
                    + 'subcellular location for mouse — with whole homology clusters held out at 30% '
                    + 'identity. Held-out AUROC 0.95, and 0.97 for the larger language-model variant '
                    + 'that is not served here. Runs locally with bundled weights; no service is called.',
                usage: 'Select a sequence range to profile just that part, or run it on the whole '
                    + 'track. Tracks are nucleotide, so the protein is taken from the track\'s own '
                    + 'coding sequence, exon-aware; a track with no CDS is translated in frame 1 and '
                    + 'says so. Needs at least 30 residues. Read the curve as secretory-signal '
                    + 'strength, not destination: ER- and membrane-retained proteins carry the same '
                    + 'N-terminal signal and peak just as high, single-pass receptors score high, and '
                    + 'proteins exported without a signal peptide (Hsp70, ALIX, gasdermin-D) score '
                    + 'near zero.',
                // No chooser on purpose. shelf.js disables Load until a choice list
                // resolves and leaves it disabled, silently, on several paths — an
                // inert green button with no message. The only choice here is which
                // training set, the default is the better one for mammalian tracks,
                // and it is not worth that failure mode.
                links: []
            }
        },
        {
            title: 'RNA–protein coupling', badge: '7 studies', ready: true,
            blurb: 'When this gene\'s mRNA changes, how much does its protein change — and how reliably?',
            open: () => __onParentTrack('RNA–protein coupling',
                (list) => exec('baja/bio/protein/rna-protein-correlation.js', graph, L, list, null)),
            docs: {
                summary: 'Predicts two numbers from the protein and mRNA sequence. TRANSFER is how much '
                    + 'the protein moves when its mRNA moves — the log-log slope of protein on mRNA across '
                    + 'samples — on a normalized scale where the typical gene is 1.0: below 1 the protein '
                    + 'is buffered (ribosomal and complex subunits; RPL5 is 0.27), above 1 it is responsive. '
                    + 'ρ is how reliably protein follows mRNA. Drawn as a bar over the coding exons at the '
                    + 'predicted transfer (the typical gene sits at mid-height), with a line at the MEASURED '
                    + 'transfer where any study quantified the protein. The annotation also gives the gene\'s '
                    + 'mRNA half-life: longer-lived mRNAs carry more protein per mRNA (Spearman 0.31) but '
                    + 'half-life does not change how closely protein follows mRNA.',
                provenance: 'Labels combine 7 paired mRNA/protein studies — CPTAC (10 cancer types), CCLE and '
                    + 'Sanger cell lines, TCGA breast, ovarian (two labs) and colorectal tumours, NCI-60 — '
                    + 'four mass-spec methods. Mass spec compresses protein ratios by different amounts, so '
                    + 'each study\'s slopes are divided by its median gene before combining, weighted by '
                    + 'samples and by how well each study agrees with the rest. 11,039 proteins. The model '
                    + '(ESM-2 3B protein embeddings + protein features + mRNA features: UTR lengths, codon '
                    + 'usage, uORFs, AU-rich and Pumilio elements) reaches Spearman 0.51 for transfer and '
                    + '0.55 for ρ with whole homology clusters held out. Held out one study at a time, it '
                    + 'predicts most studies better than a model trained on CPTAC alone (CCLE ρ 0.55 vs '
                    + '0.51). It is precomputed for every GENCODE v50 protein; an edited or variant protein '
                    + 'is scored live by protein features alone (Spearman 0.33), and the result says which '
                    + 'was used. mRNA half-life: consensus of 49 datasets (Agarwal & Kelley 2022). Runs '
                    + 'locally; no service is called.',
                usage: 'Run it on a protein-coding track, or select a range to score the ORF inside it. The '
                    + 'protein comes from the track\'s own ORF, exon-aware; a track with no ORF is not '
                    + 'scored. Needs at least 30 residues. Where a MEASURED value exists, trust it over the '
                    + 'prediction; the per-study values are in the log, and studies can disagree (NEK1: '
                    + '0.99 in CPTAC tumours, 0.40 in CCLE cell lines). Transfer is relative to the typical '
                    + 'gene, not an absolute fold change: the absolute slope depends on how protein is '
                    + 'measured (a typical gene moves ~0.3 log2 of protein per log2 of mRNA in TMT data). '
                    + 'Flat mRNA cannot move protein, so transfer matters for genes whose mRNA varies.',
                links: [
                    { title: 'CPTAC pan-cancer proteogenomics', url: 'https://proteomics.cancer.gov/programs/cptac',
                      note: 'The largest of the seven paired studies.' },
                    { title: 'ESM-2 protein language model', url: 'https://github.com/facebookresearch/esm',
                      note: 'The protein embeddings behind the full model.' },
                    { title: 'Agarwal & Kelley 2022, human mRNA half-life compendium', url: 'https://doi.org/10.1186/s13059-022-02811-x',
                      note: 'The 54 half-life datasets the consensus is built from.' }
                ]
            }
        },
        {
            title: 'Protein dynamic range', badge: '78 tissues', ready: true,
            blurb: 'How widely does this protein vary between samples of a tissue — predicted from mRNA?',
            // The tissue comes from the picker and is passed straight through to the runner.
            open: (tissue) => __onParentTrack('Protein dynamic range',
                (list) => exec('baja/bio/protein/protein-dynamic-range.js', graph, L, list, null, tissue)),
            docs: {
                summary: 'Predicts how widely the protein\'s level varies between samples of the chosen '
                    + 'tissue: its 5–95% spread as a fold change and its rank among all proteins. Drawn '
                    + 'as a bar over the coding exons at that rank (taller = more variable), a black line '
                    + 'at its MEASURED variability rank where a proteomics study quantified it, and an '
                    + 'annotation naming the tissues where it varies most. CYP3A4, for example, varies '
                    + 'most in intestine, liver and pancreas; splicing factors such as SF3B1 barely vary.',
                provenance: 'A model learned protein range from mRNA range across 7 paired mRNA/protein '
                    + 'studies (42k gene × study rows), keeping mRNA range as the backbone and adding a '
                    + 'shrunk correction from the gene\'s sequence, mRNA level, sample type and platform, '
                    + 'then a monotone calibration. Held out one study at a time it ranks protein '
                    + 'variability better than mRNA range alone in every study (CPTAC 0.84 vs 0.76); per '
                    + 'cancer type, with CPTAC held out of training, 0.62–0.79, better in all 10. It was '
                    + 'run on each tissue\'s own RNA: 10 CPTAC tumour types, 19 DepMap cell-line '
                    + 'lineages and 49 GTEx healthy tissues. Healthy tissues are NOT validated — there '
                    + 'is no matched normal-tissue proteomics here and the model never saw normal tissue.',
                usage: 'Pick a tissue, then run it on a protein-coding track. The gene comes from the '
                    + 'track\'s own ORF (the exact annotated protein) or the track name. Folds are on a '
                    + 'DIA mass-spec scale — what a proteomics experiment would measure, compressed '
                    + 'relative to true biology — so compare ranks across genes and tissues rather than '
                    + 'reading the fold literally. A gene barely expressed in the chosen tissue gets no '
                    + 'range, because what varies there is noise. Tumour ranges include the surrounding '
                    + 'normal tissue, which varies from sample to sample (pancreatic enzymes in PDAC).',
                choice: {
                    label: 'Tissue',
                    note: 'Tumour types and cell-line lineages are validated; healthy tissues are not.',
                    value: 'tumour:brca',
                    empty: 'The tissue list could not be read on this server.',
                    options: async () => {
                        const em = new EngineMonitor(() => { });
                        const res = await exec(window['env']['apiUrl'] + '/py/bio/protein/list-range-tissues.py', em);
                        const rows = JSON.parse((res && res.tissues) || '[]');
                        const group = { tumour: 'Tumour', cell_line: 'Cell lines', normal: 'Healthy' };
                        return rows.map((r) => ({
                            value: r.key,
                            label: (group[r.kind] || r.kind) + ' — ' + r.label.replace(/ cell lines$/, '') + '   (' + r.samples + ')',
                            note: r.kind === 'normal' ? 'GTEx healthy tissue — not validated.' : ('Validated: ' + r.validated + '.')
                        }));
                    }
                },
                links: [
                    { title: 'GTEx Portal', url: 'https://gtexportal.org/home/',
                      note: 'The healthy-tissue RNA the 49 normal-tissue ranges are computed from.' },
                    { title: 'DepMap', url: 'https://depmap.org/portal/',
                      note: 'The cell-line RNA behind the 19 lineage ranges.' }
                ]
            }
        },
        {
            title: 'RNA Binding Proteins', badge: 'BajaCLIP', ready: true,
            blurb: 'Per-position RBP binding profile across the track.',
            // The chosen protein comes from the page's picker and is passed straight
            // through, so the runner does not ask a second time.
            open: (rbp) => __onParentTrack('BajaCLIP', (list) => exec('baja/bio/rbp/rbp-profile.js', graph, L, list, null, rbp)),
            docs: {
                summary: 'Predicts where an RNA-binding protein footprints on the sequence. A '
                    + 'sphere-CNN scores 64-nt windows for 170 RBPs; sliding that window along the '
                    + 'track gives a per-position binding profile.',
                provenance: 'BajaCLIP (py/bajaclip-lib), running locally with bundled weights — no '
                    + 'external service is called. Trained on CLIP-style binding data.',
                usage: 'Drawn as a coverage-style layer under the track, the same shape as the '
                    + 'RNASeq layers. Run it with a sequence selected to profile just that range.',
                // WHICH PROTEIN, asked here rather than on a screen of its own after Load.
                // Only the proteins the model is actually reliable for are offered -- the
                // table is the held-out AUROC >= 0.90 set that ships with the weights, so
                // the list is the model's own statement about where it can be trusted.
                choice: {
                    label: 'RNA binding protein',
                    note: 'Held-out AUROC \u2265 0.90.',
                    value: 'TARDBP',
                    empty: 'The reliable-RBP table could not be read on this server.',
                    options: async () => {
                        const em = new EngineMonitor(() => { });
                        const res = await exec(window['env']['apiUrl'] + '/py/bio/rbp/list-rbps.py', em);
                        const rows = JSON.parse((res && res.rbps) || '[]');
                        return rows.map((r) => ({
                            value: r.name,
                            label: r.name + '   —   AUROC ' + (+r.auroc).toFixed(2),
                            note: r.note || ''
                        }));
                    }
                },
                links: []
            }
        },
        {
            title: 'Splicing — site strength', badge: 'BajaSplice', ready: true, group: 'splicing',
            blurb: 'Donor / acceptor splice-site strength at every position.',
            // The mode is this entry's identity, so pass it: the profile then arms the run
            // directly instead of asking again in its own center menu.
            open: () => __onParentTrack('BajaSplice splice sites', (list) => exec('baja/bio/splicing/splicing-profile.js', graph, L, list, null, 'sites')),
            docs: {
                summary: 'A dilated residual CNN over 2,000 nt of context predicts donor, acceptor '
                    + 'or neither at EVERY position of a pre-mRNA — so it scores sites de novo '
                    + 'rather than only where the annotation already has one.',
                provenance: 'GRCh38 / GENCODE v50, chromosome-disjoint splits (test chr 1/3/5/7/9). '
                    + 'Evaluated over all 397,770,000 positions of the held-out chromosomes, '
                    + 'containing ~56,000 true acceptors and ~56,000 true donors. Reported against '
                    + 'its control, as every task in the report is: a motif-only PWM reaches 0.066 '
                    + 'acceptor PR-AUC while the network reaches 0.935 — a 14-fold gap that is the '
                    + 'context the network adds. The PWM recovers the right consensus; GT and AG '
                    + 'simply occur millions of times genome-wide.',
                usage: 'A per-position score layer under the track; honours a sequence selection. '
                    + 'Because it scores every position, it also finds UNANNOTATED sites — on '
                    + 'held-out TDP-43 cryptic exons it reaches AUC 0.866 against decoys drawn from '
                    + 'the same introns, and recovers the STMN2 cryptic acceptor at rank 6 of 3,621. '
                    + 'IMPORTANT: rank is usable, probability is not. Only 26% of confirmed cryptic '
                    + 'sites exceed a score of 0.5 (against 0.69% of decoys), so screen by ranking a '
                    + 'gene\'s intronic AG/GT positions and taking the top — do not threshold.',
                links: [
                    { title: 'Technical report: BajaSplice', url: 'https://baja.bio/data/BajaSplice-technical-report.pdf',
                      note: 'Every task reported next to the control that decides whether its score means anything — including a negative result the authors kept in.' },
                    { title: 'GENCODE annotation', url: 'https://www.gencodegenes.org/',
                      note: 'The v50 annotation the model is trained and evaluated against.' },
                    { title: 'SpliceAI', url: 'https://github.com/Illumina/SpliceAI',
                      note: 'A widely used deep-learning splice-site predictor — the usual point of comparison.' }
                ]
            }
        },
        {
            title: 'Splicing — PSI', badge: 'BajaSplice', ready: true, group: 'splicing',
            blurb: 'Percent-spliced-in for cassette exons, across 54 tissues.',
            open: () => __onParentTrack('BajaSplice exon inclusion', (list) => exec('baja/bio/splicing/splicing-profile.js', graph, L, list, null, 'psi')),
            docs: {
                summary: 'Given the four splice-site windows of a cassette event and its geometry, '
                    + 'predicts inclusion in each of 54 tissues — how often the exon is kept rather '
                    + 'than skipped.',
                provenance: 'Trained on 663,089 cassette events across 54 GTEx tissues; 196,967 '
                    + 'held-out events. Against its controls: geometry only (length/GC/frame) '
                    + 'reaches 0.670 preferred-AUC, splice-site PWM only 0.684, both together '
                    + '0.749 — the model reaches 0.965. Labels were checked against VastDB, an '
                    + 'independent panel quantified by a different method, agreeing at r = 0.935 on '
                    + 'genuinely alternative exons, which indicates they reflect biology rather '
                    + 'than an artifact of how junctions were counted.',
                usage: 'Runs on the WHOLE track, never a selection: PSI needs the transcript\'s exon '
                    + 'structure, which a cut-out range no longer describes. READ THE ALT-SUBSET '
                    + 'NUMBER, not the overall one: 87.9% of internal exons are constitutive, so an '
                    + 'overall correlation mostly measures constitutive-versus-not. On the 25,792 '
                    + 'test exons with real skipping evidence the model scores r = 0.697, against '
                    + '0.253 for geometry + PWM.',
                links: [
                    { title: 'Technical report: BajaSplice', url: 'https://baja.bio/data/BajaSplice-technical-report.pdf',
                      note: 'Every task reported next to the control that decides whether its score means anything — including a negative result the authors kept in.' },
                    { title: 'VastDB', url: 'https://vastdb.crg.eu/',
                      note: 'The independent quantification the labels were validated against (r = 0.935).' },
                    { title: 'GTEx Portal', url: 'https://gtexportal.org/home/',
                      note: 'The tissue panel the 54-tissue inclusion levels are computed from.' }
                ]
            }
        },
        {
            title: 'Splicing — cis-regulatory windows', badge: 'BajaSplice', ready: true, group: 'splicing',
            blurb: 'Which sequence around a splice site supports it, and which suppresses it.',
            // This one is a CLICK tool, not a whole-track run: it profiles one site, so it
            // needs the user to say which. Passing the targets still lets a track menu skip
            // the "click on a track" step.
            // cis-attribution takes ONE track; the first of the list is the one picked.
            open: () => __onParentTrack('Cis-attribution', (list) => exec('baja/bio/splicing/cis-attribution.js', graph, L, (list[0] || null))),
            docs: {
                summary: 'Takes ONE donor or acceptor and asks what its neighbourhood is doing for '
                    + 'it. Each window of nearby sequence is scrambled in turn and the site '
                    + 'rescored: a fall means the window was holding the site up, a rise means it '
                    + 'was pushing the site down. Drawn as a diverging layer — bars above the line '
                    + 'support the site, bars below suppress it.',
                provenance: 'BajaSplice (py/bajasplice-lib, bajasplice.cis) on the same ctx-2000 '
                    + 'splice-site network. Two design points decide whether the number means '
                    + 'anything, and both are in the implementation rather than left to the user. '
                    + 'The scramble PRESERVES DINUCLEOTIDE COMPOSITION (Altschul-Erikson): '
                    + 'replacing a window with N or with random bases would change GC content too, '
                    + 'and the measured drop would conflate that with the loss of any motif. And '
                    + 'impact is measured in LOG-ODDS, not probability: a confident site sits at '
                    + 'p = 0.999, where losing real support moves the probability by 0.001 while '
                    + 'moving the log-odds by several nats. Measured genome-wide on held-out '
                    + 'chromosomes, 66.5% of an acceptor\'s total impact lies within ±100 nt and '
                    + '83.1% within ±200 nt; for a donor, 46.1% and 89.7%. Both peaks fall on the '
                    + 'EXON side, which is where exonic splicing enhancers act — nothing told the '
                    + 'model that.',
                usage: 'Pick the tool, click a point on a track, then choose the nearest annotated '
                    + 'acceptor or donor (or the clicked position itself, for an unannotated site). '
                    + 'Set the window and bin size in the dialog. IMPORTANT: the model physically '
                    + 'cannot see past ±1000 nt, so a larger window is CLAMPED rather than drawn — '
                    + 'a flat profile out there would read as "no regulatory content" when it means '
                    + '"not measurable". Bar opacity carries confidence (how many standard errors '
                    + 'the effect sits from zero across scrambles); a faint bar is noise, not a '
                    + 'weak effect. And a window with no measured impact is a LOWER BOUND: it says '
                    + 'this network does not use that sequence, not that the sequence does nothing. '
                    + 'Worked case: the UNC13A cryptic donor comes back almost entirely '
                    + 'SUPPRESSED (z = -2.20 against 40 strength-matched controls), which is what a '
                    + 'site being held shut looks like from the sequence side. Do not read that as '
                    + 'the model finding TDP-43: across 6,083 windows in 400 CLIP-covered genes, '
                    + 'suppressive windows are no more likely to carry neuronal TDP-43 binding than '
                    + 'supporting ones (odds 1.23, p = 0.35).',
                links: [
                    { title: 'Technical report: BajaSplice', url: 'https://baja.bio/data/BajaSplice-technical-report.pdf',
                      note: 'The cis-regulatory section gives the distance profile, the receptive-field check and the UNC13A case in full.' },
                    { title: 'Altschul & Erikson, dinucleotide-preserving shuffle', url: 'https://doi.org/10.1093/oxfordjournals.molbev.a040370',
                      note: 'The null this tool scrambles against: composition held fixed, arrangement destroyed.' },
                    { title: 'POSTAR / RBP binding atlases', url: 'http://postar.ncrnalab.org/',
                      note: 'Measured binding, for checking whether a suppressive window has a protein on it.' }
                ]
            }
        },
        {
            title: 'Intron retention', badge: 'BajaIR', ready: true, group: 'splicing',
            blurb: 'How retention-prone each intron is, from sequence alone.',
            open: () => __onParentTrack('BajaIR intron retention', (list) => exec('baja/bio/splicing/intron-retention.js', graph, L, list)),
            docs: {
                summary: 'Scores how retention-prone each intron is from sequence alone — no reads '
                    + 'and no expression data. Twenty features: fifteen describing intron geometry '
                    + '(length and GC do most of the work) plus five frozen BajaSplice splice-site '
                    + 'scores.',
                provenance: 'BajaIR (py/bajair-lib), a gradient-boosted model, deliberately free of '
                    + 'torch. The five splice-site scores come from BajaSplice via its adapter. '
                    + 'Held out: AUC 0.83 on well-annotated introns, and 0.63 against VastDB, which '
                    + 'is independent.',
                usage: 'A per-intron score, drawn as a track layer. IMPORTANT: it answers "is this '
                    + 'intron retention-prone in general", NOT "is it retained in this sample" — '
                    + 'sequence is constant across conditions and retention is not, so '
                    + 'condition-specific retention is out of reach by construction. Use the RANK, '
                    + 'not the number: correlation with the actual retention level is about 0.2. '
                    + 'It is a shortlist, not a caller — at the default tier roughly a quarter of '
                    + 'reported introns have measurable retention, which is 6x background but is '
                    + 'not a result to act on singly.',
                links: [
                    { title: 'VastDB', url: 'https://vastdb.crg.eu/',
                      note: 'The independent dataset the 0.63 AUC is measured against.' },
                    { title: 'GENCODE annotation', url: 'https://www.gencodegenes.org/',
                      note: 'Intron definitions come from the annotation, not from reads.' }
                ]
            }
        },
        {
            title: 'Primer design — djPrimer', badge: 'djPrimer', ready: true,
            blurb: 'primer3 designs ranked by predicted assay success, not by design score.',
            // Was track-design-menu.js on graph.track[0]: the Design MENU, opened against the
            // first track on the canvas whatever list this library was handed. Then it passed
            // __targets() like every other book, which from the library menu is nothing, and
            // nothing meant the whole board. Now it runs on the track above it on the path --
            // see __onParentTrack.
            open: () => __onParentTrack('djPrimer', (list) => exec('baja/manchester/ppsets/run-djprimer.js', graph, L, list)),
            docs: {
                summary: 'Designs primer pairs with primer3, then ranks them by how likely each '
                    + 'assay is to actually WORK at the bench. The distinction matters: a design '
                    + 'score tells you a primer pair is well formed, which is not the same thing as '
                    + 'the assay firing. Design with primer3; prioritise with this.',
                provenance: 'Measured on a validation database of over 2,800 primer/probe sets, each '
                    + 'carried through validation across over 300 cell lines — over 100,000 assay '
                    + 'results. Cross-validated GROUPED BY GENE, so no gene is used to predict '
                    + 'itself. The finding: primer3\'s own thermodynamic scores predict validation '
                    + 'success at CHANCE. Amplicon composition and local template structure add '
                    + 'nothing. What lifts the model well above chance is how broadly and highly the '
                    + 'target gene is expressed, taken from public RNA-seq references independent of '
                    + 'the qPCR data. Essentially all of the improvement is expression; the sequence '
                    + 'features contribute almost nothing.',
                usage: 'Places each design on the track as an amplicon carrying its predicted '
                    + 'probability, so the ordering is a triage signal rather than a thermodynamic '
                    + 'one. Used as triage — rank, then drop the lowest quarter before validating — '
                    + 'it avoids roughly half of failed validations while setting aside about one '
                    + 'good assay in ten. A low score on a well-formed primer usually means the '
                    + 'target is not expressed in your sample: a redesign decision made before you '
                    + 'spend reagents. LIMITS, from the whitepaper: it is a prioritiser, not an '
                    + 'oracle — it reorders a queue, it does not certify an assay. Its expression '
                    + 'features are per-gene, so it predicts intrinsic success across a panel rather '
                    + 'than in one specific line. Specificity is not exhausted — off-target priming '
                    + 'needs sequence alignment rather than thermodynamics, and is the likeliest '
                    + 'source of the residual signal the model does not explain. Needs a selected '
                    + 'sequence range to design against.',
                links: [
                    { title: 'White paper: Primer3 scores no better than chance',
                      url: 'https://baja.bio/data/whitepaper-vs-primer3.html',
                      note: 'The full study — how the 2,800-set validation database was analysed, the chance-level result for primer3 scores, and the triage numbers.' },
                    { title: 'primer3', url: 'https://primer3.org/',
                      note: 'The design engine. Still the right tool for generating candidates — djPrimer ranks what it produces.' },
                    { title: 'primer3 manual', url: 'https://primer3.org/manual.html',
                      note: 'What each constraint does, if you need to reason about a rejected design.' }
                ]
            }
        },
        {
            title: 'Peptide', badge: 'Model', ready: false,
            blurb: 'Peptide-level prediction over the translated sequence.',
            open: () => { try { graph.setMessage(' Peptide model — coming soon. '); } catch (e) { } },
            docs: {
                summary: 'Reserved for a peptide-level model over the translated sequence. Not '
                    + 'implemented yet — listed so the catalogue reflects what is planned as well '
                    + 'as what is available.',
                links: []
            }
        }
    ];
    // ---- Grouped into libraries, where there is a real group to make ------------------
    // The three splicing models are one body of work on one question -- where the
    // spliceosome acts on this transcript -- and belong behind one card. The rest are each
    // their own category, and a library holding a single book is a click that asks nothing,
    // so they stay at the top level. Grouping is driven by the `group` field on the books
    // rather than by matching titles here, so adding a fourth splicing model is one word.
    const GROUPS = [
        {
            key: 'splicing',
            title: 'Splicing',
            badge: 'BajaSplice / BajaIR',
            subtitle: 'Pick a splicing model',
            blurb: 'Three models over one question — where the spliceosome acts on this '
                + 'transcript: donor / acceptor strength at every position, inclusion level for '
                + 'each exon, and whether an intron is retained.'
        }
    ];

        return { books: BOOKS, groups: GROUPS };
    })();
}
