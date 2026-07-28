function (chain) {

    return new Promise(async (resolve, reject) => {

        let getSugar = (s) => {
            s = s.toLocaleLowerCase();
            if (s === 'moe') {
                return '2MOEr'
            } else if (s === 'd') {
                return '';
            } else {
                return '';
            }
        }

        if (chain.indexOf('sp[') >= 0) {
            chain = chain.replace(/sp\[/g, "sp.[")
        }
        if (chain.indexOf('p[') >= 0) {
            chain = chain.replace(/p\[/g, "p.[")
        }

        let idt = "";
        let index = 0;
        let base;
        let sugar;
        let c = chain.split('.');
        for (let i of c) {
            i = i.trim();

            let stindex = i.indexOf('[');
            let ndindex = i.indexOf(']')
            if (stindex >= 0) {
                base = i.substring(stindex + 1, ndindex);
                sugar = i.substring(ndindex + 1);
                sugar = sugar.trim();
                let idt_sugar = getSugar(sugar);
                if (idt_sugar.length > 0) {

                    if (idt.length <= 0) {
                        idt = '/5' + idt_sugar + base + '/'
                    }
                    else if (index >= (c.length - 1)) {
                        idt += '/3' + idt_sugar + base + '/'
                    }
                    else
                        if (index < c.length) {
                            idt += '/i' + idt_sugar + base + '/'
                        }
                } else {
                    idt += base;
                }

            } else {

                if (i === 'sp') {
                    idt += '*'
                }
            }
            index++;
        }

        resolve(idt);
    })
}
