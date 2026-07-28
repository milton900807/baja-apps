function (graph, genegraph_panel_layout) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'width': 600,
            'grid': {
                xmin: 0,
                xmax: 6,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: 'Deprecate', ionFunction: createIonFunction(async () => {

                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove deprecated  oligos.  Continue?', async () => {
                            let index = 1;
                            let deleteO = []
                            for (let t of graph.track) {
                                for (let o of t.oligos) {
                                    if (o.type.startsWith ('deprecated_') )
                                    {
                                        deleteO.push ( [t,o] );
                                    }
                                }
                            }

                        })

                        showModal(confirm)
                        graph.setMessage('Click on a compound')
                        graph.clearMouseListeners();
                        graph.setMouseMode ( 'navigate')
                    })
                },
                {
                    x: 1, y: 0, label: 'All', ionFunction: createIonFunction(async () => {
                        graph.pushOntoHistory()
                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove deprecated  oligos.  Continue?', async () => {
                            for (let t of graph.track) {
                                t.oligos = [];
                            }
                        })
                        showModal(confirm)
                        graph.clearMouseListeners();
                        graph.setMouseMode ( 'navigate')                    })
                },

            ]
        }

    }
     return button_canvas;

}
