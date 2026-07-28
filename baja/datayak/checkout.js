function (price) {

    return new Promise(async (resolve, reject) => {
        let license = await exec('baja/datayak/license')
        let descHook = createIonFunction((p) => {
            licenseEditor = p;
        });
        let t =
        {
            height: '200px',
            refCallback: descHook,
            editorOptions: {
                language: 'markdown',
                value: license,
                theme: 'no-border-theme',
                minimap: { enabled: false },
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
            code: license,
            buttons: [{
                'label': 'I agree', "color": 'blue', action: async () => {
                    ref.hideEditor();
                }
            }]
        }

        let checkout_panel = {
            wid: 'checkout',
            data: {
                'amount': price,
                'style.justifyContent': 'center',
                'license': license,

                'successListener': createIon(async (event) => {
                    const userEmail = event.payer.email_address;
                    if (getUser() && getUser() != userEmail) {
                        infoPrompt(" Access granted to user: " + getUser());
                    }
                    let host_ = window['env']['apiUrl']
                    const jsonobj = event;
                    let rs = await POSTJSON(jsonobj, host_ + '/subscription');
                    clear();
                    resolve(exec('baja/yak'))
                })
            }
        }
        let sequence_input = {
            wid: 'card',
            "height": "500px",
            data: {
                "style.padding-top": '1px',
                "style.border": '1px',
                "style.height": "500px",
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `<h3> $${price}/year </h3>`
                            }
                        },

                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: `Purchase  $${price}/year`, ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                clear();
                                                showWidget(checkout_panel)
                                            })
                                        }
                                    ]
                                }
                            },
                        },

                        {
                            'width': '100%',
                            'height': 300,
                            'component': {
                                wid: 'html',
                                data: license
                            }
                        },

                    ]
                ]
            }
        }

        return resolve(sequence_input);
    })
}
