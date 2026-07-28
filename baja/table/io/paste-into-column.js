function (pt, plate, __row, __col) {
    return new Promise(async (resolve, reject) => {
        const IMAGE_OCR = "Image using OCR"
        const SEQUENCES = "Text that contains sequence data"
        const ENSEMBL_IDS = "Ensembl ids"
        const TEXT = "Text (list)"
        const ASOS = "ASO sequences"
        const GENE_SYMBOLS = "Gene Symbols"
        const RS_MUTATIONS = "SNP ids (dbSNP rs-numbers)"
        const COMPOUNDS = 'Compound IDs'
        const CQ = 'Floating point values'
        const GROUP_VALUES = 'GROUP + Position'

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
                                        listItems: [ENSEMBL_IDS, TEXT, CQ, ASOS],
                                        button_function: createIonFunction(async (items) => {
                                            selected = items[0]
                                            console.log('debubg');
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

                                                            };
                                                        } else if (type === 'text/plain') {
                                                        }
                                                    }
                                                }
                                            }

                                            else if (selected === TEXT) {
                                                let paste_sequences_panel = await exec('baja/plate/data/paste-string-values-plate.js', pt, plate, __row, __col)
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paste_sequences_panel);
                                            }

                                            else if (selected === CQ) {
                                                let paste_sequences_panel = await exec('baja/plate/data/paste-floats-values-plate-track.js', pt, plate, __row, __col)
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paste_sequences_panel);
                                            }
                                            else if (selected === ASOS) {

                                            } else if (selected === GENE_SYMBOLS) {

                                            }
                                            else if (selected === ENSEMBL_IDS) {

                                            } else if ( selected === GROUP_VALUES ){

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
                                                    CurrentLayout.reset('mainPanel');

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
