function () {

    return new Promise(async (resolve, reject) => {

        let Ott = class OTT {

            cac = {}

            async runOffTarget___deprecated(sequence) {
                if (this.cac[sequence] != null) {
                    let display = this.cac[sequence];

                    if (Object.keys(display).length > 0) {
                        let display_a = []
                        for (let dname of Object.keys(display)) {
                            display_a.push(dname + '(' + display[dname] + ')')
                        }
                        return display_a;
                    }
                }

                let oep = window["env"]["offtarget"];
                if (!oep || oep.length <= 0) {
                    oep = '/levenshtein'
                }
                alert(" --- ")
                let js = await GETJSON(`${oep}/run-off-targets?id=9812&sequence=${sequence}&editDistance=0&genome=Homo_sapiens.GRCh38.88.3utr.4bit&runMode=traceback`);
                let oligoQuery = js.oligoQuery;
                if (oligoQuery && oligoQuery.length > 0) {
                    let hits = oligoQuery[0].genomes[0].hits;
                    let ot = oligoQuery[0].offtarget;

                    if (!ot) {
                        return;
                    }

                    let transcript = []
                    for (let o of ot) {
                        let c = o.chr.substring(0, 15);
                        transcript.push(c);
                    }

                    let getWordCntRd = (array) => {
                        return array.reduce((prev, nxt) => {
                            prev[nxt] = (prev[nxt] + 1) || 1;
                            return prev;
                        }, {});
                    }
                    let t = getWordCntRd(transcript);
                    let n = {}
                    for (let c of Object.keys(t)) {
                        if (t[c] > 3) {
                            n[c] = t[c]
                        }
                    }

                    let display = {}
                    let index = 0;
                    if (Object.keys(n).length > 0) {
                        console.log(' \n\n\n\n\n' + n + ' \n\n\n\n\n')
                        for (let d of Object.keys(n)) {
                            let en = n[d]
                            let j = await GETJSON(`https://rest.ensembl.org/lookup/id/${d}?expand=1;content-type=application/json`)
                            if (j && j.display_name != null) {

                                let display_name = j.display_name;

                                let count = display[display_name]
                                if (count != null && count > 0) {
                                    count += en;
                                    display[display_name] = count;
                                } else {
                                    display[display_name] = en;
                                }
                            }
                            index++;
                            if (index > 5) {
                                break;
                            }
                        }
                        this.cac[sequence] = display;

                        if (Object.keys(display).length > 0) {
                            let display_a = []
                            for (let dname of Object.keys(display)) {
                                display_a.push(dname + '(' + display[dname] + ')')
                            }
                            return display_a;
                        }
                    } else {
                        this.cac[sequence] = '-';

                    }
                }

            }

        }

        resolve(Ott);

    });
}
