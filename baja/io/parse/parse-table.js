function (text) {

    return new Promise(async (resolve, reject) => {
        function parseTableString(tableString) {
            const rows = tableString.trim().split('\n');
            const result = [];
            rows.forEach(row => {
                const columns = row.split(/\s+/);
                const obj = {
                    id: columns[0],
                    name: columns[1]
                };
                result.push(obj);
            });

            return result;
        }

        function parseListString(tableString) {
            const rows = tableString.trim().split('\n');
            const result = [];
            rows.forEach(row => {
                const columns = row.split(/\s+/);
                const obj = {
                    id: columns[0],
                    name: columns[0]
                };
                result.push(obj);
            });
            return result;
        }

        function isListOfIDs(input) {

            const lines = input.split('\n').map(line => line.trim());

            const ncbiPattern = /^NM_\d+$/;
            const ncbiRPattern = /^NR_\d+$/;
            const ensemblPattern = /^ENST\d+$/;

            for (const line of lines) {
                if (!ncbiRPattern.test(line) && !ncbiPattern.test(line) && !ensemblPattern.test(line)) {
                    return false;
                }
            }

            return true;
        }

        function isTableString(tableString) {
            const rows = tableString.trim().split('\n');
            let columnCount = null;
            for (let row of rows) {
                row = row.trim();
                const columns = row.split(/\s+/);
                if ( columns.length > 1 )
                    return true;
            }
            return false;
        }
        console.log('debubg');
        if ( isTableString ( text ) ) {
            return resolve ( parseTableString ( text ) );
        } else if ( isListOfIDs ( text )){
            return resolve ( parseListString ( text ) )
        }
        else {
            return resolve ( {} );
        }

    })
}
