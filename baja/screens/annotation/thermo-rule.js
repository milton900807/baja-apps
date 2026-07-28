function () {

    return new Promise(async (resolve, reject) => {
        let rule = await exec('baja/screens/annotation/rule-filter.js');

        let termoRule = class extends rule {
            n;
            thresh;
            num
            constructor(rawrule, type, rulestring, priority, thresh, logfun) {
                super(rawrule, type, rulestring, priority, logfun);
                this.thresh = thresh;
                this.parsetype(logfun);
            }

            calculateTm(sequence) {
                if (sequence.length < 15 || sequence.length > 30) {
                    throw new Error('Sequence length must be between 15 and 30 bases.');
                }

                const R = 1.987;
                const Na = 0.05;

                const nnParams = {
                    'AA/TT': -1.00, 'AT/TA': -0.88, 'TA/AT': -0.58, 'CA/GT': -1.45,
                    'GT/CA': -1.44, 'CT/GA': -1.28, 'GA/CT': -1.30, 'CG/GC': -2.17,
                    'GC/CG': -2.24, 'GG/CC': -1.84
                };

                let dH = 0;
                let dS = 0;

                for (let i = 0; i < sequence.length - 1; i++) {
                    const pair = sequence.substring(i, i + 2);
                    const reversePair = pair[1] + pair[0];
                    if (nnParams[pair]) {
                        dH += nnParams[pair].dH;
                        dS += nnParams[pair].dS;
                    } else if (nnParams[reversePair]) {
                        dH += nnParams[reversePair].dH;
                        dS += nnParams[reversePair].dS;
                    } else {
                        throw new Error('Invalid base pair encountered: ' + pair);
                    }
                }

                dS += 0.368 * (sequence.length - 1) * Math.log(Na);

                const Tm = (dH * 1000) / (dS + R * Math.log(4e-7)) - 273.15;

                return Tm;
            }
            parsetype(logfun) {
                if (this.type == 'siRNA-AS-5prime-TM') {
                    this.filteroligo = async function (oligo, tag) {

                        let filterstatus = 0;
                        return filterstatus;

                    }
                }
            }
            countPalindromes(dna, length) {
                let count = 0;

                function isPalindrome(substring) {
                    let len = substring.length;
                    for (let i = 0; i < len / 2; i++) {
                        if (substring[i] !== substring[len - 1 - i]) {
                            return false;
                        }
                    }
                    return true;
                }

                for (let i = 0; i <= dna.length - length; i++) {
                    let substring = dna.substring(i, i + length);
                    if (isPalindrome(substring)) {
                        count++;
                    }
                }

                return count;
            }

        }
        resolve(termoRule);
    });
}
