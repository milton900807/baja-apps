function (path, config) {

    // THE CAMPAIGN ADMINISTRATION PAGE: every campaign this account has, what each one has
    // raised, and what it actually banked.
    //
    //   /app/fundraise/admin
    //
    // One campaign is edited in fundraise/console.js. This is the page above that: the list,
    // the money, and the few things that are done TO a campaign rather than in it.
    //
    // THE TWO NUMBERS. A campaign document holds what the organiser and the reconciler have
    // put in it, and that is what the display shows: GROSS, what donors gave. Stripe takes
    // its cut before the payout, so the bank sees less, and the two numbers will never agree.
    // Rather than pick one, this page shows both: the campaign's own total in the list, and
    // gross/fees/net from Stripe in the report, which is the one to reconcile a payout
    // against. The CSV is that report, one row per donation.
    //
    // Stripe's search index lags by up to a minute, so a donation from seconds ago can be on
    // the display (which reads the document) and not yet in the report (which reads Stripe).
    return (async () => {
        const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const user = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const money = (n, cur) => {
            const v = (+n || 0);
            try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: (cur || 'USD').toUpperCase(), maximumFractionDigits: (Math.abs(v % 1) > 0.0001 ? 2 : 0) }).format(v); }
            catch (e) { return (cur || '$') + v.toLocaleString(); }
        };
        const when = (iso) => { const t = iso ? new Date(iso) : null; return (t && !isNaN(+t)) ? t.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; };

        // THE DOOR. Everyone who runs a campaign needs this page: it is where they see what
        // theirs raised, what it banked, and who gave. So the door asks only that somebody is
        // signed in, and WHOSE campaigns it shows is settled by the account, not by the door
        // -- /fundraise/campaigns lists the caller's own folder and nothing else, and
        // /stripe/donation-report refuses a campaign path that is not in it.
        //
        // The admin list still means something: an admin may pull the report for any
        // campaign, which is what makes supporting someone else's possible. It no longer
        // decides who may open the page.
        const admin = await exec('fundraise/admins.js', user);
        if (!user) {
            try { const old = document.getElementById('baja-fundraise-admin'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
            const no = document.createElement('div');
            no.id = 'baja-fundraise-admin';
            no.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#eaf6f9;display:flex;'
                + 'align-items:center;justify-content:center;padding:6vmin;box-sizing:border-box;text-align:center;'
                + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
            no.innerHTML = '<div style="max-width:46ch;">'
                + '<div style="font:700 22px system-ui;">My campaigns</div>'
                + '<div style="margin-top:10px;font:15px/1.55 system-ui;color:#9fb3c8;">'
                + 'Sign in to see the campaigns you have started, what they have raised, and the '
                + 'donations behind the total.</div>'
                + '<div style="margin-top:16px;font:13px system-ui;color:#6f93a6;">A campaign of your own is edited at '
                + '/app/fundraise/console.</div></div>';
            document.body.appendChild(no);
            try { document.title = 'My campaigns'; } catch (e) { }
            return false;
        }

        try { const old = document.getElementById('baja-fundraise-admin'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const wrap = document.createElement('div');
        wrap.id = 'baja-fundraise-admin';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#071a30;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
        const btn = (id, label, kind) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12.5px system-ui;'
            + (kind === 'go' ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                : kind === 'bad' ? 'border:1px solid rgba(252,165,165,0.5);background:transparent;color:#fca5a5;'
                    : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';
        wrap.innerHTML = ''
            + '<div style="display:flex;align-items:center;gap:16px;padding:16px 22px 14px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div><div style="font:700 20px system-ui;">' + (admin ? 'Fundraising administration' : 'My campaigns') + '</div>'
            + '<div style="font:12.5px system-ui;color:#9fb3c8;margin-top:3px;">'
            + 'Your campaigns, what each raised, and what it banked. Signed in as ' + esc(user) + '.</div></div>'
            // Home first in the row, because this page is a destination rather than a step:
            // someone who has read what their campaigns raised is finished, and the way back
            // to the three doors should not be the browser's back button.
            + '<div style="margin-left:auto;display:flex;gap:10px;">'
            + btn('fa-home', '\u2190 Home')
            // Only an admin has anywhere to go with this, and only an admin can open the
            // page behind it, so it is not shown to anyone else.
            + (admin ? btn('fa-all', 'Every campaign') : '')
            + btn('fa-refresh', 'Refresh') + btn('fa-new', 'New campaign', 'go') + '</div></div>'
            + '<div style="padding:18px 22px;">'
            + '<div id="fa-status" style="font:12.5px system-ui;color:#cfe0f5;min-height:18px;margin-bottom:10px;"></div>'
            + '<div id="fa-list"></div>'
            + '<div id="fa-detail" style="margin-top:22px;"></div>'
            + '</div>';
        document.body.appendChild(wrap);
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) wrap.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        const $ = (id) => document.getElementById(id);
        const say = (m) => { $('fa-status').textContent = m || ''; };

        // This page is a fixed, full-screen element on document.body rather than something
        // in the widget area, so clear() cannot remove it. Leaving without taking it down
        // draws the next screen underneath a sheet that is still covering the window.
        const openApp = (url, mod, args) => {
            try {
                const el = document.getElementById('baja-fundraise-admin');
                if (el && el.parentNode) el.parentNode.removeChild(el);
            } catch (e) { }
            try { clear(); } catch (e) { }
            try { window.history.pushState({}, '', url); } catch (e) { }
            return exec.apply(null, [mod].concat(args || []));
        };

        // WHAT WENT WRONG, IN WORDS.
        //
        // POSTJSON resolves rather than rejects on a non-2xx and hands back Angular's
        // HttpErrorResponse, so the server's body arrives nested under .error -- which is an
        // OBJECT. Passing that straight to new Error() is where "Could not list campaigns:
        // [object Object]" came from: the server had said exactly what was wrong and the page
        // threw the sentence away.
        //
        // So: unwrap one level if there is one, prefer the server's own description, and fall
        // back to the error code rather than to the object it sits in.
        const problem = (r) => {
            try {
                if (!r) return 'no answer from the server';
                const b = (r.error && typeof r.error === 'object') ? r.error : r;
                const code = ('' + (b.error || '')).trim();
                const said = ('' + (b.error_description || b.message || '')).trim();
                if (code === 'not_signed_in') return 'you are not signed in.';
                if (code === 'not_an_admin') return 'this server has not been updated yet, so it still '
                    + 'reserves the campaign list for one account. Run install-donation-endpoint.py on it.';
                if (code === 'not_your_campaign') return 'that campaign belongs to another account.';
                if (said) return said;
                if (code) return code;
                const st = +(r.status || 0);
                if (st === 404) return 'the server has no such endpoint (it needs install-donation-endpoint.py).';
                if (st) return 'the server answered ' + st + '.';
                return 'the server did not say.';
            } catch (e) { return 'the server did not say.'; }
        };
        const failed = (r) => !!(r && (r.error || (+r.status && +r.status >= 400)));

        let campaigns = [], picked = null, report = null, trouble = '';

        const load = async () => {
            if (!user) { say('Sign in to see your campaigns.'); return; }
            say('Reading your campaigns…');
            trouble = '';
            try {
                const r = await POSTJSON({ user: user }, host + '/fundraise/campaigns');
                if (failed(r)) { trouble = problem(r); campaigns = []; }
                else { campaigns = Array.isArray(r && r.campaigns) ? r.campaigns : []; }
            } catch (e) {
                campaigns = [];
                trouble = (e && e.message) ? e.message : ('' + e);
            }
            say('');
            drawList();
        };

        const drawList = () => {
            // Nothing to show is a thing to SAY, not a blank page. Two different nothings,
            // too: no campaigns yet, which is where everyone starts and wants a way in, and
            // a list that could not be read, which is a fault and says what it was.
            if (!campaigns.length) {
                const panel = (title, line, withBtn) => '<div style="border:1px solid rgba(255,255,255,0.14);'
                    + 'border-radius:12px;padding:26px 22px;text-align:center;background:rgba(255,255,255,0.03);">'
                    + '<div style="font:700 17px system-ui;">' + title + '</div>'
                    + '<div style="margin-top:8px;font:13.5px/1.6 system-ui;color:#9fb3c8;max-width:52ch;'
                    + 'margin-left:auto;margin-right:auto;">' + line + '</div>'
                    + (withBtn ? '<div style="margin-top:16px;">' + btn('fa-empty-new', 'Start a campaign', 'go') + '</div>' : '')
                    + '</div>';
                $('fa-list').innerHTML = trouble
                    ? panel('Could not read your campaigns', 'The server said: ' + esc(trouble), false)
                    : panel('No campaigns yet',
                        'When you start one it appears here, with what it has raised and the donations behind it.', true);
                const b = $('fa-empty-new');
                if (b) b.onclick = () => openApp('/app/fundraise/console', 'fundraise/console');
                return;
            }
            const head = ['Campaign', 'Raised', 'Goal', 'Donors', 'Donations', 'Giving', 'Updated']
                .map((h) => '<th style="text-align:left;padding:8px 10px;font:700 11px system-ui;letter-spacing:.08em;'
                    + 'text-transform:uppercase;color:#7fb0c4;border-bottom:1px solid rgba(255,255,255,0.14);">' + h + '</th>').join('');
            $('fa-list').innerHTML = '<table style="width:100%;border-collapse:collapse;">'
                + '<thead><tr>' + head + '</tr></thead><tbody>'
                + campaigns.map((c, i) => {
                    const pct = c.goal > 0 ? Math.min(100, (c.raised / c.goal) * 100) : 0;
                    const on = picked && picked.path === c.path;
                    return '<tr data-pick="' + i + '" style="cursor:pointer;background:' + (on ? 'rgba(79,208,230,0.10)' : 'transparent') + ';">'
                        + '<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.07);">'
                        + '<div style="font:600 14px system-ui;">' + esc(c.title) + '</div>'
                        + '<div style="font:11.5px system-ui;color:#6f93a6;">' + esc(c.file) + '</div></td>'
                        + '<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.07);font:700 14px system-ui;">' + esc(money(c.raised, c.currency)) + '</td>'
                        + '<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.07);font:13px system-ui;color:#9fb3c8;">'
                        + (c.goal > 0 ? esc(money(c.goal, c.currency)) + ' · ' + pct.toFixed(pct < 10 ? 1 : 0) + '%' : '—') + '</td>'
                        + '<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.07);font:13px system-ui;">' + esc('' + c.donors) + '</td>'
                        + '<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.07);font:13px system-ui;color:#9fb3c8;">'
                        + esc('' + c.gifts) + (c.fromStripe ? ' (' + c.fromStripe + ' paid)' : '') + '</td>'
                        + '<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.07);font:12.5px system-ui;">'
                        + (c.donateOn ? '<span style="color:#86efac;">on</span> <span style="color:#6f93a6;">' + esc(c.donateMode) + '</span>' : '<span style="color:#6f93a6;">off</span>') + '</td>'
                        + '<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,0.07);font:12px system-ui;color:#9fb3c8;">' + esc(when(c.updated)) + '</td>'
                        + '</tr>';
                }).join('') + '</tbody></table>';
            for (const tr of wrap.querySelectorAll('[data-pick]')) {
                tr.onclick = () => { picked = campaigns[+tr.getAttribute('data-pick')]; report = null; drawList(); drawDetail(); };
            }
        };

        const drawDetail = () => {
            const d = $('fa-detail');
            if (!picked) { d.innerHTML = ''; return; }
            const c = picked;
            // The long form works, but the short one is what a campaign is shared by: it
            // carries the preview card. Asked for once per campaign and remembered.
            let link = window.location.origin + '/app/manchester/viewer-fundraise?path=' + encodeURIComponent(c.path);
            if (c.__code) link = window.location.origin + '/f/' + c.__code;
            else {
                POSTJSON({ path: c.path }, host + '/share-alias').then((al) => {
                    if (al && al.code) { c.__code = al.code; if (picked === c) drawDetail(); }
                }).catch(() => { });
            }
            d.innerHTML = '<div style="border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:18px;background:#0b2545;">'
                + '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;">'
                + '<div style="font:700 17px system-ui;">' + esc(c.title) + '</div>'
                // The FILE, not the path. A campaign's full path begins with the AES
                // encoding of the owner's address, sixty-four characters of hex that mean
                // nothing to anyone and are the first thing on screen in a screenshot. The
                // file name is the part that identifies the campaign to a person.
                + '<div style="font:12.5px system-ui;color:#9fb3c8;">' + esc(c.file) + '</div></div>'
                + '<div style="margin-top:12px;display:flex;gap:9px;flex-wrap:wrap;">'
                + btn('fa-edit', 'Edit campaign') + btn('fa-view', 'Open the display') + btn('fa-copy', 'Copy the link')
                + btn('fa-pull', 'Pull donations') + btn('fa-recon', 'Reconcile', 'go') + btn('fa-csv', 'Export CSV')
                + '<span style="flex:1 1 20px;"></span>' + btn('fa-del', 'Delete', 'bad')
                + '</div>'
                + '<div id="fa-out" style="margin-top:12px;font:12.5px system-ui;color:#cfe0f5;min-height:18px;"></div>'
                + '<div id="fa-reportbox"></div></div>';
            const out = () => $('fa-out');

            $('fa-edit').onclick = () => openApp('/app/fundraise/console?c=' + encodeURIComponent(c.file), 'fundraise/console', ['', { path: c.path }]);
            $('fa-view').onclick = () => { try { window.open(link, '_blank', 'noopener'); } catch (e) { } };
            $('fa-copy').onclick = async () => {
                let ok = false;
                try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); ok = true; } } catch (e) { }
                out().textContent = ok ? 'Link copied.' : link;
            };
            $('fa-pull').onclick = async () => {
                out().textContent = 'Asking Stripe…';
                try {
                    const r = await POSTJSON({ path: c.path, user: user }, host + '/stripe/donation-sync');
                    if (failed(r)) throw new Error(problem(r));
                    if (r && r.skipped === 'cooldown') out().textContent = 'Just checked a moment ago; try again shortly.';
                    else if (r && r.added) { out().textContent = 'Added ' + r.added + ' donation' + (r.added === 1 ? '' : 's') + ' (' + money(r.amount, c.currency) + ').'; await load(); }
                    else out().textContent = 'Nothing new from Stripe.';
                } catch (e) { out().textContent = 'Could not reach Stripe: ' + ((e && e.message) ? e.message : e); }
            };
            $('fa-recon').onclick = async () => {
                out().textContent = 'Reading the payments…';
                try {
                    // user, because the server now answers this only for the account whose
                    // campaign it is (or an admin), and it has no other way to know who asked.
                    const r = await POSTJSON({ path: c.path, user: user }, host + '/stripe/donation-report');
                    if (failed(r)) throw new Error(problem(r));
                    report = r; out().textContent = ''; drawReport();
                } catch (e) { out().textContent = 'Could not read the payments: ' + ((e && e.message) ? e.message : e); }
            };
            $('fa-csv').onclick = async () => {
                if (!report) { out().textContent = 'Reconcile first, then the CSV has something to write.'; return; }
                const q = (v) => '"' + ('' + (v == null ? '' : v)).replace(/"/g, '""') + '"';
                const lines = [['date', 'payment_id', 'currency', 'gross', 'fee', 'net', 'name', 'email', 'receipt'].join(',')];
                for (const row of report.rows) lines.push([q(row.at), q(row.id), q(row.currency), row.gross, row.fee, row.net, q(row.name), q(row.email), q(row.receipt)].join(','));
                lines.push(['', '', q(report.currency), report.gross, report.fees, report.net, q('TOTAL'), '', ''].join(','));
                const name = ('' + c.file).replace(/\.fund$/i, '') + '-donations.csv';
                try {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
                    a.download = name; document.body.appendChild(a); a.click();
                    setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 1000);
                    out().textContent = 'Saved ' + name + '.';
                } catch (e) { out().textContent = 'Could not save the file: ' + ((e && e.message) ? e.message : e); }
            };
            // Deleting takes the display down for everyone holding the link, so it asks twice
            // and the second press is the one that does it.
            let armed = false, armTimer = null;
            $('fa-del').onclick = async () => {
                if (!armed) {
                    armed = true; $('fa-del').textContent = 'Really delete?';
                    out().textContent = 'This removes the campaign and breaks the link for anyone watching it.';
                    armTimer = setTimeout(() => { armed = false; try { $('fa-del').textContent = 'Delete'; } catch (e) { } }, 6000);
                    return;
                }
                clearTimeout(armTimer); armed = false;
                out().textContent = 'Deleting…';
                try {
                    const r = await POSTJSON({ path: c.path, key: 'user', user: user }, host + '/rm');
                    if (failed(r)) throw new Error(problem(r));
                    picked = null; report = null; await load(); drawDetail();
                    say('Deleted ' + c.title + '.');
                } catch (e) { out().textContent = 'Could not delete it: ' + ((e && e.message) ? e.message : e); }
            };
            if (report) drawReport();
        };

        const drawReport = () => {
            if (!report) return;
            const cur = report.currency;
            const cell = 'padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.07);font:12.5px system-ui;';
            const diff = (picked ? (+picked.raised || 0) : 0) - (+report.gross || 0);
            $('fa-reportbox').innerHTML = ''
                + '<div style="margin-top:14px;display:flex;gap:26px;flex-wrap:wrap;">'
                + [['Donations', '' + report.count], ['Gross', money(report.gross, cur)], ['Stripe fees', '−' + money(report.fees, cur)], ['Net to the bank', money(report.net, cur)]]
                    .map((kv) => '<div><div style="font:700 10.5px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;">' + kv[0] + '</div>'
                        + '<div style="font:700 19px system-ui;margin-top:3px;">' + esc(kv[1]) + '</div></div>').join('')
                + '</div>'
                + '<div style="margin-top:8px;font:12px system-ui;color:#6f93a6;">Read from the payment records. '
                + 'Nothing was changed: the campaign total is what it was.</div>'
                + (Math.abs(diff) > 0.009 ? '<div style="margin-top:10px;font:12.5px system-ui;color:#fcd34d;">'
                    + 'The campaign shows ' + esc(money(picked.raised, picked.currency)) + ', which is '
                    + esc(money(Math.abs(diff), cur)) + (diff > 0 ? ' more' : ' less')
                    + ' than Stripe has taken. Gifts entered by hand, cash and cheques are in the campaign and not in Stripe; '
                    + 'a donation from the last minute is in Stripe and not yet in its search index.</div>' : '')
                + (report.truncated ? '<div style="margin-top:8px;font:12.5px system-ui;color:#fcd34d;">Showing the first 100 payments.</div>' : '')
                + (report.rows.length ? '<table style="width:100%;border-collapse:collapse;margin-top:14px;">'
                    + '<thead><tr>' + ['When', 'Gross', 'Fee', 'Net', 'Name', 'Receipt'].map((h) => '<th style="text-align:left;padding:8px 10px;'
                        + 'font:700 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#7fb0c4;border-bottom:1px solid rgba(255,255,255,0.14);">'
                        + h + '</th>').join('') + '</tr></thead><tbody>'
                    + report.rows.map((r) => '<tr>'
                        + '<td style="' + cell + '">' + esc(when(r.at)) + '</td>'
                        + '<td style="' + cell + 'font-weight:700;">' + esc(money(r.gross, r.currency)) + '</td>'
                        + '<td style="' + cell + 'color:#fca5a5;">−' + esc(money(r.fee, r.currency)) + '</td>'
                        + '<td style="' + cell + 'color:#86efac;">' + esc(money(r.net, r.currency)) + '</td>'
                        + '<td style="' + cell + '">' + esc(r.name || '—') + '</td>'
                        + '<td style="' + cell + '">' + (r.receipt ? '<a href="' + esc(r.receipt) + '" target="_blank" rel="noopener" style="color:#4fd0e6;">receipt</a>' : '—') + '</td>'
                        + '</tr>').join('') + '</tbody></table>' : '');
        };

        $('fa-home').onclick = () => openApp('/app/baja/init', 'baja/init');
        if ($('fa-all')) $('fa-all').onclick = () => openApp('/app/fundraise/super', 'fundraise/super');
        $('fa-refresh').onclick = () => load();
        $('fa-new').onclick = () => openApp('/app/fundraise/console', 'fundraise/console');
        await load();
        try { document.title = admin ? 'Fundraising administration' : 'My campaigns'; } catch (e) { }
        return true;
    })();
}
