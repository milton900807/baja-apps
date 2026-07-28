function (macro, pt) {

    if ( pt ){
        pt.applyHeaders();
    }

    return new Promise(async (resolve, reject) => {

        let content = {}
        let designs = []

        const selectPanel = createIon((panel) => {

        })

        if (!macro) {
            macro = 'baja/table/macros';
        }

        let l = macro;

        console.log('debubg');
        console.log(" typeof l  " + typeof l)
        if (l != null && typeof l === 'string') {
            l = await exec(macro)

        } else {
        }

        for (let li of l) {
            if (li.name != null) {
                designs.push(li.name);
                if (li['description'])
                    content[li.name] = li['description']
            }
        }

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
                                                if (item.nodes) {
                                                    exec('baja/table/show-ljscript-library', item.nodes, pt)
                                                    hideAllModal();
                                                } else if (item.steps) {
                                                    console.log('debubg');
                                                    pt.showMacroSteps(item.steps)
                                                    hideAllModal();
                                                }
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
        showModal(c1, 500, 500)

        resolve();

    });

}
