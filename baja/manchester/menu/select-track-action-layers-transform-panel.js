function (track, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let track_list = []
        for (let trackLayer of track.track_layers) {
            if (trackLayer.polygon_type === 'line')
                track_list.push(trackLayer.name)
        }

        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: track_list,
                button_function: createIonFunction(async (items) => {

                    for (let trackLayer of track.track_layers) {

                        if (trackLayer.name === items[0]) {

                            let va = await prompt("Name", ["Name"], { "Name": "" }, 300, 300)
                            let m = va['Name']
                            if ( m === null ){
                                m = 'untiltled'
                            }
                            graph.pushOntoHistory();

                            let Annotation = await exec('flexigraph/annotation.js')
                            let polygonPoints = trackLayer.polygonpts;
                            let xmin = Math.floor(polygonPoints[0].x);
                            let xmax = Math.floor(polygonPoints[0].x);
                            for (let i = 1; i < polygonPoints.length; i++) {
                                if (Math.floor(polygonPoints[i].x) < xmin) {
                                    xmin = Math.floor(polygonPoints[i].x);
                                }
                                if (Math.floor(polygonPoints[i].x )> xmax) {
                                    xmax = Math.floor(polygonPoints[i].x);
                                }
                            }
                            let exon = new Annotation("Exon", "" + m , xmin, xmax, track.strand);
                            track.add(exon);
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                        }
                    }
                })
            }
        }

        let html = '<hr> <h2> Select a layer to edit. </h2>'
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
                                data: `${html}`
                            }
                        }, {
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
