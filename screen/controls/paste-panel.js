function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        const IMAGE_OCR = "Image using OCR"
        const SEQUENCES = "Text that contains sequence data"
        const ENSEMBL_IDS = "Ensembl ids"
        const TEXT = "Raw text data"
        const ASOS = "ASO sequences"
        const GENE_SYMBOLS = "Gene Symbols"
        const RS_MUTATIONS = "SNP ids (dbSNP rs-numbers)"

        try {
            let name_panel = {
                wid: 'card',
                data: {
                    cards: [
                        [
                            {
                                'width': '100%',
                                "style.padding-top": '4px',
                                "style.border": '1px',
                                'component':
                                {
                                    'wid': 'html',
                                    'data': ` <h2 color='red'> Select an option  below  </h2>`
                                }
                            },
                            {

                                'width': '100%',
                                'component':
                                {
                                    "wid": 'selection-list',
                                    data: {
                                        single_selection: true,
                                        showButton: false,
                                        listItems: [GENE_SYMBOLS, IMAGE_OCR, ENSEMBL_IDS, TEXT, ASOS, RS_MUTATIONS],
                                        button_function: createIonFunction(async (items) => {
                                            selected = items[0]
                                            if (selected === IMAGE_OCR) {
                                                const items = await navigator.clipboard.read();
                                                for (const item of items) {
                                                    for (const type of item.types) {
                                                        const blob = await item.getType(type);
                                                        if (type.startsWith('image/')) {
                                                            const imageUrl = URL.createObjectURL(blob);
                                                            const image = new Image();
                                                            image.src = imageUrl;
                                                            image.onload = () => {
                                                                exec('baja/util/ocr-to-table.js', image, graph, genegraph_panel_layout)
                                                            };
                                                        } else if (type === 'text/plain') {
                                                        }
                                                    }
                                                }
                                            } else if (selected === TEXT) {

                                                await exec('baja/util/paste-panel.js', '', graph, genegraph_panel_layout, eeditor_state)

                                            } else if ( selected === RS_MUTATIONS ){
                                                let paste_sequences_panel = await exec('baja/chem/paste-rs-numbers-to-tracks.js', graph, genegraph_panel_layout)
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paste_sequences_panel);

                                            }
                                            else if (selected === ASOS) {
                                                graph.setMessage('...')
                                                let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph, genegraph_panel_layout)
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paste_sequences_panel);

                                            } else if (selected === GENE_SYMBOLS) {
                                                let paste_sequences_panel = await exec('baja/chem/paste-gene-symbols-to-tracks.js', graph, genegraph_panel_layout)
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paste_sequences_panel);
                                            }
                                            else if (selected === ENSEMBL_IDS) {

                                                let paste_sequences_panel = await exec('baja/chem/paste-ensemble-ids-to-tracks.js', graph, genegraph_panel_layout)
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paste_sequences_panel);

                                            }

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
                                                label: 'Close', ionFunction: createIonFunction(async () => {
                                                    hideAllModal();
                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                })
                                            },
                                        ]
                                    }
                                }
                            }

                        ]
                    ]
                }
            }
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', name_panel);

        } catch (error) {
            console.error('Failed to read clipboard contents:', error);
        }

        return resolve()

    })
}
