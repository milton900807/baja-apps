function (__sequence) {

    let editDistance = 0;
    let selected_itssues;
    let selected_genomes = [];

    let getSelectedtissues = () => {
        return selected_itssues;
    }

    exec('baja/align/align-component.js').then(async (align) => {

        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })

        let genomes = ['Homo_sapiens.GRCh38.dna.primary_assembly', 'Mus_musculus.GRCm39.dna.primary_assembly', 'Macaca_fascicularis.Macaca_fascicularis_6.0.dna.toplevel']
        let alignGraph = await align.createComponent();
        let sequence = ''
        let messagePanel;
        let platePanel = createIonFunction((m) => {
            messagePanel = m;
        })

        let reverseString = (str) => {
            return str.split("").reverse().join("");
        }

        let reverseComp = (str) => {
            let s = reverseString(str);
            let a = '';
            let index = 0;
            for (let c of s) {
                c = '' + c;

                if (c == 'A') {
                    a += 'T'
                } else if (c == 'T') {
                    a += 'A'
                } else if (c == 'G') {
                    a += 'C'
                } else if (c == 'C') {
                    a += 'G'
                }

                index++;

            }
            return a;
        }

        let run_button_panel = {
            wid: 'card',
            componentRef: 'runbutton_panel',
            data: {
                cards: [
                    [

                        {
                            'title': ' ', 'body': ``,
                            'width': '30%',
                            'component':
                            {
                                wid: 'html',
                                data: '<hr>'
                            }
                        },

                        {
                            'title': ' ', 'body': ``,
                            'width': '50%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [

                                        {
                                            label: 'Count', ionFunction: createIonFunction(async () => {
                                                sequence = panel.get('Sequence');
                                                if (!sequence || sequence.length <= 0) {
                                                    alert(' no input sequence  ')
                                                    return;
                                                }
                                                if (!sequence || sequence.length > 25) {
                                                    alert(' Sequence is too long.  < 26 ')
                                                    return;
                                                }

                                                if (selected_genomes.length === 0) {
                                                    alert(" Please select genomes ")
                                                    return;
                                                }

                                                sequence = sequence.trim();
                                                sequence = sequence.toUpperCase();

                                                let allowed_characters = '^[ACTGU]+$'
                                                const re = new RegExp(allowed_characters);
                                                let value = re.test(sequence)
                                                sequence = sequence.replaceAll('U', 'T')
                                                if (!value) {
                                                    messagePanel.setHTML('<b> Input only accepts AC[T/U]G</b>');

                                                    alert(' Input only accepts AC[T/U]G');
                                                    return;
                                                }
                                                if (messagePanel)
                                                    messagePanel.setHTML(" - - - ");

                                                await align.clear();

                                                console.log(' selected genomes ' + selected_genomes)

                                                let results = await align.execute(sequence, +editDistance, getSelectedtissues(), selected_genomes, 'count');
                                                if (results != null) {
                                                    let hits = results.length;

                                                    (async () => {
                                                        let gen = {}
                                                        for (let r of results) {
                                                            let g = r.target.genome;
                                                            if (g) {
                                                                let genv = gen[g]
                                                                if (genv >= 0) {
                                                                    gen[g] = genv + 1;
                                                                } else {
                                                                    gen[g] = 0;
                                                                }
                                                            }
                                                        }
                                                        let ms = ''
                                                        let keys = Object.keys(gen);
                                                        for (let key of keys) {
                                                            ms += key + '=' + gen[key] + '  ';
                                                        }

                                                        ms += '<br><b> Total </b> ' + hits;

                                                        messagePanel.setHTML(' ' + ms);

                                                    })();

                                                } else {
                                                    messagePanel.setHTML("---last calculation failed---");

                                                }

                                            })
                                        }, {
                                            label: 'Run', ionFunction: createIonFunction(async () => {
                                                sequence = panel.get('Sequence');

                                                if (!sequence || sequence.length <= 0) {
                                                    alert(' no input sequence  ')
                                                    return;
                                                }
                                                if (!sequence || sequence.length > 25) {
                                                    alert(' Sequence is too long.  < 26 ')
                                                    return;
                                                }
                                                if (selected_genomes.length === 0) {
                                                    alert(" Please select genomes ")
                                                    return;
                                                }

                                                sequence = sequence.trim();
                                                sequence = sequence.toUpperCase();

                                                let allowed_characters = '^[ACTGU]+$'
                                                const re = new RegExp(allowed_characters);
                                                let value = re.test(sequence)
                                                sequence = sequence.replaceAll('U', 'T')
                                                if (!value) {
                                                    messagePanel.setHTML('<b> Input only accepts AC[T/U]G</b>');

                                                    alert(' Input only accepts AC[T/U]G');
                                                    return;
                                                }
                                                if (messagePanel)
                                                    messagePanel.setHTML(" - - - ");

                                                await align.clear();

                                                console.log(' selected genomes ' + selected_genomes)

                                                let results = await align.execute(sequence, +editDistance, getSelectedtissues(), selected_genomes, 'traceback');
                                                if (results != null) {
                                                    let hits = results.length;

                                                    (async () => {
                                                        let gen = {}
                                                        for (let r of results) {
                                                            let g = r.target.genome;
                                                            if (g) {
                                                                let genv = gen[g]
                                                                if (genv >= 0) {
                                                                    gen[g] = genv + 1;
                                                                } else {
                                                                    gen[g] = 0;
                                                                }
                                                            }
                                                        }
                                                        let ms = ''
                                                        let keys = Object.keys(gen);
                                                        for (let key of keys) {
                                                            ms += key + '=' + gen[key] + '  ';
                                                        }

                                                        ms += '<br><b> Total </b> ' + hits;

                                                        messagePanel.setHTML(' ' + ms);

                                                    })();

                                                } else {
                                                    messagePanel.setHTML("---last calculation failed---");

                                                }

                                            })
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '30%',
                            'component':
                            {
                                wid: 'html',
                                refCallback: platePanel,
                                data: ''
                            }
                        },
                    ]
                ]
            }
        }

        let graph = align.graph;
        let script_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 20,
                'grid': {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Filter', ionFunction: createIonFunction(() => {
                            let filter_panel = {
                                wid: 'card',
                                componentRef: 'filter_panel',
                                data: {
                                    cards: [
                                        [

                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'radio-buttons',
                                                    data: [
                                                        {
                                                            label: 'Query sequence',
                                                            ionfunction: createIonFunction(
                                                                async () => {
                                                                }
                                                            )
                                                        },
                                                        {
                                                            label: 'Target sequence',
                                                            ionfunction: createIonFunction(
                                                                async () => {
                                                                }
                                                            )
                                                        },
                                                        {
                                                            label: 'Match',
                                                            ionfunction: createIonFunction(
                                                            )
                                                        },
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
                                                    'title': 'Filter text:',
                                                    'data': {
                                                        'blocking': false,
                                                        'show-button': false,
                                                        'ionHookFunction': createIonFunction((w) => {
                                                        }),
                                                        'ionfunction': createIonFunction((title) => {
                                                        })
                                                    }
                                                }
                                            }, {
                                                'title': ' ', 'body': ``,
                                                'width': '30%',
                                                'component':
                                                {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Run', ionFunction: createIonFunction(async () => {
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '30%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    refCallback: platePanel,
                                                    data: ''
                                                }
                                            },
                                        ]
                                    ]
                                }
                            }

                            showModal(filter_panel);

                        }),
                    },

                    {
                        x: 6, y: 0, label: 'Expression', ionFunction: createIonFunction(async () => {
                            let loc = await GETJSON( window['env']['apiUrl']+'/get-cached-tissues?sheet=B_RNA_tissue_median')
                            delete loc[0]
                            let ms = {
                                wid: 'multi-select',
                                height: '100px',
                                data: {
                                    showButton: true,
                                    list: loc, buttonFunction: createIonFunction((items) => {
                                        let t = []
                                        let ke = Object.keys(items);
                                        for (let i of ke) {
                                            let value = items[i];

                                            if (value) {
                                                t.push(i);
                                            }
                                        }
                                        selected_itssues = t;

                                        let tissues = t.join(',')

                                        messagePanel.setHTML('Selected: ' + tissues);

                                        hideAllModal();
                                    })
                                }
                            }
                            showModal(ms);

                        })
                    },

                ]
            }
        }

        let alignGraph_panel_layout = {
            wid: 'card',
            componentRef: 'alignGraph',
            data: {
                cards: [
                    [

                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['Sequence'],
                                    input_function: {
                                        'Sequence': createIonFunction((value) => {

                                        })
                                    }
                                }
                            }
                        },
                        {
                            'title': ' ',
                            'width': '30%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Reverse Complement', ionFunction: createIonFunction(async () => {
                                                sequence = panel.get('Sequence');

                                                if (!sequence || sequence.length <= 0) {
                                                    alert(' no input sequence  ')
                                                    return;
                                                }

                                                sequence.replaceAll(' ', '')
                                                sequence = sequence.toUpperCase();
                                                sequence = sequence.trim();
                                                sequence = reverseComp(sequence);
                                                panel.set('Sequence', sequence);
                                                messagePanel.setHTML(' Reverse complement complete. ');

                                            })

                                        }]
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ` `,
                            'width': '15%',
                            'component':
                            {
                                wid: 'title',
                                data: '<h4>Edit distance:</h4>'
                            }
                        },
                        {
                            'title': ' ', 'body': ` `,
                            'width': '50%',
                            'component':
                            {
                                wid: 'radio-buttons',
                                data: {
                                    'selected': "0",
                                    'buttons': [
                                        {
                                            'label': '0', ionfunction: createIon(() => {

                                                editDistance = 0;
                                            }
                                            )
                                        }, {
                                            'label': '1', ionfunction: createIon(() => {

                                                editDistance = 1;
                                            }
                                            ),
                                        },
                                        {
                                            'label': '2', ionfunction: createIon(() => {

                                                editDistance = 2;

                                            }
                                            )
                                        },

                                        {
                                            'label': '3', ionfunction: createIon(() => {

                                                editDistance = 3;

                                            }
                                            )
                                        }

                                    ],
                                }
                            }
                        },

                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component':
                            {
                                wid: 'multi-select',
                                data: {
                                    'list': genomes,
                                    'showButton': false,
                                    'itemFunction': createIonFunction(async (__selected_genomes) => {
                                        let t = []
                                        selected_genomes = []
                                        console.log('debubg');
                                        for (let k of Object.keys(__selected_genomes)) {

                                            if (__selected_genomes[k]) {
                                                t.push(k);
                                            }

                                        }

                                        selected_genomes = t;

                                    })
                                }
                            }
                        },

                        {
                            'width': '50%',
                            'component': run_button_panel
                        },
                        {
                            'width': '90%',
                            'component': script_canvas
                        },

                        {
                            'width': '100%',
                            'component': alignGraph
                        }

                    ]
                ]
            }
        }
        clear();
        showWidget(alignGraph_panel_layout)

        setTimeout(() => {

            if (panel) {
                panel.set('Sequence', __sequence)
                messagePanel.setHTML(' - ');

            }
        }, 2000)

    })
}
