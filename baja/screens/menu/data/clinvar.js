function (datapath, server, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        graph.setMessage ( ' Click on a track to see menu options.')

        await exec(`baja/screens/menu/data/clinvar-verbose-menu.js`, datapath, server, graph, genegraph_panel_layout)

        let editor_;
        let items = []
        items.push({
            x: 0, y: 0,
            label: "SNPs", ionFunction: createIonFunction(async () => {
                graph.setMessage('Select a track ');
                await exec(`baja/screens/menu/data/clinvar-verbose-menu.js`, datapath, server, graph, genegraph_panel_layout)
            })
        }
        )

        let items_length = items.length + 3;

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 800,
                'grid': {
                    xmin: 0,
                    xmax: items_length + 1,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': items
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

        return resolve(button_canvas)
    })

}
