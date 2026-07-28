function (text, pt, paint_panel) {

    return new Promise(async (resolve, reject) => {

        let HM = await exec('baja/history/HM')
        function detectTableFormat(text) {
            const lines = text.split('\n').map(line => line.trim()).filter(line => line);
            const table = lines.map(line => line.split(/\s{2,}|\t/).filter(cell => cell.trim() !== ''));

            const numRows = table.length;
            const numColumns = Math.max(...table.map(row => row.length), 0);

            const transposedTable = Array.from({ length: numColumns }, () => []);

            for (let row = 0; row < numRows; row++) {
                for (let col = 0; col < table[row].length; col++) {
                    transposedTable[col][row] = table[row][col];
                }
            }
            return { rows: numRows, columns: numColumns, data: transposedTable };
        }

        function extractDataObjectFromString(input) {
            if (typeof input !== 'string') throw new Error("Expected a string");

            const assignmentIndex = input.indexOf('data =');
            if (assignmentIndex === -1) throw new Error("Missing 'data =' declaration.");
            let assignment = input.slice(assignmentIndex + 6).trim();

            assignment = assignment
                .replace(/None\b/g, 'null')
                .replace(/\bTrue\b/g, 'true')
                .replace(/\bFalse\b/g, 'false')
                .replace(/'/g, '"');

            const firstBrace = assignment.indexOf('{');
            const lastBrace = assignment.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
                throw new Error("Could not find valid object braces.");
            }

            let objectCode = assignment.slice(firstBrace, lastBrace + 1);

            objectCode = objectCode.replace(/:\s*(=.+?)(?=[,\]])/g, (match, formula) => {
                return `: "${formula}"`;
            });

            try {
                return Function('"use strict"; return (' + objectCode + ')')();
            } catch (err) {
                throw new Error("Failed to parse object: " + err.message + "\nContent:\n" + objectCode);
            }
        }

        function shiftColumnsLeftInFormula(formula) {
            if (typeof formula !== 'string' || !formula.startsWith('=')) return formula;

            return formula.replace(/\b([A-Z]+)(\d+)\b/g, (match, col, row) => {
                const newCol = shiftColumnLettersLeft(col);
                return `${newCol}${row}`;
            });
        }

        function shiftColumnLettersLeft(col) {

            let colNum = 0;
            for (let i = 0; i < col.length; i++) {
                colNum = colNum * 26 + (col.charCodeAt(i) - 64);
            }

            if (colNum <= 1) return col;

            colNum -= 1;

            let newCol = '';
            while (colNum > 0) {
                const rem = (colNum - 1) % 26;
                newCol = String.fromCharCode(65 + rem) + newCol;
                colNum = Math.floor((colNum - 1) / 26);
            }

            return newCol;
        }

        async function generatePlatesFromTable_longitudinal(input) {
            const data = (typeof input === 'string') ? extractDataObjectFromString(input) : input;

            const allEntries = Object.entries(data).filter(([, value]) => Array.isArray(value));
            if (allEntries.length === 0) throw new Error("No valid array data found.");

            const rowKeys = [];
            if (data["Category"] && Array.isArray(data["Category"])) {
                rowKeys.push("Category");
            }
            for (const [key] of allEntries) {
                if (key !== "Category") {
                    rowKeys.push(key);
                }
            }

            const rowCount = rowKeys.length;
            const colCount = Math.max(...rowKeys.map(k => data[k].length));
            const totalCols = colCount + 1;

            const GenericWell = await exec('baja/plate/well.js');
            const Plate = (await exec('baja/plate/plate'));

            const plate = new Plate("data", totalCols, rowCount);

            for (let row = 0; row < rowCount; row++) {
                const rowKey = rowKeys[row];
                const values = data[rowKey] || [];

                const labelWell = new GenericWell(`A${row + 1}`);
                labelWell.value = rowKey;
                labelWell.obj = null;
                labelWell.setGroup?.("RowLabel");
                plate.wells[0][row] = labelWell;

                for (let col = 0; col < colCount; col++) {
                    const val = values[col];
                    const well = new GenericWell(`${String.fromCharCode(66 + col)}${row + 1}`);

                    if (typeof val === "string" && val.trim().startsWith("=")) {
                        well.value = "";
                        well.obj = (val);
                    } else {
                        well.value = val;
                        well.obj = null;
                    }

                    well.setGroup?.(rowKey);
                    plate.wells[col + 1][row] = well;
                }
            }

            return [plate];
        }
        async function generatePlateFromDoseResponse(data) {
            const GenericWell = await exec('baja/plate/well.js');
            const Plate = await exec('baja/plate/plate');
            const plate = new Plate("dose_response", 12, 8);

            const layout = data["plate_layout"];
            const signals = Object.fromEntries(data["raw_data"].map(x => [x.well, x.signal]));

            for (const wellKey in layout) {
                const col = wellKey.charCodeAt(1) - 49;
                const row = wellKey.charCodeAt(0) - 65;

                const metadata = layout[wellKey];
                const well = new GenericWell(wellKey);
                well.setGroup?.(metadata.type);
                well.value = signals[wellKey] || null;
                well.obj = JSON.stringify(metadata);

                if (plate.wells[col] && plate.wells[col][row]) {
                    plate.wells[col][row] = well;
                }
            }

            return [plate];
        }

        async function generatePlatesFromTable(input) {
            const data = (typeof input === 'string') ? extractDataObjectFromString(input) : input;
            if (data.plate_layout && data.raw_data) {
                return await generatePlateFromDoseResponse(data);
            } else {
                if (!data["Category"] || !Array.isArray(data["Category"])) {
                    throw new Error("Missing 'Category' array.");
                }

                const colHeaders = Object.keys(data);
                const rowCount = data["Category"].length;

                const GenericWell = await exec('baja/plate/well.js');
                const Plate = await exec('baja/plate/plate');

                const plate = new Plate("data", 24, 64);

                const dataCols = colHeaders.filter(k => k !== "Category");

                const blocks = [];
                let blockStart = 0;
                for (let i = 0; i <= rowCount; i++) {
                    if (i === rowCount || data["Category"][i] === "") {
                        if (blockStart < i) {
                            blocks.push({ start: blockStart, end: i - 1 });
                        }
                        blockStart = i + 1;
                    }
                }

                let currentRow = 0;

                for (const [blockIndex, block] of blocks.entries()) {
                    const { start, end } = block;
                    const blockRowCount = end - start + 1;

                    const headerRow = currentRow;

                    const labelHeaderWell = new GenericWell(`A${headerRow + 1}`);
                    labelHeaderWell.value = "Category";
                    labelHeaderWell.obj = null;
                    labelHeaderWell.setGroup?.("Header");
                    plate.wells[0][headerRow] = labelHeaderWell;

                    for (const [colOffset, colKey] of dataCols.entries()) {
                        const colX = colOffset + 1;
                        const well = new GenericWell(`${String.fromCharCode(65 + colX)}${headerRow + 1}`);
                        well.value = colKey;
                        well.obj = null;
                        well.setGroup?.("Header");
                        plate.wells[colX][headerRow] = well;
                    }

                    for (let i = start; i <= end; i++) {
                        const rowInBlock = i - start + 1;
                        const targetRow = currentRow + rowInBlock;

                        for (const [colOffset, colKey] of dataCols.entries()) {
                            const colX = colOffset + 1;

                            if (colOffset === 0) {
                                const label = data["Category"][i];
                                const labelWell = new GenericWell(`A${targetRow + 1}`);
                                labelWell.value = label;
                                labelWell.obj = null;
                                labelWell.setGroup?.("RowLabel");
                                plate.wells[0][targetRow] = labelWell;
                            }

                            const value = data[colKey][i];
                            const cellRef = `${String.fromCharCode(65 + colX)}${targetRow + 1}`;
                            const well = new GenericWell(cellRef);

                            if (typeof value === "string" && value.trim().startsWith("=")) {
                                well.value = "";
                                well.obj = value;
                            } else {
                                well.value = value;
                                well.obj = null;
                            }

                            well.setGroup?.(data["Category"][i] || `Block${blockIndex}`);
                            plate.wells[colX][targetRow] = well;
                        }
                    }

                    currentRow += blockRowCount + 1;
                }
                plate.removeEmptyRowsAndColumns();

                return [plate];
            }
        }

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', paint_panel);
        let m = null;
        setTimeout(async () => {
            pt.setMessage(" Reading clipboard ")
            let p = await generatePlatesFromTable(text)

            for (let pp of p) {
                pt.addNextAvailableX(pp)
            }
        })
        resolve()
    })

}
