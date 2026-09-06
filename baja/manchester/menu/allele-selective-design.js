function (server, graph, genegraph_panel_layout, presetTrack) {
    // Allele-selective design: oligos that hit the MUTANT allele and leave the wild-type one
    // alone. The discrimination is positional -- see py/sequence/allele-selective-design.py --
    // so everything here is about getting the mutant sequence and the variant's place in it
    // exactly right, and then putting the ranked candidates on the track.
    //
    //   1. pick the mutation (the variants already on the track),
    //   2. pick the modality (siRNA guide, or gapmer ASO) and the chemistry it ships with,
    //   3. build the window around the variant as the SENSE mRNA in transcript orientation --
    //      through baja/bio/track-strand.js, so a minus-strand track reads correctly -- and
    //      apply the alternate allele to it,
    //   4. score every oligo covering the variant by where the wild-type mismatch lands,
    //   5. place the survivors, ranked, on the track.
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        const Strand = await exec('baja/bio/track-strand.js');
        const preset = (Array.isArray(presetTrack) ? presetTrack.filter(Boolean) : (presetTrack ? [presetTrack] : []));

        const pickTrack = () => new Promise((resolve) => {
            if (preset.length === 1) return resolve(preset[0]);
            let sel = [];
            try { sel = (graph.track || []).filter((t) => t && t.showResizeBar); } catch (e) { }
            if (sel.length === 1) return resolve(sel[0]);
            if ((graph.track || []).length === 1) return resolve(graph.track[0]);
            graph.setMouseMode('msg: Click the track carrying the mutation.');
            graph.addMouseDownListener((x, y) => {
                const ti = graph.getTrack(x, y);
                graph.clearMouseListeners(); graph.setMouseMode('navigate');
                resolve(ti < 0 ? null : graph.track[ti]);
            });
        });

        const track = await pickTrack();
        if (!track) { say('No track chosen.'); restoreHover(); return false; }

        // ---- 1. the mutation ----------------------------------------------------------------
        const all = (track.snpindels || []).filter((s) => s && s.xi != null);
        if (!all.length) {
            say('No variants on ' + (track.name || 'this track') + ' to design against. Add one from Variants — describe it (K27M), or load ClinVar — then come back.');
            restoreHover(); return false;
        }
        // Substitutions only for now, and said plainly: an indel changes the coordinate frame
        // of everything downstream of it, and a design built on a guessed frame is worse than
        // no design.
        const subs = all.filter((s) => (s.type === 'snp') || (('' + (s.reference0 || s.reference || '')).length === 1 && ('' + (s.alternate0 || s.alternate || '')).length === 1));
        if (!subs.length) {
            say('The ' + all.length + ' variant' + (all.length === 1 ? '' : 's') + ' on this track ' + (all.length === 1 ? 'is an' : 'are') + ' insertion/deletion. Allele-selective design here covers substitutions; indel support is not in yet.');
            restoreHover(); return false;
        }
        const nameOf = (s) => (s.name || s.id || 'variant') + '  ' + (s.reference0 || s.reference || '?') + '>' + (s.alternate0 || s.alternate || '?') + '  @' + Math.round(s.xi);
        const pickVariant = () => new Promise((resolve) => {
            if (subs.length === 1) return resolve(subs[0]);
            graph.showSideMenu(subs.slice(0, 40).map((s) => ({
                label: nameOf(s), move: () => { }, click: () => { graph.showSideMenu(null); resolve(s); }
            })).concat([{ label: 'Cancel', move: () => { }, click: () => { graph.showSideMenu(null); resolve(null); } }]),
                null, 'Design against ▸');
        });
        const snp = await pickVariant();
        if (!snp) { restoreHover(); return false; }

        // ---- 2. the modality ----------------------------------------------------------------
        const pickModality = () => new Promise((resolve) => {
            graph.showSideMenu([
                {
                    label: 'siRNA (RISC guide)', move: () => { },
                    click: () => { graph.showSideMenu(null); resolve({ modality: 'sirna', label: 'siRNA', lengths: [21], gapmer: null }); }
                },
                {
                    label: 'Gapmer ASO (RNase H)', move: () => { },
                    click: () => { graph.showSideMenu(null); resolve({ modality: 'gapmer', label: 'Gapmer ASO', lengths: [16, 18, 20], gapmer: { wing: 5, gap: 10 } }); }
                },
                { label: 'Cancel', move: () => { }, click: () => { graph.showSideMenu(null); resolve(null); } }
            ], null, 'Allele-selective modality ▸');
        });
        const mode = await pickModality();
        if (!mode) { restoreHover(); return false; }

        // ---- 2b. the chemistry -------------------------------------------------------------
        // Asked before anything is generated, not after: the chemistry is part of what the
        // candidate IS -- a gapmer's wings decide whether RNase H ever sees the duplex, and an
        // siRNA's pattern decides whether the guide survives to be loaded -- so a design handed
        // over without one would be a sequence pretending to be a compound. Same vocabulary as
        // the siRNA and gapmer designers, so a compound from here and one from there can be
        // compared and edited the same way.
        const SIRNA_CHEM = [
            { key: 'standard', label: "2'-F / 2'-OMe (standard)" },
            { key: 'esc', label: 'ESC (Enhanced Stabilization)' },
            { key: 'esc_plus', label: 'Advanced ESC (ESC+)' },
            { key: 'galnac_esc', label: 'GalNAc-conjugated ESC' },
            { key: 'all_2ome', label: "Fully 2'-OMe" }
        ];
        // A gapmer chemistry carries its GEOMETRY, and that geometry is a rule. 5-10-5 means
        // five wing residues either side of a ten-base DNA gap -- a twenty-mer -- and the
        // design is not free to shrink the gap or the wings to fit some other length. The
        // classic configurations: MOE and 2'-OMe gapmers at 5-10-5, the higher-affinity LNA
        // and cEt at 3-10-3, which is why those are shorter.
        const GAPMER_CHEM = [
            { key: "2'-MOE", label: "2'-MOE wings (5-10-5)", wing: 5, gap: 10, length: 20 },
            { key: 'LNA', label: 'LNA wings (3-10-3)', wing: 3, gap: 10, length: 16 },
            { key: 'cEt', label: 'cEt wings (3-10-3)', wing: 3, gap: 10, length: 16 },
            { key: "2'-OMe", label: "2'-OMe wings (5-10-5)", wing: 5, gap: 10, length: 20 }
        ];
        const pickChemistry = () => new Promise((resolve) => {
            const opts = (mode.modality === 'sirna') ? SIRNA_CHEM : GAPMER_CHEM;
            graph.showSideMenu(opts.map((c) => ({
                label: c.label, move: () => { },
                click: () => {
                    graph.showSideMenu(null);
                    resolve(mode.modality === 'sirna'
                        ? { template: c.key, backbone: 'PS', label: c.label }
                        : { wing: c.key, backbone: 'PS', label: c.label, geometry: { wing: c.wing, gap: c.gap, length: c.length } });
                }
            })).concat([{ label: 'Cancel', move: () => { }, click: () => { graph.showSideMenu(null); resolve(null); } }]),
                null, mode.label + ' chemistry \u25b8');
        });
        const chem = await pickChemistry();
        if (!chem) { restoreHover(); return false; }
        // The chemistry decides the geometry, so it also decides the length: a 5-10-5 gapmer is
        // a twenty-mer and nothing else. Set both here, after the choice, rather than guessing
        // a range at the modality step.
        if (mode.modality === 'gapmer' && chem.geometry) {
            mode.lengths = [chem.geometry.length];
            mode.gapmer = { wing: chem.geometry.wing, gap: chem.geometry.gap, strict: true };
        }

        // ---- 3. the window, as sense mRNA in transcript orientation --------------------------
        const orient = Strand.orientation(track);
        const minus = +track.strand < 0;
        const maxLen = Math.max.apply(null, mode.lengths);
        const pad = maxLen + 8;
        const lo = Math.max(Math.min(track.xi, track.xf), Math.round(snp.xi) - pad);
        const hi = Math.min(Math.max(track.xi, track.xf), Math.round(snp.xi) + pad);
        const xs = [];                       // window index -> track x, in TRANSCRIPT order
        if (minus) { for (let x = hi; x >= lo; x--) xs.push(x); }
        else { for (let x = lo; x <= hi; x++) xs.push(x); }
        const wt = xs.map((x) => Strand.codingBaseAt(track, x, orient)).join('');
        const vi = xs.indexOf(Math.round(snp.xi));
        if (vi < 0 || !/^[ACGT]+$/.test(wt)) {
            say('Could not read a clean sequence window around the variant on this track.');
            restoreHover(); return false;
        }
        // reference0 / alternate0 are the CODING-strand alleles (SnpIndel complements them for a
        // minus-strand track), which for a single base is transcript orientation too.
        const refTx = ('' + (snp.reference0 || snp.reference || '')).toUpperCase().slice(0, 1);
        const altTx = ('' + (snp.alternate0 || snp.alternate || '')).toUpperCase().slice(0, 1);
        if (!/^[ACGT]$/.test(altTx)) { say('That variant has no usable alternate base.'); restoreHover(); return false; }
        if (refTx && wt[vi] !== refTx) {
            say('The track reads ' + wt[vi] + ' at the variant where the variant says ' + refTx + '; designing against the track.');
        }
        const mut = wt.slice(0, vi) + altTx + wt.slice(vi + 1);

        // THE MUTATED TARGET, IN THE TRACK'S OWN FRAME. The window above is in transcript
        // orientation, which is what the scoring needs (guide positions, seed, gap) but NOT
        // what a compound is built from: Biopolymer reads bioObj.targetSequence as the sequence
        // running left to right along the track, and derives the strand it synthesises from
        // that plus the track's strand. Handing it the transcript-orientation site made the
        // minus-strand compounds the reverse complement of what they should be.
        //
        // So build the mutant a second time, ascending x, off the track's own stored sequence
        // with the alternate allele written in at the variant -- go to the snpindel, take the
        // alternate allele, mutate the target, and design from that.
        const storedAt = (x) => {
            const i = Math.floor(x) - Math.floor(track.xi);
            const b = (track.sequence || '')[i];
            return b ? b.toUpperCase() : 'N';
        };
        // Which allele reads in the track's own frame: reference0/alternate0 are the CODING
        // strand's, which is what a 'coding'-orientation minus track stores; a track holding
        // the plus-strand slice wants the plus-strand allele instead.
        const storedAlt = ((minus && orient === 'plus')
            ? ('' + (snp.alternate || snp.alternate0 || ''))
            : ('' + (snp.alternate0 || snp.alternate || ''))).toUpperCase().slice(0, 1);
        const vX = Math.round(snp.xi);
        let mutTrack = '';
        for (let x = lo; x <= hi; x++) mutTrack += (x === vX ? storedAlt : storedAt(x));
        // Every variant on the track that falls inside the window, so an oligo can mark all of
        // them and not only the one it was designed against.
        const variantXs = all.map((v) => Math.round(v.xi)).filter((x) => x >= lo && x <= hi);

        // ---- 4. score -----------------------------------------------------------------------
        say('Designing allele-selective ' + mode.label + ' (' + chem.label + ') against ' + (snp.name || 'the variant') + '…');
        let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
        let r = null;
        try {
            r = await exec(server + '/py/sequence/allele-selective-design.py', em, JSON.stringify({
                target_wt: wt, target_mut: mut,
                variant: { start: vi, end: vi + 1, wt_start: vi, wt_end: vi + 1, type: 'snp', ref: wt[vi], alt: altTx, label: snp.name || '' },
                modality: mode.modality, lengths: mode.lengths, top_n: 20, gapmer: mode.gapmer || {},
                chemistry: chem
            }));
        } catch (e) { r = null; }
        if (!r || r.error) { say('Design failed: ' + ((r && r.error) || 'no answer from the server') + '.'); restoreHover(); return false; }
        let cands = [];
        try { cands = JSON.parse(r.candidates || '[]'); } catch (e) { cands = []; }
        if (!cands.length) {
            let rej = {}; try { rej = JSON.parse(r.rejected || '{}'); } catch (e) { }
            say('No allele-selective ' + mode.label + ' candidate covers ' + (snp.name || 'that variant') + ' with the mismatch in a discriminating position'
                + (rej.position ? ' (' + rej.position + ' covered it but in a position that does not discriminate)' : '') + '.');
            restoreHover(); return false;
        }

        // ---- 5. place -----------------------------------------------------------------------
        // Built through Biopolymer, like every other compound in the app: it fills the
        // chemistry template with the SYNTHESIS sequence, wraps it as real HELM, and returns a
        // compound whose `sequence` is the TARGET site -- here the MUTANT allele, which is what
        // an allele-selective candidate is designed against and what should be read off it.
        // Hand-rolling the compound skipped all of that, which is why the chemistry did not
        // show: `structure` carried a bare sequence where the renderer expects HELM.
        const Biopolymer = await exec('baja/chem/biopolymer.js');
        try { graph.pushOntoHistory(); } catch (e) { }
        const ROW_STEP = 0.16, ROWS = 6, FLOOR = 0.22;
        let placed = 0, first = null;
        for (let i = 0; i < cands.length; i++) {
            const c = cands[i];
            try {
                const span = xs.slice(c.offset, c.offset + c.length);
                if (span.length !== c.length) continue;
                const xi = Math.min.apply(null, span), xf = Math.max.apply(null, span);
                const y = FLOOR + (i % ROWS) * ROW_STEP;
                const nm = (snp.name || 'variant') + ' ' + mode.label + ' P' + c.variant_position + ' #' + c.rank;
                // The mutant target site as it reads ALONG THE TRACK -- the frame Biopolymer
                // expects. It carries the alternate allele, so the compound displays the
                // mutant sequence and its synthesis strand is complementary to that allele.
                const targetTrack = mutTrack.slice(xi - lo, xf - lo + 1);
                if (targetTrack.length !== c.length) continue;
                const bioObj = { targetSequence: targetTrack, startIndex: xi, y: y, strand: track.strand };
                // siRNA: Biopolymer builds the sense/antisense patterns from the chemistry NAME
                // (its own siRNATemplatesFor -- alternating 2'-F/2'-OMe, ESC, fully 2'-OMe), so
                // the duplex here is the same chemistry the siRNA designer produces.
                // Gapmer: the template comes from the design, wings in the chosen chemistry
                // around a DNA gap.
                let chemObj;
                if (mode.modality === 'sirna') {
                    // Biopolymer's own siRNA patterns for this chemistry name, so the duplex is
                    // the same chemistry the siRNA designer builds. Passed explicitly (rather
                    // than left for generateCompound to look up) because its countBases() wants
                    // a template STRING on the object and throws on one that carries none.
                    const pats = Biopolymer.siRNATemplatesFor(chem.label, c.length);
                    chemObj = {
                        type: 'siRNA', name: chem.label,
                        sense: pats.sense, antisense: pats.antisense, template: pats.antisense,
                        // Overhangs are the chemistry's to declare: generateCompound reads them
                        // from here and the renderer hangs them off the guide.
                        antisenseOverhang: c.antisense_overhang || 'TT',
                        senseOverhang: c.sense_overhang || 'TT'
                    };
                } else {
                    chemObj = { type: 'gapmer', name: chem.label, template: c.helm_template };
                }
                let cmp = null;
                try { cmp = await Biopolymer.generateCompound(chemObj, bioObj); } catch (e) { cmp = null; }
                if (!cmp) continue;
                // Biopolymer sizes the compound from the template; pin it to the window span
                // this candidate actually covers on the track.
                cmp.xi = xi; cmp.xf = xf; cmp.y = y;
                cmp.targetSequence = targetTrack;   // the mutant target site, read off the compound
                cmp.targetSite = targetTrack;
                cmp.targetSiteTranscript = c.target_site;   // the same site 5'->3' on the transcript
                // HIGHLIGHT THE MUTATIONS. `mismatch` is a list of indices into the drawn
                // sequence, which the renderer paints red -- so the changed base stands out on
                // the oligo instead of being one letter among twenty. Indices are measured from
                // xi in ascending x, the same frame the drawing code uses.
                try {
                    cmp.mismatch = variantXs.filter((x) => x >= xi && x <= xf).map((x) => x - xi);
                    cmp.variantIndex = vX - xi;
                } catch (e) { }
                if (mode.modality === 'sirna') {
                    // generateCompound leaves an siRNA's `structure` empty -- the chemistry it
                    // built lives on the two strands -- so give the duplex a HELM structure of
                    // its own, or the compound reads as having no chemistry at all.
                    if (!cmp.structure && cmp.sense && cmp.antisense) {
                        cmp.structure = 'RNA1{' + cmp.sense + '}|RNA2{' + cmp.antisense + '}$$$$';
                    }
                    cmp.helm = cmp.structure;
                    cmp.senseDuplex = cmp.sense; cmp.antisenseDuplex = cmp.antisense;
                    cmp.chemistryTemplate = c.chemistry_template || chem.template;
                    cmp.conjugate = c.conjugate || null;
                } else {
                    cmp.designType = 'gapmer';
                    // Show the target the design was built against. Zoomed in, the chemistry
                    // beads spell out the synthesis strand and that is what is read; zoomed out
                    // past that, these letters are the target, with the mutation in red.
                    cmp.showTargetSequence = true;
                    // And make the target readable from the label too, for the same reason.
                    try { cmp.showLabel = true; cmp.labelAttribute = 'targetSequence'; cmp.labelPrefix = 'target '; } catch (e) { }
                    cmp.wingModification = c.wing_modification || null;
                    cmp.gapSize = c.gap_size; cmp.gapStart = c.gap_start_1based; cmp.gapEnd = c.gap_end_1based;
                    cmp.leftWingSize = c.left_wing_size; cmp.rightWingSize = c.right_wing_size;
                }
                cmp.name = nm;
                cmp.rank = c.rank;
                cmp.chemistryLayout = c.chemistry_layout || [];
                cmp.backbonePattern = c.backbone_pattern || [];
                cmp.chemistryLabel = c.chemistry_label || chem.label;
                cmp.score = c.score;
                cmp.gc_percent = c.gc_percent;
                cmp.designType = cmp.designType || 'sirna';
                // What makes it allele-selective, kept on the compound so the report and the
                // hover text can say it rather than just showing a score.
                cmp.alleleSelective = {
                    variant: snp.name || '', ref: wt[vi], alt: altTx,
                    position_in_antisense: c.variant_position,
                    discrimination: c.discrimination,
                    selectivity: c.selectivity,
                    wild_type_site: c.wt_site || ''
                };
                cmp.notes = (c.notes || []).concat(['Allele-selective: wild-type mismatch at ' + c.discrimination]);
                cmp.comment = 'Allele-selective ' + mode.label + ' vs ' + (snp.name || 'variant')
                    + ' (' + wt[vi] + '>' + altTx + '); wild-type mismatch at ' + c.discrimination
                    + '; chemistry ' + (c.chemistry_label || chem.label) + '.';
                cmp.color = c.score >= 85 ? '#22c55e' : (c.score >= 70 ? '#e0a400' : '#d1342f');
                // Same final step every other designer takes: adjustOligo walks the compounds
                // already on the track and pushes this one down until it sits clear of them, so
                // the coordinates must be set BEFORE it runs and left alone after.
                try { Biopolymer.adjustOligo(track, cmp); } catch (e) { }
                track.addOligo(cmp);
                placed++; if (!first) first = cmp;
                try { setTimeout(() => { try { cmp.highlight(1600, 'magenta'); if (graph.wake) graph.wake(); } catch (e) { } }, i * 60); } catch (e) { }
            } catch (e) { }
        }
        if (!placed) { say('Candidates were designed but none could be placed on the track.'); restoreHover(); return false; }
        try { if (graph.wake) graph.wake(); } catch (e) { }
        try {
            const tg = track.tgraph, w = maxLen + 25;
            const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2, span = Math.abs(tg.height || 0) || 0.1;
            if (graph.zoomRect) graph.zoomRect(tg.X(snp.xi - w), tg.X(snp.xi + w), cy + span * 4.2, cy - span * 2.4, 400);
        } catch (e) { }
        const best = cands[0];
        const msg = ' Placed ' + placed + ' allele-selective ' + mode.label + ' candidate' + (placed === 1 ? '' : 's')
            + ' against ' + (snp.name || 'the variant') + ' (' + wt[vi] + '>' + altTx + '), '
            + (best.chemistry_label || chem.label) + '. Best: ' + best.discrimination + ', score ' + best.score + '. ';
        try { graph.setResultMessage(msg); } catch (e) { say(msg); }
        restoreHover();
        return true;
    })();
}
