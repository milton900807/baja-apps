// THE LOG OF WHAT HAS BEEN ASKED FOR.
//
//     node tools/test/prompt-log.js          (needs jsdom)
//
// A typed request is the most expensive thing in this editor to reproduce: it took a
// sentence to get right and the only record of it was whatever was still in the box. What
// is kept has to be exactly what makes it repeatable -- the sentence, what it was read as,
// and how much of it ran -- and a log that cannot be written must never be a reason for a
// request to fail, which is why storage is driven here both working and throwing.
const fs = require('fs');
const { JSDOM } = require('jsdom');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const dom = new JSDOM('<!doctype html><html><body><canvas id="cv" width="1000" height="700"></canvas></body></html>',
    { url: 'https://gene.clinic/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
document.getElementById('cv').getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700 });
global.Blob = dom.window.Blob; global.URL = dom.window.URL;
if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:x';
if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => { };

const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const body = fs.readFileSync(p, 'utf8');
    const src = /^\s*(?:\/\/[^\n]*\n|\s)*return\b/.test(body) ? (core + '\n' + body) : (core + '\nreturn (' + body + ')');
    const f = await new AF('exec', 'args', src)(load, {});
    return (typeof f === 'function') ? f(...a) : f;
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

(async () => {
    const LOG = await load('baja/lib/prompt-log.js');
    LOG.clear();

    // ---- WHAT IS KEPT ------------------------------------------------------------------
    const id = LOG.add({ ask: 'load clinvar pathogenic snps', status: 'OK',
        steps: [{ capability: 'load_variants', args: { significance: 'pathogenic' } }] });
    ok(!!id, 'a request is kept and gets an id');
    let e = LOG.list()[0];
    ok(e.ask === 'load clinvar pathogenic snps', 'the sentence itself, as typed');
    ok(e.steps[0].capability === 'load_variants'
       && e.steps[0].args.significance === 'pathogenic',
       'what it was read as, with the arguments: ' + JSON.stringify(e.steps[0]));
    ok(e.ran === 0, 'and that nothing has been run from it yet');
    LOG.ran(id, 2);
    ok(LOG.list()[0].ran === 2, 'until it is, and then how many steps: ' + LOG.list()[0].ran);

    // A PLAN THAT NEVER CAME is the entry most worth keeping: it is the sentence the
    // editor did not understand, and dropping it leaves a log that reads as though it
    // always did.
    LOG.add({ ask: 'make it do the thing', status: 'NO PLAN', error: 'no operation fits' });
    ok(LOG.list()[0].status === 'NO PLAN' && /no operation fits/.test(LOG.list()[0].error),
       'a request with no plan is kept, with the reason');
    ok(LOG.list().length === 2, 'both are in the log');
    ok(LOG.list()[0].ask === 'make it do the thing', 'newest first');

    // THE SAME SENTENCE TWICE IN A ROW is one entry: pressing Enter again after a plan
    // looked wrong is normal, and three identical rows is a log nobody reads.
    LOG.add({ ask: 'make it do the thing', status: 'NO PLAN' });
    ok(LOG.list().length === 2 && LOG.list()[0].repeats === 2,
       'a repeat updates the row and counts: ' + LOG.list()[0].repeats);
    ok(LOG.add({ ask: '   ' }) === null, 'an empty request is not an entry');

    // ---- IT SURVIVES A RELOAD ----------------------------------------------------------
    const LOG2 = await load('baja/lib/prompt-log.js');
    ok(LOG2.list().length === 2, 'a fresh copy reads the same log: ' + LOG2.list().length);
    ok(window.localStorage.getItem(LOG.KEY) !== null, 'because it is in browser storage');

    // ---- STORAGE THAT WILL NOT HAVE US -------------------------------------------------
    // In a private window the accessor itself throws. A log is never a reason for a
    // request to fail, so it falls back to memory and says nothing.
    const realLS = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
        configurable: true, get() { throw new Error('denied'); }
    });
    const LOG3 = await load('baja/lib/prompt-log.js');
    let threw = false;
    try {
        LOG3.add({ ask: 'something while storage is blocked', status: 'OK', steps: [] });
        LOG3.ran('nope', 1);
    } catch (err) { threw = true; }
    ok(!threw, 'writing to a blocked store does not throw');
    ok(LOG3.list().length === 1 && /storage is blocked/.test(LOG3.list()[0].ask),
       'and the log still works for this session, in memory');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: realLS });

    // ---- THE WINDOW --------------------------------------------------------------------
    const said = [];
    const graph = { setResultMessage: (m) => said.push(m), setMessage: (m) => said.push(m), track: [] };
    const opened = [];
    const realExec = global.lion_engine.exec;
    global.lion_engine.exec = async (p, ...a) => {
        if (/editor-command\.js$/.test(p)) { opened.push(a[2] && a[2].prefill); return 1; }
        return realExec(p, ...a);
    };
    const view = await LOG.open(graph, {});
    const panel = document.getElementById('prompt-log');
    ok(!!panel, 'the window opens');
    const text = () => panel.textContent;
    ok(/load clinvar pathogenic snps/.test(text()) && /make it do the thing/.test(text()),
       'listing what was asked');
    ok(/read as load_variants/.test(text()), 'and what each was read as');
    ok(/2 steps run/.test(text()), 'and how much of it ran');
    ok(/no plan: no operation fits/.test(text()), 'and why one of them did nothing');

    // RUNNING AGAIN RE-READS THE SENTENCE rather than replaying the stored steps: those
    // name yesterday's tracks and yesterday's selection.
    const again = panel.querySelectorAll('[data-again]');
    ok(again.length === 2, 'every row offers Run again: ' + again.length);
    again[1].onclick();
    await new Promise((r) => setTimeout(r, 10));
    ok(opened.length === 1 && opened[0] === 'load clinvar pathogenic snps',
       'which puts the sentence back in the command bar: ' + opened[0]);
    ok(!document.getElementById('prompt-log'), 'and closes the log behind it');
    global.lion_engine.exec = realExec;

    // ---- THE FILE ----------------------------------------------------------------------
    const csv = LOG.csv();
    ok(/^when,request,status,read_as,steps_run/.test(csv), 'the download names its columns');
    ok(/load clinvar pathogenic snps/.test(csv) && /load_variants/.test(csv),
       'and holds the requests with what they were read as');

    // ---- CLEARING ASKS ONCE ------------------------------------------------------------
    await LOG.open(graph, {});
    const p2 = document.getElementById('prompt-log');
    const clr = Array.from(p2.querySelectorAll('button')).filter((b) => /Clear the log/.test(b.textContent))[0];
    clr.onclick();
    ok(LOG.list().length === 2 && /press again/.test(clr.textContent),
       'the first press arms it rather than clearing: ' + clr.textContent);
    clr.onclick();
    ok(LOG.list().length === 0, 'the second clears it');
    ok(/Nothing has been asked/.test(p2.textContent),
       'and the empty log says what would fill it');

    // ---- THE WAYS IN -------------------------------------------------------------------
    const cmd = fs.readFileSync('baja/manchester/menu/editor-command.js', 'utf8');
    ok(/prompt-log\.js/.test(cmd) && /logged\(\{ ask: ask, status: 'OK'/.test(cmd),
       'the command bar records every request it plans');
    ok(/status: \(r && r\.status\) \|\| 'NO PLAN'/.test(cmd),
       'including the ones it could not plan');
    ok(/loggedRan\(ran\)/.test(cmd) && /loggedRan\(1\)/.test(cmd),
       'and marks what was actually run');
    ok(/id="ec-log"/.test(cmd), 'with a way into the log under the box');
    const caps = fs.readFileSync('baja/manchester/menu/editor-capabilities.js', 'utf8');
    ok(/name: 'prompt_log'/.test(caps), 'and it can be asked for in words');

    console.log(fails ? ('\n' + fails + ' FAILED') : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
