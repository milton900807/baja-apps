function (plate, pt) {

    // DOWNLOAD THIS TABLE AS A SPREADSHEET.
    //
    // The download button in every table's title bar lands here. The table is already a
    // grid of values, so there is nothing to decide: row 0 is the header, the rest are
    // rows, and the columns come out in the order they are drawn in.
    //
    // The bytes are built by /export-table, not in the browser -- the same route the
    // editor's Download library and the LOH reports use -- and come back base64 for the
    // browser to save. One sheet, named after the table.
    //
    // A cell's VALUE is what goes in, not the string on screen: a number stays a number so
    // the spreadsheet can add it up, and a cell showing "$1.2B" because of the table's
    // units map exports as 1200000000. Where a cell is a formula the value IS the result,
    // which is what a reader of the sheet wants; the formula text stays behind in the
    // canvas (big-menu-for-plates has the export that spells formulas out).

    return (async () => {
        const say = (m, s) => { try { pt && pt.setMessage && pt.setMessage(m, s || 4); } catch (e) { } };

        const wells = (plate && plate.wells) || [];
        const nCols = wells.length;
        const nRows = nCols ? (wells[0] || []).length : 0;
        if (!nCols || !nRows) { say('There is nothing in this table to download.', 4); return; }

        const cell = (c, r) => {
            const w = wells[c] && wells[c][r];
            if (!w) return '';
            const v = (w.value !== undefined && w.value !== null) ? w.value : '';
            return (typeof v === 'object') ? JSON.stringify(v) : v;
        };

        // Header names must be unique or the later column silently overwrites the earlier
        // one when the row object is built -- two columns both called "Value" is an
        // ordinary thing for a table to have and must not cost a column in the sheet.
        const seen = {};
        const cols = [];
        for (let c = 0; c < nCols; c++) {
            let h = ('' + cell(c, 0)).trim() || ('Column ' + (c + 1));
            if (seen[h]) { const n = ++seen[h]; h = h + ' (' + n + ')'; } else seen[h] = 1;
            cols.push(h);
        }

        // A one-row table is all header and no rows -- export it as a single row rather
        // than an empty sheet with a header, which is what the grid literally says.
        const startRow = (nRows > 1) ? 1 : 0;
        const rows = [];
        for (let r = startRow; r < nRows; r++) {
            const row = {};
            let any = false;
            for (let c = 0; c < nCols; c++) {
                const v = cell(c, r);
                row[cols[c]] = v;
                if (v !== '' && v !== null) any = true;
            }
            if (any) rows.push(row);
        }
        if (!rows.length) { say('There is nothing in this table to download.', 4); return; }

        const base = (('' + (plate.name || 'table')).replace(/[^A-Za-z0-9_\- ]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')) || 'table';
        const sheet = ('' + (plate.name || 'Sheet1')).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Sheet1';

        say('Building the spreadsheet…', 3);
        try {
            const host = window['env']['apiUrl'];
            const r = await POSTJSON(
                { format: 'xlsx', filename: base, title: ('' + (plate.name || base)), sheets: [{ name: sheet, rows: rows }] },
                host + '/export-table'
            );
            // POSTJSON hands a non-2xx body back under .error; the body is what matters
            // either way.
            const body = (r && r.error && typeof r.error === 'object') ? r.error : r;
            if (!(body && body.b64)) {
                say('Could not build the spreadsheet: ' + ((body && (body.error || body.message)) || 'server error'), 6);
                return;
            }
            const bin = atob(body.b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([bytes], { type: body.mime || 'application/octet-stream' }));
            a.download = body.filename || (base + '.xlsx');
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (e) { } }, 500);
            say('Downloaded ' + (body.filename || (base + '.xlsx')), 4);
        } catch (e) {
            say('Could not download this table: ' + e, 6);
        }
    })();
}
