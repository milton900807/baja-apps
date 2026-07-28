function (pt, plate) {

    return new Promise(async (resolve, reject) => {

        let wells__ = plate.getSelectedWellsInOrder()
        const Menu = await exec('flexigraph/menu')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        const bsize = 20;
        let cursorPos = 0;
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        let mouseX;
        let mouseY;

        let m = [

            {
                label: 'Table name: ' + plate.name,
                click: async (x, y) => {
                    let attr_window = ''
                    let va = await prompt("Table name: " + plate.name, ["Name"], { "Name": attr_window }, 500, 300)
                    let m = va['Name']
                    plate.name = m;
                    pt.updateworkbench(null)

                },
                move: () => {
                },
            },

            {
                label: 'Table Type: ' + plate.name,
                click: async (x, y) => {
                    let attr_window = ''
                    let va = await prompt("Table type: " + plate.plateType, ["Type"], { "Type": attr_window }, 500, 300)
                    let m = va['Type']
                    plate.plateType = m;
                },
                move: () => {
                },
            },
            {
                label: 'Enter concentrations',
                click: (x, y) => {
                    console.log('debubg');
                    let w = plate.getSelectedWellsInOrder();
                    plate.smenu = null;

                    const enterconcentrations = (pt) => {
                        let cursorPos = 0;
                        if (w != null && w.length === 1) {
                            pt.selected_well = w[0]
                        }
                        if (!pt) {
                            return;
                        }
                        let keydown = (event) => {
                            if (event.ctrlKey && event.key !== 'Control') {
                                return;
                            }
                            if (event.key == 'Control') {
                                return;
                            }
                            w = plate.getSelectedWellsInOrder();
                            if (!pt.select_well && w && w.length > 0) {
                                pt.setSelected(plate);
                            }
                            if (event.key === 'Backspace') {
                                if (w != null && w.length === 1) {
                                    if (!pt.selected_well) {
                                        pt.selected_well = w[0]
                                    }
                                    if (!pt.selected_well.value) {
                                        pt.selected_well.setValue('');
                                        return;
                                    }
                                    let length = (pt.selected_well.value + '').length;
                                    pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                                    cursorPos -= 1;
                                    return;
                                } else
                                    if (w != null && w.length > 1) {
                                        let length = (pt.selected_well.value + '').length;
                                        pt.selected_well.setValue((pt.selected_well.value + '').substring(0, length - 1));
                                        cursorPos -= 1;
                                        return;
                                    }
                            }
                            else if (event.key === 'Enter') {

                                if (pt.selected_well && pt.selected_well.value) {
                                    let id = plate.getWellIndicies(pt.selected_well)
                                    LJScript.add(plate.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)
                                }
                                plate.deselectAll()
                                plate.selectIt();
                                return;
                            }
                            if (event.key === 'Tab') {

                                if (pt.selected_well && pt.selected_well.value) {
                                    let id = plate.getWellIndicies(pt.selected_well)
                                    LJScript.add(plate.name, `update ${id.colIdx},${id.rowIdx} ` + pt.selected_well.value)
                                }
                            }
                            else if (event.key === 'Delete') {
                                if (w && w.length > 0) {
                                    for (let a of w) {
                                        a.setValue('')
                                        let id = plate.getWellIndicies(a)
                                        LJScript.add(plate.name, `update ${id.colIdx},${id.rowIdx} ` + '')
                                    }
                                }
                                return;
                            }
                            if (/^[a-zA-Z0-9!.\-%$*&#@()\[\]{}_ :,\-]$/.test(event.key)) {
                                let w = plate.getSelectedWellsInOrder();
                                if (w != null && w.length === 1) {
                                    pt.selected_well = w[0]
                                    if (pt.selected_well.textSelected) {
                                        pt.selected_well.setValue('');
                                        pt.selected_well.textSelected = false;
                                        cursorPos = 0
                                    }
                                    pt.selected_well.setValue(pt.selected_well.value + event.key);
                                } else if (w != null && w.length > 1) {
                                    if (!pt.selected_well) {
                                        pt.selected_well = w[0]
                                    }
                                    if (pt.selected_well.textSelected) {
                                        pt.selected_well.setValue('');
                                        pt.selected_well.textSelected = false;
                                        cursorPos = 0
                                    }
                                    pt.selected_well.setValue(pt.selected_well.value + event.key);
                                }
                            }
                            plate.handleKeyDown(pt, event)

                        }

                        let current_well = null;

                        let mouseDownListener = async (x, y) => {
                            let w = plate.getSelectedWellsInOrder();
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            if (ref) {
                                ref.hideEditor();
                            }
                            if (w && w.length > 0) {
                                pt.selected_well = w[0]
                            }
                            if (olp) {
                                return;
                            }
                            const mmx = pt.grid.Xwc(x);
                            const mmy = pt.grid.Ywc(y);
                            if (!plate.inside(pt.grid, mmx, mmy)) {
                                return;
                            }
                            plate.editWell(current_well, pt)
                            if (w && w.length === 1 && w[0] === current_well) {
                                pt.selected_well = w;
                                singleSelect = true;
                                textStyle = 'data'
                                return;
                            } else if (w && w.length === 0 && !current_well) {

                                singleSelect = false;
                                return;
                            } else if (w && w.length === 1 && w[0] != current_well) {
                                current_well = w[0]
                                singleSelect = true;
                            }
                            else {
                                singleSelect = false;
                            }
                            if (current_well) {
                                if (current_well.select) {
                                    current_well.deselectIt()
                                    currentSelected = currentSelected.filter(function (item) {
                                        return item.w !== current_well;
                                    });
                                    return;
                                }
                            }

                        }

                        let mouseMoveListener = async (x, y) => {
                        }
                        let mouseUpListener = (x, y) => {
                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                        }

                        let t = {
                            id: 'enter_concentration' + plate.name,
                            mouseMoveListener: mouseMoveListener,
                            mouseUpListener: mouseUpListener,
                            mouseDownListener: mouseDownListener,
                            keydown: keydown,
                            init: () => {
                            },
                            close: () => {
                                clearMenu();
                            },
                            priority: true,
                            draw: (grid, ctx) => {
                            },
                            menuManager: null,
                            smenu: null
                        }
                        if (pt && pt.wb)
                            pt.wb(t)
                    }
                    enterconcentrations(pt)
                },
                move: () => {
                },

            },
            {
                label: 'Copy Concentration',
                click: (x, y) => {
                    let generateWellObjects = (wells2DArray) => {
                        let wellObjectsArray = [];
                        for (let rowIndex = 0; rowIndex < wells2DArray.length; rowIndex++) {
                            for (let colIndex = 0; colIndex < wells2DArray[rowIndex].length; colIndex++) {
                                let well = wells2DArray[rowIndex][colIndex];
                                wellObjectsArray.push({
                                    position: well.position,
                                    concentration: well.concentration || null
                                });
                            }
                        }
                        return wellObjectsArray;
                    }

                    let jb = generateWellObjects(plate.wells)
                    infoPrompt(" Copied !")
                    navigator.clipboard.writeText(JSON.stringify(jb)).then(() => {
                        console.log("Object copied to clipboard!");
                    }).catch(err => {
                        console.error("Failed to copy object to clipboard: ", err);
                    });
                },
                move: () => {
                },
            },
            {
                label: 'Deselect cells',
                click: async (x, y) => {
                    for (let x = 0; x < plate.wells.length; x++) {
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well) {
                                well.select = false;
                            }
                        }
                    }

                },
                move: () => {
                }
                ,
                bg: 'yellow',
                fg: 'black'
            }

        ]
        return resolve(m);
    })

}
