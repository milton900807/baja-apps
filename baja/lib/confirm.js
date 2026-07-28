function (message, execFunction) {

    let zoom_to = {
        wid: 'card',
        height:'230px',
        componentRef: 'bottomPanel',
        data: {
            height: '300px',
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
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Yes', ionFunction: createIonFunction(() => {
                                            execFunction ();
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
                ]]
        }
    }
    return zoom_to;
}
