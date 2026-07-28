function () {
    font = "13px Arial";

    return {
        'siRNA_deprectrd': createIon((graph, xs, xf, y, color, structure) => {
            let ys = graph.Y(y);
            let xss = graph.X(xs);
            let xff = graph.X(xf);
            graph.drawScreenLine(xss - 25, ys + 10, xff - 2, ys + 5, 'gray', 5, 'butt')
            graph.drawScreenLine(xss, ys, xff, ys, 'blue', 4, 'round')
        }),
        'rna-binding': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, 'red', 5, 'round')
        }),
        'gapmer': createIon((graph, xs, xf, y, color, structure) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, 'blue', 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, 'gray', 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, 'gray', 3, 'butt')

            if (structure) {
                if (structure.indexOf('CHEM1,RNA1,1:R1-1:R1') > 0 || structure.indexOf('RNA1,CHEM1,1:R1-1:R1') > 0) {
                    graph.drawString("GalNAc", xs - 3, y, 'black', font)

                } else if (structure.indexOf('CHEM1,RNA1') > 0 ||
                    structure.indexOf('RNA1,CHEM1') > 0) {
                    graph.drawString("GalNAc", xf, y, 'black', font)
                }
            }
        }),
        'amplicon': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, 'blue', 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, 'gray', 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, 'gray', 3, 'butt')

        }),
        'amplicon.detailed': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, 'blue', 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, 'gray', 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, 'gray', 3, 'butt')

        }),

        'splicing': createIon((graph, xs, xf, y) => {

            graph.drawZigZag(xs, y, xf, y, 'blue', 2, 'round')
            graph.drawLine(xs, y, xf, y, 'black', 1, 'round')

        }),
        'aso.detailed': createIon((graph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'magenta', 8, 'round')

        }),
        'aso': createIon((graph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'green', 4, 'round')

        }),

        'mutation-annotation': createIon((graph, xs, xf, y, c, phase) => {
            graph.drawVerticalLine(xs, y, y+0.02, 'lightGray', 1)
            graph.drawVerticalLine(xf, y, y+0.02, 'lightGray', 1)

        }),
        'snp': createIon((graph, xs__, xf__, yf, ys, c, phase) => {
            const xw = graph.grid.worldWidth(10)
            const xs = xs__ + xw;
            const xf = xf__ + xw;

            graph.drawLine(xs, yf, xf, yf, 'grey', 10, 'round')
            graph.drawLine(xs, ys, xs, yf, 'grey', 0.5);
            graph.drawLine(xf, ys, xf, yf, 'grey', 0.5);

        }),
        'ins': createIon((graph, xs, xf, yf, ys, c, phase) => {
            graph.drawLine(xs, yf, xf, yf, 'darkBlue', 10, 'round');
            graph.drawLine(xs, ys, xs, yf, 'darkBlue', 0.5);
            graph.drawLine(xf, ys, xf, yf, 'darkBlue', 0.5);

        }),
        'del': createIon((graph, xs, xf, yf, ys, c, phase) => {
            graph.drawLine(xs, yf, xf, yf, 'maroon', 13, 'round')
            graph.drawLine(xs, ys, xs, yf, 'maroon', 0.5);
            graph.drawLine(xs, yf, xf, ys, 'maroon', 0.5);

        }),
    }
}
