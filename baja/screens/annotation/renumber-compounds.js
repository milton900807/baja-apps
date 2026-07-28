function (graph) {

    let createUniqueIntegerId = () => {
        let timestamp = Date.now();
        let randomPart = Math.floor(Math.random() * 1000);
        let uniqueId = timestamp * 1000 + randomPart;
        return uniqueId;
    }

    for (let track of graph.track) {
        for (let o of track.oligos) {
            o.id  = createUniqueIntegerId();
        }
    }

}
