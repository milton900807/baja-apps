// GOING TO A NAMED REGION, AND ZOOMING A STEP.
//
//     node tools/test/go-to-and-zoom.js
//
// "got o exon 15" was refused with "exon 15 is not a position: use c.778, c.-12, c.*30,
// c.778+5 or a plain number" -- true of the HGVS parser and useless to someone pointing at
// an exon on their screen. "zoom out" was refused with "the editor has fit to show all
// tracks, but no general zoom out control", which is an accurate description of a gap
// rather than an answer.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// Fifteen exons of 100 bases, 200 apart, with a coding region inside them.
const exon = (xi, xf) => ({ type: 'Exon', xi: xi, xf: xf });
const mkTrack = () => {
    const anns = [];
    for (let i = 0; i < 15; i++) anns.push(exon(i * 300, i * 300 + 100));
    anns.push({ type: 'Translation', xi: 150, xf: 4350 });
    return { name: 'DNM3', xi: 0, xf: 4500, sequence: 'A'.repeat(4500),
        annotations: anns, track_layers: [], getSelectedRanges: () => [],
        tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 4500, yi: 0, height: 1 } };
};

// A second transcript, where exon 12 is somewhere else entirely and there are fewer of them.
const mkOther = () => {
    const anns = [];
    for (let i = 0; i < 13; i++) anns.push(exon(i * 500, i * 500 + 220));
    anns.push({ type: 'Translation', xi: 300, xf: 6000 });
    return { name: 'DNM3-208', xi: 0, xf: 6500, sequence: 'C'.repeat(6500),
        annotations: anns, track_layers: [], getSelectedRanges: () => [],
        tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 6500, yi: 0, height: 1 } };
};

(async () => {
    const t = mkTrack();
    const R = await load('baja/bio/track-regions.js', t);

    // ---- a named region is a place too --------------------------------------------------
    ok(!!R.named, 'the regions module can read a named region');
    for (const [text, want] of [
        ['exon 15', { region: 'exon', index: 15 }],
        ['Exon 3', { region: 'exon', index: 3 }],
        ['the exon 7', { region: 'exon', index: 7 }],
        ['intron 3', { region: 'intron', index: 3 }],
        ['15th exon', { region: 'exon', index: 15 }],
        ["3' UTR", { region: 'three_prime_utr' }],
        ['the 5′ utr', { region: 'five_prime_utr' }],
        ['cds', { region: 'cds' }],
        ['the coding sequence', { region: 'cds' }],
        ['transcript', { region: 'transcript' }]]) {
        const got = R.named(text);
        ok(!!got && got.region === want.region && (want.index == null || got.index === want.index),
           '"' + text + '" reads as ' + JSON.stringify(want) + ': ' + JSON.stringify(got));
    }
    ok(R.named('c.778') === null && R.named('1520') === null,
       'and a real position is not mistaken for one');

    // position() hands the caller the spec rather than pretending an exon is a point.
    const p = R.position('exon 15');
    ok(!!p.error && !!p.named && p.named.index === 15,
       'position() says it is a stretch and passes on what it read: ' + p.error);
    ok(/stretch, not a single position/.test(p.error), 'in those words: ' + p.error);
    const bad = R.position('banana');
    ok(!bad.named && /named region such as/.test(bad.error),
       'and something that is neither is told both ways out: ' + bad.error);

    // ---- the operation frames it ---------------------------------------------------------
    let framed = null, zoomed = null;
    const graph = {
        track: [t], said: [], getTracks: () => [t], animating: false,
        canvas: { width: 1200, height: 800 },
        grid: { getxmin: () => 1000, getxmax: () => 2000, getymin: () => -5, getymax: () => 5 },
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); },
        clearSequenceSelections() { }, wake() { },
        zoomRect(a, b, c, d) { zoomed = { x0: a, x1: b, y0: c, y1: d }; framed = zoomed; return Promise.resolve(); },
        viewAllTracks() { return Promise.resolve(); }
    };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    let pv = C.preview({ capability: 'go_to_position', args: { position: 'exon 15', track: 'DNM3' } });
    ok(!pv.blocker, 'going to exon 15 is not refused: ' + (pv.blocker || '(none)'));
    ok(/frame it/.test(pv.text) && /100 bases/.test(pv.text),
       'and the card says it will FRAME it, with how big it is: ' + pv.text);

    await pv.capability.run(pv.args);
    ok(t.markstart === 4200 && t.markend === 4300,
       'the whole exon is selected, not one base of it: ' + t.markstart + '-' + t.markend);
    ok(framed && framed.x0 < 4200 && framed.x1 > 4301,
       'and the view is framed around it: ' + JSON.stringify(framed));
    ok(/4,200–4,301/.test(graph.said.join(' ')) || /exon 15/.test(graph.said.join(' ')),
       'with what it went to: ' + graph.said[graph.said.length - 1]);

    // An exon that does not exist says how many there are.
    pv = C.preview({ capability: 'go_to_position', args: { position: 'exon 99', track: 'DNM3' } });
    graph.said = [];
    await pv.capability.run(pv.args);
    ok(/has 15 exons, so there is no exon 99/.test(graph.said.join(' ')),
       'and a number past the end is answered with the count: ' + graph.said.join(' '));

    // A real position still behaves as a position.
    graph.said = [];
    await C.preview({ capability: 'go_to_position', args: { position: '1520', track: 'DNM3' } })
        .capability.run({ position: '1520', track: 'DNM3' });
    ok(t.markend - t.markstart === 1, 'a plain coordinate still marks one base: '
       + t.markstart + '-' + t.markend);

    // ---- several tracks: one Go each, not a guess ------------------------------------------
    // "goto exon 12" with more than one transcript open used to go straight to a single GO
    // and land on whichever track happened to be selected. Exon 12 is a different stretch on
    // every transcript, so each one that has it is offered.
    // The regions of every open track are resolved when the catalogue is built, so a second
    // track opened afterwards gets its own catalogue, exactly as a fresh ask would.
    const t2 = mkOther();
    t.markstart = t.markend = t2.markstart = t2.markend = -1;
    const graph2 = Object.assign({}, graph, { track: [t, t2], getTracks: () => [t, t2],
        said: [], selectedTrack: null });
    const C2 = await load('baja/manchester/menu/editor-capabilities.js', graph2, {});
    const multi = C2.preview({ capability: 'go_to_position', args: { position: 'exon 12' } });
    ok(!multi.blocker, 'with two tracks open, exon 12 is not refused: ' + (multi.blocker || '(none)'));
    ok(multi.choices && multi.choices.length === 2,
       'both tracks are offered: ' + (multi.choices ? multi.choices.map((o) => o.label).join(', ') : 'none'));
    ok(multi.choices && multi.choices.map((o) => o.label).join(',') === 'DNM3,DNM3-208',
       'each by name: ' + (multi.choices || []).map((o) => o.label).join(','));
    ok(!!multi.choiceTitle, 'under a question that says what is being chosen: ' + multi.choiceTitle);
    // The detail is where exon 12 IS on that track, which is the whole reason to choose.
    ok(multi.choices && /3,300\u20133,400/.test(multi.choices[0].detail)
       && /100 bases/.test(multi.choices[0].detail),
       'with where it is on the first: ' + (multi.choices || [{}])[0].detail);
    ok(multi.choices && /5,500\u20135,720/.test(multi.choices[1].detail)
       && /220 bases/.test(multi.choices[1].detail),
       'and a different place and size on the second: ' + (multi.choices || [{}, {}])[1].detail);
    ok(multi.choices && multi.choices[0].detail !== multi.choices[1].detail,
       'the two are told apart');
    // The card does not quote one track's size as if it were everybody's.
    ok(!/100 bases/.test(multi.text) && /frame it/.test(multi.text),
       'and the headline says what kind of place it is, without a size: ' + multi.text);

    // Picking one runs there, and only there.
    await multi.capability.run(multi.choices[1].args);
    ok(t2.markstart === 5500 && t2.markend === 5720,
       'the chosen track is the one that moves: ' + t2.markstart + '-' + t2.markend);
    ok(t.markstart === -1, 'and the other is left alone: ' + t.markstart + '-' + t.markend);

    // A track named in the request still skips the question.
    const named = C2.preview({ capability: 'go_to_position', args: { position: 'exon 12', track: 'DNM3-208' } });
    ok(!named.choices, 'naming a track asks nothing');
    // One track open asks nothing either.
    ok(!C.preview({ capability: 'go_to_position', args: { position: 'exon 12' } }).choices,
       'and neither does a single open track');

    // ---- zoom out is a step, not a fit ------------------------------------------------------
    ok(C.catalogue().some((c) => c.name === 'zoom'), 'zoom is an operation of its own');
    zoomed = null;
    await C.preview({ capability: 'zoom', args: { direction: 'out' } }).capability.run({ direction: 'out' });
    ok(zoomed && zoomed.x0 === 1000 && zoomed.x1 === 2000 ? false : true, 'the view changed');
    ok(zoomed && zoomed.x0 === 500 && zoomed.x1 === 2500,
       'out doubles what is shown: ' + JSON.stringify(zoomed));
    // ABOUT THE MIDDLE: zooming from a corner walks the view sideways every step.
    ok(zoomed && ((zoomed.x0 + zoomed.x1) / 2) === 1500,
       'about the middle of the screen, which stays where it is: '
       + ((zoomed.x0 + zoomed.x1) / 2));
    ok(zoomed && zoomed.y0 === -10 && zoomed.y1 === 10, 'in both directions: '
       + zoomed.y0 + '..' + zoomed.y1);

    zoomed = null;
    await C.preview({ capability: 'zoom', args: { direction: 'in' } }).capability.run({ direction: 'in' });
    ok(zoomed && zoomed.x0 === 1250 && zoomed.x1 === 1750,
       'in halves it: ' + JSON.stringify(zoomed));

    zoomed = null;
    await C.preview({ capability: 'zoom', args: { direction: 'out', amount: 8 } })
        .capability.run({ direction: 'out', amount: 8 });
    ok(zoomed && (zoomed.x1 - zoomed.x0) === 8000, 'and a bigger step is taken: '
       + (zoomed.x1 - zoomed.x0));

    const pz = C.preview({ capability: 'zoom', args: { direction: 'out' } });
    ok(/zoom out ×2/.test(pz.text), 'the card says which way and how far: ' + pz.text);

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
