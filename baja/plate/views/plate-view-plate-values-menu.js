function (pt, plate) {

    return new Promise(async (resolve, reject) => {

        let Menu = await exec('flexigraph/menu.js');
        let MGrid = await exec('flexigraph/grid.js');
        let Plate = await exec('baja/plate/plate.js');
        let menuList = []

        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        menuList.push({
            label: `Paste Compound IDs`,
            click: (scx, scy) => {
                let vtype = null;

                let descHook;
                let pastepanel = {
                    'title': '',
                    'width': '100%',
                    'height': 800,
                    'component': {
                        wid: 'text-editor',
                        refCallback: r,
                        'height': '900px',
                        'data': {
                            'ionHookFunction': createIonFunction((w) => {
                                descHook = w
                            }),
                            'ionFunction': createIonFunction((description) => {
                                console.log(" description " + description);
                            }),
                            showButton: false
                        }
                    }
                }

                let main_layout = {
                    wid: 'card',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [
                                pastepanel,
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
                                                        let data = editor.code;
                                                        let cols = data.split('\n')
                                                        for (let c of cols) {
                                                            let row = c.split('\t');
                                                            console.log(" " + row[0] + "  value " + row[1])

                                                            console.log('' + row[0].match(/[a-zA-Z]+|[0-9]+/g));

                                                            let itsm = row[0].match(/[a-zA-Z]+|[0-9]+/g)
                                                            let wellAddress = itsm[0] + (+itsm[1])
                                                            plate.setCompoundId(wellAddress, row[1])
                                                        }
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
            label: `Paste Concentrations`,
            click: (scx, scy) => {
                let vtype = null;

                let descHook;
                let pastepanel = {
                    'title': '',
                    'width': '100%',
                    'height': 800,
                    'component': {
                        wid: 'text-editor',
                        refCallback: r,
                        'height': '900px',
                        'data': {
                            'ionHookFunction': createIonFunction((w) => {
                                descHook = w
                            }),
                            'ionFunction': createIonFunction((description) => {
                                console.log(" description " + description);
                            }),
                            showButton: false
                        }
                    }
                }

                let main_layout = {
                    wid: 'card',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [
                                pastepanel,
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
                                                        let data = editor.code;
                                                        let cols = data.split('\n')
                                                        for (let c of cols) {
                                                            let row = c.split('\t');

                                                            let itsm = row[0].match(/[a-zA-Z]+|[0-9]+/g)
                                                            let wellAddress = itsm[0] + (+itsm[1])
                                                            plate.setConcentration(wellAddress, row[1])
                                                        }
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
            label: `Paste Values`,
            click: (scx, scy) => {
                let vtype = null;

                let descHook;
                let pastepanel = {
                    'title': '',
                    'width': '100%',
                    'height': 800,
                    'component': {
                        wid: 'text-editor',
                        refCallback: r,
                        'height': '900px',
                        'data': {
                            'ionHookFunction': createIonFunction((w) => {
                                descHook = w
                            }),
                            'ionFunction': createIonFunction((description) => {
                                console.log(" description " + description);
                            }),
                            showButton: false
                        }
                    }
                }

                let main_layout = {
                    wid: 'card',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [
                                pastepanel,
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
                                                        console.log('debubg');
                                                        let data = editor.code;
                                                        let cols = data.split('\n');

                                                        function populateTable(values) {
                                                            const rows = 8;
                                                            const columns = 24;
                                                            let table = [];
                                                            for (let i = 0; i < rows; i++) {
                                                                table[i] = new Array(columns).fill(null);
                                                            }
                                                            let valueIndex = 0;

                                                            for (let row = 0; row < rows; row++) {
                                                                for (let col = 0; col < columns; col++) {
                                                                    if (valueIndex < values.length) {
                                                                        plate.setValueByIndex(col, row, values[valueIndex]);
                                                                        valueIndex++;
                                                                    }
                                                                }
                                                            }

                                                            return table;
                                                        }

                                                        let row = cols[0].split('\t');
                                                        if (row.length === 1) {
                                                            populateTable(cols)
                                                        } else {
                                                            for (let i = 0; i < cols.length; i++) {
                                                                let row = cols[i].split('\t');
                                                                let wellAddress;
                                                                if (row.length === 2) {
                                                                    wellAddress = row[0];
                                                                }

                                                                plate.setValue(wellAddress, row[0]);
                                                            }
                                                        }
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
            label: `Count values`,
            click: (scx, scy) => {

                let count = 0;
                for (let x = 0; x < plate.grid.xmax; x++) {
                    for (let y = plate.grid.ymax - 1; y >= 0; y--) {
                        if (plate.wells[x][y].value != null) {
                            count++;
                        }
                    }
                }

                showModal({
                    wid: 'json',
                    data: 'Count: ' + count
                })

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Clear all values `,
            click: (scx, scy) => {
                for (let x = 0; x < plate.grid.xmax; x++) {
                    for (let y = plate.grid.ymax - 1; y >= 0; y--) {
                        plate.wells[x][y].value = null;
                    }
                }

            },
            move: () => {
            }
        });
        menuList.push({
            label: `Clear IDs `,
            click: (scx, scy) => {
                for (let x = 0; x < plate.grid.xmax; x++) {
                    for (let y = plate.grid.ymax - 1; y >= 0; y--) {
                        plate.wells[x][y].compoundId = null;
                    }
                }

            },
            move: () => {
            }
        });
        menuList.push({
            label: `Clear structures `,
            click: (scx, scy) => {
                for (let x = 0; x < plate.grid.xmax; x++) {
                    for (let y = plate.grid.ymax - 1; y >= 0; y--) {
                        plate.wells[x][y].structure = null;
                    }
                }

            },
            move: () => {
            }
        }); menuList.push({
            label: `Clear Groups `,
            click: (scx, scy) => {
                for (let x = 0; x < plate.grid.xmax; x++) {
                    for (let y = plate.grid.ymax - 1; y >= 0; y--) {
                        plate.wells[x][y].clearGroups();
                    }
                }

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Clear Concentrations `,
            click: (scx, scy) => {
                for (let x = 0; x < plate.grid.xmax; x++) {
                    for (let y = plate.grid.ymax - 1; y >= 0; y--) {
                        plate.wells[x][y].concentration = null;
                    }
                }

            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
