function () {
    let sharepointConfig = { 'scope': ['User.Read', 'Files.ReadWrite', 'Files.ReadWrite.All'] };
    exec('baja/lib/db.js').then(async (db) => {
        let working = await showWidget({
            wid: 'working'
        })
        let time = (t) => {
            return t.split('T')[0]
        }

        let designs = [];
        try {
            let expdata = await db.list('bajabio-screens');
            working.status = 'complete'
            if (expdata != null && expdata.value != null && expdata.value.length > 0) {
                for (let v of expdata.value) {
                    if ((!v.name.startsWith('.')) && v.name != 'template' && v.folder != null) {
                        designs.push(
                            {
                                'Last modified ': time(v.createdDateTime), 'Last modified by': v.lastModifiedBy.user.displayName, button: {
                                    'label': v.name, 'ionFunction': createIonFunction(() => {
                                        clear();
                                        exec('baja/screens/open-screen-editor.js', v.name)
                                    })
                                }

                            });
                    }

                }
            }
        } catch (exception) {

        }
        showWidget({
            wid: 'html',
            data: `
                        <h4> <img src="assets/img/icons/png/caret-right-2x.png"> Designs </h4>
            `
        })
        showWidget({
            wid: 'mt-button',
            data: {
                buttons: [
                    {
                        'label': 'New', ionfunction: createIonFunction(() => {
                        })
                    },
                    {
                        'label': 'Copy', ionfunction: createIonFunction(() => {
                        })
                    },
                    {
                        'label': 'Archive', ionfunction: createIonFunction(() => {
                        })
                    },
                ]
            }
        })

        showWidget({
            wid: 'card',
            data: {

                'style.padding-left': '12px',
                cards: [
                    [

                        {
                            'component':
                            {
                                wid: 'table', data: {
                                    width: '50%',
                                    padding_top: '2px',
                                    showHeader: true,
                                    rows: designs
                                }
                            }
                        },
                    ]]
            }
        })
        showWidget({
            'wid': 'html',
            'data': '<hr> '
        })

    })
}
