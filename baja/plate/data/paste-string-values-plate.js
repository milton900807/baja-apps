function (pt, plate, __row, __col) {
    return new Promise(async (resolve, reject) => {

        class TableProcessor {

            transposeTable(data, delimiter) {

                let rows = data.trim().split('\n').map(row => row.split(delimiter));

                let transposed = this.transposeArray(rows);

                let transposedString = transposed.map(row => row.join(delimiter)).join('\n');

                return transposedString;
            }
            determineDelimiter(data) {
                const commonDelimiters = [',', ';', '\t', ' ', '|'];
                const lines = data.trim().split('\n');

                let delimiterCounts = {};

                commonDelimiters.forEach(delimiter => {
                    delimiterCounts[delimiter] = 0;
                });

                lines.forEach(line => {
                    commonDelimiters.forEach(delimiter => {
                        const count = (line.split(delimiter).length - 1);
                        delimiterCounts[delimiter] += count;
                    });
                });

                let likelyDelimiter = null;
                let maxCount = 0;

                for (let delimiter in delimiterCounts) {
                    if (delimiterCounts[delimiter] > maxCount) {
                        maxCount = delimiterCounts[delimiter];
                        likelyDelimiter = delimiter;
                    }
                }

                return likelyDelimiter;
            }

            transposeArray(array) {

                let maxColumns = Math.max(...array.map(row => row.length));

                let transposed = [];

                for (let col = 0; col < maxColumns; col++) {
                    let newRow = [];
                    for (let row = 0; row < array.length; row++) {

                        newRow.push(array[row][col] !== undefined ? array[row][col] : '');
                    }
                    transposed.push(newRow);
                }

                return transposed;
            }
        }

        let sequenceTextEditor;

        let descHook = createIonFunction((p) => {
            sequenceTextEditor = p;

        });
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
                                wid: 'menu',
                                data: {
                                    menus: [

                                        {
                                            'label': 'Operations', 'items': [
                                                {
                                                    'label': 'Transpose', 'ionfunction': createIonFunction(() => {
                                                        let data = sequenceTextEditor.getActiveTabContent();
                                                        const tableProcessor = new TableProcessor();
                                                        const delimiter = tableProcessor.determineDelimiter(data);
                                                        const transposedTable = tableProcessor.transposeTable(data, delimiter);
                                                        sequenceTextEditor.setContent(transposedTable)
                                                    })
                                                },
                                            ]
                                        },

                                    ]
                                }
                            }
                        },

                        {
                            'component': {
                                wid: 'text-editor',
                                refCallback: descHook,
                                height: "100%",
                                data: {
                                    showButton: false,
                                    editorOptions: { language: 'text', automaticLayout: true },
                                    onDidFocusEditorWidget: createIonFunction(() => {
                                        if (sequenceTextEditor) {
                                        }
                                    }),
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {

                                        })
                                    },
                                }
                            }
                        },
                        {
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Load values', ionFunction: createIonFunction(async () => {
                                                let p = new Promise(async (resolve, reject) => {

                                                    let seqlist = sequenceTextEditor.getActiveTabContent().split('\n');
                                                    plate.setValuesInOrderAndOverwrite(seqlist, __row, __col)
                                                    pt.zoomintoplate(plate)
                                                    setTimeout(() => {
                                                        CurrentLayout.reset("mainPanel")

                                                    }, 1000)
                                                    resolve();
                                                })
                                                p.then(r => {
                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')

                                                })

                                            })
                                        },
                                        {
                                            label: 'Close', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.reset("mainPanel")

                                            })
                                        }

                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        resolve(sequence_input)
    })

}
