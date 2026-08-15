function (graph, lib, folder) {

    return new Promise(async (resolve, reject) => {

        exec('lib/msgraph.js').then(async (MSGraph) => {
            let sharepoint_config = {
                'scope': ['User.Read', 'Files.Read'
                ]
            }

            let buttons__ = [
                {
                    x: 0, y: 0, label: 'Protein domains', ionFunction: createIonFunction(async () => {
                        await exec('baja/bio/orfs/orf-finder.js', graph)
                    })
                },
                {
                    x: 1, y: 0, label: 'Splicing properties', ionFunction: createIonFunction(async () => {
                        graph.setMouseMode('none')
                        await exec('baja/bio/orfs/show-exons.js', graph)
                    })
                },

                {
                    x: 2, y: 0, label: 'Splicing models', ionFunction: createIonFunction(async () => {
                        console.log('debubg');
                        graph.setMouseMode('none')
                        await exec('baja/bio/splicing/splicing-attributions.js', graph, genegraph_panel_layout)
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
                        await exec('baja/manchester/menu/annotation/add-track-layer.js', graph)
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
                        xmax: 7,
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
