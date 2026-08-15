function (gene, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let editor1
        let refun = createIonFunction((_editor) => {
            editor1 = _editor;
            setTimeout ( () => {
                editor1.format ();
            }, 2000 )
        })

        let compound_filter = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'title',
                                data: `<h3> Update the synthesis sequence</h3>`
                            }
                        },
                        {
                            'width': '100%',
                            'component':
                            {
                                wid: 'text-editor',
                                height: '900px',
                                refCallback: refun,
                                data: {
                                    editorOptions: { language: 'javascript', automaticLayout: true },
                                    libs: [
                                        { 'name': 'core', 'path': 'genome/lib/core.js' },
                                        { 'name': 'sample', 'path': 'genome/sample-gff.js' },
                                        { 'name': 'biopolymer', 'path': 'baja/chem/biopolymer.js' }
                                    ],
                                    height: '900px',
                                    text: `
                                                let Biopolymer = await exec('baja/chem/biopolymer.js')
                                              for ( let track of tracks ){
                                                for ( let oligo of oligos ){
                                                    let compound = await Biopolymer.reverseComp('ACTG)
                                                    alert ( compound )

                                              }
                                            }

                                    `
                                }
                            }
                        },
                        {
                            'width': '30%',
                            'component': {
                                wid: 'html',
                                data: `    `
                            }
                        },

                        {
                            'title': '',
                            'width': '70%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Run', ionFunction: createIonFunction(async () => {

                                                showWidget ( {
                                                    wid:'json',
                                                    data:JSON.stringify ( editor1.code )
                                                })

                                            })
                                        },
                                    ]
                                }
                            }
                        },
                    ]]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', compound_filter);

    })

}
