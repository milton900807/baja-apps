function (graph) {

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

        let msnp = "Show"
        if (selectedTrack.showSnpIndels) {
            msnp = "Hide"
        }

        menuList.push({
            label: `${msnp} snps`,
            click: async (x, y) => {

                if (msnp === 'Show') {

                    let gwcxs = graph.Xwc(0);
                    if (!gwcxs)
                        return;
                    let gwcxf = graph.Xwc(0 + graph.graph.grid.width);
                    if (!gwcxf)
                        return;
                    let twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi);
                    let twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi);
                    let snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
                    let highlightmethod = (ctx, graph) => {
                        for (let s of snpsv) {
                            ctx.strokeStyle = 'red';
                            ctx.lineWidth = 9;

                            let x = graph.X(selectedTrack.tgraph.X(s.xi))
                            let y = graph.Y(selectedTrack.tgraph.Y(s.y))
                            let w = 10;
                            let h = 10;

                            var kappa = .5522848,
                                ox = (w / 2) * kappa,
                                oy = (h / 2) * kappa,
                                xe = x + w,
                                ye = y + h,
                                xm = x + w / 2,
                                ym = y + h / 2;

                            ctx.beginPath();
                            ctx.moveTo(x, ym);
                            ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                            ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                            ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                            ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                            ctx.stroke();
                        }

                    }

                    graph.highlightmethod = highlightmethod;
                    setTimeout(() => {

                        graph.highlightmethod = null;
                    }, 10000)

                } else {
                    selectedTrack.showSnpIndels = false;
                }

            },
            move: () => {
                log('movei running offtargets....')
            }
        })

        let mlabel = 'Show'
        let vis = selectedTrack.getExonCountVisible();
        if (vis) {
            mlabel = 'Hide'
        }

        menuList.push({
            label: `${mlabel} Exon Counts`,
            click: async (x, y) => {
                if (selectedTrack && selectedTrack.getExonCountVisible()) {
                    selectedTrack.hideExonIndicies();
                } else {
                    selectedTrack.showExonIndicies();

                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        })

        menuList.push({
            label: `Show/Hide reference annotations`,
            click: async (x, y) => {
                selectedTrack.toggleAnnotations();
            },
            move: () => {
                log('movei running offtargets....')
            }
        })

        menuList.push({
            label: 'Show deprecated compounds',
            click: async (x, y) => {
            },
            move: () => {
                log('movei running offtargets....')
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
        })

        if (selectedTrack)
            graph.showMenu(menuList, x, y)

    });

}
