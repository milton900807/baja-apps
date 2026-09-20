function (path, config) {

    // ---- global listeners, tracked so the close button can take them away -------------
    //
    // This app registers keydown, dragover, drop and paste handlers on the WINDOW and the
    // DOCUMENT, so they outlive the screen. Until there was a way out that did not matter
    // much; now that closing returns to the home screen, a keystroke or a dropped file
    // there would still be handled by an app that is no longer on screen.
    //
    // Tracking rather than de-duplicating by type: this app deliberately registers TWO
    // dragover handlers and TWO drop handlers in different places, and a helper that kept
    // one per type would silently unregister the first. Every registration is recorded and
    // every one is removed together.
    //
    // Re-entry clears the previous set first, so opening the app twice does not leave two
    // sets attached. The list lives on window because both cpd editors share it and only
    // one of them is ever open.
    try {
        for (const rec of (window.__bajaCpdListeners || [])) {
            try { rec[0].removeEventListener(rec[1], rec[2], rec[3]); } catch (e) { }
        }
    } catch (e) { }
    try { window.__bajaCpdListeners = []; } catch (e) { }
    try { if (window.__bajaNavPanel && window.__bajaNavPanel.destroy) window.__bajaNavPanel.destroy(); } catch (e) { }
    const __track = (target, type, fn, capture) => {
        try { window.__bajaCpdListeners.push([target, type, fn, capture]); } catch (e) { }
        try { target.addEventListener(type, fn, capture); } catch (e) { }
        return fn;
    };





    if (!config) {
        config = {
            mode: "editor"
        }
    }
    config.mode = 'editor'
    config.app = 'Generate'
    // The view-only VIEWER (cpd/baja-analytics-viewer.js): the same app with no menubar, no
    // navigation bar and no close button, read-only from the first frame. See __viewer below.
    // Known by its own address too: the route hands the app whatever it parsed from the
    // URL, which need not be an object, so a flag on config alone could be lost.
    const __viewer = !!((config && config.viewer) || (() => { try { return /\/baja-analytics-viewer(\/|$)/.test(window.location.pathname); } catch (e) { return false; } })());
    if (__viewer) { try { console.log('[analytics] viewer mode'); } catch (e) { } }
    const __setSelectedPanel = (c) => { if (__viewer) return; CurrentLayout.setComponent('selectedPanel', c); };

    const EditorState = class EditorState {
        paste_to_graph = true;
    }
    let eeditor_state = new EditorState();

    let htmlP;

    let user = getUser();
    // A direct link (/app/cpd/baja-analytics?path=…, a reload, a bookmark) arrives with no
    // config.user, while the file lists and the Open dialog pass one. The load below keys
    // on config.user: with it the workbook is copied in (copyFromJSON) and the server checks
    // access; without it the plain load ran and the canvas stayed empty. A signed-in user
    // is the user, whichever way the app was reached.
    if (user && user.length && !config.user) config.user = user;
    // A co-editing link: /app/cpd/baja-analytics?share=<code>. Resolved (asynchronously,
    // below) to the shared copy's path before the document is loaded.
    let __collabShareCode = '';
    try { __collabShareCode = ('' + (new URL(window.location.href).searchParams.get('share') || '')).trim(); } catch (e) { __collabShareCode = ''; }
    if (__collabShareCode && user && (!path || !path.length)) path = '/pending-share.bjb';
    if (!user || user.length <= 0) {
        if (path != null && path.length > 0) {
            let t = decodeURIComponent(path)

            const emailPattern = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
            const match = t.match(emailPattern);
            if (match && match[0] != null) {
                pathuser = match[0]
            }
        } else
            return exec('baja/nogo.js', path, 'bajabio-analytics')
    }

    showWidget({
        wid: 'html',
        data: '<hr>  '
    }).then(async working => {

        let HM = await exec('baja/history/HM')
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')

        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let current_mousex
        let current_mousey
        let tracks = []
        let mouseMoveListener;
        let mouseUpListener;
        let mouseDownListener;

        let draw;
        let currentShape = {
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            visible: false
        };

        let progressBar;
        let w = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 1,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }
        await showWidget(w)
        progressBar(0);
        path = decodeURIComponent(path)
        let obs = path;
        path = path.trim();
        if (config != null && config.user != null) {
            let parts = path.split('/');
            if (parts[0] === '') {
                parts[1] = '' + getUser();
            } else {
                parts[0] = getUser();
            }
            obs = parts.join('/');

        }
        mouseMode = 'structures'
        let PlateManager = class PlateManager {
            plateTrack;
            selectedPanel;
            selectedPoint;
            app;
            constructor() {
                this.plateTrack = new PlateTrack(path);
                if (__viewer) { this.plateTrack.__viewer = true; this.plateTrack.__readOnly = true; }

                this.plateTrack.init();
                this.setPlateTrack(this.plateTrack)
            }
            getPlateTrack() {
                return this.plateTrack;
            }
            updateEvents() {
                let e = LJScript.getEvents();
                if (e && e.length > 1 && htmlP) {
                    htmlP.setHTML(` <font color="blue">${e[e.length - 1]}</font>`)
                }
            }
            setPlateTrack(plateTrack) {
                // A load builds a NEW track from the document (gene2plates: Object.assign(new
                // PlateTrack(), fs)) and hands it here, so everything stamped on the old one
                // before the load -- view only, the viewer, the single shared object -- was
                // lost with it. Carry those over; the viewer is always view only.
                try {
                    const prev = this.plateTrack;
                    if (prev && plateTrack && prev !== plateTrack) {
                        for (const k of ['__viewer', '__readOnly', '__objectOnlyId', '__collabShareUrl']) {
                            if (prev[k] != null && plateTrack[k] == null) plateTrack[k] = prev[k];
                        }
                    }
                    if (__viewer && plateTrack) { plateTrack.__viewer = true; plateTrack.__readOnly = true; }
                } catch (e) { }
                this.plateTrack = plateTrack;

                this.plateTrack.addSelectionListener(async (sel) => {

                    if (!sel) {
                        this.selectedPanel = null;
                        setTimeout(async () => {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, sel)
                            __setSelectedPanel(button_canvas2)

                        }, 200);

                    }
                    else if (this.selectedPanel === sel) {
                        let comp = CurrentLayout.getComponent('selectedPanel')
                        if (comp && comp.components && comp.components[0]) {
                            if (comp.components[0].card_items_list) {
                                this.selectedPanel = sel;

                                if (config.mode === 'viewer') {
                                    let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, sel)
                                    __setSelectedPanel(button_canvas2)
                                } else {
                                    let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, sel)
                                    __setSelectedPanel(button_canvas2)
                                }
                            }
                        }

                    }
                    else {
                        this.selectedPanel = sel;
                        if (config.mode === 'viewer') {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, sel)
                            __setSelectedPanel(button_canvas2)
                        } else {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, sel)
                            __setSelectedPanel(button_canvas2)
                        }
                        if (sel) {
                            if (sel.name) {
                                pm.plateTrack.setMessage(`  ${sel.name} menu...`, 8)
                            } else if (sel.shape) {
                                pm.plateTrack.setMessage(`  ${sel.shape.type} menu...`, 8)
                            }
                        }

                    }
                })
                this.plateTrack.addPointListener(async (sel) => {
                    if (sel && Array.isArray(sel)) {
                        let m = await this.plateTrack.selectedPlate.getContextMenuItems(this.plateTrack);
                        let sp = []
                        for (let s of sel) {
                            sp.push(
                                {
                                    label: `${s.name}`,
                                    click: async (scx, scy) => {
                                        this.selectedPoint = s;
                                        const point = s;
                                        const pt = this.plateTrack;
                                        let screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                                        let screen_ptwidth = pt.grid.worldWidth(pt.grid.width);
                                        let screen_x = pt.grid.Xwc(this.plateTrack.selectedPlate.grid.X(point.x));
                                        let screen_y = pt.grid.Ywc(this.plateTrack.selectedPlate.grid.Y(0));
                                        let small_width = screen_ptwidth;
                                        let small_height = screen_ptheight;

                                        if (point.startX) {
                                            screen_x = pt.grid.Xwc(this.plateTrack.selectedPlate.grid.X(point.startX));
                                            let endX = pt.grid.Xwc(this.plateTrack.selectedPlate.grid.X(point.x))
                                            let rect_x = Math.abs(endX - screen_x)
                                            let rect_y = screen_y - small_height / 2;

                                            await pt.zoomto(screen_x, rect_y, rect_x, small_height);

                                        } else {
                                            let rect_x = screen_x - small_width / 2;
                                            let rect_y = screen_y - small_height / 2;
                                            await pt.zoomto(rect_x, rect_y, small_width, small_height);
                                        }

                                        if (!this.selectedPoint) {
                                            // The editor's menubar (File, Build, Draw, Share, tools); the viewer
                                            // variant carries none of them and lost the Build menu here.
                                            let button_canvas2 = await exec(config.mode === 'viewer' ? 'manchester/controls/navigation-panel-plates2-viewer.js' : 'manchester/controls/navigation-panel-plates2.js', pm, this.selectedPanel, null)
                                            __setSelectedPanel(button_canvas2)
                                            return;
                                        }
                                        if (config.mode === 'viewer') {
                                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, this.selectedPanel, s)
                                            __setSelectedPanel(button_canvas2)
                                        } else {
                                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, this.selectedPanel, s)
                                            __setSelectedPanel(button_canvas2)
                                        }
                                    }
                                }
                            )
                        }

                        // The full menubar for the selected plot (File, Build, Draw, Share, the
                        // plot's menu, tools), with a Time Points menu for the selection added.
                        // A menubar built here by hand carried only the plot menu and the points,
                        // and that is where the Build menu kept going missing.
                        const timePoints = { 'label': `[Time Points]`, 'items': sp, __ctx: 'point' };
                        let menuItm = null;
                        try { menuItm = await exec('manchester/controls/navigation-panel-plates2.js', pm, this.plateTrack.selectedPlate, null); } catch (e) { menuItm = null; }
                        try {
                            if (menuItm && menuItm.wid === 'menu' && menuItm.data && Array.isArray(menuItm.data.menus)) {
                                menuItm.data.menus.push(timePoints);
                            } else if (menuItm && menuItm.wid === 'card') {
                                // mobile: two stacked bars; the context menus live on the second
                                const row = menuItm.data && menuItm.data.cards && menuItm.data.cards[0];
                                const bar = row && (row[1] || row[0]);
                                if (bar && bar.component && bar.component.data && Array.isArray(bar.component.data.menus)) bar.component.data.menus.push(timePoints);
                            }
                        } catch (e) { }
                        if (!menuItm) {
                            menuItm = {
                                wid: 'menu',
                                data: {
                                    cmd: createIon(async (str, panel) => { }),
                                    menus: [
                                        ...((pm.__appMenus && pm.__appMenus()) || []),
                                        { 'label': `${this.plateTrack.selectedPlate.name}`, 'items': m },
                                        timePoints,
                                    ]
                                }
                            }
                        }
                        __setSelectedPanel(menuItm)
                    } else {
                        this.selectedPoint = sel;
                        if (!this.selectedPoint) {
                            let button_canvas2 = await exec(config.mode === 'viewer' ? 'manchester/controls/navigation-panel-plates2-viewer.js' : 'manchester/controls/navigation-panel-plates2.js', pm, this.selectedPanel, null)
                            __setSelectedPanel(button_canvas2)
                            return;
                        }

                        if (config.mode === 'viewer') {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2-viewer.js', pm, this.selectedPanel, sel)
                            __setSelectedPanel(button_canvas2)
                        } else {
                            let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', pm, this.selectedPanel, sel)
                            __setSelectedPanel(button_canvas2)
                        }
                    }
                })
            }
        }
        let pm = new PlateManager()
        if (config && config.app)
            pm.app = config.app;
        exec('flexigraph/gene2plates.js', pm, progressBar).then(async (graph) => {
            cacheOn()
            let io;
            let tracks;




            let file_items = []



            let genegraph_panel_layout;
            let sequenceTextEditor;
            let descHook = createIonFunction((p) => {
                sequenceTextEditor = p;
            });
            const spath = '/baja/templates/tables';
            const load_file = async (path, name) => {
                let jsonobj = {
                    'spath': path,
                    'rule_name': name,
                    'user': getUser()
                }
                let host_ = window['env']['apiUrl']
                let rs = await POSTJSON(jsonobj, host_ + '/get-script');
                return rs;
            }


            function isLikelySmiles(text) {
                if (typeof text !== 'string') return false;

                const s = text.trim();
                if (!s) return false;

                // Reject obvious multiline / paragraph text
                if (s.includes('\n') || s.includes('\r')) return false;

                // Reject obvious XML / HTML / SVG / JSON-ish payloads
                if (
                    s.startsWith('<') ||
                    s.startsWith('{') ||
                    s.startsWith('[') ||
                    s.startsWith('function ') ||
                    s.startsWith('def ') ||
                    s.startsWith('class ')
                ) {
                    return false;
                }

                // Basic allowed SMILES-ish character set
                // Covers atoms, ring numbers, bonds, stereochemistry, branches, charges, dot-disconnects, slash bonds, percent ring ids
                const smilesPattern = /^[A-Za-z0-9@+\-\[\]\(\)=#$\\/%.:]+$/;
                if (!smilesPattern.test(s)) return false;

                // Reject strings with spaces/tabs; plain SMILES should usually be a single token
                if (/\s/.test(s)) return false;

                // Must contain at least one atom-like token
                const hasAtomToken = /Br|Cl|Si|Na|Ca|Li|Mg|Al|[BCNOFPSIKHbcnops]/.test(s);

                // Some structural hints common in SMILES
                const hasStructureHint =
                    /[\[\]\(\)=#@\\/\.]/.test(s) ||
                    /\d/.test(s) ||
                    /c|n|o|s|p/.test(s);

                if (!hasAtomToken) return false;
                if (!hasStructureHint && s.length < 2) return false;

                return true;
            }




            function removeLastFileNode(p) {
                if (typeof p !== 'string') return '';

                const hadBackslashes = /\\/.test(p);
                let s = p.replace(/\\/g, '/');

                const unc = s.match(/^\/\/[^/]+\/[^/]+/);
                const drive = s.match(/^[A-Za-z]:\//);
                const rootLen = unc ? unc[0].length : drive ? 3 : s.startsWith('/') ? 1 : 0;

                while (s.length > rootLen && s.endsWith('/')) s = s.slice(0, -1);

                const idx = s.lastIndexOf('/');
                if (idx < 0) s = '';
                else if (idx < rootLen) s = s.slice(0, rootLen);
                else s = s.slice(0, idx);

                return hadBackslashes ? s.replace(/\//g, '\\') : s;
            }




            setTimeout(async () => {

                const result = await verifyUserPath('cpd/bajabio-analytics', 'bajabio-Analytics');

                if (!result.allowed) {
                    // Not subscribed drops this app to FREE MODE rather than throwing up the checkout
                    // page. This check runs on a TIMER, so the old behavior interrupted someone mid-session
                    // with a paywall over work they were in the middle of -- and denied them on a network
                    // error too, before verifyUserPath was fixed to fail open.
                    //
                    // Editing, saving and designing stay available. What the free tier actually limits is the
                    // AI and off-target calls, and those are capped server-side in freeGate (baja-server),
                    // which is the only place a browser cannot edit the answer.
                    try { window.__bajaFreeTier = true; } catch (e) { }
                }
            }, 10 * 60);

            let { Track, TrackRef } = await exec('baja/bio/track-flexi.js')
            let __loadedSharedFrom = '';
            // A share narrowed to one object: the recipient gets only that object, maximized.
            let __shareObject = null;
            // A PUBLIC link: anyone, signed in or not, gets the snapshot through /public-share.
            let __publicShare = null;
            // The viewer opens without sign-in only for a PUBLIC link. A link shared with a
            // person needs the person: a visitor with no session is sent to the free sign-in
            // and brought back here afterwards (oidc.returnTo, as the route guard does).
            const __toLogin = () => {
                try { sessionStorage.setItem('oidc.returnTo', window.location.pathname + window.location.search); } catch (e) { }
                window.location.href = window.location.origin + '/login?free=1';
            };
            if (__collabShareCode && (getUser() || __viewer)) {
                try {
                    let __r = await GETJSON(window['env']['apiUrl'] + '/share-open?code=' + encodeURIComponent(__collabShareCode) + '&user=' + encodeURIComponent(getUser() || ''));
                    // GETJSON hands back the HTTP error itself on a 4xx: its .error is the
                    // server's JSON ({ error, message }) and its .message the transport's
                    // "Http failure response for …: 403 OK", which is not for people to read.
                    if (__r && __r.error && typeof __r.error === 'object') {
                        const body = __r.error, st = __r.status;
                        __r = { error: body.error || 'error', message: body.message || (st === 403 ? 'This link was shared with a different email address. Sign in with the address it was sent to.' : st === 404 ? 'This share link was not found. It may have been revoked.' : st === 401 ? 'Sign in to open this document.' : 'This link could not be opened right now.') };
                    } else if (__r && __r.error && typeof __r.message === 'string' && /^Http failure/i.test(__r.message)) {
                        __r = { error: 'error', message: 'This link could not be opened right now (the server did not answer).' };
                    }
                    if (__viewer && !getUser() && !(__r && __r.public)) { __toLogin(); return; }
                    if (__r && __r.public) { __publicShare = { code: __collabShareCode, name: __r.name || 'shared.bjb' }; try { pm.plateTrack.__readOnly = true; } catch (e) { } }
                    if (__r && __r.path) { path = __r.path; config = config || {}; if (getUser()) config.user = getUser(); }
                    // View only: the recipient may look and pan; nothing they do is saved.
                    if (__r && __r.access === 'view' && (!__r.mine || __viewer)) { try { pm.plateTrack.__readOnly = true; } catch (e) { } }
                    // The owner opening their own link in the editor gets the whole workbook;
                    // in the viewer everyone, owner included, gets the shared object alone.
                    if (__r && __r.object && __r.object.id && (!__r.mine || __viewer)) {
                        __shareObject = { kind: __r.object.kind, id: '' + __r.object.id, label: __r.object.label || '', owner: __r.owner || '' };
                        // From the very first frame only the shared object is painted: the rest
                        // of the workbook travels for the formulas, not for the recipient's eyes.
                        try { pm.plateTrack.__objectOnlyId = __shareObject.id; } catch (e) { }
                    }
                    else if (__r && __r.message) { try { infoPrompt(__r.message); } catch (e) { } path = ''; }
                } catch (e) {
                    console.warn('share-open failed', e);
                    if (__viewer && !getUser()) { __toLogin(); return; }
                    path = '';
                }
            }

            // What a load produced, on the canvas and in the console: a refusal or an empty
            // workbook used to look exactly like a document that failed to draw.
            const __reportLoad = (rs, p) => {
                try {
                    if (rs && rs.msg) { console.warn('[load]', p, '->', rs.msg); try { infoPrompt(rs.msg + '\n' + p); } catch (e) { } return; }
                    const t = (rs && rs.plateTrack) || {};
                    const n = (a) => Array.isArray(a) ? a.length : 0;
                    const tables = n(t.root), plots = n(t.m_plots), notes = n(t.glyphs), tracks = n(rs && rs.track);
                    console.log('[load]', p, '| tables', tables, '| charts', plots, '| notes', notes, '| tracks', tracks);
                    if (!tables && !plots && !notes && !tracks) setTimeout(() => { try { pm.plateTrack.setMessage('This workbook is empty: ' + p + ' has no tables, charts or notes.', 3); } catch (e) { } }, 1500);
                } catch (e) { }
            };
            // Files are saved as .bjb (save-as-obj-tp appends it); .bajabio is the older name.
            if (__publicShare) {
                const host_ = window['env']['apiUrl'];
                let rs = null;
                try { rs = await GETJSON(host_ + '/public-share?code=' + encodeURIComponent(__publicShare.code)); } catch (e) { rs = { msg: 'This public link could not be opened.' }; }
                progressBar(45);
                const p = __publicShare.name;
                if (rs && !rs.msg && !rs.error) __reportLoad(rs, p);
                if (!rs || rs.msg || rs.error) {
                    clear();
                    showWidget({ wid: 'html', data: '<hr> ' + ((rs && (rs.msg || rs.error)) || 'This public link is not available.') });
                    return;
                }
                if (rs.plateTrack) rs.plateTrack.file = path;
                if (rs.ptracks && rs.formulas) { pm.plateTrack.copyFromJSON(rs); graph.file = p; }
                await graph.update(rs);
                graph.file = p;
            } else if (path.endsWith('.bajabio') || path.endsWith('.bjb')) {
                let host_ = window['env']['apiUrl']
                let index = path.lastIndexOf('/')
                if ((config != null && config.user != null) || path.startsWith('/myfiles/')) {
                    let jsonobj = {
                        'path': path,
                        'key': 'user',
                        'user': getUser()
                    }
                    let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    if (rs.shared_from) {
                        jsonobj.path = rs.shared_from;
                        if (!jsonobj.path.startsWith('/')) {
                            jsonobj.path = '/' + jsonobj.path;
                        }
                        __loadedSharedFrom = jsonobj.path;
                        rs = await POSTJSON(jsonobj, host_ + '/load-file');
                        if (rs.plateTrack)
                            rs.plateTrack.file = path;
                        let p = decodeURIComponent(path).substring(index + 1)
                    __reportLoad(rs, p);

                        if (rs.msg) {
                            clear();
                            log(rs.msg + ' ' + p)
                            return;
                        } else {
                            if (rs && rs.ptracks && rs.formulas) {
                                pm.plateTrack.copyFromJSON(rs)
                                graph.file = p;
                            }
                            await graph.update(rs);
                            graph.file = p;
                        }

                    } else {

                        if (rs.plateTrack) {
                            rs.plateTrack.file = path;

                        }
                        let p = decodeURIComponent(path).substring(index + 1)
                    __reportLoad(rs, p);

                        if (rs.msg) {
                            clear();
                            log(rs.msg + ' ' + p)
                            return;
                        } else {
                            if (rs && rs.ptracks && rs.formulas) {
                                pm.plateTrack.copyFromJSON(rs)
                                graph.file = p;
                            }
                            await graph.update(rs);
                            graph.file = p;
                        }
                    }
                    progressBar(45)
                } else {

                    let jsonobj = {
                        'path': path,
                        'user': getUser()
                    }
                    let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                    progressBar(45)
                    let p = decodeURIComponent(path).substring(index + 1)
                    __reportLoad(rs, p);
                    if (rs.msg && rs.msg.length) {

                        clear();
                        showWidget({
                            wid: 'html',
                            data: "<hr> " + rs.msg
                        })
                        return;

                    } else {
                        await graph.update(rs);
                        graph.file = p;
                    }
                }

            }
            // Keep the address bar on this document, so a reload or a copied link reopens
            // it. Launchers that exec() the app directly (file lists, app tiles) never set it.
            // A shared copy (reached through a pointer under shared_with_me, or directly) is
            // addressed by its share code, so a reload reopens the share and not the pointer.
            try {
                const __u = new URL(window.location.href);
                const __sharedM = ('' + (__loadedSharedFrom || '')).match(/\/shared\/([^\/]+)\//);
                const __code = __collabShareCode || (__sharedM ? __sharedM[1] : '');
                // The viewer keeps its own address: rewriting it to the editor's sent the
                // next reload (and the shell's route check) back to the full Analytics app.
                const __appPath = __viewer ? '/app/cpd/baja-analytics-viewer' : '/app/cpd/baja-analytics';
                if (__code) {
                    if (__u.searchParams.get('share') !== __code || __u.pathname !== __appPath) {
                        window.history.replaceState({ collab: __loadedSharedFrom || path }, 'Baja - Project', __appPath + '?share=' + encodeURIComponent(__code));
                    }
                    try { if (!pm.plateTrack.__collabShareUrl) pm.plateTrack.__collabShareUrl = window.location.origin + '/s/' + __code; } catch (e) { }
                } else if (path && /\.(bjb|bajabio)$/i.test(path)) {
                    if (__u.pathname !== __appPath || __u.searchParams.get('path') !== path) {
                        window.history.replaceState({ bjb: path }, 'Baja - Project', __appPath + '?path=' + encodeURIComponent(path));
                    }
                }
            } catch (e) { }

            let Icon = await exec('flexigraph/shapes/icon.js')
            graph.folder = path;
            // Join the document's live session: locks, presence and object sync with anyone
            // else who has this file open (shared copies are reached through their pointer).
            try {
                const __collabPath = (typeof __loadedSharedFrom === 'string' && __loadedSharedFrom) ? __loadedSharedFrom : ((path && /\.(bjb|bajabio)$/i.test(path)) ? path : '');
                if (__collabPath && getUser() && !__publicShare) {
                    pm.plateTrack.__collab = await exec('baja/plate/collab/collab-session.js', pm.plateTrack, { path: __collabPath, graph });
                    if (pm.plateTrack.__collab) pm.plateTrack.__collabDoc = __collabPath;
                }
            } catch (e) { console.warn('live session not started', e); }
            // Navigation bar: camera history (a view held 20 s becomes a place; Back /
            // Forward walk them) and bookmarks that open any object maximized.
            // A single-object share gets no navigation bar: its Places, Bookmarks, Go to and
            // Show all are ways out to the rest of the workbook, which is not the recipient's.
            if (!pm.plateTrack.__objectOnlyId && !__viewer) {
                try { pm.plateTrack.__nav = await exec('baja/plate/views/navigation-history.js', pm.plateTrack, graph); } catch (e) { console.warn('navigation bar', e); }
            }
            // The way back out of a folder. Opening one (a folder's menu, "Open..") swaps the
            // whole canvas for the one inside it; this is the button at the top left that
            // returns to the canvas that was left. It shows itself only while inside a folder.
            if (!__viewer) {
                try { pm.plateTrack.__folderBack = await exec('baja/plate/views/folder-back.js', pm.plateTrack, graph); } catch (e) { console.warn('folder back', e); }
            }
            // Single-object share: find the object once the document is on the canvas and
            // pin the view to it. A few tries, because the plots are rebuilt on the first
            // frames after a load.
            if (__shareObject) {
                const pt = pm.plateTrack;
                const findShared = () => {
                    const id = __shareObject.id;
                    for (const p of pt.root || []) if (p && ('' + (p.uid || p.id)) === id) return p;
                    for (const m of pt.m_plots || []) if (m && ('' + (m.uid || m.id)) === id) return m;
                    for (const g of pt.glyphs || []) if (g && ('' + (g.uid || g.id)) === id) return g;
                    return null;
                };
                let tries = 0;
                const pin = () => {
                    const obj = findShared();
                    if (obj) {
                        try { pt.enterObjectOnly(obj, { owner: __shareObject.owner, label: __shareObject.label }); } catch (e) { console.warn('object share', e); }
                        if (__viewer) { try { graph.setMouseMode('navigate'); } catch (e) { } }
                        return;
                    }
                    if (++tries < 20) setTimeout(pin, 400);
                    else { try { pt.setMessage('The shared ' + (__shareObject.label || 'object') + ' is no longer in this document.', 2); } catch (e) { } }
                };
                setTimeout(pin, 600);
            }
            function handleShiftClick(event) {

                if (event.shiftKey && event.type === 'mousedown') {
                    console.log('Shift + Click detected');
                    if (pm.plateTrack && pm.plateTrack.selectedPlate) {
                        pm.plateTrack.selectedPlate.selectContiguousRange();
                    }
                }
            }
            function attachShiftClickListener(element = document) {
                element.addEventListener('mousedown', handleShiftClick);
            }
            attachShiftClickListener();
            __track(window, 'keydown', async function (event) {
                if (pm.plateTrack && pm.plateTrack.__readOnly) return;   // view only
                if (event.ctrlKey && event.key === 'z') {
                }
            });
            function parseFasta(fastaString) {
                const lines = fastaString.split('\n');
                let sequence = '';
                let description = '';

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();

                    if (line.startsWith('>')) {

                        description = line.substring(1).trim();
                    } else {

                        sequence += line;
                    }
                }

                sequence = sequence.replace(/[^a-zA-Z]/g, '').toUpperCase();

                return {
                    description: description,
                    sequence: sequence,
                };
            }

            __track(document, 'keydown', async (event) => {
                if (pm.plateTrack && pm.plateTrack.__readOnly) return;   // view only
                if (event && event.target && event.target.id === 'baja-mobile-cell-input') return;

                if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
                    event.preventDefault();
                    await handleUndo();
                }
                if ((event.ctrlKey) && event.key === 'Z') {
                    event.preventDefault();
                    handleRedo();
                }
                if (event.key === 'Tab') {

                }
            });
            function findObjectWithUid(objects, uidValue) {
                function scan(obj) {
                    if (obj && typeof obj === 'object') {

                        if ('uid' in obj && obj.uid === uidValue) {
                            return obj;
                        }
                        for (let key in obj) {
                            if (obj.hasOwnProperty(key)) {
                                let result = scan(obj[key]);
                                if (result) {
                                    return result;
                                }
                            }
                        }
                    }
                    return null;
                }

                if (Array.isArray(objects)) {
                    for (let item of objects) {
                        let result = scan(item);
                        if (result) {
                            return result;
                        }
                    }
                } else {

                    return scan(objects);
                }

                return null;
            }

            function reconstituteObject(originalObject, jsonObject) {
                for (let key in jsonObject) {
                    if (jsonObject.hasOwnProperty(key)) {
                        const originalValue = originalObject[key];
                        const jsonValue = jsonObject[key];

                        if (jsonValue === null || typeof jsonValue !== 'object') {
                            if (originalValue !== jsonValue) {
                                originalObject[key] = jsonValue;
                            }
                        } else if (typeof jsonValue === 'object' && originalValue && typeof originalValue === 'object') {
                            if (key === 'grid' && originalValue instanceof MGrid) {

                                Object.assign(originalValue, jsonValue);
                            } else if (key === 'wells' && Array.isArray(jsonValue)) {

                                for (let col = 0; col < jsonValue.length; col++) {
                                    if (!originalValue[col]) {
                                        originalValue[col] = [];
                                    }

                                    for (let row = 0; row < jsonValue[col].length; row++) {
                                        const jsonWell = jsonValue[col][row];
                                        if (originalValue[col][row] instanceof GenericWell) {
                                            Object.assign(originalValue[col][row], jsonWell);
                                        } else {
                                            originalValue[col][row] = new GenericWell(
                                                jsonWell.name,
                                                jsonWell.value,
                                                jsonWell.obj,
                                                jsonWell.group
                                            );
                                            Object.assign(originalValue[col][row], jsonWell);
                                        }
                                    }

                                    if (originalValue[col].length > jsonValue[col].length) {
                                        originalValue[col].length = jsonValue[col].length;
                                    }
                                }

                                if (originalValue.length > jsonValue.length) {
                                    originalValue.length = jsonValue.length;
                                }
                            } else {
                                reconstituteObject(originalValue, jsonValue);
                            }
                        }
                    }
                }
            }

            let redo = []
            let handleUndo = async () => {
                let gs;
                gs = await popHistory()
                if (!gs) {
                    return;
                }
                if (gs.root) {
                    graph.updatePlateTracks(gs)
                } else {
                    if (pm.plateTrack && pm.plateTrack.selectedTrack)
                        pm.plateTrack.selectedTrack.pushAnyPreviousHistory()
                    if (gs.uid) {
                        let ob = findObjectWithUid([pm], gs.uid)
                        if (ob) {
                            redo.push(HM(ob))
                            reconstituteObject(ob, gs)
                        }
                    }
                }
            }

            let handleRedo = () => {
                if (redo.length > 0) {
                    let gs = JSON.parse(redo.pop());
                    if (gs.root) {
                        graph.updatePlateTracks(gs)
                    } else {
                        if (gs.uid) {
                            let ob = findObjectWithUid([pm], gs.uid)
                            if (ob) {
                                pushHistory(HM(ob))
                                reconstituteObject(ob, gs)
                            }
                        }
                    }

                }
            }

            __track(window, 'dragover', (e) => {
                e.preventDefault();
            });
            __track(window, 'drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        let base64String = event.target.result.split(',')[1];
                        let fileBuffer = new TextDecoder('utf-8').decode(new Uint8Array([...base64String].map(char => char.charCodeAt(0))));
                        let binaryString = atob(fileBuffer);
                        if (binaryString.startsWith('>')) {
                            let seqo = parseFasta(binaryString)
                            graph.setMessage(seqo.description + " track from  fasta")
                            let sequence = seqo.sequence;

                            let t = new Track(seqo.description, 0, sequence.length, 1, 1)
                            t.sequence = sequence;
                            pm.plateTrack.m_plots.push(t)

                            setTimeout(() => {
                                let length = graph.track[graph.track.length - 1].sequence.length;
                                graph.zoomToTrack(graph.track.length - 1, (length * (-0.2)),
                                    length + (length * 0.2))
                            }, 2000)
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });

            let smenu = null;
            let setMenu = async (__smenu) => {
                if (!smenu) {
                    return;
                }
                currentWorkbench = null;
                smenu = __smenu;
                mousePriority = false;
                mouseDownListener = (x, y) => {
                };
                mouseMoveListener = (x, y) => {
                    if (!smenu) {
                        console.log(" no menu ")
                    }
                    let mmx = pm.plateTrack.grid.Xwc(x);
                    let mmy = pm.plateTrack.grid.Ywc(y);
                    if (smenu && smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                        smenu.mouseMove(pm.plateTrack.grid, mmx, mmy)
                    }
                }
                mouseUpListener = async (x, y) => {
                    let mmx = pm.plateTrack.grid.Xwc(x);
                    let mmy = pm.plateTrack.grid.Ywc(y);
                    if (smenu && smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                        await smenu.mouseUp(pm.plateTrack.grid, mmx, mmy)

                    }
                }
            }

            let zoomin = async () => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.grid.rescale();
                smenu = null;
                mousePriority = false;
                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;
                let xdf = Math.abs((xmax - xmin) / 3);
                let ydf = Math.abs((ymax - ymin) / 3);
                ymax -= ydf;
                ymin += ydf;
                xmax -= xdf;
                xmin += xdf;
                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);
                pm.plateTrack.grid.rescale();
            }

            // A gentle, symmetric step for the toolbar buttons: the view's width and height
            // divided (in) or multiplied (out) by the factor, about the view's centre. The
            // menu's zoomin / zoomout above and below are 3x and 2x, too much per click.
            let zoomStep = async (factor) => {
                AnimateGrid.INTERUPT = true;
                const g = pm.plateTrack.grid;
                g.rescale();
                smenu = null;
                mousePriority = false;
                const cx = (g.xmax + g.xmin) / 2, cy = (g.ymax + g.ymin) / 2;
                const hw = Math.abs(g.xmax - g.xmin) / 2 / factor, hh = Math.abs(g.ymax - g.ymin) / 2 / factor;
                const ag = new AnimateGrid(g);
                await ag.animateTo(cx - hw, cx + hw, cy - hh, cy + hh, 12);
                g.rescale();
            }

            let zoomout = async () => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;
                mousePriority = false;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;
                let xdf = Math.abs((xmax - xmin) / 2);
                let ydf = Math.abs((ymax - ymin) / 2);

                ymax += ydf;
                ymin -= ydf;
                xmax += xdf;
                xmin -= xdf;
                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);
                pm.plateTrack.grid.rescale();
            }

            let shiftLeft = async (left_distance) => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.grid.rescale();
                smenu = null;
                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                xmin -= left_distance;
                xmax -= left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftDown = async (left_distance) => {
                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                ymin -= left_distance;
                ymax -= left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftUp = async (left_distance) => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                ymin += left_distance;
                ymax += left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let shiftRight = async (left_distance) => {
                AnimateGrid.INTERUPT = true;

                pm.plateTrack.grid.rescale();
                smenu = null;

                let xmax = pm.plateTrack.grid.xmax;
                let xmin = pm.plateTrack.grid.xmin;
                let ymax = pm.plateTrack.grid.ymax;
                let ymin = pm.plateTrack.grid.ymin;

                xmin += left_distance;
                xmax += left_distance;

                let ag = new AnimateGrid(pm.plateTrack.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax);

                pm.plateTrack.grid.rescale();
            }

            let zoomtofitplates = () => {
                AnimateGrid.INTERUPT = true;
                pm.plateTrack.zoomtfit()
            }
            let px = 0;
            let py = 0;
            let mouse_down = false;
            // Mobile finger tracking: the world point under the finger when the pan began
            // (kept there by moving the grid), and the last screen y for the maximized scroll.
            let __touchPx = null, __touchPy = null, __touchSy = null, __touchSx = null;

            let dragnavigate = () => {
                draw = null;
                menuManager = null;
                smenu = null;
                currentWorkbench = null;
                smenu = null;
                mouseMoveListener = null;
                mouseUpListener = null;
                mouseDownListener = null;
                draw = null;
                keydown = null;
                px = 0;
                px = 0;

                graph.setMouseMode("navigate")

                let t = {
                    id: 'drag-navigate',
                    priority: true,
                    mouseUpListener: (scx, scy) => {
                        px = 0;
                        py = 0;
                        mouse_down = false;
                    },
                    mouseDownListener: (scx, scy) => {
                        mouse_down = true;
                    },
                    mouseMoveListener: (scx, scy) => {
                        if (smenu) {
                            return;
                        }
                        if (mouse_down) {
                            if (px === 0) {
                                px = pm.plateTrack.grid.Xwc(scx);
                                py = pm.plateTrack.grid.Ywc(scy);
                            }
                            else {
                                let xd = px - pm.plateTrack.grid.Xwc(scx);
                                let yd = py - pm.plateTrack.grid.Ywc(scy);
                                pm.plateTrack.grid.setxmin(pm.plateTrack.grid.getxmin() + xd);
                                pm.plateTrack.grid.setymin(pm.plateTrack.grid.getymin() + yd);
                                pm.plateTrack.grid.setxmax(pm.plateTrack.grid.getxmax() + xd);
                                pm.plateTrack.grid.setymax(pm.plateTrack.grid.getymax() + yd);
                                pm.plateTrack.grid.rescale();
                            }
                        } else {
                            let new_selected = pm.plateTrack.getPlate(pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))
                            if (new_selected) {
                                if (new_selected != pm.plateTrack.grid.selectedPlate || !pm.plateTrack.selectedPlate) {
                                }
                            }
                        }
                    }
                }
                wb(t)
            }

            let currentWorkbench = null;
            let wb = (wbset) => {


                if (!wbset) {



                    if (currentWorkbench && currentWorkbench.id && currentWorkbench.id === 'drag-navigate') {
                        return;
                    }
                    if (currentWorkbench != null && currentWorkbench.close) {
                        currentWorkbench.close();
                    }
                    currentWorkbench = null;
                    smenu = null;
                    mouseMoveListener = null;
                    mouseUpListener = null;
                    mouseDownListener = null;
                    touchStart = null;
                    touchEnd = null;
                    touchMove = null;
                    draw = null;
                    menuManager = null;
                    keydown = null;
                    mouse_down = false;
                    dragnavigate();
                    return;
                } else {
                    if (currentWorkbench?.id === wbset.id) {
                        return;
                    }
                    if (currentWorkbench != null && currentWorkbench.close) {
                        currentWorkbench.close();
                    }
                    currentWorkbench = wbset;
                    pm.plateTrack.wbid = currentWorkbench.id;
                }


                if (wbset.buttons) {
                    panel.setButtons(wbset.buttons)
                }
                if (wbset.msg) {
                    message = wbset.msg;
                    setTimeout(() => {
                        message = null;
                    }, 5000)
                }

                mouseMoveListener = wbset.mouseMoveListener;
                mouseUpListener = wbset.mouseUpListener;
                mouseDownListener = wbset.mouseDownListener;
                draw = wbset.draw;
                smenu = wbset.smenu;
                menuManager = wbset.menuManager;
                if (wbset.init) {
                    wbset.init(current_mousex, current_mousey, pm);
                }

            }

            let default_dbclick = (scx, scy) => {

            }

            let default_wheel = (dy) => {

            }

            let resize_plate_width = (plate, scx, scy) => {
                let xi = scx;
                let yi = scy;

                pushHistory(HM(plate))
                let origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                let diffx = 0
                mouse_down = true;
                let t = {
                    id: 'resize-width',
                    priority: true,
                    mouseDownListener: (async (x, y) => {
                        mouse_down = true;
                        xi = x;
                        if (pm.plateTrack && plate && plate.grid) {
                            yi = y + pm.plateTrack.grid.Y(plate.getHeight());
                            plate.__resizing = true;
                            pm.plateTrack.grid.rescale();
                            origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                        }
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale()
                        if (mouse_down) {
                            diffx = x - xi
                            let sw = (origWidth + diffx);
                            if (sw < 10) {
                                sw = 10;
                            }
                            plate.__resizing = true;
                            plate.visible_cell_aspect_ratio_min = null;
                            plate.visible_cell_aspect_ratio_max = null;

                            let gw = pm.plateTrack.grid.worldWidth(sw);
                            plate.setWidth(gw);
                            plate.grid.rescale();
                        }
                        else if (!pm.plateTrack.selectedPlate.onRightEdge(x, y, pm.plateTrack)) {
                            plate.__resizing = false;
                            plate.resizable = false;
                            plate.clk_drag(pm.plateTrack)
                        }

                    }),
                    mouseUpListener: ((x, y) => {
                        if (plate) {
                            plate.__resizing = false;
                            plate.resizable = false;
                        }
                        setTimeout(() => {
                            wb(null)
                        }, 199);

                    })
                }
                wb(t)
            }

            let resize_plate = (plate, scx, scy) => {

                let xi = scx;
                let yi = scy;
                let origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                let origHeight = pm.plateTrack.grid.screenHeight(plate.getHeight());
                mouse_down = true;

                const rhm = HM(plate)
                pushHistory(rhm)
                let t = {
                    id: 'resize',
                    priority: true,
                    mouseDownListener: (async (x, y) => {
                        mouse_down = true;
                        xi = x;
                        if (pm.plateTrack && plate && plate.grid) {
                            pm.plateTrack.grid.rescale();
                            plate.grid.rescale();
                            plate.last_touched = new Date();

                            plate.__resizing = true;
                            origWidth = pm.plateTrack.grid.screenWidth(plate.getWidth());
                            origHeight = pm.plateTrack.grid.screenHeight(plate.getHeight());
                            originyi = plate.grid.yi;
                        }
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale();

                        if (mouse_down) {
                            plate.__resizing = true;
                            plate.last_touched = new Date();

                            const diffx = x - xi;
                            const diffy = (y - yi);

                            let sw = origWidth + diffx;
                            let sh = origHeight + diffy;

                            plate.visible_cell_aspect_ratio_min = null;
                            plate.visible_cell_aspect_ratio_max = null;

                            if (sw < 0 || sh < 0) {
                                sw = origWidth;
                                sh = origHeight;
                            } else {

                                if (sw < 10) sw = 10;
                                if (sh < 10) sh = 10;
                            }

                            const gw = (pm.plateTrack.grid.worldWidth(sw));
                            const gh = (pm.plateTrack.grid.worldHeight(sh));

                            if (plate.setWidth) {
                                plate.setWidth(gw);
                            }

                            if (plate.setHeight) {
                                plate.setHeight(gh);
                            } else {
                                plate.grid.height = gh;
                            }
                            plate.grid.yi = pm.plateTrack.grid.Ywc(y);

                            plate.grid.rescale();
                        }

                    }),

                    mouseUpListener: ((x, y) => {
                        mouse_down = false;
                        plate.last_touched = new Date();
                        plate.__resizing = false;
                        plate.resizable = false;
                        plate.__resizing = false;
                        setTimeout(() => {
                            wb(null)

                        }, 10)
                    })
                }
                wb(t)
            }

            let resize_plot = (plot, scx, scy) => {
                plot.highlight();
                plot.resizing = true;
                let xi = scx;
                let yi = scy;
                mouse_down = true;
                let origWidth = pm.plateTrack.grid.screenWidth(plot.w);
                let origHeight = pm.plateTrack.grid.screenHeight(plot.h);
                let diffx = 0
                let diffy = 0
                let t = {
                    id: 'resize_plot',
                    mouseDownListener: (async (x, y) => {
                        mouse_down = true;
                        xi = x;
                        yi = y;
                        pm.plateTrack.grid.rescale();
                        plot.grid.rescale();
                        origWidth = pm.plateTrack.grid.screenWidth(plot.w);
                        origHeight = pm.plateTrack.grid.screenHeight(plot.h);
                    }),
                    mouseMoveListener: ((x, y) => {
                        pm.plateTrack.grid.rescale()
                        if (mouse_down) {
                            diffx = x - xi;
                            diffy = y - yi;
                            plot.w = Math.abs(pm.plateTrack.grid.worldWidth((origWidth + (diffx))))
                            plot.h = Math.abs(pm.plateTrack.grid.worldHeight((origHeight + (diffy))))
                        }
                    }),
                    mouseUpListener: ((x, y) => {
                        setTimeout(() => {
                            wb(null)
                        }, 499);
                    })
                }
                wb(t)
            }

            let default_mousedownListener = async (scx, scy) => {
                AnimateGrid.INTERUPT = true;
                // A centre menu is up (the graph's, e.g. a confirmation or an object menu):
                // the press belongs to the menu and must not reach the tables beneath it.
                if (graph && typeof graph.menuVisible === 'function' && graph.menuVisible()) return;
                mouse_down = true;
                // The viewer: a press starts a pan and nothing else. Maximized, the track's
                // own handler runs the drag through time and the scroll strip; on the open
                // canvas the graph pans by itself. No selection, no buttons, no menus.
                if (__viewer) {
                    try {
                        const pt = pm.plateTrack;
                        if (pt.__maximized) { await pt.mouseDown(scx, scy); return; }
                        // The one gesture a reader has: a drag on the timeline moves through
                        // TIME (the window slides under the pointer, either way), not the
                        // canvas. Off the timeline the canvas pans as usual.
                        pt.__viewerDrag = null;
                        for (const o of (pt.m_plots || [])) {
                            if (!(pt.__tlIs && pt.__tlIs(o))) continue;
                            let hit = false;
                            try { hit = !!(o.inside && o.inside(pt.grid, scx, scy)); } catch (e) { hit = false; }
                            if (hit) { pt.__viewerDrag = (typeof pt.__tlDragStart === 'function') ? pt.__tlDragStart(o, scx, scy) : { o, lastX: scx, sx: scx, sy: scy, moved: false }; try { graph.__suppressPan = true; } catch (e) { } break; }
                        }
                    } catch (e) { }
                    return;
                }
                let mmx = pm.plateTrack.grid.Xwc(scx);
                let mmy = pm.plateTrack.grid.Ywc(scy);
                if (smenu && !smenu.isIn(pm.plateTrack.grid, mmx, mmy)) {
                    if (smenu && smenu.close)
                        smenu.close();
                    smenu = null;
                    pm.plateTrack.wb(null)
                    return; ''
                } else if (smenu) {
                    return;
                }
                if (pm.plateTrack.menu) {
                    return;
                }

                if (pm.plateTrack.isTextActive()) {
                    pm.plateTrack.setTextActive(false);
                    return;
                }
                // Mobile: a tap on a table, chart, timeline or note opens it maximized for
                // editing, and a finger drag on the open canvas pans it (flexigraph/graph.js
                // does the pan). Nothing is selected, dragged or resized under a finger; once
                // an object is maximized, taps inside it work as on the desktop.
                if (isMobile() && pm.plateTrack) {
                    __touchPx = null; __touchPy = null; __touchSy = scy; __touchSx = scx;
                    if (pm.plateTrack.mobileTap && pm.plateTrack.mobileTap(scx, scy)) return;
                    if (!pm.plateTrack.__maximized) return;
                }
                if (pm.plateTrack.__redo_stack_menu && pm.plateTrack.__redo_stack_menu.mouseUp && pm.plateTrack.__redo_stack_menu.isIn(pm.plateTrack.grid,
                    pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))) {
                    this.__redo_stack_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    return;
                }
                let plate_selected = pm.plateTrack.selectedPlate;
                if (!plate_selected) {
                    plate_selected = pm.plateTrack.onResizeLocation(scx, scy)
                } else {
                    if ((currentWorkbench === null) || (currentWorkbench && currentWorkbench.id === 'drag-navigate')) {
                        let new_selected = pm.plateTrack.getPlate(pm.plateTrack.grid.Xwc(scx), pm.plateTrack.grid.Ywc(scy))
                        // A table drawn as a solid block (rows under 10 px) is not selected by a
                        // press: the press opens its Move / Maximize menu (plate-track mouseDown).
                        if (new_selected && pm.plateTrack.__isSolidTable && pm.plateTrack.__isSolidTable(new_selected)) new_selected = null;
                        if (new_selected) {
                            pm.plateTrack.setSelected(new_selected)
                            if (pm.plateTrack.clk_drag)
                                pm.plateTrack.clk_drag(pm.plateTrack)
                        }
                    }

                }
                if (!smenu && pm.plateTrack) {
                    await pm.plateTrack.mouseDown(scx, scy)
                }
                if (pm.plateTrack && pm.plateTrack.menu) {
                    return;
                }
                if (pm.plateTrack && pm.plateTrack.isInAnyMenu) {
                    if (pm.plateTrack.isInAnyMenu(scx, scy))
                        return;
                }
                if (mouseDownListener) {
                    mouseDownListener(scx, scy)
                }
                if (plate_selected && plate_selected.inButtons) {
                    if (plate_selected.inButtons(scx, scy, pm.plateTrack)) {
                        return;
                    }
                }
                if (!isMobile()) {
                    if (plate_selected && plate_selected.inResize && plate_selected.inResize(scx, scy, pm.plateTrack)) {
                        if (plate_selected && plate_selected.typeof && plate_selected.typeof === 'plot') {
                            return resize_plot(plate_selected, scx, scy)
                        } else {
                            return resize_plate(plate_selected, scx, scy);
                        }
                    }
                    if (plate_selected && plate_selected.onRightEdge && plate_selected.onRightEdge(scx, scy, pm.plateTrack)) {
                        return resize_plate_width(plate_selected, scx, scy);

                    }
                }
                mouse_down = true;
            }

            let default_mouseUpListener = async (scx, scy) => {
                px = 0;
                py = 0;
                mouse_down = false;
                if (__viewer) {
                    __touchPx = null; __touchPy = null; __touchSy = null;
                    try {
                        const pt = pm.plateTrack;
                        if (pt.__viewerDrag) { pt.__viewerDrag = null; try { graph.__suppressPan = false; } catch (e) { } }
                        if (pt.__maximized) pt.mouseUp(scx, scy);
                    } catch (e) { }
                    return;
                }
                // The release that picks a menu item stays with the menu (the graph resolves
                // it); the tables underneath never see it.
                if (graph && typeof graph.menuVisible === 'function' && graph.menuVisible()) { __touchPx = null; __touchPy = null; __touchSy = null; return; }
                // Mobile, nothing maximized and no menu open: the release ends a pan, nothing more.
                __touchPx = null; __touchPy = null; __touchSy = null;
                if (isMobile() && pm.plateTrack && !pm.plateTrack.menu && !pm.plateTrack.__maximized) return;
                if (!smenu && pm.plateTrack) {
                    pm.plateTrack.mouseUp(scx, scy)
                }
                if (pm.plateTrack && pm.plateTrack.menu) {
                    pm.plateTrack.mouseUp(scx, scy)
                    return;
                }
                if (pm.plateTrack && pm.plateTrack.isInAnyMenu) {
                    if (pm.plateTrack.isInAnyMenu(scx, scy))
                        return;
                }
                let plate_selected = pm.plateTrack.selectedPlate;
                if (plate_selected && plate_selected.__resizing) {
                    plate_selected.__resizing = false;
                }
                mouse_down = false;
                if (mouseUpListener && !pm.plateTrack.IsInTableMenu(scx, scy)) {
                    await mouseUpListener(scx, scy)
                }
            }

            let getPlate = (x, y) => {
                return pm.plateTrack.getPlate(x, y)
            }

            let getObject = (scx, scy) => {
                let mmx = scx;
                let mmy = scy;

                let p = getPlate(mmx, mmy);
                if (p != null) {
                    return p;
                }
                for (let connection of pm.plateTrack.connections) {
                    if (connection.isOnCircle((scx), (scy), pm.plateTrack.grid)) {
                        if (connection != null) {
                            return connection;
                        }
                    } else if (connection.isOnTriangle(scx, scy, pm.plateTrack.grid)) {
                        if (connection != null) {
                            return connection;
                        }
                    }
                }
                let l = getPlot(mmx, mmy)
                if (l != null) {
                    return l;

                }
                return null;
            }

            let default_keydownListener = async (event) => {
                if (__viewer) return;
                // View only: keys navigate at most; nothing types, deletes or pastes.
                if (pm.plateTrack && pm.plateTrack.__readOnly) {
                    const k = event && event.key;
                    if (!(k === 'Escape' || (k && k.startsWith('Arrow')) || k === 'Home' || k === 'End' || k === 'PageUp' || k === 'PageDown')) { try { event.preventDefault(); } catch (e) { } }
                    return;
                }
                if (pm.plateTrack.isGlyphSelected()) {
                    return;
                }
                if (currentWorkbench && currentWorkbench.keydown) {
                    return currentWorkbench.keydown(event)
                }
                let plate_selected = pm.plateTrack.selectedPlate;
                if (plate_selected && plate_selected.handleKeyDown) {
                }
            }

            let default_mousemoveListener = async (scx, scy) => {
                if (__viewer) {
                    try {
                        const pt = pm.plateTrack;
                        const d = pt.__viewerDrag;
                        if (d && mouse_down) {
                            if (typeof pt.__tlDragMove === 'function') pt.__tlDragMove(d, scx, scy);
                            else { const dx = scx - d.lastX; d.lastX = scx; if (dx) pt.__tlPanPx(d.o, dx); }
                            return;
                        }
                        if (pt.__maximized) pt.mouseMove(scx, scy);
                    } catch (e) { }
                    return;
                }
                if (pm.plateTrack.isTextActive()) {
                    return null
                }
                if (graph && typeof graph.menuVisible === 'function' && graph.menuVisible()) return null;   // the menu tracks the pointer, not the table
                // Mobile: a moving finger pans the canvas, or scrolls the maximized object; it
                // never drags a table, resizes a chart or extends a cell selection. The pan is
                // done HERE on the plate-track grid: the graph's own touch pan moves a grid
                // Analytics does not draw with, which is why a finger drag showed nothing.
                if (isMobile() && pm.plateTrack && !pm.plateTrack.menu) {
                    const pt = pm.plateTrack;
                    if (mouse_down && !smenu) {
                        // A milestone picked up by a held press: the finger moves IT, not the
                        // view. A hold still pending: the track sees the move, and cancels the
                        // hold if the finger has travelled; the pan then continues below.
                        if (pt.__msDrag) { try { pt.mouseMove(scx, scy); } catch (e) { } __touchSy = scy; __touchSx = scx; return null; }
                        if (pt.__msHold) { try { pt.mouseMove(scx, scy); } catch (e) { } }
                        if (pt.__maximized) {
                            if (pt.__maxDrag) { try { pt.mouseMove(scx, scy); } catch (e) { } }   // the chart/timeline itself is being moved
                            else if (__touchSy != null) {
                                try { pt.__maxScroll(__touchSy - scy); } catch (e) { }
                                try { if (__touchSx != null) pt.__maxScrollX(__touchSx - scx); } catch (e) { }   // a wide table also scrolls sideways
                            }
                            __touchSy = scy; __touchSx = scx;
                        } else {
                            const g = pt.grid;
                            if (__touchPx == null) { __touchPx = g.Xwc(scx); __touchPy = g.Ywc(scy); }
                            else {
                                const xd = __touchPx - g.Xwc(scx), yd = __touchPy - g.Ywc(scy);
                                g.setxmin(g.getxmin() + xd); g.setxmax(g.getxmax() + xd);
                                g.setymin(g.getymin() + yd); g.setymax(g.getymax() + yd);
                                g.rescale();
                            }
                        }
                    }
                    return null;
                }

                current_mousex = scx;
                current_mousey = scy;
                pm.plateTrack.__menu__ = smenu;
                if (pm.plateTrack) {
                    pm.plateTrack.mouseMove(scx, scy)
                    if (pm.plateTrack.isDraggingScrollbar) {
                        return;
                    }
                    if (pm.plateTrack && pm.plateTrack.selectedPlate && pm.plateTrack.selectedPlate.viewWell) {
                        pm.plateTrack.selectedPlate.viewWell(scx, scy, pm.plateTrack)
                    }
                }
                if (pm.plateTrack && pm.plateTrack.isInAnyMenu) {
                    if (pm.plateTrack.isInAnyMenu(scx, scy))
                        return;
                }

                if (currentWorkbench && currentWorkbench.mouseMoveListener) {
                    return currentWorkbench.mouseMoveListener(scx, scy)
                }
            }

            let getPlot = (scx, scy) => {
                let pt = pm.plateTrack;

                for (let plot of pt.m_plots) {
                    if (plot._highlight === true && plot.inside(pt.grid, scx, scy)) {
                        return plot;
                    }
                }

                for (let plot of pt.m_plots) {
                    if (plot._highlight !== true && plot.inside(pt.grid, scx, scy)) {
                        return plot;
                    }
                }

                return null;
            };

            let drawPlateTracks = (ctx) => {
                if (pm.plateTrack && !pm.plateTrack.wb) {
                    pm.plateTrack.setWorkbench(wb);
                }

                if (config && config.mode)
                    pm.plateTrack.mode = config.mode;

                if (ctx != null) {
                    pm.plateTrack.draw(ctx);

                    if (draw) {
                        draw(pm.plateTrack.grid, ctx);
                    }
                    if (currentShape && currentShape.draw != null) {
                        currentShape.draw(pm.plateTrack.grid, ctx)
                    }
                    if (ctx && smenu && pm.plateTrack != null) {
                        ctx.fillStyle = 'rgba(255,255,255,0.83)'
                        ctx.fillRect(pm.plateTrack.grid.xi, pm.plateTrack.grid.yi, pm.plateTrack.grid.width, pm.plateTrack.grid.height)
                        smenu.draw(ctx, pm.plateTrack.grid)
                    }
                }
            }
            graph.post_graphics_modifications = drawPlateTracks;

            __track(window, 'dragover', (event) => {
                event.preventDefault();
            })
            __track(window, 'drop', async (event) => {
                event.preventDefault();

                function parseExcelFile(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            try {
                                const data = new Uint8Array(e.target.result);
                                const workbook = XLSX.read(data, { type: 'array' });

                                const tables = {};

                                workbook.SheetNames.forEach(sheetName => {
                                    const worksheet = workbook.Sheets[sheetName];

                                    const table = [];

                                    const range = XLSX.utils.decode_range(worksheet['!ref']);
                                    for (let rowNum = range.s.r; rowNum <= range.e.r; rowNum++) {
                                        const row = [];

                                        for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
                                            const cellAddress = XLSX.utils.encode_cell({ r: rowNum, c: colNum });
                                            const cell = worksheet[cellAddress];

                                            if (cell) {
                                                const cellData = {
                                                    value: cell.v || "",
                                                    formula: cell.f || ""
                                                };
                                                row.push(cellData);
                                            } else {
                                                row.push({ value: "", formula: "" });
                                            }
                                        }
                                        table.push(row);
                                    }

                                    tables[sheetName] = table;
                                });

                                resolve(tables);
                            } catch (error) {
                                reject(`Error parsing Excel file: ${error.message}`);
                            }
                        };

                        reader.onerror = function (error) {
                            reject(`File read error: ${error}`);
                        };

                        reader.readAsArrayBuffer(file);
                    });
                }

                const file = event.dataTransfer.files[0];
                if (file && file.name.endsWith('.xlsx')) {

                    const reader = new FileReader();

                    reader.onload = async function (e) {
                        try {

                            const data = new Uint8Array(e.target.result);
                            const workbook = XLSX.read(data, { type: 'array' });
                            const plates = [];
                            workbook.SheetNames.forEach(sheetName => {
                                const worksheet = workbook.Sheets[sheetName];
                                const table = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                                let xmax = 0;
                                let ymax = 0;

                                table.forEach((row, rowIndex) => {
                                    const nonEmptyCols = row.filter(cell => cell !== null && cell !== "").length;
                                    if (nonEmptyCols > 0) {
                                        xmax = Math.max(xmax, rowIndex + 1);
                                        ymax = Math.max(ymax, nonEmptyCols);
                                    }
                                });

                                const trimmedTable = table.slice(0, xmax).map(row => row.slice(0, ymax));

                                const wells = trimmedTable.map((row, rowIndex) => {
                                    return row.map((cellValue, colIndex) => {
                                        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
                                        const cell = worksheet[cellAddress] || {};
                                        const well = new GenericWell(
                                            `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`,
                                            cell.v || cellValue,
                                            null,
                                            null
                                        );
                                        well.properties = {
                                            value: cell.v || cellValue || null,
                                            formula: cell.f || null,
                                            type: cell.t || null,
                                            raw: cell.w || null
                                        };
                                        return well;
                                    });
                                });

                                const plate = new Plate(sheetName, xmax, ymax);
                                plate.setWells(wells);
                                plates.push(plate);
                            });

                            let index = 1;
                            let prev = null;
                            for (let t of plates) {
                                if (prev != null) {

                                }
                                pm.plateTrack.appendPlate(t);
                                pm.plateTrack.wb(null)
                                prev = t;
                                index++;
                            }
                            pm.plateTrack.zoomtfit()
                            pm.plateTrack.wb(null)

                        } catch (error) {
                            alert(`Error parsing Excel file: ${error.message}`);
                        }
                    };

                    reader.readAsArrayBuffer(file);

                }
                else
                    if (file && file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = function (e) {
                            const img = new Image();
                            img.onload = async () => {
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);



                            };
                            img.src = e.target.result;
                        };

                        reader.readAsDataURL(file);
                    } else {

                    }
            })




            __track(window, 'keydown', async (event) => {
                if (pm.plateTrack && pm.plateTrack.__readOnly) return;   // view only
                // Keys typed into the mobile cell field belong to it alone.
                if (event && event.target && event.target.id === 'baja-mobile-cell-input') return;
                if (pm.plateTrack.isTextActive()) {
                    if (event.key === 'Escape') {
                        pm.plateTrack.setTextActive(false)
                        return;
                    }
                    return pm.plateTrack.handleKeyDown(event)
                }
                if (pm.plateTrack && pm.plateTrack.handleKeyDown) {
                    return pm.plateTrack.handleKeyDown(event)
                }

                function arrayToExcelString(wells) {

                    const maxLength = Math.max(...wells.map(col => col.length));
                    wells.forEach(col => {
                        while (col.length < maxLength) {
                            col.push({ value: "" });
                        }
                    });
                    const trimmedWells = wells.filter(col => col.some(cell => cell.value !== "" && cell.value !== null && cell.value !== undefined));
                    const transposed = trimmedWells[0].map((_, rowIndex) => trimmedWells.map(col => col[rowIndex] || { value: "" }));
                    return transposed.map(row =>
                        row.map(cell => {

                            let cellText = String(cell.value).replace(/"/g, '""');

                            if (/[",\n\t]/.test(cellText)) {
                                cellText = `"${cellText}"`;
                            }
                            return cellText;
                        }).join('\t')
                    ).join('\n');
                }
                if (event.ctrlKey && event.key === 'c') {
                    console.log('Control + C was pressed');
                    event.preventDefault();
                    if (pm.plateTrack) {
                        let se = pm.plateTrack.getSelectedWells()

                        let v = arrayToExcelString(se)
                        pm.plateTrack.setMessage("Copy")
                        LJScript.add(pm.plateTrack.name, `copy canvas`)

                        navigator.clipboard.writeText(v).then(() => {
                            console.log("Object copied to clipboard!");
                        }).catch(err => {
                            console.error("Failed to copy object to clipboard: ", err);
                        });
                    }
                } else
                    if (event.ctrlKey && event.key === 'x') {
                        console.log('Control + C was pressed');
                        event.preventDefault();
                        if (pm.plateTrack) {
                            let se = await pm.plateTrack.getSelectedWellsInOrder()
                            pm.plateTrack.setMessage("Copied")
                            navigator.clipboard.writeText(JSON.stringify(se)).then(() => {
                                console.log("Object copied to clipboard!");
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                        }
                    } else
                        if (event.key === 'Delete') {

                        } else
                            if (event.key === 'Escape') {
                                // Escape DESELECTS the cells (it used to clear their values,
                                // which is Delete's job). The plate track does the deselection.
                                event.preventDefault();
                                if (pm.plateTrack && pm.plateTrack.selectedPlate) {
                                    try { pm.plateTrack.selectedPlate.textActive = false; } catch (e) { }
                                    try { pm.plateTrack.selectedPlate.deselectAll(); } catch (e) { }
                                    pm.plateTrack.selected_well = null;
                                }
                            }
            });

            const loadImageToCanvas = async (image) => {
                let b64 = await getBase64Image(image.src);
                image.src = b64;
                let xw = pm.plateTrack.grid.Xwc(100)
                let yw = pm.plateTrack.grid.Ywc(100)
                let ic = new Icon('base64', image, xw, yw, pm.plateTrack.grid.worldWidth(image.width), pm.plateTrack.grid.worldHeight(image.height));
                ic.b64 = b64;
                loaded = true;

                let plate = new Plate(generateNautName(), 1, 1);
                plate.plateType = 'annotation'
                plate.completeNullValues();
                plate.setWellType(0, 0, 'ICON')
                plate.wells[0][0].icon = ic;
                plate.attr__displayMenuButtons = true;
                plate.grid.width = pm.plateTrack.grid.worldWidth(image.width);
                plate.grid.height = pm.plateTrack.grid.worldHeight(image.height);
                pm.plateTrack.addNextAvailableX(plate)

                image.onload = () => {
                    pm.plateTrack.setMessage(" Image added ")
                }
            }

            __track(window, 'paste', async (e) => {
                if (pm.plateTrack && pm.plateTrack.__readOnly) return;   // view only
                if (e.localName && e.localName.indexOf('text') >= 0) {
                    return;
                }
                if (e.target && e.target.localName.toString().indexOf('text') >= 0) {
                    return;
                }
                if (e.target && e.target.localName.toString().indexOf('input') >= 0) {
                    return;
                }

                if (eeditor_state.paste_to_graph) {
                    if (e.clipboardData == false) return false;
                    const items = e.clipboardData.items;

                    function isLikelySvg(str) {
                        if (typeof str !== 'string') return false;
                        const trimmed = str.trim();
                        if (!trimmed.startsWith('<')) return false;
                        return /^<svg[\s>]/i.test(trimmed) ||
                            /^<\?xml[^>]*>\s*<svg[\s>]/i.test(trimmed);
                    }

                    for (let i = 0; i < items.length; i++) {
                        let item = items[i];
                        if (item.type === 'text/plain') {
                            try {
                                item.getAsString(async (text) => {
                                    try {


                                        text = text.trim()

                                        if (
                                            (text.startsWith('"') && text.endsWith('"')) ||
                                            (text.startsWith("'") && text.endsWith("'"))
                                        ) {
                                            text = text.slice(1, -1).trim();
                                        }
                                        text = text.trim();
                                        debugger;


                                        if (isLikelySmiles(text)) {
                                            try {
                                                // Pass the SMILES string into your Ion Works / RDKit script
                                                // Replace this path with the actual script path you saved
                                                const result = await exec('py/baja/templates/smiles_to_2d_svg.py', text);
                                                if (result && result.ok && result.svg) {
                                                    console.log('Detected SMILES:', result.input_smiles || text);
                                                    console.log('Canonical SMILES:', result.canonical_smiles || '');
                                                    console.log('Molfile:', result.molfile || '');
                                                    console.log('SVG:', result.svg);
                                                    alert(' hello ')
                                                    return;
                                                } else {
                                                    console.warn('SMILES parse failed:', result?.error || 'unknown error');
                                                }
                                            } catch (smilesErr) {
                                                console.error('Failed to process SMILES:', smilesErr);
                                            }
                                            return;
                                        }





                                        if (isLikelySvg(text)) {
                                            try {
                                                let Shape = await exec('flexigraph/shapes/shape.js')
                                                const Glyph = await exec('baja/draw/glyph.js');

                                                const shape = Shape.fromSvgString(text);
                                                const primitives = Shape.breakComposite(composite);
                                                for (let p of primitives) {
                                                    const glyph = new Glyph(p);
                                                    pm.plateTrack.addGlyph(glyph);
                                                }

                                                return;
                                            } catch (svgErr) {
                                                console.error('Failed to import SVG as Glyph:', svgErr);

                                            }
                                        }

                                        function isLikelyPythonScript(code) {
                                            if (typeof code !== 'string' || code.trim() === '') return false;
                                            const pythonKeywords = [
                                                'def ', 'class ', 'import ', 'from ', 'return', 'if ', 'elif ', 'else:',
                                                'for ', 'while ', 'try:', 'except', 'with ', 'as ', 'print(', 'lambda'
                                            ];
                                            const hasKeyword = pythonKeywords.some(kw => code.includes(kw));
                                            const lines = code.split('\n');
                                            const colonLine = lines.some(line => line.trim().endsWith(':'));
                                            const indentedLine = lines.some(line => line.startsWith('    '));
                                            return hasKeyword && colonLine && indentedLine;
                                        }

                                        function replaceMainWithParams(pyCode) {
                                            const mainRegex = /def\s+main\s*\(([^)]*)\)\s*:/;
                                            const match = pyCode.match(mainRegex);

                                            if (!match) {
                                                return pyCode;
                                            }

                                            const params = match[1]
                                                .split(',')
                                                .map(p => p.trim())
                                                .filter(p => p.length > 0);

                                            const paramLines = ['from ion import works'];
                                            params.forEach((param, idx) => {
                                                paramLines.push(`${param} = works.param(${idx + 1})`);
                                            });

                                            const lines = pyCode.split('\n');
                                            const newLines = [];
                                            const mainBodyLines = [];
                                            const importLines = [];

                                            let inMain = false;
                                            let mainIndent = null;
                                            let inIfMain = false;

                                            for (let i = 0; i < lines.length; i++) {
                                                const line = lines[i];

                                                if (/^\s*import\s+|^\s*from\s+\w+/.test(line)) {
                                                    importLines.push(line);
                                                    continue;
                                                }

                                                if (!inMain && mainRegex.test(line)) {
                                                    inMain = true;
                                                    mainIndent = line.match(/^(\s*)/)[1];
                                                    continue;
                                                }

                                                if (inMain) {
                                                    const indentMatch = line.match(/^(\s*)/);
                                                    const currentIndent = indentMatch ? indentMatch[1] : '';

                                                    if (line.trim() === '' || currentIndent.length > mainIndent.length) {
                                                        mainBodyLines.push(line.slice(mainIndent.length));
                                                        continue;
                                                    } else {
                                                        inMain = false;
                                                        i--;
                                                        continue;
                                                    }
                                                }

                                                if (/if\s+__name__\s*==\s*["']__main__["']\s*:/.test(line)) {
                                                    inIfMain = true;
                                                    continue;
                                                }

                                                if (inIfMain) {
                                                    if (/^\s+/.test(line)) continue;
                                                    inIfMain = false;
                                                }

                                                newLines.push(line);
                                            }

                                            let lastVar = null;
                                            for (let i = mainBodyLines.length - 1; i >= 0; i--) {
                                                const line = mainBodyLines[i].trim();
                                                if (/^\w+\s*=/.test(line)) {
                                                    lastVar = line.split('=')[0].trim();
                                                    break;
                                                }
                                            }

                                            if (lastVar) {
                                                mainBodyLines.push(`works.resolve(${lastVar})`);
                                            }

                                            return [
                                                ...importLines,
                                                '',
                                                ...paramLines,
                                                '',
                                                ...mainBodyLines,
                                                '',
                                                ...newLines
                                            ].join('\n');
                                        }

                                        function isStructuredDataStrifacng(input) {
                                            if (/^\s*\w+\s*=\s*{/.test(input)) {
                                                return true;
                                            }
                                            else
                                                return false;
                                        }

                                        if (isStructuredDataStrifacng(text)) {
                                            return await exec('baja/plate/data/import-python-table-structure-data.js', text, pm.plateTrack, genegraph_panel_layout)
                                        } else if (isLikelyPythonScript(text)) {
                                            text = replaceMainWithParams(text)

                                            let namev = await prompt("Script name: ", ["Name"], { "Name": '' }, 500, 300)
                                            let name = namev['Name']
                                            if (!name.endsWith('.py')) {
                                                name = name + '.py'
                                            }
                                            let host_ = window['env']['apiUrl']
                                            let jsonobj = {
                                                "name": name,
                                                "key": "wd",
                                                "spath": 'py/baja/templates',
                                                "value": text,
                                                "user": getUser()
                                            }
                                            let rs = await POSTJSON(jsonobj, host_ + '/save-script');
                                            if (rs['status']) {
                                                infoPrompt(rs['status'])
                                            }
                                            return;
                                        }

                                        const parsed = JSON.parse(text);
                                        if (parsed) {

                                            function parsePlotObject(jsonString) {
                                                try {

                                                    const obj = JSON.parse(jsonString);
                                                    if (
                                                        obj.name && typeof obj.name === 'string' &&
                                                        obj.startDate && !isNaN(Date.parse(obj.startDate)) &&
                                                        obj.endDate && !isNaN(Date.parse(obj.endDate)) &&
                                                        obj.scatterData && Array.isArray(obj.scatterData.points) &&
                                                        obj.config_script && obj.config_script.plot &&
                                                        obj.grid && obj.grid.xmin !== undefined &&
                                                        obj.grid.xmax !== undefined &&
                                                        obj.grid.ymin !== undefined &&
                                                        obj.grid.ymax !== undefined
                                                    ) {
                                                        return Plot.fromJSON(jsonString)
                                                    } else {
                                                        throw new Error("Invalid plot object structure");
                                                    }
                                                } catch (error) {

                                                    console.error("Error parsing JSON or invalid structure:", error);
                                                    return null;
                                                }
                                            }

                                            let Plot = await exec('flexigraph/plot')
                                            if (parsed.type === 'timeline') {
                                                let plt = Plot.fromJSON(parsed)
                                                pm.plateTrack.grid.rescale();
                                                plt.grid.xi = pm.plateTrack.grid.Xwc(0);
                                                plt.grid.yi = pm.plateTrack.grid.Ywc(0);

                                                pm.plateTrack.m_plots.push(plt)
                                                setTimeout(() => {

                                                }, 1000)
                                                return;
                                            }
                                            if (parsed.objectType && parsed.objectType === 'array_of_objects') {
                                                let lastep = null;
                                                for (let obj of parsed.objects) {
                                                    if (obj.plateType && obj.wells) {
                                                        const pw = Plate.buildPlateFromJSON(obj);
                                                        pm.plateTrack.root.push(pw)
                                                        lastep = pw;
                                                    }
                                                }
                                                pm.plateTrack.generateTables();
                                                if (lastep) {
                                                    setTimeout(() => {
                                                        pm.plateTrack.zoomintoplate(lastep)
                                                    }, 1000);
                                                }
                                                return;

                                            } else if (parsed.plateType && parsed.wells) {
                                                const pw = Plate.buildPlateFromJSON(parsed);
                                                pm.plateTrack.addNextAvailableX(pw)
                                                setTimeout(() => {
                                                    pm.plateTrack.zoomintoplate(pw)
                                                }, 1000);
                                                return;
                                            } else if (parsed.plateType && parsed.plateType === 'package') {
                                                const pl = Plate.buildPlateFromJSON(parsed)
                                                pm.plateTrack.addNextAvailableX(pl)
                                                setTimeout(() => {
                                                    pm.plateTrack.zoomintoplate(pl)
                                                }, 1000)

                                            } else if (parsed.plate_track) {
                                                let confirm = await exec('baja/lib/confirm.js', 'Copy formula into the canvas.  This could overwrite some existing formulas', async () => {
                                                    pm.plateTrack.copyFromJSON(parsed.plate_track)
                                                })
                                                await showModal(confirm)
                                                return;
                                            } else {
                                                await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                                            }
                                        }
                                    } catch (exception_e) {
                                        await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                                    }

                                });
                            } catch (exception) {
                                console.log(" exception meessage " + exception.message)
                            }

                            return;

                        } else if (item.kind === 'file' && item.type === 'text/plain') {
                            const blob = item.getAsFile();
                            const reader = new FileReader();
                            reader.onload = async (e) => {
                                const text = e.target.result;

                                if (isLikelySvg(text)) {
                                    try {
                                        let Shape = await exec('flexigraph/shapes/shape.js')
                                        const Glyph = await exec('baja/draw/glyph.js');
                                        const shape = Shape.fromSvgString(text);
                                        const glyph = new Glyph(shape);
                                        pm.plateTrack.addGlyph(glyph);

                                        return;
                                    } catch (svgErr) {
                                        console.error('Failed to import SVG file as Glyph:', svgErr);

                                    }
                                }

                                await exec('baja/plate/data/import-data.js', text, pm.plateTrack, genegraph_panel_layout)
                            };
                            reader.readAsText(blob);
                            return;

                        } else if (item.kind === 'file' && item.type === 'image/png') {

                            if (items[0] && items[0].type === 'text/plain') {
                                return;
                            }

                            const file = item.getAsFile();
                            const img = new Image();
                            img.onload = () => loadImageToCanvas(img);
                            img.src = URL.createObjectURL(file);

                        } else if (item.type.startsWith('image/') && items.length === 1) {

                            const file = item.getAsFile();
                            const img = new Image();
                            img.onload = () => loadImageToCanvas(img);
                            img.src = URL.createObjectURL(file);

                        }
                    }
                }
            });

            graph.addMouseListener((x, y) => {
                io.print(x + ',' + y)
            });
            graph.addListener((_tracks) => {
                tracks = _tracks;

                let index = 0;
                let s = 0;
                let f = 10000;
                for (let t of tracks) {
                    if (index === 0) {
                        s = t.xi;
                        f = t.xf;
                    }
                    if (s > t.xi) {
                        s = t.xi;
                    }
                    if (f < t.xf) {
                        f = t.xf
                    }
                }

            });

            let add = (str) => {
                if (str.startsWith('>')) {
                    graph.fasta(str.trim());
                }
                else {
                    graph.add(str)
                }
            }
            let zoom = (xi, xf) => {
                graph.zoom(xi, xf)
            }

            let priority = false;

            const default_touchStart = (x, y) => {

            }
            const default_touchEnd = (x, y) => {

            }
            const default_touchMove = (x, y) => {

            }

            let mdel = {
                'mouseUp': default_mouseUpListener,
                'mouseDown': default_mousedownListener,
                'mouseMove': default_mousemoveListener,
                'keyDown': default_keydownListener,
                'touchstart': default_touchStart,
                'touchend': default_touchEnd,
                'touchmove': default_touchMove,

                'wheel': default_wheel,
                'getPriority': () => {
                    return priority;
                }
            }
            let geneGraph = await graph.createComponent(mdel);

            let plates_panel;
            progressBar(50);
            function truncateString(str) {
                const maxLength = 50;
                if (str.length > maxLength) {
                    return str.slice(0, maxLength) + "...";
                }
                return str;
            }
            let updateStatsPanel = () => {
                if (graph) {
                    let ht = ' '
                    let index = 0;
                    let sum = 0;
                    if (graph && graph.track && graph.track.length > 0) {
                        for (let t of graph.track) {
                            ht += `Track${index}:  <font color="blue">${t.oligos.length}</font> <br>`
                            index++;
                            sum += t.oligos.length;
                        }
                    }
                    ht += ''

                    let plates = Math.ceil(sum / 78)
                    ht += `Plates: <font color="blue">${plates} </font>`
                    if (plates_panel) {
                        plates_panel.setHTML(truncateString(ht));
                    }

                }
            }
            let select_display = createIonFunction((ref) => {
                select_display_html = ref;
            })
            let molecule_type_html_render = await exec('baja/manchester/render-moltype.js')
            let display = {
                wid: 'html',
                refCallback: select_display,
                data: {
                    ionFunction: createIonFunction(() => {
                        return ` Selected chemistry template: ` +
                            molecule_type_html_render(graph.props.selected_chemistry)
                    })
                }
            }

            progressBar(55);

            let htmlT = ''
            if (htmlT) {
                htmlT = JSON.stringify(htmlT)
            } else {
                htmlT = ''
            }

            let buttonMenuPanel = {}

            const MSGraph = await exec('lib/msgraph.js')

            if (isMobile()) {
                button_canvas = await exec('manchester/controls/navigation-panel-plates-mobile.js', pm)
            } else {
                button_canvas = await exec('manchester/controls/navigation-panel-plates.js', pm)
            }
            // Build and Draw menus, shared with the navigation panel so they sit on the
            // Analytics menubar next to Share (the top_menubar below is not mounted).
            // The Build items are filled in further down; Draw mirrors cpd/editor.
            let ai_create_file_items = []
            const drawMenu =
            {
                label: 'Draw',
                items: [

                    {
                        label: 'Timeline', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/timeline', pm)

                            graph.setMessageCenter('Click and drag to place it', 40)

                        })
                    },
                    {
                        label: 'Table', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/table-selection-list', pm)
                            graph.setMessageCenter('Click and drag to place it', 40)

                        })
                    },

                    {
                        label: 'Document', ionfunction: createIonFunction(async () => {
                            // Prose on the canvas: a method, a caveat, the reasoning behind a
                            // number. With a document selected this edits that one instead.
                            await exec('baja/draw/draw-document.js', pm.plateTrack)
                        })
                    },
                    {
                        label: 'Rename Document', ionfunction: createIonFunction(async () => {
                            // The name on the card and in the lists; the text is not touched.
                            await exec('baja/draw/rename-document.js', pm.plateTrack)
                        })
                    },
                    {
                        label: 'Delete Document', ionfunction: createIonFunction(async () => {
                            // The selected document, or one chosen from a list; confirmed either way.
                            await exec('baja/draw/delete-document.js', pm.plateTrack)
                        })
                    },
                    {
                        label: 'Postit Note', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/draw-postit.js', pm.plateTrack)

                            graph.setMessageCenter('Click where the note should go', 40)

                        })
                    },
                    {
                        label: 'Simple Arrow', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/draw-arrow.js', pm.plateTrack)
                            graph.setMessageCenter('Click and drag to draw the arrow', 40)

                        })
                    },
                    {
                        label: 'Notebook', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/draw-simple-note.js', pm.plateTrack)
                            graph.setMessageCenter('Click where the note should go', 40)

                        })
                    },
                    {
                        label: 'Arrow Note (left)', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'left')
                            graph.setMessageCenter('Click where the note should go', 40)

                        })
                    },
                    {
                        label: 'Arrow Note (right)', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'right')
                            graph.setMessageCenter('Click where the note should go', 40)

                        })
                    },
                    {
                        label: 'Arrow Note (Up)', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'up')
                            graph.setMessageCenter('Click where the note should go', 40)

                        })
                    },
                    {
                        label: 'Arrow Note (Down)', ionfunction: createIonFunction(async () => {
                            await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'down')
                            graph.setMessageCenter('Click where the note should go', 40)

                        })
                    },
                ]
            }
            // The Build library: the builders grouped by what they make, each group a
            // flyout, instead of one long flat list. An item whose label is not in the map
            // lands under "More", so a new builder is never lost.
            const BUILD_GROUPS = [
                ['Timelines', ['Historical Milestones', 'Scientific Publications Timeline', 'Gantt Chart']],
                ['Financial models', ['P&L With Capital', 'Project', 'Milestone Budget', 'Product Assumptions', 'Budget Assumptions']],
                ['Analysis', ['\u0394\u0394Ct analysis', 'Build Analytics', 'Draw connections']],
                ['Oligo & molecule design', ['Molecule', 'siRNA', 'ssASO', 'ssASO - Chirality', 'Morpholino', 'SMILEs']],
                ['Figures', ['SVG', 'High res SVG', 'Molecular mechanism', 'Draw genetic pathways']],
                ['Templates', ['Templates']],
            ];
            // The menubar keeps the ARRAYS it is given and reads them when a menu opens, and
            // the first menubar is built before the builders below are pushed. So the groups
            // are fixed objects whose item arrays are filled IN PLACE (never replaced): the
            // menubar's references stay live, and refreshBuildLibrary() can run again after
            // every push without anything going stale or empty.
            const buildLibraryLive = BUILD_GROUPS.map(([title]) => ({ label: title, items: [] })).concat([{ label: 'More', items: [] }]);
            // The top-level list the menubar holds: ONE array, refilled in place with the
            // groups that have items (a filtered copy would leave the menubar holding the
            // first, empty, copy for ever -- which is what made Build show nothing).
            const buildTop = [];
            const refreshBuildLibrary = () => {
                const src = Array.isArray(ai_create_file_items) ? ai_create_file_items : [];
                const labelOf = (it) => ('' + ((it && (it.label || it['label'])) || '')).trim();
                const used = new Set();
                for (const g of buildLibraryLive) g.items.length = 0;
                BUILD_GROUPS.forEach(([title, labels], gi) => {
                    for (const l of labels) {
                        const it = src.find(x => labelOf(x) === l && !used.has(x));
                        if (it) { buildLibraryLive[gi].items.push(it); used.add(it); }
                    }
                });
                const more = buildLibraryLive[buildLibraryLive.length - 1];
                for (const x of src) if (!used.has(x)) more.items.push(x);
                buildTop.length = 0;
                for (const g of buildLibraryLive) if (g.items.length) buildTop.push(g);
                return buildTop;
            };
            // Selection tools on the menubar: icon buttons (a leaf item with an icon and no
            // label renders as an icon button). Each arms one gesture on the workbench.
            // Zoom while something is maximized: a maximized TIMELINE zooms its time window
            // about its centre (the same helper the pinch uses; a factor under 1 zooms in).
            // Any other maximized object pins the view, so the buttons say so.
            const maximizedZoom = (factor) => {
                const pt = pm.plateTrack;
                const o = pt.__maximized;
                try {
                    if (pt.__tlIs && pt.__tlIs(o)) {
                        const box = pt.__maxScreenBox ? pt.__maxScreenBox() : null;
                        const cx = box ? box.x + box.w / 2 : pt.grid.width / 2;
                        pt.__tlZoomAt(o, factor, cx);
                        return;
                    }
                } catch (e) { console.warn('timeline zoom', e); }
                pt.setMessage('Exit maximize to zoom the canvas.', 2);
            };
            const selectTools = [
                // Zoom: the same steps as the Draw menu's Zoom in / Zoom out. A maximized
                // timeline zooms through time instead (maximizedZoom above).
                {
                    icon: 'zoom_in', color: '#ffffff', tooltip: 'Zoom in',
                    ionfunction: createIonFunction(async () => {
                        try {
                            if (pm.plateTrack && pm.plateTrack.__maximized) { maximizedZoom(1 / 1.25); return; }
                            pm.plateTrack.wb(null); await zoomStep(1.25);
                        } catch (e) { console.warn(e); }
                    })
                },
                {
                    icon: 'zoom_out', color: '#ffffff', tooltip: 'Zoom out',
                    ionfunction: createIonFunction(async () => {
                        try {
                            if (pm.plateTrack && pm.plateTrack.__maximized) { maximizedZoom(1.25); return; }
                            pm.plateTrack.wb(null); await zoomStep(1 / 1.25);
                        } catch (e) { console.warn(e); }
                    })
                },
                {
                    icon: 'gesture', color: '#ffffff', tooltip: 'Lasso select: draw around points, tables and notes',
                    ionfunction: createIonFunction(() => { try { pm.plateTrack.startSelectGesture('lasso'); } catch (e) { console.warn(e); } })
                },
                {
                    icon: 'highlight_alt', color: '#ffffff', tooltip: 'Rectangle select: drag a box around points, tables and notes',
                    ionfunction: createIonFunction(() => { try { pm.plateTrack.startSelectGesture('rect'); } catch (e) { console.warn(e); } })
                },
                // Tetris layout: every table put on one cell size, then lifted and dropped
                // into a packed block, piece by piece, where none sits on another. Live on the
                // canvas, and one Undo puts everything back. Pressing it again while the
                // pieces are falling starts over from where they are.
                {
                    icon: 'view_quilt', color: '#ffffff', tooltip: 'Tetris layout: same-size cells, no overlaps, dropped into place',
                    ionfunction: createIonFunction(async () => {
                        const pt = pm.plateTrack;
                        try {
                            if (pt.__maximized) { pt.setMessage('Exit maximize to lay out the canvas.', 2); return; }
                            const count = (pt.root || []).filter(p => p && !p.hidden).length + (pt.m_plots || []).length;
                            if (!count) { pt.setMessage('Nothing on the canvas to lay out yet.', 2); return; }
                            pt.wb(null);
                            const done = await pt.layoutCompactTetris({ style: 'tetris', undoable: true });
                            if (done) pt.setMessage(count + (count === 1 ? ' object' : ' objects') + ' laid out. Undo puts them back.', 2);
                        } catch (e) { console.warn('tetris layout', e); }
                    })
                },
            ];
            pm.__appMenus = () => [
                { label: 'Build', items: refreshBuildLibrary() },
                drawMenu,
                ...selectTools,
            ]

            // The viewer has no menubar at all: an empty menu strip stands where it would be.
            let button_canvas2 = __viewer ? { wid: 'card', data: { cards: [[]] } } : await exec('manchester/controls/navigation-panel-plates2.js', pm)

            buttonMenuPanel = {
                wid: 'card',
                componentRef: 'staticPanel',
                data: {

                    cards: [
                        [
                            {
                                'title': '',
                                'component': {
                                    wid: 'card',
                                    componentRef: 'selectedPanel',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'component': button_canvas2
                                                },
                                            ]]
                                    }
                                }
                            },
                            {
                                'title': '',
                                'component': {
                                    wid: 'card',
                                    componentRef: 'buttonMenuPanel',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'component': button_canvas
                                                },
                                            ]]
                                    }
                                }
                            },
                        ]]
                }
            }

            progressBar(60);
            let saveAsSaveScreen = async () => {
                // In a live session the document lives at its shared path, and that is where
                // both people's saves go.
                if (pm.plateTrack.__collab && pm.plateTrack.__collabDoc) {
                    try { await pm.plateTrack.__collab.save(graph); }
                    catch (e) { try { pm.plateTrack.setMessage('Could not save the shared document: ' + (e && e.message ? e.message : e), 1); } catch (e2) { } }
                    return;
                }
                await exec('manchester/io/save-as-obj-tp.js', graph, genegraph_panel_layout, path)
            }
            let openSaveScreen = async () => {
                // A plain folder browser over the canvas (the old card collapsed to nothing here).
                await exec('baja/plate/views/open-workbook.js', pm.plateTrack, graph, pm)
            }
            let importSaveScreen = async () => {
                let v = await exec('baja/table/io/import-yakro', graph)
                showModal(v)
            }

            let publicPublish = async () => {
                let canvas = CurrentLayout.getStashed('graph-canvas');
                if (canvas.canvas) {
                    canvas = canvas.canvas;
                }

                let domCanvas = canvas.getElement ? canvas.getElement() : canvas;

                let pngBase64 = domCanvas.nativeElement.toDataURL('image/png');

                console.log(pngBase64);

                let im = pngBase64.replace(/^data:image\/png;base64,/, '');
                if (pm.plateTrack && im) {

                    await exec('manchester/io/save-as-obj-tp-public.js', graph, genegraph_panel_layout, path, '/app/cpd/baja-analytics', im)
                } else {
                    await exec('manchester/io/save-as-obj-tp-public.js', graph, genegraph_panel_layout, path, '/app/cpd/baja-analytics')
                }
            }
            progressBar(80);


            file_items.push({
                label: 'New...',
                click: async (xwc, ywc) => {

                    let confirm = await exec(
                        'baja/lib/confirm.js',
                        'Are you sure you want to delete all and start over?',
                        async () => {

                            pm.plateTrack.reset('/app/cpd/baja-analytics')

                            let button_canvas2 = await exec(
                                'manchester/controls/navigation-panel-plates2.js',
                                pm,
                                null
                            )

                            CurrentLayout.setComponent(
                                'selectedPanel',
                                button_canvas2
                            )
                        }
                    )

                    showModal(confirm)
                }
            })

            file_items.push({
                label: 'Shared documents…',
                click: async (xwc, ywc) => {
                    await exec('baja/plate/collab/shared-documents.js', pm.plateTrack, graph, pm)
                },
                move: () => { }
            })
            file_items.push({
                label: 'Share for co-editing…',
                click: async (xwc, ywc) => {
                    await exec('baja/plate/collab/share-for-coediting.js', pm.plateTrack, graph, pm)
                },
                move: () => { }
            })
            file_items.push({
                label: 'Copy All',
                click: async (xwc, ywc) => {

                    const currentstate =
                        await pm.plateTrack.capturePlateState()

                    try {

                        navigator.clipboard.writeText(currentstate)
                            .then(() => {

                                console.log('Object copied to clipboard!')

                                pm.plateTrack.setMessage(' Copied ')

                            })
                            .catch(err => {

                                console.error(
                                    'Failed to copy object to clipboard: ',
                                    err
                                )
                            })

                        console.log(
                            'JSON plate state written to clipboard as plain text.'
                        )

                    } catch (err) {

                        console.error(
                            'Failed to write JSON plate state to clipboard:',
                            err
                        )
                    }
                }
            })

            file_items.push({
                label: 'Open',
                click: async (xwc, ywc) => {

                    await openSaveScreen()
                }
            })

            file_items.push({
                label: 'Import...',
                click: async (xwc, ywc) => {

                    await importSaveScreen()
                }
            })

            file_items.push({
                label: 'Save as',
                click: async (xwc, ywc) => {

                    await saveAsSaveScreen()
                }
            })

            // file_items.push({
            //     label: 'Publish Viewer (public access)',
            //     click: async (xwc, ywc) => {

            //         await publicPublish()
            //     }
            // })





            var result = await verifyUserPath('cpd/bajabio-analytics', 'publisher');

            if (result.allowed) {

                file_items.push({
                    label: 'Publish (internal user access)',
                    click: async (xwc, ywc) => {

                        let canvas =
                            CurrentLayout.getStashed('graph-canvas')

                        if (canvas.canvas) {
                            canvas = canvas.canvas
                        }

                        let domCanvas =
                            canvas.getElement
                                ? canvas.getElement()
                                : canvas

                        let pngBase64 =
                            domCanvas.nativeElement.toDataURL(
                                'image/png'
                            )

                        console.log(pngBase64)

                        let im = pngBase64.replace(
                            /^data:image\/png;base64,/,
                            ''
                        )

                        if (pm.plateTrack && im) {

                            await exec(
                                'manchester/io/save-as-obj-tp-internal-news.js',
                                graph,
                                genegraph_panel_layout,
                                path,
                                '/app/cpd/baja-analytics',
                                im
                            )

                        } else {

                            await exec(
                                'manchester/io/save-as-obj-tp-internal-news.js',
                                graph,
                                genegraph_panel_layout,
                                path,
                                '/app/cpd/baja-analytics'
                            )
                        }
                    }
                })
            }

            file_items.push({
                label: 'Download SVG',
                click: async (xwc, ywc) => {

                    graph.setMessage(' Generating SVG... ')

                    let va = await prompt(
                        'Height(inches): ',
                        ['Height'],
                        { Height: '' },
                        500,
                        300
                    )

                    await graph.exportHighResPNG(va)
                }
            })

            if (MSGraph.isLoggedIn()) {

                ai_create_file_items.push({
                    'label': 'Historical Milestones', 'ionfunction': createIonFunction(async () => {

                        const txt = 'Give me a timeline that describes key milestones for the discovery vaccines and add to this specific milestones for the discovery of the covid vaccine. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 100);
                        }, 50);

                        let sequence_input = {
                            wid: 'card',
                            "height": "500px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "200px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create.  (BCE currently not supported)</font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build timeline', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                setTimeout(async () => {

                                                                    let interval = null;
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    let content = sequenceTextEditor.getContent();
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let model = await exec('py/openai/milestones.py', em, content)
                                                                    pm.plateTrack.killSprite()
                                                                    if (model && model.milestones) {
                                                                        if (model.milestones.length === 0) {
                                                                            infoPrompt("No milestones found")
                                                                            return;
                                                                        }

                                                                        let MPlot = await exec('flexigraph/plot.js')
                                                                        const plot = new MPlot({ points: model.milestones });

                                                                        function jdnFromYMD(y, m, d) {
                                                                            const a = Math.floor((14 - m) / 12);
                                                                            const y2 = y + 4800 - a;
                                                                            const m2 = m + 12 * a - 3;
                                                                            return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
                                                                                - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
                                                                        }

                                                                        function parseProlepticDate(isoString) {
                                                                            if (typeof isoString !== "string") return new Date(NaN);

                                                                            isoString = isoString.replace(/\u2212|−/g, "-").trim();

                                                                            const m = isoString.match(
                                                                                /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
                                                                            );
                                                                            if (!m) {

                                                                                const d = new Date(isoString);
                                                                                return isNaN(d) ? new Date(NaN) : d;
                                                                            }

                                                                            const year = parseInt(m[1], 10);
                                                                            const month1 = parseInt(m[2], 10);
                                                                            const day = parseInt(m[3], 10);
                                                                            const hour = m[4] ? parseInt(m[4], 10) : 0;
                                                                            const minute = m[5] ? parseInt(m[5], 10) : 0;
                                                                            const second = m[6] ? parseInt(m[6], 10) : 0;

                                                                            if (
                                                                                month1 < 1 || month1 > 12 ||
                                                                                day < 1 || day > 31 ||
                                                                                hour < 0 || hour > 23 ||
                                                                                minute < 0 || minute > 59 ||
                                                                                second < 0 || second > 59
                                                                            ) return new Date(NaN);

                                                                            const jdn = jdnFromYMD(year, month1, day);
                                                                            const epochJDN = 2440588;
                                                                            const secondsSinceEpoch = (jdn - epochJDN) * 86400 + (hour * 3600 + minute * 60 + second);
                                                                            const ms = secondsSinceEpoch * 1000;

                                                                            return new Date(ms);
                                                                        }

                                                                        plot.startDate = parseProlepticDate(model.window.start);
                                                                        plot.endDate = parseProlepticDate(model.window.end);

                                                                        let xs = model.milestones.map(p => p.x);

                                                                        const xMin = Math.min(...xs);
                                                                        const xMax = Math.max(...xs);
                                                                        plot.grid.zoom(xMin, xMax, 0, 1);
                                                                        plot.w = 800;
                                                                        plot.h = 400;
                                                                        plot.type = 'timeline'
                                                                        plot.name = generateNautName();
                                                                        plot.x_axis_label = "Time (Years)";
                                                                        plot.y_axis_label = "Sample Metric";
                                                                        plot.fitScaleToData = false;
                                                                        plot.grid.rescale();

                                                                        await pm.plateTrack.panToNextSpot(800)

                                                                        pm.plateTrack.setPlotCenter(plot)

                                                                    } else {
                                                                        infoPrompt(" Failed to build the model")
                                                                    }
                                                                }, 1000)

                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })

                ai_create_file_items.push({
                    'label': 'Scientific Publications Timeline', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = 'Give me a timeline that describes key milestones for the discovery vaccines and add to this specific milestones for the discovery of the covid vaccine. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 100);
                        }, 50);

                        let sequence_input = {
                            wid: 'card',
                            "height": "500px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "300px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build timeline', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                setTimeout(async () => {

                                                                    let interval = null;
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    let content = sequenceTextEditor.getContent();
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let model = await exec('py/openai/sci-pub-milestones.py', em, content)
                                                                    pm.plateTrack.killSprite()

                                                                    if (model && model.results.milestones && model.results.milestones.length > 0) {
                                                                        let MPlot = await exec('flexigraph/plot.js')
                                                                        const plot = new MPlot({ points: model.results.milestones });
                                                                        function jdnFromYMD(y, m, d) {
                                                                            const a = Math.floor((14 - m) / 12);
                                                                            const y2 = y + 4800 - a;
                                                                            const m2 = m + 12 * a - 3;
                                                                            return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
                                                                                - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
                                                                        }

                                                                        function parseProlepticDate(isoString) {
                                                                            if (typeof isoString !== "string") return new Date(NaN);

                                                                            isoString = isoString.replace(/\u2212|−/g, "-").trim();

                                                                            const m = isoString.match(
                                                                                /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
                                                                            );
                                                                            if (!m) {

                                                                                const d = new Date(isoString);
                                                                                return isNaN(d) ? new Date(NaN) : d;
                                                                            }

                                                                            const year = parseInt(m[1], 10);
                                                                            const month1 = parseInt(m[2], 10);
                                                                            const day = parseInt(m[3], 10);
                                                                            const hour = m[4] ? parseInt(m[4], 10) : 0;
                                                                            const minute = m[5] ? parseInt(m[5], 10) : 0;
                                                                            const second = m[6] ? parseInt(m[6], 10) : 0;

                                                                            if (
                                                                                month1 < 1 || month1 > 12 ||
                                                                                day < 1 || day > 31 ||
                                                                                hour < 0 || hour > 23 ||
                                                                                minute < 0 || minute > 59 ||
                                                                                second < 0 || second > 59
                                                                            ) return new Date(NaN);

                                                                            const jdn = jdnFromYMD(year, month1, day);
                                                                            const epochJDN = 2440588;
                                                                            const secondsSinceEpoch = (jdn - epochJDN) * 86400 + (hour * 3600 + minute * 60 + second);
                                                                            const ms = secondsSinceEpoch * 1000;

                                                                            return new Date(ms);
                                                                        }

                                                                        plot.startDate = parseProlepticDate(model.window.start);
                                                                        plot.endDate = parseProlepticDate(model.window.end);

                                                                        let xs = model.results.milestones.map(p => p.x);
                                                                        const xMin = Math.min(...xs);
                                                                        const xMax = Math.max(...xs);
                                                                        plot.grid.zoom(xMin, xMax, 0, 1);
                                                                        plot.w = 800;
                                                                        plot.h = 400;
                                                                        plot.type = 'timeline'
                                                                        plot.name = generateNautName();
                                                                        plot.x_axis_label = "Time (Years)";
                                                                        plot.y_axis_label = "Sample Metric";
                                                                        plot.fitScaleToData = false;
                                                                        plot.grid.rescale();
                                                                        await pm.plateTrack.panToNextSpot(800)

                                                                        pm.plateTrack.killSprite()
                                                                        pm.plateTrack.setPlotCenter(plot)

                                                                    } else {
                                                                        infoPrompt(" Failed to build the model")
                                                                    }
                                                                }, 1000)

                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })

                ai_create_file_items.push({
                    label: 'Gantt Chart', ionfunction: createIonFunction(async () => {

                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `
                        Sample text.  Click here to start your own
1. target discovery 4 months
2. target validation 1 month
3. mechanism validation 2 months
4. drug candidate screening 3 months
5. lead identification and validation 1 week
6. in vitro toxicology 1 week
7.  Invivo toxicology 13 weeks
8. Pk/PD 5 weeks
9. Large animal toxicology  20 weeks
 `;
                        let initalText = true;
                        let i = 0;

                        let currentText = '';

                        const interval = setInterval(() => {

                            currentText += txt[i];
                            if (!initalText) {
                                sequenceTextEditor?.setContent('');
                                clearInterval(interval)
                                return;
                            }
                            sequenceTextEditor?.setContent(currentText);
                            i++;

                            if (i >= txt.length) {
                                clearInterval(interval);
                            }
                        }, 40);

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
                                                wid: 'html',
                                                data: `

                                                <H4>
  <font color="navy">

                                                Write out items to add to the gantt chart, one on each line.  Click on the sample text below to start:
                                                </font> </h4>
                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "400px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),

                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build', ionFunction: createIonFunction(async () => {
                                                                pm.plateTrack.setMessage("AI mode...", 5)

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                let interval = null;
                                                                let em = new EngineMonitor((msg) => {
                                                                    pm.plateTrack.updateSprite(msg)
                                                                });
                                                                em.addProgressListener(async (v) => {
                                                                    if (v >= 100) {
                                                                    }
                                                                })
                                                                let content = sequenceTextEditor.getContent();
                                                                user_prompt = content;
                                                                pm.plateTrack.setMessage("Building model", 5)
                                                                let model = await exec('py/openai/timeline.py', em, content)
                                                                pm.plateTrack.killSprite()

                                                                showModal({
                                                                    wid: 'json',
                                                                    data: JSON.stringify(model)
                                                                })

                                                                let MPlot = await exec('flexigraph/plot.js')
                                                                const plot = new MPlot({ points: model.intervals });
                                                                plot.startDate = new Date(model.window.start);
                                                                plot.endDate = new Date(model.window.end);
                                                                const xMin = Math.min(...model.intervals.map(p => p.startX));
                                                                const xMax = Math.max(...model.intervals.map(p => p.x));
                                                                plot.grid.zoom(xMin, xMax, 0, 1);
                                                                plot.w = 800;
                                                                plot.h = 300;
                                                                plot.type = 'timeline'
                                                                plot.name = 'test-timeline';
                                                                plot.x_axis_label = "Time (Years)";
                                                                plot.y_axis_label = "Sample Metric";
                                                                plot.fitScaleToData = false;
                                                                plot.grid.rescale();
                                                                pm.plateTrack.setPlotCenter(plot)

                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    }

                    )
                })








                // Financial-model builders, the same as the editor's Build menu.
                // (The blocks bind plate_graph to pm themselves.)
                ai_create_file_items.push({
                    'label': 'P&L With Capital', 'ionfunction': createIonFunction(async () => {
                        const plate_graph = pm;
                        const pt = pm.plateTrack;
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });
                        const txt = 'I want to create a small therapeutics company with two commercial products for rare disease indications. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 450);

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
                                                wid: 'html',
                                                data: `

                                                <H4>
  <font color="navy">

                                                Describe the model you want to create below:
                                                </font> </h4>
                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "600px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),

                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                let interval = null;
                                                                let em = new EngineMonitor((msg) => {
                                                                    plate_graph.plateTrack.updateSprite(msg)
                                                                });
                                                                em.addProgressListener(async (v) => {
                                                                    if (v >= 100) {
                                                                    }
                                                                })
                                                                let content = sequenceTextEditor.getContent();
                                                                const user_prompt = content;
                                                                plate_graph.plateTrack.setMessage("Generating assumptions…", 5)
                                                                let model = await exec('py/openai/assumptions.py', em, content)
                                                                let model_captial = await exec('py/openai/capital-assumptions.py', em, getUser(), content)
                                                                await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model_captial)

                                                                exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model).then(async r => {
                                                                    plate_graph.plateTrack.setMessage(null)
                                                                    plate_graph.plateTrack.setMessage("Assumptions loaded. Edit them as needed.", 1)
                                                                    setTimeout(() => {
                                                                        plate_graph.plateTrack.killSprite()
                                                                        let pr = []
                                                                        let formula = []
                                                                        for (let p of plate_graph.plateTrack.root) {
                                                                            pr.push(p.toValueFormulaJSON())
                                                                            formula.push({ 'Table': p.name, 'HAS these assignments': p.getFormula() })
                                                                        }

                                                                        let g = CurrentLayout.getStashed('graph')
                                                                        if (g)
                                                                            g.touchMe();

                                                                        pt.updateCalculations();
                                                                        setTimeout(async () => {
                                                                            let t = plate_graph.plateTrack.getTableByName('Assumptions')
                                                                            plate_graph.plateTrack.setMessage('PnL', 5)
                                                                            let ts = (t.toValueFormulaJSON())
                                                                            let pnl = await exec('py/openai/pnl.py', user_prompt, ts)
                                                                            let r = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, pnl)
                                                                            plate_graph.plateTrack.setMessage("Profit and loss formulas added, based on the assumptions.", 1)

                                                                            setTimeout(async () => {
                                                                                let pr = []
                                                                                let formula = []
                                                                                for (let p of plate_graph.plateTrack.root) {
                                                                                    pr.push(p.toValueFormulaJSON())
                                                                                    formula.push({ 'Table': p.name, 'HAS these assignments': p.getFormula() })
                                                                                }
                                                                                let g = CurrentLayout.getStashed('graph')
                                                                                if (g)
                                                                                    g.touchMe();
                                                                                let items = []
                                                                                plate_graph.plateTrack.updateCalculations();
                                                                                setTimeout(async () => {
                                                                                    let ls = [
                                                                                    ]
                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        ls.push(p.toValueFormulaJSON())
                                                                                    }

                                                                                    let g = CurrentLayout.getStashed('graph')
                                                                                    if (g)
                                                                                        g.touchMe();

                                                                                    pt.layoutCompactTetris();
                                                                                    plate_graph.plateTrack.setMessage("Timeline...", 5)

                                                                                    let model4 = await exec('py/openai/time-money.py', ls)
                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    let __d = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model4);

                                                                                    let model3 = await exec('py/openai/capital-required.py', ls)
                                                                                    let rrr = await exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model3);
                                                                                    pt.killSprite();
                                                                                    pt.zoomouttoFit();

                                                                                    pt.layoutCompactTetris();

                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        ls.push(p.toValueFormulaJSON())
                                                                                    }

                                                                                    for (let p of plate_graph.plateTrack.root) {
                                                                                        p.selectWellsByString('[1:][1:]')
                                                                                        const se = p.getSelectedWellsInOrder();
                                                                                        for (let w of se) {
                                                                                            items.push({
                                                                                                id: w.uid,
                                                                                                value: w.value,
                                                                                                fields: Object.keys(w.group),
                                                                                                wtype: ''
                                                                                            })
                                                                                        }
                                                                                    }

                                                                                    plate_graph.plateTrack.updateCalculations();
                                                                                    pt.separatePlatesOverTime({
                                                                                        spacing: 0,
                                                                                        durationMs: 5_000,
                                                                                        iterationsPerFrame: 8,
                                                                                        explodeFrac: 0.13,
                                                                                        explodeStep: 1,
                                                                                        wanderStep: 0.5,
                                                                                        jitterReseedRate: 0.25,
                                                                                        keepStrictCenter: true
                                                                                    });

                                                                                    setTimeout(async () => {
                                                                                        ls = [
                                                                                        ]
                                                                                        for (let p of pm.plateTrack.root) {
                                                                                            ls.push(p.toValueUID())
                                                                                        }
                                                                                        let model4 = await exec('py/openai/find-waterfall-plot-wells.py', getUser(), ls)
                                                                                        const plotFactory = await exec('flexigraph/plot.js', MGrid);
                                                                                        const MPlot = (await plotFactory) || plotFactory;

                                                                                        const getWellsFromJSON = (root, data) => {
                                                                                            const wellsList = Array.isArray(data?.wells) ? data.wells : [];
                                                                                            if (!Array.isArray(root) || !root.length) return [];
                                                                                            const plateMap = new Map();
                                                                                            for (const plate of root) {
                                                                                                const name = plate?.name || plate?.plate || plate?.id;
                                                                                                if (name) plateMap.set(String(name), plate);
                                                                                            }
                                                                                            const out = [];
                                                                                            for (const w of wellsList) {
                                                                                                const plateName = w?.plate;
                                                                                                const plate = plateMap.get(plateName);
                                                                                                if (!plate || !Array.isArray(plate.wells)) continue;

                                                                                                const col = Number(w?.x) - 1;
                                                                                                const row = Number(w?.y) - 1;

                                                                                                if (row > 0) {

                                                                                                    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

                                                                                                    const colArr = plate.wells[col];
                                                                                                    if (!Array.isArray(colArr)) continue;

                                                                                                    const well = colArr[row];

                                                                                                    const rightColArr = plate.wells[col + 1][row];
                                                                                                    const right = Array.isArray(rightColArr) ? rightColArr[row] : null;

                                                                                                    if (well) {
                                                                                                        out.push(well);
                                                                                                        out.push(rightColArr);
                                                                                                    }
                                                                                                }
                                                                                            }

                                                                                            return out;
                                                                                        }

                                                                                        let wells = getWellsFromJSON(pm.plateTrack.root, model4)
                                                                                        for (let w of wells) {
                                                                                            w.selectIt();
                                                                                        }
                                                                                        const points = MPlot.buildWaterfallFromGroups(wells)
                                                                                        pm.plateTrack.deselectAll();
                                                                                        const scatterData = { points };
                                                                                        const plot = new MPlot(scatterData, MGrid);
                                                                                        plot.type = 'waterfall';
                                                                                        const maxX = Math.max(...scatterData.points.map(p => p.x));
                                                                                        const maxY = Math.max(...scatterData.points.map(p => p.y));
                                                                                        plot.grid.setxmax(maxX);
                                                                                        plot.grid.setymax(maxY);
                                                                                        plot.errorBarColor = 'gray';
                                                                                        plot.fitScaleToData = false;
                                                                                        plot.grid.setxmin(0); plot.name = 'Income Statement – Waterfall';
                                                                                        plot.x_axis_label = '';
                                                                                        plot.y_axis_label = 'USD';
                                                                                        plot.setWidth(pt.grid.worldWidth(300))
                                                                                        plot.setHeight(pt.grid.worldHeight(250))

                                                                                        pm.plateTrack.zoomouttoFit();

                                                                                        pt.killSprite();

                                                                                        setTimeout(() => {
                                                                                            pm.plateTrack.setMessage("This is a starting model, not a complete one. Review and refine it.", 1)
                                                                                            pt.addNextAvailableX(plot);
                                                                                            setTimeout(() => {
                                                                                                pm.plateTrack.layoutCompactTetris();
                                                                                                setTimeout(() => {
                                                                                                    pm.plateTrack.setMessage("Green arrows mark input controls. Not all of them are used.", 1)

                                                                                                }, 4000)

                                                                                            }, 1000)

                                                                                        }, 1000)

                                                                                    }, 200)

                                                                                }, 400)
                                                                            }, 100)
                                                                            plate_graph.plateTrack.___formula_integrity_report = pnl;
                                                                        }, 1000)
                                                                    }, 3000)
                                                                    plate_graph.plateTrack.___formula_integrity_report = model;
                                                                })
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)

                    })
                })

                ai_create_file_items.push({
                    // A project's P&L: no revenue, ongoing donations / grants / other income,
                    // expenses by category, a reserve, and a funding timeline.
                    'label': 'Project', 'ionfunction': createIonFunction(async () => {
                        const pt = pm.plateTrack;
                        // A paragraph, so the description can carry the detail a budget needs.
                        let content = '';
                        try {
                            content = await exec('baja/lib/prompt-text.js', {
                                title: 'Project budget',
                                message: 'Describe the project: what it does, how long it runs, who works on it, what it costs, and what carries it (donations, grants, dues, sponsorship, other income). No revenue is assumed.',
                                placeholder: 'A two-year community food project with three staff and monthly outreach events, funded by monthly donations and one foundation grant, starting in January…',
                                action: 'Build the budget',
                                historyKey: 'project-budget'   // the last 10 project descriptions, offered back
                            });
                        } catch (e) { content = ''; }
                        if (!content) return;
                        pt.setMessage('Planning the project budget…', 5);
                        let model = null;
                        try { model = await exec('py/openai/project-budget.py', content); } catch (e) { model = { error: '' + (e && e.message || e) }; }
                        if (!model || model.error || !model.tables) {
                            try { pt.killSprite(); } catch (e) { }
                            pt.setMessage('The project budget could not be built: ' + ((model && model.error) || 'no answer'), 3);
                            return;
                        }
                        const before = new Set((pt.root || []).map(x => x && x.name));
                        let report = null;
                        try {
                            report = await exec('baja/draw/data-model-to-tables-gpt', pt, model);
                        } catch (e) { try { pt.killSprite(); } catch (e2) { } pt.setMessage('The project tables could not be placed: ' + (e && e.message || e), 3); return; }
                        const made = (pt.root || []).filter(x => x && !before.has(x.name)).map(x => x.name);
                        // The builder's own verdict on the formulas, in the console and on the canvas.
                        try {
                            const rep = report && report.report ? report.report : null;
                            console.log('[project budget] tables:', made, 'report:', rep);
                            const errs = rep ? [].concat(rep.errors || [], rep.missingValues || []) : [];
                            if (errs.length) pt.setMessage('Project tables built (' + made.length + '), but ' + errs.length + ' formula cell(s) did not resolve; see the console.', 3);
                            else pt.setMessage('Project tables built: ' + (made.join(', ') || 'none new') + '. Edit the assumptions; the budget follows.', 2);
                        } catch (e) { }
                        try { pt.updateCalculations(); } catch (e) { }
                        // The builder stacks every new table at the same origin; the P&L flow
                        // spreads them with the tetris layout and stops the working sprite that
                        // setMessage(…, 5) started. Without both, the tables sat on top of each
                        // other and the spinner never went away.
                        try { pt.killSprite(); } catch (e) { }
                        // The layout resolves when the tables have reached their final spots:
                        // fit and place the timeline after that.
                        try { await pt.layoutCompactTetris(); } catch (e) { }
                        // Show what was built: fit every object, then the timeline is placed beside.
                        try { await pt.zoomtfit(); } catch (e) { }
                        // The funding timeline, drawn the way the milestone builders draw theirs.
                        try {
                            if (model.milestones && model.milestones.length && model.window) {
                                let MPlot = await exec('flexigraph/plot.js');
                                const plot = new MPlot({ points: model.milestones });
                                plot.startDate = new Date(model.window.start);
                                plot.endDate = new Date(model.window.end);
                                const xs = model.milestones.map(q => q.x);
                                plot.grid.zoom(Math.min(...xs), Math.max(...xs), 0, 1);
                                plot.w = 800; plot.h = 400;
                                plot.type = 'timeline';
                                plot.name = ((model.project && model.project.name) || 'Project').replace(/_/g, ' ') + ' timeline';
                                plot.x_axis_label = 'Time'; plot.y_axis_label = '';
                                plot.fitScaleToData = false;
                                plot.grid.rescale();
                                await pt.panToNextSpot(800);
                                pt.setPlotCenter(plot);
                            }
                        } catch (e) { console.warn('project timeline', e); }
                        try { pt.updateCalculations(); } catch (e) { }
                    })
                })
                ai_create_file_items.push({
                    // The simplest project: milestones only, each with the amount it takes; the
                    // timeline shows the budget required by each date (the amounts accumulated).
                    'label': 'Milestone Budget', 'ionfunction': createIonFunction(async () => {
                        const pt = pm.plateTrack;
                        // A paragraph, so the description can carry the detail a budget needs.
                        let content = '';
                        try {
                            content = await exec('baja/lib/prompt-text.js', {
                                title: 'Milestone budget',
                                message: 'Describe the project and what it has to reach. No monthly costs: each milestone gets the amount it takes, and the timeline shows the budget required by each date.',
                                placeholder: 'Fit out a community workshop over nine months: permits, a lease deposit, tools, a launch event, starting in March…',
                                action: 'Build the milestones',
                                historyKey: 'milestone-budget'   // the last 10 project descriptions, offered back
                            });
                        } catch (e) { content = ''; }
                        if (!content) return;
                        pt.setMessage('Planning the milestones…', 5);
                        let model = null;
                        try { model = await exec('py/openai/milestone-budget.py', content); } catch (e) { model = { error: '' + (e && e.message || e) }; }
                        if (!model || model.error || !model.tables) {
                            try { pt.killSprite(); } catch (e) { }
                            pt.setMessage('The milestone budget could not be built: ' + ((model && model.error) || 'no answer'), 3);
                            return;
                        }
                        const before = new Set((pt.root || []).map(x => x && x.name));
                        let report = null;
                        try {
                            report = await exec('baja/draw/data-model-to-tables-gpt', pt, model);
                        } catch (e) { try { pt.killSprite(); } catch (e2) { } pt.setMessage('The project tables could not be placed: ' + (e && e.message || e), 3); return; }
                        const made = (pt.root || []).filter(x => x && !before.has(x.name)).map(x => x.name);
                        // The builder's own verdict on the formulas, in the console and on the canvas.
                        try {
                            const rep = report && report.report ? report.report : null;
                            console.log('[milestone budget] tables:', made, 'report:', rep);
                            const errs = rep ? [].concat(rep.errors || [], rep.missingValues || []) : [];
                            if (errs.length) pt.setMessage('Milestone tables built (' + made.length + '), but ' + errs.length + ' formula cell(s) did not resolve; see the console.', 3);
                            else pt.setMessage('Milestone tables built: ' + (made.join(', ') || 'none new') + '. Edit a budget or a date; the required-by-date column and the timeline follow.', 2);
                        } catch (e) { }
                        try { pt.updateCalculations(); } catch (e) { }
                        // The builder stacks every new table at the same origin; the P&L flow
                        // spreads them with the tetris layout and stops the working sprite that
                        // setMessage(…, 5) started. Without both, the tables sat on top of each
                        // other and the spinner never went away.
                        try { pt.killSprite(); } catch (e) { }
                        // The layout resolves when the tables have reached their final spots:
                        // fit and place the timeline after that.
                        try { await pt.layoutCompactTetris(); } catch (e) { }
                        // Show what was built: fit every object, then the timeline is placed beside.
                        try { await pt.zoomtfit(); } catch (e) { }
                        // The funding timeline, drawn the way the milestone builders draw theirs.
                        try {
                            if (model.milestones && model.milestones.length && model.window) {
                                let MPlot = await exec('flexigraph/plot.js');
                                const plot = new MPlot({ points: model.milestones });
                                plot.startDate = new Date(model.window.start);
                                plot.endDate = new Date(model.window.end);
                                const xs = model.milestones.map(q => q.x);
                                plot.grid.zoom(Math.min(...xs), Math.max(...xs), 0, 1);
                                plot.w = 800; plot.h = 400;
                                plot.type = 'timeline';
                                plot.name = ((model.project && model.project.name) || 'Project').replace(/_/g, ' ') + ' timeline';
                                plot.x_axis_label = 'Time'; plot.y_axis_label = '';
                                plot.fitScaleToData = false;
                                plot.grid.rescale();
                                await pt.panToNextSpot(800);
                                pt.setPlotCenter(plot);
                            }
                        } catch (e) { console.warn('milestone timeline', e); }
                        try { pt.updateCalculations(); } catch (e) { }
                    })
                })
                ai_create_file_items.push({
                    'label': 'Product Assumptions', 'ionfunction': createIonFunction(async () => {
                        const plate_graph = pm;
                        const pt = pm.plateTrack;
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });
                        const txt = 'create a rat cage for pharma safety studies that has video cameras and peizo floor for tracking gate and an accelermoter for tracking vibrations ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 150);

                        let sequence_input = {
                            wid: 'card',
                            "height": "300px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "200px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `

                                                <H4>
                                                      <font color="navy">
                                                Write a paragraph that describes the project:
                                                </font> </h4>
                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "600px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),

                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                plate_graph.plateTrack.setMessage("Generating assumptions…", 5)

                                                                let interval = null;
                                                                let em = new EngineMonitor((msg) => {
                                                                    plate_graph.plateTrack.updateSprite(msg)
                                                                });
                                                                em.addProgressListener(async (v) => {
                                                                    if (v >= 100) {
                                                                    }
                                                                })
                                                                let content = sequenceTextEditor.getContent();
                                                                let model = await exec('py/openai/assumptions-product.py', em, content)

                                                                exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model).then(async r => {
                                                                    plate_graph.plateTrack.setMessage(null)
                                                                    plate_graph.plateTrack.setMessage("Assumptions loaded. You can edit them or add more.", 1)
                                                                    setTimeout(async () => {

                                                                        // let t = plate_graph.plateTrack.getTableByName('Assumptions')
                                                                        // let ts = t.toValueFormulaJSON()

                                                                        plate_graph.plateTrack.updateCalculations();
                                                                        plate_graph.plateTrack.killSprite()
                                                                    }, 3000)
                                                                    plate_graph.plateTrack.___formula_integrity_report = model;
                                                                })
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)

                    })
                })

                // Draws a finished {name, headers, rows} table from a python tool as plain values
                // (no formulas), replacing any table of the same name. Shared by the ΔΔCt and
                // indication-market items.
                const drawValueTable = async (pt, spec) => {
                    const Plate = await exec('baja/plate/plate');
                    const GenericWell = await exec('baja/plate/well');
                    const headers = spec.headers || [];
                    const rows = spec.rows || [];
                    const existing = (pt.root || []).find(p => p && p.name === spec.name);
                    if (existing) pt.removePlate(existing);
                    const plate = new Plate(spec.name, Math.max(1, headers.length), rows.length + 1);
                    plate.last_touched = new Date();
                    for (let c = 0; c < headers.length; c++) {
                        const col = plate.wells[c] || (plate.wells[c] = []);
                        for (let r = 0; r <= rows.length; r++) {
                            const w = new GenericWell(`${String.fromCharCode(65 + (c % 26))}${r + 1}`);
                            const v = r === 0 ? headers[c] : (rows[r - 1] || [])[c];
                            w.setValue(v === undefined || v === null ? '' : v, true);
                            col[r] = w;
                        }
                    }
                    plate.applycolumnheaders?.();
                    pt.addPlateWithConsistentWellSize(plate);
                    // Money, percentages, counts, dates, links and badges shown as such.
                    try { await pt.autoTypeTables([plate]); } catch (e) { }
                    // Long text wraps in its cell; give those rows the height to show it.
                    try { pt.fitRowsToText([plate]); } catch (e) { }
                    return plate;
                };

                ai_create_file_items.push({
                    'label': 'ΔΔCt analysis', 'ionfunction': createIonFunction(async () => {
                        // ΔΔCt relative quantification on the Ct table already on the canvas.
                        // py/analytics/ddct-analysis.py is deterministic: it finds the Ct table,
                        // its Sample / Target / Ct / Condition columns, the housekeeping gene(s)
                        // and the calibrator group, and returns finished tables. When it cannot
                        // decide (no housekeeping name, no control label, several Ct tables) it
                        // answers needs_input and we ask with a canvas menu, then run again.
                        const pt = pm.plateTrack;

                        const canvasTables = () => (pt.root || [])
                            .filter(p => p && Array.isArray(p.wells) && p.wells.length
                                && p.plateType !== 'package' && typeof p.toValueFormulaJSON === 'function')
                            .map(p => p.toValueFormulaJSON());

                        // Result tables are plain values (no formulas): the analysis is a
                        // snapshot of the source table, documented by the *_ddCt_settings table.
                        const drawTable = (spec) => drawValueTable(pt, spec);

                        const closeMenu = () => { pt.menu = null; pt.menu_vis = false; };

                        const run = async (options) => {
                            const tables = canvasTables();
                            if (!tables.length) {
                                pt.setMessage('Put a table with Ct values on the canvas first (Sample, Target and Ct columns, or one Ct column per gene).', 1.1);
                                return;
                            }
                            pt.setMessage('ΔΔCt analysis…', 5);
                            let result;
                            try {
                                result = await exec('py/analytics/ddct-analysis.py', tables, options || {});
                            } catch (e) {
                                pt.killSprite();
                                pt.setMessage('ΔΔCt analysis failed: ' + (e && e.message ? e.message : e), 1.1);
                                return;
                            }
                            pt.killSprite();

                            if (!result || result.status === 'error') {
                                pt.setMessage((result && result.error) || 'ΔΔCt analysis failed', 1.1);
                                return;
                            }

                            if (result.status === 'needs_input') {
                                const optionKey = { table: 'table', reference: 'reference_targets', calibrator: 'calibrator' }[result.need];
                                const items = (result.choices || []).map(choice => ({
                                    label: String(choice),
                                    click: async () => {
                                        closeMenu();
                                        const next = Object.assign({}, options || {});
                                        next[optionKey] = result.need === 'reference' ? [choice] : choice;
                                        await run(next);
                                    }
                                }));
                                items.push({ label: 'Cancel', click: closeMenu });
                                pt.showMenuWithTitle(result.title || 'ΔΔCt analysis', items);
                                return;
                            }

                            const drawn = [];
                            for (const spec of (result.tables || [])) drawn.push(await drawTable(spec));
                            // One cell size across the tables this analysis produced.
                            try { if (drawn.length > 1) pt.normalizeTableCellSizes(drawn.filter(Boolean)); } catch (e) { }
                            // ...and the whole canvas laid out around them, nothing overlapping.
                            try { if (drawn.filter(Boolean).length > 1) await pt.layoutCompactTetris(); } catch (e) { }
                            const d = result.detection || {};
                            const summary = `ΔΔCt: ${(d.targets || []).join(', ')} normalised to ${(d.reference_targets || []).join(' + ')}, calibrator ${(d.calibrator || []).join(', ')}`;
                            pt.setMessage(summary, 1.1);
                            if (Array.isArray(result.notes) && result.notes.length) {
                                pt.setMessage(result.notes.join(' · '), 2);
                            }
                            const g = CurrentLayout.getStashed('graph');
                            if (g) g.touchMe();
                            if (drawn[0]) pt.zoomintoplate(drawn[0]);
                        };

                        await run({});
                    })
                })

                ai_create_file_items.push({
                    'label': 'Indication market', 'ionfunction': createIonFunction(async () => {
                        // Patient-population sizing for one or more indications, plus expansion
                        // indications the same approach could reach. py/analytics/indication-market.py
                        // researches with Claude + live web search (a few minutes) and returns finished
                        // value tables: <X>_Market, <X>_Expansion, <X>_Sources, <X>_Market_Summary.
                        // Every figure keeps its source, and sources the search never returned are
                        // marked "no - verify" so they are checked before going into a forecast.
                        const pt = pm.plateTrack;
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });
                        // A different worked prompt each time the panel opens (baja/analytics/
                        // indication-examples.js), never the same one twice in a row.
                        let txt = 'Transthyretin amyloidosis (polyneuropathy and cardiomyopathy), siRNA against TTR, United States';
                        try {
                            const pool = await exec('baja/analytics/indication-examples.js');
                            if (Array.isArray(pool) && pool.length) {
                                let k = Math.floor(Math.random() * pool.length);
                                if (pool.length > 1 && k === window.__bajaIndicationExampleLast) k = (k + 1) % pool.length;
                                window.__bajaIndicationExampleLast = k;
                                txt = pool[k];
                            }
                        } catch (e) { }
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 150);

                        const run = async (prompt) => {
                            pt.setMessage('Researching patient populations… this takes a few minutes', 5);
                            const em = new EngineMonitor((msg) => {
                                pt.updateSprite(msg)
                            });
                            let result;
                            try {
                                result = await exec('py/analytics/indication-market.py', em, prompt, {});
                            } catch (e) {
                                pt.killSprite();
                                pt.setMessage('Indication market failed: ' + (e && e.message ? e.message : e), 1.1);
                                return;
                            }
                            pt.killSprite();

                            if (!result || result.status !== 'ok') {
                                pt.setMessage((result && result.error) || 'Indication market failed', 1.1);
                                return;
                            }

                            const drawn = [];
                            for (const spec of (result.tables || [])) drawn.push(await drawValueTable(pt, spec));
                            // The market model: formula tables over one table of editable inputs
                            // (market size per indication and in total, cost to market, headline
                            // numbers), built the way the Project model is. A re-run replaces them.
                            let modelNote = '';
                            if (result.model && result.model.tables) {
                                try {
                                    for (const nm of (result.model.names || [])) {
                                        const old = (pt.root || []).find(p => p && p.name === nm);
                                        if (old) pt.removePlate(old);
                                    }
                                    const built = await exec('baja/draw/data-model-to-tables-gpt', pt, result.model);
                                    const rep = built && built.report ? built.report : null;
                                    const errs = rep ? [].concat(rep.errors || [], rep.missingValues || []) : [];
                                    if (errs.length) { modelNote = errs.length + ' model formula cell(s) did not resolve; see the console.'; console.log('[indication market] model report:', rep); }
                                } catch (e) { modelNote = 'The formula model could not be built: ' + (e && e.message || e); }
                                try { pt.updateCalculations(); } catch (e) { }
                            }
                            // The written part as a document object, not rows of a table.
                            try {
                                for (const d of (result.documents || [])) {
                                    if (d && d.html) await pt.addDocument(d.name || 'Notes', d.html, { width: 480, height: 360 });
                                }
                            } catch (e) { console.warn('[indication market] document', e); }
                            // The Competition tables go into a PUBLISHED OBJECT named Competition:
                            // the app's own folder for a set of tables. The object sits on the
                            // canvas as one card; opening it (its menu) loads the tables it holds.
                            // The loose tables are taken off the canvas once they are inside it.
                            try {
                                const compNames = new Set((result.tables || []).filter(t => t && t.group === 'Competition').map(t => t.name));
                                const comp = (pt.root || []).filter(p => p && compNames.has(p.name));
                                if (comp.length) {
                                    const HM = await exec('baja/history/HM');
                                    const Plate = await exec('baja/plate/plate.js');
                                    // The payload is a canvas holding just these tables: the track is
                                    // serialised with its root swapped for them, then put back.
                                    const keep = { root: pt.root, plots: pt.m_plots, glyphs: pt.glyphs };
                                    let payload = null;
                                    try {
                                        pt.root = comp; pt.m_plots = []; pt.glyphs = [];
                                        payload = compressbinaryData(compressString(HM(pt)));
                                    } finally { pt.root = keep.root; pt.m_plots = keep.plots; pt.glyphs = keep.glyphs; }
                                    if (payload) {
                                        for (const c of comp) { try { pt.removePlate(c); } catch (e) { } }
                                        const name = 'Competition';
                                        const prev = (pt.root || []).find(p => p && p.name === name && p.plateType === 'package');
                                        if (prev) { try { pt.removePlate(prev); } catch (e) { } }
                                        const pack = new Plate(name, 1, 1);
                                        pack.plateType = 'package';
                                        pack.completeNullValues();
                                        pack.setWellValue(0, 0, name);
                                        pack.wells[0][0].properties['package'] = payload;
                                        pack.setWellType(0, 0, 'PACKAGE');
                                        pack.grid.width = pt.grid.worldWidth(200);
                                        pack.grid.height = pt.grid.worldHeight(100);
                                        try { pt.addNextAvailableX(pack); } catch (e) { pt.root.push(pack); }
                                        if ((pt.root || []).indexOf(pack) < 0) pt.root.push(pack);
                                        pt.setMessage('Competition published as an object: ' + comp.length
                                            + (comp.length === 1 ? ' table' : ' tables') + ' inside it. Open it from its menu.', 3);
                                    }
                                }
                            } catch (e) { console.warn('[indication market] competition package', e); }
                            // Every table this build put on the canvas, the researched ones and the
                            // model's, on one cell size: they are read together, so they should
                            // sit on the same plane.
                            try {
                                const names = new Set([].concat(
                                    (result.tables || []).map(t => t.name),
                                    (result.model && result.model.names) || []));
                                const batch = (pt.root || []).filter(p => p && names.has(p.name));
                                if (batch.length > 1) pt.normalizeTableCellSizes(batch);
                            } catch (e) { }
                            // A pie of the patient populations: one slice per indication, primary
                            // and expansion together, sized by the addressable population. The
                            // tables carry the figures; this says at a glance where the patients
                            // are, which is the first question asked of a market sizing.
                            try {
                                const pops = (result.detection && result.detection.populations) || [];
                                if (pops.length > 1) {
                                    const MPlot = await exec('flexigraph/plot.js');
                                    const name = ((result.tables && result.tables[0] && result.tables[0].name) || 'Indication')
                                        .replace(/_Market.*$/, '').replace(/_/g, ' ') + ' — addressable patients';
                                    const old = (pt.m_plots || []).find(o => o && o.name === name);
                                    if (old && pt.removePlot) { try { pt.removePlot(old); } catch (e) { } }
                                    const points = pops.map((p) => ({
                                        name: (p.type === 'Expansion' ? p.name + ' (expansion)' : p.name),
                                        value: Math.max(0, Number(p.addressable) || 0), y: Math.max(0, Number(p.addressable) || 0)
                                    })).filter(p => p.value > 0);
                                    if (points.length > 1) {
                                        const plot = new MPlot({ points });
                                        plot.type = 'pie';
                                        plot.name = name;
                                        plot.fitScaleToData = false;
                                        plot.grid.setxmin(0); plot.grid.setxmax(1); plot.grid.setymin(0); plot.grid.setymax(1);
                                        plot.setWidth(pt.grid.worldWidth(420));
                                        plot.setHeight(pt.grid.worldHeight(300));
                                        pt.addPlot ? pt.addPlot(plot) : (pt.m_plots = (pt.m_plots || []).concat(plot));
                                    }
                                }
                            } catch (e) { console.warn('[indication market] population pie', e); }
                            // Spread every table so none sits on another, wait for the layout
                            // to settle, then zoom out, animated, until all of them are in view.
                            try { await pt.layoutCompactTetris(); } catch (e) { }
                            try { await pt.zoomtfit(); } catch (e) { }
                            const d = result.detection || {};
                            const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
                            const expansion = (d.expansion || []).length;
                            pt.setMessage(`${(d.requested || []).join(', ')}: ${fmt(d.addressable_requested)} addressable patients (${d.region || ''})`
                                + (expansion ? ` · ${expansion} expansion indication${expansion === 1 ? '' : 's'}, ${fmt(d.addressable_expansion)} more` : ''), 1.1);
                            if (!d.searched) {
                                pt.setMessage('Web search was unavailable: figures are from model knowledge and unverified.', 2);
                            }
                            if (modelNote) pt.setMessage(modelNote, 3);
                            const g = CurrentLayout.getStashed('graph');
                            if (g) g.touchMe();
                        };

                        let sequence_input = {
                            wid: 'card',
                            "height": "300px",
                            data: {
                                "style.padding-top": '1px',
                                "style.border": '1px',
                                "style.height": "200px",
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `
                                                <H4>
                                                      <font color="navy">
                                                Name a disease or a list of indications. Add the target, mechanism or modality and a region if you have them:
                                                </font> </h4>
                                                `
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "300px",
                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Run', ionFunction: createIonFunction(async () => {
                                                                // Read before the card is torn down; if the example is still
                                                                // typing, use the whole example rather than half of it.
                                                                const prompt = (initalText ? txt : sequenceTextEditor.getContent() || '').trim();
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                if (prompt.length < 2) {
                                                                    pt.setMessage('Enter a disease or a list of indications.', 1.1);
                                                                    return;
                                                                }
                                                                await run(prompt);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })




                ai_create_file_items.push({
                    'label': 'Build Analytics', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = 'Example:  Give me a timeline that describes key milestones for the discovery vaccines and add to this specific milestones for the discovery of the covid vaccine. ';
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 100);
                        }, 50);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                            })
                                                        },
                                                        {
                                                            label: 'Build tables', ionFunction: createIonFunction(async () => {

                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                                setTimeout(async () => {

                                                                    let interval = null;
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    let content = sequenceTextEditor.getContent();
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let model = await exec('py/openai/build-ddct-tables.py', em, content)

                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: JSON.stringify(model)
                                                                    })

                                                                    const plate_graph = pm;
                                                                    const pt = pm.plateTrack;

                                                                    exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model).then(async r => {
                                                                        plate_graph.plateTrack.setMessage(null)
                                                                        plate_graph.plateTrack.setMessage("These are the Assumptions! You will edit these.", 1)
                                                                        setTimeout(() => {
                                                                            plate_graph.plateTrack.killSprite()
                                                                            let pr = []
                                                                            let formula = []
                                                                            for (let p of plate_graph.plateTrack.root) {
                                                                                pr.push(p.toValueFormulaJSON())
                                                                                formula.push({ 'Table': p.name, 'HAS these assignments': p.getFormula() })
                                                                            }
                                                                            plate_graph.plateTrack.killSprite()

                                                                            let g = CurrentLayout.getStashed('graph')
                                                                            if (g)
                                                                                g.touchMe();

                                                                            pt.updateCalculations();
                                                                            setTimeout(async () => {
                                                                                let t = plate_graph.plateTrack.getTableByName('Assumptions')
                                                                                plate_graph.plateTrack.setMessage('PnL', 5)
                                                                                let ts = (t.toValueFormulaJSON())
                                                                                plate_graph.plateTrack.___formula_integrity_report = pnl;
                                                                            }, 1000)
                                                                        }, 3000)
                                                                        plate_graph.plateTrack.___formula_integrity_report = model;
                                                                    })

                                                                }, 1000)

                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })


                ai_create_file_items.push({
                    'label': 'Draw connections', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `The MAPK/ERK signaling pathway transmits growth signals from cell-surface receptors to the nucleus, coordinating how cells respond to their environment. When a ligand activates a receptor tyrosine kinase, a cascade of phosphorylation events amplifies the signal through RAS, RAF, MEK, and ERK. Once activated, ERK enters the nucleus to regulate genes that control cell division, survival, and differentiation. `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-connections-network.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const shape = Shape.fromSvgString(r.svg);

                                                                    const shapes = Shape.ungroupTop([shape], graph)

                                                                    let g = []
                                                                    for (let s of shapes) {
                                                                        const glyph = new Glyph(s);
                                                                        g.push(glyph)
                                                                    }
                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph)
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })



                ai_create_file_items.push({
                    'label': 'Molecule', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Create an siRNA that is ESC chemistry with a seed sequence of AAAAAAAA. `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-molecule.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const shape = Shape.fromSvgString(r.svg);
                                                                    const shapes = Shape.ungroupTop([shape], graph)
                                                                    debugger;
                                                                    let g = []
                                                                    for (let s of shapes) {
                                                                        const glyph = new Glyph(s);
                                                                        g.push(glyph)
                                                                    }
                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: JSON.stringify(g)
                                                                    })
                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph)
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })



                ai_create_file_items.push({
                    'label': 'siRNA', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `ACTACTATATCTATACTATACTATATAT `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')


                                                                function removeLongTextElements(svgString, maxLength = 10) {
                                                                    try {
                                                                        const parser = new DOMParser();
                                                                        const doc = parser.parseFromString(svgString, "image/svg+xml");

                                                                        const textElements = doc.querySelectorAll("text");

                                                                        textElements.forEach((el) => {
                                                                            const textContent = (el.textContent || "").trim();

                                                                            if (textContent.length > maxLength) {
                                                                                el.remove();
                                                                            }
                                                                        });

                                                                        const serializer = new XMLSerializer();
                                                                        return serializer.serializeToString(doc);
                                                                    } catch (err) {
                                                                        // If anything breaks, just return original SVG
                                                                        return svgString;
                                                                    }
                                                                }


                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-sirna.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const cleanedSvg = removeLongTextElements(r.svg);
                                                                    const shape = Shape.fromSvgString(cleanedSvg);
                                                                    const shapes = Shape.ungroupTop([shape], graph)

                                                                    let g = []
                                                                    for (let s of shapes) {
                                                                        const glyph = new Glyph(s);
                                                                        g.push(glyph)
                                                                    }

                                                                    // get the chains from the shapes 
                                                                    // const parseChains = await exec('cpd/parse-chains-from-svg.js')
                                                                    // const chains = parseChains((shapes))


                                                                    // for (let chain of chains) {
                                                                    //     let hr = await exec('py/openai/analytics/generate-svg-hairpin-from-chain.py', chain.hairpin_input);

                                                                    //     showModal({
                                                                    //         wid: 'json',
                                                                    //         data: JSON.stringify(hr)
                                                                    //     })

                                                                    // }
                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph)
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })
                // py\openai\analytics\generate-svg-small-molecule.py


                ai_create_file_items.push({
                    'label': 'ssASO', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Create an siRNA that is ESC chemistry with a seed sequence of AAAAAAAA. `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')






                                                                function removeLongTextElements(svgString, maxLength = 10) {
                                                                    try {
                                                                        const parser = new DOMParser();
                                                                        const doc = parser.parseFromString(svgString, "image/svg+xml");

                                                                        const textElements = doc.querySelectorAll("text");

                                                                        textElements.forEach((el) => {
                                                                            const textContent = (el.textContent || "").trim();

                                                                            if (textContent.length > maxLength) {
                                                                                el.remove();
                                                                            }
                                                                        });

                                                                        const serializer = new XMLSerializer();
                                                                        return serializer.serializeToString(doc);
                                                                    } catch (err) {
                                                                        // If anything breaks, just return original SVG
                                                                        return svgString;
                                                                    }
                                                                }


                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-ssASO.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const cleanedSvg = removeLongTextElements(r.svg);
                                                                    const shape = Shape.fromSvgString(cleanedSvg);
                                                                    const shapes = Shape.ungroupTop([shape], graph)

                                                                    let g = []
                                                                    for (let s of shapes) {
                                                                        const glyph = new Glyph(s);
                                                                        g.push(glyph)
                                                                    }

                                                                    // get the chains from the shapes 
                                                                    // const parseChains = await exec('cpd/parse-chains-from-svg.js')
                                                                    // const chains = parseChains((shapes))


                                                                    // for (let chain of chains) {
                                                                    //     let hr = await exec('py/openai/analytics/generate-svg-hairpin-from-chain.py', chain.hairpin_input);

                                                                    //     showModal({
                                                                    //         wid: 'json',
                                                                    //         data: JSON.stringify(hr)
                                                                    //     })

                                                                    // }
                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph)
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })





                ai_create_file_items.push({
                    'label': 'ssASO - Chirality', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `5'-SSRSSRSSOSSSOSSSRSS-3'. fC* fU* fC n001R fC* fG* fG n001R fU* fU* mC fU* mG* fA* mA fG* fG* fU* fG n001R fU* fU* fC. `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
5'-SSRSSRSSOSSSOSSSRSS-3'. fC* fU* fC n001R fC* fG* fG n001R fU* fU* mC fU* mG* fA* mA fG* fG* fU* fG n001R fU* fU* fC
                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')






                                                                function removeLongTextElements(svgString, maxLength = 10) {
                                                                    try {
                                                                        const parser = new DOMParser();
                                                                        const doc = parser.parseFromString(svgString, "image/svg+xml");

                                                                        const textElements = doc.querySelectorAll("text");

                                                                        textElements.forEach((el) => {
                                                                            const textContent = (el.textContent || "").trim();

                                                                            if (textContent.length > maxLength) {
                                                                                el.remove();
                                                                            }
                                                                        });

                                                                        const serializer = new XMLSerializer();
                                                                        return serializer.serializeToString(doc);
                                                                    } catch (err) {
                                                                        // If anything breaks, just return original SVG
                                                                        return svgString;
                                                                    }
                                                                }


                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-ssASO-chirality.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const cleanedSvg = removeLongTextElements(r.svg);
                                                                    const shape = Shape.fromSvgString(cleanedSvg);
                                                                    const shapes = Shape.ungroupTop([shape], graph)

                                                                    let g = []
                                                                    for (let s of shapes) {
                                                                        const glyph = new Glyph(s);
                                                                        g.push(glyph)
                                                                    }

                                                                    // get the chains from the shapes 
                                                                    // const parseChains = await exec('cpd/parse-chains-from-svg.js')
                                                                    // const chains = parseChains((shapes))


                                                                    // for (let chain of chains) {
                                                                    //     let hr = await exec('py/openai/analytics/generate-svg-hairpin-from-chain.py', chain.hairpin_input);

                                                                    //     showModal({
                                                                    //         wid: 'json',
                                                                    //         data: JSON.stringify(hr)
                                                                    //     })

                                                                    // }
                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph)
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })


                ai_create_file_items.push({
                    'label': 'Morpholino', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Create an siRNA that is ESC chemistry with a seed sequence of AAAAAAAA. `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')






                                                                function removeLongTextElements(svgString, maxLength = 10) {
                                                                    try {
                                                                        const parser = new DOMParser();
                                                                        const doc = parser.parseFromString(svgString, "image/svg+xml");

                                                                        const textElements = doc.querySelectorAll("text");

                                                                        textElements.forEach((el) => {
                                                                            const textContent = (el.textContent || "").trim();

                                                                            if (textContent.length > maxLength) {
                                                                                el.remove();
                                                                            }
                                                                        });

                                                                        const serializer = new XMLSerializer();
                                                                        return serializer.serializeToString(doc);
                                                                    } catch (err) {
                                                                        // If anything breaks, just return original SVG
                                                                        return svgString;
                                                                    }
                                                                }


                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-morpholino.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const cleanedSvg = removeLongTextElements(r.svg);
                                                                    const shape = Shape.fromSvgString(cleanedSvg);
                                                                    const shapes = Shape.ungroupTop([shape], graph)

                                                                    let g = []
                                                                    for (let s of shapes) {
                                                                        const glyph = new Glyph(s);
                                                                        g.push(glyph)
                                                                    }

                                                                    // get the chains from the shapes 
                                                                    // const parseChains = await exec('cpd/parse-chains-from-svg.js')
                                                                    // const chains = parseChains((shapes))


                                                                    // for (let chain of chains) {
                                                                    //     let hr = await exec('py/openai/analytics/generate-svg-hairpin-from-chain.py', chain.hairpin_input);

                                                                    //     showModal({
                                                                    //         wid: 'json',
                                                                    //         data: JSON.stringify(hr)
                                                                    //     })

                                                                    // }
                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph)
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })



                ai_create_file_items.push({
                    'label': 'SMILEs', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Give me the structure of asprin `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5);

                                                                    const r = await exec('py/openai/analytics/generate-svg-small-2Dmolecule.py', content);



                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: JSON.stringify(r)
                                                                    })




                                                                    const Shape = await exec('flexigraph/shapes/shape.js');
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    // const molfile = r.molfile;
                                                                    debugger;
                                                                    const shape = Shape.fromPathHeavySvgString(r.svg)
                                                                    // const shape = Shape.fromMolString(molfile, {
                                                                    //     mol: molfile,
                                                                    //     x: 0,
                                                                    //     y: 0,
                                                                    //     atomScale: 0.05,
                                                                    //     bondWidth: 0.8
                                                                    // });
                                                                    const glp = new Glyph(shape)
                                                                    shape.type = 'molecule';
                                                                    const g = [glp];


                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph);
                                                                    pm.plateTrack.killSprite();
                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })


                ai_create_file_items.push({
                    'label': 'SVG', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Give me the structure of asprin `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5);

                                                                    const r = await exec('py/openai/analytics/generate-svg.py', content);



                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: JSON.stringify(r)
                                                                    })




                                                                    const Shape = await exec('flexigraph/shapes/shape.js');
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    // const molfile = r.molfile;
                                                                    debugger;
                                                                    const shape = Shape.fromPathHeavySvgString(r.svg)
                                                                    // const shape = Shape.fromMolString(molfile, {
                                                                    //     mol: molfile,
                                                                    //     x: 0,
                                                                    //     y: 0,
                                                                    //     atomScale: 0.05,
                                                                    //     bondWidth: 0.8
                                                                    // });
                                                                    const glp = new Glyph(shape)
                                                                    shape.type = 'molecule';
                                                                    const g = [glp];


                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph);
                                                                    pm.plateTrack.killSprite();
                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })
                ai_create_file_items.push({
                    'label': 'High res SVG', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Give me the structure of asprin `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5);

                                                                    const r = await exec('py/openai/analytics/generate-svg.py', content);



                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: JSON.stringify(r)
                                                                    })




                                                                    const Shape = await exec('flexigraph/shapes/shape.js');
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    // const molfile = r.molfile;
                                                                    debugger;
                                                                    const shape = Shape.fromPathHeavySvgString(r.svg)
                                                                    // const shape = Shape.fromMolString(molfile, {
                                                                    //     mol: molfile,
                                                                    //     x: 0,
                                                                    //     y: 0,
                                                                    //     atomScale: 0.05,
                                                                    //     bondWidth: 0.8
                                                                    // });
                                                                    const glp = new Glyph(shape)
                                                                    shape.type = 'molecule';
                                                                    const g = [glp];


                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph);
                                                                    pm.plateTrack.killSprite();
                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })


                ai_create_file_items.push({
                    'label': 'Molecular mechanism', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Create an siRNA that is ESC chemistry with a seed sequence of AAAAAAAA. `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-molecular-mechanism.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const shape = Shape.fromSvgString(r.svg);
                                                                    const shapes = Shape.ungroupTop([shape], graph)
                                                                    debugger;
                                                                    let g = []
                                                                    for (let s of shapes) {
                                                                        const glyph = new Glyph(s);
                                                                        g.push(glyph)
                                                                    }
                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: JSON.stringify(g)
                                                                    })
                                                                    pm.plateTrack.addAllRelativeToCenter(g, graph)
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })






                ai_create_file_items.push({
                    'label': 'Draw genetic pathways', 'ionfunction': createIonFunction(async () => {
                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = ` `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';

                            const interval = setInterval(() => {

                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor?.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor?.setContent(currentText);
                                i++;

                                if (i >= txt.length) {
                                    clearInterval(interval);
                                }
                            }, 10);
                        }, 300);

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
                                                wid: 'html',
                                                data: `<hr>
<H4>
  <font color="navy">Write a short paragraph that describes the timeline you want to create. </font>
</H4>

                                                <hr>

                                                `
                                            }

                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: descHook,
                                                data: {
                                                    height: "500px",

                                                    showButton: false,
                                                    editorOptions: {
                                                        value: '',
                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                        suggestOnTriggerCharacters: false,
                                                        quickSuggestions: false,
                                                        parameterHints: { enabled: false },
                                                        minimap: { enabled: false },
                                                        fontFamily: "Courier New, monospace",
                                                        placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor?.setContent("")
                                                        initalText = false;
                                                    }),
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                        })
                                                    },
                                                }
                                            }
                                        },
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: '<hr>'
                                            }
                                        },
                                        {
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')
                                                            })
                                                        },
                                                        {
                                                            label: 'Build connections', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                CurrentLayout.reset('mainPanel')

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pm.plateTrack.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    pm.plateTrack.setMessage("Building model", 5)
                                                                    let r = await exec('py/openai/analytics/generate-svg-connections.py', content);
                                                                    let Shape = await exec('flexigraph/shapes/shape.js')
                                                                    const Glyph = await exec('baja/draw/glyph.js');
                                                                    const shape = Shape.fromSvgString(r.svg);
                                                                    const glyph = new Glyph(shape);
                                                                    pm.plateTrack.addGlyph(glyph);
                                                                    pm.plateTrack.killSprite();

                                                                }, 1000)
                                                            })
                                                        }

                                                    ]

                                                }
                                            }
                                        }
                                    ]

                                ]
                            }
                        }
                        CurrentLayout.setComponent('mainPanel', sequence_input)
                    })
                })

                ai_create_file_items.push(
                    {
                        'label': 'Templates', 'ionfunction': createIonFunction(async () => {
                            const templates = [
                                {
                                    label: 'Tables', click: (async () => {

                                        try {

                                            let tree = await exec('baja/table/datayak-analytics-tables', pm, graph)
                                            let treeStack = []
                                            const renderTree = async (nodeList, panelName = 'mainPanel') => {
                                                nodeList = nodeList.filter(node => node !== null)
                                                if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                                let localNodeList = [...nodeList];
                                                if (treeStack.length > 0) {
                                                    localNodeList.push(
                                                        {
                                                            'label': 'Back...',
                                                            click: () => {
                                                                if (treeStack.length > 0) {
                                                                    setTimeout(async () => {
                                                                        tree = treeStack.pop();
                                                                        await renderTree(tree, panelName);
                                                                        return;
                                                                    }, 500)
                                                                }
                                                            }
                                                        })

                                                }

                                                localNodeList.push(
                                                    {
                                                        'label': 'Close',
                                                        click: async () => {
                                                            CurrentLayout.reset(panelName);
                                                        }
                                                    })
                                                const buildDesc = async (items) => {
                                                    let descl = {}

                                                    for (let i of items) {
                                                        if (i.path) {
                                                            try {

                                                                let pp = removeLastFileNode(i.path)

                                                                let r = await load_file('/baja/templates/' + pp, i.label + '.desc');
                                                                if (r && r.rule_value)
                                                                    i.desc = r.rule_value;
                                                            } catch (exception) { }
                                                            if (i && i.desc) {
                                                                descl[i.label] = i.desc
                                                            }
                                                        }
                                                    }
                                                    return descl;
                                                }
                                                localNodeList = cleanTree(localNodeList)
                                                let its = await buildDesc(localNodeList)

                                                let component = {
                                                    wid: 'selection-list',
                                                    data: {
                                                        single_selection: true,
                                                        show_button: false,
                                                        singleSelect: true,
                                                        contentItems: its,
                                                        listItems: localNodeList.map(item => item.label),
                                                        button_function: createIonFunction(async (items) => {
                                                            let selectedLabel = items[0];
                                                            let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                            if (selectedItem.click) {
                                                                await selectedItem.click();
                                                            }
                                                            CurrentLayout.reset(panelName);
                                                            if (selectedItem.children && selectedItem.children.length > 0) {
                                                                treeStack.push(nodeList);

                                                                tree = selectedItem.children.filter(node => node !== null)
                                                                tree = cleanTree(tree);
                                                                await renderTree(tree, panelName);
                                                            } else {

                                                            }
                                                        })
                                                    }
                                                };
                                                CurrentLayout.clearComponent(panelName);
                                                CurrentLayout.setComponent(panelName, component);
                                            }

                                            setTimeout(async () => {
                                                tree = cleanTree(tree);
                                                await renderTree(tree)
                                            }, 200)
                                        } catch (exception) { }

                                    })
                                },

                                {
                                    label: 'Models', click: (async () => {
                                        try {
                                            let tree = await exec('baja/table/datayak-analytics-models', pm, graph)
                                            let treeStack = []
                                            const renderTree = async (nodeList, panelName = 'mainPanel') => {
                                                nodeList = nodeList.filter(node => node !== null)
                                                if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                                let localNodeList = [...nodeList];

                                                if (treeStack.length > 0) {
                                                    localNodeList.push(
                                                        {
                                                            'label': 'Back...',
                                                            click: () => {
                                                                if (treeStack.length > 0) {
                                                                    setTimeout(async () => {
                                                                        tree = treeStack.pop();
                                                                        await renderTree(tree, panelName);
                                                                        return;
                                                                    }, 500)
                                                                }
                                                            }
                                                        })

                                                }

                                                localNodeList.push(
                                                    {
                                                        'label': 'Close',
                                                        click: async () => {
                                                            CurrentLayout.reset(panelName);
                                                        }
                                                    })
                                                const buildDesc = async (items) => {
                                                    let descl = {}

                                                    for (let i of items) {
                                                        if (i.path) {
                                                            try {

                                                                let pp = removeLastFileNode(i.path)

                                                                let r = await load_file('/baja/templates/' + pp, i.label + '.desc');
                                                                if (r && r.rule_value)
                                                                    i.desc = r.rule_value;
                                                            } catch (exception) { }
                                                            if (i && i.desc) {
                                                                descl[i.label] = i.desc
                                                            }
                                                        }
                                                    }
                                                    return descl;
                                                }
                                                localNodeList = cleanTree(localNodeList)
                                                let its = await buildDesc(localNodeList)

                                                let component = {
                                                    wid: 'selection-list',
                                                    data: {
                                                        single_selection: true,
                                                        show_button: false,
                                                        singleSelect: true,
                                                        contentItems: its,
                                                        listItems: localNodeList.map(item => item.label),
                                                        button_function: createIonFunction(async (items) => {
                                                            let selectedLabel = items[0];
                                                            let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                            if (selectedItem.click) {
                                                                await selectedItem.click();
                                                            }

                                                            CurrentLayout.reset(panelName);

                                                            if (selectedItem.children && selectedItem.children.length > 0) {
                                                                treeStack.push(nodeList);

                                                                tree = selectedItem.children.filter(node => node !== null)
                                                                tree = cleanTree(tree);
                                                                await renderTree(tree, panelName);
                                                            } else {

                                                            }
                                                        })
                                                    }
                                                };
                                                CurrentLayout.clearComponent(panelName);
                                                CurrentLayout.setComponent(panelName, component);
                                            }

                                            setTimeout(async () => {
                                                tree = cleanTree(tree);
                                                await renderTree(tree)
                                            }, 200)
                                        } catch (exception) { }

                                    })
                                },
                            ]
                            console.log(" show menu ")
                            graph.showWindowMenu(templates, 10, 10, 400)

                        })
                    })

                const pnl_timeline = () => {
                    const pt = pm.plateTrack;
                    pt.setMessage("Generating Timeline...", 5)
                    setTimeout(async () => {
                        ls = [
                        ]
                        for (let p of pm.plateTrack.root) {
                            ls.push(p.toValueUID())
                        }
                        let model5 = await exec('py/openai/cash-in-hand-vs-time-for-timeline.py', ls)
                        let v = await exec('baja/draw/data-model-to-tables-gpt', pt, model5, 'hidden')
                        const plotFactory = await exec('flexigraph/plot.js', MGrid);
                        const MPlot = (await plotFactory) || plotFactory;
                        pt.killSprite();
                        const getWellsFromJSON = (root, data) => {
                            const wellsList = Array.isArray(data?.wells) ? data.wells : [];
                            if (!Array.isArray(root) || !root.length) return [];
                            const plateMap = new Map();
                            for (const plate of root) {
                                const name = plate?.name || plate?.plate || plate?.id;
                                if (name) plateMap.set(String(name), plate);
                            }
                            const out = [];
                            for (const w of wellsList) {
                                const plateName = w?.plate;
                                const plate = plateMap.get(plateName);
                                if (!plate || !Array.isArray(plate.wells)) continue;

                                const col = Number(w?.x) - 1;
                                const row = Number(w?.y) - 1;

                                if (row > 0) {

                                    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

                                    const colArr = plate.wells[col];
                                    if (!Array.isArray(colArr)) continue;

                                    const well = colArr[row];

                                    const rightColArr = plate.wells[col + 1][row];
                                    const right = Array.isArray(rightColArr) ? rightColArr[row] : null;

                                    if (well) {
                                        out.push(well);
                                        out.push(rightColArr);
                                    }
                                }
                            }

                            return out;
                        }

                        let wells = getWellsFromJSON(pm.plateTrack.root, model5)
                        for (let w of wells) {
                            w.selectIt();
                        }
                        pm.plateTrack.zoomouttoFit();
                        setTimeout(() => {
                            pm.plateTrack.setMessage("This is not a complete model but a good start...", 1)
                            setTimeout(() => {
                                pm.plateTrack.layoutCompactTetris();
                                setTimeout(() => {
                                    pm.plateTrack.setMessage("Green arrows are input contros. NOTE: Not all are used... ", 1)
                                    setTimeout(async () => {

                                        let MPlot = await exec('flexigraph/plot.js');

                                        function addMonths(date, months) {
                                            const d = new Date(date.getTime());
                                            d.setMonth(d.getMonth() + months);
                                            return d;
                                        }

                                        function toMillis(x) { return ensureDateUTC(x).getTime(); }
                                        function ensureDateUTC(x) {
                                            if (x instanceof Date) return new Date(x.getTime());
                                            if (x && typeof x === "object" && typeof x.date === "string")
                                                return parseHistoricalISOToDate(x.date);
                                            return typeof x === "string" ? parseHistoricalISOToDate(x) : new Date(x);
                                        }

                                        function millisToYear(ms) {
                                            return ms / (365.2425 * 24 * 3600 * 1000);
                                        }

                                        function formatTimeLabel(x, xMin, xMax, start, end) {

                                            const year = millisToYear(x);
                                            const yInt = Math.trunc(year);
                                            const absYear = Math.abs(yInt);
                                            const era = yInt < 0 ? " BCE" : "";
                                            return absYear + era;
                                        }

                                        function timeToX(time, xMin, xMax, start, end) {
                                            const totalCanvasRange = xMax - xMin;
                                            const startMs = toMillis(start);
                                            const endMs = toMillis(end);
                                            const totalTimeRange = endMs - startMs;
                                            const t = toMillis(time);
                                            const normalized = (t - startMs) / totalTimeRange;
                                            return xMin + normalized * totalCanvasRange;
                                        }
                                        function jdnFromYMD(y, m, d) {
                                            const a = Math.floor((14 - m) / 12);
                                            const y2 = y + 4800 - a;
                                            const m2 = m + 12 * a - 3;
                                            return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4)
                                                - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
                                        }

                                        function parseProlepticDate(isoString) {
                                            if (typeof isoString !== "string") return new Date(NaN);

                                            isoString = isoString.replace(/\u2212|−/g, "-").trim();

                                            const m = isoString.match(
                                                /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
                                            );
                                            if (!m) {

                                                const d = new Date(isoString);
                                                return isNaN(d) ? new Date(NaN) : d;
                                            }

                                            const year = parseInt(m[1], 10);
                                            const month1 = parseInt(m[2], 10);
                                            const day = parseInt(m[3], 10);
                                            const hour = m[4] ? parseInt(m[4], 10) : 0;
                                            const minute = m[5] ? parseInt(m[5], 10) : 0;
                                            const second = m[6] ? parseInt(m[6], 10) : 0;

                                            if (
                                                month1 < 1 || month1 > 12 ||
                                                day < 1 || day > 31 ||
                                                hour < 0 || hour > 23 ||
                                                minute < 0 || minute > 59 ||
                                                second < 0 || second > 59
                                            ) return new Date(NaN);

                                            const jdn = jdnFromYMD(year, month1, day);
                                            const epochJDN = 2440588;
                                            const secondsSinceEpoch = (jdn - epochJDN) * 86400 + (hour * 3600 + minute * 60 + second);
                                            const ms = secondsSinceEpoch * 1000;

                                            return new Date(ms);
                                        }

                                        const startDate = parseProlepticDate(model5.window.startDate);
                                        const endDate = parseProlepticDate(model5.window.endDate);

                                        const generateMilestones = (count = 20, callback, _formula) => {
                                            if (count <= 0) return [];
                                            let xmin = 0;
                                            let xmax = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
                                            const nMax = Math.max(1, count);
                                            const startMs0 = startDate.getTime();
                                            const endMs0 = endDate.getTime();
                                            const startMs = Math.min(startMs0, endMs0);
                                            const endMs = Math.max(startMs0, endMs0);
                                            const totalMs = endMs - startMs;
                                            if (totalMs === 0) {
                                                const xDate = new Date(startMs);
                                                return [{
                                                    x: timeToX(xDate, xmin, xmax, startDate, endDate),
                                                    date: xDate,
                                                    formula: _formula,
                                                    y: 1,
                                                    t: 0,
                                                    type: "milestone",
                                                    name: formatTimeLabel(xDate)
                                                }];
                                            }
                                            const MS_PER_DAY = 24 * 60 * 60 * 1000;
                                            const wholeDays = Math.floor(totalMs / MS_PER_DAY);
                                            let n;
                                            let stepMs;
                                            if (wholeDays + 1 <= nMax) {
                                                n = wholeDays + 1;
                                                stepMs = MS_PER_DAY;
                                            } else {
                                                n = nMax;
                                                stepMs = totalMs / (n - 1);
                                            }
                                            const points = [];
                                            for (let i = 0; i < n; i++) {
                                                const xDate = new Date(startMs + stepMs * i);
                                                const y = 1
                                                points.push({
                                                    x: timeToX(xDate, xmin, xmax, startDate, endDate),
                                                    date: xDate,
                                                    formula: _formula,
                                                    y,
                                                    t: n === 1 ? 0 : i / (n - 1),
                                                    type: "milestone",
                                                    name: y + ''
                                                });
                                            }
                                            return points;
                                        };
                                        const milestones = generateMilestones(50, (point, plot, pt) => {
                                            if (point.formula) {

                                                let f = point.formula.replace(/eval\s*\[\s*t_years\s*\]/gi, point.x);
                                                exec('baja/plate/ops/frun-object.js', f, pt).then(v => point.y)
                                                return v;
                                            }
                                            return 0.01001;
                                        }, model5.formulas["Cash_vs_Time[1:1][1:1]"])
                                        const plot = new MPlot({ points: milestones });
                                        plot.type = 'timeline';
                                        plot.name = generateNautName();
                                        plot.startDate = startDate;
                                        plot.endDate = endDate;
                                        const xs = milestones.map(p => p.x);
                                        const xMin = xs.length ? Math.min(...xs) : startDate.getTime();
                                        const xMax = xs.length ? Math.max(...xs) : endDate.getTime();
                                        plot.points = milestones;
                                        const ys = milestones.map(p => p.y).filter(v => Number.isFinite(v));
                                        const yMin = ys.length ? Math.min(...ys) : 0;
                                        const yMax = ys.length ? Math.max(...ys) : 1;
                                        const yPad = (yMax - yMin) * 0.1 || 1;
                                        plot.grid.zoom(xMin, xMax, yMin - yPad, yMax + yPad);
                                        plot.grid.rescale();
                                        const baseYMin = ys.length ? Math.min(...ys) : 0;
                                        const baseYMax = ys.length ? Math.max(...ys) : 1;
                                        plot.grid.zoom(xMin, xMax, baseYMin - yPad, baseYMax + yPad);
                                        plot.setWidth(pt.grid.worldWidth(400))
                                        plot.setHeight(pt.grid.worldHeight(200))
                                        plot.name = generateNautName();
                                        plot.x_axis_label = "Time (quarters from start)";
                                        plot.y_axis_label = "Cashflow";
                                        plot.fitScaleToData = false;
                                        plot.grid.rescale();
                                        await pm.plateTrack.panToNextSpot(pt.grid.screenWidth(800))
                                        await pm.plateTrack.setPlotCenter(plot)
                                        pt.updateCalculations();
                                        await pt.layoutCompactTetris();
                                        pm.plateTrack.setMessage("Green arrows are input controls. NOTE: Not all are used...", 1);
                                    })
                                }, 4000)

                            }, 1000)

                        }, 1000)

                    }, 200)

                }



                var result = await verifyUserPath('cpd/bajabio-analytics', 'publisher');
                if (result.allowed) {
                    let publicNewsPublish = async () => {
                        let canvas = CurrentLayout.getStashed('graph-canvas');
                        if (canvas.canvas) {
                            canvas = canvas.canvas;
                        }
                        let domCanvas = canvas.getElement ? canvas.getElement() : canvas;
                        let pngBase64 = domCanvas.nativeElement.toDataURL('image/png');
                        console.log(pngBase64);
                        let im = pngBase64.replace(/^data:image\/png;base64,/, '');
                        if (pm.plateTrack && im) {
                            await exec('manchester/io/save-as-obj-tp-internal-news.js', graph, genegraph_panel_layout, path, '/app/cpd/baja-analytics', im)
                        } else {
                            await exec('manchester/io/save-as-obj-tp-internal-news.js', graph, genegraph_panel_layout, path, '/app/cpd/baja-analytics')
                        }
                    }

                }

            }

            let editor;
            let innerComponentCallback__ = createIon((_panel) => {
                editor = _panel;
                if (editor) {
                    editor.setContent('')

                }
            })
            let editor2;
            let innerComponentCallback2 = createIon((_panel) => {
                editor2 = _panel;
            })

            function isArrayofArrays(variable) {
                return Array.isArray(variable) && variable.every(Array.isArray);
            }
            let new_plate_panel;
            let __nameHook___ = createIonFunction((ed) => {
                new_plate_panel = ed;
            });
            let new_type_panel;
            let __nameHook2 = createIonFunction((ed) => {
                new_type_panel = ed;
            });

            let yakfoldernames = [
                {
                    'label': 'Package current workspace', 'click': async () => {
                        graph.graph.canvas.canvas.nativeElement.focus();
                        const a = await exec('baja/package/trackpackyak', graph, pm.plateTrack);
                    }
                },
                {
                    'label': 'Cancel', 'click': async () => {
                        CurrentLayout.reset('mainPanel');
                    }
                }

            ]
            const cleanTree = (tree) => {
                if (!Array.isArray(tree)) return [];

                return tree
                    .filter(node => node !== null && node !== 'null' && typeof node === 'object')
                    .map(node => {
                        if (Array.isArray(node.children)) {
                            node.children = cleanTree(node.children);
                        }
                        return node;
                    })
                    .filter(node => {

                        return !(Array.isArray(node.children) && node.children.length === 0);
                    });
            };
            let m__ = [
                {
                    label: `Bookmarks`,
                    click: (xwc, ywc) => {
                        const pt = pm.plateTrack;

                        let keys = Object.keys(pt.bookmarks);
                        let bm = []

                        for (let key of keys) {
                            bm.push({
                                label: `${key}`,
                                click: (xwc, ywc) => {

                                    setTimeout(() => {
                                        pt.setMessage(key)
                                        pt.goToBookmark(pt.bookmarks[key])
                                    }, 1000)
                                    CurrentLayout.reset('mainPanel')
                                }
                            })
                        }
                        graph.showWindowMenu(bm, 10, 10, 400)
                    }
                },
                {
                    label: `Tables`,
                    click: (xwc, ywc) => {
                        const pt = pm.plateTrack;
                        let bm = []
                        const vp = pt.getTablesAndPlots();
                        for (let v of vp) {
                            if (v.wells && v.wells.length > 0) {
                                bm.push({
                                    label: `${v.name}`,
                                    click: (xwc, ywc) => {
                                        setTimeout(() => {
                                            pt.zoomintoplate(v)
                                            pt.setSelected(v);
                                            pt.menu_vis = false;
                                        }, 100)
                                    },
                                }
                                )

                            } else {
                            }
                        }
                        graph.showWindowMenu(bm, 10, 10, 400)
                    }
                },
                {
                    label: `Timeline`,
                    click: (xwc, ywc) => {
                        const pt = pm.plateTrack;
                        let bm = []
                        const vp = pt.getTablesAndPlots();
                        for (let v of vp) {
                            if (v.type && v.type === 'timeline') {
                                bm.push({
                                    label: `${v.name}`,
                                    click: (xwc, ywc) => {
                                        setTimeout(() => {
                                            pt.zoomintoplate(v)
                                            pt.setSelected(v);
                                            pt.menu_vis = false;
                                        }, 100)
                                    },
                                }
                                )

                            } else {
                            }
                        }
                        graph.showWindowMenu(bm, 10, 10, 400)
                    }
                },

                {
                    label: 'Box-zoom', click: (async () => {
                        let currentShape = null;
                        const plate_graph = graph;
                        let Rectangle = await exec('flexigraph/shapes/rect.js')
                        let md = false;
                        pm.plateTrack.setMessage(" click and drag a rectangle ")
                        let mouseDownListener = async (x, y) => {
                            currentShape = new Rectangle('test', plate_graph.plateTrack.grid.Xwc(x), plate_graph.plateTrack.grid.Ywc(y));
                            currentShape.visible = true;
                            md = true;
                        }
                        let mouseMoveListener = (x, y) => {
                            if (!md) {
                                currentShape = null;
                                return;
                            }
                            if (currentShape) {
                                currentShape.update(plate_graph.plateTrack.grid.Xwc(x), plate_graph.plateTrack.grid.Ywc(y))
                            }
                        }
                        let mouseUpListener = async (x, y) => {
                            if (currentShape) {
                                let sw = plate_graph.plateTrack.grid.screenWidth(currentShape.w);
                                let sh = plate_graph.plateTrack.grid.screenHeight(currentShape.h);
                                if (sw < 20 || sh < 20) {
                                    currentShape = null;
                                    plate_graph.plateTrack.wb(null)
                                    return;
                                }
                                AnimateGrid.INTERUPT = false;
                                let ag = new AnimateGrid(plate_graph.plateTrack.grid);
                                await ag.animateTo((currentShape.x), currentShape.x + currentShape.w,
                                    currentShape.y - currentShape.h, currentShape.y, 10)

                                setTimeout(async () => {

                                    plate_graph.plateTrack.wb(null)

                                }, 1000)

                            }
                            currentShape = null;
                            md = false;
                        }
                        let t = {
                            id: 'override-box',
                            priority: true,
                            close: () => {

                            },
                            mouseMoveListener: mouseMoveListener,
                            mouseUpListener: mouseUpListener,
                            mouseDownListener: mouseDownListener,
                            draw: (grid, ctx) => {
                                if (currentShape && currentShape.draw != null) {
                                    currentShape.draw(grid, ctx)
                                }

                            },
                        }
                        plate_graph.plateTrack.wb(t)
                        plate_graph.plateTrack.wb(t)
                    }), icon: '/assets/img/icons/png/box-zoom.svg', draw: (grid, ctx, mo, md, img) => {
                        drawRoundedRectIcon(12, grid, ctx, mo, md, img)

                    }

                },

                {
                    label: 'voice', click: (async () => {
                        plate_graph.plateTrack.wb(t)
                    }), icon: '/assets/img/icons/recording.png', draw: (grid, ctx, mo, md, img) => {
                        drawRoundedRectIcon(12, grid, ctx, mo, md, img)
                    }

                },

                {
                    label: `Zoom out`,
                    click: (xwc, ywc) => {
                        zoomout();
                    }
                },
                {
                    label: `Zoom in`,
                    click: (xwc, ywc) => {
                        zoomin();
                    }
                },

            ]

            let interpreter = await exec('baja/engine/interpreter.js', pm.plateTrack)

            try { refreshBuildLibrary(); } catch (e) { }   // the builders are all pushed by now
            let top_menubar = {
            }


            top_menubar = {
                'width': '100%',
                'component': {
                    wid: 'menu',
                    data: {

                        menus: [
                            {
                                'label': 'Build', 'items': ai_create_file_items
                            },
                            {
                                // Live co-editing: share by email, and while a shared document is open,
                                // copy its link or save it where both people work.
                                label: 'Share',
                                items: [
                                    {
                                        label: 'Share for co-editing…', ionfunction: createIonFunction(async () => {
                                            await exec('baja/plate/collab/share-for-coediting.js', pm.plateTrack, graph, pm)
                                        })
                                    },
                                    {
                                        label: 'Copy co-editing link', ionfunction: createIonFunction(async () => {
                                            const url = pm.plateTrack.__collabShareUrl;
                                            if (!url) {
                                                pm.plateTrack.setMessage('Share the document with someone first; the link is created then.', 1);
                                                await exec('baja/plate/collab/share-for-coediting.js', pm.plateTrack, graph, pm);
                                                return;
                                            }
                                            try { await navigator.clipboard.writeText(url); pm.plateTrack.setMessage('Link copied: ' + url, 2); }
                                            catch (e) { pm.plateTrack.setMessage(url, 1); }
                                        })
                                    },
                                    {
                                        label: 'Save shared document', ionfunction: createIonFunction(async () => {
                                            if (!(pm.plateTrack.__collab && pm.plateTrack.__collabDoc)) {
                                                pm.plateTrack.setMessage('This document is not shared yet. Use Share for co-editing first.', 1);
                                                return;
                                            }
                                            try { await pm.plateTrack.__collab.save(graph); }
                                            catch (e) { pm.plateTrack.setMessage('Could not save the shared document: ' + (e && e.message ? e.message : e), 1); }
                                        })
                                    },
                                    {
                                        label: 'Who has access…', ionfunction: createIonFunction(async () => {
                                            await exec('baja/plate/collab/share-for-coediting.js', pm.plateTrack, graph, pm)
                                        })
                                    }
                                ]
                            },

                            drawMenu,

                            {
                                'label': 'Style', 'items': [

                                    {
                                        label: 'Themes & Backgrounds', ionfunction: createIonFunction(async () => {
                                            const scenes = await exec('baja/plate/plate-track-backgrounds')
                                            const names = Object.keys(scenes).filter(name => name !== '');

                                            names.push('Close')
                                            let t = {
                                                wid: 'selection-list',
                                                data: {
                                                    single_selection: true,
                                                    show_button: false,
                                                    singleSelect: true,
                                                    listItems: names,
                                                    button_function: createIonFunction(async (items) => {
                                                        let selectedLabel = items[0];
                                                        pm.plateTrack.background_function = scenes[selectedLabel]
                                                        CurrentLayout.reset('mainPanel')
                                                        hideAllModal();

                                                    })
                                                }
                                            };

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', t);

                                        })
                                    },

                                    {
                                        label: 'Resize Tables to defaults', ionfunction: createIonFunction(async () => {
                                            pm.plateTrack.resizePlatesToEqualizeCellSize();
                                        })
                                    },
                                    {
                                        label: 'Distribute Tables evenly', ionfunction: createIonFunction(async () => {

                                            pm.plateTrack.layoutCompactTetris();
                                        })
                                    },

                                    {
                                        label: 'Display Preferences', ionfunction: createIonFunction(async () => {

                                            const names = [
                                            ]
                                            let targetObject = pm.plateTrack;

                                            Object.keys(targetObject).forEach(key => {
                                                if (typeof targetObject[key] === 'boolean' && key.startsWith('attr__')) {
                                                    const label = key.replace(/^attr__/i, '').replace(/([A-Z])/g, ' $1').toLowerCase();
                                                    const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);
                                                    const actionLabel = targetObject[key] ? `Disable ${formattedLabel}` : `Enable ${formattedLabel}`;
                                                    names.push({ key, label: actionLabel });
                                                }
                                            });

                                            names.push({
                                                "label": "Close", "click": () => {
                                                    CurrentLayout.reset('mainPanel')
                                                    hideAllModal();
                                                }
                                            });

                                            let t = {
                                                wid: 'selection-list',
                                                data: {
                                                    single_selection: true,
                                                    show_button: false,
                                                    singleSelect: true,
                                                    listItems: names.map(item => item.label),
                                                    button_function: createIonFunction(async (items) => {
                                                        let selectedLabel = items[0];
                                                        let selectedItem = names.find(item => item.label === selectedLabel);

                                                        if (selectedItem) {
                                                            targetObject[selectedItem.key] = !targetObject[selectedItem.key];
                                                        }
                                                        CurrentLayout.reset('mainPanel')
                                                        hideAllModal();

                                                    })
                                                }
                                            };

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', t);

                                        })
                                    }

                                ]
                            },
                            {
                                'label': 'Ops', 'items': [
                                    {
                                        label: 'View workflow Stream...', ionfunction: createIonFunction(async () => {
                                            await exec('baja/table/show-flow', pm)

                                        })
                                    },
                                    {
                                        label: 'Open workflow', ionfunction: createIonFunction(async () => {
                                            let rs = await exec('manchester/io/open-workstream.js', pm)
                                            await exec('baja/table/show-flow-editor', rs)

                                        })
                                    },
                                    {
                                        label: 'Folders', ionfunction: createIonFunction(async () => {

                                            try {
                                                setTimeout(async () => {

                                                    let t = {
                                                        wid: 'selection-list',
                                                        data: {
                                                            single_selection: true,
                                                            show_button: false,
                                                            singleSelect: true,
                                                            listItems: yakfoldernames.map(item => item.label),
                                                            button_function: createIonFunction(async (items) => {
                                                                let selectedLabel = items[0];
                                                                let selectedItem = yakfoldernames.find(item => item.label === selectedLabel);

                                                                CurrentLayout.reset('mainPanel');
                                                                selectedItem.click()

                                                            })
                                                        }
                                                    };

                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', t);

                                                }, 1000)
                                            } catch (exception) { }

                                        })
                                    },
                                    {
                                        label: 'Publish', ionfunction: createIonFunction(async () => {
                                            try {
                                                setTimeout(async () => {
                                                    const plateTrack__ = pm.plateTrack;
                                                    let Plate = await exec('baja/plate/plate.js');
                                                    let attr_window = ''
                                                    let va = await prompt("Publish name: ", ["Name"], { "Name": attr_window }, 500, 300)
                                                    let HM = await exec('baja/history/HM')

                                                    let m = va['Name']
                                                    let plate = new Plate(m, 1, 1);
                                                    plate.plateType = 'package'
                                                    plate.completeNullValues();
                                                    let index = 0;

                                                    plate.setWellValue(0, index, m)
                                                    const stringData = compressbinaryData(compressString(HM(plateTrack__)))
                                                    plateTrack__.reset();
                                                    const rectWidth = plateTrack__.grid.worldWidth(200);
                                                    const rectHeight = plateTrack__.grid.worldHeight(100);

                                                    plate.wells[0][0].properties['package'] = stringData;
                                                    plate.setWellType(0, index, 'PACKAGE')
                                                    plate.grid.width = (rectWidth);
                                                    plate.grid.height = (rectHeight);
                                                    plate.grid.xi = (plateTrack__.grid.Xwc(plateTrack__.grid.width / 2) - rectWidth);
                                                    plate.grid.yi = plateTrack__.grid.Ywc(plateTrack__.grid.height / 2);
                                                    setTimeout(() => {
                                                        plateTrack__.root.push(plate);
                                                        pm.plateTrack.zoomintoplate(plate)
                                                    }, 1000);

                                                }, 100)
                                            } catch (exception) { }

                                        })
                                    },
                                    {
                                        label: 'Add Formula', ionfunction: createIonFunction(async () => {
                                            pm.plateTrack.addFormulaUI();
                                        })
                                    },
                                    {
                                        label: 'Fix tables', ionfunction: createIonFunction(async () => {
                                            for (let r of pm.plateTrack.root) {
                                                r.attr__displayMenuButtons = false;
                                                r.attr__ShowTableName = true;
                                                r.attr__displayNumberValues = false;
                                                r.attr__RowAddRemoveButtons = false;
                                                r.attr__ShowFishEyeLense = false;
                                                r.attr__displayCellButtons = false;

                                            }

                                        })
                                    },
                                    {
                                        label: 'Un-fix tables', ionfunction: createIonFunction(async () => {
                                            for (let r of pm.plateTrack.root) {
                                                r.attr__displayMenuButtons = true;
                                                r.attr__ShowTableName = true;
                                                r.attr__displayNumberValues = true;
                                                r.attr__RowAddRemoveButtons = true;
                                                r.attr__ShowFishEyeLense = true;
                                                r.attr__displayCellButtons = true;

                                            }

                                        })
                                    },
                                    {
                                        label: 'Import DM (advanced)', ionfunction: createIonFunction(async () => {
                                            await exec('baja/draw/data-model-to-tables', pm.plateTrack)
                                        })
                                    },
                                    {
                                        label: 'Prune DM (advanced)', ionfunction: createIonFunction(async () => {
                                            let r = pm.plateTrack.root;
                                            r = r.filter((obj, index, self) =>
                                                index === self.findIndex(o => o.name === obj.name)
                                            );
                                            pm.plateTrack.root = r;

                                        })
                                    },

                                    {
                                        label: 'Run', ionfunction: createIonFunction(async () => {
                                            await exec('baja/table/show-flow-editor')
                                        })
                                    },
                                ]

                            },

                        ]
                    }
                }

            }

            genegraph_panel_layout = {
                wid: 'card',
                componentRef: 'geneGraphPanel',
                data: {
                    cards: [
                        [
                            // top_menubar,
                            {
                                'width': '100%',
                                'component': buttonMenuPanel
                            },
                            {
                                'width': '100%',
                                'component': geneGraph
                            }

                        ]]
                }

            }

            progressBar(100);
            graph.genegraph_panel_layout = genegraph_panel_layout;
            let main_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [
                        [

                            {
                                'width': '100%',
                                'height': '100vh',
                                'component': genegraph_panel_layout
                            }
                        ]]
                }
            }
            clear();
            showWidget(
                main_layout
            );
            CurrentLayout.stash('mainPanel', genegraph_panel_layout)

            // (The fixed ✕ that closed this workspace is gone: the application's own
            // navigation is the way out, and a button that discarded a session sat one
            // stray click away from the canvas.) Any left over from a previous session
            // on this page is removed.
            try { const __x = document.getElementById('baja-analytics-close'); if (__x && __x.parentNode) __x.parentNode.removeChild(__x); } catch (e) { }

            working.status = 'complete'
            let m = window['env']['theme']
            if (!m) {
                m = 'bajabio'
            }
            graph.setMessageCenter(m, 40)
            setTimeout(() => {
                graph.isPreviousState().then(r => {
                    if (r) {
                    }
                })
                if (wb)
                    wb(null)

                graph.setMessage('')
                graph.setMessageCenter(' bajabio ', 40)
                pm.plateTrack.__canvas__ = graph.graph.canvas;
                CurrentLayout.stash('graph-canvas', graph.graph.canvas)
                CurrentLayout.stash('plate-track', pm)
                CurrentLayout.stash('graph', graph)
            }, 1000)
        })

    })

}
