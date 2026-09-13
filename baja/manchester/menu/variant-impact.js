function (graph, opts) {

    // variant-impact.js — what a variant on a track DOES, worked out in the background.
    //
    //   exec('baja/manchester/menu/variant-impact.js', graph)        // scan what is loaded
    //
    // A variant drawn on a transcript is a lollipop at a position. Whether that position is
    // the second base of an intron, the start codon, or a base that turns a codon into a
    // stop is the difference between a change worth designing against and a change worth
    // ignoring -- and nothing on screen said which. The track already carries everything
    // needed to answer it: its sequence, its exons, and the span it translates. So this
    // reads them, and writes the answer onto the variant where the callout text is drawn.
    //
    // WHAT IT LOOKS FOR, in the order severity falls:
    //
    //   splice donor / acceptor   the first two bases of an intron. The spliceosome reads
    //                             GT..AG; a change there is the classic exon-skipping
    //                             allele and it is not a prediction, it is the definition.
    //   frameshift                an indel whose length is not a multiple of three inside
    //                             the coding span: every codon after it is different.
    //   premature stop (PTC)      a change that makes a stop codon before the real one.
    //   start lost                a change in the first codon: translation has no ATG.
    //   stop lost                 a change in the terminal stop: read-through.
    //   splice region             3-8 bases into an intron, or the last three bases of an
    //                             exon. Weaker, and worth a flag rather than a warning.
    //   in-frame indel            a multiple of three: residues added or removed, frame kept.
    //
    // AND WHETHER A PTC IS DEGRADED OR TRANSLATED. A premature stop more than 55 bases
    // before the last exon-exon junction triggers nonsense-mediated decay -- the message is
    // destroyed and the allele is null. After that boundary the message survives and a
    // truncated protein is made, which can be worse than none at all. The two need
    // different reasoning and the flag says which it is.
    //
    // IT NEVER GUESSES PAST WHAT THE TRACK HOLDS. No Translation annotation means no
    // coding call is made at all; no sequence means only the splice geometry is read. A
    // variant it cannot judge is left exactly as it was rather than marked benign.

    return (async () => {
        const cfg = opts || {};
        const SLICE = cfg.slice || 60;          // variants between yields
        const ESSENTIAL = 2;                    // bases into the intron that ARE the splice site
        const REGION = 8;                       // and the weaker window around it
        const EXONIC_EDGE = 2;                  // the last THREE bases of an exon (0,1,2 from the edge)
        const NMD_RULE = 55;                    // bases before the last junction that trigger decay

        const STOPS = { TAA: 1, TAG: 1, TGA: 1 };
        const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', N: 'N' };
        const rc = (s) => ('' + s).toUpperCase().split('').reverse().map((c) => COMP[c] || 'N').join('');
        const up = (s) => ('' + (s || '')).toUpperCase();

        // ---- one track's coding geometry, worked out once ------------------------------
        //
        // The CDS is the exons clipped to the translated span, read in transcript order --
        // which for a minus-strand track means the exons backwards and every base
        // complemented. `at` maps a track coordinate to its index in that string, which is
        // what turns "the variant is here" into "the variant is the 412th base of the
        // coding sequence, codon 138, second position".
        const codingOf = (track) => {
            const seq = track && track.sequence;
            if (typeof seq !== 'string' || !seq.length) return null;
            const base = +track.xi;
            if (!isFinite(base)) return null;
            let exons = [];
            try { exons = (track.getExons() || []).filter((e) => isFinite(+e.xi) && isFinite(+e.xf)); } catch (e) { exons = []; }
            if (!exons.length) return null;
            exons = exons.slice().sort((a, b) => (+a.xi) - (+b.xi));
            let tr = null;
            try { tr = (track.annotations || []).find((a) => a && a.type === 'Translation'); } catch (e) { tr = null; }
            const minus = (+track.strand) < 0;
            const out = { exons: exons, minus: minus, base: base, seq: seq, cds: '', map: [], at: null, tr: tr };
            if (!tr || !isFinite(+tr.xi) || !isFinite(+tr.xf)) return out;     // splice geometry only
            const lo = Math.min(+tr.xi, +tr.xf), hi = Math.max(+tr.xi, +tr.xf);
            const pieces = [];
            for (const e of exons) {
                const a = Math.max(+e.xi, lo), b = Math.min(+e.xf, hi);
                if (b < a) continue;
                pieces.push({ a: a, b: b });
            }
            if (!pieces.length) return out;
            const order = minus ? pieces.slice().reverse() : pieces;
            const index = new Map();               // track coordinate -> index in cds
            let cds = '';
            for (const p of order) {
                const s = up(seq.substring(Math.floor(p.a - base), Math.floor(p.b - base) + 1));
                const piece = minus ? rc(s) : s;
                for (let k = 0; k < piece.length; k++) {
                    const coord = minus ? (p.b - k) : (p.a + k);
                    index.set(Math.round(coord), cds.length + k);
                }
                cds += piece;
                p.len = piece.length;
            }
            out.cds = cds;
            out.at = (coord) => { const v = index.get(Math.round(coord)); return (v == null ? -1 : v); };
            // The last exon-exon junction, as an index into the CDS: everything after it is
            // in the final exon, where a stop does not trigger decay.
            out.lastJunction = order.length > 1 ? (cds.length - (order[order.length - 1].len || 0)) : -1;
            return out;
        };

        // The first stop in a reading frame, as a codon number, or -1 if it runs off the end.
        const firstStop = (s, from) => {
            for (let i = (from || 0); i + 3 <= s.length; i += 3) {
                if (STOPS[s.substr(i, 3)]) return i / 3;
            }
            return -1;
        };

        // ---- the splice geometry: where this position sits relative to the exons --------
        const spliceOf = (G, p) => {
            const ex = G.exons;
            let inside = null, idx = -1;
            for (let i = 0; i < ex.length; i++) {
                if (p >= +ex[i].xi && p <= +ex[i].xf) { inside = ex[i]; idx = i; break; }
            }
            if (inside) {
                // The edges of the FIRST and LAST exon are the ends of the transcript, not
                // splice junctions, so a variant there is not a splice-region variant.
                const dFromStart = p - (+inside.xi), dToEnd = (+inside.xf) - p;
                const hasLeft = idx > 0, hasRight = idx < ex.length - 1;
                const near = Math.min(hasLeft ? dFromStart : Infinity, hasRight ? dToEnd : Infinity);
                return { exonic: true, exon: inside, idx: idx, edge: near <= EXONIC_EDGE ? near : -1 };
            }
            // Intronic: the gap it fell into, and how far into it from each side.
            for (let i = 0; i < ex.length - 1; i++) {
                const endL = +ex[i].xf, startR = +ex[i + 1].xi;
                if (p > endL && p < startR) {
                    const dL = p - endL, dR = startR - p;       // 1 = the first intronic base
                    // On the plus strand the left edge is the donor; on the minus strand the
                    // track runs the other way and the same edge is the acceptor.
                    const leftIsDonor = !G.minus;
                    const d = Math.min(dL, dR);
                    const which = (dL <= dR) ? (leftIsDonor ? 'donor' : 'acceptor') : (leftIsDonor ? 'acceptor' : 'donor');
                    return { exonic: false, intron: i, dist: d, side: which };
                }
            }
            return { exonic: false, intron: -1, dist: Infinity, side: '' };
        };

        // ---- one variant -----------------------------------------------------------------
        const analyse = (track, G, s) => {
            const flags = [], notes = [];
            let severity = 0;                       // 2 profound, 1 worth a flag, 0 nothing to say
            const ref = up(s.reference), alt = up(s.alternate);
            const p = Math.round(+s.xi);
            if (!isFinite(p)) return null;
            const sp = spliceOf(G, p);

            // SPLICING, which needs no translation and no coding span.
            if (!sp.exonic && sp.dist <= ESSENTIAL) {
                flags.push(sp.side === 'donor' ? 'splice donor' : 'splice acceptor');
                notes.push('base ' + sp.dist + ' of the intron: this IS the ' + sp.side + ' site');
                severity = 2;
            } else if (!sp.exonic && sp.dist <= REGION) {
                flags.push('splice region');
                notes.push(sp.dist + ' bases into the intron, beside the ' + sp.side);
                severity = Math.max(severity, 1);
            } else if (sp.exonic && sp.edge >= 0) {
                flags.push('splice region');
                notes.push('within ' + (sp.edge + 1) + ' base' + (sp.edge === 0 ? '' : 's')
                    + ' of an exon edge, which the spliceosome reads');
                severity = Math.max(severity, 1);
            } else if (!sp.exonic) {
                notes.push('intronic, away from the junctions');
            }

            // TRANSLATION, only where the track says what it translates.
            if (G.at && sp.exonic) {
                const i0 = G.at(p);
                if (i0 >= 0) {
                    const cds = G.cds;
                    const codon = Math.floor(i0 / 3);
                    const lastCodon = Math.floor((cds.length - 3) / 3);
                    // WHERE THIS TRANSCRIPT NORMALLY ENDS. A stop is only PREMATURE against
                    // the stop the reference already has: an in-frame change that leaves the
                    // transcript's own stop where it was must not be reported as creating
                    // one, which is what comparing against the end of the annotated span did
                    // on any transcript whose span runs past its stop codon.
                    const refStop = firstStop(cds, 0);
                    const normalEnd = (refStop >= 0) ? refStop : lastCodon;
                    const delta = alt.length - ref.length;
                    let mutated = null;
                    if (delta === 0 && ref.length === 1) {
                        const b = G.minus ? (COMP[alt] || 'N') : alt;
                        mutated = cds.slice(0, i0) + b + cds.slice(i0 + 1);
                    } else if (delta !== 0) {
                        // The indel's own bases in transcript orientation. The first base of a
                        // VCF indel is the anchor and is unchanged, so the edit begins after it.
                        const insSeq = G.minus ? rc(alt.slice(1)) : alt.slice(1);
                        if (delta > 0) mutated = cds.slice(0, i0 + 1) + insSeq + cds.slice(i0 + 1);
                        else mutated = cds.slice(0, i0 + 1) + cds.slice(i0 + 1 - delta);
                    }
                    if (codon === 0 && (delta !== 0 || up(cds.substr(0, 3)) === 'ATG')) {
                        if (mutated && up(mutated.substr(0, 3)) !== 'ATG') {
                            flags.push('start lost'); severity = 2;
                            notes.push('the first codon is no longer ATG');
                        }
                    }
                    if (delta !== 0 && (Math.abs(delta) % 3)) {
                        flags.push('frameshift'); severity = 2;
                        notes.push((delta > 0 ? 'inserts ' : 'deletes ') + Math.abs(delta)
                            + ' base' + (Math.abs(delta) === 1 ? '' : 's') + ' in the coding sequence, from codon ' + (codon + 1));
                    } else if (delta !== 0) {
                        flags.push('in-frame indel'); severity = Math.max(severity, 1);
                        notes.push((delta > 0 ? 'adds ' : 'removes ') + (Math.abs(delta) / 3) + ' residue'
                            + (Math.abs(delta) / 3 === 1 ? '' : 's') + ', frame kept');
                    }
                    if (mutated) {
                        const stopAt = firstStop(mutated, 0);
                        // AN IN-FRAME INDEL MOVES THE TRANSCRIPT'S OWN STOP, by a codon per
                        // three bases. Comparing the moved stop against where it used to be
                        // reported every in-frame deletion as creating a premature one.
                        const shifted = normalEnd + ((delta !== 0 && (Math.abs(delta) % 3) === 0) ? (delta / 3) : 0);
                        if (codon === refStop && refStop >= 0 && !STOPS[mutated.substr(codon * 3, 3)]) {
                            flags.push('stop lost'); severity = Math.max(severity, 2);
                            notes.push('the terminal stop is gone: translation reads through');
                        } else if (stopAt >= 0 && stopAt < shifted) {
                            flags.push('premature stop'); severity = 2;
                            const nt = stopAt * 3;
                            let nmd = '';
                            if (G.lastJunction > 0) {
                                nmd = (nt < G.lastJunction - NMD_RULE)
                                    ? 'nonsense-mediated decay predicted'
                                    : 'escapes decay: past the last junction, a truncated protein is made';
                                flags.push(nt < G.lastJunction - NMD_RULE ? 'NMD' : 'escapes NMD');
                            }
                            notes.push('a stop at codon ' + (stopAt + 1) + ' of ' + (normalEnd + 1)
                                + (nmd ? ' — ' + nmd : ''));
                        } else if (delta === 0 && stopAt >= 0 && stopAt === normalEnd && !flags.length) {
                            // The protein still ends where it did, and nothing else fired: a
                            // plain coding change, said once and only when there is nothing
                            // louder to say.
                            notes.push('codon ' + (codon + 1) + ', the reading frame and the stop are unchanged');
                        }
                    }
                }
            }

            if (!flags.length) return { flags: [], severity: 0, note: notes.join('; ') };
            return { flags: flags, severity: severity, note: notes.join('; ') };
        };

        // ---- write the answer where it is read -------------------------------------------
        //
        // `annotation` is the callout text drawn beside a lollipop, so the flag is put at
        // the front of it rather than in a field nobody looks at. Anything already there --
        // a ClinVar consequence, a note somebody wrote -- is kept after it.
        const label = (s, r) => {
            const mark = r.severity >= 2 ? '⚠ ' : '';
            const head = mark + r.flags.join(' · ');
            const prev = ('' + (s.__impactPrev != null ? s.__impactPrev : (s.annotation || ''))).trim();
            s.__impactPrev = prev;
            s.impact = { flags: r.flags.slice(), severity: r.severity, note: r.note };
            s.impactFlags = r.flags.slice();
            s.warn = r.severity >= 2;
            s.annotation = head + (r.note ? ' — ' + r.note : '') + (prev ? '  |  ' + prev : '');
            // A profound one says so without being asked; a weaker flag waits to be opened.
            if (r.severity >= 2) s.showAnnotation = true;
        };

        const tracks = (graph && graph.track) || [];
        let scanned = 0, flagged = 0, severe = 0, skipped = 0;
        for (const track of tracks) {
            const snps = (track && track.snpindels) || [];
            if (!snps.length) continue;
            const G = codingOf(track);
            if (!G) { skipped += snps.length; continue; }
            // The signature changes when the track's annotations or sequence change, which
            // is the only thing that can change an answer. A variant already judged against
            // this signature is left alone, so a rescan costs a comparison per variant.
            let sig = '';
            try { sig = (track.annotations || []).length + ':' + (track.sequence || '').length + ':' + (G.cds || '').length; } catch (e) { sig = '?'; }
            let n = 0;
            for (const s of snps) {
                if (!s) continue;
                if (s.__impactSig === sig) continue;
                s.__impactSig = sig;
                scanned++;
                let r = null;
                try { r = analyse(track, G, s); } catch (e) { r = null; }
                if (r && r.flags.length) { label(s, r); flagged++; if (r.severity >= 2) severe++; }
                else if (r) { s.impact = { flags: [], severity: 0, note: r.note }; s.impactFlags = []; s.warn = false; }
                if (++n % SLICE === 0) {
                    // Back to the browser: a thousand variants must not freeze a frame.
                    await new Promise((res) => setTimeout(res, 0));
                }
            }
        }
        try { if (graph && graph.wake) graph.wake(); } catch (e) { }
        const summary = { scanned: scanned, flagged: flagged, severe: severe, skipped: skipped };
        try { graph.__variantImpact = summary; } catch (e) { }
        if (severe && !cfg.quiet) {
            try {
                graph.setResultMessage(' ' + severe + ' variant' + (severe === 1 ? '' : 's')
                    + ' on these tracks ' + (severe === 1 ? 'has' : 'have') + ' a profound effect — a splice site, a '
                    + 'frameshift, a premature stop or a lost start — and ' + (severe === 1 ? 'is' : 'are') + ' flagged on the track. ');
            } catch (e) { try { graph.setMessage(' ' + severe + ' variant(s) flagged. '); } catch (e2) { } }
        }
        return summary;
    })();
}
