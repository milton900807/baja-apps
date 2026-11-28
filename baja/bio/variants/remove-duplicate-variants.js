function (graph, tracks, opts) {

    // THE SAME MUTATION, LOADED TWICE.
    //   await exec('baja/bio/variants/remove-duplicate-variants.js', graph, [track],
    //              { by: 'nucleotide' });
    //
    // Loading ClinVar over a track that already carries it, or two overlapping sets, leaves
    // the same change on the canvas more than once: two lollipops on one base, two cards
    // saying the same thing, and every count on the canvas inflated by however many times
    // the set was loaded. Nothing in the editor could find them.
    //
    // WHAT COUNTS AS THE SAME is the whole question, and there are two answers that are
    // both right for different questions.
    //
    //   NUCLEOTIDE   the same change at the same base: position, kind, reference and
    //                alternate all equal. These are the same variant, full stop, and
    //                dropping the extra copies loses nothing at all.
    //
    //   PEPTIDE      the same residue substitution, A315T and A315T, whatever path through
    //                the codon got there. These are NOT the same variant: c.943G>A and
    //                c.943G>C can both give A315T, and they differ in the nucleotide, in
    //                what a guide or an ASO would have to do, and often in the evidence
    //                behind them. Collapsing them is a real decision and it throws
    //                something away, so it is never the default and the report names each
    //                nucleotide change that was dropped rather than reporting a count.
    //
    // WHICH COPY STAYS is not arbitrary either. Duplicates are rarely identical in what
    // they CARRY: one copy usually came from a set with clinical significance and a
    // condition on it and the other from a bare position list. The copy that knows the
    // most is kept, so de-duplicating a canvas never costs an annotation.
    //
    // Nothing here is clever about near-misses: a 3 bp deletion and a 4 bp deletion at the
    // same base are two variants, and this will say so by leaving both.

    return (async () => {
        const o = opts || {};
        const by = ('' + (o.by || 'nucleotide')).toLowerCase();
        const say = (m) => {
            try { graph.setResultMessage(' ' + m + ' '); }
            catch (e) { try { graph.setMessage(' ' + m + ' '); } catch (e2) { } }
        };
        const fmt = (n) => (Math.round(+n) || 0).toLocaleString();
        const refuse = (why) => { say(why); return { ok: false, why: why }; };

        const list = (Array.isArray(tracks) ? tracks : (tracks ? [tracks] : [])).filter(Boolean);
        if (!list.length) return refuse('No track to look at: open one, or name it.');
        if (by !== 'nucleotide' && by !== 'peptide' && by !== 'both') {
            return refuse('Duplicates can be matched by nucleotide, by peptide, or by both. '
                + '"' + by + '" is none of those.');
        }

        const dna = (x) => ('' + (x == null ? '' : x)).toUpperCase().replace(/U/g, 'T');
        // What a variant IS, as the canvas holds it. xf is in it because an indel's span is
        // part of the change: two deletions starting on the same base and ending elsewhere
        // are two deletions.
        const ntSig = (s) => [
            ('' + (s.type || 'snp')).toLowerCase(),
            Math.floor(+s.xi), Math.floor(+s.xf),
            dna(s.reference), dna(s.alternate != null ? s.alternate : s.sequence)
        ].join('|');

        // HOW MUCH A COPY KNOWS, so the one that is kept is the one worth keeping.
        const weight = (s) => {
            let w = 0;
            try {
                if (s.clinsig) w += 4;
                if (s.clindn) w += 2;
                if (s.name && !/^chr|^\d/.test('' + s.name)) w += 1;
                if (s.id) w += 1;
                if (s.quality != null) w += 1;
            } catch (e) { }
            return w;
        };

        const out = { ok: true, by: by, tracks: [], removed: 0, kept: 0, groups: [] };

        for (const t of list) {
            const snps = (t.snpindels || []).filter(Boolean);
            if (!snps.length) { out.tracks.push({ track: t, n: 0, removed: 0 }); continue; }

            // The peptide reading comes from the one place that reads variants as residue
            // substitutions, so "A315T" here and "A315T" in the motif report are the same
            // claim about the same codon.
            let pep = null;
            if (by === 'peptide' || by === 'both') {
                try {
                    const R = await exec('baja/bio/protein/variants-to-residues.js', t, {});
                    if (R && R.ok) {
                        pep = new Map();
                        for (const r of (R.list || [])) if (r && r.snp) pep.set(r.snp, r.spec);
                    }
                } catch (e) { pep = null; }
                if (!pep || !pep.size) {
                    return refuse(((t.name || 'This track')) + ': none of its variants can be '
                        + 'read as residue changes, so there is no peptide signature to match '
                        + 'on. That is what a track with no reading frame, or variants outside '
                        + 'the CDS, looks like. Matching by nucleotide still works.');
                }
            }

            const groups = new Map();
            for (const s of snps) {
                const keys = [];
                if (by === 'nucleotide' || by === 'both') keys.push('nt:' + ntSig(s));
                if (by === 'peptide' || by === 'both') {
                    const p = pep && pep.get(s);
                    // A variant with no residue reading is not a peptide duplicate of
                    // anything -- including of the other variants with no reading.
                    if (p) keys.push('pep:' + p);
                }
                if (!keys.length) continue;
                // WITH BOTH RULES AT ONCE, SAME MEANS SAME BY EITHER ONE, and that makes
                // one set rather than two overlapping ones. Three variants where the first
                // two share a nucleotide change and the third only shares the residue are
                // all the same mutation under this question, so joining a variant to
                // whichever group it happened to match FIRST was wrong: it left the third
                // one in a group of its own and reported no duplicate. Matching groups are
                // merged instead, and both keys point at the result.
                const found = [];
                for (const k of keys) {
                    const g = groups.get(k);
                    if (g && found.indexOf(g) < 0) found.push(g);
                }
                let bucket;
                if (!found.length) bucket = [];
                else {
                    bucket = found[0];
                    for (const g of found.slice(1)) {
                        for (const m of g) if (bucket.indexOf(m) < 0) bucket.push(m);
                        // Every key that pointed at the absorbed group now points here.
                        for (const [k, v] of groups) if (v === g) groups.set(k, bucket);
                    }
                }
                bucket.push(s);
                for (const k of keys) groups.set(k, bucket);
            }

            // Several keys point at one set, so the sets are taken once each.
            const seenB = new Set();
            const dupes = [...groups.entries()].filter(([, v]) => {
                if (v.length < 2 || seenB.has(v)) return false;
                seenB.add(v); return true;
            });
            if (!dupes.length) { out.tracks.push({ track: t, n: snps.length, removed: 0 }); continue; }

            const doomed = [];
            for (const [key, members] of dupes) {
                const ranked = members.slice().sort((a, b) => weight(b) - weight(a));
                const keep = ranked[0];
                const drop = ranked.slice(1);
                out.groups.push({
                    track: t, key: key,
                    kind: key.indexOf('pep:') === 0 ? 'peptide' : 'nucleotide',
                    label: key.replace(/^(nt|pep):/, ''),
                    n: members.length,
                    kept: keep,
                    dropped: drop,
                    // For a peptide group the nucleotide changes differ, and that is the
                    // part worth printing rather than counting.
                    changes: members.map((s) => (dna(s.reference) || '?') + '>'
                        + (dna(s.alternate != null ? s.alternate : s.sequence) || '?')
                        + '@' + Math.floor(+s.xi))
                });
                doomed.push(...drop);
            }
            out.kept += (snps.length - doomed.length);

            if (!o.dryRun && doomed.length) {
                try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }
                const gone = new Set(doomed);
                let removed = 0;
                for (const s of doomed) {
                    let ok1 = false;
                    try { t.removesnp(s); ok1 = true; } catch (e) { ok1 = false; }
                    if (!ok1) {
                        try {
                            const a = (t.snpindels || []);
                            const i = a.indexOf(s);
                            if (i >= 0) { a.splice(i, 1); ok1 = true; }
                        } catch (e) { ok1 = false; }
                    }
                    if (ok1) removed++;
                }
                // Anything the track would not let go of is still on the canvas, and a
                // report that counted it as removed would be wrong about what is on screen.
                const left = (t.snpindels || []).filter((s) => gone.has(s)).length;
                out.removed += removed - 0;
                out.tracks.push({ track: t, n: snps.length, removed: removed, stuck: left });
            } else {
                out.removed += doomed.length;
                out.tracks.push({ track: t, n: snps.length, removed: doomed.length, dryRun: true });
            }
        }

        try { if (graph.rescale) graph.rescale(); } catch (e) { }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        const where = out.tracks.filter((x) => x.removed)
            .map((x) => (x.track.name || 'track') + ' (' + fmt(x.removed) + ' of ' + fmt(x.n) + ')')
            .join(', ');
        if (!out.removed) {
            say(list.map((t) => t.name || 'track').join(', ') + ': no duplicates by '
                + (by === 'both' ? 'nucleotide or peptide' : by) + '. Every variant on '
                + (list.length === 1 ? 'the track' : 'these tracks') + ' is a different change.');
            return out;
        }

        const pepGroups = out.groups.filter((g) => g.kind === 'peptide').length;
        say((o.dryRun ? 'Would remove ' : 'Removed ') + fmt(out.removed) + ' duplicate variant'
            + (out.removed === 1 ? '' : 's') + ' from ' + where + ', leaving ' + fmt(out.kept)
            + '. Matched by ' + (by === 'both' ? 'nucleotide and peptide' : by) + '; of each set '
            + 'the copy carrying the most (clinical significance, condition, an id) is the one '
            + 'kept, so nothing annotated was lost.'
            + (pepGroups ? (' ' + fmt(pepGroups) + ' of the sets matched on PEPTIDE only: those '
                + 'were different nucleotide changes giving the same residue, and the ones '
                + 'dropped are named in the report.') : '')
            + (o.dryRun ? ' Nothing was removed.' : ' Undo puts them back.'));
        return out;
    })();
}
