function (pt, table, well, actions) {

    // THE CELL'S ACTIONS, AS ONE DROP-DOWN INSTEAD OF A ROW OF DISCS.
    //   exec('baja/plate/menu/cell-menu.js', track, table, well, table.cellActions)
    //
    // A selected cell grew five round buttons to its right: an arrow, another arrow, an "i",
    // an "M" and a cross. They said nothing about what they did, they covered whatever was
    // in the next cell (in the screenshot that prompted this, the words "Navigation Fees"),
    // and a fifth of them deleted things. One button now stands where the row was, and
    // pressing it opens this: the same five actions, each under its own name.
    //
    // THE ACTIONS ARE THE TABLE'S OWN. Nothing is reimplemented here. Each table class keeps
    // the buttons it always had as `cellActions`, with the functions they always called, and
    // this only gives them words and somewhere to be pressed. What a row is called comes
    // from the button's `label` if it has one, else from the glyph it used to be drawn with.
    //
    // It is DOM, over the canvas, like the date picker: placed against the cell from the
    // canvas's own rectangle and the cell's last drawn position, kept inside the window,
    // and closed by a pick, a press anywhere else, or Escape.

    const ID = 'baja-cell-menu';
    const NAMES = {
        '→': { label: 'Select this row', hint: 'from this cell across' },
        '↓': { label: 'Select this column', hint: 'from this cell down' },
        'i': { label: 'Script for the selection', hint: 'write or run a function over it' },
        'I': { label: 'Edit as text', hint: 'open the cell in the text window' },
        'M': { label: 'More options', hint: 'the full menu for this table' },
        'X': { label: 'Delete', hint: 'what is selected', danger: true }
    };
    const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const close = () => {
        try { const old = document.getElementById(ID); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        try { if (window.__bajaCellMenuOff) { window.__bajaCellMenuOff(); window.__bajaCellMenuOff = null; } } catch (e) { }
    };

    // Pressing the button while its menu is open closes it, as a drop-down's button does.
    try { if (document.getElementById(ID)) { close(); return null; } } catch (e) { }
    close();

    // WITH SEVERAL CELLS SELECTED THERE IS NO "THIS ROW" OR "THIS COLUMN". Both of those
    // start from one cell and run across or down from it. Offered over a block of ten
    // cells they would throw the block away for a row or column of whichever cell the
    // menu happened to open beside, so they are not offered at all.
    let many = false;
    try {
        const sel = (table && typeof table.getSelectedWellsInOrder === 'function') ? (table.getSelectedWellsInOrder() || []) : [];
        many = sel.length > 1;
    } catch (e) { many = false; }
    const fromOneCell = (b) => b.letter === '\u2192' || b.letter === '\u2193';

    const list = (Array.isArray(actions) ? actions : ((table && table.cellActions) || []))
        .filter((b) => b && typeof b.action === 'function')
        .filter((b) => !(many && fromOneCell(b)))
        .map((b) => {
            const known = NAMES[b.name === 'I' ? 'I' : b.letter] || {};
            return { button: b, label: b.label || known.label || ('' + (b.name || b.letter || 'Action')),
                hint: b.hint || known.hint || '', danger: !!(b.danger || known.danger || b.name === 'close') };
        });
    if (!list.length) return null;

    // "SET DATA TYPE" IS ALWAYS HERE, FOR ONE CELL AS MUCH AS FOR A COLUMN. Money, a date, a
    // percentage: the library that sets it (well-type-library.js) works on whatever is
    // selected, and it was three menus deep. It was first offered here only with a whole
    // column selected, on the reasoning that a type belongs to a column. But a total at the
    // foot of a column of dollars is one cell, and it is exactly the cell that comes out
    // as a bare 600000 and needs telling. So it is offered for any selection, above Delete,
    // and its second line says how much it will change.
    let wholeColumn = false, count = 1;
    try {
        const sel = (table && typeof table.getSelectedWellsInOrder === 'function') ? (table.getSelectedWellsInOrder() || []) : [];
        const cols = (table && Array.isArray(table.wells)) ? table.wells : [];
        count = Math.max(1, sel.length);
        if (sel.length > 1 && cols.length) {
            const isHead = (w) => !!w && (w.skin_type === 'ColumnHeader'
                || (w.group && typeof w.group === 'object' && w.group['ColumnHeader'] != null) || w.group === 'ColumnHeader');
            const col = cols.filter((c) => Array.isArray(c) && c.indexOf(sel[0]) >= 0)[0];
            if (col && sel.every((w) => col.indexOf(w) >= 0)) {
                const body = col.filter((w) => w && !isHead(w));
                wholeColumn = body.length > 1 && body.every((w) => sel.indexOf(w) >= 0);
            }
        }
    } catch (e) { wholeColumn = false; }
    {
        const scope = wholeColumn ? 'this column' : (count > 1 ? ('the ' + count + ' selected cells') : 'this cell');
        const entry = { label: 'Set data type', hint: 'money, date, percent and the rest, for ' + scope, danger: false,
            button: { action: async (w) => {
                // The library acts on the selection. A menu opened on a cell that is current
                // but not marked selected would otherwise change nothing.
                try {
                    const sel = (table && typeof table.getSelectedWellsInOrder === 'function') ? (table.getSelectedWellsInOrder() || []) : [];
                    if (!sel.length && w) { if (typeof w.selectIt === 'function') w.selectIt(); else w.select = true; }
                } catch (e) { }
                return exec('baja/plate/views/well-type-library.js', pt, table);
            } } };
        const k = list.findIndex((x) => x.danger);
        list.splice(k < 0 ? list.length : k, 0, entry);
    }

    // ON A ROW HEADER: HOW FAR ITS TAG REACHES. A row header names the one cell beside it
    // (plate.js, rowHeaderReach). Here it can be made to name more: the whole row, or,
    // with the header and cells along its row selected, as far as the selection goes. And
    // put back to one. The second line says what it does now.
    try {
        const isRowHead = (w) => !!w && (w.skin_type === 'RowHeader'
            || (w.group && typeof w.group === 'object' && w.group['RowHeader'] != null));
        const sel = (table && typeof table.getSelectedWellsInOrder === 'function') ? (table.getSelectedWellsInOrder() || []) : [];
        const at = (w) => { try { return table.getWellIndicies(w); } catch (e) { return null; } };
        let head = isRowHead(well) ? well : null;
        if (!head) head = sel.filter(isRowHead)[0] || null;
        const hi = head ? at(head) : null;
        if (head && hi && typeof table.rowHeaderReach === 'function' && typeof table.setRowHeaderReach === 'function') {
            const now = table.rowHeaderReach(head);
            const says = now === Infinity ? 'now: every cell in its row' : (now === 1 ? 'now: only the cell beside it' : ('now: the next ' + now + ' cells'));
            const set = (reach, msg) => ({ action: async () => {
                table.setRowHeaderReach(reach, [head]);
                try { if (pt && typeof pt.updateCalculations === 'function') pt.updateCalculations(); } catch (e) { }
                try { if (pt && typeof pt.setMessage === 'function') pt.setMessage(msg, 6); } catch (e) { }
            } });
            const name = '' + head.value;
            const extra = [];
            // As far as the selection: the cells picked along the header's own row.
            let far = 0;
            for (const w of sel) {
                const i = at(w);
                if (!i || w === head || i.rowIdx !== hi.rowIdx || i.colIdx <= hi.colIdx) continue;
                let n = 0;
                for (let c = hi.colIdx + 1; c <= i.colIdx; c++) { if (!isRowHead(table.wells[c] && table.wells[c][hi.rowIdx])) n++; }
                far = Math.max(far, n);
            }
            if (far > 1 && far !== now) extra.push({ label: 'Header: tag the ' + far + ' cells selected', hint: says, danger: false,
                button: set(far, '"' + name + '" now names the next ' + far + ' cells.') });
            if (now !== Infinity) extra.push({ label: 'Header: tag the whole row', hint: says, danger: false,
                button: set('row', '"' + name + '" now names every cell in its row.') });
            if (now !== 1) extra.push({ label: 'Header: tag only the next cell', hint: says, danger: false,
                button: set(1, '"' + name + '" now names only the cell beside it.') });
            const k = list.findIndex((x) => x.danger);
            list.splice(k < 0 ? list.length : k, 0, ...extra);
        }
    } catch (e) { }

    // "REMOVE TAGS", JUST ABOVE DELETE. Takes the tags off whatever is selected and keeps
    // them off: the cells are marked noHeaderTags, so the row and column headers, which are
    // applied again at every calculation, pass them by (plate.js). What a cell is (a row
    // or column header) and how it is drawn (dollar, percent) are not tags in this sense
    // and stay. Once cells are marked, "Restore tags" is offered for them in its place.
    try {
        const KEEP = { RowHeader: 1, ColumnHeader: 1, dollar: 1, percent: 1, $: 1 };
        let sel = (table && typeof table.getSelectedWellsInOrder === 'function') ? (table.getSelectedWellsInOrder() || []) : [];
        if (!sel.length && well) sel = [well];
        const tagsOf = (w) => (w && w.group && typeof w.group === 'object') ? Object.keys(w.group).filter((k) => !KEEP[k]) : [];
        const tagged = sel.filter((w) => tagsOf(w).length > 0);
        const marked = sel.filter((w) => w && w.noHeaderTags);
        const scope = sel.length > 1 ? ('the ' + sel.length + ' selected cells') : 'this cell';
        const after = (msg) => {
            try { if (typeof table.reapplyHeaderWells === 'function') table.reapplyHeaderWells(); } catch (e) { }
            try { if (pt && typeof pt.updateCalculations === 'function') pt.updateCalculations(); } catch (e) { }
            try { if (pt && typeof pt.setMessage === 'function') pt.setMessage(msg, 6); } catch (e) { }
        };
        const extra = [];
        if (tagged.length) extra.push({ label: 'Remove tags', hint: 'from ' + scope + ', and keep them off', danger: false,
            button: { action: async () => {
                let n = 0;
                for (const w of sel) {
                    if (!w) continue;
                    for (const k of tagsOf(w)) { delete w.group[k]; n++; }
                    w.noHeaderTags = true;
                }
                after('Removed ' + n + (n === 1 ? ' tag' : ' tags') + ' from ' + scope + '. Formulas that read those tags no longer find these cells.');
            } } });
        else if (marked.length) extra.push({ label: 'Restore tags', hint: 'let the headers tag ' + scope + ' again', danger: false,
            button: { action: async () => {
                for (const w of sel) { if (w) delete w.noHeaderTags; }
                after('The headers tag ' + scope + ' again.');
            } } });
        const k = list.findIndex((x) => x.danger);
        list.splice(k < 0 ? list.length : k, 0, ...extra);
    } catch (e) { }

    // ASK COMES FIRST. One prompt for whatever is selected: say what should go in the cells
    // and they are filled in, or start with "=" and a formula is written (see
    // baja/plate/ops/cell-ask.js). It leads the menu because it is the one row that can do
    // what none of the others is for.
    list.unshift({ label: 'Ask', hint: 'say what to fill in, or start with = for a formula', danger: false, ask: true,
        button: { action: async (w) => exec('baja/plate/ops/cell-ask.js', pt, table, w) } });

    // Where: just right of the cell, level with it.
    let left = 120, top = 120;
    try {
        let el = null;
        try { const c = CurrentLayout.getStashed('graph-canvas'); el = c && c.canvas; if (el && el.nativeElement) el = el.nativeElement; } catch (e) { el = null; }
        if (!el || !el.getBoundingClientRect) el = document.querySelector('canvas[tabindex]') || document.querySelector('canvas');
        const r = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
        const w = well || (pt && pt.selected_well) || {};
        left = Math.round(r.left + (w.__screen_x || 0) + (w.__screen_width || 0) + 8);
        top = Math.round(r.top + (w.__screen_y || 0) + (w.__screen_height || 24) / 2 + 14);
    } catch (e) { }
    const W = 250, H = 16 + list.length * 44;
    left = Math.max(8, Math.min(left, (window.innerWidth || 1200) - W - 8));
    top = Math.max(8, Math.min(top, (window.innerHeight || 800) - H - 8));

    const box = document.createElement('div');
    box.id = ID;
    box.setAttribute('role', 'menu');
    box.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;width:' + W + 'px;z-index:2147483200;'
        + 'background:#0b2545;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:10px;'
        + 'box-shadow:0 14px 34px rgba(0,0,0,0.38);padding:6px;font-family:Arial,Helvetica,sans-serif;';
    box.innerHTML = list.map((it, i) =>
        '<div role="menuitem" tabindex="-1" data-i="' + i + '" style="padding:7px 10px;border-radius:7px;cursor:pointer;'
        + (it.danger ? 'border-top:1px solid rgba(255,255,255,0.12);margin-top:4px;' : '') + '">'
        + '<div style="font:600 13px Arial;color:' + (it.danger ? '#fda29b' : (it.ask ? '#fcd34d' : '#e8f0fb')) + ';">' + esc(it.label) + '</div>'
        + (it.hint ? ('<div style="font:11.5px Arial;color:#9fb6d6;margin-top:2px;">' + esc(it.hint) + '</div>') : '')
        + '</div>').join('');
    document.body.appendChild(box);

    const rows = Array.prototype.slice.call(box.querySelectorAll('[data-i]'));
    let at = -1;
    const mark = (i) => {
        at = i;
        rows.forEach((r, k) => { r.style.background = (k === i) ? 'rgba(26,163,189,0.28)' : 'transparent'; });
    };
    const run = (i) => {
        const it = list[i];
        close();
        if (!it) return;
        // The table's own function, called the way the button called it.
        try { Promise.resolve(it.button.action(well || (pt && pt.selected_well), pt)).catch((e) => {
            try { pt.setMessage('That did not work: ' + (e && e.message ? e.message : e), 6); } catch (e2) { }
        }); } catch (e) { try { pt.setMessage('That did not work: ' + (e && e.message ? e.message : e), 6); } catch (e2) { } }
        try { if (pt && pt.wake) pt.wake(); } catch (e) { }
    };
    rows.forEach((r, i) => {
        r.onmouseenter = () => mark(i);
        r.onclick = (e) => { try { e.stopPropagation(); } catch (e2) { } run(i); };
    });

    // A press anywhere else, or Escape, puts it away. The press that opened it is still on
    // its way through the page when this runs, so the listener starts on the next turn.
    const onDown = (e) => { try { if (box.contains(e.target)) return; } catch (e2) { } close(); };
    const onKey = (e) => {
        if (e.key === 'Escape') { close(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            mark((at + (e.key === 'ArrowDown' ? 1 : list.length - 1) + (at < 0 && e.key === 'ArrowUp' ? 1 : 0)) % list.length);
            try { e.preventDefault(); e.stopPropagation(); } catch (e2) { }
            return;
        }
        if (e.key === 'Enter' && at >= 0) { try { e.preventDefault(); e.stopPropagation(); } catch (e2) { } run(at); }
    };
    const timer = setTimeout(() => {
        try { window.addEventListener('mousedown', onDown, true); window.addEventListener('touchstart', onDown, true); } catch (e) { }
    }, 0);
    try { window.addEventListener('keydown', onKey, true); } catch (e) { }
    window.__bajaCellMenuOff = () => {
        clearTimeout(timer);
        try { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('touchstart', onDown, true);
            window.removeEventListener('keydown', onKey, true); } catch (e) { }
    };

    return { close: close, items: list.map((x) => x.label), pick: run };
}
