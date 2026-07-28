function (pm, naut) {

    return new Promise(async (resolve, reject) => {
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')
        let MPlot = await exec('flexigraph/plot.js')
        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let TransferFunction = await exec('baja/plate/transfer-functions.js')
        let Menu = await exec('flexigraph/menu.js');

        let zoomin = async () => {
            AnimateGrid.INTERUPT = true;
            plate_graph.plateTrack.grid.rescale();
            mousePriority = false;
            let xmax = plate_graph.plateTrack.grid.xmax;
            let xmin = plate_graph.plateTrack.grid.xmin;
            let ymax = plate_graph.plateTrack.grid.ymax;
            let ymin = plate_graph.plateTrack.grid.ymin;
            let xdf = Math.abs((xmax - xmin) / 3);
            let ydf = Math.abs((ymax - ymin) / 3);
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
            let xdf = Math.abs((xmax - xmin) / 2);
            let ydf = Math.abs((ymax - ymin) / 2);

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

        let buttons = []
        let index = 0;

        buttons.push({
            x: 0, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {
                zoomin();
                plate_graph.plateTrack.wb(null)
            }), icon: '/assets/img/icons/png/zoom-in.svg'
        },
        )
        index++;

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 25,
                'grid': {
                    xmin: 0,
                    xmax: 35,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons
            }
        }

        resolve(button_canvas)

    })
}
