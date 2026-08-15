function (graph) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

    graph.selectOff();
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let highlight = false;
    let highlight_label = 'Highlight'
    let selectedTrack = null;
    let resizeTrack = false;
    let trackIndex = null;
    let original_height = 0;
    graph.addMouseMoveListener((x, y) => {
        if (resizeTrack && selectedTrack) {
            let scx = graph.X(x);
            let scy = graph.Y(y);
            let scxi = graph.X(selectedTrack.tgraph.xi)
            let scyi = graph.Y(selectedTrack.tgraph.yi)
            let scxwi = graph.X(selectedTrack.tgraph.xi + selectedTrack.tgraph.width)
            let scyhi = graph.Y(selectedTrack.tgraph.yi + (selectedTrack.tgraph.height))

            selectedTrack.tgraph.height = original_height + ywc - y;
            selectedTrack.tgraph.yi = y

            if (selectedTrack.tgraph.height > 0)
                selectedTrack.tgraph.height *= (-1)
            selectedTrack.tgraph.rescale();
        } else {

            let p_trackIndex = graph.getTrack(x, y);
            if (!resizeTrack && p_trackIndex == null) {
                graph.deselectAllTracks();
                return;
            }
            if (!resizeTrack && p_trackIndex >= 0) {
                graph.deselectAllTracks();
                graph.track[p_trackIndex].showResizeBar = true;
                return;
            }

        }
    })
    graph.addMouseUpListener((x, y) => {
        resizeTrack = false;
        graph.deselectAllTracks();
        selectedTrack = null;
    })

    graph.addMouseDownListener((x, y) => {
        trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
            graph.track[trackIndex].showResizeBar = true;
            resizeTrack = true;
        }
        if (selectedTrack) {
            ywc = y;
            original_height = selectedTrack.tgraph.height;

            let scx = graph.X(x);
            let scy = graph.Y(y);
            let scxi = graph.X(selectedTrack.tgraph.xi)
            let scyi = graph.Y(selectedTrack.tgraph.yi)

            let scxwi = graph.X(selectedTrack.tgraph.xi + selectedTrack.tgraph.width)
            let scyhi = graph.Y(selectedTrack.tgraph.yi + (selectedTrack.tgraph.height))

            if (Math.abs(scx - scxi) < 10 && Math.abs(scy - scyi) < 10) {

            }
            else if (Math.abs(scxwi - scx) < 10 && Math.abs(scyhi - scy) < 10) {

                console.log(" selectedTrack.tgraph.width " + selectedTrack.tgraph.width)
                selectedTrack.tgraph.rescale();
                resizeTrack = true;

                return;
            }
            else if (Math.abs(scxwi - scx) < 10 && Math.abs((scyi) - scy) < 10) {

            }
            else if (Math.abs(scxi - scx) < 10 && Math.abs((scyhi) - scy) < 10) {

            }
        }
    });
}
