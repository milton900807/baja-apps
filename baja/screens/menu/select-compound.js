function (graph, showMainPanel) {

    graph.clearMouseListeners();
    graph.selectOff();
    graph.addMouseDownListener((x, y) => {
        let structures = graph.getStructure(x, y)
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        if (!structures || structures.length <= 0) {
            return
        }
        for (let str of structures) {
            if (str && str.length > 0) {
                for (let s of str) {
                    if (s.highlight)
                        s.highlight(400);
                }
            }
        }
    })
}
