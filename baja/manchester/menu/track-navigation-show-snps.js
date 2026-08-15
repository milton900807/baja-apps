function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selectedTrack = null;

    exec('flexigraph/snpindel.js').then(async SnpIndel => {

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
                selectedTrack = null;
            }
        })

        graph.addMouseDownListener((x, y) => {

            if (selectedTrack) {

                let sn = selectedTrack.snpindels;
                if (sn!= null && sn.length > 100) {
                    graph.setMessage(' too many snps to put in a menu')
                    return;
                }

                let menuList = []
                for (let s of sn) {
                    menuList.push({
                        label: s.name,
                        click: (xwc, ywc) => {

                            graph.animateTo(selectedTrack.tgraph.X(s.xi - 22),
                            selectedTrack.tgraph.X(s.xf + 22),
                            selectedTrack.tgraph.Y(-2), selectedTrack.tgraph.Y(2))
                        }

                    })
                }

                if (selectedTrack)
                    graph.showMenu(menuList, x, y)
            }
        })
    })

}
