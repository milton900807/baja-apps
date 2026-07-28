function (pt, plate) {

    return new Promise(async (resolve, reject) => {
        let wells__ = plate.getSelectedWellsInOrder()
        let HM = await exec('baja/history/HM')

        let msub = [
            {
                label: 'Background color',
                click: async (x, y) => {

                    let color = null;
                    let sequence_input = {
                        wid: 'card',
                        "height": "500px",
                        data: {
                            "style.padding-top": '1px',
                            "style.border": '1px',
                            "style.height": "500px",
                            cards: [
                                [
                                    {

                                        'width': '100%',
                                        'component': {
                                            wid: 'card',
                                            data: {
                                                cards: [
                                                    [

                                                        {
                                                            'width': '100%',
                                                            'height': "100px",
                                                            "style.padding-top": '4px',
                                                            "style.border": '1px',
                                                            'component':
                                                            {
                                                                'wid': 'color-chooser',
                                                                'width': '100%',

                                                                "data": {
                                                                    "selectionListener": createIonFunction((_color) => {
                                                                        color = _color;
                                                                    })
                                                                }
                                                            }
                                                        },
                                                    ]
                                                ]
                                            }
                                        }

                                    },
                                    {
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Apply', ionFunction: createIonFunction(() => {
                                                            plate.selectAll();
                                                            console.log('debubg');
                                                            let se = plate.getSelectedWellsInOrder()
                                                            for (let w of se) {
                                                                w.skin_type = null;
                                                                w.color = color;
                                                            }
                                                            plate.deselectIt();
                                                            hideAllModal();

                                                        })

                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }

                    showModal(sequence_input);
                }

            },
            {
                label: 'Foreground color',
                click: async (__x, __y) => {

                    let color = null;
                    let sequence_input = {
                        wid: 'card',
                        "height": "500px",
                        data: {
                            "style.padding-top": '1px',
                            "style.border": '1px',
                            "style.height": "500px",
                            cards: [
                                [
                                    {

                                        'width': '100%',
                                        'component': {
                                            wid: 'card',
                                            data: {
                                                cards: [
                                                    [

                                                        {
                                                            'width': '100%',
                                                            'height': "100px",
                                                            "style.padding-top": '4px',
                                                            "style.border": '1px',
                                                            'component':
                                                            {
                                                                'wid': 'color-chooser',
                                                                'width': '100%',

                                                                "data": {
                                                                    "selectionListener": createIonFunction((_color) => {
                                                                        color = _color;
                                                                    })
                                                                }
                                                            }
                                                        },
                                                    ]
                                                ]
                                            }
                                        }

                                    },
                                    {
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Apply', ionFunction: createIonFunction(async () => {
                                                            plate.selectAll();
                                                            let se = plate.getSelectedWellsInOrder()
                                                            for (let w of se) {
                                                                w.fgcolor = color;
                                                            }
                                                            hideAllModal();
                                                        })

                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }

                    showModal(sequence_input);
                },
                move: () => {
                },
            },
        ]

        msub.push({
            label: 'Font',
            click: (__x, __y) => {
                let m = [];
                let msub = [];
                const fontFamilies = [
                    'Helvetica',
                    'Arial',
                    'Courier New',
                    'Times New Roman',
                    'Monospace'
                ];

                for (const font of fontFamilies) {
                    msub.push({
                        label: font,
                        click: (__x, __y) => {
                            plate.selectAll();
                            const se = plate.getSelectedWellsInOrder();
                            for (let w of se) {
                                w.font = font;
                            }
                        },
                        move: () => { }
                    });
                }

                pt.setMenu(msub)
            }
        })

        msub.push({
            label: `Delete`,
            click: async (xwc, ywc) => {
                pushHistory(HM(pt))
                this.removeGlyphs(plate)
            }
        });

        msub.push({
            label: 'Send to back',
            click: async (xwc, ywc) => {
                pushHistory(HM(this));
                plate.isBackground = true;
                const idx = pt.root.findIndex(g => g.uid === plate.uid);
                if (idx === -1) return;
                pt.root.splice(idx, 1);
                pt.root.unshift(plate);
            }
        });

        msub.push({
            label: 'Bring to front',
            click: async (xwc, ywc) => {

                pushHistory(HM(this));
                plate.isBackground = false;

                const idx = pt.root.findIndex(g => g.uid === plate.uid);
                if (idx === -1) return;
                pt.root.splice(idx, 1);
                pt.root.push(plate);
            }
        });

        resolve(msub);
    })

}
