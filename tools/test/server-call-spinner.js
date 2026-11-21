// EVERY SERVER CALL THAT TAKES TIME SAYS SO, WHEREVER IT WAS STARTED FROM.
//
//     node tools/test/server-call-spinner.js
//
// The spinner was being added one caller at a time, and the callers nobody had got to yet
// still ran in silence: the exon comparison is one server call per exon with nothing but a
// corner line that fades, which reads exactly like a dead click. Every one of those calls
// goes through exec(), so that is where it is answered.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = () => document.getElementById('baja-working');

(async () => {
    // Core's own exec, with the engine under it stubbed: a .py path returns a promise the
    // test controls, a .js path loads the real module.
    let release = null, calls = [];
    const engine = {
        exec: (p, ...a) => {
            calls.push(p);
            if (/\.py/.test(p)) return new Promise((res) => { release = () => res({ ok: true }); });
            const src = fs.readFileSync(p, 'utf8');
            return new AF('exec', 'args', core + '\nreturn (' + src + ')')(engine.exec, {})
                .then((f) => (typeof f === 'function' ? f(...a) : f));
        },
        createIonFunction: (f) => f, getIonFunction: (r) => r
    };
    global.lion_engine = engine;
    const api = await new AF('exec', 'args',
        core + '\nreturn { exec: exec, wait: __bajaServerWait, name: __bajaWaitName, quiet: __bajaWaitQuiet };')(engine.exec, {});

    ok(typeof api.exec === 'function', 'core has the one exec every call goes through');
    ok(api.name('py/baja/sequence-space/find-subseq.py') === 'Find subseq',
       'a script names itself readably: ' + api.name('py/baja/sequence-space/find-subseq.py'));

    // ---- a slow server call raises the panel by itself ----------------------------------
    let p1 = api.exec('py/baja/sequence-space/find-subseq.py', 'AAA', 'CCC');
    await sleep(200);
    ok(!panel(), 'nothing is raised for a call that might still be quick');
    await sleep(350);
    ok(!!panel(), 'but a call still going after a moment raises it');
    ok(panel() && /Find subseq/.test(panel().textContent),
       'named for the script that is running: ' + (panel() ? panel().textContent.slice(0, 40) : ''));
    release(); await p1; await sleep(20);
    ok(!panel(), 'and it comes down when the call returns');

    // ---- a fast call raises nothing -----------------------------------------------------
    const fast = api.exec('py/x/quick.py');
    release(); await fast; await sleep(500);
    ok(!panel(), 'a call that returns at once never raises a panel');

    // ---- a burst is ONE panel, not one per call -----------------------------------------
    // Twenty-two exons is twenty-two calls; opening and closing between each is a strobe.
    const releases = [];
    const engine2 = Object.assign({}, engine, {
        exec: (p, ...a) => {
            if (/\.py/.test(p)) return new Promise((res) => releases.push(() => res({ ok: true })));
            return engine.exec(p, ...a);
        }
    });
    global.lion_engine = engine2;
    const api2 = await new AF('exec', 'args', core + '\nreturn { exec: exec, wait: __bajaServerWait };')(engine2.exec, {});
    const burst = [api2.exec('py/a.py'), api2.exec('py/b.py'), api2.exec('py/c.py')];
    await sleep(550);
    ok(!!panel(), 'the burst raises the panel');
    const was = panel();
    releases[0](); await burst[0]; await sleep(30);
    ok(panel() === was, 'which stays up while the rest are still running');
    releases[1](); releases[2](); await Promise.all(burst); await sleep(30);
    ok(!panel(), 'and comes down when the last one finishes: not once per call');
    ok(api2.wait.n === 0, 'with nothing left counted as in flight: ' + api2.wait.n);

    // ---- a failure does not leave it spinning -------------------------------------------
    const engine3 = Object.assign({}, engine, {
        exec: (p, ...a) => (/\.py/.test(p)
            ? new Promise((res, rej) => { release = () => rej(new Error('server said no')); })
            : engine.exec(p, ...a))
    });
    global.lion_engine = engine3;
    const api3 = await new AF('exec', 'args', core + '\nreturn { exec: exec, wait: __bajaServerWait };')(engine3.exec, {});
    const bad = api3.exec('py/boom.py').catch(() => 'caught');
    await sleep(550);
    ok(!!panel(), 'up while it runs');
    release();
    ok((await bad) === 'caught', 'the error still reaches the caller');
    await sleep(30);
    ok(!panel(), 'and the panel does not outlive it');

    // ---- somebody else's panel is left alone --------------------------------------------
    // An operation that raised its own is saying something more specific than this can.
    global.lion_engine = engine;
    const mine = await engine.exec('baja/lib/working.js', 'Exons of DNM1 against DNM3', 'One search per exon.');
    mine.step('Searching exon 3 of 22');
    const p4 = api.exec('py/slow.py');
    await sleep(550);
    ok(/Searching exon 3 of 22/.test(panel().textContent),
       'the operation\'s own panel is what is on screen: ' + panel().textContent.slice(0, 60));
    release(); await p4; await sleep(30);
    ok(!!panel() && /Searching exon 3 of 22/.test(panel().textContent),
       'and it is NOT taken down by a call finishing underneath it');
    mine.done();
    await sleep(20);
    ok(!panel(), 'it goes when its own owner says so');

    // ---- the ask card asks for itself ---------------------------------------------------
    ok(api.quiet('/py/bio/editor/plan.py') === true,
       'the planner is left to the card, which is already showing its own busy state');
    ok(api.quiet('py/bio/search-region-in-track.py') === false, 'everything else is covered');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
