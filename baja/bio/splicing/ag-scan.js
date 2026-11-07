function (track, exon, opts) {

    // AG SCANNING: what the spliceosome does when an exon's authentic 3' acceptor is destroyed.
    //
    //   const r = await exec('baja/bio/splicing/ag-scan.js', track, exon, { pick: 0 })
    //
    // This is the mechanism a splice-redirection ASO is built on. The 3' splice site is the AG
    // at the very end of the intron, immediately 5' of the exon's first base. Block it -- with
    // an oligo over it, or mutate it -- and the spliceosome does not give up: having committed
    // to the branch point and the polypyrimidine tract, it SCANS DOWNSTREAM and splices at the
    // first AG it meets. That AG is usually inside the exon, so the exon keeps its donor and
    // loses its 5' end: a shorter exon, not a skipped one.
    //
    // The first-AG rule is why the outcome is predictable rather than arbitrary, and why the
    // size of the redirection is a property of the sequence: it is the distance to the next AG.
    // Three bases of that distance are a codon, so whether the redirected product is an
    // in-frame deletion or a frameshift follows from the sequence too.
    //
    // Read-only. Nothing here changes the track; apply-ag-scan.js does that.
    //
    // Resolves:
    //   { ok, reason?,
    //     plus, exonNo, exonLen,
    //     authentic: { ag: [pA, pG], reads, intact },   the AG as the track reads it
    //     candidates: [{ ag: [pA, pG], newStart, lost, inExon, inFrame, codonsLost,
    //                    context, beyondDonor }],       downstream AGs, first one first
    //     chosen, impact, headline, lines[] }
    //
    // `lost` is how many exonic bases the redirection removes; `newStart` is the exon's first
    // base afterwards. The protein consequence comes from the same translator and the same NMD
    // rules as exon removal (baja/bio/orfs/exon-removal-impact.js, opts.raw), so the two
    // features cannot disagree about what a PTC is.
    return (async () => {
        const O = opts || {};
        const WINDOW = Math.max(3, Math.round(+O.window || 300));   // how far downstream to look
        const MAX = Math.max(1, Math.round(+O.max || 6));           // how many AGs to report
        try {
            if (!track || !exon) return { ok: false, reason: 'No exon given.' };
            const A = track.annotations || [];
            const ty = (a) => ('' + (a && a.type)).toLowerCase();
            const sSrc = A.find((a) => {
                const s = a && a.strand;
                return s === '-' || s === '+' || s === 1 || s === -1 || s === '1' || s === '-1';
            });
            const plus = sSrc ? !(String(sSrc.strand) === '-' || String(sSrc.strand) === '-1') : (+track.strand >= 0);
            const seq = ('' + (track.sequence || '')).toUpperCase();
            const txi = +track.xi || 0;
            const COMP = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N', U: 'A' };
            // The base the TRANSCRIPT reads at genomic position p (complemented on a minus-strand
            // gene), which is the strand the spliceosome scans.
            const baseAt = (p) => {
                const i = Math.round(p) - txi;
                if (i < 0 || i >= seq.length) return '';
                const b = seq[i] || '';
                return plus ? b : (COMP[b] || '');
            };
            const next = (p, n) => plus ? (p + (n == null ? 1 : n)) : (p - (n == null ? 1 : n));
            const inTrack = (p) => { const i = Math.round(p) - txi; return i >= 0 && i < seq.length; };

            const eLo = Math.min(+exon.xi, +exon.xf), eHi = Math.max(+exon.xi, +exon.xf);
            if (!isFinite(eLo) || !isFinite(eHi)) return { ok: false, reason: 'That exon has no coordinates.' };
            const exonStart = plus ? eLo : eHi;      // 5' end in transcript order: the acceptor side
            const exonEnd = plus ? eHi : eLo;        // 3' end: the donor side
            const exonLen = eHi - eLo + 1;

            const exons = (track.getExons ? track.getExons() : A.filter((a) => a && a.type === 'Exon'))
                .filter((e) => e && isFinite(+e.xi) && isFinite(+e.xf))
                .sort((a, b) => plus ? (Math.min(+a.xi, +a.xf) - Math.min(+b.xi, +b.xf))
                    : (Math.max(+b.xi, +b.xf) - Math.max(+a.xi, +a.xf)));
            const order = exons.findIndex((e) => e === exon);
            const exonNo = order >= 0 ? order + 1 : null;
            if (order === 0) {
                return {
                    ok: false,
                    reason: 'This is the first exon, so it has no acceptor to destroy: its 5′ end is the '
                        + 'transcription start, not a splice site. AG scanning applies to an internal or last exon.'
                };
            }

            // ---- the authentic acceptor -------------------------------------------------------
            // The last two intronic bases, 5' of the exon's first base.
            const agG = next(exonStart, -1), agA = next(exonStart, -2);
            const reads = (baseAt(agA) || '?') + (baseAt(agG) || '?');
            const intact = reads === 'AG';

            // ---- scan downstream for the next AG ----------------------------------------------
            // From the destroyed site forwards, in transcript order. The first base of the exon
            // can pair with the last intronic base to make an AG, so the scan starts there.
            const cands = [];
            for (let k = 0; k < WINDOW && cands.length < MAX; k++) {
                const a = next(agA, k + 1), g = next(a, 1);
                if (!inTrack(a) || !inTrack(g)) break;
                if (!(baseAt(a) === 'A' && baseAt(g) === 'G')) continue;
                const newStart = next(g, 1);
                // How many exonic bases disappear: from the old first base up to the new one.
                const lost = plus ? (newStart - exonStart) : (exonStart - newStart);
                if (lost <= 0) continue;
                const beyondDonor = plus ? (newStart > exonEnd) : (newStart < exonEnd);
                cands.push({
                    ag: [a, g], newStart: newStart, lost: lost,
                    inExon: !beyondDonor, beyondDonor: beyondDonor,
                    inFrame: (lost % 3 === 0), codonsLost: (lost % 3 === 0) ? (lost / 3) : null,
                    // a few bases either side, as the transcript reads them
                    context: [-4, -3, -2, -1].map((d) => baseAt(next(a, d))).join('').toLowerCase()
                        + 'AG' + [1, 2, 3, 4].map((d) => baseAt(next(g, d))).join('').toLowerCase()
                });
                if (beyondDonor) break;   // past the donor there is no exon left to trim
            }

            const lines = [];
            const fmt = (n) => ('' + n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            lines.push('Authentic acceptor of exon' + (exonNo ? ' ' + exonNo : '') + ': the intron ends '
                + reads + (intact ? '' : ' — not the canonical AG, so this boundary is annotated rather than read from the sequence')
                + ', and the exon begins at ' + fmt(exonStart) + '.');

            if (!cands.length) {
                return {
                    ok: true, plus, exonNo, exonLen, authentic: { ag: [agA, agG], reads, intact },
                    candidates: [], chosen: -1, impact: null,
                    headline: 'No AG downstream within ' + fmt(WINDOW) + ' nt: with the acceptor destroyed this exon '
                        + 'has nothing to re-splice to, so the likely outcome is exon skipping rather than redirection.',
                    lines: lines.concat(['Use Predict effect of removing for the skipping outcome.'])
                };
            }

            const pick = Math.max(0, Math.min(cands.length - 1, Math.round(+O.pick || 0)));
            const c = cands[pick];
            lines.push('Next AG downstream: ' + fmt(c.lost) + ' nt into the exon (' + c.context + ').'
                + (cands.length > 1 ? ' ' + (cands.length - 1) + ' further AG' + (cands.length === 2 ? '' : 's')
                    + ' lie beyond it, used only if that one is blocked too.' : ''));
            lines.push(c.inFrame
                ? ('The redirected exon loses ' + fmt(c.lost) + ' nt, a multiple of 3: the reading frame is kept and '
                    + fmt(c.codonsLost) + ' codon' + (c.codonsLost === 1 ? '' : 's') + ' are removed from the protein.')
                : ('The redirected exon loses ' + fmt(c.lost) + ' nt, not a multiple of 3: the reading frame shifts by '
                    + (c.lost % 3) + ' nt from here on.'));
            if (c.beyondDonor) {
                lines.push('That AG lies past this exon’s donor, so there is no exon left between them: the '
                    + 'result is skipping, not a shorter exon.');
            }

            // ---- what it does to the protein ---------------------------------------------------
            let impact = null, headline = '';
            if (c.beyondDonor) {
                headline = 'The next AG is past the donor: predicted exon skipping.';
            } else {
                const shorter = {
                    xi: plus ? c.newStart : eLo, xf: plus ? eHi : c.newStart,
                    type: 'Exon', name: (exon.name || 'exon') + ' (redirected)', strand: exon.strand
                };
                let raw = null;
                try {
                    raw = await exec('baja/bio/orfs/exon-removal-impact.js', track, exon,
                        { replaceWith: shorter, raw: true });
                } catch (e) { raw = null; }
                if (raw && raw.ok && raw.before && raw.after) {
                    const b = raw.before, a2 = raw.after;
                    const oldLen = b.protein.length, newLen = a2.protein.length;
                    let same = 0;
                    while (same < newLen && same < oldLen && a2.protein[same] === b.protein[same]) same++;
                    const call = raw.nmdOf(a2);
                    const sameStop = !!(b.stop && a2.stop && a2.stop.join() === b.stop.join());
                    impact = {
                        oldLength: oldLen, newLength: newLen, sameStop: sameStop,
                        identical: same, novel: Math.max(0, newLen - same), nmd: call.call, nmdWhy: call.why
                    };
                    if (!a2.stop) {
                        impact.nmd = 'nonstop';
                        headline = 'No stop codon before the end of the transcript: predicted non-stop decay.';
                    } else if (sameStop && c.inFrame) {
                        headline = 'In-frame redirection: ' + fmt(oldLen) + ' → ' + fmt(newLen) + ' aa ('
                            + fmt(Math.max(0, oldLen - newLen)) + ' aa removed), normal stop codon kept.';
                        if (call.call === 'escapes') headline += ' Not an NMD target, so the shortened protein is predicted to be expressed.';
                    } else {
                        headline = (c.inFrame ? 'In frame, but the new junction creates a stop: '
                            : 'Frameshift: a stop codon falls after ') + fmt(newLen) + ' aa (was ' + fmt(oldLen) + ').';
                        headline += ({
                            'nmd': ' Premature termination codon; the mRNA is predicted to undergo NMD, so little protein is expected.',
                            'nmd-maybe-escape': ' Premature termination codon; NMD is predicted but may be incomplete, so some truncated protein could be made.',
                            'escapes': ' The mRNA escapes NMD, so a truncated protein is predicted to be expressed.',
                            'nonstop': ' No stop codon: predicted non-stop decay.'
                        }[call.call] || '');
                        if (impact.novel) lines.push('The first ' + fmt(same) + ' aa are unchanged, followed by '
                            + fmt(impact.novel) + ' aa of new sequence.');
                    }
                } else {
                    headline = (c.inFrame ? 'In-frame redirection: ' : 'Frameshifting redirection: ')
                        + fmt(c.lost) + ' nt lost from the 5′ end of the exon.';
                    lines.push('No annotated coding sequence on this track, so the protein consequence is not assessed.');
                }
            }

            return {
                ok: true, plus, exonNo, exonLen,
                authentic: { ag: [agA, agG], reads, intact },
                candidates: cands, chosen: pick, impact, headline, lines
            };
        } catch (e) {
            return { ok: false, reason: 'Could not scan for an AG: ' + (e && e.message ? e.message : e) };
        }
    })();
}
