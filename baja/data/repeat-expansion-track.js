function (graph, sourceTrack, spec) {
    // A SECOND COPY OF THE GENE, WITH THE REPEAT EXPANDED.
    //
    // Some diseases are not a base change. Huntington's is a CAG tract that is 9 to 36 units
    // long in most people and 37 or more in patients -- there is no HGVS for "more of them",
    // so the paste that describes it produced a gene, a disease, and nothing to look at.
    // What it deserves is the thing the text is actually contrasting: the normal allele and
    // the expanded one, side by side, on the same coordinates.
    //
    //   exec('baja/data/repeat-expansion-track.js', graph, track, {
    //        gene:'HTT', motif:'CAG', normal_min:9, normal_max:36, pathogenic_min:37 })
    //
    // Returns { ok, at, unit, normal, expanded, added, why }.
    const COMP = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
    const rc = (s) => ('' + s).toUpperCase().split('').reverse().map((b) => COMP[b] || 'N').join('');
    const fail = (why) => ({ ok: false, why: why });

    return (async () => {
        try {
            // track.js resolves { Track, TrackRef }, not the class -- so `new Track(...)` on
            // what exec returns is a call on a plain object, and the whole build failed with
            // a TypeError that this function then reported as "could not be expanded".
            const { Track } = await exec('baja/bio/track.js');
            if (typeof Track !== 'function') return fail('the track class could not be loaded');
            const t = sourceTrack;
            const seq = ('' + ((t && t.sequence) || '')).toUpperCase();
            const unitIn = ('' + ((spec && spec.motif) || '')).toUpperCase().replace(/[^ACGT]/g, '');
            if (!t || seq.length < 10) return fail('that track has no sequence to expand');
            if (unitIn.length < 2) return fail('no repeat motif was given');

            // THE TRACT, IN WHICHEVER ORIENTATION THE TRACK STORES. A pre-mRNA slice is the
            // plus strand, so a minus-strand gene's CAG tract is written CTG in it. Both are
            // looked for and the longer run wins, which also settles the question for a motif
            // that is its own reverse complement.
            const findTract = (unit) => {
                let best = null;
                try {
                    const re = new RegExp('(?:' + unit + '){3,}', 'g');
                    let m;
                    while ((m = re.exec(seq)) !== null) {
                        if (!best || m[0].length > best.len) best = { start: m.index, len: m[0].length, unit: unit };
                        re.lastIndex = m.index + unit.length;      // overlapping frames count too
                    }
                } catch (e) { }
                return best;
            };
            const a = findTract(unitIn), b = findTract(rc(unitIn));
            const tract = (!a || (b && b.len > a.len)) ? b : a;
            if (!tract) return fail('no run of ' + unitIn + ' was found in ' + (t.name || 'that track'));

            const unit = tract.unit;
            const n0 = Math.round(tract.len / unit.length);
            // HOW LONG TO MAKE IT. The threshold the text gives is the shortest allele that
            // causes the disease, which is the honest thing to build: anything longer would
            // be a number this paste never mentioned. A reference that is already at or past
            // it -- which happens, since reference alleles are not always the common one --
            // gets a few more units so the two tracks are not identical.
            const want = Math.max(
                Number(spec.pathogenic_min) || 0,
                n0 + 1
            );
            const extraUnits = want - n0;
            if (!(extraUnits > 0)) return fail('the reference tract is already longer than the pathogenic threshold');
            const delta = extraUnits * unit.length;

            const cut = tract.start + tract.len;                  // insert at the tract's 3' end
            const expandedSeq = seq.slice(0, cut) + unit.repeat(extraUnits) + seq.slice(cut);

            // The genomic position the extra bases go in at, so the annotations can follow.
            const xi = Number(t.xi) || 0;
            const at = xi + cut;

            const name = (t.name || spec.gene || 'track') + '  ' + want + 'x' + unit + ' (expanded)';
            const nt = new Track(name, xi, (Number(t.xf) || (xi + seq.length)) + delta,
                (Number(t.y) || 0) + 1, Number(t.strand) || 1);
            nt.sequence = expandedSeq;
            // Everything downstream of the insertion moves with it; an annotation the tract
            // sits inside gets longer. An exon that CONTAINS the repeat really is longer in a
            // patient, so this is the behaviour rather than an approximation of it.
            const shifted = [];
            for (const an of (t.annotations || [])) {
                if (!an) continue;
                let c;
                try { c = Object.assign(Object.create(Object.getPrototypeOf(an) || Object.prototype), an); }
                catch (e) { c = Object.assign({}, an); }
                const ai = Number(an.xi), af = Number(an.xf);
                if (Number.isFinite(ai) && ai >= at) c.xi = ai + delta;
                if (Number.isFinite(af) && af >= at) c.xf = af + delta;
                shifted.push(c);
            }
            nt.annotations = shifted;
            for (const k of ['contig', 'chr', 'transcriptID', 'description', 'species', 'gene', 'geneName']) {
                try { if (t[k] != null && nt[k] == null) nt[k] = t[k]; } catch (e) { }
            }
            try { nt.__repeat = { unit: unit, count: want, from: n0, at: at }; } catch (e) { }

            // The reference track says what IT is, so the pair reads as a comparison rather
            // than as a gene and a mystery.
            try {
                if (!/\(normal\)|\bx[ACGT]{2,}\b/.test('' + t.name)) {
                    t.name = (t.name || spec.gene || 'track') + '  ' + n0 + 'x' + unit + ' (normal)';
                }
            } catch (e) { }

            graph.track.push(nt);
            try { if (typeof nt.generateORF === 'function') nt.generateORF(); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }

            return { ok: true, at: at, unit: unit, normal: n0, expanded: want,
                     added: delta, track: nt };
        } catch (e) {
            console.warn('[repeat expansion]', e);
            return fail((e && e.message) ? e.message : ('' + e));
        }
    })();
}
