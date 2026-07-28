function (pt) {
    button_canvas = {
        wid: 'radio-buttons',
        data: {
            'buttons': [
                {
                    'label': 'Edit wells...', ionfunction: createIon(() => {
                        pt.setMode ( 'select')
                    }
                    )
                },
                {
                    'label': 'Negative Control', ionfunction: createIon(() => {

                    }
                    )
                }, {
                    'label': 'Positive Control', ionfunction: createIon(() => {

                    }
                    )
                },

            ],
        }
    }
    return button_canvas;
}
