// A ONE-STEP PLAN RUNS ITSELF.
//
//     node tools/test/one-step-runs-itself.js          (needs jsdom)
//
// A card with a single GO on it asks a question that has one answer. The user typed the
// sentence; reading it back and waiting is a second press for nothing, and on "show me
// exon 20 on dnm1" it is a press standing between them and the thing they asked to look
// at. It must still ask where there is something to decide, and the line that matters is
// DESTRUCTIVE: a plan that deletes work is not started on somebody's behalf because it
// happened to be one line long.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: 'https://gene.clinic' };
global.EngineMonitor = function (f) { this.f = f; };
global.focusUnlessMobile = () => { };
global.requestAnimationFrame = (f) => setTimeout(f, 0);

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let PLAN = null;          // what the planner answers
let RAN = [];             // what actually ran
let CAPS = null;          // the stand-in catalogue

const load = async (p, ...a) => {
    if (/plan\.py$/.test(p)) return PLAN;
    if (/editor-capabilities\.js$/.test(p)) return CAPS;
    if (/prompt-log\.js$/.test(p)) return { add: () => 'id', ran: () => { }, open: async () => { } };
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

const graph = {
    setMessage: () => { }, setResultMessage: () => { }, wake: () => { }, track: [],
    canvas: document.createElement('canvas')
};

// One capability, whose preview says what the card would have shown.
const mkCaps = (over) => {
    const cap = Object.assign({
        name: 'go_to_position', summary: 's', run: async (args) => { RAN.push(args); }
    }, over && over.cap || {});
    const prev = Object.assign({
        ok: true, capability: cap, args: { position: 'exon 20', track: 'DNM1' },
        text: 'go to exon 20 of 22 on DNM1 and frame it', count: null,
        blocker: '', destructive: false, confirm: false, opens: false, answers: false,
        choices: null, choiceTitle: null, whenStuck: null, missingValues: null
    }, over && over.prev || {});
    // Every method the panel reaches for. A stand-in that is missing one fails inside the
    // panel's own setup, where the failure looks like the feature under test.
    return {
        catalogue: () => [], preview: () => prev, blocker: () => '',
        suggest: () => [], localPlan: () => null, clarify: () => null,
        selTracks: () => [], oneSelTrack: () => null, tracks: () => [],
        selCountOf: () => 0, regionInfo: () => null, selectVariants: () => [],
        crows: () => [], vrows: () => [],
        VS: {}, F: { isRed: () => false, scoreOf: () => 0, gcOf: () => 0, tmOf: () => 0, lenOf: () => 0 },
        list: [cap]
    };
};
const plan = (steps) => ({ status: 'OK', steps: JSON.stringify(steps), unsupported: '[]', problems: '[]' });
const STEP = { capability: 'go_to_position', args: { position: 'exon 20', track: 'DNM1' } };

// The panel's own promise resolves only when the panel finishes, and a panel waiting for
// a press never does. So it is started, not awaited, and the test looks at what happened
// a moment later: which is also exactly what the user sees.
const open = (opts) => {
    try { const old = document.getElementById('baja-editor-command'); if (old) old.remove(); } catch (e) { }
    load('baja/manchester/menu/editor-command.js', graph, {}, opts).catch(() => { });
    return new Promise((r) => setTimeout(r, 40));
};
const card = () => document.body.textContent;
const goButtons = () => Array.from(document.querySelectorAll('button')).filter((b) => /^GO/.test(b.textContent));

(async () => {
    // ---- ONE STEP, NOTHING TO DECIDE ---------------------------------------------------
    RAN = []; CAPS = mkCaps(); PLAN = plan([STEP]);
    await open({ prefill: 'show me exon 20 on dnm1' });
    ok(RAN.length === 1, 'the one operation runs without being pressed: ' + RAN.length);
    ok(RAN[0].position === 'exon 20' && RAN[0].track === 'DNM1',
       'with the arguments the sentence was read as: ' + JSON.stringify(RAN[0]));
    ok(goButtons().length === 0, 'and no card is left waiting for a press');

    // ---- WHERE THERE IS SOMETHING TO DECIDE, IT STILL ASKS -------------------------------
    // DESTRUCTIVE is the line. One line long is not a reason to delete somebody's work for
    // them.
    RAN = []; CAPS = mkCaps({ prev: { destructive: true } }); PLAN = plan([STEP]);
    await open({ prefill: 'remove the variants' });
    ok(RAN.length === 0, 'a destructive step is not run on its own');
    ok(goButtons().length === 1, 'it is offered: ' + goButtons().length + ' GO');
    goButtons()[0].onclick();
    await new Promise((r) => setTimeout(r, 30));
    ok(RAN.length === 1, 'and runs when pressed');

    // A capability that asks to be confirmed for its own reasons is confirmed.
    RAN = []; CAPS = mkCaps({ prev: { confirm: true } }); PLAN = plan([STEP]);
    await open({ prefill: 'the slow one' });
    ok(RAN.length === 0 && goButtons().length === 1,
       'a capability that sets confirm is shown before it runs');

    // A step the canvas blocks is a refusal, not a thing to start.
    RAN = []; CAPS = mkCaps({ prev: { blocker: 'nothing is selected' } }); PLAN = plan([STEP]);
    await open({ prefill: 'blocked' });
    ok(RAN.length === 0, 'a blocked step does not run itself');
    ok(/nothing is selected/.test(card()), 'and the reason is shown: ');

    // Two steps is a plan, and a plan is a list to correct.
    RAN = []; CAPS = mkCaps(); PLAN = plan([STEP, STEP]);
    await open({ prefill: 'two things' });
    ok(RAN.length === 0 && goButtons().length === 1, 'two steps are still offered as a plan');

    // Something in the sentence the editor could not do is worth seeing even when the part
    // it could do is a single step: running the half it understood hides the half it did not.
    RAN = []; CAPS = mkCaps();
    PLAN = Object.assign(plan([STEP]), { unsupported: JSON.stringify(['drawing on the canvas']) });
    await open({ prefill: 'do this and that' });
    ok(RAN.length === 0, 'a sentence with an unsupported half is not half-run quietly');
    ok(/drawing on the canvas/.test(card()), 'and says which half it could not do');

    // A step that fits several tracks asks which: that card comes first and is untouched.
    RAN = []; CAPS = mkCaps({ prev: { choices: [{ label: 'DNM1', args: {} }, { label: 'DNM3', args: {} }] } });
    PLAN = plan([STEP]);
    await open({ prefill: 'goto c.778' });
    ok(RAN.length === 0, 'a choice of track is still a question');
    ok(/DNM1/.test(card()) && /DNM3/.test(card()), 'with the tracks named');

    // ---- IT IS WRITTEN DOWN ----------------------------------------------------------------
    const src = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/ONE OPERATION, NOTHING TO DECIDE: JUST DO IT/.test(src), 'and why it does this is in the file');
    ok(/loggedRan\(1\);\s*\n\s*done\(1\);/.test(src),
       'what ran is kept in the log, so a surprise can be read back afterwards');
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/confirm: !!c\.confirm/.test(caps), 'the opt-out a capability can set is real, not decorative');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
