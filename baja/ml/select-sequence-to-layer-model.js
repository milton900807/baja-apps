function (graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        let Annotation = await exec('flexigraph/annotation.js')

        let ml = () => {

            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.selectOff();
            graph.addMouseMoveListener((x, y) => {
                if (graph.menuVisible()) {
                    return;
                }
                for (let t of graph.track) {
                    t.deselect();
                }
                let si = graph.getTrack(x, y);
                let selectedTrack = graph.track[si]
                if (selectedTrack) {
                    selectedTrack.select();
                }

            })
            graph.addMouseDownListener(async (x, y) => {
                let si = graph.getTrack(x, y);
                let selectedTrack = graph.track[si]
                if (selectedTrack) {
                    selectedTrack.select();
                } else {
                    return;
                }
                graph.showMenu([
                    {
                        'label': 'Select prediction layer', click: async () => {

                        }
                    },
                    {
                        'label': 'Complement sequence', click: async () => {
                        }
                    },

                ], x, y)

            }

            )
        }
        resolve({})

    })

}
