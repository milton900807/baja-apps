function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let Line = await exec('flexigraph/shapes/line.js')
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        const nameHook = createIonFunction((editor) => {
            ed = editor;
        })
        function findCharSetIndices(str, lcharSet, rchar, startPoint) {
            if (startPoint < 0 || startPoint >= str.length) {
                throw new Error('Start point is outside the string range.');
            }

            let leftIndex = -1, rightIndex = -1;

            for (let i = startPoint; i >= 0; i--) {
                if (lcharSet.includes(str[i])) {
                    leftIndex = i;
                    break;
                }
            }

            for (let i = startPoint; i < str.length; i++) {
                if (rchar.includes(str[i])) {
                    rightIndex = i;
                    break;
                }
            }

            return { leftIndex, rightIndex };
        }

        let start = -1;
        let end = -1;
        let ywc = -1;
        let selectedTrack = null;
        graph.addMouseMoveListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }
            graph.deselectAllTracks();

            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                if (graph.track[p_trackIndex] != null) {
                    selectedTrack = graph.track[p_trackIndex]
                    selectedTrack.select();
                }

                if (selectedTrack && graph.currentShape) {

                }
                else if (selectedTrack) {
                    let xt = Math.floor(selectedTrack.tgraph.Xwc(x) - selectedTrack.xi)
                    let xti = 0;
                    let xtf = 0;
                    if (selectedTrack.strand > 0) {
                        let v = findCharSetIndices(selectedTrack.sequence, 'GT', "AG", xt)
                        xti = v['leftIndex']
                        xtf = v['rightIndex']
                    } else {
                        let v = findCharSetIndices(selectedTrack.sequence, 'GA', "TG", xt)
                        xtf = v['leftIndex']
                        xti = v['rightIndex']
                    }
                    if (!graph.currentShape)
                        graph.currentShape = new Line('test', selectedTrack.tgraph.X(xti), selectedTrack.tgraph.Y(0));
                    else {
                        graph.currentShape.xf = selectedTrack.tgraph.X(xtf);
                        graph.currentShape.xi = selectedTrack.tgraph.X(xti);
                    }
                }

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
                                let fiveprime = i.seq;
                                let values = rnaSplice.findDonorSpliceSites(fiveprime, selectedTrack.strand)
                                let splice = values;
                                for (let sp of splice) {
                                    await sleep(50);
                                    let tr = new Annotation("Donor-Splice-Site", 'ss' + sp.site, i.xi + sp.position,
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
            menuList.push({
                label: 'Intron acceptor sites',
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

            if (selectedTrack)
                graph.showMenu(menuList, x, y)

        })

        resolve();
    })

}
