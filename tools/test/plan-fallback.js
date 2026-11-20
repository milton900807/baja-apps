// A PLAN THAT COULD NOT BE MADE IS NOT THE END OF THE ASK BOX.
//
//     node tools/test/plan-fallback.js
//
// "add pathological mutations in selected sequence on smn1" was declined by the planner as
// a request to create something harmful. In this editor it is load_variants with ClinVar
// over the selection: the annotation job every genome browser does. The card said "Could
// not read that" and stopped, leaving a correct request nowhere to go.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
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
    const t = { name: 'SMN1', xi: 0, xf: 4000, sequence: 'A'.repeat(4000), annotations: [],
        track_layers: [], markstart: 100, markend: 192, getSelectedRanges: () => [[100, 192]],
        tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 4000 } };
    const graph = { track: [t], getTracks: () => [t], said: [],
        canvas: { width: 1200, height: 800 },
        setMessage() { }, setResultMessage() { } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    ok(typeof C.suggest === 'function', 'the catalogue can place a request by itself');

    const near = C.suggest('add pathological mutations in selected sequence on smn1', 3);
    ok(near.length > 0, 'and places this one: ' + near.map((c) => c.name).join(', '));
    ok(near.some((c) => c.name === 'load_variants'),
       'on the operation that actually does it: ' + near.map((c) => c.name).join(', '));
    ok(near[0].name === 'load_variants',
       'and leads with it, rather than burying it: ' + near.map((c) => c.name + '(' + c.score + ')').join(' '));

    // The synonyms are the point: nobody types the catalogue's own spelling.
    for (const [said, want] of [
        ['load clinvar pathogenic snps', 'load_variants'],
        ['show me the disease variants', 'load_variants'],
        ['step through the exons', 'tour_regions'],
        ['what does skipping each exon do to the protein', 'exon_protein_consequence']
    ]) {
        const g = C.suggest(said, 3);
        ok(g.some((c) => c.name === want),
           '"' + said + '" reaches ' + want + ': ' + g.map((c) => c.name).join(', '));
    }

    // The verb steers it: the same nouns asked as a question want a different operation.
    const asked = C.suggest('are any of these pathogenic', 3);
    ok(asked.length && /^ask_/.test(asked[0].name),
       'a question leads with the operation that answers one: ' + asked.map((c) => c.name).join(', '));

    // A guess is OFFERED, never taken: suggest returns names, it does not run anything.
    ok(near.every((c) => c.name && c.summary && !('run' in c)),
       'what comes back is a name and a summary, not something to run');
    ok(C.suggest('').length === 0, 'and an empty request gets no guesses');
    // One shared word is a coincidence. Every summary in the catalogue mentions tracks.
    const noise = C.suggest('the track');
    ok(noise.length <= 3, 'a word every operation shares does not suggest the whole catalogue: ' + noise.length);

    // The card wires it: a failed plan shows the guesses and each one opens its own card.
    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/const planFailed = \(why\) => \{/.test(cmd), 'the command card has one path for a failed plan');
    ok((cmd.match(/^\s*planFailed\(/gm) || []).length >= 2,
       'used for a thrown error and for a non-OK answer alike, not only one of them');
    // The dead end it replaced survives only where it is being explained.
    const deadEnds = cmd.split('\n').filter((l) => /Could not read that/.test(l) && !/^\s*\/\//.test(l));
    ok(!deadEnds.length, 'and the dead end it replaced is gone: ' + JSON.stringify(deadEnds));
    ok(/data-cap=/.test(cmd) && /render\(\{ status: 'OK', steps: \[\{ capability: b\.getAttribute/.test(cmd),
       'each guess opens the ordinary card for that operation, with no arguments guessed');

    // The planner is told what the editor is, which is why a request like this reads as
    // annotation rather than as something to refuse.
    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8');
    ok(/read-only viewer/.test(plan) && /public databases/.test(plan),
       'the planner is told the editor only reads databases and draws');
    ok(/Nothing it does alters an organism, a cell, or any\s+"?\s*"?sequence outside this picture/.test(plan.replace(/\n\s*/g, ' ')),
       'and that nothing it does reaches outside the picture');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
