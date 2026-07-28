function (graph, all) {

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
        let trackIndex = graph.getTrack(x, y);

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
        let trackIndex = graph.getTrack(x, y);
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

        if ( selectedTrack && !all ) {
            menuList.push(
                {
                    label: 'Tile phase 0',
                    click: async(x, y) => {
                        if ( y > 0 ) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }

                        let xwc = selectedTrack.tgraph.Xwc(x);
                        let range = 500;

                        let variant = await selectedTrack.fetchSnpindel(xwc, -1, range);
                        if ( variant != null ) {
                            await exec('baja/screens/annotation/tile-variant.js', variant, selectedTrack, graph, false)
                        } else {
                            graph.setMessage('Click closer to variant...');
                        }
                    },
                    move: () => {
                    },
                },
                {
                    label: 'Tile phase opposite (1)',
                    click: async(x,y) => {
                        if ( y > 0 ) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }

                        let xwc = selectedTrack.tgraph.Xwc(x);
                        let range = 500;
                        let variant = await selectedTrack.fetchSnpindel(xwc, 1, range);

                        console.log('debubg');
                        if ( variant != null ) {
                        await exec('baja/screens/annotation/tile-variant.js', variant, selectedTrack, graph, true)
                        } else {
                            graph.setMessage('Click closer to variant');
                        }
                    },
                    move: () => {
                    },
                },
            );
        } else if ( selectedTrack && all ) {
            menuList.push(
                {
                    label: 'Tile all variants selected phase',
                    click: async(x,y) => {
                        console.log('debubg');

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
                                    console.log(v,selectedTrack,graph)
                                    await exec('baja/screens/annotation/tile-variant.js', v, selectedTrack, graph, false, true );
                                }
                            }
                            for ( let v of variantso ) {
                                if ( v.xi > selectedTrack.xi && v.xf < selectedTrack.xf ) {
                                    console.log(v,selectedTrack,graph)
                                    await exec('baja/screens/annotation/tile-variant.js', v, selectedTrack, graph, true, true);
                                }
                            }
                        } else {
                            graph.setMessage('Select Target Phase.')
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
