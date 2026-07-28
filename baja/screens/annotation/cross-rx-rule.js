function () {

    return new Promise( async (resolve, reject) => {
        let rule = await exec('baja/screens/annotation/rule-filter.js');
        let Biopolymer = await exec('baja/chem/biopolymer.js');

        let crossRx = class extends rule{

            dist;
            species;
            ortho;
            searchGenome;

            constructor(rawrule, type, rulestring, priority, dist, species, ortho, searchGenome, logfun) {
                super(rawrule, type, rulestring, priority);
                this.dist = dist;
                this.species = species;
                this.searchGenome = searchGenome;
                this.searchGenomes = searchGenome.split('/');
                this.ortho = ortho;
                this.parsetype(logfun);
            }

            parsetype(logfun) {
                if (this.type == 'cross-reactivity') {
                    this.oligomessage = `Oligo cross-reactive with ${this.species} orthologue ${this.ortho} at distance=${this.dist}`
                    this.outmessage = `${this.species} cross-reactive at ${this.dist}`

                    this.filteroligo = async function(oligo, tag) {

                        if (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0) {
                            oligo.synthesisSequence = Biopolymer.generateSynthesisSequence(o)
                        }

                        let filtStatus = 0;
                        let cross = 1;
                        if ( oligo.offtarget && oligo.offtarget.length > 0 ) {
                            for ( let h of oligo.offtarget ) {
                                if ( this.searchGenomes.includes(h[0]) && this.comporthos(h[6]) && h[4] <= this.dist ) {
                                    cross = 0;
                                }
                            }

                            if (cross == 1) {

                                if (!tag) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage,true]);
                                oligo.ruleexp.push([this.oligomessage,true]);
                            }
                        }
                        oligo.ruleexp.push([this.oligomessage,false]);
                        return filtStatus;
                    }
                }
            }

            comporthos( hitArray ) {

                let hitNames = [];
                for (let hit of hitArray) {
                    hitNames.push(hit.split('/[\(:]/')[0])
                }
                let intersection = hitNames.filter(gene => this.comporthos.includes(gene));
                return intersection.length > 0;
            }

        }
        resolve(crossRx);
    });
}
