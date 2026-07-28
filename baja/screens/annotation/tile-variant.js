function (variant, selectedTrack, graph, opposite, all) {

    async function checkforOverlap(variant, neighbors) {
        let nonoverlap = [];
        for (let sid of neighbors) {

            if (variant.phase == sid.phase) {
                if (!((sid.xi >= variant.xi && sid.xi < variant.xf) || (variant.xi >= sid.xi && variant.xi < sid.xf))) {
                    nonoverlap.push(sid);
                }
            }

        }
        return nonoverlap;
    }

    return new Promise(async (resolve, reject) => {
        let Biopolymer = await exec('baja/chem/biopolymer.js');
        let chemistryObject = graph.props.selected_chemistry;
        if (!chemistryObject) {
            alert(' Please select a chemistry first ')
            return;
        }

        let base_count = Biopolymer.countBases(chemistryObject);

        let plot = true;
        let neighbors = null;

        if (opposite) {
            neighbors = await selectedTrack.neighborSnpindel(variant, base_count, 0);
            for (let sid of neighbors) {

                if (sid.xi == variant.xi && !all) {
                    graph.setMessage('Variant detected in opposite phase. Tile that variant.');
                    plot = false;
                    break;
                }
            }
        } else {
            neighbors = await selectedTrack.neighborSnpindel(variant, base_count, 1)
        }

        neighbors = await checkforOverlap(variant, neighbors);

        if (plot) {

            let tiles = null;
            let tilef = null;
            if (variant.type == 'snp') {

                tiles = Math.max(variant.xi - base_count, selectedTrack.xi);
                tilef = Math.min(variant.xf + base_count, selectedTrack.xf);
            } else {

                tiles = Math.max(variant.xi - base_count + 1, selectedTrack.xi);
                tilef = Math.min(variant.xf + base_count, selectedTrack.xf);
            }

            let trackseq = selectedTrack.getSequenceRange(tiles, tilef);
            let indices = Array(trackseq.length).fill(tiles).map((x, y) => x + y);

            let splicedtrack = null;
            let splicedindices = null;
            if (!opposite) {
                if (!variant.alternate0) {
                    splicedtrack = trackseq.slice(0, indices.indexOf(variant.xi))
                        + variant.alternate
                        + trackseq.slice(indices.indexOf(variant.xf));
                    splicedindices = indices.slice(0, indices.indexOf(variant.xi)).concat(
                        Array(variant.alternate.length).fill(variant.xi),
                        indices.slice(indices.indexOf(variant.xf))
                    );

                } else {
                    splicedtrack = trackseq.slice(0, indices.indexOf(variant.xi))
                        + variant.alternate0
                        + trackseq.slice(indices.indexOf(variant.xf));
                    splicedindices = indices.slice(0, indices.indexOf(variant.xi)).concat(
                        Array(variant.alternate0.length).fill(variant.xi),
                        indices.slice(indices.indexOf(variant.xf))
                    );
                }
            } else {
                splicedtrack = trackseq;
                splicedindices = indices;
            }

            if (neighbors.length > 0) {
                for (let sid of neighbors) {
                    if (!variant.alternate0) {
                        splicedtrack = trackseq.slice(0, indices.indexOf(variant.xi))
                            + variant.alternate
                            + trackseq.slice(indices.indexOf(variant.xf));
                        splicedindices = indices.slice(0, indices.indexOf(variant.xi)).concat(
                            Array(variant.alternate.length).fill(variant.xi),
                            indices.slice(indices.indexOf(variant.xf))
                        );

                    } else {

                        splicedtrack = splicedtrack.slice(0, splicedindices.indexOf(sid.xi))
                            + sid.alternate0
                            + splicedtrack.slice(splicedindices.indexOf(sid.xf));
                        splicedindices = splicedindices.slice(0, splicedindices.indexOf(sid.xi)).concat(
                            Array(sid.alternate0.length).fill(sid.xi),
                            splicedindices.slice(splicedindices.indexOf(sid.xf))
                        );
                    }
                }
            }

            let existingOligos = [];
            for (let o of selectedTrack.oligos) {
                existingOligos.push(o.sequence);
            }

            for (let i = 1; i < splicedtrack.length - base_count; i++) {

                let sequence = splicedtrack.slice(i, i + base_count)

                let start = splicedindices[i]
                let end = start + base_count

                if (splicedindices[i + Math.floor(base_count / 2)] > variant.xf) {
                    end = splicedindices[i + base_count]
                    start = end - base_count
                }

                if (!(existingOligos.includes(sequence))) {
                    let bioObject = {
                        'targetSequence': sequence,
                        'trackName': selectedTrack.name,
                        'startIndex': start,
                        'strand': selectedTrack.strand,
                        'endIndex': (end),
                        'y': (selectedTrack.tgraph.ymax),
                    }

                    console.log(" --------generating the compounds --------------- ")
                    let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                    let ytmp = 0.15;

                    for (let _o of selectedTrack.oligos) {
                        if ((_o.xi >= anno.xi && _o.xi <= anno.xf) || (anno.xi >= _o.xi && anno.xi <= _o.xf)) {
                            if (_o.y <= ytmp) {
                                ytmp += 0.02;
                            }
                        }
                    }

                    anno.y = ytmp;

                    let phaseInfo = `_target_variant`
                    if (opposite) {
                        phaseInfo = `_target_reference`
                    }

                    anno.linkSnpindels.push(variant.name + '_' + variant.reference + '->' + variant.alternate + phaseInfo);
                    if (neighbors.length > 0) {
                        for (let sid of neighbors) {
                            phaseInfo = `_target_reference`
                            if ((sid.phase == 1 && selectedTrack.targetPhase == 1) || (sid.phase == 0 && selectedTrack.targetPhase == -1)) {
                                phaseInfo = `_target_variant`
                            }
                            anno.linkSnpindels.push(sid.name + '_' + sid.reference + '->' + sid.alternate + phaseInfo);
                        }
                    }

                    selectedTrack.addOligo(anno)

                } else {

                    let oindices = [];
                    let oidx = existingOligos.indexOf(sequence);
                    while (oidx != -1) {

                        oindices.push(oidx);
                        oidx = existingOligos.indexOf(sequence, oidx + 1);
                    }
                    for (let oidx of oindices) {
                        selectedTrack.oligos[oidx].linkSnpindels.push(variant.name + '_' + variant.reference + '->' + variant.alternate);
                        if (neighbors.length > 0) {
                            for (let sid of neighbors) {
                                selectedTrack.oligos[oidx].linkSnpindels.push(sid.name + '_' + sid.reference + '->' + sid.alternate);
                            }
                        }
                    }
                }
            }
        }
        resolve();
    })
}
