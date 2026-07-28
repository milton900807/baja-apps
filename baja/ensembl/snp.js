function (track, graph, snpID) {

    GETJSON(`https://mar2017.rest.ensembl.org//variation/human/${snpID}?population_genotypes=1;content-type=application/json`).then(async (js) => {

        console.log('debubg');
        if (js && js['mappings']) {
            let mappings = js['mappings']
            if (mappings) {

                for (let m of mappings) {
                    if (m['assembly_name'] === 'GRCh38') {
                        let start = m['start']
                        let end = m['end']
                        gstart = track.tgraph.X(start)
                        gend = track.tgraph.X(end)
                        graph.zoom(gstart-3, gend+3)
                    }
                }

            }
        }

    })
}
