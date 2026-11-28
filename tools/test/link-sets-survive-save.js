// THE LINES BETWEEN TRACKS SURVIVE SAVE AND RELOAD.
//
//     node tools/test/link-sets-survive-save.js
//
// A figure that takes a comparison and a dozen decisions to arrange came back from a file
// with the lines gone and no way to tell what had been joined to what. The painter itself
// cannot be written down -- it is closures over live track objects -- so what is saved is
// a plain record with track NAMES, and the painters are built again from it. Both halves
// are driven here, through the real saver's rules: what it writes, and what it refuses to.
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
    // A class module is the class itself and must not be called.
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const mkTrack = (name) => ({ name: name, tgraph: { yi: 10, X: (v) => v, Y: (f) => f } });
const mkGraph = (tracks) => ({
    track: tracks, wake: () => { }, X: (v) => v, Y: (v) => v,
    setResultMessage: (m) => said.push(m), setMessage: (m) => said.push(m)
});

// What the saver writes: for-in over own ENUMERABLE keys, dropping functions and anything
// whose name ends in _transient_. Same rules as manchester/io/save-obj.js.
const saveLike = (graph) => {
    const out = {};
    for (const k in graph) {
        if (/_transient_$/i.test(k)) continue;
        const v = graph[k];
        if (typeof v === 'function') continue;
        if (k === 'track') continue;                 // tracks are saved their own way
        try { out[k] = JSON.parse(JSON.stringify(v)); } catch (e) { }
    }
    return out;
};

(async () => {
    const A = mkTrack('DNM1_3utr'), B = mkTrack('DNM3_3utr');
    const g = mkGraph([A, B]);
    const links = [
        { from: { track: A, start: 100, end: 120 }, to: { track: B, start: 900, end: 920 }, label: '83%' },
        { from: { track: A, start: 300, end: 320 }, to: { track: B, start: 500, end: 520 }, label: '75% rc' }
    ];
    const painter = await load('baja/bio/compare/track-link-layer.js', g, links, { id: 'sim', color: '#4fd0e6' });
    ok(!!painter, 'the lines are drawn');

    // ---- WHAT GOES IN THE FILE, AND WHAT DOES NOT ---------------------------------------
    const saved = saveLike(g);
    ok(Array.isArray(saved.__linkSets) && saved.__linkSets.length === 1,
       'the record of the lines is written: ' + JSON.stringify(saved.__linkSets || []).slice(0, 60));
    ok(saved.__linkSets[0].links.length === 2, 'with every line in it');
    ok(saved.__linkSets[0].links[0].from.track === 'DNM1_3utr'
       && saved.__linkSets[0].links[0].to.track === 'DNM3_3utr',
       'tracks by NAME, since the objects are rebuilt on load: '
       + saved.__linkSets[0].links[0].from.track);
    ok(saved.__linkSets[0].links[0].label === '83%', 'and the labels');
    ok(saved.__linkPainters === undefined,
       'the live painters are NOT written: they are closures over tracks and come back as junk');
    ok(Object.getOwnPropertyDescriptor(g, '__linkPainters').enumerable === false,
       'which is done by making them non-enumerable, the one thing the saver walks by');

    // ---- BACK AFTER A RELOAD --------------------------------------------------------------
    // A fresh graph with fresh track objects and nothing but the record, which is exactly
    // what opening a document gives you.
    const A2 = mkTrack('DNM1_3utr'), B2 = mkTrack('DNM3_3utr');
    const g2 = mkGraph([A2, B2]);
    g2.__linkSets = JSON.parse(JSON.stringify(saved.__linkSets));
    const r = await load('baja/bio/compare/restore-track-links.js', g2);
    ok(r.ok && r.restored === 2 && r.dropped === 0, 'both lines are rebuilt: ' + JSON.stringify(r));
    ok((g2.__linkPainters || []).length === 1, 'as one painter');
    const back = g2.__linkPainters[0].links;
    ok(back[0].from.track === A2 && back[0].to.track === B2,
       'pointing at the tracks that are open NOW, not the ones that were saved');
    ok(back[1].label === '75% rc', 'with the labels they had');
    ok((g2.__linkSets || []).length === 1, 'and the record is still there to save again');

    // ---- A TRACK THAT IS NOT THERE ANY MORE -------------------------------------------------
    // Dropped, and SAID: a document reopened with half its lines must not look like the
    // whole comparison.
    said.length = 0;
    const g3 = mkGraph([mkTrack('DNM1_3utr')]);
    g3.__linkSets = JSON.parse(JSON.stringify(saved.__linkSets));
    const r3 = await load('baja/bio/compare/restore-track-links.js', g3);
    ok(r3.restored === 0 && r3.dropped === 2, 'links to a missing track are not drawn: ' + JSON.stringify(r3));
    ok(said.some((m) => /could not be restored/.test(m)), 'and the loss is reported: ' + (said[0] || ''));
    ok((g3.__linkSets || []).length === 0,
       'a set that lost every link is dropped, so saving again does not keep carrying it');

    // ---- EDITS ARE SAVED TOO -----------------------------------------------------------------
    // A colour chosen and then not saved is a colour chosen twice.
    const g4 = mkGraph([mkTrack('A'), mkTrack('B')]);
    const l4 = [{ from: { track: g4.track[0], start: 1, end: 2 },
                  to: { track: g4.track[1], start: 3, end: 4 }, label: 'x' },
                { from: { track: g4.track[0], start: 5, end: 6 },
                  to: { track: g4.track[1], start: 7, end: 8 }, label: 'y' }];
    const p4 = await load('baja/bio/compare/track-link-layer.js', g4, l4, { id: 'e' });
    const opened = [];
    g4.openMenuAtPointer = (rows) => { opened.push(rows); return true; };
    g4.showSideMenu = () => { };
    p4.menu(l4[0], g4);
    opened[opened.length - 1].filter((x) => /^Color/.test(('' + x.label).trim()))[0].click();
    opened[opened.length - 1].filter((x) => /Amber/.test('' + x.label))[0].click();
    ok(/255,170,60/.test('' + (g4.__linkSets[0].links[0].color || '')),
       'a colour chosen is in the record: ' + g4.__linkSets[0].links[0].color);
    p4.menu(l4[1], g4);
    opened[opened.length - 1].filter((x) => ('' + x.label).trim() === 'Remove')[0].click();
    ok(g4.__linkSets[0].links.length === 1, 'a line removed is out of the record');
    p4.menu(l4[0], g4);
    opened[opened.length - 1].filter((x) => /^Remove Graph Layer/.test(('' + x.label).trim()))[0].click();
    ok((g4.__linkSets || []).length === 0, 'and a layer removed takes its record with it');

    // ---- A LAYER'S OWN TYPE SURVIVES THE RELOAD TOO --------------------------------------
    // The layers the comparisons and the annotation reader leave behind carry a type that
    // says what produced them. The rehydrator used to overwrite it with the class that
    // draws it, so the only record of where a layer came from was thrown away on the first
    // reload, silently, in a file that otherwise looked complete.
    const RL = await load('baja/bio/rehydrate-layer.js');
    const back1 = await RL({ name: 'DNM3_SIM70_2', type: 'SelectionSimilarity', intervals: [], decor: {} });
    ok(back1 && back1.type === 'SelectionSimilarity',
       'a layer that names what made it keeps that name: ' + (back1 && back1.type));
    ok(typeof back1.addInterval === 'function', 'and is still a working layer');
    const back2 = await RL({ name: 'x', type: 'CisLayer', intervals: [] });
    ok(back2 && back2.type === 'CisLayer', 'a layer that names its class is rebuilt as it');
    const back3 = await RL({ name: 'old', intervals: [] });
    ok(back3 && back3.type === 'TrackLayer', 'and a layer saved before types are still repaired');

    // ---- THE RESTORE IS WIRED IN -------------------------------------------------------------
    const gene = fs.readFileSync('flexigraph/gene.js', 'utf8');
    ok(/restore-track-links\.js/.test(gene), 'the canvas restores them when a document opens');
    ok(/__linkRestore_transient_/.test(gene),
       'and the once-only flag is transient, or a reopened file would arrive with it already set');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
