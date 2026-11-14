function (graph) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

    // THIS TOOL OWNS THE CANVAS. Its preview IS a track highlight -- the window the compound
    // would occupy, repainted on every mouse move -- and gene.js's mouseDown treats a press
    // inside a highlight as a press on a selection: it opens the selected-sequence menu and
    // returns before this tool's own listener runs, so nothing is ever placed. Declaring the
    // tool makes those shortcuts stand down; clearMouseListeners releases it again, so the
    // flag cannot outlive the tool even though this tool has no exit path of its own.
    //
    // Set AFTER the clear above, which is what releases any previous tool's claim.
    try { graph.__canvasTool = 'draw-oligos'; } catch (e) { }

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

    return new Promise(async (resolve, reject) => {

        let Biopolymer = await exec('baja/chem/biopolymer.js')
        let chemistryObject = graph.props.selected_chemistry;
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
        let paused = false;
        graph.addMouseMoveListener((x, y) => {
            if (paused) {
                return;
            }
            graph.deselectAllTracks();
            let trackIndex = graph.getTrack(x, y);
            if (graph.menuVisible()) {
                return;
            }
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                if (selectedTrack) {
                    selectedTrack.select();
                    x = x - selectedTrack.tgraph.xi * 2;
                    start = Math.round(selectedTrack.tgraph.Xwc(x) - ((base_count) / 2));
                    end = start + base_count;
                    selectedTrack.highlight(start, end);
                    let ycoord = ((selectedTrack.tgraph.Ywc(selectedTrack.tgraph.height - y)));
                    currentY = Math.abs(ycoord)
                }
            } else {
                graph.selectOff();
                selectedTrack = null;
            }
        })

        // THE PRESS LOCKS THE WINDOW; THE RELEASE ASKS WHAT TO DO WITH IT.
        //
        // The menu used to open on the press, which put it under the cursor before the
        // button came back up and made a click-and-drag impossible: the drag was over by the
        // time anything could be aimed. Pressing now only fixes the window the preview is
        // showing, so the gesture reads the way it looks -- press where it goes, release to
        // say what to do -- and a drag positions the compound before anything is decided.
        const applyWindow = (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                if (selectedTrack) {
                    let __x = x - selectedTrack.tgraph.xi * 2;
                    start = Math.round(selectedTrack.tgraph.Xwc(__x) - ((base_count) / 2));
                    end = start + base_count;
                    selectedTrack.highlight(start, end);
                    let ycoord = ((selectedTrack.tgraph.Ywc(selectedTrack.tgraph.height - y)));
                    currentY = Math.abs(ycoord)
                }
            }
            ywc = y;
        };

        graph.addMouseDownListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }
            applyWindow(x, y);
        });

        // A release that came from clicking an item in this menu is not a release on the
        // canvas: gene.js runs a menu item's action on mouse-UP, so without this the menu
        // would close and immediately reopen under the cursor. Same guard, same reason, as
        // baja/manchester/annotation/isoform-capture.js.
        let menuClick = false;
        graph.addMouseUpListener((x, y) => {
            if (menuClick) { menuClick = false; return; }
            if (graph.menuVisible()) {
                return;
            }
            applyWindow(x, y);
            let menuList = [
            ]

            if (selectedTrack) {
                menuList.push({
                    label: `Draw oligo`,
                    click: async (x, y) => {
                        menuClick = true;      // this release belongs to the menu, not the canvas
                        currentSequence = selectedTrack.getHighlightedSequence();

                        paused = true;
                        graph.pushOntoHistory()
                        let bioObject = {
                            'targetSequence': currentSequence,
                            'trackName': selectedTrack.name,
                            'startIndex': start,
                            'strand': selectedTrack.strand,
                            'endIndex': (end),
                            'y': (selectedTrack.tgraph.ymax - currentY)
                        }
                        let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                        // compound.y is already set from bioObject.y — the Y captured at
                        // the track PRESS (currentY). Do NOT recompute it from the menu
                        // item's click coordinate, which is where the menu opened, not
                        // where the user pressed on the track.
                        if (compound)
                            selectedTrack.addOligo(compound)

                    },
                    move: () => {
                    }
                });

            }
            if (selectedTrack && selectedTrack.trackRef) {
            }

            if (highlight && selectedTrack) {
                menuList.push({
                    label: 'Show sequence',
                    click: (xwc, ywc) => {
                        menuClick = true;
                        let slice = '';

                        let editor_;
                        let annotation_editor = createIonFunction((editor) => {
                            editor_ = editor;
                            editor.code = slice;
                        })
                        let seq = selectedTrack.sequence;
                        if (!seq) {
                            prompt(" No sequence found ")
                        } else {
                            let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                            let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                            slice = seq.substring(initx + 1, tox + 1);
                            prompt(slice)
                        }
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }

                })
                menuList.push({
                    label: 'Track from seq',
                    click: (xwc, ywc) => {
                        menuClick = true;
                        let slice = '';
                        let seq = selectedTrack.sequence;
                        if (!seq) {
                            prompt(" No sequence found ")
                        } else {
                            let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                            let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                            slice = seq.substring(initx + 1, tox + 1);

                            let t = graph.createTrack(selectedTrack.name + '*', 0, slice.length, '+');
                            let trf = new TrackRef(selectedTrack, selectedTrack.markstart, selectedTrack.markend)
                            t.trackREf = trf;

                            t.setSequence(slice)

                            t.tgraph.xi = selectedTrack.tgraph.xi;
                            t.tgraph.width = selectedTrack.tgraph.width;
                            t.tgraph.yi = selectedTrack.tgraph.yi - selectedTrack.tgraph.height - 0.5;

                            t.tgraph.rescale();
                        }
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }
                })
            }
            graph.showMenu(menuList, x, y, 200)
        });

        resolve();

    });

}
