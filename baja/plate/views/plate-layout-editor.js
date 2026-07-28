function (libid, fid, folderid) {

    return new Promise(async (resolve, reject) => {
        let plateview = await exec('baja/plate/views/plate-view.js', libid, fid, folderid)
        let main_layout = {
            wid: 'card',
            componentRef: 'plateEditor',
            height: '100%',
            data: {
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': plateview
                        }
                    ]
                ]
            }
        }
        showWidget(main_layout)
        resolve(plateview)
    })

}
