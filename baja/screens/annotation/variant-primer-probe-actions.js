function (graph, all, seqout, illumina) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let highlight = false;
    let highlight_label = 'Highlight'
    let selectedTrack = null;
    let resizeTrack = false;

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrackAllowUnderneath(x, y);

        if (trackIndex >= 0) {
            let cselectedTrack = graph.track[trackIndex]
            if (cselectedTrack && selectedTrack != cselectedTrack) {
                if (selectedTrack)
                    selectedTrack.showResizeBar = false;
            }
            selectedTrack = cselectedTrack;
            if (selectedTrack)
                selectedTrack.showResizeBar = true;
        } else {
            graph.selectOff();
            selectedTrack = null;
        }
    })

    graph.addMouseDownListener((x, y) => {
        let trackIndex = graph.getTrackAllowUnderneath(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        if (highlight && selectedTrack) {
            if (start < 0) {
                let xsc = graph.X(x);
                selectedTrack.tgraph.rescale();
                console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                let t = selectedTrack.tgraph.xi;
                start = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markstart = start;
            }
            else if (start > 0 && end < 0) {
                let t = selectedTrack.tgraph.xi;
                end = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markend = end;
            }
            highlight_label = 'Clear highlight'

        } else {
            highlight_label = 'Highlight'
        }

        let menuList = [];

        if (selectedTrack && !seqout && !all) {
            if ( selectedTrack.targetPhase && !illumina ) {
                menuList.push(
                    {
                        label: 'Primer-probe haplotype variant',
                        click: async(x) => {

                            let phaseselect = -1;
                            if ( selectedTrack.targetPhase > 0 ) {
                                phaseselect = 1;
                            }

                            let xwc = selectedTrack.tgraph.Xwc(x);
                            let range = 500;

                            let variant = await selectedTrack.fetchSnpindel(xwc, phaseselect, range);
                            console.log('debubg');

                            if ( variant != null ) {
                                await exec('baja/screens/annotation/variant-primer-probe.js', variant, selectedTrack, graph, false, true, null)
                            } else {
                                graph.setMessage('Click closer to variant')
                            }
                        },
                        move: () => {
                        },
                    },
                );
            } else if (selectedTrack.targetPhase && illumina ) {
                menuList.push(
                    {
                        label: 'Illumina design variant',
                        click: async(x) => {

                            let phaseselect = 0;

                            let xwc = selectedTrack.tgraph.Xwc(x);
                            let range = 500;
                            let variant = await selectedTrack.fetchSnpindel(xwc, phaseselect, range);
                            console.log('debubg');

                            if ( variant != null ) {
                                await exec('baja/screens/annotation/variant-primer-probe.js', variant, selectedTrack, graph, false, null, true)
                            } else {
                                graph.setMessage('Click closer to variant')
                            }
                        },
                        move: () => {
                        },
                    },
                );
            }
            if (!illumina) {
                menuList.push(
                    {
                        label: 'Primer-probe top variant',
                        click: async(x) => {

                            let phaseselect = 1;

                            let xwc = selectedTrack.tgraph.Xwc(x);
                            let range = 500;
                            let variant = await selectedTrack.fetchSnpindel(xwc, phaseselect, range);

                            if ( variant != null ) {
                                await exec('baja/screens/annotation/variant-primer-probe.js', variant, selectedTrack, graph, true, true)
                            } else {
                                graph.setMessage('Click closer to variant')
                            }
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Primer-probe bottom variant',
                        click: async(x,y) => {

                            let phaseselect = -1;

                            let xwc = selectedTrack.tgraph.Xwc(x);
                            let range = 500;
                            let variant = await selectedTrack.fetchSnpindel(xwc, phaseselect, range);

                            if ( variant != null ) {
                                await exec('baja/screens/annotation/variant-primer-probe.js', variant, selectedTrack, graph, true, true)
                            } else {
                                graph.setMessage('Click closer to variant')
                            }
                        },
                        move: () => {
                        },
                    },
                );
            }

        } else if ( selectedTrack && !seqout && all ) {
            menuList.push(
                {
                    label: 'Primer-probe phased sequence',
                    click: async(x,y) => {
                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        graph.selectOff();
                        if ( selectedTrack.targetPhase != null ) {

                            let variants = [];
                            let variantso = [];
                            let phaseselect = 0;

                            if ( selectedTrack.targetPhase > 0 ) {
                                phaseselect = 1;
                            }

                            [ variants, variantso ] = await selectedTrack.phasesnpindels( phaseselect );

                            for ( let v of variants ) {
                                if ( v.xi > selectedTrack.xi && v.xf < selectedTrack.xf ) {
                                    await exec('baja/screens/annotation/variant-primer-probe.js', v, selectedTrack, graph, false, true);
                                }
                            }
                            for ( let v of variantso ) {
                                if ( v.xi > selectedTrack.xi && v.xf < selectedTrack.xf ) {
                                    await exec('baja/screens/annotation/variant-primer-probe.js', v, selectedTrack, graph, true, true);
                                }
                            }
                        } else {
                            graph.setMessage('Input phased vcf.')
                        }
                    },
                    move: () => {
                    },
                },
            );
        } else if ( selectedTrack && seqout ) {
            menuList.push(
                {
                    label: 'Derive phased sequences',
                    click: async(x,y) => {

                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        graph.selectOff();
                        if ( selectedTrack.targetPhase != null ) {

                            let variants = [];
                            let variantso = [];
                            let phaseselect = 0;

                            if ( selectedTrack.targetPhase > 0 ) {
                                 phaseselect = 1;
                            }

                            [ variants, variantso ] = await selectedTrack.phasesnpindels( phaseselect );

                            let displayText = '';
                            for (let i = 0; i < 2; i++) {

                                let vs = [variants,variantso][i];

                                let splicedtrack = selectedTrack.sequence;
                                let splicedindices = Array(selectedTrack.sequence.length).fill(selectedTrack.xi).map((x_,y_) => x_ + y_ );

                                if ( vs.length > 0 ) {
                                    for (let sid of vs) {
                                        splicedtrack = splicedtrack.slice(0,splicedindices.indexOf(sid.xi))
                                                        + sid.alternate0
                                                        +splicedtrack.slice(splicedindices.indexOf(sid.xf));
                                        splicedindices = splicedindices.slice(0,splicedindices.indexOf(sid.xi)).concat(
                                                        Array(sid.alternate0.length).fill(sid.xi),
                                                        splicedindices.slice(splicedindices.indexOf(sid.xf))
                                        );
                                    }
                                }
                                let markerName = null;
                                if ( i == 0) {
                                    markerName = `pathogenic`
                                } else {
                                    markerName = `nonpathogenic`
                                }

                                if ( selectedTrack.strand > 0 ) {
                                    let variantFasta = '>'+selectedTrack.name+'_phase_'+markerName+'\n'+splicedtrack+'\n';
                                    displayText += variantFasta
                                } else {
                                    splicedtrack = await splicedtrack.split("").reverse().join("");
                                    let variantFasta = '>'+selectedTrack.name+'_phase_'+markerName+'\n'+splicedtrack+'\n';
                                    displayText += variantFasta;
                                }
                            }

                            showModal ( {
                                    wid:'json',
                                    data: displayText
                                    } );

                        } else {
                            graph.setMessage( 'Input phased vcf.')
                        }
                    },
                    move: () => {
                    },
                },
                {
                    label: 'Derived sequence around variant',
                    click: async(x, y) => {

                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        graph.selectOff();
                        if ( selectedTrack.targetPhase != null ) {

                            let variants = [];
                            let variantso = [];
                            let phaseselect = 0;

                            if ( selectedTrack.targetPhase > 0 ) {
                                    phaseselect = 1;
                            }

                            let searchrange = 300;
                            let xwc = selectedTrack.tgraph.Xwc(x);
                            console.log('debubg');
                            let variant = await selectedTrack.fetchSnpindel(xwc, null, searchrange);
                            console.log(variant);

                            if ( variant != null ) {
                                let searchstart = Math.max(variant.xi - searchrange/2, selectedTrack.xi);
                                let searchend = Math.min(variant.xf + searchrange/2, selectedTrack.xf);
                                let trackseq = selectedTrack.getSequenceRange(searchstart, searchend);

                                let splicedtrack = trackseq;
                                let splicedindices = Array(trackseq.length).fill(searchstart).map((x_,y_) => x_ + y_ );

                                let neighbors = await selectedTrack.neighborSnpindel(variant, searchrange, 1);

                                if ( neighbors.length > 0 ) {
                                    for (let sid of neighbors) {
                                        splicedtrack = splicedtrack.slice(0,splicedindices.indexOf(sid.xi))
                                                        + sid.alternate0
                                                        +splicedtrack.slice(splicedindices.indexOf(sid.xf)
                                        );
                                        splicedindices = splicedindices.slice(0,splicedindices.indexOf(sid.xi)).concat(
                                                        Array(sid.alternate0.length).fill(sid.xi),
                                                        splicedindices.slice(splicedindices.indexOf(sid.xf))
                                        );
                                    }
                                }

                                splicedtrack = splicedtrack.slice(0,splicedindices.indexOf(variant.xi))
                                                + '\['+variant.alternate0 + '/' + variant.reference0 + '\]'
                                                +splicedtrack.slice(splicedindices.indexOf(variant.xf)
                                );

                                console.log(splicedtrack)
                                let displayText = '';

                                if ( selectedTrack.strand > 0 ) {
                                    let variantFasta = '>'+
                                                        selectedTrack.name+
                                                        '_phase_'+
                                                        phaseselect+
                                                        '_variant:'+
                                                        variant.type+
                                                        variant.xi+
                                                        variant.reference0+
                                                        '=>'+
                                                        variant.alternate0+
                                                        '_region:'+
                                                        searchstart+
                                                        ':'+
                                                        searchend+
                                                        '\n'+
                                                        splicedtrack;
                                    console.log(variantFasta);
                                    displayText += variantFasta;
                                } else {
                                    splicedtrack = splicedtrack.split("").reverse().join("");
                                    let indexFirstBracket = splicedtrack.indexOf('\]');
                                    let indexSecondBracket = splicedtrack.indexOf('\[');
                                    splicedtrack = splicedtrack.substring(0,indexFirstBracket) + '\[' + splicedtrack.substring(indexFirstBracket+1);
                                    splicedtrack = splicedtrack.substring(0,indexSecondBracket) + '\]' + splicedtrack.substring(indexSecondBracket+1);

                                    let variantFasta = '>'+
                                                        selectedTrack.name+
                                                        '_phase_'+
                                                        phaseselect+
                                                        '_variant:'+
                                                        variant.type+
                                                        variant.xi+
                                                        variant.reference0+
                                                        '=>'+
                                                        variant.alternate0+
                                                        '_region:'+
                                                        searchend+
                                                        ':'+
                                                        searchstart+
                                                        '\n'+
                                                        splicedtrack;
                                    console.log(variantFasta);
                                    displayText += variantFasta;
                                }
                                showModal ( {
                                    wid:'json',
                                    data: displayText
                                    } );
                            } else {
                                graph.setMessage( 'Click closer to variant' )
                            }
                        } else{
                            graph.setMessage( 'Input phased vcf.')
                        }
                    },
                    move: () => {
                    },
                },
            );
        }
        graph.showMenu(menuList, x, y);
    });
}
