function () {

    return new Promise( async (resolve, reject) => {
        let rule = await exec('baja/manchester/annotation/rule-filter.js');
        let Biopolymer = await exec('baja/chem/biopolymer.js');

        let pick = class extends rule{
            n=0;
            thresh;

            constructor(rawrule, type, rulestring, priority, thresh, logfun) {

                super(rawrule, type, rulestring, 10**6, logfun);
                this.thresh = thresh;
                this.parsetype(logfun);
            }

            async parsetype(logfun) {
                if (this.type == 'random-pick') {
                    this.oligomessage = `Oligo randomly picked from ${this.n} candidates to reach ${this.thresh} oligos`
                    this.outmessage = `Randomly picked ${this.thresh} oligos from ${this.n}`
                    this.filteroligo = async function(oligo, tag) {
                        if (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0) {
                            oligo.synthesisSequence = Biopolymer.generateSynthesisSequence(o)
                        }

                        let filtStatus = 0;
                        let pickPercent =this.thresh/this.n;
                        let randomNumber = Math.random();
                        console.log('debubg');
                        if (randomNumber > pickPercent && (this.n - this.filteredOligos) > this.thresh && oligo.filter != 1) {
                            if (!tag) {
                                filtStatus = 1;
                                oligo.filter = 1;
                            }
                            oligo.filterexp.push([this.oligomessage,true]);
                            oligo.ruleexp.push([this.oligomessage,true]);
                        } else {
                            oligo.ruleexp.push([this.oligomessage,false]);
                        }
                        return filtStatus;
                    }
                }
            }

            async applyrule( oligos, nofilter ) {
                for (let o of oligos) {
                    if (o.filter != 1) {
                        this.n += 1;
                    }
                }

                await this.parsetype();
                for ( let i = 0; i < oligos.length; i++ ){
                    this.scannedOligos += 1;
                    let filtStatus = await this.filteroligo(oligos[i], nofilter);
                    if ( filtStatus == 1 ) {
                        this.filteredOligos += 1;
                    }
                }
            }

        }
        resolve(pick);
    });
}
