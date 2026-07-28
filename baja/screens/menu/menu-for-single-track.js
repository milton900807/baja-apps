function (graph, track, genegraph_panel_layout) {
    hide_menu = false;

    let registered = false;

    return new Promise(async (resolve, reject) => {
        let butPan = {
            wid: 'menu',
            width: 300,
            data: {
                title: '  ',
                style: 'sub-container',
                menus: [

                    {
                        'label': 'DB', 'items': [
                            {
                                'label': 'Save track...', 'ionfunction': createIonFunction(async () => {
                                    const dbhost = window["env"]["db"];
                                    if (dbhost) {
                                        track.createdBy = getUser();
                                        track.createdDate = new Date().toISOString ();
                                        let r = await POSTJSON(track, `${dbhost}/save_track`);

                                        if (r.status === 404) {
                                            registered = true;
                                        } else {
                                            registered = false;
                                        }
                                    }
                                    let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                    }, " Are you sure you want to remove all amplicons except this one?")
                                    showModal(confirm)
                                })
                            },
                        ]
                    },
                ]
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', butPan);

        resolve();
    })
}
