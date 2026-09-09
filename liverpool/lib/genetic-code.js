function () {

    // THE SEQUENCE LAYER for Liverpool. The genetic code, human codon usage, and the
    // arithmetic that turns a designed protein cassette into a nucleotide sequence.
    //
    // Nothing here knows about HLA, epitopes or constructs -- it is deliberately the one
    // module in the folder with no immunology in it, so it can be read and checked on its
    // own. Everything downstream (lib/construct.js) reverse-translates through this.
    //
    // Sequences are handled as DNA (T) internally and converted to RNA (U) only for
    // display and export. That is how the synthesis order is placed -- a plasmid or an IVT
    // template is DNA -- and it keeps one alphabet through the whole pipeline.

    const AA_LETTERS = 'ACDEFGHIKLMNPQRSTVWY';

    // ---- the standard genetic code -------------------------------------------------------
    const CODONS = {
        'TTT': 'F', 'TTC': 'F', 'TTA': 'L', 'TTG': 'L',
        'CTT': 'L', 'CTC': 'L', 'CTA': 'L', 'CTG': 'L',
        'ATT': 'I', 'ATC': 'I', 'ATA': 'I', 'ATG': 'M',
        'GTT': 'V', 'GTC': 'V', 'GTA': 'V', 'GTG': 'V',
        'TCT': 'S', 'TCC': 'S', 'TCA': 'S', 'TCG': 'S',
        'CCT': 'P', 'CCC': 'P', 'CCA': 'P', 'CCG': 'P',
        'ACT': 'T', 'ACC': 'T', 'ACA': 'T', 'ACG': 'T',
        'GCT': 'A', 'GCC': 'A', 'GCA': 'A', 'GCG': 'A',
        'TAT': 'Y', 'TAC': 'Y', 'TAA': '*', 'TAG': '*',
        'CAT': 'H', 'CAC': 'H', 'CAA': 'Q', 'CAG': 'Q',
        'AAT': 'N', 'AAC': 'N', 'AAA': 'K', 'AAG': 'K',
        'GAT': 'D', 'GAC': 'D', 'GAA': 'E', 'GAG': 'E',
        'TGT': 'C', 'TGC': 'C', 'TGA': '*', 'TGG': 'W',
        'CGT': 'R', 'CGC': 'R', 'CGA': 'R', 'CGG': 'R',
        'AGT': 'S', 'AGC': 'S', 'AGA': 'R', 'AGG': 'R',
        'GGT': 'G', 'GGC': 'G', 'GGA': 'G', 'GGG': 'G'
    };

    // ---- human codon usage ---------------------------------------------------------------
    //
    // FRACTION WITHIN THE AMINO-ACID FAMILY, not per-thousand: the fractions are what a
    // codon chooser needs, and they are stable to two decimal places across the Kazusa and
    // HIVE Homo sapiens tables. Each family below sums to 1.00 (checked at load, see
    // __auditUsage).
    //
    // These are whole-transcriptome averages. They are the right default and the wrong
    // answer for a specific expression system -- if you are optimising for a particular
    // cell line or for a codon set matched to a highly expressed host gene, replace this
    // table rather than post-processing its output.
    const USAGE = {
        'GCT': 0.26, 'GCC': 0.40, 'GCA': 0.23, 'GCG': 0.11,                                  // A
        'TGT': 0.45, 'TGC': 0.55,                                                            // C
        'GAT': 0.46, 'GAC': 0.54,                                                            // D
        'GAA': 0.42, 'GAG': 0.58,                                                            // E
        'TTT': 0.45, 'TTC': 0.55,                                                            // F
        'GGT': 0.16, 'GGC': 0.34, 'GGA': 0.25, 'GGG': 0.25,                                  // G
        'CAT': 0.42, 'CAC': 0.58,                                                            // H
        'ATT': 0.36, 'ATC': 0.48, 'ATA': 0.16,                                               // I
        'AAA': 0.42, 'AAG': 0.58,                                                            // K
        'TTA': 0.07, 'TTG': 0.13, 'CTT': 0.13, 'CTC': 0.20, 'CTA': 0.07, 'CTG': 0.40,        // L
        'ATG': 1.00,                                                                         // M
        'AAT': 0.46, 'AAC': 0.54,                                                            // N
        'CCT': 0.28, 'CCC': 0.33, 'CCA': 0.27, 'CCG': 0.12,                                  // P
        'CAA': 0.25, 'CAG': 0.75,                                                            // Q
        'CGT': 0.08, 'CGC': 0.19, 'CGA': 0.11, 'CGG': 0.21, 'AGA': 0.21, 'AGG': 0.20,        // R
        'TCT': 0.18, 'TCC': 0.22, 'TCA': 0.15, 'TCG': 0.06, 'AGT': 0.15, 'AGC': 0.24,        // S
        'ACT': 0.24, 'ACC': 0.36, 'ACA': 0.28, 'ACG': 0.12,                                  // T
        'GTT': 0.18, 'GTC': 0.24, 'GTA': 0.11, 'GTG': 0.47,                                  // V
        'TGG': 1.00,                                                                         // W
        'TAT': 0.43, 'TAC': 0.57,                                                            // Y
        'TAA': 0.30, 'TAG': 0.24, 'TGA': 0.46                                                // *
    };

    // ---- derived tables ------------------------------------------------------------------
    const BY_AA = {};                       // 'L' -> ['TTA','TTG',...], most-used first
    for (const c in CODONS) {
        const aa = CODONS[c];
        if (!BY_AA[aa]) BY_AA[aa] = [];
        BY_AA[aa].push(c);
    }
    for (const aa in BY_AA) BY_AA[aa].sort((x, y) => (USAGE[y] || 0) - (USAGE[x] || 0));

    // w_i for the codon adaptation index: this codon's usage over the most-used codon of
    // its family (Sharp & Li, Nucleic Acids Res 1987;15:1281).
    const RELATIVE = {};
    for (const aa in BY_AA) {
        const top = USAGE[BY_AA[aa][0]] || 1;
        for (const c of BY_AA[aa]) RELATIVE[c] = (USAGE[c] || 0) / top;
    }

    // A usage table with a family that does not sum to 1 is a typo, and a typo here biases
    // every sequence the tool ever writes. Report it once rather than let it through.
    const usageAudit = [];
    for (const aa in BY_AA) {
        let s = 0;
        for (const c of BY_AA[aa]) s += (USAGE[c] || 0);
        if (Math.abs(s - 1) > 0.02) usageAudit.push(aa + ' sums to ' + s.toFixed(2));
    }

    // ---- small helpers -------------------------------------------------------------------
    const clean = (s) => ('' + (s == null ? '' : s)).toUpperCase().replace(/[^A-Z*]/g, '');
    const cleanNt = (s) => ('' + (s == null ? '' : s)).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
    const cleanAa = (s) => ('' + (s == null ? '' : s)).toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY*]/g, '');
    const toRna = (s) => ('' + (s || '')).toUpperCase().replace(/T/g, 'U');
    const toDna = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T');

    // Deterministic RNG. A sampled optimisation that gave a different answer every time it
    // was run would make two people looking at the same design disagree about what it is,
    // so every sampled choice is seeded from the sequence being written.
    const rng = (seed) => {
        let a = (seed >>> 0) || 0x9e3779b9;
        return () => {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const hashString = (s) => {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    };

    // ---- translation ---------------------------------------------------------------------
    const translate = (dna, opts) => {
        const o = opts || {};
        const s = cleanNt(dna);
        let out = '';
        for (let i = 0; i + 2 < s.length; i += 3) {
            const aa = CODONS[s.substr(i, 3)] || 'X';
            if (aa === '*' && o.stopAtStop) break;
            out += aa;
        }
        return out;
    };

    // ---- composition ---------------------------------------------------------------------
    const gc = (seq) => {
        const s = cleanNt(seq);
        if (!s.length) return 0;
        let n = 0;
        for (const ch of s) if (ch === 'G' || ch === 'C') n++;
        return n / s.length;
    };
    // GC in a sliding window. A sequence at 60% overall can still carry a 90% stretch that
    // will not synthesise, which is why the windowed figure is reported next to the global
    // one rather than instead of it.
    const gcWindows = (seq, win, step) => {
        const s = cleanNt(seq);
        const w = win || 50, st = step || 10;
        const out = [];
        if (s.length < w) return out;
        for (let i = 0; i + w <= s.length; i += st) out.push({ at: i, gc: gc(s.substr(i, w)) });
        return out;
    };
    // Uridine fraction, on the RNA. It matters because the modified nucleoside used in an
    // IVT vaccine (N1-methylpseudouridine) substitutes for every U, so U content sets both
    // the cost of the run and how much of the transcript is modified.
    const uFraction = (seq) => {
        const s = cleanNt(seq);
        if (!s.length) return 0;
        let n = 0;
        for (const ch of s) if (ch === 'T') n++;
        return n / s.length;
    };
    const longestRun = (seq, base) => {
        const s = cleanNt(seq), b = ('' + base).toUpperCase().replace('U', 'T');
        let best = 0, run = 0;
        for (const ch of s) { run = (ch === b) ? run + 1 : 0; if (run > best) best = run; }
        return best;
    };
    const runsOf = (seq, base, minLen) => {
        const s = cleanNt(seq), b = ('' + base).toUpperCase().replace('U', 'T');
        const out = []; let start = -1;
        for (let i = 0; i <= s.length; i++) {
            if (i < s.length && s[i] === b) { if (start < 0) start = i; }
            else if (start >= 0) { if (i - start >= (minLen || 4)) out.push({ at: start, len: i - start }); start = -1; }
        }
        return out;
    };
    const findMotif = (seq, motif) => {
        const s = cleanNt(seq), m = cleanNt(motif);
        const out = [];
        if (!m.length) return out;
        let i = s.indexOf(m);
        while (i >= 0) { out.push(i); i = s.indexOf(m, i + 1); }
        return out;
    };

    // ---- codon adaptation index ----------------------------------------------------------
    //
    // Geometric mean of w over the codons of the coding sequence. Met and Trp have one
    // codon each and carry no information about adaptation, so they are excluded -- keeping
    // them multiplies the product by 1 and inflates the index of any Met/Trp-rich sequence.
    // Stops are excluded for the same reason plus a stronger one: stop usage is not
    // translational selection.
    const cai = (dna) => {
        const s = cleanNt(dna);
        let sum = 0, n = 0;
        for (let i = 0; i + 2 < s.length; i += 3) {
            const c = s.substr(i, 3), aa = CODONS[c];
            if (!aa || aa === '*' || aa === 'M' || aa === 'W') continue;
            const w = RELATIVE[c];
            if (!w) continue;
            sum += Math.log(w); n++;
        }
        return n ? Math.exp(sum / n) : 0;
    };

    // ---- codon choosers ------------------------------------------------------------------
    //
    // Four strategies, because the right one depends on what the sequence is for and no
    // single objective covers them:
    //
    //   cai        the most-used codon everywhere. Highest CAI, and the worst sequence to
    //              synthesise: it drives GC up and produces long identical repeats.
    //   balanced   sample proportionally to human usage, ignoring codons below `floor`.
    //              Deterministic (seeded), so the same protein always gives the same DNA.
    //   low-u      of the codons above `floor`, the one with the fewest T/U, usage as the
    //              tie-break. For a modified-nucleoside transcript, where every U is a
    //              modified base.
    //   gc-rich    of the codons above `floor`, prefer G/C in the wobble position. Raises
    //              duplex stability; watch the windowed GC report afterwards.
    const CHOOSERS = {
        'cai': (aa) => BY_AA[aa][0],
        'balanced': (aa, rnd, floor) => {
            const list = BY_AA[aa].filter((c) => (USAGE[c] || 0) >= floor);
            const pool = list.length ? list : [BY_AA[aa][0]];
            let total = 0;
            for (const c of pool) total += (USAGE[c] || 0);
            let r = rnd() * total;
            for (const c of pool) { r -= (USAGE[c] || 0); if (r <= 0) return c; }
            return pool[pool.length - 1];
        },
        'low-u': (aa, rnd, floor) => {
            const list = BY_AA[aa].filter((c) => (USAGE[c] || 0) >= floor);
            const pool = list.length ? list : [BY_AA[aa][0]];
            const uCount = (c) => (c.match(/T/g) || []).length;
            return pool.slice().sort((x, y) => (uCount(x) - uCount(y)) || ((USAGE[y] || 0) - (USAGE[x] || 0)))[0];
        },
        'gc-rich': (aa, rnd, floor) => {
            const list = BY_AA[aa].filter((c) => (USAGE[c] || 0) >= floor);
            const pool = list.length ? list : [BY_AA[aa][0]];
            const gcCount = (c) => (c.match(/[GC]/g) || []).length;
            return pool.slice().sort((x, y) => (gcCount(y) - gcCount(x)) || ((USAGE[y] || 0) - (USAGE[x] || 0)))[0];
        }
    };

    // Motifs a coding sequence must not contain. Some are cloning sites, some would change
    // what the transcript does in a cell, and the repair pass below silently recodes around
    // all of them -- silently because a synonymous change is not a design decision.
    const DEFAULT_AVOID = [
        { name: 'AATAAA (polyadenylation signal)', seq: 'AATAAA', why: 'a cryptic poly(A) signal inside the ORF truncates the transcript' },
        { name: 'ATTAAA (polyadenylation signal)', seq: 'ATTAAA', why: 'the common variant poly(A) signal' },
        { name: 'EcoRI', seq: 'GAATTC', why: 'cloning site' },
        { name: 'BamHI', seq: 'GGATCC', why: 'cloning site' },
        { name: 'HindIII', seq: 'AAGCTT', why: 'cloning site' },
        { name: 'XbaI', seq: 'TCTAGA', why: 'cloning site' },
        { name: 'NotI', seq: 'GCGGCCGC', why: 'cloning site' },
        { name: 'BsaI', seq: 'GGTCTC', why: 'Golden Gate assembly site' },
        { name: 'BsaI (rev)', seq: 'GAGACC', why: 'Golden Gate assembly site, reverse strand' },
        { name: 'BbsI', seq: 'GAAGAC', why: 'Golden Gate assembly site' },
        { name: 'BbsI (rev)', seq: 'GTCTTC', why: 'Golden Gate assembly site, reverse strand' },
        { name: 'SapI', seq: 'GCTCTTC', why: 'assembly site' },
        { name: 'SapI (rev)', seq: 'GAAGAGC', why: 'assembly site, reverse strand' }
    ];

    // Alternatives for one residue, best first under the active strategy, excluding the
    // codon already there. Used by the repair pass.
    const alternatives = (aa, current, mode, floor) => {
        const list = BY_AA[aa].filter((c) => c !== current && (USAGE[c] || 0) >= Math.min(floor, 0.07));
        if (mode === 'low-u') {
            const uCount = (c) => (c.match(/T/g) || []).length;
            return list.sort((x, y) => (uCount(x) - uCount(y)) || ((USAGE[y] || 0) - (USAGE[x] || 0)));
        }
        if (mode === 'gc-rich') {
            const gcCount = (c) => (c.match(/[GC]/g) || []).length;
            return list.sort((x, y) => (gcCount(y) - gcCount(x)) || ((USAGE[y] || 0) - (USAGE[x] || 0)));
        }
        return list.sort((x, y) => (USAGE[y] || 0) - (USAGE[x] || 0));
    };

    // ---- reverse translation with repair -------------------------------------------------
    //
    // Writes the protein, then REPAIRS the result: every forbidden motif and every
    // homopolymer run longer than the limit is recoded by swapping synonymous codons that
    // overlap it. The protein is never changed -- if no synonymous swap clears a hit (a run
    // of lysines has only AAA and AAG to work with, and both end in A), the hit is REPORTED
    // rather than quietly left behind. A QC report that lies is worse than no report.
    const optimize = (protein, opts) => {
        const o = opts || {};
        const mode = CHOOSERS[o.mode] ? o.mode : 'balanced';
        const floor = (typeof o.floor === 'number') ? o.floor : 0.10;
        const maxRun = (typeof o.maxRun === 'number') ? o.maxRun : 6;
        const avoid = Array.isArray(o.avoid) ? o.avoid : DEFAULT_AVOID;
        const p = cleanAa(protein).replace(/\*/g, '');
        const rnd = rng(hashString(p + '|' + mode));
        const chooser = CHOOSERS[mode];

        const codons = [];
        for (const aa of p) {
            if (!BY_AA[aa]) { codons.push('NNN'); continue; }
            codons.push(chooser(aa, rnd, floor));
        }

        // --- repair ---
        const seqOf = () => codons.join('');
        const unresolved = [];
        const hitsIn = (s) => {
            const out = [];
            for (const m of avoid) for (const at of findMotif(s, m.seq)) out.push({ at: at, len: m.seq.length, what: m.name, why: m.why });
            for (const b of ['A', 'C', 'G', 'T']) {
                for (const r of runsOf(s, b, maxRun + 1)) {
                    out.push({ at: r.at, len: r.len, what: 'poly-' + toRna(b) + ' run of ' + r.len, why: 'homopolymer runs above ' + maxRun + ' misprime and slip during synthesis' });
                }
            }
            return out;
        };

        // Up to `rounds` passes: each pass takes the first outstanding hit and tries every
        // synonymous swap at every codon the hit touches, keeping the first swap that clears
        // it without creating a new hit at the same place.
        const rounds = 200;
        for (let pass = 0; pass < rounds; pass++) {
            const s = seqOf();
            const hits = hitsIn(s).filter((h) => !unresolved.some((u) => u.at === h.at && u.what === h.what));
            if (!hits.length) break;
            const h = hits[0];
            const first = Math.floor(h.at / 3), last = Math.floor((h.at + h.len - 1) / 3);
            let fixed = false;
            for (let ci = first; ci <= last && !fixed; ci++) {
                const aa = p[ci];
                if (!aa || !BY_AA[aa] || BY_AA[aa].length < 2) continue;
                for (const alt of alternatives(aa, codons[ci], mode, floor)) {
                    const keep = codons[ci];
                    codons[ci] = alt;
                    const after = seqOf();
                    const stillThere = hitsIn(after).some((x) => x.what === h.what && Math.abs(x.at - h.at) < 4);
                    if (!stillThere) { fixed = true; break; }
                    codons[ci] = keep;
                }
            }
            if (!fixed) unresolved.push({ at: h.at, what: h.what, why: h.why });
        }

        const dna = seqOf();
        return {
            dna: dna,
            rna: toRna(dna),
            protein: p,
            mode: mode,
            cai: cai(dna),
            gc: gc(dna),
            u: uFraction(dna),
            // Anything the repair pass could not recode away, named. These are real and the
            // caller is expected to show them.
            unresolved: unresolved,
            remaining: hitsIn(dna)
        };
    };

    // ---- the returned module -------------------------------------------------------------
    return {
        AA_LETTERS: AA_LETTERS,
        CODONS: CODONS,
        BY_AA: BY_AA,
        USAGE: USAGE,
        RELATIVE: RELATIVE,
        DEFAULT_AVOID: DEFAULT_AVOID,
        usageAudit: usageAudit,

        clean: clean, cleanNt: cleanNt, cleanAa: cleanAa,
        toRna: toRna, toDna: toDna,
        translate: translate,
        gc: gc, gcWindows: gcWindows, uFraction: uFraction,
        longestRun: longestRun, runsOf: runsOf, findMotif: findMotif,
        cai: cai, optimize: optimize,
        rng: rng, hashString: hashString
    };
}
