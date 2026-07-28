function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {

        let freezFrame = false;
        let click_and_drag = false;
        let MGrid = await exec('flexigraph/grid.js');
        const Menu = await exec('flexigraph/menu')
        let Plate = await exec('baja/plate/plate')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        const bsize = 20;
        let cursorVisible = true;
        let cursorPos = 0;
        let cursorBlinkInterval = 500;
        let selectText = false;
        let textStyle;
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')

        const ls = {
            'Open folder': () => {
                function __decompress(compressedString) {
                    const chunkSize = 0x8000;
                    let binaryData = [];
                    for (let i = 0; i < compressedString.length; i += chunkSize) {
                        const chunk = compressedString.substring(i, i + chunkSize);
                        const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
                        binaryData.push(...chunkArray);
                    }
                    let jsonString = decompressJson(Uint8Array.from(binaryData));
                    return jsonString;
                }

                const prevousState = pt.capturestate();
                const udata = __decompress(selectedPlate.wells[0][0].properties['package'])
                pt.pushFolder(selectedPlate.uid, prevousState)
                pt.copyFromJSON(udata)

            },

            'Export table..    ': () => {
                function __decompress(compressedString) {
                    const chunkSize = 0x8000;
                    let binaryData = [];
                    for (let i = 0; i < compressedString.length; i += chunkSize) {
                        const chunk = compressedString.substring(i, i + chunkSize);
                        const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
                        binaryData.push(...chunkArray);
                    }
                    let jsonString = decompressJson(Uint8Array.from(binaryData));
                    return jsonString;
                }
                const udata = __decompress(selectedPlate.wells[0][0].properties['package'])
                let m = []
                for (let j of udata.root) {
                    m.push(
                        {
                            label: `${j.name}`,
                            click: async (x, y) => {
                                let jj = Plate.buildPlateFromJSON(j)
                                console.log('debubg');
                                pt.addNextAvailableX(jj)
                                pt.wb(null)
                            },
                            move: () => {
                            },
                        });
                }
                let cols = Math.ceil(m.length / 10);
                const smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                    pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2),
                    'rgb(0, 87, 163)', 'white', cols)
                selectedPlate.highlightbutton = true;

                let t = {

                    id: 'table_mei',
                    smenu:smenu,
                    draw: (pt__, ctx) => {
                        let grid = pt.grid;
                        if (smenu && pt.grid) {
                            smenu.draw(ctx, pt.grid)
                        }
                    },
                    mouseDownListener: async (x, y) => {

                        if (smenu) {
                            selectedPlate.highlightbutton = true;

                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            return;
                        }
                    },
                    mouseMoveListener: (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        pt.grid.rescale();
                        if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                            smenu.mouseMove(pt.grid, mmx, mmy)
                        }

                    },
                    mouseUpListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                            await smenu.mouseUp(pt.grid, mmx, mmy)

                        }
                    }
                    ,
                    close: () => {
                        selectedPlate.highlightbutton = false;

                        clearMenu();
                    },
                }
                pt.wb(t)

            },

            'Set type': async () => {
                let attr_window = ''
                let va = await prompt("Table type: " + this.plateType, ["Type"], { "Type": attr_window }, 500, 300)
                let m = va['Type']

                if (m === 'package' && this.wells[0][0]) {
                    selectedPlate.plateType = 'package'
                    selectedPlate.setWellType(0, 0, 'PACKAGE')
                }
                else
                    selectedPlate.plateType = m;

            }
        }

        resolve(ls)

    })

}
