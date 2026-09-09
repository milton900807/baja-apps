function (primer3out, xoffset, track, graph) {

    exec('baja/chem/biopolymer.js').then(async Biopolymer => {

        let MGrid = await exec('flexigraph/grid.js')

        if (!xoffset) {
            xoffset = 0;
        }

        let ppsets = []

        let total = 0;
        for (let i = 0; i < 1000; i++) {
            let value = primer3out[`PRIMER_LEFT_${i}_SEQUENCE`]
            if (value) {
                total++;
            } else {
                break;
            }
        }
        for (let i = 0; i < total; i++) {
            let ppst_left = {
                id: `PRIMER_LEFT_${i}`,
                x: primer3out[`PRIMER_LEFT_${i}`],
                sequence: primer3out[`PRIMER_LEFT_${i}_SEQUENCE`],
                tm: primer3out[`PRIMER_LEFT_${i}_TM`],
                gc: primer3out[`PRIMER_LEFT_${i}_GC_PERCENT`],
                self_th: primer3out[`PRIMER_LEFT_${i}_SELF_ANY_TH`],
                self_end_th: primer3out[`PRIMER_LEFT_${i}_SELF_END_TH`],
                hairpin_th: primer3out[`PRIMER_LEFT_${i}_HAIRPIN_TH`],
                end_stability: primer3out[`PRIMER_LEFT_${i}_END_STABILITY`]
            }
            let ppst_right = {
                id: `PRIMER_RIGHT_${i}`,
                x: primer3out[`PRIMER_RIGHT_${i}`],
                sequence: primer3out[`PRIMER_RIGHT_${i}_SEQUENCE`],
                tm: primer3out[`PRIMER_RIGHT_${i}_TM`],
                gc: primer3out[`PRIMER_RIGHT_${i}_GC_PERCENT`],
                self_th: primer3out[`PRIMER_RIGHT_${i}_SELF_ANY_TH`],
                self_end_th: primer3out[`PRIMER_RIGHT_${i}_SELF_END_TH`],
                hairpin_th: primer3out[`PRIMER_RIGHT_${i}_HAIRPIN_TH`],
                end_stability: primer3out[`PRIMER_RIGHT_${i}_END_STABILITY`]
            }
            // THE PROBE, which primer3 was already designing and this was already throwing
            // away. generate-ppsets.py sets PRIMER_PICK_INTERNAL_OLIGO=1, so every result
            // here carries PRIMER_INTERNAL_i_* alongside the two primers — the sequence, its
            // interval, its Tm and GC — and none of it was read. A TaqMan set was placed on
            // the track as a bare primer pair, and the oligo carrying the dye existed only
            // in the raw result object.
            //
            // PRIMER_INTERNAL_i is [start, length] like PRIMER_LEFT_i, so it is offset the
            // same way. Absent (or empty) means primer3 could not place a probe in this
            // amplicon, and the set stays a two-oligo SYBR set rather than getting a made-up
            // third.
            let ppst_mid = null;
            const midSeq = primer3out[`PRIMER_INTERNAL_${i}_SEQUENCE`];
            const midX = primer3out[`PRIMER_INTERNAL_${i}`];
            if (midSeq && Array.isArray(midX) && midX.length >= 2) {
                ppst_mid = {
                    id: `PRIMER_INTERNAL_${i}`,
                    x: [midX[0] + xoffset, midX[1]],
                    sequence: midSeq,
                    tm: primer3out[`PRIMER_INTERNAL_${i}_TM`],
                    gc: primer3out[`PRIMER_INTERNAL_${i}_GC_PERCENT`],
                    self_th: primer3out[`PRIMER_INTERNAL_${i}_SELF_ANY_TH`],
                    self_end_th: primer3out[`PRIMER_INTERNAL_${i}_SELF_END_TH`],
                    hairpin_th: primer3out[`PRIMER_INTERNAL_${i}_HAIRPIN_TH`],
                    end_stability: primer3out[`PRIMER_INTERNAL_${i}_END_STABILITY`]
                };
            }
            let ppst_pair = {
                id: `PRIMER_PAIR_${i}`,
                compl_any_th: primer3out[`RIMER_PAIR_${i}_COMPL_ANY_TH`],
                compl_end_th: primer3out[`RIMER_PAIR_${i}_COMPL_END_TH`],
                product_size: primer3out[`PRIMER_PAIR_${i}_PRODUCT_SIZE`],
                product_tm: primer3out[`PRIMER_PAIR_${i}_PRODUCT_TM`],
            }
            ppst_left.x[0] += xoffset
            ppst_left.x[1] += xoffset
            ppst_right.x[0] += xoffset
            ppst_right.x[1] += xoffset
            const set = {
                id: i,
                left: ppst_left,
                right: ppst_right,
                pair: ppst_pair
            };
            // Only when there is one: createPrimerProbe branches on p['mid'], and a null
            // here is what keeps a probeless set a two-oligo amplicon.
            if (ppst_mid) set.mid = ppst_mid;
            ppsets.push(set)
        }
        for (let p of ppsets) {
            let primer_probe = Biopolymer.createPrimerProbe(p, track);
            track.addOligo(primer_probe);

            let grid = Object.assign(new MGrid(), graph.graph.grid)
            grid.xmax = track.tgraph.X(primer_probe.right.xf + 100);
            grid.xmin = track.tgraph.X(primer_probe.left.xi - 100);
            grid.ymax = track.tgraph.yi + Math.abs(track.tgraph.height) / 6;
            grid.ymin = track.tgraph.yi - Math.abs(track.tgraph.height - 0.5);
            grid.rescale();
            graph.addBookmark ( primer_probe.name, grid )

        }
        if (graph) {
            // Say which kind of assay was placed. A probe-based set and a SYBR set are
            // ordered and run differently, and "N primer amplicons" told the user neither.
            const withProbe = ppsets.filter((p) => p.mid).length;
            const msg = ' Added ' + ppsets.length + ' primer set' + (ppsets.length === 1 ? '' : 's')
                + (withProbe
                    ? (' — ' + withProbe + ' with a hydrolysis probe'
                        + (withProbe < ppsets.length ? (', ' + (ppsets.length - withProbe) + ' without') : ''))
                    : ' (no probe — SYBR)')
                + ' on ' + (track.name || 'track') + '. ';
            try { graph.setResultMessage(msg); } catch (e) { graph.setMessage(msg); }
        }
    })
}
