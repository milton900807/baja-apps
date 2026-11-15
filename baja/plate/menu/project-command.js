function (o) {

    // A SENTENCE TYPED INTO THE PROJECT'S COMMAND FIELD.
    //
    // The field has always taken a plate formula, and it still does: anything that looks
    // like one goes straight to the formula engine untouched (navigation-panel-plates2.js
    // decides). This is the other path. A sentence is matched against the app's OWN MENUS,
    // and the item that carries it out is offered, with one press to run it.
    //
    // THE CATALOGUE IS THE LIVE MENUBAR, not a list kept here. The project's menus are
    // rebuilt for whatever is selected, so the things that can be named are exactly the
    // things on screen at that moment, and a menu item added anywhere becomes reachable by
    // sentence without this file knowing about it.
    //
    // NOTHING RUNS UNTIL IT IS PRESSED. The model returns an INDEX into the list it was
    // given, never a path or a function, and an index outside the list is dropped rather
    // than nudged into range: running the neighbouring menu item and calling it the answer
    // is worse than saying nothing matched.

    const menus = (o && o.menus) || [];
    const text = ('' + ((o && o.text) || '')).trim();
    const context = (o && o.context) || null;
    const onDone = (o && o.onDone) || null;

    const H = (s) => ('' + (s == null ? '' : s)).replace(/[&<>"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---- the menubar, flattened ------------------------------------------------------
    //
    // A row with an `items` array is a menu and is walked into. A row marked header, or one
    // with nothing behind it, is a caption: it is NOT an action and is left out, so the
    // model cannot pick something that would do nothing when pressed.
    const flatten = () => {
        const out = [];
        const walk = (list, prefix, depth) => {
            if (!Array.isArray(list) || depth > 4) return;
            for (const m of list) {
                if (!m) continue;
                const label = ('' + (m.label || m.tooltip || '')).trim();
                if (Array.isArray(m.items)) {
                    walk(m.items, prefix ? (prefix + ' > ' + label) : label, depth + 1);
                    continue;
                }
                if (m.header || !label) continue;
                const act = m.ionFunction || m.click;
                if (!act) continue;
                const path = prefix ? (prefix + ' > ' + label) : label;
                const row = { i: out.length, path: path, __m: m };
                const tip = ('' + (m.tooltip || '')).trim();
                if (tip && tip.toLowerCase() !== label.toLowerCase()) row.tooltip = tip;
                out.push(row);
            }
        };
        walk(menus, '', 0);
        return out;
    };

    const actions = flatten();

    // ---- the panel -------------------------------------------------------------------
    const ID = 'baja-project-command';
    try { const old = document.getElementById(ID); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

    const panel = document.createElement('div');
    panel.id = ID;
    panel.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);'
        + 'width:min(680px,92vw);z-index:100060;border-radius:12px;'
        + 'background:#0b1726;border:1px solid rgba(255,255,255,0.14);'
        + 'box-shadow:0 18px 50px rgba(0,0,0,0.55);padding:16px 18px 18px;';
    const CSS = 'baja-pc-css';
    try {
        if (!document.getElementById(CSS)) {
            const st = document.createElement('style');
            st.id = CSS;
            st.textContent = '@keyframes bajaPcSpin{to{transform:rotate(360deg)}}'
                + '.baja-pc-spin{display:inline-block;width:13px;height:13px;border-radius:50%;'
                + 'border:2px solid rgba(255,255,255,0.25);border-top-color:#22c55e;'
                + 'animation:bajaPcSpin 0.7s linear infinite;vertical-align:-2px;}';
            document.head.appendChild(st);
        }
    } catch (e) { }

    const btn = 'cursor:pointer;border-radius:8px;padding:8px 14px;font:600 12.5px Arial;'
        + 'border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.06);color:#e8f0fb;';
    const green = 'cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;'
        + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;';

    panel.innerHTML = '<div style="display:flex;align-items:center;gap:10px;">'
        + '<div style="font:12px Arial;color:#9fb3c8;flex:1 1 auto;min-width:0;'
        + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + H(text) + '</div>'
        + '<button id="pc-close" style="' + btn + '">Close</button></div>'
        + '<div id="pc-body" style="margin-top:12px;">'
        + '<span class="baja-pc-spin"></span>'
        + '<span style="margin-left:8px;font:700 12.5px Arial;color:#e2e8f0;">Working</span>'
        + '</div>';
    document.body.appendChild(panel);

    const q = (sel) => panel.querySelector(sel);
    const close = () => {
        try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
        try { if (onDone) onDone(); } catch (e) { }
    };
    try { q('#pc-close').onclick = close; } catch (e) { }

    const say = (html) => { try { q('#pc-body').innerHTML = html; } catch (e) { } };

    // Resolve and call a menu item the way the menu itself does. createIonFunction returns
    // a REFERENCE, not a function, so a `typeof === "function"` test on it is always false
    // and silently does nothing; getIonFunction is what turns it back into something
    // callable.
    const fire = async (m) => {
        const ref = m.ionFunction || m.click;
        let fn = null;
        try { fn = (typeof ref === 'function') ? ref : getIonFunction(ref); } catch (e) { fn = null; }
        if (!fn) return 'nothing is wired to that menu item';
        try { await fn(m); } catch (e) { return ('' + (e && e.message ? e.message : e)); }
        return null;
    };

    const runRow = async (row) => {
        close();
        const err = await fire(row.__m);
        if (err) {
            try { if (o && o.setError) o.setError('Could not run ' + row.path + ': ' + err); } catch (e) { }
        }
    };

    (async () => {
        if (!actions.length) {
            say('<div style="font:12.5px Arial;color:#fca5a5;">There is no menu on screen to '
                + 'match that against.</div>');
            return;
        }
        let r = null;
        try {
            r = await exec('py/bio/project/menu-pick.py', text,
                JSON.stringify(actions.map((a) => {
                    const c = { i: a.i, path: a.path };
                    if (a.tooltip) c.tooltip = a.tooltip;
                    return c;
                })),
                context ? JSON.stringify(context) : '');
        } catch (e) { r = { status: 'ERROR', error: ('' + (e && e.message ? e.message : e)) }; }

        if (!r || r.status !== 'OK') {
            say('<div style="font:12.5px Arial;color:#fca5a5;">Could not read that: '
                + H((r && r.error) || 'no answer') + '</div>');
            return;
        }

        const byIndex = (i) => actions.filter((a) => a.i === i)[0] || null;
        const pick = (r.pick == null) ? null : byIndex(r.pick);
        const alts = (r.alternatives || []).map(byIndex).filter((x) => !!x);

        // NOTHING MATCHED is an answer, and the near misses are offered as choices rather
        // than one of them being run as if it were the match.
        if (!pick) {
            say('<div style="font:700 13px Arial;color:#e8f0fb;">Nothing in this menu does that.</div>'
                + (r.unsupported ? ('<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                    + H(r.unsupported) + '</div>') : '')
                + (alts.length ? ('<div style="font:12px Arial;color:#9fb3c8;margin-top:12px;">'
                    + 'Closest things on the menu:</div>'
                    + alts.map((a) => '<div style="margin-top:7px;"><button class="pc-alt" data-i="'
                        + a.i + '" style="' + btn + '">' + H(a.path) + '</button></div>').join('')) : '')
                + '<div style="margin-top:14px;"><button id="pc-cancel" style="' + btn + '">Close</button></div>');
        } else {
            say('<div style="font:700 13px Arial;color:#7fb0e8;">One item</div>'
                + '<div style="font:700 14px Arial;color:#e8f0fb;margin-top:7px;">' + H(pick.path) + '</div>'
                + (r.explain ? ('<div style="font:12px Arial;color:#9fb3c8;margin-top:5px;">'
                    + H(r.explain) + '</div>') : '')
                + '<div style="display:flex;gap:10px;margin-top:14px;align-items:center;">'
                + '<button id="pc-go" style="' + green + '">Open it</button>'
                + '<button id="pc-cancel" style="' + btn + '">Cancel</button></div>'
                + (alts.length ? ('<div style="font:12px Arial;color:#6b8299;margin-top:14px;">'
                    + 'Or: ' + alts.map((a) => '<a href="#" class="pc-alt" data-i="' + a.i
                        + '" style="color:#7fb0e8;">' + H(a.path) + '</a>').join(' · ') + '</div>') : ''));
            try { q('#pc-go').onclick = () => runRow(pick); } catch (e) { }
        }

        try { const c = q('#pc-cancel'); if (c) c.onclick = close; } catch (e) { }
        try {
            const list = panel.querySelectorAll('.pc-alt');
            for (let k = 0; k < list.length; k++) {
                list[k].onclick = (ev) => {
                    try { ev.preventDefault(); } catch (e) { }
                    const row = byIndex(parseInt(list[k].getAttribute('data-i'), 10));
                    if (row) runRow(row);
                };
            }
        } catch (e) { }
    })();

    return { close: close, actions: actions.length };
}
