function () {
    class ChemistryTemplate {

        static create(type, chain) {
            let template = ''

            if (type.toUpperCase() === 'ASO') {
                let split = chain.split(/\{([0-9]*)\}/g)
                for (let s = 0; s < split.length; s += 2) {
                    let co = split[s]
                    let count = +split[s + 1]
                    co = co.trim();
                    if (co.startsWith('(')) {
                        let temp = co.substring(1, co.length - 1)

                        for (let i = 0; i < count; i++) {
                            template += temp;
                        }
                    }
                }
            }
            return template;
        }

    }

    return ChemistryTemplate;
}
