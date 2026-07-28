function (graph, genegraph_panel_layout) {
    let menuList = []
    graph.clearMouseListeners();
    graph.selectOff();
    let selectedTrack = null;
    menuList.push(
        {
            label: 'Download Off-targets',
            click: async (scx, scy) => {
                await exec ( 'baja/screens/menu/download-offtargets-from-track.js', graph)
            },
            move: () => {
            }
        });

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            let cselectedTrack = graph.track[trackIndex]
            if (cselectedTrack && selectedTrack != cselectedTrack) {
                if (selectedTrack)
                    selectedTrack.showResizeBar = false;
            }
            selectedTrack = cselectedTrack;
            if (selectedTrack)
                selectedTrack.showResizeBar = true;
        } else {
            graph.selectOff();
            selectedTrack = null;
        }
    })

    graph.addMouseDownListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        if (selectedTrack) {
            graph.showMenu(menuList, x, y, 200)
        }
    })
    graph.addMouseUpListener((x, y) => {
        if (graph.menuVisible()) {

            return;
        }
    })
}
