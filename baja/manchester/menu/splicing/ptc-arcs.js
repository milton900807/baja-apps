function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let splice_motifs = await exec('baja/bio/splicing/splice-motifs')

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        let ywc = -1;
        let Xwc = -1;
        let selectedTrack = null;
        let md = false;
        graph.addMouseMoveListener((x, y) => {
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                graph.deselectAllTracks();
                if (graph.track[p_trackIndex] != null) {
                    graph.track[p_trackIndex].showResizeBar = true;
                    selectedTrack = graph.track[p_trackIndex]
                    if (selectedTrack)
                        selectedTrack.select();
                }
                return;
            }

        })
        graph.addMouseDownListener(async (x, y) => {
            ywc = y;
            Xwc = x;
            let xwc = Xwc;
            let menuList = []

            if (selectedTrack) {
                let exons = selectedTrack.getExons();
                let closest_donor = null;
                let closest_acceptor = null;
                let acceptor_message = null;
                let donor_message = null;
                if (exons.length > 0) {
                    if (selectedTrack.strand == 1) {
                        closest_donor = exons.reduce((a, b) => Math.abs(a.xf - xwc) < Math.abs(b.xf - xwc) ? a : b);
                        closest_acceptor = exons.reduce((a, b) => Math.abs(a.xi - xwc) < Math.abs(b.xi - xwc) ? a : b);
                        acceptor_message = 'Acceptor ' + closest_acceptor.name + ' ' + closest_acceptor.xi;
                        donor_message = 'Resize ' + closest_donor.name + ' ' + closest_donor.xf;
                    } else {
                        closest_acceptor = exons.reduce((a, b) => Math.abs(a.xf - xwc) < Math.abs(b.xf - xwc) ? a : b);
                        closest_donor = exons.reduce((a, b) => Math.abs(a.xi - xwc) < Math.abs(b.xi - xwc) ? a : b);
                        acceptor_message = 'Acceptor ' + closest_acceptor.name + ' ' + closest_acceptor.xf;
                        donor_message = 'Donor ' + closest_donor.name + ' ' + closest_donor.xi;

                    }
                }

                menuList.push({
                    label: 'PTC-layer to track ' + selectedTrack.name,
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {

                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let attr = new AttributionSushimiLayer('PTC' + Xwc, selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0, 'PTC')

                            selectedTrack.addLayer(attr);
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                        }
                    }
                })
                if (selectedTrack)
                    graph.showWindowMenu(menuList, x, y)
            }

        })

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    })

}
