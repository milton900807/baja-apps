function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let selectMethod = async (v) => {
            graph.props.selected_chemistry = v;
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            graph.setMessage(" Loading the compound toolbar. ")
            setTimeout(async () => {
                await exec('baja/screens/menu/compound-editor.js', graph, genegraph_panel_layout)
                setTimeout(async () => {
                    exec('baja/screens/menu/simple-info-panel.js', graph, genegraph_panel_layout, 'Menus for creating compounds...')
                }, 1000)

            }, 1000)

        }
        graph.setMessage(" Loading chemistry database... ")
        let myChem = await exec('baja/chem/my-chem-htsbio-w.js', selectMethod)
        let select_display = createIonFunction((ref) => {
            select_display_html = ref;
        })
        let molecule_type_html_render = await exec('baja/screens/render-moltype.js')
        let display = {
            wid: 'html',
            refCallback: select_display,
            data: {
                ionFunction: createIonFunction(() => {
                    return `

                    Selected chemistry template: ` +
                        molecule_type_html_render(graph.props.selected_chemistry)
                })
            }
        }
        let chemistry_tab = {
            wid: 'card',
            data: {
                "style.padding-top": '10px',
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': display
                        },
                        {
                            'width': '100%',
                            'component': myChem
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                "wid": 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                hideAllModal();

                                            })
                                        },

                                    ]
                                }
                            }
                        }
                    ]]
            }
        }

        resolve(chemistry_tab);
    }).then(chemistry_tab => {
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', chemistry_tab);
    });

}
