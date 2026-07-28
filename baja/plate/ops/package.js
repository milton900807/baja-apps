function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
        const Menu = await exec('flexigraph/menu')
        let Plate = await exec('baja/plate/plate')
        let HM = await exec('baja/history/HM')
        const ls = {
            'Open..': async () => {
                pt.menu = null;
                const currentState = pt.capturestate();
                const udata = __decompress(selectedPlate.wells[0][0].properties['package'])
                pt.copyFromJSON(udata)
                pt.pushFolder(selectedPlate.uid, currentState)
                pt.deselectAll();
                pt.wb(null)
            },
            'Export table...': () => {
                pushHistory(HM(pt))
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
                                jj.parent_reference = selectedPlate.uid;
                                jj.plateType = 'package-export'
                                if (jj.rescaleDimensions) {
                                    jj.rescaleDimensions(pt)
                                }
                                jj.input_to.push(selectedPlate.uid)
                                await pt.addNextAvailableX(jj)
                                const tablename = j.name;
                                const graph = CurrentLayout.getStashed('graph')
                                graph.setMouseMode("msg:Click on canvas to drop the table")
                                let ltable = pt.getTableByName(tablename);
                                const t = {
                                    id: 'override-droptable',
                                    mouseMoveListener: async (x, y) => {
                                        ltable.grid.xi = pt.grid.Xwc(x);
                                        ltable.grid.yi = pt.grid.Ywc(y) - ltable.grid.height;
                                    },
                                    mouseUpListener: async (x, y) => {
                                        ltable.grid.xi = pt.grid.Xwc(x);
                                        ltable.grid.yi = pt.grid.Ywc(y) - ltable.grid.height;
                                        ltable.selectWellsByString('[0:][0:]');
                                        ltable.deselectWells();
                                        pt.wb(null)
                                    },
                                    mouseDownListener: async (x, y) => {
                                    },
                                    init: () => {
                                    },
                                    close: () => {
                                    },
                                    priority: true,
                                    draw: (_grid, ctx) => {
                                    },
                                };
                                pt.wb(t)

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
                pt.setMenu(smenu)
            },

            'Link...': async () => {
                const graph = CurrentLayout.getStashed('graph')
                let v = await exec('baja/table/io/open-yakro-into-folder', graph, selectedPlate, '/app/cpd/bajabio-analytics')
                showModal(v)

            },

            'Copy': async () => {
                let gs = JSON.stringify(selectedPlate)

                navigator.clipboard.writeText(gs).then(() => {
                    console.log("Object copied to clipboard!");
                    pt.setMessage(" Copied ")
                }).catch(err => {
                    console.error("Failed to copy object to clipboard: ", err);
                });

            },
            'Expert...': async () => {

                let menuList = []
                menuList.push({
                    label: `Package into folder`,
                    click: async (xwc, ywc) => {
                    }
                },


                )
                menuList.push({
                    label: 'Set type', click: async () => {
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
                )
                menuList.push({
                    label: `Copy...`,
                    click: async (xwc, ywc) => {
                    }
                })
                menuList.push({
                    label: `Delete`,
                    click: async (xwc, ywc) => {
                    }
                })


                menuList.push({
                    label: 'Publish', click: async () => {
                        exec('baja/table/io/publish-yakro', pt, '/')
                    },


                })

                menuList.push(

                    {
                        label: 'Export all...', click: async () => {
                            let confirm = await exec('baja/lib/confirm.js', 'Export all tables? ' + selected_wells.length + ' cells?', async () => {
                                pushHistory(HM(pt))
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

                                let jroot = []
                                for (let j of udata.root) {
                                    let jj = Plate.buildPlateFromJSON(j)
                                    jj.parent_reference = selectedPlate.uid;
                                    if (jj.rescaleDimensions) {
                                        jj.rescaleDimensions(pt)
                                    }
                                    selectedPlate.plates.push(jj)

                                    await pt.panToNextSpot(jj.getWidth())
                                    pt.addNextAvailableX(jj);

                                }

                                let fk = Object.keys(udata.formulas);
                                for (let f of fk) {
                                    pt.formulas[f] = udata.formulas[f]
                                }

                            })

                        }
                    })

                pt.setMenu(menuList)
            },

        }
        resolve(ls)
    })
}
