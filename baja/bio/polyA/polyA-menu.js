function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

    graph.selectOff();
    graph.setMessage(" Select a track... ")
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

        let cb3 = createIonFunction((ref) => {
            editor = ref;
        })
        menuList.push({
            label: 'Show PolyA motifs',
            click: async (xwc, ywc) => {
                let seq = selectedTrack.sequence;
                if (!seq) {
                    prompt(" No sequence found; cannot apply an oligo ")
                } else {
                    let ref = await exec('baja/bio/polyA/ref.js')
                    let ind = []
                    for ( let mo of ref ){
                        let i = seq.indexOf ( mo );
                        while ( i >= 0 )
                        {
                            ind.push ( i );
                            i = seq.indexOf ( mo, i+1)
                        }
                    }

                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        })
        if (selectedTrack)
            graph.showMenu(menuList, x, y)

    });
}
