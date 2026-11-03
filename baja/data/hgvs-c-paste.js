function (server, graph, genegraph_panel_layout, text) {

    // PASTED c. VARIANTS: "c.709C>T" dropped on the canvas, placed on every track whose
    // transcript the coordinate can be counted on.
    //
    //   exec('baja/data/hgvs-c-paste.js', server, graph, genegraph_panel_layout, text)
    //
    // A c. position is TRANSCRIPT-SPECIFIC: c.709 is the 709th base of a particular coding
    // sequence, so the same string lands at different places on two transcripts of one gene and
    // means nothing at all on a track with no start codon annotated. That is the whole
    // difference from a genomic paste, and it is why this route exists:
    //
    //   * the position is counted through the exons from the annotated start codon
    //     (baja/bio/coords/cds-coords.js), never by arithmetic on the track's own index;
    //   * a transcript named in the paste (NM_004408.4:c.709C>T) picks the track it belongs to
    //     when one is on the canvas, rather than scattering the variant over all of them;
    //   * the reference base is checked against the track and a mismatch is reported, because
    //     the usual cause is the coordinate belonging to another transcript.
    //
    // Resolves { placed, tracks, unplaced, mismatched }.
    const say = (m, secs) => { try { graph.setMessage(' ' + m + ' ', secs); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        const P = await exec('baja/io/parse/parse-hgvs-c.js');
        const vars = P(text);
        if (!vars.length) { say('No c. variants found in the paste.', 3); return { placed: 0, tracks: 0, unplaced: [], mismatched: [] }; }

        let SnpIndel = null;
        try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }
        if (!SnpIndel) { say('Variant support unavailable.', 3); return { placed: 0, tracks: 0, unplaced: vars, mismatched: [] }; }

        const COMP = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
        const tracks = ((graph && graph.track) || []).filter(Boolean);
        // The c. coordinate system of each track, built once.
        const coords = [];
        for (const t of tracks) {
            let C = null;
            try { C = await exec('baja/bio/coords/cds-coords.js', t); } catch (e) { C = null; }
            if (C && C.ok) coords.push({ track: t, C: C });
        }
        if (!coords.length) {
            say('No track on the canvas has an annotated start codon, so a c. position cannot be counted. Load a transcript with its CDS first.', 6);
            return { placed: 0, tracks: 0, unplaced: vars, mismatched: [] };
        }

        // A transcript named in the paste narrows it to the track that carries that name.
        const nameOf = (t) => ('' + (t.name || t.id || '')).toLowerCase();
        const pickFor = (v) => {
            const pre = ('' + (v.prefix || '')).toLowerCase().replace(/^.*\(|\).*$/g, '');
            if (!pre) return coords;
            const bare = pre.replace(/\.\d+$/, '');
            const hit = coords.filter((c) => {
                const n = nameOf(c.track);
                return n && (n.indexOf(pre) >= 0 || n.indexOf(bare) >= 0
                    || ('' + (c.track.id || '')).toLowerCase().indexOf(bare) >= 0);
            });
            return hit.length ? hit : coords;
        };

        const touched = new Set(), unplaced = [], mismatched = [];
        let placed = 0, pushed = false;

        for (const v of vars) {
            let hits = 0;
            for (const { track, C } of pickFor(v)) {
                const xa = C.toX({ pos: v.pos, offset: v.offset, region: v.region });
                const xb = C.toX({ pos: v.posEnd, offset: v.offsetEnd, region: v.regionEnd });
                if (xa == null || xb == null) continue;

                // What the track reads there, in transcript orientation.
                const seq = ('' + (track.sequence || '')).toUpperCase();
                const txi = +track.xi || 0;
                const readAt = (p) => {
                    const i = Math.round(p) - txi;
                    if (i < 0 || i >= seq.length) return '';
                    const b = seq[i] || '';
                    return C.plus ? b : (COMP[b] || '');
                };
                const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
                const spanRef = [];
                for (let p = (C.plus ? lo : hi); C.plus ? p <= hi : p >= lo; p += (C.plus ? 1 : -1)) spanRef.push(readAt(p));
                const reads = spanRef.join('');

                // The reference the paste claims, where it carries one.
                if (v.ref && reads && v.ref !== reads) {
                    mismatched.push(v.label + ' on ' + (track.name || 'track') + ': says ' + v.ref + ', track reads ' + reads);
                    continue;
                }

                // HGVS -> the VCF-shaped alleles a SnpIndel is built from, anchored on the base
                // before the change for an indel, which is how every other route stores them.
                let type = 'snp', ref = '', alt = '', anchorX = xa;
                if (v.kind === 'sub') { type = 'snp'; ref = v.ref || reads; alt = v.alt; }
                else if (v.kind === 'del') {
                    type = 'del';
                    const before = C.plus ? lo - 1 : hi + 1;
                    anchorX = before; ref = readAt(before) + reads; alt = readAt(before);
                } else if (v.kind === 'dup') {
                    type = 'ins';
                    const before = C.plus ? hi : lo;        // duplicated run is inserted after it
                    anchorX = before; ref = readAt(before); alt = readAt(before) + reads;
                } else if (v.kind === 'ins') {
                    type = 'ins';
                    anchorX = xa;                            // between xa and xb
                    ref = readAt(xa); alt = readAt(xa) + v.alt;
                } else if (v.kind === 'delins') {
                    const before = C.plus ? lo - 1 : hi + 1;
                    anchorX = before;
                    ref = readAt(before) + reads; alt = readAt(before) + v.alt;
                    type = (alt.length > ref.length) ? 'ins' : (alt.length < ref.length ? 'del' : 'snp');
                    if (type === 'snp') { anchorX = xa; ref = reads; alt = v.alt; }
                }
                if (!ref || !alt) continue;

                if (!pushed) { try { graph.pushOntoHistory(); } catch (e) { } pushed = true; }
                try {
                    // transcriptStrand, so SnpIndel keeps the right complemented copy for a
                    // minus-strand gene -- the same convention the VCF route uses.
                    const snp = new SnpIndel(type, Math.round(anchorX), ref, alt, 0,
                        C.plus ? 1 : -1, v.label, null, null);
                    snp.name = v.label;
                    snp.source = 'Pasted (c.)';
                    try { snp.setAnnotation(['HGVSc=' + v.label]); } catch (e) { }
                    track.addsnpindel(snp);
                    track.showSnpIndels = true;
                    touched.add(track); hits++; placed++;
                } catch (e) { }
            }
            if (!hits) unplaced.push(v);
        }
        try { if (graph.wake) graph.wake(); } catch (e) { }

        const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
        let msg = '';
        if (placed) msg = 'Placed ' + plural(vars.length - unplaced.length, 'c. variant') + ' on ' + plural(touched.size, 'track') + '.';
        if (mismatched.length) msg += ' ' + plural(mismatched.length, 'mismatch') + ': ' + mismatched.slice(0, 2).join('; ')
            + (mismatched.length > 2 ? '; …' : '') + '. A c. position belongs to one transcript: check it is this one.';
        if (unplaced.length && !placed) {
            msg = 'Could not place ' + unplaced.map((v) => v.label).join(', ')
                + (mismatched.length ? '. ' + mismatched.slice(0, 2).join('; ') : '')
                + '. The position may lie outside this transcript, or belong to another one.';
        } else if (unplaced.length) {
            msg += ' ' + plural(unplaced.length, 'variant') + ' could not be placed.';
        }
        say(msg, 6);
        restoreHover();
        return { placed, tracks: touched.size, unplaced, mismatched };
    })();
}
