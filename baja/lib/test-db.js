function () {
    let driveid = 'b!n_SZ5sO9vEWdFy6SfhhA30xjA4ZiOXJAsJN0raZO8Zq3lL0r4nmUTJ42OiFEo6YZ'
    exec('baja/lib/db.js', driveid).then(async LibDB => {
        let jb = await LibDB.experiment('test21');

        showWidget({
            wid: 'json',
            data: JSON.stringify(jb)
        })
    })
}
