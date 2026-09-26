function (graph, genegraph_panel_layout, tracks) {

    // `tracks` is what this library applies its models to, decided by whoever opened it:
    // the track menu passes that track, the board-level Layers button passes every track on
    // the canvas. The library does not decide -- it hands the list to the runner, which takes
    // a single track or an array in the same parameter.
    //
    // Opened with nothing (a bare menu entry), the runners fall back to the selection, then to
    // asking for a click, exactly as before.

    // Machine Learning Models — a bookshelf of the predictive models that write their output onto a
    // track as a layer.
    //   exec('baja/ml/models-library.js', graph, genegraph_panel_layout)
    //
    // Works the same way as the Data Library: each book opens a MAXIMISED reference view
    // describing what the model predicts, how it was built and what it cannot tell you, with
    // links out — then an explicit "Load this data" to run it. Closing returns to the editor.
    //
    // Every figure and caveat below is taken from the model libraries' own documentation
    // (py/bajair-lib, py/bajaclip-lib, py/bajasplice-lib), not estimated here. Where a library
    // states a limitation, it is repeated rather than smoothed over — a model shelf that only
    // lists capabilities invites people to over-read the output.

    return (async () => {
        const restoreHover = () => {
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };
        const L = genegraph_panel_layout;
        // Normalised once: a single track, an array, or nothing.
        const __targets = () => (Array.isArray(tracks) ? tracks.filter(Boolean) : (tracks ? [tracks] : []));

        // Every model runs against the track its leaf sits UNDER, and no other.
        //
        // Opened from a track's menu the track IS the parent and comes in as `tracks`. Opened
        // from the library menu nothing does, and each runner fell through to
        // baja/lib/for-each-track.js, which honours the board-wide flag the Layers button sets
        // on its way in -- so a click on one card ran the model on every track on the canvas,
        // one python call each. The Design Library already answers this by putting the tracks
        // in as a level to walk through; this is the same idiom, so the track is a node on the
        // path above the leaf rather than a flag set elsewhere.
        //
        // The flag is consumed here, before anything downstream can read it. It was a
        // statement of intent for a LOADER; a model run that fans out to tracks the user never
        // named is not what "apply to the board" was pressed for.
        //
        // `run(list)` is the model itself, handed the tracks to run on. `title` names the
        // level of track cards, so the path reads "Machine Learning Models > BajaCLIP > MALAT1".
        const __onParentTrack = async (title, run) => {
            try { window.__bajaApplyAllTracks = false; } catch (e) { }
            const explicit = __targets();
            if (explicit.length) return run(explicit);
            const all = ((graph && graph.track) || []).filter(Boolean);
            if (!all.length) {
                const msg = ' Load a track first — ' + title + ' runs against one. ';
                try { graph.setResultMessage(msg); } catch (e) { try { graph.setMessage(msg); } catch (e2) { } }
                return false;
            }
            // One track: it is the only possible parent, and a level holding a single card is
            // a click that asks nothing.
            if (all.length === 1) return run([all[0]]);
            return exec('baja/lib/shelf.js', {
                id: 'baja-models-library-tracks',
                title: title,
                subtitle: 'Pick the track to run against — the layer goes on that track only',
                graph: graph,
                onClose: restoreHover,
                books: all.map((t, i) => ({
                    title: t.name || ('track ' + (i + 1)),
                    badge: (t.track_type || 'Track'),
                    blurb: 'Run ' + title + ' on ' + (t.name || 'this track')
                        + ((() => { try { return (t.selectedRange && t.selectedRange()) ? ', over its selected sequence' : ''; } catch (e) { return ''; } })())
                        + '.',
                    open: () => run([t])
                }))
            });
        };

        // THE CATALOGUE IS SHARED. It used to be a BOOKS array right here, which made this
        // file the only way to reach a model. The track menu now lists the same models as a
        // submenu, and a catalogue kept in two places drifts: a model added to one and not the
        // other exists in the shelf and not in the menu, and neither copy says which is stale.
        // __onParentTrack goes in because the caller owns the decision of WHICH tracks to run
        // against -- here, ask when several are loaded; from a track menu, the track is known.
        const { books: BOOKS, groups: GROUPS } =
            await exec('baja/ml/models-catalogue.js', graph, L, tracks, __onParentTrack);

        const grouped = GROUPS.map((g) => {
            const members = BOOKS.filter((b) => b.group === g.key);
            if (!members.length) return null;
            return {
                title: g.title, badge: g.badge, subtitle: g.subtitle, blurb: g.blurb,
                books: () => members
            };
        }).filter(Boolean);
        const ungrouped = BOOKS.filter((b) => !GROUPS.some((g) => g.key === b.group));

        // Say up front what a model will run against. A model quietly running on one track when
        // the user meant the board -- or over a selection they had forgotten about -- is the
        // kind of thing only noticed after the layer lands in the wrong place.
        const scopeNote = () => {
            const ts = __targets();
            let marked = 0;
            try { marked = ts.filter((t) => t && t.selectedRange && t.selectedRange()).length; } catch (e) { }
            if (marked) return 'the selected sequence on ' + marked + ' track' + (marked === 1 ? '' : 's');
            if (ts.length) return ts.length + ' track' + (ts.length === 1 ? '' : 's');
            return 'the track you pick';
        };

        return await exec('baja/lib/shelf.js', {
            id: 'baja-models-library',
            title: 'Machine Learning Models',
            subtitle: BOOKS.length + ' models — each adds its prediction as a layer, over '
                + scopeNote(),
            books: grouped.concat(ungrouped),
            graph: graph,
            onClose: restoreHover
        });
    })();
}
