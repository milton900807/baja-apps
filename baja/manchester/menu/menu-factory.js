function () {
    return {
        'Donor-Splice-Site': createIon((annotation, selectedTrack, graph, genegraph_panel_layout) => {

            return [
                {
                    label: 'Run splice donor model',
                    click: async (xwc, ywc) => {
                        if (!selectedTrack) {
                            graph.setMessage(" No track selected ");
                            return;
                        }
                        let attr_window = 720;
                        let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                        let m = va['Window']
                        if (m === null) {
                            attr_window = 720
                        } else {
                            attr_window = parseInt(m);
                            try {
                                let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                                let donor_attrbution_ht = '/ljacceptor/v1/models/acceptor_attributor:predict';
                                let w = {
                                    wid: 'working',
                                    'message': ' Executing LJSplice...'
                                }
                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', {
                                    wid: 'html',
                                    data: ` Depending on the site this can take up to 2 min.`
                                });
                                CurrentLayout.setComponent('labelPanel', w);
                                let attribution_site = annotation.xi;

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

                                if (!(res) || (!res.outputs) || (!res.outputs.log_odds_ratios)) {
                                    graph.setError(' Failed to run splicing on the current site ' + attribution_site);
                                    return;
                                }
                                let attribution_scores = res.outputs.log_odds_ratios
                                let attribution_indices = res.outputs.out_indices

                                let layer = new AttributionLayer(annotation.xi + '_don_attribution_', selectedTrack.xi, 0, selectedTrack.xf, 1,
                                    'donor_attribution', attribution_site, attr_window, selectedTrack);
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
                                            return 1;
                                        }
                                        if (a.v > b.v) {
                                            return -1;
                                        }
                                        return 0;
                                    });
                                }

                                selectedTrack.addLayer(layer);

                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', {
                                    wid: 'html',
                                    data: ` Calculation is complete and track-layer ${layer.name} added.`
                                });

                            } catch (exception) {
                                console.log(' Exceptionj trying to run the attribution scrore ' + exception)
                                graph.setError(exception)
                            }
                        }

                    },
                    move: () => {
                        log('')
                    }
                },
                {
                    label: 'New donor site',
                    click: async (xwc, ywc) => {
                        let exons = selectedTrack.getExons();
                        let f = null;
                        for (let exon of exons) {
                            if (!f) {
                                f = exon;
                            }

                            if (selectedTrack.strand < 0) {
                                if (Math.abs(exon.xi - annotation.xi) < Math.abs(f.xi - annotation.xi)) {
                                    f = exon;
                                }
                            } else {
                                if (Math.abs(exon.xf - annotation.xi) < Math.abs(f.xf - annotation.xf)) {
                                    f = exon;
                                }
                            }
                        }
                        if (selectedTrack.strand < 0) {
                            f.setI(annotation.xi + 2)
                        } else {
                            f.setF(annotation.xi - 1);
                        }
                        selectedTrack.removeAnnotationByType('Translation')
                        selectedTrack.generateORF();
                    },
                    move: () => {
                        log('')
                    }
                },
                {
                    label: 'Delete',
                    click: async (xwc, ywc) => {
                        selectedTrack.removeAnnotation(annotation);
                        selectedTrack.generateORF();
                    },
                    move: () => {
                        log('')
                    }
                }

            ]
        }),

        'rna-binding-analysis-menu': createIon((plot, graph, genegraph_panel_layout) => {

            return [
                {
                    label: 'View data',
                    click: async (xwc, ywc) => {
                        let color = 'black'
                        let color_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'json',
                                                "data": JSON.stringify(plot.getSelectedPoints())

                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `<hr>`
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                                let pts = plot.getSelectedPoints()
                                                                for (let p of pts) {
                                                                    p.rgb = 'rgba(' + color['r'] + ',' + color['g'] + ',' + color['b'] + ',' + color['a'] + ')';
                                                                    p.isSelected = false;
                                                                }
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            })
                                                        },
                                                        {
                                                            label: 'Apply', ionFunction: createIonFunction(() => {
                                                                let pts = plot.getSelectedPoints()
                                                                for (let p of pts) {
                                                                    p.rgb = 'rgba(' + color['r'] + ',' + color['g'] + ',' + color['b'] + ',' + color['a'] + ')';
                                                                    p.isSelected = false;
                                                                    console.log('debubg');
                                                                }

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }

                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', color_panel);
                    },
                    move: () => {
                        log('')
                    }
                },

                {
                    label: 'Assign color',
                    click: async (xwc, ywc) => {

                        let color = 'black'

                        let color_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'color-chooser',
                                                "data": {
                                                    "selectionListener": createIonFunction((_color) => {

                                                        color = _color['rgb']
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `<hr>`
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                                hideAllModal();
                                                            })
                                                        },
                                                        {
                                                            label: 'Apply', ionFunction: createIonFunction(() => {
                                                                let pts = plot.getSelectedPoints()
                                                                for (let p of pts) {
                                                                    p.rgb = 'rgba(' + color['r'] + ',' + color['g'] + ',' + color['b'] + ',' + color['a'] + ')';
                                                                    p.isSelected = false;
                                                                }

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }

                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', color_panel);
                    },
                    move: () => {
                        log('')
                    }

                },

            ]
        }),

        'snpindels': createIon((snpindel, selectedTrack, graph, genegraph_panel_layout) => {

            return [
                {
                    label: 'Splice acceptor impact model',
                    click: async (xwc, ywc) => {
                        if (!selectedTrack) {
                            graph.setMessage(" No track selected ");
                            return;
                        }

                        if (true) {
                            alert(" Currently not available")
                            return;
                        }

                        let attr_window = 720;
                        let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                        let m = va['Window']
                        if (m === null) {
                            attr_window = 720
                        } else {
                            attr_window = parseInt(m);
                        }

                        let ac = annotation;
                        let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                        let donor_attrbution_ht = '/ljdonor/v1/models/donor_attributor:predict';
                        let w = {
                            wid: 'working',
                            'message': ' Executing LJSplice...'
                        }
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', {
                            wid: 'html',
                            data: ` Depending on the site this can take up to 2 min.`
                        });
                        CurrentLayout.setComponent('labelPanel', w);
                        let attribution_site = null;

                        if (selectedTrack.strand == 1) {
                            attribution_site = ac.xi;
                        } else {
                            attribution_site = ac.xf;
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
                        let res = await POSTJSON(data, donor_attrbution_ht)
                        if (!(res) || (!res.outputs) || (!res.outputs.log_odds_ratios)) {
                            graph.setError(' Failed to run splicing on the current site ' + attribution_site);
                            return;
                        }
                        let attribution_scores = res.outputs.log_odds_ratios
                        let attribution_indices = res.outputs.out_indices
                        let layer = new AttributionLayer(ac.xi + '_acc_attribution_', selectedTrack.xi, 0, selectedTrack.xf, 1, 'acceptor_attribution', attribution_site, attr_window, selectedTrack);
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

                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', {
                            wid: 'html',
                            data: ` Calculation is complete and track-layer ${layer.name} added.`
                        });

                    }

                    ,
                    move: () => {
                        log('')
                    }
                },
                {
                    label: 'Mutate track sequence',
                    click: async (xwc, ywc) => {
                        selectedTrack.mutateTrackWithSingleMutation(snpindel.phase)
                    },
                    move: () => {
                        log('')
                    }
                },
                {
                    label: 'Delete',
                    click: async (xwc, ywc) => {
                    },
                    move: () => {
                        log('')
                    }
                },
                {
                    label: 'Delete all other',
                    click: async (xwc, ywc) => {
                        selectedTrack.removeAnnotation(annotation);
                        selectedTrack.generateORF();
                    },
                    move: () => {
                        log('')
                    }
                }

            ]
        })
        ,

        'Acceptor-Splice-Site': createIon((annotation, selectedTrack, graph, genegraph_panel_layout) => {
            return [
                {
                    label: 'Run splice acceptor model',
                    click: async (xwc, ywc) => {
                        if (!selectedTrack) {
                            graph.setMessage(" No track selected ");
                            return;
                        }
                        let attr_window = 720;
                        let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                        let m = va['Window']
                        if (m === null) {
                            attr_window = 720
                        } else {
                            attr_window = parseInt(m);
                        }

                        let ac = annotation;
                        let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                        let donor_attrbution_ht = '/ljdonor/v1/models/donor_attributor:predict';
                        let w = {
                            wid: 'working',
                            'message': ' Executing LJSplice...'
                        }
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', {
                            wid: 'html',
                            data: ` Depending on the site this can take up to 2 min.`
                        });
                        CurrentLayout.setComponent('labelPanel', w);
                        let attribution_site = null;

                        if (selectedTrack.strand == 1) {
                            attribution_site = ac.xi;
                        } else {
                            attribution_site = ac.xf;
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

                        let res = await POSTJSON(data, donor_attrbution_ht)

                        if (!(res) || (!res.outputs) || (!res.outputs.log_odds_ratios)) {
                            graph.setError(' Failed to run splicing on the current site ' + attribution_site);
                            return;
                        }

                        let attribution_scores = res.outputs.log_odds_ratios
                        let attribution_indices = res.outputs.out_indices

                        let layer = new AttributionLayer(ac.xi + '_acc_attribution_', selectedTrack.xi, 0, selectedTrack.xf, 1, 'acceptor_attribution', attribution_site, attr_window, selectedTrack);
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

                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', {
                            wid: 'html',
                            data: ` Calculation is complete and track-layer ${layer.name} added.`
                        });

                    }

                    ,
                    move: () => {
                        log('')
                    }
                },
                {
                    label: 'New acceptor site',
                    click: async (xwc, ywc) => {

                        let exons = selectedTrack.getExons();
                        let f = null;
                        for (let exon of exons) {
                            if (!f) {
                                f = exon;
                            }

                            if (selectedTrack.strand < 0) {
                                if (Math.abs(exon.xf - annotation.xi) < Math.abs(f.xf - annotation.xi)) {
                                    f = exon;
                                }
                            } else {
                                if (Math.abs(exon.xi - annotation.xi) < Math.abs(f.xi - annotation.xf)) {
                                    f = exon;
                                }
                            }
                        }
                        if (selectedTrack.strand < 0) {
                            f.setF(annotation.xi)
                        } else {
                            f.setI(annotation.xi + 1);
                        }

                        selectedTrack.removeAnnotationByType('Translation')
                        selectedTrack.generateORF();

                    },
                    move: () => {
                        log('')
                    }
                },
                {
                    label: 'Delete',
                    click: async (xwc, ywc) => {
                        selectedTrack.removeAnnotation(annotation);
                        selectedTrack.generateORF();
                    },
                    move: () => {
                        log('')
                    }
                }

            ]
        }),

        'Exon': createIon((annotation, selectedTrack, graph, genegraph_panel_layout, x) => {
            return [

                {
                    label: 'Exon',
                    click: async (xwc, ywc) => {
                        let t = [
                            {
                                label: 'Exon details',
                                click: async (xwc, ywc) => {
                                    if (!selectedTrack) {
                                        graph.setMessage(" No track selected ");
                                        return;
                                    }
                                    let info = annotation.name + '\n\n';
                                    let diff = Math.abs(annotation.gxf - annotation.gxi)+1;
                                    if (diff % 3 === 0) {
                                        info += ' Exon is in frame. \n'

                                    } else {
                                        info += ' Exon is out of frame. \n'
                                    }

                                    info += ' Total length is ' + diff + ' nt\n'

                                    showModal({
                                        'wid': 'text-editor',
                                        'data': {
                                            'text': info
                                        }
                                    })
                                }
                                ,
                                move: () => {
                                    log('')
                                }
                            },

                            {
                                'label': 'AI Models', click: (async () => {
                                    setTimeout(async () => {

                                        async function runCrypticExonFinder({ graph, selectedTrack, annotation, exec, infoPrompt, scriptPath }) {
                                            if (!selectedTrack) {
                                                graph.setMessage(" No track selected ");
                                                return;
                                            }

                                            graph.showSideMenu(null);

                                            const xi = annotation.xi - 4;
                                            const xf = annotation.xf + 4;

                                            const r = await exec(
                                                scriptPath,
                                                selectedTrack.getSequenceRange(xi, xf),
                                                selectedTrack.chr,
                                                xi,
                                                xf,
                                                selectedTrack.strand
                                            );

                                            const cryptic_exons = await exec('baja/bio/splicing/cryptic-exons');
                                            const g = cryptic_exons.generateCrypticExons(r, { xiAnchor: xi });

                                            for (let cry of g) selectedTrack.add(cry);

                                            if (r && r.status === "file_downloading") {
                                                infoPrompt("Model building; this only needs to happen once but may take several minutes");
                                                return;
                                            }
                                        }

                                        const models = [
                                            {
                                                label: 'LJSplice v2',
                                                click: async (xwc, ywc) => {
                                                    if (!selectedTrack) {
                                                        graph.setMessage(" No track selected ");
                                                        return;
                                                    }
                                                    graph.setMouseMode('none');
                                                    graph.setMessage("Click on a track to plot attributes");
                                                    await exec('baja/bio/splicing/splicing-on-exon.js', graph, selectedTrack, annotation);
                                                },
                                                move: () => log('')
                                            },

                                            {
                                                label: 'Phylon',

                                                click: async (xwc, ywc) => {
                                                    const submenu = [
                                                        {
                                                            label: 'Human',
                                                            click: async () => {
                                                                await runCrypticExonFinder({
                                                                    graph,
                                                                    selectedTrack,
                                                                    annotation,
                                                                    exec,
                                                                    infoPrompt,
                                                                    scriptPath: 'py/splicing/cryptic-exon-finder.py'
                                                                });
                                                            },
                                                            move: () => log('')
                                                        },
                                                        {
                                                            label: 'Mouse',
                                                            click: async () => {
                                                                await runCrypticExonFinder({
                                                                    graph,
                                                                    selectedTrack,
                                                                    annotation,
                                                                    exec,
                                                                    infoPrompt,
                                                                    scriptPath: 'py/splicing/cryptic-exon-finder-mm9.py'
                                                                });
                                                            },
                                                            move: () => log('')
                                                        }
                                                    ];

                                                    graph.showSideMenu(submenu);
                                                },
                                                move: () => log('')
                                            },

                                            {
                                                label: 'Secondary structure',
                                                click: async (xwc, ywc) => {
                                                    if (!selectedTrack) {
                                                        infoPrompt(" No track selected ");
                                                        return;
                                                    }

                                                    if (selectedTrack != null) {
                                                        selectedTrack.markstart = annotation.xi;
                                                        selectedTrack.markend = annotation.xf;

                                                        let sequence = selectedTrack.getHighlightedSequence();
                                                        if (sequence.length > 7000) {
                                                            infoPrompt(" Sequence is too long for the prediction tool (>7kb)");
                                                            return;
                                                        }

                                                        let lb = null;
                                                        let engineMonitor = new EngineMonitor((msg) => {
                                                            lb.setHTML(msg);
                                                        });

                                                        CurrentLayout.setComponent('buttonMenuPanel', {
                                                            wid: 'html',
                                                            refCallback: createIon((p) => {
                                                                lb = p;
                                                            }),
                                                            data: '<font color="blue"> Generating secondary structure.... </font>'
                                                        });

                                                        let t = await selectedTrack.createSecondaryStructure(
                                                            selectedTrack.markstart,
                                                            selectedTrack.getHighlightedSequence(),
                                                            selectedTrack.name,
                                                            engineMonitor
                                                        );
                                                        t.anchorX = selectedTrack.markstart;
                                                        t.xindex_start = selectedTrack.markstart;
                                                        t.tgraph.yi = selectedTrack.tgraph.yi;
                                                        t.anchorY = selectedTrack.tgraph.yi;

                                                        setTimeout(async () => {
                                                            graph.showSideMenu(null);
                                                            graph.setCenterMessage(" Secondary structure is complete ");
                                                        }, 10000);
                                                    } else {
                                                        infoPrompt(" You need to highlight a sequence on a track first.");
                                                    }
                                                },
                                                move: () => log('')
                                            }
                                        ];

                                        graph.showSideMenu(models);

                                    }, 100)

                                })
                            },
                            {
                                label: 'Remove exon',
                                click: async (xwc, ywc) => {

                                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove this?', async () => {
                                        selectedTrack.removeAnnotation(annotation);
                                        selectedTrack.generateORF();
                                    })
                                    await showModal(confirm)

                                }
                                ,
                                move: () => {
                                    log('')
                                }
                            },
                            {
                                label: 'Set exon donor',
                                click: async (xwc, ywc) => {
                                    let startx = 0;
                                    if (selectedTrack.strand < 0) {
                                        startx = annotation.xi;
                                    }
                                    else {
                                        startx = annotation.xf;
                                    }
                                    if (!selectedTrack) {
                                        graph.setMessage(" No track selected ");
                                        return;
                                    }
                                    setTimeout(() => {
                                        graph.addMouseDownListener(async (x, y) => {

                                            if (selectedTrack.strand < 0) {
                                                let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                annotation.xi = wgx;
                                            }
                                            else if (selectedTrack.strand < 0) {
                                                let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                annotation.xf = wgx;
                                            }
                                            setTimeout(() => {
                                                graph.setMessage(" Ctrl+z to undo.", graph.X(x), graph.Y(y) - 30)

                                                graph.setMouseMode('navigate');
                                                selectedTrack.generateORF();

                                            }, 400)
                                        })
                                        graph.addMouseUpListener((x, y) => {

                                        })
                                        graph.addMouseMoveListener((x, y) => {
                                            graph.setMessage(" Click on the new donor site.", graph.X(x), graph.Y(y) - 30)

                                            let ay = graph.Y(selectedTrack.tgraph.Y(annotation.y))
                                            y = graph.Y(y)
                                            if (Math.abs(ay - y) < 100) {
                                                if (selectedTrack.strand < 0) {
                                                    let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                    annotation.xi = wgx;
                                                }
                                                else {
                                                    let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                    annotation.xf = wgx;
                                                }
                                            }
                                            else {
                                                if (selectedTrack.strand < 0) {
                                                    annotation.xi = startx;
                                                }
                                                else {
                                                    annotation.xf = startx;
                                                }
                                            }
                                            selectedTrack.generateORF();

                                        })
                                    }, 1000)

                                }
                                ,
                                move: () => {
                                    log('')
                                }
                            },

                            {
                                label: 'Set exon acceptor',
                                click: async (xwc, ywc) => {
                                    let startx = 0;
                                    if (selectedTrack.strand < 0) {
                                        startx = annotation.xf;
                                    }
                                    else {
                                        startx = annotation.xi;
                                    }
                                    if (!selectedTrack) {
                                        graph.setMessage(" No track selected ");
                                        return;
                                    }
                                    setTimeout(() => {
                                        graph.addMouseDownListener(async (x, y) => {

                                            if (selectedTrack.strand < 0) {
                                                let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                annotation.xf = wgx;
                                            }
                                            else if (selectedTrack.strand < 0) {
                                                let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                annotation.xi = wgx;
                                            }
                                            setTimeout(() => {
                                                graph.setMessage(" Ctrl+z to undo.", graph.X(x), graph.Y(y) - 30)

                                                graph.setMouseMode('navigate');
                                                selectedTrack.generateORF();

                                            }, 400)
                                        })
                                        graph.addMouseUpListener((x, y) => {

                                        })
                                        graph.addMouseMoveListener((x, y) => {
                                            graph.setMessage(" Click on the new acceptor site.", graph.X(x), graph.Y(y) - 30)
                                            let ay = graph.Y(selectedTrack.tgraph.Y(annotation.y))
                                            y = graph.Y(y)
                                            if (Math.abs(ay - y) < 100) {
                                                if (selectedTrack.strand < 0) {
                                                    let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                    annotation.xf = wgx;
                                                }
                                                else {
                                                    let wgx = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                    annotation.xi = wgx;
                                                }
                                            }
                                            else {
                                                if (selectedTrack.strand < 0) {
                                                    annotation.xf = startx;
                                                }
                                                else {
                                                    annotation.xi = startx;
                                                }
                                            }
                                            selectedTrack.generateORF();
                                        })
                                    }, 100)

                                }
                                ,
                                move: () => {
                                    log('')
                                }
                            }

                        ]
                        graph.showSideMenu(t)
                    }
                    ,
                    move: () => {
                        log('')
                    }
                },
            ]

        }),

        'Phylon': createIon( async (annotation, selectedTrack, graph, genegraph_panel_layout, x) => {
            let sub = await exec ( 'baja/manchester/menu/phylon-menu', graph, genegraph_panel_layout)
            return [
                {
                    label: 'Phylon',
                    click: async (xwc, ywc) => {

                        graph.showSideMenu(sub);

                    }
                    ,
                    move: () => {
                        log('')
                    }
                }

            ]

        })

    }
}
