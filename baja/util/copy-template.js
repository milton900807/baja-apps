function (driveid, template_file_name, folderid) {

    let copyFile = async (file) => {
        let MSGraph = await exec('lib/msgraph');
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All',
                'Sites.Read.All', 'Sites.ReadWrite.All', 'https://graph.microsoft.com/Sites.ReadWrite.All']
        };
        let client = await MSGraph.getClient(sharepoint_config);
        try {
            const driveItem = {
                parentReference: {
                    driveId: driveid,
                    id: folderid
                },
                name: file
            };
            let filepath = `/drives/${driveid}/root:/bajabio-xfiles/templates/${file}`;
            await client.api(`${filepath}:/copy`)
                .post(driveItem);
        } catch (exception) {
            console.log(exception)
        }
    }
    copyFile(template_file_name)
}
