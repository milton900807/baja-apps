function (plot) {

    return new Promise(async (resolve, reject) => {
        function getRandomColor() {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            return `rgb(${r},${g},${b},1)`;
        }
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })
        let txt = `

            Highlight labels with the following regular expressions.

        `

        let inputs = ['Starts with', 'Contains', 'Ends with']

        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${txt}`
                            }
                        },
                        {
                            'title': ' ', 'body': '',
                            'width': '90%',
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': inputs,
                                    'default_values': []
                                }
                            }
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'OK', ionFunction: createIonFunction(() => {
                                                plot.highlightPatterns.push({ "pattern": m, color: getRandomColor() })

                                                hideAllModal();
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }

        if (!width) {
            width = 500;
        }
        if (!height) {
            height = 800;
        }

        resolve ( )

    })
}
