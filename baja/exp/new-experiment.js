function (library, folderid) {
    exec('lib/msgraph').then(async MSGraph => {
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }
        showWidget({
            'wid': 'html',
            'data': 'version 4'
        });
        let client = await MSGraph.getClient(sharepoint_config)
        let folder = await client.api(`/drives/${library.id}/items/${folderid}`).get();

        showWidget({
            wid: 'html',
            data: ` <i> Creating experiment in folder ${folder.name} </i>`
        })
        client.api('/me').get().then(async (user) => {

            showWidget({
                wid: 'radio-buttons',
                data: {
                    'unchecked': true,
                    'buttons': [
                        {
                            'label': 'Screening', ionfunction: createIon(() => {
                                clear();
                                exec('baja/exp/create-general-experiment.js', library, folder)
                            })
                        },
                    ],
                }
            })

        })
    })
}
