function () {

    // THE CANDIDATE PIPELINE. Given a mutant protein, the wild-type it came from, and the
    // patient's HLA type, produce a ranked list of peptides worth putting in a vaccine.
    //
    // The steps are the antigen-processing pathway, in order, because that is what decides
    // whether a peptide is ever seen by a T cell:
    //
    //   1  ENUMERATE   every peptide of each requested length that overlaps the novel
    //                  residues. A peptide that does not contain the mutation is a self
    //                  peptide and belongs nowhere near this list.
    //   2  CLEAVE      does the proteasome plausibly cut at the peptide's C-terminus? The
    //                  C-terminal cut is made by the proteasome and is the one that has to
    //                  be right; the N-terminus is trimmed afterwards in the ER by ERAP1
    //                  and is far more forgiving. That asymmetry is why the C-terminus is
    //                  weighted here and the N-terminus barely.
    //   3  TRANSPORT   will TAP carry it into the ER? TAP reads the C-terminal residue
    //                  above all, and refuses acidic and proline-rich C-termini.
    //   4  BIND        does it bind one of the patient's alleles? (lib/hla.js)
    //   5  DISCRIMINATE  does it bind BETTER than its wild-type counterpart? A mutant that
    //                  binds no better than the self peptide the thymus already tolerised
    //                  against is the classic false positive of this field. The ratio is
    //                  the agretopicity index, and it is reported per candidate.
    //   6  SELF-CHECK  is the mutant peptide identical to something in the background
    //                  proteome anyway? Optional, and only as good as the proteome supplied.
    //
    // The framing above -- self is tolerated, non-self is attacked, and everything turns on
    // which is which -- is the antigen concept set out in Dean L., Blood Groups and Red Cell
    // Antigens (NCBI Bookshelf, NBK2264). That chapter is about red-cell surface antigens
    // and says nothing about MHC presentation; the pathway modelled here comes from the
    // neoantigen and antigen-processing literature.

    return (async () => {

        const HLA = await exec('liverpool/lib/hla.js');

        const AAS = 'ACDEFGHIKLMNPQRSTVWY';
        const cleanAa = (s) => ('' + (s == null ? '' : s)).toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '');

        // Kyte-Doolittle, for GRAVY. A very hydrophobic peptide is a manufacturing problem
        // (it will not stay in solution) even when it is an excellent binder.
        const KD = {
            A: 1.8, R: -4.5, N: -3.5, D: -3.5, C: 2.5, Q: -3.5, E: -3.5, G: -0.4, H: -3.2,
            I: 4.5, L: 3.8, K: -3.9, M: 1.9, F: 2.8, P: -1.6, S: -0.8, T: -0.7, W: -0.9,
            Y: -1.3, V: 4.2
        };

        // ---- 2. proteasomal C-terminal cleavage --------------------------------------------
        //
        // The immunoproteasome cuts preferentially after hydrophobic and basic residues, and
        // poorly after acidic residues, glycine and proline. A proline immediately AFTER the
        // cut site blocks it. These are the two effects large enough to be worth encoding;
        // the rest of the sequence context is real but small, and inventing weights for it
        // would add precision the evidence does not support.
        const P1_CLEAVE = {
            L: 1.00, F: 0.95, Y: 0.92, M: 0.90, V: 0.88, I: 0.88, W: 0.82,
            K: 0.72, R: 0.72, H: 0.45, A: 0.50, C: 0.38, T: 0.36, Q: 0.36, S: 0.32,
            N: 0.30, G: 0.16, P: 0.06, D: 0.10, E: 0.10
        };
        // cIndex is the index in `source` immediately AFTER the peptide, or -1 when the
        // peptide runs to the protein's own C-terminus (where no cut is needed at all).
        const cleavageScore = (peptide, source, endIndex) => {
            const p1 = peptide[peptide.length - 1];
            let s = (P1_CLEAVE[p1] != null) ? P1_CLEAVE[p1] : 0.3;
            const next = (endIndex >= 0 && endIndex < source.length) ? source[endIndex] : '';
            if (!next) return { score: Math.min(1, s + 0.15), blocked: false, note: 'peptide ends at the protein C-terminus: no cut required' };
            if (next === 'P') return { score: s * 0.25, blocked: true, note: 'proline immediately after the cut site blocks cleavage' };
            if (next === 'D' || next === 'E') return { score: s * 0.7, blocked: false, note: 'acidic residue after the cut site disfavours cleavage' };
            return { score: s, blocked: false, note: '' };
        };

        // ---- 3. TAP transport ---------------------------------------------------------------
        //
        // TAP1/TAP2 selects on the C-terminal residue above everything else, and reads the
        // first three residues weakly. Proline at position 2 is the well-known killer.
        const TAP_C = {
            R: 1.00, K: 0.88, F: 0.95, Y: 0.95, W: 0.90, L: 0.85, M: 0.80, I: 0.78, V: 0.70,
            H: 0.55, A: 0.40, T: 0.35, C: 0.32, Q: 0.32, S: 0.30, N: 0.26, G: 0.20,
            P: 0.10, D: 0.06, E: 0.06
        };
        const tapScore = (peptide) => {
            const c = peptide[peptide.length - 1];
            let s = (TAP_C[c] != null) ? TAP_C[c] : 0.3;
            const p1 = peptide[0], p2 = peptide[1], p3 = peptide[2];
            let n = 1.0;
            if (p1 === 'D' || p1 === 'E') n -= 0.20;
            if (p1 === 'P') n -= 0.25;
            if ('RKHFYW'.indexOf(p1) >= 0) n += 0.10;
            if (p2 === 'P') n -= 0.30;                       // the strongest N-terminal effect
            if (p2 === 'D' || p2 === 'E') n -= 0.10;
            if (p3 === 'P') n -= 0.10;
            n = Math.max(0.3, Math.min(1.15, n));
            return Math.max(0, Math.min(1, s * n));
        };

        // ---- enumeration ---------------------------------------------------------------------
        //
        // Every window of the requested lengths that overlaps [novelFrom, novelTo). For a
        // point mutation that is up to len windows per length; for a frameshift it is the
        // whole neo-ORF, which is why frameshifts dominate a candidate list.
        const enumerate = (mutant, novelFrom, novelTo, lengths) => {
            const out = [];
            const seen = new Set();
            const lo = Math.max(0, novelFrom), hi = Math.min(mutant.length, Math.max(novelTo, novelFrom + 1));
            for (const L of lengths) {
                for (let start = Math.max(0, lo - L + 1); start + L <= mutant.length && start < hi; start++) {
                    const pep = mutant.substr(start, L);
                    if (pep.length !== L) continue;
                    if (/[^ACDEFGHIKLMNPQRSTVWY]/.test(pep)) continue;
                    const key = start + ':' + pep;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push({ peptide: pep, start: start, end: start + L, length: L });
                }
            }
            return out;
        };

        // The wild-type peptide facing the same window. Only meaningful for a substitution,
        // where mutant and wild-type stay in register; after an indel the coordinates no
        // longer correspond and claiming a counterpart would be a fabrication, so `aligned`
        // false returns null and the agretopicity column stays empty.
        const wtCounterpart = (wt, start, len, aligned) => {
            if (!aligned) return null;
            if (start + len > wt.length) return null;
            const p = wt.substr(start, len);
            return /[^ACDEFGHIKLMNPQRSTVWY]/.test(p) ? null : p;
        };

        // Binding rank mapped to 0..1. rank 0.5% -> 0.85, 2% -> 0.5, 10% -> 0.09. Monotone,
        // and it does not pretend a rank of 0.05% is ten times better than 0.5%.
        const bindComponent = (rank) => 1 / (1 + Math.pow(Math.max(rank, HLA.MIN_RANK || 0.0025) / 2, 1.5));

        // ---- the run ---------------------------------------------------------------------------
        //
        // run({mutant, wt, novelFrom, novelTo, aligned, alleles, lengths, label, vaf, tpm,
        //      proteome, onProgress}) -> [candidate]
        //
        // A candidate carries every intermediate number, not just the total. A ranked list
        // whose ranking cannot be taken apart is not usable for a decision anyone has to
        // defend.
        const run = async (opts) => {
            const o = opts || {};
            const mutant = cleanAa(o.mutant);
            const wt = cleanAa(o.wt || '');
            const aligned = !!o.aligned;
            const lengths = (o.lengths && o.lengths.length) ? o.lengths.slice() : [8, 9, 10, 11];
            const alleles = (o.alleles || []).map((a) => HLA.normalise(a)).filter(Boolean);
            const windows = enumerate(mutant, o.novelFrom | 0, o.novelTo | 0, lengths);
            if (!windows.length || !alleles.length) return [];

            // One predict() call per allele per length, not one per peptide: the background
            // for a given (allele, length) is built once and shared.
            const byLen = {};
            for (const w of windows) (byLen[w.length] = byLen[w.length] || []).push(w);

            const results = [];
            let done = 0;
            const total = alleles.length * Object.keys(byLen).length;

            for (const allele of alleles) {
                const meta = HLA.info(allele);
                for (const L in byLen) {
                    const group = byLen[L];
                    const mutScores = await HLA.predict(allele, group.map((w) => w.peptide));

                    // Wild-type counterparts, scored in the same call.
                    const wtPeps = group.map((w) => wtCounterpart(wt, w.start, w.length, aligned));
                    const idx = [];
                    const toScore = [];
                    wtPeps.forEach((p, i) => { if (p) { idx.push(i); toScore.push(p); } });
                    const wtScores = toScore.length ? await HLA.predict(allele, toScore) : [];
                    const wtByI = {};
                    idx.forEach((i, k) => { wtByI[i] = wtScores[k]; });

                    group.forEach((w, i) => {
                        const b = mutScores[i];
                        const wtb = wtByI[i] || null;
                        const cl = cleavageScore(w.peptide, mutant, w.end < mutant.length ? w.end : -1);
                        const tap = tapScore(w.peptide);
                        const bind = bindComponent(b.rank);

                        // The presentation score. Binding dominates because it is the step
                        // with the narrowest filter, but a peptide the proteasome will not
                        // release or TAP will not carry is not presented however well it
                        // would bind, so both can veto.
                        const presentation = 0.65 * bind + 0.20 * cl.score + 0.15 * tap;

                        // AGRETOPICITY. wtRank / mutRank: above 1 the mutation improved
                        // binding, which is what a good neoantigen does. Reported, never
                        // silently used as a filter -- some real neoantigens work through a
                        // changed TCR contact rather than a changed anchor, and would be
                        // thrown away by an agretopicity cut-off.
                        let agreto = null, wtRank = null, novelAnchor = null;
                        if (wtb) {
                            wtRank = wtb.rank;
                            // Both clamped with the predictor's own resolution floor. With
                            // two different floors, a mutant and a wild-type that are
                            // genuinely indistinguishable produced a ratio of 0.5 and the
                            // candidate was reported as "anchor weakened" when nothing had
                            // weakened at all.
                            const FLOOR = HLA.MIN_RANK || 0.0025;
                            agreto = Math.max(wtb.rank, FLOOR) / Math.max(b.rank, FLOOR);
                            // Which changed: the anchor (the mutation changed the groove contact) or
                            // the surface the TCR reads? Both matter and they mean different
                            // things, so say which.
                            novelAnchor = (wtb.rank > 2 && b.rank <= 2) ? 'anchor gained'
                                : (agreto >= 2 ? 'anchor improved'
                                    : (agreto <= 0.5 ? 'anchor weakened' : 'TCR-facing change'));
                        }

                        results.push({
                            peptide: w.peptide,
                            wtPeptide: wtPeps[i] || null,
                            start: w.start, end: w.end, length: w.length,
                            allele: allele,
                            alleleClass: meta ? meta.cls : 1,
                            alleleConfidence: b.confidence,
                            source: b.source,
                            rank: b.rank, band: b.bind, motifScore: b.score,
                            core: b.core, coreOffset: b.offset,
                            wtRank: wtRank, agretopicity: agreto, effect: novelAnchor,
                            cleavage: cl.score, cleavageNote: cl.note, cleavageBlocked: cl.blocked,
                            tap: tap,
                            presentation: presentation,
                            gravy: (() => { let s = 0; for (const ch of w.peptide) s += (KD[ch] || 0); return s / w.peptide.length; })(),
                            cysteines: (w.peptide.match(/C/g) || []).length,
                            glycoSequon: /N[^P][ST]/.test(w.peptide),
                            mutation: o.label || '',
                            vaf: (typeof o.vaf === 'number') ? o.vaf : null,
                            tpm: (typeof o.tpm === 'number') ? o.tpm : null,
                            selfHit: null
                        });
                    });
                    done++;
                    if (typeof o.onProgress === 'function') { try { o.onProgress(Math.round(100 * done / Math.max(1, total))); } catch (e) { } }
                }
            }

            // ---- 6. self check -----------------------------------------------------------
            //
            // An exact match to the background proteome means the peptide is self and the
            // repertoire is tolerised against it, whatever the mutation says. Exact matching
            // only: a near-match is a genuinely interesting signal (cross-reactivity) but it
            // needs an alignment and a substitution matrix, and a naive "one mismatch" rule
            // would produce more noise than information.
            const prot = ('' + (o.proteome || '')).toUpperCase().replace(/^>.*$/gm, '').replace(/[^A-Z]/g, '');
            if (prot.length > 50) {
                for (const r of results) r.selfHit = prot.indexOf(r.peptide) >= 0;
            }

            return results;
        };

        // ---- priority ---------------------------------------------------------------------
        //
        // The number the list is sorted by. Presentation is the backbone; the rest are
        // multipliers that only ever push a candidate DOWN, so the score never claims more
        // than the presentation model supports.
        //
        //   clonality    a subclonal mutation is present in a fraction of the tumour, and a
        //                vaccine against it treats a fraction of the tumour. Variant allele
        //                frequency scales the score directly when it is known.
        //   expression   a mutation in a gene that is not transcribed produces no protein
        //                and no peptide. Applied as a soft floor, not a cliff, because TPM
        //                is noisy at the bottom of its range.
        //   agretopicity a mutant that binds worse than its own wild-type is demoted hard.
        //   self         an exact proteome match is demoted to the floor rather than removed,
        //                so it stays visible and auditable.
        const priority = (c, weights) => {
            const w = weights || {};
            let s = c.presentation;
            if (typeof c.vaf === 'number' && c.vaf > 0 && (w.useVaf !== false)) s *= (0.5 + 0.5 * Math.min(1, c.vaf / 0.5));
            if (typeof c.tpm === 'number' && (w.useTpm !== false)) s *= Math.min(1, 0.35 + 0.65 * Math.min(1, Math.log10(1 + c.tpm) / Math.log10(31)));
            if (typeof c.agretopicity === 'number' && (w.useAgretopicity !== false)) {
                if (c.agretopicity < 1) s *= Math.max(0.45, 0.45 + 0.55 * c.agretopicity);
            }
            if (c.cleavageBlocked) s *= 0.6;
            if (c.selfHit === true) s *= 0.15;
            if (c.cysteines >= 2) s *= 0.92;                 // oxidation / manufacturing
            return s;
        };

        // Best row per peptide across alleles, for a shortlist that is one line per peptide
        // rather than one per peptide-allele pair. The alleles it also hits are kept, since
        // a peptide presented by two of the patient's alleles is worth more than one that
        // is not.
        const collapse = (rows, weights) => {
            const by = new Map();
            for (const r of rows) {
                const cur = by.get(r.peptide);
                if (!cur || priority(r, weights) > priority(cur, weights)) by.set(r.peptide, r);
            }
            const out = [];
            for (const [pep, best] of by) {
                const all = rows.filter((r) => r.peptide === pep);
                const hits = all.filter((r) => r.band !== 'none');
                out.push(Object.assign({}, best, {
                    alsoBinds: hits.map((r) => r.allele).filter((a, i, arr) => arr.indexOf(a) === i && a !== best.allele),
                    alleleHits: hits.length
                }));
            }
            return out.sort((a, b) => priority(b, weights) - priority(a, weights));
        };

        return {
            enumerate: enumerate,
            cleavageScore: cleavageScore,
            tapScore: tapScore,
            bindComponent: bindComponent,
            run: run,
            priority: priority,
            collapse: collapse,
            KD: KD,
            HLA: HLA
        };
    })();
}
