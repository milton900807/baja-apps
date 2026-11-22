// "HOW DO I MAKE DNM3 TRANSLATE LIKE DNM1" HAS TO REACH THE SEARCH.
//
//     node tools/test/plan-peptide-rescue.js
//
// The engine and the picture are no use if a typed request cannot get to them. This
// checks the operation is declared, that the words people use for it are in the
// catalogue, and above all that it knows WHICH track is being copied and which is being
// edited: those are not interchangeable here, and editing the wrong one of a pair
// produces a plan for a transcript nobody asked about, which still looks like an answer.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let searched = null, drew = null;
const load = async (p, ...a) => {
    if (('' + p).indexOf('exon-plan-search') >= 0) {
        searched = { source: a[0], into: a[1], opts: a[2] };
        return { ok: true, source: { name: a[0].name, length: 100 }, target: { name: a[1].name, exons: 3 },
            baseline: { fit: 0.5, matched: 40, length: 90, roles: [] },
            plans: [{ edits: [{ kind: 'lose', n: 2, label: 'skip exon 2' }], roles: [], induced: [],
                peptide: 'M', length: 80, matched: 70, fit: 0.8, gain: 0.3, nmd: 'escapes' }] };
    }
    if (('' + p).indexOf('exon-plan-view') >= 0) { drew = a[0]; return { destroy() { } }; }
    if (('' + p).indexOf('working.js') >= 0) return { step() { }, done() { }, fail() { } };
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const mk = (name) => ({ name: name, markstart: null, markend: null, marks: [],
    orf: { cdsi: [1] }, getSelectedRanges: () => [] });
const mkCap = async (ts) => {
    const graph = { track: ts, said: [], getTracks: () => ts,
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    return { C: await load('baja/manchester/menu/editor-capabilities.js', graph, {}), graph };
};
const go = async (C, args) => {
    searched = null; drew = null;
    const p = C.preview({ capability: 'plan_peptide_rescue', args: args || {} });
    if (p.ok && !p.blocker) await p.capability.run(p.args);
    return p;
};

(async () => {
    const A = mk('DNM1'), B = mk('DNM3'), X = mk('SPAG9');
    let { C, graph } = await mkCap([A, B]);
    const cap = C.list.filter((c) => c.name === 'plan_peptide_rescue')[0];
    ok(!!cap, 'the operation is declared');

    // ---- the words that have to land on it -----------------------------------------------
    const sum = cap.summary + ' ' + Object.keys(cap.params).map((k) => cap.params[k].about || '').join(' ');
    for (const w of ['cryptic', 'induce', 'skip', 'intron', 'frame', 'peptide']) {
        ok(new RegExp(w, 'i').test(sum), 'the catalogue says "' + w + '"');
    }
    ok(/does NOT compare the two as they stand/.test(cap.summary),
       'and says what it is NOT, so a plain comparison does not land here');

    // ---- which one is copied, which one is edited -------------------------------------------
    let p = await go(C, { source: 'DNM1', into: 'DNM3' });
    ok(searched && searched.source.name === 'DNM1' && searched.into.name === 'DNM3',
       'named outright: ' + JSON.stringify(searched && [searched.source.name, searched.into.name]));
    ok(/which exons of DNM3 to lose or keep/.test(p.text)
       && /as close as possible to DNM1/.test(p.text),
       'and the card says which way round before anything runs: ' + p.text);

    await go(C, { source: 'DNM3', into: 'DNM1' });
    ok(searched && searched.source.name === 'DNM3' && searched.into.name === 'DNM1',
       'the other way round is a different question, and gets it: '
       + JSON.stringify(searched && [searched.source.name, searched.into.name]));

    // By position, like the comparison.
    await go(C, { source: 'track 1', into: 'track 2' });
    ok(searched && searched.source.name === 'DNM1' && searched.into.name === 'DNM3',
       'tracks can be pointed at rather than named: '
       + JSON.stringify(searched && [searched.source.name, searched.into.name]));

    // One named, one open: the other one is the other one.
    await go(C, { source: 'DNM1' });
    ok(searched && searched.into.name === 'DNM3', 'naming one of two is enough: '
       + JSON.stringify(searched && [searched.source.name, searched.into.name]));

    // ---- the picture gets what the search produced -------------------------------------------
    await go(C, { source: 'DNM1', into: 'DNM3' });
    ok(drew && drew.plans && drew.plans.length === 1, 'the plans are drawn: ' + JSON.stringify(!!drew));
    ok(graph.said.some((m) => /1 plan, best 80\.0% fit from 50\.0%/.test(m)),
       'and the result line says what it got to, counting in English: ' + graph.said.slice(-1)[0]);

    // ---- nothing to improve is an answer, not a failure ----------------------------------------
    {
        const quiet = async (p2, ...a) => {
            if (('' + p2).indexOf('exon-plan-search') >= 0) {
                return { ok: true, source: { name: 'DNM1', length: 100 }, target: { name: 'DNM3', exons: 3 },
                    baseline: { fit: 0.77, matched: 70, length: 90, roles: [] }, plans: [] };
            }
            return load(p2, ...a);
        };
        global.lion_engine = { exec: quiet };
        const C2 = (await mkCap([A, B])).C;
        const g2 = { said: [] };
        const pv = C2.preview({ capability: 'plan_peptide_rescue', args: { source: 'DNM1', into: 'DNM3' } });
        drew = null;
        await pv.capability.run(pv.args);
        ok(drew === null, 'no window is opened when there is nothing to show');
        global.lion_engine = { exec: (p2, ...a) => load(p2, ...a) };
    }

    // ---- three open tracks and none named: OFFER them, do not refuse ---------------------
    // This came back from the editor as "cannot run: two tracks are needed, one to copy and
    // one to edit, and these did not resolve to two: DNM3, DNM3_mRNA, DNM1" -- a refusal
    // that listed the very tracks it could have offered. Which way round matters here, so
    // both directions are offered rather than a pair being assumed.
    {
        const C3 = (await mkCap([A, B, X])).C;
        const q = C3.preview({ capability: 'plan_peptide_rescue', args: {} });
        ok(!q.blocker, 'it does not refuse: ' + (q.blocker || '(no blocker)'));
        ok(q.choices && q.choices.length === 6,
           'every ordered pair of the three is on offer: '
           + (q.choices || []).map((c) => c.label).join(' | '));
        ok((q.choices || []).some((c) => /copy DNM1 . edit DNM3/.test(c.label))
           && (q.choices || []).some((c) => /copy DNM3 . edit DNM1/.test(c.label)),
           'in both directions, because they are different questions');
        ok((q.choices || []).every((c) => /whose exons the plan changes/.test(c.detail || '')),
           'each saying which track it would edit');

        // Pressing one runs that pair, and nothing else.
        const chosen = q.choices.filter((c) => /copy DNM1 . edit DNM3/.test(c.label))[0];
        searched = null;
        await q.capability.run(chosen.args);
        ok(searched && searched.source.name === 'DNM1' && searched.into.name === 'DNM3',
           'and the one pressed is the one that runs: '
           + JSON.stringify(searched && [searched.source.name, searched.into.name]));

        // Naming one side narrows the offer rather than refusing it.
        const q2 = C3.preview({ capability: 'plan_peptide_rescue', args: { source: 'DNM1' } });
        ok((q2.choices || []).length === 2
           && (q2.choices || []).every((c) => /^copy DNM1 /.test(c.label)),
           'naming the track to copy leaves only which one to edit: '
           + (q2.choices || []).map((c) => c.label).join(' | '));
    }

    // One track open is a genuine refusal: there is no pair to offer.
    {
        const C4 = (await mkCap([A])).C;
        const q = C4.preview({ capability: 'plan_peptide_rescue', args: {} });
        ok(!!q.blocker && /only one is open/.test(q.blocker),
           'one track open says so plainly: ' + q.blocker);
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
