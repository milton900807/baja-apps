function (pm) {

    function filterFormulasByAllTableNames(formulas, allowedTableNames) {
        const allowedSet = new Set(allowedTableNames);
        const tableRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\[/g;

        const containsOnlyAllowedTables = str => {
            const tables = [...str.matchAll(tableRegex)].map(match => match[1]);
            return tables.every(table => allowedSet.has(table));
        };

        const filtered = {};

        for (const [key, value] of Object.entries(formulas)) {
            if (containsOnlyAllowedTables(key) && containsOnlyAllowedTables(value)) {
                filtered[key] = value;
            }
        }

        return filtered;
    }

    return new Promise(async (resolve, reject) => {
        const load_file = async (path, name) => {
            let jsonobj = {
                'spath': path,
                'rule_name': name,
                'user': getUser()
            }
            let host_ = window['env']['apiUrl']
            let rs = await POSTJSON(jsonobj, host_ + '/get-script');
            return rs;
        }
        const spath = '/baja/templates'
        let host_ = window['env']['apiUrl']
        let r = await POSTJSON({ spath: spath }, host_ + '/ljl-tree');

        async function convertPlateTrackToPlate(platetrack, graph) {
            return new Promise(async (resolve, reject) => {
                try {
                    const ggs = platetrack.toJSON();
                    const objects = platetrack.getAllObjects();
                    const names = objects.map(obj => obj.name);
                    ggs.formulas = filterFormulasByAllTableNames(ggs.formulas, names);
                    ggs.root = platetrack.getAllPlates();
                    ggs.m_plots = platetrack.getAllPlots();
                    ggs.glyphs = platetrack.getAllGlyphs();

                    const gs = JSON.stringify(ggs, function (key, value) {
                        if (key != null && key.toLowerCase().startsWith('_')) {
                            return null;
                        } else if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            } else {
                                return value;
                            }
                        }
                        return value;
                    });

                    const binaryData = compressString(gs);
                    const chunkSize = 0x8000;
                    let stringData = '';
                    for (let i = 0; i < binaryData.length; i += chunkSize) {
                        const chunk = binaryData.subarray(i, i + chunkSize);
                        stringData += String.fromCharCode.apply(null, chunk);
                    }

                    platetrack.reset();

                    const Plate = await exec('baja/plate/plate.js');
                    const attr_window = '';

                    const name = platetrack.name

                    const plate = new Plate(name, 1, 1);
                    plate.plateType = 'package';
                    plate.completeNullValues();

                    const index = 0;
                    const x = platetrack.grid.getWorldCenter().x;
                    const y = platetrack.grid.getWorldCenter().y;
                    const rectWidth = graph.worldWidth(650);
                    const rectHeight = graph.worldHeight(230);

                    plate.setWellValue(0, index, name);
                    plate.wells[0][0].properties['package'] = stringData;
                    plate.setWellType(0, index, 'PACKAGE');

                    plate.grid.width = rectWidth;
                    plate.grid.height = rectHeight;
                    plate.grid.xi = platetrack.grid.width / 2;
                    plate.grid.yi = platetrack.grid.height / 2;

                    resolve(plate)

                } catch (error) {
                    reject(error);
                }
            });
        }

        const buildNode = (node) => {
            if (node.type === 'directory') {
                return {
                    label: '[' + node.name + ']/',
                    children: node.children.map(buildNode),
                    click: () => { }
                };
            } else if (node.type === 'file' && node.name.endsWith('.bjb')) {
                let dir = node.path.split('/').slice(0, -1).join('/').replace(/\\/g, '/');

                pm.plateTrack.setMessage(" Loading model... ")

                return {
                    label: node.name.replace('.bjb', ''),
                    path: node.path,
                    click: async () => {
                        if (dir.length > 0 && !dir.startsWith('/')) {
                            dir = '/' + dir;
                        }
                        const file = node.name;
                        const val = await load_file(spath + '' + dir, file);
                        let PlateTrack = await exec('baja/plate/plate-track');
                        if (val.rule_value) {

                            let pt = __decompress(val.rule_value);
                            if (pt && pt.plateTrack) {
                                pt = pt.plateTrack;
                            }
                            if (pt && pt.root) {
                                let ffs = Object.assign(new PlateTrack(), pt);
                                ffs.copyFromJSON(pt);
                                ffs.name = file;
                                if (ffs.root.length === 1 && ffs.root[0].plateType === 'package') {
                                    let folder = ffs.root[0]

                                    folder.grid.width = pm.plateTrack.grid.worldWidth(250)
                                    folder.grid.height = pm.plateTrack.grid.worldWidth(200)

                                    pm.plateTrack.setPlateCenter(folder)
                                    setTimeout(() => {
                                        pm.plateTrack.zoomintoplate(folder);
                                        setTimeout(() => {
                                            pm.plateTrack.setMessage(" Click on folder to open...", 2)

                                        }, 200)
                                    }, 100);

                                } else {

                                    let folder = await convertPlateTrackToPlate(ffs, pm.plateTrack.grid)
                                    folder.grid.width = pm.plateTrack.grid.worldWidth(250)
                                    folder.grid.height = pm.plateTrack.grid.worldWidth(200)

                                    setTimeout(() => {
                                        pm.plateTrack.setPlateCenter(folder)
                                    }, 200);
                                }
                                pm.plateTrack.generateTableMenu();
                            }
                        }
                    }
                };
            }
        }

        const t = r.map(buildNode);

        const t_depcreated = [
            {
                label: 'Budgets',
                description: ' Models for budgeting over time...',
                click: () => {
                },
                children: [
                    {
                        label: 'Simple',
                        click: () => { },
                        children: [
                            {
                                'label': 'Screening experiment', 'click': async () => {
                                    const val = await load_file('baja/templates', 'model.bjb')
                                    let PlateTrack = await exec('baja/plate/plate-track')
                                    if (val.rule_value) {
                                        let pt = __decompress(val.rule_value);
                                        if (pt && pt.plateTrack) {
                                            let ffs = Object.assign(new PlateTrack(), pt.plateTrack)
                                            ffs.copyFromJSON(pt.plateTrack)
                                            let last = null;
                                            for (const r of ffs.root) {
                                                pm.plateTrack.root(r)
                                                last = r;
                                            }
                                            for (const k of Object.keys(ffs.formulas)) {
                                                pm.plateTrack.formulas[k] = ffs.formulas[k]
                                            }

                                            pm.plateTrack.setMessage(" Loading package...")

                                            setTimeout(() => {
                                                pm.plateTrack.zoomintoplate(last)
                                            }, 100)
                                            pm.plateTrack.generateTableMenu();
                                        }
                                    }
                                }
                            },
                            {
                                'label': 'Simple budget', 'click': async () => {
                                    const val = await load_file('baja/templates', 'simple-pnl-model.bjb')
                                    let PlateTrack = await exec('baja/plate/plate-track')
                                    if (val.rule_value) {
                                        let pt = __decompress(val.rule_value);
                                        if (pt && pt.plateTrack) {
                                            let ffs = Object.assign(new PlateTrack(), pt.plateTrack)
                                            ffs.copyFromJSON(pt.plateTrack)

                                            console.log('debubg');
                                            for (const k of Object.keys(ffs.formulas)) {
                                                pm.plateTrack.formulas[k] = ffs.formulas[k]
                                            }
                                            let last = null;
                                            for (const r of ffs.root) {
                                                pm.plateTrack.root(r)
                                                last = r;
                                            }
                                            pm.plateTrack.setMessage(" Loading package...")

                                            setTimeout(() => {
                                                pm.plateTrack.zoomintoplate(last)
                                            }, 100)
                                            pm.plateTrack.generateTableMenu();
                                        }
                                    }
                                }
                            },

                        ]
                    },
                    {
                        label: 'Transparent',
                        click: () => { },
                        children: [
                            {
                                'label': 'Transparent table', 'click': async () => {

                                    await exec('baja/draw/draw-table', pm.plateTrack, 'transparent')
                                }
                            },]
                    }
                ]
            },
            {
                label: 'Experiments',
                click: () => {

                },
                children: [
                    {
                        label: 'HTS',
                        desc: ' High throughput screening',
                        children: [
                            {
                                'label': '384 Well Plate', 'click': async () => {

                                    let new_plate_panel;
                                    let __nameHook = createIonFunction((ed) => {
                                        new_plate_panel = ed;
                                    });
                                    let plateName = {
                                        wid: 'card',
                                        data: {
                                            'style.padding-left': '5px',
                                            'style.padding-top': '1px',
                                            cards: [
                                                [
                                                    {
                                                        'width': '85%',
                                                        'body': ``,
                                                        'component':
                                                        {
                                                            wid: 'input-param-items',
                                                            refCallback: __nameHook,
                                                            data: {
                                                                'input_labels': ['Name'],
                                                            }
                                                        },

                                                    }
                                                ],

                                                [

                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Create plate', ionFunction: createIonFunction(async (button) => {
                                                                            let name = new_plate_panel.get('Name')

                                                                            hideAllModal();
                                                                            let plate = pm.plateTrack.newRoot(name, 'layout', 24, 16)
                                                                            pm.plateTrack.setMessage(" Loading package...")

                                                                            setTimeout(() => {
                                                                                pm.plateTrack.zoomintoplate(plate);
                                                                            }, 100)

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
                                    showModal(plateName, 400, 300)

                                }
                            },
                            {
                                'label': '96 well plate', 'click': async () => {
                                    let plateDimensions = 96;
                                    let currentType = 'layout'
                                    let new_plate_panel;
                                    let __nameHook = createIonFunction((ed) => {
                                        new_plate_panel = ed;
                                    });
                                    let plateName = {
                                        wid: 'card',
                                        data: {
                                            'style.padding-left': '5px',
                                            'style.padding-top': '1px',
                                            cards: [
                                                [
                                                    {
                                                        'width': '85%',
                                                        'body': ``,
                                                        'component':
                                                        {
                                                            wid: 'input-param-items',
                                                            refCallback: __nameHook,
                                                            data: {
                                                                'input_labels': ['Name'],
                                                            }
                                                        },

                                                    }
                                                ],

                                                [

                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Create plate', ionFunction: createIonFunction(async (button) => {
                                                                            let name = new_plate_panel.get('Name')

                                                                            hideAllModal();
                                                                            let plate = pm.plateTrack.newRoot(name, currentType, 12, 8)

                                                                            setTimeout(() => {
                                                                                pm.plateTrack.zoomintoplate(plate);
                                                                            }, 100)

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

                                    showModal(plateName, 400, 300)

                                }
                            }

                        ]
                    }
                ]
            },

        ];

        return resolve(t);

    })

}
