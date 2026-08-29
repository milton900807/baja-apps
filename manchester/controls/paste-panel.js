function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        const IMAGE_OCR = "Image using OCR"
        const IMAGE_MUTATIONS = "Parse mutations from image"
        const SEQUENCES = "Text that contains sequence data"
        const ENSEMBL_IDS = "Ensembl ids"
        const TEXT = "Raw text data"
        const ASOS = "ASO sequences"
        const GENE_SYMBOLS = "Gene Symbols"
        const RS_MUTATIONS = "SNP ids (dbSNP rs-numbers)"

        // Read the first image on the clipboard, run it through the file extractor (genes /
        // mutations / ASOs) and load the result as annotated tracks — the SAME pipeline the file
        // uploader uses. Triggered explicitly from the menu (no longer on every document paste).
        const parseMutationsFromImage = async () => {
            graph.setMessage(' Reading the pasted image — extracting genes & mutations… ')
            let blob = null
            try {
                const clip = await navigator.clipboard.read()
                for (const item of clip) {
                    for (const type of item.types) {
                        if (('' + type).startsWith('image/')) { blob = await item.getType(type); break }
                    }
                    if (blob) break
                }
            } catch (e) {
                graph.setMessage(' Could not read the clipboard: ' + (e && e.message ? e.message : e) + '. Copy an image first, then choose this option. ')
                return
            }
            if (!blob) { graph.setMessage(' No image found on the clipboard — copy an image (e.g. a genetics table), then choose this option. '); return }

            let b64 = ''
            try {
                const dataUrl = await new Promise((res, rej) => {
                    const fr = new FileReader()
                    fr.onload = () => res(fr.result)
                    fr.onerror = () => rej(fr.error || new Error('read error'))
                    fr.readAsDataURL(blob)
                })
                const s = '' + dataUrl, comma = s.indexOf(',')
                b64 = comma >= 0 ? s.slice(comma + 1) : ''
            } catch (e) { }
            if (!b64) { graph.setMessage(' Could not read the pasted image. '); return }
            const mime = blob.type || 'image/png'

            let entities = null
            try {
                const em = new EngineMonitor(() => { })
                entities = await exec('/py/sequence/extract-entities-file.py', em, b64, mime, 'pasted-image.png')
            } catch (e) {
                graph.setMessage(' Extraction failed: ' + (e && e.message ? e.message : e)); return
            }
            const hits = entities && (((entities.genes || []).length) || ((entities.mutations || []).length) || ((entities.asos || []).length))
            if (!hits) { graph.setMessage(' No genetic information found in the pasted image. '); return }

            // Back to the gene-graph canvas, then load + map (creates tracks with annotated mutations).
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout)
            try { await exec('baja/manchester/menu/text-extract.js', graph, genegraph_panel_layout, null, entities) }
            catch (e) { graph.setMessage(' Mapping failed: ' + (e && e.message ? e.message : e)) }
        }

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
                                        listItems: [GENE_SYMBOLS, IMAGE_OCR, IMAGE_MUTATIONS, ENSEMBL_IDS, TEXT, ASOS, RS_MUTATIONS],
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
                                            } else if (selected === IMAGE_MUTATIONS) {
                                                await parseMutationsFromImage()
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
