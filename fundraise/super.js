function (path, config) {

    // EVERY CAMPAIGN ON THE SERVER, and the few things that are done TO one.
    //
    //   /app/fundraise/super
    //
    // The page above fundraise/admin.js. That one is each organiser's own list; this one is
    // every account that has published a campaign, read from the folders themselves rather
    // than from any register: one directory per account under the user-data root, named with
    // the AES encoding of the address, which the server decodes to show who it belongs to.
    //
    // THE REFUSAL HERE IS NOT WHAT KEEPS ANYONE OUT. The two endpoints behind this page are
    // restricted to FUNDRAISE_ADMINS on the server, which is what actually holds; turning the
    // wrong account away here only saves them a 403 and a blank screen.
    //
    // Editing opens the ordinary console with the owner's address and folder passed as
    // arguments, so it saves back where the campaign lives. Deleting takes the picture and
    // the team faces with it, which the per-user page still does not.
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
        const ID = 'baja-fundraise-super';
        const gone = () => { try { const el = document.getElementById(ID); if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) { } };
        const sheet = (title, line) => {
            gone();
            const no = document.createElement('div');
            no.id = ID;
            no.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#0a1626;color:#eaf6f9;display:flex;'
                + 'align-items:center;justify-content:center;padding:6vmin;box-sizing:border-box;text-align:center;'
                + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
            no.innerHTML = '<div style="max-width:46ch;"><div style="font:700 22px system-ui;">' + title + '</div>'
                + '<div style="margin-top:10px;font:15px/1.55 system-ui;color:#9fb3c8;">' + line + '</div></div>';
            document.body.appendChild(no);
            try { document.title = 'Every campaign'; } catch (e) { }
        };

        if (!(await exec('fundraise/admins.js', user))) {
            sheet('Every campaign', user
                ? 'This page is for the account that runs the platform, and ' + esc(user) + ' is not it.'
                : 'Sign in with the account that runs the platform to open this page.');
            return false;
        }

        // The whole screen, as its own element on document.body rather than in the widget
        // area: it is a page, not a panel. Everything that leaves takes it down first --
        // clear() empties the widget area and cannot touch this.
        gone();
        const wrap = document.createElement('div');
        wrap.id = ID;
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#0a1626;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
        const btn = (id, label, kind) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12.5px system-ui;'
            + (kind === 'go' ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                : kind === 'bad' ? 'border:1px solid rgba(252,165,165,0.5);background:transparent;color:#fca5a5;'
                    : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';
        wrap.innerHTML = ''
            + '<div style="display:flex;align-items:center;gap:16px;padding:16px 22px 14px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div><div style="font:700 20px system-ui;">Every campaign</div>'
            + '<div id="fs-sub" style="font:12.5px system-ui;color:#9fb3c8;margin-top:3px;">Every account on this server, and what each campaign has raised.</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;">'
            + btn('fs-home', '← Home') + btn('fs-mine', 'My campaigns') + btn('fs-refresh', 'Refresh') + '</div></div>'
            + '<div style="padding:18px 22px;">'
            + '<div id="fs-status" style="font:12.5px system-ui;color:#cfe0f5;min-height:18px;margin-bottom:10px;"></div>'
            + '<div id="fs-list"></div></div>';
        document.body.appendChild(wrap);
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) wrap.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        try { document.title = 'Every campaign'; } catch (e) { }
        const $ = (id) => document.getElementById(id);
        const say = (m) => { const el = $('fs-status'); if (el) el.textContent = m || ''; };

        const openApp = (url, mod, args) => {
            gone();
            try { clear(); } catch (e) { }
            try { window.history.pushState({}, '', url); } catch (e) { }
            return exec.apply(null, [mod].concat(args || []));
        };
        const problem = (r) => {
            try {
                if (!r) return 'no answer from the server';
                const b = (r.error && typeof r.error === 'object') ? r.error : r;
                const code = ('' + (b.error || '')).trim();
                const said = ('' + (b.error_description || b.message || '')).trim();
                if (code === 'not_an_admin') return 'the server does not have this account in FUNDRAISE_ADMINS.';
                if (said) return said;
                if (code) return code;
                const st = +(r.status || 0);
                if (st === 404) return 'the server has no such endpoint yet (it needs install-donation-endpoint.py).';
                return st ? ('the server answered ' + st + '.') : 'the server did not say.';
            } catch (e) { return 'the server did not say.'; }
        };
        const failed = (r) => !!(r && (r.error || (+r.status && +r.status >= 400)));

        let users = [], trouble = '', open = {};

        const load = async () => {
            say('Reading every account…');
            trouble = '';
            try {
                const r = await POSTJSON({ user: user }, host + '/fundraise/all-campaigns');
                if (failed(r)) { trouble = problem(r); users = []; }
                else {
                    users = Array.isArray(r && r.users) ? r.users : [];
                    $('fs-sub').textContent = users.length
                        ? (r.accounts + (r.accounts === 1 ? ' account, ' : ' accounts, ') + r.campaigns
                            + (r.campaigns === 1 ? ' campaign' : ' campaigns') + ' on this server.')
                        : 'Nobody has published a campaign yet.';
                }
            } catch (e) { users = []; trouble = (e && e.message) ? e.message : ('' + e); }
            say('');
            draw();
        };

        const row = (u, c) => {
            const pct = c.goal > 0 ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0;
            return '<tr data-enc="' + esc(u.enc) + '" data-file="' + esc(c.file) + '" style="border-top:1px solid rgba(255,255,255,0.08);">'
                + '<td style="padding:9px 10px;"><div style="font:600 13.5px system-ui;">' + esc(c.title) + '</div>'
                + '<div style="font:11.5px system-ui;color:#7fa3b8;">' + esc(c.file) + '</div></td>'
                + '<td style="padding:9px 10px;white-space:nowrap;">' + money(c.raised, c.currency)
                + (c.goal > 0 ? ' <span style="color:#7fa3b8;">of ' + money(c.goal, c.currency) + ' (' + pct + '%)</span>' : '') + '</td>'
                + '<td style="padding:9px 10px;white-space:nowrap;">' + (+c.donors || 0) + '</td>'
                + '<td style="padding:9px 10px;white-space:nowrap;color:' + (c.donateOn ? '#86efac' : '#7fa3b8') + ';">'
                + (c.donateOn ? 'taking donations' : 'off') + '</td>'
                + '<td style="padding:9px 10px;white-space:nowrap;color:#9fb3c8;">' + esc(when(c.updated)) + '</td>'
                + '<td style="padding:9px 10px;white-space:nowrap;text-align:right;">'
                + '<button data-act="view" style="cursor:pointer;margin-left:6px;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;border-radius:7px;padding:6px 10px;font:700 11.5px system-ui;">Display</button>'
                + '<button data-act="edit" style="cursor:pointer;margin-left:6px;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;border-radius:7px;padding:6px 10px;font:700 11.5px system-ui;">Edit</button>'
                + '<button data-act="del" style="cursor:pointer;margin-left:6px;border:1px solid rgba(252,165,165,0.5);background:transparent;color:#fca5a5;border-radius:7px;padding:6px 10px;font:700 11.5px system-ui;">Delete</button>'
                + '</td></tr>';
        };

        const draw = () => {
            const box = $('fs-list');
            if (!box) return;
            if (trouble) {
                box.innerHTML = '<div style="border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:26px 22px;'
                    + 'text-align:center;background:rgba(255,255,255,0.03);">'
                    + '<div style="font:700 17px system-ui;">Could not read the accounts</div>'
                    + '<div style="margin-top:8px;font:13.5px/1.6 system-ui;color:#9fb3c8;">The server said: ' + esc(trouble) + '</div></div>';
                return;
            }
            if (!users.length) {
                box.innerHTML = '<div style="border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:26px 22px;'
                    + 'text-align:center;background:rgba(255,255,255,0.03);">'
                    + '<div style="font:700 17px system-ui;">No campaigns on this server yet</div>'
                    + '<div style="margin-top:8px;font:13.5px/1.6 system-ui;color:#9fb3c8;">'
                    + 'An account appears here as soon as it publishes one.</div></div>';
                return;
            }
            box.innerHTML = users.map((u) => {
                const shown = open[u.enc] !== false;        // open by default: this is a list to read
                const total = u.campaigns.reduce((a, c) => a + (+c.raised || 0), 0);
                const cur = (u.campaigns[0] && u.campaigns[0].currency) || 'USD';
                return '<div style="margin-bottom:16px;border:1px solid rgba(255,255,255,0.12);border-radius:12px;overflow:hidden;">'
                    + '<div data-acct="' + esc(u.enc) + '" style="cursor:pointer;display:flex;align-items:center;gap:12px;'
                    + 'padding:11px 14px;background:rgba(255,255,255,0.05);">'
                    + '<span style="font:12px system-ui;color:#7fa3b8;width:12px;">' + (shown ? '▾' : '▸') + '</span>'
                    + '<span style="font:700 14px system-ui;">' + esc(u.readable ? u.user : '(an account whose name will not decode)') + '</span>'
                    + '<span style="font:11.5px system-ui;color:#7fa3b8;">' + u.campaigns.length
                    + (u.campaigns.length === 1 ? ' campaign' : ' campaigns') + ', ' + money(total, cur) + ' raised</span>'
                    + '<span style="margin-left:auto;">'
                    + '<button data-new="' + esc(u.enc) + '" style="cursor:pointer;border:1px solid #22c55e;background:#22c55e;'
                    + 'color:#04210f;border-radius:7px;padding:6px 11px;font:700 11.5px system-ui;">New campaign</button></span></div>'
                    + (shown ? '<table style="width:100%;border-collapse:collapse;font:13px system-ui;">'
                        + '<thead><tr style="text-align:left;color:#7fa3b8;font:600 11px system-ui;letter-spacing:.06em;text-transform:uppercase;">'
                        + ['Campaign', 'Raised', 'Donors', 'Giving', 'Updated', ''].map((h) => '<th style="padding:8px 10px;font-weight:600;">' + h + '</th>').join('')
                        + '</tr></thead><tbody>' + u.campaigns.map((c) => row(u, c)).join('') + '</tbody></table>' : '')
                    + '</div>';
            }).join('');
        };

        // One listener for the whole page rather than a handler per button: the list is
        // redrawn on every change, and handlers attached to a row do not survive that.
        let armed = '';
        wrap.addEventListener('click', async (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            const acct = t.closest('[data-acct]');
            const nw = t.closest('[data-new]');
            const act = t.closest('[data-act]');
            if (nw) {
                const enc = nw.getAttribute('data-new');
                const u = users.filter((x) => x.enc === enc)[0];
                if (!u) return;
                return openApp('/app/fundraise/console', 'fundraise/console', ['', { owner: u.user, enc: u.enc }]);
            }
            if (act) {
                const tr = act.closest('[data-enc]');
                if (!tr) return;
                const enc = tr.getAttribute('data-enc'), file = tr.getAttribute('data-file');
                const u = users.filter((x) => x.enc === enc)[0];
                const c = u && u.campaigns.filter((x) => x.file === file)[0];
                if (!u || !c) return;
                const what = act.getAttribute('data-act');
                if (what === 'view') {
                    try { window.open(window.location.origin + '/app/manchester/viewer-fundraise?path='
                        + encodeURIComponent(c.path), '_blank', 'noopener'); } catch (x) { }
                    return;
                }
                if (what === 'edit') {
                    return openApp('/app/fundraise/console?path=' + encodeURIComponent(c.path), 'fundraise/console',
                        ['', { path: c.path, owner: u.user, enc: u.enc }]);
                }
                if (what === 'del') {
                    // Deleting takes the display down for everyone holding the link, and this
                    // page can do it to someone else's campaign, so it asks twice.
                    const key = enc + '|' + file;
                    if (armed !== key) {
                        armed = key;
                        act.textContent = 'Really delete?';
                        say('This removes "' + c.title + '" from ' + (u.user || 'that account')
                            + ', with its picture and team photographs, and breaks the link for anyone watching it.');
                        setTimeout(() => { if (armed === key) { armed = ''; try { act.textContent = 'Delete'; } catch (x) { } say(''); } }, 6000);
                        return;
                    }
                    armed = '';
                    say('Deleting…');
                    try {
                        const r = await POSTJSON({ user: user, enc: enc, name: file, remove: true }, host + '/fundraise/all-file');
                        if (failed(r)) throw new Error(problem(r));
                        say('Deleted ' + c.title + ' (' + (r.removed || 0) + ' file' + (r.removed === 1 ? '' : 's') + ').');
                        await load();
                    } catch (x) { say('Could not delete it: ' + ((x && x.message) ? x.message : x)); }
                    return;
                }
            }
            if (acct) {
                const enc = acct.getAttribute('data-acct');
                open[enc] = (open[enc] === false);
                draw();
            }
        }, false);

        $('fs-home').onclick = () => openApp('/app/baja/init', 'baja/init');
        $('fs-mine').onclick = () => openApp('/app/fundraise/admin', 'fundraise/admin');
        $('fs-refresh').onclick = () => load();

        await load();
        return true;
    })();
}
