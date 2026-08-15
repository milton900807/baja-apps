function (graph, mode) {

    return new Promise(async (resolve, reject) => {
        let m1 = "Target sequence";
        let m2 = "Complement of target sequence";
        let m3 = "Reverse complement of target sequence";
        let Biopolymer = await exec('baja/chem/biopolymer.js');
        for (let t of graph.track) {
            for (let selected of t.oligos) {
                let target = selected.sequence;
                if (mode === m1) {
                    selected.synthesisSequence = target;
                } else if (mode === m2) {
                    selected.synthesisSequence = Biopolymer.comp(target)
                } else if (mode === m3) {
                    selected.synthesisSequence = Biopolymer.reverseComp(target)

                }
            }
        }
        resolve(' done ')
    })

}
