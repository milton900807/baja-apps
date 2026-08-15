function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        const dbhost = window["env"]["db"];
        if (!dbhost) {
            alert(" Database host installed. ")
            return;
        }

        selected_training = null;

        let ML = await exec('baja/ml/ml-manager.js')
        let ml_manager = new ML();

        graph.deselectAllTracks();
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.selectOff();
        let selectedTrack = null;
        graph.addMouseUpListener(async (x, y) => {
            graph.deselectAllTracks();
        })
        graph.addMouseDownListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
            }
            graph.showMenu([
                {
                    label: 'Save track...',
                    click: async () => {

                        let registered = false;

                        if (dbhost) {
                            selectedTrack.createdBy = getUser();
                            selectedTrack.createdDate = new Date().toISOString();

                            let descPanel = null;
                            let __ic = (panel) => {
                                descPanel = panel;
                                console.log('debubg');
                            }

                            let tt = {
                                wid: 'card',

                                data: {
                                    cards: [
                                        [

                                            {
                                                'title': ' ', 'body': `Track description.
                                                                `,
                                                'width': '100%',
                                                'height': '100%',
                                                'component':
                                                {
                                                    wid: 'text-editor',
                                                    refCallback: createIonFunction(__ic),
                                                    height: '250px',
                                                    data: {
                                                        mode: 'simple',
                                                        editorOptions: { language: 'text', automaticLayout: true },
                                                        keybinding: {
                                                            'Ctrl+Enter': createIonFunction(async (content, lineNumber, selectionLines, col) => {
                                                            })
                                                        },
                                                    }
                                                }
                                            },
                                            {
                                                'title': null, 'body': `
                                                                `,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'button',
                                                    data: [
                                                        {
                                                            'label': 'Save', ionfunction: createIonFunction(async () => {

                                                                graph.runfun(async () => {
                                                                    selectedTrack.description = descPanel.code;
                                                                    console.log(" Saving track :" + selectedTrack.id)
                                                                    graph.setMessage(" Saving track :" + selectedTrack.id)
                                                                    let r = await POSTJSON(selectedTrack, `${dbhost}/save_track`);
                                                                    graph.setMessage("Track is saved.");
                                                                })
                                                                hideAllModal();
                                                            }), disableAfterClick: false
                                                        },
                                                        {
                                                            'label': 'Cancel', ionfunction: createIonFunction(() => {
                                                                hideAllModal();

                                                            }), disableAfterClick: false
                                                        }
                                                    ]
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(tt, 1000, 550)
                        }
                    },
                    move: () => {
                    }
                }, {
                    label: 'Add to training set',
                    click: async () => {
                        if (dbhost) {
                            let r = await GETJSON(`${dbhost}/training_sets`);
                            if (r) {
                                let names = r.map(track => track.name)
                                let content = {}
                                for (let n of r) {
                                    if (n.description)
                                        content[n.name] = ' > ' + n.description
                                    else {
                                        content[n.name] = ' > No description '
                                    }
                                }
                                let t = {
                                    wid: 'selection-list',
                                    data: {
                                        single_selection: true,
                                        show_button: false,
                                        singleSelect: true,
                                        listItems: names,
                                        contentItems: content,
                                        button_function: createIonFunction(async (items) => {
                                            for (let item of r) {
                                                if (item['name'] === items[0]) {
                                                    let rr = await GETJSON(`${dbhost}/training_sets/${item['_id']}`);
                                                    if (selectedTrack.id) {
                                                        let a = rr['ids']
                                                        if (a.includes("" + (selectedTrack.id))) {
                                                            graph.setMessage(" Track already in this training set")
                                                        } else {
                                                            a.push("" + (selectedTrack.id))
                                                            a = Array.from(new Set(a));
                                                            rr["ids"] = a;
                                                            let trr = await POSTJSON(rr, `${dbhost}/update_training_set`);
                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(trr)
                                                            })
                                                        }
                                                    } else {
                                                        alert(" You need to save this track in the trackdb first. ")
                                                    }
                                                }
                                            }
                                            hideAllModal();

                                        })
                                    }
                                }
                                let tt = {
                                    wid: 'card',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'title': ' ', 'body': `Track description.
                                                                            `,
                                                    'width': '100%',
                                                    'height': '100%',
                                                    'component': t,
                                                }
                                            ]]
                                    }
                                }
                                showModal(tt, 1000, 550)
                            }
                        }
                    },
                    move: () => {

                    },
                    move: () => {
                    }
                },

            ], x, y)

        })

        if (dbhost) {
            let bpanel = {
                wid: 'card',
                data: {
                    cards: [
                        [

                            {
                                width: '100%',
                                'component': {
                                    wid: 'menu',
                                    data: {
                                        title: '  ',
                                        style: 'sub-container',
                                        menus: [
                                            {
                                                'label': 'DB', 'items': [
                                                    {
                                                        'label': 'Save all tracks', 'ionfunction': createIonFunction(async () => {
                                                            graph.setMessage("Saving tracks...")
                                                            let confirm = await exec('baja/lib/confirm-widget.js', async () => {

                                                                const dbhost = window["env"]["db"];
                                                                if (dbhost) {

                                                                    for (let track of graph.track) {
                                                                        track.createdBy = getUser();
                                                                        track.createdDate = new Date().toISOString();
                                                                        let registered = false;
                                                                        let r = await POSTJSON(track, `${dbhost}/save_track`);

                                                                        if (r.status === 404) {
                                                                            registered = true;
                                                                        } else {
                                                                            registered = false;
                                                                        }
                                                                    }
                                                                }

                                                            }, " Are you sure you want to save all tracks to the trackdb?")
                                                            showModal(confirm)

                                                            let count = await GETJSON(`${dbhost}/my_tracks/count?createdBy=${getUser()}`);
                                                            if (count) {
                                                                count = parseInt(count['count'])
                                                            }
                                                            if (count < 1000) {
                                                                let r = await GETJSON(`${dbhost}/track_names?createdBy=${getUser()}`);
                                                                if (r) {

                                                                    let names = r.map(track => track.name)

                                                                    let content = {}
                                                                    for (let n of r) {
                                                                        if (n.description)
                                                                            content[n.name] = ' > ' + n.description
                                                                        else {
                                                                            content[n.name] = ' > No description '

                                                                        }
                                                                    }

                                                                    let t = {
                                                                        wid: 'selection-list',
                                                                        data: {
                                                                            single_selection: true,
                                                                            show_button: false,
                                                                            singleSelect: true,
                                                                            listItems: names,
                                                                            contentItems: content,
                                                                            button_function: createIonFunction(async (items) => {
                                                                                for (let item of r) {
                                                                                    if (item['name'] === items[0]) {
                                                                                        let rr = await GETJSON(`${dbhost}/tracks_by_id?id=${item['_id']}`);
                                                                                        let t = rr[0]
                                                                                        graph.___setTrack(t)

                                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                                    }
                                                                                }
                                                                            })
                                                                        }
                                                                    }
                                                                    let design_params_panel_layout = {
                                                                        wid: 'card',
                                                                        data: {
                                                                            cards: [
                                                                                [
                                                                                    {
                                                                                        'width': '100%',
                                                                                        'component': {
                                                                                            wid: 'html',
                                                                                            data: '<hr> '
                                                                                        }
                                                                                    },
                                                                                    {
                                                                                        'width': '100%',
                                                                                        'component': t
                                                                                    },
                                                                                    {
                                                                                        'title': '',
                                                                                        'width': '100%',
                                                                                        'component': {
                                                                                            wid: 'mt-button', data: {
                                                                                                buttons: [
                                                                                                    {
                                                                                                        label: 'Close', ionFunction: createIonFunction(() => {
                                                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
                                                                    CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                                                                }
                                                            }

                                                        })
                                                    },
                                                    {
                                                        'label': 'My tracks', 'ionfunction': createIonFunction(async () => {
                                                            graph.setMessage("Select track to view exon menu")
                                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                            graph.selectOff();
                                                            let selectedTrack = null;
                                                            const dbhost = window["env"]["db"];
                                                            if (dbhost) {
                                                                let count = await GETJSON(`${dbhost}/my_tracks/count?createdBy=${getUser()}`);
                                                                if (count) {
                                                                    count = parseInt(count['count'])
                                                                }
                                                                if (count < 1000) {
                                                                    let r = await GETJSON(`${dbhost}/track_names?createdBy=${getUser()}`);
                                                                    if (r) {

                                                                        let names = r.map(track => track.name)

                                                                        let content = {}
                                                                        for (let n of r) {
                                                                            if (n.description)
                                                                                content[n.name] = ' > ' + n.description
                                                                            else {
                                                                                content[n.name] = ' > No description '

                                                                            }
                                                                        }

                                                                        let t = {
                                                                            wid: 'selection-list',
                                                                            data: {
                                                                                single_selection: true,
                                                                                show_button: false,
                                                                                singleSelect: true,
                                                                                listItems: names,
                                                                                contentItems: content,
                                                                                button_function: createIonFunction(async (items) => {
                                                                                    for (let item of r) {
                                                                                        if (item['name'] === items[0]) {
                                                                                            let rr = await GETJSON(`${dbhost}/tracks_by_id?id=${item['_id']}`);
                                                                                            let t = rr[0]
                                                                                            graph.___setTrack(t)

                                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                                        }
                                                                                    }
                                                                                })
                                                                            }
                                                                        }
                                                                        let design_params_panel_layout = {
                                                                            wid: 'card',
                                                                            data: {
                                                                                cards: [
                                                                                    [
                                                                                        {
                                                                                            'width': '100%',
                                                                                            'component': {
                                                                                                wid: 'html',
                                                                                                data: '<hr> '
                                                                                            }
                                                                                        },
                                                                                        {
                                                                                            'width': '100%',
                                                                                            'component': t
                                                                                        },
                                                                                        {
                                                                                            'title': '',
                                                                                            'width': '100%',
                                                                                            'component': {
                                                                                                wid: 'mt-button', data: {
                                                                                                    buttons: [
                                                                                                        {
                                                                                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                                                                                CurrentLayout.clearComponent('mainPanel')
                                                                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
                                                                        CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                                                                    }

                                                                }
                                                            }

                                                        })
                                                    },

                                                ]
                                            },
                                            {
                                                'label': 'Training', 'items': [

                                                    {
                                                        'label': 'New set...', 'ionfunction': createIonFunction(async () => {

                                                            let { TrainingSet } = await exec('baja/ml/training-set.js')
                                                            let va = await prompt("Create a trainingset", ["Name", "Description"], { "Name": '', "Description": "" }, 300, 400)
                                                            let m = va['Name']
                                                            if (m != null) {
                                                                let dm = va['Description']

                                                                let trainingset = new TrainingSet();
                                                                trainingset.name = m;
                                                                trainingset.desc = dm;
                                                                trainingset.user = getUser();
                                                                trainingset.type = 'track'
                                                                let rr = await POSTJSON(trainingset, `${dbhost}/training_sets`);
                                                                graph.setMessage(`Training set ${m} created`)

                                                                let button_canvas = await exec('baja/ml/training-set-manager.js', ml_manager, graph, genegraph_panel_layout)

                                                                CurrentLayout.clearComponent('labelPanel')
                                                                CurrentLayout.setComponent('labelPanel', button_canvas);
                                                            }
                                                        })
                                                    },
                                                    {
                                                        'label': "My sets", 'ionfunction': createIonFunction(async () => {
                                                            let r = await GETJSON(`${dbhost}/training_sets`);
                                                            if (r) {
                                                                let names = r.map(track => track.name)
                                                                let content = {}
                                                                for (let n of r) {
                                                                    if (n.description)
                                                                        content[n.name] = ' > ' + n.description
                                                                    else {
                                                                        content[n.name] = ' > No description '

                                                                    }
                                                                }
                                                                let t = {
                                                                    wid: 'selection-list',
                                                                    data: {
                                                                        single_selection: true,
                                                                        show_button: false,
                                                                        singleSelect: true,
                                                                        listItems: names,
                                                                        contentItems: content,
                                                                        button_function: createIonFunction(async (items) => {
                                                                            for (let item of r) {
                                                                                if (item['name'] === items[0]) {
                                                                                    let rr = await GETJSON(`${dbhost}/tracks_by_id?id=${item['_id']}`);
                                                                                    ml_manager.trainingset = item;

                                                                                    graph.runfun(async () => {

                                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                                        setTimeout(async () => {
                                                                                            let tu = await exec('baja/ml/training-set-manager.js', ml_manager, graph, genegraph_panel_layout)
                                                                                            CurrentLayout.setComponent('labelPanel', tu);

                                                                                        }, 1000);
                                                                                    })

                                                                                }
                                                                            }
                                                                        })
                                                                    }
                                                                }
                                                                let design_params_panel_layout = {
                                                                    wid: 'card',
                                                                    data: {
                                                                        cards: [
                                                                            [
                                                                                {
                                                                                    'width': '100%',
                                                                                    'component': {
                                                                                        wid: 'html',
                                                                                        data: '<hr> '
                                                                                    }
                                                                                },
                                                                                {
                                                                                    'width': '100%',
                                                                                    'component': t
                                                                                },
                                                                                {
                                                                                    'title': '',
                                                                                    'width': '100%',
                                                                                    'component': {
                                                                                        wid: 'mt-button', data: {
                                                                                            buttons: [
                                                                                                {
                                                                                                    label: 'Close', ionFunction: createIonFunction(() => {
                                                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
                                                                CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                                                            }

                                                        })
                                                    },
                                                    {
                                                        'label': 'Delete', 'ionfunction': createIonFunction(async () => {

                                                            let r = await GETJSON(`${dbhost}/training_sets`);
                                                            if (r) {
                                                                let names = r.map(track => track.name)
                                                                let content = {}
                                                                for (let n of r) {
                                                                    if (n.description)
                                                                        content[n.name] = ' > ' + n.description
                                                                    else {
                                                                        content[n.name] = ' > No description '

                                                                    }
                                                                }
                                                                let t = {
                                                                    wid: 'selection-list',
                                                                    data: {
                                                                        single_selection: true,
                                                                        show_button: false,
                                                                        singleSelect: true,
                                                                        listItems: names,
                                                                        contentItems: content,
                                                                        button_function: createIonFunction(async (items) => {
                                                                            for (let item of r) {
                                                                                if (item['name'] === items[0]) {

                                                                                    let temp = `${dbhost}/remove_training_set/${item["_id"]}`;
                                                                                    let rr = await GETJSON(temp);
                                                                                    showModal({
                                                                                        wid: 'html',
                                                                                        data: ` Training set ${item["name"]} has been removed.`
                                                                                    })

                                                                                }
                                                                            }
                                                                        })
                                                                    }
                                                                }
                                                                let design_params_panel_layout = {
                                                                    wid: 'card',
                                                                    data: {
                                                                        cards: [
                                                                            [
                                                                                {
                                                                                    'width': '100%',
                                                                                    'component': {
                                                                                        wid: 'html',
                                                                                        data: '<hr> '
                                                                                    }
                                                                                },
                                                                                {
                                                                                    'width': '100%',
                                                                                    'component': t
                                                                                },
                                                                                {
                                                                                    'title': '',
                                                                                    'width': '100%',
                                                                                    'component': {
                                                                                        wid: 'mt-button', data: {
                                                                                            buttons: [
                                                                                                {
                                                                                                    label: 'Close', ionFunction: createIonFunction(() => {
                                                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
                                                                CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                                                            }

                                                        })
                                                    },
                                                ]
                                            },
                                            {
                                                'label': 'ML', 'items': [
                                                    {
                                                        'label': "Cryptic Exon", 'ionfunction': createIonFunction(async () => {

                                                            console.log('debubg');
                                                            ml_manager.method = {
                                                                name: 'Cryptic exon', method: async () => {
                                                                    let va = await prompt("Annotation to be predicted...", ["Annotation"], { "Annotation": "Exon" }, 300, 240)
                                                                    let m = va['Annotation']
                                                                    if (m != null) {

                                                                        let r = await exec('py/tracks/testpytracks.py', ml_manager.trainingset, ['Exon'])
                                                                        showModal({
                                                                            wid: 'json',
                                                                            data: JSON.stringify(r)
                                                                        })
                                                                    }

                                                                }
                                                            }
                                                            let tu = await exec('baja/ml/training-set-manager.js', ml_manager, graph, genegraph_panel_layout)
                                                            CurrentLayout.setComponent('labelPanel', tu);
                                                        })
                                                    },

                                                    {
                                                        'label': "Test", 'ionfunction': createIonFunction(async () => {

                                                            let va = await prompt("Annotation to be predicted...", ["Annotation"], { "Annotation": "Exon" }, 300, 240)
                                                            let m = va['Annotation']
                                                            if (m != null) {

                                                                let r = await exec('py/tracks/testpytracks.py', '66898b890babb8eb8dd015bd', ['Exon'])
                                                                showModal({
                                                                    wid: 'json',
                                                                    data: JSON.stringify(r)
                                                                })
                                                            }

                                                        })
                                                    },
                                                ]
                                            },
                                        ]
                                    }
                                }
                            },

                        ]
                    ]
                }
            }

            return resolve(bpanel)

        }
        return resolve({})
    })

}
