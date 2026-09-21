function (pt, plate, well) {
    // THE FORMULA OF ONE CELL, FULL SCREEN, ON A PHONE.
    //   exec('baja/plate/views/mobile-formula-editor.js', pt, plate, well)
    //
    // Reached by pressing and holding a cell that HAS a formula. The command field in the
    // menubar is a formula bar, and a phone has no room for one: it needs a keyboard, a
    // caret and a completion list side by side with the canvas. So the formula gets the
    // whole screen instead -- big enough to read a long one, wrapped rather than scrolled
    // sideways -- and leaves by Cancel or Save.
    //
    // Cancel puts nothing back. Save writes the formula and recalculates, and one undo
    // returns the cell to what it held before.
    return (async () => {
        if (!well || !plate) return false;
        let HM = null;
        try { HM = await exec('baja/history/HM'); } catch (e) { HM = null; }

        const ID = 'baja-mobile-formula';
        try { const old = document.getElementById(ID); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        // The formula as it is stored, with its leading "=".
        let initial = '';
        try {
            const f = pt.getFormulaForWell(plate.name + plate.getWellRange([well]));
            if (f && ('' + f).length) initial = '' + f;
        } catch (e) { }
        if (!initial && well.formula && ('' + well.formula).trim().startsWith('=')) initial = '' + well.formula;
        if (!initial) return false;
        if (!initial.trim().startsWith('=')) initial = '=' + initial.trim();

        // Which cell this is, in the words on the table rather than a grid address.
        let where = plate.name || 'Cell';
        try {
            const idx = plate.getWellIndicies ? plate.getWellIndicies(well) : null;
            const col0 = plate.wells[0] || [];
            const rowLab = (idx && col0[idx.rowIdx] && col0[idx.rowIdx].value != null) ? ('' + col0[idx.rowIdx].value).trim() : '';
            const colLab = (idx && plate.wells[idx.colIdx] && plate.wells[idx.colIdx][0] && plate.wells[idx.colIdx][0].value != null)
                ? ('' + plate.wells[idx.colIdx][0].value).trim() : '';
            const bits = [plate.name, rowLab, colLab].filter(Boolean);
            if (bits.length) where = bits.join(' › ');
        } catch (e) { }

        const valueNow = (well.value == null) ? '' : ('' + well.value);
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const panel = document.createElement('div');
        panel.id = ID;
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;'
            + 'background:#0a2540;color:#eaf6f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';

        panel.innerHTML = ''
            // Title strip: what is being edited, and the way out.
            + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) 14px 10px;'
            + 'background:#08203a;border-bottom:1px solid #1aa3bd;">'
            + '  <div style="flex:1;min-width:0;">'
            + '    <div style="font:700 15px system-ui;">Formula</div>'
            + '    <div style="font:12px system-ui;color:#9fc4d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(where) + '</div>'
            + '  </div>'
            + '  <button id="mf-cancel" type="button" style="flex:0 0 auto;min-height:44px;padding:0 16px;border-radius:10px;'
            + '    border:1px solid rgba(255,255,255,0.28);background:transparent;color:#eaf6f9;font:600 15px system-ui;">Cancel</button>'
            + '  <button id="mf-save" type="button" style="flex:0 0 auto;min-height:44px;padding:0 18px;border-radius:10px;'
            + '    border:none;background:#16a34a;color:#eafff2;font:700 15px system-ui;">Save</button>'
            + '</div>'
            // The formula itself, with the room to be read.
            + '<textarea id="mf-text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"'
            + '  style="flex:1 1 auto;width:100%;box-sizing:border-box;margin:0;padding:14px;border:none;resize:none;'
            + '  background:#0f2d47;color:#eaf6f9;font:16px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;'
            + '  outline:none;-webkit-appearance:none;"></textarea>'
            // What it currently works out to, so a change can be judged against it.
            + '<div style="flex:0 0 auto;padding:10px 14px calc(12px + env(safe-area-inset-bottom,0px));background:#08203a;'
            + 'border-top:1px solid rgba(26,163,189,0.4);display:flex;align-items:baseline;gap:10px;">'
            + '  <span style="font:600 11px system-ui;letter-spacing:0.08em;text-transform:uppercase;color:#7fb0c2;">Now</span>'
            + '  <span style="font:15px ui-monospace,monospace;color:#eaf6f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(valueNow) + '</span>'
            + '</div>';

        document.body.appendChild(panel);

        const area = panel.querySelector('#mf-text');
        area.value = initial;
        // The caret at the end, and the keyboard up, without iOS zooming (the 16px above).
        try { area.focus(); area.setSelectionRange(area.value.length, area.value.length); } catch (e) { }

        // Keys typed in here belong to the formula, never to the canvas underneath.
        const swallow = (e) => { e.stopPropagation(); };
        for (const ev of ['keydown', 'keyup', 'keypress']) area.addEventListener(ev, swallow);

        const close = () => {
            try { for (const ev of ['keydown', 'keyup', 'keypress']) area.removeEventListener(ev, swallow); } catch (e) { }
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { well.__editing = false; } catch (e) { }
            try { pt.wb(null); } catch (e) { }
        };

        const save = async () => {
            let next = ('' + area.value).trim();
            if (next && !next.startsWith('=')) next = '=' + next;
            if (next === initial.trim()) { close(); return; }

            // One undo puts the cell back as it was, formula and value together.
            try { if (HM) pushHistory(HM(plate)); } catch (e) { }
            try {
                const range = plate.getWellRange([well]);
                if (!plate.formula) plate.formula = {};
                if (!next) {
                    // Emptied: the cell keeps its last value and stops being a formula.
                    delete plate.formula[range];
                    well.formula = '';
                    well.__hasFormula = false;
                } else {
                    plate.formula[range] = next;
                    well.formula = next;
                    well.__hasFormula = true;
                    well.has_formula_time_set = Date.now();
                }
            } catch (e) { console.warn('save formula', e); }

            close();
            try { await pt.updateCalculations(); } catch (e) { console.warn('recalculate', e); }
            try { pt.setMessage(next ? 'Formula saved' : 'Formula removed', 2); } catch (e) { }
        };

        panel.querySelector('#mf-cancel').onclick = close;
        panel.querySelector('#mf-save').onclick = () => { save(); };
        // The phone's back gesture should close it rather than leave the app.
        try {
            const onPop = () => { close(); window.removeEventListener('popstate', onPop); };
            window.addEventListener('popstate', onPop);
        } catch (e) { }

        try { well.__editing = true; } catch (e) { }
        return true;
    })();
}
