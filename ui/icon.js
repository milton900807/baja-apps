function () {

    let file = null;
    let ps = '';
    let path = createIonFunction((p) => {
        ps = p;
    })

    let ww = {
        wid: 'input-param-items',
        componentRef: path,
        data: {
            input_labels: ['Icon'],
            buttons: [{
                'label': 'Save', 'function': createIonFunction(async (button_label, input_params) => {
                    if (file) {
                        let name = input_params['Icon'];
                        let host_ = window['env']['apiUrl']
                        let jsonobj = {
                        }
                        let rs = await POSTFile(file, jsonobj, host_ + '/save-icon');
                        if (rs.status === "saved") {
                        }
                    }
                })
            }]
        }
    }

    let data_drop = {
        wid: 'file-drop',
        data: {
            'getRef': createIonFunction((ref) => {
            }),
            'onDropFunction': createIonFunction(async (_file) => {
                file = _file;
            })
        }
    }
    let plate_panel = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '800px',
            cards: [
                [
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: `

                            <center> <img  width="200"  src="/assets/yak.png">
                            </center>
                            `
                        }
                    },
                    {
                        'width': '100%',
                        'component': ww
                    },
                    {
                        'width': '100%',
                        'height': "300px",
                        'component': data_drop
                    },
                ]]
        }
    }
    showWidget(plate_panel)
}
