function (app, positions) {

    let price = 2
    let path = app?.path;

    if (!path) {
        path = 'baja/init'
    }

    return new Promise(async (resolve, reject) => {
        clear();

        const MSGraph = await exec('lib/msgraph.js')

        let license = await exec('baja/datayak/license')

        if (!app || !app.raw)
            return resolve();
        clear();


        setInterval(() => {
            if (MSGraph.isLoggedIn()) {
                window.location.reload();

            }
        }, 5000)


        let button_canvas2 = {
            wid: 'card',
            data: {
                height: '800px',
                width: '800px',
                cards: [
                    [
                        {
                            'title': ' ', 'body': ``
                            ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'radio-buttons',

                                data: [
                                    {
                                        label: 'Login',
                                        svg: await exec('icons/svg/login'),
                                        ionfunction: createIonFunction(
                                            () => {
                                                login();
                                            }
                                        )
                                    }]
                            }
                        },
                    ]
                ]
            }
        }

        price = app.raw.price;
        let checkout_panel = {
            wid: 'checkout',
            data: {
                'amount': price,
                'style.justifyContent': 'center',
                'email': getUser(),
                'style.justifyContent': 'center',
                'license': license,
                'product': app.raw.app,
                'email': getUser(),
                'features': app.raw?.features,
                'demo': app.raw?.demo,
                'successListener': createIon(async (event) => {
                    const userEmail = event.payer.email_address;
                    let host_ = window['env']['apiUrl']
                    const jsonobj = event;
                    await exec('py/license/receipt.py', event)
                    let rrr = await exec('py/license/receipt.py', event)
                    let rs = await POSTJSON(jsonobj, host_ + '/subscription');
                    clear();
                    if (!MSGraph.isLoggedIn()) {







                        let ljl_ccount = {
                            wid: 'card',
                            data: {
                                height: '800px',
                                width: '800px',
                                cards: [
                                    [

                                        {
                                            'title': ' ', 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: `<font color=red> Thank you!  If you have not logged in using this email ${event.payer.email_address} start here: </font>`
                                            }
                                        },

                                        {
                                            'title': ` `, 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'radio-buttons',

                                                data: [
                                                    {
                                                        label: 'Sign up',
                                                        description: '',
                                                        type: 'Sign-up',
                                                        ionfunction: createIonFunction(
                                                            async () => {
                                                                signup();
                                                            }
                                                        )
                                                    },
                                                ]
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        showWidget(ljl_ccount)
                    } else {



                        if (getUser() && getUser() != userEmail) {
                            let ljl_ccount = {
                                wid: 'card',
                                data: {
                                    height: '800px',
                                    width: '800px',
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': ``
                                                ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: `<font color=red> Thank you!  If you have not logged in using this email ${event.payer.email_address} start here: </font>`
                                                }
                                            },
                                            {
                                                'title': ``, 'body': ``
                                                ,
                                                'width': '90%',
                                                'component':
                                                {
                                                    wid: 'radio-buttons',

                                                    data: [
                                                        {
                                                            label: 'Sign up',
                                                            description: '',
                                                            type: 'Sign-up',
                                                            ionfunction: createIonFunction(
                                                                async () => {
                                                                    logout()
                                                                    const apphost = window.env.appHost;
                                                                    const base = apphost.replace(/\/+$/, "");
                                                                    const path = "/app/baja/signup".replace(/^\/+/, "");
                                                                    const url = `${base}/${path}`;
                                                                    window.open(url, "_blank", "noopener,noreferrer");
                                                                    return url;
                                                                }
                                                            )
                                                        },
                                                    ]
                                                }
                                            },
                                        ]
                                    ]
                                }
                            }
                            showWidget(ljl_ccount)
                        } else {

                        }



                    }
                    showWidget({
                        wid: 'pdf-viewer',
                        data: {
                            'value': rrr['pdf_base64'],
                            'close': createIon(async () => {
                                await exec('baja/init')
                            })
                        }
                    })

                })
            }
        }

        showWidget(checkout_panel);

    })
}
