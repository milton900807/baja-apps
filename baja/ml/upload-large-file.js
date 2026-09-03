function (path, returnTo, returnArg) {
    // `returnTo`: what Close and a completed upload send the user back to. Three shapes,
    // tried in this order:
    //   - a FUNCTION: called directly, no exec() round-trip or CurrentLayout involved at
    //     all. Use when the caller already has its own menu/layout built and sitting in a
    //     closure variable -- putting it straight back is direct and can't be derailed by
    //     whatever a full re-run of the caller's script does (an auth check, a full rebuild).
    //   - a STRING: a CurrentLayout stash key, passed to CurrentLayout.reset(). Use when the
    //     caller has stashed its own view (CurrentLayout.stash(key, itsOwnLayout), the same
    //     way manchester/editor.js stashes 'mainPanel' and manchester/fb.js stashes
    //     'mainFilePanel1') -- reset() remounts exactly that, robustly, the same mechanism
    //     every editor already relies on to restore itself.
    //   - omitted: falls back to exec('baja/yak', returnArg ?? path) -- the ORIGINAL, only
    //     destination this file ever had, so a caller that predates returnTo entirely
    //     (baja/files.js, baja/yak.js, baja/bookshelf.js, baja/table/yakgen.js) keeps
    //     working exactly as before, unchanged.
    // Getting this wrong is what "the menu disappeared and never came back" turned out to
    // be: Close/success used to always jump to baja/yak, an unrelated file browser, no
    // matter where Upload was opened from -- and, more recently, a hardcoded
    // CurrentLayout.reset('mainFilePanel1') here silently broke every OTHER caller (none of
    // them stash that key), which is what generalizing this back to a parameter fixes.
    return new Promise(async (resolve, reject) => {

        const goBack = () => {
            if (typeof returnTo === 'function') {
                try { returnTo(); return; } catch (e) { console.error('returnTo callback failed:', e); }
            }
            if (typeof returnTo === 'string' && returnTo) {
                try { CurrentLayout.reset(returnTo); return; } catch (e) { console.error('CurrentLayout.reset(' + returnTo + ') failed:', e); }
            }
            exec('baja/yak', (returnArg !== undefined) ? returnArg : path);
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
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', design_params_panel_layout);
        resolve({})

    })

}
