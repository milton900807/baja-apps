function (graph) {

    return new Promise(async (resolve, reject) => {

    let shapes = await exec('flexigraph/gene-draw.js')

    let MGrid = await exec('flexigraph/grid.js')
    let grid = Object.assign(new MGrid(), graph.graph.grid)
    grid.xmax = selectedTrack.tgraph.X(end + 10);
    grid.xmin = selectedTrack.tgraph.X(start - 10);
    grid.ymax = selectedTrack.tgraph.yi + Math.abs(selectedTrack.tgraph.height) / 6;
    grid.ymin = selectedTrack.tgraph.yi - Math.abs(selectedTrack.tgraph.height - 0.5);
    grid.rescale();

    alert("Hello");
console.log("!!!!!!!!!!!!!!!!!!!!!!!");

let pointsIndex = [];

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
                                 console.log ( " startIndex " + startIndex + " endIndex " + endIndex )
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

let temp = [];
temp = selectedTrack.getExons ();
let sashimi = [];
for (var i=1; i<temp.length; i++) {

    let sc_af = graph.X(selectedTrack.tgraph.X(temp[i-1].xf))
    let sc_ai = graph.X(selectedTrack.tgraph.X(temp[i].xi))
    let sc_ay = graph.Y(selectedTrack.tgraph.Y(temp[i].y));

    graph.drawArch(sc_af, sc_ai, sc_ay, sc_ay);

    sashimi.push ([sc_af, sc_ai, sc_ay]);
}

graph.drawArch(240, 440, 130, 130, grid);

console.table (sashimi);

})

resolve()
    })

}
