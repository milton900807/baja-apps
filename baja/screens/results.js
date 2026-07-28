function () {
    let experiment = 'kras';

    let showFiles = async () => {
        let sharepointConfig = { 'scope': ['User.Read', 'Files.ReadWrite', 'Files.ReadWrite.All'] };
        let client = await MSGraph.getClient(sharepointConfig);
        let directory = await client.api(`/me/drive/root:/bajabio-screens/${experiment}:/children`).get();

        let files = [];
        for (let v of directory['value']) {
            files.push(
                {
                    button: {
                        'label': v.name, 'ionFunction': createIonFunction(() => {
                            clear();

                            exec('baja/screens/results/dose-response.js', experiment + '/' + v.name, 'plate-results', 'A1:F33')

                        })
                    },
                    'status': 'Not submitted'

                })
        }

        showWidget({
            wid: 'card',
            data: {
                'style.padding-left': '12px',
                cards: [
                    [

                        {
                            title: experiment + ':',
                            'component':
                            {
                                wid: 'table', data: {
                                    title: 'Dose-response screens',
                                    width: '50%',
                                    padding_top: '10px',
                                    showHeader: false,
                                    rows: files
                                }
                            }
                        },
                        {
                            'component':
                            {
                                wid: 'table', data: {
                                    title: 'Plates',
                                    width: '40%',
                                    showHeader: false,
                                    rows: [
                                        {
                                            button: { 'label': 'Human, DMD: 5 plates ordered [IDT]', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Human SMN2: 3 plates received [QC]', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Mouse, KRAS: 3 plates  [Inventory]', 'ionfunction': createIonFunction(() => { }) },
                                        }
                                    ]
                                }
                            }
                        }
                    ],

                    [
                        {
                            'component':
                            {
                                wid: 'table', data: {
                                    title: 'Analysis & Reports',
                                    padding_top: '10px',
                                    showHeader: false,
                                    rows: [
                                        {
                                            button: { 'label': 'Mouse, KRAS; Dose-response', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Mouse, KRAS; Off targets', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Mouse, KRAS; primary screen', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Human, DMD; Off-targets', 'ionfunction': createIonFunction(() => { }) },
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            'component': {
                                wid: 'table',
                                showHeader: false,
                                data: {
                                    title: 'Chemistry',
                                    padding_top: '10px',
                                    rows: [
                                        {
                                            button: { 'label': 'ASO templates', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'siRNA templates', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Other templates', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Conjugates', 'ionfunction': createIonFunction(() => { }) },
                                        },
                                        {
                                            button: { 'label': 'Monomers', 'ionfunction': createIonFunction(() => { }) },
                                        }
                                    ]
                                }
                            }
                        }

                    ]]
            }
        })

    }

    showFiles().then(r => { })

}
