function (graph, library, folder, alloligos, appliedRules, startidx) {
    return new Promise ( async (resolve, reject) => {

        if (!startidx) {
            startidx = 222222;
        }

        await exec('baja/util/copy-template.js', library.id, 'oligo-filter.xlsx', folder.id);
        exec('lib/msgraph.js').then(async (MSGraph) => {
            let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
            let client = await MSGraph.getClient(sharepointConfig);
            let library_id = `/drives/${library.id}/items/${folder.id}/children`;
            let res = await client.api(library_id).get();
            let res_values = res['value']

            for (let r of res_values) {
                if (r['name'] === 'oligo-filter.xlsx') {

                    let oligon = alloligos.length + 1;

                    let _values = [];
                    for (let o of alloligos) {
                        let tmparray = [];
                        tmparray.push(o.id);

                        tmparray.push('NaN')

                        o.idx = startidx;
                        startidx += 1;
                        tmparray.push(o.synthesisSequence);
                        if ( o.filter == 1 ) {
                            tmparray.push('FAIL');
                        } else {
                            tmparray.push('PASS');
                        }

                        let tmplinkSnpindels = JSON.stringify(o.linkSnpindels).replace(/[\[\]\"]/g,'');
                        tmparray.push(tmplinkSnpindels);
                        _values.push(tmparray);
                    }

                    let workbookRange = {values: _values};

                    let filepath = `/drives/${library.id}/items/${r['id']}/workbook/worksheets/Sheet1/range(address='A2:E${oligon}')`;
                    await client.api(filepath).update(workbookRange);

                    for (let i = 0; i < appliedRules.length; i++) {

                        let workbookCol = String.fromCharCode(70 + i);

                        let _values = alloligos.map( (_o) => {
                            if ( _o.ruleexp ) {
                                let otindex = _o.ruleexp.map( (_ot) => _ot[0]).indexOf(appliedRules[i].oligomessage);
                                if ( otindex != -1) {
                                    return [_o.ruleexp[otindex][1].toString()];
                                }
                            }
                            return [' '];
                        });
                        _values.unshift([appliedRules[i].outmessage]);

                        let workbookRange = {values: _values};

                        let filepath = `/drives/${library.id}/items/${r['id']}/workbook/worksheets/Sheet1/range(address='${workbookCol}1:${workbookCol}${oligon}')`;
                        await client.api(filepath).update(workbookRange);
                    }

                    _values = [];
                    _values.push([`Filter PASS/FAIL explanation`]);
                    for (let o of alloligos) {
                        let tmpfilterexp = JSON.stringify(o.filterexp.map((_o) => _o[0])).replace(/[\[\]\"]/g,'');
                        tmpfilterexp += ' ';
                        _values.push([tmpfilterexp]);

                    }

                    workbookCol = String.fromCharCode(70 + appliedRules.length);

                    workbookRange = {values: _values};
                    console.log(workbookRange);

                    filepath = `/drives/${library.id}/items/${r['id']}/workbook/worksheets/Sheet1/range(address='${workbookCol}1:${workbookCol}${oligon}')`;
                    await client.api(filepath).update(workbookRange);

                    _values = [];
                    _values.push([`Overlapping genes`]);
                    for (let o of alloligos) {

                        let offtargetgenes = await (async(a) => {
                            if ( a && a.length > 0 ) {
                                let tmp = [];
                                for (let ot of a) {
                                    if (ot[6] && ot[6].length > 0) {
                                        tmp.push(`${ot[6].join(',')} overlap at distance ${ot[4]} with ${ot[5]} contiguous bases `);
                                    }
                                }
                                return tmp.join(',');
                            } else {
                                return ' ';
                            }
                        })(o.offtarget);
                        _values.push([offtargetgenes]);
                    }
                    console.log('debubg');
                    workbookCol = String.fromCharCode(70 + appliedRules.length + 1);

                    workbookRange = {values: _values};
                    console.log(workbookRange);

                    filepath = `/drives/${library.id}/items/${r['id']}/workbook/worksheets/Sheet1/range(address='${workbookCol}1:${workbookCol}${oligon}')`;
                    await client.api(filepath).update(workbookRange);

                }
            }
        });
        resolve();
    });
}
