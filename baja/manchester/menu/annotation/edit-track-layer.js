function (graph) {

    exec('baja/bio/track-layer.js').then(async TrackLayer => {
        let index = 0;
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        let ed;
        const nameHook = createIonFunction((editor) => {
            ed = editor;
        })
        let start = -1;
        let end = -1;
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
            console.log(' selected track ' + trackIndex);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
            }
            ywc = y;
            let menuList = []
            let typeAhead;
            let type_ahead = createIonFunction((ref) => {
                typeAhead = ref;
            })

            menuList.push({
                label: 'Delete all layers ',
                click: async (xwc, ywc) => {
                    selectedTrack.removeTrackLayers();
                },
                move: () => {
                    log('movei running offtargets....')
                }
            })

            let index = 0;
            for ( let layer of selectedTrack.track_layers ){
                menuList.push({
                    label: 'Del '  + layer.name,
                    click: async (xwc, ywc) => {
                        selectedTrack.splice(index, 1);
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }
                })
                index++;
            }

            if (selectedTrack)
                graph.showMenu(menuList, x, y)

        });
    })

}
