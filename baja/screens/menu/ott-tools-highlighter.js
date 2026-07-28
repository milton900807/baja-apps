function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners();
    graph.selectOff();
    console.log('debubg');
    for (let tr of graph.track) {
        for (let o of tr.oligos) {
            if (o.offtarget == null && o.highlight) {
                o.highlight(5000, 'red');
            }
        }
    }
}
