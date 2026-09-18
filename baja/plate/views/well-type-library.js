function (pt, plate) {

    // SET WELL TYPE — the full-screen library of every data type a cell can display.
    //   await exec('baja/plate/views/well-type-library.js', pt, plate)
    //
    // Replaces the old 500x500 "selection-list" modal, which listed Object.keys(WellDisplay)
    // raw: every alias the factory registers ('USD', 'US$', '%', 'PCT', 'DW_mg', ...) showed
    // up as if it were its own type, with no hint of what any of them did. This lists each
    // type ONCE, grouped by what it is for, with a one-line description and a badge that
    // says whether the cell is editable (Input) or computed/displayed. The current type of
    // the selection is highlighted. Types the factory knows but this catalogue does not are
    // still listed, under "Other", so nothing is hidden.
    return (async () => {
        const WellDisplay = await exec('baja/plate/views/well-display-factory');
        let HM = null;
        try { HM = await exec('baja/history/HM'); } catch (e) { HM = null; }

        const wells = (plate && plate.getSelectedWellsInOrder) ? (plate.getSelectedWellsInOrder() || []) : [];
        const current = wells.length ? (wells[0].skin_type || null) : null;
        const canonical = Array.isArray(WellDisplay.__canonical) ? WellDisplay.__canonical : Object.keys(WellDisplay);
        const known = new Set(canonical);

        const T = (key, section, title, blurb, badge) => ({ key, section, title, blurb, badge });
        const CATALOG = [
            // Text
            T('SIMPLE_TEXT', 'Text', 'Text', 'Plain text, left aligned and wrapped to the cell.', 'Display'),
            T('TITLE', 'Text', 'Title', 'Bold heading text for naming a block of the model.', 'Display'),
            T('TITLE_SUBTLE', 'Text', 'Subtitle', 'A quieter heading in muted grey, for secondary labels.', 'Display'),
            T('TITLE_MONO', 'Text', 'Code', 'Monospaced text, for identifiers, keys and formulas shown as text.', 'Display'),
            T('TITLE_OUTLINE', 'Text', 'Outlined title', 'Heading text drawn with an outline so it stays readable over colour.', 'Display'),
            T('BADGE', 'Text', 'Badge', 'A short word in a coloured pill: a category, tag or label.', 'Display'),
            T('LINK', 'Text', 'Link', 'A web address shown as an underlined link.', 'Display'),
            T('VideoLink', 'Text', 'Video link', 'A link to a video, shown with a play marker.', 'Display'),
            T('ICON', 'Text', 'Icon', 'An icon chosen by name, for pictorial cells.', 'Display'),

            // Numbers
            T('NUMBER', 'Numbers', 'Number', 'A number with decimals that suit its size: 12,345 · 123.4 · 12.35 · 0.0123.', 'Display'),
            T('INTEGER', 'Numbers', 'Integer', 'A whole number with thousands separators.', 'Display'),
            T('YEAR', 'Numbers', 'Year', 'A year, shown without a thousands separator: 2027, not 2,027.', 'Display'),
            T('SCIENTIFIC', 'Numbers', 'Scientific', 'A very small or very large value in scientific notation: 3.20 × 10⁻⁹.', 'Display'),
            T('Input_Number', 'Numbers', 'Number', 'An editable number; the model reads it as an input.', 'Input'),
            T('DELTA', 'Numbers', 'Change', 'A signed change with an up or down arrow, green when positive and red when negative.', 'Display'),
            T('MULTIPLE', 'Numbers', 'Multiple', 'A ratio shown as a multiple, such as 2.5×.', 'Display'),
            T('RATING', 'Numbers', 'Rating', 'A score from 0 to 5 drawn as filled dots.', 'Display'),
            T('CONCENTRATION', 'Numbers', 'Concentration', 'A concentration; the value is parsed and kept as a number for assays.', 'Input'),
            T('PROGRESS', 'Numbers', 'Progress bar', 'A 0 to 100 value drawn as a horizontal bar.', 'Display'),
            T('HEATMAP', 'Numbers', 'Heat map', 'A value coloured on a scale across the column, for spotting highs and lows.', 'Display'),
            T('SPARKLINE', 'Numbers', 'Sparkline', 'A small trend line drawn from a list of numbers.', 'Display'),

            // Money and percent
            T('DOLLAR', 'Money and percent', 'Dollars', 'A currency amount, abbreviated to K, M or B when large.', 'Display'),
            T('Input_Dollar', 'Money and percent', 'Dollars (input)', 'An editable currency amount the model reads as an assumption.', 'Input'),
            T('PERCENT', 'Money and percent', 'Percent', 'A fraction shown as a percentage.', 'Display'),
            T('PERCENT_WITH_COLOR', 'Money and percent', 'Percent, coloured', 'A percentage tinted by its value, for margins and growth rates.', 'Display'),
            T('Input_Percent', 'Money and percent', 'Percent (input)', 'An editable percentage the model reads as an assumption.', 'Input'),

            // Weights
            T('Display_Weight_ng', 'Weights', 'Nanograms', 'A mass shown with an ng unit.', 'Display'),
            T('Display_Weight_ug', 'Weights', 'Micrograms', 'A mass shown with a µg unit.', 'Display'),
            T('Display_Weight_mg', 'Weights', 'Milligrams', 'A mass shown with an mg unit.', 'Display'),
            T('Display_Weight_abbrev_g', 'Weights', 'Grams', 'A mass in grams, abbreviated when large.', 'Display'),
            T('Display_Weight_kg', 'Weights', 'Kilograms', 'A mass shown with a kg unit.', 'Display'),
            T('Input_Weight_ng', 'Weights', 'Nanograms (input)', 'An editable mass in ng.', 'Input'),
            T('Input_Weight_ug', 'Weights', 'Micrograms (input)', 'An editable mass in µg.', 'Input'),
            T('Input_Weight_mg', 'Weights', 'Milligrams (input)', 'An editable mass in mg.', 'Input'),
            T('Input_Weight_abbrev_g', 'Weights', 'Grams (input)', 'An editable mass in grams.', 'Input'),
            T('Input_Weight_kg', 'Weights', 'Kilograms (input)', 'An editable mass in kg.', 'Input'),

            // Status and dates
            T('BOOL', 'Status and dates', 'Checkbox', 'True or false, drawn as a tick box.', 'Input'),
            T('STATUS', 'Status and dates', 'Status', 'A state word with a coloured dot: done, pending, blocked.', 'Display'),
            T('DATE', 'Status and dates', 'Date', 'A date picked from a calendar (double-click the cell to choose), shown as year, month and day.', 'Input'),
            T('BUTTON', 'Status and dates', 'Button', 'A clickable button that runs the cell\'s action.', 'Action'),

            // Structure
            T('ColumnHeader', 'Structure', 'Column header', 'Names the column beneath it.', 'Display'),
            T('RowHeader', 'Structure', 'Row header', 'Names the row beside it.', 'Display'),
        ];

        const books = [];
        const listed = new Set();
        for (const c of CATALOG) {
            const exists = known.has(c.key) || c.key === 'CONCENTRATION';
            if (!exists) continue;
            listed.add(c.key);
            books.push({
                section: c.section, title: c.title, badge: c.badge, blurb: c.blurb,
                selected: current === c.key,
                open: () => apply(c.key)
            });
        }
        // Anything the factory knows that this catalogue has not described yet.
        for (const k of canonical) {
            if (listed.has(k)) continue;
            books.push({
                section: 'Other', title: k.replace(/_/g, ' '), badge: 'Display',
                blurb: 'Display type "' + k + '".', selected: current === k, open: () => apply(k)
            });
        }
        // Automatic: the rule-based detection a Build runs, and the older AI suggestion,
        // which used to live in a second, raw "Data Type" list under Data...
        const table = plate && Array.isArray(plate.wells) ? plate : null;
        books.unshift({
            section: 'Automatic', title: 'Suggest with AI', badge: 'Auto',
            blurb: 'Ask the model to choose a type for each selected cell from its value and tags. Experimental, and slower.',
            selected: false,
            open: async () => {
                if (!wells.length) { try { pt.setMessage('Select the cells first.', 2); } catch (e) { } return; }
                try { hideAllModal(); } catch (e) { }
                try { if (HM && typeof pushHistory === 'function') pushHistory(HM(plate)); } catch (e) { }
                try { pt.setMessage('Suggesting cell types…', 5); } catch (e) { }
                try {
                    const items = wells.map((w) => ({ id: w.uid, value: w.value, fields: Object.keys(w.group || {}), wtype: '' }));
                    const paint = await exec('py/openai/paint-wells.py', items, canonical.filter(k => !k.startsWith('Input_')));
                    try { pt.killSprite(); } catch (e) { }
                    pt.applyAssignmentWellTypes(paint);
                } catch (e) { try { pt.killSprite(); } catch (e2) { } try { pt.setMessage('The suggestion failed: ' + (e && e.message || e), 3); } catch (e2) { } }
            }
        });
        books.unshift({
            section: 'Automatic', title: 'Detect automatically', badge: 'Auto',
            blurb: (wells.length
                ? 'Choose a type for each selected cell from its column header, row label, unit and value: money, percentages, counts, years, dates, links, badges.'
                : 'Choose a type for every untyped cell of this table from its column header, row label, unit and value. Types already set are kept.'),
            selected: false,
            open: async () => {
                if (!table) return;
                try { if (HM && typeof pushHistory === 'function') pushHistory(HM(plate)); } catch (e) { }
                const r = await pt.autoTypeTables([table], wells.length ? { cells: wells, overwrite: true } : {});
                try { hideAllModal(); } catch (e) { }
                const n = (r && r.cells) || 0;
                try { pt.setMessage(n ? n + (n === 1 ? ' cell' : ' cells') + ' typed: ' + Object.keys(r.byType).map(k => k.toLowerCase().replace(/_/g, ' ')).join(', ') : 'Nothing to change: every cell already has a type, or none could be told.', 2); } catch (e) { }
            }
        });
        books.push({
            section: 'Reset', title: 'Default', badge: 'Reset',
            blurb: 'Clear the type and show the raw value.',
            selected: current === null, open: () => apply(null)
        });

        function apply(key) {
            try { if (HM && typeof pushHistory === 'function') pushHistory(HM(plate)); } catch (e) { }
            for (const w of wells) {
                try { w.setWellType(key); } catch (e) { }
            }
            try {
                const label = key ? key.replace(/_/g, ' ') : 'default';
                if (pt && pt.setMessage) pt.setMessage(wells.length + (wells.length === 1 ? ' cell' : ' cells') + ' set to ' + label, 2);
            } catch (e) { }
            // A date cell is chosen from a calendar: open it straight away so the first
            // value goes in without a second trip through the menu.
            if (key === 'DATE' && wells.length) {
                setTimeout(() => { try { hideAllModal(); } catch (e) { } try { exec('baja/plate/views/date-picker.js', pt, plate, wells); } catch (e) { } }, 250);
            }
        }

        const what = wells.length === 0 ? 'No cells are selected.'
            : (wells.length === 1 ? 'One cell selected' : wells.length + ' cells selected')
            + (current ? ', currently ' + current.replace(/_/g, ' ') + '.' : '.');
        await exec('baja/lib/shelf.js', {
            id: 'baja-well-type-library',
            title: 'Cell data type',
            subtitle: what + ' Pick how the value should be shown and edited.',
            books: books
        });
        return true;
    })();
}
