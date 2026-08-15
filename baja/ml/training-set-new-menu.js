function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let layers = []
        for (let tl in graph.track) {
            let ttl = tl.layers;
            for (let l of ttl) {
                layers.push({
                    'label': l.name, click: (() => {

                    })
                })
            }
        }
        let tools_menu = [
            {
                'label': 'Sequence context to layer annotations model', click: (() => {

                    setTimeout(async () => {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        await exec('baja/ml/select-sequence-to-layer-model.js', graph, genegraph_panel_layout)
                    }, 1000)
                })
            },
            {
                'label': 'Secondary structure context model', click: (async () => {
                    setTimeout(async () => {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        exec('baja/manchester/menu/draw-secondary-structure3.js', graph, genegraph_panel_layout);
                    }, 1000)

                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                })
            },
            {
                'label': 'Annotation proximity model', click: (async () => {
                    alert(' Currently not available in this build')

                })
            },
        ]
        return resolve(tools_menu);
    })
}
