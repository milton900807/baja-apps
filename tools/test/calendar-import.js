// A CALENDAR ON A TIMELINE.
//
//     node tools/test/calendar-import.js
//
// "Integrate my jeff@violetresearch.org calendar" had nothing behind it. The reader is
// exercised against a real-shaped .ics (folded lines, escaped commas, all-day events whose
// DTEND is the day after, a repeating event); the operation is exercised with the reader
// stubbed, which is where events get doubled up or silently dropped.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;

let reader = null, readerArgs = null;
const load = async (p, ...a) => {
    if (p === 'py/bio/project/ical-read.py') { readerArgs = a; return reader; }
    const path = fs.existsSync(p) ? p : (fs.existsSync(p + '.js') ? p + '.js' : p);
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(path, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// ---- the reader, run as python ---------------------------------------------------------
const B = String.fromCharCode(92);
const ics = [
    'BEGIN:VCALENDAR', 'X-WR-CALNAME:Jeff',
    'BEGIN:VEVENT', 'SUMMARY:Board meeting' + B + ', Q4',
    'DTSTART:20261118T170000Z', 'DTEND:20261118T180000Z', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Lab offsite',
    'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261203', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Standup', 'DTSTART:20261116T160000Z', 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:A title folded over two li', ' nes by the exporter',
    'DTSTART;VALUE=DATE:20261220', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Next year', 'DTSTART;VALUE=DATE:20270601', 'END:VEVENT',
    'END:VCALENDAR'].join('\n');

const py = fs.readFileSync('py/bio/project/ical-read.py', 'utf8').split('def _main()')[0]
    .replace('from ion import works', 'works = None');
const probe = py + [
    '', 'import json',
    'out = _events(' + JSON.stringify(ics) + ', None, None, 100)',
    'print(json.dumps(out))'].join('\n');
fs.writeFileSync('/tmp/ical_probe.py', probe);
const read = JSON.parse(execFileSync('python3', ['-I', '/tmp/ical_probe.py'], { encoding: 'utf8' }));

ok(read.name === 'Jeff', 'the calendar’s own name is read');
const titles = read.events.map((e) => e.title);
ok(titles.indexOf('Board meeting, Q4') >= 0, 'an escaped comma comes back as a comma');
ok(titles.indexOf('A title folded over two lines by the exporter') >= 0,
   'a folded line is put back together: ' + titles.join(' | '));
ok(read.skipped_recurring === 1 && titles.indexOf('Standup') < 0,
   'a repeating event is left out and counted, rather than put on one date');
const offsite = read.events.filter((e) => e.title === 'Lab offsite')[0];
ok(offsite.start === '2026-12-01' && offsite.end === '2026-12-02',
   'an all-day event ends the day its DTEND says MINUS one, as the spec means it: '
   + offsite.start + ' to ' + offsite.end);
const board = read.events.filter((e) => e.title.indexOf('Board') === 0)[0];
ok(board.start === '2026-11-18' && board.all_day === false,
   'a timed event keeps its own date rather than sliding a day: ' + board.start);

// the window is honoured
const probe2 = py + ['', 'import json',
    'print(json.dumps(_events(' + JSON.stringify(ics) + ', __import__("datetime").date(2026,11,1),'
    + ' __import__("datetime").date(2026,12,31), 100)))'].join('\n');
fs.writeFileSync('/tmp/ical_probe2.py', probe2);
const win = JSON.parse(execFileSync('python3', ['-I', '/tmp/ical_probe2.py'], { encoding: 'utf8' }));
ok(win.events.map((e) => e.title).indexOf('Next year') < 0,
   'an event outside the window asked for is not returned');

// ---- the operation ---------------------------------------------------------------------
(async () => {
    const D = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const tl = { name: 'strehg', type: 'timeline', startDate: D('2026-11-04'), endDate: D('2026-12-30'),
        drawPlot() { }, scatterData: { points: [] }, grid: { xmin: 0, xmax: 1000, rescale() { } } };
    const said = [];
    const pt = {
        m_plots: [tl], root: [], selectedPlate: tl, setMessage: (m) => said.push('' + m), wake() { },
        __tlIs: (o) => !!(o && o.type === 'timeline' && o.startDate && o.endDate && o.grid),
        __tlFmt: (ms) => new Date(ms).toDateString(),
        __tlWin: (o) => ({ xmin: 0, xmax: 1000, startMs: o.startDate.getTime(), endMs: o.endDate.getTime(),
            range: 1000, span: o.endDate - o.startDate }),
        __tlMsToX: (o, ms) => (ms - o.startDate.getTime()) / (o.endDate - o.startDate) * 1000
    };
    const run = (args) => load('baja/plate/ops/calendar-import.js', pt, args);

    reader = { status: 'OK', name: 'Jeff', skipped_recurring: 1, events: [
        { title: 'Board meeting, Q4', start: '2026-11-18', end: '2026-11-18', all_day: false },
        { title: 'Lab offsite', start: '2026-12-01', end: '2026-12-02', all_day: true }] };
    let r = await run({ address: 'https://calendar.google.com/calendar/ical/x/basic.ics' });
    ok(!r.error && r.added === 2, 'both events land: ' + JSON.stringify(r));
    const pts = tl.scatterData.points;
    ok(pts.length === 2, 'two points on the timeline');
    ok(pts[0].type === 'milestone' && pts[1].type === 'interval',
       'a one-day event is a milestone and a longer one an interval');
    ok(r.repeating_skipped === 1, 'and the repeating ones are reported, not hidden');

    // only the timeline's own window is fetched
    const asked = JSON.parse(readerArgs[1]);
    ok(asked.from === '2026-11-04' && asked.to === '2026-12-30',
       'only the window the timeline shows is asked for: ' + asked.from + ' to ' + asked.to);

    // asking twice does not double anything up
    r = await run({ address: 'https://calendar.google.com/calendar/ical/x/basic.ics' });
    ok(r.added === 0 && r.already_there === 2 && tl.scatterData.points.length === 2,
       'asking again adds nothing: ' + JSON.stringify(r));

    // nothing in the window is said, with the reason
    reader = { status: 'OK', name: 'Jeff', skipped_recurring: 3, events: [] };
    r = await run({ address: 'https://x/basic.ics' });
    ok(!!r.error && /nothing between/.test(r.error) && /repeating/.test(r.error),
       'an empty window says so, and says what was left out: ' + r.error);

    // a bad address is reported as it comes back
    reader = { status: 'ERROR', error: "that address returned 'not found'" };
    r = await run({ address: 'https://x/nope.ics' });
    ok(!!r.error && /not found/.test(r.error), 'and a bad address is passed through: ' + r.error);

    // ---- the catalogue ------------------------------------------------------------------
    const cap = await load('baja/plate/menu/project-capabilities.js');
    ok(cap.catalogue().map((c) => c.name).indexOf('import_calendar') >= 0, 'import_calendar is offered');
    ok(cap.validate('import_calendar', {}).ok, 'it needs nothing: the address is asked for');
    ok(/it will ask which calendar/.test(cap.preview('import_calendar', {})),
       'and the card says so: ' + cap.preview('import_calendar', {}));
    ok(/An email address is NOT a calendar/.test(JSON.stringify(cap.catalogue())),
       'the catalogue says an email address is not a calendar address, which is what the request carries');

    // the secret is not written anywhere
    const op = fs.readFileSync('baja/plate/ops/calendar-import.js', 'utf8');
    // line by line, since a loose regex spans lines and matches the comments about it
    // The VARIABLE, not the word: a line may say "that address" in prose and be fine. What
    // must never happen is the value itself being put into a message, a reply or a cell.
    // The one shape that leaks a secret is building a string out of it. Testing for the word
    // instead flags `if (!address)`, which is a read and not a leak.
    const leaks = op.split('\n').filter((l) => /['"]\s*\+\s*address\b|\baddress\s*\+\s*['"]/.test(l));
    ok(leaks.length === 0, 'the address itself goes into no message and no reply: ' + leaks.join(' // '));
    ok(/exec\('py\/bio\/project\/ical-read\.py', address/.test(op),
       'it is used for the fetch, which is the one place it goes');
    const pyAll = fs.readFileSync('py/bio/project/ical-read.py', 'utf8');
    ok(/The address is a secret/.test(pyAll), 'and the reader says it is a secret');
    ok(/https:\/\/" \+ url\[len\("webcal:\/\/"\):\]|webcal/.test(pyAll), 'a webcal:// link works too');
    ok(/raise ValueError\("the calendar address has to be an https/.test(pyAll),
       'and anything that is not https is refused rather than fetched');

    console.log(fails ? '\n' + fails + ' assertion(s) failed' : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
