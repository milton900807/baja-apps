function (graph) {

    return new Promise(async (resolve, reject) => {

        let selectedTrack;
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage("Click on a track... ")
        const nameHook = createIonFunction((editor) => {
            ed = editor;
        })
        let menuList = [];
        menuList.push({
            label: "Show/Hide Chart Labels",
            click: async (x, y) => {

                if (selectedTrack) {
                    for (let l of selectedTrack.plots) {
                        if (l.showLabel) {
                            l.showLabel = !l.showLabel;
                        }
                    }
                }
            },
            move: () => {
            }
        }
        );

        graph.addMouseMoveListener(async (x, y) => {
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                graph.deselectAllTracks();
                if (graph.track[p_trackIndex])
                    graph.track[p_trackIndex].showResizeBar = true;
                return;
            }
        }
        )
        graph.addMouseDownListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
            }
            if (selectedTrack)
                graph.showMenu(menuList, x, y)
        });

    })

}
