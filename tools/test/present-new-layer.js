// A LAYER THAT HAS JUST ARRIVED IS SHOWN.
//
//     node tools/test/present-new-layer.js
//
// Everything that puts a layer on a track goes through Track.addLayer, so a new layer can
// be pointed at from one place: the other layers go grey and the new one glows for a few
// seconds. The risk in doing it automatically is doing it at the wrong moment, so most of
// this is about when it must NOT happen: on the second layer of one action, on a file
// opening, on the child-track mirror that rebuilds its parent's layers every redraw, and
// over the top of the message the tool just wrote.
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mkLayer = (name, vis) => ({ name: name, visible: vis === undefined ? true : vis });
const mkGraph = () => {
    const A = { name: 'DNM1', track_layers: [mkLayer('PSI'), mkLayer('ACC')] };
    const B = { name: 'DNM3', track_layers: [mkLayer('CDD')] };
    const g = { track: [A, B], said: [], woke: 0, A: A, B: B,
        setResultMessage(m) { this.said.push(m); }, wake() { this.woke++; } };
    return g;
};
const muted = (g) => g.track.reduce((s, t) => s.concat(t.track_layers.filter((l) => l.muted).map((l) => l.name)), []);
const glowing = (g) => g.track.reduce((s, t) => s.concat(t.track_layers.filter((l) => l.glowUntil > Date.now()).map((l) => l.name)), []);

(async () => {
    // ---- one layer arrives ----------------------------------------------------------------
    let g = mkGraph();
    const fresh = mkLayer('ACC_candidates');
    g.A.track_layers.push(fresh);
    await load('baja/bio/layers/present-new-layer.js', g, g.A, fresh);
    ok(muted(g).length === 0, 'nothing happens immediately: the arrival is batched');
    await wait(220);
    ok(muted(g).join(',') === 'PSI,ACC,CDD', 'then every other layer goes grey: ' + muted(g).join(','));
    ok(!fresh.muted, 'and the new one does not');
    ok(glowing(g).join(',') === 'ACC_candidates', 'which is the one that glows: ' + glowing(g).join(','));
    ok(fresh.pop === true, 'and is raised off the track with a shadow');
    ok(g.woke > 0, 'the canvas is redrawn');

    // THE TOOL'S OWN MESSAGE SURVIVES. The sentence a model writes when it finishes is
    // often the only place its caveats are stated; replacing it with a note about greying
    // would be the worst possible trade.
    ok(g.said.length === 0, 'and nothing is said over the top of the tool: ' + g.said.join(' | '));

    // ---- two layers from one action are one arrival ---------------------------------------
    // The CDD loader adds domains and sites together, the ratio shift marks both tracks.
    // Presented one at a time, the second would grey out the first.
    g = mkGraph();
    const d1 = mkLayer('X_domains'), d2 = mkLayer('X_sites');
    g.A.track_layers.push(d1, d2);
    load('baja/bio/layers/present-new-layer.js', g, g.A, d1);
    await wait(20);
    await load('baja/bio/layers/present-new-layer.js', g, g.A, d2);
    await wait(220);
    ok(!d1.muted && !d2.muted, 'both layers of one action stay in colour');
    ok(glowing(g).sort().join(',') === 'X_domains,X_sites', 'and both glow: ' + glowing(g).join(','));
    ok(muted(g).join(',') === 'PSI,ACC,CDD', 'with the layers that were already there greyed');

    // ---- a file opening is not an arrival --------------------------------------------------
    g = mkGraph();
    const many = [];
    for (let i = 0; i < 9; i++) { const l = mkLayer('restored' + i); g.B.track_layers.push(l); many.push(l); }
    for (const l of many) load('baja/bio/layers/present-new-layer.js', g, g.B, l);
    await wait(220);
    ok(muted(g).length === 0, 'a batch past the limit greys nothing: ' + muted(g).join(','));
    ok(glowing(g).length === 0, 'and nothing glows, because nothing is being pointed at');
    ok(g.woke > 0, 'the canvas is still redrawn');

    // ---- the glow wears off, the greying does not ------------------------------------------
    g = mkGraph();
    const quick = mkLayer('quick');
    g.A.track_layers.push(quick);
    await load('baja/bio/layers/present-new-layer.js', g, g.A, quick, { glowMs: 150, windowMs: 10 });
    await wait(60);
    ok(glowing(g).length === 1, 'it glows at first');
    await wait(200);
    ok(glowing(g).length === 0, 'and stops on its own');
    ok(muted(g).length === 3, 'while the greying stays, because it is useful after the arrival: ' + muted(g).length);

    // ---- hidden layers are left alone --------------------------------------------------------
    g = mkGraph();
    g.B.track_layers.push(mkLayer('off', false));
    const n2 = mkLayer('new2');
    g.A.track_layers.push(n2);
    await load('baja/bio/layers/present-new-layer.js', g, g.A, n2, { windowMs: 10 });
    await wait(60);
    ok(muted(g).indexOf('off') < 0, 'a hidden layer is not greyed: ' + muted(g).join(','));

    // ---- the chokepoint and the two things that must not fire through it ---------------------
    // TWO TRACK CLASSES DRAW THE SAME THING: flexigraph/gene.js, which is the gene editor,
    // builds its tracks from baja/bio/track.js, and the plate apps use
    // baja/bio/track-flexi.js. A hook in one of them is a feature that works in half the
    // product and cannot be seen to be missing from the other half, so both are checked
    // here against the same rules.
    const flexi = fs.readFileSync('baja/bio/track-flexi.js', 'utf8');
    const plain = fs.readFileSync('baja/bio/track.js', 'utf8');
    for (const [who, src] of [['track-flexi.js', flexi], ['track.js', plain]]) {
        ok(/addLayer\(t, opts\) \{[\s\S]{0,500}present-new-layer\.js/.test(src),
           who + ': addLayer is where every layer arrives, and where this is called');
        ok(/addLayer\(ttl, \{ quiet: true \}\)/.test(src),
           who + ': the child-track mirror, which rebuilds its parent layers every redraw, is quiet');
        ok(/const __drawLayer = async \(l\)/.test(src), who + ': the layer draw goes through one wrapper');
        ok(/l\.muted/.test(src) && /grayscale\(1\) opacity\(0\.3\)/.test(src), who + ': which greys a muted layer');
        ok(/blur\(5px\) saturate\(1\.6\)/.test(src), who + ': haloes a glowing one');
        ok(/blur\(3px\) brightness\(0\) saturate\(0\)/.test(src), who + ': and shadows a raised one');
    }
    const genes = fs.readFileSync('flexigraph/gene.js', 'utf8');
    ok(!/\.addLayer\(/.test(genes.slice(genes.indexOf('Object.assign(new TrackLayer()'), genes.indexOf('Object.assign(new TrackLayer()') + 2000)),
       'and a document restore builds its layer array directly, so opening a file presents nothing');

    // ---- the glow is drawn as a halo of the layer itself --------------------------------------
    ok(/const __glowing = \(l\)/.test(flexi), 'the renderer knows what glowing means');
    ok(/ctx\.filter = 'blur\(5px\) saturate\(1\.6\)'/.test(flexi), 'and draws a blurred pass under the layer');
    ok(/Math\.sin\(phase \* 2 \* Math\.PI\)/.test(flexi), 'breathing rather than steady, so it reads as a pointer');
    ok(/setTimeout\(\(\) => \{ try \{ if \(graph && graph\.wake\)/.test(flexi),
       'with the canvas woken while it breathes, and only while it does');

    // A HEAVY LAYER DOES NOT GET A HALO. The glow is a second pass over the layer every
    // frame, and on a coverage track that is a stutter right after the thing it is showing
    // off; a layer with tens of thousands of points is findable without one.
    ok(/const __popping = \(l\)/.test(flexi), 'the renderer knows what raised means');
    ok(/ctx\.filter = 'blur\(3px\) brightness\(0\) saturate\(0\)'/.test(flexi),
       'and draws the shadow as a blackened blur of the layer\u2019s own shapes, not a box');
    ok(/ctx\.translate\(2, 3\)/.test(flexi), 'offset, so it reads as a shadow');
    ok(/const pop = !mute && __popping\(l\)/.test(flexi), 'a greyed layer is never raised');
    ok(/const __tooBigToGlow = \(l\)/.test(flexi), 'the renderer checks how heavy a layer is');
    ok(/if \(n > 4000\) return true;/.test(flexi), 'with a limit on how much it will redraw');
    ok(/__glowing\(l\) && !__tooBigToGlow\(l\)/.test(flexi), 'and skips the halo past it');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
