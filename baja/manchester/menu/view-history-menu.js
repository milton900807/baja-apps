function (graph, genegraph_panel_layout) {
    // MENUS AT THE POINTER, NOT IN THE CORNER. This module is entered from a menubar or a
    // toolbar, so there is no canvas press behind it and showSideMenu had nothing to anchor
    // to -- every question it asks came up as the top-left side panel, in a different place
    // and a different style from every menu reached by clicking the canvas.
    // graph.openMenuAtPointer (flexigraph/gene.js) draws the same list at the pointer, and
    // defers to an open floating session when this module is instead reached from a press,
    // so the mixed-entry callers keep their place. The || keeps older graphs working.
    return new Promise(async (resolve) => {
        // Ensure the recorder is running (it normally starts at editor load).
        let H = graph.__viewHistory;
        if (!H || !H.__installed) {
            try { H = await exec('baja/manchester/menu/view-history.js', graph); } catch (e) { H = null; }
        }
        if (!H) { graph.setMessage(' View history is unavailable. '); resolve(null); return; }

        const spanLabel = (st) => {
            const w = Math.abs(st.xmax - st.xmin);
            return w > 0 ? '  (span ' + (w >= 1000 ? (w / 1000).toFixed(1) + 'k' : Math.round(w)) + ')' : '';
        };

        const show = () => {
            if (!H.stack.length) {
                graph.setMessage(' No view history yet — pan/zoom and pause for 2s to record a view. ');
            }
            const items = [];
            items.push({
                label: H.canBack() ? '◀ Back' : '◀ Back — at start', move: () => { log(''); },
                click: () => {
                    if (H.back()) graph.setMessage(' View ' + (H.index + 1) + ' / ' + H.stack.length + ' ');
                    else graph.setMessage(' Already at the earliest view. ');
                    show();
                }
            });
            items.push({
                label: H.canForward() ? 'Forward ▶' : 'Forward ▶ — at latest', move: () => { log(''); },
                click: () => {
                    if (H.forward()) graph.setMessage(' View ' + (H.index + 1) + ' / ' + H.stack.length + ' ');
                    else graph.setMessage(' Already at the most recent view. ');
                    show();
                }
            });
            // Jump list: each recorded view, current marked.
            H.stack.forEach((st, i) => {
                items.push({
                    label: (i === H.index ? '✓ ' : '● ') + 'view ' + (i + 1) + spanLabel(st),
                    move: () => { log(''); },
                    click: () => { H.goto(i); graph.setMessage(' View ' + (i + 1) + ' / ' + H.stack.length + ' '); show(); }
                });
            });
            items.push({
                label: 'Clear history', move: () => { log(''); },
                click: () => { H.clear(); graph.setMessage(' View history cleared. '); if (graph.showSideMenu) graph.showSideMenu(null); resolve(null); }
            });
            (graph.openMenuAtPointer || graph.showSideMenu).call(graph, items);
        };

        show();
        resolve(null);
    });
}
