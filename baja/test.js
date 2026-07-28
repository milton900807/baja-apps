function () {

    exec('lib/msgraph.js').then(async MSGraph => {

        let sharepointConfig = {
            'scope': ['Mail.Send']
        }

        showWidget ( {
            wid:'json',
            data:JSON.stringify ( {
                'hello':'world'
            })
        })

    })

}
