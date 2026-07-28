function (graph, genegraph_panel_layout) {

    let tools_menu = [

        {
            'label': 'Select sequence(s)', click:(async () => {

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    graph.setMessage(" Select a sequence on a track.")
                    await exec('baja/screens/menu/sequence-tt.js', graph, genegraph_panel_layout, true)
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
                    await exec('baja/screens/menu/draw-tools-simple.js', graph, genegraph_panel_layout)
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },

    ]
    return tools_menu;
}
