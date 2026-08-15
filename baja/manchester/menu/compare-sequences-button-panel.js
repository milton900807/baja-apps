function (graph, genegraph_panel_layout) {

    let query = null;
    let target = null;

    let plates_panel;
    let platePanel = createIonFunction((p) => {
        plates_panel = p;
    })

    let updateHTML = () => {
        if (query && target) {
            plates_panel.setHTML(`Query ${query.name}  --> Target ${target.name}`)
        } else if (query) {
            plates_panel.setHTML(`Query ${query.name}  --> click on a target track`)
        } else {
            if (target)
                plates_panel.setHTML(`click on a query track  --> Target ${target.name}`)
        }
    }

    let mode = null;
    let html = {
        wid: 'html',
        refCallback: platePanel,
        data: ' Select a target and query sequence'
    }

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'grid': {
                xmin: 0,
                xmax: 4,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: 'Query', ionFunction: createIonFunction(() => {
                        let track = null;
                        mode = 'query'
                        graph.setMessage("Click on a track");
                        graph.addMouseDownListener(async (x, y) => {
                            if (mode === 'query')
                                query = track;
                            if (query) {
                                graph.setMessage(' ' + query.name)
                            }
                            updateHTML();

                        })
                        graph.addMouseMoveListener((x, y) => {
                            if (graph.menuVisible()) {
                                return;
                            }
                            graph.selectOff();
                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                track = graph.track[trackIndex]
                                if (track)
                                    track.select();
                            }
                        })
                        graph.addMouseUpListener((x, y) => {
                            updateHTML();

                        });
                    })
                },
                {
                    x: 1, y: 0, label: 'Target', ionFunction: createIonFunction(() => {
                        let track = null;
                        mode = 'target'
                        graph.setMessage("Click on a target track");
                        graph.addMouseDownListener(async (x, y) => {

                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                track = graph.track[trackIndex]
                                if (track)
                                    track.select();
                            }

                            if (mode === 'target')
                                target = track;
                            if (target) {
                                graph.setMessage(' ' + target.name)
                            }
                            updateHTML();

                        })
                        graph.addMouseMoveListener((x, y) => {
                            graph.selectOff();
                            let trackIndex = graph.getTrack(x, y)
                            if (trackIndex >= 0) {
                                track = graph.track[trackIndex]
                                if (track)
                                    track.select();
                            }
                        })
                        graph.addMouseUpListener((x, y) => {

                            updateHTML();

                        });

                    })
                },
                {
                    x: 2, y: 0, label: 'Run', ionFunction: createIonFunction(async () => {

                        let engineMonitor = new EngineMonitor((msg) => {
                            plates_panel.setHTML(msg)

                        });

                        let vo = await exec('py/bio/find-oligo-in-two-transcripts.py', engineMonitor, query.sequence, target.sequence);
                        showModal({
                            wid: 'json',
                            data: JSON.stringify(vo)
                        })

                    })
                }
            ]
        }
    }

    let chemistry_tab = {
        wid: 'card',
        data: {
            "style.padding-top": '10px',
            cards: [
                [
                    {
                        'width': '100%',
                        'component': html
                    },
                    {
                        'width': '100%',
                        'component': button_canvas
                    }
                ]]
        }
    }
    return chemistry_tab;
}
