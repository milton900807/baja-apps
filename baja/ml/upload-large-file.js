function (path, returnTo, returnArg) {
    // `returnTo`/`returnArg`: where Close and a completed upload send the user back to.
    // Defaults to baja/yak (the original, only destination this ever had) so every existing
    // caller keeps working unchanged. A caller with its own view to come back to -- fb.js and
    // cpd/yak.js both have a menu that lives in the same mainPanel slot this widget takes
    // over -- should pass its OWN script path here; otherwise "Close" strands the user in an
    // unrelated file browser instead of back where they started, which reads exactly like
    // "the menu disappeared and never came back."
    return new Promise(async (resolve, reject) => {

        const goBack = () => {
            const dest = returnTo || 'baja/yak';
            const arg = (returnArg !== undefined) ? returnArg : path;
            exec(dest, arg);
        };

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

        // Every failure here used to go ONLY to console.error -- invisible unless someone had
        // devtools open. This shows the same message on the panel itself, so "the button does
        // nothing" becomes an actual, readable reason.
        let statusPanel;
        const statusRef = createIonFunction((panel) => { statusPanel = panel; });
        const setStatus = (html) => { try { if (statusPanel) statusPanel.html = html; } catch (e) { } };

        async function uploadFileInChunks(file, path, progressBar) {
            if (!file) {
                console.error("No file selected for upload.");
                setStatus('<font color="red">No file selected.</font>');
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
                        setStatus('<font color="red">Upload failed (chunk ' + (chunkIndex + 1) + '/' + totalChunks
                            + '): ' + (result && result.failed ? result.failed : ('HTTP ' + response.status)) + '</font>');
                        return { error: `Upload failed at chunk ${chunkIndex}` };
                    }

                    uploadedChunks++;
                    progressBar?.((uploadedChunks / totalChunks) * 100);
                    setStatus('Uploading ' + file.name + '… ' + uploadedChunks + '/' + totalChunks + ' chunks');
                    console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                } catch (error) {
                    console.error("Upload failed:", error);
                    setStatus('<font color="red">Upload failed: ' + (error && error.message ? error.message : error) + '</font>');
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
                                        try {
                                            if (!file) {
                                                console.error("No file selected for upload.");
                                                setStatus('<font color="red">No file selected.</font>');
                                                return { error: "No file selected" };
                                            }
                                            setStatus('Uploading ' + file.name + '…');
                                            const result = await uploadFileInChunks(file, path, progressBar);

                                            if (result?.error) {
                                                return result;
                                            }

                                            setStatus('<font color="green">Uploaded ' + file.name + '.</font>');
                                            setTimeout(goBack, 700);
                                            return result;
                                        } catch (e) {
                                            console.error("Upload failed:", e);
                                            setStatus('<font color="red">Upload failed: ' + (e && e.message ? e.message : e) + '</font>');
                                            return { error: '' + (e && e.message ? e.message : e) };
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
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                refCallback: statusRef,
                                data: ''
                            }
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                goBack();
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
