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
    // With an "=" and a description, each selected cell gets its own formula, worked out
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

            // WHAT IS HAPPENING, WHILE IT HAPPENS, AND HOW IT ENDED.
            //
            // The first version put a panel up and took it down, and reported the outcome
            // in the corner line. From the chair that was: a prompt closes, something
            // flickers, and the table may or may not look different. So the panel now goes
            // up the moment the prompt closes, says what is being asked and for how many
            // cells, counts through them when there are several, and ends by saying what was
            // done (a tick, and the count) or what was not (the reason, kept on screen until
            // it is closed). The corner line still gets the same words, for afterwards.
            let panel = null;
            const short = (x) => (x.length > 90 ? (x.slice(0, 88) + '\u2026') : x);
            const busy = async (title, detail) => { try { panel = await exec('baja/lib/working.js', short(title), detail || ''); } catch (e) { panel = null; } };
            const step = (m) => { try { if (panel && panel.step) panel.step(m); } catch (e) { } };
            const good = (m) => { say(m, 10); try { if (panel && panel.finish) panel.finish(m); else if (panel) panel.done(); } catch (e) { } panel = null; };
            const bad = (m) => { say('That did not happen: ' + m, 12); try { if (panel && panel.fail) panel.fail(m); else if (panel) panel.done(); } catch (e) { } panel = null; };
            const cellsWord = (k) => (k === 1 ? 'the cell' : (k + ' cells'));

            if (text.charAt(0) !== '=') {
                // ---- values ---------------------------------------------------------------
                await busy('Filling in ' + cellsWord(n), '\u201c' + short(text) + '\u201d \u2014 asking for a value for ' + (n === 1 ? 'it' : 'each'));
                let out = null;
                try { out = await exec('baja/plate/ops/fill-selection.js', track, { plate: table, cells: cells, what: text }); }
                catch (e) { out = { error: ('' + (e && e.message ? e.message : e)) }; }
                if (out && out.error) bad(out.error);
                else good((out.filled || 0) + ' cell' + (out.filled === 1 ? '' : 's') + ' filled in'
                    + (out.left_alone ? ('; ' + out.left_alone + ' left as ' + (out.left_alone === 1 ? 'it was' : 'they were') + (out.note ? (' (' + out.note + ')') : '')) : '')
                    + (out.formulas_skipped ? ('; ' + out.formulas_skipped + ' holding a formula not touched') : '')
                    + '. Undo puts ' + (out.filled === 1 ? 'it' : 'them') + ' back.');
                resolve(out || {});
                return;
            }

            // ---- a formula ----------------------------------------------------------------
            const body = text.slice(1).trim();
            const described = !!body && !/[()\[\]{}]/.test(body) && /[A-Za-z]\w*\s+[A-Za-z]/.test(body.replace(/\b(and|or|not)\b/gi, '+'));
            if (!described) {
                // A formula written out: the card that the field at the top uses. It enters
                // it as typed, to the selection, and shows its own refusal if there is one.
                let menus = [];
                try { menus = (track && track.__lastMenubar) ? (track.__lastMenubar() || []) : []; } catch (e) { menus = []; }
                await exec('baja/plate/menu/project-command.js', {
                    menus: menus, pm: track, text: text, cell: n === 1 ? cells[0] : null, table: table.name || '',
                    context: { table: table.name || null, selected_cells: n }, setError: say
                });
                resolve({ asked: text });
                return;
            }

            // A description: one formula for each cell, from that cell's own row. A total
            // (or average, smallest, largest, count) of what is above needs no model.
            const low = body.toLowerCase();
            const how = /\b(average|mean|avg)\b/.test(low) ? 'average'
                : /\b(min|minimum|smallest|lowest|least)\b/.test(low) ? 'min'
                : /\b(max|maximum|largest|highest|biggest|most)\b/.test(low) ? 'max'
                : (/\b(count|number of)\b/.test(low) || /\bhow many\b/.test(low)) ? 'count'
                : /\b(sum|total|add|adds|added)\b/.test(low) ? 'sum' : '';
            const above = !!how && /\b(above|column)\b/.test(low);

            const MAX = 40;
            const todo = cells.slice(0, MAX);
            await busy(todo.length === 1 ? 'Working out a formula' : ('Working out ' + todo.length + ' formulas'),
                '\u201c' + short(text) + '\u201d');
            let done = 0, failed = 0, firstWhy = '', example = '';
            for (let i = 0; i < todo.length; i++) {
                const w = todo[i];
                if (todo.length > 1) step('\u201c' + short(text) + '\u201d \u2014 cell ' + (i + 1) + ' of ' + todo.length + (done ? (', ' + done + ' written') : ''));
                let out = null;
                try {
                    out = above
                        ? await exec('baja/plate/ops/sum-above.js', track, { how: how, cell: w, table: table.name || '' })
                        : await exec('baja/plate/ops/formula-from-words.js', track, { what: text, cell: w, table: table.name || '' });
                } catch (e) { out = { error: ('' + (e && e.message ? e.message : e)) }; }
                if (out && out.formula) { done++; if (!example) example = out.formula; }
                else { failed++; if (!firstWhy) firstWhy = (out && out.error) || 'no formula came back'; }
            }
            const tail = (failed ? ((done ? '; ' : '') + failed + ' cell' + (failed === 1 ? '' : 's') + ' left as ' + (failed === 1 ? 'it was' : 'they were') + ': ' + firstWhy.slice(0, 160)) : '')
                + (n > MAX ? ('. Only the first ' + MAX + ' selected cells were done') : '');
            if (!done) bad(firstWhy.slice(0, 220) + (n > MAX ? ('. Only the first ' + MAX + ' selected cells were tried') : ''));
            else good((done === 1 ? 'The formula is written: ' : (done + ' formulas written, for example ')) + example.slice(0, 80) + tail + '. Undo puts ' + (done === 1 ? 'it' : 'them') + ' back.');
            resolve({ formulas: done, failed: failed || undefined, example: example || undefined });
        } catch (e) {
            const m = ('' + (e && e.message ? e.message : e));
            say('Could not do that: ' + m);
            resolve({ error: m });
        }
    });
}
