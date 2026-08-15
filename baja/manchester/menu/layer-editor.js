function (graph, genegraph_panel_layout) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })
    let showMainScreen = async () => {
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    }
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
                    x: 0, y: 0, label: 'Order', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Feature not available in this version')
                    })
                },
                {
                    x: 1, y: 0, label: 'Edit', ionFunction: createIonFunction(async () => {
                        exec ('baja/manchester/menu/select-track-action-layers.js', graph, genegraph_panel_layout );

                    })
                },
                {
                    x: 2, y: 0, label: 'Filter', ionFunction: createIonFunction(async () => {
                        await exec('baja/manchester/annotation/layer-filters.js', graph);
                    })

                },
            ]
        }
    }
    return button_canvas

}
