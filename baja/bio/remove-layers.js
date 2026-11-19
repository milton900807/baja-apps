function (graph, tracks, opts) {

    // TAKE LAYERS OFF A TRACK.
    //   exec('baja/bio/remove-layers.js', graph, [track], { match: 'rna seq' })
    //
    // "remove the rna seq layers from mapk8ip3_mrna" was answered by opening the shelf of
    // data that can be LOADED, which is the opposite of what was asked. Loading had an
    // operation and unloading did not.
    //
    // WHAT IS REMOVED IS NAMED BEFORE IT GOES, and the names come back in the result so the
    // card can say them. A removal that reports "3 layers removed" is one the user cannot
    // check: the only way to find out which three is to look for what is missing.
    //
    // MATCHED BY KIND, BY NAME, AND BY WHAT THE LAYER IS DRAWN AS, in baja/bio/layer-match.js
    // so that the card previewing this removal and the removal itself cannot disagree about
    // which layers are meant.
    //
    // ASKED FIRST WHEN THE MATCH IS A GUESS. A coverage trace loaded from a bigwig carries no
    // data_type and is named after the file, so the only thing that says it is RNA-seq is its
    // shape: a filled trace of many points at varying heights. Acting on that silently would
    // take layers the user never pointed at, so a shape match -- and a sweeping "remove
    // everything" -- is put to the user first, by name, and removed only on a yes.
    //
    // THIS RESOLVES BEFORE THE ANSWER COMES BACK, with pending: true and the layers it asked
    // about. A confirmation panel can be dismissed by clicking away from it, which reports
    // nothing at all, so a promise that waited for a yes or a no would sometimes wait for
    // ever and the card would hang with it.

    return new Promise(async (resolve) => {
        try {
            const o = opts || {};
            const ts = (tracks || []).filter(Boolean);
            if (!ts.length) { resolve({ error: 'no track to take layers off' }); return; }

            // SAID OUT LOUD WHEN IT CANNOT BE LOADED. Falling back to "nothing matched" here
            // produces exactly the symptom this code exists to fix -- peaks on the screen and
            // a card saying there is nothing there -- and hides the real cause, which is a
            // file that did not reach the server.
            let LM = null;
            try { LM = await exec('baja/bio/layer-match.js'); } catch (e) { LM = null; }
            if (!LM || typeof LM.match !== 'function') {
                resolve({ error: 'The layer matcher (baja/bio/layer-match.js) could not be loaded, '
                    + 'so which layers you mean cannot be worked out. Nothing was removed.' });
                return;
            }

            // What would go, per track, and why it was matched.
            const plan = [];
            for (const t of ts) {
                const hits = LM.match(t.track_layers, o.match || '');
                if (hits.length) plan.push({ track: t, hits: hits });
            }

            if (!plan.length) {
                const names = [];
                for (const t of ts) {
                    for (const l of (t.track_layers || [])) names.push(LM.describe(l));
                }
                resolve({
                    removed: [], error: 'Nothing matched "' + (o.match || 'that') + '" on '
                        + ts.map((t) => t.name || 'a track').join(' and ')
                        // WITH THEIR KINDS. A list of names is not enough to retry with: the
                        // user asked for the rna seq layer and none of these names says rna
                        // seq, which is the whole reason the first attempt missed.
                        + (names.length ? ('. The layers there are: ' + names.join(', ') + '.')
                            : '. That track has no layers on it.')
                });
                return;
            }

            const candidates = [];
            for (const p of plan) {
                for (const h of p.hits) {
                    candidates.push({
                        track: '' + (p.track.name || 'a track'),
                        name: LM.nameOf(h.layer),
                        kind: '' + ((h.layer && h.layer.data_type) || ''),
                        why: h.why
                    });
                }
            }

            // `only` limits it to one layer, for the chooser below; otherwise everything that
            // was matched goes.
            const apply = (only) => {
                try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                const removed = [], kept = [];
                for (const p of plan) {
                    const layers = Array.isArray(p.track.track_layers) ? p.track.track_layers.slice() : [];
                    const go = p.hits.map((h) => h.layer)
                        .filter((l) => layers.indexOf(l) >= 0 && (!only || l === only));
                    const stay = layers.filter((l) => go.indexOf(l) < 0);
                    for (const l of go) {
                        removed.push({
                            track: '' + (p.track.name || 'a track'), name: LM.nameOf(l),
                            kind: '' + ((l && l.data_type) || '')
                        });
                    }
                    for (const l of stay) kept.push(LM.nameOf(l));
                    if (go.length) {
                        // A CHILD TRACK MIRRORS ITS PARENT'S LAYERS EVERY REDRAW, so a layer
                        // taken off here is pushed straight back on the next tick unless the
                        // track is told it was the user who took it (baja/bio/track.js).
                        for (const l of go) {
                            try { if (p.track.noteLayerRemoved) p.track.noteLayerRemoved(l); } catch (e) { }
                        }
                        // NOTHING IS DESTROYED THAT CANNOT BE PUT BACK. The layers are held on
                        // the track they came off, so an undo has something to restore and a
                        // mistaken "remove all" is not the end of an afternoon's loading.
                        try {
                            p.track.__removedLayers = (p.track.__removedLayers || []).concat(go);
                            if (p.track.__removedLayers.length > 60) {
                                p.track.__removedLayers = p.track.__removedLayers.slice(-60);
                            }
                        } catch (e) { }
                        p.track.track_layers = stay;
                    }
                }
                try { if (graph.wake) graph.wake(); } catch (e) { }
                try {
                    graph.setMessage('Removed ' + removed.length + ' layer' + (removed.length === 1 ? '' : 's')
                        + ': ' + removed.map((r) => r.name).join(', ')
                        + (kept.length ? ('. Still there: ' + kept.join(', ')) : '. Nothing left on it')
                        + '.');
                } catch (e) { }
                return { removed: removed, kept: kept, count: removed.length };
            };

            // Asked about when the match is a guess from the drawing, or when the request
            // sweeps the track bare. A layer named or kinded outright is what the user asked
            // for and goes without a second question.
            const guessed = candidates.filter((c) => c.why === 'shape' || c.why === 'polygon');
            const sweeping = candidates.some((c) => c.why === 'all');
            const ask = (o.confirm === true)
                || (o.confirm !== false && (guessed.length > 0 || sweeping));

            if (!ask) { resolve(apply()); return; }

            const where = ts.map((t) => t.name || 'a track').join(' and ');

            // ONE ROW PER LAYER, NOT ONE YES-OR-NO. What is drawn as a trace is not always
            // RNA-seq: the same shape carries a secretion profile, a transfer plateau, a
            // conservation curve. A single "remove these 4?" makes the user accept layers
            // they did not mean in order to lose the one they did, so each is offered on its
            // own, with its kind and how many points it has, and the menu comes back with
            // whatever is left until the user is done.
            const perLayer = guessed.length > 0 && typeof graph.showMenu === 'function';
            if (perLayer) {
                const gone = [];
                const layerOf = (c) => {
                    for (const p of plan) {
                        for (const h of p.hits) {
                            if (LM.nameOf(h.layer) === c.name && gone.indexOf(h.layer) < 0) return h.layer;
                        }
                    }
                    return null;
                };
                const show = () => {
                    const left = candidates.filter((c) => {
                        const l = layerOf(c);
                        return l && gone.indexOf(l) < 0;
                    });
                    if (!left.length) {
                        try {
                            graph.setMessage(gone.length
                                ? ('Removed ' + gone.length + ' layer' + (gone.length === 1 ? '' : 's')
                                    + ': ' + gone.map((l) => LM.nameOf(l)).join(', ') + '.')
                                : 'Left them alone: nothing was removed.');
                        } catch (e) { }
                        return;
                    }
                    const items = [];
                    items.push({ type: 'text', label: '\u26a0  Which of these on ' + where
                        + ' is the RNA-seq to remove?', move: () => { }, click: () => { } });
                    items.push({ type: 'text', label: '      Each of these is drawn as a FILLED '
                        + 'polygon with peaks; what follows each name is what else about it points '
                        + 'at read coverage. Likeliest first. Pick one and the rest stay; undo '
                        + 'puts any of them back.',
                        move: () => { }, click: () => { } });
                    items.push({ type: 'separator', label: '', move: () => { }, click: () => { } });
                    for (const c of left) {
                        const l = layerOf(c);
                        // WHY THIS ONE LOOKS LIKE RNA-SEQ, on the row itself. "Remove layer 3"
                        // asks the user to take the editor's word for it; the properties that
                        // made it a candidate are what they can actually judge.
                        items.push({
                            label: 'Remove ' + c.name + ' \u00b7 ' + LM.evidence(l).join(', '),
                            emphasis: 'danger',
                            move: () => { },
                            click: () => { apply(l); gone.push(l); show(); }
                        });
                    }
                    if (left.length > 1) {
                        items.push({ type: 'separator', label: '', move: () => { }, click: () => { } });
                        items.push({
                            label: 'Remove all ' + left.length + ' of them',
                            emphasis: 'danger', move: () => { },
                            click: () => { for (const c of left) { const l = layerOf(c); if (l) { apply(l); gone.push(l); } } show(); }
                        });
                    }
                    items.push({ label: gone.length ? 'Done' : 'Cancel', move: () => { },
                        click: () => {
                            try {
                                graph.setMessage(gone.length
                                    ? ('Removed ' + gone.length + ' layer' + (gone.length === 1 ? '' : 's')
                                        + ': ' + gone.map((l) => LM.nameOf(l)).join(', ') + '.')
                                    : 'Left them alone: nothing was removed.');
                            } catch (e) { }
                        } });
                    graph.showMenu(items, 0, 0, 620);
                };
                show();
                resolve({ pending: true, asked: candidates.length, candidates: candidates,
                    guessed: guessed.length, perLayer: true, removed: null });
                return;
            }

            // No menu to draw on: one question for the lot, which is better than acting on a
            // guess without asking at all.
            const what = candidates.map((c) => c.name
                + (c.why === 'shape' || c.why === 'polygon' ? ' (peaks)' : '')).join(', ');
            const msg = 'Remove ' + candidates.length + ' layer' + (candidates.length === 1 ? '' : 's')
                + ' from ' + where + ': ' + what + '.'
                + (guessed.length
                    ? (' ' + (guessed.length === 1 ? 'One of these is' : guessed.length + ' of these are')
                        + ' not labelled as RNA-seq and ' + (guessed.length === 1 ? 'was' : 'were')
                        + ' matched by being drawn as a filled trace with peaks.')
                    : '')
                + ' They can be put back with undo.';

            let answered = false;
            const fallback = await exec('baja/lib/confirm.js', msg, () => {
                if (answered) return;
                answered = true;
                apply();
            }, 'Remove', () => {
                if (answered) return;
                answered = true;
                try { graph.setMessage('Left them alone: nothing was removed.'); } catch (e) { }
            });
            try { showModal(fallback); } catch (e) { }

            resolve({
                pending: true, asked: candidates.length, candidates: candidates,
                guessed: guessed.length, removed: null
            });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
