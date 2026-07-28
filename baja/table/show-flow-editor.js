function (code) {

    return new Promise(async (resolve, reject) => {

        let ref;
        let pm = CurrentLayout.getStashed('plate-track')
        let st = LJScript.getEvents();
        if (!st) {
            st = ''
        }

        let canvas = CurrentLayout.getStashed('graph-canvas')
        let t =
        {
            height: '400px',
            editorOptions: {
                language: 'bajabio',

                minimap: { enabled: false },
                folding: false,
                highlightActiveIndentGuide: false,
                fontSize: 15,
                automaticLayout: true,
                padding: {
                    top: 20,
                    bottom: 20,
                    left: 30,
                    right: 30
                }
            },
            objects: pm.plateTrack,
            keybinding: {
                'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                })
            },
            code: code,
            buttons: [
                {
                    'label': 'Export', "color": 'blue', action: async () => {
                        let code = canvas.getEditorText();
                        await exec('screen/io/save-workstream', '/', code, pm.plateTrack)
                    }

                },
                {
                    'label': 'Save', "color": 'blue', action: async () => {
                        let code = canvas.getEditorText();
                        let pm = CurrentLayout.getStashed('plate-track')
                        pm.plateTrack.setMessage(" Saved script...")
                        let attr_window = ''
                        let va = await prompt("Name", ["Name"], { "Name": attr_window }, 300, 300)
                        let m = va['Name']
                        pm.plateTrack.saveLJLBookmark(m, code)
                    }
                },
                {
                    'label': 'Run', "color": 'blue', action: async () => {
                        let code = canvas.getEditorText();
                        let interpreter = await exec('baja/engine/interpreter.js', pm.plateTrack)
                        interpreter.run(code);
                    }
                },
                {
                    'label': 'Close', 'color': 'black', "action": () => {
                        ref.hideEditor();
                    }
                }
            ]
        }
        t.code = code;

        function getObjectMethods(objectInstance) {
            let methods = [];
            let prototype = Object.getPrototypeOf(objectInstance);

            while (prototype && prototype !== Object.prototype) {
                let methodNames = Object.getOwnPropertyNames(prototype)
                    .filter(name => typeof objectInstance[name] === 'function' && name !== 'constructor');

                methods.push(...methodNames);
                prototype = Object.getPrototypeOf(prototype);
            }

            let finalMethods = []

            for (let m of methods) {
                finalMethods.push({
                    name: m
                })
            }

            return finalMethods;
        }
        let interpreter = await exec('baja/engine/interpreter.js')
        let m = getObjectMethods(interpreter)
        console.log('debubg');
        t.objects = pm.plateTrack.root.concat(m);
        ref = pm.plateTrack.showTextEditor(t);
        return resolve();
    })

}
