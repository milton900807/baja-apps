function (graph, platetrack, objects) {

    function filterFormulasByAllTableNames(formulas, allowedTableNames) {
        const allowedSet = new Set(allowedTableNames);
        const tableRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\[/g;

        const containsOnlyAllowedTables = str => {
          const tables = [...str.matchAll(tableRegex)].map(match => match[1]);
          return tables.every(table => allowedSet.has(table));
        };

        const filtered = {};

        for (const [key, value] of Object.entries(formulas)) {
          if (containsOnlyAllowedTables(key) && containsOnlyAllowedTables(value)) {
            filtered[key] = value;
          }
        }

        return filtered;
      }

    return new Promise(async (resolve, rej) => {
        const ob = objects[0]

        if (ob) {

            let ggs = platetrack.toJSON();
            const names = objects.map(obj => obj.name);
            ggs.formulas = filterFormulasByAllTableNames(ggs.formulas, names)
            ggs.root = objects;
            const x = ob.grid.xi;
            const y = ob.grid.yi;
            const rectWidth = graph.worldWidth(150);
            const rectHeight = graph.worldHeight(40);
            let gs = JSON.stringify(ggs, function (key, value) {
                if (key != null && key.toLowerCase().startsWith('_')) {
                    return null;
                }
                else
                    if (typeof value === 'object' && value !== null) {
                        if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                            return value;
                        } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                            return value;
                        }
                        else {
                            return value;
                        }
                    }
                return value;
            });

            gs.uid = uuid();
            let binaryData = compressString(gs)
            const chunkSize = 0x8000;
            let stringData = '';
            for (let i = 0; i < binaryData.length; i += chunkSize) {
                const chunk = binaryData.subarray(i, i + chunkSize);
                stringData += String.fromCharCode.apply(null, chunk);
            }

            let Plate = await exec('baja/plate/plate.js');
            let attr_window = ''
            let m = gs.file

            let plate = new Plate(m, 1, 1);
            plate.plateType = 'package'
            plate.completeNullValues();
            let index = 0;

            plate.setWellValue(0, index, m)
            plate.wells[0][0].properties['package'] = stringData;
            plate.setWellType(0, index, 'PACKAGE')
            plate.grid.width = (rectWidth);
            plate.grid.height = (rectHeight);

            console.log('debubg');
            let xx = platetrack.grid.width/2
            let yy = platetrack.grid.height/2
            for (let o of objects) {
                if (o.grid.xi){
                    xx= o.grid.xi
                    yy= o.grid.yi
                }
                platetrack.removeItemsByTableName(o.name)
                platetrack.removeTableByName(o.name)
            }

            plate.grid.xi = xx;
            plate.grid.yi = yy;

            platetrack.root.push(plate);

            setTimeout(() => {
                platetrack.unModal();
            }, 400)
        }
        return resolve()
    })

}
