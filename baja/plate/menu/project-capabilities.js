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
                name: { type: 'string',
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
                column: { type: 'string', required: true,
                    about: 'which column: its number counting from 0, or its letter (A, B, C). '
                        + '"the first column" is 0' },
                table: { type: 'string',
                    about: 'the table\u2019s name, if the request says it; leave it out for the '
                        + 'selected table' },
                start_row: { type: 'number', min: 0, max: 5000,
                    about: 'the row to start at, counting from 0; leave it out for the top' }
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
                from: { type: 'string',
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
        if (name === 'set_column_values') {
            return 'put ' + args.values.length + ' value'
                + (args.values.length === 1 ? '' : 's') + ' in column ' + args.column
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
