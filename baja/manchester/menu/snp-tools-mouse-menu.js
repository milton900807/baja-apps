function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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
                    label: 'Remove SNPs / indels',
                    click: (xwc, ywc) => {
                        // Standard removal menu: Remove all, or Remove by filter (attributes).
                        let tr = selectedTrack;
                        if (!tr) { try { const i = graph.getTrack(xwc, ywc); if (i >= 0) tr = graph.track[i]; } catch (e) { } }
                        if (!tr) { graph.setMessage(' Select a track first. '); return; }
                        exec('baja/manchester/menu/remove-snps-menu.js', graph, genegraph_panel_layout, tr, null);
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
                {
                    label: 'Tour',
                    click: async (xwc, ywc) => {
                        const tr = selectedTrack;
                        if (!tr) { graph.setMessage(' Select a track first. '); return; }
                        const tsnps = (tr.snpindels || []).slice().sort((p, q) => (p.xi || 0) - (q.xi || 0));
                        if (!tsnps.length) { graph.setMessage(' No mutations to tour on this track. '); return; }
                        try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { }
                        // Select + zoom into one mutation (zoomToTrack is shadowed, so drive zoomRect).
                        const zoomSnp = async (s) => {
                            try { await exec('baja/manchester/menu/focus-mutation.js', graph, s, 10000); } catch (e) { }
                            try {
                                const tg = tr.tgraph;
                                const TARGET_PXPB = 6;
                                let gridW = 800;
                                try { gridW = (graph.grid && graph.grid.width) || (graph.canvas && graph.canvas.width) || 800; } catch (e) { }
                                const wpb = Math.abs((tg.X((s.xi || 0) + 1) - tg.X(s.xi || 0)) || 1) || 1;
                                const half = (wpb * gridW) / (2 * TARGET_PXPB);
                                const cw = tg.X(s.xi || 0);
                                const yA = tg.yi, yB = tg.yi + (tg.height || 0);
                                const cy = (yA + yB) / 2, span = Math.abs(yB - yA) || 0.1;
                                graph.animating = false;
                                if (graph.zoomRect) graph.zoomRect(cw - half, cw + half, cy + span * 3.6, cy - span * 2.2, 300);
                            } catch (e) { }
                            try { if (graph.wake) graph.wake(); } catch (e) { }
                        };
                        let i = 0, cancelled = false, timer = null;
                        const clearT = () => { if (timer) { clearTimeout(timer); timer = null; } };
                        const finish = () => { cancelled = true; clearT(); try { graph.showSideMenu(null); } catch (e) { } };
                        const go = async () => {
                            clearT();
                            if (cancelled) return;
                            if (i < 0) i = 0;
                            if (i >= tsnps.length) { finish(); return; }
                            const s = tsnps[i];
                            await zoomSnp(s);
                            if (cancelled) return;
                            const nm = (s.name || s.id || ('Variant ' + (i + 1)));
                            try {
                                graph.showSideMenu([
                                    { label: 'Tour  ' + (i + 1) + ' / ' + tsnps.length + ':  ' + nm, move: () => { }, click: () => { clearT(); go(); } },
                                    { label: '‹ Previous', move: () => { }, click: () => { clearT(); i = Math.max(0, i - 1); go(); } },
                                    { label: 'Next ›', move: () => { }, click: () => { clearT(); i++; go(); } },
                                    { label: '✓ Done', move: () => { }, click: () => { finish(); } },
                                ]);
                            } catch (e) { }
                            timer = setTimeout(() => { i++; go(); }, 10000);   // auto-advance
                        };
                        go();
                    },
                    move: () => { }
                },
            ]

            let snps = graph.getSNPs(x, y)
            if (snps && snps.length) {
                for (let snp of snps) {
                    menuList.push({
                        label:  snp.name + ':' + snp.id,
                        click: async (xwc, ywc) => {
                            exec ( 'baja/manchester/menu/variant-editor-panel.js', graph, genegraph_panel_layout, selectedTrack, snp)
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
