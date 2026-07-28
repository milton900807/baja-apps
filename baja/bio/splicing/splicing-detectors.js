function (graph) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })

    let selectedTrack = null;
    graph.addMouseMoveListener((x, y) => {
        graph.deselectAllTracks();

        if (!graph.menuVisible()) {
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                selectedTrack = graph.track[p_trackIndex]
                if (graph.track[p_trackIndex])
                    graph.track[p_trackIndex].showResizeBar = true;
                return;
            }
        }
    }
    )
    graph.addMouseDownListener(async (x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }

        let xwc = selectedTrack.tgraph.Xwc(x);
        let ywc = selectedTrack.tgraph.Ywc(y);
        let menuList = []
        let editor;
        let typeAhead;
        let type_ahead = createIonFunction((ref) => {
            typeAhead = ref;
        })

        let cb3 = createIonFunction((ref) => {
            editor = ref;
        })

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
                donor_message = 'Donor ' + closest_donor.name + ' ' + closest_donor.xf;
            } else {
                closest_acceptor = exons.reduce((a, b) => Math.abs(a.xf - xwc) < Math.abs(b.xf - xwc) ? a : b);
                closest_donor = exons.reduce((a, b) => Math.abs(a.xi - xwc) < Math.abs(b.xi - xwc) ? a : b);
                acceptor_message = 'Acceptor ' + closest_acceptor.name + ' ' + closest_acceptor.xf;
                donor_message = 'Donor ' + closest_donor.name + ' ' + closest_donor.xi;

            }
        }
        let attribution_range = 720;
        let min = -3.;
        let max = 3.;
        menuList.push({
            label: acceptor_message,
            click: async (x, y) => {

                let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                let ht = '/ljsplice/detector_acceptor/v1/models/acceptor_detector:predict';
                let w = {
                    wid: 'working',
                    'message': ' Executing LJSplice...'
                }
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', w);
                let attribution_site = null;
                if (selectedTrack.strand == 1) {
                    attribution_site = closest_acceptor.xi;
                } else {
                    attribution_site = closest_acceptor.xf + 1;
                }
                let attr_window = 720;
                let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                let m = va['Window']
                if (m === null) {
                    attr_window = 720
                } else {
                    attr_window = parseInt(m);
                }

                let data = {
                    "signature_name": "serving_default",
                    "inputs": {
                        "sequence": [selectedTrack.sequence],
                        "xi": [selectedTrack.xi],
                        "xf": [selectedTrack.xf],
                        "strand": ['' + selectedTrack.strand],
                        "attribution_site": [attribution_site],
                    },
                }
                console.log(data)
                console.log(ht)
                let res = await POSTJSON(data, ht)
                if ( !(res)   || (!res.outputs)  || (!res.outputs.log_odds_ratios) ){
                    graph.setError ( ' Failed to run splicing on the current site ' + attribution_site );
                    return;
                }

                let attribution_scores = res.outputs.log_odds_ratios
                let attribution_indices = res.outputs.out_indices
                console.log(attribution_scores)
                console.log(res.outputs.out_scores)
                let layer = new AttributionLayer(closest_acceptor.name + '_acc_attribution', selectedTrack.xi, 0, selectedTrack.xf, 1, 'acceptor_attribution', attribution_site, attr_window);
                let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))
                if (!max_exp) {
                    max_exp = 1.
                }
                max_exp = max_exp * -2;

                for (let [i, s] of attribution_indices.map((e, _i) => [e, attribution_scores[_i]])) {
                    if (i != -1) {
                        base = selectedTrack.sequence[i - selectedTrack.xi]
                        layer.addAttributionPoint(i, s / max_exp, base);
                    }
                }

                if (selectedTrack && layer.compounds.length <=0) {
                    let compounds = await selectedTrack.getOligosInRange(attribution_site - window, attribution_site + window)
                    for (let c of compounds) {
                        let cpts = pts.filter(point => point.x >= c.xi && point.x < c.xf);
                        let sum = 0;
                        for (let val of cpts) {
                            sum += val.y;
                        }
                        sum = parseFloat(sum.toFixed(2));
                        layer.compounds.push({
                            id:c.id,
                            xi:c.xi,
                            xf:c.xf,
                            y: c.y,
                            v:sum
                        });
                    }
                    layer.compounds = layer.compounds.sort((a, b) => {
                        if (a.v< b.v) {
                            return -1;
                        }
                        if (a.v > b.v) {
                            return 1;
                        }
                        return 0;
                    });
                }

                selectedTrack.addLayer(layer);

                let button_canvas = await exec('screen/controls/navigation-panel.js', graph)

                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

            },
            move: () => {
                log('')
            }
        },
            {
                label: donor_message,
                click: async (xwc, ywc) => {

                    let w = {
                        wid: 'working',
                        'message': ' Executing LJSplice...'
                    }

                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', w);

                    let AttributionLayer = await exec('baja/bio/attribution-layer.js');

                    let ht = '/ljsplice/detector_donor/v1/models/acceptor_detector:predict';

                    let attribution_site = null;
                    if (selectedTrack.strand == 1) {
                        attribution_site = closest_donor.xf + 1;
                    } else {
                        attribution_site = closest_donor.xi;
                    }
                    let data = {
                        "signature_name": "serving_default",
                        "inputs": {
                            "sequence": [selectedTrack.sequence],
                            "xi": [selectedTrack.xi],
                            "xf": [selectedTrack.xf],
                            "strand": ['' + selectedTrack.strand],
                            "attribution_site": [attribution_site],
                        },
                    }

                    let attr_window = 720;

                    let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                    let m = va['Window']
                    if (m === null) {
                        attr_window = 720
                    } else {
                        attr_window = parseInt(m);
                    }

                    console.log(data)
                    console.log(ht)

                    let _res = await POSTJSON(data, ht);

                    showModal({
                        wid: 'json',
                        data: JSON.stringify(_res)
                    })

                    let attribution_scores = _res.outputs.log_odds_ratios
                    let attribution_indices = _res.outputs.out_indices
                    console.log(attribution_scores)
                    console.log(_res.outputs.out_scores)

                    let layer = new AttributionLayer(closest_acceptor.name + '_don_attribution', selectedTrack.xi, 0, selectedTrack.xf, 1, 'acceptor_attribution', attribution_site, attr_window);

                    let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))

                    if (!max_exp) {
                        max_exp = 1.
                    }
                    max_exp = max_exp * -2;

                    for (let [i, s] of attribution_indices.map((e, _i) => [e, attribution_scores[_i]])) {
                        if (i != -1) {
                            base = selectedTrack.sequence[i - selectedTrack.xi]
                            layer.addAttributionPoint(i, s / max_exp, base);
                        }
                    }

                    if (selectedTrack && layer.compounds.length <=0) {
                        let compounds = selectedTrack.getOligosInRange(attribution_site - window, attribution_site + window)
                        for (let c of compounds) {
                            let cpts = pts.filter(point => point.x >= c.xi && point.x < c.xf);
                            let sum = 0;
                            for (let val of cpts) {
                                sum += val.y;
                            }
                            console.log ( " comp0ound "+ sum );
                            sum = parseFloat(sum.toFixed(2));
                            layer.compounds.push({
                                id:c.id,
                                xi:c.xi,
                                xf:c.xf,
                                y: c.y,
                                v:sum
                            });
                        }
                        layer.compounds = layer.compounds.sort((a, b) => {
                            if (a.v< b.v) {
                                return -1;
                            }
                            if (a.v > b.v) {
                                return 1;
                            }
                            return 0;
                        });
                    }

                    selectedTrack.addLayer(layer);

                    let button_canvas = await exec('screen/controls/navigation-panel.js', graph)

                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

                },
                move: () => {
                    log('')
                }
            })
        if (selectedTrack)
            graph.showMenu(menuList, x, y, 300)
    })

}
