function (name, lib, folder, vcfile, inst, parent_widget) {
    return new Promise(async (resolve, reject) => {

        console.log('debubg');
        let host = window["env"]["appHost"];

        console.log ( ' -0------ > ' +  host )
        if (!host.startsWith('https') && (!host.startsWith('http')))
            host = `https://${host}`

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
            console.log ( ' --- ' + host );
            let lst = `${host}/ionworks/py/baja/vcf/install-vcf.py`;
            let install_status = await exec(lst, em, lib, vcfile);
            inst = install_status.pathob;
            if (inst === null || inst.length === 0) {
                return resovle({ 'status': 'Failed to get path from server ' })
            }
            let sharepoint_config = {
                'scope': ['User.Read', 'Files.Read'
                ]
            }
            editor1.setContent(editor1.getContent() + '\n Register installation with project (gene-graph.xlsx).')
            let client = await MSGraph.getClient(sharepoint_config);
            let sheet_path = `/drives/${lib}/items/${folder}:/gene-graph.xlsx`;
            let gene_graph = await client.api(sheet_path).get();
            let sheetpath = `/drives/${lib}/items/${gene_graph.id}/workbook/worksheets`;
            let sheetObjectTab = await client.api(sheetpath).get();
            let sheet_tabs = sheetObjectTab.value;
            let vcfTab = null;
            for (let sheet of sheet_tabs) {
                if (sheet.name === 'data.Variants') {
                    vcfTab = sheet.id
                }
            }
            if (!vcfTab) {

                editor1.setContent(editor1.getContent() + '\n gene-graph.xlsx: vcf tab not found.  Creating one.')

                const workbookWorksheet = {
                    name: 'data.Variants'
                };
                await client.api(`/drives/${lib}/items/${gene_graph.id}/workbook/worksheets/add`)
                    .post(workbookWorksheet);
                sheetObjectTab = await client.api(sheetpath).get();
                sheet_tabs = sheetObjectTab.value;
                vcfTab = null;
                for (let sheet of sheet_tabs) {
                    if (sheet.name === 'data.Variants') {
                        vcfTab = sheet.id
                    }
                }
            }

            if (vcfTab) {
                sheetpath = `/drives/${lib}/items/${gene_graph.id}/workbook/worksheets/${vcfTab}`;
                sheetObjectTab = await client.api(sheetpath).get();
                let rowIndex = 1000;
                let sheetObject = await client.api(`/drives/${lib}/items/${gene_graph.id}/workbook/worksheets/${sheetObjectTab.id}/range(address='C1:C${rowIndex}')`).get();
                let v = sheetObject.values;
                let count = 1;
                let alreadyInstalled = false;
                for (let i of v) {
                    if (i != null && i.length > 0) {
                        let iv = i[0]
                        if (iv != null && iv.length > 0) {
                            if (iv === vcfile) {
                                alreadyInstalled = true;
                            }
                            count++;
                        }
                    }
                }
                if (alreadyInstalled) {

                    editor1.setContent(editor1.getContent() + '\n Already installed in the gene-graph.')

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
                                            data: '<font color=red> The file is already installed  </font>'
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
                                                            console.log('debubg');
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
                } else {
                    editor1.setContent(editor1.getContent() + '\n Updating gene-graph.')
                    let path = `/drives/${lib}/items/${gene_graph.id}/workbook/worksheets/${sheetObjectTab.id}/range(address='A${count}:E${count}')`;
                    let j = [[name, lib, vcfile, host, inst]]

                    let workbookRange = { values: j };

                    try {
                        let updateResponse = await client.api(path).update(workbookRange);

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
                                                data: '<font color=red> Installation complete. </font>'
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

                        resolve(updateResponse)
                    } catch (exception) {
                        console.log(exception);
                        return resolve(exception);
                    }
                }
            } else {

                alert(' failed to create the tab ')
                editor1.setContent(editor1.getContent() + '\n Failed to create the VCF tab in gene-graph.')

            }

        })
    })

}
