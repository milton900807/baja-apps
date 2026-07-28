function (graph, genegraph_panel_layout) {
    let start;
    let end;
    hide_menu = false;
    let selectedTrack = null;
    let md = false;

    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
            'Sites.ReadWrite.All',
            'https://graph.microsoft.com/Sites.ReadWrite.All']
    }

    return new Promise(async (resolve, reject) => {
        let MSGraph = await exec('lib/msgraph.js')
        let client = await MSGraph.getClient(sharepoint_config);
        let library = null;

        if (graph.lib_id)
            library = await client.api(`/drives/${graph.lib_id}`).get();
        else {

        }
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
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
                                            'label': 'Quick filters', 'items': [
                                                {
                                                    'label': 'Remove homopolymer contigs', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/screens/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout, `pattern, TTTT | Required\npattern, AAAA | Required\npattern, CCCC | Required\npattern, GGGG | Required
                                                        `)

                                                    })
                                                },
                                                {
                                                    'label': 'Remove palindromes', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/screens/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout, `palindrome,10 | Required`)

                                                    })
                                                },
                                                {
                                                    'label': 'Seed filters', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage('Filter seed sequences that hit the same 3UTR >= 10 times')

                                                        await exec('baja/screens/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout, 'offtarget-seed, Human3utr, 1, 10 | Required')
                                                    })
                                                }

                                            ]

                                        },
                                        {
                                            'label': 'Sequence', 'items': [
                                                {
                                                    'label': 'Advanced', 'ionfunction': createIonFunction(async () => {

                                                        let Biopolymer = await exec('baja/chem/biopolymer.js');

                                                        graph.clearMouseListeners();

                                                        if (graph.track.length > 0) {
                                                            let hasSnpindel = 0;
                                                            let hasOligos = 0;
                                                            for (let t of graph.track) {
                                                                if (t.snpindels.length > 0) {
                                                                    hasSnpindel = 1;
                                                                }
                                                                if (t.oligos.length > 0) {
                                                                    hasOligos = 1;
                                                                }
                                                            }
                                                            if (hasOligos == 1) {
                                                                let needsOfftarget = null;
                                                                let needssynthesisSequence = null;
                                                                for (let t of graph.track) {
                                                                    for (let o of t.oligos) {
                                                                        if (!o.offtarget) {
                                                                            needsOfftarget = 1;
                                                                            o.highlight__ = true;
                                                                        }
                                                                        if (!o.synthesisSequence) {
                                                                            needssynthesisSequence = 1;
                                                                        }
                                                                    }
                                                                }
                                                                if (needssynthesisSequence) {
                                                                    for (let t of graph.track) {
                                                                        for (let o of t.oligos) {

                                                                            if (o.synthesisSequence == null || o.synthesisSequence.length <= 0) {
                                                                                o.synthesisSequence = Biopolymer.generateSynthesisSequence(o)
                                                                            }
``                                                                        }

                                                                    }
                                                                }
                                                                if (needsOfftarget) {
                                                                    graph.setMessage('Some oligos need offtarget information.');
                                                                    let confirm = await exec('baja/lib/confirm.js', 'Some oligos do not have offtargets.  Continue?', async () => {
                                                                        if (library) {
                                                                            let MSGraph = await exec('lib/msgraph.js')
                                                                            let client = await MSGraph.getClient(sharepoint_config);
                                                                            let folder = await client.api(`/drives/${library.id}/items/${graph.parentId}`).get();

                                                                            let hl = await exec('baja/screens/menu/target-tools.js', graph, library, folder, genegraph_panel_layout)
                                                                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                            CurrentLayout.setComponent('buttonMenuPanel', hl);

                                                                        }
                                                                        else {
                                                                            await exec('baja/screens/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout)
                                                                        }
                                                                    })
                                                                    showModal(confirm)
                                                                } else {

                                                                    if (library) {
                                                                        let MSGraph = await exec('lib/msgraph.js')
                                                                        let client = await MSGraph.getClient(sharepoint_config);
                                                                        let folder = await client.api(`/drives/${library.id}/items/${graph.parentId}`).get();
                                                                        let hl = await exec('baja/screens/menu/target-tools.js', graph, library, folder, genegraph_panel_layout)
                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', hl);

                                                                    }
                                                                    else
                                                                        await exec('baja/screens/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout)

                                                                }
                                                            } else {
                                                                graph.setMessage('No oligos and/or variants found')
                                                            }
                                                        }

                                                    })
                                                },
                                            ]
                                        }
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
        resolve();
    })

}
