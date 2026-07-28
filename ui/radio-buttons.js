function () {

    showWidget({
        wid: 'radio-buttons',
        data: {
            buttons: [
                {
                    label: 'test1', ionfunction: createIonFunction(() => {
                        log('click ')
                    })
                },
                {
                    label: 'test2', ionfunction: createIonFunction(() => {
                        log('click2 ')
                    })
                }

            ]
        }
    })

}
