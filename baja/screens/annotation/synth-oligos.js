function (graph, library, folder, alloligos) {
    return new Promise( async ( resolve, reject ) => {

        let moeArray = [
            [`/5MOEr`,`/`,`*`],
            [`/iMOEr`,`/`,``],
            [`/iMOEr`,`/`,``],
            [`/iMOEr`,`/`,``],
            [`/iMOEr`,`/`,``],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [``,``,`*`],
            [`/iMOEr`,`/`,``],
            [`/iMOEr`,`/`,``],
            [`/iMOEr`,`/`,`*`],
            [`/iMOEr`,`/`,`*`],
            [`/3MOEr`,`/`,``],
        ]
        let _iMedC = [`/iMe-d`,`C/`];

        await exec('baja/util/copy-template.js', library.id, 'oligo-synthesis.xlsx', folder.id);
        exec('lib/msgraph.js').then(async (MSGraph) => {
            let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
            let client = await MSGraph.getClient(sharepointConfig);
            let library_id = `/drives/${library.id}/items/${folder.id}/children`;
            let res = await client.api(library_id).get();
            let res_values = res['value']

            for (let r of res_values) {
                if (r['name'] === 'oligo-synthesis.xlsx') {

                    let _values = [];
                    for (let o of alloligos) {
                        let tmparray = [];
                        tmparray.push(o.idx);
                        tmparray.push(o.synthesisSequence);
                        let tmpstr=``;

                        for (let i = 0; i < o.synthesisSequence.length; i++){
                            if (!moeArray[i][0].startsWith('/') && o.synthesisSequence[i] == 'C') {
                                tmpstr += _iMedC[0];
                                tmpstr += _iMedC[1];
                                tmpstr += moeArray[i][2];
                            } else {
                                tmpstr += moeArray[i][0];
                                tmpstr += o.synthesisSequence[i];
                                tmpstr += moeArray[i][1];
                                tmpstr += moeArray[i][2];
                            }
                        }

                        tmparray.push(tmpstr);

                        let pass = null;
                        if ( o.filter == 1 ) {
                            console.log('Failed oligo')
                        } else {
                            pass = 1;
                        }
                        if (pass) {
                            _values.push(tmparray);
                        }
                    }

                    let workbookRange = {values: _values};

                    let oligon = _values.length + 1;

                    let filepath = `/drives/${library.id}/items/${r['id']}/workbook/worksheets/Sheet1/range(address='A2:C${oligon}')`;
                    await client.api(filepath).update(workbookRange);
                }
            }
        });
        resolve();
    });
}
