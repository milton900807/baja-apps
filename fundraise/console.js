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
            story: '', hideGiftAmounts: false, gifts: [], updates: [],
            // How a visitor gives. 'checkout' asks this server for a Stripe Checkout session
            // with the amount the donor picked; 'link' opens a Payment Link made in the Stripe
            // dashboard. Which payment methods appear -- card, Apple Pay, Google Pay, Link,
            // Cash App, Klarna, bank debits -- is a Stripe dashboard setting in both cases,
            // not something this page chooses, so turning one on there turns it on here.
            donate: { on: false, mode: 'checkout', label: 'Donate', url: '', amounts: [25, 50, 100, 250], custom: true }
        };
        const don = () => (doc.donate && typeof doc.donate === 'object' ? doc.donate
            : (doc.donate = { on: false, mode: 'checkout', label: 'Donate', url: '', amounts: [], custom: true }));
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
            + '<div style="margin-left:auto;display:flex;gap:10px;">' + btn('fc-all', 'All campaigns')
            + btn('fc-open', 'Open the display') + btn('fc-publish', 'Publish', 'go') + '</div></div>'
            + '<div style="padding:22px;display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;">'
            + '<div style="flex:1 1 420px;max-width:560px;">'
            + '<label style="' + lbl + '">Campaign</label><input id="fc-title" style="' + inp + '"/>'
            + '<div id="fc-name-out" style="margin-top:5px;font:12px system-ui;min-height:15px;"></div>'
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
            + '<div style="margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.12);">'
            + '<label style="font:12.5px system-ui;color:#eaf6f9;display:flex;align-items:center;gap:8px;cursor:pointer;">'
            + '<input id="fc-don-on" type="checkbox" style="accent-color:#22c55e;"/>'
            + '<span style="font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;">Take donations</span></label>'
            + '<div id="fc-don-box" style="display:none;">'
            + '<div style="margin-top:6px;font:12.5px system-ui;color:#9fb3c8;">Payment is handled by Stripe. Which methods a donor sees '
            + '(card, Apple Pay, Google Pay, Link, Cash App, bank debits) is set on the Stripe account, not here.</div>'
            + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<div style="flex:1 1 200px;"><label style="' + lbl + '">How</label><select id="fc-don-mode" style="' + inp + '">'
            + '<option value="checkout">Stripe Checkout on this server</option>'
            + '<option value="link">A Stripe Payment Link</option></select></div>'
            + '<div style="flex:1 1 150px;"><label style="' + lbl + '">Button</label><input id="fc-don-label" style="' + inp + '"/></div>'
            + '</div>'
            + '<div id="fc-don-url-row"><label style="' + lbl + '">Payment Link</label>'
            + '<input id="fc-don-url" placeholder="https://buy.stripe.com/…" style="' + inp + '"/></div>'
            + '<label style="' + lbl + '">Suggested amounts</label>'
            + '<input id="fc-don-amts" placeholder="25, 50, 100, 250" style="' + inp + '"/>'
            + '<label style="margin-top:8px;font:12.5px system-ui;color:#9fb3c8;display:flex;align-items:center;gap:7px;cursor:pointer;">'
            + '<input id="fc-don-custom" type="checkbox" style="accent-color:#22c55e;"/> let a donor type their own amount</label>'
            + '<label style="margin-top:8px;font:12.5px system-ui;color:#9fb3c8;display:flex;align-items:center;gap:7px;cursor:pointer;">'
            + '<input id="fc-don-names" type="checkbox" style="accent-color:#22c55e;"/> publish donor names from Stripe '
            + '<span style="color:#6f93a6;">(off: they appear as Anonymous)</span></label>'
            + '<div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
            + btn('fc-pull', 'Pull donations from Stripe')
            + '<span id="fc-pull-out" style="font:12.5px system-ui;color:#cfe0f5;"></span></div>'
            + '<div id="fc-don-warn" style="margin-top:8px;font:12.5px system-ui;color:#fca5a5;"></div>'
            + '</div></div>'
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
            const dcfg = don();
            $('fc-don-on').checked = !!dcfg.on;
            $('fc-don-mode').value = dcfg.mode === 'link' ? 'link' : 'checkout';
            $('fc-don-label').value = dcfg.label || 'Donate';
            $('fc-don-url').value = dcfg.url || '';
            $('fc-don-amts').value = (Array.isArray(dcfg.amounts) ? dcfg.amounts : []).join(', ');
            $('fc-don-custom').checked = dcfg.custom !== false;
            $('fc-don-names').checked = !!dcfg.showNames;
            donUI();
        };

        // Only the fields that matter for the chosen route are on screen, and a Payment Link
        // that is not a link at all is called out before it reaches a donor.
        const donUI = () => {
            const dcfg = don();
            $('fc-don-box').style.display = dcfg.on ? '' : 'none';
            $('fc-don-url-row').style.display = (dcfg.mode === 'link') ? '' : 'none';
            let warn = '';
            if (dcfg.on && dcfg.mode === 'link') {
                const u = ('' + (dcfg.url || '')).trim();
                if (!u) warn = 'Paste the Payment Link from your Stripe dashboard, or switch to Checkout.';
                else if (!/^https:\/\//i.test(u)) warn = 'That has to be an https link.';
                else if (!/(^|\.)stripe\.com$/i.test((() => { try { return new URL(u).hostname; } catch (e) { return ''; } })()))
                    warn = 'That is not a stripe.com address. It will still be used, but check it is the right one.';
            }
            if (dcfg.on && dcfg.mode === 'checkout' && !(Array.isArray(dcfg.amounts) && dcfg.amounts.length) && dcfg.custom === false)
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
            dcfg.mode = $('fc-don-mode').value === 'link' ? 'link' : 'checkout';
            dcfg.label = ('' + $('fc-don-label').value).trim() || 'Donate';
            dcfg.url = ('' + $('fc-don-url').value).trim();
            dcfg.custom = !!$('fc-don-custom').checked;
            // The campaign document is fetched whole by the public display, so a name stored
            // here is a name on a wall. Off by default: a donor gave it to Stripe to pay.
            dcfg.showNames = !!$('fc-don-names').checked;
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
                        + '</span></div>' : '')
                + (don().on ? '<div style="margin-top:10px;"><span style="display:inline-block;background:#22c55e;color:#04210f;'
                    + 'border-radius:999px;padding:8px 20px;font:800 13px system-ui;">' + esc(don().label || 'Donate') + '</span></div>' : '');
        };
        const sync = () => { fromForm(); preview(); donUI(); };
        toForm(); preview(); lists();
        for (const id of ['fc-title', 'fc-sub', 'fc-raised', 'fc-goal', 'fc-donors', 'fc-note', 'fc-story',
            'fc-don-label', 'fc-don-url', 'fc-don-amts']) $(id).addEventListener('input', sync);
        for (const id of ['fc-don-on', 'fc-don-mode', 'fc-don-custom', 'fc-don-names']) $(id).addEventListener('change', sync);

        // WHAT STRIPE HAS BEEN PAID, folded into the campaign. The display does this by
        // itself every few seconds; the button is for the organiser standing at the laptop
        // who wants to know NOW, and for a campaign nobody has open on a screen.
        $('fc-pull').onclick = async () => {
            const out = $('fc-pull-out');
            if (!docPath) { out.textContent = 'Publish the campaign first.'; return; }
            $('fc-pull').disabled = true; out.textContent = 'Asking Stripe…';
            try {
                const r = await POSTJSON({ path: docPath }, host + '/stripe/donation-sync');
                if (r && r.error) throw new Error(r.error_description || r.error);
                if (r && r.skipped === 'cooldown') out.textContent = 'Just checked a moment ago; try again shortly.';
                else if (r && r.added) {
                    // The server wrote the gifts into the stored document, so the form has to
                    // be re-read from it rather than guessing at what changed.
                    const rs = await POSTJSON({ path: docPath, key: 'user', user: user }, host + '/load-file');
                    let d = rs;
                    if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
                    if (d && typeof d === 'object' && (d.kind === 'fundraise' || d.goal != null)) { doc = Object.assign(doc, d); toForm(); preview(); lists(); }
                    out.textContent = 'Added ' + r.added + ' donation' + (r.added === 1 ? '' : 's')
                        + ' (' + money(r.amount || 0, doc.currency) + ').';
                } else out.textContent = 'Nothing new from Stripe.';
            } catch (e) {
                out.textContent = 'Could not reach Stripe: ' + ((e && e.message) ? e.message : e);
            }
            $('fc-pull').disabled = false;
        };
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
            } else out.innerHTML = '<span style="color:#6f93a6;">That name is free.</span>';
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
            if (!user) { $('fc-status').textContent = 'Sign in to publish a campaign.'; return; }
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
                linkDialog(link, doc.title);
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
        $('fc-all').onclick = async () => {
            try { clear(); } catch (e) { }
            try { window.history.pushState({}, '', '/app/fundraise/admin'); } catch (e) { }
            await exec('fundraise/admin');
        };
        loadKnown().then(() => { if (!docPath) checkName(); });
        try { $('fc-title').focus(); } catch (e) { }
        return true;
    })();
}
