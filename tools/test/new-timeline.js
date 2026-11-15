// A TIMELINE OVER A RANGE OF DATES.
//
//     node tools/test/new-timeline.js
//
// The date handling is the whole of this operation, and the trap is the one-line kind:
// new Date("2026-12-31") is UTC midnight, which is the 30th of December anywhere west of
// Greenwich, so "until the end of the year" would quietly stop a day early.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let placed = null;
const load = async (p, ...a) => {
    if (/place-timeline-with-time-range/.test(p)) { placed = { pt: a[0], start: a[1], end: a[2] }; return true; }
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const pt = { panToNextSpot: async () => { }, setMessage() { } };
const run = (args) => { placed = null; return load('baja/plate/ops/new-timeline.js', pt, args); };

(async () => {
    let r = await run({ start: '2026-11-15', end: '2026-12-31' });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));
    ok(!!placed, 'and hands over to the module that already draws these');

    // THE TRAP: a plain date must be the day that was asked for, in the user's own timezone
    ok(placed.end.getDate() === 31 && placed.end.getMonth() === 11,
       'THE END IS THE 31st OF DECEMBER, not the 30th: '
       + placed.end.toDateString());
    ok(placed.start.getDate() === 15 && placed.start.getMonth() === 10,
       'and the start is the day asked for: ' + placed.start.toDateString());

    // a full timestamp still works
    r = await run({ start: '2026-01-01T09:00:00', end: '2026-01-02T17:00:00' });
    ok(!r.error && placed.start.getHours() === 9, 'a date with a time is taken as given');

    // backwards
    r = await run({ start: '2026-12-31', end: '2026-01-01' });
    ok(!!r.error && /ends before it starts/.test(r.error), 'a range that runs backwards is refused');
    ok(placed === null, 'and nothing is drawn');

    // same day
    r = await run({ start: '2026-05-05', end: '2026-05-05' });
    ok(!!r.error && /same day/.test(r.error), 'a range of no length is refused');

    // unparseable
    r = await run({ start: 'next Thursday', end: '2026-12-31' });
    ok(!!r.error && /when should the timeline start/.test(r.error),
       'a date it cannot read is refused rather than guessed');
    r = await run({ end: '2026-12-31' });
    ok(!!r.error, 'a missing start is refused');

    // the panel must send today's date, or the model has no way to resolve "now"
    const panel = fs.readFileSync('baja/plate/menu/project-command.js', 'utf8');
    ok(/today:/.test(panel) && /getFullYear\(\)/.test(panel),
       "and the panel sends today's date with every request, since a model has no clock");

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();
