function (lib, folder, f, parent_widget, type) {

    let libid = lib.id;
    let nameField;
    if (type === 'bw') {
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
                                                hideAllModal();
                                                let r = await exec('baja/io/bw/install-bigwig.js', name, libid, folder.id, f.id, 'inst', parent_widget);
                                                if (name && name.length > 0) {
                                                } else {
                                                }
                                            })
                                        }, {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                hideAllModal();

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

        showModal(filter_panel);

    } else if (type === 'vcf') {

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
                                            label: 'Install VCF', ionFunction: createIonFunction(async () => {
                                                hideAllModal();
                                                let name = nameField.value;

                                                console.log(" installing the vcf ")

                                                let r = await exec('baja/io/vcf/install-vcf.js', name, libid, folder.id, f.id, 'inst', parent_widget);

                                            })
                                        }, {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                hideAllModal();

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

        showModal(filter_panel);

    }
    else if (type === 'bed') {

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
                                            label: 'Install BED', ionFunction: createIonFunction(async () => {
                                                hideAllModal();
                                                let name = nameField.value;
                                                let r = await exec('baja/io/bed/install-bed.js', name, libid, folder.id, f.id, 'inst', parent_widget);
                                            })
                                        }, {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                hideAllModal();

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

        showModal(filter_panel);

    }
    else if (type === 'txt') {

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
                                            label: 'Install txt', ionFunction: createIonFunction(async () => {
                                                hideAllModal();
                                                let name = nameField.value;

                                                console.log(" installing the txt ")

                                                let r = await exec('baja/io/vcf/install-txt.js', name, libid, folder.id, f.id, 'inst', parent_widget);
                                                clear ();
                                                showWidget(parent_widget);

                                            })
                                        }, {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                hideAllModal();

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

        showModal(filter_panel);

    }

}
