function (graph, genegraph_panel_layout) {

    let tools_menu = [

        {
            'label': 'Filter rules', click: (async () => {
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    await exec('baja/manchester/menu/filter-sub-menu.js', graph, genegraph_panel_layout)
                }, 1000)

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
                    exec('baja/manchester/menu/simple-info-panel.js', graph, genegraph_panel_layout, 'Menus for creating compounds...')
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
            'label': 'Off-targets', click: (() => {
                setTimeout(async () => {
                    await exec('baja/manchester/menu/off-target-tools-sub-menu.js', graph, genegraph_panel_layout)
                }, 1000)

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
        },

        {
            'label': 'Remove all ASOs', click: (async () => {

                let zoom_to = {
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        height: '800px',
                        cards: [
                            [
                                {
                                    'title': ' ', 'body': ``
                                    ,
                                    'width': '90%',
                                    'component':
                                    {
                                        wid: 'html',
                                        data: '<font color=red> Are you sure you want to remove all compounds? </font>'
                                    }
                                },
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Yes', ionFunction: createIonFunction(() => {

                                                        let c = 0;
                                                        for (let t of graph.track) {
                                                            t.oligos = []
                                                        }
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        graph.setMessage(" Compounds removed from all tracks.");
                                                        hideAllModal();
                                                    })
                                                },
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                        hideAllModal();
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                    })
                                                }
                                            ]
                                        }
                                    }
                                }
                            ]]
                    }
                }
                showModal(zoom_to)

            })
        }

    ]
    return tools_menu;
}
