function () {

    exec('lib/msgraph.js').then(async (MSGraph) => {
        let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
        MSGraph.getClient(sharepointConfig).then(async (client) => {
            try {

                let menuItems = []
                menuItems.push(
                    {
                        'name': 'Libraries',
                        'onclick': createIonFunction(() => {
                            clear();
                            exec('baja/chem/init-test.js')
                        })
                    },
                )
                let menu_config = {
                    'items': menuItems,
                    'position': 'left',
                    'menuLogo': '/assets/logos/bajabio.png',
                    'background': 'white'

                }
                showMenu(menu_config);
                user = await client.api(`/drives`).get();
                let icon = await exec('baja/images/lib2.js');
                for (let u of user['value']) {
                    if (u.name === 'Documents') {
                    } else {

                        showWidget({
                            wid: "base64",
                            data: {
                                image: icon,
                                label: 'Label',
                                width: 320,
                                drawTextFunction: createIonFunction((ctx) => {
                                    ctx.font = "25px Arial";
                                    ctx.fillStyle = "black";
                                    ctx.fillText(u['name'], 40, 70);
                                }),
                                click: createIonFunction(() => {
                                    clear();
                                    exec('baja/chem/published-chem.js', u)

                                })
                            },
                        })
                    }
                }
            } catch (e) {
                showWidget({ wid: 'json', data: JSON.stringify(e) });

                showWidget({
                    'wid': 'html',
                    'data': JSON.stringify(client)
                });
            }
        })
    })
}
