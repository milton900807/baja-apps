// THE EXON STABILITY REPORT: every exon on the canvas, in one table.
//
//     node tools/test/exon-stability-report.js
//
// The per-track ranking answers "which exon on THIS transcript". Choosing an ASO target
// asks "which exon anywhere on the canvas", which meant running PSI per track and reading
// the panels side by side.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator;
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

// A track that has already been scored: the report reads the layer, it does not recompute.
const scored = (name, rows, extra) => ({
    name: name, grid: {}, tgraph: { X: (x) => x, Y: (y) => y },
    annotations: [{ type: 'Exon', index: 1, xi: 100, xf: 200 }],
    track_layers: [Object.assign({
        magnitudeMode: 'psi', exonStability: rows,
        exonStabilityHasContext: true, untrustedSource: '/tmp/segdups.bed',
        exonStabilityFit: 1
    }, extra || {})]
});

(async () => {
    const R = (o) => Object.assign({ exon: 1, lo: 100, hi: 200, psi: 0.5, score: 1,
                                     word: 'unstable', conservation: null, sites: 0, rank: 0.5 }, o);

    const tracks = [
        scored('SMN1', [R({ exon: 7, psi: 0.98, score: 0.04, word: 'constitutive', rank: 0.02 })]),
        scored('DNM3', [R({ exon: 4, psi: 0.52, score: 0.96, word: 'unstable', rank: 0.72 }),
                        R({ exon: 9, psi: 0.91, score: 0.18, word: 'constitutive', rank: 0.10 })])
    ];
    let opened = null;
    const graph = { track: tracks, getTracks: () => tracks, setMessage() { },
        canvas: { width: 1200, height: 800 } };

    // The overlay is the report's output surface; capture what it was handed.
    const realOpen = global.lion_engine.exec;
    global.lion_engine.exec = async (p, ...a) => {
        if (/canvas-overlay-panel/.test(p)) {
            return { open: (o) => {
                const el = document.createElement('div');
                const head = document.createElement('div');
                const h1 = document.createElement('div');
                h1.textContent = '' + (o.title || '');
                head.appendChild(h1);
                // The real panel holds the body in the DOM and is REPAINTED in place as
                // the work proceeds, so the report's live state is the element, never the
                // string it was first opened with. A stub that only kept the string would
                // be testing the progress screen and calling it the report.
                try { el.innerHTML = o.body; } catch (e) { }
                opened = { el: el, head: head,
                           get body() { return el.innerHTML; },
                           get title() { return h1.textContent; } };
                return { body: el, head: head };
            } };
        }
        return realOpen(p, ...a);
    };
    const run = async (g) => {
        const src = fs.readFileSync('baja/bio/splicing/exon-stability-report.js', 'utf8');
        const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
        return f(g, {});
    };

    await run(graph);
    ok(!!opened, 'the report opens a panel');
    const html = (opened && opened.body) || '';

    // EVERY TRACK IN ONE TABLE, which is the thing no per-track view can do.
    ok(/SMN1/.test(html) && /DNM3/.test(html), 'with every track in it');
    ok(/e4/.test(html) && /e7/.test(html) && /e9/.test(html), 'and every exon');

    // RANKED ACROSS TRACKS, not grouped by track: the unstable DNM3 exon must outrank the
    // constitutive SMN1 one, or the report is just three panels stacked up.
    ok(html.indexOf('>DNM3<') < html.indexOf('>SMN1<'),
       'ranked across tracks rather than grouped by track');

    ok(/3 exons/.test(opened.title) && /2 tracks/.test(opened.title),
       'the title counts what is in it: ' + opened.title);

    // UNTRUSTED EXONS SINK, whatever their score, so one cannot float to the top of a
    // report somebody picks a target from.
    const t2 = [scored('X', [R({ exon: 1, rank: 0.9 })]),
                scored('Y', [R({ exon: 2, rank: 0.1, untrusted: true, word: 'PSI not trusted' })])];
    opened = null;
    await run({ track: t2, getTracks: () => t2, setMessage() { }, canvas: { width: 1200, height: 800 } });
    ok(opened && opened.body.indexOf('>X<') < opened.body.indexOf('>Y<'),
       'an untrusted exon sinks below a trusted one');
    ok(/not trustworthy/.test(opened.title), 'and is counted in the summary: ' + opened.title);
    ok(/duplicated sequence/.test(opened.body), 'with the reason stated in the report');

    // THE CAVEATS TRAVEL. A report is read away from the screen that made it.
    const t3 = [scored('Z', [R({})], { exonStabilityHasContext: false, untrustedSource: null })];
    opened = null;
    await run({ track: t3, getTracks: () => t3, setMessage() { }, canvas: { width: 1200, height: 800 } });
    ok(/no conservation or domain layer/i.test(opened.body),
       'an unweighted track says its score is not comparable');
    ok(/Mappability was not checked/i.test(opened.body),
       'and a server with no mappability file says so, rather than reading as clean');

    // A variant that moved an exon is shown as what it becomes, with the base change.
    const t4 = [scored('V', [R({ variant: { psiAlt: 0.08, ref: 'G', alt: 'A', canonicalSite: 1 } })])];
    opened = null;
    await run({ track: t4, getTracks: () => t4, setMessage() { }, canvas: { width: 1200, height: 800 } });
    ok(/8%/.test(opened.body) && /G&gt;A/.test(opened.body),
       'a variant effect is in the table with its base change');
    ok(/moved by a variant/.test(opened.title), 'and counted: ' + opened.title);

    // A REPORT THAT RETURNS NOTHING IS INDISTINGUISHABLE FROM A CRASH. Every exit opens
    // the panel and says what happened. The first version closed on a transient status
    // line when it had no rows, which read as the tool doing nothing at all.
    opened = null;
    const bare = [{ name: 'plain', grid: {}, tgraph: {}, annotations: [], track_layers: [] }];
    let said = '';
    const r = await run({ track: bare, getTracks: () => bare,
        setMessage: (m) => { said = m; }, canvas: { width: 1200, height: 800 } });
    ok(r === false, 'a canvas with no annotated exons reports no rows');
    ok(!!opened, 'and STILL opens the panel, rather than appearing to do nothing');
    ok(/annotated exons/.test(opened.body), 'saying why: ' + opened.body.slice(0, 80));
    ok(/nothing to report/.test(opened.title), 'with a title that says so: ' + opened.title);

    // A track that has exons but whose PSI run produced no reliability is the other way to
    // get an empty report, and it must name the track rather than say nothing happened.
    opened = null;
    const stuck = [{ name: 'quiet', grid: {}, tgraph: {},
        annotations: [{ type: 'Exon', index: 1, xi: 1, xf: 9 }],
        track_layers: [{ magnitudeMode: 'psi', exonStability: [] }] }];
    await run({ track: stuck, getTracks: () => stuck, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    ok(opened && /quiet/.test(opened.body), 'an exon-bearing track with no reliability is named');
    ok(opened && /Exon inclusion/.test(opened.body),
       'with the one step that would show the real error');

    // THE PICTURE. Bar height is inclusion, colour is reliability.
    opened = null;
    const pic = [scored('P', [R({ exon: 1, psi: 1.0, score: 0.0, word: 'constitutive', rank: 0 }),
                              R({ exon: 2, psi: 0.5, score: 1.0, word: 'unstable', rank: 1 })])];
    await run({ track: pic, getTracks: () => pic, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    ok(/bar height = inclusion/.test(opened.body), 'the chart says what height means');
    ok(/#22c55e/.test(opened.body) && /#ff9f68/.test(opened.body),
       'a reliable exon and an unstable one are drawn in different colours');
    ok(/least reliable: e2/.test(opened.body),
       'and the track line names its worst exon');
    // Transcript order in the picture, rank order in the table: finding the exon again
    // needs the first, choosing one needs the second.
    const chart = opened.body.slice(0, opened.body.indexOf('<table'));
    ok(chart.indexOf('>1<') < chart.indexOf('>2<'), 'the chart runs in transcript order');

    // An untrusted exon must not be given a bar height, since height means a number and
    // that is the number this whole path exists to withhold.
    opened = null;
    const unt = [scored('U', [R({ exon: 1, untrusted: true, untrustedWhy: 'SMN1',
                                  word: 'PSI not trusted', psi: 0.84 })])];
    await run({ track: unt, getTracks: () => unt, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    ok(/no trustworthy number/.test(opened.body), 'the legend names the untrusted colour');
    ok(/height:6px/.test(opened.body),
       'and the exon is a stub, not a bar at its blended value');

    // NAVIGATION. A report that names an exon and leaves you to find it has only
    // half-answered. Every row and every bar frames its own exon on its own track.
    opened = null;
    const navs = [];
    const t5 = [scored('N', [R({ exon: 3, lo: 500, hi: 620, score: 0.9, rank: 0.9 }),
                             R({ exon: 8, lo: 900, hi: 980, score: 0.2, rank: 0.2 })])];
    const g5 = { track: t5, getTracks: () => t5, setMessage() { }, canvas: { width: 1200, height: 800 } };
    await (async () => {
        const src = fs.readFileSync('baja/bio/splicing/exon-stability-report.js', 'utf8');
        const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
        return f(g5, {}, null, (t, lo, hi) => { navs.push([t.name, lo, hi]); });
    })();
    const el = opened.el;
    const rowEls = el.querySelectorAll('[id^="esr-nav-"]');
    ok(rowEls.length >= 4, 'rows AND bars are clickable: ' + rowEls.length + ' targets');
    rowEls[rowEls.length - 1].onclick({ preventDefault() { } });
    await new Promise((r) => setTimeout(r, 10));
    ok(navs.length === 1, 'clicking one frames exactly one exon: ' + JSON.stringify(navs));
    ok(navs[0][0] === 'N' && navs[0][1] != null && navs[0][2] != null,
       'on its own track, over its own span: ' + JSON.stringify(navs[0]));
    ok(g5.selectedTrack === t5[0], 'and selects that track');

    // SORTED BY RELIABILITY, the quantity the report is named for, not by the weighted
    // score, which is a different and more opinionated ordering.
    const tbl = el.querySelector('#esr-table').innerHTML;
    ok(tbl.indexOf('e3') < tbl.indexOf('e8'), 'the least reliable exon is first');
    ok(/esr-sort-reliability/.test(tbl), 'and the column headers offer other orders');
    const sortEl = el.querySelector('#esr-sort-exon');
    ok(!!sortEl, 'including by exon');
    sortEl.onclick({ preventDefault() { } });
    const tbl2 = el.querySelector('#esr-table').innerHTML;
    ok(tbl2.indexOf('>e3<') < tbl2.indexOf('>e8<'), 're-sorting rebuilds the table');
    // The rebuilt rows must still navigate: the old handlers went with the old rows.
    const after = el.querySelectorAll('#esr-table [id^="esr-nav-"]');
    ok(after.length > 0 && typeof after[0].onclick === 'function',
       'and the new rows are wired again');

    // THE PANEL OPENS BEFORE THE WORK, NOT AFTER IT. Scoring a canvas takes real time,
    // and the first version showed nothing until it had finished: a long silence ending
    // in a window, which cannot be told from a crash.
    opened = null;
    const seen = [];
    const slow = [{
        name: 'slowtrack', grid: {}, tgraph: {},
        annotations: [{ type: 'Exon', index: 1, xi: 10, xf: 90 }],
        track_layers: []
    }];
    const gSlow = { track: slow, getTracks: () => slow, setMessage() { },
        canvas: { width: 1200, height: 800 } };
    // The run is what the report waits on; it lands a layer a moment after being asked,
    // so the panel must already be up by then.
    const realExec2 = global.lion_engine.exec;
    global.lion_engine.exec = async (pth, ...a) => {
        if (/splicing-profile/.test(pth)) {
            seen.push(opened ? opened.body : null);
            setTimeout(() => {
                slow[0].track_layers.push({ magnitudeMode: 'psi', exonStability: [
                    { exon: 1, lo: 10, hi: 90, psi: 0.5, score: 1, word: 'unstable', rank: 0.5 }],
                    exonStabilityHasContext: true, untrustedSource: '/x.bed', exonStabilityFit: 1 });
            }, 40);
            return true;
        }
        return realExec2(pth, ...a);
    };
    await (async () => {
        const src = fs.readFileSync('baja/bio/splicing/exon-stability-report.js', 'utf8');
        const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
        return f(gSlow, {});
    })();
    global.lion_engine.exec = realExec2;
    ok(seen.length === 1 && seen[0] != null,
       'the panel is already open when the first run is dispatched');
    ok(/slowtrack/.test(seen[0] || ''), 'listing the track being worked on');
    ok(/running|queued/.test(seen[0] || ''), 'and saying what is happening to it');
    ok(/PSINet/.test(seen[0] || ''), 'with what is taking the time');
    // And the same panel becomes the report rather than a second window appearing.
    ok(/bar height = inclusion/.test(opened.body),
       'the same panel then becomes the report');
    ok(!/elapsed/.test(opened.body), 'with the progress screen gone from it');
    ok(/1 exon/.test(opened.title) && !/working/.test(opened.title),
       'and the title updated off "working": ' + opened.title);

    // A canvas where everything is already scored must still say so, or a fast report
    // is indistinguishable from one that skipped tracks.
    opened = null;
    const done2 = [scored('ready', [R({})])];
    await run({ track: done2, getTracks: () => done2, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    ok(/1 exon/.test(opened.title), 'an already-scored canvas reports immediately');

    // WHY A TRACK FAILED, instead of waiting out the timeout to say "no result".
    // splicing-profile.js refuses a cDNA track in the first second -- its introns have
    // been removed, so there is nothing for a splicing model to score -- and leaves the
    // reason on the track. Before this, the report sat for two minutes and then reported
    // a bare absence for a problem that was known immediately.
    opened = null;
    const refused = [{
        name: 'MAPK8IP3', grid: {}, tgraph: {},
        annotations: [{ type: 'Exon', index: 1, xi: 10, xf: 90 }],
        track_layers: []
    }];
    const realExec3 = global.lion_engine.exec;
    global.lion_engine.exec = async (pth, ...a) => {
        if (/splicing-profile/.test(pth)) {
            refused[0].psiRefusal = { why: 'MAPK8IP3 holds a spliced sequence (4,021 nt) in a '
                + '92,110 nt genomic frame - no introns to score.', mode: 'psi', at: Date.now() };
            return false;
        }
        return realExec3(pth, ...a);
    };
    const tStart = Date.now();
    await (async () => {
        const src = fs.readFileSync('baja/bio/splicing/exon-stability-report.js', 'utf8');
        const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
        return f({ track: refused, getTracks: () => refused, setMessage() { },
                   canvas: { width: 1200, height: 800 } }, {});
    })();
    global.lion_engine.exec = realExec3;
    ok(Date.now() - tStart < 10000,
       'a refusal ends the wait at once rather than running out the clock: '
       + (Date.now() - tStart) + 'ms');
    ok(/spliced sequence/.test(opened.body),
       'and the reason reaches the report: ' + opened.body.replace(/<[^>]+>/g, ' ').slice(0, 140));
    ok(/no introns to score/.test(opened.body), 'in the run\u2019s own words');
    ok(/MAPK8IP3/.test(opened.body), 'named to the track it is about');

    // A timeout is a DIFFERENT failure from a refusal and must not borrow its wording.
    opened = null;
    const quiet2 = [{ name: 'silent', grid: {}, tgraph: {},
        annotations: [{ type: 'Exon', index: 1, xi: 10, xf: 90 }], track_layers: [] }];
    global.lion_engine.exec = async (pth, ...a) => {
        if (/splicing-profile/.test(pth)) return false;   // never lands, never refuses
        return realExec3(pth, ...a);
    };
    // The ceiling is two minutes in the module; this only checks the wording it uses, so
    // the clock is moved rather than waited out.
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => { t += 20000; return t; };
    await (async () => {
        const src = fs.readFileSync('baja/bio/splicing/exon-stability-report.js', 'utf8');
        const f = await new AF('exec', 'args', core + '\nreturn (' + src + ')')(global.lion_engine.exec, {});
        return f({ track: quiet2, getTracks: () => quiet2, setMessage() { },
                   canvas: { width: 1200, height: 800 } }, {});
    })();
    Date.now = realNow;
    global.lion_engine.exec = realExec3;
    ok(/within two minutes/.test(opened.body),
       'a genuine timeout says so: ' + opened.body.replace(/<[^>]+>/g, ' ').slice(0, 120));

    // THE PDF. Typeset for paper rather than a screenshot of a dark scrolling panel, and
    // printed from a hidden iframe so no popup blocker is involved.
    opened = null;
    const t6 = [scored('PDFT', [
        R({ exon: 1, psi: 0.98, score: 0.04, word: 'constitutive', rank: 0.02, sites: 3 }),
        R({ exon: 2, psi: 0.44, score: 0.88, word: 'unstable', rank: 0.70, sites: 1 })
    ], { exonStabilityHasContext: false, untrustedSource: null })];
    await run({ track: t6, getTracks: () => t6, setMessage() { },
        canvas: { width: 1200, height: 800 } });
    const pel = opened.el.querySelector('#esr-pdf');
    ok(!!pel, 'the report offers a PDF download');

    // Printing happens in an iframe appended to the page, and its document is the
    // printable version: capture it rather than trusting the link exists.
    let printed = null;
    const realPrint = dom.window.HTMLIFrameElement;
    pel.onclick({ preventDefault() { } });
    const fr = document.querySelector('iframe[aria-hidden="true"]');
    ok(!!fr, 'which prints from a hidden iframe, not a popup');
    try { printed = fr.contentDocument.documentElement.outerHTML; } catch (e) { printed = null; }
    ok(printed && /Exon stability report/.test(printed), 'the printed page is titled');
    ok(printed && /PDFT/.test(printed) && /e2/.test(printed),
       'and carries the tracks and exons');
    ok(printed && /table-header-group/.test(printed),
       'with a table header that repeats across pages');
    ok(printed && /print-color-adjust: exact/.test(printed),
       'and backgrounds kept, since the bar colours are the content');
    ok(printed && /color: #111/.test(printed),
       'typeset dark-on-light rather than printing the dark panel');
    // THE CAVEATS PRINT WITH IT. A PDF travels further than the panel ever does, so a
    // table that leaves the room without its qualifications is the dangerous artifact.
    ok(printed && /Mappability was not checked/i.test(printed),
       'the mappability caveat is on the printed page');
    ok(printed && /not comparable/i.test(printed),
       'and so is the unweighted-score caveat');
    ok(!/cursor:pointer/.test(printed || ''),
       'without the panel\u2019s interactive styling');

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
