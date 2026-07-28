function (pt, selected) {

    return new Promise((resolve, reject) => {

        let menuList = []
        menuList.push(
            {
                label: `View`,
                click: async (scx, scy) => {
                    pt.zoomintoplate(selected)
                },
                move: () => {
                }
            });

        if (selected.type && selected.type == 'timeline') {
            function getXFromDate(date, xMin, xMax, start, end) {
                const totalCanvasRange = xMax - xMin;
                const totalTimeRange = end.getTime() - start.getTime();
                const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

                const normalizedTime = timeSinceStart / totalTimeRange;
                return xMin + normalizedTime * totalCanvasRange;
            }

            menuList.push(
                {
                    label: `Now`,
                    click: async (scx, scy) => {
                        const now = new Date();

                        const oneHour = 60 * 60 * 1000;

                        const before = new Date(now.getTime() - oneHour);
                        const after = new Date(now.getTime() + oneHour);

                        const xNow = getXFromDate(now, selected.grid.xmin, selected.grid.xmax, selected.startDate, selected.endDate);
                        const xBefore = getXFromDate(before, selected.grid.xmin, selected.grid.xmax, selected.startDate, selected.endDate);
                        const xAfter = getXFromDate(after, selected.grid.xmin, selected.grid.xmax, selected.startDate, selected.endDate);

                        const xc = pt.grid.Xwc(selected.grid.X(xNow))
                        const xbefore = pt.grid.Xwc(selected.grid.X(xBefore))
                        const xafter = pt.grid.Xwc (selected.grid.X(xAfter))
                        const yc = pt.grid.Ywc(selected.grid.Y(0))
                        let xscwidth = Math.abs(xc - xbefore);
                        const xm = pt.grid.worldWidth (100)
                        const ym = pt.grid.worldHeight (100)
                        pt.grid.xmax = xc + xm
                        pt.grid.xmin = xc - xm;
                        pt.grid.ymax = yc - ym;
                        pt.grid.ymin = yc + ym;

                    },

                    move: () => {
                    }
                });

            menuList.push(
                {
                    label: `Goto day`,
                    click: async (scx, scy) => {
                        pt.zoomintoplate(selected)
                    },
                    move: () => {
                    }
                });

        }
        menuList.push(
            {
                label: `Download PNG`,
                click: async (scx, scy) => {
                    await this.toPNG(pt)
                },
                move: () => {
                }
            });
        return resolve(menuList)
    })
}
