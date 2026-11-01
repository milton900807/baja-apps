function (pt) {

    // BUILD > "ADD TO A FUNDRAISING CAMPAIGN", from a Baja Project workbook.
    //
    //   exec('fundraise/plan-send.js', pm.plateTrack)
    //
    // Reads the program plan out of the workbook (fundraise/plan-from-workbook.js), asks
    // which campaign it is for -- one of this account's, or a new one -- and opens that
    // campaign's console with the plan attached, ready to look over and publish.
    //
    // THE WORKBOOK STAYS OPEN. The console opens in a new tab and the plan travels through
    // this browser's localStorage, keyed by the account and picked up once: clearing this
    // page to open the console would throw away a model somebody may not have saved. Only
    // when the browser refuses the new tab does the console open here instead, with the plan
    // handed to it directly.
    //
    // Nothing is published from here. The plan lands in the console as an unpublished
    // change, and the campaign's own Publish puts it on the display.
    return (async () => {
        const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const user = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();
        const say = (t, n) => { try { pt && pt.setMessage && pt.setMessage(t, n || 4); } catch (e) { } };
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

        if (!user) { say('Sign in to add this plan to a campaign.'); return null; }
        let plan = null;
        try { plan = await exec('fundraise/plan-from-workbook.js', pt); } catch (e) { plan = null; }
        if (!plan || !plan.phases || !plan.phases.length) {
            say('There is no plan here to send yet. Build > Tx discovery & development makes the '
                + 'budget and timeline a campaign can show.', 6);
            return null;
        }

        let campaigns = [];
        try {
            const r = await POSTJSON({ user: user }, host + '/fundraise/campaigns');
            campaigns = (r && Array.isArray(r.campaigns)) ? r.campaigns.filter((c) => c && c.path && c.file) : [];
        } catch (e) { campaigns = []; }

        let PV = null;
        try { PV = await exec('fundraise/plan-view.js'); } catch (e) { PV = null; }
        const money = (v) => (PV ? PV.money(v, plan.currency, true) : ('$' + Math.round(v).toLocaleString()));
        const month = (t) => { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); } catch (e) { return ''; } };

        // ---- which campaign ------------------------------------------------------------
        try { const old = document.getElementById('baja-plan-send'); if (old) old.remove(); } catch (e) { }
        const back = document.createElement('div');
        back.id = 'baja-plan-send';
        back.style.cssText = 'position:fixed;inset:0;z-index:2147483300;background:rgba(4,12,24,0.55);display:flex;'
            + 'align-items:center;justify-content:center;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;';
        const btnCss = 'display:block;width:100%;text-align:left;cursor:pointer;border:1px solid rgba(255,255,255,0.14);'
            + 'background:rgba(255,255,255,0.04);color:#eaf6f9;border-radius:9px;padding:10px 12px;margin-top:7px;font:600 13.5px system-ui;';
        back.innerHTML = '<div style="width:min(460px,92vw);max-height:86vh;overflow:auto;background:#0b2545;color:#eaf6f9;'
            + 'border:1px solid rgba(255,255,255,0.16);border-radius:14px;padding:18px 18px 16px;box-shadow:0 24px 60px rgba(0,0,0,0.5);">'
            + '<div style="font:700 16px system-ui;">Add this plan to a campaign</div>'
            + '<div style="margin-top:6px;font:13px/1.55 system-ui;color:#9fc4d4;">'
            + (plan.name ? '<b style="color:#eaf6f9;">' + esc(plan.name) + '</b><br>' : '')
            + esc(plan.phases.length + ' stages, ' + month(plan.start) + ' to ' + month(plan.end))
            + (plan.total ? ', ' + esc(money(plan.total)) + ' in total' : '') + '.'
            + '<br>It goes on the campaign’s details page as a timeline and a budget. '
            + 'Nothing is published until you publish the campaign.</div>'
            + (campaigns.length ? '<div style="margin-top:14px;font:600 11px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#7fb0c4;">Your campaigns</div>'
                + campaigns.map((c, i) => '<button data-i="' + i + '" style="' + btnCss + '">' + esc(c.title || c.file) + '</button>').join('') : '')
            + '<button data-new="1" style="' + btnCss + 'border-color:#22c55e;color:#bbf7d0;margin-top:' + (campaigns.length ? '12px' : '14px') + ';">'
            + '+ Start a new campaign with this plan</button>'
            + '<div style="margin-top:14px;text-align:right;"><button data-cancel="1" style="cursor:pointer;border:1px solid rgba(255,255,255,0.22);'
            + 'background:transparent;color:#fff;border-radius:8px;padding:8px 14px;font:700 12.5px system-ui;">Cancel</button></div>'
            + '</div>';
        document.body.appendChild(back);

        const close = () => { try { back.remove(); } catch (e) { } document.removeEventListener('keydown', onKey, true); };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        for (const ev of ['mousedown', 'mouseup', 'wheel', 'touchstart']) back.addEventListener(ev, (e) => e.stopPropagation());

        const send = (c) => {
            close();
            const target = c ? c.file : '';
            try {
                localStorage.setItem('baja.fundraise.plan|' + user,
                    JSON.stringify({ at: Date.now(), file: target, plan: plan }));
            } catch (e) { }
            const url = '/app/fundraise/console' + (target ? ('?c=' + encodeURIComponent(target)) : '');
            let w = null;
            try { w = window.open(url, '_blank'); } catch (e) { w = null; }
            if (w) { say('The campaign opened in a new tab with the plan attached. Publish it there.', 6); return; }
            // No new tab allowed: open it here, and hand the plan over directly.
            try { localStorage.removeItem('baja.fundraise.plan|' + user); } catch (e) { }
            (async () => {
                try { clear(); } catch (e) { }
                try { window.history.pushState({}, '', url); } catch (e) { }
                await exec('fundraise/console', '', c ? { path: c.path, plan: plan } : { plan: plan });
            })();
        };
        back.addEventListener('click', (e) => {
            if (e.target === back) { close(); return; }
            const b = e.target && e.target.closest ? e.target.closest('button') : null;
            if (!b) return;
            if (b.hasAttribute('data-cancel')) { close(); return; }
            if (b.hasAttribute('data-new')) { send(null); return; }
            if (b.hasAttribute('data-i')) send(campaigns[+b.getAttribute('data-i')]);
        });
        return plan;
    })();
}
