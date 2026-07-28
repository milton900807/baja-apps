function (pt) {
    return new Promise(async (resolve, reject) => {

        let md = false;
        let smenu;
        let selectedWB;
        let world_x;
        let world_y;
        let well;

        let mouseDownListener = async (x, y) => {
            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (pt.menu_vis &&  pt.mnenu && pt.menu.isIn(pt.grid, xw, yw)) {
                pt.menu.mouseDown(pt.grid, xw, yw)
                return;
            } else {
                pt.menu_vis = false;
            }

            let mmx = pt.grid.Xwc(x);
            let mmy = pt.grid.Ywc(y);
            if (selectedWB != null) {
                selectedWB.deselectAll();
                selectedWB.selectIt();
                selectedWB.selectWell(xw, yw);
                well = selectedWB.getWell(xw, yw);
            }
            md = true;
        }
        let mouseMoveListener = async (x, y) => {
            let xw = (pt.grid.Xwc(x));
            let yw = (pt.grid.Ywc(y));
            world_x = xw + 0;
            world_y = yw + 0.12;
            let mmx = pt.grid.Xwc(x - 10);
            let mmy = pt.grid.Ywc(y - 2);
            if (pt.menu_vis && pt.menu && pt.menu.isIn(pt.grid, mmx, mmy)) {
                well = null;
                pt.menu.mouseMove(pt.grid, mmx, mmy)
                return;
            }
            if (md) {
                selectedWB = pt.getPlate(xw, yw);
                if (selectedWB != null) {
                    selectedWB.selectIt();
                    pt.setSelected (selectedWB);
                    selectedWB.selectWell(xw, yw);
                    well = selectedWB.getWell(xw, yw);
                }
            } else {
                pt.menu_vis = false;
                pt.menu = null;
                pt.deselectAll();
                pt.deselectPlateRoots();
                selectedWB = pt.getPlate(xw, yw);
                if (selectedWB != null) {
                    selectedWB.selectIt();
                    well = selectedWB.getWell(xw, yw);
                } else {
                    well = null;
                }
            }
        }
        let mouseUpListener = async (x, y) => {
            let mmx = pt.grid.Xwc(x - 15);
            let mmy = pt.grid.Ywc(y - 10);
            if (selectedWB != null) {
                well = null;
                pt.menu = await exec('baja/plate/views/edit-well-menu.js', pt);
                pt.menu.x = mmx;
                pt.menu.y = mmy;
                pt.menu_vis = true;
                let editor_;
                let annotation_editor = createIonFunction((editor) => {
                    editor_ = editor;
                })
                let filter_panel = {
                    wid: 'card',
                    data: {
                        cards: [
                            [

                                {
                                    'width': '100%',
                                    "style.padding-top": '4px',
                                    "style.border": '1px',
                                    'component':
                                    {
                                        'wid': 'json',
                                        refCallback: annotation_editor,
                                        'data': JSON.stringify(well)
                                    }
                                }, {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Save', ionFunction: createIonFunction(async () => {
                                                        let name = editor_.data;
                                                        try {
                                                            let jv = JSON.parse(name.trim());
                                                            selectedWB.deselectAll();

                                                        } catch (exception) {
                                                            showModal({
                                                                wid: 'json',
                                                                data: '' + name
                                                            })

                                                        }

                                                    })
                                                }, {
                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {
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
            }
            pt.menu_vis= false;
            pt.menu = null;

            md = false;
        }
        const min = 0;
        const max = 1;

        let draw = (grid, ctx) => {
            if (world_x != undefined && world_y != undefined) {
                if (well && well.drawToSize) {
                    let ww = grid.worldWidth(200)
                    let wh = grid.worldHeight(240)

                }
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
