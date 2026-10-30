function (track, exon, choice, opts) {

    // APPLY an AG-scanning redirection to the track: the exon starts at the AG the spliceosome
    // would scan to, and the protein is re-translated from there.
    //
    //   await exec('baja/bio/splicing/apply-ag-scan.js', track, exon, candidate, { mutate: true, graph })
    //
    // `candidate` is one entry from baja/bio/splicing/ag-scan.js (it carries newStart).
    //
    // WHAT MOVES. The exon's 5' boundary, and the 5' boundary of any CDS annotation that began
    // with it -- a CDS whose start was the exon's start now starts where the exon does, and one
    // that lies entirely in the discarded piece is dropped. The donor end, the other exons and
    // every other annotation are untouched: this models a redirected acceptor, not an edit to
    // the gene.
    //
    // MUTATING THE AG (opts.mutate) writes the destroyed acceptor into the SEQUENCE as well, by
    // changing the invariant G of the intron's AG to C. An ASO does not mutate anything -- it
    // occupies the site -- so this is off by default; it is there for the case where you want a
    // later BajaSplice run to score the site as gone rather than to keep reporting the acceptor
    // the design has already taken out of play.
    //
    // Resolves { ok, reason?, lost, newStart, mutated, message }.
    return (async () => {
        const O = opts || {};
        const graph = O.graph || null;
        try {
            if (!track || !exon || !choice || choice.newStart == null) return { ok: false, reason: 'Nothing to apply.' };
            const A = track.annotations || [];
            const sSrc = A.find((a) => {
                const s = a && a.strand;
                return s === '-' || s === '+' || s === 1 || s === -1 || s === '1' || s === '-1';
            });
            const plus = sSrc ? !(String(sSrc.strand) === '-' || String(sSrc.strand) === '-1') : (+track.strand >= 0);
            const eLo = Math.min(+exon.xi, +exon.xf), eHi = Math.max(+exon.xi, +exon.xf);
            const exonStart = plus ? eLo : eHi;
            const newStart = Math.round(+choice.newStart);
            const lost = plus ? (newStart - exonStart) : (exonStart - newStart);
            if (!(lost > 0)) return { ok: false, reason: 'That AG is not downstream of the exon start.' };
            if (plus ? (newStart > eHi) : (newStart < eLo)) {
                return { ok: false, reason: 'That AG lies past the exon’s donor: the outcome is skipping, which Remove exon applies.' };
            }

            try { if (graph && graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { }

            // The discarded piece, in genomic terms.
            const cutLo = plus ? eLo : newStart + 1;
            const cutHi = plus ? newStart - 1 : eHi;

            // The exon itself.
            if (plus) exon.xi = newStart; else exon.xf = newStart;
            if (+exon.xi > +exon.xf && !plus) { /* minus-strand annotations keep xi<xf here */ }

            // Coding annotations that began in the discarded piece.
            const dropped = [];
            for (const a of A.slice()) {
                if (!a || ('' + a.type) !== 'CDS') continue;
                const lo = Math.min(+a.xi, +a.xf), hi = Math.max(+a.xi, +a.xf);
                if (hi < cutLo || lo > cutHi) continue;        // untouched
                if (lo >= cutLo && hi <= cutHi) { dropped.push(a); continue; }   // wholly discarded
                // Overlaps the cut: pull its 5' edge up to the new exon start.
                if (plus) a.xi = Math.max(lo, newStart); else a.xf = Math.min(hi, newStart);
                if (+a.xi > +a.xf) { const t = a.xi; a.xi = a.xf; a.xf = t; }
            }
            for (const a of dropped) { try { track.removeAnnotation(a); } catch (e) { } }

            // The acceptor itself, when asked for: the intron's invariant G -> C.
            let mutated = null;
            if (O.mutate && choice.ag && choice.ag.length === 2) {
                try {
                    const seq = '' + (track.sequence || '');
                    const txi = +track.xi || 0;
                    // choice.ag is the NEW site; the destroyed one is the authentic acceptor,
                    // which the caller passes as opts.authentic.
                    const au = O.authentic && O.authentic.ag;
                    if (au && au.length === 2) {
                        const gpos = au[1];                      // the G of the AG, in transcript order
                        const i = Math.round(gpos) - txi;
                        if (i >= 0 && i < seq.length) {
                            const was = seq[i];
                            // Transcript G is genomic G on the plus strand and genomic C on the minus
                            // strand; writing the transcript's C means writing G there instead.
                            const to = plus ? 'C' : 'G';
                            track.sequence = seq.slice(0, i) + to + seq.slice(i + 1);
                            mutated = { at: gpos, from: was, to: to };
                        }
                    }
                } catch (e) { mutated = null; }
            }

            // Re-translate from the exons as they now stand, and REWRITE the CDS annotations to
            // match. generateORF() alone would not do: it splices the CDS annotations, so the
            // peptide it draws is bounded by annotations that describe the transcript before this
            // edit. The same module the exon removal uses rebuilds them, with use: 'before' --
            // the exon is still there, in its new shape, so the transcript the track HOLDS is the
            // one to translate.
            let summary = '', rebuilt = false;
            try {
                const r = await exec('baja/bio/orfs/retranslate-after-exon-change.js', track, exon,
                    { use: 'before', verb: 'Acceptor redirected' });
                if (r && r.handled && r.impact) {
                    rebuilt = true;
                    const p2 = (r.impact.before && r.impact.before.protein) || '';
                    summary = p2 ? ('protein ' + p2.length + ' aa') : '';
                } else {
                    try { track.generateORF(); } catch (e2) { }
                }
            } catch (e) {
                try { track.generateORF(); } catch (e2) { }
            }
            try { if (graph && graph.wake) graph.wake(); } catch (e) { }

            const fmt = (n) => ('' + n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            const msg = 'Acceptor redirected: ' + (exon.name || 'exon') + ' now starts ' + fmt(lost)
                + ' nt downstream at the next AG'
                // Only worth saying when the rebuild below did NOT run: otherwise every CDS
                // annotation was rewritten from the new transcript and the count means nothing.
                + ((dropped.length && !rebuilt) ? ', ' + dropped.length + ' CDS annotation' + (dropped.length === 1 ? '' : 's') + ' dropped' : '')
                + (mutated ? ', authentic AG mutated (' + mutated.from + '→' + mutated.to + ' at ' + fmt(mutated.at) + ')' : '')
                + (summary ? '. ' + summary.charAt(0).toUpperCase() + summary.slice(1) : '') + '.';
            try {
                if (graph) (graph.setResultMessage ? graph.setResultMessage(' ' + msg + ' ') : graph.setMessage(' ' + msg + ' '));
            } catch (e) { }
            return { ok: true, lost: lost, newStart: newStart, mutated: mutated, droppedCds: dropped.length, message: msg };
        } catch (e) {
            return { ok: false, reason: 'Could not redirect the acceptor: ' + (e && e.message ? e.message : e) };
        }
    })();
}
