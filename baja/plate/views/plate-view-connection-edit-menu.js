function (pt, fromPlate, toPlate) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;

        let selectP;
        let selectPanel = createIonFunction(async (_panel) => {
            selectP = _panel;
        });

        r = createIonFunction((p) => {
            editor = p;
        })
        menuList.push({
            label: `Transfer...`,
            click: (scx, scy) => {
                let tf = []
                let tname = ['All->Well address', 'All-> Series', 'Group-> Group']
                let well_groups = fromPlate.getGroups();
                for (let w of well_groups) {
                    tname.push(w + '-> Series')
                    tname.push(w + '-> Well address')
                }
                tname.push('Unassigned -> Series ')
                tname.push('Unassigned -> Well address ')

                for (let f of pt.transferFunctions) {
                    if (f.from === fromPlate && f.toPlate === toPlate) {
                        tf.push({
                            'name': f.name, 'obj':
                                f
                        });
                        tname.push(f.name)
                    }
                }

                let t = {
                    wid: 'card',
                    data: {
                        cards: [
                            [
                                {
                                    'title': 'Transfer functions',
                                    width: '100%',

                                    'body': `  `, 'component':
                                    {
                                        wid: 'selection-list',
                                        width: '100%',
                                        refCallback: selectPanel,
                                        data: {
                                            listItems: tname
                                        }
                                    }
                                },
                            ],
                            [
                                {
                                    'title': 'Transfer Functions', 'body': `  `, 'component':
                                    {
                                        wid: 'table', data: {
                                            showHeader: false,
                                            rows: tf
                                        }
                                    }
                                },
                            ],
                            [
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Apply', ionFunction: createIonFunction(async () => {
                                                        let TransferFunction = await exec('baja/plate/transfer-functions.js')
                                                        let transfer_functions = [];
                                                        for (let t of selectP.selectedItems) {

                                                            pt.transferFunctions.push(new TransferFunction(fromPlate, toPlate, t))
                                                        }
                                                        hideAllModal();
                                                    })
                                                },
                                            ]
                                        }
                                    }
                                }
                            ]
                        ]
                    }
                }
                showModal(t)

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Remove connections`,
            click: (scx, scy) => {
                let tf = []

                for (let f of pt.transferFunctions) {
                    if (f.from === fromPlate && f.toPlate === toPlate) {
                        tf.push({
                            'name': f.name, 'obj':
                                f
                        });
                        tname.push(f.name)
                    }
                }

                let t = {
                    wid: 'card',
                    data: {
                        cards: [
                            [
                                {
                                    'title': 'Transfer Functions', 'body': `  `, 'component':
                                    {
                                        wid: 'table', data: {
                                            showHeader: false,
                                            rows: tf
                                        }
                                    }
                                },
                            ],
                            [
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Apply', ionFunction: createIonFunction(async () => {

                                                        fromPlate.removerPlate(toPlate)
                                                        pt.root.push ( toPlate )

                                                        let index = 0;

                                                        for (let f of pt.transferFunctions) {
                                                            if (f.from === fromPlate && f.to === toPlate) {
                                                                pt.transferFunctions.splice (index, 1)
                                                            }

                                                            index++;
                                                        }

                                                        hideAllModal();
                                                    })
                                                },
                                            ]
                                        }
                                    }
                                }
                            ]
                        ]
                    }
                }
                showModal(t)
            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
