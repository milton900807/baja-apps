// AN EXON-MENU ITEM MUST DRAW BEFORE ITS FIRST AWAIT.
//
//     node tools/test/menu-draws-before-await.js
//
// A floating menu ends its session ~80 ms after an item's click returns, unless that item
// opened another menu. An async click returns to the menu system the moment it first
// awaits, so an item that awaits its work and only then calls showSideMenu is drawing into
// a session that has already closed: the item does nothing at all, visibly.
//
// This shipped twice -- Predict effect of removing, then Redirect acceptor (AG scan) --
// because the fix was written into one item rather than pinned as a rule. It is a rule:
// every item that awaits anything draws first.
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
    ok(typeof MF['Exon'] === 'function', 'the factory offers an Exon menu');

    const SEQ = 'ACGT'.repeat(4000);
    const exon = { type: 'Exon', name: 'e16', index: 16, xi: 4000, xf: 4200, strand: '+' };
    const prev = { type: 'Exon', name: 'e15', index: 15, xi: 2000, xf: 2300, strand: '+' };
    const track = {
        name: 'T', xi: 0, xf: 16000, strand: 1, sequence: SEQ,
        annotations: [prev, exon], getExons: () => [prev, exon],
        tgraph: { X: (x) => x, Y: (y) => y },
        generateORF() { }, removeAnnotation() { }
    };
    const drawn = [];
    const graph = {
        track: [track], getTracks: () => [track], selectedTrack: track,
        setMessage() { }, setResultMessage() { }, wake() { },
        showSideMenu: (...a) => { drawn.push(a); },
        canvas: { width: 1200, height: 800 }
    };

    // The menu nests, so items are collected wherever they sit.
    const items = [];
    const walk = (v, depth) => {
        if (!v || depth > 6) return;
        if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
        if (typeof v !== 'object') return;
        if (typeof v.label === 'string' && typeof v.click === 'function') items.push(v);
        for (const k of ['items', 'children', 'menu', 'rows']) if (v[k]) walk(v[k], depth + 1);
    };
    // The items the user sees are built inside the top-level Exon item's own click and
    // handed to showSideMenu, so the submenu has to be opened before they exist at all.
    const top = MF['Exon'](exon, track, graph, {}, 0);
    walk(top, 0);
    const opener = items.filter((i) => i.label === 'Exon')[0];
    ok(!!opener, 'the Exon menu opens a submenu');
    drawn.length = 0;
    await opener.click(0, 0);
    ok(drawn.length > 0, 'which it draws: ' + drawn.length);
    items.length = 0;
    for (const call of drawn) walk(call[0], 0);
    ok(items.length > 3, 'the submenu has the exon items in it: ' + items.length);

    const byLabel = (needle) => items.filter((i) => i.label.toLowerCase().indexOf(needle) >= 0)[0];

    // An async function runs synchronously up to its first await, so calling click without
    // awaiting it and looking straight away is exactly the menu system's own view.
    const drawsFirst = async (item) => {
        drawn.length = 0;
        let pr = null;
        try { pr = item.click(0, 0); } catch (e) { return { sync: false, threw: e }; }
        const sync = drawn.length > 0;
        try { await pr; } catch (e) { }
        return { sync: sync, after: drawn.length };
    };

    for (const needle of ['redirect acceptor', 'predict effect of removing']) {
        const item = byLabel(needle);
        ok(!!item, 'found "' + needle + '"');
        if (!item) continue;
        const r = await drawsFirst(item);
        ok(r.sync, '"' + item.label + '" draws BEFORE its first await'
            + (r.threw ? (' (threw: ' + r.threw + ')') : ''));
        ok(r.after >= 1, 'and still ends with something on screen: ' + r.after + ' draws');
    }

    // THE RULE, not the two known cases: any item whose click is async and which draws at
    // all must draw before it awaits. An item that draws nothing is not making this
    // mistake -- it may open a modal or act directly -- so it is not held to it.
    const asyncItems = items.filter((i) =>
        Object.prototype.toString.call(i.click) === '[object AsyncFunction]');
    ok(asyncItems.length >= 2, 'several items are async: ' + asyncItems.length);
    const offenders = [];
    for (const item of asyncItems) {
        const r = await drawsFirst(item);
        if (!r.sync && r.after > 0) offenders.push(item.label);
    }
    ok(offenders.length === 0,
       'no async item draws only after awaiting: ' + (offenders.join(', ') || 'none'));

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
