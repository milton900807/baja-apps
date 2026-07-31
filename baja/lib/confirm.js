function (message, execFunction) {

    let zoom_to = {
        wid: 'card',
        height: '230px',
        componentRef: 'bottomPanel',
        data: {
            height: '500px',
            cards: [
                [
                    {
                        'title': ' ', 'body': ``
                        ,
                        'width': '90%',
                        'component':
                        {
                            wid: 'html',
                            data: `<font color=red> ${message} </font>`
                        }
                    }], [
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Yes', ionFunction: createIonFunction(() => {
                                            execFunction();
                                            hideAllModal();
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            hideAllModal();
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ],
                [
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'html', data: ''
                        }
                    }
                ]]
        }
    }
    return zoom_to;
}
