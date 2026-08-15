function (graph, io) {

    let m = {
        'label': 'Track', 'ionfunction': createIonFunction(() => {
            exec ('baja/manchester/menu/select-track-action.js', graph );
        })
    }
    return m;
}
