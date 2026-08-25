function (graph, track, snp) {

    return new Promise(async (resolve, reject) => {
        let menuList = []
        let editor;

        const genegraph_panel_layout = CurrentLayout.getStashed('mainPanel')

        r = createIonFunction((p) => {
            editor = p;
        })
        menuList = []
        menuList.push(
            {
                label: "Zoom into snp",
                click: async (scx, scy) => {
                    setTimeout(async () => {
                        await graph.animateTo(track.tgraph.X(snp.xi) - 10, track.tgraph.X(snp.xf) + 10, track.tgraph.yi - 5, track.tgraph.yi + 1, 1000);
                    }, 200)
                    graph.showSideMenu(null)
                },
                move: () => {
                }
            });

        menuList.push(
            {
                label: "More information",
                click: async (scx, scy) => {
                    graph.showSprite = true;
                    // Gene symbol (from the track description "GENE;transcript") and genomic
                    // locus for the Claude prompt, so the summary is specific to this variant.
                    let geneSymbol = '';
                    try { geneSymbol = ('' + (track.description || '')).split(';')[0].trim(); } catch (e) { }
                    if (!geneSymbol) geneSymbol = track.geneID || track.name || '';
                    let pos = snp.xi;
                    try {
                        if (track.isChildCDNATrack && track.isChildCDNATrack() && track.genomicAt) {
                            const g = track.genomicAt(snp.xi);
                            if (g != null) pos = g;
                        }
                    } catch (e) { }
                    let r = await exec('py/snps/snp_info_claude.py', JSON.stringify(snp), geneSymbol, ('' + (track.chr || '')), ('' + pos));
                    graph.setCenterParagraph(r['mutation_paragraph']);
                    graph.showSprite = false;
                    graph.showSideMenu(null)
                },
                move: () => {
                }
            });


        menuList.push(
            {
                label: "Properties",
                click: async (scx, scy) => {

                    showModal(
                        {
                            wid: 'json',
                            data: JSON.stringify(snp)
                        }
                    )
                },
                move: () => {
                }
            });
        menuList.push(
            {
                label: "SNP/Indel Tools",
                click: async (scx, scy) => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    const hl = await exec('baja/manchester/menu/variant-tools-finder.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', hl);
                },
                move: () => {
                }
            });
        menuList.push(
            {
                label: "Mutate",
                click: async (scx, scy) => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    const hl = await exec('baja/manchester/menu/variant-tools-finder.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', hl);
                    track.mutateTrackWithSingleMutation(snp)
                    track.generateORF();
                    infoPrompt(" Track sequence has changed. ")
                },
                move: () => {
                }
            });

        menuList.push(
            {
                label: 'Allele selective ASOs',
                click: async (x, y) => {

                    let selectMethod = async (v) => {
                        graph.props.selected_chemistry = v;
                        hideAllModal();
                        graph.setMessage(" Loading the compound toolbar. ")
                        setTimeout(async () => {
                            await exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout)
                            setTimeout(async () => {
                                exec('baja/manchester/menu/simple-info-panel.js', graph, genegraph_panel_layout, 'Menus for creating compounds...')
                            }, 1000)

                        }, 1000)

                    }

                    let Biopolymer = await exec('baja/chem/biopolymer.js');
                    let chemistryObject = graph.props.selected_chemistry;
                    if (!chemistryObject) {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        setTimeout(async () => {
                            let myChem = await exec('baja/chem/my-chem-htsbio-w.js', selectMethod)
                            let select_display = createIonFunction((ref) => {
                                select_display_html = ref;
                            })
                            let molecule_type_html_render = await exec('baja/manchester/render-moltype.js')
                            let display = {
                                wid: 'html',
                                refCallback: select_display,
                                data: {
                                    ionFunction: createIonFunction(() => {
                                        return `

                    Selected chemistry template: ` +
                                            molecule_type_html_render(graph.props.selected_chemistry)
                                    })
                                }
                            }
                            let chemistry_tab = {
                                wid: 'card',
                                data: {
                                    "style.padding-top": '10px',
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'component': display
                                            },
                                            {
                                                'width': '100%',
                                                'component': myChem
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    "wid": 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(async () => {
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                    hideAllModal();

                                                                    let variant = snp;
                                                                    if (variant != null) {
                                                                        await exec('baja/manchester/annotation/tile-variant.js', variant, track, graph, false)
                                                                    } else {
                                                                        graph.setMessage('Click closer to variant...');
                                                                    }

                                                                })
                                                            },

                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(chemistry_tab)

                        }, 1000)
                        return;

                    }

                    let variant = snp;
                    if (variant != null) {
                        await exec('baja/manchester/annotation/tile-variant.js', variant, track, graph, false)
                    } else {
                        graph.setMessage('Click closer to variant...');
                    }
                },
                move: () => {
                },
            },

        );

        resolve(menuList)
    })
}
