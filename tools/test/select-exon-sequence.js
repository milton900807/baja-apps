// SELECT EXON SEQUENCE, from the exon's own menu.
//
//     node tools/test/select-exon-sequence.js
//
// A selection is how the editor says "over this stretch" to loading variants, running a
// model, designing against a region or copying bases out. Getting one over an exon meant
// dragging it by hand, with the ends landing wherever the mouse did.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : p + '.js';
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
    const MF = await load('baja/manchester/menu/menu-factory.js');
    const exon = { type: 'Exon', name: 'e6', index: 6, xi: 4000, xf: 4200, strand: '+' };
    const other = { type: 'Exon', name: 'e5', index: 5, xi: 2000, xf: 2300, strand: '+' };
    const cleared = [];
    const track = {
        name: 'DNM3', xi: 0, xf: 16000, strand: 1, sequence: 'ACGT'.repeat(4000),
        annotations: [other, exon], getExons: () => [other, exon],
        markstart: 10, markend: 99, kept: 0,
        keepOneMark() { this.kept++; },
        tgraph: { X: (x) => x * 2, Y: (y) => y },
        generateORF() { }, removeAnnotation() { }
    };
    const said = [];
    const drawn = [];
    const graph = {
        track: [track], getTracks: () => [track], selectedTrack: null,
        setMessage: (m) => said.push('' + m), setResultMessage: (m) => said.push('' + m),
        wake() { }, clearSequenceSelections() { cleared.push(1); },
        showSideMenu: (...a) => { drawn.push(a); },
        canvas: { width: 1200, height: 800 }
    };

    const items = [];
    const walk = (v, depth) => {
        if (!v || depth > 6) return;
        if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
        if (typeof v !== 'object') return;
        if (typeof v.label === 'string' && typeof v.click === 'function') items.push(v);
        for (const k of ['items', 'children', 'menu', 'rows']) if (v[k]) walk(v[k], depth + 1);
    };
    const top = MF['Exon'](exon, track, graph, {}, 0);
    walk(top, 0);
    const opener = items.filter((i) => i.label === 'Exon')[0];
    if (opener) { await opener.click(0, 0); for (const a of drawn) walk(a[0], 0); }

    const item = items.filter((i) => i.label === 'Select exon sequence')[0];
    ok(!!item, 'the exon menu offers it: ' + items.map((i) => i.label).join(' | '));

    drawn.length = 0;
    const r = item.click(0, 0);
    // NOTHING IS AWAITED: a floating menu ends its session ~80 ms after the click returns,
    // and an async click returns at its first await.
    ok(!r || typeof r.then !== 'function', 'and does its work outright, without awaiting');

    ok(track.markstart === 4000 && track.markend === 4200,
       'the exon is selected end to end: ' + track.markstart + '-' + track.markend);
    ok(cleared.length === 1 && track.kept === 1,
       'replacing what was selected before, not adding to it: cleared ' + cleared.length + ', kept ' + track.kept);
    ok(track.showResizeBar === true, 'with the handles up, as a dragged selection has');
    // World coordinates, which is what zoom-to-selection reads.
    ok(graph.startX === 8000 && graph.endX === 8400,
       'and in world coordinates, so zoom-to-selection finds it: ' + graph.startX + '-' + graph.endX);
    ok(graph.selectedTrack === track, 'on the track the exon belongs to');
    ok(drawn.some((a) => a[0] === null), 'the menu closes behind it');
    ok(said.some((m) => /200 nt/.test(m)), 'and it says what it selected: ' + said.join(' / '));

    // An exon with no span says so rather than selecting nothing.
    said.length = 0;
    const bad = { type: 'Exon', name: 'e0', index: 0, xi: 500, xf: 500, strand: '+' };
    const items2 = [];
    const walk2 = (v, d) => {
        if (!v || d > 6) return;
        if (Array.isArray(v)) { for (const x of v) walk2(x, d + 1); return; }
        if (typeof v !== 'object') return;
        if (typeof v.label === 'string' && typeof v.click === 'function') items2.push(v);
        for (const k of ['items', 'children', 'menu', 'rows']) if (v[k]) walk2(v[k], d + 1);
    };
    drawn.length = 0;
    walk2(MF['Exon'](bad, track, graph, {}, 0), 0);
    const open2 = items2.filter((i) => i.label === 'Exon')[0];
    if (open2) { await open2.click(0, 0); for (const a of drawn) walk2(a[0], 0); }
    const it2 = items2.filter((i) => i.label === 'Select exon sequence')[0];
    track.markstart = 10; track.markend = 99;
    it2.click(0, 0);
    ok(track.markstart === 10 && track.markend === 99, 'a zero-length exon changes nothing');
    ok(said.some((m) => /no span/.test(m)), 'and says why: ' + said.join(' / '));

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
