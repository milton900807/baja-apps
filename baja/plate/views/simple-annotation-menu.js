function (pt, plate) {

    return new Promise(async (resolve, reject) => {

        const Menu = await exec('flexigraph/menu')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        const bsize = 20;
        let cursorPos = 0;
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        let mouseX;
        let mouseY;

        let ref;
        let interval_id;
        let smenu;
        let current_well = null;
        let pausing = false;

        let m = [
            {
                label: 'Name: ' + plate.name,
                click: async (x, y) => {
                    let attr_window = ''
                    let va = await prompt("Table name: " + plate.name, ["Name"], { "Name": attr_window }, 500, 300)
                    let m = va['Name']
                    plate.name = m;
                    pt.updateworkbench(null)
                    plate.closeMenu();

                },
                move: () => {
                },
            },
            {
                label: 'Send to back',
                click: async (x, y) => {

                    plate.closeMenu();
                    setTimeout ( () => {
                        plate.last_touched = -Infinity;
                        console.log('debubg');
                        pt.sortToBottom(plate)

                    })

                },
                move: () => {
                },
            }

        ]
       resolve ( m )

    })

}
