function (path, config) {

    // THE PUBLIC FUNDRAISING DISPLAY: a campaign's total, its goal and a thermometer, big
    // enough to project, open to anyone with the link and no sign-in.
    //
    //   /app/manchester/viewer-fundraise?s=<share code>
    //   /app/manchester/viewer-fundraise?path=<public path>
    //
    // WHY THE NAME BEGINS "viewer". The app shell lets exactly two route shapes through
    // without a sign-in, and a URL containing /manchester/viewer is one of them (see the
    // guard in baja/src/app/auth/auth.guard.ts). A display nobody can open without an account
    // is not a public display, and renaming this route means editing and redeploying the
    // shell; the route name is the cheap half of that bargain.
    //
    // The document is written by fundraise/console.js into the owner's public folder and read
    // here through /load-file as `public`, which is the same path a shared genome takes.
    //
    //   { kind: 'fundraise', title, subtitle, currency, goal, raised, donors, note,
    //     updated, by, story, gifts: [{ amount, name, note, at }], updates: [{ at, text }] }
    //
    // TWO LEVELS. The first is the number, which is what a screen in a room is for and which
    // has to stay readable from the back of it. Everything that wants reading up close --
    // what the money is for, who has given, what has happened since -- is one button away on
    // a details page, so that the display itself never fills up with text nobody can read
    // from a distance. The details page is READ-ONLY, because this route is open without a
    // sign-in: the organiser adds gifts and posts updates in the console, and this page sees
    // them on its next read, within seconds.
    //
    // IT REFRESHES ITSELF. The display is meant to be left on a screen while the number
    // changes, so it re-reads the document every few seconds and animates to the new total
    // rather than needing someone to reload it. ?refresh=<seconds> tunes that; ?refresh=0
    // turns it off.
    return (async () => {
        const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const qp = (k) => { try { return new URL(window.location.href).searchParams.get(k); } catch (e) { return null; } };

        let every = 10;
        const rq = qp('refresh');
        if (rq != null && rq !== '') { const v = parseFloat(rq); if (isFinite(v)) every = Math.max(0, Math.min(3600, v)); }

        // Where the document lives: a share code first, so the owner's email -- which is part
        // of the stored path -- never appears in the address bar of a screen in a room.
        let docPath = '';
        const code = qp('s') || qp('share') || '';
        if (code) {
            try {
                const r = await GETJSON(host + '/share-resolve?code=' + encodeURIComponent(code));
                if (r && r.path) docPath = '' + r.path;
            } catch (e) { }
        }
        if (!docPath) docPath = '' + (qp('path') || (config && config.path) || path || '');

        // ---- the screen ------------------------------------------------------------------
        try { const old = document.getElementById('baja-fundraise-display'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const el = document.createElement('div');
        el.id = 'baja-fundraise-display';
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;'
            + 'background:radial-gradient(1200px 700px at 50% -10%,#123a63 0%,#0a1e3a 55%,#071526 100%);'
            + 'color:#eaf6f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;'
            + 'display:flex;align-items:center;justify-content:center;padding:4vmin;box-sizing:border-box;';
        el.innerHTML = '<div id="fd-card" style="width:min(1100px,96vw);text-align:center;">'
            + '<div id="fd-state" style="font:500 15px system-ui;color:#9fc4d4;">Loading…</div></div>';
        document.body.appendChild(el);
        if (!document.getElementById('fd-kf')) {
            const st = document.createElement('style');
            st.id = 'fd-kf';
            st.textContent = '@keyframes fdPulse{0%{opacity:.35}50%{opacity:1}100%{opacity:.35}}'
                + '@keyframes fdPop{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}';
            document.head.appendChild(st);
        }
        const card = () => document.getElementById('fd-card');

        const money = (n, cur) => {
            const v = (+n || 0);
            try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: (v % 1 ? 2 : 0) }).format(v); }
            catch (e) { return (cur || '$') + v.toLocaleString(); }
        };
        const fail = (msg) => {
            card().innerHTML = '<div style="font:700 clamp(20px,3.4vmin,34px) system-ui;margin-bottom:10px;">Nothing to show here yet</div>'
                + '<div style="font:400 clamp(13px,1.8vmin,17px) system-ui;color:#9fc4d4;max-width:48ch;margin:0 auto;">' + esc(msg) + '</div>';
        };

        // The number counts UP to its new value rather than jumping: on a screen people are
        // watching, the movement is the point.
        let shownRaised = null, lastStamp = '';
        const animateTo = (fromV, toV, cur, draw) => {
            const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
            const ms = Math.min(1400, 300 + Math.abs(toV - fromV) * 2);
            const step = () => {
                const now = (window.performance && performance.now) ? performance.now() : Date.now();
                const k = Math.max(0, Math.min(1, (now - t0) / ms));
                const e = 1 - Math.pow(1 - k, 3);
                draw(fromV + (toV - fromV) * e);
                if (k < 1) requestAnimationFrame(step);
            };
            step();
        };

        // "3 minutes ago" for anything recent, a real date once it is old: a donation that
        // landed during the event reads as news, one from last week reads as history.
        const ago = (iso) => {
            const t = iso ? new Date(iso) : null;
            if (!t || isNaN(+t)) return '';
            const secs = Math.round((Date.now() - t.getTime()) / 1000);
            if (secs < 45) return 'just now';
            if (secs < 5400) { const m = Math.round(secs / 60); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
            if (secs < 86400) { const h = Math.round(secs / 3600); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
            if (secs < 6 * 86400) { const dd = Math.round(secs / 86400); return dd + (dd === 1 ? ' day ago' : ' days ago'); }
            return t.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        };
        const listOf = (d, k) => (Array.isArray(d && d[k]) ? d[k] : []).filter((x) => x && typeof x === 'object');
        const hasDetail = (d) => !!(('' + ((d && d.story) || '')).trim() || listOf(d, 'gifts').length || listOf(d, 'updates').length);
        // Paragraphs, not a block of run-on text, and still escaped: everything here was typed
        // by the organiser but arrives through a document anyone could in principle write to.
        const paras = (t) => ('' + (t || '')).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
            .map((x) => '<p style="margin:0 0 12px;">' + esc(x).replace(/\n/g, '<br>') + '</p>').join('');

        let view = 'main', lastDoc = null;
        const go = (v) => {
            view = v;
            try { el.style.alignItems = (v === 'detail') ? 'flex-start' : 'center'; } catch (e) { }
            if (lastDoc) draw(lastDoc, false, true);
            if (v === 'detail') { try { el.scrollTop = 0; } catch (e) { } }
        };

        const renderDetail = (d) => {
            const cur = d.currency || 'USD';
            const goal = Math.max(0, +d.goal || 0), raised = Math.max(0, +d.raised || 0);
            const pct = goal > 0 ? Math.max(0, Math.min(100, (raised / goal) * 100)) : 0;
            const gifts = listOf(d, 'gifts'), updates = listOf(d, 'updates');
            // One line of context under the amount, joined by one separator: two spans each
            // carrying their own "·" left a gap with a dot floating in it.
            const meta = [];
            if (goal > 0) meta.push('of ' + esc(money(goal, cur)) + ' · ' + pct.toFixed(pct < 10 ? 1 : 0) + '%');
            if (d.donors) meta.push(esc((+d.donors).toLocaleString()) + ' ' + (Math.abs(+d.donors) === 1 ? 'donor' : 'donors'));
            const sect = (t) => '<div style="font:700 12px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;'
                + 'margin:26px 0 10px;">' + esc(t) + '</div>';
            const money_ = (v) => esc(money(v, cur));

            card().innerHTML = '<div style="text-align:left;max-width:820px;margin:0 auto;padding:2vmin 0 6vmin;">'
                + '<button id="fd-back" style="cursor:pointer;border:1px solid rgba(255,255,255,0.22);background:transparent;'
                + 'color:#cfe6ef;border-radius:999px;padding:7px 15px;font:600 12.5px system-ui;">← Back to the total</button>'
                + '<div style="margin-top:18px;font:800 clamp(22px,3.4vmin,36px) system-ui;letter-spacing:-0.02em;">' + esc(d.title || 'Campaign') + '</div>'
                + (d.subtitle ? '<div style="margin-top:4px;font:400 15px system-ui;color:#9fc4d4;">' + esc(d.subtitle) + '</div>' : '')
                + '<div style="margin-top:16px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">'
                + '<span style="font:800 30px system-ui;letter-spacing:-0.02em;">' + money_(raised) + '</span>'
                + (meta.length ? '<span style="font:500 14px system-ui;color:#9fc4d4;">' + meta.join(' · ') + '</span>' : '')
                + '</div>'
                + (goal > 0 ? '<div style="margin-top:12px;height:10px;border-radius:999px;background:rgba(255,255,255,0.10);'
                    + 'border:1px solid rgba(255,255,255,0.16);overflow:hidden;"><div style="height:100%;width:' + pct.toFixed(2) + '%;'
                    + 'background:linear-gradient(90deg,#1aa3bd,#22c55e);transition:width .9s cubic-bezier(.22,.9,.26,1);"></div></div>' : '')

                + (('' + (d.story || '')).trim() ? sect('About this campaign')
                    + '<div style="font:400 15.5px/1.6 system-ui;color:#dceef5;">' + paras(d.story) + '</div>' : '')

                + (updates.length ? sect('Updates') + updates.map((u) => ''
                    + '<div style="border-left:2px solid rgba(79,208,230,0.5);padding:2px 0 2px 14px;margin:0 0 18px;">'
                    + '<div style="font:600 12px system-ui;color:#7fb0c4;">' + esc(ago(u.at)) + '</div>'
                    + (u.title ? '<div style="margin-top:3px;font:700 15px system-ui;">' + esc(u.title) + '</div>' : '')
                    + '<div style="margin-top:5px;font:400 15px/1.55 system-ui;color:#dceef5;">' + paras(u.text) + '</div>'
                    + '</div>').join('') : '')

                + (gifts.length ? sect('Recent donations') + '<div>' + gifts.map((g) => ''
                    + '<div style="display:flex;gap:12px;align-items:baseline;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.08);">'
                    + '<div style="flex:1 1 auto;min-width:0;">'
                    + '<div style="font:600 14.5px system-ui;">' + esc(('' + (g.name || '')).trim() || 'Anonymous') + '</div>'
                    + (g.note ? '<div style="margin-top:2px;font:400 13px system-ui;color:#bcd9e4;">' + esc(g.note) + '</div>' : '')
                    + '</div>'
                    + '<div style="text-align:right;white-space:nowrap;">'
                    + (d.hideGiftAmounts ? '' : '<div style="font:700 14.5px system-ui;color:#86efac;">' + money_(+g.amount || 0) + '</div>')
                    + '<div style="font:400 11.5px system-ui;color:#7fb0c4;">' + esc(ago(g.at)) + '</div></div>'
                    + '</div>').join('') + '</div>' : '')

                + '<div style="margin-top:28px;font:400 12.5px system-ui;color:#6f93a6;">'
                + (d.updated ? 'Updated ' + esc(ago(d.updated)) : '') + (d.by ? (d.updated ? ' · ' : '') + esc(d.by) : '')
                + (every ? '<span style="margin-left:10px;animation:fdPulse 2.4s ease-in-out infinite;">live</span>' : '')
                + '</div></div>';
            const b = document.getElementById('fd-back');
            if (b) b.onclick = () => go('main');
        };

        const renderMain = (d, firstTime) => {
            const cur = d.currency || 'USD';
            const goal = Math.max(0, +d.goal || 0);
            const raised = Math.max(0, +d.raised || 0);
            const pct = goal > 0 ? Math.max(0, Math.min(100, (raised / goal) * 100)) : 0;
            const over = goal > 0 && raised >= goal;
            const upd = d.updated ? new Date(d.updated) : null;
            const when = upd && !isNaN(+upd) ? upd.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
            card().innerHTML = ''
                + (d.title ? '<div style="font:800 clamp(24px,5vmin,56px) system-ui;letter-spacing:-0.02em;">' + esc(d.title) + '</div>' : '')
                + (d.subtitle ? '<div style="margin-top:6px;font:400 clamp(14px,2.2vmin,22px) system-ui;color:#9fc4d4;">' + esc(d.subtitle) + '</div>' : '')
                + '<div id="fd-amount" style="margin:clamp(14px,3vmin,34px) 0 6px;font:800 clamp(40px,12vmin,140px) system-ui;letter-spacing:-0.03em;'
                + 'color:' + (over ? '#86efac' : '#ffffff') + ';line-height:1;">' + esc(money(raised, cur)) + '</div>'
                + (goal > 0 ? '<div style="font:500 clamp(13px,2vmin,20px) system-ui;color:#9fc4d4;">raised of ' + esc(money(goal, cur)) + ' goal</div>' : '')
                + (goal > 0 ? ('<div style="margin:clamp(14px,3vmin,30px) auto 0;max-width:900px;">'
                    + '<div style="height:clamp(16px,3vmin,30px);border-radius:999px;background:rgba(255,255,255,0.10);'
                    + 'border:1px solid rgba(255,255,255,0.16);overflow:hidden;">'
                    + '<div id="fd-bar" style="height:100%;width:' + pct.toFixed(2) + '%;border-radius:999px;'
                    + 'background:linear-gradient(90deg,#1aa3bd,#22c55e);transition:width .9s cubic-bezier(.22,.9,.26,1);"></div></div>'
                    + '<div id="fd-pct" style="margin-top:8px;font:700 clamp(14px,2.2vmin,22px) system-ui;color:' + (over ? '#86efac' : '#bfe6f0') + ';">'
                    + pct.toFixed(pct < 10 ? 1 : 0) + '%' + (over ? ' — goal reached' : '') + '</div></div>') : '')
                + (d.donors ? '<div style="margin-top:clamp(10px,2vmin,20px);font:500 clamp(13px,1.9vmin,19px) system-ui;color:#9fc4d4;">'
                    + esc((+d.donors).toLocaleString()) + ' ' + (Math.abs(+d.donors) === 1 ? 'donor' : 'donors') + '</div>' : '')
                + (d.note ? '<div style="margin-top:clamp(12px,2.4vmin,24px);font:400 clamp(13px,1.9vmin,19px) system-ui;color:#cfe6ef;max-width:60ch;margin-left:auto;margin-right:auto;">' + esc(d.note) + '</div>' : '')
                + '<div style="margin-top:clamp(16px,3vmin,30px);font:400 12.5px system-ui;color:#6f93a6;">'
                + (when ? 'Updated ' + esc(when) : '') + (d.by ? (when ? ' · ' : '') + esc(d.by) : '')
                + (every ? '<span id="fd-live" style="margin-left:10px;animation:fdPulse 2.4s ease-in-out infinite;">live</span>' : '')
                + '</div>'
                + (hasDetail(d) ? '<div style="margin-top:clamp(12px,2.4vmin,22px);">'
                    + '<button id="fd-more" style="cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.06);'
                    + 'color:#eaf6f9;border-radius:999px;padding:9px 20px;font:600 clamp(12px,1.6vmin,15px) system-ui;">'
                    + 'Campaign details' + (listOf(d, 'updates').length ? ' · ' + listOf(d, 'updates').length + ' update'
                        + (listOf(d, 'updates').length === 1 ? '' : 's') : '') + '</button></div>' : '')
                + '</div>';
            const more = document.getElementById('fd-more');
            if (more) more.onclick = () => go('detail');
            const amt = document.getElementById('fd-amount');
            if (!firstTime && shownRaised != null && shownRaised !== raised && amt) {
                amt.style.animation = 'fdPop .5s ease';
                animateTo(shownRaised, raised, cur, (v) => { amt.textContent = money(Math.round(v), cur); });
            }
            shownRaised = raised;
        };

        // One entry point for both views, so a refresh that arrives while the details page is
        // open redraws THAT page rather than throwing the reader back to the total.
        const draw = (d, firstTime, keepView) => {
            lastDoc = d;
            if (view === 'detail' && hasDetail(d)) { renderDetail(d); return; }
            if (view === 'detail') view = 'main';
            renderMain(d, firstTime && !keepView);
        };

        const load = async (firstTime) => {
            if (!docPath) { fail('This display has no campaign link. Open it from the fundraising console, or use the link the organiser sent you.'); return; }
            let rs = null;
            try { rs = await POSTJSON({ path: docPath, user: 'public' }, host + '/load-file'); } catch (e) { rs = null; }
            // A share pointer is followed, exactly as the genome viewer follows one.
            if (rs && rs.shared_from) {
                try { rs = await POSTJSON({ path: ('' + rs.shared_from).startsWith('/') ? rs.shared_from : ('/' + rs.shared_from), user: 'public' }, host + '/load-file'); } catch (e) { }
            }
            let d = rs;
            if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            if (!d || typeof d !== 'object' || (d.kind && d.kind !== 'fundraise')) {
                if (firstTime) fail('That link does not point at a fundraising campaign, or it has been taken down.');
                return;
            }
            const stamp = JSON.stringify([d.title, d.subtitle, d.goal, d.raised, d.donors, d.note, d.updated,
                d.story, d.hideGiftAmounts, d.gifts, d.updates]);
            if (stamp !== lastStamp) { lastStamp = stamp; draw(d, firstTime); }
        };

        try {
            document.addEventListener('keydown', (e) => {
                if (e && e.key === 'Escape' && view === 'detail') { try { e.stopPropagation(); } catch (e2) { } go('main'); }
            }, true);
        } catch (e) { }

        await load(true);
        if (every > 0) setInterval(() => { load(false); }, every * 1000);
        // Nothing else belongs on this screen: no toolbar, no menus, no graph.
        try { document.title = 'Fundraising'; } catch (e) { }
        return true;
    })();
}
