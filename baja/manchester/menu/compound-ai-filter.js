function (graph, selectedTrack) {

    // FILTER THE COMPOUNDS BY DESCRIBING THEM.
    //   await exec('baja/manchester/menu/compound-ai-filter.js', graph, track);
    //
    // "the self-complementary ones", "anything under 40% GC", "gapmers with a Tm over 55".
    // The model never sees a compound and never judges one. It reads the sentence and fills
    // the same fields the Select-by-criteria dialog has; the editor then evaluates those
    // fields itself, with baja/bio/compound-filter.js, which is also what the dialog uses.
    //
    // That split is the whole design. It makes the answer checkable -- the filter comes back
    // in words, with a count, before anything happens -- and it makes it stable, because the
    // same sentence on the same design gives the same compounds every time. A model asked to
    // judge two hundred compounds would do neither, and "self-complementary" would quietly
    // become its opinion of the sequence rather than the note the scorer wrote.
    //
    // Nothing is applied without a confirmation naming the count, and remove is never the
    // default: selecting is reversible and removing is the one that destroys work.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const t = selectedTrack;
        if (!t) { say('No track selected.'); return 0; }
        const list = (t.oligos || []).map((o) => ({ o: o, t: t }));
        if (!list.length) { say('There are no compounds on ' + (t.name || 'this track') + '.'); return 0; }

        const F = await exec('baja/bio/compound-filter.js');

        const va = await prompt('Filter compounds by description',
            ['What to pick out'],
            { 'What to pick out': 'the self-complementary ones' }, 560, 300);
        if (!va) return 0;
        const ask = ('' + (va['What to pick out'] || '')).trim();
        if (!ask) return 0;

        // WHAT THIS DESIGN ACTUALLY SPANS, sent with the request so a relative phrase lands
        // on these numbers. "The low-scoring ones" against a set scoring 20 to 46 means
        // something different from the same words against one scoring -30 to 5, and a model
        // given no numbers has to invent a threshold that belongs to neither.
        const span = (get) => {
            let lo = Infinity, hi = -Infinity, seen = 0;
            for (const r of list) {
                const v = get(r.o);
                if (v == null) continue;
                seen++; lo = Math.min(lo, v); hi = Math.max(hi, v);
            }
            return seen ? [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10] : null;
        };
        const ctx = {
            counts: { compounds: list.length, flagged: list.filter((r) => F.isRed(r.o)).length },
            spans: { score: span(F.scoreOf), gc: span(F.gcOf), tm: span(F.tmOf), length: span(F.lenOf) }
        };

        say('Reading the request…');
        let r = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); say('' + m); } catch (e) { } });
            r = await exec(window['env']['apiUrl'] + '/py/bio/compounds/filter-prompt.py',
                em, ask, JSON.stringify(ctx), '');
        } catch (e) {
            result('Could not read that request: ' + (e && e.message ? e.message : e));
            return 0;
        }
        if (!r || r.status !== 'OK') {
            result('Could not read that request' + (r && r.error ? (': ' + r.error) : '.'));
            return 0;
        }

        let spec = {};
        try { spec = (typeof r.filter === 'string') ? JSON.parse(r.filter) : (r.filter || {}); } catch (e) { spec = {}; }
        const unsupported = Array.isArray(r.unsupported) ? r.unsupported
            : (typeof r.unsupported === 'string' ? (() => { try { return JSON.parse(r.unsupported); } catch (e) { return []; } })() : []);
        const action = (r.action === 'remove') ? 'remove' : 'select';

        if (!Object.keys(spec).length) {
            result('That request does not map onto anything this filter can measure'
                + (unsupported.length ? (': ' + unsupported.join('; ')) : '')
                + '. The fields it has are the score band, the scorer’s own flags, and ranges '
                + 'on score, GC, Tm and length.');
            return 0;
        }

        const hits = F.match(list, spec);
        // IN THE FILTER'S WORDS, not the model's. `explain` is prose a model wrote and may
        // describe a field that did not survive the cleaning on the way here; describe()
        // reads the filter that will actually run. The model's sentence is shown after it,
        // where a difference between the two is visible rather than hidden.
        const asFilter = F.describe(spec);
        const head = hits.length + ' of ' + list.length + ' — ' + asFilter;

        if (!hits.length) {
            result('Nothing matches ' + asFilter + ' on ' + (t.name || 'this track') + '.'
                + (unsupported.length ? (' Not expressible: ' + unsupported.join('; ') + '.') : ''));
            return 0;
        }

        // Captions, not rows: these state what was understood and are not actions. With a
        // no-op click they drew as buttons, so the menu looked like six things to press and
        // only two of them did anything.
        const menu = [
            { label: head, header: true },
            { label: 'from: “' + ask + '”', header: true }
        ];
        if (r.explain) menu.push({ label: 'read as: ' + r.explain, header: true });
        for (const u of unsupported) {
            menu.push({ label: '⚠ not expressible: ' + u, header: true });
        }
        menu.push({
            label: 'Select these ' + hits.length,
            move: () => { },
            click: () => {
                try { graph.showSideMenu(null); } catch (e) { }
                try {
                    graph.setSelectedCompounds(hits.map((h) => ({ o: h.o, t: h.t })));
                    graph.currentShape = null;
                    if (graph.wake) graph.wake();
                    result('Selected ' + hits.length + ' of ' + list.length + ': ' + asFilter + '.');
                } catch (e) { result('Could not change the selection: ' + e); }
            }
        });
        menu.push({
            // Spelled out, and never the pre-selected row. Removal is the one action here
            // that destroys work, so the count and the word "remove" are in the label rather
            // than inferred from a badge, and history is pushed first so undo restores it.
            label: 'Remove these ' + hits.length + ' from ' + (t.name || 'the track'),
            move: () => { },
            click: () => {
                try { graph.showSideMenu(null); } catch (e) { }
                try {
                    graph.pushOntoHistory();
                    const doomed = new Set(hits.map((h) => h.o));
                    const kept = (t.oligos || []).filter((o) => !doomed.has(o));
                    const n = (t.oligos || []).length - kept.length;
                    t.oligos = kept;
                    if (graph.wake) graph.wake();
                    result('Removed ' + n + ' compound' + (n === 1 ? '' : 's') + ': ' + asFilter
                        + '. Undo restores them.');
                } catch (e) { result('Could not remove: ' + e); }
            }
        });
        menu.push({ label: '‹ Cancel', move: () => { }, click: () => { try { graph.showSideMenu(null); } catch (e) { } } });

        // The action the request asked for goes first, so the obvious click is the one that
        // was meant -- but both are always offered, and neither happens until one is clicked.
        if (action === 'remove') {
            const i = menu.findIndex((m) => ('' + m.label).indexOf('Remove these') === 0);
            if (i > 0) menu.splice(menu.length - 2, 0, menu.splice(i, 1)[0]);
        }
        if (graph.openMenuAtPointer) graph.openMenuAtPointer(menu, 'Filter');
        else graph.showSideMenu(menu);
        return hits.length;
    })();
}
