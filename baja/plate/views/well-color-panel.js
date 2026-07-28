function (plate, pt, palette) {

    return new Promise(async (resolve, reject) => {

        let menu_control

        let MGrid = await exec('flexigraph/grid.js');
        let GenericWell = await exec('baja/plate/well.js')
        const Menu = await exec('flexigraph/menu')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        let md = false;

        let selected = plate.getSelectedWellsInOrder()
        let group_preferences = plate.group_preferences;
        let WellColorPalette = {
            'Column_Header': 'rgba(255, 10, 10, 0.7)',
            'Row_Header': 'rgba(10, 10, 255, 0.7)',
            'Row_Address': 'rgba(10, 10, 255, 0.7)',
            'Function': 'transparent',
            'UTC': 'rgba(32, 178, 170, 1)',
            'STANDARD': 'rgba(173, 216, 230, 1)',
            'BUFFER': 'rgba(173, 196, 100, 0.6)',
            'negative_control': 'rgba(128, 0, 128, 0.3)',
            'positive_control': 'rgba(224, 255, 255, 1)',
            'blank': 'rgba(128, 128, 128, 1)',
            'Mean': 'rgba(128, 0, 0, 0.2)',
            'Sample': 'rgba(128, 200, 0, 0.2)',
            'StdDev': 'rgba(10, 100, 228, 0.4)',
            'dCt': 'rgba(210, 200, 128, 0.4)',
            'ddCt': 'rgba(210, 100, 128, 0.4)',
            'Compound': 'rgba(110, 100, 128, 0.4)',
            'Ribogreen': 'rgba(60, 210, 68, 0.5)',
        }

        if (palette) {
            WellColorPalette = palette;
        }
        let smenu;
        let npanel;
        let __nameHook = createIonFunction((_panel) => {
            npanel = _panel;
        })
        let newgroup;
        let newgroup_name = createIonFunction((_panel) => {
            newgroup = _panel;
        })
        let color = 'rgba(250, 100, 228, 0.4)'
        function copyIfKeyNotExists(source, destination) {
            for (const key in source) {
                if (!destination.hasOwnProperty(key)) {
                    destination[key] = source[key];
                }
            }
            return destination;
        }
        group_preferences = WellColorPalette;

        let names = Object.keys(group_preferences)
        names = names.filter(item => item !== 'Other...');
        color = group_preferences[selected]

        let m = []

        for (let name of names) {
            let color = group_preferences[name]
            m.push(
                {
                    label: name,
                    click: async (x, y) => {
                        let se = plate.getSelectedWellsInOrder()
                        let wellrange = plate.getSelectedWellRange()
                        if (name === 'Function') {
                            pt.addFormula(plate.name + wellrange, se[0].value)
                            pt.wb(null)
                        } else {

                            name = name.trim();
                            for (let s of se) {
                                if (name === 'Column_Header') {
                                    let rindex = plate.getIndexOf(s)
                                    plate.applyHeaderWellForColumn(rindex.colIdx, rindex.rowIdx)
                                } else if (name === 'Row_Header') {
                                    let rindex = plate.getIndexOf(s)
                                    plate.applyHeaderWellForRow(rindex.colIdx, rindex.rowIdx)
                                } else if (name === 'Row_Address') {
                                    let rindex = plate.getIndexOf(s)
                                    plate.applyAddressWellForRow(rindex.colIdx, rindex.rowIdx)
                                } else if ( name.toLowerCase() === 'dollar')
                                {
                                    name = name.toLowerCase();
                                }
                                s.setGroup(name);
                                let rang = plate.findContiguousSelectedWells(selected)
                                LJScript.add(plate.name, `tag ${name} ${rang}`)
                                plate.deselectAll();
                                pt.wb(null)
                            }
                        }
                    },
                    move: () => {
                    },
                    bg: "lightGray",
                    fg: 'black'
                })
        }
        m.push(
            {
                label: "More...",
                click: async (x, y) => {
                    exec('baja/plate/views/well-color-panel', plate, pt, {
                        'Dollar': 'rgba(255, 10, 10, 0.7)',
                        'Percent': 'rgba(10, 10, 255, 0.7)',
                        'Operation_costs': 'rgba(10, 10, 255, 0.7)',
                        'Overhead_costs': 'transparent',
                        'FTE': 'rgba(32, 178, 170, 1)',
                        'COG': 'rgba(173, 216, 230, 1)'
                    })
                }, move: () => {
                },
                bg: color,
                fg: 'white'
            })
        m.push(
            {
                label: "New...",
                click: async (x, y) => {
                    let panel;

                    const __nameHook = createIonFunction((hook) => {
                        panel = hook;
                    })

                    function generateRandomRGBAColor() {
                        const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
                        const randomFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(2);

                        const red = randomInt(0, 255);
                        const green = randomInt(0, 255);
                        const blue = randomInt(0, 255);
                        const alpha = randomFloat(0.2, 0.8);

                        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
                    }
                    let color = generateRandomRGBAColor()
                    let name;

                    showModal(
                        {
                            wid: 'card',
                            data: {
                                padding: "10px",
                                cards: [
                                    [

                                        {
                                            'title': ' ', 'body': `
                                            `                   ,
                                            'width': '90%',
                                            'component':
                                            {
                                                'wid': 'color-chooser',
                                                'width': '100%',
                                                "data": {
                                                    "color": color,
                                                    "selectionListener": createIonFunction((_color) => {
                                                        if (_color.startsWith('#')) {
                                                            color = _color;
                                                        } else {
                                                            let c = _color['rgb']

                                                            color = `rgb(${c['r']},${c['g']},${c['b']})`

                                                        }
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': `
                                                        `,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'input-param-items',
                                                refCallback: __nameHook,
                                                data: {
                                                    'input_labels': ['Group'
                                                    ],
                                                    default_values: { 'Group': name },
                                                }
                                            }
                                        },
                                        {
                                            'title': null, 'body': `
                                                        `   ,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'button',
                                                data: [
                                                    {
                                                        'label': 'Apply', ionfunction: createIonFunction(async () => {

                                                            let name = panel.get('Group')

                                                            if (name === undefined || name === null || name.length <= 0) {
                                                                name = generateNautName();
                                                            }

                                                            group_preferences[name] = color;
                                                            for (let s of selected) {
                                                                s.setGroup(name);
                                                            }
                                                            let rang = plate.findContiguousSelectedWells(selected)
                                                            LJScript.add(plate.name, `tag ${name} ${rang}`)

                                                            setTimeout(() => {
                                                                hideAllModal();

                                                            }, 500);
                                                        }), disableAfterClick: false
                                                    },
                                                    {
                                                        'label': 'Close', ionfunction: createIonFunction(async () => {

                                                            hideAllModal();
                                                        }), disableAfterClick: false
                                                    },
                                                ]
                                            }
                                        },

                                    ]]
                            }
                        }, 500, 350

                    )

                },
                move: () => {
                },
                bg: color,
                fg: 'white'
            })

        let colcount = Math.ceil(m.length / 15);
        smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + (pt.grid.width / 2 - colcount * 100)),
            pt.grid.Ywc(pt.grid.yi + ((pt.grid.height / 2 - 200))), 'rgb(0, 87, 163)', 'black', colcount)

        let mouseMoveListener = (x, y) => {
            let mmx = pt.grid.Xwc(x);
            let mmy = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                smenu.mouseMove(pt.grid, mmx, mmy)
                return;
            }
        }

        let mouseUpListener = (x, y) => {

            let mmx = pt.grid.Xwc(x);
            let mmy = pt.grid.Ywc(y);
            md = false;
            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                smenu.mouseUp(pt.grid, mmx, mmy)
            } else {
                smenu = null;
                pt.wb(null)
            }
        };

        let t = {
            id: 'simple-menu' + Math.random(),

            mouseMoveListener: mouseMoveListener,
            mouseUpListener: mouseUpListener,
            mouseDownListener: () => {
            },
            init: (_menu_control) => {
                menu_control = _menu_control;
            },
            close: () => {
                smenu = null;
            },
            priority: true,
            draw: (grid, ctx) => {

            },
            smenu: smenu,
        }
        if (pt && pt.wb)
            pt.wb(t)

    })
}
