function (source, target, opts) {

    // WHAT WOULD HAVE TO CHANGE, edit by edit, for a transcript to make another protein.
    //
    //   const r = await exec('baja/bio/splicing/exon-plan-search.js', src, tgt, { onStep });
    //   // { ok, baseline, plans: [{ edits, roles, induced, matched, identity, gain, nmd }] }
    //
    // The question a paralogue pair raises is not "how alike are they", which the
    // comparison already answers, but "what would have to change for the target to make
    // the source's protein". Every answer to that is a splicing edit, and there are four
    // kinds the spliceosome can be made to perform:
    //
    //   LOSE     skip an exon the target has (an ASO over its splice site)
    //   INDUCE   use a cryptic exon sitting in one of its introns, which is the ONLY way
    //            to ADD peptide: skipping and trimming can only take it away
    //   SHIFT    move an acceptor and keep the exon's donor, which is what AG scanning
    //            does when the authentic acceptor is blocked
    //   RETAIN   keep an intron in the message
    //
    // WHAT IS BEING MAXIMIZED has to answer two failures at once, and picking either half
    // of it alone picks a tool that cannot see one of them.
    //
    // Identity over the aligned region is gamed by TRUNCATION: delete nine tenths of the
    // target and the stub that is left matches perfectly, 100%, which is not what anyone
    // asking this question wants. Identical residues over the source's length is gamed by
    // PADDING: peptide the source does not have costs nothing, so dropping an exon full of
    // it scores exactly the same as keeping it -- the first version of this search ranked
    // "lose the wrong exon" as no better than leaving it alone, because removing a
    // mismatch adds no match.
    //
    // So the score is the fit between the two peptides: twice the identical residues over
    // the sum of the two lengths. Missing peptide and extra peptide both cost, which is
    // what "make this protein look like that one" means. 1.0 is the source's protein,
    // residue for residue.
    //
    // ONLY TRANSCRIPTS THAT COULD MAKE A PROTEIN. A plan that frameshifts, loses the start
    // codon, runs past the stop or puts a premature stop where NMD will find it is
    // discarded rather than ranked low: it is not a worse answer to the question, it is an
    // answer to a different one. The frame and NMD judgements come from
    // exon-removal-impact, so they are the same rules the exon screens use.
    //
    // HOW IT SEARCHES. Every single edit is scored first, on its own, against the
    // unedited transcript. The ones that do nothing are dropped there -- most do -- and
    // the rest go into a beam search that keeps the best few partial plans and tries
    // another edit on each. That ordering is what makes this finish: a transcript with 22
    // exons and 20 cryptic candidates has more combinations than could be translated in an
    // afternoon, and nearly all of them are the same two useless edits with a third added.
    //
    // opts.onStep       called with a line of progress
    // opts.max_edits    4     how many edits a plan may stack
    // opts.beam         6     partial plans carried into the next round
    // opts.keep_single  12    single edits kept for the beam, best first
    // opts.plans        8     plans reported
    // opts.cryptic      candidates from cryptic-exon-candidates.js, when the caller has them

    return (async () => {
        const o = opts || {};
        const step = (typeof o.onStep === 'function') ? o.onStep : (() => { });
        const MAX_EDITS = Math.max(1, Math.min(+(o.max_edits || 4), 8));
        const BEAM = Math.max(1, Math.min(+(o.beam || 6), 16));
        const KEEP_SINGLE = Math.max(2, Math.min(+(o.keep_single || 12), 40));
        const WANT = Math.max(1, Math.min(+(o.plans || 8), 25));

        if (!source || !target) return { ok: false, reason: 'two tracks are needed' };
        if (source === target) return { ok: false, reason: 'the two tracks are the same track' };

        step('Reading the source peptide');
        let srcPep = '';
        try { srcPep = await exec('baja/bio/protein/peptide-of.js', source); } catch (e) { srcPep = ''; }
        if (!srcPep || srcPep.length < 10) {
            return { ok: false, reason: (source.name || 'the source track')
                + ' has no ORF to copy: there is no peptide to aim at' };
        }

        // The target's own machinery: the translator, the frame, the NMD rules. One
        // implementation of all three, shared with the exon screens.
        step('Reading the reading frame of ' + (target.name || 'the target'));
        let M = null;
        try { M = await exec('baja/bio/orfs/exon-removal-impact.js', target, null, { raw: true }); }
        catch (e) { M = null; }
        if (!M || !M.ok) {
            return { ok: false, reason: (target.name || 'the target track') + ': '
                + ((M && M.reason) || 'no reading frame to edit') };
        }
        const translate = M.translate, nmdOf = M.nmdOf;
        const exons = (M.exons || []).slice()
            .filter((e) => e && isFinite(+e.xi) && isFinite(+e.xf))
            .sort((a, b) => Math.min(+a.xi, +a.xf) - Math.min(+b.xi, +b.xf));
        if (exons.length < 2) {
            return { ok: false, reason: (target.name || 'the target track')
                + ' has fewer than two annotated exons, so there is nothing to rearrange' };
        }
        const numberOf = new Map();
        exons.forEach((e, i) => numberOf.set(e, M.plus ? (i + 1) : (exons.length - i)));

        const AL = await exec('baja/bio/protein/align-local.js');
        // Identical residues over the SOURCE's length: how much of the protein being
        // copied this transcript actually reproduces.
        const srcLen = srcPep.length;
        const scoreOf = (pep) => {
            const n = (pep || '').length;
            if (!pep || n < 8) return { matched: 0, identity: 0, covered: 0, fit: 0, len: n };
            const r = AL.align(pep, srcPep, AL.KIND.aa);
            return {
                matched: r.id,
                covered: r.id / srcLen,
                identity: r.len ? (r.id / r.len) : 0,
                // Twice the matches over both lengths: missing peptide and extra peptide
                // both cost.
                fit: (2 * r.id) / (srcLen + n),
                len: n
            };
        };

        // A plan is an exon set. Translate it, refuse it if it could not make the protein,
        // and score what it does make. Cached by the set itself: a beam search reaches the
        // same set by different routes constantly.
        const seen = new Map();
        const sig = (set) => set.map((e) => Math.min(+e.xi, +e.xf) + ':' + Math.max(+e.xi, +e.xf))
            .sort().join(',');
        const evaluate = (set) => {
            const k = sig(set);
            if (seen.has(k)) return seen.get(k);
            let out = null;
            const t = translate(set);
            if (!t) out = { ok: false, why: 'the start codon is not in this transcript' };
            else if (!t.stop) out = { ok: false, why: 'translation runs off the end: no stop codon' };
            else {
                const n = nmdOf(t);
                if (n.call === 'nmd') out = { ok: false, why: 'a premature stop NMD would find' };
                else if (n.call === 'nmd-maybe-escape') out = { ok: false, why: 'a premature stop that may escape NMD' };
                else out = Object.assign({ ok: true, peptide: t.protein, nmd: n.call }, scoreOf(t.protein));
            }
            seen.set(k, out);
            return out;
        };

        const base = evaluate(exons);
        if (!base.ok) {
            return { ok: false, reason: (target.name || 'the target track')
                + ' does not translate as it stands (' + base.why + '), so there is nothing to improve on' };
        }

        // ---- the edits on offer --------------------------------------------------------
        step('Working out which edits are available');
        const edits = [];
        for (const e of exons) {
            edits.push({ kind: 'lose', exon: e, n: numberOf.get(e),
                label: 'skip exon ' + numberOf.get(e),
                apply: (set) => set.filter((x) => x !== e) });
        }
        let cryptic = o.cryptic || null;
        if (!cryptic) {
            step('Scanning the introns of ' + (target.name || 'the target') + ' for cryptic exons');
            try { cryptic = await exec('baja/bio/splicing/cryptic-exon-candidates.js', target, {}); }
            catch (e) { cryptic = []; }
        }
        for (const c of (cryptic || [])) {
            const ex = { xi: c.xi, xf: c.xf, type: 'Exon', __cryptic: c };
            edits.push({ kind: 'induce', candidate: c, label: 'induce a ' + c.len
                + ' nt cryptic exon in intron ' + c.intron,
                apply: (set) => set.concat([ex]) });
        }
        // A SHIFTED ACCEPTOR IS NOT A SKIPPED EXON. Blocking an acceptor makes the
        // spliceosome scan to the next AG, so the exon keeps its donor and loses its 5'
        // end. ag-scan knows where those AGs are; what is offered here is its candidates,
        // each as a replacement exon.
        if (o.shifts !== false) {
            for (const e of exons) {
                let r = null;
                try { r = await exec('baja/bio/splicing/ag-scan.js', target, e, {}); } catch (e2) { r = null; }
                if (!r || !r.ok || !r.candidates || !r.candidates.length) continue;
                for (const c of r.candidates.slice(0, 2)) {
                    if (c.newStart == null) continue;
                    const lo = M.plus ? +c.newStart : Math.min(+e.xi, +e.xf);
                    const hi = M.plus ? Math.max(+e.xi, +e.xf) : +c.newStart;
                    if (!isFinite(lo) || !isFinite(hi) || hi - lo < 6) continue;
                    const rep = { xi: lo, xf: hi, type: 'Exon', __shiftOf: e };
                    edits.push({ kind: 'shift', exon: e, n: numberOf.get(e),
                        label: 'shift the acceptor of exon ' + numberOf.get(e)
                            + ' by ' + (c.lost != null ? c.lost : '?') + ' nt',
                        apply: (set) => set.map((x) => (x === e ? rep : x)) });
                }
            }
        }
        // RETAINING AN INTRON is the two exons either side of it joined into one.
        for (let i = 0; i + 1 < exons.length; i++) {
            const a = exons[i], b = exons[i + 1];
            const lo = Math.min(+a.xi, +a.xf), hi = Math.max(+b.xi, +b.xf);
            const merged = { xi: lo, xf: hi, type: 'Exon', __retains: [a, b] };
            const nA = numberOf.get(a), nB = numberOf.get(b);
            edits.push({ kind: 'retain', exon: a,
                label: 'retain the intron between exons ' + Math.min(nA, nB) + ' and ' + Math.max(nA, nB),
                apply: (set) => set.filter((x) => x !== a && x !== b).concat([merged]) });
        }

        // ---- every edit on its own -----------------------------------------------------
        step('Scoring ' + edits.length + ' single edits against ' + (source.name || 'the source'));
        const singles = [];
        for (const ed of edits) {
            const r = evaluate(ed.apply(exons));
            if (!r.ok) continue;
            if (r.fit <= base.fit + 1e-9) continue;           // no better than leaving it alone
            singles.push({ edits: [ed], set: ed.apply(exons), r: r });
        }
        singles.sort((p, q) => q.r.fit - p.r.fit);
        const pool = singles.slice(0, KEEP_SINGLE).map((x) => x.edits[0]);

        // ---- and then in combination ---------------------------------------------------
        let beam = singles.slice(0, BEAM);
        const all = singles.slice();
        for (let round = 2; round <= MAX_EDITS && beam.length; round++) {
            step('Trying combinations of ' + round + ' edits');
            const next = [];
            for (const st of beam) {
                for (const ed of pool) {
                    // One edit per exon, and an edit already in this plan is not a second
                    // edit: stacking them would describe a transcript nobody could make.
                    if (st.edits.indexOf(ed) >= 0) continue;
                    if (ed.exon && st.edits.some((p) => p.exon === ed.exon)) continue;
                    const set = ed.apply(st.set);
                    const r = evaluate(set);
                    if (!r.ok || r.fit <= st.r.fit + 1e-9) continue;
                    next.push({ edits: st.edits.concat([ed]), set: set, r: r });
                }
            }
            if (!next.length) break;
            next.sort((p, q) => q.r.fit - p.r.fit);
            // Plans reaching the same transcript by different routes are one plan.
            const uniq = [], byset = new Set();
            for (const p of next) {
                const k = sig(p.set);
                if (byset.has(k)) continue;
                byset.add(k); uniq.push(p);
            }
            all.push(...uniq);
            beam = uniq.slice(0, BEAM);
        }

        all.sort((p, q) => (q.r.fit - p.r.fit) || (p.edits.length - q.edits.length));
        const bestBy = new Set();
        const plans = [];
        for (const p of all) {
            const k = sig(p.set);
            if (bestBy.has(k)) continue;
            bestBy.add(k);
            // What the picture draws: every exon of the target with what becomes of it,
            // and the induced exons that are not on the target at all.
            const roles = [];
            for (const e of exons) {
                const ed = p.edits.filter((x) => x.exon === e)[0];
                roles.push({
                    n: numberOf.get(e), xi: Math.min(+e.xi, +e.xf), xf: Math.max(+e.xi, +e.xf),
                    role: ed ? (ed.kind === 'lose' ? 'lose' : ed.kind) : 'keep',
                    label: ed ? ed.label : ''
                });
            }
            const induced = p.edits.filter((x) => x.kind === 'induce').map((x) => ({
                xi: x.candidate.xi, xf: x.candidate.xf, len: x.candidate.len,
                intron: x.candidate.intron, score: x.candidate.score, label: x.label
            }));
            plans.push({
                edits: p.edits.map((x) => ({ kind: x.kind, n: x.n || null, label: x.label })),
                roles: roles, induced: induced,
                peptide: p.r.peptide, length: p.r.len, nmd: p.r.nmd,
                matched: p.r.matched, covered: p.r.covered, identity: p.r.identity,
                fit: p.r.fit, gain: p.r.fit - base.fit, matchedGain: p.r.matched - base.matched
            });
            if (plans.length >= WANT) break;
        }
        step('');
        return {
            ok: true,
            source: { name: source.name || 'the source', length: srcLen },
            target: { name: target.name || 'the target', exons: exons.length },
            baseline: {
                peptide: base.peptide, length: base.len, matched: base.matched,
                covered: base.covered, identity: base.identity, fit: base.fit,
                roles: exons.map((e) => ({ n: numberOf.get(e), xi: Math.min(+e.xi, +e.xf),
                    xf: Math.max(+e.xi, +e.xf), role: 'keep', label: '' }))
            },
            cryptic: (cryptic || []).length,
            considered: edits.length,
            evaluated: seen.size,
            plans: plans
        };
    })();
}
