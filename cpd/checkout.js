function () {

    const price = 99;

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
                            // Where the subscription fee goes, stated at the point of paying
                            // rather than buried in a footer: it is part of what the buyer is
                            // deciding. The link is the campaign itself so the claim can be
                            // checked rather than taken on trust. "A child with ALS" rather
                            // than a cause or an organisation, because the link goes to one
                            // family's campaign and the sentence should match where it lands.
                            //
                            // NET proceeds, not gross: payment-processor fees and taxes come
                            // off the top before the donation, and promising 100% of the
                            // subscription price would commit money that never arrives.
                            'width': '100%',
                            'component': {
                                wid: 'html', data: `<center style="padding:6px 14px 14px;font:13px Arial;color:#334155;line-height:1.5;">
                                    <div><b>100% of net proceeds go to a child with ALS.</b></div>
                                    <div style="margin-top:4px;">
                                        <a href="https://gofund.me/1d004e7b0" target="_blank" rel="noopener noreferrer"
                                           style="color:#0b6bcb;text-decoration:underline;">See the campaign</a>
                                    </div>
                                </center>`
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
