function (jsonObject, listenerMethod) {

    return new Promise((resolve, reject) => {

        let panel;
        let _panel = createIonFunction((_p) => {
            panel = _p;
        })
        let input = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component':
                            {
                                wid: 'html',
                                data: `<h1> Edit annotation type </h1> `
                            }
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component':
                            {
                                wid: 'json',
                                refCallback: _panel,
                                data: JSON.stringify(jsonObject)
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                listenerMethod('cancel', null)
                                            })
                                        },
                                        {
                                            label: 'Delete', ionFunction: createIonFunction(() => {
                                                listenerMethod('delete', null)
                                            })
                                        },
                                        {
                                            label: 'OK', ionFunction: createIonFunction(() => {

                                                if (panel) {
                                                    try {
                                                        let v = panel.getData () + '';
                                                        let jv = JSON.parse(v);
                                                        listenerMethod('OK', jv)

                                                    } catch (exception) {
                                                        prompt('Failed to parse the object ')
                                                    }
                                                }
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }

        return resolve ( input )
    })

}
