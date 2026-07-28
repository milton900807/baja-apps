function (obj, graph) {

    let panel;
    const __nameHook = createIonFunction((hook) => {
        panel = hook;
    })
    let zoom_to = {
        wid: 'card',
        componentRef: 'bottomPanel',
        width: '800px',
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
                                            let newObject = JSON.parse ( jsob );
                                            let factoryObject = await exec ('flexigraph/shapes/shape-factory.js', newObject)
                                            obj.drawShadow = true;

                                            graph.updateObject ( obj, obj );
                                            hideAllModal();
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            hideAllModal();
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
        }
    }
    showModal(zoom_to)

}
