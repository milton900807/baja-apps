function () {

    return new Promise(async (resolve, reject) => {

        let libid = `b!n_SZ5sO9vEWdFy6SfhhA30xjA4ZiOXJAsJN0raZO8Zq-d56EowcnQ6mu6piwEi6O`
        let monomers = await exec('baja/chem/monomers.js', libid)

        let medchemEditor = null;
        let js = {
            "wid": "medchem",
            "data": {
                monomers: monomers['monomers'], listener: createIonFunction((_medchemEditor) => {
                    medchemEditor = _medchemEditor;
                })
            },
            "title": 'medchemeditor'
        }

        let meditor = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': js
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Apply', ionFunction: createIonFunction(() => {

                                                if (medchemEditor != null) {
                                                    let helm = medchemEditor.getHELM();
                                                    selectedOligo.structure = helm;

                                                }

                                                showMainPanel();
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                showMainPanel();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }

        }

        showWidget ( meditor )
        resolve ( 'loaded ')

    })

}
