function (graph, genegraph_panel_layout) {

    let tools_menu = [

        {
            'label': 'Select sequence(s)', click:(async () => {

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    graph.setMessage(" Select a sequence on a track.")
                    await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Compare sequence', click:(async () => {

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    let hl = await exec('baja/manchester/menu/comparative-tools.js', graph, genegraph_panel_layout)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', hl);
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Edit track sequence', click:(async () => {

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                    let hl = await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout)

                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {

            'label': 'Annotate mutations', click:(async () => {

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    await exec('baja/manchester/menu/variant-tools1.js', graph, genegraph_panel_layout)
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })

        },
        {
            'label': 'Annotate sequence', click:(async () => {

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    await exec('baja/manchester/menu/draw-tools-simple.js', graph, genegraph_panel_layout)
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },

    ]
    return tools_menu;
}
