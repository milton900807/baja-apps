function (path, product) {
    return new Promise(async (resolve, reject) => {
        clear()
        if ( !path || path.length === 0 ){
            path = 'unknown'
        }
        var result = await verifyUserPath(path, product);
        await exec('baja/datayak/ljlcheckout.js', result)
        resolve();
    })
}
