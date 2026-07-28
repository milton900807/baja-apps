function () {

    let editor;
    let innerComponentCallback__ = createIon((_panel) => {
        editor = _panel;
        if (editor) {
            editor.setContent('')
        }
    })

    function isArrayofArrays(variable) {
        return Array.isArray(variable) && variable.every(Array.isArray);
    }

    let new_plate_panel;
    let __nameHook___ = createIonFunction((ed) => {
        new_plate_panel = ed;
    });
    let new_type_panel;
    let __nameHook2 = createIonFunction((ed) => {
        new_type_panel = ed;
    });

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
                            refCallback: innerComponentCallback__,
                            componentRef: 'bottomPanel',
                            data: {
                                height: '500px',
                                editorOptions: {
                                    language: 'bajabio',
                                    value: "Enter LJ-script here",
                                    theme: 'no-border-theme',
                                    minimap: { enabled: false },
                                    scrollbar: {
                                        vertical: 'hidden',
                                        horizontal: 'hidden',
                                    },
                                    lineNumbers: 'off',
                                    lineDecorationsWidth: 0,
                                    lineNumbersMinChars: 0,
                                    overviewRulerLanes: 0,
                                    hideCursorInOverviewRuler: true,
                                    folding: false,
                                    highlightActiveIndentGuide: false,
                                    renderLineHighlight: 'none',
                                    renderLineHighlightOnlyWhenFocus: false,
                                    renderWhitespace: 'none',
                                    fontSize: 18,
                                    automaticLayout: true,
                                    padding: {
                                        top: 20,
                                        bottom: 20,
                                        left: 30,
                                        right: 30
                                    }
                                },
                                objects: pm.plateTrack.root,
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
                                    'label': 'Test run', ionfunction: createIonFunction(async () => {
                                        let testresults = ''
                                        let activeContent = editor.getActiveTabContent();

                                        let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), pm.plateTrack);

                                        if (isArrayofArrays(v)) {
                                            let _tab = arrayOfArraysToTable(v);
                                            for (let r of v) {
                                                let f = {
                                                    expression: r.join('\n').trim()
                                                }
                                                testresults += (_tab);

                                            }

                                        } else if (v.message) {
                                            showModal({
                                                wid: 'json',
                                                data: JSON.stringify(" Error : " + v.message)
                                            }, 600, 200)
                                        }
                                        else {
                                            let f = {
                                                expression: activeContent.trim()
                                            }

                                            testresults += v.join('\n')
                                        }

                                        if (testresults && testresults.length > 0) {
                                            showModal({
                                                wid: 'json',
                                                data: testresults
                                            }, 800, 500)
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
                                }, {
                                    'label': 'Create Table', ionfunction: createIonFunction(() => {

                                        let name = new_plate_panel.get('Name')
                                        let type = 'function'
                                        let plate = pm.plateTrack.newSimplePlate(name, 1, 1)
                                        plate.plateType = type;
                                        let activeContent = editor.getActiveTabContent();
                                        let f = {
                                            expression: activeContent.trim()
                                        }

                                        plate.addColumnFunction(f, pm.plateTrack)

                                        pm.plateTrack.zoomintoplate(plate);
                                        plate.fitRowsAndColumns();
                                        CurrentLayout.reset('mainPanel')
                                    }), disableAfterClick: false
                                }

                            ]
                        }
                    },
                ]]
        }
    }
}
