function () {
    clear();

    window.history.pushState('', '', `/app/baja/init`);
    exec('lib/msgraph.js').then(async (MSGraph) => {
        if (!MSGraph.isLoggedIn()) {

            if (window['env']['auth'] === 'b2c') {
                exec('cpd/yak.js')
            }
            else {

                let loginCheckInterval = null;
                const start = Date.now();
                const maxWait = 5 * 60 * 1000; // 5 minutes
                loginCheckInterval = setInterval(async () => {
                    try {
                        const loggedIn = await MSGraph.isLoggedIn();

                        if (loggedIn) {
                            await exec('manchester/fb.js');
                            clearInterval(loginCheckInterval);

                            return;
                        }

                        if (Date.now() - start >= maxWait) {
                            clearInterval(loginCheckInterval);
                            console.log("stopped checking login status");
                        }
                    } catch (err) {
                        console.error("login check failed:", err);
                    }
                }, 300);





                let plate_panel = {
                    wid: 'card',
                    width: '100%',
                    data: {
                        cards: [
                            [
                                {
                                    'width': '100%',
                                    'component': {
                                        wid: 'html',
                                        data: `

                                    <center> <img width="200"  src="/assets/splash.png"> </center>`
                                    }
                                }
                            ]]
                    }
                }
                showWidget(plate_panel)

            }

        } else {

            if (window['env']['auth'] === 'b2c') {

                // THE HOME SCREEN: the applications across the top, the user's files
                // underneath.
                //
                // It used to open the project workspace (cpd/yak.js), which meant the first
                // thing a user saw after signing in was a drawing canvas rather than the
                // three things this application is for. The file browser is the right home
                // -- it is where work is resumed from -- and the launcher is what makes the
                // choice of application visible without hunting through a menu.
                //
                // The row is built first and handed to the browser, because the browser
                // clears the screen before it renders; anything shown beforehand is wiped.
                let __apps = null;
                try {
                    __apps = await exec('baja/applications.js');
                } catch (e) {
                    // A launcher that failed to build must not cost the user their files.
                    console.log('[init] application launcher unavailable: ' + e);
                }
                return exec('manchester/fb.js', null, __apps)

            } else {



                let icon = await exec('baja/images/lib2.js');
                let foldericon = await exec('baja/images/folder.js');
                let users_list = {
                    wid: 'card',
                    data: {
                        width: 40,

                        cards: [
                            [
                                {
                                    'component':
                                    {
                                        wid: "base64",
                                        data: {
                                            'width': 200,
                                            image: foldericon,
                                            label: 'User space',
                                            drawTextFunction: createIonFunction((ctx) => {
                                                ctx.font = "11px Arial";
                                                ctx.shadowColor = "#000000";
                                                ctx.shadowBlur = 0;
                                                ctx.fillStyle = "black";
                                                ctx.fillStyle = 'white';
                                                ctx.fillStyle = "black";
                                                ctx.fillText('' + getUser(), 15, 100);
                                                ctx.stroke();

                                            }),
                                            click: createIonFunction(() => {
                                                clear();
                                                exec('manchester/init')
                                            })
                                        },
                                    }
                                }

                            ]
                        ]
                    }
                }

                try {
                    let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
                    MSGraph.getClient(sharepointConfig).then(async (client) => {
                        try {
                            user = await client.api(`/drives`).get();
                            let libArray = [{
                                'component':
                                {
                                    wid: "html",
                                    data: `

                            <hr>`
                                }
                            }
                            ]
                            for (let u of user['value']) {
                                if (u.name === 'Documents') {
                                } else {

                                    libArray.push({
                                        'component':
                                        {
                                            wid: "base64",
                                            data: {
                                                image: icon,
                                                label: 'Label',
                                                drawTextFunction: createIonFunction((ctx) => {
                                                    ctx.font = "20px Arial";
                                                    ctx.shadowColor = "#000000";
                                                    ctx.shadowBlur = 0;
                                                    ctx.fillStyle = "black";
                                                    ctx.fillText(u['name'], 40, 70);
                                                    ctx.stroke();
                                                    ctx.shadowBlur = 0;

                                                }),
                                                click: createIonFunction(() => {
                                                    clear();

                                                    if (isMobile()) {
                                                        exec('baja/main-menu-m.js', u)
                                                    } else {
                                                        exec('baja/main-menu.js', u)
                                                    }

                                                })
                                            },
                                        }
                                    })

                                }
                            }
                            let plate_panel = {
                                wid: 'card',
                                data: {
                                    width: 40,
                                    cards: [libArray]
                                }
                            }

                            let plate_paneltop = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {

                                                'component': users_list,
                                            },
                                            {
                                                'component': plate_panel,
                                            }
                                        ],

                                    ]
                                }
                            }
                            showWidget(plate_paneltop)

                        } catch (e) {
                            log(" Failed to load drives ")
                            showWidget({ wid: 'json', data: JSON.stringify(e) });
                            showWidget({
                                'wid': 'html',
                                'data': JSON.stringify(client)
                            });
                        }
                    })
                } catch (exception) { }

            }
        }
    })
}
