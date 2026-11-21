// ADD THIS MUTATION R237W TO THE DNM1 TRACK.
//
//     node tools/test/add-named-variant.js
//
// The facility existed -- "Describe a variant" in the data library, which resolves a change
// against the track's own coding sequence and places a marker -- and the ask box could not
// reach it. So the planner reported that the editor does not do this at all, which the
// editor's own data library disproves.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const execd = [];
const STUB = { 'baja/data/variant-from-prompt.js': 1 };
const load = async (p, ...a) => {
    if (STUB[p]) { execd.push({ p: p, a: a }); return Promise.resolve(true); }
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

const mkTrack = (name) => ({ name: name, xi: 0, xf: 3000, sequence: 'A'.repeat(3000),
    annotations: [{ type: 'Translation', xi: 100, xf: 2900 }], track_layers: [],
    markstart: -1, markend: -1, getSelectedRanges: () => [],
    tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 3000 } });

(async () => {
    const a = mkTrack('DNM1'), b = mkTrack('DNM3');
    const graph = { track: [a, b], getTracks: () => [a, b], said: [],
        canvas: { width: 1200, height: 800 },
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); },
        clearSequenceSelections() { }, wake() { }, showSideMenu() { } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    const cap = C.catalogue().find((c) => c.name === 'add_variant_from_description');
    ok(!!cap, 'the ask box can reach it now');
    ok(cap && /R237W/.test(cap.summary), 'and the catalogue says so in the words people use: '
       + (cap ? cap.summary.slice(0, 70) : ''));
    ok(cap && /load_variants/.test(cap.summary),
       'while pointing database lookups at the operation that does those');

    const pv = C.preview({ capability: 'add_variant_from_description',
        args: { description: 'R237W', track: 'DNM1' } });
    ok(!pv.blocker, 'the request is not refused: ' + (pv.blocker || '(none)'));
    ok(/R237W/.test(pv.text) && /DNM1/.test(pv.text), 'the card names the change and the track: ' + pv.text);
    // THE CHECK IS THE POINT, and the card says so before anything is placed.
    ok(/coding sequence/.test(pv.text), 'and that it is checked first: ' + pv.text);

    execd.length = 0;
    await pv.capability.run({ description: 'R237W', track: 'DNM1' });
    const call = execd.find((e) => e.p === 'baja/data/variant-from-prompt.js');
    ok(!!call, 'running it reaches the resolver: ' + JSON.stringify(execd.map((e) => e.p)));
    ok(call && Array.isArray(call.a[3]) && call.a[3][0] === a,
       'pinned to the track that was named: ' + (call && call.a[3] && call.a[3][0] && call.a[3][0].name));
    ok(call && call.a[4] === 'R237W',
       'carrying the change alone, not the sentence around it: ' + JSON.stringify(call && call.a[4]));

    // A change with no track named, with two open, is a choice like every other.
    const multi = C.preview({ capability: 'add_variant_from_description', args: { description: 'R237W' } });
    ok(!multi.blocker && multi.choices && multi.choices.length === 2,
       'two tracks open: one Go each: ' + (multi.blocker || (multi.choices || []).length));
    // And a request with no change in it is refused, since there is nothing to place.
    const empty = C.preview({ capability: 'add_variant_from_description', args: { track: 'DNM1' } });
    ok(!empty.ok, 'no change named, nothing placed: ' + JSON.stringify({ ok: empty.ok, blocker: empty.blocker, why: empty.why }));

    // The local matcher sends this wording here rather than to the database loader.
    const near = C.suggest('add this mutation R237W to the DNM1 track', 3);
    ok(near.some((c) => c.name === 'add_variant_from_description'),
       'and the editor places the request itself: ' + near.map((c) => c.name).join(', '));
    // It is NOT the ClinVar path: no database or clinical class is named in that sentence.
    ok(!C.localPlan('add this mutation R237W to the DNM1 track'),
       'the ClinVar shortcut does not swallow it');

    // The planner is told what the editor CAN do, not only what it cannot: context that
    // lists prohibitions alone turns into a refusal of the catalogue's own operations.
    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8').replace(/\s+/g, ' ');
    ok(/place a change named in the request itself on a track as a marker/.test(plan),
       'the planner knows this is one of the things it can do');
    ok(/base by base against that track's own coding sequence/.test(plan),
       'and on what terms: the check is part of the description');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
