function (graph, layout) {

    // TYPE WHAT YOU WANT DONE, IN WORDS.
    //   await exec('baja/manchester/menu/editor-command.js', graph, genegraph_panel_layout);
    //
    // "select all snps", "remove the pathogenic variants", "select every red compound",
    // "clear the selection", "zoom to the selection", "fit".
    //
    // The model is a TRANSLATOR AND NOTHING ELSE. It reads the sentence and names one verb
    // from a closed list, with parameters; it never emits code, never names a function, and
    // never decides what any individual variant or compound is. The matching is done here,
    // by the same two engines the rest of the editor uses: baja/data/variant-search.js for
    // variants and baja/bio/compound-filter.js for compounds.
    //
    // That split is the only reason a free-text box belongs on a toolbar. A model that could
    // say "run this" would be a remote shell on someone's unsaved work. A model that can only
    // say "the verb is remove_variants and the query is pathogenic" can be read back, counted
    // and refused before a single record moves, which is what the panel below does: the
    // understood action and the number of records it would touch are always shown first, and
    // the two destructive verbs never run until their own button is pressed.
    //
    // Select is also preferred over remove whenever the sentence is ambiguous, upstream in
    // the prompt. Selecting is reversible; removing is the one that destroys work.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const redraw = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };

        const tracks = (graph.track || []).filter(Boolean);
        if (!tracks.length) { say('Load a track first.'); return 0; }

        const VS = await exec('baja/data/variant-search.js', graph, { engineOnly: true });
        const F = await exec('baja/bio/compound-filter.js');

        // Every variant and every compound on the canvas, paired with its track. Built once:
        // the counts shown with the request and the records acted on are then the same set,
        // so a number read on screen cannot drift from what the button does.
        const vrows = [];
        for (const t of tracks) for (const v of (t.snpindels || [])) vrows.push({ t: t, v: v, rec: VS.recordOf(v) });
        const crows = [];
        for (const t of tracks) for (const o of (t.oligos || [])) crows.push({ t: t, o: o });

        // WHAT IS ACTUALLY ON SCREEN. A question like "are any of these pathogenic" means
        // the ones in view, not the four thousand on the track, and answering about the
        // whole track would be answering a question nobody asked.
        //
        // graph.grid holds the visible world window; t.tgraph.X(baseIndex) maps a variant's
        // index on its track into that same world frame, which is how every drawing path
        // here places one. The vertical test is the track's own band overlapping the window,
        // because tgraph.height is signed and a track scrolled off the top is not visible
        // however well its bases line up.
        const visibleVariants = () => {
            let x0, x1, y0, y1;
            try {
                const g = graph.grid;
                x0 = g.getxmin(); x1 = g.getxmax();
                y0 = Math.min(g.getymin(), g.getymax());
                y1 = Math.max(g.getymin(), g.getymax());
            } catch (e) { return vrows.slice(); }      // no window to test against: all of them
            if (!isFinite(x0) || !isFinite(x1)) return vrows.slice();
            const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
            const okTrack = new Map();
            const trackVisible = (t) => {
                if (okTrack.has(t)) return okTrack.get(t);
                let v = true;
                try {
                    const tg = t.tgraph;
                    const a = tg.yi, b = tg.yi + (tg.height || 0);
                    v = (Math.max(a, b) >= y0) && (Math.min(a, b) <= y1);
                } catch (e) { v = true; }
                okTrack.set(t, v);
                return v;
            };
            return vrows.filter((r) => {
                if (!trackVisible(r.t)) return false;
                let wx;
                try { wx = r.t.tgraph.X(r.v.xi); } catch (e) { return false; }
                return isFinite(wx) && wx >= lo && wx <= hi;
            });
        };

        // The fields the question is answered from, and ONLY these. No sequence, no
        // coordinates beyond the position, nothing that would let a question about what is
        // on screen turn into a request for the design itself.
        const askRecord = (r, i) => {
            const rec = r.rec;
            const o = { i: i, name: rec.name || ('variant ' + (i + 1)) };
            if (rec.gene) o.gene = rec.gene;
            if (rec.change && rec.change !== '>') o.change = rec.change;
            if (rec.pos) o.pos = rec.pos;
            if (rec.consequence) o.consequence = ('' + rec.consequence).slice(0, 160);
            if (rec.clinsig) o.clinsig = rec.clinsig;
            if (rec.condition) o.condition = ('' + rec.condition).slice(0, 160);
            if (rec.source) o.source = rec.source;
            if (rec.type) o.type = rec.type;
            if (r.t && r.t.name) o.track = r.t.name;
            return o;
        };

        const ctx = {
            tracks: tracks.map((t) => t.name || '(unnamed)').slice(0, 12),
            counts: {
                variants: vrows.length,
                variants_on_screen: visibleVariants().length,
                compounds: crows.length,
                flagged_compounds: crows.filter((r) => F.isRed(r.o)).length
            },
            has_selection: !!(graph.startX != null && graph.endX != null && graph.startX !== graph.endX)
        };

        // ------------------------------------------------------------------ the verbs -----
        // One entry per action the translator is allowed to name. `count` says how many
        // records the action would touch, `run` does it. Nothing outside this table can be
        // reached from the input box, whatever comes back from the model.
        const vhits = (query) => {
            const q = VS.compileQuery(query);
            return q ? vrows.filter((r) => q(r.rec)) : vrows.slice();   // no terms means all
        };
        const chits = (spec) => F.match(crows, spec || {});

        const selectVariants = (rows) => {
            for (const r of vrows) { try { r.v.deselect(); } catch (e) { } }
            for (const r of rows) { try { r.v.select(); } catch (e) { } }
            redraw();
        };

        const ACTIONS = {
            select_variants: {
                noun: 'variant',
                scope: (p) => vhits(p.query),
                describe: (p) => ('' + (p.query || '')).trim() ? ('matching “' + p.query + '”') : 'every variant',
                verb: 'Select',
                run: (rows) => {
                    selectVariants(rows);
                    result('Selected ' + rows.length + ' of ' + vrows.length + ' variants.');
                }
            },
            remove_variants: {
                noun: 'variant', destructive: true,
                scope: (p) => vhits(p.query),
                describe: (p) => ('' + (p.query || '')).trim() ? ('matching “' + p.query + '”') : 'every variant',
                verb: 'Remove',
                run: (rows) => {
                    try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                    // Grouped by track and filtered in one pass per track, rather than a
                    // removesnp() call per record: splicing an array while walking it is how
                    // the last variant of a run gets left behind.
                    const doomed = new Set(rows.map((r) => r.v));
                    let n = 0;
                    for (const t of tracks) {
                        if (!t.snpindels) continue;
                        const before = t.snpindels.length;
                        t.snpindels = t.snpindels.filter((v) => !doomed.has(v));
                        n += before - t.snpindels.length;
                    }
                    redraw();
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    result('Removed ' + n + ' variant' + (n === 1 ? '' : 's') + '. Undo restores them.');
                }
            },
            clear_variant_selection: {
                noun: 'variant', bare: true,
                run: () => { selectVariants([]); result('Variant selection cleared.'); }
            },
            select_compounds: {
                noun: 'compound',
                scope: (p) => chits(p.filter),
                describe: (p) => F.describe(p.filter),
                verb: 'Select',
                run: (rows) => {
                    try {
                        graph.setSelectedCompounds(rows.map((r) => ({ o: r.o, t: r.t })));
                        graph.currentShape = null;
                    } catch (e) { }
                    redraw();
                    result('Selected ' + rows.length + ' of ' + crows.length + ' compounds.');
                }
            },
            remove_compounds: {
                noun: 'compound', destructive: true,
                scope: (p) => chits(p.filter),
                describe: (p) => F.describe(p.filter),
                verb: 'Remove',
                run: (rows) => {
                    try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                    const doomed = new Set(rows.map((r) => r.o));
                    let n = 0;
                    for (const t of tracks) {
                        if (!t.oligos) continue;
                        const before = t.oligos.length;
                        t.oligos = t.oligos.filter((o) => !doomed.has(o));
                        n += before - t.oligos.length;
                    }
                    // Prune the selection rather than emptying it: a compound that was
                    // selected and NOT removed should still be selected afterwards, and a
                    // removed one left in the list is a reference to a compound no track
                    // carries any more.
                    try {
                        graph.setSelectedCompounds((graph.selectedCompounds || [])
                            .filter((s) => s && s.o && !doomed.has(s.o)));
                    } catch (e) { }
                    redraw();
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    result('Removed ' + n + ' compound' + (n === 1 ? '' : 's') + '. Undo restores them.');
                }
            },
            clear_compound_selection: {
                noun: 'compound', bare: true,
                run: () => {
                    try { graph.deselectAllCompounds(); } catch (e) { }
                    redraw();
                    result('Compound selection cleared.');
                }
            },
            zoom_selection: {
                bare: true,
                run: async () => {
                    if (!ctx.has_selection) { result('Nothing is selected to zoom to. Drag across a track first.'); return; }
                    try { await graph.zoomToSelection(); } catch (e) { }
                    result('Framed the selection.');
                }
            },
            fit: {
                bare: true,
                run: async () => {
                    try { await graph.viewAllTracks(); } catch (e) { }
                    result('Zoomed out to every track.');
                }
            },
            // The one verb that ANSWERS rather than acts. It has no `run`: answering is
            // a second round trip, so it is handled on its own path below, which renders
            // the answer and then offers the selection as a button.
            ask_variants: { noun: 'variant', question: true }
        };

        // ------------------------------------------------------------------ the panel -----
        return new Promise((resolve) => {
            const H = (s) => ('' + (s == null ? '' : s))
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            try { const old = document.getElementById('baja-editor-command'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

            const panel = document.createElement('div');
            panel.id = 'baja-editor-command';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(3,10,20,0.62);'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;align-items:flex-start;justify-content:center;'
                + 'padding:84px 16px 16px;overflow:auto;';

            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.22);border-radius:10px;padding:13px 15px;font:15px Arial;';
            const btn = 'cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';

            panel.innerHTML = ''
                + '<div style="width:100%;max-width:640px;background:#071a30;color:#fff;border-radius:14px;'
                + 'border:1px solid rgba(255,255,255,0.14);box-shadow:0 18px 54px rgba(0,0,0,0.55);overflow:hidden;">'
                + '<div style="display:flex;align-items:center;gap:14px;padding:15px 20px 13px;background:#0b2545;'
                + 'border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="min-width:0;"><div style="font:700 17px Arial;">Ask the editor</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + ctx.counts.variants_on_screen + ' of ' + ctx.counts.variants + ' variant'
                + (ctx.counts.variants === 1 ? '' : 's') + ' on screen, '
                + ctx.counts.compounds + ' compound' + (ctx.counts.compounds === 1 ? '' : 's')
                + ' on ' + tracks.length + ' track' + (tracks.length === 1 ? '' : 's') + '. '
                + 'A question is answered about what is in view; an instruction applies to the whole canvas.'
                + '</div></div>'
                + '<div style="margin-left:auto;"><button id="ec-close" style="' + btn + '">Close</button></div>'
                + '</div>'
                + '<div style="padding:18px 20px 22px;">'
                + '<input id="ec-q" placeholder="are any of these snps pathogenic" style="' + inp + '"/>'
                + '<div style="display:flex;align-items:center;gap:10px;margin-top:11px;">'
                + '<button id="ec-run" style="cursor:pointer;border-radius:8px;padding:10px 20px;font:700 13px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Go</button>'
                + '<div id="ec-busy" style="font:12.5px Arial;color:#9fb3c8;"></div></div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:14px;line-height:1.8;">'
                + '<b>Ask about what is on screen:</b> are any of these snps pathogenic · '
                + 'which of these hit a splice site · what are these variants<br>'
                + '<b>Or say what to do:</b> select all snps · select the pathogenic variants · '
                + 'remove all snps · select every red compound · remove gapmers under 40% GC · '
                + 'clear the selection · fit<br>'
                + 'A question is answered about the variants in view, with what each record already says '
                + 'shown beside it. An instruction picks one action from a fixed list and shows you which, '
                + 'with a count, before anything happens; removing always needs a second click, and undo '
                + 'restores it.'
                + '</div>'
                + '<div id="ec-out" style="margin-top:16px;"></div>'
                + '</div></div>';
            document.body.appendChild(panel);

            const q = (s) => panel.querySelector(s);
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            const done = (n) => { close(); resolve(n || 0); };

            // The editor listens on the window for keys and pastes; without this a typed
            // sentence is also read as something to do to the canvas.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(0); });
            panel.addEventListener('mousedown', (e) => { if (e.target === panel) done(0); });
            q('#ec-close').onclick = () => done(0);

            let busy = false;

            const render = (r, ask) => {
                const out = q('#ec-out');
                const A = ACTIONS[r.action];
                const unsupported = Array.isArray(r.unsupported) ? r.unsupported : [];
                const warn = unsupported.map((u) => '<div style="font:12.5px Arial;color:#fbbf24;margin-top:7px;">'
                    + '&#9888; not something this can do: ' + H(u) + '</div>').join('');

                if (!A) {
                    out.innerHTML = '<div style="padding:13px 15px;border-radius:10px;background:#0a1e3a;'
                        + 'border:1px solid rgba(255,255,255,0.12);">'
                        + '<div style="font:700 13.5px Arial;color:#e8f0fb;">That is not one of the things this box can do.</div>'
                        + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:6px;line-height:1.7;">'
                        + 'It can answer a question about the variants on screen, select or remove '
                        + 'variants and compounds, clear either selection, zoom to the selection, or fit '
                        + 'the view. Designing, loading data, editing sequence and exporting all live in '
                        + 'the toolbar menus.</div>' + warn + '</div>';
                    return;
                }

                // ---- a question, not an action ------------------------------------------
                if (A.question) { answer(r, ask); return; }

                // A bare verb has no records to count, so it runs on the one click that asked
                // for it. Nothing it does destroys anything and all of it is one keystroke to
                // put back, so a confirmation would only be ceremony.
                if (A.bare) {
                    Promise.resolve(A.run()).then(() => done(0));
                    return;
                }

                const rows = A.scope({ query: r.query, filter: r.filter || {} });
                const what = A.describe({ query: r.query, filter: r.filter || {} });
                const total = (A.noun === 'variant') ? vrows.length : crows.length;
                // "1 of 6 variants", not "1 of 6 variant": in the headline the noun agrees
                // with the total it is counted out of, and on the button, where there is no
                // "of", it agrees with the number being acted on.
                const noun = A.noun + (total === 1 ? '' : 's');
                const nounN = A.noun + (rows.length === 1 ? '' : 's');

                if (!rows.length) {
                    out.innerHTML = '<div style="padding:13px 15px;border-radius:10px;background:#0a1e3a;'
                        + 'border:1px solid rgba(255,255,255,0.12);">'
                        + '<div style="font:700 13.5px Arial;color:#e8f0fb;">Nothing matches ' + H(what) + '.</div>'
                        + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:6px;">Read as: ' + H(r.explain || (A.verb.toLowerCase() + ' ' + A.noun + 's')) + '</div>'
                        + warn + '</div>';
                    return;
                }

                // THE COUNT AND THE FILTER, IN THE EDITOR'S WORDS. `explain` is prose a model
                // wrote and may mention a parameter that did not survive cleaning on the way
                // here; the headline is built from the action that will actually run, and the
                // model's sentence sits under it where a difference between them is visible.
                const head = A.verb + ' ' + rows.length + ' of ' + total + ' ' + noun + ' -- ' + what;
                const danger = !!A.destructive;
                out.innerHTML = '<div style="padding:13px 15px;border-radius:10px;background:#0a1e3a;'
                    + 'border:1px solid ' + (danger ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.12)') + ';">'
                    + '<div style="font:700 14px Arial;color:' + (danger ? '#fca5a5' : '#7fb0e8') + ';">' + H(head) + '</div>'
                    + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:6px;">from “' + H(ask) + '”'
                    + (r.explain ? ('<br>read as: ' + H(r.explain)) : '') + '</div>'
                    + warn
                    + (danger ? '<div style="font:12.5px Arial;color:#fca5a5;margin-top:9px;">'
                        + 'This deletes them from the track' + (total === rows.length ? ' -- every one of them' : '')
                        + '. Undo restores them.</div>' : '')
                    + '<div style="display:flex;gap:10px;margin-top:13px;">'
                    + '<button id="ec-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                    + (danger ? 'border:1px solid #ef4444;background:#ef4444;color:#2a0505;'
                        : 'border:1px solid #22c55e;background:#22c55e;color:#04210f;') + '">'
                    + H(A.verb + ' ' + rows.length + ' ' + nounN) + '</button>'
                    + '<button id="ec-no" style="' + btn + '">Cancel</button>'
                    + '</div></div>';

                q('#ec-no').onclick = () => { out.innerHTML = ''; try { q('#ec-q').focus(); } catch (e) { } };
                q('#ec-go').onclick = () => { Promise.resolve(A.run(rows)).then(() => done(rows.length)); };
                try { q('#ec-go').focus(); } catch (e) { }
            };

            // ------------------------------------------------------------------ answering ---
            // Collect what is on screen, send the records, render the verdicts beside what
            // each record already said, and offer the affirmative ones as a selection.
            const answer = async (r, ask) => {
                const out = q('#ec-out');
                let rows = visibleVariants();
                const narrowed = ('' + (r.query || '')).trim();
                if (narrowed) {
                    const qq = VS.compileQuery(narrowed);
                    if (qq) rows = rows.filter((x) => qq(x.rec));
                }
                if (!rows.length) {
                    out.innerHTML = '<div style="padding:13px 15px;border-radius:10px;background:#0a1e3a;'
                        + 'border:1px solid rgba(255,255,255,0.12);font:13px Arial;color:#9fb3c8;">'
                        + (vrows.length
                            ? ('No variants are on screen' + (narrowed ? (' matching “' + H(narrowed) + '”') : '')
                                + '. Zoom out, or ask about the whole track by name.')
                            : 'There are no variants on the open tracks.')
                        + '</div>';
                    return;
                }

                // A HARD CAP, SAID OUT LOUD. Past a few hundred records the answer stops
                // being about what the user is looking at, and silently truncating the list
                // would make "none of these are pathogenic" a statement about an arbitrary
                // prefix of the screen.
                const CAP = 300;
                let capped = 0;
                if (rows.length > CAP) { capped = rows.length - CAP; rows = rows.slice(0, CAP); }

                q('#ec-busy').textContent = 'reading ' + rows.length + ' variant' + (rows.length === 1 ? '' : 's') + '…';
                let a = null;
                try {
                    const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                    a = await exec(window['env']['apiUrl'] + '/py/bio/editor/variant-question.py',
                        em, ask, JSON.stringify(rows.map(askRecord)), '');
                } catch (e) {
                    q('#ec-busy').textContent = '';
                    out.innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">Could not answer that: '
                        + H(e && e.message ? e.message : e) + '</div>';
                    return;
                }
                q('#ec-busy').textContent = '';
                if (!a || a.status !== 'OK') {
                    out.innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">Could not answer that'
                        + (a && a.error ? (': ' + H(a.error)) : '.') + '</div>';
                    return;
                }

                const parse = (v, d) => {
                    if (v == null) return d;
                    if (typeof v !== 'string') return v;
                    try { return JSON.parse(v); } catch (e) { return d; }
                };
                const verdicts = parse(a.verdicts, []) || [];
                const matches = (parse(a.matches, []) || []).filter((i) => i >= 0 && i < rows.length);
                const hitRows = matches.map((i) => rows[i]).filter(Boolean);

                const VCOL = {
                    pathogenic: '#fca5a5', likely_pathogenic: '#fdba74', uncertain: '#fcd34d',
                    likely_benign: '#a7f3d0', benign: '#86efac', unknown: '#9fb3c8'
                };
                const VLAB = {
                    pathogenic: 'pathogenic', likely_pathogenic: 'likely pathogenic',
                    uncertain: 'uncertain', likely_benign: 'likely benign',
                    benign: 'benign', unknown: 'not known to it'
                };

                const line = (v) => {
                    const row = rows[v.i];
                    if (!row) return '';
                    const rec = row.rec;
                    const who = [rec.name, rec.gene, rec.change && rec.change !== '>' ? rec.change : '']
                        .map((x) => ('' + (x || '')).trim()).filter(Boolean).join(' · ');
                    // THE RECORD'S OWN CALL, ALWAYS, WHERE THERE IS ONE. Side by side rather
                    // than merged: where the model agrees this is corroboration, and where it
                    // disagrees that is something the user needs to see, not something for
                    // either side to win quietly.
                    const own = ('' + (rec.clinsig || '')).trim();
                    return '<div style="display:flex;gap:11px;align-items:flex-start;padding:9px 11px;'
                        + 'border-top:1px solid rgba(255,255,255,0.08);">'
                        + '<div style="flex:0 0 118px;font:700 11.5px Arial;color:' + (VCOL[v.verdict] || '#9fb3c8') + ';">'
                        + H(VLAB[v.verdict] || v.verdict)
                        + '<div style="font:400 10.5px Arial;color:#6b8299;margin-top:2px;">'
                        + H(v.confidence) + ' confidence</div></div>'
                        + '<div style="min-width:0;flex:1 1 auto;">'
                        + '<div style="font:700 12.5px Arial;color:#e8f0fb;">' + H(who || '(unnamed)') + '</div>'
                        + (own ? '<div style="font:11.5px Arial;color:#7fb0e8;margin-top:2px;">record says: '
                            + H(own) + (rec.condition ? (' (' + H(rec.condition) + ')') : '') + '</div>' : '')
                        + (v.why ? '<div style="font:11.5px Arial;color:#9fb3c8;margin-top:3px;line-height:1.6;">'
                            + H(v.why) + '</div>' : '')
                        + '</div></div>';
                };

                const withCall = rows.filter((x) => ('' + (x.rec.clinsig || '')).trim()).length;

                out.innerHTML = ''
                    + '<div style="padding:13px 15px;border-radius:10px;background:#0a1e3a;'
                    + 'border:1px solid rgba(255,255,255,0.12);">'
                    + '<div style="font:13.5px Arial;color:#e8f0fb;line-height:1.7;">' + H(a.answer || '(no answer)') + '</div>'
                    + '<div style="font:11.5px Arial;color:#6b8299;margin-top:7px;">'
                    + 'asked about ' + rows.length + ' variant' + (rows.length === 1 ? '' : 's') + ' on screen'
                    + (narrowed ? (' matching “' + H(narrowed) + '”') : '')
                    + ' · ' + withCall + ' of them already carry a clinical call'
                    + (capped ? (' · ' + capped + ' more on screen were NOT included, zoom in to cover them') : '')
                    + '</div>'
                    + (a.caveat ? '<div style="font:11.5px Arial;color:#fbbf24;margin-top:7px;">' + H(a.caveat) + '</div>' : '')
                    + '</div>'
                    + (verdicts.length
                        ? ('<div style="margin-top:12px;border-radius:10px;background:#071f3a;'
                            + 'border:1px solid rgba(255,255,255,0.12);overflow:hidden;">'
                            + '<div style="padding:9px 11px;font:700 11px Arial;color:#6b8299;letter-spacing:0.4px;">'
                            + 'PER VARIANT · a model reading the record, not a clinical determination</div>'
                            + verdicts.map(line).join('') + '</div>')
                        : '')
                    + (hitRows.length
                        ? ('<div style="display:flex;gap:10px;margin-top:13px;">'
                            + '<button id="ec-sel" style="cursor:pointer;border-radius:8px;padding:9px 18px;'
                            + 'font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">'
                            + 'Select these ' + hitRows.length + '</button>'
                            + '<button id="ec-again" style="' + btn + '">Ask something else</button></div>')
                        : ('<div style="margin-top:13px;"><button id="ec-again" style="' + btn + '">Ask something else</button></div>'));

                const again = q('#ec-again');
                if (again) again.onclick = () => { out.innerHTML = ''; try { q('#ec-q').value = ''; q('#ec-q').focus(); } catch (e) { } };
                const sel = q('#ec-sel');
                if (sel) sel.onclick = () => {
                    selectVariants(hitRows);
                    done(hitRows.length);
                    result('Selected ' + hitRows.length + ' variant' + (hitRows.length === 1 ? '' : 's') + '.');
                };
            };

            const run = async () => {
                if (busy) return;
                const ask = ('' + q('#ec-q').value).trim();
                if (!ask) { try { q('#ec-q').focus(); } catch (e) { } return; }
                busy = true;
                q('#ec-busy').textContent = 'reading…';
                q('#ec-out').innerHTML = '';
                let r = null;
                try {
                    const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                    r = await exec(window['env']['apiUrl'] + '/py/bio/editor/command.py',
                        em, ask, JSON.stringify(ctx), '');
                } catch (e) {
                    busy = false; q('#ec-busy').textContent = '';
                    q('#ec-out').innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">'
                        + 'Could not read that: ' + H(e && e.message ? e.message : e) + '</div>';
                    return;
                }
                busy = false; q('#ec-busy').textContent = '';
                if (!r || r.status !== 'OK') {
                    q('#ec-out').innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">'
                        + 'Could not read that' + (r && r.error ? (': ' + H(r.error)) : '.') + '</div>';
                    return;
                }
                // The engine hands strings back for object fields on some paths.
                let filter = {};
                try { filter = (typeof r.filter === 'string') ? JSON.parse(r.filter || '{}') : (r.filter || {}); } catch (e) { filter = {}; }
                let unsupported = r.unsupported;
                if (typeof unsupported === 'string') { try { unsupported = JSON.parse(unsupported); } catch (e) { unsupported = unsupported ? [unsupported] : []; } }
                render({ action: r.action, query: r.query, filter: filter, explain: r.explain, unsupported: unsupported }, ask);
            };

            q('#ec-run').onclick = run;
            q('#ec-q').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } };
            try { q('#ec-q').focus(); } catch (e) { }
        });
    })();
}
