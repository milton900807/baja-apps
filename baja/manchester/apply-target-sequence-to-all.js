function (graph) {
    return new Promise(async (resolve, reject) => {
        for (let t of graph.track) {
            for (let selected of t.oligos) {
                let seq = t.getSequenceRange ( selected.xi, selected.xf )
                selected.sequence = seq;
            }
        }
        resolve(' done ')
    })

}
