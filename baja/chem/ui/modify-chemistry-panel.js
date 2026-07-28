function (graph, genegraph_panel_layout) {
    let menuList = [
        {
            label: 'siRNA chemistry...',
            click: () => {
                exec ( 'baja/chem/ui/helm-template-editor-siRNA', graph, genegraph_panel_layout)
                exec ( 'baja/chem/ui/chemistry-editor-menu.js', graph, genegraph_panel_layout)
            }
        },
        {
            label: 'siRNA synthesis sequence...',
            click: () => {

                exec ('baja/chem/ui/modify-t-to-u-seq.js', graph, genegraph_panel_layout)
            }
        },

    ]
    graph.showWindowMenu(menuList, 10, 10, 200);
}
