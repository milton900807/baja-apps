function (opts) {

    // THE PROGRAM PLAN EDITOR, inside the fundraising console.
    //
    //   const plan = await exec('fundraise/plan-editor.js', { plan, title, story, currency, goal, raised })
    //   -> the plan to attach to the campaign, or null if the person cancelled
    //
    // What Baja Project's Build > "Tx discovery & development" does across three tables and
    // a timeline canvas, done here on one screen in the console's own clothes, for the one
    // thing a campaign needs from it: what the money will pay for, and when.
    //
    //   1. Describe the program in a sentence or two (seeded from the campaign's name and
    //      story), and "Draft with AI" fills in the assumptions -- the same AI step Baja
    //      Project runs first (py/openai/assumptions-create-therapy.py). Or start from the
    //      standard template, which needs no AI at all.
    //   2. Edit them: the stages in order with their weeks and cost, costs that sit off the
    //      calendar, contingency and fees, the start date.
    //   3. The timeline and the budget are worked out from those as you type and drawn on the
    //      right exactly as the campaign's details page will draw them (fundraise/plan-view.js).
    //
    // The arithmetic is the same as Baja Project's: stages run one after another from the
    // start date (create-therapy-timeline.py), with an optional gap before each -- negative
    // for work that overlaps the stage before -- and each part's cost is the sum of its
    // stages (create-therapy.py).
    //
    // The returned plan carries its own assumptions under `model`, so opening the editor
    // again picks up exactly where it was left. What is typed into the description box is
    // NOT kept: the plan rides in a public document, and a prompt is a working note.
    const o = opts || {};
    const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
    const user = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();
    const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const WEEK = 7 * 86400000;
    const PARTS = ['Discovery', 'IND-enabling', 'Clinical', 'Other'];
    const CUR = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY'];
    const norm = (s) => ('' + (s == null ? '' : s)).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const pretty = (s) => ('' + (s || '')).replace(/_USD$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/\bInd\b/g, 'IND').replace(/\bGmp\b/g, 'GMP').replace(/\bGlp\b/g, 'GLP');
    const numOf = (v) => {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        let t = ('' + (v == null ? '' : v)).trim().replace(/[^0-9.kKmM-]/g, '');
        let mult = 1;
        if (/[kK]$/.test(t)) { mult = 1e3; t = t.slice(0, -1); } else if (/[mM]$/.test(t)) { mult = 1e6; t = t.slice(0, -1); }
        const n = parseFloat(t);
        return isFinite(n) ? n * mult : 0;
    };
    const ymd = (d) => { try { const x = new Date(d); return isNaN(+x) ? '' : x.toISOString().slice(0, 10); } catch (e) { return ''; } };
    const nextMonth = () => { const d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)); };

    // THE STANDARD TEMPLATE: Baja Project's stage sequence and its defaults
    // (assumptions-create-therapy.py), used as the starting point without AI and as the
    // map from the AI's labels back to stages.
    const TEMPLATE = [
        ['Design', 'Discovery', 2, 10000], ['Research_Grade_Synthesis', 'Discovery', 6, 250000],
        ['Screening', 'Discovery', 4, 120000], ['Dose_Response_Screening', 'Discovery', 3, 80000],
        ['Protein_Screening', 'Discovery', 3, 90000], ['Immunogenic_Screening_In_Vitro', 'Discovery', 3, 70000],
        ['GMP_Production', 'IND-enabling', 8, 400000], ['GLP_In_Vivo_Toxicology_13_Weeks', 'IND-enabling', 13, 350000],
        ['Fill_Finish', 'IND-enabling', 2, 125000], ['IND_Filing', 'IND-enabling', 4, 100000],
    ];
    const OTHER_TEMPLATE = [
        ['Shipping_Logistics', 'Other', 25000], ['Tech_Transfer', 'IND-enabling', 40000],
        ['Analytical_Method_Transfer', 'IND-enabling', 30000], ['Regulatory_Writing_Support', 'IND-enabling', 60000],
    ];
    const fromTemplate = () => ({
        name: ('' + (o.title || '')).trim(), currency: o.currency || 'USD', start: nextMonth(),
        stages: TEMPLATE.map((t) => ({ name: pretty(t[0]), part: t[1], weeks: t[2], cost: t[3], gap: 0 })),
        others: OTHER_TEMPLATE.map((t) => ({ name: pretty(t[0]), part: t[1], cost: t[2] })),
        contingency: 10, fees: 10,
    });

    // An existing plan: its own assumptions if it carries them, otherwise worked back out of
    // its dates (a plan sent from a Baja Project workbook has dates, not weeks).
    const fromPlan = (p) => {
        if (!p || typeof p !== 'object') return null;
        const m = p.model;
        if (m && Array.isArray(m.stages)) {
            return {
                name: '' + (m.name || p.name || ''), currency: m.currency || p.currency || 'USD', start: ymd(m.start) || nextMonth(),
                stages: m.stages.map((s) => ({ name: '' + (s.name || ''), part: PARTS.indexOf(s.part) >= 0 ? s.part : 'Other',
                    weeks: Math.max(0, numOf(s.weeks)), cost: Math.max(0, numOf(s.cost)), gap: numOf(s.gap) })),
                others: (Array.isArray(m.others) ? m.others : []).map((s) => ({ name: '' + (s.name || ''),
                    part: PARTS.indexOf(s.part) >= 0 ? s.part : 'Other', cost: Math.max(0, numOf(s.cost)) })),
                contingency: Math.max(0, numOf(m.contingency)), fees: Math.max(0, numOf(m.fees)),
            };
        }
        if (!Array.isArray(p.phases) || !p.phases.length) return null;
        const ph = p.phases.map((x) => ({ x, s: Date.parse(x.start), e: Date.parse(x.end) }))
            .filter((x) => isFinite(x.s) && isFinite(x.e)).sort((a, b) => a.s - b.s);
        if (!ph.length) return null;
        let prevEnd = ph[0].s;
        const stages = ph.map((q) => {
            const st = { name: '' + (q.x.name || ''), part: PARTS.indexOf(q.x.group) >= 0 ? q.x.group : 'Other',
                weeks: Math.max(0, Math.round((q.e - q.s) / WEEK)), cost: Math.max(0, numOf(q.x.cost)),
                gap: Math.round((q.s - prevEnd) / WEEK) };
            prevEnd = q.e;
            return st;
        });
        // Costs that were in the plan's parts but not in any stage.
        const staged = {};
        for (const s of stages) staged[s.part] = (staged[s.part] || 0) + s.cost;
        const others = [];
        for (const g of (Array.isArray(p.groups) ? p.groups : [])) {
            const rest = numOf(g.cost) - (staged[g.name] || 0);
            if (rest > 1) others.push({ name: g.name + ' (other)', part: PARTS.indexOf(g.name) >= 0 ? g.name : 'Other', cost: Math.round(rest) });
        }
        return { name: '' + (p.name || ''), currency: p.currency || 'USD', start: ymd(ph[0].s), stages, others, contingency: 0, fees: 0 };
    };

    // The AI's Assumptions table -> the editor's model.
    const fromAssumptions = (art) => {
        const tables = (art && art.tables) || {};
        const lab = {}, val = {};
        for (const k of Object.keys(tables)) {
            const m = /^Assumptions\[(\d+):\d+\]\[(\d+):\d+\]$/.exec(k);
            if (!m) continue;
            const col = +m[1], row = +m[2];
            if (row < 1) continue;
            if (col === 0) lab[row] = tables[k]; else if (col === 1) val[row] = tables[k];
        }
        const A = {};
        for (const r of Object.keys(lab)) A[norm(lab[r])] = val[r];
        if (!Object.keys(A).length) return null;
        const get = (base, suffixes) => { for (const s of suffixes) { const k = norm(base) + s; if (k in A) return A[k]; } return undefined; };
        const known = {};
        const stages = [];
        for (const t of TEMPLATE) {
            const w = numOf(get(t[0], ['_time_weeks']));
            const c = numOf(get(t[0], ['_cost_usd', '_cost']));
            known[norm(t[0]) + '_time_weeks'] = 1; known[norm(t[0]) + '_cost_usd'] = 1; known[norm(t[0]) + '_cost'] = 1;
            if (w > 0 || c > 0) stages.push({ name: pretty(t[0]), part: t[1], weeks: Math.max(0, Math.round(w)), cost: Math.max(0, c), gap: 0 });
        }
        const others = [];
        for (const k of Object.keys(A)) {
            if (known[k] || !/_cost(_usd)?$/.test(k) || /subtotal|total/.test(k)) continue;
            const c = numOf(A[k]);
            if (c <= 0) continue;
            const base = k.replace(/_cost(_usd)?$/, '');
            const t = OTHER_TEMPLATE.filter((x) => norm(x[0]) === base)[0];
            others.push({ name: pretty(base.replace(/(^|_)([a-z])/g, (m0, a, b) => a + b.toUpperCase())), part: t ? t[1] : 'Other', cost: c });
        }
        const rate = (k) => { const v = numOf(A[k]); return v > 0 && v <= 1 ? Math.round(v * 1000) / 10 : (v > 1 && v < 100 ? v : 0); };
        let start = ymd(A.start_date);
        if (!start || Date.parse(start) < Date.now() - 31 * 86400000) start = nextMonth();
        const cur = ('' + (A.currency || o.currency || 'USD')).trim().toUpperCase();
        const nm = ('' + (A.program_name || '')).trim();
        return {
            name: (nm && !/^therapeutic_development_program$/i.test(nm)) ? pretty(nm) : ('' + (o.title || '')).trim(),
            currency: CUR.indexOf(cur) >= 0 ? cur : 'USD', start,
            stages: stages.length ? stages : fromTemplate().stages,
            others, contingency: rate('contingency_rate'),
            fees: Math.round((rate('program_management_fee_rate') + rate('quality_oversight_fee_rate')) * 10) / 10,
        };
    };

    // The editor's model -> the plan the campaign carries and plan-view draws.
    const toPlan = (m) => {
        const phases = [], milestones = [];
        let cur = Date.parse(m.start + 'T12:00:00');
        if (!isFinite(cur)) cur = Date.parse(nextMonth() + 'T12:00:00');
        let first = null, last = null;
        const partEnd = {};
        for (const s of m.stages) {
            if (!('' + s.name).trim() || !(s.weeks > 0)) continue;
            const st = Math.max(first == null ? cur : -Infinity, cur + (numOf(s.gap) || 0) * WEEK);
            const en = st + s.weeks * WEEK;
            phases.push({ name: ('' + s.name).trim(), group: s.part, start: new Date(st).toISOString(), end: new Date(en).toISOString(), cost: s.cost || 0 });
            first = first == null ? st : Math.min(first, st);
            last = last == null ? en : Math.max(last, en);
            partEnd[s.part] = Math.max(partEnd[s.part] || 0, en);
            cur = en;
        }
        const parts = Object.keys(partEnd);
        for (const p of parts) {
            if (parts.length > 1 && partEnd[p] < last) milestones.push({ name: p + ' complete', at: new Date(partEnd[p]).toISOString() });
        }
        const lastStage = phases.length ? phases[phases.length - 1] : null;
        if (last != null) milestones.push({ name: lastStage && /\bind\b/i.test(lastStage.name) ? 'IND filed' : 'Program complete', at: new Date(last).toISOString() });
        const sums = {};
        for (const p of phases) sums[p.group] = (sums[p.group] || 0) + (p.cost || 0);
        for (const c of m.others) if (c.cost > 0 && ('' + c.name).trim()) sums[c.part] = (sums[c.part] || 0) + c.cost;
        const direct = Object.keys(sums).reduce((s, k) => s + sums[k], 0);
        const over = Math.round(direct * ((m.contingency || 0) + (m.fees || 0)) / 100);
        const groups = PARTS.filter((p) => sums[p] > 0).map((p) => ({ name: p, cost: Math.round(sums[p]) }));
        if (over > 0) groups.push({ name: 'Contingency & fees', cost: over });
        return {
            kind: 'program-plan', v: 1, name: ('' + (m.name || '')).trim().slice(0, 140), currency: m.currency || 'USD',
            start: first != null ? new Date(first).toISOString() : '', end: last != null ? new Date(last).toISOString() : '',
            total: Math.round(direct + over), phases, milestones, groups,
            built: new Date().toISOString(), source: 'console',
            model: {
                name: m.name, currency: m.currency, start: m.start,
                stages: m.stages.map((s) => ({ name: s.name, part: s.part, weeks: s.weeks, cost: s.cost, gap: s.gap || 0 })),
                others: m.others.map((s) => ({ name: s.name, part: s.part, cost: s.cost })),
                contingency: m.contingency || 0, fees: m.fees || 0,
            },
        };
    };

    return (async () => {
        let PV = null;
        try { PV = await exec('fundraise/plan-view.js'); } catch (e) { PV = null; }
        const money = (v, cur) => (PV ? PV.money(v, cur || model.currency) : ('$' + Math.round(+v || 0).toLocaleString()));

        let model = fromPlan(o.plan) || null;
        const isNew = !model;
        if (!model) model = fromTemplate();
        const seededPrompt = [('' + (o.title || '')).trim(), ('' + (o.story || '')).trim()].filter(Boolean).join('. ').slice(0, 1200);

        // ---- the screen, in the console's clothes ---------------------------------------
        try { const old = document.getElementById('baja-plan-editor'); if (old) old.remove(); } catch (e) { }
        const wrap = document.createElement('div');
        wrap.id = 'baja-plan-editor';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483100;overflow:auto;background:#071a30;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
        const lbl = 'display:block;font:600 12px system-ui;color:#9fb3c8;margin:14px 0 5px;';
        const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);'
            + 'border-radius:8px;padding:9px 11px;font:14px system-ui;';
        const cell = 'box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.12);'
            + 'border-radius:6px;padding:6px 8px;font:13px system-ui;min-width:0;';
        const btn = (id, label, kind) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px system-ui;'
            + (kind === 'go' ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';
        const sectHead = (t, sub) => '<div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.12);">'
            + '<div style="font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;">' + t + '</div>'
            + (sub ? '<div style="margin-top:5px;font:12.5px/1.5 system-ui;color:#9fb3c8;">' + sub + '</div>' : '') + '</div>';

        wrap.innerHTML = ''
            + '<div style="display:flex;align-items:center;gap:16px;padding:16px 22px 14px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);position:sticky;top:0;z-index:3;">'
            + '<div><div style="font:700 20px system-ui;">Program plan</div>'
            + '<div style="font:12.5px system-ui;color:#9fb3c8;margin-top:3px;">What the money will pay for, and when. '
            + 'Shown on the campaign’s details page.</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;align-items:center;">'
            + '<span id="pe-total" style="font:600 13px system-ui;color:#cfe6ef;white-space:nowrap;"></span>'
            + btn('pe-cancel', 'Cancel') + btn('pe-use', 'Use this plan', 'go') + '</div></div>'
            + '<div style="padding:22px;display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;">'
            + '<div style="flex:1 1 460px;max-width:620px;">'

            + '<label style="' + lbl + 'margin-top:0;">Describe the program</label>'
            + '<textarea id="pe-prompt" rows="4" style="' + inp + 'resize:vertical;" placeholder="An antisense oligonucleotide for Rett syndrome, '
            + 'from design through an IND filing, for a patient population of about 6,000."></textarea>'
            + '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
            + btn('pe-ai', 'Draft with AI') + btn('pe-tpl', 'Start from the standard template') + '</div>'
            + '<div style="margin-top:5px;font:11.5px/1.55 system-ui;color:#6f93a6;max-width:56ch;">'
            + 'The draft fills in every field below with weeks and costs for each stage. It is a first draft '
            + 'for you to correct. Nothing reaches the campaign until you use the plan and publish.</div>'
            + '<div id="pe-ai-out" style="margin-top:7px;font:12.5px system-ui;color:#6f93a6;min-height:16px;"></div>'

            + sectHead('The program')
            + '<label style="' + lbl + '">Name (optional)</label><input id="pe-name" style="' + inp + '"/>'
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<div style="flex:1 1 140px;"><label style="' + lbl + '">Starts</label><input id="pe-start" type="date" style="' + inp + 'color-scheme:dark;"/></div>'
            + '<div style="flex:1 1 120px;"><label style="' + lbl + '">Currency</label><select id="pe-cur" style="' + inp + '">'
            + CUR.map((c) => '<option value="' + c + '">' + c + '</option>').join('') + '</select></div></div>'

            + sectHead('Stages', 'In the order they happen. Each starts when the one before ends; a gap delays it, '
                + 'and a negative gap overlaps it with the stage before.')
            + '<div id="pe-stages" style="margin-top:10px;"></div>'
            + '<div style="margin-top:8px;">' + btn('pe-add-stage', '+ Add a stage') + '</div>'

            + sectHead('Other costs', 'Paid for by the campaign but not a stage of their own: transfers, logistics, writing.')
            + '<div id="pe-others" style="margin-top:10px;"></div>'
            + '<div style="margin-top:8px;">' + btn('pe-add-other', '+ Add a cost') + '</div>'

            + sectHead('Contingency and fees', 'A percentage of everything above, shown as its own part of the budget.')
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<div style="flex:1 1 160px;"><label style="' + lbl + '">Contingency (%)</label><input id="pe-cont" inputmode="decimal" style="' + inp + '"/></div>'
            + '<div style="flex:1 1 160px;"><label style="' + lbl + '">Management and oversight fees (%)</label><input id="pe-fees" inputmode="decimal" style="' + inp + '"/></div>'
            + '</div>'
            + '</div>'

            // The picture, which stays in view while the numbers change.
            + '<div style="flex:1 1 420px;min-width:300px;position:sticky;top:86px;">'
            + '<div style="font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;margin-bottom:10px;">'
            + 'On the details page</div>'
            + '<div id="pe-prev" style="padding:16px;border:1px solid rgba(255,255,255,0.14);border-radius:12px;'
            + 'background:radial-gradient(600px 300px at 50% -20%,#123a63 0%,#0a1e3a 55%,#071526 100%);"></div>'
            + '<div id="pe-check" style="margin-top:10px;font:12.5px/1.55 system-ui;color:#fde68a;"></div>'
            + '</div></div>';
        document.body.appendChild(wrap);
        const $ = (id) => document.getElementById(id);

        $('pe-prompt').value = seededPrompt;
        const toFields = () => {
            $('pe-name').value = model.name || '';
            $('pe-start').value = model.start || nextMonth();
            $('pe-cur').value = CUR.indexOf(model.currency) >= 0 ? model.currency : 'USD';
            $('pe-cont').value = model.contingency ? ('' + model.contingency) : '';
            $('pe-fees').value = model.fees ? ('' + model.fees) : '';
        };

        // ---- the two lists -----------------------------------------------------------
        const partSel = (k, i, v) => '<select data-f="' + k + ':part:' + i + '" style="' + cell + 'flex:0 0 118px;">'
            + PARTS.map((p) => '<option' + (p === v ? ' selected' : '') + '>' + p + '</option>').join('') + '</select>';
        const icon = (attr, ch, title, off) => '<button ' + attr + ' title="' + title + '"' + (off ? ' disabled' : '')
            + ' style="cursor:pointer;border:0;background:transparent;color:' + (off ? '#3c5a6b' : '#7fb0c4') + ';'
            + 'font:700 12px system-ui;line-height:1;padding:2px 3px;">' + ch + '</button>';
        const fmtNum = (v) => (v ? Math.round(v).toLocaleString() : '');
        const stagesUI = () => {
            const box = $('pe-stages');
            const head = '<div style="display:flex;gap:6px;padding:0 0 4px;font:600 11px system-ui;color:#7fb0c4;">'
                + '<span style="flex:1 1 auto;">Stage</span><span style="flex:0 0 118px;">Part</span>'
                + '<span style="flex:0 0 62px;">Weeks</span><span style="flex:0 0 110px;">Cost</span>'
                + '<span style="flex:0 0 54px;">Gap</span><span style="flex:0 0 48px;"></span></div>';
            box.innerHTML = !model.stages.length ? '<div style="font:12.5px system-ui;color:#9fb3c8;">No stages yet.</div>'
                : head + model.stages.map((s, i) => '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">'
                    + '<input data-f="s:name:' + i + '" value="' + esc(s.name) + '" style="' + cell + 'flex:1 1 auto;"/>'
                    + partSel('s', i, s.part)
                    + '<input data-f="s:weeks:' + i + '" inputmode="numeric" value="' + esc(s.weeks || '') + '" style="' + cell + 'flex:0 0 62px;text-align:right;"/>'
                    + '<input data-f="s:cost:' + i + '" inputmode="decimal" value="' + esc(fmtNum(s.cost)) + '" style="' + cell + 'flex:0 0 110px;text-align:right;"/>'
                    + '<input data-f="s:gap:' + i + '" inputmode="numeric" value="' + esc(s.gap || '') + '" placeholder="0" style="' + cell + 'flex:0 0 54px;text-align:right;"/>'
                    + '<span style="flex:0 0 48px;display:flex;">'
                    + icon('data-mv="' + i + ':-1"', '▲', 'Move up', i === 0)
                    + icon('data-mv="' + i + ':1"', '▼', 'Move down', i === model.stages.length - 1)
                    + icon('data-rm="s:' + i + '"', '×', 'Remove', false) + '</span></div>').join('');
            wire(box);
        };
        const othersUI = () => {
            const box = $('pe-others');
            box.innerHTML = !model.others.length ? '<div style="font:12.5px system-ui;color:#9fb3c8;">None.</div>'
                : model.others.map((s, i) => '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">'
                    + '<input data-f="c:name:' + i + '" value="' + esc(s.name) + '" style="' + cell + 'flex:1 1 auto;"/>'
                    + partSel('c', i, s.part)
                    + '<input data-f="c:cost:' + i + '" inputmode="decimal" value="' + esc(fmtNum(s.cost)) + '" style="' + cell + 'flex:0 0 110px;text-align:right;"/>'
                    + '<span style="flex:0 0 24px;display:flex;">' + icon('data-rm="c:' + i + '"', '×', 'Remove', false) + '</span></div>').join('');
            wire(box);
        };
        const wire = (box) => {
            for (const el of box.querySelectorAll('[data-f]')) {
                const ev = el.tagName === 'SELECT' ? 'change' : 'input';
                el.addEventListener(ev, () => {
                    const [k, f, i] = ('' + el.getAttribute('data-f')).split(':');
                    const row = (k === 's' ? model.stages : model.others)[+i];
                    if (!row) return;
                    if (f === 'name' || f === 'part') row[f] = el.value;
                    else if (f === 'gap') row.gap = Math.round(numOf(el.value));
                    else row[f] = Math.max(0, numOf(el.value));
                    redraw();
                });
                if (el.getAttribute('data-f').split(':')[1] === 'cost') {
                    el.addEventListener('blur', () => { const r = (el.getAttribute('data-f')[0] === 's' ? model.stages : model.others)[+el.getAttribute('data-f').split(':')[2]]; if (r) el.value = fmtNum(r.cost); });
                }
            }
            for (const b of box.querySelectorAll('[data-mv]')) b.onclick = () => {
                const [i, d] = b.getAttribute('data-mv').split(':').map(Number);
                const j = i + d, a = model.stages;
                if (j < 0 || j >= a.length) return;
                const t = a[i]; a[i] = a[j]; a[j] = t;
                stagesUI(); redraw();
            };
            for (const b of box.querySelectorAll('[data-rm]')) b.onclick = () => {
                const [k, i] = b.getAttribute('data-rm').split(':');
                (k === 's' ? model.stages : model.others).splice(+i, 1);
                k === 's' ? stagesUI() : othersUI();
                redraw();
            };
        };

        // ---- the picture and the totals ----------------------------------------------
        let plan = null;
        const redraw = () => {
            model.name = ('' + $('pe-name').value).trim();
            model.start = $('pe-start').value || nextMonth();
            model.currency = $('pe-cur').value || 'USD';
            model.contingency = Math.max(0, numOf($('pe-cont').value));
            model.fees = Math.max(0, numOf($('pe-fees').value));
            plan = toPlan(model);
            const ok = plan.phases.length > 0;
            $('pe-prev').innerHTML = ok && PV ? PV.html(plan, { goal: o.goal, raised: o.raised })
                : '<div style="font:13px system-ui;color:#9fb3c8;">Add a stage with a number of weeks and the plan appears here.</div>';
            $('pe-total').textContent = ok ? (plan.phases.length + ' stages · ' + money(plan.total, plan.currency)) : '';
            const warn = [];
            if (model.stages.some((s) => ('' + s.name).trim() && !(s.weeks > 0))) warn.push('A stage with no weeks is left off the calendar.');
            if (o.currency && plan.currency !== o.currency) warn.push('The campaign is in ' + o.currency + '; the plan is in ' + plan.currency + '. Figures are not converted.');
            $('pe-check').textContent = warn.join(' ');
            $('pe-use').disabled = !ok; $('pe-use').style.opacity = ok ? '1' : '0.5';
        };
        const all = () => { toFields(); stagesUI(); othersUI(); redraw(); };
        for (const id of ['pe-name', 'pe-start', 'pe-cont', 'pe-fees']) $(id).addEventListener('input', redraw);
        $('pe-cur').addEventListener('change', redraw);
        $('pe-add-stage').onclick = () => {
            model.stages.push({ name: '', part: model.stages.length ? model.stages[model.stages.length - 1].part : 'Discovery', weeks: 4, cost: 0, gap: 0 });
            stagesUI(); redraw();
            try { const ins = $('pe-stages').querySelectorAll('input[data-f^="s:name"]'); ins[ins.length - 1].focus(); } catch (e) { }
        };
        $('pe-add-other').onclick = () => {
            model.others.push({ name: '', part: 'Other', cost: 0 });
            othersUI(); redraw();
            try { const ins = $('pe-others').querySelectorAll('input[data-f^="c:name"]'); ins[ins.length - 1].focus(); } catch (e) { }
        };

        // Replacing what is there is asked twice, as the console does for its timeline draft:
        // these are somebody's own numbers.
        let armed = '', armTimer = null;
        const confirmTwice = (key, b, label, again) => {
            if (isNew && !touched) return true;
            if (armed === key) { armed = ''; clearTimeout(armTimer); b.textContent = label; return true; }
            armed = key; b.textContent = again;
            clearTimeout(armTimer);
            armTimer = setTimeout(() => { armed = ''; try { b.textContent = label; } catch (e) { } }, 6000);
            return false;
        };
        let touched = false;
        wrap.addEventListener('input', (e) => { if (e.target && e.target.id !== 'pe-prompt') touched = true; }, true);

        $('pe-tpl').onclick = () => {
            if (!confirmTwice('tpl', $('pe-tpl'), 'Start from the standard template', 'Replace what is there?')) return;
            const keep = { name: model.name, currency: model.currency, start: model.start };
            model = fromTemplate();
            if (keep.name) model.name = keep.name;
            model.currency = keep.currency; model.start = keep.start;
            all(); touched = false;
            $('pe-ai-out').textContent = 'The standard template: ten stages from design to an IND filing. Change what does not fit.';
        };
        $('pe-ai').onclick = async () => {
            const prompt = ('' + $('pe-prompt').value).trim();
            if (!prompt) { $('pe-ai-out').textContent = 'Describe the program first: what it is, for whom, and how far the money takes it.'; $('pe-prompt').focus(); return; }
            if (!confirmTwice('ai', $('pe-ai'), 'Draft with AI', 'Replace what is there?')) return;
            const b = $('pe-ai');
            b.disabled = true; b.style.opacity = '0.6';
            $('pe-ai-out').textContent = 'Drafting the assumptions. This takes up to a minute…';
            try {
                let em = null;
                try { if (typeof EngineMonitor === 'function') em = new EngineMonitor((msg) => { try { if (msg && typeof msg === 'string') $('pe-ai-out').textContent = msg.slice(0, 160); } catch (e) { } }); } catch (e) { em = null; }
                const art = await exec('py/openai/assumptions-create-therapy.py', em, user, prompt);
                if (art && art.error) throw new Error(art.error);
                const m = fromAssumptions(art);
                if (!m) throw new Error('the draft came back empty');
                if (!m.name) m.name = model.name;
                model = m;
                all(); touched = false;
                $('pe-ai-out').innerHTML = '<span style="color:#86efac;">A draft of ' + model.stages.length + ' stages and '
                    + model.others.length + ' other costs.</span> Read it, change what is wrong, then use the plan.';
            } catch (e) {
                $('pe-ai-out').innerHTML = '<span style="color:#fca5a5;">Could not draft one: ' + esc((e && e.message) ? e.message : e)
                    + '.</span> The standard template works without AI.';
            }
            b.disabled = false; b.style.opacity = '1';
        };

        all();
        if (isNew) $('pe-ai-out').textContent = 'Started from the standard template. Describe the program and draft with AI for one that fits it.';
        try { $('pe-prompt').focus(); } catch (e) { }

        // ---- leaving -------------------------------------------------------------------
        return await new Promise((resolve) => {
            const done = (v) => {
                document.removeEventListener('keydown', onKey, true);
                try { wrap.remove(); } catch (e) { }
                resolve(v);
            };
            const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
            document.addEventListener('keydown', onKey, true);
            $('pe-cancel').onclick = () => done(null);
            $('pe-use').onclick = () => { redraw(); if (plan && plan.phases.length) done(plan); };
        });
    })();
}
