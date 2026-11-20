function (graph, genegraph_panel_layout, presetTrack, presetRange, presetMode, presetTissue) {
    // Splicing profile — pick a magnitude mode, then click a track to send its
    // sequence to the local bajasplice-lib models (py/bio/splice/splicing-profile.py,
    // run via exec rather than the old POSTJSON TF-serving call) and draw the
    // predicted splice junctions as a sashimi-plot layer.
    //
    //   sites : magnitude = splice-site strength (SpliceNet)
    //   psi   : magnitude = cassette-exon inclusion across 54 GTEx tissues (PSINet)
    return new Promise((resolve) => {

        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        // Re-dock the predictive-models toolbar once the run finishes.
        const resetModelsToolbar = () => {
            try { exec('baja/ml/predictive-models-toolbar.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const runOnTrack = async (track, mode, range) => {
            try {
                // A range scopes the model to the SELECTED sequence: send that sub-sequence and
                // shift xi to the range start so the scores land at the right coordinates.
                // PSI is left on the whole track — it needs the transcript's exon structure,
                // which a cut-out range no longer describes (see exonsArg below).
                let seq = track && track.sequence;
                let xi = (track && track.xi != null) ? track.xi : 0;

                // A spliced sequence in a genomic frame cannot be profiled. The models
                // score the first and last INTRONIC base of every intron, with 1,000 nt of
                // context on each side; a cDNA has had those bases removed at every
                // exon-exon boundary, so it comes back with nothing over threshold and an
                // empty plot that looks like a model failure. The signature is a sequence
                // shorter than the span it claims to occupy: a pre-mRNA track holds one
                // base per coordinate, a cDNA holds only the exonic ones (SMN2-231 on the
                // alt contig HSCHR5_1_CTG1_1 arrives this way, because the server's
                // pre-mRNA path only knows primary-assembly transcripts and falls back to
                // the Ensembl cDNA). Refuse it with the reason rather than run and say
                // "no junctions".
                if (seq && seq.length && Number.isFinite(+track.xi) && Number.isFinite(+track.xf)) {
                    const span = Math.abs(Math.floor(+track.xf) - Math.floor(+track.xi)) + 1;
                    // Off-by-one loaders exist (a track one base short is still genomic);
                    // a cDNA is shorter by whole introns, so a 1% tolerance separates them.
                    if (seq.length < span * 0.99) {
                        graph.setMessage(' ' + (track.name || 'This track') + ' holds a spliced sequence ('
                            + ('' + seq.length).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' nt) in a '
                            + ('' + span).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' nt genomic frame — '
                            + 'no introns to score. Load the transcript as pre-mRNA (a primary-assembly '
                            + 'Ensembl id) and run again. ');
                        restoreHover(); return false;
                    }
                }
                if (range && mode !== 'psi' && Number.isFinite(+range.start) && Number.isFinite(+range.end) && +range.end > +range.start) {
                    try {
                        // Cut the selection WITH flanking context. SpliceNet scores a position
                        // from 2,000 nt around it, so a bare cut-out arrives zero-padded on
                        // both sides: every site within 1,000 nt of either edge is scored
                        // against padding instead of sequence, and a selection shorter than
                        // that is nothing but edge. It comes back with no site over the 0.10
                        // threshold and the run reports no junctions -- the model working
                        // exactly as told on a question it was not given enough to answer.
                        //
                        // A junction also needs both of its ends inside what was sent, so a
                        // selection over an exon had no downstream acceptor to pair with.
                        //
                        // The pad is sequence the track already has, so this costs one wider
                        // cut and nothing else. xi moves to the padded start, which is what
                        // keeps the returned coordinates absolute.
                        const PAD = 1000;                       // context // 2
                        const lo = Math.min(track.xi, track.xf), hi = Math.max(track.xi, track.xf);
                        const cutStart = Math.max(lo, Math.floor(+range.start) - PAD);
                        const cutEnd = Math.min(hi, Math.ceil(+range.end) + PAD);
                        const sub = track.getSequenceRange ? track.getSequenceRange(cutStart, cutEnd) : null;
                        if (sub && sub.length) { seq = sub; xi = cutStart; }
                    } catch (e) { }
                }
                if (!seq || !seq.length) {
                    graph.setMessage(' That track has no sequence to profile. ');
                    restoreHover(); return false;
                }
                const strand = '' + (track.strand != null ? track.strand : 1);

                // Which strand does a MINUS-strand track's string hold? Two loaders disagree:
                // the server's pre-mRNA payload is the plus-strand genomic slice stored as is
                // ('plus'), while the older Ensembl path stored the transcript sequence reversed,
                // i.e. the coding strand by ascending x ('coding'). The model needs the transcript,
                // so the script has to know which reverse to apply. Decide from the annotated
                // exon boundaries: at each intron the plus-strand text reads AC before the exon
                // (the donor, read backwards) and CT after it (the acceptor), the coding-strand
                // text reads their complements TG and GA. Majority wins; no exons -> 'plus',
                // which is what the current loader produces.
                let orientation = 'plus';
                if (+strand < 0 && track.getExons && typeof seq === 'string' && Number.isFinite(+track.xi)) {
                    try {
                        let plusHits = 0, codingHits = 0;
                        const at = (x) => { const i = Math.floor(x) - Math.floor(+track.xi); return (i >= 0 && i < seq.length) ? seq[i].toUpperCase() : ''; };
                        for (const e of (track.getExons() || [])) {
                            const lo = Math.min(+e.xi, +e.xf), hi = Math.max(+e.xi, +e.xf);
                            const donor = at(lo - 2) + at(lo - 1);       // intron side of the exon's 3' end
                            const acceptor = at(hi + 1) + at(hi + 2);    // intron side of the exon's 5' end
                            if (donor === 'AC') plusHits++; else if (donor === 'TG') codingHits++;
                            if (acceptor === 'CT') plusHits++; else if (acceptor === 'GA') codingHits++;
                        }
                        if (codingHits > plusHits) orientation = 'coding';
                    } catch (e) { }
                }

                // PSI mode needs real exon structure — send the track's annotated
                // exons (track-local [xi, xf], transcript order) if it has them.
                let exonsArg = '';
                let __exonPairs = [];
                if (mode === 'psi' && track.getExons) {
                    try {
                        const ex = (track.getExons() || [])
                            .map((e) => [+e.xi, +e.xf])
                            .filter((p) => isFinite(p[0]) && isFinite(p[1]))
                            .sort((a, b) => a[0] - b[0]);
                        if (ex.length) { exonsArg = JSON.stringify(ex); __exonPairs = ex; }
                    } catch (e) { }
                }

                // Context-specific status: which model output, on which track, over what span.
                // Cleared in the finally at the end of runOnTrack.
                const __what = (mode === 'psi') ? 'PSI inclusion' : 'donor/acceptor scores';
                const __where = (track.name || 'track')
                    + (range ? (' · ' + (Math.abs(+range.end - +range.start)) + ' nt selection') : ' · whole track');
                const __say = (phase) => {
                    try { exec('baja/lib/work-status.js', 'BajaSplice · ' + __what + ' → ' + __where + (phase ? ('  ·  ' + phase) : '')); } catch (e) { }
                };
                __say('scoring ' + ('' + seq.length).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' nt');

                graph.setMessage(' Running splicing model… ');
                const server = window['env']['apiUrl'];
                // Surface backend progress / messages (model load, scoring…). They double as
                // the status line, so the badge follows the phase the run is actually in.
                let em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); __say('' + m); } catch (e) { } });
                // TISSUE, FOR PSI ONLY. PSINet predicts a PSI per GTEx tissue and this
                // module used to average all of them. The average is the right default and
                // the wrong answer for a neural target: an exon included in brain and out
                // everywhere else averages to mid-range and reads as unreliable, when in
                // brain it is a clean decision. Empty keeps the all-tissue mean.
                const tissueArg = (mode === 'psi' && presetTissue) ? ('' + presetTissue) : '';
                // THE CHROMOSOME, FOR THE MAPPABILITY LOOKUP. Track x is genomic, so each
                // exon's [xi, xf] is already a genomic interval and the chromosome is the one
                // part the sequence cannot supply. Without it the backend cannot tell whether
                // an exon's PSI label was built from reads a paralog could equally have
                // produced, which is how SMN2 exon 7 came to be labelled 96% stable.
                const chromArg = (mode === 'psi' && track && track.chr != null) ? ('' + track.chr) : '';
                // THE VARIANTS ON THE TRACK GO TO THE MODEL WITH THE SEQUENCE. A variant
                // loaded from ClinVar is an annotation: it marks a position and changes
                // nothing, so a PSI run scored the reference and the exon kept its old
                // number with a pathogenic lollipop sitting under it. Reading that as "this
                // mutation does not affect splicing" is the wrong conclusion and an easy one.
                // Sent here, each one is written into the sequence and its exon scored again.
                let variantsArg = '';
                if (mode === 'psi' && track && Array.isArray(track.snpindels) && track.snpindels.length) {
                    try {
                        const vs = track.snpindels.map((v) => ({
                            pos: Math.floor(+(v.xi != null ? v.xi : v.pos)),
                            ref: '' + ((v.ref != null ? v.ref : v.reference) || ''),
                            alt: '' + ((v.alt != null ? v.alt : v.alternate) || ''),
                            name: '' + (v.name || v.id || '')
                        })).filter((v) => isFinite(v.pos) && v.alt);
                        // A cap, because each variant is a forward pass: 64 is far more than
                        // a track carries in practice and bounds a pathological case.
                        if (vs.length) variantsArg = JSON.stringify(vs.slice(0, 64));
                    } catch (e) { variantsArg = ''; }
                }
                const data = await exec(server + '/py/bio/splice/splicing-profile.py', em, '' + seq, '' + xi, strand, '' + mode, exonsArg, orientation, tissueArg, chromArg, variantsArg);

                if (data && data.error) {
                    graph.setMessage(' Splicing error: ' + data.error + ' ');
                    restoreHover(); return false;
                }
                let junc = [];
                try { junc = JSON.parse((data && data.junctions) || '[]'); } catch (e) { junc = []; }
                if (!junc.length) {
                    // Say WHAT the model saw, not just that the answer was empty. An empty
                    // sashimi plot has two very different causes -- a sequence with no splice
                    // sites in it, and a run that never got far enough to look -- and "no
                    // junctions predicted" reads like a failure in both cases. The site counts
                    // and the best score separate them: sites found but no pairing is a real
                    // biological answer, nothing found at all is worth a second look.
                    let __d = [], __a = [];
                    try { __d = JSON.parse((data && data.donor) || '[]'); } catch (e) { }
                    try { __a = JSON.parse((data && data.acceptor) || '[]'); } catch (e) { }
                    const __best = (arr) => arr.reduce((m, p) => Math.max(m, +p[1] || 0), 0);
                    const __top = Math.max(__best(__d), __best(__a));
                    graph.setMessage(mode === 'psi'
                        ? ' No cassette-exon events detected in that sequence. '
                        : (' No splice junctions predicted over ' + (data && data.n ? data.n : seq.length)
                            + ' nt — ' + __d.length + ' donor and ' + __a.length + ' acceptor positions '
                            + 'scored above 0.02, best ' + __top.toFixed(2) + '. A junction needs a donor '
                            + 'and an acceptor, both at least 0.10, inside the same sequence. '));
                    restoreHover(); return false;
                }

                // Build a base TrackLayer carrying the sashimi arcs as plain
                // `junctions` data. Rendering lives in TrackLayer.drawSashimi
                // (gated on arc_type), so the layer serializes and reloads as an
                // ordinary TrackLayer — no custom subclass to lose on load.
                const TrackLayer = await exec('baja/bio/track-layer.js');
                const tg = track.tgraph;
                const label = (track.name || 'track') + (mode === 'psi' ? '_psi_sashimi' : '_sashimi');
                const layer = new TrackLayer(label, tg.xmin, 0, tg.xmax, 1);
                layer.data_type = 'splicing';
                layer.arc_type = 'SpliceSashimi';
                layer.magnitudeMode = mode;
                // Distinct color scheme per magnitude model so the two are easy to
                // tell apart: site strength = indigo->green, PSI = teal->orange.
                if (mode === 'psi') {
                    layer.donorColor = 'rgba(26,163,189,0.95)';    // teal (donor)
                    layer.acceptorColor = 'rgba(224,112,59,0.95)'; // orange (acceptor)
                } else {
                    layer.donorColor = 'rgba(94,84,199,0.95)';     // indigo (donor)
                    layer.acceptorColor = 'rgba(46,160,102,0.95)'; // green (acceptor)
                }
                // Site strength is a probability in [0,1]; present it on a 0–2
                // scale. PSI stays 0–1. magMax tells the renderer the top of the
                // scale so arc weight / crest stay normalized either way.
                const magMax = (mode === 'psi') ? 1 : 2;
                layer.magMax = magMax;
                // Junctions arrive as { d, a, dp, ap, mag, kind, annotated }. `annotated`
                // must be carried: it is how the renderer tells the transcript's own exon
                // structure from a topology only the model proposes, and dropping it made
                // every cryptic junction look canonical. Absent (an older backend) means the
                // junction came from the annotation, which is what that backend only emitted.
                layer.junctions = junc.map((j) => {
                    let baseMag = (typeof j.mag === 'number') ? j.mag : Math.min(+j.dp || 0, +j.ap || 0);
                    return {
                        d: +j.d, a: +j.a,
                        dp: +j.dp || 0, ap: +j.ap || 0,
                        mag: (mode === 'psi') ? baseMag : baseMag * 2,   // sites: 0..1 -> 0..2
                        kind: j.kind || 'junction',
                        annotated: (j.annotated === false) ? false : true,
                        // Which exon's inclusion this arc reports. Two arcs share a junction
                        // whenever two consecutive cassette exons do, so without this the
                        // plot shows two different percentages on one line and looks wrong.
                        exon: (j.exon == null ? null : +j.exon),
                        // The exons this junction JOINS (one arc per junction now, so an
                        // inclusion arc borders two of them). The skip arc carries the one
                        // exon it skips.
                        exons: Array.isArray(j.exons) ? j.exons.map(Number) : null,
                        // A competing splice site (kind 'alt-acceptor' / 'alt-donor'): how far
                        // it moves the exon edge, in nt, and its share of that edge.
                        shift: (j.shift == null ? null : +j.shift),
                        share: (j.share == null ? null : +j.share)
                    };
                });
                // HOW RELIABLY EACH EXON IS SPLICED IN. The arcs already carry the inclusion
                // level; what they do not say is whether that level is a decision or a
                // coin flip. An exon at 99% and one at 2% are both RELIABLE, one reliably
                // in and one reliably out; an exon at 50% is the unreliable one, and it is
                // the one worth an oligo, a variant hunt or a second look. So the score is
                // distance from the nearest extreme, 1 - |2*PSI - 1|: zero at 0% and at
                // 100%, one at 50%.
                //
                // The arcs number exons in transcript order (1-based) while the exon list
                // is sorted by ascending x, so the two disagree on a minus-strand track.
                // Rather than trust a strand rule, both mappings are TESTED against the
                // arc endpoints, which have to land on the exon's own edges, and the one
                // that fits is used. A wrong mapping here would put every label on the
                // wrong exon and still look plausible.
                if (mode === 'psi' && __exonPairs.length && layer.junctions.length) {
                    const n = __exonPairs.length;
                    const bounds = __exonPairs.map((p) => [Math.min(p[0], p[1]), Math.max(p[0], p[1])]);
                    const at = (num, flip) => bounds[flip ? (n - num) : (num - 1)];
                    const fit = (flip) => {
                        let ok = 0, seen = 0;
                        for (const j of layer.junctions) {
                            if (j.exon == null) continue;
                            const b = at(j.exon, flip);
                            if (!b) continue;
                            seen++;
                            const near = Math.min(Math.abs(j.d - b[0]), Math.abs(j.d - b[1]),
                                                  Math.abs(j.a - b[0]), Math.abs(j.a - b[1]));
                            if (near <= 3) ok++;
                        }
                        return seen ? ok / seen : -1;
                    };
                    const fFalse = fit(false), fTrue = fit(true);
                    const flip = fTrue > fFalse;
                    const rows = [];
                    if (Math.max(fFalse, fTrue) > 0) {
                        const psiOf = {};
                        for (const j of layer.junctions) {
                            if (j.exon == null || !isFinite(+j.mag)) continue;
                            // a skip arc reports the share that LEAVES the exon out
                            const v = (j.kind === 'skip') ? (1 - +j.mag) : +j.mag;
                            if (v < 0 || v > 1) continue;
                            (psiOf[j.exon] = psiOf[j.exon] || []).push(v);
                        }
                        for (const k of Object.keys(psiOf)) {
                            const num = +k;
                            const b = at(num, flip);
                            if (!b) continue;
                            const vs = psiOf[k].slice().sort((x, y) => x - y);
                            const psi = vs[Math.floor(vs.length / 2)];
                            const score = 1 - Math.abs(2 * psi - 1);
                            const word = (score <= 0.15) ? (psi >= 0.5 ? 'constitutive' : 'rarely in')
                                : (score <= 0.45) ? 'variable' : 'unstable';
                            rows.push({ exon: num, lo: b[0], hi: b[1], psi: psi, score: score, word: word });
                        }
                        rows.sort((a, b2) => b2.score - a.score);
                    }
                    // WHAT ELSE MAKES AN UNRELIABLE EXON WORTH THE TROUBLE. Instability on
                    // its own ranks a 50/50 exon in an unremarkable stretch above a 60/40
                    // exon carrying a GTP-binding site, and the second is the one to act on.
                    // Conservation and annotated functional sites are already on the track
                    // once they have been loaded, so they are folded in as a WEIGHT on
                    // instability rather than as points of their own: an exon that is
                    // spliced reliably is not a problem however conserved it is, so
                    // instability stays necessary and these only break ties between exons
                    // that are already unreliable.
                    //
                    // Both are read straight off the track's layers. Absent, their terms
                    // are zero and the weight falls to its floor, so the ranking degrades
                    // to pure instability instead of failing.
                    const __layers = (track && track.track_layers) || [];
                    const __isCons = (L) => L && (L.data_type === 'SEQSIM' || L.data_type === 'PROTSIM'
                        || /conservation|phylop|phastcons/i.test('' + (L.name || '')));
                    const __pts = (L) => (Array.isArray(L.polygonpts) && L.polygonpts.length)
                        ? L.polygonpts : (Array.isArray(L.pts) ? L.pts : []);
                    const __consLayer = __layers.find(__isCons);
                    let __consMax = 0;
                    if (__consLayer) {
                        for (const p of __pts(__consLayer)) {
                            const v = +(p.y != null ? p.y : p[1]);
                            if (isFinite(v) && v > __consMax) __consMax = v;
                        }
                    }
                    const __consOver = (lo2, hi2) => {
                        if (!__consLayer || !(__consMax > 0)) return null;
                        let sum = 0, n2 = 0;
                        for (const p of __pts(__consLayer)) {
                            const x = +(p.x != null ? p.x : p[0]);
                            const v = +(p.y != null ? p.y : p[1]);
                            if (!isFinite(x) || !isFinite(v) || x < lo2 || x > hi2) continue;
                            sum += v; n2++;
                        }
                        return n2 ? Math.max(0, Math.min(1, (sum / n2) / __consMax)) : null;
                    };
                    // A CDD site layer draws one-residue features as intervals; a domain
                    // layer draws wide ones the same way. Both count, and a site inside an
                    // exon is the stronger signal, so the count is what is used, capped.
                    const __siteLayers = __layers.filter((L) => L && L.data_type === 'CDD'
                        && Array.isArray(L.intervals) && L.intervals.length);
                    const __sitesOver = (lo2, hi2) => {
                        let n2 = 0;
                        for (const L of __siteLayers) {
                            for (const iv of L.intervals) {
                                const a2 = Math.min(+iv.x1, +iv.x2), b2 = Math.max(+iv.x1, +iv.x2);
                                if (isFinite(a2) && isFinite(b2) && a2 <= hi2 && b2 >= lo2) n2++;
                            }
                        }
                        return n2;
                    };
                    // PSI THAT MUST NOT BE BELIEVED, kept apart from PSI that is merely
                    // high. An exon sitting in duplicated sequence has a label blended with
                    // its twin's, so its number is not a measurement of this exon at all:
                    // SMN2 exon 7 reads 84% in the training table and about 10% in life,
                    // and the model reproduced the table faithfully. Such an exon is marked,
                    // drawn without a percentage, and dropped OUT of the ranking rather than
                    // ranked low -- a blended label says nothing about stability either way,
                    // so neither a high nor a low rank would be honest.
                    let __untrusted = [];
                    try { __untrusted = JSON.parse((data && data.untrusted) || '[]') || []; } catch (e) { }
                    layer.untrustedSpans = __untrusted;
                    layer.untrustedSource = (data && data.untrustedSource) || null;
                    // A PUBLISHED MEASUREMENT, where one exists, which is a different
                    // quantity from the prediction and not a correction to it. It outranks
                    // the withheld case: having no trustworthy prediction is a reason to
                    // show a measurement, not a reason to show nothing when one exists.
                    // The prediction is kept alongside it so the disagreement stays visible
                    // -- for SMN2 exon 7 that is about 0.10 measured against 0.96 predicted,
                    // and hiding the second would hide the reason this path exists.
                    // WHAT EACH VARIANT DID TO ITS EXON. Kept on the layer so the tag can
                    // say "98%, 31% with this variant" instead of a bare 98% drawn beside a
                    // pathogenic marker, and so the ranking can show the move.
                    let __vfx = [];
                    try { __vfx = JSON.parse((data && data.variantEffects) || '[]') || []; } catch (e) { }
                    layer.variantEffects = __vfx;
                    let __measured = [];
                    try { __measured = JSON.parse((data && data.measured) || '[]') || []; } catch (e) { }
                    layer.measuredPsi = __measured;
                    const __measuredAt = (lo2, hi2) => {
                        for (const m of __measured) {
                            const a2 = Math.min(+m.xi, +m.xf), b2 = Math.max(+m.xi, +m.xf);
                            if (isFinite(a2) && isFinite(b2) && a2 <= hi2 && b2 >= lo2) return m;
                        }
                        return null;
                    };
                    const __whyUntrusted = (lo2, hi2) => {
                        for (const u of __untrusted) {
                            const a2 = Math.min(+u.xi, +u.xf), b2 = Math.max(+u.xi, +u.xf);
                            if (isFinite(a2) && isFinite(b2) && a2 <= hi2 && b2 >= lo2) return (u.why || '');
                        }
                        return null;
                    };
                    for (const r of rows) {
                        const why = __whyUntrusted(r.lo, r.hi);
                        if (why != null) {
                            r.untrusted = true;
                            r.untrustedWhy = why;
                            r.word = why ? ('PSI not trusted, shared with ' + why) : 'PSI not trusted';
                        }
                        // A measurement makes the exon rankable again: the prediction was
                        // the untrustworthy part, and reliability computed from a measured
                        // inclusion is as sound as for any other exon. The predicted value
                        // is kept under psiPredicted rather than overwritten.
                        // The worst thing any variant does to this exon. Containment first,
                        // then nearness: a canonical site mutation sits just OUTSIDE the
                        // exon it destroys, in the intron, so an inside-only test would
                        // miss exactly the class with the largest effect.
                        let __worst = null;
                        for (const v of __vfx) {
                            if (v.skipped || !isFinite(+v.dpsi)) continue;
                            const inside = (+v.pos >= r.lo && +v.pos <= r.hi);
                            const near = (+v.pos >= r.lo - 30 && +v.pos <= r.hi + 30);
                            if (!inside && !near) continue;
                            const better = !__worst
                                || (inside && !__worst.inside)
                                || (inside === __worst.inside && Math.abs(+v.dpsi) > Math.abs(+__worst.v.dpsi));
                            if (better) __worst = { v: v, inside: inside };
                        }
                        if (__worst) { r.variant = __worst.v; }
                        const mm = __measuredAt(r.lo, r.hi);
                        if (mm && isFinite(+mm.psi)) {
                            r.psiPredicted = r.psi;
                            r.psi = +mm.psi;
                            r.measured = mm;
                            r.untrusted = false;
                            r.score = 1 - Math.abs(2 * r.psi - 1);
                            r.word = (r.score <= 0.15) ? (r.psi >= 0.5 ? 'constitutive' : 'rarely in')
                                : (r.score <= 0.45) ? 'variable' : 'unstable';
                        }
                        const cons = __consOver(r.lo, r.hi);
                        const nSites = __sitesOver(r.lo, r.hi);
                        r.conservation = (cons == null) ? null : +cons.toFixed(3);
                        r.sites = nSites;
                        // three sites is as much as the term can add; beyond that an exon is
                        // not more important, the annotation is just denser
                        const siteTerm = Math.min(1, nSites / 3);
                        const consTerm = (cons == null) ? 0 : cons;
                        r.weight = +(0.5 + 0.25 * consTerm + 0.25 * siteTerm).toFixed(3);
                        r.rank = r.untrusted ? null : +(r.score * r.weight).toFixed(4);
                    }
                    // Ranked exons first, by rank; the untrusted ones last, listed but not
                    // placed, so they stay visible as work to do rather than disappearing.
                    rows.sort((a, b2) => {
                        if (a.untrusted !== b2.untrusted) return a.untrusted ? 1 : -1;
                        return (b2.rank || 0) - (a.rank || 0);
                    });
                    layer.psiTissueNote = (data && data.psiTissueNote) || '';
                    try { layer.psiTissues = JSON.parse((data && data.psiTissues) || '[]'); }
                    catch (e) { layer.psiTissues = []; }
                    layer.exonStability = rows;
                    layer.exonStabilityFit = Math.max(fFalse, fTrue);
                    layer.exonStabilityHasContext = !!__consLayer || !!__siteLayers.length;
                }

                // Competing sites at each annotated edge (PSI mode), kept with the layer so a
                // later run on an edited copy of the transcript can be compared with this one.
                let __comp = [];
                try { __comp = JSON.parse((data && data.competition) || '[]') || []; } catch (e) { }
                layer.competition = __comp;
                // Predicted branch point of each annotated acceptor: drawn under the track as
                // a marker joined to its AG, and kept for comparison with a later run.
                let __bps = [];
                try { __bps = JSON.parse((data && data.branchPoints) || '[]') || []; } catch (e) { }
                layer.branchPoints = __bps;
                track.addLayer(layer);

                if (graph.wake) graph.wake();
                // COMPETING SITES, in words. The arcs show where a competitor sits; this says
                // what using it would do to the protein and how its share compares with the
                // same edge on any other track already run (the unedited transcript, when this
                // is an edited copy), which is the comparison a variant question turns on.
                // Listed: every competitor that takes 1% or more, and the nearest ones (within
                // 12 nt) whatever their share, since a few-nt shift is the event a bulk assay
                // cannot see.
                const __competitionSummary = (comp, trk) => {
                    if (!Array.isArray(comp) || !comp.length) return '';
                    const pct = (v) => { v = 100 * (+v || 0); return v >= 10 ? v.toFixed(0) + '%' : v >= 1 ? v.toFixed(1) + '%' : v >= 0.1 ? v.toFixed(2) + '%' : '<0.1%'; };
                    // The same edge on another track's earlier PSI run, matched by exon, site and
                    // the competitor's shift (tracks of one transcript share local coordinates
                    // only when nothing was inserted, so shift is the safer key).
                    const other = [];
                    try {
                        for (const t of (graph.track || [])) {
                            if (t === trk) continue;
                            for (const L of (t.track_layers || [])) {
                                if (L && L.magnitudeMode === 'psi' && Array.isArray(L.competition) && L.competition.length)
                                    other.push({ name: t.name || 'other track', comp: L.competition });
                            }
                        }
                    } catch (e) { }
                    const ref = other.length ? other[other.length - 1] : null;
                    const refAlt = (c, a) => {
                        if (!ref) return null;
                        const e = ref.comp.find((r) => r.exon === c.exon && r.site === c.site);
                        if (!e) return { share: 0, noSite: true };
                        const m = (e.alts || []).find((x) => x.shift === a.shift);
                        return m ? m : { share: null };
                    };
                    const rows = [];
                    for (const c of comp) {
                        for (const a of (c.alts || [])) {
                            const word = (c.site === 'acceptor' ? 'AG' : 'GT');
                            const sh = (a.shift > 0 ? '+' : '\u2212') + Math.abs(a.shift);
                            const eff = a.inFrame
                                ? 'in-frame, ' + (a.codons > 0 ? '+' : '\u2212') + Math.abs(a.codons) + ' codon' + (Math.abs(a.codons) === 1 ? '' : 's')
                                : 'frameshift';
                            const r = refAlt(c, a);
                            const vs = (r && r.share != null) ? ' (' + ref.name + ': ' + pct(r.share) + ')' : '';
                            rows.push({ s: +a.share || 0, near: Math.abs(a.shift) <= 12,
                                text: 'e' + c.exon + ' ' + c.site + ' ' + word + ' ' + sh + ' nt (' + eff + ') ' + pct(a.share) + vs });
                        }
                    }
                    if (!rows.length) return '';
                    rows.sort((x, y) => (y.s - x.s));
                    const shown = rows.filter((r) => r.s >= 0.01).slice(0, 4);
                    for (const r of rows) if (shown.length < 6 && r.near && !shown.includes(r)) shown.push(r);
                    const method = comp[0] && comp[0].method ? ' [' + comp[0].method + ']' : '';
                    return 'Competing sites' + method + ': ' + shown.map((r) => r.text).join('; ')
                        + (rows.length > shown.length ? ' (+' + (rows.length - shown.length) + ' weaker)' : '') + '. ';
                };
                // BRANCH POINTS, in words: only for the exons with something to say -- an edge
                // that has a competitor, a branch point that moved since another track's run, or
                // one the splice-site model gives little support -- so a 40-exon gene does not
                // produce a 40-item message. Every branch point is drawn regardless.
                const __branchSummary = (bps, comp, trk) => {
                    if (!Array.isArray(bps) || !bps.length) return '';
                    let refBps = null;
                    try {
                        for (const t of (graph.track || [])) {
                            if (t === trk) continue;
                            for (const L of (t.track_layers || []))
                                if (L && L.magnitudeMode === 'psi' && Array.isArray(L.branchPoints) && L.branchPoints.length) refBps = { name: t.name || 'other track', bps: L.branchPoints };
                        }
                    } catch (e) { }
                    const compExons = new Set((comp || []).filter((c) => c.site === 'acceptor' && (c.alts || []).length).map((c) => c.exon));
                    const rows = [];
                    for (const b of bps) {
                        const B = b.best; if (!B) continue;
                        const r = refBps ? refBps.bps.find((x) => x.exon === b.exon) : null;
                        const moved = r && r.best && (r.best.dist !== B.dist || r.best.motif !== B.motif);
                        const weak = (B.support != null && B.support < 0.2);
                        if (!compExons.has(b.exon) && !moved && !weak) continue;
                        rows.push('e' + b.exon + ' ' + B.motif.slice(0, 3) + '[' + B.motif[3] + ']' + B.motif.slice(4) + ' at \u2212' + B.dist + ' nt'
                            + (B.support != null ? ', model support ' + (+B.support).toFixed(2) : '')
                            + (B.agez ? ', AG in exclusion zone' : '')
                            + (moved ? ' (' + refBps.name + ': ' + r.best.motif + ' at \u2212' + r.best.dist + ')' : ''));
                    }
                    return rows.length ? 'Branch point' + (rows.length === 1 ? '' : 's') + ': ' + rows.slice(0, 4).join('; ') + '. ' : '';
                };
                const magLabel = (mode === 'psi') ? 'PSI inclusion' : 'site strength';
                // A destroyed splice site is the thing the user most needs told, and it is
                // not obvious from arcs that merely went quiet. The backend reports which
                // annotated sites the sequence no longer supports.
                let __lost = [];
                try { __lost = JSON.parse((data && data.lostSites) || '[]') || []; } catch (e) { }
                const __novel = layer.junctions.filter((j) => j.annotated === false).length;
                graph.setMessage(' Sashimi plot added to ' + (track.name || 'track') +
                    ' — ' + junc.length + ' junctions, magnitude = ' + magLabel + '. '
                    + (__novel ? __novel + ' arc' + (__novel === 1 ? '' : 's')
                        + ' are topologies the model predicts but the annotation does not. ' : '')
                    + (__lost.length ? __lost.length + ' annotated splice site'
                        + (__lost.length === 1 ? '' : 's') + ' no longer scored above 0.10: '
                        + __lost.slice(0, 6).map((L) => L.kind + ' at ' + L.x
                            + ' (' + (+L.p).toFixed(2) + ')').join(', ')
                        + (__lost.length > 6 ? ', …' : '') + '. ' : '')
                    + __competitionSummary(__comp, track)
                    + __branchSummary(__bps, __comp, track));
                // Model finished and the layer is added — bring the Models toolbar back.
                resetModelsToolbar();
                try { exec('baja/lib/work-status.js', null); } catch (e) { }
                restoreHover();
                return true;
            } catch (e) {
                graph.setMessage(' Splicing error: ' + e + ' ');
            }
            try { exec('baja/lib/work-status.js', null); } catch (e) { }
            restoreHover();
            return false;
        };

        // Going back to the editor is CurrentLayout.reset('mainPanel'), not a clear + set.
        //
        // reset() remounts the layout manchester/editor.js stashed under 'mainPanel' -- the whole
        // editor. clear + setComponent(genegraph_panel_layout) mounts only the panel object this
        // tool was handed, which is not the same thing: the clear ran but the canvas never came
        // back. editor.js also PATCHES reset() so returning to mainPanel re-arms
        // mouse-over-highlight, which a hand-rolled restore skips entirely.
        //
        // The clear + set stays as a fallback for a host that stashed nothing.
        const restoreEditor = () => {
            try {
                if (CurrentLayout.getStashed && CurrentLayout.getStashed('mainPanel')) {
                    CurrentLayout.reset('mainPanel');
                    return;
                }
            } catch (e) { }
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            try { if (genegraph_panel_layout) CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
        };

        // Arm a track click for the chosen magnitude mode.
        // What the user has already SELECTED, so a model launched from a selection menu runs
        // on it instead of asking for a click the user has effectively already made.
        //
        // Two selections count, and a range is optional:
        //   * a selected sequence RANGE on a track  -> run on that sub-sequence
        //   * a selected TRACK with no range        -> run on the whole track
        // The earlier bypass required BOTH a track and a range, so choosing the model with a
        // track selected but no range fell through to "click on a track".
        //
        // showResizeBar is the selected flag on both renderers (track.js and track-flexi.js);
        // marks are used raw, exactly as selected-sequence-menu.js passes them.
        const pickedTrack = () => {
            if (__presetList.length === 1) return __presetList[0];
            try {
                const sel = (graph.track || []).filter((t) => t && t.showResizeBar);
                // Only an unambiguous selection. With several tracks selected there is no way
                // to know which one was meant, so fall back to asking.
                if (sel.length === 1) return sel[0];
            } catch (e) { }
            return null;
        };
        // A board run must read EACH track's own selection. pickedRange prefers presetRange,
        // which is one range from the launching context -- correct for a single track, wrong
        // when applied to every track on the canvas.
        const ownRange = (t) => {
            // The track's own selectedRange(): it resolves world-coordinate marks and offset
            // marks to the same absolute span, where reading markstart raw was right for one
            // convention and silently wrong for the other.
            try { return (t && t.selectedRange && t.selectedRange()) || null; } catch (e) { return null; }
        };
        const pickedRange = (t) => {
            if (presetRange) return presetRange;
            try {
                if (t && t.markstart != null && t.markend != null
                    && t.markstart >= 0 && t.markend > t.markstart) {
                    return { start: Math.floor(t.markstart), end: Math.ceil(t.markend) };
                }
            } catch (e) { }
            return null;   // whole track
        };

        // BOARD-LEVEL run: the Layers button on the canvas sets __bajaApplyAllTracks, meaning
        // "apply this to everything on the board" rather than to one track. Run the tracks in
        // SEQUENCE, not in parallel: each one is a python job, and firing a dozen at once would
        // queue behind the server's concurrency cap anyway while making the progress meaningless.
        //
        // The flag is consumed on entry so a later run from a track menu is a single-track run
        // again -- a mode that silently persisted would be worse than one that has to be asked
        // for each time.
        // `list` is the tracks to run against. Passed in by the caller -- the library hands
        // down whatever it was given -- and only falls back to the whole canvas when nobody
        // said. That fallback is the old behavior, kept so an older call site still works.
        const runAllTracks = (mode, list) => {
            let all = [];
            try {
                all = (Array.isArray(list) && list.length ? list : (graph.track || []))
                    .filter((t) => t && (t.grid || t.tgraph));
            } catch (e) { }
            if (!all.length) { graph.setMessage(' No tracks on the canvas to run on. '); return; }
            // One history entry for the whole board run, so a single undo takes it all back.
            try { graph.pushOntoHistory(); } catch (e) { }
            (async () => {
                let done = 0;
                for (let i = 0; i < all.length; i++) {
                    const t = all[i];
                    try {
                        window.__workStatus = 'Models · ' + ((t && t.name) || ('track ' + (i + 1)))
                            + ' · ' + (i + 1) + ' of ' + all.length + '…';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } catch (e) { }
                    // A track with a selected sequence is scored over that selection only.
                    // ownRange reads THAT track's markstart/markend -- not pickedRange, which
                    // prefers the launching context's presetRange and would stamp one range
                    // across every track on the canvas.
                    try { if (await runOnTrack(t, mode, ownRange(t))) done++; } catch (e) { }
                }
                try {
                    window.__workStatus = '';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
                // setResultMessage, not setMessage: the canvas draws only error and result
                // toasts, so the plain message was never visible and a board run looked as
                // though it had finished without saying anything.
                const __msg = ' BajaSplice applied to ' + done + ' of ' + all.length
                    + ' track' + (all.length === 1 ? '' : 's') + '. ';
                try { graph.setResultMessage(__msg); } catch (e) { graph.setMessage(__msg); }
            })();
        };

        // The TRACKS this run applies to, decided by whoever launched it.
        //
        // presetTrack takes a single track or an ARRAY of them, so one parameter carries both
        // cases: the track menu passes the track it belongs to, the board-level Layers button
        // passes every track on the canvas, and the library in between just hands along what it
        // was given. That is why there is no separate "apply to all" argument.
        //
        // The __bajaApplyAllTracks flag is still honoured for callers that have not been
        // updated, but an explicit list always wins over it.
        const __presetList = Array.isArray(presetTrack)
            ? presetTrack.filter(Boolean)
            : (presetTrack ? [presetTrack] : []);

        const armTrackClick = (mode) => {
            graph.clearMouseListeners();
            if (__presetList.length > 1) {
                try { graph.setMouseMode('navigate'); } catch (e) { }
                restoreEditor();
                // An explicit list satisfies the board-level request: consume the flag so it does
                // not turn the next per-track action into a board-wide one.
                try { window.__bajaApplyAllTracks = false; } catch (e) { }
                runAllTracks(mode, __presetList);
                return;
            }
            let __all = false;
            try { __all = !!window.__bajaApplyAllTracks; window.__bajaApplyAllTracks = false; } catch (e) { }
            if (__all) { try { graph.setMouseMode('navigate'); } catch (e) { } restoreEditor(); runAllTracks(mode); return; }
            graph.setMouseMode('msg: Click on a track to build a splicing sashimi plot');
            restoreEditor();
            // Launched from the Selected Sequence menu — track and range already known.
            // Run on the existing selection when there is one -- see pickedTrack above.
            const pt = pickedTrack();
            if (pt) {
                try { graph.clearMouseListeners(); graph.setMouseMode('navigate'); } catch (e) { }
                const pr = pickedRange(pt);
                try {
                    graph.setMessage(' Running splicing on ' + (pt.name || 'the selected track')
                        + (pr ? (' (' + (pr.end - pr.start) + ' nt selection)') : ' (whole track)') + '… ');
                } catch (e) { }
                runOnTrack(pt, mode, pr);
                return;
            }
            graph.addMouseDownListener(async (x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) return;
                const track = graph.track[ti];
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                await runOnTrack(track, mode);
            });
        };

        // The magnitude mode is normally decided by whoever launched this: the models library
        // has one entry per model ('sites' for site strength, 'psi' for inclusion) and passes
        // it as presetMode, so the user is not asked a second time in a center menu for a
        // choice they have just made. The menu remains only for a caller that passes nothing.
        const __mode = (typeof presetMode === 'string') ? presetMode.trim().toLowerCase() : '';
        if (__mode === 'sites' || __mode === 'psi') {
            armTrackClick(__mode);
            resolve(true);
            return;
        }
        graph.showMenu([
            {
                label: 'Baja:SiteStrength:v1.0', move: () => { },
                click: () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } armTrackClick('sites'); }
            },
            {
                label: 'Baja:PSI:v1.1', move: () => { },
                click: () => { try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { } armTrackClick('psi'); }
            }
        ]);

        resolve(true);
    });
}
