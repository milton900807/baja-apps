function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let buttons__ = [
            {
                x: 0, y: 0, label: 'New...', ionFunction: createIonFunction(async () => {

                    await exec('baja/screens/menu/annotation/annotation-menu.js', graph, genegraph_panel_layout)
                    graph.setMessage ( "Click on a track... ")
                })
            },

            {
                x: 1, y: 0, label: 'Edit', ionFunction: createIonFunction(async () => {
                    await exec('baja/screens/menu/annotation/edit.js', graph, genegraph_panel_layout)
                })
            },

        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 900,
                'grid': {
                    xmin: 0,
                    xmax: 9,
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
