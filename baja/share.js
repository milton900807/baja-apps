function (path) {
    if (!path) {
        path = '/'
    }
    return new Promise(async (resolve, reject) => {
        clear();

        var result = await verifyUserPath('/share', 'Chemistry of RNA Therapeutics');
        let prod = result.raw;

        let user = getUser();
        if (user) {
            if (result && result.allowed) {
                let host_ = window['env']['apiUrl']



                const downloadurl = `${host_}/download-book?email=${encodeURIComponent(getUser())}&app=${encodeURIComponent(prod.app)}`;

                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadurl;




                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showWidget({
                    'wid': 'html',
                    'data': ` <h2> Download complete. </h2> `
                })

                infoPrompt(" Download complete ")



                return;
            } else {

            }
        }
        if (!result.allowed) {
            clear()
            let host_ = window['env']['apiUrl']
            const pdfUrl =
                `${host_}/load-pdf` +
                `?path=${encodeURIComponent(path)}`
            showWidget({
                wid: 'purchase-pdf',
                data: {
                    url: pdfUrl,
                    purchaseClicked: createIonFunction(async () => {


                        clear();
                        showWidget({
                            wid: 'checkout',
                            data: {
                                title: prod.app,
                                amount: prod.price,
                                product: prod.app,
                                features: prod.features,
                                'successListener': createIon(async (event) => {
                                    const userEmail = event.payer.email_address;
                                    let host_ = window['env']['apiUrl']
                                    const jsonobj = event;
                                    await exec('py/license/receipt.py', event)
                                    let rrr = await exec('py/license/receipt.py', event)
                                    let rs = await POSTJSON(jsonobj, host_ + '/subscription');


                                    const createResp = await fetch(`${host_}/create-temp-book-download`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            userId: userEmail,
                                            app: prod.app
                                        })
                                    });
                                    if (!createResp.ok) {
                                        console.error('Failed to create temp download');
                                        return;
                                    }
                                    const data = await createResp.json();
                                    const a = document.createElement('a');
                                    a.href = `${host_}${data.downloadUrl}`;
                                    a.style.display = 'none';
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);

                                    clear();


                                    showWidget({
                                        wid: 'html',
                                        data: `Downloading... `

                                    })



                                    showWidget({
                                        wid: 'pdf-viewer',
                                        data: {
                                            'value': rrr['pdf_base64'],
                                            'close': createIon(async () => {
                                                const a = document.createElement('a');
                                                a.href = `${host_}${data.downloadUrl}`;
                                                a.style.display = 'none';
                                                document.body.appendChild(a);
                                                a.click();
                                                document.body.removeChild(a);
                                                signup();
                                            })
                                        }
                                    })




                                })
                            }
                        })

                    })
                }
            });
        } else {


            let user = getUser();
            if (user) {
                var result = await verifyUserPath('/share', 'Chemistry of RNA Therapeutics');
                debugger;
                if (result && result.allowed) {
                    let host_ = window['env']['apiUrl']



                    const downloadurl = `${host_}/download-book?email=${encodeURIComponent(getUser())}&app=${encodeURIComponent('Chemistry of RNA Therapeutics')}`;

                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = downloadurl;




                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    showWidget({
                        'wid': 'html',
                        'data': ` Download complete. `
                    })

                    return;
                } else {
                    login();
                }


            }
        }

        return resolve();
    })

}
