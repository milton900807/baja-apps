function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();

    let menuClick = false;
    let menuList = [
        {
            label: 'Primer on Intron',
            click: (x, y) => {
                start = -1;
                end = -1;
                let trackIndex = graph.getTrack(x, y);
                let tr = graph.track[trackIndex];

                if (trackIndex >= 0) {
                    track = graph.track[trackIndex]
                    x = x - track.tgraph.xi * 2;
                    start = Math.round(track.tgraph.Xwc(x));
                    end = Math.round(track.tgraph.Xwc(x));
                    let xtrack = Math.round(track.tgraph.Xwc(x));
                    let ytrack = Math.round(track.tgraph.Ywc(y));
                    let annotation = track.getAnnotation(xtrack, ytrack);

                    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                    graph.selectOff();

                    graph.hideMenu();

                }
            },
            move: () => {
            }
        }
    ]

    graph.addMouseDownListener(async (x, y) => {

    })
    graph.addMouseMoveListener((x, y) => {

    });
    graph.addMouseUpListener((x, y) => {
        if (menuClick) {
            menuClick = false;
        } else
            graph.showMenu(menuList, x, y, 200)

        setTimeout(() => {
            graph.hideMenu();
        }, 10000)

    });
}
