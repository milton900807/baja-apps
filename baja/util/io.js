function () {
    const sharepoint_config = { 'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All', 'Sites.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All'] };
    let IOUtil = class IOUtil {
        constructor() {
        }
        mkdir = async (foldername) => {

            foldername = foldername.trim();
            let client = await MSGraph.getClient(sharepoint_config);
            try {
                let filepath = `/me/drive/root:/bajabio-screens:/children`;
                let new_exp_dir = {
                    "name": foldername,
                    "folder": {
                    },
                    "@microsoft.graph.conflictBehavior": "fail"
                }
                let folder = await client.api(filepath)
                    .post(new_exp_dir)
                    .catch(error => {
                        log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                        let cs = JSON.stringify(error);
                        let jsonv = {
                            'wid': 'json',
                            'data': cs
                        }
                        showWidget(jsonv);
                    })
                return folder;

            } catch (exception) {
                console.log(exception)
            }

        }

    }
    return new IOUtil();
}
