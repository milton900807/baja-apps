function (pt, plate) {

    return new Promise(async (resolve, reject) => {

        let Menu = await exec('flexigraph/menu.js');
        let MGrid = await exec('flexigraph/grid.js');
        let Plate = await exec('baja/plate/plate.js');
        let menuList = [
        ]
        menuList.push({
            label: `Set Type`,
            click: (scx, scy) => {

                let vtype = null;
                let rtype = {
                    wid: 'radio-buttons',
                    data: [
                        {
                            label: 'Synthesis ASO',
                            ionfunction: createIonFunction(
                                async () => {
                                    vtype = "Synthesis"
                                }
                            )
                        },
                        {
                            label: 'RNA',
                            ionfunction: createIonFunction(
                                async () => {
                                    vtype = "RNA"
                                }
                            )
                        },
                        {
                            label: 'Treatment',
                            ionfunction: createIonFunction(
                                async () => {
                                    vtype = "Treatment"
                                }
                            )
                        },
                        {
                            label: 'Ribogreen (RIB)',
                            ionfunction: createIonFunction(
                                async () => {
                                    vtype = "Ribogreen"
                                }
                            )
                        }
                    ]
                }

                let loc = ['Lyophilized', 'Stock', 'RNA', 'Oligos', '']
                let multi = {
                    wid: 'multi-select',
                    data: {
                        'list': loc,
                        'ionfunction': createIonFunction(async (selected) => {
                        })
                    }
                }

                let input_value = {
                    wid: 'input-param-items',
                    data: {
                        input_labels: ['Type'],
                        buttons: [{
                            'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                hideAllModal();
                            })
                        }, {
                            'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {

                                plate.setType ( vtype )

                                hideAllModal();
                            })
                        }]
                    }
                }

                let plateview = {
                    width: '100%',
                    'component': rtype
                }
                let main_layout = {
                    wid: 'card',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [
                                plateview,
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                        hideAllModal();
                                                    })
                                                },
                                                {
                                                    label: 'Apply', ionFunction: createIonFunction(() => {
                                                        plate.setType ( vtype )

                                                        hideAllModal();
                                                    })
                                                }
                                            ]
                                        }
                                    }
                                }
                            ]
                        ]
                    }
                }
                showModal(main_layout)

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Set Name`,
            click: (scx, scy) => {
                let input_value = {
                    wid: 'input-param-items',
                    data: {
                        input_labels: ['Name'],
                        buttons: [{
                            'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                hideAllModal();
                            })
                        }, {
                            'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                hideAllModal();
                                let name = input_params['Name']
                                if (name && name.length >= 0)
                                    plate.setName(name);

                            })
                        }]
                    }
                }
                let plateview = {
                    width: '100%',
                    'component': input_value
                }
                let main_layout = {
                    wid: 'card',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [
                                plateview
                            ]
                        ]
                    }
                }
                showModal(main_layout)
            },
            move: () => {
            }
        });

        menuList.push({
            label: `Paste values`,
            click: (scx, scy) => {
            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
