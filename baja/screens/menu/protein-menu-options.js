function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let default_mouse_manager = () => {

            CurrentLayout.clearComponent('labelPanel')
            CurrentLayout.setComponent('labelPanel', {
                wid: 'html',
                'data': '<font color="blue"> Click on a track to see menu options...</font>'
            });

            const nameHook = createIonFunction((editor) => {
                ed = editor;
            })
            let start = -1;
            let end = -1;
            let highlight = false;
            let highlight_label = 'Highlight'
            let selectedTrack = null;

            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.addMouseMoveListener((x, y) => {
                graph.selectOff();
                if (!graph.menuVisible()) {
                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let cselectedTrack = graph.track[trackIndex]
                        selectedTrack = cselectedTrack;
                        if (selectedTrack)
                            selectedTrack.showResizeBar = true;
                    }
                }
            })

            graph.addMouseDownListener((x, y) => {
                let trackIndex = graph.getTrack(x, y);
                if (trackIndex >= 0) {
                    selectedTrack = graph.track[trackIndex]
                }
                ywc = y;
                if (highlight && selectedTrack) {
                    if (start < 0) {
                        let xsc = graph.X(x);
                        selectedTrack.tgraph.rescale();
                        console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                        let t = selectedTrack.tgraph.xi;
                        start = selectedTrack.tgraph.Xwc(x - t * 2);
                        selectedTrack.markstart = start;
                    }
                    else if (start > 0 && end < 0) {
                        let t = selectedTrack.tgraph.xi;
                        end = selectedTrack.tgraph.Xwc(x - t * 2);
                        selectedTrack.markend = end;
                    }
                    highlight_label = 'Clear highlight'

                } else {
                    highlight_label = 'Highlight'
                }

                let menuList = [
                    {
                        label: 'Generate ORF',
                        click: async (xwc, ywc) => {
                            if (selectedTrack) {
                                graph.setMessage(" Generating open reading frame.")
                                let orf = selectedTrack.generateORF();

                            } else {
                                graph.setMessage(" No track selected. ")
                            }
                        },
                        move: () => {
                        }
                    },
                    {
                        label: 'Remove protein domains',
                        click: async (xwc, ywc) => {
                            if (selectedTrack) {

                            } else {
                            }
                        },
                        move: () => {
                        }
                    },
                    {
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

                            proteinSeq = proteinSeq.toString();

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

                            let processDomains = (value) => {

                                if (!value) {
                                    return;
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
                                    annotation.labelY = Math.random() + 2;
                                    selectedTrack.add(annotation)
                                }
                                graph.setMessage(" " + _d.length + " Protein domains added ")
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
                            }

                            const chunkSize = 10000000;
                            let chunks = [];
                            for (let i = 0; i < proteinSeq.length; i += chunkSize) {
                                chunks.push(proteinSeq.substring(i, i + chunkSize));
                            }

                            async function processAllChunks(chunks) {
                                let allDomains = [];
                                for (let chunk of chunks) {
                                    try {
                                        let result = await exec(`py/cdd/test.py`, chunk, 21);
                                        if (result != null && result['file'] != null) {
                                            let domains = await processDomains(result);
                                            allDomains = allDomains.concat(domains);
                                        }
                                    } catch (error) {
                                        console.error(`Error processing chunk: ${error}`);
                                    }
                                }
                                return allDomains;
                            }

                            console.log(" Process... " + chunks.length)
                            let domains = await processAllChunks(chunks)
                            for (let d of domains) {
                                processDomains(d);
                            }

                        },
                        move: () => {
                            log('')
                        }
                    },
                    {
                        label: 'Download DNA ORF sequence',
                        click: async (xwc, ywc) => {
                            if (selectedTrack) {
                                if (selectedTrack.orf && selectedTrack.orf.sequence) {
                                    let sequence = selectedTrack.orf.sequence;
                                    downloadAsText(sequence, "ORF-sequence.txt")
                                }
                                else {
                                    graph.setMessage(" Peptide sequence is not generated on this track.")
                                }
                            }
                        },
                        move: () => {
                        }
                    },

                    {
                        label: 'Download Peptide sequence',
                        click: async (xwc, ywc) => {
                            if (selectedTrack) {
                                if (selectedTrack.orf && selectedTrack.orf.sequence) {
                                    let p = '';
                                    for (let oor of selectedTrack.orf.cdsi) {
                                        if (oor.ci === 1) {
                                            if (oor.aa != "STOP")
                                                p += oor.aa;
                                        }
                                    }
                                    downloadAsText(p, "peptide-sequence.txt")
                                }
                                else {
                                    graph.setMessage(" Peptide sequence is not generated on this track.")
                                }
                            }
                        },
                        move: () => {
                        }
                    },
                ]
                graph.showMenu(menuList, x, y, 200)

            });
        }

        default_mouse_manager();

        let Annotation = await exec('flexigraph/annotation.js')

        let codon = await exec('baja/bio/aa/codons.js')
        let generateORF = (selectedTrack, skip) => {
            let orf = null;
            let seq = ''
            let sorted_annotations = selectedTrack.annotations;
            if (selectedTrack.strand > 0)
                sorted_annotations.sort(function (a, b) { return parseFloat(a.xi) - parseFloat(b.xi) });
            else
                sorted_annotations.sort(function (a, b) { return parseFloat(b.xi) - parseFloat(a.xi) });
            let startIndex = -1;
            let endIndex = -1;
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

            console.log('debubg');
            let cdsIndex = []
            let codon_i = 0;
            let codon_ii = 0;
            let base_i = 1;
            let codon_value = ''
            let cds_i = false;
            if (selectedTrack.strand > 0) {
                for (let a of sorted_annotations) {
                    if (a.type === "Exon" && a.name != skip.name) {
                        let ai = a.xi;
                        let af = a.xf;

                        if (startIndex >= a.xi && startIndex < a.xf) {
                            ai = startIndex;
                            cds_i = true;
                        }
                        if (endIndex >= a.xi && endIndex < a.xf) {
                            af = endIndex;
                            let tt = selectedTrack.sequence.substring(Math.floor(ai - selectedTrack.xi),
                                Math.floor(af - selectedTrack.xi) + 1);
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
                orf = { 'sequence': seq, 'cdsi': cdsIndex };

            } else {
                for (let a of sorted_annotations) {

                    if (a.type === "Exon" && a.name != skip.name) {
                        let ai = a.xi;
                        let af = a.xf;
                        graph.setMessage(a.name);
                        if (startIndex > a.xi && startIndex <= a.xf) {
                            af = startIndex - 1;
                            cds_i = true;
                        }
                        if (endIndex > a.xi && endIndex <= a.xf) {
                            ai = endIndex;
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
                                                this.add(new Annotation('STOP', 'STOP', ci.index, ci.index + 3))
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
                orf = { 'sequence': seq, 'cdsi': cdsIndex };

            }
            let expell = []
            for (let a of selectedTrack.annotations) {
                if (a.type === 'STOP') {
                    let afound = false;
                    let exons = selectedTrack.getExons();
                    for (let e of exons) {
                        if (e.xi <= a.xi && e.xf > a.xf) {
                            afound = true;
                        }
                    }
                    if (!afound) {
                        expell.push(a)
                    }
                }
            }
            return orf;
        }

        let panel = null;
        let __nameHook = createIonFunction((name) => {
            panel = name;
        })
        let bpanel = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    title: '  ',
                                    style: 'sub-container',
                                    menus: [
                                        {
                                            'label': 'Open reading frame (ORF)', 'items': [
                                                {
                                                    'label': 'Track options', 'ionfunction': createIonFunction(async () => {
                                                        default_mouse_manager();
                                                    })
                                                },

                                            ]

                                        },
                                        {
                                            'label': 'Alternative ORFs', 'items': [
                                                {
                                                    'label': 'Visualize PTCs on exons', 'ionfunction': createIonFunction(async () => {
                                                        exon_skip_vis()

                                                        CurrentLayout.clearComponent('labelPanel')
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            'data': '<font color="blue"> Click on an exon to see menu options...</font>'
                                                        });

                                                    })
                                                },

                                            ]
                                        }
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

        let exon_skip_vis = async () => {
            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.selectOff();
            let ed;
            const nameHook = createIonFunction((editor) => {
                ed = editor;
            })
            let start = -1;
            let end = -1;
            let highlight = false;
            let highlight_label = 'Highlight'
            let selectedTrack = null;

            graph.addMouseMoveListener((x, y) => {
                graph.selectOff();
                if (!graph.menuVisible()) {
                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let cselectedTrack = graph.track[trackIndex]
                        selectedTrack = cselectedTrack;
                        if (selectedTrack)
                            selectedTrack.showResizeBar = true;
                    }
                }
            })

            graph.addMouseDownListener((x, y) => {
                let trackIndex = graph.getTrack(x, y);
                if (trackIndex >= 0) {
                    selectedTrack = graph.track[trackIndex]
                }
                ywc = y;
                if (highlight && selectedTrack) {
                    if (start < 0) {
                        let xsc = graph.X(x);
                        selectedTrack.tgraph.rescale();
                        console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                        let t = selectedTrack.tgraph.xi;
                        start = selectedTrack.tgraph.Xwc(x - t * 2);
                        selectedTrack.markstart = start;
                    }
                    else if (start > 0 && end < 0) {
                        let t = selectedTrack.tgraph.xi;
                        end = selectedTrack.tgraph.Xwc(x - t * 2);
                        selectedTrack.markend = end;
                    }
                    highlight_label = 'Clear highlight'

                } else {
                    highlight_label = 'Highlight'
                }

                let menuList = [
                    {
                        label: 'Show skip for all exons',
                        click: async (xwc, ywc) => {
                            if (selectedTrack) {
                                graph.setMessage(" Generating open reading frame.")
                                selectedTrack.generateORF();
                                let TrackLayer = await exec('baja/bio/track-layer.js')
                                let Annotation = await exec('flexigraph/annotation.js')
                                console.log('debubg');
                                let exons = selectedTrack.getExons();
                                let index = 1;
                                for (let exon of exons) {
                                    let layer = new TrackLayer(`Skip ${exon.name}`, selectedTrack.tgraph.xmin, selectedTrack.tgraph.ymin, selectedTrack.tgraph.xmax, selectedTrack.tgraph.ymax)
                                    layer.color = `hsl(${360 * index / exons.length}, 100%, 50%)`;
                                    index += 2;
                                    let orf = generateORF(selectedTrack, exon)
                                    for (let o of orf.cdsi) {
                                        if (o.aa == 'STOP') {
                                            let an = new Annotation('STOP', `${exon.name}_STOP`, o.index, o.index + 3);

                                            an.y = 0.3;
                                            layer.addAnnotation(an)
                                        }
                                    }
                                    selectedTrack.addLayer(layer)
                                    graph.setMessage("Track layer " + layer.name + " added. ")
                                }

                            } else {
                                graph.setMessage(" No track selected. ")
                            }
                        },
                        move: () => {
                        }
                    },
                    {
                        label: 'Remove all Exon-Skip layers',
                        click: async (xwc, ywc) => {
                            if (selectedTrack) {

                                selectedTrack.removeTracksLayersWhereNameStartsWith ('Skip')

                            } else {
                                graph.setMessage(" No track selected. ")
                            }
                        },
                        move: () => {
                        }
                    },

                ]

                let annotation = []
                let aannotation = selectedTrack.getAnnotationX((selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2)))
                if (aannotation && aannotation.length > 0) {
                    let name = ''
                    for (let an of aannotation) {
                        if (an.type === 'Exon') {
                            name += an.name + ' ';
                            annotation.push(an);
                        }

                    }
                    graph.setMessage(name)
                }

                if (annotation != null && annotation.length > 0) {
                    for (let a of annotation) {

                        let exonLength = Math.floor(a.xf - a.xi) + 1;
                        graph.setMessage(" Exon length " + (exonLength / 3))
                        if (exonLength % 3 !== 0) {
                            menuList.push({
                                label: `Show ${a.name} skip `,
                                click: async (xwc, ywc) => {
                                    if (selectedTrack) {

                                        selectedTrack.generateORF();
                                        let TrackLayer = await exec('baja/bio/track-layer.js')
                                        let Annotation = await exec('flexigraph/annotation.js')
                                        let index = 1;
                                        let exon = a;
                                        let layer = new TrackLayer(`Skip ${exon.name}`, selectedTrack.tgraph.xmin, selectedTrack.tgraph.ymin, selectedTrack.tgraph.xmax, selectedTrack.tgraph.ymax)
                                        layer.color = `hsl(${360 * index / 10}, 100%, 50%)`;
                                        index += 2;
                                        let orf = generateORF(selectedTrack, exon)
                                        console.log('debubg');
                                        for (let o of orf.cdsi) {
                                            if (o.aa == 'STOP') {
                                                let an = new Annotation('STOP', `${exon.name}_STOP`, o.index, o.index + 3);

                                                an.y = 0.3;
                                                layer.addAnnotation(an)
                                            }
                                        }
                                        selectedTrack.addLayer(layer)
                                        graph.setMessage("Track layer " + layer.name + " added. ")

                                    } else {
                                        graph.setMessage(" No track selected. ")
                                    }

                                },
                                move: () => {
                                    log('')
                                }

                            })
                        } else {

                            menuList.push({
                                label: ` ${a.name} is in frame `,
                                click: async (xwc, ywc) => {
                                    if (selectedTrack) {
                                        graph.setMessage(" This exon is in frame.")
                                    } else {
                                        graph.setMessage(" No track selected. ")
                                    }
                                },
                                move: () => {
                                    log('')
                                }

                            })

                        }
                        menuList.push({
                            label: 'Delete ' + a.name,
                            click: async (xwc, ywc) => {
                                selectedTrack.removeAnnotation(a);
                                selectedTrack.generateORF();
                            },
                            move: () => {
                                log('')
                            }
                        })
                        menuList.push({
                            label: 'Move ' + a.name,
                            click: async (xwc, ywc) => {
                                exec('baja/screens/menu/annotation/move-exon.js', selectedTrack, a, graph, genegraph_panel_layout)
                                graph.hideMenu();
                                selectedTrack.generateORF();

                            },
                            move: () => {
                                log('')
                            }
                        })
                        menuList.push({
                            label: 'Resize ' + a.name,
                            click: async (xwc, ywc) => {
                                exec('baja/screens/menu/annotation/resize-exon.js', selectedTrack, a, graph, genegraph_panel_layout)
                                selectedTrack.generateORF();

                                graph.hideMenu();
                            },
                            move: () => {
                                log('')
                            }
                        })

                        menuList.push({
                            label: 'Edit ' + a.name,
                            click: async (xwc, ywc) => {

                                let panel;
                                let _panel = createIonFunction((_p) => {
                                    panel = _p;
                                })
                                let input = {
                                    wid: 'card',
                                    componentRef: 'bottomPanel',
                                    data: {
                                        height: '800px',
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component':
                                                    {
                                                        wid: 'html',
                                                        data: `<h1> Edit annotation type </h1> `
                                                    }
                                                },

                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component':
                                                    {
                                                        wid: 'json',
                                                        refCallback: _panel,
                                                        data: JSON.stringify(a)
                                                    }
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                    })
                                                                },
                                                                {
                                                                    label: 'OK', ionFunction: createIonFunction(() => {

                                                                        console.log('debubg');
                                                                        if (panel) {
                                                                            try {
                                                                                let v = panel.data;
                                                                                let jv = JSON.parse(v);
                                                                                selectedTrack.annotations.map(obj => obj.name === a.name ? jv : obj);
                                                                                selectedTrack.generateORF();

                                                                            } catch (exception) {
                                                                                prompt('Failed to parse the object ')
                                                                            }
                                                                        }
                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', input);

                            },
                            move: () => {
                                log('')
                            }
                        })
                    }
                }

                graph.showMenu(menuList, x, y, 340)

            })

        }

    })

}
