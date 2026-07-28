function (graph) {

    let v = '';
    let panel;
    const __nameHook = createIonFunction ( (hook) => {
        panel = hook;
    })

    let export_sequence = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '800px',
            cards: [
                [
                   {
                        'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                        'width': '90%',
                        'component':
                        {
                            wid: 'input-param-items',
                            refCallback: __nameHook,
                            data: {
                                'input_labels': ['Track#', 'ENSEMBL'
                                ],
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
                                        label: 'Load', ionFunction: createIonFunction( async () => {
                                            let trackIndex = panel.get ('Track#')
                                            if ( trackIndex )
                                            {
                                                trackIndex = parseInt(trackIndex);
                                            }
                                            await graph.add (panel.get ( 'ENSEMBL'), trackIndex)
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
