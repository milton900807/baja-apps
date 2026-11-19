function (graph, tracks, opts) {

    // COMPARE THE PROTEINS OF THESE TRACKS, ALIGNED ON THE BACKEND.
    //   exec('baja/bio/protein/compare-proteins.js', graph, [t1, t2], {})
    //
    // The browser's own comparison is a plain Smith-Waterman. This hands the translations to
    // py/bio/protein/align-proteins.py, which is Biopython with BLOSUM62 and the blastp gap
    // costs, so the identity and coverage read the way a blastp result reads and can be put
    // beside one.
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

            const items = [], without = [];
            for (const t of ts) {
                const s = peptideOf(t);
                if (s && s.length >= 10) items.push({ name: '' + (t.name || 'a track'), seq: s });
                else without.push('' + (t.name || 'a track'));
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

            const rows = [];
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
                    + (first ? (' · ' + pct(first.identity) + ' identical') : ''));
            } catch (e) { }

            resolve({ pairs: res.pairs, inputs: res.inputs, engine: res.engine, left_out: without });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
