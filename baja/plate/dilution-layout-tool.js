function () {

    class DilutionTool {

        pt = null;

        constructor(plate) {
            this.pt = plate;
        }

        mouseDown(xsc, ysc) {

            showModal({
                'wid': 'input-textfield',
                'title': ' Dilution ',
                'data': {
                    'blocking': true,

                    'ionHookFunction': createIonFunction((w) => {

                    }),
                    'buttonFunction': createIonFunction((title) => {
                        console.log('debubg');
                        console.log(" title " + title);
                        hideAllModal ();

                    }),
                    showButton: true,
                    "button-label": "Apply"
                }
            }
            )

        }

    }

    return (DilutionTool)
}
