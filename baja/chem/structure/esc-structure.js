function () {

    return new Promise(async (resolve, reject) => {
        let draw = async (graph, xs, xf, y, color, structure, sirna) => {
            let font = "16px Arial";
            let ys = graph.Y(y);
            let xss = graph.X(xs);
            let xff = graph.X(xf);

            if (sirna.strand > 0) {
                graph.drawScreenLine(xss - 25, ys + 15, xff - 2, ys + 15, 'lightBlue', 10, 'butt')

                if (structure) {
                    if (structure.indexOf('THAGN') > 0 || structure.indexOf('THAGN') > 0) {
                        graph.drawString("GalNAc", xs - 3, y, 'black', font)
                    }
                    graph.drawScreenLine(xss, ys, xff, ys, 'lightGray', 11, 'round')
                } else {
                    graph.drawScreenLine(xss, ys, xff, ys, 'maroon', 3, 'round')
                }
            } else {
                graph.drawScreenLine(xss, ys, xff + 20, ys, 'lightBlue', 10, 'butt')

                if (structure) {
                    if (structure.indexOf('THAGN') > 0 || structure.indexOf('THAGN') > 0) {
                        graph.drawString("GalNAc", xs - 3, y, 'black', font)
                    }
                    graph.drawScreenLine(xss, ys + 15, xff, ys+15, 'lightGray', 11, 'round')
                } else {
                    graph.drawScreenLine(xss, ys + 15, xff, ys, 'maroon', 3, 'round')

                }
            }
        }
        resolve(draw)
    })
}
