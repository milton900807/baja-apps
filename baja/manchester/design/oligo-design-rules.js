function () {

    // ---- primitives -------------------------------------------------------

    const clean = (s) => String(s || '').toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
    const toRNA = (s) => String(s || '').toUpperCase().replace(/T/g, 'U');

    const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
    const revComp = (s) => clean(s).split('').reverse().map((b) => COMP[b] || 'N').join('');

    const gcFraction = (s) => {
        const c = clean(s);
        if (!c.length) return 0;
        let gc = 0;
        for (const b of c) if (b === 'G' || b === 'C') gc++;
        return gc / c.length;
    };
    const gcPercent = (s) => Math.round(gcFraction(s) * 1000) / 10;

    // Melting temperature. Wallace rule for short oligos (<14 nt); the 64.9/41
    // GC formula for longer oligos (a reasonable DNA approximation for design
    // triage — not a substitute for full nearest-neighbour thermodynamics).
    const meltingTemp = (s) => {
        const c = clean(s);
        const n = c.length;
        if (!n) return 0;
        let gc = 0, at = 0;
        for (const b of c) (b === 'G' || b === 'C') ? gc++ : at++;
        let tm = n < 14 ? (2 * at + 4 * gc) : (64.9 + 41 * (gc - 16.4) / n);
        return Math.round(tm * 10) / 10;
    };

    const longestRun = (s, base) => {
        const c = clean(s);
        let best = 0, cur = 0;
        for (const b of c) {
            if (b === base) { cur++; if (cur > best) best = cur; }
            else cur = 0;
        }
        return best;
    };
    const maxHomopolymer = (s) => Math.max(
        longestRun(s, 'A'), longestRun(s, 'T'), longestRun(s, 'G'), longestRun(s, 'C')
    );

    const countCpG = (s) => {
        const c = clean(s);
        let n = 0;
        for (let i = 0; i + 1 < c.length; i++) if (c[i] === 'C' && c[i + 1] === 'G') n++;
        return n;
    };

    // GU-rich (immunostimulatory) content — assessed on the RNA sequence.
    const guRichFraction = (s) => {
        const r = toRNA(s);
        if (!r.length) return 0;
        let n = 0;
        for (const b of r) if (b === 'G' || b === 'U') n++;
        return n / r.length;
    };

    // Longest self-complementary / palindromic stretch: the longest suffix-region
    // that base-pairs with the reverse complement of the sequence (proxy for
    // hairpin / self-structure liability).
    const selfComplementScore = (s) => {
        const c = clean(s);
        const rc = revComp(c);
        // longest common substring between c and rc (>=4 => real hairpin risk)
        let best = 0;
        const n = c.length;
        const dp = new Array(n + 1).fill(0);
        for (let i = 1; i <= n; i++) {
            let prev = 0;
            for (let j = 1; j <= n; j++) {
                const tmp = dp[j];
                if (c[i - 1] === rc[j - 1]) { dp[j] = prev + 1; if (dp[j] > best) best = dp[j]; }
                else dp[j] = 0;
                prev = tmp;
            }
        }
        return best;
    };

    // Triangular scorer: full points inside [lo,hi], falling to 0 at [lo-pad,hi+pad].
    const window01 = (x, lo, hi, pad) => {
        if (x >= lo && x <= hi) return 1;
        if (x < lo) return Math.max(0, 1 - (lo - x) / pad);
        return Math.max(0, 1 - (x - hi) / pad);
    };

    // ---- shared "avoid" liabilities (motifs common to all modalities) ------

    function motifPenalties(seq, opts) {
        const o = opts || {};
        const notes = [];
        let penalty = 0;

        const cpg = countCpG(seq);
        if (cpg > 0) { penalty += Math.min(12, 4 * cpg); notes.push({ rule: 'CpG motif', pass: false, note: cpg + ' CpG (immune/TLR9 liability)' }); }
        else notes.push({ rule: 'CpG motif', pass: true, note: 'none' });

        const gRun = longestRun(seq, 'G');
        const gCap = o.gRunCap || 3;
        if (gRun > gCap) { penalty += 4 * (gRun - gCap); notes.push({ rule: 'G-run', pass: false, note: 'run of ' + gRun + ' G (G-quadruplex risk)' }); }
        else notes.push({ rule: 'G-run', pass: true, note: 'max ' + gRun });

        const homo = maxHomopolymer(seq);
        if (homo >= 5) { penalty += 3 * (homo - 4); notes.push({ rule: 'homopolymer', pass: false, note: 'run of ' + homo }); }

        const self = selfComplementScore(seq);
        if (self >= 5) { penalty += 3 * (self - 4); notes.push({ rule: 'self-complementarity', pass: false, note: 'palindrome/hairpin len ' + self }); }
        else notes.push({ rule: 'self-complementarity', pass: true, note: 'max ' + self });

        return { penalty, notes };
    }

    // ---- siRNA scoring (double-stranded RISC substrate) --------------------
    //
    // window (target sense) -> sense/passenger; revComp(window) -> antisense/guide.
    // Encodes GC-content, thermodynamic asymmetry (Schwarz/Khvorova), Ui-Tei end
    // preferences, Reynolds positional preferences and seed (pos 2-8) low-GC.

    function scoreSiRNA(sense) {
        const s = clean(sense);              // sense/passenger, 5'->3'
        const n = s.length;
        const guide = revComp(s);            // antisense/guide, 5'->3'
        const detail = [];
        let score = 0;

        // GC content 30-50% (Reynolds/Sioud)
        const gc = gcFraction(s);
        const gcPts = 20 * window01(gc, 0.30, 0.52, 0.18);
        score += gcPts;
        detail.push({ rule: 'GC 30-52%', pass: gc >= 0.30 && gc <= 0.52, note: gcPercent(s) + '%', points: Math.round(gcPts) });

        // Thermodynamic asymmetry: guide 5' end low stability (A/U), sense 5' end
        // high stability (G/C). Compare AU-count in the first 4 nt of each 5' end.
        const guide5 = guide.slice(0, 4);
        const sense5 = s.slice(0, 4);
        const auCount = (x) => x.split('').filter((b) => b === 'A' || b === 'T').length;
        const asym = auCount(guide5) - auCount(sense5);      // want positive
        const asymPts = 16 * window01(asym, 2, 4, 3);
        score += asymPts;
        detail.push({ rule: 'thermodynamic asymmetry', pass: asym >= 1, note: 'guide5′ AU ' + auCount(guide5) + ' vs sense5′ AU ' + auCount(sense5), points: Math.round(asymPts) });

        // Ui-Tei: A/U at antisense position 1 (== sense position n is A/U)
        const g1 = guide[0];
        const uiA = (g1 === 'A' || g1 === 'T');
        if (uiA) { score += 8; }
        detail.push({ rule: 'guide 5′ A/U (Ui-Tei I)', pass: uiA, note: 'pos1 guide = ' + toRNA(g1 || ''), points: uiA ? 8 : 0 });

        // Ui-Tei: G/C at sense 5' end (position 1)
        const s1 = s[0];
        const uiG = (s1 === 'G' || s1 === 'C');
        if (uiG) { score += 6; }
        detail.push({ rule: 'sense 5′ G/C (Ui-Tei II)', pass: uiG, note: 'pos1 sense = ' + s1, points: uiG ? 6 : 0 });

        // Seed region = guide positions 2-8. Low GC reduces seed-mediated
        // off-target; A/U-rich seed preferred (book: seed is main off-target source).
        const seed = guide.slice(1, 8);
        const seedGc = gcFraction(seed);
        const seedPts = 14 * (1 - Math.min(1, Math.max(0, (seedGc - 0.28) / 0.5)));
        score += seedPts;
        detail.push({ rule: 'seed (guide 2-8) low GC', pass: seedGc <= 0.57, note: 'seed GC ' + gcPercent(seed) + '%', points: Math.round(seedPts) });

        // Reynolds positional preferences (on the sense strand, 1-based):
        // A@3, A@19, U@10, no G/C@19, no G@13.  Scaled to available length.
        let reyn = 0; const reynNotes = [];
        const at = (pos) => s[pos - 1];
        if (n >= 3 && at(3) === 'A') { reyn += 2; reynNotes.push('A@3'); }
        if (n >= 19 && at(19) === 'A') { reyn += 2; reynNotes.push('A@19'); }
        if (n >= 10 && at(10) === 'T') { reyn += 2; reynNotes.push('U@10'); }
        if (n >= 19 && !(at(19) === 'G' || at(19) === 'C')) { reyn += 2; reynNotes.push('no G/C@19'); }
        if (n >= 13 && at(13) !== 'G') { reyn += 2; reynNotes.push('no G@13'); }
        score += reyn;
        detail.push({ rule: 'Reynolds positions', pass: reyn >= 6, note: reynNotes.join(', ') || 'none', points: reyn });

        // No long GC stretch (Ui-Tei IV): >9 contiguous G/C is disallowed.
        let gcRun = 0, gcRunMax = 0;
        for (const b of s) { if (b === 'G' || b === 'C') { gcRun++; gcRunMax = Math.max(gcRunMax, gcRun); } else gcRun = 0; }
        if (gcRunMax <= 9) { score += 4; }
        else { detail.push({ rule: 'GC stretch ≤9', pass: false, note: 'run ' + gcRunMax }); }

        // GU-rich immunostimulatory penalty (guide strand, RNA).
        const gu = guRichFraction(guide);
        if (gu > 0.6) { score -= 6; detail.push({ rule: 'GU-rich immunostim', pass: false, note: Math.round(gu * 100) + '% GU' }); }

        // Shared motif liabilities on the guide (CpG, G-runs, palindromes).
        const mp = motifPenalties(guide, { gRunCap: 3 });
        score -= mp.penalty;
        for (const nt of mp.notes) detail.push(nt);

        return { score: Math.round(Math.max(0, Math.min(100, score + 20))), detail, guide: toRNA(guide), sense: toRNA(s) };
    }

    // ---- gapmer (RNase-H) ASO scoring --------------------------------------
    //   oligo = revComp(window). GC 40-60%, Tm 55-65C, avoid structure/repeats,
    //   avoid CpG / long G runs / palindromes / self-complementarity.

    function scoreGapmer(targetWindow) {
        const aso = revComp(targetWindow);       // the antisense oligo, DNA sense
        const detail = [];
        let score = 30;

        const gc = gcFraction(aso);
        const gcPts = 26 * window01(gc, 0.40, 0.60, 0.15);
        score += gcPts;
        detail.push({ rule: 'GC 40-60%', pass: gc >= 0.40 && gc <= 0.60, note: gcPercent(aso) + '%', points: Math.round(gcPts) });

        const tm = meltingTemp(aso);
        const tmPts = 26 * window01(tm, 55, 65, 10);
        score += tmPts;
        detail.push({ rule: 'Tm 55-65°C', pass: tm >= 55 && tm <= 65, note: tm + '°C', points: Math.round(tmPts) });

        const mp = motifPenalties(aso, { gRunCap: 3 });   // avoid CpG, G-runs, palindromes
        score -= mp.penalty;
        for (const nt of mp.notes) detail.push(nt);

        return { score: Math.round(Math.max(0, Math.min(100, score))), detail, oligo: aso };
    }

    // ---- steric-blocking / splice-switching ASO scoring --------------------
    //   Fully-modified single strand; GC 40-60%, strong binding (higher Tm ok),
    //   target start codon / splice regulatory element (bonus), avoid CpG/G-runs/
    //   self-complementarity. Immune-motif tolerance is a little looser (no DNA gap).

    function scoreSteric(targetWindow, ctx) {
        const aso = revComp(targetWindow);
        const detail = [];
        let score = 30;

        const gc = gcFraction(aso);
        const gcPts = 24 * window01(gc, 0.40, 0.60, 0.18);
        score += gcPts;
        detail.push({ rule: 'GC 40-60%', pass: gc >= 0.40 && gc <= 0.60, note: gcPercent(aso) + '%', points: Math.round(gcPts) });

        // Strong, stable binding is desirable (steric block relies on occupancy).
        const tm = meltingTemp(aso);
        const tmPts = 22 * window01(tm, 58, 80, 12);
        score += tmPts;
        detail.push({ rule: 'strong binding (Tm ≥58)', pass: tm >= 58, note: tm + '°C', points: Math.round(tmPts) });

        // Bonus if the target window overlaps a start codon or an annotated splice
        // regulatory element (see designOligos: ctx.motifHits carries these).
        if (ctx && ctx.regulatory) {
            score += 14;
            detail.push({ rule: 'targets regulatory element', pass: true, note: ctx.regulatory, points: 14 });
        }

        const mp = motifPenalties(aso, { gRunCap: 4 });   // slightly looser G-run cap
        score -= mp.penalty;
        for (const nt of mp.notes) detail.push(nt);

        return { score: Math.round(Math.max(0, Math.min(100, score))), detail, oligo: aso };
    }

    // ---- tiling + ranking --------------------------------------------------

    // Length defaults per modality (book): siRNA duplex core 19 (21 w/ overhangs),
    // gapmer 16-20, steric 15-25.
    const DEFAULT_LEN = { sirna: 19, gapmer: 20, steric: 20 };

    // Locate start codons (ATG) and simple splice-regulatory landmarks in the
    // target so the steric scorer can reward them.
    function regulatoryMap(target) {
        const t = clean(target);
        const starts = [];
        for (let i = 0; i + 2 < t.length; i++) if (t[i] === 'A' && t[i + 1] === 'T' && t[i + 2] === 'G') starts.push(i);
        return { starts };
    }

    // designOligos(target, options)
    //   options.type   'sirna' | 'gapmer' | 'steric'   (default 'gapmer')
    //   options.length window length (defaults per type)
    //   options.step   tiling step (default 1)
    //   options.top    max candidates to return (default 25)
    //   options.avoidStart  siRNA: penalise windows over a start codon (default true)
    function designOligos(target, options) {
        const o = options || {};
        const type = (o.type || 'gapmer').toLowerCase();
        const L = o.length || DEFAULT_LEN[type] || 20;
        const step = o.step || 1;
        const top = o.top || 25;
        const t = clean(target);
        if (t.length < L) return [];

        const reg = regulatoryMap(t);
        const startSet = {};
        for (const s of reg.starts) startSet[s] = true;

        const out = [];
        for (let i = 0; i + L <= t.length; i += step) {
            const win = t.substr(i, L);
            if (win.length < L) break;

            let res, ctx = {};
            if (type === 'sirna') {
                res = scoreSiRNA(win);
                if (o.avoidStart !== false) {
                    // penalise if window spans an ATG start codon region
                    for (let k = i; k < i + L; k++) if (startSet[k]) { res.score = Math.max(0, res.score - 8); res.detail.push({ rule: 'avoid start codon', pass: false, note: 'spans AUG at ' + k }); break; }
                }
            } else if (type === 'steric') {
                // regulatory bonus: window overlaps a start codon
                for (let k = i; k < i + L; k++) if (startSet[k]) { ctx.regulatory = 'start codon (AUG @' + k + ')'; break; }
                res = scoreSteric(win, ctx);
            } else {
                res = scoreGapmer(win);
            }

            out.push({
                type,
                start: i,               // 0-based offset into the target sequence
                end: i + L,
                length: L,
                targetWindow: toRNA(win),
                score: res.score,
                detail: res.detail,
                guide: res.guide || null,
                sense: res.sense || null,
                oligo: res.oligo || null    // antisense oligo sequence (ASO types)
            });
        }

        out.sort((a, b) => b.score - a.score);
        return out.slice(0, top);
    }

    return {
        // primitives (exposed for reuse / testing)
        clean, toRNA, revComp, gcFraction, gcPercent, meltingTemp,
        longestRun, maxHomopolymer, countCpG, selfComplementScore, guRichFraction,
        // scorers
        scoreSiRNA, scoreGapmer, scoreSteric,
        // main entry
        designOligos,
        DEFAULT_LEN
    };
}
