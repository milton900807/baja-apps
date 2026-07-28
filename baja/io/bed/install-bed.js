function (name, lib, folder, vcfile, inst, parent_widget) {

    return new Promise(async (resolve, reject) => {
        let host = window["env"]["appHost"];
        if (!host.startsWith('https') && (!host.startsWith('http')))
            host = `https://${host}`

        console.log(' host ' + host)
        clear();
        let progressBar;
        let w = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 0,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }
        showWidget(w);
        let editor1;
        let cb3 = createIonFunction((_editor) => {
            editor1 = _editor;
        })
        let status_comp = {
            wid: 'card',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': 'Installation status',
                            'width': '100%',
                            'component': {
                                wid: 'text-editor',
                                refCallback: cb3,
                                data: ''
                            }
                        }
                    ]]
            }
        }
        showWidget(status_comp)
        let em = new EngineMonitor((msg) => {
            editor1.setContent(editor1.getContent() + '\n' + msg);
        })
        em.addProgressListener((v) => {
            console.log(' v ' + v);
            progressBar(+v);
        })
        exec('lib/msgraph').then(async (MSGraph) => {
            progressBar(1)
            let install_status = await exec(`${host}/ionworks/py/baja/bed/install-bed.py`, em, lib, vcfile, 'inst');
            inst = install_status.pathob;
            if (inst === null || inst.length === 0) {
                return resolve({ 'status': 'Failed to get path from server ' })
            }

            let zoom_to = {
                wid: 'card',
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
                                    data: '<font color=red> The BED file is already installed  </font>'
                                }
                            },
                            {
                                'title': '',
                                'width': '100%',
                                'component': {
                                    wid: 'mt-button', data: {
                                        buttons: [
                                            {
                                                label: 'OK', ionFunction: createIonFunction(async () => {
                                                    hideAllModal();
                                                    clear();

                                                    showWidget(parent_widget);
                                                })
                                            }
                                        ]
                                    }
                                }
                            }
                        ]]
                }
            }
            showWidget(zoom_to)
        })
    })

}
