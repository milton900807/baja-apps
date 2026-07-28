function (graph, genegraph_panel_layout) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;

    (async () => {
        await exec('baja/screens/menu/protein-menu-options.js', graph, genegraph_panel_layout)

    })();

}
