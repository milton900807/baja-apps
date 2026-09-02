function (graph, tracks) {

    // WHICH tracks a load or a model applies to, in ONE place.
    //   const t = await exec('baja/lib/target-tracks.js', graph, tracks);
    //   for (const track of t.items) { ... }        // t.scope describes the choice
    //
    // The precedence, and it is the whole point of this file:
    //
    //   1. tracks carrying a SEQUENCE selection  -> ONLY those, and the caller then clips its
    //      work to selectedRange() on each
    //   2. else, SELECTED tracks                 -> only those, full length
    //   3. else                                  -> every candidate, full length
    //
    // A selection is the user saying "here". Loading onto every track on the board while one
    // of them carries a highlighted region ignores the most explicit instruction the editor
    // has, and it is not a small mistake: it puts data on tracks the user was not looking at
    // and buries the one they were.
    //
    // This existed only inside baja/data/rnaseq-library.js (loadTargets), so RNASeq honoured a
    // selection and the patent, miRNA and interval loaders did not -- the same gesture behaved
    // differently depending on which menu item you had picked. One implementation now, so a
    // new loader inherits the rule rather than re-deciding it.
    //
    // `tracks` is the explicit set the caller was handed (a track menu passes one, the
    // board-level Layers button passes them all). With nothing passed, the whole canvas is the
    // candidate set.

    const all = (Array.isArray(tracks) && tracks.length)
        ? tracks.filter(Boolean)
        : (((graph && graph.track) || []).filter(Boolean));

    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    // ASK EACH TRACK, rather than asking the graph which tracks are marked. selectedRange() is
    // the same answer the designers, the models and the other loaders use, and it comes from
    // the track itself, so there is nothing in between to drop it. A graph-level helper that
    // returned an empty list would look exactly like "no selection" and fall through to
    // loading everything -- which is the failure this file exists to prevent.
    const marked = all.filter((t) => {
        try { return !!(t && t.selectedRange && t.selectedRange()); } catch (e) { return false; }
    });
    if (marked.length) {
        return {
            items: marked,
            scope: 'the selected sequence on ' + plural(marked.length, 'track'),
            narrowed: true,
            reason: 'sequence'
        };
    }

    let sel = [];
    try { sel = (graph.getSelectedTracks() || []).filter((t) => all.indexOf(t) >= 0); }
    catch (e) { sel = []; }
    if (sel.length) {
        return {
            items: sel,
            scope: plural(sel.length, 'selected track'),
            narrowed: true,
            reason: 'track'
        };
    }

    return {
        items: all,
        scope: all.length ? ('all ' + plural(all.length, 'track')) : 'no tracks',
        narrowed: false,
        reason: 'all'
    };
}
