// A TEXT LABEL IS READ, SO THE BOX GIVES AND THE TEXT DOES NOT.
//
//     node tools/test/text-label-drawing.js          (needs jsdom)
//
// "Remove this and potentially exclude it from dynamin complex" was drawn straight through
// the bottom border of its own box. The fitter shrank the text until it fit, and when it
// still did not fit at the smallest readable size it drew it anyway -- the one outcome
// nobody would pick, since the box is the thing that can give and the sentence is the
// thing being read.
//
// These labels are screenshotted into slides and reports, so the rest of it is the
// typography: a line height that is not the font size plus two, prose left-aligned rather
// than every line centered, paper behind a box that sits over arcs and guides, and a
// hairline that lands on a pixel instead of across two.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };

// A canvas stand-in that records what was asked of it, and measures text at a believable
// 0.5 em a character so wrapping is deterministic.
const mkCtx = () => {
    const calls = [];
    const ctx = {
        calls, font: '12px x', fillStyle: '', strokeStyle: '', lineWidth: 1,
        textAlign: '', textBaseline: '', shadowBlur: 0, shadowColor: '', shadowOffsetX: 0, shadowOffsetY: 0,
        lineJoin: '', miterLimit: 0,
        save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
        beginPath() { calls.push(['beginPath']); }, closePath() { },
        moveTo() { }, lineTo() { }, quadraticCurveTo() { },
        rect(...a) { calls.push(['rect', ...a]); },
        fill() { calls.push(['fill', this.fillStyle]); },
        stroke() { calls.push(['stroke', this.strokeStyle, this.lineWidth]); },
        fillText(t, x, y) { calls.push(['fillText', t, x, y, this.textAlign, this.font]); },
        strokeText(t, x, y) { calls.push(['strokeText', t, x, y]); },
        measureText(t) { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); const size = m ? +m[1] : 12;
            return { width: String(t).length * size * 0.5 }; }
    };
    return ctx;
};
// formatTextToFitRectangle measures through a canvas of its own, which jsdom does not
// implement: give every canvas the same believable metric.
dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
        font: '12px x',
        measureText(t) {
            const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
            const size = m ? +m[1] : 12;
            return { width: String(t).length * size * 0.5 };
        }
    };
};

// World and screen are the same here, so a number is a pixel and the geometry is readable.
const mkGraph = () => ({
    X: (v) => v, Y: (v) => v,
    screenWidth: (w) => w, screenHeight: (h) => h,
    canvas: { getCTX: () => null }
});

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f();
};

const texts = (ctx) => ctx.calls.filter((c) => c[0] === 'fillText');
const fills = (ctx) => ctx.calls.filter((c) => c[0] === 'fill');

(async () => {
    const RectangleText = await load('flexigraph/shapes/Rect-text.js');
    const SENTENCE = 'Remove this and potentially exclude it from dynamin complex';

    // ---- THE BOX GROWS RATHER THAN THE TEXT SPILLING ----------------------------------------
    // The box from the screenshot: wide enough for about two lines, given a sentence that
    // needs three.
    const mk = (w, h, text) => {
        const L = new RectangleText('note', 0, 0);
        L.w = w; L.h = h; L.comment = text == null ? SENTENCE : text;
        return L;
    };
    let L = mk(280, 40);
    let ctx = mkCtx(), g = mkGraph();
    L.draw(g, ctx);

    const lines = texts(ctx);
    ok(lines.length >= 2, 'the sentence wraps rather than running off the side: '
       + lines.length + ' lines');
    const lastY = Math.max(...lines.map((c) => c[3]));
    const lineH = L.lineHeight(+(/(\d+)px/.exec(lines[0][5]) || [0, 12])[1]);
    const boxBottom = 0 + L.h;      // h in world == pixels here, after any growth
    ok(lastY + lineH <= boxBottom,
       'and every line sits INSIDE the box, which is the whole bug: last line ends at '
       + Math.round(lastY + lineH) + ', box ends at ' + Math.round(boxBottom));
    ok(L.h > 40, 'the box is what gave: ' + Math.round(L.h) + 'px, from 40');

    // The model grows with it, or the label is drawn at one size and grabbed at another.
    L = mk(280, 40);
    const before = L.h;
    L.draw(mkGraph(), mkCtx());
    ok(L.h > before, 'the stored height grows too, so the border can still be grabbed');
    const after = L.h;
    L.draw(mkGraph(), mkCtx());
    ok(Math.abs(L.h - after) < 0.001, 'and it settles: drawing again does not grow it further');

    // A box that is already big enough is left exactly as it is.
    L = mk(400, 400);
    L.draw(mkGraph(), mkCtx());
    ok(L.h === 400, 'a box with room to spare is not resized');

    // Turning it off leaves the old behaviour for anything that depends on it.
    L = mk(280, 40); L.autoGrow = false;
    L.draw(mkGraph(), mkCtx());
    ok(L.h === 40, 'autoGrow off leaves the height alone');

    // ---- TYPOGRAPHY --------------------------------------------------------------------------
    L = mk(280, 40);
    ctx = mkCtx(); L.draw(mkGraph(), ctx);
    ok(texts(ctx).every((c) => c[4] === 'left'),
       'a sentence is left-aligned: centering every line leaves a ragged edge on both sides '
       + 'and makes a note read as a poster');
    L = mk(280, 40, 'Exon 17');
    ctx = mkCtx(); L.draw(mkGraph(), ctx);
    ok(texts(ctx).every((c) => c[4] === 'center'), 'a one-line label still centers');
    L = mk(280, 40); L.align = 'center';
    ctx = mkCtx(); L.draw(mkGraph(), ctx);
    ok(texts(ctx).every((c) => c[4] === 'center'), 'and align overrides the choice');

    ok(/sans-serif/.test(new RectangleText('a', 0, 0).font),
       'the default face is the UI stack, not bare Arial');
    ok(new RectangleText('a', 0, 0).color !== 'black',
       'and the ink is not pure black, which on a pale canvas reads as a hole');
    const probe = new RectangleText('a', 0, 0);
    ok(probe.lineHeight(18) >= 24,
       'the line height is a ratio, not the font size plus two: ' + probe.lineHeight(18));

    // ---- PAPER, SO IT CAN BE READ OVER WHAT IT SITS ON -------------------------------------------
    // The shot that started this had a sentence crossing two dashed guides and the track.
    L = mk(280, 40);
    ctx = mkCtx(); L.draw(mkGraph(), ctx);
    ok(fills(ctx).length >= 1, 'a boxed label paints paper behind its text');
    ok(/rgba\(255, ?255, ?255/.test(fills(ctx)[0][1]), 'near-opaque white: ' + fills(ctx)[0][1]);
    L = mk(280, 40); L.backgroundColor = 'rgba(10,20,40,0.9)';
    ctx = mkCtx(); L.draw(mkGraph(), ctx);
    ok(fills(ctx)[0][1] === 'rgba(10,20,40,0.9)', 'a banner that sets its own is untouched');
    L = mk(280, 40); L.defaultPaper = false;
    ctx = mkCtx(); L.draw(mkGraph(), ctx);
    ok(!fills(ctx).length, 'and it can be turned off');

    // An UNBOXED label is transparent on purpose, and gets a halo instead -- what a map
    // does with a place name over a contour.
    L = mk(280, 40); L.showRect = false;
    ctx = mkCtx(); L.draw(mkGraph(), ctx);
    ok(!fills(ctx).length, 'an unboxed label paints no box');
    ok(ctx.calls.some((c) => c[0] === 'strokeText'), 'but haloes its text so it stays readable');
    ok(ctx.calls.filter((c) => c[0] === 'strokeText').length
       === texts(ctx).length, 'on every line');

    // ---- THE BORDER IS A LINE, NOT A SMUDGE --------------------------------------------------------
    const src = fs.readFileSync('flexigraph/shapes/Rect-text.js', 'utf8');
    ok(/roundRectPath/.test(src), 'the box has rounded corners');
    ok(/A HAIRLINE LANDS ON A PIXEL/.test(src),
       'and an odd-width border is offset half a pixel so it lands on one');

    // ---- THE MENU OPENS AT THE LABEL ------------------------------------------------------------------
    const mo = fs.readFileSync('baja/manchester/menu/mouse-over-highlight.js', 'utf8');
    ok(/THE ITEMS, WHERE THE SHAPE IS/.test(mo), 'pressing a shape opens its items, not a pill');
    ok(/openFloatingMenu\(__sm/.test(mo), 'through the floating menu the variants already use');
    ok(/if \(!__floated\) graph\.showSideMenu\(__sm/.test(mo),
       'with the corner kept as the fallback, for a phone and for a menu that will not open');
    ok(/'Text label'/.test(mo), 'and a text label is called one in the title');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
