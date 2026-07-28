function () {

    return new Promise(async (resolve, reject) => {
        let rule = await exec('baja/screens/annotation/rule-filter.js');

        let Biopolymer = await exec('baja/chem/biopolymer.js');

        let palindromeRule = class extends rule {
            n;
            thresh;
            num

            constructor(rawrule, type, rulestring, priority, thresh, logfun) {
                super(rawrule, type, rulestring, priority, logfun);
                this.thresh = thresh;
                this.parsetype(logfun);
            }
            parsetype(logfun) {
                if (this.type == 'palindrome') {
                    this.filteroligo = async function (oligo, tag) {
                        if (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0) {
                            oligo.synthesisSequence = Biopolymer.generateSynthesisSequence(o)
                        }

                        let filterstatus = 0;
                        let seq = oligo.synthesisSequence
                        console.log('debubg');
                        this.num = this.countPalindromes(seq, this.thresh)
                        this.oligomessage = `Oligo has palindromes at ${this.num}`
                        this.outmessage = `palindromes => ${this.num}`

                        if (this.num >= this.thresh) {
                            oligo.filter = 1;
                            filterstatus = 1
                            oligo.filterexp.push([this.oligomessage, true]);
                            oligo.ruleexp.push([this.oligomessage, true]);
                        } else {
                            oligo.ruleexp.push([this.oligomessage, false]);
                        }
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
        resolve(palindromeRule);
    });
}
