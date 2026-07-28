function () {

    exec('py/bio/RNA/fold.py', 'ATCGTACGATCGTAGTCGTACGATCGTAGCTAGCATCGTACGATCGTAGCTAGC').then(res => {

        showWidget({
            wid: 'json',
            data: JSON.stringify(res)
        })

    })
}
