function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();

    let selectedTrack;
    let ywc = 0;
    let MD = false;

    function findClosestPoint(points, targetX) {

        let closestPoint = null;
        let smallestDifference = Infinity;

        points.forEach(point => {

          const difference = Math.abs(point.x - targetX);

          if (difference < smallestDifference) {
            closestPoint = point;
            smallestDifference = difference;
          }
        });
        return closestPoint
    }

    graph.addMouseDownListener(async (x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        if (!selectedTrack) {
            graph.setMessage(" Select a track.")
            return;
        }
        MD = true;

        ywc = selectedTrack.tgraph.Y(0)

        let menuList = []

        if (selectedTrack) {
            menuList.push(
                {
                    label: "Mark start",
                    click: async (xwc, ywc) => {
                        console.log('debubg');
                        selectedTrack.markstart = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                        graph.hideMenu();
                        MD = false;
                    },
                    move: () => {
                        log('')
                    }
                })

            menuList.push(
                {
                    label: "Mark end",
                    click: async (xwc, ywc) => {
                        selectedTrack.markend = Math.ceil(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));

                        graph.hideMenu();
                    },
                    move: () => {
                        log('')
                    }
                })
                menuList.push(
                    {
                        label: "Nearest Acceptor",
                        click: async (xwc, ywc) => {
                            let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')

                            let ti = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2)-100);
                            let tf = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2)+100);
                            let seq = selectedTrack.getSequenceRange(ti, tf);
                            let values = rnaSplice.findAcceptorSpliceSites(seq, selectedTrack.strand)
                            if ( values && values.length > 0 ){

                                let tit = ti+100;
                                let po = findClosestPoint ( values, tit)
                            }
                            showModal ( {
                                wid:'json',
                                data:JSON.stringify ( po )
                            })
                            graph.hideMenu();
                            MD = false;
                        },
                        move: () => {
                            log('')
                        }
                    })
                    menuList.push(
                        {
                            label: "Nearest Donor",
                            click: async (xwc, ywc) => {
                                console.log('debubg');
                                selectedTrack.markstart = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                graph.hideMenu();
                                MD = false;
                            },
                            move: () => {
                                log('')
                            }
                        })

            if (selectedTrack.markstart != null && selectedTrack.markend != null && (selectedTrack.markstart < selectedTrack.markend)) {
                menuList.push(
                    {
                        label: "Create Exon",
                        click: async (xwc, ywc) => {
                            graph.setMessage(" Creating new exon at " + selectedTrack.markstart + " " + selectedTrack.markend)
                            let va = await prompt("Name", ["Name"], { "Name": "" }, 300, 300)
                            if (va['Name'] == null || va["Name"].length <= 0) {
                                alert(' Please provide a name ')
                            } else {
                                let Annotation = await exec('flexigraph/annotation.js')
                                selectedTrack.add(new Annotation("Exon", va['Name'], Math.floor(selectedTrack.markstart), Math.floor(selectedTrack.markend)-1, selectedTrack.strand))
                                selectedTrack.markstart = null;
                                selectedTrack.markend = null;
                            }
                            graph.hideMenu();

                        },
                        move: () => {
                            log('')
                        }
                    })
            }

            graph.showMenu(menuList, x, y, 300)
        }

    })
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
    });
    graph.addMouseUpListener(async (x, y) => {
        if (graph.menuVisible() || MD) {
            return;
        }

    })
}
