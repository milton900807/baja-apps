// TAKING LAYERS OFF A TRACK.
//
//     node tools/test/remove-layers.js
//
// "remove the rna seq layers from the mapk8ip3_mrna" opened the shelf of data that can be
// LOADED onto a track: the opposite of what was asked. Loading had an operation and
// unloading did not, and the fallback that offers a shelf when nothing runs matched on the
// word "data" in the planner's own explanation of why it could not do it.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="h"></div></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: 'https://gene.clinic' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let planReply = null, opened = [];
const load = async (p, ...a) => {
    if (('' + p).indexOf('/py/bio/editor/plan.py') >= 0) return planReply;
    if (/librar/i.test('' + p) || /institute-rna-design/.test('' + p)) { opened.push('' + p); return { ok: true }; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const L = (name, kind) => ({ name: name, data_type: kind });
const mkTrack = () => ({
    name: 'MAPK8IP3_mRNA', xi: 0, xf: 5000, getSelectedRanges: () => [],
    grid: { yi: 1, xi: 0, width: 10, height: -1 },
    track_layers: [
        L('GRCh38illuminabrain1', 'RNASeq'),
        L('MAPK8IP3_rna_protein_measured', 'RNASeq'),
        L('MAPK8IP3_motifs', 'SLIM'),
        L('MAPK8IP3_mRNA_similarity', 'SEQSIM'),
        L('MAPK8IP3_domains', 'CDD')
    ]
});
const names = (t) => t.track_layers.map((l) => l.name).join(', ');

(async () => {
    // ---- the kind, not just the name -----------------------------------------------------
    let t = mkTrack();
    const graph = { track: [t], said: [], wake() { }, getTracks: () => [t],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    let r = await load('baja/bio/remove-layers.js', graph, [t], { match: 'rna seq' });
    ok(r.count === 2, 'both RNA-seq layers go: ' + r.removed.map((x) => x.name).join(', '));
    ok(r.removed.some((x) => x.name === 'GRCh38illuminabrain1'),
       'including the one whose NAME says nothing about RNA-seq, which is matched on its '
       + 'kind: there is no reason the user should know what that layer is called');
    ok(t.track_layers.length === 3 && !/illumina/i.test(names(t)),
       'and the rest stay: ' + names(t));

    // ---- named layers ---------------------------------------------------------------------
    t = mkTrack();
    r = await load('baja/bio/remove-layers.js', { track: [t], wake() { }, setMessage() { } }, [t], { match: 'motifs' });
    ok(r.count === 1 && r.removed[0].name === 'MAPK8IP3_motifs', 'motifs by kind: ' + r.count);

    t = mkTrack();
    r = await load('baja/bio/remove-layers.js', { track: [t], wake() { }, setMessage() { } }, [t], { match: 'similarity' });
    ok(r.count === 1 && /similarity/.test(r.removed[0].name), 'the similarity map by name');

    t = mkTrack();
    r = await load('baja/bio/remove-layers.js', { track: [t], wake() { }, setMessage() { } }, [t], { match: 'illuminabrain' });
    ok(r.count === 1, 'and part of a layer name finds that one layer: ' + r.count);

    // ---- what it refuses to guess ----------------------------------------------------------
    t = mkTrack();
    r = await load('baja/bio/remove-layers.js', { track: [t], wake() { }, setMessage() { } }, [t], { match: 'conservation' });
    ok(r.count === undefined && !!r.error && /Nothing matched/.test(r.error),
       'nothing matching removes nothing and says what IS there, rather than removing the '
       + 'nearest thing: ' + r.error.slice(0, 90));
    ok(t.track_layers.length === 5, 'with every layer still on the track');

    // ---- everything, only when asked ---------------------------------------------------------
    t = mkTrack();
    r = await load('baja/bio/remove-layers.js', { track: [t], wake() { }, setMessage() { } }, [t], { match: 'all' });
    ok(r.count === 5 && t.track_layers.length === 0, 'all means all: ' + r.count);
    ok((t.__removedLayers || []).length === 5,
       'and they are kept on the track, so a mistaken "remove all" is not the end of an '
       + 'afternoon of loading');

    // ---- the card says WHICH before the button ------------------------------------------------
    t = mkTrack();
    const g2 = { track: [t], getTracks: () => [t], wake() { }, said: [],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', g2, {});
    let p = C.preview({ capability: 'remove_layers', args: { match: 'rna seq' } });
    ok(/GRCh38illuminabrain1/.test(p.text) && /rna_protein_measured/.test(p.text),
       'the preview names every layer it is about to take: ' + p.text);
    ok(/remove 2 layers/.test(p.text), 'and how many: ' + p.text.slice(0, 40));
    p = C.preview({ capability: 'remove_layers', args: { match: 'conservation' } });
    ok(/nothing there matches/.test(p.text), 'or says nothing matches: ' + p.text);

    const bare = { name: 'empty', track_layers: [], xi: 0, xf: 10, getSelectedRanges: () => [],
        grid: { yi: 1, xi: 0, width: 1, height: -1 } };
    const C2 = await load('baja/manchester/menu/editor-capabilities.js',
        { track: [bare], getTracks: () => [bare], setMessage() { }, setResultMessage() { } }, {});
    p = C2.preview({ capability: 'remove_layers', args: { match: 'rna seq' } });
    ok(/has no layers on it/.test(p.blocker || ''), 'a track with no layers is said before the button');

    // ---- and the shelf no longer answers a removal ---------------------------------------------
    // The planner's own words carry "data layers", which is what the shelf matched on.
    planReply = { status: 'OK', steps: [], problems: [],
        unsupported: ['removing RNA-seq layers - no operation exists to delete data layers from tracks'] };
    opened = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    load('baja/manchester/menu/editor-command.js',
        { tracks: [], m_tracks: [], root: [], getTracks: () => [], setMessage: () => { }, setResultMessage: () => { } },
        {}, { host: host, prefill: 'remove the rna seq layers from the mapk8ip3_mrna' });
    for (let i = 0; i < 60; i++) {
        await new Promise((res) => setTimeout(res, 25));
        if (opened.length || (host.querySelector('#ec-out') || {}).innerHTML) break;
    }
    await new Promise((res) => setTimeout(res, 60));
    ok(!opened.length,
       'a request to REMOVE does not open a library of things to load: ' + JSON.stringify(opened));
    ok(/Nothing in the editor does that/.test(host.textContent || ''),
       'it gets the plain refusal instead, which at least does not misread the request');

    // A request that is not about taking something away still gets its shelf.
    planReply = { status: 'OK', steps: [], unsupported: [] };
    opened = [];
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    load('baja/manchester/menu/editor-command.js',
        { tracks: [], m_tracks: [], root: [], getTracks: () => [], setMessage: () => { }, setResultMessage: () => { } },
        {}, { host: host2, prefill: 'load some rna seq data' });
    for (let i = 0; i < 60; i++) {
        await new Promise((res) => setTimeout(res, 25));
        if (opened.length) break;
    }
    ok(opened.length > 0, 'while "load some rna seq data" still opens one: ' + JSON.stringify(opened));

    const plan = fs.readFileSync('py/bio/editor/plan.py', 'utf8');
    ok(/TAKING SOMETHING AWAY IS NOT BROWSING FOR IT/.test(plan),
       'and the planner is told there is an operation for this now');

    // ---- and the planner is told WHAT IS THERE ------------------------------------------
    //
    // Without this it plans blind. The layer a user calls "the rna seq layer" is called
    // GRCh38illuminabrain1; nothing in the request, and nothing in the catalogue, could
    // tell anyone that. It can only guess a match string and hope the operation reads it
    // the same way.
    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/WHAT IS ON THE TRACK, BY NAME/.test(cmd), 'the canvas context carries each track\'s layers');
    ok(/name: \('' \+ \(\(l && l\.name\) \|\| '\(unnamed\)'\)\)/.test(cmd)
       && /kind: \('' \+ \(\(l && l\.data_type\) \|\| ''\)\)/.test(cmd),
       'with the name AND the kind: the name is what the user points at, the kind is what '
       + 'they mean');
    const capSrc = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8')
        .replace(/'\s*\+\s*'/g, '');
    // The source writes the apostrophe as an escape, so the file holds the six characters
    // backslash-u-2019 rather than the character itself.
    ok(capSrc.indexOf('PREFER THE LAYER') >= 0 && /OWN NAME as canvas_now lists it/.test(capSrc),
       'and the operation tells the planner to use it');

    // The kind is what finds a layer whose name gives nothing away.
    const t2 = mkTrack();
    const r2 = await load('baja/bio/remove-layers.js',
        { track: [t2], wake() { }, setMessage() { } }, [t2], { match: 'RNASeq' });
    ok(r2.count === 2, 'a kind on its own removes every layer of that kind: ' + r2.count);

    const t3 = mkTrack();
    const r3 = await load('baja/bio/remove-layers.js',
        { track: [t3], wake() { }, setMessage() { } }, [t3], { match: 'GRCh38illuminabrain1' });
    ok(r3.count === 1 && r3.removed[0].name === 'GRCh38illuminabrain1',
       'and an exact name from canvas_now removes exactly that one');

    const t4 = mkTrack();
    const r4 = await load('baja/bio/remove-layers.js',
        { track: [t4], wake() { }, setMessage() { } }, [t4], { match: 'conservation' });
    ok(/\[RNASeq\]/.test(r4.error || ''),
       'and when nothing matches, the layers are listed WITH their kinds, which is what a '
       + 'second attempt needs: ' + (r4.error || '').slice(0, 100));

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
