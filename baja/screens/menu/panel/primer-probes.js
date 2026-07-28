function (graph) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let lt = graph.getViewport()
    let v = lt.viewport;
    let mm = []
    for (let t of v.track) {
        if (t.oligos) {
            for (let ob of t.oligos) {
                if (ob.type === 'amplicon') {
                    mm.push({
                        label: ob.left.xi,
                        click: async () => {
                            let MGrid = await exec('flexigraph/grid.js')
                            console.log('debubg');
                            let togrid = new MGrid(t.tgraph.xi, t.tgraph.Y(0.1), t.tgraph.xi + t.tgraph.width, t.tgraph.height + t.tgraph.height * 0.01)
                            togrid.xmin = t.tgraph.X(ob.left.xi - ((ob.right.xf - ob.left.xi)/10))
                            togrid.xmax = t.tgraph.X(ob.right.xf + ((ob.right.xf - ob.left.xi)/10));
                            togrid.ymin = -1;
                            togrid.ymax = 1;
                            graph.goToBookmark(togrid)
                        },
                        move: () => {
                        }
                    })
                }
            }
        }

    }
    graph.addMouseDownListener((x, y) => {
        graph.showMenu(mm, x, y);
    });
}
