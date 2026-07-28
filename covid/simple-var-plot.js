function () {

    (async () => {
        let lb = await showWidget({
            wid: 'html',
            data: ''
        })
        let engineMonitor = new EngineMonitor((msg) => {
            lb.setHTML(msg)
        });

        voi = ["AV.1",
            "B.1.1.318",
            "B.1.427",
            "B.1.427/429",
            "B.1.429",
            "B.1.525",
            "B.1.526",
            "B.1.617.1",
            "B.1.617.3",
            "C.36.3",
            "C.37",
            "P.2",
            "P.3"
        ]
        voc = [
            'AY.1',
            'AY.2',
            'B.1.1.7',
            'B.1.351',
            'B.1.617.2',
            'P.1',
            'P.1.1',
            'P.1.2']
        loc = ['AUT', 'USA', 'BRA', 'CHE', 'RUS', 'TUR', 'FRA', 'FIN', 'GAB', 'DEU', 'HUN', 'ISL', 'INS']

        vlist = []
        vlist.push(...voi);
        vlist.push(...voc)
        ndays = [

        ]

        let ml = showWidget({
            wid: 'multi-select',
            data: {
                'list': vlist,
                'ionfunction': createIonFunction(async (vlist_selected) => {
                    let ml2 = showWidget({
                        wid: 'multi-select',
                        data: {
                            'list': loc,
                            'ionfunction': createIonFunction(async (selected) => {
                                let variants = []
                                let keys = Object.keys(vlist_selected[0])
                                for (let key of keys) {
                                    if (vlist_selected[0][key])
                                        variants.push(key)
                                }
                                let location = []
                                keys = Object.keys(selected[0])
                                for (let key of keys) {
                                    if (selected[0][key])
                                        location.push(key)
                                }

                                runEngine(variants, location)
                            })
                        }
                    })
                })
            }
        })
        let runEngine = async (vvlist, llist) => {
            let working = await showWidget({
                'wid': 'working',
                'data': {
                    'message': 'Loading data for the last 60 days...'
                }
            })
            exec('py/test2.py', engineMonitor, vvlist, llist, 60).then(async (r) => {
                await clear();
                lb = await showWidget({
                    wid: 'html',
                    data: ''
                })
                let keys = Object.keys(r);
                let ht = '<hr>'
                for (let key of keys) {
                    let item = r[key]
                    ht += `${key}<img src="${item['image_url']}"><hr>`;
                }
                lb.setHTML(ht);
                working.status = 'done'

            })
        }
    }
    )();

}
