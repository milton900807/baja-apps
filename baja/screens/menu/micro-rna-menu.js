function (datapath, server, graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    let selectedTrack = null;
    let menuList = [
        {
            label: 'TargetScan ',
            click: async (xwc, ywc) => {

                let sequence = selectedTrack.getSequence();
                let res = exec('py/microrna/targetscan.py', sequence)
                showModal({
                    wid: 'json',
                    data: JSON.stringify(res)
                })

            }

        },
        {
            label: 'Load hits',
            click: async (xwc, ywc) => {
                let panel;
                const __nameHook = createIonFunction((editor) => {
                    panel = editor;
                })
                let em = new EngineMonitor((msg) => {
                    log(msg)
                });
                let epath = `/mirna/hg/${selectedTrack.chr}/${selectedTrack.name}.json`;
                epath = epath.replace(/\/+/g, '/');
                let host_ = window['env']['apiUrl']

                let url = window['env']['apiUrl']+'/load-file?key=bigdata&path=' + epath;
                log ( url )
                let rslist = await GETJSON(url);
                if ( rslist != null && rslist.length > 0 ) {
                }
                showModal({
                    wid: 'json',
                    data: JSON.stringify(rslist)
                }, 600, 600)

            }
        },
    ]

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
        let editor;
        let typeAhead;

        if (selectedTrack)
            graph.showMenu(menuList, x, y)
    });

}
