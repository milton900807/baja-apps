    function (lib, folderid, graph, props) {

    return new Promise(async (resolve, reject) => {

        let molecule_type_html_render = await exec('baja/manchester/render-moltype.js')
        let Biopolymer = await exec('baja/chem/biopolymer.js')

        let display = {
            wid: 'html',
            data: { ionFunction: createIonFunction(() => { return ` Selected template: ` + molecule_type_html_render(props.selected_chemistry) }) }
        }
        let ChemistryTemplateDB = await exec('baja/chem/chem-template-db.js', lib.id)
        let selectMethod = async (v) => {
            let cdb = await new ChemistryTemplateDB();
            let dataobject = await cdb.loadChem(v);
            dataobject['name'] = v.name;
            props.selected_chemistry = dataobject;
        }

        let le = await exec('baja/math/le-distance.js')
        let Barchart = await exec('baja/bio/barchart-track.js')

        let runsequence =async (in_seq, ledistance, ops) => {
            if (ledistance == undefined) {
                ledistance = 0;
            }
            for (let t of graph.track) {
                let sp = in_seq.split('\t')
                let seq = '';
                let start = -1;
                let idv;

                if (sp && sp.length === 3) {
                    idv = sp[0]
                    seq = sp[1]
                    start = +sp[2] + 1
                }
                else
                    if (sp && sp.length > 1) {
                        start = +sp[1] + 1
                        seq = sp[0]
                    } else {
                        seq = in_seq;
                    }
                if (ops) {
                    seq = ops(seq);
                }
                let len = seq.length;
                if (start > 0) {
                    let selected_chemistry = props.selected_chemistry;
                    Biopolymer.createOligoFromTemplateUseSeqIn(selected_chemistry, t, start, seq, 0.2, idv)
                } else {

                    let sequence = t.sequence.trim();

                    for (let i = 0; i < sequence.length - len; i++) {
                        let seq_slice = sequence.substring(i, i + len);
                        if (ledistance == undefined || ledistance === 0) {

                            if (seq_slice === seq) {
                                let chemistryObject = props.selected_chemistry;
                                let bioObject = {
                                    'targetSequence': in_seq,
                                    'trackName': t.name,
                                    'startIndex': t.xi+i,
                                    'strand': t.strand,
                                    'endIndex': t.xi+i + in_seq.length,

                                    'y': (0.2),
                                }
                                let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                let ytmp = 0.15;

                                for (let _o of t.oligos) {
                                    if ((_o.xi >= compound.xi && _o.xi <= compound.xf) || (compound.xi >= _o.xi && compound.xi <= _o.xf)) {
                                        if (_o.y <= ytmp) {
                                            ytmp += 0.05;
                                        }
                                    }
                                }

                                compound.y = ytmp;

                                t.addOligo ( compound );
                            }
                        } else {
                            let distance = le(seq, seq_slice);
                            let percent = (len - distance) / len
                            if (!ledistance || ledistance < 0) {
                                ledistance = 0;
                            }

                            if (distance <= ledistance) {
                                let xcoord = t.xi + i;
                                if ( percent <= 0 ){
                                    percent = 0.00001;
                                }
                                let bc = new Barchart('' + i + ' ' + percent, xcoord, percent, 'lightGray')
                                t.plots.push(bc)
                                let chemistryObject = props.selected_chemistry;
                                let bioObject = {
                                    'targetSequence': in_seq,
                                    'trackName': t.name,
                                    'startIndex': t.xi+i,
                                    'strand': t.strand,
                                    'endIndex': t.xi+i + in_seq.length,
                                    'y': (t.tgraph.ymax - 0.2)
                                }
                                let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                t.addOligo ( compound );

                            }
                        }
                    }
                }

            }

        }

        let myChem = await exec('baja/chem/my-chem-w.js', lib.id, selectMethod, props)

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
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                await hideAllModal();
                                                let sequenceTextEditor;
                                                let descHook = createIonFunction((p) => {
                                                    sequenceTextEditor = p;
                                                });
                                                let leDistance;
                                                let mode = 'forward'

                                                let sequence_input = {
                                                    wid: 'card',
                                                    data: {
                                                        "style.padding-top": '1px',
                                                        "style.border": '1px',
                                                        cards: [
                                                            [
                                                                {
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'text-editor',
                                                                        refCallback: descHook,
                                                                        height: 800,
                                                                        data: {
                                                                            editorOptions: { language: 'text', automaticLayout: true },
                                                                            keybinding: {
                                                                                'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                                })
                                                                            },
                                                                            height: '800px'
                                                                        }
                                                                    }
                                                                },
                                                                {
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'radio-buttons',
                                                                        data: [
                                                                            {
                                                                                label: 'Forward',
                                                                                ionfunction: createIonFunction(
                                                                                    async () => {
                                                                                        mode = 'forward'
                                                                                    }
                                                                                )
                                                                            },
                                                                            {
                                                                                label: 'Reverse',
                                                                                ionfunction: createIonFunction(
                                                                                    async () => {
                                                                                        mode = 'reverse'
                                                                                    }
                                                                                )
                                                                            },
                                                                            {
                                                                                label: 'Forward complement',
                                                                                ionfunction: createIonFunction(
                                                                                    async () => {
                                                                                        mode = 'forward-complement'
                                                                                    }
                                                                                )
                                                                            },
                                                                            {
                                                                                label: 'Reverse complement',
                                                                                ionfunction: createIonFunction(
                                                                                    async () => {
                                                                                        mode = 'reverse-complement'
                                                                                    }
                                                                                )
                                                                            },
                                                                            {
                                                                                label: 'Both', ionfunction:
                                                                                    createIonFunction(async () => {
                                                                                        mode = 'both'
                                                                                    })
                                                                            }
                                                                        ]
                                                                    }

                                                                },

                                                                {
                                                                    'width': '100%',
                                                                    "style.padding-top": '4px',
                                                                    "style.border": '1px',
                                                                    'component':
                                                                    {
                                                                        'wid': 'input-textfield',
                                                                        'title': 'Enter Edit Distance Below (optional)',
                                                                        'data': {
                                                                            'blocking': false,
                                                                            'show-button': false,
                                                                            'ionHookFunction': createIonFunction((w) => {
                                                                                leDistance = w
                                                                            }),
                                                                            'ionfunction': createIonFunction((title) => {
                                                                                console.log(" title " + title);
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                                {
                                                                    'component': {
                                                                        wid: 'mt-button', data: {
                                                                            buttons: [
                                                                                {
                                                                                    label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                                        let seqlist = sequenceTextEditor.getActiveTabContent().split('\n')
                                                                                        let ledistance = leDistance.getWidgetValue();
                                                                                        ledistance = parseInt(ledistance);
                                                                                        if (!ledistance || ledistance == NaN) {
                                                                                            ledistance = 0;
                                                                                        }
                                                                                        for (let in_seq of seqlist) {
                                                                                            in_seq = in_seq.trim();
                                                                                            if (in_seq != null && in_seq.length > 0) {
                                                                                                if (mode == 'forward') {
                                                                                                    await runsequence(in_seq, ledistance);
                                                                                                } else if (mode == 'reverse') {
                                                                                                    await runsequence(in_seq, ledistance, Biopolymer.reverse);
                                                                                                }
                                                                                                else if (mode === 'forward-complement') {
                                                                                                    await runsequence(in_seq, ledistance, Biopolymer.comp);
                                                                                                }
                                                                                                else if (mode === 'reverse-complement') {
                                                                                                    console.log('debubg');
                                                                                                    await runsequence(in_seq, ledistance, Biopolymer.reverseComp);
                                                                                                } else {
                                                                                                    runsequence(in_seq);
                                                                                                    runsequence(in_seq, ledistance, Biopolymer.reverseComp);
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                        await hideAllModal();
                                                                                    })
                                                                                }]
                                                                        }
                                                                    }
                                                                }
                                                            ]]
                                                    }
                                                }

                                                showModal(sequence_input, 600, 800)
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
        resolve(chemistry_tab)

    })

}
