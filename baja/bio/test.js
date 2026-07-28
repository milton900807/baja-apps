function () {

    let editor1;
    let cb3 = createIonFunction((_editor) => {
        editor1 = _editor;
    })
    let x= 10;
    let y = 19;

    let export_sequence = {
        wid: 'card',
        data: {
            height: '800px',
            cards: [
                [
                    {
                        'title': 'CLUSTAL O Alignment file',
                        'width': '100%',
                        'component': {
                            wid: 'text-editor',
                            refCallback: cb3,
                            data: ''
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                            hideAllModal();
                                            exec('baja/bio/alginment-to-tracks.js', editor1.code, x, y).then(tracks => {
                                                let prev = null;
                                                console.log('debubg');
                                                for (let t of tracks) {
                                                    graph.track.push(t)
                                                    prev = t;
                                                }
                                            })

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
    showModal(export_sequence)

}
