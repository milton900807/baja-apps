function (graph, tracks, opts) {
    // COMPARE THE SEQUENCES OF THE SELECTED TRACKS — every pair aligned, in the browser.
    //
    //   await exec('baja/manchester/menu/compare-track-sequences.js', graph, tracks, { mode: 'protein' })
    //   await exec('baja/manchester/menu/compare-track-sequences.js', graph, tracks, { mode: 'nucleotide' })
    //   await exec('baja/manchester/menu/compare-track-sequences.js', graph, tracks, { mode: 'coding' })
    //
    // Selection ▸ Tracks ▸ Compare (N tracks) ▸ Sequences. Unlike "Across the tracks", which
    // matches bases by GENOMIC POSITION and so only compares tracks of the same region, this
    // ALIGNS the sequences, so it answers "how similar are these two genes" for different genes
    // too (SPTLC1 vs SPTLC2, a gene and its paralog, a human and a mouse ortholog).
    //
    //   protein     each track's translated ORF (track.orf), BLOSUM62, gap 11 + 1 per residue:
    //               the BLAST defaults, so the numbers read like a blastp result
    //   nucleotide  each track's coding sequence when it has an ORF, else the track's own
    //               sequence; +2 / -3, gap 5 + 2 per base (BLASTN), both strands tried
    //   coding      CODING SEQUENCES ONLY: tracks without an ORF are left out, and each pair is
    //               compared twice over the SAME region: the peptides are aligned, and the codons
    //               are laid under that alignment (a codon alignment, as for dN/dS). Aligning the
    //               DNA on its own finds only scraps between genes ~35% identical as protein; the
    //               codon alignment gives both identities for the same residues, and every
    //               differing codon is counted as silent (same amino acid) or replacing.
    //
    // LOCAL alignment (Smith-Waterman, affine gaps): two related proteins usually share a core
    // domain and differ at the ends, and a global alignment would bury the core's identity under
    // the ends. The panel therefore reports both identity OVER THE ALIGNED REGION and how much of
    // each sequence that region covers; the two together say "35% identical across 60% of it".
    //
    // The result opens in the help panel (baja/bio/decor-help.js): an identity matrix, one row per
    // pair, and each pair's alignment to expand. window.__bajaSeqCompare keeps the last run.
    return (async () => {
        const o = opts || {};
        const mode = (o.mode === 'nucleotide' || o.mode === 'coding') ? o.mode : 'protein';
        const tell = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const work = (m) => {
            try { window.__workStatus = m; if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh(); } catch (e) { }
        };
        const tks = (tracks || []).filter(Boolean);
        if (tks.length < 2) { tell('Select at least two tracks to compare their sequences.'); return false; }

        // ---- the sequences ---------------------------------------------------------------
        const orfOf = (t) => {
            let orf = null;
            try { orf = t.orf; } catch (e) { orf = null; }
            if (!orf || !orf.cdsi || !orf.cdsi.length) {
                try { if (t.generateORF) t.generateORF(); } catch (e) { }
                try { orf = t.orf; } catch (e) { orf = null; }
            }
            return (orf && orf.cdsi && orf.cdsi.length) ? orf : null;
        };
        const proteinOf = (t) => {
            const orf = orfOf(t);
            if (!orf) return '';
            if (orf.protein && typeof orf.protein === 'string') return orf.protein.replace(/[^A-Za-z]/g, '').toUpperCase();
            const out = [], seen = {};
            for (const c of orf.cdsi) {
                if (!c || c.ci !== 0 || seen[c.codon_index]) continue;
                seen[c.codon_index] = 1;
                const aa = '' + (c.aa || '');
                if (!aa || /^stop$/i.test(aa)) break;
                if (aa.length === 1) out.push(aa.toUpperCase());
                else if (/^start$/i.test(aa)) out.push('M');
            }
            return out.join('');
        };
        const codingOf = (t) => {
            const orf = orfOf(t);
            if (!orf) return '';
            const out = [], seen = {};
            // Codons after the stop can stay in cdsi without a residue (track.js generateORF stops
            // assigning aa at the stop), so the CDS ends at the first codon with none.
            for (const c of orf.cdsi) {
                if (!c || c.ci !== 0 || seen[c.codon_index] || !c.codon) continue;
                seen[c.codon_index] = 1;
                const aa = '' + (c.aa || '');
                if (!aa || /^stop$/i.test(aa)) break;
                out.push(('' + c.codon).toUpperCase());
            }
            return out.join('');
        };
        const basesOf = (t) => {
            try {
                if (!t.getSequenceRange) return '';
                return ('' + (t.getSequenceRange(Math.min(t.xi, t.xf), Math.max(t.xi, t.xf)) || '')).toUpperCase().replace(/[^ACGTUN]/g, '');
            } catch (e) { return ''; }
        };
        // Which alignments a run makes. 'aa' = peptides, 'nt' = nucleotides.
        const KINDS = mode === 'coding' ? ['aa', 'nt'] : (mode === 'protein' ? ['aa'] : ['nt']);
        // Coding mode: the peptide and the CDS come from ONE walk of cdsi, so residue k is codon k
        // and the codon alignment can be read straight off the peptide alignment.
        const codingPair = (t) => {
            const orf = orfOf(t);
            if (!orf) return null;
            const aa = [], nt = [], seen = {};
            for (const c of orf.cdsi) {
                if (!c || c.ci !== 0 || seen[c.codon_index] || !c.codon) continue;
                seen[c.codon_index] = 1;
                const a = '' + (c.aa || '');
                if (!a || /^stop$/i.test(a)) break;
                aa.push(a.length === 1 ? a.toUpperCase() : (/^start$/i.test(a) ? 'M' : 'X'));
                nt.push(('' + c.codon).toUpperCase());
            }
            return aa.length ? { aa: aa.join(''), nt: nt.join('') } : null;
        };
        const items = tks.map((t, i) => {
            const name = ('' + (t.name || ('track ' + (i + 1)))).trim();
            const it = { name, seqs: {}, what: [] };
            if (mode === 'coding') {
                const cp = codingPair(t);
                if (cp) { it.seqs = cp; it.what = cp.aa.length.toLocaleString() + ' aa · ' + cp.nt.length.toLocaleString() + ' nt coding sequence'; }
                else it.what = '';
                return it;
            }
            if (KINDS.indexOf('aa') >= 0) {
                const s = proteinOf(t);
                if (s) { it.seqs.aa = s; it.what.push(s.length.toLocaleString() + ' aa'); }
            }
            if (KINDS.indexOf('nt') >= 0) {
                const cds = codingOf(t);
                if (cds) { it.seqs.nt = cds; it.what.push(cds.length.toLocaleString() + ' nt coding sequence'); }
                else if (mode === 'nucleotide') {
                    const b = basesOf(t);
                    if (b) { it.seqs.nt = b; it.what.push(b.length.toLocaleString() + ' nt, whole track (no ORF)'); }
                }
            }
            it.what = it.what.join(' · ') + (mode === 'protein' && it.seqs.aa ? ', translated ORF' : '');
            return it;
        });
        const MINLEN = { aa: 10, nt: 20 };
        const usable = items.filter((x) => KINDS.every((k) => x.seqs[k] && x.seqs[k].length >= MINLEN[k]));
        const skipped = items.filter((x) => usable.indexOf(x) < 0);
        if (usable.length < 2) {
            tell(mode === 'nucleotide'
                ? 'Fewer than two of these tracks carry a sequence to compare.'
                : ('Fewer than two of these tracks have a coding sequence (an ORF) to compare.'
                    + (mode === 'protein' ? ' Try Sequences — nucleotide.' : '')));
            return false;
        }

        // ---- scoring -----------------------------------------------------------------------
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
        const KIND = {
            aa: { label: 'peptide', unit: 'aa', P: { M: B62, open: 11, ext: 1, idx: aaIdx }, prot: true, both: false, related: 0.25 },
            // A CDS is read in its sense orientation already, so only a whole-track comparison
            // tries the other strand.
            nt: { label: 'nucleotide', unit: 'nt', P: { M: NT, open: 5, ext: 2, idx: ntIdx }, prot: false, both: mode === 'nucleotide', related: 0.7 }
        };
        // The DP keeps one byte of traceback per cell; above this the pair is reported, not aligned.
        const MAX_CELLS = 60e6;

        // Smith-Waterman with affine gaps (Gotoh). A gap of length k costs open + k * ext.
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
        const revcomp = (s) => s.split('').reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A', U: 'A' }[c] || 'N')).join('');

        // Below this raw score a local alignment is chance: any two sequences share a few bases
        // (an ACGT repeat matched "100% over 4 nt" of every gene). Such a pair is reported as
        // having no significant similarity rather than as a tiny perfect match.
        const MIN_SCORE = { aa: 50, nt: 50 };

        // The codons of two coding sequences laid under their PEPTIDE alignment r.
        const codonAlign = (A, Bt, r) => {
            const na = [], nb = [], mid = [];
            let ia = r.a0 - 1, ib = r.b0 - 1, id = 0, gaps = 0, same = 0, silent = 0, replace = 0;
            for (let k = 0; k < r.ra.length; k++) {
                const x = r.ra[k], y = r.rb[k];
                const ca = x === '-' ? '---' : A.seqs.nt.substr(3 * ia++, 3);
                const cb = y === '-' ? '---' : Bt.seqs.nt.substr(3 * ib++, 3);
                na.push(ca); nb.push(cb);
                for (let q = 0; q < 3; q++) {
                    if (ca[q] === '-' || cb[q] === '-') { gaps++; mid.push(' '); }
                    else if (ca[q] === cb[q]) { id++; mid.push('|'); }
                    else mid.push(' ');
                }
                if (x !== '-' && y !== '-') {
                    if (ca === cb) same++; else if (x === y) silent++; else replace++;
                }
            }
            return {
                score: r.score, len: 3 * r.ra.length, id, pos: id, gaps,
                a0: 3 * (r.a0 - 1) + 1, a1: 3 * r.a1, b0: 3 * (r.b0 - 1) + 1, b1: 3 * r.b1,
                ra: na.join(''), rb: nb.join(''), mid: mid.join(''),
                codons: { same, silent, replace }, fromPeptide: true
            };
        };

        // ---- every pair, every kind ------------------------------------------------------------
        // pairs[i] = { x, y, res: { aa: result | { tooLong }, nt: ... } }
        const pairs = [];
        const total = usable.length * (usable.length - 1) / 2;
        let done = 0;
        for (let x = 0; x < usable.length; x++) {
            for (let y = x + 1; y < usable.length; y++) {
                const A = usable[x], Bt = usable[y];
                done++;
                const pr = { x, y, res: {} };
                for (const k of KINDS) {
                    const K = KIND[k], sa = A.seqs[k], sb = Bt.seqs[k];
                    if (mode === 'coding' && k === 'nt') {
                        const ra = pr.res.aa;
                        pr.res.nt = (ra && !ra.tooLong && ra.len) ? codonAlign(A, Bt, ra) : (ra && ra.tooLong ? { tooLong: true } : { len: 0 });
                        continue;
                    }
                    work('Aligning ' + A.name + ' with ' + Bt.name + (KINDS.length > 1 ? (' (' + K.label + ')') : '') + ' · ' + done + ' of ' + total + '…');
                    await new Promise((r) => setTimeout(r, 0));      // let the badge paint between alignments
                    if ((sa.length + 1) * (sb.length + 1) > MAX_CELLS) { pr.res[k] = { tooLong: true }; continue; }
                    let r = align(sa, sb, K), minus = false;
                    if (K.both) {
                        const rc = align(sa, revcomp(sb), K);
                        if (rc.score > r.score) {
                            r = rc; minus = true;
                            const L = sb.length;                   // report B's coordinates on its own strand
                            const b0 = L - r.b1 + 1, b1 = L - r.b0 + 1;
                            r.b0 = b1; r.b1 = b0;
                        }
                    }
                    r.minus = minus;
                    pr.res[k] = r;
                }
                pairs.push(pr);
            }
        }
        work('');

        // ---- the panel ---------------------------------------------------------------------
        const pct = (v) => (Math.round(v * 1000) / 10).toFixed(1) + '%';
        const pairOf = (x, y) => pairs.find((p) => (p.x === x && p.y === y) || (p.x === y && p.y === x));
        const cov = (p, k, which) => {
            const r = p.res[k];
            const L = usable[which === 'a' ? p.x : p.y].seqs[k].length;
            const span = which === 'a' ? (r.a1 - r.a0 + 1) : (Math.abs(r.b1 - r.b0) + 1);
            return span / L;
        };
        const weak = (r, k) => r && !r.tooLong && r.len && !r.fromPeptide && r.score < MIN_SCORE[k];
        const okK = (r, k) => r && !r.tooLong && r.len && !weak(r, k);
        const ok = (r) => r && !r.tooLong && r.len;
        const idOf = (r) => r.id / r.len;
        const short = (s) => (s.length > 16 ? s.slice(0, 15) + '…' : s);
        const two = KINDS.length > 1;
        const matrix = {
            caption: two
                ? 'Identity over the aligned region, peptide · nucleotide (coverage of the row gene\'s coding sequence underneath)'
                : 'Identity over the aligned region (coverage of the row sequence underneath)',
            cols: [''].concat(usable.map((u) => short(u.name))),
            rows: usable.map((u, x) => [short(u.name)].concat(usable.map((v, y) => {
                if (x === y) return '—';
                const p = pairOf(x, y);
                if (!p) return '';
                const w = p.x === x ? 'a' : 'b';
                const top = [], bot = [];
                for (const k of KINDS) {
                    const r = p.res[k];
                    if (!r || r.tooLong) { top.push('too long'); bot.push('—'); continue; }
                    if (!r.len || weak(r, k)) { top.push('none'); bot.push('—'); continue; }
                    top.push(pct(idOf(r)) + (two ? (' ' + KIND[k].unit) : ''));
                    bot.push(pct(cov(p, k, w)));
                }
                // coding: the codons follow the peptide alignment, so the coverage is the same number twice
                return top.join(' · ') + '\n' + (mode === 'coding' ? bot[0] : bot.join(' · ')) + ' cov';
            })))
        };
        const verdict = (p, k) => {
            const r = p.res[k], idf = idOf(r);
            const c = Math.min(cov(p, k, 'a'), cov(p, k, 'b')), cmax = Math.max(cov(p, k, 'a'), cov(p, k, 'b'));
            if (idf >= 0.98 && c >= 0.95) return 'Identical or nearly so';
            if (idf >= 0.95 && cmax >= 0.95) return 'One contains the other: the shorter lies almost unchanged within the longer';
            if (idf >= 0.6 && c >= 0.8) return 'Close relatives (paralogs or orthologs)';
            if (idf >= KIND[k].related) return c >= 0.5 ? 'Related: a shared core, different elsewhere' : 'Related over part of their length';
            return 'Little detectable similarity';
        };
        const sentence = (p, k) => {
            const A = usable[p.x], Bt = usable[p.y], r = p.res[k], K = KIND[k];
            const lead = two ? (K.label.charAt(0).toUpperCase() + K.label.slice(1) + ': ') : '';
            if (r.tooLong) return lead + 'too long to align here (' + A.seqs[k].length.toLocaleString() + ' × ' + Bt.seqs[k].length.toLocaleString() + ' ' + K.unit + ').';
            if (!r.len) return lead + 'no local alignment scored above zero.';
            if (weak(r, k)) return lead + 'no significant similarity (the best local match is ' + r.len + ' ' + K.unit + ', score ' + r.score + ', within what unrelated sequences share by chance).';
            return lead + pct(idOf(r)) + ' identical'
                + (K.prot ? (', ' + pct(r.pos / r.len) + ' similar') : '')
                + ' over ' + r.len.toLocaleString() + ' aligned ' + K.unit + (r.gaps ? (' (' + r.gaps + ' in gaps)') : '') + '; '
                + A.name + ' ' + r.a0 + '–' + r.a1 + ' (' + pct(cov(p, k, 'a')) + ') with '
                + Bt.name + ' ' + r.b0 + '–' + r.b1 + ' (' + pct(cov(p, k, 'b')) + ')'
                + (r.minus ? ', on the opposite strand' : '') + '.'
                + (r.fromPeptide ? ' Codons laid under the peptide alignment.' : '');
        };
        // Coding only: what the two identities say together. Silent (synonymous) differences
        // lower the nucleotide identity without touching the peptide.
        const reading = (p) => {
            const n = p.res.nt;
            if (!n || !n.codons) return '';
            const c = n.codons, diff = c.silent + c.replace;
            if (!diff) return 'Every aligned codon is identical.';
            if (!c.replace) return 'Same peptide from a different coding sequence: all ' + c.silent + ' differing codons are silent.';
            return 'Of ' + diff.toLocaleString() + ' differing codons, ' + c.silent.toLocaleString() + ' are silent (same amino acid) and '
                + c.replace.toLocaleString() + ' change the amino acid'
                + (c.silent / diff >= 0.5 ? ': most change is silent, so selection has conserved the protein.' : '.');
        };
        const rows = [];
        for (const p of pairs) {
            const A = usable[p.x], Bt = usable[p.y];
            const main = KINDS.find((k) => okK(p.res[k], k));
            const head = A.name + ' vs ' + Bt.name + KINDS.map((k) => okK(p.res[k], k) ? (' · ' + pct(idOf(p.res[k])) + (two ? (' ' + KIND[k].unit) : '')) : '').join('');
            const parts = KINDS.map((k) => sentence(p, k));
            if (two) { const rd = reading(p); if (rd) parts.push(rd); }
            parts.push(main ? (verdict(p, main) + '.') : 'Little detectable similarity.');
            rows.push([head, parts.join(' ')]);
        }
        const inputs = usable.map((u) => [u.name, u.what]);
        for (const sk of skipped) inputs.push([sk.name, mode === 'nucleotide' ? 'No sequence: left out.' : 'No coding sequence (ORF): left out.']);

        const block = (p, k) => {
            const A = usable[p.x], Bt = usable[p.y], r = p.res[k];
            const W = 60, lines = [];
            let ia = r.a0, ib = r.minus ? r.b1 : r.b0;
            const stepB = r.minus ? -1 : 1;
            const pad = Math.max(A.name.length, Bt.name.length, 4);
            for (let q = 0; q < r.ra.length; q += W) {
                const sa = r.ra.slice(q, q + W), sb = r.rb.slice(q, q + W), sm = r.mid.slice(q, q + W);
                const na = sa.replace(/-/g, '').length, nb = sb.replace(/-/g, '').length;
                lines.push(A.name.padEnd(pad) + ' ' + String(ia).padStart(6) + ' ' + sa + ' ' + (ia + na - 1));
                lines.push(' '.repeat(pad) + ' ' + ' '.repeat(6) + ' ' + sm);
                lines.push(Bt.name.padEnd(pad) + ' ' + String(ib).padStart(6) + ' ' + sb + ' ' + (ib + stepB * (nb - 1)));
                lines.push('');
                ia += na; ib += stepB * nb;
            }
            return lines.join('\n');
        };
        const details = [];
        for (const p of pairs) for (const k of KINDS) if (okK(p.res[k], k)) details.push({
            summary: 'Alignment' + (two ? (' (' + (k === 'nt' ? 'codons' : KIND[k].label) + ')') : '') + ': ' + usable[p.x].name + ' vs ' + usable[p.y].name,
            pre: block(p, k)
        });

        const about = [['identity', 'Identical positions divided by the aligned length, gaps included. It is measured only over the aligned region; coverage says how much of each sequence that region spans.']];
        if (KINDS.indexOf('aa') >= 0) about.push(['similar', 'Identical plus conservative substitutions (a positive BLOSUM62 score, e.g. I↔V, K↔R), as blastp reports "positives".']);
        if (two) about.push(['peptide vs nucleotide', 'The nucleotide identity is read from the codons under the peptide alignment, so both cover the same residues. A differing codon is silent when it still codes the same amino acid (usually a third-position change) and replacing when it does not.']);
        if (mode === 'nucleotide') about.push(['strands', 'Each pair is aligned on both strands and the better one is kept.']);
        about.push(['how', 'Local alignment (Smith-Waterman) with affine gaps. '
            + (KINDS.indexOf('aa') >= 0 ? 'Peptides: BLOSUM62, gap open 11 + 1 per residue (the blastp defaults, without its composition adjustment, so identities can differ from BLAST by a few residues). ' : '')
            + (mode === 'coding' ? 'Codons: taken from the peptide alignment, not aligned separately.'
                : (KINDS.indexOf('nt') >= 0 ? 'Nucleotides: match +2, mismatch -3, gap open 5 + 2 per base (BLASTN scores).' : ''))
            + ' Matches scoring under ' + MIN_SCORE[KINDS[0]] + ' are treated as chance.']);

        const help = {
            title: 'Sequence comparison: ' + usable.length + ' tracks, '
                + ({ protein: 'protein', nucleotide: 'nucleotide', coding: 'coding sequences (peptide and nucleotide)' }[mode]),
            table: matrix,
            rows: rows.concat(inputs).concat(about),
            details: details,
            note: 'A local alignment finds the most similar region, so two proteins that share one domain can be ~35% identical over that domain and unrelated elsewhere; read identity together with coverage.'
        };
        try {
            window.__bajaSeqCompare = {
                mode, kinds: KINDS,
                tracks: usable.map((u) => ({ name: u.name, lengths: Object.fromEntries(KINDS.map((k) => [k, u.seqs[k].length])) })),
                pairs: pairs.map((p) => ({ a: usable[p.x].name, b: usable[p.y].name, res: p.res }))
            };
        } catch (e) { }
        try { graph.setMessage(' '); } catch (e) { }
        try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
        catch (e) {
            const p = pairs.find((q) => KINDS.some((k) => okK(q.res[k], k)));
            tell(p ? (usable[p.x].name + ' vs ' + usable[p.y].name + ': ' + KINDS.filter((k) => okK(p.res[k], k)).map((k) => pct(idOf(p.res[k])) + ' ' + KIND[k].unit).join(', ') + ' identical.') : 'No similarity found.');
        }
        return true;
    })();
}
