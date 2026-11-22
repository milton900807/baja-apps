function () {

    // ONE LOCAL ALIGNER, USED BY EVERYTHING THAT NEEDS ONE.
    //   const AL = await exec('baja/bio/protein/align-local.js');
    //   const r = AL.align(peptideA, peptideB, AL.KIND.aa);   // { score, len, id, pos, gaps, ... }
    //
    // Smith-Waterman with affine gaps (Gotoh), BLOSUM62 for peptides and a simple match
    // matrix for nucleotides, with the blastp gap costs. A gap of length k costs
    // open + k * ext.
    //
    // It lived inside the track comparison panel, which is where it was first needed. The
    // exon plan search needs the same alignment hundreds of times to rank plans, and
    // copying it there would have been two aligners with the same name and slowly
    // diverging numbers: one plan scored 61% by one and 59% by the other is an
    // unanswerable bug report. The panel now takes it from here too.
    //
    // The backend aligner (py/bio/protein/align-proteins.py) is still what reports a final
    // identity, because its numbers are the ones that read like a blastp result. This is
    // for the hundreds of alignments in between, which never reach the screen as numbers.

    const api = {};
    const AA = 'ARNDCQEGHILKMFPSTWYVBZX*';
    const B62 = [
        [4, -1, -2, -2, 0, -1, -1, 0, -2, -1, -1, -1, -1, -2, -1, 1, 0, -3, -2, 0, -2, -1, 0, -4],
        [-1, 5, 0, -2, -3, 1, 0, -2, 0, -3, -2, 2, -1, -3, -2, -1, -1, -3, -2, -3, -1, 0, -1, -4],
        [-2, 0, 6, 1, -3, 0, 0, 0, 1, -3, -3, 0, -2, -3, -2, 1, 0, -4, -2, -3, 3, 0, -1, -4],
        [-2, -2, 1, 6, -3, 0, 2, -1, -1, -3, -4, -1, -3, -3, -1, 0, -1, -4, -3, -3, 4, 1, -1, -4],
        [0, -3, -3, -3, 9, -3, -4, -3, -3, -1, -1, -3, -1, -2, -3, -1, -1, -2, -2, -1, -3, -3, -2, -4],
        [-1, 1, 0, 0, -3, 5, 2, -2, 0, -3, -2, 1, 0, -3, -1, 0, -1, -2, -1, -2, 0, 3, -1, -4],
        [-1, 0, 0, 2, -4, 2, 5, -2, 0, -3, -3, 1, -2, -3, -1, 0, -1, -3, -2, -2, 1, 4, -1, -4],
        [0, -2, 0, -1, -3, -2, -2, 6, -2, -4, -4, -2, -3, -3, -2, 0, -2, -2, -3, -3, -1, -2, -1, -4],
        [-2, 0, 1, -1, -3, 0, 0, -2, 8, -3, -3, -1, -2, -1, -2, -1, -2, -2, 2, -3, 0, 0, -1, -4],
        [-1, -3, -3, -3, -1, -3, -3, -4, -3, 4, 2, -3, 1, 0, -3, -2, -1, -3, -1, 3, -3, -3, -1, -4],
        [-1, -2, -3, -4, -1, -2, -3, -4, -3, 2, 4, -2, 2, 0, -3, -2, -1, -2, -1, 1, -4, -3, -1, -4],
        [-1, 2, 0, -1, -3, 1, 1, -2, -1, -3, -2, 5, -1, -3, -1, 0, -1, -3, -2, -2, 0, 1, -1, -4],
        [-1, -1, -2, -3, -1, 0, -2, -3, -2, 1, 2, -1, 5, 0, -2, -1, -1, -1, -1, 1, -3, -1, -1, -4],
        [-2, -3, -3, -3, -2, -3, -3, -3, -1, 0, 0, -3, 0, 6, -4, -2, -2, 1, 3, -1, -3, -3, -1, -4],
        [-1, -2, -2, -1, -3, -1, -1, -2, -2, -3, -3, -1, -2, -4, 7, -1, -1, -4, -3, -2, -2, -1, -2, -4],
        [1, -1, 1, 0, -1, 0, 0, 0, -1, -2, -2, 0, -1, -2, -1, 4, 1, -3, -2, -2, 0, 0, 0, -4],
        [0, -1, 0, -1, -1, -1, -1, -2, -2, -1, -1, -1, -1, -2, -1, 1, 5, -2, -2, 0, -1, -1, 0, -4],
        [-3, -3, -4, -4, -2, -2, -3, -2, -2, -3, -2, -3, -1, 1, -4, -3, -2, 11, 2, -3, -4, -3, -2, -4],
        [-2, -2, -2, -3, -2, -1, -2, -3, 2, -1, -1, -2, -1, 3, -3, -2, -2, 2, 7, -1, -3, -2, -1, -4],
        [0, -3, -3, -3, -1, -2, -2, -3, -3, 3, 1, -2, 1, -1, -2, -2, 0, -3, -1, 4, -3, -2, -1, -4],
        [-2, -1, 3, 4, -3, 0, 1, -1, 0, -3, -4, 0, -3, -3, -2, 0, -1, -4, -3, -3, 4, 1, -1, -4],
        [-1, 0, 0, 1, -3, 3, 4, -2, 0, -3, -3, 1, -1, -3, -1, 0, -1, -3, -2, -2, 1, 4, -1, -4],
        [0, -1, -1, -1, -2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -2, 0, 0, -2, -1, -1, -1, -1, -1, -4],
        [-4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, -4, 1]
    ];
    const aaIdx = (s) => Int8Array.from(s, (c) => { const k = AA.indexOf(c); return k < 0 ? 22 : k; });
    const ntIdx = (s) => Int8Array.from(s, (c) => ({ A: 0, C: 1, G: 2, T: 3, U: 3 }[c] ?? 4));
    const NT = [[2, -3, -3, -3, 0], [-3, 2, -3, -3, 0], [-3, -3, 2, -3, 0], [-3, -3, -3, 2, 0], [0, 0, 0, 0, 0]];

    // The DP keeps one byte of traceback per cell; above this the pair is reported, not aligned.
    const MAX_CELLS = 60e6;

    // Traceback byte: bits 0-1 where H came from (0 start, 1 diagonal, 2 E = gap in a,
    // 3 F = gap in b); bit 2 E extended; bit 3 F extended.
    const align = (a, b, K) => {
        const P = K.P;
        const A = P.idx(a), Bq = P.idx(b), M = P.M;
        const n = A.length, m = Bq.length;
        const GO = P.open + P.ext, GE = P.ext;
        const tb = new Uint8Array((n + 1) * (m + 1));
        let Hp = new Int32Array(m + 1), Hc = new Int32Array(m + 1);
        const F = new Int32Array(m + 1).fill(-1e9);
        let best = 0, bi = 0, bj = 0;
        for (let i = 1; i <= n; i++) {
            const row = M[A[i - 1]];
            let E = -1e9;
            Hc[0] = 0;
            const base = i * (m + 1);
            for (let j = 1; j <= m; j++) {
                let code = 0;
                const eo = Hc[j - 1] - GO, ee = E - GE;
                if (ee > eo) { E = ee; code |= 4; } else E = eo;
                const fo = Hp[j] - GO, fe = F[j] - GE;
                if (fe > fo) { F[j] = fe; code |= 8; } else F[j] = fo;
                let h = Hp[j - 1] + row[Bq[j - 1]], src = 1;
                if (E > h) { h = E; src = 2; }
                if (F[j] > h) { h = F[j]; src = 3; }
                if (h <= 0) { h = 0; src = 0; }
                Hc[j] = h;
                tb[base + j] = code | src;
                if (h > best) { best = h; bi = i; bj = j; }
            }
            const t = Hp; Hp = Hc; Hc = t;
        }
        // traceback
        let i = bi, j = bj, state = 0;
        const ra = [], rb = [];
        while (i > 0 && j > 0) {
            const c = tb[i * (m + 1) + j];
            if (state === 0) {
                const src = c & 3;
                if (src === 0) break;
                if (src === 1) { ra.push(a[i - 1]); rb.push(b[j - 1]); i--; j--; continue; }
                state = src === 2 ? 1 : 2;
                continue;
            }
            if (state === 1) { ra.push('-'); rb.push(b[j - 1]); state = (c & 4) ? 1 : 0; j--; continue; }
            ra.push(a[i - 1]); rb.push('-'); state = (c & 8) ? 2 : 0; i--;
        }
        ra.reverse(); rb.reverse();
        let id = 0, pos = 0, gaps = 0;
        const mid = [];
        for (let k = 0; k < ra.length; k++) {
            const x = ra[k], y = rb[k];
            if (x === '-' || y === '-') { gaps++; mid.push(' '); continue; }
            if (x === y) { id++; pos++; mid.push(K.prot ? x : '|'); continue; }
            if (K.prot) {
                const s = M[AA.indexOf(x) < 0 ? 22 : AA.indexOf(x)][AA.indexOf(y) < 0 ? 22 : AA.indexOf(y)];
                if (s > 0) { pos++; mid.push('+'); continue; }
            }
            mid.push(' ');
        }
        return {
            score: best, len: ra.length, id, pos, gaps,
            a0: i + 1, a1: bi, b0: j + 1, b1: bj,          // 1-based, inclusive
            ra: ra.join(''), rb: rb.join(''), mid: mid.join('')
        };
    };
    api.AA = AA; api.B62 = B62; api.NT = NT;
    api.aaIdx = aaIdx; api.ntIdx = ntIdx; api.MAX_CELLS = MAX_CELLS;
    api.align = align;
    // The two parameter sets, so a caller does not assemble them and get the gap costs
    // subtly wrong. `both` (try the other strand too) is the caller's business, not this
    // module's, so it is not set here.
    api.KIND = {
        aa: { label: 'peptide', unit: 'aa', P: { M: B62, open: 11, ext: 1, idx: aaIdx }, prot: true, related: 0.25 },
        nt: { label: 'nucleotide', unit: 'nt', P: { M: NT, open: 5, ext: 2, idx: ntIdx }, prot: false, related: 0.7 }
    };
    return api;
}
