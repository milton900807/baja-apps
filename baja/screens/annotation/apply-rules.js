function (selectedTrack, targetOligon) {
    return new Promise(async (resolve, reject) => {

        let rule = await exec('baja/screens/annotation/rule-filter.js');
        let Biopolymer = await exec('baja/chem/biopolymer.js');

        function summarizeAndSortMatches(mi_targets_transient_) {
            const countMap = new Map();

            mi_targets_transient_.forEach(target => {
                const key = `${target.chr}|${target.genome}|${target.editdistance}`;
                countMap.set(key, (countMap.get(key) || 0) + 1);
            });

            const sortedMatches = Array.from(countMap, ([key, count]) => ({
                key,
                count
            }));

            sortedMatches.sort((a, b) => b.count - a.count);

            const summaryArray = sortedMatches.map(entry => ({
                description: `Combination: ${entry.key}, Occurrences: ${entry.count}`
            }));

            return summaryArray;
        }

        let ot = class extends rule {
            n;
            thresh;
            constructor(type, rulestring, priority, n, thresh) {
                super(type, rulestring, priority);
                this.n = n;
                this.thresh = thresh;
                this.parsetype();
            }
            parsetype() {
                if (this.type == 'offtarget-distance') {
                    this.oligomessage = `Oligo exceeds threshold of ${this.thresh} hits of distance=${this.n}`
                    this.outmessage = `hits of distance = ${this.n}`

                    this.filteroligo = async function (oligo, tag) {

                        if (oligo.synthesisSequence == null || oligo.synthesisSequence.length <= 0) {
                            oligo.synthesisSequence = Biopolymer.generateSynthesisSequence(o)
                        }

                        let filtStatus = 0;
                        if (oligo.offtarget && oligo.offtarget.length > 0) {
                            let count = 0;
                            for (let h of oligo.offtarget) {
                                if (h[3] == this.n && h[5].length > 0) {
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
                } else if (this.type == 'seed-sequence-offtarget') {
                    this.oligomessage = `Seed sequence exceeds threshold of ${this.thresh} hits of distance=${this.n}`
                    this.outmessage = `hits of distance = ${this.n}`
                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = 0;
                        if (oligo.mi_targets_transient_ && oligo.mi_targets_transient_> 0) {
                            let count = oligo.mi_targets_transient_;
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

                else if (this.type == 'seed-sequence-multiple-hits') {
                    this.oligomessage = `Seed sequence exceeds threshold of ${this.thresh} hits of distance=${this.n}`
                    this.outmessage = `hits of distance = ${this.n}`
                    this.filteroligo = async function (oligo, tag) {
                        function parseIntegerOrNull(variable) {
                            const parsed = parseInt(variable, 10);
                            return isNaN(parsed) ? null : parsed;
                        }

                        let filtStatus = 0;
                        if (oligo.mi_targets_transient_ && oligo.mi_targets_transient_> 0) {
                            let count = oligo.mi_targets_transient_;
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
                        if (oligo.offtarget && oligo.offtarget.length > 0) {
                            let count = 0;
                            for (let h of oligo.offtarget) {
                                if (h[4] >= this.n && h[5].length > 0) {
                                    count += 1;
                                }
                            }
                            if (count > this.thresh) {
                                if (!tag) {
                                    oligo.filter = 1;
                                }
                                oligo.filterexp.push([this.oligomessage, count]);
                            }
                            oligo.ruleexp.push([this.oligomessage, count]);
                        }
                        return filtStatus;
                    }

                } else if (this.type == 'offtarget-overflow') {
                    this.oligomessage = `Oligo aligned to reference genome more than ${this.n} times`
                    this.outmessage = `${this.n} alignments`
                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = 0;
                        if (oligo.offtarget && oligo.offtarget.length > 0) {
                            let count = oligo.offtarget.length;
                            if (count >= this.n) {
                                if (!tag) {
                                    filtStatus = 1;
                                    oligo.filter = 1;
                                }
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

        }

        let my_rules = [];

        if (selectedTrack.targetPhase) {

            let phaseselect = null;
            if (selectedTrack.targetPhase > 0) {
                phaseselect = 0;
            } else {
                phaseselect = 1;
            }

            let [splicedtrack, splicedindices] = await exec('baja/screens/annotation/splice-indels.js', selectedTrack, phaseselect);

            let phaseRule = class extends rule {
                oppPhase;
                constructor(type, rulestring, priority, oppPhase) {
                    super(type, rulestring, priority);
                    this.oppPhase = oppPhase;
                    this.parsetype();
                }
                parsetype() {
                    this.oligomessage = `Oligo has 100% complementarity to non-target phase`
                    this.outmessage = `Match non-target phase`
                    this.filteroligo = async function (oligo, tag) {
                        let filtStatus = null;
                        if (this.oppPhase.includes(oligo.sequence)) {
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
                        return 0;
                    }
                }
            }
            my_rules.push(new phaseRule('phaserule', '', 1, splicedtrack));
        }

        my_rules.push(new ot('offtarget-overflow', '', 1, 50, null))
        my_rules.push(new ot('offtarget-distance', '', 1, 0, 1));
        my_rules.push(new ot('offtarget-distance', '', 1, 1, 5));

        my_rules.push(new ot('offtarget-distance', '', 3, 2, 10));
        my_rules.push(new ot('offtarget-distance', '', 3, 3, 20));

        my_rules.push(new ot('offtarget-contiguous', '', 2, 17, 5));

        my_rules.push(new ot('offtarget-contiguous', '', 4, 15, 15));
        my_rules.push(new ot('offtarget-contiguous', '', 4, 10, 20));

        my_rules.push(new rule('nucleotide-content', 'G/C,0.30,0.7', 2));

        my_rules.push(new rule('nucleotide-content', 'A/C,0.25,0.75', 4));
        my_rules.push(new rule('nucleotide-content', 'T/C,0.25,0.75', 4));

        my_rules.push(new rule('nucleotide-content', 'CG,0,0.25', 2));

        my_rules.push(new rule('pattern', 'TTTTTT', 3));
        my_rules.push(new rule('pattern', 'AAAAAA', 3));
        my_rules.push(new rule('pattern', 'CCCCCC', 2));
        my_rules.push(new rule('pattern', 'GGGGG', 2));

        my_rules.sort((_a, _b) => _a.priority - _b.priority);

        let nofilter = null;

        let rulePriorities = [];
        for (let i = 0; i < my_rules.length; i++) {
            rulePriorities.push(my_rules[i].priority);
        }

        let priority = rulePriorities[0];

        for (let i = 0; i < rulePriorities.length; i++) {

            let count = 0;
            for (let o of selectedTrack.oligos) {
                if (o.filter == 1) {
                    count += 1;
                }
            }
            if (my_rules[i].priority > 2) {
                nofilter = 1;
            }
            if (my_rules[i].priority != priority) {

                if (count < targetOligon) {
                    nofilter = 1;
                }
            }
            console.log(my_rules[i]);
            console.log(priority)
            console.log(nofilter);
            await my_rules[i].applyrule(selectedTrack.oligos, nofilter);
            priority = my_rules[i].priority;

        }
        resolve(my_rules);
    });
}
