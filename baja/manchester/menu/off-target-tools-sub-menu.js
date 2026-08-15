function (graph, genegraph_panel_layout) {
    hide_menu = false;
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
                                            'label': 'Run', 'items': [
                                                {
                                                    'label': 'Full antisense sequence', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/run-off-target-tool.js', graph, genegraph_panel_layout)
                                                    })
                                                },
                                                {
                                                    'label': 'Seed antisense sequence (siRNA)', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/run-off-target-tool-seed-seq.js', graph, genegraph_panel_layout)

                                                    })
                                                },
                                                {
                                                    'label': 'Levenshtein off-target (fuzzy match)', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/data/aso-offtarget.js', '', window['env']['apiUrl'], graph, genegraph_panel_layout)
                                                    })
                                                },
                                            ]
                                        },
                                        {

                                            'label': 'Export', 'items': [{

                                                'label': 'Off-target report', 'ionfunction': createIonFunction(async () => {
                                                    let trackName = '';
                                                    for (let t of graph.track) {
                                                        trackName += t.name + '__';
                                                        let oligos = t.oligos;
                                                        console.log('debubg');
                                                        const csvContent = [];
                                                        let csv = ''

                                                        if (oligos && oligos.length > 0) {
                                                            for (let oligo of oligos) {
                                                                csv += oligo.id + '\n'
                                                                if (oligo.offtarget && oligo.offtarget.length > 0) {
                                                                    let data = oligo.offtarget
                                                                    if (data.length > 0) {
                                                                        const headers = Object.keys(data[0]);
                                                                        csvContent.push(headers.join(','));
                                                                        data.forEach((obj) => {
                                                                            const values = headers.map((header) => {
                                                                                const value = obj[header];
                                                                                return `"${value !== undefined ? value : ''}"`;
                                                                            });
                                                                            csvContent.push(values.join(','));
                                                                        });
                                                                        csv += csvContent.join('\n');
                                                                    }
                                                                }
                                                                csv += '\n\n\n'

                                                            }
                                                            const blob = new Blob([csv], { type: 'text/csv' });
                                                            const link = document.createElement('a');
                                                            link.href = window.URL.createObjectURL(blob);
                                                            link.download = trackName + '_idt.csv';
                                                            link.click();

                                                        }

                                                    }
                                                })
                                            }]
                                        },
                                        {

                                            'label': 'Manage', 'items': [{

                                                'label': 'Remove all off-targets', 'ionfunction': createIonFunction(async () => {
                                                    for (let t of graph.track) {
                                                        let oligos = t.oligos;
                                                        if (oligos && oligos.length > 0) {
                                                            for (let oligo of oligos) {
                                                                oligo.offtarget = [];
                                                                oligo.offtargetsymbols = []
                                                            }
                                                        }
                                                    }
                                                })
                                            }]
                                        },

                                        {
                                            'label': 'Filter', 'items': [
                                                {
                                                    'label': 'Advanced', 'ionfunction': createIonFunction(async () => {

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
                                                                    graph.setMessage('Define synthesis sequence for oligos.')
                                                                    return;
                                                                }
                                                                if (needsOfftarget) {
                                                                    graph.setMessage('Some oligos need offtarget information.');
                                                                    let confirm = await exec('baja/lib/confirm.js', 'Some oligos do not have offtargets.  Continue?', async () => {
                                                                        if (library) {
                                                                            let MSGraph = await exec('lib/msgraph.js')
                                                                            let client = await MSGraph.getClient(sharepoint_config);
                                                                            let folder = await client.api(`/drives/${library.id}/items/${graph.parentId}`).get();
                                                                            let hl = await exec('baja/manchester/menu/target-tools.js', graph, library, folder, genegraph_panel_layout)
                                                                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                            CurrentLayout.setComponent('buttonMenuPanel', hl);
                                                                        }
                                                                        else {
                                                                            await exec('baja/manchester/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout)

                                                                        }
                                                                    })
                                                                    showModal(confirm)
                                                                } else {

                                                                    if (library) {
                                                                        let MSGraph = await exec('lib/msgraph.js')
                                                                        let client = await MSGraph.getClient(sharepoint_config);
                                                                        let folder = await client.api(`/drives/${library.id}/items/${graph.parentId}`).get();
                                                                        let hl = await exec('baja/manchester/menu/target-tools.js', graph, library, folder, genegraph_panel_layout)
                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', hl);

                                                                    }
                                                                    else
                                                                        await exec('baja/manchester/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout)

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
