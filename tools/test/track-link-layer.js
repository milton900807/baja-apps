// A LINE FROM A PLACE ON ONE TRACK TO A PLACE ON ANOTHER.
//
//     node tools/test/track-link-layer.js
//
// A layer is drawn by its own track and cannot reach the one above it, so a result that
// belongs to two tracks -- this stretch of DNM1 is that stretch of DNM3 -- had nowhere to
// be drawn and was reported in a sentence, which cannot say where. The painter runs on
// every frame against the tracks' own coordinates, so what matters is that it reads those
// coordinates when it draws rather than baking them in, and that it never takes the frame
// down with it.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const core = fs.readFileSync('lib/core.js', 'utf8');
global.window = { env: { apiUrl: '' } };

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

// A recording context: what is drawn matters less than where, so the moves and lines are
// collected and read back as coordinates.
const mkCtx = () => {
    const ops = [];
    const ctx = {
        ops: ops, save() { }, restore() { }, beginPath() { ops.push(['begin']); },
        moveTo(x, y) { ops.push(['move', x, y]); }, lineTo(x, y) { ops.push(['line', x, y]); },
        bezierCurveTo(a, b, c, d, e, f) { ops.push(['curve', a, b, c, d, e, f]); },
        stroke() { ops.push(['stroke']); }, fill() { }, rect() { }, roundRect() { },
        measureText: (t) => ({ width: ('' + t).length * 6 }), fillText(t, x, y) { ops.push(['text', t, x, y]); },
        set filter(v) { }, get filter() { return 'none'; },
        globalAlpha: 1, lineWidth: 1, lineCap: '', lineJoin: '', font: '', textAlign: '', textBaseline: '',
        fillStyle: '', strokeStyle: ''
    };
    return ctx;
};
const mkTrack = (name, yi) => ({ name: name, tgraph: { yi: yi, X: (v) => v } });
const mkGraph = (tracks) => ({ track: tracks, X: (v) => v / 10, Y: (v) => v, wake() { this.woke = (this.woke || 0) + 1; } });

(async () => {
    const A = mkTrack('DNM1_3utr', 100), B = mkTrack('DNM3_3utr', 300);
    const g = mkGraph([A, B]);
    const links = [{ from: { track: A, start: 1000, end: 1100 }, to: { track: B, start: 5000, end: 5100 }, label: '94%' }];
    const painter = await load('baja/bio/compare/track-link-layer.js', g, links, { id: 'sim' });

    ok(!!painter && (g.__linkPainters || []).length === 1, 'the painter is registered on the graph');
    ok(g.woke > 0, 'and the canvas is redrawn so it appears at once');

    const c = mkCtx();
    painter.draw(c, g);
    const moves = c.ops.filter((o) => o[0] === 'move');
    const lines = c.ops.filter((o) => o[0] === 'line');
    const curves = c.ops.filter((o) => o[0] === 'curve');

    // THE SPAN AT EACH END, not a point: a line landing in the middle of a 500 nt match
    // says nothing about how much of the track it covers.
    ok(moves.some((m) => m[1] === 100 && m[2] === 100) && lines.some((l) => l[1] === 110 && l[2] === 100),
       'the span on the first track is drawn at its own coordinates');
    ok(moves.some((m) => m[1] === 500 && m[2] === 300) && lines.some((l) => l[1] === 510 && l[2] === 300),
       'and the span on the second');
    ok(curves.length === 1, 'joined by one curve');
    ok(curves[0][0] === 'curve' && Math.abs(curves[0][5] - 505) < 0.01 && curves[0][6] === 300,
       'which ends on the match: ' + JSON.stringify(curves[0].slice(5)));
    const text = c.ops.filter((o) => o[0] === 'text')[0];
    ok(text && text[1] === '94%', 'with the identity on it: ' + (text && text[1]));
    ok(text[3] === 200, 'at the midpoint between the tracks: ' + text[3]);

    // IT READS THE TRACKS EVERY FRAME. Baked-in screen coordinates would leave the line
    // behind the moment the canvas panned or a track moved.
    A.tgraph.yi = 150;
    const c2 = mkCtx();
    painter.draw(c2, g);
    ok(c2.ops.filter((o) => o[0] === 'move').some((m) => m[2] === 150),
       'a track that moved takes its end of the line with it');

    // ---- WHERE THE LINE LEAVES THE TRACK ------------------------------------------------
    // The middle of the track, not its top edge. From the top it reads as belonging to
    // whatever is above the track and crosses everything drawn on it on the way out, which
    // is what it looked like on screen. tgraph.Y maps 0 at the bottom of the track to 1 at
    // the top, the same scale the layers are placed on.
    const mkMidTrack = (name, top, h) => ({
        name: name, tgraph: { yi: top, X: (v) => v, Y: (f) => top + h * (1 - f) }
    });
    const M1 = mkMidTrack('DNM1_3utr', 100, 40), M2 = mkMidTrack('DNM3_3utr', 300, 60);
    const gm = mkGraph([M1, M2]);
    const pm = await load('baja/bio/compare/track-link-layer.js', gm,
        [{ from: { track: M1, start: 1000, end: 1100 }, to: { track: M2, start: 5000, end: 5100 },
           label: '94%' }], { id: 'mid' });
    const cm = mkCtx();
    pm.draw(cm, gm);
    // The curve op records its control points and its end; where it STARTS is the moveTo
    // just before it, so that is what is read here.
    const startOf = (ops) => {
        const i = ops.findIndex((o) => o[0] === 'curve');
        for (let k = i - 1; k >= 0; k--) if (ops[k][0] === 'move') return ops[k];
        return null;
    };
    const cv = cm.ops.filter((o) => o[0] === 'curve')[0];
    const st = startOf(cm.ops);
    ok(st && st[2] === 120, 'the line leaves the middle of the first track, not its top: '
       + (st && st[2]) + ' with the track from 100 to 140');
    ok(cv && cv[6] === 330, 'and lands in the middle of the second: ' + (cv && cv[6]));
    ok(cm.ops.filter((o) => o[0] === 'move').some((m) => m[2] === 120),
       'the span at each end is drawn on the same midline');

    // An end may ask for another height, which is what a layer sitting in a lane needs.
    const pm2 = await load('baja/bio/compare/track-link-layer.js', gm,
        [{ from: { track: M1, start: 1000, end: 1100, y: 0.25 },
           to: { track: M2, start: 5000, end: 5100 } }], { id: 'mid2' });
    const cm2 = mkCtx();
    pm2.draw(cm2, gm);
    const st2 = startOf(cm2.ops);
    ok(st2 && st2[2] === 130, 'a lane given by the caller is used: ' + (st2 && st2[2]));

    // A grid with no Y of its own still gets a line, at the top as before, rather than a
    // NaN that silently drops the link.
    const plain = mkTrack('PLAIN', 500);
    const gp = mkGraph([M1, plain]);
    const pp = await load('baja/bio/compare/track-link-layer.js', gp,
        [{ from: { track: M1, start: 1000, end: 1100 }, to: { track: plain, start: 5000, end: 5100 } }],
        { id: 'plain' });
    const cp = mkCtx();
    pp.draw(cp, gp);
    const cv3 = cp.ops.filter((o) => o[0] === 'curve')[0];
    ok(cv3 && cv3[6] === 500, 'a grid without a Y of its own falls back to its top edge: '
       + (cv3 && cv3[6]));

    // A LINK TO A TRACK THAT HAS GONE is a line drawn to where it used to be.
    ok(painter.dead(g) === false, 'while both tracks are on the canvas it stays');
    ok(painter.dead({ track: [A] }) === true, 'and it is dropped once one of them is removed');

    // Registering again under the same id replaces it rather than stacking a second copy.
    await load('baja/bio/compare/track-link-layer.js', g, links, { id: 'sim' });
    ok(g.__linkPainters.length === 1, 'the same id replaces, so a second run is not two sets of lines');
    await load('baja/bio/compare/track-link-layer.js', g, [], { id: 'sim' });
    ok(g.__linkPainters.length === 0, 'and an empty set clears them');

    // The hook itself: painted after the tracks, and a painter that throws is dropped
    // rather than taking the frame with it.
    const gene = fs.readFileSync('flexigraph/gene.js', 'utf8');
    ok(/this\.__linkPainters && this\.__linkPainters\.length/.test(gene), 'the graph paints them');
    ok(/if \(lp\.dead && lp\.dead\(this\)\) continue;/.test(gene), 'drops the ones whose tracks have gone');
    ok(/catch \(e\) \{ \}\n\s+\}\n\s+this\.__linkPainters = __keep;/.test(gene),
       'and a painter that throws is dropped rather than taking the frame down');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
