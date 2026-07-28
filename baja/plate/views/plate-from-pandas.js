function () {

    async function generatePlatesFromTable(data) {
        const rowHeaderKey = Object.keys(data).find(key => Array.isArray(data[key]) && data[key].every(v => typeof v === 'string'));
        if (!rowHeaderKey) throw new Error("No row header key with string labels found");
        const rowLabels = data[rowHeaderKey];
        const columnKeys = Object.keys(data).filter(k => k !== rowHeaderKey);
        const plates = [];
        const GenericWell = await exec('baja/plate/well.js');
        const Plate = (await exec('baja/plate/plate')).Plate;
        for (let colIdx = 0; colIdx < columnKeys.length; colIdx++) {
            const colKey = columnKeys[colIdx];
            const values = data[colKey];
            const plate = new Plate(colKey, 1, rowLabels.length);
            for (let row = 0; row < rowLabels.length; row++) {
                const well = new GenericWell(`A${row + 1}`);
                const val = values[row];
                if (typeof val === "string" && val.startsWith("=")) {
                    well.value = "";
                    well.obj = val;
                } else {
                    well.value = val;
                    well.obj = null;
                }
                plate.wells[0][row] = well;
            }

            for (let row = 0; row < rowLabels.length; row++) {
                const labelWell = plate.wells[0][row];
                labelWell.setGroup?.(rowLabels[row]);
            }

            plates.push(plate);
        }

        return plates;
    }

}
