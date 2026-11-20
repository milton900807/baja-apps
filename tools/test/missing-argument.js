// A MISSING ARGUMENT IS A QUESTION, NOT A DEAD END.
//
//     node tools/test/missing-argument.js
//
// "add pathologic mutations to selected sequence" came back as "Nothing in the editor
// does that", under the note "refused: needs db and none was given". Both halves were
// wrong as an answer: the editor does exactly that -- load_variants over the selection --
// and the refusal already knew which argument was missing and every value that would
// have been accepted. One word short is not nothing.
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
        track_layers: [], markstart: 100, markend: 153, getSelectedRanges: () => [[100, 153]],
        tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 4000 } };
    const graph = { track: [t], getTracks: () => [t], said: [],
        canvas: { width: 1200, height: 800 },
        setMessage() { }, setResultMessage() { } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    // The exact step the planner produced for that request.
    const p = C.preview({ capability: 'load_variants', args: {} });
    ok(!p.ok, 'a step with no db is still refused, not guessed at: ' + p.text);
    ok(p.missing === 'db', 'and the refusal names the argument: ' + p.missing);
    ok(Array.isArray(p.missingValues) && p.missingValues.length >= 2,
       'and carries every value that would be accepted: ' + JSON.stringify(p.missingValues));
    ok(p.missingValues.indexOf('clinvar') >= 0,
       'including the one this request wants: ' + JSON.stringify(p.missingValues));
    ok(!!p.missingAbout, 'and what the argument means, so the choice is informed');
    ok(p.capability && p.capability.name === 'load_variants',
       'the capability travels with it, so the card can name it');

    // THE OFFER IS NOT A SUBSTITUTION. Nothing may fill the argument on the user's behalf:
    // loading ClinVar when they did not say ClinVar would do something they did not ask
    // for and report it as what they asked for.
    ok(p.args == null || p.args.db == null, 'nothing was filled in on the way past');

    // Supplying it is all that was needed.
    const q = C.preview({ capability: 'load_variants', args: { db: 'clinvar' } });
    ok(q.ok, 'with the argument supplied the same step is runnable');
    ok(/clinvar/.test(q.text || ''), 'and says what it will do: ' + q.text);
    ok(/selected sequence/.test(q.text || ''),
       'over the selection, which is what was asked for: ' + q.text);

    // A rejected VALUE is a different case and must stay a refusal: there is nothing to
    // offer, because the user did name a database and it is not one of these.
    const bad = C.preview({ capability: 'load_variants', args: { db: 'ensembl' } });
    ok(!bad.ok, 'a database that does not exist is still refused: ' + bad.text);
    ok(!bad.missing, 'and is not turned into a question, since nothing is missing');

    // A required argument on another operation gets the same treatment, so this is a
    // property of the validator and not a special case written around one capability.
    const ls = C.preview({ capability: 'load_layer_set', args: {} });
    ok(!ls.ok && ls.missing === 'set', 'the same holds for load_layer_set: ' + ls.missing);
    ok(Array.isArray(ls.missingValues) && ls.missingValues.length > 0,
       'with its own values offered: ' + (ls.missingValues || []).slice(0, 3).join(', ') + '...');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
