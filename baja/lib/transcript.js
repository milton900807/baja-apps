function () {

    return new Promise(async (resolve, reject) => {
        let codons = await exec('baja/lib/codon-to-aa.js')
        let tt = class Transcript {
            cdna = '';
            constructor(seq) {
                this.cdna = seq;
            }

            translate() {
                let codon = '';
                let index = -1;
                let peptide = '';
                for (let s = 1; s < this.cdna.length; s += 3) {
                    codon = this.cdna.substring(s, s + 3);
                    if (index < 0 && (codon === 'AUG' || codon === 'ATG')) {
                        index = 0;
                    }
                    else if (index > 0 && (codon === 'TAA' || codon === 'TAG' || codon === 'TGA')) {
                        index = -1;
                        return peptide;
                    }
                    if (index >= 0) {
                        let aa = codons[codon]
                        peptide += aa;
                        index++;
                    }
                }
                return peptide;
            }
        }
        resolve(tt);
    })

}
