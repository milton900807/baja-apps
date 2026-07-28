function (graph, lib, folder) {

    return new Promise(async (resolve, reject) => {

        exec('lib/msgraph.js').then(async (MSGraph) => {
            let sharepoint_config = {
                'scope': ['User.Read', 'Files.Read'
                ]
            }

            let buttons__ = [
                {
                    x: 0, y: 0, label: 'Mutations', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Select a track ')
                        await exec('baja/screens/menu/annotation/mutation.js', graph)
                    })
                },
                {
                    x: 1, y: 0, label: 'Draw...', ionFunction: createIonFunction(async () => {
                        await exec('baja/screens/menu/annotation/draw.js', graph)
                    })
                },
                {
                    x: 2, y: 0, label: 'PolyA', ionFunction: createIonFunction(async () => {
                        await exec('baja/bio/polyA/polyA-menu.js', graph)
                    })
                },
                {
                    x: 3, y: 0, label: 'Feature overlap', ionFunction: createIonFunction(async () => {

                        await exec('baja/screens/menu/genomic-overlap-menu.js', graph)
                    })
                },
                {
                    x: 4, y: 0, label: 'ORFs', ionFunction: createIonFunction(async () => {
                        await exec('baja/bio/orfs/orf-finder.js', graph )
                    })
                },

                {
                    x: 5,
                    y: 0,
                    label: 'Track annotations...', ionFunction: createIonFunction(async () => {

                        await exec('baja/screens/menu/add-track-annotations.js', graph, lib, folder)
                    })
                },
                {
                    x: 6, y: 0, label: "5'utr", ionFunction: createIonFunction(async () => {
                        await exec('baja/bio/utr/5utr.js', graph)
                    })
                },
                {
                    x: 7, y: 0, label: "3'utr", ionFunction: createIonFunction(async () => {
                        await exec('baja/bio/utr/3utr.js', graph)
                    })
                },

            ]

            let tnames = []
            try {
                let client = await MSGraph.getClient(sharepoint_config);
                let sheet_path = `/drives/${lib}/items/${folder}:/gene-graph.xlsx`;
                let gene_graph = await client.api(sheet_path).get();
                let sheetpath = `/drives/${lib}/items/${gene_graph.id}/workbook/worksheets/data`;
                let sheetObjectTab = await client.api(sheetpath).get();
                let rowIndex = 1000;
                let sheetObject = await client.api(`/drives/${lib}/items/${gene_graph.id}/workbook/worksheets/${sheetObjectTab.id}/range(address='A1:A${rowIndex}')`).get();
                let v = sheetObject.values;
                for (let item of v) {
                    let iv = item[0]
                    if (iv && iv.length > 0 && iv.trim().length > 0)
                        tnames.push(iv)
                }

            } catch (exception) {
                console.log(exception)

            }

            let index = 3
            for (let t of tnames) {
                buttons__.push({
                    x: index++, y: 0, label: t, ionFunction: createIonFunction(async () => {
                        await exec('baja/screens/menu/annotation/add-track-layer.js', graph)

                    })

                })
            }

            let button_canvas = {
                wid: 'button-canvas',
                data: {
                    'title': 'controls',
                    'height': 20,
                    'width': 900,
                    'grid': {
                        xmin: 0,
                        xmax: 9,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': buttons__

                }
            }
            return resolve(button_canvas)
        })
    })

}
