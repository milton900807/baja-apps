function (selectedTrack, annotation, graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        if (!graph.menuVisible()) {
            let wx = selectedTrack.tgraph.Xwc(x);
            let diff = annotation.xf - annotation.xi;
            annotation.xi = wx;
            annotation.xf = wx + diff;
            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.setMouseMode ( "navigation")

        }
    })
    graph.addMouseMoveListener((x, y) => {

        if (selectedTrack && selectedTrack.tgraph) {

            let wx = selectedTrack.tgraph.Xwc(x);
            let diff = annotation.xf - annotation.xi;
            annotation.xi = wx;
            annotation.xf = wx + diff;
            selectedTrack.generateORF ();

        }

    });
}
