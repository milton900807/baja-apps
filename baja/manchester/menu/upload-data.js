function (graph, genegraph_panel_layout) {

    // Data menu -> Upload. Large datasets (VCF / VCF.GZ / BED / BigWig, ...) chunk-upload
    // straight into the signed-in user's own drive -- root '/' + getUser(), the same space
    // baja/data/my-data.js and baja/yak.js already read from -- with a live progress bar
    // (chunking pattern copied from baja/ml/upload-large-file.js, the shared-library
    // uploader; this one targets the user's own space instead and branches on what the file
    // actually is once it lands).
    //
    // What happens after a successful upload depends on the file:
    //   - pdf / text / doc -- the SAME parsing+loading baja/manchester/menu/file-extract.js
    //     already does for a small pasted-in document. That file now accepts a File object
    //     directly (its `presetFile` param) rather than only its own OS picker, so this is
    //     the existing pipeline handed the file, not a second implementation of it.
    //   - anything else (VCF, VCF.GZ, BED, BigWig, an unrecognized type) -- there is nothing
    //     to extract client-side; it is just data. The user is handed the SAME track-apply
    //     interface baja/data/my-data.js's 'My data' library card already offers (click a
    //     track, pick the file, apply), pre-selected to the right kind when the extension
    //     says which one -- the newly-uploaded file is already sitting in that picker's
    //     folder, no second navigation needed. An extension outside every known kind still
    //     gets the full my-data.js menu (no preAction), same as clicking 'My data' directly.

    return new Promise((resolve) => {

        const DOC_EXT = ['.pdf', '.txt', '.text', '.md', '.csv', '.tsv', '.doc', '.docx'];
        const PRE_ACTION_BY_EXT = { '.vcf': 'vcf', '.bed': 'bed', '.bw': 'rnaseq', '.bigwig': 'rnaseq' };

        const lname = (name) => ('' + (name || '')).toLowerCase();
        const isDoc = (name) => DOC_EXT.some((e) => lname(name).endsWith(e));
        const preActionFor = (name) => {
            const n = lname(name).replace(/\.gz$/, '');
            for (const ext of Object.keys(PRE_ACTION_BY_EXT)) {
                if (n.endsWith(ext)) return PRE_ACTION_BY_EXT[ext];
            }
            return null;
        };

        // Same chunked-upload logic as baja/ml/upload-large-file.js (5MB chunks to /upload,
        // a per-upload id so concurrent uploads of the same filename don't collide) --
        // duplicated rather than exec'd, since that file owns its own picker UI and always
        // hands the finished upload straight back to baja/yak, which this flow can't reuse.
        async function uploadFileInChunks(file, path, progressBar) {
            if (!file) {
                console.error("No file selected for upload.");
                return { error: "No file selected" };
            }

            const user = getUser();
            const type = "data";
            const chunkSize = 5 * 1024 * 1024;
            const totalChunks = Math.ceil(file.size / chunkSize);

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
                } catch (error) {
                    console.error("Upload failed:", error);
                    return { error: "Network or server error during upload" };
                }
            }

            return { success: true, filename: file.name };
        }

        let progressBar;
        let w = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 0,
                'progressBar': createIonFunction((pb) => {
                    progressBar = pb;
                })
            }
        };

        const restorePanel = () => {
            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            try { CurrentLayout.setComponent('mainPanel', genegraph_panel_layout); } catch (e) { }
        };

        let file_drop_object = null;
        let upload_panel_layout = {
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
                                            graph.setError(' No file selected. ');
                                            return { error: "No file selected" };
                                        }

                                        const path = '/' + getUser();
                                        graph.setMessage(' Uploading ' + file.name + '… ');
                                        const result = await uploadFileInChunks(file, path, progressBar);

                                        if (result?.error) {
                                            graph.setError(' Upload failed: ' + result.error + ' ');
                                            return result;
                                        }

                                        restorePanel();

                                        if (isDoc(file.name)) {
                                            try { await exec('baja/manchester/menu/file-extract.js', graph, genegraph_panel_layout, file); }
                                            catch (e) { graph.setError(' Uploaded ' + file.name + ', but could not process it: ' + e + ' '); }
                                        } else {
                                            graph.setResultMessage(' Uploaded ' + file.name + ' -- pick a track to apply it to… ');
                                            try { await exec('baja/data/my-data.js', graph, genegraph_panel_layout, preActionFor(file.name)); }
                                            catch (e) { graph.setError(' Uploaded ' + file.name + ', but could not open the apply-to-track menu: ' + e + ' '); }
                                        }

                                        return { success: true, filename: file.name };
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
                                                restorePanel();
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

        try { CurrentLayout.clearComponent('userFiles'); } catch (e) { }
        CurrentLayout.clearComponent('mainPanel');
        CurrentLayout.setComponent('mainPanel', upload_panel_layout);
        resolve({});
    });
}
