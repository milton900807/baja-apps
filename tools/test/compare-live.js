// THE PICTURE OPENS WHEN THE WORK STARTS AND FILLS IN AS IT GOES.
//
//     node tools/test/compare-live.js          (needs jsdom)
//
// Twenty-two searches, each a round trip, then a PSI run per track, all behind a modal
// panel that looks the same whether it is working or stuck -- and the exons already
// matched, which are the answer and are worth looking at, held back until the last one
// came in. The window now opens empty, says what it is doing, and gains each match as it
// is found.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
global.EngineMonitor = class { constructor(f) { this.f = f; } };
global.log = () => { };
window.env = { apiUrl: '' };
window.innerWidth = 1200; window.innerHeight = 800;
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let hold = false, searches = 0;
const queue = [];
const load = async (p, ...a) => {
    if (/search-region-in-track\.py$/.test(p)) {
        searches++;
        const n = searches;
        if (hold) { await new Promise((r) => { queue.push(r); }); }
        return { hits: [{ x1: 1000 + n * 100, x2: 1000 + n * 100 + 150, identity: 0.9, score: 50, strand: 1 }] };
    }
    if (/splicing-profile\.js$/.test(p)) return false;      // no PSI here: the picture is the point
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const win = () => document.getElementById('baja-compare-view');
const wtext = () => (win() || { textContent: '' }).textContent;
const ribbons = () => (win() ? win().querySelectorAll('g.rb').length : 0);

const mk = (name, exons) => ({
    name: name, xi: 0, xf: 2999, sequence: 'ACGT'.repeat(750),
    track_layers: [], tgraph: { xmin: 0, xmax: 2999, X: (i) => i, yi: 0, height: 2 },
    annotations: exons.map((e, i) => ({ type: 'Exon', index: i + 1, xi: e[0], xf: e[1] })),
    getExons() { return this.annotations.slice(); },
    getSequenceRange(a, b) { return this.sequence.slice(Math.max(0, a), Math.max(0, b)); },
    selectedRange() { return null; }, addLayer(l) { this.track_layers.push(l); }
});
const graph = {
    track: [], setMessage() { }, setResultMessage() { }, setError() { }, wake() { }, rescale() { },
    clearMouseListeners() { }, setMouseMode() { }, addMouseDownListener() { }, pushOntoHistory() { },
    hideMenu() { }, showMenu() { }, getTrack() { return -1; }
};

(async () => {
    const A = mk('QUERY', [[100, 300], [500, 700], [900, 1100], [1300, 1500]]);
    const B = mk('TARGET', [[0, 2999]]);
    graph.track = [A, B];

    hold = true;                           // every search waits to be let through
    const p = load('baja/bio/match-regions.js', graph, A, B, { features: 'exons', runPsi: false });

    await sleep(60);
    ok(!!win(), 'THE WINDOW IS OPEN BEFORE THE FIRST SEARCH ANSWERS');
    ok(/QUERY/.test(wtext()) && /TARGET/.test(wtext()), 'with both tracks named: ' + wtext().slice(0, 80));
    ok(/Searching exon 1 of 4/.test(wtext()), 'saying what it is doing: ' + wtext().slice(0, 140));
    ok(!/PSI/.test(wtext()), 'and not yet explaining a stability row it has not drawn');
    ok(!!win().querySelector('svg'), 'and the empty lanes drawn, so there is something to fill');
    ok(ribbons() === 0, 'no matches yet');

    // One search through at a time: the picture gains a ribbon each time.
    const step = async () => { const r = queue.shift(); if (r) r(); await sleep(40); };
    await step();
    ok(ribbons() === 1, 'the first match appears as soon as it is found: ' + ribbons());
    ok(/1 of 4 exons matched so far/.test(wtext()), 'and the count says so: ' + wtext().slice(0, 140));
    await step();
    ok(ribbons() === 2, 'the second joins it rather than waiting for the rest: ' + ribbons());
    ok(/Searching exon 3 of 4/.test(wtext()), 'and it says which one is going now');

    hold = false;                           // let the rest run straight through
    while (queue.length) { queue.shift()(); await sleep(20); }
    await p;
    await sleep(40);

    ok(document.querySelectorAll('#baja-compare-view').length === 1,
       'ONE window at the end, not a second one over the live one');
    ok(ribbons() === 4, 'carrying every match: ' + ribbons());
    ok(!/Searching exon/.test(wtext()), 'with the progress line gone when there is no more progress');
    // The finished model, not the last progress frame: W.done() arrives after the picture
    // is drawn, and refreshing then painted the live view back over the answer.
    ok(/4 of 4/.test(wtext()) && !/matched so far/.test(wtext()),
       'and the FINISHED summary in its place, not the last progress frame: ' + wtext().slice(0, 150));
    ok(!!win().querySelector('[data-id="numbers-panel"]'),
       'with the numbers the finished model carries, which the live one has none of');
    ok(!document.getElementById('baja-working'),
       'and no modal panel over it: the window IS the feedback');

    // ---- the window is still refused when there is genuinely nothing --------------------
    {
        const v = await load('baja/bio/compare-view.js', { title: 'T', a: {}, b: {}, blocks: [], unmatched: [] });
        ok(v === null, 'an empty model with no work behind it draws nothing');
    }

    // ---- a failure stays in the window with what was found before it --------------------
    {
        const v = await load('baja/bio/compare-view.js', { live: true, title: 'T',
            a: { name: 'QUERY', x1: 0, x2: 100 }, b: { name: 'TARGET', x1: 0, x2: 100 },
            blocks: [], unmatched: [], status: 'Searching exon 2 of 9' });
        ok(!!v && !!v.update, 'a live window hands back a way to fill it in');
        v.update({ live: true, title: 'T', a: { name: 'QUERY', x1: 0, x2: 100 },
            b: { name: 'TARGET', x1: 0, x2: 100 }, blocks: [], unmatched: [],
            problem: 'the target track has no sequence to search' });
        const t = v.el.textContent;
        ok(/no sequence to search/.test(t) && !/Searching exon 2 of 9/.test(t),
           'a failure replaces the progress rather than sitting under it: ' + t.slice(0, 120));
        v.destroy();
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
