function (server, graph, genegraph_panel_layout, ids, variants, options) {
    // Load these transcripts, and put these variants on whichever of them they land in.
    //
    // TWO TRACKS OF THE SAME GENE, when the caller asks for them. An entry may be a plain
    // transcript id, as it always was, or { id, group, label }: the track is labelled, and it
    // takes only the variants carrying the same `group`. That is how the LOH design strategy
    // opens a gene -- the germline on one track, the tumor with its own changes on another --
    // so an allele-selective oligo can be designed against the difference between them. A
    // variant the tumor kept from the germline is in both groups, and appears on both.
    //
    // The variants come from somewhere that already knows where they are -- the chromosome
    // view, holding a pasted or uploaded VCF -- so nothing is looked up again here. What this
    // does is the part only a track can do: turn a genomic coordinate into a position on a
    // loaded transcript, which is what track.variantWorldX exists for.
    //
    // A variant lands on EVERY track it falls inside, not on the first. Transcripts overlap,
    // genes sit inside other genes' introns, and a variant in that overlap is genuinely on
    // both -- picking one would be inventing a precedence the data does not have.
    // WHAT IS SAID, AND WHERE IT LANDS. The editor's canvas does not paint setMessage --
    // only setError and setResultMessage become toasts -- so this told the user how many
    // variants arrived on a surface nobody sees. A load that quietly placed a fraction of
    // what it was handed looked exactly like variants failing to load at all.
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const tell = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { say(m); } };
    const warn = (m) => { try { graph.setError(' ' + m + ' '); } catch (e) { tell(m); } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        const wanted = (ids || []).filter(Boolean).map((x) => (typeof x === 'string' ? { id: x } : x)).filter((e) => e && e.id);
        if (!wanted.length) { say('No transcripts to load.'); return false; }
        const vs = variants || [];
        // `options.rescue === false` turns the second pass off; `options.species` names the
        // annotation to search. Both optional: every caller before this passed neither.
        const opts = options || {};

        let SnpIndel = null;
        try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }

        const colorFor = (sig) => {
            const t = ('' + (sig || '')).toLowerCase();
            if (!t) return null;
            if (t.indexOf('conflict') >= 0) return '#94a3b8';
            if (t.indexOf('pathogenic') >= 0) return '#c0392b';
            if (t.indexOf('benign') >= 0) return '#22c55e';
            return '#94a3b8';
        };

        const keyOf = (v) => (v.chr || '') + ':' + v.pos + ':' + (v.ref || '') + '>' + (v.alt || '');
        // PLACING ONE VARIANT ON ONE TRACK. Lifted out of the loop because the rescue pass
        // below has to do exactly this, and a second copy of it would be a second set of
        // rules about deletions, phase and annotation fields waiting to drift.
        const placeOn = (track, v) => {
            // variantWorldX answers "is this coordinate on this track, and where" in
            // one call, and returns null when it is not -- which is also the test for
            // whether the variant belongs here at all.
            let wx = null;
            try { wx = track.variantWorldX ? track.variantWorldX(v.chr, v.pos) : null; } catch (e) { wx = null; }
            if (wx == null) return false;   // not on this track
            const ref = ('' + (v.ref || 'N')).toUpperCase();
            const alt = ('' + (v.alt || 'N')).toUpperCase();
            let type = 'snp';
            if (alt.length > ref.length) type = 'ins';
            else if (ref.length > alt.length) type = 'del';
            // A deletion is anchored one base past the record's position on the plus
            // strand: VCF quotes the base before the deleted run.
            let placeXi = wx;
            if (type === 'del' && track.strand !== -1) placeXi = wx + 1;
            try {
                // PHASE IS THE SIDE OF THE BASELINE. The editor has always drawn
                // haplotype 1 above the track and everything else below; a change
                // the VCF phased onto haplotype 1 goes where that convention puts it.
                const phase = (v.phase === 'hap1') ? 1 : 0;
                const snp = new SnpIndel(type, placeXi, ref, alt, phase, track.strand,
                    v.name || (v.chr + ':' + v.pos), null, colorFor(v.sig));
                snp.name = v.name || (v.chr + ':' + v.pos);
                snp.source = v.source || 'VCF';
                // Who carries it, kept as fields the sample strip and the variant
                // tools can read without re-parsing the annotation.
                if (Array.isArray(v.samples) && v.samples.length) {
                    snp.samples = v.samples.slice();
                    snp.genotypes = (v.genotypes || []).slice();
                    snp.phaseWord = v.phase || '';
                }
                if (Array.isArray(v.annotations) && v.annotations.length) {
                    try { snp.setAnnotation(v.annotations); } catch (e) { }
                }
                if (v.sig) snp.clinsig = v.sig;
                track.addsnpindel(snp);
                track.showSnpIndels = true;
                placed++;
                try { placedKeys.push(keyOf(v)); } catch (e) { }
                return true;
            } catch (e) { }
            return false;
        };

        let loaded = 0, placed = 0;
        // Which of the carried variants actually found a home. Placements are counted too
        // (a variant genuinely sits on every transcript it falls inside), but "of N carried
        // over" has to be answered per VARIANT or it reads as more arriving than were sent.
        const placedKeys = [];
        for (let i = 0; i < wanted.length; i++) {
            const E = wanted[i];
            say('Loading ' + E.id + (E.label ? ' (' + E.label + ')' : '') + ' — ' + (i + 1) + ' of ' + wanted.length + '…');
            const before = new Set((graph.track || []));
            try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, E.id); }
            catch (e) { continue; }
            const fresh = (graph.track || []).filter((t) => t && !before.has(t));
            if (!fresh.length) continue;
            loaded += fresh.length;
            // The label goes in the track's DESCRIPTION, which is drawn beside its name. The
            // name is what other tools match a track by, so it is left alone.
            if (E.label) for (const t of fresh) { try { t.description = E.label + (t.description ? '  ·  ' + t.description : ''); } catch (e) { } }
            // A grouped entry takes its own group's variants; an ungrouped one takes them all,
            // which is what every caller before this did.
            const mine = E.group ? vs.filter((v) => v && v.group === E.group) : vs;
            if (!mine.length || !SnpIndel) continue;
            try { graph.pushOntoHistory(); } catch (e) { }
            for (const track of fresh) {
                for (const v of mine) placeOn(track, v);
            }
        }
        // ---- THE ONES THAT LANDED NOWHERE ------------------------------------------------
        //
        // A variant only has a place on a track it falls inside, and "inside" is a fact about
        // the ISOFORM: an exon in one is an intron in the next, and a gene nobody opened has
        // no track at all. Everything that did not land was simply dropped, which is what
        // "the editor is not loading all the SNPs" looks like from the outside.
        //
        // So the annotation is asked which transcripts actually contain those positions --
        // genes-in-range.py, with every isoform rather than one per gene -- and the ones that
        // would carry a variant are loaded and tried. A transcript that takes nothing is
        // removed again: an empty track for a gene nobody asked about is clutter.
        //
        // Bounded on purpose. This runs after a hand-off that may carry tens of thousands of
        // variants across a whole arm, and the answer to "open a track for every gene in
        // 148 Mb" is no.
        const RESCUE_TRACKS = 12;        // at most this many extra tracks
        const RESCUE_SPAN = 5e6;         // and only over a window this wide
        const unplacedOf = () => {
            const seen = new Set(placedKeys);
            return vs.filter((v) => v && v.pos != null && !seen.has(keyOf(v)));
        };
        let rescued = 0, rescueTracks = 0, rescueNote = '';
        try {
            let left = unplacedOf();
            if (left.length && SnpIndel && opts.rescue !== false) {
                // By chromosome, then the window each set of leftovers actually spans.
                const byChr = new Map();
                for (const v of left) {
                    const c = ('' + (v.chr || '')).replace(/^chr/i, '');
                    if (!byChr.has(c)) byChr.set(c, []);
                    byChr.get(c).push(v);
                }
                const windows = [];
                for (const [c, list] of byChr) {
                    let lo = Infinity, hi = -Infinity;
                    for (const v of list) { lo = Math.min(lo, +v.pos); hi = Math.max(hi, +v.pos); }
                    if (!isFinite(lo) || !isFinite(hi)) continue;
                    windows.push({ chr: c, lo: Math.max(1, Math.floor(lo) - 1000), hi: Math.ceil(hi) + 1000, n: list.length });
                }
                // The biggest pile of leftovers first: if there is only room for a few tracks,
                // they should be the ones that bring the most variants with them.
                windows.sort((a, b) => b.n - a.n);
                const already = new Set(wanted.map((e) => ('' + e.id).split('.')[0].toUpperCase()));
                const tried = new Set();
                for (const w of windows) {
                    if (rescueTracks >= RESCUE_TRACKS) break;
                    if ((w.hi - w.lo) > RESCUE_SPAN) {
                        rescueNote = 'the unplaced variants span more than ' + (RESCUE_SPAN / 1e6) + ' Mb, which is too wide to open transcripts for';
                        continue;
                    }
                    say('Looking for transcripts that carry ' + w.n.toLocaleString() + ' unplaced variant'
                        + (w.n === 1 ? '' : 's') + ' on chr' + w.chr + '…');
                    let res = null;
                    try {
                        const em = new EngineMonitor(() => { });
                        res = await exec(server + '/py/bio/genes-in-range.py', em, w.chr,
                            '' + w.lo, '' + w.hi, (opts.species || 'human'), '60', '1');
                    } catch (e) { res = null; }
                    let genes = [];
                    try { genes = JSON.parse((res && res.genes) || '[]'); } catch (e) { genes = []; }
                    if (!genes.length) continue;
                    // Coding genes first (that is the order the lookup returns), and within a
                    // gene the best isoform first -- but every isoform is a candidate, because
                    // the whole point is that the best one may not contain the variant.
                    const ids = [];
                    for (const g of genes) {
                        const list = (Array.isArray(g.transcripts) && g.transcripts.length)
                            ? g.transcripts : (g.transcript ? [g.transcript] : []);
                        for (const id of list) {
                            const key = ('' + id).split('.')[0].toUpperCase();
                            if (!key || already.has(key) || tried.has(key)) continue;
                            tried.add(key);
                            ids.push(id);
                        }
                    }
                    for (const id of ids) {
                        if (rescueTracks >= RESCUE_TRACKS) break;
                        const stillLeft = unplacedOf().filter((v) => ('' + (v.chr || '')).replace(/^chr/i, '') === w.chr);
                        if (!stillLeft.length) break;
                        const before2 = new Set((graph.track || []));
                        try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, id); }
                        catch (e) { continue; }
                        const fresh2 = (graph.track || []).filter((t) => t && !before2.has(t));
                        if (!fresh2.length) continue;
                        let tookHere = 0;
                        for (const track of fresh2) {
                            for (const v of stillLeft) { if (placeOn(track, v)) tookHere++; }
                        }
                        if (tookHere) {
                            rescued += tookHere;
                            rescueTracks += fresh2.length;
                            loaded += fresh2.length;
                        } else {
                            // It carried nothing: take it off again rather than leave an empty
                            // track behind for a gene nobody asked to see.
                            for (const t of fresh2) {
                                try {
                                    const ix = (graph.track || []).indexOf(t);
                                    if (ix >= 0) graph.track.splice(ix, 1);
                                } catch (e) { }
                            }
                        }
                    }
                }
            }
        } catch (e) { rescueNote = 'the search for other transcripts failed: ' + e; }

        try { if (graph.wake) graph.wake(); } catch (e) { }
        // A variant is placed on every track it falls INSIDE. One that falls in none -- in a
        // gene that was not opened, or between genes -- has nowhere to go, and saying so is
        // the difference between "the editor dropped my variants" and "those variants are
        // not on these transcripts".
        // ARRIVED is a count of VARIANTS; placed is a count of PLACEMENTS, and the two differ
        // wherever transcripts overlap -- a variant inside both is on both, correctly. Reading
        // the placements against the number carried produced "placed 2 variants of 1 carried
        // over", which reads as the loader inventing one.
        let arrived = placed;
        try { arrived = new Set(placedKeys).size; } catch (e) { }
        const missed = Math.max(0, vs.length - arrived);
        const extra = Math.max(0, placed - arrived);
        const rescueLine = rescueTracks
            ? (' ' + rescued.toLocaleString() + ' of them were placed by opening ' + rescueTracks
                + ' more transcript' + (rescueTracks === 1 ? '' : 's') + ' that contain them.')
            : '';
        const line = 'Loaded ' + loaded + ' track' + (loaded === 1 ? '' : 's')
            + (vs.length ? ' and placed ' + arrived + ' of ' + vs.length + ' variant'
                + (vs.length === 1 ? '' : 's') + ' carried over'
                + (extra ? ' (' + placed + ' placements: ' + extra + ' sit on more than one transcript)' : '') : '')
            + '.';
        if (vs.length && missed) {
            warn(line + rescueLine + ' ' + missed.toLocaleString() + ' still fall outside every transcript opened'
                + (rescueNote ? ' — ' + rescueNote : ' — no isoform in the annotation contains them')
                + '.');
        } else {
            tell(line + rescueLine);
        }
        restoreHover();
        return loaded > 0;
    })();
}
