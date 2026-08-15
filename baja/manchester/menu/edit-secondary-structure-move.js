function (graph) {
    let startx;
    let starty;
    let md = false;
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selected = null;
    let selected_track;
    graph.addMouseDownListener(async (x, y) => {
        md = true;
        for (let track of graph.track) {
            let stru = track.getStructure(x, y)
            if (stru && stru.length>0) {
                selected_track = track;
                selected = stru[0];

            }
        }
        if (selected && selected != null && selected.tgraph && selected_track.tgraph) {
            startx = x - selected.tgraph.xi;
            starty = y - selected.tgraph.yi;
        }
    });
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        if (md) {

            let dx = x - startx;

            let dy = y - starty;
            console.log ( ' dy ' + dy )
            if (selected) {

                selected.tgraph.xi = dx;

                selected.tgraph.yi = dy;
            }
        }
    });
    graph.addMouseUpListener((x, y) => {

        if (selected) {
            console.log(' deslecting ')
            selected.deselect();
        }

        md = false;
        selected = null;
        selected_track = null;

    });

}
