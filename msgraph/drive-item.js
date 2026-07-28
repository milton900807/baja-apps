function () {
    exec('lib/msgraph.js').then(MSGraph => {
        let sharepointConfig = { 'scope': ["Files.Read", "Files.ReadWrite", "Files.Read.All", "Files.ReadWrite.All", "Sites.Read.All", "Sites.ReadWrite.All"] };
        MSGraph.getClient(sharepointConfig).then(async (client) => {
            try {
                const conf = CONSTANTS('hts.bio/conf.js')

                user = await client.api(`/drives/b!n_SZ5sO9vEWdFy6SfhhA30xjA4ZiOXJAsJN0raZO8Zq-d56EowcnQ6mu6piwEi6O/items/01EKTSVCZTYU277UPGFRH24NLARU5CHOI5`).get();

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
