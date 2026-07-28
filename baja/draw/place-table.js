function (platetrack, type, type_path, _name, callback) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate.js');
        if (type === 'transparent') {
            Plate = await exec('baja/plate/plate-transparent.js');
        }

        const load_file = async (path, name) => {
            let jsonobj = {
                'spath': path,
                'rule_name': name,
                'user': getUser(),
                'type': 'ljt'
            };
            let host_ = window['env']['apiUrl'];
            let rs = await POSTJSON(jsonobj, host_ + '/get-script');
            return rs;
        };
        if (_name && type_path) {
            if (type_path === _name) {
                type_path = ''
            }
            const rectWidth = platetrack.grid.width - (platetrack.grid.width * 0.2);
            const rectHeight = 800
            const lf = await load_file(type_path, _name)
            if (lf && lf.rule_value) {
                const ts = __decompress(lf.rule_value);
                const pl = Plate.buildPlateFromJSON(ts)
                pl.uid = uuid();

                if (!pl.name && pl.name === 'data') {

                    let va = await prompt("Table name", ["Name"], { "Name": '' }, 300, 300)
                    let m = va['Name']
                    if (!m || m.length <= 0) {
                        m = generateNautName();
                    }
                    pl.name = m;
                }

                pl.setWidth(pl.getDefaultWidth(platetrack))
                pl.setHeight(pl.getDefaultHeight(platetrack))
                await platetrack.panToNextSpot(pl.getWidth());
                platetrack.setMessage(" Loading...")

                platetrack.addNextAvailableX(pl)

                setTimeout(() => {
                    if (callback)
                        callback(pl)
                    platetrack.zoomintoplate(pl)
                }, 100)

            }

        } else {

            let va = await prompt("Table name", ["Name"], { "Name": '' }, 300, 300)
            let m = va['Name']
            if (!m || m.length <= 0) {
                m = generateNautName();
            }
            let plate = new Plate(m, 1, 1);
            plate.last_touched = new Date();
            plate.grid.width = platetrack.grid.worldWidth(platetrack.grid.width - platetrack.grid.width * 0.2);
            plate.grid.height = platetrack.grid.worldHeight(platetrack.grid.height - platetrack.grid.height * 0.2);
            plate.grid.yi = platetrack.grid.Ywc(100) - plate.grid.height;
            let fixedWellWidth = platetrack.grid.worldWidth(100)
            let fixedWellHeight = platetrack.grid.worldHeight(30)
            if (fixedWellWidth <= 0) {
                fixedWellWidth = 1;
            }
            if (fixedWellHeight <= 0) {
                fixedWellHeight = 1;
            }
            let columns = Math.floor(plate.grid.width / fixedWellWidth);
            let rows = Math.floor(plate.grid.height / fixedWellHeight);
            if (columns <= 0) {
                columns = 1;
            }
            if (rows <= 0) {
                rows = 1;
            }
            plate.grid.xmin = 0;
            plate.grid.xmax = columns;
            plate.grid.ymin = 0;
            plate.grid.ymax = rows;
            plate.grid.rescale();
            plate.completeNullValues();
            plate.setWidth(plate.getDefaultWidth(platetrack))
            plate.setHeight(plate.getDefaultHeight(platetrack))
            await platetrack.panToNextSpot(plate.getWidth());
            platetrack.addNextAvailableX(plate)
            platetrack.setMessage(" Loading...")

            setTimeout(() => {
                platetrack.zoomintoplate(plate)
            }, 100)
        }
    })
}
