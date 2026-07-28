function (graph) {
    graph.setMessage(" Click on track to view menu options...")
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        let html_panel;
        let currentPath;
        let selectedTrack = null;
        let selectedtrackIndex = graph.getTrack(x, y);
        console.log('debubg');
        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
            selectedTrack = graph.track[selectedtrackIndex]

            let layers = selectedTrack.track_layers;
            let m = []
            for (let l of layers) {
                let msg = 'Show ' + l.name;
                if (l.visible) {
                    msg = 'Hide ' + l.name;
                }
                let vf = {
                    'label': msg, click: async () => {
                        l.visible = !l.visible;
                    }
                }
                m.push ( vf );

                let dmsg = 'Delete ' + l.name;
                let df = {
                    'label': dmsg, click: async () => {
                        selectedTrack.track_layers.splice(selectedTrack.track_layers.indexOf(l),1);
                    }
                }
                m.push ( df );

            }

            graph.showMenu ( m , x, y, 300 );

        } else {
            graph.setMessage(" Please click on a track")
            return;
        }

    })
}
