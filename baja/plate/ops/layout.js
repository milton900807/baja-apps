function (pt, selectedPlate) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate')
        let GenericWell = await exec('baja/plate/well')

        function generateColorPalette(numColors) {
            const colors = [];
            const hueStep = 360 / numColors;
            for (let i = 0; i < numColors; i++) {
                const hue = i * hueStep;
                colors.push(`hsl(${hue}, 70%, 50%)`);
            }
            return colors;
        }

        function alignBxs(topBox, numBelowBoxes, gap = 1) {
            const boxSize = topBox.width;
            const positions = [];
            const totalBelowRowWidth = (boxSize * numBelowBoxes) + (gap * (numBelowBoxes - 1));
            const startX = topBox.xi + (topBox.width - totalBelowRowWidth) / 2;
            const startY = topBox.yi + topBox.height + gap;
            for (let i = 0; i < numBelowBoxes; i++) {
                const x = startX + (boxSize + gap) * i;
                const y = startY;
                positions.push({ x, y, width: boxSize, height: boxSize });
            }
            return positions;
        }
        function linearRegression(x, y) {
            const n = x.length;
            const sumX = x.reduce((sum, xi) => sum + xi, 0);
            const sumY = y.reduce((sum, yi) => sum + yi, 0);
            const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
            const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
            const meanX = sumX / n;
            const meanY = sumY / n;

            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = meanY - slope * meanX;

            const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
            const ssResidual = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
            const rSquared = 1 - (ssResidual / ssTotal);

            return { slope, intercept, rSquared };
        }

        function checkUniformColor(wells) {
            if (!wells || wells.length === 0) {
                return null;
            }

            const firstColor = wells[0].color;

            for (let i = 1; i < wells.length; i++) {
                if (wells[i].color !== firstColor) {
                    return null;
                }
            }

            return firstColor;
        }

        let MPlot = await exec('flexigraph/plot.js')

        const ls = {
            'Highlighter': async (x, y) => {
                console.log('debubg');
                selectedPlate.textActive = true;
                let cursorPos = 0;
                pt.updateworkbench({
                    id: 'cell-highlight',
                    mouseDownListener: async (x, y) => {
                    },
                    mouseMoveListener: async (x, y) => {
                    },
                    mouseUpListener: async (x, y) => {
                    }
                    ,
                    close: () => {
                        selectedPlate.textActive = false;
                        selectedPlate.text = ""
                    },
                    keydown: (event) => {
                        if (event.key === 'ArrowLeft') {
                            console.log('Left arrow pressed');
                            cursorPos -= 1;
                        } else if (event.key === 'ArrowRight') {
                            console.log('Right arrow pressed');
                            cursorPos += 1;
                        } else if (event.key === 'Backspace') {
                            if (cursorPos > 0) {
                                selectedPlate.text = selectedPlate.text.slice(0, cursorPos - 1) + selectedPlate.text.slice(cursorPos);
                                cursorPos -= 1;
                            }
                            selectedPlate.highlightWells(selectedPlate.text);

                        } else if (event.key === 'Enter') {
                            console.log('Enter key pressed');
                        } else {
                            if (selectedPlate.text && selectedPlate.text.length >= 0 && cursorPos >= 0) {
                                if (/^[a-zA-Z0-9]$/.test(event.key)) {
                                    selectedPlate.text = selectedPlate.text.slice(0, cursorPos) + event.key + selectedPlate.text.slice(cursorPos);
                                    selectedPlate.highlightWells(selectedPlate.text);

                                    cursorPos += 1;
                                }
                            } else {
                                console.log('Non-alphanumeric key pressed: ' + event.key);
                            }
                        }
                    }
                    ,
                    draw: (grid, ctx) => {
                    },

                })

            },
            'Define UTCs': () => {
            },
            'Define STANDARDS': () => {
            },
            'Set dilution series': () => {
            },
            'Select cells':
                () => {
                    let md = false;
                    let start;
                    let mouseDownListener = async (x, y) => {
                        md = true;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let plate = pt.getPlate(xw, yw)
                        if (plate) {
                            start = plate.getWell(xw, yw)
                            if (start) {
                                start.selectIt();

                            }
                        }
                    }
                    let mouseMoveListener = (x, y) => {
                        if (start) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let plate = pt.getPlate(xw, yw);
                            if (plate) {
                                let [currentRow, currentCol] = plate.getWellCoordinates(xw, yw);
                                if (currentRow !== undefined && currentCol !== undefined) {
                                    let startRow = Math.min(start.row, currentRow);
                                    let endRow = Math.max(start.row, currentRow);
                                    let startCol = Math.min(start.col, currentCol);
                                    let endCol = Math.max(start.col, currentCol);

                                    for (let row = startRow; row <= endRow; row++) {
                                        for (let col = startCol; col <= endCol; col++) {
                                            let well = plate.wells[row][col];
                                            if (well) {
                                                well.selectIt();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    let mouseUpListener = async (x, y) => {

                    }

                    let t = {
                        id: 'select-cells-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: null,
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },

            'Drag Select':
                () => {
                    let md = false;
                    freezFrame = false;

                    let startIndex = null;
                    let currentSelected = [];
                    let cursorIndex = null;
                    let mouseDownListener = async (x, y) => {
                        md = true;
                        currentSelected = [];
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = selectedPlate.getWell(xw, yw);
                        if (current_well) {
                            startIndex = selectedPlate.getWellRowIndex(current_well);
                            current_well.selectIt();
                            currentSelected.push({
                                w: current_well,
                                row: startIndex.rowIndex,
                                col: startIndex.colIndex
                            });
                        }
                    };

                    let mouseMoveListener = (x, y) => {
                        if (md && startIndex != null) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = selectedPlate.getWell(xw, yw);
                            if (current_well) {
                                let currentIndex = selectedPlate.getWellRowIndex(current_well);
                                if (currentIndex) {
                                    cursorIndex = currentIndex;

                                    for (let row = startIndex.rowIndex; row <= currentIndex.rowIndex; row++) {
                                        for (let col = startIndex.colIndex; col <= currentIndex.colIndex; col++) {
                                            if (selectedPlate.wells[row] && selectedPlate.wells[row][col]) {
                                                if (!currentSelected.some(cs => cs.row === row && cs.col === col)) {
                                                    currentSelected.push({
                                                        w: selectedPlate.wells[row][col],
                                                        row: row,
                                                        col: col
                                                    });
                                                    selectedPlate.wells[row][col].selectIt();
                                                }
                                            }
                                        }
                                    }

                                    currentSelected = currentSelected.filter(selected => {
                                        const isWithinBounds =
                                            selected.row >= startIndex.rowIndex &&
                                            selected.row <= currentIndex.rowIndex &&
                                            selected.col >= startIndex.colIndex &&
                                            selected.col <= currentIndex.colIndex;

                                        if (!isWithinBounds) {
                                            selected.w.deselectIt();
                                        }

                                        return isWithinBounds;
                                    });
                                }
                            }
                        }
                    };

                    let mouseUpListener = () => {
                        md = false;
                        startIndex = null;
                    };

                    let t = {
                        id: 'select-cells-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                            ctx.font = "24px Arial";

                            if (startIndex) {
                                const text = " " + Math.abs(cursorIndex.colIndex - startIndex.colIndex + 1) + " X " + Math.abs(cursorIndex.rowIndex - startIndex.rowIndex + 1)
                                const textX = grid.X(selectedPlate.grid.X(cursorIndex.rowIndex));
                                const textY = grid.Y(selectedPlate.grid.Y(cursorIndex.colIndex));

                                const textWidth = ctx.measureText(text).width;
                                const textHeight = 20;

                                const padding = 8;
                                const cornerRadius = 10;
                                const rectX = textX - padding;
                                const rectY = textY - textHeight - padding;
                                const rectWidth = textWidth + 2 * padding;
                                const rectHeight = textHeight + 2 * padding;

                                ctx.shadowBlur = 10;
                                ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                                ctx.shadowBlur = 0;
                                ctx.fillStyle = "black";
                                ctx.fillText(text, textX, textY);

                            }

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },
            'Column Select__':
                () => {
                    let md = false;
                    freezFrame = false;
                    let mouseDownListener = async (x, y) => {
                        md = true;

                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = selectedPlate.getWell(xw, yw);
                        if (current_well) {
                            selectedPlate.selectColumnAtRow(current_well.y, current_well.x)
                        }
                    };

                    let mouseMoveListener = (x, y) => {
                        if (md) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = selectedPlate.getWell(xw, yw);
                            if (current_well) {
                                selectedPlate.selectColumnAtRow(current_well.y, current_well.x)
                            }
                        }
                    };

                    let mouseUpListener = () => {
                        md = false;

                    };

                    let t = {
                        id: 'select-cell-col-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },

            'Row Select':
                () => {
                    let md = false;
                    freezFrame = false;
                    let mouseDownListener = async (x, y) => {
                        md = true;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = selectedPlate.getWell(xw, yw);
                        if (current_well) {
                            selectedPlate.selectRowAtColumn(current_well.y, current_well.x)
                        }
                    };

                    let mouseMoveListener = (x, y) => {
                        if (md) {
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = selectedPlate.getWell(xw, yw);
                            if (current_well) {
                                selectedPlate.selectRowAtColumn(current_well.y, current_well.x)
                            }
                        }
                    };

                    let mouseUpListener = () => {
                        md = false;
                    };

                    let t = {
                        id: 'select-cell-col-options-menu',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                },

            'Deselect cells':
                () => {
                    selectedPlate.deselectWells();
                },

            'Delete selected cell values':
                () => {
                    selectedPlate.deleteSelectedWellValues();
                },

        }

        if (selectedPlate.hasSelectedWells()) {

            ls['Standard dilution series to selected'] =
                async () => {

                    let WellDisplay = await exec('baja/plate/views/well-display-factory.js')
                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Enter dilutions'
                                        }
                                    }, {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Start', 'Dilution factor', 'Group Name'],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        pt.menu = null;
                                                        pt.deselectAll();

                                                        hideAllModal();
                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {
                                                        let start = +input_params['Start']
                                                        let factor = +input_params['Dilution factor']
                                                        let standard_group = input_params['Group Name']
                                                        let w = selectedPlate.getSelectedWellsInOrder()

                                                        let conc = start;
                                                        for (let i of w) {
                                                            if (i)
                                                                for (let j of i) {
                                                                    if (j) {
                                                                        j.concentration = conc;
                                                                        j.setGroup( standard_group );
                                                                    }
                                                                }
                                                            conc = conc / factor;
                                                        }

                                                        selectedPlate.updateWellView('CONCENTRATION')

                                                        setTimeout(() => {
                                                            selectedPlate.deselectWells();
                                                            selectedPlate.updateWellView(null)
                                                        }, 3000);

                                                        hideAllModal();
                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    });

                }

        }
        resolve(ls)

    })

}
