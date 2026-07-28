function (obj, graph, genegraph_panel_layout) {
    let panel;
    const __nameHook = createIonFunction((hook) => {
        panel = hook;
    })
    let zoom_to = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '800px',
            cards: [
                [
                    {
                        'title': ' ', 'body': ``
                        ,
                        'width': '90%',
                        'component':
                        {
                            wid: 'json',
                            refCallback: __nameHook,
                            data: JSON.stringify(obj)
                        }
                    },

                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Apply', ionFunction: createIonFunction(async () => {
                                            let jsob = panel.data;
                                            let newObject = JSON.parse(jsob);
                                            console.log('debubg');
                                            let factoryObject = await exec('flexigraph/shapes/shape-factory.js', newObject)
                                            graph.updateObject(obj, factoryObject);

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
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
    CurrentLayout.setComponent('mainPanel', zoom_to);

}
