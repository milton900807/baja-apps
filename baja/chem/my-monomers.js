function (libid) {

    exec('baja/chem/monomers.js', libid).then(async (_monomers) => {

        let molPanel;
        let molPanelMethod = createIonFunction((rf) => {
            molPanel = rf;
        })

        let editor;
        let editorMethod = createIonFunction((rf) => {
            editor = rf;
        })

        let export_sequence = {
            wid: 'card',
            data: {
                height: '800px',
                width: 800,
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mol-editor',
                                data: {
                                    monomers: _monomers,
                                },
                                refCallback: molPanelMethod
                            }
                        }
                    ],

                    [

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Save as new monomer', ionFunction: createIonFunction(async () => {
                                                hideAllModal();
                                                if (molPanel != null) {
                                                    let mol = Object.assign(new Object(), molPanel.monomer_manager.selectedMonomer);
                                                    showModal(
                                                        {
                                                            wid: 'card',
                                                            data: {
                                                                height: '800px',
                                                                width: 800,
                                                                cards: [
                                                                    [
                                                                        {
                                                                            'title': '',
                                                                            'width': '100%',
                                                                            'component': {
                                                                                wid: 'radio-buttons',
                                                                                data: [
                                                                                    {
                                                                                        label: 'Backbone',
                                                                                        ionfunction: createIonFunction(
                                                                                            () => {
                                                                                                mol['monomerType'] = 'Backbone'

                                                                                            }
                                                                                        )
                                                                                    },
                                                                                    {
                                                                                        label: 'Branch',
                                                                                        ionfunction: createIonFunction(
                                                                                            () => {
                                                                                                mol['monomerType'] = 'Branch'

                                                                                            }
                                                                                        )
                                                                                    },
                                                                                    {
                                                                                        label: 'Conjugate',
                                                                                        ionfunction: createIonFunction(
                                                                                            () => {
                                                                                                mol['monomerType'] = 'Conjugate'

                                                                                            }
                                                                                        )
                                                                                    },
                                                                                ]
                                                                            }
                                                                        }
                                                                    ]
                                                                    ,
                                                                    [
                                                                        {
                                                                            'title': '',
                                                                            'width': '100%',

                                                                            'component':
                                                                            {
                                                                                wid: 'input-param-items',
                                                                                data: {
                                                                                    input_labels: ['Author email', 'Monomer ID', 'Monomer Name'],
                                                                                    buttons: [{
                                                                                        'label': 'Save', 'function': createIonFunction((button_label, input_params) => {
                                                                                            let author = input_params['Author email']
                                                                                            if (mol === undefined || mol === null) {
                                                                                                mol = {
                                                                                                    "monomerType": "Backbone",
                                                                                                    "symbol": "asdf",
                                                                                                    "rgroups": [
                                                                                                    ],
                                                                                                    "molfile": "",
                                                                                                    "smiles": "",
                                                                                                    "author": "",
                                                                                                    "name": "",
                                                                                                    "naturalAnalog": "",
                                                                                                    "polymerType": "",
                                                                                                    "id": 990,
                                                                                                    "createDate": new Date().getDate()
                                                                                                }
                                                                                            }
                                                                                            mol['author'] = author;
                                                                                            let id = input_params['Monomer ID']
                                                                                            let monomer_name = input_params['Monomer Name']
                                                                                            mol['name'] = monomer_name
                                                                                            mol['symbol'] = id
                                                                                            mol['molfile'] = molPanel.monomer_manager.structure_viewer.getMolfileForCurrentStructure();
                                                                                            mol['smiles'] = molPanel.monomer_manager.structure_viewer.getSmiles();

                                                                                            hideAllModal();

                                                                                            let jsonview = {

                                                                                                wid: 'json',
                                                                                                refCallback: editorMethod,
                                                                                                data: JSON.stringify(mol)
                                                                                            }

                                                                                            showModal(
                                                                                                {
                                                                                                    wid: 'card',
                                                                                                    data: {
                                                                                                        height: '800px',
                                                                                                        width: 800,
                                                                                                        cards: [
                                                                                                            [
                                                                                                                {
                                                                                                                    'title': '',
                                                                                                                    'width': '100%',
                                                                                                                    'component': jsonview
                                                                                                                }
                                                                                                            ]
                                                                                                            ,
                                                                                                            [

                                                                                                                {
                                                                                                                    'title': '',
                                                                                                                    'width': '100%',
                                                                                                                    'component': {
                                                                                                                        wid: 'mt-button', data: {
                                                                                                                            buttons: [
                                                                                                                                {
                                                                                                                                    label: 'Save', ionFunction: createIonFunction(() => {
                                                                                                                                        let str = editor.data;
                                                                                                                                        mol = JSON.parse(str)
                                                                                                                                        _monomers['monomers'].push(mol);
                                                                                                                                        molPanel.mdb = _monomers;

                                                                                                                                        hideAllModal();
                                                                                                                                    })
                                                                                                                                },
                                                                                                                                {
                                                                                                                                    label: 'cancel', ionFunction: createIonFunction(() => {
                                                                                                                                        hideAllModal();
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

                                                                                            )

                                                                                            hideAllModal();

                                                                                        })
                                                                                    }]
                                                                                }

                                                                            }
                                                                        }
                                                                    ],

                                                                ]
                                                            }
                                                        }

                                                    )

                                                }
                                            })
                                        },
                                        {
                                            label: 'Save library', ionFunction: createIonFunction(async () => {

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
                                                                        data: '<font color=red> Are you sure you want to remove this compound? </font>'
                                                                    }
                                                                },
                                                                {
                                                                    'title': '',
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'mt-button', data: {
                                                                            buttons: [
                                                                                {
                                                                                    label: 'Yes', ionFunction: createIonFunction(async () => {
                                                                                        let MSGraph = await exec('lib/msgraph.js')
                                                                                        let monomer_folder_path = `/drives/${libid}/root:/bajabio-xfiles/monomers`
                                                                                        let config = {
                                                                                            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                                                                                                'Sites.ReadWrite.All',
                                                                                                'https://graph.microsoft.com/Sites.ReadWrite.All']
                                                                                        }
                                                                                        let client = await MSGraph.getClient(config);
                                                                                        let file = await client.api(monomer_folder_path).get();
                                                                                        monomer_folder_path = `/drives/${libid}/items/${file.id}`

                                                                                        try {
                                                                                            var blob = new Blob([JSON.stringify(_monomers, (key, value) => {
                                                                                                console.log(" key " + key);
                                                                                                if (key == "img") {
                                                                                                    return 'b64';
                                                                                                }
                                                                                                else if (key == 'svgs') {
                                                                                                    return value;
                                                                                                }
                                                                                                else if (key == 'canvas') {
                                                                                                    return null;
                                                                                                }
                                                                                                else {
                                                                                                    return value;
                                                                                                }
                                                                                            })], { type: 'application/json' });

                                                                                            let progressBar;
                                                                                            let w = {
                                                                                                wid: 'progress',
                                                                                                class: 'blank',
                                                                                                componentRef: 'progressBar',
                                                                                                data: {
                                                                                                    'progress': 10,
                                                                                                    'progressBar': createIonFunction((progessBar) => {
                                                                                                        progressBar = progessBar;
                                                                                                    })
                                                                                                }
                                                                                            }
                                                                                            showModal(w);

                                                                                            let saveStatusListener = (cstart, cend, total, fileid) => {
                                                                                                let progress = cstart / total * 100;
                                                                                                console.log(" save progress.... " + progress)
                                                                                                progressBar(progress);
                                                                                                if (progress >= 100) {
                                                                                                    hideAllModal();
                                                                                                }

                                                                                            }

                                                                                            let response = await MSGraph.saveLG(blob, 'active-monomers.json', monomer_folder_path, saveStatusListener)
                                                                                            hideAllModal();

                                                                                        } catch (exception) {
                                                                                            alert(exception.toString())
                                                                                            showModal({
                                                                                                wid: 'json',
                                                                                                data: JSON.stringify(exception)
                                                                                            })
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
                                                showModal(deleteItem)

                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        showWidget(export_sequence)
    })

}
