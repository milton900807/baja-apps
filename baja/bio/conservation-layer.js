function (graph, track, data, range) {

    // CONSERVATION, ON THE TRACK, IN THE TRACK'S OWN COORDINATES.
    //   exec('baja/bio/conservation-layer.js', graph, track, conservationResult, {start, end})
    //
    // The full-screen map answers "where is this gene conserved" for the whole protein. With
    // a region selected the question is narrower and so is the useful answer: how conserved
    // is THIS, against the rest of the same protein, drawn where the bases are rather than
    // in a separate window with its own axis to match up by eye.
    //
    // THE TRACE IS IN BASES, THE DATA IS IN RESIDUES. Ensembl aligns proteins, so what comes
    // back is one number per amino acid; the track is nucleotides. Each residue is painted
    // across the three bases of its own codon, taken from the track's own reading frame, so
    // a peak sits on the codon that earned it. Everything outside the ORF -- the UTRs, the
    // introns of a gene track -- has no residue and is left empty rather than interpolated,
    // because a smooth line across a 3' UTR would be an invention.
    //
    // AGAINST THE REST OF THE SAME PROTEIN. A region at 82% identical means nothing on its
    // own: the answer is whether that is high or low for this gene, so the panel reports the
    // region, the whole protein, and the gap between them.

    return new Promise(async (resolve) => {
        try {
            if (!track) { resolve({ error: 'no track to draw on' }); return; }
            const prof = (data && data.profile) || {};
            const ident = prof.identical || [], simil = prof.similar || [];
            const nSp = +prof.n || ((data && data.species_rows) || []).length;
            const L = +((data && data.length) || 0);
            if (!L || !nSp || !ident.length) { resolve({ error: 'there is nothing to draw' }); return; }

            // Residue -> the base its codon starts at, the walk the editor draws the ORF from.
            const pos = [], seen = {};
            try {
                const cdsi = (track.orf && Array.isArray(track.orf.cdsi)) ? track.orf.cdsi : [];
                for (const c of cdsi) {
                    if (!c || c.ci !== 0 || seen[c.codon_index]) continue;
                    const aa = '' + (c.aa || '');
                    if (!aa || /^stop$/i.test(aa)) break;
                    seen[c.codon_index] = 1;
                    pos.push(+c.index);
                }
            } catch (e) { }
            if (!pos.length) {
                resolve({ error: (track.name || 'that track') + ' has no reading frame, so there '
                    + 'is no codon to put a residue on' });
                return;
            }
            if (Math.abs(pos.length - L) > 2) {
                // The same guard the map uses: a residue number from one protein points at
                // the wrong codon of another.
                resolve({ error: (track.name || 'the track') + ' is ' + pos.length.toLocaleString()
                    + ' residues and Ensembl aligned ' + L.toLocaleString()
                    + ', so they are different transcripts and the conservation cannot be put '
                    + 'on this one' });
                return;
            }

            const TrackLayer = await exec('baja/bio/track-layer.js');
            const name = (track.name || 'track') + '_conservation';
            // One layer of this kind per track: drawing a second over the first leaves two
            // traces and no way to tell which is which.
            try {
                const keep = (track.track_layers || []).filter((l) => !l || l.name !== name);
                if (keep.length !== (track.track_layers || []).length) {
                    try { if (track.noteLayerRemoved) {
                        for (const l of (track.track_layers || [])) {
                            if (l && l.name === name) track.noteLayerRemoved(l);
                        }
                    } } catch (e) { }
                    track.track_layers = keep;
                }
            } catch (e) { }

            const lo = Math.min(+track.xi, +track.xf), hi = Math.max(+track.xi, +track.xf);
            const layer = new TrackLayer(name, lo, 0, hi, 1);
            layer.data_type = 'CONSERVATION';
            try { layer.fillstyle = 'rgba(47,158,111,0.55)'; } catch (e) { }
            try { layer.polygon_type = 'fill'; } catch (e) { }

            // Drawn downward like the other traces on a track, so a tall bar is a conserved
            // one whichever way the track's own axis runs.
            const frac = [];
            for (let r = 0; r < Math.min(L, pos.length); r++) {
                frac.push((ident[r] || 0) / nSp);
            }
            let first = null, last = null;
            layer.addPolygonPoint(pos[0], 0);
            for (let r = 0; r < frac.length; r++) {
                const x = pos[r];
                if (!isFinite(x)) continue;
                if (first === null) first = x;
                last = x + 2;
                const y = -frac[r];
                // Across the whole codon: a residue is three bases wide and a single point
                // per codon draws a comb rather than a profile.
                layer.addPolygonPoint(x, y);
                layer.addPolygonPoint(x + 2, y);
            }
            layer.addPolygonPoint(last == null ? pos[0] : last, 0);
            try { layer.sortPolygonPoints(); } catch (e) { }
            try { track.addLayer(layer); } catch (e) { track.track_layers = (track.track_layers || []).concat([layer]); }

            // ---- what the selected region actually says -----------------------------------
            const inRange = (x) => !range || (x >= Math.min(range.start, range.end)
                && x <= Math.max(range.start, range.end));
            let rI = 0, rS = 0, rN = 0, aI = 0, aS = 0, aN = 0, r0 = null, r1 = null;
            for (let r = 0; r < frac.length; r++) {
                const x = pos[r];
                aI += (ident[r] || 0) / nSp; aS += (simil[r] || 0) / nSp; aN++;
                if (!inRange(x)) continue;
                if (r0 === null) r0 = r + 1;
                r1 = r + 1;
                rI += (ident[r] || 0) / nSp; rS += (simil[r] || 0) / nSp; rN++;
            }
            const pct = (x) => ((Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%');
            const whole = { identity: aN ? aI / aN : 0, similarity: aN ? aS / aN : 0, residues: aN };
            const region = rN
                ? { identity: rI / rN, similarity: rS / rN, residues: rN, from: r0, to: r1 }
                : null;

            try { if (graph.wake) graph.wake(); } catch (e) { }

            const rows = [];
            if (range && !region) {
                // A SELECTION OFF THE ORF IS AN ANSWER ABOUT THE SELECTION. A 3' UTR has no
                // residues, so it has no protein conservation -- which is a fact about it,
                // not a failure of the lookup.
                rows.push(['answer', 'The selected region holds no coding bases of '
                    + (track.name || 'this track') + ', so it has no protein conservation to '
                    + 'show. The trace covers the coding sequence; a UTR or an intron is '
                    + 'empty because there is no residue there, not because nothing is '
                    + 'conserved.']);
            } else if (region) {
                const d = region.identity - whole.identity;
                rows.push(['answer', 'The selected region is residues ' + region.from + '–'
                    + region.to + ' (' + region.residues.toLocaleString() + ' of '
                    + whole.residues.toLocaleString() + '), and across the ' + nSp
                    + ' species it is ' + pct(region.identity) + ' identical against '
                    + pct(whole.identity) + ' for the whole protein: '
                    + (Math.abs(d) < 0.02 ? 'about the same as the rest of the gene'
                        : (d > 0 ? ((pct(d)) + ' MORE conserved than the rest of the gene')
                            : ((pct(-d)) + ' LESS conserved than the rest of the gene'))) + '.']);
                rows.push(['region', pct(region.identity) + ' identical, ' + pct(region.similarity)
                    + ' identical or conservative, over ' + region.residues.toLocaleString()
                    + ' residues.']);
            } else {
                rows.push(['answer', (track.name || 'This track') + ' is ' + pct(whole.identity)
                    + ' identical across the ' + nSp + ' species, over '
                    + whole.residues.toLocaleString() + ' residues. Select a stretch and ask '
                    + 'again to have it measured against this.']);
            }
            rows.push(['whole protein', pct(whole.identity) + ' identical, '
                + pct(whole.similarity) + ' identical or conservative.']);
            rows.push(['the trace', 'Drawn on ' + (track.name || 'the track') + ' as '
                + name + ': one bar per codon, full height where all ' + nSp
                + ' species have the same residue. It covers the coding sequence only, since '
                + 'a UTR has no residue to be conserved.']);
            rows.push(['species', ((data.species_rows || []).map((x) => (x.species_common || x.species)
                + ' (' + (x.symbol || '?') + ')').join(', ')) + '.']);

            const help = { title: 'Conservation of ' + (data.gene || track.name), rows: rows,
                note: 'Identity is over Ensembl’s own protein alignments, one column per '
                    + 'residue, so this is conservation of the PROTEIN measured on the bases '
                    + 'that encode it.' };
            try { await exec('baja/bio/decor-help.js', { decor: { help: help } }, graph); }
            catch (e) { try { graph.setResultMessage(rows[0][1]); } catch (e2) { } }

            resolve({ layer: name, region: region, whole: whole, species: nSp,
                answer: rows[0][1] });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
