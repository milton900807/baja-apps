function (graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 20,
                'grid': {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 10,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Select all', ionFunction: createIonFunction(() => {

                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')
                            for (let track of graph.track) {
                                track.selectTrackAndSeq();
                            }

                        })
                    },
                    {
                        x: 3, y: 0, label: 'Deselect all', ionFunction: createIonFunction(() => {
                            graph.deselectAllTracks();
                        }),
                    },
                ]
            }
        }
        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', button_canvas);

        resolve ( {})

    })

}
