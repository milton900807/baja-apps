function () {

    let __nameComponent;
    let __nameHook = createIonFunction((ref) => {
        __nameComponent = ref;
    })

    let sharepoint_config = { 'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All'] };

    showWidget(
        {
            wid: 'card',
            data: {
                padding: "10px",
                cards: [
                    [

                        {
                            'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                `                   ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['Name'

                                    ],
                                }
                            }
                        },

                        {
                            'title': null, 'body': `
                                `                   ,
                            'width': '100%',
                            'component':
                            {
                                wid: 'button',
                                data: [
                                    {
                                        'label': 'Save', ionfunction: createIonFunction(async () => {
                                            let MSGraph = await exec('lib/msgraph.js')
                                            let client = await MSGraph.getClient(sharepoint_config);
                                            let name = __nameComponent.get('Name')

                                            alert(name)

                                            hideAllModal()
                                        }), disableAfterClick: false
                                    },
                                ]
                            }
                        }
                    ]]
            }
        }

    )

}
