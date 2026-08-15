function () {

    return new Promise( async (resolve, reject) => {
        let rule = await exec('baja/manchester/annotation/rule-filter.js');
        let Biopolymer = await exec('baja/chem/biopolymer.js');

        let spaceRule = class extends rule{
            n;
            thresh;
            constructor(rawrule, type, rulestring, priority, overlap, logfun) {
                super(rawrule, type, rulestring, priority, logfun);
                this.overlap = overlap;
                this.parsetype(logfun);
            }
            parsetype(logfun) {
                if (this.type == 'nt-overlap') {
                    this.oligomessage = `Oligo doesn't overlap SNP/InDel with >= ${this.overlap} bases on both sides`
                    this.outmessage = `overlap <= ${this.overlap}`

                    this.filteroligo = async function(oligo, tag) {
                        let filtStatus = 0;
                        let keep = 0;
                        let type, start, end = null;
                        if (oligo.linkSnpindels.length > 0) {
                            for (let sid of oligo.linkSnpindels) {
                                [type, start, end] = this.parseSnpString ( sid );
                                if (type == 'snp' ) {

                                    if ( (oligo.xf >= end + this.overlap && oligo.xi <= start - this.overlap)) {
                                        keep = 1;
                                    }
                                } else if ( type == 'del' || type == 'ins') {

                                    if (oligo.xf >= start + this.overlap || oligo.xi <= end - this.overlap) {
                                        keep = 1;
                                    }

                                }
                            }

                            if (!keep && !tag) {
                                filtStatus = 1;
                                oligo.filter = 1;
                                oligo.filterexp.push([this.oligomessage, true]);
                                oligo.ruleexp.push([this.oligomessage, true]);
                            } else {
                                oligo.ruleexp.push([this.oligomessage, false]);
                            }
                        }
                        return filtStatus;
                    }
                }
            }
            parseSnpString ( sidstring ) {

                if (sidstring.includes("_") && sidstring.includes("_")) {
                    let splitSid = sidstring.split("_");
                    let splitNuc = splitSid[1].split("->");
                    let ref = splitNuc[0];
                    let alt = splitNuc[1];
                    let type = splitSid[0].slice(0,3);
                    let start = +splitSid[0].slice(3);
                    let end = start + ref.length;
                    return [type, start, end];
                }
                return [null, null, null];
            }

        }
        resolve(spaceRule);
    });
}
