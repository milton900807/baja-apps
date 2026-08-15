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
                xmax: 6,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: "Sequences", ionFunction: createIonFunction(async () => {
                        showModal({
                            wid: 'card',
                            height: '100%',
                            data: {
                                cards: [
                                    [
                                        {

                                            'width': '100%',
                                            'component': {
                                                wid: 'menu',
                                                data: {
                                                    menus: [
                                                        {
                                                            'label': 'File type', 'items': [
                                                                {
                                                                    'label': 'ID | sequences| KD', 'ionfunction': createIonFunction(async () => {

                                                                        let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph)
                                                                        await showModal(paste_sequences_panel)
                                                                    })
                                                                },
                                                            ]
                                                        },
                                                    ]
                                                }
                                            }

                                        }
                                    ]]
                            }
                        }, 200, 100)

                    })
                },

            ]
        }
    }
    return button_canvas

}
