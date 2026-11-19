// ADD RNA BINDING PROTEINS TO A NAMED TRACK.
//
//     node tools/test/rbp-profile-track.js
//
// "add rna binding proteins to the spag9_mrna" names the track it wants and selects
// nothing. The operation required a selection, so it was refused -- while the module
// behind it has run on a whole track all along. A selection is a scope, not a
// precondition.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let ran = null;
const load = async (p, ...a) => {
    if (('' + p).indexOf('rbp-profile.js') >= 0) {
        ran = { track: a[2], range: a[3], rbp: a[4] };
        return { ok: true };
    }
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

const mk = (name) => ({
    name: name, xi: 0, xf: 5000, sequence: 'ACGT'.repeat(1250),
    track_layers: [], annotations: [], getSelectedRanges: () => [],
    grid: { yi: 1, xi: 0, width: 10, height: -1 }
});

(async () => {
    const A = mk('SPAG9_mRNA'), B = mk('MAPK8IP3_mRNA');
    const graph = { track: [A, B], said: [], getTracks: () => [A, B],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    // Two tracks open, one named, nothing selected: the case that was refused.
    let p = C.preview({ capability: 'rbp_profile', args: { track: 'spag9_mrna' } });
    ok(!p.blocker, 'naming the track is enough, with nothing selected: ' + (p.blocker || '(none)'));
    ok(/whole of SPAG9_mRNA/.test(p.text), 'and the card says it will do the whole track: ' + p.text);
    ran = null;
    await p.capability.run(p.args);
    ok(ran && ran.track === A, 'it runs on the track that was named');
    ok(ran && ran.range === null,
       'with no range, which is how the module is told "the whole track": ' + JSON.stringify(ran && ran.range));

    // A selection on that track scopes it, rather than being required.
    A.markstart = 1000; A.markend = 1400;
    p = C.preview({ capability: 'rbp_profile', args: { track: 'SPAG9_mRNA' } });
    ok(/selected stretch of SPAG9_mRNA/.test(p.text), 'a selection narrows it: ' + p.text);
    ran = null;
    await p.capability.run(p.args);
    ok(ran && ran.range && ran.range.start === 1000 && ran.range.end === 1400,
       'and the selected range is what goes: ' + JSON.stringify(ran && ran.range));
    delete A.markstart; delete A.markend;

    // A name that matches nothing is said before the button, not after it.
    p = C.preview({ capability: 'rbp_profile', args: { track: 'nothing_like_this' } });
    ok(/no single track matches/.test(p.blocker || ''), 'an unknown name is named: ' + (p.blocker || ''));

    // The planner has to be able to find it from the words a user actually types.
    const cap = C.catalogue().find((c) => c.name === 'rbp_profile');
    ok(!!cap, 'it is in the catalogue');
    ok(/add rna binding proteins/i.test(cap.summary),
       'and its summary carries the phrase the user typed');
    ok(/rbp_competition/.test(cap.summary),
       'and says when the other one is meant instead, so they are not confused');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
