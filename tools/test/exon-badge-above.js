// THE EXON NUMBER BADGE SITS ABOVE THE EXON, NOT ON IT.
//
//     node tools/test/exon-badge-above.js
//
// Zoomed in, the badge is a 40px opaque white disc. Centred on the capsule it covered the
// middle of whatever the exon says underneath -- a PSINet "99% constitutive" read as
// "99%   utive", which is worse than no label, because the part left showing looks like
// the whole of it.
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

    // The capsule is exonWidth + 2 = 14 tall, so its top edge is 7 above the lane.
    const EXON_TOP = yExon - 7;
    ok(badge.y + badge.r <= EXON_TOP + 0.001,
       'the whole disc clears the top of the exon: badge bottom ' + (badge.y + badge.r)
       + ' vs exon top ' + EXON_TOP);
    ok(badge.y < yExon, 'which is ABOVE it on screen, not below: ' + badge.y + ' vs ' + yExon);
    ok(num && Math.abs(num.y - badge.y) < 0.001, 'the number rides with the disc, not left behind on the exon: '
       + (num ? num.y : '(none)'));
    ok(Math.abs(badge.x - 1000) < 0.001, 'still centred on the exon: ' + badge.x);

    // NOTHING IS DRAWN ACROSS THE LANE ITSELF any more: that band belongs to whatever the
    // exon says (PSINet's "99% constitutive" is drawn just under it).
    const BAND_TOP = yExon - 7, BAND_BOTTOM = yExon + 22;   // capsule + the line of text under it
    // Only the number badges count here; the capsule draws its own rounded end caps with
    // arc() too, and those ARE the exon.
    const across = r.arcs.filter((a) => (a.r === 10 || a.r === 20)
        && (a.y + a.r) > BAND_TOP && (a.y - a.r) < BAND_BOTTOM);
    ok(!across.length, 'no badge overlaps the exon or the line of text under it: ' + JSON.stringify(across));

    // The badge is tied to its exon by a hairline, or a lifted number belongs to nobody.
    const leader = r.lines.find((l) => Math.abs(l.from.x - 1000) < 0.001 && Math.abs(l.to.x - 1000) < 0.001
        && l.from.y !== l.to.y);
    ok(!!leader, 'a leader joins the badge to the exon: ' + JSON.stringify(leader));
    ok(leader && Math.min(leader.from.y, leader.to.y) >= badge.y + badge.r - 0.001
       && Math.max(leader.from.y, leader.to.y) <= EXON_TOP + 0.001,
       'running from the disc down to the capsule and no further: ' + JSON.stringify(leader));

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
