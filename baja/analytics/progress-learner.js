function () {

    // A progress bar that gets better every time it is used.
    //
    // A long tool (Indication market: Claude plus live web search, a few minutes) can say
    // very little about how far along it is. What it CAN say is which phase it is in --
    // "Checking earlier research", "Searching: <query>", "Organising the findings" -- and
    // those phases arrive in the same order every run. So the bar is not driven by a
    // guess at a percentage; it is driven by WHEN each phase started, measured against
    // how long that phase has taken before.
    //
    // What is learned, per task and per variant:
    //   totals[]            how long finished runs took, in seconds
    //   marks[phase][]      the FRACTION of the run at which each phase started
    //   counts[phase][]     how many times a repeating phase fired (searches per run)
    //
    // What that buys, in order of how much it matters:
    //   * a real estimate of the whole run instead of a fixed guess
    //   * the phase the run is in pins the bar between two learned checkpoints, so it
    //     cannot race ahead and then sit at 95% -- inside a phase it interpolates, and at
    //     the phase boundary it SNAPS to something measured
    //   * a checkpoint reached late or early re-estimates the total mid-run (a run whose
    //     search phase started at 40 s when it usually starts at 20 s is going to be long)
    //   * "about 2 minutes left" that is worth reading, with the sample count behind it
    //
    // THE HISTORY IS GLOBAL, AND IT IS ALL OF IT.
    //
    // Two things this used to get wrong. It kept what it learned in localStorage, which
    // made the history per-person and per-browser: every new visitor, and every cleared
    // browser, started the bar back at the written-in prior, and one person's twenty runs
    // taught nobody else anything. And it estimated from the last dozen runs only. Both
    // are fixed here: the history lives on the server (GET/POST /progress-stats), one
    // history per MENU ITEM -- the task key, 'indication-market' or 'repurpose' -- shared
    // by everyone, and every stored run counts towards the medians, not just the recent
    // ones. Within a task, a cached answer and a fresh search still keep separate
    // histories (the variant), because they are not the same length of work.
    //
    // Nothing here blocks or waits. The bar starts from the last global snapshot this
    // browser saw (localStorage, now a cache rather than the record); the live global
    // history is fetched in the background and swapped in the moment it lands, mid-run if
    // that is when it arrives. If the server cannot be reached the cache carries the run
    // and the finished run is simply not contributed. The bar never reaches 100% until
    // the task actually finishes, and never goes backwards.

    const KEY = 'baja.progress.v2';
    const MAX_SAMPLES = 500;     // kept per key, locally and on the server
    const PRIOR_WEIGHT = 2;      // the written-in guess counts for two runs
    const CEILING = 0.985;       // the bar stops here until finish() says otherwise

    const apiHost = () => {
        try { return window['env']['apiUrl']; } catch (e) { return ''; }
    };

    const nowMs = () => Date.now();
    const isNum = (v) => typeof v === 'number' && isFinite(v);
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

    // localStorage is no longer the record -- it is a CACHE of the last global snapshot
    // this browser saw, so the first frames of a run are drawn from measurement instead of
    // the written-in prior while the real history is on its way.
    function load() {
        try {
            const s = localStorage.getItem(KEY);
            const db = s ? JSON.parse(s) : null;
            return (db && typeof db === 'object') ? db : {};
        } catch (e) { return {}; }
    }

    function save(db) {
        try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { }
    }

    // ---- the global history ----------------------------------------------------------

    // The server's answer wins outright for the keys it returns: it has every run anyone
    // has finished, and this browser's cache is a strictly older view of the same thing.
    function adopt(db, stats) {
        if (!stats || typeof stats !== 'object') return false;
        let any = false;
        Object.keys(stats).forEach((k) => {
            const s = stats[k];
            if (!s || typeof s !== 'object') return;
            db[k] = {
                totals: Array.isArray(s.totals) ? s.totals.filter(isNum) : [],
                marks: (s.marks && typeof s.marks === 'object') ? s.marks : {},
                counts: (s.counts && typeof s.counts === 'object') ? s.counts : {}
            };
            any = true;
        });
        return any;
    }

    // One request per task even when several bars start at once, and re-asked after a few
    // seconds so a second run in the same sitting sees what the first one just contributed.
    const pending = {};
    const PULL_TTL = 15000;

    function pull(task, db) {
        const host = apiHost();
        if (!host || typeof GETJSON !== 'function') return Promise.resolve(false);
        const p = pending[task];
        if (!p || (nowMs() - p.at) > PULL_TTL) {
            pending[task] = {
                at: nowMs(),
                promise: Promise.resolve()
                    .then(() => GETJSON(host + '/progress-stats?task=' + encodeURIComponent(task)))
                    .then((r) => (r && r.ok && r.stats) ? r.stats : null)
                    .catch(() => null)
            };
        }
        return pending[task].promise.then((stats) => {
            if (!stats) return false;
            const got = adopt(db, stats);
            if (got) { const cache = load(); adopt(cache, stats); save(cache); }
            return got;
        }).catch(() => false);
    }

    // A finished run, handed to everyone else. Fire and forget: a bar that waited on this
    // would be a bar that makes the task look slower than it is.
    function contribute(task, variant, total, marks, counts) {
        const host = apiHost();
        if (!host || typeof POSTJSON !== 'function') return;
        try {
            const r = POSTJSON({ task, variant, total, marks, counts }, host + '/progress-stats');
            if (r && typeof r.catch === 'function') r.catch(() => { });
        } catch (e) { }
    }

    function bucket(db, key) {
        let b = db[key];
        if (!b || typeof b !== 'object') b = db[key] = {};
        if (!Array.isArray(b.totals)) b.totals = [];
        if (!b.marks || typeof b.marks !== 'object') b.marks = {};
        if (!b.counts || typeof b.counts !== 'object') b.counts = {};
        return b;
    }

    function push(arr, v) {
        if (!isNum(v)) return arr;
        arr.push(v);
        while (arr.length > MAX_SAMPLES) arr.shift();
        return arr;
    }

    // EVERY run that was ever recorded, not a recent window. The bar is asked to be right
    // about a task, and a task's length is a property of the task; a person who happens to
    // be the thirteenth caller should not have the first twelve runs thrown away for them.
    // The median is what makes this safe to do -- see below -- and forget() is how a real
    // change in how long the work takes gets cleared out deliberately.
    const hist = (a) => (a || []).filter(isNum);

    // The median, not the mean: one run that hit a slow search or a retry should not drag
    // every later estimate with it, and with a handful of samples the mean is exactly what
    // an outlier moves most.
    function median(a) {
        const b = (a || []).filter(isNum).slice().sort((x, y) => x - y);
        if (!b.length) return null;
        const h = b.length >> 1;
        return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
    }

    // How far apart the samples are, as a fraction of the middle one. Three runs that all
    // took about five minutes say more than three runs of 40 s, 5 min and 20 min.
    function spread(samples) {
        const b = (samples || []).filter(isNum).slice().sort((x, y) => x - y);
        if (b.length < 2) return 1;
        const m = median(b);
        if (!m) return 1;
        return (b[b.length - 1] - b[0]) / m;
    }

    // The first run has no history, so the written-in prior carries it; by the third or
    // fourth run the measurements have taken over. Shrinkage rather than a switch, so the
    // estimate does not lurch the moment the first sample lands -- EXCEPT when the runs
    // agree with each other and disagree with the prior, which is the case that matters:
    // a cached answer comes back in six seconds against a prior written for three minutes,
    // and holding on to the prior there would be a bar that is wrong on purpose.
    function blend(samples, prior, priorWeight) {
        const recent = hist(samples);
        const m = median(recent);
        if (m == null) return prior;
        if (recent.length >= 3 && spread(recent) < 0.4) return m;
        const w = recent.length / (recent.length + (priorWeight == null ? PRIOR_WEIGHT : priorWeight));
        return w * m + (1 - w) * prior;
    }

    function etaText(sec, overrun, known) {
        if (overrun) return 'a little longer than usual';
        if (!known) return 'estimating…';
        if (!isNum(sec) || sec <= 0) return 'almost there';
        if (sec < 10) return 'a few seconds left';
        if (sec < 60) return 'about ' + (Math.round(sec / 5) * 5) + ' seconds left';
        const m = sec / 60;
        if (m < 1.75) return 'about a minute left';
        if (m < 10) return 'about ' + Math.round(m) + ' minutes left';
        return 'over ' + Math.floor(m) + ' minutes left';
    }

    // ---- one run --------------------------------------------------------------------
    // spec: {
    //   variant:      the starting key ('auto'), refined by variantFrom below
    //   variantFrom:  (marks) => key            -- decided when the run ends, and
    //                                              re-checked live so the estimate can
    //                                              switch to the right history mid-run
    //   priorSeconds: how long to assume before anything has been measured
    //   phases: [{ id, label, match: RegExp, at: 0..1 (prior start fraction),
    //              repeat: true, expect: n }]
    // }
    function begin(task, spec) {
        const s = spec || {};
        const phases = (s.phases || []).filter(p => p && p.id);
        // One number, or one per variant ({ fresh: 200, cached: 8 }): a cache hit and a
        // fresh search are not the same task and should not start from the same guess.
        const priorFor = (v) => {
            if (isNum(s.priorSeconds)) return s.priorSeconds;
            const m = s.priorSeconds || {};
            return isNum(m[v]) ? m[v] : (isNum(m.default) ? m.default : 90);
        };
        // The cache first so there is something to draw from immediately, then the global
        // history over the top of it as soon as it arrives. state() reads the buckets on
        // every tick, so a history that lands three seconds into a run simply takes over
        // from there -- no restart, no jump backwards (the bar cannot go backwards).
        const db = load();
        pull('' + (task || 'task'), db);

        const run = {
            task: '' + (task || 'task'),
            variant: '' + (s.variant || 'default'),
            t0: nowMs(),
            marks: {},        // phase id -> seconds into the run when it started
            counts: {},       // phase id -> how many times it fired
            order: [],        // phase ids in the order they were seen
            phase: null,
            detail: '',
            reported: 0,      // the tool's own 0-100, used only as a floor
            shown: 0,         // last fraction handed out: the bar never goes backwards
            ended: false
        };

        const keyFor = (v) => run.task + '|' + v;
        // The bucket for the variant in hand -- and, while the variant is still unknown
        // (every run starts that way), the one with the most runs behind it, so the first
        // seconds of a run are not spent with no estimate at all.
        const cur = () => {
            const own = bucket(db, keyFor(run.variant));
            if (own.totals.length) return own;
            let best = own;
            Object.keys(db).forEach((k) => {
                if (k.indexOf(run.task + '|') !== 0) return;
                const b = bucket(db, k);
                if (b.totals.length > best.totals.length) best = b;
            });
            return best;
        };

        const phaseAt = (id) => {
            const p = phases.find(q => q.id === id);
            const learned = median(hist(cur().marks[id]));
            if (learned != null) return clamp(learned, 0, 0.98);
            return p && isNum(p.at) ? clamp(p.at, 0, 0.98) : null;
        };

        const nextAt = (id) => {
            const i = phases.findIndex(q => q.id === id);
            for (let k = i + 1; k < phases.length; k++) {
                const f = phaseAt(phases[k].id);
                if (f != null) return f;
            }
            return 1;
        };

        // The estimate of the whole run: history (or the prior) first, then corrected by
        // where the current phase actually started. A checkpoint late in the run says more
        // about the total than one at the very beginning, so it is weighted by how far in
        // it sits.
        const estimate = () => {
            const b = cur();
            const base = blend(b.totals, priorFor(run.variant));
            const id = run.phase;
            if (!id) return { seconds: base, samples: b.totals.length };
            const f = phaseAt(id), t = run.marks[id];
            if (f == null || !isNum(t) || f < 0.05 || t < 2) return { seconds: base, samples: b.totals.length };
            const implied = t / f;
            const w = clamp(f, 0.1, 0.8);
            return { seconds: (1 - w) * base + w * implied, samples: b.totals.length };
        };

        const api = {
            // A message from the tool. The first phase whose pattern matches takes it; a
            // repeating phase (one "Searching:" line per query) counts instead of moving on.
            message(text) {
                const msg = ('' + (text == null ? '' : text)).trim();
                if (!msg) return api;
                run.detail = msg;
                const p = phases.find(q => q.match && q.match.test(msg));
                if (!p) return api;
                // PHASES ONLY GO FORWARD. A later message can mention an earlier phase by
                // name -- "No genetics in the earlier research: looking up the genes" says
                // "earlier research", which is the FIRST phase's words -- and taking that
                // at face value would walk the bar backwards and poison what is learned
                // about where each phase starts.
                const here = phases.findIndex(q => q.id === p.id);
                const at = run.phase ? phases.findIndex(q => q.id === run.phase) : -1;
                if (here < at) return api;
                const elapsed = (nowMs() - run.t0) / 1000;
                run.counts[p.id] = (run.counts[p.id] || 0) + 1;
                if (run.phase !== p.id) {
                    run.phase = p.id;
                    run.order.push(p.id);
                    if (!isNum(run.marks[p.id])) run.marks[p.id] = elapsed;
                    // The variant can be known mid-run -- a cached answer never reaches the
                    // search phase -- and knowing it swaps in the right history at once.
                    if (typeof s.variantFrom === 'function') {
                        try {
                            const v = s.variantFrom(run.marks, run.order);
                            if (v && v !== run.variant) run.variant = '' + v;
                        } catch (e) { }
                    }
                }
                return api;
            },

            // The tool's own percentage. It is coarse (2, 5, 10, 16, ... 85, 95) and jumps,
            // so it is a FLOOR, never the bar itself: it can pull the bar forward when the
            // tool knows something the clock does not, and never pushes it back.
            progress(p) {
                const v = Number(p);
                if (isNum(v)) run.reported = clamp(Math.max(run.reported, v), 0, 100);
                return api;
            },

            // What to draw, now.
            state() {
                const elapsed = (nowMs() - run.t0) / 1000;
                const est = estimate();
                const b = cur();
                const id = run.phase;
                const p = phases.find(q => q.id === id) || null;

                let frac;
                if (!id) {
                    // Before the first phase: the clock against the estimate, capped at
                    // wherever the first phase is expected to start.
                    const first = phases.length ? (phaseAt(phases[0].id) || 0.05) : 0.05;
                    frac = Math.min(first, elapsed / Math.max(1, est.seconds));
                } else {
                    const f0 = phaseAt(id) == null ? 0 : phaseAt(id);
                    const f1 = Math.max(f0 + 0.01, nextAt(id));
                    const span = Math.max(0.5, est.seconds * (f1 - f0));
                    let inside = clamp((elapsed - (run.marks[id] || 0)) / span, 0, 1);
                    // A repeating phase knows more than the clock does: eight of the usual
                    // twelve searches done is eight twelfths of the phase, whatever the time.
                    if (p && p.repeat) {
                        const expect = median(hist(b.counts[id])) || (isNum(p.expect) ? p.expect : null);
                        const seen = run.counts[id] || 0;
                        if (expect && expect > 0) inside = Math.max(inside, clamp(seen / expect, 0, 0.98));
                    }
                    frac = f0 + inside * (f1 - f0);
                }

                frac = Math.max(frac, (run.reported / 100) * 0.98);
                frac = clamp(frac, 0, CEILING);
                if (frac < run.shown) frac = run.shown;          // never backwards
                run.shown = frac;

                // THE BAR'S OWN RATE, against the history. A run that is two fifths done
                // after four minutes is not finishing in five, whatever the median of the
                // last dozen runs says. The further along the bar is, the more its own
                // rate is worth; early on it says almost nothing and is nearly ignored.
                let total = est.seconds;
                if (frac > 0.08) {
                    const implied = elapsed / frac;
                    const w = clamp(frac, 0, 0.7);
                    total = (1 - w) * total + w * implied;
                }

                // A time remaining that jumps about is worse than one that is a little
                // stale: it is read as the thing being broken. It follows the estimate
                // down freely and only lets it rise when the rise is big enough to be
                // real (a quarter as long again), which is the case worth being told about.
                let remaining = total - elapsed;
                if (!isNum(run.remainShown)) run.remainShown = remaining;
                else if (remaining <= run.remainShown || remaining > run.remainShown * 1.25) run.remainShown = remaining;
                else run.remainShown = Math.max(0, run.remainShown - Math.max(0, elapsed - (run.remainAt || 0)));
                run.remainAt = elapsed;
                remaining = run.remainShown;

                // Overrun sticks until the next phase: flipping between "10 seconds left"
                // and "longer than usual" every tick is the flapping above in words.
                if (remaining <= 0 && est.samples > 0) run.overrunPhase = id || '-';
                else if (run.overrunPhase && run.overrunPhase !== (id || '-')) run.overrunPhase = null;
                const overrun = !!run.overrunPhase;
                const known = est.samples > 0 || !!id;

                return {
                    fraction: frac,
                    percent: Math.round(frac * 100),
                    elapsed,
                    remaining: Math.max(0, remaining),
                    estimate: total,
                    samples: est.samples,
                    phase: id,
                    label: (p && p.label) || (s.label || 'Working'),
                    detail: run.detail,
                    eta: etaText(remaining, overrun, known),
                    // Worth showing once there is history: it says why the estimate is
                    // trustworthy, and that it is still learning when it is not.
                    basis: est.samples > 0
                        ? ('from ' + est.samples + ' earlier run' + (est.samples === 1 ? '' : 's'))
                        : 'first run: learning how long this takes'
                };
            },

            // The run ended. Only a run that FINISHED teaches anything: one that failed or
            // was cancelled stopped for a reason that has nothing to do with how long the
            // work takes, and folding it in would drag every later estimate down.
            finish(ok) {
                if (run.ended) return api;
                run.ended = true;
                if (!ok) return api;
                const total = (nowMs() - run.t0) / 1000;
                if (!(total > 0.25)) return api;                  // nothing to learn from
                if (typeof s.variantFrom === 'function') {
                    try { const v = s.variantFrom(run.marks, run.order); if (v) run.variant = '' + v; } catch (e) { }
                }
                const b = bucket(db, keyFor(run.variant));
                const marks = {}, counts = {};
                push(b.totals, total);
                Object.keys(run.marks).forEach((id) => {
                    const f = run.marks[id] / total;
                    if (f >= 0 && f <= 1) {
                        if (!Array.isArray(b.marks[id])) b.marks[id] = [];
                        push(b.marks[id], f);
                        marks[id] = f;
                    }
                });
                Object.keys(run.counts).forEach((id) => {
                    const p = phases.find(q => q.id === id);
                    if (!p || !p.repeat) return;
                    if (!Array.isArray(b.counts[id])) b.counts[id] = [];
                    push(b.counts[id], run.counts[id]);
                    counts[id] = run.counts[id];
                });
                save(db);
                // And to the history everyone else reads. The local copy above is only so
                // that a second run in this browser does not have to wait for the round
                // trip to know what the first one cost.
                contribute(run.task, run.variant, total, marks, counts);
                return api;
            },

            // For the finish: what the run actually cost, to show and to compare with.
            summary() {
                const total = (nowMs() - run.t0) / 1000;
                const b = cur();
                const was = median(hist(b.totals).slice(0, -1));
                return { seconds: total, variant: run.variant, previousTypical: was };
            }
        };

        return api;
    }

    function digest(db, task) {
        const out = {};
        Object.keys(db).forEach((k) => {
            if (task && k.indexOf(task + '|') !== 0) return;
            const b = db[k];
            out[k] = {
                runs: (b.totals || []).length,
                typicalSeconds: median(hist(b.totals)),
                phases: Object.keys(b.marks || {}).map(id => ({ id, at: median(b.marks[id]) }))
            };
        });
        return out;
    }

    // What this browser last saw, without asking the server -- for a check by hand.
    function stats(task) {
        return digest(load(), task);
    }

    // What everyone's runs say, live. This is the real answer; stats() is the cached one.
    function globalStats(task) {
        const db = {};
        return pull('' + (task || ''), db).then(() => digest(db, task));
    }

    // Drop the local cache. The global history is NOT cleared by this -- it is everyone's,
    // and one person deciding the estimates have gone stale is not grounds for throwing
    // away every run anyone has done. The server file is the place to do that deliberately.
    function forget(task) {
        const db = load();
        Object.keys(db).forEach((k) => {
            if (!task || k.indexOf(task + '|') === 0) delete db[k];
        });
        save(db);
        Object.keys(pending).forEach((k) => { if (!task || k === task) delete pending[k]; });
    }

    return { begin, stats, globalStats, forget, _median: median, _blend: blend, _etaText: etaText };
}
