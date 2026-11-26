// THE RATIO SHIFT MODEL: RAISE ONE MESSAGE, LOWER WHERE THE OTHER ONE IS TRANSLATED.
//
//     node tools/test/ratio-shift-model.js
//
// The model proposes steric blockers: over a repressive site on the transcript to be
// raised, and over a transport or local-initiation site on the one to be lowered. What
// makes it a PAIR model rather than two single-track runs is the selectivity check, and
// that is what most of this tests: the pair anyone asks this of is a pair of paralogues,
// where a stretch of 3' UTR is often the same in both, and a blocker drawn over such a
// stretch acts on both ends of the ratio at once. That failure is invisible on the canvas
// -- the site is real, the model scores it, the oligo would bind -- so it has to be caught
// by arithmetic here.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const core = fs.readFileSync('lib/core.js', 'utf8');
global.window = { env: { apiUrl: 'https://x' } };
global.EngineMonitor = function () { };

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// miR-122-5p: the site7 is ACACTCC, so the 6mer is CACTCC and an 8mer-1a reads ACACTCCA.
const MIR8 = 'ACACTCCA';
const filler = (n, seed) => {
    // Deterministic but not repetitive. A repeated motif would be the wrong background for
    // this test: two tracks padded with the same few bases are each other's match
    // everywhere, so every candidate would come back unselective and the check that
    // matters would pass for the wrong reason.
    let x = (seed * 2654435761) >>> 0, s = '';
    while (s.length < n) {
        x = (1103515245 * x + 12345) >>> 0;
        s += 'ACGT'[(x >>> 16) & 3];
    }
    return s.slice(0, n);
};

// UP: a 3' UTR with an 8mer miR-122 site at a position unique to it, and a second one in a
// stretch shared verbatim with the other transcript.
const SHARED = 'GGCATTACGGATCAGTTACCGGATCAGGTTACGCATGGCTAACGGATTCAG';
const UP_SEQ = filler(400, 1) + MIR8 + filler(400, 2) + SHARED.slice(0, 20) + MIR8 + SHARED.slice(20);
const DOWN_SEQ = filler(300, 3) + SHARED.slice(0, 20) + MIR8 + SHARED.slice(20) + filler(400, 4);

const mkTrack = (name, seq, strand) => ({
    name: name, xi: 1000, xf: 1000 + seq.length - 1, strand: strand == null ? 1 : strand,
    sequence: seq
});

// The RBP service, stubbed: it is a server call and a torch model, and what this test is
// about is what the model does with its answer. Positions are MESSAGE indices, which is
// what the real service returns when xi is sent as 0.
let rbpCalls = [];
const mkRbp = (byUp, byDown) => (p, em, seq, xi, strand, names) => {
    rbpCalls.push({ seq: seq, xi: xi, strand: strand, names: names });
    const up = (seq === UP_SEQ || seq === rc(UP_SEQ));
    return { sitesByRbp: JSON.stringify(up ? byUp : byDown), error: null };
};
const rc = (s) => s.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');

const run = async (over, o) => {
    rbpCalls = [];
    const load = async (p, ...a) => {
        if (/rbp-profile\.py$/.test(p)) return over.rbp(p, ...a);
        const body = fs.readFileSync(p, 'utf8');
        const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
        const f = await new AF('exec', 'args', src)(load, {});
        if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
        return (typeof f === 'function') ? f(...a) : f;
    };
    global.lion_engine = { exec: (p, ...a) => load(p, ...a) };
    return load('baja/bio/expression/ratio-shift-model.js', o);
};

(async () => {
    const UP = mkTrack('DNM1_3utr', UP_SEQ);
    const DOWN = mkTrack('DNM3_3utr', DOWN_SEQ);
    // PUM1 on the up track in unique sequence; TARDBP on the down track, one site in its
    // own sequence and one inside the stretch it shares with the up track.
    const sharedAt = 300;
    const r = await run({ rbp: mkRbp(
        { PUM1: [[100, 130, 0.93]] },
        { TARDBP: [[700, 740, 0.88]], FUS: [[sharedAt + 5, sharedAt + 35, 0.91]] }
    ) }, { up: UP, down: DOWN, top: 10 });

    ok(r.ok, 'the model runs: ' + (r.reason || ''));
    // ---- ONE SEQUENCE THAT DOES BOTH -----------------------------------------------------
    // The fixture is built for this: the stretch shared between the two messages carries an
    // 8mer miR-122 site on the one to be raised and the FUS site on the one to be lowered.
    // A blocker there binds both and does a different job in each, which is a different
    // design from the two arms: one molecule, and the two effects arrive together.
    ok(r.dualAll >= 1, 'the shared stretch is found as a dual-action sequence: ' + r.dualAll);
    const d = r.dual[0];
    ok(d.raises.label === 'miR-122-5p' && d.lowers.label === 'FUS',
       'with what it does at each end named: raises ' + d.raises.label + ', lowers ' + d.lowers.label);
    ok(d.mismatches === 0, 'the sequence is shared, so the same oligo binds both: ' + d.mismatches + ' mismatches');
    ok(d.covered >= 10, 'and it covers enough of the far site to block it: ' + d.covered + ' nt');
    ok(UP_SEQ.indexOf(d.footprint) >= 0 && DOWN_SEQ.indexOf(d.footprint) >= 0,
       'the sequence is really in both messages');
    ok(d.upStart != null && d.downStart != null, 'with a position on each track');
    ok(/would do both/.test(r.verdict), 'the verdict leads with it: ' + (r.verdict || '').slice(0, 50));
    ok(/cannot be dosed apart/.test(r.verdict), 'and says what one molecule costs you');
    ok(/Both arms/.test(r.verdict) || /Separately, /.test(r.verdict),
       'while still reporting the two separate arms');

    // A SITE THAT CAN BE AIMED IS NOT A DUAL SITE. The two lists are built from opposite
    // sides of the same cut-off, so a candidate cannot be in both.
    ok(r.dual.every((x) => !x.raises.selective || !x.lowers.selective),
       'nothing counted as dual was also counted as selective');

    // ---- the up arm: microRNA sites and repressors ---------------------------------------
    const upLabels = r.up.candidates.map((c) => c.label);
    ok(upLabels.indexOf('miR-122-5p') >= 0, 'the miR-122 site is found on the message');
    ok(upLabels.indexOf('PUM1') >= 0, 'and a repressor site is a candidate on the raising arm');
    ok(r.down.candidates.every((c) => c.label !== 'PUM1'),
       'a repressor is NOT offered on the lowering arm: blocking it there would raise the wrong one');
    ok(r.up.candidates.every((c) => c.label !== 'TARDBP'),
       'and a transport protein is not offered on the raising arm');

    // ---- THE SELECTIVITY CHECK, which is the point of the model ---------------------------
    const mir = r.up.candidates.filter((c) => c.label === 'miR-122-5p');
    ok(mir.length === 2, 'both miR-122 sites on the up track are reported: ' + mir.length);
    const unique = mir.filter((c) => c.selective), shared = mir.filter((c) => !c.selective);
    ok(unique.length === 1 && shared.length === 1,
       'one of them sits in sequence shared with the other transcript and one does not');
    ok(shared[0].mismatches === 0,
       'the shared one is an exact match in the other transcript, so one blocker would hit both: '
       + shared[0].mismatches + ' mismatches');
    ok(unique[0].score > shared[0].score,
       'and the site that can be aimed outranks it even though both are 8mers: '
       + unique[0].score + ' vs ' + shared[0].score);
    ok(r.up.candidates[0].selective, 'so the top candidate of the arm is one that can be aimed');

    const fus = r.down.candidates.filter((c) => c.label === 'FUS')[0];
    ok(fus && !fus.selective, 'the FUS site inside the shared stretch is flagged on the down arm too');
    const tdp = r.down.candidates.filter((c) => c.label === 'TARDBP')[0];
    ok(tdp && tdp.selective, 'while the TARDBP site in its own sequence can be aimed');
    // The counts are of what can be AIMED, not of what was found. Background sequence
    // carries a few 6mer seed matches by chance -- which is the honest answer and why a
    // 6mer is ranked last rather than left out -- so the test is the relationship, not a
    // total that would change with the filler.
    ok(r.up.selective < r.up.all && r.down.selective < r.down.all,
       'what can be aimed is a subset of what was found: ' + r.up.selective + ' of ' + r.up.all
       + ' and ' + r.down.selective + ' of ' + r.down.all);
    ok(r.down.selective === 1, 'only the TARDBP site can be aimed on the lowering arm');

    // The footprint is the oligo, not the seed: selectivity measured over six bases would
    // call almost everything shared.
    ok(r.up.candidates[0].footprint.length === 20, 'the footprint checked is the 20-mer a blocker would cover');
    ok(UP_SEQ.indexOf(unique[0].footprint) >= 0, 'and it is read off the message itself');

    // ---- a minus-strand transcript is scanned on its message -------------------------------
    // A site is a feature of the message. Scanning the stored plus strand of a minus-strand
    // gene finds sites that do not exist and misses the ones that do, and the error is
    // invisible: the coordinates still land inside the track.
    const minusUp = mkTrack('STMN2_3utr', rc(UP_SEQ), -1);
    const r2 = await run({ rbp: mkRbp({ PUM1: [[100, 130, 0.9]] }, { TARDBP: [[700, 740, 0.9]] }) },
        { up: minusUp, down: DOWN, top: 10 });
    ok(r2.ok && r2.up.minus === true, 'a minus-strand track is marked as such');
    ok(r2.up.candidates.filter((c) => c.label === 'miR-122-5p').length === 2,
       'and its sites are found on the message, not on the stored strand');
    ok(rbpCalls.some((c) => c.seq === UP_SEQ), 'the RBP model is sent the message too');
    ok(rbpCalls.every((c) => c.xi === '0'),
       'with xi 0, so message positions are mapped back here rather than mirrored by the server');
    const back = r2.up.candidates.filter((c) => c.selective)[0];
    ok(back.start >= minusUp.xi && back.end <= minusUp.xf, 'positions come back inside the track');
    // The first site of the message is near the HIGH coordinate on a minus-strand track.
    const plusFirst = r.up.candidates.filter((c) => c.label === 'miR-122-5p').sort((a, b) => a.mstart - b.mstart)[0];
    const minusFirst = r2.up.candidates.filter((c) => c.label === 'miR-122-5p').sort((a, b) => a.mstart - b.mstart)[0];
    ok(minusFirst.start > plusFirst.start,
       'and the same site of the message lands at the mirrored coordinate: '
       + minusFirst.start + ' against ' + plusFirst.start);

    // ---- what it refuses ------------------------------------------------------------------
    const same = await run({ rbp: mkRbp({}, {}) }, { up: UP, down: UP });
    ok(/same track/.test(same.reason || ''), 'one track twice is not a ratio: ' + (same.reason || ''));
    const short = await run({ rbp: mkRbp({}, {}) }, { up: mkTrack('tiny', 'ACGTACGTAC'), down: DOWN });
    ok(/too short/.test(short.reason || ''), 'a track with no real sequence is refused: ' + (short.reason || ''));
    const broke = await run({ rbp: () => ({ error: 'RBP not in model: STAU1' }) }, { up: UP, down: DOWN });
    ok(/RBP not in model/.test(broke.reason || ''), 'and the model’s own refusal is passed on: ' + (broke.reason || ''));

    // ---- the limits travel with the result -------------------------------------------------
    // A shortlist of sites with sequences in it reads as a finished design. These are the
    // sentences that stop that, so they are part of the result rather than part of a view
    // that a caller might not use.
    const lim = (r.limits || []).join(' ');
    ok(/Nothing here is a measurement/.test(lim), 'it says it measures nothing');
    ok(/de-targeting list/.test(lim), 'that the microRNA set is a short curated one');
    ok(/WHERE a protein is made more than how much/.test(lim), 'and what the lowering arm actually changes');
    ok(/not a transcriptome-wide specificity check/.test(lim), 'and that selectivity here is against one transcript only');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
