function (plateTrack, plate, selected_wells) {
    let new_plate_panel;
    let __nameHook___ = createIonFunction((ed) => {
        new_plate_panel = ed;
    });
    plateTrack.setSelected(plate);
    let wellrange = plate.getSelectedWellRange()

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
    let editor;

    const selected_table = plateTrack.selectedPlate;

    function findCommonFormula(selected_wells) {

        if (selected_wells.length === 1) {
            if (selected_wells[0].obj) {
                return selected_wells[0].obj;
            }
        }

        if (!selected_wells || selected_wells.length === 0) return null;
        let fm = []
        let range = plate.getWellRange(selected_wells)
        let formula = plateTrack.getFormulaForWell(plate.name + range)
        if (formula && formula.length > 0) {
            fm.push(formula)
        }
        return fm;
    }
    let code = findCommonFormula(selected_wells)

    if (!code) {
        code = '';
    }

    let c1 = {
        height: '500px',
        editorOptions: {
            language: 'bajabio',
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
            keybindings: [
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.F10,
            ],
            padding: {
                top: 20,
                bottom: 20,
                left: 30,
                right: 30
            }
        },
        objects: plateTrack.root,
        keybindings: {
            'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

            })
        },
        code: '' + code,
        buttons: [

            {
                'label': 'Insert values ', 'color': 'black', action: (async () => {

                    let activeContent = editor.getEditorText();

                    if (!activeContent || activeContent.length <= 0) {
                        return;
                    }

                    LJScript.add(plate.name, `Insert into selected ` + activeContent)
                    let v = await exec('baja/plate/ops/frun-object.js', activeContent.trim(), plateTrack);
                    let index = 0;
                    let r = v['results']
                    let t = v['group']
                    for (let io of r) {
                        let i = io.value;
                        if (selected_wells[index]) {

                            if (!isNaN(i)) {
                                selected_wells[index].setValue(parseFloat(i).toFixed(3))
                            } else {
                                selected_wells[index].value = i;
                            }

                            if (!selected_wells[index].properties) {
                                selected_wells[index].properties = {}
                            }
                            selected_wells[index].properties['refIDs'] = io.groupIds;
                            selected_wells[index].setFormula(activeContent.trim())

                            if (t) {
                                if (typeof t === 'string')
                                    selected_wells[index].setGroup(t)
                            }
                            selected_wells[index].deselectIt();

                        }
                        index++;
                        if (index >= selected_wells.length)
                            break;
                    }
                    editor.hideEditor();
                }),
            },

            {
                'label': ' Save ', 'color': 'black', action: (async () => {
                    let activeContent = editor.getEditorText();
                    if (activeContent != null && activeContent.length > 1) {
                        LJScript.add(plate.name, `Save formula ` + activeContent)
                        let range = plate.getWellRange(selected_wells)
                        plate.formula[range] = activeContent.trim();
                        plateTrack.updateCalculations();
                        editor.hideEditor();
                    }
                }),
            },

        ]

    }
    if (selected_wells && selected_wells.length > 0) {
        c1.buttons.unshift(
            {
                'label': 'DELETE All table formula', 'color': 'orange', 'action': (() => {
                    let r = plate.getWellRange(selected_wells)
                    plate.clearFormula(r)
                    for (let r of selected_wells) {
                        r.obj = null;
                        r.formula = null;
                    }
                    editor.hideEditor();
                }),
            }
        )
    }

    if (selected_wells && selected_wells.length === 1) {

        c1.buttons.unshift(
            {
                'label': 'Save Excel formula', 'color': 'lightGray', 'action': (() => {
                    let activeContent = editor.getEditorText();
                    LJScript.add(plate.name, `Insert into selected ` + activeContent)
                    selected_wells[0].obj = activeContent.trim()
                    editor.hideEditor();
                }),
            }
        )

    }
    c1.buttons.push(
        {
            'label': 'Close', 'color': 'red', 'action': (() => {
                editor.hideEditor();
            }),
        }
    )

    console.log(" showing the editor ")
    if (!isMobile()) {
        editor = plateTrack.showTextEditor(c1);
        if (code)
            editor.code = (code)
        else {
            editor.setText('')
        }
    }
}
