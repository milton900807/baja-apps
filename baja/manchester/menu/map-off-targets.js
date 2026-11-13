function (graph, oligos) {

    // PUT THE COMPOUND ON THE GENE IT SHOULDN'T BIND.
    //   await exec('baja/manchester/menu/map-off-targets.js', graph, list);
    //
    // The screen says a compound hits SRSF1 at an edit distance of 2. That is a row in a
    // table, and a row is hard to act on: whether it matters depends on WHERE in the gene it
    // lands -- an exon, the 3' UTR, an intron nobody keeps -- and that is a question only the
    // drawing answers. So this loads the off-target gene and marks the site on it.
    //
    // TWO WAYS TO PLACE IT, AND THE ANSWER SAYS WHICH WAS USED.
    //
    //   by sequence     the compound's own sequence is searched in the loaded track, reverse
    //                   complement first. When it is found, the site is exact and
    //                   self-validating: it is the place the duplex can actually form, not a
    //                   coordinate anyone converted.
    //   by coordinate   when the sequence is not in the loaded transcript -- a hit in an
    //                   intron, a UTR the transcript trims, a different transcript of the
    //                   same gene -- the screen's own chr/start/end is mapped through
    //                   track-coords. That is the hit the screen found, placed as well as
    //                   this track can place it.
    //
    // A marker never implies more than was established, so the two are labelled differently
    // and counted separately, and a hit that can be placed neither way is reported rather
    // than quietly dropped.
    return (async () => {
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const list = (oligos || []).filter(Boolean);
        if (!list.length) { say('No compounds selected.'); return 0; }

        const C = await exec('baja/bio/track-coords.js');

        // ---- what the screen found -----------------------------------------------
        const byGene = new Map();
        let withHits = 0;
        for (const o of list) {
            const raw = o.offtarget;
            if (!Array.isArray(raw) || !raw.length) continue;
            withHits++;
            for (const h of raw) {
                const sym = ('' + ((h && (h.symbol || h.gene || h.gene_symbol)) || '')).trim();
                if (!sym) continue;
                if (!byGene.has(sym)) byGene.set(sym, []);
                byGene.get(sym).push({ o: o, h: h });
            }
        }
        if (!byGene.size) {
            result(withHits
                ? 'The off-target hits on these compounds carry no gene, so there is nothing to open.'
                : 'None of the selected compounds has an off-target hit list. Run the screen first, '
                  + 'and note that a compound with more than a thousand hits keeps only a count.');
            return 0;
        }

        const genes = Array.from(byGene.entries())
            .map(([sym, rows]) => {
                const eds = rows.map((r) => +(r.h && r.h.editdistance)).filter(Number.isFinite);
                return {
                    sym: sym, rows: rows,
                    compounds: new Set(rows.map((r) => r.o)).size,
                    best: eds.length ? Math.min.apply(null, eds) : null
                };
            })
            .sort((a, b) => (b.compounds - a.compounds)
                || ((a.best == null ? 99 : a.best) - (b.best == null ? 99 : b.best))
                || (a.sym < b.sym ? -1 : 1));

        // ---- the track for a gene ------------------------------------------------
        const nameMatches = (t, sym) => {
            const s = sym.toLowerCase();
            for (const k of ['name', 'geneName', 'gene', 'symbol']) {
                const v = ('' + ((t && t[k]) || '')).toLowerCase();
                if (v && (v === s || v.indexOf(s) >= 0)) return true;
            }
            return false;
        };
        const trackFor = async (sym) => {
            // Already open? Use it. Loading a second copy of a gene that is already on the
            // canvas splits the annotations between two tracks, and the one being looked at
            // is then the one without them.
            for (const t of (graph.track || [])) if (nameMatches(t, sym)) return t;
            say('Loading ' + sym + '…');
            let tid = null;
            try {
                const em = new EngineMonitor(() => { });
                const res = await exec('/py/sequence/prompt-to-transcript.py', em, 'canonical ' + sym);
                let l = [];
                try { l = JSON.parse(res.transcripts); } catch (e) { l = []; }
                const pick = l.find((x) => x && x.canonical) || l[0];
                tid = pick && pick.id;
            } catch (e) { tid = null; }
            if (!tid) return null;
            let track = null;
            try { track = await graph.add(tid, null, null, null); } catch (e) { track = null; }
            if (!track) return null;
            const has = (('' + (track.sequence || '')).length > 0)
                || (Array.isArray(track.annotations) && track.annotations.length > 0);
            if (!has) {
                try { if (graph.track) graph.track = graph.track.filter((x) => x !== track); } catch (e) { }
                return null;
            }
            try { if (track.select) track.select(); if (graph.addTrackToSelection) graph.addTrackToSelection(track); } catch (e) { }
            return track;
        };

        // ---- placement -----------------------------------------------------------
        const RC = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
        const clean = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
        const revcomp = (s) => s.split('').reverse().map((b) => RC[b] || 'N').join('');
        const bySequence = (track, o) => {
            const seq = clean(track.sequence);
            // The SYNTHESIS strand is what hybridises, so that is what is searched; the
            // target site is a slice of the intended transcript and says nothing about this
            // one. Reverse complement first: an antisense compound pairs with the sense
            // strand, which is what the track holds.
            const a = clean(o.synthesisSequence || o.sequence || o.antisense);
            if (a.length < 10 || seq.length < a.length) return null;
            let i = seq.indexOf(revcomp(a)), how = 'antisense';
            if (i < 0) { i = seq.indexOf(a); how = 'sense'; }
            if (i < 0) return null;
            const gi = Math.floor(track.xi || 0) + i;
            return { gi: gi, gf: gi + a.length, how: how };
        };
        const byCoordinate = (track, h) => {
            try {
                const a = C.localOf(track, h.chr, +h.start);
                const b = C.localOf(track, h.chr, +h.end);
                if (a == null || b == null) return null;
                const lo = Math.min(a, b), hi = Math.max(a, b);
                return { gi: lo, gf: (hi > lo ? hi : lo + 1) };
            } catch (e) { return null; }
        };
        const LAYER = 'off_targets';
        const layerFor = (track) => {
            try {
                let layer = (track.track_layers || [])
                    .find((l) => l && (l.data_type === LAYER || l.name === LAYER));
                return layer || null;
            } catch (e) { return null; }
        };
        const place = (track, gi, gf, label, note, color) => {
            const build = () => {
                const an = new Annotation('OffTarget', label, gi, gf, track.strand);
                an.color = color; an.description = note; an.comment = note;
                return an;
            };
            try {
                const layer = layerFor(track);
                if (layer) { layer.addAnnotation(build()); return true; }
            } catch (e) { }
            try { track.add(build()); return true; } catch (e) { return false; }
        };

        const openGene = async (g) => {
            const track = await trackFor(g.sym);
            if (!track) { result('Could not load ' + g.sym + '. Its canonical transcript was not found.'); return; }
            try { graph.pushOntoHistory(); } catch (e) { }

            let bySeq = 0, byCoord = 0, unplaced = 0, firstAt = null;
            const seen = new Set();
            for (const r of g.rows) {
                const o = r.o, h = r.h;
                const key = (o.name || o.id || '?') + ':' + (h.chr || '') + ':' + (h.start || '') + ':' + (h.end || '');
                if (seen.has(key)) continue;
                seen.add(key);
                const ed = Number.isFinite(+h.editdistance) ? +h.editdistance : null;
                const nm = ('' + (o.name || o.id || 'compound'));
                const where = (h.chr ? (h.chr + ':' + h.start + '-' + h.end) : '');
                const s = bySequence(track, o);
                if (s) {
                    bySeq++;
                    if (firstAt == null) firstAt = s.gi;
                    place(track, s.gi, s.gf,
                        nm + (ed != null ? ('  ed ' + ed) : ''),
                        'Off-target of ' + nm + ' on ' + g.sym
                        + '. Found by sequence in this transcript (' + s.how + ' match)'
                        + (where ? ('; the screen reported ' + where) : '') + '.',
                        '#c2410c');
                    continue;
                }
                const c = byCoordinate(track, h);
                if (c) {
                    byCoord++;
                    if (firstAt == null) firstAt = c.gi;
                    place(track, c.gi, c.gf,
                        nm + (ed != null ? ('  ed ' + ed) : '') + '  (by coordinate)',
                        'Off-target of ' + nm + ' on ' + g.sym + ' at ' + where
                        + '. The compound’s sequence is not in this transcript, so this is the '
                        + 'screen’s own coordinate mapped onto it: the hit may be intronic, in a '
                        + 'trimmed UTR, or in another transcript of this gene.',
                        '#a16207');
                    continue;
                }
                unplaced++;
            }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            if (firstAt != null) {
                try {
                    const ax = track.grid || track.tgraph;
                    if (ax) graph.animateTo(ax.X(firstAt - 300), ax.X(firstAt + 300), ax.Y(-1.2), ax.Y(1.2));
                } catch (e) { }
            }
            const bits = [];
            if (bySeq) bits.push(bySeq + ' placed by sequence');
            if (byCoord) bits.push(byCoord + ' by coordinate only');
            if (unplaced) bits.push(unplaced + ' could not be placed on this transcript');
            result(g.sym + ': ' + (bits.length ? bits.join(', ') : 'nothing to place') + '. Undo removes the markers.');
        };

        const menu = [
            { label: 'Off-target genes of ' + list.length + ' compound' + (list.length === 1 ? '' : 's'),
              move: () => { }, click: () => { } },
            { label: '  opens the gene and marks where the compound lands', move: () => { }, click: () => { } }
        ].concat(genes.slice(0, 40).map((g) => ({
            label: '  ' + g.sym + '   ' + g.rows.length + ' hit' + (g.rows.length === 1 ? '' : 's')
                + ' · ' + g.compounds + ' compound' + (g.compounds === 1 ? '' : 's')
                + (g.best != null ? (' · best ed ' + g.best) : ''),
            move: () => { },
            click: () => { try { graph.showSideMenu(null); } catch (e) { } openGene(g); }
        })));
        if (genes.length > 40) {
            menu.push({ label: '  …and ' + (genes.length - 40) + ' more genes', move: () => { }, click: () => { } });
        }
        if (graph.openMenuAtPointer) graph.openMenuAtPointer(menu, 'Off-targets');
        else graph.showSideMenu(menu);
        return genes.length;
    })();
}
