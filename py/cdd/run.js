function (em, proteinSeq ) {

        let parseDomains = (index, output) => {
            let domains = []
            for (let i = index; i < output.length; i++) {
                let line = output[i];
                if (line.startsWith('ENDDOMAINS')) {
                    return domains;
                } else {
                    let tline = line.split('\t');
                    let d = {
                        'type': tline[2],
                        'start': tline[4],
                        'end': tline[5],
                        'evalue': tline[6],
                        'id': tline[8],
                        'name': tline[9]
                    }
                    domains.push(d);
                }
            }
        }
        let parseSites = (index, output) => {
            let sites = []
            for (let i = index; i < output.length; i++) {
                let line = output[i];
                if (line.startsWith('ENDSITES')) {
                    return sites;
                } else {
                    let tline = line.split('\t');
                    let siteObj = {
                        'name': tline[3],
                        'sites': tline[4]
                    }
                    sites.push(siteObj)
                }
            }
        }

        let index = 0;
        let annotations = {
        }
        if (!value['file'] || value['file'].length < 0) {
            return;
        }

        let output = value['file'].split('\n')
        for (let o of output) {
            if (o.startsWith('DOMAIN')) {
                let domains = parseDomains(index + 1, output);
                annotations['domains'] = domains;
            }
            if (o.startsWith('SITES')) {
                let sites = parseSites(index + 1, output);
                annotations['sites'] = sites;
            }
            index++;
        }

        let getNucleotideIndex = (t) => {
            let index = 0;
            for (let i = 0; i < cdsi.length; i += 3) {
                if (index === t) {
                    let value = cdsi[i]
                    return value.index;
                }
                index++;
            }

            return -1;
        }

        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }

        let _d = annotations['domains']
        for (let i of _d) {
            let name = i['name']
            let type = i['type']
            let start = i['start']
            let end = i['end']
            let istart = getNucleotideIndex(+start)
            let iend = getNucleotideIndex(+end)
            let annotation = new Annotation('ProteinDomain', name, istart, iend)
            annotation.labelY = Math.random () + 1;
            selectedTrack.add(annotation)
        }

        let d = annotations['sites']
        for (let i of d) {
            let name = i['name']
            let sites = i['sites']
            if (sites != null && sites.length > 0) {
                if (sites.indexOf(',') > 0) {
                    for (let s of sites.split(',')) {
                        let t = s.substring(1).trim()
                        let start = getNucleotideIndex(+t)
                        if (start >= 0) {
                            let annotation = new Annotation('AA', name, start - 2, start + 1)
                            annotation.labelY = Math.random() + 1;

                            selectedTrack.add(annotation)
                        } else {
                            showModal({
                                wid: 'json',
                                data: JSON.stringify(s)
                            })
                        }
                    }
                } else {
                    let t = sites.substring(1).trim()
                    let start = getNucleotideIndex(+t)
                    let annotation = new Annotation('AA', name, start - 2, start + 1)
                    annotation.labelY = Math.random() + 1;
                    selectedTrack.add(annotation)

                }
            }
        }

        showModal({
            wid: 'json',
            data: proteinSeq + '\n\n----------------------\n' + JSON.stringify(annotations)
        })

}
