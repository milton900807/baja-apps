function (graph, io) {

    exec('baja/bio/track-layer.js').then(async TrackLayer => {

        let index = 0;

        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        let ed;
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

            let getSvgUrl = (svg) => {
                return URL.createObjectURL(new Blob([svg], {
                  type: 'image/svg+xml'
                }));
              }

            menuList.push({
                label: 'add eCLIP layer',
                click: async (xwc, ywc) => {
                    selectedTrack.removeTrackLayers();
                    let t = new TrackLayer('test', 0, 0, 1, 1);
                    let chromosome = selectedTrack.chr;
                    let xi = selectedTrack.xi;
                    let xf = selectedTrack.xf;
                    let res = await exec( window['env']['apiUrl'] + '/py/tracks/testobj.py', `${chromosome}:${xi}-${xf}`, `${chromosome}:${xi}-${xf}`);
                    if (res != null && res['svg'] != null) {
                        let parser = new DOMParser();
                        let xmlDoc = parser.parseFromString(res['svg'], "text/xml");
                        let svgObject = xmlDoc.childNodes[1]
                        t.addSVG ( svgObject )

                        selectedTrack.addLayer(t)
                        index++;
                        if (index > 2) {
                            index = 0;
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
    })

}
