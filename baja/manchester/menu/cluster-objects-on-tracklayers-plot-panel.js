function (graph, genegraph_panel_layout, plot, selectedTrack, start, end) {

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
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', tl);
                        }
                    }
                })
            }
        }

        let tt = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: b,
                contentItems: bc,
                button_function: createIonFunction(async (items) => {
                    let MGrid = await exec('flexigraph/grid.js')
                    let words = items[0].trim().replace(/[.!?]$/, '').split(/\s+/);
                    let lastword = words[words.length - 1];

                    if (items[0].startsWith('PCA on target sequence ')) {
                        let name = items[0].substring(items[0].indexOf('PCA on target sequence ') + 23)
                        for (let trackLayer of selectedTrack.track_layers) {
                            if (name.trim().toLowerCase() === (trackLayer.name.trim().toLowerCase())) {
                                let intervals = trackLayer.intervals;
                                let vinter = []
                                for (let i of intervals) {
                                    if (i.x1 < end && i.x2 < end && i.x1 > start && i.x2 > start) {
                                        i['seq'] = selectedTrack.getSequenceRange(i.x1, i.x2)
                                        i['trk'] = selectedTrack.id
                                        vinter.push(i)
                                    }
                                }
                                let r = await exec('py/tracks/cluster-intervals.py', vinter)
                                let PCAPlot = await exec("flexigraph/pca-plot.js");
                                let sw = graph.screenHeight(10);
                                const grid = new MGrid(selectedTrack.tgraph.xi, (selectedTrack.tgraph.yi), sw, sw);
                                if (!graph.plots) {
                                    graph.plots = []
                                }
                                if (r.points && r.points.length > 0) {
                                    if (!plot) {
                                        plot = new PCAPlot(r, grid);
                                        plot.name = selectedTrack.name + ';' + selectedTrack.description
                                        graph.plots.push(plot)
                                    } else {
                                        plot.append(r)
                                        graph.setMessage ( "Appended " +  r.points.length + ".")

                                    }
                                } else {
                                    graph.setMessage ( "No data points were added.")
                                }
                            }
                        }
                    }
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                })
            }
        }

        let html = '<hr> <h2> Attribute Types </h2>'
        let html3 = '<hr> <h2>Track Layers. </h2>'
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
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
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
                                wid: 'title',
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
                                wid: 'title',
                                data: `${html3}`
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
                                            label: 'Hide All', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.visible = false;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Interaction off', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.interactive = false;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Interaction on', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.interactive = true;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Show All', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.visible = true;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
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
