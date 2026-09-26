function (graph, genegraph_panel_layout, track, screenX, screenY) {

    // MACHINE LEARNING MODELS, as a menu on the track rather than a room to walk into.
    //   exec('baja/ml/models-menu.js', graph, genegraph_panel_layout, track, sx, sy)
    //
    // The shelf (baja/ml/models-library.js) is the reading room: every model with what it
    // predicts, how it was built and what it cannot tell you, and an explicit Load at the end.
    // That is the right shape the first time and the wrong one the fifth, when the model is
    // already known and the only question is which track to put it on. This lists the same
    // models -- from the same catalogue, so the two cannot disagree about what exists -- one
    // click from the track's own menu.
    //
    // The track is decided by the caller and not guessed: this opens from a track's menu, so
    // the track IS the target, and nothing here falls back to the selection or asks for a
    // click. The last entry opens the shelf for whoever wants to read first.

    return (async () => {
        const L = genegraph_panel_layout;
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const tracks = track ? [track] : [];

        // The catalogue's books call this to get their tracks. Here the answer is already
        // known, which is the whole point of reaching a model from the track's own menu: no
        // picker, no "click a track", no fan-out across the board.
        const runOn = async (title, run) => {
            try { window.__bajaApplyAllTracks = false; } catch (e) { }
            if (!tracks.length) { say('Select a track first — ' + title + ' runs against one.'); return false; }
            return run(tracks);
        };

        let books = [], groups = [];
        try {
            const cat = await exec('baja/ml/models-catalogue.js', graph, L, tracks, runOn);
            books = (cat && cat.books) || [];
            groups = (cat && cat.groups) || [];
        } catch (e) {
            say('The model catalogue could not be read: ' + (e && e.message ? e.message : e));
            return null;
        }
        if (!books.length) { say('No models are available.'); return null; }

        const popup = (items, sx, sy, title) =>
            exec('baja/manchester/menu/popup-menu.js', graph, items, sx, sy, { title: title });

        // WHAT A MODEL SAYS IT NEEDS, asked before it is run rather than reported after.
        // A book carrying a `choice` (BajaCLIP: which RNA-binding protein) cannot be run from
        // a single click, and the shelf asks for it on the card. Here the options become the
        // model's own submenu, which is the same question one level in.
        const choiceMenu = async (b, sx, sy) => {
            const ch = b.docs && b.docs.choice;
            let options = [];
            try {
                say('Loading ' + (ch.label || 'options') + '…');
                options = (typeof ch.options === 'function') ? (await ch.options()) : (ch.options || []);
            } catch (e) {
                say((ch.empty || 'Those options could not be read') + ' — ' + (e && e.message ? e.message : e));
                return;
            }
            options = (options || []).filter(Boolean);
            if (!options.length) { say(ch.empty || 'No options are available for ' + b.title + '.'); return; }

            // A popup has no scrollbar, so a long list is cut and the rest is left to the
            // shelf's own picker rather than run off the bottom of the screen.
            const CAP = 18;
            const shown = options.slice(0, CAP);
            const items = [];
            if (ch.note) items.push({ label: ch.note, header: true });
            for (const o of shown) {
                items.push({
                    label: ('' + (o.label || o.value)),
                    move: () => { },
                    click: async () => {
                        say('Running ' + b.title + ' — ' + (o.value || o.label) + ' on ' + (track && track.name || 'the track') + '…');
                        try { await b.open(o.value); } catch (e) { say(b.title + ' failed: ' + (e && e.message ? e.message : e)); }
                    }
                });
            }
            if (options.length > shown.length) {
                items.push({ type: 'separator' });
                items.push({
                    label: 'All ' + options.length + ' in the library…',
                    move: () => { },
                    click: async () => { await openLibrary(); }
                });
            }
            await popup(items, sx, sy, b.title);
        };

        const runBook = async (b, sx, sy) => {
            if (b.docs && b.docs.choice) return choiceMenu(b, sx, sy);
            if (b.ready === false) {
                // The book's own open() carries the "coming soon" wording; calling it keeps
                // that sentence in one place.
                try { await b.open(); } catch (e) { }
                return;
            }
            say('Running ' + b.title + ' on ' + (track && track.name || 'the track') + '…');
            try { await b.open(); } catch (e) { say(b.title + ' failed: ' + (e && e.message ? e.message : e)); }
        };

        const openLibrary = async () => {
            try { await exec('baja/ml/models-library.js', graph, L, tracks); }
            catch (e) { say('The model library could not be opened: ' + (e && e.message ? e.message : e)); }
        };

        // A model that needs a choice, or a group of models, LEADS SOMEWHERE, and the chevron
        // is how every other menu in the editor says so.
        const leads = (b) => !!(b.docs && b.docs.choice);
        const itemFor = (b) => ({
            label: b.title + (b.ready === false ? '  (soon)' : (leads(b) ? ' ▸' : '')),
            disabled: false,
            move: () => { },
            click: async (sx, sy) => { await runBook(b, sx, sy); }
        });

        const items = [];
        // Groups first, so the three splicing models read as one body of work rather than as
        // three entries that happen to share a prefix -- the same grouping the shelf makes,
        // from the same `group` field.
        for (const g of groups) {
            const members = books.filter((b) => b.group === g.key);
            if (!members.length) continue;
            items.push({
                label: g.title + ' ▸',
                move: () => { },
                click: async (sx, sy) => {
                    const sub = members.map(itemFor);
                    await popup(sub, sx, sy, g.title);
                }
            });
        }
        for (const b of books) {
            if (groups.some((g) => g.key === b.group)) continue;
            items.push(itemFor(b));
        }

        items.push({ type: 'separator' });
        items.push({
            // What the shelf is FOR, said plainly: the menu runs a model, the library explains
            // it first. Someone who does not yet know which model they want needs the room.
            label: 'Browse the library…',
            move: () => { },
            click: async () => { await openLibrary(); }
        });

        return await popup(items, screenX, screenY,
            'Models · ' + ((track && track.name) || 'Track'));
    })();
}
