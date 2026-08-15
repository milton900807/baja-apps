function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let selectedTrack = null;
    let menuList = []
    let fix = (ochr) => {
        alert(ochr)
        const regex = /^chrx$/i;
        const regey = /^chry$/i;
        if (regex.test(ochr)) {
            return 'X';
        }
        else if (regey.test(ochr)) {
            return 'Y'
        }
        else {

            return ochr;
        }
    }

    menuList.push({
        label: 'Edit Layer',
        click: async (xwc, ywc) => {
            let track_layers_panel = await exec('baja/manchester/menu/select-track-action-layers-edit-panel.js', selectedTrack, genegraph_panel_layout)
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', track_layers_panel);

        },
        move: () => {
            log('')
        }
    })

    graph.addMouseMoveListener((x, y) => {
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.track[p_trackIndex]) {
                graph.track[p_trackIndex].showResizeBar = true;
                selectedTrack = graph.track[p_trackIndex]
            }
            return;
        }
    }
    )
    graph.addMouseDownListener(async (x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        let cluster = false;
        if (selectedTrack) {
            menuList = []
            let tl = selectedTrack.track_layers;
            for (let t of tl) {

                if (t.intervals && t.intervals.length > 0) {
                    cluster = true;
                }
            }

            if ( cluster ){
                menuList.push({
                    label: 'Sequence analysis track layer...',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {

                            exec ( 'baja/manchester/menu/cluster-objects-on-tracklayers-panel.js', graph, genegraph_panel_layout, selectedTrack, selectedTrack.tgraph.xmin, selectedTrack.tgraph.xmax, xwc, ywc)
                        }
                    },
                    move: () => {
                        log('')
                    }

                })
                menuList.push({
                    label: 'Sequence analysis track layer range...',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {
                            exec ( 'baja/manchester/menu/cluster-objects-on-tracklayers-panel.js', graph, genegraph_panel_layout, selectedTrack, selectedTrack.markstart, selectedTrack.markend)
                        }
                    },
                    move: () => {
                        log('')
                    }

                })

            }

            graph.showMenu(menuList, x, y)

        }
    });

}
