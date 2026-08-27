function () {

    const price = 55;

    exec('cpd/license').then(async license => {

        const MSGraph = await exec('lib/msgraph');
        if (!MSGraph.isLoggedIn()) {
            signup();
            return;
        }
        let checkout_panel = {
            wid: 'checkout',
            data: {
                'amount': price,
                'style.justifyContent': 'center',
                'license': license,
                'successListener': createIon(async (event) => {
                    runcheck(event);
                })
            }
        }

        const runcheck = async (event) => {
            const userEmail = event.payer.email_address;
            if (isMobile()) {
                clear();
                showWidget({
                    wid: 'json',
                    data: ' Access granted to user: " + userEmail'
                })
            } else {

                if (getUser() && getUser() != userEmail) {
                    infoPrompt(" Access granted to user: " + getUser());
                    resolve();
                }
            }
            setTimeout(async () => {
                let host_ = window['env']['apiUrl']
                const jsonobj = event;
                let rs = await POSTJSON(jsonobj, host_ + '/subscription');
                clear();
                resolve(exec('cpd/init'))
            }, 5000)

        }

        let descHook = createIonFunction((p) => {
            licenseEditor = p;
        });

        let sequence_input = {
            wid: 'card',
            "height": "500px",
            data: {
                "style.padding-top": '1px',
                "style.border": '1px',
                "style.height": "500px",
                cards: [
                    [

                        {
                            'width': '100%',
                            'component': {
                                wid: 'html', data: `<center><h3> Early access release is for a limited time only.</h3> </center>`
                            },
                        }, {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: `(Early access) Purchase  $${price}/year`, ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                clear();

                                                showWidget(checkout_panel)
                                            })
                                        }
                                    ]
                                }
                            },
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'carousel',
                                data: {
                                    images: [
                                        await exec('icons/svg/demo-set', 'AI'),
                                        await exec('icons/svg/demo-set', 'startup'),
                                        await exec('icons/svg/demo-set', "timeline"),
                                        await exec('icons/svg/demo-set', 'financial'),
                                        await exec('icons/svg/demo-set', 'purchase')
                                    ], links: [
                                        () => {


                                        },
                                        () => {


                                        },
                                        () => {


                                        },
                                        () => {


                                        }, () => {
                                            hideAllModal();
                                            clear();
                                            showWidget(checkout_panel)

                                        }
                                    ]
                                }
                            }
                        },

                        {
                            'width': '100%',
                            'height': 300,
                            'component': {
                                wid: 'html',
                                data: license
                            }
                        },

                    ]
                ]
            }
        }
        showWidget(sequence_input)
    })

}
