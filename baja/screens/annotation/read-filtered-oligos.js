function (graph, library, folder) {
    graph.setMessage('Select track to add off-target oligos.')

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let highlight = false;
    let highlight_label = 'Highlight'
    let selectedTrack = null;
    let resizeTrack = false;

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);

        if (trackIndex >= 0) {
            let cselectedTrack = graph.track[trackIndex]
            if (cselectedTrack && selectedTrack != cselectedTrack) {
                if (selectedTrack)
                    selectedTrack.showResizeBar = false;
            }
            selectedTrack = cselectedTrack;
            if (selectedTrack)
                selectedTrack.showResizeBar = true;
        } else {
            graph.selectOff();
            selectedTrack = null;
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

        let menuList = [];

        if (selectedTrack) {
            menuList.push(
                {
                    label: 'Add oligos',
                    click: async() => {
                        function showfolder () {
                            return new Promise(async (resolve, reject) => {

                                showModal({
                                    wid: 'folder-browser',
                                    width: '100%',
                                    data: {
                                        width: '80%',
                                        path: `/drives/${library.id}/items/${folder.id}`, 'ionfunction.path': createIonFunction(async (file) => {
                                            if (file['name'].toUpperCase().endsWith('.JSON')) {
                                                let db = await exec('baja/lib/db.js', library.id);
                                                let js = await db.loadJSONFile(library.id,file.id);
                                                resolve(js);
                                            }
                                        })
                                    }
                                })
                            })
                        }

                        showfolder().then( async (oligos) => {

                                let Biopolymer = await exec('baja/chem/biopolymer.js');
                                let Oligo = await exec('flexigraph/oligo.js');

                                hideAllModal();

                                if ( selectedTrack.oligos.length > 0 ) {

                                    for ( let o of oligos ) {

                                        let oindex = null;
                                        let start = 0;
                                        let tmp_offtarget = [];
                                        for (let j = 0; j < o.offtarget.length; j++) {
                                            tmp_offtarget.push(['GRCH38'].concat(o.offtarget[j]))
                                        }

                                        while ( oindex !== -1 ) {

                                            oindex = selectedTrack.oligos.map( (_o) => _o.synthesisSequence ).indexOf(o.synthesisSequence,start);

                                            if (oindex != -1) {
                                                selectedTrack.oligos[oindex].offtarget = tmp_offtarget;
                                            }
                                            start = oindex + 1;
                                        }
                                    }

                                    for (let i = selectedTrack.oligos.length - 1; i >= 0; i-- ) {
                                        if (!selectedTrack.oligos[i].offtarget) {
                                            selectedTrack.oligos.splice(i,1);
                                        }
                                    }

                                } else {
                                    for (let o of oligos) {
                                        let searchSequence = null;
                                        if ( o.synthesisSequence ) {
                                            if (selectedTrack.strand > 0) {

                                                searchSequence = o.synthesisSequence.split("").reverse().join("").replace(/[A,C,T,G,N]/gi, m => ({
                                                        'C': 'G',
                                                        'G': 'C',
                                                        'A': 'T',
                                                        'T': 'A',
                                                        'N': 'N',}[m]));
                                            } else {
                                                searchSequence = o.synthesisSequence.replace(/[A,C,T,G,N]/gi, m => ({
                                                        'C': 'G',
                                                        'G': 'C',
                                                        'A': 'T',
                                                        'T': 'A',
                                                        'N': 'N',}[m]));
                                            }
                                            let xi = selectedTrack.sequence.indexOf(searchSequence, start);
                                            let xf = xi + searchSequence.length;
                                            let yy = 0.15;

                                            let chem_template = 'moe()sp.moe()sp.moe()sp.moe()sp.moe()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.moe()sp.moe()sp.moe()sp.moe()sp.moe()';
                                            let structure = Biopolymer.applySequenceToTemplate(chem_template, o.synthesisSequence);

                                            let anno = new Oligo('gapmer', searchSequence, structure, selectedTrack.xi + xi, selectedTrack.xi + xf, yy);
                                            console.log(anno);
                                            console.log('debubg');
                                            let ytmp = 0.15;
                                            anno.synthesisSequence = o.synthesisSequence;
                                            anno.offtarget = o.offtarget;
                                            anno.ruleexp = o.ruleexp;
                                            anno.filterexp = o.filterexp;
                                            anno.filter = o.filter;
                                            anno.id = o.id;

                                            for ( let _o of selectedTrack.oligos ) {
                                                if ((_o.xi >= anno.xi && _o.xi <= anno.xf )||(anno.xi >= _o.xi && anno.xi <= _o.xf )){
                                                        if (_o.y <= ytmp) {
                                                            ytmp += 0.05;
                                                        }
                                                }
                                            }
                                            anno.y = ytmp;
                                            selectedTrack.oligos.push(anno);
                                        }
                                    }
                                }
                        });
                    },
                    move: () => {
                    },

                },
            );
        }
        graph.showMenu(menuList, x, y);
    })
}
