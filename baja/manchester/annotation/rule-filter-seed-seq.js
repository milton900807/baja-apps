function() {
    return new Promise(async (resolve, reject) => {

        let rule = await exec('baja/manchester/annotation/rule-filter.js');

        let seedSeqrule = class ruleSeedSeq extends rule {
            rawrule;
            type = '';
            rulestring;
            oligomessage = '';
            priority;
            scannedOligos = 0;
            filteredOligos = 0;
            warning_log;

            constructor(rawrule, type, rulestring, priority, warning_log) {
                this.rawrule = rawrule;
                this.type = type;
                this.rulestring = rulestring;
                this.priority = priority;
                this.warning_log = warning_log;
                this.parsetype(warning_log);
            }

            parsetype(warning_log) {
                let rulestring = this.rulestring.split(',');
                if (this.type == 'nucleotide-content') {
                    this.filteron = rulestring[0];
                    this.filterlow = +rulestring[1];
                    this.filterhigh = +rulestring[2];
                    this.oligomessage = `${this.filteron} percentage not between ${this.filterlow} and ${this.filterhigh}`
                    this.outmessage = `${this.filteron}%`
                    this.filteroligo = async function (oligo, nofilter) {

                        if ( !oligo.getSeedSequence)
                        {
                            warning_log(oligo.id + ' no seed sequence; filters not applied')
                            return 0;
                        }

                        let seed = oligo.getSeedSequence ();

                        if (seed) {
                            let count = 0;
                            let filtStatus = null;
                            if (this.filteron.includes('/')) {
                                for (let substr of this.filteron.split('/')) {
                                    count += (seed.match(new RegExp(substr, 'g')) || []).length
                                }
                            } else {
                                count += (seed.match(new RegExp(this.filteron, 'g')) || []).length
                            }
                            if (!((this.filterlow <= count / seed.length) && (count / seed.length <= this.filterhigh))) {
                                if (!nofilter) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, count / seed.length])
                            }
                            oligo.ruleexp.push([this.oligomessage, count / seed.length])
                            if (filtStatus) {
                                return 1;
                            }
                        } else {
                            warning_log(oligo.id + ' no seed sequence; filters not applied')
                        }
                        return 0;
                    }

                } else if (this.type == 'pattern') {
                    this.filteron = this.rulestring;
                    this.oligomessage = `${this.filteron} contained within oligo`
                    this.outmessage = `${this.filteron} motif`
                    this.filteroligo = async (oligo, nofilter) => {
                        if (seed) {
                            let filtStatus = null;
                            if (seed.includes(this.filteron)) {
                                if (!nofilter) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, true])
                                oligo.ruleexp.push([this.oligomessage, true])
                            } else {
                                oligo.ruleexp.push([this.oligomessage, false])
                            }
                            if (filtStatus) {
                                return 1;
                            }
                            return 0;
                        } else {
                            warning_log(oligo.id + ' no seed sequence; filters not applied')
                            return 0;
                        }
                    }
                } else if (this.type == 'pattern at') {
                    this.filteron = rulestring[0];
                    this.filterposition = +rulestring[1];
                    this.oligomessage = `${this.filteron} found at position ${this.filterposition}`
                    this.outmessage = `${this.filteron} at position ${this.filterposition}`
                    this.filteroligo = async function (oligo, nofilter) {
                        if (seed) {
                            let filtStatus = null;
                            if (seed.slice(this.filterposition, this.filteron.length + this.filterposition) == this.filteron) {
                                if (!nofilter) {
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
                        } else {
                            warning_log(oligo.id + ' no seed sequence; filters not applied.  Will pass all filters by default')

                        }
                        return 0;
                    }

                }

            }

            async applyrule(oligos, nofilter) {
                for (let i = 0; i < oligos.length; i++) {
                    this.scannedOligos += 1;
                    let filtStatus = await this.filteroligo(oligos[i], nofilter);
                    if (filtStatus == 1) {
                        this.filteredOligos += 1;
                        if (this.warning_log)
                            this.warning_log(oligos[i].id + ' FAILED ' + this.type + ' \t ' + this.oligomessage)
                    } else {
                        if (this.warning_log) {
                            if (this.filteron)
                                this.warning_log(oligos[i].id + " passed " + this.type + ' \t' + this.filteron)
                            else
                                this.warning_log(oligos[i].id + " passed " + this.type + ' \t' + this.rulestring)
                        }
                    }
                }
            }

        }
        resolve(seedSeqrule);
    });
}
