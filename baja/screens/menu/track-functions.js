function (items, graph, genegraph_panel_layout) {

    console.log('debubg');
    let tools_menu = []
    const rnaseq = items.find(p => p.data.toLowerCase().endsWith('rnaseq'));

    if (rnaseq) {

        tools_menu.push({
            'label': 'PSI on tracks', click: (async () => {
                let MPlot = await exec('flexigraph/plot.js')

                for (let rna of items) {
                    if (rna.data.toLowerCase().endsWith('rnaseq')) {

                        console.log(" running the  rna se4q loqder ")

                        graph.runfun(async () => {

                            let columns = 4;
                            if (isMobile()) {
                                columns = 1;
                            }
                            let ww = {
                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '100%',
                                data: {
                                    width: '100%',
                                    drive: 'bigdata',
                                    user: getUser(),
                                    server: rna.server,
                                    filetype: '.bw,.bigwig,.gz',
                                    columns: columns,
                                    root: rna.data,
                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                        let epath = '/bd/' + element.path;
                                        epath = epath.replace(/\/+/g, '/');

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                        graph.runfun(async () => {

                                            graph.track =  graph.track.sort((a, b) => b.tgraph.yi - a.tgraph.yi);
                                            for (let selectedTrack of graph.track) {

                                                let offset = 300;
                                                graph.graph.setymax(selectedTrack.tgraph.yi + selectedTrack.tgraph.height + 30)
                                                graph.graph.setymin(selectedTrack.tgraph.yi - Math.abs(selectedTrack.tgraph.height) - 30)
                                                graph.graph.setxmin(selectedTrack.tgraph.xi - offset)
                                                graph.graph.setxmax(selectedTrack.tgraph.xi + offset)
                                                graph.graph.rescale();

                                                let tl = await exec('baja/data/big-data-for-workbench.js', rna.server, selectedTrack, epath)
                                                let psivalues = selectedTrack.calculatePSIForAllExons(tl.polygonpts)
                                                if (psivalues && psivalues.length > 0) {
                                                    let sc = []
                                                    for (let psi of psivalues) {

                                                        sc.push({ x: psi.index, y: psi.psi, name: (100*psi.psi).toFixed (1) })
                                                    }

                                                    let scatterDataTest = {
                                                        points: sc
                                                    };

                                                    if (sc && sc.length > 0) {
                                                        let trainPlot = new MPlot(scatterDataTest);
                                                        trainPlot.name = "PSI";
                                                        trainPlot.mode = 'line'
                                                        trainPlot.w = 160;
                                                        trainPlot.fitScaleToData = false;
                                                        trainPlot.setxmax ( sc.length )
                                                        trainPlot.setxmin ( 0 )
                                                        trainPlot.setymax ( 1.0 )
                                                        trainPlot.setymin ( 0.0 )

                                                        trainPlot.lineColor = 'black'
                                                        trainPlot.x = selectedTrack.tgraph.xi - 100;
                                                        trainPlot.y = selectedTrack.tgraph.yi + 1;
                                                        graph.plots.push(trainPlot)

                                                        sleep(2000)

                                                    }
                                                }

                                                setTimeout(() => {

                                                }, 30000)
                                            }
                                        })

                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),
                                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                                    })
                                }
                            }

                            let bwpanel = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [

                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: '<hr>'
                                                }
                                            },

                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'mt-button', data: {
                                                        buttons: [

                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                })
                                                            },
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component': ww
                                            },
                                        ]
                                    ]
                                }
                            }

                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', bwpanel);

                        })
                    } else {

                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }
                }

            })

        })
    }
    return tools_menu;
}
