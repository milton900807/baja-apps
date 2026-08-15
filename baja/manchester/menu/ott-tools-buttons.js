function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let buttons__ = [
            {
                x: 0, y: 0, label: 'Run Off-targets...', ionFunction: createIonFunction(async () => {
                    await exec ( 'baja/manchester/menu/run-off-target-tool.js', graph, genegraph_panel_layout)
                })
            },
            {
                x: 1, y: 0, label: 'Download', ionFunction: createIonFunction(async () => {
                    graph.setMouseMode('none')
                    graph.setMessage ( "Downloading off targets.")
                    await exec ( 'baja/manchester/menu/ott-tools-download-ot.js', graph, genegraph_panel_layout);

                })
            },
            {
                x: 2, y: 0, label: 'Highlight', ionFunction: createIonFunction(async () => {
                    graph.setMouseMode('none')
                    graph.setMessage ( " These do not have off-targets ")
                    await exec('baja/manchester/menu/ott-tools-highlighter', graph)
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
                    xmax: 7,
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
