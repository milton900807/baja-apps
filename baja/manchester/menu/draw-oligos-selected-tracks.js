function (graph, button_canvas) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

    let chemistryObject = graph.props.selected_chemistry;

    if (!chemistryObject) {
        graph.setMessage(" No chemistry selected ")
        return;
    } else {
        graph.setMessage(' Chemistry is ' + chemistryObject.type);

    }

    exec('lib/msgraph.js').then(async MSGraph => {

        let selSeq = {
            setListener: (l) => {
                this.listener = l;
                console.log ( ' lisneer is set ' + l );
            },
            update: (seq) => {
                console.log ( ' seq ' + seq)

                if (this.listener)
                    this.listener(seq)
            }
        }

        let hl = await exec('baja/manchester/menu/draw-oligos-button-panel.js', graph, selSeq, button_canvas)
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', hl);

        let Biopolymer = await exec('baja/chem/biopolymer.js')
        let chemistryObject = graph.props.selected_chemistry;

        if (!chemistryObject) {
            graph.setMessage(" No chemistry selected ")
        } else {
            graph.setMessage(' Chemistry is ' + chemistryObject.type);

        }

        let base_count = 10;
        base_count = Biopolymer.countBases(chemistryObject);

        if (chemistryObject['length'] != null || chemistryObject['length'] > 0) {
            base_count = chemistryObject['length']
        } else {

        }
        let currentSequence = null;
        let currentY = null;
        let start;
        let end;
        let cselectedTrack = null;
        let paused = false;
        graph.addMouseMoveListener((x, y) => {
            if (paused) {
                return;
            }

            if (!chemistryObject) {
                graph.setMessage(" No chemistry selected ")

            }
        })
        graph.addMouseDownListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                cselectedTrack = graph.track[trackIndex]
                if (cselectedTrack) {

                    let x__ = x - cselectedTrack.tgraph.xi * 2;
                    start = Math.round(cselectedTrack.tgraph.Xwc(x__) - ((base_count) / 2));
                    end = start + base_count;

                    currentSequence = cselectedTrack.getSequenceRange(start, end);
                    selSeq.update(currentSequence);
                    cselectedTrack.highlight(start, end);

                }
            } else {
                graph.hideMenu();
            }

            for (let selectedTrack of graph.track) {
                if (cselectedTrack && selectedTrack.isSelected() && selectedTrack != cselectedTrack) {
                    selectedTrack.highlight(0, 0);

                    let sequence = selectedTrack.sequence.trim();
                    let len = currentSequence.length;
                    for (let i = 0; i < sequence.length - len; i++) {
                        let index = sequence.indexOf(currentSequence)
                        if (index >= 0) {
                            let __x = index + selectedTrack.tgraph.xi * 2;
                            start = Math.round(selectedTrack.tgraph.Xwc(__x));
                            end = start + base_count;
                            selectedTrack.highlight(start, end);
                        }

                    }
                }
            }
        })

        graph.addMouseUpListener((x, y) => {

            if (graph.menuVisible()) {
                console.log(" menu is vis so returning ")
                return;
            }

            if (!cselectedTrack) {
                graph.hideMenu();
                return;
            }

            ywc = y;

            let menuList = [
            ]

            menuList.push({
                label: `Draw oligo`,
                click: async (x, y) => {

                    let cy = 0.2;
                    for (let selectedTrack of graph.track) {
                        if (selectedTrack.isSelected()) {

                            currentSequence = selectedTrack.getHighlightedSequence();

                            paused = true;

                            let bioObject = {
                                'targetSequence': currentSequence,
                                'trackName': selectedTrack.name,
                                'startIndex': start,
                                'strand': selectedTrack.strand,
                                'endIndex': (end),
                                'y': (cy)
                            }
                            console.log(" --------generating the compounds --------------- ")
                            let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)

                            if (compound)
                                selectedTrack.addOligo(compound)

                        }
                    }

                    setTimeout(() => {
                        paused = false;
                    }, 3000)

                },
                move: () => {
                }
            });

        });

    });

}
