function () {

    let file = "/tmp/RnaSeqGm12878R2x75Il200SigPooled.bigWig"
    let start = 117480025
    let end = 117668665
    let chrm = "7"
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

    let em = new EngineMonitor((msg) => {

        log(msg)

    });
    em.addProgressListener((v) => {
        progressBar(v);
    })

    exec('py/baja/bigwig/view-bigwig.py', em, file, start, end, chrm).then(res => {
        let values = res.values;
        values = values.trim();

        if (values.startsWith('[')) {
            values = values.substring(1);
        }
        if (values.endsWith(']')) {
            values = values.substring(0, values.length - 1);
        }
        let v = values.split(',');
        let xv = []
        for (let i of v) {

            i = i.trim()
            if (i === 'NaN'){}

            else {
                xv.push(parseFloat(i))
            }
        }

        showWidget({
            wid: 'json',
            data: JSON.stringify(xv)
        })
    })
}
