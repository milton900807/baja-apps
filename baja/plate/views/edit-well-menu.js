function (pt) {

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
            label: `Deselect cells`,
            click: (scx, scy) => {
                if (pt.selectedPlate && pt.selectedPlate.deselectAll)
                    pt.selectedPlate.deselectAll();
                pt.menu_vis = false;

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Paste in values...`,
            click: (scx, scy) => {
                let desc = {
                    'wid': 'input-textarea-editor',
                    'title': 'Apply values to wells',
                    'data': {
                        'ionHookFunction': createIonFunction((w) => {
                        }),
                        'ionFunction': createIonFunction((description) => {
                            let desc = description[0]
                            let sorted = pt.selectedPlate.selectedWells.sort(function (a, b) {
                                if (a.name < b.name) {
                                    return -1;
                                }
                                if (a.name > b.name) {
                                    return 1;
                                }
                                return 0;
                            })

                            let values = []
                            let t = desc.split('\n')
                            for (let row of t) {
                                row = row.trim();
                                let rs = row.split(' ');
                                console.log('debubg');
                                for (let r of rs) {

                                    r = r.trim();
                                    if (r && r.length > 0) {
                                        values.push(parseFloat(r.trim()))
                                    }
                                }
                            }
                            let index = 0;
                            for (let w of sorted) {
                                w.value = values[index]
                                console.log(" value " + values[index])
                                index++;
                            }
                        })
                    }
                }

                let paste_values_panel = {
                    wid: 'card',
                    data: {
                        height: '800px',
                        cards: [
                            [
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': desc
                                }
                            ]]
                    }
                }
                showModal(paste_values_panel);
                pt.menu_vis = false;

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Group...`,
            click: (scx, scy) => {

                let input_value = {
                    wid: 'input-param-items',
                    data: {
                        input_labels: ['Group'],
                        buttons: [{
                            'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                hideAllModal();
                            })
                        }, {
                            'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                let grp = input_params['Group']
                                console.log('debubg');
                                for (let r of pt.root) {
                                    for (let rows of r) {
                                        for (let cols of rows) {
                                            if (cols.select) {
                                                cols.setGroup(grp)
                                            }
                                        }
                                    }
                                }
                                if (pt.selectedPlate && pt.selectedPlate.deselectAll)
                                    pt.selectedPlate.deselectAll();
                                hideAllModal();
                                pt.menu_vis = false;

                            })
                        }]
                    }
                }
                showModal(input_value)

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Set concentration`,
            click: (scx, scy) => {
                let input_value = {
                    wid: 'input-param-items',
                    data: {
                        input_labels: ['Concentration'],
                        buttons: [{
                            'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                hideAllModal();
                            })
                        }, {
                            'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                let grp = input_params['Concentration']
                                for (let rows of pt.selectedPlate.wells) {
                                    for (let cols of rows) {
                                        if (cols.select) {
                                            cols.concentration = +grp;
                                        }
                                    }
                                }
                                pt.menu_vis = false;
                                pt.selectedPlate.deselectAll();
                                hideAllModal();
                            })
                        }]
                    }
                }
                showModal(input_value)

            },
            move: () => {
            }
        });

        menuList.push({
            label: `Clear all values `,
            click: (scx, scy) => {
                for (let rows of pt.selectedPlate.wells) {
                    for (let cols of rows) {
                        if (cols.select) {
                            cols.concentration = null;
                            cols.clearGroups();
                            cols.value = null;
                            cols.structure = null;
                            cols.color = 'lightGray'
                            cols.score = null;
                            cols.concentration = null;

                        }
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
