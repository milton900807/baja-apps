function (graph) {

    let v = '';

    let export_sequence = {
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
                            'wid': 'input-textarea-editor',
                            'title': 'List of ENSEMBL IDs',
                            'data': {
                                'ionHookFunction': createIonFunction((w) => {
                                    v = w
                                }),
                                'button-label': 'Create experiment',
                                'ionFunction': createIonFunction((description) => {
                                    console.log(" description " + description);
                                })
                            }
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                            await graph.add(v.value)
                                            await exec('baja/manchester/menu/select-track-action.js', graph)

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
    showModal(export_sequence)

}
