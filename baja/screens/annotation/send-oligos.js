function (graph) {

    return new Promise( async (resolve, reject) => {
        let oligostosend = [];
        for ( let t of graph.track ) {

            if ( t.oligos.length > 0 ) {
                for ( let o of t.oligos) {
                    let _o = {};
                    _o.synthesisSequence = o.synthesisSequence;
                    _o.id = o.id;
                    oligostosend.push(_o);
                }
            }
        }
        resolve(JSON.stringify(oligostosend));
    });
}
