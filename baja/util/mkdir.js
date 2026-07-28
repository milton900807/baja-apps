function (foldername) {
    return new Promise(async (resolve, reject) => {
        let db = await exec('baja/util/io.js');
        let folder = db.mkdir(foldername);
        resolve(folder);
    })

}
