function (graph) {

    graph.addMouseMoveListener((x, y) => {

        for (let t of graph.track) {
            for (let o of t.oligos) {

            }
        }

        graph.highlightTrackCoords(x, y);

        let selO = null;

        let oligos = graph.getStructure(x, y);
        if (oligos && oligos.length) {
            for (let oligo of oligos) {
                if (oligo) {
                    graph.markPosition(oligo[0].xi, oligo[0].xf);
                    oligo[0].highlight(-1, 'magenta')
                    selO = oligo;

                    if (oligo[0].structure)
                        graph.highlight(oligo[0].id, -1, 'gray')

                }

            }
        }

        for (let track of graph.track) {
            for (let str of track.structures) {
                str.deselect();
            }
        }

        for (let track of graph.track) {
            let selected_list = track.getStructure(x, y)
            if (selected_list) {
                for (let selected of selected_list) {
                    if (selected.tgraph && selected.tgraph.xi) {
                        let xxww = x - selected.tgraph.xi * 2;
                        let xw = selected.tgraph.Xwc(xxww);
                        let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph.yi) + 10
                        selected.select(xw, yw)
                        let startIndex = selected.getIndex(xw, yw)

                        if (selO)
                            selected.selectIndexRange(startIndex, selO.xf);

                    }
                }
            }
        }

    })

    graph.addMouseDownListener((x, y) => {

        for (let track of graph.track) {
            let selected = track.getStructure(x, y)
            if (selected) {
                let xxww = x - selected.tgraph.xi * 2;
                let xw = selected.tgraph.Xwc(xxww);
                let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph.yi)
                selected.select(xw, yw)
            }
        }

    });

}
