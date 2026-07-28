function (pt, fromPlate, toPlate, mode) {

    return new Promise(async (resolve, reject) => {
        let TransferFunction = await exec('baja/plate/transfer-functions.js')

        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        menuList.push({
            label: `GRP Transfer functions`,
            click: (scx, scy) => {

                pt.alignPlates();
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
            label: `(AC,BD,EG,FH,IK,JL,KM,LN,MO,NP)`,
            click: (scx, scy) => {

                let fun = (from, to) => {
                    let row = 0;
                    let col = 0;
                    let s = false;

                    for (let y = 0; y < from.grid.ymax; y++) {
                        for (let x = 0; x < from.grid.xmax; x++) {
                            if (col >= to.wells.length) {
                                if (s) {
                                    row+=2;
                                    col = 0;
                                    s = false;
                                } else {
                                    s = true;
                                    col = 1;
                                }
                            }
                            to.wells[col][row].value = from.wells[x][y].value;
                            to.wells[col][row].concentration = from.wells[x][y].concentration;
                            to.wells[x][y].appendGroups (from.wells[x][y].getGroups());
                            to.wells[col][row].color = from.wells[x][y].color;
                            to.wells[col][row].structure = from.wells[x][y].structure;
                            to.wells[col][row].compoundId = from.wells[x][y].compoundId;
                            if (to.wells[col][row].source && to.wells[col][row].source.length > 0) {
                                to.wells[col][row].source.push({
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                })
                            } else {

                                to.wells[col][row].source = [{
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                }]
                            }
                            col += 2
                        }
                    }
                }
                let tr = new TransferFunction(fromPlate, toPlate, '(A-B)')
                tr.fun = fun;
                pt.transferFunctions.push(tr)
            },
            move: () => {
            }
        });

        menuList.push({
            label: `(A-B)`,
            click: (scx, scy) => {

                let fun = (from, to) => {
                    let row = 0;
                    let col = 0;
                    let s = false;

                    for (let y = 0; y < from.grid.ymax; y++) {
                        for (let x = 0; x < from.grid.xmax; x++) {
                            if (col >= to.wells.length) {
                                if (s) {
                                    row++;
                                    col = 0;
                                    s = false;
                                } else {
                                    s = true;
                                    col = 1;
                                }
                            }
                            to.wells[col][row].value = from.wells[x][y].value;
                            to.wells[col][row].concentration = from.wells[x][y].concentration;
                            to.wells[x][y].appendGroups (from.wells[x][y].getGroups());
                            to.wells[col][row].color = from.wells[x][y].color;
                            to.wells[col][row].structure = from.wells[x][y].structure;
                            to.wells[col][row].compoundId = from.wells[x][y].compoundId;
                            if (to.wells[col][row].source && to.wells[col][row].source.length > 0) {
                                to.wells[col][row].source.push({
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                })
                            } else {

                                to.wells[col][row].source = [{
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                }]
                            }
                            col += 2
                        }
                    }
                }
                let tr = new TransferFunction(fromPlate, toPlate, '(A-B)')
                tr.fun = fun;
                pt.transferFunctions.push(tr)
            },
            move: () => {
            }
        });
        menuList.push({
            label: `(C-D)`,
            click: (scx, scy) => {
                let fun = (from, to) => {
                    let row = 4;
                    let col = 0;
                    let s = false;

                    for (let y = 0; y < from.grid.ymax; y++) {
                        for (let x = 0; x < from.grid.xmax; x++) {
                            if (col >= to.wells.length) {
                                if (s) {
                                    row++;
                                    col = 0;
                                    s = false;

                                } else {
                                    s = true;
                                    col = 1;
                                }
                            }
                            to.wells[col][row].value = from.wells[x][y].value;
                            to.wells[col][row].concentration = from.wells[x][y].concentration;

                            to.wells[col][row].appendGroups(from.wells[x][y].getGroups());
                            to.wells[col][row].color = from.wells[x][y].color;
                            to.wells[col][row].structure = from.wells[x][y].structure;
                            to.wells[col][row].compoundId = from.wells[x][y].compoundId;
                            if (to.wells[col][row].source && to.wells[col][row].source.length > 0) {
                                to.wells[col][row].source.push({
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                })
                            } else {

                                to.wells[col][row].source = [{
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                }]
                            }
                            col += 2
                        }
                    }
                }
                let tr = new TransferFunction(fromPlate, toPlate, '(C-D)')
                tr.fun = fun;
                pt.transferFunctions.push(tr)
            },
            move: () => {
            }
        });

        menuList.push({
            label: `(E-F)`,
            click: (scx, scy) => {
                let fun = (from, to) => {
                    let row = 8;
                    let col = 0;
                    let s = false;

                    for (let y = 0; y < from.grid.ymax; y++) {
                        for (let x = 0; x < from.grid.xmax; x++) {
                            if (col >= to.wells.length) {
                                if (s) {
                                    row++;
                                    col = 0;
                                    s = false;

                                } else {
                                    s = true;
                                    col = 1;
                                }
                            }
                            to.wells[col][row].value = from.wells[x][y].value;
                            to.wells[col][row].appendGroups( from.wells[x][y].getGroups() );
                            to.wells[col][row].concentration = from.wells[x][y].concentration;

                            to.wells[col][row].color = from.wells[x][y].color;
                            to.wells[col][row].structure = from.wells[x][y].structure;
                            to.wells[col][row].compoundId = from.wells[x][y].compoundId;
                            if (to.wells[col][row].source && to.wells[col][row].source.length > 0) {
                                to.wells[col][row].source.push({
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                })
                            } else {

                                to.wells[col][row].source = [{
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                }]
                            }
                            col += 2
                        }
                    }
                }
                let tr = new TransferFunction(fromPlate, toPlate, '(E-F)')
                tr.fun = fun;
                pt.transferFunctions.push(tr)

            },
            move: () => {
            }
        });
        menuList.push({
            label: `(G-H)`,
            click: (scx, scy) => {
                let fun = (from, to) => {
                    let row = 12;
                    let col = 0;
                    let s = false;

                    for (let y = 0; y < from.grid.ymax; y++) {
                        for (let x = 0; x < from.grid.xmax; x++) {
                            if (col >= to.wells.length) {
                                if (s) {
                                    row++;
                                    col = 0;
                                    s = false;

                                } else {
                                    s = true;
                                    col = 1;
                                }
                            }
                            to.wells[col][row].value = from.wells[x][y].value;
                            to.wells[col][row].concentration = from.wells[x][y].concentration;

                            to.wells[col][row].appendGroups( from.wells[x][y].getGroups() );
                            to.wells[col][row].color = from.wells[x][y].color;
                            to.wells[col][row].structure = from.wells[x][y].structure;
                            to.wells[col][row].compoundId = from.wells[x][y].compoundId;
                            if (to.wells[col][row].source && to.wells[col][row].source.length > 0) {
                                to.wells[col][row].source.push({
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                })
                            } else {

                                to.wells[col][row].source = [{
                                    'plate': from.uid,
                                    'x': x,
                                    'y': y
                                }]
                            }
                            col += 2
                        }
                    }
                }
                let tr = new TransferFunction(fromPlate, toPlate, 'G-H')
                tr.fun = fun;
                pt.transferFunctions.push(tr)

            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
