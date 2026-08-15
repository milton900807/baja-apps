function (graph, genegraph_panel_layout) {
    let tools_menu = [

        {
            'label': 'Splicing attribution models (not available with this license)', click: (() => {
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            })
        },
        {
            'label': 'RNA structure models', click: (async () => {
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    exec('baja/manchester/menu/draw-secondary-structure3.js', graph, genegraph_panel_layout);
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
    ]
    return tools_menu;
}
