function (graph, genegraph_panel_layout, selectedTrack, start, end, gx, gy) {

    return new Promise(async (resolve, reject) => {
        let track_list = []
        let content = {}
        let b = []
        let bc = {}
        if (!start) {
            start = selectedTrack.xi;
        }
        if (!end) {
            end = selectedTrack.xf
        }
        for (let tl of selectedTrack.track_layers) {
            b.push('PCA on target sequence ' + tl.name);
        }
        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: track_list,
                contentItems: content,
                button_function: createIonFunction(async (items) => {

                    for (let trackLayer of track.track_layers) {
                        if (trackLayer.name === items[0]) {
                            let tl = await exec('baja/manchester/menu/select-track-layer-edit-panel', track, trackLayer, genegraph_panel_layout)
                        }
                    }

                })
            }
        }

        let selectedTrackLayer = null;
        if (selectedTrack.track_layers.length === 1) {
            selectedTrackLayer = selectedTrack.track_layers[0]
        }
        let TrackLayer = await exec('baja/bio/track-layer.js')

        let tt = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: b,
                contentItems: bc,
                button_function: createIonFunction(async (items) => {
                    let words = items[0].trim().replace(/[.!?]$/, '').split(/\s+/);
                    let lastword = words[words.length - 1];

                    if (items[0].startsWith('PCA on target sequence ')) {
                        let name = items[0].substring(items[0].indexOf('PCA on target sequence ') + 23)
                        for (let trackLayer of selectedTrack.track_layers) {

                            if (name.trim().toLowerCase() === (trackLayer.name.trim().toLowerCase())) {

                                selectedTrackLayer = trackLayer;
                                break;
                            }
                        }
                    }
                })
            }
        }

        let html = `<hr>

        This will traverse the transcript sequence with a increment window size (defined below) and only including increments where the center of the sequence overlaps with center of the anotations defined in the track layer (defined below)

        <p>
        1.  Select an window size
        2.  Select a track layer

        <h2> </h2>`

        let window = 100;

        let html3 = '<hr> <h2> Select track layer </h2>'
        let wg = {
            wid: 'card',
            componentRef: 'bt',
            data: {
                height: '500px',
                cards: [
                    [

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
                                            label: 'Return to design', ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        }
                                    ]
                                }
                            }
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html}`
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': tt
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html3}`
                            }
                        },

                        {
                            'width': '100%',
                            "style.padding-top": '4px',
                            "style.border": '1px',
                            "title": "Window size:",
                            'component':
                            {
                                'wid': 'input-textfield',
                                'data': {
                                    'text': '100',
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {
                                        console.log(" we have th enew number " + w)
                                        window = (w);
                                    }),
                                }
                            }
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': t
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [

                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },

                                        {
                                            label: 'Run..', ionFunction: createIonFunction(async () => {

                                                let MGrid = await exec('flexigraph/grid.js')
                                                let layer = new TrackLayer(selectedTrack.name + 'ml-layer',
                                                    selectedTrack.tgraph.xmin, 0, selectedTrack.tgraph.xmax, 1)
                                                layer.setDefaultColor("rgba(0,100,255,0.3")

                                                if (!selectedTrackLayer) {
                                                    alert(' Please select a track layer ')
                                                }
                                                let intervals = selectedTrackLayer.intervals;
                                                let vinter = [];
                                                let increment = window.getWidgetValue();
                                                increment = parseInt(increment);

                                                for (let i = start; i < end; i += increment) {
                                                    let overlappingIntervals = intervals.filter(interval =>
                                                        interval.x1 < i + increment && interval.x2 > i
                                                    );

                                                    for (let interval of overlappingIntervals) {
                                                        let center = (interval.x1 + interval.x2) / 2;
                                                        let windowStart = center - (increment / 2);
                                                        let windowEnd = center + (increment / 2);

                                                        let seqRange = selectedTrack.getSequenceRange(windowStart, windowEnd);
                                                        if (seqRange.length === increment) {
                                                            let newInterval = { ...interval };
                                                            newInterval['seq'] = seqRange;
                                                            newInterval['trk'] = selectedTrack.id;
                                                            vinter.push(newInterval);
                                                        }
                                                    }
                                                }

                                                let r = await exec('py/tracks/cluster-intervals.py', vinter)
                                                let PCAPlot = await exec("flexigraph/pca-plot.js");

                                                let sw = 300;

                                                const grid = new MGrid(gx, gy, sw, sw);
                                                if (r != null) {
                                                    let pcaplot = new PCAPlot(r, grid);
                                                    pcaplot.layers.push ( layer )
                                                    if (gx && gy) {
                                                        pcaplot.x = gx;
                                                        pcaplot.y = gy;
                                                    }

                                                    pcaplot.name = selectedTrack.name + ': ' + selectedTrack.description
                                                    if (!graph.plots) {
                                                        graph.plots = []
                                                    }
                                                    graph.plots.push(pcaplot)
                                                } else {

                                                    graph.setMessage(" No values found for these params")

                                                }

                                                selectedTrack.addLayer(layer)

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                graph.setMouseMode("navigation")
                                            })
                                        }

                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', wg);

    })

}
