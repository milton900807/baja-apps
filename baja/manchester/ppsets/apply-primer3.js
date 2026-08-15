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
            ppsets.push({
                id: i,
                left: ppst_left,
                right: ppst_right,
                pair: ppst_pair
            })
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
            graph.setMessage("Added " + ppsets.length + " primer amplicons to the track.")
        }
    })
}
