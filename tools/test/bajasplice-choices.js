// RUNNING A MODEL WITH SEVERAL TRACKS OPEN IS A CHOICE, NOT A REFUSAL.
//
//     node tools/test/bajasplice-choices.js
//
// "run bajasplice psi" with two transcripts open ended at "cannot run: say which track to
// run it on: there is more than one open", over a Cancel button -- answering a request for
// a model by closing. Every open track gets its own Go; and where nothing can run at all,
// the card offers the shelf the model lives on.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const execd = [];
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    if (!fs.existsSync(path)) { execd.push({ p: p, a: a }); return null; }
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
// The model run and the shelf are recorded rather than executed: both reach for a server.
const STUB = { 'baja/bio/splicing/splicing-profile.js': 1, 'baja/ml/models-library.js': 1 };
const exec2 = (p, ...a) => { if (STUB[p]) { execd.push({ p: p, a: a }); return Promise.resolve(null); } return load(p, ...a); };
global.lion_engine = { exec: exec2, createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const exon = (xi, xf) => ({ type: 'Exon', xi: xi, xf: xf });
const mkTrack = (name, nExons, len) => {
    const anns = [];
    for (let i = 0; i < nExons; i++) anns.push(exon(i * 300, i * 300 + 100));
    return { name: name, xi: 0, xf: len, sequence: 'A'.repeat(len), annotations: anns,
        track_layers: [], markstart: -1, markend: -1, getSelectedRanges: () => [],
        tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: len, xmin: 0, xmax: len, yi: 0, height: 1 } };
};

(async () => {
    const a = mkTrack('DNM3', 15, 4500), b = mkTrack('DNM3-208', 13, 6500);
    const graph = {
        track: [a, b], said: [], getTracks: () => [a, b],
        canvas: { width: 1200, height: 800 },
        grid: { getxmin: () => 0, getxmax: () => 100, getymin: () => -5, getymax: () => 5 },
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); },
        clearSequenceSelections() { }, wake() { }, showSideMenu() { },
        zoomRect() { return Promise.resolve(); }, viewAllTracks() { return Promise.resolve(); }
    };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});

    for (const [cap, who] of [['exon_inclusion_psi', 'PSINet'], ['splice_site_strength', 'SpliceNet']]) {
        const pv = C.preview({ capability: cap, args: {} });
        ok(!pv.blocker, who + ' with two tracks open is not refused: ' + (pv.blocker || '(none)'));
        ok(pv.choices && pv.choices.length === 2,
           who + ' offers a Go per track: ' + (pv.choices ? pv.choices.map((o) => o.label).join(', ') : 'none'));
        ok(!!pv.choiceTitle && /which track/i.test(pv.choiceTitle),
           'under a question naming the model: ' + pv.choiceTitle);
        ok(pv.choices && pv.choices[0].detail && pv.choices[1].detail
           && pv.choices[0].detail !== pv.choices[1].detail,
           'each saying something that tells them apart: ' + (pv.choices || []).map((o) => o.detail).join(' | '));
    }

    // PSI counts the annotated exons, which is what it actually reads.
    const psi = C.preview({ capability: 'exon_inclusion_psi', args: {} });
    ok(/15 annotated exons/.test(psi.choices[0].detail) && /13 annotated exons/.test(psi.choices[1].detail),
       'PSI says how many exons each has: ' + psi.choices.map((o) => o.detail).join(' | '));

    // Picking one runs the model on THAT track, in psi mode.
    execd.length = 0;
    await psi.capability.run(psi.choices[1].args);
    const ran = execd.find((e) => e.p === 'baja/bio/splicing/splicing-profile.js');
    ok(!!ran, 'choosing one runs the profile: ' + JSON.stringify(execd.map((e) => e.p)));
    ok(ran && ran.a[2] === b, 'on the track that was chosen, not the first one: '
       + (ran && ran.a[2] && ran.a[2].name));
    ok(ran && ran.a[4] === 'psi', 'in psi mode: ' + (ran && ran.a[4]));

    // Naming a track still skips the question.
    ok(!C.preview({ capability: 'exon_inclusion_psi', args: { track: 'DNM3-208' } }).choices,
       'naming a track asks nothing');

    // ---- stuck: the model has somewhere to send you ---------------------------------------
    const named = C.preview({ capability: 'exon_inclusion_psi', args: { track: 'nothing-like-this' } });
    ok(!!named.blocker, 'a track name matching nothing still refuses: ' + named.blocker);
    ok(!!named.whenStuck && !!named.whenStuck.label,
       'and the card is given somewhere to go: ' + (named.whenStuck && named.whenStuck.label));
    execd.length = 0;
    await named.whenStuck.run();
    ok(execd.some((e) => e.p === 'baja/ml/models-library.js'),
       'which opens the shelf of models: ' + JSON.stringify(execd.map((e) => e.p)));

    // An operation with nowhere particular to send you says so, rather than inventing one.
    const other = C.preview({ capability: 'go_to_position', args: { position: 'banana' } });
    ok(!other.whenStuck, 'an operation with no interface of its own offers none');

    // The card only shows it when NOTHING can run: with choices on offer there is no refusal.
    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/const __stuck = \(!runnable\.length && good\.length === 1\) \? good\[0\]\.p\.whenStuck : null;/.test(cmd),
       'the card reaches for it only when no step can run');
    ok(/id="ec-stuck"/.test(cmd) && /stuckEl\.onclick/.test(cmd),
       'and wires the button it draws');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
