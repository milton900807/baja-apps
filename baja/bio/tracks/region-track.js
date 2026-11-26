function (graph, track, spec, opts, panel) {

    // CUT A NAMED REGION OUT OF A TRACK, AS A TRACK OF ITS OWN.
    //   exec('baja/bio/tracks/region-track.js', graph, track, { region: 'three_prime_utr' }, {}, panel)
    //   exec('baja/bio/tracks/region-track.js', graph, track, { region: 'exon', index: 14 })
    //   exec('baja/bio/tracks/region-track.js', graph, track, { region: 'annotation', name: 'DYNc' })
    //
    // "cut the 3' UTR from DNM3 and DNM1" had no answer. The parts were all here -- the
    // editor knows where the 3' UTR is (track-regions.js) and can copy a track (copyTrack) --
    // but nothing joined them, so working on one region of a transcript meant copying the
    // whole gene and deleting by hand.
    //
    // THE SLICE KEEPS THE PARENT'S COORDINATES. The new track runs from the region's first
    // base to its last in the SAME frame the parent uses, rather than being renumbered from
    // one: a variant at 171,841,900 is at 171,841,900 on both, every annotation carried over
    // still means what it meant, and anything worked out on the piece can be read back
    // against the gene. Renumbering would have made the two incomparable for no gain.
    //
    // IT IS A SLICE, NOT A SPLICE. A region that spans introns brings them with it, because
    // that is what cutting that stretch out of a genomic track gives. The message says how
    // many exon pieces and introns are inside, and Create mRNA on the new track is the
    // spliced version; building a second splicer here would be a second answer to a question
    // make-mrna already answers.
    //
    // WHAT DOES NOT COME: data layers. A layer is a model's output over the parent, and
    // carrying it onto a 400 base window leaves a picture that looks computed for this track
    // and was not. Annotations, variants and compounds inside the window do come, clipped.

    return new Promise(async (resolve) => {
        try {
            const g = graph, t = track, o = opts || {};
            if (!g || !t) { resolve({ error: 'there is no track to cut from' }); return; }
            const who = '' + (t.name || 'that track');

            if (typeof t.copyTrack !== 'function') {
                resolve({ error: who + ' is not a kind of track that can be cut up' });
                return;
            }
            const seq = '' + (t.sequence || '');
            if (!seq) { resolve({ error: who + ' has no sequence loaded, so there is nothing to cut' }); return; }

            const R = await exec('baja/bio/track-regions.js', t);
            if (!R) { resolve({ error: 'the regions of ' + who + ' could not be read' }); return; }
            const r = R.resolve(spec || {});
            if (r.error) { resolve({ error: r.error }); return; }

            const lo = Math.max(Math.floor(r.start), Math.floor(t.xi));
            const hi = Math.min(Math.ceil(r.end), Math.floor(t.xi) + seq.length - 1);
            if (!(hi > lo)) { resolve({ error: r.label + ' of ' + who + ' has no extent inside the loaded sequence' }); return; }
            const len = hi - lo + 1;

            // The name: what was asked for, else the parent's with the region on the end, in
            // the form someone would type -- DNM3_3utr. Built from the SPEC rather than the
            // label, because the label is written to be read ("exon 14 of 22", "3 UTR") and
            // slugging that gives DNM3_exon_14_of_22.
            const sp = spec || {};
            const what = ('' + (sp.region || '')).trim().toLowerCase();
            const clean = (v) => ('' + (v == null ? '' : v)).replace(/[^0-9a-zA-Z]+/g, '');
            let slug;
            if (what === 'five_prime_utr') slug = '5utr';
            else if (what === 'three_prime_utr') slug = '3utr';
            else if (what === 'cds') slug = 'cds';
            else if (what === 'transcript') slug = 'transcript';
            else if (what === 'exon' || what === 'intron') slug = what + (sp.index != null ? sp.index : '');
            else if (what === 'annotation') slug = clean(sp.name) || 'annotation';
            else slug = Math.floor(r.start) + '_' + Math.floor(r.end);
            const asked = ('' + (o.name == null ? '' : o.name)).trim();

            const made = t.copyTrack(asked || (who + '_' + slug));
            if (!made) { resolve({ error: 'the copy ' + who + ' is cut from could not be made' }); return; }

            // ---- the cut itself ---------------------------------------------------------
            const off = lo - Math.floor(t.xi);
            made.sequence = seq.substring(off, off + len);
            made.xi = lo;
            made.xf = hi;
            // Genomic coordinates follow the same offset, when the parent carries them.
            try {
                if (t.gxi != null && t.gxf != null) {
                    const gplus = (+t.gxf >= +t.gxi);
                    made.gxi = gplus ? (+t.gxi + off) : (+t.gxi - off);
                    made.gxf = gplus ? (made.gxi + len - 1) : (made.gxi - len + 1);
                }
            } catch (e) { }

            const within = (a) => {
                const alo = Math.min(+a.xi, +a.xf), ahi = Math.max(+a.xi, +a.xf);
                return isFinite(alo) && isFinite(ahi) && ahi >= lo && alo <= hi;
            };
            // Annotations are CLIPPED, not dropped: an exon half inside the window is drawn
            // as the half that is here, which is what the track actually holds. The ones
            // that were cut are counted, because an exon drawn whole that is not whole is
            // the kind of thing somebody designs against.
            let clipped = 0;
            const keptAnn = [];
            for (const a of (made.annotations || [])) {
                if (!a || !within(a)) continue;
                const alo = Math.min(+a.xi, +a.xf), ahi = Math.max(+a.xi, +a.xf);
                if (alo < lo || ahi > hi) {
                    clipped++;
                    const nlo = Math.max(alo, lo), nhi = Math.min(ahi, hi);
                    try { a.xi = nlo; a.xf = nhi; } catch (e) { }
                    try { a.clippedToRegion = true; } catch (e) { }
                }
                keptAnn.push(a);
            }
            made.annotations = keptAnn;

            const insideOnly = (list) => (Array.isArray(list) ? list.filter((v) => {
                try {
                    const vlo = Math.min(+v.xi, +(v.xf != null ? v.xf : v.xi));
                    const vhi = Math.max(+v.xi, +(v.xf != null ? v.xf : v.xi));
                    return isFinite(vlo) && vlo >= lo && vhi <= hi;
                } catch (e) { return false; }
            }) : []);
            const droppedVars = (made.snpindels || []).length;
            made.snpindels = insideOnly(made.snpindels);
            const droppedOligos = (made.oligos || []).length;
            made.oligos = insideOnly(made.oligos);
            made.structures = insideOnly(made.structures);
            const hadLayers = (made.track_layers || []).length;
            made.track_layers = [];
            try { made.markstart = null; made.markend = null; } catch (e) { }

            // The grid: same left edge and one step from the parent, which copyTrack already
            // set, with the window it now covers and a width that keeps one unit to the base.
            try {
                const G = made.grid || made.tgraph;
                if (G) {
                    G.setxmin(lo); G.setxmax(hi);
                    G.width = len;
                    G.rescale();
                }
            } catch (e) { }

            g.track.push(g.ensureUniqueTrackName ? g.ensureUniqueTrackName(made) : made);
            try { g.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js'); } catch (e) { }
            try { g.deselectAllTracks(); } catch (e) { }
            try { made.select(); } catch (e) { }
            try {
                const G = made.grid || made.tgraph;
                g.animateTo(G.xi - 100, G.xi + G.width + 100, G.Y(-3), G.Y(3));
            } catch (e) { }
            try {
                if (isMobile() && panel) {
                    CurrentLayout.clearComponent('mainPanel');
                    CurrentLayout.setComponent('mainPanel', panel);
                }
            } catch (e) { }
            try { if (g.wake) g.wake(); } catch (e) { }

            // HOW MUCH OF IT IS EXON, said because a 3' UTR cut from a genomic track is
            // mostly intron on a gene with a long last intron, and the number is the
            // difference between a track worth designing against and one that is not.
            let exonic = 0, pieces = 0;
            try {
                for (const a of made.annotations) {
                    if (!a || !/^exon$/i.test('' + (a.type || ''))) continue;
                    pieces++;
                    exonic += Math.abs(+a.xf - +a.xi) + 1;
                }
            } catch (e) { }

            const bits = [];
            if (pieces) bits.push(pieces + ' exon piece' + (pieces === 1 ? '' : 's')
                + ' (' + exonic.toLocaleString() + ' nt of the ' + len.toLocaleString() + ')');
            if (clipped) bits.push(clipped + ' annotation' + (clipped === 1 ? '' : 's') + ' clipped at the edge');
            if (made.snpindels.length) bits.push(made.snpindels.length.toLocaleString() + ' variants');
            if (made.oligos.length) bits.push(made.oligos.length.toLocaleString() + ' compounds');

            try {
                g.setMessage(made.name + ': the ' + r.label + ' of ' + who + ', '
                    + len.toLocaleString() + ' nt at ' + lo.toLocaleString() + '–' + hi.toLocaleString()
                    + (bits.length ? (', with ' + bits.join(', ')) : '')
                    + (pieces > 1 ? '. It is a genomic slice, so the introns between those pieces came too: run Create mRNA on it for the spliced version' : '')
                    + (hadLayers ? '. Data layers were not carried over' : ''), 8);
            } catch (e) { }

            resolve({
                track: made, name: made.name, from: t.name, label: r.label,
                start: lo, end: hi, length: len, exonic: exonic, pieces: pieces,
                clipped: clipped, variants: made.snpindels.length,
                compounds: made.oligos.length, layersDropped: hadLayers,
                variantsDropped: droppedVars - made.snpindels.length,
                compoundsDropped: droppedOligos - made.oligos.length
            });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
