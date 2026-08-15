function (graph) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'width': 600,
            'grid': {
                xmin: 0,
                xmax: 5,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [

                {
                    x: 0, y: 0, label: 'microRNA', ionFunction: createIonFunction(async () => {
                        await exec('baja/manchester/menu/micro-rna-menu.js', graph);
                    })

                },
                {
                    x: 1, y: 0, label: 'Track Compare', ionFunction: createIonFunction(async () => {

                        await exec('baja/manchester/menu/sequence-match.js', graph);
                    })

                },
                {
                    x: 2, y: 0, label: 'Introns', ionFunction: createIonFunction(async () => {
                        await exec('baja/manchester/menu/sequence-introns-match.js', graph);
                    })

                },
                {
                    x: 2, y: 0, label: 'Exons', ionFunction: createIonFunction(async () => {
                        await exec('baja/manchester/menu/sequence-exons-match.js', graph);
                    })

                },

            ]
        }
    }
    return button_canvas

}
