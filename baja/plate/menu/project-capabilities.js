function () {

    // WHAT THE PROJECT CAN DO WITH ARGUMENTS IN HAND.
    //
    // The menubar is the catalogue for everything else, and for most requests it is the
    // right one: nearly every item here opens a dialog that asks its own questions, so
    // "import a plate from a spreadsheet" is answered by opening Import. But some requests
    // arrive with the answer to that dialog's question already in them -- "a table with two
    // rows and four columns" -- and the dialog cannot accept it. Draw > Table asks for a
    // name and then takes the size from how far you drag.
    //
    // So: an operation if one can carry the request out as stated; otherwise the menu item
    // that opens the place it is done. Doing it beats opening the door to it, and opening
    // the door beats refusing.
    //
    // THE MODULE PATH LIVES HERE, NEVER IN THE ANSWER. The model returns a NAME from this
    // list and arguments for its declared parameters. Every file under baja/ is exec-able by
    // path, so an answer that could carry a path would be a shell on the user's unsaved
    // work. The name is looked up in this table and nothing else is ever run.

    const LIST = [
        {
            name: 'new_table',
            summary: 'add a new empty table of a given size to the project',
            module: 'baja/plate/ops/new-table.js',
            params: {
                rows: { type: 'number', min: 1, max: 500, required: true,
                    about: 'how many rows of cells' },
                cols: { type: 'number', min: 1, max: 200, required: true,
                    about: 'how many columns of cells' },
                name: { type: 'string', default: 'a name the project picks',
                    about: 'what to call it, only if the request names it; otherwise leave it out '
                        + 'and the project names it' }
            }
        }
        ,
        {
            name: 'set_column_values',
            summary: 'write a list of values down one column of a table, from the top',
            module: 'baja/plate/ops/set-column-values.js',
            params: {
                values: { type: 'string[]', required: true, max: 500,
                    about: 'the values, in order, one per row' },
                // NOT REQUIRED, AND THAT IS NOT THE SAME AS LETTING THE MODEL GUESS ONE.
                // "insert from top to bottom: cogs, employees, product" says the direction
                // and never names a column, and refusing that is pedantry: the first column
                // is what it means. The default belongs to the operation, is written down
                // here, and is shown in the preview before anything runs -- so the user sees
                // "column 0 (the first)" and presses GO or does not. A model filling in a
                // column nobody mentioned would be the other thing, and is still refused.
                column: { type: 'string', default: '0, the first column',
                    about: 'which column: its number counting from 0, or its letter (A, B, C). '
                        + 'Leave it out when the request does not name one: it means the first '
                        + 'column. Never guess a different column' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' },
                start_row: { type: 'number', min: 0, max: 5000, default: '0, the top row',
                    about: 'the row to start at, counting from 0; leave it out for the top' }
            }
        },
        {
            name: 'new_timeline',
            summary: 'add a timeline covering a range of dates',
            module: 'baja/plate/ops/new-timeline.js',
            params: {
                start: { type: 'string', required: true,
                    about: 'the first date, as YYYY-MM-DD. Work it out from today\u2019s date in '
                        + 'the context: "now" and "today" mean that date' },
                end: { type: 'string', required: true,
                    about: 'the last date, as YYYY-MM-DD. Work it out from today\u2019s date in '
                        + 'the context: "the end of the year" means 31 December of that year, '
                        + '"the end of the month" the last day of that month' }
            }
        },
        {
            name: 'derive_from_new_table',
            summary: 'make a new table the shape of the SELECTED cells and point those cells at '
                + 'it by formula, so their values come from it',
            module: 'baja/plate/ops/derive-from-new-table.js',
            params: {
                name: { type: 'string', default: 'the user is asked for one',
                    about: 'what to call the new table, if the request says it. Leave it out '
                        + 'when it does not: the user is asked. Never invent a name' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table the selected cells are in, if the request names it' }
            }
        },
        {
            name: 'format_cells',
            summary: 'change how the SELECTED cells are shown: as money, or as plain numbers',
            module: 'baja/plate/ops/format-cells.js',
            params: {
                style: { type: 'enum', values: ['dollar', 'plain'], required: true,
                    about: 'dollar shows the number as money ($1,200.00); plain takes that '
                        + 'off. It changes how the number is shown, never the number' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'rearrange_column',
            summary: 'reverse, sort, close the gaps in, de-duplicate, fill down, tidy or clear '
                + 'the values already in one column',
            module: 'baja/plate/ops/rearrange-column.js',
            params: {
                action: { type: 'enum', required: true,
                    values: ['reverse', 'sort_asc', 'sort_desc', 'compact', 'dedupe',
                        'fill_down', 'trim', 'clear'],
                    about: 'reverse turns the column upside down; sort_asc and sort_desc sort '
                        + 'it (as numbers when every value is one); compact pulls the values '
                        + 'up so there are no gaps; dedupe keeps the first of each repeat; '
                        + 'fill_down copies each value into the empty cells under it; trim '
                        + 'tidies the spacing; clear empties the column' },
                column: { type: 'string', default: '0, the first column',
                    about: 'which column: its number counting from 0, or its letter. Leave it '
                        + 'out when the request does not name one: it means the first column' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'move_column',
            summary: 'copy one column onto another, swap two columns, or move a column to a '
                + 'different position',
            module: 'baja/plate/ops/move-column.js',
            params: {
                action: { type: 'enum', values: ['copy', 'swap', 'move'], required: true,
                    about: 'copy writes it onto the other column; swap exchanges the two; move '
                        + 'takes it out and puts it back at that position, sliding the rest over' },
                column: { type: 'string', required: true,
                    about: 'the column to act on: its number counting from 0, or its letter' },
                to: { type: 'string', required: true,
                    about: 'the other column, or for move the position it should end up at' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'shift_column_values',
            summary: 'move the values already in a column up or down by a number of rows',
            module: 'baja/plate/ops/shift-column-values.js',
            params: {
                by: { type: 'number', min: 1, max: 5000, required: true,
                    about: 'how many rows to move them' },
                direction: { type: 'enum', values: ['down', 'up'], required: true,
                    about: 'which way to move them' },
                column: { type: 'string', default: '0, the first column',
                    about: 'which column: its number counting from 0, or its letter. Leave it '
                        + 'out when the request does not name one: it means the first column' },
                table: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' }
            }
        },
        {
            name: 'rename_table',
            summary: 'change a table\u2019s name, and every formula that refers to it',
            module: 'baja/plate/ops/rename-table.js',
            params: {
                to: { type: 'string', required: true,
                    about: 'the new name. Letters, digits and underscores, starting with a '
                        + 'letter, because formulas address a table by this name' },
                from: { type: 'string', default: 'the selected table',
                    about: 'the table\u2019s current name, if the request says it; leave it out '
                        + 'to rename the selected table' }
            }
        }
    ];

    const byName = (n) => LIST.filter((c) => c.name === ('' + n).trim())[0] || null;

    // The declarations only: what goes to the model. No module paths, no functions.
    const catalogue = () => LIST.map((c) => {
        const out = { name: c.name, summary: c.summary, params: {} };
        for (const k of Object.keys(c.params || {})) {
            const p = c.params[k];
            const d = { type: p.type };
            if (p.about) d.about = p.about;
            if (p.required) d.required = true;
            // SAY THE DEFAULT OUT LOUD. A parameter with no `required` flag is optional, but
            // a model reading a catalogue of operations treats a missing value as a reason to
            // refuse unless it can see what happens without one. "Move the values to the top"
            // names no column and was refused for exactly that.
            if (p.default != null) d.default = p.default;
            if (p.values) d.values = p.values;
            if (p.min != null) d.min = p.min;
            if (p.max != null) d.max = p.max;
            out.params[k] = d;
        }
        return out;
    });

    // A BAD ARGUMENT INVALIDATES THE OPERATION; IT IS NOT DROPPED AND IT IS NOT CLAMPED.
    // Dropping a required size would build a table of the default size and report it as the
    // one that was asked for, and clamping 400 columns to 200 does the same thing more
    // quietly. Either way the user is told something untrue about what just happened. An
    // unrecognised argument NAME is different and is simply dropped: that is a model adding
    // something the operation has no notion of, and without it the operation still does what
    // was asked.
    const validate = (name, rawArgs) => {
        const c = byName(name);
        if (!c) return { ok: false, problem: 'no such operation: ' + (name || '(none)') };
        const specs = c.params || {};
        const raw = (rawArgs && typeof rawArgs === 'object') ? rawArgs : {};
        const args = {};
        const dropped = [];
        for (const k of Object.keys(raw)) {
            const spec = specs[k];
            if (!spec) { dropped.push(k); continue; }
            const v = raw[k];
            if (v == null || v === '') continue;
            if (spec.type === 'number') {
                const n = Number(v);
                if (!isFinite(n) || Math.floor(n) !== n) {
                    return { ok: false, problem: k + ' must be a whole number, not ' + JSON.stringify(v) };
                }
                if (spec.min != null && n < spec.min) {
                    return { ok: false, problem: k + ' must be at least ' + spec.min };
                }
                if (spec.max != null && n > spec.max) {
                    return { ok: false, problem: k + ' can be at most ' + spec.max + ', and ' + n + ' was asked for' };
                }
                args[k] = n;
            } else if (spec.type === 'string') {
                const t = ('' + v).trim();
                if (t) args[k] = t.slice(0, 120);
            } else if (spec.type === 'enum') {
                // Case does not matter, but membership does: an unrecognised value is a
                // refusal, never the first item in the list. "shift them leftward" quietly
                // becoming "down" is the kind of help nobody wants.
                const t = ('' + v).trim().toLowerCase();
                const hit = (spec.values || []).filter((x) => ('' + x).toLowerCase() === t)[0];
                if (!hit) {
                    return { ok: false, problem: k + ' must be one of '
                        + (spec.values || []).join(', ') + ', not ' + JSON.stringify(v) };
                }
                args[k] = hit;
            } else if (spec.type === 'string[]') {
                if (!Array.isArray(v)) {
                    return { ok: false, problem: k + ' must be a list' };
                }
                const list = v.map((x) => (x == null ? '' : ('' + x)).trim()).filter((x) => x !== '');
                if (!list.length) {
                    return { ok: false, problem: k + ' is empty' };
                }
                if (spec.max != null && list.length > spec.max) {
                    return { ok: false, problem: k + ' has ' + list.length + ' items and at most '
                        + spec.max + ' can be set at once' };
                }
                args[k] = list.map((x) => x.slice(0, 400));
            } else {
                return { ok: false, problem: 'unknown parameter type for ' + k };
            }
        }
        for (const k of Object.keys(specs)) {
            if (specs[k].required && args[k] == null) {
                return { ok: false, problem: 'the request does not say ' + (specs[k].about || k) };
            }
        }
        return { ok: true, capability: c, args: args, dropped: dropped };
    };

    const preview = (name, args) => {
        if (name === 'new_timeline') {
            return 'add a timeline from ' + args.start + ' to ' + args.end
                + ' (it will ask for a title)';
        }
        if (name === 'derive_from_new_table') {
            return 'make a new table ' + (args.name ? ('called ' + args.name + ' ') : '')
                + 'and have the selected cells read from it'
                + (args.name ? '' : ' (it will ask for a name)');
        }
        if (name === 'format_cells') {
            return args.style === 'dollar'
                ? 'show the selected cells as money'
                : 'show the selected cells as plain numbers';
        }
        if (name === 'rearrange_column') {
            const where = (args.column == null || args.column === '')
                ? 'column 0 (the first)' : ('column ' + args.column);
            const says = {
                reverse: 'turn upside down', sort_asc: 'sort A to Z', sort_desc: 'sort Z to A',
                compact: 'close the gaps in', dedupe: 'remove the repeats from',
                fill_down: 'fill down', trim: 'tidy the spacing in', clear: 'empty'
            };
            return (says[args.action] || args.action) + ' ' + where + ' of '
                + (args.table || 'the selected table');
        }
        if (name === 'move_column') {
            const says = { copy: 'copy column ', swap: 'swap column ', move: 'move column ' };
            const joins = { copy: ' onto column ', swap: ' with column ', move: ' to position ' };
            return (says[args.action] || args.action) + args.column + joins[args.action]
                + args.to + ' in ' + (args.table || 'the selected table');
        }
        if (name === 'shift_column_values') {
            const where = (args.column == null || args.column === '')
                ? 'column 0 (the first)' : ('column ' + args.column);
            return 'move the values in ' + where + ' of '
                + (args.table || 'the selected table') + ' ' + args.direction + ' by '
                + args.by + ' row' + (args.by === 1 ? '' : 's');
        }
        if (name === 'set_column_values') {
            const where = (args.column == null || args.column === '')
                ? 'column 0 (the first)' : ('column ' + args.column);
            return 'put ' + args.values.length + ' value'
                + (args.values.length === 1 ? '' : 's') + ' in ' + where
                + ' of ' + (args.table || 'the selected table')
                + (args.start_row ? (', from row ' + args.start_row) : '')
                + ': ' + args.values.slice(0, 6).join(', ')
                + (args.values.length > 6 ? ', \u2026' : '');
        }
        if (name === 'rename_table') {
            return 'rename ' + (args.from || 'the selected table') + ' to ' + args.to;
        }
        if (name === 'new_table') {
            return 'add a ' + args.rows + ' x ' + args.cols + ' table'
                + (args.name ? (' called ' + args.name) : '');
        }
        const c = byName(name);
        return c ? c.summary : name;
    };

    return { list: LIST, byName: byName, catalogue: catalogue, validate: validate, preview: preview };
}
