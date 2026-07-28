function (graph) {

    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let selectedColor = 'magenta'
    let colors = [
        'red',
        'blue',
        'green',
        'maroon',
        'magenta',
        'purple',
        'yellow',
        'black'
    ]
    let buttons__ = []
    let index = 1
    for (let t of colors) {
        buttons__.push({
            x: index++, y: 0, label: '', ionFunction: createIonFunction(async (button) => {
                selectedColor = t;

            }), background: t
        })
    }
    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 20,
            'width': 200,
            'grid': {
                xmin: 0,
                xmax: colors.length,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': buttons__

        }
    }

    let find_panel = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '80px',
            width: '1100px',
            cards: [
                [
                    {
                        'title': '', 'body': ``,
                        'width': '20%',
                        'component':
                        {
                            wid: 'input-textfield',
                            refCallback: nameHook,
                            'data': {
                                'blocking': false,
                                'show-button': false,
                                'ionHookFunction': createIonFunction((w) => {

                                }),
                                'ionfunction': createIonFunction((title) => {
                                    console.log(" title " + title);
                                })
                            }
                        }
                    },

                    {
                        'title': '', 'body': ``,
                        'width': '29%',
                        'component':
                            button_canvas
                    },

                    {
                        'title': '',
                        'width': '50%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                            exec('baja/bio/cell-lines/bam-files-menu.js', graph)
                                        })
                                    },
                                ]
                            }
                        }
                    }
                ],

            ]
        }
    }

    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
    CurrentLayout.setComponent('buttonMenuPanel', find_panel);

}
