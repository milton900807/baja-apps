// HOW STABLY EACH EXON SPLICES, WRITTEN ON THE EXON.
//
//     node tools/test/exon-stability.js
//
// The arcs carry the numbers, but reading an exon's stability off them means finding its
// skip arc, noticing the dashes and subtracting from 100 -- and an exon with no skip arc,
// the commonest and best case, carries no number anywhere.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const recorder = () => {
    const r = { texts: [], strokes: [], plates: [] };
    const ctx = {
        canvas: { width: 1600, height: 800 },
        save() { }, restore() { }, beginPath() { }, closePath() { }, setLineDash() { },
        arc() { }, moveTo() { }, lineTo() { }, stroke() { }, fill() { },
        // Recorded now: the stability tag sits on an opaque plate, and a test that
        // cannot see the plate cannot tell a covered label from a transparent one.
        fillRect(x, y, w, h) { r.plates.push({ x: x, y: y, w: w, h: h, color: this.fillStyle }); },
        roundRect(x, y, w, h) { r.plates.push({ x: x, y: y, w: w, h: h, color: this.fillStyle }); },
        createLinearGradient: () => ({ addColorStop() { } }),
        measureText: (t) => ({ width: ('' + t).length * 6 }),
        fillText(t, x, y) { r.texts.push({ t: '' + t, x: x, y: y, color: this.fillStyle }); },
        strokeText(t, x, y) { r.strokes.push({ t: '' + t, x: x, y: y }); },
        rotate() { }, translate() { },
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
        globalAlpha: 1, shadowBlur: 0, shadowColor: '', lineJoin: '', miterLimit: 0
    };
    return { r, ctx };
};

// Six exons, 2000 apart and 1500 long, which at this zoom is 300px: wide enough to carry
// the long form of the label.
const mkTrack = () => {
    const anns = [];
    for (let i = 1; i <= 6; i++) {
        anns.push({ type: 'Exon', index: i, xi: i * 2000, xf: i * 2000 + 1500, showIndex: true });
    }
    return { name: 'DNM3', xi: 0, xf: 16000, annotations: anns, track_layers: [] };
};

(async () => {
    const TrackLayer = await load('baja/bio/track-layer.js');
    const track = mkTrack();
    const layer = new TrackLayer('DNM3_psi_sashimi', 0, 0, 16000, 1);
    layer.arc_type = 'SpliceSashimi';
    layer.magnitudeMode = 'psi';
    layer.magMax = 1;
    layer.junctions = [
        // Inclusion arcs, which say nothing about an exon's own stability on their own.
        { d: 3500, a: 4000, dp: 1, ap: 1, mag: 0.96, kind: 'junction', annotated: true, exons: [1, 2] },
        { d: 5500, a: 6000, dp: 1, ap: 1, mag: 0.70, kind: 'junction', annotated: true, exons: [2, 3] },
        // Exon 3 is skipped in 30% of transcripts, exon 5 in 70%.
        { d: 5500, a: 8000, dp: 1, ap: 1, mag: 0.30, kind: 'skip', annotated: true, exon: 3 },
        { d: 9500, a: 12000, dp: 1, ap: 1, mag: 0.70, kind: 'skip', annotated: true, exon: 5 },
        // Two skip arcs for exon 4: the bigger one is the one that counts.
        { d: 7500, a: 10000, dp: 1, ap: 1, mag: 0.04, kind: 'skip', annotated: true, exon: 4 },
        { d: 7500, a: 10000, dp: 1, ap: 1, mag: 0.08, kind: 'skip', annotated: true, exon: 4 }
    ];

    const { r, ctx } = recorder();
    const graph = { canvas: { getCTX: () => ctx }, width: 1600, X: (x) => x / 10, Y: (y) => 400 - y };
    const tgraph = { X: (x) => x, Y: (y) => y };
    layer.drawSashimi(tgraph, graph, track);

    const label = (n) => r.texts.find((t) => new RegExp('^e' + n + ' ').test(t.t));
    ok(!!label(1), 'an exon nothing skips is labelled: ' + (label(1) || {}).t);
    ok(label(1) && /100% constitutive/.test(label(1).t),
       'and is called constitutive, not left blank: ' + (label(1) || {}).t);
    ok(label(3) && /70% stable/.test(label(3).t),
       'an exon skipped in 30% is 70% stable: ' + (label(3) || {}).t);
    ok(label(5) && /30% stable/.test(label(5).t),
       'and one skipped in 70% is 30% stable: ' + (label(5) || {}).t);
    ok(label(4) && /92% stable/.test(label(4).t),
       'two skip arcs on one exon: the bigger one counts: ' + (label(4) || {}).t);

    // The colour is the reading at a glance; the number is the measurement.
    ok(label(1) && label(1).color === '#15803d', 'a kept exon is green: ' + (label(1) || {}).color);
    ok(label(3) && label(3).color === '#b45309', 'one that often skips is amber: ' + (label(3) || {}).color);
    ok(label(5) && label(5).color === '#b91c1c', 'one mostly skipped is red: ' + (label(5) || {}).color);

    // AN OPAQUE PLATE, NOT A HALO. A halo only outlines the glyphs, so whatever runs
    // under the label shows through between the strokes; under this one is the
    // amino-acid row, which is dense and the same size, and the label was reported as
    // unreadable over it. The plate has to be behind the label and at least as wide.
    const plate = r.plates.filter((p) => Math.abs((p.y + p.h / 2) - label(1).y) < 2)
        .sort((a, b) => b.w - a.w)[0];
    ok(!!plate, 'the label sits on a plate');
    ok(plate && /255, *255, *255/.test('' + plate.color), 'the plate is opaque white: '
       + (plate || {}).color);
    ok(plate && plate.w >= ('' + label(1).t).length * 6,
       'the plate covers the whole label: ' + (plate || {}).w);

    // BELOW THE EXON, and clear of the index disc: that badge is a 40px opaque disc
    // centred on the capsule and on the exon's midpoint, which is where this tag sits.
    // Above the capsule are the codon-number and amino-acid rows, which is why the tag
    // is underneath at all, so a regression that lifts it back up must fail here.
    const baselineY = graph.Y(tgraph.Y(0));
    ok(label(1).y > baselineY, 'the label sits BELOW the exon: ' + label(1).y
       + ' vs baseline ' + baselineY);
    ok(label(1).y >= baselineY + 20 + 1,
       'and clears the exon number disc: ' + label(1).y + ' vs baseline ' + baselineY);
    ok(label(1).y === baselineY + 30,
       'ten pixels below the disc, in one straight row: ' + label(1).y);
    ok(r.texts.filter((t) => /stable|constitutive/.test(t.t))
        .every((t) => t.y === label(1).y), 'every exon on the same row');
    // Centred on its own exon, so it is obvious which exon it is about.
    ok(Math.abs(label(3).x - (graph.X(6000) + graph.X(7501)) / 2) < 1.5,
       'centred on the exon it describes: ' + label(3).x);

    // A narrow exon gets the number alone, and a hopeless one gets nothing.
    const narrow = () => {
        const t2 = { name: 'x', xi: 0, xf: 16000, annotations: [
            { type: 'Exon', index: 1, xi: 1000, xf: 1400 },     // 40px on screen
            { type: 'Exon', index: 2, xi: 3000, xf: 3030 }      // 3px on screen
        ], track_layers: [] };
        const b = recorder();
        const g2 = { canvas: { getCTX: () => b.ctx }, width: 1600, X: (x) => x / 10, Y: (y) => 400 - y };
        layer.drawSashimi(tgraph, g2, t2);
        // Only the stability row: the arcs write their own percentages elsewhere.
        // BADGE_R (20) + 10, BELOW the baseline: clear of the exon index disc, and on the
        // side of the capsule the amino-acid rows do not use.
        const row = g2.Y(tgraph.Y(0)) + 30;
        return b.r.texts.filter((x) => Math.abs(x.y - row) < 0.001);
    };
    const nt = narrow();
    ok(nt.some((x) => x.t === '100%'), 'a narrow exon keeps the number alone: ' + JSON.stringify(nt.map((x) => x.t)));
    ok(!nt.some((x) => /^e2/.test(x.t)), 'and one with no room at all is left alone');

    // Sites mode is a different quantity and says nothing about inclusion.
    const sites = new TrackLayer('DNM3_sashimi', 0, 0, 8000, 1);
    sites.arc_type = 'SpliceSashimi';
    sites.magnitudeMode = 'sites';
    sites.magMax = 2;
    sites.junctions = layer.junctions;
    const c = recorder();
    const g3 = { canvas: { getCTX: () => c.ctx }, width: 1600, X: (x) => x / 10, Y: (y) => 400 - y };
    sites.drawSashimi(tgraph, g3, track);
    ok(!c.r.texts.some((x) => /stable|constitutive/.test(x.t)),
       'site strength draws no stability label: ' + JSON.stringify(c.r.texts.map((x) => x.t).slice(0, 6)));

    // PSI THAT MUST NOT BE BELIEVED. The regression guard for SMN2 exon 7, which was
    // drawn as "96% constitutive" on an ASO target. The model was obedient: its label
    // was blended with SMN1's because short reads do not separate two 99.9%-identical
    // genes. An exon in duplicated sequence must therefore lose its NUMBER, not merely
    // gain a warning somewhere else, because the number is the thing that gets believed.
    const untrusted = () => {
        const t2 = { name: 'SMN2', xi: 0, xf: 16000, annotations: mkTrack().annotations,
                     track_layers: [] };
        const u = new TrackLayer('SMN2_psi_sashimi', 0, 0, 16000, 1);
        u.arc_type = 'SpliceSashimi';
        u.magnitudeMode = 'psi';
        u.magMax = 1;
        u.junctions = layer.junctions;
        // exon 1 is clean; exon 3, which would otherwise read "70% stable", sits in a
        // segmental duplication shared with SMN1
        u.untrustedSpans = [{ xi: 6000, xf: 7500, why: 'SMN1' }];
        const b = recorder();
        const g = { canvas: { getCTX: () => b.ctx }, width: 1600, X: (x) => x / 10, Y: (y) => 400 - y };
        u.drawSashimi(tgraph, g, t2);
        return b.r;
    };
    const ur = untrusted();
    const ulabel = (n) => ur.texts.find((t) => new RegExp('^e' + n + ' ').test(t.t));
    // Whichever form fitted, it must still identify the exon it is about.
    const wideLabelOrMid = (rr) => rr.texts.find((t) => /^e3 .*trusted/.test(t.t));
    ok(ulabel(3) && /not trusted/.test(ulabel(3).t),
       'an exon in duplicated sequence says so: ' + (ulabel(3) || {}).t);
    ok(ulabel(3) && !/%/.test(ulabel(3).t),
       'and carries NO percentage at all: ' + (ulabel(3) || {}).t);
    ok(!!wideLabelOrMid(ur), 'a flagged exon keeps its own number where there is room: '
       + JSON.stringify(ur.texts.filter((t) => /trusted/.test(t.t)).map((t) => t.t)));
    // The twin's name is the first thing dropped when the exon is narrow, so it is
    // checked on an exon wide enough to carry it rather than asserted unconditionally.
    const wideU = () => {
        const t2 = { name: 'SMN2', xi: 0, xf: 16000, annotations: [
            { type: 'Exon', index: 3, xi: 2000, xf: 8000, showIndex: true }   // 600px
        ], track_layers: [] };
        const u = new TrackLayer('SMN2_wide', 0, 0, 16000, 1);
        u.arc_type = 'SpliceSashimi'; u.magnitudeMode = 'psi'; u.magMax = 1;
        u.junctions = layer.junctions;
        u.untrustedSpans = [{ xi: 2000, xf: 8000, why: 'SMN1' }];
        const b = recorder();
        const g = { canvas: { getCTX: () => b.ctx }, width: 1600, X: (x) => x / 10, Y: (y) => 400 - y };
        u.drawSashimi(tgraph, g, t2);
        return b.r.texts.find((t) => /trusted/.test(t.t));
    };
    const wl = wideU();
    ok(wl && /SMN1/.test(wl.t), 'given room it names the locus it is confused with: '
       + (wl || {}).t);
    ok(ulabel(3) && ulabel(3).color === '#475569',
       'drawn grey, not green: ' + (ulabel(3) || {}).color);
    // The flag is per exon, by overlap: flagging one must not silence the others.
    ok(ulabel(1) && /100% constitutive/.test(ulabel(1).t),
       'a clean exon on the same track keeps its number: ' + (ulabel(1) || {}).t);
    ok(ulabel(5) && /30% stable/.test(ulabel(5).t),
       'and so does one further away: ' + (ulabel(5) || {}).t);

    // A MEASUREMENT OUTRANKS THE WITHHELD CASE. SMN2 exon 7 is both: its PSI cannot be
    // predicted, AND someone has measured it at about a tenth. Showing "not trusted"
    // there would be withholding a number we have, so the measurement wins -- but it
    // must be marked as measured and never pass as model output.
    const withMeasured = () => {
        const t2 = { name: 'SMN2', xi: 0, xf: 16000, annotations: mkTrack().annotations,
                     track_layers: [] };
        const u = new TrackLayer('SMN2_measured', 0, 0, 16000, 1);
        u.arc_type = 'SpliceSashimi'; u.magnitudeMode = 'psi'; u.magMax = 1;
        u.junctions = layer.junctions;
        // exon 3 is flagged untrusted AND carries a published measurement
        u.untrustedSpans = [{ xi: 6000, xf: 7500, why: 'SMN1' }];
        u.measuredPsi = [{ xi: 6000, xf: 7500, psi: 0.10, lo: 0.05, hi: 0.20,
                           gene: 'SMN2', exon: '7' }];
        const b = recorder();
        const g = { canvas: { getCTX: () => b.ctx }, width: 1600, X: (x) => x / 10, Y: (y) => 400 - y };
        u.drawSashimi(tgraph, g, t2);
        return b.r;
    };
    const mr = withMeasured();
    const m3 = mr.texts.find((t) => /^e3 /.test(t.t));
    ok(m3 && /10%/.test(m3.t), 'the measured value is shown, not withheld: ' + (m3 || {}).t);
    ok(m3 && /measured/.test(m3.t), 'and is labelled as a measurement: ' + (m3 || {}).t);
    ok(m3 && !/not trusted/.test(m3.t),
       'the untrusted wording gives way to it: ' + (m3 || {}).t);
    ok(m3 && m3.color === '#6d28d9',
       'drawn violet, so it is not read as model output: ' + (m3 || {}).color);
    ok(m3 && /~/.test(m3.t),
       'given as approximate, since the published figure is a range: ' + (m3 || {}).t);
    // The prediction for that exon was 70%; the measurement must replace it, not blend.
    ok(m3 && !/70%/.test(m3.t), 'the prediction is not shown alongside it on the exon');
    // And an exon with no measurement is untouched by any of this.
    ok(mr.texts.some((t) => /^e5 . 30% stable/.test(t.t)),
       'an exon with no measurement keeps its prediction');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
