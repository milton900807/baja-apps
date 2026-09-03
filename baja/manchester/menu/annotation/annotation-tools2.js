function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
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
                                            'label': 'New...', 'items': [

                                                {
                                                    'label': 'Exon...', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMouseMode('none')
                                                        let selected = false;

                                                        for (let selectedTrack of graph.track) {

                                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                selected = true;
                                                                let confirm = await exec('baja/lib/confirm.js', 'Create exon from selected squence on track ' +
                                                                    selectedTrack.name + '(' + selectedTrack.description + ')?', async () => {

                                                                        await graph.animateTo((selectedTrack.tgraph.X(selectedTrack.markstart)) - 10, (selectedTrack.tgraph.X(selectedTrack.markend)) + 10, selectedTrack.tgraph.yi + 2, selectedTrack.tgraph.height * (-1));
                                                                        graph.setMessage(" Creating new exon at " + selectedTrack.markstart + " " + selectedTrack.markend)
                                                                        let va = await prompt("Name", ["Name"], { "Name": "" }, 300, 300)
                                                                        if (va['Name'] == null || va["Name"].length <= 0) {
                                                                            alert(' Please provide a name ')
                                                                        } else {

                                                                            let Annotation = await exec('flexigraph/annotation.js')
                                                                            let name = va['Name'];
                                                                            if (name === null || name.length <= 0) {
                                                                                graph.setMessage('Please provide a valid name for this exon ')
                                                                                return;
                                                                            }
                                                                            if (selectedTrack.markstart && selectedTrack.markend && (selectedTrack.markend - selectedTrack.markstart) > 1) {
                                                                                graph.setMessage(" Creating new exon at " + selectedTrack.markstart + " " + selectedTrack.markend)
                                                                                selectedTrack.add(new Annotation("Exon", name, Math.floor(selectedTrack.markstart), Math.floor(selectedTrack.markend), selectedTrack.strand))
                                                                            }

                                                                            selectedTrack.generateORF();
                                                                        }
                                                                    })

                                                                showModal(confirm)

                                                            }
                                                        }

                                                        if (!selected) {
                                                            graph.setMessage(" You need to select a sequence on a track to create an exon")
                                                            infoPrompt('You need to select a sequence on a track to create an exon')
                                                        }

                                                    })
                                                },

                                                {

                                                    'label': 'Mutation', 'ionfunction': createIonFunction(async () => {

                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                        await exec('baja/manchester/menu/variant-tools1.js', graph, genegraph_panel_layout)

                                                    })

                                                },
                                                {

                                                    'label': 'Acceptor sites', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMouseMode('none')
                                                        let Annotation = await exec('flexigraph/annotation.js')
                                                        let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                                                        function sleep(ms) {
                                                            return new Promise(resolve => setTimeout(resolve, ms));
                                                        }

                                                        let selected = false;
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                selected = true;
                                                            }
                                                        }
                                                        if (!selected) {
                                                            infoPrompt("You must first select a sequence range on at least one track.")
                                                            return;
                                                        }

                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                let Annotation = await exec('flexigraph/annotation.js')
                                                                let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                                                                function sleep(ms) {
                                                                    return new Promise(resolve => setTimeout(resolve, ms));
                                                                }

                                                                if (selectedTrack) {

                                                                    if (selectedTrack.strand < 0) {
                                                                        let seq = selectedTrack.sequence;
                                                                        let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                                                        let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                                                        let slice = seq.substring(initx, tox);

                                                                        let splice = rnaSplice.findAcceptorSpliceSites(slice, selectedTrack.strand)
                                                                        for (let sp of splice) {
                                                                            await sleep(50);
                                                                            sp.position += 1;
                                                                            let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                                                                selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                                                            selectedTrack.add(tr);
                                                                        }
                                                                    } else {
                                                                        let seq = selectedTrack.sequence;
                                                                        let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                                                        let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                                                        let slice = seq.substring(initx, tox);
                                                                        let splice = rnaSplice.findAcceptorSpliceSites(slice, selectedTrack.strand)
                                                                        for (let sp of splice) {
                                                                            await sleep(50);
                                                                            sp.position += 1;
                                                                            console.log(' sit ' + sp.position + ' length ' + sp.length)

                                                                            let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                                                                selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                                                            selectedTrack.add(tr);
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }

                                                    })
                                                },
                                                {
                                                    'label': 'Donor sites', 'ionfunction': createIonFunction(async () => {

                                                        let selected = false;
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                selected = true;
                                                            }
                                                        }
                                                        if (!selected) {
                                                            infoPrompt("You must first select a sequence range on at least one track.")
                                                            return;
                                                        }

                                                        let count = 0;

                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                let Annotation = await exec('flexigraph/annotation.js')
                                                                let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                                                                function sleep(ms) {
                                                                    return new Promise(resolve => setTimeout(resolve, ms));
                                                                }
                                                                if (selectedTrack) {
                                                                    let xi = selectedTrack.markstart;
                                                                    let xf = selectedTrack.markend;

                                                                    let seq = selectedTrack.sequence;
                                                                    let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                                                    let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                                                    let slice = seq.substring(initx + 1, tox + 1);
                                                                    let values = rnaSplice.findDonorSpliceSites(slice, selectedTrack.strand)
                                                                    let splice = values.potentialSites;
                                                                    let csplice = values.canonicalSites;
                                                                    for (let sp of splice) {
                                                                        await sleep(50);
                                                                        if (selectedTrack.strand < 0) {
                                                                            sp.position += 1;

                                                                        } else {
                                                                            sp.position += 1;
                                                                        }

                                                                        let tr = new Annotation("Donor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                                                            selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);

                                                                        selectedTrack.add(tr);
                                                                        count++;
                                                                    }
                                                                    for (let sp of csplice) {
                                                                        await sleep(50);
                                                                        let tr = new Annotation("Canonical-Donor-Splice-Site", 'css' + sp.site, selectedTrack.markstart + sp.position,
                                                                            selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                                                        selectedTrack.add(tr);
                                                                    }
                                                                    let script_canvas = await exec('baja/manchester/menu/annotation-navigation-tools.js', graph)
                                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                    CurrentLayout.setComponent('buttonMenuPanel', script_canvas);
                                                                }
                                                            }
                                                        }
                                                    })
                                                },
                                                {
                                                    label: 'Repeate Elements', 'ionfunction': createIonFunction(async () => {
                                                        graph.runfun(async () => { await exec('baja/manchester/menu/annotation/repeate-sequence-finder.js', graph, genegraph_panel_layout) })
                                                    })
                                                },

                                                {
                                                    label: 'TSS', 'ionfunction': createIonFunction(async () => {
                                                        graph.runfun(async () => { await exec('baja/manchester/menu/annotation/transcription-annotations.js', graph, genegraph_panel_layout) })

                                                    })
                                                },

                                                {
                                                    'label': 'Edit sequence', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage(" Select a sequence on a track.")
                                                        await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {

                                                                await exec('baja/manchester/menu/edit-track-sequence-panel.js', selectedTrack, graph, genegraph_panel_layout)

                                                            }
                                                        }

                                                    })
                                                },

                                            ]
                                        },
                                        {
                                            'label': 'Edit', 'items': [
                                                {
                                                    'label': "Modify Chemistry...", 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/annotation/modify-chemistry.js', graph, genegraph_panel_layout)
                                                    })
                                                },
                                                {
                                                    'label': "Exon...", 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage(" Click on an exon to to see menu options... ")
                                                        await exec('baja/manchester/menu/annotation/edit.js', graph, genegraph_panel_layout)

                                                        CurrentLayout.clearComponent('labelPanel')
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            data: "Exon editor: Select an exon to edit. "
                                                        });

                                                    })
                                                },
                                                {

                                                    'label': "Resize exon...", 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage(" Click on an exon to to see menu options... ")

                                                        let wgx = Math.floor(selectedTrack.tgraph.Xwc(x) - selectedTrack.tgraph.xi * 2);

                                                        CurrentLayout.clearComponent('labelPanel')
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            data: "Exon editor: Select an exon to edit. "
                                                        });

                                                    })
                                                },

                                                {
                                                    'label': 'Remove all annotations', 'ionfunction': createIonFunction(async () => {

                                                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete user-defined annotations?', async () => {

                                                            graph.setMouseMode('none')

                                                            let selected = false;
                                                            for (let selectedTrack of graph.track) {
                                                                if (selectedTrack.markend > selectedTrack.markstart) {
                                                                    selected = true;
                                                                }
                                                            }
                                                            for (let selectedTrack of graph.track) {
                                                                if (selectedTrack.markend > selectedTrack.markstart) {
                                                                    let ann = selectedTrack.getAnnotationsInRange(selectedTrack.markstart, selectedTrack.markend)
                                                                    for (let a of ann) {
                                                                        selectedTrack.removeAnnotation(a)
                                                                    }
                                                                } else if (selectedTrack.isSelected()) {
                                                                    selectedTrack.annotations = [];
                                                                }
                                                            }
                                                        })
                                                        showModal(confirm)

                                                    })
                                                },
                                                {
                                                    'label': 'Remove User Annotations', 'ionfunction': createIonFunction(async () => {

                                                        function processTracksByAttributeRange(graph, controlString) {
                                                            let startValue = 1;
                                                            let endValue = 0;

                                                            if (controlString.includes('-')) {

                                                                const rangeParts = controlString.split('-');
                                                                startValue = parseInt(rangeParts[0], 10);
                                                                endValue = parseInt(rangeParts[1], 10);
                                                            } else if (controlString.startsWith('>')) {

                                                                startValue = parseInt(controlString.substring(1), 10) + 1;
                                                                endValue = Infinity;
                                                            } else if (controlString.startsWith('<')) {

                                                                startValue = 1;
                                                                endValue = parseInt(controlString.substring(1), 10) - 1;
                                                            }

                                                            for (let attr_window = startValue; attr_window <= (endValue === Infinity ? 100 : endValue); attr_window++) {

                                                                for (let selectedTrack of graph.track) {

                                                                    if (selectedTrack.isSelected()) {

                                                                        console.log(`Removing ${attr_window} from track`);
                                                                        selectedTrack.removeAnnotationsByCount(attr_window);
                                                                    }
                                                                }
                                                            }
                                                        }

                                                        let list = [

                                                            {
                                                                label: 'Remove all user-defined annotations', click: async () => {

                                                                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete user-defined annotations?', async () => {
                                                                        for (let selectedTrack of graph.track) {
                                                                            if (selectedTrack.isSelected()) {
                                                                                selectedTrack.removeAnnotationByType('UserAnnotation')
                                                                            }
                                                                        }
                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                    })
                                                                    showModal(confirm)

                                                                }
                                                            },
                                                        ]

                                                        let names = list.map(obj => obj.label);
                                                        let t = {
                                                            wid: 'selection-list',
                                                            data: {
                                                                single_selection: true,
                                                                show_button: false,
                                                                singleSelect: true,
                                                                listItems: names,
                                                                button_function: createIonFunction(async (items) => {

                                                                    let name = items[0]
                                                                    for (let l of list) {
                                                                        if (l.label === name) {
                                                                            l.click()
                                                                        }
                                                                    }
                                                                })
                                                            }
                                                        }

                                                        let design_params_panel_layout = {
                                                            wid: 'card',
                                                            data: {
                                                                cards: [
                                                                    [
                                                                        {
                                                                            'width': '100%',
                                                                            'component': t
                                                                        },
                                                                        {
                                                                            'title': '',
                                                                            'width': '100%',
                                                                            'component': {
                                                                                wid: 'mt-button', data: {
                                                                                    buttons: [
                                                                                        {
                                                                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                                                                CurrentLayout.clearComponent('mainPanel')
                                                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                                            })
                                                                                        }
                                                                                    ]
                                                                                }
                                                                            }
                                                                        }

                                                                    ]
                                                                ]
                                                            }
                                                        }
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

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
        // The buttonMenuPanel slot was removed — render the SAME menu as an on-canvas SIDE MENU
        // (New ▸ / Edit ▸), reusing each item's existing ionfunction via getIonFunction().
        try {
            const menus = bpanel.data.cards[0][0].component.data.menus;
            const close = () => { try { graph.showSideMenu(null); } catch (e) { } };
            const runIon = (ref) => { close(); try { const fn = getIonFunction(ref); if (typeof fn === 'function') fn(); } catch (e) { } };
            let showMain;
            const back = { label: '‹ Back', move: () => { }, click: () => { showMain(); } };
            const groupMenu = (grp) => (grp.items || []).map((it) => ({ label: it.label, move: () => { }, click: () => { runIon(it.ionfunction); } })).concat([back]);
            showMain = () => {
                const main = (menus || []).map((grp) => ({ label: (grp.label || '') + ' ▸', move: () => { }, click: () => { try { graph.showSideMenu(groupMenu(grp)); } catch (e) { } } }));
                main.push({ label: 'Close', move: () => { }, click: () => { close(); } });
                try { graph.showSideMenu(main); } catch (e) { }
            };
            showMain();
        } catch (e) { try { graph.setMessage(' Could not open annotation tools. '); } catch (e2) { } }

        resolve();
    })
}
