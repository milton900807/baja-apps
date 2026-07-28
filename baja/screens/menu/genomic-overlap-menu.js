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
        menuList.push(

            {
                label: 'miRNA',
                click: async (xwc, ywc) => {
                    let Annotation = await exec('flexigraph/annotation.js')

                    if (!selectedTrack.transdcriptID) {
                        selectedTrack.transdcriptID = selectedTrack.name;
                    }
                    let r = await GETJSON(`https://rest.ensembl.org/overlap/id/${selectedTrack.transdcriptID}?content-type=application/json;feature=gene`)
                    let lncSet = []
                    for (let item of r) {
                        if (item.biotype === 'miRNA') {
                            lncSet.push(item)
                        }
                    }
                    for (let l of lncSet) {

                        selectedTrack.add(new Annotation(l.biotype, l.external_name + ': ' + l.description, l.start, l.end, l.strand))
                    }
                    graph.setMessage("Annotations complete.")

                },
                move: () => {
                    log('movei running offtargets....')
                }
            })

        menuList.push(

            {
                label: 'snRNA',
                click: async (xwc, ywc) => {
                    let Annotation = await exec('flexigraph/annotation.js')

                    if (!selectedTrack.transdcriptID) {
                        selectedTrack.transdcriptID = selectedTrack.name;
                    }
                    let r = await GETJSON(`https://rest.ensembl.org/overlap/id/${selectedTrack.transdcriptID}?content-type=application/json;feature=gene`)
                    let lncSet = []
                    for (let item of r) {
                        if (item.biotype === 'snRNA') {
                            lncSet.push(item)
                        }
                    }
                    for (let l of lncSet) {
                        selectedTrack.add(new Annotation(l.biotype, l.external_name + ': ' + l.description, l.start, l.end, l.strand))
                    }
                    graph.setMessage(lncSet.length + " snRNA loaded.")
                },
                move: () => {
                    log('movei running offtargets....')
                }
            })

        menuList.push(

            {
                label: 'Pseudogenes',
                click: async (xwc, ywc) => {
                    let Annotation = await exec('flexigraph/annotation.js')

                    if (!selectedTrack.transdcriptID) {
                        selectedTrack.transdcriptID = selectedTrack.name;
                    }
                    let r = await GETJSON(`https://rest.ensembl.org/overlap/id/${selectedTrack.transdcriptID}?content-type=application/json;feature=gene`)
                    let lncSet = []
                    for (let item of r) {
                        if (item.biotype === 'processed_pseudogene') {
                            lncSet.push(item)
                        }
                    }
                    for (let l of lncSet) {

                        selectedTrack.add(new Annotation(l.biotype, l.external_name + ': ' + l.description, l.start, l.end, l.strand))
                    }
                    graph.setMessage("Annotations complete.")

                },
                move: () => {
                    log('movei running offtargets....')
                }
            })

        menuList.push({
            label: 'lncRNA',
            click: async (xwc, ywc) => {
                let Annotation = await exec('flexigraph/annotation.js')

                let xi = selectedTrack.xi;
                let xf = selectedTrack.xf;
                if (!selectedTrack.transdcriptID) {
                    selectedTrack.transdcriptID = selectedTrack.name;
                }
                let r = await GETJSON(`https://rest.ensembl.org/overlap/id/${selectedTrack.transdcriptID}?content-type=application/json;feature=gene`)
                let lncSet = []
                for (let item of r) {
                    if (item.biotype === 'lncRNA') {
                        lncSet.push(item)
                    }
                }
                for (let l of lncSet) {

                    selectedTrack.add(new Annotation(l.biotype, l.description, l.start, l.end, l.strand))
                }

                graph.setMessage("Annotations complete.")

                if (!seq) {
                    prompt(" No sequence found; cannot apply an oligo ")
                } else {
                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        })
        menuList.push({
            label: 'Protein Coding',
            click: async (xwc, ywc) => {
                let Annotation = await exec('flexigraph/annotation.js')

                let xi = selectedTrack.xi;
                let xf = selectedTrack.xf;
                if (!selectedTrack.transdcriptID) {
                    selectedTrack.transdcriptID = selectedTrack.name;
                }
                let r = await GETJSON(`https://rest.ensembl.org/overlap/id/${selectedTrack.transdcriptID}?content-type=application/json;feature=gene`)
                let lncSet = []
                for (let item of r) {
                    if (item.biotype === 'protein_coding') {
                        lncSet.push(item)
                    }
                }
                for (let l of lncSet) {

                    if (l.start === selectedTrack.xi && l.xf === selectedTrack.end) { }
                    else
                        selectedTrack.add(new Annotation(l.biotype, l.description, l.start, l.end, l.strand))
                }

                graph.setMessage("Protein Coding complete.")

                if (!seq) {
                    prompt(" No sequence found; cannot apply an oligo ")
                } else {
                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        })

        menuList.push({
            label: 'Remove annotations...',
            click: async (xwc, ywc) => {
                selectedTrack.annotations = []
            },
            move: () => {
                log('movei running offtargets....')
            }
        })

        if (selectedTrack)
            graph.showMenu(menuList, x, y)

    });
}
