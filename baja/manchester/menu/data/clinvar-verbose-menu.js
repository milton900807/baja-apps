function (datapath, server, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        r = createIonFunction((p) => {
            editor = p;
        })

        let fix = (ochr) => {
            const regex = /^chrx$/i;
            const regey = /^chry$/i;
            if (regex.test(ochr)) {
                return 'X';
            }
            else if (regey.test(ochr)) {
                return 'Y'
            }
            else {

                return ochr;
            }
        }

        graph.clearMouseListeners();
        graph.setMouseMode('select-track')

        graph.selectOff();
        let selectedTrack = null;

        graph.addMouseMoveListener((x, y) => {
            if (!graph.menuVisible()) {
                graph.selectOff();
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
            }
        })

        graph.addMouseDownListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }
            if (selectedTrack) {

                let gwcxs = graph.Xwc(0);
                let gwcxf = graph.Xwc(0 + graph.graph.grid.width);
                let s = [];
                let t = selectedTrack;

                let twcxs = Math.floor(t.tgraph.Xwc(gwcxs));
                let twcxf = Math.floor(t.tgraph.Xwc(gwcxf));

                console.log(" twcxf : " + twcxf - twcxs)
                menuList = []
                menuList.push(
                    {
                        label: "Load visible range",
                        click: async (scx, scy) => {
                            let chr = selectedTrack.chr;
                            let start = twcxs;
                            let end = twcxf;
                            let em = new EngineMonitor((v) => {
                            })
                            let selectedTrack_ = selectedTrack;

                            let ww = {
                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '100%',
                                data: {
                                    width: '100%',
                                    drive: 'bigdata',
                                    user: getUser(),
                                    server: server,
                                    columns: 3,
                                    filetype: 'gz',
                                    root: datapath,
                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                        let progressBar;
                                        let f = element.path;
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

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                        let em = new EngineMonitor((msg) => {
                                            log(msg)
                                        });

                                        let r = await exec(`${server}/py/bio/lj-tabix-2.py`, em, '/bd/' + element.path, fix(chr), start, end, selectedTrack_.strand);
                                        setTimeout(() => {
                                            showModal({
                                                wid: 'json',
                                                data: JSON.stringify(r)
                                            })

                                        }, 199)

                                        let SnpIndel = await exec('flexigraph/snpindel.js')
                                        let count = 0;
                                        if (r != null && r['results'] != null) {
                                            for (let sid of r['results']) {
                                                let snp = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, 0, selectedTrack_.strand, sid.id)
                                                snp.name = sid.name;

                                                let ant = sid.annotations.split(';');
                                                snp.annotations = ant;

                                                selectedTrack_.addsnpindel(snp)
                                                count++;
                                            }
                                        }
                                        graph.setMessage(' click ')

                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),
                                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                                    })
                                }
                            }

                            let bwpanel = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [

                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: '<hr>'
                                                }
                                            },

                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'mt-button', data: {
                                                        buttons: [

                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                })
                                                            },
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component': ww
                                            },
                                        ]
                                    ]
                                }
                            }

                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', bwpanel);

                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: "Load variants on track...",
                        click: async (scx, scy) => {
                            let chr = selectedTrack.chr;
                            let start = selectedTrack.xi;
                            let end = selectedTrack.xf;
                            let em = new EngineMonitor((v) => {
                            })
                            let selectedTrack_ = selectedTrack;

                            let ww = {
                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '100%',
                                data: {
                                    width: '100%',
                                    drive: 'bigdata',
                                    filetype: 'gz',

                                    server: server,
                                    user: getUser(),
                                    columns: 3,
                                    root: datapath,
                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                        let progressBar;
                                        let f = element.path;
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

                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                        let em = new EngineMonitor((msg) => {
                                            log(msg)
                                        });

                                        let r = await exec(`${server}/py/bio/lj-tabix-2.py`, em, '/bd/' + element.path, fix(chr), start, end, selectedTrack_.strand);

                                        let SnpIndel = await exec('flexigraph/snpindel.js')
                                        let count = 0;
                                        if (r != null && r['results'] != null) {
                                            for (let sid of r['results']) {
                                                let snp = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, 0, selectedTrack_.strand, sid.id)
                                                snp.name = sid.name;

                                                let ant = sid.annotations.split(';');
                                                snp.annotations = ant;

                                                selectedTrack_.addsnpindel(snp)
                                                count++;
                                            }
                                        }
                                        graph.setMessage(' click ')

                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),
                                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                                    })
                                }
                            }

                            let bwpanel = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [

                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: '<hr>'
                                                }
                                            },

                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'mt-button', data: {
                                                        buttons: [

                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                })
                                                            },
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component': ww
                                            },
                                        ]
                                    ]
                                }
                            }

                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', bwpanel);

                        },
                        move: () => {
                        }
                    });

                graph.showMenu(menuList, x, y, 200)
            }
        })
        graph.addMouseUpListener((x, y) => {
            if (graph.menuVisible()) {

                return;
            }
        })
        resolve()
    })
}
