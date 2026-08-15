function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let host_ = window['env']['apiUrl']
    let selectedTrack = null;
    let menuList = []
    menuList.push({
        label: 'Allele-selective w/ coords',
        click: async (xwc, ywc) => {

            if ( !selectedTrack ) {
                graph.setMessage ( " Please select a track ")
                return;
            }

            let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem-with-coords.js', selectedTrack,  graph, genegraph_panel_layout)
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', paste_sequences_panel);

        },
        move: () => {
            log('')
        }

    })
    menuList.push({
        label: 'Map w/ edit dist',
        click: async (xwc, ywc) => {
        },
        move: () => {
            log('')
        }
    })

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
