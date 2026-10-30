function (track, removedExon, opts) {

    // Re-derive a track's ORF after an exon has been removed -- or after any other edit to the
    // exons, which is the same job once the exons are in their new state.
    //
    //   const r = await exec('baja/bio/orfs/retranslate-after-exon-change.js', track, removedExon)
    //   // call AFTER track.removeAnnotation(removedExon); r.message says what happened
    //
    //   opts.use = 'before'   rebuild from the transcript the track HAS rather than from the one
    //                         with `removedExon` taken out: for an edit that moved a boundary
    //                         (baja/bio/splicing/apply-ag-scan.js) the exon is still there, in
    //                         its new shape, and that is the transcript to translate.
    //   opts.verb             how the message opens; 'Exon removed' by default.
    //
    // WHY. track.generateORF() builds the peptide row by splicing the CDS annotations, not the
    // exons. Removing an Exon annotation left the CDS piece inside it untouched, so the next
    // generateORF() rebuilt exactly the old peptide over a transcript that no longer had that
    // exon. The new ORF comes from exon-removal-impact.js -- the same analysis the "Predict
    // effect of removing" item shows, so the prediction and the removal always agree -- and the
    // CDS / Translation annotations are rewritten to match it. generateORF() then draws the new
    // peptide from them, and any later redraw (an edit, a reload of the annotations) agrees.
    //
    // Resolves { handled, message, impact }. handled is false when the track has no start codon
    // to work from; the caller can then fall back to the track's own generateORF().

    return new Promise(async (resolve) => {
        try {
            const O = opts || {};
            const impact = await exec('baja/bio/orfs/exon-removal-impact.js', track, removedExon);
            if (!impact || !impact.ok) { resolve({ handled: false, message: '', impact }); return; }

            const A = track.annotations || [];
            const ty = (a) => ('' + (a && a.type)).toLowerCase();
            const geneStrand = impact.plus ? 1 : -1;
            const Ann = (removedExon && removedExon.constructor) || (A[0] && A[0].constructor);
            const drop = (type) => {
                if (track.removeAnnotationByType) track.removeAnnotationByType(type);
                else track.annotations = (track.annotations || []).filter((a) => ty(a) !== type.toLowerCase());
            };
            drop('CDS'); drop('translation'); drop('tss'); drop('stop');

            // 'before' is the transcript the track currently holds, 'after' the one without the
            // exon; which of the two is the new reality depends on what the caller just did.
            const after = (O.use === 'before') ? impact.before : impact.after;
            if (!after) {
                // Nothing left to translate from: clear the peptide row.
                track.orf = { sequence: '', cdsi: [] };
            } else {
                // One CDS annotation per exon the new coding sequence touches.
                const codingSet = new Set(after.coding);
                for (const e of after.exons) {
                    let lo = Infinity, hi = -Infinity;
                    for (let p = e.lo; p <= e.hi; p++) if (codingSet.has(p)) { if (p < lo) lo = p; if (p > hi) hi = p; }
                    if (isFinite(lo)) track.add(new Ann('CDS', 'CDS', lo, hi, geneStrand));
                }
                // Translation spans start to the end of the stop codon (generateORF places TSS and
                // STOP from its two ends).
                const span = after.coding.concat(after.stop || []);
                if (span.length) track.add(new Ann('Translation', 'Translation', Math.min(...span), Math.max(...span), geneStrand));
                try { track.generateORF(); } catch (e) { }
            }
            const verb = O.verb || 'Exon removed';
            resolve({ handled: true, message: verb + '. ' + (O.headline || impact.headline), impact });
        } catch (e) {
            resolve({ handled: false, message: '', error: '' + (e && e.message || e) });
        }
    });
}
