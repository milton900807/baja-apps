// A LAYER DELETED ON A CHILD TRACK STAYS DELETED.
//
//     node tools/test/child-layer-delete.js
//
// "the function was correct but the track layer was not removed from the track." An mRNA
// track made from a gene track mirrors that parent's layers, and syncChildTracks() runs on
// every redraw tick: it pushes back any parent layer not present on the child. So a delete
// spliced the array, the next tick put the layer straight back, and both the layer menu and
// the remove operation looked like they did nothing at all.
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
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
const stash = {};
global.lion_engine = {
    exec: (p, ...a) => load(p, ...a),
    setStashed: (n, c) => { stash[n] = c; }, getStashed: (n) => stash[n] || null,
    createIonFunction: (f) => f
};

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// The parent's RNA-seq trace, as a bigwig loads it: polygon points, no data_type.
const parentLayer = () => {
    const l = { name: 'GRCh38illuminabrain1', polygonpts: [], intervals: [] };
    for (let i = 0; i < 40; i++) l.polygonpts.push({ x: i * 10, y: -(i % 7) / 7 });
    return l;
};

(async () => {
    const mod = await load('baja/bio/track.js');
    const Track = mod && mod.Track;
    ok(typeof Track === 'function', 'the track class loads');

    // A child mRNA track with its parent behind it, the way make-mrna.js leaves one.
    const mk = () => {
        const parent = { name: 'MAPK8IP3', track_layers: [parentLayer()], oligos: [], snpindels: [], plots: [] };
        const child = Object.create(Track.prototype);
        child.name = 'MAPK8IP3_mRNA';
        child.track_layers = [];
        child.oligos = []; child.snpindels = []; child.plots = [];
        child.trackRef = { track: parent };
        // The exon map the mirror remaps points through: here the whole range, 1:1.
        child.sequence = 'A'.repeat(400);
        child.posMap = null;
        return { parent: parent, child: child };
    };

    // The real syncFromParent needs the editor's coordinate machinery, so the part under
    // test is exercised directly: the push loop's decision to mirror a parent layer or not.
    const wouldMirror = (child, parentLayerObj) => {
        const h = child._syncHash(parentLayerObj, 'layer');
        const present = new Set((child.track_layers || []).map((o) => o && o.__syncHash).filter(Boolean));
        if (present.has(h)) return false;
        if (child.__syncRemoved && child.__syncRemoved.indexOf(h) >= 0) return false;
        return true;
    };

    let { parent, child } = mk();
    const pl = parent.track_layers[0];
    const h = child._syncHash(pl, 'layer');

    ok(wouldMirror(child, pl), 'a parent layer the child does not have is mirrored onto it');

    // The mirror, as syncFromParent makes it: the PARENT's hash, its own remapped points.
    const mirror = { name: pl.name, __mirror: true, __syncHash: h,
        polygonpts: pl.polygonpts.slice(0, 30), intervals: [] };
    child.track_layers.push(mirror);
    ok(!wouldMirror(child, pl), 'and not mirrored twice while it is there');

    // Delete it the way the layer menu does, WITHOUT telling the track: the old behaviour.
    child.track_layers = [];
    ok(wouldMirror(child, pl),
       'a plain splice is undone by the next redraw tick, which is what "nothing happens '
       + 'when I click delete" was');

    // Now the way it is done after being told.
    ({ parent, child } = mk());
    child.track_layers.push({ name: pl.name, __mirror: true, __syncHash: h, polygonpts: [], intervals: [] });
    child.noteLayerRemoved(child.track_layers[0]);
    child.track_layers = [];
    ok(!wouldMirror(child, pl), 'told it was the user, the layer stays gone');
    ok((child.__syncRemoved || []).length === 1, 'one tombstone, not one per redraw');
    child.noteLayerRemoved({ __syncHash: h });
    ok((child.__syncRemoved || []).length === 1, 'and removing it again does not add another');

    // UNTIL THE PARENT'S LAYER CHANGES. Loading it again gives a different hash, which is
    // new data: it comes back, which is what someone who re-loads it expects.
    const reloaded = parentLayer();
    reloaded.polygonpts.push({ x: 999, y: -0.5 });
    ok(wouldMirror(child, reloaded),
       'but a reloaded or edited parent layer is new data and does come back');

    // The hash has to see the things that make a layer a different layer.
    ok(child._syncHash({ name: 'a', data_type: 'RNASeq' }, 'layer')
        !== child._syncHash({ name: 'b', data_type: 'RNASeq' }, 'layer'), 'the hash covers the name');
    ok(child._syncHash({ name: 'a', polygonpts: [1] }, 'layer')
        !== child._syncHash({ name: 'a', polygonpts: [1, 2] }, 'layer'), 'and how many points it holds');

    // ---- the two removers both tell the track ------------------------------------------
    const popup = fs.readFileSync('baja/manchester/menu/track-layer-popup.js', 'utf8');
    ok(/noteLayerRemoved/.test(popup), 'the layer menu tells the track');
    const rm = fs.readFileSync('baja/bio/remove-layers.js', 'utf8');
    ok(/noteLayerRemoved/.test(rm), 'and so does the remove operation');

    // End to end through the remove operation, on a track that has the method.
    const t = Object.create(Track.prototype);
    t.name = 'MAPK8IP3_mRNA';
    const m2 = { name: 'GRCh38illuminabrain1', __mirror: true, __syncHash: h,
        polygonpts: parentLayer().polygonpts, intervals: [] };
    t.track_layers = [m2];
    const g = {
        track: [t], said: [], wake() { }, getTracks: () => [t],
        setMessage(m) { this.said.push('' + m); },
        showMenu(items) {
            const row = items.find((i) => /^Remove GRCh38illuminabrain1/.test('' + (i.label || '')));
            if (row && row.click) row.click();
        }
    };
    lion_engine.setStashed('graph', g);
    await load('baja/bio/remove-layers.js', g, [t], { match: 'rnaseq' });
    ok(t.track_layers.length === 0, 'the operation takes it off: ' + t.track_layers.length + ' left');
    ok((t.__syncRemoved || []).indexOf(h) >= 0,
       'and records it, so the next redraw does not put it back: '
       + JSON.stringify(t.__syncRemoved || []));

    // ---- and through the REAL syncFromParent --------------------------------------------
    // The decision logic above is the part that was wrong, but the thing that actually puts
    // layers back is this method, running on every redraw tick. It is driven here.
    const exon = (xi, xf) => ({ type: 'exon', xi: xi, xf: xf });
    const mkReal = () => {
        const par = Object.create(Track.prototype);
        Object.assign(par, { name: 'MAPK8IP3', track_layers: [parentLayer()], oligos: [], snpindels: [],
            plots: [], structures: [], annotations: [exon(0, 399)], sequence: 'A'.repeat(400) });
        const ch = Object.create(Track.prototype);
        Object.assign(ch, { name: 'MAPK8IP3_mRNA', track_layers: [], oligos: [], snpindels: [],
            plots: [], structures: [], annotations: [exon(0, 399)], sequence: 'A'.repeat(400) });
        ch.trackRef = { track: par };
        return { par: par, ch: ch };
    };
    const real = mkReal();
    real.ch.syncFromParent();
    const mirrored = (real.ch.track_layers || []).length;
    ok(mirrored === 1, 'the real sync mirrors the parent trace onto the child: ' + mirrored);
    real.ch.syncFromParent();
    ok((real.ch.track_layers || []).length === 1, 'and does not stack a second copy');

    // Delete it the old way: spliced only. The next tick brings it back, which is the bug.
    real.ch.track_layers = [];
    real.ch.syncFromParent();
    ok((real.ch.track_layers || []).length === 1,
       'a splice alone IS undone by the next tick: ' + (real.ch.track_layers || []).length);

    // Delete it properly.
    real.ch.noteLayerRemoved(real.ch.track_layers[0]);
    real.ch.track_layers = [];
    real.ch.syncFromParent();
    real.ch.syncFromParent();
    ok((real.ch.track_layers || []).length === 0,
       'told it was the user, it stays gone through repeated ticks: '
       + (real.ch.track_layers || []).map((l) => l.name).join(', '));

    // Loading it again on the parent is new data and does come back.
    real.par.track_layers[0].polygonpts.push({ x: 7777, y: -0.9 });
    real.ch.syncFromParent();
    ok((real.ch.track_layers || []).length === 1,
       'while a reloaded parent layer returns, since that is new data');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
