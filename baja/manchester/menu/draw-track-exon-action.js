function(annotation_type, graph, genegraph_panel_layout) {
    let track = null;
    let md = false;

    let ml = (annotation_type) => {

        graph.clearMouseListeners();

        graph.addMouseDownListener(async (x, y) => {
            md = true;
            if (track) {
                start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                end = Math.floor(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                graph.setMessage('Start: ' + start)
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
                        graph.setMessage('Start: ' + start)
                        if (md && track) {

                        }
                    }
                }
            }

        });
        graph.addMouseMoveListener((x, y) => {

            if (md && track) {
                end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                track.highlight(start, end);
                console.log(' track... ')
                return
            }

            let trackIndex = graph.getTrack(x, y)
            if (trackIndex >= 0) {
                let ttrack = graph.track[trackIndex]
                if (ttrack) {
                    track = ttrack;
                    track.select();

                }
            }

        })
        graph.addMouseUpListener((x, y) => {
            md = false;
            if (track) {
                end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                currentx = x;
                currenty = y;
            }
            track = null;
        });
    }

    let epandLeft = () => {
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

    graph.clearMouseListeners();
    graph.deselectAllTracks()
    ml(annotation_type);

    let buttons = [
        {
            x: 0, y: 0, label: '<<', ionFunction: createIonFunction(() => {
                graph.clearMouseListeners();
                epandLeft()

            }), mouseOver: createIonFunction(() => {
                graph.setMessage(" Expand highlight left while holding right")
            })
        },
        {
            x: 1, y: 0, label: '>>', ionFunction: createIonFunction(() => {
                graph.clearMouseListeners();
                expandRight();
            }), mouseOver: createIonFunction(() => {
                graph.setMessage(" Expand selection right while holding left position. ")
            })
        },
        {
            x: 2, y: 0, label: 'Deselect', ionFunction: createIonFunction(() => {
                graph.clearMouseListeners();
                graph.deselectAllTracks()
                ml(annotation_type);
            }), mouseOver: createIonFunction(() => {
                graph.setMessage(" Clear the highlight and start over ")
            })
        },
        {
            x: 3, y: 0, label: 'Create ' + annotation_type, ionFunction: createIonFunction(async () => {
                graph.clearMouseListeners();
                let Annotation = await exec('flexigraph/annotation.js')

                let attr_window = '';
                let va = await prompt("Name", ["Name"], { "Name": attr_window }, 300, 300)
                let m = va['Name']
                if (m === null) {
                    attr_window = 'untitled'
                } else {
                    attr_window = m.trim();
                }
                let exon = new Annotation(annotation_type, attr_window, Math.floor(track.markstart), Math.floor(track.markend)-1, track.strand);
                track.add(exon);

            }), mouseOver: createIonFunction(() => {
                graph.setMessage("Create an exon anntation from the selected sequence.")
            })
        },
    ]

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'height': 25,
            'width': 350,
            'title': 'controls',
            'grid': {
                xmin: 0,
                xmax: 5,
                ymin: 0,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': buttons
        }
    }

    CurrentLayout.clearComponent('labelPanel')
    CurrentLayout.setComponent('labelPanel', button_canvas);

}
