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
                        // the variant itself (this used to pass its phase, which is not a mutation)
                        const __pepBefore = selectedTrack.orf && selectedTrack.orf.sequence;
                        try { graph.pushOntoHistory(); } catch (e) { }
                        selectedTrack.mutateTrackWithSingleMutation(snpindel)
                        await exec('baja/bio/orfs/refresh-orf-after-mutation.js', selectedTrack, graph, __pepBefore);
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
                                // Opens its list at once, not on a timer: a floating menu (the one a click on
                                // the exon opens) ends its session ~80 ms after an item's click returns unless
                                // that item opened another menu, so a list opened 100 ms later landed in the
                                // side panel instead of in place.
                                'label': 'AI Models', click: (async () => {
                                    {

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
                                                // The BajaSplice models (py/bajasplice-lib, py/bajair-lib), run on THIS
                                                // exon, in place of the old LJSplice v2 window. Each entry hands the track
                                                // and the exon to the same script the Models library runs, so nothing asks
                                                // for a second click on the track.
                                                label: 'BajaSplice \u25b8',
                                                click: async (xwc, ywc) => {
                                                    if (!selectedTrack) {
                                                        graph.setMessage(" No track selected ");
                                                        return;
                                                    }
                                                    const lo = Math.min(+annotation.xi, +annotation.xf);
                                                    const hi = Math.max(+annotation.xi, +annotation.xf);
                                                    // Which end is which flips with the strand (the same rule cis-attribution.js uses).
                                                    const plus = +selectedTrack.strand >= 0;
                                                    const acceptorAt = Math.round(plus ? +annotation.xi : +annotation.xf);
                                                    const donorAt = Math.round(plus ? +annotation.xf : +annotation.xi);
                                                    const run = (path, ...args) => {
                                                        try { graph.showSideMenu(null); } catch (e) { }
                                                        Promise.resolve(exec(path, graph, genegraph_panel_layout, selectedTrack, ...args))
                                                            .catch((e) => { try { graph.setMessage(' BajaSplice: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { } });
                                                    };
                                                    graph.showSideMenu([
                                                        {
                                                            label: 'Splice-site strength (SpliceNet)',
                                                            click: () => run('baja/bio/splicing/splicing-profile.js', { start: lo, end: hi }, 'sites'),
                                                            move: () => log('')
                                                        },
                                                        {
                                                            label: 'Exon inclusion, PSI (PSINet)',
                                                            click: () => run('baja/bio/splicing/splicing-profile.js', null, 'psi'),
                                                            move: () => log('')
                                                        },
                                                        {
                                                            label: 'Cis-regulatory windows at the acceptor',
                                                            click: () => run('baja/bio/splicing/cis-attribution.js', { site: acceptorAt, which: 'acceptor' }),
                                                            move: () => log('')
                                                        },
                                                        {
                                                            label: 'Cis-regulatory windows at the donor',
                                                            click: () => run('baja/bio/splicing/cis-attribution.js', { site: donorAt, which: 'donor' }),
                                                            move: () => log('')
                                                        },
                                                        {
                                                            label: 'Intron retention (BajaIR)',
                                                            click: () => run('baja/bio/splicing/intron-retention.js'),
                                                            move: () => log('')
                                                        }
                                                    ]);
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

                                    }

                                })
                            },
                            {
                                // What skipping this exon would do, before doing it: coding or UTR, in frame or
                                // a frameshift, where the stop falls, and whether that mRNA is an NMD target
                                // or is predicted to make protein. Read-only; Remove exon applies the same
                                // analysis (baja/bio/orfs/exon-removal-impact.js), so the two agree.
                                label: 'Predict effect of removing',
                                click: async (xwc, ywc) => {
                                    // The answer opens IN the menu's own panel, where the menu was (a floating
                                    // menu session is still open while this item runs, so showSideMenu below
                                    // draws there), with Remove exon / Back / Close under it. Where no floating
                                    // menu is open (the selection box, a phone) the same list is a side menu.
                                    if (!selectedTrack) { graph.setMessage(" No track selected "); return; }
                                    const esc = (t) => ('' + t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
                                    // Plain-text labels of the result rows. The menu orderer (gene.js __orderMenu) moves
                                    // any row whose label holds Back / Cancel / Close / Done to the bottom as navigation;
                                    // a zero-width space inside those words keeps a sentence where it was written.
                                    const plain = (t) => ('' + t).replace(/\b(back|cancel|close|done)\b/gi, (w) => w[0] + '\u200b' + w.slice(1));
                                    let r = null;
                                    try { r = await exec('baja/bio/orfs/exon-removal-impact.js', selectedTrack, annotation); } catch (e) { r = null; }
                                    const title = 'Effect of removing ' + (annotation.name || 'this exon');
                                    const back = { label: '\u2039 Back', click: () => { graph.showSideMenu(t); }, move: () => { } };
                                    const close = { label: 'Close', click: () => { graph.showSideMenu(null); }, move: () => { } };
                                    if (!r || !r.ok) {
                                        const why = (r && r.reason) || 'Could not assess this exon.';
                                        graph.showSideMenu([{ type: 'html', label: plain(why), html: esc(why) }, { type: 'separator' }, back, close], null, title);
                                        return;
                                    }
                                    const verdict = {
                                        'nmd': ['#c0392b', 'PTC \u2192 NMD predicted'],
                                        'nmd-maybe-escape': ['#d97706', 'PTC \u2192 NMD likely, may be incomplete'],
                                        'nonstop': ['#c0392b', 'No stop \u2192 non-stop decay'],
                                        'escapes': ['#15803d', 'Escapes NMD \u2192 protein expected'],
                                        'as-original': ['#2563eb', 'In frame \u2192 NMD status as the original']
                                    }[r.nmd] || (r.outcome === 'unchanged' ? ['#475569', 'Protein unchanged']
                                        : (r.outcome === 'start-lost' ? ['#c0392b', 'Start codon lost'] : ['#475569', 'See notes']));
                                    const chip = '<span style="display:inline-block;padding:2px 9px;border-radius:10px;background:' + verdict[0]
                                        + ';color:#fff;font-size:11.5px;font-weight:700">' + esc(verdict[1]) + '</span>';
                                    const lens = (r.outcome !== 'start-lost' && r.oldLength)
                                        ? '<div style="margin-top:6px;color:#9fc4d4">Protein: ' + r.oldLength + ' aa \u2192 ' + (r.newLength || 0) + ' aa</div>' : '';
                                    const body = chip
                                        + '<div style="margin-top:8px;font-weight:600">' + esc(r.headline) + '</div>' + lens;
                                    const notes = '<ul style="margin:0 0 0 16px;padding:0">'
                                        + r.lines.map((l) => '<li style="margin:3px 0">' + esc(l) + '</li>').join('') + '</ul>';
                                    const foot = '<div style="font-size:11px;color:#9fc4d4">Translation from the annotated start codon to the first in-frame stop over the remaining exons. '
                                        + 'NMD by the 50\u201355 nt rule, with start-proximal and long-exon exceptions. A prediction, not a measurement.</div>';
                                    const removeItem = (t || []).find((it) => it && it.label === 'Remove exon');
                                    graph.showSideMenu([
                                        { type: 'html', label: plain(verdict[1] + '. ' + r.headline), html: body },
                                        { type: 'separator' },
                                        { type: 'html', label: plain(r.lines.join(' ')), html: notes },
                                        { type: 'html', label: 'A prediction, not a measurement.', html: foot },
                                        { type: 'separator' },
                                        ...(removeItem ? [{ label: 'Remove exon', emphasis: 'danger', click: removeItem.click, move: () => { } }] : []),
                                        back,
                                        close
                                    ], null, title);
                                },
                                move: () => {
                                    log('')
                                }
                            },
                            {
                                // AG SCANNING -- the mechanism a splice-redirection ASO depends on.
                                // Destroy the exon's authentic 3' acceptor and the spliceosome, already
                                // committed to the branch point, scans downstream and splices at the first
                                // AG it meets: the exon keeps its donor and loses its 5' end. This shows
                                // which AG that is, what the exon becomes, and what the protein does, then
                                // applies it.
                                label: 'Redirect acceptor (AG scan)',
                                click: async (xwc, ywc) => {
                                    if (!selectedTrack) { graph.setMessage(" No track selected "); return; }
                                    const esc = (t) => ('' + t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
                                    // __orderMenu moves any row whose label holds Back / Cancel / Close / Done
                                    // to the bottom as navigation; a zero-width space keeps a sentence put.
                                    const plain = (t) => ('' + t).replace(/\b(back|cancel|close|done)\b/gi, (w) => w[0] + '\u200b' + w.slice(1));
                                    const title = 'Redirect the acceptor of ' + (annotation.name || 'this exon');
                                    const back = { label: '\u2039 Back', click: () => { graph.showSideMenu(t); }, move: () => { } };
                                    const close = { label: 'Close', click: () => { graph.showSideMenu(null); }, move: () => { } };
                                    const show = async (pick) => {
                                        let r = null;
                                        try { r = await exec('baja/bio/splicing/ag-scan.js', selectedTrack, annotation, { pick: pick || 0 }); } catch (e) { r = null; }
                                        if (!r || !r.ok) {
                                            const why = (r && r.reason) || 'Could not scan this exon.';
                                            graph.showSideMenu([{ type: 'html', label: plain(why), html: esc(why) }, { type: 'separator' }, back, close], null, title);
                                            return;
                                        }
                                        const c = r.candidates[r.chosen] || null;
                                        const col = { 'nmd': '#c0392b', 'nmd-maybe-escape': '#d97706', 'nonstop': '#c0392b', 'escapes': '#15803d' }[(r.impact || {}).nmd]
                                            || (c && c.inFrame ? '#15803d' : '#d97706');
                                        const chipText = c ? ((c.inFrame ? 'In frame' : 'Frameshift') + ' \u00b7 \u2212' + c.lost + ' nt') : 'No AG downstream';
                                        const chip = '<span style="display:inline-block;padding:2px 9px;border-radius:10px;background:' + col
                                            + ';color:#fff;font-size:11.5px;font-weight:700">' + esc(chipText) + '</span>';
                                        const lens = (r.impact && r.impact.oldLength)
                                            ? '<div style="margin-top:6px;color:#9fc4d4">Protein: ' + r.impact.oldLength + ' aa \u2192 ' + r.impact.newLength + ' aa</div>' : '';
                                        const body = chip + '<div style="margin-top:8px;font-weight:600">' + esc(r.headline) + '</div>' + lens;
                                        const notes = '<ul style="margin:0 0 0 16px;padding:0">'
                                            + r.lines.map((l) => '<li style="margin:3px 0">' + esc(l) + '</li>').join('') + '</ul>';
                                        const foot = '<div style="font-size:11px;color:#9fc4d4">First-AG rule: with the authentic acceptor blocked, '
                                            + 'the spliceosome splices at the first AG downstream of it. A prediction, not a measurement.</div>';
                                        // The AGs after the first one, in case that one is blocked too.
                                        const alts = r.candidates.map((x, i) => (i === r.chosen) ? null : {
                                            label: 'Use the AG ' + x.lost + ' nt in (' + (x.inFrame ? 'in frame' : 'frameshift') + ')',
                                            click: () => { show(i); }, move: () => { }
                                        }).filter(Boolean);
                                        const applyRow = (mutate) => ({
                                            label: mutate ? 'Apply and mutate the authentic AG' : 'Apply the redirection',
                                            emphasis: mutate ? 'danger' : undefined,
                                            move: () => { },
                                            click: async () => {
                                                graph.showSideMenu(null);
                                                try {
                                                    await exec('baja/bio/splicing/apply-ag-scan.js', selectedTrack, annotation, c,
                                                        { graph: graph, mutate: !!mutate, authentic: r.authentic });
                                                } catch (e) { graph.setMessage(' Could not redirect: ' + (e && e.message ? e.message : e) + ' '); }
                                            }
                                        });
                                        graph.showSideMenu([
                                            { type: 'html', label: plain(chipText + '. ' + r.headline), html: body },
                                            { type: 'separator' },
                                            { type: 'html', label: plain(r.lines.join(' ')), html: notes },
                                            { type: 'html', label: 'A prediction, not a measurement.', html: foot },
                                            { type: 'separator' },
                                            ...(c && c.inExon ? [applyRow(false), applyRow(true)] : []),
                                            ...alts,
                                            back,
                                            close
                                        ], null, title);
                                    };
                                    await show(0);
                                },
                                move: () => {
                                    log('')
                                }
                            },
                            {
                                label: 'Remove exon',
                                click: async (xwc, ywc) => {

                                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove this?', async () => {
                                        selectedTrack.removeAnnotation(annotation);
                                        // Re-translate across the exons that remain. generateORF() alone
                                        // rebuilt the old peptide: it splices the CDS annotations, and the
                                        // CDS piece inside the removed exon was still there.
                                        let r = null;
                                        try { r = await exec('baja/bio/orfs/retranslate-after-exon-change.js', selectedTrack, annotation); } catch (e) { r = null; }
                                        if (!r || !r.handled) {
                                            try { selectedTrack.generateORF(); } catch (e) { }
                                        }
                                        try { if (graph.wake) graph.wake(); } catch (e) { }
                                        if (r && r.message) {
                                            try { graph.setResultMessage ? graph.setResultMessage(' ' + r.message + ' ') : graph.setMessage(' ' + r.message + ' '); } catch (e) { }
                                        }
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
