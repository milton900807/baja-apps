function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selectedTrack = null;

    exec('flexigraph/snpindel.js').then(async SnpIndel => {
        graph.addMouseMoveListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }
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
            }
        })
        graph.addMouseDownListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }
            let menuList = [
                {
                    label: 'Load SNP ID( sIDs)',
                    click: (xwc, ywc) => {
                        graph.setMessage('Enter SNP ID');
                        let export_sequence = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'input-textarea-editor',
                                                data: {
                                                    'text': '',
                                                    'showButton': false,
                                                    'title': 'IDs',
                                                    'ionHookFunction': createIonFunction((input_box) => {
                                                        v = input_box;
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Load', ionFunction: createIonFunction(async () => {

                                                                let snpids = v.getWidgetValue();
                                                                let lastone = null;
                                                                snpids = snpids.trim();
                                                                snpids = snpids.split('\n')
                                                                for (let snpid of snpids) {

                                                                    try {
                                                                        let vr = await GETJSON(`https://rest.ensembl.org/variation/human/${snpid}?content-type=application/json`)
                                                                        if (vr != null) {

                                                                            let consequence = vr['most_severe_consequence']
                                                                            let mappings = vr['mappings']
                                                                            for (let m of mappings) {
                                                                                let position = m.start;
                                                                                let strand = m.strand;
                                                                                let geno = m.allele_string.split(/[/|]/g)

                                                                                for (let c = 1; c < geno.length; c++) {
                                                                                    let g = geno[c];
                                                                                    let reference = m.ancestral_allele;
                                                                                    let as = m.allele_string;

                                                                                    if (selectedTrack == null) {
                                                                                        graph.setMessage(" Select a track")
                                                                                        return;
                                                                                    }

                                                                                    let slnp = new SnpIndel('snp', position, geno[0], g,
                                                                                        0, selectedTrack.strand);
                                                                                    lastone = slnp;

                                                                                    selectedTrack.addsnpindel(slnp);
                                                                                }
                                                                            }

                                                                        }
                                                                    } catch (exception) {

                                                                    }

                                                                }
                                                                selectedTrack.removeDuplicateAnnotations();
                                                                if (lastone) {
                                                                    graph.animateTo(selectedTrack.tgraph.X(lastone.xi - 22),
                                                                        selectedTrack.tgraph.X(lastone.xf + 22),
                                                                        selectedTrack.tgraph.Y(-2), selectedTrack.tgraph.Y(2))

                                                                }

                                                                hideAllModal();
                                                            })
                                                        },
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                hideAllModal();
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }

                        showModal(export_sequence)
                    }

                },

                {
                    label: 'Delete SNPs',
                    click: (xwc, ywc) => {

                        if (selectedTrack) {

                            if (selectedTrack.snpindels && selectedTrack.snpindels.length > 0) {

                                let deleteItem = {
                                    wid: 'card',
                                    data: {
                                        height: '600px',
                                        cards: [
                                            [
                                                {
                                                    'title': ' ', 'body': ``
                                                    ,
                                                    'width': '90%',
                                                    'component':
                                                    {
                                                        wid: 'html',
                                                        data: '<font color=red> Are you sure you want to remove all snps? </font>'
                                                    }
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Yes', ionFunction: createIonFunction(() => {

                                                                        selectedTrack.snpindels = []
                                                                        hideAllModal();

                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        hideAllModal();
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                showModal(deleteItem)

                            }
                        }

                    }
                },
                {
                    label: 'Create SNP',
                    click: async (xwc, ywc) => {

                        let panel;
                        const __nameHook = createIonFunction((editor) => {
                            panel = editor;
                        })

                        let xi = Math.floor(selectedTrack.tgraph.Xwc(xwc));
                        let xf = xi + 1;
                        let reference = selectedTrack.getSequenceRange(xi, xf);
                        showModal(
                            {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                data: {
                                    height: '800px',
                                    cards: [
                                        [

                                            {
                                                'title': '', 'body': `.
                                        `                   ,
                                                'width': '90%',
                                                'component':
                                                {

                                                    wid: 'html',
                                                    data: ` <h3> Reference allele  ${reference} </h3`
                                                }

                                            },
                                            {
                                                'title': 'Create a SNPs at this location  ', 'body': `.
                                        `                   ,
                                                'width': '90%',
                                                'component':
                                                {

                                                    wid: 'input-param-items',
                                                    refCallback: __nameHook,
                                                    data: {
                                                        'input_labels': ['ID', 'Alternate allele'],
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    let snp = panel.get('ID')
                                                                    let alt = panel.get('Alternate allele')

                                                                    let snpv = new SnpIndel('snp', xi,
                                                                        reference, alt, 0,
                                                                        selectedTrack.strand, snp);
                                                                    snpv.reference0 = reference;
                                                                    snpv.alternate0 = alt;
                                                                    selectedTrack.snpindels.push(snpv)
                                                                    await hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            })

                    }
                },
                {
                    label: 'Show/Hide SNPs',
                    click: (xwc, ywc) => {
                        start = -1;
                        end = -1;
                        let trackIndex = graph.getTrack(x, y);
                        if (trackIndex >= 0) {
                            let tr = graph.track[trackIndex];
                            tr.showSnpIndels = !tr.showSnpIndels;
                        }
                    },
                    move: () => {
                    }
                },
                {
                    label: 'Remove duplicates',
                    click: (xwc, ywc) => {
                        if (selectedTrack)
                            selectedTrack.removeDuplicateAnnotations();

                    },
                    move: () => {
                    }
                },

                {
                    label: 'Zoom to SNP',
                    click: (xwc, ywc) => {
                        let panel;
                        const __nameHook = createIonFunction((editor) => {
                            panel = editor;
                        })

                        showModal(
                            {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                data: {
                                    height: '800px',
                                    cards: [
                                        [

                                            {
                                                'title': ' ', 'body': `.
                                        `                   ,
                                                'width': '90%',
                                                'component':
                                                {

                                                    wid: 'input-param-items',
                                                    refCallback: __nameHook,
                                                    data: {
                                                        'input_labels': ['SNP ID'],
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    let snp = panel.get('SNP ID')
                                                                    console.log('debubg');
                                                                    for (let sn of selectedTrack.snpindels) {
                                                                        snp = snp.trim();
                                                                        if (sn.id.toLowerCase() === snp.toLowerCase()) {
                                                                            graph.zoomTo(selectedTrack.tgraph.X(sn.xi - 10),
                                                                                selectedTrack.tgraph.X(sn.xi + 10))

                                                                        }
                                                                    }
                                                                    await hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            })

                    },
                    move: () => {
                        log('movei running offtargets....')
                    }
                },
                {
                    label: 'Zoom to coords',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.sequence;
                        let panel;
                        const __nameHook = createIonFunction((editor) => {
                            panel = editor;
                        })

                        showModal(
                            {
                                wid: 'card',
                                componentRef: 'bottomPanel',
                                data: {
                                    height: '800px',
                                    cards: [
                                        [
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'html',
                                                    data: `Enter coordinate range `
                                                }
                                            },
                                            {
                                                'title': ' ', 'body': `.
                                        `                   ,
                                                'width': '90%',
                                                'component':
                                                {

                                                    wid: 'input-param-items',
                                                    refCallback: __nameHook,
                                                    data: {
                                                        'input_labels': ['Start', 'End'],
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    let seq = selectedTrack.getSequence();
                                                                    let start = panel.get('Start')
                                                                    let end = panel.get('End')
                                                                    start = +start;
                                                                    end = +end;
                                                                    gstart = selectedTrack.tgraph.X(start)
                                                                    gend = selectedTrack.tgraph.X(end)
                                                                    graph.zoom(gstart, gend)

                                                                    await hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            })

                    },
                    move: () => {
                        log('movei running offtargets....')
                    }
                },
            ]

            let snps = graph.getSNPs(x, y)
            if (snps && snps.length) {
                for (let snp of snps) {
                    menuList.push({
                        label:  snp.name + ':' + snp.id,
                        click: async (xwc, ywc) => {
                            exec ( 'baja/screens/menu/variant-editor-panel.js', graph, genegraph_panel_layout, selectedTrack, snp)
                        },
                        move: () => {
                            log('movei running offtargets....')
                        }

                    })
                }
            }

            if (selectedTrack)
                graph.showMenu(menuList, x, y, 300)

        })
    })

}
