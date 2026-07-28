function (graph, main_layout) {
    return new Promise(async (resolve, reject) => {

        let comp = null;
        let innerComponentCallback = createIonFunction((innerComponent) => {
            comp = innerComponent;
        });

        let w = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component':
                            {
                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '100%',
                                data: {
                                    width: '100%',
                                    drive: 'htsFiles',
                                    user: getUser(),

                                    root: '/',
                                    "ionfunction.fileClick": createIonFunction(async (element) => {

                                        hideAllModal();
                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),
                                    "ionfunction.path": createIonFunction(async (path, nodes) => {
                                        let p = path.path;
                                        p = p.substring ( 0, p.lastIndexOf ( '/'))
                                        let name = path.path.substring ( path.path.lastIndexOf ( '/') + 1 )
                                        if ( comp ) {
                                            comp.set ( 'Path', p.trim() )
                                            comp.set ( 'Name', name )
                                        }
                                    })
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``
                            ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'input-param-items',
                                width: '100%',
                                refCallback: innerComponentCallback,
                                data: {
                                    input_labels: ['Path', 'Name'],
                                    buttons: [{
                                        'label': 'Publish', 'function': createIonFunction(async (button_label, input_params) => {

                                            let foldername = input_params['Path'];
                                            let name = input_params['Name'];
                                            if (foldername == null || foldername.length === 0) {
                                                alert(" Please provide a folder name ")
                                                return;
                                            }
                                            var cache = [];
                                            let gs = await JSON.parse(JSON.stringify(graph, function (key, value) {
                                                if (key != null && key.toLocaleLowerCase().endsWith('_transient_')) {
                                                    return null;
                                                }

                                                if (key === 'track') {
                                                    console.log("save key track ")
                                                }
                                                if (key === 'opener') {
                                                    console.log(" skip opener ")
                                                    return null;

                                                } else if (key === 'selectedTrack' || key === 'selectedTrack') {
                                                    return null;
                                                }
                                                else
                                                    if (typeof value === 'object' && value !== null) {
                                                        if (cache.indexOf(value) !== -1) {
                                                            return;
                                                        }
                                                        if (value.showSnpIndels) {
                                                        }
                                                        cache.push(value);
                                                    }
                                                return value;
                                            }));

                                            if (!name.endsWith('.screen')) {
                                                name = name + '.screen'
                                            }

                                            if (gs.track === null) {
                                                alert(' no track ')
                                                return;
                                            }

                                            hideAllModal();
                                            let host_ = window['env']['apiUrl']
                                            let jsonobj = {
                                                "name": name,
                                                "spath": foldername,
                                                "value": JSON.stringify(gs)
                                            }
                                            let rs = await POSTJSON(jsonobj, host_ + '/publish-file');
                                            showModal({
                                                wid: 'json',
                                                data: JSON.stringify(rs)
                                            })

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', main_layout);

                                        })
                                    },

                                    {
                                        'label': 'Cancel', 'function': createIonFunction(async (button_label, input_params) => {

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', main_layout);

                                        })
                                    }

                                ]
                                }
                            }
                        }
                    ]
                ]
            }
        }

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', w);

    })
}
