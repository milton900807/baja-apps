function (kind, obj, defaults) {

    // Save a table, workbook or timeline as one of the user's own templates.
    //
    //   exec('baja/analytics/templates/publish', 'table', plate)
    //   exec('baja/analytics/templates/publish', 'model', plateTrack)
    //   exec('baja/analytics/templates/publish', 'timeline', plot)
    //   ...optionally with defaults { title, category, description, tags }
    //
    // The template goes to the user's own folder through /analytics-templates/publish and shows
    // under "My templates" in the template browser. The payload is serialized the way the older
    // Publish menus did it (publish-yakro-table / publish-yakro / publish-yakro-plot), so it
    // loads through the same placement code; the difference is where it is stored -- not into
    // baja/templates in the apps code tree, which is read-only on the production server.

    defaults = defaults || {};

    return new Promise(async (resolve) => {
        try {
            if (['table', 'model', 'timeline'].indexOf(kind) < 0) throw new Error('Unknown template kind: ' + kind);
            if (!obj) throw new Error('Nothing selected to save.');
            const api = await exec('baja/analytics/templates/api');

            let categories = [];
            try { categories = (await api.loadIndex()).categories || []; } catch (e) { }
            const catHint = categories.map(c => c.title).join(', ');

            const suggested = defaults.title || (obj && obj.name ? ('' + obj.name).replace(/[_-]+/g, ' ') : '');
            const r = await prompt('Save as my template', [
                'Title',
                { label: 'Category', placeholder: catHint ? 'e.g. ' + catHint : '' },
                { label: 'Description', multiline: true, rows: 3, placeholder: 'What it calculates, and what to fill in first.' },
                { label: 'Tags', placeholder: 'comma separated, e.g. qPCR, plate' },
            ], {
                'Title': suggested,
                'Category': defaults.category || '',
                'Description': defaults.description || '',
                'Tags': Array.isArray(defaults.tags) ? defaults.tags.join(', ') : (defaults.tags || ''),
            }, 460, 420);
            if (!r || !('' + (r['Title'] || '')).trim()) { resolve(null); return; }

            // A category typed as one of the library's titles is stored as its id, so the
            // template sorts with its built-in neighbours; anything else is kept as typed.
            const typed = ('' + (r['Category'] || '')).trim();
            const match = categories.find(c => c.title.toLowerCase() === typed.toLowerCase() || c.id === typed.toLowerCase());

            const payload = kind === 'model' ? api.encode(obj, api.workbookReplacer) : api.encode(obj);
            const t = await api.publish({
                title: ('' + r['Title']).trim(),
                kind: kind,
                category: match ? match.id : (typed || 'mine'),
                description: ('' + (r['Description'] || '')).trim(),
                tags: ('' + (r['Tags'] || '')).split(',').map(s => s.trim()).filter(Boolean),
            }, payload);

            infoPrompt('Saved <b>' + escapeHtml(t.title) + '</b> to My templates. Open it from Templates, Template library.');
            resolve(t);
        } catch (e) {
            infoPrompt('Could not save the template: ' + escapeHtml(e && e.message ? e.message : '' + e));
            resolve(null);
        }
    });

    function escapeHtml(s) {
        return ('' + s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
}
