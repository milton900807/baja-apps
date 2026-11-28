// THE CANVAS, AS JSON, WRITTEN ONCE.
//
//     node tools/test/graph-to-json.js          (needs jsdom)
//
// The editor could save a design to the server and open one back, and could export almost
// everything ON the canvas, but not the canvas: "download canvas as json" came back as
// something the editor does not do. The serializer to do it already existed, buried inside
// save-obj.js, so the only question was whether the download would get its own copy.
//
// It does not, and this is why. The rules in that walk are not obvious -- keys ending in
// _transient_ are derived state and are left out, the DOM is not data, a getter that
// throws is skipped rather than fatal, and the object graph has cycles, so an object is
// written once and thereafter referred to. A second walk would have agreed with this one
// until the day one of them learned a rule the other did not, and then a downloaded canvas
// and a saved one would differ in a way nobody would think to look for.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window; global.document = dom.window.document;
global.Node = dom.window.Node; global.Window = dom.window.Window;
global.Document = dom.window.Document;
window.env = { apiUrl: '' };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f();
};

(async () => {
    const toJson = await load('manchester/io/graph-to-json.js');
    ok(typeof toJson === 'function', 'the module hands back the serializer');

    // A canvas in miniature: two tracks, a layer, a cycle, derived state, a function, a
    // node, a number that is not one.
    const graph = { name: 'dnm1-dnm3-design', xwc: 0, track: [] };
    const t1 = { name: 'DNM1', xi: 128203379, xf: 128255244, sequence: 'ACGTACGT', track_layers: [] };
    const t2 = { name: 'DNM3', xi: 171841498, xf: 172412717, sequence: 'TTGA', track_layers: [] };
    const layer = { name: 'DNM1_psi_sashimi', junctions: [{ d: 1, a: 2, mag: 0.24 }] };
    t1.track_layers.push(layer);
    layer.owner = t1;                       // a cycle, as every layer has
    t1.owner = graph; t2.owner = graph;     // and another
    graph.track.push(t1, t2);
    graph.selected = t1;                    // the same track reachable twice
    graph.__arcHits_transient_ = [{ cx: 1, cy: 2, layer: layer, track: t1 }];
    graph.canvas = document.createElement('canvas');
    graph.redraw = function () { };
    graph.zoom = NaN;
    Object.defineProperty(graph, 'boom', { enumerable: true, get() { throw new Error('nope'); } });

    const pcts = [];
    const text = await toJson(graph, (p) => pcts.push(p));

    // ---- IT IS JSON ------------------------------------------------------------------------
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    ok(!!parsed, 'what comes out parses as JSON');
    ok(parsed && parsed.name === 'dnm1-dnm3-design', 'with the canvas it was given in it');
    ok(parsed && parsed.track.length === 2, 'both tracks');
    ok(parsed && parsed.track[0].track_layers[0].junctions[0].mag === 0.24,
       'and the layer data underneath them, intact');

    // ---- AND WHAT IT LEAVES OUT ---------------------------------------------------------------
    ok(text.indexOf('__arcHits_transient_') < 0,
       'per-frame canvas geometry is derived state and is not written');
    ok(text.indexOf('ACGTACGT') >= 0, 'while the sequence, which is not, is');
    ok(parsed && parsed.redraw === undefined, 'a function is not data');
    ok(parsed && parsed.canvas === null, 'nor is a DOM node');
    ok(parsed && parsed.zoom === null, 'a number that is not one is written as null, not NaN, '
       + 'which is not JSON and would have made the whole file unreadable');
    ok(parsed && typeof parsed.boom !== 'object',
       'and a getter that throws is skipped rather than taking the write down');

    // ---- CYCLES ---------------------------------------------------------------------------------
    // Every layer points back at its track and every track at the canvas. Written naively
    // this never ends.
    ok(typeof text === 'string' && text.length < 100000,
       'a canvas full of cycles writes a small file, not an endless one: ' + text.length + ' chars');
    ok(parsed && typeof parsed.track[0].owner === 'string',
       'the second sight of an object is a mark, not the object again: '
       + JSON.stringify(parsed && parsed.track[0].owner));
    ok(parsed && typeof parsed.selected === 'string',
       'including a track the canvas names twice');

    // ---- IT REPORTS ITSELF ---------------------------------------------------------------------
    ok(pcts.length > 0 && pcts.every((p) => p >= 20 && p <= 70),
       'progress is reported between 20 and 70, which is the share of the save it is: '
       + pcts.join(','));
    let threw = false;
    try { await toJson(graph); } catch (e) { threw = true; }
    ok(!threw, 'and a caller that wants no progress does not have to pass one');

    // ---- ONE DEFINITION -------------------------------------------------------------------------
    const save = fs.readFileSync('manchester/io/save-obj.js', 'utf8');
    ok(/graph-to-json\.js/.test(save), 'the save reads the serializer from the module');
    ok(!/async function stringifyGraphAsync/.test(save),
       'and does not carry its own copy any more');
    const cap = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'download_canvas_json'/.test(cap), 'the download is an operation you can ask for');
    ok(/graph-to-json\.js/.test(cap), 'through that same module, so it writes the save’s bytes');
    ok(/download canvas as json/.test(cap),
       'and answers to the words that came back as not-something-the-editor-can-do');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
