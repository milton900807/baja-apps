function (graph, selectedTrack, startWindow, endWindow) {

    return new Promise(async (resolve, reject) => {
        sleep = async (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        if (!startWindow) {
            startWindow = selectedTrack.xi
        }
        if (!endWindow) {
            endWindow = selectedTrack.xf
        }
        let Biopolymer = await exec('baja/chem/biopolymer.js');
        let Oligo = await exec('flexigraph/oligo.js');
        let chemistryObject = graph.props.selected_chemistry;
        currentSequence = selectedTrack.getHighlightedSequence();
        if ( graph.props.selected_chemistry === undefined ){
            graph.setMessage ( " No chemistry selected ")
            return;
        }
        let base_count = 10;
        base_count =  Biopolymer.countBases(chemistryObject);
        if ( chemistryObject['length'] != null || chemistryObject['length'] > 0 ){
            base_count = chemistryObject['length']
        }

        let yy = 0.15;
        let existingOligos = [];
        for (let o of selectedTrack.oligos) {
            existingOligos.push(o.sequence);
        }

        for (let i = startWindow; i < endWindow - base_count; i+=3) {
            let sequence = selectedTrack.getSequenceRange(i, i + base_count);
            if (!existingOligos.includes(sequence)) {

                let bioObject = {
                    'targetSequence': sequence,
                    'trackName': selectedTrack.name,
                    'startIndex': i,
                    'y': (selectedTrack.tgraph.ymin + yy),
                    'endIndex': i + base_count,
                    'strand': selectedTrack.strand,
                }
                let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                if (anno) {

                        let ytmp = 0.15;

                        for (let _o of selectedTrack.oligos) {
                            if ((_o.xi >= anno.xi && _o.xi <= anno.xf) || (anno.xi >= _o.xi && anno.xi <= _o.xf)) {
                                if (_o.y <= ytmp) {
                                    ytmp += 0.05;
                                }
                            }
                        }

                        anno.y = ytmp;

                        selectedTrack.addOligo(anno)
                    }

                if (i % 500 === 0)
                    await sleep(100)

            }
        }
        resolve();

    });
}
