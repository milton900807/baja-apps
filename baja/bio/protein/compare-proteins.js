function (graph, tracks, opts) {

    // COMPARE THE PROTEINS OF THESE TRACKS, ALIGNED ON THE BACKEND.
    //   exec('baja/bio/protein/compare-proteins.js', graph, [t1, t2], {})
    //
    // The browser's own comparison is a plain Smith-Waterman. This hands the translations to
    // py/bio/protein/align-proteins.py, which is Biopython with BLOSUM62 and the blastp gap
    // costs, so the identity and coverage read the way a blastp result reads and can be put
    // beside one.
    //
    // THE ANSWER IS ALSO DRAWN. One identity in a panel says how alike two proteins are; it
    // cannot say WHERE, and where is what a track is for. The stretches the alignment is made
    // of come back from the aligner on each protein's own residues, are put back on the codons
    // that encode them, and are drawn on both tracks in the shared numbering and colours every
    // other match uses (baja/bio/match-layer.js), with an arrow from each block to its partner.
    //
    // A TRANSLATION IS NOT A GUESS. Each track's peptide is taken from its own ORF, walked
    // codon by codon and stopped at the stop, the same walk the editor draws from. A track
    // with no ORF has no protein and is named as left out rather than translated in some
    // arbitrary frame, which would produce a number for a sequence nobody has.

    return new Promise(async (resolve) => {
        try {
            const ts = (tracks || []).filter(Boolean);
            if (ts.length < 2) { resolve({ error: 'two tracks are needed to compare proteins' }); return; }

            const peptideOf = (t) => {
                let orf = null;
                try { orf = t.orf; } catch (e) { orf = null; }
                if (!orf || !orf.cdsi || !orf.cdsi.length) {
                    try { if (t.generateORF) t.generateORF(); } catch (e) { }
                    try { orf = t.orf; } catch (e) { orf = null; }
                }
                if (!orf || !orf.cdsi || !orf.cdsi.length) return '';
                if (orf.protein && typeof orf.protein === 'string') {
                    return orf.protein.replace(/[^A-Za-z]/g, '').toUpperCase();
                }
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

            // Residue -> the base its codon starts at, on the track's own coordinates. The
            // same walk the editor draws the ORF from, so a block lands on the codons the
            // user can see, not on an index into a string.
            const codonsOf = (t) => {
                let cds = null;
                try { cds = t.getCDS ? t.getCDS() : null; } catch (e) { cds = null; }
                if (cds && Array.isArray(cds.codonPos) && cds.codonPos.length) return cds.codonPos.slice();
                const pos = [];
                try {
                    const cdsi = (t.orf && Array.isArray(t.orf.cdsi)) ? t.orf.cdsi : [];
                    const seen = {};
                    for (const e of cdsi) {
                        if (!e || (e.ci !== 0 && e.ci !== '0')) continue;
                        if (seen[e.codon_index]) continue;
                        seen[e.codon_index] = 1;
                        pos.push(+e.index);
                    }
                } catch (e) { }
                return pos;
            };

            const items = [], without = [], byName = {};
            for (const t of ts) {
                const s = peptideOf(t);
                if (s && s.length >= 10) {
                    const nm = '' + (t.name || 'a track');
                    items.push({ name: nm, seq: s });
                    byName[nm] = { track: t, codons: codonsOf(t), len: s.length };
                } else without.push('' + (t.name || 'a track'));
            }
            if (items.length < 2) {
                resolve({
                    error: 'Not enough proteins to compare'
                        + (without.length ? (': ' + without.join(', ') + ' '
                            + (without.length === 1 ? 'has' : 'have') + ' no translated ORF') : '') + '.'
                });
                return;
            }

            let res = null;
            try {
                res = await exec('py/bio/protein/align-proteins.py', items, { mode: 'local' });
            } catch (e) { res = null; }
            // Nothing came back at all: the caller falls back to the in-browser aligner
            // rather than telling the user the comparison cannot be made.
            if (!res || (!res.status && !res.pairs)) { resolve({ unavailable: true }); return; }
            if (res.status === 'ERROR') { resolve({ error: ('' + (res.error || 'the aligner failed')) }); return; }

            const pct = (x) => (Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%';
            const verdict = (p) => {
                const id = +p.identity || 0;
                const cov = Math.min(+p.coverage_a || 0, +p.coverage_b || 0);
                if (id >= 0.98 && cov >= 0.95) return 'Identical or nearly so';
                if (id >= 0.95 && Math.max(+p.coverage_a, +p.coverage_b) >= 0.95) return 'One contains the other';
                if (id >= 0.6 && cov >= 0.8) return 'Close relatives (paralogs or orthologs)';
                if (id >= 0.25) return cov >= 0.5 ? 'Related: a shared core, different elsewhere' : 'Related over part of their length';
                return 'Little detectable similarity';
            };

            // ---- draw it, and link each block to its partner ---------------------------
            // The BEST pair only. Each track carries one layer of this kind, so drawing
            // three pairs over two tracks would leave the last one standing and the panel
            // describing a picture that is no longer there.
            let drawn = null;
            const withBlocks = (res.pairs || []).filter((p) => !p.error && (p.blocks || []).length
                && byName[p.a] && byName[p.b]);
            withBlocks.sort((x, y) => (+y.identical || 0) - (+x.identical || 0));
            const bestPair = withBlocks[0] || null;
            if (bestPair) {
                try {
                    const ML = await exec('baja/bio/match-layer.js');
                    const A = byName[bestPair.a], B = byName[bestPair.b];
                    // A residue range to a span of bases: the first codon's start to the last
                    // codon's end. codonPos runs 3'->5' on a minus-strand track, so the span is
                    // ordered rather than assumed, and +2 takes in the last codon's other bases.
                    const span = (codons, r0, r1) => {
                        const u = codons[r0], v = codons[r1];
                        if (!isFinite(u) || !isFinite(v)) return null;
                        return { x1: Math.min(u, v), x2: Math.max(u, v) + 2 };
                    };
                    const pairsXY = [];
                    for (const bk of bestPair.blocks) {
                        const sa = span(A.codons, bk.a0, bk.a1), sb = span(B.codons, bk.b0, bk.b1);
                        if (!sa || !sb || sa.x2 <= sa.x1 || sb.x2 <= sb.x1) continue;
                        pairsXY.push({ n: bk.n, identity: bk.identity, a: sa, b: sb,
                                       aa: [bk.a0 + 1, bk.a1 + 1], bb: [bk.b0 + 1, bk.b1 + 1] });
                    }
                    if (pairsXY.length) {
                        const opt = { suffix: '_protein_similarity', dataType: 'PROTSIM' };
                        const blocksA = pairsXY.map((q) => ({ n: q.n, x1: q.a.x1, x2: q.a.x2, identity: q.identity }));
                        const blocksB = pairsXY.map((q) => ({ n: q.n, x1: q.b.x1, x2: q.b.x2, identity: q.identity }));
                        const layA = ML.draw(A.track, blocksA, opt);
                        ML.draw(B.track, blocksB, opt);
                        // Hung on one of the two, or every arrow is drawn twice over itself.
                        let links = 0;
                        if (layA) {
                            links = ML.link(layA, A.track, B.track,
                                pairsXY.map((q) => ({ n: q.n, x1: q.a.x1, x2: q.a.x2, ox1: q.b.x1, ox2: q.b.x2 })));
                        }
                        drawn = { blocks: pairsXY.length, links: links, a: bestPair.a, b: bestPair.b,
                                  where: pairsXY.map((q) => ({ n: q.n, identity: q.identity, a: q.aa, b: q.bb })) };
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                    }
                } catch (e) { drawn = { error: '' + (e && e.message ? e.message : e) }; }
            }

            const rows = [];
            if (drawn && drawn.blocks) {
                rows.push(['drawn on the tracks',
                    drawn.blocks + ' conserved block' + (drawn.blocks === 1 ? '' : 's')
                    + ' of ' + drawn.a + ' and ' + drawn.b + ' are on both tracks, numbered and '
                    + 'coloured the same on each, with an arrow from each block to its partner. '
                    + 'The label on a bar is its number and how identical that block is. '
                    + 'Residues: ' + drawn.where.slice(0, 8).map((w) => w.n + ') ' + w.a[0] + '-' + w.a[1]
                        + ' vs ' + w.b[0] + '-' + w.b[1] + ' at ' + pct(w.identity)).join('; ')
                    + (drawn.where.length > 8 ? ('; +' + (drawn.where.length - 8) + ' more') : '') + '.']);
            } else if (bestPair) {
                // Said plainly rather than left as a panel that describes nothing: a block
                // can only be drawn where the track knows which bases encode which residue.
                rows.push(['not drawn', 'The alignment could not be put on the tracks: '
                    + ((drawn && drawn.error) ? drawn.error
                        : 'the codon positions of one of these tracks are not available, so there '
                        + 'is nowhere to put a block.')]);
            }
            for (const p of (res.pairs || [])) {
                if (p.error) { rows.push([p.a + ' vs ' + p.b, 'Not aligned: ' + p.error]); continue; }
                rows.push([
                    p.a + ' vs ' + p.b + ' · ' + pct(p.identity),
                    pct(p.identity) + ' identical, ' + pct(p.similarity) + ' similar over '
                    + (p.length || 0).toLocaleString() + ' aligned residues'
                    + (p.gaps ? (' (' + p.gaps.toLocaleString() + ' in gaps)') : '') + '. '
                    // THE COVERAGES ARE NOT DECORATION. A local alignment reports identity
                    // over the part it aligned, so without these two numbers "96% identical"
                    // can mean a shared motif in two unrelated proteins.
                    + 'That region is ' + pct(p.coverage_a) + ' of ' + p.a + ' ('
                    + (p.len_a || 0).toLocaleString() + ' aa) and ' + pct(p.coverage_b) + ' of '
                    + p.b + ' (' + (p.len_b || 0).toLocaleString() + ' aa). ' + verdict(p) + '.'
                ]);
            }
            if (without.length) {
                rows.push(['left out', without.join(', ') + ' '
                    + (without.length === 1 ? 'has' : 'have') + ' no translated ORF, so no protein to align.']);
            }
            rows.push(['aligner', '' + (res.engine || 'biopython')
                + '. Identity is counted over the aligned columns, as blastp reports it.']);

            // The same panel the browser comparison opens, called the same way: a layer-shaped
            // object carrying decor.help, then the graph.
            const help = {
                title: 'Proteins compared: ' + (res.inputs || []).length + ' tracks',
                rows: rows.concat((res.inputs || []).map((i) => [i.name, (i.length || 0).toLocaleString() + ' aa'])),
                note: 'A local alignment finds the most similar region, so two proteins sharing '
                    + 'one domain can be highly identical over it and unrelated elsewhere. Read '
                    + 'the identity together with the coverage figures.'
            };
            try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
            catch (e) {
                try { graph.setResultMessage(rows.map((r) => r[1]).join(' ')); } catch (e2) { }
            }
            try { window.__bajaProteinCompare = res; } catch (e) { }

            const first = (res.pairs || []).filter((p) => !p.error)[0];
            try {
                graph.setMessage('Proteins compared: ' + (res.pairs || []).length + ' pair'
                    + ((res.pairs || []).length === 1 ? '' : 's')
                    + (first ? (' · ' + pct(first.identity) + ' identical') : '')
                    + ((drawn && drawn.blocks) ? (' · ' + drawn.blocks + ' blocks drawn and linked') : ''));
            } catch (e) { }

            resolve({ pairs: res.pairs, inputs: res.inputs, engine: res.engine, left_out: without, drawn: drawn });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
