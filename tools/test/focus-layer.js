// ONE LAYER IN COLOUR, THE REST GREYED OUT.
//
//     node tools/test/focus-layer.js
//
// A track carrying a PSI layer, an acceptor layer and two domain layers is four pictures
// drawn over each other, and the only way to read one of them was to hide or delete the
// others. That throws away what made it worth reading: how it looks against the rest.
// Greying keeps them on the canvas, which is the point, so what matters here is that a
// greyed layer stays a drawn layer and that there is always a way back.
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

const mkLayer = (name, vis) => ({ name: name, visible: vis === undefined ? true : vis });
const mkGraph = () => {
    const said = [];
    const A = { name: 'DNM1', track_layers: [mkLayer('PSI'), mkLayer('ACC'), mkLayer('CDD_domains')] };
    const B = { name: 'DNM3', track_layers: [mkLayer('PSI*'), mkLayer('hidden', false)] };
    return { track: [A, B], said: said, A: A, B: B,
        setResultMessage: (m) => said.push(m), wake() { this.woke = (this.woke || 0) + 1; } };
};
const muted = (g) => g.track.reduce((s, t) => s.concat(t.track_layers.filter((l) => l.muted).map((l) => l.name)), []);

(async () => {
    // ---- focusing greys everything else, on every track ----------------------------------
    let g = mkGraph();
    let r = await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[0]);
    ok(r.focused === 'PSI', 'the layer asked for is the focused one');
    ok(muted(g).join(',') === 'ACC,CDD_domains,PSI*', 'every other VISIBLE layer is greyed, across tracks: ' + muted(g).join(','));
    ok(g.A.track_layers[0].muted === false, 'and the focused one is not');

    // A HIDDEN LAYER IS NOT GREYED. It is not drawn, so there is nothing to grey, and the
    // flag would be waiting for it when it was shown again.
    ok(!g.B.track_layers[1].muted, 'a hidden layer is left alone');

    // Nothing is removed and nothing is hidden: that is the whole difference from the two
    // things people used instead.
    ok(g.A.track_layers.length === 3 && g.B.track_layers.length === 2, 'no layer is removed');
    ok(g.A.track_layers.every((l) => l.visible !== false), 'and none is hidden');
    ok(/still there and nothing has been removed/.test(g.said.join(' ')), 'which the message says');
    ok(g.woke > 0, 'and the canvas is redrawn');

    // ---- the same layer again releases it -------------------------------------------------
    r = await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[0]);
    ok(muted(g).length === 0, 'focusing the focused layer puts the colour back');
    ok(r.focused === null, 'and reports nothing focused');
    ok(/no longer the only one in colour/.test(g.said.join(' ')), 'saying so');

    // ---- focusing a second layer moves the focus rather than adding to it -----------------
    g = mkGraph();
    await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[0]);
    await load('baja/bio/layers/focus-layer.js', g, g.B.track_layers[0]);
    ok(g.B.track_layers[0].muted === false && g.A.track_layers[0].muted === true,
       'the new one is in colour and the old one is greyed with the rest');
    ok(muted(g).length === 3, 'with one layer in colour, not two: ' + muted(g).join(','));

    // ---- scope ----------------------------------------------------------------------------
    g = mkGraph();
    await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[0], { scope: 'track' });
    ok(muted(g).join(',') === 'ACC,CDD_domains', 'track scope leaves other tracks in colour: ' + muted(g).join(','));

    // ---- there is always a way back --------------------------------------------------------
    r = await load('baja/bio/layers/focus-layer.js', g, null);
    ok(muted(g).length === 0 && r.cleared === 2, 'asking for nothing puts everything back: ' + r.cleared);
    r = await load('baja/bio/layers/focus-layer.js', g, null);
    ok(/No layers were greyed/.test(g.said[g.said.length - 1]), 'and says plainly when there was nothing to undo');

    // ---- a layer with nothing to grey --------------------------------------------------------
    const lone = { track: [{ name: 'X', track_layers: [mkLayer('only')] }], said: [],
        setResultMessage(m) { this.said.push(m); }, wake() { } };
    r = await load('baja/bio/layers/focus-layer.js', lone, lone.track[0].track_layers[0]);
    ok(r.muted === 0 && /nothing to grey/.test(lone.said.join(' ')), 'one layer alone is said to be alone');

    // ---- the renderer honours the flag ---------------------------------------------------
    // The flag is only worth setting if something reads it, and the read is one wrapper
    // around the layer's own draw in baja/bio/track-flexi.js: a filter rather than an
    // alpha, because every painter sets its own alpha and would overwrite it.
    const flexi = fs.readFileSync('baja/bio/track-flexi.js', 'utf8');
    ok(/const __drawLayer = async \(l\) => \{/.test(flexi), 'the draw goes through one wrapper');
    ok(/const mute = !!\(l && l\.muted\);/.test(flexi), 'which reads the flag this sets');
    ok(/ctx\.filter = 'grayscale\(1\) opacity\(0\.3\)'/.test(flexi), 'and greys with a filter, not an alpha');
    ok(/finally \{ try \{ ctx\.filter = had; \}/.test(flexi), 'putting the filter back whatever the painter does');
    ok(!/await l\.drawPlot\(plateTrack, this, ctx\)\n/.test(flexi.split('const __drawLayer')[0]),
       'and no layer draw bypasses it');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
