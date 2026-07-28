function () {
    return {
        'Exon': createIon((graph, xs, xf, y) => { graph.drawZigZag(xs, y, xf, y, 'orange') }),
        'CDS': { 'color': 'black', 'shape': 'line', 'width': 3 },
        'five_prime_UTR': createIon((graph, xs, xf, y) => { graph.drawZigZag(xs, y, xf, y, 'green') })
    }
}

}
