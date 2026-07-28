function (chain) {

    return new Promise(async (resolve, reject) => {
        exec('baja/chem/polymer.js').then(p => {
            let polymer = new p.Polymer();
            for (var a = [], i = chain.length; i--;) if (chain[i] == "." || chain[i] == '(' || chain[i] == ')') a.push(i);
            a = a.reverse()
            let m = chain.split(/[\\\.,\\\(,\\\)]/)
            let index = 0;
            for (let j of a) {
                if (j === '(') {

                    polymer.monomer.push(new Monomer(m[index + 1], index, 0.5))
                } else if (j === '.') {
                    polymer.monomer.push(new Monomer(m[index + 1], index, 0.1))

                } else if (j === ')') {
                    polymer.monomer.push(new Monomer(m[index + 1], index, 0.1))

                }
                index++;
            }
            resolve(polymer);
        })
    })

}
