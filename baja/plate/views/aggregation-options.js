function (plate, pt) {

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
            'Column': 'rgba(60, 210, 68, 0.5)',
            'Row': 'rgba(250, 100, 228, 0.4)'
        }
        function getDistinctGroupKeys(cells) {
            const distinctKeys = new Set();
            cells.forEach(cell => {
                if (cell.group && typeof cell.group === 'object') {
                    Object.keys(cell.group).forEach(key => distinctKeys.add(key));
                }
            });
            return Array.from(distinctKeys);
        }

        let keys = getDistinctGroupKeys(selected)
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
        function copyIfKeyNotExists(keys, destination) {
            let newdic = {}
            for (const key in keys) {
                if (!destination.hasOwnProperty(key)) {
                    newdic[key] = destination[key];
                }
            }
            return newdic;
        }
        let gp = copyIfKeyNotExists(keys, group_preferences)
        let names = Object.keys(gp)
        names = names.filter(item => item !== 'Other...');
        let m = []
        for (let name of keys) {
            let color = group_preferences[name]

            m.push(
                {
                    label: name,
                    click: async (x, y) => {
                        let se = plate.getSelectedWellsInOrder()
                        let interpreter = await exec('baja/engine/interpreter.js', pt)
                        interpreter.ref = plate;
                        let fal = await interpreter.run('aggregate into temp');
                        console.log(" aggregation complete ")
                    },
                    move: () => {
                    },
                    bg: color,
                    fg: 'black'
                })
        }

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

                                                            let name = panel.get('Name')

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
                fg: null
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
            id: 'simple-menu',

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
