function (path, type, user) {
    return new Promise(async (resolve, reject) => {

        return await exec ( 'py/db/new-experiment.py', path, type, user)

    })
}
