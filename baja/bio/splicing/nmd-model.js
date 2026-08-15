function (graph, genegraph_panel_layout) {

    return new Promise(async (res, reject) => {
        const TrackLayer = await exec('baja/bio/track-layer')
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
            console.log('debubg');
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
<<<<<<< HEAD
                let r = await GETJSON(`http://localhost:8080/transcripts/${selectedTrack.name}`)
                let rr = await exec('py/bio/nmd/orfi.py', selectedTrack.sequence, selectedTrack.strand, selectedTrack.name)
=======

                console.log('debubg');

                let engineMonitor = new EngineMonitor((msg) => {
                    pt.setMessage(msg)
                });
                engineMonitor.addProgressListener(async (v) => {
                    pt.setMessage('' + v);

                })

                let rr = await exec('py/bio/nmd/orfi.py', selectedTrack.sequence, engineMonitor)
                let trackLayer = new TrackLayer('' + Math.random(), selectedTrack.tgraph.xmin, 0, selectedTrack.tgraph.xmax, 1)
                trackLayer.setXi(graph.X(selectedTrack.tgraph.xi))
                trackLayer.setYi(graph.Y(selectedTrack.tgraph.yi))
                trackLayer.setHeight(graph.screenHeight(selectedTrack.tgraph.height));
                trackLayer.setWidth(graph.screenWidth(selectedTrack.tgraph.width))
                trackLayer.tgraph.rescale();
                const slice = trackLayer.queryRange(1000, 5000, { clamp: true });
                const visible = trackLayer.queryVisible(graph, { includePolygon: false });

>>>>>>> 0743cc79800decc479349f9120a6ba95e1677add
                showModal({
                    wid: 'json',
                    data: JSON.stringify(rr)
                })

            }
        })

        res();

    })

}
