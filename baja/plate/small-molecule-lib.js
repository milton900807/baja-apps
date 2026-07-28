function () {
    let name = `20210926-L1300-FDA-approved-Drug-Library-96-well.xlsx`;
    let worksheet = `L1300-FDA-3009 cpds`

    smol = async (name, worksheet) => {
        let client = await MSGraph.getClient(sharepoint_config);
        let path = `/me/drive/root:/bajabio-screens/.chem/${name}:/workbook/worksheets/${worksheet}`;
        console.log(" path " + path);
        try {
            let filepath = `/me/drive/root:/bajabio-screens/.chem/${name}`;
            let fileobj = await client.api(filepath)
                .get();
            let objectid = fileobj['id']
            let sheet_path = `/me/drive/root:/bajabio-screens/.chem/${name}:/workbook/worksheets/${worksheet}`;
            let sheetObject = await client.api(sheet_path).get();
            let sheet_id = sheetObject['id']
            let workbookWorksheet = await client.api(`/me/drive/root:/bajabio-screens/.chem/${name}:/workbook/worksheets/${sheet_id}/range(address='A1:B100')`).get();
            return workbookWorksheet;
        } catch (exception) {
            console.log(exception)
        }
    }

}
