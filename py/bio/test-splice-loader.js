function () {

    let rootPath = '/bd/splicing'
    let filename = 'ENST00000269305'

    exec('py/bio/splice/load-splicing-data.py', rootPath, filename).then(r => {
        console.log ( " decompressing " )
	let js = decompressString ( r ['results'])
        showWidget({
            wid: 'json',
            data: JSON.stringify(js)
        })
    })

}
