function (library) {

    exec('baja/lib/db.js', library['id']).then(async (LibDB) => {
        let folder = await LibDB.folderExists('bajabio-screens');
        if (!folder)
            LibDB.mkrootdir();
        let xfiles = await LibDB.folderExists('bajabio-xfiles');
        if (!xfiles) {

            log("X-files are not installed on this library.  Please contact the administrator")
        }
    })

    exec('baja/main-menu.js', library)

}
