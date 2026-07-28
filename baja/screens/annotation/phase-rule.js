function () {

    return new Promise(async (resolve, reject) => {
        let Biopolymer = await exec('baja/chem/biopolymer.js');

        let rule = await exec('baja/screens/annotation/rule-filter.js');
        let phaseRule = class extends rule {
            oppPhase;
            constructor(rawrule, type, rulestring, priority, oppPhase, logfn) {
                super(rawrule, type, rulestring, priority, logfn);
                this.oppPhase = oppPhase;
                this.parsetype(logfn);
            }
            parsetype(logfun) {
                this.oligomessage = `Oligo has 100% complementarity to non-target phase`
                this.outmessage = `Match non-target phase`
                this.filteroligo = async function (oligo, tag) {

                    if (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0) {
                        oligo.synthesisSequence = Biopolymer.generateSynthesisSequence(o)
                    }

                    let filtStatus = null;
                    for (let opp of this.oppPhase) {
                        if (opp.includes(oligo.sequence)) {
                            if (!tag) {
                                filtStatus = 1;
                                oligo.filter = 1;
                            }
                            oligo.filterexp.push([this.oligomessage, true]);
                            oligo.ruleexp.push([this.oligomessage, true]);
                        } else {
                            oligo.ruleexp.push([this.oligomessage, false]);
                        }
                        if (filtStatus) {
                            return 1;
                        }
                    }
                    return 0;
                }
            }
        }
        resolve(phaseRule);
    });

}
