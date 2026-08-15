function (graph, genegraph_panel_layout) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;

    (async () => {
        await exec('baja/manchester/menu/protein-menu-options.js', graph, genegraph_panel_layout)

    })();

}
