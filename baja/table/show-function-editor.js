function () {

    return new Promise(async (resolve, reject) => {
        let ref;
        let pm = CurrentLayout.getStashed('plate-track')
        let st = LJScript.getEvents();
        if (!st) {
            st = ''
        }

        let t =
        {
            height: '800px',
            editorOptions: {

                minimap: { enabled: false },
                lineNumbers: 'on',
                lineDecorationsWidth: 0,

            },
            objects: pm.plateTrack,
            keybinding: {
                'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                })
            },
            code: st,
            buttons: [
                {
                    'label': 'Save', 'color': 'blue', "action": () => {
                        pm.plateTrack.pauseCalculations = true;
                        function convertTextToJsonObject(rawText) {
                            const result = {};
                            rawText.split('\n').forEach(line => {
                                const trimmedLine = line.trim();
                                if (trimmedLine) {
                                    const [key, value] = trimmedLine.split(' = ');
                                    if (key === undefined || value === undefined) {
                                        pm.plateTrack.setMessage(`Invalid format in line: "${line}". Expected "key = value".`);
                                    }
                                    result[key.trim()] = value.trim();
                                }
                            });
                            return result;
                        }
                        function parseAssignments(code) {
                            const lines = code.split('\n');
                            const result = {};
                            let buffer = '';
                            let inFunction = false;
                            let braceCount = 0;

                            for (let rawLine of lines) {
                                const line = rawLine.trim();
                                if (!line) continue;

                                buffer += (buffer ? ' ' : '') + line;

                                if (line.includes('function')) {
                                    inFunction = true;
                                    braceCount += (line.match(/{/g) || []).length;
                                    braceCount -= (line.match(/}/g) || []).length;
                                    continue;
                                }

                                if (inFunction) {
                                    braceCount += (line.match(/{/g) || []).length;
                                    braceCount -= (line.match(/}/g) || []).length;
                                    if (braceCount > 0) continue;
                                    else inFunction = false;
                                }

                                if (!inFunction && /[;,]$/.test(buffer)) {
                                    const eqIndex = buffer.indexOf('=');
                                    if (eqIndex !== -1) {
                                        const key = buffer.substring(0, eqIndex).trim();
                                        const value = buffer.substring(eqIndex + 1).replace(/\s+/g, ' ').trim().replace(/,$/, '');
                                        result[key] = value;
                                    }
                                    buffer = '';
                                }
                            }

                            if (buffer) {
                                const eqIndex = buffer.indexOf('=');
                                if (eqIndex !== -1) {
                                    const key = buffer.substring(0, eqIndex).trim();
                                    const value = buffer.substring(eqIndex + 1).replace(/\s+/g, ' ').trim().replace(/,$/, '');
                                    result[key] = value;
                                }
                            }

                            return result;
                        }

                        let code = ref.textEditor.getContent();
                        code = parseAssignments(code)
                        pm.plateTrack.formulas = (code)
                        setTimeout(() => {
                            pm.plateTrack.pauseCalculations = false;
                        }, 2000)
                    }
                },
                {
                    'label': 'Prune', 'color': 'black', "action": () => {
                        const r = pm.plateTrack.root;
                        const validTables = [];
                        for (let i of r) {
                            validTables.push(i.name);
                        }
                        const formulas = pm.plateTrack.formulas;
                        const invalidEntries = [];
                        const extractTableNames = str => {
                            const regex = /\b(\w+)\s*\[/g;
                            const matches = [];
                            let match;
                            while ((match = regex.exec(str)) !== null) {
                                matches.push(match[1]);
                            }
                            return matches;
                        };

                        const newFormulas = {};
                        for (const [key, value] of Object.entries(formulas)) {
                            const keyTables = extractTableNames(key);
                            const valueTables = typeof value === 'string' ? extractTableNames(value) : [];

                            const allTables = [...keyTables, ...valueTables];
                            const invalidTables = allTables.filter(table => !validTables.includes(table));

                            if (invalidTables.length > 0) {
                                invalidEntries.push({ key, value, invalidTables });
                            } else {
                                newFormulas[key] = value;
                            }
                        }

                        pm.plateTrack.formulas = newFormulas;

                        function formatJsonForEditor(jsonObject) {
                            try {
                                return Object.entries(jsonObject)
                                    .map(([key, value]) => `${key} = ${value}`)
                                    .join('\n');
                            } catch (error) {
                                throw new Error("Invalid JSON string. Please provide a valid JSON input.");
                            }
                        }

                        ref.textEditor.setContent(formatJsonForEditor(pm.plateTrack.formulas));

                    }
                },
                {
                    'label': 'Close', 'color': 'black', "action": () => {
                        pm.plateTrack.pauseCalculations = false;

                        ref.hideEditor();
                    }
                }
            ]
        }
        t.objects = pm.plateTrack.root;
        ref = pm.plateTrack.showTextEditor(t);
        setTimeout(() => {
            if (ref && ref.isTextEditorVisible()) {
                function formatJsonForEditor(jsonObject) {
                    try {
                        return Object.entries(jsonObject)
                            .map(([key, value]) => `${key} = ${value}`)
                            .join('\n');
                    } catch (error) {
                        throw new Error("Invalid JSON string. Please provide a valid JSON input.");
                    }
                }
                ref.setEditorText(formatJsonForEditor(pm.plateTrack.formulas))
            }
        }, 100)

        return resolve();

    })

}
