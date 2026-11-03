function (pt) {

    // THE PROGRAM PLAN, read out of a Baja Project workbook, for a fundraising campaign.
    //
    //   const plan = await exec('fundraise/plan-from-workbook.js', pm.plateTrack)
    //
    // Build > "Tx discovery & development" leaves three things on the canvas:
    //   Assumptions  label/value rows: Program_Name, Currency, Start_Date, and for each
    //                stage <Stage>_Time_Weeks and <Stage>_Cost
    //   Analysis     the roll-up: Discovery_Cost, IND_Enabling_Cost, Total_Development_Cost
    //   a timeline   one interval per stage, Program_Complete and friends as milestones
    //
    // What comes back is small and plain, because it rides inside the campaign document
    // that every public display re-reads every few seconds:
    //
    //   { kind:'program-plan', v:1, name, currency, start, end, total, built,
    //     phases:     [{ name, group, start, end, cost }],     dates as ISO strings
    //     milestones: [{ name, at }],
    //     groups:     [{ name, cost }] }                       Discovery, IND-enabling, …
    //
    // THE TIMELINE ON THE CANVAS WINS over the assumptions it was drawn from: a stage the
    // user dragged to a new date is where they now mean it to be. Only when there is no
    // timeline are the dates rebuilt from Start_Date and the weeks, the same way
    // py/openai/create-therapy-timeline.py builds them. The costs always come from the
    // tables, which hold the live, recalculated values.
    //
    // Returns null when the workbook holds nothing that looks like a plan.
    const norm = (s) => ('' + (s == null ? '' : s)).trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const pretty = (s) => ('' + (s || '')).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/\bInd\b/g, 'IND').replace(/\bGmp\b/g, 'GMP').replace(/\bGlp\b/g, 'GLP');
    const num = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        const t = ('' + (v == null ? '' : v)).replace(/[^0-9.eE+-]/g, '');
        const n = parseFloat(t);
        return isFinite(n) ? n : 0;
    };
    const dateOf = (v) => {
        if (v == null || v === '') return null;
        if (v instanceof Date) return isNaN(+v) ? null : v;
        if (typeof v === 'number') {
            // A spreadsheet serial (days from 1899-12-30) or epoch milliseconds.
            if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
            if (v > 1e11) return new Date(v);
            return null;
        }
        const d = new Date('' + v);
        return isNaN(+d) ? null : d;
    };
    const iso = (d) => (d instanceof Date && !isNaN(+d)) ? d.toISOString() : '';

    // A two-column label/value table as a map keyed by normalized label.
    const rowsOf = (table) => {
        const out = {};
        try {
            const c0 = (table && table.wells && table.wells[0]) || [];
            const c1 = (table && table.wells && table.wells[1]) || [];
            for (let r = 1; r < c0.length; r++) {
                const lab = c0[r] && c0[r].value;
                if (lab == null || ('' + lab).trim() === '') continue;
                const k = norm(lab);
                if (!(k in out)) out[k] = c1[r] ? c1[r].value : null;
            }
        } catch (e) { }
        return out;
    };
    const byName = (name) => {
        try { if (typeof pt.getTableByName === 'function') { const t = pt.getTableByName(name); if (t) return t; } } catch (e) { }
        const want = norm(name);
        return ((pt && pt.root) || []).filter((t) => t && norm(t.name) === want)[0] || null;
    };

    const A = rowsOf(byName('Assumptions'));
    const N = rowsOf(byName('Analysis'));

    // The stages, in order, and which part of the program each belongs to. The same
    // sequence create-therapy-timeline.py walks.
    const SEQ = [
        ['Design', 'Discovery'], ['Research_Grade_Synthesis', 'Discovery'], ['Screening', 'Discovery'],
        ['Dose_Response_Screening', 'Discovery'], ['Protein_Screening', 'Discovery'],
        ['Immunogenic_Screening_In_Vitro', 'Discovery'],
        ['GMP_Production', 'IND-enabling'], ['GLP_In_Vivo_Toxicology_13_Weeks', 'IND-enabling'],
        ['Fill_Finish', 'IND-enabling'], ['IND_Filing', 'IND-enabling'],
    ];
    const GROUP = {};
    for (const s of SEQ) GROUP[norm(s[0])] = s[1];
    GROUP.discovery = 'Discovery'; GROUP.ind_enabling = 'IND-enabling';
    const costOf = (stage) => {
        const k = norm(stage);
        for (const key of [k + '_cost', k + '_cost_usd', k + '_subtotal_cost', k + '_subtotal_cost_usd']) {
            if (key in A) return num(A[key]);
            if (key in N) return num(N[key]);
        }
        return null;
    };
    const groupOf = (stage) => {
        const k = norm(stage);
        if (GROUP[k]) return GROUP[k];
        if (/ind|gmp|glp|tox|fill|finish|cmc/.test(k)) return 'IND-enabling';
        if (/clinic|phase|trial|patient/.test(k)) return 'Clinical';
        return 'Discovery';
    };

    // ---- the timeline on the canvas, when there is one --------------------------------
    let phases = [], milestones = [];
    try {
        const plots = ((pt && pt.m_plots) || []).filter((o) => o && o.type === 'timeline'
            && o.scatterData && Array.isArray(o.scatterData.points) && o.scatterData.points.length);
        // The one with the most intervals: a workbook can carry a second, unrelated timeline.
        plots.sort((a, b) => b.scatterData.points.filter((p) => p && p.type === 'interval').length
            - a.scatterData.points.filter((p) => p && p.type === 'interval').length);
        const o = plots[0];
        if (o) {
            const toMs = (x) => {
                try { if (typeof pt.__tlIs === 'function' && pt.__tlIs(o)) return pt.__tlXToMs(o, x); } catch (e) { }
                return NaN;
            };
            for (const p of o.scatterData.points) {
                if (!p || !p.name) continue;
                if (p.type === 'interval') {
                    const s = dateOf(p.__startDate) || dateOf(p.start)
                        || (Number.isFinite(p.startX) ? dateOf(toMs(p.startX)) : null);
                    const e = dateOf(p.date) || dateOf(p.end)
                        || (Number.isFinite(p.x) ? dateOf(toMs(p.x)) : null);
                    if (!s || !e) continue;
                    phases.push({ key: p.name, start: s < e ? s : e, end: s < e ? e : s });
                } else {
                    const at = dateOf(p.date) || dateOf(p.at) || (Number.isFinite(p.x) ? dateOf(toMs(p.x)) : null);
                    if (at) milestones.push({ name: pretty(p.name), at: iso(at) });
                }
            }
        }
    } catch (e) { phases = []; milestones = []; }

    // ---- otherwise, rebuilt from the assumptions --------------------------------------
    if (!phases.length) {
        const start = dateOf(A.start_date) || (() => {
            const y = num(A.start_year), m = num(A.start_month);
            return y > 1900 ? new Date(y, Math.max(0, (m || 1) - 1), 1) : null;
        })();
        if (start) {
            let cur = start;
            const WEEK = 7 * 86400000;
            for (const s of SEQ) {
                const w = num(A[norm(s[0]) + '_time_weeks']);
                if (w <= 0) continue;
                const e = new Date(+cur + w * WEEK);
                phases.push({ key: s[0], start: cur, end: e });
                cur = e;
            }
            if (!phases.length) {
                for (const s of [['Discovery', 'discovery_time_weeks'], ['IND_Enabling', 'ind_enabling_time_weeks']]) {
                    const w = num(N[s[1]]) || num(A[s[1]]);
                    if (w <= 0) continue;
                    const e = new Date(+cur + w * WEEK);
                    phases.push({ key: s[0], start: cur, end: e });
                    cur = e;
                }
            }
            if (phases.length) milestones.push({ name: 'Program complete', at: iso(cur) });
        }
    }
    if (!phases.length) return null;

    phases.sort((a, b) => a.start - b.start);
    milestones.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

    const out = phases.slice(0, 24).map((p) => ({
        name: pretty(p.key), group: groupOf(p.key),
        start: iso(p.start), end: iso(p.end), cost: costOf(p.key),
    }));

    // The roll-up by group. Stage costs when the stages carry them; the Analysis table's
    // own Discovery / IND-enabling figures when they do not.
    const groups = [];
    const sums = {};
    let anyStageCost = false;
    for (const p of out) {
        if (p.cost == null) continue;
        anyStageCost = true;
        sums[p.group] = (sums[p.group] || 0) + p.cost;
    }
    if (anyStageCost) {
        for (const g of Object.keys(sums)) groups.push({ name: g, cost: sums[g] });
    } else {
        const dc = num(N.discovery_cost) || num(A.discovery_cost);
        const ic = num(N.ind_enabling_cost) || num(A.ind_enabling_cost);
        if (dc) groups.push({ name: 'Discovery', cost: dc });
        if (ic) groups.push({ name: 'IND-enabling', cost: ic });
    }
    const total = num(N.total_development_cost) || num(A.total_development_cost)
        || groups.reduce((s, g) => s + g.cost, 0);

    const first = out[0], last = out.reduce((m, p) => (p.end > m ? p.end : m), out[0].end);
    const cur = ('' + (A.currency || '')).trim().toUpperCase();
    return {
        kind: 'program-plan', v: 1,
        name: ('' + (A.program_name || A.program || A.name || '')).trim().slice(0, 140),
        currency: /^[A-Z]{3}$/.test(cur) ? cur : 'USD',
        start: first.start, end: last,
        total: Math.max(0, total),
        phases: out,
        milestones: milestones.slice(0, 12),
        groups: groups,
        built: new Date().toISOString(),
    };
}
