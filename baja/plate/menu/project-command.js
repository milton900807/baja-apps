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
                // BOTH SPELLINGS. The menu component reads ionfunction ?? ionFunction, and
                // this app writes the lowercase one 24 times and the camelCase one 15 times.
                // Checking only one of them quietly dropped most of Draw, Style and Ops out
                // of the catalogue, so the model could not pick what it could not see.
                const act = m.ionfunction || m.ionFunction || m.click;
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

    // THE CANVAS DOES NOT HEAR ANYTHING PRESSED ON THIS CARD. The canvas takes presses from
    // its own element but releases from the window, so pressing a button here moved what was
    // underneath, and the click that dismissed the card landed on the canvas afterwards.
    // The module body is not async (this file is `function (o)`), so the shield is asked for
    // and taken when it arrives. If the card is closed before then -- a fast Escape, a second
    // request replacing this one -- `closed` is already true and it is dropped on arrival
    // rather than left listening with nothing to protect.
    let shield = null, closed = false;
    try {
        exec('baja/lib/modal-shield.js', panel).then(
            (sh) => { shield = sh; if (closed) { try { sh.release(); } catch (e) { } } },
            () => { shield = null; });
    } catch (e) { shield = null; }

    const q = (sel) => panel.querySelector(sel);
    const close = () => {
        try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
        // Released AFTER the card is gone: it holds a moment longer, so the release and the
        // click that follow the press that closed this do not reach the canvas either.
        closed = true;
        try { if (shield) shield.release(); } catch (e) { }
        try { if (onDone) onDone(); } catch (e) { }
    };
    try { q('#pc-close').onclick = close; } catch (e) { }

    const say = (html) => { try { q('#pc-body').innerHTML = html; } catch (e) { } };

    // Resolve and call a menu item the way the menu itself does. createIonFunction returns
    // a REFERENCE, not a function, so a `typeof === "function"` test on it is always false
    // and silently does nothing; getIonFunction is what turns it back into something
    // callable.
    const fire = async (m) => {
        const ref = m.ionfunction || m.ionFunction || m.click;
        let fn = null;
        try { fn = (typeof ref === 'function') ? ref : getIonFunction(ref); } catch (e) { fn = null; }
        if (!fn) return 'nothing is wired to that menu item';
        try { await fn(m); } catch (e) { return ('' + (e && e.message ? e.message : e)); }
        return null;
    };

    // EVERY OPERATION THAT TAKES TIME SAYS SO, HERE AS IN THE EDITOR.
    //
    // Pressing GO on "create a monthly cost table" turned the button's word to "Working" and
    // nothing else: no movement, no clock, on a card that otherwise looked exactly as it had
    // before the press, for as long as the generator took. The editor's card already had
    // the answer to this (editor-command.js) and this card, which runs the same kind of
    // operation, did not.
    //
    // The clock decides, at the one place every operation here runs through. A step still
    // going after a third of a second gets the spinner, titled with the card's own
    // description of what is running and counting the seconds. One that finishes sooner
    // shows nothing, because a flash of a panel on an instant operation is noise. An
    // operation that raises its own panel keeps it: working.js is a singleton, and a second
    // would replace the first and lose what it was reporting.
    //
    // It comes down before the outcome is shown. These operations answer with {error}
    // rather than throwing, and the refusal is written on the card: a panel left over the
    // card would cover the very sentence that says what went wrong.
    const SPIN_AFTER = 350;
    const withSpinner = async (title, detail, run) => {
        let w = null, timer = null, settled = false;
        const t = ('' + (title || 'Working'));
        timer = setTimeout(async () => {
            timer = null;
            try { if (window.__bajaWorking) return; } catch (e) { }
            try {
                const made = await exec('baja/lib/working.js',
                    t.length > 90 ? (t.slice(0, 88) + '\u2026') : t, '' + (detail || ''));
                // It finished while the panel was being built: take it straight back down
                // rather than leaving it over a canvas that is done.
                if (settled) { try { made.done(); } catch (e) { } } else { w = made; }
            } catch (e) { w = null; }
        }, SPIN_AFTER);
        try {
            return await run();
        } finally {
            settled = true;
            if (timer) { clearTimeout(timer); timer = null; }
            try { if (w) w.done(); } catch (e) { }
            w = null;
        }
    };

    const runRow = async (row) => {
        close();
        const err = await withSpinner(row.path, '', () => fire(row.__m));
        if (err) {
            try { if (o && o.setError) o.setError('Could not run ' + row.path + ': ' + err); } catch (e) { }
        }
    };

    (async () => {
        // A FORMULA IS NOT A REQUEST TO BE INTERPRETED.
        //
        // =sum(employees[1:1][1:]) typed in here was sent to a model, which answered that
        // nothing does that and suggested clicking the cell and typing it instead. There is
        // nothing to work out: an "=" at the front is the user saying exactly what they want
        // in the cell. It goes in, the project recalculates, and no model is asked.
        //
        // Before the menubar check as well: whether a formula can be typed has nothing to do
        // with what is on the menu, and "there is no menu on screen" is a strange answer to
        // somebody who typed a sum.
        //
        // WORDS AFTER AN "=" ARE A REQUEST FOR A FORMULA, NOT A FORMULA. "=sum the cells
        // above" was put in the cell exactly as typed, and the cell went red: the "=" said
        // "I want a formula here" and the rest said which one, in English. Nothing with two
        // words side by side and no bracket anywhere is a formula the engine can read, so it
        // is never written as one. The commonest of these, a total (or average, smallest,
        // largest, count) of what is above, is answered here with the formula itself and no
        // model.
        //
        // EVERYTHING ELSE IS WORKED OUT, AND SO IS A FORMULA THAT IS ALREADY RED. Other
        // words ("=fuel plus crew salaries") go to the operation that writes one formula
        // from a description. So does Enter pressed on a cell that is red (o.repair): the
        // field holds the very text that failed, and writing it back a second time is the
        // one thing certain not to help. That operation checks what it is given and tries
        // it before writing, and leaves the cell alone when it cannot do better.
        const formulaBody = text.charAt(0) === '=' ? text.slice(1).trim() : '';
        const words = !!formulaBody && !/[()\[\]{}]/.test(formulaBody)
            && /[A-Za-z]\w*\s+[A-Za-z]/.test(formulaBody.replace(/\b(and|or|not)\b/gi, '+'));
        if (words) {
            const low = formulaBody.toLowerCase();
            const how = /\b(average|mean|avg)\b/.test(low) ? 'average'
                : /\b(min|minimum|smallest|lowest|least)\b/.test(low) ? 'min'
                : /\b(max|maximum|largest|highest|biggest|most)\b/.test(low) ? 'max'
                : (/\b(count|number of)\b/.test(low) || /\bhow many\b/.test(low)) ? 'count'
                : /\b(sum|total|add|adds|added)\b/.test(low) ? 'sum' : '';
            if (how && /\b(above|column)\b/.test(low)) {
                let put = null;
                try { put = await withSpinner(formulaBody, 'sum_above', () => exec('baja/plate/ops/sum-above.js', o.pm, { how: how, cell: o.cell || null, table: o.table || '' })); }
                catch (e) { put = { error: ('' + (e && e.message ? e.message : e)) }; }
                if (put && put.error) {
                    say('<div style="font:700 13px Arial;color:#fbbf24;">That did not happen</div>'
                        + '<div style="font:13px Arial;color:#e8f0fb;margin-top:7px;">' + H(put.error)
                        + '</div><div style="margin-top:14px;"><button id="pc-cancel" style="' + btn
                        + '">Close</button></div>');
                    try { q('#pc-cancel').onclick = close; } catch (e) { }
                    return;
                }
                close();
                return;
            }
        }
        // "BOOKMARK ASSUMPTIONS" NEEDS NO SEARCH AND NO CARD. The verb is the whole
        // request and what follows it is the tables, so it goes straight to the operation
        // that frames them. A table it cannot find is said, with the tables there are.
        const mark = /^(?:please\s+)?(?:bookmark|add\s+a\s+bookmark\s+(?:for|to|on))\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(text);
        if (mark) {
            let put = null;
            try {
                put = await withSpinner(text, 'bookmark_tables',
                    () => exec('baja/plate/ops/bookmark-tables.js', o.pm,
                        { tables: /^(this|it|this table|the table|the selected table)$/i.test(mark[1].trim()) ? '' : mark[1], name: mark[2] || '' }));
            } catch (e) { put = { error: ('' + (e && e.message ? e.message : e)) }; }
            if (put && put.error) {
                say('<div style="font:700 13px Arial;color:#fbbf24;">That did not happen</div>'
                    + '<div style="font:13px Arial;color:#e8f0fb;margin-top:7px;">' + H(put.error)
                    + '</div><div style="margin-top:14px;"><button id="pc-cancel" style="' + btn
                    + '">Close</button></div>');
                try { q('#pc-cancel').onclick = close; } catch (e) { }
                return;
            }
            close();
            return;
        }
        if (words || (o && o.repair && text.charAt(0) === '=')) {
            let put = null;
            try {
                put = await withSpinner('Working out a formula for ' + text, 'write_formula',
                    () => exec('baja/plate/ops/formula-from-words.js', o.pm,
                        { what: text, cell: o.cell || null, table: o.table || '' }));
            } catch (e) { put = { error: ('' + (e && e.message ? e.message : e)) }; }
            if (put && put.error) {
                say('<div style="font:700 13px Arial;color:#fbbf24;">That did not happen</div>'
                    + '<div style="font:13px Arial;color:#e8f0fb;margin-top:7px;">' + H(put.error)
                    + '</div><div style="margin-top:14px;"><button id="pc-cancel" style="' + btn
                    + '">Close</button></div>');
                try { q('#pc-cancel').onclick = close; } catch (e) { }
                return;
            }
            close();
            return;
        }
        if (text.charAt(0) === '=') {
            let put = null;
            try { put = await withSpinner(text, 'set_formula', () => exec('baja/plate/ops/set-formula.js', o.pm, { formula: text })); }
            catch (e) { put = { error: ('' + (e && e.message ? e.message : e)) }; }
            if (put && put.error) {
                say('<div style="font:700 13px Arial;color:#fbbf24;">That did not happen</div>'
                    + '<div style="font:13px Arial;color:#e8f0fb;margin-top:7px;">' + H(put.error)
                    + '</div><div style="margin-top:14px;"><button id="pc-cancel" style="' + btn
                    + '">Close</button></div>');
                try { q('#pc-cancel').onclick = close; } catch (e) { }
                return;
            }
            close();
            return;
        }

        if (!actions.length) {
            say('<div style="font:12.5px Arial;color:#fca5a5;">There is no menu on screen to '
                + 'match that against.</div>');
            return;
        }
        let CAP = null;
        try { CAP = await exec('baja/plate/menu/project-capabilities.js'); } catch (e) { CAP = null; }

        // THE REQUEST SAYS WHICH WINDOW IT CAME FROM, in its first words.
        //
        // "Zoom out about 10%", typed into a timeline's own Ask button, matched the project's
        // global Zoom out: true of the words, wrong about the request, because the user had
        // just pressed a button on one object. The object is already in the context, but a
        // context is a note beside the request and the request itself said nothing -- so it
        // goes in front of the words, where it cannot be read past.
        // WHAT IS ON THE CANVAS GOES WITH EVERY REQUEST. A name the user can see is a name
        // they will use, and without this list the model cannot tell "show me assumptions"
        // (a table that is here) from a menu item that happens to share the word. Read from
        // the track itself rather than asked of each caller, so every path gets it.
        const onCanvas = (() => {
            try {
                const track = (o && o.pm) ? ((o.pm.plateTrack) ? o.pm.plateTrack : o.pm) : null;
                if (!track) return null;
                const out = [];
                for (const list of [track.root, track.m_plots, track.plots, track.objects]) {
                    if (!Array.isArray(list)) continue;
                    for (const x of list) {
                        const n = x && x.name != null ? ('' + x.name).trim() : '';
                        if (n && out.indexOf(n) < 0) out.push(n);
                    }
                }
                return out.length ? out.slice(0, 60) : null;
            } catch (e) { return null; }
        })();

        const asked = (context && context.asked_from) || null;
        const askedName = asked ? ('' + (asked.name || '')).trim() : '';
        const askedKind = asked ? ('' + (asked.type || 'object')).trim() : '';
        const request = asked
            ? ('On the ' + askedKind + (askedName ? (' named "' + askedName + '"') : '')
                + (asked.about ? (' (' + asked.about + ')') : '') + ': ' + text)
            : text;

        let r = null;
        try {
            r = await exec('py/bio/project/menu-pick.py', request,
                JSON.stringify(actions.map((a) => {
                    const c = { i: a.i, path: a.path };
                    if (a.tooltip) c.tooltip = a.tooltip;
                    return c;
                })),
                // THE DATE OF TODAY GOES WITH EVERY REQUEST. "from now until the end of the year"
                // is a different pair of dates depending on when it is asked, and a model has
                // no clock: without this it either refuses or invents a year.
                JSON.stringify(Object.assign({ on_canvas: onCanvas, today: (() => {
                    const d = new Date();
                    const p2 = (v) => (v < 10 ? '0' : '') + v;
                    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
                })() }, context || {})),
                '',
                CAP ? JSON.stringify(CAP.catalogue()) : '[]');
        } catch (e) { r = { status: 'ERROR', error: ('' + (e && e.message ? e.message : e)) }; }

        if (!r || r.status !== 'OK') {
            say('<div style="font:12.5px Arial;color:#fca5a5;">Could not read that: '
                + H((r && r.error) || 'no answer') + '</div>');
            return;
        }

        const byIndex = (i) => actions.filter((a) => a.i === i)[0] || null;
        const pick = (r.pick == null) ? null : byIndex(r.pick);
        const alts = (r.alternatives || []).map(byIndex).filter((x) => !!x);

        // DO IT IF IT CAN BE DONE; OTHERWISE OPEN THE PLACE IT IS DONE.
        //
        // The arguments are checked against the SAME declarations that were sent to the
        // model, so a size outside what a table can be is refused here rather than trimmed
        // into range and reported as what was asked for. A refused operation is not the end
        // of the answer: the menu item falls through below, which is the UI where the user
        // can say it properly, and the reason is shown with it.
        let op = null, opProblem = null;
        if (r.operation && CAP) {
            const v = CAP.validate(r.operation, r.args || {});
            if (v.ok) op = v; else opProblem = v.problem;
        }

        // THE OBJECT THE REQUEST CAME FROM IS FILLED IN, NOT HOPED FOR.
        //
        // Pressing Ask on a table and typing "add 4 rows" is a request about THAT table. The
        // name is in the request's opening words and in the context, and the operation has a
        // parameter for it -- but all three are things the model has to notice, and this one
        // is not a guess: the button knows. So where the operation takes a parameter named
        // for the kind of object the request came from and the model left it out, it is
        // filled in here. The card then shows the name, which is the only way the user can
        // see WHICH table is about to change.
        if (op && asked && askedName) {
            const pname = (askedKind === 'timeline') ? 'timeline' : (askedKind === 'table' ? 'table' : null);
            try {
                if (pname && op.capability && op.capability.params && op.capability.params[pname]
                    && (op.args[pname] == null || ('' + op.args[pname]).trim() === '')) {
                    op.args[pname] = askedName;
                }
            } catch (e) { }
        }

        if (op) {
            // A REFUSAL IS SHOWN WHERE THE BUTTON WAS, NOT BEHIND THE CARD.
            //
            // This used to close the card first and report a refused operation through
            // setMessage, a toast on the canvas -- which lands under whatever the request
            // opened, lasts a few seconds, and is gone by the time the eye gets back to the
            // canvas. The operation had said exactly why it refused ("this timeline runs
            // Nov 30 to Jan 15, and November 22 falls outside it") and the user saw a GO
            // button that appeared to do nothing. The card stays up and says it, with the
            // request still on it, so the next attempt can be typed knowing what was wrong.
            const runOp = async () => {
                try { const b = q('#pc-op'); if (b) { b.disabled = true; b.textContent = 'Working\u2026'; } } catch (e) { }
                let out = null;
                let naming = '';
                try { naming = CAP.preview(op.capability.name, op.args); } catch (e) { naming = ''; }
                try {
                    out = await withSpinner(naming || op.capability.name, op.capability.name,
                        () => exec(op.capability.module, o.pm || null, op.args));
                }
                catch (e) { out = { error: ('' + (e && e.message ? e.message : e)) }; }
                if (out && out.error) {
                    try { if (o && o.setError) o.setError(out.error); } catch (e) { }
                    say('<div style="font:700 13px Arial;color:#fbbf24;">That did not happen</div>'
                        + '<div style="font:13px Arial;color:#e8f0fb;margin-top:7px;">'
                        + H(out.error) + '</div>'
                        + '<div style="font:11px Arial;color:#6b8299;margin-top:7px;">'
                        + H(CAP.preview(op.capability.name, op.args)) + '</div>'
                        + '<div style="margin-top:14px;"><button id="pc-cancel" style="' + btn
                        + '">Close</button></div>');
                    try { q('#pc-cancel').onclick = close; } catch (e) { }
                    return;
                }
                close();
            };
            // THE BUTTON SAYS GO. It is the same word as the field it sits under, and the
            // field is where the request was typed; "Run it" named the mechanism instead of
            // the act.
            // THE VALUES CAN BE CHANGED BEFORE IT RUNS.
            //
            // "A new table called lab_employees" has to come out some size, and 10 x 5 is a
            // guess at what was not said. Printing the guess and offering only GO or Cancel
            // makes a wrong number into a thing to undo: run it, see it, delete it, say it
            // again with the number in. The arguments are the operation's own declared
            // parameters, so every operation gets this without being told about it, and
            // whatever is typed goes back through the same validate() that the model's
            // answer did -- a hand-typed value is no more trusted than a generated one.
            const fields = (() => {
                const ps = (op.capability && op.capability.params) || {};
                const names = Object.keys(ps);
                if (!names.length) return '';
                return '<div style="margin-top:10px;display:grid;grid-template-columns:auto 1fr;'
                    + 'gap:6px 10px;align-items:center;">'
                    + names.map((k) => {
                        const d = ps[k] || {};
                        const v = (op.args[k] == null) ? '' : ('' + op.args[k]);
                        const id = 'pc-arg-' + k.replace(/[^A-Za-z0-9_]/g, '');
                        const label = '<label for="' + id + '" style="font:11.5px Arial;color:#9fb3c8;'
                            + 'text-align:right;" title="' + H('' + (d.about || '')) + '">' + H(k)
                            + (d.required ? ' *' : '') + '</label>';
                        const box = 'background:#0e2236;color:#e8f0fb;border:1px solid #2b4a68;'
                            + 'border-radius:6px;padding:4px 7px;font:12px Arial;width:100%;'
                            + 'box-sizing:border-box;';
                        if (d.type === 'enum' && Array.isArray(d.values)) {
                            return label + '<select id="' + id + '" data-arg="' + H(k) + '" style="' + box + '">'
                                + (d.required ? '' : '<option value=""></option>')
                                + d.values.map((o) => '<option value="' + H('' + o) + '"'
                                    + (('' + o) === v ? ' selected' : '') + '>' + H('' + o) + '</option>').join('')
                                + '</select>';
                        }
                        return label + '<input id="' + id + '" data-arg="' + H(k) + '" type="'
                            + (d.type === 'number' ? 'number' : 'text') + '" value="' + H(v)
                            + '" placeholder="' + H('' + (d.default || '')) + '" style="' + box + '">';
                    }).join('') + '</div>';
            })();

            say('<div style="font:700 13px Arial;color:#7fb0e8;">One operation</div>'
                + '<div id="pc-headline" style="font:700 14px Arial;color:#e8f0fb;margin-top:7px;">'
                + H(CAP.preview(op.capability.name, op.args)) + '</div>'
                + '<div style="font:11px Arial;color:#6b8299;margin-top:3px;">'
                + H(op.capability.name) + '</div>'
                + fields
                + '<div id="pc-argerr" style="font:12px Arial;color:#fbbf24;margin-top:6px;"></div>'
                + (r.explain ? ('<div style="font:12px Arial;color:#9fb3c8;margin-top:5px;">'
                    + H(r.explain) + '</div>') : '')
                + (op.dropped && op.dropped.length
                    ? ('<div style="font:11.5px Arial;color:#fbbf24;margin-top:4px;">ignored: '
                        + H(op.dropped.join(', ')) + '</div>') : '')
                + '<div style="display:flex;gap:10px;margin-top:14px;align-items:center;">'
                + '<button id="pc-op" style="' + green + '">GO</button>'
                + '<button id="pc-cancel" style="' + btn + '">Cancel</button></div>'
                + (pick ? ('<div style="font:12px Arial;color:#6b8299;margin-top:14px;">Or do it '
                    + 'yourself in <a href="#" class="pc-alt" data-i="' + pick.i
                    + '" style="color:#7fb0e8;">' + H(pick.path) + '</a></div>') : ''));
            // What is in the boxes now, read back through validate so a typed value is
            // checked exactly as a generated one is.
            const readArgs = () => {
                const out = {};
                try {
                    for (const el of panel.querySelectorAll('[data-arg]')) {
                        const k = el.getAttribute('data-arg');
                        const v = ('' + (el.value == null ? '' : el.value)).trim();
                        if (v !== '') out[k] = v;
                    }
                } catch (e) { }
                return out;
            };
            const refresh = () => {
                const v = CAP.validate(op.capability.name, readArgs());
                const err = q('#pc-argerr'), head = q('#pc-headline'), go = q('#pc-op');
                if (v.ok) {
                    op.args = v.args;
                    if (head) head.textContent = CAP.preview(op.capability.name, v.args);
                    if (err) err.textContent = (v.dropped && v.dropped.length)
                        ? ('ignored: ' + v.dropped.join(', ')) : '';
                    if (go) { go.disabled = false; go.style.opacity = ''; }
                } else {
                    // GO is turned off rather than left to fail: a card that refuses on press
                    // is a card that let you press it.
                    // validate() calls it `problem`, which is what the refusal above reads
                    // too: asking for `error` here printed a generic line and left the user
                    // to guess which box was wrong.
                    if (err) err.textContent = v.problem || v.error || 'that will not run';
                    if (go) { go.disabled = true; go.style.opacity = '0.5'; }
                }
            };
            try {
                for (const el of panel.querySelectorAll('[data-arg]')) {
                    el.addEventListener('input', refresh);
                    el.addEventListener('change', refresh);
                    // Enter in a box is GO, which is what it is for.
                    el.addEventListener('keydown', (e) => {
                        if (e && e.key === 'Enter') { e.preventDefault(); const g = q('#pc-op'); if (g && !g.disabled) g.click(); }
                    });
                }
            } catch (e) { }
            try { q('#pc-op').onclick = runOp; } catch (e) { }
        } else if (!pick) {

            // NOTHING MATCHED is an answer, and the near misses are offered as choices
            // rather than one of them being run as if it were the match.
            say('<div style="font:700 13px Arial;color:#e8f0fb;">Nothing here does that.</div>'
                + (opProblem ? ('<div style="font:12px Arial;color:#fbbf24;margin-top:6px;">'
                    + H(opProblem) + '</div>') : '')
                + (r.unsupported ? ('<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                    + H(r.unsupported) + '</div>') : '')
                + (alts.length ? ('<div style="font:12px Arial;color:#9fb3c8;margin-top:12px;">'
                    + 'Closest things on the menu:</div>'
                    + alts.map((a) => '<div style="margin-top:7px;"><button class="pc-alt" data-i="'
                        + a.i + '" style="' + btn + '">' + H(a.path) + '</button></div>').join('')) : '')
                + '<div style="margin-top:14px;"><button id="pc-cancel" style="' + btn + '">Close</button></div>');
        } else {
            say('<div style="font:700 13px Arial;color:#7fb0e8;">One item</div>'
                + (opProblem ? ('<div style="font:12px Arial;color:#fbbf24;margin-top:6px;">'
                    + H(opProblem) + ' Opening where you can say it instead.</div>') : '')
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
