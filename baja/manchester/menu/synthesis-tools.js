function (graph, genegraph_panel_layout, lib_id) {

    return new Promise(async (resolve, reject) => {

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

                                            'label': 'Export', 'items': [
                                                {

                                                    'label': 'Export IDT', 'ionfunction': createIonFunction(async () => {
                                                        let idt = await exec('baja/chem/structure/idt/idt-format.js');
                                                        let explist = []
                                                        for (let t of graph.track) {
                                                            let row = 0;
                                                            let __index = 0;
                                                            for (let o of t.oligos) {
                                                                if (__index > 12) {
                                                                    __index = 0;
                                                                }
                                                                let well = String.fromCharCode(65 + 8 - __index) + '' + row

                                                                if (o && o.structure && o.id)
                                                                    explist.push({
                                                                        'well': well,
                                                                        'id': o.id,
                                                                        'idt': idt.format(o.structure)
                                                                    })
                                                            }
                                                        }
                                                        downloadAsCsv(explist, 'idt.csv')

                                                    })

                                                },

                                                {

                                                    'label': 'Export IDT Plate Manifest', 'ionfunction': createIonFunction(async () => {
                                                        let hlist = []

                                                        let trackName = '';
                                                        for (let t of graph.track) {
                                                            trackName += t.name + '__';
                                                            for (let o of t.oligos) {
                                                                hlist.push(o)
                                                            }
                                                        }
                                                        let idt = await exec('baja/compound-registration/reg-db.js',
                                                            library.id, hlist, graph);
                                                        downloadAsCsv(  idt, trackName + '_idt.csv')

                                                    })

                                                },

                                            ]
                                        }
                                    ]
                                }
                            }

                        },

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

        resolve();

    })

}
