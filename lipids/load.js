function () {

    let config = {
        'scope': ['Files.ReadWrite']
    };
    let env = CONSTANTS('ddfd-eln/variables.js')
    let v = `/drives/${env.ELN_DRIVE_ID}/items/${env.ELN_FOLDER_ID}`
    MSGraph.getClient(config).then(async (client) => {
        showWidget({
            wid: 'file-drop',
            data: {
                uploadCompleteFunction: createIonFunction(async (response) => {
                    clear();
                    let html = showWidget({
                        wid: 'html',
                        data: 'Upload complete.'
                    })
                    let id = response[0]['id']
                    let temp = `/drives/${env.ELN_DRIVE_ID}/items/${id}/workbook/worksheets/Sheet1/range(address='A5:BS55')`

                    setTimeout(async () => {
                        log ( ' Parsing... ')
                        let d = await client.api(temp).get();

                        let values = d['values']
                        let formulations = []
                        for (let c of values) {
                            let b = {}

                            if (c[0] != null && c[0].length > 0) {
                                b['batch'] = c[0].trim()
                                b['ATF'] = c[1]
                                b['process_description'] = c[2]
                                b['lipid_composition'] = c[3]
                                b['ATN'] = c[6]
                                b['api_description'] = c[7]
                                b['date'] = c[8]
                                b['storage_conditions'] = c[9]
                                b['diameter'] = c[46]
                                b['pdi'] = c[46]
                                b['endcap_percent'] = c[46]
                                b['fragment_analysis'] = c[70]
                                formulations.push(b)
                            } else {
                                break;
                            }
                        }

                        let db = await exec('lipids/db.js')

                        let html_str = '';
                        let commitlist = []
                        for (let f of formulations) {
                            let test = await db.select('user_db.lipids', 'formulations',
                                `d->>'ATF' = '${f['ATF']}'`)
                            if (test && test.length > 0) {
                                console.log(" we found that id : " + f['ATF'])
                                html_str += ` ${f['ATF']} is already added to the database. <hr> `
                            } else {
                                commitlist.push(f)
                            }

                        }
                        clear ();
                        if (html_str.length > 0) {
                            showWidget({
                                wid: 'html',
                                data: html_str
                            })
                        }

                        if (commitlist.length > 0) {
                            showWidget({
                                wid: 'html',
                                data: 'Adding the following to the database.'
                            })
                            showWidget({
                                wid: 'json',
                                data: JSON.stringify(commitlist)
                            })
                        }else {
                            showWidget({
                                wid: 'html',
                                data: 'Nothing added to the database.'
                            })

                        }

                    }, 2000)

                }),
                getUploadFolder: createIonFunction(() => {
                    let path = `${v}:/-`;
                    clear();
                    showWidget({
                        wid: 'html',
                        data: 'Uploading...'
                    })
                    return path;
                })
            }
        })

    })
}
