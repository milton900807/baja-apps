function (primer3out, track, splicekeys, anchor) {
    console.log(primer3out)
    function reverseComp(str) {
        let s = str.split("").reverse().join("");
        let a = '';
        for (let c of s) {
            c = '' + c;
            if (c == 'A') {
                a += 'T'
            } else if (c == 'T') {
                a += 'A'
            } else if (c == 'G') {
                a += 'C'
            } else if (c == 'C') {
                a += 'G'
            }
        }
        return a;
    }

    return new Promise( (resolve,reject) => {

        exec('baja/chem/biopolymer.js').then(Biopolymer => {

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
                let ppst_mid = {
                    id: `PRIMER_INTERNAL_${i}`,

                    x: primer3out[`PRIMER_INTERNAL_${i}`],
                    sequence: primer3out[`PRIMER_INTERNAL_${i}_SEQUENCE`],
                    tm: primer3out[`PRIMER_INTERNAL_${i}_TM`],
                    gc: primer3out[`PRIMER_INTERNAL_${i}_GC_PERCENT`],
                    self_th: primer3out[`PRIMER_INTERNAL_${i}_SELF_ANY_TH`],
                    self_end_th: primer3out[`PRIMER_INTERNAL_${i}_SELF_END_TH`],
                    hairpin_th: primer3out[`PRIMER_INTERNAL_${i}_HAIRPIN_TH`],
                    end_stability: primer3out[`PRIMER_INTERNAL_${i}_END_STABILITY`]
                }
                let ppst_pair = {
                    id: `PRIMER_PAIR_${i}`,
                    compl_any_th: primer3out[`PRIMER_PAIR_${i}_COMPL_ANY_TH`],
                    compl_end_th: primer3out[`PRIMER_PAIR_${i}_COMPL_END_TH`],
                    product_size: primer3out[`PRIMER_PAIR_${i}_PRODUCT_SIZE`],
                    product_tm: primer3out[`PRIMER_PAIR_${i}_PRODUCT_TM`],
                }
                ppsets.push({
                    id: i,
                    left: ppst_left,
                    mid: ppst_mid,
                    right: ppst_right,
                    pair: ppst_pair
                })
            }

            for (let p of ppsets) {
                if ( anchor ) {
                    console.log(anchor, 'leftp', p['left'].sequence);
                    console.log(anchor, 'rightp', p['right'].sequence);
                    console.log(anchor, 'midp', p['mid'].sequence);
                } else {
                    console.log('leftp', p['left'].x.split(",")[0] ,p['left'].sequence);
                    console.log('rightp', p['right'].x.split(",")[0], p['right'].sequence);
                    console.log('midp', p['mid'].x.split(",")[0], p['mid'].sequence);
                }
                if ( track.strand > 0 ) {
                    if ( splicekeys ) {
                        for ( let d of [ 'left', 'right', 'mid' ]) {
                            p[d].x = (splicekeys[+p[d].x.split(',')[0]] - track.xi ).toString();
                            p[d].synthesisSequence = p[d].sequence;
                        }
                    }
                } else {
                    let queryseq = primer3out[`SEQUENCE_TEMPLATE`];
                    let flip = queryseq.length;
                    if ( splicekeys ) {
                        for ( let d of [ 'left', 'right', 'mid' ]) {
                            let [pxi, pxl] = p[d].x.split(',');
                            if ( d == 'right' ) {
                                p[d].x = (splicekeys[(flip - (~~pxi - ~~pxl))] - track.xi).toString();
                            } else {
                                p[d].x = (splicekeys[(flip - (~~pxi + ~~pxl))] - track.xi).toString();
                            }
                            p[d].synthesisSequence = p[d].sequence;
                            p[d].sequence = p[d].sequence.split("").reverse().join("");
                        }
                        let pl = p['right'];
                        pl.sequence = reverseComp(pl.sequence);
                        pl.x = (~~pl.x - pl.sequence.length - 1).toString();
                        let pr = p['left'];
                        pr.sequence = reverseComp(pr.sequence);
                        pr.x = (pr.sequence.length + ~~pr.x - 1).toString();
                        p['left'] = pl;
                        p['right'] = pr;
                    } else {
                        for ( let d of [ 'left', 'right', 'mid' ]) {
                            let [pxi, pxl] = p[d].x.split(',');
                            if ( d == 'right' ) {
                                p[d].x = (flip - (~~pxi - ~~pxl)).toString();
                            } else {
                                p[d].x = (flip - (~~pxi + ~~pxl)).toString();
                            }
                            p[d].synthesisSequence = p[d].sequence;
                            p[d].sequence = p[d].sequence.split("").reverse().join("");
                        }
                        let pl = p['right'];
                        pl.sequence = reverseComp(pl.sequence);
                        pl.x = (~~pl.x - pl.sequence.length - 1).toString();
                        let pr = p['left'];
                        pr.sequence = reverseComp(pr.sequence);
                        pr.x = (pr.sequence.length + ~~pr.x - 1).toString();
                        p['left'] = pl;
                        p['right'] = pr;
                    }
                }
            }

            for (let p of ppsets) {

                let ppxi = +p['left'].x.split(",") + track.xi;
                let ppxf = +p['right'].x.split(",") + p['right'].sequence.length + track.xi;

                let overlap = 0;
                for (let a of track.oligos) {
                    if ( a.type == 'amplicon' ) {
                        if ( (a.left.xi > ppxi && a.left.xi < ppxf) || (a.right.xf < ppxf && a.right.xf > ppxi ) )
                        overlap += 0.15
                    }
                }

                let primer_probe = Biopolymer.createPrimerProbe(p, track);
                primer_probe.right.synthesisSequence = p['right'].synthesisSequence;
                primer_probe.left.synthesisSequence = p['left'].synthesisSequence;
                primer_probe.mid.synthesisSequence = p['mid'].synthesisSequence;
                primer_probe.right.y += overlap;
                primer_probe.left.y += overlap;
                primer_probe.mid.y += overlap;
                primer_probe.y = primer_probe.right.y;

                if (anchor) {
                    primer_probe.inColor = 'orange';
                    primer_probe.outColor = 'purple';
                }
                resolve(primer_probe);
            }
        })
    })
}
