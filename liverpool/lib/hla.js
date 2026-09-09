function () {

    // HLA BINDING, BY MOTIF. What this is, and just as importantly what it is not.
    //
    // WHAT IT IS. A position-specific scoring scheme over the published anchor motifs of
    // the common HLA class I and class II alleles -- the SYFPEITHI-style method: score the
    // residue at each position of the peptide against what that allele's binding groove is
    // known to prefer there, add the positions up, and express the total as a PERCENTILE
    // RANK against a background of random peptides drawn from human amino-acid frequencies.
    // The rank, not the raw score, is what is reported, for the same reason every modern
    // predictor reports one: raw scores are not comparable between alleles, and percentile
    // ranks are. The conventional thresholds carry over -- 0.5% strong, 2% weak.
    //
    // WHAT IT IS NOT. It is not NetMHCpan, MHCflurry, or any other predictor trained on
    // measured affinity or on eluted-ligand mass spectrometry. It has no training data in
    // it at all. It will rank an obvious A*02:01 binder highly and it will miss the
    // non-obvious ones, and its absolute numbers should not be quoted as affinities.
    //
    // Use it as a SCREEN -- to sort a mutation list, to see the shape of a patient's
    // repertoire, to catch a junctional neoepitope while you are still editing the
    // cassette. Before anything is synthesised, re-rank the shortlist with a trained
    // predictor: setExternalPredictor() below takes one and every consumer of this module
    // will use it instead, with no other change.
    //
    // Motif sources are the classic anchor descriptions (Falk/Rammensee's pool-sequencing
    // motifs and the SYFPEITHI database) as refined by the eluted-ligand motifs in IEDB.
    // Each allele carries a `confidence` field; the class II motifs beyond P1 are the
    // weakest part of this file and say so.

    const AAS = 'ACDEFGHIKLMNPQRSTVWY'.split('');

    // Human proteome amino-acid frequencies (percent), used to draw the background the
    // percentile rank is measured against. A background drawn uniformly over 20 letters
    // would make leucine-rich peptides look special when they are merely common.
    const BG_FREQ = {
        A: 7.0, R: 5.6, N: 3.6, D: 4.7, C: 2.3, Q: 4.8, E: 7.1, G: 6.6, H: 2.6, I: 4.4,
        L: 10.0, K: 5.7, M: 2.2, F: 3.7, P: 6.3, S: 8.3, T: 5.4, W: 1.2, Y: 2.7, V: 6.0
    };

    // Weights a motif entry can carry. Kept as four named levels rather than free numbers:
    // the underlying evidence is "this allele's P2 pocket takes leucine", not a measurement,
    // and inventing two-decimal weights for it would dress up the uncertainty.
    const W = { anchor: 3.0, strong: 2.0, ok: 1.0, weak: 0.4, bad: -2.5 };

    const m = (spec) => {
        // {2: {anchor:'LM', ok:'IVQAT', bad:'DEP'}, 9: {...}} -> position -> letter -> weight
        const out = {};
        for (const pos in spec) {
            const row = {};
            const s = spec[pos];
            for (const level in s) for (const ch of s[level]) row[ch] = W[level];
            out[+pos] = row;
        }
        return out;
    };

    // ---- class I -------------------------------------------------------------------------
    //
    // Positions are 1-based over a 9-mer core. Position 2 and the C-terminus (9) are the
    // primary anchors for nearly every class I allele; where an allele's primary anchor is
    // elsewhere -- B*08:01 at P3 and P5, A*01:01 at P3 -- it is written where it belongs.
    const CLASS_I = {
        'HLA-A*01:01': { conf: 'good', note: 'P3 acidic and a C-terminal tyrosine.', mx: m({ 2: { ok: 'TS', weak: 'ILVM' }, 3: { anchor: 'DE', ok: 'NQ' }, 9: { anchor: 'Y', ok: 'F' } }) },
        'HLA-A*02:01': { conf: 'good', note: 'The best-characterised motif: aliphatic P2, aliphatic C-terminus.', mx: m({ 1: { weak: 'FYKI', bad: 'DEP' }, 2: { anchor: 'LM', strong: 'I', ok: 'QVAT', bad: 'DEKRP' }, 3: { weak: 'DWAF' }, 9: { anchor: 'VL', strong: 'IA', ok: 'MT', bad: 'DEKRP' } }) },
        'HLA-A*03:01': { conf: 'good', note: 'Aliphatic P2, basic C-terminus.', mx: m({ 2: { anchor: 'LVM', ok: 'IST', bad: 'DEP' }, 9: { anchor: 'KR', ok: 'Y', bad: 'DEP' } }) },
        'HLA-A*11:01': { conf: 'good', note: 'Like A*03:01 but a stricter lysine at the C-terminus.', mx: m({ 2: { anchor: 'VT', strong: 'IL', ok: 'SM', bad: 'DEP' }, 9: { anchor: 'K', strong: 'R', bad: 'DEP' } }) },
        'HLA-A*24:02': { conf: 'good', note: 'Aromatic P2, hydrophobic C-terminus.', mx: m({ 2: { anchor: 'YF', ok: 'WM', bad: 'DEKRP' }, 9: { anchor: 'FL', strong: 'IW', ok: 'M', bad: 'DEKRP' } }) },
        'HLA-A*26:01': { conf: 'fair', note: 'Acidic P1 is unusual and is the discriminating position.', mx: m({ 1: { anchor: 'DE' }, 2: { ok: 'VTIL' }, 9: { anchor: 'YF', ok: 'LM' } }) },
        'HLA-A*68:01': { conf: 'fair', note: 'Basic C-terminus, like the A3 supertype.', mx: m({ 2: { anchor: 'TV', ok: 'AS' }, 9: { anchor: 'R', strong: 'K' } }) },
        'HLA-B*07:02': { conf: 'good', note: 'Proline at P2 is close to obligatory.', mx: m({ 2: { anchor: 'P', bad: 'DEKR' }, 9: { anchor: 'LF', strong: 'M', ok: 'IAV', bad: 'DEKRP' } }) },
        'HLA-B*08:01': { conf: 'good', note: 'Anchors at P3 and P5, not at P2 -- a common cause of missed epitopes.', mx: m({ 3: { anchor: 'KR', ok: 'H' }, 5: { anchor: 'KR', ok: 'H' }, 9: { anchor: 'L', strong: 'IM', ok: 'F' } }) },
        'HLA-B*15:01': { conf: 'fair', note: 'Q/L at P2, aromatic C-terminus.', mx: m({ 2: { anchor: 'QL', ok: 'MK' }, 9: { anchor: 'FY', strong: 'M', ok: 'LI' } }) },
        'HLA-B*27:05': { conf: 'good', note: 'Arginine at P2 is the strongest single anchor of any common allele.', mx: m({ 2: { anchor: 'R', bad: 'DEP' }, 9: { anchor: 'KRL', ok: 'FY' } }) },
        'HLA-B*35:01': { conf: 'good', note: 'Proline at P2, aromatic or aliphatic C-terminus.', mx: m({ 2: { anchor: 'P', ok: 'A' }, 9: { anchor: 'YF', strong: 'M', ok: 'LI' } }) },
        'HLA-B*40:01': { conf: 'good', note: 'Glutamate at P2.', mx: m({ 2: { anchor: 'E', bad: 'KRP' }, 9: { anchor: 'L', strong: 'A', ok: 'IV' } }) },
        'HLA-B*44:02': { conf: 'good', note: 'Glutamate at P2, aromatic C-terminus.', mx: m({ 2: { anchor: 'E', bad: 'KRP' }, 9: { anchor: 'FY', strong: 'W', ok: 'LI' } }) },
        'HLA-B*51:01': { conf: 'fair', note: 'Small residue at P2, aliphatic C-terminus.', mx: m({ 2: { anchor: 'AP', ok: 'G' }, 9: { anchor: 'IV', ok: 'LM' } }) },
        'HLA-B*57:01': { conf: 'good', note: 'Small P2, bulky aromatic C-terminus.', mx: m({ 2: { anchor: 'AT', ok: 'S' }, 9: { anchor: 'WF', ok: 'Y' } }) },
        'HLA-B*58:01': { conf: 'fair', note: 'As B*57:01.', mx: m({ 2: { anchor: 'AT', ok: 'S' }, 9: { anchor: 'WF', ok: 'Y' } }) },
        'HLA-C*07:01': { conf: 'weak', note: 'Class C motifs are the least well described here. Treat the rank as indicative only.', mx: m({ 2: { anchor: 'YR', ok: 'FA' }, 9: { anchor: 'YL', ok: 'FM' } }) },
        'HLA-C*07:02': { conf: 'weak', note: 'Class C motifs are the least well described here. Treat the rank as indicative only.', mx: m({ 2: { anchor: 'YR', ok: 'FA' }, 9: { anchor: 'YL', ok: 'FM' } }) }
    };

    // ---- class II ------------------------------------------------------------------------
    //
    // A class II groove is open at both ends: the peptide can be any length and what binds
    // is a 9-residue CORE inside it, in one of several registers. Scoring therefore slides
    // a 9-mer core along the peptide and keeps the best-scoring register, which is reported
    // alongside the rank -- the core is the part a designer needs to keep intact.
    //
    // CONFIDENCE. P1 (a deep hydrophobic pocket) is solid for every DR allele below. P4, P6
    // and P9 are shallower, more allele-specific, and what is encoded here is the broad
    // preference rather than a measured matrix. Class II ranks from this module should be
    // treated as a coarse sort, not a shortlist.
    const CLASS_II = {
        'HLA-DRB1*01:01': { conf: 'fair', mx: m({ 1: { anchor: 'FYWLIVM', bad: 'DEP' }, 4: { ok: 'LAIMV' }, 6: { ok: 'AGSTCP' }, 9: { ok: 'LAIVNQ' } }) },
        'HLA-DRB1*03:01': { conf: 'weak', mx: m({ 1: { anchor: 'LIFMV', bad: 'DEP' }, 4: { ok: 'DE' }, 6: { ok: 'KRN' }, 9: { ok: 'YLF' } }) },
        'HLA-DRB1*04:01': { conf: 'fair', mx: m({ 1: { anchor: 'FYWILVM', bad: 'DEP' }, 4: { ok: 'NQSTA', bad: 'DE' }, 6: { ok: 'STNAG' }, 9: { ok: 'LAVN' } }) },
        'HLA-DRB1*07:01': { conf: 'fair', mx: m({ 1: { anchor: 'FYWILVM', bad: 'DEP' }, 4: { ok: 'LIVMA' }, 6: { ok: 'STAGNP' }, 9: { ok: 'LFVI' } }) },
        'HLA-DRB1*11:01': { conf: 'weak', mx: m({ 1: { anchor: 'FYWILV', bad: 'DEP' }, 4: { ok: 'KRNQST' }, 6: { ok: 'STAGN' }, 9: { ok: 'LAVNI' } }) },
        'HLA-DRB1*13:01': { conf: 'weak', mx: m({ 1: { anchor: 'FYWILV', bad: 'DEP' }, 4: { ok: 'KRNQ' }, 6: { ok: 'STAGND' }, 9: { ok: 'LAVN' } }) },
        'HLA-DRB1*15:01': { conf: 'fair', mx: m({ 1: { anchor: 'FYWILVM', bad: 'DEP' }, 4: { ok: 'ILVMF' }, 6: { ok: 'ILVNA' }, 9: { ok: 'LIVAN' } }) },
        'HLA-DRB1*04:04': { conf: 'weak', mx: m({ 1: { anchor: 'FYWILVM', bad: 'DEP' }, 4: { ok: 'NQSTA', bad: 'DE' }, 6: { ok: 'STNAG' }, 9: { ok: 'LAVN' } }) },
        'HLA-DPB1*04:01': { conf: 'weak', mx: m({ 1: { anchor: 'FYWILVM', bad: 'DEP' }, 4: { ok: 'LIVMA' }, 6: { ok: 'STAGN' }, 9: { ok: 'LIVMF' } }) },
        'HLA-DQB1*03:01': { conf: 'weak', mx: m({ 1: { anchor: 'FYWILVM', bad: 'DEP' }, 4: { ok: 'LIVMA' }, 6: { ok: 'STAGN' }, 9: { ok: 'LIVMF' } }) }
    };

    const ALL = {};
    for (const k in CLASS_I) ALL[k] = { allele: k, cls: 1, conf: CLASS_I[k].conf, note: CLASS_I[k].note || '', mx: CLASS_I[k].mx };
    for (const k in CLASS_II) ALL[k] = { allele: k, cls: 2, conf: CLASS_II[k].conf, note: CLASS_II[k].note || '', mx: CLASS_II[k].mx };

    // A typed name for an allele written any of the ways people write them: "A*02:01",
    // "A0201", "HLA-A02:01", "hla-a*02:01".
    const normalise = (name) => {
        let s = ('' + (name == null ? '' : name)).trim().toUpperCase().replace(/\s+/g, '');
        if (!s) return '';
        s = s.replace(/^HLA-?/, '');
        // A0201 / DRB10401 -> A*02:01 / DRB1*04:01
        let mm = s.match(/^([A-Z]+[0-9]?)\*?([0-9]{2}):?([0-9]{2,3})$/);
        if (mm) s = mm[1] + '*' + mm[2] + ':' + mm[3];
        const full = 'HLA-' + s;
        if (ALL[full]) return full;
        // Two-digit group given alone ("A*02") -- take the commonest member of the group.
        const grp = full.replace(/:[0-9]+$/, '');
        for (const k in ALL) if (k.indexOf(grp + ':') === 0) return k;
        return full;                    // unknown; the caller reports it rather than guessing
    };

    const known = (name) => !!ALL[normalise(name)];
    const alleles = (cls) => Object.keys(ALL).filter((k) => !cls || ALL[k].cls === cls).sort();
    const info = (name) => ALL[normalise(name)] || null;

    // ---- mapping a peptide of length L onto a 9-position core ----------------------------
    //
    // Class I motifs are described over 9-mers. An 8-, 10- or 11-mer binds the same groove
    // with the same anchors at the same ENDS, bulging in the middle -- so the first four
    // residues map to core 1-4, the last four to core 6-9, and everything between is treated
    // as the bulge and mapped to core 5. That is the standard alignment assumption, and it
    // keeps the anchors (P2 and the C-terminus) exactly where the motif expects them.
    const coreMap = (len) => {
        const map = new Array(len).fill(5);
        for (let i = 0; i < Math.min(4, len); i++) map[i] = i + 1;
        for (let i = 0; i < Math.min(4, len); i++) {
            const idx = len - 1 - i;
            if (idx >= 4) map[idx] = 9 - i;
        }
        return map;
    };

    const scoreCore9 = (mx, pep) => {
        let s = 0;
        for (let i = 0; i < 9 && i < pep.length; i++) {
            const row = mx[i + 1];
            if (row) s += (row[pep[i]] || 0);
        }
        return s;
    };

    // Raw motif score for a class I peptide of any length 8-11.
    const scoreClassI = (mx, pep) => {
        const map = coreMap(pep.length);
        let s = 0;
        for (let i = 0; i < pep.length; i++) {
            const row = mx[map[i]];
            if (row) s += (row[pep[i]] || 0);
        }
        return s;
    };

    // Best 9-mer register inside a longer class II peptide.
    const scoreClassII = (mx, pep) => {
        if (pep.length < 9) return { score: scoreCore9(mx, pep), core: pep, offset: 0 };
        let best = -Infinity, bestOff = 0;
        for (let off = 0; off + 9 <= pep.length; off++) {
            const s = scoreCore9(mx, pep.substr(off, 9));
            if (s > best) { best = s; bestOff = off; }
        }
        return { score: best, core: pep.substr(bestOff, 9), offset: bestOff };
    };

    // ---- percentile-rank background ------------------------------------------------------
    //
    // Built once per (allele, length) and cached. 20,000 random peptides is enough to place
    // a peptide to about a tenth of a percentile, which is the resolution the 0.5% / 2%
    // thresholds need.
    const BG_N = 20000;
    const bgCache = new Map();

    // The finest rank the background can resolve. Published, because a caller dividing one
    // rank by another must clamp BOTH with the same floor -- clamping with anything else
    // manufactures a ratio out of two numbers that are really the same.
    const MIN_RANK = 100 / BG_N / 2;

    const bgLetters = (() => {
        // A 1000-slot table sampled uniformly reproduces the frequencies above to 0.1%.
        const table = [];
        for (const aa of AAS) {
            const n = Math.round((BG_FREQ[aa] || 0) * 10);
            for (let i = 0; i < n; i++) table.push(aa);
        }
        return table;
    })();

    const background = (alleleKey, len) => {
        const key = alleleKey + '|' + len;
        if (bgCache.has(key)) return bgCache.get(key);
        const a = ALL[alleleKey];
        if (!a) return null;
        // Fixed seed: the background must not move between runs, or two identical designs
        // would report different ranks.
        let s = 0x2545F491 ^ (len * 2654435761);
        const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const scores = new Float64Array(BG_N);
        for (let i = 0; i < BG_N; i++) {
            let pep = '';
            for (let j = 0; j < len; j++) pep += bgLetters[(rnd() * bgLetters.length) | 0];
            scores[i] = (a.cls === 1) ? scoreClassI(a.mx, pep) : scoreClassII(a.mx, pep).score;
        }
        const sorted = Array.from(scores).sort((x, y) => y - x);       // descending
        bgCache.set(key, sorted);
        return sorted;
    };

    // Percentile rank, as a percentage: the share of background peptides scoring at least
    // as high. Lower is better, exactly as every published predictor reports it.
    const percentile = (sorted, score) => {
        let lo = 0, hi = sorted.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] > score) lo = mid + 1; else hi = mid; }
        // Never report 0.00 -- with 20,000 draws the resolution floor is 0.005%, and a
        // printed zero would claim more than the background can support.
        return Math.max(MIN_RANK, (lo / sorted.length) * 100);
    };

    // ---- an optional trained predictor ---------------------------------------------------
    //
    // Hand this module a real predictor and every consumer switches to it. The function
    // takes (allele, [peptides]) and returns [{peptide, rank, ic50?}] -- rank as a
    // percentile, same convention. Set it to null to go back to the motif screen.
    let external = null;
    const setExternalPredictor = (fn) => { external = (typeof fn === 'function') ? fn : null; };
    const hasExternalPredictor = () => !!external;

    // ---- the call everything else makes --------------------------------------------------
    //
    // predict(allele, peptides) -> [{peptide, allele, rank, score, core, offset, bind,
    //                                source, confidence}]
    // `bind` is 'strong' (rank <= 0.5), 'weak' (<= 2) or 'none', on the conventional
    // thresholds. `source` says which engine produced the number, and is carried all the way
    // to the report so nobody mistakes a motif screen for a trained prediction.
    const predict = async (allele, peptides) => {
        const key = normalise(allele);
        const a = ALL[key];
        const list = (peptides || []).map((p) => ('' + p).toUpperCase());

        if (external) {
            try {
                const res = await external(key, list);
                if (Array.isArray(res) && res.length === list.length) {
                    return res.map((r, i) => ({
                        peptide: list[i], allele: key,
                        rank: (r && typeof r.rank === 'number') ? r.rank : 100,
                        ic50: (r && typeof r.ic50 === 'number') ? r.ic50 : null,
                        score: (r && typeof r.score === 'number') ? r.score : null,
                        core: (r && r.core) || list[i], offset: (r && r.offset) || 0,
                        bind: bandOf((r && r.rank) != null ? r.rank : 100),
                        source: 'external', confidence: 'external'
                    }));
                }
            } catch (e) {
                // Fall through to the motif screen rather than failing the design. The
                // source field on every row will say 'motif', so the fallback is visible.
            }
        }

        if (!a) {
            return list.map((p) => ({
                peptide: p, allele: key, rank: 100, score: 0, core: p, offset: 0,
                bind: 'none', source: 'unknown-allele', confidence: 'none'
            }));
        }

        return list.map((p) => {
            let score, core = p, offset = 0;
            if (a.cls === 1) { score = scoreClassI(a.mx, p); }
            else { const r = scoreClassII(a.mx, p); score = r.score; core = r.core; offset = r.offset; }
            const bg = background(key, a.cls === 1 ? p.length : Math.max(9, Math.min(p.length, 21)));
            const rank = bg ? percentile(bg, score) : 100;
            return {
                peptide: p, allele: key, rank: rank, score: score, core: core, offset: offset,
                bind: bandOf(rank), source: 'motif', confidence: a.conf
            };
        });
    };

    const bandOf = (rank) => (rank <= 0.5) ? 'strong' : (rank <= 2 ? 'weak' : 'none');

    // Common alleles, for the picker. Frequencies are the rough European-ancestry phenotype
    // frequencies and are there only to order the list -- they are not used in any score.
    const COMMON_CLASS_I = [
        'HLA-A*02:01', 'HLA-A*01:01', 'HLA-A*03:01', 'HLA-A*24:02', 'HLA-A*11:01', 'HLA-A*26:01', 'HLA-A*68:01',
        'HLA-B*07:02', 'HLA-B*08:01', 'HLA-B*44:02', 'HLA-B*15:01', 'HLA-B*35:01', 'HLA-B*40:01',
        'HLA-B*51:01', 'HLA-B*27:05', 'HLA-B*57:01', 'HLA-B*58:01', 'HLA-C*07:01', 'HLA-C*07:02'
    ];
    const COMMON_CLASS_II = [
        'HLA-DRB1*15:01', 'HLA-DRB1*07:01', 'HLA-DRB1*03:01', 'HLA-DRB1*01:01', 'HLA-DRB1*04:01',
        'HLA-DRB1*11:01', 'HLA-DRB1*13:01', 'HLA-DRB1*04:04', 'HLA-DPB1*04:01', 'HLA-DQB1*03:01'
    ];

    return {
        W: W, BG_FREQ: BG_FREQ, MIN_RANK: MIN_RANK,
        alleles: alleles, known: known, info: info, normalise: normalise,
        COMMON_CLASS_I: COMMON_CLASS_I, COMMON_CLASS_II: COMMON_CLASS_II,
        predict: predict, bandOf: bandOf, coreMap: coreMap,
        setExternalPredictor: setExternalPredictor, hasExternalPredictor: hasExternalPredictor
    };
}
