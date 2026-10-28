function (track, exon) {

    // What removing (skipping) one exon would do to the transcript's ORF. Read-only: the track
    // is not changed.
    //
    //   const r = await exec('baja/bio/orfs/exon-removal-impact.js', track, exon)
    //
    // Works whether or not the exon is still on the track: the transcript "with" the exon is
    // the remaining exons plus it, "without" is the remaining exons alone. Both are translated
    // from the original start codon to the first in-frame stop, so a frameshift that carries
    // translation into what was 3' UTR is followed to wherever its stop really is.
    //
    // Resolves:
    //   { ok, reason?,                         ok false when there is no start codon to work from
    //     plus, startG,                        gene strand, start codon's 5' genomic base
    //     before, after,                       translations: { protein, coding[], stop[], stopIdx,
    //                                            startIdx, junctions[], exonOfIdx(), exons[], length }
    //     exonRole, exonLen, codingNt,         'coding' | 'utr5' | 'utr3' | 'start' | 'stop' | ...
    //     position,                            'first' | 'last' | 'internal' | 'only'
    //     outcome, nmd, headline, lines[] }    the interpretation
    //
    // NMD rules applied (rules of thumb, not a measurement):
    //   * 50-55 nt rule: a stop more than 55 nt upstream of the last exon-exon junction marks the
    //     mRNA for nonsense-mediated decay; one in the last exon, or within 55 nt of the last
    //     junction, escapes it.
    //   * Start-proximal: a stop within ~150 nt of the start codon often escapes NMD (translation
    //     reinitiates downstream).
    //   * Long exon: a stop in an exon longer than ~400 nt is degraded less efficiently.
    //   * No stop before the end of the transcript: non-stop decay.
    // (Lindeboom et al., Nat Genet 2016; Nagy & Maquat, TIBS 1998.)

    return new Promise(async (resolve) => {
        try {
            const codon = await exec('baja/bio/aa/codons.js');
            const A = track.annotations || [];
            const ty = (a) => ('' + (a && a.type)).toLowerCase();

            // Gene strand, read the way track.generateORF() reads it.
            const sSrc = A.find((a) => {
                const s = a && a.strand;
                return s === '-' || s === '+' || s === 1 || s === -1 || s === '1' || s === '-1';
            });
            const plus = sSrc ? !(String(sSrc.strand) === '-' || String(sSrc.strand) === '-1') : (+track.strand >= 0);

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
                resolve({ ok: false, reason: 'This track has no annotated coding sequence (no Translation, CDS or start codon), so there is no reading frame to assess.' });
                return;
            }

            const seq = ('' + (track.sequence || '')).toUpperCase();
            const xi = +track.xi || 0;
            const COMP = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
            const baseAt = (p) => {
                const b = seq[p - xi] || 'N';
                return plus ? b : (COMP[b] || 'N');
            };

            const translate = (exons) => {
                const ex = exons
                    .map((e) => ({ lo: Math.min(+e.xi, +e.xf), hi: Math.max(+e.xi, +e.xf), ref: e }))
                    .filter((e) => isFinite(e.lo) && isFinite(e.hi))
                    .sort((a, b) => plus ? a.lo - b.lo : b.lo - a.lo);      // 5'->3' transcription order
                const g = [], owner = [], junctions = [];
                ex.forEach((e, k) => {
                    if (g.length) junctions.push(g.length);
                    if (plus) { for (let p = e.lo; p <= e.hi; p++) { g.push(p); owner.push(k); } }
                    else { for (let p = e.hi; p >= e.lo; p--) { g.push(p); owner.push(k); } }
                });
                const s = g.indexOf(startG);
                if (s < 0) return null;
                const protein = [], coding = [];
                let stop = null, stopIdx = -1;
                for (let i = s; i + 2 < g.length; i += 3) {
                    const c = baseAt(g[i]) + baseAt(g[i + 1]) + baseAt(g[i + 2]);
                    const aa = codon(c);
                    if (aa === 'STOP') { stop = [g[i], g[i + 1], g[i + 2]]; stopIdx = i; break; }
                    protein.push(aa || 'X');
                    coding.push(g[i], g[i + 1], g[i + 2]);
                }
                return {
                    protein: protein.join(''), coding, stop, stopIdx, startIdx: s, junctions,
                    exons: ex, length: g.length, g,
                    exonOfIdx: (i) => (i >= 0 && i < owner.length) ? ex[owner[i]] : null
                };
            };

            const allExons = (track.getExons ? track.getExons() : A.filter((a) => a && a.type === 'Exon'));
            const others = allExons.filter((e) => e !== exon);
            const before = translate(others.concat(exon ? [exon] : []));
            const after = translate(others);

            // The 50-55 nt rule (with its exceptions) for one translation's stop codon.
            const nmdCall = (t) => {
                if (!t || !t.stop) return { call: t ? 'nonstop' : 'none' };
                const lastJ = t.junctions.length ? t.junctions[t.junctions.length - 1] : -1;
                const dist = lastJ >= 0 ? (lastJ - t.stopIdx) : -1;
                const inLast = lastJ < 0 || t.stopIdx >= lastJ;
                const ex = t.exonOfIdx(t.stopIdx);
                const exLen = ex ? (ex.hi - ex.lo + 1) : 0;
                const fromStart = t.stopIdx - t.startIdx;
                if (inLast) return { call: 'escapes', why: 'last-exon', dist, exLen, fromStart };
                if (dist <= 55) return { call: 'escapes', why: 'near-last-junction', dist, exLen, fromStart };
                const exceptions = [];
                if (fromStart < 150) exceptions.push('start-proximal');
                if (exLen > 407) exceptions.push('long-exon');
                return { call: exceptions.length ? 'nmd-maybe-escape' : 'nmd', dist, exLen, fromStart, exceptions };
            };

            // ---- the exon itself ----------------------------------------------------------------
            const eLo = Math.min(+exon.xi, +exon.xf), eHi = Math.max(+exon.xi, +exon.xf);
            const exonLen = eHi - eLo + 1;
            let codingNt = 0;
            if (before) for (const p of before.coding) if (p >= eLo && p <= eHi) codingNt++;
            const hasStart = startG >= eLo && startG <= eHi;
            const hasStop = !!(before && before.stop && before.stop.some((p) => p >= eLo && p <= eHi));
            let exonRole;
            if (hasStart) exonRole = 'start';
            else if (hasStop && codingNt) exonRole = 'stop';
            else if (codingNt === exonLen) exonRole = 'coding';
            else if (codingNt > 0) exonRole = 'partly coding';
            else if (before && before.exons.length) {
                // Wholly outside the CDS: which side?
                const firstCodingIdx = before.startIdx;
                const eIdx = before.g.indexOf(plus ? eLo : eHi);
                exonRole = (eIdx >= 0 && eIdx < firstCodingIdx) ? 'utr5' : 'utr3';
            } else exonRole = 'unknown';

            const order = before ? before.exons.findIndex((e) => e.ref === exon) : -1;
            const nEx = before ? before.exons.length : 0;
            const position = nEx <= 1 ? 'only' : (order === 0 ? 'first' : (order === nEx - 1 ? 'last' : 'internal'));
            const exonNo = order >= 0 ? (order + 1) : null;

            // ---- interpretation ---------------------------------------------------------------
            const fmt = (n) => ('' + n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            const oldLen = before ? before.protein.length : 0;
            const lines = [];
            let outcome, nmd = null, headline;

            const roleText = {
                start: 'contains the start codon',
                stop: 'contains the stop codon',
                coding: 'is entirely coding',
                'partly coding': 'is partly coding (' + fmt(codingNt) + ' of ' + fmt(exonLen) + ' nt)',
                utr5: "lies in the 5' UTR",
                utr3: "lies in the 3' UTR",
                unknown: 'could not be placed relative to the coding sequence'
            }[exonRole];
            lines.push('Exon' + (exonNo ? ' ' + exonNo + ' of ' + nEx : '') + ' (' + (exon.name || 'exon') + '), '
                + fmt(exonLen) + ' nt, ' + roleText + '.');
            if (codingNt) lines.push(codingNt % 3 === 0
                ? 'Its coding part (' + fmt(codingNt) + ' nt) is a multiple of 3: skipping it keeps the reading frame.'
                : 'Its coding part (' + fmt(codingNt) + ' nt) is not a multiple of 3: skipping it shifts the reading frame by ' + (codingNt % 3) + ' nt.');
            if (position === 'first' || position === 'last' || position === 'only') {
                lines.push('Note: this is the ' + position + ' exon. Removing it is not a natural exon-skipping event (it changes the transcript end, not an internal splice), so treat the prediction as a sequence exercise.');
            }

            if (!before) {
                outcome = 'no-orf';
                headline = 'The current transcript has no ORF from the annotated start codon.';
            } else if (!after) {
                outcome = 'start-lost';
                headline = 'Start codon lost: no protein from the annotated start.';
                lines.push('Translation may begin at a downstream ATG instead, if one exists in a suitable context; that is not modelled here.');
            } else if (after.protein === before.protein && (!before.stop || (after.stop && after.stop.join() === before.stop.join()))) {
                outcome = 'unchanged';
                headline = 'No change to the protein (' + fmt(oldLen) + ' aa): the exon is outside the coding sequence.';
                if (exonRole === 'utr5' || exonRole === 'utr3') lines.push('UTR changes can still alter mRNA stability, localisation or translation efficiency.');
            } else if (!after.stop) {
                outcome = 'nonstop';
                nmd = 'nonstop';
                headline = 'No stop codon before the end of the transcript: predicted non-stop decay; little or no protein expected.';
                lines.push('Translation would run ' + fmt(after.protein.length) + ' codons to the end of the mRNA (was ' + fmt(oldLen) + ' aa).');
            } else {
                const newLen = after.protein.length;
                // Same stop as before (genomically): the change is between start and stop.
                const sameStop = !!(before.stop && after.stop.join() === before.stop.join());
                const orig = nmdCall(before);
                const now = nmdCall(after);

                // Identical N-terminal residues, then whatever follows the new junction.
                let same = 0;
                while (same < newLen && same < oldLen && after.protein[same] === before.protein[same]) same++;
                const novel = newLen - same;

                const ruleNote = (c, what) => {
                    if (c.why === 'last-exon') return what + ' is in the last exon, downstream of every exon junction.';
                    if (c.why === 'near-last-junction') return what + ' is ' + fmt(c.dist) + ' nt upstream of the last exon junction (within 55 nt).';
                    if (c.call === 'nmd' || c.call === 'nmd-maybe-escape') {
                        const n = [what + ' is ' + fmt(c.dist) + ' nt upstream of the last exon junction (more than 55 nt).'];
                        if ((c.exceptions || []).includes('start-proximal')) n.push('It is only ' + fmt(c.fromStart) + ' nt after the start codon: start-proximal stops often escape NMD by translation re-initiation at a downstream AUG.');
                        if ((c.exceptions || []).includes('long-exon')) n.push('It lies in a long exon (' + fmt(c.exLen) + ' nt): stops in exons longer than ~400 nt are degraded less efficiently.');
                        return n.join(' ');
                    }
                    return '';
                };

                if (sameStop) {
                    // In frame, normal stop kept: NMD status is whatever the original transcript's was.
                    outcome = 'in-frame';
                    headline = 'In-frame deletion: ' + fmt(oldLen) + ' \u2192 ' + fmt(newLen) + ' aa (' + fmt(oldLen - newLen) + ' aa removed), with the normal stop codon kept.';
                    if (orig.call === 'escapes') {
                        nmd = 'escapes';
                        headline += ' The mRNA is not an NMD target, so an internally deleted protein is predicted to be expressed.';
                    } else {
                        nmd = 'as-original';
                        headline += ' NMD status is unchanged from the original transcript, so expression of the internally deleted protein should track the original.';
                        lines.push('Even the original transcript breaks the 50-nt rule: ' + ruleNote(orig, 'its normal stop')
                            + ' That usually means an intron in the 3\u2032 UTR; such genes are often natural NMD substrates or known exceptions.');
                    }
                } else {
                    outcome = 'ptc';
                    if (codingNt % 3 === 0 && !hasStop) {
                        headline = 'In frame, but the new exon junction creates a stop codon: ' + fmt(newLen) + ' aa (was ' + fmt(oldLen) + ').';
                    } else if (hasStop) {
                        headline = 'The normal stop codon is removed: translation continues to a new stop after ' + fmt(newLen) + ' aa (was ' + fmt(oldLen) + ').';
                    } else {
                        headline = 'Frameshift: a stop codon now falls after ' + fmt(newLen) + ' aa (was ' + fmt(oldLen) + ').';
                    }
                    if (novel > 0) lines.push('The first ' + fmt(same) + ' aa are unchanged, followed by ' + fmt(novel) + ' aa of new sequence.');
                    nmd = now.call;
                    lines.push(ruleNote(now, 'The new stop'));
                    if (now.call === 'escapes') {
                        headline += ' The mRNA escapes NMD, so a ' + (newLen < oldLen ? 'truncated' : 'altered') + ' protein of ' + fmt(newLen) + ' aa ('
                            + Math.round(100 * newLen / Math.max(1, oldLen)) + '% of the original length) is predicted to be expressed.';
                    } else if (now.call === 'nmd') {
                        headline += ' This is a premature termination codon (PTC) and the mRNA is predicted to undergo NMD: little protein expected.';
                    } else {
                        headline += ' This is a premature termination codon (PTC); NMD is predicted but may be incomplete (see notes), so some truncated protein could be made.';
                    }
                }
            }

            resolve({
                ok: true, plus, startG, before, after, exonRole, exonLen, codingNt, position,
                outcome, nmd, headline, lines,
                oldLength: oldLen, newLength: after ? after.protein.length : 0
            });
        } catch (e) {
            resolve({ ok: false, reason: 'Could not assess this exon: ' + (e && e.message ? e.message : e) });
        }
    });
}
