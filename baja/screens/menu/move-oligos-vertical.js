function (graph) {

    console.log('debubg');
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let ywc = -1;
    exec('lib/msgraph.js').then(async MSGraph => {
        let currentY = null;
        let currentOligo = null;
        let drag = false;
        let selectedTrack = null;
        let diffx = 0;
        let diffy = 0;

        graph.addMouseUpListener((x, y) => {

            drag = false;
            diffx = 0;
            diffy = 0;

        })

        graph.addMouseMoveListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);

            let tr = graph.track[trackIndex];
            tr.tgraph.rescale();
            let ycoord = ((tr.tgraph.Ywc(y - tr.tgraph.height)));
            currentY = ycoord
            if (currentOligo && currentOligo.length > 0 && drag && selectedTrack) {
                for (let c of currentOligo) {
                    c.y = currentY + diffy;
                }
            }
            if (trackIndex >= 0) {
                let cselectedTrack = graph.track[trackIndex]
                if (cselectedTrack && selectedTrack != cselectedTrack) {
                    if (selectedTrack)
                        selectedTrack.showResizeBar = false;
                }
                selectedTrack = cselectedTrack;
            } else {
                graph.selectOff();
                selectedTrack = null;
            }
        })

        graph.addMouseDownListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                drag = true;

                selectedTrack = graph.track[trackIndex]
                if (selectedTrack) {
                    let tr = graph.track[trackIndex];
                    tr.tgraph.rescale();
                    let ycoord = ((tr.tgraph.Ywc(y - tr.tgraph.height)));
                    currentY = ycoord
                    currentOligo = tr.getOligo(x, y, graph)
                    if (currentOligo && currentOligo.length > 0) {

                        let c = currentOligo[0]
                        console.log(" we have an oligo ")
                        diffx = 0;
                        diffy = c.y - ycoord;
                    } else {
                        console.log(" we do not have an oligo ")
                    }
                    selectedTrack.showResizeBar = true;
                }
            }
            ywc = y;
        })

    });

}
