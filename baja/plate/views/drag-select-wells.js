function (pt, mode) {

    return new Promise(async (resolve, reject) => {

        let Rectangle = await exec('flexigraph/shapes/rect.js')

        let md = false;
        let smenu;
        let rect;

        let v = [{
            x: 0, y: 0, label: "Selected wells: ", ionFunction: createIonFunction(() => {
            }), islabel: true
        }, {
            x: 7, y: 0, label: "Group_", ionFunction: createIonFunction(() => {
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
                                for (let rows_ of pt.root) {
                                    for (let rows of rows_.wells) {
                                        for (let cols of rows) {
                                            if (cols.select) {
                                                cols.setGroup(grp)
                                            }
                                        }
                                    }
                                }
                                if (pt.selectedPlate && pt.selectedPlate.deselectAll) {
                                    pt.selectedPlate.deselectAll();
                                }
                                hideAllModal();
                                pt.menu_vis = false;

                            })
                        }]
                    }
                }
                showModal(input_value)

            }),
        }, {
            x: 8, y: 0, label: "Concentration", ionFunction: createIonFunction(() => {
            }),
        },
        {
            x: 9, y: 0, label: "Values", ionFunction: createIonFunction(() => {
            }),
        },
        ]
        pt.updateworkbench({ 'buttons': v })

        let mouseDownListener = async (x, y) => {

            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            rect = new Rectangle('test', xw, yw);

            if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                smenu.mouseDown(pt.grid, xw, yw)
                pt.deselectPlateRoots();

                toPlate = null;
                fromPlate = null;

                smenu = null;
                return;
            }
            md = true;
        }
        let mouseMoveListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);

            if (md) {
                if (rect) {
                    rect.update(xw, yw);
                }
                if (smenu && smenu.isIn(pt.grid, xw, yw)) {
                    smenu.mouseMove(pt.grid, xw, yw)
                    return;
                }
            }
        }
        let mouseUpListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (md) {
                md = false;
                if (rect) {
                    rect.update(xw, yw);
                }

                let x = rect.x;
                let y = rect.y;
                let w = rect.w;
                let h = rect.h;

                if (pt.grid.screenWidth(w) < 10 || pt.grid.screenHeight(h) < 10) {
                    pt.deselectAll();
                    md = false;

                    return;
                }

                let root = pt.root;
                for (let p of root) {
                    p.getWellInRange(x, y, w, h)
                }
                rect = null;

            }
            md = false;
        }
        let draw = async (grid, ctx) => {
            if (rect) {
                await rect.draw(pt.grid, ctx)
            }
        }
        let menuManager = (pt, ctx) => {
            if (smenu) {
                smenu.draw(ctx, pt.grid)
            }
        }

        resolve({
            mouseDownListener: mouseDownListener,
            mouseUpListener: mouseUpListener,
            mouseMoveListener: mouseMoveListener,
            draw: draw,
            menuManager: menuManager
        })

    })

}
