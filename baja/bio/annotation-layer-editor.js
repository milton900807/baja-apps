function ( graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.selectOff();
        let ed;
        let ywc = -1;
        let selectedTrack = null;

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
            let menuList = [];
            if (selectedTrack) {
                menuList.push(
                    {
                        label: 'Paint',
                        click: async (x, y) => {
                            await exec('baja/bio/annotation-layer-editor-painter.js', selectedTrack, graph, genegraph_panel_layout)
                            graph.hideMenu();
                        },
                        move: () => {
                        },
                    },
                    {
                        label: '',
                        click: async (x, y) => {
                            if (y > 0) {
                                console.log('Selected positive variant')
                            } else {
                                console.log('Selected negative variant')
                            }

                            let xwc = selectedTrack.tgraph.Xwc(x);
                            let range = 500;
                            let variant = await selectedTrack.fetchSnpindel(xwc, 1, range);

                            console.log('debubg');
                            if (variant != null) {
                            } else {
                                graph.setMessage('Click closer to variant');
                            }
                        },
                        move: () => {
                        },
                    },
                );
            } else if (selectedTrack && all) {
                menuList.push(
                    {
                        label: 'Tile all variants selected phase',
                        click: async (x, y) => {
                            console.log('debubg');

                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                            graph.selectOff();

                            if (selectedTrack.targetPhase != null) {

                                let variants = [];
                                let variantso = [];
                                let phaseselect = 0;

                                if (selectedTrack.targetPhase > 0) {
                                    phaseselect = 1;
                                }

                                [variants, variantso] = await selectedTrack.phasesnpindels(phaseselect);

                                for (let v of variants) {
                                    if (v.xi > selectedTrack.xi && v.xf < selectedTrack.xf) {
                                        console.log(v, selectedTrack, graph)
                                        await exec('baja/manchester/annotation/tile-variant.js', v, selectedTrack, graph, false, true);
                                    }
                                }
                                for (let v of variantso) {
                                    if (v.xi > selectedTrack.xi && v.xf < selectedTrack.xf) {
                                        console.log(v, selectedTrack, graph)
                                        await exec('baja/manchester/annotation/tile-variant.js', v, selectedTrack, graph, true, true);
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
        resolve();

    })
}
