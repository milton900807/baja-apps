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

    // ---- grey EVERYTHING, with nothing in colour -------------------------------------------
    // A different request from focusing one layer, and the opposite of putting them back:
    // "grey out all layers on all tracks" was read as the restore and cleared the greying
    // instead of applying it, because the word "all" was listed as a way of saying none.
    g = mkGraph();
    r = await load('baja/bio/layers/focus-layer.js', g, null, { all: true });
    ok(r.all === true && r.muted === 4, 'every visible layer is greyed: ' + r.muted);
    ok(muted(g).join(',') === 'PSI,ACC,CDD_domains,PSI*', 'on every track: ' + muted(g).join(','));
    ok(!g.B.track_layers[1].muted, 'except the hidden one, which is not drawn anyway');
    ok(/none in colour/.test(g.said.join(' ')), 'and the message says nothing is in colour');
    ok(/still drawn and nothing has been removed/.test(g.said.join(' ')), 'but they are still drawn');

    // From there, focusing one of them is still one step, and restoring is still one step.
    await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[1]);
    ok(g.A.track_layers[1].muted === false && muted(g).length === 3, 'focusing after greying all works');
    await load('baja/bio/layers/focus-layer.js', g, null);
    ok(muted(g).length === 0, 'and everything comes back');

    // ---- the words that choose between them --------------------------------------------
    // This is where it went wrong, so it is tested where the choice is made: the
    // capability's own run(), lifted out and given stubs.
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    const at = caps.indexOf("name: 'focus_layer',");
    ok(at > 0, 'the capability is there');
    const runAt = caps.indexOf('run: async (a) => {', at);
    let depth = 0, end = -1;
    for (let k = caps.indexOf('{', runAt); k < caps.length; k++) {
        if (caps[k] === '{') depth++;
        else if (caps[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    const runSrc = caps.slice(runAt + 'run: '.length, end + 1);
    const callsOf = async (a) => {
        const seen = [];
        const exec = (path, g2, layer, opts) => { seen.push({ path: path, layer: layer, opts: opts || {} }); return Promise.resolve({ ok: true }); };
        const fn = new Function('exec', 'graph', 'result', 'tracks', 'matchTrack', 'LM',
            'return (' + runSrc + ');')(exec, {}, () => { }, () => [], () => null,
            { match: () => [], nameOf: (l) => '' + l });
        await fn(a);
        return seen;
    };
    let c = await callsOf({ action: 'grey_all' });
    ok(c.length === 1 && c[0].opts.all === true, 'action grey_all greys everything');
    c = await callsOf({ action: 'restore' });
    ok(c.length === 1 && !c[0].opts.all && c[0].layer === null, 'action restore puts them back');
    c = await callsOf({ match: 'all' });
    ok(c[0].opts.all === true, '"all" on its own means every layer greyed, not restored');
    c = await callsOf({ match: 'all layers' });
    ok(c[0].opts.all === true, 'and so does "all layers"');
    c = await callsOf({ match: 'none' });
    ok(!c[0].opts.all && c[0].layer === null, 'while "none" is the restore');
    c = await callsOf({});
    ok(!c[0].opts.all && c[0].layer === null, 'and nothing at all is the restore too');

    // ---- greying ONE TRACK's layers ---------------------------------------------------------
    // The layer menu belongs to a track, so "Grey out all layers" there is about its own
    // layers: greying a neighbouring track from it would answer a question nobody asked.
    g = mkGraph();
    r = await load('baja/bio/layers/focus-layer.js', g, null, { all: true, track: g.A });
    ok(r.muted === 3 && r.scope === 'track', 'only that track\u2019s layers are greyed: ' + r.muted);
    ok(muted(g).join(',') === 'PSI,ACC,CDD_domains', 'the other track keeps its colour: ' + muted(g).join(','));
    ok(/on DNM1/.test(g.said.join(' ')), 'and the message names the track');

    await load('baja/bio/layers/focus-layer.js', g, null, { all: true, track: g.B });
    ok(muted(g).length === 4, 'a second track can be greyed on top of the first: ' + muted(g).join(','));
    r = await load('baja/bio/layers/focus-layer.js', g, null, { track: g.A });
    ok(muted(g).join(',') === 'PSI*', 'and un-greying one leaves the other greyed: ' + muted(g).join(','));

    // ---- the layer menu offers it, for its own track ------------------------------------------
    const menuSrc = fs.readFileSync('baja/manchester/menu/track-layers-side-menu.js', 'utf8');
    ok(/Grey out all layers/.test(menuSrc), 'the track\u2019s layer menu offers greying');
    ok(/__greyed \? 'Back to colour'/.test(menuSrc), 'and the same row takes it back once it is greyed');
    ok(/\{ all: true, track: track \}/.test(menuSrc), 'for that track only');
    ok(menuSrc.indexOf('Grey out all layers') > menuSrc.indexOf("label: 'Hide all'"),
       'placed beside Hide all, which is what people pressed when they wanted this');

    // ---- A MENU THAT BELONGS TO A TRACK GREYS THAT TRACK ------------------------------
    // Focusing from the layer popup used to grey every track on the canvas, which from a
    // menu opened on one track's label row looks like the editor dimming itself.
    g = mkGraph();
    r = await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[0],
        { scope: 'track', track: g.A });
    ok(muted(g).join(',') === 'ACC,CDD_domains', 'only its own track is greyed: ' + muted(g).join(','));
    ok(g.B.track_layers[0].muted !== true, 'the neighbouring track keeps its colour');
    ok(g.A.track_layers[0].pop === true, 'and the focused layer is still raised');

    // A track greyed on purpose is not put back by a focus on another track.
    await load('baja/bio/layers/focus-layer.js', g, null, { all: true, track: g.B });
    await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[1], { scope: 'track', track: g.A });
    ok(g.B.track_layers[0].muted === true, 'the other track stays as it was left');
    ok(g.A.track_layers[1].muted === false && g.A.track_layers[0].muted === true,
       'while the focus moved within its own track');

    // The caller's track wins over searching for the layer, which matters where a child
    // track mirrors its parent's layers and the search would find the wrong home.
    const shared = mkLayer('mirrored');
    g = mkGraph();
    g.A.track_layers.push(shared);
    g.B.track_layers.push(shared);
    await load('baja/bio/layers/focus-layer.js', g, shared, { scope: 'track', track: g.B });
    ok(g.B.track_layers[0].muted === true && g.A.track_layers[0].muted !== true,
       'the track the menu named is the one greyed: ' + muted(g).join(','));

    // The popup passes both, so pressing it twice greys and un-greys one track.
    const popupSrc = fs.readFileSync('baja/manchester/menu/track-layer-popup.js', 'utf8');
    ok(/\{ scope: 'track', track: track \}/.test(popupSrc),
       'the layer popup greys the track it was opened on');

    // ---- and from the track menu itself --------------------------------------------------
    // Where somebody stands when a track has four layers drawn over each other: the layer
    // editor is a menu about editing layers one at a time, and this is about the track.
    const trackMenu = fs.readFileSync('baja/manchester/menu/mouse-over-highlight.js', 'utf8');
    ok(/Grey out all layers on this track/.test(trackMenu), 'the track menu offers it');
    ok(/'Layers back to colour'/.test(trackMenu), 'and the same row takes it back');
    ok(/\{ all: true, track: selectedTrack \}/.test(trackMenu), 'for the track the menu belongs to');
    ok(trackMenu.indexOf('Grey out all layers on this track') < trackMenu.indexOf("label: 'Delete layer"),
       'among the whole-track actions, above deleting a layer');

    // ---- the focused layer is raised off the track -------------------------------------------
    // Grey neighbours say WHICH layer to read; the shadow says it sits on top of the track
    // rather than in it, which is what makes a band findable on a crowded one.
    g = mkGraph();
    await load('baja/bio/layers/focus-layer.js', g, g.A.track_layers[0]);
    ok(g.A.track_layers[0].pop === true, 'the focused layer is raised');
    ok(g.A.track_layers[1].pop !== true, 'and the greyed ones are not');
    await load('baja/bio/layers/focus-layer.js', g, null);
    ok(g.A.track_layers[0].pop !== true, 'releasing puts it flat again, leaving no stray cue');

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
