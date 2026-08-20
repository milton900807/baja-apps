function () {
    // --- Professional genomics style (muted, IGV / Ensembl inspired) ---
    const font = '13px "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
    const GX = {
        ink:      '#0a2540',
        guide:    'rgba(120,130,145,0.45)',
        acceptor: '#1aa3bd',
        sirna:    '#1897b0',
        rnaBind:  '#b0533f',
        chem:     '#46617a',
        aso:      '#159a91',
        snp:      '#9c2f45',
        ins:      '#12768f',
        del:      '#8c2f42'
    };

    return {
        'siRNA_deprectrd': createIon((graph, xs, xf, y, color, structure) => {
            let ys = graph.Y(y);
            let xss = graph.X(xs);
            let xff = graph.X(xf);
            graph.drawScreenLine(xss - 25, ys + 10, xff - 2, ys + 5, GX.guide, 5, 'butt')
            graph.drawScreenLine(xss, ys, xff, ys, GX.sirna, 4, 'round')
        }),
        'rna-binding': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, GX.rnaBind, 5, 'round')
        }),
        'gapmer': createIon((graph, xs, xf, y, color, structure) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, GX.sirna, 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, GX.chem, 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, GX.chem, 3, 'butt')

            if (structure) {
                if (structure.indexOf('CHEM1,RNA1,1:R1-1:R1') > 0 || structure.indexOf('RNA1,CHEM1,1:R1-1:R1') > 0) {
                    graph.drawString("GalNAc", xs - 3, y, GX.ink, font)

                } else if (structure.indexOf('CHEM1,RNA1') > 0 ||
                    structure.indexOf('RNA1,CHEM1') > 0) {
                    graph.drawString("GalNAc", xf, y, GX.ink, font)
                }
            }
        }),
        'amplicon': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, GX.sirna, 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, GX.chem, 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, GX.chem, 3, 'butt')

        }),
        'amplicon.detailed': createIon((graph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs + d / 4, y, xf - d / 4, y, GX.sirna, 1, 'round')
            graph.drawLine(xs, y, xf - (3 * (d / 4)), y, GX.chem, 3, 'butt')
            graph.drawLine(xs + (3 * (d / 4)), y, xf, y, GX.chem, 3, 'butt')

        }),

        'splicing': createIon((graph, xs, xf, y) => {

            graph.drawZigZag(xs, y, xf, y, GX.acceptor, 2, 'round')
            graph.drawLine(xs, y, xf, y, GX.ink, 1, 'round')

        }),
        'aso.detailed': createIon((graph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, GX.aso, 8, 'round')

        }),
        'aso': createIon((graph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, GX.aso, 4, 'round')

        }),

        'mutation-annotation': createIon((graph, xs, xf, y, c, phase) => {
            graph.drawVerticalLine(xs, y, y + 0.02, GX.guide, 1)
            graph.drawVerticalLine(xf, y, y + 0.02, GX.guide, 1)

        }),
        'snp': createIon((graph, xs__, xf__, yf, ys, c, phase) => {
            const xw = graph.grid.worldWidth(10)
            const xs = xs__ + xw;
            const xf = xf__ + xw;

            graph.drawLine(xs, yf, xf, yf, GX.snp, 10, 'round')
            graph.drawLine(xs, ys, xs, yf, GX.snp, 0.5);
            graph.drawLine(xf, ys, xf, yf, GX.snp, 0.5);

        }),
        'ins': createIon((graph, xs, xf, yf, ys, c, phase) => {
            graph.drawLine(xs, yf, xf, yf, GX.ins, 10, 'round');
            graph.drawLine(xs, ys, xs, yf, GX.ins, 0.5);
            graph.drawLine(xf, ys, xf, yf, GX.ins, 0.5);

        }),
        'del': createIon((graph, xs, xf, yf, ys, c, phase) => {
            graph.drawLine(xs, yf, xf, yf, GX.del, 13, 'round')
            graph.drawLine(xs, ys, xs, yf, GX.del, 0.5);
            graph.drawLine(xs, yf, xf, ys, GX.del, 0.5);

        }),
    }
}
