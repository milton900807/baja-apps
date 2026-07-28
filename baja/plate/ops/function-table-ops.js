function (pt, function_table) {

    let editor;
    let innerComponentCallback = createIon((_panel) => {
        editor = _panel;
        if (editor) {
            editor.setContent('')
        }
    })
    let editor2;
    let innerComponentCallback2 = createIon((_panel) => {
        editor2 = _panel;
    })

    function isArrayofArrays(variable) {
        return Array.isArray(variable) && variable.every(Array.isArray);
    }

    function arrayOfArraysToTable(arr) {
        if (!Array.isArray(arr) || !arr.every(Array.isArray)) {
            throw new Error('Input must be an array of arrays');
        }

        const maxRows = Math.max(...arr.map(innerArr => innerArr.length));

        let table = '';

        for (let row = 0; row < maxRows; row++) {
            let rowString = '';

            for (let col = 0; col < arr.length; col++) {
                const value = arr[col][row] !== undefined ? arr[col][row] : '';
                rowString += value + '\t';
            }

            table += rowString.trim() + '\n';
        }

        return table;
    }

    let c1 = {
        wid: 'card',
        data: {
            cards: [
                [

                    {
                        'width': '100%',
                        'component':
                        {
                            wid: 'text-editor',
                            refCallback: innerComponentCallback,
                            componentRef: 'bottomPanel',
                            data: {
                                height: '200px',
                                editorOptions: { language: 'bajabio', automaticLayout: true },
                                objects: pt.root,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                                    })
                                },
                            }
                        }
                    },

                    {
                        'title': null, 'body': `      `,
                        'width': '100%',
                        'component':
                        {
                            wid: 'button',
                            componentRef: 'bottomPanel2',
                            data: [
                                {
                                    'label': 'Run', ionfunction: createIonFunction(async () => {
                                        let activeContent = editor.getActiveTabContent();
                                        let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), pt);
                                        if (isArrayofArrays(v)) {
                                            let _tab = arrayOfArraysToTable(v);
                                            for (let r of v) {
                                                let f = {
                                                    expression: r.join('\n').trim()
                                                }
                                                editor2.setContent(_tab);
                                                function_table.addColumnFunction(f, pt)
                                            }
                                        } else {
                                            editor2.setContent(v.join('\n'));
                                            let f = {
                                                expression: activeContent.trim()
                                            }
                                            function_table.addColumnFunction(f, pt)

                                        }

                                    }), disableAfterClick: false
                                },
                                {
                                    'label': 'Apply', ionfunction: createIonFunction(async () => {
                                        let activeContent = editor.getActiveTabContent();
                                        let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), pt);
                                        if (isArrayofArrays(v)) {
                                            editor2.setContent(v.join('\n'));

                                            for (let r of v) {
                                                let f = {
                                                    expression: r.join('\n').trim()
                                                }
                                                function_table.addColumnFunction(f, pt)

                                            }
                                            CurrentLayout.reset('mainPanel')

                                        } else {
                                            editor2.setContent(v.join('\n'));
                                            let f = {
                                                expression: activeContent.trim()
                                            }
                                            function_table.addColumnFunction(f, pt)
                                            CurrentLayout.reset('mainPanel')

                                        }
                                    }), disableAfterClick: false
                                },
                                {
                                    'label': 'Clear', ionfunction: createIonFunction(() => {
                                        editor2.setContent('')
                                    }), disableAfterClick: false
                                },
                                {
                                    'label': 'Close', ionfunction: createIonFunction(() => {
                                        CurrentLayout.reset("mainPanel")
                                    }), disableAfterClick: false
                                }

                            ]
                        }
                    },
                    {
                        'title': ' ', 'body': `
                                            `,
                        'width': '100%',
                        'component':
                        {
                            wid: 'text-editor',
                            refCallback: innerComponentCallback2,
                            componentRef: 'bottomPanel2',
                            data: {
                                height: '450px',
                                editorOptions: { language: 'text', automaticLayout: true },
                            }
                        }
                    }
                ]]
        }
    }
    CurrentLayout.setComponent("mainPanel", c1)

}
