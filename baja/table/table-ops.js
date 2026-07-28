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
                    let mn = await exec('baja/plate/ops/' + table.plateType, pt, table)
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
                }
            }
        }

        resolve(TableOps)
    })

}
