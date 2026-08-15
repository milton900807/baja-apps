function () {

    return new Promise(async (resolve, reject) => {

        class MutationParser {
            constructor() {

                this.patterns = {
                    substitution: /c\.(\d+)([ACGT])>([ACGT])/,
                    deletion: /c\.(\d+)(?:_(\d+))?del([ACGT]*)/,
                    duplication: /c\.(\d+)(?:_(\d+))?dup([ACGT]*)/,
                    insertion: /c\.(\d+)_(\d+)ins([ACGT]+)/,
                    complex: /c\.(\d+)_\d+del([ACGT]+)ins([ACGT]+)/,
                    spliceSite: /c\.(\d+)(\+\d+|\-\d+)([ACGT])>([ACGT])/,
                    exonDeletion: /deletion \(Exone (\d+)\)/,
                    rangeDeletion: /g\.(\d+)_(\d+)del/,
                    singleNucleotidePolymorphism: /c\.([AGCT])(\d+)([AGCT])/,
                };
            }

            parse(mutation) {
                for (let type in this.patterns) {
                    const regex = this.patterns[type];
                    const match = mutation.match(regex);
                    if (match) {
                        return this.constructMutationObject(type, match);
                    }
                }
                return null;
            }

            constructMutationObject(type, match) {

                const mutation = { type };
                switch (type) {
                    case 'substitution':
                    case 'spliceSite':
                        mutation.position = match[1];
                        mutation.from = match[2];
                        mutation.to = match[3];
                        break;
                    case 'deletion':
                    case 'duplication':
                        mutation.start = match[1];
                        mutation.end = match[2] || match[1];
                        mutation.sequence = match[3] || '';
                        break;
                    case 'insertion':
                    case 'complex':
                        mutation.start = match[1];
                        mutation.end = match[2];
                        mutation.insertedSequence = match[3];
                        break;
                    case 'exonDeletion':
                        mutation.exon = match[1];
                        break;
                    case 'rangeDeletion':
                        mutation.start = match[1];
                        mutation.end = match[2];
                        break;
                    case 'singleNucleotidePolymorphism':
                        mutation.position = match[2];
                        mutation.from = match[1];
                        mutation.to = match[3];
                        break;
                    default:

                        break;
                }
                return mutation;
            }
        }
        return resolve(MutationParser)
    })
}
