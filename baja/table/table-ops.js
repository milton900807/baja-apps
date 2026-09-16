function () {

    return new Promise(async (resolve, reject) => {
        let TableOps = class TableOps {
            static async load(pt, table) {



                if (!table.plateType) {
                    table.plateType = 'default';
                }



                if (table && table.subType && table.subType != null) {
                    let mn = await exec('baja/plate/ops/' + table.subType, pt, table)
                    if (!mn) {
                        mn = await exec('baja/plate/ops/default.js', pt, table)
                    }

                    if (!mn) {
                        return []
                    }

                    let menuList = []
                    for (let opp of Object.keys(mn)) {
                        let f = mn[opp]
                        menuList.push({
                            label: `${opp} `,

                            click: (bajabio, pty) => {
                                f(pt, table, bajabio, pty)
                                table.closeMenu();
                            },
                            move: () => {
                            }
                        });
                    }
                    return menuList;

                } else {

                    if (!table.plateType) {
                        table.plateType = 'default';
                    }
                    // An ordinary table has no ops file of its own: go straight to the default
                    // (one request, and no 404 for "ops/default" without the extension).
                    let mn = null;
                    if (table.plateType !== 'default') {
                        try { mn = await exec('baja/plate/ops/' + table.plateType, pt, table) } catch (e) { mn = null; }
                    }
                    if (!mn) {
                        try { mn = await exec('baja/plate/ops/default.js', pt, table) } catch (e) { mn = null; }
                    }

                    if (!mn) {
                        return []
                    }

                    let menuList = []
                    for (let opp of Object.keys(mn)) {
                        let f = mn[opp]
                        menuList.push({
                            label: `${opp} `,

                            click: (bajabio, pty) => {
                                f(pt, table, bajabio, pty)
                                table.closeMenu();
                            },
                            move: () => {
                            }
                        });
                    }
                    return menuList;
                }
            }
        }

        resolve(TableOps)
    })

}
