function (pt) {

    return new Promise(async (resolve, reject) => {

        let Menu = await exec('flexigraph/menu.js');
        let MGrid = await exec('flexigraph/grid.js');
        let Plate = await exec('baja/plate/plate.js');

        let xwc = 0;
        let ywc = 0;
        let plate_type = 96;

        let input_value = {
            wid: 'input-param-items',
            data: {
                input_labels: ['Name', 'Location'],
                buttons: [{
                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {

                        hideAllModal();
                    })
                }, {
                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                        let name = input_params['Name']
                        let fromPlate = pt.getSelectedPlate ();
                        let toPlate = pt.addChildPlate ( plate_type, name )
                        hideAllModal();

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
                        let selectP;
                        let selectPanel = createIonFunction(async (_panel) => {
                            selectP = _panel;
                        });

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

                    })
                }]
            }
        }

        let menuList = [
        ]
        menuList.push({
            label: `New plate 96w`,
            click: (x, y) => {
                xwc = x;
                ywc = y;
                plate_type = 96;

                showModal ( input_value )

            },
            move: () => {
            }
        });
        menuList.push({
            label: `New plate 384w`,
            click: (xwc, ywc) => {

                xwc = x;
                ywc = y;
                plate_type = 384;

                showModal ( input_value )

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Delete`,
            click: (xwc, ywc) => {
            },
            move: () => {
            }
        });
        menuList.push({
            label: `Replicate`,
            click: async (xwc, ywc) => {

                let parentPlates = pt.getParentPlates ( pt.getSelectedPlate ())

                let copyPlate = (obj) => {
                    let ps = [];
                    for (let a of obj) {
                        let p = Object.assign(new Plate(), a)
                        if (p.plates && p.plates.length > 0) {
                            let pa = loadPlates(p.plates)
                            p.plates = pa;
                        }
                        p.grid = Object.assign(new MGrid(), p.grid)
                        let ww = []
                        let rows = a.wells;
                        for (let r of rows) {
                            let _row = []
                            for (let w of r) {
                                _row.push(Object.assign(new GenericWell(), w))
                            }
                            ww.push(_row);
                        }
                        p.wells = ww;
                        ps.push ( p )
                    }
                    return ps;
                }

                let ts = loadPlates ( [pt.getSelectedPlate ()])
                for ( let parent of parentPlates ){
                    parent.add ( ts[0])
                }

            },
            move: () => {
            }
        });
        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
