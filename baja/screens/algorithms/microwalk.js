function (panelLabel) {

    let va = async () => {

        let h = []
        h.push({
            wid: 'html',
            data: `<b> Microwalk </b> `
        })

        h.push({
            wid: 'radio-buttons',
            data: {
                buttons: [
                    {
                        label: 'siRNA', ionfunction: createIonFunction(async () => {
                            let r = CurrentLayout.getComponent(panelLabel, 2);
                            r.disable();

                            let overlap = {
                                wid: 'radio-buttons',
                                data: {
                                    width: '100%',
                                    html:  `<hr> Choose the type of sequence walk.`,
                                    buttons: [
                                        {
                                            label: 'Overlap oligos', ionfunction: createIonFunction(async () => {
                                                let r = CurrentLayout.getComponent(panelLabel, 2);
                                                r.disable();
                                                let title_text = {
                                                    'wid': 'input-textfield',
                                                    'title': 'How many bases do you want to overlap?',
                                                    'data': {
                                                        'blocking': false,
                                                        'show-button': true,
                                                        'ionHookFunction': createIonFunction((ensembleid) => {

                                                        }),
                                                        'buttonFunction': createIonFunction(async (ensembleid) => {

                                                            let mySiChemistry = await exec('baja/chem/my-chemistry', 'siRNA');

                                                            CurrentLayout.addComponent(panelLabel, mySiChemistry)
                                                        })
                                                    }
                                                }
                                                CurrentLayout.addComponent(panelLabel, title_text)
                                            })
                                        },
                                        {
                                            label: 'Space between oligos', ionfunction: createIonFunction(async () => {
                                                let r = CurrentLayout.getComponent(panelLabel, 2);
                                                r.disable();
                                                let title_text = {
                                                    'wid': 'input-textfield',
                                                    'title': 'How many bases do you want to overlap?',
                                                    'data': {
                                                        'blocking': false,
                                                        'show-button': true,
                                                        'ionHookFunction': createIonFunction((ensembleid) => {

                                                        }),
                                                        'buttonFunction': createIonFunction(async (ensembleid) => {

                                                            let mySiChemistry = await exec('baja/chem/my-chemistry', 'siRNA');

                                                            CurrentLayout.addComponent(panelLabel, mySiChemistry)
                                                        })
                                                    }
                                                }
                                                CurrentLayout.addComponent(panelLabel, title_text)
                                            })
                                        }

                                    ]
                                }
                            }

                            CurrentLayout.addComponent(panelLabel, overlap)
                        })
                    },
                    {
                        label: 'Antisense Oligo', ionfunction: createIonFunction(async () => {

                            let desc = {
                                'wid': 'input-textarea-editor',
                                'title': 'Experiment Description',
                                'data': {
                                    'ionHookFunction': createIonFunction((w) => {
                                        descHook = w
                                    }),
                                    'button-label': 'Create experiment',
                                    'ionFunction': createIonFunction((description) => {
                                        console.log(" description " + description);
                                    })
                                }
                            }
                            await showWidget(desc)

                        })
                    }
                ]
            }
        })
        return h;

    };
    return va();
}
