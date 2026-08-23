function () {
    let MSGraph = class MSGraph {
    }
    MSGraph.createWordDoc = () => {
        return lion_engine.createObject('docx');
    }
    MSGraph.getAccessToken = () => {
        return lion_engine.getAccessToken();
    }

    MSGraph.canWriteToLib = async (libid) => {
        let can = false;
        let foldername = 'test_'
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All',
                'https://graph.microsoft.com/Sites.ReadWrite.All']
        }
        let client = await MSGraph.getClient(sharepoint_config);
        let filepath = `/drives/${libid}/root:/bajabio-screens:/children`;
        try {
            let new_exp_dir = {
                "name": foldername,
                "folder": {
                },
                "@microsoft.graph.conflictBehavior": "replace"
            }
            let folder = await client.api(filepath)
                .post(new_exp_dir)

            let folder_del = await client.api(`/drives/${libid}/items/${folder.id}`).delete();
            can = true;
        } catch (exception) {
            console.log(exception)
            can = false;
        }
        return can;
    }

    MSGraph.isLoggedIn = () => {
        // Microsoft (MSAL) access token.
        if (lion_engine.getAccessToken() != null && lion_engine.getAccessToken().length > 0)
            return true;
        // OIDC session from the /login providers (Google, Facebook, Microsoft, ...) — a user
        // signed in through any provider counts as logged in, not just Microsoft.
        try {
            const s = JSON.parse(localStorage.getItem('oidc.session') || 'null');
            if (s && (s.accessToken || s.idToken)) {
                if (!s.expiresAt || Date.now() <= s.expiresAt) return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }
    MSGraph.getClient = (config) => {
        return lion_engine.createObject('msgraph', config);
    }
    MSGraph.getFGClient = () => {
        let config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All',
                'https://graph.microsoft.com/Sites.ReadWrite.All']
        }

        return lion_engine.createObject('msgraph', config)
    }

    MSGraph.saveLG = async (blob, filename, path, listener) => {
        var file = new File([blob], filename);
        let fileio = await lion_engine.createObject('fileio')
        return fileio.fileUpload(file, path, listener);
    }

    return MSGraph;
}
