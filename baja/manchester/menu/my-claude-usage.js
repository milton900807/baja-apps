function () {
    // "My Claude usage" — show the signed-in user how many Claude-powered searches they have
    // run today (plus a per-feature breakdown and a 7-day strip). Self-contained so it can be
    // launched from the account menu (no `graph` context): identity comes from getUser(), the
    // count from py/usage/claude-usage-report.py (backed by py/ion-lib/claude_usage.py).
    return (async () => {
        let r = null;
        const email = (typeof getUser === 'function') ? ('' + (getUser() || '')) : '';
        try {
            const em = new EngineMonitor(() => { });
            r = await exec('/py/usage/claude-usage-report.py', em, email, '7');
        } catch (e) {
            try { if (typeof infoPrompt === 'function') infoPrompt('Could not read Claude usage: ' + (e && e.message ? e.message : e)); } catch (e2) { }
            return;
        }
        const total = (r && r.total_today) || 0;
        try {
            const bf = (r && r.by_feature_today) || {};
            const feats = Object.keys(bf).sort((a, b) => bf[b] - bf[a]);
            const rows = feats.map((f) => '<tr><td style="padding:2px 16px 2px 0;">' + f + '</td>'
                + '<td style="text-align:right;font-weight:700;">' + bf[f] + '</td></tr>').join('');
            const daily = (r && r.daily) || [];
            const spark = daily.map((d) => '<td style="padding:0 6px;text-align:center;font:11px monospace;color:#8fb8c8;">'
                + ('' + d.day).slice(5) + '<br><b style="color:#eaf6f9;font-size:13px;">' + d.count + '</b></td>').join('');
            const who = (r && r.email) || email || 'you';
            const html = '<div style="padding:18px 22px;font-family:Segoe UI,system-ui,Arial,sans-serif;color:#eaf6f9;background:#0b1f3a;">'
                + '<div style="font-size:13px;color:#8fb8c8;">Claude searches today &mdash; ' + who + '</div>'
                + '<div style="font-size:44px;font-weight:800;margin:4px 0 2px;">' + total + '</div>'
                + (rows ? ('<table style="margin-top:12px;font-size:13px;border-collapse:collapse;">'
                    + '<tr><th style="text-align:left;color:#8fb8c8;font-weight:600;">By feature</th><th></th></tr>'
                    + rows + '</table>')
                    : '<div style="color:#8fb8c8;font-size:13px;margin-top:8px;">No searches yet today.</div>')
                + (spark ? ('<div style="margin-top:16px;font-size:12px;color:#8fb8c8;">Last 7 days</div>'
                    + '<table style="margin-top:4px;border-collapse:collapse;"><tr>' + spark + '</tr></table>') : '')
                + '</div>';
            if (typeof showModal === 'function') showModal({ wid: 'html', data: html });
            else if (typeof infoPrompt === 'function') infoPrompt('You have run ' + total + ' Claude search' + (total === 1 ? '' : 'es') + ' today.');
        } catch (e) {
            try { if (typeof infoPrompt === 'function') infoPrompt('You have run ' + total + ' Claude search' + (total === 1 ? '' : 'es') + ' today.'); } catch (e2) { }
        }
    })();
}
