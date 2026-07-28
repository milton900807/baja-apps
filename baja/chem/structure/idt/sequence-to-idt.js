function () {

    let applySequence = (structure, sequence) => {
        let split = structure;
        for (let c of sequence) {
            split = split.replace('()', `(${c})`)
        }
        return split;
    }

    let templateHook;
    let title_text = {
        'wid': 'input-textfield',
        'title': ' Template',
        'data': {
            'blocking': false,
            'show-button': false,
            'text': 'moe()sp.moe()p.moe()p.moe()p.moe()p.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.d()sp.moe()p.moe()p.moe()sp.moe()sp.moe()',
            'ionHookFunction': createIonFunction((w) => {
                templateHook = w
            }),
            'ionfunction': createIonFunction((title) => {
                console.log(" title " + title);
            })
        }
    }
    showWidget(title_text)

    let io;

    let innerComponentCallback = createIonFunction((editor) => {
        io = editor;
    })

    showWidget(
        {
            wid: 'card',
            width: '900px',
            data: {
                cards: [
                    [
                        {
                            'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                        `,
                            'width': '1900px',
                            'component':
                            {
                                wid: 'text-editor',
                                refCallback: innerComponentCallback,
                                data: {
                                    editorOptions: { language: 'javascript', automaticLayout: true },
                                    height: '500px',
                                }
                            }
                        },
                    ]
                ]
            }
        })

    showWidget({
        wid: 'button',
        data:
        {
            'label': 'Generate', ionfunction: createIonFunction(async () => {
                let list = io.code.split('\n')
                let idt = await exec('baja/chem/structure/idt/idt-format.js');
                let structureTemplate = templateHook.getWidgetValue();

                let l = []
                for (let sequence of list) {
                    sequence = sequence.trim();
                    if (sequence && sequence.length > 0) {

                        let structure = applySequence(structureTemplate, sequence);
                        structure = structure.trim()
                        if (structure && structure.length > 0) {
                            let idtValue = idt.format(structure)

                            l.push(idtValue)
                        }
                    }
                }
                clear();

                let str = '';
                for (let t of l) {
                    t = t.replace ( /\/\//g, '/')
                    str += t + '\n'
                }
                let code = str;

                showWidget(
                    {
                        wid: 'card',
                        width: '900px',
                        data: {
                            cards: [
                                [
                                    {
                                        'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                                    `,
                                        'width': '1900px',
                                        'component':
                                        {
                                            wid: 'text-editor',
                                            refCallback: innerComponentCallback,
                                            data: {
                                                editorOptions: { language: 'text', automaticLayout: false },
                                                height: '500px',
                                                code: code
                                            }
                                        }
                                    },
                                ]
                            ]
                        }
                    }
                )
            })
        }
    })
}
