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
        // A range comparison is nucleotide by nature, whatever mode was asked for.
        const KINDS = (Array.isArray(o.ranges) && o.ranges.some((r) => r && r.start != null))
            ? ['nt']
            : (mode === 'coding' ? ['aa', 'nt'] : (mode === 'protein' ? ['aa'] : ['nt']));
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
        // A STRETCH OF EACH TRACK RATHER THAN ALL OF IT.
        //
        // "compare the sequences between exon 16 on both tracks" is a question about exon 16,
        // not about the genes: aligning the whole of both and reporting 99% identical answers
        // a question nobody asked and hides the handful of bases that differ in the exon.
        // o.ranges is one range per track, in the same order as `tracks`, and only nucleotide
        // comparison honours it -- a region of DNA has no peptide of its own, and silently
        // translating an arbitrary stretch would be inventing a reading frame.
        const ranges = Array.isArray(o.ranges) ? o.ranges : [];
        const rangeOfTrack = (i) => {
            const r = ranges[i];
            if (!r || r.start == null || r.end == null) return null;
            const a = Math.min(+r.start, +r.end), b = Math.max(+r.start, +r.end);
            return (isFinite(a) && isFinite(b) && b > a) ? { start: a, end: b, label: r.label || '' } : null;
        };
        const basesIn = (t, r) => {
            try {
                if (!t.getSequenceRange) return '';
                return ('' + (t.getSequenceRange(r.start, r.end) || '')).toUpperCase().replace(/[^ACGTUN]/g, '');
            } catch (e) { return ''; }
        };

        // WHERE A UNIT OF THE COMPARED SEQUENCE SITS ON THE TRACK. A block can only be drawn
        // if residue or base k can be put back on the bases that carry it, and only the code
        // that CHOSE the sequence knows which of the four it took: a selected region, the
        // whole track, the CDS, or the peptide. So the map is built here, beside the choice,
        // rather than guessed afterwards.
        //
        // codonPos runs 3'->5' on a minus-strand track, which is why the span helper in
        // baja/bio/align-blocks.js orders its ends instead of assuming them.
        const codonPos = (t) => {
            const orf = orfOf(t);
            if (!orf) return [];
            const pos = [], seen = {};
            for (const c of orf.cdsi) {
                if (!c || c.ci !== 0 || seen[c.codon_index] || !c.codon) continue;
                seen[c.codon_index] = 1;
                const a = '' + (c.aa || '');
                if (!a || /^stop$/i.test(a)) break;
                pos.push(+c.index);
            }
            return pos;
        };
        const linearMap = (from) => ({ at: (k) => from + k, unit: 1 });
        const codonMap = (t, perCodon) => {
            const pos = codonPos(t);
            if (!pos.length || !isFinite(pos[0])) return null;
            return perCodon
                // a peptide: residue k is codon k, three bases wide
                ? { at: (k) => pos[k], unit: 3 }
                // a CDS: base k is the (k mod 3)th base of codon floor(k/3)
                : { at: (k) => { const c = pos[Math.floor(k / 3)]; return isFinite(c) ? (c + (k % 3)) : NaN; }, unit: 1 };
        };

        const items = tks.map((t, i) => {
            const name = ('' + (t.name || ('track ' + (i + 1)))).trim();
            const it = { name, seqs: {}, what: [], track: t, maps: {} };
            const rg = rangeOfTrack(i);
            if (rg) {
                // The region wins outright: nothing below should quietly substitute the
                // whole track for a request about one exon.
                const b = basesIn(t, rg);
                if (b) {
                    it.seqs = { nt: b };
                    it.maps.nt = linearMap(rg.start);
                    it.what = b.length.toLocaleString() + ' nt'
                        + (rg.label ? (', ' + rg.label) : ', the selected region');
                } else {
                    it.what = '';
                }
                return it;
            }
            if (mode === 'coding') {
                const cp = codingPair(t);
                if (cp) { it.seqs = cp; it.what = cp.aa.length.toLocaleString() + ' aa · ' + cp.nt.length.toLocaleString() + ' nt coding sequence'; }
                else it.what = '';
                return it;
            }
            if (KINDS.indexOf('aa') >= 0) {
                const s = proteinOf(t);
                if (s) { it.seqs.aa = s; it.maps.aa = codonMap(t, true); it.what.push(s.length.toLocaleString() + ' aa'); }
            }
            if (KINDS.indexOf('nt') >= 0) {
                const cds = codingOf(t);
                if (cds) { it.seqs.nt = cds; it.maps.nt = codonMap(t, false); it.what.push(cds.length.toLocaleString() + ' nt coding sequence'); }
                else if (mode === 'nucleotide') {
                    const b = basesOf(t);
                    if (b) {
                        it.seqs.nt = b;
                        it.maps.nt = linearMap(Math.min(+t.xi, +t.xf));
                        it.what.push(b.length.toLocaleString() + ' nt, whole track (no ORF)');
                    }
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
        // THE ALIGNER LIVES IN ONE PLACE. It was declared here, where it was first needed;
        // the exon plan search needs the same alignment hundreds of times, and a second
        // copy of a Smith-Waterman would be two sets of numbers for one question.
        const AL = await exec('baja/bio/protein/align-local.js');
        const { AA, B62, NT, aaIdx, ntIdx, MAX_CELLS, align } = AL;
        const KIND = {
            aa: { label: 'peptide', unit: 'aa', P: { M: B62, open: 11, ext: 1, idx: aaIdx }, prot: true, both: false, related: 0.25 },
            // A CDS is read in its sense orientation already, so only a whole-track comparison
            // tries the other strand.
            nt: { label: 'nucleotide', unit: 'nt', P: { M: NT, open: 5, ext: 2, idx: ntIdx }, prot: false, both: mode === 'nucleotide', related: 0.7 }
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
        // ---- DRAW IT, AND LINK THE MATCHED BLOCKS -------------------------------------
        // A comparison between two tracks answers "how alike" in the panel and "where" on
        // the canvas. The blocks go on both tracks in the shared numbering and colours
        // (baja/bio/match-layer.js), with a two-headed arrow between each pair: neither
        // block is the source of the other, so an arrowhead at one end only would claim a
        // direction the alignment does not have.
        //
        // The best pair only. Each track carries one layer of this kind, so drawing three
        // pairs across two tracks would leave the last one standing and the panel
        // describing a picture that is no longer there.
        let drawn = null;
        try {
            const scored = pairs.map((q) => {
                const k = KINDS.filter((kk) => okK(q.res[kk], kk))[0];
                return k ? { q: q, k: k, r: q.res[k], id: idOf(q.res[k]) || 0 } : null;
            }).filter(Boolean).sort((u, v) => (v.r.id || 0) - (u.r.id || 0));
            const top = scored[0];
            if (top && top.r && top.r.ra && top.r.rb) {
                const A = usable[top.q.x], B = usable[top.q.y];
                const ma = A.maps[top.k], mb = B.maps[top.k];
                if (ma && mb && A.track && B.track && A.track !== B.track) {
                    const AB = await exec('baja/bio/align-blocks.js');
                    const ML = await exec('baja/bio/match-layer.js');
                    // a0/b0 come back 1-based from the aligner; the walk wants 0-based.
                    const bl = AB.blocks(top.r.ra, top.r.rb, (top.r.a0 || 1) - 1, (top.r.b0 || 1) - 1,
                        { minBlock: (top.k === 'aa' ? 8 : 24) });
                    const pairsXY = [];
                    for (const b of bl) {
                        const sa = AB.span(ma.at, b.a0, b.a1, ma.unit);
                        const sb = AB.span(mb.at, b.b0, b.b1, mb.unit);
                        if (sa && sb) pairsXY.push({ n: b.n, identity: b.identity, a: sa, b: sb,
                            aa: [b.a0 + 1, b.a1 + 1], bb: [b.b0 + 1, b.b1 + 1] });
                    }
                    if (pairsXY.length) {
                        const opt = { suffix: '_similarity', dataType: 'SEQSIM' };
                        const layA = ML.draw(A.track, pairsXY.map((q) => ({ n: q.n, x1: q.a.x1, x2: q.a.x2, identity: q.identity })), opt);
                        ML.draw(B.track, pairsXY.map((q) => ({ n: q.n, x1: q.b.x1, x2: q.b.x2, identity: q.identity })), opt);
                        let links = 0;
                        if (layA) {
                            links = ML.link(layA, A.track, B.track,
                                pairsXY.map((q) => ({ n: q.n, x1: q.a.x1, x2: q.a.x2, ox1: q.b.x1, ox2: q.b.x2 })));
                        }
                        drawn = { blocks: pairsXY.length, links: links, a: A.name, b: B.name,
                            unit: (top.k === 'aa' ? 'residues' : 'bases'),
                            where: pairsXY.map((q) => ({ n: q.n, identity: q.identity, a: q.aa, b: q.bb })) };
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                    }
                }
            }
        } catch (e) { drawn = { error: ('' + (e && e.message ? e.message : e)) }; }
        if (drawn && drawn.blocks) {
            try {
                help.rows = (help.rows || []).concat([['drawn on the tracks',
                    drawn.blocks + ' matching block' + (drawn.blocks === 1 ? '' : 's') + ' of '
                    + drawn.a + ' and ' + drawn.b + ' are on both tracks, numbered and coloured '
                    + 'the same on each, with a two-headed arrow between each pair. '
                    + drawn.unit + ': '
                    + drawn.where.slice(0, 8).map((w) => w.n + ') ' + w.a[0] + '-' + w.a[1]
                        + ' vs ' + w.b[0] + '-' + w.b[1] + ' at ' + pct(w.identity)).join('; ')
                    + (drawn.where.length > 8 ? ('; +' + (drawn.where.length - 8) + ' more') : '') + '.']]);
            } catch (e) { }
        }
        try { window.__bajaSeqCompareDrawn = drawn; } catch (e) { }

        try { graph.setMessage(' '); } catch (e) { }
        try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
        catch (e) {
            const p = pairs.find((q) => KINDS.some((k) => okK(q.res[k], k)));
            tell(p ? (usable[p.x].name + ' vs ' + usable[p.y].name + ': ' + KINDS.filter((k) => okK(p.res[k], k)).map((k) => pct(idOf(p.res[k])) + ' ' + KIND[k].unit).join(', ') + ' identical.') : 'No similarity found.');
        }
        return true;
    })();
}
