// THE RATIO SHIFT WINDOW, AND THE SITES ON THE TRACKS.
//
//     node tools/test/ratio-shift-view.js          (needs jsdom)
//
// A table of sites with oligo sequences in it reads as a finished design. What stops that
// is the sentences around it, so this checks they are there and in front of the table
// rather than trusting that they were written once.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' }; window.innerWidth = 1430; window.innerHeight = 900;
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const el = () => document.getElementById('baja-ratio-shift');
const txt = () => (el() || { textContent: '' }).textContent;

const MODEL = {
    ok: true, footprint: 20, mismatchCutoff: 4, mirnaSetSize: 8,
    verdict: 'Both arms have somewhere to aim: 1 site on DNM1_3utr and 1 on DNM3_3utr.',
    up: { track: 'DNM1_3utr', length: 530, minus: false, all: 3, selective: 1, missing: ['STAU1'],
        candidates: [
            { kind: 'mirna', label: 'miR-122-5p', detail: '8mer-1a site', start: 1400, end: 1407,
              footprint: 'ACGTACGTACACTCCAGGTT', footprintStart: 1394, footprintEnd: 1413,
              mismatches: 9, selective: true, strength: 1, score: 1 },
            { kind: 'rbp', label: 'FMR1', detail: 'repressor and transport granule', start: 1500, end: 1530,
              footprint: 'TTTTACGTACGTACGTAAAA', footprintStart: 1505, footprintEnd: 1524,
              mismatches: 0, selective: false, strength: 0.9, score: 0.135, ambiguous: true,
              otherStart: 9100, otherEnd: 9119, otherTrack: 'DNM3_3utr' }
        ] },
    dual: [{
        footprint: 'TTTTACGTACGTACGTAAAA', writtenFor: 'up', mismatches: 0, covered: 16,
        raises: { label: 'FMR1', detail: 'repressor and transport granule', strength: 0.9, selective: false },
        lowers: { label: 'FUS', detail: 'FUS travels in transport granules', strength: 0.8, selective: false },
        upStart: 1505, upEnd: 1524, downStart: 9100, downEnd: 9119, score: 0.8
    }],
    dualAll: 1,
    down: { track: 'DNM3_3utr', length: 760, minus: true, all: 2, selective: 1, missing: [],
        candidates: [
            { kind: 'rbp', label: 'TARDBP', detail: 'TDP-43 carries messages into the axon', start: 9000, end: 9040,
              footprint: 'GGGGTTTTACGTACGTCCCC', footprintStart: 9010, footprintEnd: 9029,
              mismatches: 11, selective: true, strength: 0.88, score: 0.88 }
        ] },
    limits: ['Nothing here is a measurement.', 'The microRNA set is the de-targeting list, 8 microRNAs.',
        'Blocking a transport site changes WHERE a protein is made.']
};

// A track says how wide it is, which is what decides whether a 20-mer has to be widened
// to be visible at all.
const mkTrack = (name, xi, xf) => ({ name: name, xi: xi, xf: xf, track_layers: [],
    addLayer(l) { this.track_layers.push(l); } });

(async () => {
    const up = mkTrack('DNM1_3utr', 1000, 1600), down = mkTrack('DNM3_3utr', 8800, 9400);
    const said = [];
    const graph = { setResultMessage: (m) => said.push(m), wake: () => { }, rescale: () => { } };
    const v = await load('baja/bio/expression/ratio-shift-view.js', graph, MODEL, { up: up, down: down });
    ok(v === true && !!el(), 'the window opens');

    const t = txt();
    ok(/WHAT THE PAIR SUPPORTS/.test(t) && /Both arms have somewhere to aim/.test(t), 'the verdict is in it');

    // ONE SEQUENCE THAT DOES BOTH IS THE HEADLINE, above the two arms: it is a different
    // design, not a better candidate, and the thing it costs is said with it.
    ok(t.indexOf('ONE SEQUENCE THAT DOES BOTH') >= 0, 'the dual section is there');
    ok(t.indexOf('ONE SEQUENCE THAT DOES BOTH') < t.indexOf('Raise DNM1_3utr'), 'and above the two arms');
    ok(t.indexOf('TTTTACGTACGTACGTAAAA') >= 0, 'with the sequence itself');
    ok(/identical in both/.test(t), 'saying it binds both without a mismatch');
    ok(/raises/.test(t) && /lowers/.test(t) && t.indexOf('FMR1') >= 0 && t.indexOf('FUS') >= 0,
       'and what it does at each end');
    ok(/cannot be dosed apart/.test(t), 'and what one molecule costs you');
    ok(/Raise DNM1_3utr/.test(t) && /Lower DNM3_3utr/.test(t), 'one column per arm, each saying which way it goes');
    ok(t.indexOf('miR-122-5p') >= 0 && t.indexOf('TARDBP') >= 0, 'the candidates are listed');
    ok(t.indexOf('ACGTACGTACACTCCAGGTT') >= 0, 'with the sequence a blocker would cover');

    // THE SENTENCES THAT STOP THE TABLE READING AS A DESIGN.
    for (const w of ['Nothing here is a measurement', 'de-targeting list', 'WHAT THIS IS NOT']) {
        ok(t.indexOf(w) >= 0, 'it carries: ' + w);
    }
    ok(/would probably hit both/.test(t), 'and a site that cannot be aimed says so where it is read');
    ok(/cuts both ways/.test(t), 'a protein that both represses and transports is marked as ambiguous');
    ok(/no head for STAU1/.test(t), 'a protein the model cannot score is named, not silently missing');
    ok(/minus strand, scanned on the message/.test(t), 'and a minus-strand arm says where it was scanned');

    // ---- the same sites, on the tracks ---------------------------------------------------
    ok(up.track_layers.length === 1 && down.track_layers.length === 1, 'one layer per track');
    const L = up.track_layers[0];
    ok(/_RATIO_raise$/.test(L.name) && /_RATIO_lower$/.test(down.track_layers[0].name),
       'named for the direction they are for: ' + L.name);
    ok(L.intervals.filter((iv) => !/one sequence/.test('' + iv.t)).length === 2, 'a band per candidate');
    // Bands are looked up by what they are ABOUT, since the label now leads with the key.
    const bandFor = (layer, what) => layer.intervals.filter((iv) => ('' + iv.t).indexOf(what) >= 0)[0];
    const bands = { 'miR-122-5p': bandFor(L, 'miR-122-5p'), FMR1: bandFor(L, 'FMR1') };
    ok(bands['miR-122-5p'].x1 === 1394 && bands['miR-122-5p'].x2 === 1413,
       'drawn over the blocker footprint, not over the seed: '
       + bands['miR-122-5p'].x1 + '-' + bands['miR-122-5p'].x2);
    ok(/20 nt/.test(bands['miR-122-5p'].t), 'and the label carries the real length of it');
    ok(/hits both/.test(bands['FMR1'].t), 'a band that cannot be aimed says so on the band');
    // AND WHERE IT WOULD GO INSTEAD. "0 mismatches from the other transcript" is a number;
    // the place it refers to is on the other track, and that is where it is drawn.
    const strays = down.track_layers[0].intervals.filter((iv) => /would also bind here/.test('' + iv.t));
    ok(strays.length === 1, 'the other track is marked where that blocker would also land');

    // THE LABELS LINK THE TWO TRACKS. A band labelled by what it is -- "FUS", "FMR1" --
    // names the site and not the proposal, so a band on one track and the red band it
    // explains on the other had nothing joining them but the reader's memory. The key does
    // that joining, and it is the same key in the window.
    const keyOfBand = (iv) => ('' + iv.t).split(' ')[0];
    ok(/^R2$/.test(keyOfBand(bands.FMR1)), 'each band leads with a key: ' + keyOfBand(bands.FMR1));
    ok(keyOfBand(strays[0]) === keyOfBand(bands.FMR1),
       'and the band on the other track carries the SAME key: ' + strays[0].t);
    ok(/^R1 /.test(bands['miR-122-5p'].t), 'the raising arm is keyed R: ' + bands['miR-122-5p'].t);
    ok(/^L1 /.test(('' + bandFor(down.track_layers[0], 'TARDBP').t)), 'the lowering arm L');
    const dualBand = bandFor(L, 'one sequence');
    ok(/^D1 /.test('' + dualBand.t), 'and a sequence that does both is D: ' + dualBand.t);
    ok(keyOfBand(dualBand) === keyOfBand(bandFor(down.track_layers[0], 'one sequence')),
       'with the same D key on both tracks, which is the whole point of it');
    // The key is its own chip beside the name, so in flat text it runs into it.
    ok(/R1miR-122-5p/.test(t.replace(/\s+/g, '')) && /D1TTTT/.test(t.replace(/\s+/g, '')),
       'the window shows the same keys, beside what they name');
    ok(/Each key is drawn on both tracks/.test(t), 'and says what they are for');
    ok(/would also bind/.test((down.track_layers[0].decor.help.rows || []).map((r) => r.join(' ')).join(' ')),
       'with the reason in the help rows');
    ok(bands['FMR1'].color !== bands['miR-122-5p'].color, 'and is drawn differently');
    ok(/not a measurement/.test(L.decor.help.note), 'the help note keeps the caveat beside the sequence');
    ok(L.pop === true && down.track_layers[0].pop === true,
       'both layers are raised off their track, so a band is findable among four others');

    // A 20-MER ON A WHOLE GENE IS NOTHING TO LOOK AT. The band is widened so the layer says
    // WHERE, and the note says that is what happened.
    const wideUp = mkTrack('DNM1', 1000, 580000), wideDown = mkTrack('DNM3', 8800, 580000);
    await load('baja/bio/expression/ratio-shift-view.js',
        { setResultMessage: () => { }, wake: () => { }, rescale: () => { } }, MODEL,
        { up: wideUp, down: wideDown });
    const W = wideUp.track_layers[0].intervals.filter((iv) => /miR-122/.test('' + iv.t))[0];
    ok((W.x2 - W.x1) > 1000, 'on a gene-wide track the band is widened to be visible: ' + (W.x2 - W.x1));
    ok(/20 nt/.test(W.t), 'while its label still says what the oligo really covers');
    ok(/drawn at that width so they can be seen/.test(wideUp.track_layers[0].decor.help.note),
       'and the note declares the widening');
    ok(/where the protein is made more than how much/.test(down.track_layers[0].decor.help.note),
       'and the lowering layer says what it actually changes');

    ok(/nothing here measures either message/.test(said.join(' ')), 'the closing line says it too');
    ok(/1 sequence would do both ends at once/.test(said.join(' ')), 'and leads with the dual answer');

    // The dual sequence is a band on BOTH tracks: one stretch, two jobs, which is the claim.
    for (const [who, trk] of [['up', up], ['down', down]]) {
        const b = trk.track_layers[0].intervals.filter((iv) => /one sequence/.test('' + iv.t))[0];
        ok(!!b, 'the dual sequence is drawn on the ' + who + ' track');
        ok(/raises FMR1, lowers FUS/.test((b || {}).t || ''), 'labelled with both jobs on the ' + who + ' track');
    }
    const bUp = up.track_layers[0].intervals.filter((iv) => /one sequence/.test('' + iv.t))[0];
    const bDown = down.track_layers[0].intervals.filter((iv) => /one sequence/.test('' + iv.t))[0];
    ok(bUp.x1 === 1505 && bDown.x1 === 9100, 'each at its own position: ' + bUp.x1 + ' and ' + bDown.x1);
    ok(bUp.color === bDown.color && bUp.color !== bands['miR-122-5p'].color,
       'in a colour of their own, because it is a different design and not a better candidate');

    // "NONE" IS AN ANSWER TO THE QUESTION THAT WAS ASKED. An empty section is not.
    document.body.innerHTML = '';
    const up2 = mkTrack('DNM1_3utr', 1000, 1600), down2 = mkTrack('DNM3_3utr', 8800, 9400);
    const noDual = JSON.parse(JSON.stringify(MODEL));
    noDual.dual = []; noDual.dualAll = 0;
    await load('baja/bio/expression/ratio-shift-view.js',
        { setResultMessage: () => { }, wake: () => { }, rescale: () => { } }, noDual,
        { up: up2, down: down2 });
    const t2 = txt();
    ok(/ONE SEQUENCE THAT DOES BOTH/.test(t2) && /None\./.test(t2),
       'with no dual sequence the section says None rather than vanishing');
    ok(/need an oligo each/.test(t2), 'and what that means for the design');

    // A refusal makes no window at all.
    document.body.innerHTML = '';
    const said2 = [];
    const g2 = { setResultMessage: (m) => said2.push(m), wake: () => { }, rescale: () => { } };
    const v2 = await load('baja/bio/expression/ratio-shift-view.js', g2,
        { ok: false, reason: 'DNM1 has no sequence loaded' }, {});
    ok(v2 === false && !el(), 'a refusal opens nothing');
    ok(/no sequence loaded/.test(said2.join(' ')), 'and is said as written: ' + said2.join(' '));

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
