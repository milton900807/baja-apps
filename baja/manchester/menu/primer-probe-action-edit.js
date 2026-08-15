function (graph, genegraph_panel_layout) {

    exec('baja/math/le-distance.js').then(async le => {
        let Biopolymer = await exec('baja/chem/biopolymer.js')

        let Amplicon = await exec('flexigraph/amplicon.js')
        let Oligo = await exec('flexigraph/oligo.js')
        graph.setMessage(" Click on a track to view operations menu")

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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
        let fmode = 'forward'
        let rmode = 'reverse'
        let pmode = 'forward-complement'

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

            let menuList = [
                {
                    label: 'Remove all primers',
                    click: async (xwc, ywc) => {
                        let temp = async (graph) => {
                            start = -1;
                            end = -1;
                            let trackIndex = graph.getTrack(x, y);
                            let tr = graph.track[trackIndex];
                            tr.removeOligosOfType ( "amplicon")
                        }
                        graph.runfun(temp)

                    },
                    move: () => {
                    }
                },
                {

                    'label': 'Select Primers', 'ionfunction': createIonFunction(async () => {
                        await exec('baja/manchester/select-compounds.js', graph, genegraph_panel_layout)
                    })
                },

            ]

            graph.showMenu(menuList, x, y, 200)
        });

    })

}
