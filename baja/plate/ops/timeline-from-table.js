function (pm, o) {

    // A TIMELINE OF BATCHES, BUILT FROM A TABLE OF STEPS.
    //
    // "generate a timeline that uses this table to generate as many batches as I can in 12
    // months", asked from a table whose rows are the steps of one batch and how long each
    // takes. It used to make an empty timeline: new_timeline knows two dates and a name, and
    // nothing read the table.
    //
    // NO MODEL READS THE TABLE. A step is a row with a name and a length of time, and a
    // length of time is a number and a unit, which can be found by looking:
    //   - the unit is in the cell ("4 weeks"), in another cell of the row ("min"), or in
    //     the heading of the number's column ("Time (min)");
    //   - the column of lengths is the one where the most rows have a number, with a
    //     heading like Time or Duration preferred;
    //   - a row with a number and no unit takes the unit most rows use;
    //   - a row called Total or Sum is not a step.
    // The schedule is then arithmetic, and the same table always gives the same timeline.
    //
    // ONE BATCH IS THE STEPS END TO END. Its length is their sum, and batches run one after
    // another from the start date for as long as a whole one still fits before the end.
    // `parallel` says how many can run at once (three fermenters is 3): each line runs its
    // own batches back to back, and the lines start staggered by an equal share of a batch.
    // Time is counted round the clock; nothing here knows about working hours.
    //
    // WHAT GOES ON THE TIMELINE, for each batch:
    //   - an INTERVAL for every step long enough to see (a day, or 1/400 of the period,
    //     whichever is longer), named "Batch 3: fermentation";
    //   - ONE INTERVAL for each run of shorter steps in a row, named from the first to the
    //     last ("Batch 3: Gather ingredients to Document batch"), because eleven steps of a
    //     few minutes each are eleven marks on one pixel of a year. `detail: steps` gives
    //     every step its own interval instead;
    //   - a MILESTONE for a step that takes no time at all, where it falls;
    //   - a MILESTONE when the batch is done.
    //
    // A NEW TIMELINE, unless one is named. It is made by new-timeline.js like any other and
    // covers the period exactly. A timeline named in `timeline` is added to instead, and
    // grown to take the batches in.
    //
    // o: { table?, plate?, months?, start?, title?, timeline?, parallel?, detail? }
    // Resolves { timeline, batches, batch_takes, steps, intervals, milestones, from, to } or { error }.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || typeof pt.__tlIs !== 'function' || typeof pt.__tlMsToX !== 'function') { resolve({ error: 'Timelines are not available here.' }); return; }
            let t = (o && o.plate && Array.isArray(o.plate.wells)) ? o.plate : null;
            if (!t) {
                const IO = await exec('baja/plate/ops/column-io.js');
                const picked = IO.pickTable(pt, o && o.table);
                if (picked.error) { resolve({ error: picked.error }); return; }
                t = picked.table;
            }
            const cols = t.wells.length, rows = t.wells[0] ? t.wells[0].length : 0;
            if (!cols || !rows) { resolve({ error: '"' + t.name + '" is empty.' }); return; }

            // ---- a length of time: a number and a unit --------------------------------------
            const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
            const UNITS = [
                [/^(s|sec|secs|second|seconds)$/, 1000, 's'], [/^(m|min|mins|minute|minutes)$/, MIN, 'min'],
                [/^(h|hr|hrs|hour|hours)$/, HOUR, 'h'], [/^(d|day|days)$/, DAY, 'days'],
                [/^(w|wk|wks|week|weeks)$/, 7 * DAY, 'weeks'], [/^(mo|mos|month|months)$/, 30.4375 * DAY, 'months'],
                [/^(y|yr|yrs|year|years)$/, 365.25 * DAY, 'years']];
            const unitOf = (s) => { const k = ('' + (s == null ? '' : s)).trim().toLowerCase().replace(/\.$/, ''); for (const u of UNITS) if (u[0].test(k)) return u; return null; };
            // A unit named in a heading: "Time (min)", "Duration, hours", "Minutes".
            const unitIn = (s) => { for (const w of ('' + (s || '')).toLowerCase().split(/[^a-z]+/).filter(Boolean)) { if (w.length < 2) continue; const u = unitOf(w); if (u) return u; } return null; };
            const text = (w) => (w && w.value != null) ? ('' + w.value).trim() : '';
            const isHead = (w, kind) => !!w && (w.skin_type === kind || (w.group && typeof w.group === 'object' && w.group[kind] != null));
            // "5", "1,200", "4 weeks", "10min": the number, and the unit if the cell has one.
            const amount = (s) => {
                const m = /^(-?\d[\d,]*\.?\d*|\.\d+)\s*([A-Za-z.]*)$/.exec(('' + s).trim());
                if (!m) return null;
                const n = Number(m[1].replace(/,/g, ''));
                if (!isFinite(n) || n < 0) return null;
                if (m[2] && !unitOf(m[2])) return null;
                return { n: n, unit: m[2] ? unitOf(m[2]) : null };
            };

            let headRow = -1;
            for (let r = 0; r < Math.min(rows, 3) && headRow < 0; r++) for (let c = 0; c < cols; c++) if (isHead(t.wells[c][r], 'ColumnHeader')) { headRow = r; break; }
            const heading = (c) => headRow >= 0 ? text(t.wells[c][headRow]) : '';
            const first = headRow + 1;

            // The column of lengths, and the column of units if there is one.
            let timeCol = -1, best = -1, unitCol = -1, mostUnits = 0;
            for (let c = 0; c < cols; c++) {
                let nums = 0, units = 0;
                for (let r = first; r < rows; r++) { const s = text(t.wells[c][r]); if (!s) continue; if (amount(s)) nums++; if (unitOf(s)) units++; }
                const score = nums + (/\b(time|duration|length|takes|lasts|lead)\b/i.test(heading(c)) || unitIn(heading(c)) ? 0.5 + rows : 0);
                if (nums > 0 && score > best) { best = score; timeCol = c; }
                if (units > mostUnits) { mostUnits = units; unitCol = c; }
            }
            if (timeCol < 0) {
                resolve({ error: '"' + t.name + '" has no column of times to build batches from. It needs a row for each step, with how long the step takes: a number and a unit, such as 10 min or 4 weeks.' });
                return;
            }
            const colUnit = unitIn(heading(timeCol));
            const nameOf = (r) => {
                for (let c = 0; c < cols; c++) { const w = t.wells[c][r]; if (c !== timeCol && isHead(w, 'RowHeader') && text(w)) return text(w); }
                for (let c = 0; c < cols; c++) { const s = text(t.wells[c][r]); if (c !== timeCol && c !== unitCol && s && !amount(s) && !unitOf(s)) return s; }
                return '';
            };

            // ---- the steps ---------------------------------------------------------------------
            const raw = [];
            for (let r = first; r < rows; r++) {
                const a = amount(text(t.wells[timeCol][r]));
                if (!a) continue;
                const name = nameOf(r);
                if (/^(total|sub\s*total|sum|overall|all steps)\b/i.test(name)) continue;
                const unit = a.unit || (unitCol >= 0 && unitCol !== timeCol ? unitOf(text(t.wells[unitCol][r])) : null) || colUnit;
                raw.push({ row: r, name: name || ('step ' + (raw.length + 1)), n: a.n, unit: unit });
            }
            if (!raw.length) { resolve({ error: '"' + t.name + '" has no steps with a time on them.' }); return; }
            // A step with no unit takes the one most steps use.
            const tally = {};
            for (const s of raw) if (s.unit) tally[s.unit[2]] = (tally[s.unit[2]] || 0) + 1;
            const common = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
            if (!common) {
                resolve({ error: 'The times in "' + t.name + '" have no units, so a batch could be minutes or months long. Put the unit with each time (10 min, 4 weeks), in a Units column, or in the column heading.' });
                return;
            }
            const fallback = UNITS.filter((u) => u[2] === common)[0];
            const guessed = [];
            const steps = raw.map((s) => {
                const u = s.unit || fallback;
                if (!s.unit) guessed.push(s.name);
                return { name: s.name, ms: s.n * u[1], says: s.n + ' ' + u[2] };
            });
            const cycle = steps.reduce((a, s) => a + s.ms, 0);
            if (!(cycle > 0)) { resolve({ error: 'The steps in "' + t.name + '" add up to no time at all.' }); return; }

            const span = (ms) => {
                const parts = [];
                let left = Math.round(ms / 1000) * 1000;
                for (const [size, one, many] of [[7 * DAY, 'week', 'weeks'], [DAY, 'day', 'days'], [HOUR, 'h', 'h'], [MIN, 'min', 'min']]) {
                    const k = Math.floor(left / size);
                    if (k > 0) { parts.push(k + ' ' + (k === 1 ? one : many)); left -= k * size; }
                }
                return parts.length ? parts.slice(0, 3).join(' ') : (Math.round(ms / 1000) + ' s');
            };

            // ---- the period -----------------------------------------------------------------
            const asDate = (v) => {
                const s = ('' + (v == null ? '' : v)).trim();
                if (!s) return null;
                const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
                return isNaN(d.getTime()) ? null : d;
            };
            let start = asDate(o && o.start);
            if (!start) { const now = new Date(); start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
            let months = Number(o && o.months);
            if (!isFinite(months) || months <= 0) months = 12;
            months = Math.min(months, 240);
            const whole = Math.floor(months), part = months - whole;
            const end = new Date(start.getFullYear(), start.getMonth() + whole, start.getDate());
            if (part > 0) end.setTime(end.getTime() + part * 30.4375 * DAY);
            const S = start.getTime(), E = end.getTime(), H = E - S;
            const periodSays = (months === 12 ? '12 months' : (Number(months.toFixed(2)) + (months === 1 ? ' month' : ' months')));

            let lines = Math.floor(Number(o && o.parallel));
            if (!isFinite(lines) || lines < 1) lines = 1;
            lines = Math.min(lines, 50);

            // ---- the batches ----------------------------------------------------------------
            const starts = [];
            for (let j = 0; j < lines; j++) {
                const off = j * cycle / lines;
                const k = Math.floor((H - off) / cycle + 1e-9);
                for (let i = 0; i < k; i++) starts.push(S + off + i * cycle);
            }
            starts.sort((a, b) => a - b);
            if (!starts.length) {
                resolve({ error: 'One batch takes ' + span(cycle) + ', which is longer than ' + periodSays + ', so not one fits. Ask for a longer period.' });
                return;
            }

            // What one batch puts on the timeline: runs of short steps as one interval, long
            // steps as their own, a step of no length as a milestone.
            const every = /^steps?$/i.test('' + ((o && o.detail) || ''));
            const LONG = Math.max(DAY, H / 400);
            const marks = [];
            let run = null, at = 0, long = 0;
            const PALETTE = ['#1aa3bd', '#f59e0b', '#7c3aed', '#16a34a', '#db2777'];
            const closeRun = () => { if (run) { marks.push({ kind: 'interval', from: run.from, to: run.to, name: run.names.length > 1 ? (run.names[0] + ' to ' + run.names[run.names.length - 1]) : run.names[0], color: '#0a2540' }); run = null; } };
            for (const s of steps) {
                if (s.ms === 0) { closeRun(); marks.push({ kind: 'milestone', from: at, to: at, name: s.name }); continue; }
                if (every || s.ms >= LONG) {
                    closeRun();
                    marks.push({ kind: 'interval', from: at, to: at + s.ms, name: s.name, color: s.ms >= LONG ? PALETTE[long++ % PALETTE.length] : '#0a2540' });
                } else {
                    if (!run) run = { from: at, to: at, names: [] };
                    run.to = at + s.ms; run.names.push(s.name);
                }
                at += s.ms;
            }
            closeRun();
            const perBatch = marks.length + 1;
            const CAP = 600;
            if (starts.length * perBatch > CAP) {
                resolve({ error: starts.length.toLocaleString('en-US') + ' batches fit in ' + periodSays + ' (one takes ' + span(cycle) + (lines > 1 ? (', ' + lines + ' at a time') : '')
                    + '). That is too many to draw on one timeline. Ask for a shorter period' + (every ? ', or without every step drawn' : '') + '.' });
                return;
            }

            // ---- the timeline -----------------------------------------------------------------
            const iso = (d) => { const p2 = (v) => (v < 10 ? '0' : '') + v; return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
            const timelines = () => { const all = []; for (const list of [pt.m_plots, pt.plots, pt.root, pt.objects]) { if (!Array.isArray(list)) continue; for (const x of list) if (pt.__tlIs(x) && all.indexOf(x) < 0) all.push(x); } return all; };
            let tl = null, made = false;
            const wanted = ('' + ((o && o.timeline) || '')).trim();
            if (wanted) {
                tl = timelines().filter((x) => ('' + (x.name || '')).trim().toLowerCase() === wanted.toLowerCase())[0] || null;
                if (!tl) { resolve({ error: 'There is no timeline called "' + wanted + '" here. Leave the timeline out and a new one is made.' }); return; }
            } else {
                const title = ('' + ((o && o.title) || '')).trim() || (('' + t.name).replace(/_/g, ' ') + ' batches');
                const before = timelines();
                const r = await exec('baja/plate/ops/new-timeline.js', pt, { title: title, start: iso(start), end: iso(end) });
                if (r && r.error) { resolve({ error: 'The timeline could not be made: ' + r.error }); return; }
                // The new timeline is put on the canvas a moment after that returns.
                for (let k = 0; k < 80 && !tl; k++) {
                    tl = timelines().filter((x) => before.indexOf(x) < 0)[0] || null;
                    if (!tl) await new Promise((res) => setTimeout(res, 100));
                }
                if (!tl) { resolve({ error: 'The timeline was asked for but did not appear on the canvas, so the batches were not added.' }); return; }
                made = true;
            }
            const lastEnd = starts[starts.length - 1] + cycle;
            try {
                const w = pt.__tlWin(tl);
                if (!made && typeof pt.__tlSetWindow === 'function' && (S < w.startMs || lastEnd > w.endMs)) pt.__tlSetWindow(tl, Math.min(w.startMs, S), Math.max(w.endMs, lastEnd));
            } catch (e) { }

            if (!tl.scatterData) tl.scatterData = { points: [] };
            if (!Array.isArray(tl.scatterData.points)) tl.scatterData.points = [];
            let intervals = 0, milestones = 0;
            starts.forEach((b0, i) => {
                const tag = 'Batch ' + (i + 1);
                for (const m of marks) {
                    if (m.kind === 'interval') {
                        const a = new Date(b0 + m.from), b = new Date(b0 + m.to);
                        tl.scatterData.points.push({ x: pt.__tlMsToX(tl, b.getTime()), startX: pt.__tlMsToX(tl, a.getTime()), y: 0.1, type: 'interval',
                            name: tag + ': ' + m.name, color: m.color, date: b, __startDate: a });
                        intervals++;
                    } else {
                        const d = new Date(b0 + m.from);
                        tl.scatterData.points.push({ x: pt.__tlMsToX(tl, d.getTime()), y: 0.1, type: 'milestone', name: tag + ': ' + m.name, color: 'red', date: d });
                        milestones++;
                    }
                }
                const d = new Date(b0 + cycle);
                tl.scatterData.points.push({ x: pt.__tlMsToX(tl, d.getTime()), y: 0.1, type: 'milestone', name: tag + ' done', color: 'red', date: d });
                milestones++;
            });
            try { if (pt.__collab && !pt.__collab.holds(tl)) pt.__collab.acquire(tl); } catch (e) { }
            try { if (tl.grid && tl.grid.rescale) tl.grid.rescale(); } catch (e) { }
            try { if (pt.wake) pt.wake(); } catch (e) { }

            const n = starts.length;
            try {
                pt.setMessage(n + (n === 1 ? ' batch fits' : ' batches fit') + ' in ' + periodSays + ': one takes ' + span(cycle)
                    + (lines > 1 ? (', ' + lines + ' at a time') : ', one after another') + '. Put on "' + tl.name + '" as ' + intervals + ' intervals and ' + milestones + ' milestones.'
                    + (guessed.length ? (' No unit on ' + guessed.slice(0, 3).join(', ') + (guessed.length > 3 ? ' and others' : '') + ': read as ' + common + '.') : ''), 14);
            } catch (e) { }
            resolve({ timeline: tl.name, made: made, table: '' + t.name, batches: n, batch_takes: span(cycle), steps: steps.map((s) => s.name + ' (' + s.says + ')'),
                intervals: intervals, milestones: milestones, from: iso(start), to: iso(end), parallel: lines,
                unit_assumed: guessed.length ? { unit: common, steps: guessed } : undefined });
        } catch (e) {
            resolve({ error: 'Could not build that timeline: ' + (e && e.message ? e.message : e) });
        }
    });
}
