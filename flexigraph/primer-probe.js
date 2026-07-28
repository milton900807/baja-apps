function ( ) {

    return new Promise ( async ( resolve, reject ) => {

        let Oligo = await exec ('flexigraph/oligo.js')

        let pp = class PrimerProbe extends Oligo {

            forward;
            reverse;
            probe;
            id;

        }

        return resolve ( pp );

    })

}
