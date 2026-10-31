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
        const forOther = (() => {
            try {
                const o = ('' + ((config && config.owner) || '')).trim();
                const e = ('' + ((config && config.enc) || '')).trim();
                if (!o || !e || o.toLowerCase() === user.toLowerCase()) return null;
                return { owner: o, enc: e };
            } catch (e) { return null; }
        })();

        // One way to write a campaign file, whoever it belongs to. The server's own reply
        // shapes differ, so this gives the caller the one shape the publish code reads.
        const putFile = async (name, value) => {
            if (forOther) {
                const r = await POSTJSON({ user: user, enc: forOther.enc, name: name, value: value },
                    host + '/fundraise/all-file');
                if (!r || r.error || (r.status && +r.status >= 400)) return r || {};
                return { status: 'saved', path: r.path };
            }
            return await POSTJSON({ name: name, key: 'user', user: user, spath: 'public', value: value },
                host + '/save-user-data');
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
            goal: 100000, raised: 0, donors: 0, note: '', updated: '', by: '',
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
            media: { theme: 'deep', imageFile: '', imageV: 0, imageMode: 'background', youtube: '' },
            // The people behind the campaign. Their faces are NOT in here either, for the
            // same reason the campaign photograph is not: this document is re-read every few
            // seconds. Names and roles are a few bytes and stay; the portraits live in a
            // sibling file, fetched once.
            team: [], teamV: 0, teamFile: ''
        };
        const TEAM_MAX = 16;
        const teamArr = () => (Array.isArray(doc.team) ? doc.team : (doc.team = []));
        const med = () => (doc.media && typeof doc.media === 'object' ? doc.media
            : (doc.media = { theme: 'deep', imageFile: '', imageV: 0, imageMode: 'background', youtube: '' }));
        const THEMES = [
            ['deep', 'Deep blue'], ['midnight', 'Midnight'], ['forest', 'Forest'],
            ['warm', 'Warm'], ['plain', 'Plain dark'],
        ];
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

        if (docPath) {
            try {
                const rs = await POSTJSON({ path: docPath, key: 'user', user: user }, host + '/load-file');
                let d = rs;
                if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
                if (d && typeof d === 'object' && (d.kind === 'fundraise' || d.goal != null)) doc = Object.assign(doc, d);
                fileName = docPath.substring(docPath.lastIndexOf('/') + 1);
            } catch (e) { }
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
                ? 'Editing a campaign that belongs to <b style="color:#fde68a;">' + esc(forOther.owner) + '</b>. It saves back into their folder.'
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
            + '<div style="margin-left:auto;display:flex;gap:10px;">' + btn('fc-cancel', 'Cancel') + btn('fc-all', 'All campaigns')
            + btn('fc-open', 'Open the display') + btn('fc-publish', 'Publish', 'go') + '</div></div>'
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
            + '<select id="fc-theme" style="' + inp + '">' + THEMES.map((t) => '<option value="' + t[0] + '">' + t[1] + '</option>').join('') + '</select>'
            + '<label style="' + lbl + '">A picture (optional)</label>'
            + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
            + '<input id="fc-img" type="file" accept="image/*" style="font:12.5px system-ui;color:#9fb3c8;max-width:250px;"/>'
            + '<select id="fc-img-mode" style="' + inp + 'flex:0 0 185px;">'
            + '<option value="background">behind the whole display</option>'
            + '<option value="banner">above the title</option></select>'
            + btn('fc-img-clear', 'Remove') + '</div>'
            + '<div id="fc-img-out" style="margin-top:6px;font:12px system-ui;color:#6f93a6;"></div>'
            + '<div id="fc-img-prev" style="margin-top:8px;"></div>'
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
            + '<span style="font:12px system-ui;color:#6f93a6;">Nothing on the display changes until you publish.</span></div>'
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
        // A chosen one goes through the same path an uploaded photograph does: drawn onto
        // a canvas at 1200x630 and saved as a JPEG. It is not kept as SVG, because the
        // link-preview endpoint serves raster formats only -- a campaign that picked a
        // drawing would otherwise share with no picture at all.
        const ART = {
            ribbon: ['Awareness ribbon', '#0b2e4a', '#124a63', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="26" stroke-linecap="round">'
                + '<path d="M556 524 C578 482 600 456 612 430 C640 374 668 358 664 308'
                + ' C660 248 620 220 600 220 C580 220 540 248 536 308'
                + ' C532 358 560 374 588 430 C600 456 622 482 644 524"/></g>'],
            helix: ['DNA', '#07263b', '#0d4a52', (a) => {
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
            zebra: ['Zebra stripes', '#0a2235', '#123b52', (a) => {
                let out = '';
                for (let i = 0; i < 9; i++) {
                    const x = 180 + i * 110;
                    out += '<path d="M' + x + ' 60 C' + (x + 70) + ' 220 ' + (x - 50) + ' 410 ' + (x + 40)
                        + ' 580" fill="none" stroke="' + a + '" stroke-width="' + (16 + (i % 3) * 7)
                        + '" stroke-linecap="round" opacity="0.85"/>';
                }
                return out;
            }],
            scope: ['Microscope', '#08283f', '#10465c', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="22" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M470 470 L730 470"/><path d="M540 470 L540 400 Q540 330 600 300"/>'
                + '<path d="M600 300 L660 180 L720 210 L665 330 Z"/><path d="M470 400 Q470 250 600 210"/>'
                + '<path d="M500 520 L700 520"/></g>'],
            cells: ['Cells', '#072a3c', '#0f4a4a', (a) => {
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
            hands: ['In our hands', '#0a2740', '#13455f', (a) =>
                '<g transform="translate(600,290) scale(1.25) translate(-600,-290)" fill="none" stroke="' + a
                + '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round">'
                + '<path d="M600 404 C548 366 514 338 514 302 C514 274 536 256 560 256'
                + ' C579 256 593 269 600 284 C607 269 621 256 640 256 C664 256 686 274 686 302'
                + ' C686 338 652 366 600 404 Z" fill="' + a + '" opacity="0.5"/>'
                + '<path d="M448 432 C448 552 752 552 752 432"/>'
                + '<path d="M448 432 C430 406 448 378 474 384"/>'
                + '<path d="M752 432 C770 406 752 378 726 384"/></g>'],
            seedling: ['A beginning', '#0a2e32', '#11514b', (a) =>
                '<g fill="none" stroke="' + a + '" stroke-width="22" stroke-linecap="round">'
                + '<path d="M600 520 L600 330"/>'
                + '<path d="M600 390 C520 390 460 340 455 265 C540 258 600 310 600 390 Z" fill="' + a
                + '" opacity="0.5"/>'
                + '<path d="M600 350 C680 350 745 300 750 225 C660 218 600 270 600 350 Z" fill="' + a
                + '" opacity="0.5"/>'
                + '<path d="M470 530 L730 530"/></g>'],
            summit: ['The climb', '#092033', '#0f3f58', (a) =>
                '<circle cx="775" cy="200" r="58" fill="' + a + '" opacity="0.85"/>'
                + '<path d="M240 540 L470 250 L620 450 L720 330 L960 540 Z" fill="' + a + '" opacity="0.5"'
                + ' stroke="' + a + '" stroke-width="20" stroke-linejoin="round"/>'
                + '<path d="M470 250 L556 362 L384 362 Z" fill="#eaf6f9" opacity="0.85"/>'
                + '<path d="M240 540 L960 540" stroke="' + a + '" stroke-width="22" stroke-linecap="round"/>'],
        };
        const artSvg = (id) => {
            const a = ART[id];
            if (!a) return '';
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">'
                + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
                + '<stop offset="0" stop-color="' + a[1] + '"/>'
                + '<stop offset="1" stop-color="' + a[2] + '"/></linearGradient></defs>'
                + '<rect width="1200" height="630" fill="url(#g)"/>'
                + '<g transform="translate(0,20)">' + a[3]('#5ee3a6') + '</g></svg>';
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
            box.innerHTML = Object.keys(ART).map((id) =>
                '<button type="button" data-art="' + id + '" title="' + esc(ART[id][0]) + '"'
                + ' aria-label="Use the picture: ' + esc(ART[id][0]) + '"'
                + ' style="width:84px;height:47px;padding:0;border-radius:7px;cursor:pointer;'
                + 'border:1px solid rgba(255,255,255,0.18);background:#0a1e3a center/cover no-repeat;'
                + 'background-image:url(&quot;' + artUri(id) + '&quot;);"></button>').join('');
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
            $('fc-img-mode').value = (m.imageMode === 'banner') ? 'banner' : 'background';
            $('fc-yt').value = m.youtube || '';
            imgUI(); ytUI();
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
            m.imageMode = ($('fc-img-mode').value === 'banner') ? 'banner' : 'background';
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
        const PREV_THEME = {
            deep: 'radial-gradient(600px 300px at 50% -20%,#123a63 0%,#0a1e3a 60%,#071526 100%)',
            midnight: 'radial-gradient(600px 300px at 50% -20%,#241b4e 0%,#140f2e 60%,#0a0718 100%)',
            forest: 'radial-gradient(600px 300px at 50% -20%,#14492f 0%,#0b2a1d 60%,#061712 100%)',
            warm: 'radial-gradient(600px 300px at 50% -20%,#5a2b1b 0%,#311611 60%,#1a0c08 100%)',
            plain: 'linear-gradient(#0d1420,#0a0f18)',
        };
        const preview = () => {
            const cur = doc.currency, goal = Math.max(0, +doc.goal || 0), raised = Math.max(0, +doc.raised || 0);
            const pct = goal > 0 ? Math.max(0, Math.min(100, raised / goal * 100)) : 0;
            const over = goal > 0 && raised >= goal;
            // The preview wears the same clothes as the display, or it is not a preview.
            const m = med(), pic = currentImage();
            const asBg = pic && m.imageMode !== 'banner';
            try {
                const pv = $('fc-prev');
                pv.style.backgroundImage = asBg
                    ? 'linear-gradient(rgba(5,14,26,0.72),rgba(5,14,26,0.86)), url("' + pic + '")'
                    : (PREV_THEME[m.theme] || PREV_THEME.deep);
                pv.style.backgroundSize = asBg ? 'cover' : '';
                pv.style.backgroundPosition = asBg ? 'center' : '';
            } catch (e) { }
            $('fc-prev').innerHTML = ''
                + ((pic && m.imageMode === 'banner')
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
        const touch = () => { dirty = true; };
        const sync = () => { fromForm(); preview(); donUI(); touch(); };
        toForm(); preview(); lists(); dirty = false;
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

        const publish = async () => {
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
            doc.by = user;
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
                $('fc-status').innerHTML = '<span style="color:#fca5a5;">Could not save the picture: '
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
                dirty = false;
                $('fc-status').textContent = 'Published. Anyone with the link can watch it, and it updates itself.';
                $('fc-link').innerHTML = (copied ? 'Copied to your clipboard: ' : 'The link: ')
                    + '<a href="' + esc(link) + '" target="_blank" rel="noopener" style="color:#4fd0e6;">' + esc(link) + '</a>';
                linkDialog(link, doc.title);
            } catch (e) {
                $('fc-status').innerHTML = '<span style="color:#fca5a5;">Could not publish: ' + esc(e && e.message ? e.message : e) + '</span>';
            }
            busy(false);
        };
        $('fc-publish').onclick = publish;
        $('fc-publish2').onclick = publish;
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
