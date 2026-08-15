function (graph, genegraph_panel_layout) {

    let tools_menu = [

        {
            'label': 'Filter rules (Not available with this license)', click: (async () => {
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Create/Edit ASO compounds', click: (async () => {
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    await exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout)
                    exec('baja/manchester/menu/simple-info-panel.js', graph, genegraph_panel_layout, '')
                }, 500)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Chemistry', click: (async () => {

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    await exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout)
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Export to synthesis codes', click: (async () => {
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    await exec('baja/manchester/menu/synthesis-tools.js', graph, genegraph_panel_layout)
                }, 1000)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            })
        },
        {
            'label': 'Off-targets  (Not available with this license)', click: (() => {
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Modify ASO properties', click: (async () => {

                setTimeout(async () => {
                    await exec(' baja/manchester/menu/advanced-aso-properties-mod.js', graph, genegraph_panel_layout)
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        }

    ]
    return tools_menu;
}
