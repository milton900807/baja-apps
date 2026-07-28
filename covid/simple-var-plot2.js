function () {

    (async () => {
        const ELN_excel_sheet = 'countries'
        const ELN_variants = 'variants'
        const ELN_data = 'data'

        let lb = await showWidget({
            wid: 'html',
            data: 'Loading parameters... '
        })

        let excel_doc_name = 'lineage_report.xlsx'
        const experimentid = 'MT-EXP406'
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read'
            ]
        }

        let path = `https://graph.microsoft.com/beta/sites/test.sharepoint.com,7132997e-aa7a-4634-baa2-d7497e989ca9,37c82dc3-1cc3-4a42-a224-3bc28a92d4da/drives/b!fpkycXqqNEa6otdJfpicqcMtyDfDHEJKoiQ7woqS1Nq0g7K2aXGrT4pji5Lb1gBI/items/01QGFOKD5OLQBQ6SAY4RCLA53ZEA7KFO56/workbook/worksheets/${ELN_excel_sheet}/range(address='A2:C226')`

        let client = await MSGraph.getClient(sharepoint_config);
        let atb = await client.api(path)
            .get();
        let country_codes = []

        let t = atb['text']
        for (let i of t) {
            country_codes.push(i[2] + ', ' + i[0])
        }

        let engineMonitor = new EngineMonitor((msg) => {
            lb.setHTML(msg)
        });
        lb.setHTML('')

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
        loc = country_codes;
        vlist = []
        vlist.push(...voi);
        vlist.push(...voc)
        ndays_list = [
            180,
            120,
            60,
            30
        ]

        let ml = await showWidget({
            wid: 'multi-select',
            data: {
                'list': vlist,
                'ionfunction': createIonFunction(async (vlist_selected) => {
                    let ml2 = await showWidget({
                        wid: 'multi-select',
                        data: {
                            'list': loc,
                            'ionfunction': createIonFunction(async (selected) => {
                                let html_lb = await showWidget({
                                    wid: 'html',
                                    data: 'Past number of days'
                                })

                                let ml3 = await showWidget({
                                    wid: 'multi-select',
                                    data: {
                                        'list': ndays_list,
                                        'ionfunction': createIonFunction(async (nday_selected) => {
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
                                                    location.push(key.split(',')[1].trim())
                                            }
                                            let ndays = []
                                            nd = Object.keys(nday_selected[0]);
                                            for (let n of nd) {
                                                if (nday_selected[0][n]) {
                                                    ndays.push(parseInt(n))
                                                }
                                            }

                                            await runEngine(variants, location, ndays)
                                        })
                                    }
                                })
                            })
                        }
                    })
                })
            }
        })
        let runEngine = async (vvlist, llist, ndays) => {
            let working = await showWidget({
                'wid': 'working',
                'data': {
                    'message': `Loading data for ${ndays} days...`
                }
            })
            exec('py/lineage-track.py', engineMonitor, vvlist, llist, ndays).then(async (r) => {
                await clear();
                lb = await showWidget({
                    wid: 'html',
                    data: ''
                })
                let plots = r['images']
                let keys = Object.keys(plots);
                let ht = '<hr>'
                for (let key of keys) {
                    let item = plots[key]
                    ht += `${key}<img src="${item['image_url']}"><hr>`;
                }
                let downloads = r['downloads']
                keys = Object.keys(downloads);
                for (let key of keys) {
                    let item = downloads[key]
                    ht += `<a href="/py-fi/${item['file_url']}"> Download Report </a>
                    `;
                }
                lb.setHTML(ht)
                working.status = 'done'
            })

        }
    }
    )();
}
