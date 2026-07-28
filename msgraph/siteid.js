function () {

    exec('lib/msgraph.js').then(MSGraph => {

        let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
        MSGraph.getClient(sharepointConfig).then(async (client) => {
            try {

                user = await client.api('/sites/htsbiology.sharepoint.com:/sites/demo:/drives').get();

                showWidget({ wid: 'json', data: JSON.stringify(user) });

            } catch (e) {
                showWidget({ wid: 'json', data: JSON.stringify(e) });
                log(JSON.stringify(e));
                showWidget({
                    'wid': 'html',
                    'data': JSON.stringify(client)
                });
            }

        })

    })

}
