function (table, pt) {

    // ASKING A TABLE FOR SOMETHING, FROM ITS OWN TITLE BAR.
    //
    // The same button the timeline carries, for the same reason: the request is made while
    // pointing at the thing it is about, so the thing does not have to be inferred from what
    // happens to be selected. One module per kind of object rather than one general one,
    // because what goes into the request differs -- a timeline sends its dates, a table
    // sends its shape and what is selected in it, and both only matter to their own kind.
    //
    // WHAT IS SELECTED GOES WITH IT. Half of what a table can be asked ("make these cells
    // dollars", "fill this column") is about the selection, not the table, and an operation
    // that reads the selection gets a different answer depending on when it is read. Saying
    // it in the request means the user can see what it was acting on.

    return new Promise(async (resolve) => {
        const track = (pt && pt.plateTrack) ? pt.plateTrack : pt;
        const say = (m) => { try { if (track && track.setMessage) track.setMessage(m, 8); } catch (e) { } };
        try {
            if (!table) { resolve({ error: 'there is no table to ask about' }); return; }
            const name = ('' + ((table.name) || '')).trim();

            const cols = (table.wells && table.wells.length) || 0;
            const rows = (cols && table.wells[0] && table.wells[0].length) || 0;
            let picked = 0;
            try {
                const sel = (typeof table.getSelectedWellsInOrder === 'function')
                    ? (table.getSelectedWellsInOrder() || []) : [];
                picked = sel.length;
            } catch (e) { picked = 0; }

            const shape = (cols && rows) ? (cols + ' columns by ' + rows + ' rows') : 'empty';
            const about = shape + (picked ? (', ' + picked + ' cell' + (picked === 1 ? '' : 's')
                + ' selected') : ', nothing selected');

            let r = null;
            try {
                r = await exec('baja/lib/prompt-text.js', {
                    title: 'Ask about ' + (name || 'this table'),
                    message: 'This table is ' + about + '. Say what you want done with it, or with '
                        + 'the cells selected in it.',
                    placeholder: 'make the selected cells dollars',
                    value: '',
                    historyKey: 'table-ask',
                    actions: [{ key: 'go', label: 'GO' }]
                });
            } catch (e) { r = null; }

            const text = ('' + ((r && r.text) || '')).trim();
            if (!text) { resolve({ cancelled: true }); return; }

            // THE TABLE THIS WAS ASKED FROM, left where the operations can find it, so one
            // that takes a table name resolves to this one even when the name is not said.
            try { if (track) track.__askedTable = table; } catch (e) { }

            let menus = [];
            try { menus = (track && track.__lastMenubar) ? (track.__lastMenubar() || []) : []; } catch (e) { menus = []; }

            await exec('baja/plate/menu/project-command.js', {
                menus: menus,
                pm: track,
                text: text,
                context: {
                    // project-command.js puts this in front of the request itself, so a word
                    // like "sort" is read as being about this table and not about the project.
                    asked_from: { type: 'table', name: name || null, about: about },
                    table: name || null,
                    selected_cells: picked,
                    showing: 'a table'
                },
                setError: say
            });
            resolve({ asked: text });
        } catch (e) {
            const m = ('' + (e && e.message ? e.message : e));
            say('Could not read that: ' + m);
            resolve({ error: m });
        }
    });
}
