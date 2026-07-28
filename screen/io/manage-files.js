function (path) {
    return new Promise(async (resolve, reject) => {

        function getLastFolderFromPath(filePath) {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const segments = normalizedPath.split('/');
            segments.pop();
            const lastFolder = segments.pop();
            return lastFolder;
        }
        if (!path) {
            path = '/'
        }
        function replaceFirstNode(path) {
            const startsWithSlash = path.startsWith('/');
            if (!startsWithSlash) {
                path = '/' + path;
            }
            const parts = path.split('/');
            for (let i = 1; i < parts.length; i++) {
                if (parts[i].length > 0) {
                    parts[i] = '';
                    break;
                }
            }
            let newPath = parts.join('/');
            newPath = newPath.replace(/\/\//g, '')
            return startsWithSlash ? newPath : newPath.substring(1);
        }
        let dv = '';
        let comp = null;
        let currentPath = path;
        if (!currentPath || currentPath.trim() < 0) {
            currentPath = '/'
        }
        currentPath = currentPath.trim();
        if (currentPath.startsWith('/myfiles')) {
            currentPath = currentPath.replace('/myfiles', '')
        }
        currentPath = getLastFolderFromPath(path);
        if (currentPath === 'myfiles') {
            currentPath = ''
        }
        let init_path = '/' + getUser();
        if (init_path.endsWith('/')) {
            init_path = init_path.substring(0, init_path.length - 1)
        }

        let selected = []
        let selection_panel = null;
        let cb = createIonFunction((p) => {
            selection_panel = p
        })
        let innerComponentCallback = createIonFunction(async (innerComponent) => {
            comp = innerComponent;

            setTimeout(async () => {
                await comp.refresh();
                const folders = path.split('/').filter(folder => folder !== '');
                for (const folder of folders) {

                    if (folder && folder.length > 0) {
                        await comp.navigateToFolderNamed(folder);
                        await comp.refresh();
                    }
                }
            }, 700)
        });

        let CMD = await exec('screen/controls/cmds.js');

        let run = async () => {
            function parseMvCommand(commandString) {
                const parts = commandString.trim().split(/\s+/);
                const command = parts[0];
                let sources = [];
                let destination = '';
                if (command === 'mv') {
                    destination = parts[parts.length - 1];
                    sources = parts.slice(1, parts.length - 1);
                } else {
                    sources = parts.slice(1);
                }
                return {
                    command,
                    sources,
                    destination
                };
            }
            let bb = parseMvCommand(selection_panel.getContent());
            for (let c of bb.sources) {
                let cmdString = bb.command === 'mv' ? `${bb.command} ${c} ${bb.destination}` : `${bb.command} ${c}`;
                await CMD.processCommand(currentPath, cmdString);
            }

            setTimeout(async () => {
                await comp.refresh();

            }, 2000)

        }

        let destination = '';
        let html = `

        <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
        }
        h1 {
            color: #333;
        }
        pre {
            background-color: #f4f4f4;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .command {
            color: #008000;
            font-weight: bold;
        }
  <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Command Table</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
        }
        table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 20px;
        }
        td {
            padding: 20px;
            vertical-align: top;
            border: 1px solid #ddd;
            width: 200px; /* Fixed width for each column */
        }
        h2 {
            color: #333;
        }
        pre {
            background-color: #f4f4f4;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
        }
        .command {
            color: #008000;
            font-weight: bold;
        }
    </style>
</head>
<body>
                <H2 style="color: #333;">Move/Rename Files (mv)</H2>
                <pre style="background-color: #f4f4f4; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">mv [source_file(s)] [destination]</pre>
                <pre class="command" style="color: #008000; font-weight: bold;">mv file1.txt /destinationFolder</pre>
                <H2 style="color: #333;">Remove a File (rm)</H2>
                <pre style="background-color: #f4f4f4; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">rm [file_name]</pre>
                <pre class="command" style="color: #008000; font-weight: bold;">rm file1.txt</pre>
                <H2 style="color: #333;">Create a Directory (mkdir)</H2>
                <pre style="background-color: #f4f4f4; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">mkdir [directory_name]</pre>

</body></html>

        `
        let w = {
            wid: 'card',
            width: '100%',
            data: {
                width: '100%',
                cards: [
                    [

                        {
                            'width': '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    menus: [
                                        {
                                            label: 'Files',
                                            items: [

                                                {
                                                    label: 'New folder',
                                                    ionfunction: createIonFunction(() => {
                                                        showModal({
                                                            wid: 'input-param-items',
                                                            data: {
                                                                input_labels: ['Folder name'],
                                                                buttons: [{
                                                                    'label': 'Create', 'function': createIonFunction(async (button_label, input_params) => {
                                                                        let host_ = window['env']['apiUrl']
                                                                        let foldername = input_params['Folder name']
                                                                        if (foldername != undefined && foldername != null && foldername.length > 0) {
                                                                            let directory = comp.currentPath;
                                                                            if (!directory) {
                                                                                directory = '/'
                                                                            }
                                                                            let jsonobj = {
                                                                                "key": "user",
                                                                                "user": getUser(),
                                                                                "spath": directory + '/' + foldername
                                                                            }
                                                                            let rs = await POSTJSON(jsonobj, host_ + '/save-user-dir');
                                                                            if (comp) {
                                                                                await comp.refresh();
                                                                                await comp.navigateToFolderNamed(foldername);
                                                                            }
                                                                        }
                                                                        hideAllModal();
                                                                    })
                                                                }]
                                                            }
                                                        })

                                                    })
                                                },
                                                {
                                                    label: 'Delete this folder',
                                                    ionfunction: createIonFunction(async () => {
                                                        path_j = comp.currentPath;
                                                        if (path_j === null || path_j === '' || path_j === '.') {
                                                            infoPrompt(" Cannot remove root folder ")
                                                        } else {
                                                            let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove this folder and its contents?', async () => {
                                                                let host_ = window['env']['apiUrl']
                                                                let j = {
                                                                    'path': path_j,
                                                                    'user': getUser(),
                                                                    'key': 'user'
                                                                }
                                                                let rs = await POSTJSON(j, host_ + '/rm');
                                                                await comp.navigateUp();
                                                                await comp.refresh();
                                                            })
                                                            showModal(confirm)
                                                        }

                                                    })
                                                },

                                                {
                                                    label: 'Delete file',
                                                    ionfunction: createIonFunction(() => {
                                                        if (view === 'public') {
                                                            msgpanel.html = ` <font color="blue"> Cannot delete public files.  Select "File->My Files". </font> `
                                                            setTimeout(() => {
                                                                msgpanel.html = ` <hr> `

                                                            }, 5000)

                                                        } else {
                                                            mode = 'delete'
                                                            msgpanel.html = ` <font color="red"> Click the file you want to delete. </font> `

                                                        }
                                                    })
                                                },
                                            ]
                                        },
                                    ]
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html', data: html
                            }
                        },

                        {
                            'title': ' ', 'body': ``
                            ,
                            'component':
                            {
                                wid: 'text-editor',
                                refCallback: (cb),
                                data: {
                                    height: '100px',
                                    width: '100%',
                                    text: 'Select a file below',
                                    editable: false,
                                    onKeyUp: createIonFunction((editor) => {
                                    }),
                                    editorOptions: {
                                        language: 'bash', automaticLayout: true, lineHeight: 45, fontSize: 26, codeLens: false, lineNumbers: 'off', glyphMargin: false,
                                        minimap: { enabled: false }, scrollbar: { verticalScrollbarSize: 0, verticalHasArrows: false }, verticalHasArrows: false, height: '24px',
                                        colors: {
                                            'editorWidget.border': '2px',
                                            'editor.foreground': 'lightGray',
                                            'editor.background': '#EDF9FA',
                                            'editorCursor.foreground': '#8B0000',
                                            'editor.lineHighlightBackground': '#0000FF20',
                                            'editorLineNumber.foreground': '#008800',
                                            'editor.selectionBackground': '#88000030',
                                            'editor.inactiveSelectionBackground': '#88000015'
                                        },
                                        keybinding: {
                                            'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                                                run();

                                            })
                                        },

                                    },
                                }
                            }
                        },
                        {

                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Run Cmd', ionFunction: createIonFunction(async () => {
                                                currentPath = comp.currentPath
                                                run();
                                                let c = setInterval(async () => {
                                                    await comp.refresh();
                                                }, 1000)
                                                setTimeout(() => {
                                                    clearInterval(c)
                                                }, 10000)

                                            })
                                        },
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {

                                                CurrentLayout.reset("mainPanel")

                                            })
                                        }

                                    ]
                                }
                            }
                        },

                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component':
                            {
                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '100%',
                                refCallback: innerComponentCallback,
                                data: {
                                    width: '100%',
                                    height: 200,
                                    columns: 3,
                                    showSearch: false,
                                    drive: 'user',
                                    user: getUser(),

                                    root: init_path,
                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                        let p = replaceFirstNode(element.path);
                                        p = p.replace(/\/\//g, '')

                                        function getLastNodeFromPath(path) {

                                            const parts = path.replace(/\/+$/, '').split('/');

                                            return parts[parts.length - 1];
                                        }

                                        p = getLastNodeFromPath(p)

                                        if (selected.includes(p)) { } else
                                            selected.push(p)
                                        selection_panel.setContent(`${selected.join(' ')}`)
                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),

                                    "ionfunction.path": createIonFunction(async (path, nodes) => {
                                        currentPath = replaceFirstNode(path);

                                    })
                                }
                            }
                        },
                    ]
                ]
            }
        }

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', w);

        function constructStringWithDelay(inputString, callback) {
            let constructedString = "";
            let index = 0;

            function addNextCharacter() {
                if (index < inputString.length) {
                    constructedString += inputString[index];
                    callback(constructedString);
                    index++;
                    selection_panel.setContent(constructedString)

                    setTimeout(addNextCharacter, 100);
                }
            }

            setTimeout(() => {
                addNextCharacter();

                if (!selection_panel)
                    setTimeout(addNextCharacter, 2999)
            }, 1000)
        }

        constructStringWithDelay("Enter commands here...", function (constructedString) {
            console.log(constructedString);
        });

    })
}
