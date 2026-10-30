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
            story: '', hideGiftAmounts: false, gifts: [], updates: []
        };
        // Both lists are newest first, and capped: a document that grows without a bound is
        // one the display eventually cannot load.
        const CAP = 200;
        const arr = (k) => (Array.isArray(doc[k]) ? doc[k] : (doc[k] = []));
        let docPath = '' + (qp('path') || (config && config.path) || path || '');
        let fileName = '';
        let publicLink = '';

        if (docPath) {
            try {
                const rs = await POSTJSON({ path: docPath, key: 'user', user: user }, host + '/load-file');
                let d = rs;
                if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
                if (d && typeof d === 'object' && (d.kind === 'fundraise' || d.goal != null)) doc = Object.assign(doc, d);
                fileName = docPath.substring(docPath.lastIndexOf('/') + 1);
            } catch (e) { }
        }

        // ---- the screen --------------------------------------------------------------------
        try { const old = document.getElementById('baja-fundraise-console'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const wrap = document.createElement('div');
        wrap.id = 'baja-fundraise-console';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;background:#071a30;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
        const lbl = 'display:block;font:600 12px system-ui;color:#9fb3c8;margin:14px 0 5px;';
        const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);'
            + 'border-radius:8px;padding:9px 11px;font:14px system-ui;';
        const btn = (id, label, kind) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px system-ui;'
            + (kind === 'go' ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';

        wrap.innerHTML = ''
            + '<div style="display:flex;align-items:center;gap:16px;padding:16px 22px 14px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div><div style="font:700 20px system-ui;">Fundraising</div>'
            + '<div style="font:12.5px system-ui;color:#9fb3c8;margin-top:3px;">Enter the total raised, then publish a display anyone can open.</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;">' + btn('fc-open', 'Open the display') + btn('fc-publish', 'Publish', 'go') + '</div></div>'
            + '<div style="padding:22px;display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;">'
            + '<div style="flex:1 1 420px;max-width:560px;">'
            + '<label style="' + lbl + '">Campaign</label><input id="fc-title" style="' + inp + '"/>'
            + '<label style="' + lbl + '">A line under it (optional)</label><input id="fc-sub" style="' + inp + '"/>'
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<div style="flex:1 1 120px;"><label style="' + lbl + '">Currency</label><select id="fc-cur" style="' + inp + '">'
            + CUR.map((c) => '<option value="' + c + '">' + c + '</option>').join('') + '</select></div>'
            + '<div style="flex:2 1 180px;"><label style="' + lbl + '">Raised so far</label><input id="fc-raised" inputmode="decimal" style="' + inp + '"/></div>'
            + '<div style="flex:2 1 180px;"><label style="' + lbl + '">Goal</label><input id="fc-goal" inputmode="decimal" style="' + inp + '"/></div>'
            + '</div>'
            + '<label style="' + lbl + '">Add a gift</label>'
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
            + '<label style="' + lbl + '">About this campaign</label>'
            + '<textarea id="fc-story" rows="5" placeholder="What the money is for. Blank lines start new paragraphs." style="' + inp + 'resize:vertical;"></textarea>'
            + '<label style="' + lbl + '">Post an update</label>'
            + '<input id="fc-upd-title" placeholder="headline (optional)" style="' + inp + '"/>'
            + '<textarea id="fc-upd" rows="3" placeholder="We passed halfway at 9pm…" style="' + inp + 'resize:vertical;margin-top:8px;"></textarea>'
            + '<div style="margin-top:8px;">' + btn('fc-post', 'Post update') + '</div>'
            + '<div id="fc-updates" style="margin-top:10px;"></div>'
            + '<div id="fc-status" style="margin-top:14px;font:12.5px system-ui;color:#cfe0f5;min-height:18px;"></div>'
            + '<div id="fc-link" style="margin-top:6px;font:12.5px system-ui;word-break:break-all;"></div>'
            + '</div>'
            + '<div style="flex:1 1 380px;min-width:300px;">'
            + '<div style="font:600 12px system-ui;color:#9fb3c8;margin:14px 0 5px;">What the display shows</div>'
            + '<div id="fc-prev" style="border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:22px 18px;text-align:center;'
            + 'background:radial-gradient(600px 300px at 50% -20%,#123a63 0%,#0a1e3a 60%,#071526 100%);"></div>'
            + '<div style="margin-top:10px;font:11.5px system-ui;color:#6f93a6;">The published display re-reads the campaign every few seconds, '
            + 'so raising the total here moves it on screen without anyone reloading the page.</div>'
            + '</div></div>';
        document.body.appendChild(wrap);
        // The editor shell listens for these on the document; a form must keep its own.
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) wrap.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        const $ = (id) => document.getElementById(id);

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
                        arr('gifts').splice(i, 1);
                    } else arr('updates').splice(i, 1);
                    preview(); lists();
                    $('fc-status').textContent = 'Removed. Publish to put that on the display.';
                };
            }
        };
        const preview = () => {
            const cur = doc.currency, goal = Math.max(0, +doc.goal || 0), raised = Math.max(0, +doc.raised || 0);
            const pct = goal > 0 ? Math.max(0, Math.min(100, raised / goal * 100)) : 0;
            const over = goal > 0 && raised >= goal;
            $('fc-prev').innerHTML = ''
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
                + ((doc.story || arr('gifts').length || arr('updates').length)
                    ? '<div style="margin-top:14px;"><span style="display:inline-block;border:1px solid rgba(255,255,255,0.28);'
                        + 'background:rgba(255,255,255,0.06);border-radius:999px;padding:6px 14px;font:600 12px system-ui;">Campaign details'
                        + (arr('updates').length ? ' · ' + arr('updates').length + ' update' + (arr('updates').length === 1 ? '' : 's') : '')
                        + '</span></div>' : '');
        };
        const sync = () => { fromForm(); preview(); };
        toForm(); preview(); lists();
        for (const id of ['fc-title', 'fc-sub', 'fc-raised', 'fc-goal', 'fc-donors', 'fc-note', 'fc-story']) $(id).addEventListener('input', sync);
        $('fc-cur').addEventListener('change', () => { sync(); lists(); });
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
            toForm(); preview(); lists();
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
            preview(); lists();
            $('fc-status').textContent = 'Update written. Publish to put it on the details page.';
        };

        const publish = async () => {
            sync();
            if (!user) { $('fc-status').textContent = 'Sign in to publish a campaign.'; return; }
            if (!doc.title) { $('fc-status').textContent = 'Give the campaign a name first.'; return; }
            const b = $('fc-publish');
            b.disabled = true; $('fc-status').textContent = 'Publishing…';
            doc.updated = new Date().toISOString();
            doc.by = user;
            if (!fileName) fileName = slug(doc.title) + '.fund';
            try {
                const rs = await POSTJSON({ name: fileName, key: 'user', user: user, spath: 'public', value: JSON.stringify(doc) },
                    host + '/save-user-data');
                if (!rs || !(rs.status === 'saved' || rs.path)) throw new Error((rs && (rs.status || rs.error)) || 'the campaign could not be saved');
                // Marks the folder public, the same marker a shared genome writes.
                try { await POSTJSON({ name: '.share', key: 'user', user: user, spath: 'public', value: 'public\n/public' }, host + '/save-user-data'); } catch (e) { }
                docPath = ('' + (rs.path || '')).replace(/\/{2,}/g, '/');
                let link = window.location.origin + '/app/manchester/viewer-fundraise?path=' + encodeURIComponent(docPath);
                // A short code keeps the owner's email out of the address bar on a screen in a
                // room; /s/<code> itself lands on the genome viewer, so the display link names
                // this route and passes the code to it.
                try {
                    const al = await POSTJSON({ path: docPath }, host + '/share-alias');
                    if (al && al.code) link = window.location.origin + '/app/manchester/viewer-fundraise?s=' + encodeURIComponent(al.code);
                } catch (e) { }
                publicLink = link;
                let copied = false;
                try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); copied = true; } } catch (e) { }
                $('fc-status').textContent = 'Published. Anyone with the link can watch it, and it updates itself.';
                $('fc-link').innerHTML = (copied ? 'Copied to your clipboard: ' : 'The link: ')
                    + '<a href="' + esc(link) + '" target="_blank" rel="noopener" style="color:#4fd0e6;">' + esc(link) + '</a>';
            } catch (e) {
                $('fc-status').innerHTML = '<span style="color:#fca5a5;">Could not publish: ' + esc(e && e.message ? e.message : e) + '</span>';
            }
            b.disabled = false;
        };
        $('fc-publish').onclick = publish;
        $('fc-open').onclick = () => {
            if (!publicLink) { $('fc-status').textContent = 'Publish it first, then the display has something to read.'; return; }
            try { window.open(publicLink, '_blank', 'noopener'); } catch (e) { }
        };
        try { $('fc-title').focus(); } catch (e) { }
        return true;
    })();
}
