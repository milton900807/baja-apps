function (pt, table, well) {

    // ASK, FROM A CELL.
    //   exec('baja/plate/ops/cell-ask.js', track, table, well)        // the cell menu's first row
    //
    // The table's title bar has an Ask button and the field at the top takes a sentence, but
    // both are a reach from a cell, and both have to be told which cells are meant. Asked
    // from the cell's own menu, the cells are the ones selected, so the prompt needs only
    // the request. It does one of two things, and which is chosen by the first character:
    //
    //   typical monthly cost for each of these     values are filled in   (fill-selection.js)
    //   =fuel plus crew salaries                   a formula is written   (formula-from-words.js)
    //
    // THE "=" MEANS WHAT IT MEANS EVERYWHERE ELSE HERE: a formula is wanted. Without it the
    // answer is a value, typed in as if by hand. The two are kept apart on purpose. A
    // formula goes through checks a value does not need (every table and cell it names, a
    // trial in the engine), and a value written where a formula was expected would be a
    // number that silently stops following its inputs.
    //
    // With several cells selected and an "=", each cell gets its own formula, worked out
    // from its own row: "=quantity times price" down a Total column is a different formula
    // on every row. A formula that is already written out ("=sum(a[1:1][1:9])") is not a
    // description, and goes in as typed, to the selection, the way the field would put it.

    return new Promise(async (resolve) => {
        const track = (pt && pt.plateTrack) ? pt.plateTrack : pt;
        const say = (m, s) => { try { if (track && track.setMessage) track.setMessage(m, s || 9); } catch (e) { } };
        try {
            if (!table) { resolve({ error: 'there is no table to ask about' }); return; }
            let cells = [];
            try { if (typeof table.getSelectedWellsInOrder === 'function') cells = table.getSelectedWellsInOrder() || []; } catch (e) { cells = []; }
            if (!cells.length && well) cells = [well];
            if (!cells.length) { say('Select a cell first.', 3); resolve({ error: 'no cell' }); return; }
            const n = cells.length;

            let r = null;
            try {
                r = await exec('baja/lib/prompt-text.js', {
                    title: n === 1 ? 'Ask about this cell' : ('Ask about these ' + n + ' cells'),
                    message: 'Say what should go in ' + (n === 1 ? 'it' : 'them') + ' and '
                        + (n === 1 ? 'it is' : 'they are') + ' filled in. Start with = to have a formula written instead.',
                    placeholder: n === 1 ? '=fuel plus crew salaries' : 'a typical monthly cost for each of these',
                    value: '',
                    historyKey: 'cell-ask',
                    actions: [{ key: 'go', label: 'GO' }]
                });
            } catch (e) { r = null; }
            const text = ('' + ((r && r.text) || '')).trim();
            if (!text) { resolve({ cancelled: true }); return; }

            // Something to look at while a model is asked: these take seconds.
            let panel = null;
            const busy = async (title) => { try { panel = await exec('baja/lib/working.js', title.length > 90 ? (title.slice(0, 88) + '…') : title, ''); } catch (e) { panel = null; } };
            const idle = () => { try { if (panel) panel.done(); } catch (e) { } panel = null; };

            if (text.charAt(0) !== '=') {
                // ---- values ---------------------------------------------------------------
                await busy('Filling in ' + (n === 1 ? 'the cell' : (n + ' cells')) + ': ' + text);
                let out = null;
                try { out = await exec('baja/plate/ops/fill-selection.js', track, { plate: table, cells: cells, what: text }); }
                catch (e) { out = { error: ('' + (e && e.message ? e.message : e)) }; }
                idle();
                if (out && out.error) say('That did not happen: ' + out.error, 12);
                resolve(out || {});
                return;
            }

            // ---- a formula ----------------------------------------------------------------
            const body = text.slice(1).trim();
            const described = !!body && !/[()\[\]{}]/.test(body) && /[A-Za-z]\w*\s+[A-Za-z]/.test(body.replace(/\b(and|or|not)\b/gi, '+'));
            if (n === 1 || !described) {
                // One cell, or a formula written out: the card that the field at the top
                // uses, told which cell. It knows the quick answers (a total of what is
                // above) and shows its own progress and its own refusals.
                let menus = [];
                try { menus = (track && track.__lastMenubar) ? (track.__lastMenubar() || []) : []; } catch (e) { menus = []; }
                await exec('baja/plate/menu/project-command.js', {
                    menus: menus, pm: track, text: text, cell: n === 1 ? cells[0] : null, table: table.name || '',
                    context: { table: table.name || null, selected_cells: n }, setError: say
                });
                resolve({ asked: text });
                return;
            }

            // Several cells and a description: one formula each, from each cell's own row.
            const MAX = 40;
            const todo = cells.slice(0, MAX);
            await busy('Working out ' + todo.length + ' formulas: ' + text);
            let done = 0, failed = 0, firstWhy = '', example = '';
            for (const w of todo) {
                let out = null;
                try { out = await exec('baja/plate/ops/formula-from-words.js', track, { what: text, cell: w, table: table.name || '' }); }
                catch (e) { out = { error: ('' + (e && e.message ? e.message : e)) }; }
                if (out && out.formula) { done++; if (!example) example = out.formula; }
                else { failed++; if (!firstWhy) firstWhy = (out && out.error) || 'no formula came back'; }
            }
            idle();
            say((done ? (done + ' formula' + (done === 1 ? '' : 's') + ' written, for example ' + example.slice(0, 70)) : 'No formula was written')
                + (failed ? ('. ' + failed + ' cell' + (failed === 1 ? ' was' : 's were') + ' left as ' + (failed === 1 ? 'it was' : 'they were') + ': ' + firstWhy.slice(0, 140)) : '')
                + (n > MAX ? ('. Only the first ' + MAX + ' selected cells were done') : ''), 12);
            resolve({ formulas: done, failed: failed || undefined, example: example || undefined });
        } catch (e) {
            const m = ('' + (e && e.message ? e.message : e));
            say('Could not do that: ' + m);
            resolve({ error: m });
        }
    });
}
