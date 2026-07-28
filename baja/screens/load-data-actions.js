function (graph, libid, folderid) {
    return new Promise(async (resolve, reject) => {
        let TrackLayer = await exec('baja/bio/track-layer.js')

        let selectedTrack = null;

        let MSGraph = await exec('lib/msgraph.js')
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read'
            ]
        }
        let client = await MSGraph.getClient(sharepoint_config);
        let sheet_path = `/drives/${libid}/items/${folderid}:/gene-graph.xlsx`;
        let gene_graph = await client.api(sheet_path).get();
        let sheetpath = `/drives/${libid}/items/${gene_graph.id}/workbook/worksheets`;
        let sheetObjectTab = await client.api(sheetpath).get();
        let sheets = [
            {
                label: 'Add dataset',
                ionfunction: createIonFunction(async () => {
                    exec('baja/main-menu.js', libid);

                })
            }
        ]
        let value = sheetObjectTab.value;
        for (let sheetv of value) {
            let sheetname = sheetv.name;
            if (sheetname.startsWith('data.')) {
                sheets.push(
                    {
                        label: sheetname.substring(5),
                        ionfunction: createIonFunction(async () => {
                            graph.setMessage('Select a point on a track')
                            let sheetObject = await client.api(`/drives/${libid}/items/${gene_graph.id}/workbook/worksheets/${sheetv.id}/range(address='A2:F1000')`).get();
                            let v = sheetObject.values;

                            let menuList = [];

                            for (let i of v) {

                                let name___ = i[0]
                                let opFunction = i[5]
                                let trackConfigFile = i[6]
                                let filepath = i[4]
                                let endpoint = i[3]

                                if (name___ != null && name___.length > 0) {
                                    menuList.push(
                                        {
                                            label: name___,
                                            click: async (x, y) => {
                                                if (selectedTrack) {

                                                    let sec = Math.random ()*10
                                                    let t = new TrackLayer(''+sec, 0, 0, 1, 1);

                                                    let chromosome = selectedTrack.chr;
                                                    if (!chromosome && chromosome.length <= 0) {
                                                        graph.setMessage('Current track does not have a chromosome assignment')
                                                        return;
                                                    }
                                                    let xi = selectedTrack.xi;
                                                    let xf = selectedTrack.xf;
                                                    console.log('debubg');

                                                    if (opFunction != null && opFunction.length > 0) {
                                                        exec(opFunction.trim(), graph, selectedTrack, name___, endpoint, filepath)
                                                    } else {

                                                        alert ( ' No operation function defined ')
                                                        return;

                                                        if ( res != null && res['coords'] != null ){

                                                        }
                                                        else
                                                        if (res != null && res['svg'] != null) {
                                                            let parser = new DOMParser();
                                                            let xmlDoc = parser.parseFromString(res['svg'], "text/xml");
                                                            let svgObject = xmlDoc.childNodes[1]
                                                            t.addSVG(svgObject)
                                                            selectedTrack.addLayer(t)
                                                        }
                                                    }
                                                }

                                            },
                                            move: () => {
                                            },
                                        },

                                    )
                                }

                            }

                            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                            graph.setMouseMode('navigate')

                            graph.selectOff();
                            graph.addMouseDownListener(async (x, y) => {

                                let selectedtrackIndex = graph.getTrack(x, y);
                                if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
                                    selectedTrack = graph.track[selectedtrackIndex]
                                    graph.showMenu(menuList, x, y);
                                }
                            })

                        })
                    })
            }
        }

        let f = {
            label: 'Data', 'items': sheets
        }

        return resolve(f)
    })
}
