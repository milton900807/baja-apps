function (graph) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selectedTrack;
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        selectedTrack = null;
        for (let t of graph.track) {
            t.deselect();
        }
        let si = graph.getTrack(x, y);
        selectedTrack = graph.track[si]
        if (selectedTrack) {
            selectedTrack.select();
        }
    })
    graph.addMouseDownListener(async (x, y) => {
        let si = graph.getTrack(x, y);
        let selectedTrack = graph.track[si]
        if (selectedTrack) {
            selectedTrack.select();
        }

        graph.showMenu([
            {
                'label': 'Sequence', click: async () => {
                    if (selectedTrack) {
                        exportFile(selectedTrack.sequence, selectedTrack.name + '.sequence')
                    }
                }
            },
            {
                'label': 'Complement sequence', click: async () => {
                }
            },])

    })
}
