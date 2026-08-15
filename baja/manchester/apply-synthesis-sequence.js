function (graph, mode) {
    return new Promise(async (resolve, reject) => {
        let m1 = "Target sequence";
        let m2 = "Complement of target sequence";
        let m3 = "Reverse complement of target sequence";
        let Biopolymer = await exec('baja/chem/biopolymer.js');
        console.log('debubg');
        for (let selected of graph.selectedCompounds) {
            let target = selected.o.sequence;
            if (mode === m1) {
                selected.o.synthesisSequence = target;
            } else if (mode === m2) {
                selected.o.synthesisSequence = Biopolymer.comp(target)
            } else if (mode === m3) {
                selected.o.synthesisSequence = Biopolymer.reverseComp(target)

            }
        }
        resolve ( ' done ')
    })

}
