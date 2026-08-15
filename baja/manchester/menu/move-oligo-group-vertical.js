function (graph, genegraph_panel_layout) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ywc = -1;
    let selectedTrack = null;
    let starty = [];

    return new Promise(async (resolve, reject) => {

        let anchor = null;

        let currentY = null;
        let currentOligo = null;
        let drag = false;
        let selectedTrack = null;
        let diffx = 0;
        let diffy = 0;
        let MD = false;
        let start = 0;
        graph.addMouseUpListener((x, y) => {
            drag = false;
            diffx = 0;
            diffy = 0;
            MD = false;
            starty = []
        })
        graph.addMouseMoveListener(async (x, y) => {

            let trackIndex = graph.getTrack(x, y);
            if (graph.menuVisible()) {
                return;
            }
            let tr = graph.track[trackIndex];
            if (tr != null) {
                selectedTrack = tr;
                selectedTrack.select();
            }
            if (selectedTrack && drag && starty != null && starty.length > 0) {
                let diffy = start - y;
                let selectedOligos = await selectedTrack.getSelectedOligos();
                let index = 0;
                for (let s of selectedOligos)
                    s.y = starty[index++] + selectedTrack.tgraph.worldHeight(diffy);
            }
        })

        graph.addMouseDownListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                let cselectedTrack = graph.track[trackIndex]
                if (cselectedTrack && selectedTrack != cselectedTrack) {
                    if (selectedTrack)
                        selectedTrack.showResizeBar = false;
                }
                selectedTrack = cselectedTrack;
                selectedTrack.select();
            } else {
                graph.selectOff();
                selectedTrack = null;
            }

            if (selectedTrack) {
                drag = true;
                selectedTrack.tgraph.rescale();
                start = y;
                starty = selectedTrack.getSelectedOligos().map(o => o.y)

                selectedTrack.showResizeBar = true;
            }
        })
        resolve(graph)

    });

}
