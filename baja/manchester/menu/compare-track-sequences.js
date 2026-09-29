function (graph, tracks, opts) {
    // COMPARE THE SEQUENCES OF THE SELECTED TRACKS — every pair aligned, in the browser.
    //
    //   await exec('baja/manchester/menu/compare-track-sequences.js', graph, tracks, { mode: 'protein' })
    //   await exec('baja/manchester/menu/compare-track-sequences.js', graph, tracks, { mode: 'nucleotide' })
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
        const mode = o.mode === 'nucleotide' ? 'nucleotide' : 'protein';
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
        const items = tks.map((t, i) => {
            const name = ('' + (t.name || ('track ' + (i + 1)))).trim();
            if (mode === 'protein') {
                const s = proteinOf(t);
                return { name, seq: s, what: s ? (s.length + ' aa, translated ORF') : '' };
            }
            const cds = codingOf(t);
            if (cds) return { name, seq: cds, what: cds.length.toLocaleString() + ' nt, coding sequence' };
            const b = basesOf(t);
            return { name, seq: b, what: b ? (b.length.toLocaleString() + ' nt, whole track') : '' };
        });
        const usable = items.filter((x) => x.seq && x.seq.length >= (mode === 'protein' ? 10 : 20));
        const skipped = items.filter((x) => usable.indexOf(x) < 0);
        if (usable.length < 2) {
            tell(mode === 'protein'
                ? 'Fewer than two of these tracks have a protein (an ORF) to compare. Try Sequences — nucleotide.'
                : 'Fewer than two of these tracks carry a sequence to compare.');
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
        const P = mode === 'protein'
            ? { M: B62, open: 11, ext: 1, idx: aaIdx }
            : { M: NT, open: 5, ext: 2, idx: ntIdx };
        // The DP keeps one byte of traceback per cell; above this the pair is reported, not aligned.
        const MAX_CELLS = 60e6;

        // Smith-Waterman with affine gaps (Gotoh). A gap of length k costs open + k * ext.
        // Traceback byte: bits 0-1 where H came from (0 start, 1 diagonal, 2 E = gap in a,
        // 3 F = gap in b); bit 2 E extended; bit 3 F extended.
        const align = (a, b) => {
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
                if (x === y) { id++; pos++; mid.push(mode === 'protein' ? x : '|'); continue; }
                if (mode === 'protein') {
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

        // ---- every pair ----------------------------------------------------------------------
        const pairs = [];
        const total = usable.length * (usable.length - 1) / 2;
        let done = 0;
        for (let x = 0; x < usable.length; x++) {
            for (let y = x + 1; y < usable.length; y++) {
                const A = usable[x], Bt = usable[y];
                done++;
                work('Aligning ' + A.name + ' with ' + Bt.name + ' · ' + done + ' of ' + total + '…');
                await new Promise((r) => setTimeout(r, 0));      // let the badge paint between pairs
                if ((A.seq.length + 1) * (Bt.seq.length + 1) > MAX_CELLS) {
                    pairs.push({ x, y, tooLong: true });
                    continue;
                }
                let r = align(A.seq, Bt.seq), minus = false;
                if (mode === 'nucleotide') {
                    const rc = align(A.seq, revcomp(Bt.seq));
                    if (rc.score > r.score) {
                        r = rc; minus = true;
                        const L = Bt.seq.length;               // report B's coordinates on its own strand
                        const b0 = L - r.b1 + 1, b1 = L - r.b0 + 1;
                        r.b0 = b1; r.b1 = b0;
                    }
                }
                r.minus = minus;
                pairs.push(Object.assign({ x, y }, r));
            }
        }
        work('');

        // ---- the panel ---------------------------------------------------------------------
        const unit = mode === 'protein' ? 'aa' : 'nt';
        const pct = (v) => (Math.round(v * 1000) / 10).toFixed(1) + '%';
        const pairOf = (x, y) => pairs.find((p) => (p.x === x && p.y === y) || (p.x === y && p.y === x));
        const cov = (p, which) => {
            const L = usable[which === 'a' ? p.x : p.y].seq.length;
            const span = which === 'a' ? (p.a1 - p.a0 + 1) : (Math.abs(p.b1 - p.b0) + 1);
            return span / L;
        };
        const short = (s) => (s.length > 16 ? s.slice(0, 15) + '…' : s);
        const matrix = {
            caption: 'Identity over the aligned region (coverage of the row sequence underneath)',
            cols: [''].concat(usable.map((u) => short(u.name))),
            rows: usable.map((u, x) => [short(u.name)].concat(usable.map((v, y) => {
                if (x === y) return '—';
                const p = pairOf(x, y);
                if (!p || p.tooLong) return 'too long';
                if (!p.len) return 'none';
                return pct(p.id / p.len) + '\n' + pct(cov(p, p.x === x ? 'a' : 'b')) + ' cov';
            })))
        };
        const verdict = (p) => {
            const idf = p.id / p.len, c = Math.min(cov(p, 'a'), cov(p, 'b'));
            if (idf >= 0.98 && c >= 0.95) return 'Identical or nearly so';
            if (idf >= 0.95 && Math.max(cov(p, 'a'), cov(p, 'b')) >= 0.95) return 'One contains the other: the shorter lies almost unchanged within the longer';
            if (idf >= 0.6 && c >= 0.8) return 'Close relatives (paralogs or orthologs)';
            if (mode === 'protein' ? idf >= 0.25 : idf >= 0.7) return c >= 0.5 ? 'Related: a shared core, different elsewhere' : 'Related over part of their length';
            return 'Little detectable similarity';
        };
        const rows = [];
        for (const p of pairs) {
            const A = usable[p.x], Bt = usable[p.y];
            const k = A.name + ' vs ' + Bt.name;
            if (p.tooLong) { rows.push([k, 'Too long to align here (' + A.seq.length.toLocaleString() + ' × ' + Bt.seq.length.toLocaleString() + ' ' + unit + '). Select a shorter range, or compare proteins.']); continue; }
            if (!p.len) { rows.push([k, 'No local alignment scored above zero: no detectable similarity.']); continue; }
            rows.push([k + ' · ' + pct(p.id / p.len),
                pct(p.id / p.len) + ' identical'
                + (mode === 'protein' ? (', ' + pct(p.pos / p.len) + ' similar') : '')
                + ' over ' + p.len.toLocaleString() + ' aligned ' + unit + (p.gaps ? (' (' + p.gaps + ' in gaps)') : '') + '. '
                + A.name + ' ' + p.a0 + '–' + p.a1 + ' (' + pct(cov(p, 'a')) + ' of it) with '
                + Bt.name + ' ' + p.b0 + '–' + p.b1 + ' (' + pct(cov(p, 'b')) + ')'
                + (p.minus ? ', on the opposite strand' : '') + '. '
                + verdict(p) + '.']);
        }
        const inputs = usable.map((u) => [u.name, u.what]);
        for (const s of skipped) inputs.push([s.name, mode === 'protein' ? 'No ORF to translate: left out.' : 'No sequence: left out.']);

        const block = (p) => {
            const A = usable[p.x], Bt = usable[p.y];
            const W = 60, lines = [];
            let ia = p.a0, ib = p.minus ? p.b1 : p.b0;
            const stepB = p.minus ? -1 : 1;
            const pad = Math.max(A.name.length, Bt.name.length, 4);
            for (let k = 0; k < p.ra.length; k += W) {
                const sa = p.ra.slice(k, k + W), sb = p.rb.slice(k, k + W), sm = p.mid.slice(k, k + W);
                const na = sa.replace(/-/g, '').length, nb = sb.replace(/-/g, '').length;
                lines.push(A.name.padEnd(pad) + ' ' + String(ia).padStart(6) + ' ' + sa + ' ' + (ia + na - 1));
                lines.push(' '.repeat(pad) + ' ' + ' '.repeat(6) + ' ' + sm);
                lines.push(Bt.name.padEnd(pad) + ' ' + String(ib).padStart(6) + ' ' + sb + ' ' + (ib + stepB * (nb - 1)));
                lines.push('');
                ia += na; ib += stepB * nb;
            }
            return lines.join('\n');
        };
        const details = pairs.filter((p) => !p.tooLong && p.len).map((p) => ({
            summary: 'Alignment: ' + usable[p.x].name + ' vs ' + usable[p.y].name,
            pre: block(p)
        }));

        const help = {
            title: 'Sequence comparison: ' + usable.length + ' tracks, ' + (mode === 'protein' ? 'protein' : 'nucleotide'),
            table: matrix,
            rows: rows.concat(inputs).concat([
                ['identity', 'Identical positions divided by the aligned length, gaps included. It is measured only over the aligned region; coverage says how much of each sequence that region spans.'],
                mode === 'protein'
                    ? ['similar', 'Identical plus conservative substitutions (a positive BLOSUM62 score, e.g. I↔V, K↔R), as blastp reports "positives".']
                    : ['strands', 'Each pair is aligned on both strands and the better one is kept.'],
                ['how', mode === 'protein'
                    ? 'Local alignment (Smith-Waterman), BLOSUM62, gap open 11 + 1 per residue: the blastp defaults, without its composition adjustment, so identities can differ from BLAST by a few residues.'
                    : 'Local alignment (Smith-Waterman), match +2, mismatch -3, gap open 5 + 2 per base (BLASTN scores).']
            ]),
            details: details,
            note: 'A local alignment finds the most similar region, so two proteins that share one domain can be ~35% identical over that domain and unrelated elsewhere; read identity together with coverage.'
        };
        try { window.__bajaSeqCompare = { mode, tracks: usable.map((u) => ({ name: u.name, length: u.seq.length })), pairs: pairs.map((p) => Object.assign({ a: usable[p.x].name, b: usable[p.y].name }, p)) }; } catch (e) { }
        try { graph.setMessage(' '); } catch (e) { }
        try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
        catch (e) {
            const p = pairs.find((q) => q.len);
            tell(p ? (usable[p.x].name + ' vs ' + usable[p.y].name + ': ' + pct(p.id / p.len) + ' identical over ' + p.len + ' ' + unit + '.') : 'No similarity found.');
        }
        return true;
    })();
}
