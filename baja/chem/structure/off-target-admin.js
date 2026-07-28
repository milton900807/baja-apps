function (libid) {

    return new Promise(async (resolve, reject) => {

        let genomes = []
        let MSGraph = await exec('lib/msgraph.js')
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }
        let failed_to_load = false;
        let client = await MSGraph.getClient(sharepoint_config);

        let filepath = `/drives/${libid}/root:/bajabio-xfiles/off-targets/active-indicies.json`
        try {
            let file = await client.api(filepath).get();
            if (file['@microsoft.graph.downloadUrl'] != null) {
                let jdata = await GETJSON(file['@microsoft.graph.downloadUrl'])
                genomes = jdata;
            }

        } catch (exception) {
            log(' Warning:  Active genomes not found.. so using default')
            console.log(exception.toString())
            failed_to_load = true;
        }

        if (failed_to_load) {

            genomes = [
                'Homo_sapiens.GRCh38.dna.gene',
                'Homo_sapiens.GRCh38.88.3utr',

            ]

            let off_targets_path = `/drives/${libid}/root:/bajabio-xfiles/off-targets`
            let folder = await client.api(off_targets_path).get();
            let off_target_dir = `/drives/${libid}/items/${folder.id}`

            var blob = new Blob([JSON.stringify(genomes, (key, value) => {
                console.log(" key " + key);
                if (key == "img") {
                    return 'b64';
                }
                else if (key == 'svgs') {
                    return value;
                }
                else if (key == 'canvas') {
                    return null;
                }
                else {
                    return value;
                }
            })], { type: 'application/json' });

            let response = await MSGraph.saveLG(blob, 'active-indicies.json', off_target_dir, saveStatusListener)

        }

        let editor = null;
        let select_display = createIonFunction((ref) => {
            editor = ref;
        })

        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': ' ', 'body': ``
                            ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'html',
                                data: '<font color=red> </font>'
                            }
                        }
                    ],
                    [
                        {
                            'title': '',
                            'component': {
                                wid: 'json',
                                refCallback: select_display,
                                data: JSON.stringify(genomes)
                            }

                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Save', ionFunction: createIonFunction(async () => {

                                                let job = editor.data;
                                                let genomes = JSON.parse(job)

                                                var blob = new Blob([JSON.stringify(genomes, (key, value) => {
                                                    console.log(" key " + key);
                                                    if (key == "img") {
                                                        return 'b64';
                                                    }
                                                    else if (key == 'svgs') {
                                                        return value;
                                                    }
                                                    else if (key == 'canvas') {
                                                        return null;
                                                    }
                                                    else {
                                                        return value;
                                                    }
                                                })], { type: 'application/json' });

                                                let progressBar;
                                                let w = {
                                                    wid: 'progress',
                                                    class: 'blank',
                                                    componentRef: 'progressBar',
                                                    data: {
                                                        'progress': 10,
                                                        'progressBar': createIonFunction((progessBar) => {
                                                            progressBar = progessBar;
                                                        })
                                                    }
                                                }
                                                showModal(w);

                                                let saveStatusListener = (cstart, cend, total, fileid) => {
                                                    let progress = cstart / total * 100;
                                                    console.log(" save progress.... " + progress)
                                                    progressBar(progress);
                                                    if (progress >= 100) {
                                                        hideAllModal();
                                                    }
                                                }
                                                let off_targets_path = `/drives/${libid}/root:/bajabio-xfiles/off-targets`
                                                let folder = await client.api(off_targets_path).get();
                                                let off_target_dir = `/drives/${libid}/items/${folder.id}`

                                                let response = await MSGraph.saveLG(blob, 'active-indicies.json', off_target_dir, saveStatusListener)

                                            })
                                        }]
                                }
                            }
                        }
                    ]]
            }
        }
        showWidget(zoom_to)

        resolve();
    })

}
