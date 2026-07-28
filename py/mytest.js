let progressBar;
let w = {
    wid: 'progress',
    componentRef: 'progressBar',
    data: {
        'progress': 10,
        'progressBar': createIonFunction((progessBar) => {
            progressBar = progessBar;
        })
    }
}
showWidget(w);
sdfgsdfgsdfg

showWidget({
    wid: 'text',
    data: 'hello world'

})

setTimeout(() => {

    let em = new EngineMonitor((msg) => {

        log(msg)

    });
    em.addProgressListener((v) => {
        progressBar(v);
    })
    exec('py/mytest.py', em, 'test', '90080707807').then(res => {
        showWidget({
            wid: 'json',
            data: JSON.stringify(res)

        })
    })

}, 10000)
