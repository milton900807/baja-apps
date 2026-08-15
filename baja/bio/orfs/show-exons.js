function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.setMouseMode('navigate')

    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let selectedTrack = null;
    exec('baja/bio/aa/codons.js').then(codon => {
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        let generateCodons = async (selectedTrack) => {
            let NMDAnnotation = await exec('baja/bio/splicing/nmd-annotation.js')
            let Annotation = await exec('flexigraph/annotation.js')
            let startIndex = -1;
            let endIndex = -1;
            let cds_i = false;
            let seq = '';
            let cdsIndex = []
            let codon_i = 0;
            let codon_ii = 0;
            let base_i = 1;
            let codon_value = ''
            let sorted_annotations = selectedTrack.annotations;

            for (let an of sorted_annotations) {
                if (an.type.toLowerCase() === 'translation') {
                    startIndex = an.xi;
                    endIndex = an.xf;
                }
            }

            if (sorted_annotations && sorted_annotations.length) {
                if (selectedTrack.strand > 0)
                    sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                else
                    sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
                if (selectedTrack.strand > 0) {
                    for (let a of sorted_annotations) {
                        if (a.type === "Exon") {
                            let ai = a.xi;
                            let af = a.xf;
                            if (startIndex >= a.xi && startIndex < a.xf) {
                                ai = startIndex - 1;
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
                        if (a.type === "Exon") {
                            let ai = a.xi;
                            let af = a.xf;

                            if (startIndex >= a.xi && startIndex < a.xf) {
                                af = startIndex - 1;
                                cds_i = true;
                            }
                            if (endIndex >= a.xi && endIndex < a.xf) {
                                ai = endIndex - 1;
                                let tt = selectedTrack.sequence.substring(Math.floor(ai - selectedTrack.xi), Math.floor(af - selectedTrack.xi) + 1);
                                for (let gene_index = tt.length - 1; gene_index >= 0; gene_index--) {
                                    codon_value += tt[gene_index]
                                    cdsIndex.push({
                                        'codon_index': codon_i,
                                        'ci': codon_ii,
                                        'index': gene_index + ai,
                                        'codon': codon_value,
                                        'name': a.name
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
                                        'codon': codon_value,
                                        'name': a.name
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
            }
            return cdsIndex;

        }

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
            let menuList = []
            let editor;
            let typeAhead;
            let type_ahead = createIonFunction((ref) => {
                typeAhead = ref;
            })

            let cb3 = createIonFunction((ref) => {
                editor = ref;
            })
            menuList.push(

                {
                label: 'Show in-frame exons',
                click: async (xwc, ywc) => {

                    let c = await generateCodons(selectedTrack);
                    let prev_g = -1
                    let index = 0;
                    let frameshift = []
                    for (let i of c) {

                        if (index === 0)
                            prev_g = i.index;
                        else {
                            if (i.ci > 0 && Math.abs(prev_g - i.index) > 3) {
                                frameshift.push(i.name)
                            }
                        }
                        index++;
                        prev_g = i.index;
                    }
                    let sorted_annotations = selectedTrack.annotations;
                    let non_frameshift_exons = []
                    if (selectedTrack.strand > 0)
                        sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                    else
                        sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });

                    for (let a of sorted_annotations) {
                        if (a.type === "Exon") {
                            let found = false;
                            for (let f of frameshift) {
                                if (a.name === f) {
                                    found = true;
                                }
                            }
                            if (!found) {
                                non_frameshift_exons.push(a.name);
                            }
                        }
                    }

                    showModal({
                        wid: 'json',
                        data: JSON.stringify(non_frameshift_exons)
                    })

                },
                move: () => {
                    log('')
                }
            })
            menuList.push(

                {
                label: 'Show frame-shift exons',
                click: async (xwc, ywc) => {

                    let c = await generateCodons(selectedTrack);
                    let prev_g = -1
                    let index = 0;
                    let frameshift = []
                    for (let i of c) {

                        if (index === 0)
                            prev_g = i.index;
                        else {
                            if (i.ci > 0 && Math.abs(prev_g - i.index) > 3) {
                                frameshift.push(i.name)
                            }
                        }
                        index++;
                        prev_g = i.index;
                    }
                    let sorted_annotations = selectedTrack.annotations;
                    let non_frameshift_exons = []
                    if (selectedTrack.strand > 0)
                        sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
                    else
                        sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });

                    for (let a of sorted_annotations) {
                        if (a.type === "Exon") {
                            let found = false;
                            for (let f of frameshift) {
                                if (a.name === f) {
                                    found = true;
                                }
                            }
                            if (!found) {
                                non_frameshift_exons.push(a.name);
                            }
                        }
                    }

                    showModal({
                        wid: 'json',
                        data: JSON.stringify(frameshift)
                    })

                },
                move: () => {
                    log('')
                }
            })

            if (selectedTrack)
                graph.showMenu(menuList, x, y)

        })

    })

}
