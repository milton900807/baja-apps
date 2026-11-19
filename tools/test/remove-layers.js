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

let planReply = null, opened = [], failPath = null;
const load = async (p, ...a) => {
    // core.js declares its own `exec`, which shadows the parameter every module is handed,
    // so a module is always reached through lion_engine.exec: a stub has to go here.
    if (failPath && ('' + p).indexOf(failPath) >= 0) throw new Error('404 ' + p);
    if (('' + p).indexOf('/py/bio/editor/plan.py') >= 0) return planReply;
    if (/librar/i.test('' + p) || /institute-rna-design/.test('' + p)) { opened.push('' + p); return { ok: true }; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
const stash = {};
global.lion_engine = {
    exec: (p, ...a) => load(p, ...a),
    setStashed: (n, c) => { stash[n] = c; },
    getStashed: (n) => stash[n] || null,
    createIonFunction: (f) => f
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const L = (name, kind) => ({ name: name, data_type: kind });
// WHAT A BIGWIG ACTUALLY LOADS AS: polygon points, no data_type, named after the file.
// Nothing about it says RNA-seq except the shape of it.
const peaks = (name, levels) => ({
    name: name,
    polygonpts: (levels || [0, -0.4, -0.9, -0.2, -0.7, -0.1, -0.5, -0.3, -0.8, 0])
        .map((y, i) => ({ x: i * 50, y: y }))
});
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
const mkBigwig = () => {
    const t = mkTrack();
    t.track_layers = [
        peaks('GRCh38_brain_rep1'),
        peaks('ENCFF002ABC'),
        L('MAPK8IP3_motifs', 'SLIM'),
        // A filled trace that is NOT RNA-seq: it says what it is, so it stays.
        Object.assign(peaks('MAPK8IP3_secretion'), { data_type: 'SECRETION:POLY' }),
        // A polygon that is a box, not a trace: two heights and four points.
        { name: 'MAPK8IP3_box', polygonpts: [{ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 9, y: -1 }, { x: 9, y: 0 }] }
    ];
    return t;
};
const names = (t) => t.track_layers.map((l) => l.name).join(', ');

// A graph whose confirmation panel answers itself, so a removal that asks first can be
// driven end to end. `answer` is 'yes', 'no', or null to leave the question hanging.
let lastAsk = null;
const mkGraph = (t, answer) => {
    const g = {
        track: [t], said: [], wake() { }, getTracks: () => [t],
        setMessage(m) { this.said.push('' + m); },
        setResultMessage(m) { this.said.push('' + m); },
        showMenu(items) {
            lastAsk = items.map((i) => '' + (i.label || '')).join(' ');
            if (!answer) return;
            // The chooser offers one row per layer plus "Remove all N of them"; the plain
            // confirmation offers "Remove". Either way, yes takes the lot.
            const want = answer === 'yes'
                ? /^(remove all \d+ of them|remove|delete|clear)$/i
                : /^(cancel|done)$/i;
            const row = items.find((i) => want.test('' + (i.label || '')));
            if (row && row.click) row.click();
        }
    };
    // confirm.js reads the graph off the stash, not from its caller.
    try { lion_engine.setStashed('graph', g); } catch (e) { }
    return g;
};

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
    r = await load('baja/bio/remove-layers.js', { track: [t], wake() { }, setMessage() { } }, [t], { match: 'methylation' });
    ok(r.count === undefined && !!r.error && /Nothing matched/.test(r.error),
       'nothing matching removes nothing and says what IS there, rather than removing the '
       + 'nearest thing: ' + r.error.slice(0, 90));
    ok(t.track_layers.length === 5, 'with every layer still on the track');

    // ---- everything, only when asked, and only after being asked about ----------------------
    t = mkTrack();
    lastAsk = null;
    let g1 = mkGraph(t, 'yes');
    r = await load('baja/bio/remove-layers.js', g1, [t], { match: 'all' });
    ok(r.pending === true && r.asked === 5, 'sweeping the track bare is put to the user first: '
       + JSON.stringify({ pending: r.pending, asked: r.asked }));
    ok(/Remove 5 layers/.test(lastAsk || '') && /MAPK8IP3_domains/.test(lastAsk || ''),
       'and the question names every layer, so it can be answered: ' + (lastAsk || '').slice(0, 80));
    ok(t.track_layers.length === 0, 'on yes they go: ' + t.track_layers.length + ' left');
    ok((t.__removedLayers || []).length === 5,
       'and they are kept on the track, so a mistaken "remove all" is not the end of an '
       + 'afternoon of loading');

    // On no, nothing is touched. A confirmation that removes either way is not one.
    t = mkTrack();
    const gNo = mkGraph(t, 'no');
    r = await load('baja/bio/remove-layers.js', gNo, [t], { match: 'all' });
    ok(t.track_layers.length === 5, 'on no the track is untouched: ' + t.track_layers.length);
    ok(gNo.said.join(' ').indexOf('Left them alone') >= 0,
       'and the user is told so rather than left wondering: ' + gNo.said.join(' '));

    // A dismissed panel answers nothing at all, so the promise must not be waiting on it.
    t = mkTrack();
    r = await Promise.race([
        load('baja/bio/remove-layers.js', mkGraph(t, null), [t], { match: 'all' }),
        new Promise((res) => setTimeout(() => res({ hung: true }), 150))
    ]);
    ok(r && r.pending === true && !r.hung,
       'an unanswered question does not hang the card: ' + JSON.stringify(r && { p: r.pending, h: r.hung }));

    // ---- layers matched by what they are DRAWN as -------------------------------------------
    // A bigwig trace carries no data_type and is named after the file. Nothing about it says
    // RNA-seq except the peaks, which is why "remove the rnaseq layers" found nothing.
    t = mkBigwig();
    lastAsk = null;
    const gB = mkGraph(t, 'yes');
    r = await load('baja/bio/remove-layers.js', gB, [t], { match: 'rnaseq' });
    ok(r.pending === true && r.asked === 2 && r.guessed === 2,
       'the two unlabelled traces are found by their shape: ' + JSON.stringify({ a: r.asked, g: r.guessed }));
    ok(/is the RNA-seq to remove/.test(lastAsk || '') && /drawn as a filled trace/.test(lastAsk || ''),
       'and each is offered on its own row, since what is drawn as a trace is not always '
       + 'RNA-seq: ' + (lastAsk || '').slice(0, 150));
    ok(/GRCh38_brain_rep1/.test(lastAsk || '') && /points/.test(lastAsk || ''),
       'named, with how many points it has, which is the evidence for calling it a trace');
    const left = t.track_layers.map((l) => l.name);
    ok(left.indexOf('MAPK8IP3_secretion') >= 0,
       'a trace that SAYS what it is keeps its own kind and stays: ' + left.join(', '));
    ok(left.indexOf('MAPK8IP3_box') >= 0,
       'and a polygon that is a box rather than peaks stays: ' + left.join(', '));
    ok(left.indexOf('MAPK8IP3_motifs') >= 0, 'as do the motifs');
    ok(left.length === 3, 'so only the two traces went: ' + left.join(', '));

    // Picking one leaves the rest: the whole reason each gets its own row.
    t = mkBigwig();
    lastAsk = null;
    const gPick = {
        track: [t], said: [], wake() { }, getTracks: () => [t],
        setMessage(m) { this.said.push('' + m); },
        showMenu(items) {
            lastAsk = items.map((i) => '' + (i.label || '')).join(' | ');
            const row = items.find((i) => /^Remove ENCFF002ABC/.test('' + (i.label || '')));
            if (row && row.click) row.click();
        }
    };
    lion_engine.setStashed('graph', gPick);
    await load('baja/bio/remove-layers.js', gPick, [t], { match: 'rnaseq' });
    const after = t.track_layers.map((l) => l.name);
    ok(after.indexOf('ENCFF002ABC') < 0 && after.indexOf('GRCh38_brain_rep1') >= 0,
       'taking one trace leaves the other, which is why each is its own row: ' + after.join(', '));

    // ---- when nothing is labelled, show what IS drawn as a trace ----------------------------
    // "there is nothing here" is plainly wrong when the peaks are on the screen. The last
    // resort is every trace layer, whatever it calls itself, for the user to choose from.
    const tAll = mkTrack();
    tAll.track_layers = [
        Object.assign(peaks('MAPK8IP3_secretion'), { data_type: 'SECRETION:POLY' }),
        Object.assign(peaks('MAPK8IP3_rna_protein'), { data_type: 'rna-protein' }),
        L('MAPK8IP3_motifs', 'SLIM')
    ];
    lastAsk = null;
    const gAll = mkGraph(tAll, null);
    const rAll = await load('baja/bio/remove-layers.js', gAll, [tAll], { match: 'rnaseq' });
    ok(rAll.pending === true && rAll.asked === 2,
       'both labelled traces are offered rather than reporting nothing: ' + JSON.stringify({ a: rAll.asked }));
    ok(/SECRETION:POLY/.test(lastAsk || '') && /rna-protein/.test(lastAsk || ''),
       'each with its own kind shown, so a wrong one is not picked by accident: '
       + (lastAsk || '').slice(0, 160));
    ok(/MAPK8IP3_motifs/.test(lastAsk || '') === false,
       'and a layer that is not drawn as a trace is not offered at all');

    // ---- a matcher that did not reach the server is SAID -------------------------------------
    const tNo = mkTrack();
    failPath = 'layer-match.js';
    const rNo = await load('baja/bio/remove-layers.js',
        { track: [tNo], wake() { }, setMessage() { } }, [tNo], { match: 'rnaseq' });
    failPath = null;
    ok(/layer-match\.js/.test(rNo.error || '') && /Nothing was removed/.test(rNo.error || ''),
       'a missing matcher is named, not reported as "nothing matched", which is the very '
       + 'symptom it exists to fix: ' + (rNo.error || ''));

    // ---- "the tracklayers" is the same request as "the layers" ------------------------------
    for (const word of ['tracklayers', 'track layers', 'the layers', 'layers']) {
        const tw = mkTrack();
        const rw = await load('baja/bio/remove-layers.js', mkGraph(tw, 'yes'), [tw], { match: word });
        ok(tw.track_layers.length === 0, '"' + word + '" means all of them: '
           + tw.track_layers.length + ' left');
    }

    // ---- the card says WHICH before the button ------------------------------------------------
    t = mkTrack();
    const g2 = { track: [t], getTracks: () => [t], wake() { }, said: [],
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); } };
    const C = await load('baja/manchester/menu/editor-capabilities.js', g2, {});
    let p = C.preview({ capability: 'remove_layers', args: { match: 'rna seq' } });
    ok(/GRCh38illuminabrain1/.test(p.text) && /rna_protein_measured/.test(p.text),
       'the preview names every layer it is about to take: ' + p.text);
    ok(/remove 2 layers/.test(p.text), 'and how many: ' + p.text.slice(0, 40));
    // The card has to show the guess BEFORE the button, not only in the confirmation.
    const tB = mkBigwig();
    const C3 = await load('baja/manchester/menu/editor-capabilities.js',
        { track: [tB], getTracks: () => [tB], setMessage() { }, setResultMessage() { } }, {});
    const pB = C3.preview({ capability: 'remove_layers', args: { match: 'rnaseq' } });
    ok(/GRCh38_brain_rep1 \(peaks\)/.test(pB.text),
       'the card marks a layer matched by its shape: ' + pB.text);
    ok(/asked which of them to take/.test(pB.text),
       'and says the question is coming: ' + pB.text);

    p = C.preview({ capability: 'remove_layers', args: { match: 'methylation' } });
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
        { track: [t4], wake() { }, setMessage() { } }, [t4], { match: 'methylation' });
    ok(/\[RNASeq\]/.test(r4.error || ''),
       'and when nothing matches, the layers are listed WITH their kinds, which is what a '
       + 'second attempt needs: ' + (r4.error || '').slice(0, 100));

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
