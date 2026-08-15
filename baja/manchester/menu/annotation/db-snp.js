function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Click on a track to see options... ")
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
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
        console.log(' selected track ' + trackIndex);
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
            label: 'Fetch snps for visible region',
            click: async (xwc, ywc) => {

                let Annotation = await exec('flexigraph/annotation.js')
                let SnpIndel = await exec('flexigraph/snpindel.js')

                let seq = selectedTrack.sequence;
                if (!seq) {
                    prompt(" No sequence found; cannot apply an oligo ")
                } else {

                    if (selectedTrack) {
                        let name = selectedTrack.name;

                        if (name.startsWith('ENS')) {

                            let url = `https://rest.ensembl.org/lookup/id/${name.trim()}?content-type=application/json;expand=1`
                            console.log(' url ' + url)
                            let res = await GETJSON(url);

                            if (res) {
                                let region = res.seq_region_name
                                let range = selectedTrack.gitVisibleTrackRange(graph);
                                console.log(' start ' + range.start);
                                console.log(' end ' + range.end);

                                let js = { "variantSetId": 1, "callSetIds": ["1:NA19777", "1:HG01242", "1:HG01142"], "referenceName": region, "start": range.start, "end": range.end, "pageToken": "", "pageSize": 3 }

                                console.log('debubg');

                                showModal ( {
                                    wid:'json',
                                    data:JSON.stringify ( res )
                                })

                                url = `https://rest.ensembl.org/ga4gh/variants/search`
                                let snpres = await POSTJSON(js, url);
                                if (snpres.length > 10000) {
                                    graph.setMessage(" The results are too big... zoom in a bit")
                                    return;
                                } else {

                                    let count = 0;
                                    for (let i of snpres.variants) {
                                        let start = i.start;
                                        let end = i.end;
                                        let name = i.names[0];
                                        let ref = i.referenceBases;
                                        let alt = i.alternateBases;
                                        let variants = ref + '->';
                                        for (let a of alt) {
                                            variants += a + '|'
                                        }
                                        variants = variants.substring(0, variants.length - 1)

                                        selectedTrack.addsnpindel(new SnpIndel('snp', start + 1, ref, alt, 1, 1));

                                        count++;
                                    }
                                    graph.setMessage(" Added " + count + " snps to the track.")

                                }

                            }
                        }
                    }

                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        })

        menuList.push({
            label: 'Clear SNPs',
            click: async (xwc, ywc) => {
                let seq = selectedTrack.sequence;
                if (!seq) {
                    prompt(" No sequence found; cannot apply an oligo ")
                } else {

                    if (selectedTrack) {
                        selectedTrack.snpindels = [];
                    }

                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        })

        let bindingProteins = await exec('data/rna-binding-proteins.js')

        listItems = []
        itemMotifs = {}
        for (let rnb of bindingProteins) {
            if (!listItems.includes(rnb['name'])) {
                listItems.push(rnb['name'])

            }

            let tt = itemMotifs[rnb['name']]
            if (tt == null) {
                itemMotifs[rnb['name']] = {
                    "motif": [rnb['motif']]
                }
            } else {
                itemMotifs[rnb['name']]["motif"].push(rnb['motif'])
            }

        }

        menuList.push({

            label: 'Test',
            click: (xwc, ywc) => {
                let seq = selectedTrack.sequence;
                if (!seq) {
                    prompt(" No sequence found; cannot apply an oligo ")
                } else {

                    showModal({
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            refCallback: type_ahead,
                                            wid: 'type-ahead',
                                            data: {
                                                list: listItems,
                                                start: 1
                                            }
                                        }
                                    }
                                    ,
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Apply', ionFunction: createIonFunction(async () => {

                                                            let protein_name = typeAhead.getValue();

                                                            let motifs = itemMotifs[typeAhead.getValue()]['motif']
                                                            let Annotation = await exec('flexigraph/annotation.js')
                                                            let jsonlist = []

                                                            for (let i of motifs) {
                                                                if (i.trim() != null && i.trim().length > 0) {
                                                                    let motif = i.trim()
                                                                    let cellLine = 'NA'
                                                                    let jsonObject = {}
                                                                    jsonObject['motif'] = motif;
                                                                    jsonObject['name'] = protein_name
                                                                    jsonObject['cellLine'] = cellLine;
                                                                    jsonlist.push(jsonObject)

                                                                    let index = seq.indexOf(motif)
                                                                    console.log(' index of motif is   ' + motif + ' is ' + index)
                                                                    if (index > 0) {
                                                                        let tr = new Annotation('rna-binding', protein_name, selectedTrack.xi + index, selectedTrack.xi + index + motif.length, 1);
                                                                        selectedTrack.add(tr);
                                                                    }
                                                                }
                                                            }
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
                    })

                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        }
        )

        if (selectedTrack)
            graph.showMenu(menuList, x, y)

    });
}
