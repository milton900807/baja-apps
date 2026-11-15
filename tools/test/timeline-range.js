// MOVING A TIMELINE'S OWN RANGE.
//
//     node tools/test/timeline-range.js
//
// "Expand the timeline by 10% on both start and end", asked from a timeline's own frame,
// answered "Nothing here does that" about that very timeline. This is the operation behind
// it. What has to hold afterwards: the points already on the timeline keep their dates, a
// percentage is of the range as it stood rather than compounding one edge onto the other,
// and a narrowing that would push something off the axis is refused by name rather than
// quietly hiding it.
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

// the real window arithmetic, by DEFINITION and not by first mention (see timeline-add.js)
const trackSrc = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
const method = (name) => {
    const m = new RegExp('^\\s*(?:async\\s+)?' + name + '\\s*\\(', 'm').exec(trackSrc);
    if (!m) throw new Error('no definition of ' + name);
    let i = trackSrc.indexOf('{', m.index), d = 0, j = i;
    for (;; j++) { const ch = trackSrc[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    return trackSrc.slice(i + 1, j);
};
const D = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const DAY = 24 * 60 * 60 * 1000;

const mkTimeline = (name, start, end) => ({
    name: name, type: 'timeline', startDate: D(start), endDate: D(end),
    drawPlot() { }, scatterData: { points: [] },
    grid: { xmin: 0, xmax: 1000, rescale() { } }
});
const mkTrack = (tls, selected) => {
    const pt = {
        m_plots: tls, root: [], selectedPlate: selected || null,
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
const run = (pt, args) => load('baja/plate/ops/timeline-range.js', pt, args);

(async () => {
    // Nov 21 2026 to Jan 16 2027, the timeline on screen when this was asked for
    let tl = mkTimeline('strehg', '2026-11-21', '2027-01-16');
    let pt = mkTrack([tl], tl);
    const span0 = tl.endDate.getTime() - tl.startDate.getTime();

    let r = await run(pt, { by_percent: 10, edge: 'both' });
    ok(!r.error, '10% on both ends runs: ' + JSON.stringify(r));
    const grew = (tl.endDate.getTime() - tl.startDate.getTime()) - span0;
    ok(Math.abs(grew - span0 * 0.2) < 1000, 'the range grows by a tenth at EACH end: '
       + (grew / DAY).toFixed(1) + ' days added to ' + (span0 / DAY).toFixed(0));
    ok(Math.abs((tl.startDate.getTime() - D('2026-11-21').getTime()) + span0 * 0.1) < 1000,
       'the start moved back by a tenth of what the range WAS, not of a range already widened');
    ok(r.was && r.now && r.was.start !== r.now.start, 'and the reply says what it ran before and after');

    // one edge only
    tl = mkTimeline('one', '2026-12-01', '2027-01-01'); pt = mkTrack([tl], tl);
    const s0 = tl.startDate.getTime();
    r = await run(pt, { by_days: 7, edge: 'end' });
    ok(!r.error && tl.startDate.getTime() === s0, 'by days at the end leaves the start alone');
    ok(Math.abs(tl.endDate.getTime() - (D('2027-01-01').getTime() + 7 * DAY)) < 1000,
       'and moves the end by exactly that many days');

    // points keep their dates while the axis moves under them
    tl = mkTimeline('kept', '2026-12-01', '2027-01-01'); pt = mkTrack([tl], tl);
    const when = D('2026-12-15');
    tl.scatterData.points.push({ x: pt.__tlMsToX(tl, when.getTime()), y: 0.1, type: 'milestone', name: 'Song', date: when });
    r = await run(pt, { by_percent: 25, edge: 'both' });
    const p = tl.scatterData.points[0];
    ok(!r.error && p.date.getTime() === when.getTime(), 'a milestone keeps its date');
    ok(Math.abs(pt.__tlXToMs(tl, p.x) - when.getTime()) < 60 * 60 * 1000,
       'and its axis position follows the new window');

    // narrowing that would hide something is refused BY NAME
    r = await run(pt, { start: '2026-12-20', end: '2026-12-30' });
    ok(!!r.error && /outside the range/.test(r.error) && /Song/.test(r.error),
       'narrowing past a milestone is refused, and says which one: ' + r.error);
    ok(p.date.getTime() === when.getTime(), 'and nothing moved');

    // narrowing that hides nothing is allowed
    tl = mkTimeline('roomy', '2026-01-01', '2026-12-31'); pt = mkTrack([tl], tl);
    r = await run(pt, { by_percent: -10, edge: 'both' });
    ok(!r.error && tl.startDate.getTime() > D('2026-01-01').getTime(), 'narrowing an empty timeline is fine');

    // dates win over amounts
    tl = mkTimeline('set', '2026-01-01', '2026-12-31'); pt = mkTrack([tl], tl);
    r = await run(pt, { start: '2026-03-01', end: '2026-06-30', by_percent: 50 });
    ok(!r.error && tl.startDate.getTime() === D('2026-03-01').getTime()
       && tl.endDate.getTime() === D('2026-06-30').getTime(),
       'two dates said outright are the answer, and an amount beside them is not applied on '
       + 'top: ' + tl.startDate.toDateString() + ' to ' + tl.endDate.toDateString());

    // nonsense
    tl = mkTimeline('tiny', '2026-01-01', '2026-01-10'); pt = mkTrack([tl], tl);
    r = await run(pt, { by_percent: -99, edge: 'both' });
    ok(!!r.error && /less than a day/.test(r.error), 'it will not collapse a timeline to nothing');
    r = await run(pt, { by_days: 'soon' });
    ok(!!r.error && /by how much/.test(r.error), 'and an amount that is not a number is asked about');

    // which timeline: the shared picker, same as timeline_add
    const a = mkTimeline('strehg', '2026-12-01', '2027-01-16');
    const b = mkTimeline('adf', '2026-12-31', '2027-03-30');
    r = await run(mkTrack([a, b]), { timeline: 'adf', by_days: 3, edge: 'end' });
    ok(!r.error && r.timeline === 'adf' && a.endDate.getTime() === D('2027-01-16').getTime(),
       'named, it moves that one and leaves the other alone');
    const t2 = mkTrack([a, b]); t2.__askedTimeline = a;
    r = await run(t2, { by_days: 3, edge: 'end' });
    ok(!r.error && r.timeline === 'strehg',
       'and with no name it is the timeline whose Ask button was pressed');
    r = await run(mkTrack([a, b]), { by_days: 3 });
    ok(!!r.error && /more than one timeline/.test(r.error), 'with nothing to go on it asks which');

    console.log('\n' + (fails ? fails + ' FAILED' : 'all assertions passed'));
    process.exit(fails ? 1 : 0);
})();
