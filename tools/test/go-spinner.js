// EVERY OPERATION THAT TAKES TIME SAYS SO, WITHOUT BEING ASKED TO.
//
//     node tools/test/go-spinner.js
//
// The panel was opt-in: an operation had to raise it itself, so most did not, and pressing
// GO on anything slow gave a closed card and a silent canvas. Which operations are slow is
// not knowable in advance either -- the same comparison is instant on two short tracks and
// a minute on two genomic ones -- so the clock decides, at the one place they all run
// through.
//
// The wrapper lives inside the card's own closure and cannot be reached from outside, so
// its WIRING is checked against the source and its BEHAVIOUR is checked by running the
// same shape of code against the real panel.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const src = fs.readFileSync(p, 'utf8');
    let f;
    try { f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(load, {}); }
    catch (e) { return await new AF('exec', 'args', core + '\n' + src)(load, {}); }
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), createIonFunction: (f) => f, getIonFunction: (r) => r };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');

    // ---- the wiring ---------------------------------------------------------------------
    ok(/const withSpinner = async \(p0, run\) =>/.test(cmd),
       'the card has one wrapper for running a step');
    ok(/await withSpinner\(now && now\.ok \? now : x\.p,/.test(cmd),
       'and EVERY step goes through it, whether it was re-previewed or not');
    ok(!/try \{ await \(now && now\.ok \? now\.capability\.run/.test(cmd),
       'with no path left that runs a step around it');
    ok(/if \(window\.__bajaWorking\) return;/.test(cmd),
       'an operation that raised its own panel keeps it: working.js is a singleton');
    ok(/w\.fail\('' \+ \(e && e\.message \? e\.message : e\)\)/.test(cmd),
       'a failure leaves the reason on the panel rather than vanishing');
    ok(/const SPIN_AFTER = 350;/.test(cmd),
       'and an instant step shows nothing: the panel waits a moment first');
    ok(/title\.length > 90/.test(cmd),
       'the title is the card\'s own description of the step, trimmed to fit');

    // ---- the panel it raises ------------------------------------------------------------
    // Same sequence the wrapper performs, against the real working.js.
    let settled = false, w = null;
    const slow = new Promise((r) => setTimeout(r, 420).unref && setTimeout(r, 420));
    const timer = setTimeout(async () => {
        if (window.__bajaWorking) return;
        w = await load('baja/lib/working.js', 'compare the sequences of DNM1 and DNM3', 'compare_sequences');
        if (settled) { w.done(); w = null; }
    }, 350);
    await sleep(500);
    const panel = document.getElementById('baja-working');
    ok(!!panel, 'a step still going after a moment gets the panel');
    ok(panel && /compare the sequences of DNM1 and DNM3/.test(panel.textContent),
       'titled with what is running, not just "Working": ' + (panel ? panel.textContent.slice(0, 50) : ''));
    ok(panel && /second/.test(panel.textContent), 'with the clock that says how long you have waited');
    ok(panel && panel.querySelector('animateTransform'), 'and a spinner that is turning');
    settled = true; clearTimeout(timer);
    if (w) w.done();
    await sleep(10);
    ok(!document.getElementById('baja-working'), 'and it goes when the work does');

    // The singleton guard, which is what keeps an operation's own detail on screen.
    const mine = await load('baja/lib/working.js', 'Exons of DNM1 against DNM3', 'One search per exon.');
    mine.step('Searching exon 3 of 22');
    let second = null;
    if (!window.__bajaWorking) second = await load('baja/lib/working.js', 'Working', '');
    ok(second === null, 'a second panel is not raised over the first');
    ok(/Searching exon 3 of 22/.test(document.getElementById('baja-working').textContent),
       'so the operation\'s own progress is what stays on screen');
    mine.done();
    await sleep(10);
    ok(!document.getElementById('baja-working'), 'and its own done() takes it away');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
