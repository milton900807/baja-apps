function (pm, o) {

    // RENAME A TABLE, AND EVERY FORMULA THAT NAMES IT.
    //
    // A table's name is not a caption. Formulas address cells by it -- seaarchbuoy[1] -- so
    // changing the name without changing the references leaves every one of them pointing at
    // a table that no longer exists. The existing rename path (draw-table.js, draw-clipboard
    // .js) fixes only the renamed table's OWN formulas, which is right where it is used,
    // because the table was created a moment earlier and nothing else can be referring to it
    // yet. A table that has been on the canvas for a while is the opposite case, so this
    // walks every table on the track.
    //
    // TWO THINGS ARE REFUSED RATHER THAN PATCHED UP. A name that is not a legal formula
    // reference is refused instead of being quietly stripped of its spaces: a table whose
    // name cannot be written in a formula cannot be used in one, and silently renaming it to
    // something adjacent means the user's next formula names a table that does not exist. A
    // name already in use is refused as well, because two tables of one name make every
    // reference to it ambiguous and the engine resolves such a reference to whichever comes
    // first in the list.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt || !Array.isArray(pt.root)) {
                resolve({ error: 'there is no project open' });
                return;
            }

            const to = ('' + ((o && o.to) || '')).trim();
            const from = ('' + ((o && o.from) || '')).trim();

            if (!to) { resolve({ error: 'the request does not say what to call it' }); return; }
            // The same shape the formula parser accepts for a table reference.
            if (!/^[A-Za-z_]\w*$/.test(to)) {
                resolve({ error: '"' + to + '" cannot be used in a formula, so it cannot name a '
                    + 'table. Letters, digits and underscores, starting with a letter.' });
                return;
            }

            const tables = pt.root.filter((p) => p && typeof p.name === 'string');

            // WHICH TABLE. The one named, or the selected one, or -- when there is exactly
            // one on the canvas -- that one. Beyond that it is a guess, and renaming the
            // wrong table is not something the user can see has happened.
            let table = null;
            if (from) {
                table = (typeof pt.getTableByName === 'function') ? pt.getTableByName(from) : null;
                if (!table) {
                    resolve({ error: 'there is no table called ' + from });
                    return;
                }
            } else {
                table = pt.selectedPlate || (tables.length === 1 ? tables[0] : null);
                if (!table) {
                    resolve({ error: 'say which table to rename, or select it first' });
                    return;
                }
            }

            const oldName = ('' + (table.name || '')).trim();
            if (oldName === to) { resolve({ name: to, unchanged: true }); return; }

            const clash = tables.filter((p) => p !== table
                && ('' + p.name).toLowerCase() === to.toLowerCase())[0];
            if (clash) {
                resolve({ error: 'there is already a table called ' + clash.name
                    + ', and two of one name make every reference to it ambiguous' });
                return;
            }

            if (typeof table.setName === 'function') table.setName(to); else table.name = to;

            // Every table, including this one: a formula in any of them may name it.
            let touched = 0;
            for (const p of tables) {
                try {
                    if (typeof p.renameTableInFormula === 'function') {
                        p.renameTableInFormula(oldName, to);
                        touched++;
                    }
                } catch (e) { }
            }

            try { pt.updateCalculations(); } catch (e) { }
            try { if (pt.setSelected) pt.setSelected(table); } catch (e) { }
            try { if (pt.grid && pt.grid.rescale) pt.grid.rescale(); } catch (e) { }
            try { pt.setMessage('Renamed ' + oldName + ' to ' + to, 6); } catch (e) { }

            resolve({ name: to, was: oldName, formulasIn: touched });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
