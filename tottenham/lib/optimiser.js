function () {

    // CODON CHOICE AS A SHORTEST-PATH PROBLEM.
    //
    // Everything that makes a coding sequence stable or unstable is a property of a short
    // WINDOW of bases, not of a codon: a CpG dinucleotide, a DRACH pentamer, a poly(A)
    // signal, a homopolymer run. Most of them straddle codon boundaries, which is precisely
    // why choosing each codon independently -- what liverpool/lib/genetic-code.js does, and
    // what nearly every codon tool does -- cannot avoid them. It picks a codon ending in C,
    // then a codon starting with G, and creates a CpG neither codon contained.
    //
    // So this does it properly. Walking left to right along the protein, the cost of the
    // next codon depends only on the last few bases already written. That is a Markov chain,
    // and the cheapest sequence is a shortest path through it:
    //
    //     state   the last 5 bases written
    //     move    one of the synonymous codons for the next residue
    //     cost    codon usage, plus every k-mer (k = 2..6) that the move newly completes
    //
    // The result is the GLOBAL optimum for every objective expressible in six bases, which
    // covers CpG, UpA, DRACH, both poly(A) signals, the common 6-cutter sites and
    // homopolymer runs. It is not a heuristic and it is not iterative: there is nothing to
    // converge and no random seed.
    //
    // Motifs longer than six bases -- NotI at eight, SapI at seven -- cannot be scored by a
    // five-base state, so those go through a repair pass afterwards, and anything the repair
    // pass cannot clear is REPORTED rather than hidden.
    //
    // FROZEN REGIONS are what makes this usable for a replicon. In a self-amplifying
    // construct the subgenomic promoter runs past the start of the gene it drives, so the
    // first bases of that gene are promoter as well as coding sequence and must not be
    // touched. A frozen range pins those codons to what they already are, and the optimiser
    // routes around them.

    return (async () => {

        const GC = await exec('liverpool/lib/genetic-code.js');

        const CODONS = GC.CODONS, BY_AA = GC.BY_AA, USAGE = GC.USAGE, RELATIVE = GC.RELATIVE;

        // ---- what a window costs ---------------------------------------------------------------
        //
        // Each entry is a motif and the penalty for completing one. They are pure numbers on a
        // common scale where 1.0 is roughly "as bad as dropping one codon from the most used
        // to a middling one", so the weights below trade off against codon usage in units a
        // reader can reason about.
        const DEFAULT_PENALTIES = () => ({
            cpg: 1.0,             // per CpG dinucleotide
            upa: 0.15,            // per UpA dinucleotide
            drach: 0.35,          // per DRACH pentamer (m6A consensus)
            polyaSignal: 40,      // AATAAA / ATTAAA: effectively forbidden
            run5: 6,              // any base five times over
            site: 40,             // a listed restriction / assembly site
            uridine: 0.0,         // per U; raised by the low-immunogenicity preset
            cai: 1.0              // multiplier on -ln(relative adaptiveness)
        });

        // Motifs scored exactly inside the dynamic program (length 6 or less).
        const SHORT_SITES = [
            { seq: 'GAATTC', name: 'EcoRI' }, { seq: 'GGATCC', name: 'BamHI' },
            { seq: 'AAGCTT', name: 'HindIII' }, { seq: 'TCTAGA', name: 'XbaI' },
            { seq: 'GGTCTC', name: 'BsaI' }, { seq: 'GAGACC', name: 'BsaI (rev)' },
            { seq: 'GAAGAC', name: 'BbsI' }, { seq: 'GTCTTC', name: 'BbsI (rev)' },
            { seq: 'CTGCAG', name: 'PstI' }, { seq: 'GTCGAC', name: 'SalI' }
        ];
        // Too long for a five-base state; handled by the repair pass.
        const LONG_SITES = [
            { seq: 'GCGGCCGC', name: 'NotI' }, { seq: 'GCTCTTC', name: 'SapI' },
            { seq: 'GAAGAGC', name: 'SapI (rev)' }, { seq: 'CCTGCAGG', name: 'SbfI' }
        ];

        const isDrach = (p) => /^[AGT][AG]AC[ACT]$/.test(p);

        // The cost of the k-mers that END at each of the new bases. `prev` is the five bases
        // already written (may be shorter at the very start), `add` is the codon.
        const windowCost = (prev, add, P) => {
            let cost = 0;
            const s = prev + add;
            const base = prev.length;
            for (let k = 0; k < add.length; k++) {
                const end = base + k + 1;                 // exclusive index of the new base
                const two = s.slice(end - 2, end);
                if (two.length === 2) {
                    if (two === 'CG') cost += P.cpg;
                    if (two === 'TA') cost += P.upa;
                }
                if (P.uridine && s[end - 1] === 'T') cost += P.uridine;
                const five = s.slice(end - 5, end);
                if (five.length === 5) {
                    if (isDrach(five)) cost += P.drach;
                    if (five[0] === five[1] && five[1] === five[2] && five[2] === five[3] && five[3] === five[4]) cost += P.run5;
                }
                const six = s.slice(end - 6, end);
                if (six.length === 6) {
                    if (six === 'AATAAA' || six === 'ATTAAA') cost += P.polyaSignal;
                    for (const st of SHORT_SITES) if (six === st.seq) cost += P.site;
                }
            }
            return cost;
        };

        // ---- presets -------------------------------------------------------------------------------
        //
        // Named intents rather than a wall of sliders. Each says what it is FOR, because the
        // right objective depends entirely on what the construct has to do.
        const PRESETS = [
            {
                id: 'expression', name: 'Maximise expression',
                blurb: 'Codon usage above everything, with CpG only lightly penalised. The '
                    + 'shortest route to protein per microgram. Use when the transcript is '
                    + 'delivered to cells that will not mount much of a response to it anyway.',
                weights: { cai: 1.0, cpg: 0.3, upa: 0.05, drach: 0.1, uridine: 0 }
            },
            {
                id: 'stability', name: 'Longer half-life',
                blurb: 'Trades some codon adaptation for a transcript the cell degrades more '
                    + 'slowly: CpG suppressed hard, so ZAP has less to bind, and the m6A '
                    + 'consensus thinned so there is less for the methylation machinery to '
                    + 'write on. The default for a construct that has to keep expressing.',
                weights: { cai: 0.6, cpg: 2.5, upa: 0.2, drach: 0.8, uridine: 0 }
            },
            {
                id: 'quiet', name: 'Least innate sensing',
                blurb: 'CpG suppressed as hard as the protein allows and uridine minimised on '
                    + 'top. Pairs with N1-methylpseudouridine: fewer uridines means less '
                    + 'modified base to buy and less substrate for the sensors that remain.',
                weights: { cai: 0.5, cpg: 3.5, upa: 0.4, drach: 0.6, uridine: 0.25 }
            },
            {
                id: 'replicon-goi', name: 'Replicon payload',
                blurb: 'For the gene carried by a self-amplifying construct. Codon usage is '
                    + 'weighted up because the payload is transcribed from a subgenomic promoter '
                    + 'and translated hard, and CpG is left mostly alone -- the replicase in the '
                    + 'same molecule is viral and CpG-rich, so depleting the payload buys little. '
                    + 'Use with the subgenomic promoter window frozen.',
                weights: { cai: 1.0, cpg: 0.5, upa: 0.05, drach: 0.2, uridine: 0 }
            },
            {
                id: 'neutral', name: 'Human-like',
                blurb: 'Sample-free reproduction of ordinary human codon usage with the hard '
                    + 'constraints still enforced. Use when a construct should not look '
                    + 'optimised at all.',
                weights: { cai: 0.35, cpg: 0.8, upa: 0.1, drach: 0.2, uridine: 0 }
            }
        ];
        const presetById = (id) => PRESETS.filter((p) => p.id === id)[0] || PRESETS[0];

        // ---- the dynamic program ---------------------------------------------------------------------
        //
        // opts:
        //   protein      the residues to encode (required unless `cds` is given)
        //   cds          an existing coding sequence; its translation becomes the protein and
        //                frozen ranges are taken from it
        //   frozen       [{from, to}] nucleotide ranges (0-based, half-open, in CDS
        //                coordinates) that must come out byte-identical. Requires `cds`.
        //   preset       one of PRESETS, or weights given directly
        //   weights      overrides merged over the preset
        //   gcTarget     optional 0..1; a mild pull toward this GC fraction
        const optimise = (opts) => {
            const o = opts || {};
            const preset = presetById(o.preset || 'stability');
            const P = Object.assign(DEFAULT_PENALTIES(), preset.weights || {}, o.weights || {});

            let protein, sourceCds = null;
            if (o.cds) {
                sourceCds = GC.cleanNt(o.cds);
                protein = GC.translate(sourceCds).replace(/\*+$/, '');
                if (protein.indexOf('*') >= 0) {
                    return { ok: false, message: 'the coding sequence has an internal stop codon at residue ' + (protein.indexOf('*') + 1) };
                }
            } else {
                protein = GC.cleanAa(o.protein || '').replace(/\*/g, '');
            }
            if (!protein.length) return { ok: false, message: 'nothing to encode' };
            if (/X/.test(protein)) return { ok: false, message: 'the sequence contains a residue this does not have codons for' };

            // Which codons are pinned. A frozen nucleotide range pins every codon it touches,
            // because a codon is the unit of choice: freezing half of one is meaningless.
            const pinned = {};
            const frozenRanges = (o.frozen || []).filter((f) => f && typeof f.from === 'number');
            if (frozenRanges.length) {
                if (!sourceCds) return { ok: false, message: 'frozen ranges need an existing coding sequence to freeze' };
                for (const f of frozenRanges) {
                    const c0 = Math.floor(Math.max(0, f.from) / 3);
                    const c1 = Math.floor((Math.min(sourceCds.length, f.to) - 1) / 3);
                    for (let c = c0; c <= c1 && c < protein.length; c++) pinned[c] = sourceCds.substr(c * 3, 3);
                }
            }

            const gcTarget = (typeof o.gcTarget === 'number') ? o.gcTarget : null;
            const gcWeight = (typeof o.gcWeight === 'number') ? o.gcWeight : 0.6;

            // Intrinsic cost of a codon, independent of what came before it.
            const intrinsic = (c) => {
                const w = RELATIVE[c] || 0.01;
                let v = -Math.log(w) * P.cai;
                if (gcTarget != null) {
                    const g = (c.match(/[GC]/g) || []).length / 3;
                    v += gcWeight * Math.abs(g - gcTarget);
                }
                return v;
            };

            // states: suffix (up to 5 bases) -> {cost, prev, codon}
            let states = new Map();
            states.set('', { cost: 0, prev: null, codon: null });
            const back = [];

            for (let i = 0; i < protein.length; i++) {
                const aa = protein[i];
                const choices = pinned[i] ? [pinned[i]] : (BY_AA[aa] || []);
                if (!choices.length) return { ok: false, message: 'no codon for residue ' + aa + ' at position ' + (i + 1) };
                const next = new Map();
                const layer = new Map();
                for (const [suffix, st] of states) {
                    for (const c of choices) {
                        const add = intrinsic(c) + windowCost(suffix, c, P);
                        const cost = st.cost + add;
                        const ns = (suffix + c).slice(-5);
                        const cur = next.get(ns);
                        if (!cur || cost < cur.cost) {
                            next.set(ns, { cost: cost });
                            layer.set(ns, { from: suffix, codon: c });
                        }
                    }
                }
                back.push(layer);
                states = next;
            }

            // Cheapest end state, then walk the backpointers.
            let bestSuffix = null, bestCost = Infinity;
            for (const [s, st] of states) if (st.cost < bestCost) { bestCost = st.cost; bestSuffix = s; }
            const codons = new Array(protein.length);
            let cur = bestSuffix;
            for (let i = protein.length - 1; i >= 0; i--) {
                const step = back[i].get(cur);
                codons[i] = step.codon;
                cur = step.from;
            }

            let dna = codons.join('');

            // ---- repair pass, for what a five-base state cannot see -----------------------------
            const unresolved = [];
            const longHits = (s) => {
                const out = [];
                for (const st of LONG_SITES) for (const at of GC.findMotif(s, st.seq)) out.push({ at: at, len: st.seq.length, what: st.name });
                for (const b of ['A', 'C', 'G', 'T']) for (const r of GC.runsOf(s, b, 6)) out.push({ at: r.at, len: r.len, what: 'run of ' + r.len + ' ' + GC.toRna(b) });
                return out;
            };
            for (let pass = 0; pass < 60; pass++) {
                const hits = longHits(dna).filter((h) => !unresolved.some((u) => u.at === h.at && u.what === h.what));
                if (!hits.length) break;
                const h = hits[0];
                const first = Math.floor(h.at / 3), last = Math.floor((h.at + h.len - 1) / 3);
                let fixed = false;
                for (let ci = first; ci <= last && !fixed; ci++) {
                    if (pinned[ci]) continue;                       // frozen: never touched
                    const aa = protein[ci];
                    for (const alt of (BY_AA[aa] || [])) {
                        if (alt === codons[ci]) continue;
                        const keep = codons[ci];
                        codons[ci] = alt;
                        const after = codons.join('');
                        if (!longHits(after).some((x) => x.what === h.what && Math.abs(x.at - h.at) < 4)) { dna = after; fixed = true; break; }
                        codons[ci] = keep;
                    }
                }
                if (!fixed) unresolved.push({ at: h.at, what: h.what, why: pinned[first] ? 'the codons involved are frozen' : 'no synonymous codon clears it' });
            }
            dna = codons.join('');

            // ---- what it achieved ------------------------------------------------------------------
            const measure = (s) => ({
                length: s.length,
                cai: GC.cai(s),
                gc: GC.gc(s),
                u: GC.uFraction(s),
                cpg: (s.match(/CG/g) || []).length,
                cpgPerKb: s.length ? ((s.match(/CG/g) || []).length / s.length) * 1000 : 0,
                upa: (s.match(/TA/g) || []).length,
                drach: (() => { let n = 0; for (let i = 0; i + 5 <= s.length; i++) if (isDrach(s.substr(i, 5))) n++; return n; })()
            });

            const result = {
                ok: true,
                dna: dna, rna: GC.toRna(dna), protein: protein,
                codons: codons,
                preset: preset.id, weights: P,
                frozenCodons: Object.keys(pinned).length,
                metrics: measure(dna),
                unresolved: unresolved
            };
            if (sourceCds) {
                result.before = measure(sourceCds);
                // Proof the frozen ranges really did survive. Checked, not asserted: a frozen
                // range that quietly moved would be the worst possible failure here, because
                // the construct would still look right.
                result.frozenIntact = frozenRanges.every((f) =>
                    dna.slice(Math.floor(f.from / 3) * 3, Math.ceil(f.to / 3) * 3)
                    === sourceCds.slice(Math.floor(f.from / 3) * 3, Math.ceil(f.to / 3) * 3));
                result.identity = (() => {
                    let same = 0;
                    for (let i = 0; i < Math.min(dna.length, sourceCds.length); i++) if (dna[i] === sourceCds[i]) same++;
                    return same / Math.max(1, dna.length);
                })();
            }
            // The protein must be untouched. Always checked, never assumed.
            result.translatesBack = (GC.translate(dna) === protein);
            return result;
        };

        return {
            PRESETS: PRESETS, presetById: presetById,
            DEFAULT_PENALTIES: DEFAULT_PENALTIES,
            SHORT_SITES: SHORT_SITES, LONG_SITES: LONG_SITES,
            isDrach: isDrach, windowCost: windowCost,
            optimise: optimise
        };
    })();
}
