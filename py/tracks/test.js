function () {

    exec('ionworks/py/tracks/test.py', 'chr12:6534512-6538374', 'chr12:6534512-6538374').then(res => {
        showWidget({
            wid: 'json',
            data: JSON.stringify(res)

        })

    })

}
