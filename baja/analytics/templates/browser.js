function (pm, graph, opts) {

    // The Baja Analytics template library: browse, search and open templates.
    //
    //   exec('baja/analytics/templates/browser', pm, graph)
    //   exec('baja/analytics/templates/browser', pm, graph, { panel: 'mainPanel', category: 'lab-analysis' })
    //
    // One list, in the panel the old Templates menus used, replacing the Tables / Models tree
    // code that was pasted into baja-analytics.js, apps.js and baja-project.js. Its content comes
    // from baja/analytics-templates/index.json (curated in catalog.json) plus the signed-in
    // user's own published templates, so every template has a title, a description and a
    // preview of what is inside before anyone opens it.
    //
    //   opts.panel        layout slot to render in (default 'mainPanel')
    //   opts.category     open straight into one category
    //   opts.showRetired  also list templates the catalog has retired

    opts = opts || {};
    const panel = opts.panel || 'mainPanel';
    const KIND = { table: 'Table', model: 'Workbook', timeline: 'Timeline' };
    const STATUS_ORDER = { ready: 0, 'needs-cleanup': 1, retired: 2 };

    let api = null;
    let lib = { categories: [], templates: [], offline: false };
    const history = [];   // views to go Back to

    const say = (m, secs) => { try { pm && pm.plateTrack && pm.plateTrack.setMessage(' ' + m + ' ', secs); } catch (e) { } };
    const close = () => { try { CurrentLayout.reset(panel); } catch (e) { } };

    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

    function summaryLine(t) {
        const s = t.summary || {};
        if (t.kind === 'timeline') {
            const parts = [plural(s.milestones || 0, 'milestone')];
            if (s.range) parts.push(s.range[0] + ' to ' + s.range[1]);
            return parts.join(', ');
        }
        if (t.kind === 'table' && s.preview && s.preview[0]) {
            const p = s.preview[0];
            const head = (p.header || []).slice(0, 5).join(', ');
            return plural(p.rows || 0, 'row') + ' by ' + plural(p.cols || 0, 'column') + (head ? ': ' + head : '');
        }
        const names = (s.preview || []).map(p => p.name).filter(Boolean).slice(0, 5).join(', ');
        return plural(s.tables || 0, 'table') + (s.formulas ? ', ' + plural(s.formulas, 'formula') : '')
            + (names ? ': ' + names : '');
    }

    function describe(t) {
        const bits = [KIND[t.kind] || t.kind];
        if (t.source === 'mine') bits.push('yours' + (t.updated ? ', updated ' + ('' + t.updated).slice(0, 10) : ''));
        const sl = summaryLine(t);
        if (sl) bits.push(sl);
        let d = bits.join(' · ');
        if (t.description) d += '. ' + t.description;
        if (t.status === 'needs-cleanup') d += ' (Needs cleanup' + (t.notes ? ': ' + t.notes : '') + ')';
        if (t.status === 'retired') d += ' (Retired' + (t.notes ? ': ' + t.notes : '') + ')';
        return d;
    }

    function visible(list) {
        return list.filter(t => opts.showRetired || t.status !== 'retired');
    }

    function sortTemplates(list) {
        return list.slice().sort((a, b) =>
            ((STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0))
            || ('' + a.title).localeCompare('' + b.title));
    }

    // A view is a list of rows { label, desc, run }. Labels must be unique within a view (the
    // list widget keys descriptions by label), so a repeated title gets a number.
    function render(rows, withBack) {
        const used = {};
        const list = [];
        for (const r of rows) {
            let label = r.label;
            used[label] = (used[label] || 0) + 1;
            if (used[label] > 1) label = label + ' (' + used[label] + ')';
            list.push(Object.assign({}, r, { label }));
        }
        if (withBack) list.push({ label: 'Back…', desc: '', run: () => { const prev = history.pop(); if (prev) prev(); } });
        list.push({ label: 'Close', desc: '', run: close });

        const descs = {};
        for (const r of list) if (r.desc) descs[r.label] = r.desc;

        CurrentLayout.clearComponent(panel);
        CurrentLayout.setComponent(panel, {
            wid: 'selection-list',
            data: {
                single_selection: true,
                singleSelect: true,
                show_button: false,
                listItems: list.map(r => r.label),
                contentItems: descs,
                button_function: createIonFunction(async (items) => {
                    const row = list.find(r => r.label === (items && items[0]));
                    if (row && row.run) await row.run();
                }),
            },
        });
    }

    // Move to a new view, remembering how to get back to the current one.
    function go(current, next) { history.push(current); next(); }

    function templateRows(list) {
        return sortTemplates(visible(list)).map(t => ({
            label: t.title,
            desc: describe(t),
            run: async () => {
                close();
                await exec('baja/analytics/templates/apply', pm, t);
            },
        }));
    }

    function showRoot() {
        const rows = [];
        const mine = lib.templates.filter(t => t.source === 'mine');
        if (mine.length) {
            rows.push({
                label: '[My templates]/',
                desc: plural(mine.length, 'template') + ' you published.',
                run: () => go(showRoot, showMine),
            });
        }
        for (const c of lib.categories) {
            const n = visible(lib.templates.filter(t => t.source !== 'mine' && t.category === c.id)).length;
            if (!n) continue;
            rows.push({
                label: '[' + c.title + ']/',
                desc: plural(n, 'template') + (c.description ? '. ' + c.description : ''),
                run: () => go(showRoot, () => showCategory(c)),
            });
        }
        rows.push({
            label: 'Search templates…',
            desc: 'Find a template by title, tag, description or table name.',
            run: () => search(showRoot),
        });
        if (lib.offline) {
            rows.push({ label: 'About this list', desc: 'This server has not been updated for published templates yet, so only the built-in library is shown.', run: () => { } });
        }
        render(rows, false);
    }

    function showCategory(c) {
        const list = lib.templates.filter(t => t.source !== 'mine' && t.category === c.id);
        render(templateRows(list), true);
    }

    function showMine() {
        const mine = lib.templates.filter(t => t.source === 'mine');
        const rows = templateRows(mine);
        rows.push({
            label: 'Delete one of my templates…',
            desc: 'Remove a template you published. Built-in templates cannot be deleted here.',
            run: () => go(showMine, showDelete),
        });
        render(rows, true);
    }

    function showDelete() {
        const mine = sortTemplates(lib.templates.filter(t => t.source === 'mine'));
        render(mine.map(t => ({
            label: 'Delete: ' + t.title,
            desc: describe(t),
            run: () => {
                exec('baja/lib/confirm.js', 'Delete the template "' + t.title + '"? This cannot be undone.', async () => {
                    try {
                        await api.remove(t.id);
                        lib.templates = lib.templates.filter(x => !(x.source === 'mine' && x.id === t.id));
                        say('Deleted ' + t.title, 2);
                    } catch (e) {
                        say('Could not delete: ' + (e && e.message ? e.message : e), 4);
                    }
                    history.length = 0;
                    showRoot();
                }, 'Delete');
            },
        })), true);
    }

    async function search(back) {
        const r = (await prompt('Search templates', ['Search for'], { 'Search for': '' }, 380, 200)) || {};
        const q = ('' + (r['Search for'] || '')).trim().toLowerCase();
        if (!q) return;
        const words = q.split(/\s+/);
        const hay = t => [
            t.title, t.description, (t.tags || []).join(' '), t.category,
            ...(((t.summary || {}).preview) || []).map(p => typeof p === 'string' ? p : [p.name, ...(p.header || [])].join(' ')),
        ].join(' ').toLowerCase();
        const hits = visible(lib.templates).filter(t => { const h = hay(t); return words.every(w => h.indexOf(w) >= 0); });
        history.push(back);
        if (!hits.length) {
            render([{ label: 'No templates match "' + q + '"', desc: 'Try a shorter word, a tag such as qPCR, or a table name.', run: () => search(back) }], true);
            return;
        }
        render(templateRows(hits), true);
    }

    return new Promise(async (resolve) => {
        try {
            say('Loading templates…');
            api = await exec('baja/analytics/templates/api');
            lib = await api.loadIndex();
            say('', 0);
            const start = opts.category && lib.categories.find(c => c.id === opts.category);
            if (start) { history.push(showRoot); showCategory(start); } else showRoot();
            resolve(true);
        } catch (e) {
            say('Templates are not available: ' + (e && e.message ? e.message : e), 4);
            resolve(false);
        }
    });
}
