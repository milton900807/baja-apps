function (graph) {

    return new Promise(async (res, rej) => {
        let Ott = await exec('baja/off-targets/ott.js')
        let ot = new Ott();
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.selectOff();
        let ed;
        const nameHook = createIonFunction((editor) => {
            ed = editor;
        })
        let ywc = -1;
        let highlight = false;
        let selectedTrack = null;

        let currentY = null;
        let currentOligo = null;
        let drag = false;
        let diffx = 0;
        let diffy = 0;

        graph.addMouseUpListener((x, y) => {

            drag = false;
            diffx = 0;
            diffy = 0;

        })

        graph.addMouseMoveListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (graph.menuVisible()) {
                return;
            }
            let tr = graph.track[trackIndex];
            if (!tr || tr == undefined) {
                return;
            }
            tr.tgraph.rescale();

            let ycoord = ((tr.tgraph.Ywc(y - tr.tgraph.height)));

            currentY = ycoord
            let xcoord = tr.tgraph.Xwc(x - tr.tgraph.xi * 2);
            if (currentOligo && currentOligo.length > 0 && drag && selectedTrack) {
                for (let c of currentOligo) {
                    let d = c.xf - c.xi;
                    c.xi = Math.floor(xcoord + diffx);
                    c.xf = Math.floor(c.xi + d);
                    c.y = currentY + diffy;

                    let seq = tr.getSequenceRange(c.xi, c.xf);
                    if (c.setTargetSequence) {
                        if (c.getSeedSeq) {
                            let seed = c.getSeedSeq();
                            console.log(" seed sequence " + seed);
                            let offt = await ot.runOffTarget(seed);
                            if (offt) {
                                c.offtarget = offt;
                            } else {
                                c.offtarget = '';
                            }
                        }

                        c.setTargetSequence(seq)
                    } else {
                        c.sequence = seq;
                        c.name = c.sequence
                    }
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

                    let xcoord = (tr.tgraph.Xwc(x - tr.tgraph.xi * 2));

                    currentOligo = tr.getOligo(x, y, graph)
                    if (currentOligo && currentOligo.length > 0) {

                        let c = currentOligo[0]
                        console.log(" we have an oligo ")
                        diffx = c.xi - xcoord;
                        diffy = c.y - ycoord;
                    } else {
                        console.log(" we do not have an oligo ")
                    }
                    selectedTrack.showResizeBar = true;
                }
            }
            ywc = y;
        })
    })

}
