function (track, removedExon) {

    // Re-derive a track's ORF after an exon has been removed.
    //
    //   const r = await exec('baja/bio/orfs/retranslate-after-exon-change.js', track, removedExon)
    //   // call AFTER track.removeAnnotation(removedExon); r.message says what happened
    //
    // WHY. track.generateORF() builds the peptide row by splicing the CDS annotations, not the
    // exons. Removing an Exon annotation left the CDS piece inside it untouched, so the next
    // generateORF() rebuilt exactly the old peptide over a transcript that no longer had that
    // exon. Here the transcript is re-read from the exons that remain, translated from the
    // original start codon to the first in-frame stop (wherever it now falls: a frameshift
    // can carry translation into what was 3' UTR), and the CDS / Translation annotations are
    // rewritten to match. generateORF() then draws the new peptide from them, and any later
    // redraw (an edit, a reload of the annotations) agrees with it.
    //
    // Resolves { handled, message, before, after }. handled is false when the track has no
    // start codon to work from (no Translation, CDS or TSS); the caller can then fall back to
    // the track's own generateORF().

    return new Promise(async (resolve) => {
        try {
            const codon = await exec('baja/bio/aa/codons.js');
            const A = track.annotations || [];
            const ty = (a) => ('' + (a && a.type)).toLowerCase();

            // The GENE strand, read the way generateORF reads it: an annotation that carries an
            // explicit strand wins, because a pre-mRNA track's own strand is the genome slice's.
            const sSrc = A.find((a) => {
                const s = a && a.strand;
                return s === '-' || s === '+' || s === 1 || s === -1 || s === '1' || s === '-1';
            });
            const plus = sSrc ? !(String(sSrc.strand) === '-' || String(sSrc.strand) === '-1') : (+track.strand >= 0);
            const geneStrand = plus ? 1 : -1;

            // The start codon's 5' base, from the most authoritative annotation present.
            let startG = null;
            const tr = A.find((a) => ty(a) === 'translation');
            const cds = A.filter((a) => a && a.type === 'CDS');
            const tss = A.find((a) => ty(a) === 'tss');
            if (tr && tr.xi != null && tr.xf != null) {
                startG = plus ? Math.min(+tr.xi, +tr.xf) : Math.max(+tr.xi, +tr.xf);
            } else if (cds.length) {
                let lo = Infinity, hi = -Infinity;
                for (const c of cds) { lo = Math.min(lo, +c.xi, +c.xf); hi = Math.max(hi, +c.xi, +c.xf); }
                startG = plus ? lo : hi;
            } else if (tss && tss.xi != null) {
                startG = plus ? Math.min(+tss.xi, +tss.xf) : Math.max(+tss.xi, +tss.xf);
            }
            if (startG == null || !isFinite(startG)) {
                resolve({ handled: false, message: '' });
                return;
            }

            const seq = ('' + (track.sequence || '')).toUpperCase();
            const xi = +track.xi || 0;
            const COMP = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
            const baseAt = (p) => {
                const b = seq[p - xi] || 'N';
                return plus ? b : (COMP[b] || 'N');
            };

            // Translate a set of exons from the start codon to the first in-frame stop.
            const translate = (exons) => {
                const ex = exons
                    .map((e) => ({ lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf) }))
                    .filter((e) => isFinite(e.lo) && isFinite(e.hi))
                    .sort((a, b) => plus ? a.lo - b.lo : b.lo - a.lo);      // 5'->3' transcription order
                const g = [];                                                 // transcript index -> genomic position
                const junctions = [];                                         // transcript index where each exon starts
                for (const e of ex) {
                    if (g.length) junctions.push(g.length);
                    if (plus) { for (let p = e.lo; p <= e.hi; p++) g.push(p); }
                    else { for (let p = e.hi; p >= e.lo; p--) g.push(p); }
                }
                const s = g.indexOf(startG);
                if (s < 0) return null;                                       // the start codon is gone
                const protein = [], coding = [];
                let stop = null, stopIdx = -1;
                for (let i = s; i + 2 < g.length; i += 3) {
                    const c = baseAt(g[i]) + baseAt(g[i + 1]) + baseAt(g[i + 2]);
                    const aa = codon(c);
                    if (aa === 'STOP') { stop = [g[i], g[i + 1], g[i + 2]]; stopIdx = i; break; }
                    protein.push(aa || 'X');
                    coding.push(g[i], g[i + 1], g[i + 2]);
                }
                return { protein: protein.join(''), coding, stop, stopIdx, junctions, length: g.length, exons: ex };
            };

            const remaining = (track.getExons ? track.getExons() : A.filter((a) => a && a.type === 'Exon'));
            const before = translate(remaining.concat(removedExon ? [removedExon] : []));
            const after = translate(remaining);

            // Rewrite the coding annotations to the new ORF.
            const Ann = (removedExon && removedExon.constructor) || (A[0] && A[0].constructor);
            const drop = (type) => {
                if (track.removeAnnotationByType) track.removeAnnotationByType(type);
                else track.annotations = (track.annotations || []).filter((a) => ty(a) !== type.toLowerCase());
            };
            drop('CDS'); drop('translation'); drop('tss'); drop('stop');

            const fmt = (n) => ('' + n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            const beforeLen = before ? before.protein.length : 0;
            let message;

            if (!after) {
                // Nothing left to translate from: clear the peptide row.
                track.orf = { sequence: '', cdsi: [] };
                message = 'Exon removed. It held the start codon, so the transcript has no ORF from the original start.';
                resolve({ handled: true, message, before: beforeLen, after: 0 });
                return;
            }

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
            if (span.length) {
                track.add(new Ann('Translation', 'Translation', Math.min(...span), Math.max(...span), geneStrand));
            }
            try { track.generateORF(); } catch (e) { }

            // What changed, in one line.
            const removedLen = removedExon ? (Math.abs(+removedExon.xf - +removedExon.xi) + 1) : 0;
            const inFrame = removedLen % 3 === 0;
            const parts = ['Exon removed.'];
            if (before && after.protein === before.protein) {
                parts.push('The peptide is unchanged (' + fmt(after.protein.length) + ' aa): the exon lies outside the coding sequence.');
            } else if (!after.stop) {
                parts.push('No in-frame stop codon before the end of the transcript: ' + fmt(after.protein.length) + ' aa (was ' + fmt(beforeLen) + ').');
            } else if (inFrame) {
                parts.push('In frame: ' + fmt(beforeLen) + ' → ' + fmt(after.protein.length) + ' aa.');
            } else {
                parts.push('Frameshift: new stop after ' + fmt(after.protein.length) + ' aa (was ' + fmt(beforeLen) + ').');
            }
            // Rule of thumb for nonsense-mediated decay: a stop more than ~50 nt upstream of the
            // last exon-exon junction.
            if (after.stop && after.junctions.length) {
                const lastJ = after.junctions[after.junctions.length - 1];
                if (after.stopIdx + 3 < lastJ - 50) parts.push('The stop sits more than 50 nt before the last exon junction, so this transcript may be an NMD target.');
            }
            message = parts.join(' ');
            resolve({ handled: true, message, before: beforeLen, after: after.protein.length });
        } catch (e) {
            resolve({ handled: false, message: '', error: '' + (e && e.message || e) });
        }
    });
}
