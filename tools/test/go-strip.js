// PRESSING GO SAYS WHAT IT IS DOING, WITH NOTHING THAT HAS TO LOAD FIRST.
//
//     node tools/test/go-strip.js          (needs jsdom: npm i --no-save jsdom)
//
// Reported three times as showing no feedback at all, and each earlier fix depended on
// something else working before it could appear: a module fetched through exec, a panel
// singleton another operation might already hold, a timer racing the work. Any one of
// those failing leaves a closed card and a silent canvas -- indistinguishable from the
// operation never having started.
//
// So what the card puts on screen is built in place out of document.createElement. This
// drives the real card against a slow capability and watches for it, and the point of the
// check is as much what it does NOT need: no exec, no working.js, no stylesheet.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window; global.document = dom.window.document;
global.EngineMonitor = class { constructor(f) { this.f = f; } };
global.log = () => { };
window.env = { apiUrl: '' };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let planReply = null;
const loaded = [];
const load = async (p, ...a) => {
    if (/editor\/plan\.py$/.test(p)) return planReply;
    loaded.push(p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, []);
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

// One track, a selection, and a zoom that takes its time: the slow step under GO.
let release = null;
const mkGraph = () => {
    const track = {
        name: 'DNM3', snpindels: [], oligos: [],
        markstart: 10, markend: 120,
        tgraph: { X: (i) => i, yi: 0, height: 2 },
        annotations: Array.from({ length: 21 }, (_, k) => ({
            type: 'Exon', name: 'e' + (k + 1), xi: 100 + k * 200, xf: 213 + k * 200, annotations: k + 1 }))
    };
    return {
        track: [track], startX: null, endX: null, selectedCompounds: [],
        grid: { getxmin: () => 0, getxmax: () => 1000, getymin: () => -1, getymax: () => 5 },
        setMessage() { }, setResultMessage(m) { this.last = m; }, wake() { }, rescale() { },
        setSelectedCompounds(s) { this.selectedCompounds = s; }, deselectAllCompounds() { },
        pushOntoHistory() { }, async viewAllTracks() { }, hideMenu() { }, setError() { },
        zoomToSelection() { return new Promise((r) => { release = r; }); }
    };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < (n || 6); i++) await tick(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (id) => document.getElementById(id);
const strip = () => document.getElementById('ec-running');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
    planReply = { status: 'OK', explain: 'Frames the selection', unsupported: [], problems: [],
        steps: [{ capability: 'zoom_selection', args: {} }] };
    const graph = mkGraph();
    load('baja/manchester/menu/editor-command.js', graph, {});
    await settle(8);
    el('ec-q').value = 'zoom into the selection';
    el('ec-q').onkeydown({ key: 'Enter', preventDefault() { } });
    await settle(12);
    ok(!!el('ec-go'), 'the card offers GO: ' + (document.body.textContent || '').slice(0, 60));

    const before = loaded.length;
    el('ec-go').onclick();
    await sleep(60);
    ok(!strip(), 'the first moment shows nothing, so an instant step does not flash');

    await sleep(220);
    const s = strip();
    ok(!!s, 'a step still going after a moment says so on screen');
    ok(s && /frame whatever is currently selected/.test(s.textContent) && !/^Working/.test(s.textContent),
       'naming the step rather than just "working": ' + (s ? JSON.stringify(s.textContent) : '(none)'));
    ok(s && /\d+s/.test(s.textContent),
       'with the seconds counting up, which a frozen page cannot fake: ' + (s ? s.textContent : ''));
    ok(s && s.querySelector('span[style*="animation"]'), 'and something turning next to it');
    ok(loaded.length === before,
       'and NOTHING WAS LOADED TO SHOW IT: ' + loaded.slice(before).join(', '));
    ok(!!document.getElementById('ec-running-kf'),
       'the one thing it adds is its own keyframe, so there is no stylesheet to fetch');

    // Out of the way of an operation that says something more specific than this can.
    window.__bajaWorking = { step() { } };
    await sleep(300);
    ok(strip() && strip().style.display === 'none',
       'an operation with its own panel is not given two things at once');
    delete window.__bajaWorking;
    await sleep(300);
    ok(strip() && strip().style.display === 'flex', 'and this comes back when that one goes');

    release(undefined);
    await settle(10);
    ok(!strip(), 'it goes when the step settles');

    // A step that throws takes it down too: the reason belongs on the card, not under a
    // strip that stays up over it.
    {
        const g2 = mkGraph();
        g2.zoomToSelection = () => Promise.reject(new Error('nothing is selected'));
        document.body.innerHTML = '';
        load('baja/manchester/menu/editor-command.js', g2, {});
        await settle(8);
        el('ec-q').value = 'zoom into the selection';
        el('ec-q').onkeydown({ key: 'Enter', preventDefault() { } });
        await settle(12);
        if (el('ec-go')) { el('ec-go').onclick(); await sleep(400); }
        ok(!strip(), 'a failed step leaves nothing hanging over the card');
    }

    // THE PER-TRACK GO IS THE SAME RUN. It was the one path that closed the card and then
    // went quiet, because it did not go through the wrapper at all.
    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/await withSpinner\(p0, \(\) => p0\.capability\.run\(o\.args\)\)/.test(cmd),
       'the choice buttons run through the same wrapper');
    ok(!/try \{ await p0\.capability\.run\(o\.args\); done\(1\); \}/.test(cmd),
       'with the unwrapped version gone');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
