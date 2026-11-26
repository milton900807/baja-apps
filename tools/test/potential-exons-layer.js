// THE EXONS THE CANDIDATE ACCEPTORS WOULD MAKE, DRAWN ON THE TRACK.
//
//     node tools/test/potential-exons-layer.js
//
// The acceptor layer answers where an exon could begin. The question after it is what that
// would do to the protein, and that answer existed only one site at a time, by clicking an
// arc. This draws all of them at once, so what matters is that the band says the same thing
// the click would have: the right span, the consequence as a colour, and the true length
// even when the band had to be widened to stay visible.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const core = fs.readFileSync('lib/core.js', 'utf8');
global.window = { env: { apiUrl: '' } };

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// One intron of a 40 kb track with four candidates in it. Two close into an exon, one in
// frame and one frameshifted; one is silent; one has no donor near it at all.
const PAIR = {
    79620500: { ok: true, pairings: [
        { donorX: 79620591, donorScore: 0.81, identity: 0.92,
          exon: { xi: 79620501, xf: 79620590, length: 90, frame: 0 },
          consequence: 'in frame: 30 residues inserted' },
        { donorX: 79620593, donorScore: 0.62, identity: 0.55,
          exon: { xi: 79620501, xf: 79620592, length: 92, frame: 2 },
          consequence: 'frameshift to a premature stop that NMD would find' }
    ] },
    79620800: { ok: true, pairings: [
        { donorX: 79620902, donorScore: 0.77, identity: 0.4,
          exon: { xi: 79620801, xf: 79620901, length: 101, frame: 2 },
          consequence: 'frameshift to a premature stop that NMD would find' }
    ] },
    // Overlaps rank 1: two proposals in the same stretch of intron, which is the normal
    // case -- the top candidates of a gene are often several sites in one intron.
    79620520: { ok: true, pairings: [
        { donorX: 79620611, donorScore: 0.66, identity: 0.9,
          exon: { xi: 79620521, xf: 79620610, length: 90, frame: 0 },
          consequence: 'in frame: 30 residues inserted' }
    ] },
    79621000: { ok: true, pairings: [
        { donorX: 79621061, donorScore: 0.70, identity: 1,
          exon: { xi: 79621001, xf: 79621060, length: 60, frame: 0 },
          consequence: 'in frame and silent' }
    ] },
    79625000: { ok: false, reason: 'no donor the model scores lies 25 to 400 bases after that acceptor inside the same intron, so there is no exon it could close' }
};
const ROWS = [
    { rank: 1, x: 79620500, score: 0.44, percentile: 99.9 },
    { rank: 2, x: 79620800, score: 0.39, percentile: 99.8 },
    { rank: 3, x: 79621000, score: 0.31, percentile: 99.5 },
    { rank: 4, x: 79625000, score: 0.28, percentile: 99.1 },
    { rank: 5, x: 79620520, score: 0.26, percentile: 98.9 }
];

const mkTrack = () => ({
    name: 'STMN2', xi: 79600000, xf: 79640000, sequence: 'A', track_layers: [],
    addLayer(l) { this.track_layers.push(l); }
});

// Only the module under test is real; everything it leans on is answered here, so a change
// in the ranking or the translator cannot make this pass or fail for the wrong reason.
const run = async (track, opts, over) => {
    const said = [];
    const calls = { profile: 0, exon: 0, rank: 0 };
    const stub = {
        'baja/bio/splicing/acceptor-candidates.js': () => { calls.rank++; return { ok: true, rows: ROWS, outOf: 5263, plus: true, introns: [] }; },
        'baja/bio/splicing/sites-profile.js': () => { calls.profile++; return { ok: true, acceptor: [[1, 0.5]], donor: [[2, 0.5]] }; },
        'baja/bio/splicing/alternative-exon.js': (t, x) => { calls.exon++; return PAIR[x] || { ok: false, reason: 'unknown site' }; }
    };
    Object.assign(stub, over || {});
    const load = async (p, ...a) => {
        if (stub[p]) return stub[p](...a);
        // Some modules are STATEMENT bodies (track-layer.js opens with `return`), so they
        // take no `return (...)` wrapper. Same rule the engine uses.
        const body = fs.readFileSync(p, 'utf8');
        const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body)
            ? (core + '\n' + body)
            : (core + '\nreturn (' + body + ')');
        const f = await new AF('exec', 'args', src)(load, {});
        // A module that IS a class (track-layer.js) is handed back, not called.
        if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
        return (typeof f === 'function') ? f(...a) : f;
    };
    global.lion_engine = { exec: (p, ...a) => load(p, ...a) };
    const graph = { setResultMessage: (m) => said.push(m), wake: () => { }, rescale: () => { } };
    const okRet = await load('baja/bio/splicing/potential-exons-layer.js', graph, {}, track, opts || {});
    return { okRet, said: said.join(' | '), layer: track.track_layers[track.track_layers.length - 1], calls };
};

(async () => {
    const t = mkTrack();
    const r = await run(t, {});
    const L = r.layer;
    ok(r.okRet === true && !!L, 'the layer goes on the track');
    ok(L.intervals.length === 4, 'one band per candidate that closed, and none for the one that did not');

    // THE SITE MODEL IS RUN ONCE. Asking it per candidate is the same answer fetched four
    // times over, and a minute of waiting for it.
    ok(r.calls.profile === 1, 'the site profile is fetched once for the whole layer');
    ok(r.calls.exon === 5, 'and every candidate is asked about');

    const byRank = {};
    for (const iv of L.intervals) byRank[(''+iv.t).split(' ')[0]] = iv;
    ok(!!byRank['#1'] && !!byRank['#2'] && !!byRank['#3'], 'bands are labelled by rank');
    ok(/90 nt/.test(byRank['#1'].t), 'the label carries the true length of the exon');
    ok(/in frame/.test(byRank['#1'].t) && !/frameshift/.test(byRank['#1'].t), 'rank 1 reads in frame');
    ok(/frameshift/.test(byRank['#2'].t), 'rank 2 reads frameshift');
    ok(/silent/.test(byRank['#3'].t), 'rank 3 reads silent');

    // COLOUR IS THE CONSEQUENCE, NOT THE SCORE. The ranking already carries the strength of
    // the site; what the band adds is what the message would say.
    ok(/74,222,128/.test(byRank['#1'].color), 'in frame is green');
    ok(/248,113,113/.test(byRank['#2'].color), 'a frameshift is red');
    ok(byRank['#3'].color !== byRank['#1'].color, 'and a silent insertion is not the same green');

    // A 90-BASE EXON ON A 40 KB TRACK IS A HAIRLINE. Bands are widened to stay visible, and
    // the help says so, because a band wider than its exon is a lie about coordinates
    // unless it is declared.
    const w = byRank['#1'].x2 - byRank['#1'].x1;
    ok(w >= 99, 'a band thinner than the minimum is widened to it: ' + w + ' bases');
    ok(/drawn at that width so they stay visible/.test(L.decor.help.note), 'and the help note says that happened');
    ok(/90 nt/.test(L.decor.help.rows.map((x) => x[1]).join(' ')), 'while the rows carry the real span');

    // The two bands that overlap must not sit on one line.
    ok(byRank['#5'] && byRank['#5'].y !== byRank['#1'].y,
       'two proposals in the same stretch of intron are laid out in different lanes');
    ok(byRank['#2'].y === byRank['#1'].y, 'and bands that do not overlap share a lane');

    // THE RUNNERS-UP ARE NAMED. The donor is a choice, and a second donor at the same
    // acceptor makes a different exon in a different frame.
    const rows = L.decor.help.rows.map((x) => x.join(' ')).join(' | ');
    ok(/other donors: 92 nt frameshift/.test(rows), 'the other donor at rank 1 is in the help');
    ok(/#4[^|]*no exon drawn/.test(rows), 'the candidate that could not be closed is listed, with the reason');

    // AND NOTHING HERE CLAIMS TO BE A MEASUREMENT.
    ok(/proposals, not measurements/.test(r.said), 'the closing message says these are proposals');
    ok(/4 potential exons/.test(r.said) && /3 of them in frame/.test(r.said), 'and counts them');

    // ---- the candidates already on screen are the ones used -----------------------------
    const t2 = mkTrack();
    t2.track_layers.push({ acceptorCandidates: ROWS.slice(0, 2) });
    const r2 = await run(t2, {});
    ok(r2.calls.rank === 0, 'an acceptor layer already up is not ranked again');
    ok(r2.layer.intervals.length === 2, 'and its own candidates are what gets drawn');

    // ---- every refusal is reported, not counted ------------------------------------------
    const t3 = mkTrack();
    const r3 = await run(t3, {}, {
        'baja/bio/splicing/alternative-exon.js': () => ({ ok: false, reason: 'that position is not inside an intron of STMN2' })
    });
    ok(r3.okRet === false, 'nothing is drawn when no candidate closes');
    ok(/not inside an intron/.test(r3.said), 'and the reason survives rather than becoming a count: ' + r3.said.slice(-90));

    // ---- a refusal from the site model is its own sentence --------------------------------
    const t4 = mkTrack();
    const r4 = await run(t4, {}, {
        'baja/bio/splicing/sites-profile.js': () => ({ ok: false, reason: 'STMN2 holds a spliced sequence in a genomic frame' })
    });
    ok(r4.okRet === false && /spliced sequence/.test(r4.said), 'the site model refusal is shown as written');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
