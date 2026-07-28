function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        let ywc = -1;
        let selectedTrack = null;

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
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                    graph.setMessage(" This calculation will take a long time.  Please do not close your browser. ")
                    runIt(selectedTrack);
                })
                showModal(confirm)
            }

        })

        graph.addMouseUpListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
            }
        })

        let runIt = async (selectedTrack, donor) => {
            for (let exon of exons) {

                try {
                    let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                    let donor_attrbution_ht = '/ljdonor/v1/models/donor_attributor:predict';
                    let w = {
                        wid: 'working',
                        'message': ' Executing LJSplice...'
                    }
                    let attr_window = 720;
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', w);
                    let attribution_site = null;

                    if (selectedTrack.strand == 1) {
                        attribution_site = exon.xi;
                    } else {
                        attribution_site = exon.xf + 1;
                    }

                    let startIndex = attribution_site - selectedTrack.xi - attr_window;
                    let endIndex = attribution_site - selectedTrack.xi + attr_window;
                    if (startIndex < 0) {
                        startIndex = 0;
                    }
                    if (endIndex > selectedTrack.sequence.length) {
                        endIndex = selectedTrack.sequence.length - 1;
                    }
                    let seq = selectedTrack.sequence.slice(startIndex, endIndex);
                    let data = {
                        "signature_name": "serving_default",
                        inputs: {
                            "sequence": [seq],
                            "xi": [selectedTrack.xi + startIndex],
                            "xf": [selectedTrack.xi + endIndex],
                            "strand": ['' + selectedTrack.strand],
                            "attribution_site": [attribution_site],
                        }
                    }
                    console.log(data)
                    console.log(donor_attrbution_ht)
                    let res = await POSTJSON(data, donor_attrbution_ht)

                    if ( !(res)   || (!res.outputs)  || (!res.outputs.log_odds_ratios) ){
                        graph.setError ( ' Failed to run splicing on the current site ' + attribution_site );
                        return;
                    }

                    if (res && res.outputs && res.outputs.log_odds_ratios) {
                        let attribution_scores = res.outputs.log_odds_ratios
                        let attribution_indices = res.outputs.out_indices

                        let layer = new AttributionLayer(exon.name + '_acc_attribution', selectedTrack.xi, 0, selectedTrack.xf, 1, 'acceptor_attribution', attribution_site, attr_window, selectedTrack);
                        let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))
                        if (!max_exp) {
                            max_exp = 1.
                        }
                        max_exp = max_exp * -2;
                        for (let [i, s] of attribution_indices.map((e, _i) => [e, -1 * attribution_scores[_i]])) {
                            if (i != -1) {
                                base = selectedTrack.sequence[i - selectedTrack.xi]

                                layer.addAttributionPoint(i, s / max_exp, base);
                            }
                        }
                        if (selectedTrack && layer.compounds.length <= 0) {

                            let pts = [].concat(layer.apts, layer.tpts, layer.cpts, layer.gpts)
                            let compounds = await selectedTrack.getOligosInRange(attribution_site - attr_window, attribution_site + attr_window)
                            for (let c of compounds) {
                                let cpts = pts.filter(point => point.x >= c.xi && point.x < c.xf);
                                if (cpts.length > 0) {

                                    let sum = 0;
                                    for (let val of cpts) {
                                        sum -= val.y;
                                    }
                                    sum = parseFloat(sum.toFixed(4));
                                    console.log(" comp0ound " + sum);

                                    layer.compounds.push({
                                        id: c.id,
                                        xi: c.xi,
                                        xf: c.xf,
                                        y: c.y,
                                        v: sum
                                    });
                                }
                            }
                            layer.compounds = layer.compounds.sort((a, b) => {
                                if (a.v < b.v) {
                                    return -1;
                                }
                                if (a.v > b.v) {
                                    return 1;
                                }
                                return 0;
                            });
                        }
                        selectedTrack.addLayer(layer);
                    }
                } catch (exception) {
                    graph.setError ( 'Failed to run ' + exon.name )
                }
            }
        }
        resolve();
    })

}
