function (db, id) {
    return new Promise(async (resolve, reject) => {

        let r = await exec('baja/ncbi/efetch.py', db, id);

        resolve(r)
    })
}
