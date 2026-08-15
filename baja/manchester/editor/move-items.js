function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let start = -1;
    let end = -1;
    let ywc = -1;
    let xwc = 0;
    let highlights = []
    let diffh = []
    let move = false;
    xi = 0;
    yi = 0

    graph.addMouseDownListener(async (x, y) => {
        move = true;
        this.xi = x;
        this.yi = y;

        let v = graph.getStructure(x, y);

        if (v && v.length > 0) {
            for (let i of v) {
                for (let item of i) {
                    if (item.highlight) {
                        item.highlight(true);
                    }
                    highlights.push(item)
                }
            }

        }
        if (highlights)
            for (let h of highlights) {
                let diffy = (h.y - this.yi);
                let diffx = (h.x- this.xi);
                diffh.push({
                    x: diffx,
                    y: diffy
                })
            }

    })
    graph.addMouseMoveListener((x, y) => {
        if (move) {
            let index = 0;
            console.log(' highlights :  ' + highlights)
            if (highlights) {
                for (let h of highlights) {
                    let diffy = diffh[index].y;
                    let diffx = diffh[index].x;

                    h.move(x + diffx, y + diffy);
                    index++;
                }
            }
        } else {
            for (let h of highlights) {
                if (h.highlight) {
                    h.highlight(false)
                }
            }
            highlights = []
            diffh = []
            let v = graph.getStructure(x, y);
            if (v && v.length > 0) {
                for (let i of v) {
                    if (i.highlight) {
                        i.highlight(true);
                        highlights.push(i)
                    }
                }
            } else {
            }
        }
    });
    graph.addMouseUpListener((x, y) => {
        move = false;
    })

}
