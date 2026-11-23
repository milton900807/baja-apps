// A TIMELINE OF BATCHES, BUILT FROM A TABLE OF STEPS.
//
//     node tools/test/timeline-from-table.js        (needs jsdom)
//
// "generate a timeline that uses this table to generate as many batches as I can in 12
// months", asked from a table of steps and times, made an empty timeline. It now reads the
// table, works out how long a batch takes, fits as many as go in the period, and puts
// intervals and milestones on a new timeline. No model is involved, so the whole of it is
// tested here: the table reading, the count, the dates, and the route from the Ask box.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://gene.clinic/' });
global.window = dom.window; global.document = dom.window.document;
window.env = { apiUrl: '' };
const core = fs.readFileSync('lib/core.js', 'utf8');
const AF = Object.getPrototypeOf(async function () { }).constructor;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const trackSrc = fs.readFileSync('baja/plate/plate-track.js', 'utf8');
const method = (name) => {
    const m = new RegExp('^\\s*(?:async\\s+)?' + name + '\\s*\\(', 'm').exec(trackSrc);
    let i = trackSrc.indexOf('{', m.index), d = 0, j = i;
    for (;; j++) { const ch = trackSrc[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    return trackSrc.slice(i + 1, j);
};
const D = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const mkTimeline = (name, start, end) => ({ name, type: 'timeline', startDate: D(start), endDate: D(end), drawPlot() { }, scatterData: { points: [] }, grid: { xmin: 0, xmax: 1000, rescale() { } } });

let current = null, madeWith = null, pickAsked = 0, makeIt = true, ranFrom = null;
const load = async (p, ...a) => {
    // The real new-timeline hands over to the canvas, which puts the timeline on a moment
    // AFTER it has returned. So does this.
    if (/new-timeline\.js$/.test(p)) { madeWith = a[1]; if (makeIt) setTimeout(() => current.m_plots.push(mkTimeline(a[1].title, a[1].start, a[1].end)), 150); return { title: a[1].title }; }
    if (/menu-pick\.py$/.test(p)) { pickAsked++; return { status: 'OK', pick: null, alternatives: [], unsupported: 'x' }; }
    if (/modal-shield\.js$/.test(p)) return { release() { } };
    if (/working\.js$/.test(p)) return { done() { }, finish() { }, fail() { } };
    if (/timeline-from-table\.js$/.test(p) && ranFrom) { ranFrom.push(a[1]); return ranFrom.reply || {}; }
    const f = await new AF('exec', 'args', core + '\nreturn (' + fs.readFileSync(p, 'utf8') + ')')(load, {});
    return f(...a);
};
global.lion_engine = { exec: (p, ...a) => load(p, ...a), getIonFunction: () => () => { }, createIonFunction: (f) => f };

const table = (name, rows) => {
    const wells = [];
    for (let c = 0; c < rows[0].length; c++) wells.push(rows.map((r, ri) => ({ value: r[c], group: ri === 0 ? { ColumnHeader: 1 } : (c === 0 ? { RowHeader: 1 } : {}), skin_type: ri === 0 ? 'ColumnHeader' : (c === 0 ? 'RowHeader' : undefined) })));
    return { name, wells };
};
const mkTrack = (tables, tls) => {
    const said = [];
    const pt = { root: tables, m_plots: tls || [], selectedPlate: tables[0], said, setMessage: (m) => said.push(m), wake() { },
        getTableByName: (n) => tables.filter((x) => x.name === n)[0] || null,
        __tlIs(o) { return !!(o && typeof o.drawPlot === 'function' && o.type === 'timeline' && o.startDate && o.endDate && o.grid); } };
    pt.__tlWin = new Function('o', method('__tlWin')).bind(pt);
    pt.__tlMsToX = new Function('o', 'ms', method('__tlMsToX')).bind(pt);
    pt.__tlXToMs = new Function('o', 'xUnits', method('__tlXToMs')).bind(pt);
    pt.__tlStampDates = new Function('o', method('__tlStampDates')).bind(pt);
    pt.__tlSetWindow = new Function('o', 'startMs', 'endMs', method('__tlSetWindow')).bind(pt);
    current = pt;
    return pt;
};
// The table in the report: eleven steps, ten in minutes and one in weeks.
const batch = () => table('time_for_batch', [['Step', 'Time', 'Notes', 'Units'],
    ['Gather ingredients', 5, 'Collect and measure all materials', 'min'], ['Preheat equipment', 10, 'Bring to operating temperature', 'min'],
    ['Mix dry components', 8, 'Blend powders uniformly', 'min'], ['Add liquid ingredients', 12, 'Incorporate while mixing', 'min'],
    ['Blend mixture', 15, 'Mix until homogeneous', 'min'], ['Quality check', 5, 'Verify consistency and specs', 'min'],
    ['Transfer to containers', 10, 'Fill and seal units', 'min'], ['Label batch', 3, 'Apply identification codes', 'min'],
    ['Clean equipment', 12, 'Sanitize for next batch', 'min'], ['Document batch', 5, 'Record production data', 'min'],
    ['fermentation', 4, '', 'weeks']]);
const run = (pt, args) => load('baja/plate/ops/timeline-from-table.js', pt, args);
const MIN = 60000, DAY = 86400000;

(async () => {
    // ---- the request in the report -----------------------------------------------------------
    let pt = mkTrack([batch()]);
    let r = await run(pt, { table: 'time_for_batch', months: 12, start: '2026-11-23' });
    ok(!r.error, 'it runs: ' + JSON.stringify(r).slice(0, 200));
    ok(r.batch_takes === '4 weeks 1 h 25 min', 'one batch is the steps end to end: ' + r.batch_takes);
    const cycle = 28 * DAY + 85 * MIN;
    const fit = Math.floor((D('2027-11-23') - D('2026-11-23')) / cycle);
    ok(r.batches === fit && fit === 13, 'as many whole batches as fit in the 12 months: ' + r.batches);
    ok(madeWith.title === 'time for batch batches' && madeWith.start === '2026-11-23' && madeWith.end === '2027-11-23', 'a new timeline is made for the period, named from the table: "' + madeWith.title + '"');
    const tl = pt.m_plots[0];
    ok(tl && r.timeline === tl.name && r.made === true, 'and it is waited for: it arrives on the canvas after the call that makes it returns');
    const pts = tl.scatterData.points;
    const ints = pts.filter((p) => p.type === 'interval'), miles = pts.filter((p) => p.type === 'milestone');
    ok(ints.length === 26 && miles.length === 13 && r.intervals === 26 && r.milestones === 13, 'two intervals and a milestone for each batch: ' + ints.length + ' intervals, ' + miles.length + ' milestones');
    ok(ints[0].name === 'Batch 1: Gather ingredients to Document batch' && ints[0].__startDate.getTime() === D('2026-11-23').getTime() && ints[0].date - ints[0].__startDate === 85 * MIN,
       'the ten short steps are one interval, 85 minutes long, from the start: ' + ints[0].name);
    ok(ints[1].name === 'Batch 1: fermentation' && ints[1].__startDate.getTime() === ints[0].date.getTime() && ints[1].date - ints[1].__startDate === 28 * DAY && ints[1].color !== ints[0].color,
       'fermentation is its own interval, four weeks, starting where the short steps end, in its own colour');
    ok(miles[0].name === 'Batch 1 done' && miles[0].date.getTime() === D('2026-11-23').getTime() + cycle, 'and the batch ends with a milestone');
    ok(ints[2].name === 'Batch 2: Gather ingredients to Document batch' && ints[2].__startDate.getTime() === miles[0].date.getTime(), 'the next batch starts when that one is done');
    ok(miles[12].name === 'Batch 13 done' && miles[12].date <= D('2027-11-23'), 'the last one finishes inside the period: ' + miles[12].date.toDateString());
    ok(pts.every((p) => Math.abs(p.x - pt.__tlMsToX(tl, p.date.getTime())) < 1e-6 && (p.type !== 'interval' || (p.startX < p.x && Math.abs(p.startX - pt.__tlMsToX(tl, p.__startDate.getTime())) < 1e-6))),
       'every one sits on the timeline at its own date');
    ok(/13 batches fit in 12 months: one takes 4 weeks 1 h 25 min, one after another/.test(pt.said.join(' ')) && /26 intervals and 13 milestones/.test(pt.said.join(' ')), 'and it says what it did: ' + pt.said[0]);

    // ---- other ways to ask -------------------------------------------------------------------
    pt = mkTrack([batch()]);
    r = await run(pt, { months: 6, start: '2026-11-23' });
    ok(r.batches === 6 && r.table === 'time_for_batch', 'six months holds six, and with no table named the selected one is used');
    pt = mkTrack([batch()]);
    r = await run(pt, { months: 12, start: '2026-11-23', parallel: 3 });
    ok(r.batches === 37 && r.parallel === 3, 'three at a time, staggered by a third of a batch, holds 13 + 12 + 12: ' + r.batches);
    pt = mkTrack([batch()]);
    r = await run(pt, { months: 3, start: '2026-11-23', detail: 'steps' });
    ok(r.batches === 3 && r.intervals === 33 && pt.m_plots[0].scatterData.points[1].name === 'Batch 1: Preheat equipment', 'asked for every step, each is its own interval: ' + r.intervals);
    const have = mkTimeline('Batch Schedule', '2026-11-23', '2027-01-31');
    pt = mkTrack([batch()], [have]);
    madeWith = null;
    r = await run(pt, { months: 12, start: '2026-11-23', timeline: 'batch schedule' });
    ok(r.made === false && madeWith === null && have.scatterData.points.length === 39 && have.endDate >= have.scatterData.points[38].date, 'a timeline that is named is added to and grown, and no new one is made');
    r = await run(pt, { timeline: 'nope' });
    ok(/no timeline called "nope"/.test(r.error || ''), 'a named timeline that is not there is said');

    // ---- how the table is read ---------------------------------------------------------------
    pt = mkTrack([table('proc', [['Step', 'Duration'], ['Mix', '2 h'], ['Rest', '3 days'], ['Ship', 0], ['Total', '74 h']])]);
    r = await run(pt, { months: 1, start: '2026-01-01' });
    ok(r.batch_takes === '3 days 2 h' && r.batches === 10, 'units in the cells themselves are read, and a Total row is not a step: ' + r.batch_takes + ', ' + r.batches + ' batches');
    const names = pt.m_plots[0].scatterData.points.slice(0, 4).map((p) => p.type + ' ' + p.name).join(' | ');
    ok(names === 'interval Batch 1: Mix | interval Batch 1: Rest | milestone Batch 1: Ship | milestone Batch 1 done', 'a step that takes no time is a milestone where it falls: ' + names);
    pt = mkTrack([table('proc', [['Step', 'Time (hours)'], ['Mix', 2], ['Rest', 46]])]);
    r = await run(pt, { months: 1, start: '2026-01-01' });
    ok(r.batch_takes === '2 days' && r.batches === 15, 'a unit in the column heading is read: ' + r.batch_takes);
    pt = mkTrack([table('proc', [['Step', 'Time', 'Units'], ['Mix', 2, 'days'], ['Rest', 5, ''], ['Pack', 1, 'days']])]);
    r = await run(pt, { months: 1, start: '2026-01-01' });
    ok(r.batch_takes === '1 week 1 day' && r.unit_assumed.unit === 'days' && r.unit_assumed.steps.join() === 'Rest' && /No unit on Rest: read as days/.test(pt.said.join(' ')),
       'a step with no unit takes the one the others use, and that is said');
    pt = mkTrack([table('proc', [['Step', 'Time'], ['Mix', 2], ['Rest', 5]])]);
    r = await run(pt, { months: 1 });
    ok(/have no units/.test(r.error || '') && pt.m_plots.length === 0, 'times with no units anywhere are refused, and no timeline is made: ' + r.error);
    pt = mkTrack([table('people', [['Name', 'Role'], ['Ann', 'Brewer']])]);
    r = await run(pt, { months: 1 });
    ok(/no column of times/.test(r.error || ''), 'a table with no times is refused, with what it would need');
    pt = mkTrack([batch()]);
    r = await run(pt, { months: 0.5, start: '2026-11-23' });
    ok(/longer than 0.5 months, so not one fits/.test(r.error || '') && pt.m_plots.length === 0, 'a period shorter than one batch is refused: ' + r.error);
    pt = mkTrack([table('fast', [['Step', 'Time', 'Units'], ['Mix', 30, 'min']])]);
    r = await run(pt, { months: 12, start: '2026-01-01' });
    ok(/17,520 batches fit in 12 months/.test(r.error || '') && /too many to draw/.test(r.error) && pt.m_plots.length === 0, 'thousands of batches are counted but not drawn: ' + r.error);
    pt = mkTrack([batch()]); makeIt = false;
    const t0 = Date.now(); const realSet = global.setTimeout;
    global.setTimeout = (f, ms) => realSet(f, Math.min(ms, 1));
    r = await run(pt, { months: 12 });
    global.setTimeout = realSet; makeIt = true;
    ok(/did not appear on the canvas/.test(r.error || ''), 'if the timeline never arrives, that is said and nothing is added');

    // ---- from the Ask box on the table -------------------------------------------------------
    const menus = [{ label: 'Draw', items: [{ label: 'Timeline', click: () => { } }] }];
    const ask = async (text, ctxTable) => {
        ranFrom = []; pickAsked = 0;
        await load('baja/plate/menu/project-command.js', { menus, text, pm: mkTrack([batch()]), context: ctxTable ? { asked_from: { type: 'table', name: ctxTable } } : null });
        for (let i = 0; i < 12; i++) await new Promise((res) => realSet(res, 0));
        const got = ranFrom; ranFrom = null; return got;
    };
    let got = await ask('generate a timeline that uses this table to generate as many batches as I can in 12 months', 'time_for_batch');
    ok(got.length === 1 && got[0].table === 'time_for_batch' && got[0].months === 12 && got[0].parallel === 1 && pickAsked === 0, 'the request in the report goes straight to it, for that table and 12 months');
    ok(!document.getElementById('baja-project-command'), 'and the card closes when it is done');
    got = await ask('make a timeline called Brew Plan with as many batches as fit in two years with 3 fermenters', 'time_for_batch');
    ok(got.length === 1 && got[0].months === 24 && got[0].title === 'Brew Plan' && got[0].parallel === 3, 'the period, a name and how many at once are read from the words: ' + JSON.stringify(got[0]));
    got = await ask('create a timeline of batches for 6 weeks drawing every step', 'time_for_batch');
    ok(got.length === 1 && Math.abs(got[0].months - 42 / 30.4375) < 1e-9 && got[0].detail === 'steps', 'weeks become months, and "every step" asks for each one drawn');
    got = await ask('add a timeline from now until the end of the year', 'time_for_batch');
    ok(got.length === 0 && pickAsked === 1, 'a plain timeline request is not taken for this');
    ranFrom = []; ranFrom.reply = { error: 'The times in "x" have no units' }; pickAsked = 0;
    await load('baja/plate/menu/project-command.js', { menus, text: 'generate a timeline of batches from this table', pm: mkTrack([batch()]), context: { asked_from: { type: 'table', name: 'x' } } });
    for (let i = 0; i < 12; i++) await new Promise((res) => realSet(res, 0));
    ranFrom = null;
    ok(/That did not happen/.test(document.body.textContent) && /have no units/.test(document.body.textContent), 'a refusal stays on the card with its reason');

    // ---- in the catalogue, for every other way of saying it ---------------------------------
    const CAP = await load('baja/plate/menu/project-capabilities.js');
    const entry = CAP.catalogue().filter((c) => c.name === 'timeline_from_table')[0];
    ok(!!entry && /INSTEAD OF new_timeline/.test(entry.summary), 'the operation is in the catalogue, and says when to use it instead of an empty timeline');
    const v = CAP.validate('timeline_from_table', { months: '12', parallel: '2' });
    ok(v.ok && CAP.preview('timeline_from_table', v.args) === 'build a timeline from this table: as many batches as fit in 12 months from today, 2 at a time', 'and the card describes it: ' + CAP.preview('timeline_from_table', v.args));

    console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
    process.exit(fails ? 1 : 0);
})();
