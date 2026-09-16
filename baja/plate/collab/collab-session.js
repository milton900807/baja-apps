function (pt, opts) {

    // LIVE CO-EDITING SESSION for a table workbook (plate track).
    //   pt.__collab = await exec('baja/plate/collab/collab-session.js', pt, { path, graph })
    //
    // Joins the document's room on the server (socket.io, same host as the API) and gives the
    // plate track:
    //   acquire(obj, label)  -> Promise<{ok, holder}>   claim a table / glyph / timeline before
    //                                                   editing it; refused when someone else has it
    //   release(obj)                                     hand it back (its latest state is sent first)
    //   isLockedByOther(uid) / lockHolder(uid)           what the overlay and the mouse code check
    //   broadcastObject(obj, kind) / broadcastRemove(uid, kind)
    //   drawOverlays(ctx)                                lock badges on objects, presence at the top
    //   save(graph)                                      write the shared file (/collab/save)
    //   destroy()
    // Remote changes arrive as docObjectUpdated and are applied through pt.collabApply(). The
    // session sends the objects it holds every few seconds when they changed, and once more on
    // release, so the other side is never more than a moment behind.
    return (async () => {
        const o = opts || {};
        const host = window['env']['apiUrl'];
        const me = ('' + (getUser() || '')).trim().toLowerCase();
        const docPath = '' + (o.path || '');
        const graph = o.graph || null;
        if (!pt || !docPath || !me) return null;

        // socket.io client: the server serves its own copy at /socket.io/socket.io.js.
        const loadIo = () => new Promise((resolve, reject) => {
            if (window.io) return resolve(window.io);
            const existing = document.getElementById('baja-socket-io-client');
            if (existing) { existing.addEventListener('load', () => resolve(window.io)); existing.addEventListener('error', reject); return; }
            const sc = document.createElement('script');
            sc.id = 'baja-socket-io-client';
            sc.src = host.replace(/\/+$/, '') + '/socket.io/socket.io.js';
            sc.onload = () => resolve(window.io);
            sc.onerror = () => reject(new Error('socket.io client did not load'));
            document.head.appendChild(sc);
        });
        let io;
        try { io = await loadIo(); } catch (e) { try { pt.setMessage('Live co-editing is unavailable: ' + e.message, 1); } catch (e2) { } return null; }
        const socket = io(host, { transports: ['websocket', 'polling'] });

        const session = {
            docPath, docId: null, me, socket,
            locks: {},            // objectId -> {user, label, since}
            users: [],            // [{user, since}]
            held: {},             // objectId -> { obj, kind, lastJson }
            remoteTouched: new Set(),   // uids changed by the other side since the last diff
            connected: false,
            destroyed: false,
            onState: null
        };

        const uidOf = (obj) => (obj && (obj.uid || obj.id)) ? ('' + (obj.uid || obj.id)) : null;
        const kindOf = (obj) => {
            if (!obj) return 'plate';
            // Timelines and charts are plots: they rebuild through MPlot.fromJSON, not as tables.
            if (typeof obj.drawPlot === 'function') return 'plot';
            if (obj.shape || obj.comment != null && obj.setText) return 'glyph';
            return 'plate';
        };
        const labelOf = (obj) => ('' + ((obj && (obj.name || obj.comment)) || kindOf(obj))).slice(0, 60);
        const snapshot = (obj) => {
            try { return JSON.stringify(typeof obj.toJSON === 'function' ? obj.toJSON() : obj); } catch (e) { return null; }
        };
        const wake = () => { try { if (graph && graph.wake) graph.wake(); } catch (e) { } };
        const shortName = (email) => ('' + (email || '')).split('@')[0];

        // ---- joining --------------------------------------------------------------------
        const join = () => new Promise((resolve) => {
            socket.emit('joinDoc', { path: docPath, user: me }, (r) => {
                if (r && r.ok) {
                    session.docId = r.docId;
                    session.locks = r.locks || {};
                    session.users = r.users || [];
                    session.connected = true;
                    // Re-claim what we held before a reconnect.
                    for (const id of Object.keys(session.held)) {
                        socket.emit('lockObject', { docId: session.docId, objectId: id, label: labelOf(session.held[id].obj) }, () => { });
                    }
                    resolve(true);
                } else {
                    session.connected = false;
                    try { pt.setMessage(r && r.error === 'no_access' ? 'You do not have access to co-edit this document.' : 'Could not join the live session.', 1); } catch (e) { }
                    resolve(false);
                }
                wake();
            });
        });
        socket.on('connect', () => { join(); });
        socket.on('disconnect', () => { session.connected = false; wake(); });
        socket.on('docState', (st) => {
            if (!st || st.docId !== session.docId) return;
            session.locks = st.locks || {};
            session.users = st.users || [];
            try { if (typeof session.onState === 'function') session.onState(st); } catch (e) { }
            wake();
        });
        socket.on('docObjectUpdated', async (u) => {
            if (!u || u.docId !== session.docId) return;
            if (session.held[u.objectId]) return;      // ours: never let a stale echo overwrite it
            session.remoteTouched.add('' + u.objectId);   // the diff below must not echo it back
            try {
                if (typeof pt.collabApply === 'function') await pt.collabApply(u.kind, u.objectId, u.state, u.user);
            } catch (e) { console.warn('collab apply failed', e); }
            wake();
        });
        socket.on('docSaved', (d) => {
            if (!d || d.docId !== session.docId || d.user === me) return;
            try { pt.setMessage(shortName(d.user) + ' saved the shared document', 2); } catch (e) { }
        });

        // ---- locks ----------------------------------------------------------------------
        session.lockHolder = (uid) => {
            const l = session.locks[uid];
            return l ? l : null;
        };
        session.isLockedByOther = (uid) => {
            const l = session.locks[uid];
            return !!(l && l.user && l.user.toLowerCase() !== me);
        };
        session.acquire = (obj, label) => new Promise((resolve) => {
            const uid = uidOf(obj);
            if (!uid) return resolve({ ok: true });
            if (!session.connected || !session.docId) return resolve({ ok: true, offline: true });
            socket.emit('lockObject', { docId: session.docId, objectId: uid, label: label || labelOf(obj) }, (r) => {
                if (r && r.ok) {
                    session.held[uid] = { obj, kind: kindOf(obj), lastJson: snapshot(obj) };
                    resolve({ ok: true });
                } else {
                    resolve({ ok: false, holder: (r && r.holder) || session.lockHolder(uid) });
                }
                wake();
            });
        });
        session.release = (obj) => {
            const uid = uidOf(obj);
            if (!uid || !session.held[uid]) return;
            session.broadcastObject(obj, session.held[uid].kind);
            delete session.held[uid];
            if (session.connected && session.docId) socket.emit('unlockObject', { docId: session.docId, objectId: uid });
        };
        session.releaseAll = () => { for (const id of Object.keys(session.held)) session.release(session.held[id].obj); };
        session.holds = (obj) => { const uid = uidOf(obj); return !!(uid && session.held[uid]); };

        // ---- sync -----------------------------------------------------------------------
        session.broadcastObject = (obj, kind) => {
            session.dirty = true;   // this client changed something: the autosave will write it
            const uid = uidOf(obj);
            if (!uid || !session.connected || !session.docId) return;
            let state = null;
            try { state = typeof obj.toJSON === 'function' ? obj.toJSON() : obj; } catch (e) { return; }
            socket.emit('docObjectUpdate', { docId: session.docId, objectId: uid, kind: kind || kindOf(obj), state });
            if (session.held[uid]) session.held[uid].lastJson = snapshot(obj);
        };
        session.broadcastRemove = (uid, kind) => {
            session.dirty = true;
            if (!uid || !session.connected || !session.docId) return;
            delete session.held[uid];
            socket.emit('docObjectUpdate', { docId: session.docId, objectId: '' + uid, kind: 'remove', state: { kind: kind || 'plate' } });
        };
        // Whatever is selected or active is what the user is working on. Claim it if the
        // hooks missed the path that selected it (timelines are picked up several ways), and
        // let go of held tables and plots that are no longer selected so others can take them.
        const pendingAcq = {};
        const reconcile = () => {
            for (const cand of [pt.selectedPlate, pt.activePlot]) {
                const uid = uidOf(cand);
                if (!cand || !uid || session.held[uid] || pendingAcq[uid] || session.isLockedByOther(uid)) continue;
                pendingAcq[uid] = true;
                session.acquire(cand).then(() => { delete pendingAcq[uid]; }, () => { delete pendingAcq[uid]; });
            }
            for (const id of Object.keys(session.held)) {
                const h = session.held[id];
                if (h.kind === 'glyph') continue;
                if (h.obj !== pt.selectedPlate && h.obj !== pt.activePlot) session.release(h.obj);
            }
        };
        // Objects that appear or vanish without going through a hook: a chart or table just
        // created, a plot removed by code that splices the list directly. The first diff after
        // joining only records what is there; after that, a new object is sent once and a
        // missing one is announced as removed. Arrivals from the other side are skipped.
        const known = new Map();   // uid -> kind
        let seeded = false;
        const currentObjects = () => {
            const cur = new Map();
            try { for (const p of pt.root || []) { const id = uidOf(p); if (id) cur.set(id, { obj: p, kind: 'plate' }); } } catch (e) { }
            try { for (const m of pt.m_plots || []) { const id = uidOf(m); if (id) cur.set(id, { obj: m, kind: 'plot' }); } } catch (e) { }
            try { for (const g of pt.glyphs || []) { const id = uidOf(g); if (id) cur.set(id, { obj: g, kind: 'glyph' }); } } catch (e) { }
            return cur;
        };
        const diffObjects = () => {
            const cur = currentObjects();
            if (!seeded) { for (const [id, e] of cur) known.set(id, e.kind); seeded = true; session.remoteTouched.clear(); return; }
            for (const [id, e] of cur) {
                if (known.has(id)) continue;
                known.set(id, e.kind);
                if (session.remoteTouched.has(id) || session.isLockedByOther(id)) continue;
                session.broadcastObject(e.obj, e.kind);
            }
            for (const [id, kind] of Array.from(known.entries())) {
                if (cur.has(id)) continue;
                known.delete(id);
                if (session.remoteTouched.has(id)) continue;
                session.broadcastRemove(id, kind);
            }
            session.remoteTouched.clear();
        };
        const ticker = setInterval(() => {
            if (session.destroyed || !session.connected) return;
            try { diffObjects(); } catch (e) { }
            try { reconcile(); } catch (e) { }
            for (const id of Object.keys(session.held)) {
                const h = session.held[id];
                const now = snapshot(h.obj);
                if (now && now !== h.lastJson) session.broadcastObject(h.obj, h.kind);
            }
        }, 1500);

        // ---- save -----------------------------------------------------------------------
        session.save = async (g, opts) => {
            const quiet = !!(opts && opts.quiet);
            const target = g || graph;
            if (!target) throw new Error('nothing to save');
            const seen = new WeakSet();
            const value = JSON.stringify(target, function (key, v) {
                if (key === 'canvas') return;
                if (key != null && ('' + key).toLowerCase().startsWith('_')) return null;
                if (typeof v === 'object' && v !== null) {
                    if (Array.isArray(v) && v.every((e) => e && typeof e === 'object' && 'x' in e && 'y' in e)) return v;
                    if (v.x != null && v.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) return v;
                    if (seen.has(v)) return '[a_c]';
                    seen.add(v);
                }
                return v;
            });
            const r = await POSTJSON({ user: me, path: docPath, value }, host + '/collab/save');
            if (!r || r.status !== 'saved') throw new Error((r && r.error) || 'save failed');
            session.dirty = false;
            session.lastSavedAt = Date.now();
            if (!quiet) { try { pt.setMessage('Saved the shared document', 2); } catch (e) { } }
            return r;
        };

        // ---- background autosave --------------------------------------------------------
        // Every 20 seconds, if THIS client changed something since the last save, the shared
        // document is written in the background. It waits for an idle moment, skips while a
        // cell or note is being edited, never runs two saves at once, and says nothing unless
        // a save fails. Other clients save their own changes, so nothing is written twice.
        session.dirty = false;
        session.saving = false;
        const AUTOSAVE_MS = 20000;
        const editing = () => {
            try { if (pt.isTextActive && pt.isTextActive()) return true; } catch (e) { }
            try { if (document.getElementById('baja-mobile-cell-input')) return true; } catch (e) { }
            try { if (pt.selectedPlate && pt.selectedPlate.textActive && pt.selected_well) return true; } catch (e) { }
            return false;
        };
        const autosave = () => {
            if (!session.dirty || session.saving || !session.connected || !docPath) return;
            if (editing()) return;   // try again next tick, after the edit
            const run = async () => {
                if (session.saving || !session.dirty) return;
                session.saving = true;
                try { await session.save(graph, { quiet: true }); }
                catch (e) { session.__autosaveFails = (session.__autosaveFails || 0) + 1; if (session.__autosaveFails === 3) { try { pt.setMessage('The shared document could not be saved in the background. Use Save shared document.', 3); } catch (x) { } } }
                finally { session.saving = false; }
            };
            if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { run(); }, { timeout: 5000 });
            else setTimeout(run, 0);
        };
        session.__autosaveTimer = setInterval(autosave, AUTOSAVE_MS);
        // A last chance on the way out: a synchronous beacon with the current document.
        session.__onLeave = () => {
            try {
                if (!session.dirty || !docPath) return;
                const seen = new WeakSet();
                const value = JSON.stringify(graph, function (key, v) {
                    if (key === 'canvas') return;
                    if (key != null && ('' + key).toLowerCase().startsWith('_')) return null;
                    if (typeof v === 'object' && v !== null) { if (seen.has(v)) return '[a_c]'; seen.add(v); }
                    return v;
                });
                navigator.sendBeacon(host + '/collab/save', new Blob([JSON.stringify({ user: me, path: docPath, value })], { type: 'application/json' }));
            } catch (e) { }
        };
        try { window.addEventListener('pagehide', session.__onLeave); } catch (e) { }

        // ---- overlays -------------------------------------------------------------------
        const NAVY = '#0a2540', CYAN = '#1aa3bd', ORANGE = '#FD5E53';
        const rr = (ctx, x, y, w, h, r) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
        };
        const screenBox = (obj) => {
            try {
                // A plot (timeline) keeps its grid in SCREEN space, refreshed each frame by
                // drawPlot; a table's grid is in world space and is mapped through pt.grid.
                if (typeof obj.drawPlot === 'function' && obj.grid && obj.grid.xi != null) {
                    const x = obj.grid.xi, y = obj.grid.yi, w = obj.grid.width, h = obj.grid.height;
                    if ([x, y, w, h].every(Number.isFinite)) return { x, y, w, h };
                    const g = pt.grid;
                    const x2 = g.X(obj.x), y2 = g.Y(obj.y), w2 = g.screenWidth(obj.w), h2 = g.screenHeight(obj.h);
                    if ([x2, y2, w2, h2].every(Number.isFinite)) return { x: x2, y: y2, w: w2, h: h2 };
                    return null;
                }
                if (obj.grid && obj.grid.xi != null) {
                    const g = pt.grid;
                    const x = g.X(obj.grid.xi), y = g.Y(obj.grid.yi + obj.grid.height);
                    const w = g.screenWidth(obj.grid.width), h = g.screenHeight(obj.grid.height);
                    if ([x, y, w, h].every(Number.isFinite)) return { x, y, w, h };
                }
                if (obj.shape && obj.shape.getX) {
                    const s = obj.shape, g = pt.grid;
                    const x = g.X(s.getX()), y = g.Y(s.getY());
                    const w = g.screenWidth(s.getXf() - s.getX()), h = g.screenHeight(s.getY() - s.getYf());
                    if ([x, y, w, h].every(Number.isFinite)) return { x, y, w: Math.abs(w), h: Math.abs(h) };
                }
            } catch (e) { }
            return null;
        };
        const findObject = (uid) => {
            try {
                for (const p of pt.root || []) if (p && ('' + p.uid) === uid) return p;
                for (const g of pt.glyphs || []) if (g && ('' + g.uid) === uid) return g;
                for (const m of pt.m_plots || []) if (m && ('' + m.uid) === uid) return m;
            } catch (e) { }
            return null;
        };
        const badge = (ctx, x, y, text, fill, ink) => {
            ctx.save();
            ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
            const w = Math.ceil(ctx.measureText(text).width) + 18, h = 20;
            ctx.shadowColor = 'rgba(10,37,64,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
            ctx.fillStyle = fill; rr(ctx, x, y, w, h, 10); ctx.fill();
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
            ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(text, x + 9, y + h / 2 + 0.5);
            ctx.restore();
            return w;
        };
        // A padlock in a small disc: the mark of your own lock. No words, the outline says
        // the rest; a badge with a name is kept for locks held by someone else.
        const lockIcon = (ctx, x, y, fill) => {
            const r = 11, cx = x + r, cy = y + r;
            ctx.save();
            ctx.shadowColor = 'rgba(10,37,64,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
            ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
            // shackle
            ctx.beginPath(); ctx.arc(cx, cy - 1.5, 3.2, Math.PI, 0); ctx.stroke();
            // body
            rr(ctx, cx - 4.5, cy - 1.5, 9, 7, 1.5); ctx.fill();
            ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, cy + 2, 1.1, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            return 2 * r;
        };
        session.drawOverlays = (ctx) => {
            if (!ctx || session.destroyed) return;
            const ids = Object.keys(session.locks);
            // Maximized: only the maximized object's own lock is shown. Outlines and badges
            // of the other objects belong to a workbench the user is not looking at.
            const maxed = pt.__maximized || null;
            for (const uid of ids) {
                const l = session.locks[uid];
                const obj = findObject(uid);
                if (!obj) continue;
                if (maxed && obj !== maxed) continue;
                const box = screenBox(obj);
                if (!box) continue;
                const mine = l.user && l.user.toLowerCase() === me;
                ctx.save();
                ctx.lineWidth = 2;
                ctx.setLineDash(mine ? [] : [6, 4]);
                ctx.strokeStyle = mine ? CYAN : ORANGE;
                rr(ctx, box.x - 3, box.y - 3, box.w + 6, box.h + 6, 8);
                ctx.stroke();
                ctx.restore();
                if (!mine) badge(ctx, box.x - 3, box.y - 26, '🔒 ' + shortName(l.user) + ' is editing', ORANGE, '#ffffff');
                else lockIcon(ctx, box.x - 3, box.y - 27, CYAN);   // yours: just the padlock
            }
            // Presence: everyone in the document, top right.
            const others = (session.users || []).filter(u => u && u.user && u.user.toLowerCase() !== me);
            const label = session.connected
                ? (others.length ? ('Live with ' + others.map(u => shortName(u.user)).join(', ')) : 'Live (only you)')
                : 'Live session offline';
            const w = (() => { ctx.save(); ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; const t = ctx.measureText(label).width; ctx.restore(); return Math.ceil(t) + 30; })();
            // Below the maximize title bar when one is showing, so it never covers the
            // Menu and Exit controls at that bar's right end.
            const x = ctx.canvas.width - w - 16, y = pt.__maximized ? 56 : 16;
            ctx.save();
            ctx.shadowColor = 'rgba(10,37,64,0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
            ctx.fillStyle = 'rgba(255,255,255,0.97)'; rr(ctx, x, y, w, 24, 12); ctx.fill();
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = 'rgba(10,37,64,0.14)'; ctx.lineWidth = 1; rr(ctx, x, y, w, 24, 12); ctx.stroke();
            ctx.fillStyle = session.connected ? '#16a34a' : '#9ca3af';
            ctx.beginPath(); ctx.arc(x + 13, y + 12, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = NAVY; ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(label, x + 23, y + 12.5);
            ctx.restore();
        };

        session.destroy = () => {
            try { clearInterval(session.__autosaveTimer); } catch (e) { }
            try { window.removeEventListener('pagehide', session.__onLeave); } catch (e) { }
            try { if (session.dirty) session.__onLeave(); } catch (e) { }
            session.destroyed = true;
            clearInterval(ticker);
            try { session.releaseAll(); } catch (e) { }
            try { if (session.docId) socket.emit('leaveDoc', { docId: session.docId }); } catch (e) { }
            try { socket.disconnect(); } catch (e) { }
        };
        try { window.addEventListener('beforeunload', () => { try { session.destroy(); } catch (e) { } }); } catch (e) { }

        if (socket.connected) await join();
        return session;
    })();
}
