function (experimentid) {

    return new Promise(async (resolve, reject) => {
        let sharepointConfig = { 'scope': ['User.Read', 'Files.ReadWrite', 'Files.ReadWrite.All'] };
        exec('baja/lib/db.js').then(async (db) => {
            let working = await showWidget({
                wid: 'working'
            })
            let designs = [];
            try {
                let expdata = await db.list(`bajabio-screens/${experimentid}/submitted-screens`);
                working.status = 'complete'
                if (expdata != null && expdata.value != null && expdata.value.length > 0) {
                    for (let v of expdata.value) {
                        if (v.name != 'template' && v.folder != null) {
                            designs.push(
                                {
                                    button: {
                                        'label': v.name, 'ionFunction': createIonFunction(() => {
                                            clear();
                                            exec('baja/manchester/open-screen-editor.js', v.name)
                                        })
                                    }

                                });
                        }

                    }
                }
            } catch (exception) {

            }

            resolve({
                wid: 'card',
                data: {

                    'style.padding-left': '12px',
                    cards: [
                        [

                            {
                                'component':
                                {
                                    wid: 'table', data: {
                                        title: 'Screens',
                                        width: '50%',
                                        padding_top: '10px',
                                        showHeader: false,
                                        rows: designs
                                    }
                                }
                            },
                        ]]
                }
            })
        })
    });
}
