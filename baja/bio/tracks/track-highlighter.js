function (graph) {

    let highlighter = (x, y) => {
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.trakck[p_trackIndex])
                graph.track[p_trackIndex].showResizeBar = true;
            return;
        }
    }
}
