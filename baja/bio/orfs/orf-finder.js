function (graph) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })

    let start = -1;
    let end = -1;
    let ywc = -1;
    let selectedTrack = null;
    graph.addMouseMoveListener((x, y) => {
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.track[p_trackIndex])
                graph.track[p_trackIndex].showResizeBar = true;
            return;
        }
    }
    )
    graph.addMouseDownListener(async (x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        let menuList = []
        let editor;
        let typeAhead;
        let type_ahead = createIonFunction((ref) => {
            typeAhead = ref;
        })

        let cb3 = createIonFunction((ref) => {
            editor = ref;
        })
        menuList.push({
            label: 'Default ORF',
            click: async (xwc, ywc) => {
                for (let as of selectedTrack.annotations) {
                    if (as.type == 'NMD') {
                        selectedTrack.removeAnnotation(as)
                    }
                }
                selectedTrack.generateORF()
                let seq = selectedTrack.orf.cdsi;
                if (!seq) {
                    prompt(" No sequence found; cannot apply an oligo ")
                } else {
                    graph.setMessage(" Generation complete ")

                }
            },
            move: () => {
                log('')
            }
        })

        menuList.push({
            label: 'Clear ORF',
            click: async (xwc, ywc) => {
                for (let as of selectedTrack.annotations) {
                    if (as.type == 'NMD') {
                        selectedTrack.removeAnnotation(as)
                    }
                }
                selectedTrack.orf = []
            },
            move: () => {
                log('')
            }
        })

        menuList.push({
            label: 'Insert SNP',
            click: async (xwc, ywc) => {

                let panel;
                let __nameHook = (panel) => {
                    panel = panel;
                }

                if (selectedTrack) {

                    let seq = selectedTrack.getSequence();
                    start = +start;
                    end = +end;
                    let gene_start = selectedTrack.tgraph.X(start)
                    let gene_end = selectedTrack.tgraph.X(end)
                    let dseq = seq.substring(gene_start, start + 1)

                    showModal(
                        {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: ` ` + dseq
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': `.
                                        `                   ,
                                            'width': '90%',
                                            'component':
                                            {

                                                wid: 'input-param-items',
                                                refCallback: __nameHook,
                                                data: {
                                                    'input_labels': ['SNP'],
                                                }
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                let seq = selectedTrack.getSequence();
                                                                let start = panel.get('SNP')
                                                                start = +start;
                                                                end = +end;
                                                                gstart = selectedTrack.tgraph.X(start)
                                                                gend = selectedTrack.tgraph.X(end)
                                                                graph.zoom(gstart, gend)
                                                                await hideAllModal();
                                                            })
                                                        },
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                hideAllModal();
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }, 300, 200)

                }
            },
            move: () => {
                log('')
            }
        })

        menuList.push({
            label: 'ORF with protein domains',
            click: async (xwc, ywc) => {
                let Annotation = await exec('flexigraph/annotation.js')

                for (let as of selectedTrack.annotations) {
                    if (as.type == 'NMD') {
                        selectedTrack.removeAnnotation(as)
                    }
                }
                selectedTrack.generateORF()
                let cdsi = selectedTrack.orf.cdsi;
                let proteinSeq = '';
                for (let c = 0; c < cdsi.length; c += 3) {
                    proteinSeq += cdsi[c].aa
                }
                let progressBar;
                let w = {
                    wid: 'progress',
                    componentRef: 'progressBar',
                    data: {
                        'progress': 10,
                        'progressBar': createIonFunction((progessBar) => {
                            progressBar = progessBar;
                        })
                    }
                }
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', w);
                let em = new EngineMonitor((msg) => {
                    log(msg)
                });
                em.addProgressListener(async (v) => {
                    if (v >= 100) {
                        let script_canvas = await exec('baja/screens/menu/annotation-navigation-tools.js', graph)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', script_canvas);

                    }
                    progressBar(v);
                })
                exec('/py/cdd/test.py', em, '' + proteinSeq.toString(), 21).then(async value => {
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
                        annotation.labelY = Math.random() + 2;
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

                                        let annotation = new Annotation('AA', name, start, start + 3)
                                        annotation.labelY = Math.random() + 2 * Math.random();
                                        selectedTrack.add(annotation)
                                    } else {
                                        console.log(' s ' + JSON.stringify(s))

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
                })

                graph.setMessage(" Generation complete ")
            },
            move: () => {
                log('')
            }
        })

        menuList.push({
            label: 'Donor splice sites',
            click: async (xwc, ywc) => {
                let Annotation = await exec('flexigraph/annotation.js')
                let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                function sleep(ms) {
                    return new Promise(resolve => setTimeout(resolve, ms));
                }

                if (selectedTrack) {
                    let xtc = selectedTrack.tgraph.Xwc(x);
                    let xoffset = 20;
                    let introns = selectedTrack.getIntrons(xoffset);
                    let index = 0;

                    let found = false;
                    for (let i of introns) {

                        if (i.xi < xtc && i.xf > xtc) {
                            found = true;
                            let values = rnaSplice.findDonorSpliceSites(fiveprime, selectedTrack.strand)
                            let splice = values.potentialSites;
                            let csplice = values.canonicalSites;

                            for (let sp of splice) {
                                await sleep(50);
                                let tr = new Annotation("Donor-Splice-Site", 'ss' + sp.site, (i.xf) - sp.position - sp.site.length,
                                    i.xf - sp.position, selectedTrack.strand);
                                selectedTrack.add(tr);
                            }
                            for (let sp of csplice) {
                                await sleep(50);
                                let tr = new Annotation("Canonical-Donor-Splice-Site", 'css' + sp.site, (i.xf) - sp.position - sp.site.length,
                                    i.xf - sp.position, selectedTrack.strand);
                                selectedTrack.add(tr);
                            }
                        }
                    }
                    if (!found) {
                    }
                }
            },
            move: () => {
                log('')
            }
        })

        menuList.push({
            label: 'Acceptor splice sites',
            click: async (xwc, ywc) => {
                let Annotation = await exec('flexigraph/annotation.js')
                let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                function sleep(ms) {
                    return new Promise(resolve => setTimeout(resolve, ms));
                }
                if (selectedTrack) {
                    let xtc = selectedTrack.tgraph.Xwc(x);
                    let xoffset = 20;
                    let introns = selectedTrack.getIntrons(xoffset);
                    let index = 0;
                    let found = false;
                    for (let i of introns) {

                        if (i.xi < xtc && i.xf > xtc) {
                            found = true;
                            let fiveprime = i.seq;

                            let values = rnaSplice.findAcceptorSpliceSites(fiveprime, selectedTrack.strand)
                            let splice = values;
                            for (let sp of splice) {
                                await sleep(50);
                                let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, i.xi + sp.position,
                                    i.xi + sp.position + sp.site.length, selectedTrack.strand);
                                selectedTrack.add(tr);

                            }

                        }

                        index++;
                    }
                    if (!found) {
                        graph.setMessage("Click on an intron in a track. ", graph.X(xwc), graph.Y(ywc) - 20)
                    }
                }

            },
            move: () => {
                log('')
            }
        })

        trackIndex = graph.getTrack(x, y);
        let Annotation = await exec('flexigraph/annotation.js')

        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        let annotations = selectedTrack.annotations;
        let sorted_annotations = selectedTrack.annotations;
        if (sorted_annotations && sorted_annotations.length) {
            if (selectedTrack.strand > 0)
                sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            else
                sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
            for (let menuA of sorted_annotations) {
                if (menuA.inAnnotation(selectedTrack.tgraph.Xwc(x)) && menuA.type === 'Exon') {
                    menuList.push({
                        label: 'Skip ' + menuA.name,
                        click: async (xwc, ywc) => {
                            for (let as of selectedTrack.annotations) {
                                if (as.type == 'NMD') {
                                    selectedTrack.removeAnnotation(as)
                                }
                            }
                            graph.setMessage('Removing ' + menuA.name)

                            let codon = await exec('baja/bio/aa/codons.js')
                            let NMDAnnotation = await exec('baja/bio/splicing/nmd-annotation.js')
                            let startIndex = -1;
                            let endIndex = -1;
                            for (let an of sorted_annotations) {
                                if (an.type.toLowerCase() === 'translation') {
                                    startIndex = an.xi;
                                    endIndex = an.xf;
                                }
                            }
                            for (let an of sorted_annotations) {
                                if (an.type.toLowerCase() === 'translation' || an.type.toLowerCase() === 'transcription') {
                                    startIndex = an.xi;
                                    endIndex = an.xf;
                                }
                            }
                            if (startIndex < 0) {
                                for (let an of sorted_annotations) {
                                    if (an.type.toLowerCase() === 'tss') {
                                        startIndex = an.xi;
                                    }
                                }
                            }

                            if (endIndex < 0) {
                                for (let an of sorted_annotations) {
                                    if (an.type.toLowerCase() === 'stop') {
                                        endIndex = an.xf;
                                    }
                                }
                            }

                            let seq = '';
                            let cdsIndex = []
                            let codon_i = 0;
                            let codon_ii = 0;
                            let base_i = 1;
                            let codon_value = ''
                            let cds_i = false;

                            if (selectedTrack.strand > 0) {
                                for (let a of sorted_annotations) {
                                    if (a.type === "Exon" && a != menuA) {
                                        let ai = a.xi;
                                        let af = a.xf;

                                        if (startIndex >= a.xi && startIndex < a.xf) {
                                            ai = startIndex;
                                            cds_i = true;
                                        }
                                        if (endIndex >= a.xi && endIndex < a.xf) {
                                            af = endIndex;
                                            let tt = selectedTrack.sequence.substring(Math.floor(ai - selectedTrack.xi), Math.floor(af - selectedTrack.xi) + 1);
                                            for (let gene_index = 0; gene_index < tt.length; gene_index++) {

                                                codon_value += tt[gene_index]
                                                cdsIndex.push({
                                                    'codon_index': codon_i,
                                                    'ci': codon_ii,
                                                    'index': gene_index + ai,
                                                    'codon': codon_value
                                                })
                                                codon_ii++;
                                                if (base_i % 3 === 0) {
                                                    for (let ci of cdsIndex) {
                                                        if (ci.codon_index === codon_i) {
                                                            ci.codon = codon_value
                                                            let aa = codon(codon_value);
                                                            if (aa === 'STOP') {

                                                            }

                                                        }
                                                    }
                                                    codon_ii = 0;
                                                    codon_i++;
                                                    codon_value = ''
                                                }
                                                base_i++;
                                            }
                                            seq += tt;
                                            cds_i = false
                                        }
                                        if (cds_i) {
                                            let tt = selectedTrack.sequence.substring(Math.floor(ai - selectedTrack.xi), Math.floor(af - selectedTrack.xi) + 1);
                                            for (let gene_index = 0; gene_index < tt.length; gene_index++) {

                                                codon_value += tt[gene_index]
                                                cdsIndex.push({
                                                    'codon_index': codon_i,
                                                    'ci': codon_ii,
                                                    'index': gene_index + ai,
                                                    'codon': codon_value
                                                })

                                                codon_ii++;
                                                if (base_i % 3 === 0) {
                                                    for (let ci of cdsIndex) {
                                                        if (ci.codon_index === codon_i) {
                                                            ci.codon = codon_value
                                                            let aa = codon(codon_value);
                                                            if (aa === 'STOP') {

                                                            }
                                                        }

                                                    }

                                                    codon_i++;
                                                    codon_ii = 0;
                                                    codon_value = ''
                                                }
                                                base_i++;
                                            }
                                            seq += tt;
                                        }
                                    }
                                }
                                for (let o of cdsIndex) {
                                    let aa = codon((o.codon))
                                    o.aa = aa;
                                }

                                if (cdsIndex != null && cdsIndex.length > 0) {
                                    let start = cdsIndex[0].index;
                                    let stops = []
                                    for (let c = 0; c < cdsIndex.length; c++) {
                                        let obj = cdsIndex[c]
                                        let aa = codon(obj.codon);
                                        if (aa === 'STOP') {
                                            stops.push(obj.index)
                                        }
                                    }
                                    if (stops.length > 0) {

                                        selectedTrack.add(new NMDAnnotation('NMD', 'NMD', start, stops))
                                    }
                                }
                                selectedTrack.orf = { 'sequence': seq, 'cdsi': cdsIndex };
                            } else {

                                sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                                for (let a of sorted_annotations) {
                                    if (a.type === "Exon" && a != menuA) {
                                        let ai = a.xi;
                                        let af = a.xf;

                                        if (startIndex >= a.xi && startIndex <= a.xf) {
                                            af = startIndex - 1;
                                            cds_i = true;
                                        }
                                        if (endIndex >= a.xi && endIndex <= a.xf) {
                                            ai = endIndex - 1;
                                            let tt = selectedTrack.sequence.substring(Math.floor(ai - selectedTrack.xi), Math.floor(af - selectedTrack.xi) + 1);
                                            for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                                                codon_value += tt[gene_index]
                                                cdsIndex.push({
                                                    'codon_index': codon_i,
                                                    'ci': codon_ii,
                                                    'index': gene_index + ai,
                                                    'codon': codon_value
                                                })
                                                codon_ii++;
                                                if (base_i % 3 === 0) {
                                                    for (let ci of cdsIndex) {
                                                        if (ci.codon_index === codon_i) {
                                                            ci.codon = codon_value
                                                            let aa = codon(codon_value);
                                                            if (aa === 'STOP') {

                                                            }

                                                        }
                                                    }
                                                    codon_ii = 0;
                                                    codon_i++;
                                                    codon_value = ''
                                                }
                                                base_i++;
                                            }
                                            seq += tt;
                                            cds_i = false
                                        }
                                        if (cds_i) {
                                            let tt = selectedTrack.sequence.substring(Math.floor(ai - selectedTrack.xi), Math.floor(af - selectedTrack.xi) + 1);
                                            for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {

                                                codon_value += tt[gene_index]
                                                cdsIndex.push({
                                                    'codon_index': codon_i,
                                                    'ci': codon_ii,
                                                    'index': gene_index + ai,
                                                    'codon': codon_value
                                                })

                                                codon_ii++;
                                                if (base_i % 3 === 0) {
                                                    for (let ci of cdsIndex) {
                                                        if (ci.codon_index === codon_i) {
                                                            ci.codon = codon_value
                                                            let aa = codon(codon_value);
                                                            if (aa === 'STOP') {

                                                            }
                                                        }
                                                    }
                                                    codon_i++;
                                                    codon_ii = 0;
                                                    codon_value = ''
                                                }
                                                base_i++;
                                            }
                                            seq += tt;
                                        }
                                    }
                                }
                                for (let o of cdsIndex) {
                                    let aa = codon((o.codon))
                                    o.aa = aa;
                                }

                                if (cdsIndex != null && cdsIndex.length > 0) {
                                    let start = cdsIndex[0].index;
                                    let stops = []
                                    for (let c = 0; c < cdsIndex.length; c++) {
                                        let obj = cdsIndex[c]
                                        let aa = codon(obj.codon);
                                        if (aa === 'STOP') {
                                            stops.push(obj.index)
                                        }
                                    }
                                    console.log(' stops ' + stops)
                                    if (stops.length > 0) {
                                        console.log(' adding nmd object ')
                                        selectedTrack.add(new NMDAnnotation('NMD', 'NMD', start, stops))
                                    }
                                }
                                selectedTrack.orf = { 'sequence': seq, 'cdsi': cdsIndex };
                            }

                        },
                        move: () => {
                            log('')
                        }
                    })
                }
            }
        }

        if (selectedTrack)
            graph.showMenu(menuList, x, y)

    })

}
