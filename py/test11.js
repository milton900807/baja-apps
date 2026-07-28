function ( ) {

    let engineMonitor = new EngineMonitor((msg) => {
        log ( msg )
    });
    engineMonitor.setMSG ( ' hello world ')

}
