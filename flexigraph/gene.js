function (progress) {

    return new Promise(async (resolve, reject) => {
        if (progress) {
            progress(5)
        }
        const ORANGE = "rgba(255, 140, 0, 1)";
        let CanvasToSVGProxy = await exec('flexigraph/svg-canvas.js')
        const HM = await exec('baja/history/HM.js')
        let Oligo = await exec('flexigraph/oligo.js')
        let MGrid = await exec('flexigraph/grid.js')
        if (progress) {
            progress(7)
        }

        let gg = null;

        let shapes = await exec('flexigraph/gene-draw.js')

        let ChemTemplate = await exec('flexigraph/chem.js')
        let Menu;
        if (isMobile()) {
            Menu = await exec('flexigraph/menu-m.js')
        } else {
            Menu = await exec('flexigraph/menu.js')

        }

        let Annotation = await exec('flexigraph/annotation.js')
        if (progress) {
            progress(10)
        }

        let { Track, TrackRef } = await exec('baja/bio/track.js')
        if (progress) {
            progress(15)
        }
        let PCAPlot = await exec("flexigraph/pca-plot.js");
        let MPlot = await exec("flexigraph/plot.js");

        let TrackLayer = await exec('baja/bio/track-layer.js')
        if (progress) {
            progress(17)
        }

        let RectangleText = await exec('flexigraph/shapes/Rect-text.js')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let Oval = await exec('flexigraph/shapes/oval.js')
        if (progress) {
            progress(20)
        }
        let Rectangle = await exec('flexigraph/shapes/rect.js')
        let Line = await exec('flexigraph/shapes/line.js')

        let Folder = await exec('flexigraph/shapes/folder.js');

        let { Citation, CitationItem } = await exec('flexigraph/shapes/citation.js')
        let TrackPlot = await exec('flexigraph/track-plot.js')

        if (progress) {
            progress(30)
        }
        if (progress) {
            progress(35)
        }
        class StateProps {
            selected_chemistry;
            filters = [];
            rules = [];
        }

        document.addEventListener('keydown', async (event) => {

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

            const seen = new WeakSet();

            function scan(obj) {
                if (!obj || typeof obj !== "object") return null;

                if (seen.has(obj)) return null;
                seen.add(obj);

                if (Object.prototype.hasOwnProperty.call(obj, "uid") && obj.uid === uidValue) {
                    return obj;
                }

                if (Array.isArray(obj)) {
                    for (let i = 0; i < obj.length; i++) {
                        const res = scan(obj[i]);
                        if (res) return res;
                    }
                    return null;
                }

                for (const key of Object.keys(obj)) {
                    const res = scan(obj[key]);
                    if (res) return res;
                }

                return null;
            }

            return scan(objects);
        }

        async function reconstituteObject(originalObject, jsonObject) {

            if (!jsonObject || typeof jsonObject !== "object" || !originalObject) return;

            if (originalObject instanceof GeneGraph) {
                await originalObject.update(jsonObject);
                return;
            }

            for (const key of Object.keys(jsonObject)) {
                const jsonValue = jsonObject[key];
                const originalValue = originalObject[key];

                if (jsonValue === null || typeof jsonValue !== "object") {
                    if (originalValue !== jsonValue) {
                        originalObject[key] = jsonValue;
                    }
                    continue;
                }

                if (key === "grid" && originalValue instanceof MGrid) {
                    for (const gk of Object.keys(jsonValue)) {
                        if (originalValue[gk] !== jsonValue[gk]) {
                            originalValue[gk] = jsonValue[gk];
                        }
                    }
                    continue;
                }

                if (key === "wells" && Array.isArray(jsonValue)) {
                    if (!Array.isArray(originalValue)) originalObject[key] = [];
                    const wells = originalObject[key];

                    for (let col = 0; col < jsonValue.length; col++) {
                        if (!Array.isArray(wells[col])) wells[col] = [];

                        for (let row = 0; row < jsonValue[col].length; row++) {
                            const jsonWell = jsonValue[col][row];
                            const existing = wells[col][row];

                            if (jsonWell === null || typeof jsonWell !== "object") {
                                if (existing !== jsonWell) wells[col][row] = jsonWell;
                                continue;
                            }

                            if (!(existing instanceof GenericWell)) {
                                wells[col][row] = new GenericWell(
                                    jsonWell.name,
                                    jsonWell.value,
                                    jsonWell.obj,
                                    jsonWell.group
                                );
                            }

                            const targetWell = wells[col][row];
                            for (const wk of Object.keys(jsonWell)) {
                                const jv = jsonWell[wk];
                                const ov = targetWell[wk];

                                if (jv === null || typeof jv !== "object") {
                                    if (ov !== jv) targetWell[wk] = jv;
                                } else {
                                    if (!ov || typeof ov !== "object") {
                                        targetWell[wk] = Array.isArray(jv) ? [] : {};
                                    }
                                    await reconstituteObject(targetWell[wk], jv);
                                }
                            }
                        }
                    }

                    continue;
                }

                if (!originalValue || typeof originalValue !== "object") {
                    originalObject[key] = Array.isArray(jsonValue) ? [] : {};
                }

                await reconstituteObject(originalObject[key], jsonValue);
            }
        }

        let redo = []
        let handleUndo = async () => {
            let gs;
            gs = await popHistory()
            if (!gs) {
                return;
            }
            if (gs.uid) {
                let ob = findObjectWithUid([gg], gs.uid)
                if (ob) {
                    redo.push(HM(ob))
                    reconstituteObject(ob, gs)
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
                        let ob = findObjectWithUid([this], gs.uid)
                        if (ob) {
                            pushHistory(HM(ob))
                            reconstituteObject(ob, gs)
                        }
                    }
                }

            }
        }

        function safeStringify(value, depth = 2) {
            const seen = new WeakSet();
            function _s(v, d) {
                if (v === null || typeof v !== "object") return v;
                if (seen.has(v)) return "[Circular]";
                if (d <= 0) return Array.isArray(v) ? "[Array]" : "[Object]";
                seen.add(v);
                if (Array.isArray(v)) return v.map((x) => _s(x, d - 1));
                const out = {};
                for (const k of Object.keys(v)) {
                    try { out[k] = _s(v[k], d - 1); } catch { out[k] = "[Unserializable]"; }
                }
                return out;
            }
            try { return JSON.stringify(_s(value, depth), null, 2); } catch { return "[Unstringifiable]"; }
        }

        function describeListener(fn) {
            let src = "";
            try {
                src = (fn && typeof fn.toString === "function") ? fn.toString() : String(fn);
                if (src.length > 400) src = src.slice(0, 400) + " …<truncated>";
            } catch {
                src = "[unable to read source]";
            }
            const ownProps = (() => {
                try { return Object.keys(fn || {}); } catch { return []; }
            })();
            return {
                type: typeof fn,
                name: (fn && fn.name) || "(anonymous)",
                ownProps,
                sourcePreview: src
            };
        }

        function captureSwipes(element, callback) {
            let startX, startY, startTime;

            const threshold = 50;
            const allowedTime = 200;

            function start(e) {
                const touch = e.touches ? e.touches[0] : e;
                startX = touch.clientX;
                startY = touch.clientY;
                startTime = Date.now();
            }

            function end(e) {
                const touch = e.changedTouches ? e.changedTouches[0] : e;
                const distX = touch.clientX - startX;
                const distY = touch.clientY - startY;
                const elapsedTime = Date.now() - startTime;

                if (elapsedTime <= allowedTime) {
                    if (Math.abs(distX) >= threshold && Math.abs(distY) < Math.abs(distX)) {
                        callback(distX > 0 ? "right" : "left");
                    } else if (Math.abs(distY) >= threshold && Math.abs(distX) < Math.abs(distY)) {
                        callback(distY > 0 ? "down" : "up");
                    }
                }
            }

            element.addEventListener("touchstart", start, { passive: true });
            element.addEventListener("mousedown", start);

            element.addEventListener("touchend", end);
            element.addEventListener("mouseup", end);
        }

        function _parseColorToRGBA(color) {
            if (!color) return { r: 20, g: 20, b: 20, a: 1 };

            let m = String(color).match(/^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
            if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };

            m = String(color).match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
            if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };

            m = String(color).match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
            if (m) {
                const hex = m[1];
                if (hex.length === 3) {
                    const r = parseInt(hex[0] + hex[0], 16);
                    const g = parseInt(hex[1] + hex[1], 16);
                    const b = parseInt(hex[2] + hex[2], 16);
                    return { r, g, b, a: 1 };
                }
                if (hex.length === 6) {
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    return { r, g, b, a: 1 };
                }
                if (hex.length === 8) {
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    const a = parseInt(hex.slice(6, 8), 16) / 255;
                    return { r, g, b, a };
                }
            }

            return { r: 20, g: 20, b: 20, a: 1 };
        }

        function _rgbaString({ r, g, b, a }) {

            const aa = Math.max(0, Math.min(1, a));
            return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${aa})`;
        }

        function _ensureMenuFadeState(self) {
            if (self.__sideMenuFadeState) return;

            self.__sideMenuFadeState = {
                wasPresent: false,
                alpha: 0,
                target: 0,
                speed: 0.12,
                baseBgRGBA: null
            };
        }

        function _stepSideMenuFade(self, isPresentNow) {
            _ensureMenuFadeState(self);
            const st = self.__sideMenuFadeState;

            if (isPresentNow && !st.wasPresent) {
                st.target = 1;

                const currentBg = (self.side_menu && self.side_menu.bg) ? self.side_menu.bg : 'rgba(20,20,20,1)';
                st.baseBgRGBA = _parseColorToRGBA(currentBg);

                st.alpha = 0;
            }

            if (!isPresentNow && st.wasPresent) {
                st.target = 0;
            }

            if (st.alpha < st.target) st.alpha = Math.min(st.target, st.alpha + st.speed);
            if (st.alpha > st.target) st.alpha = Math.max(st.target, st.alpha - st.speed);

            st.wasPresent = isPresentNow;

            return st;
        }

        function _applySideMenuBgAlpha(self, alpha) {
            _ensureMenuFadeState(self);
            const st = self.__sideMenuFadeState;
            const base = st.baseBgRGBA || _parseColorToRGBA(self.side_menu?.bg || 'rgba(20,20,20,1)');
            const out = { ...base, a: alpha };
            if (self.side_menu) self.side_menu.bg = _rgbaString(out);
        }

        function roundRectPath(ctx, x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }

        class FinancialCalcSpriteWithStatus {
            constructor(
                x,
                y,
                scale = 1,
                {
                    messages = [],
                    messageMinDelay = 5,
                    messageMaxDelay = 20,
                    onAllMessagesShown = null,

                    totalMemoryBytes = 2 * 1024 * 1024 * 1024,
                    label = 'Memory loading',

                    showTimer = true,
                    timerPrefix = 'Time',
                    timerFont = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                    timerColor = 'rgba(0,0,0,0.6)',
                    timerOffsetY = 36,

                    initialNote = 'hold on... crunching the numbers...',
                    initialNoteDuration = 2000,
                    estimatedTotalSeconds = 60,
                    showProgressBarDuringNote = false,
                    doneMessage = 'loading results...',

                    badgeRadius = 16,
                    badgeFill = '#111',
                    badgeStroke = 'rgba(0,0,0,0.15)',
                    badgeStrokeWidth = 1,
                    badgeText = 'LJ',
                    badgeTextColor = '#ffffff',
                    badgeFont = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                } = {}
            ) {
                this.x = x;
                this.y = y;
                this.scale = scale;

                this.t = 0;
                this._barPhase = Math.random() * Math.PI * 2;

                this.messages = Array.isArray(messages) ? messages.slice() : [];
                this.messageMinDelay = Math.max(0, Number(messageMinDelay) || 5);
                this.messageMaxDelay = Math.max(this.messageMinDelay, Number(messageMaxDelay) || 20);
                this.msgIndex = this.messages.length > 0 ? 0 : -1;
                this.currentStatus = this.msgIndex >= 0 ? this.messages[this.msgIndex] : '';
                this._prevMsgAt = 0;
                this._nextMsgAt = this.msgIndex >= 0 ? this._nextMessageTime() : Infinity;
                this._doneMsgs = this.msgIndex >= 0 && this.messages.length === 1;
                this._notifiedMsgs = false;
                this.onAllMessagesShown = typeof onAllMessagesShown === 'function' ? onAllMessagesShown : null;

                this.totalMemoryBytes = Math.max(1, Number(totalMemoryBytes) || 2 * 1024 * 1024 * 1024);
                this.label = String(label || 'Memory loading');

                this.showTimer = !!showTimer;
                this.timerPrefix = String(timerPrefix || '');
                this.timerFont = String(timerFont);
                this.timerColor = String(timerColor);
                this.timerOffsetY = Number(timerOffsetY) || 36;

                this.initialNote = String(initialNote || 'This will take about a minute…');
                this.initialNoteMs = Math.max(0, Number(initialNoteDuration) || 0);
                this.etaSec = Math.max(1, Number(estimatedTotalSeconds) || 60);
                this.showProgressBarDuringNote = !!showProgressBarDuringNote;
                this.doneMessage = String(doneMessage || 'Done');

                this._noteShown = this.initialNoteMs > 0;
                this._progressStartT = 0;
                this._progress = 0;
                this._completed = false;

                this.badgeRadius = Number(badgeRadius) || 16;
                this.badgeFill = String(badgeFill);
                this.badgeStroke = String(badgeStroke);
                this.badgeStrokeWidth = Number(badgeStrokeWidth) || 1;
                this.badgeText = String(badgeText || 'LJ');
                this.badgeTextColor = String(badgeTextColor || '#fff');
                this.badgeFont = String(badgeFont);

                if (!this._noteShown) this._progressStartT = 0;
            }

            update(dt = 0.01) {
                this.t += dt;

                if (this._noteShown) {
                    if (this.t * 1000 >= this.initialNoteMs) {
                        this._noteShown = false;
                        this._progressStartT = this.t;
                    }
                } else if (!this._completed) {
                    const elapsed = Math.max(0, this.t - this._progressStartT);
                    this._progress = Math.min(1, elapsed / this.etaSec);
                    const f = this._progress;
                    this._progress = Math.min(1, f * f * (3 - 2 * f));
                    if (this._progress >= 1 && !this._completed) this._completed = true;
                }

                if (!this._noteShown && !this._doneMsgs && this.t >= this._nextMsgAt) {
                    const next = this.msgIndex + 1;
                    if (next < this.messages.length) {
                        this.msgIndex = next;
                        this._prevMsgAt = this.t;
                        this._nextMsgAt = this._nextMessageTime();
                        if (this.msgIndex === this.messages.length - 1) this._doneMsgs = true;
                    } else {
                        this._doneMsgs = true;
                    }
                }

                if (this._doneMsgs && !this._notifiedMsgs) {
                    this._notifiedMsgs = true;
                    if (this.onAllMessagesShown) {
                        try { this.onAllMessagesShown(); } catch { }
                    }
                }
            }

            draw(ctx) {

                const s = this.scale;
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.scale(s, s);

                const baseR = 36;
                const arcWidth = 6;
                const spin = this.t * 2.2;
                const sweep = Math.PI * 0.75;

                ctx.beginPath();
                ctx.arc(0, 0, baseR, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0,0,0,0.12)';
                ctx.lineWidth = arcWidth;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, baseR, spin, spin + sweep);
                ctx.strokeStyle = 'rgba(0,0,0,0.65)';
                ctx.lineWidth = arcWidth;
                ctx.lineCap = 'round';
                ctx.stroke();

                const orbits = 3;
                const orbitR = baseR + 10;
                for (let i = 0; i < orbits; i++) {
                    const a = spin * 1.4 + (i * Math.PI * 2) / orbits;
                    const px = Math.cos(a) * orbitR;
                    const py = Math.sin(a) * orbitR;
                    const sz = 4 + 2 * Math.sin(this.t * 3 + i);
                    ctx.beginPath();
                    ctx.arc(px, py, sz, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    ctx.fill();
                }

                this._drawBadge(ctx);

                const progress = this._progressValue();
                const barW = 140;
                const barH = 12;
                const barY = baseR + 22;
                const showBarNow = this.showProgressBarDuringNote ? true : !this._noteShown;

                if (showBarNow) {
                    this._drawRoundedRect(ctx, -barW / 2, barY, barW, barH, 6, 'rgba(0,0,0,0.12)', 1);
                    const fillW = Math.max(2, Math.floor(barW * progress));
                    this._fillRoundedRect(ctx, -barW / 2, barY, fillW, barH, 6, 'rgba(0,0,0,0.75)');

                    const segments = 7;
                    for (let i = 1; i < segments; i++) {
                        const tx = -barW / 2 + (barW * i) / segments;
                        ctx.beginPath();
                        ctx.moveTo(tx, barY);
                        ctx.lineTo(tx, barY + barH);
                        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }

                const baseY = barY + barH + 8;
                const statusY = baseY + 22;

                let statusText = '';
                if (this._noteShown) {
                    statusText = this.initialNote;
                } else if (!this._completed) {
                    statusText = this.messages.length > 0
                        ? (this.messages[this.msgIndex] || this.messages[this.messages.length - 1])
                        : this.label;
                } else {
                    statusText = this.doneMessage;
                }

                if (statusText) {
                    const font = '23px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
                    ctx.font = font;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    this._drawBlurryBackdrop(ctx, 0, statusY, statusText, {
                        font,
                        padX: 16,
                        padY: 10,
                        radius: 12,
                        blurPx: 10,
                        baseFill: 'rgba(255,255,255,0.72)',
                        blurFill: 'rgba(255,255,255,0.9)',
                        stroke: 'rgba(0,0,0,0.10)'
                    });

                    ctx.fillStyle = 'rgba(0,0,0,0.85)';
                    ctx.fillText(statusText, 0, statusY);
                }

                ctx.restore();
            }

            setMessages(messages) {
                this.messages = Array.isArray(messages) ? messages.slice() : [];
                this.msgIndex = this.messages.length > 0 ? 0 : -1;
                this.currentStatus = this.msgIndex >= 0 ? this.messages[this.msgIndex] : '';
                this._prevMsgAt = this.t;
                this._nextMsgAt = this.msgIndex >= 0 ? this._nextMessageTime() : Infinity;
                this._doneMsgs = this.msgIndex >= 0 && this.messages.length === 1;
                this._notifiedMsgs = false;
            }
            _drawBlurryBackdrop(ctx, cx, cy, text, {
                font = '23px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                padX = 14,
                padY = 8,
                radius = 10,
                blurPx = 8,
                baseFill = 'rgba(255,255,255,0.75)',
                blurFill = 'rgba(255,255,255,0.9)',
                stroke = 'rgba(0,0,0,0.08)',
                textFill = '#111'
            } = {}) {
                ctx.save();

                const prevFont = ctx.font;
                const prevFilter = ctx.filter;

                ctx.font = font;

                const m = ctx.measureText(text);
                const ascent = m.actualBoundingBoxAscent || 18;
                const descent = m.actualBoundingBoxDescent || 6;
                const textH = ascent + descent;
                const textW = Math.max(2, m.width);

                const x = cx - (textW / 2) - padX;
                const y = cy - (textH / 2) - padY;
                const w = textW + padX * 2;
                const h = textH + padY * 2;

                const t = ctx.getTransform();
                const scaleX = Math.hypot(t.a, t.b);
                const blurComp = blurPx / (scaleX || 1);

                ctx.filter = `blur(${blurComp}px)`;
                this._fillRoundedRect(ctx, x, y, w, h, radius, blurFill);

                ctx.filter = prevFilter || 'none';

                this._fillRoundedRect(ctx, x, y, w, h, radius, baseFill);
                if (stroke) this._drawRoundedRect(ctx, x, y, w, h, radius, stroke, 1);

                ctx.fillStyle = textFill;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, cx, cy);

                ctx.font = prevFont;
                ctx.restore();
            }

            _randDelay() {
                const min = this.messageMinDelay;
                const max = this.messageMaxDelay;
                return min + Math.random() * (max - min);
            }
            _nextMessageTime() {
                return this.t + this._randDelay();
            }

            _progressValue() {
                if (this._noteShown && !this.showProgressBarDuringNote) return 0;
                return this._progress;
            }

            _fmtTime(seconds) {
                const s = Math.max(0, Math.floor(seconds));
                const mm = Math.floor(s / 60);
                const ss = s % 60;
                return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
            }

            _drawBadge(ctx) {

                ctx.beginPath();
                ctx.arc(0, 0, this.badgeRadius, 0, Math.PI * 2);
                ctx.fillStyle = this.badgeFill;
                ctx.fill();

                if (this.badgeStrokeWidth > 0) {
                    ctx.strokeStyle = this.badgeStroke;
                    ctx.lineWidth = this.badgeStrokeWidth;
                    ctx.stroke();
                }

                ctx.font = this.badgeFont;
                ctx.fillStyle = this.badgeTextColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.badgeText, 0, 1);
            }

            _drawRoundedRect(ctx, x, y, w, h, r, strokeStyle, lineWidth = 1) {
                const rr = Math.min(r, h / 2, w / 2);
                ctx.beginPath();
                ctx.moveTo(x + rr, y);
                ctx.arcTo(x + w, y, x + w, y + h, rr);
                ctx.arcTo(x + w, y + h, x, y + h, rr);
                ctx.arcTo(x, y + h, x, y, rr);
                ctx.arcTo(x, y, x + w, y, rr);
                ctx.closePath();
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = lineWidth;
                ctx.stroke();
            }

            _fillRoundedRect(ctx, x, y, w, h, r, fillStyle) {
                if (w <= 0) return;
                const rr = Math.min(r, h / 2, Math.abs(w) / 2);
                ctx.beginPath();
                if (w >= 2 * rr) {
                    ctx.moveTo(x + rr, y);
                    ctx.arcTo(x + w, y, x + w, y + h, rr);
                    ctx.arcTo(x + w, y + h, x, y + h, rr);
                    ctx.arcTo(x, y + h, x, y, rr);
                    ctx.arcTo(x, y, x + rr, y, rr);
                } else {

                    const cx = x + w / 2;
                    const ry = h / 2;
                    const rx = Math.min(rr, Math.abs(w) / 2);
                    ctx.ellipse(cx, y + ry, Math.max(1, rx), ry, 0, 0, Math.PI * 2);
                }
                ctx.closePath();
                ctx.fillStyle = fillStyle;
                ctx.fill();
            }
        }

        function ampliconResultsToJson(ampliconResults) {
            const payload = {
                version: 1,
                savedAt: new Date().toISOString(),
                ampliconResults: ampliconResults ?? null,
            };
            return JSON.stringify(payload);
        }
        function saveAmpliconResults(key, ampliconResults) {
            const json = ampliconResultsToJson(ampliconResults);
            localStorage.setItem(key, json);
            return json;
        }

        function ampliconResultsFromJson(jsonOrObj) {
            const obj =
                typeof jsonOrObj === "string"
                    ? JSON.parse(jsonOrObj)
                    : (jsonOrObj ?? null);

            const res = obj?.ampliconResults ?? obj ?? null;

            const hits = Array.isArray(res?.hits) ? res.hits : [];

            return {

                ...(typeof res === "object" && res ? res : {}),

                hits,

                n_candidates: Number.isFinite(res?.n_candidates) ? res.n_candidates : hits.length,
                n_returned: Number.isFinite(res?.n_returned) ? res.n_returned : hits.length,
                ct_threshold_used: res?.ct_threshold_used ?? null,
                decision_threshold_star: res?.decision_threshold_star ?? null,
                transcript_id: res?.transcript_id ?? null,
                clean_len: res?.clean_len ?? null,
                params: (typeof res?.params === "object" && res?.params) ? res.params : {},
            };
        }

        function loadAmpliconResults(key) {
            const json = localStorage.getItem(key);
            if (!json) return null;
            return ampliconResultsFromJson(json);
        }

        let spriteObject = null;

        let GeneGraph = class GeneGraph {
            graph;
            center_paragraph_text = null
            ___captureSwipesSet = false;
            showSprite = false
            fontSize = 12;
            file = null;
            folder = null;
            parentId = null;
            props = new StateProps();
            strand;
            coords;
            ycoords;
            track = [];
            layers = [];
            listener;
            mouseListener;
            graphListener;
            mouseDownListener;
            mouseUpListener;
            mouseMoveListener;
            pinchListener;
            touchStart;
            touchEnd;
            wheel;
            dblclick;
            showHelp = false;
            touchMove;
            bookmarkMouseDownListener;
            bookmarkMouseUpListener;
            bookmarkMouseMoveListener;
            bookmarkhighlight = -1;
            chapterMouseDownListener;
            chapterMouseUpListener;
            chapterMouseMoveListener;
            elastic = true;
            mouseDown = false;
            select_ = false;
            mouseDownListeners = []
            mouseUpListeners = []
            mouseMoveListeners = []
            controlPanel;
            mode = 'gene'
            chem = [];
            plates = [];
            plots = []
            startX = 0;
            endX = 0;
            menu = null;
            bookmark_menu = null;
            currentShape;
            highlightObject;
            shapes = [];
            bookmarks = {}
            chapter_menu = null;
            showBookmarks = false;
            showChapters = false;
            xwc = -1;
            ywc = -1;
            initDwn;
            prev;
            message = null;
            preferences = {};
            selectedCompounds = []
            baseIndex = null;
            highlight_object;
            hx = 20;
            hy = 190;
            mousex = 0;
            mousey = 0;
            mouse_message = null;
            highlightmethod = null;
            showNavigationControl = true;
            showDisplay = true;
            highlight_feature = false;
            genegraph_panel_layout;
            initView = null;
            blick = '';
            messagex = 150;
            messagey = 25;
            error = null;
            md = false;
            paste_transient_;
            ts_transient_;
            animating = false;
            pauseDraw = false;
            post_graphics_modifications;
            ___folder_calculation = false;
            uid = uuid();

            _wrapLines(ctx, text, maxWidth) {

                const rawLines = String(text ?? "").split("\n");
                const out = [];

                for (const raw of rawLines) {

                    if (!raw.trim()) {
                        out.push("");
                        continue;
                    }

                    const words = raw.split(/\s+/);
                    let line = "";

                    for (const w of words) {
                        const test = line ? (line + " " + w) : w;
                        if (ctx.measureText(test).width <= maxWidth) {
                            line = test;
                        } else {
                            if (line) out.push(line);

                            let chunk = w;
                            while (ctx.measureText(chunk).width > maxWidth && chunk.length > 1) {
                                let cut = chunk.length - 1;
                                while (cut > 1 && ctx.measureText(chunk.slice(0, cut) + "…").width > maxWidth) {
                                    cut--;
                                }
                                out.push(chunk.slice(0, cut) + "…");
                                chunk = chunk.slice(cut);
                            }
                            line = chunk;
                        }
                    }
                    if (line) out.push(line);
                }

                return out;
            }

            _drawCenteredParagraph(ctx, text, opts = {}) {
                const canvasW = ctx.canvas.width;
                const canvasH = ctx.canvas.height;

                const maxParagraphWidth = Math.min(
                    opts.maxWidth ?? 300,
                    canvasW - (opts.marginX ?? 40)
                );

                const minFontSize = opts.minFontSize ?? 20;
                const maxFontSize = opts.maxFontSize ?? 44;
                const fontFamily = opts.fontFamily ?? "Arial";
                const lineHeightMult = opts.lineHeightMult ?? 1.25;

                const pad = opts.padding ?? 14;
                const maxBoxW = Math.min(maxParagraphWidth + pad * 2, canvasW - 20);
                const maxBoxH = canvasH - 20;

                let chosen = {
                    fontSize: minFontSize,
                    lines: [],
                    textW: 0,
                    textH: 0,
                    lineH: 0,
                };

                for (let fs = maxFontSize; fs >= minFontSize; fs--) {
                    ctx.font = `${fs}px ${fontFamily}`;
                    const lines = this._wrapLines(ctx, text, maxParagraphWidth);

                    let maxLineW = 0;
                    for (const ln of lines) {
                        maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
                    }

                    const lineH = fs * lineHeightMult;
                    const textH = lines.length * lineH;

                    const boxW = Math.min(maxLineW + pad * 2, maxBoxW);
                    const boxH = Math.min(textH + pad * 2, maxBoxH);

                    if ((maxLineW + pad * 2) <= maxBoxW && (textH + pad * 2) <= maxBoxH) {
                        chosen = { fontSize: fs, lines, textW: maxLineW, textH, lineH };
                        break;
                    }

                    if (fs === minFontSize) {
                        chosen = { fontSize: fs, lines, textW: maxLineW, textH, lineH };
                    }
                }

                const fs = chosen.fontSize;
                ctx.font = `${fs}px ${fontFamily}`;

                const boxW = Math.min(chosen.textW + pad * 2, maxBoxW);
                const boxH = Math.min(chosen.textH + pad * 2, maxBoxH);

                const boxX = Math.round((canvasW - boxW) / 2);
                const boxY = Math.round((canvasH - boxH) / 2);

                ctx.save();

                ctx.shadowColor = "rgba(0,0,0,0.35)";
                ctx.shadowBlur = 12;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 3;

                ctx.fillStyle = "rgba(255,255,255,0.92)";
                roundRectPath(ctx, boxX, boxY, boxW, boxH, 12);
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                ctx.fillStyle = opts.textColor ?? "black";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";

                ctx.beginPath();
                roundRectPath(ctx, boxX, boxY, boxW, boxH, 12);
                ctx.clip();

                const startX = boxX + pad;
                let y = boxY + pad;

                for (const ln of chosen.lines) {

                    if (!ln) {
                        y += chosen.lineH * 0.7;
                        continue;
                    }
                    ctx.fillText(ln, startX, y);
                    y += chosen.lineH;

                    if (y > boxY + boxH - pad) break;
                }

                ctx.restore();
            }

            async blurCanvasBackground(ctx, radius = 8) {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                if (!this._blurBuf || this._blurBuf.width !== w || this._blurBuf.height !== h) {
                    this._blurBuf = document.createElement('canvas');
                    this._blurBuf.width = w;
                    this._blurBuf.height = h;
                }
                const bctx = this._blurBuf.getContext('2d', { willReadFrequently: false });

                bctx.clearRect(0, 0, w, h);
                bctx.drawImage(ctx.canvas, 0, 0, w, h);

                ctx.save();
                ctx.clearRect(0, 0, w, h);

                ctx.filter = `blur(${radius}px)`;
                ctx.drawImage(this._blurBuf, 0, 0, w, h);
                ctx.filter = 'none';
                ctx.restore();
            }

            _simProgress(S) {
                if (!S || !S.x || !S.x1) return 0;

                const N = S.N | 0;
                let acc = 0, cnt = 0;

                for (let i = 0; i < N; i++) {
                    const d0 = this._hypot3(S.x0[i] - S.x1[i], S.y0[i] - S.y1[i], S.z0[i] - S.z1[i]) || 1e-6;
                    const dc = this._hypot3(S.x[i] - S.x1[i], S.y[i] - S.y1[i], S.z[i] - S.z1[i]);
                    const pi = 1 - this._clamp01(dc / d0);
                    acc += pi; cnt++;
                }
                const posProgress = cnt ? acc / cnt : 0;

                let intact = 0, total = S.bonds_i ? S.bonds_i.length : 0;
                if (total) {
                    for (let k = 0; k < total; k++) if (!S.bondBroken[k]) intact++;
                }
                const bondProgress = total ? intact / total : 1;

                const combined = this._clamp01(0.75 * posProgress + 0.25 * bondProgress);
                S._ema = (S._ema == null) ? combined : (0.85 * S._ema + 0.15 * combined);
                return this._clamp01(S._ema);
            }

            async drawMoleculeFoldFrame(ctx) {

                if (!this._molFold) {
                    this._molFold = {
                        frame: 0,
                        duration: 180,
                        hold: 40,
                        pingpong: true,
                        N: 10,
                        x: null, y: null, z: null,
                        vx: null, vy: null, vz: null,
                        x0: null, y0: null, z0: null,
                        x1: null, y1: null, z1: null,
                        r: 14,
                        bonds_i: null, bonds_j: null,
                        hbonds_i: null, hbonds_j: null,
                        bondBroken: null, bondCooldown: null,
                        hbondBroken: null, hbondCooldown: null,
                        builtForSize: { w: 0, h: 0 },
                        lastTime: performance.now(),
                        atomSprite: null,
                        atomSpriteRadius: 4,
                        elem: null,
                        colors: ['#642961ff', '#4b79ff', '#ff5e5e'],
                        tempScale: null,
                        dragScale: null,
                        restJitter: null
                    };
                }
                const S = this._molFold;

                const clamp01 = v => Math.max(0, Math.min(1, v));
                const easeInOut = t => (t < 0.5) ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const mix = (a, b, t) => a + (b - a) * t;
                const hypot3 = (dx, dy, dz) => Math.sqrt(dx * dx + dy * dy + dz * dz);
                const randu = () => Math.random() * 2 - 1;
                const randn = () => { let s = 0; for (let i = 0; i < 5; i++) s += randu(); if (Math.random() < 0.06) s += 6 * randu(); return s; };

                const BREAK_STRETCH = 1.75;
                const THICK_STRETCH = 0.85;
                const HEAL_STRETCH = 1.15;
                const BREAK_COOLDOWN = 45;

                const now = performance.now();
                const dtMs = Math.min(50, now - (S.lastTime || now));
                S.lastTime = now;
                const dt = dtMs / 1000;

                const W = ctx.canvas.width, H = ctx.canvas.height;
                const size = Math.min(W, H) * 0.65;
                const cx = W / 2, cy = H / 2;
                const left = cx - size / 2, right = cx + size / 2;
                const top = cy - size / 2;

                const ZMAX = size * 0.35;
                const SIZE_DEPTH_SCALE = 1.0;
                const sizeScaleFromZ = (z) => {
                    const s = 1 + SIZE_DEPTH_SCALE * (z / ZMAX);
                    return Math.max(0.25, s);
                };

                const rebuild = !S.x || S.builtForSize.w !== W || S.builtForSize.h !== H;
                if (rebuild) {
                    const N = S.N;

                    S.x = new Float32Array(N);
                    S.y = new Float32Array(N);
                    S.z = new Float32Array(N);
                    S.vx = new Float32Array(N);
                    S.vy = new Float32Array(N);
                    S.vz = new Float32Array(N);

                    S.x0 = new Float32Array(N);
                    S.y0 = new Float32Array(N);
                    S.z0 = new Float32Array(N);
                    S.x1 = new Float32Array(N);
                    S.y1 = new Float32Array(N);
                    S.z1 = new Float32Array(N);

                    S.elem = new Uint8Array(N);
                    S.tempScale = new Float32Array(N);
                    S.dragScale = new Float32Array(N);

                    S.bonds_i = new Uint32Array(N - 1);
                    S.bonds_j = new Uint32Array(N - 1);
                    for (let k = 0; k < N - 1; k++) { S.bonds_i[k] = k; S.bonds_j[k] = k + 1; }
                    S.bondBroken = new Uint8Array(S.bonds_i.length);
                    S.bondCooldown = new Uint16Array(S.bonds_i.length);
                    S.restJitter = new Float32Array(S.bonds_i.length);

                    const half = Math.floor(N / 2);
                    const hb = Math.max(0, half - 1);
                    S.hbonds_i = new Uint32Array(hb);
                    S.hbonds_j = new Uint32Array(hb);
                    for (let i = 0; i < hb; i++) { const j = (S.N - 1) - i; S.hbonds_i[i] = i; S.hbonds_j[i] = j; }
                    S.hbondBroken = new Uint8Array(S.hbonds_i.length);
                    S.hbondCooldown = new Uint16Array(S.hbonds_i.length);

                    const r = S.r;
                    const sprite = document.createElement('canvas');
                    const sprR = Math.ceil(r);
                    sprite.width = sprite.height = sprR * 2 + 2;
                    const sctx = sprite.getContext('2d');
                    sctx.beginPath();
                    sctx.arc(sprite.width / 2, sprite.height / 2, r, 0, Math.PI * 2);
                    sctx.fillStyle = '#2a1f33';
                    sctx.fill();
                    sctx.lineWidth = 1;
                    sctx.strokeStyle = 'rgba(255,255,255,0.25)';
                    sctx.stroke();
                    S.atomSprite = sprite;
                    S.atomSpriteRadius = sprR;

                    for (let i = 0; i < N; i++) {
                        S.elem[i] = i % 3;
                        S.tempScale[i] = 0.75 + Math.random() * 1.5;
                        S.dragScale[i] = 0.7 + Math.random() * 0.8;
                    }
                    for (let k = 0; k < S.restJitter.length; k++) {
                        S.restJitter[k] = 0.9 + Math.random() * 0.25;
                    }

                    const spacing = size / (N + 2);
                    for (let i = 0; i < N; i++) {
                        const t = i / (N - 1);
                        const x0 = mix(left + spacing, right - spacing, t);
                        const arc = Math.sin((t - 0.5) * Math.PI) * (size * 0.10);
                        const y0 = cy + arc;
                        const z0 = Math.cos((t - 0.5) * Math.PI) * (ZMAX * 0.12);

                        S.x0[i] = x0; S.y0[i] = y0; S.z0[i] = z0;
                        S.x[i] = x0; S.y[i] = y0; S.z[i] = z0;
                    }

                    const vSpacing = size / (half + 4);
                    const gap = Math.max(spacing * 1.2, size * 0.08);
                    const xL = cx - gap / 2, xR = cx + gap / 2;
                    const yStart = top + vSpacing * 2;
                    for (let i = 0; i < half; i++) {
                        S.x1[i] = xL + 4 * randu(); S.y1[i] = yStart + i * vSpacing + 4 * randu();
                        S.z1[i] = -ZMAX * (0.10 + 0.08 * (i / Math.max(1, half - 1))) + ZMAX * 0.02 * randu();
                    }
                    for (let i = half; i < S.N; i++) {
                        const j = i - half;
                        S.x1[i] = xR + 4 * randu(); S.y1[i] = yStart + (half - 1 - j) * vSpacing + 4 * randu();
                        S.z1[i] = +ZMAX * (0.10 + 0.08 * (j / Math.max(1, half - 1))) + ZMAX * 0.02 * randu();
                    }
                    const bend = vSpacing * 0.9;
                    if (half - 1 >= 0 && half < S.N) {
                        S.x1[half - 1] = mix(xL, cx, 0.4); S.y1[half - 1] -= bend * 0.4; S.z1[half - 1] += ZMAX * (0.10 + 0.02 * randu());
                        S.x1[half] = mix(xR, cx, 0.4); S.y1[half] -= bend * 0.4; S.z1[half] += ZMAX * (0.10 + 0.02 * randu());
                    }

                    S.builtForSize = { w: W, h: H };
                    S.frame = 0;
                }

                const dur = S.duration, hold = S.hold;
                let tFold = 0;
                if (S.pingpong) {
                    const total = (dur + hold) * 2;
                    const f = S.frame % total;
                    if (f < dur) tFold = easeInOut(f / dur);
                    else if (f < dur + hold) tFold = 1;
                    else if (f < 2 * dur + hold) tFold = easeInOut(1 - (f - (dur + hold)) / dur);
                    else tFold = 0;
                } else {
                    const f = S.frame % (dur + hold);
                    tFold = (f < dur) ? easeInOut(f / dur) : 1;
                }

                const kTarget = 28;
                const kBackbone = 58;
                const zetaBase = 8;

                const restLenBase = Math.min(size / (S.N + 1), 44);

                const AMP = 10;
                const tempMax = 520 * AMP;
                const baseJitter = 90 * AMP;
                const timeWobble = 1 + 0.25 * Math.sin(S.frame * 0.07);
                const tempBase = ((1 - tFold * 0.6) * tempMax + baseJitter) * timeWobble;

                const pad = 10;
                const xU = S.x0, yU = S.y0, zU = S.z0;
                const xT = S.x1, yT = S.y1, zT = S.z1;

                const N = S.N;
                for (let i = 0; i < N; i++) {
                    const xi = S.x[i], yi = S.y[i], zi = S.z[i];
                    const tx = mix(xU[i], xT[i], tFold);
                    const ty = mix(yU[i], yT[i], tFold);
                    const tz = mix(zU[i], zT[i], tFold);

                    let fx = kTarget * (tx - xi);
                    let fy = kTarget * (ty - yi);
                    let fz = kTarget * (tz - zi);

                    if (i > 0 && !S.bondBroken[i - 1]) {
                        const j = i - 1;
                        const dx = S.x[j] - xi, dy = S.y[j] - yi, dz = S.z[j] - zi;
                        const d = hypot3(dx, dy, dz) || 1e-6;
                        const rest = restLenBase * S.restJitter[i - 1];
                        const ext = d - rest;
                        const s = kBackbone * ext / d;
                        fx += s * dx; fy += s * dy; fz += s * dz;
                    }
                    if (i + 1 < N && !S.bondBroken[i]) {
                        const j = i + 1;
                        const dx = S.x[j] - xi, dy = S.y[j] - yi, dz = S.z[j] - zi;
                        const d = hypot3(dx, dy, dz) || 1e-6;
                        const rest = restLenBase * S.restJitter[i];
                        const ext = d - rest;
                        const s = kBackbone * ext / d;
                        fx += s * dx; fy += s * dy; fz += s * dz;
                    }

                    const zeta = zetaBase * S.dragScale[i];
                    fx += -zeta * S.vx[i];
                    fy += -zeta * S.vy[i];
                    fz += -zeta * S.vz[i];

                    const sigma = tempBase * S.tempScale[i] * Math.sqrt(Math.max(dt, 1 / 1000));
                    fx += sigma * randn();
                    fy += sigma * randn();
                    fz += sigma * randn();
                    if (Math.random() < 0.025) {
                        S.vx[i] += 0.5 * sigma * randu();
                        S.vy[i] += 0.5 * sigma * randu();
                        S.vz[i] += 0.5 * sigma * randu();
                    }

                    S.vx[i] += fx * dt;
                    S.vy[i] += fy * dt;
                    S.vz[i] += fz * dt;

                    let xn = S.x[i] + S.vx[i] * dt;
                    let yn = S.y[i] + S.vy[i] * dt;
                    let zn = S.z[i] + S.vz[i] * dt;

                    if (xn < pad) { xn = pad; S.vx[i] *= -0.25; }
                    else if (xn > W - pad) { xn = W - pad; S.vx[i] *= -0.25; }
                    if (yn < pad) { yn = pad; S.vy[i] *= -0.25; }
                    else if (yn > H - pad) { yn = H - pad; S.vy[i] *= -0.25; }
                    if (zn < -ZMAX) { zn = -ZMAX; S.vz[i] *= -0.2; }
                    else if (zn > ZMAX) { zn = ZMAX; S.vz[i] *= -0.2; }

                    S.x[i] = xn; S.y[i] = yn; S.z[i] = zn;
                }

                for (let k = 0; k < S.bonds_i.length; k++) {
                    const i = S.bonds_i[k], j = S.bonds_j[k];
                    const d = hypot3(S.x[j] - S.x[i], S.y[j] - S.y[i], S.z[j] - S.z[i]) || 1e-6;
                    const rest = restLenBase * S.restJitter[k];
                    const stretch = d / rest;

                    if (!S.bondBroken[k]) {
                        if (stretch >= BREAK_STRETCH) { S.bondBroken[k] = 1; S.bondCooldown[k] = BREAK_COOLDOWN; }
                    } else {
                        if (S.bondCooldown[k] > 0) S.bondCooldown[k]--;
                        else if (stretch <= HEAL_STRETCH) S.bondBroken[k] = 0;
                    }
                }

                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                for (let k = 0; k < S.bonds_i.length; k++) {
                    if (S.bondBroken[k]) continue;

                    const i = S.bonds_i[k], j = S.bonds_j[k];
                    const dx = S.x[j] - S.x[i], dy = S.y[j] - S.y[i], dz = S.z[j] - S.z[i];
                    const d3 = hypot3(dx, dy, dz) || 1e-6;
                    const rest = restLenBase * S.restJitter[k];

                    if (d3 >= rest * BREAK_STRETCH) continue;

                    const closeStart = rest * THICK_STRETCH;
                    const thinT = clamp01((d3 - closeStart) / (rest * BREAK_STRETCH - closeStart));
                    const W_MAX = Math.max(3, S.r * 0.6);
                    const W_MIN = 0.35;
                    const baseW = W_MAX * (1 - thinT) + W_MIN * thinT;
                    const alpha = 0.9 * (1 - 0.85 * thinT);

                    const s1 = sizeScaleFromZ(S.z[i]);
                    const s2 = sizeScaleFromZ(S.z[j]);
                    const scaleAvg = (s1 + s2) * 0.5;

                    ctx.lineWidth = baseW * scaleAvg;
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = 'rgba(20,20,24,0.98)';
                    ctx.beginPath();
                    ctx.moveTo(S.x[i], S.y[i]);
                    ctx.lineTo(S.x[j], S.y[j]);
                    ctx.stroke();
                }
                ctx.restore();

                ctx.save();
                const spr = S.atomSprite;
                for (let e = 0; e < 3; e++) {
                    ctx.fillStyle = S.colors[e] + 'C0';
                    for (let i = e; i < S.N; i += 3) {
                        const scale = sizeScaleFromZ(S.z[i]);
                        const wDraw = spr.width * scale;
                        const hDraw = spr.height * scale;
                        ctx.drawImage(spr, S.x[i] - wDraw / 2, S.y[i] - hDraw / 2, wDraw, hDraw);

                        const d = Math.max(1, 1.3 * scale);
                        ctx.fillRect(S.x[i] - d / 2, S.y[i] - d / 2, d, d);
                    }
                }
                ctx.restore();

                const msg = String(this.___folder_calculation_status ?? "");
                if (!msg) { }

                const canvasWidth = ctx.canvas.width;
                const canvasHeight = ctx.canvas.height;
                const centerX = canvasWidth / 2;
                const centerY = canvasHeight / 2;

                ctx.save();

                const minDim = Math.min(canvasWidth, canvasHeight);
                const fontSize = Math.max(13, Math.round(minDim * 0.035));
                ctx.font = `500 ${fontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const m = ctx.measureText(msg);
                const textW = m.width;
                const textH = (m.actualBoundingBoxAscent ?? fontSize * 0.8) +
                    (m.actualBoundingBoxDescent ?? fontSize * 0.2);

                const padX = Math.round(fontSize * 0.55);
                const padY = Math.round(fontSize * 0.35);
                const boxW = Math.ceil(textW + padX * 2);
                const boxH = Math.ceil(textH + padY * 2);
                const boxX = Math.round(centerX - boxW / 2);
                const boxY = Math.round(centerY - boxH / 2);
                const radius = Math.min(16, Math.floor(boxH / 2));

                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.shadowColor = 'rgba(0,0,0,0.12)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.beginPath();
                const r = radius;
                ctx.moveTo(boxX + r, boxY);
                ctx.lineTo(boxX + boxW - r, boxY);
                ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + r);
                ctx.lineTo(boxX + boxW, boxY + boxH - r);
                ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - r, boxY + boxH);
                ctx.lineTo(boxX + r, boxY + boxH);
                ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - r);
                ctx.lineTo(boxX, boxY + r);
                ctx.quadraticCurveTo(boxX, boxY, boxX + r, boxY);
                ctx.closePath();
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(0,0,0,0.04)';
                ctx.stroke();
                ctx.restore();
                ctx.fillStyle = 'rgba(32,32,32,0.6)';
                ctx.fillText(msg, centerX, centerY);
                ctx.restore();
                S.frame++;
            }

            nextTrackY() {
                if (!this.track || this.track.length === 0) {
                    return 0;
                }

                let maxy = this.track.reduce((maxObj, currentObj) => {
                    return (currentObj.y > maxObj.y) ? currentObj : maxObj;
                })
                return maxy.y + 2;
            }
            setSelectedCompounds(s) {
                this.selectedCompounds = s;
            }

            deselectAllCompounds() {
                for (let s of this.selectedCompounds) {
                    if (s.o.setSelected)
                        s.o.setSelected(false);
                }
                this.selectedCompounds = []
            }

            errortimeout;
            setError(m) {
                this.error = m;
                if (this.errortimeout) {
                    clearTimeout(this.errortimeout)
                }
                this.timerrortimeouteout = setTimeout(() => {
                    this.error = null;
                }, 15000)
            }

            timeout;
            setMessage(m, messagex, messagey) {
                this.centerMessage = false;
                this.message = m;
                if (messagex != null && messagex > 0) {
                    this.messagex = messagex;
                }
                if (messagey != null && messagey > 0) {
                    this.messagey = messagey;
                }

                if (this.timeout) {
                    clearTimeout(this.timeout)
                }
                this.timeout = setTimeout(() => {
                    this.message = null;
                    this.messagex = 150;
                    this.messagey = 25;
                }, 5000)
            }

            setMessageCenter(m, fontSize) {
                this.message = m;
                this.centerMessage = true;
                let originalFontSize = this.fontSize;
                this.fontSize = fontSize;
                if (this.timeout) {
                    clearTimeout(this.timeout)
                }
                this.timeout = setTimeout(() => {
                    this.message = null;
                    this.centerMessage = false;
                    this.fontSize = originalFontSize;
                }, 10000)
            }

            setCenterMessage(m, fontSize) {
                this.setMessageCenter(m, fontSize)
            }
            isConnected() {
                if (!this.graph) {
                    return false;
                }
                let ctx = this.graph.canvas.getCTX();
                if (ctx != null) {
                    return ctx.canvas.isConnected;
                }
                return false;
            }
            saveCurrentShape() {
                this.pushOntoHistory()

                if (this.currentShape.w <= 0 || this.graph.screenWidth(this.currentShape.w) <= 5) {
                    this.currentShape = null;
                    return;
                }
                this.shapes.push(this.currentShape);
                this.currentShape = null;
            }
            removeShape(shape) {
                let s = []
                for (let ss of this.shapes) {
                    if (ss != shape) {
                        s.push(ss)
                    }
                }
                this.shapes = s;
            }

            setPasteFunction(paste_function) {
                this.paste_transient_ = paste_function;
            }
            getPasteFunction() {
                return this.paste_transient_
            }

            pushCurrentShape() {
                if (this.currentShape.w <= 0 || this.graph.screenWidth(this.currentShape.w) <= 5) {
                    this.currentShape = null;
                    return;
                }
                this.shapes.push(this.currentShape);
                this.currentShape = null;
            }

            async showTracksMenu() {
                let m = []
                for (let l of this.track) {

                    let tname = l.description;
                    if (tname == null || tname.length < 1) {
                        tname = l.name;
                    }

                    m.push({
                        label: tname,
                        click: async (xwc, ywc) => {
                            let offset = l.tgraph.width / 6

                            this.graph.setymax(l.tgraph.yi + l.tgraph.height + 10)
                            this.graph.setymin(l.tgraph.yi - Math.abs(l.tgraph.height) - 10)
                            this.graph.setxmin(l.tgraph.xi - offset)
                            this.graph.setxmax(l.tgraph.xi + l.tgraph.width + offset)
                            this.graph.rescale();

                        },
                        move: () => {
                        }
                    })
                }

                let ChapterMenu;
                if (isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')
                else
                    ChapterMenu = await exec('flexigraph/menu.js')


                if (!m) {
                    return;
                }


                const maxPerColumn = 7;
                const itemCount = m.length;
                const cols = Math.ceil(itemCount / maxPerColumn);
                const fg = 'rgb(205, 255, 155)';
                const bg = 'navy';
                const screen_width = this.graph.grid.width;
                const screen_height = this.graph.grid.height;
                const menuWidth = cols * 200;
                const itemHeight = 35;
                const rows = Math.min(itemCount, maxPerColumn);
                const menuHeight = rows * itemHeight;

                const xpos = (screen_width - menuWidth) / 2;
                const ypos = (screen_height - menuHeight) / 2;
                this.chapter_menu = new ChapterMenu(m, this.graph.Xwc(xpos), this.graph.Ywc(ypos), bg, fg, cols);
                this.chapter_menu.title = '';
                this.showChapters = true;
                this.showBookmarks = false;
                if (this.menu) {
                    this.hideMenu();
                }
            }

            async showMenuForAnnotation(title, annotation) {
                let m = []
                for (let l of this.track) {
                    for (let o of l.oligos) {
                        if (annotation === 'amplicon' && o.type === annotation) {
                            m.push({
                                label: o.left.xi + '...' + o.right.xi,
                                click: async (xwc, ywc) => {
                                    this.animateTo(l.tgraph.X(o.left.xi - 5), l.tgraph.X(o.right.xf + 5), l.tgraph.Y(o.left.y - 1), l.tgraph.Y(o.left.y + 1))

                                },
                                move: () => {
                                }
                            })

                        }
                    }

                }
                let ChapterMenu;
                if (!isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')

                this.chapter_menu = new ChapterMenu(m, 0, 350, this.graph)
                this.chapter_menu.title = title;
                this.showChapters = true;
                this.showBookmarks = false;
            }

            updateObject(obj, newObject) {

                for (let o = 0; o < this.shapes.length; o++) {
                    if (this.shapes[o] === obj) {
                        this.shapes[o] = newObject;
                    }
                }
            }

            getViewport() {
                let vt = [];
                for (let v of this.track) {
                    if (
                        ((v.tgraph.xi + v.tgraph.width > this.graph.grid.xmin) && (v.tgraph.xi + v.tgraph.width < this.graph.grid.xmax) ||
                            (v.tgraph.xi < this.graph.grid.xmax && v.tgraph.xi > this.graph.grid.xmin) ||
                            v.tgraph.xi < this.graph.grid.xmin && v.tgraph.xi + v.tgraph.width > this.graph.grid.xmax ||
                            v.tgraph.xi > this.graph.grid.xmin && v.tgraph.xi + v.tgraph.width < this.graph.grid.xmax) &&
                        ((v.tgraph.yi + v.tgraph.height > this.graph.grid.ymin) && (v.tgraph.yi + v.tgraph.height < this.graph.grid.ymax) ||
                            (v.tgraph.yi < this.graph.grid.ymax && v.tgraph.yi > this.graph.grid.ymin) ||
                            v.tgraph.yi < this.graph.grid.ymin && v.tgraph.yi + v.tgraph.height > this.graph.grid.ymax ||
                            v.tgraph.yi > this.graph.grid.ymin && v.tgraph.yi + v.tgraph.height < this.graph.grid.ymax)
                    ) {
                        vt.push(v);
                        if (v.trackRef && v.trackRef.track) {
                            vt.push(v.trackRef.track)
                        }
                    }
                }
                let vo = []
                for (let v of this.shapes) {
                    if ((v.x + v.w > this.graph.grid.xmin) && (v.x + v.w < this.graph.grid.xmax) ||
                        (v.x < this.graph.grid.xmax && v.x > this.graph.grid.xmin) ||
                        v.x < this.graph.grid.xmin && v.x + v.w > this.graph.grid.xmax ||
                        v.x > this.graph.grid.xmin && v.x + v.w < this.graph.grid.xmax) {
                        vo.push(v);
                    }
                }
                let viewport = {
                    viewport: {
                        shapes: vo,
                        track: vt,
                        grid: this.graph.grid
                    }
                }

                return viewport;
            }

            async runfun(fun, track) {
                await fun(this, track)
            }
            async rungraph(fun) {
                await fun(this)
            }

            async show_chapters(chapters) {
                let list = Object.keys(chapters);
                let m = []
                for (let l of list) {
                    m.push({
                        label: l,
                        click: async (xwc, ywc) => {
                            if (this.lock)
                                return;
                            let bm = chapters[l]
                            this.lock = true;
                            await this.loadChapter(bm, false);
                            this.lock = false;
                            setTimeout(async () => {
                                if (this.bookmarks && Object.keys(this.bookmarks).length > 0) {
                                    let blist = Object.keys(this.bookmarks);

                                    await this.goToBookmark(this.bookmarks[blist[0]])
                                }
                            }, 3000)

                        },
                        move: () => {
                        }
                    })
                }

                let ChapterMenu;
                if (!isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')

                this.chapter_menu = new ChapterMenu(m, 0, 50, this.graph)
                this.chapter_menu.title = 'Chapters';
                this.showChapters = true;
                this.showBookmarks = true;
            }

            async loadBookmark(title) {
                this.goToBookmark(this.bookmarks[title])
            }

            async loadChapter(path) {
                let obj = await exec(path)
                if (obj) {
                    await this.update(obj);
                }
                else {
                    alert(' Failed to find the chapter ' + title);
                }
            }

            setTrackOnTop(trackIndex) {
                let t = this.track[trackIndex]
                let newOrder = []
                newOrder.push(t);
                for (let i = 0; i < this.track.length; i++) {
                    if (i != trackIndex)
                        newOrder.push(this.track[i])
                }
                this.track = newOrder;

            }
            setTrackOnBottom(trackIndex) {
                let t = this.track[trackIndex]
                let newOrder = []
                for (let i = 0; i < this.track.length; i++) {
                    if (i != trackIndex)
                        newOrder.push(this.track[i])
                }
                newOrder.push(t);
                this.track = newOrder;

            }

            pushOntoHistory() {
                if (!this.uid) {
                    this.uid = uuid();
                }
                pushHistory(HM(this))
            }

            async update(graph) {
                if (graph.msg) {
                    log(graph.msg)
                    return;
                }
                this.shapes = [];
                this.menu = null;
                this.track = [];
                this.chem = [];
                this.plates = [];
                this.startX = 0;
                this.endX = 0;

                try {
                    this.chem = graph.chem;
                    this.endX = graph.endx;
                } catch (exception) {
                    console.log(' exception ' + exception);
                }
                if (!graph || !graph.graph || !graph.graph.grid) {
                    return;
                }

                let temp_grid = Object.assign(new MGrid(), graph.graph.grid);

                temp_grid.width = this.graph.grid.width;
                temp_grid.height = this.graph.grid.height;
                this.graph.grid = temp_grid;
                this.elastic = graph.elastic;
                this.mode = graph.mode;
                if (graph.plots)
                    this.plots = graph.plots;
                this.plates = graph.plates;
                this.startX = graph.startX;
                this.track = [];
                let _tracks = graph.track;

                let TrackLink = await exec('baja/bio/track-link.js')

                if (this.plots) {
                    for (let i = 0; i < this.plots.length; i++) {
                        if (this.plots[i].lineColor != null) {

                            this.plots[i] = Object.assign(new MPlot(null, null), this.plots[i]);
                            this.plots[i].grid = Object.assign(new MGrid(), this.plots[i].grid)

                        } else {
                            this.plots[i] = Object.assign(new PCAPlot(null, null), this.plots[i]);
                            this.plots[i].grid = Object.assign(new MGrid(), this.plots[i].grid)
                        }
                    }
                }

                if (_tracks && _tracks.length > 0) {

                    for (let t of _tracks) {

                        if (typeof t === 'string') {
                            try {
                                const parsed = JSON.parse(t);
                                if (typeof parsed === 'object' && parsed !== null) {
                                    t = parsed;
                                }
                            } catch (e) {

                            }
                        }
                        await this.___setTrack(t);
                    }
                }

                let findTrack = (id) => {
                    for (let t of this.track) {
                        console.log(' t id ' + t.id)
                        if (t.id === id) {
                            return t;
                        }
                    }
                }

                let _layers = graph.layers;
                if (_layers && _layers.length > 0) {
                    for (let layer of _layers) {
                        let tp = Object.assign(new TrackLink(), layer);

                        let ftrack = findTrack(tp.track1.id);
                        if (ftrack) {
                            tp.track1.track = ftrack;
                        }
                        let rtrack = findTrack(tp.track2.id);
                        if (rtrack) {
                            tp.track2.track = rtrack;
                        }
                        if (tp.track1.track && tp.track2.track)
                            this.layers.push(tp)
                    }
                }

                let _shapes = graph.shapes;
                if (_shapes && _shapes.length > 0) {
                    for (let t of _shapes) {
                        if (t) {
                            if (t.type === 'Rectangle') {
                                var foo = Object.assign(new Rectangle(), t);
                                this.shapes.push(foo);
                            } else
                                if (t.type === 'oval') {
                                    var foo = Object.assign(new Oval(), t);
                                    this.shapes.push(foo);
                                } else if (t.type === 'line') {
                                    var foo = Object.assign(new Line(), t);
                                    this.shapes.push(foo);
                                } else if (t.type === 'icon') {
                                    var foo = Object.assign(new Icon(), t);
                                    let image = new Image()
                                    if (!t.b64) {
                                        image.src = t.img;
                                        foo.img = image;
                                    } else {
                                        image.src = t.b64;
                                        foo.img = image;
                                    }
                                    this.shapes.push(foo);
                                } else if (t.type === 'RectangleText') {
                                    var foo = Object.assign(new RectangleText(), t);
                                    this.shapes.push(foo);
                                } else if (t.type === 'Citation') {
                                    var foo = Object.assign(new Citation(), t);
                                    if (t.citations && t.citations > 0) {
                                        for (let c of t.citations) {
                                            let cfoo = Object.assign(new CitationItem(), c);
                                            foo.citations.push(cfoo);
                                        }
                                    }
                                    this.shapes.push(foo);
                                } else if (t.type === 'folder') {
                                    let foo = Object.assign(new Folder(), t);
                                    foo.name = t.name;
                                    foo.x = t.x;
                                    foo.y = t.y;
                                    foo.w = t.w;
                                    foo.h = t.h;
                                    foo.type = 'folder';
                                    foo.color = '#d9b44a';
                                    this.shapes.push(foo);
                                }
                        }
                    }
                }

                for (let pt of this.track) {
                    if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name) {
                        for (let t of this.track) {

                            if (pt.trackRef && pt.trackRef.name != null) {
                                if (pt.trackRef.name === t.name)
                                    pt.trackRef.track = t;
                            }
                        }
                    }
                }
                this.bookmarks = {}
                let _bookmarks = graph.bookmarks;
                let bookmark_keys = Object.keys(_bookmarks);
                for (let b of bookmark_keys) {
                    this.bookmarks[b] = Object.assign(new MGrid(), _bookmarks[b])
                }
                this.graph.grid.rescale();
                await this.buildBookmark();
                this.syncTrackRef();
                this.initView = Object.assign(new MGrid(), this.graph.grid)

            }

            resetView() {
                this.graph.grid = Object.assign(new MGrid(), this.initView)
                this.graph.rescale();
            }

            createSubGrid(graphX, graphY) {
                let sw = this.graph.grid.screenHeight(10);
                let ww = this.graph.grid.worldWidth(sw);
                const grid = new MGrid(this.graph.grid.X(graphX), graph.Y(graphY), this.graph.grid.screenWidth(ww), sw);
                return grid;
            }

            getHighlighted() {
                for (let s of this.shapes) {
                    if (s.hl) {
                        return s;
                    }
                }
            }

            addObjects(_shapes) {
                if (_shapes && _shapes.length > 0) {
                    for (let t of _shapes) {

                        if (t.type === 'Rectangle') {
                            var foo = Object.assign(new Rectangle(), t);
                            this.shapes.push(foo);
                        } else
                            if (t.type === 'oval') {
                                var foo = Object.assign(new Oval(), t);
                                this.shapes.push(foo);
                            } else if (t.type === 'line') {
                                var foo = Object.assign(new Line(), t);
                                this.shapes.push(foo);
                            } else if (t.type === 'icon') {
                                var foo = Object.assign(new Icon(), t);
                                let image = new Image()
                                image.src = foo.img;
                                foo.img = image;

                                this.shapes.push(foo);
                            } else if (t.type === 'RectangleText') {
                                var foo = Object.assign(new RectangleText(), t);
                                this.shapes.push(foo);
                            } else if (t.type === 'Citation') {
                                var foo = Object.assign(new Citation(), t);
                                if (t.citations && t.citations > 0) {
                                    for (let c of t.citations) {
                                        let cfoo = Object.assign(new CitationItem(), c);
                                        foo.citations.push(cfoo);
                                    }
                                }
                                this.shapes.push(foo);
                            } else if (t.type === 'folder') {
                                let foo = Object.assign(new Folder(), t);
                                foo.name = t.name;
                                foo.x = t.x;
                                foo.y = t.y;
                                foo.w = t.w;
                                foo.h = t.h;
                                foo.type = 'folder';
                                foo.color = '#d9b44a';
                                this.shapes.push(foo);
                            }
                    }
                }
            }
            async addTrackJSONObjects(to) {
                let tokeys = Object.keys(to);
                for (let item of tokeys) {
                    await this.addTrackJSON(to[item]);
                }
            }

            addTrack(newTrack) {

                setTimeout(() => {
                    function overlap(track1, track2) {

                        if (track1 == track2) {
                            return false;
                        }
                        let track1Top = track1.tgraph.yi - track1.tgraph.height + 3;
                        let track1Bottom = track1.tgraph.yi;

                        let track2Top = track2.tgraph.yi - track2.tgraph.height;
                        let track2Bottom = track2.tgraph.yi;
                        if (track1Bottom < track2Top && track1Top > track2Bottom) {
                            return true;
                        }
                        return false;
                    }
                    while (this.track.some(existingTrack => overlap(existingTrack, newTrack))) {
                        newTrack.y += 3;
                        newTrack.tgraph.yi = newTrack.y;
                    }

                }, 200)
                this.track.push(newTrack);
            }

            trackExists(name) {
                for (let t of this.track) {
                    console.log(' track ' + t.name);
                    if (t.name && t.name.toUpperCase() === name.toUpperCase()) {
                        return true;
                    }
                }
                return false;
            }

            async addTrackJSON(jsonObject) {
                if (this.trackExists(jsonObject['name'])) {

                    return;
                }

                if (jsonObject.trackRef && jsonObject.trackRef.track) {

                    await this.addTrackJSON(jsonObject.trackRef.track);
                }
                let newTrack = await this.___setTrack(jsonObject);
                for (let pt of this.track) {
                    if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name) {
                        for (let t of this.track) {
                            if (pt.trackRef && pt.trackRef.track && pt.trackRef.track.name && pt.trackRef.track.name === t.name) {
                                pt.trackRef.track = t;
                            }
                        }
                    }
                }
                return newTrack;
            }

            markPosition(xi, xf) {
                for (let t of this.track) {
                    t.markstart = xi;
                    t.markend = xf;
                }
            }

            dehighlightAllSnps() {
                for (let t of this.track) {

                }
            }
            highlight(str, delay, color, highlight_object, hx, hy) {

            }

            clearMouseListeners(mo) {
                setTimeout(() => {
                    this.___captureSwipesSet = false;
                }, 2000)

                this.center_paragraph_text = null;
                this.mouseDownListeners = []
                this.mouseMoveListeners = [];
                this.mouseUpListeners = [];
                this.highlightmethod = null;
                if (mo != null) {
                    exec(mo, this, this.genegraph_panel_layout)
                } else {

                }
            }

            setMouseMode(mode) {
                this.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                this.graph.mode = mode;
            }
            setBaseIndex(b) {
                this.baseIndex = b;
            }

            addMouseDownListener(ml) {
                this.mouseDownListeners.push(ml);
            }
            addMouseUpListener(ml) {
                this.mouseUpListeners.push(ml);
            }
            addMouseMoveListener(ml) {
                this.mouseMoveListeners.push(ml);
            }

            updateMessagePanel(html) {
                if (this.controlPanel)
                    this.controlPanel.setHTML(html)
            }
            setTracks(tracks) {
                this.track = tracks;
                this.graph.setymax(this.track.length + 1)
                this.graph.setymin(-1.5)

            }
            dehighlightAllTracks() {
                for (let t of this.track) {
                    t.showResizeBar = false;
                }
            }

            deselectAllTracks() {
                this.currentShape = null;
                for (let t of this.track) {

                    t.markstart = -1;
                    t.markend = -1;
                    t.showResizeBar = false;
                    for (let o of t.oligos) {
                        o.setSelected(false)
                    }
                    for (let a of t.annotations) {
                        a.deselect();
                    }

                }
            }
            setBookmarks(_bookmarks) {
                this.bookmarks = _bookmarks;
                this.buildBookmark()
            }

            setBookmark(name) {
                this.bookmarks[name] = Object.assign(new MGrid(), this.graph.grid)
                this.buildBookmark();
            }
            addBookmark(name, grid) {
                this.bookmarks[name] = Object.assign(new MGrid(), grid)
                this.buildBookmark();
            }
            sleep = async (ms) => {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            async goToTrackLocus(trackName, xi, xf) {
                let selected = null;
                for (let l of this.track) {

                    if (l.name === trackName) {
                        selected = l
                    }
                }
                this.graph.rescale();

                if (selected.tgraph && selected.tgraph.xi) {
                    let grid_i = selected.tgraph.X(xi);
                    let grid_f = selected.tgraph.X(xf);

                    let wx = 5;
                    this.graph.setxmin(grid_i - wx);
                    this.graph.setxmax(grid_f + wx);

                    this.graph.setymin(selected.tgraph.yi + selected.tgraph.height)
                    this.graph.setymax(selected.tgraph.yi)
                }
            }

            async goToTrack(track) {
                return new Promise(async (resolve, reject) => {
                    let increment_ = 20;
                    let fromCx = (this.graph.grid.getxmax() - this.graph.grid.getxmin()) / 2;
                    let togrid = new MGrid(track.tgraph.xi - track.tgraph.xi * 0.01, track.tgraph.yi, track.tgraph.width, track.tgraph.height + track.tgraph.height * 0.01)

                    let toCx = (togrid.getxmax() - togrid.getxmin()) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.graph.grid.getxmax() - togrid.getxmax()) / increment_;
                    let translateMinX = (this.graph.grid.getxmin() - togrid.getxmin()) / increment_;
                    let translateMaxY = (this.graph.grid.getymax() - togrid.getymax()) / increment_;
                    let translateMinY = (this.graph.grid.getymin() - togrid.getymin()) / increment_;
                    let yc = (this.graph.grid.getymax() - this.graph.grid.getymin()) / 2;
                    let ytc = (togrid.getymax() - togrid.getymin());
                    let ydif = ytc - yc;
                    let yincr = ydif / increment_;
                    for (let i = 0; i < increment_; i++) {
                        let max = this.graph.getxmax() - translateMaxX;
                        let min = this.graph.getxmin() - translateMinX;
                        if (max > min) {
                            this.graph.setxmin((min))
                            this.graph.setxmax((max))
                        } else {
                            this.graph.setxmin(togrid.getxmin());
                            this.graph.setxmax(togrid.getxmax());
                            i = increment_;
                        }

                        max = this.graph.getymax() - translateMaxY;
                        min = this.graph.getymin() - translateMinY;

                        if (max > min) {
                            this.graph.setymin(this.graph.getymin() - translateMinY)
                            this.graph.setymax(this.graph.getymax() - translateMaxY)
                        } else {
                            this.graph.setymin(togrid.getymin())
                            this.graph.setymax(togrid.getymax())
                            i = increment_;
                        }
                        this.graph.rescale();
                        await sleep(10)
                    }
                    this.graph.setxmin(togrid.getxmin());
                    this.graph.setxmax(togrid.getxmax());
                    this.graph.setymin(togrid.getymin())
                    this.graph.setymax(togrid.getymax())

                    this.graph.rescale();
                    return resolve();
                });
            }

            async goToBookmark(togrid) {
                if (togrid == null) {
                    console.log(' the goto grid is not defined ')
                    return;
                }
                return new Promise(async (resolve, reject) => {
                    let increment_ = 170;
                    let fromCx = (this.graph.grid.getxmax() - this.graph.grid.getxmin()) / 2;
                    let toCx = (togrid.getxmax() - togrid.getxmin()) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.graph.grid.getxmax() - togrid.getxmax()) / increment_;
                    let translateMinX = (this.graph.grid.getxmin() - togrid.getxmin()) / increment_;
                    let translateMaxY = (this.graph.grid.getymax() - togrid.getymax()) / increment_;
                    let translateMinY = (this.graph.grid.getymin() - togrid.getymin()) / increment_;
                    let yc = (this.graph.grid.getymax() - this.graph.grid.getymin()) / 2;
                    let ytc = (togrid.getymax() - togrid.getymin());
                    let ydif = ytc - yc;
                    let yincr = ydif / increment_;
                    for (let i = 0; i < increment_; i++) {
                        let max = this.graph.getxmax() - translateMaxX;
                        let min = this.graph.getxmin() - translateMinX;
                        if (max > min) {
                            this.graph.setxmin((min))
                            this.graph.setxmax((max))
                        } else {
                            this.graph.setxmin(togrid.getxmin());
                            this.graph.setxmax(togrid.getxmax());
                            i = increment_;
                        }

                        max = this.graph.getymax() - translateMaxY;
                        min = this.graph.getymin() - translateMinY;

                        if (max > min) {
                            this.graph.setymin(this.graph.getymin() - translateMinY)
                            this.graph.setymax(this.graph.getymax() - translateMaxY)
                        } else {
                            this.graph.setymin(togrid.getymin())
                            this.graph.setymax(togrid.getymax())
                            i = increment_;
                        }
                        this.graph.rescale();
                        await sleep(10)
                    }
                    this.graph.setxmin(togrid.getxmin());
                    this.graph.setxmax(togrid.getxmax());
                    this.graph.setymin(togrid.getymin())
                    this.graph.setymax(togrid.getymax())
                    this.graph.rescale();
                    return resolve();

                });

            }

            async animateTo(xmin, xmax, ymin, ymax, incr) {

                if (this.animating) {

                    return;
                }

                this.animating = true;

                if (incr == null) {
                    incr = 150;
                }

                return new Promise(async (resolve, reject) => {
                    if (Math.abs(ymax - ymin) < 1) {
                        ymin = this.graph.grid.getymin();
                        ymax = this.graph.grid.getymax();
                    }

                    if (ymax < ymin) {
                        let t = ymin;
                        ymin = ymax;
                        ymax = t;
                    }

                    let xw = xmax - xmin;
                    let yw = ymax - ymin;
                    let currentAspectRatio = xw / yw;
                    if (currentAspectRatio < 10) {
                        let targetAspectRatio = 10;
                        let new_xw, new_yw;
                        if (currentAspectRatio < targetAspectRatio) {
                            new_xw = yw * targetAspectRatio;
                            new_xw = Math.max(new_xw, Math.abs(xw));
                            xmin = (xmax + xmin) / 2 - new_xw / 2;
                            xmax = xmin + new_xw;
                        } else {
                            new_yw = xw / targetAspectRatio;
                            new_yw = Math.max(new_yw, Math.abs(yw));
                            ymin = (ymax + ymin) / 2 - new_yw / 2;
                            ymax = ymin + new_yw;
                        }
                    }
                    if (currentAspectRatio > 5000) {
                        let targetAspectRatio = 5000;
                        let new_xw, new_yw;
                        if (currentAspectRatio < targetAspectRatio) {
                            new_xw = yw * targetAspectRatio;
                            new_xw = Math.max(new_xw, Math.abs(xw));
                            xmin = (xmax + xmin) / 2 - new_xw / 2;
                            xmax = xmin + new_xw;
                        } else {
                            new_yw = xw / targetAspectRatio;
                            new_yw = Math.max(new_yw, Math.abs(yw));
                            ymin = (ymax + ymin) / 2 - new_yw / 2;
                            ymax = ymin + new_yw;
                        }
                    }
                    let increment_ = incr;
                    let fromCx = (this.graph.grid.getxmax() - this.graph.grid.getxmin()) / 2;
                    let toCx = (xmax - xmin) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.graph.grid.getxmax() - xmax) / increment_;
                    let translateMinX = (this.graph.grid.getxmin() - xmin) / increment_;
                    let translateMaxY = (this.graph.grid.getymax() - ymax) / increment_;
                    let translateMinY = (this.graph.grid.getymin() - ymin) / increment_;
                    for (let i = 0; i < increment_; i++) {
                        if (!this.animating) {
                            return resolve();
                        }

                        let Xmax = this.graph.getxmax() - translateMaxX;
                        let Xmin = this.graph.getxmin() - translateMinX;
                        let Ymax = this.graph.getymax() - translateMaxY;
                        let Ymin = this.graph.getymin() - translateMinY;
                        let xw = Xmin - Xmax;
                        let yw = Ymax - Ymin;
                        let currentAspectRatio = xw / yw;
                        if (currentAspectRatio < 10) {
                            let targetAspectRatio = 10;
                            let new_xw, new_yw;
                            if (currentAspectRatio < targetAspectRatio) {
                                new_xw = yw * targetAspectRatio;
                                new_xw = Math.max(new_xw, Math.abs(xw));
                                Xmin = (Xmax + Xmin) / 2 - new_xw / 2;
                                Xmax = Xmin + new_xw;
                            } else {
                                new_yw = xw / targetAspectRatio;
                                new_yw = Math.max(new_yw, Math.abs(yw));
                                Ymin = (Ymax + Ymin) / 2 - new_yw / 2;
                                Ymax = Ymin + new_yw;
                            }
                        }

                        if (Xmax > Xmin) {
                            this.graph.setxmin(Xmin);
                            this.graph.setxmax(Xmax);
                        }
                        if (Ymax > Ymin) {
                            this.graph.setymin(Ymin);
                            this.graph.setymax(Ymax);
                        } else {
                            this.graph.setymin(ymin);
                            this.graph.setymax(ymax);
                            i = increment_;
                        }
                        this.graph.rescale();
                        await sleep(1);
                    }

                    this.graph.setxmin(xmin);
                    this.graph.setxmax(xmax);
                    this.graph.setymin(ymin);
                    this.graph.setymax(ymax);

                    this.graph.rescale();
                    this.animating = false;

                    return resolve();

                });

            }

            addMouseListener(ml) {
                this.mouseListener = ml;
            }

            getTracks() {
                return this.track;
            }

            select() {
                this.select_ = true;
            }
            selectOff() {
                this.currentShape = null;
                this.select_ = false;
                this.deselectAllTracks();
                for (let s of this.shapes) {
                    if (s.highlight) {
                        s.highlight(false);
                    }
                }
            }
            async zoomToSelection() {
                await this.zoom(this.startX, this.endX)

            }
            setTrackCoordinates(trackIndex, start, end) {
                this.track[trackIndex].setTrackCoordinates(start, end);
            }
            async zoomTo(start, end) {
                this.startX = start;
                this.endX = end;
                await this.zoomToSelection();

            }

            zoomToTrack(trackindex, start, end) {
                let t = this.track[trackindex]
                let midpt = (-1 * t.tgraph.height / 2);
                let ht = (-1 * t.tgraph.height);
                let yi = t.tgraph.yi - ht;
                this.animateTo(t.tgraph.X(start), t.tgraph.X(end), yi - 0.5, yi + 0.5, 10);

            }

            async zoomToSelected() {
                await this.zoom(this.startX, this.endX)

            }

            getStructure(x, y) {
                let s = [];
                for (let t of this.track) {
                    let selected2 = t.getOligo(x, y, this.graph);
                    if (selected2 && selected2.length > 0)
                        s.push(selected2)

                }
                let shapes = []
                for (let sh of this.shapes) {
                    if (sh.isIn && sh.isIn(x, y)) {
                        shapes.push(sh)
                    }
                }

                s = s.concat(shapes)
                return s;

            }

            getSNPs(x, y) {
                let gwcxs = this.graph.Xwc(0);
                if (!gwcxs)
                    return;
                let gwcxf = this.graph.Xwc(this.graph.grid.width);
                if (!gwcxf)
                    return;
                let s = [];
                for (let t of this.track) {
                    let twcxs = t.tgraph.Xwc(gwcxs - 2 * t.tgraph.xi);
                    let twcxf = t.tgraph.Xwc(gwcxf - 2 * t.tgraph.xi);
                    let snps = t.getVisibleSNPs(twcxs, twcxf)

                    for (let snp of snps) {
                        if (snp != null && snp.over != null && this.graph != null) {
                            if (snp.over(x, y, this.graph, t.tgraph)) {
                                s.push(snp);
                            }
                        }
                    }

                }
                return s;
            }

            setymax(ymax) {
                this.graph.grid.ymax = ymax;
                this.graph.grid.rescale();
            }
            setymin(ymax) {
                this.graph.grid.ymin = ymax;
                this.graph.grid.rescale();

            }

            createChemTemplate(type, name, regex) {
                let c = new ChemTemplate(type, name, regex);
                this.chem.push(c);
                return c;
            }

            static async create(name, coords) {
                let sp = coords.split(':')
                let chrom = sp[0]
                let start = +sp[1].split('-')[0]
                let end = +sp[1].split('-')[1]
                return new Promise(async (resolve, reject) => {
                    gg = new GeneGraph();
                    await gg.init(name, start, end, strand);
                    resolve(gg);
                });
            }
            toGFF(str) {
                return new GFF(str);
            }
            addListener(listener) {
                this.listener = listener;

            }

            async loadEnsembleGene(obj, prefix) {
                let ajs = obj['Transcript'];

                for (let js of ajs) {
                    let transcriptId = js['id'];
                    let t = this.createTrack(
                        (js['display_name'] || '-') + '(' + transcriptId + ')' + (js['biotype'] || ''),
                        +js['start'],
                        +js['end'],
                        js['strand']
                    );

                    t.transcriptID = transcriptId;
                    t.species = js['species'];
                    t.chr = js['seq_region_name'];
                    t.description = (js['display_name'] || '').toString();
                    t.geneID = js['Parent'];

                    let fasta = '';
                    let annotations = null;

                    try {


                        debugger;

                        const resp = await fetch(
                            `${window.location.origin}/api/ensembl/transcript/${encodeURIComponent(transcriptId)}?prefix=${encodeURIComponent(prefix)}`
                        );

                        if (resp.ok) {
                            const data = await resp.json();
                            fasta = (data.sequence || '').trim();
                            annotations = data.annotations || null;
                        }
                    } catch (e) {
                        console.warn('Local server failed, falling back to Ensembl', e);
                    }

                    if (!fasta) {
                        let ensembl_sequence = prefix + `/sequence/id/${transcriptId}?content-type=text/plain`;
                        fasta = (await GETXT(ensembl_sequence)).trim();

                        if (t.strand < 0) {
                            let temp = '';
                            for (let c = fasta.length - 1; c >= 0; c--) {
                                temp += fasta[c];
                            }
                            fasta = temp;
                        }
                    }

                    t.setSequence(fasta);

                    if (annotations) {
                        t.serverAnnotations = annotations;
                        this.buildENSEMBLAnnotations(t, { ...js, serverAnnotations: annotations });
                    } else {
                        this.buildENSEMBLAnnotations(t, js);
                    }

                    return t;
                }
            }

            createTrackFromLocal(js) {
                function adjustType(t) {
                    if (t === 'exon') {
                        return 'Exon'
                    }
                    else if (t === 'start_codon') {
                        return "TSS"
                    } else if (t === 'stop_codon') {
                        return "STOP"
                    } else if (t.startsWith('translation')) {
                        return 'Translation'
                    }
                    return t;
                }

                const annotations = js.map(item => {

                    let feature = item.feature;

                    let start = item.start;
                    let end = item.end;
                    let ID = item.attributes.ID;
                    let name__ = item.attributes.ID + "";
                    if (item.feature === 'exon') {
                        name__ = item.attributes.exon_id;
                    }
                    if (item.feature === 'CDS') {
                        name__ = item.attributes.ccdsid;
                    } else if (item.feature === "transcript") {
                        name__ = item.transcript_id;
                    }
                    if (!name__) {
                        name__ = feature;
                    }

                    let strand = item.strand;

                    let s = parseInt(start);
                    let e = parseInt(end);

                    let feature__ = adjustType(feature);

                    if (feature__ === 'Exon' || feature__ === "CDS"
                        || feature__.toLowerCase().startsWith('three_prime_utr')
                        || feature__.toLowerCase().startsWith('five_prime_utr')) {
                        ID = ID + s;
                    }

                    if (feature__.toLowerCase() === "transcript") {
                        ID = ""
                    }

                    if (feature__ === "TSS") {
                        e++;
                    }

                    let an = new Annotation(
                        adjustType(feature),
                        name__,
                        s,
                        e,
                        strand
                    );
                    an.shapeFunction = getIon(shapes[an.type])

                    return an;

                });

                return annotations;
            }

            getTracksInRange(start, end) {
                let sub = []
                for (let t of this.track) {
                    if (t.tgraph.xmin < start && start < t.tgraph.xmax || t.tgraph.xmin < end && end < t.tgraph.xmax) {
                        sub.push(t)
                    }
                }
                return sub;
            }

            async add(ensembleId, x, y, source) {
                ensembleId = ensembleId.trim();

                if (ensembleId.startsWith('NM_') || ensembleId.startsWith('NC_')) {
                    let mapped = await exec('py/ensembl/ncbi_to_ensembl.py', ensembleId);
                    if (mapped && mapped.length == 1) {
                        return this.add(mapped[0], x, y, source);
                    }
                    return this.addNCBI(ensembleId);
                }

                let prefix = `https://rest.ensembl.org`;

                if (ensembleId.indexOf('.') > 0) {
                    ensembleId = ensembleId.substring(0, ensembleId.indexOf('.'));
                }

                let js = null;
                const host_ = window['env']?.['apiUrl'] || window.location.origin;

                const applyTrackViewport = (t) => {
                    if (x != null) {
                        t.tgraph.xi = x;
                    }
                    if (y != null) {
                        t.tgraph.yi = y;
                        this.graph.setymax(t.tgraph.yi + 1);
                        this.graph.setymin(t.tgraph.yi - 10);
                    } else {
                        this.graph.setymax(t.tgraph.yi + 2);
                        this.graph.setymin(t.tgraph.yi - 2);
                    }

                    let xm = 0.1 * t.tgraph.width;
                    this.graph.setxmin(t.tgraph.xi - xm);
                    this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);

                    let offset = t.tgraph.width / 6;
                    setTimeout(() => {
                        this.animateTo(
                            t.tgraph.xi - offset,
                            t.tgraph.xi + t.tgraph.width + offset,
                            t.tgraph.yi - Math.abs(t.tgraph.height) - 10,
                            t.tgraph.yi + t.tgraph.height + 10
                        );
                        this.setMouseMode('navigate');
                    }, 500);

                    this.graph.rescale();
                };

                const reverseString = (seq) => {
                    let temp = '';
                    for (let c = seq.length - 1; c >= 0; c--) {
                        temp += seq[c];
                    }
                    return temp;
                };

                const setTrackSequenceFromRawFasta = (t, fasta) => {
                    fasta = (fasta || '').trim();
                    if (!fasta) {
                        t.setSequence('');
                        return;
                    }

                    if (t.strand < 0) {
                        t.setSequence(reverseString(fasta));
                    } else {
                        t.setSequence(fasta);
                    }
                };

                try {
                    // ------------------------------------------------------------
                    // 1. Try local transcript endpoint first for ENST ids
                    // ------------------------------------------------------------
                    if (ensembleId.toUpperCase().startsWith("ENST")) {

                        let localLoaded = false;

                        try {



                            let try_local = `${host_}/transcript/${encodeURIComponent(ensembleId)}`;








                            let localJs = await GETJSON(try_local);


                            if (localJs && Array.isArray(localJs) && localJs.length > 0) {



                                let jsm = localJs[0];
                                for (let jl of localJs) {
                                    if (jl.feature === 'transcript') {
                                        jsm = jl;
                                        break;
                                    }
                                }

                                let desc =
                                    ((jsm.attributes && jsm.attributes.gene_name) || '') +
                                    ';' +
                                    ((jsm.attributes && jsm.attributes.transcript_name) || '');

                                let geneID = jsm.attributes?.ID || ensembleId;
                                let start = parseInt(jsm['start']);
                                let end = parseInt(jsm['end']);

                                let strand = jsm['strand'];
                                let chr = jsm['seqname'];

                                if (strand === '+' || parseInt(strand) > 0) {
                                    strand = 1;
                                } else {
                                    strand = -1;
                                }

                                let t = this.createTrack(ensembleId, start, end, strand);
                                t.transcriptID = ensembleId;
                                t.species = 'Human';
                                t.chr = chr;

                                const regex = /\d+/;
                                const match = String(t.chr).match(regex);
                                if (match) {
                                    t.chr = parseInt(match[0], 10);
                                }

                                console.log(" chromosome :" + t.chr);
                                t.description = desc;
                                t.geneID = geneID;

                                applyTrackViewport(t);

                                // try new local sequence+annotation endpoint first
                                let localTranscriptPayload = null;
                                try {
                                    const localTranscriptUrl =
                                        `${host_}/api/ensembl/transcript/${encodeURIComponent(ensembleId)}` +
                                        `?prefix=${encodeURIComponent(prefix)}`;

                                    const resp = await fetch(localTranscriptUrl);
                                    if (resp.ok) {
                                        localTranscriptPayload = await resp.json();
                                    }
                                } catch (e) {
                                    console.warn('Local sequence/annotation endpoint failed for transcript:', e);
                                }

                                if (localTranscriptPayload && localTranscriptPayload.sequence) {
                                    // assume local server already handled strand if needed
                                    t.setSequence(String(localTranscriptPayload.sequence).trim());
                                } else {
                                    let ensembl_sequence = `${prefix}/sequence/id/${ensembleId}?content-type=text/plain`;
                                    this.graph.setMessage(" Loading sequence " + prefix)
                                    let fasta = await GETXT(ensembl_sequence);
                                    setTrackSequenceFromRawFasta(t, fasta);
                                }

                                if (
                                    localTranscriptPayload &&
                                    localTranscriptPayload.annotations &&
                                    Array.isArray(localTranscriptPayload.annotations)
                                ) {
                                    let annotations = this.createTrackFromLocal(localTranscriptPayload.annotations);
                                    for (let an of annotations) {
                                        t.add(an);
                                    }
                                } else {
                                    let annotations = this.createTrackFromLocal(localJs);
                                    for (let an of annotations) {
                                        t.add(an);
                                    }
                                }

                                t.generateORF();
                                localLoaded = true;
                                return t;
                            }
                        } catch (localException) {



                            console.warn('Local transcript lookup failed, falling back to Ensembl REST:', localException);
                        }

                        // ------------------------------------------------------------
                        // 2. Fallback for ENST ids to Ensembl REST
                        // ------------------------------------------------------------
                        if (!localLoaded) {
                            try {


                                js = await GETJSON(
                                    `${prefix}/lookup/id/${ensembleId}?expand=1;content-type=application/json`
                                );
                            } catch (restException) {
                                console.error('Ensembl REST lookup failed for transcript:', restException);
                                throw restException;
                            }
                        }
                    } else {
                        // ------------------------------------------------------------
                        // 3. Non-ENST: use Ensembl REST lookup
                        // ------------------------------------------------------------
                        js = await GETJSON(
                            `${prefix}/lookup/id/${ensembleId}?expand=1;content-type=application/json`
                        );
                    }
                } catch (exception) {
                    console.warn('Primary lookup failed, retrying Ensembl REST:', exception);
                    js = await GETJSON(
                        `${prefix}/lookup/id/${ensembleId}?expand=1;content-type=application/json`
                    );
                }

                if (!js) {
                    console.log(" ensembl " + `${prefix}/lookup/id/${ensembleId}?expand=1;content-type=application/json`);
                    js = await GETJSON(
                        `${prefix}/lookup/id/${ensembleId}?expand=1;content-type=application/json`
                    );
                }

                if (!js) {
                    return null;
                }

                // ------------------------------------------------------------
                // 4. Gene object -> let loadEnsembleGene() handle local-first logic
                // ------------------------------------------------------------
                if (js['object_type'] === 'Gene') {
                    let t = await this.loadEnsembleGene(js, prefix);
                    return t;
                }

                // ------------------------------------------------------------
                // 5. Transcript or other feature object from Ensembl REST
                // ------------------------------------------------------------
                let species = js['species'];
                let chromosome = js['seq_region_name'];
                let start = +js['start'];
                let end = +js['end'];
                let strand = js['strand'];
                let geneID = js['Parent'];
                let desc = js['display_name'];

                let t = this.createTrack(ensembleId, start, end, strand);

                t.transcriptID = ensembleId;
                t.species = species;
                t.chr = chromosome;
                t.description = desc;
                t.geneID = geneID;

                applyTrackViewport(t);

                // try local sequence/annotation first here too
                let usedLocalPayload = false;
                try {
                    const localTranscriptUrl =
                        `${host_}/api/ensembl/transcript/${encodeURIComponent(ensembleId)}` +
                        `?prefix=${encodeURIComponent(prefix)}`;

                    const resp = await fetch(localTranscriptUrl);
                    if (resp.ok) {
                        const localPayload = await resp.json();

                        if (localPayload && localPayload.sequence) {
                            t.setSequence(String(localPayload.sequence).trim());
                            usedLocalPayload = true;
                        }

                        if (
                            localPayload &&
                            localPayload.annotations &&
                            Array.isArray(localPayload.annotations)
                        ) {
                            let annotations = this.createTrackFromLocal(localPayload.annotations);
                            for (let an of annotations) {
                                t.add(an);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Local transcript payload failed, using Ensembl fallback:', e);
                }

                if (!usedLocalPayload) {
                    let ensembl_sequence = `${prefix}/sequence/id/${ensembleId}?content-type=text/plain`;
                    let fasta = await GETXT(ensembl_sequence);
                    setTrackSequenceFromRawFasta(t, fasta);
                    this.buildENSEMBLAnnotations(t, js);
                }

                return t;
            }
            addNCBI(ncbi, x, y) {

                exec('baja/ncbi/get-transcript.js', ncbi).then(async (js) => {
                    if (js) {
                        let start = +js['start']
                        let end = +js['end']
                        let strand = js['strand']
                        let t = this.createTrack(ncbi, start, end, strand);
                        if (x) {
                            t.tgraph.xi = x;
                        }
                        if (y) {
                            t.tgraph.yi = y;

                            this.graph.setymax(t.tgraph.yi + 1);
                            this.graph.setymin(t.tgraph.yi - 2);
                        } else {
                            this.graph.setymax(t.tgraph.yi + 1);
                            this.graph.setymin(t.tgraph.yi - 2);
                        }
                        let xm = 0.1 * t.tgraph.width
                        this.graph.setxmin(t.tgraph.xi - xm);
                        this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);

                        this.graph.rescale();
                        let sequence = js['sequence']
                        sequence = sequence.trim();
                        t.setSequence(sequence)
                        this.buildNCBIAnnotations(t, js);
                    }
                })
            }
            removeTrack(trackOrIndex) {
                let index;

                if (typeof trackOrIndex === 'number') {

                    index = trackOrIndex;
                } else if (trackOrIndex && trackOrIndex.id !== undefined) {

                    index = this.track.findIndex(t => t.id === trackOrIndex.id);
                }

                if (index !== undefined && index !== -1) {
                    this.track.splice(index, 1);
                }
            }

            removeAll(items) {
                this.currentShape = null;
                if (items != null && items.length > 0) {
                    for (let i of items) {
                        let index = 0;
                        let ns = []
                        for (let s of this.shapes) {
                            if (i == s) {
                            } else {
                                ns.push(s);
                            }
                            index++;
                        }
                        if (ns.length != this.shapes.length) {
                            this.shapes = ns;
                        }
                    }
                }
            }

            markTrack(trackIndex, start) {
                if (this.track[trackIndex])
                    this.track[trackIndex].markstart = start;
            }

            markTrackRange(trackIndex, start, end) {
                if (this.track[trackIndex].markstart) {
                    this.track[trackIndex].markstart = start;
                    this.track[trackIndex].markend = end;
                }
            }

            clearTracks() {
                this.track = [];
                this.notifyTrackListener();
            }

            getSelectedTracks() {
                let s = []
                for (let t of this.track) {
                    if (t.isSelected())
                        s.push(t)
                }
                return s;
            }

            isPointInPolygon = (point, polygon) => {
                if (!Array.isArray(polygon) || !polygon.length) return false;
                let inside = false;
                const x = point.x;
                const y = point.y;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].x, yi = polygon[i].y;
                    const xj = polygon[j].x, yj = polygon[j].y;
                    const intersect =
                        ((yi > y) !== (yj > y)) &&
                        (x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi);

                    if (intersect) inside = !inside;
                }
                return inside;
            };

            getMarkSelectedTracks() {
                let s = []
                for (let t of this.track) {
                    if (t.markstart >= 0 && t.markend > t.markstart)
                        s.push(t)
                }

                return s;
            }

            async ___setTrack(js) {
                return new Promise(async (resolve, reject) => {
                    let SnpIndel = await exec('flexigraph/snpindel.js')
                    let NMDAnnotation = await exec('baja/bio/splicing/nmd-annotation.js')
                    let RNASecondaryStructure = await exec('baja/structure/rna-secondary-structure-track.js')
                    let AttributionLayer = await exec('baja/bio/attribution-layer.js')
                    let MutationAnnotation = await exec('flexigraph/mutation-annotation.js')
                    let SIRNA = await exec('flexigraph/sirna.js')
                    let Amplicon = await exec('flexigraph/amplicon.js')
                    let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')

                    var foo = Object.assign(new Track(), js);
                    let Barchart = await exec('baja/bio/barchart-track.js')

                    if (js.sequence != null && js.sequence.length > 0) {

                        foo.sequence = js.sequence;
                    } else {
                        try {
                            let prefix = `https://rest.ensembl.org`;
                            let ensembl_sequence = prefix + `/sequence/id/${js.id}?content-type=text/plain`;
                            let fasta = GETXT(ensembl_sequence)
                            if (fasta && fasta.length > 0) {
                                fasta = fasta.trim();
                                if (foo.strand < 0) {
                                    let temp = '';
                                    for (let c = fasta.length - 1; c > 0; c--) {
                                        temp += fasta[c]
                                    }
                                    foo.sequence = temp.trim()
                                } else {
                                    foo.sequence = fasta
                                }
                            }
                        } catch (exception) {

                        }

                    }

                    if (js.track_layers != null && js.track_layers.length > 0) {
                        let tlayers = []
                        for (let tl of js.track_layers) {

                            console.log(" tl type : " + tl.attribution_type + " for name " + tl.name);
                            let track_layer = null;

                            if (!tl.attribution_type) {
                                track_layer = Object.assign(new TrackLayer(), tl)
                                track_layer.name = sanitizeName(track_layer.name)

                            }
                            else if (tl.attribution_type != null && tl.attribution_type.includes('attribution')) {
                                track_layer = Object.assign(new AttributionLayer(), tl)

                            } else
                                if (tl.gpts || tl.apts || tl.cpts || tl.tpts) {
                                    track_layer = Object.assign(new AttributionLayer(), tl)

                                } else

                                    if (tl.type === 'AttributionSushimiLayer') {
                                        track_layer = Object.assign(new AttributionSushimiLayer(), tl);
                                    }
                                    else {
                                        track_layer = Object.assign(new TrackLayer(), tl)
                                        track_layer.name = sanitizeName(track_layer.name)

                                    }
                            if (!track_layer) {
                                track_layer = Object.assign(new TrackLayer(), tl)
                                track_layer.name = sanitizeName(track_layer.name)

                            } else {
                                track_layer.svgs = []
                                if (tl.svgs && tl.svgs.length > 0) {
                                    for (let tli of tl.svgs) {
                                        track_layer.svgs.push(tli)
                                    }
                                }
                            }
                            track_layer.tgraph = Object.assign(new MGrid(), tl.tgraph)
                            let tann = []
                            if (tl.annotations && tl.annotations.length > 0) {
                                for (let __a of tl.annotations) {
                                    if (__a.type === 'NMD') {
                                        __a.shapeFunction = getIon(shapes[__a.type])
                                        tann.push(Object.assign(new NMDAnnotation(), __a))
                                    } else {
                                        __a.shapeFunction = getIon(shapes[__a.type])
                                        tann.push(Object.assign(new Annotation(), __a))
                                    }
                                }
                            }
                            track_layer.annotations = tann;
                            tlayers.push(track_layer)
                        }
                        foo.track_layers = tlayers;
                    }

                    let annn = []
                    if (js.annotations && js.annotations.length > 0) {
                        for (let a of js.annotations) {
                            if (a.type === 'NMD') {
                                a.shapeFunction = getIon(shapes[a.type])
                                annn.push(Object.assign(new NMDAnnotation(), a))
                            } else {
                                a.shapeFunction = getIon(shapes[a.type])
                                annn.push(Object.assign(new Annotation(), a))
                            }
                        }
                    }

                    if (js.ampliconResults) {
                        this.track.ampliconResults = js.ampliconResults;
                    }

                    let o = []
                    if (js.oligos && js.oligos.length > 0 && js.oligos[0]) {
                        for (let a of js.oligos) {
                            if (a != null) {
                                if (a.type === 'amplicon') {
                                    let leftOligo = Object.assign(new Oligo(), a['left'])
                                    let rightOligo = Object.assign(new Oligo(), a['right'])
                                    let midOligo = Object.assign(new Oligo(), a['mid'])
                                    let ampliconObject = Object.assign(new Amplicon(), a)
                                    ampliconObject.left = leftOligo;
                                    ampliconObject.mid = midOligo;
                                    ampliconObject.right = rightOligo;
                                    o.push(ampliconObject)
                                } else
                                    if (a.type.toUpperCase() === 'SIRNA') {
                                        o.push(Object.assign(new SIRNA(), a))
                                    } else
                                        o.push(Object.assign(new Oligo(), a))
                            }
                        }
                    }
                    const dbhost = window["env"]["db"];
                    if (dbhost) {

                        if (o != null && o.length > 0) {
                            for (let i = 0; i < o.length; i += 20) {
                                let batch = o.slice(i, i + 20)
                                    .filter(_o => _o.synthesisSequence && _o.structure &&
                                        _o.synthesisSequence.length > 0 && _o.structure.length > 0)
                                    .map(_o => ({
                                        id: _o.id,
                                        name: _o.name,
                                        synthesisSequence: _o.synthesisSequence,
                                        structure: _o.structure
                                    }));

                                let r = await POSTJSON(batch, `${dbhost}/verify`);
                                let keys = Object.keys(r);
                                for (let k of keys) {
                                    for (let _o of o) {
                                        const key = `${_o.synthesisSequence}-${_o.structure}`;
                                        if (k === key && (r[k].id)) {
                                            _o.id = r[k].id
                                        }
                                    }
                                }
                            }

                        }
                    }
                    let sids = [];
                    if (js.snpindels && js.snpindels.length > 0 && js.snpindels[0]) {
                        for (let sid of js.snpindels) {
                            if (sid.type === 'mutation-annotation') {
                                let s = new MutationAnnotation(sid.type, sid.xi, sid.xf, sid.name, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset)
                                if (s.setAnnotation)
                                    s.setAnnotation(sid.annotations);
                                sids.push(s);
                            } else {
                                let s = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset)
                                s.setAnnotation(sid.annotations);
                                sids.push(s);
                            }
                        }
                    }

                    let struct = [];
                    if (js.structures && js.structures.length > 0 && js.structures[0]) {
                        for (let strc of js.structures) {
                            let rna = new RNASecondaryStructure(strc.name, strc.xi, strc.xf, strc.sequence, strc.strand);
                            rna.pos = strc.pos;
                            rna.tgraph.xi = strc.tgraph.xi;
                            rna.tgraph.yi = strc.tgraph.yi;
                            rna.anchorX = strc.anchorX;
                            rna.anchorY = strc.anchorY;
                            rna.xindex_start = strc.xindex_start;

                            if (strc.designs)
                                rna.designs = strc.designs;

                            let temp_grid = Object.assign(new MGrid(), strc.tgraph);
                            rna.tgraph = temp_grid;
                            struct.push(rna);
                        }
                    }

                    let plots = []
                    if (js.plots && js.plots.length > 0 && js.plots[0]) {
                        for (let a of js.plots) {
                            if (a.mg != null) {
                                let tp = Object.assign(new TrackPlot(), a)
                                let amg = Object.assign(new MGrid(), a.mg);
                                tp.mg = amg;
                                plots.push(tp)
                            } else {
                                let tp = Object.assign(new Barchart(), a)
                                plots.push(tp)
                            }
                        }
                    }
                    let temp_grid = Object.assign(new MGrid(), js.tgraph);
                    foo.tgraph = temp_grid;
                    foo.oligos = o;
                    foo.snpindels = sids;
                    foo.annotations = annn;
                    foo.plots = plots;
                    foo.structures = struct;
                    if (js.trackRef && js.trackRef.track && js.trackRef.track.name) {
                        let tra = await this.___setTrack(js.trackRef.track);
                        if (tra != null) {
                            foo.trackRef = new TrackRef(tra, js.trackRef.xi, js.trackRef.xf);
                        }
                    }
                    if (this.trackAlreadyNamed(foo.name)) {
                        foo.name = foo.name + '_'
                    }

                    this.track.push(foo);

                    return resolve(foo);
                });
            }

            trackAlreadyNamed(name) {

                if (name == null) {
                    return true

                }
                for (let t of this.track) {
                    if (t.name != null && t.name.toUpperCase() === name.toUpperCase()) {
                        return true;
                    }
                    return false;
                }

            }

            async setTrack(js) {
                let Amplicon = await exec('flexigraph/amplicon.js')

                var foo = Object.assign(new Track(), js);

                let annn = []
                if (foo.annotations && foo.annotations.length > 0) {
                    for (let a of foo.annotations) {
                        a.shapeFunction = getIon(shapes[a.type])
                        annn.push(Object.assign(new Annotation(), a))
                    }
                }
                let o = []
                if (foo.oligos && foo.oligos.length > 0 && foo.oligos[0]) {
                    for (let a of js.oligos) {
                        if (a != null) {

                            if (a.type === 'amplicon') {
                                let leftOligo = Object.assign(new Oligo(), a['left'])
                                let rightOligo = Object.assign(new Oligo(), a['right'])
                                let ampliconObject = Object.assign(new Amplicon(), a)
                                ampliconObject.left = leftOligo;
                                ampliconObject.right = rightOligo;
                                o.push(ampliconObject)
                            } else
                                o.push(Object.assign(new Oligo(), a))
                        }
                    }
                }

                const dbhost = window["env"]["db"];
                if (dbhost) {
                    if (o != null && o.length > 0) {
                        for (let i = 0; i < o.oligos.length; i += 20) {
                            let batch = o.slice(i, i + 20)
                                .filter(_o => _o.synthesisSequence && _o.structure &&
                                    _o.synthesisSequence.length > 0 && _o.structure.length > 0)
                                .map(_o => ({
                                    id: _o.id,
                                    name: _o.name,
                                    synthesisSequence: _o.synthesisSequence,
                                    structure: _o.structure
                                }));

                            let r = await POSTJSON(batch, `${dbhost}/verify`);
                            let keys = Object.keys(r);

                            for (let k of keys) {
                                for (let _o of batch) {
                                    const key = `${_o.synthesisSequence}-${_o.structure}`;
                                    if (k === key && (r[k].id)) {
                                        _o.id = r[k].id;
                                    }
                                }
                            }
                        }

                    }
                }
                foo.oligos = o;
                foo.annotations = annn;
                if (foo.y > this.graph.getymax()) {
                    this.graph.setymax(foo.y + 1)
                    this.graph.rescale();
                }
                this.track[foo.y] = foo;

                this.zoom(foo.xi - 10, foo.xf + 10);
                this.graph.setymax(this.track.length + 1)

                let tlayers = []
                if (foo.track_layers && foo.track_layers.length > 0) {
                    for (let foo of foo.track_layers) {
                        let tannn = []
                        let t = Object.assign(new TrackLayer(), foo)
                        t.name = sanitizeName(track_layer.name)

                        if (foo.annotations && foo.annotations.length > 0) {
                            for (let __a of foo.annotations) {
                                __a.shapeFunction = getIon(shapes[__a.type])
                                tannn.push(Object.assign(new Annotation(), __a))
                            }

                        }
                        t.annotations = tann;
                    }
                    tlayers.push(t);
                }
                this.track.track_layers = tlayers;

                this.notifyTrackListener();
            }

            notifyTrackListener() {
                if (this.listener) {
                    this.listener(this.track);
                }
            }

            addFASTA(fasta, x, y) {

                let lines = fasta.split('\n')
                let title = lines[0]
                let sequence = '';
                for (let i = 1; i < lines.length; i++) {
                    sequence += lines[i].trim();
                }
                let t = this.createTrack(title, 0, sequence.length, '+');
                t.setSequence(sequence)
                if (x) {
                    t.tgraph.xi = x;
                }
                if (y) {
                    t.tgraph.yi = y;
                }
                let xm = 0.1 * t.tgraph.width
                this.graph.setxmin(t.tgraph.xi - xm);
                this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);
                this.graph.rescale();
            }

            fasta(fasta) {
                this.addFASTA(fasta)
            }

            getxmin = () => {
                return this.graph.getxmin();
            }
            getxmax = () => {
                return this.graph.getxmax();
            }
            getymin = () => {
                return this.graph.getymin();
            }
            getymax = () => {
                return this.graph.getymax();
            }
            async zoom(min, max) {
                if (this.animating) {
                    this.animating = false;
                    return;
                }
                await this.graph.zoom(min, max);
                this.graph.rescale();
            }
            async zoomRect(xmin, xmax, ymin, ymax, incr) {
                if (this.animating) {
                    this.animating = false;
                    return;
                }

                await this.animateTo(xmin, xmax, ymin, ymax, incr)
            }

            async zoomXY(xmin, xmax, ymin, ymax) {
                if (this.animating) {
                    this.animating = false;
                    return;
                }
                await this.zoomRect(xmin, xmax, ymin, ymax, 30)
            }
            rescale() {
                this.graph.rescale();
            }

            X(wc) {
                return this.graph.X(wc);
            }
            Y(wc) {
                return this.graph.Y(wc);
            }

            Xwc(x) {
                return this.graph.Xwc(x);
            }
            Ywc(y) {
                return this.graph.Ywc(y);
            }
            worldWidth(w) {
                return this.graph.worldWidth(w);
            }
            worldHeight(w) {
                return this.graph.worldHeight(w);
            }

            screenWidth(w) {
                return this.graph.grid.screenWidth(w);
            }
            screenHeight(h) {
                return this.graph.grid.screenHeight(h);
            }

            drawImage(src, x, y, w, h) {
                this.graph.drawImage(src, x, y, w, h);
            }

            showBookmarkMenu(expand) {
                this.showBookmarks = !this.showBookmarks;
            }

            lock = false;
            async buildBookmark() {
                let list = Object.keys(this.bookmarks);
                let m = []
                for (let l of list) {

                    let obj = this.bookmarks[l]
                    if (obj['path']) {

                        m.push({
                            label: l,
                            click: async (xwc, ywc) => {
                                if (this.lock)
                                    return;
                                let bm = this.bookmarks[l]
                                this.lock = true;
                                await this.loadChapter(obj['path'], true);
                                this.lock = false;

                                setTimeout(async () => {
                                    if (this.bookmarks && this.bookmarks.length > 0) {
                                        let list = Object.keys(this.bookmarks);
                                        await this.goToBookmark(this.bookmarks[list[0]])
                                    }

                                }, 1000)

                            },
                            move: () => {
                            }
                        })

                    } else {

                        m.push({
                            label: l,
                            click: async (xwc, ywc) => {
                                if (this.lock)
                                    return;
                                let bm = this.bookmarks[l]
                                this.lock = true;
                                await this.goToBookmark(bm);
                                this.lock = false;
                            },
                            move: () => {
                            }
                        })
                    }
                }
                let ChapterMenu;
                if (!isMobile())
                    ChapterMenu = await exec('flexigraph/menu-chapter.js')
                else
                    ChapterMenu = await exec('flexigraph/menu-chapter-m.js')

                this.bookmark_menu = new Menu(m, this.graph.Xwc(100), this.graph.Ywc(100), 'navy', 'yellow', 2);

                this.bookmark_menu.title = ''
            }

            buildENSEMBLAnnotations(t, js) {
                let orig = js['object_type'];
                if (js['object_type'] === 'Transcript' || orig === 'Gene') {

                    let exons = js['Exon'];
                    if (exons) {
                        for (let exon of exons) {
                            console.log(exon['object_type'])

                            t.add(new Annotation(exon['object_type'], exon['id'], exon['start'], exon['end']))

                        }
                    }

                    let tr = js['Translation'];
                    if (tr) {
                        let strand = t.strand;
                        let start = tr['start'];
                        let cend = tr['end']
                        if (strand > 0) {
                            let annotation = new Annotation('TSS', 'TSS', start, start + 3)
                            t.add(annotation)
                            t.add(new Annotation('Translation', 'Translation', start, cend))
                        }
                        else {
                            let annotation = new Annotation('TSS', 'TSS', cend - 2, cend + 1)
                            t.add(annotation)
                            t.add(new Annotation('Translation', 'Translation', cend + 1, start))

                        }

                    }
                }
                t.generateORF();
            }

            async getState() {

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
                                write('"[c_c]"');
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

                const progressBar = (pct) => {
                    console.log(" State " + pct)
                }

                const gs = await stringifyGraphAsync(this, progressBar);
                return gs;
            }

            async setState(state) {
                for (let t of state.track) {
                    await this.___setTrack(t)
                    this.zoomRect(t.tgraph.xi - 100, t.tgraph.xi + t.tgraph.width + 100, t.tgraph.yi + 10, -1 * 10)
                }

            }

            buildNCBIAnnotations(t, js) {
                if (js['object_type'] === 'Transcript') {
                    let cds = js['CDS'];
                    if (!cds) {
                        cds = js['cds']
                    }
                    if (cds && cds.length > 0) {
                        for (let c of cds) {
                            t.add(new Annotation('CDS', c['id'], c['start'], c['end']))
                            let id = c['id']
                            if (id != null && (!isNaN(id))) {
                                id = id;
                            }

                            if (id === 1) {

                                let strand = t.strand;

                                let start = c['start'] + 1
                                let end = start + 3;
                                if (strand < 0) {
                                    end = c['start'] + 1
                                    start = end - 3;
                                }
                                let annotation = new Annotation('TSS', 'TSS', start, end)
                                if (strand > 0)
                                    t.add(new Annotation('Translation', 'Translation', start))
                                else
                                    t.add(new Annotation('Translation', 'Translation', end))

                                let sequence = t.getSequenceRange(annotation.xi, annotation.xf)
                                console.log(' sequence ' + sequence);
                                t.add(annotation)
                            }

                        }
                    }

                    let exons = js['Exon'];
                    if (exons) {
                        for (let exon of exons) {
                            console.log(exon['object_type'])

                            t.add(new Annotation(exon['object_type'], exon['id'], exon['start'], exon['end']))

                        }
                    }
                    let tr = js['Translation'];
                    if (tr) {
                        t.add(new Annotation(tr['object_type'], tr['id'], tr['start'], tr['end']))
                    }
                }
            }

            fade = false;
            autosave = false;
            saving = false;
            async saveState() {
                this.saving = true;
                let name = '.current.screen'
                let currentPath = '.'
                const seenObjects = new WeakSet();
                let gs = JSON.stringify(this, function (key, value) {
                    if (key === 'canvas') {
                        return;
                    }
                    if (typeof value === 'object' && value !== null) {
                        if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                            return value;
                        } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                            return value;
                        }
                        else {
                            if (seenObjects.has(value)) {
                                return '[a_c]';
                            }
                            seenObjects.add(value);
                        }
                    }
                    return value;
                });
                if (!name.endsWith('.screen')) {
                    name = name + '.screen'
                }
                let host_ = window['env']['apiUrl']
                let jsonobj = {
                    "name": name,
                    "key": "user",
                    "user": getUser(),
                    "spath": '.',
                    "value": gs
                }
                if (currentPath === '.') {
                    currentPath = '/' + getUser();
                }
                let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');
                this.saving = false;

            }

            async isPreviousState() {
                let host_ = window['env']['apiUrl']
                let rf = await GETJSON(host_ + '/get-folder?key=user&path=' + getUser() + '&filetype=.screen')
                let ch = rf.children;
                if (ch && ch.length > 0)
                    for (let i of ch) {
                        if (i && i.path.endsWith('/.current.screen')) {
                            return true;
                        }
                    }
                return false;
            }

            findNextPlotPosition(startx, starty, newPlotWidth, newPlotHeight, maxwidth) {
                let plots = this.plots;
                let margin = 10;

                let maxX = startx;
                let maxY = starty;

                plots.forEach(plot => {

                    let plotRightEdge = plot.grid.xi + plot.grid.width;
                    let plotBottomEdge = plot.grid.yi - plot.grid.height;

                    if (plotRightEdge > maxX) {
                        maxX = plotRightEdge;
                    }
                    if (plot.grid.yi > maxY) {
                        maxY = plot.grid.yi;
                    }
                });

                let newPlotX = maxX + margin;
                let newPlotY = maxY;

                let isOverlapping = (x, y, width, height) => {
                    return plots.some(plot => {
                        let plotRightEdge = plot.grid.xi + plot.grid.width;
                        let plotBottomEdge = plot.grid.yi - plot.grid.height;
                        return !(x + width < plot.grid.xi ||
                            x > plotRightEdge ||
                            y - height > plot.grid.yi ||
                            y < plotBottomEdge);
                    });
                };

                while (isOverlapping(newPlotX, newPlotY, newPlotWidth, newPlotHeight)) {

                    newPlotX += newPlotWidth + margin;

                    if (newPlotX + newPlotWidth > maxwidth) {
                        newPlotX = margin;
                        newPlotY -= newPlotHeight + margin;
                    }
                }

                return { x: newPlotX, y: newPlotY };
            }

            __panRaf__ = false;

            panGridSlide(direction, opts = {}) {

                if (this.graph.mode == 'bpx') {
                    return;
                }

                if (this.__panRaf__) {
                    cancelAnimationFrame(this.__panRaf__);
                    this.__panRaf__ = null;
                }

                const canvas = this.graph.canvas.canvas.nativeElement;

                const dir = {
                    right: { x: 1, y: 0 },
                    left: { x: -1, y: 0 },
                    up: { x: 0, y: -1 },
                    down: { x: 0, y: 1 },
                }[direction];
                if (!dir) throw new Error("direction must be one of: right, left, up, down");

                const duration = opts.duration ?? 500;
                const easing = opts.easing ?? ((t) => 1 - Math.pow(1 - t, 3));

                const sx0 = opts.fromScreen?.x ?? canvas.width / 2;
                const sy0 = opts.fromScreen?.y ?? canvas.height / 2;

                let distancePx;
                if (typeof opts.distanceFrac === "number") {
                    const axisLen = (dir.x !== 0) ? canvas.width : canvas.height;
                    distancePx = axisLen * opts.distanceFrac;
                } else if (typeof opts.distancePx === "number") {
                    distancePx = opts.distancePx;
                } else {

                    distancePx = (dir.x !== 0) ? canvas.width * 0.3 : canvas.height * 0.3;
                }

                const dxScreen = dir.x * distancePx;
                const dyScreen = dir.y * distancePx;

                const wx0 = this.graph.grid.Xwc(sx0);
                const wy0 = this.graph.grid.Ywc(sy0);
                const wx1 = this.graph.grid.Xwc(sx0 + dxScreen);
                const wy1 = this.graph.grid.Ywc(sy0 + dyScreen);
                const dxWorld = wx1 - wx0;
                const dyWorld = wy1 - wy0;

                const xmin0 = this.graph.grid.getxmin();
                const ymin0 = this.graph.grid.getymin();
                const xmax0 = this.graph.grid.getxmax();
                const ymax0 = this.graph.grid.getymax();

                const xminT = xmin0 - dxWorld;
                const xmaxT = xmax0 - dxWorld;
                const yminT = ymin0 - dyWorld;
                const ymaxT = ymax0 - dyWorld;

                const start = performance.now();

                const step = (now) => {
                    const t = Math.min(1, (now - start) / duration);
                    const p = easing(t);

                    const xmin = xmin0 + (xminT - xmin0) * p;
                    const xmax = xmax0 + (xmaxT - xmax0) * p;
                    const ymin = ymin0 + (yminT - ymin0) * p;
                    const ymax = ymax0 + (ymaxT - ymax0) * p;

                    this.graph.grid.setxmin(xmin);
                    this.graph.grid.setxmax(xmax);
                    this.graph.grid.setymin(ymin);
                    this.graph.grid.setymax(ymax);
                    this.graph.grid.rescale();

                    if (typeof opts.onFrame === "function") opts.onFrame(p);

                    if (t < 1) {
                        this.__panRaf__ = requestAnimationFrame(step);
                    } else {
                        this.__panRaf__ = null;
                        if (typeof opts.onDone === "function") opts.onDone();
                    }
                };

                this.__panRaf__ = requestAnimationFrame(step);
            }

            async init() {
                const inCircle = (x, y, cx, cy, r = 12) => {
                    const dx = x - cx, dy = y - cy;
                    return (dx * dx + dy * dy) <= r * r;
                };
                this.bookmarkMouseDownListener = (xwc, ywc) => {
                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph, (xwc), (ywc))) {
                        this.showBookmarks = false;
                        return this.bookmark_menu.mouseUp(this.graph, (xwc), (ywc))
                    }
                }
                this.bookmarkMouseUpListener = (xwc, ywc) => {
                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph, (xwc), (ywc))) {
                        this.bookmark_menu.mouseUp(this.graph, (xwc), (ywc))
                        this.showBookmarks = false;
                    }
                }
                this.bookmarkMouseMoveListener = (xwc, ywc) => {

                    if (this.bookmark_menu && this.showBookmarks && this.bookmark_menu.isIn(this.graph, (xwc), (ywc))) {
                        this.setMouseMode('bookmark')
                        return this.bookmark_menu.mouseMove(this.graph, (xwc), (ywc))
                    } else {
                        if (this.bookmark_menu)
                            this.bookmark_menu.dehighlight();
                    }
                }
                this.chapterMouseDownListener = (xwc, ywc) => {
                    if (this.chapter_menu && this.showChapters && this.chapter_menu.isIn(this.graph, (xwc), (ywc))) {
                        this.chapter_menu.mouseUp(this.graph, (xwc), (ywc))
                    }
                }
                this.chapterMouseUpListener = (xwc, ywc) => {
                    if (this.chapter_menu && this.showChapters && this.chapter_menu.isIn(this.graph, (xwc), (ywc))) {
                        this.chapter_menu.mouseUp(this.graph, (xwc), (ywc))
                    }
                }
                this.chapterMouseMoveListener = async (xwc, ywc) => {
                    if (this.chapter_menu && this.showChapters && this.chapter_menu.isIn(this.graph, (xwc), (ywc))) {
                        return await this.chapter_menu.mouseMove(this.graph, xwc, ywc)
                    } else {
                        if (this.chapter_menu)
                            this.chapter_menu.dehighlight();
                    }
                }
                this.graphListener = (xwc, ywc) => {
                }
                this.pinchListener = (evt) => {
                    this.clearMouseListeners();
                    this.setMouseMode('navigate')
                    if (!this.prev) {
                        this.prev = evt
                    } else {
                        let xiw = this.graph.Xwc(evt.xi);
                        let xfw = this.graph.Xwc(evt.xf);
                        let diffii = (xfw - xiw);
                        let xip = this.graph.Xwc(this.prev.xi);
                        let xfp = this.graph.Xwc(this.prev.xf);
                        let diffpp = (xfp - xip);
                        let p = (diffpp - diffii);
                        if (this.prev.xf - this.prev.xi < 0) {
                            p = p * (-1)
                        }
                        let yiw = this.graph.Ywc(evt.yi);
                        let yfw = this.graph.Ywc(evt.yf);
                        let current_dif_y = (yfw - yiw);
                        let yip = this.graph.Ywc(this.prev.yi);
                        let yfp = this.graph.Ywc(this.prev.yf);
                        let prev_dif_y = yfp - yip;
                        let yv = (current_dif_y - prev_dif_y) * (-2);
                        let xfactor = p;
                        let distanceY = yv;
                        if (this.prev.yi - this.prev.yf < 0) {
                            distanceY *= (-1)
                        }
                        this.graph.setymin(this.graph.getymin() - distanceY);
                        this.graph.getymax(this.graph.getymax() + distanceY);
                        this.graph.setxmin(this.graph.getxmin() - xfactor)
                        this.graph.setxmax(this.graph.getxmax() + xfactor)
                        this.prev = evt;
                    }
                }
                this.slideZoom = (l, ly, duration = 400) => {
                    const startXmin = this.graph.getxmin();
                    const startXmax = this.graph.getxmax();
                    const startYmin = this.graph.getymin();
                    const startYmax = this.graph.getymax();

                    const targetXmin = startXmin + l;
                    const targetXmax = startXmax - l;
                    const targetYmin = startYmin + ly;
                    const targetYmax = startYmax - ly;

                    const startTime = performance.now();

                    return new Promise(resolve => {
                        const animate = (now) => {
                            const t = Math.min(1, (now - startTime) / duration);

                            const eased = t * t * (3 - 2 * t);

                            const xmin = startXmin + (targetXmin - startXmin) * eased;
                            const xmax = startXmax + (targetXmax - startXmax) * eased;
                            const ymin = startYmin + (targetYmin - startYmin) * eased;
                            const ymax = startYmax + (targetYmax - startYmax) * eased;

                            this.zoomXY(xmin, xmax, ymin, ymax);

                            if (t < 1) {
                                requestAnimationFrame(animate);
                            } else {
                                resolve();
                            }
                        };

                        requestAnimationFrame(animate);
                    });
                }

                this.slideZoomByFactor = async (fx = 1.25, fy = 1.25, duration = 400) => {
                    const xmin0 = this.graph.getxmin(), xmax0 = this.graph.getxmax();
                    const ymin0 = this.graph.getymin(), ymax0 = this.graph.getymax();
                    const cx = (xmin0 + xmax0) / 2;
                    const cy = (ymin0 + ymax0) / 2;

                    const halfW0 = (xmax0 - xmin0) / 2;
                    const halfH0 = (ymax0 - ymin0) / 2;

                    const halfW1 = halfW0 * fx;
                    const halfH1 = halfH0 * fy;

                    const xmin1 = cx - halfW1, xmax1 = cx + halfW1;
                    const ymin1 = cy - halfH1, ymax1 = cy + halfH1;

                    return this.slideZoomTo(xmin1, xmax1, ymin1, ymax1, duration);
                }

                this.slideZoomTo = async (xmin, xmax, ymin, ymax, duration = 400) => {
                    const sx0 = this.graph.getxmin(), ex0 = this.graph.getxmax();
                    const sy0 = this.graph.getymin(), ey0 = this.graph.getymax();
                    const t0 = performance.now();

                    return new Promise(resolve => {
                        const step = (now) => {
                            const t = Math.min(1, (now - t0) / duration);
                            const e = t * t * (3 - 2 * t);
                            this.zoomXY(
                                sx0 + (xmin - sx0) * e,
                                ex0 + (xmax - ex0) * e,
                                sy0 + (ymin - sy0) * e,
                                ey0 + (ymax - ey0) * e
                            );
                            if (t < 1) requestAnimationFrame(step); else resolve();
                        };
                        requestAnimationFrame(step);
                    });
                }

                this.mouseDownListener = async (xwc, ywc) => {
                    this.initDwn = { x: this.graph.X(xwc), y: this.graph.Y(ywc) };
                    this.prev = null;
                    this.xwc = xwc;
                    this.ywc = ywc;
                    let xs = this.graph.X(xwc);
                    let ys = this.graph.Y(ywc);
                    this.graph.mousex = xwc
                    if (!isMobile()) {
                        if (this.side_menu && this.side_menu.isIn(this.graph, xwc, ywc)) {
                            await this.side_menu.mouseUp(this.graph, xwc, ywc)
                            return;
                        }
                        else {
                            this.side_menu = null;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 160 && ys < 180) {
                            this.bclick = 'zoom_in';
                            setTimeout(() => {
                                this.bclick = '';
                                this.setMouseMode('navigate');
                            }, 400);
                            this.graph.rescale();
                            await this.slideZoomByFactor(0.5, 0.5, 200);
                            return;
                        }
                        if (xs >= 10 && xs < 30 && ys >= 190 && ys < 225) {
                            this.bclick = 'zoom_out';
                            setTimeout(() => {
                                this.___folder_calculation = false;
                                this.___folder_calculation_status = null;
                                this.bclick = '';
                                this.setMouseMode('navigate');
                            }, 400);
                            await this.slideZoomByFactor(1.50, 1.20, 200);
                            return;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 230 && ys < 250) {
                            this.bclick = 'navigate';
                            this.setMouseMode('navigate');
                            setTimeout(() => { this.bclick = ''; }, 100);
                            this.___folder_calculation = false;
                            this.___folder_calculation_status = null;

                            return;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 265 && ys < 285) {
                            this.clearMouseListeners();
                            this.setMouseMode('bpx');
                            this.bclick = 'bpx';
                            setTimeout(() => { this.bclick = ''; }, 100);
                            this.setMessage(" Drag a rectangle ");
                            this.___folder_calculation = false;
                            this.___folder_calculation_status = null;
                            this.addMouseDownListener(async (x, y) => {
                                this.md = true;
                                this.currentShape = new Rectangle('test', x, y);
                                this.currentShape.w = 0;
                                this.currentShape.h = 0;
                            });
                            this.addMouseMoveListener((x, y) => {
                                if (!this.md) { this.currentShape = null; return; }
                                if (this.currentShape != null) this.currentShape.update(x, y);
                            });
                            this.addMouseUpListener(async (x, y) => {
                                if (this.currentShape != null) {
                                    let height = this.currentShape.y + this.currentShape.h - this.currentShape.y;
                                    let width = this.currentShape.x + this.currentShape.w - this.currentShape.x;
                                    let xs = this.graph.screenHeight(height);
                                    let ys = this.graph.screenWidth(width);
                                    if (xs < 10) { this.currentShape = null; this.md = false; return; }
                                    if (xs > 10 && ys > 10) {
                                        let xi = this.currentShape.x;
                                        let xf = this.currentShape.x + this.currentShape.w;
                                        let yi = this.currentShape.y;
                                        let yf = this.currentShape.y - this.currentShape.h;
                                        this.currentShape = null;
                                        await this.zoomRect(xi, xf, yf, yi, 150);
                                    }
                                }
                                this.currentShape = null;
                                this.md = false;
                            });
                            return;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 300 && ys < 320) {
                            this.bclick = 'expand_vertical';
                            setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                            let ly = Math.abs(this.graph.getymax() - this.graph.getymin()) / 10;
                            await this.zoomXY(
                                this.graph.getxmin(), this.graph.getxmax(),
                                this.graph.getymin() - ly, this.graph.getymax() + ly
                            );
                            return;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 335 && ys < 355) {
                            this.bclick = 'contract_vertical';
                            setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                            let ly = Math.abs(this.graph.getymax() - this.graph.getymin()) / 10;
                            await this.zoomXY(
                                this.graph.getxmin(), this.graph.getxmax(),
                                this.graph.getymin() + ly, this.graph.getymax() - ly
                            );
                            return;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 370 && ys < 390) {
                            this.bclick = 'expand_horizontal';
                            setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                            let lx = Math.abs(this.graph.getxmax() - this.graph.getxmin()) / 10;
                            await this.zoomXY(
                                this.graph.getxmin() - lx, this.graph.getxmax() + lx,
                                this.graph.getymin(), this.graph.getymax()
                            );
                            return;
                        }

                        if (xs >= 10 && xs < 30 && ys >= 405 && ys < 425) {
                            this.bclick = 'contract_horizontal';
                            setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                            let lx = Math.abs(this.graph.getxmax() - this.graph.getxmin()) / 10;
                            await this.zoomXY(
                                this.graph.getxmin() + lx, this.graph.getxmax() - lx,
                                this.graph.getymin(), this.graph.getymax()
                            );
                            return;
                        }

                        if (this.bookmark_menu && this.showBookmarks) {
                            this.bookmarkMouseDownListener(xwc, ywc);
                            return;
                        }
                        if (this.chapter_menu && this.showChapters) {
                            this.chapterMouseDownListener(xwc, ywc);
                            this.showChapters = false;
                            return;
                        }
                        if (this.select_) {
                            this.startX = xwc;
                        }
                        if (this.menu && this.menu.mouseDown && this.menuVisible()) {
                            return this.menu.mouseDown(this.graph, xwc, ywc)
                        }
                    }
                    if (!this.menu) {
                        this.mouseDown = true;
                        for (let mdl of this.mouseDownListeners) {
                            mdl(xwc, ywc);
                        }
                    }
                }
                this.mouseUpListener = async (xwc, ywc) => {
                    if (!isMobile()) {
                        this.prev = null;
                        if (this.bookmark_menu && this.showBookmarks) {
                            this.bookmarkMouseUpListener(xwc, ywc);
                        }
                        if (this.chapter_menu && this.showChapters) {
                            this.chapterMouseUpListener(xwc, ywc);
                        }
                        if (this.select_) {
                            this.endX = xwc;
                        }
                        if (this.side_menu && this.side_menu.isIn(this.graph, xwc, ywc)) {
                            return;
                        }
                        this.side_menu = null;

                        if (this.menuVisible()) {
                            await this.menu.mouseUp(this.graph, xwc, ywc)
                            this.menu = null;
                            return;
                        } else {
                            if (this.mode === 'menu') {
                                if (!this.menu) {
                                    this.setMouseMode("navigate")
                                }
                            }
                        }

                        this.mouseDown = false;

                        if (!this.menu) {
                            for (let mul of this.mouseUpListeners) {
                                mul(xwc, ywc);
                            }
                        }

                    }
                }
                this.mouseMoveListener = (xwc, ywc) => {

                    this.graph.mousex = xwc
                    let xs = this.graph.X(xwc);
                    let ys = this.graph.Y(ywc);
                    if (xs >= 10 && xs < 30 && ys >= 250 && ys < 270) {
                    }
                    if (xs >= 10 && xs < 30 && ys >= 285 && ys < 305) {
                    }
                    if (this.select_ && this.mouseDown) {
                        this.endX = xwc;
                    }
                    if (this.menuVisible()) {
                        return this.menu.mouseMove(this.graph, xwc, ywc)
                    }
                    if (this.chapterMouseMoveListener) {
                        this.chapterMouseMoveListener(xwc, ywc);
                    }
                    if (this.bookmarkMouseMoveListener) {
                        this.bookmarkMouseMoveListener(xwc, ywc);
                    }
                    if (this.side_menu) {
                        this.side_menu.mouseMove(this.graph, xwc, ywc)
                    }
                    let inmenuShape = false;
                    for (let ct of this.shapes) {
                        if (ct.createMenu && ct.isIn(this.graph, xwc, ywc)) {
                            this.menu = ct.createMenu();
                            inmenuShape = true;
                        }
                    }
                    for (const movel of [...this.mouseMoveListeners]) {
                        try {

                            movel(xwc, ywc);
                        } catch (exception) {

                            const index = this.mouseMoveListeners.indexOf(movel);
                            if (index !== -1) {
                                this.mouseMoveListeners.splice(index, 1);
                            }

                            const now = new Date().toISOString();
                            const listenerInfo = describeListener(movel);

                            console.groupCollapsed(
                                `[mouseMove] listener exception @ ${now} | removed index ${index}`
                            );
                            console.error("Error object:", exception);
                            console.log("Name:", exception?.name ?? "(unknown)");
                            console.log("Message:", exception?.message ?? "(no message)");
                            console.log("Stack:\n" + (exception?.stack ?? "(no stack)"));
                            console.log("Args:", { xwc, ywc });
                            console.log("Listener details:", listenerInfo);

                            try {
                                console.log("Listener (JSON):\n" + safeStringify(movel));
                            } catch {
                                console.log("Listener (JSON): [unavailable]");
                            }

                            console.groupEnd();
                        }
                    }

                }
                let controlPanelRefCallback = (controlPanel) => {
                    this.controlPanel = controlPanel;
                    this.controlPanel.setHTML('')
                }

                this.wheel = (evt) => {
                    evt.preventDefault();

                    const dy = evt.deltaY || 0;
                    const isCtrlPressed = evt.ctrlKey;
                    const isShiftPressed = evt.shiftKey;

                    const grid = this.graph.grid;

                    const xmin = grid.xmin;
                    const xmax = grid.xmax;
                    const ymin = grid.ymin;
                    const ymax = grid.ymax;

                    const width = xmax - xmin;
                    const height = ymax - ymin;

                    const direction = Math.sign(dy) || 0;
                    if (direction === 0) return;

                    const ZOOM_STEP = 0.10;

                    const factor = 1 + (direction * ZOOM_STEP);

                    const cx = (xmin + xmax) / 2;
                    const cy = (ymin + ymax) / 2;

                    const MIN_HEIGHT = 1e-6;
                    const MIN_WIDTH = 1e-6;
                    const MAX_MULTIPLIER = 1e6;

                    const clampSpan = (span, min, max) => Math.min(Math.max(span, min), max);

                    let newXMin = xmin, newXMax = xmax;
                    let newYMin = ymin, newYMax = ymax;

                    if (!isCtrlPressed && !isShiftPressed) {

                        const newW = clampSpan(width * factor, MIN_WIDTH, width * MAX_MULTIPLIER);
                        const newH = clampSpan(height * factor, MIN_HEIGHT, height * MAX_MULTIPLIER);
                        newXMin = cx - newW / 2; newXMax = cx + newW / 2;
                        newYMin = cy - newH / 2; newYMax = cy + newH / 2;

                    } else if (isShiftPressed) {

                        const newH = clampSpan(height * factor, MIN_HEIGHT, height * MAX_MULTIPLIER);
                        newYMin = cy - newH / 2; newYMax = cy + newH / 2;

                    } else if (isCtrlPressed) {

                        const newW = clampSpan(width * factor, MIN_WIDTH, width * MAX_MULTIPLIER);
                        newXMin = cx - newW / 2; newXMax = cx + newW / 2;
                    }

                    grid.xmin = newXMin;
                    grid.xmax = newXMax;
                    grid.ymin = newYMin;
                    grid.ymax = newYMax;

                    grid.rescale();
                };

                this.touchStart = (event) => {
                    this.initDwn = event;
                }
                this.touchEnd = (event) => {
                }
                this.touchMove = (event) => {
                }
                this.dblclick = (scx, scy) => {
                }

                let controlPanelListener = () => {

                }

                let FlexiGraph = await exec('flexigraph/graph.js', this.graphListener, this.mouseDownListener, this.mouseUpListener,
                    this.mouseMoveListener, controlPanelRefCallback, controlPanelListener, this.pinchListener, this.touchStart, this.touchEnd, this.touchMove, this.dblclick, this.wheel);

                this.graph = new FlexiGraph();
                await this.graph.init();
                this.graph.resizeWithCanvas = this.elastic;
                this.graph.setymin(0);
                this.graph.setymin(-1.5)
                this.graph.setymax(this.track.length + 1);
                this.initView = Object.assign(new MGrid(), this.graph.grid)
                let save_index = 0;
                this.pauseDraw = false;

                let drop_added = false;
                let observer = null;
                let helpTimeout = null;

                if (!this.showHelp) {
                    this.showHelp = true;
                    clearTimeout(helpTimeout);
                    helpTimeout = setTimeout(() => {
                        this.showHelp = false;
                    }, 10000);
                }

                setInterval(async () => {

                    if (this.uid === null) {

                        this.uid = uuid();
                    }

                    if (this.graph.grid.xmin > this.graph.grid.xmax) {
                        this.graph.setxmin(0);
                        this.graph.setxmax(this.track.length + 1)
                        this.graph.rescale();
                        this.graph.grid = Object.assign(new MGrid(), this.initView)
                        this.graph.rescale();
                    }
                    if (this.graph.grid.ymin > this.graph.grid.ymax) {
                        this.graph.setymin(-1.5)
                        this.graph.setymax(10);
                        this.graph.rescale();
                    }

                    if (!this.___captureSwipesSet && this.graph.canvas) {
                        captureSwipes(this.graph.canvas.canvas.nativeElement, (direction) => {
                            this.panGridSlide(direction, { fromScreen: { x: this.graph.grid.width / 2, y: this.graph.grid.height / 2 } })
                        });
                        this.___captureSwipesSet = true;
                    }

                    if (!observer && this.graph.canvas) {
                        observer = new IntersectionObserver((entries) => {
                            entries.forEach((entry) => {
                                if (!entry.isIntersecting || document.hidden) {
                                    this.pauseDraw = true;
                                } else {
                                    this.pauseDraw = false;
                                }
                            });
                        });
                        observer.observe(this.graph.canvas.canvas.nativeElement);
                    }

                    if (document.hidden) {
                        this.pauseDraw = true;
                    } else {
                        this.pauseDraw = false;
                    }

                    if (!this.pauseDraw) {
                        await this.redraw();
                        if (this.post_graphics_modifications) {
                            if (this.graph.canvas) {
                                let ctx = this.graph.canvas.getCTX();
                                this.post_graphics_modifications(ctx);
                            }
                        }
                        if ((save_index > 0 && !this.saving) && save_index % 600000 === 0) {
                            console.log(' save ')
                            if (this.autosave) this.saveState();
                        }
                        save_index += 200;
                    } else {
                        console.log(" pause.... ")
                    }

                }, 100);

            }

            innerComponentCallback = (panl) => {

            }

            saveToSVG() {
                this.pauseDraw = true;
                this.graph.canvas.width;
                this.graph.canvas.height;
                let csvg = new CanvasToSVGProxy(this.graph.canvas.width, this.graph.canvas.height)
                let temp = this.graph.canvas;
                this.graph.canvas = csvg;
                this.redraw().then(async r => {
                    let va = await prompt("Name", ["Name"], { "Name": 'snapshot.svg' }, 300, 300)
                    let m = va['Name']
                    if (m === null) {
                        (csvg.getSVG(), "snapshot.svg")

                    } else {
                        downloadAsText(csvg.getSVG(), m)
                    }
                    this.graph.canvas = temp;
                    this.pauseDraw = false;
                    showModal(
                        {
                            wid: 'text-editor',
                            refCallback: createIonFunction(this.innerComponentCallback),
                            data: {
                                height: '550px',
                                width: '550px',
                                text: csvg.getSVG(),
                                onKeyUp: createIonFunction((editor) => {
                                }),
                                editorOptions: {
                                    language: 'xml', automaticLayout: true, lineHeight: 45, fontSize: 16, codeLens: false, lineNumbers: 'off', glyphMargin: false,
                                    minimap: { enabled: false }, scrollbar: { verticalScrollbarSize: 0, verticalHasArrows: false }, verticalHasArrows: false, height: '50px',
                                    colors: {
                                        'editorWidget.border': '2px',
                                        'editor.foreground': '#000000',
                                        'editor.background': '#EDF9FA',
                                        'editorCursor.foreground': '#8B0000',
                                        'editor.lineHighlightBackground': '#0000FF20',
                                        'editorLineNumber.foreground': '#008800',
                                        'editor.selectionBackground': '#88000030',
                                        'editor.inactiveSelectionBackground': '#88000015'
                                    },
                                },
                            }
                        }, 500, 500
                    )
                });
            }

            getTrack(x, y) {
                this.graph.rescale();
                let scxx = this.graph.X(x);
                let scyy = this.graph.Y(y);
                for (let i = 0; i < this.track.length; i++) {
                    let t = this.track[i]
                    let scx = this.graph.X(t.tgraph.xi);
                    let scy = this.graph.Y(t.tgraph.yi)
                    let scw = this.graph.screenWidth(t.tgraph.width);
                    let sch = -1 * this.graph.screenHeight(t.tgraph.height);

                    let yheight = (scy + sch + 40)
                    let xwidth = (scx + scw + 40)

                    if (scyy > scy &&
                        scyy < yheight &&
                        scxx > scx &&
                        scxx < xwidth) {
                        return i;
                    }
                }
                return null;
            }

            getTrackAllowUnderneath(x, y) {
                this.graph.rescale();
                let scxx = this.graph.X(x);
                let scyy = this.graph.Y(y);
                for (let i = 0; i < this.track.length; i++) {
                    let t = this.track[i];
                    let scx = this.graph.X(t.tgraph.xi);

                    let scy = this.graph.Y(t.tgraph.yi - t.tgraph.yi * 0.1);
                    let scw = this.graph.screenWidth(t.tgraph.width);
                    let sch = -1 * this.graph.screenHeight(t.tgraph.height);
                    if (scyy > scy && scyy < (scy + sch + 40) && scxx > scx && scxx < (scx + scw + 40)) {
                        return i;
                    }
                }
                return null;
            }

            isReferenedByAnotherTrack(_track) {
                for (let tr of this.track) {

                    if (tr.trackRef && tr.trackRef.track && tr.trackRef.track.name === _track.name) {
                        return true;
                    }
                }
                return false;

            }

            getTrackFromIndex(trackIndex) {
                return this.track[trackIndex]
            }

            syncTrackRef() {
                for (let t of this.track) {
                    if (t.trackRef) {
                        for (let i of this.track) {
                            if (t.trackRef && t.trackRef.name && t.trackRef.name == i.name) {
                                t.trackRef = new TrackRef(i, i.xi, i.xf);
                            } else if (t.trackRef) {
                                let tstr = t.trackRef.toString();

                                if (tstr.startsWith('_900807_')) {
                                    let name = ''

                                    let mapindex = tstr.indexOf('_900807map_')
                                    if (mapindex > 0) {
                                        name = t.trackRef.substring(8, mapindex);
                                    } else {
                                        name = t.trackRef.substring(3);
                                    }
                                    for (let track_item of this.track) {
                                        if (track_item.name == name) {
                                            t.trackRef = new TrackRef(track_item, track_item.xi, track_item.xf);

                                            let mapindex = tstr.indexOf('_900807map_')
                                            if (mapindex >= 0) {
                                                let mindex_end = tstr.indexOf('_900807showMismatchesS_', mapindex)
                                                let mindex = tstr.substring(mapindex + 11, mindex_end)

                                                let mjob = JSON.parse(mindex)

                                                t.trackRef.map = mjob;
                                            }
                                            let showMismatchesIndexStart = tstr.indexOf('_900807showMismatchesS_')
                                            if (showMismatchesIndexStart > 0) {
                                                let showMismatchesIndexEnd = tstr.indexOf('_900807showMismatchesE_')
                                                let mm = tstr.substring(showMismatchesIndexStart + 23, showMismatchesIndexEnd)
                                                console.log(" show mismatches =? " + mm)
                                                t.trackRef.showMismatches = eval(mm)
                                            }

                                        }
                                    }
                                }
                            }
                        }
                    }
                }

            }

            async __deprecated__verifyNormalTracks() {
                let found_dups = false;
                for (let t of this.track) {
                    let items = this.track.filter(x => x.name === t.name);
                    if (items && items.length > 1) {
                        console.log(" we have multiple instances ")
                        found_dups = true;
                    }
                }
                if (found_dups) {
                    let t = {};
                    for (let s of this.track) {
                        if (s.name != null)
                            t[s.name] = s;
                    }
                    let to = Object.keys(t);
                    this.track = []
                    for (let tok of to) {
                        if (tok != null && tok.length > 0 && to[tok] != null)
                            this.track.push(t[tok])
                    }
                }

            }

            async drawGraphLayers() {
                for (let l of this.layers) {
                    await l.draw(this.graph);
                }
            }

            async drawTracks() {
                this.graph.resizeWithCanvas = this.elastic;
                if (this.graph && this.track) {

                    for (let tk of this.track) {
                        if (tk.trackRef && tk.trackRef.toString().startsWith('_900807_'))
                            this.syncTrackRef();
                        await tk.draw(this.graph);
                    }

                    if (this.select_) {
                        let midpoint = (this.graph.getymax() - this.graph.getymin()) / 2;
                        this.graph.drawVerticalLine(this.startX, midpoint, 2 * (this.graph.getymax() - this.graph.getymin()), 'cyan', 12);
                        this.graph.drawVerticalLine(this.endX, midpoint, 2 * (this.graph.getymax() - this.graph.getymin()), 'cyan', 12);
                        this.graph.drawLine(this.startX, this.graph.getymin(), this.endX, this.graph.getymin(), 'darkGray', 1);
                    }
                } else {
                    console.log(this.graph + " Missing graph or tracks " + this.tracks)
                }

            }
            addChem(ch) {
                this.chem.push(ch);
            }
            buildMenuFromFeatures(features, ctx = {}) {
                const graph = ctx.graph || this.graph;
                const feats = Array.isArray(features) ? features.filter(Boolean) : [];
                if (!feats.length) return;
                const exportJson = async (obj) => {
                    const s = JSON.stringify(obj, null, 2);
                    try {
                        if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(s);
                        else console.log(s);
                    } catch {
                        console.log(s);
                    }
                };

                const idKeyOf = (obj) => {
                    if (!obj || typeof obj !== "object") return null;
                    if (obj.uid != null && String(obj.uid).trim() !== "") return `uid:${String(obj.uid)}`;
                    if (obj.id != null && String(obj.id).trim() !== "") return `id:${String(obj.id)}`;
                    return null;
                };

                const canonicalize = (value, opts, _seen = new WeakSet()) => {
                    const {
                        dropKeys = new Set([

                            "hover", "selected", "active", "highlight", "color", "stroke", "fill",
                            "screen", "screenBox", "boxes", "hitBox", "hitSegments",
                            "__proto__", "constructor",
                        ]),
                        maxDepth = 32,
                        depth = 0,
                        floatDigits = 6,
                    } = opts;

                    if (depth > maxDepth) return "[MaxDepth]";

                    if (value == null) return null;

                    const t = typeof value;
                    if (t === "string" || t === "boolean") return value;

                    if (t === "number") {
                        if (!Number.isFinite(value)) return String(value);

                        const s = value.toFixed(floatDigits);

                        const n = Number(s);
                        return Object.is(n, -0) ? 0 : n;
                    }

                    if (t !== "object") return String(value);

                    if (_seen.has(value)) return "[Circular]";
                    _seen.add(value);

                    if (Array.isArray(value)) {
                        return value.map((v) => canonicalize(v, { ...opts, depth: depth + 1 }, _seen));
                    }

                    const out = {};
                    const keys = Object.keys(value)
                        .filter((k) => !dropKeys.has(k))
                        .sort();

                    for (const k of keys) {
                        const v = value[k];

                        if (typeof v === "function") continue;
                        out[k] = canonicalize(v, { ...opts, depth: depth + 1 }, _seen);
                    }
                    return out;
                };

                const stableStringify = (obj) => JSON.stringify(obj);

                const signatureOf = (obj) => {

                    const canon = canonicalize(obj, {

                        floatDigits: 6,
                    });
                    return stableStringify(canon);
                };

                const selectedIdKeys = new Set();
                const selectedSignatures = new Set();

                for (const f of feats) {
                    const k = idKeyOf(f);
                    if (k) selectedIdKeys.add(k);
                    else selectedSignatures.add(signatureOf(f));
                }

                const removeFromAllTracks = ({ idKeys, signatures }) => {
                    const tracks = Array.isArray(this.track) ? this.track : [];
                    if ((!idKeys || !idKeys.size) && (!signatures || !signatures.size)) {
                        return { removed: 0, touchedTracks: 0, touchedArrays: 0 };
                    }
                    let removed = 0;
                    let touchedTracks = 0;
                    let touchedArrays = 0;
                    const matchesSelected = (el) => {
                        if (!el || typeof el !== "object") return false;
                        const k = idKeyOf(el);
                        if (k && idKeys && idKeys.has(k)) return true;
                        if (!k && signatures && signatures.size) {
                            const sig = signatureOf(el);
                            if (signatures.has(sig)) return true;
                        }
                        return false;
                    };

                    const pruneMatchesDeep = (value, seen = new WeakSet()) => {
                        if (!value || typeof value !== "object") return false;
                        if (seen.has(value)) return false;
                        seen.add(value);

                        let changed = false;

                        if (Array.isArray(value)) {

                            const beforeLen = value.length;
                            const kept = [];

                            for (const item of value) {
                                if (matchesSelected(item)) {
                                    removed++;
                                    changed = true;
                                    continue;
                                }
                                kept.push(item);
                            }

                            if (kept.length !== beforeLen) {
                                value.length = 0;
                                value.push(...kept);
                            }

                            for (const item of value) {
                                if (pruneMatchesDeep(item, seen)) changed = true;
                            }

                            return changed;
                        }

                        for (const key of Object.keys(value)) {
                            const v = value[key];
                            if (key === 'ampliconResults')
                                if (Array.isArray(v)) {

                                    if (pruneMatchesDeep(v, seen)) changed = true;
                                } else if (v && typeof v === "object") {
                                    if (pruneMatchesDeep(v, seen)) changed = true;
                                }
                        }

                        return changed;
                    };

                    for (const tr of tracks) {
                        if (!tr || typeof tr !== "object") continue;
                        let trackTouched = false;
                        for (const prop of Object.keys(tr)) {
                            const arr = tr[prop];
                            if (!Array.isArray(arr) || !arr.length) continue;

                            touchedArrays++;

                            const changed = pruneMatchesDeep(arr);
                            if (changed) trackTouched = true;
                        }

                        const deepChanged = pruneMatchesDeep(tr);
                        if (deepChanged) trackTouched = true;

                        if (trackTouched) touchedTracks++;
                    }

                    return { removed, touchedTracks, touchedArrays };
                };

                const menu = [];

                let deselect = false;
                for (let f of feats) {
                    if (f.setSelected) {
                        if (typeof f.setSelected === "function") {
                            f.setSelected(true)
                            deselect = true;
                        }
                    }
                }

                if (deselect) {

                    menu.push({
                        label: `Deselect (${feats.length})`,
                        click: async () => {
                            for (let f of feats) {
                                if (f.setSelected) {
                                    if (typeof f.setSelected === "function") {
                                        f.setSelected(false)
                                        deselect = false;
                                    }
                                }
                            }
                            this.currentShape = null;

                        },

                    });

                    menu.push({
                        label: `Deselect All`,
                        click: async () => {
                            this.deselectAllCompounds()
                            this.deselectAllTracks();
                            this.currentShape = null;

                        },

                    });

                }

                menu.push({
                    label: `Copy selected (${feats.length})`,
                    click: async () => {
                        exportJson(feats)
                        this.currentShape = null;
                        this.showSideMenu(null)
                        this.currentShape = null;

                    },

                });

                menu.push({
                    label: `Edit selected (${feats.length})`,
                    click: async () => {
                        this.currentShape = null;

                        const toStr = (v) => (v === null || v === undefined ? "" : String(v));
                        const isNonEmpty = (s) => s.trim().length > 0;

                        const tracks = Array.isArray(this.track) ? this.track : [];

                        const typeCounts = new Map();
                        for (const f of feats) {
                            const t = toStr(f?.type).trim();
                            if (!isNonEmpty(t)) continue;
                            typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
                        }

                        const typeEntries = [...typeCounts.entries()]
                            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

                        if (!typeEntries.length) {
                            this.showSideMenu(null);
                            return;
                        }

                        const idKeyOf = (obj) => {
                            if (!obj || typeof obj !== "object") return null;
                            if (obj.uid != null && String(obj.uid).trim() !== "") return `uid:${String(obj.uid)}`;
                            if (obj.id != null && String(obj.id).trim() !== "") return `id:${String(obj.id)}`;
                            return null;
                        };

                        const canonicalize = (value, opts, _seen = new WeakSet()) => {
                            const {
                                dropKeys = new Set([
                                    "hover", "selected", "active", "highlight", "color", "stroke", "fill",
                                    "screen", "screenBox", "boxes", "hitBox", "hitSegments",
                                    "__proto__", "constructor",
                                ]),
                                maxDepth = 32,
                                depth = 0,
                                floatDigits = 6,
                            } = opts;

                            if (depth > maxDepth) return "[MaxDepth]";
                            if (value == null) return null;

                            const t = typeof value;
                            if (t === "string" || t === "boolean") return value;

                            if (t === "number") {
                                if (!Number.isFinite(value)) return String(value);
                                const s = value.toFixed(floatDigits);
                                const n = Number(s);
                                return Object.is(n, -0) ? 0 : n;
                            }

                            if (t !== "object") return String(value);

                            if (_seen.has(value)) return "[Circular]";
                            _seen.add(value);

                            if (Array.isArray(value)) {
                                return value.map((v) => canonicalize(v, { ...opts, depth: depth + 1 }, _seen));
                            }

                            const out = {};
                            const keys = Object.keys(value)
                                .filter((k) => !dropKeys.has(k))
                                .sort();

                            for (const k of keys) {
                                const v = value[k];
                                if (typeof v === "function") continue;
                                out[k] = canonicalize(v, { ...opts, depth: depth + 1 }, _seen);
                            }
                            return out;
                        };

                        const signatureOf = (obj) => JSON.stringify(
                            canonicalize(obj, { floatDigits: 6 })
                        );

                        const matchesType = (el, typeValue) => {
                            if (!el || typeof el !== "object") return false;
                            return toStr(el.type).trim() === typeValue;
                        };

                        const filterAllTracksByType = ({ typeValue, mode }) => {
                            let changedTracks = 0;
                            let changedArrays = 0;
                            let removed = 0;

                            const shouldRemove = (el) => {
                                if (!matchesType(el, typeValue)) return false;
                                return mode === "remove" ? true : false;
                            };

                            const shouldKeepInKeepMode = (el) => {
                                if (!el || typeof el !== "object") return true;
                                if (!("type" in el)) return true;
                                return matchesType(el, typeValue);
                            };

                            const pruneDeep = (value, seen = new WeakSet()) => {
                                if (!value || typeof value !== "object") return false;
                                if (seen.has(value)) return false;
                                seen.add(value);

                                let changed = false;

                                if (Array.isArray(value)) {
                                    const beforeLen = value.length;
                                    const kept = [];

                                    for (const item of value) {
                                        if (mode === "remove") {
                                            if (shouldRemove(item)) {
                                                removed++;
                                                changed = true;
                                                continue;
                                            }
                                            kept.push(item);
                                        } else if (mode === "keep") {
                                            if (item && typeof item === "object" && "type" in item) {
                                                if (!shouldKeepInKeepMode(item)) {
                                                    removed++;
                                                    changed = true;
                                                    continue;
                                                }
                                            }
                                            kept.push(item);
                                        }
                                    }

                                    if (kept.length !== beforeLen) {
                                        value.length = 0;
                                        value.push(...kept);
                                        changedArrays++;
                                    }

                                    for (const item of value) {
                                        if (pruneDeep(item, seen)) changed = true;
                                    }

                                    return changed;
                                }

                                for (const key of Object.keys(value)) {
                                    const v = value[key];
                                    if (Array.isArray(v)) {
                                        if (pruneDeep(v, seen)) changed = true;
                                    } else if (v && typeof v === "object") {
                                        if (pruneDeep(v, seen)) changed = true;
                                    }
                                }

                                return changed;
                            };

                            for (const tr of tracks) {
                                if (!tr || typeof tr !== "object") continue;
                                const changed = pruneDeep(tr);
                                if (changed) changedTracks++;
                            }

                            return { changedTracks, changedArrays, removed };
                        };

                        const submenu = typeEntries.map(([typeValue, count]) => ({
                            label: `${typeValue} (${count})`,
                            click: async () => {

                                const typeFeats = feats.filter((f) => matchesType(f, typeValue));
                                const editableStructureFeats = typeFeats.filter((f) =>
                                    f &&
                                    typeof f === "object" &&
                                    "structure" in f &&
                                    f.structure != null
                                );

                                const typeMenu = [
                                    {
                                        label: `Keep only selected`,
                                        click: async () => {
                                            this.pushOntoHistory();

                                            filterAllTracksByType({
                                                typeValue,
                                                mode: "keep",
                                            });
                                            this.showSideMenu(null);
                                        }
                                    },
                                    {
                                        label: `Remove selected`,
                                        click: async () => {
                                            this.pushOntoHistory();
                                            const stats = removeFromAllTracks({
                                                idKeys: selectedIdKeys,
                                                signatures: selectedSignatures,
                                            });

                                            this.showSideMenu(null);
                                        }
                                    },
                                    {
                                        label: 'Run filter rules',
                                        click: async () => {
                                            const rawMenu = [
                                                {
                                                    label: 'Quick filters',
                                                    items: [
                                                        {
                                                            label: 'Remove homopolymer contigs',
                                                            click: async () => {
                                                                await exec(
                                                                    'baja/screens/annotation/rule-application-wizard-min.js',
                                                                    this,
                                                                    this.genegraph_panel_layout,
                                                                    `pattern, TTTT | Required
pattern, AAAA | Required
pattern, CCCC | Required
pattern, GGGG | Required`
                                                                );
                                                                this.showSideMenu(null);
                                                            }
                                                        },
                                                        {
                                                            label: 'Remove palindromes',
                                                            click: async () => {
                                                                await exec(
                                                                    'baja/screens/annotation/rule-application-wizard-min.js',
                                                                    this,
                                                                    this.genegraph_panel_layout,
                                                                    `palindrome,10 | Required`
                                                                );
                                                                this.showSideMenu(null);
                                                            }
                                                        },
                                                        {
                                                            label: 'Seed filters',
                                                            click: async () => {
                                                                this.setMessage('Filter seed sequences that hit the same 3UTR >= 10 times');

                                                                await exec(
                                                                    'baja/screens/annotation/rule-application-wizard-min.js',
                                                                    this,
                                                                    this.genegraph_panel_layout,
                                                                    'offtarget-seed, Human3utr, 1, 10 | Required'
                                                                );
                                                                this.showSideMenu(null);
                                                            }
                                                        }
                                                    ]
                                                },
                                                {
                                                    label: 'Sequence',
                                                    items: [
                                                        {
                                                            label: 'Advanced',
                                                            click: async () => {
                                                                let Biopolymer = await exec('baja/chem/biopolymer.js');

                                                                this.clearMouseListeners();

                                                                if (this.track.length > 0) {
                                                                    let hasSnpindel = 0;
                                                                    let hasOligos = 0;

                                                                    for (let t of this.track) {
                                                                        if (t.snpindels.length > 0) {
                                                                            hasSnpindel = 1;
                                                                        }
                                                                        if (t.oligos.length > 0) {
                                                                            hasOligos = 1;
                                                                        }
                                                                    }

                                                                    if (hasOligos == 1) {
                                                                        let needsOfftarget = null;
                                                                        let needssynthesisSequence = null;

                                                                        for (let t of this.track) {
                                                                            for (let o of t.oligos) {
                                                                                if (!o.offtarget) {
                                                                                    needsOfftarget = 1;
                                                                                    o.highlight__ = true;
                                                                                }
                                                                                if (!o.synthesisSequence) {
                                                                                    needssynthesisSequence = 1;
                                                                                }
                                                                            }
                                                                        }

                                                                        if (needssynthesisSequence) {
                                                                            for (let t of this.track) {
                                                                                for (let o of t.oligos) {
                                                                                    if (o.synthesisSequence == null || o.synthesisSequence.length <= 0) {
                                                                                        o.synthesisSequence = Biopolymer.generateSynthesisSequence(o);
                                                                                    }
                                                                                }
                                                                            }
                                                                        }

                                                                        if (needsOfftarget) {
                                                                            this.setMessage('Some oligos need offtarget information.');

                                                                            let confirm = await exec(
                                                                                'baja/lib/confirm.js',
                                                                                'Some oligos do not have offtargets.  Continue?',
                                                                                async () => {
                                                                                    if (library) {
                                                                                        let MSGraph = await exec('lib/msgraph.js');
                                                                                        let client = await MSGraph.getClient(sharepoint_config);
                                                                                        let folder = await client.api(`/drives/${library.id}/items/${this.parentId}`).get();

                                                                                        let hl = await exec(
                                                                                            'baja/screens/menu/target-tools.js',
                                                                                            graph,
                                                                                            library,
                                                                                            folder,
                                                                                            this.genegraph_panel_layout
                                                                                        );

                                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                                                                                        CurrentLayout.setComponent('buttonMenuPanel', hl);
                                                                                    } else {
                                                                                        await exec(
                                                                                            'baja/screens/annotation/rule-application-wizard-min.js',
                                                                                            graph,
                                                                                            this.genegraph_panel_layout
                                                                                        );
                                                                                    }
                                                                                }
                                                                            );

                                                                            showModal(confirm);
                                                                        } else {
                                                                            if (library) {
                                                                                let MSGraph = await exec('lib/msgraph.js');
                                                                                let client = await MSGraph.getClient(sharepoint_config);
                                                                                let folder = await client.api(`/drives/${library.id}/items/${this.parentId}`).get();

                                                                                let hl = await exec(
                                                                                    'baja/screens/menu/target-tools.js',
                                                                                    graph,
                                                                                    library,
                                                                                    folder,
                                                                                    this.genegraph_panel_layout
                                                                                );

                                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                                                                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                                                                            } else {
                                                                                await exec(
                                                                                    'baja/screens/annotation/rule-application-wizard-min.js',
                                                                                    graph,
                                                                                    this.genegraph_panel_layout
                                                                                );
                                                                            }
                                                                        }
                                                                    } else {
                                                                        this.setMessage('No oligos and/or variants found');
                                                                    }
                                                                }

                                                                this.showSideMenu(null);
                                                            }
                                                        }
                                                    ]
                                                }
                                            ];

                                            const normalizeSideMenuItems = (items, parentStack = []) => {
                                                if (!Array.isArray(items)) return [];

                                                return items.map((item) => {
                                                    const hasChildren = Array.isArray(item.items) && item.items.length > 0;

                                                    const out = {
                                                        label: item.label
                                                    };

                                                    if (hasChildren) {
                                                        out.click = async () => {
                                                            const submenu = normalizeSideMenuItems(
                                                                item.items,
                                                                [...parentStack, items]
                                                            );

                                                            const backItems = parentStack.length
                                                                ? [
                                                                    {
                                                                        label: '← Back',
                                                                        click: async () => {
                                                                            const previousItems = parentStack[parentStack.length - 1];
                                                                            this.showSideMenu(
                                                                                normalizeSideMenuItems(
                                                                                    previousItems,
                                                                                    parentStack.slice(0, -1)
                                                                                )
                                                                            );
                                                                        }
                                                                    }
                                                                ]
                                                                : [];

                                                            this.showSideMenu([...backItems, ...submenu]);
                                                        };
                                                    } else if (typeof item.click === "function") {
                                                        out.click = async (...args) => {
                                                            return await item.click(...args);
                                                        };
                                                    }

                                                    return out;
                                                });
                                            };

                                            this.showSideMenu(normalizeSideMenuItems(rawMenu));
                                        }
                                    }
                                ];

                                if (editableStructureFeats.length > 0) {
                                    this.pushOntoHistory();

                                    let sequenceTextEditor;
                                    const descHook = createIon((_panel) => {
                                        sequenceTextEditor = _panel;
                                    });

                                    let ch = '';
                                    for (const f of editableStructureFeats) {
                                        ch += f.id + '\t' + (f.structure ?? '') + '\n';
                                    }

                                    const previous_chemistry = ch;

                                    typeMenu.push({
                                        label: `Edit chemistry`,
                                        click: async () => {
                                            const parser = await exec('baja/chem/syntax.js');

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
                                                                    wid: 'text-editor',
                                                                    refCallback: descHook,
                                                                    data: {
                                                                        height: "500px",
                                                                        showButton: false,
                                                                        text: ch,
                                                                        editorOptions: {
                                                                            value: '',
                                                                            language: 'text',
                                                                            automaticLayout: true,
                                                                            fontSize: 14,
                                                                            lineNumbers: "off",
                                                                            suggestOnTriggerCharacters: false,
                                                                            quickSuggestions: false,
                                                                            parameterHints: { enabled: false },
                                                                            minimap: { enabled: false },
                                                                            fontFamily: "Courier New, monospace",
                                                                            placeholder: "",
                                                                            cursorStyle: "block"
                                                                        },
                                                                        onDidFocusEditorWidget: createIon(() => {
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
                                                                component: {
                                                                    wid: 'mt-button',
                                                                    data: {
                                                                        buttons: [
                                                                            {
                                                                                label: 'Cancel',
                                                                                ionFunction: createIonFunction(async () => {
                                                                                    hideAllModal();
                                                                                    CurrentLayout.reset('mainPanel');
                                                                                }),
                                                                            },
                                                                            {
                                                                                label: 'Update chemistry',
                                                                                ionFunction: createIonFunction(async () => {
                                                                                    hideAllModal();

                                                                                    let modified_chemistry = sequenceTextEditor.getText();
                                                                                    let original_chemistry = previous_chemistry;

                                                                                    const tracks = Array.isArray(this.track) ? this.track : [];

                                                                                    const idKeyOf = (obj) => {
                                                                                        if (!obj || typeof obj !== "object") return null;
                                                                                        if (obj.uid != null && String(obj.uid).trim() !== "") return `uid:${String(obj.uid)}`;
                                                                                        if (obj.id != null && String(obj.id).trim() !== "") return `id:${String(obj.id)}`;
                                                                                        return null;
                                                                                    };

                                                                                    function parseChemistryLines(input) {
                                                                                        const result = {};

                                                                                        const lines = input
                                                                                            .split(/\r?\n/)
                                                                                            .map(line => line.trim())
                                                                                            .filter(Boolean);

                                                                                        for (const line of lines) {
                                                                                            const match = line.match(/^(\S+)\s+(.+)$/);
                                                                                            if (!match) continue;

                                                                                            const [, id, chemistry] = match;

                                                                                            const sequence = [...chemistry.matchAll(/\(([^)]+)\)/g)]
                                                                                                .map(m => m[1])
                                                                                                .join("");

                                                                                            result[id] = {
                                                                                                id,
                                                                                                chemistry,
                                                                                                sequence
                                                                                            };
                                                                                        }

                                                                                        return result;
                                                                                    }

                                                                                    function splitChemistryTokens(chemistry) {
                                                                                        if (!chemistry || typeof chemistry !== "string") return [];
                                                                                        return chemistry.split(".").filter(Boolean);
                                                                                    }

                                                                                    function diffChemistries(chemistryA, chemistryB) {
                                                                                        const tokensA = splitChemistryTokens(chemistryA);
                                                                                        const tokensB = splitChemistryTokens(chemistryB);

                                                                                        const maxLen = Math.max(tokensA.length, tokensB.length);
                                                                                        const changes = [];

                                                                                        for (let i = 0; i < maxLen; i++) {
                                                                                            const from = tokensA[i] ?? null;
                                                                                            const to = tokensB[i] ?? null;

                                                                                            if (from !== to) {
                                                                                                changes.push({
                                                                                                    index: i,
                                                                                                    from,
                                                                                                    to
                                                                                                });
                                                                                            }
                                                                                        }

                                                                                        return changes;
                                                                                    }

                                                                                    function buildUpdatesById(feats, editedText) {
                                                                                        const parsedEdited = parseChemistryLines(editedText);
                                                                                        const updatesById = {};

                                                                                        for (const oligo of editableStructureFeats) {
                                                                                            if (!oligo?.id) continue;

                                                                                            const edited = parsedEdited[oligo.id];
                                                                                            if (!edited) continue;

                                                                                            const originalChemistry = oligo.structure ?? "";
                                                                                            const modifiedChemistry = edited.chemistry ?? "";

                                                                                            if (!modifiedChemistry) continue;

                                                                                            const changes = diffChemistries(originalChemistry, modifiedChemistry);
                                                                                            if (!changes.length) continue;

                                                                                            updatesById[`id:${oligo.id}`] = {
                                                                                                structure: edited.chemistry,
                                                                                                synthesisSequence: edited.sequence,
                                                                                                sequence: edited.sequence
                                                                                            };
                                                                                        }

                                                                                        return updatesById;
                                                                                    }

                                                                                    function updateAllTracksById(tracks, updatesById) {
                                                                                        let visitedObjects = 0;
                                                                                        let matchedObjects = 0;
                                                                                        let changedObjects = 0;
                                                                                        let changedFields = 0;

                                                                                        const seen = new WeakSet();

                                                                                        const walk = (value) => {
                                                                                            if (!value || typeof value !== "object") return false;
                                                                                            if (seen.has(value)) return false;
                                                                                            seen.add(value);

                                                                                            let changed = false;
                                                                                            visitedObjects++;

                                                                                            if (Array.isArray(value)) {
                                                                                                for (const item of value) {
                                                                                                    if (walk(item)) changed = true;
                                                                                                }
                                                                                                return changed;
                                                                                            }

                                                                                            const key = idKeyOf(value);
                                                                                            if (key && updatesById[key]) {
                                                                                                matchedObjects++;

                                                                                                const patch = updatesById[key];
                                                                                                let localChanged = false;

                                                                                                for (const [field, nextValue] of Object.entries(patch)) {
                                                                                                    if (nextValue === undefined) continue;
                                                                                                    if (value[field] !== nextValue) {
                                                                                                        value[field] = nextValue;
                                                                                                        changedFields++;
                                                                                                        localChanged = true;
                                                                                                    }
                                                                                                }

                                                                                                if (localChanged) {
                                                                                                    changedObjects++;
                                                                                                    changed = true;
                                                                                                }
                                                                                            }

                                                                                            for (const child of Object.values(value)) {
                                                                                                if (child && typeof child === "object") {
                                                                                                    if (walk(child)) changed = true;
                                                                                                }
                                                                                            }

                                                                                            return changed;
                                                                                        };

                                                                                        for (const tr of tracks) {
                                                                                            walk(tr);
                                                                                        }

                                                                                        return {
                                                                                            visitedObjects,
                                                                                            matchedObjects,
                                                                                            changedObjects,
                                                                                            changedFields
                                                                                        };
                                                                                    }

                                                                                    let confirm = await exec('baja/lib/confirm.js', 'update ?', async () => {
                                                                                        const editedText = sequenceTextEditor.getContent();
                                                                                        const updatesById = buildUpdatesById(editableStructureFeats, editedText);
                                                                                        console.log("updatesById", updatesById);
                                                                                        const trackStats = updateAllTracksById(tracks, updatesById);
                                                                                        const featStats = updateAllTracksById([feats], updatesById);
                                                                                        this.currentShape = null;
                                                                                        console.log({ trackStats, featStats });
                                                                                        showModal(featStats);
                                                                                    });

                                                                                    showModal(confirm);
                                                                                    CurrentLayout.reset('mainPanel');
                                                                                    this.showSideMenu(null);
                                                                                }, 1000)
                                                                            },
                                                                        ],
                                                                    },
                                                                },
                                                            },
                                                        ]
                                                    ]
                                                }
                                            };

                                            CurrentLayout.setComponent('mainPanel', sequence_input);
                                        }
                                    });
                                }

                                this.showSideMenu(typeMenu);
                            }
                        }));

                        this.showSideMenu(submenu);
                    },
                });

                menu.push({
                    label: `Filter selected (${feats.length})`,
                    click: async () => {
                        const toStr = (v) => (v === null || v === undefined ? "" : String(v));
                        const isNonEmpty = (s) => s.trim().length > 0;
                        this.currentShape = null;

                        const tracks = Array.isArray(this.track) ? this.track : [];

                        const typeCounts = new Map();
                        for (const f of feats) {
                            const t = toStr(f?.type).trim();
                            if (!isNonEmpty(t)) continue;
                            typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
                        }

                        const typeEntries = [...typeCounts.entries()]
                            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

                        if (!typeEntries.length) {
                            this.showSideMenu(null);
                            return;
                        }

                        const idKeyOf = (obj) => {
                            if (!obj || typeof obj !== "object") return null;
                            if (obj.uid != null && String(obj.uid).trim() !== "") return `uid:${String(obj.uid)}`;
                            if (obj.id != null && String(obj.id).trim() !== "") return `id:${String(obj.id)}`;
                            return null;
                        };

                        const canonicalize = (value, opts, _seen = new WeakSet()) => {
                            const {
                                dropKeys = new Set([
                                    "hover", "selected", "active", "highlight", "color", "stroke", "fill",
                                    "screen", "screenBox", "boxes", "hitBox", "hitSegments",
                                    "__proto__", "constructor",
                                ]),
                                maxDepth = 32,
                                depth = 0,
                                floatDigits = 6,
                            } = opts;

                            if (depth > maxDepth) return "[MaxDepth]";
                            if (value == null) return null;

                            const t = typeof value;
                            if (t === "string" || t === "boolean") return value;

                            if (t === "number") {
                                if (!Number.isFinite(value)) return String(value);
                                const s = value.toFixed(floatDigits);
                                const n = Number(s);
                                return Object.is(n, -0) ? 0 : n;
                            }

                            if (t !== "object") return String(value);

                            if (_seen.has(value)) return "[Circular]";
                            _seen.add(value);

                            if (Array.isArray(value)) {
                                return value.map((v) => canonicalize(v, { ...opts, depth: depth + 1 }, _seen));
                            }

                            const out = {};
                            const keys = Object.keys(value)
                                .filter((k) => !dropKeys.has(k))
                                .sort();

                            for (const k of keys) {
                                const v = value[k];
                                if (typeof v === "function") continue;
                                out[k] = canonicalize(v, { ...opts, depth: depth + 1 }, _seen);
                            }
                            return out;
                        };

                        const signatureOf = (obj) => JSON.stringify(
                            canonicalize(obj, { floatDigits: 6 })
                        );

                        const matchesType = (el, typeValue) => {
                            if (!el || typeof el !== "object") return false;
                            return toStr(el.type).trim() === typeValue;
                        };

                        const filterAllTracksByType = ({ typeValue, mode }) => {
                            let changedTracks = 0;
                            let changedArrays = 0;
                            let removed = 0;

                            const shouldRemove = (el) => {
                                if (!matchesType(el, typeValue)) return false;
                                return mode === "remove" ? true : false;
                            };

                            const shouldKeepInKeepMode = (el) => {
                                if (!el || typeof el !== "object") return true;
                                if (!("type" in el)) return true;
                                return matchesType(el, typeValue);
                            };

                            const pruneDeep = (value, seen = new WeakSet()) => {
                                if (!value || typeof value !== "object") return false;
                                if (seen.has(value)) return false;
                                seen.add(value);

                                let changed = false;

                                if (Array.isArray(value)) {
                                    const beforeLen = value.length;
                                    const kept = [];

                                    for (const item of value) {
                                        if (mode === "remove") {
                                            if (shouldRemove(item)) {
                                                removed++;
                                                changed = true;
                                                continue;
                                            }
                                            kept.push(item);
                                        } else if (mode === "keep") {

                                            if (item && typeof item === "object" && "type" in item) {
                                                if (!shouldKeepInKeepMode(item)) {
                                                    removed++;
                                                    changed = true;
                                                    continue;
                                                }
                                            }
                                            kept.push(item);
                                        }
                                    }

                                    if (kept.length !== beforeLen) {
                                        value.length = 0;
                                        value.push(...kept);
                                        changedArrays++;
                                    }

                                    for (const item of value) {
                                        if (pruneDeep(item, seen)) changed = true;
                                    }

                                    return changed;
                                }

                                for (const key of Object.keys(value)) {
                                    const v = value[key];
                                    if (Array.isArray(v)) {
                                        if (pruneDeep(v, seen)) changed = true;
                                    } else if (v && typeof v === "object") {
                                        if (pruneDeep(v, seen)) changed = true;
                                    }
                                }

                                return changed;
                            };

                            for (const tr of tracks) {
                                if (!tr || typeof tr !== "object") continue;
                                const changed = pruneDeep(tr);
                                if (changed) changedTracks++;
                            }

                            return { changedTracks, changedArrays, removed };
                        };

                        const submenu = typeEntries.map(([typeValue, count]) => ({
                            label: `${typeValue} (${count})`,
                            click: async () => {
                                const typeMenu = [
                                    {
                                        label: `Keep only`,
                                        click: async () => {
                                            filterAllTracksByType({
                                                typeValue,
                                                mode: "keep",
                                            });
                                            this.currentShape = null;
                                            this.showSideMenu(null);
                                        }
                                    },
                                    {
                                        label: `Remove`,
                                        click: async () => {
                                            filterAllTracksByType({
                                                typeValue,
                                                mode: "remove",
                                            });
                                            this.currentShape = null;
                                            this.showSideMenu(null);
                                        }
                                    }
                                ];

                                this.showSideMenu(typeMenu);
                            }
                        }));

                        this.showSideMenu(submenu);
                    },
                });

                menu.push({
                    label: `Label selected (${feats.length})`,
                    click: async () => {
                        const toStr = (v) => (v === null || v === undefined ? "" : String(v));
                        const isNonEmpty = (s) => s.trim().length > 0;

                        this.currentShape = null;

                        const selected = Array.isArray(feats) ? feats.filter(Boolean) : [];
                        if (!selected.length) {
                            this.showSideMenu(null);
                            return;
                        }

                        const applyToSelected = (updater) => {
                            let changed = 0;

                            for (const item of selected) {
                                if (!item || typeof item !== "object") continue;
                                updater(item);
                                changed++;
                            }

                            this.currentShape = null;
                            this.showSideMenu(null);

                            if (typeof this.repaint === "function") {
                                this.repaint();
                            } else if (typeof this.draw === "function") {
                                this.draw();
                            }

                            return changed;
                        };

                        const setTypeForSelected = (typeValue) => {
                            applyToSelected((item) => {
                                item.type = typeValue;

                                if (!item.sequence && item.name) {
                                    item.sequence = item.name;
                                }

                                if (typeValue.startsWith("deprecated") && !item.status) {
                                    item.status = "Deprecated";
                                }
                            });
                        };

                        const setAttributeForSelected = (key, value) => {
                            applyToSelected((item) => {
                                item[key] = value;
                            });
                        };

                        const promptAndSetAttribute = ({
                            key,
                            title,
                            parser = (v) => v,
                            skipIfEmpty = true,
                        }) => {
                            const raw = window.prompt(title);
                            if (raw === null) return;

                            if (skipIfEmpty && !isNonEmpty(raw)) return;

                            const parsed = parser(raw);
                            applyToSelected((item) => {
                                item[key] = parsed;
                            });
                        };

                        const toggleAttributeForSelected = (key) => {
                            applyToSelected((item) => {
                                item[key] = !item[key];
                            });
                        };

                        const typeMenu = [
                            {
                                label: "ASO",
                                click: async () => setTypeForSelected("aso"),
                            },
                            {
                                label: "siRNA",
                                click: async () => setTypeForSelected("siRNA"),
                            },
                            {
                                label: "Amplicon",
                                click: async () => setTypeForSelected("amplicon"),
                            },
                            {
                                label: "Deprecated ASO",
                                click: async () => setTypeForSelected("deprecated.aso"),
                            },
                            {
                                label: "Custom type...",
                                click: async () => {
                                    const customType = window.prompt("Enter oligo type");
                                    if (customType === null) return;
                                    const t = toStr(customType).trim();
                                    if (!t) return;
                                    setTypeForSelected(t);
                                }
                            }
                        ];

                        let engineMonitor = new EngineMonitor((msg) => {
                        });

                        const submenu = [
                            // {
                            //     label: "TM",
                            //     click: async () => {
                            //         await applyToSelected(async (item) => {
                            //             if (item.structure && item.tm == null) {
                            //                 item.tm = await exec(




                            //                     'py/bio/RNA/tm-calculations.py', engineMonitor, polymerSyntaxToHelm(item.structure)
                            //                 );
                            //             }

                            //             const current = item.labelAttribute;
                            //             if (current === "tm.adjusted_tm_c") {
                            //                 item.clearLabelAttribute();
                            //             } else {
                            //                 item.setLabelAttribute("tm.adjusted_tm_c", {
                            //                     prefix: "Tm: ",
                            //                     textColor: "purple",
                            //                     strokeColor: "purple",
                            //                     fillColor: "white",
                            //                     offsetY: 0,
                            //                     font: "10px Arial",
                            //                 });
                            //             }
                            //         });
                            //     }
                            // },
                            {
                                label: "Chemistry",
                                click: async () => {
                                    await applyToSelected(async (item) => {
                                        const current = item.labelAttribute;
                                        if (current === "structure") {
                                            item.clearLabelAttribute();
                                        } else {
                                            item.setLabelAttribute("structure", {
                                                prefix: "",
                                                textColor: "navy",
                                                strokeColor: "navy",
                                                fillColor: "white",
                                                offsetY: 0,
                                                font: "10px Arial",
                                            });
                                        }
                                    });
                                }
                            },
                            {
                                label: "ID",
                                click: async () => {
                                    await applyToSelected(async (item) => {
                                        const current = item.labelAttribute;
                                        if (current === "id") {
                                            item.clearLabelAttribute();
                                        } else {
                                            item.setLabelAttribute("id", {
                                                textColor: "maroon",
                                                strokeColor: "cyan",
                                                fillColor: "white",
                                                offsetY: 0,
                                                font: "10px Arial",
                                            });
                                        }
                                    });
                                }
                            },
                            {
                                label: "Name",
                                click: async () => {
                                    await applyToSelected(async (item) => {
                                        const current = item.labelAttribute;
                                        if (current === "name") {
                                            item.clearLabelAttribute();
                                        } else {
                                            item.setLabelAttribute("name", {
                                                textColor: "black",
                                                strokeColor: "black",
                                                fillColor: "white",
                                                offsetY: 0,
                                                font: "10px Arial",
                                            });
                                        }
                                    });
                                }
                            },
                            {
                                label: "Status",
                                click: async () => {
                                    await applyToSelected(async (item) => {
                                        const current = item.labelAttribute;
                                        if (current === "status") {
                                            item.clearLabelAttribute();
                                        } else {
                                            item.setLabelAttribute("status", {
                                                textColor: "black",
                                                strokeColor: "black",
                                                fillColor: "white",
                                                offsetY: 0,
                                                font: "10px Arial",
                                            });
                                        }
                                    });
                                }
                            },
                            {
                                label: "Clear label",
                                click: async () => {
                                    await applyToSelected(async (item) => {
                                        item.clearLabelAttribute();
                                    });
                                }
                            }
                        ];

                        this.showSideMenu(submenu);
                    },
                });
                menu.push({
                    label: `Remove selected (${feats.length})`,
                    click: async () => {
                        const stats = removeFromAllTracks({
                            idKeys: selectedIdKeys,
                            signatures: selectedSignatures,
                        });

                        this.currentShape = null;
                        this.showSideMenu(null)

                    },
                });

                return menu;
            }

            showSideMenu(list) {

                if (!list) {
                    this.side_menu = null;
                    return;
                }

                console.log ( ' ')


                if (this.chapter_menu && this.showChapters) {
                    this.showChapters = false;
                }
                if (isMobile()) {
                    exec('flexigraph/show-mobile-menu.js', 0, 2, list, this.graph, this.genegraph_panel_layout)
                } else {
                    if (this.side_menu && this.side_menu.list == list) {
                        this.setMouseMode('menu')
                        return;
                    }
                    setTimeout(() => {
                        const safeList = Array.isArray(list) ? list : [];

                        if (safeList.length === 0) {
                            this.side_menu = null;
                            return;
                        }
                        const maxPerColumn = 10;
                        const itemCount = safeList.length;
                        const cols = Math.ceil(itemCount / maxPerColumn);
                        const bg = 'rgb(255, 247, 141)';
                        const fg = 'black';

                        const screen_width = this?.graph?.grid?.width ?? window.innerWidth ?? 800;
                        const screen_height = this?.graph?.grid?.height ?? window.innerHeight ?? 600;
                        const itemHeight = 35;

                        const getItemLabel = (item) => {
                            if (typeof item === 'string') return item;
                            if (item == null) return '';
                            return item.label || item.name || item.title || String(item);
                        };

                        let maxLabelWidth = 0;
                        try {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');

                            if (ctx) {
                                ctx.font = '18px Arial';
                                maxLabelWidth = Math.max(
                                    ...safeList.map(item => ctx.measureText(getItemLabel(item)).trim().width),
                                    0
                                );
                            }
                        } catch (e) {
                            maxLabelWidth = 0;
                        }

                        const width = Math.max(120, Math.ceil(maxLabelWidth) + 40);
                        const menuWidth = cols * width;
                        const rows = Math.min(itemCount, maxPerColumn);
                        const menuHeight = rows * itemHeight;

                        const xpos = (screen_width - menuWidth) / 2;
                        const ypos = (screen_height - menuHeight) / 2;

                        if (!this?.graph?.Xwc || !this?.graph?.Ywc) {
                            return;
                        }

                        this.side_menu = new Menu(
                            safeList,
                            this.graph.Xwc(xpos),
                            this.graph.Ywc(ypos),
                            bg,
                            fg,
                            cols
                        );

                        this.side_menu.menu_width = menuWidth;
                    }, 100);
                }
            }
            showMenu(list, x, y, width) {
                if (this.chapter_menu && this.showChapters) {
                    this.showChapters = false;
                }

                if (isMobile()) {
                    exec('flexigraph/show-mobile-menu.js', x, y, list, this.graph, this.genegraph_panel_layout)
                } else {

                    if (this.menu && this.menu.list == list) {
                        this.setMouseMode('menu')
                        return;
                    }
                    if (!width) {
                        width = 200;
                    }
                    setTimeout(() => {



                        if (list.length === 0) {
                            return;
                        }

                        const maxPerColumn = 7;
                        const itemCount = list.length;
                        const cols = Math.ceil(itemCount / maxPerColumn);
                        const bg = 'rgb(205, 255, 155)';
                        const fg = 'black';
                        const screen_width = this.graph.grid.width;
                        const screen_height = this.graph.grid.height;
                        const menuWidth = cols * width;
                        const itemHeight = 35;
                        const rows = Math.min(itemCount, maxPerColumn);
                        const menuHeight = rows * itemHeight;

                        const xpos = (screen_width - menuWidth) / 2;
                        const ypos = (screen_height - menuHeight) / 2;

                        this.menu = new Menu(list, this.graph.Xwc(xpos), this.graph.Ywc(ypos), bg, fg, cols);
                        this.menu.menu_width = width;
                        this.graph.menu = this.menu;
                        this.setMouseMode("menu")

                    }, 300)

                }
            }

            showWindowMenu(list, x, y, width) {
                exec('flexigraph/show-mobile-menu.js', x, y, list, this.graph, this.genegraph_panel_layout, true)
            }

            menuVisible() {
                if (this.menu != null) {
                    return true;
                } else
                    return false;
            }
            hideMenu() {
                this.menu = null;
            }
            setShadow(ctx, color, ox, oy, blur) {
                ctx.shadowColor = color;
                ctx.shadowOffsetX = ox;
                ctx.shadowOffsetY = oy;
                ctx.shadowBlur = blur;
            }

            move_icon = '/assets/img/icons/png/move-16.png'
            move_img = null;

            drag_icon = '/assets/img/icons/png/box-zoom.svg'
            drag_img = null;

            setButtonStyle(
                ctx,
                {
                    font = "600 12px Arial",
                    fill = "rgba(255,255,255,0.95)",
                    stroke = ORANGE,
                    lineWidth = 2,
                    shadowColor = "rgba(0,0,0,0.18)",
                    shadowBlur = 8,
                    shadowOffsetX = 0,
                    shadowOffsetY = 2,
                    textColor = "rgba(20,20,20,0.95)",
                } = {}
            ) {
                ctx.font = font;
                ctx.fillStyle = fill;
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = stroke;

                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = shadowBlur;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;

                ctx.fillStyle = fill;
                ctx._buttonTextColor = textColor;
            }

            resetCanvasEffects(ctx) {

                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            drawCircleButton(ctx, cx, cy, r = 11, { pressed = false } = {}) {
                ctx.save();

                if (pressed) {
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 1;
                    ctx.fillStyle = "rgba(255,255,255,0.90)";
                }

                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.stroke();

                ctx.restore();
            }

            drawButtonLabel(ctx, text, x, y, { color, font = "11px Arial" } = {}) {
                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.font = font;
                ctx.fillStyle = color ?? ctx._buttonTextColor ?? "black";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(text, x, y);
                ctx.restore();
            }

            drawButtonGlyph(ctx, glyph, cx, cy, { font = "700 14px Arial", color } = {}) {
                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.font = font;
                ctx.fillStyle = color ?? ctx._buttonTextColor ?? "black";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(glyph, cx, cy);
                ctx.restore();
            }

            drawDeselectButton(ctx) {
                this.setButtonStyle(ctx, {
                    font: "600 12px Arial",
                    fill: "rgba(255,255,255,0.95)",
                    stroke: ORANGE,
                    lineWidth: 2,
                });

                const offset = 100;
                const cx = offset + 20, cy = 335;

                this.drawCircleButton(ctx, cx, cy, 11);

                const label = `Deselect all (${this.selectedCompounds.length}) compounds`;
                this.drawButtonLabel(ctx, label, offset + 40, 360, {
                    color: "rgba(200, 40, 40, 0.95)",
                    font: "600 12px Arial",
                });
            }

            drawBMButton(ctx) {
                if (this.bclick === "bm") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 100;
                this.drawCircleButton(ctx, cx, cy, 11);

                this.drawButtonGlyph(ctx, "B", cx, cy, {
                    font: "700 12px Arial",
                    color: "rgba(20,20,20,0.95)",
                });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Bookmark", cx + 20, cy, {
                        font: "11px Arial",
                        color: "rgba(20,20,20,0.90)",
                    });
                }
            }

            drawZoomButton(ctx) {
                if (this.bclick === "zoom_in") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 170;
                this.drawCircleButton(ctx, cx, cy, 11);

                this.drawButtonGlyph(ctx, "+", cx, cy, {
                    font: "700 16px Arial",
                    color: "rgba(20,20,20,0.95)",
                });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Zoom In", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawZoomOutButton(ctx) {
                if (this.bclick === "zoom_out") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 205;
                this.drawCircleButton(ctx, cx, cy, 11);

                this.drawButtonGlyph(ctx, "–", cx, cy, {
                    font: "700 18px Arial",
                    color: "rgba(20,20,20,0.95)",
                });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Zoom Out", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawMoveButton(ctx) {
                if (this.bclick === "navigate") {
                    this.currentShape = null;
                    return;
                }

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 240;
                this.drawCircleButton(ctx, cx, cy, 11);

                ctx.save();
                this.resetCanvasEffects(ctx);

                if (this.move_img) {
                    ctx.drawImage(this.move_img, 17, 232);
                } else {
                    this.move_img = new Image();
                    this.move_img.src = this.move_icon;
                    this.move_img.onload = () => {

                        ctx.drawImage(this.move_img, 17, 232);
                    };
                }
                ctx.restore();

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Move the graph", cx + 20, cy, {
                        font: "11px Arial",
                        color: "rgba(20,20,20,0.90)",
                    });
                }
            }

            drawBoxButton(ctx) {
                if (this.bclick === "bpx") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 275, r = 11;
                this.drawCircleButton(ctx, cx, cy, r);

                const scale = 0.62;
                const side = r * Math.sqrt(2) * scale;
                const halfSide = side / 2;

                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.beginPath();
                ctx.rect(cx - halfSide, cy - halfSide, side, side);
                ctx.strokeStyle = "rgba(20,20,20,0.9)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.restore();

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Click and drag box to zoom in", cx + 20, cy, {
                        font: "11px Arial",
                    });
                }
            }

            drawExpandVerticalButton(ctx) {
                if (this.bclick === "expand_vertical") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 310;
                this.drawCircleButton(ctx, cx, cy, 11);

                this.drawButtonGlyph(ctx, "⇕", cx, cy, { font: "700 14px Arial" });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Expand Vertical", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawContractVerticalButton(ctx) {
                if (this.bclick === "contract_vertical") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 345;
                this.drawCircleButton(ctx, cx, cy, 11);

                this.drawButtonGlyph(ctx, "↕", cx, cy, { font: "700 14px Arial" });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Contract Vertical", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawExpandHorizontalButton(ctx) {
                if (this.bclick === "expand_horizontal") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 380;
                this.drawCircleButton(ctx, cx, cy, 11);

                this.drawButtonGlyph(ctx, "⇔", cx, cy, { font: "700 14px Arial" });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Expand Horizontal", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawContractHorizontalButton(ctx) {
                if (this.bclick === "contract_horizontal") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const cx = 25, cy = 415;
                this.drawCircleButton(ctx, cx, cy, 11);

                this.drawButtonGlyph(ctx, "↔", cx, cy, { font: "700 14px Arial" });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Contract Horizontal", cx + 20, cy, { font: "11px Arial" });
                }
            }

            alpha = 1
            delta = 0.059;

            fadeIn(d) {
                this.fade = true;
                this.delta = 0.15;
                if (d) {
                    this.delta = d;
                }
            }
            fadeOut(d) {
                this.fade = true;
                this.delta = -0.25;
                if (d) {
                    this.delta = d;
                }

            }

            appendLayers(la) {
                this.layers = this.layers.concat(la);
            }

            _drawCursorHint(ctx, text, mx, my) {
                const paddingX = 8;
                const paddingY = 6;
                const fontSize = isMobile() ? 12 : 15;
                const radius = 6;

                ctx.save();

                ctx.font = `${fontSize}px "Courier New", monospace`;
                ctx.textBaseline = 'top';

                const metrics = ctx.measureText(text);
                const textWidth = metrics.width;
                const textHeight = Math.ceil(fontSize * 1.2);

                const boxW = Math.ceil(textWidth + paddingX * 2);
                const boxH = Math.ceil(textHeight + paddingY * 2);

                const clampPad = 6;
                const maxX = ctx.canvas.width - boxW - clampPad;
                const maxY = ctx.canvas.height - boxH - clampPad;

                let boxX = Math.max(clampPad, Math.min(mx - paddingX, maxX));
                let boxY = Math.max(clampPad, Math.min(my - paddingY, maxY));
                const textX = boxX + paddingX;
                const textY = boxY + paddingY;

                boxY -= 10;
                const liftedBoxY = Math.max(clampPad, boxY);

                const roundRect = (x, y, w, h, r) => {
                    const rr = Math.min(r, w / 2, h / 2);
                    ctx.beginPath();
                    ctx.moveTo(x + rr, y);
                    ctx.arcTo(x + w, y, x + w, y + h, rr);
                    ctx.arcTo(x + w, y + h, x, y + h, rr);
                    ctx.arcTo(x, y + h, x, y, rr);
                    ctx.arcTo(x, y, x + w, y, rr);
                    ctx.closePath();
                };

                ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 6;

                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.fillStyle = 'rgba(14, 18, 14, 0.92)';
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.strokeStyle = 'rgba(90, 255, 120, 0.35)';
                ctx.lineWidth = 1;
                ctx.stroke();

                roundRect(boxX + 1, liftedBoxY + 1, boxW - 2, boxH - 2, radius - 1);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.shadowColor = 'rgba(60, 255, 120, 0.55)';
                ctx.shadowBlur = 10;
                ctx.fillStyle = '#6CFF9A';
                ctx.fillText(text, textX, liftedBoxY + paddingY);

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.save();
                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.clip();
                ctx.globalAlpha = 0.07;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                for (let y = liftedBoxY; y < liftedBoxY + boxH; y += 3) {
                    ctx.beginPath();
                    ctx.moveTo(boxX, y);
                    ctx.lineTo(boxX + boxW, y);
                    ctx.stroke();
                }
                ctx.restore();

                ctx.restore();
            }

            async redraw() {
                this.graph.rescale();
                if (this.graph.canvas) {
                    let ctx = this.graph.canvas.getCTX();
                    if (!ctx) {
                        return;
                    }
                    ctx.clearRect(0, 0, this.graph.canvas.width, this.graph.canvas.height);
                    ctx.globalAlpha = 1;
                    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                    await this.graph.drawBackdrop();
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.globalAlpha = this.alpha;
                    if (this.fade) {
                        this.alpha += this.delta;
                        if (this.alpha < 0) {
                            this.alpha = 0;
                            this.fade = false;
                        }
                        if (this.alpha > 1) {
                            this.alpha = 1;
                            this.fade = false;
                        }
                    }
                    if (this.track && this.track.length > 0) {
                        ctx.textAlign = 'left';
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'gray';
                        let font = `15px Arial`;
                        ctx.font = font;
                        ctx.fillStyle = 'lightGray';
                        let ocount = 0;
                        let i = 1;
                        for (let t of this.track) {
                            if (t.oligos)
                                ocount += t.oligos.length;
                            ctx.fillText(t.name + ': ' + Math.round(t.tgraph.Xwc(this.graph.mousex - t.tgraph.xi * 2)), 102, i * 140);
                            i++;
                        }

                        if (this.folder && this.folder != undefined && this.folder.name != undefined) {
                            ctx.fillText('Folder: ' + this.folder.name, 20, 75);
                        }
                        if (this.file) {
                            ctx.fillText('File: ' + this.file, 20, 100);
                        } else {

                        }
                        if (this.showDisplay) {
                            ctx.textAlign = 'left';
                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'black';
                            ctx.font = 'bold 10px Arial';
                            ctx.fillStyle = 'navy';

                            let str = Math.floor((this.graph.grid.xmax - this.graph.grid.xmin) / (this.graph.grid.ymax - this.graph.grid.ymin)) + '';
                            ctx.fillText(str, 2, 10);
                            ctx.fillText('Tracks: ' + this.track.length, 2, 25);
                            ctx.fillText('Oligos: ' + ocount, 2, 40);
                            if (!this.props.selected_chemistry) {
                                const text = '(No chemistry selected)';
                                const x = 2;
                                const y = 55;

                                const pulse = (Math.sin(performance.now() * 0.002) + 1) * 0.5;

                                ctx.save();
                                ctx.font = 'bold 10px Arial';
                                ctx.textBaseline = 'middle';
                                ctx.textAlign = 'left';

                                if (!this.__noChemWidth) {
                                    this.__noChemWidth = ctx.measureText(text).width;
                                }

                                const padX = 8;
                                const boxH = 16;
                                const boxW = this.__noChemWidth + padX * 2;
                                const bx = x - padX;
                                const by = y - boxH / 2;

                                ctx.shadowColor = 'orange';
                                ctx.shadowBlur = 8 + pulse * 20;
                                ctx.fillStyle = `rgba(255,240,120,${0.25 + pulse * 0.35})`;
                                roundRectPath(ctx, bx, by, boxW, boxH, 6);
                                ctx.fill();

                                ctx.shadowBlur = 0;
                                ctx.strokeStyle = `rgba(255,140,0,${0.4 + pulse * 0.4})`;
                                roundRectPath(ctx, bx, by, boxW, boxH, 6);
                                ctx.stroke();

                                ctx.fillStyle = `rgba(160,30,0,${0.8 + pulse * 0.2})`;
                                ctx.fillText(text, x, y);

                                ctx.restore();
                            } else {
                                let t = this.props.selected_chemistry?.name ?? '';

                                if (t.endsWith('.json')) {
                                    t = t.substring(0, t.indexOf('.json'));
                                }

                                if (t) {
                                    ctx.save();
                                    ctx.textAlign = 'left';
                                    ctx.textBaseline = 'middle';
                                    ctx.font = 'bold 10px Arial';
                                    ctx.fillStyle = 'blue';

                                    ctx.fillText(t, 2, 55);

                                    ctx.restore();
                                }
                            }
                        }

                        if (this.highlight_text) {
                            ctx.fillStyle = 'gray';
                            if (this.highlight_color) {
                                ctx.fillStyle = this.highlight_color;
                            }

                            if (this.hx === null) {
                                this.hx = 20;
                            }
                            if (this.hy === null) {
                                this.hy = 200;
                            }

                            ctx.fillText(this.highlight_text, this.hx, this.hy);
                        }

                        if (this.coords && (!isNaN(this.coords))) {
                            ctx.fillStyle = 'lightBlue';
                            ctx.fillText('(' + this.coords + ', ' + this.ycoords + ')', 2, this.graph.canvas.height - 30);

                        }
                    }

                    await this.drawGraphLayers();
                    await this.drawTracks();

                    if (this.highlightmethod) {
                        this.highlightmethod(ctx, this);
                    }
                    if (this.plots) {
                        for (let plot of this.plots) {
                            if (plot.draw)
                                plot.draw(this.graph)
                        }
                    }
                    const style = this.graph?.canvas?.canvas?.nativeElement?.style;

                    if (style) {
                        const mode = this.graph?.mode;

                        if (mode === 'navigate') {
                            style.cursor = 'grab';
                        } else if (mode === 'select') {
                            style.cursor = 'context-menu';
                        } else if (mode === 'bpx' || mode === 'draw-rect') {
                            style.cursor = 'crosshair';
                        } else {
                            style.cursor = 'default';
                        }
                    }

                    const mode = this.graph?.mode;
                    if (mode) {
                        if (mode === "select-track") {
                            const mx = (this.graph.mscx) + 18;
                            const my = (this.graph.mscy) - 28;
                            this._drawCursorHint(ctx, "Click on a track", mx, my);
                        } else
                            if (mode.startsWith("msg:")) {
                                const mx = (this.graph.mscx) + 18;
                                const my = (this.graph.mscy) - 28;
                                this._drawCursorHint(ctx, mode.split(':')[1], mx, my);
                            }
                    }
                    if (this.___folder_calculation) {
                        await this.blurCanvasBackground(ctx, 8);
                        await this.drawMoleculeFoldFrame(ctx);
                        await this.drawMoleculeFoldFrame(ctx);
                    }
                    if (this.message) {

                        if (!this.fontSize) {
                            this.fontSize = 20
                        }
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'black';
                        ctx.textBaseline = 'top';
                        let font = `${this.fontSize}px Arial`;
                        if (isMobile()) {
                            this.fontSize = 10;
                            font = `${this.fontSize}px Arial`;
                        } else {
                        }
                        ctx.font = font;
                        let mx = 250;
                        let my = 25;
                        if (this.messagex > 200 && this.messagex < this.graph.canvas.width) {
                            mx = this.messagex;
                        }
                        if (this.messagey > 20 && this.messagey < this.graph.canvas.height) {
                            my = this.messagey;
                        }
                        if (this.centerMessage) {
                            ctx.fillStyle = 'rgba(100, 100, 230, 0.7)';
                            var metrics = ctx.measureText(this.message);
                            var textWidth = metrics.width;
                            var x = (ctx.canvas.width - textWidth) / 2;
                            var y = (ctx.canvas.height + this.fontSize) / 2;

                            ctx.fillText(this.message, x, y);
                        } else {
                            let smallfontSize = 19;
                            ctx.fillStyle = 'maroon';
                            ctx.font = `${smallfontSize}px Arial`;
                            ctx.fillText(this.message, mx, my);
                        }
                    } if (this.mouse_message) {

                        ctx.textBaseline = 'top';

                        let font = `${this.fontSize}px Arial`;
                        if (isMobile()) {
                            this.fontSize = 10;
                            font = `${this.fontSize}px Arial`;
                        }
                        ctx.font = font;

                        let mx = this.mousex;
                        let my = this.mousey - 50;

                        let smallfontSize = 19;
                        ctx.font = `${smallfontSize}px Arial`;
                        ctx.fillStyle = 'maroon';

                        const padding = 6;
                        const text = this.mouse_message || "";
                        const metrics = ctx.measureText(text);
                        const textWidth = metrics.width;
                        const textHeight = smallfontSize * 1.2;

                        ctx.save();
                        ctx.shadowColor = 'rgba(0,0,0,0.5)';
                        ctx.shadowBlur = 8;
                        ctx.shadowOffsetX = 3;
                        ctx.shadowOffsetY = 3;

                        ctx.fillStyle = 'white';
                        roundRectPath(ctx, mx - padding, my - padding, textWidth + padding * 2, textHeight + padding * 2, 8);
                        ctx.fill();
                        ctx.restore();

                        ctx.fillStyle = 'maroon';
                        ctx.fillText(text, mx, my);

                    }
                    if (this.highlightObject && this.highlightObject.draw) {
                        this.highlightObject.draw(ctx, this);
                    }
                    if (this.error) {
                        ctx.shadowBlur = 2;
                        ctx.shadowColor = 'black';
                        let font = `${this.fontSize}px Arial`;
                        if (isMobile()) {
                            this.fontSize = 10;
                            font = `${this.fontSize}px Arial`;
                        }
                        ctx.font = font;
                        let mx = 15;
                        let my = 25;
                        let smallfontSize = 15;
                        ctx.fillStyle = 'red';
                        ctx.font = `${smallfontSize}px Arial`;
                        ctx.fillText(this.error, mx, my);
                    }
                    if (this.showNavigationControl) {
                        ctx.strokeStyle = 'black'

                        this.drawZoomButton(ctx);
                        this.drawZoomOutButton(ctx);
                        this.drawMoveButton(ctx);
                        this.drawBoxButton(ctx);
                        this.drawContractHorizontalButton(ctx);
                        this.drawContractVerticalButton(ctx);
                        this.drawExpandHorizontalButton(ctx);
                        this.drawExpandVerticalButton(ctx);
                    }
                    ctx.fillStyle = "white";
                    ctx.lineWidth = 0;
                    ctx.strokeStyle = "black";
                    this.setShadow(ctx, "darkGray", 0, 0, 0);
                    ctx.textAlign = 'left';

                    if (this.shapes) {
                        for (let shape of this.shapes) {
                            await shape.draw(this.graph)
                        }
                    }
                    if (this.currentShape) {
                        await this.currentShape.draw(this.graph)
                    }
                    ctx.textAlign = 'left';
                    if (this.menu) {
                        await this.graph.drawMenu(this.menu, ctx)
                    }
                    if (!this.__last_side_menu_ref && this.side_menu) {
                        this.__last_side_menu_ref = this.side_menu;
                    }

                    if (!this.side_menu && this.__last_side_menu_ref) {

                    } else if (this.side_menu) {
                        this.__last_side_menu_ref = this.side_menu;
                    }
                    const menuToDraw = this.side_menu || this.__last_side_menu_ref;
                    const presentNow = !!this.side_menu;
                    const fadeState = _stepSideMenuFade(this, presentNow);

                    if (menuToDraw) {

                        menuToDraw.x = this.Xwc(100);
                        menuToDraw.y = this.Ywc(100);

                        _applySideMenuBgAlpha(this, fadeState.alpha);

                        if (fadeState.alpha > 0.001 && menuToDraw.draw) {
                            menuToDraw.draw(ctx, this.graph.grid);
                        }

                        if (!presentNow && fadeState.alpha <= 0.001) {
                            this.__last_side_menu_ref = null;
                        }

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'black';
                    }
                    ctx.textAlign = 'left';
                    if (this.bookmark_menu && this.showBookmarks) {

                        this.graph.drawMenu(this.bookmark_menu, ctx)
                    }
                    if (this.chapter_menu && this.showChapters) {
                        this.graph.drawMenu(this.chapter_menu, ctx)
                    }
                    if (isMobile()) {
                        this.showNavigationControl = false;
                    }

                    if (this.center_paragraph_text) {

                        ctx.save();
                        ctx.globalAlpha = 1;

                        this._drawCenteredParagraph(ctx, this.center_paragraph_text, {
                            maxWidth: 300,
                            minFontSize: 18,
                            maxFontSize: 44,
                            fontFamily: "Arial",
                            lineHeightMult: 1.25,
                            padding: 14,
                            marginX: 40,
                            textColor: "black",
                        });

                        ctx.restore();
                    }

                    if (!this.showSprite) {
                        this.showSprite = false;
                        spriteObject = null;
                    }
                    if (!spriteObject && this.showSprite) {
                        const centerX = 0 + ctx.canvas.width / 2;
                        const centerY = 0 + ctx.canvas.height / 2;
                        spriteObject = new FinancialCalcSpriteWithStatus(centerX - 18, centerY - 18, 1, {
                            messages: [
                            ]
                            ,
                            showTimer: true,
                            timerPrefix: 'Elapsed',
                            timerOffsetY: 36,
                            messageMinDelay: 1,
                            messageMaxDelay: 45,
                            onAllMessagesShown: () => console.log("All status messages displayed.")
                        });
                    }
                    if (spriteObject && spriteObject.update) {
                        spriteObject.update(0.05);
                        spriteObject.draw(ctx);
                    }

                }

            }

            setCenterParagraph(txt) {
                this.center_paragraph_text = txt;
            }

            setTrack(track, trackIndex) {
                this.track[trackIndex] = track;
                this.notifyTrackListener();
                this.drawTracks();
            }

            getTrackByID(idValue) {
                return this.track.find(obj => obj.transcriptID === idValue);
            }

            highlightTrackCoords(x, y) {
                this.coords = null;
                this.ycoords = null;
                let t = this.getTrack(x, y);
                if (t >= 0) {
                    let track = this.track[t];
                    if (track)
                        if (track.tgraph) {
                            let c = track.tgraph.Xwc(x).toFixed(0)
                            this.coords = c;
                            track.highlightIndex = c;

                            this.ycoords = track.tgraph.Ywc(y).toFixed(2)
                        } else {
                            this.coords = c;
                        }

                }
            }

            createTrack(name, start, end, strand) {
                let t = new Track(name, start, end, 2, strand)

                this.addTrack(t)
                this.notifyTrackListener();
                t.tgraph.yi = this.track.length + 1;
                return t;
            }
            createTrackFromGFF(name, gff_text) {
                let gff = new GFF(gff_text);
                let range = gff.getRange();

                let strand = '-'
                this.graph.setymax(this.tracks.length + 1)
                let t = new Track(name, range['min'], range['max'], this.tracks.length, strand)

                this.graph.setxmax(t.tgraph.width)
                this.graph.setxmin(0)

                this.track.push(t)
                this.notifyTrackListener();

                this.drawTracks();
                return t;
            }

            getRange() {
                return {
                    start: this.getxmin(),
                    end: this.getxmax()
                }
            }

            createComponent(mdel) {
                return this.graph.createComponent(null, null, mdel);
            }

        }
        gg = new GeneGraph();
        await gg.init();
        return resolve(gg)
    })

}
