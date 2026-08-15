function () {

    return new Promise(async (resolve, reject) => {

        let MSGraph = await exec('lib/msgraph.js');

        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }
        let client = await MSGraph.getClient(sharepoint_config);

        let user = await client.api('/me').get();

        let date = new Date();
        let bugname;
        let severity;
        let reproduction;
        let expectation;
        let result;
        let screencapture = false;
        let uri = 'https://bugs.oligodesigner.com';

        let bug_card = {
            wid: 'card',
            data: {
                "style.padding-top": '1px',
                "style.border": '1px',
                cards: [
                    [
                        {
                            'width': '100%',
                            'component':
                            {
                                wid: 'html',
                                data: `
                                    <font size='4'>Report a bug to bajabio Development</font><br>
                                    <font size='2' color='gray'>
                                        &ensp;User Name: ${user.displayName}<br>
                                        &ensp;User Email: ${user.mail}<br>
                                        &ensp;Date: ${date.toISOString().split('T')[0]}
                                    </font><br>
                                `
                            }
                        },
                        {
                            'width': '100%',
                            "style.padding-top": '4px',
                            "style.border": '1px',
                            "title": "Name your bug:",
                            'component':
                            {
                                'wid': 'input-textfield',
                                'data': {
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {
                                        bugname = w;
                                    }),
                                    'ionfunction': createIonFunction((title) => {
                                        console.log(" title " + title);
                                    }),
                                }
                            }
                        },
                        {
                            'width': '100%',
                            "style.padding-top": '4px',
                            "style.border": '1px',
                            "title": "Steps to reproduce bug:",
                            'component':
                            {
                                'wid': 'input-textfield',
                                'data': {
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {
                                        reproduction = w;
                                    }),
                                }
                            }
                        },
                        {
                            'width': '100%',
                            "style.padding-top": '1px',
                            "style.border": '1px',
                            'title': 'Expected or desired result:',
                            'component':
                            {
                                'wid': 'input-textfield',
                                'data': {
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {
                                        expectation = w;
                                    }),
                                }
                            }
                        },
                        {
                            'width': '100%',
                            "style.padding-top": '1px',
                            "style.border": '1px',
                            'title': 'Actual result:',
                            'component':
                            {
                                'wid': 'input-textfield',
                                'data': {
                                    'blocking': false,
                                    'show-button': false,
                                    'ionHookFunction': createIonFunction((w) => {
                                        result = w;
                                    }),
                                }
                            }
                        },
                        {
                            'width': '100%',
                            "style.padding-top": '1px',
                            'title': 'Severity:',
                            'component': {
                                'wid': 'radio-buttons',
                                'data': ['Purely Cosmetic', 'Slightly Functional', 'Impedes Progress', 'Really Bad'].map((b, i) => ({ label: b, ionfunction: createIonFunction(() => severity = i) }))
                            }
                        },
                        {
                            'width': '100%',
                            "style.padding-top": '1px',
                            'title': 'Capture Picture:',
                            'component': {
                                'wid': 'radio-buttons',
                                'data': [
                                    {
                                        label: 'No',
                                        ionfunction: createIonFunction(() => {
                                            screencapture = false
                                        })
                                    },
                                    {
                                        label: 'Yes',
                                        ionfunction: createIonFunction(() => {
                                            screencapture = true
                                        })
                                    },
                                ]
                            }
                        },
                        {
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Apply', ionFunction: createIonFunction(() => {

                                                return new Promise(async (resolve, reject) => {

                                                    let body = {
                                                        "fields": {
                                                            "project": {
                                                                "key": "LJLAP"
                                                            },
                                                            "summary": bugname.getWidgetValue(),
                                                            "description":
                                                                `Severity: ${severity}
Screen Capture: ${screencapture}
Steps to reproduce: ${reproduction.getWidgetValue()}
Expected result: ${expectation.getWidgetValue()}
Result: ${result.getWidgetValue()}
User: ${user.displayName}
Email: ${user.mail}
Date: ${date.toISOString().split('T')[0]}
`,
                                                            "issuetype": {
                                                                "name": "Bug"
                                                            }
                                                        }
                                                    }
                                                    hideAllModal();
                                                    console.log(uri)
                                                    console.log(body)
                                                    let bug_message = {
                                                        wid: 'html',
                                                        data: `
                                                            <font size='3'>Thank you for sending a bug.</font>`,
                                                    };
                                                    let working = await showWidget({ wid: 'working' })

                                                    await lion_engine.FILEBUG(body).then(async (res) => {
                                                        console.log(res);
                                                        uri = res['self'] + '/attachments'
                                                        working.status = 'Complete';
                                                        if (screencapture) {

                                                            showModal({
                                                                wid: 'html',
                                                                data: `
                                                                            <font size='5'>Preparing to capture screen...</font>`
                                                            });

                                                            let stream = await navigator.mediaDevices.getDisplayMedia({ video: true, preferCurrentTab: true });
                                                            hideAllModal();

                                                            let canvas = document.createElement("canvas");
                                                            let context = canvas.getContext("2d");
                                                            let video = document.createElement("video");

                                                            video.srcObject = stream;

                                                            video.onloadedmetadata = async () => {

                                                                await video.play();

                                                                await new Promise(resolve => setTimeout(resolve, 1000));

                                                                canvas.width = video.videoWidth;
                                                                canvas.height = video.videoHeight;
                                                                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, video.videoWidth, video.videoHeight);

                                                                let frame = canvas.toDataURL("image/png");
                                                                stream.getTracks().forEach(track => track.stop())

                                                                const link = document.createElement("a");
                                                                console.log(frame.split(',')[1])
                                                                link.href = frame;
                                                                link.download = `${bugname.getWidgetValue()}_${date.toISOString().split('T')[0]}.png`;
                                                                link.click();

                                                                let working = await showWidget({ wid: 'working' })
                                                                console.log(frame)
                                                                let body = {
                                                                    "uri": uri,
                                                                    "image": frame.split(',')[1],
                                                                    "name": `${bugname.getWidgetValue()}_${date.toISOString().split('T')[0]}.png`,
                                                                }
                                                                await lion_engine.FILEBUG(body, true).then(async (res) => {
                                                                    console.log(res)
                                                                    working.status = 'Complete';
                                                                    showModal(bug_message);
                                                                });

                                                            }
                                                        } else {
                                                            showModal(bug_message);
                                                        }
                                                    })

                                                    console.log(body);
                                                })
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                await hideAllModal();
                                            })
                                        }]
                                }
                            }
                        }
                    ]]
            }
        }

        showModal(bug_card)

        resolve();
    })

}
