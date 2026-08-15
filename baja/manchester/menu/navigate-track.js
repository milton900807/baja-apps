function (graph) {

    let t = null;
    graph.clearMouseListeners();
    graph.selectOff();
    graph.setMouseMode('none')

    graph.addMouseDownListener(async (x, y) => {
        if (graph.menuVisible()) {
            graph.hideMenu();
            return;
        }

    });
    graph.addMouseMoveListener((x, y) => {

        if (graph.menuVisible()) {
            return;
        }
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            t = graph.track[trackIndex]
            if (t)
                t.select();
        }

    })
    graph.addMouseUpListener(async (x, y) => {
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })

        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            t = graph.track[trackIndex]
            if (t)
                t.select();
        }

        graph.showMenu(

            [
                {
                    label: 'Go to coordinates',
                    click: async () => {

                        if (t) {
                            let zoom_to = {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                data: {
                                    height: '800px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': `  Zoom to:
                                                    `                   ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'input-param-items',
                                                    refCallback: __nameHook,
                                                    data: {
                                                        'input_labels': ['Genomic position'],
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Go', ionFunction: createIonFunction((input_values) => {

                                                                    console.log(" value ")

                                                                    let start = panel.get('Genomic position');
                                                                    if (start.indexOf('..') > 0) {

                                                                        let s = start.substring(0, start.indexOf('.'))
                                                                        let e = start.substring(start.lastIndexOf('.') + 1)
                                                                        s = s.replace(/,/g, '')
                                                                        e = e.replace(/,/g, '')

                                                                        s = +s;
                                                                        e = +e;

                                                                        if (isNaN(s) || isNaN(e)) {
                                                                            alert(' Entered format is incorrect ')

                                                                            return;
                                                                        }

                                                                        if (s < t.tgraph.xmin || e > t.tgraph.xmax) {

                                                                            alert(' The range is outside the range for this track ')
                                                                            if (s < t.tgraph.xmin) {
                                                                                s = t.tgraph.xmin;
                                                                            }
                                                                            if (e > t.tgraph.xmax) {
                                                                                e = t.tgraph.xmax;
                                                                            }
                                                                        }

                                                                        let gx = t.tgraph.X(s);

                                                                        graph.animateTo(gx, t.tgraph.X(e),
                                                                            t.tgraph.Y(-1), t.tgraph.Y(2));

                                                                    } else {
                                                                        let s = start;
                                                                        s = s.replace(/,/g, '')
                                                                        s = +s;
                                                                        if (isNaN(s)) {
                                                                            alert(' Entered format is incorrect: Failed to parse a number ')
                                                                            return;
                                                                        }
                                                                        let end = s + 20;
                                                                        let gx = t.tgraph.X(s);

                                                                        graph.animateTo(gx, t.tgraph.X(end),
                                                                            t.tgraph.Y(-1), t.tgraph.Y(2));
                                                                        hideAllModal();
                                                                    }

                                                                    graph.hideMenu();
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    graph.hideMenu();

                                                                    hideAllModal();
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(zoom_to)

                        }
                    },
                    move: () => {
                    }
                },
                {
                    label: 'Go to Exon coordinates',
                    click: async () => {
                        if (t) {
                            let Annotation = await exec('flexigraph/annotation.js')

                            let TrackLayer = await exec('baja/bio/track-layer.js')
                            let zoom_to = {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                data: {
                                    height: '800px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': `  Zoom to:
                                                    `                   ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'input-param-items',
                                                    refCallback: __nameHook,
                                                    data: {
                                                        'input_labels': ['Genomic position'],
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Go', ionFunction: createIonFunction((input_values) => {

                                                                    console.log(' go ')
                                                                    let start = panel.get('Genomic position');
                                                                    if (start.indexOf('..') > 0) {

                                                                        let s = start.substring(0, start.indexOf('.'))
                                                                        let e = start.substring(start.lastIndexOf('.') + 1)
                                                                        s = s.replace(/,/g, '')
                                                                        e = e.replace(/,/g, '')

                                                                        s = +s;
                                                                        e = +e;

                                                                        if (isNaN(s) || isNaN(e)) {
                                                                            alert(' Entered format is incorrect ')

                                                                            return;
                                                                        }

                                                                        let exons = t.getExons();
                                                                        let nAn = new Annotation()
                                                                        let range = {
                                                                            start: t.xi,
                                                                            end: t.xf,
                                                                        }

                                                                        let layer = new TrackLayer('Lift-over', range.start, 0, range.end, 1)
                                                                        for (let exon of exons) {
                                                                            if (s > exon.gxi && s < exon.gxf) {
                                                                                nAn.xi = exon.xi;
                                                                            }
                                                                            if (e > exon.gxi && e < exon.gxf) {
                                                                                nAn.xf = exon.xf;
                                                                            }
                                                                            if (nAn.xi && nAn.xf)
                                                                                layer.addAnnotation(nAn)

                                                                        }

                                                                        t.addLayer(layer);

                                                                    } else {
                                                                        let s = start;
                                                                        s = s.replace(/,/g, '')
                                                                        s = +s;
                                                                        if (isNaN(s)) {
                                                                            alert(' Entered format is incorrect: Failed to parse a number ')
                                                                            return;
                                                                        }
                                                                        let end = s + 20;
                                                                        let gx = t.tgraph.X(s);

                                                                        graph.animateTo(gx, t.tgraph.X(end),
                                                                            t.tgraph.Y(-1), t.tgraph.Y(2));
                                                                        hideAllModal();
                                                                    }

                                                                    graph.hideMenu();
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    graph.hideMenu();

                                                                    hideAllModal();
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(zoom_to)

                        }
                    },
                    move: () => {
                    }
                },
                {
                    label: 'Base index',
                    click: async () => {
                        let trackIndex = graph.getTrack(x, y);
                        if (trackIndex >= 0) {
                            let t = graph.track[trackIndex]

                            let zoom_to = {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                data: {
                                    height: '800px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': `  Zoom to:
                                                    `                   ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'input-param-items',
                                                    refCallback: __nameHook,
                                                    data: {
                                                        'input_labels': ['Genomic position'],
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Go', ionFunction: createIonFunction((input_values) => {

                                                                    console.log(" value ")

                                                                    if (t.strand < 0) {

                                                                        let start = panel.get('Genomic position');
                                                                        if (start.indexOf('..') > 0) {
                                                                            let s = +start.substring(0, start.indexOf('.'))
                                                                            let e = +start.substring(start.lastIndexOf('.') + 1)
                                                                            s = t.tgraph.xmax - s;
                                                                            e = t.tgraph.xmax - e;
                                                                            graph.animateTo(t.tgraph.X(s), t.tgraph.X(e),
                                                                                t.tgraph.Y(-1), t.tgraph.Y(2));

                                                                        } else {
                                                                            start = +start;
                                                                            start = t.tgraph.xmax - start;

                                                                            start = start - 10;

                                                                            let end = start + 20;
                                                                            let gx = t.tgraph.X(start);
                                                                            graph.animateTo(gx, t.tgraph.X(end),
                                                                                t.tgraph.Y(-1), t.tgraph.Y(2));
                                                                            hideAllModal();
                                                                        }

                                                                    } else {

                                                                        let start = panel.get('Genomic position');
                                                                        if (start.indexOf('..') > 0) {
                                                                            let s = +start.substring(0, start.indexOf('.'))
                                                                            let e = +start.substring(start.lastIndexOf('.') + 1)
                                                                            let gx = t.tgraph.X(s);

                                                                            console.log(' start ' + s + " end " + e)
                                                                            graph.animateTo(t.tgraph.xmin + gx, t.tgraph.xmin + t.tgraph.X(e),
                                                                                t.tgraph.Y(-1), t.tgraph.Y(2));

                                                                        } else {
                                                                            start = +start;
                                                                            start = start - 10;
                                                                            let end = t.tgraph.xmin + start + 20;
                                                                            let gx = t.tgraph.X(t.tgraph.xmin + start);
                                                                            graph.animateTo(gx, t.tgraph.X(end),
                                                                                t.tgraph.Y(-1), t.tgraph.Y(2));
                                                                            hideAllModal();
                                                                        }
                                                                    }

                                                                    graph.hideMenu();
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    graph.hideMenu();

                                                                    hideAllModal();
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(zoom_to)

                        }
                    },
                    move: () => {
                    }
                },
                {

                    label: 'Exon Number',
                    click: async () => {
                        let trackIndex = graph.getTrack(x, y);
                        if (trackIndex >= 0) {
                            let t = graph.track[trackIndex]

                            let zoom_to = {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                data: {
                                    height: '800px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': `  Zoom to:
                                                `                   ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'input-param-items',
                                                    refCallback: __nameHook,
                                                    data: {
                                                        'input_labels': ['Exon Number'],
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Go', ionFunction: createIonFunction((input_values) => {
                                                                    let exons = t.getExons();
                                                                    exons = exons.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });

                                                                    if (t.strand < 0) {
                                                                        exons = exons.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                                                                    }
                                                                    console.log(" navigating ")

                                                                    let start = +panel.get('Exon Number');
                                                                    let index = 1;
                                                                    for (let e of exons) {
                                                                        if (index === start) {
                                                                            graph.animateTo(t.tgraph.X(e.xi), t.tgraph.X(e.xf),
                                                                                t.tgraph.Y(-1), t.tgraph.Y(2));
                                                                            break;
                                                                        }
                                                                        index++;

                                                                    }
                                                                    graph.hideMenu();

                                                                    hideAllModal();

                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    graph.hideMenu();

                                                                    hideAllModal();
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(zoom_to)

                        }
                    },
                    move: () => {
                    }
                },

            ], x, y)

    })
}
