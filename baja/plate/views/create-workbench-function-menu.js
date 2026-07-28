function (pt) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let WorkbenchFunction = await exec ('baja/plate/views/workbench-function')
        let menuList = []
        let editor;

        let selectP;
        let selectPanel = createIonFunction(async (_panel) => {
            selectP = _panel;
        });

        r = createIonFunction((p) => {
            editor = p;
        })
        menuList.push({
            label: `Normalize`,
            click: (scx, scy) => {
                let wb = new WorkbenchFunction ( 'Normalize')
                let xw = pt.grid.Xwc ( scx );
                let yw = pt.grid.Ywc (scy );
                wb.x=scx;
                wb.y=scy;
                pt.addTrackFunction ( wb );
            },
            move: () => {
            }
        });
        menuList.push({
            label: `Replicate mean`,
            click: (scx, scy) => {

                let wb = new WorkbenchFunction ( 'Replicate mean')
                console.log ( " xw : " + xw );
                wb.x=scx;
                wb.y=scy;
                pt.addTrackFunction ( wb );

            },
            move: () => {
            }
        });
        menuList.push({
            label: `Percent CTRL`,
            click: (scx, scy) => {

                let wb = new WorkbenchFunction ( 'Percent CTRL')
                let xw = pt.grid.Xwc ( scx );
                let yw = pt.grid.Ywc (scy );
                wb.x=scx;
                wb.y=scy;
                pt.addTrackFunction ( wb );

            },
            move: () => {
            }
        });
        menuList.push({
            label: `Standard Curve [PLATE]`,
            click: (scx, scy) => {
                let wb = new WorkbenchFunction ( 'Standard Curve on Plate')
                wb.x=scx;
                wb.y=scy;
                pt.addTrackFunction ( wb );
            },
            move: () => {
            }
        });

        menuList.push({
            label: `Standard Curve [GROUP]`,
            click: (scx, scy) => {
                let wb = new WorkbenchFunction ( 'Standard Curve on Group')
                wb.x=scx;
                wb.y=scy;
                pt.addTrackFunction ( wb );
            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
