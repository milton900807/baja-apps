function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners();
    graph.setMouseMode('navigate')

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
                    x: 0, y: 0, label: 'SynthesisSeq', ionFunction: createIonFunction(async () => {
                        exec ( 'baja/manchester/menu/annotation/synthesis-sequence-def.js', graph, genegraph_panel_layout)
                    }), mouseOver: createIonFunction(() => {
                        graph.setMessage('Define synthesis sequences for all compounds using reference target sequence')

                    })
                }
                ,
                {
                    x: 1, y: 0, label: 'Re-number', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Re-id the oligos.')
                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to re-number all the oligos.  Continue?', async () => {
                            let index = 1;
                            for (let t of graph.track) {
                                for (let o of t.oligos) {
                                    o.id = index++
                                }
                            }
                        })
                        showModal(confirm)

                        graph.clearMouseListeners();
                    }), mouseOver: createIonFunction(() => {
                        graph.setMessage('Re-id the oligos.')

                    })
                },
                {
                    x: 2, y: 0, label: 'Filter', ionFunction: createIonFunction(async () => {
                        graph.clearMouseListeners();
                        await exec('baja/manchester/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout)
                    }), mouseOver: createIonFunction(() => {
                        graph.setMessage('Run filter rules on all compounds.')

                    })
                },
                {
                    x: 3, y: 0, label: 'Delete', ionFunction: createIonFunction(async () => {
                        graph.clearMouseListeners();

                        let hl = await exec('baja/manchester/menu/compound-delete-panel.js', graph, genegraph_panel_layout)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', hl);

                    }), mouseOver: createIonFunction(() => {
                        graph.setMessage('Options for removing compounds.')

                    })
                },
                {
                    x: 4, y: 0, label: 'AI Chemistry...', ionFunction: createIonFunction(async () => {
                        graph.clearMouseListeners();
                        await exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout)
                    }), mouseOver: createIonFunction(() => {
                        graph.setMessage('Describe a chemistry change in plain language and have it designed for a compound.')

                    })
                },

            ]
        }
    }
    return button_canvas;

}
