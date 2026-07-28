function (peptide) {
    return new Promise(async (resolve, reject) => {

        if (peptide.length > 129) {
            return resolve(" Peptide length cannot be more than 9 AA")
        }

        function levenshteinDistance(s1, s2) {
            const len1 = s1.length, len2 = s2.length;
            let matrix = [];

            for (let i = 0; i <= len1; i++) {
                matrix[i] = [i];
            }
            for (let j = 0; j <= len2; j++) {
                matrix[0][j] = j;
            }
            for (let i = 1; i <= len1; i++) {
                for (let j = 1; j <= len2; j++) {
                    const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j - 1] + cost
                    );
                }
            }
            return matrix[len1][len2];
        }

        function filterSequencesByEditDistance(sequences) {
            let filteredSequences = [];

            for (let i = 0; i < sequences.length; i++) {
                for (let j = i + 1; j < sequences.length; j++) {
                    if (levenshteinDistance(sequences[i], sequences[j]) === 3) {
                        if (!filteredSequences.includes(sequences[i])) {
                            filteredSequences.push(sequences[i]);
                        }
                        if (!filteredSequences.includes(sequences[j])) {
                            filteredSequences.push(sequences[j]);
                        }
                    }
                }
            }
            return filteredSequences;
        }

        function peptideToDNA(peptide) {

            const commonCodons = {
                'A': ['GCC'],
                'R': ['AGA', 'CGT'],
                'N': ['AAC'],
                'D': ['GAT'],
                'C': ['TGC'],
                'Q': ['CAG'],
                'E': ['GAG'],
                'G': ['GGC'],
                'H': ['CAC'],
                'I': ['ATC'],
                'L': ['CTG'],
                'K': ['AAG'],
                'M': ['ATG'],
                'F': ['TTC'],
                'P': ['CCG'],
                'S': ['AGC', 'TCC'],
                'T': ['ACC'],
                'W': ['TGG'],
                'Y': ['TAC'],
                'V': ['GTG'],
            };

            const codonTable = {
                'A': ['GCT', 'GCC', 'GCA', 'GCG'],
                'R': ['CGT', 'CGC', 'CGA', 'CGG', 'AGA', 'AGG'],
                'N': ['AAT', 'AAC'],
                'D': ['GAT', 'GAC'],
                'C': ['TGT', 'TGC'],
                'Q': ['CAA', 'CAG'],
                'E': ['GAA', 'GAG'],
                'G': ['GGT', 'GGC', 'GGA', 'GGG'],
                'H': ['CAT', 'CAC'],
                'I': ['ATT', 'ATC', 'ATA'],
                'L': ['CTT', 'CTC', 'CTA', 'CTG', 'TTA', 'TTG'],
                'K': ['AAA', 'AAG'],
                'M': ['ATG'],
                'F': ['TTT', 'TTC'],
                'P': ['CCT', 'CCC', 'CCA', 'CCG'],
                'S': ['TCT', 'TCC', 'TCA', 'TCG', 'AGT', 'AGC'],
                'T': ['ACT', 'ACC', 'ACA', 'ACG'],
                'W': ['TGG'],
                'Y': ['TAT', 'TAC'],
                'V': ['GTT', 'GTC', 'GTA', 'GTG'],

                'Stop': ['TAA', 'TAG', 'TGA']
            };
            function generateCombinations(sequence, index, currentCombination, allCombinations) {
                if (index === sequence.length) {
                    allCombinations.push(currentCombination.join(''));
                    return;
                }
                const aminoAcid = sequence[index];
                const codons = commonCodons[aminoAcid];

                codons.forEach(codon => {
                    generateCombinations(sequence, index + 1, [...currentCombination, codon], allCombinations);
                });
            }
            const allCombinations = [];
            generateCombinations(peptide, 0, [], allCombinations);
            return allCombinations;
        }

        let list = peptideToDNA ( peptide )

        resolve(list);
    })

}
