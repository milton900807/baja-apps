function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let showMainScreen = async () => {
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
        }
        await exec('baja/manchester/menu/draw-tools-simple.js', graph, genegraph_panel_layout)

        return resolve();
    })

}
