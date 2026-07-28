function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let new_plate_panel;
        let __nameHook = createIonFunction((ed) => {
            new_plate_panel = ed;
        });

        let filterby_name = {
            wid: 'card',
            data: {
                'style.padding-left': '5px',
                'style.padding-top': '1px',
                cards: [
                    [

                        {
                            'width': '100%',
                            'body': ``,
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['Compound ID'],
                                }
                            },

                        }
                    ],
                    [

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Filter', ionFunction: createIonFunction(async (button) => {
                                                let v = new_plate_panel.get('Compound ID')
                                                v = parseFloat(v);

                                                for (let p of selectedTrack.plots) {
                                                    if (p.name === v) {
                                                        p.show = true;
                                                    } else {
                                                        p.show = false;
                                                    }
                                                }

                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }

        let threshold = {
            wid: 'card',
            data: {
                'style.padding-left': '5px',
                'style.padding-top': '1px',
                cards: [
                    [

                        {
                            'width': '100%',
                            'body': ``,
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['Value'],
                                }
                            },

                        }
                    ],
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Filter', ionFunction: createIonFunction(async (button) => {
                                                let v = new_plate_panel.get('Value')
                                                v = parseFloat(v);

                                                let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove compounds above this value  ' + v, async () => {
                                                    let xpos = []
                                                    for (let t of graph.track) {
                                                        for (let p of t.plots) {
                                                            if (p.value > v) {
                                                                xpos.push(p.x)
                                                            }
                                                        }
                                                    }

                                                    for (let track of graph.track) {
                                                        track.oligos = track.oligos.filter(obj => !xpos.includes(obj.xi));
                                                        track.plots = track.plots.filter(obj => !xpos.includes(obj.x));
                                                    }

                                                });
                                                showModal(confirm)

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        }
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', threshold);

    });
}
