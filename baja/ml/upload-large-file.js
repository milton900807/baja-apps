function (path) {
    return new Promise(async (resolve, reject) => {

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


        async function uploadFileInChunks(file, path, progressBar) {
            if (!file) {
                console.error("No file selected for upload.");
                return { error: "No file selected" };
            }

            const user = getUser();
            const type = "data";
            const chunkSize = 5 * 1024 * 1024;
            const totalChunks = Math.ceil(file.size / chunkSize);

            // Unique upload id so concurrent uploads of same filename do not collide
            const uploadId =
                `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;

            let uploadedChunks = 0;
            const host_ = window["env"]["apiUrl"];

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append("user", user);
                formData.append("type", type);
                formData.append("file", chunk, file.name);

                formData.append("uploadId", uploadId);
                formData.append("filename", file.name);
                formData.append("chunkIndex", String(chunkIndex));
                formData.append("totalChunks", String(totalChunks));
                formData.append("fileSize", String(file.size));

                if (path && path.length > 1) {
                    formData.append("path", path);
                }

                try {
                    const response = await fetch(host_ + "/upload", {
                        method: "POST",
                        body: formData,
                    });

                    const result = await response.json();

                    if (!response.ok || result.failed) {
                        console.error(`Error uploading chunk ${chunkIndex}:`, result.failed);
                        return { error: `Upload failed at chunk ${chunkIndex}` };
                    }

                    uploadedChunks++;
                    progressBar?.((uploadedChunks / totalChunks) * 100);
                    console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                } catch (error) {
                    console.error("Upload failed:", error);
                    return { error: "Network or server error during upload" };
                }
            }

            return { success: true, filename: file.name };
        }



        let file_drop_object = null;
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
                                        const result = await uploadFileInChunks(file, path, progressBar);

                                        if (result?.error) {
                                            return result;
                                        }


                                        exec('baja/yak', path)

                                    })
                                }
                            }
                        },
                        {
                            'width': '100%',
                            'component': w
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                exec('baja/yak', path)

                                            })
                                        },
                                    ]
                                }
                            }
                        }

                    ]
                ]
            }
        }
        try {
            CurrentLayout.clearComponent('userFiles')
        } catch (exxc) { }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', design_params_panel_layout);
        resolve({})

    })

}
