function (graph, library, folder, rules ) {
    return new Promise( async ( resolve, reject ) => {

        await exec('baja/util/copy-template.js', library.id, 'oligo-rule-filter.xlsx', folder.id);

        exec('lib/msgraph.js').then(async (MSGraph) => {
            let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
            let client = await MSGraph.getClient(sharepointConfig);
            let library_id = `/drives/${library.id}/items/${folder.id}/children`;
            let res = await client.api(library_id).get();
            let res_values = res['value']

            for (let r of res_values) {
                if (r['name'] === 'oligo-rule-filter.xlsx') {

                    let _values = [];
                    for (let rule of rules) {
                        let tmparray = [];

                        tmparray.push(rule.type);
                        tmparray.push(rule.priority);
                        tmparray.push(rule.rulestring);
                        tmparray.push(rule.scannedOligos);
                        tmparray.push(rule.filteredOligos);
                        _values.push(tmparray);
                    }

                    let workbookRange = {values: _values};

                    let rulen = _values.length + 1;

                    let filepath = `/drives/${library.id}/items/${r['id']}/workbook/worksheets/Sheet1/range(address='A2:E${rulen}')`;
                    await client.api(filepath).update(workbookRange);
                }
            }
        });
        resolve();
    });
}
