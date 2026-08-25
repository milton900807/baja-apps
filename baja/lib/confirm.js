function (message, execFunction, yesLabel) {
    // Show the confirmation as a center menu rendered ON THE GRAPH canvas (navy panel,
    // centered) instead of a pop-out modal window. Returns null; showModal(null) is a
    // guarded no-op (see lib/core.js), so existing `showModal(await exec(...))` callers
    // still work unchanged. The confirm button reads as the destructive action — an
    // explicit `yesLabel` if given, otherwise inferred from the message's verb.
    const inferAction = (msg) => {
        const m = ('' + msg).toLowerCase();
        const verbs = [
            ['remove', 'Remove'], ['delete', 'Delete'], ['clear', 'Clear'],
            ['start fresh', 'Start fresh'], ['reset', 'Reset'], ['reverse', 'Reverse'],
            ['discard', 'Discard'], ['overwrite', 'Overwrite'], ['replace', 'Replace'],
            ['flip', 'Flip'], ['create', 'Create']
        ];
        for (const [needle, label] of verbs) {
            if (m.indexOf(needle) >= 0) return label;
        }
        return 'Yes';
    };
    const actionLabel = (yesLabel && ('' + yesLabel).trim()) ? ('' + yesLabel).trim() : inferAction(message);

    const graph = (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed)
        ? CurrentLayout.getStashed('graph') : null;

    // Snapshot the current state onto the undo/history stack BEFORE running a
    // (usually destructive) confirmed action, so it can be undone.
    const doAction = () => {
        try { if (graph && graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
        try { execFunction(); } catch (e) { }
    };

    try {
        if (graph && typeof graph.showMenu === 'function') {
            // Word-wrap the message into a few non-clickable header rows.
            const wrap = (text, max) => {
                const words = ('' + text).split(/\s+/).filter(Boolean);
                const lines = [];
                let cur = '';
                for (const w of words) {
                    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; }
                    else cur = cur ? (cur + ' ' + w) : w;
                }
                if (cur) lines.push(cur);
                return lines.length ? lines : [''];
            };

            const lines = wrap(message, 46);
            const items = lines.map((ln, i) => ({
                label: (i === 0 ? '⚠  ' : '      ') + ln,
                move: () => { },
                click: () => { }            // header rows: clicking just dismisses (like Cancel)
            }));
            items.push({
                label: '✓  ' + actionLabel,
                move: () => { },
                click: () => { doAction(); }
            });
            // showMenu() auto-appends a Cancel entry and centers the panel on the canvas.
            graph.showMenu(items, 0, 0, 380);
            return null;
        }
    } catch (e) { }

    // Fallback: the original modal, used only when no graph is available.
    let zoom_to = {
        wid: 'card',
        height: '230px',
        componentRef: 'bottomPanel',
        data: {
            height: '500px',
            cards: [
                [
                    {
                        'title': ' ', 'body': ``,
                        'width': '90%',
                        'component': { wid: 'html', data: `<font color=red> ${message} </font>` }
                    }],
                [
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: actionLabel, ionFunction: createIonFunction(() => {
                                            doAction();
                                            hideAllModal();
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            hideAllModal();
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ],
                [
                    {
                        'title': '',
                        'width': '100%',
                        'component': { wid: 'html', data: '' }
                    }
                ]]
        }
    }
    return zoom_to;
}
