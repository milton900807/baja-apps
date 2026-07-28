function (graph, genegraph_panel_layout, _data) {

    return new Promise(async (resolve, reject) => {
        let buttons = [
            {
                x: 0, y: 0, label: '<| Set', ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    epandLeft()

                }), mouseOver: createIonFunction(() => {
                    graph.setMessage(" Expand highlight left while holding right")
                })
            },
            {
                x: 1, y: 0, label: 'Set |>', ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    expandRight();
                }), mouseOver: createIonFunction(() => {
                    graph.setMessage(" Expand right while holding left position. ")
                })
            },
            {
                x: 2, y: 0, label: 'Reset', ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    graph.deselectAllTracks()
                    ml();
                }), mouseOver: createIonFunction(() => {
                    graph.setMessage(" Clear the highlight and start over ")
                })
            },
            {
                x: 3, y: 0, label: 'Tile menu...', ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    ml();
                    for (let t of graph.track) {
                        if (t.markend > t.markstart) {
                            track = t
                            break
                        }
                    }
                    if (!track) {
                        infoPrompt("No track with sequence selected... ")
                    } else {
                        graph.showWindowMenu(menuList, 10, 10, 200);
                    }
                }), mouseOver: createIonFunction(() => {
                    graph.setMessage("View menu options for selected sequences.")
                })
            },
        ]

        let ht = {
            wid:'html',
            data: _data
        }

        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', ht);

        return resolve ();

    })

}
