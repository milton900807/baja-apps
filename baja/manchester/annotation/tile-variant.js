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

            // WHERE THE REFERENCE ALLELE ACTUALLY SITS, rather than where the variant is drawn.
            //
            // A VCF quotes the base BEFORE a deleted run, so ATAT>A at 72,015,985 removes the
            // TAT that follows the anchoring A. The editor deliberately draws that variant one
            // base later, over the first base actually removed (snpindel's del placement adds
            // +1 on a plus-strand track), and it does NOT shift an insertion, or a deletion on
            // a minus-strand track. Splicing at the drawn position therefore kept the anchor,
            // wrote the alternate -- a second copy of that same anchor base -- and resumed one
            // base too far, so the designed target read ...TTTGA·A·ATTTTC where the real
            // deleted allele reads ...TTTG·A·TATTTTC. Every oligo tiled over it then matched
            // NEITHER allele: one base wrong against the mutant it was aimed at, and one base
            // wrong against the wild type it was meant to spare.
            //
            // Rather than keep a table of which cases are shifted, the reference allele is
            // looked for in the sequence: it sits either at the drawn position or one base
            // before it, and the sequence says which. Then the splice is the plain VCF one --
            // replace the whole reference span with the alternate.
            // One variant written into a sequence, with its index map kept alongside. Used for
            // the variant being designed against and for every neighbour written in after it,
            // so a neighbouring indel cannot go in by one rule and the primary by another.
            const spliceVariant = (seq, idx, v, altRaw) => {
                const ref = ('' + ((v && (v.reference0 || v.reference)) || '')).toUpperCase();
                const alt = ('' + (altRaw != null ? altRaw : ((v && (v.alternate0 || v.alternate)) || ''))).toUpperCase();
                let at = idx.indexOf(v.xi);
                if (at < 0) return { seq: seq, idx: idx };
                // Where the reference allele ACTUALLY sits: at the drawn position, or one base
                // before it. The sequence decides, so no table of conventions is needed.
                if (ref.length >= 2) {
                    const reads = (i) => seq.slice(i, i + ref.length).toUpperCase();
                    if (reads(at) !== ref && at > 0 && reads(at - 1) === ref) at -= 1;
                }
                const end = ref.length ? (at + ref.length) : idx.indexOf(v.xf);
                if (!(end >= at)) return { seq: seq, idx: idx };
                return {
                    seq: seq.slice(0, at) + alt + seq.slice(end),
                    idx: idx.slice(0, at).concat(
                        Array(alt.length).fill(idx[at] != null ? idx[at] : v.xi),
                        idx.slice(end)),
                };
            };
            const spliceWith = (alt) => spliceVariant(trackseq, indices, variant, alt);

            let splicedtrack = null;
            let splicedindices = null;
            if (!opposite) {
                if (!variant.alternate0) {
                    { const r = spliceWith(('' + variant.alternate).toUpperCase()); splicedtrack = r.seq; splicedindices = r.idx; }

                } else {
                    { const r = spliceWith(('' + variant.alternate0).toUpperCase()); splicedtrack = r.seq; splicedindices = r.idx; }
                }
            } else {
                // "All mutations at this location" must still reflect the PRIMARY mutation --
                // it is the variant being designed against. This branch used to copy the plain
                // reference (only neighbours were written below), so with a single mutation the
                // target came out as the reference and the ASO did not reflect the change. Write
                // the primary alternate here, exactly as the "this phase only" branch does; the
                // neighbour loop then writes the other-phase mutations on top.
                if (!variant.alternate0) {
                    { const r = spliceWith(('' + variant.alternate).toUpperCase()); splicedtrack = r.seq; splicedindices = r.idx; }
                } else {
                    { const r = spliceWith(('' + variant.alternate0).toUpperCase()); splicedtrack = r.seq; splicedindices = r.idx; }
                }
            }

            if (neighbors.length > 0) {
                for (let sid of neighbors) {
                    // THE NEIGHBOUR, onto what is already there. One branch here used to
                    // re-splice the PRIMARY variant instead -- ignoring `sid` entirely and
                    // throwing away every neighbour written before it -- so a window with two
                    // neighbours ended up carrying neither.
                    if (!sid) continue;
                    const r = spliceVariant(splicedtrack, splicedindices, sid,
                        (sid.alternate0 || sid.alternate || ''));
                    splicedtrack = r.seq; splicedindices = r.idx;
                }
            }

            let existingOligos = [];
            for (let o of selectedTrack.oligos) {
                existingOligos.push(o.sequence);
            }

            // ---- ONLY COMPOUNDS THAT CAN TELL THE TWO ALLELES APART ------------------------
            //
            // Tiling a window around a variant produces one register per base, and the ones at
            // the ends of the walk do not reach the change at all -- or, for a deletion, reach
            // only the anchoring base the two alleles share. Their target is a sequence the
            // WILD-TYPE copy also presents, so they hybridise to both copies equally and
            // knock down the allele the design is meant to spare. They are not weak
            // discriminators; they are not discriminators.
            //
            // The test is the honest one: if the register's target occurs in the untouched
            // window, that duplex exists on the other copy too. Nothing is scored or guessed.
            // (On a DHODH ATAT>A walk this drops four of nineteen: three that stop just past
            // the anchoring A without reaching a deleted base, and one lying wholly 3' of the
            // junction.)
            const wildType = ('' + trackseq).toUpperCase();
            let notSelective = 0;
            const selectiveAgainstWildType = (sequence) => wildType.indexOf(('' + sequence).toUpperCase()) < 0;

            for (let i = 1; i < splicedtrack.length - base_count; i++) {

                let sequence = splicedtrack.slice(i, i + base_count)

                // The register reads the same on both copies: making it would be making an
                // oligo against the allele that has to survive.
                if (!selectiveAgainstWildType(sequence)) { notSelective++; continue; }

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
                    // Draw the compound's OWN (mutant) target sequence above its body when zoomed
                    // out, the same way the other allele-selective designer does. anno.sequence is
                    // the spliced target that already carries the alternate allele, so the shown
                    // target reflects the mutation rather than the reference read off the track.
                    try { anno.showTargetSequence = true; } catch (e) { }
                    let ytmp = 0.15;

                    for (let _o of selectedTrack.oligos) {
                        if ((_o.xi >= anno.xi && _o.xi <= anno.xf) || (anno.xi >= _o.xi && anno.xi <= _o.xf)) {
                            if (_o.y <= ytmp) {
                                ytmp += 0.02;
                            }
                        }
                    }

                    anno.y = ytmp;

                    // The primary variant's alternate is now written into the target in BOTH
                    // modes, so it is always the target variant here (it used to be labelled
                    // reference in the opposite mode, back when this branch left it unmutated).
                    let phaseInfo = `_target_variant`

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

            // SAID, RATHER THAN SILENTLY FEWER. A walk that returns 15 oligos where the window
            // has 19 registers has made a decision, and which registers it dropped is the
            // difference between a selective panel and one that also hits the wild type.
            try {
                if (notSelective) {
                    const made = Math.max(0, (splicedtrack.length - base_count - 1) - notSelective);
                    const msg = made
                        ? (notSelective + ' register' + (notSelective === 1 ? ' was' : 's were')
                            + ' not made: their target reads the same on both copies, so they cannot tell the alleles apart.')
                        : ('No register in this window can tell the alleles apart \u2014 every one of the '
                            + notSelective + ' reads the same on both copies. A change this small may need a '
                            + 'shorter oligo, or discrimination from a neighbouring variant on the same copy.');
                    if (made ? graph.setResultMessage : graph.setError) {
                        (made ? graph.setResultMessage : graph.setError).call(graph, ' ' + msg + ' ');
                    } else if (graph.setMessage) graph.setMessage(' ' + msg + ' ');
                }
            } catch (e) { }
        }
        resolve();
    })
}
