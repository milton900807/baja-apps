function (graph) {

    let m = {
        'label': 'Track link', 'ionfunction': createIonFunction(() => {
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.selectOff();
            let ed;
            const nameHook = createIonFunction((editor) => {
                ed = editor;
            })
            let start = -1;
            let end = -1;
            let ywc = -1;
            let selectedTrack = null;
            let resizeTrack = false;

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
                let trackIndex = graph.getTrack(x, y);
                if (trackIndex >= 0) {
                    selectedTrack = graph.track[trackIndex]
                }
                let menuList = [
                ]
                if (selectedTrack) {

                    menuList.push({
                        label: `Create Tracklink`,
                        click: (xwc, ywc) => {

                            exec('baja/manchester/menu/create-tracklink.js', selectedTrack)

                        },
                        move: () => {
                        }
                    });

                    menuList.push({
                        label: `Show/Hide mismatches`,
                        click: (xwc, ywc) => {
                            selectedTrack.trackRef.showMismatches = !selectedTrack.trackRef.showMismatches
                        },
                        move: () => {
                        }
                    });
                }

                graph.showMenu(menuList, x, y, 200)
            });
        })
    }
    return m;
}
