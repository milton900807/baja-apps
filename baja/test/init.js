function () {

    log ( ' calling html.js ')
    exec ( 'baja/test/html.js').then ( r => {

        showWidget ( {
            wid:'json',
            data:JSON.stringify ( r )
        })

    })

}
