function () {

    return new Promise(async (resolve, reject) => {

        await signup()
        return resolve()
    })
}
