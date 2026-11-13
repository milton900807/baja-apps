function (graph, selectedTrack, kind) {

    // DESIGN THE SITE, OR CHOOSE THE SITE YOURSELF.
    //   const how = await exec('baja/manchester/menu/design-or-place.js', graph, track, 'steric');
    //   // 'design' -> the caller runs its own dialog;  anything else -> nothing more to do
    //
    // The design dialog answers "where should this go", by scoring every start position. That
    // is the right question most of the time and the wrong one when the site is already
    // decided: a published compound being reproduced, a site a collaborator named, a window
    // picked off a splicing profile. Then the whole ranking is noise and what is wanted is a
    // compound of a chosen chemistry, placed where it is clicked.
    //
    // Both were reachable before, from different menus, and nothing said they were
    // alternatives. Asked here, at the point the design is about to run, because this is
    // where the choice actually gets made.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const isGapmer = ('' + (kind || '')).toLowerCase().indexOf('gap') >= 0;

        const current = graph.props && graph.props.selected_chemistry;
        const currentName = current && (current.name || current.type);

        const place = (chem) => {
            try {
                graph.props.selected_chemistry = chem;
            } catch (e) { result('Could not set the chemistry: ' + e); return; }

            // ---- THE HOVER HANDLER WOULD TAKE THE FIRST CLICK -------------------------
            //
            // When a menu closes, gene.js schedules a re-arm of mouse-over-highlight at +40
            // and +180 ms, guarded only by "are there no mouse listeners right now". draw-
            // oligos.js awaits biopolymer.js before it arms its own, so in that gap the
            // guard is true, the hover handler comes back, and the first click on the canvas
            // is read as a click on the selection: the selected-sequence menu opens and no
            // compound is placed. Nothing is wrong with either piece; they are racing.
            //
            // __hoverRearm is gene.js's own override for this, checked before it re-arms, so
            // the handoff is declared rather than fought. It is restored after the window
            // both timers live in, and only that window: once draw-oligos has its listeners
            // the ordinary guard does the job again.
            try {
                const prev = graph.__hoverRearm;
                graph.__hoverRearm = () => { };
                setTimeout(() => { try { graph.__hoverRearm = prev; } catch (e) { } }, 600);
            } catch (e) { }
            // ---- AND THE SELECTION WOULD TAKE IT BEFORE ANY LISTENER SAW IT ----------
            //
            // This is the one that was actually biting. gene.js's own mousedown handler runs
            // BEFORE this.mouseDownListeners: a press inside an existing selection is claimed
            // by __trackAtSelection, which opens the selected-sequence menu and RETURNS. So
            // with 15 nt selected on the track, every click was the selection's click and
            // draw-oligos never heard one, whoever else was or was not armed.
            //
            // clearSequenceSelections() is gene.js's own method for this: it drops every
            // track's marks and the drag state behind them, which is what stops the next
            // mouse-up re-applying the range just cleared. Said out loud in the message
            // below, because losing a selection you made on purpose should not be silent.
            let __cleared = 0;
            try { __cleared = graph.clearSequenceSelections() || 0; } catch (e) { __cleared = 0; }

            // What the working callers of draw-oligos do first (compound-editor.js): the
            // drag that places a compound is a navigate-mode drag.
            try { graph.setMouseMode('navigate'); } catch (e) { }

            say('Click and drag along the track to place the compound.'
                + (__cleared ? ' (The sequence selection was cleared: a click inside one opens its menu instead.)' : ''));
            try {
                // draw-oligos.js is the existing click-and-drop tool; it reads the chemistry
                // off graph.props and takes the length from it, so setting both here is the
                // whole of the handover.
                Promise.resolve(exec('baja/manchester/menu/draw-oligos.js', graph)).catch((e) => {
                    result('Could not start placing: ' + (e && e.message ? e.message : e));
                });
            } catch (e) { result('Could not start placing: ' + e); }
        };

        return await new Promise((resolve) => {
            let done = false;
            const finish = (v) => { if (!done) { done = true; resolve(v); } };

            const chemMenu = () => {
                // A CAPTION, NOT A ROW. `header: true` is the renderer's own convention
                // (popup-menu.js, flexigraph/gene.js): it draws as a small uppercase caption
                // and is not clickable. A label with a no-op click draws as a BUTTON that
                // does nothing when pressed, which is how these menus came out with rows
                // that looked live and were not.
                const items = [
                    { label: 'Chemistry for the compound you place', header: true },
                    {
                        // The full editor: architecture, length, a sugar per region and a
                        // linkage per position, from the vocabulary biopolymer.js defines
                        // rather than from a canned list. Two templates was the wrong shape
                        // of answer to "which chemistry" -- the question has four parts.
                        label: 'Build a chemistry\u2026',
                        move: () => { },
                        click: async () => {
                            try { graph.showSideMenu(null); } catch (e) { }
                            let chem = null;
                            try {
                                chem = await exec('baja/manchester/menu/chemistry-builder.js',
                                    isGapmer ? 'gapmer' : 'steric', null);
                            } catch (e) { result('Could not open the chemistry editor: ' + e); finish(null); return; }
                            if (!chem) { finish(null); return; }   // cancelled in the editor
                            place(chem);
                            finish('place');
                        }
                    }
                ];
                if (current) {
                    items.push({
                        label: 'Use the current chemistry' + (currentName ? (' (' + currentName + ')') : ''),
                        move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } place(current); finish('place'); }
                    });
                }
                items.push({
                    label: '‹ Back', move: () => { },
                    click: () => { try { graph.showSideMenu(null); } catch (e) { } top(); }
                });
                if (graph.openMenuAtPointer) graph.openMenuAtPointer(items, 'Chemistry');
                else graph.showSideMenu(items);
            };

            const top = () => {
                const items = [
                    { label: (isGapmer ? 'Gapmer' : 'Steric-blocking') + ' ASO', header: true },
                    {
                        // The trailing arrow is the renderer's mark for a row that opens
                        // another menu, so a row that asks a second question reads
                        // differently from one that acts.
                        label: 'Place one by hand: choose a chemistry, then click the site ▸',
                        move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } chemMenu(); }
                    },
                    {
                        label: 'Design across the target: scoring, tiling or allele-selective',
                        move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } finish('design'); }
                    },
                    {
                        label: '‹ Cancel', move: () => { },
                        click: () => { try { graph.showSideMenu(null); } catch (e) { } finish(null); }
                    }
                ];
                if (graph.openMenuAtPointer) graph.openMenuAtPointer(items, 'Design');
                else graph.showSideMenu(items);
            };
            top();
        });
    })();
}
