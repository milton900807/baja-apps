function (graph, platetrack) {

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

        let ggs = platetrack.toJSON();
        const objects = platetrack.getAllObjects();
        const names = objects.map(obj => obj.name);
        ggs.formulas = filterFormulasByAllTableNames(ggs.formulas, names)
        ggs.root = platetrack.getAllPlates();
        ggs.m_plots = platetrack.getAllPlots();
        ggs.glyphs = platetrack.getAllGlyphs();
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
        let binaryData = compressString(gs)
        const chunkSize = 0x8000;
        let stringData = '';
        for (let i = 0; i < binaryData.length; i += chunkSize) {
            const chunk = binaryData.subarray(i, i + chunkSize);
            stringData += String.fromCharCode.apply(null, chunk);
        }
        platetrack.reset()
        let Plate = await exec('baja/plate/plate.js');
        let attr_window = ''
        let va = await prompt("Folder name: ", ["Name"], { "Name": attr_window }, 500, 300)
        let m = va['Name']
        let plate = new Plate(m, 1, 1);
        plate.plateType = 'package'
        plate.completeNullValues();
        let index = 0;
        const x = platetrack.grid.getWorldCenter().x;
        const y = platetrack.grid.getWorldCenter().y;
        const rectWidth = graph.worldWidth(450);
        const rectHeight = graph.worldHeight(330);
        plate.setWellValue(0, index, m)
        plate.wells[0][0].properties['package'] = stringData;
        plate.setWellType(0, index, 'PACKAGE')
        plate.grid.width = (rectWidth);
        plate.grid.height = (rectHeight);

        plate.grid.xi = platetrack.grid.width/2;
        plate.grid.yi = platetrack.grid.height/2;

        platetrack.root.push(plate);
        platetrack.generateTableMenu();
        platetrack.unModal();
        setTimeout(() => {
            platetrack.zoomintoplate(plate)
            resolve()
        }, 1000)
    })

}
