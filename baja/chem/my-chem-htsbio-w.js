function (select, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let ChemistryTemplateDB = await exec('baja/chem/chem-template-repo.js')
        let cdb = await new ChemistryTemplateDB();
        let l = await cdb.load();

        let designs = [];

        let p = null;
        let selectPanel = (panel) => {
            p = panel;
        }

        let content = {}

        for (let li of l) {
            if (li.name != null) {
                designs.push(li.name);
                if (li['description'])
                    content[li.name] = li['description']
            }
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
                            'title': '',
                            width: '100%',

                            'body': `  `, 'component':
                            {
                                wid: 'selection-list',
                                width: '100%',
                                refCallback: selectPanel,
                                data: {
                                    listItems: designs,
                                    contentItems: content,
                                    single_selection: true,
                                    show_button: false,
                                    singleSelect: true,
                                    button_function: createIonFunction(async (items) => {
                                        let name = items[0]
                                        for (let item of l) {
                                            if (item.name === name) {
                                                select(item)
                                            }
                                        }
                                    })
                                }
                            }
                        },

                    ], [

                    ]
                ]
            }
        }

        resolve(c1)
    })

}
