function () {
    exec('baja/lib/db.js').then(async (db) => {

        let m = {
            wid: 'menu',
            data: {
                menus: [
                    {
                        'label': 'New', 'items': [
                            {
                                'label': 'siRNA', 'ionfunction': createIonFunction(() => {
                                    exec('flexigraph/db.js').then(db => {
                                        clear();
                                        exec('baja/chem/sirna-editor.js')

                                    })
                                })
                            },
                            {
                                'label': 'Monomer', 'ionfunction': createIonFunction(() => {
                                    exec('flexigraph/db.js').then(db => {
                                    })
                                })

                            }
                        ]
                    },
                    {
                        'label': 'Monomers', 'items': [
                            {
                                'label': 'My monomers', 'ionfunction': createIonFunction(() => {

                                })
                            },
                            {
                                'label': 'Edit', 'ionfunction': createIonFunction(() => {
                                })
                            },
                            {
                                'label': 'Monomer Database', 'ionfunction': createIonFunction(async () => {
                                    clear();
                                    exec('baja/chem/my-monomers.js', db.libid)
                                })

                            },
                        ],
                    },
                    {
                        'label': 'Templates', 'items': [
                            {
                                'label': 'New...', 'ionfunction': createIonFunction(() => {
                                    clear();
                                    exec('baja/chem/template-builder.js')
                                })
                            },
                            {
                                'label': 'View/Edit templates', 'ionfunction': createIonFunction(() => {
                                })

                            },
                            {
                                'label': 'Template Database', 'ionfunction': createIonFunction(() => {
                                    clear();
                                    exec('baja/chem/template-builder.js')

                                })

                            },
                        ],
                    },
                ]
            }

        }

        let strpjson = (name) => {
            let i = name.lastIndexOf('.');
            if (i > 0) {
                return name.substring(0, i);
            } else {
                return name;
            }
        }

        let designs = [];
        try {
            let expdata = await db.list(`bajabio-screens/.chem/mychem`);
            if (expdata != null && expdata.value != null && expdata.value.length > 0) {
                for (let v of expdata.value) {
                    if (v.name != 'template' != null) {
                        designs.push(
                            {
                                button: {
                                    'label': strpjson(v.name), 'ionFunction': createIonFunction(async () => {

                                        clear();
                                        exec('baja/chem/sirna-editor.js', v)

                                    })
                                }

                            });
                    }

                }
            }
        } catch (exception) {
            console.log(exception)

        }
        let c1 = {
            wid: 'card',
            data: {

                'style.padding-left': '12px',
                cards: [
                    [
                        {
                            'component':
                            {
                                wid: 'table', data: {
                                    width: '50%',
                                    padding_top: '10px',
                                    showHeader: false,
                                    rows: designs
                                }
                            }
                        },
                    ]]
            }
        }

        let sirows = []

        let t = {
            wid: 'card',
            data: {
                padding: '5px',
                cards: [
                    [

                        {
                            'component': {
                                wid: 'html',
                                data: `<h4> <img src="assets/img/icons/png/caret-right-2x.png">   Chemistry templates... </h4>`
                            },
                            width: '100%'
                        },
                        {
                            'component': m,
                            componentRef: 'bottomPanel',
                            width: '100%'
                        },
                        {
                            'body': `
                                `, 'component': c1
                        }

                    ]]
            }
        }
        showWidget(t)
    })

}
