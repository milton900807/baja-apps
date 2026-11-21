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
    // The editor card's own strip is checked in tools/test/go-strip.js, which drives it.
    // What matters here is that EVERY path through the card goes through one wrapper.
    ok(/const withSpinner = async \(p0, run\) =>/.test(cmd),
       'the card has one wrapper for running a step');
    ok(/await withSpinner\(now && now\.ok \? now : x\.p,/.test(cmd),
       'and EVERY step goes through it, whether it was re-previewed or not');
    ok(!/try \{ await \(now && now\.ok \? now\.capability\.run/.test(cmd),
       'with no path left that runs a step around it');
    ok(/await withSpinner\(p0, \(\) => p0\.capability\.run\(o\.args\)\)/.test(cmd),
       'the per-track GO included, which used to run outside it');
    ok(/el\.style\.display = window\.__bajaWorking \? 'none' : 'flex'/.test(cmd),
       'an operation that raised its own panel keeps the screen to itself');
    ok(/const SPIN_AFTER = 150;/.test(cmd),
       'and an instant step shows nothing: it waits a moment first');
    ok(/title\.length > 110/.test(cmd),
       'the title is the card\'s own description of the step, trimmed to fit');

    // ---- the panel it raises ------------------------------------------------------------
    // Same sequence the wrapper performs, against the real working.js.
    let settled = false, w = null;
    const slow = new Promise((r) => setTimeout(r, 420).unref && setTimeout(r, 420));
    const timer = setTimeout(async () => {
        if (window.__bajaWorking) return;
        w = await load('baja/lib/working.js', 'compare the sequences of QUERY and TARGET', 'compare_sequences');
        if (settled) { w.done(); w = null; }
    }, 350);
    await sleep(500);
    const panel = document.getElementById('baja-working');
    ok(!!panel, 'a step still going after a moment gets the panel');
    ok(panel && /compare the sequences of QUERY and TARGET/.test(panel.textContent),
       'titled with what is running, not just "Working": ' + (panel ? panel.textContent.slice(0, 50) : ''));
    ok(panel && /second/.test(panel.textContent), 'with the clock that says how long you have waited');
    ok(panel && panel.querySelector('animateTransform'), 'and a spinner that is turning');
    settled = true; clearTimeout(timer);
    if (w) w.done();
    await sleep(10);
    ok(!document.getElementById('baja-working'), 'and it goes when the work does');

    // The singleton guard, which is what keeps an operation's own detail on screen.
    const mine = await load('baja/lib/working.js', 'Exons of QUERY against TARGET', 'One search per exon.');
    mine.step('Searching exon 3 of 22');
    let second = null;
    if (!window.__bajaWorking) second = await load('baja/lib/working.js', 'Working', '');
    ok(second === null, 'a second panel is not raised over the first');
    ok(/Searching exon 3 of 22/.test(document.getElementById('baja-working').textContent),
       'so the operation\'s own progress is what stays on screen');
    mine.done();
    await sleep(10);
    ok(!document.getElementById('baja-working'), 'and its own done() takes it away');

    // ---- the project card, which runs the same kind of operation and had none ---------
    // GO on "create a monthly cost table" changed the button's word and nothing else.
    {
        const pc = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
        ok(/const withSpinner = async \(title, detail, run\) =>/.test(pc), 'the project card has the wrapper too');
        ok(!/await exec\(op\.capability\.module/.test(pc) && /\(\) => exec\(op\.capability\.module, o\.pm \|\| null, op\.args\)/.test(pc),
           'and GO runs through it, with no path around it');
        ok(/withSpinner\(row\.path, '', \(\) => fire\(row\.__m\)\)/.test(pc), 'as does a menu item run from the card');

        // The real card, with a slow operation behind GO.
        let release = null, ran = 0;
        const prev = global.lion_engine.exec;
        global.lion_engine.exec = (p, ...a) => {
            if (p === 'py/bio/project/menu-pick.py') {
                return Promise.resolve({ status: 'OK', operation: 'fill_table',
                    args: { what: 'monthly cost table based on assumptions', table: 'monthly_cost', rows: 10 } });
            }
            if (p === 'baja/plate/ops/fill-table.js') { ran++; return new Promise((r) => { release = r; }); }
            return load(p, ...a);
        };
        const loadCard = async () => {
            const src = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
            const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
            return f({ menus: [{ label: 'Draw', items: [{ label: 'Table', click: () => { } }] }],
                pm: { root: [], setMessage() { } }, text: 'use assumptions to create a monthly cost table',
                context: {}, setError: () => { } });
        };
        document.body.innerHTML = '';
        await loadCard();
        await sleep(60);
        const go = document.querySelector('#pc-op');
        ok(!!go, 'the card offers the operation: ' + (document.body.textContent || '').slice(0, 60));
        if (go) {
            go.onclick();
            await sleep(120);
            ok(ran === 1 && !document.getElementById('baja-working'), 'nothing is shown for the first moment');
            await sleep(420);
            const pnl = document.getElementById('baja-working');
            ok(!!pnl && /fill "monthly_cost" in with 10 rows/.test(pnl.textContent) && /second/.test(pnl.textContent),
               'then the spinner, saying what is running, with the clock: ' + (pnl ? pnl.textContent.slice(0, 70) : '(none)'));
            release({ error: 'there is no table called assumptions' });
            await sleep(30);
            ok(!document.getElementById('baja-working'), 'it comes down when the operation answers');
            ok(/That did not happen/.test(document.body.textContent) && /no table called assumptions/.test(document.body.textContent),
               'and the refusal on the card is not covered by it');
        }
        // An instant one never shows it.
        document.body.innerHTML = '';
        global.lion_engine.exec = (p, ...a) => {
            if (p === 'py/bio/project/menu-pick.py') return Promise.resolve({ status: 'OK', operation: 'fill_table', args: { what: 'x' } });
            if (p === 'baja/plate/ops/fill-table.js') return Promise.resolve({ table: 't', written: 1 });
            return load(p, ...a);
        };
        await loadCard();
        await sleep(60);
        const go2 = document.querySelector('#pc-op');
        if (go2) { go2.onclick(); await sleep(450); }
        ok(!!go2 && !document.getElementById('baja-working'), 'an operation that is over at once shows no panel at all');
        global.lion_engine.exec = prev;
    }

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
