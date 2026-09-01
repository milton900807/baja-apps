function (graph, genegraph_panel_layout) {

    // Institute of Machine Learning Models — a READING ROOM, not a control panel.
    //   exec('baja/ml/institute-of-models-library.js', graph, genegraph_panel_layout)
    //
    // Deliberately has no Run, no Load and no track anywhere in it. The ML Models Library
    // already launches these models; this is where you find out what they are before you trust
    // one. Separating the two means a page can describe a model's limits honestly without that
    // reading like discouragement from a button sitting next to it.
    //
    // Every figure below is measured, and is quoted next to the control that decides whether it
    // means anything -- a model that beats no baseline has not been shown to do anything. Where
    // a library documents a limitation it is repeated here rather than smoothed over.
    //
    // Look and feel follows a university research institute: cardinal red, serif display type,
    // programmes rather than products. That is the honest register for material whose purpose
    // is to be evaluated rather than sold.

    return (async () => {
        const restoreHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const PROGRAMMES = [
            {
                name: 'BajaCLIP',
                field: 'RNA–protein interaction',
                headline: 'Where an RNA-binding protein footprints on a transcript.',
                method: 'A sphere-CNN scores 64-nt windows for 170 RBPs; sliding that window along a '
                    + 'transcript gives a per-position binding profile.',
                evidence: 'Trained on CLIP-style binding data and run locally with bundled weights — '
                    + 'no external service is called.',
                limits: 'A prediction of binding, not a measurement of it. Cross-check anything load-bearing '
                    + 'against a measured atlas.',
                refs: [['eCLIP / ENCODE', 'https://www.encodeproject.org/'], ['POSTAR', 'http://postar.ncrnalab.org/']]
            },
            {
                name: 'BajaSplice · site strength',
                field: 'Splicing',
                headline: 'Donor and acceptor strength at every position of a pre-mRNA.',
                method: 'A dilated residual CNN over 2,000 nt of context predicts donor, acceptor or neither '
                    + 'at every position, so it scores sites de novo rather than only where the annotation '
                    + 'already has one.',
                evidence: 'GRCh38 / GENCODE v50, chromosome-disjoint splits (test chr 1/3/5/7/9), evaluated '
                    + 'over all 397,770,000 positions of the held-out chromosomes. Against its control: a '
                    + 'motif-only PWM reaches 0.066 acceptor PR-AUC, the network 0.935 — a 14-fold gap that '
                    + 'is precisely the context the network adds. The PWM recovers the right consensus; GT '
                    + 'and AG simply occur millions of times genome-wide.',
                limits: 'RANK is usable, probability is not. Only 26% of confirmed cryptic sites exceed a '
                    + 'score of 0.5 (against 0.69% of decoys), so screen by ranking a gene\'s intronic AG/GT '
                    + 'positions — do not threshold.',
                refs: [['Technical report', 'https://baja.bio/data/BajaSplice-technical-report.pdf'],
                       ['GENCODE', 'https://www.gencodegenes.org/'], ['SpliceAI', 'https://github.com/Illumina/SpliceAI']]
            },
            {
                name: 'BajaSplice · PSI',
                field: 'Splicing',
                headline: 'Percent-spliced-in for cassette exons across 54 tissues.',
                method: 'Given the four splice-site windows of a cassette event and its geometry, predicts '
                    + 'inclusion in each of 54 GTEx tissues.',
                evidence: '663,089 training events, 196,967 held out. Against its controls: geometry alone '
                    + '0.670 preferred-AUC, splice-site PWM alone 0.684, both together 0.749 — the model '
                    + '0.965. Labels were checked against VastDB, an independent panel quantified by a '
                    + 'different method, agreeing at r = 0.935 on genuinely alternative exons.',
                limits: 'Read the ALT-SUBSET number, not the overall one: 87.9% of internal exons are '
                    + 'constitutive, so an overall correlation mostly measures constitutive-versus-not. On '
                    + 'the 25,792 test exons with real skipping evidence it scores r = 0.697, against 0.253 '
                    + 'for geometry + PWM.',
                refs: [['Technical report', 'https://baja.bio/data/BajaSplice-technical-report.pdf'],
                       ['VastDB', 'https://vastdb.crg.eu/'], ['GTEx', 'https://gtexportal.org/home/']]
            },
            {
                name: 'BajaIR',
                field: 'Intron retention',
                headline: 'How retention-prone an intron is, from sequence alone.',
                method: 'A gradient-boosted model over twenty features: fifteen describing intron geometry '
                    + '(length and GC do most of the work) plus five frozen BajaSplice splice-site scores.',
                evidence: 'Held out: AUC 0.83 on well-annotated introns, and 0.63 against VastDB, which is '
                    + 'independent. At the default tier roughly a quarter of reported introns have '
                    + 'measurable retention — about 6x background.',
                limits: 'Answers "is this intron retention-prone in general", never "is it retained in this '
                    + 'sample": sequence is constant across conditions and retention is not. A shortlist, '
                    + 'not a caller. Correlation with actual retention level is about 0.2, so use the rank.',
                refs: [['VastDB', 'https://vastdb.crg.eu/'], ['GENCODE', 'https://www.gencodegenes.org/']]
            },
            {
                name: 'djPrimer',
                field: 'Assay design',
                headline: 'primer3 designs ranked by predicted assay success, not by design score.',
                method: 'Designs with primer3, then ranks pairs by how likely the assay is to work at the '
                    + 'bench. A design score says a pair is well formed, which is not the same as the assay '
                    + 'firing.',
                evidence: 'Over 2,800 primer/probe sets carried through validation across 300+ cell lines — '
                    + 'over 100,000 assay results — cross-validated GROUPED BY GENE, so no gene predicts '
                    + 'itself. The finding: primer3\'s own thermodynamic scores predict validation success '
                    + 'at CHANCE. Amplicon composition and local template structure add nothing. What lifts '
                    + 'the model is how broadly and highly the target gene is expressed.',
                limits: 'A prioritiser, not an oracle: it reorders a queue, it does not certify an assay. '
                    + 'Its expression features are per-gene, so it predicts intrinsic success across a panel '
                    + 'rather than in one line. Specificity is not exhausted — off-target priming needs '
                    + 'sequence alignment, and is the likeliest source of the residual it does not explain.',
                refs: [['White paper', 'https://baja.bio/data/whitepaper-vs-primer3.html'],
                       ['primer3', 'https://primer3.org/']]
            },
            {
                name: 'Peptide',
                field: 'In preparation',
                headline: 'A peptide-level model over the translated sequence.',
                method: 'Not implemented.',
                evidence: 'None yet — listed so the roster reflects what is planned as well as what exists.',
                limits: 'Nothing here should be relied on until it is published with its controls.',
                refs: []
            }
        ];

        const card = (p) => ''
            + '<article style="break-inside:avoid;border:1px solid #ddd6cc;border-top:3px solid #c41230;'
            + 'background:#fffdfa;padding:18px 20px;margin:0 0 16px;">'
            + '<div style="font:11px/1 Arial;letter-spacing:2px;text-transform:uppercase;color:#8a7f6d;">' + esc(p.field) + '</div>'
            + '<h3 style="margin:6px 0 2px;font:700 22px Georgia,\'Times New Roman\',serif;color:#1a1a1a;">' + esc(p.name) + '</h3>'
            + '<p style="margin:0 0 12px;font:italic 15px Georgia,serif;color:#57534a;">' + esc(p.headline) + '</p>'
            + '<dl style="margin:0;font:13.5px/1.6 Arial,Helvetica,sans-serif;color:#2b2b2b;">'
            + '<dt style="font:700 11px Arial;letter-spacing:1.4px;text-transform:uppercase;color:#c41230;margin-top:10px;">Method</dt>'
            + '<dd style="margin:3px 0 0;">' + esc(p.method) + '</dd>'
            + '<dt style="font:700 11px Arial;letter-spacing:1.4px;text-transform:uppercase;color:#c41230;margin-top:10px;">Evidence</dt>'
            + '<dd style="margin:3px 0 0;">' + esc(p.evidence) + '</dd>'
            + '<dt style="font:700 11px Arial;letter-spacing:1.4px;text-transform:uppercase;color:#c41230;margin-top:10px;">Known limits</dt>'
            + '<dd style="margin:3px 0 0;">' + esc(p.limits) + '</dd>'
            + '</dl>'
            + (p.refs.length
                ? ('<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eee6da;font:12.5px Arial;">'
                    + p.refs.map((r) => '<a href="' + esc(r[1]) + '" target="_blank" rel="noopener noreferrer" '
                        + 'style="color:#c41230;text-decoration:none;margin-right:14px;">' + esc(r[0]) + ' ↗</a>').join('')
                    + '</div>')
                : '')
            + '</article>';

        try {
            const ID = 'baja-institute-models';
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:rgba(20,14,10,0.72);'
                + 'display:flex;align-items:stretch;justify-content:center;padding:22px;font-family:Arial,Helvetica,sans-serif;';

            const pane = document.createElement('div');
            pane.style.cssText = 'width:100%;max-width:1000px;height:100%;display:flex;flex-direction:column;'
                + 'background:#f7f4ee;color:#1a1a1a;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,0.5);overflow:hidden;';

            // The building, behind the masthead.
            //
            // Layered UNDER a colour wash rather than used raw: a photograph behind body text
            // destroys the contrast that makes the text readable, and this page is text people
            // are meant to actually read. The wash carries the institute colour, the photograph
            // carries the register.
            //
            // If the file is not installed the gradient alone still reads correctly -- there is
            // no broken-image state, just a plainer masthead.
            const HERO = '/assets/logos/mellon-institute.jpg';
            const head = document.createElement('div');
            head.style.cssText = 'position:relative;flex:0 0 auto;display:flex;align-items:flex-end;gap:16px;'
                + 'padding:34px 26px 20px;color:#fff;background-color:#c41230;'
                + 'background-image:linear-gradient(180deg,rgba(120,10,26,0.62) 0%,rgba(150,14,34,0.86) 62%,rgba(196,18,48,0.97) 100%),'
                + 'url(\'' + HERO + '\');'
                + 'background-size:cover;background-position:center 38%;background-repeat:no-repeat;';
            head.innerHTML = '<div style="min-width:0;">'
                + '<div style="font:700 27px Georgia,\'Times New Roman\',serif;letter-spacing:0.3px;">Institute of Machine Learning Models</div>'
                + '<div style="font:12.5px Arial;opacity:0.9;margin-top:4px;">'
                + PROGRAMMES.length + ' research programmes · reference only — nothing here runs or changes a track</div>'
                + '</div>';
            const x = document.createElement('button');
            x.textContent = '✕ Close';
            x.style.cssText = 'margin-left:auto;flex:0 0 auto;cursor:pointer;border-radius:6px;padding:8px 15px;'
                + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.5);background:transparent;color:#fff;';
            head.appendChild(x);

            const scroll = document.createElement('div');
            // A very faint echo of the same photograph down the reading column -- fixed, so it
            // sits still while the text scrolls over it. Kept near-invisible on purpose: it is
            // texture, and anything stronger competes with the words.
            scroll.style.cssText = 'flex:1 1 auto;overflow:auto;padding:22px 26px 30px;'
                + 'background-color:#f7f4ee;'
                + 'background-image:linear-gradient(rgba(247,244,238,0.955),rgba(247,244,238,0.985)),'
                + 'url(\'' + HERO + '\');'
                + 'background-size:cover;background-position:center;background-attachment:fixed;';
            scroll.innerHTML = ''
                + '<p style="max-width:70ch;font:15px/1.65 Georgia,serif;color:#3d3833;margin:0 0 20px;">'
                + 'Each programme is described with the control that decides whether its numbers mean '
                + 'anything. A model that beats no baseline has not been shown to do anything, so the '
                + 'baseline is quoted next to the result — and where a model is weak, that is stated here '
                + 'rather than left for you to discover.</p>'
                + PROGRAMMES.map(card).join('');

            let onKey = null;
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
                restoreHover();
            };
            onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
            x.onclick = close;
            overlay.onclick = (ev) => { if (ev.target === overlay) close(); };
            document.addEventListener('keydown', onKey, true);

            pane.appendChild(head); pane.appendChild(scroll);
            overlay.appendChild(pane);
            document.body.appendChild(overlay);
        } catch (e) {
            try { graph.setMessage(' Could not open the institute: ' + e + ' '); } catch (e2) { }
        }
        return graph;
    })();
}
