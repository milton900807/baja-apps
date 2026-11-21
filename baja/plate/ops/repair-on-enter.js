function (pt) {

    // ENTER ON A RED CELL, PRESSED ON THE CELL ITSELF.
    //   exec('baja/plate/ops/repair-on-enter.js', track)      // once, from the track's init()
    //
    // "=sum the cells above" typed straight into a cell went red with "Cannot destructure
    // property 'tableName' of 'parseTableString(...)' as it is null", and pressing Enter on
    // it again did the same. The repair for this was first hung on the command field at the
    // top, which is one of two places a formula is typed and not the one that was being
    // used: a key pressed on the canvas never goes near that field.
    //
    // The cell's own Enter is handled in eight places (every kind of table has its own, most
    // of them twice), so this does not try to be inside them. It listens for the same key
    // from outside, notes which cell was selected when it was pressed, lets the table do
    // whatever it does, and then looks at that cell: if it is red and holds something that
    // starts with "=", its text goes to the card to be worked out into a formula, for THAT
    // cell, whatever is selected by then.
    //
    // IT ONLY ACTS ON A CELL THAT IS RED. A formula that works is never looked at twice, a
    // plain value is never looked at at all, and a key pressed in a text field belongs to
    // the field.

    const WAIT = 500, EVERY = 250, GIVE_UP = 3000;

    const find = (well) => {
        try {
            for (const t of (Array.isArray(pt.root) ? pt.root : [])) {
                if (!t || !Array.isArray(t.wells)) continue;
                for (let c = 0; c < t.wells.length; c++) {
                    const r = (t.wells[c] || []).indexOf(well);
                    if (r >= 0) return { table: t, c: c, r: r };
                }
            }
        } catch (e) { }
        return null;
    };
    const selected = () => {
        try {
            if (pt.selected_well) return pt.selected_well;
            const sp = pt.selectedPlate;
            const ws = (sp && typeof sp.getSelectedWellsInOrder === 'function') ? (sp.getSelectedWellsInOrder() || []) : [];
            return ws.length === 1 ? ws[0] : null;
        } catch (e) { return null; }
    };
    const textOf = (w) => {
        const v = (w && w.value != null) ? ('' + w.value).trim() : '';
        if (v.charAt(0) === '=') return v;
        // While it is being typed a formula sits in .obj and has not reached .value yet.
        const o = (w && typeof w.obj === 'string') ? w.obj.trim() : '';
        return o.charAt(0) === '=' ? o : '';
    };
    const red = (w) => { try { return !!(w && typeof w.hasError === 'function' && w.hasError()); } catch (e) { return false; } };

    const repair = async (well) => {
        const at = find(well);
        const text = textOf(well);
        if (!at || !text || !red(well) || pt.__repairingCell) return false;
        pt.__repairingCell = true;
        try {
            await exec('baja/plate/menu/project-command.js', {
                menus: [], pm: pt, text: text, repair: true, cell: well, table: at.table.name,
                context: {}, setError: (m) => { try { pt.setMessage(m, 8); } catch (e) { } }
            });
        } catch (e) {
            try { pt.setMessage('Could not repair that cell: ' + (e && e.message ? e.message : e), 8); } catch (e2) { }
        } finally { pt.__repairingCell = false; }
        return true;
    };

    const onKey = (e) => {
        try {
            if (!e || e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
            const tg = e.target;
            const tag = (tg && tg.tagName) ? ('' + tg.tagName).toUpperCase() : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
            // A key that belongs to something else on the page (a button, a link, a card)
            // is not a key pressed on the table.
            try {
                const ae = document.activeElement;
                const at = (ae && ae.tagName) ? ('' + ae.tagName).toUpperCase() : '';
                if (ae && ae !== document.body && at !== 'CANVAS') return;
            } catch (e2) { }
            const well = selected();
            if (!well || !find(well)) return;
            // After the table has had the key and the project has recalculated. The wait is
            // watched rather than guessed: it acts as soon as the cell is red and gives up
            // if it never is.
            let waited = WAIT;
            const look = () => {
                if (red(well) && textOf(well)) { repair(well); return; }
                waited += EVERY;
                if (waited <= GIVE_UP) setTimeout(look, EVERY);
            };
            setTimeout(look, WAIT);
        } catch (e3) { }
    };

    try { window.addEventListener('keydown', onKey, true); } catch (e) { }
    return {
        onKey: onKey, repair: repair,
        remove() { try { window.removeEventListener('keydown', onKey, true); } catch (e) { } }
    };
}
