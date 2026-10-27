function (pm, entry) {

    // Put one template from the library onto the current Baja Analytics canvas.
    //
    //   await exec('baja/analytics/templates/apply', pm, entry)
    //
    // `entry` is a row from the library index (api.loadIndex). Tables and timelines go through
    // the same placement code the old Tables and Timelines menus used (baja/draw/place-table and
    // place-timeline); workbooks go through place-model.js. Those two placement functions never
    // resolve their promise, so they are started here and not awaited.

    return new Promise(async (resolve, reject) => {
        const track = pm && pm.plateTrack;
        try {
            if (!track) throw new Error('Open a Baja Analytics workbook first.');
            if (!entry) throw new Error('No template selected.');
            const api = await exec('baja/analytics/templates/api');
            track.setMessage(' Loading ' + (entry.title || entry.id) + '… ');
            const rs = await api.loadItem(entry);

            if (entry.kind === 'table') {
                exec('baja/draw/place-table', track, null, entry.spath || 'mine', entry.name || entry.id, null, rs);
            } else if (entry.kind === 'timeline') {
                exec('baja/draw/place-timeline', track, null, entry.spath || 'mine', entry.name || entry.id, rs);
            } else if (entry.kind === 'model') {
                await exec('baja/analytics/templates/place-model', pm, rs.rule_value, entry.title || entry.id);
            } else {
                throw new Error('Unknown template kind: ' + entry.kind);
            }
            resolve(true);
        } catch (e) {
            const msg = (e && e.message) ? e.message : ('' + e);
            try { track && track.setMessage(' ' + msg + ' ', 4); } catch (e2) { }
            try { infoPrompt('Could not open the template: ' + msg.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))); } catch (e2) { }
            resolve(false);
        }
    });
}
