function (execFunction, msg) {

    if (!msg || msg === null || msg.length <= 0) {
        msg = 'Are you sure you want to edit this?'
    }

    return new Promise(async (resolve, reject) => {
        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': ' ', 'body': ``
                            ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'html',
                                data: `<font color=red> ${msg} </font>`
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
                                                execFunction();
                                                setTimeout(() => { hideAllModal(), 1000} )
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
        return resolve(zoom_to)
    })

}
