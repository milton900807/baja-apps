function (pt, sp) {

    return new Promise(async (resolve, reject) => {

        const Menu = await exec('flexigraph/menu')
        const TransparentPlate = await exec('baja/plate/plate-transparent')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        let MGrid = await exec('flexigraph/grid.js')
        if (!sp) throw new Error("createCopyMenu(sp, pt): missing 'sp'");
        const cond = [];
        const noncond = [];

        const wells__ = sp.getSelectedWellsInOrder();
        const values = wells__;
        const hasSel = values && values.length > 0;
        const oneSel = values && values.length === 1;
        const rowSel = sp.getSelectedRow && sp.getSelectedRow();
        const colSel = sp.getSelectedColumn && sp.getSelectedColumn();
        const hasCol = colSel && colSel.length > 0;
        cond.push(
            {
                label: 'Detach selected',
                click: async () => {

                    const va = await prompt("Table name: " + sp.name, ["Name"], { "Name": '' }, 500, 300);
                    const m = va['Name'];

                    const selected_column = sp.getSelectedWellsInOrder();
                    if (selected_column && selected_column.length > 0) {
                        let table = pt.newSimplePlate(m, 1, selected_column.length, sp)
                        let index = 0
                        for (let s of selected_column) {
                            table.wells[0][index++].copyWell(s);
                        }
                        sp.removeCol(colSel)
                        pt.deselectAll();

                    }
                }, bg: 'yellow', fg: 'black'

            }
        )
        cond.push(
            {
                label: 'Simple Table',
                click: async () => {
                    const va = await prompt("", ["Table"], { "Table": '' }, 300, 400);
                    const name = va['Table'];
                    const interpreter = await exec('baja/engine/interpreter.js', pt);
                    interpreter.ref = sp;
                    await interpreter.run('copy canvas');
                    interpreter.ref = pt;
                    setTimeout(async () => {
                        await interpreter.run(`paste ${name}`);
                        setTimeout(async () => { await interpreter.run(`zoomin ${name}`); }, 1000);
                        pt.wb(null);
                    }, 1000);
                }
            })
        cond.push(
            {
                label: 'Column Averages',
                click: async () => {
                    const va = await prompt("Table name", ["Table"], { "Table": '' }, 300, 400);
                    const name = va['Table'];
                    const interpreter = await exec('baja/engine/interpreter.js', pt);
                    interpreter.ref = sp;
                    let object = await interpreter.run(`totable ${name}`);
                }
            })

        return resolve(cond);
    })
}
