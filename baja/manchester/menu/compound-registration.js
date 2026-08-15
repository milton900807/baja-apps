function (graph, genegraph_panel_layout, lib_id) {

    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
            'Sites.ReadWrite.All']
    }

    return new Promise(async (resolve, reject) => {
        let MSGraph = await exec('lib/msgraph.js')
        let client = await MSGraph.getClient(sharepoint_config);

        let library = await client.api(`/drives/${lib_id}`).get();

        let start;
        let end;
        hide_menu = false;
        let selectedTrack = null;
        let md = false;
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        let panel = null;
        let __nameHook = createIonFunction((name) => {
            panel = name;
        })
        let bpanel = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            width: '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    title: '  ',
                                    style: 'sub-container',
                                    menus: [
                                        {
                                            'label': 'Deprecated reg...', 'items': [
                                                {
                                                    'label': 'Register All Compounds', 'ionfunction': createIonFunction(async () => {
                                                        let gwcxs = graph.graph.Xwc(0);
                                                        if (!gwcxs)
                                                            return;
                                                        let gwcxf = graph.graph.Xwc(0 + graph.graph.grid.width);
                                                        if (!gwcxf)
                                                            return;
                                                        let o = []
                                                        for (let t of graph.track) {
                                                            let twcxs = t.tgraph.Xwc(gwcxs - 2 * t.tgraph.xi);
                                                            let twcxf = t.tgraph.Xwc(gwcxf - 2 * t.tgraph.xi);

                                                            let vo = t.oligos;

                                                            o = o.concat(vo)
                                                        }

                                                        let chemistry_tab = {
                                                            wid: 'card',
                                                            data: {
                                                                "style.padding-top": '10px',
                                                                cards: [
                                                                    [
                                                                        {
                                                                            'width': '100%',
                                                                            'component': {
                                                                                wid: 'html',
                                                                                data: `  Register ${o.length} compounds?`
                                                                            }
                                                                        },
                                                                        {
                                                                            'title': '',
                                                                            'width': '100%',
                                                                            'component': {
                                                                                wid: 'mt-button', data: {
                                                                                    buttons: [
                                                                                        {
                                                                                            label: 'Cancel', ionFunction: createIonFunction(() => {

                                                                                                hideAllModal();
                                                                                            })
                                                                                        },
                                                                                        {
                                                                                            label: 'Register', ionFunction: createIonFunction(async () => {
                                                                                                hideAllModal();
                                                                                                await exec('baja/compound-registration/simple-reg.js', library.id, o, graph)
                                                                                            })
                                                                                        },
                                                                                        {
                                                                                            label: 'Force Registration', ionFunction: createIonFunction(async () => {
                                                                                                hideAllModal();
                                                                                                await exec('baja/compound-registration/force-reg.js', library.id, o, graph)
                                                                                            })
                                                                                        }
                                                                                    ]
                                                                                }
                                                                            }
                                                                        }
                                                                    ]]
                                                            }
                                                        }
                                                        showModal(chemistry_tab)

                                                    })
                                                },

                                                {
                                                    'label': 'Reset compounds', 'ionfunction': createIonFunction(async () => {
                                                        let gwcxs = graph.graph.Xwc(0);
                                                        if (!gwcxs)
                                                            return;
                                                        let gwcxf = graph.graph.Xwc(0 + graph.graph.grid.width);
                                                        if (!gwcxf)
                                                            return;
                                                        let o = []
                                                        for (let t of graph.track) {
                                                            let vo = t.oligos;
                                                            vo.id = null;
                                                            vo.libID = null;
                                                            o = o.concat(vo)
                                                        }
                                                        graph.setMessage('ID reset for structures')
                                                    })
                                                },
                                                {
                                                    'label': 'Sync with database', 'ionfunction': createIonFunction(async () => {

                                                        graph.clearMouseListeners()
                                                        graph.addMouseDownListener((x, y) => {
                                                            graph.md = true;
                                                        })
                                                        for (let t of graph.track) {

                                                            let vo = t.oligos;
                                                            for (let o of vo) {
                                                                try {
                                                                    o.highlight(1000, 'magenta')

                                                                    res = await db.getStructure(lib_id, o);
                                                                    await graph.zoomRect(t.tgraph.X(o.xi - 400), t.tgraph.X(o.xf + 400), t.tgraph.Y(0), t.tgraph.Y(2), 150)
                                                                    if (graph.md) {
                                                                        graph.setMessage(" Operation interrupted ")
                                                                        break;
                                                                    }
                                                                    o.id = res.id;
                                                                    o.status = o.id

                                                                } catch (exception) {
                                                                    console.log(exception)
                                                                }
                                                                setTimeout(() => {

                                                                    o.status = null;

                                                                }, 1000)
                                                            }

                                                        }
                                                        graph.setMessage('ID reset for structures')
                                                    })
                                                },
                                            ]
                                        },
                                        {
                                            'label': 'Show', 'items': [
                                                {
                                                    'label': 'Registration IDs', 'ionfunction': createIonFunction(async () => {

                                                        for (let track of graph.track) {
                                                            for ( let o of track.oligos )
                                                            {
                                                                o.status = o.id
                                                                o.highlight ( 1000, 'blue')

                                                            }
                                                        }

                                                        setTimeout ( ()=> {

                                                            for (let track of graph.track) {
                                                                for ( let o of track.oligos )
                                                                {
                                                                    o.status =null

                                                                }
                                                            }

                                                        }, 10000)

                                                    })
                                                },
                                            ]
                                        },
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

        resolve()

    })

}
