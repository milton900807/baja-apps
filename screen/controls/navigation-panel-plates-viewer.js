function (plate_graph, selectedPlate, selectedPoint) {
    return new Promise(async (resolve, reject) => {
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')
        let MPlot = await exec('flexigraph/plot.js')
        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let TransferFunction = await exec('baja/plate/transfer-functions.js')
        let Menu = await exec('flexigraph/menu.js');

        const drawCircleIcon = (xx, grid, ctx, mo, md, img) => {
            let buttonX = grid.X(xx);
            let buttonY = grid.Y(grid.ymax);

            let circleRadius = bsize / 2;
            let centerX = buttonX + bsize / 2;
            let centerY = buttonY + bsize / 2;

            ctx.fillStyle = 'lightCyan';

            if (mo) {
                ctx.fillStyle = 'cyan';
            }
            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';

            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
            ctx.fill();

            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.clip();

            ctx.restore();

            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 0;
            ctx.stroke();

            if (img) {
                ctx.drawImage(img, centerX - circleRadius, centerY - circleRadius, circleRadius * 2, circleRadius * 2);
            }

        }
        const drawRoundedRectIcon = (_name, xx, grid, ctx, mo, md, img) => {
            let buttonX = grid.X(xx);
            let buttonY = grid.Y(grid.ymax);

            let iconSize = bsize;
            let cornerRadius = 5;

            ctx.font = '14px sans-serif';
            const textPadding = 8;
            const textMetrics = ctx.measureText(_name);
            const textWidth = textMetrics.width;

            let rectWidth = iconSize + textPadding + textWidth;
            let rectHeight = iconSize;

            ctx.fillStyle = 'lightCyan';
            if (mo) {
                ctx.fillStyle = 'cyan';
            }

            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';

            ctx.beginPath();
            ctx.moveTo(buttonX + cornerRadius, buttonY);
            ctx.arcTo(buttonX + rectWidth, buttonY, buttonX + rectWidth, buttonY + rectHeight, cornerRadius);
            ctx.arcTo(buttonX + rectWidth, buttonY + rectHeight, buttonX, buttonY + rectHeight, cornerRadius);
            ctx.arcTo(buttonX, buttonY + rectHeight, buttonX, buttonY, cornerRadius);
            ctx.arcTo(buttonX, buttonY, buttonX + rectWidth, buttonY, cornerRadius);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.clip();
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';

            if (img) {
                ctx.drawImage(img, buttonX, buttonY, iconSize, iconSize);
            }

            ctx.restore();

            ctx.fillStyle = 'black';
            ctx.textBaseline = 'middle';
            ctx.fillText(_name, buttonX + iconSize + textPadding, buttonY + iconSize / 2);

            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        };

        let zoomin = async () => {
            AnimateGrid.INTERUPT = true;

            plate_graph.plateTrack.grid.rescale();

            mousePriority = false;

            let xmax = plate_graph.plateTrack.grid.xmax;
            let xmin = plate_graph.plateTrack.grid.xmin;
            let ymax = plate_graph.plateTrack.grid.ymax;
            let ymin = plate_graph.plateTrack.grid.ymin;
            let xdf = Math.abs((xmax - xmin) / 10);
            let ydf = Math.abs((ymax - ymin) / 10);

            ymax -= ydf;
            ymin += ydf;
            xmax -= xdf;
            xmin += xdf;
            let ag = new AnimateGrid(plate_graph.plateTrack.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);
            plate_graph.plateTrack.grid.rescale();
        }

        let zoomout = async () => {
            AnimateGrid.INTERUPT = true;
            plate_graph.plateTrack.grid.rescale();
            smenu = null;
            mousePriority = false;

            let xmax = plate_graph.plateTrack.grid.xmax;
            let xmin = plate_graph.plateTrack.grid.xmin;
            let ymax = plate_graph.plateTrack.grid.ymax;
            let ymin = plate_graph.plateTrack.grid.ymin;
            let xdf = Math.abs((xmax - xmin) / 10);
            let ydf = Math.abs((ymax - ymin) / 10);

            ymax += ydf;
            ymin -= ydf;
            xmax += xdf;
            xmin -= xdf;
            let ag = new AnimateGrid(plate_graph.plateTrack.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);
            plate_graph.plateTrack.grid.rescale();
        }

        let zoomtofitplates = () => {
            AnimateGrid.INTERUPT = true;
            plate_graph.plateTrack.zoomtfit()
        }

        const lassoIcon = new Image();
        lassoIcon.src = '/assets/img/icons/png/lasso.svg';
        lassoIcon.onload = () => {

        }

        const bsize = 24

        let __name = '--'
        if (selectedPlate) {
            __name = selectedPlate.name;
        }
        let interpreter = await exec('baja/engine/interpreter.js', plate_graph.plateTrack)
        let timeline_interpreter = await exec('baja/engine/timeline-interpreter.js', plate_graph.plateTrack)
        if (selectedPlate && selectedPlate.getContextMenuItems) {
            let m = await selectedPlate.getContextMenuItems(plate_graph.plateTrack);
            m = Menu.removeDuplicateLabels(m)
            let menu_title = `Menu`
            if (__name) {
                menu_title = `${__name}`
            }
            let truncated_title = menu_title.length > 10
                ? menu_title.slice(0, 10) + "..."
                : menu_title;

            menu_title = truncated_title;
            if (selectedPlate && !selectedPoint) {
                let menuItm = {
                    wid: 'menu',
                    data: {
                        cmd: createIon(async (str, panel) => {
                            if (selectedPlate.type === 'timeline') {

                                let r = await timeline_interpreter.executeCommand(str)

                                function stringToDate(dateString) {

                                    const [year, month, day] = dateString.split('-').map(Number);
                                    return new Date(year, month - 1, day);
                                }
                                const startDate = stringToDate(r.start_date)
                                let endDate = stringToDate(r.start_date);
                                if ( r.end_date ){
                                    endDate = stringToDate (r.end_date)
                                }
                                plate_graph.plateTrack.setMessage ( startDate.toLocaleDateString () )
                                function getOnePercentRangeAroundCenter(gxmin, gxmax, centeredAround) {
                                    const totalRange = gxmax - gxmin;
                                    const onePercent = totalRange * 0.10;
                                    const lowerBound = centeredAround - onePercent / 2;
                                    const upperBound = centeredAround + onePercent / 2;
                                    return { lowerBound, upperBound };
                                }
                                function calculateXCoordinate(date, startDate, endDate) {
                                    if (!(date instanceof Date) || !(startDate instanceof Date) || !(endDate instanceof Date)) {
                                        throw new Error("All arguments must be valid Date objects.");
                                    }
                                    const spanMs = endDate - startDate;
                                    if (spanMs === 0) {
                                        throw new Error("startDate and endDate must not be the same.");
                                    }
                                    const timeFromStartMs = date - startDate;
                                    const x = timeFromStartMs / (1000 * 60 * 60);
                                    return x;
                                }
                                if (startDate.getTime() === endDate.getTime()) {
                                    let xvalue = calculateXCoordinate(startDate, selectedPlate.startDate, selectedPlate.endDate)
                                    let xvalue_min = calculateXCoordinate(selectedPlate.startDate, selectedPlate.startDate, selectedPlate.endDate)
                                    let xvalue_max = calculateXCoordinate(selectedPlate.endDate, selectedPlate.startDate, selectedPlate.endDate)

                                    if( xvalue < xvalue_min || xvalue > xvalue_max){
                                        plate_graph.plateTrack.setMessage ( " Date " + startDate + " is outside of the current timeline.")
                                        return;
                                    }

                                    let range = getOnePercentRangeAroundCenter(xvalue_min, xvalue_max, xvalue)
                                    selectedPlate.grid.zoom(range.lowerBound, range.upperBound, 0, 1);

                                    let object_sent = ( str )

                                    if ( !object_sent || object_sent.length <= 0 ){
                                        object_sent = str;
                                    }

                                    selectedPlate.scatterData.points.push({
                                        x: xvalue,
                                        y: 0.1,
                                        type: 'milestone',
                                        name: `${object_sent}`,
                                        color: 'red',
                                    });

                                } else {
                                }
                            } else {
                                let fal1 = await interpreter.executeCommand(`${__name}:`);
                                let fal = await interpreter.executeCommand(str);
                                panel.setText('');
                            }
                        }),
                        menus: [

                            {
                                'label': `${menu_title}`, 'items': m
                            },

                        ]
                    }
                }
                resolve(menuItm)
            } else {

                const sp = await selectedPlate.getSelectionElementsMenu(selectedPoint, plate_graph.plateTrack);
                const name = selectedPoint.name;
                let menuItm = {
                    wid: 'menu',
                    data: {
                        cmd: createIon(async (str, panel) => {
                            let fal1 = await interpreter.executeCommand(`${__name}:`);
                            let fal = await interpreter.executeCommand(str);
                            panel.setText('');
                        }),
                        menus: [
                            {
                                'label': `${menu_title}`, 'items': m
                            },
                            {
                                'label': `${name}`, 'items': sp
                            },

                        ]
                    }
                }
                resolve(menuItm)
            }
        } else {

            let menuItm = {
                wid: 'menu',

            }
            resolve(menuItm)

        }

    })
}
