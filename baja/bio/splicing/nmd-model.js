function (graph, genegraph_panel_layout) {

    return new Promise(async (res, reject) => {
        const num = (v, d = 0) => {
            const f = typeof v === "number" ? v : parseFloat(String(v));
            return Number.isFinite(f) ? f : d;
        };

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        let selectedTrack = null;
        graph.deselectAllTracks();
        graph.addMouseMoveListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }
            graph.deselectAllTracks();
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                if (graph.track[p_trackIndex] != null) {
                    selectedTrack = graph.track[p_trackIndex]
                    selectedTrack.select();
                }
                return;
            }
        }
        )
        graph.addMouseDownListener(async (x, y) => {

        })
        graph.addMouseUpListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                // orfi.py reports through works.progress / works.msg, so hand it an
                // EngineMonitor and relay both onto the graph's own message line. It reads
                // only param 1 (the sequence); strand and name are discarded by its Ion
                // entry point, so there is no point passing them.
                let engineMonitor = new EngineMonitor((msg) => {
                    graph.setMessage(' ' + msg + ' ');
                });
                engineMonitor.addProgressListener(async (v) => {
                    graph.setMessage(' ' + v + '% ');
                });
                let rr = await exec('py/bio/nmd/orfi.py', selectedTrack.sequence, engineMonitor)
                showModal({
                    wid: 'json',
                    data: JSON.stringify(rr)
                })

            }
        })

        res();

    })

}
