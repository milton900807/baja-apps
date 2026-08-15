function (graph, library, folder) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let ywc = -1;
    let selectedTrack = null;
    graph.addMouseMoveListener((x, y) => {
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
        ywc = y;
        let menuList = []
        let editor;
        let typeAhead;
        let type_ahead = createIonFunction((ref) => {
            typeAhead = ref;
        })

        removeA = (selectedTrack, type) => {
            let annotations = selectedTrack.annotations;
            for (let a of annotations) {
                if (a.type === type) {
                    selectedTrack.removeAnnotation(a);
                    removeA(selectedTrack, type)
                }
            }
            return;
        }
        let cb3 = createIonFunction((ref) => {
            editor = ref;
        })

        if (selectedTrack)
            graph.showMenu(menuList, x, y)

    })

}
