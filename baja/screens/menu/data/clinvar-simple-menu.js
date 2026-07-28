function (graph) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        graph.clearMouseListeners();
        graph.selectOff();
        let selectedTrack = null;
        menuList.push(
            {
                label: 'Load SNPss',
                click: async (scx, scy) => {
                    selectedTrack = graph.selectedTrack
                    let chr = selectedTrack.chr;
                    let start = selectedTrack.xi;
                    let end = selectedTrack.xf;
                    let em = new EngineMonitor((v) => {
                    })
                    let r = await exec(`py/bio/lj-tabix-2.py`, '/tmp/' + f, chr, start, end, selectedTrack.strand);
                    showModal({
                        wid: 'json',
                        data: JSON.stringify(r)
                    })

                    graph.setMessage(' click ')
                },
                move: () => {
                }
            });

        graph.addMouseMoveListener((x, y) => {

            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                let cselectedTrack = graph.track[trackIndex]
                if (cselectedTrack && selectedTrack != cselectedTrack) {
                    if (selectedTrack)
                        selectedTrack.showResizeBar = false;
                }
                selectedTrack = cselectedTrack;
                if (selectedTrack)
                    selectedTrack.showResizeBar = true;
            } else {
                graph.selectOff();
                selectedTrack = null;
            }
        })

        graph.addMouseDownListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }
            if (selectedTrack) {
                graph.showMenu(menuList, x, y, 200)
            }
        })
        graph.addMouseUpListener((x, y) => {
            if (graph.menuVisible()) {

                return;
            }
        })
        resolve()
    })
}
