function () {
    // "CREDITS USAGE" — what the signed-in user has spent on AI-powered work, and on what.
    //
    // ONE CREDIT IS ONE US CENT of model usage. A count of actions was what this used to
    // show, and an action is not a unit of anything: reading a pasted paragraph and running
    // a genome-wide screen are both one. The credits come from the tokens the model actually
    // billed (py/ion-lib/claude_usage.py records them; py/usage/claude-usage-report.py reads
    // them back), so a figure here can be checked against a bill rather than taken on trust.
    //
    // NOTHING IS ENFORCED. This reports; it does not stand between anyone and their work.
    //
    // Self-contained, so it can be launched from the account menu with no `graph` context:
    // identity comes from getUser().
    return (async () => {
        const email = (typeof getUser === 'function') ? ('' + (getUser() || '')) : '';
        let r = null;
        try {
            const em = new EngineMonitor(() => { });
            r = await exec('/py/usage/claude-usage-report.py', em, email, '30');
        } catch (e) {
            try { if (typeof infoPrompt === 'function') infoPrompt('Could not read your credits usage: ' + (e && e.message ? e.message : e)); } catch (e2) { }
            return;
        }
        if (!r) {
            try { if (typeof infoPrompt === 'function') infoPrompt('Could not read your credits usage.'); } catch (e2) { }
            return;
        }

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // Credits read as whole numbers once there are a few of them; a single short answer
        // is worth a fraction of one and saying "0" for it would be wrong.
        const cr = (v) => {
            const n = Number(v) || 0;
            if (n === 0) return '0';
            if (n < 1) return n.toFixed(2);
            if (n < 100) return n.toFixed(1);
            return Math.round(n).toLocaleString();
        };
        const num = (v) => (Number(v) || 0).toLocaleString();
        const money = (v) => '$' + (Number(v) || 0).toFixed(2);
        const title = (f) => ('' + (f || '')).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        const who = r.email || email || 'you';
        const today = Number(r.credits_today) || 0;
        const month = Number(r.credits_month) || 0;
        const total = Number(r.credits_total) || 0;
        const feats = (r.by_feature || []).filter((f) => f && (Number(f.credits) || 0) > 0);
        // WHAT WAS COUNTED BEFORE IT WAS PRICED. The meter counted actions per user, day and
        // feature long before it recorded tokens, so a history of real work reads as nothing
        // against the measured figure alone. Those actions are priced at what the same
        // feature has since been measured to cost per call -- which is an estimate, is shown
        // as one, and is never added into a measured number.
        const est = Number(r.credits_estimated) || 0;
        const estActions = Number(r.actions_estimated) || 0;
        const estWeak = Number(r.credits_estimated_weak) || 0;
        const estFeats = (r.estimated_by_feature || []).filter((f) => f && (Number(f.credits) || 0) > 0);
        const pricedSince = r.priced_since || '';
        const models = (r.by_model || []).filter((m) => m && (Number(m.credits) || 0) > 0);
        const daily = (r.daily_credits || []);
        const actions = Number(r.total_today) || 0;

        const C = { ink: '#eaf6f9', dim: '#8fb8c8', bg: '#0b1f3a', card: '#122c4e',
                    line: 'rgba(255,255,255,0.10)', accent: '#38bdf8', warm: '#fbbf24' };

        const stat = (label, value, sub) => ''
            + '<div style="flex:1 1 0;min-width:150px;background:' + C.card + ';border:1px solid ' + C.line + ';'
            + 'border-radius:12px;padding:14px 16px;">'
            + '<div style="font:600 11px/1.3 system-ui,Segoe UI,Arial;letter-spacing:.08em;text-transform:uppercase;color:' + C.dim + ';">' + esc(label) + '</div>'
            + '<div style="font:800 30px/1.2 system-ui,Segoe UI,Arial;color:' + C.ink + ';margin-top:5px;">' + value + '</div>'
            + (sub ? '<div style="font:12px system-ui,Segoe UI,Arial;color:' + C.dim + ';margin-top:2px;">' + sub + '</div>' : '')
            + '</div>';

        // The bars are drawn against the busiest day, not against a fixed scale: a quiet
        // month should look like a quiet month, not like an empty chart.
        const peak = daily.reduce((m, d) => Math.max(m, Number(d.credits) || 0), 0);
        const bars = daily.map((d) => {
            const v = Number(d.credits) || 0;
            const h = peak > 0 ? Math.max(2, Math.round((v / peak) * 52)) : 2;
            const isToday = d.day === r.today;
            return '<td style="vertical-align:bottom;padding:0 1px;" title="' + esc(d.day) + ' — ' + cr(v) + ' credits">'
                + '<div style="height:' + h + 'px;border-radius:3px 3px 0 0;background:' + (isToday ? C.warm : C.accent) + ';'
                + 'opacity:' + (v > 0 ? 1 : 0.25) + ';"></div></td>';
        }).join('');
        const firstDay = daily.length ? ('' + daily[0].day).slice(5) : '';
        const lastDay = daily.length ? ('' + daily[daily.length - 1].day).slice(5) : '';

        const featRows = feats.map((f) => {
            const share = month > 0 ? Math.round(((Number(f.credits) || 0) / month) * 100) : 0;
            return '<tr>'
                + '<td style="padding:7px 12px 7px 0;color:' + C.ink + ';">' + esc(title(f.feature)) + '</td>'
                + '<td style="padding:7px 12px 7px 0;text-align:right;color:' + C.dim + ';">' + num(f.calls) + '</td>'
                + '<td style="padding:7px 12px 7px 0;text-align:right;color:' + C.dim + ';">' + num(f.tokens) + '</td>'
                + '<td style="padding:7px 0;text-align:right;font-weight:700;color:' + C.ink + ';white-space:nowrap;">' + cr(f.credits)
                + '<span style="color:' + C.dim + ';font-weight:400;font-size:12px;"> · ' + share + '%</span></td>'
                + '</tr>';
        }).join('');

        const modelRow = models.map((m) => '<span style="display:inline-block;margin:0 8px 8px 0;padding:4px 10px;'
            + 'border:1px solid ' + C.line + ';border-radius:999px;font:12px system-ui,Segoe UI,Arial;color:' + C.dim + ';">'
            + esc(m.model) + ' <b style="color:' + C.ink + ';">' + cr(m.credits) + '</b>'
            + (m.priced === false ? ' <span style="color:' + C.warm + ';" title="no price on file — charged at the standard rate">≈</span>' : '')
            + '</span>').join('');

        const html = ''
            + '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:' + C.ink + ';background:' + C.bg + ';'
            + 'padding:22px 26px 26px;min-width:560px;max-width:760px;">'
            + '<div style="font:800 21px/1.2 system-ui,Segoe UI,Arial;">Credits usage</div>'
            + '<div style="font:13px system-ui,Segoe UI,Arial;color:' + C.dim + ';margin-top:3px;">'
            + esc(who) + ' &middot; one credit is one US cent of AI usage</div>'

            + '<div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap;">'
            + stat('Today', cr(today), actions ? (num(actions) + ' AI action' + (actions === 1 ? '' : 's')) : 'no AI actions yet')
            + stat('This month', cr(month), money(r.usd_month))
            + stat('All time', cr(total), money(r.usd_total) + (est ? ' measured' : ''))
            + (est ? stat('Estimated before', cr(est), money(r.usd_estimated) + ' \u00b7 ' + num(estActions) + ' earlier actions') : '')
            + '</div>'
            + (est
                ? ('<div style="margin-top:12px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.28);'
                    + 'border-radius:10px;padding:12px 14px;font:12.5px/1.55 system-ui,Segoe UI,Arial;color:' + C.dim + ';">'
                    + '<b style="color:' + C.warm + ';">Estimated, not measured.</b> '
                    + 'Your usage was counted before it was priced'
                    + (pricedSince ? (' \u2014 tokens have been recorded since ' + esc(pricedSince)) : '')
                    + '. The ' + num(estActions) + ' action' + (estActions === 1 ? '' : 's')
                    + ' before that are priced here at what the same features have since been measured to cost per call, '
                    + 'so this figure is an indication of scale and not a bill.'
                    + (estWeak > 0
                        ? (' <b style="color:' + C.ink + ';">' + cr(estWeak) + ' of it</b> is for features that have never been '
                            + 'measured at all, priced at the average across everything that has \u2014 treat that part more loosely still.')
                        : '')
                    + '</div>')
                : '')

            + (daily.length
                ? ('<div style="margin-top:22px;font:600 11px system-ui,Segoe UI,Arial;letter-spacing:.08em;'
                    + 'text-transform:uppercase;color:' + C.dim + ';">Last ' + daily.length + ' days</div>'
                    + '<table style="width:100%;margin-top:8px;border-collapse:collapse;height:56px;"><tr>' + bars + '</tr></table>'
                    + '<div style="display:flex;justify-content:space-between;font:11px system-ui,Segoe UI,Arial;color:' + C.dim + ';margin-top:4px;">'
                    + '<span>' + esc(firstDay) + '</span>'
                    + '<span>peak ' + cr(peak) + '</span>'
                    + '<span>' + esc(lastDay) + '</span></div>')
                : '')

            + (featRows
                ? ('<div style="margin-top:24px;font:600 11px system-ui,Segoe UI,Arial;letter-spacing:.08em;'
                    + 'text-transform:uppercase;color:' + C.dim + ';">Where this month went</div>'
                    + '<table style="width:100%;margin-top:6px;border-collapse:collapse;font:13px system-ui,Segoe UI,Arial;">'
                    + '<tr style="color:' + C.dim + ';font-size:11px;letter-spacing:.06em;text-transform:uppercase;">'
                    + '<th style="text-align:left;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Feature</th>'
                    + '<th style="text-align:right;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Calls</th>'
                    + '<th style="text-align:right;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Tokens</th>'
                    + '<th style="text-align:right;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Credits</th></tr>'
                    + featRows + '</table>')
                : ('<div style="margin-top:22px;color:' + C.dim + ';font:13px system-ui,Segoe UI,Arial;">'
                    + 'Nothing has been spent this month.</div>'))

            + (modelRow
                ? ('<div style="margin-top:22px;font:600 11px system-ui,Segoe UI,Arial;letter-spacing:.08em;'
                    + 'text-transform:uppercase;color:' + C.dim + ';">By model</div>'
                    + '<div style="margin-top:8px;">' + modelRow + '</div>')
                : '')

            + (estFeats.length
                ? ('<div style="margin-top:24px;font:600 11px system-ui,Segoe UI,Arial;letter-spacing:.08em;'
                    + 'text-transform:uppercase;color:' + C.dim + ';">Estimated, before pricing began</div>'
                    + '<table style="width:100%;margin-top:6px;border-collapse:collapse;font:13px system-ui,Segoe UI,Arial;">'
                    + '<tr style="color:' + C.dim + ';font-size:11px;letter-spacing:.06em;text-transform:uppercase;">'
                    + '<th style="text-align:left;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Feature</th>'
                    + '<th style="text-align:right;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Actions</th>'
                    + '<th style="text-align:right;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Priced at</th>'
                    + '<th style="text-align:right;padding-bottom:6px;border-bottom:1px solid ' + C.line + ';">Credits</th></tr>'
                    + estFeats.map((f) => '<tr>'
                        + '<td style="padding:7px 12px 7px 0;color:' + C.ink + ';">' + esc(title(f.feature)) + '</td>'
                        + '<td style="padding:7px 12px 7px 0;text-align:right;color:' + C.dim + ';">' + num(f.actions) + '</td>'
                        + '<td style="padding:7px 12px 7px 0;text-align:right;color:' + (f.own_rate ? C.dim : C.warm) + ';font-size:12px;">'
                        + (f.own_rate ? 'its own measured rate' : 'the overall average') + '</td>'
                        + '<td style="padding:7px 0;text-align:right;font-weight:700;color:' + C.dim + ';white-space:nowrap;">~' + cr(f.credits) + '</td>'
                        + '</tr>').join('')
                    + '</table>')
                : '')

            + '<div style="margin-top:22px;padding-top:12px;border-top:1px solid ' + C.line + ';'
            + 'font:12px/1.5 system-ui,Segoe UI,Arial;color:' + C.dim + ';">'
            + 'Credits are a record of what your AI-powered work cost, priced from the tokens each '
            + 'model billed. Nothing here limits what you can run. '
            + (est ? 'Measured and estimated figures are kept apart throughout: the three cards on the '
                + 'left are measured, the one marked estimated is not.' : '')
            + ((r.unpriced_models && r.unpriced_models.length)
                ? ('<br>' + esc(r.unpriced_models.join(', ')) + ' has no price on file and is charged at the standard rate.')
                : '')
            + '</div>'
            + '</div>';

        try {
            if (typeof showModal === 'function') { showModal({ wid: 'html', data: html }); return; }
        } catch (e) { }
        try {
            if (typeof infoPrompt === 'function') {
                infoPrompt('Credits used — today ' + cr(today) + ', this month ' + cr(month) + ', all time ' + cr(total) + '.');
            }
        } catch (e) { }
    })();
}
