// DELETING A LAYER FROM THE LAYER POPUP MENU.
//
//     node tools/test/layer-popup-delete.js
//
// "deleting the _domains layer is not working on the menu item": pressing Delete layer...
// on the popup under the track name left SPAG9_domains on the track. This drives the real
// popup in a real DOM, presses the row, answers the confirmation, and checks the layer is
// gone -- and that nothing redraws it back from a sibling array.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
window.env = { apiUrl: 'https://gene.clinic' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { f = await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return f(...a);
};
const stash = {};
global.lion_engine = {
    exec: (p, ...a) => load(p, ...a),
    setStashed: (n, c) => { stash[n] = c; },
    getStashed: (n) => stash[n] || null,
    createIonFunction: (f) => f          // the modal fallback's buttons are built with this
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// A graph the way the canvas hands it over: showMenu is what confirm.js uses, and the
// confirmation's own rows come back here so the test can press one.
let menu = null, woke = 0, history = 0;
const mkGraph = () => ({
    showMenu: (items) => { menu = items; },
    wake: () => { woke++; },
    pushOntoHistory: () => { history++; },
    canvas: { getCTX: () => ({ canvas: { width: 1200, height: 800, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }) } }) }
});

const press = (el, id) => {
    const b = el.querySelector('button[data-id="' + id + '"]');
    if (!b) return false;
    b.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    return true;
};
const confirmYes = () => {
    const row = (menu || []).find((i) => /^(delete|remove|clear)$/i.test('' + (i.label || '')));
    if (!row) return false;
    row.click();
    return true;
};

(async () => {
    const graph = mkGraph();
    lion_engine.setStashed('graph', graph);   // the editor stashes it under 'graph' (yakgen.js)

    const domains = { name: 'SPAG9_domains', data_type: 'CDD', intervals: [{ x0: 10, x1: 90 }] };
    const other = { name: 'SPAG9_exons', data_type: 'EXON', intervals: [] };
    const track = { name: 'SPAG9_mRNA', track_layers: [other, domains] };

    const pop = await load('baja/manchester/menu/track-layer-popup.js', track, domains, graph, {}, 100, 100);
    ok(!!(pop && pop.el), 'the popup opens on SPAG9_domains');

    ok(press(pop.el, 'delete'), 'the menu has a Delete layer row that can be pressed');
    await new Promise((r) => setTimeout(r, 0));
    ok(!!menu, 'pressing it asks for confirmation rather than deleting straight away');
    ok(confirmYes(), 'the confirmation offers a Delete action');
    await new Promise((r) => setTimeout(r, 0));

    const left = track.track_layers.map((l) => l.name).join(', ');
    ok(track.track_layers.indexOf(domains) < 0, 'SPAG9_domains is off the track (left: ' + left + ')');
    ok(track.track_layers.indexOf(other) >= 0, 'the other layer is untouched');
    ok(history > 0, 'the state was snapshotted for undo first');
    ok(woke > 0, 'the canvas was woken so the track redraws without it');

    // --- the layer was rebuilt while the confirmation was up -------------------------------
    // A save or a reload rehydrates every layer as a NEW TrackLayer, so the array no longer
    // holds the object this menu opened on. indexOf came back -1 and the delete did nothing.
    menu = null;
    const g2 = mkGraph();
    lion_engine.setStashed('graph', g2);
    const d2 = { name: 'SPAG9_domains', data_type: 'CDD' };
    const t2 = { name: 'SPAG9_mRNA', track_layers: [{ name: 'SPAG9_exons', data_type: 'EXON' }, d2] };
    const pop2 = await load('baja/manchester/menu/track-layer-popup.js', t2, d2, g2, {}, 100, 100);
    press(pop2.el, 'delete');
    await new Promise((r) => setTimeout(r, 0));
    // ... and now the track is rebuilt underneath it, exactly as gene.js does on load.
    t2.track_layers = t2.track_layers.map((l) => Object.assign({}, l));
    confirmYes();
    await new Promise((r) => setTimeout(r, 0));
    ok(!t2.track_layers.some((l) => l.name === 'SPAG9_domains'),
        'a layer rebuilt under the confirmation is still deleted (left: ' + t2.track_layers.map((l) => l.name).join(', ') + ')');
    ok(t2.track_layers.length === 1, 'and only that one went');

    // --- the domains layer takes its sites layer with it -----------------------------------
    menu = null;
    const g3 = mkGraph();
    lion_engine.setStashed('graph', g3);
    const d3 = { name: 'SPAG9_domains', data_type: 'CDD' };
    const s3 = { name: 'SPAG9_sites', data_type: 'CDD' };
    const keep = { name: 'SPAG9_motifs', data_type: 'SLIM' };
    const t3 = { name: 'SPAG9_mRNA', track_layers: [keep, d3, s3] };
    const pop3 = await load('baja/manchester/menu/track-layer-popup.js', t3, d3, g3, {}, 100, 100);
    press(pop3.el, 'delete');
    await new Promise((r) => setTimeout(r, 0));
    const asked = (menu || []).map((i) => '' + (i.label || '')).join(' ');
    ok(/SPAG9_domains/.test(asked) && /SPAG9_sites/.test(asked), 'the confirmation names both layers it will take');
    confirmYes();
    await new Promise((r) => setTimeout(r, 0));
    ok(t3.track_layers.length === 1 && t3.track_layers[0] === keep,
        'the domains layer takes its orphan sites layer with it (left: ' + t3.track_layers.map((l) => l.name).join(', ') + ')');

    // --- no graph stashed: confirm.js hands back a modal, which must be shown ---------------
    // Unshown, the question was never asked and the menu item did nothing at all.
    let shown = null;
    lion_engine.showModal = (m) => { shown = m; };
    lion_engine.setStashed('graph', null);
    const g4 = mkGraph(); delete g4.showMenu;
    const d4 = { name: 'SPAG9_domains', data_type: 'CDD' };
    const t4 = { name: 'SPAG9_mRNA', track_layers: [d4] };
    const pop4 = await load('baja/manchester/menu/track-layer-popup.js', t4, d4, g4, {}, 100, 100);
    press(pop4.el, 'delete');
    await new Promise((r) => setTimeout(r, 0));
    ok(!!shown, 'with no graph to draw on, the confirmation is still put in front of the user');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
