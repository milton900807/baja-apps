function (track, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let track_list = []
        let content = {}
        let index = 0;
        for (let trackLayer of track.track_layers) {
            track_list.push(trackLayer.name)
            console.log(' tack name ' + trackLayer.name)
            if (trackLayer._odds_ratio_transient_)
                content[trackLayer.name] = ' Log2 OR ' + trackLayer._odds_ratio_transient_ + " Visible? " + trackLayer.visible
            index++;
        }
        let uniqueTypes = [...new Set(track.track_layers.map(track_layer => track_layer.attribution_type))];
        let b = []
        let bc = {}
        for (let u of uniqueTypes) {
            if (u) {
                b.push('Hide background ' + u);
                b.push('Show background ' + u);
                b.push('Hide all ' + u);
                b.push('Show all ' + u);
                b.push('Interaction off for all ' + u)
                b.push('Interaction ON for all ' + u)
            }
        }

        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: track_list,
                contentItems: content,
                button_function: createIonFunction(async (items) => {

                    for (let trackLayer of track.track_layers) {
                        if (trackLayer.name === items[0]) {
                            let tl = await exec('baja/screens/menu/select-track-layer-edit-panel', track, trackLayer, genegraph_panel_layout)
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', tl);
                        }
                    }

                })
            }
        }

        let tt = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: b,
                contentItems: bc,
                button_function: createIonFunction(async (items) => {

                    let words = items[0].trim().replace(/[.!?]$/, '').split(/\s+/);
                    let lastword = words[words.length - 1];

                    if (items[0].startsWith('Hide all')) {
                        for (let trackLayer of track.track_layers) {
                            if (trackLayer.attribution_type === lastword) {

                                trackLayer.visible = false;
                            }

                        }
                    }
                    if (items[0].startsWith('Hide background')) {
                        for (let trackLayer of track.track_layers) {
                            if (trackLayer.attribution_type === lastword) {
                                trackLayer.show_background = false;
                            }

                        }
                    }
                    if (items[0].startsWith('Show background')) {
                        for (let trackLayer of track.track_layers) {
                            if (trackLayer.attribution_type === lastword) {
                                trackLayer.show_background = true;
                            }

                        }
                    }

                    if (items[0].startsWith('Show all')) {
                        for (let trackLayer of track.track_layers) {
                            if ('Show all ' + lastword === items[0]) {
                                if (trackLayer.attribution_type === lastword) {
                                    trackLayer.visible = true;
                                }
                            }
                        }
                    }
                    if (items[0].startsWith('Interaction off for all')) {
                        for (let trackLayer of track.track_layers) {
                            if ('Interaction off for all ' + lastword === items[0]) {
                                if (trackLayer.attribution_type === lastword) {
                                    trackLayer.interactive = false;
                                }
                            }
                        }
                    }
                    if (items[0].startsWith('Interaction ON for all ')) {
                        for (let trackLayer of track.track_layers) {
                            if ('Interaction ON for all ' + lastword === items[0]) {
                                if (trackLayer.attribution_type === lastword) {
                                    trackLayer.interactive = true;
                                }
                            }
                        }
                    }
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                })
            }
        }

        let html = '<hr> <h2> Attribute Types </h2>'
        let html3 = '<hr> <h2>Track Layers. </h2>'
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
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                CurrentLayout.reset('mainPanel')
                                            })
                                        }
                                    ]
                                }
                            }
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html}`
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': tt
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html3}`
                            }
                        },

                        {
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
                                            label: 'Hide All', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.visible = false;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Interaction off', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.interactive = false;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Interaction on', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.interactive = true;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Show All', ionFunction: createIonFunction(() => {
                                                for (let trackLayer of track.track_layers) {
                                                    trackLayer.visible = true;
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {

                                                CurrentLayout.reset("mainPanel")
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
