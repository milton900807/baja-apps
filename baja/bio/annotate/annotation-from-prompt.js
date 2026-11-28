function (graph, track, options) {

    // SAY WHAT IS THERE, AND HAVE IT DRAWN.
    //   await exec('baja/bio/annotate/annotation-from-prompt.js', graph, track)
    //   await exec('baja/bio/annotate/annotation-from-prompt.js', graph, track,
    //              { text: 'DNM1 carries a regulated alternative 5′ splice site that '
    //                      + 'routes its own transcript to nonsense-mediated decay' })
    //
    // "Draw an annotation on DNM3" used to come back as not something the editor can do,
    // which was true: every shape on a track came from a file, a database or a scan, and
    // there was no way to put down the thing you already know. This is that way. The
    // sentence goes to py/bio/editor/annotate-from-prompt.py, the regions come back
    // ANCHORED rather than as numbers, and the anchors are resolved here against the real
    // track by baja/bio/track-regions.js.
    //
    // WHY THE MODEL IS NOT ALLOWED TO PICK A COORDINATE. It will produce one. It will be
    // plausible, and once it is a shape on a track it is indistinguishable from a measured
    // one: nothing downstream knows it was a guess, least of all a reader six months
    // later. So the model names the feature and says which exon, intron, UTR or annotation
    // it sits in, and the arithmetic -- which is where strand and ordinals go wrong -- is
    // done by the module that already does it everywhere else in the editor.
    //
    // CONFIDENCE TRAVELS WITH THE SHAPE. Every band carries the model's own reading on it,
    // the layer's help rows carry the reason for each one, and a low-confidence band is
    // drawn in outline rather than filled, because "documented in this gene" and "genes
    // like this usually have one" must not arrive looking the same.

    return (async () => {
        const o = options || {};
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) {
            try { graph.setMessage(' ' + m + ' '); } catch (e2) { } } };
        const name = ('' + ((track && track.name) || 'this track'));

        // ---- WHAT IS BEING CLAIMED ------------------------------------------------------
        let text = ('' + (o.text || '')).trim();
        if (!text) {
            text = await exec('baja/lib/prompt-text.js', {
                title: 'Draw an annotation on ' + name,
                message: 'Say what is there, in your own words. It is read against this '
                    + 'transcript and drawn where it belongs: "a regulated alternative 5′ '
                    + 'splice site that routes the transcript to nonsense-mediated decay", '
                    + '"the PUM1 site in the 3′ UTR", "the poison exon". Nothing is '
                    + 'measured here: what comes back is a reading, and each shape says how '
                    + 'sure it is.',
                placeholder: 'what is there, and where',
                action: 'Find it',
                multiline: true
            });
            if (text == null) { say('Nothing was drawn.'); return { ok: false, why: 'dismissed' }; }
            text = ('' + text).trim();
            if (!text) { say('Nothing was described, so nothing was drawn.'); return { ok: false, why: 'empty' }; }
        }

        const R = await exec('baja/bio/track-regions.js', track);
        const avail = R.available();

        // The context the server reasons over is what the TRACK says about itself, never
        // what the model remembers about the gene: an exon count from the wrong transcript
        // is how a poison exon lands two exons off.
        const annNames = [];
        try {
            for (const a of (track.annotations || [])) {
                const n = ('' + ((a && (a.name || a.type)) || '')).trim();
                if (n && annNames.indexOf(n) < 0) annNames.push(n);
                if (annNames.length >= 30) break;
            }
        } catch (e) { }
        const exonTable = [];
        try {
            for (let i = 1; i <= avail.exons; i++) {
                const e = R.resolve({ region: 'exon', index: i });
                if (e && !e.error) exonTable.push({ i: i, start: e.start, end: e.end, len: e.end - e.start + 1 });
            }
        } catch (e) { }

        const ctx = {
            gene: ('' + ((track.description || '').split(';')[0] || track.name || '')).trim(),
            transcript: ('' + (track.transcriptID || '')),
            chr: ('' + ((track.contig || track.chr) || '')),
            strand: avail.strand,
            start: Math.min(+track.xi, +track.xf), end: Math.max(+track.xi, +track.xf),
            length: avail.length, exons: avail.exons, introns: avail.introns,
            has_cds: !!avail.cds, has_5utr: !!avail.five_prime_utr, has_3utr: !!avail.three_prime_utr,
            annotations: annNames, exon_table: exonTable
        };

        say('Reading that against ' + name + '…');
        let res = null;
        try {
            // THE WAY EVERY OTHER SERVER MODULE IS CALLED HERE: the api host in front of
            // the path, and a monitor first so its progress lines reach the status bar
            // instead of nowhere. Called as a bare path it is a different endpoint, and
            // what came back was not an answer at all.
            const em = new EngineMonitor((m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } });
            res = await exec(window['env']['apiUrl'] + '/py/bio/editor/annotate-from-prompt.py',
                em, text, JSON.stringify(ctx), ('' + (o.extra || '')));
        } catch (e) {
            say('That could not be read: ' + ((e && e.message) ? e.message : e));
            return { ok: false, why: 'server' };
        }
        if (!res || res.error) {
            say('That could not be read' + ((res && res.error) ? (': ' + res.error) : '') + '.');
            return { ok: false, why: (res && res.error) || 'no answer' };
        }

        // ---- ANCHORS INTO COORDINATES ----------------------------------------------------
        // works.resolve hands lists back as JSON text, so this is where they become lists.
        let regions = [];
        try {
            regions = (typeof res.regions === 'string') ? (JSON.parse(res.regions) || [])
                : (res.regions || []);
        } catch (e) { regions = []; }
        const placed = [], refused = [];
        const minus = (avail.strand === '-');
        for (const r of regions) {
            const got = R.resolve(r.anchor || {});
            if (!got || got.error) {
                refused.push((r.label || 'a region') + ': ' + ((got && got.error) || 'could not be placed'));
                continue;
            }
            let a = got.start, b = got.end;
            // "The first N bases of" and "the last N bases of" are along the TRANSCRIPT, so
            // on a minus-strand gene the start of an exon is its high coordinate. Getting
            // this backwards puts a 5' splice site at the 3' end of the exon, which is a
            // different claim about a different piece of sequence.
            const part = ('' + (r.part || 'whole')).toLowerCase();
            const span = Math.max(0, Math.min(+r.span || 0, (b - a + 1)));
            if (span > 0 && (part === 'start' || part === 'end')) {
                const fromLow = (part === 'start') ? !minus : minus;
                if (fromLow) b = a + span - 1; else a = b - span + 1;
            }
            placed.push({
                label: ('' + (r.label || 'region')),
                kind: ('' + (r.kind || 'other')),
                why: ('' + (r.why || '')),
                confidence: ('' + (r.confidence || 'low')),
                anchorLabel: ('' + (got.label || '')),
                start: Math.round(Math.min(a, b)), end: Math.round(Math.max(a, b))
            });
        }

        const note = ('' + (res.note || '')).trim();
        if (!placed.length) {
            // NOTHING DRAWN IS AN ANSWER, and it has to say which kind: the model knew of
            // nothing, or it named something this transcript cannot carry. An empty canvas
            // says neither.
            say(name + ': nothing was drawn. '
                + (note || 'Nothing in that description could be placed on this transcript.')
                + (refused.length ? (' ' + refused.join('; ') + '.') : ''));
            return { ok: false, why: 'nothing placed', note: note, refused: refused };
        }

        // ---- THE LAYER --------------------------------------------------------------------
        const TrackLayer = await exec('baja/bio/track-layer.js');
        const lo = Math.min(+track.xi, +track.xf), hi = Math.max(+track.xi, +track.xf);
        const short = text.replace(/\s+/g, ' ').trim();
        const L = new TrackLayer(
            (track.name || 'track') + '_SAID_' + (short.slice(0, 28).replace(/[^A-Za-z0-9]+/g, '_')
                .replace(/^_|_$/g, '') || 'annotation'),
            lo, 0, hi, 1);
        L.type = 'DescribedAnnotation';
        L.labelColor = '#eaf6f9';
        L.fixedIntervalDepth = 12;
        L.allowStackedIntervals = true;
        L.pop = true;

        // Filled for documented, outlined for inferred. The eye sorts the layer before a
        // word of it is read, which is the only moment the distinction is free.
        const COLOR = {
            high: 'rgba(79,208,230,0.70)',
            medium: 'rgba(255,170,60,0.55)',
            low: 'rgba(255,255,255,0.18)'
        };
        const lanes = [0.72, 0.5, 0.28];
        const rows = [];
        placed.sort((x, y) => x.start - y.start);
        let i = 0;
        for (const p of placed) {
            L.addInterval(p.start, p.end, lanes[i % lanes.length],
                p.label + ' · ' + p.confidence,
                COLOR[p.confidence] || COLOR.low);
            i++;
            rows.push([p.label + ' · ' + p.start + '–' + p.end
                + (p.anchorLabel ? (' (' + p.anchorLabel + ')') : ''),
                p.confidence + ' · ' + (p.why || 'no reason given')]);
        }
        L.describedRegions = placed;
        L.decor = {
            help: {
                title: 'Drawn from a description',
                rows: rows,
                note: 'THESE SHAPES ARE A READING, NOT A MEASUREMENT. The sentence “'
                    + short + '” was read against this transcript by a language model; '
                    + 'nothing here was found in the sequence, scored, or checked against a '
                    + 'database. What the model was NOT allowed to do is pick a coordinate: '
                    + 'it named the exon, intron, UTR or annotation each feature sits in, and '
                    + 'the editor turned that into a position. So a band is in the right '
                    + 'place if the feature really is in that exon, and nowhere near it if it '
                    + 'is not. Filled bands are what the model says is documented for this '
                    + 'gene; outlined ones are what it infers from genes like it. Check them '
                    + 'before they become a figure.'
                    + (note ? ('  The model adds: ' + note) : '')
                    + (refused.length ? ('  Not placed: ' + refused.join('; ') + '.') : '')
            }
        };
        try { track.addLayer(L); } catch (e) { try { (track.track_layers || []).push(L); } catch (e2) { } }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        const sure = placed.filter((p) => p.confidence === 'high').length;
        say(name + ': ' + placed.length + ' region' + (placed.length === 1 ? '' : 's') + ' drawn ('
            + sure + ' the model calls documented, ' + (placed.length - sure) + ' inferred). '
            + 'They are a reading of what you wrote, placed by exon and annotation rather than '
            + 'measured, so check them before they become a figure.'
            + (refused.length ? (' Not placed: ' + refused.join('; ') + '.') : ''));
        return { ok: true, layer: L, regions: placed, refused: refused, note: note, asked: text };
    })();
}
