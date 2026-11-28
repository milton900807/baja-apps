// EACH STEP OF A PLAN IS ITS OWN DECISION.
//
//     node tools/test/plan-step-selection.js      (needs jsdom: npm i --no-save jsdom)
//
// A plan used to be all of it or none of it. That is the wrong shape for a reading of a
// sentence: the second step is often right while the first is not, or the selection is
// wanted without the view jumping. This drives the real module in a real DOM against a
// stubbed planner and checks that the ticks, the button and what actually runs agree.
//
// The case that matters most is the last one: a FIRST step that cannot run is shown unticked
// and not tickable, while a LATER step stays tickable even when it says what it expects,
// because the step before it is usually what provides that.
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
let stall = null;                       // when set, the planner hangs until it is resolved
const load = async (p, ...a) => {
    if (/editor\/plan\.py$/.test(p)) { if (stall) await stall; return planReply; }
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, []);
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

// one track, a selection present or not depending on the case
const mkGraph = (withSelection) => {
    const track = {
        name: 'DNM3', snpindels: [], oligos: [],
        markstart: withSelection ? 10 : null, markend: withSelection ? 120 : null,
        tgraph: { X: (i) => i, yi: 0, height: 2 },
        // 21 exons, so "exon 14" is a real one and step 1 is runnable
        annotations: Array.from({ length: 21 }, (_, k) => ({
            type: 'Exon', name: 'e' + (k + 1), xi: 100 + k * 200, xf: 213 + k * 200, annotations: k + 1 }))
    };
    return {
        track: [track], startX: null, endX: null, selectedCompounds: [],
        grid: { getxmin: () => 0, getxmax: () => 1000, getymin: () => -1, getymax: () => 5 },
        setMessage() { }, setResultMessage(m) { this.last = m; }, wake() { }, rescale() { },
        setSelectedCompounds(s) { this.selectedCompounds = s; }, deselectAllCompounds() { },
        pushOntoHistory() { }, async zoomToSelection() { this.zoomed = (this.zoomed || 0) + 1; },
        async viewAllTracks() { }, hideMenu() { }, setError() { }
    };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n) => { for (let i = 0; i < (n || 6); i++) await tick(); };
const el = (id) => document.getElementById(id);
// Enter IS the send: there is no Go button, so the test uses the same path a person does.
const send = () => el('ec-q').onkeydown({ key: 'Enter', preventDefault() { } });
const goText = () => (el('ec-go') || {}).textContent;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
    // TWO STEPS, the first runnable: both ticked, button counts them
    planReply = { status: 'OK', explain: 'Selects exon 14 and zooms the view to frame it',
        unsupported: [], problems: [],
        steps: [{ capability: 'select_sequence_region', args: { region: 'exon', index: 14 } },
                { capability: 'zoom_selection', args: {} }] };
    let graph = mkGraph(true);
    load('baja/manchester/menu/editor-command.js', graph, {});
    await settle();
    el('ec-q').value = 'zoom into exon 14';
    send();
    await settle(10);

    ok(!el('ec-run') && !el('ec-what'), 'no Go and no What-can-it-do button: Enter sends it');
    ok((document.body.textContent || '').indexOf('put the known ASO and siRNA layer on') < 0,
       'and the block of examples is gone from under the field');
    ok(!!el('ec-busy'), 'the row that is left is the one that shows it is working');
    ok(!!el('ec-s0') && !!el('ec-s1'), 'every step of a plan gets its own checkbox');
    ok(el('ec-s0').checked && el('ec-s1').checked, 'and both start ticked');
    ok(goText() === 'GO \u00b7 2 steps', 'the button counts what is ticked: ' + goText());

    el('ec-s1').checked = false; el('ec-s1').onchange();
    ok(goText() === 'GO', 'unticking one leaves a single-step button: ' + goText());

    el('ec-s0').checked = false; el('ec-s0').onchange();
    ok(goText() === 'Nothing selected' && el('ec-go').disabled,
       'unticking everything disables the button rather than running nothing');

    // ticking just the SECOND step runs only that one
    el('ec-s1').checked = true; el('ec-s1').onchange();
    ok(goText() === 'GO' && !el('ec-go').disabled, 'ticking one re-enables it');
    el('ec-go').onclick();
    await settle(10);
    ok(graph.zoomed === 1, 'ONLY THE TICKED STEP RAN: the zoom happened');
    ok(!graph.track[0].__selectedByStep1, 'and the step that was not ticked did not run');

    // A FIRST STEP THAT CANNOT RUN is shown unticked and not tickable
    planReply = { status: 'OK', explain: 'Frames the selection', unsupported: [], problems: [],
        steps: [{ capability: 'zoom_selection', args: {} },
                { capability: 'show_compound_locations', args: {} }] };
    graph = mkGraph(false);          // nothing selected, so step 1 is blocked
    load('baja/manchester/menu/editor-command.js', graph, {});
    await settle();
    el('ec-q').value = 'frame the selection then show the compounds';
    send();
    await settle(10);
    ok(el('ec-s0') && el('ec-s0').disabled, 'a first step that cannot run is not tickable');
    ok(el('ec-s0') && !el('ec-s0').checked, 'and is not ticked');
    ok(el('ec-s1') && el('ec-s1').checked && !el('ec-s1').disabled,
       'a later step stays tickable: the step before it is usually what provides what it needs');

    // WITH NO BUTTON, THE SPINNER IS THE ONLY SIGN THE REQUEST IS ALIVE.
    // TWO STEPS, so the card stays up to be looked at: a single step runs itself the
    // moment the plan lands, and a card that is gone has no field to be quiet and no
    // spinner to watch. The one-step path is tested in one-step-runs-itself.js.
    planReply = { status: 'OK', explain: 'x', unsupported: [], problems: [],
        steps: [{ capability: 'zoom_selection', args: {} },
            { capability: 'zoom_selection', args: {} }] };
    graph = mkGraph(true);
    let release = null;
    stall = new Promise((r) => { release = r; });
    load('baja/manchester/menu/editor-command.js', graph, {});
    await settle();
    el('ec-q').value = 'frame the selection';
    send();
    await settle(4);
    const busyHtml = () => (el('ec-busy') || {}).innerHTML || '';
    ok(busyHtml().indexOf('baja-ec-spin') >= 0, 'while it is working, the spinner is showing');
    ok((el('ec-busy').textContent || '').indexOf('Working') >= 0, 'with a word for it');
    ok(el('ec-q').disabled, 'and the field is quiet so a second Enter cannot start a second one');
    ok(!!graph.__ecInFlight, 'the in-flight flag is set where every copy of the module can see it');
    release(); stall = null;
    await settle(12);
    ok(busyHtml() === '', 'when the answer lands the spinner goes');
    ok(!el('ec-q').disabled, 'and the field takes typing again');
    ok(!graph.__ecInFlight, 'and the flag is cleared, so the box is not wedged shut');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();
