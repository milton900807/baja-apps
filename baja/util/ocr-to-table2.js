function (imageBuffer, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let linecount = 1;

        const APPEND_PERCENT_INHIBITIONS = "Append %Inhibition"
        const APPEND_IDS = "Append IDs"

        const SEQUENCE_LIST = 'Sequence list'
        const ENSEMBL_IDS = 'list of ids'
        const SEQUENCE_ID_TABLE = 'Sequence | ID'
        const SEQUENCE_LIST_INHIB = 'ID | Sequence | %inhibition'
        const ASOS_FROM_TEXT = 'Extract all unique oligonucleotide sequences (10-25nt)'
        const SIMPLE_IONIS_CHEM = 'Single-letter chemistry'
        const RAW_TEXT = 'Extract text'
        const APPEND_INHIBITION_DATA = 'Append Inhibition values (in order)'
        function parseTableWithTitles(arrayOfStrings) {
            const titles = arrayOfStrings[0].split(/\s+/);
            const rows = [];
            for (let i = 1; i < arrayOfStrings.length; i++) {
                const rowString = arrayOfStrings[i];
                const columns = rowString.split(/\s+/);
                let rowObject = {};
                titles.forEach((title, index) => {
                    rowObject[title] = columns[index] || '';
                });
                rows.push(rowObject);
            }
            return {
                titles,
                rows
            };
        }

        function parseDNASequencesToArray(text) {
            const regex = /([ATGCatgc]+) \(SEQ ID NO: (\d+)\)/g;
            let matches;
            const sequences = [];
            while ((matches = regex.exec(text)) !== null) {
                sequences.push({
                    sequence: matches[1],
                    id: matches[2]
                });
            }
            return sequences;
        }

        function parseTable_SEQUENCE_ID_TABLE(arrayOfStrings) {
            const titles = ['Sequence', 'ID']
            const rows = [];
            for (let i = 1; i < arrayOfStrings.length; i++) {
                const rowString = arrayOfStrings[i];
                const columns = rowString.split(/\s+/);
                let rowObject = {};
                titles.forEach((title, index) => {
                    rowObject[title] = columns[index] || '';
                });
                rows.push(rowObject);
            }
            return {
                titles,
                rows
            };
        }
        let jsonPanel = null;
        let cb = createIonFunction((___panel) => {
            jsonPanel = ___panel;
        })

        function extractAndConvertSequences(syntax) {
            let modifiedSyntax = syntax.replace(/mc/g, 'C');
            modifiedSyntax = syntax.replace(/m/g, '');
            const nucleotideMap = {
                'A': 'A',
                'C': 'C',
                'G': 'G',
                'T': 'T',
            };
            let dnaSequence = '';
            for (let i = 0; i < modifiedSyntax.length; i++) {
                let nucleotide = modifiedSyntax[i];
                if (nucleotideMap.hasOwnProperty(nucleotide)) {
                    dnaSequence += nucleotideMap[nucleotide];
                }
            }
            return dnaSequence;
        }

        function concatenateStrings(aggregate, array) {
            const result = [];
            for (let i = 0; i < array.length; i += aggregate) {
                let concatenatedString = '';

                for (let j = i; j < i + aggregate && j < array.length; j++) {
                    concatenatedString += array[j];
                }
                result.push(concatenatedString);
            }

            return result;
        }

        function extractDNASequencesWithLineCount(sequences, linecount) {
            const nucleotideRegex = /[ACGT]/;
            sequences = sequences.filter(string => nucleotideRegex.test(string));

            linecount = parseInt(linecount)
            function extractNucleotides(sequence) {
                sequence = sequence.replace(/mc/g, 'C');
                sequence = sequence.replace(/c/g, 'C');
                const nucleotidePattern = /[A-Z]/g;
                let nucleotides = sequence.match(nucleotidePattern) || [];
                return nucleotides.join('');
            }
            let groupedSequences = [];
            for (let i = 0; i < sequences.length; i += 1) {
                i = parseInt(i);
                groupedSequences.push(sequences.slice(i, i + 1).join(' '));
            }
            let nucs = groupedSequences.map(extractNucleotides);
            return concatenateStrings(linecount, nucs)
        }

        function parseIntegersFromText(text) {
            const regex = /-?\b\d+\b/g;
            const matches = text.match(regex);
            if (!matches) {
                return [];
            }
            const integers = matches.map(num => parseInt(num, 10));
            return integers;
        }

        function appendColumnToStringTable(tableString, columnData) {
            const rows = tableString.split('\n');
            console.log('debubg');
            const updatedRows = rows.map((row, index) => {

                if (index === 0) return row;

                const columnValue = columnData[index - 1];

                if (columnValue !== undefined && /^\d+$/.test(columnValue)) {
                    return `${row}\t${columnValue}`;
                } else {
                    return row;
                }
            });

            const updatedTableString = updatedRows.join('\n');
            return updatedTableString;
        }

        function performOCRAppend(imageBuffer, type) {
            Tesseract.recognize(imageBuffer, 'eng', {
            }).then(({ data: { text } }) => {
                if (type === APPEND_PERCENT_INHIBITIONS) {
                    console.log(" text " + text);
                    const lines = text.split('\n').filter(line => line.trim());
                    jsonPanel.data = appendColumnToStringTable(jsonPanel.data, lines);
                }
            }).catch(error => {
                console.error(error);
            });
        }
        function moveColumnUp(tableString, columnIndex) {

            const rows = tableString.split('\n');

            if (rows.length < 2 || columnIndex < 0) {
                console.error("Invalid table structure or column index.");
                return tableString;
            }

            const modifiedRows = rows.map((row, rowIndex) => {
                const columns = row.split('\t');

                if (columnIndex >= columns.length) {
                    console.error("Column index out of range for row " + rowIndex);
                    return row;
                }

                if (rowIndex === 1) {
                    const temp = columns[columnIndex];
                    columns[columnIndex] = rows[0].split('\t')[columnIndex];
                    rows[0] = rows[0].split('\t').map((col, idx) => idx === columnIndex ? temp : col).join('\t');
                }

                return columns.join('\t');
            });

            const updatedTableString = modifiedRows.join('\n');

            return updatedTableString;
        }

        function removeColumn(text, columnIndex) {
            const lines = text.split('\n');
            const linesWithoutColumn = lines.map(line => {
                const columns = line.split(/\s+/);
                columns.splice(columnIndex - 1, 1);
                return columns.join(' ');
            });
            return linesWithoutColumn.join('\n');
        }

        function performOCR(imageBuffer, type) {

            let running_panel = {
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
                                    'data': ` <h2 color='red'> Running OCR...stand by!  </h2>`
                                }
                            }
                        ]
                    ]
                }
            }
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', running_panel);

            Tesseract.recognize(imageBuffer, 'eng', {
            }).then(({ data: { text } }) => {
                let _text = text;
                if (type === SEQUENCE_ID_TABLE) {
                    const lines = text.split('\n').filter(line => line.trim());
                    let table = parseTable_SEQUENCE_ID_TABLE(lines);
                    _text = (JSON.stringify(table))
                } else if (type === ASOS_FROM_TEXT) {
                    jsonPanel.data = JSON.stringify(extractAndConvertSequences(text))
                } else if (type == SIMPLE_IONIS_CHEM) {
                    let v = parseIntegersFromText(text);
                    let d = jsonPanel.data;
                    let lines = d.split('\n')
                    let i = 0;
                    let nlines = []
                    for (let l of lines) {
                        if (i < v.length && v[i] != null)
                            l += ' ' + v[i++];
                        nlines.push(l);
                    }
                    _text = nlines.toString();

                } else if (type == APPEND_INHIBITION_DATA) {

                    let lines = text.split('\n').filter(line => line.trim());
                    lines = lines.filter(item => item !== "");
                    console.log('debubg');
                    _text = JSON.stringify(extractDNASequencesWithLineCount(lines, linecount))

                } else if (type == SEQUENCE_LIST) {

                    _text = text;

                }
                else {
                    _text = text;
                }

                setTimeout(() => {

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
                                            'data': ` <h2 color='red'> Select an image type below  </h2>`
                                        }
                                    },
                                    {

                                        'width': '100%',
                                        'component':
                                        {
                                            wid: 'json',
                                            refCallback: cb,
                                            data: _text
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
                                                listItems: [APPEND_PERCENT_INHIBITIONS, APPEND_IDS],
                                                button_function: createIonFunction(async (items) => {
                                                    selected = items[0]
                                                    if (selected === APPEND_PERCENT_INHIBITIONS) {
                                                        const imgs = await navigator.clipboard.read();
                                                        for (let item of imgs) {
                                                            console.log('debubg');
                                                            let blob = await item.getType("image/png")
                                                            if (blob) {
                                                                var url = (window.URL || window.webkitURL).createObjectURL(blob);
                                                                var img = new Image();
                                                                img.onload = function (e) {
                                                                    performOCRAppend(img, selected);
                                                                };
                                                                img.src = url;
                                                            }
                                                        }
                                                    } else if (selected === APPEND_IDS) {

                                                    }

                                                })
                                            }
                                        }
                                    },
                                    {
                                        'title': ' ', 'body': ``,
                                        'width': '100%',
                                        'component':
                                        {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: ' Map  sequence list ', ionFunction: createIonFunction(async () => {

                                                            try {
                                                                let list = JSON.parse(jsonPanel.data);
                                                                await exec('screen/io/map-sequences2.js', list, graph, genegraph_panel_layout)
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            } catch (exception) {

                                                                let list = jsonPanel.data;
                                                                await exec('screen/io/map-sequences2.js', list, graph, genegraph_panel_layout)
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            }
                                                        })
                                                    },
                                                    {
                                                        label: ' Append  ', ionFunction: createIonFunction(async () => {

                                                            jsonPanel.data = JSON.stringify(parseDNASequencesToArray(jsonPanel.data))

                                                        })
                                                    },
                                                    {
                                                        label: 'Remove Column ', ionFunction: createIonFunction(async () => {
                                                            let va = await prompt("Column number", ["Column number"], { "Column number": 1 }, 300, 300)
                                                            let m = va['Column number']
                                                            if (m === null) {
                                                                return;
                                                            } else {
                                                                let col = parseInt(m);
                                                                jsonPanel.data = removeColumn(jsonPanel.data, col)
                                                            }
                                                            showModal(va);

                                                        })
                                                    },

                                                    {
                                                        label: 'Delete char', ionFunction: createIonFunction(async () => {
                                                            let va = await prompt("Char", ["Char"], { "Char": '|' }, 300, 300)
                                                            let m = va['Char']
                                                            if (m === null) {
                                                                return;
                                                            } else {
                                                                let col = (m.trim());
                                                                function removeSpecificCharacter(str, charToRemove) {
                                                                    const regex = new RegExp(charToRemove, 'g');
                                                                    return str.replace(regex, '');
                                                                }
                                                                jsonPanel.data = removeSpecificCharacter(jsonPanel.data, col)
                                                            }
                                                            showModal(va);

                                                        })
                                                    },
                                                    {
                                                        label: 'Move Column Up', ionFunction: createIonFunction(async () => {
                                                            let va = await prompt("Column number", ["Column number"], { "Column number": 1 }, 300, 300)
                                                            let m = va['Column number']
                                                            if (m === null) {
                                                                return;
                                                            } else {
                                                                let col = parseInt(m);
                                                                jsonPanel.data = moveColumnUp(jsonPanel.data, col)
                                                            }
                                                            showModal(va);

                                                        })
                                                    },

                                                    {
                                                        label: 'Close', ionFunction: createIonFunction(async () => {
                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            e.paste_panel = true;
                                                        })
                                                    },

                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
                                            data: ''
                                        }
                                    },
                                ]
                            ]
                        }
                    }
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', name_panel);

                    setTimeout(() => {
                        jsonPanel.format();

                    }, 1000)

                }, 1000)

            }).catch(error => {
                console.error(error);
            });
        }

        let selected = 'Sequence list'

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
                                'data': ` <h2 color='red'> Select an image type below  </h2>`
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
                                    listItems: [SEQUENCE_LIST, SEQUENCE_ID_TABLE, ASOS_FROM_TEXT, APPEND_INHIBITION_DATA, RAW_TEXT, SIMPLE_IONIS_CHEM],
                                    button_function: createIonFunction(async (items) => {
                                        selected = items[0]
                                        console.log('debubg');
                                        if (selected === SIMPLE_IONIS_CHEM) {
                                            let va = await prompt("Lines", ["Lines"], { "Lines": linecount }, 300, 300)
                                            linecount = va['Lines']
                                        } else if (selected === APPEND_INHIBITION_DATA) {
                                            performOCR(imageBuffer, selected);

                                        }
                                        else if (selected === RAW_TEXT) {
                                            performOCR(imageBuffer, selected);

                                        } else if (selected === SEQUENCE_LIST) {
                                            jsonPanel.data = ' running ocr.... '
                                            performOCR(imageBuffer, selected);

                                        }

                                    })
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Paste in Image OCR', ionFunction: createIonFunction(async () => {

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
                                                                            'data': ` <h2 color='red'> Select an image type below  </h2>`
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
                                                                                listItems: [ENSEMBL_IDS, TEXT],
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

                                                                                                        jsonPanel.data = 'Running OCR on type ' + selected;
                                                                                                        performOCR(imageBuffer, selected);
                                                                                                    };
                                                                                                } else if (type === 'text/plain') {
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                    else if (selected === ENSEMBL_IDS) {
                                                                                        try {
                                                                                            console.log('debubg');
                                                                                            const s = await navigator.clipboard.readText();
                                                                                            if (hasMultipleENSTWords(s.trim())) {
                                                                                                let t = parseENSTWords(s.trim());
                                                                                                let index = 0;
                                                                                                for (let idv of t) {
                                                                                                    graph.add(idv.trim(), 10, 10 + index + 1);
                                                                                                    index++;
                                                                                                }
                                                                                            } else {
                                                                                                graph.add(s.trim(), 10, 10)
                                                                                            }

                                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                                        } catch (error) {
                                                                                            console.error('Error simulating paste event:', error);
                                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                                        }
                                                                                    }
                                                                                    else {

                                                                                    }

                                                                                })
                                                                            }
                                                                        }
                                                                    },
                                                                ]
                                                            ]
                                                        }
                                                    }
                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', name_panel);

                                                } catch (error) {
                                                    console.error('Failed to read clipboard contents:', error);
                                                }

                                            })
                                        }
                                    ]
                                }
                            }
                        },

                        {

                            'width': '100%',
                            'component':
                            {
                                wid: 'json',
                                refCallback: cb,
                                data: '...OCR... stand by!'
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: ' Map  sequence list ', ionFunction: createIonFunction(async () => {

                                                let list = JSON.parse(jsonPanel.data);
                                                await exec('screen/io/map-sequences2.js', list, graph, genegraph_panel_layout)

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        },
                                        {
                                            label: ' Create track ', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        },

                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
                                data: ''
                            }
                        },
                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', name_panel);

        resolve();

    })

}
