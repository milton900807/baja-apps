function (graph, genegraph_panel_layout) {
    let attr_window = 720;

    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })

    let selectedTrack = null;
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.track[p_trackIndex])
                graph.track[p_trackIndex].showResizeBar = true;
            return;
        }
    })
    graph.addMouseDownListener(async (x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        if (!selectedTrack) {
            return;
        }
        let xwc = selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2)

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

        let donorsite = selectedTrack.getNearestAnnotation('Donor-Splice-Site', xwc);
        let acceptorsite = selectedTrack.getNearestAnnotation('Acceptor-Splice-Site', xwc);

        menuList.push({
            label: acceptor_message,
            click: async (x, y) => {
                let progressBar;

                let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                let m = va['Window']
                if (m === null) {
                    attr_window = 720
                } else {
                    attr_window = parseInt(m);
                }

                graph.pushOntoHistory();

                let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                let donor_attrbution_ht = '/ljdonor/v1/models/donor_attributor:predict';

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
                let data = {
                    "signature_name": "serving_default",
                    inputs: {
                        "sequence": [selectedTrack.sequence.slice(attribution_site - selectedTrack.xi - attr_window,
                            attribution_site - selectedTrack.xi + attr_window)],
                        "xi": [attribution_site - attr_window],
                        "xf": [attribution_site + attr_window],
                        "strand": [selectedTrack.strand],
                        "attribution_site": [attribution_site],
                    }
                }
                console.log(data)
                console.log(donor_attrbution_ht)
                let strack = selectedTrack
                let res = await POSTJSON({
                    "signature_name": "serving_default",
                    inputs: {
                        "sequence": [selectedTrack.sequence.slice(attribution_site - selectedTrack.xi - attr_window, attribution_site - selectedTrack.xi + attr_window)],
                        "xi": [attribution_site - attr_window],
                        "xf": [attribution_site + attr_window],
                        "strand": ['' + selectedTrack.strand],
                        "attribution_site": [attribution_site],
                    }
                }, donor_attrbution_ht)

                if (!(res) || (!res.outputs) || (!res.outputs.log_odds_ratios)) {
                    graph.setError(' Failed to run splicing on the current site ' + attribution_site);
                    return;
                }

                let attribution_scores = res.outputs.log_odds_ratios
                let attribution_indices = res.outputs.out_indices

                let layer = new AttributionLayer(closest_acceptor.name + '_acc_attribution', strack.xi, 0, strack.xf, 1, 'acceptor_attribution', attribution_site, attr_window, strack);
                let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))
                if (!max_exp) {
                    max_exp = 1.
                }
                max_exp = max_exp * -2;
                for (let [i, s] of attribution_indices.map((e, _i) => [e, -1 * attribution_scores[_i]])) {
                    if (i != -1) {
                        base = strack.sequence[i - strack.xi]

                        layer.addAttributionPoint(i, s / max_exp, base);
                    }
                }

                if (strack) {
                    strack.addLayer(layer);
                    let button_canvas = await exec('screen/controls/navigation-panel.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                }
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

                    let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                    let m = va['Window']
                    if (m === null) {
                        attr_window = 720
                    } else {
                        attr_window = parseInt(m);
                    }

                    graph.pushOntoHistory();

                    if (!selectedTrack) {
                        graph.setMessage(" Track is not selected ")
                        return;
                    }

                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', w);
                    let AttributionLayer = await exec('baja/bio/attribution-layer.js');

                    let strack = selectedTrack;

                    try {

                        let acceptor_att_ht = '/ljacceptor/v1/models/acceptor_attributor:predict';

                        let attribution_site = null;
                        if (strack.strand == 1) {
                            attribution_site = closest_donor.xf + 1;
                        } else {
                            attribution_site = closest_donor.xi;
                        }
                        let data = {
                            "signature_name": "serving_default",
                            inputs: {
                                "sequence": [strack.sequence.slice(attribution_site - strack.xi - attr_window,
                                    attribution_site - strack.xi + attr_window)],
                                "xi": [attribution_site - attr_window],
                                "xf": [attribution_site + attr_window],
                                "strand": ['' + strack.strand],
                                "attribution_site": [attribution_site],
                            }
                        }

                        let _res = await POSTJSON(data, acceptor_att_ht);
                        let attribution_scores = _res.outputs.log_odds_ratios
                        let attribution_indices = _res.outputs.out_indices
                        console.log(attribution_scores)
                        console.log(_res.outputs.out_scores)
                        let layer = new AttributionLayer(closest_acceptor.name + '_don_attribution', strack.xi, 0, strack.xf, 1, 'donor_attribution', attribution_site, attr_window, strack);
                        let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))

                        if (!max_exp) {
                            max_exp = 1.
                        }
                        max_exp = max_exp * -2;

                        for (let [i, s] of attribution_indices.map((e, _i) => [e, attribution_scores[_i]])) {
                            if (i != -1) {
                                base = strack.sequence[i - strack.xi]

                                layer.addAttributionPoint(i, s / max_exp, base);
                            }
                        }

                        if (strack && layer.compounds.length <= 0) {
                            let compounds = await strack.getOligosInRange(attribution_site - attr_window, attribution_site + attr_window)
                            for (let c of compounds) {
                                let pts = [].concat(layer.apts, layer.tpts, layer.cpts, layer.gpts)
                                let cpts = await pts.filter(point => point.x >= c.xi && point.x < c.xf);
                                if (cpts.length > 0) {
                                    let sum = 0;
                                    for (let val of cpts) {
                                        sum -= val.y;
                                    }

                                    sum = parseFloat(sum.toFixed(4));

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

                        strack.addLayer(layer);

                    } catch (exception) {
                        console.log(' Error running the attribution scrores ')
                        graph.setError(exception);
                    }

                    let button_canvas = await exec('screen/controls/navigation-panel.js', graph)

                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

                },
                move: () => {
                    log('')
                }
            },

        )

        if (donorsite) {
            menuList.push(
                {
                    label: 'D: ' + donorsite.name + ' ' + donorsite.xi,
                    click: async (xwc, ywc) => {
                        let w = {
                            wid: 'working',
                            'message': ' Executing LJSplice...'
                        }

                        let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                        let m = va['Window']
                        if (m === null) {
                            attr_window = 720
                        } else {
                            attr_window = parseInt(m);
                        }

                        graph.pushOntoHistory();

                        if (!selectedTrack) {
                            graph.setMessage(" Track is not selected ")
                            return;
                        }

                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', w);
                        let AttributionLayer = await exec('baja/bio/attribution-layer.js');

                        let strack = selectedTrack;
                        try {

                            let acceptor_att_ht = '/ljacceptor/v1/models/acceptor_attributor:predict';

                            let attribution_site = donorsite.xi;
                            if (strack.strand == 1) {

                            } else {
                                attribution_site = donorsite.xf;
                            }
                            let data = {
                                "signature_name": "serving_default",
                                inputs: {
                                    "sequence": [strack.sequence.slice(attribution_site - strack.xi - attr_window,
                                        attribution_site - strack.xi + attr_window)],
                                    "xi": [attribution_site - attr_window],
                                    "xf": [attribution_site + attr_window],
                                    "strand": ['' + strack.strand],
                                    "attribution_site": [attribution_site],
                                }
                            }

                            let _res = await POSTJSON(data, acceptor_att_ht);
                            let attribution_scores = _res.outputs.log_odds_ratios
                            let attribution_indices = _res.outputs.out_indices
                            console.log(attribution_scores)
                            console.log(_res.outputs.out_scores)
                            let layer = new AttributionLayer(donorsite.name + '_' + attribution_site + '_don_attribution', strack.xi, 0, strack.xf, 1, 'donor_attribution', attribution_site, attr_window, strack);
                            let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))

                            if (!max_exp) {
                                max_exp = 1.
                            }
                            max_exp = max_exp * -2;

                            for (let [i, s] of attribution_indices.map((e, _i) => [e, attribution_scores[_i]])) {
                                if (i != -1) {
                                    base = strack.sequence[i - strack.xi]

                                    layer.addAttributionPoint(i, s / max_exp, base);
                                }
                            }

                            if (strack && layer.compounds.length <= 0) {
                                let compounds = await strack.getOligosInRange(attribution_site - attr_window, attribution_site + attr_window)
                                for (let c of compounds) {
                                    let pts = [].concat(layer.apts, layer.tpts, layer.cpts, layer.gpts)
                                    let cpts = await pts.filter(point => point.x >= c.xi && point.x < c.xf);
                                    if (cpts.length > 0) {
                                        let sum = 0;
                                        for (let val of cpts) {
                                            sum -= val.y;
                                        }

                                        sum = parseFloat(sum.toFixed(4));

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

                            strack.addLayer(layer);

                        } catch (exception) {
                            console.log(' Failde to run the attribution scroree' + exception)

                            graph.setError(' Failed to run ' + donorsite.name)
                        }

                        let button_canvas = await exec('screen/controls/navigation-panel.js', graph)

                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

                    },
                    move: () => {
                        log('')
                    }
                })
        }

        if (acceptorsite != null)
            menuList.push(
                {
                    label: 'A: ' + acceptorsite.name + ' ' + acceptorsite.xi,
                    click: async (x, y) => {
                        let progressBar;

                        let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                        let m = va['Window']
                        if (m === null) {
                            attr_window = 720
                        } else {
                            attr_window = parseInt(m);
                        }
                        graph.pushOntoHistory();
                        let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                        let donor_attrbution_ht = '/ljdonor/v1/models/donor_attributor:predict';

                        let w = {
                            wid: 'working',
                            'message': ' Executing LJSplice...'
                        }
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', w);
                        let attribution_site = acceptorsite.xi;
                        if (selectedTrack.strand == 1) {
                            attribution_site + 2;
                        } else {
                            attribution_site.xf - 1;
                        }
                        let data = {
                            "signature_name": "serving_default",
                            inputs: {
                                "sequence": [selectedTrack.sequence.slice(attribution_site - selectedTrack.xi - attr_window,
                                    attribution_site - selectedTrack.xi + attr_window)],
                                "xi": [attribution_site - attr_window],
                                "xf": [attribution_site + attr_window],
                                "strand": [selectedTrack.strand],
                                "attribution_site": [attribution_site],
                            }
                        }
                        console.log(data)
                        console.log(donor_attrbution_ht)
                        let strack = selectedTrack
                        let res = await POSTJSON({
                            "signature_name": "serving_default",
                            inputs: {
                                "sequence": [selectedTrack.sequence.slice(attribution_site - selectedTrack.xi - attr_window, attribution_site - selectedTrack.xi + attr_window)],
                                "xi": [attribution_site - attr_window],
                                "xf": [attribution_site + attr_window],
                                "strand": ['' + selectedTrack.strand],
                                "attribution_site": [attribution_site],
                            }
                        }, donor_attrbution_ht)

                        if (!(res) || (!res.outputs) || (!res.outputs.log_odds_ratios)) {
                            graph.setError(' Failed to run splicing on the current site ' + attribution_site);
                            return;
                        }

                        let attribution_scores = res.outputs.log_odds_ratios
                        let attribution_indices = res.outputs.out_indices

                        let layer = new AttributionLayer(acceptorsite.name + '_' + attribution_site, strack.xi, 0, strack.xf, 1, 'acceptor_attribution', attribution_site, attr_window, strack);
                        let max_exp = Math.max(...attribution_scores.map((s) => Math.floor(s)))
                        if (!max_exp) {
                            max_exp = 1.
                        }
                        max_exp = max_exp * -2;
                        for (let [i, s] of attribution_indices.map((e, _i) => [e, -1 * attribution_scores[_i]])) {
                            if (i != -1) {
                                base = strack.sequence[i - strack.xi]

                                layer.addAttributionPoint(i, s / max_exp, base);
                            }
                        }

                        if (strack) {
                            strack.addLayer(layer);
                            let button_canvas = await exec('screen/controls/navigation-panel.js', graph)
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                        }
                    },
                    move: () => {
                        log('')
                    }
                })

        if (selectedTrack) {
            graph.showMenu(menuList, x, y, 300)
            let button_canvas_ = await exec('screen/controls/navigation-panel.js', graph)
            CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);
        }
    })

}
