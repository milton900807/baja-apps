function (variant, selectedTrack, graph, opposite, probedesign, illumina) {

    function splice_in_neighbors(variant, trackseq, indices, neighbors, opposite) {

        let splicedtrack = null;
        let splicedindices = null;

        if ( !opposite ) {
            splicedtrack = trackseq.slice(0,indices.indexOf(variant.xi))
                                + variant.alternate0
                                + trackseq.slice(indices.indexOf(variant.xf));
            splicedindices = indices.slice(0,indices.indexOf(variant.xi)).concat(
                                Array(variant.alternate0.length).fill(variant.xi),
                                indices.slice(indices.indexOf(variant.xf))
            );

        } else {
            splicedtrack = trackseq;
            splicedindices = indices;
        }

        if ( neighbors.length > 0 ) {
            for (let sid of neighbors) {
                splicedtrack = splicedtrack.slice(0,splicedindices.indexOf(sid.xi))
                                + sid.alternate0
                                +splicedtrack.slice(splicedindices.indexOf(sid.xf));
                splicedindices = splicedindices.slice(0,splicedindices.indexOf(sid.xi)).concat(
                                Array(sid.alternate0.length).fill(sid.xi),
                                splicedindices.slice(splicedindices.indexOf(sid.xf))
                );
            }
        }
        return [ splicedtrack , splicedindices ];
    }

    function walk(_track, _splice, _xts, _xtf, _xss, _xsf, dir) {
        let bases = 15

        let walk = Array.from(Array(_xtf + 1 -_xts).keys()).slice(0,20);

        if ( dir < 0 ) {
            for ( let w of walk ) {
                _tracktest = _track.slice( _xts  - w , _xtf + bases - w);
                _splicetest =  _splice.slice( _xss  - w, _xsf + bases - w );

                if ( !_track.includes( _splicetest )  && _tracktest.slice(0,5) != _splicetest.slice(0,5)) {

                    console.log('Good '+ (~~_xss - ~~w) +' '+_tracktest+' '+_splicetest)
                    return ~~_xss - ~~w;
                } else {
                    console.log('Bad '+_tracktest+' '+_splicetest)
                }
            }
            return null;

        } else if ( dir > 0 ) {
            for ( let w of walk ) {
                _tracktest = _track.slice( _xts - bases + w, _xtf + w );
                _splicetest = _splice.slice( _xss - bases + w, _xsf + w );

                if ( !_track.includes( _splicetest )  && _tracktest.slice(-5,) != _splicetest.slice(-5,)) {

                    console.log('Good '+ (~~_xsf + ~~w - 1) +' '+_tracktest+' '+_splicetest)
                    return ~~_xsf + ~~w - 1;
                } else {
                    console.log('Bad '+_tracktest+' '+_splicetest)
                }
            }
            return null;
        }
    }

    return new Promise( async(resolve, reject) => {

        console.log( variant );

        let createprimers = true;
        var neighbors = null;
        var searchrange = 400;

        console.log(opposite)
        if ( opposite ) {
            neighbors = await selectedTrack.neighborSnpindel(variant, searchrange, 0);
            for (let sid of neighbors) {
                if (sid.xi == variant.xi) {
                    graph.setMessage('Variant detected in opposite phase. Create primers for that variant.');
                    createprimers = false;
                    break;
                }
            }
        } else {
            neighbors = await selectedTrack.neighborSnpindel(variant, searchrange, 1)
        }

        if ( createprimers && !probedesign && !illumina) {
            let ht = ''
            let trackseq = null;
            let indices = null;
            let searchstart = null;
            let searchend = null;
            let upstream = 40;
            let anchorcoord = null;

            let xss = null;
            let xsf = null;
            let xts = null;
            let xtf = null;

            searchstart = Math.max(variant.xi - searchrange, selectedTrack.xi);
            searchend = Math.min(variant.xf + upstream, selectedTrack.xf);
            trackseq = selectedTrack.getSequenceRange(searchstart, searchend);
            indices = Array(trackseq.length).fill(searchstart).map((x,y) => x + y );
            [splicedtrack , splicedindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, opposite);
            [splicedwotrack, splicedwoindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, !opposite)

            if ( variant.type == 'ins' ) {
                anchorcoord = splicedindices.indexOf(variant.xi) + 1;
                testcoord = splicedwoindices.indexOf(variant.xi) + 1;
                xts = testcoord;
                xtf = testcoord + variant.alternate0.length;
                xss = anchorcoord;
                xsf = anchorcoord + variant.alternate0.length;
                anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, -1 )
            } else if ( variant.type == 'del' ) {
                anchorcoord = splicedindices.indexOf(variant.xi) ;
                testcoord = splicedwoindices.indexOf(variant.xi);
                xts = testcoord ;
                xtf = testcoord + ( variant.xf - variant.xi );
                xss = anchorcoord ;
                xsf = anchorcoord + (variant.xf - variant.xi );
                anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, -1 )
            } else if ( variant.type == 'snp' )  {
                anchorcoord = splicedindices.indexOf(variant.xi) ;
            }

            if ( anchorcoord ) {
                let rightkeys = {};
                for ( let i = 0; i < splicedindices.length; i++ ) {
                    rightkeys[i] = splicedindices[i]
                }

                if ( selectedTrack.strand < 0 ) {
                    splicedtrack =  splicedtrack.split("").reverse().join("");
                    anchorcoord = splicedtrack.length - anchorcoord - 1;
                    js = {
                        id:selectedTrack.id,
                        seq:splicedtrack,
                        right:anchorcoord
                    }
                } else {
                    js = {
                        id:selectedTrack.id,
                        seq:splicedtrack,
                        left:anchorcoord
                    }
                }

                POSTJSON ( js, ht)
                .then  ( res => {
                    showModal ( {
                    wid:'json',
                    data:JSON.stringify ( res )
                    })
                    exec( 'baja/manchester/annotation/apply-variant-amplicon.js', res, selectedTrack, rightkeys, 'right').then(primer_probe => {
                        selectedTrack.addOligo(primer_probe);
                    });
                })
            } else {
                console.log("Unable to find right primer with unique 3' end")
            }

            searchend = Math.min(variant.xf + searchrange, selectedTrack.xf);
            searchstart = Math.max(variant.xi - upstream, selectedTrack.xi);
            trackseq = selectedTrack.getSequenceRange(searchstart, searchend);
            indices = Array(trackseq.length).fill(searchstart).map((x,y) => x + y );
            [splicedtrack , splicedindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, opposite);
            [splicedwotrack, splicedwoindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, !opposite)

            if ( variant.type == 'ins') {
                anchorcoord = splicedindices.indexOf( variant.xf) ;
                testcoord = splicedwoindices.indexOf( variant.xf) ;
                xts = testcoord - variant.alternate0.length;
                xtf = testcoord;
                xss = anchorcoord - variant.alternate0.length;
                xsf = anchorcoord;
                anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, 1 )
            } else if ( variant.type == 'del') {
                anchorcoord = splicedindices.indexOf(variant.xi) + 1;
                testcoord = splicedwoindices.indexOf( variant.xi ) + 1;
                xts = testcoord - ( variant.xf - variant.xi );
                xtf = testcoord;
                xss = anchorcoord - ( variant.xf - variant.xi );
                xsf = anchorcoord;
                anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, 1 )
            } else if ( variant.type == 'snp' ) {
                anchorcoord = splicedindices.indexOf(variant.xi );
            }

            if ( anchorcoord ) {
                let leftkeys = {};
                for ( let i = 0; i < splicedindices.length; i++ ) {
                    leftkeys[i] = splicedindices[i]
                }

                let js = null;
                if ( selectedTrack.strand < 0 ) {
                    splicedtrack =  splicedtrack.split("").reverse().join("");
                    anchorcoord = splicedtrack.length - anchorcoord - 1;
                    js = {
                        id:selectedTrack.id,
                        seq:splicedtrack,
                        left:anchorcoord,
                    }
                } else {
                    js = {
                        id:selectedTrack.id,
                        seq:splicedtrack,
                        right:anchorcoord,
                    }
                }

                POSTJSON ( js, ht)
                .then  ( res => {
                        showModal ( {
                        wid:'json',
                        data:JSON.stringify ( res )
                        })
                        exec( 'baja/manchester/annotation/apply-variant-amplicon.js', res, selectedTrack, leftkeys, 'left').then(primer_probe => {
                            selectedTrack.addOligo(primer_probe);
                        });
                    })
            } else {
                console.log("Unable to find left primer with unique 3' end")
            }

            searchstart = Math.max(variant.xi - searchrange/2, selectedTrack.xi);
            searchend = Math.min(variant.xf + searchrange/2, selectedTrack.xf);
            trackseq = selectedTrack.getSequenceRange(searchstart, searchend);
            indices = Array(trackseq.length).fill(searchstart).map((x,y) => x + y );
            [splicedtrack , splicedindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, opposite);
            [splicedwotrack, splicedwoindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, !opposite)

            if (variant.type == 'ins' ) {
                anchorcoord = splicedindices.indexOf( variant.xi ) + 1;
                testcoord = splicedwoindices.indexOf(variant.xi) + 1;
                xts = testcoord;
                xtf = testcoord + variant.alternate0.length;
                xss = anchorcoord;
                xsf = anchorcoord + variant.alternate0.length;
                anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, -1 )
            } else if ( variant.type == 'del' ) {
                anchorcoord = splicedindices.indexOf( variant.xi );
                testcoord = splicedwoindices.indexOf(variant.xi);
                xts = testcoord;
                xtf = testcoord + ( variant.xf - variant.xi );
                xss = anchorcoord;
                xsf = anchorcoord + (variant.xf - variant.xi );
                anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, -1 )
            } else if ( variant.type == 'snp' ) {
                anchorcoord = splicedindices.indexOf( variant.xi );
            }

            if ( anchorcoord ) {
                let midkeys = {};
                for ( let i = 0; i < splicedindices.length; i++ ) {
                    midkeys[i] = splicedindices[i]
                }

                if ( selectedTrack.strand < 0 ) {
                    splicedtrack =  splicedtrack.split("").reverse().join("");
                    anchorcoord = splicedtrack.length - anchorcoord;
                }

                POSTJSON ( {
                    id:selectedTrack.id,
                    seq:splicedtrack,
                    mid:anchorcoord,
                    }, ht).then  ( res => {
                        showModal ( {
                        wid:'json',
                        data:JSON.stringify ( res )
                        })
                        exec( 'baja/manchester/annotation/apply-variant-amplicon.js', res, selectedTrack, midkeys, 'mid').then(primer_probe => {
                            selectedTrack.addOligo(primer_probe);
                        });
                    })
            } else {
                console.log("Unable to find mid primer with unique 5' end")
            }
        } else if ( probedesign && createprimers && !illumina ) {
            let ht = '/'
            let trackseq = null;
            let indices = null;
            let searchstart = null;
            let searchend = null;
            let anchorcoord = null;
            let splicedtrack = null;
            let splicedindices = null;
            let splicedwotrack = null;
            let splicedwoindices = null;
            let testcoord = null;

            let xss = null;
            let xsf = null;
            let xts = null;
            let xtf = null;

            if (selectedTrack.strand > 0) {

                searchstart = Math.max(variant.xi - searchrange/2, selectedTrack.xi);
                searchend = Math.min(variant.xf + searchrange/2, selectedTrack.xf);
                trackseq = selectedTrack.getSequenceRange(searchstart, searchend);
                indices = Array(trackseq.length).fill(searchstart).map((x,y) => x + y );
                [splicedtrack , splicedindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, opposite);
                [splicedwotrack, splicedwoindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, !opposite)

                if (variant.type == 'ins' ) {
                    anchorcoord = splicedindices.indexOf( variant.xi ) + 1;
                    testcoord = splicedwoindices.indexOf(variant.xi) + 1;
                    xts = testcoord;
                    xtf = testcoord + variant.alternate0.length;
                    xss = anchorcoord;
                    xsf = anchorcoord + variant.alternate0.length;
                    anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, -1 )
                } else if ( variant.type == 'del' ) {
                    anchorcoord = splicedindices.indexOf( variant.xi );
                    testcoord = splicedwoindices.indexOf(variant.xi);
                    xts = testcoord;
                    xtf = testcoord + ( variant.xf - variant.xi );
                    xss = anchorcoord;
                    xsf = anchorcoord + (variant.xf - variant.xi );
                    anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, -1 )
                } else if ( variant.type == 'snp' ) {
                    anchorcoord = splicedindices.indexOf( variant.xi );
                }
            } else {
                searchstart = Math.max(variant.xi - searchrange/2, selectedTrack.xi);
                searchend = Math.min(variant.xf + searchrange/2, selectedTrack.xf);
                trackseq = selectedTrack.getSequenceRange(searchstart, searchend);
                indices = Array(trackseq.length).fill(searchstart).map((x,y) => x + y );
                [splicedtrack , splicedindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, opposite);
                [splicedwotrack, splicedwoindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, !opposite)

                if ( variant.type == 'ins') {
                    anchorcoord = splicedindices.indexOf( variant.xf) ;
                    testcoord = splicedwoindices.indexOf( variant.xf) ;
                    xts = testcoord - variant.alternate0.length;
                    xtf = testcoord;
                    xss = anchorcoord - variant.alternate0.length;
                    xsf = anchorcoord;
                    anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, 1 )
                } else if ( variant.type == 'del') {
                    anchorcoord = splicedindices.indexOf(variant.xi) + 1;
                    testcoord = splicedwoindices.indexOf( variant.xi ) + 1;
                    xts = testcoord - ( variant.xf - variant.xi );
                    xtf = testcoord;
                    xss = anchorcoord - ( variant.xf - variant.xi );
                    xsf = anchorcoord;
                    anchorcoord = walk( splicedwotrack, splicedtrack, xts, xtf, xss, xsf, 1 )
                } else if ( variant.type == 'snp' ) {
                    anchorcoord = splicedindices.indexOf(variant.xi );
                }
            }

            if ( anchorcoord ) {

                let midkeys = {};
                for ( let i = 0; i < splicedindices.length; i++ ) {
                    midkeys[i] = splicedindices[i]
                }

                if ( selectedTrack.strand < 0 ) {
                    splicedtrack =  splicedtrack.split("").reverse().join("");
                    anchorcoord = splicedtrack.length - anchorcoord - 1;
                }

                let designJunctions = 1;

                let okRegionList = ``;
                if ( designJunctions ) {

                    let junctions = [];
                    if ( selectedTrack.annotations.length > 1 ) {
                        for ( let anno of selectedTrack.annotations ) {
                            if (( anno.xi > splicedindices[0] && anno.xi < splicedindices[splicedtrack.length - 1] )) {
                                junctions.push(splicedindices.indexOf(anno.xi));
                            } else if ( anno.xf > splicedindices[0] && anno.xf < splicedindices[splicedtrack.length - 1] )  {
                                junctions.push(splicedindices.indexOf(anno.xf));
                            }
                        }
                    }

                    if ( junctions && selectedTrack.strand > 0 ) {
                        for (let j of junctions) {
                            okRegionList += `0,${j},${j+1},${splicedtrack.length - j - 1}`;
                            okRegionList += ` ; `;
                        }

                    } else if ( junctions && selectedTrack.strand < 0) {
                        for (let j of junctions) {

                            let flip = splicedtrack.length
                            okRegionList += `0,${flip - j - 2},${flip - j - 1},${j}`;
                            okRegionList += ` ; `;
                        }
                    }
                }

                if ( !(okRegionList.length > 0) ) {
                    okRegionList += `,,,`;
                }

                console.log(splicedtrack)
                console.log(okRegionList)
                console.log(anchorcoord)

                POSTJSON ( {
                    id:selectedTrack.id,
                    seq:splicedtrack,
                    regionlist:okRegionList,
                    allele:1,
                    justprobe:anchorcoord,
                    }, ht).then  ( res => {

                        exec( 'baja/manchester/annotation/apply-variant-amplicon.js', res, selectedTrack, midkeys, 'mid').then( async (primer_probe) => {
                            let compDesign = '1';
                            if (compDesign) {
                                let Biopolymer = await exec('baja/chem/biopolymer.js');
                                console.log(primer_probe.mid)
                                if ( selectedTrack.strand < 0 ) {
                                    splicedtrack =  splicedtrack.split("").reverse().join("");
                                }
                                let st = splicedtrack.indexOf(primer_probe.mid.sequence);
                                let msequence = splicedwotrack.slice(st,st+primer_probe.mid.sequence.length);
                                let mchemistry_template = `([?]d.p.){${msequence.length - 1}}([?]d){1}`
                                let mid2 = Biopolymer.createFromOS(mchemistry_template, msequence, 'primer', primer_probe.mid.xi, primer_probe.mid.y + 0.025);
                                primer_probe.mid2 = mid2;
                            }
                            selectedTrack.addOligo(primer_probe);
                        });
                    })
            } else {
                console.log("Unable to find mid primer with unique 5' end")
            }
        } else if (createprimers && illumina) {
            let ht = '/'
            let trackseq = null;
            let indices = null;
            let searchstart = null;
            let searchend = null;
            let anchorcoord = null;
            let splicedtrack = null;
            let splicedindices = null;
            let splicedwotrack = null;
            let searchrange = 100;
            let splicedwoindices = null;
            let testcoord = null;

            let xss = null;
            let xsf = null;
            let xts = null;
            let xtf = null;

            searchstart = Math.max(variant.xi - searchrange/2, selectedTrack.xi);
            searchend = Math.min(variant.xf + searchrange/2, selectedTrack.xf);
            trackseq = selectedTrack.getSequenceRange(searchstart, searchend);
            indices = Array(trackseq.length).fill(searchstart).map((x,y) => x + y );
            [splicedtrack , splicedindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, opposite);
            [splicedwotrack, splicedwoindices] = splice_in_neighbors(variant, trackseq, indices, neighbors, !opposite)

            let midkeys = {};
            for ( let i = 0; i < splicedindices.length; i++ ) {
                midkeys[i] = splicedindices[i]
            }

            if ( selectedTrack.strand < 0 ) {
                splicedtrack =  splicedtrack.split("").reverse().join("");
            }

            let designJunctions = 1;

            let okRegionList = ``;
            if ( designJunctions ) {

                let junctions = [];
                if ( selectedTrack.annotations.length > 1 ) {
                    for ( let anno of selectedTrack.annotations ) {
                        if (( anno.xi > splicedindices[0] && anno.xi < splicedindices[splicedtrack.length - 1] )) {
                            junctions.push(splicedindices.indexOf(anno.xi));
                        } else if ( anno.xf > splicedindices[0] && anno.xf < splicedindices[splicedtrack.length - 1] )  {
                            junctions.push(splicedindices.indexOf(anno.xf));
                        }
                    }
                }

                if ( junctions && selectedTrack.strand > 0 ) {
                    for (let j of junctions) {
                        okRegionList += `0,${j},${j+1},${splicedtrack.length - j - 1}`;
                        okRegionList += ` ; `;
                    }

                } else if ( junctions && selectedTrack.strand < 0) {
                    for (let j of junctions) {

                        let flip = splicedtrack.length
                        okRegionList += `0,${flip - j - 2},${flip - j - 1},${j}`;
                        okRegionList += ` ; `;
                    }
                }
            }

            if ( !(okRegionList.length > 0) ) {
                okRegionList += `,,,`;
            }

            console.log(splicedtrack)
            console.log(okRegionList)
            console.log(anchorcoord)
            console.log('debubg');

            POSTJSON ( {
                id:selectedTrack.id,
                illumina:1,
                seq:splicedtrack,
                regionlist:okRegionList,
                }, ht).then  ( res => {
                    exec( 'baja/manchester/annotation/apply-variant-amplicon.js', res, selectedTrack, midkeys, 'mid').then( async (primer_probe) => {
                        selectedTrack.addOligo(primer_probe);
                    });
                });

        }
        resolve();
    });
}
