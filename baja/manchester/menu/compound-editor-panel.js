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
                    x: 0, y: 0, label: 'Single', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Click on a compound')

                        graph.clearMouseListeners();
                        graph.setMouseMode ( 'navigate')

                        exec('baja/manchester/menu/select-structure-simple.js', graph, genegraph_panel_layout)

                    })
                },
                {
                    x: 1, y: 0, label: 'Group', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Click and drag a box around the group of compounds you want to edit.')
                        graph.clearMouseListeners();
                        graph.deselectAllCompounds ()
                        graph.setMouseMode ( 'navigate')
                        await exec('baja/manchester/select-compounds.js', graph, genegraph_panel_layout)

                    })
                },
                {
                    x: 2, y: 0, label: 'All', ionFunction: createIonFunction(async () => {
                        graph.clearMouseListeners();
                        graph.setMouseMode ( 'navigate')

                        graph.setMessage('Edit properties of all compounds')
                        let editPanel = await exec('baja/manchester/menu/compound-editor-panel-all.js', graph, genegraph_panel_layout)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', editPanel);
                    })

                },

            ]
        }

    }
    return button_canvas

}
