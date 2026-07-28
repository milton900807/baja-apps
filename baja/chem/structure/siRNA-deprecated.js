function () {
    return new Promise((resolve, reject) => {
        class SIRNA {
            sense
            antisense
            sense_start
            antisense_start
            moltype = 'siRNA'

            constructor ( jsonObj ){
                this.antisense = jsonObj.antisense
                this.sense = jsonObj.sense
                if ( jsonObj.sense_start ){
                    this.sense_start = jsonObj.sense_start
                }
                if ( jsonObj.antisense_start){
                    this.antisense_start = jsonObj.antisense_start;
                }
            }
        }
        return resolve(SIRNA);
    })
}
