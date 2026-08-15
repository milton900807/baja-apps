function (graph, genegraph_panel_layout) {

    let start;
    let end;
    let track = null;
    hide_menu = false;
    let md = false;
    graph.menu = null;
    graph.clearMouseListeners();
    for (let t of graph.track) {
        if (t.markend > t.markstart) {
            track = t;
            break
        }
    }

    let ml = () => {
        graph.addMouseDownListener(async (x, y) => {
            md = true;
            graph.mouse_message = null;
            graph.mousex = x;
            graph.mousey = y;

            if (track) {
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
                    this.deselectAllTracks();
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

            if (!track) {
                return;
            }

            if (md && track) {
                end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                console.log(" start " + start + " end " + end)
                track.highlight(start, end);
                potential_motifds_in_selected_space = null;
                console.log(' track... ')
                return
            }

            for (let g of graph.track) {
                if (g.markend <= g.markstart) {
                    g.deselect();
                }
            }

        })
        graph.addMouseUpListener((x, y) => {
            md = false;

            console.log(" we still have the sequence object ")
            if (track) {
                if (track.markstart >= 0 && track.markend > track.markstart) {
                    track.findMotifsFromSelectedSequence();
                    setTimeout(async () => {
                        let ml = await exec('baja/manchester/menu/load_seleced_sequence_menulist', graph, genegraph_panel_layout)
                        graph.showMenu(ml)
                    }, 1000)
                }
                end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                currentx = x;
                currenty = y;
            }
            track = null;
        });
    }

    let tools_menu = [
        {
            'label': 'Alphfold', click: (() => {

                if (graph.track && graph.track.length === 0) {
                    infoPrompt(" First load a gene transcript.  (Track -> Add)")
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    return;
                }
                if (graph.getMarkSelectedTracks()) {
                    if (graph.getMarkSelectedTracks().length < 1) {
                        infoPrompt(" Click and drag on a track to select a sequence to run")
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                        ml();
                        setTimeout(() => {
                            graph.setMessage(" Click and drag on a track to select a peptide sequence ")
                        }, 1000)
                        return;
                    } else if (graph.getMarkSelectedTracks().length >= 1) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                        setTimeout(async () => {
                            let ml = await exec('baja/manchester/menu/load_seleced_sequence_menulist', graph, genegraph_panel_layout, true)
                        }, 200)
                    }
                }
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Splicing attribution', click: (() => {

                infoPrompt("License required")

            })
        },
        {
            'label': 'RNA structure', click: (async () => {
                infoPrompt("License required")

            })
        },
        {
            'label': 'RBP', click: (async () => {
                infoPrompt("License required")

            })
        },
    ]

    if (window['env']['auth'] === 'b2c') {
        setTimeout(async () => {
            if (window['env']['auth'] === 'b2c') {
                let host_ = window['env']['apiUrl']
                const jsonobj = {
                    email: getUser()
                };

                let rs = await POSTJSON(jsonobj, host_ + '/verify-user');
                if (rs.status !== 'ptx_active') {
                    setTimeout(async () => {
                        infoPrompt(" The screening designer not available with this license")
                        exec('baja/yak')
                    }, 10000)
                }
            }
        }, 10000)
    }

    return tools_menu;
}
