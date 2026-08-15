function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();

    let selectedTrack;
    let MD = false;
    let annotation = null;
    graph.addMouseDownListener(async (x, y) => {
        if (!graph.menuVisible()) {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                if (selectedTrack)
                    selectedTrack.select();

            }

            if (!selectedTrack) {
                graph.setMessage(" Select a track.")
                return;
            }
            MD = true;
        }
        else {
            if (selectedTrack != null) {
                annotation = selectedTrack.getAnnotation(selectedTrack.tgraph.Xwc(x), selectedTrack.tgraph.Ywc(y))
            }
        }
    })
    graph.addMouseMoveListener((x, y) => {

        if (graph.menuVisible()) {
        }
        else {

            graph.deselectAllTracks();
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                if (selectedTrack)
                    selectedTrack.select();
            } else {
                graph.deselectAllTracks();

            }
            if (selectedTrack != null) {
                let aannotation = selectedTrack.getAnnotationX(Math.floor(selectedTrack.tgraph.Xwc(x)))
                annotation = []

                if (aannotation && aannotation.length > 0) {
                    let name = ''
                    for (let an of aannotation) {
                        if (an.type === 'Exon')
                        {
                            name += an.name + ' ';
                            annotation.push ( an );
                        }

                    }
                    graph.setMessage(name)
                }
            }
        }
    });
    graph.addMouseDownListener(async (x, y) => {

        if (annotation != null && annotation.length > 0 ) {
            let menuList = []
            for (let a of annotation) {
                menuList.push({
                    label: 'Run... ' + a.name,
                    click: async (xwc, ywc) => {

                    },
                    move: () => {
                        log('')
                    }
                })
            }
            graph.showMenu(menuList, x, y)
        }

    })
}
