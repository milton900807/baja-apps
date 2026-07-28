function () {

    showWidget ( {
        wid:'html',
        data: ' HELLO WORLD <hr> '
    })

    showWidget({
        wid: 'menu',
        data: {
            menus: [
                {
                    'label': 'File', 'items': [
                        {
                            'label': 'Load experiment', 'ionfunction': createIonFunction(async () => {

                                navigator.bluetooth.requestDevice({

                                    acceptAllDevices: true,
                                    optionalServices: ['battery_service']
                                })
                                .then(device => {
                                    console.log('Device discovered', device);
                                    return device.gatt.connect();
                                })
                                .then(server => {
                                    console.log('Connected to the device');

                                })
                                .catch(error => {
                                    console.log('Connection failed', error);
                                });

                            })
                        },
                        {
                            'label': 'Load asdf-EXP441', 'ionfunction': createIonFunction(() => {
                            })

                        },

                    ]
                }
            ]
        }
    })

}
