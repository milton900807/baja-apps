// THE EXON NUMBER SITS ON THE EXON, AND NOTHING IS DRAWN UNDER IT.
//
//     node tools/test/exon-badge.js
//
// Zoomed in the badge is a 40px opaque white disc, so whatever an exon has to say has to
// be drawn clear of it -- the stability label goes above its reach (see
// tools/test/exon-stability.js). Lifting the BADGE instead was tried and was worse: it
// then stood in the sequence and amino-acid rows, which is busier ground than the capsule.
// This holds it where it belongs, and holds the band under it clear.
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
    return (typeof f === 'function') ? f(...a) : f;
};
// createIon/getIon go through lion_engine; the ion IS the function here.
global.lion_engine = {
    exec: (p, ...a) => load(p, ...a),
    createIonFunction: (f) => f,
    getIonFunction: (r) => r
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A recording context: every circle, line and string with the y it was drawn at.
const recorder = () => {
    const r = { arcs: [], texts: [], lines: [], _p: [] };
    let cur = null;
    const ctx = {
        canvas: { width: 1600, height: 800 },
        save() { }, restore() { }, beginPath() { cur = { from: null, to: null }; },
        closePath() { }, setLineDash() { }, clip() { }, fill() { }, fillRect() { },
        measureText: (t) => ({ width: ('' + t).length * 7 }),
        createLinearGradient: () => ({ addColorStop() { } }),
        arc(x, y, rad) { r.arcs.push({ x: x, y: y, r: rad, fill: this.fillStyle }); },
        moveTo(x, y) { if (cur) cur.from = { x: x, y: y }; },
        lineTo(x, y) { if (cur) cur.to = { x: x, y: y }; },
        stroke() { if (cur && cur.from && cur.to) r.lines.push({ from: cur.from, to: cur.to, color: this.strokeStyle }); },
        fillText(t, x, y) { r.texts.push({ t: '' + t, x: x, y: y }); },
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
        shadowBlur: 0, shadowColor: '', shadowOffsetX: 0, shadowOffsetY: 0, globalAlpha: 1
    };
    return { r, ctx };
};

// A screen grid: world y UP is screen y DOWN, as flexigraph/grid.js Y() does
// (originScreen - (y - oy) * yscale), so "above" on screen is a SMALLER y.
const mkGraph = (ctx, screencell) => ({
    canvas: { getCTX: () => ctx, width: 1600, height: 800 },
    X: (x) => x,
    Y: (y) => 400 - y * 40,
    screenWidth: () => screencell,
    drawLine() { }, drawVerticalLine() { }, drawString() { }, drawArrowhead() { },
    drawScreenText() { },
    __exonBadgeXs: [],
    theme: 'classic'
});

(async () => {
    const shapes = await load('flexigraph/gene-draw.js');
    ok(typeof shapes.Exon === 'function', 'the Exon shape is there to call');

    // Zoomed IN: screenWidth(1) is big, so the badge is the 20px-radius one.
    const { r, ctx } = recorder();
    const graph = mkGraph(ctx, 12);
    const tgraph = { X: (x) => x, Y: (y) => y, screenWidth: () => 1 };
    const ann = { index: 6, showIndex: true, xi: 900, xf: 1100 };
    shapes.Exon(graph, tgraph, 900, 1100, 0, null, ann, '+');

    const yExon = graph.Y(0);
    const badge = r.arcs.find((a) => a.r === 20);
    ok(!!badge, 'the number badge is drawn: ' + JSON.stringify(badge));
    const num = r.texts.find((t) => t.t === '6');
    ok(!!num, 'with the exon number in it');

    ok(Math.abs(badge.y - yExon) < 0.001,
       'centred on the exon lane, where it is read: ' + badge.y + ' vs ' + yExon);
    ok(Math.abs(badge.x - 1000) < 0.001, 'and centred along the exon: ' + badge.x);
    ok(num && Math.abs(num.y - badge.y) < 0.001 && Math.abs(num.x - badge.x) < 0.001,
       'the number is in the disc, not beside it: ' + JSON.stringify(num));

    // WHAT THIS COSTS, stated so the other half of the fix is not quietly dropped: the disc
    // owns a 40px band on the exon, so anything the exon says goes outside it. The stability
    // label is drawn at baseline - 30 for exactly this reason.
    ok(badge.y - badge.r <= yExon - 20 + 0.001,
       'the disc reaches 20px above the lane, which the stability row clears: '
       + (badge.y - badge.r));

    // The badge is not joined to the exon by anything: it is ON it.
    ok(!r.lines.some((l) => Math.abs(l.from.x - 1000) < 0.001 && l.from.y !== l.to.y),
       'no leader line, since it never left the exon');

    // Zoomed OUT the small badge is unchanged -- it was never on the exon.
    const b = recorder();
    const g2 = mkGraph(b.ctx, 0.2);
    shapes.Exon(g2, tgraph, 900, 1100, 0, null, { index: 6, showIndex: true, xi: 900, xf: 1100 }, '+');
    const small = b.r.arcs.find((a) => a.r === 10);
    ok(!!small && Math.abs(small.y - (g2.Y(0) + 38)) < 0.001,
       'zoomed out, the small badge is where it was: ' + (small ? small.y : '(none)'));
    ok(!b.r.lines.some((l) => Math.abs(l.from.x - 1000) < 0.001 && l.from.y !== l.to.y),
       'and gets no leader, since it never stood on the exon');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
