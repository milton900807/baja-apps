function (ruleBlk, graph, logPanel) {
    return new Promise(async (resolve, reject) => {
        let rule = await exec('baja/manchester/annotation/rule-filter.js');

        let ruleSeedSeq = await exec('baja/manchester/annotation/rule-filter-seed-seq.js');
        let phaseRule = await exec('baja/manchester/annotation/phase-rule.js');
        let spaceRule = await exec('baja/manchester/annotation/space-rule.js');
        let ot = await exec('baja/manchester/annotation/offtarget-rule.js');
        let crossRx = await exec('baja/manchester/annotation/cross-rx-rule.js');
        let randomRule = await exec('baja/manchester/annotation/random-rule.js');
        let palindromeRule = await exec('baja/manchester/annotation/palindrome-rule.js');
        let termoRule = await exec ('baja/manchester/annotation/thermo-rule.js')

        let genomeKey = {
            'GRCH38': 'genome/',
            'GRCH38.GENE': '',
            'MRATBN7': '',
            'MRATBN7.GENE': '',
            'GRCM39': '',
            'GRCM39.GENE': '',
            'MFASC_6.0': '',
            'MFASC_6.0.GENE': '',
            'HUMAN3UTR': '/mnt/genomes/Homo_sapiens.GRCh38.88.3utr.4bit',
        }

        let oep = window["env"]["offtarget"];
        if ( !oep || oep.length <=0 ){
            oep = '/levenshtein'
        }

        let url = `${oep}/genomes`
        let available_genomes = await GETJSON(url)
        for (let a of Object.keys(available_genomes)) {
            genomeKey[a.toString().trim().toUpperCase()] = ''
        }

        let orthoKey = {
            'ENSG00000142864': {
                'GRCM39': 'ENSMUSG00000036371',
                'MRATBN7': 'ENSRNOG00000005890',
                'MFASC_6.0': 'ENSMMUG00000000652',
            },
            'ENSG00000164164': {
                'GRCM39': 'ENSMUSG00000036990',
                'MRATBN7': 'ENSRNOG00000018477',
                'MFASC_6.0': 'ENSMMUG00000004437',
            },
        }

        console.log(ruleBlk);
        let rulename = null;
        let rulestring = null;
        let my_rules = [];

        if (ruleBlk != null && ruleBlk.indexOf('\n') < 0) {
            ruleBlk += '\n'
        }

        if (ruleBlk.indexOf('\n') > 0) {
            let rules = ruleBlk.split('\n');
            for (let r of rules) {
                r = r.split('|')[0].trim();
                if (r.trim().length > 0) {

                    r = r.replace(/ /g, '')
                    let splitrule = r.split(',');
                    if (splitrule.length > 1) {

                        if (splitrule[1].includes('>') || splitrule[1].includes('<')) {
                            splitrule[1] = splitrule[1].trim().split(' ').join('').split('and').join('');
                            rulestring = splitrule[1].split(/[><=]+/).join(',');
                            rulename = splitrule[0].trim();
                        } else if (splitrule[1].trim().length > 0) {
                            rulestring = splitrule[1].trim();
                            rulename = splitrule[0].trim();
                        } else {
                            rulestring = '';
                            rulename = splitrule[0].trim();
                        }

                        if (rulename) {

                            console.log(rulename)

                            if ((['nucleotide-content', 'pattern', 'pattern at']).includes(rulename)) {
                                my_rules.push(new rule(r, rulename, rulestring.toUpperCase(), 1, logPanel));

                            }
                            else
                            if ((['seed-pattern', 'seed-sequence-pattern']).includes(rulename)) {
                                my_rules.push(new ruleSeedSeq(r, rulename, rulestring.toUpperCase(), 1, logPanel));

                            }
                            else
                            if ((['siRNA-AS-5prime-TM']).includes(rulename)) {
                                my_rules.push(new thermoRule(r, rulename, rulestring.toUpperCase(), 1, logPanel));

                            }
                            else if ((['offtarget-distance', 'offtarget-contiguous', 'offtarget-overflow', 'offtarget-seed','seed-sequence-offtarget']).includes(rulename)) {

                                if (!genomeKey.hasOwnProperty(splitrule[1].trim().toUpperCase())) {
                                    alert("Error using genome: " + splitrule[1])
                                    resolve(null);
                                }

                                for (let rulei = 2; rulei < splitrule.length; rulei++) {
                                    rulestring += ',';
                                    rulestring += splitrule[rulei];
                                }

                                let geneOverlap = 1;

                                if (splitrule[1] && splitrule[2] && splitrule[3] && (['offtarget-distance', 'offtarget-contiguous']).includes(rulename)) {
                                    my_rules.push(new ot(
                                        r,
                                        rulename,
                                        rulestring.toUpperCase(),
                                        1,
                                        +splitrule[2],
                                        +splitrule[3],
                                        splitrule[1].trim().toUpperCase(),
                                        genomeKey[splitrule[1].trim().toUpperCase()],
                                        geneOverlap, logPanel
                                    ));
                                }
                                else if ((['offtarget-overflow']).includes(rulename) && splitrule[2] && splitrule[1]) {
                                    my_rules.push(new ot(
                                        r,
                                        rulename,
                                        rulestring.toUpperCase(),
                                        1,
                                        +splitrule[2],
                                        null,
                                        splitrule[1].trim().toUpperCase(),
                                        genomeKey[splitrule[1].trim().toUpperCase()],
                                        geneOverlap, logPanel
                                    ));
                                }
                                else if ((['seed-sequence-offtarget']).includes(rulename) && splitrule[2] && splitrule[1]) {
                                    my_rules.push(new ot(
                                        r,
                                        rulename,
                                        rulestring.toUpperCase(),
                                        1,
                                        +splitrule[2],
                                        +splitrule[3],
                                        splitrule[1].trim().toUpperCase(),
                                        genomeKey[splitrule[1].trim().toUpperCase()],
                                        geneOverlap, logPanel
                                    ));
                                }
                                else if ((['offtarget-seed']).includes(rulename) && splitrule[2] && splitrule[1]) {
                                    my_rules.push(new ot(
                                        r,
                                        rulename,
                                        rulestring.toUpperCase(),
                                        1,
                                        +splitrule[2],
                                        +splitrule[3],
                                        splitrule[1].trim().toUpperCase(),
                                        genomeKey[splitrule[1].trim().toUpperCase()],
                                        geneOverlap, logPanel))

                                }

                            } else if ((['phaserule']).includes(rulename)) {

                                let seq = [];
                                for (let t of graph.track) {
                                    if (t.oligos.length > 0) {
                                        let phaseselect = null;
                                        if (t.targetPhase) {
                                            if (t.targetPhase > 0) {
                                                phaseselect = 0;
                                            } else {
                                                phaseselect = 1;
                                            }

                                            let [splicedtrack, splicedindices] = await exec('baja/manchester/annotation/splice-indels.js', t, phaseselect);
                                            seq.push(splicedtrack);
                                        }
                                    }
                                }
                                if (seq.length > 0) {
                                    my_rules.push(new phaseRule(r, rulename, rulestring.toUpperCase(), 1, seq, logPanel));
                                }

                            }
                            else if (['palindrome'].includes(rulename)) {
                                my_rules.push(new palindromeRule(r, rulename, rulestring.toUpperCase(), 1, +splitrule[1], logPanel));
                            }
                            else if (['nt-overlap'].includes(rulename)) {
                                if (splitrule[2]) {
                                    my_rules.push(new spaceRule(r, rulename, rulestring.toUpperCase(), 1, +splitrule[2], logPanel));
                                }

                            } else if (['cross-reactivity'].includes(rulename)) {

                                let geneID = null;
                                for (let t of graph.track) {
                                    if (t.geneID) {
                                        geneID = t.geneID
                                    }
                                }

                                for (let rulei = 2; rulei < splitrule.length; rulei++) {
                                    rulestring += ',';
                                    rulestring += splitrule[rulei];
                                }

                                console.log(geneID)
                                console.log(orthoKey[geneID])
                                console.log(orthoKey[geneID][splitrule[1].trim().toUpperCase()])

                                my_rules.push(new crossRx(
                                    r,
                                    rulename,
                                    rulestring.toUpperCase(),
                                    1,
                                    +splitrule[2],
                                    splitrule[1].trim().toUpperCase(),
                                    orthoKey[geneID][splitrule[1].trim().toUpperCase()],
                                    genomeKey[splitrule[1].toUpperCase()], logPanel
                                ));
                            } else if (['random-pick'].includes(rulename)) {
                                my_rules.push(new randomRule(r, rulename, rulestring.toUpperCase(), 1, +splitrule[2], logPanel));

                            } else {
                                resolve(null);
                            }
                        }
                    }
                }
            }
        }
        my_rules.sort((_a, _b) => _a.priority - _b.priority);
        console.log(my_rules)
        resolve(my_rules);
    });
}
