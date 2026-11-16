function (pm, o) {

    // HOW THE SELECTED CELLS ARE SHOWN.
    //
    // A cell is drawn as money when it carries the `dollar` tag (well.__displayText reads
    // group.dollar), so "make this a dollar type" is a real operation and not a note to
    // self. It changes how the number is SHOWN and never the number: 1200 stays 1200 and is
    // drawn as $1,200.00, so a formula reading that cell still gets 1200.
    //
    // IT ACTS ON WHAT IS SELECTED, which is the only thing "this" can mean when it is typed
    // into a cell. With nothing selected there is nothing to act on and it says so rather
    // than formatting a whole column nobody pointed at.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || !Array.isArray(pt.root)) { resolve({ error: 'there is no project open' }); return; }

            const named = ('' + ((o && o.table) || '')).trim();
            let table = null;
            if (named) {
                table = (typeof pt.getTableByName === 'function') ? pt.getTableByName(named) : null;
                if (!table) { resolve({ error: 'there is no table called ' + named }); return; }
            } else {
                const tables = pt.root.filter((p) => p && Array.isArray(p.wells));
                table = pt.selectedPlate || (tables.length === 1 ? tables[0] : null);
                if (!table) { resolve({ error: 'say which table, or select it first' }); return; }
            }

            let cells = [];
            try {
                if (typeof table.getSelectedWellsInOrder === 'function') {
                    cells = table.getSelectedWellsInOrder() || [];
                }
            } catch (e) { cells = []; }
            if ((!cells || !cells.length) && pt.selected_well) cells = [pt.selected_well];
            if (!cells || !cells.length) {
                resolve({ error: 'select the cells first, then say what to do with them' });
                return;
            }

            const style = ('' + ((o && o.style) || '')).trim().toLowerCase();
            const TAGS = { dollar: 'dollar' };
            if (style !== 'dollar' && style !== 'plain') {
                resolve({ error: 'dollar or plain?' });
                return;
            }

            let n = 0;
            for (const c of cells) {
                if (!c) continue;
                try {
                    if (style === 'plain') {
                        // Only the formatting tags come off. A cell's other tags are what
                        // formulas find it by, and dropping those to change how it looks
                        // would quietly break every reference to it.
                        if (c.group && typeof c.group === 'object') {
                            delete c.group['dollar'];
                            delete c.group['$'];
                        }
                    } else if (typeof c.appendGroups === 'function') {
                        c.appendGroups([TAGS[style]]);
                    } else {
                        c.group = c.group || {};
                        c.group[TAGS[style]] = c.group[TAGS[style]] || [];
                    }
                    n++;
                } catch (e) { }
            }

            try { for (const col of table.wells) for (const c of (col || [])) if (c) c.__wrapKey = null; } catch (e) { }
            try { pt.updateCalculations(); } catch (e) { }
            try { pt.setMessage((style === 'dollar' ? 'Showing ' : 'Plain numbers in ')
                + n + ' cell' + (n === 1 ? '' : 's') + (style === 'dollar' ? ' as money' : ''), 6); } catch (e) { }

            resolve({ table: table.name, style: style, cells: n });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
