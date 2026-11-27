// THE PLAIN THINGS YOU DO TO A LAYER, and the prompts that reach them.
//
//     node tools/test/layer-ops.js
//
// Hiding, greying and removing are three different things and the difference matters to
// the person doing it: a hidden layer comes back for nothing, a removed one has to be
// computed again. So each action is driven here, and the refusals with it, because the
// failure that costs the most in this file is the silent one: a name that matched nothing,
// a screen that did not change, and nothing saying why.
const fs = require('fs');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

global.window = { env: { apiUrl: '' } };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const said = [];
const mkLayer = (n, extra) => Object.assign({ name: n, visible: true, color: '#888', intervals: [] }, extra || {});
const mkGraph = () => {
    const t1 = { name: 'DNM1_3utr', track_layers: [mkLayer('DNM1_3utr_RBP_FUS'), mkLayer('DNM1_3utr_RBP_PUM1'), mkLayer('DNM1_3utr_SIM70_1')] };
    const t2 = { name: 'DNM3_3utr', track_layers: [mkLayer('DNM3_3utr_RBP_U2AF1'), mkLayer('DNM3_3utr_sites')] };
    return { track: [t1, t2], wake: () => { }, setResultMessage: (m) => said.push(m) };
};
const run = (g, o) => load('baja/bio/layers/layer-ops.js', g, o);
const last = () => said[said.length - 1] || '';

(async () => {
    // ---- LIST: the handle every other command needs ---------------------------------
    let g = mkGraph();
    let r = await run(g, { action: 'list' });
    ok(r.ok && r.tracks.length === 2, 'list reports every track: ' + r.tracks.length);
    ok(r.tracks[0].layers[0].name === 'DNM1_3utr_SIM70_1',
       'front layer first, as the rows under the track read: ' + r.tracks[0].layers[0].name);
    ok(/DNM1_3utr \(3\)/.test(last()) && /DNM3_3utr \(2\)/.test(last()),
       'and says it out loud: ' + last());

    // ---- HIDE AND SHOW ----------------------------------------------------------------
    g = mkGraph();
    r = await run(g, { action: 'hide', match: 'RBP' });
    ok(r.ok && r.matched === 3, 'a partial name hides every layer that matches: ' + r.matched);
    ok(g.track[0].track_layers[0].visible === false && g.track[1].track_layers[0].visible === false,
       'across tracks');
    ok(g.track[0].track_layers[2].visible === true, 'and leaves the others alone');
    ok(/still on the track/.test(last()),
       'saying that hiding is not removing: ' + last());
    r = await run(g, { action: 'show', match: 'RBP' });
    ok(g.track[0].track_layers[0].visible === true, 'and show puts them back');

    // Scoped to one track when a track is named, which is the common case on a busy canvas.
    g = mkGraph();
    r = await run(g, { action: 'hide_all', track: 'DNM3' });
    ok(r.matched === 2 && g.track[0].track_layers.every((l) => l.visible !== false),
       'hide_all on one track leaves the other track alone: ' + r.matched);

    // ---- THE REFUSALS -----------------------------------------------------------------
    // A name that hits nothing is the failure that costs the most: it looks like a broken
    // command. It is reported with what IS there, so the next attempt can succeed.
    g = mkGraph();
    r = await run(g, { action: 'hide', match: 'nothing_like_this' });
    ok(!r.ok && r.why === 'no match', 'a name that matches nothing is refused');
    ok(/No layer here is called nothing_like_this/.test(last()) && /DNM1_3utr_RBP_FUS/.test(last()),
       'and the names that are there are listed: ' + last());
    r = await run(g, { action: 'hide', track: 'NOSUCH', match: 'RBP' });
    ok(!r.ok && r.why === 'no such track', 'a track name that matches nothing is not silently all tracks');
    r = await run(g, { action: 'hide' });
    ok(!r.ok && r.why === 'no match given', 'hide with no layer named is refused rather than hiding everything');
    ok(/hide_all or show_all/.test(last()), 'and says how to mean every layer: ' + last());
    r = await run(g, { action: 'frobnicate', match: 'RBP' });
    ok(!r.ok && r.why === 'no such action', 'an action that does not exist says so');
    ok(/list, hide, show/.test(last()), 'and lists the ones that do');
    r = await run({ track: [], setResultMessage: (m) => said.push(m) }, { action: 'list' });
    ok(!r.ok && r.why === 'no tracks', 'and an empty canvas is answered, not crashed');

    // ---- COLOUR -----------------------------------------------------------------------
    g = mkGraph();
    g.track[0].track_layers[0].intervals = [{ c: '#111' }, { c: '#222' }];
    r = await run(g, { action: 'color', match: 'FUS', color: '#ffb4a2' });
    ok(r.ok && g.track[0].track_layers[0].color === '#ffb4a2', 'a layer takes the colour');
    ok(g.track[0].track_layers[0].intervals.every((iv) => iv.c === '#ffb4a2'),
       'and so do its intervals, since some painters never read the layer colour');
    r = await run(g, { action: 'color', match: 'FUS' });
    ok(!r.ok && r.why === 'no colour', 'a colour command with no colour is refused');

    // ---- RENAME -----------------------------------------------------------------------
    g = mkGraph();
    r = await run(g, { action: 'rename', match: 'SIM70', name: 'shared with DNM3' });
    ok(r.ok && g.track[0].track_layers[2].name === 'shared with DNM3', 'one layer is renamed');
    r = await run(g, { action: 'rename', match: 'RBP', name: 'everything' });
    ok(!r.ok && r.why === 'ambiguous',
       'renaming several to one name is refused: every later match would be ambiguous');
    ok(/matches 3 layers/.test(last()), 'and says which ones it hit: ' + last());

    // ---- DRAW ORDER -------------------------------------------------------------------
    // track_layers is drawn in array order, so the LAST is in front.
    g = mkGraph();
    r = await run(g, { action: 'front', match: 'FUS', track: 'DNM1' });
    const names = () => g.track[0].track_layers.map((l) => l.name);
    ok(names()[2] === 'DNM1_3utr_RBP_FUS', 'front puts it last in the array: ' + names().join(', '));
    r = await run(g, { action: 'back', match: 'FUS', track: 'DNM1' });
    ok(names()[0] === 'DNM1_3utr_RBP_FUS', 'back puts it first: ' + names().join(', '));
    r = await run(g, { action: 'forward', match: 'FUS', track: 'DNM1' });
    ok(names()[1] === 'DNM1_3utr_RBP_FUS', 'forward moves it one place: ' + names().join(', '));
    ok(g.track[0].track_layers.length === 3, 'and nothing is lost on the way');

    // ---- REMOVE -----------------------------------------------------------------------
    g = mkGraph();
    r = await run(g, { action: 'remove', match: 'SIM70' });
    ok(r.ok && g.track[0].track_layers.length === 2
       && !names().some((n) => /SIM70/.test(n)), 'remove takes it off the track');
    ok(/would have to be computed again/.test(last()),
       'and says what that costs, since it is not hiding: ' + last());

    // ---- THE PROMPTS REACH THEM -------------------------------------------------------
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    for (const n of ['layer_visibility', 'color_layer', 'rename_layer', 'layer_draw_order',
        'list_layers', 'compare_selection_across_track', 'remove_track_links']) {
        ok(new RegExp("name: '" + n + "'").test(caps), 'a prompt can ask for ' + n);
    }
    ok(/layer-ops\.js/.test(caps), 'and they run the same code the menu does');
    // The three that get confused for each other each say what they are not, because the
    // model picking between them has only these summaries to go on.
    const vis = caps.slice(caps.indexOf("name: 'layer_visibility'"), caps.indexOf("name: 'color_layer'"));
    ok(/THIS IS NOT GREYING/.test(vis) && /NOT REMOVING/.test(vis),
       'hide says it is neither greying nor removing');
    const cmp = caps.slice(caps.indexOf("name: 'compare_selection_across_track'"));
    ok(/UNGAPPED/.test(cmp) && /it compares what is selected, not a named region/.test(cmp),
       'and the comparison says what it needs and what it cannot see');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
