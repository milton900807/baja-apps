function (lib, select, props) {

    return new Promise(async (resolve, reject) => {
        let ChemistryTemplateDB = await exec('baja/chem/chem-template-db.js')

        exec('baja/lib/db.js', lib).then(async (db) => {
            let strpjson = (name) => {
                let i = name.lastIndexOf('.');
                if (i > 0) {
                    return name.substring(0, i);
                } else {
                    return name;
                }
            }
            let cdb = await new ChemistryTemplateDB();

            let designs = [];
            try {
                let expdata = await db.list(`bajabio-xfiles/.chem`);
                if (expdata != null && expdata.value != null && expdata.value.length > 0) {
                    for (let v of expdata.value) {
                        if (v.name != 'template' != null) {
                            let dataobject = await cdb.loadChem(v);
                            dataobject['name'] = v.name;
                            if (v.name != null && v.name.endsWith('.json')) {
                                v.name = v.name.substring(0, v.name.indexOf('.json'))
                            }
                            let dselected_chemistry = dataobject;
                            designs.push(
                                {
                                    button: {
                                        'label': strpjson(v.name), 'ionFunction': createIonFunction(async () => {

                                            select(dselected_chemistry);
                                        })
                                    }
                                }
                            );
                        }

                    }
                }
            } catch (exception) {
                console.log(exception)

            }

            let editor_;
            let annotation_editor = createIonFunction((editor) => {
                editor_ = editor;
            })

            let c1 = {
                wid: 'card',
                data: {

                    'style.padding-left': '12px',
                    cards: [
                        [

                            {

                                width: '100%',

                                'component':
                                {
                                    wid: 'table', data: {
                                        width: '25%',
                                        height: "100px",

                                        padding_top: '0px',
                                        showHeader: false,
                                        rows: designs
                                    }
                                }
                            }, {
                                'title': '',
                                'width': '100%',
                                'component': {
                                    wid: 'mt-button', data: {
                                        buttons: [
                                            {
                                                label: 'Create new chemistry', ionFunction: createIonFunction(() => {

                                                    let t = {
                                                        wid: 'card',
                                                        data: {
                                                            padding: '10px',
                                                            cards: [
                                                                [
                                                                    {
                                                                        width: '100%',
                                                                        'component': {
                                                                            wid: 'title',
                                                                            data: '<h4> Chemistry Editor </h4>'
                                                                        }
                                                                    },
                                                                    {
                                                                        width: '100%',
                                                                        'component': {
                                                                            wid: 'json',
                                                                            refCallback: annotation_editor,
                                                                            data: ''
                                                                        }
                                                                    },
                                                                    {
                                                                        'title': '',
                                                                        'width': '100%',
                                                                        'component': {
                                                                            wid: 'mt-button', data: {
                                                                                buttons: [
                                                                                    {
                                                                                        label: 'Save', ionFunction: createIonFunction(() => {
                                                                                            let obstr = editor_.getData();
                                                                                            try {
                                                                                                let ob = JSON.parse(obstr);
                                                                                                props.selected_chemistry = ob;
                                                                                            } catch (exception) {
                                                                                                alert(' format of the json was incorrect. ')
                                                                                            }

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
                                                    showModal(t)

                                                })
                                            },

                                            {
                                                label: 'View selected chemistry', ionFunction: createIonFunction(() => {
                                                    hideAllModal();

                                                    if (!props.selected_chemistry) {
                                                        alert(' Chemistry is not selected ')
                                                        return;
                                                    }

                                                    showModal({
                                                        wid: 'json',
                                                        data: JSON.stringify(props.selected_chemistry)
                                                    }, 600, 200)

                                                })
                                            }
                                        ]
                                    }
                                }
                            }

                        ], [

                        ]
                    ]
                }
            }

            let sirows = []

            resolve(c1)
        })
    })

}
