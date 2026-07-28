function () {

    return new Promise(async (resolve, reject) => {

        let f = (obj) => {
            if ( !obj ){
                return  ` <div>
                <font color="red">
                        Chemistry template not selected.  Select a chemistry template below before designing.
                        </font>

                </div>
                `

            }

            let t = `
                <div class="alert alert-success" role="alert">`
            if (obj.name)
                t += `<b> ${obj.name} </b><br>`
            if (obj.antisense)
                t += `<i> AS: ${obj.antisense} </i><br>`
            if (obj.sense)
                t += `<i> SS: ${obj.sense} </i><br>`

            t += '</div>'
            return t;
        }

        resolve(f);

    })

}
