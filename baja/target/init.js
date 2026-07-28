function (libraryId, folderId) {

    exec('ljl/lib/db.js', libraryId).then(async LibDB => {
        let test = await LibDB.list('ljl-screens/' + folderId)
        let values = test['value']
        if (values && values.length > 0) {

        } else {
            log(' No files ')
        }
        showWidget ( {
            wid:'json',
            data: JSON.stringify ( test )
        })

    })
}
