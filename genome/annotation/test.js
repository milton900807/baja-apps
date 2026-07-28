function () {

    exec('genome/annotation/colors.js').then(r => {

        log ( r['exon']['shape'])
        showWidget({
            wid: 'json',
            data: JSON.stringify(r)
        })
    })
}
