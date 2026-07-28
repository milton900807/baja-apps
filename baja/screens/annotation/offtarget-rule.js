function () {

    return new Promise(async (resolve, reject) => {
        let rule = await exec('baja/screens/annotation/rule-filter.js');
        let Biopolymer = await exec('baja/chem/biopolymer.js');
        let ot = class extends rule {
            n;
            thresh;
            species;
            searchGenome;
            geneOverlap;

            constructor(rawrule, type, rulestring, priority, n, thresh, species, searchGenome, geneOverlap, logPanel) {
                super(rawrule, type, rulestring, priority, logPanel);
                this.n = n;
                this.thresh = thresh;
                this.species = species;
                this.searchGenome = searchGenome;
                this.geneOverlap = geneOverlap;
                this.parsetype(logPanel);
            }

            summarizeAndSortMatches(mi_targets_transient_) {
                const countMap = new Map();

                mi_targets_transient_.forEach(target => {
                    const key = `${target.chr}|${target.genome}|${target.editdistance}`;
                    countMap.set(key, (countMap.get(key) || 0) + 1);
                });

                const sortedMatches = Array.from(countMap, ([key, num]) => ({
                    key,
                    num
                }));

                sortedMatches.sort((a, b) => b.num - a.num);

                return sortedMatches;

            }

            parsetype(logPanel) {
                if (this.type == 'offtarget-distance') {

                    this.oligomessage = `Oligo exceeds threshold of ${this.thresh} hits of distance=${this.n}`
                    this.outmessage = `hits of distance = ${this.n}`

                    this.filteroligo = async function (oligo, tag) {

                        if (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0) {
                            oligo.synthesisSequence = Biopolymer.generateSynthesisSequence(o)
                        }

                        let filtStatus = 0;
                        let count = 0;
                        if (oligo.offtarget && oligo.offtarget.length > 0) {

                            for (let h of oligo.offtarget) {

                                let chr = h['chr']
                                let editDistance = h['editdistance']
                                let genome = h['genome']

                                if (genome && genome.length > 0 && genome.toUpperCase().indexOf('GRCH38') >= 0) {
                                    genome = 'GRCH38'
                                }
                                if (genome == this.species && editDistance == this.n) {
                                    if (this.geneOverlap) {
                                        count += 1;
                                    } else {
                                        count += 1;
                                    }
                                }
                            }
                            if (count > this.thresh) {
                                if (!tag) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, count]);
                            }
                        }
                        oligo.ruleexp.push([this.oligomessage, count]);
                        return filtStatus;
                    }
                }
                else if (this.type == 'offtarget-traceback') {
                    this.oligomessage = `Oligo exceeds threshold of ${this.thresh} hits of distance=${this.n}`
                    this.outmessage = `hits of distance = ${this.n}`

                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = 0;
                        if (oligo.offtarget && oligo.offtarget.length > 0) {
                            let count = 0;
                            for (let h of oligo.offtarget) {

                                if (h['editDistance'] == this.n) {
                                    count += 1;
                                }
                            }
                            if (count > this.thresh) {
                                if (!tag) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, count]);
                            }
                            oligo.ruleexp.push([this.oligomessage, count]);
                        }
                        return filtStatus;
                    }
                }
                else if (this.type == 'offtarget-seed') {
                    this.oligomessage = `Oligo exceeds threshold of ${this.thresh} hits on the same 3'utr`
                    this.outmessage = `>=${this.n} contiguous bases`

                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = 0;
                        let count = 0;
                        let hcount = 0;

                        if (oligo.mi_targets_transient_ != null && oligo.mi_targets_transient_.length > 0 && Array.isArray(oligo.mi_targets_transient_)) {
                            let hits = this.summarizeAndSortMatches(oligo.mi_targets_transient_)
                            for (let h of hits) {
                                if (h.num > this.thresh) {
                                    hcount++
                                }
                                if (hcount >= this.n) {
                                    this.oligomessage = `${this.n} different transcripts have exceed the threshold of ${this.thresh} hits on ${this.species}. `
                                    filtStatus = 1;
                                    oligo.status = 'High microRNA potential'
                                    oligo.filter = 1;
                                    oligo.mi_targets_transient_ = oligo.mi_targets_transient_.length + '';
                                    oligo.filterexp.push([this.oligomessage, count]);
                                    return filtStatus;
                                }
                            }
                            oligo.ruleexp.push([this.oligomessage, count]);
                            return filtStatus;
                        }
                    }
                }
                else if (this.type == 'seed-sequence-offtarget') {
                    this.oligomessage = `Seed sequence exceeds threshold of ${this.thresh} hits of distance=${this.n}`
                    this.outmessage = `hits of distance = ${this.n}`
                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = 0;
                        if (oligo.mi_targets_transient_ && oligo.mi_targets_transient_.length > 0) {
                            let count = 0;
                            for (let h of oligo.mi_targets_transient_) {
                                if (h['editDistance'] == this.n) {
                                    count += 1;
                                }
                            }
                            if (count > this.thresh) {
                                if (!tag) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, count]);
                            }
                            oligo.ruleexp.push([this.oligomessage, count]);
                        }
                        return filtStatus;
                    }
                }
                else if (this.type == 'offtarget-contiguous') {
                    this.oligomessage = `Oligo exceeds threshold of ${this.thresh} hits with >=${this.n} contiguous bases`
                    this.outmessage = `>=${this.n} contiguous bases`

                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = 0;
                        let count = 0;
                        if (oligo.offtarget && oligo.offtarget.length > 0) {
                            for (let h of oligo.offtarget) {
                                if (h[0] == this.species && h[5] == this.n) {
                                    if (this.geneOverlap) {
                                        if (h[6].length > 0) {
                                            count += 1;
                                        }
                                    } else {
                                        count += 1;
                                    }
                                }
                            }
                            if (count > this.thresh) {
                                if (!tag) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, count]);
                            }
                        }
                        oligo.ruleexp.push([this.oligomessage, count]);
                        return filtStatus;
                    }

                } else if (this.type == 'offtarget-overflow') {
                    this.oligomessage = `Oligo aligned to reference genome more than ${this.n} times`
                    this.outmessage = `${this.n} alignments`
                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = 0;
                        let count = 0;
                        if (oligo.offtarget && oligo.offtarget.length > 0) {
                            for (let h of oligo.offtarget) {
                                if (h[0] == this.species) {
                                    count += 1;
                                }
                            }
                            if (count >= this.n) {
                                if (!tag) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, true]);
                                oligo.ruleexp.push([this.oligomessage, true]);
                            }
                        }
                        oligo.ruleexp.push([this.oligomessage, false]);
                        return filtStatus;
                    }

                }
            }

        }
        resolve(ot);
    });
}
