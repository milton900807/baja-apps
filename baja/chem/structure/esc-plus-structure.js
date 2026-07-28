function () {

    return new Promise(async (resolve, reject) => {
        let draw = async (graph, xs, xf, y, color, structure, sirna) => {
            let font = "16px Arial";
            let ys = graph.Y(y);
            let xss = graph.X(xs-1);
            let xff = graph.X(xf-1);

            if (sirna.offtarget){
                graph.drawString(sirna.offtarget, xf + 20, ys + 15,  'red', font)
            }

            if (sirna.strand > 0) {
                graph.drawScreenLine(xss - 25, ys + 15, xff - 2, ys + 15, 'lightGreen', 10, 'butt')
                graph.drawScreenLine(xss - 20, ys + 15, xss - 24, ys + 15, 'green', 10, 'butt')

                if (structure) {
                    if (structure.indexOf('THAGN') > 0 || structure.indexOf('THAGN') > 0) {
                        graph.drawString("GalNAc", xs, y+10, 'black', font)
                    }
                    graph.drawScreenLine(xss, ys, xff, ys, 'lightGray', 11, 'round')
                } else {
                    graph.drawScreenLine(xss, ys, xff, ys, 'maroon', 3, 'round')

                }
            } else {
                graph.drawScreenLine(xss, ys, xff + 20, ys, 'lightGreen', 10, 'butt')
                graph.drawScreenLine(xss + 30, ys, xss + 35, ys, 'green', 20, 'butt')

                if (structure) {
                    if (structure.indexOf('THAGN') > 0 || structure.indexOf('THAGN') > 0) {
                        graph.drawString("GalNAc", xs - 3, y, 'black', font)
                    }
                    graph.drawScreenLine(xss, ys + 15, xff, ys + 15, 'lightGray', 11, 'round')
                } else {
                    graph.drawScreenLine(xss, ys + 15, xff, ys, 'maroon', 3, 'round')
                }
            }
        }
        resolve(draw)
    })
}
