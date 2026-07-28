function (libid, folder, f, parent_eln_panel, install_type) {
    let nameField;

    if (install_type === 'vcf') {
        console.log('debubg');

        let filter_panel = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            'width': '100%',
                            "style.padding-top": '4px',
                            "style.border": '1px',
                            'component':
                            {
                                wid: 'input-textfield',
                                'title': 'Name:',
                                'data': {
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {
                                    }),
                                    'ionHookFunction': createIonFunction((input_box) => {
                                        nameField = input_box;
                                    })
                                }
                            }
                        }, {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Install VCF', ionFunction: createIonFunction(async () => {
                                                hideAllModal();
                                                let name = nameField.value;
                                                if (name && name.length > 0) {
                                                    exec('baja/io/vcf/install-vcf.js', name,
                                                        libid, folder.id, f.id, 'inst', parent_eln_panel).then(async r => {
                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(r)
                                                            })
                                                        })

                                                } else {
                                                }

                                            })
                                        }, {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                CurrentLayout.setComponent('eln', parent_eln_panel)

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

        return filter_panel
    } else if (install_type === 'bigwig') {

        let filter_panel = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            'width': '100%',
                            "style.padding-top": '4px',
                            "style.border": '1px',
                            'component':
                            {
                                'wid': 'input-textfield',
                                'title': 'Name:',
                                'data': {
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {
                                    }),
                                    'ionHookFunction': createIonFunction((input_box) => {
                                        nameField = input_box;
                                    })
                                }
                            }
                        }, {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Install BW', ionFunction: createIonFunction(async () => {
                                                let name = nameField.value;
                                                if (name && name.length > 0) {

                                                    exec('baja/io/bw/install-bigwig.js', name,
                                                        libid, folder.id, f.id, 'inst', parent_eln_panel).then(async r => {
                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(r)
                                                            })
                                                        })

                                                } else {
                                                }

                                            })
                                        }, {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                CurrentLayout.setComponent('eln', parent_eln_panel)

                                            })
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '30%',
                            'component':
                            {
                                wid: 'html',
                                data: ''
                            }
                        },
                    ]
                ]
            }
        }

        return filter_panel

    }

}
