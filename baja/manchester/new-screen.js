function () {

    const constants = CONSTANTS('MT-eln/variables.js');
    let gridWidget = null;
    let user = null;
    let searchingWidget = null;
    let client = null;
    let sharepointConfig = { 'scope': ['User.Read', 'Files.ReadWrite', 'Files.ReadWrite.All'] };
    const showHeader = async () => {
        let ionis = {
            'wid': 'html',
            'data': '<h5><font color="blue"> My Screens </font> </h5> '
        }
        return showWidget(ionis);
    }

    const stringCompare = (a, b) => {
        if (a.id < b.id) { return 1; }
        if (a.id > b.id) { return -1; }
        return 0;
    }

    showWidget({
        wid: 'html',
        data: `
            <h4> <img src="assets/img/icons/png/caret-right-2x.png"> My Screens </h4>
            `
    })

    showWidget({
        wid: 'card',
        data: {

            'style.padding-left': '12px',
            cards: [
                [

                    {
                        'component':
                        {
                            wid: 'table', data: {
                                title: 'Targets',
                                width: '50%',
                                padding_top: '10px',
                                showHeader: false,
                                rows: [
                                    {
                                        button: {
                                            'label': 'Primary screen for Human, DMD', 'ionfunction': createIonFunction(() => {

                                                clear();

                                            })
                                        },
                                        'status': 'Not submitted'
                                    },
                                    {
                                        button: { 'label': 'Primary screen for Humanm SMN2', 'ionfunction': createIonFunction(() => { }) },
                                        'status': 'Not submitted'
                                    },
                                    {
                                        button: { 'label': 'Candidate screen Human, KRAS', 'ionfunction': createIonFunction(() => { }) },
                                        'status': 'Complete'
                                    },
                                    {
                                        button: { 'label': 'Primary screen for Human, KRAS', 'ionfunction': createIonFunction(() => { }) },
                                        'status': 'Complete'
                                    },
                                    {
                                        button: { 'label': 'Primary screen for Mouse, KRAS', 'ionfunction': createIonFunction(() => { }) },
                                        'status': 'Complete'
                                    }
                                ]
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
    showWidget({
        'wid': 'html',
        'data': '<hr> '
    })

    showWidget({
        wid: 'mt-button',
        data: {

            buttons: [{
                'label': 'New design',
                ionFunction: createIonFunction(() => {
                    clear();
                    exec('baja/manchester/new-screen.js')
                })
            }]
        }
    })

}
