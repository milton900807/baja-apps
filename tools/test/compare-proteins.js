// COMPARE THE PROTEINS BETWEEN THE mRNA TRACKS.
//
//     node tools/test/compare-proteins.js
//
// Two things had to be true for that sentence to work and neither was. "The mRNA tracks" is
// a group someone can see on screen and could not name in one phrase; naming five of them is
// work the editor should be doing. And proteins were compared, when they were compared at
// all, by the browser's own Smith-Waterman rather than by a real aligner.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let pyCalls = [], pyReply = null, helpShown = null, browserRuns = 0;
const load = async (p, ...a) => {
    if (('' + p).indexOf('align-proteins.py') >= 0) { pyCalls.push({ items: a[0], opts: a[1] }); return pyReply; }
    if (('' + p).indexOf('decor-help') >= 0) { helpShown = a[0] && a[0].decor && a[0].decor.help; return true; }
    if (('' + p).indexOf('compare-track-sequences') >= 0) { browserRuns++; return true; }
    if (('' + p).indexOf('track-regions') >= 0) {
        const t = a[0];
        return { introns: t.__introns, exons: t.__exons == null ? 32 : t.__exons, resolve: () => ({ error: 'no' }) };
    }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }   // statement bodies
    // A module that IS a class (track-layer.js) is handed back, not called.
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A track whose ORF walks out to a peptide, the way the editor draws it.
// index is the base the codon starts at: a block is drawn on codons, not on an index
// into a string, so the walk has to carry real positions.
const pep = (s, at) => ({ cdsi: s.split('').map((aa, i) => ({ ci: 0, codon_index: i, index: (at || 100) + i * 3, aa: aa, codon: 'GCT' })) });
const mk = (name, protein, introns) => ({
    name: name, xi: 0, xf: 3000, grid: { yi: 1, xi: 0, width: 10, height: -1 },
    orf: protein ? pep(protein, 100) : null, __introns: introns, getSelectedRanges: () => [],
    track_layers: [], addLayer(l) { this.track_layers.push(l); }
});
const mkCap = async (ts) => {
    const graph = { track: ts, said: [], getTracks: () => ts,
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    return { C: await load('baja/manchester/menu/editor-capabilities.js', graph, {}), graph };
};

(async () => {
    const P1 = 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ';
    const P2 = 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVA';

    // ---- which tracks "the mRNA tracks" means --------------------------------------------
    const mrna1 = mk('MAPK8IP3_mRNA', P1, 0);
    const mrna2 = mk('spag9_mRNA', P2, 0);
    const gene = mk('MAPK8IP3**', P1, 31);              // a gene track: 31 introns
    const spliced = mk('ENST00000333', P2, 0);          // no introns, no name: still an mRNA
    let { C, graph } = await mkCap([mrna1, mrna2, gene, spliced]);

    pyReply = { status: 'OK', engine: 'biopython test', inputs: [], pairs: [] };
    let p = C.preview({ capability: 'compare_sequences', args: { which: 'mrna' } });
    ok(/MAPK8IP3_mRNA/.test(p.text) && /spag9_mRNA/.test(p.text),
       'the tracks that say they are mRNA are in: ' + p.text);
    ok(!/MAPK8IP3\*\*/.test(p.text),
       'the gene track with 31 introns is not: ' + p.text);
    ok(/ENST00000333/.test(p.text),
       'and a spliced track with no introns and no telltale name is, because that is what an '
       + 'mRNA is: ' + p.text);

    // A track whose regions have not been worked out is left out rather than guessed in.
    const unknown = mk('mystery', P1, undefined);
    const cap2 = await mkCap([mrna1, mrna2, unknown]);
    p = cap2.C.preview({ capability: 'compare_sequences', args: { which: 'mrna' } });
    ok(!/mystery/.test(p.text),
       'a track whose introns are not known yet is left out, since including the wrong track '
       + 'silently changes the answer: ' + p.text);

    // ---- the proteins go to the backend ----------------------------------------------------
    pyCalls = []; helpShown = null; browserRuns = 0;
    pyReply = {
        status: 'OK', engine: 'biopython PairwiseAligner, BLOSUM62, gap -11/-1, local',
        inputs: [{ name: 'MAPK8IP3_mRNA', length: 33 }, { name: 'spag9_mRNA', length: 33 }],
        pairs: [{ a: 'MAPK8IP3_mRNA', b: 'spag9_mRNA', score: 170, length: 33, gaps: 0,
                  identical: 32, similar: 33, identity: 32 / 33, similarity: 1,
                  coverage_a: 1, coverage_b: 1, len_a: 33, len_b: 33,
                  alignment: { a: P1, b: P2 } }]
    };
    ({ C, graph } = await mkCap([mrna1, mrna2, gene]));
    p = C.preview({ capability: 'compare_sequences', args: { which: 'mrna' } });
    await p.capability.run(p.args);
    ok(pyCalls.length === 1, 'the aligner on the backend is what runs: ' + pyCalls.length + ' call(s)');
    ok(browserRuns === 0, 'and the browser aligner does not also run');
    ok(pyCalls[0].items.length === 2 && pyCalls[0].items[0].seq === P1,
       'it is sent the translations, not the DNA: ' + (pyCalls[0].items[0].seq || '').slice(0, 12) + '...');
    ok(pyCalls[0].opts.mode === 'local',
       'aligned locally, so a shared domain is not buried under the ends it differs at');

    ok(!!helpShown, 'the result opens in the panel');
    const text = (helpShown.rows || []).map((r) => r.join(' ')).join(' | ');
    ok(/97\.0% identical/.test(text), 'with the identity: ' + text.slice(0, 70));
    ok(/100\.0% of MAPK8IP3_mRNA/.test(text) && /100\.0% of spag9_mRNA/.test(text),
       'and BOTH coverages, without which "97% identical" can mean a shared motif in two '
       + 'unrelated proteins');
    ok(/BLOSUM62/.test(text), 'and which aligner produced it: ' + /[^|]*BLOSUM62[^|]*/.exec(text));

    // ---- a track with no protein is named, not translated in some made-up frame ------------
    const noOrf = mk('noncoding', null, 0);
    ({ C, graph } = await mkCap([mrna1, mrna2, noOrf]));
    pyCalls = [];
    let r = await load('baja/bio/protein/compare-proteins.js', graph, [mrna1, mrna2, noOrf], {});
    ok(pyCalls[0].items.length === 2, 'only the two with a translation are sent');
    ok(r.left_out && r.left_out[0] === 'noncoding', 'and the third is named as left out: '
       + JSON.stringify(r.left_out));

    r = await load('baja/bio/protein/compare-proteins.js', graph, [noOrf, mk('other', null, 0)], {});
    ok(!!r.error && /no translated ORF/.test(r.error),
       'two tracks with no protein is said plainly: ' + r.error);

    // ---- a backend that cannot be reached falls back rather than failing -------------------
    pyReply = null;
    r = await load('baja/bio/protein/compare-proteins.js', graph, [mrna1, mrna2], {});
    ok(r.unavailable === true, 'nothing back from the backend is reported as unavailable');
    ({ C, graph } = await mkCap([mrna1, mrna2]));
    browserRuns = 0;
    p = C.preview({ capability: 'compare_sequences', args: {} });
    await p.capability.run(p.args);
    ok(browserRuns === 1,
       'and the browser aligner answers instead, since it can still answer the question: '
       + browserRuns);

    // An error FROM the aligner is a real answer and is not papered over by falling back.
    pyReply = { status: 'ERROR', error: 'Bio.Align is not installed' };
    r = await load('baja/bio/protein/compare-proteins.js', graph, [mrna1, mrna2], {});
    ok(!r.unavailable && /not installed/.test(r.error || ''),
       'an aligner that answered with an error is reported, not retried silently: ' + r.error);

    // ---- the answer is DRAWN, not only reported ---------------------------------------------
    // "compare the sequence between spag9_mrna and mapk8ip3mrna" put one identity in a panel
    // and left both tracks bare. The blocks the alignment is made of go on both tracks, in
    // the shared numbering, with an arrow from each to its partner.
    const A = mk('MAPK8IP3_mRNA', P1, 0), B = mk('spag9_mRNA', P2, 0);
    pyReply = {
        status: 'OK', engine: 'biopython test',
        inputs: [{ name: 'MAPK8IP3_mRNA', length: 33 }, { name: 'spag9_mRNA', length: 33 }],
        pairs: [{ a: 'MAPK8IP3_mRNA', b: 'spag9_mRNA', score: 170, length: 33, gaps: 0,
                  identical: 30, similar: 33, identity: 30 / 33, similarity: 1,
                  coverage_a: 1, coverage_b: 1, len_a: 33, len_b: 33,
                  alignment: { a: P1, b: P2 },
                  blocks: [
                      { n: 1, a0: 0, a1: 11, b0: 0, b1: 11, identity: 1, similarity: 1, columns: 12, identical: 12 },
                      { n: 2, a0: 20, a1: 31, b0: 20, b1: 31, identity: 0.75, similarity: 1, columns: 12, identical: 9 }
                  ] }]
    };
    helpShown = null;
    ({ C, graph } = await mkCap([A, B]));
    r = await load('baja/bio/protein/compare-proteins.js', graph, [A, B], {});

    const layOf = (t) => (t.track_layers || []).find((l) => l && l.data_type === 'PROTSIM');
    const la = layOf(A), lb = layOf(B);
    ok(!!la && !!lb, 'both tracks get a layer of the conserved blocks');
    ok(la && (la.intervals || []).length === 2 && lb && (lb.intervals || []).length === 2,
       'one bar per block on each: ' + ((la && (la.intervals || []).length) + '/' + (lb && (lb.intervals || []).length)));

    // Residue 0 starts at base 100 and residue 11 at 133, so block 1 is 100..135.
    const iv = (la.intervals || [])[0];
    ok(iv && iv.x1 === 100 && iv.x2 === 135,
       'a block lands on the codons that encode it, not on a residue index: '
       + (iv ? iv.x1 + '-' + iv.x2 : 'none'));
    const labels = (la.intervals || []).map((v) => '' + (v.t || '')).join(' ');
    ok(/1/.test(labels) && /75\.0%/.test(labels),
       'and carries its number and how identical it is: ' + labels);

    ok(la.links && la.links.length === 2, 'each block is linked to its partner: '
       + ((la.links || []).length));
    ok(!lb.links || !lb.links.length,
       'linked from one side only, or every arrow is drawn twice over itself');
    const lk = (la.links || [])[0];
    ok(lk && lk.track === B && lk.ox1 === 100 && lk.ox2 === 135,
       'the far end is kept in the OTHER track\u2019s coordinates, to be resolved on its own grid: '
       + (lk ? (lk.ox1 + '-' + lk.ox2) : 'none'));

    const dtext = (helpShown.rows || []).map((x) => x.join(' ')).join(' | ');
    ok(/drawn on the tracks/.test(dtext) && /arrow/.test(dtext),
       'the panel says what was drawn, so the numbers and the picture are one answer');
    ok(/1-12 vs 1-12/.test(dtext), 'and gives the residues of each block: '
       + (/[^|]*Residues[^|]*/.exec(dtext) || [''])[0].slice(0, 90));
    ok(r.drawn && r.drawn.blocks === 2 && r.drawn.links === 2,
       'and the caller is told it was drawn: ' + JSON.stringify(r.drawn && { b: r.drawn.blocks, l: r.drawn.links }));
    ok(graph.said.join(' ').indexOf('blocks drawn and linked') >= 0,
       'the one-line message says so too: ' + graph.said[graph.said.length - 1]);

    // A track whose codon positions are unknown cannot have a block put on it, and that is
    // said rather than left as a panel describing a picture that is not there.
    const noPos = mk('spag9_mRNA', P2, 0);
    noPos.orf = { cdsi: P2.split('').map((aa, i) => ({ ci: 0, codon_index: i, aa: aa })) };
    helpShown = null;
    ({ C, graph } = await mkCap([A, noPos]));
    await load('baja/bio/protein/compare-proteins.js', graph, [A, noPos], {});
    ok(/not drawn/.test((helpShown.rows || []).map((x) => x.join(' ')).join(' | ')),
       'a track with no codon positions is told about, not silently left bare');

    // ---- the backend itself -----------------------------------------------------------------
    const py = fs.readFileSync('py/bio/protein/align-proteins.py', 'utf8');
    ok(/BLOSUM62/.test(py) && /OPEN_GAP = -11/.test(py) && /EXTEND_GAP = -1/.test(py),
       'it scores with BLOSUM62 and the blastp gap costs, so the numbers are comparable with '
       + 'a blastp result');
    ok(/al\.mode = "global" if mode == "global" else "local"/.test(py), 'and aligns locally by default');
    ok(/"coverage_a"/.test(py) && /"coverage_b"/.test(py),
       'and returns how much of each protein the aligned region covers');
    ok(/def _segments\(/.test(py) && /alignment\.aligned/.test(py),
       'the blocks come from the aligner\u2019s own coordinates, so a LOCAL alignment that '
       + 'starts partway into a protein is not placed from zero');
    ok(/MAX_INNER_GAP/.test(py),
       'and a short gap does not shatter one domain into twenty fragments');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
