// A NAME THE REQUEST ALREADY GAVE IS NOT ASKED FOR AGAIN.
//
//     node tools/test/new-timeline-name.js
//
// "Create a timeline called mywork starting from today until the end of the week" put up a
// box asking what to call it. The name was in the request; asking for it straight afterwards
// reads as not having listened.
//
// The box still exists, for the callers that have no name to pass -- Draw > Timeline, where
// nobody has said one -- so what this checks is which path each takes.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let placed = null;
const load = async (p, ...a) => {
    if (p === 'baja/draw/place-timeline-with-time-range') { placed = a; return { ok: true }; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

(async () => {
    const pt = { panToNextSpot: () => { }, setMessage: () => { }, wake: () => { } };
    const run = (args) => load('baja/plate/ops/new-timeline.js', pt, args);

    let r = await run({ start: '2026-11-16', end: '2026-11-22', title: 'mywork' });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));
    ok(placed[3] === 'mywork', 'the name goes through to the placement: ' + JSON.stringify(placed[3]));
    ok(r.title === 'mywork', 'and comes back in the reply, so the card can say it');

    placed = null;
    r = await run({ start: '2026-11-16', end: '2026-11-22', name: 'mywork' });
    ok(placed[3] === 'mywork', '"name" is taken as well as "title": both are what a model says');

    placed = null;
    r = await run({ start: '2026-11-16', end: '2026-11-22' });
    ok(placed[3] === null, 'with no name given, nothing is invented: the box opens');
    ok(r.title === undefined, 'and the reply does not claim one');

    placed = null;
    r = await run({ start: '2026-11-16', end: '2026-11-22', title: '   ' });
    ok(placed[3] === null, 'and a name of nothing but spaces is no name');

    // the dates are still checked before anything is placed
    placed = null;
    r = await run({ start: '2026-11-22', end: '2026-11-16', title: 'backwards' });
    ok(!!r.error && /ends before it starts/.test(r.error) && placed === null,
       'a timeline that runs backwards is still refused, name or no name');

    // ---- the placement module itself ----------------------------------------------------
    const place = fs.readFileSync('baja/draw/place-timeline-with-time-range.js', 'utf8');
    ok(/function \(platetrack, start_date, end_date, title\)/.test(place),
       'the placement module takes a title');
    const head = place.slice(0, place.indexOf('const load_file'));
    ok(/if \(!m\) \{[\s\S]{0,200}prompt\("Timeline title"/.test(head),
       'and only asks when it has none');
    ok(/m = generateNautName\(\);/.test(head),
       'with a made-up name still the last resort, for a box that was dismissed');

    // ---- the catalogue -------------------------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    const decl = cap.catalogue().filter((c) => c.name === 'new_timeline')[0];
    ok(!!(decl && decl.params && decl.params.title), 'new_timeline declares a title');
    ok(/WHENEVER THE REQUEST SAYS OR IMPLIES/.test(JSON.stringify(decl)),
       'and says to fill it in whenever the request names one');
    ok(/called "mywork"/.test(cap.preview('new_timeline',
        { start: '2026-11-16', end: '2026-11-22', title: 'mywork' })),
       'the card says the name instead of promising a question: '
       + cap.preview('new_timeline', { start: '2026-11-16', end: '2026-11-22', title: 'mywork' }));
    ok(/it will ask for a title/.test(cap.preview('new_timeline', { start: 'a', end: 'b' })),
       'and still says it will ask when nothing named it');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
