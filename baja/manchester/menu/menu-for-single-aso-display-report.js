function (graph, genegraph_panel_layout, rr, title) {

    return new Promise(async (resolve, reject) => {

        console.log ( " results " + JSON.stringify ( rr ) );

        let cards = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {

                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `<h3> <font color="blue">  ${title}  </font> </h3>`
                            }
                        },

                        {

                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: rr.html + "<hr>"
                            }
                        },
                    ]
                ]
            }
        }

        let r = {
            'title': ' ', 'body': ``,
            'width': '100%',
            'component': cards
        }
        return resolve(r);

    })

}
