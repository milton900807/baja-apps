function () {

    exec('baja/lib/db.js').then(async (db) => {

        await showWidget({
            wid: 'html',
            data: `
                        <h4> <img src="assets/img/icons/png/caret-right-2x.png"> Chemistry </h4>
            `
        })

        let designs = [];
        designs.push({
            'html': '<img width="50px" src="assets/img/polymer.png">'
            , 'button': {
                'label': 'My template chemistry', ionFunction: createIonFunction ( () => {
                    clear ();
                    exec ( 'baja/chem/my-chemistry.js')
                })
            }
        })
        designs.push({
            'html': '<img width="50px"  src="assets/img/polymer-published.png">', 'button': {
                'label': 'Published chemistry', ionFunction: createIonFunction ( () => {
                    exec ( 'baja/chem/published-chem.js')
                })
            }
        })
        designs.push({
            'html': '<img width="50px"  src="assets/ketcher/icons/png/main/chain.png">', 'button': {
                'label': 'Oligo Template Editors'
            }
        })
        designs.push({
            'button': {
                'label': 'My Monomers'
            }, 'html': '<img width="50px"  src="assets/img/monomer.png">'
        })
        designs.push({
            'button': {
                'label': 'Published Monomers'
            }, 'html': '<img width="50px"  src="assets/img/monomer-published.png">'
        })

        let c1 = {
            wid: 'card',
            data: {

                'style.padding-left': '12px',
                cards: [
                    [

                        {
                            'component':
                            {
                                wid: 'table', data: {
                                    width: '100px',
                                    padding_top: '5px',
                                    showHeader: false,
                                    rows: designs
                                }
                            }
                        },
                    ]]
            }
        }

        let init = {
            wid: 'card',
            data: {
                padding: 0,
                'style.padding-left': '22px',
                cards: [
                    [

                        {
                            'title': '', 'body': `
                                            `,
                            'width': '60%',
                            'height': '100%',
                            'component': c1

                        }

                    ]]
            }
        }

        showWidget(init)
    });
}
