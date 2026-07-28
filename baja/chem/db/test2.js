function () {

    exec('baja/chem/polymer.js').then(p => {

        let polymer = new p.Polymer ();

        let chain = 'r(G)p.m(a)p.r(G)p.moe(mC)p.cet(A)p.m(u)p.r(A)p.m(u)p.r(U)p.m(u)p.r(C)p.m(a)p.r(C)p.m(c)p.r(C)p.m(u)p.r(U)p.m(c)p.r(A)'
        for (var a = [], i = chain.length; i--;) if (chain[i] == "." || chain[i] == '(' || chain[i] == ')') a.push(i);
        a = a.reverse()

        let m = chain.split(/[\\\.,\\\(,\\\)]/)

        let index = 0;
        for (let j of a) {
            if (j === '(') {

                polymer.monomer.push(new Monomer(m[index+1], index, 0.5))
            } else if (j === '.') {
                polymer.monomer.push(new Monomer(m[index+1], index, 0.1))

            } else if (j === ')') {
                polymer.monomer.push(new Monomer(m[index+1], index, 0.1))

            }
            index++;
        }

    })

}
