// PUTTING A MILESTONE ON A TIMELINE.
//
//     node tools/test/timeline-add.js
//
// The failure that matters is silent: a date outside the timeline's window would place the
// point off the end of the axis, where nothing draws it, so the request would appear to have
// done nothing. Such a date now GROWS the window instead, and what has to be true after that
// is that every point already on the timeline still sits on its own date.
//
// The window arithmetic is the track's own (__tlWin, __tlMsToX, __tlSetWindow) rather than a
// second implementation of hours-since-start, and the test uses the REAL ones out of
// plate-track.js so the two cannot drift.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
const load = async (p, ...a) => {
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a) };

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

// THE REAL WINDOW ARITHMETIC, lifted out of plate-track.js.
const trackSrc = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
const method = (name) => {
    // THE DEFINITION, NOT THE FIRST MENTION. indexOf(name + '(') finds whichever comes first
    // in the file, and for __tlXToMs that is a CALL inside another method: the body lifted
    // was somebody else's, and it quietly returned nonsense instead of failing.
    const m = new RegExp('^\\s*(?:async\\s+)?' + name + '\\s*\\(', 'm').exec(trackSrc);
    if (!m) throw new Error('no definition of ' + name + ' in plate-track.js');
    const k = m.index;
    let i = trackSrc.indexOf('{', k), d = 0, j = i;
    for (;; j++) { const ch = trackSrc[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    return trackSrc.slice(i + 1, j);
};
const D = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const mkTimeline = (name, start, end) => ({
    name: name, type: 'timeline', startDate: D(start), endDate: D(end),
    drawPlot() { }, scatterData: { points: [] },
    grid: { xmin: 0, xmax: 1000, rescale() { } }
});
const mkTrack = (tls, selected) => {
    const pt = {
        root: tls, selectedPlate: selected || null,
        setMessage() { }, wake() { },
        __tlIs(o) { return !!(o && typeof o.drawPlot === 'function' && o.type === 'timeline' && o.startDate && o.endDate && o.grid); },
        __tlFmt(ms) { return new Date(ms).toDateString(); }
    };
    pt.__tlWin = new Function('o', method('__tlWin')).bind(pt);
    pt.__tlMsToX = new Function('o', 'ms', method('__tlMsToX')).bind(pt);
    pt.__tlXToMs = new Function('o', 'xUnits', method('__tlXToMs')).bind(pt);
    pt.__tlStampDates = new Function('o', method('__tlStampDates')).bind(pt);
    pt.__tlSetWindow = new Function('o', 'startMs', 'endMs', method('__tlSetWindow')).bind(pt);
    return pt;
};
const run = (pt, args) => load('baja/plate/ops/timeline-add.js', pt, args);

(async () => {
    const tl = mkTimeline('Q4', '2026-11-15', '2026-12-31');
    let pt = mkTrack([tl], tl);

    let r = await run(pt, { title: 'Kickoff', date: '2026-12-01' });
    ok(!r.error, 'it runs: ' + JSON.stringify(r));
    const p = tl.scatterData.points[0];
    ok(!!p && p.name === 'Kickoff' && p.type === 'milestone', 'a milestone is added with its name');
    ok(p.date instanceof Date && p.date.getDate() === 1 && p.date.getMonth() === 11,
       'carrying the real date: ' + p.date.toDateString());

    // the axis position must be inside the axis, and proportional to the date
    ok(p.x > tl.grid.xmin && p.x < tl.grid.xmax,
       'and an axis position inside the axis: ' + p.x.toFixed(1));
    const halfway = (tl.startDate.getTime() + tl.endDate.getTime()) / 2;
    const mid = pt.__tlMsToX(tl, halfway);
    ok(Math.abs(mid - 500) < 1, 'the middle of the window is the middle of the axis: ' + mid.toFixed(1));

    // OUTSIDE THE WINDOW: the window grows to take it in, and the point already on the
    // timeline keeps its own date while the axis moves under it.
    const keptDate = p.date.getTime();
    r = await run(pt, { title: 'Next year', date: '2027-03-01' });
    ok(!r.error, 'a date past the end is added, not refused: ' + JSON.stringify(r));
    ok(!!r.extended, 'and the reply says the timeline grew: ' + JSON.stringify(r.extended));
    ok(tl.endDate.getTime() > D('2027-03-01').getTime(),
       'the end moved past the new date: ' + tl.endDate.toDateString());
    ok(tl.startDate.getTime() === D('2026-11-15').getTime(),
       'the start did not move: only the side that had to');
    ok(p.date.getTime() === keptDate, 'the milestone already there keeps its date');
    ok(Math.abs(pt.__tlXToMs(tl, p.x) - keptDate) < 60 * 60 * 1000,
       'and its axis position was moved to match the new window');
    const added = tl.scatterData.points[1];
    ok(added.x > tl.grid.xmin && added.x < tl.grid.xmax,
       'the new point is on the axis, not past the end: ' + added.x.toFixed(1));

    r = await run(pt, { title: 'Too early', date: '2026-01-01' });
    ok(!r.error && tl.startDate.getTime() < D('2026-01-01').getTime(),
       'a date before the start grows the other end: ' + tl.startDate.toDateString());

    // A TRACK THAT CANNOT MOVE THE WINDOW still refuses rather than drawing off the axis.
    const old = mkTimeline('Old', '2026-11-15', '2026-12-31');
    const noGrow = mkTrack([old], old);
    delete noGrow.__tlSetWindow;
    r = await run(noGrow, { title: 'Next year', date: '2027-03-01' });
    ok(!!r.error && /falls outside it/.test(r.error),
       'without __tlSetWindow it says what the window is: ' + r.error);
    ok(old.scatterData.points.length === 0, 'and adds nothing');

    // intervals
    r = await run(pt, { kind: 'interval', title: 'Build', start: '2026-11-20', end: '2026-12-10' });
    const iv = tl.scatterData.points[tl.scatterData.points.length - 1];
    ok(!r.error && iv && iv.type === 'interval', 'an interval is added');
    ok(iv.startX < iv.x, 'running left to right on the axis');
    ok(iv.__startDate instanceof Date && iv.date instanceof Date, 'with both dates on it');

    r = await run(pt, { kind: 'interval', title: 'Backwards', start: '2026-12-10', end: '2026-11-20' });
    ok(!!r.error && /ends before it starts/.test(r.error), 'a backwards interval is refused');

    // no title, no date
    r = await run(pt, { date: '2026-12-01' });
    ok(!!r.error && /what should it be called/.test(r.error), 'a milestone with no name is refused');
    r = await run(pt, { title: 'x' });
    ok(!!r.error && /what date/.test(r.error), 'and one with no date');

    // which timeline
    const a = mkTimeline('A', '2026-01-01', '2026-12-31');
    const b = mkTimeline('B', '2026-01-01', '2026-12-31');
    r = await run(mkTrack([a, b]), { title: 'x', date: '2026-06-01' });
    ok(!!r.error && /more than one timeline/.test(r.error),
       'with two timelines and neither selected it asks which');
    r = await run(mkTrack([a]), { title: 'x', date: '2026-06-01' });
    ok(!r.error, 'with exactly one there is nothing to ask');
    r = await run(mkTrack([]), { title: 'x', date: '2026-06-01' });
    ok(!!r.error && /no timeline here/.test(r.error), 'and with none it says so');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();
