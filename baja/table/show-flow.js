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
                language: 'bajabio',
                minimap: { enabled: true },
                scrollbar: {
                    vertical: 'auto',
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
            code: st,
            buttons: [
                {
                    'label': 'Reset', 'color': 'black', "action": () => {
                        LJScript.reset();
                    }
                },

                {
                    'label': 'Close', 'color': 'black', "action": () => {
                        ref.hideEditor();
                    }
                }
            ]
        }
        t.objects = pm.plateTrack.root;
        ref = pm.plateTrack.showTextEditor(t);
        interval_id = setInterval(() => {
            if (ref && ref.isTextEditorVisible()) {
                ref.setEditorText(LJScript.getEvents().join('\n'))
            } else {
                clearInterval(interval_id)
                return;
            }
        }, 1000)

        return resolve();

    })

}
