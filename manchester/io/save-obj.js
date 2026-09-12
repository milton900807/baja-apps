function (graph, main_layout, path) {
    return new Promise(async (resolve, reject) => {

        function getLastFolderFromPath(filePath) {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const segments = normalizedPath.split('/');
            segments.pop();
            const lastFolder = segments.pop();
            return lastFolder;
        }

        let dv = '';
        if (graph.file) {
            dv = graph.file;
        }
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

        let progressBar;
        let pw = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 0,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }

        let w = {
            wid: 'card',
            data: {
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
                                                    ionfunction: createIonFunction(async () => {
                                                                     // The navy dialog, not a bare input-param-items widget handed to showModal. That
                                                                     // had no title saying what was being asked, no cancel, and an unstyled input
                                                                     // rendered against the modal's own background, which is where the unreadable
                                                                     // boxes came from. baja/lib/prompt-name.js is the shared one.
                                                                     let directory = (comp && comp.currentPath) || '/';
                                                                     const where = ('' + directory).split('/').filter(Boolean).pop();
                                                                     const foldername = await exec('baja/lib/prompt-name.js', {
                                                                         title: 'New folder',
                                                                         message: where ? ('It will be created in ' + where + '.')
                                                                             : 'It will be created in your files.',
                                                                         label: 'Folder name',
                                                                         placeholder: 'e.g. KRAS screens',
                                                                         confirmLabel: 'Create',
                                                                         // A path segment on the server, so a slash would create something other than
                                                                         // what was typed.
                                                                         validate: (v) => {
                                                                             if (v.indexOf('/') >= 0) return 'A folder name cannot contain a slash.';
                                                                             if (v === '.' || v === '..') return 'Choose a different name.';
                                                                             if (v.charAt(0) === '.') return 'A name starting with a dot is hidden.';
                                                                             return '';
                                                                         }
                                                                     });
                                                                     if (!foldername) return;
                                                                 
                                                                     const host_ = window['env']['apiUrl'];
                                                                     try {
                                                                         const rs = await POSTJSON({
                                                                             "key": "user",
                                                                             "user": getUser(),
                                                                             "spath": directory + '/' + foldername
                                                                         }, host_ + '/save-user-dir');
                                                                         // Refresh first, THEN navigate: navigating into a folder the listing has not
                                                                         // seen yet lands on an empty view that looks like the create failed.
                                                                         if (comp) {
                                                                             await comp.refresh();
                                                                             try { await comp.navigateToFolderNamed(foldername); } catch (e) { }
                                                                         }
                                                                         // A create that failed used to say nothing at all.
                                                                         if (rs && rs.error) infoPrompt(' ' + foldername + ' was not created: ' + rs.error + ' ');
                                                                     } catch (e) {
                                                                         infoPrompt(' ' + foldername + ' was not created: '
                                                                             + (e && e.message ? e.message : e) + ' ');
                                                                     }
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
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component':
                            {
                                wid: 'html',
                                width: '100%',
                                height: '100%',
                                data: ` <hr> `
                            }
                        },

                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component': pw
                        },

                        {
                            'title': ' ', 'body': ``
                            ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'input-param-items',
                                width: '100%',
                                data: {
                                    input_labels: ['Name'],
                                    default_values: { 'Name': dv },
                                    buttons: [{

                                        'label': 'Save', 'function': createIonFunction(async (button_label, input_params) => {
                                            // ONE SAVE AT A TIME.
                                            //
                                            // This crashed the tab. Nothing stopped a second press while the first
                                            // save was still running, and a save is very slow and very interruptible:
                                            // stringifyGraphAsync walks the whole graph and AWAITS inside its own
                                            // loops, so two runs do not queue, they interleave -- over one graph that
                                            // the first press has already torn the canvas and every mouse listener off
                                            // of, four lines in. The second run then serialises a half-dismantled
                                            // object, and whichever finishes last restores mainPanel over the other.
                                            //
                                            // A press is easy to repeat, too: serialising a large design blocks long
                                            // enough that the button looks dead.
                                            if (window.__bajaSaveObjBusy) {
                                                try { graph.setMessage(' This design is already being saved. '); } catch (e) { }
                                                return;
                                            }
                                            window.__bajaSaveObjBusy = true;
                                            // AND IT ALWAYS HANDS THE SCREEN BACK. There was no try/catch anywhere in
                                            // here, and the last thing the function does is put mainPanel back and
                                            // re-arm the canvas. So ANY throw on the way -- and there are unchecked
                                            // server responses below -- left the user on the save screen looking at a
                                            // graph whose canvas is null, with no way forward. That is the shape of
                                            // "the app crashed on saving" even when the save itself was fine.
                                            try {
                                            let name = input_params['Name'];

                                            currentPath = comp.currentPath;
                                            if (!currentPath) currentPath = '/';

                                            graph.canvas = null;
                                            graph.mouseDownListeners = [];
                                            graph.mouseUpListeners = [];
                                            graph.mouseMoveListeners = [];

                                            for (let t of graph.track) {
                                                for (let o of t.oligos) {
                                                    if (o.mi_targets_transient_) o.mi_targets_transient_ = null;
                                                }
                                            }

                                            if (!graph.track) {
                                                alert(' no track ');
                                                return;
                                            }

                                            progressBar(20);
                                            async function stringifyGraphAsync(graph, progressBarPercent) {
                                                const transientRE = /_transient_$/i;

                                                function shouldSkipObject(o) {
                                                    if (!o || typeof o !== "object") return false;

                                                    if (typeof window !== "undefined") {
                                                        if (o === window || o === document) return true;
                                                        if (typeof Node !== "undefined" && o instanceof Node) return true;
                                                        if (typeof Window !== "undefined" && o instanceof Window) return true;
                                                        if (typeof Document !== "undefined" && o instanceof Document) return true;
                                                    }
                                                    if (typeof CSSStyleSheet !== "undefined" && o instanceof CSSStyleSheet) return true;
                                                    if (typeof StyleSheet !== "undefined" && o instanceof StyleSheet) return true;
                                                    if (typeof CanvasRenderingContext2D !== "undefined" && o instanceof CanvasRenderingContext2D) return true;

                                                    return false;
                                                }

                                                function safeGet(obj, key) {
                                                    try {
                                                        return obj[key];
                                                    } catch {

                                                        return undefined;
                                                    }
                                                }

                                                function isOmittableObjectValue(v) {
                                                    const t = typeof v;
                                                    return v === undefined || t === "function" || t === "symbol";
                                                }

                                                function normalizeNumber(n) {

                                                    return Number.isFinite(n) ? n : null;
                                                }

                                                let total = 0;
                                                const seenCount = new WeakSet();

                                                (function count(v) {
                                                    if (!v || typeof v !== "object") return;
                                                    if (shouldSkipObject(v)) return;
                                                    if (seenCount.has(v)) return;
                                                    seenCount.add(v);
                                                    total++;

                                                    if (Array.isArray(v)) {
                                                        for (let i = 0; i < v.length; i++) count(v[i]);
                                                    } else {
                                                        for (const k in v) {
                                                            if (transientRE.test(k)) continue;
                                                            const child = safeGet(v, k);
                                                            if (child !== undefined) count(child);
                                                        }
                                                    }
                                                })(graph);

                                                const seen = new WeakSet();
                                                const out = [];
                                                let visited = 0;
                                                let lastPct = -1;

                                                function write(s) { out.push(s); }

                                                function emitPct(frac01) {

                                                    const pct = 20 + Math.floor(Math.min(1, Math.max(0, frac01)) * 30);
                                                    if (pct !== lastPct) {
                                                        lastPct = pct;
                                                        progressBarPercent(pct);
                                                    }
                                                }

                                                async function walk(value, ctx) {

                                                    if (isOmittableObjectValue(value)) {

                                                        if (ctx === "array" || ctx === "root") {
                                                            write("null");
                                                        }
                                                        return;
                                                    }

                                                    if (typeof value === "number") {
                                                        write(JSON.stringify(normalizeNumber(value)));
                                                        return;
                                                    }

                                                    if (value && typeof value === "object") {
                                                        if (shouldSkipObject(value)) {
                                                            write("null");
                                                            return;
                                                        }
                                                        if (seen.has(value)) {
                                                            write('"[d_c]"');
                                                            return;
                                                        }
                                                        seen.add(value);
                                                        visited++;

                                                        if ((visited & 1023) === 0) {
                                                            emitPct(total ? visited / total : 0);
                                                            await new Promise(r => setTimeout(r, 0));
                                                        }

                                                        if (Array.isArray(value)) {
                                                            write("[");
                                                            for (let i = 0; i < value.length; i++) {
                                                                if (i) write(",");
                                                                const elem = value[i];

                                                                if (isOmittableObjectValue(elem)) {
                                                                    write("null");
                                                                } else {
                                                                    await walk(elem, "array");
                                                                }
                                                            }
                                                            write("]");
                                                            return;
                                                        }

                                                        write("{");
                                                        let first = true;
                                                        for (const k in value) {
                                                            if (transientRE.test(k)) continue;

                                                            const child = safeGet(value, k);

                                                            if (isOmittableObjectValue(child)) continue;

                                                            if (!first) write(",");
                                                            first = false;
                                                            write(JSON.stringify(k));
                                                            write(":");
                                                            await walk(child, "object");
                                                        }
                                                        write("}");
                                                        return;
                                                    }

                                                    write(JSON.stringify(value));
                                                }

                                                emitPct(0);
                                                await walk(graph, "root");
                                                progressBarPercent(50);

                                                let result = "";
                                                const joinChunk = 4096;
                                                for (let i = 0; i < out.length; i += joinChunk) {
                                                    result += out.slice(i, i + joinChunk).join("");
                                                    if ((i & (joinChunk * 8 - 1)) === 0) {
                                                        await new Promise(r => setTimeout(r, 0));
                                                    }
                                                }
                                                return result;
                                            }

                                            if ( !name.endsWith ( '.baja')){
                                                name = name + '.baja'
                                            }

                                            const gs = await stringifyGraphAsync(graph, progressBar);
                                            let binaryData = compressString(gs)
                                            const chunkSize = 0x8000;
                                            let stringData = '';
                                            for (let i = 0; i < binaryData.length; i += chunkSize) {
                                                const chunk = binaryData.subarray(i, i + chunkSize);
                                                stringData += String.fromCharCode.apply(null, chunk);
                                            }

                                            if (gs.track === null) {
                                                alert(' no track ')
                                                return;
                                            }
                                            hideAllModal();
                                            currentPath = currentPath.replace('//', '/')
                                            let host_ = window['env']['apiUrl']
                                            let jsonobj = {
                                                "name": name,
                                                "key": "user",
                                                "user": getUser(),
                                                "spath": currentPath,
                                                "value": stringData
                                            }
                                            progressBar(70)

                                            let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');

                                            // A REFUSAL IS AN ANSWER, NOT A CRASH. rs['path'] was read straight off
                                            // the response: a failed write, a rejected duplicate or anything that
                                            // returned no path threw a TypeError here, which -- with no catch around
                                            // any of this -- skipped the restore at the end and left the screen dead.
                                            if (!rs || !rs['path']) {
                                                const why = (rs && (rs.error || rs.message || rs.status)) ? (': ' + (rs.error || rs.message || rs.status)) : '';
                                                try { graph.setMessage(' ' + name + ' was not saved' + why + '. '); } catch (e) { }
                                                try { infoPrompt(' ' + name + ' was not saved' + why + '. '); } catch (e) { }
                                                return;
                                            }
                                            if (rs['path'].indexOf('myfiles') >= 0 && rs['path'].indexOf(getUser()) >= 0) {
                                                rs['path'] = rs['path'].replace('/' + getUser(), '')
                                            }
                                            currentPath = rs['path']
                                            currentPath = currentPath.replace('//', '/')

                                            window.history.pushState({ 'rna-screen': currentPath }, 'editor', `/app/manchester/editor?path=${currentPath}`);
                                            progressBar(80)

                                            if (rs.status === "saved") {
                                                let returned = null;
                                                try { returned = await GETJSON(host_ + '/validate-file?path=/' + rs['path'] + "&key=user&user=" + getUser()); } catch (e) { returned = null; }
                                                let tcount = 0;
                                                let ocount = 0;
                                                let snpsc = 0;
                                                // The file is already written by this point. Reading it back is a
                                                // confirmation, so a failure here reports less, and never turns a
                                                // save that worked into an error.
                                                let tracks = (returned && Array.isArray(returned.track)) ? returned.track : [];
                                                tcount = tracks.length;
                                                for (let t of tracks) {
                                                    if (t.oligos) {
                                                        ocount += t.oligos.length;
                                                    }
                                                    if (t.snpindels)
                                                        snpsc += t.snpindels.length;
                                                }
                                                infoPrompt(` Saved ${tcount} tracks, ${ocount} compounds and ${snpsc} snpindels`)
                                                let zoom_to = {
                                                    wid: 'card',
                                                    componentRef: 'bottomPanel',
                                                    data: {
                                                        height: '800px',
                                                        cards: [
                                                            [
                                                                {
                                                                    'title': ' ', 'body': ``
                                                                    ,
                                                                    'width': '90%',
                                                                    'component':
                                                                    {
                                                                        wid: 'html',
                                                                        data: '<font color=blue> Saved </font>'
                                                                    }
                                                                },
                                                                {
                                                                    'title': '',
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'mt-button', data: {
                                                                            buttons: [
                                                                                {
                                                                                    label: 'OK', ionFunction: createIonFunction(async () => {
                                                                                        hideAllModal();
                                                                                    })
                                                                                },
                                                                            ]
                                                                        }
                                                                    }
                                                                }
                                                            ]]
                                                    }
                                                }

                                                graph.setMessage("Saved.")
                                            }
                                            progressBar(90)
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', main_layout);
                                            // Hand the canvas back: putting the mainPanel back does not re-arm any
                                            // interaction, so after a save the user was left with a live-looking
                                            // canvas that had no hover highlight and no track menus until they
                                            // clicked something. setMouseMode('navigate') re-arms mouse-over-highlight.
                                            try { graph.clearMouseListeners(); } catch (e) { }
                                            try { graph.setMouseMode('navigate'); } catch (e) { }
                                            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, main_layout); } catch (e) { }
                                            try { if (graph.wake) graph.wake(); } catch (e) { }
                                            } catch (err) {
                                                try { graph.setMessage(' The save failed: ' + (err && err.message ? err.message : err) + ' '); } catch (e) { }
                                                try { infoPrompt(' The save failed: ' + (err && err.message ? err.message : err)); } catch (e) { }
                                                try { console.error('[save-obj] ', err); } catch (e) { }
                                            } finally {
                                                // The flag is released whatever happened; leaving it set would make
                                                // every later save on this tab a silent no-op, which is worse than
                                                // the crash it is there to prevent.
                                                window.__bajaSaveObjBusy = false;
                                                // And the screen comes back on every path, including the early
                                                // returns above. Putting mainPanel back twice is harmless; leaving
                                                // the user on a save card with a dismantled canvas is not.
                                                try { hideAllModal(); } catch (e) { }
                                                try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
                                                try { CurrentLayout.setComponent('mainPanel', main_layout); } catch (e) { }
                                                try { graph.clearMouseListeners(); } catch (e) { }
                                                try { graph.setMouseMode('navigate'); } catch (e) { }
                                                try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, main_layout); } catch (e) { }
                                                try { if (graph.wake) graph.wake(); } catch (e) { }
                                            }
                                        })
                                    },

                                    {
                                        'label': 'Cancel', 'function': createIonFunction(async (button_label, input_params) => {

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', main_layout);
                                            // Cancelling leaves the canvas just as dead as saving did — re-arm here too.
                                            try { graph.clearMouseListeners(); } catch (e) { }
                                            try { graph.setMouseMode('navigate'); } catch (e) { }
                                            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, main_layout); } catch (e) { }
                                            try { if (graph.wake) graph.wake(); } catch (e) { }

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
                                    "ionfunction.cmd": createIonFunction((element) => {

                                    }),

                                    width: '100%',
                                    columns: 3,
                                    showSearch: true,
                                    drive: 'user',
                                    user: getUser(),

                                    root: init_path,

                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                        hideAllModal();
                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),
                                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                                    })
                                }
                            }
                        }
                    ]
                ]
            }
        }

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', w);

    })
}
