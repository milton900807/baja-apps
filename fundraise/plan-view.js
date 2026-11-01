function () {

    // WHAT THE MONEY WILL DO: a campaign's program plan drawn as a picture.
    //
    //   const PV = await exec('fundraise/plan-view.js');
    //   el.innerHTML = PV.html(PV.clean(doc.plan), { goal: doc.goal, raised: doc.raised });
    //
    // The plan comes from a Baja Project workbook (fundraise/plan-from-workbook.js) and is
    // drawn in two parts:
    //   - the stages on a calendar, one bar each, coloured by the part of the program
    //     (discovery, IND-enabling, …), with the year marks along the top and the
    //     milestones as diamonds;
    //   - where the money goes: one bar split by part, and against it how far the
    //     campaign's goal and what has been raised so far would carry the plan.
    //
    // Used by the public display's details page (manchester/viewer-fundraise.js) and by the
    // console that publishes it (fundraise/console.js), so the organiser sees exactly what
    // a donor will. HTML and CSS only, no canvas and no SVG text: it has to wrap on a phone.
    //
    // THE PLAN IS READ FROM A PUBLIC DOCUMENT, so clean() keeps only the fields this draws,
    // as numbers and short strings, and html() escapes every one of them again.
    const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const str = (v, n) => ('' + (v == null ? '' : v)).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 120);
    const ms = (v) => { const t = Date.parse('' + (v || '')); return isFinite(t) ? t : NaN; };
    const amt = (v) => { const n = +v; return isFinite(n) && n >= 0 ? n : null; };

    const clean = (p) => {
        if (!p || typeof p !== 'object' || !Array.isArray(p.phases)) return null;
        const phases = p.phases.slice(0, 24).map((x) => ({
            name: str(x && x.name, 80), group: str(x && x.group, 40) || 'Program',
            start: ms(x && x.start), end: ms(x && x.end), cost: amt(x && x.cost),
        })).filter((x) => x.name && isFinite(x.start) && isFinite(x.end) && x.end >= x.start);
        const milestones = (Array.isArray(p.milestones) ? p.milestones : []).slice(0, 12)
            .map((m) => ({ name: str(m && m.name, 60), at: ms(m && m.at) }))
            .filter((m) => m.name && isFinite(m.at));
        const groups = (Array.isArray(p.groups) ? p.groups : []).slice(0, 8)
            .map((g) => ({ name: str(g && g.name, 40), cost: amt(g && g.cost) }))
            .filter((g) => g.name && g.cost != null && g.cost > 0);
        // STAGES ARE OPTIONAL: a plan may be a budget with nothing on the calendar. It needs
        // one or the other to be worth drawing.
        if (!phases.length && !groups.length && !(amt(p.total) > 0)) return null;
        const cur = str(p.currency, 3).toUpperCase();
        return { __clean: true,
            name: str(p.name, 140), currency: /^[A-Z]{3}$/.test(cur) ? cur : 'USD',
            total: amt(p.total) || groups.reduce((s, g) => s + g.cost, 0),
            phases, milestones, groups,
            built: ms(p.built),
        };
    };

    const PALETTE = { 'Discovery': '#1aa3bd', 'IND-enabling': '#22c55e', 'Clinical': '#a78bfa' };
    const EXTRA = ['#f59e0b', '#f472b6', '#60a5fa', '#34d399'];
    const colourOf = (() => {
        const seen = {};
        let i = 0;
        return (g) => PALETTE[g] || seen[g] || (seen[g] = EXTRA[(i++) % EXTRA.length]);
    })();

    const money = (n, cur, short) => {
        const v = +n || 0;
        if (short) {
            const a = Math.abs(v);
            const sym = (() => { try { return (0).toLocaleString(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).replace(/[\d\s.,]/g, ''); } catch (e) { return '$'; } })();
            if (a >= 1e9) return sym + (v / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
            if (a >= 1e6) return sym + (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
            if (a >= 1e3) return sym + Math.round(v / 1e3) + 'K';
        }
        try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v); }
        catch (e) { return '$' + Math.round(v).toLocaleString(); }
    };
    const month = (t) => { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
    const span = (a, b) => {
        const months = Math.max(1, Math.round((b - a) / (30.44 * 86400000)));
        if (months < 24) return months + (months === 1 ? ' month' : ' months');
        const y = months / 12;
        return (Math.round(y * 10) / 10).toString().replace(/\.0$/, '') + ' years';
    };

    // WHERE THE MONEY GOES: the budget bar, its parts, and how far the goal carries it.
    // Drawn under the calendar, or on its own for a plan with no stages.
    const fundsHtml = (p, o, top) => {
        // ---- where the money goes ------------------------------------------------------
        const total = p.total || 0;
        const groups = p.groups.length ? p.groups : [];
        const gsum = groups.reduce((s, g) => s + g.cost, 0) || total;
        const goal = Math.max(0, +o.goal || 0), raised = Math.max(0, +o.raised || 0);
        const cur = p.currency;
        let funds = '';
        if (total > 0) {
            const bar = groups.length ? groups.map((g) => '<div title="' + esc(g.name + ': ' + money(g.cost, cur)) + '" style="height:100%;width:'
                + (g.cost / gsum * 100).toFixed(2) + '%;background:' + colourOf(g.name) + ';"></div>').join('')
                : '<div style="height:100%;width:100%;background:#1aa3bd;"></div>';
            const mark = (v, label, colour) => {
                if (!(v > 0)) return '';
                const at = Math.min(100, v / total * 100);
                return '<div style="position:absolute;top:-6px;bottom:-6px;left:calc(' + at.toFixed(2) + '% - 1px);width:2px;background:' + colour + ';"></div>'
                    + '<div style="position:absolute;top:28px;left:' + at.toFixed(2) + '%;transform:translateX(' + (at > 80 ? '-100%' : at < 20 ? '0' : '-50%')
                    + ');white-space:nowrap;font:600 11.5px system-ui;color:' + colour + ';">' + esc(label) + '</div>';
            };
            const reach = (v) => {
                // How far into the plan a sum would carry it, walking the stages in order.
                let left = v, last = null;
                for (const x of p.phases) {
                    if (!(x.cost > 0)) continue;
                    if (left >= x.cost) { left -= x.cost; last = x; } else break;
                }
                return last;
            };
            const g2 = goal > 0 ? reach(goal) : null;
            funds = '<div style="margin-top:' + (top || '0') + ';">'
                + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;">'
                + '<div style="font:700 13px system-ui;color:#e6f2f7;">Where the money goes</div>'
                + '<div style="font:800 18px system-ui;color:#fff;">' + esc(money(total, cur)) + '<span style="font:500 12.5px system-ui;color:#8fb6c6;"> total plan</span></div></div>'
                + '<div style="position:relative;margin-top:10px;margin-bottom:' + ((goal > 0 || raised > 0) ? '30px' : '0') + ';">'
                + '<div style="display:flex;height:16px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,0.08);">' + bar + '</div>'
                + mark(raised, 'raised ' + money(raised, cur, true), '#86efac')
                // The goal's mark, unless the raised mark is drawn right beside it and the
                // two labels would sit on top of each other.
                + (goal > 0 && (!(raised > 0) || Math.abs(goal - raised) / total > 0.08) ? mark(goal, 'goal ' + money(goal, cur, true), '#fde68a') : '')
                + '</div>'
                + (groups.length ? '<div style="display:flex;gap:8px 20px;flex-wrap:wrap;margin-top:10px;font:12.5px system-ui;color:#bcd9e4;">'
                    + groups.map((g) => '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:3px;background:'
                        + colourOf(g.name) + ';"></span>' + esc(g.name) + ' <b style="color:#eaf6f9;">' + esc(money(g.cost, cur, true)) + '</b>'
                        + ' <span style="color:#7fb0c4;">' + Math.round(g.cost / gsum * 100) + '%</span></span>').join('') + '</div>' : '')
                + (goal > 0 ? '<div style="margin-top:10px;font:13px/1.55 system-ui;color:#cfe6ef;">'
                    + (goal >= total
                        ? 'The goal covers the whole plan.'
                        : ('The goal covers ' + Math.round(goal / total * 100) + '% of the plan'
                            + (g2 ? ', through <b>' + esc(g2.name) + '</b> (' + esc(month(g2.end)) + ').' : '.')))
                    + '</div>' : '')
                + '</div>';
        }
        return funds;
    };

    const html = (plan, opts) => {
        const p = (plan && plan.__clean) ? plan : clean(plan);
        if (!p) return '';
        const o = opts || {};
        const cur = p.currency;
        const hasCal = p.phases.length > 0;
        if (!hasCal) {
            const f = fundsHtml(p, o, null);
            return f ? '<div class="baja-plan" style="text-align:left;">'
                + (p.name ? '<div style="font:500 13.5px/1.5 system-ui;color:#bcd9e4;margin-bottom:14px;"><b style="color:#eaf6f9;">'
                    + esc(p.name) + '</b> · budget</div>' : '')
                + f + '</div>' : '';
        }
        const t0 = Math.min.apply(null, p.phases.map((x) => x.start));
        const t1 = Math.max.apply(null, p.phases.map((x) => x.end).concat(p.milestones.map((m) => m.at)));
        const range = Math.max(1, t1 - t0);
        const pos = (t) => Math.max(0, Math.min(100, (t - t0) / range * 100));

        // ON A PHONE the calendar cannot sit beside the stage names: a third of 360px is not
        // room for "GLP In Vivo Toxicology 13 Weeks", and what is left is not room for bars.
        // So each stage gets its own row -- name and cost, its dates, and a thin full-width
        // track with its bar placed on the whole program's span -- and the milestones are
        // listed. opts.compact forces it either way; otherwise a narrow window chooses it.
        const compact = (o.compact != null) ? !!o.compact
            : (() => { try { return window.innerWidth < 600; } catch (e) { return false; } })();
        if (compact) {
            const gs = [];
            for (const x of p.phases) if (gs.indexOf(x.group) < 0) gs.push(x.group);
            const rowC = (x, i) => {
                const l = pos(x.start), w = Math.max(1.5, pos(x.end) - l);
                return '<div style="padding:10px 0;' + (i ? 'border-top:1px solid rgba(255,255,255,0.08);' : '') + '">'
                    + '<div style="display:flex;gap:10px;align-items:baseline;">'
                    + '<div style="flex:1 1 auto;min-width:0;font:600 14px/1.3 system-ui;color:#e6f2f7;">' + esc(x.name) + '</div>'
                    + (x.cost ? '<div style="flex:0 0 auto;font:700 13.5px system-ui;color:#eaf6f9;">' + esc(money(x.cost, cur, true)) + '</div>' : '')
                    + '</div>'
                    + '<div style="font:12px system-ui;color:#8fb6c6;margin-top:2px;">' + esc(month(x.start)) + ' \u2013 ' + esc(month(x.end)) + '</div>'
                    + '<div style="position:relative;height:8px;margin-top:7px;border-radius:4px;background:rgba(255,255,255,0.07);">'
                    + '<div style="position:absolute;top:0;bottom:0;left:' + l.toFixed(2) + '%;width:' + w.toFixed(2) + '%;border-radius:4px;'
                    + 'background:' + colourOf(x.group) + ';"></div></div></div>';
            };
            return '<div class="baja-plan" style="text-align:left;">'
                + '<div style="font:500 13.5px/1.5 system-ui;color:#bcd9e4;margin-bottom:8px;">'
                + (p.name ? '<b style="color:#eaf6f9;">' + esc(p.name) + '</b><br>' : '')
                + esc(p.phases.length + (p.phases.length === 1 ? ' stage' : ' stages')) + ' over ' + esc(span(t0, t1))
                + ', ' + esc(month(t0)) + ' to ' + esc(month(t1)) + '</div>'
                + '<div style="display:flex;justify-content:space-between;font:600 11px system-ui;color:#7fb0c4;margin-top:6px;">'
                + '<span>' + esc(month(t0)) + '</span><span>' + esc(month(t1)) + '</span></div>'
                + '<div>' + p.phases.map(rowC).join('') + '</div>'
                + (p.milestones.length ? '<div style="margin-top:10px;font:12.5px/1.8 system-ui;color:#bcd9e4;">'
                    + p.milestones.map((m) => '<div><span style="color:#fbbf24;">\u25c6</span> ' + esc(m.name)
                        + ' <span style="color:#7fb0c4;">' + esc(month(m.at)) + '</span></div>').join('') + '</div>' : '')
                + (gs.length > 1 ? '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font:12px system-ui;color:#bcd9e4;">'
                    + gs.map((g) => '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;'
                        + 'border-radius:3px;background:' + colourOf(g) + ';"></span>' + esc(g) + '</span>').join('') + '</div>' : '')
                + fundsHtml(p, o, '20px')
                + '</div>';
        }

        // Year marks, at 1 January of each year inside the window (or the window's own
        // ends when it is shorter than a year).
        const ticks = [];
        for (let y = new Date(t0).getFullYear() + 1; y <= new Date(t1).getFullYear(); y++) {
            const t = new Date(y, 0, 1).getTime();
            if (t > t0 && t < t1) ticks.push({ at: pos(t), label: '' + y });
        }
        const LABEL_W = 'clamp(110px,34%,230px)';
        const gridLines = ticks.map((k) => '<div style="position:absolute;top:0;bottom:0;left:' + k.at.toFixed(2)
            + '%;border-left:1px dashed rgba(255,255,255,0.13);"></div>').join('');

        const groupsSeen = [];
        for (const x of p.phases) if (groupsSeen.indexOf(x.group) < 0) groupsSeen.push(x.group);
        const anyCost = p.phases.some((x) => x.cost != null && x.cost > 0);

        const row = (x) => {
            const l = pos(x.start), w = Math.max(0.8, pos(x.end) - l);
            const c = colourOf(x.group);
            return '<div style="display:flex;align-items:center;gap:10px;min-height:30px;">'
                + '<div style="flex:0 0 ' + LABEL_W + ';min-width:0;font:600 13px/1.25 system-ui;color:#e6f2f7;">' + esc(x.name)
                + '<div style="font:400 11.5px system-ui;color:#8fb6c6;margin-top:1px;">' + esc(month(x.start)) + ' – ' + esc(month(x.end))
                + (anyCost && x.cost ? ' · ' + esc(money(x.cost, cur, true)) : '') + '</div></div>'
                + '<div style="position:relative;flex:1 1 auto;height:18px;">' + gridLines
                + '<div title="' + esc(x.name + ': ' + month(x.start) + ' to ' + month(x.end) + (x.cost ? ', ' + money(x.cost, cur) : '')) + '" '
                + 'style="position:absolute;top:2px;bottom:2px;left:' + l.toFixed(2) + '%;width:' + w.toFixed(2) + '%;'
                + 'background:' + c + ';border-radius:5px;box-shadow:0 0 0 1px rgba(0,0,0,0.25) inset;"></div></div></div>';
        };

        // Year labels only where they clear the start and end labels, which are wider.
        const axis = '<div style="display:flex;gap:10px;margin-bottom:4px;">'
            + '<div style="flex:0 0 ' + LABEL_W + ';"></div>'
            + '<div style="position:relative;flex:1 1 auto;height:16px;font:600 11px system-ui;color:#7fb0c4;">'
            + '<span style="position:absolute;left:0;">' + esc(month(t0)) + '</span>'
            + ticks.filter((k) => k.at > 15 && k.at < 85).map((k) => '<span style="position:absolute;left:' + k.at.toFixed(2)
                + '%;transform:translateX(-50%);">' + esc(k.label) + '</span>').join('')
            + '<span style="position:absolute;right:0;">' + esc(month(t1)) + '</span></div></div>';

        const miles = p.milestones.length ? '<div style="display:flex;gap:10px;margin-top:6px;">'
            + '<div style="flex:0 0 ' + LABEL_W + ';font:600 12px system-ui;color:#8fb6c6;padding-top:3px;">Milestones</div>'
            + '<div style="position:relative;flex:1 1 auto;height:22px;">' + gridLines
            + p.milestones.map((m) => '<div title="' + esc(m.name + ', ' + month(m.at)) + '" style="position:absolute;top:5px;left:calc('
                + pos(m.at).toFixed(2) + '% - 6px);width:12px;height:12px;transform:rotate(45deg);background:#fbbf24;'
                + 'box-shadow:0 0 0 2px rgba(251,191,36,0.25);"></div>').join('')
            + '</div></div>'
            + '<div style="display:flex;gap:10px;margin-top:4px;"><div style="flex:0 0 ' + LABEL_W + ';"></div>'
            + '<div style="flex:1 1 auto;font:12px/1.6 system-ui;color:#bcd9e4;">'
            + p.milestones.map((m) => '<span style="white-space:nowrap;margin-right:14px;"><span style="color:#fbbf24;">◆</span> '
                + esc(m.name) + ' <span style="color:#7fb0c4;">' + esc(month(m.at)) + '</span></span>').join('')
            + '</div></div>' : '';

        const legend = groupsSeen.length > 1 ? '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;font:12px system-ui;color:#bcd9e4;">'
            + groupsSeen.map((g) => '<span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;'
                + 'border-radius:3px;background:' + colourOf(g) + ';"></span>' + esc(g) + '</span>').join('') + '</div>' : '';

        const funds = fundsHtml(p, o, '22px');

        return '<div class="baja-plan" style="text-align:left;">'
            + (p.name || !o.noHead ? '<div style="font:500 13.5px/1.5 system-ui;color:#bcd9e4;margin-bottom:14px;">'
                + (p.name ? '<b style="color:#eaf6f9;">' + esc(p.name) + '</b> · ' : '')
                + esc(p.phases.length + (p.phases.length === 1 ? ' stage' : ' stages')) + ' over ' + esc(span(t0, t1))
                + ', ' + esc(month(t0)) + ' to ' + esc(month(t1)) + '</div>' : '')
            + axis
            + '<div style="display:flex;flex-direction:column;gap:6px;">' + p.phases.map(row).join('') + '</div>'
            + miles + legend + funds
            + '</div>';
    };

    return { clean: clean, html: html, money: money };
}
