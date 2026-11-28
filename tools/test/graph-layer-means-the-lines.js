// "REMOVE ALL GRAPH LAYERS" MEANS THE LINES, NOT THE LAYERS ON THE TRACKS.
//
//     node tools/test/graph-layer-means-the-lines.js
//
// The editor calls a set of lines drawn between two tracks a GRAPH LAYER, because that is
// what the menu on each line says. The phrase is one adjective away from "remove all
// layers", and read that way the request deletes work that took a scan to produce, was
// never asked about and is not coming back, while the lines it was actually about stay on
// the screen. That is why this is decided in the editor rather than asked of a model.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

global.window = { env: { apiUrl: '' } };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const mkLayer = (n) => ({ name: n, visible: true, intervals: [] });
const mkGraph = () => {
    const t1 = { name: 'DNM1', track_layers: [mkLayer('DNM1_SIM70_3'), mkLayer('DNM1_RBP_FUS')],
                 tgraph: { yi: 1, X: (v) => v, Y: (f) => f } };
    const t2 = { name: 'DNM3', track_layers: [mkLayer('DNM3_sites')],
                 tgraph: { yi: 2, X: (v) => v, Y: (f) => f } };
    return { track: [t1, t2], wake: () => { }, X: (v) => v, Y: (v) => v,
             setMessage: (m) => said.push(m), setResultMessage: (m) => said.push(m) };
};
const last = () => said[said.length - 1] || '';

(async () => {
    const g = mkGraph();
    const CAP = await load('baja/manchester/menu/editor-capabilities.js', g, {});

    // ---- THE PHRASE IS DECIDED, NOT GUESSED ----------------------------------------------
    const d = CAP.decide('remove all graph layers');
    ok(!!d && d.capability === 'remove_track_links',
       '"remove all graph layers" is the lines: ' + (d && d.capability));
    for (const phrase of ['remove the graph layer', 'delete all graph layers',
        'clear the graph layers', 'get rid of the graph layer', 'drop graph layers']) {
        const x = CAP.decide(phrase);
        ok(!!x && x.capability === 'remove_track_links', 'and so is "' + phrase + '"');
    }

    // The near-miss it exists to prevent, and the sentences it must not take.
    ok(!CAP.decide('remove all layers'), '"remove all layers" is NOT taken: that is the track layers');
    ok(!CAP.decide('remove the RBP layers'), 'nor a named layer');
    ok(!CAP.decide('show the graph layers'), 'and showing them is not removing them');
    ok(!CAP.decide('load clinvar pathogenic snps'), 'and an unrelated sentence goes to the planner');

    // ---- IT DOES WHAT IT SAYS ---------------------------------------------------------------
    const A = g.track[0], B = g.track[1];
    await load('baja/bio/compare/track-link-layer.js', g,
        [{ from: { track: A, start: 1, end: 2 }, to: { track: B, start: 3, end: 4 }, label: '90%' }],
        { id: 'sim' });
    ok((g.__linkPainters || []).length === 1, 'there is a set of lines to remove');
    const cap = (CAP.list || []).filter((c) => c.name === 'remove_track_links')[0];
    ok(!!cap, 'the operation is there');
    said.length = 0;
    const r = await cap.run({});
    ok(r && r.removed === 1, 'it takes the lines off: ' + JSON.stringify(r));
    ok((g.__linkPainters || []).length === 0, 'none left on the canvas');
    ok((g.__linkSets || []).length === 0, 'and none left in the document either');
    // THE TRACK LAYERS ARE UNTOUCHED. This is the whole point.
    ok(A.track_layers.length === 2 && B.track_layers.length === 1,
       'and every layer on every track is still there: '
       + A.track_layers.length + ' + ' + B.track_layers.length);
    ok(/still there/.test(last()), 'which it says: ' + last());

    // Nothing to remove is an answer, not a silent no-op.
    said.length = 0;
    const r2 = await cap.run({});
    ok(r2 && r2.removed === 0 && /no lines between tracks/.test(last()),
       'with none on the canvas it says so: ' + last());

    // ---- AND THE PLANNER IS TOLD TWICE ---------------------------------------------------------
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/GRAPH LAYER IS A SET OF THESE LINES/.test(caps), 'the lines claim the phrase');
    const layers = caps.slice(caps.indexOf("name: 'remove_layers'"), caps.indexOf("name: 'remove_layers'") + 2500);
    ok(/A GRAPH LAYER IS NOT ONE OF THESE/.test(layers), 'and the track layers disown it');
    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/CAP\.decide \? CAP\.decide\(ask\) : null/.test(cmd),
       'the command bar asks the editor before it asks a model');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
