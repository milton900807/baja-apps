function (title) {
    let va = async () => {
        await showWidget({
            wid: 'html',
            data: `<b> Enter target </b> `
        })

        let radio_buttons = {
            wid: 'radio-buttons',
            data: {
                buttons: [
                    {
                        label: 'Use ENSEMBL ID', ionfunction: createIonFunction(async () => {
                            let title_text = {
                                'wid': 'input-textfield',
                                'title': 'Enter target Gene ',
                                'data': {
                                    'blocking': false,
                                    'show-button': true,

                                    'buttonFunction': createIonFunction((ensembleid) => {
                                        clear();
                                        exec('baja/manchester/open-screen-editor.js', title, [ensembleid])
                                    })
                                }
                            }
                            showWidget(title_text)
                        })
                    },
                    {
                        label: 'Enter Custom sequence', ionfunction: createIonFunction(async () => {
                            let desc = {
                                'wid': 'input-textarea-editor',
                                'title': 'Experiment Description',
                                'data': {
                                    'ionHookFunction': createIonFunction((w) => {
                                        descHook = w
                                    }),
                                    'button-label': 'Create experiment',
                                    'ionFunction': createIonFunction((description) => {
                                        console.log(" description " + description);
                                    })
                                }
                            }
                            await showWidget(desc)

                        })
                    }
                ]
            }
        }

        showWidget({
            wid: 'card',
            data: {

                'style.padding-left': '12px',
                cards: [
                    [

                        {
                            'component': radio_buttons
                        },
                        {
                            'component':
                            {
                                wid: 'table', data: {
                                    title: 'Plates',
                                    width: '40%',
                                    showHeader: false,
                                    rows: [
                                        {
                                            button: { 'label': 'Human, DMD: 5 plates ordered [IDT]', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Human SMN2: 3 plates received [QC]', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Mouse, KRAS: 3 plates  [Inventory]', 'ionfunction': createIonFunction(() => { }) },
                                        }
                                    ]
                                }
                            }
                        }
                    ],
                ]
            }
        })

    };

    va();

}
