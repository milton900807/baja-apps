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

            const LM = await exec('baja/bio/layer-match.js');

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

            const apply = () => {
                const removed = [], kept = [];
                for (const p of plan) {
                    const layers = Array.isArray(p.track.track_layers) ? p.track.track_layers.slice() : [];
                    const go = p.hits.map((h) => h.layer).filter((l) => layers.indexOf(l) >= 0);
                    const stay = layers.filter((l) => go.indexOf(l) < 0);
                    for (const l of go) {
                        removed.push({
                            track: '' + (p.track.name || 'a track'), name: LM.nameOf(l),
                            kind: '' + ((l && l.data_type) || '')
                        });
                    }
                    for (const l of stay) kept.push(LM.nameOf(l));
                    if (go.length) {
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
            const guessed = candidates.filter((c) => c.why === 'shape');
            const sweeping = candidates.some((c) => c.why === 'all');
            const ask = (o.confirm === true)
                || (o.confirm !== false && (guessed.length > 0 || sweeping));

            if (!ask) { resolve(apply()); return; }

            const what = candidates.map((c) => c.name + (c.why === 'shape' ? ' (peaks)' : '')).join(', ');
            const where = ts.map((t) => t.name || 'a track').join(' and ');
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
