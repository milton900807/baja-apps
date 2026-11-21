// SHOW ME EACH EXON, THREE SECONDS ON EACH.
//
//     node tools/test/region-tour.js
//
// Going to one region was an operation; going to all of them in turn was not, so the
// request came back as "nothing in the editor does that" while the editor could already
// frame any one of them and had nothing to do but repeat itself.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const path = fs.existsSync(p) ? p : p + '.js';
    const src = fs.readFileSync(path, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    if (typeof f === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(f))) return f;
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exon = (xi, xf) => ({ type: 'Exon', xi: xi, xf: xf });
const mkTrack = (name, n) => {
    const anns = [];
    for (let i = 0; i < n; i++) anns.push(exon(i * 500, i * 500 + 150));
    anns.push({ type: 'Translation', xi: 200, xf: n * 500 });
    return { name: name, xi: 0, xf: n * 500 + 200, sequence: 'A'.repeat(n * 500 + 200),
        annotations: anns, track_layers: [], markstart: -1, markend: -1,
        getSelectedRanges: () => [],
        tgraph: { X: (x) => x, Y: (y) => y, xi: 0, width: 4000, yi: 0, height: 1,
            getymin: () => 0, getymax: () => 1 } };
};

(async () => {
    // ---- the module itself: a tour you can drive --------------------------------------
    const seen = [], framed = [];
    const items = [1, 2, 3, 4].map((i) => ({ label: 'exon ' + i + ' of 4', start: i * 100, end: i * 100 + 50 }));
    const tour = load('baja/bio/region-tour.js', {}, {}, items, {
        seconds: 0.25,
        select: (it) => seen.push(it.label),
        frame: (it) => { framed.push(it.label); return Promise.resolve(); }
    });
    await sleep(60);
    const panel = document.querySelector('[data-region-tour]');
    ok(!!panel, 'a strip appears while it runs');
    ok(panel && /exon 1 of 4/.test(panel.textContent), 'naming the region on screen now: '
       + (panel ? panel.textContent.slice(0, 40) : ''));
    ok(panel && /1 of 4/.test(panel.textContent) && /50 nt/.test(panel.textContent),
       'with where you are in the tour and how big it is');
    // It is a strip, not a modal: it must not cover the canvas it is touring.
    ok(panel && /position:\s*fixed/.test(panel.getAttribute('style'))
       && !/inset:\s*0/.test(panel.getAttribute('style')),
       'and does not cover the view');

    // Forward skips the rest of the dwell rather than waiting it out.
    const t0 = Date.now();
    panel.querySelector('#rt-next').click();
    await sleep(60);
    ok(/exon 2 of 4/.test(panel.textContent), 'forward moves on at once: ' + panel.textContent.slice(0, 20));
    ok(Date.now() - t0 < 200, 'without sitting out the rest of the hold');
    panel.querySelector('#rt-prev').click();
    await sleep(60);
    ok(/exon 1 of 4/.test(panel.textContent), 'back goes back: ' + panel.textContent.slice(0, 20));

    // Stop ends it there, and says so rather than reporting a finished tour.
    panel.querySelector('#rt-stop').click();
    const res = await tour;
    ok(res.stopped === true, 'stop ends the tour: ' + JSON.stringify(res));
    ok(res.shown < res.total, 'part way through: ' + res.shown + ' of ' + res.total);
    ok(!document.querySelector('[data-region-tour]'), 'and the strip is taken down');
    ok(seen.length === framed.length && seen[0] === 'exon 1 of 4',
       'every region was selected and framed, in order: ' + seen.join(', '));

    // Escape stops it too -- the key everything else in the editor stops with.
    const t2 = load('baja/bio/region-tour.js', {}, {}, items, { seconds: 5, frame: () => Promise.resolve() });
    await sleep(60);
    window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    const r2 = await Promise.race([t2, sleep(900).then(() => 'hung')]);
    ok(r2 !== 'hung' && r2.stopped === true, 'Escape stops it: ' + JSON.stringify(r2));

    // Left to itself it reaches the end and finishes.
    const r3 = await load('baja/bio/region-tour.js', {}, {}, items.slice(0, 2), { seconds: 0.05, frame: () => Promise.resolve() });
    ok(r3.stopped === false && r3.shown === 2, 'left alone it runs to the end: ' + JSON.stringify(r3));
    ok(!document.querySelector('[data-region-tour]'), 'and takes its strip down then too');

    // ---- the operation ------------------------------------------------------------------
    const a = mkTrack('DNM3', 15), b = mkTrack('DNM3-208', 13);
    const graph = {
        track: [a, b], said: [], getTracks: () => [a, b],
        canvas: { width: 1200, height: 800 },
        grid: { getxmin: () => 0, getxmax: () => 100, getymin: () => -5, getymax: () => 5 },
        setMessage(m) { this.said.push('' + m); }, setResultMessage(m) { this.said.push('' + m); },
        clearSequenceSelections() { }, wake() { }, showSideMenu() { },
        zoomRect() { return Promise.resolve(); }, viewAllTracks() { return Promise.resolve(); }
    };
    const C = await load('baja/manchester/menu/editor-capabilities.js', graph, {});
    const cap = C.catalogue().find((c) => c.name === 'tour_regions');
    ok(!!cap, 'the editor has an operation for it');

    const pv = C.preview({ capability: 'tour_regions', args: { region: 'exons', seconds: '3', track: 'DNM3' } });
    ok(!pv.blocker, 'which is not refused: ' + (pv.blocker || '(none)'));
    ok(/all 15 exons/.test(pv.text) && /3 seconds/.test(pv.text),
       'and says what it will do and for how long: ' + pv.text);
    ok(/about \d+ s/.test(pv.text) && /stoppable/.test(pv.text),
       'including how long the whole thing takes, and that it can be stopped: ' + pv.text);

    // An unset optional param arrives as the PROSE of its default, which is not a number.
    const prose = C.preview({ capability: 'tour_regions',
        args: { track: 'DNM3', seconds: 'how long to hold each one, in seconds', region: 'what to step through: "exons" or "introns"' } });
    ok(/3 seconds/.test(prose.text) && /exons/.test(prose.text),
       'a default left as prose still reads as 3 seconds and exons: ' + prose.text);
    const introns = C.preview({ capability: 'tour_regions', args: { track: 'DNM3', region: 'introns', seconds: '1.5' } });
    ok(/14 introns/.test(introns.text) && /1\.5 seconds/.test(introns.text),
       'introns are counted as introns: ' + introns.text);

    // With two tracks open it asks which, like every other one-track operation.
    const multi = C.preview({ capability: 'tour_regions', args: {} });
    ok(!multi.blocker && multi.choices && multi.choices.length === 2,
       'two tracks open: one Go each, not a refusal: ' + (multi.blocker || (multi.choices || []).length));
    ok(multi.choices && /15 exons/.test(multi.choices[0].detail) && /13 exons/.test(multi.choices[1].detail),
       'each saying how many it would step through: ' + (multi.choices || []).map((o) => o.detail).join(' | '));

    // Running it really does walk the track: selection lands on the last exon.
    const quick = { capability: 'tour_regions', args: { track: 'DNM3', seconds: '0.05' } };
    await C.preview(quick).capability.run(quick.args);
    const last = a.annotations.filter((x) => x.type === 'Exon').slice(-1)[0];
    ok(a.markstart === last.xi && a.markend === last.xf,
       'it ends on the last exon, selected: ' + a.markstart + '-' + a.markend);
    ok(graph.said.some((m) => /Showed all 15 exons/.test(m)), 'and says what it showed: '
       + graph.said.slice(-1)[0]);

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
