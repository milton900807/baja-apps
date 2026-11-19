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
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A track whose ORF walks out to a peptide, the way the editor draws it.
const pep = (s) => ({ cdsi: s.split('').map((aa, i) => ({ ci: 0, codon_index: i, aa: aa, codon: 'GCT' })) });
const mk = (name, protein, introns) => ({
    name: name, xi: 0, xf: 3000, grid: { yi: 1, xi: 0, width: 10, height: -1 },
    orf: protein ? pep(protein) : null, __introns: introns, getSelectedRanges: () => []
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

    // ---- the backend itself -----------------------------------------------------------------
    const py = fs.readFileSync('py/bio/protein/align-proteins.py', 'utf8');
    ok(/BLOSUM62/.test(py) && /OPEN_GAP = -11/.test(py) && /EXTEND_GAP = -1/.test(py),
       'it scores with BLOSUM62 and the blastp gap costs, so the numbers are comparable with '
       + 'a blastp result');
    ok(/al\.mode = "global" if mode == "global" else "local"/.test(py), 'and aligns locally by default');
    ok(/"coverage_a"/.test(py) && /"coverage_b"/.test(py),
       'and returns how much of each protein the aligned region covers');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
