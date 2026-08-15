function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let buttons__ = [
            {
                x: 0, y: 0, label: 'New primers...', ionFunction: createIonFunction(async () => {
                    alert ( ' Feature not available')
                })
            },
            {
                x: 1, y: 0, label: 'Edit Track', ionFunction: createIonFunction(async () => {
                    graph.setMessage ( "Select a track.")
                    await exec ( 'baja/manchester/menu/primer-probe-action.js', graph, genegraph_panel_layout)
                })
            },
        ]
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 25,
                'width': 500,
                'grid': {
                    xmin: 0,
                    xmax: 5,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons__

            }
        }
        return resolve(button_canvas)
    })

}
