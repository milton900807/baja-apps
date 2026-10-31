function (path, config) {

    // THE FUNDRAISING CONSOLE: type in a total, publish a public display.
    //
    //   /app/fundraise/console                     a new campaign
    //   /app/fundraise/console?path=<public path>  edit the one already published there
    //
    // Two screens make the app. This one is the organiser's, behind the usual sign-in: a
    // title, a goal, the amount raised so far, and a Publish that writes the campaign into
    // the owner's public folder and hands back a short link. The other is
    // manchester/viewer-fundraise.js, which anyone can open without an account and which
    // re-reads the document every few seconds -- so raising the number here moves the
    // thermometer on a screen in the room, with nobody touching it.
    //
    // TWO LEVELS, and this screen fills both. The display itself is the number; everything
    // that wants reading up close -- what the money is for, who has given, what has happened
    // since -- goes on the campaign's details page, one button away from the total. Gifts and
    // updates are entered here because the display is open without a sign-in: a page anyone
    // can open is not a page anyone may write to.
    //
    // Nothing new on the server: this is the same publish path a shared genome takes
    // (/save-user-data into `public`, a .share marker beside it, /share-alias for the short
    // code), which is why the display can be read by `public` with no session.
    return (async () => {
        const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const user = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();
        const qp = (k) => { try { return new URL(window.location.href).searchParams.get(k); } catch (e) { return null; } };

        // EDITING SOMEBODY ELSE'S CAMPAIGN, from the superadmin page and from nowhere else.
        //
        // owner and enc arrive as an exec() argument, never from the URL: a query parameter
        // would let anyone claim to be editing for anyone. With them set, the writes go to
        // /fundraise/all-file, which is behind the admin list on the server -- so the
        // capability lives there, where it can be checked, rather than here where it would
        // only be a claim. Without them nothing changes: a campaign is saved into the
        // signed-in account's own folder, as it always was.
        // Two ways to be in somebody else's campaign, and they are not the same thing.
        // `all-file` is the superadmin's: any campaign on the box, because the account is
        // on the admin list. `edit-file` is an invitation: the owner put this address on
        // that one campaign's list, and the server checks the list rather than the claim.
        const forOther = (() => {
            try {
                const o = ('' + ((config && config.owner) || '')).trim();
                const e = ('' + ((config && config.enc) || '')).trim();
                if (!o || !e || o.toLowerCase() === user.toLowerCase()) return null;
                return { owner: o, enc: e, via: (config && config.shared) ? 'edit-file' : 'all-file' };
            } catch (e) { return null; }
        })();
        const asGuest = !!(forOther && forOther.via === 'edit-file');

        // One way to write a campaign file, whoever it belongs to. The server's own reply
        // shapes differ, so this gives the caller the one shape the publish code reads.
        const putFile = async (name, value) => {
            if (forOther) {
                // The guest route is given the campaign, not the account: what it may
                // write is decided by the list attached to that one campaign.
                const body = asGuest
                    ? { user: user, path: docPath, name: name, value: value }
                    : { user: user, enc: forOther.enc, name: name, value: value };
                const r = await POSTJSON(body, host + '/fundraise/' + forOther.via);
                if (!r || r.error || (r.status && +r.status >= 400)) return r || {};
                return { status: 'saved', path: r.path };
            }
            return await POSTJSON({ name: name, key: 'user', user: user, spath: 'public', value: value },
                host + '/save-user-data');
        };

        // What went wrong, in words. An HttpErrorResponse keeps the server's own JSON
        // under .error, so the naive read of this is "[object Object]".
        const problemText = (r) => {
            try {
                if (!r) return 'no answer from the server';
                const b2 = (r.error && typeof r.error === 'object') ? r.error : r;
                const said = ('' + (b2.error_description || b2.message || '')).trim();
                if (said) return said;
                const code = ('' + (b2.error || '')).trim();
                if (code === 'not_signed_in') return 'you are not signed in';
                if (code === 'not_your_campaign') return 'that campaign belongs to another account';
                if (code) return code;
                const st = +(r.status || 0);
                return st ? ('the server answered ' + st) : 'the server did not say why';
            } catch (e) { return 'the server did not say why'; }
        };

        const CUR = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY'];
        const money = (n, cur) => {
            const v = (+n || 0);
            try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: (v % 1 ? 2 : 0) }).format(v); }
            catch (e) { return (cur || '$') + v.toLocaleString(); }
        };
        // "1,250", "$1,250", "1250.50", "1.2k", "2M" all mean a number here: a figure read off
        // a cheque or a spreadsheet should not have to be retyped to be accepted.
        const parseMoney = (s) => {
            let t = ('' + (s == null ? '' : s)).trim().replace(/[^0-9.,kKmM-]/g, '');
            if (!t) return 0;
            let mult = 1;
            const last = t[t.length - 1];
            if (/[kK]/.test(last)) { mult = 1e3; t = t.slice(0, -1); }
            else if (/[mM]/.test(last)) { mult = 1e6; t = t.slice(0, -1); }
            // 1,250.50 -> 1250.50 ; 1.250,50 -> 1250.50
            if (t.indexOf(',') >= 0 && t.indexOf('.') >= 0) {
                t = (t.lastIndexOf(',') > t.lastIndexOf('.')) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
            } else if ((t.match(/,/g) || []).length === 1 && /,\d{1,2}$/.test(t)) t = t.replace(',', '.');
            else t = t.replace(/,/g, '');
            const v = parseFloat(t);
            return isFinite(v) ? v * mult : 0;
        };
        const slug = (s) => ('' + (s || 'campaign')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'campaign';

        // ---- state ------------------------------------------------------------------------
        let doc = {
            kind: 'fundraise', title: 'Our campaign', subtitle: '', currency: 'USD',
            goal: 100000, raised: 0, donors: 0, note: '', updated: '',
            story: '', hideGiftAmounts: false, gifts: [], updates: [],
            // How a visitor gives. 'checkout' asks this server for a Stripe Checkout session
            // with the amount the donor picked; 'link' opens a Payment Link made in the Stripe
            // dashboard. Which payment methods appear -- card, Apple Pay, Google Pay, Link,
            // Cash App, Klarna, bank debits -- is a Stripe dashboard setting in both cases,
            // not something this page chooses, so turning one on there turns it on here.
            // ON. A campaign exists to be given to, and a display with no way to give is
            // the one thing nobody wants to discover after sharing the link. It is still a
            // checkbox: turning it off is one click, and the screen says in as many words
            // what a donor is offered.
            donate: { on: true, mode: 'checkout', label: 'Donate', url: '', amounts: [25, 50, 100, 250], custom: true },
            // A picture is NOT kept in here. The display re-reads this document every few
            // seconds, and a photograph in it would be re-downloaded on every one of those
            // reads, on every screen. The document names a sibling file instead, and the
            // display fetches that once and again only when imageV changes.
            // docFile is the slide deck, kept in a sibling file for the same reason the
            // picture is: a presentation is megabytes, and this document is re-read every
            // few seconds by every screen watching the campaign.
            media: { theme: 'deep', imageFile: '', imageV: 0, imageMode: 'banner', youtube: '',
                docFile: '', docV: 0, docName: '', docKind: '', docBytes: 0 },
            // The people behind the campaign. Their faces are NOT in here either, for the
            // same reason the campaign photograph is not: this document is re-read every few
            // seconds. Names and roles are a few bytes and stay; the portraits live in a
            // sibling file, fetched once.
            team: [], teamV: 0, teamFile: ''
        };
        const TEAM_MAX = 16;
        const teamArr = () => (Array.isArray(doc.team) ? doc.team : (doc.team = []));
        const med = () => (doc.media && typeof doc.media === 'object' ? doc.media
            : (doc.media = { theme: 'deep', imageFile: '', imageV: 0, imageMode: 'banner', youtube: '' }));
        // THE LOOKS A CAMPAIGN CAN WEAR. id, label, the group it is listed under, then the
        // three colours of its background: inner, middle, outer. An empty middle means a
        // flat background rather than a glow.
        //
        // All of them are dark, because the display puts a white total over the background
        // and that has to carry to the back of a room. A pale theme is not a theme here, it
        // is a rewrite of the display's type colours.
        //
        // THE SAME TABLE IS IN manchester/viewer-fundraise.js. Two modules with no import
        // between them: change one and change the other, or this console's preview stops
        // telling the truth about what gets published.
        const THEMES = [
            ['deep', 'Deep blue', 'Blues and teals', '#123a63', '#0a1e3a', '#071526'],
            ['ocean', 'Ocean', 'Blues and teals', '#0e4a6b', '#063149', '#04202f'],
            ['teal', 'Teal', 'Blues and teals', '#0d5157', '#06333a', '#032126'],
            ['ice', 'Ice', 'Blues and teals', '#27456b', '#142742', '#0a1424'],
            ['steel', 'Steel', 'Blues and teals', '#2c3f52', '#16222e', '#0a1016'],
            ['forest', 'Forest', 'Greens', '#14492f', '#0b2a1d', '#061712'],
            ['moss', 'Moss', 'Greens', '#2d5132', '#16291b', '#0a150e'],
            ['mint', 'Mint', 'Greens', '#0f5742', '#073228', '#04211a'],
            ['warm', 'Warm', 'Warm', '#5a2b1b', '#311611', '#1a0c08'],
            ['ember', 'Ember', 'Warm', '#6b2a14', '#38140a', '#1c0906'],
            ['amber', 'Amber', 'Warm', '#6b4c12', '#3a2808', '#1c1304'],
            ['sand', 'Sand', 'Warm', '#4a4030', '#262013', '#13100a'],
            ['coral', 'Coral', 'Reds and pinks', '#7a2f2a', '#42140f', '#210907'],
            ['wine', 'Wine', 'Reds and pinks', '#5c1533', '#30091b', '#19050e'],
            ['rose', 'Rose', 'Reds and pinks', '#6b2342', '#3a1124', '#1e0812'],
            ['violet', 'Violet', 'Purples', '#43236b', '#251241', '#130a22'],
            ['plum', 'Plum', 'Purples', '#4e1a56', '#2a0c2f', '#16061a'],
            ['berry', 'Berry', 'Purples', '#591a4a', '#300d28', '#190615'],
            ['indigo', 'Indigo', 'Purples', '#2b2b6e', '#15153a', '#0a0a1f'],
            ['midnight', 'Midnight', 'Purples', '#241b4e', '#140f2e', '#0a0718'],
            ['slate', 'Slate', 'Darks', '#1e2733', '#121923', '#0a0e14'],
            ['night', 'Night', 'Darks', '#0b1020', '#080c18', '#05070f'],
            ['graphite', 'Graphite', 'Darks', '#23272e', '', '#0b0c0f'],
            ['plain', 'Plain dark', 'Darks', '#0d1420', '', '#0a0f18'],
        ];
        const THEME_BY = {};
        for (const t of THEMES) THEME_BY[t[0]] = t;
        const themeCss = (id) => {
            const t = THEME_BY[id] || THEME_BY.deep;
            return t[4]
                ? 'radial-gradient(600px 300px at 50% -20%,' + t[3] + ' 0%,' + t[4] + ' 55%,' + t[5] + ' 100%)'
                : 'linear-gradient(' + t[3] + ',' + t[5] + ')';
        };
        // youtu.be/ID, watch?v=ID, /embed/ID, /shorts/ID, or the id on its own.
        const ytId = (v) => {
            const t = ('' + (v || '')).trim();
            if (!t) return '';
            if (/^[\w-]{11}$/.test(t)) return t;
            const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
            return m ? m[1] : '';
        };
        const don = () => (doc.donate && typeof doc.donate === 'object' ? doc.donate
            : (doc.donate = { on: true, mode: 'checkout', label: 'Donate', url: '', amounts: [25, 50, 100, 250], custom: true }));
        // Both lists are newest first, and capped: a document that grows without a bound is
        // one the display eventually cannot load.
        const CAP = 200;
        const arr = (k) => (Array.isArray(doc[k]) ? doc[k] : (doc[k] = []));
        // WHICH CAMPAIGN IS OPEN, WITHOUT PUTTING ITS FOLDER IN THE ADDRESS BAR.
        //
        // The full path of a campaign is /<64 hex characters>/public/<name>.fund, where the
        // hex is the AES encoding of the owner's address. It carries nothing a person can
        // read or needs, it is the first thing anyone sees if a screen is shared or a
        // screenshot is sent, and it was sitting in the URL because that was the easy way to
        // tell this screen which campaign to open.
        //
        // The screen is told by the caller instead, as an argument. The address bar keeps
        // only the file name -- ?c=stxbp1-related-disorders.fund -- which is enough to find
        // the campaign again after a reload, since /fundraise/campaigns lists the signed-in
        // account's own and nobody else's. An old ?path= link still works and is cleaned out
        // of the address bar on sight.
        let docPath = '' + ((config && config.path) || path || qp('path') || '');
        let fileName = '';
        let publicLink = '';

        if (!docPath && qp('c')) {
            const want = ('' + qp('c')).trim();
            try {
                const r = await POSTJSON({ user: user }, host + '/fundraise/campaigns');
                const list = (r && Array.isArray(r.campaigns)) ? r.campaigns : [];
                const hit = list.filter((x) => x && x.file === want)[0];
                if (hit) docPath = hit.path;
            } catch (e) { }
        }

        // READING THE CAMPAIGN BACK, which has to work or this screen is dangerous.
        //
        // It used to be one call in a try with an empty catch. When that call did not come
        // back with a campaign -- a reload, where the page had not been handed anything and
        // had to find it by name -- the console carried on with its DEFAULTS: "Our
        // campaign", no goal, nothing raised, over a campaign that was live. The status
        // said Live, because it knew a campaign was there, and Publish would have written
        // that blank over somebody's fundraiser.
        //
        // So: ask more than one way, because /load-file takes more than one shape and which
        // one answers depends on how the file was written; and if none of them answers,
        // SAY SO and refuse to publish, rather than quietly offering a blank page.
        let loadTrouble = '';
        if (docPath) {
            const shapes = [
                // Asked for by campaign rather than by file when this is somebody else's:
                // it is the one route that answers for a guest whatever /load-file wants.
                { __to: '/fundraise/read-file', path: docPath, user: user },
                { path: docPath, key: 'user', user: user },
                { path: docPath, user: 'public' },
                { path: '/user' + docPath, key: 'user', user: user },
            ];
            let got = null, last = null;
            for (const body of shapes) {
                try {
                    const to = body.__to || '/load-file';
                    if (body.__to) delete body.__to;
                    const rs = await POSTJSON(body, host + to);
                    let d = rs;
                    if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
                    if (d && typeof d === 'object' && (d.kind === 'fundraise' || d.goal != null)) { got = d; break; }
                    last = rs;
                } catch (e) { last = e; }
            }
            fileName = docPath.substring(docPath.lastIndexOf('/') + 1);
            if (got) doc = Object.assign(doc, got);
            else loadTrouble = problemText(last);
        }

        // The address bar, tidied. A campaign of one's own is named by its file; somebody
        // else's, open from the superadmin page, is named by nothing at all -- the console
        // was handed it, and a reload has no business guessing its way back into another
        // account's folder.
        try {
            const clean = '/app/fundraise/console'
                + ((fileName && !forOther) ? ('?c=' + encodeURIComponent(fileName)) : '');
            if (window.location.pathname + window.location.search !== clean) {
                window.history.replaceState({}, '', clean);
            }
        } catch (e) { }

        // ---- the screen --------------------------------------------------------------------
        // NOT A PAGE FOR A STRANGER. Everything here writes into someone's own folder and
        // publishes under their name, so without an account there is nothing this screen
        // could usefully do. The display is the public half; this is not it.
        try { const old = document.getElementById('baja-fundraise-console'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        if (!user) {
            const no = document.createElement('div');
            no.id = 'baja-fundraise-console';
            no.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#eaf6f9;display:flex;'
                + 'align-items:center;justify-content:center;padding:6vmin;box-sizing:border-box;text-align:center;'
                + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
            no.innerHTML = '<div style="max-width:44ch;">'
                + '<div style="font:700 22px system-ui;">Fundraising</div>'
                + '<div style="margin-top:10px;font:15px/1.55 system-ui;color:#9fb3c8;">Sign in to run a campaign. '
                + 'A campaign is published from your own files and under your own name, so this screen needs an account.</div>'
                + '<div style="margin-top:16px;font:13px system-ui;color:#6f93a6;">A published display needs no account: '
                + 'anyone with its link can watch it.</div></div>';
            document.body.appendChild(no);
            try { document.title = 'Fundraising'; } catch (e) { }
            return false;
        }
        const WRAP = 'baja-fundraise-console';
        const phone = (() => {
            try { return typeof isMobile === 'function' && !!isMobile(); } catch (e) { return false; }
        })();
        const wrap = document.createElement('div');
        wrap.id = WRAP;
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#071a30;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
        // WHICH OF THESE HAVE TO BE FILLED IN: one, the name. Everything else has a sensible
        // nothing -- no goal draws no goal, no picture draws the theme, no story hides the
        // details page -- but nobody can tell that by looking at a form, and a screen with
        // fourteen fields reads as fourteen obligations. So each one says "(optional)" and
        // the single required field says that instead. Currency and the look of the display
        // are not marked: they are choices between given values, never blank.
        const lbl = 'display:block;font:600 12px system-ui;color:#9fb3c8;margin:14px 0 5px;';
        const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);'
            + 'border-radius:8px;padding:9px 11px;font:14px system-ui;';
        const btn = (id, label, kind) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px system-ui;'
            + (kind === 'go' ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';

        wrap.innerHTML = ''
            + '<div class="fc-head" style="display:flex;align-items:center;gap:16px;padding:16px 22px 14px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div><div style="font:700 20px system-ui;">Fundraising</div>'
            + '<div class="fc-blurb" style="font:12.5px system-ui;color:#9fb3c8;margin-top:3px;">'
            + (forOther
                ? (asGuest
                    ? '<b style="color:#fde68a;">' + esc(forOther.owner) + '</b> shared this campaign with you. '
                        + 'Your changes go to their copy, which is the one people are watching.'
                    : 'Editing a campaign that belongs to <b style="color:#fde68a;">' + esc(forOther.owner) + '</b>. It saves back into their folder.')
                : 'Enter the total raised, then publish a display anyone can open.')
            + '</div></div>'
            // Whose campaign this is, on screen: a campaign is published under the signed-in
            // account's name, into its folder, and at an event there is usually more than one
            // laptop and more than one person near it.
            // The pill is also the way out of here. It is the one thing on this screen that
            // names the account, so it is where someone looks to leave the account, and the
            // other two places anyone goes from a campaign are the same two menu items.
            + '<div id="fc-who-wrap" style="margin-left:18px;position:relative;">'
            + '<button id="fc-who" type="button" style="display:block;text-align:left;cursor:pointer;'
            + 'padding:6px 30px 6px 12px;border:1px solid rgba(255,255,255,0.16);border-radius:999px;'
            + 'background:rgba(255,255,255,0.04);color:inherit;font:inherit;">'
            + '<div style="font:600 10.5px system-ui;letter-spacing:.1em;'
            + 'text-transform:uppercase;color:#7fb0c4;">Signed in as</div>'
            + '<div style="font:600 13px system-ui;margin-top:2px;">' + esc(user) + '</div>'
            + '<span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font:10px system-ui;'
            + 'color:#7fb0c4;">\u25be</span></button>'
            + '<div id="fc-who-menu" style="display:none;position:absolute;right:0;top:calc(100% + 6px);z-index:30;'
            + 'min-width:210px;background:#0b2545;border:1px solid rgba(255,255,255,0.18);border-radius:12px;'
            + 'box-shadow:0 18px 40px rgba(0,0,0,0.45);overflow:hidden;">'
            + ['home|Home', 'files|My files', 'campaigns|My campaigns', 'out|Sign out'].map((x) => {
                const k = x.split('|')[0], label = x.split('|')[1];
                return '<button type="button" data-go="' + k + '" style="display:block;width:100%;text-align:left;'
                    + 'cursor:pointer;border:0;background:none;color:' + (k === 'out' ? '#fca5a5' : '#eaf6f9') + ';'
                    + 'padding:11px 14px;font:600 13px system-ui;'
                    + (k === 'out' ? 'border-top:1px solid rgba(255,255,255,0.12);' : '') + '">' + label + '</button>';
            }).join('')
            + '</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;align-items:center;">'
            + '<span id="fc-live-wrap" style="position:relative;display:inline-flex;">'
            + '<button type="button" id="fc-live" aria-haspopup="true" aria-expanded="false"'
            + ' style="display:inline-flex;align-items:center;gap:7px;border-radius:999px;'
            + 'padding:7px 13px;font:600 12px system-ui;white-space:nowrap;cursor:pointer;"></button>'
            + '<div id="fc-live-menu" role="menu" style="display:none;position:absolute;top:calc(100% + 8px);right:0;'
            + 'min-width:250px;background:#0b2545;border:1px solid rgba(255,255,255,0.18);border-radius:10px;'
            + 'box-shadow:0 18px 44px rgba(0,0,0,0.5);overflow:hidden;z-index:6;text-align:left;"></div></span>'
            + btn('fc-cancel', 'Cancel') + btn('fc-all', 'All campaigns')
            + btn('fc-open', 'Open the display') + btn('fc-publish', 'Publish', 'go') + '</div></div>'
            + '<div id="fc-alarm" style="display:none;margin:14px 22px 0;padding:12px 15px;border-radius:10px;'
            + 'border:1px solid rgba(252,165,165,0.5);background:rgba(127,29,29,0.35);font:13px/1.6 system-ui;color:#fecaca;"></div>'
            + '<div id="fc-draft" style="display:none;margin:14px 22px 0;padding:12px 15px;border-radius:10px;'
            + 'border:1px solid rgba(251,191,36,0.5);background:rgba(120,83,10,0.28);font:13px/1.6 system-ui;color:#fde68a;"></div>'
            + '<div class="fc-body" style="padding:22px;display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;">'
            + '<div class="fc-col" style="flex:1 1 420px;max-width:560px;">'
            + '<label style="' + lbl + '">Campaign <span style="color:#7fb0c4;font-weight:600;">(required)</span></label><input id="fc-title" style="' + inp + '"/>'
            + '<div id="fc-name-out" style="margin-top:5px;font:12px system-ui;min-height:15px;"></div>'
            + '<label style="' + lbl + '">A line under it (optional)</label><input id="fc-sub" style="' + inp + '"/>'
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<div style="flex:1 1 120px;"><label style="' + lbl + '">Currency</label><select id="fc-cur" style="' + inp + '">'
            + CUR.map((c) => '<option value="' + c + '">' + c + '</option>').join('') + '</select></div>'
            + '<div style="flex:2 1 180px;"><label style="' + lbl + '">Raised so far (optional)</label><input id="fc-raised" inputmode="decimal" style="' + inp + '"/></div>'
            + '<div style="flex:2 1 180px;"><label style="' + lbl + '">Goal (optional)</label><input id="fc-goal" inputmode="decimal" style="' + inp + '"/></div>'
            + '</div>'
            + '<label style="' + lbl + '">Add a gift (optional)</label>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
            + '<input id="fc-gift" inputmode="decimal" placeholder="amount" style="' + inp + 'flex:0 0 120px;"/>'
            + '<input id="fc-gift-name" placeholder="who gave it (optional)" style="' + inp + 'flex:1 1 150px;"/>'
            + '<input id="fc-gift-note" placeholder="a word about it (optional)" style="' + inp + 'flex:1 1 160px;"/>'
            + btn('fc-add', '+ Add') + '</div>'
            + '<div style="margin-top:8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
            + '<input id="fc-donors" inputmode="numeric" placeholder="donors (optional)" style="' + inp + 'flex:0 0 170px;"/>'
            + '<label style="font:12.5px system-ui;color:#9fb3c8;display:flex;align-items:center;gap:7px;cursor:pointer;">'
            + '<input id="fc-hide" type="checkbox" style="accent-color:#22c55e;"/> hide amounts on the details page</label>'
            + '</div>'
            + '<div id="fc-gifts" style="margin-top:10px;"></div>'
            + '<label style="' + lbl + '">A message on the display (optional)</label>'
            + '<textarea id="fc-note" rows="3" style="' + inp + 'resize:vertical;"></textarea>'
            + '<div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.12);">'
            + '<div style="font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;">The details page</div>'
            + '<div style="margin-top:5px;font:12.5px system-ui;color:#9fb3c8;">One button away from the total, for everything that '
            + 'wants reading up close rather than from the back of a room.</div></div>'
            + '<label style="' + lbl + '">About this campaign (optional)</label>'
            + '<textarea id="fc-story" rows="5" placeholder="What the money is for. Blank lines start new paragraphs." style="' + inp + 'resize:vertical;"></textarea>'
            + '<label style="' + lbl + '">Post an update (optional)</label>'
            + '<input id="fc-upd-title" placeholder="headline (optional)" style="' + inp + '"/>'
            + '<textarea id="fc-upd" rows="3" placeholder="We passed halfway at 9pm…" style="' + inp + 'resize:vertical;margin-top:8px;"></textarea>'
            + '<div style="margin-top:8px;">' + btn('fc-post', 'Post update') + '</div>'
            + '<div id="fc-updates" style="margin-top:10px;"></div>'
            + '<label style="' + lbl + '">Look of the display</label>'
            + '<select id="fc-theme" style="' + inp + '">'
            + (() => {   // grouped: two dozen in one flat list is a list nobody reads to the end of
                let out = '', group = '';
                for (const t of THEMES) {
                    if (t[2] !== group) { if (group) out += '</optgroup>'; group = t[2]; out += '<optgroup label="' + esc(group) + '">'; }
                    out += '<option value="' + t[0] + '">' + esc(t[1]) + '</option>';
                }
                return out + (group ? '</optgroup>' : '');
            })() + '</select>'
            + '<label style="' + lbl + '">A picture (optional)</label>'
            + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
            + '<input id="fc-img" type="file" accept="image/*" style="font:12.5px system-ui;color:#9fb3c8;max-width:250px;"/>'
            + '<select id="fc-img-mode" style="' + inp + 'flex:0 0 185px;">'
            + '<option value="background">behind the whole display</option>'
            + '<option value="banner">above the title</option></select>'
            + btn('fc-img-clear', 'Remove') + '</div>'
            + '<div id="fc-img-out" style="margin-top:6px;font:12px system-ui;color:#6f93a6;"></div>'
            + '<div id="fc-img-prev" style="margin-top:8px;"></div>'
            + '<label style="' + lbl + '">A presentation (optional)</label>'
            + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
            + '<input id="fc-doc" type="file" accept=".pdf,.ppt,.pptx,application/pdf,'
            + 'application/vnd.ms-powerpoint,'
            + 'application/vnd.openxmlformats-officedocument.presentationml.presentation" '
            + 'style="font:12.5px system-ui;color:#9fb3c8;max-width:250px;"/>'
            + btn('fc-doc-clear', 'Remove') + '</div>'
            + '<div style="margin-top:5px;font:11.5px/1.5 system-ui;color:#6f93a6;">'
            + 'A PDF opens in the page itself. A PowerPoint can only be offered as a download, '
            + 'so save it as a PDF if you want people to read it where they are.</div>'
            + '<div id="fc-doc-out" style="margin-top:6px;font:12px system-ui;color:#6f93a6;"></div>'
            + '<div style="margin-top:10px;font:12px system-ui;color:#9fb3c8;">No picture of your own? '
            + 'Pick one of these.</div>'
            + '<div id="fc-stock" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:7px;"></div>'
            + '<label style="' + lbl + '">The team (optional)</label>'
            + '<div style="font:12px system-ui;color:#9fb3c8;margin-bottom:7px;">Who is behind the campaign. Shown on the details page.</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
            + '<input id="fc-tm-name" placeholder="name" style="' + inp + 'flex:1 1 140px;"/>'
            + '<input id="fc-tm-role" placeholder="role (optional)" style="' + inp + 'flex:1 1 140px;"/>'
            + '</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">'
            + '<input id="fc-tm-note" placeholder="a line about them (optional)" style="' + inp + 'flex:1 1 220px;"/>'
            + '<input id="fc-tm-img" type="file" accept="image/*" style="font:12px system-ui;color:#9fb3c8;max-width:190px;"/>'
            + btn('fc-tm-add', '+ Add') + '</div>'
            + '<div id="fc-tm-out" style="margin-top:6px;font:12px system-ui;color:#6f93a6;min-height:15px;"></div>'
            + '<div id="fc-team" style="margin-top:8px;"></div>'
            + '<label style="' + lbl + '">A film (YouTube, optional)</label>'
            + '<input id="fc-yt" placeholder="https://youtu.be/… — shown on the details page" style="' + inp + '"/>'
            + '<div id="fc-yt-out" style="margin-top:5px;font:12px system-ui;color:#6f93a6;min-height:15px;"></div>'
            + '<div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.12);">'
            + '<label style="font:12.5px system-ui;color:#eaf6f9;display:flex;align-items:center;gap:8px;cursor:pointer;">'
            + '<input id="fc-don-on" type="checkbox" style="accent-color:#22c55e;"/>'
            + '<span style="font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;">Take donations</span></label>'
            + '<div id="fc-don-box" style="display:none;">'
            + '<div style="margin-top:6px;font:12.5px system-ui;color:#9fb3c8;">A donor pays on a secure page, and the '
            + 'money arrives in your own account. Which methods they are offered -- card, Apple Pay, Link and the rest -- '
            + 'is set once on your payment account rather than per campaign, and each one also depends on the donor\'s '
            + 'device and country: Apple Pay shows for someone in Safari with a card in their wallet, and needs nothing '
            + 'from this page.</div>'
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<div style="flex:1 1 150px;"><label style="' + lbl + '">Button label (optional)</label><input id="fc-don-label" style="' + inp + '"/></div>'
            + '</div>'
            + '<label style="' + lbl + '">Suggested amounts (optional)</label>'
            + '<input id="fc-don-amts" placeholder="25, 50, 100, 250" style="' + inp + '"/>'
            + '<label style="margin-top:8px;font:12.5px system-ui;color:#9fb3c8;display:flex;align-items:center;gap:7px;cursor:pointer;">'
            + '<input id="fc-don-custom" type="checkbox" style="accent-color:#22c55e;"/> let a donor type their own amount</label>'
            + '<label style="margin-top:8px;font:12.5px system-ui;color:#9fb3c8;display:flex;align-items:center;gap:7px;cursor:pointer;">'
            + '<input id="fc-don-names" type="checkbox" style="accent-color:#22c55e;"/> publish donor names from Stripe '
            + '<span style="color:#6f93a6;">(off: they appear as Anonymous)</span></label>'
            + '<div id="fc-don-warn" style="margin-top:8px;font:12.5px system-ui;color:#fca5a5;"></div>'
            + '</div></div>'
            + '<div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.12);'
            + 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
            + btn('fc-publish2', 'Publish', 'go') + btn('fc-open2', 'Open the display') + btn('fc-cancel2', 'Cancel')
            + '<span id="fc-pub-note" style="font:12px system-ui;color:#6f93a6;">Nothing on the display changes until you publish.</span></div>'
            // WHAT PUBLISHING COMMITS YOU TO. Said next to the button rather than buried in
            // terms nobody opens: a campaign that claims a cure, or dresses up something
            // that is not science, costs the next family on the directory their trust in
            // all of it.
            + '<div id="fc-terms" style="margin-top:12px;padding:11px 13px;border-radius:9px;'
            + 'border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);'
            + 'font:12.5px/1.55 system-ui;color:#bcd2e2;max-width:640px;">'
            + '<b style="color:#eaf6f9;">Before you publish.</b> Campaigns on Gene.Clinic are '
            + 'for real research and real patient need. Anything judged to be pseudoscience, '
            + 'or not science at all, will be taken down, as will any campaign that promises a '
            + 'cure, misrepresents a treatment or an outcome, or asks for money for care that '
            + 'has no evidence behind it. Gene.Clinic may refuse, unlist or remove any campaign '
            + 'at any time, at its own discretion, with or without a reason given. Publishing '
            + 'means you accept that.</div>'
            + '<div id="fc-status" style="margin-top:14px;font:12.5px system-ui;color:#cfe0f5;min-height:18px;"></div>'
            + '<div id="fc-link" style="margin-top:6px;font:12.5px system-ui;word-break:break-all;"></div>'
            + '</div>'
            + '<div class="fc-col fc-side" style="flex:1 1 380px;min-width:300px;">'
            + '<div style="font:600 12px system-ui;color:#9fb3c8;margin:14px 0 5px;">What the display shows</div>'
            + '<div id="fc-prev" style="border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:22px 18px;text-align:center;'
            + 'background:radial-gradient(600px 300px at 50% -20%,#123a63 0%,#0a1e3a 60%,#071526 100%);"></div>'
            + '<div style="margin-top:10px;font:11.5px system-ui;color:#6f93a6;">The published display re-reads the campaign every few seconds, '
            + 'so raising the total here moves it on screen without anyone reloading the page.</div>'
            + '</div></div>';
        document.body.appendChild(wrap);

        // One always-on rule: the slow pulse on the "edits not published" dot. Everything
        // else this console styles is inline on the element that needs it; an animation
        // cannot be.
        if (!document.getElementById('fc-anim')) {
            const an = document.createElement('style');
            an.id = 'fc-anim';
            an.textContent = '@keyframes fcWait{0%,100%{opacity:1}50%{opacity:0.35}}';
            document.head.appendChild(an);
        }

        // ---- ON A PHONE ----------------------------------------------------------------
        //
        // One stylesheet rather than a conditional in every style string. The markup here is
        // built from inline styles, which beat a stylesheet, so each rule that has to win
        // says so; the ones that are only setting a value a phone has no opinion about are
        // left alone.
        //
        // What actually goes wrong on a phone, in order of how much it hurts:
        //   * the header is a row of four buttons and an account pill beside a title, and at
        //     390px it either overflows or squeezes the title to nothing. It stacks.
        //   * an input under 16px makes iOS Safari ZOOM the page when it is focused, and the
        //     page never zooms back. Every field is 16px.
        //   * a 9px-tall button is not a tap target. Everything tappable is at least 44px,
        //     which is the smallest Apple and Google both consider reliable.
        //   * the two columns are 420px and 380px wide, so they do not sit side by side
        //     anyway; saying so explicitly stops the min-width forcing a sideways scroll.
        //   * the account menu is positioned to the right of a pill that is now full width.
        if (phone) {
            const st = document.createElement('style');
            st.id = 'fc-phone';
            st.textContent = [
                '#' + WRAP + ' .fc-head{flex-wrap:wrap!important;gap:10px!important;padding:12px 14px 12px!important;}',
                '#' + WRAP + ' .fc-head > div:first-child{flex:1 1 100%!important;}',
                // A sentence explaining the screen is worth a line on a laptop and worth
                // forty pixels of a phone, which is the wrong trade when the account pill
                // and four buttons are under it. The one case it stays is the one where it
                // says something that is not obvious: whose campaign is open.
                (forOther ? '' : '#' + WRAP + ' .fc-blurb{display:none!important;}'),
                '#' + WRAP + ' #fc-who-wrap{margin-left:0!important;flex:1 1 100%!important;}',
                '#' + WRAP + ' #fc-who{width:100%!important;}',
                '#' + WRAP + ' #fc-who-menu{left:0!important;right:auto!important;width:100%!important;}',
                // The status menu hangs off a pill that is no longer on the right of a wide
                // header: anchored to its right edge it runs off the left of the screen.
                '#' + WRAP + ' #fc-live-menu{left:0!important;right:auto!important;'
                    + 'min-width:0!important;width:calc(100vw - 28px)!important;max-width:calc(100vw - 28px)!important;}',
                '#' + WRAP + ' .fc-head > div:last-child{flex:1 1 100%!important;flex-wrap:wrap!important;}',
                '#' + WRAP + ' .fc-body{padding:14px!important;gap:16px!important;}',
                '#' + WRAP + ' .fc-col{flex:1 1 100%!important;max-width:100%!important;min-width:0!important;}',
                '#' + WRAP + ' input,#' + WRAP + ' select,#' + WRAP + ' textarea{font-size:16px!important;padding:11px 12px!important;}',
                '#' + WRAP + ' button{min-height:44px!important;padding:10px 16px!important;}',
                // The menu is a list of destinations, not a row of controls: it keeps its own
                // height so four of them do not fill the screen.
                '#' + WRAP + ' #fc-who-menu button{min-height:46px!important;}',
                '#' + WRAP + ' img{max-width:100%!important;height:auto!important;}',
                '#' + WRAP + '{-webkit-text-size-adjust:100%;}',
            ].join('\n');
            wrap.appendChild(st);
        }
        // The editor shell listens for these on the document; a form must keep its own.
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) wrap.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        const $ = (id) => document.getElementById(id);

        // The picture lives beside the campaign, named after it, so one campaign's photograph
        // cannot land on another's display.
        const imgFileFor = () => (fileName || (slug(doc.title) + '.fund')).replace(/\.fund$/i, '') + '.fundimg';
        const siblingPath = (file) => {
            const base = ('' + docPath).replace(/[^/]*$/, '');
            return base ? base + file : '';
        };
        const readImage = async () => {
            const m = med();
            if (!m.imageFile) return;
            const sp = siblingPath(m.imageFile);
            if (!sp) return;
            try {
                const rs = await POSTJSON({ path: sp, key: 'user', user: user }, host + '/load-file');
                let d = rs;
                if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
                if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
                if (d && d.dataUri) { loadedImage = '' + d.dataUri; imgUI(); preview(); }
            } catch (e) { }
        };

        // THE PRESENTATION. Whatever somebody would have handed round the room: the deck,
        // the one-pager, the protocol summary. It rides in its own sibling file, like the
        // picture, and the display fetches it only when a reader asks for it rather than on
        // the refresh everybody gets.
        //
        // 12MB, which is a long deck of slides or a short one with photographs in it. The
        // limit is here rather than left to the server because a 60MB upload that fails
        // after two minutes of waiting is a worse answer than a refusal in the same second.
        const DOC_BYTES = 12 * 1024 * 1024;
        const docFileFor = () => (fileName || (slug(doc.title) + '.fund')).replace(/\.fund$/i, '') + '.funddoc';
        let pendingDoc = null, docGone = false;
        const niceBytes = (n) => (n >= 1024 * 1024
            ? ((n / 1024 / 1024).toFixed(1) + 'MB')
            : (Math.max(1, Math.round(n / 1024)) + 'KB'));
        const docUI = () => {
            const m = med();
            const have = pendingDoc || (!docGone && m.docFile);
            const name = pendingDoc ? pendingDoc.name : (m.docName || m.docFile);
            const kind = pendingDoc ? pendingDoc.kind : m.docKind;
            const bytes = pendingDoc ? pendingDoc.bytes : (+m.docBytes || 0);
            // Describes the published one, and otherwise says nothing: the handlers put
            // their own sentence here (what was taken, what Remove will do) and this runs
            // after them, so clearing the line here would wipe what they just said.
            const el = $('fc-doc-out');
            if (el && have && !pendingDoc) {
                el.textContent = name + ' · ' + (bytes ? niceBytes(bytes) + ' · ' : '')
                    + (kind === 'pdf' ? 'opens in the page' : 'offered as a download');
            }
            const b = $('fc-doc-clear');
            if (b) b.style.display = have ? '' : 'none';
        };
        const readFileAsDataUri = (f) => new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error('that file could not be read'));
            fr.onload = () => resolve('' + fr.result);
            fr.readAsDataURL(f);
        });

        // THE TEAM. Names and roles ride in the campaign document; the portraits go in one
        // sibling file, as a square each, so a page of faces costs one fetch rather than one
        // per person and the document the display re-reads stays a kilobyte.
        let teamFaces = {}, teamDirty = false;
        const teamFileFor = () => (fileName || (slug(doc.title) + '.fund')).replace(/\.fund$/i, '') + '.fundteam';
        const readTeam = async () => {
            if (!doc.teamFile) return;
            const sp = siblingPath(doc.teamFile);
            if (!sp) return;
            try {
                const rs = await POSTJSON({ path: sp, key: 'user', user: user }, host + '/load-file');
                let d = rs;
                if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
                if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
                if (d && d.faces && typeof d.faces === 'object') { teamFaces = d.faces; teamList(); }
            } catch (e) { }
        };
        // A face is cropped square and kept small: it is drawn at the size of a coin.
        const squareFace = (file) => new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error('that file could not be read'));
            fr.onload = () => {
                const im = new Image();
                im.onerror = () => reject(new Error('that file is not an image this browser can read'));
                im.onload = () => {
                    try {
                        const N = 320, side = Math.min(im.width, im.height);
                        const cv = document.createElement('canvas');
                        cv.width = N; cv.height = N;
                        cv.getContext('2d').drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, N, N);
                        resolve(cv.toDataURL('image/jpeg', 0.8));
                    } catch (e) { reject(e); }
                };
                im.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
        const teamList = () => {
            const t = teamArr();
            $('fc-team').innerHTML = !t.length ? '' : '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:8px;">'
                + t.map((m, i) => '<div style="display:flex;gap:10px;align-items:center;padding:7px 10px;'
                    + (i ? 'border-top:1px solid rgba(255,255,255,0.08);' : '') + '">'
                    + (teamFaces[m.id]
                        ? '<img src="' + esc(teamFaces[m.id]) + '" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex:0 0 auto;"/>'
                        : '<div style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.10);flex:0 0 auto;"></div>')
                    + '<div style="flex:1 1 auto;min-width:0;">'
                    + '<div style="font:600 13.5px system-ui;">' + esc(m.name)
                    + (m.role ? '<span style="color:#9fb3c8;font-weight:400;"> · ' + esc(m.role) + '</span>' : '') + '</div>'
                    + (m.note ? '<div style="font:12.5px system-ui;color:#9fb3c8;">' + esc(m.note) + '</div>' : '') + '</div>'
                    + '<button data-tm="' + esc(m.id) + '" title="Remove" style="cursor:pointer;border:0;background:transparent;'
                    + 'color:#7fb0c4;font:700 15px system-ui;line-height:1;padding:0 2px;">×</button>'
                    + '</div>').join('') + '</div>';
            for (const b of wrap.querySelectorAll('[data-tm]')) {
                b.onclick = () => {
                    const id = b.getAttribute('data-tm');
                    doc.team = teamArr().filter((m) => m.id !== id);
                    if (teamFaces[id]) { delete teamFaces[id]; teamDirty = true; }
                    teamList(); preview(); touch();
                    $('fc-tm-out').textContent = 'Removed. Publish to put that on the details page.';
                };
            }
        };

        // A PICTURE, SHRUNK BEFORE IT GOES ANYWHERE. A photograph straight off a phone is
        // several megabytes, and the display is often a laptop on a hotel wifi. It is drawn
        // into a canvas at a sane size and re-encoded as a JPEG, which turns 6MB into a
        // couple of hundred KB without anyone in the room being able to tell.
        // ---- PICTURES FOR A CAMPAIGN THAT HAS NONE -------------------------------------
        //
        // Drawn, not photographed. A stock photograph of somebody else's child on a page
        // about your own is worse than no picture at all, and these cost a few hundred
        // bytes of markup each instead of a download.
        //
        // Grouped and in their own colours, because a page of thirty pictures in one green
        // is a page of one picture. Each entry is [label, group, background from,
        // background to, accent, draw].
        //
        // A chosen one goes through the same path an uploaded photograph does: drawn onto
        // a canvas at 1200x630 and saved as a JPEG. It is not kept as SVG, because the
        // link-preview endpoint serves raster formats only -- a campaign that picked a
        // drawing would otherwise share with no picture at all.
        const ART = {
            // ---- rare disease ----------------------------------------------------------
            ribbon: ['Awareness ribbon', 'Rare disease', '#241b4e', '#140f2e', '#c4a2ff', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="26" stroke-linecap="round">'
                + '<path d="M556 524 C578 482 600 456 612 430 C640 374 668 358 664 308'
                + ' C660 248 620 220 600 220 C580 220 540 248 536 308'
                + ' C532 358 560 374 588 430 C600 456 622 482 644 524"/></g>'],
            zebra: ['Zebra stripes', 'Rare disease', '#0a2235', '#123b52', '#e2e8f0', (a) => {
                let out = '';
                for (let i = 0; i < 9; i++) {
                    const x = 180 + i * 110;
                    out += '<path d="M' + x + ' 60 C' + (x + 70) + ' 220 ' + (x - 50) + ' 410 ' + (x + 40)
                        + ' 580" fill="none" stroke="' + a + '" stroke-width="' + (16 + (i % 3) * 7)
                        + '" stroke-linecap="round" opacity="0.85"/>';
                }
                return out;
            }],
            butterfly: ['Butterfly', 'Rare disease', '#3a1536', '#1b0718', '#f0abfc', (a) =>
                '<g stroke="' + a + '" stroke-width="12" stroke-linejoin="round" fill="' + a + '" fill-opacity="0.22">'
                + '<path d="M592 300 C520 196 404 180 380 238 C356 296 452 330 592 322 Z"/>'
                + '<path d="M608 300 C680 196 796 180 820 238 C844 296 748 330 608 322 Z"/>'
                + '<path d="M592 338 C512 352 446 408 470 460 C494 512 560 452 592 386 Z"/>'
                + '<path d="M608 338 C688 352 754 408 730 460 C706 512 640 452 608 386 Z"/></g>'
                + '<path d="M600 262 L600 452" stroke="' + a + '" stroke-width="14" stroke-linecap="round"/>'
                + '<path d="M596 258 C580 220 556 206 540 206 M604 258 C620 220 644 206 660 206" fill="none" '
                + 'stroke="' + a + '" stroke-width="10" stroke-linecap="round"/>'],
            lighthouse: ['A light', 'Rare disease', '#07263b', '#0d3a52', '#fbbf24', (a) =>
                '<path d="M566 262 L412 206 L412 316 Z" fill="' + a + '" opacity="0.32"/>'
                + '<path d="M634 262 L788 206 L788 316 Z" fill="' + a + '" opacity="0.32"/>'
                + '<g fill="none" stroke="' + a + '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M548 500 L572 298 L628 298 L652 500 Z"/>'
                + '<path d="M558 428 L642 428 M551 364 L649 364"/>'
                + '<path d="M568 298 L632 298 L626 250 L574 250 Z"/>'
                + '<path d="M586 218 L614 218 L600 190 Z"/><path d="M600 250 L600 218"/>'
                + '<path d="M516 522 Q600 492 684 522"/></g>'
                + '<circle cx="600" cy="276" r="15" fill="' + a + '"/>'],
            together: ['Together', 'Rare disease', '#0a2740', '#13455f', '#7dd3fc', (a) => {
                let out = '';
                for (const [x, r] of [[478, 36], [600, 44], [722, 36]]) {
                    const y = r === 44 ? 250 : 268;
                    out += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + a + '" opacity="0.8"/>'
                        + '<path d="M' + (x - r - 14) + ' ' + (y + r + 108) + ' C' + (x - r - 14) + ' ' + (y + r + 20)
                        + ' ' + (x + r + 14) + ' ' + (y + r + 20) + ' ' + (x + r + 14) + ' ' + (y + r + 108)
                        + '" fill="none" stroke="' + a + '" stroke-width="20" stroke-linecap="round"/>';
                }
                return out;
            }],
            heartbeat: ['A heart, beating', 'Rare disease', '#3b0d1f', '#1a0510', '#fda4af', (a) =>
                '<path d="M600 470 C500 396 430 342 430 274 C430 222 470 188 516 188 C552 188 580 210 600 240'
                + ' C620 210 648 188 684 188 C730 188 770 222 770 274 C770 342 700 396 600 470 Z" fill="' + a
                + '" fill-opacity="0.22" stroke="' + a + '" stroke-width="16" stroke-linejoin="round"/>'
                + '<path d="M430 300 L510 300 L540 250 L578 360 L616 276 L644 300 L770 300" fill="none" stroke="' + a
                + '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>'],
            hands: ['In our hands', 'Rare disease', '#0a2740', '#13455f', '#5ee3a6', (a) =>
                '<g transform="translate(600,290) scale(1.25) translate(-600,-290)" fill="none" stroke="' + a
                + '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M600 404 C548 366 514 338 514 302 C514 274 536 256 560 256'
                + ' C579 256 593 269 600 284 C607 269 621 256 640 256 C664 256 686 274 686 302'
                + ' C686 338 652 366 600 404 Z" fill="' + a + '" opacity="0.5"/>'
                + '<path d="M448 432 C448 552 752 552 752 432"/>'
                + '<path d="M448 432 C430 406 448 378 474 384"/>'
                + '<path d="M752 432 C770 406 752 378 726 384"/></g>'],

            // ---- the science -----------------------------------------------------------
            helix: ['DNA', 'The science', '#07263b', '#0d4a52', '#5ee3a6', (a) => {
                let out = '';
                for (let i = 0; i < 2; i++) {
                    const x0 = 515 + i * 170, x1 = 685 - i * 170;
                    out += '<path d="M' + x0 + ' 130 C' + x0 + ' 250 ' + x1 + ' 310 ' + x1 + ' 420 C'
                        + x1 + ' 530 ' + x0 + ' 390 ' + x0 + ' 510" fill="none" stroke="' + a
                        + '" stroke-width="20" stroke-linecap="round"/>';
                }
                for (let k = 0; k < 7; k++) {
                    const y = 160 + k * 55;
                    const w = 22 + 63 * Math.abs(Math.cos((y - 130) / 290 * Math.PI));
                    out += '<path d="M' + (600 - w) + ' ' + y + ' L' + (600 + w) + ' ' + y + '" stroke="' + a
                        + '" stroke-width="12" stroke-linecap="round" opacity="0.7"/>';
                }
                return out;
            }],
            chromosome: ['Chromosome', 'The science', '#2a1540', '#140a22', '#c4a2ff', (a) =>
                '<g stroke="' + a + '" stroke-width="30" stroke-linecap="round" fill="none">'
                + '<path d="M520 180 C560 250 560 290 600 320 C640 350 640 390 680 460"/>'
                + '<path d="M680 180 C640 250 640 290 600 320 C560 350 560 390 520 460"/></g>'
                + '<g stroke="#0b1a2a" stroke-width="7" opacity="0.5" stroke-linecap="round">'
                + '<path d="M536 212 L562 196 M548 250 L576 236 M644 196 L670 212 M624 236 L652 250'
                + ' M560 404 L588 390 M532 438 L560 424 M612 390 L640 404 M640 424 L668 438"/></g>'],
            molecule: ['A molecule', 'The science', '#07263b', '#0e4458', '#7dd3fc', (a) => {
                const n = [[600, 200, 34], [460, 300, 26], [740, 300, 26], [520, 450, 22], [690, 450, 22]];
                let out = '<g stroke="' + a + '" stroke-width="12" opacity="0.75">'
                    + '<path d="M600 200 L460 300 M600 200 L740 300 M460 300 L520 450 M740 300 L690 450 M520 450 L690 450"/></g>';
                for (const c of n) out += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="' + a + '"/>';
                return out;
            }],
            atom: ['An atom', 'The science', '#0a1b3a', '#07122a', '#93c5fd', (a) => {
                let out = '';
                for (const r of [0, 60, 120]) {
                    out += '<ellipse cx="600" cy="315" rx="190" ry="72" fill="none" stroke="' + a
                        + '" stroke-width="12" opacity="0.8" transform="rotate(' + r + ' 600 315)"/>';
                }
                return out + '<circle cx="600" cy="315" r="30" fill="' + a + '"/>';
            }],
            protein: ['A fold', 'The science', '#0a2e32', '#06201f', '#5eead4', (a) => {
                // An alpha helix, drawn the way one is drawn on a whiteboard: overlapping
                // leaning ellipses, which the eye reads as a coil where a single wavy line
                // reads as a worm.
                let out = '<path d="M372 404 L440 374" stroke="' + a
                    + '" stroke-width="14" stroke-linecap="round" fill="none"/>';
                for (let i = 0; i < 6; i++) {
                    out += '<ellipse cx="' + (470 + i * 54) + '" cy="' + (344 - i * 6) + '" rx="31" ry="86"'
                        + ' fill="none" stroke="' + a + '" stroke-width="14"'
                        + ' transform="rotate(-20 ' + (470 + i * 54) + ' ' + (344 - i * 6) + ')"/>';
                }
                return out + '<path d="M798 302 L866 272" stroke="' + a
                    + '" stroke-width="14" stroke-linecap="round" fill="none"/>';
            }],
            vials: ['Samples', 'The science', '#08283f', '#10465c', '#5eead4', (a) => {
                let out = '';
                const fill = [0.45, 0.7, 0.3];
                for (let i = 0; i < 3; i++) {
                    const x = 480 + i * 120, top = 180, bot = 470, w = 54;
                    const liq = bot - (bot - top - 40) * fill[i];
                    out += '<path d="M' + (x - w / 2) + ' ' + liq + ' L' + (x - w / 2) + ' ' + (bot - 28)
                        + ' Q' + (x - w / 2) + ' ' + bot + ' ' + x + ' ' + bot
                        + ' Q' + (x + w / 2) + ' ' + bot + ' ' + (x + w / 2) + ' ' + (bot - 28)
                        + ' L' + (x + w / 2) + ' ' + liq + ' Z" fill="' + a + '" opacity="0.8"/>'
                        + '<path d="M' + (x - w / 2) + ' ' + top + ' L' + (x - w / 2) + ' ' + (bot - 28)
                        + ' Q' + (x - w / 2) + ' ' + bot + ' ' + x + ' ' + bot
                        + ' Q' + (x + w / 2) + ' ' + bot + ' ' + (x + w / 2) + ' ' + (bot - 28)
                        + ' L' + (x + w / 2) + ' ' + top + '" fill="none" stroke="' + a
                        + '" stroke-width="13" stroke-linecap="round"/>'
                        + '<path d="M' + (x - 38) + ' ' + top + ' L' + (x + 38) + ' ' + top + '" stroke="' + a
                        + '" stroke-width="15" stroke-linecap="round"/>';
                }
                return out;
            }],
            flask: ['The bench', 'The science', '#0a2e32', '#11514b', '#bef264', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M556 180 L556 300 L452 470 Q440 500 474 500 L726 500 Q760 500 748 470 L644 300 L644 180"/>'
                + '<path d="M538 180 L662 180"/></g>'
                + '<path d="M498 408 L702 408 Q736 470 726 486 L474 486 Q464 470 498 408 Z" fill="' + a + '" opacity="0.4"/>'
                + '<g fill="' + a + '" opacity="0.75"><circle cx="556" cy="372" r="13"/><circle cx="614" cy="346" r="9"/>'
                + '<circle cx="652" cy="386" r="11"/></g>'],
            scope: ['Microscope', 'The science', '#08283f', '#10465c', '#5ee3a6', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M470 470 L730 470"/><path d="M540 470 L540 400 Q540 330 600 300"/>'
                + '<path d="M600 300 L660 180 L720 210 L665 330 Z"/><path d="M470 400 Q470 250 600 210"/>'
                + '<path d="M500 520 L700 520"/></g>'],
            cells: ['Cells', 'The science', '#072a3c', '#0f4a4a', '#5ee3a6', (a) => {
                let out = '<circle cx="600" cy="330" r="190" fill="none" stroke="' + a
                    + '" stroke-width="18" opacity="0.8"/>';
                const seeds = [[520, 260, 46], [660, 300, 60], [575, 400, 38], [680, 420, 30], [500, 370, 26]];
                for (const c of seeds) {
                    out += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="' + a
                        + '" opacity="0.45"/><circle cx="' + c[0] + '" cy="' + c[1] + '" r="'
                        + Math.round(c[2] / 3) + '" fill="' + a + '"/>';
                }
                return out;
            }],

            // ---- the data --------------------------------------------------------------
            trend: ['The numbers move', 'The data', '#0a1f3a', '#0b3350', '#5ee3a6', (a) => {
                const pts = [[430, 460], [510, 420], [590, 436], [670, 350], [750, 300], [830, 220]];
                let out = '<g fill="none" stroke="' + a + '" stroke-width="10" opacity="0.35" stroke-linecap="round">'
                    + '<path d="M400 180 L400 500 L860 500"/></g>'
                    + '<path d="M' + pts.map((p) => p.join(' ')).join(' L') + '" fill="none" stroke="' + a
                    + '" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>';
                for (const p of pts) out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="13" fill="' + a + '"/>';
                return out;
            }],
            scatter: ['A result', 'The data', '#1a0f33', '#0c0720', '#f0abfc', (a) => {
                let out = '<g fill="none" stroke="' + a + '" stroke-width="10" opacity="0.3" stroke-linecap="round">'
                    + '<path d="M400 160 L400 500 L860 500"/></g>'
                    + '<path d="M400 300 L860 300" fill="none" stroke="' + a
                    + '" stroke-width="7" stroke-dasharray="14 14" opacity="0.45"/>';
                const pts = [[452, 452], [486, 430], [520, 464], [556, 436], [596, 452], [628, 420], [664, 446],
                             [700, 458], [742, 430], [782, 452], [818, 440],
                             [470, 240], [502, 196], [540, 262], [690, 214], [726, 176], [760, 248], [800, 210]];
                for (let i = 0; i < pts.length; i++) {
                    const big = pts[i][1] < 300;
                    out += '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="' + (big ? 15 : 10)
                        + '" fill="' + a + '" opacity="' + (big ? '0.95' : '0.45') + '"/>';
                }
                return out;
            }],
            reads: ['Sequencing', 'The data', '#07263b', '#0b3a3f', '#5eead4', (a) => {
                let out = '<path d="M380 212 L880 212" stroke="' + a + '" stroke-width="16" stroke-linecap="round"/>';
                const rows = [[400, 170], [470, 150], [560, 190], [430, 120], [600, 160], [690, 170], [520, 140], [760, 120]];
                for (let i = 0; i < rows.length; i++) {
                    const y = 262 + i * 38;
                    out += '<rect x="' + rows[i][0] + '" y="' + y + '" width="' + rows[i][1]
                        + '" height="22" rx="11" fill="' + a + '" opacity="' + (0.35 + (i % 3) * 0.2).toFixed(2) + '"/>';
                }
                return out;
            }],
            trial: ['The trial', 'The data', '#0a2235', '#123b52', '#93c5fd', (a) => {
                let out = '<rect x="446" y="150" width="308" height="370" rx="22" fill="none" stroke="' + a
                    + '" stroke-width="15"/>'
                    + '<rect x="536" y="118" width="128" height="62" rx="18" fill="' + a + '" opacity="0.8"/>';
                for (let i = 0; i < 4; i++) {
                    const y = 250 + i * 72;
                    out += '<path d="M492 ' + y + ' l22 22 l40 -44" fill="none" stroke="' + a
                        + '" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="'
                        + (i === 3 ? '0.35' : '1') + '"/>'
                        + '<rect x="578" y="' + (y - 10) + '" width="' + (130 - i * 18) + '" height="18" rx="9" fill="'
                        + a + '" opacity="0.4"/>';
                }
                return out;
            }],

            // ---- in the clinic ---------------------------------------------------------
            brain: ['The brain', 'In the clinic', '#2a1038', '#15061d', '#f0abfc', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M600 190 C520 160 440 200 440 268 C398 292 398 358 440 380 C436 448 500 486 560 466'
                + ' C580 500 640 500 660 466 C720 486 784 448 780 380 C822 358 822 292 780 268'
                + ' C780 200 700 160 620 190"/>'
                + '<path d="M610 186 L610 480" opacity="0.8"/>'
                + '<path d="M548 244 C586 252 586 300 548 312 M672 244 C634 252 634 300 672 312'
                + ' M520 390 C568 390 572 430 544 444 M700 390 C652 390 648 430 676 444" opacity="0.6"/></g>'],
            neuron: ['A neuron', 'In the clinic', '#0a1b3a', '#071029', '#93c5fd', (a) => {
                let out = '<circle cx="520" cy="320" r="62" fill="' + a + '" opacity="0.35"/>'
                    + '<circle cx="520" cy="320" r="62" fill="none" stroke="' + a + '" stroke-width="14"/>'
                    + '<circle cx="520" cy="320" r="20" fill="' + a + '"/>';
                for (const [dx, dy] of [[-1, -1], [-1.25, 0], [-1, 1], [-0.2, -1.3], [-0.2, 1.3]]) {
                    out += '<path d="M' + (520 + dx * 48) + ' ' + (320 + dy * 48) + ' L' + (520 + dx * 118) + ' '
                        + (320 + dy * 112) + '" stroke="' + a + '" stroke-width="12" stroke-linecap="round" opacity="0.8"/>';
                }
                out += '<path d="M582 320 L790 320" stroke="' + a + '" stroke-width="14" stroke-linecap="round"/>';
                for (const dy of [-1, 0, 1]) {
                    out += '<path d="M790 320 L852 ' + (320 + dy * 56) + '" stroke="' + a
                        + '" stroke-width="12" stroke-linecap="round"/>';
                }
                return out;
            }],
            scan: ['A scan', 'In the clinic', '#07263b', '#0a3348', '#7dd3fc', (a) =>
                '<rect x="420" y="150" width="360" height="360" rx="20" fill="' + a + '" opacity="0.10"/>'
                + '<rect x="420" y="150" width="360" height="360" rx="20" fill="none" stroke="' + a
                + '" stroke-width="12" opacity="0.7"/>'
                // A head in profile, not a circle with a smile in it.
                + '<path d="M676 486 C676 404 690 362 664 316 C634 262 556 248 512 292'
                + ' C476 330 484 372 492 398 C498 418 478 424 478 438 C478 450 498 452 498 462'
                + ' C498 478 494 486 508 486 Z" fill="' + a + '" fill-opacity="0.18"'
                + ' stroke="' + a + '" stroke-width="14" stroke-linejoin="round"/>'
                + '<path d="M556 330 C586 310 616 320 626 350 C634 374 616 392 594 386" fill="none"'
                + ' stroke="' + a + '" stroke-width="11" stroke-linecap="round" opacity="0.65"/>'
                + '<g stroke="' + a + '" stroke-width="5" opacity="0.3">'
                + '<path d="M420 230 L780 230 M420 300 L780 300 M420 370 L780 370 M420 440 L780 440"/></g>'],
            stethoscope: ['The clinic', 'In the clinic', '#0a2740', '#123f5c', '#5eead4', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M470 170 L470 290 C470 362 530 406 596 406 C662 406 722 362 722 290 L722 170"/>'
                + '<path d="M444 166 L496 166 M696 166 L748 166"/>'
                + '<path d="M596 406 L596 452 C596 500 640 522 686 522 C734 522 772 496 772 452 L772 412"/>'
                + '<circle cx="772" cy="372" r="42" fill="' + a + '" fill-opacity="0.3"/></g>'],
            capsule: ['The medicine', 'In the clinic', '#3a2208', '#1b1004', '#fbbf24', (a) =>
                '<g transform="rotate(-32 600 315)">'
                + '<rect x="420" y="258" width="360" height="118" rx="59" fill="' + a + '" opacity="0.22"/>'
                + '<path d="M600 258 L479 258 A59 59 0 0 0 479 376 L600 376 Z" fill="' + a + '" opacity="0.85"/>'
                + '<rect x="420" y="258" width="360" height="118" rx="59" fill="none" stroke="' + a + '" stroke-width="14"/>'
                + '<path d="M600 258 L600 376" stroke="' + a + '" stroke-width="14"/></g>'],
            drip: ['Infusion', 'In the clinic', '#0a2235', '#0d3a4a', '#7dd3fc', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M470 140 L470 520 M430 140 L510 140"/>'
                + '<path d="M540 186 L676 186 L676 330 Q676 372 608 372 Q540 372 540 330 Z"/>'
                + '<path d="M608 372 L608 420 C608 470 700 470 700 516"/></g>'
                + '<path d="M548 282 L668 282 L668 330 Q668 364 608 364 Q548 364 548 330 Z" fill="' + a + '" opacity="0.45"/>'
                + '<circle cx="700" cy="516" r="16" fill="' + a + '" opacity="0.8"/>'],
            shield: ['Care', 'In the clinic', '#0a2e32', '#06201f', '#5ee3a6', (a) =>
                '<path d="M600 150 L770 212 C770 380 700 460 600 500 C500 460 430 380 430 212 Z" fill="' + a
                + '" fill-opacity="0.18" stroke="' + a + '" stroke-width="16" stroke-linejoin="round"/>'
                + '<path d="M600 250 L600 400 M525 325 L675 325" stroke="' + a
                + '" stroke-width="30" stroke-linecap="round"/>'],

            // ---- something ahead -------------------------------------------------------
            seedling: ['A beginning', 'Something ahead', '#0a2e32', '#11514b', '#5ee3a6', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="22" stroke-linecap="round">'
                + '<path d="M600 520 L600 330"/>'
                + '<path d="M600 390 C520 390 460 340 455 265 C540 258 600 310 600 390 Z" fill="' + a
                + '" opacity="0.5"/>'
                + '<path d="M600 350 C680 350 745 300 750 225 C660 218 600 270 600 350 Z" fill="' + a
                + '" opacity="0.5"/>'
                + '<path d="M470 530 L730 530"/></g>'],
            summit: ['The climb', 'Something ahead', '#092033', '#0f3f58', '#5ee3a6', (a) =>
                '<circle cx="775" cy="200" r="58" fill="' + a + '" opacity="0.85"/>'
                + '<path d="M240 540 L470 250 L620 450 L720 330 L960 540 Z" fill="' + a + '" opacity="0.5"'
                + ' stroke="' + a + '" stroke-width="20" stroke-linejoin="round"/>'
                + '<path d="M470 250 L556 362 L384 362 Z" fill="#eaf6f9" opacity="0.85"/>'
                + '<path d="M240 540 L960 540" stroke="' + a + '" stroke-width="22" stroke-linecap="round"/>'],
            sunrise: ['First light', 'Something ahead', '#3a1e08', '#120a18', '#fb923c', (a) => {
                let out = '<circle cx="600" cy="400" r="130" fill="' + a + '" opacity="0.85"/>';
                for (let i = 0; i < 7; i++) {
                    const ang = Math.PI * (0.08 + i * 0.14);
                    const x1 = 600 - Math.cos(ang) * 170, y1 = 400 - Math.sin(ang) * 170;
                    const x2 = 600 - Math.cos(ang) * 225, y2 = 400 - Math.sin(ang) * 225;
                    out += '<path d="M' + x1.toFixed(0) + ' ' + y1.toFixed(0) + ' L' + x2.toFixed(0) + ' '
                        + y2.toFixed(0) + '" stroke="' + a + '" stroke-width="14" stroke-linecap="round" opacity="0.75"/>';
                }
                return out + '<path d="M300 400 L900 400" stroke="' + a + '" stroke-width="18" stroke-linecap="round"/>'
                    + '<path d="M360 452 L560 452 M660 452 L840 452" stroke="' + a
                    + '" stroke-width="12" stroke-linecap="round" opacity="0.45"/>';
            }],
            constellation: ['Finding it', 'Something ahead', '#0a1030', '#06081c', '#93c5fd', (a) => {
                const pts = [[430, 420], [520, 320], [620, 372], [700, 250], [800, 300], [760, 430], [620, 372]];
                let out = '<path d="M' + pts.map((p) => p.join(' ')).join(' L') + '" fill="none" stroke="' + a
                    + '" stroke-width="7" opacity="0.5" stroke-linejoin="round"/>';
                for (let i = 0; i < pts.length - 1; i++) {
                    out += '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="' + (i % 2 ? 11 : 16)
                        + '" fill="' + a + '"/>';
                }
                for (const [x, y, r] of [[470, 190, 5], [880, 200, 6], [380, 300, 4], [860, 470, 5], [540, 500, 4]]) {
                    out += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + a + '" opacity="0.6"/>';
                }
                return out;
            }],
            bridge: ['A way across', 'Something ahead', '#0a2235', '#123b52', '#5eead4', (a) => {
                let out = '<path d="M330 400 L870 400" stroke="' + a + '" stroke-width="18" stroke-linecap="round"/>'
                    + '<path d="M330 400 C450 250 750 250 870 400" fill="none" stroke="' + a
                    + '" stroke-width="16" stroke-linecap="round"/>';
                for (let i = 1; i < 8; i++) {
                    const t = i / 8, x = 330 + 540 * t;
                    const y = 400 - 150 * (4 * t * (1 - t)) * 1.0;
                    out += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' L' + x.toFixed(0)
                        + ' 400" stroke="' + a + '" stroke-width="9" stroke-linecap="round" opacity="0.6"/>';
                }
                return out + '<path d="M390 400 L390 500 M810 400 L810 500" stroke="' + a
                    + '" stroke-width="16" stroke-linecap="round" opacity="0.8"/>';
            }],
        };
        const artSvg = (id) => {
            const t = ART[id];
            if (!t) return '';
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">'
                + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
                + '<stop offset="0" stop-color="' + t[2] + '"/>'
                + '<stop offset="1" stop-color="' + t[3] + '"/></linearGradient></defs>'
                + '<rect width="1200" height="630" fill="url(#g)"/>'
                + '<g transform="translate(0,20)">' + t[5](t[4]) + '</g></svg>';
        };
        const artUri = (id) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(artSvg(id));
        const artJpeg = (id) => new Promise((resolve, reject) => {
            const im = new Image();
            im.onerror = () => reject(new Error('that picture could not be drawn here'));
            im.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = 1200; cv.height = 630;
                    cv.getContext('2d').drawImage(im, 0, 0, 1200, 630);
                    const url = cv.toDataURL('image/jpeg', 0.86);
                    resolve({ dataUri: url, w: 1200, h: 630, bytes: Math.round(url.length * 0.75) });
                } catch (e) { reject(e); }
            };
            im.src = artUri(id);
        });

        const IMG_MAX = 1600, IMG_BYTES = 420 * 1024;
        let pendingImage = null, imageGone = false, loadedImage = '';
        const shrink = (file) => new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => reject(new Error('that file could not be read'));
            fr.onload = () => {
                const im = new Image();
                im.onerror = () => reject(new Error('that file is not an image this browser can read'));
                im.onload = () => {
                    try {
                        const scale = Math.min(1, IMG_MAX / Math.max(im.width || 1, im.height || 1));
                        const w = Math.max(1, Math.round((im.width || 1) * scale));
                        const h = Math.max(1, Math.round((im.height || 1) * scale));
                        const cv = document.createElement('canvas');
                        cv.width = w; cv.height = h;
                        cv.getContext('2d').drawImage(im, 0, 0, w, h);
                        let q = 0.82, url = cv.toDataURL('image/jpeg', q);
                        // Three attempts, then take what we have: a slightly large picture is
                        // better than refusing the campaign its photograph.
                        for (let i = 0; i < 3 && url.length > IMG_BYTES * 1.37; i++) {
                            q -= 0.17; url = cv.toDataURL('image/jpeg', Math.max(0.3, q));
                        }
                        resolve({ dataUri: url, w: w, h: h, bytes: Math.round(url.length * 0.75) });
                    } catch (e) { reject(e); }
                };
                im.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
        const currentImage = () => (pendingImage ? pendingImage.dataUri : (!imageGone && loadedImage ? loadedImage : ''));
        const imgUI = () => {
            const u = currentImage();
            $('fc-img-prev').innerHTML = u
                ? '<img src="' + esc(u) + '" style="max-width:260px;max-height:130px;border-radius:8px;'
                    + 'border:1px solid rgba(255,255,255,0.16);display:block;"/>'
                : '';
            const has = !!u;
            $('fc-img-mode').style.opacity = has ? '1' : '0.5';
            $('fc-img-clear').style.display = has ? '' : 'none';
        };
        const ytUI = () => {
            const raw = ('' + $('fc-yt').value).trim(), id = ytId(raw);
            $('fc-yt-out').innerHTML = !raw ? ''
                : (id ? '<span style="color:#86efac;">The film will play on the details page.</span>'
                    : '<span style="color:#fcd34d;">That does not look like a YouTube link.</span>');
        };
        $('fc-img').addEventListener('change', async () => {
            const f = $('fc-img').files && $('fc-img').files[0];
            if (!f) return;
            $('fc-img-out').textContent = 'Reading the picture…';
            try {
                const got = await shrink(f);
                pendingImage = got; imageGone = false;
                $('fc-img-out').textContent = 'Ready: ' + got.w + '×' + got.h + ', about '
                    + Math.round(got.bytes / 1024) + 'KB. Publish to put it on the display.';
                imgUI(); preview(); touch();
            } catch (e) {
                $('fc-img-out').textContent = 'Could not use that picture: ' + ((e && e.message) ? e.message : e);
            }
        });
        // The gallery is filled in here rather than in the markup above: eight data URIs
        // on one line of HTML is a line nobody can read or change later.
        (() => {
            const box = $('fc-stock');
            if (!box) return;
            let out = '', group = '';
            for (const id of Object.keys(ART)) {
                const t = ART[id];
                if (t[1] !== group) {
                    group = t[1];
                    // A full-width line in a wrapping row is what breaks it: thirty
                    // thumbnails in one block is a wall, and in six named groups it is a
                    // choice.
                    out += '<div style="flex:1 1 100%;margin:8px 0 1px;font:600 10.5px system-ui;'
                        + 'letter-spacing:.07em;text-transform:uppercase;color:#7fa3b8;">' + esc(group) + '</div>';
                }
                out += '<button type="button" data-art="' + id + '" title="' + esc(t[0]) + '"'
                    + ' aria-label="Use the picture: ' + esc(t[0]) + '"'
                    + ' style="width:84px;height:47px;padding:0;border-radius:7px;cursor:pointer;'
                    + 'border:1px solid rgba(255,255,255,0.18);background:#0a1e3a center/cover no-repeat;'
                    + 'background-image:url(&quot;' + artUri(id) + '&quot;);"></button>';
            }
            box.innerHTML = out;
            for (const bn of box.querySelectorAll('[data-art]')) {
                bn.onclick = async () => {
                    const id = bn.getAttribute('data-art');
                    $('fc-img-out').textContent = 'Drawing it\u2026';
                    try {
                        const got = await artJpeg(id);
                        pendingImage = got; imageGone = false;
                        try { $('fc-img').value = ''; } catch (e) { }
                        $('fc-img-out').textContent = ART[id][0] + ' it is. Publish to put it on the display.';
                        imgUI(); preview(); touch();
                    } catch (e) {
                        $('fc-img-out').textContent = 'Could not use that one: '
                            + ((e && e.message) ? e.message : e);
                    }
                };
            }
        })();

        $('fc-doc').addEventListener('change', async () => {
            const f = $('fc-doc').files && $('fc-doc').files[0];
            if (!f) return;
            const name = ('' + f.name);
            const kind = /\.pdf$/i.test(name) ? 'pdf' : (/\.pptx?$/i.test(name) ? 'ppt' : '');
            if (!kind) {
                $('fc-doc-out').textContent = 'That has to be a PDF or a PowerPoint.';
                try { $('fc-doc').value = ''; } catch (e) { }
                return;
            }
            if (f.size > DOC_BYTES) {
                $('fc-doc-out').textContent = 'That is ' + niceBytes(f.size) + ', and the limit is '
                    + niceBytes(DOC_BYTES) + '. A PDF saved for screen rather than print is usually '
                    + 'a fraction of one saved for print.';
                try { $('fc-doc').value = ''; } catch (e) { }
                return;
            }
            $('fc-doc-out').textContent = 'Reading it…';
            try {
                const dataUri = await readFileAsDataUri(f);
                pendingDoc = { name: name, kind: kind, bytes: f.size, dataUri: dataUri };
                docGone = false;
                $('fc-doc-out').textContent = name + ' · ' + niceBytes(f.size) + ' · '
                    + (kind === 'pdf' ? 'opens in the page' : 'offered as a download')
                    + '. Publish to put it on the details page.';
                docUI(); touch();
            } catch (e) {
                $('fc-doc-out').textContent = 'Could not use that file: ' + ((e && e.message) ? e.message : e);
            }
        });
        $('fc-doc-clear').onclick = () => {
            pendingDoc = null; docGone = true;
            try { $('fc-doc').value = ''; } catch (e) { }
            $('fc-doc-out').textContent = 'The presentation comes off the details page when you publish.';
            docUI(); touch();
        };

        $('fc-img-clear').onclick = () => {
            pendingImage = null; imageGone = true;
            try { $('fc-img').value = ''; } catch (e) { }
            $('fc-img-out').textContent = 'The picture comes off the display when you publish.';
            imgUI(); preview(); touch();
        };
        $('fc-tm-add').onclick = async () => {
            const name = ('' + $('fc-tm-name').value).trim();
            if (!name) { $('fc-tm-out').textContent = 'A name first.'; return; }
            if (teamArr().length >= TEAM_MAX) { $('fc-tm-out').textContent = 'That is as many as the page shows well.'; return; }
            const id = 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
            const f = $('fc-tm-img').files && $('fc-tm-img').files[0];
            if (f) {
                $('fc-tm-out').textContent = 'Reading the photograph…';
                try { teamFaces[id] = await squareFace(f); teamDirty = true; }
                catch (e) { $('fc-tm-out').textContent = 'Could not use that photograph: ' + ((e && e.message) ? e.message : e); return; }
            }
            teamArr().push({ id: id, name: name, role: ('' + $('fc-tm-role').value).trim(), note: ('' + $('fc-tm-note').value).trim() });
            $('fc-tm-name').value = ''; $('fc-tm-role').value = ''; $('fc-tm-note').value = '';
            try { $('fc-tm-img').value = ''; } catch (e) { }
            teamList(); preview(); touch();
            $('fc-tm-out').textContent = 'Added ' + name + '. Publish to put them on the details page.';
            try { $('fc-tm-name').focus(); } catch (e) { }
        };
        $('fc-yt').addEventListener('input', () => { ytUI(); sync(); });
        $('fc-theme').addEventListener('change', () => sync());   // called, not captured: sync is declared below
        $('fc-img-mode').addEventListener('change', () => { sync(); preview(); });

        const toForm = () => {
            $('fc-title').value = doc.title || '';
            $('fc-sub').value = doc.subtitle || '';
            $('fc-cur').value = doc.currency || 'USD';
            $('fc-raised').value = (+doc.raised || 0).toLocaleString();
            $('fc-goal').value = (+doc.goal || 0).toLocaleString();
            $('fc-donors').value = doc.donors ? ('' + doc.donors) : '';
            $('fc-note').value = doc.note || '';
            $('fc-story').value = doc.story || '';
            $('fc-hide').checked = !!doc.hideGiftAmounts;
            const dcfg = don();
            $('fc-don-on').checked = !!dcfg.on;
            $('fc-don-label').value = dcfg.label || 'Donate';
            $('fc-don-amts').value = (Array.isArray(dcfg.amounts) ? dcfg.amounts : []).join(', ');
            $('fc-don-custom').checked = dcfg.custom !== false;
            $('fc-don-names').checked = !!dcfg.showNames;
            const m = med();
            $('fc-theme').value = m.theme || 'deep';
            // Above the title is the default. Only an explicit 'background' puts the
            // picture behind the whole display, so a campaign that never chose, and one
            // published before there was a choice, both open with the picture up top.
            $('fc-img-mode').value = (m.imageMode === 'background') ? 'background' : 'banner';
            $('fc-yt').value = m.youtube || '';
            imgUI(); docUI(); ytUI();
            donUI();
        };

        // ONE WAY TO TAKE A DONATION. There used to be a choice here between checkout on
        // this server and a Payment Link pasted from the dashboard, and the second one was a
        // second thing to get wrong: a link that was blank, not https, not a stripe.com
        // address, or pointing at the wrong campaign, with half this screen there to warn
        // about it. Checkout on this server is the one that knows which campaign the money is
        // for, so it is now the only one.
        const donUI = () => {
            const dcfg = don();
            $('fc-don-box').style.display = dcfg.on ? '' : 'none';
            let warn = '';
            if (dcfg.on && !(Array.isArray(dcfg.amounts) && dcfg.amounts.length) && dcfg.custom === false)
                warn = 'With no suggested amounts and no custom amount, a donor has nothing to choose.';
            $('fc-don-warn').textContent = warn;
        };
        const fromForm = () => {
            doc.title = ('' + $('fc-title').value).trim();
            doc.subtitle = ('' + $('fc-sub').value).trim();
            doc.currency = $('fc-cur').value || 'USD';
            doc.raised = parseMoney($('fc-raised').value);
            doc.goal = parseMoney($('fc-goal').value);
            const dn = parseInt(('' + $('fc-donors').value).replace(/[^0-9]/g, ''), 10);
            doc.donors = isFinite(dn) ? dn : 0;
            doc.note = ('' + $('fc-note').value).trim();
            doc.story = ('' + $('fc-story').value).trim();
            doc.hideGiftAmounts = !!$('fc-hide').checked;
            const dcfg = don();
            dcfg.on = !!$('fc-don-on').checked;
            // Written every time rather than carried through from whatever the document
            // said, so a campaign saved under the old choice becomes a checkout campaign the
            // next time it is published, instead of quietly keeping a Payment Link that no
            // screen can show or edit any more.
            dcfg.mode = 'checkout';
            dcfg.label = ('' + $('fc-don-label').value).trim() || 'Donate';
            dcfg.url = '';
            dcfg.custom = !!$('fc-don-custom').checked;
            // The campaign document is fetched whole by the public display, so a name stored
            // here is a name on a wall. Off by default: a donor gave it to Stripe to pay.
            dcfg.showNames = !!$('fc-don-names').checked;
            const m = med();
            m.theme = $('fc-theme').value || 'deep';
            m.imageMode = ($('fc-img-mode').value === 'background') ? 'background' : 'banner';
            m.youtube = ytId($('fc-yt').value);
            dcfg.amounts = ('' + $('fc-don-amts').value).split(/[,;\s]+/).map((x) => parseMoney(x))
                .filter((v) => isFinite(v) && v > 0).slice(0, 6);
        };

        // The two lists, as the organiser sees them here: newest first, each removable.
        const when = (iso) => { const t = iso ? new Date(iso) : null; return (t && !isNaN(+t))
            ? t.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
        const del = (kind, i) => '<button data-del="' + kind + ':' + i + '" title="Remove" style="cursor:pointer;border:0;background:transparent;'
            + 'color:#7fb0c4;font:700 15px system-ui;line-height:1;padding:0 2px;">×</button>';
        const lists = () => {
            const gs = arr('gifts'), us = arr('updates');
            $('fc-gifts').innerHTML = !gs.length ? '' : '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:8px;max-height:210px;overflow:auto;">'
                + gs.map((g, i) => '<div style="display:flex;gap:10px;align-items:baseline;padding:7px 10px;'
                    + (i ? 'border-top:1px solid rgba(255,255,255,0.08);' : '') + '">'
                    + '<div style="flex:1 1 auto;min-width:0;font:13.5px system-ui;">' + esc(('' + (g.name || '')).trim() || 'Anonymous')
                    + (g.note ? '<span style="color:#9fb3c8;"> · ' + esc(g.note) + '</span>' : '') + '</div>'
                    + '<div style="font:700 13.5px system-ui;color:#86efac;white-space:nowrap;">' + esc(money(+g.amount || 0, doc.currency)) + '</div>'
                    + '<div style="font:11.5px system-ui;color:#6f93a6;white-space:nowrap;">' + esc(when(g.at)) + '</div>'
                    + del('g', i) + '</div>').join('') + '</div>';
            $('fc-updates').innerHTML = !us.length ? '' : '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:8px;max-height:230px;overflow:auto;">'
                + us.map((u, i) => '<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;'
                    + (i ? 'border-top:1px solid rgba(255,255,255,0.08);' : '') + '">'
                    + '<div style="flex:1 1 auto;min-width:0;">'
                    + '<div style="font:11.5px system-ui;color:#6f93a6;">' + esc(when(u.at)) + '</div>'
                    + (u.title ? '<div style="font:700 13.5px system-ui;margin-top:2px;">' + esc(u.title) + '</div>' : '')
                    + '<div style="font:13.5px system-ui;color:#cfe0f5;margin-top:2px;white-space:pre-wrap;">' + esc(u.text || '') + '</div></div>'
                    + del('u', i) + '</div>').join('') + '</div>';
            for (const b of wrap.querySelectorAll('[data-del]')) {
                b.onclick = () => {
                    const [k, idx] = ('' + b.getAttribute('data-del')).split(':');
                    const i = parseInt(idx, 10);
                    let msg = 'Removed. Publish to put that on the display.';
                    if (k === 'g') {
                        const g = arr('gifts')[i];
                        // A gift entered here moved the total when it went in, so taking it
                        // out moves it back. One typed in as history never moved it, and
                        // removing it must not either.
                        if (g && g.counted) {
                            fromForm();
                            doc.raised = Math.max(0, (+doc.raised || 0) - (+g.amount || 0));
                            doc.donors = Math.max(0, (+doc.donors || 0) - 1);
                            toForm();
                        }
                        // A gift that came from a payment is remembered as removed, or the
                        // next reconcile reads it straight back in -- and, because its
                        // amount is already in the total, counts it twice. Removing one is
                        // how an organiser takes an unwanted message off the page, so it
                        // has to stay off.
                        if (g && g.sid) {
                            if (!Array.isArray(doc.giftsSkip)) doc.giftsSkip = [];
                            if (doc.giftsSkip.indexOf(g.sid) < 0) doc.giftsSkip.push(g.sid);
                            if (doc.giftsSkip.length > 400) doc.giftsSkip = doc.giftsSkip.slice(-400);
                            msg = 'Taken off the list. The money stays in the total, and it will not come back on the next pull.';
                        }
                        arr('gifts').splice(i, 1);
                    } else arr('updates').splice(i, 1);
                    preview(); lists(); touch();
                    $('fc-status').textContent = msg;
                };
            }
        };
        const preview = () => {
            const cur = doc.currency, goal = Math.max(0, +doc.goal || 0), raised = Math.max(0, +doc.raised || 0);
            const pct = goal > 0 ? Math.max(0, Math.min(100, raised / goal * 100)) : 0;
            const over = goal > 0 && raised >= goal;
            // The preview wears the same clothes as the display, or it is not a preview.
            const m = med(), pic = currentImage();
            const asBg = pic && m.imageMode === 'background';
            try {
                const pv = $('fc-prev');
                pv.style.backgroundImage = asBg
                    ? 'linear-gradient(rgba(5,14,26,0.72),rgba(5,14,26,0.86)), url("' + pic + '")'
                    : themeCss(m.theme);
                pv.style.backgroundSize = asBg ? 'cover' : '';
                pv.style.backgroundPosition = asBg ? 'center' : '';
            } catch (e) { }
            $('fc-prev').innerHTML = ''
                + ((pic && m.imageMode !== 'background')
                    ? '<img src="' + esc(pic) + '" alt="" style="max-width:100%;max-height:90px;border-radius:10px;display:block;margin:0 auto 10px;"/>' : '')
                + (doc.title ? '<div style="font:800 22px system-ui;">' + esc(doc.title) + '</div>' : '')
                + (doc.subtitle ? '<div style="margin-top:4px;font:400 13px system-ui;color:#9fc4d4;">' + esc(doc.subtitle) + '</div>' : '')
                + '<div style="margin:16px 0 4px;font:800 44px system-ui;letter-spacing:-0.03em;color:' + (over ? '#86efac' : '#fff') + ';">' + esc(money(raised, cur)) + '</div>'
                + (goal > 0 ? '<div style="font:500 13px system-ui;color:#9fc4d4;">raised of ' + esc(money(goal, cur)) + ' goal</div>' : '')
                + (goal > 0 ? '<div style="margin-top:16px;height:18px;border-radius:999px;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.16);overflow:hidden;">'
                    + '<div style="height:100%;width:' + pct.toFixed(2) + '%;border-radius:999px;background:linear-gradient(90deg,#1aa3bd,#22c55e);"></div></div>'
                    + '<div style="margin-top:7px;font:700 13px system-ui;color:' + (over ? '#86efac' : '#bfe6f0') + ';">' + pct.toFixed(pct < 10 ? 1 : 0) + '%'
                    + (over ? ' — goal reached' : '') + '</div>' : '')
                + (doc.donors ? '<div style="margin-top:12px;font:500 13px system-ui;color:#9fc4d4;">' + esc((+doc.donors).toLocaleString())
                    + ' ' + (Math.abs(+doc.donors) === 1 ? 'donor' : 'donors') + '</div>' : '')
                + (doc.note ? '<div style="margin-top:12px;font:400 13px system-ui;color:#cfe6ef;">' + esc(doc.note) + '</div>' : '')
                + ((doc.story || arr('gifts').length || arr('updates').length || teamArr().length)
                    ? '<div style="margin-top:14px;"><span style="display:inline-block;border:1px solid rgba(255,255,255,0.28);'
                        + 'background:rgba(255,255,255,0.06);border-radius:999px;padding:6px 14px;font:600 12px system-ui;">Campaign details'
                        + (arr('updates').length ? ' · ' + arr('updates').length + ' update' + (arr('updates').length === 1 ? '' : 's') : '')
                        + '</span></div>' : '')
                + (don().on ? '<div style="margin-top:10px;"><span style="display:inline-block;background:#22c55e;color:#04210f;'
                    + 'border-radius:999px;padding:8px 20px;font:800 13px system-ui;">' + esc(don().label || 'Donate') + '</span></div>' : '');
        };
        // LEAVING WITHOUT PUBLISHING LOSES WHAT IS ON THIS SCREEN, so Cancel asks once when
        // there is something to lose and goes straight out when there is not. What is
        // tracked is whether anything was touched, not whether it differs from what was
        // stored: a form that says "no changes" while the gift list has moved is worse than
        // one that asks an unnecessary question.
        let dirty = false;

        // WHAT YOU TYPED SURVIVES A RELOAD.
        //
        // Everything on this screen lives in one object that is only written to the server
        // when Publish is pressed, so a reload, a closed tab or a flat battery used to take
        // all of it. A copy goes into this browser on every change instead, under a key
        // naming the account and the campaign, and is offered back when the screen next
        // opens. It is never sent anywhere: it is in this browser, for this person.
        //
        // The chosen picture rides along only when it is small enough to be sure of fitting
        // in the few megabytes a browser allows; a draft that fails to save because of a
        // photograph would cost the words as well, which is the wrong trade.
        const DRAFT_IMG_MAX = 300 * 1024;
        const draftKey = 'baja.fundraise.draft|' + (user || 'anon') + '|'
            + (forOther ? forOther.enc + '/' : '') + (fileName || 'new');
        let draftTimer = null;
        const saveDraft = () => {
            // A chosen presentation is megabytes and never goes in here; the bar that
            // offers the draft back says so rather than letting somebody find out.
            const body = { at: Date.now(), doc: doc, hadDoc: !!pendingDoc };
            try {
                body.hadImage = !!pendingImage;
                if (pendingImage && pendingImage.dataUri && pendingImage.dataUri.length < DRAFT_IMG_MAX) {
                    body.image = pendingImage;
                }
                localStorage.setItem(draftKey, JSON.stringify(body));
            } catch (e) {
                // Out of room, or storage refused altogether (a private window). The words
                // are worth more than the picture, so try again without it.
                try { delete body.image; localStorage.setItem(draftKey, JSON.stringify(body)); } catch (e2) { }
            }
        };
        const dropDraft = () => {
            // The timer first. Publishing calls sync(), sync() calls touch(), and touch()
            // schedules a save half a second out: without this, the draft that was just
            // thrown away writes itself back and the next visit asks about changes that
            // are already published.
            clearTimeout(draftTimer);
            try { localStorage.removeItem(draftKey); } catch (e) { }
        };
        const readDraft = () => {
            try {
                const raw = localStorage.getItem(draftKey);
                if (!raw) return null;
                const d = JSON.parse(raw);
                return (d && d.doc && typeof d.doc === 'object') ? d : null;
            } catch (e) { return null; }
        };

        // IS THIS CAMPAIGN LIVE, AND IS WHAT I AM LOOKING AT WHAT THE WORLD SEES.
        //
        // Two different questions, and the console used to answer neither. A campaign that
        // exists on the server is live: anyone with its link is watching it right now, which
        // is worth knowing before you start editing. And an edit in this form changes nothing
        // out there until Publish, which is easy to forget when the preview beside you has
        // already moved.
        //
        // So: a grey pill while nothing is published, green once it is, and amber the moment
        // there is something unpublished, with the same amber around the Publish buttons.
        let liveWas = '';
        const liveUI = () => {
            const el = $('fc-live');
            if (!el) return;
            const live = !!docPath, hidden = doc.unlisted === true;
            const state = (live ? 'L' : 'N') + (dirty ? 'D' : '') + (hidden ? 'H' : '');
            if (state === liveWas) return;      // touch() runs on every keystroke
            liveWas = state;
            const grey = ['#64748b', 'rgba(148,163,184,0.12)', 'rgba(148,163,184,0.32)', '#cbd5e1'];
            const skin = dirty
                ? ['#fbbf24', 'rgba(251,191,36,0.14)', 'rgba(251,191,36,0.45)', '#fde68a']
                : (live ? (hidden ? ['#94a3b8', 'rgba(148,163,184,0.16)', 'rgba(148,163,184,0.4)', '#e2e8f0']
                    : ['#22c55e', 'rgba(34,197,94,0.14)', 'rgba(34,197,94,0.4)', '#bbf7d0']) : grey);
            const words = live
                ? (dirty ? 'Live, edits not published' : (hidden ? 'Live, not listed' : 'Live'))
                : (dirty ? 'Not live, nothing published yet' : 'Not live');
            el.style.background = skin[1];
            el.style.border = '1px solid ' + skin[2];
            el.style.color = skin[3];
            el.title = live
                ? (dirty ? 'The display is up, but what you have changed here is not on it yet.'
                    : (hidden ? 'The link works, but the campaign is not on the campaigns page.'
                        : 'The display is up and showing what is on this screen.'))
                : 'Nothing is published. Nobody can open this campaign yet.';
            el.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:' + skin[0]
                + ';display:inline-block;' + (dirty ? 'animation:fcWait 1.6s ease-in-out infinite;' : '') + '"></span>'
                + esc(words)
                + '<span style="opacity:0.7;font-size:10px;margin-left:1px;">\u25be</span>';
            for (const id of ['fc-publish', 'fc-publish2']) {
                const b = $(id);
                if (b) b.style.boxShadow = dirty ? '0 0 0 3px rgba(251,191,36,0.45)' : '';
            }
            const note = $('fc-pub-note');
            if (note) {
                note.textContent = dirty
                    ? 'You have changes that are not on the display yet. Publish to put them there.'
                    : (live ? 'The display is showing what is on this screen.'
                        : 'Nothing on the display changes until you publish.');
                note.style.color = dirty ? '#fde68a' : '#6f93a6';
            }
        };
        const touch = () => {
            dirty = true;
            liveUI();
            clearTimeout(draftTimer);
            draftTimer = setTimeout(saveDraft, 500);   // a keystroke is not a save
        };
        const sync = () => { fromForm(); preview(); donUI(); touch(); };
        toForm(); preview(); lists(); dirty = false; liveUI();

        // A CAMPAIGN THAT IS THERE BUT WOULD NOT COME BACK. Publishing over it would
        // replace a live fundraiser with this screen's defaults, so publishing is off
        // until it has been read or the person has said to start again deliberately.
        let locked = false;
        if (loadTrouble) {
            locked = true;
            const al = $('fc-alarm');
            al.style.display = '';
            al.innerHTML = '<b>This campaign could not be read.</b> It is published and people may be '
                + 'watching it, but the server did not hand it back: ' + esc(loadTrouble) + '.<br>'
                + 'Publishing is switched off, so nothing here can be written over it. '
                + '<button id="fc-retry" style="margin-top:9px;cursor:pointer;border:1px solid rgba(255,255,255,0.3);'
                + 'background:transparent;color:#fff;border-radius:8px;padding:7px 13px;font:700 12px system-ui;">'
                + 'Try again</button>';
            for (const id of ['fc-publish', 'fc-publish2']) {
                const b = $(id);
                if (b) { b.disabled = true; b.style.opacity = '0.45'; b.style.cursor = 'not-allowed'; }
            }
            const again = $('fc-retry');
            if (again) again.onclick = () => { try { window.location.reload(); } catch (e) { } };
        }

        // WHAT YOU HAD LAST TIME. Offered, never applied behind your back: the copy in this
        // browser can be older than the campaign if it was published from somewhere else,
        // and silently preferring one over the other is how people lose work either way.
        (() => {
            const d = readDraft();
            if (!d) return;
            let same = false;
            try { same = JSON.stringify(d.doc) === JSON.stringify(doc); } catch (e) { same = false; }
            if (same) { dropDraft(); return; }
            const bar = $('fc-draft');
            const mins = Math.max(0, Math.round((Date.now() - (+d.at || 0)) / 60000));
            const ago = mins < 1 ? 'a moment ago' : (mins < 60 ? (mins + (mins === 1 ? ' minute' : ' minutes') + ' ago')
                : (Math.round(mins / 60) + (Math.round(mins / 60) === 1 ? ' hour' : ' hours') + ' ago'));
            bar.style.display = '';
            bar.innerHTML = '<b>You have unpublished changes from ' + esc(ago) + '.</b> '
                + 'They were kept in this browser when the page closed'
                + ((d.image || !d.hadImage) && !d.hadDoc ? ''
                    : (', though the ' + [d.image ? '' : 'picture', d.hadDoc ? 'presentation' : '']
                        .filter(Boolean).join(' and the ') + ' you had chosen was not'))
                + '. ' + (docPath ? 'The campaign below is what is published.' : '')
                + '<div style="margin-top:9px;display:flex;gap:9px;flex-wrap:wrap;">'
                + '<button id="fc-draft-yes" style="cursor:pointer;border:1px solid #fbbf24;background:#fbbf24;'
                + 'color:#2a1a02;border-radius:8px;padding:7px 13px;font:700 12px system-ui;">Put them back</button>'
                + '<button id="fc-draft-no" style="cursor:pointer;border:1px solid rgba(255,255,255,0.3);'
                + 'background:transparent;color:#fff;border-radius:8px;padding:7px 13px;font:700 12px system-ui;">'
                + 'Throw them away</button></div>';
            $('fc-draft-yes').onclick = () => {
                doc = Object.assign(doc, d.doc);
                if (d.image && d.image.dataUri) { pendingImage = d.image; imageGone = false; }
                toForm(); lists(); imgUI(); preview();
                dirty = true; liveUI();
                bar.style.display = 'none';
                $('fc-status').textContent = 'Your changes are back. Publish to put them on the display.';
            };
            $('fc-draft-no').onclick = () => { dropDraft(); bar.style.display = 'none'; };
        })();
        for (const id of ['fc-title', 'fc-sub', 'fc-raised', 'fc-goal', 'fc-donors', 'fc-note', 'fc-story',
            'fc-don-label', 'fc-don-amts']) $(id).addEventListener('input', sync);
        for (const id of ['fc-don-on', 'fc-don-custom', 'fc-don-names']) $(id).addEventListener('change', sync);

        // THERE IS NO "PULL DONATIONS" BUTTON. There was one, and it did by hand what the
        // display already does by itself every few seconds: ask Stripe for payments against
        // this campaign and fold them into the document. A button for something that has
        // already happened is a button that is usually about to say "Nothing new from
        // Stripe", which reads like a fault rather than the truth. The endpoint it called is
        // still there and still called -- by the display, and by Reconcile on the campaigns
        // page, which is where someone goes when they want to know NOW.

        $('fc-cur').addEventListener('change', () => { sync(); lists(); });

        // Told while typing, not after pressing Publish: a name you have to change is worth
        // knowing about before you have filled in the rest of the form.
        let nameTimer = null, nameSeq = 0;
        const checkName = async () => {
            const out = $('fc-name-out'), title = ('' + $('fc-title').value).trim();
            if (!title) { out.textContent = ''; return; }
            const seq = ++nameSeq;
            const hit = await nameClash(title, docPath);
            if (seq !== nameSeq) return;                 // a later keystroke has answered
            if (hit) {
                out.innerHTML = '<span style="color:#fcd34d;">A campaign called “' + esc(hit.title || title)
                    + '” already exists. Choose another name, or open that one from All campaigns.</span>';
            } else out.innerHTML = '<span style="color:#6f93a6;">That name is available.</span>';
        };
        $('fc-title').addEventListener('input', () => {
            $('fc-name-out').textContent = '';
            clearTimeout(nameTimer);
            nameTimer = setTimeout(checkName, 450);
        });
        $('fc-hide').addEventListener('change', sync);

        // A gift ADDS to the total rather than replacing it: at a desk taking donations, the
        // number you have in hand is the gift, not the new running total.
        $('fc-add').onclick = () => {
            const g = parseMoney($('fc-gift').value);
            if (!g) { $('fc-status').textContent = 'Enter the amount of the gift first.'; return; }
            fromForm();
            doc.raised = (+doc.raised || 0) + g;
            doc.donors = (+doc.donors || 0) + 1;
            arr('gifts').unshift({
                amount: g, name: ('' + $('fc-gift-name').value).trim(),
                note: ('' + $('fc-gift-note').value).trim(), at: new Date().toISOString(), counted: true
            });
            if (doc.gifts.length > CAP) doc.gifts.length = CAP;
            toForm(); preview(); lists(); touch();
            $('fc-gift').value = ''; $('fc-gift-name').value = ''; $('fc-gift-note').value = '';
            try { $('fc-gift').focus(); } catch (e) { }
            $('fc-status').textContent = 'Added ' + money(g, doc.currency) + '. Publish to put it on the display.';
        };

        // An update is a dated post on the details page: what happened, while it is happening.
        $('fc-post').onclick = () => {
            const text = ('' + $('fc-upd').value).trim();
            const title = ('' + $('fc-upd-title').value).trim();
            if (!text && !title) { $('fc-status').textContent = 'Write the update first.'; return; }
            fromForm();
            arr('updates').unshift({ at: new Date().toISOString(), title: title, text: text });
            if (doc.updates.length > CAP) doc.updates.length = CAP;
            $('fc-upd').value = ''; $('fc-upd-title').value = '';
            preview(); lists(); touch();
            $('fc-status').textContent = 'Update written. Publish to put it on the details page.';
        };

        // ONE NAME, ONE CAMPAIGN. The file is named from the title, so two campaigns called
        // the same thing are one file: publishing the second would overwrite the first, and
        // every link handed out for it would quietly start showing the other campaign's
        // money. That is the failure this prevents.
        //
        // The check is made two ways because either can be unavailable. Asking the server for
        // this user's campaigns gives the real titles, which is what makes the message useful
        // and catches a RENAME onto a name another campaign already has. Reading the file the
        // name would occupy needs no new endpoint and is what actually decides it: `/user/` in
        // a path is replaced with this user's folder server-side, so the console can look at
        // its own public folder without knowing how that folder is named.
        const titleKey = (t) => ('' + (t || '')).trim().toLowerCase().replace(/\s+/g, ' ');
        let known = [];
        const loadKnown = async () => {
            try {
                const r = await POSTJSON({ user: user }, host + '/fundraise/campaigns');
                known = (r && Array.isArray(r.campaigns)) ? r.campaigns : [];
            } catch (e) { known = []; }
            return known;
        };
        const fileExists = async (name) => {
            try {
                const rs = await POSTJSON({ path: '/user/public/' + name, key: 'user', user: user }, host + '/load-file');
                let d = rs;
                if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
                if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
                return !!(d && typeof d === 'object' && (d.kind === 'fundraise' || d.goal != null));
            } catch (e) { return false; }
        };
        // Returns the campaign in the way, or null. `mine` is the path being edited, which can
        // never be in its own way.
        const nameClash = async (title, mine) => {
            const t = titleKey(title);
            if (!t) return null;
            const want = slug(title) + '.fund';
            for (const c of known) {
                if (mine && c.path === mine) continue;
                if (titleKey(c.title) === t || c.file === want) return c;
            }
            if (mine) return null;                       // a rename cannot collide with a file it already owns
            return (await fileExists(want)) ? { title: title, file: want, path: '' } : null;
        };

        // THE PUBLISHED LINK, in the share dialog this platform already uses for a public
        // link (manchester/design-share.js): same overlay, same card, same wording for the
        // same promise. A link is the whole point of publishing, and a line of grey text at
        // the bottom of a long form is a place to miss it.
        // WHO ELSE CAN WORK ON THIS CAMPAIGN.
        //
        // One campaign, named addresses, granted by the account that owns it. What it
        // grants is the console: the totals, the story, the picture, the updates. It does
        // not grant deleting the campaign, giving it away, or the donor report, which stay
        // with the owner.
        //
        // The list is kept by the server outside the public folder, never in the campaign
        // document: that document is fetched by everyone who opens the display, and a list
        // of colleagues' addresses in it would be a list of addresses on the open web.
        const shareDialog = async () => {
            try { const o = document.getElementById('baja-fundraise-share'); if (o && o.parentNode) o.parentNode.removeChild(o); } catch (e) { }
            const w = document.createElement('div');
            w.id = 'baja-fundraise-share';
            w.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,0.45);'
                + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
            w.innerHTML = '<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
                + 'width:min(520px,92vw);max-height:86vh;overflow:auto;background:#0b2545;color:#eaf6f9;'
                + 'border:1px solid rgba(255,255,255,0.18);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,0.55);padding:20px 22px;">'
                + '<div style="font:800 17px system-ui;">Who can edit this campaign</div>'
                + '<div style="margin-top:6px;font:13px/1.6 system-ui;color:#9fb3c8;">'
                + 'They sign in with their own account and find it under My campaigns. They can change '
                + 'the campaign, its picture and its updates. They cannot delete it, cannot share it on, '
                + 'and do not see the donations report.</div>'
                + '<div id="fs-list" style="margin-top:14px;"></div>'
                + '<label style="display:block;margin:16px 0 5px;font:600 12px system-ui;color:#9fb3c8;">Add somebody</label>'
                + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
                + '<input id="fs-mail" type="email" placeholder="their email address" autocomplete="off" '
                + 'style="flex:1 1 240px;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:10px 11px;font:16px system-ui;"/>'
                + '<button id="fs-add" style="cursor:pointer;border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                + 'border-radius:8px;padding:10px 16px;font:700 12.5px system-ui;">Add</button></div>'
                + '<div id="fs-out" style="margin-top:9px;font:12.5px system-ui;color:#9fb3c8;min-height:17px;"></div>'
                + '<div style="margin-top:16px;text-align:right;">'
                + '<button id="fs-done" style="cursor:pointer;border:1px solid rgba(255,255,255,0.25);background:transparent;'
                + 'color:#fff;border-radius:8px;padding:9px 16px;font:700 12.5px system-ui;">Done</button></div></div>';
            document.body.appendChild(w);
            const q = (id) => w.querySelector('#' + id);
            const shut = () => { try { w.parentNode.removeChild(w); } catch (e) { } };
            q('fs-done').onclick = shut;
            w.addEventListener('click', (e) => { if (e.target === w) shut(); });

            let editors = [];
            const paint = () => {
                const box = q('fs-list');
                if (!editors.length) {
                    box.innerHTML = '<div style="font:13px system-ui;color:#7fa3b8;padding:10px 0;">'
                        + 'Nobody else yet. It is yours alone.</div>';
                    return;
                }
                box.innerHTML = editors.map((e) =>
                    '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;'
                    + 'border-top:1px solid rgba(255,255,255,0.09);">'
                    + '<span style="font:13.5px system-ui;word-break:break-all;">' + esc(e) + '</span>'
                    + '<button data-drop="' + esc(e) + '" style="margin-left:auto;cursor:pointer;'
                    + 'border:1px solid rgba(252,165,165,0.45);background:transparent;color:#fca5a5;'
                    + 'border-radius:7px;padding:6px 11px;font:700 11.5px system-ui;">Remove</button></div>').join('');
                for (const b2 of box.querySelectorAll('[data-drop]')) {
                    b2.onclick = () => send({ remove: b2.getAttribute('data-drop') },
                        'Removed ' + b2.getAttribute('data-drop') + '.');
                }
            };
            const send = async (extra, said) => {
                q('fs-out').style.color = '#9fb3c8';
                q('fs-out').textContent = 'Saving…';
                try {
                    const r = await POSTJSON(Object.assign({ user: user, path: docPath }, extra),
                        host + '/fundraise/share');
                    if (!r || r.ok !== true) throw new Error(problemText(r));
                    editors = Array.isArray(r.editors) ? r.editors : [];
                    paint();
                    q('fs-out').textContent = said || '';
                    q('fs-mail').value = '';
                } catch (e) {
                    q('fs-out').style.color = '#fca5a5';
                    q('fs-out').textContent = (e && e.message) ? e.message : ('' + e);
                }
            };
            q('fs-add').onclick = () => {
                const v = ('' + q('fs-mail').value).trim();
                if (!v) { q('fs-mail').focus(); return; }
                send({ add: v }, 'Added ' + v + '. It is in their My campaigns now.');
            };
            q('fs-mail').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('fs-add').click(); });
            await send({}, '');
            try { q('fs-mail').focus(); } catch (e) { }
        };

        const linkDialog = (link, campaign) => {
            try { const old_ = document.getElementById('baja-fundraise-link'); if (old_ && old_.parentNode) old_.parentNode.removeChild(old_); } catch (e) { }
            const w = document.createElement('div');
            w.id = 'baja-fundraise-link';
            w.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,0.45);font-family:Arial,Helvetica,sans-serif;';
            const dbtn = (id, label, primary) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + (primary ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                    : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';
            w.innerHTML = '<div style="position:absolute;top:70px;left:50%;transform:translateX(-50%);width:min(560px,94vw);'
                + 'max-height:calc(100vh - 100px);overflow:auto;background:#0b2545;color:#fff;border:1px solid rgba(255,255,255,0.14);'
                + 'border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);padding:18px;">'
                + '<div style="font:700 16px Arial;margin-bottom:4px;">Your campaign is live</div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-bottom:14px;">' + esc(campaign || '') + '</div>'
                + '<div style="font:700 13px Arial;margin-bottom:6px;">A public link</div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-bottom:8px;">Anyone with the link can watch it, without signing in. '
                + 'It re-reads the campaign every few seconds, so publishing again moves the number on their screen.</div>'
                + '<input id="fl-url" readonly value="' + esc(link) + '" style="width:100%;box-sizing:border-box;background:#0a1e3a;'
                + 'color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px;font:13px Arial;"/>'
                + '<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">'
                + dbtn('fl-copy', 'Copy link', true) + dbtn('fl-open', 'Open the display', false) + dbtn('fl-close', 'Close', false) + '</div>'
                + '<div id="fl-out" style="margin-top:10px;font:12px Arial;color:#cfe0f5;min-height:16px;"></div></div>';
            document.body.appendChild(w);
            // The editor shell listens for these on the document; a dialog must keep its own.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) w.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            const close = () => { try { if (w.parentNode) w.parentNode.removeChild(w); } catch (e) { } };
            w.addEventListener('click', (e) => { if (e.target === w) close(); });
            w.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
            document.getElementById('fl-close').onclick = close;
            document.getElementById('fl-open').onclick = () => { try { window.open(link, '_blank', 'noopener'); } catch (e) { } };
            document.getElementById('fl-copy').onclick = async () => {
                let ok = false;
                try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); ok = true; } } catch (e) { }
                // Without clipboard permission the link is still selected, which is the next
                // best thing: Ctrl+C then does it.
                if (!ok) { try { const f = document.getElementById('fl-url'); f.focus(); f.select(); } catch (e) { } }
                document.getElementById('fl-out').textContent = ok ? 'Copied to your clipboard.' : 'Selected: press Ctrl+C to copy.';
            };
            try { const f = document.getElementById('fl-url'); f.focus(); f.select(); } catch (e) { }
        };

        // `quiet` is passed by the status menu, which publishes to carry a hide or a show
        // and has no business throwing the share dialog in somebody's face for it. It is
        // read off an object, never off the argument itself: these are also assigned
        // straight to onclick, where the argument is a DOM event.
        const publish = async (opts) => {
            const quiet = !!(opts && opts.quiet === true);
            if (locked) {
                $('fc-status').innerHTML = '<span style="color:#fca5a5;">This campaign could not be read, so '
                    + 'publishing is switched off. Reload the page, or open it from All campaigns.</span>';
                return;
            }
            sync();
            if (!doc.title) { $('fc-status').textContent = 'Give the campaign a name first.'; return; }
            // Re-read rather than trust the list from a minute ago: this is the check that
            // stands between a second campaign and the first one's money.
            await loadKnown();
            const clash = await nameClash(doc.title, docPath);
            if (clash) {
                $('fc-status').innerHTML = '<span style="color:#fca5a5;">A campaign called “' + esc(clash.title || doc.title)
                    + '” already exists, and publishing this would write over it. Give this one a different name, '
                    + 'or open that campaign from All campaigns and carry on with it.</span>';
                try { $('fc-title').focus(); $('fc-title').select(); } catch (e) { }
                checkName();
                return;
            }
            const busy = (v) => { for (const id of ['fc-publish', 'fc-publish2']) { const el = $(id); if (el) el.disabled = v; } };
            busy(true); $('fc-status').textContent = 'Publishing…';
            doc.updated = new Date().toISOString();
            // The publisher's address is NOT written into the campaign. The document is
            // fetched by anyone who opens the public display, so a field here is a field
            // on the open web. Ownership is the folder the file sits in, which the server
            // checks; it was never this line's job. An address put there by an earlier
            // version of this console is cleared on the next publish.
            if (doc.by) delete doc.by;
            if (!fileName) fileName = slug(doc.title) + '.fund';
            // The picture goes first: a campaign pointing at a file that is not there yet
            // would show a broken display for however long the two writes are apart.
            try {
                const m = med();
                if (imageGone && !pendingImage) { m.imageFile = ''; m.imageV = 0; }
                if (teamDirty || (teamArr().length && !doc.teamFile)) {
                    const tName = teamFileFor();
                    // Only the faces still attached to someone: a removed member's portrait
                    // should not sit in a public folder for ever.
                    const keep = {};
                    for (const m of teamArr()) if (teamFaces[m.id]) keep[m.id] = teamFaces[m.id];
                    const rsT = await putFile(tName, JSON.stringify({ kind: 'fundraise-team', faces: keep }));
                    if (!rsT || !(rsT.status === 'saved' || rsT.path)) throw new Error('the team photographs could not be saved');
                    teamFaces = keep; doc.teamFile = tName; doc.teamV = Date.now(); teamDirty = false;
                }
                if (docGone && !pendingDoc) { m.docFile = ''; m.docV = 0; m.docName = ''; m.docKind = ''; m.docBytes = 0; }
                if (pendingDoc) {
                    $('fc-status').textContent = 'Saving the presentation…';
                    const dName = docFileFor();
                    const rsD = await putFile(dName, JSON.stringify({
                        kind: 'fundraise-doc', name: pendingDoc.name, docKind: pendingDoc.kind,
                        bytes: pendingDoc.bytes, dataUri: pendingDoc.dataUri,
                    }));
                    if (!rsD || !(rsD.status === 'saved' || rsD.path)) throw new Error('the presentation could not be saved');
                    m.docFile = dName; m.docV = Date.now(); m.docName = pendingDoc.name;
                    m.docKind = pendingDoc.kind; m.docBytes = pendingDoc.bytes;
                    pendingDoc = null; docGone = false;
                    try { $('fc-doc').value = ''; } catch (e) { }
                    $('fc-doc-out').textContent = 'Presentation saved.';
                }
                if (pendingImage) {
                    $('fc-status').textContent = 'Saving the picture…';
                    const imgName = imgFileFor();
                    const rs0 = await putFile(imgName, JSON.stringify({ kind: 'fundraise-image', dataUri: pendingImage.dataUri }));
                    if (!rs0 || !(rs0.status === 'saved' || rs0.path)) throw new Error('the picture could not be saved');
                    m.imageFile = imgName; m.imageV = Date.now();
                    loadedImage = pendingImage.dataUri; pendingImage = null; imageGone = false;
                    try { $('fc-img').value = ''; } catch (e) { }
                    $('fc-img-out').textContent = 'Picture saved.';
                }
            } catch (e) {
                $('fc-status').innerHTML = '<span style="color:#fca5a5;">Could not save it: '
                    + esc(e && e.message ? e.message : e) + '. Nothing else was published.</span>';
                busy(false); return;
            }
            try {
                const rs = await putFile(fileName, JSON.stringify(doc));
                if (!rs || !(rs.status === 'saved' || rs.path)) throw new Error((rs && (rs.status || rs.error_description || rs.error)) || 'the campaign could not be saved');
                // Marks the folder public, the same marker a shared genome writes. The
                // admin route writes it itself, so this is only for one's own folder.
                if (!forOther) {
                    try { await POSTJSON({ name: '.share', key: 'user', user: user, spath: 'public', value: 'public\n/public' }, host + '/save-user-data'); } catch (e) { }
                }
                docPath = ('' + (rs.path || '')).replace(/\/{2,}/g, '/');
                let link = window.location.origin + '/app/manchester/viewer-fundraise?path=' + encodeURIComponent(docPath);
                // THE LINK PEOPLE ARE GIVEN IS /f/<code>. It is short enough to read out, it
                // keeps the owner's email out of the address bar on a screen in a room, and
                // it is the only form of this link that can carry a preview card: that route
                // is answered by the server, so a post on Facebook or a message in Slack
                // shows the campaign's own title and picture instead of the Baja shell's.
                // It sends a browser on to the display immediately.
                try {
                    const al = await POSTJSON({ path: docPath }, host + '/share-alias');
                    if (al && al.code) link = window.location.origin + '/f/' + encodeURIComponent(al.code);
                } catch (e) { }
                publicLink = link;
                let copied = false;
                try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); copied = true; } } catch (e) { }
                dirty = false; dropDraft(); liveUI();
                $('fc-status').textContent = quiet
                    ? (doc.unlisted === true
                        ? 'Hidden. The link still works, and it comes off the campaigns page within a minute.'
                        : 'Listed. It appears on the campaigns page within a minute.')
                    : 'Published. Anyone with the link can watch it, and it updates itself.';
                $('fc-link').innerHTML = (copied ? 'Copied to your clipboard: ' : 'The link: ')
                    + '<a href="' + esc(link) + '" target="_blank" rel="noopener" style="color:#4fd0e6;">' + esc(link) + '</a>';
                if (!quiet) linkDialog(link, doc.title);
            } catch (e) {
                $('fc-status').innerHTML = '<span style="color:#fca5a5;">Could not publish: ' + esc(e && e.message ? e.message : e) + '</span>';
            }
            busy(false);
        };
        $('fc-publish').onclick = publish;
        $('fc-publish2').onclick = publish;

        // ---- THE STATUS MENU ------------------------------------------------------------
        //
        // The pill says whether the campaign is live; pressing it is where the two things
        // you might want to do about that live. Both are built here rather than as buttons
        // on the form, because neither is an edit: they take effect at once, and one of
        // them cannot be undone.
        //
        // HIDE takes the campaign off the campaigns page and leaves the link working. It is
        // a field in the document (`unlisted`), so it is carried by a publish like any other
        // change, and the directory's index is cached for half a minute: hence "within a
        // minute" rather than a promise it is already gone.
        //
        // DELETE removes the campaign and its picture and team files, and breaks the link
        // for anybody watching. It asks twice, and the second press is the one that does it.
        const liveMenu = () => $('fc-live-menu');
        const closeLive = () => {
            const m = liveMenu();
            if (m) { m.style.display = 'none'; m.innerHTML = ''; }
            try { $('fc-live').setAttribute('aria-expanded', 'false'); } catch (e) { }
            delArmed = false; clearTimeout(delTimer);
        };
        let delArmed = false, delTimer = null;
        const liveItem = (id, label, note, bad) =>
            '<button type="button" id="' + id + '" role="menuitem" style="display:block;width:100%;text-align:left;'
            + 'cursor:pointer;border:0;background:none;padding:11px 14px;font:600 13px system-ui;'
            + 'color:' + (bad ? '#fca5a5' : '#eaf6f9') + ';'
            + (bad ? 'border-top:1px solid rgba(255,255,255,0.12);' : '') + '">' + esc(label)
            + (note ? '<span style="display:block;margin-top:3px;font:400 11.5px system-ui;color:#8fb0c4;">'
                + esc(note) + '</span>' : '') + '</button>';

        const drawLiveMenu = () => {
            const m = liveMenu();
            if (!m) return;
            const live = !!docPath, hidden = doc.unlisted === true;
            if (!live) {
                m.innerHTML = '<div style="padding:11px 14px;font:400 12px system-ui;color:#9fb3c8;">'
                    + 'Nothing is published yet, so there is nothing to hide or delete.</div>'
                    + liveItem('fc-lm-pub', 'Publish it now', 'Then anyone with the link can watch it.');
            } else {
                m.innerHTML = hidden
                    ? liveItem('fc-lm-hide', 'Put it back on the campaigns page',
                        'Anyone browsing gene.clinic can find it again.')
                    : liveItem('fc-lm-hide', 'Hide from the campaigns page',
                        'The link keeps working. It just stops being listed.');
                // Only the owner decides who may edit, and only the owner may delete. A
                // guest editor is offered neither: the server refuses both, and a button
                // that is going to be refused should not be on the screen.
                if (!asGuest) {
                    m.innerHTML += liveItem('fc-lm-who', 'Who can edit this',
                        'Share the console with somebody, by email address.');
                    m.innerHTML += liveItem('fc-lm-del', 'Delete this campaign',
                        'The link stops working. An administrator can still put it back.', true);
                }
            }
            const pub = $('fc-lm-pub');
            if (pub) pub.onclick = () => { closeLive(); publish(); };
            const whoBtn = $('fc-lm-who');
            if (whoBtn) whoBtn.onclick = () => { closeLive(); shareDialog(); };
            const hide = $('fc-lm-hide');
            if (hide) hide.onclick = async () => {
                closeLive();
                doc.unlisted = !hidden;
                if (!doc.unlisted) delete doc.unlisted;   // the absence IS listed; do not store a false
                liveUI();
                await publish({ quiet: true });
            };
            const del = $('fc-lm-del');
            if (del) del.onclick = async () => {
                if (!delArmed) {
                    delArmed = true;
                    del.innerHTML = 'Really delete it?'
                        + '<span style="display:block;margin-top:3px;font:400 11.5px system-ui;color:#fca5a5;">'
                        + 'It comes off the directory and the link stops working.</span>';
                    clearTimeout(delTimer);
                    delTimer = setTimeout(() => { delArmed = false; drawLiveMenu(); }, 6000);
                    return;
                }
                clearTimeout(delTimer); delArmed = false;
                closeLive();
                $('fc-status').textContent = 'Deleting…';
                try {
                    // NOT /rm. /fundraise/retire moves the campaign and its picture and
                    // team files out of the public folder into the account's own
                    // deleted-campaigns folder: the link stops working and nobody can read
                    // it, and an administrator can put the whole thing back, at the same
                    // path, so the links start working again. A campaign is somebody's
                    // fundraiser for a sick child, often with the only copy of its story in
                    // it, and "are you sure" pressed twice is not a backup.
                    const r = await POSTJSON({ path: docPath, key: 'user', user: user }, host + '/fundraise/retire');
                    if (!r || r.ok !== true) throw new Error(problemText(r));
                    dirty = false;
                    return leave('/app/fundraise/admin', 'fundraise/admin');
                } catch (e) {
                    $('fc-status').innerHTML = '<span style="color:#fca5a5;">Could not delete it: '
                        + esc((e && e.message) ? e.message : e) + '</span>';
                }
            };
        };
        $('fc-live').onclick = (e) => {
            try { e.stopPropagation(); } catch (x) { }
            const m = liveMenu();
            if (!m) return;
            if (m.style.display !== 'none') { closeLive(); return; }
            drawLiveMenu();
            m.style.display = '';
            try { $('fc-live').setAttribute('aria-expanded', 'true'); } catch (x) { }
        };
        document.addEventListener('pointerdown', (e) => {
            try {
                const w = $('fc-live-wrap');
                if (w && e.target && w.contains(e.target)) return;
                if (liveMenu() && liveMenu().style.display !== 'none') closeLive();
            } catch (x) { }
        }, true);
        const openDisplay = () => {
            if (!publicLink) { $('fc-status').textContent = 'Publish it first, then the display has something to read.'; return; }
            try { window.open(publicLink, '_blank', 'noopener'); } catch (e) { }
        };
        $('fc-open').onclick = openDisplay;
        $('fc-open2').onclick = openDisplay;
        // TAKE THIS SCREEN DOWN BEFORE OPENING THE NEXT ONE.
        //
        // This console is not drawn in the widget area: it is a fixed, full-screen element on
        // document.body, which is what lets it own the whole window. clear() empties the
        // widget area and cannot touch it, so leaving without removing it first drew the next
        // screen underneath an opaque sheet that was still covering the window -- which is
        // exactly what "Cancel does nothing" looked like. The same is true of every other way
        // out of here.
        const takeDown = () => {
            try {
                const el = document.getElementById('baja-fundraise-console');
                if (el && el.parentNode) el.parentNode.removeChild(el);
            } catch (e) { }
            // The sheets this console put in <head> go with it. They are harmless left
            // behind, but a page that collects a style element every time somebody opens
            // the console is a page that collects them forever.
            for (const id of ['fc-anim', 'fc-phone']) {
                try {
                    const st = document.getElementById(id);
                    if (st && st.parentNode) st.parentNode.removeChild(st);
                } catch (e) { }
            }
        };
        const leave = async (where, mod) => {
            takeDown();
            try { clear(); } catch (e) { }
            try { window.history.pushState({}, '', where); } catch (e) { }
            // baja/init.js clears the page and pushes its own URL, so there is nothing to
            // undo here first; if it fails the browser still goes there, rather than
            // leaving someone on an empty screen.
            try { await exec(mod); }
            catch (e) { try { window.location.href = where; } catch (e2) { } }
        };
        let cancelArmed = false, cancelTimer = null;
        const cancel = async () => {
            if (dirty && !cancelArmed) {
                cancelArmed = true;
                for (const id of ['fc-cancel', 'fc-cancel2']) { const el = $(id); if (el) el.textContent = 'Leave without publishing?'; }
                $('fc-status').textContent = 'What is on this screen has not been published.';
                cancelTimer = setTimeout(() => {
                    cancelArmed = false;
                    for (const id of ['fc-cancel', 'fc-cancel2']) { const el = $(id); if (el) el.textContent = 'Cancel'; }
                }, 6000);
                return;
            }
            clearTimeout(cancelTimer);
            await leave('/app/baja/init', 'baja/init');
        };
        $('fc-cancel').onclick = cancel;
        $('fc-cancel2').onclick = cancel;

        // THE ACCOUNT MENU. Every item leaves this screen, so every item has to take the
        // console down on the way out (it is a fixed sheet on document.body, which clear()
        // cannot touch) and has to ask first when there is unpublished work -- the same
        // two-press question Cancel asks, in the item itself.
        const menu = () => $('fc-who-menu');
        const closeMenu = () => { const m = menu(); if (m) m.style.display = 'none'; armedGo = ''; resetGo(); };
        const resetGo = () => {
            for (const b of (menu() ? menu().querySelectorAll('[data-go]') : []))
                b.textContent = { home: 'Home', files: 'My files', campaigns: 'My campaigns', out: 'Sign out' }[b.getAttribute('data-go')];
        };
        let armedGo = '', goTimer = null;
        $('fc-who').onclick = (e) => {
            try { e.stopPropagation(); } catch (x) { }
            const m = menu();
            if (m) m.style.display = (m.style.display === 'none') ? '' : 'none';
            if (m && m.style.display === 'none') { armedGo = ''; resetGo(); }
        };
        document.addEventListener('pointerdown', (e) => {
            try {
                const w = $('fc-who-wrap');
                if (w && e.target && w.contains(e.target)) return;
                closeMenu();
            } catch (x) { }
        }, true);
        for (const b of (menu() ? menu().querySelectorAll('[data-go]') : [])) {
            b.onclick = async () => {
                const k = b.getAttribute('data-go');
                if (dirty && armedGo !== k) {
                    armedGo = k;
                    resetGo();
                    b.textContent = 'Leave without publishing?';
                    clearTimeout(goTimer);
                    goTimer = setTimeout(() => { armedGo = ''; resetGo(); }, 6000);
                    return;
                }
                clearTimeout(goTimer); armedGo = '';
                closeMenu();
                if (k === 'out') {
                    // Down first: the sign-in page draws where the application draws, and
                    // this sheet would be sitting on top of it.
                    takeDown();
                    try { clear(); } catch (x) { }
                    try { logout(); } catch (x) { try { window.location.href = '/login'; } catch (x2) { } }
                    return;
                }
                if (k === 'files') return leave('/app/baja/fb', 'manchester/fb.js');
                if (k === 'campaigns') return leave('/app/fundraise/admin', 'fundraise/admin');
                return leave('/app/baja/init', 'baja/init');
            };
        }

        $('fc-all').onclick = async () => {
            takeDown();
            try { clear(); } catch (e) { }
            try { window.history.pushState({}, '', '/app/fundraise/admin'); } catch (e) { }
            await exec('fundraise/admin');
        };
        loadKnown().then(() => { if (!docPath) checkName(); });
        if (docPath) { readImage(); readTeam(); }
        try { $('fc-title').focus(); } catch (e) { }
        return true;
    })();
}
