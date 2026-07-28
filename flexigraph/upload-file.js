function () {
    let __color = 'rgba(0, 87, 163, 0.5)'
    let progressBar;
    let w = {
        wid: 'progress',
        componentRef: 'progressBar',
        data: {
            'progress': 0,
            'progressBar': createIonFunction((progessBar) => {
                progressBar = progessBar;
            })
        }
    }

    let design_params_panel_layout = {
        wid: 'card',
        data: {
            cards: [
                [
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: '<hr>'
                        }
                    },
                    {
                        'width': '100%',
                        'component': {
                            wid: 'simple-file-upload',
                            data: {
                                'showUploadButton': false,
                                'getUploadFolder': createIonFunction(() => {
                                }),
                                'getRef': createIonFunction((ref) => {
                                    file_drop_object = ref;
                                }),
                                'onDropToBlob': createIonFunction(async (file) => {
                                }),
                                'fileFunction': createIonFunction(async (file) => {
                                    if (!file) {
                                        console.error("No file selected for upload.");
                                        return { error: "No file selected" };
                                    }
                                    let __file = file;
                                    const user = getUser();
                                    const type = "data";
                                    const chunkSize = 5 * 1024 * 1024;
                                    const totalChunks = Math.ceil(file.size / chunkSize);
                                    let uploadedChunks = 0;

                                    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                                        const start = chunkIndex * chunkSize;
                                        const end = Math.min(start + chunkSize, file.size);
                                        const chunk = file.slice(start, end);
                                        const formData = new FormData();
                                        formData.append("user", user);
                                        formData.append("type", type);
                                        formData.append("file", chunk, file.name);

                                        try {
                                            if (path) {
                                                formData.append("path", path);
                                            }
                                            let host_ = window['env']['apiUrl']
                                            const response = await fetch(host_ + '/upload', {
                                                method: 'POST',
                                                body: formData
                                            })
                                            const result = await response.json();
                                            if (!response.ok || result.failed) {
                                                console.error(`Error uploading chunk ${chunkIndex}:`, result.failed);
                                                return { error: `Upload failed at chunk ${chunkIndex}` };
                                            }
                                            uploadedChunks++;
                                            progressBar((uploadedChunks / totalChunks) * 100)

                                            console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                                        } catch (error) {
                                            console.error("Upload failed:", error);
                                            return { error: "Network or server error during upload" };
                                        }
                                    }

                                })
                            }
                        }
                    },
                    {
                        'width': '100%',
                        'component': w
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
                                "ionfunction.cmd": createIonFunction((element) => {

                                }),

                                width: '100%',
                                columns: 3,
                                showSearch: true,
                                drive: 'user',
                                user: getUser(),
                                root: getUser(),
                                "ionfunction.fileClick": createIonFunction(async (element) => {
                                    name = element.name;
                                    path = element.path;
                                    infoPrompt(" " + name + " selected.")
                                }),
                                "ionfunction.openfile": createIonFunction(async (file, text) => {
                                }
                                ),
                                "ionfunction.path": createIonFunction(async (_path, nodes) => {
                                    path = _path;
                                })
                            }
                        }
                    }
                ]
            ]
        }
    }

    let sequence_input = {
        wid: 'card',
        "height": "500px",
        data: {
            "style.padding-top": '1px',
            "style.border": '1px',
            "style.height": "500px",
            cards: [
                [
                    {

                        'width': '100%',
                        'component': {
                            wid: 'card',
                            data: {
                                cards: [
                                    [

                                        {
                                            'width': '100%',
                                            'height': "100px",
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'color-chooser',
                                                'width': '100%',

                                                "data": {
                                                    "selectionListener": createIonFunction((_color) => {
                                                        __color = _color;
                                                    })
                                                }
                                            }
                                        },
                                    ],
                                    [
                                        {
                                            'component': design_params_panel_layout
                                        }
                                    ]
                                ]
                            }
                        }
                    },
                    {
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Apply', ionFunction: createIonFunction(async () => {
                                            let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                            let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                            this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                            const yvalue = this.grid.Ywc(y)
                                            this.scatterData.points.push({
                                                x: tx,
                                                y: ty,
                                                startX: this.grid.xmin,
                                                path: path,
                                                name: `${point.name}`,
                                                color: __color,
                                                filename: name,
                                                type: 'document'
                                            });

                                            CurrentLayout.reset('mainPanel');
                                        })
                                    },
                                    {
                                        label: 'Close', ionFunction: createIonFunction(async () => {
                                            hideAllModal();
                                            CurrentLayout.reset('mainPanel');
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]

        }
    }
    CurrentLayout.clearComponent('mainPanel')
    CurrentLayout.setComponent('mainPanel', sequence_input);
}
