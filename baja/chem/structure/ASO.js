function () {
    return new Promise((resolve, reject) => {
        class ASO {
            antisense
            moltype = 'ASO'

            constructor ( jsonObj ){
                this.antisense = jsonObj.antisense
            }
        }
        return resolve(ASO);
    })
}
