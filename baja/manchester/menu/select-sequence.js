function (graph, genegraph_panel_layout, showMenuOptions) {

    let start;
    let end;
    let track = null;
    hide_menu = false;
    let md = false;
    graph.menu = null;
    try { graph.showSideMenu(null); } catch (e) { }
    graph.side_menu = null;
    graph.clearMouseListeners();



    return new Promise(async (resolve, reject) => {
        const Annotation = await exec('flexigraph/annotation')
        let ml = () => {
            graph.clearMouseListeners();
            graph.setMouseMode('msg: click and drag on track')
            graph.addMouseDownListener(async (x, y) => {
                md = true;
                graph.mouse_message = null;
                graph.mousex = x;
                graph.mousey = y;
                graph.deselectAllTracks();

                if (track && track.tgraph) {
                    start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    end = Math.floor(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    graph.setMessage('Start coordinate: ' + start)
                    return
                } else {

                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack;
                            track.select();
                            start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                            end = Math.floor(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                            graph.setMessage('[Start: ' + start + ']')
                            if (md && track) {

                            }
                        }
                    } else {
                        graph.deselectAllTracks();
                    }
                }

            });
            graph.addMouseMoveListener((x, y) => {
                graph.mouse_message = null;
                graph.mousex = x;
                graph.mousey = y;

                try {
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack;
                            const hit = findHit(track.hitSegments, graph.X(x), graph.Y(y));
                            if (hit) {
                                graph.mouse_message = hit.discoveries[0].motif
                                graph.mousex = graph.X(x);
                                graph.mousey = graph.Y(y);
                            }
                            track.select();

                        }
                    }
                } catch (exception) {
                    console.log(" exception " + exception)
                }

                if (!track || !track.tgraph) {
                    return;
                }

                if (md && track) {
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    track.highlight(start, end);
                    // Show the current selection in cDNA (c.) and genomic (g.) coordinates.
                    try {
                        const li = Math.floor(Math.min(start, end) - track.xi);
                        const lj = Math.floor(Math.max(start, end) - track.xi);
                        let msg = 'c.' + (li + 1) + '_' + (lj + 1);
                        if (track.genomicAt) {
                            const g1 = track.genomicAt(li), g2 = track.genomicAt(lj);
                            if (g1 != null && g2 != null) msg += '   g.' + g1 + '_' + g2;
                        }
                        graph.setMessage(msg);
                    } catch (e) { }
                    potential_motifds_in_selected_space = null;
                    return
                }

                for (let g of graph.track) {
                    if (g.markend <= g.markstart) {
                        // g.deselect();
                    }
                }
            })
            graph.addMouseUpListener((x, y) => {
                md = false;

                // Drop a stale reference if the selected track was deleted.
                if (track && graph.track && !graph.track.includes(track)) track = null;

                if (track && track.tgraph) {
                    // Just select the sequence on this track — no chemistry prompt
                    // and no design menu. The selection (markstart/markend) is set
                    // during the drag; leave it in place.
                    if (track.markstart >= 0 && track.markend > track.markstart) {
                        try { track.findMotifsFromSelectedSequence(); } catch (e) { }
                    }
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    currentx = x;
                    currenty = y;
                }
                // NO automatic menu on mouse-up. Finishing a drag used to pop the
                // selected-sequence tools open 80ms later, which covered the selection just as
                // the user wanted to look at it or grab an arrow head to adjust the ends. The
                // selection stays on the track; the tools are reachable on demand from the
                // track menu (Sequence ▸ → Selected-sequence tools). showMenuOptions is kept in
                // the signature so the existing call sites still work, but no longer opens it.
                track = null;
                // On mouse-up, hand the mouse back to the normal mouse-over-highlight
                // behavior (the selection persists on the track, so the design menu
                // shown just above still works). Reset the mouse mode to navigate too.
                try { graph.setMouseMode('navigate'); } catch (e) { }
                try { if (graph.graph) graph.graph.mode = 'navigate'; } catch (e) { }
                try { graph.setMessage(''); } catch (e) { }   // clear the cursor-mode hint
                try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
            });
        }

        let expandLeft = () => {
            graph.addMouseDownListener(async (x, y) => {

                md = true;

                if (track) {
                    start = track.markstart;

                } else {

                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack
                            track.select();
                        }

                    } else {
                        track = null
                    }

                }
            });
            graph.addMouseMoveListener((x, y) => {

                console.log('debubg');
                if (md && track) {
                    track.select();
                    end = track.markend;
                    start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    track.highlight(start, end);

                } else {

                    for (let g of graph.track) {
                        if (g.markend <= g.markstart) {
                            g.deselect();
                        }
                    }
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack

                            track.select()
                        }
                    }
                }
            })
            graph.addMouseUpListener((x, y) => {
                if (track && !isMobile()) {

                    end = track.markend;
                    start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    graph.setMessage('Start: ' + start)
                    track.highlight(start, end);
                }
                track = null;
                md = false;
                currentx = x;
                currenty = y;
            });
        }

        let expandRight = () => {
            graph.addMouseDownListener(async (x, y) => {
                md = true;
                if (track) {
                    track.select();
                    start = track.markstart;
                }
            });
            graph.addMouseMoveListener((x, y) => {
                if (track && md) {
                    track.select();
                    start = track.markstart;
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    track.highlight(start, end);
                } else {
                    for (let g of graph.track) {
                        if (g.markend <= g.markstart) {
                            g.deselect();
                        }
                    }
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack;
                        }
                    }
                }
            })

            graph.addMouseUpListener((x, y) => {
                md = false;
                if (track && !isMobile()) {
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    graph.setMessage('Start: ' + start)
                    track.highlight(start, end);
                }

                track = null;
                currentx = x;
                currenty = y;
            });
        }

        sequence_phase = -1;
        let tile = (oligoLength, startCoordinate, endCoordinate) => {
            const tiledSequences = [];
            let currentCoordinate = startCoordinate;

            while (currentCoordinate + oligoLength <= endCoordinate) {
                tiledSequences.push({
                    start: currentCoordinate,
                    end: currentCoordinate + oligoLength - 1
                });
                currentCoordinate += oligoLength;
            }
            return tiledSequences;
        }

        setTimeout(() => {
            ml();

        }, 300)

        resolve();
    })

}
