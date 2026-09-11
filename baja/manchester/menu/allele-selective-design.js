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
    // WHICH OF THESE IS ACTUALLY DRAWN.
    //
    // graph.setMessage() is the transient status line and the canvas deliberately does not
    // paint it -- only setError (orange) and setResultMessage (cyan) become toasts. Every
    // message in this file went through setMessage, so the ones that MATTER -- "click a
    // mutation", "no variants to design against", "no candidate discriminates" -- were
    // written to a surface nobody sees, and a run that refused simply ended in silence.
    //
    //   say()  in-progress chatter, may go unseen        ("Designing ...")
    //   tell() something the user has to read            (a prompt, or how a run ended)
    //   warn() the run cannot continue                   (a refusal, or a failure)
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const tell = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { say(m); } };
    const warn = (m) => { try { graph.setError(' ' + m + ' '); } catch (e) { say(m); } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        const Strand = await exec('baja/bio/track-strand.js');
        // presetTrack is where the menu was opened from. It no longer decides which track gets
        // designed on -- that now follows from the mutation, below -- and it is kept only as
        // the tie-break for a variant that sits on more than one loaded copy of a transcript.
        const preset = (Array.isArray(presetTrack) ? presetTrack.filter(Boolean) : (presetTrack ? [presetTrack] : []));

        // Substitutions of any length -- a single base, or a multi-base change across one codon
        // (H3F3A G34W is GGG>TGG when it lands wrong). What is EXCLUDED is an indel, which
        // shifts the coordinate frame of everything downstream of it, and a design built on a
        // guessed frame is worse than no design. Testing `type === 'snp'` alone let a
        // three-base allele through and then applied only its first base.
        const alleleOf = (s, which) => ('' + ((s[which + '0'] != null ? s[which + '0'] : s[which]) || '')).toUpperCase();

        // ---- 1. THE MUTATION, AND THE TRACK IT SITS ON --------------------------------------
        //
        // The mutation is what this design is FOR, so it is what gets asked for, and the track
        // follows from it. Opening straight into a list of every variant on one track asked the
        // user to answer in a menu a question they had already answered by looking at the
        // canvas -- and it refused outright when the mutation they had in mind was on a
        // different track, even though the design would have worked perfectly well there.
        //
        // Order of preference:
        //   a variant already SELECTED on the canvas  ->  use it, ask nothing
        //   nothing selected                          ->  say so, and let them click one
        //   repeated misses                           ->  fall back to the list, so the
        //                                                 flow can never dead-end
        const isSub = (s) => {
            const r = alleleOf(s, 'reference'), a = alleleOf(s, 'alternate');
            return r.length >= 1 && r.length === a.length && /^[ACGT]+$/.test(r) && /^[ACGT]+$/.test(a);
        };
        const trackOf = (snp) => {
            for (const t of (graph.track || [])) {
                if (((t && t.snpindels) || []).indexOf(snp) >= 0) return t;
            }
            return null;
        };
        const designable = () => {
            const out = [];
            for (const t of (graph.track || [])) {
                for (const s of ((t && t.snpindels) || [])) {
                    if (s && s.xi != null && isSub(s)) out.push({ snp: s, track: t });
                }
            }
            return out;
        };

        // WHAT COUNTS AS ALREADY SELECTED. Two ways a mutation gets picked in this app and
        // both are honoured: a lasso selection (graph.__lassoSelection carries kind:'snp'
        // entries) and a click, which sets .highlight on the snp while __snpSelectionActive
        // is on -- see the spotlight block in flexigraph/snpindel.js draw().
        const preSelected = () => {
            const out = [], seen = new Set();
            const add = (snp, t) => {
                if (!snp || snp.xi == null || seen.has(snp)) return;
                if (!isSub(snp)) return;
                seen.add(snp);
                out.push({ snp: snp, track: t || trackOf(snp) });
            };
            try {
                for (const e of (graph.__lassoSelection || [])) {
                    if (e && e.kind === 'snp' && e.ref) add(e.ref, e.track);
                }
            } catch (e) { }
            try {
                if (graph.__snpSelectionActive) {
                    for (const t of (graph.track || [])) {
                        for (const s of ((t && t.snpindels) || [])) if (s && s.highlight) add(s, t);
                    }
                }
            } catch (e) { }
            return out.filter((e) => e.track);
        };

        const nameOf = (s) => (s.name || s.id || 'variant') + '  ' + (s.reference0 || s.reference || '?') + '>' + (s.alternate0 || s.alternate || '?') + '  @' + Math.round(s.xi);

        const listPick = (entries, title) => new Promise((resolve) => {
            graph.showSideMenu(entries.slice(0, 40).map((e) => ({
                label: nameOf(e.snp) + (entries.some((o) => o.track !== e.track) ? '   [' + ((e.track && e.track.name) || 'track') + ']' : ''),
                move: () => { },
                click: () => { graph.showSideMenu(null); resolve(e); }
            })).concat([{ label: 'Cancel', move: () => { }, click: () => { graph.showSideMenu(null); resolve(null); } }]),
                null, title);
        });

        // Click one on the canvas. Uses graph.getSNPs -- the same screen-space lollipop hit
        // test the SNP right-click menu uses, which covers the head AND the stem and picks the
        // nearest head when markers stack -- rather than a coordinate guess of its own.
        const clickPick = (pool) => new Promise((resolve) => {
            let misses = 0;
            const finish = (val) => {
                try { graph.clearMouseListeners(); } catch (e) { }
                try { graph.setMouseMode('navigate'); } catch (e) { }
                resolve(val);
            };
            graph.clearMouseListeners();
            graph.setMouseMode('msg: Click the mutation to design against — then pick the modality and its chemistry');
            tell('Click a mutation on the canvas to design against. The modality and chemistry come next, then the compounds are drawn on the track.');
            graph.addMouseDownListener((x, y) => {
                let hits = [];
                try { hits = graph.getSNPs(x, y) || []; } catch (e) { hits = []; }
                // The one actually aimed at: hit regions of stacked lollipops overlap, and the
                // heads are what is separated in y.
                let hit = hits[0] || null;
                if (hits.length > 1) {
                    const sx = graph.X(x), sy = graph.Y(y);
                    let best = Infinity;
                    for (const c of hits) {
                        if (!c) continue;
                        const d = (typeof c.headDistance === 'function') ? c.headDistance(sx, sy) : Infinity;
                        if (d < best) { best = d; hit = c; }
                    }
                }
                if (!hit) {
                    misses++;
                    if (misses >= 3) { finish('list'); return; }
                    tell('That is not a mutation. Click the lollipop marker of the variant you want — or miss once more and a list of them opens.');
                    return;
                }
                if (!isSub(hit)) {
                    warn((hit.name || 'That variant') + ' is an insertion/deletion. Allele-selective design here covers substitutions, because an indel shifts the frame of everything downstream. Click a substitution instead.');
                    return;
                }
                // A variant loaded onto two copies of the same transcript is two markers stacked
                // at one locus. When the click cannot separate them, prefer the one on the track
                // the menu was opened from.
                let pickHit = hit;
                if (hits.length > 1 && preset.length) {
                    const onPreset = hits.filter((c) => c && isSub(c) && preset.indexOf(trackOf(c)) >= 0);
                    if (onPreset.length === 1) pickHit = onPreset[0];
                }
                const t = trackOf(pickHit);
                if (!t) { warn('That mutation is not on a track this design can read. Click another.'); return; }
                finish({ snp: pickHit, track: t });
            });
        });

        let chosen = null;
        const pool = designable();
        const pre = preSelected();
        if (pre.length === 1) {
            chosen = pre[0];
        } else if (pre.length > 1) {
            // Several selected on purpose: which one still has to be said, but only among
            // those, not among every variant on the canvas.
            chosen = await listPick(pre, 'Design against ▸');
        } else if (!pool.length) {
            // Nothing designable anywhere -- say which of the two reasons it is.
            const anyVariant = (graph.track || []).some((t) => ((t && t.snpindels) || []).some((s) => s && s.xi != null));
            warn(anyVariant
                ? 'The variants on the canvas are all insertions/deletions. Allele-selective design here covers substitutions; indel support is not in yet.'
                : 'No variants on the canvas to design against. Add one from Variants — describe it (K27M), or load ClinVar — then come back.');
            restoreHover(); return false;
        } else {
            chosen = await clickPick(pool);
            if (chosen === 'list') chosen = await listPick(pool, 'Design against ▸');
        }
        if (!chosen || !chosen.snp || !chosen.track) { restoreHover(); return false; }
        const snp = chosen.snp;
        const track = chosen.track;
        try { if (typeof track.select === 'function') track.select(); } catch (e) { }

        const all = (track.snpindels || []).filter((s) => s && s.xi != null);

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
            warn('Could not read a clean sequence window around the variant on this track.');
            restoreHover(); return false;
        }
        // THE MUTATED TARGET. Built ONCE, in the track's own frame -- ascending x, off the
        // track's own stored sequence with the alternate allele written in at the variant.
        // That is the frame Biopolymer reads (it derives the synthesised strand from it and
        // the track's strand), and the transcript-orientation copy the scoring needs is then
        // derived from it rather than mutated a second time, so the two cannot disagree.
        const storedAt = (x) => {
            const i = Math.floor(x) - Math.floor(track.xi);
            const b = (track.sequence || '')[i];
            return b ? b.toUpperCase() : 'N';
        };
        // Which allele reads in the track's own frame: reference0/alternate0 are the CODING
        // strand's, which is what a 'coding'-orientation minus track stores; a track holding
        // the plus-strand slice wants the plus-strand allele instead. Either way base i of the
        // allele sits at track x = xi + i, because SnpIndel complements without reversing --
        // which is what lets a multi-base substitution be written straight across the span.
        const pick = (which) => ('' + ((minus && orient === 'plus')
            ? (snp[which] || snp[which + '0'] || '')
            : (snp[which + '0'] || snp[which] || ''))).toUpperCase();
        const storedAlt = pick('alternate'), storedRef = pick('reference');
        if (!/^[ACGT]+$/.test(storedAlt)) { warn('That variant has no usable alternate allele.'); restoreHover(); return false; }
        const vX = Math.round(snp.xi);
        const vEnd = vX + storedAlt.length - 1;      // last track x the allele covers
        if (storedRef && storedRef.length === storedAlt.length) {
            let have = ''; for (let x = vX; x <= vEnd; x++) have += storedAt(x);
            if (have !== storedRef) {
                tell('The track reads ' + have + ' where the variant says ' + storedRef + '; designing against the track.');
            }
        }
        let mutTrack = '';
        for (let x = lo; x <= hi; x++) {
            mutTrack += (x >= vX && x <= vEnd) ? storedAlt[x - vX] : storedAt(x);
        }
        // The same mutant, read in TRANSCRIPT orientation, for the scoring.
        const COMPL = { A: 'T', C: 'G', G: 'C', T: 'A', N: 'N' };
        const mut = xs.map((x) => {
            const b = mutTrack[x - lo] || 'N';
            return (minus && orient === 'plus') ? (COMPL[b] || 'N') : b;
        }).join('');

        // The change as it reads in transcript orientation, for the labels and the scoring: the
        // span the allele covers in the transcript window, which on a minus-strand track is the
        // reverse complement of the track-frame allele.
        const viEnd = Math.max(xs.indexOf(vX), xs.indexOf(vEnd));
        const viStart = Math.min(xs.indexOf(vX), xs.indexOf(vEnd));
        const refTx = wt.slice(viStart, viEnd + 1);
        const altTx = mut.slice(viStart, viEnd + 1);

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
                variant: { start: viStart, end: viEnd + 1, wt_start: viStart, wt_end: viEnd + 1, type: 'snp', ref: refTx, alt: altTx, label: snp.name || '' },
                // EVERY REGISTER, not a top-20 slice of them. One candidate per base of the
                // oligo is what covering an allele means -- a 20-mer has twenty walks across
                // it, the variant at position 1 of the first and position 20 of the last -- and
                // a flat cap of 20 also quietly lost the last register of a 21-mer siRNA.
                // 0 tells the designer to keep them all.
                modality: mode.modality, lengths: mode.lengths, top_n: 0, gapmer: mode.gapmer || {},
                chemistry: chem
            }));
        } catch (e) { r = null; }
        if (!r || r.error) { warn('Design failed: ' + ((r && r.error) || 'no answer from the server') + '.'); restoreHover(); return false; }
        let cands = [];
        try { cands = JSON.parse(r.candidates || '[]'); } catch (e) { cands = []; }
        if (!cands.length) {
            let rej = {}; try { rej = JSON.parse(r.rejected || '{}'); } catch (e) { }
            tell('No allele-selective ' + mode.label + ' candidate covers ' + (snp.name || 'that variant') + ' with the mismatch in a discriminating position'
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
        // One row per candidate would run off the track; six rows made a legible ladder when
        // there were a handful. With a full register walk there are as many candidates as the
        // oligo is long, so the ladder is sized from what actually came back -- capped, because
        // adjustOligo pushes anything that still collides further down anyway.
        const ROW_STEP = 0.16, ROWS = Math.max(6, Math.min(12, cands.length)), FLOOR = 0.22;
        let placed = 0, first = null;
        const made = [];          // the compounds this run put on the track, for the framing + pulse below
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
                    // Every base this variant changes, plus any other variant in range.
                    const own = [];
                    for (let x = vX; x <= vEnd; x++) if (x >= xi && x <= xf) own.push(x - xi);
                    const others = variantXs.filter((x) => x >= xi && x <= xf && !(x >= vX && x <= vEnd)).map((x) => x - xi);
                    cmp.mismatch = own.concat(others);
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
                    variant: snp.name || '', ref: refTx, alt: altTx,
                    position_in_antisense: c.variant_position,
                    discrimination: c.discrimination,
                    discriminates: (c.discriminates !== false),
                    selectivity: c.selectivity,
                    wild_type_site: c.wt_site || ''
                };
                const sel = (c.discriminates !== false);
                cmp.notes = (c.notes || []).concat([
                    (sel ? 'Allele-selective: wild-type mismatch at ' : 'NOT allele-selective: wild-type mismatch at ')
                    + c.discrimination]);
                cmp.comment = (sel ? 'Allele-selective ' : 'Non-discriminating ') + mode.label
                    + ' vs ' + (snp.name || 'variant')
                    + ' (' + refTx + '>' + altTx + '); wild-type mismatch at ' + c.discrimination
                    + '; chemistry ' + (c.chemistry_label || chem.label) + '.';
                cmp.color = !sel ? '#d1342f'
                    : (c.score >= 85 ? '#22c55e' : (c.score >= 70 ? '#e0a400' : '#d1342f'));
                // WHY IT IS RED, ON THE COMPOUND. The steric and gapmer designers put their
                // reason in flagReason and the renderer draws it beside a red compound at
                // every zoom (flexigraph/oligo.js, baja/bio/track-flexi.js). These were
                // colored red and left silent, so the one modality where red has TWO quite
                // different causes -- a register that cannot discriminate at all, and one
                // that simply scores badly -- was the one that did not say which.
                if (cmp.color === '#d1342f') {
                    cmp.flagReason = !sel
                        ? ('Not selective — ' + c.discrimination)
                        : ('Low score ' + (Math.round((+c.score || 0) * 10) / 10) + ' — ' + c.discrimination);
                    try {
                        cmp.setLabelAttribute('flagReason', {
                            prefix: '', offsetY: -18,
                            textColor: 'white', fillColor: '#a3402c', strokeColor: '#4a170e',
                            font: 'bold 10px Arial'
                        });
                    } catch (e) { }
                }
                // Same final step every other designer takes: adjustOligo walks the compounds
                // already on the track and pushes this one down until it sits clear of them, so
                // the coordinates must be set BEFORE it runs and left alone after.
                try { Biopolymer.adjustOligo(track, cmp); } catch (e) { }
                track.addOligo(cmp);
                placed++; if (!first) first = cmp;
                made.push(cmp);
            } catch (e) { }
        }
        if (!placed) { warn('Candidates were designed but none could be placed on the track.'); restoreHover(); return false; }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        // ---- 6. SHOW WHAT LANDED ------------------------------------------------------------
        //
        // The camera used to be pinned to a fixed window around the variant -- maxLen + 25 bases
        // wide and a couple of track-heights tall. adjustOligo stacks the candidates in rows
        // until they sit clear of each other and of whatever was already on the track, so with
        // twenty candidates the lower rows finish BELOW that window and the longer ones finish
        // outside it sideways: compounds were placed, the view did not contain them, and from
        // where the user was sitting the design had produced nothing.
        //
        // So the frame is measured from the compounds that were actually made. It only moves
        // when it has to -- a view that already holds them is left where the user put it, since
        // taking the camera away from someone who is already looking at the right place is its
        // own kind of failure.
        try {
            const tg = track.tgraph;
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (const c of made) {
                const a = Math.min(+c.xi, +c.xf), b = Math.max(+c.xi, +c.xf);
                if (isFinite(a) && isFinite(b)) { x0 = Math.min(x0, a); x1 = Math.max(x1, b); }
                const cy = +c.y;
                if (isFinite(cy)) { y0 = Math.min(y0, cy); y1 = Math.max(y1, cy); }
            }
            // The variant itself belongs in shot: it is what the design is aimed at.
            if (isFinite(+snp.xi)) { x0 = Math.min(x0, +snp.xi); x1 = Math.max(x1, +snp.xi); }
            if (isFinite(x0) && isFinite(x1) && x1 >= x0 && isFinite(y0) && isFinite(y1) && tg) {
                // Track x/y -> the world frame zoomRect works in. tgraph.X/Y are the same
                // mapping every draw() here goes through, so this frames what is drawn rather
                // than a coordinate that only looks similar.
                const wx0 = tg.X(x0), wx1 = tg.X(x1);
                const wyTop = tg.Y(y1 + 0.14), wyBot = tg.Y(y0 - 0.10);
                const already = (() => {
                    try {
                        // The CURRENT VIEW is graph.graph.grid -- the same bounds getViewport()
                        // tests tracks against in flexigraph/gene.js. Named first, because a
                        // gene may also carry a `grid` of its own that is not the viewport.
                        const g = (graph.graph && graph.graph.grid) || graph.grid;
                        if (!g || !isFinite(+g.xmin) || !isFinite(+g.xmax)) return false;
                        const inX = Math.min(wx0, wx1) >= +g.xmin && Math.max(wx0, wx1) <= +g.xmax;
                        const lo = Math.min(+g.ymin, +g.ymax), hi = Math.max(+g.ymin, +g.ymax);
                        const inY = Math.min(wyTop, wyBot) >= lo && Math.max(wyTop, wyBot) <= hi;
                        return inX && inY;
                    } catch (e) { return false; }
                })();
                if (!already && graph.zoomRect) {
                    const xpad = Math.max(Math.abs(wx1 - wx0) * 0.10, Math.abs(tg.X(maxLen) - tg.X(0)) || 0);
                    const ypad = Math.abs(wyBot - wyTop) * 0.18;
                    const a = Math.min(wx0, wx1) - xpad, b = Math.max(wx0, wx1) + xpad;
                    const yA = Math.max(wyTop, wyBot) + ypad, yB = Math.min(wyTop, wyBot) - ypad;
                    await graph.zoomRect(a, b, yA, yB, 400);
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                }
            }
        } catch (e) { }

        // THE PULSE, AFTER the camera has settled and not before. Each compound flashed as it
        // was constructed, which is during the design loop -- most of it played out while the
        // view was still somewhere else, so the one cue that says "these are the new ones" was
        // spent off-screen. Staggering it here runs the wave left to right across compounds
        // that are, by this point, known to be in shot.
        try {
            const wave = made.slice().sort((a, b) => (+a.xi) - (+b.xi));
            wave.forEach((c, k) => {
                setTimeout(() => {
                    // >= 1200 is oligo.js's LANDING highlight: the expanding burst plus the
                    // blink, rather than the brief hover glow.
                    try { c.highlight(1800, 'magenta'); if (graph.wake) graph.wake(); } catch (e) { }
                }, 120 + k * 70);
            });
        } catch (e) { }
        // The best DISCRIMINATING register, chosen here rather than assumed to be cands[0].
        // The designer does sort discriminating-first, but "the headline is whichever element
        // happens to be at index 0" is the kind of coupling that reports a red, useless
        // register as the best result the moment that ordering changes.
        const best = cands.filter((c) => c && c.discriminates !== false)
            .sort((a, b) => (+b.score || 0) - (+a.score || 0))[0] || cands[0];
        // WHICH OF THEM ARE ACTUALLY SELECTIVE. Every register across the allele is placed now,
        // and the ones whose mismatch cannot discriminate (an siRNA's P1 or 3' end, under a
        // gapmer's wing) are placed too -- ranked last, colored red, and carrying a note that
        // says why. A count that lumped them in with the rest would overstate what the run
        // produced, so the two are named separately.
        const nSel = made.filter((c) => c && c.alleleSelective && c.alleleSelective.discriminates !== false).length;
        const msg = ' Placed ' + placed + ' ' + mode.label + ' candidate' + (placed === 1 ? '' : 's')
            + ' across ' + (snp.name || 'the variant') + ' (' + refTx + '>' + altTx + ') — one per register — '
            + nSel + ' of them allele-selective'
            + ((placed - nSel) > 0 ? (', ' + (placed - nSel) + ' shown in red because the mismatch lands where it cannot discriminate') : '')
            + '. ' + (best.chemistry_label || chem.label) + '. Best: ' + best.discrimination + ', score ' + best.score + '. ';
        try { graph.setResultMessage(msg); } catch (e) { say(msg); }
        restoreHover();
        return true;
    })();
}
