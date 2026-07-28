function () {

    class SeqVariantParser {

        parseSimple = (variant) => {

            let i = variant.indexOf('.')
            let reference = variant.substring(0, i)
            variant = variant.substring(i + 1)

            if (reference === 'c' || reference === 'g') {
                let substituionIndex = variant.indexOf('>')

                if (substituionIndex > 0) {

                    let baseI = /[ A-Za-z]/i.exec(variant).index;
                    let cseqIndex = variant.substring(0, baseI);
                    let refsq = variant.substring(baseI, substituionIndex)
                    let subst = variant.substring(substituionIndex + 1)
                    return {
                        'ref': refsq,
                        'sub': subst,
                        'method': 'substition',
                        'indexType': 'coding',
                        'index': +cseqIndex,
                        'offset': 0,
                        'position': +cseqIndex
                    }

                }
            }
        }

        parseDel = (variant) => {
            let i = variant.indexOf('.')
            let reference = variant.substring(0, i)
            if (reference === 'c' || reference === 'g') {
                let rend = variant.indexOf('del')
                let insertSequence = variant.substring(rend + 3).trim()
                let rstart = variant.indexOf('.')
                let region = variant.substring(rstart + 1, rend);
                let sp = region.indexOf('_')

                if (sp != null && sp > 0) {

                    let del = region.substring(0, sp);
                    let delf = region.substring(sp + 1, rend)
                    return [
                        {
                            'xi': +del,
                            'position': +del,
                            'xf': +delf,
                            'type': 'del',
                            'offset': 0,
                            'indexType': 'coding',
                            'sequence': ''
                        }

                    ]

                } else {

                    let del = +region.substring(0)
                    let delf = del + 1

                    return [
                        {
                            'xi': +del,
                            'position': +del,
                            'xf': +delf,
                            'offset': 0,
                            'type': 'del',
                            'indexType': 'coding',
                            'sequence': ''
                        }

                    ]
                }

            }

        }

        parseInDel = (variant) => {

            let i = variant.indexOf('.')

            let reference = variant.substring(0, i)

            if (reference === 'c' || reference === 'g') {
                let rend = variant.indexOf('delins')
                let insertSequence = variant.substring(rend + 6).trim()
                let rstart = variant.indexOf('.')
                let region = variant.substring(rstart + 1, rend);
                let sp = region.indexOf('_')
                console.log('debubg');

                if (region.indexOf('-') > 0) {

                    let deletion = region.substring(0, sp);
                    let insertion = region.substring(sp + 1, rend)

                    let ds = deletion.split('-')
                    let deli = ds[0]
                    let delf = ds[1]

                    let is = insertion.split('-')
                    let ini = is[0]
                    let inf = is[1]

                    return [
                        {
                            'xi': +deli,
                            'position': +deli,
                            'xf': +delf,
                            'offset': 0,
                            'type': 'del',
                            'indexType': 'coding',
                            'sequence': insertSequence

                        },
                        {
                            'xi': +ini,
                            'position': +ini,
                            'xf': +inf,
                            'offset': 0,
                            'type': 'del',
                            'indexType': 'coding',
                            'sequence': insertSequence
                        }

                    ]
                } else {

                    let ini = region.substring(0, sp);
                    let inf = region.substring(sp + 1, rend)

                    return [
                        {
                            'xi': +ini,
                            'position': +ini,
                            'offset': 0,
                            'xf': +inf,
                            'type': 'del',
                            'indexType': 'coding',
                            'sequence': insertSequence
                        }

                    ]

                }

            }

        }

        parseSpliceSite = (variant) => {
            let i = variant.indexOf('.')
            let reference = variant.substring(0, i)
            variant = variant.substring(i + 1)

            if (reference === 'c') {
                let spliceOffsetMatch = variant.match(/[+-]\d+/);
                let substitutionIndex = variant.indexOf('>')

                if (spliceOffsetMatch && substitutionIndex > 0) {
                    let spliceOffset = spliceOffsetMatch[0];
                    let position = variant.substring(0, spliceOffsetMatch.index);
                    let refNucleotide = variant.substring(substitutionIndex - 1, substitutionIndex)
                    let newNucleotide = variant.substring(substitutionIndex + 1)
                    if ( !spliceOffset ){
                        spliceOffset= 0;
                    }

                    return {
                        'position': +position,
                        'offset': +spliceOffset,
                        'refNucleotide': refNucleotide,
                        'newNucleotide': newNucleotide,
                        'method': 'splice site substitution',
                        'indexType': 'coding'
                    }
                }
            }
        }

        parseVariant = (variant) => {
            if (variant.includes('>')) {
                if (variant.includes('+') || variant.includes('-')) {
                    return this.parseSpliceSite(variant);
                } else {
                    return this.parseSimple(variant);
                }
            } else if (variant.includes('del')) {
                return this.parseDel(variant);
            } else if (variant.includes('delins')) {
                return this.parseInDel(variant);
            } else {
                return { 'error': 'Unsupported variant format' };
            }
        }

    }

    return new SeqVariantParser();
}
