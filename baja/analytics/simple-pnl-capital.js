function (pm) {

    // Simple P&L With Capital: the short version of the Financial models > P&L With Capital
    // builder, shared by every screen whose Build menu offers it (baja-analytics, baja-project,
    // apps, editor, view).
    //
    //   exec('baja/analytics/simple-pnl-capital', pm)
    //
    // One description, ONE model call for the numbers (py/openai/simple-pnl-capital.py), and four
    // small tables whose formulas are written in code: assumptions, first-year P&L, a five-year
    // view, and the capital required. No ten-year table, no waterfall, no chain of follow-up calls.
    // Resolves true when tables were placed, false when cancelled or failed.

    return new Promise(async (resolve) => {
        const pt = pm && pm.plateTrack;
        const fail = (msg) => {
            try { pt.killSprite(); } catch (e) { }
            try { pt.setMessage(msg, 3); } catch (e) { }
            resolve(false);
        };
        try {
            if (!pt) { resolve(false); return; }

            let content = '';
            try {
                content = await exec('baja/lib/prompt-text.js', {
                    title: 'Simple P&L with capital',
                    message: 'Describe the business in a sentence or two: what it sells, roughly how much, and what it needs to get started. You get four tables: assumptions, a first-year P&L, a five-year view and the capital required.',
                    placeholder: 'A small therapeutics company with two commercial products for rare disease indications, a lab and a team of twenty…',
                    action: 'Build the model',
                    historyKey: 'simple-pnl-capital'   // the last 10 descriptions, offered back
                });
            } catch (e) { content = ''; }
            if (!content) { resolve(false); return; }

            pt.setMessage('Estimating the key numbers…', 5);
            let model = null;
            try { model = await exec('py/openai/simple-pnl-capital.py', content); } catch (e) { model = { error: '' + (e && e.message || e) }; }
            if (!model || model.error || !model.tables) {
                fail('The model could not be built: ' + ((model && model.error) || 'no answer'));
                return;
            }

            const before = new Set((pt.root || []).map(x => x && x.name));
            let report = null;
            try {
                report = await exec('baja/draw/data-model-to-tables-gpt', pt, model);
            } catch (e) {
                fail('The tables could not be placed: ' + (e && e.message || e));
                return;
            }
            const made = (pt.root || []).filter(x => x && !before.has(x.name)).map(x => x.name);
            try {
                const rep = report && report.report ? report.report : null;
                console.log('[simple P&L] tables:', made, 'report:', rep);
                const errs = rep ? [].concat(rep.errors || [], rep.missingValues || []) : [];
                if (errs.length) pt.setMessage('Tables built (' + made.length + '), but ' + errs.length + ' formula cell(s) did not resolve; see the console.', 3);
                else pt.setMessage('Simple P&L built. Edit the assumptions or the capital items; everything else follows.', 2);
            } catch (e) { }

            // The builder stacks new tables at one origin: spread them, stop the working sprite,
            // and fit the view, the same steps the Project builder takes.
            try { pt.updateCalculations(); } catch (e) { }
            try { pt.killSprite(); } catch (e) { }
            try { await pt.layoutCompactTetris(); } catch (e) { }
            try { await pt.zoomtfit(); } catch (e) { }
            try { pt.updateCalculations(); } catch (e) { }
            resolve(true);
        } catch (e) {
            fail('The model could not be built: ' + (e && e.message || e));
        }
    });
}
