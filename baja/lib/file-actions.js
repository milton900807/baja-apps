function (options) {

    // WHAT TO DO WITH A FILE NO APPLICATION CLAIMS.
    //
    // Most files in My Files open in an editor: a .baja screen, a .karyotype, a .liverpool
    // design. Everything else -- a pasted VCF, a spreadsheet, a note, anything uploaded --
    // had no handler at all. Clicking one cleared the screen and left the user on a blank
    // page, which is the worst of the three possible behaviours: it looks like a crash and
    // it loses the folder they were browsing.
    //
    // This is the fallback: a small menu offering the three things you can do with a file
    // whose contents this application does not understand.
    //
    //   await exec('baja/lib/file-actions.js', {
    //       element,                            // {name, path} from the file browser
    //       drive: 'user',
    //       onChanged: () => panel.refresh()    // after a rename or a delete
    //   });

    return (async () => {
        const o = options || {};
        const el = o.element || {};
        const drive = o.drive || 'user';
        const host = () => (window['env'] && window['env']['apiUrl']) || '';
        const filePath = '' + (el.path || '');
        const name = ('' + (el.name
            || (('' + filePath).split('/').filter(Boolean).pop())
            || 'this file'));

        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const changed = () => { try { if (typeof o.onChanged === 'function') o.onChanged(); } catch (e) { } };
        const close = () => { try { hideAllModal(); } catch (e) { } };

        // The directory the file sits in. A rename is a move inside the same folder, which
        // is all /mv does.
        const dirOf = (p) => {
            const parts = ('' + p).split('/');
            parts.pop();
            return parts.join('/');
        };

        const say = (html) => {
            try {
                showModal({
                    wid: 'card',
                    data: {
                        cards: [[
                            { 'width': '100%', 'component': { wid: 'html', data: html } },
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'mt-button',
                                    data: { buttons: [{ label: 'OK', ionFunction: createIonFunction(() => { close(); }) }] }
                                }
                            }
                        ]]
                    }
                });
            } catch (e) { }
        };

        // ---- download ------------------------------------------------------------------
        //
        // Through /download-user-file, which streams the bytes exactly as they are on disk.
        //
        // NOT through /download. That endpoint takes an absolute filesystem path and UNLINKS
        // the file once it has streamed it -- it exists to hand over temporary artefacts,
        // and pointing it at something in a user's drive would download their file and then
        // delete it.
        //
        // NOT through /load-file either. That reads with a utf-8 encoding, so anything which
        // is not text arrives with its undecodable bytes replaced. It is the right call for
        // reading a JSON document and the wrong one for copying a file.
        //
        // A plain link rather than fetch-then-blob, so the browser streams a large file
        // straight to disk instead of assembling it in memory first. That matters here:
        // the files no application claims are usually the big ones.
        const download = async () => {
            close();
            try {
                const url = host() + '/download-user-file'
                    + '?path=' + encodeURIComponent(filePath)
                    + '&key=' + encodeURIComponent(drive)
                    + '&user=' + encodeURIComponent(getUser());
                const a = document.createElement('a');
                a.href = url;
                // The server names the file in Content-Disposition. This is the fallback for
                // a browser that ignores it.
                a.download = name;
                a.setAttribute('hidden', '');
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { try { a.parentNode.removeChild(a); } catch (e) { } }, 500);
            } catch (e) {
                say('<b>' + esc(name) + '</b> could not be downloaded: ' + esc(e && e.message ? e.message : e));
            }
        };

        // ---- rename --------------------------------------------------------------------
        const rename = () => {
            close();
            showModal({
                wid: 'card',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<div style="padding:10px 4px;font:14px Arial;"><b>Rename</b>'
                                    + '<div style="color:#5b6b7a;margin-top:4px;">Currently <b>' + esc(name) + '</b>. '
                                    + 'Keep the extension if you want it to keep opening in the same place.</div></div>'
                            }
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'input-param-items',
                                data: {
                                    input_labels: ['New name'],
                                    default_values: { 'New name': name },
                                    buttons: [{
                                        'label': 'Rename',
                                        'function': createIonFunction(async (button_label, input_params) => {
                                            const next = ('' + ((input_params && input_params['New name']) || '')).trim();
                                            if (!next || next === name) { close(); return; }
                                            if (next.indexOf('/') >= 0) {
                                                say('A name cannot contain a slash. Use the file browser to move a file.');
                                                return;
                                            }
                                            close();
                                            try {
                                                const dir = dirOf(filePath);
                                                const rs = await POSTJSON({
                                                    sourcePath: filePath,
                                                    destinationPath: dir + '/' + next,
                                                    key: drive, user: getUser()
                                                }, host() + '/mv');
                                                // The server does not always say so explicitly;
                                                // the refresh shows the truth either way.
                                                changed();
                                                if (rs && rs.error) say('It was not renamed: ' + esc(rs.error));
                                            } catch (e) {
                                                say('It was not renamed: ' + esc(e && e.message ? e.message : e));
                                            }
                                        })
                                    }]
                                }
                            }
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button',
                                data: { buttons: [{ label: 'Cancel', ionFunction: createIonFunction(() => { close(); }) }] }
                            }
                        }
                    ]]
                }
            });
        };

        // ---- delete --------------------------------------------------------------------
        const remove = () => {
            close();
            showModal({
                wid: 'card',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<div style="padding:10px 4px;font:14px Arial;">'
                                    + '<b style="color:#9b3232;">Delete ' + esc(name) + '?</b>'
                                    + '<div style="color:#5b6b7a;margin-top:4px;">This removes the file permanently. '
                                    + 'It is not moved to a bin and it cannot be undone.</div></div>'
                            }
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Delete', ionFunction: createIonFunction(async () => {
                                                close();
                                                try {
                                                    // AWAITED before the refresh: firing the two
                                                    // together races the listing against the
                                                    // delete, and the file reappears.
                                                    await POSTJSON({ path: filePath, key: drive, user: getUser() },
                                                        host() + '/rm');
                                                    changed();
                                                } catch (e) {
                                                    say('<b>' + esc(name) + '</b> could not be deleted: '
                                                        + esc(e && e.message ? e.message : e));
                                                }
                                            })
                                        },
                                        { label: 'Cancel', ionFunction: createIonFunction(() => { close(); }) }
                                    ]
                                }
                            }
                        }
                    ]]
                }
            });
        };

        // ---- the menu -------------------------------------------------------------------
        showModal({
            wid: 'card',
            data: {
                cards: [[
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: '<div style="padding:12px 4px 2px;font-family:Arial,Helvetica,sans-serif;">'
                                + '<div style="font:600 11px Arial;letter-spacing:.12em;text-transform:uppercase;color:#5b7d86;">File</div>'
                                + '<div style="font:700 17px Arial;color:#12242c;margin-top:4px;word-break:break-all;">'
                                + esc(name) + '</div>'
                                + '<div style="font:13px/1.5 Arial;color:#5b6b7a;margin-top:6px;">'
                                + 'No application in this workspace opens this kind of file. You can still manage it.</div></div>'
                        }
                    },
                    {
                        'width': '100%',
                        'component': {
                            wid: 'mt-button',
                            data: {
                                buttons: [
                                    { label: 'Download', ionFunction: createIonFunction(async () => { await download(); }) },
                                    { label: 'Rename', ionFunction: createIonFunction(() => { rename(); }) },
                                    { label: 'Delete', ionFunction: createIonFunction(() => { remove(); }) },
                                    { label: 'Cancel', ionFunction: createIonFunction(() => { close(); }) }
                                ]
                            }
                        }
                    }
                ]]
            }
        });

        return { download: download, rename: rename, remove: remove };
    })();
}
