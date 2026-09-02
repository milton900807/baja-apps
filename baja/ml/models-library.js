function (graph, genegraph_panel_layout, tracks) {

    // `tracks` is what this library applies its models to, decided by whoever opened it:
    // the track menu passes that track, the board-level Layers button passes every track on
    // the canvas. The library does not decide -- it hands the list to the runner, which takes
    // a single track or an array in the same parameter.
    //
    // Opened with nothing (a bare menu entry), the runners fall back to the selection, then to
    // asking for a click, exactly as before.

    // ML Models Library — a bookshelf of the predictive models that write their output onto a
    // track as a layer.
    //   exec('baja/ml/models-library.js', graph, genegraph_panel_layout)
    //
    // Works the same way as the Data Library: each book opens a MAXIMISED reference view
    // describing what the model predicts, how it was built and what it cannot tell you, with
    // links out — then an explicit "Load this data" to run it. Closing returns to the editor.
    //
    // Every figure and caveat below is taken from the model libraries' own documentation
    // (py/bajair-lib, py/bajaclip-lib, py/bajasplice-lib), not estimated here. Where a library
    // states a limitation, it is repeated rather than smoothed over — a model shelf that only
    // lists capabilities invites people to over-read the output.

    return (async () => {
        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const L = genegraph_panel_layout;
        // Normalised once: a single track, an array, or nothing.
        const __targets = () => (Array.isArray(tracks) ? tracks.filter(Boolean) : (tracks ? [tracks] : []));

        const BOOKS = [
            {
                title: 'RNA Binding Proteins', badge: 'BajaCLIP', ready: true,
                blurb: 'Per-position RBP binding profile across the track.',
                open: () => exec('baja/bio/rbp/rbp-profile.js', graph, L, __targets()),
                docs: {
                    summary: 'Predicts where an RNA-binding protein footprints on the sequence. A '
                        + 'sphere-CNN scores 64-nt windows for 170 RBPs; sliding that window along the '
                        + 'track gives a per-position binding profile.',
                    provenance: 'BajaCLIP (py/bajaclip-lib), running locally with bundled weights — no '
                        + 'external service is called. Trained on CLIP-style binding data.',
                    usage: 'Drawn as a coverage-style layer under the track, the same shape as the '
                        + 'RNASeq layers. Run it with a sequence selected to profile just that range.',
                    links: [
                        { title: 'eCLIP / ENCODE RBP resource', url: 'https://www.encodeproject.org/',
                          note: 'The experimental assay family this class of model is trained against.' },
                        { title: 'POSTAR / RBP binding atlases', url: 'http://postar.ncrnalab.org/',
                          note: 'Public catalogues of measured RBP binding sites, for cross-checking a prediction.' }
                    ]
                }
            },
            {
                title: 'Splicing — site strength', badge: 'BajaSplice', ready: true, group: 'splicing',
                blurb: 'Donor / acceptor splice-site strength at every position.',
                open: () => exec('baja/bio/splicing/splicing-profile.js', graph, L, __targets()),
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
                open: () => exec('baja/bio/splicing/splicing-profile.js', graph, L, __targets()),
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
                title: 'Intron retention', badge: 'BajaIR', ready: true, group: 'splicing',
                blurb: 'How retention-prone each intron is, from sequence alone.',
                open: () => exec('baja/bio/splicing/intron-retention.js', graph, L, __targets()),
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
                // first track on the canvas whatever list this library was handed. Every other book
                // here passes __targets(); this one now runs djPrimer over them the same way.
                open: () => exec('baja/manchester/ppsets/run-djprimer.js', graph, L, __targets()),
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
        const grouped = GROUPS.map((g) => {
            const members = BOOKS.filter((b) => b.group === g.key);
            if (!members.length) return null;
            return {
                title: g.title, badge: g.badge, subtitle: g.subtitle, blurb: g.blurb,
                books: () => members
            };
        }).filter(Boolean);
        const ungrouped = BOOKS.filter((b) => !GROUPS.some((g) => g.key === b.group));

        // Say up front what a model will run against. A model quietly running on one track when
        // the user meant the board -- or over a selection they had forgotten about -- is the
        // kind of thing only noticed after the layer lands in the wrong place.
        const scopeNote = () => {
            const ts = __targets();
            let marked = 0;
            try { marked = ts.filter((t) => t && t.selectedRange && t.selectedRange()).length; } catch (e) { }
            if (marked) return 'the selected sequence on ' + marked + ' track' + (marked === 1 ? '' : 's');
            if (ts.length) return ts.length + ' track' + (ts.length === 1 ? '' : 's');
            return 'the track you pick';
        };

        return await exec('baja/lib/shelf.js', {
            id: 'baja-models-library',
            title: 'ML Models Library',
            subtitle: BOOKS.length + ' models — each adds its prediction as a layer, over '
                + scopeNote(),
            books: grouped.concat(ungrouped),
            graph: graph,
            onClose: restoreHover
        });
    })();
}
