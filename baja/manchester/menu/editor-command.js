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

        const ctx = {
            tracks: tracks.map((t) => t.name || '(unnamed)').slice(0, 12),
            counts: {
                variants: vrows.length,
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
            }
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
                + ctx.counts.variants + ' variant' + (ctx.counts.variants === 1 ? '' : 's') + ' and '
                + ctx.counts.compounds + ' compound' + (ctx.counts.compounds === 1 ? '' : 's')
                + ' on ' + tracks.length + ' track' + (tracks.length === 1 ? '' : 's') + '.</div></div>'
                + '<div style="margin-left:auto;"><button id="ec-close" style="' + btn + '">Close</button></div>'
                + '</div>'
                + '<div style="padding:18px 20px 22px;">'
                + '<input id="ec-q" placeholder="select all snps" style="' + inp + '"/>'
                + '<div style="display:flex;align-items:center;gap:10px;margin-top:11px;">'
                + '<button id="ec-run" style="cursor:pointer;border-radius:8px;padding:10px 20px;font:700 13px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Read it</button>'
                + '<div id="ec-busy" style="font:12.5px Arial;color:#9fb3c8;"></div></div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:14px;line-height:1.8;">'
                + 'Try: <b>select all snps</b> · <b>select the pathogenic variants</b> · '
                + '<b>remove all snps</b> · <b>select every red compound</b> · '
                + '<b>remove gapmers under 40% GC</b> · <b>clear the selection</b> · <b>fit</b><br>'
                + 'It picks one action from a fixed list and shows you which, with a count, before anything happens. '
                + 'Removing always needs a second click, and undo restores it.'
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
                        + 'It can select or remove variants and compounds, clear either selection, '
                        + 'zoom to the selection, or fit the view. Designing, loading data, editing sequence '
                        + 'and exporting all live in the toolbar menus.</div>' + warn + '</div>';
                    return;
                }

                // A bare verb has no records to count, so it runs on the one click that asked
                // for it. Nothing it does destroys anything and all of it is one keystroke to
                // put back, so a confirmation would only be ceremony.
                if (A.bare) {
                    Promise.resolve(A.run()).then(() => done(0));
                    return;
                }

                const rows = A.scope({ query: r.query, filter: r.filter || {} });
                const what = A.describe({ query: r.query, filter: r.filter || {} });
                const noun = A.noun + (rows.length === 1 ? '' : 's');
                const total = (A.noun === 'variant') ? vrows.length : crows.length;

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
                    + H(A.verb + ' ' + rows.length + ' ' + noun) + '</button>'
                    + '<button id="ec-no" style="' + btn + '">Cancel</button>'
                    + '</div></div>';

                q('#ec-no').onclick = () => { out.innerHTML = ''; try { q('#ec-q').focus(); } catch (e) { } };
                q('#ec-go').onclick = () => { Promise.resolve(A.run(rows)).then(() => done(rows.length)); };
                try { q('#ec-go').focus(); } catch (e) { }
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
