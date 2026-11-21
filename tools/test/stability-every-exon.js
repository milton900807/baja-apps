// A FIGURE ON EVERY EXON, AND NO LINE CLAIMING THERE IS NONE.
//
//     node tools/test/stability-every-exon.js          (needs jsdom)
//
// Two faults, reported together. The lower lane took its figures off the MATCHED blocks,
// so a track whose every exon had been scored showed a handful of numbers with blanks
// between them, which reads as the measurement having failed on the gaps. And the note
// under the picture was written from whether the lookup existed rather than from what was
// drawn, and when it came back empty it announced a cause it had not established: "PSI ran
// but matched no arcs to the annotated exons of either track", printed just as readily for
// a run that was refused outright or that produced no junctions at all.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A model of the shape match-regions resolves to: five exons a side, only two matched.
const mkModel = (marks, stability) => ({
    title: 'Exons of QUERY against TARGET',
    a: { name: 'QUERY', x1: 0, x2: 3000 },
    b: { name: 'TARGET', x1: 0, x2: 3000 },
    blocks: [
        { label: 'exon 1', a: { x1: 500, x2: 650, stab: { pct: 98, word: 'constitutive' } },
            b: { x1: 500, x2: 650, stab: { pct: 97, word: 'constitutive' } } },
        { label: 'exon 2', a: { x1: 1000, x2: 1150, stab: { pct: 42, word: 'unstable' } },
            b: { x1: 1000, x2: 1150, stab: { pct: 44, word: 'unstable' } } }
    ],
    unmatched: [{ label: 'exon 5', a: { x1: 2500, x2: 2650 }, why: 'nothing like it over there' }],
    rows: [['exons compared', '5']],
    stabilityMarks: marks,
    stability: stability
});
const five = (base) => [1, 2, 3, 4, 5].map((i) => ({
    x1: i * 500, x2: i * 500 + 150, st: { pct: base + i, word: 'variable', from: 'arcs' } }));

const render = async (model) => {
    const prev = document.getElementById('baja-compare-view');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    await load('baja/bio/compare-view.js', model);
    await new Promise((r) => setTimeout(r, 20));
    return document.getElementById('baja-compare-view') || document.createElement('div');
};

(async () => {
    // ---- every exon of each lane carries its own figure ---------------------------------
    {
        const host = await render(mkModel({ a: five(40), b: five(60) },
            { a: true, b: true, tried: true, from: 'arcs' }));
        const txt = host.textContent || '';
        const svg = host.querySelector('svg');
        ok(!!svg, 'the comparison draws');
        // 41..45 on the upper lane and 61..65 on the lower: ten figures, not the four the
        // matched blocks would have given.
        const want = [41, 42, 43, 44, 45, 61, 62, 63, 64, 65];
        const got = want.filter((n) => txt.indexOf(n + '%') >= 0);
        ok(got.length === want.length,
           'both lanes carry a figure for EVERY exon, matched or not: ' + got.join(',') + ' of ' + want.join(','));
        ok(!/not shown/i.test(txt), 'and nothing says the figures are not shown: ' + txt.slice(0, 120));
    }

    // ---- the lower lane alone, which is the case that was broken ------------------------
    {
        // Figures for all five of B's exons; A has none. The old code drew B's two matched
        // ones and described the rest as missing.
        const host = await render(mkModel({ a: [], b: five(60) },
            { a: false, b: true, tried: true, from: 'arcs', whyA: 'PSI has not been run on it' }));
        const txt = host.textContent || '';
        ok([61, 62, 63, 64, 65].every((n) => txt.indexOf(n + '%') >= 0),
           'the track that WAS scored shows all five of its exons');
        ok(/No figures on QUERY: PSI has not been run on it/.test(txt),
           'and the one that was not says so, in the run\'s own words: ' + txt.slice(0, 200));
    }

    // ---- NOTHING EITHER SIDE: say what happened, do not invent a cause ------------------
    {
        const host = await render(mkModel({ a: [], b: [] },
            { a: false, b: false, tried: true, from: '',
              whyA: 'No cassette-exon events detected in that sequence',
              whyB: 'No cassette-exon events detected in that sequence' }));
        const txt = host.textContent || '';
        ok(!/matched no arcs/.test(txt), 'the numbering claim is not made: ' + txt.slice(0, 200));
        ok(!/is not shown/.test(txt), 'and it does not lead with the figures being absent');
        ok(/No cassette-exon events detected in that sequence/.test(txt),
           'what the run actually said is what is printed: ' + txt.slice(0, 220));
        ok(/Neither track has one/.test(txt), 'said once when both tracks said the same thing');
    }
    {
        // Two different reasons, each named with its track.
        const host = await render(mkModel({ a: [], b: [] },
            { a: false, b: false, tried: true, from: '',
              whyA: 'the PSI run on it left no junctions',
              whyB: 'it has no annotated exons to put a figure on' }));
        const txt = host.textContent || '';
        ok(/QUERY: the PSI run on it left no junctions/.test(txt)
            && /TARGET: it has no annotated exons/.test(txt),
           'each track gets its own reason: ' + txt.slice(0, 240));
    }
    {
        // No reason recorded anywhere: still no invented cause.
        const host = await render(mkModel({ a: [], b: [] }, { a: false, b: false, tried: true }));
        const txt = host.textContent || '';
        ok(!/matched no arcs/.test(txt) && /neither came back with an inclusion figure/.test(txt),
           'with nothing recorded it reports the outcome and stops: ' + txt.slice(0, 200));
    }

    // ---- CROWDED IS NOT MISSING -----------------------------------------------------------
    // Two exons a few hundred bases apart are a few pixels apart in a picture of a 571 kb
    // track. The label that collided used to be dropped, which in this row means "nothing
    // was measured here" -- the one thing it exists to distinguish from a low score.
    {
        const tight = (base, x0) => [0, 1, 2, 3].map((i) => ({
            x1: x0 + i * 12, x2: x0 + i * 12 + 8, st: { pct: base + i, word: 'variable', from: 'arcs' } }));
        const host = await render(mkModel({ a: tight(50, 2400), b: tight(70, 2400) },
            { a: true, b: true, tried: true, from: 'arcs' }));
        const txt = host.textContent || '';
        ok([50, 51, 52, 53, 70, 71, 72, 73].every((n) => txt.indexOf(n + '%') >= 0),
           'every figure is drawn even where they land on top of each other: ' + txt.slice(0, 60));
        ok(!/too close together/.test(txt), 'with nothing reported as unplaceable at this width');
        const svg = host.querySelector('svg');
        const ys = Array.from(svg.querySelectorAll('text'))
            .filter((t) => /^5[0-3]%$/.test(t.textContent))
            .map((t) => +t.getAttribute('y'));
        ok(new Set(ys).size > 1, 'by moving to a line of their own: ' + ys.join(','));
        // Away from the lane, never into it: the lane carries the exon's own label.
        ok(ys.every((v) => v < 92), 'and the upper row stays above its lane: ' + ys.join(','));
        const ysB = Array.from(svg.querySelectorAll('text'))
            .filter((t) => /^7[0-3]%$/.test(t.textContent))
            .map((t) => +t.getAttribute('y'));
        ok(new Set(ysB).size > 1 && ysB.every((v) => v > 92 + 30),
           'and the lower row below its own: ' + ysB.join(','));
    }

    // Past what three or four lines can hold, the ones left out are COUNTED, not dropped
    // in silence: a gap in this row otherwise reads as an exon nothing was measured for.
    {
        const packed = (base, x0) => Array.from({ length: 9 }, (_, i) => ({
            x1: x0 + i * 6, x2: x0 + i * 6 + 4, st: { pct: base + i, word: 'variable', from: 'arcs' } }));
        const host = await render(mkModel({ a: packed(10, 2500), b: [] },
            { a: true, b: false, tried: true, from: 'arcs' }));
        const txt = host.textContent || '';
        ok(/sit too close together to label at this width/.test(txt),
           'the ones that would not fit are reported: ' + txt.slice(0, 160));
    }

    // ---- A RUN THAT FAILED IS NOT A RUN THAT WAS NEVER MADE ------------------------------
    // The failure used to be swallowed, so the line under the picture read "PSI was run on
    // both tracks just now" and then, one sentence later, "PSI has not been run on it".
    {
        const host = await render(mkModel({ a: [], b: [] },
            { a: false, b: false, tried: true, from: '',
              whyA: 'the PSI run failed: splicing-profile.py returned 413',
              whyB: 'the PSI run failed: splicing-profile.py returned 413' }));
        const txt = host.textContent || '';
        ok(/returned 413/.test(txt) && !/has not been run/.test(txt),
           'what the attempt said is what is printed, not a guess at the state: ' + txt.slice(0, 200));
    }
    {
        const mr = fs.readFileSync('baja/bio/match-regions.js', 'utf8');
        ok(/psiSaid\.set\(t, 'the PSI run failed: '/.test(mr),
           'the comparison keeps what a failed PSI attempt said');
        ok(/if \(psiSaid\.get\(t\)\) return psiSaid\.get\(t\);/.test(mr),
           'and prefers it over the state the lookup inferred');
        ok(/if \(r0 && r0\.why && \+r0\.at >= startedAt\)/.test(mr),
           'taking a refusal only from THIS attempt, not one left over from earlier');
    }

    // ---- the sentence cannot come back ---------------------------------------------------
    for (const f of ['baja/bio/compare-view.js', 'baja/bio/match-regions.js']) {
        const src = fs.readFileSync(f, 'utf8');
        const live = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
        ok(!/Exon stability is not shown/.test(live), f + ' does not say "Exon stability is not shown"');
        ok(!/matched no arcs to the/.test(live), f + ' does not claim a numbering failure it has not established');
    }

    // ---- and the rows that make it possible travel with the model ------------------------
    {
        const mr = fs.readFileSync('baja/bio/match-regions.js', 'utf8');
        ok(/stabilityMarks: \{ a: allMarks\(stabA\), b: allMarks\(stabB\) \}/.test(mr),
           'match-regions sends a mark per exon for both tracks');
        ok(/whyA: whyOf\(qtrack\), whyB: whyOf\(ttrack\)/.test(mr),
           'and the reason there is none, per track');
        const es = fs.readFileSync('baja/bio/splicing/exon-stability.js', 'utf8');
        ok(/const none = \(why\) =>/.test(es) && !/^\s*if \(!layers\.length\) return \[\];/m.test(es),
           'and an empty answer from exon-stability carries why it is empty');
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
