function (progress, options) {

    return new Promise(async (resolve, reject) => {
        if (progress) {
            progress(5)
        }
        const ORANGE = "rgb(1, 12, 110)";
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
                this.badgeText = String(badgeText || '');
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
            showDisplay = false;   // info panel (tracks/oligos) hidden until toggled on
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
            // Show an ERROR message: orange glow/border, held for at least 5 seconds.
            setError(m, seconds) {
                // Work is over, one way or the other — drop the in-progress badge.
                try {
                    if (window.__workStatus) {
                        window.__workStatus = '';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    }
                } catch (e) { }
                if (this.wake) this.wake();
                this.centerMessage = false;
                this.message = m;
                this.messageIsError = true;
                this.messageIsResult = false;
                this.messagex = 150;
                this.messagey = 25;
                if (this.timeout) clearTimeout(this.timeout);
                const ms = Math.max(5000, (seconds || 6) * 1000);
                this.timeout = setTimeout(() => {
                    this.message = null;
                    this.messageIsError = false;
                    this.messagex = 150;
                    this.messagey = 25;
                }, ms);
            }

            // A RESULT/summary toast (cyan) that IS shown even though ordinary working/status
            // messages are suppressed — used for "added N mutations on genes …" style outcomes.
            setResultMessage(m, seconds) {
                // Work is over, one way or the other — drop the in-progress badge.
                try {
                    if (window.__workStatus) {
                        window.__workStatus = '';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    }
                } catch (e) { }
                if (this.wake) this.wake();
                this.centerMessage = false;
                this.message = m;
                this.messageIsError = false;
                this.messageIsResult = true;
                this.messagex = 150;
                this.messagey = 25;
                if (this.timeout) clearTimeout(this.timeout);
                const ms = Math.max(7000, (seconds || 9) * 1000);
                this.timeout = setTimeout(() => {
                    this.message = null;
                    this.messageIsResult = false;
                    this.messagex = 150;
                    this.messagey = 25;
                }, ms);
            }

            setMessage(m, messagex, messagey) {
                // While an error OR result message is showing, don't let ordinary (suppressed)
                // status messages overwrite it — it stays until its own timeout clears it.
                if (this.messageIsError || this.messageIsResult) return;

                // ONE place for work-in-progress feedback.
                //
                // A message ending in an ellipsis is this codebase's existing convention for
                // "still working" — "Designing primers (djPrimer)...", "Running splicing model…",
                // "Loading track …". Those now drive the status badge under the canvas buttons,
                // next to the spinner, so every in-progress message appears in the same spot
                // instead of each caller picking its own. Nothing else has to change: hundreds of
                // existing setMessage calls already follow the convention.
                //
                // A message WITHOUT the ellipsis means the work reached a conclusion, so it
                // clears the badge — otherwise a spinner would keep turning under a finished job.
                try {
                    const __s = ('' + (m == null ? '' : m)).trim();
                    const __busy = /(…|\.\.\.)$/.test(__s);
                    if (__busy) {
                        window.__workStatus = __s;
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } else if (__s && window.__workStatus) {
                        window.__workStatus = '';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    }
                } catch (e) { }

                if (this.wake) this.wake();
                this.centerMessage = false;
                this.message = m;
                this.messageIsError = false;   // normal (cyan) unless setError() is used
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
                if (this.wake) this.wake();
                this.setMessageCenter(m, fontSize)
            }

            // Upper-left "window message" spinner: a fixed DOM notice (spinning ring + text) pinned
            // to the top-left, matching the app's other upper-left status spinners. Used in place of
            // the old center-canvas "crunching" sprite. Idempotent (singleton per graph).
            _showWorkSpinner(text) {
                try {
                    if (!document.getElementById('baja-work-spin-kf')) {
                        const st = document.createElement('style'); st.id = 'baja-work-spin-kf';
                        st.textContent = '@keyframes bajaWorkSpin{to{transform:rotate(360deg)}}';
                        document.head.appendChild(st);
                    }
                    let box = this.__workSpinner;
                    if (!box || !box.parentNode) {
                        box = document.createElement('div');
                        box.style.cssText = 'position:fixed;top:104px;left:14px;z-index:2147483000;'
                            + 'display:flex;align-items:center;gap:10px;padding:9px 14px 9px 11px;'
                            + 'border-radius:12px;background:rgba(10,25,40,0.88);'
                            + 'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);'
                            + 'box-shadow:0 8px 24px rgba(0,0,0,0.42);border:1px solid rgba(18,194,224,0.35);'
                            + 'font:600 13px "Segoe UI",Arial,sans-serif;color:#eaf6f9;max-width:46vw;pointer-events:none;';
                        const ring = document.createElement('div');
                        ring.style.cssText = 'flex:0 0 auto;width:18px;height:18px;border-radius:50%;'
                            + 'border:3px solid rgba(255,255,255,0.22);border-top-color:#ffd98a;'
                            + 'animation:bajaWorkSpin 0.8s linear infinite;';
                        const txt = document.createElement('div');
                        box.__txt = txt;
                        box.appendChild(ring); box.appendChild(txt);
                        document.body.appendChild(box);
                        // Sit just below any button-canvas toolbar in the upper-left.
                        try {
                            let lowest = 0;
                            const bcs = document.querySelectorAll('button-canvas');
                            for (const bc of bcs) { const r = bc.getBoundingClientRect(); if (r.top < 160 && r.width > 40 && r.height > 8 && r.bottom > lowest) lowest = r.bottom; }
                            if (lowest > 0) box.style.top = Math.round(lowest + 10) + 'px';
                        } catch (e) { }
                        this.__workSpinner = box;
                    }
                    try { if (box.__txt) box.__txt.textContent = text || 'Working…'; } catch (e) { }
                } catch (e) { }
            }
            _hideWorkSpinner() {
                try { const b = this.__workSpinner; if (b && b.parentNode) b.parentNode.removeChild(b); } catch (e) { }
                this.__workSpinner = null;
            }

            // Show a brand logo/icon centered on an EMPTY canvas (startup) instead of a text
            // center-message. It renders only while there are no tracks, so it disappears on
            // its own once a track is loaded. Defaults to the Baja icon.
            // holdMs / fadeMs make this a SPLASH rather than a permanent mark. The static
            // version was removed because a picture parked in the middle of the editor is
            // decoration the user cannot act on, and it sat exactly where the first loaded
            // track draws. Fading it out keeps the greeting and drops the obstruction: it is
            // gone by the time anyone wants the space.
            setCenterLogo(url, holdMs, fadeMs) {
                this.__centerLogoAt = Date.now();
                this.__centerLogoHold = (holdMs == null) ? 1400 : Math.max(0, +holdMs || 0);
                this.__centerLogoFade = (fadeMs == null) ? 1800 : Math.max(1, +fadeMs || 1);
                if (this.wake) this.wake();
                // A falsy url CLEARS the mark. It used to fall back to the Baja icon, so the
                // one call that could remove the logo -- setCenterLogo(null) -- put it back
                // instead, and there was no way to turn it off at all.
                const u = ('' + (url || '')).trim();
                this.centerLogoUrl = u || null;
                if (!this.centerLogoUrl) { this.__centerLogoImg = null; this.__centerLogoImgUrl = null; return; }
                if (this.centerLogoUrl && (!this.__centerLogoImg || this.__centerLogoImgUrl !== this.centerLogoUrl)) {
                    try {
                        const img = new Image();
                        this.__centerLogoImgUrl = this.centerLogoUrl;
                        img.onload = () => { this.__centerLogoImg = img; if (this.wake) this.wake(); };
                        img.onerror = () => { this.__centerLogoImg = null; };
                        img.src = this.centerLogoUrl;
                    } catch (e) { }
                }
            }

            // A bold, centered "sunset orange" announcement that stands out far more than
            // setCenterMessage: large heavy letters filled with a warm sunset gradient
            // (amber -> orange -> pink), a dark outline for contrast and a warm glow,
            // centered on the canvas. Uses its own property/timeout so it doesn't clobber
            // the normal message toast. Held for `seconds` (default 5).
            setSunsetMessage(m, seconds) {
                if (this.wake) this.wake();
                this.sunsetMessage = m;
                // Make sure the 80s display font (Audiowide) is loaded, then repaint so the
                // message renders in it rather than the fallback.
                try {
                    if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
                        document.fonts.load('48px "Audiowide"').then(() => { if (this.wake) this.wake(); }).catch(() => { });
                    }
                } catch (e) { }
                if (this.sunsetTimeout) clearTimeout(this.sunsetTimeout);
                const ms = Math.max(1500, (seconds || 5) * 1000);
                this.sunsetTimeout = setTimeout(() => {
                    this.sunsetMessage = null;
                    if (this.wake) this.wake();
                }, ms);
            }

            // A persistent title banner pinned across the top of the canvas (above all the
            // tracks) — used e.g. for a manuscript's title when a paper is loaded. Pass a
            // falsy value to clear it.
            setTitle(text) {
                this.titleText = ('' + (text || '')).trim() || null;
                if (this.wake) this.wake();
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
                                label: 'ppset ' + o.left.xi + '...' + o.right.xf,
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



                console.log(" update graph ")



                if (this.wake) this.wake();
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

            // If this track's name already belongs to one on the canvas, append an incrementing
            // integer until it does not -- "SCN9A" -> "SCN9A2" -> "SCN9A3" -- leaving the
            // existing tracks' names alone. Case-insensitive.
            //
            // A method rather than a block inside addTrack, because addTrack is not the only
            // way a track reaches this.track: several paths push straight onto the array, and
            // those were producing duplicate names that nothing later could tell apart -- the
            // layer menus, the export filenames and the selection window all address a track
            // by its name.
            ensureUniqueTrackName(newTrack) {
                try {
                    debugger
                    if (!newTrack) return newTrack;
                    const named = (newTrack.name != null && ('' + newTrack.name).trim().length);
                    const base = named ? ('' + newTrack.name) : 'track';
                    // An unnamed track takes the fallback outright. It used to keep its empty
                    // name whenever "track" happened to be free, and a track with no name is
                    // exactly the one the layer menus and the selection window cannot address.
                    if (!named) newTrack.name = base;
                    const taken = (nm) => (this.track || []).some(t =>
                        t && t !== newTrack && t.name && ('' + t.name).toUpperCase() === ('' + nm).toUpperCase());
                    if (taken(base)) {
                        let n = 2, candidate = base + n;
                        while (taken(candidate)) { n++; candidate = base + n; }
                        newTrack.name = candidate;
                    }
                } catch (e) { }
                return newTrack;
            }

            addTrack(newTrack) {
                if (!this.isValidTrack(newTrack)) {
                    console.warn('[track] rejected invalid track (NaN/zero coordinates or dimensions):',
                        newTrack && newTrack.name);
                    return;
                }
                if (this.wake) this.wake();

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
                        newTrack.y += 4.5;
                        newTrack.tgraph.yi = newTrack.y;
                    }

                }, 200)

                this.ensureUniqueTrackName(newTrack);

                this.track.push(newTrack);
                this._autoLoadDomains(newTrack);
            }

            // When a coding track is loaded, automatically map its protein domains (CDD) onto it.
            // Fire-and-forget + once-per-track; skips tracks with no ORF/CDS and ones that already
            // carry protein-domain annotations. protein-domains.js re-verifies coding and no-ops
            // on non-coding transcripts, so this only ever adds domains where they belong.
            _autoLoadDomains(t) {
                try {
                    if (!t || t.__domainsAutoTried) return;
                    // Deferred during a bulk load (e.g. a file import) so the CDD lookups don't
                    // compete with / slow the gene + mutation loading — the loader fires them in
                    // the background once everything else is in. Don't mark as tried while deferred.
                    if (this.__suppressAutoDomains) return;
                    t.__domainsAutoTried = true;
                    const anns = Array.isArray(t.annotations) ? t.annotations : [];
                    if (anns.some(a => a && ('' + a.type) === 'ProteinDomain')) return;   // already has domains
                    const codingish = anns.some(a => a && (('' + a.type) === 'Exon' || ('' + a.type) === 'CDS'))
                        || (typeof t.getCDS === 'function') || (typeof t.generateORF === 'function');
                    if (!codingish) return;
                    setTimeout(() => {
                        try { exec('baja/manchester/menu/protein-domains.js', this, this.genegraph_panel_layout, t); } catch (e) { }
                    }, 400);
                } catch (e) { }
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
                // Deselecting drops any single-mutation focus (see focus-mutation.js): the grayed-out
                // other mutations come back and their annotations reappear.
                try {
                    this.__focusSnp = null;
                    this.__focusUntil = 0;
                    if (this.__focusTimer) { clearTimeout(this.__focusTimer); this.__focusTimer = null; }
                } catch (e) { }
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

                this.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                this.graph.mode = mode;

                // Whenever we return to the default 'navigate' mode, arm the mouse-over hover
                // highlight — unless the caller installs its own canvas interaction right
                // after (checked on the next tick, so we never clobber it). Debounced and
                // re-entrancy-guarded so re-arming (which itself touches navigate mode) can't
                // loop.
                if (mode === 'navigate' && !this.__hoverRearming && !this.__navHoverScheduled) {
                    this.__navHoverScheduled = true;
                    setTimeout(() => {
                        this.__navHoverScheduled = false;
                        try {
                            if (this.graph && this.graph.mode === 'navigate'
                                && this.mouseDownListeners.length === 0 && this.mouseMoveListeners.length === 0
                                && !this.menuVisible() && !this.side_menu) {
                                this.__hoverRearming = true;
                                try {
                                    if (typeof this.__hoverRearm === 'function') {
                                        this.__hoverRearm();
                                    } else {
                                        const gpl = this.genegraph_panel_layout
                                            || (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed ? CurrentLayout.getStashed('genegraph_panel_layout') : null);
                                        exec('baja/manchester/menu/mouse-over-highlight.js', this, gpl);
                                    }
                                } finally {
                                    setTimeout(() => { this.__hoverRearming = false; }, 150);
                                }
                            }
                        } catch (e) { this.__hoverRearming = false; }
                    }, 30);
                }
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
                    // Deselect every variant on the track too.
                    for (let s of (t.snpindels || [])) {
                        if (s) { s.highlight = false; if (s.deselect) { try { s.deselect(); } catch (e) { } } }
                    }
                }
                // Clear the SNP spotlight + drop selected variants from the selection window, so the
                // per-frame reassertSelectionHighlights() doesn't immediately re-highlight them.
                this.__snpSelectionActive = false;
                try { if (Array.isArray(this.__lassoSelection)) this.__lassoSelection = this.__lassoSelection.filter((e) => e && e.kind !== 'snp'); } catch (e) { }
                try { this.__focusSnp = null; this.__focusUntil = 0; } catch (e) { }
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

                    // After an animated zoom, restore the mouse-over hover highlight (the
                    // operation that started the zoom typically cleared the listeners). A
                    // caller that sets up its own interaction does so AFTER awaiting this, so
                    // it still wins. See mouse-over-highlight.js (sets __hoverRearm).
                    try { if (typeof this.__hoverRearm === 'function') this.__hoverRearm(); } catch (e) { }

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

                    if (!t) continue;   // bad/NaN coordinates -> skip this transcript
                    t.transcriptID = transcriptId;
                    t.species = js['species'];
                    t.chr = js['seq_region_name'];
                    t.description = (js['display_name'] || '').toString();
                    t.geneID = js['Parent'];

                    let fasta = '';
                    let annotations = null;

                    try {

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
                        let ensembl_sequence = (window['env']?.['apiUrl'] || window.location.origin) + `/api/ensembl/sequence/${transcriptId}?prefix=${encodeURIComponent(prefix)}`;
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

                // If the transcript has a CDS but no explicit start_codon/stop_codon,
                // derive the start (TSS) and stop (STOP) from the CDS bounds and the
                // orientation: 5'-most CDS base is the start, 3'-most is the stop (for
                // '-' strand these swap in genomic coordinates).
                const _hasTSS = annotations.some(a => ('' + a.type).toLowerCase() === 'tss');
                const _hasSTOP = annotations.some(a => ('' + a.type).toLowerCase() === 'stop');
                const _cds = annotations.filter(a => a.type === 'CDS');
                if (_cds.length && (!_hasTSS || !_hasSTOP)) {
                    let lo = Infinity, hi = -Infinity;
                    for (const c of _cds) { lo = Math.min(lo, c.xi, c.xf); hi = Math.max(hi, c.xi, c.xf); }
                    const _strand = _cds[0].strand;
                    const _plus = !(_strand === '-' || _strand === -1 || _strand === '-1');
                    const _startG = _plus ? [lo, lo + 2] : [hi - 2, hi];
                    const _stopG = _plus ? [hi - 2, hi] : [lo, lo + 2];
                    if (!_hasTSS) { let a = new Annotation('TSS', 'TSS', _startG[0], _startG[1], _strand); try { a.shapeFunction = getIon(shapes[a.type]); } catch (e) { } annotations.push(a); }
                    if (!_hasSTOP) { let a = new Annotation('STOP', 'STOP', _stopG[0], _stopG[1], _strand); try { a.shapeFunction = getIon(shapes[a.type]); } catch (e) { } annotations.push(a); }
                }

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

            // Loading a track is an Ensembl lookup plus sequence and annotations, which can run
            // for several seconds with no feedback. Drive the app's EXISTING upper-left work
            // spinner rather than adding a bespoke one: the redraw loop shows/hides that DOM
            // node from `showSprite` on every frame, so calling _showWorkSpinner() directly
            // would be wiped on the very next frame. __backendWorkCount keeps the redraw loop
            // awake so the ring keeps turning while the user sits idle.
            //
            // Depth-counted because add() recurses (an NM_/NC_ id maps then re-enters add) and
            // callers fire several loads concurrently without awaiting them — the spinner has
            // to survive until the LAST one finishes, not the first. The previous showSprite
            // value is restored rather than forced false, so a load that overlaps another
            // owner of the flag (snp-menu) does not switch their spinner off.
            async add(ensembleId, x, y, source, __noAiResolve) {
                if (!this.__addDepth) { this.__addDepth = 0; this.__addSpritePrev = !!this.showSprite; }
                this.__addDepth++;
                let __counted = false;
                try {
                    try {
                        const __nm = ('' + (ensembleId || 'track')).trim();
                        // Name the source as well as the target: "Loading UNC13A" leaves the user
                        // wondering whether it is stuck locally or waiting on Ensembl, which is
                        // the difference between a second and half a minute.
                        const __src = ('' + (source || '')).trim();
                        window.__workStatus = 'Loading track ' + (__nm || 'track')
                            + (__src ? ('  ·  from ' + __src) : '') + '…';
                        // Show it now. The badge polls, but a load that finishes inside one poll
                        // interval would otherwise never appear at all.
                        try { if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh(); } catch (e) { }
                        window.__backendWorkCount = (window.__backendWorkCount || 0) + 1;
                        __counted = true;
                        this.showSprite = true;
                        if (this.wake) this.wake();
                    } catch (e) { }
                    return await this.__addTrack(ensembleId, x, y, source, __noAiResolve);
                } finally {
                    if (__counted) { try { window.__backendWorkCount = Math.max(0, (window.__backendWorkCount || 1) - 1); } catch (e) { } }
                    this.__addDepth--;
                    if (this.__addDepth <= 0) {
                        this.__addDepth = 0;
                        try { this.showSprite = !!this.__addSpritePrev; if (this.wake) this.wake(); } catch (e) { }
                        // Clear only at depth 0: add() recurses and callers fire several loads
                        // without awaiting, so clearing on the first one to finish would drop the
                        // status while the rest are still running.
                        try {
                            window.__workStatus = '';
                            if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                        } catch (e) { }
                    }
                }
            }

            async __addTrack(ensembleId, x, y, source, __noAiResolve) {
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
                    setTimeout(async () => {
                        await this.animateTo(
                            t.tgraph.xi - offset,
                            t.tgraph.xi + t.tgraph.width + offset,
                            t.tgraph.yi - Math.abs(t.tgraph.height) - 10,
                            t.tgraph.yi + t.tgraph.height + 10
                        );
                        this.setMouseMode('navigate');
                        // Always record the FIRST view in the navigation history as soon as it loads
                        // (once the intro animation has settled), so 'back' returns to the initial view.
                        try { this.pushOntoHistory(); } catch (e) { }
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
                    if (/^ENS[A-Z]*T\d/i.test(ensembleId)) {   // any Ensembl transcript: ENST / ENSMUST / ENSRNOT ...

                        let localLoaded = false;

                        try {



                            let try_local = `${host_}/transcript/${encodeURIComponent(ensembleId)}`;








                            let localResp = await GETJSON(try_local);

                            // The local /transcript endpoint may return either a legacy
                            // GFF feature array, or the newer payload object
                            //   { transcriptId, sequence, annotations, strand }.
                            // Normalise both shapes to a GFF feature array (+ sequence).
                            let localJs = null;
                            let localSequence = null;
                            if (Array.isArray(localResp)) {
                                localJs = localResp;
                            } else if (localResp && typeof localResp === 'object') {
                                localJs = Array.isArray(localResp.annotations) ? localResp.annotations : [];
                                localSequence = localResp.sequence || null;

                                // Let the user know when the local reference is still
                                // downloading and this came from the remote service.
                                if (localResp.referencesLoading) {
                                    let sp = localResp.species || 'reference';
                                    this.setMessage(' ' + sp
                                        + ' reference data is still downloading — using the remote service for now (local will be faster once ready).');
                                }
                            }

                            if (localJs && localJs.length > 0) {



                                // Pick the transcript-level feature AGNOSTICALLY. Ensembl GFF3 labels
                                // it 'transcript' for some biotypes but 'mRNA' for protein-coding and
                                // 'lnc_RNA' / '*RNA' / 'processed_transcript' for others (e.g. mouse
                                // ENSMUST uses 'mRNA', not 'transcript'). The old exact 'transcript'
                                // check missed those and fell back to annotations[0] (the first EXON),
                                // so the track's end (xf) became the first exon's end and the track
                                // rendered/selected only a small left-to-right portion.
                                const __isTxFeature = (f) => {
                                    f = ('' + (f || '')).toLowerCase();
                                    return f === 'transcript' || f === 'mrna' || f === 'processed_transcript'
                                        || f === 'primary_transcript' || f === 'pseudogenic_transcript'
                                        || f.endsWith('rna');
                                };
                                let jsm = localJs[0];
                                {
                                    let bestSpan = -1;
                                    for (let jl of localJs) {
                                        if (!__isTxFeature(jl.feature)) continue;
                                        const s = parseInt(jl.start), e = parseInt(jl.end);
                                        const span = (isNaN(s) || isNaN(e)) ? -1 : (e - s);
                                        if (span > bestSpan) { bestSpan = span; jsm = jl; }
                                    }
                                }

                                let desc =
                                    ((jsm.attributes && jsm.attributes.gene_name) || '') +
                                    ';' +
                                    ((jsm.attributes && jsm.attributes.transcript_name) || '');

                                let geneID = jsm.attributes?.ID || ensembleId;
                                // Track coordinates span the FULL extent across every feature (exons,
                                // UTRs, CDS, the transcript feature). This is robust even if a
                                // transcript-level feature is absent, mislabeled, or clipped, and it
                                // matches the length of the sequence the server returns for the track.
                                let start = parseInt(jsm['start']);
                                let end = parseInt(jsm['end']);
                                for (let jl of localJs) {
                                    // Skip gene/region-level features that could over-extend the span
                                    // beyond this transcript (a /transcript payload is normally scoped
                                    // to the one transcript, but be defensive).
                                    const f = ('' + (jl.feature || '')).toLowerCase();
                                    if (f === 'gene' || f === 'region' || f === 'chromosome'
                                        || f === 'biological_region' || f === 'supercontig') continue;
                                    const s = parseInt(jl['start']), e = parseInt(jl['end']);
                                    if (!isNaN(s)) start = isNaN(start) ? s : Math.min(start, s);
                                    if (!isNaN(e)) end = isNaN(end) ? e : Math.max(end, e);
                                }

                                let strand = jsm['strand'];
                                let chr = jsm['seqname'];

                                if (strand === '+' || parseInt(strand) > 0) {
                                    strand = 1;
                                } else {
                                    strand = -1;
                                }

                                let t = this.createTrack(ensembleId, start, end, strand);
                                if (!t) return null;   // bad/NaN coordinates -> skip, don't poison layout
                                t.transcriptID = ensembleId;
                                // Canonical gene symbol as the track name when available; else the id.
                                try {
                                    const _sym = ('' + ((jsm.attributes && (jsm.attributes.gene_name || jsm.attributes.Name))
                                        || (desc ? ('' + desc).split(';')[0] : '') || '')).trim();
                                    if (_sym) t.name = _sym;
                                } catch (e) { }
                                // Species from the Ensembl transcript-id prefix (ENST=human,
                                // ENSMUST=mouse, ENSRNOT=rat, ENSCAFT=dog, ...), falling back
                                // to the server-reported species. Was hardcoded to 'Human'.
                                (function () {
                                    // speciesFromTranscriptId (lib/core.js) covers every Ensembl
                                    // prefix, not just the four spelled out here -- cyno and
                                    // rhesus were falling through to the 'Human' default.
                                    let _sp = speciesFromTranscriptId(ensembleId);
                                    if (!_sp && localResp && localResp.species) {
                                        const s = String(localResp.species);
                                        _sp = s.charAt(0).toUpperCase() + s.slice(1);
                                    }
                                    // No default: labelling an unknown organism Human is the bug.
                                    t.species = _sp || '';
                                })();
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

                                // Sequence: prefer what the local payload already returned;
                                // otherwise ask the dedicated local endpoint, then fall back
                                // to Ensembl REST. Every remote hop here is failsafe.
                                if (!localSequence) {
                                    try {
                                        const localTranscriptUrl =
                                            `${host_}/api/ensembl/transcript/${encodeURIComponent(ensembleId)}` +
                                            `?prefix=${encodeURIComponent(prefix)}`;

                                        const resp = await fetch(localTranscriptUrl);
                                        if (resp.ok) {
                                            const p = await resp.json();
                                            if (p && p.sequence) localSequence = p.sequence;
                                            if (p && Array.isArray(p.annotations) && p.annotations.length > 0) {
                                                localJs = p.annotations;
                                            }
                                        }
                                    } catch (e) {
                                        console.warn('Local sequence/annotation endpoint failed for transcript:', e);
                                    }
                                }

                                if (localSequence) {
                                    // local server already handled strand if needed
                                    t.setSequence(String(localSequence).trim());
                                } else {
                                    try {
                                        let ensembl_sequence = `${(window['env']?.['apiUrl'] || window.location.origin)}/api/ensembl/sequence/${ensembleId}?prefix=${encodeURIComponent(prefix)}`;
                                        this.setMessage(" Loading sequence " + prefix)
                                        let fasta = await GETXT(ensembl_sequence);
                                        setTrackSequenceFromRawFasta(t, fasta);
                                    } catch (seqEx) {
                                        console.warn('Ensembl sequence fetch failed (continuing without sequence):', seqEx);
                                    }
                                }

                                let annotations = this.createTrackFromLocal(localJs);
                                for (let an of annotations) {
                                    t.add(an);
                                }

                                t.generateORF();
                                // Guard: a track with no sequence or NaN genomic dimensions is
                                // useless (e.g. the sequence fetch 502'd) — remove it from the
                                // graph rather than leaving an empty/broken track behind.
                                if (!t.sequence || String(t.sequence).length === 0 ||
                                    !Number.isFinite(+t.xi) || !Number.isFinite(+t.xf)) {
                                    try { if (this.removeTrack) this.removeTrack(t); } catch (e) { }
                                    try { graph.setMessage(' Skipped ' + ensembleId + ' — no sequence / invalid coordinates. '); } catch (e) { }
                                    return null;
                                }
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
                                    `${(window['env']?.['apiUrl'] || window.location.origin)}/api/ensembl/lookup/${ensembleId}?prefix=${encodeURIComponent(prefix)}`
                                );
                            } catch (restException) {
                                // Direct rest.ensembl.org calls are CORS-blocked from the
                                // browser. Don't let that abort the whole track load.
                                console.warn('Ensembl REST lookup failed for transcript (continuing without remote enrichment):', restException);
                                js = null;
                            }
                        }
                    } else {
                        // ------------------------------------------------------------
                        // 3. Non-ENST: use Ensembl REST lookup
                        // ------------------------------------------------------------
                        try {
                            js = await GETJSON(
                                `${(window['env']?.['apiUrl'] || window.location.origin)}/api/ensembl/lookup/${ensembleId}?prefix=${encodeURIComponent(prefix)}`
                            );
                        } catch (restException) {
                            console.warn('Ensembl REST lookup failed (continuing):', restException);
                            js = null;
                        }
                    }
                } catch (exception) {
                    console.warn('Primary lookup failed, retrying Ensembl REST:', exception);
                    try {
                        js = await GETJSON(
                            `${(window['env']?.['apiUrl'] || window.location.origin)}/api/ensembl/lookup/${ensembleId}?prefix=${encodeURIComponent(prefix)}`
                        );
                    } catch (retryException) {
                        console.warn('Ensembl REST retry failed (continuing):', retryException);
                        js = null;
                    }
                }

                if (!js) {
                    console.log(" ensembl " + `${(window['env']?.['apiUrl'] || window.location.origin)}/api/ensembl/lookup/${ensembleId}?prefix=${encodeURIComponent(prefix)}`);
                    try {
                        js = await GETJSON(
                            `${(window['env']?.['apiUrl'] || window.location.origin)}/api/ensembl/lookup/${ensembleId}?prefix=${encodeURIComponent(prefix)}`
                        );
                    } catch (finalException) {
                        console.warn('Ensembl REST lookup unavailable (CORS/network); loading track without remote annotations:', finalException);
                        js = null;
                    }
                }

                if (!js) {
                    if (this.setMessage) {
                        this.setMessage('Could not reach Ensembl for ' + ensembleId + ' — loaded without remote annotations.');
                    }
                    return null;
                }

                // The server answers 200 with { notFound:true } for a retired/invalid Ensembl id
                // (rather than a 502) — surface that clearly instead of building a broken track
                // from the empty body.
                if (js.notFound) {
                    // Before surfacing a load error for a retired/invalid id, ask the AI resolver for
                    // the current, closest-matching transcript (MANE Select / Ensembl canonical) and
                    // retry the load once (__noAiResolve guards against loops). The retry loads
                    // local-DB-first, so it only succeeds on a transcript we can actually serve.
                    if (!__noAiResolve) {
                        try {
                            const sp = /^ENSMUST/i.test(ensembleId) ? 'mouse' : (/^ENSRNOT/i.test(ensembleId) ? 'rat' : 'human');
                            if (this.setMessage) this.setMessage('Transcript "' + ensembleId + '" not found — finding the current version with AI…');
                            const em = (typeof EngineMonitor === 'function') ? new EngineMonitor((m) => { try { if (this.setMessage) this.setMessage('' + m); } catch (e) { } }) : null;
                            const promptTxt = 'The Ensembl transcript stable ID "' + ensembleId + '" is retired or invalid. '
                                + 'Return the current, closest-matching Ensembl transcript stable ID for the SAME transcript/gene '
                                + '(prefer the MANE Select or Ensembl canonical transcript of that gene). Species: ' + sp + '.';
                            const res = em ? await exec('/py/sequence/prompt-to-transcript.py', em, promptTxt, sp)
                                : await exec('/py/sequence/prompt-to-transcript.py', promptTxt, sp);
                            let list; try { list = JSON.parse(res && res.transcripts); } catch (e) { list = (res && Array.isArray(res.transcripts)) ? res.transcripts : []; }
                            let cand = (Array.isArray(list) && list.length && list[0]) ? ('' + (list[0].id || list[0].transcript || list[0])) : '';
                            cand = cand.replace(/\..*$/, '').trim();   // strip any version suffix
                            if (cand && cand.toUpperCase() !== ('' + ensembleId).toUpperCase() && /^ENS[A-Z]*T\d+$/i.test(cand)) {
                                if (this.setMessage) this.setMessage('Loading closest current transcript ' + cand + ' (for retired ' + ensembleId + ')…');
                                const __t = await this.add(cand, x, y, source, true);
                                if (__t) return __t;
                            }
                        } catch (e) { console.warn('AI transcript resolve failed for', ensembleId, e); }
                    }
                    const __msg = 'Transcript "' + ensembleId + '" was not found on Ensembl — it may be a retired or invalid ID.';
                    if (this.setMessage) this.setMessage(__msg);
                    try { if (typeof infoPrompt === 'function') infoPrompt(__msg); } catch (e) { }
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
                if (!t) return null;   // bad/NaN coordinates -> skip, don't poison layout

                t.transcriptID = ensembleId;
                t.species = species;
                t.chr = chromosome;
                t.description = desc;
                t.geneID = geneID;
                // Prefer a canonical gene symbol as the track name; fall back to the id.
                try {
                    const _sym = ('' + (js['gene_symbol'] || js['display_name'] || '')).replace(/-\d+$/, '').trim();
                    if (_sym) t.name = _sym;
                } catch (e) { }

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
                    try {
                        let ensembl_sequence = `${(window['env']?.['apiUrl'] || window.location.origin)}/api/ensembl/sequence/${ensembleId}?prefix=${encodeURIComponent(prefix)}`;
                        let fasta = await GETXT(ensembl_sequence);
                        setTrackSequenceFromRawFasta(t, fasta);
                        this.buildENSEMBLAnnotations(t, js);
                    } catch (e) {
                        console.warn('Ensembl sequence fetch failed for ' + ensembleId + ':', e);
                    }
                }

                // Guard: a track with no sequence or NaN genomic dimensions (e.g. the
                // sequence fetch 502'd) is broken — remove it rather than leave it behind.
                if (!t.sequence || String(t.sequence).length === 0 ||
                    !Number.isFinite(+t.xi) || !Number.isFinite(+t.xf)) {
                    try { if (this.removeTrack) this.removeTrack(t); } catch (e) { }
                    try { graph.setMessage(' Skipped ' + ensembleId + ' — no sequence / invalid coordinates. '); } catch (e) { }
                    return null;
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
                        if (!t) return null;   // bad/NaN coordinates -> skip
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
                            let ensembl_sequence = (window['env']?.['apiUrl'] || window.location.origin) + `/api/ensembl/sequence/${js.id}?prefix=${encodeURIComponent(prefix)}`;
                            let fasta = GETXT(ensembl_sequence)
                            if (fasta && fasta.length > 0) {
                                fasta = fasta.trim();
                                if (foo.strand < 0) {
                                    let temp = '';
                                    for (let c = fasta.length - 1; c >= 0; c--) {   // >= 0: c > 0 dropped fasta[0], leaving the minus-strand sequence one base short
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
                                // The constructor doesn't take these, so restore the clinical/
                                // annotation metadata explicitly (otherwise save+load nulls them).
                                if (sid.clinsig != null) s.clinsig = sid.clinsig;
                                if (sid.clindn != null) s.clindn = sid.clindn;
                                if (sid.quality != null) s.quality = sid.quality;
                                if (sid.name != null) s.name = sid.name;
                                if (sid.source != null) s.source = sid.source;
                                if (sid.af != null) s.af = sid.af;
                                if (sid.structure) s.structure = sid.structure;
                                if (sid._color != null) s.color = sid._color;
                                else if (sid.color != null) s.color = sid.color;
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

                    this.track.push(this.ensureUniqueTrackName(foo));

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
                if (!t) return null;   // empty/invalid sequence -> skip
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
            // A track is only valid if its coordinates are finite numbers and its
            // dimensions are positive/non-zero and finite. Tracks created with NaN
            // coordinates, or with <= 0 / NaN width (or zero/NaN height), are
            // rejected on add and pruned automatically so they never enter or
            // linger in the graph.
            isValidTrack(t) {
                const num = (v) => typeof v === 'number' && isFinite(v);
                if (!t) return false;
                if (!num(t.xi) || !num(t.xf)) return false;
                const width = t.xf - t.xi;
                if (!num(width) || width <= 0) return false;
                const g = t.tgraph;
                if (!g) return false;
                if (!num(g.xi) || !num(g.width) || g.width <= 0) return false;
                if (!num(g.height) || Math.abs(g.height) <= 0) return false;
                return true;
            }

            // Prune any invalid tracks already in the graph (e.g. added via a
            // direct push). Returns the number removed.
            removeInvalidTracks() {
                if (!this.track || !this.track.length) return 0;
                let removed = 0;
                for (let i = this.track.length - 1; i >= 0; i--) {
                    if (!this.isValidTrack(this.track[i])) {
                        console.warn('[track] removing invalid track (NaN/zero coordinates or dimensions):',
                            this.track[i] && this.track[i].name);
                        this.track.splice(i, 1);
                        removed++;
                    }
                }
                if (removed && this.notifyTrackListener) this.notifyTrackListener();
                return removed;
            }

            rescale() {
                this.removeInvalidTracks();
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
                let name = '.current.baja'
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
                if (!name.endsWith('.baja')) {
                    name = name + '.baja'
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
                let rf = await GETJSON(host_ + '/get-folder?key=user&path=' + getUser() + '&filetype=.baja')
                let ch = rf.children;
                if (ch && ch.length > 0)
                    for (let i of ch) {
                        if (i && i.path.endsWith('/.current.baja')) {
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
                    // First move of a pinch: switch to navigate + record the baseline finger
                    // positions. (Only once — not every move.)
                    if (!this.prev) {
                        this.clearMouseListeners();
                        this.setMouseMode('navigate');
                        this.prev = evt;
                        return;
                    }
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
                    this.graph.setymax(this.graph.getymax() + distanceY);   // was getymax() — y-zoom never applied
                    this.graph.setxmin(this.graph.getxmin() - xfactor)
                    this.graph.setxmax(this.graph.getxmax() + xfactor)
                    this.prev = evt;
                    if (this.graph.rescale) this.graph.rescale();
                    if (this.wake) this.wake();
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

                // Tracks sit at fixed data-space y positions, so the on-screen
                // distance between them is pitch * yscale, and yscale falls as the
                // y range grows. Zooming out therefore squeezes stacked tracks
                // together until they read as one smear.
                this.MIN_TRACK_GAP_PX = 5;

                // Smallest spacing between stacked tracks, in data units (centre to
                // centre, which stays meaningful when track heights differ or
                // overlap). Infinity when there is nothing to keep apart.
                this.minTrackPitchWorld = () => {
                    const ys = [];
                    for (const t of (this.track || [])) {
                        const g = t && t.tgraph;
                        if (g && typeof g.yi === 'number' && isFinite(g.yi)) ys.push(g.yi);
                    }
                    if (ys.length < 2) return Infinity;
                    ys.sort((a, b) => a - b);
                    let pitch = Infinity;
                    for (let i = 1; i < ys.length; i++) {
                        const d = ys[i] - ys[i - 1];
                        if (d > 1e-9 && d < pitch) pitch = d;
                    }
                    return pitch;
                };

                // Cap how far y may zoom out: hold the y scale high enough that
                // adjacent tracks stay MIN_TRACK_GAP_PX apart. If the view is
                // already below that, this returns a NARROWER range than asked for,
                // i.e. it increases the y scale and pulls the tracks back apart.
                // x is never touched.
                this.clampYRangeForTracks = (ymin, ymax) => {
                    const pitch = this.minTrackPitchWorld();
                    if (!isFinite(pitch) || pitch <= 0) return [ymin, ymax];
                    const g = this.graph;
                    const usable = (g.height || 0) - 2 * (g.yinset || 0);
                    const range = ymax - ymin;
                    if (!isFinite(usable) || usable <= 0 || !(range > 0)) return [ymin, ymax];
                    // want: pitch * (usable / range) >= MIN_TRACK_GAP_PX
                    const maxRange = (pitch * usable) / this.MIN_TRACK_GAP_PX;
                    if (!isFinite(maxRange) || maxRange <= 0 || range <= maxRange) {
                        return [ymin, ymax];
                    }
                    const c = (ymin + ymax) / 2, h = maxRange / 2;
                    return [c - h, c + h];
                };

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
                    let ymin1 = cy - halfH1, ymax1 = cy + halfH1;

                    // Zoom out only: keep stacked tracks legible in y.
                    if (fy >= 1) {
                        [ymin1, ymax1] = this.clampYRangeForTracks(ymin1, ymax1);
                    }

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
                    // Screen-space coords for on-canvas UI hit-testing. Prefer the RAW screen
                    // coords captured at dispatch (exact in pixel space at any zoom); fall back to
                    // the world round-trip only if they're unavailable. The world round-trip loses
                    // precision at extreme zoom, which made the fixed nav buttons hard to click.
                    const __ds = this.graph.__downScreen;
                    let xs = (__ds && Number.isFinite(__ds.x)) ? __ds.x : this.graph.X(xwc);
                    let ys = (__ds && Number.isFinite(__ds.y)) ? __ds.y : this.graph.Y(ywc);
                    this.graph.mousex = xwc
                    if (!isMobile()) {
                        if (this.side_menu && this.side_menu.isIn(this.graph, xwc, ywc)) {
                            // A side-menu item was clicked on this press. Mark it so the
                            // follow-up mouse-up doesn't ALSO open a context menu — the
                            // item's action (e.g. "More information") may close the menu
                            // async, leaving side_menu null by the time the up fires.
                            this.__downMenuHandled = true;
                            await this.side_menu.mouseUp(this.graph, xwc, ywc)
                            return;
                        }
                        else {
                            this.side_menu = null;
                        }

                        {
                            const hitBtn = this.hitControlButton(xs, ys);
                            if (hitBtn) { await this.handleControlButton(hitBtn); return; }
                        }

                        // BOX ZOOM OWNS THE CANVAS.
                        //
                        // Everything below this point intercepts the press before the registered
                        // listeners see it: the selection card, the info card, bookmarks, the
                        // selection arrows, a click inside an existing selection. Box zoom clears
                        // the LISTENERS when it arms, but it could not clear these, so dragging a
                        // box that started over a selection opened that selection's menu instead
                        // of zooming.
                        //
                        // In 'bpx' the user has explicitly asked to draw a rectangle, so the drag
                        // wins wherever it starts. The control buttons above stay live -- that is
                        // how the mode is turned off again.
                        if (this.graph && this.graph.mode === 'bpx') {
                            // Same dispatch the normal path uses further down -- world
                            // coordinates, and mouseDown set so the move/up handlers that track
                            // the drag see a press in progress.
                            this.mouseDown = true;
                            for (let mdl of (this.mouseDownListeners || [])) {
                                try { mdl(xwc, ywc); } catch (e) { }
                            }
                            return;
                        }

                        // The selection card IS the menu: a click on a ROW opens that object's
                        // own tree with the object as its root. A click on the header or the
                        // "+N more" row opens the whole-selection menu instead.
                        if (this.hitSelectionPanel(xs, ys)) {
                            this.__downMenuHandled = true;   // don't let the up open a context menu
                            this.__keepSideMenu = true;      // don't let the up dismiss the menu
                            // Purely per-row: a row opens ITS object's tree, the overflow row
                            // opens the full list, and the card's padding opens nothing. The
                            // click is still consumed so it does not fall through to the canvas
                            // and start a lasso on top of the selection it is showing.
                            const row = this.hitSelectionRow(xs, ys);
                            if (row && row.item.src) this.openSelectionMenu(row.item.src, row.y);
                            // "+N more…" opens the maximised, scrollable list of everything
                            // selected -- the card has room for a dozen rows, and that is where
                            // the rest of them live.
                            else if (row && row.item.more) this.openSelectionBrowser();
                            return;
                        }

                        // Click on the top stats card -> tracks / oligos / chemistry menu.
                        if (this.hitInfoPanel(xs, ys)) {
                            this.__downMenuHandled = true;
                            this.__keepSideMenu = true;
                            this.openInfoPanelMenu();
                            return;
                        }

                        if (this.bookmark_menu && this.showBookmarks) {
                            this.bookmarkMouseDownListener(xwc, ywc);
                            return;
                        }
                        if (this.chapter_menu && this.showChapters) {
                            this.chapterMouseDownListener(xwc, ywc);
                            this.showChapters = false;
                            // The click that dismissed it leaves the canvas with no listeners,
                            // so panning and hovering were dead until another menu was opened.
                            this.__rearmHoverSoon();
                            return;
                        }
                        if (this.select_) {
                            this.startX = xwc;
                        }
                        // Deselect button: the X between the two arrow heads drops THIS track's
                        // selection. Tested before the head drag and before the selection menu,
                        // because it sits inside the selection and would otherwise be swallowed
                        // by the "click inside a selection opens its menu" branch below.
                        try {
                            const __clr = this.__hitSelectionClear(this.graph.X(xwc), this.graph.Y(ywc));
                            if (__clr) {
                                this.__downMenuHandled = true;
                                __clr.markstart = null;
                                __clr.markend = null;
                                __clr.showResizeBar = false;
                                // The drag that made the range leaves state behind; without this
                                // the coming mouse-up can re-apply the range just cleared -- the
                                // same reason clearSequenceSelections() resets these.
                                try { this.select_ = false; this.startX = null; this.endX = null; this.__dragMark = null; } catch (e) { }
                                try { if (this.wake) this.wake(); } catch (e) { }
                                return;
                            }
                        } catch (e) { }
                        // Arrow-head drag: a press on a selection arrow head starts resizing THAT edge
                        // of the selection window (updated in mouseMove, cleared in mouseUp). Consume
                        // the press so it doesn't also start a new lasso/selection.
                        try {
                            const __hit = this.__hitSelectionArrow(this.graph.X(xwc), this.graph.Y(ywc));
                            if (__hit) {
                                this.__dragMark = __hit;
                                this.__downMenuHandled = true;
                                // Freeze panning for the duration of the drag (see graph.js).
                                try { if (this.graph) this.graph.__suppressPan = true; } catch (e) { }
                                return;
                            }
                        } catch (e) { }
                        // Click INSIDE an existing selection (but not on a head — the drag above
                        // already claimed those) opens the Selected Sequence side menu: the same
                        // shape as the track menu, scoped to markstart..markend.
                        try {
                            const __selT = this.__trackAtSelection(xwc, ywc);
                            if (__selT) {
                                this.__downMenuHandled = true;
                                exec('baja/manchester/menu/selected-sequence-menu.js', this, __selT, this.genegraph_panel_layout);
                                return;
                            }
                        } catch (e) { }
                        // A center (context) menu is open: the press does NOTHING — the item's
                        // action runs on mouse-UP only. Consume the down so it can't start a
                        // canvas drag/selection behind the menu.
                        if (this.menuVisible()) { return; }
                    }
                    if (!this.menu) {
                        this.mouseDown = true;
                        for (let mdl of this.mouseDownListeners) {
                            mdl(xwc, ywc);
                        }
                        // No canvas interaction is installed (a tool finished and cleared its
                        // listeners) — a click on the bare canvas re-arms the default mouse-over
                        // hover highlight so the user isn't left with a dead canvas.
                        if (this.mouseDownListeners.length === 0 && this.mouseMoveListeners.length === 0
                            && this.mouseUpListeners.length === 0 && !this.side_menu && !this.menuVisible()
                            && !this.__hoverRearming) {
                            this.__hoverRearming = true;
                            setTimeout(() => { this.__hoverRearming = false; }, 60);
                            try {
                                if (typeof this.__hoverRearm === 'function') {
                                    this.__hoverRearm();
                                } else {
                                    const gpl = this.genegraph_panel_layout
                                        || (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed ? CurrentLayout.getStashed('genegraph_panel_layout') : null);
                                    exec('baja/manchester/menu/mouse-over-highlight.js', this, gpl);
                                }
                            } catch (e) { }
                        }
                    }
                }
                this.mouseUpListener = async (xwc, ywc) => {
                    if (!isMobile()) {
                        this.prev = null;
                        // Finish an arrow-head drag: commit the resized selection.
                        // Release the pan freeze on ANY mouse-up, not just one that ends a drag.
                        // If a mouseup were ever missed while __dragMark was set (pointer leaving
                        // the window mid-drag), a conditional release would leave panning dead for
                        // the rest of the session.
                        try { if (this.graph) this.graph.__suppressPan = false; } catch (e) { }
                        if (this.__dragMark) {
                            this.__dragMark = null;
                            this.__downMenuHandled = false;
                            try { if (this.wake) this.wake(); } catch (e) { }
                            return;
                        }
                        if (this.bookmark_menu && this.showBookmarks) {
                            this.bookmarkMouseUpListener(xwc, ywc);
                        }
                        if (this.chapter_menu && this.showChapters) {
                            this.chapterMouseUpListener(xwc, ywc);
                        }
                        if (this.select_) {
                            this.endX = xwc;
                        }
                        // These early-returns must NOT fire while a center (context) menu is open:
                        // it must ALWAYS be closed and resolved on THIS mouse-up (below).
                        if (!this.menuVisible()) {
                            if (this.side_menu && this.side_menu.isIn(this.graph, xwc, ywc)) {
                                return;
                            }
                            // A menu was just opened on THIS press (e.g. the selection
                            // actions menu, shown async) — don't let this up dismiss it.
                            if (this.__keepSideMenu) { this.__keepSideMenu = false; return; }
                        }
                        this.side_menu = null;

                        if (this.menuVisible()) {
                            // Close the center menu IMMEDIATELY — before running the item's action —
                            // so it ALWAYS disappears on the release, even when the action opens a panel
                            // that loads before the up is processed or leaves the canvas unrepainted.
                            // The item's action fires ONLY here (Menu has no mouseDown), and the captured
                            // menu still resolves the click after this.menu has been cleared.
                            const __m = this.menu;
                            this.menu = null;
                            this.__keepSideMenu = false;
                            try { this.graph.menu = null; } catch (e) { }
                            try { if (this.wake) this.wake(); } catch (e) { }
                            try { await __m.mouseUp(this.graph, xwc, ywc); } catch (e) { }
                            try { if (this.wake) this.wake(); } catch (e) { }
                            // If the menu was dismissed/canceled WITHOUT the item installing its
                            // own canvas interaction, fall back to the hover highlight.
                            this.__rearmHoverSoon();
                            return;
                        } else {
                            if (this.mode === 'menu') {
                                if (!this.menu) {
                                    this.setMouseMode("navigate")
                                }
                            }
                        }

                        this.mouseDown = false;

                        // The press landed on a side-menu item / panel — its action may
                        // have already closed the menu. Don't let this up reach the canvas
                        // mouse-up listeners (which would deselect). Runs AFTER the center
                        // menu handling above, so center-menu item clicks still fire.
                        if (this.__downMenuHandled) { this.__downMenuHandled = false; return; }

                        if (!this.menu) {
                            for (let mul of this.mouseUpListeners) {
                                mul(xwc, ywc);
                            }
                        }

                    }
                }
                this.mouseMoveListener = (xwc, ywc) => {

                    // Arrow-head drag in progress: move the grabbed edge (start/end) of the selection,
                    // clamped INSIDE the track, keeping start < end. Nothing else runs this move.
                    if (this.__dragMark) {
                        try {
                            const dm = this.__dragMark, t = dm.track;
                            // Use whichever mapping the track has. track.js tracks expose tgraph
                            // and NO grid, so the old `if (t && t.grid)` skipped them entirely and
                            // the edge never moved — the same blind spot the hit-test had.
                            const g = t && (t.tgraph || t.grid);
                            if (t && g && typeof g.Xwc === 'function') {
                                // Graph-world -> track-world.
                                let v = Math.round(g.Xwc(xwc));
                                // Clamp inside the track itself. xi/xf are the real bounds; fall
                                // back to the grid extents when a track does not carry them.
                                let lo = Number.isFinite(+t.xi) ? Math.floor(+t.xi)
                                    : (g.getxmin ? Math.floor(g.getxmin()) : 0);
                                let hi = Number.isFinite(+t.xf) ? Math.floor(+t.xf)
                                    : (g.getxmax ? Math.floor(g.getxmax()) : v);
                                if (hi < lo) { const tmp = lo; lo = hi; hi = tmp; }
                                v = Math.max(lo, Math.min(hi, v));

                                // markstart/markend may be stored as 0-based OFFSETS from the
                                // track start rather than world coords (see __toWorld in
                                // track.js). Write back in whatever representation is already in
                                // use, or the value would jump by xi on the first drag.
                                const asOffset = (t.markstart != null && Number.isFinite(+t.xi) && t.markstart < t.xi);
                                const toStore = (world) => asOffset ? (world - Math.floor(+t.xi)) : world;
                                const curStart = asOffset ? (Math.floor(t.markstart) + Math.floor(+t.xi)) : Math.floor(t.markstart);
                                const curEnd = asOffset ? (Math.floor(t.markend) + Math.floor(+t.xi)) : Math.floor(t.markend);

                                if (dm.edge === 'start') t.markstart = toStore(Math.min(v, curEnd - 1));
                                else t.markend = toStore(Math.max(v, curStart + 1));

                                const sNow = asOffset ? (Math.floor(t.markstart) + Math.floor(+t.xi)) : Math.floor(t.markstart);
                                const eNow = asOffset ? (Math.floor(t.markend) + Math.floor(+t.xi)) : Math.floor(t.markend);
                                try { this.setMessage(' Selection ' + sNow + '–' + eNow + ' (' + (eNow - sNow) + ' nt) '); } catch (e) { }
                                if (this.wake) this.wake();
                            }
                        } catch (e) { }
                        return;
                    }

                    this.graph.mousex = xwc
                    // Raw screen coords for the button hover hit-test — pixel-exact at any zoom
                    // (the world round-trip loses precision when zoomed all the way in).
                    const __ms = this.graph.__moveScreen;
                    let xs = (__ms && Number.isFinite(__ms.x)) ? __ms.x : this.graph.X(xwc);
                    let ys = (__ms && Number.isFinite(__ms.y)) ? __ms.y : this.graph.Y(ywc);

                    // Track which on-canvas navigation control (if any) is hovered so
                    // the draw loop can highlight it and show its tooltip.
                    this.hoverButton = this.hitControlButton(xs, ys);
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
                        // A side menu is open: only the menu itself responds to hover.
                        // Suppress canvas mouse-over-highlight (and every other registered
                        // hover listener / shape context-menu) until the menu closes, so
                        // the mouse-over highlight works only within the menu.
                        this.side_menu.mouseMove(this.graph, xwc, ywc);
                        return;
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

                    // Same guard as the zoom-out button: widening y squeezes stacked
                    // tracks together. Shift+wheel is an explicit y-only zoom, so
                    // leave that alone - the user is driving y deliberately there.
                    if (factor > 1 && !isShiftPressed) {
                        const [cy0, cy1] = this.clampYRangeForTracks(newYMin, newYMax);
                        newYMin = cy0; newYMax = cy1;
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
                    this.prev = null;   // reset the pinch baseline so the next pinch starts fresh
                }
                this.touchMove = (ct) => {
                    // No-op: a single-finger drag pans via the idle hover mode's own pan
                    // listeners (mouse-over-highlight.js), which fire from the same touch→mouse
                    // forwarding. Forcing navigate here would clear those listeners mid-drag,
                    // and would wrongly override an active selection/lasso tool.
                }
                this.dblclick = (scx, scy) => {
                }

                let controlPanelListener = () => {

                }

                let FlexiGraph = await exec('flexigraph/graph.js', this.graphListener, this.mouseDownListener, this.mouseUpListener,
                    this.mouseMoveListener, controlPanelRefCallback, controlPanelListener, this.pinchListener, this.touchStart, this.touchEnd, this.touchMove, this.dblclick, this.wheel);

                this.graph = new FlexiGraph();
                await this.graph.init();
                // Back-reference so the SNP renderers (snpindel.js draw / track.js
                // drawSnpLollipopsWide) — which receive the GRID as `graph` — can reach the gene's
                // selection/focus state (__snpSelectionActive, __focusSnp, __lassoSelection).
                this.graph.__gene = this;
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
                    this.__helpStart = Date.now();   // restart the staggered reveal
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

                    // Tag tracks with a back-ref so Track.addOligo (and similar) can
                    // wake the redraw loop when they mutate the graph while idle.
                    if (this.track) for (let t of this.track) { if (t) t.__gg = this; }

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

                    // One-time: track user interaction on the canvas so the redraw
                    // loop can go idle when nothing is happening and resume instantly
                    // on the next mouse move / key / touch / wheel.
                    if (!this.__idleListenersSet && this.graph.canvas) {
                        if (this.idleTimeoutMs == null) this.idleTimeoutMs = 15000;
                        this.__lastInteraction = performance.now();
                        const wake = () => this.wake();
                        const el = this.graph.canvas.canvas.nativeElement;
                        el.addEventListener('mousemove', wake, { passive: true });
                        el.addEventListener('mousedown', wake, { passive: true });
                        el.addEventListener('wheel', wake, { passive: true });
                        el.addEventListener('touchstart', wake, { passive: true });
                        el.addEventListener('touchmove', wake, { passive: true });
                        window.addEventListener('keydown', wake);
                        this.__idleListenersSet = true;
                    }

                    if (document.hidden) {
                        this.pauseDraw = true;
                    } else {
                        this.pauseDraw = false;
                    }

                    // Idle pause: after idleTimeoutMs of no interaction, paint one
                    // final frame and then stop redrawing. wake() (fired by any
                    // interaction, or callable programmatically) resumes the loop.
                    // Keep the redraw loop awake while a backend search is running so
                    // the "working" spinner keeps animating even when the user is idle.
                    if (typeof window !== 'undefined' && window.__backendWorkCount > 0) this.wake();

                    // 1 Hz pulse for the selected-oligo glow. This loop ticks every
                    // 100ms (10fps), so a full cycle is 10 frames. graph.__pulse is a
                    // 0..1 sine the oligo draw reads.
                    this.__frame = (this.__frame || 0) + 1;
                    const __framesPerCycle = Math.max(1, Math.round(1000 / 100));   // 100ms tick
                    this.graph.__pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * (this.__frame % __framesPerCycle) / __framesPerCycle);
                    // Re-apply selection highlights so items in the selection window stay
                    // visibly selected on the canvas (hover/deselect can clear them).
                    try { this.reassertSelectionHighlights(); } catch (e) { }
                    // Keep the loop awake while any oligo is selected so the glow pulses
                    // even when the user is idle.
                    try {
                        let __selOligo = false;
                        if (this.track) {
                            for (const t of this.track) {
                                if (t && t.oligos) { for (const o of t.oligos) { if (o && (o.selected || o.highlight__)) { __selOligo = true; break; } } }
                                if (__selOligo) break;
                            }
                        }
                        if (__selOligo) this.wake();
                    } catch (e) { }

                    const idleFor = performance.now() - (this.__lastInteraction || 0);
                    const isIdle = idleFor > (this.idleTimeoutMs || 15000);

                    if (!this.pauseDraw && (!isIdle || !this.__idleRendered)) {
                        // Diff parent->child syncable objects every draw and push what differs.
                        try { this.syncChildTracks(); } catch (e) { }
                        await this.redraw();
                        if (isIdle) this.__idleRendered = true;
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
                    }

                }, 100);

            }

            // Resets the idle timer and resumes the redraw loop. Fired by canvas
            // interaction; also callable programmatically after a background change
            // (e.g. a model finishing) so the new state gets painted while idle.
            wake() {
                this.__lastInteraction = performance.now();
                this.__idleRendered = false;
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

            // Near-real-time mirror: for every child track (one holding a trackRef to a
            // parent), replicate the parent's in-range items onto the child, remapped to
            // the child's coordinates. Runs each redraw tick but each child re-mirrors
            // only when its parent's item signature changes, so it's cheap while idle.
            syncChildTracks() {
                if (!this.track) return;
                for (let t of this.track) {
                    if (!t) continue;
                    const isChild = t.trackRef && t.trackRef.track;
                    if (isChild) {
                        if (typeof t.syncFromParent === 'function') {
                            try { t.syncFromParent(); } catch (e) { console.warn('[syncFromParent] threw for child', t && t.name, e); }
                        }
                    } else if (t.gxi == null || t.gxi === 0) {
                        // Root track (not derived from a parent): its local x IS genomic, so
                        // fit its genomic span to its own coordinates when unset.
                        t.gxi = t.xi;
                        t.gxf = t.xf;
                    }
                }
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
                            this.track.push(this.ensureUniqueTrackName(t[tok]))
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
                                                                    'baja/manchester/annotation/rule-application-wizard-min.js',
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
                                                                    'baja/manchester/annotation/rule-application-wizard-min.js',
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
                                                                    'baja/manchester/annotation/rule-application-wizard-min.js',
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
                                                                                            'baja/manchester/menu/target-tools.js',
                                                                                            graph,
                                                                                            library,
                                                                                            folder,
                                                                                            this.genegraph_panel_layout
                                                                                        );

                                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                                                                                        CurrentLayout.setComponent('buttonMenuPanel', hl);
                                                                                    } else {
                                                                                        await exec(
                                                                                            'baja/manchester/annotation/rule-application-wizard-min.js',
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
                                                                                    'baja/manchester/menu/target-tools.js',
                                                                                    graph,
                                                                                    library,
                                                                                    folder,
                                                                                    this.genegraph_panel_layout
                                                                                );

                                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                                                                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                                                                            } else {
                                                                                await exec(
                                                                                    'baja/manchester/annotation/rule-application-wizard-min.js',
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
                                                                                ),
                                                                                null,
                                                                                'Back ▸'
                                                                            );
                                                                        }
                                                                    }
                                                                ]
                                                                : [];

                                                            this.showSideMenu([...backItems, ...submenu], null, 'Feature types ▸');
                                                        };
                                                    } else if (typeof item.click === "function") {
                                                        out.click = async (...args) => {
                                                            return await item.click(...args);
                                                        };
                                                    }

                                                    return out;
                                                });
                                            };

                                            this.showSideMenu(normalizeSideMenuItems(rawMenu), null, 'Features ▸');
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

                                this.showSideMenu(typeMenu, null, 'Type actions ▸');
                            }
                        }));

                        this.showSideMenu(submenu, null, 'Feature types ▸');
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

                                this.showSideMenu(typeMenu, null, 'Type actions ▸');
                            }
                        }));

                        this.showSideMenu(submenu, null, 'Feature types ▸');
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

                        this.showSideMenu(submenu, null, 'Feature types ▸');
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

            // What a VIEWER may not do. An explicit deny-list rather than a broad match, so it
            // is auditable and so read-only look-alikes survive: "Copy to new track" modifies
            // the board and is denied, while "Copy sequence" / "Copy reverse complement" only
            // touch the clipboard and are kept.
            //
            // Adding data and running models IS allowed — Layers ▸ / Data ▸ / Models ▸ stay,
            // along with Go to, Sequence (its read-only entries), Properties, Protein, Compounds,
            // Variants, Synthesis cost and Export.
            __viewerDenied = [
                /design/i,          // no designing, anywhere
                /^delete\b/i,       // Delete track
                /^edit\b/i,         // Edit track / Edit sequence / Edit
                /^move\b/i,         // Move track
                /^create\b/i,       // Create mRNA
                /^copy to\b/i,      // Copy to new track (NOT "Copy sequence")
                /^mutate\b/i        // Mutate from sequence
            ]

            // VIEWER gate: a read-only screen must not offer design. Design entries are spread
            // across many menus (gene.js itself, mouse-over-highlight, selected-sequence-menu,
            // track-design-menu, …), and new ones get added over time, so filter centrally at
            // the three menu entry points rather than editing every list — a menu added later
            // is covered automatically. Applies only when graph.viewer is set.
            __viewerFilterMenu(list) {
                try {
                    if (!this.viewer || !Array.isArray(list)) return list;
                    const out = list.filter((it) => {
                        try {
                            const l = ('' + ((it && it.label) || '')).trim();
                            for (const re of this.__viewerDenied) { if (re.test(l)) return false; }
                            return true;
                        } catch (e) { return true; }
                    });
                    // Preserve the marker properties menus hang off the array itself.
                    try {
                        for (const k of ['__menuTitle', '__compactCols', '__noCollapse', '__fromSelection']) {
                            if (list[k] !== undefined) out[k] = list[k];
                        }
                    } catch (e) { }
                    return out;
                } catch (e) { return list; }
            }
            // Consistent order in every side menu: rows that OPEN A SUBMENU (their label carries
            // the ▸ marker) first, then leaf actions, with navigation (‹ Back / Cancel / Close /
            // Done) last. Header rows stay pinned above everything.
            //
            // Done here, in showSideMenu, rather than at the call sites: baja/manchester/menu/
            // mouse-over-highlight.js had this as a local orderMenu that every one of its own
            // calls had to remember to wrap, and menus opened from anywhere else -- gene.js, the
            // libraries, the design menus -- came out in construction order. One place means a
            // menu cannot be built that skips it.
            __orderMenu(list) {
                try {
                    if (!Array.isArray(list) || list.length < 2) return list;
                    const lab = (it) => ('' + (it && (it.label || it.name || ''))).trim();
                    const isHeader = (it) => !!(it && it.header);
                    const isNav = (it) => {
                        const l = lab(it);
                        return /^(‹|«|<|←|✓|↩)/.test(l)
                            || /(^|\s)(Back|Cancel|Close|Done)\b/i.test(l)
                            || /Back$/i.test(l)
                            || l === 'more...' || l === 'Refresh menu' || l === 'Close menu';
                    };
                    const isSub = (it) => /[▸►]/.test(lab(it));
                    // Design comes first, above the other submenus. It is what the app is FOR,
                    // and it was landing wherever the menu happened to build it -- under Layers
                    // on one menu, below Export on another.
                    const isDesign = (it) => /^design\b/i.test(lab(it));
                    const headers = [], designs = [], subs = [], leaves = [], navs = [];
                    for (const it of list) {
                        if (!it) { leaves.push(it); continue; }
                        if (isHeader(it)) headers.push(it);
                        else if (isNav(it)) navs.push(it);
                        else if (isDesign(it)) designs.push(it);
                        else if (isSub(it)) subs.push(it);
                        else leaves.push(it);
                    }
                    const out = headers.concat(designs, subs, leaves, navs);
                    // Carry the marks the caller may have set on the ARRAY itself -- the
                    // selection-chain flag is read off the list object, and a fresh array
                    // would drop it and let the selection card snap back to sharp.
                    try { for (const k of Object.keys(list)) { if (isNaN(+k)) out[k] = list[k]; } } catch (e) { }
                    return out;
                } catch (e) { return list; }
            }

            showSideMenu(list, anchor, label) {
                try { list = this.__viewerFilterMenu(list); } catch (e) { }
                try { list = this.__orderMenu(list); } catch (e) { }
                if (this.wake) this.wake();

                // LIBRARY MODE. Opened from the menubar's Selection button, every level of the
                // navigation is drawn as a library instead of a side menu -- including the
                // levels built by OTHER scripts, which is the reason this decision lives here
                // rather than in openSelectionMenu. A handoff to track-design-menu.js or a model
                // runner calls showSideMenu directly with its own list, so a check anywhere else
                // would have changed idiom one level in.
                //
                // Its lifetime is the SESSION -- from the menubar button until the user closes
                // the library -- and deliberately NOT the selection chain.
                //
                // The chain ends on showSideMenu(null), which is the idiom every script uses
                // before opening its own menu: `graph.showSideMenu(null); exec(...)`. Gating on
                // it meant that the moment navigation handed off to another script -- the track
                // layers menu, the mutations menu, the per-oligo menu -- the chain was cleared
                // by that script's own dismissal and the next level came back as a side menu.
                // The library jumped out one level in, which is exactly what it must not do.
                //
                // Now only leaving ends it: the shelf reports WHY it closed (see
                // baja/lib/shelf.js), and the session survives a close that happened to make
                // room for the thing the user just clicked.
                //
                // Opened from the selection window ON THE CANVAS the flag is false, and this
                // whole block is skipped: that route keeps its side menus.
                try {
                    if (list && this.__menuLibrary) {
                        this.__showSelectionShelf(list, label);
                        return;
                    }
                } catch (e) { }

                // Keep the "came from the selection box" mark across a menu CHAIN.
                //
                // openSelectionMenu marks the lists it builds itself, which is what the
                // selection card blurs behind. But a submenu that hands off to another script --
                // track-layers-side-menu.js, the model runners, the design menus -- calls
                // showSideMenu directly with a fresh list, so the mark was lost one level in and
                // the box snapped back to sharp while a menu it had opened was still up.
                //
                // The chain is started by openSelectionMenu and ends the moment anything closes
                // the menu with showSideMenu(null), which is the near-universal idiom before
                // opening an UNRELATED menu ("graph.showSideMenu(null); exec(...)"). So an
                // unrelated menu does not inherit the mark.
                try {
                    if (!list) { this.__selMenuChain = false; }
                    else if (this.__selMenuChain && Array.isArray(list)) { list.__fromSelection = true; }
                } catch (e) { }
                // console.trace('showSideMenu() called', {
                //     list,
                //     side_menu: this.side_menu,
                //     showChapters: this.showChapters
                // });

                if (!list) {
                    this.side_menu = null;
                    return;
                }

                // A menu is being opened (often from a mouse-DOWN). Neutralize the
                // matching mouse-UP so it doesn't dismiss this menu or fire a
                // context menu / other canvas action on the release.
                this.__keepSideMenu = true;
                this.__downMenuHandled = true;

                if (this.chapter_menu && this.showChapters) {
                    this.showChapters = false;
                }

                if (isMobile()) {
                    exec(
                        'flexigraph/show-mobile-menu.js',
                        0,
                        2,
                        list,
                        this.graph,
                        this.genegraph_panel_layout
                    );

                    return;
                }

                if (this.side_menu && this.side_menu.list === list) {
                    this.setMouseMode('menu');
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

                    const screenWidth =
                        this?.graph?.grid?.width ??
                        window.innerWidth ??
                        800;

                    const screenHeight =
                        this?.graph?.grid?.height ??
                        window.innerHeight ??
                        600;

                    const itemHeight = 35;

                    const getItemLabel = (item) => {
                        if (typeof item === 'string') {
                            return item;
                        }

                        if (item == null) {
                            return '';
                        }

                        return (
                            item.label ||
                            item.name ||
                            item.title ||
                            String(item)
                        );
                    };

                    let maxLabelWidth = 0;

                    try {
                        const canvas =
                            document.createElement('canvas');

                        const context =
                            canvas.getContext('2d');

                        if (context) {
                            context.font = '18px Arial';

                            maxLabelWidth = Math.max(
                                ...safeList.map((item) =>
                                    context.measureText(
                                        getItemLabel(item)
                                    ).width
                                ),
                                0
                            );
                        }
                    } catch (error) {
                        console.error(
                            'Unable to measure side-menu labels:',
                            error
                        );

                        maxLabelWidth = 0;
                    }

                    // PER-COLUMN width. menu.js multiplies this by the column count
                    // (columnXOffset = column*(menu_width+20)), so this must be a
                    // single column's width, NOT the whole menu's. It fits the longest
                    // label, is capped at 500px, and is further shrunk so that all
                    // columns + 20px gaps fit on screen (labels then ellipsize).
                    // A menu can opt into narrower columns (list.__compactCols) — used by the
                    // per-track menu so its columns are tight and it fits alongside the track name.
                    const compact = !!(list && list.__compactCols);
                    const gap = 20;
                    const maxTotal = Math.max(200, screenWidth - 24);
                    const perColFit = Math.floor((maxTotal - gap * (cols - 1)) / cols);
                    const columnWidth = Math.max(
                        compact ? 92 : 120,
                        Math.min(compact ? 190 : 500, Math.ceil(maxLabelWidth) + (compact ? 22 : 40), perColFit)
                    );

                    // Whole-menu width (columns + gaps) — used only to center the menu.
                    const menuWidth = columnWidth * cols + gap * (cols - 1);

                    const rows =
                        Math.min(itemCount, maxPerColumn);


                    debugger;


                    const menuHeight =
                        rows * itemHeight;

                    let xpos = (screenWidth - menuWidth) / 2;
                    let ypos = (screenHeight - menuHeight) / 2;
                    // Optional anchor: place the menu ABOVE the given screen box,
                    // or at an explicit top (anchor.y) e.g. BELOW a card.
                    if (anchor && anchor.aboveY != null) {
                        if (anchor.x != null) xpos = anchor.x;
                        ypos = anchor.aboveY - menuHeight - 6;
                        if (ypos < 6) ypos = 6;
                    } else if (anchor && anchor.y != null) {
                        if (anchor.x != null) xpos = anchor.x;
                        ypos = anchor.y;
                        if (ypos + menuHeight > screenHeight - 6) ypos = Math.max(6, screenHeight - menuHeight - 6);
                    }

                    if (
                        typeof this?.graph?.Xwc !== 'function' ||
                        typeof this?.graph?.Ywc !== 'function'
                    ) {
                        console.warn(
                            'showSideMenu(): graph coordinate conversion is unavailable.'
                        );

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

                    this.side_menu.menu_width = columnWidth;   // PER-COLUMN width
                    this.side_menu.sunset = true;              // orange sunset panel background
                    // Optional label (e.g. the track name) drawn as a chip OUTSIDE the menu.
                    try {
                        if (list && list.__menuTitle) {
                            this.side_menu.title = '' + list.__menuTitle;
                            this.side_menu.externalTitle = true;
                        }
                    } catch (e) { }
                    // Open DISCREETLY: just a title chip, expanding on hover. A side menu that
                    // appears at full size covers the canvas the user is working on.
                    // Opt out per-menu with list.__noCollapse = true.
                    try {
                        // Mobile collapses too — into a bottom tap-bar rather than an inline
                        // pill (see menu.js draw()), so the full-screen mobile menu only opens
                        // once the user taps it.
                        if (!(list && list.__noCollapse)) {
                            // The chip is named after the PARENT — the item the user clicked to
                            // get here. "Layers", "Models", "Primer probes": where they are,
                            // in the word they chose, rather than a summary of what is inside.
                            // menu.js records it just before running an item's click handler.
                            //
                            // The stem summary below is the fallback for a menu with no parent:
                            // one opened from the canvas, a card, or a toolbar rather than from
                            // another menu item.
                            const pillLabel = () => {
                                // An explicit label wins over everything. The caller naming its
                                // own menu knows better than any of the guesses below -- the
                                // parent item it was opened from, or a summary of its contents.
                                try {
                                    const explicit = ('' + (label || '')).trim();
                                    if (explicit) return explicit;
                                } catch (e) { }
                                try {
                                    const mp = this.__menuParent;
                                    // Only a RECENT click counts. A leaf action that opened no
                                    // menu would otherwise leave its name sitting there for
                                    // whatever menu happened to open next.
                                    if (mp && mp.label && (Date.now() - (mp.t || 0)) < 4000) {
                                        return ('' + mp.label).trim();
                                    }
                                } catch (e) { }
                                let stems = [];
                                try {
                                    stems = safeList
                                        .map((it) => ('' + ((it && it.label) || '')).trim())
                                        // Drop the ▸/► marker and any leading bullet, so the five
                                        // characters come from the NAME rather than decoration.
                                        .map((l) => l.replace(/\s*[▸►]\s*$/, '').replace(/^[•\s]+/, '').trim())
                                        // Separators and headers carry no name to abbreviate.
                                        .filter((l) => l.length && !/^[-—–_]+$/.test(l))
                                        .map((l) => l.slice(0, 5).trim())
                                        .filter((l) => l.length);
                                } catch (e) { stems = []; }
                                if (!stems.length) return 'Menu';
                                let out = stems.join('/');
                                // Keep the pill to a sane width: drop trailing stems until it
                                // fits, but never lose the first one.
                                const MAX = 46;
                                while (stems.length > 1 && out.length > MAX) {
                                    stems.pop();
                                    out = stems.join('/');
                                }
                                return out;
                            };
                            if (!this.side_menu.title) {
                                this.side_menu.title = pillLabel();
                                this.side_menu.externalTitle = false;
                            }
                            // Consumed: this menu has its name, and the next one must earn its
                            // own from its own parent click.
                            try { this.__menuParent = null; } catch (e) { }
                            this.side_menu.collapsible = true;
                            this.side_menu.collapsed = true;
                        }
                    } catch (e) { }
                }, 10);
            }
            showMenu(list, x, y, width) {
                try { list = this.__viewerFilterMenu(list); } catch (e) { }
                if (this.wake) this.wake();
                // The center (context) menu takes over — dismiss any side menu.
                this.side_menu = null;
                this.__last_side_menu_ref = null;
                // Opened often from a mouse-DOWN — don't let the release count on the
                // canvas (open a context menu / fire other mouse-up actions).
                if (list) this.__downMenuHandled = true;
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



                        if (!list || list.length === 0) {
                            return;
                        }

                        // Every center menu gets a Cancel option that dismisses the
                        // menu and unblurs the canvas (nulling this.menu removes the
                        // blur) and returns to mouse-over-highlight. Added centrally
                        // so all showMenu() callers get it for free; not duplicated if
                        // the caller already supplied its own Cancel/Close entry.
                        const __hasCancel = list.some((it) => it && typeof it.label === 'string' &&
                            /^(cancel|close)\b/i.test(it.label.trim()));
                        if (!__hasCancel) {
                            list = list.concat([{
                                label: 'Cancel',
                                click: () => {
                                    this.menu = null;
                                    this.graph.menu = null;
                                    setTimeout(() => { try { this.setMouseMode('navigate'); } catch (e) { } }, 0);
                                },
                                move: () => { }
                            }]);
                        }

                        const maxPerColumn = 7;
                        const itemCount = list.length;
                        const cols = Math.ceil(itemCount / maxPerColumn);
                        // Center menu uses the INVERTED tropical scheme: navy surface,
                        // light text, cyan highlight (opposite of the light side menu).
                        const bg = 'rgba(10,37,64,0.97)';
                        const fg = '#eaf6f9';
                        const screen_width = this.graph.grid.width;
                        const screen_height = this.graph.grid.height;
                        const menuWidth = cols * width;
                        const itemHeight = 35;
                        const rows = Math.min(itemCount, maxPerColumn);
                        const menuHeight = rows * itemHeight;

                        const xpos = (screen_width - menuWidth) / 2;
                        const ypos = (screen_height - menuHeight) / 2;

                        this.menu = new Menu(list, this.graph.Xwc(xpos), this.graph.Ywc(ypos), bg, fg, cols);
                        this.menu.menu_width = Math.min(500, width);   // cap column width at 500px
                        // Inverted tropical: navy panel, cyan border, cyan highlight.
                        this.menu.blurBackground = true;             // frost the canvas behind it
                        this.menu.panelBg = 'rgba(10,37,64,0.97)';   // navy panel fill
                        this.menu.panelBorder = '#1aa3bd';           // cyan border
                        this.menu.sg = '#1aa3bd';        // cyan hover/selection fill
                        this.menu.sf = '#ffffff';        // white text on selection
                        this.menu.titleColor = '#4fd0e6';
                        this.graph.menu = this.menu;
                        this.setMouseMode("menu")

                    }, 300)

                }
            }

            showWindowMenu(list, x, y, width) {
                try { list = this.__viewerFilterMenu(list); } catch (e) { }
                if (this.wake) this.wake();
                exec('flexigraph/show-mobile-menu.js', x, y, list, this.graph, this.genegraph_panel_layout, true)
            }

            // Shrink every track's y-axis to the smallest range that still shows all
            // its items (repairs a ymax left inflated by a bad oligo y).
            fitAllTrackYAxes() {
                for (const t of (this.track || [])) {
                    try { if (t && t.fitYAxis) t.fitYAxis(); } catch (e) { }
                }
                try { this.rescale(); } catch (e) { }
                if (this.wake) this.wake();
            }

            // Zoom the viewport out to encompass every track (x span + vertical stack).
            async viewAllTracks() {
                const ts = (this.track || []).filter(t => t && t.tgraph && isFinite(t.tgraph.xi) && isFinite(t.tgraph.width));
                if (!ts.length) return;
                let minXi = Infinity, maxXf = -Infinity, minYi = Infinity, maxYi = -Infinity;
                for (const t of ts) {
                    const g = t.tgraph;
                    minXi = Math.min(minXi, g.xi);
                    maxXf = Math.max(maxXf, g.xi + g.width);
                    minYi = Math.min(minYi, g.yi);
                    maxYi = Math.max(maxYi, g.yi);
                }
                const xpad = Math.max(50, (maxXf - minXi) * 0.03);
                try { await this.zoomRect(minXi - xpad, maxXf + xpad, maxYi + 2, minYi - 2, 150); } catch (e) { }
                if (this.wake) this.wake();
            }

            // Zoom the viewport to a single track so its box sits centered in the canvas.
            // The zoom rect is symmetric about the track's center in x (xi + width/2) and
            // y (its two edges yi and yi+height), so the track lands in the middle.
            async zoomToTrack(t, padFrac) {
                // track.js exposes .tgraph, track-flexi exposes .grid. Reaching for only one of
                // them made this a no-op on every flexi track, silently -- the camera simply did
                // not move and nothing said why.
                const g = t && (t.tgraph || t.grid);
                if (!g) return;
                // Horizontal margin as a fraction of the track width (default 5%); callers can
                // request more breathing room around the framed track.
                const pf = (padFrac != null && isFinite(padFrac)) ? padFrac : 0.05;
                const xpad = Math.max(50, g.width * pf);
                const yA = g.yi;
                const yB = g.yi + (g.height || 0);
                const cy = (yA + yB) / 2;                  // vertical center of the track box
                const span = Math.abs(yB - yA) || 1;
                const yhalf = span * (1.5 + pf * 3);       // track box + margin, kept symmetric
                try { await this.zoomRect(g.xi - xpad, g.xi + g.width + xpad, cy + yhalf, cy - yhalf, 150); } catch (e) { }
                if (this.wake) this.wake();
            }

            // Render one level of the selection menu as a library. Each menu item becomes a
            // card; a '▸' item is one that opens another level, a '‹ Back' item goes back, and
            // everything else acts. The shelf reuses ONE dom id, so opening a level replaces the
            // one before it -- the menu's own Back items are the way out, which is exactly how
            // the side-menu version navigates, so the two behave the same.
            // The three ways to select something, always the first three cards of the selection
            // library's TOP level -- not of every level, or they would reappear inside each
            // item's actions where they mean nothing.
            //
            // First because they are what you need when the library is empty, and because a
            // library of selected objects should be able to tell you how to select one. Sunset
            // accent to mark them as TOOLS that arm a gesture on the canvas rather than things
            // already selected, so the two kinds are not read as one list.
            // Is there anything a "Clear selection" could act on? Both halves count: the objects
            // in __lassoSelection, and a sequence range marked on a track. A range with nothing
            // lassoed is a real state -- select a sequence, design into it, lasso nothing -- and
            // it is exactly the state where the user most wants to clear and start again.
            __hasAnySelection() {
                try {
                    if ((this.__lassoSelection || []).length) return true;
                    for (const t of (this.track || [])) {
                        if (!t) continue;
                        if (t.selectedRange && t.selectedRange()) return true;
                        if (t.markstart != null && t.markend != null && t.markend > t.markstart) return true;
                    }
                } catch (e) { }
                return false;
            }

            __selectionToolBooks(hasSelection) {
                const arm = (fn) => () => {
                    // The shelf has closed itself by the time this runs, so the canvas is free
                    // for the gesture. Any menu still up would sit over the very area the user
                    // is about to drag across.
                    //
                    // These END the library session: they hand control back to the canvas, and
                    // what the user does next -- lassoing, then opening the selection window --
                    // is the canvas route, which has its own side menus.
                    try { this.__menuLibrary = false; } catch (e) { }
                    try { this.showSideMenu(null); } catch (e) { }
                    try { this.__selMenuChain = false; } catch (e) { }
                    try { fn(); } catch (e) {
                        try { this.setError(' Could not start that selection: ' + e + ' '); } catch (e2) { }
                    }
                };
                return [
                    {
                        title: 'Rectangle', icon: '▭', badge: 'Drag a box', accent: 'sunset',
                        blurb: 'Drag a rectangle over the canvas. Everything inside it — compounds, '
                            + 'annotations, variants, whole tracks — is selected.',
                        open: arm(() => this._startLasso(true))
                    },
                    {
                        title: 'Lasso', icon: '✧', badge: 'Draw a loop', accent: 'sunset',
                        blurb: 'Draw a freehand loop instead of a box, for a selection a rectangle '
                            + 'would have to include things you do not want.',
                        open: arm(() => this._startLasso(false))
                    },
                    {
                        title: 'Sequence', icon: '⌇', badge: 'Pick bases', accent: 'sunset',
                        blurb: 'Select a range of BASES on a track. Everything that follows — the '
                            + 'designers, the models, the data layers — then works only inside it.',
                        open: arm(() => exec('baja/manchester/menu/select-sequence.js',
                            this, this.genegraph_panel_layout, true))
                    }
                ].concat(hasSelection ? [{
                    // Last of the four, not first. It belongs with them -- it is the fourth thing
                    // you do to a selection, and the undo of the other three -- but a destructive
                    // action as the very first card is the one most likely to be hit by mistake
                    // when someone opens this library meaning to select something.
                    //
                    // Only shown when there IS something to clear: offering it over an empty
                    // library would be a button that does nothing.
                    title: 'Clear selection', icon: '○', badge: 'Start over', accent: 'sunset',
                    blurb: 'Deselect everything — the objects in this library AND any sequence '
                        + 'range marked on a track.',
                    open: () => {
                        try { this.showSideMenu(null); } catch (e) { }
                        try { this.__selMenuChain = false; } catch (e) { }
                        try { this.clearSelectionVisuals(); } catch (e) { }
                        let seq = 0;
                        try { seq = this.clearSequenceSelections(); } catch (e) { }
                        this.__lassoSelection = [];
                        this.__selPanelBounds = null;
                        this.showDisplay = false;
                        try { if (this.wake) this.wake(); } catch (e) { }
                        try {
                            this.setResultMessage(seq
                                ? (' Selection cleared, including the selected sequence on '
                                    + seq + ' track' + (seq === 1 ? '' : 's') + '. ')
                                : ' Selection cleared. ');
                        } catch (e) { }
                    }
                }] : []);
            }

            // An icon for one selection-library card, read from its LABEL.
            //
            // The cards are built from menu items, which carry a label and a click and nothing
            // else -- there is no type to switch on, and adding one would mean touching every
            // menu item in openSelectionMenu and every handoff script that builds a list. So the
            // label is the signal, matched most-specific first: 'Zoom to compounds' has to be
            // tested before 'Zoom to', and 'Remove all others' before 'Remove', or the general
            // rule swallows the specific one.
            //
            // A glyph rather than an emoji: these sit in a small chip beside a badge, and emoji
            // render at wildly different weights across platforms while the geometric set here
            // stays the same size next to the text.
            __selectionIcon(label, isSub, isBack) {
                const l = ('' + (label || '')).trim();
                const T = [
                    [/^(‹|«|<|←)|^back\b/i, '‹'],
                    [/more…|^more\b|^next\b/i, '»'],
                    [/previous/i, '«'],
                    [/zoom to compounds/i, '◎'],
                    [/^zoom/i, '⌖'],
                    [/remove all others/i, '⋮'],
                    [/^(remove|delete)/i, '✕'],
                    [/^deselect|clear selection/i, '○'],
                    [/download|export|\b(csv|bed|xlsx|txt)\b/i, '⤓'],
                    [/highlight/i, '✷'],
                    [/^hide/i, '◌'],
                    [/^show/i, '◉'],
                    [/rename|change .*name/i, '✎'],
                    [/off-?target/i, '⌕'],
                    [/design/i, '⚗'],
                    [/primer|amplicon/i, '⋈'],
                    [/layer/i, '▤'],
                    [/variant|snp|indel|mutation/i, '◆'],
                    [/annotation|exon|domain/i, '▮'],
                    [/oligo|compound|aso|sirna|therapeutic/i, '⌁'],
                    [/track/i, '▬'],
                    [/librar/i, '▦'],
                    [/sequence/i, '⌇'],
                    [/model|splic|retention|rbp|binding/i, '◈']
                ];
                for (const [re, g] of T) { if (re.test(l)) return g; }
                // Nothing matched: still say which KIND of card it is, since that is the one
                // thing the shelf knows for certain about every row.
                return isBack ? '‹' : (isSub ? '›' : '•');
            }

            __showSelectionShelf(list, label) {
                const items = (Array.isArray(list) ? list : []).filter(Boolean);
                // A header row is the menu's caption ('Selected (7) —'), not something to click.
                const header = items.find((it) => it && it.header);
                const rows = items.filter((it) => it && !it.header && typeof it.click === 'function');
                const books = rows.map((it) => {
                    const raw = ('' + (it.label || '')).trim();
                    const isSub = /[▸►]/.test(raw);
                    const isBack = /^(‹|«|<|←)/.test(raw) || /^Back\b/i.test(raw);
                    return {
                        // The ▸ is what the shelf itself adds for a nested card, so carrying the
                        // menu's own would print it twice.
                        title: raw.replace(/\s*[▸►]\s*$/, '') || 'Item',
                        icon: this.__selectionIcon(raw, isSub, isBack),
                        // What KIND of row this is, as a glyph rather than a word: '‹' goes
                        // back a level, '›' opens the next one, '•' runs on the selection.
                        // Same three marks __selectionIcon falls back to, so the vocabulary is
                        // one set, not two. The sentences that used to sit under each card
                        // ('Opens the next level of this selection.', 'Runs this action on the
                        // selection.') said the same thing on every card of a kind and pushed
                        // the actual titles apart, so the glyph carries it instead.
                        badge: isBack ? '‹' : (isSub ? '›' : '•'),
                        blurb: '',
                        open: () => { try { it.click(); } catch (e) { } }
                    };
                });
                let tools = [];
                if (this.__selTopLevel) {
                    this.__selTopLevel = false;
                    try { tools = this.__selectionToolBooks(this.__hasAnySelection()); } catch (e) { tools = []; }
                }
                const all = tools.concat(books);
                if (!all.length) {
                    try { this.setResultMessage(' Nothing to show for that selection. '); } catch (e) { }
                    return;
                }
                const sub = header ? ('' + (header.label || '')).trim() : '';
                try {
                    exec('baja/lib/shelf.js', {
                        id: 'baja-selection-library',
                        title: label || 'Selection',
                        subtitle: sub || 'Everything currently selected, and what can be done with it',
                        books: all,
                        graph: this,
                        onClose: (reason) => {
                            // 'open' means a card was activated and the shelf stepped aside for
                            // it: the session continues, and whatever that action opens is drawn
                            // as the next level. Only a real dismissal ends the session and
                            // hands the canvas back.
                            if (reason === 'open') return;
                            try { this.__menuLibrary = false; } catch (e) { }
                            try { this.__selMenuChain = false; } catch (e) { }
                            try { this.clearMouseListeners(); } catch (e) { }
                            try { this.setMouseMode('navigate'); } catch (e) { }
                            try { if (typeof this.__hoverRearm === 'function') this.__hoverRearm(); } catch (e) { }
                        }
                    });
                } catch (e) {
                    try { this.setError(' Could not open the selection library: ' + e + ' '); } catch (e2) { }
                }
            }

            // The toolbar button: the same selection menu, opened as a library.
            openSelectionLibrary() {
                const sel = this.__lassoSelection || [];
                try { this.showSideMenu(null); } catch (e) { }
                // Marks the NEXT shelf as the top level, so the three selection tools are added
                // there and nowhere deeper.
                this.__selTopLevel = true;
                // Opens the session. Everything from here until the user closes the library is
                // drawn as a library, whichever script builds the level.
                this.__menuLibrary = true;
                if (!sel.length) {
                    // Nothing selected is not an error, and telling the user so and stopping was
                    // the least useful thing this button could do: what they need at that moment
                    // is a way to select something, which is exactly what these three cards are.
                    try {
                        exec('baja/lib/shelf.js', {
                            id: 'baja-selection-library',
                            title: 'Selection',
                            subtitle: 'Nothing is selected yet — pick a way to select something',
                            books: this.__selectionToolBooks(this.__hasAnySelection()),
                            graph: this,
                            onClose: (reason) => {
                                if (reason === 'open') return;
                                try { this.__selTopLevel = false; } catch (e) { }
                                try { this.__menuLibrary = false; } catch (e) { }
                                try { this.clearMouseListeners(); } catch (e) { }
                                try { this.setMouseMode('navigate'); } catch (e) { }
                                try { if (typeof this.__hoverRearm === 'function') this.__hoverRearm(); } catch (e) { }
                            }
                        });
                    } catch (e) {
                        try { this.setError(' Could not open the selection library: ' + e + ' '); } catch (e2) { }
                    }
                    return;
                }
                this.openSelectionMenu(null, null, true);
            }

            // Hit-test a SCREEN point against any track's selection arrow heads — the ends of the
            // orange selected-sequence arrow drawn at grid.Y(-20) (see track-flexi draw). Returns
            // { track, edge:'start'|'end' } when the point is on a head, else null.
            // The track whose SELECTION contains this world point, or null. Used to open the
            // Selected Sequence menu on a click inside a selection. Vertical containment is
            // tested against the track's own band so a click on a different track does not
            // match, and markstart/markend are normalized the way track.js draws them (they
            // may be 0-based offsets rather than world coords).
            __trackAtSelection(xwc, ywc) {
                try {
                    for (const t of (this.track || [])) {
                        if (!t || t.markstart == null || t.markend == null) continue;
                        if (t.markstart < 0 || !(t.markend > t.markstart)) continue;
                        const g = t.tgraph || t.grid;
                        if (!g) continue;
                        const toWorld = (m) => (m != null && t.xi != null && m < t.xi) ? (t.xi + m) : m;
                        const a = toWorld(t.markstart), b = toWorld(t.markend);
                        const wx = (typeof g.Xwc === 'function') ? g.Xwc(xwc) : xwc;
                        if (!(wx >= Math.min(a, b) && wx <= Math.max(a, b))) continue;
                        try {
                            const yTop = g.Y(g.getymax()), yBot = g.Y(g.getymin());
                            const sy = this.graph.Y(ywc);
                            const y1 = this.graph.Y(Math.max(yTop, yBot)), y2 = this.graph.Y(Math.min(yTop, yBot));
                            if (sy < Math.min(y1, y2) - 6 || sy > Math.max(y1, y2) + 6) continue;
                        } catch (e) { }
                        return t;
                    }
                } catch (e) { }
                return null;
            }
            __hitSelectionArrow(sx, sy) {
                try {
                    const PADX = 16, PADY = 16, HEAD = 18;
                    let best = null, bestD = Infinity;
                    for (const t of (this.track || [])) {
                        if (!t) continue;
                        if (t.markstart == null || t.markend == null || t.markstart < 0 || !(t.markend > t.markstart)) continue;

                        // The two track renderers draw the selection heads in DIFFERENT places,
                        // so collect a candidate {y, xStart, xEnd} from each mapping the track
                        // actually has and test them all:
                        //   track-flexi.js  heads at grid.Y(-20), x via grid.X
                        //   track.js        heads a quarter of the way up the track, x via
                        //                   tgraph.X, and markstart/markend may be 0-based
                        //                   offsets rather than world coords (see __toWorld)
                        const cands = [];
                        try {
                            if (t.grid && typeof t.grid.Y === 'function') {
                                cands.push({
                                    y: this.graph.Y(t.grid.Y(-20)),
                                    xs: this.graph.X(t.grid.X(Math.floor(t.markstart))),
                                    xe: this.graph.X(t.grid.X(t.markend))
                                });
                            }
                        } catch (e) { }
                        try {
                            if (t.tgraph && typeof t.tgraph.Y === 'function') {
                                const yMin = t.tgraph.getymin(), yMax = t.tgraph.getymax();
                                const toWorld = (m) => (m != null && m < t.xi) ? (t.xi + m) : m;
                                cands.push({
                                    y: this.graph.Y(t.tgraph.Y(yMin + (yMax - yMin) * 0.25)),
                                    xs: this.graph.X(Math.round(t.tgraph.X(toWorld(t.markstart)))),
                                    xe: this.graph.X(Math.round(t.tgraph.X(toWorld(t.markend))))
                                });
                            }
                        } catch (e) { }

                        for (const c of cands) {
                            if (!isFinite(c.y) || !isFinite(c.xs) || !isFinite(c.xe)) continue;
                            if (Math.abs(sy - c.y) > PADY) continue;
                            // Both heads point OUTWARD: start spans [xs, xs+HEAD], end [xe-HEAD, xe].
                            // Nearest head wins, so on a short selection whose hit boxes overlap you
                            // still grab the edge you actually pointed at.
                            if (sx >= c.xs - PADX && sx <= c.xs + HEAD + PADX) {
                                const d = Math.abs(sx - (c.xs + HEAD / 2));
                                if (d < bestD) { bestD = d; best = { track: t, edge: 'start' }; }
                            }
                            if (sx >= c.xe - HEAD - PADX && sx <= c.xe + PADX) {
                                const d = Math.abs(sx - (c.xe - HEAD / 2));
                                if (d < bestD) { bestD = d; best = { track: t, edge: 'end' }; }
                            }
                        }
                    }
                    return best;
                } catch (e) { }
                return null;
            }
            // Hit-test a SCREEN point against the deselect (X) button drawn halfway between a
            // selection's two arrow heads (see track-flexi.js, the __drawGrabHead block).
            // Returns the track whose button was hit, else null.
            //
            // The radius and the minimum head-to-head gap are read OFF THE TRACK, the same two
            // fields the drawing uses, so the hit box is the circle that was actually drawn --
            // and when the selection is too narrow for the button to be drawn at all, this
            // matches nothing rather than leaving an invisible target sitting on the heads.
            __hitSelectionClear(sx, sy) {
                try {
                    for (const t of (this.track || [])) {
                        if (!t) continue;
                        if (t.markstart == null || t.markend == null || t.markstart < 0 || !(t.markend > t.markstart)) continue;
                        // The track itself says where its button is (and whether it has one) --
                        // the same call the drawing makes, so the hit box is always the disc
                        // that was actually drawn. A track class without this method does not
                        // draw the button (only baja/bio/track-flexi.js does), so it gets no
                        // invisible target either.
                        if (typeof t.selectionClearButton !== 'function') continue;

                        // Same two mappings __hitSelectionArrow collects, for the same reason:
                        // the two track renderers put the selection line in different places.
                        const cands = [];
                        try {
                            if (t.grid && typeof t.grid.Y === 'function') {
                                cands.push({
                                    y: this.graph.Y(t.grid.Y(-20)),
                                    xs: this.graph.X(t.grid.X(Math.floor(t.markstart))),
                                    xe: this.graph.X(t.grid.X(t.markend))
                                });
                            }
                        } catch (e) { }
                        try {
                            if (t.tgraph && typeof t.tgraph.Y === 'function') {
                                const yMin = t.tgraph.getymin(), yMax = t.tgraph.getymax();
                                const toWorld = (m) => (m != null && m < t.xi) ? (t.xi + m) : m;
                                cands.push({
                                    y: this.graph.Y(t.tgraph.Y(yMin + (yMax - yMin) * 0.25)),
                                    xs: this.graph.X(Math.round(t.tgraph.X(toWorld(t.markstart)))),
                                    xe: this.graph.X(Math.round(t.tgraph.X(toWorld(t.markend))))
                                });
                            }
                        } catch (e) { }

                        for (const c of cands) {
                            const btn = t.selectionClearButton(c.xs, c.xe, c.y);
                            if (!btn) continue;                 // not drawn -> not clickable
                            const dx = sx - btn.x, dy = sy - btn.y;
                            // A couple of pixels of slack around the disc, so it is reachable
                            // without being pixel-perfect.
                            if ((dx * dx + dy * dy) <= (btn.r + 3) * (btn.r + 3)) return t;
                        }
                    }
                } catch (e) { }
                return null;
            }
            menuVisible() {
                if (this.menu != null) {
                    return true;
                } else
                    return false;
            }
            // A menu dismissed WITHOUT the item installing its own canvas interaction leaves the
            // canvas with no listeners at all: no pan, no hover, no selection, until the user
            // happens to open another menu. This puts the mouse-over highlight back.
            //
            // Deferred, and run twice, on purpose. A Cancel/dismiss handler may call
            // setMouseMode('navigate'), which CLEARS listeners -- re-arming before that runs
            // would just be wiped -- and the second pass is a safety net against a slower one
            // clearing what the first put back. The listener check is what makes that safe: if
            // the menu item armed its own interaction ('click a track to load data'), this does
            // nothing and leaves that mode alone.
            __rearmHoverSoon() {
                const go = () => {
                    try {
                        if (this.mouseDownListeners.length === 0 && this.mouseMoveListeners.length === 0
                            && !this.side_menu && !this.menuVisible()
                            && !this.showChapters && !this.showBookmarks) {
                            if (typeof this.__hoverRearm === 'function') {
                                this.__hoverRearm();
                            } else {
                                const gpl = this.genegraph_panel_layout
                                    || (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed ? CurrentLayout.getStashed('genegraph_panel_layout') : null);
                                try { exec('baja/manchester/menu/mouse-over-highlight.js', this, gpl); } catch (e) { }
                            }
                        }
                    } catch (e) { }
                };
                setTimeout(go, 40);
                setTimeout(go, 180);
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
                    fill = "#ffffff",
                    stroke = "#d4dae3",
                    lineWidth = 1,
                    shadowColor = "rgba(16,24,40,0.14)",
                    shadowBlur = 4,
                    shadowOffsetX = 0,
                    shadowOffsetY = 1.5,
                    textColor = "#475467",
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

            roundRectPath(ctx, x, y, w, h, r) {
                const rr = Math.min(r, w / 2, h / 2);
                ctx.beginPath();
                ctx.moveTo(x + rr, y);
                ctx.arcTo(x + w, y, x + w, y + h, rr);
                ctx.arcTo(x + w, y + h, x, y + h, rr);
                ctx.arcTo(x, y + h, x, y, rr);
                ctx.arcTo(x, y, x + w, y, rr);
                ctx.closePath();
            }

            // Professional rounded-square control button that matches the
            // menubar icon buttons: soft grey border, subtle vertical gradient,
            // and a light drop shadow. Geometry is kept centered on (cx, cy)
            // so the existing circular hit-testing still lines up.
            drawCircleButton(ctx, cx, cy, r = 11, { pressed = false, circle = false, invert = false } = {}) {
                ctx.save();

                const size = r * 2;
                const x = cx - r, y = cy - r;
                const radius = Math.max(3, r * 0.38);
                // `circle` -> a true circle; otherwise the rounded-square chiclet.
                const path = () => {
                    if (circle) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }
                    else this.roundRectPath(ctx, x, y, size, size, radius);
                };

                // Drop shadow (prominent so every top button lifts off the canvas).
                ctx.shadowColor = pressed ? "rgba(16,24,40,0.22)" : "rgba(16,24,40,0.38)";
                ctx.shadowBlur = pressed ? 4 : 8;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = pressed ? 1 : 3;

                const grad = ctx.createLinearGradient(0, y, 0, y + size);
                if (invert) {
                    // Tropical INVERTED: navy -> cyan fill (glyph drawn light by caller).
                    if (pressed) { grad.addColorStop(0, "#08304a"); grad.addColorStop(1, "#001b20"); }
                    else { grad.addColorStop(0, "#0a2540"); grad.addColorStop(1, "#010353"); }
                } else if (pressed) {
                    grad.addColorStop(0, "#eef2f8");
                    grad.addColorStop(1, "#e2e8f2");
                } else {
                    grad.addColorStop(0, "#ffffff");
                    grad.addColorStop(1, "#f3f5f9");
                }
                ctx.fillStyle = grad;
                path();
                ctx.fill();

                // Crisp border, drawn without the shadow
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = invert ? 1.2 : 1;
                ctx.strokeStyle = invert ? "#1aa3bd" : (pressed ? "#c7d0dd" : "#d4dae3");
                path();
                ctx.stroke();

                ctx.restore();
            }

            drawButtonLabel(ctx, text, x, y, { color, font = "11px Arial" } = {}) {
                // Legacy per-button (right-side) help labels are disabled — the
                // control-button help is now drawn centrally by drawControlHelp()
                // as a staggered list below the button row with arrows.
                return;
            }

            // Onboarding help: reveals a labelled chip BELOW each control button,
            // one at a time (staggered), each with an arrow pointing up to its
            // button. Time-based, so it plays through exactly once.
            drawControlHelp(ctx) {
                if (!this.showHelp) return;
                if (this.__helpStart == null) this.__helpStart = Date.now();
                const elapsed = Date.now() - this.__helpStart;
                const STAGGER = 240;     // ms between each label turning on
                const defs = this.controlButtonDefs();
                const r = 11;
                const rowH = 24;
                const baseY = (defs[0] ? defs[0].cy : 22) + r + 22;

                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.font = "600 11px Arial";

                defs.forEach((b, i) => {
                    if (elapsed < i * STAGGER) return;         // not revealed yet
                    const alpha = Math.min(1, (elapsed - i * STAGGER) / 200);   // fade-in
                    const text = b.info || b.id;
                    const ly = baseY + i * rowH;               // this label's row
                    const padX = 7, bh = 18;
                    const tw = ctx.measureText(text).width;
                    const bw = tw + padX * 2;
                    const bx = b.cx - bw / 2;
                    const by = ly - bh / 2;

                    ctx.globalAlpha = alpha;

                    // Arrow: straight up from the label to its button.
                    ctx.strokeStyle = "rgba(1,28,60,0.75)";
                    ctx.fillStyle = "rgba(1,28,60,0.75)";
                    ctx.lineWidth = 1.3;
                    ctx.beginPath();
                    ctx.moveTo(b.cx, by);
                    ctx.lineTo(b.cx, b.cy + r + 5);
                    ctx.stroke();
                    ctx.beginPath();                            // arrowhead at the button
                    ctx.moveTo(b.cx, b.cy + r);
                    ctx.lineTo(b.cx - 4, b.cy + r + 6);
                    ctx.lineTo(b.cx + 4, b.cy + r + 6);
                    ctx.closePath();
                    ctx.fill();

                    // Label chip
                    ctx.fillStyle = "rgba(33,43,54,0.96)";
                    this.roundRectPath(ctx, bx, by, bw, bh, 5);
                    ctx.fill();
                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(text, b.cx, ly);
                });

                ctx.restore();
            }

            drawButtonGlyph(ctx, glyph, cx, cy, { font = "700 14px Arial", color } = {}) {
                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.font = font;
                ctx.fillStyle = color ?? ctx._buttonTextColor ?? "#475467";
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
                    color: "#000000",
                });

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Bookmark", cx + 20, cy, {
                        font: "11px Arial",
                        color: "#475467",
                    });
                }
            }

            // Metadata for the on-canvas navigation controls: center, screen-space
            // hit range (x is always 10..30), and the info text shown on hover.
            controlButtonDefs() {
                // A single horizontal row, centered along the TOP of the canvas.
                const list = [
                    // Navigation / view controls (left)
                    { id: 'zoom_in', info: 'Zoom in' },
                    { id: 'zoom_out', info: 'Zoom out' },
                    // The selection library is NOT here: it lives in the menubar (Selection),
                    // because this row is for direct manipulation of the view -- zoom, pan, box,
                    // lasso -- and opening a full-screen library is a menubar action, not a
                    // canvas gesture. openSelectionLibrary() below is what that button calls.
                    { id: 'navigate', info: 'Pan' },
                    { id: 'bpx', info: 'Box zoom' },
                    { id: 'expand_vertical', info: 'Expand vertically' },
                    { id: 'contract_vertical', info: 'Contract vertically' },
                    { id: 'expand_horizontal', info: 'Expand horizontally' },
                    { id: 'contract_horizontal', info: 'Contract horizontally' },
                    // Selection tools (right)
                    { id: 'lasso', info: 'Lasso select' },
                    { id: 'select_seq', info: 'Select sequence' },
                    // Selection / info panel toggle (last, far right)
                    { id: 'info', info: 'Info' },
                ];
                const spacing = 34, r = 11, cy = 22;
                // Lay the buttons out in ROOT CANVAS (the DOM canvas element's backing-store) pixel
                // coordinates — the exact space the ctx draws into AND the space mouse events are
                // scaled into (canvasEl.width / rect.width). Reading the width straight off the
                // drawing context's own canvas guarantees draw and hit-test share one space,
                // independent of any stale component/grid width, world transform, or CSS scaling.
                let cw = 800;
                try {
                    const _ctx = this.graph && this.graph.canvas && this.graph.canvas.getCTX && this.graph.canvas.getCTX();
                    cw = (_ctx && _ctx.canvas && _ctx.canvas.width)
                        || (this.graph && this.graph.canvas && this.graph.canvas.width)
                        || (this.graph && this.graph.grid && this.graph.grid.width) || 800;
                } catch (e) { }
                const totalW = (list.length - 1) * spacing;
                const startX = Math.max(24, Math.round((cw - totalW) / 2));
                return list.map((b, i) => {
                    const cx = startX + i * spacing;
                    return { id: b.id, info: b.info, cx, cy, x0: cx - r - 3, x1: cx + r + 3, y0: cy - r - 3, y1: cy + r + 3 };
                });
            }

            // The y just below the control-button row — the TOP STRIP, where everything the
            // canvas says about itself is drawn: the coordinate readout, and the result/error
            // toast. Nothing is drawn at the foot of the canvas: the free-plan bar is fixed to
            // the bottom of the window and painted over it, and on some devices the foot of the
            // canvas is not on screen at all, so anything there can be shown to nobody.
            //
            // Measured from the buttons rather than a guessed constant, so moving or resizing
            // that row moves what sits under it. With the row hidden this rides higher.
            __topStripY() {
                let bottom = 0;
                try {
                    if (this.showNavigationControl) {
                        for (const d of (this.controlButtonDefs() || [])) bottom = Math.max(bottom, d.y1 || 0);
                    }
                } catch (e) { }
                return bottom + 12;
            }

            // Position {cx,cy} of a control button by id — used by the draw methods.
            _ctrlPos(id) {
                const b = this.controlButtonDefs().find(d => d.id === id);
                return b ? { cx: b.cx, cy: b.cy } : { cx: 25, cy: 22 };
            }

            // Returns the id of the control button under the given screen point.
            hitControlButton(xs, ys) {
                if (!this.showNavigationControl) return null;
                const b = this.controlButtonDefs().find(d => xs >= d.x0 && xs <= d.x1 && ys >= d.y0 && ys <= d.y1);
                return b ? b.id : null;
            }

            // Dispatch a control-button click by id (called from the mouse-down handler).
            async handleControlButton(id) {
                switch (id) {
                    case 'zoom_in':
                        this.bclick = 'zoom_in';
                        setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 400);
                        this.graph.rescale();
                        await this.slideZoomByFactor(0.5, 0.5, 200);
                        return;
                    case 'zoom_out':
                        this.bclick = 'zoom_out';
                        setTimeout(() => { this.___folder_calculation = false; this.___folder_calculation_status = null; this.bclick = ''; this.setMouseMode('navigate'); }, 400);
                        await this.slideZoomByFactor(1.50, 1.20, 200);
                        return;
                    case 'navigate':
                        this.bclick = 'navigate';
                        this.setMouseMode('navigate');
                        setTimeout(() => { this.bclick = ''; }, 100);
                        this.___folder_calculation = false;
                        this.___folder_calculation_status = null;
                        return;
                    case 'bpx':
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
                                let height = this.currentShape.h;
                                let width = this.currentShape.w;
                                let hs = this.graph.screenHeight(height);
                                let ws = this.graph.screenWidth(width);
                                if (hs < 10) { this.currentShape = null; this.md = false; return; }
                                if (hs > 10 && ws > 10) {
                                    let xi = this.currentShape.x;
                                    let xf = this.currentShape.x + this.currentShape.w;
                                    let yi = this.currentShape.y;
                                    let yf = this.currentShape.y - this.currentShape.h;
                                    this.currentShape = null;
                                    await this.zoomRect(xi, xf, yf, yi, 150);
                                    // Box-zoom is one-shot: return to navigate /
                                    // mouse-over-highlight once the zoom is complete.
                                    // Deferred so it re-installs listeners after this
                                    // mouse-up has fully unwound.
                                    this.graph.mode = 'navigate';
                                    setTimeout(() => { try { this.setMouseMode('navigate'); } catch (e) { } }, 0);
                                }
                            }
                            this.currentShape = null;
                            this.md = false;
                        });
                        return;
                    case 'lasso':
                        this._startLasso();
                        return;
                    case 'select_seq':
                        // Open the sequence.js select features (Select genomic range,
                        // Select track sequence, Edit selected sequence, motifs, …).
                        this.bclick = 'select_seq';
                        setTimeout(() => { this.bclick = ''; }, 100);
                        try {

                            this.clearMouseListeners();
                            // this.setMouseMode('sequence');


                            Promise.resolve(exec('baja/manchester/menu/select-sequence.js',
                                this, this.genegraph_panel_layout, true)).catch(() => { });
                        } catch (e) {
                            this.setMessage(' Could not open sequence tools: ' + e);
                        }
                        return;
                    case 'info':
                        this.showDisplay = !this.showDisplay;
                        this.setMessage(this.showDisplay ? ' Info panel shown ' : ' Info panel hidden ');
                        if (this.wake) this.wake();
                        return;
                    case 'contract_vertical': {
                        this.bclick = 'contract_vertical';
                        setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                        // Set the Y range directly rather than via animateTo — when zoomed in the
                        // y-range is small, and animateTo's `<1` reset + aspect-ratio clamp discard
                        // the change, so the vertical buttons appeared to do nothing.
                        let ly = (Math.abs(this.graph.getymax() - this.graph.getymin()) / 10) || 0.1;
                        this.graph.setymin(this.graph.getymin() - ly);
                        this.graph.setymax(this.graph.getymax() + ly);
                        try { this.graph.rescale(); } catch (e) { }
                        if (this.wake) this.wake();
                        return;
                    }
                    case 'expand_vertical': {
                        this.bclick = 'expand_vertical';
                        setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                        let ly = (Math.abs(this.graph.getymax() - this.graph.getymin()) / 10) || 0.1;
                        this.graph.setymin(this.graph.getymin() + ly);
                        this.graph.setymax(this.graph.getymax() - ly);
                        try { this.graph.rescale(); } catch (e) { }
                        if (this.wake) this.wake();
                        return;
                    }
                    case 'contract_horizontal': {
                        this.bclick = 'expand_horizontal';
                        setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                        let lx = Math.abs(this.graph.getxmax() - this.graph.getxmin()) / 10;
                        await this.zoomXY(this.graph.getxmin() - lx, this.graph.getxmax() + lx, this.graph.getymin(), this.graph.getymax());
                        return;
                    }
                    case 'expand_horizontal': {
                        this.bclick = 'contract_horizontal';
                        setTimeout(() => { this.bclick = ''; this.setMouseMode('navigate'); }, 100);
                        let lx = Math.abs(this.graph.getxmax() - this.graph.getxmin()) / 10;
                        await this.zoomXY(this.graph.getxmin() + lx, this.graph.getxmax() - lx, this.graph.getymin(), this.graph.getymax());
                        return;
                    }
                }
            }

            // Freehand lasso select: draw a loop; annotations/SNPs whose position
            // falls inside it get selected on release.
            // `rect` draws a RECTANGLE instead of a freehand loop. Everything downstream is
            // unchanged: the loop is already a polygon tested point-in-polygon, so a rectangle
            // is that polygon with four corners. A separate implementation would have been a
            // second copy of the hit-testing, the track-enclosure rule and the selection
            // assembly -- three things that must agree between the two gestures.
            _startLasso(rect) {
                this.clearMouseListeners();
                this.setMouseMode(rect ? 'rectselect' : 'lasso');
                this.bclick = rect ? 'rectselect' : 'lasso';
                setTimeout(() => { this.bclick = ''; }, 100);
                this.setMessage(rect
                    ? " Rectangle select — drag a box around items, release to select "
                    : " Lasso select — draw a loop around items, release to select ");
                const pts = [];   // world coords (xwc, ywc)
                // The drag start, kept so a rectangle can be rebuilt from two corners on every
                // move rather than accumulating a trail.
                let anchor = null;
                this.post_graphics_modifications = (c2) => {
                    if (!pts.length) return;
                    c2.save();
                    try { this.resetCanvasEffects(c2); } catch (e) { }
                    c2.beginPath();
                    for (let i = 0; i < pts.length; i++) {
                        const sx = this.graph.X(pts[i].x), sy = this.graph.Y(pts[i].y);
                        if (i === 0) c2.moveTo(sx, sy); else c2.lineTo(sx, sy);
                    }
                    c2.closePath();
                    c2.fillStyle = 'rgba(53,198,214,0.14)';
                    c2.fill();
                    c2.lineWidth = 2;
                    c2.strokeStyle = 'rgba(1,28,60,0.9)';
                    c2.setLineDash([5, 3]);
                    c2.stroke();
                    c2.setLineDash([]);
                    c2.restore();
                };
                // Hit-testing is done in SCREEN space: everything ends up on the same
                // canvas, so projecting each item through ITS OWN grid and the lasso
                // through the main grid puts them in one comparable space. SP holds the
                // lasso as screen points (filled in on mouse-up).
                let SP = [];
                const inside = (px, py) => {
                    let c = false;
                    for (let i = 0, j = SP.length - 1; i < SP.length; j = i++) {
                        const xi = SP[i].x, yi = SP[i].y, xj = SP[j].x, yj = SP[j].y;
                        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) c = !c;
                    }
                    return c;
                };
                // Project a point through the given grid to screen, then test the loop.
                // Layer items are drawn with layer.tgraph.X(x) directly (already
                // screen), so this single projection matches them.
                const screenHit = (grid, gx, vy) => {
                    let sx, sy;
                    try { sx = grid.X(gx); sy = grid.Y(vy != null ? vy : 0.5); } catch (e) { return false; }
                    return inside(sx, sy);
                };
                // Track items (annotations/SNPs) are drawn as graph.X(tgraph.X(x)) —
                // a DOUBLE projection — so hit-test them the same way.
                const trackHit = (t, gx, vy) => {
                    let sx, sy;
                    try { sx = this.graph.X(t.tgraph.X(gx)); sy = this.graph.Y(t.tgraph.Y(vy != null ? vy : 0)); } catch (e) { return false; }
                    return inside(sx, sy);
                };
                // `armed` becomes true only on a real canvas mouse-DOWN that starts a
                // lasso — the mouse-UP that ends the button click itself happens before
                // any such press, so it's ignored and lasso mode stays active.
                let armed = false;
                this.addMouseDownListener((x, y) => {
                    this.md = true; armed = true; pts.length = 0;
                    anchor = { x, y };
                    pts.push({ x, y });
                });
                this.addMouseMoveListener((x, y) => {
                    if (!this.md) return;
                    if (rect) {
                        // Four corners from the two the user has given, replaced each move so
                        // the box follows the cursor instead of trailing behind it.
                        pts.length = 0;
                        pts.push({ x: anchor.x, y: anchor.y }, { x: x, y: anchor.y },
                            { x: x, y: y }, { x: anchor.x, y: y });
                        return;
                    }
                    pts.push({ x, y });
                });
                this.addMouseUpListener((x, y) => {
                    if (!armed) return;   // ignore the lasso-button click's own release
                    this.md = false;
                    let n = 0;
                    if (pts.length >= 3) {
                        SP = pts.map((p) => ({ x: this.graph.X(p.x), y: this.graph.Y(p.y) }));
                        this.clearSelectionVisuals();   // reset the previous selection first
                        const HL = '#c0392b';
                        const sel = [];   // labels of selected items, for the info panel
                        for (const t of (this.track || [])) {
                            if (!t.tgraph) continue;

                            // If the lasso encloses this track's ENTIRE on-screen box, select
                            // the track itself too (in addition to any items inside it). Box +
                            // corner projection mirror getTrack()'s hit-box.
                            try {
                                const _scx = this.graph.X(t.tgraph.xi);
                                const _scy = this.graph.Y(t.tgraph.yi);
                                const _scw = this.graph.screenWidth(t.tgraph.width);
                                const _sch = -1 * this.graph.screenHeight(t.tgraph.height);
                                const _xR = _scx + _scw, _yB = _scy + _sch;
                                if (isFinite(_scx) && isFinite(_scy) && isFinite(_xR) && isFinite(_yB) &&
                                    inside(_scx, _scy) && inside(_xR, _scy) &&
                                    inside(_scx, _yB) && inside(_xR, _yB)) {
                                    try { if (t.select) t.select(); } catch (e) { }
                                    sel.push({ kind: 'track', label: (t.name || 'track'), track: t, chr: t.chr, xi: t.xi, xf: t.xf, ref: t });
                                    n++;
                                }
                            } catch (e) { }

                            for (const a of (t.annotations || [])) {
                                if (trackHit(t, (a.xi + a.xf) / 2, a.y != null ? a.y : 0)) {
                                    if (a.select) a.select();
                                    sel.push({ kind: 'ann', label: (a.name || a.type || 'annotation'), track: t, chr: t.chr, xi: a.xi, xf: a.xf, ref: a });
                                    n++;
                                }
                            }
                            for (const s of (t.snpindels || [])) {
                                // SNPs draw as lollipops whose head sits on a tall stem far from the
                                // world point (s.xi, s.y) at the track baseline. Test the drawn head's
                                // SCREEN rect (set by snpindel.js draw() / drawSnpLollipopsWide) so the
                                // lasso catches the visible marker; fall back to the world projection.
                                let __snpHit = false;
                                const __hs = s._hitScreen;
                                if (__hs && isFinite(__hs.x) && isFinite(__hs.y)) {
                                    const __cx = __hs.x + (__hs.w || 0) / 2, __cy = __hs.y + (__hs.h || 0) / 2;
                                    __snpHit = inside(__cx, __cy)
                                        || inside(__hs.x, __hs.y) || inside(__hs.x + (__hs.w || 0), __hs.y)
                                        || inside(__hs.x, __hs.y + (__hs.h || 0)) || inside(__hs.x + (__hs.w || 0), __hs.y + (__hs.h || 0));
                                }
                                if (!__snpHit) __snpHit = trackHit(t, s.xi, s.y != null ? s.y : 0);
                                if (__snpHit) {
                                    s.highlight = true;
                                    sel.push({ kind: 'snp', label: (s.id || s.name || ('snp@' + s.xi)) + (s.clinsig ? ' · ' + s.clinsig : ''), track: t, chr: t.chr, xi: s.xi, xf: (s.xf != null ? s.xf : s.xi), ref: s, clinsig: s.clinsig });
                                    n++;
                                }
                            }
                            for (const o of (t.oligos || [])) {
                                // Amplicon objects live in t.oligos with type==='amplicon'.
                                // Their true span is [left.xi, right.xf] — o.xf is NOT the
                                // real right edge (Amplicon.xf = right.xi + right.xf, unused
                                // by the draw), so hit-testing (o.xi+o.xf)/2 lands off to the
                                // right and misses. Use the drawn span for amplicons.
                                const isAmp = (o.type === 'amplicon' && o.left && o.right);
                                const gxi = isAmp ? +o.left.xi : +o.xi;
                                const gxf = isAmp ? +o.right.xf : +o.xf;
                                if (!isFinite(gxi) || !isFinite(gxf)) continue;
                                if (trackHit(t, (gxi + gxf) / 2, o.y != null ? o.y : 0)) {
                                    const origHi = o.highlight__;
                                    o.highlight__ = isAmp ? 'cyan' : '#ff8c42';   // tropical orange
                                    sel.push({ kind: isAmp ? 'amplicon' : 'oligo', label: (o.name || o.id || (isAmp ? 'amplicon' : 'oligo')), track: t, chr: t.chr, xi: gxi, xf: gxf, ref: o, origHighlight: origHi, inOligos: true });
                                    n++;

                                    // THE PRIMERS THEMSELVES, as their own rows.
                                    //
                                    // An amplicon's forward and reverse primers are amp.left and
                                    // amp.right -- they are not in t.oligos, so the loop above
                                    // never saw them and the selection window offered the
                                    // amplicon with no way to reach either end of it. Selecting
                                    // an amplicon selects the pair; these make each one openable.
                                    //
                                    // Filed under kind 'oligo' rather than a kind of their own:
                                    // a primer IS an oligo, and everything the window already
                                    // does for one -- the per-item menu, sequence export,
                                    // restoring the highlight on deselect -- then applies
                                    // without a dozen call sites learning a new word.
                                    if (isAmp) {
                                        for (const side of [['forward', o.left], ['reverse', o.right]]) {
                                            const pr = side[1];
                                            if (!pr) continue;
                                            const a = +pr.xi, b = +pr.xf;
                                            if (!isFinite(a) || !isFinite(b)) continue;
                                            const pHi = pr.highlight__;
                                            pr.highlight__ = '#ff8c42';
                                            // syncSelectionWindow drops an oligo row whose object
                                            // is not selected, so say that it is.
                                            try { pr.selected = true; } catch (e) { }
                                            sel.push({
                                                kind: 'oligo',
                                                label: (o.name || o.id || 'amplicon') + ' · ' + side[0] + ' primer',
                                                track: t, chr: t.chr,
                                                xi: Math.min(a, b), xf: Math.max(a, b),
                                                ref: pr, origHighlight: pHi, isPrimer: true
                                            });
                                            n++;
                                        }
                                    }
                                }
                            }
                            // Amplicons — same source(s) and row layout as the draw:
                            // rows are 0.1 + i*0.075, positioned via the double
                            // projection (drawLine applies grid.X/Y).
                            const ampRaw = t.ampliconResults || t.primerAmpliconResults || t.ctModelAmplicons || t.primer3Hits || t.amplicon_hits;
                            let ampHits = [];
                            if (Array.isArray(ampRaw)) ampHits = ampRaw;
                            else if (ampRaw && Array.isArray(ampRaw.hits)) ampHits = ampRaw.hits;
                            else if (ampRaw && Array.isArray(ampRaw.results)) ampHits = ampRaw.results;
                            const ampMax = Math.min(12, ampHits.length);   // only the drawn rows
                            for (let ai = 0; ai < ampMax; ai++) {
                                const h = ampHits[ai];
                                if (!h) continue;
                                const a0 = +h.amp_start, a1 = +h.amp_end;
                                if (!isFinite(a0) || !isFinite(a1) || a1 <= a0) continue;
                                const cx = (a0 + a1) / 2;
                                // The row y is used two ways in the codebase: the plain
                                // draw (0.1 + i*0.075) and the hit-box geometry (with a
                                // -2*yi offset). Test both so we match whichever renders.
                                const vy1 = 0.1 + ai * 0.075;
                                let vy2 = vy1;
                                try { vy2 = t.tgraph.Ywc(t.tgraph.Y(vy1) - 2 * t.tgraph.yi); } catch (e) { }
                                if (trackHit(t, cx, vy1) || trackHit(t, cx, vy2)) {
                                    const origHi = h.__lassoHi;
                                    h.__lassoHi = HL;
                                    sel.push({ kind: 'amplicon', label: (h.name || h.id || ('amplicon ' + Math.round(a0) + '-' + Math.round(a1))), track: t, chr: t.chr, xi: a0, xf: a1, ref: h, ampArr: ampHits, origHighlight: origHi });
                                    n++;
                                }
                            }
                            // Only the INDIVIDUAL layer items inside the loop — projected
                            // through the LAYER's own grid, not the track's.
                            for (const layer of (t.track_layers || [])) {
                                if (!layer || !layer.tgraph) continue;
                                if (Array.isArray(layer.intervals)) {
                                    for (const iv of layer.intervals) {
                                        if (iv && screenHit(layer.tgraph, (iv.x1 + iv.x2) / 2, iv.y)) {
                                            const origColor = iv.color;
                                            iv.color = HL;
                                            sel.push({ kind: 'layer', label: (iv.t || layer.name || 'interval'), track: t, chr: t.chr, xi: iv.x1, xf: iv.x2, ref: iv, layer: layer, origColor: origColor });
                                            n++;
                                        }
                                    }
                                }
                                if (Array.isArray(layer.pts)) {
                                    for (const p of layer.pts) {
                                        if (p && screenHit(layer.tgraph, p.x, p.y)) {
                                            const origColor = p.color, origHighlight = !!p.highlight;
                                            p.color = HL; p.highlight = true;
                                            sel.push({ kind: 'layer', label: (layer.name || 'point'), track: t, chr: t.chr, xi: p.x, xf: p.x, ref: p, layer: layer, origColor: origColor, origHighlight: origHighlight });
                                            n++;
                                        }
                                    }
                                }
                            }
                        }
                        this.__lassoSelection = sel;   // rendered under the info panel
                        // Spotlight: if the lasso caught any SNP, activate the spotlight so the
                        // selected mutations pop and every other mutation goes transparent (read by
                        // snpindel.js draw() / drawSnpLollipopsWide). No SNPs → leave it off.
                        this.__snpSelectionActive = sel.some((e) => e && e.kind === 'snp');
                        // Auto-open the info/selection window so the new selection is
                        // visible without having to toggle the info button first.
                        if (sel.length) this.showDisplay = true;
                    }
                    this.setMessage(' Lasso selected ' + n + ' item(s).');
                    pts.length = 0;
                    this.post_graphics_modifications = null;
                    // Leave lasso mode immediately so hover's mode-guard unblocks...
                    this.graph.mode = 'navigate';
                    // ...but defer re-installing the mouse-over hover handler until this
                    // mouse-up has fully unwound. setMouseMode -> clearMouseListeners
                    // wipes and re-execs mouse-over-highlight; doing that mid-dispatch
                    // (we're inside a mouseUp listener) drops the freshly-added hover
                    // listeners, so the hover never comes back until the next mode change.
                    setTimeout(() => { try { this.setMouseMode('navigate'); } catch (e) { } }, 0);
                    if (this.wake) this.wake();
                });
            }

            // Draws a highlight ring around the hovered control button and a small
            // dark tooltip with its description. Called after the buttons are drawn.
            drawControlButtonHover(ctx) {
                if (!this.hoverButton) return;
                const b = this.controlButtonDefs().find(d => d.id === this.hoverButton);
                if (!b) return;

                const r = 11;
                ctx.save();
                this.resetCanvasEffects(ctx);

                // Accent highlight ring around the hovered button
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#2f6feb";
                this.roundRectPath(ctx, b.cx - r, b.cy - r, r * 2, r * 2, Math.max(3, r * 0.38));
                ctx.stroke();

                // Tooltip to the right of the button
                const text = b.info;
                ctx.font = "600 11px Arial";
                const padX = 8;
                const bh = 22;
                const tw = ctx.measureText(text).width;
                const bx = b.cx + r + 10;
                const by = b.cy - bh / 2;
                const bw = tw + padX * 2;

                // Tooltip background (rounded, soft shadow)
                ctx.shadowColor = "rgba(16,24,40,0.20)";
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = "rgba(33,43,54,0.96)";
                this.roundRectPath(ctx, bx, by, bw, bh, 5);
                ctx.fill();

                // Little pointer triangle toward the button
                this.resetCanvasEffects(ctx);
                ctx.beginPath();
                ctx.moveTo(bx, b.cy - 4);
                ctx.lineTo(bx - 5, b.cy);
                ctx.lineTo(bx, b.cy + 4);
                ctx.closePath();
                ctx.fillStyle = "rgba(33,43,54,0.96)";
                ctx.fill();

                // Tooltip text
                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillText(text, bx + padX, b.cy);

                ctx.restore();
            }

            // ---- Control-button icon primitives (vector, drawn on the canvas) ----------------
            _iconStroke(ctx, color) {
                this.resetCanvasEffects(ctx);
                ctx.strokeStyle = color || '#475467';
                ctx.fillStyle = color || '#475467';
                ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            }
            // Magnifying glass with a + (sign>0) or – (sign<=0) inside — zoom in / out.
            _iconMagnifier(ctx, cx, cy, sign, color) {
                ctx.save(); this._iconStroke(ctx, color);
                const gr = 4.3, gx = cx - 1.6, gy = cy - 1.8;
                ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.stroke();     // glass
                ctx.beginPath(); ctx.moveTo(gx + gr * 0.72, gy + gr * 0.72); ctx.lineTo(cx + 5, cy + 4.6); ctx.stroke();   // handle
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(gx - 2.1, gy); ctx.lineTo(gx + 2.1, gy);                     // – always
                if (sign > 0) { ctx.moveTo(gx, gy - 2.1); ctx.lineTo(gx, gy + 2.1); }   // + adds vertical
                ctx.stroke();
                ctx.restore();
            }
            // 4-way arrows — pan / move.
            _iconMove(ctx, cx, cy, color) {
                ctx.save(); this._iconStroke(ctx, color);
                const a = 6.5, h = 2.6;
                ctx.beginPath();
                ctx.moveTo(cx, cy - a); ctx.lineTo(cx, cy + a);
                ctx.moveTo(cx - a, cy); ctx.lineTo(cx + a, cy);
                ctx.moveTo(cx - h, cy - a + h); ctx.lineTo(cx, cy - a); ctx.lineTo(cx + h, cy - a + h);   // up
                ctx.moveTo(cx - h, cy + a - h); ctx.lineTo(cx, cy + a); ctx.lineTo(cx + h, cy + a - h);   // down
                ctx.moveTo(cx - a + h, cy - h); ctx.lineTo(cx - a, cy); ctx.lineTo(cx - a + h, cy + h);   // left
                ctx.moveTo(cx + a - h, cy - h); ctx.lineTo(cx + a, cy); ctx.lineTo(cx + a - h, cy + h);   // right
                ctx.stroke();
                ctx.restore();
            }
            // Paired arrows along an axis, pointing OUT (expand) or IN (contract).
            _iconResize(ctx, cx, cy, axis, outward, color) {
                ctx.save(); this._iconStroke(ctx, color);
                const far = 6.5, near = 2.2, h = 2.6;
                ctx.beginPath();
                if (axis === 'v') {
                    ctx.moveTo(cx, cy - far); ctx.lineTo(cx, cy - near);
                    ctx.moveTo(cx, cy + far); ctx.lineTo(cx, cy + near);
                    if (outward) {
                        ctx.moveTo(cx - h, cy - far + h); ctx.lineTo(cx, cy - far); ctx.lineTo(cx + h, cy - far + h);
                        ctx.moveTo(cx - h, cy + far - h); ctx.lineTo(cx, cy + far); ctx.lineTo(cx + h, cy + far - h);
                    } else {
                        ctx.moveTo(cx - h, cy - near - h); ctx.lineTo(cx, cy - near); ctx.lineTo(cx + h, cy - near - h);
                        ctx.moveTo(cx - h, cy + near + h); ctx.lineTo(cx, cy + near); ctx.lineTo(cx + h, cy + near + h);
                    }
                } else {
                    ctx.moveTo(cx - far, cy); ctx.lineTo(cx - near, cy);
                    ctx.moveTo(cx + far, cy); ctx.lineTo(cx + near, cy);
                    if (outward) {
                        ctx.moveTo(cx - far + h, cy - h); ctx.lineTo(cx - far, cy); ctx.lineTo(cx - far + h, cy + h);
                        ctx.moveTo(cx + far - h, cy - h); ctx.lineTo(cx + far, cy); ctx.lineTo(cx + far - h, cy + h);
                    } else {
                        ctx.moveTo(cx - near - h, cy - h); ctx.lineTo(cx - near, cy); ctx.lineTo(cx - near - h, cy + h);
                        ctx.moveTo(cx + near + h, cy - h); ctx.lineTo(cx + near, cy); ctx.lineTo(cx + near + h, cy + h);
                    }
                }
                ctx.stroke();
                ctx.restore();
            }

            drawZoomButton(ctx) {
                if (this.bclick === "zoom_in") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('zoom_in');
                this.drawCircleButton(ctx, cx, cy, 11, { invert: true });

                this._iconMagnifier(ctx, cx, cy, 1, "#ffffff");   // magnifier with +

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Zoom In", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawZoomOutButton(ctx) {
                if (this.bclick === "zoom_out") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('zoom_out');
                this.drawCircleButton(ctx, cx, cy, 11, { invert: true });

                this._iconMagnifier(ctx, cx, cy, -1, "#ffffff");   // magnifier with –

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

                const { cx, cy } = this._ctrlPos('navigate');
                this.drawCircleButton(ctx, cx, cy, 11, { invert: true });

                this._iconMove(ctx, cx, cy, "#ffffff");   // 4-way pan arrows

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Move the graph", cx + 20, cy, {
                        font: "11px Arial",
                        color: "#475467",
                    });
                }
            }

            drawBoxButton(ctx) {
                if (this.bclick === "bpx") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('bpx');
                const r = 11;
                this.drawCircleButton(ctx, cx, cy, r, { invert: true });

                const scale = 0.62;
                const side = r * Math.sqrt(2) * scale;
                const halfSide = side / 2;

                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.setLineDash([2.5, 2]);
                ctx.beginPath();
                ctx.rect(cx - halfSide, cy - halfSide, side, side);
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.setLineDash([]);
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

                const { cx, cy } = this._ctrlPos('expand_vertical');
                this.drawCircleButton(ctx, cx, cy, 11, { invert: true });

                this._iconResize(ctx, cx, cy, 'v', true, "#ffffff");   // vertical arrows OUT

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Expand Vertical", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawContractVerticalButton(ctx) {
                if (this.bclick === "contract_vertical") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('contract_vertical');
                this.drawCircleButton(ctx, cx, cy, 11, { invert: true });

                this._iconResize(ctx, cx, cy, 'v', false, "#ffffff");   // vertical arrows IN

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Contract Vertical", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawExpandHorizontalButton(ctx) {
                if (this.bclick === "expand_horizontal") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('expand_horizontal');
                this.drawCircleButton(ctx, cx, cy, 11, { invert: true });

                this._iconResize(ctx, cx, cy, 'h', true, "#ffffff");   // horizontal arrows OUT

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Expand Horizontal", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawContractHorizontalButton(ctx) {
                if (this.bclick === "contract_horizontal") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('contract_horizontal');
                this.drawCircleButton(ctx, cx, cy, 11, { invert: true });

                this._iconResize(ctx, cx, cy, 'h', false, "#ffffff");   // horizontal arrows IN

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Contract Horizontal", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawLassoButton(ctx) {
                if (this.bclick === "lasso") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('lasso');
                this.drawCircleButton(ctx, cx, cy, 11, { circle: true, invert: true });

                // A little dashed loop with a tail — the "lasso" glyph (light on the
                // inverted tropical fill).
                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.4;
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.ellipse(cx, cy - 1, 5.5, 4, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(cx - 3, cy + 3);
                ctx.lineTo(cx - 5.5, cy + 6.5);
                ctx.stroke();
                ctx.restore();

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Lasso select", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawSelectSeqButton(ctx) {
                if (this.bclick === "select_seq") return;

                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('select_seq');
                this.drawCircleButton(ctx, cx, cy, 11, { circle: true, invert: true });

                // An I-beam over a short baseline of "bases" — the select-sequence
                // glyph (light on the inverted tropical fill).
                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.4;
                // I-beam caret
                ctx.beginPath();
                ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 3);
                ctx.moveTo(cx - 2.5, cy - 5); ctx.lineTo(cx + 2.5, cy - 5);
                ctx.moveTo(cx - 2.5, cy + 3); ctx.lineTo(cx + 2.5, cy + 3);
                ctx.stroke();
                // sequence baseline ticks
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(cx - 5.5, cy + 6); ctx.lineTo(cx + 5.5, cy + 6);
                ctx.stroke();
                ctx.restore();

                if (this.showHelp) {
                    this.drawButtonLabel(ctx, "Select sequence", cx + 20, cy, { font: "11px Arial" });
                }
            }

            drawInfoButton(ctx) {
                this.setButtonStyle(ctx, { font: "600 12px Arial" });

                const { cx, cy } = this._ctrlPos('info');
                this.drawCircleButton(ctx, cx, cy, 11, { circle: true, invert: true });

                // White inner ring when the info panel is currently showing.
                if (this.showDisplay) {
                    ctx.save();
                    this.resetCanvasEffects(ctx);
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 7.5, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                // Light glyph on the inverted tropical fill.
                this.drawButtonGlyph(ctx, "i", cx, cy, {
                    font: "700 13px Georgia",
                    color: "#ffffff",
                });
            }

            // One-time onboarding hint: an arced arrow from a tropical label pointing at
            // the selection window (top-left info panel), shown for ~10s the first time a
            // track lands on a blank canvas. Fades in/out; self-clears when expired.
            drawSelectionHint(ctx) {
                if (!this.__selHintUntil) return;
                const remain = this.__selHintUntil - Date.now();
                if (remain <= 0) { this.__selHintUntil = 0; return; }
                const b = this.__infoPanelBounds;
                if (!b) return;

                // fade in (first 300ms) / hold / fade out (last 1200ms)
                const elapsed = 10000 - remain;
                let alpha = 1;
                if (elapsed < 300) alpha = elapsed / 300;
                else if (remain < 1200) alpha = remain / 1200;
                alpha = Math.max(0, Math.min(1, alpha));

                const ORANGE = '#ff8c1a', ORANGE2 = '#ff6f3c', CYAN = '#12c2e0', INK = '#08313a';
                const msg = 'Selection window';

                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                // Label bubble below-right of the panel.
                ctx.font = '600 13px Arial';
                const tw = ctx.measureText(msg).width;
                const padX = 12, bh = 30;
                const bw = tw + padX * 2;
                const bx = b.x + 24;
                const by = b.y + b.h + 88;
                const r = 10;
                const rr = (x, y, w, h, rad) => {
                    ctx.beginPath();
                    ctx.moveTo(x + rad, y);
                    ctx.arcTo(x + w, y, x + w, y + h, rad);
                    ctx.arcTo(x + w, y + h, x, y + h, rad);
                    ctx.arcTo(x, y + h, x, y, rad);
                    ctx.arcTo(x, y, x + w, y, rad);
                    ctx.closePath();
                };

                // Arced arrow: from the bubble's top up-left to the panel's bottom edge.
                const sx = bx + 34, sy = by;                         // arc start (at bubble)
                const tipX = b.x + b.w * 0.55, tipY = b.y + b.h + 6; // arrow tip (at panel)
                const c1x = sx - 46, c1y = sy - 18;
                const c2x = tipX + 46, c2y = tipY + 52;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
                ctx.lineWidth = 3;
                ctx.strokeStyle = ORANGE;
                ctx.shadowColor = 'rgba(18,194,224,0.55)';
                ctx.shadowBlur = 8;
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Arrowhead at the tip (pointing toward the panel).
                const ang = Math.atan2(tipY - c2y, tipX - c2x);
                const ah = 12;
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(tipX - ah * Math.cos(ang - 0.42), tipY - ah * Math.sin(ang - 0.42));
                ctx.lineTo(tipX - ah * Math.cos(ang + 0.42), tipY - ah * Math.sin(ang + 0.42));
                ctx.closePath();
                ctx.fillStyle = ORANGE;
                ctx.fill();

                // Bubble.
                rr(bx, by, bw, bh, r);
                const g = ctx.createLinearGradient(bx, by, bx, by + bh);
                g.addColorStop(0, ORANGE); g.addColorStop(1, ORANGE2);
                ctx.fillStyle = g;
                ctx.shadowColor = 'rgba(18,194,224,0.5)';
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = CYAN;
                ctx.stroke();
                ctx.fillStyle = INK;
                ctx.fillText(msg, bx + padX, by + bh / 2 + 0.5);

                ctx.restore();
            }

            // Info panel (tracks/oligos/chem) + lasso selection list. Called at the
            // very END of redraw so both cards render ABOVE tracks, layers and buttons.
            drawInfoPanel(ctx) {
                if (!this.showDisplay || !this.track || !this.track.length) return;
                let ocount = 0;
                for (const t of this.track) { if (t.oligos) ocount += t.oligos.length; }

                ctx.save();
                this.resetCanvasEffects(ctx);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                // Inverted tropical scheme — matches the info button that toggles this
                // panel (navy -> cyan fill, cyan border, light text).
                const TXT_MUTED = '#9db8c9';   // labels
                const TXT_MAIN = '#eef6f9';    // values / item labels
                const TXT_ACCENT = '#4fd0e6';  // headers / highlights
                const PANEL_BORDER = '#1aa3bd';
                const paintCard = (x, y, w, h) => {
                    // Demo-panel look-and-feel (manchester/demo.js): solid navy, a subtle light
                    // border, a soft deep shadow and a 12px radius.
                    ctx.shadowColor = 'rgba(0,0,0,0.45)';
                    ctx.shadowBlur = 20;
                    ctx.shadowOffsetY = 8;
                    ctx.fillStyle = '#0b2545';
                    this.roundRectPath(ctx, x, y, w, h, 12);
                    ctx.fill();
                    this.resetCanvasEffects(ctx);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
                    this.roundRectPath(ctx, x, y, w, h, 12);
                    ctx.stroke();
                };

                // Total variants (SNVs/indels) across all tracks — shown as a stat row.
                const varCount = (this.track || []).reduce((n, t) => n + ((t && t.snpindels || []).length), 0);

                const rows = [
                    { label: 'Tracks', value: String(this.track.length) },
                    { label: 'Oligos', value: String(ocount) },
                    { label: 'Variants', value: String(varCount) },
                ];

                const LABEL_FONT = '600 10px Arial';
                const VALUE_FONT = '700 10px Arial';

                ctx.font = VALUE_FONT;
                let maxValW = 0;
                for (const r of rows) maxValW = Math.max(maxValW, ctx.measureText(r.value).width);

                // Install a raw pointer listener once — records the live mouse position in
                // canvas-pixel space directly from the DOM event (independent of the graph's
                // hover listeners) and wakes the renderer so the Pos row updates live.
                if (!this.__ptrListenerInstalled) {
                    try {
                        const el = this.graph && this.graph.canvas && this.graph.canvas.canvas && this.graph.canvas.canvas.nativeElement;
                        if (el && el.addEventListener) {
                            this.__ptrListenerInstalled = true;
                            const self = this;
                            el.addEventListener('mousemove', (e) => {
                                try {
                                    const rect = el.getBoundingClientRect();
                                    self.__ptrpx = {
                                        sx: (e.clientX - rect.left) * (el.width / (rect.width || 1)),
                                        sy: (e.clientY - rect.top) * (el.height / (rect.height || 1))
                                    };
                                    if (self.wake) self.wake();
                                } catch (err) { }
                            }, { passive: true });
                            el.addEventListener('mouseleave', () => { self.__ptrpx = null; if (self.wake) self.wake(); }, { passive: true });
                        }
                    } catch (e) { }
                }

                // Current mouse position (cDNA/genomic) from the live canvas-pixel pointer.
                // Local/cDNA index = tgraph.Xwc(sx) - track.xi (track.xi is the genomic start,
                // matching getHighlightedSequence's markstart - xi); genomic via genomicAt.
                let hoverStr = '';
                try {
                    const p = this.__ptrpx;
                    if (p) {
                        const sx = p.sx, sy = p.sy;
                        for (let i = 0; i < this.track.length; i++) {
                            const t = this.track[i];
                            const tsx = this.graph.X(t.tgraph.xi);
                            const tsy = this.graph.Y(t.tgraph.yi);
                            const tsw = this.graph.screenWidth(t.tgraph.width);
                            const tsh = -1 * this.graph.screenHeight(t.tgraph.height);
                            if (sy > tsy && sy < tsy + tsh + 40 && sx > tsx && sx < tsx + tsw + 40) {
                                // Screen pixel -> grid world -> track world index, exactly as
                                // getVisibleTrackRange: tgraph.Xwc(graph.Xwc(sx) - 2*tgraph.xi).
                                const world = t.tgraph.Xwc(this.graph.Xwc(sx) - 2 * t.tgraph.xi);
                                let idx = Math.floor(world) - Math.floor(t.xi);
                                if (t.sequence) idx = Math.max(0, Math.min(idx, t.sequence.length - 1));
                                let gpos = (t.genomicAt ? t.genomicAt(idx) : null);
                                if (gpos == null) gpos = Math.floor(world);
                                // c. counts with transcript orientation (- strand reversed).
                                const __minus = (t.strand === -1 || t.strand === "-1" || t.strand === '-');
                                const cVal = __minus ? (Math.round(t.tgraph.xmax - Math.floor(world)) + 1) : (idx + 1);
                                hoverStr = 'c.' + cVal + '   g.' + gpos;
                                break;
                            }
                        }
                    }
                } catch (e) { }
                const hasHover = !!hoverStr;
                if (hasHover) { ctx.font = VALUE_FONT; maxValW = Math.max(maxValW, ctx.measureText(hoverStr).width); }

                const panelX = 8, panelY = 8;
                const padX = 10, padY = 8;
                const rowH = 16;
                const labelColW = 44;
                const panelW = padX * 2 + labelColW + maxValW + 6;
                // Reserve rows + Pos so the layout never jumps.
                const panelH = padY * 2 + rowH * (rows.length + 1);

                paintCard(panelX, panelY, panelW, panelH);
                // Remember the stats card so a click on it opens the info menu.
                this.__infoPanelBounds = { x: panelX, y: panelY, w: panelW, h: panelH };

                const lx = panelX + padX;
                const vx = panelX + padX + labelColW;
                let ry = panelY + padY + rowH / 2;

                for (const r of rows) {
                    ctx.font = LABEL_FONT; ctx.fillStyle = TXT_MUTED;
                    ctx.fillText(r.label, lx, ry);
                    ctx.font = VALUE_FONT; ctx.fillStyle = TXT_MAIN;
                    ctx.fillText(r.value, vx, ry);
                    ry += rowH;
                }

                // Current mouse position. The row is always reserved; the value shows only
                // when the cursor is over a track, otherwise a muted placeholder.
                ctx.font = LABEL_FONT; ctx.fillStyle = TXT_MUTED;
                ctx.fillText('Pos', lx, ry);
                if (hasHover) {
                    ctx.font = VALUE_FONT; ctx.fillStyle = '#ffffff';
                    ctx.fillText(hoverStr, vx, ry);
                } else {
                    ctx.font = VALUE_FONT; ctx.fillStyle = TXT_MUTED;
                    ctx.fillText('—', vx, ry);
                }

                // ---- Lasso selection list, below the panel ----
                // A sequence selection is shown here too, so the panel reflects everything the
                // user currently has selected rather than only lasso-picked objects. Derived
                // from markstart/markend each frame instead of being pushed into
                // __lassoSelection, because the selection is edited continuously by dragging an
                // arrow head — a stored copy would go stale on every mouse move.
                let selList = this.__lassoSelection;
                try {
                    const seqEntries = [];
                    for (const t of (this.track || [])) {
                        if (!t || t.markstart == null || t.markend == null) continue;
                        if (!(t.markstart >= 0 && t.markend > t.markstart)) continue;
                        const toW = (m) => (m != null && t.xi != null && m < t.xi) ? (t.xi + m) : m;
                        const a = Math.floor(toW(t.markstart)), b = Math.ceil(toW(t.markend));
                        seqEntries.push({
                            kind: 'sequence',
                            label: (t.name || 'track') + ' ' + a + '–' + b + ' (' + Math.max(0, b - a) + ' nt)',
                            track: t, ref: t
                        });
                    }
                    if (seqEntries.length) selList = (selList || []).concat(seqEntries);
                } catch (e) { }
                this.__selPanelBounds = null;
                this.__selPanelRows = null;
                if (selList && selList.length) {
                    // Show only DISTINCT items (by kind + label); duplicates are collapsed
                    // and noted with a ×N count.
                    const distinct = [];
                    const byKey = new Map();
                    for (const it of selList) {
                        const label = '' + (it.label || '');
                        const key = (it.kind || '') + '|' + label;
                        let e = byKey.get(key);
                        // `src` is the selection entry this row stands for. The card is a MENU:
                        // clicking a row opens that object's own tree, so each row has to carry
                        // the object it represents, not just its label.
                        if (!e) { e = { kind: it.kind, label: label, count: 0, src: it }; byKey.set(key, e); distinct.push(e); }
                        e.count++;
                    }

                    // COMPOUNDS ARE PACKAGED INTO ONE ROW.
                    //
                    // A lasso across a designed region catches every oligo under it, and listing
                    // each one turned the card into a column of near-identical ids with the other
                    // selected things pushed off the bottom. One row says how many were caught and
                    // opens the compounds branch, which groups them by type and can be searched.
                    // Annotations get the same treatment for the same reason.
                    {
                        const packed = [];
                        const groups = { oligo: [], ann: [] };
                        for (const e of distinct) {
                            const g = (e.kind === 'oligo' || e.kind === 'amplicon') ? 'oligo'
                                : (e.kind === 'ann' ? 'ann' : null);
                            if (g) groups[g].push(e); else packed.push(e);
                        }
                        const total = (arr) => arr.reduce((n, e) => n + (e.count || 1), 0);
                        if (groups.oligo.length) {
                            packed.unshift({
                                kind: 'oligo', count: 0,
                                label: 'Compounds (' + total(groups.oligo) + ')',
                                src: { __group: 'compounds' }
                            });
                        }
                        if (groups.ann.length) {
                            packed.unshift({
                                kind: 'ann', count: 0,
                                label: 'Annotations (' + total(groups.ann) + ')',
                                src: { __group: 'annotations' }
                            });
                        }
                        distinct.length = 0;
                        for (const e of packed) distinct.push(e);
                    }
                    const maxItems = 12;
                    const shown = distinct.slice(0, maxItems);
                    const extra = distinct.length > maxItems ? 1 : 0;
                    const labelOf = (e) => e.label + (e.count > 1 ? '  ×' + e.count : '');

                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.font = '600 11.5px Arial';
                    // No header row: the card is purely per-row, so nothing but the rows
                    // themselves decides its width or its height.
                    let lw = 0;
                    for (const it of shown) lw = Math.max(lw, ctx.measureText('•  ' + labelOf(it)).width + 4);

                    // Row height is the click target. At 14px the rows were close enough
                    // together that picking the wrong one was easy -- and each row now opens a
                    // different menu tree, so a misclick costs a wrong menu rather than nothing.
                    // 22px is comfortable for a mouse without turning a ten-item selection into
                    // a full-height panel. The hit rects are built from this same constant, so
                    // the clickable area grows with what is drawn.
                    const lpadX = 10, lpadY = 8, lrowH = 22;
                    const lX = panelX;
                    const lY = panelY + panelH + 8;
                    const lW = Math.min(240, lw + lpadX * 2);
                    const lH = lpadY * 2 + lrowH * (shown.length + extra);
                    // Remember the box so a click can be tested against its rows.
                    this.__selPanelBounds = { x: lX, y: lY, w: lW, h: lH };

                    paintCard(lX, lY, lW, lH);

                    let ry2 = lY + lpadY + lrowH / 2;

                    const dotColor = { track: '#1d4ed8', ann: '#1aa3bd', snp: '#c0392b', oligo: '#ff8c42', amplicon: '#7c3aed', layer: '#a86b3e' };
                    ctx.font = '600 11.5px Arial';
                    // Per-ROW hit rects, rebuilt every frame alongside the drawing so they cannot
                    // drift from what is on screen. A click on a row opens THAT object's menu
                    // tree with the object as its root; a click anywhere else on the card opens
                    // the whole-selection menu.
                    const rows2 = [];
                    // Which row the pointer is over, taken from the live canvas-pixel pointer the
                    // card already uses for its Pos readout. Computed here rather than in a mouse
                    // handler so the highlight and the hit rects come from the same geometry and
                    // cannot disagree by a row.
                    let __hoverY = null;
                    try { const pp = this.__ptrpx; if (pp) __hoverY = { sx: pp.sx, sy: pp.sy }; } catch (e) { }
                    for (const it of shown) {
                        const rowTop = ry2 - lrowH / 2;
                        // Highlight the row under the cursor, so it reads as clickable.
                        const __over = !!(__hoverY && __hoverY.sx >= lX && __hoverY.sx <= lX + lW
                            && __hoverY.sy >= rowTop && __hoverY.sy <= rowTop + lrowH);
                        if (__over) {
                            ctx.fillStyle = 'rgba(255,255,255,0.10)';
                            ctx.fillRect(lX + 3, rowTop, lW - 6, lrowH);
                        }
                        ctx.fillStyle = dotColor[it.kind] || TXT_MAIN;
                        ctx.fillText('•', lX + lpadX, ry2);
                        ctx.fillStyle = TXT_MAIN;
                        let label = labelOf(it);
                        if (label.length > 30) label = label.slice(0, 29) + '…';
                        ctx.fillText(label, lX + lpadX + 12, ry2);
                        ctx.fillStyle = TXT_MUTED;
                        ctx.textAlign = 'right';
                        ctx.fillText('▸', lX + lW - lpadX, ry2);   // says the row opens something
                        ctx.textAlign = 'left';
                        rows2.push({ x: lX, y: rowTop, w: lW, h: lrowH, item: it });
                        ry2 += lrowH;
                    }
                    if (extra) {
                        ctx.fillStyle = TXT_MUTED;
                        ctx.fillText('+' + (distinct.length - maxItems) + ' more…', lX + lpadX, ry2);
                        // The overflow row is the one row that is not an object: it opens the
                        // full list. Marked so a click on it is told apart from a click on the
                        // card's padding, which now does nothing at all.
                        rows2.push({ x: lX, y: ry2 - lrowH / 2, w: lW, h: lrowH, item: { more: true } });
                    }
                    this.__selPanelRows = rows2;

                    // While a menu OPENED FROM THIS BOX is showing, blur the box itself. The menu
                    // is the box's contents expanded, so leaving both sharp reads as two competing
                    // panels; blurring the source makes the menu clearly the thing to look at and
                    // still shows what it came from. Only when the menu is EXPANDED — the
                    // collapsed pill obscures nothing, so blurring behind it would be noise.
                    try {
                        const m = this.side_menu;
                        const fromSel = !!(m && m.list && m.list.__fromSelection
                            && !(m.collapsible && m.collapsed));
                        if (fromSel) {
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(lX, lY, lW, lH);
                            ctx.clip();
                            // Blur the region by redrawing that slice of the canvas onto itself.
                            ctx.filter = 'blur(3px)';
                            ctx.drawImage(ctx.canvas, lX, lY, lW, lH, lX, lY, lW, lH);
                            ctx.filter = 'none';
                            ctx.fillStyle = 'rgba(8,22,38,0.30)';
                            ctx.fillRect(lX, lY, lW, lH);
                            ctx.restore();
                        }
                    } catch (e) { }
                }

                ctx.restore();
            }

            // Hover crosshair: a vertical line at the live pointer, labelled with the
            // c. (cDNA) + g. (genomic) position for every track the line crosses.
            drawHoverCrosshair(ctx) {
                const p = this.__ptrpx;
                if (!p || !this.track || !this.track.length) return;
                const sx = p.sx;
                const gh = (this.graph && this.graph.grid && this.graph.grid.height) || (ctx.canvas && ctx.canvas.height) || 0;
                ctx.save();
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(18,194,224,0.55)';
                ctx.beginPath();
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, gh);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.font = '600 11px "Segoe UI", system-ui, Arial, sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                for (const t of this.track) {
                    if (!t || !t.tgraph) continue;
                    // Clinical-compound tracks show no genomic/cDNA coordinate — skip the hover label.
                    if (t.track_type === 'clincial_compound' || t.track_type === 'clinical_compound') continue;
                    const tsx = this.graph.X(t.tgraph.xi);
                    const tsw = this.graph.screenWidth(t.tgraph.width);
                    if (sx < tsx || sx > tsx + tsw) continue;   // line not within this track's x-range
                    let world, idx, g, c;
                    try {
                        world = t.tgraph.Xwc(this.graph.Xwc(sx) - 2 * t.tgraph.xi);
                        idx = Math.floor(world) - Math.floor(t.xi);
                        if (t.sequence) idx = Math.max(0, Math.min(idx, t.sequence.length - 1));
                        g = (t.genomicAt ? t.genomicAt(idx) : null);
                        if (g == null) g = Math.floor(world);
                        const minus = (t.strand === -1 || t.strand === "-1" || t.strand === '-');
                        c = minus ? (Math.round(t.tgraph.xmax - Math.floor(world)) + 1) : (idx + 1);
                    } catch (e) { continue; }
                    const label = 'c.' + c + '  g.' + g;
                    const ty = this.graph.Y(t.tgraph.yi);
                    const tw = ctx.measureText(label).width;
                    const lx = sx + 6, ly = ty;
                    ctx.fillStyle = 'rgba(10, 37, 64, 0.25)';
                    ctx.fillRect(lx - 3, ly - 9, tw + 6, 18);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(label, lx, ly);
                }
                ctx.restore();
            }

            // Which ROW of the selection card is the given SCREEN point on?
            // Returns { item, y } — the row's entry AND its screen y, because the caller needs
            // the y to line the opened menu up with the row it came from. null for the card's
            // padding or a point outside the card.
            hitSelectionRow(xs, ys) {
                const rows = this.__selPanelRows;
                if (!rows || !rows.length || !this.hitSelectionPanel(xs, ys)) return null;
                for (const r of rows) {
                    if (xs >= r.x && xs <= r.x + r.w && ys >= r.y && ys <= r.y + r.h) {
                        return r.item ? { item: r.item, y: r.y } : null;
                    }
                }
                return null;
            }

            // Is the given SCREEN point on the selection list card?
            hitSelectionPanel(xs, ys) {
                const b = this.__selPanelBounds;
                if (!b || !this.showDisplay || !this.__lassoSelection || !this.__lassoSelection.length) return false;
                return xs >= b.x && xs <= b.x + b.w && ys >= b.y && ys <= b.y + b.h;
            }

            // Is the given SCREEN point on the top stats (Tracks/Oligos/Variants) card?
            hitInfoPanel(xs, ys) {
                const b = this.__infoPanelBounds;
                if (!b || !this.showDisplay) return false;
                return xs >= b.x && xs <= b.x + b.w && ys >= b.y && ys <= b.y + b.h;
            }

            // Menu opened by clicking the top stats card: view tracks, view/select
            // all oligos, and choose a chemistry.
            openInfoPanelMenu() {
                const close = () => { try { this.showSideMenu(null); } catch (e) { } };
                // Closing this menu to OPEN ANOTHER ONE is not the same as dismissing it: the
                // new menu is still derived from the selection, so the box should stay blurred
                // behind it. close() clears the chain (showSideMenu(null) does), so a handoff
                // re-opens it. Leaves that perform an ACTION rather than opening a menu keep
                // using plain close().
                const closeHandoff = () => { close(); try { this.__selMenuChain = true; } catch (e) { } };
                // 'Select…' as the chip label for every menu opened from the info panel. This
                // menu is how you pick what to work on -- tracks, oligos, variants, a sequence --
                // so naming it after that beats the fallbacks: it has no parent item to inherit
                // from, and a summary of its own entries said nothing about its purpose.
                const show = (list) => {
                    const b = this.__infoPanelBounds;
                    const anchor = b ? { x: b.x, y: b.y + b.h + 4 } : undefined;
                    this.showSideMenu(list, anchor, 'Select…');
                };
                const tracks = this.track || [];
                let oligoCount = 0;
                for (const t of tracks) if (t.oligos) oligoCount += t.oligos.length;

                // Classify oligos so we can offer selection by type when a mix of
                // siRNA (two-stranded) and ASO (single-stranded) is present.
                const isSiRNA = (o) => !!(o && (o.type === 'siRNA' || o.sense || o.guide));
                const isASO = (o) => !!(o && !isSiRNA(o) && o.type !== 'amplicon');
                let siRNACount = 0, asoCount = 0;
                for (const t of tracks) for (const o of (t.oligos || [])) {
                    if (isSiRNA(o)) siRNACount++; else if (isASO(o)) asoCount++;
                }
                const hasBothTypes = siRNACount > 0 && asoCount > 0;

                const openMain = () => show(buildMain());

                const centerTrack = (t) => {
                    try {
                        const tg = t.tgraph;
                        const m = Math.max(100, tg.width * 0.05);   // small horizontal margin
                        // Fit the ENTIRE track (full width) centered, framed vertically.
                        this.animateTo(tg.xi - m, tg.xi + tg.width + m, tg.Y(-3), tg.Y(3));
                    } catch (e) {
                        try { this.goToTrack(t); } catch (e2) { }
                    }
                };
                const openTracks = () => {
                    const sub = [];
                    // Same Mutations drilldown as the main menu, available here under Tracks too.
                    const mutCount = (this.track || []).reduce((n, t) => n + ((t && t.snpindels || []).length), 0);
                    sub.push({
                        label: 'Mutations (' + mutCount + ') ▸',
                        click: () => { closeHandoff(); try { Promise.resolve(exec('baja/manchester/menu/mutations-menu.js', this, this.genegraph_panel_layout)).catch(() => { }); } catch (e) { } },
                        move: () => { }
                    });
                    // Clicking a track centers it (as before) AND opens a child menu of that
                    // track's actions. Prefer the track's FULL menu (Layers / Variants / Design /
                    // …) stashed when it was interacted with on the canvas; otherwise a compact
                    // fallback built from the standalone per-track modules.
                    // Opening a track's entry just opens ITS MENU. It used to also centre/zoom the
                    // camera and select the whole track + sequence, so browsing the Tracks list
                    // moved the view and clobbered any selection the user already had — a
                    // destructive side effect of what reads as pure navigation. Centring is still
                    // available deliberately via the child menu's own "Center on track".
                    const openTrackChild = (t, i) => {
                        const back = { label: '‹ Back', click: () => { openTracks(); }, move: () => { } };
                        let stashed = null;
                        try { const e = (this.__lassoSelection || []).find((s) => s.kind === 'track' && s.ref === t); stashed = e && e.trackMenu; } catch (e) { }
                        // Centring is now something the user ASKS for, rather than a side effect of
                        // opening the menu. Offered in both child shapes so it is never lost.
                        const centerItem = {
                            label: 'Center on track',
                            click: () => { close(); centerTrack(t); },
                            move: () => { }
                        };
                        let child;
                        if (stashed && stashed.length) {
                            child = stashed.concat([centerItem, back]);
                        } else {
                            const L = this.genegraph_panel_layout;
                            child = [
                                { label: 'Layers ▸', click: () => { closeHandoff(); try { exec('baja/manchester/menu/track-layers-side-menu.js', t, L, this); } catch (e) { } }, move: () => { } },
                                centerItem,
                                { label: 'Variants (' + ((t && t.snpindels || []).length) + ') ▸', click: () => { closeHandoff(); try { Promise.resolve(exec('baja/manchester/menu/mutations-menu.js', this, L)).catch(() => { }); } catch (e) { } }, move: () => { } },
                                { label: 'Design ▸', click: () => { closeHandoff(); try { const __hasRange = (t && t.markstart != null && t.markend != null && t.markstart >= 0 && t.markend > t.markstart); if (!__hasRange && t && t.selectTrackAndSeq) t.selectTrackAndSeq(); } catch (e) { } try { Promise.resolve(exec('baja/manchester/menu/track-design-menu.js', this, t, L)).catch(() => { }); } catch (e) { } }, move: () => { } },
                                back,
                            ];
                        }
                        try { child.__compactCols = true; child.__menuTitle = (t.name || ('track ' + (i + 1))); } catch (e) { }
                        show(child);
                    };
                    tracks.forEach((t, i) => sub.push({
                        label: (t.name || ('track ' + (i + 1))) + ' ▸',
                        click: () => { openTrackChild(t, i); },
                        move: () => { }
                    }));
                    sub.push({ label: '‹ Back', click: () => { openMain(); }, move: () => { } });
                    show(sub);
                };

                // Zoom to (center on) a single oligo/amplicon on its track.
                const zoomToOligo = (o, t) => {
                    try {
                        const tg = t.tgraph;
                        const isAmp = (o.type === 'amplicon' && o.left && o.right);
                        const gxi = +(isAmp ? o.left.xi : o.xi);
                        const gxf = +(isAmp ? o.right.xf : o.xf);
                        if (!isFinite(gxi) || !isFinite(gxf)) return;
                        const oy = isAmp ? (o.left && o.left.y != null ? o.left.y : o.y) : o.y;
                        const y = (oy != null ? oy : 0.1);
                        const pad = Math.max(10, gxf - gxi);   // frame with context, oligo centered
                        this.animateTo(tg.X(gxi - pad), tg.X(gxf + pad), tg.Y(y - 1), tg.Y(y + 1));
                    } catch (e) { }
                };

                const selectAllOligos = () => {
                    close();
                    let n = 0;
                    for (const t of tracks) {
                        for (const o of (t.oligos || [])) {
                            try { this.addOligoToSelection(o, t); n++; } catch (e) { }
                        }
                    }
                    this.setMessage(' Selected ' + n + ' oligo(s). ');
                    if (this.wake) this.wake();
                };

                // Run off-targets on every oligo across all tracks.
                const runOffTargetsAll = () => {
                    const all = [];
                    for (const t of tracks) for (const o of (t.oligos || [])) all.push(o);
                    if (!all.length) { this.setMessage(' No oligos to run off-targets on. '); return; }
                    close();
                    try { window.current = all[0]; } catch (e) { }
                    try {
                        Promise.resolve(exec('baja/manchester/menu/run-off-targets.js', this, this.genegraph_panel_layout, all)).catch(() => { });
                    } catch (e) { this.setMessage(' Could not open off-target tool: ' + e); }
                };

                // Modify chemistry on every oligo across all tracks (opens the same
                // Anthropic-backed prompt window "Run off-targets: all" opens for off-target
                // search, alongside it).
                const modifyChemistryAll = () => {
                    const all = [];
                    for (const t of tracks) for (const o of (t.oligos || [])) all.push(o);
                    if (!all.length) { this.setMessage(' No oligos to modify chemistry on. '); return; }
                    // closeHandoff, NOT close: close() clears __selMenuChain, which tells the
                    // shelf this level was dismissed rather than handed off -- it then tears
                    // the chain down and takes the panel the handed-off script just opened
                    // with it. Every other item here that opens another script uses this.
                    closeHandoff();
                    try {
                        Promise.resolve(exec('baja/manchester/menu/annotation/modify-chemistry.js', this, this.genegraph_panel_layout, all)).catch(() => { });
                    } catch (e) { this.setMessage(' Could not open the chemistry tool: ' + e); }
                };

                const OLIGO_PAGE = 30;
                const openOligos = (offset) => {
                    offset = offset || 0;
                    // Flatten all oligos (with their track) so we can page through them.
                    const items = [];
                    for (const t of tracks) for (const o of (t.oligos || [])) items.push({ o, t });
                    const sub = [{ label: 'Select all oligos (' + oligoCount + ')', click: () => { selectAllOligos(); }, move: () => { } }];
                    // Highlight every oligo and offer downloads (sequences as XLSX/CSV/FASTA, positions as BED).
                    sub.push({
                        label: 'Highlight all oligos & Download ▸',
                        click: () => {
                            let n = 0;
                            for (const t of tracks) for (const o of (t.oligos || [])) { try { this.addOligoToSelection(o, t); n++; } catch (e) { } }
                            try { this.setMessage(' Highlighted ' + n + ' oligo(s). '); } catch (e) { }
                            if (this.wake) this.wake();
                            show([
                                { label: 'Sequences → XLSX', click: () => { close(); this.exportSelection('xlsx', 'oligo'); }, move: () => { } },
                                { label: 'Sequences → CSV', click: () => { close(); this.exportSelection('csv', 'oligo'); }, move: () => { } },
                                { label: 'Sequences → FASTA', click: () => { close(); this.exportSelection('fasta', 'oligo'); }, move: () => { } },
                                { label: 'Positions → BED', click: () => { close(); this.exportSelection('bed', 'oligo'); }, move: () => { } },
                                { label: 'Table → TXT', click: () => { close(); this.exportSelection('txt', 'oligo'); }, move: () => { } },
                                { label: '‹ Back', click: () => { openOligos(offset); }, move: () => { } },
                            ]);
                        },
                        move: () => { }
                    });
                    // Alongside "Select all oligos", offer running off-targets on all —
                    // but never in a read-only (viewer) screen.
                    if (!this.readonly) sub.push({ label: 'Run off-targets: all', click: () => { runOffTargetsAll(); }, move: () => { } });
                    if (!this.readonly) sub.push({ label: 'Modify Chemistry: all', click: () => { modifyChemistryAll(); }, move: () => { } });
                    // Only offered when the tracks hold BOTH siRNA and ASO oligos.
                    if (hasBothTypes) sub.push({ label: 'Select by type ▸', click: () => { openByType(); }, move: () => { } });
                    for (const { o, t } of items.slice(offset, offset + OLIGO_PAGE)) {
                        sub.push({
                            label: (o.name || o.id || 'oligo'),
                            click: () => { close(); try { this.addOligoToSelection(o, t); } catch (e) { } zoomToOligo(o, t); },
                            move: () => { }
                        });
                    }
                    // Page controls when there are more than OLIGO_PAGE oligos.
                    if (offset > 0) sub.push({ label: '‹ Previous ' + OLIGO_PAGE, click: () => { openOligos(Math.max(0, offset - OLIGO_PAGE)); }, move: () => { } });
                    if (offset + OLIGO_PAGE < items.length) sub.push({ label: 'more… (' + (items.length - offset - OLIGO_PAGE) + ')', click: () => { openOligos(offset + OLIGO_PAGE); }, move: () => { } });
                    sub.push({ label: '‹ Back', click: () => { openMain(); }, move: () => { } });
                    show(sub);
                };

                // Select oligos of a single type (siRNA / ASO). Shown only when both
                // types are present on the tracks.
                const openByType = () => {
                    const items = [];
                    for (const t of tracks) for (const o of (t.oligos || [])) items.push({ o, t });
                    const selectList = (pred, typeLabel) => {
                        close();
                        let n = 0;
                        for (const { o, t } of items) {
                            if (!pred(o)) continue;
                            try { this.addOligoToSelection(o, t); n++; } catch (e) { }
                        }
                        this.setMessage(' Selected ' + n + ' ' + typeLabel + '. ');
                        if (this.wake) this.wake();
                    };
                    const sub = [
                        { label: 'Select all siRNA (' + siRNACount + ')', click: () => { selectList(isSiRNA, 'siRNA'); }, move: () => { } },
                        { label: 'Select all ASO (' + asoCount + ')', click: () => { selectList(isASO, 'ASO'); }, move: () => { } },
                        { label: '‹ Back', click: () => { openOligos(); }, move: () => { } },
                    ];
                    show(sub);
                };

                // A selected SEQUENCE is a first-class thing to act on, so it belongs in this
                // menu next to Tracks / Oligos / Variants rather than only being reachable by
                // clicking the selection on the canvas. Opens the same Selected Sequence menu
                // (Data / Models / Sequence / Design / Export…), scoped to markstart..markend.
                const seqTracks = () => (this.track || []).filter(
                    (t) => t && t.markstart != null && t.markend != null && t.markstart >= 0 && t.markend > t.markstart);
                const openSequenceFor = (t) => {
                    close();
                    try { exec('baja/manchester/menu/selected-sequence-menu.js', this, t, this.genegraph_panel_layout); } catch (e) { }
                };
                const sequenceItem = () => {
                    const st = seqTracks();
                    if (!st.length) return null;
                    const span = (t) => {
                        const toW = (m) => (m != null && t.xi != null && m < t.xi) ? (t.xi + m) : m;
                        const a = Math.floor(toW(t.markstart)), b = Math.ceil(toW(t.markend));
                        return { a: a, b: b, n: Math.max(0, b - a) };
                    };
                    if (st.length === 1) {
                        const sp = span(st[0]);
                        return {
                            label: 'Sequence (' + sp.n + ' nt) ▸',
                            click: () => openSequenceFor(st[0]),
                            move: () => { }
                        };
                    }
                    return {
                        label: 'Sequences (' + st.length + ') ▸',
                        move: () => { },
                        click: () => {
                            const sub = st.map((t) => {
                                const sp = span(t);
                                return {
                                    label: (t.name || 'track') + '  ' + sp.a + '–' + sp.b + '  (' + sp.n + ' nt)',
                                    click: () => openSequenceFor(t),
                                    move: () => { }
                                };
                            });
                            sub.push({ label: '‹ Back', click: () => { openMain(); }, move: () => { } });
                            show(sub);
                        }
                    };
                };

                const buildMain = () => {
                    // Read-only (viewer): only navigation (center on a track) and Export —
                    // no oligo selection, chemistry, or off-target (modifying) actions. The
                    // sequence entry is still offered: what a viewer may DO with it is gated
                    // centrally by __viewerDenied, which strips design and the board-modifying
                    // items from the menu it opens.
                    if (this.readonly) {
                        const ro = [
                            { label: 'Tracks (' + tracks.length + ') ▸', click: () => { openTracks(); }, move: () => { } },
                            { label: 'Export ▸', click: () => { closeHandoff(); try { Promise.resolve(exec('baja/manchester/menu/track-export-menu.js', this, this.genegraph_panel_layout)).catch(() => { }); } catch (e) { } }, move: () => { } },
                        ];
                        const si = sequenceItem();
                        if (si) ro.splice(1, 0, si);
                        return ro;
                    }
                    const mutCount = (this.track || []).reduce((n, t) => n + ((t && t.snpindels || []).length), 0);
                    const main = [
                        { label: 'Tracks (' + tracks.length + ') ▸', click: () => { openTracks(); }, move: () => { } },
                        { label: 'Oligos (' + oligoCount + ') ▸', click: () => { openOligos(); }, move: () => { } },
                        { label: 'Variants (' + mutCount + ') ▸', click: () => { closeHandoff(); try { Promise.resolve(exec('baja/manchester/menu/mutations-menu.js', this, this.genegraph_panel_layout)).catch(() => { }); } catch (e) { } }, move: () => { } },
                    ];
                    const si = sequenceItem();
                    if (si) main.splice(1, 0, si);      // right after Tracks
                    return main;
                };

                openMain();
            }

            // Keep the canvas in sync with the selection window: anything listed in
            // __lassoSelection must stay visibly selected on the canvas, even if hover
            // handlers / deselectAllTracks cleared its highlight. Re-applied each frame.
            reassertSelectionHighlights() {
                const sel = this.__lassoSelection;
                if (!sel || !sel.length) return;
                for (const s of sel) {
                    try {
                        if (!s.ref) continue;
                        if (s.kind === 'oligo') {
                            if (!s.ref.highlight__) s.ref.highlight__ = '#ff8c42';   // tropical orange
                        } else if (s.kind === 'amplicon') {
                            if (s.inOligos) { if (!s.ref.highlight__) s.ref.highlight__ = 'cyan'; }
                            else if (!s.ref.__lassoHi) s.ref.__lassoHi = '#c0392b';
                        } else if (s.kind === 'snp') {
                            s.ref.highlight = true;
                        } else if (s.kind === 'ann') {
                            if (s.ref.select) s.ref.select();
                        } else if (s.kind === 'layer' && s.ref) {
                            if (s.ref.color !== '#c0392b') s.ref.color = '#c0392b';
                            s.ref.highlight = true;
                        }
                    } catch (e) { }
                }
            }

            // Undo the visual highlight of the current selection (restore original
            // layer-item colors, deselect annotations, unhighlight SNPs).
            clearSelectionVisuals() {
                const sel = this.__lassoSelection || [];
                for (const s of sel) {
                    try {
                        if (s.kind === 'track' && s.ref && s.ref.deselect) s.ref.deselect();
                        else if (s.kind === 'ann' && s.ref && s.ref.deselect) s.ref.deselect();
                        else if (s.kind === 'snp' && s.ref) s.ref.highlight = false;
                        else if (s.kind === 'oligo' && s.ref) { s.ref.highlight__ = ('origHighlight' in s) ? s.origHighlight : false; s.ref.selected = false; }
                        else if (s.kind === 'amplicon' && s.ref) {
                            // Amplicon objects (in t.oligos) highlight via highlight__;
                            // ampliconResults hits use __lassoHi.
                            if (s.inOligos) s.ref.highlight__ = ('origHighlight' in s) ? s.origHighlight : false;
                            else s.ref.__lassoHi = ('origHighlight' in s) ? s.origHighlight : false;
                            s.ref.selected = false;
                        }
                        else if (s.kind === 'layer' && s.ref) {
                            if ('origColor' in s) s.ref.color = s.origColor;
                            if ('origHighlight' in s) s.ref.highlight = s.origHighlight;
                        }
                    } catch (e) { }
                }
                // Selection is gone → turn off the SNP spotlight so nothing stays dimmed.
                this.__snpSelectionActive = false;
            }

            // Clear the SEQUENCE selection on every track — the markstart/markend range, which
            // is what the designers, the models and the data loaders scope themselves to.
            //
            // Separate from clearSelectionVisuals() on purpose. That walks __lassoSelection, and
            // a sequence range is NOT in it: it is derived from markstart/markend on the track,
            // which is why "Clear selection" left every highlighted range exactly where it was
            // while appearing to have cleared everything. It is also called by _startLasso to
            // reset the previous selection before applying a new one, and a lasso should not
            // silently discard a range the user marked for a design.
            //
            // Only the marks. deselect() would also unhighlight every variant on the track, and
            // those highlights are set by other things -- an off-target run marks its hits the
            // same way -- so clearing them here would undo work this action never touched.
            clearSequenceSelections() {
                let n = 0;
                for (const t of (this.track || [])) {
                    try {
                        if (!t) continue;
                        const has = (t.selectedRange && t.selectedRange())
                            || (t.markstart != null && t.markend != null && t.markend > t.markstart);
                        if (!has) continue;
                        t.markstart = null;
                        t.markend = null;
                        t.showResizeBar = false;
                        n++;
                    } catch (e) { }
                }
                // The drag that creates a range leaves its own state behind; without this the
                // next mouse-up could re-apply the range that was just cleared.
                try { this.select_ = false; this.startX = null; this.endX = null; this.__dragMark = null; } catch (e) { }
                return n;
            }

            // Add a clicked oligo (or amplicon) to the selection box. Its menu is the
            // per-oligo (ASO) menu, opened from the selection window. De-dupe by ref.
            addOligoToSelection(oligo, track) {
                if (!oligo) return;
                if (!this.__lassoSelection) this.__lassoSelection = [];
                if (!this.__lassoSelection.some((e) => e.ref === oligo)) {
                    const isAmp = (oligo.type === 'amplicon' && oligo.left && oligo.right);
                    const gxi = isAmp ? +oligo.left.xi : +oligo.xi;
                    const gxf = isAmp ? +oligo.right.xf : +oligo.xf;
                    const origHi = oligo.highlight__;
                    oligo.highlight__ = isAmp ? 'cyan' : '#ff8c42';   // tropical orange
                    this.__lassoSelection.push({ kind: isAmp ? 'amplicon' : 'oligo', label: (oligo.name || oligo.id || (isAmp ? 'amplicon' : 'oligo')), track: track, chr: track && track.chr, xi: gxi, xf: gxf, ref: oligo, origHighlight: origHi, inOligos: true });
                }
                try { oligo.selected = true; } catch (e) { }   // keep o.selected as the source of truth
                this.showDisplay = true;
                if (this.wake) this.wake();
            }

            // Keep the selection window in sync with the current selection: it becomes
            // visible whenever anything is selected and disappears when nothing is.
            // Reconciles the oligo/amplicon entries from each oligo's `selected` flag,
            // so EVERY selection mechanism (click, lasso, the compound-editor Select
            // menu) is reflected. Call this after any change to what is selected.
            syncSelectionWindow() {
                if (!this.__lassoSelection) this.__lassoSelection = [];
                // 1) Drop oligo/amplicon entries whose object is no longer selected,
                //    restoring the object's original highlight.
                const kept = [];
                for (const s of this.__lassoSelection) {
                    if ((s.kind === 'oligo' || s.kind === 'amplicon') && s.ref && !s.ref.selected) {
                        try {
                            if (s.kind === 'amplicon' && !s.inOligos) s.ref.__lassoHi = ('origHighlight' in s) ? s.origHighlight : false;
                            else s.ref.highlight__ = ('origHighlight' in s) ? s.origHighlight : false;
                        } catch (e) { }
                        continue;   // remove this entry
                    }
                    kept.push(s);
                }
                this.__lassoSelection = kept;
                // 2) Add every selected oligo/amplicon that isn't already in the window.
                for (const t of (this.track || [])) {
                    for (const o of (t.oligos || [])) {
                        if (o && o.selected && !this.__lassoSelection.some((e) => e.ref === o)) {
                            this.addOligoToSelection(o, t);
                        }
                    }
                }
                // 3) Visibility follows whether anything at all is selected.
                const n = this.__lassoSelection.length;
                this.showDisplay = n > 0;
                if (!n) this.__selPanelBounds = null;
                if (this.wake) this.wake();
            }

            // Add a clicked annotation (e.g. an exon) to the selection box, along with
            // its type-specific menu that used to pop up on click. De-dupe by ref.
            addAnnotationToSelection(ann, track, menuItems) {
                if (!ann) return;
                if (!this.__lassoSelection) this.__lassoSelection = [];
                const existing = this.__lassoSelection.find((e) => e.kind === 'ann' && e.ref === ann);
                if (existing) { if (Array.isArray(menuItems) && menuItems.length) existing.annMenu = menuItems; }
                else {
                    this.__lassoSelection.push({ kind: 'ann', label: (ann.name || ann.type || 'annotation'), track: track, chr: track && track.chr, xi: ann.xi, xf: ann.xf, ref: ann, annMenu: (menuItems || []) });
                }
                this.showDisplay = true;
                if (this.wake) this.wake();
            }

            // Add a clicked track to the selection box as its own object type, along
            // with the menu that used to pop up on click. De-dupe by track reference.
            addTrackToSelection(track, menuItems) {
                if (!track) return;
                if (!this.__lassoSelection) this.__lassoSelection = [];
                const existing = this.__lassoSelection.find((e) => e.kind === 'track' && e.ref === track);
                if (existing) { existing.trackMenu = menuItems; }
                else {
                    // Graph-world extent of the track. Read from whichever grid this renderer
                    // uses: reading .tgraph alone left every flexi track's entry at 0..0.
                    let xi = 0, xf = 0;
                    try {
                        const g = track.tgraph || track.grid;
                        if (g) { xi = g.xi; xf = g.xi + g.width; }
                    } catch (e) { }
                    this.__lassoSelection.push({ kind: 'track', label: (track.name || 'track'), track: track, chr: track.chr, xi: xi, xf: xf, ref: track, trackMenu: menuItems });
                }
                this.showDisplay = true;
                if (this.wake) this.wake();
            }

            // Actions menu for the current lasso selection. Options are grouped BY
            // OBJECT TYPE — each type present in the selection gets its own button
            // that opens that type's actions (this is where amplicon/oligo options
            // now live, instead of a menu popping up from mouse-over hover).
            // Maximised, scrollable list of EVERYTHING selected, opened from the card's
            // "+N more…" row.
            //
            // The card can only show a dozen rows and a side menu is bounded by the canvas
            // height, so with a few hundred items selected there was no view that showed them
            // all. This one scrolls, is searchable by eye, and each row opens that object's own
            // menu -- the same tree the card rows open -- so it is a bigger door to the same
            // place rather than a separate feature.
            openSelectionBrowser() {
                const sel = (this.__lassoSelection || []).slice();
                if (!sel.length) return;
                try {
                    const old = document.getElementById('baja-sel-browser');
                    if (old && old.parentNode) old.parentNode.removeChild(old);
                } catch (e) { }

                const kindLabels = { track: 'Track', ann: 'Annotation', snp: 'SNP / Indel', oligo: 'Oligo', amplicon: 'Amplicon', layer: 'Layer item', sequence: 'Sequence' };
                const dotColor = { track: '#1d4ed8', ann: '#1aa3bd', snp: '#c0392b', oligo: '#ff8c42', amplicon: '#7c3aed', layer: '#a86b3e' };

                // Deduped and grouped the same way the menu is, so the two agree.
                const byKey = new Map();
                const rows = [];
                for (const e of sel) {
                    if (!e) continue;
                    const label = '' + (e.label || kindLabels[e.kind] || e.kind || 'item');
                    const key = (e.kind || '') + '|' + label;
                    let r = byKey.get(key);
                    if (!r) { r = { kind: e.kind, label: label, count: 0, entry: e }; byKey.set(key, r); rows.push(r); }
                    r.count++;
                }
                const perKind = new Map();
                for (const e of sel) perKind.set(e.kind, (perKind.get(e.kind) || 0) + 1);
                rows.sort((a, b) => ((perKind.get(b.kind) || 0) - (perKind.get(a.kind) || 0))
                    || ('' + a.kind).localeCompare('' + b.kind));

                const overlay = document.createElement('div');
                overlay.id = 'baja-sel-browser';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483350;background:rgba(6,14,26,0.72);'
                    + 'display:flex;align-items:stretch;justify-content:center;padding:22px;'
                    + 'font-family:Arial,Helvetica,sans-serif;';

                const pane = document.createElement('div');
                pane.style.cssText = 'width:100%;max-width:860px;height:100%;display:flex;flex-direction:column;'
                    + 'background:#0b2545;color:#e8f0fb;border:1px solid rgba(255,255,255,0.14);'
                    + 'border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,0.5);overflow:hidden;';

                const head = document.createElement('div');
                head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:14px;padding:14px 18px;'
                    + 'border-bottom:1px solid rgba(255,255,255,0.12);';
                head.innerHTML = '<div style="font:700 17px Arial;">Selected items</div>'
                    + '<div style="font:12.5px Arial;color:#9fb3c8;">' + rows.length + ' distinct of ' + sel.length
                    + ' — click one to open its menu</div>';
                const x = document.createElement('button');
                x.textContent = '✕ Close';
                x.style.cssText = 'margin-left:auto;cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12.5px Arial;'
                    + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';
                head.appendChild(x);

                const body = document.createElement('div');
                body.style.cssText = 'flex:1 1 auto;overflow:auto;padding:8px 0;';

                const close = () => {
                    try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
                    try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
                };
                const onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
                x.onclick = close;
                overlay.onclick = (ev) => { if (ev.target === overlay) close(); };

                let lastKind = null;
                for (const r of rows) {
                    // A heading each time the type changes, so the grouping is visible while
                    // scrolling rather than only implied by the order.
                    if (r.kind !== lastKind) {
                        lastKind = r.kind;
                        const h = document.createElement('div');
                        h.textContent = (kindLabels[r.kind] || r.kind || 'item') + ' — ' + (perKind.get(r.kind) || 0);
                        h.style.cssText = 'position:sticky;top:0;background:#0b2545;padding:9px 18px 6px;'
                            + 'font:700 11px Arial;letter-spacing:1.4px;text-transform:uppercase;color:#7f9bb8;';
                        body.appendChild(h);
                    }
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 18px;cursor:pointer;'
                        + 'border-bottom:1px solid rgba(255,255,255,0.05);font:13px Arial;';
                    row.innerHTML = '<span style="flex:0 0 auto;width:8px;height:8px;border-radius:50%;background:'
                        + (dotColor[r.kind] || '#9fb3c8') + ';"></span>'
                        + '<span style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
                        + ('' + r.label).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>'
                        + (r.count > 1 ? '<span style="flex:0 0 auto;color:#9fb3c8;font:12px Arial;">×' + r.count + '</span>' : '')
                        + '<span style="flex:0 0 auto;color:#7f9bb8;">▸</span>';
                    row.onmouseenter = () => { row.style.background = 'rgba(255,255,255,0.07)'; };
                    row.onmouseleave = () => { row.style.background = 'transparent'; };
                    row.onclick = () => {
                        close();
                        // Same rule as the card: the row that was clicked names the menu.
                        try { this.__menuParent = { label: ('' + (r.label || 'Selected')).trim(), t: Date.now() }; } catch (e) { }
                        try { this.openSelectionMenu(r.entry); } catch (e) { }
                    };
                    body.appendChild(row);
                }

                pane.appendChild(head); pane.appendChild(body);
                overlay.appendChild(pane);
                document.body.appendChild(overlay);
                document.addEventListener('keydown', onKey, true);
            }

            // rootEntry, when given, is the selection entry whose OWN menu tree should open --
            // the card row the user clicked. Without it the whole-selection menu opens, which is
            // what the header and the "+N more" row do.
            // `asLibrary` renders every level of this menu as a LIBRARY (baja/lib/shelf.js)
            // instead of a side menu. Not a second implementation: the option lists, the
            // ordering, the handlers and the back items are the same objects either way -- only
            // show() below differs, because every level in this method goes through it. That is
            // what makes the library's options identical to the menu's rather than merely
            // similar, and why adding an item to one adds it to both.
            openSelectionMenu(rootEntry, rootY, asLibrary) {
                // Which renderer this chain uses. Read by showSideMenu for every level, so a
                // handoff to another script stays in the same idiom. Callers from the canvas
                // selection window pass nothing and get side menus.
                this.__menuLibrary = !!asLibrary;
                // Name this menu after the CARD ROW that opened it.
                //
                // menu.js records the parent when one MENU ITEM opens another, but a menu opened
                // from the selection card never passes through that dispatch -- the click is
                // handled on the canvas -- so those menus had no parent and fell back to the
                // summary of their own items. The row IS the parent here: "Compounds (18)" opens
                // a menu that should read "Compounds".
                try {
                    const lbl = ('' + ((rootEntry && (rootEntry.label
                        || (rootEntry.__group === 'compounds' ? 'Compounds' : '')
                        || (rootEntry.__group === 'annotations' ? 'Annotations' : ''))) || 'Selected'))
                        .replace(/\s*[▸►]\s*$/, '')
                        .replace(/\s*\(\d[\d,]*\)\s*$/, '')
                        .replace(/\s*×\s*\d+\s*$/, '')      // the ×N duplicate count is not part of the name
                        .trim();
                    this.__menuParent = { label: lbl || 'Selected', t: Date.now() };
                } catch (e) { }
                const sel = this.__lassoSelection || [];
                // A sequence range is derived from markstart/markend rather than held in
                // __lassoSelection, so it can be the clicked row even when nothing was lassoed.
                if (!sel.length && !(rootEntry && rootEntry.kind === 'sequence')) return;
                const close = () => { try { this.showSideMenu(null); } catch (e) { } };
                // Closing this menu to OPEN ANOTHER ONE is not the same as dismissing it: the
                // new menu is still derived from the selection, so the box should stay blurred
                // behind it. close() clears the chain (showSideMenu(null) does), so a handoff
                // re-opens it. Leaves that perform an ACTION rather than opening a menu keep
                // using plain close().
                const closeHandoff = () => { close(); try { this.__selMenuChain = true; } catch (e) { } };
                // A tree opened FROM a card row lines up with THAT row: the menu reads as the
                // row expanding rather than as a separate panel that happens to be nearby, and
                // with several rows on the card it is unambiguous which one it belongs to.
                // Opened from the card as a whole (the overflow row), it keeps the old placement
                // above the card, since no single row owns it.
                const anchor = () => {
                    const b = this.__selPanelBounds;
                    if (!b) return undefined;
                    if (rootY != null && isFinite(rootY)) return { x: b.x, y: rootY };
                    return { x: b.x, aboveY: b.y };
                };
                // `label` names WHAT the menu is acting on -- the type of the selected objects
                // ('Oligos ▸', 'Annotations ▸', or a track's own name -- see menuLabel below) -- so
                // a menu three levels deep still says what it belongs to instead of repeating one
                // generic word. Callers with nothing more specific to say leave it off.
                const show = (list, label) => {
                    const __lbl = label || 'My selection...';
                    // No renderer choice here any more: showSideMenu makes it, once, for every
                    // level including the ones other scripts open.
                    // Mark the list so the selection card can blur itself while this is open,
                    // and open the CHAIN so submenus that hand off to another script stay
                    // marked too (see showSideMenu).
                    // try { if (Array.isArray(list)) list.__fromSelection = true; } catch (e) { }
                    try { this.__selMenuChain = true; } catch (e) { }
                    const a = anchor();
                    if (a) this.showSideMenu(list, a, __lbl); else this.showSideMenu(list, null, __lbl);
                };

                const kindLabels = { track: 'Tracks', ann: 'Annotations', snp: 'SNPs / Indels', oligo: 'Oligos', amplicon: 'Amplicons', layer: 'Layer items' };
                // The header a menu about ONE kind carries. Same words as the row that opens it,
                // so the title of the panel and the item you clicked to get there agree.
                const menuLabel = (k) => (kindLabels[k] || k) + ' ▸';
                const kindsPresent = [];
                for (const s of sel) if (kindsPresent.indexOf(s.kind) < 0) kindsPresent.push(s.kind);

                const openMain = () => show(buildMain(), 'Selection ▸');

                // Run off-target analysis on the selected oligos/amplicons against
                // any available index. run-off-targets.js fetches the genome/index
                // list (GET {env.offtarget}/genomes), lets the user pick an index and
                // edit distance, runs the search, and attaches results to the oligos
                // (o.offtarget / offtargetsymbols) using the existing rendering path.
                const runOffTargets = (kind, options) => {
                    const refs = sel
                        .filter((s) => (s.kind === 'oligo' || s.kind === 'amplicon') && s.ref && (!kind || s.kind === kind))
                        .map((s) => s.ref);
                    if (!refs.length) { this.setMessage(' No oligos selected to run off-targets. '); return; }
                    close();
                    try { window.current = refs[0]; } catch (e) { }   // report panel focus
                    try {
                        Promise.resolve(exec('baja/manchester/menu/run-off-targets.js',
                            this, this.genegraph_panel_layout, refs, options)).catch(() => { });
                    } catch (e) { this.setMessage(' Could not open off-target tool: ' + e); }
                };
                // siRNA present among the selection of the given kind? (enables the
                // seed-sequence off-target option).
                const __hasSiRNA = (kind) => sel.some((s) => (s.kind === 'oligo' || s.kind === 'amplicon') && s.ref && (!kind || s.kind === kind) && (s.ref.type === 'siRNA' || s.ref.guide || s.ref.sense));
                // Clicking "Run off-targets…" when siRNA are present opens this choice:
                // seed-sequence first, then full-sequence.
                const openOffTargetChoice = (kind) => {
                    show([
                        { label: 'Run seed sequences (siRNA)', click: () => { runOffTargets(kind, { seed: true }); }, move: () => { } },
                        { label: 'Run full sequence', click: () => { runOffTargets(kind); }, move: () => { } },
                        { label: '‹ Back', click: () => { openMain(); }, move: () => { } },
                    ], 'Off-targets ▸');
                };
                // Run off-targets, offering the seed/full choice when siRNA are present.
                const startOffTargets = (kind) => { if (__hasSiRNA(kind)) openOffTargetChoice(kind); else runOffTargets(kind); };

                // Modify chemistry on the selected oligos/amplicons of the given kind --
                // same selection filtering runOffTargets uses, opening
                // baja/manchester/menu/annotation/modify-chemistry.js's Anthropic-backed
                // prompt window instead of the off-target search.
                const modifyChemistrySelected = (kind) => {
                    const refs = sel
                        .filter((s) => (s.kind === 'oligo' || s.kind === 'amplicon') && s.ref && (!kind || s.kind === kind))
                        .map((s) => s.ref);
                    if (!refs.length) { this.setMessage(' No oligos selected to modify chemistry on. '); return; }
                    // closeHandoff, NOT close -- see modifyChemistryAll above: close() clears
                    // __selMenuChain and the shelf then tears down over the top of whatever
                    // this opens.
                    closeHandoff();
                    try {
                        Promise.resolve(exec('baja/manchester/menu/annotation/modify-chemistry.js',
                            this, this.genegraph_panel_layout, refs)).catch(() => { });
                    } catch (e) { this.setMessage(' Could not open the chemistry tool: ' + e); }
                };

                // Per-type submenu — the "options by object type". For types that
                // have object-specific menu builders (amplicons, oligos — defined in
                // mouse-over-highlight.js and exposed on the graph), use THOSE items;
                // otherwise fall back to generic download/remove actions.
                const objBuilder = (k) => (k === 'amplicon' ? this.__getAmpliconMenuItems : (k === 'oligo' ? this.__getOligoMenuItems : null));

                // --- per-item actions (remove / remove all others / deselect) with
                //     pagination when a type has many selected items. --------------
                const PAGE = 25;
                const spliceRef = (arr, ref) => { if (!Array.isArray(arr)) return false; const i = arr.indexOf(ref); if (i >= 0) { arr.splice(i, 1); return true; } return false; };
                const dropFromWindow = (p) => {
                    this.__lassoSelection = (this.__lassoSelection || []).filter((e) => e !== p && e.ref !== p.ref);
                    if (!this.__lassoSelection.length) { this.__selPanelBounds = null; this.showDisplay = false; }
                };
                // Delete the underlying object (oligo/amplicon/annotation/snp) from its
                // track and drop it from the selection window. Tracks are never deleted.
                const removeObject = (p) => {
                    const t = p.track, ref = p.ref;
                    if (t && ref) {
                        if (p.kind === 'oligo' || p.kind === 'amplicon') {
                            spliceRef(t.oligos, ref);
                            if (t.ampliconResults) { spliceRef(t.ampliconResults, ref); if (t.ampliconResults.hits) spliceRef(t.ampliconResults.hits, ref); }
                        } else if (p.kind === 'ann') spliceRef(t.annotations, ref);
                        else if (p.kind === 'snp') spliceRef(t.snpindels, ref);
                    }
                    dropFromWindow(p);
                    try { this.rescale(); } catch (e) { }
                    if (this.wake) this.wake();
                };
                // Remove from the selection only (restore highlight / clear selected),
                // leaving the object on the track.
                const deselectEntry = (p) => {
                    try {
                        if (p.kind === 'oligo' && p.ref) { p.ref.highlight__ = ('origHighlight' in p) ? p.origHighlight : false; p.ref.selected = false; }
                        else if (p.kind === 'amplicon' && p.ref) { if (p.inOligos) p.ref.highlight__ = ('origHighlight' in p) ? p.origHighlight : false; else p.ref.__lassoHi = ('origHighlight' in p) ? p.origHighlight : false; p.ref.selected = false; }
                        else if (p.kind === 'track' && p.ref && p.ref.deselect) p.ref.deselect();
                        else if (p.kind === 'ann' && p.ref && p.ref.deselect) p.ref.deselect();
                        else if (p.kind === 'snp' && p.ref) p.ref.highlight = false;
                    } catch (e) { }
                    dropFromWindow(p);
                    if (this.wake) this.wake();
                };
                const removeAllOthers = (p, k) => {
                    const others = sel.filter((s) => s.kind === k && s !== p);
                    for (const o of others) removeObject(o);
                    this.setMessage(' Removed ' + others.length + ' other ' + (kindLabels[k] || k) + '. ');
                };
                // Action menu for one picked item; backFn re-opens the picker page.
                // Frame one selected object on its track.
                //
                // Every selection entry carries xi/xf in TRACK-world plus the track it came from
                // (see the sel.push sites), so this works for annotations, SNPs, oligos,
                // amplicons and layer intervals alike without a per-kind branch. The axis is
                // resolved as .grid or .tgraph because the two renderers name it differently and
                // a helper that knows only one of them works on half the tracks in the app.
                const zoomToEntry = (p) => {
                    // A TRACK is framed by zoomToTrack, not by the generic path below.
                    //
                    // Two reasons it has to be special-cased. A track entry stores xi/xf taken
                    // from tgraph.xi + width, which are already GRAPH-world, so the generic path
                    // put them through X() a second time and the camera flew off somewhere
                    // meaningless. And for a flexi track the code that fills those in reads
                    // .tgraph only, leaving xi/xf at 0 -- so it zoomed to the origin instead.
                    // zoomToTrack works from the track's own box and now handles both renderers.
                    if (p && p.kind === 'track' && p.ref) {
                        try {
                            Promise.resolve(this.zoomToTrack(p.ref, 0.05)).catch(() => { });
                            this.setMessage(' ' + ((p.ref.name) || p.label || 'track') + ' ');
                        } catch (e) { try { this.setMessage(' Could not navigate: ' + e + ' '); } catch (e2) { } }
                        return;
                    }
                    try {
                        const tr = p && p.track;
                        const ax = tr && (tr.grid || tr.tgraph);
                        if (!ax) { this.setMessage(' That item has no track to navigate to. '); return; }
                        // +null is 0, and 0 is finite -- so coercing first would turn "no
                        // coordinates" into a silent zoom to position 0. Reject the empty values
                        // before the conversion, not after.
                        const num = (v) => (v == null || v === '' ? NaN : +v);
                        let a = num(p.xi), b = num(p.xf);
                        if (!isFinite(a)) { this.setMessage(' That item has no coordinates to zoom to. '); return; }
                        if (!isFinite(b)) b = a;
                        const lo = Math.min(a, b), hi = Math.max(a, b);
                        // A zero-width feature (a SNP) still needs a window, so pad by a minimum
                        // as well as a fraction -- otherwise the zoom target is a single column.
                        const pad = Math.max(20, (hi - lo) * 0.5);
                        this.animateTo(ax.X(lo - pad), ax.X(hi + pad), ax.Y(-1.2), ax.Y(1.2));
                        if (this.wake) this.wake();
                        this.setMessage(' ' + (p.label || 'item') + ' — ' + Math.round(lo) + '–' + Math.round(hi)
                            + ' on ' + ((tr && tr.name) || 'track') + ' ');
                    } catch (e) { try { this.setMessage(' Could not navigate: ' + e + ' '); } catch (e2) { } }
                };

                const itemMenu = (p, k, openOne, backFn) => {
                    const single = (kindLabels[k] || k).replace(/s$/, '');
                    const list = [];


                    const centerTrack = (t) => {
                        try {
                            const tg = t.tgraph;
                            const m = Math.max(100, tg.width * 0.05);   // small horizontal margin
                            // Fit the ENTIRE track (full width) centered, framed vertically.
                            this.animateTo(tg.xi - m, tg.xi + tg.width + m, tg.Y(-3), tg.Y(3));
                        } catch (e) {
                            try { this.goToTrack(t); } catch (e2) { }
                        }
                    };


                    // Frame the region the compounds occupy, and flash them so the eye lands on
                    // them once the camera stops. Zooming to a track shows the whole track; the
                    // compounds on it can sit inside a few hundred bases of it, and finding
                    // them by hand is the thing this saves.
                    //
                    // The span is the union of what is there: an amplicon runs left.xi..right.xf,
                    // an oligo xi..xf. Highlight colours match the ones the selection window
                    // already uses (cyan for amplicons, tropical orange for oligos), so a flash
                    // here reads the same as a selection there. They are restored afterwards,
                    // so this only ever borrows the highlight.
                    const compoundsOf = (t) => {
                        const out = [];
                        try {
                            for (const o of (t && t.oligos) || []) {
                                if (!o) continue;
                                const isAmp = (o.type === 'amplicon' && o.left && o.right);
                                const a = isAmp ? +o.left.xi : +o.xi;
                                const b = isAmp ? +o.right.xf : +o.xf;
                                if (!isFinite(a) || !isFinite(b)) continue;
                                out.push({ ref: o, isAmp: isAmp, lo: Math.min(a, b), hi: Math.max(a, b) });
                            }
                        } catch (e) { }
                        return out;
                    };
                    // The track an entry belongs to. Entries carry it as .track; a raw track
                    // (should this menu ever be handed one) is recognised by carrying oligos
                    // or an axis of its own.
                    const trackOf = (e) => {
                        if (!e) return null;
                        if (e.track) return e.track;
                        if (e.oligos || e.tgraph || e.grid) return e;
                        if (e.ref && e.ref.oligos) return e.ref;
                        return null;
                    };
                    const zoomToCompounds = (t) => {
                        try {
                            const ax = t && (t.grid || t.tgraph);
                            if (!ax) { this.setResultMessage(' No track to look for compounds on. '); return; }
                            const cs = compoundsOf(t);
                            if (!cs.length) {
                                this.setResultMessage(' No compounds on ' + ((t && t.name) || 'that track') + '. ');
                                return;
                            }
                            let lo = Infinity, hi = -Infinity;
                            for (const c of cs) { lo = Math.min(lo, c.lo); hi = Math.max(hi, c.hi); }
                            // A single compound still needs a window around it, so pad by a
                            // minimum as well as a fraction.
                            const pad = Math.max(50, (hi - lo) * 0.15);
                            this.animateTo(ax.X(lo - pad), ax.X(hi + pad), ax.Y(-1.2), ax.Y(1.2));

                            // Flash, then put every highlight back exactly as it was.
                            const prev = cs.map((c) => ({ ref: c.ref, hi: c.ref.highlight__ }));
                            for (const c of cs) { try { c.ref.highlight__ = c.isAmp ? 'cyan' : '#ff8c42'; } catch (e) { } }
                            if (this.wake) this.wake();
                            setTimeout(() => {
                                for (const q of prev) { try { q.ref.highlight__ = q.hi; } catch (e) { } }
                                try { if (this.wake) this.wake(); } catch (e) { }
                            }, 4000);

                            this.setResultMessage(' ' + cs.length + ' compound' + (cs.length === 1 ? '' : 's')
                                + ' on ' + ((t && t.name) || 'track') + ' — ' + Math.round(lo) + '–' + Math.round(hi) + ' ');
                        } catch (e) { try { this.setMessage(' Could not navigate: ' + e + ' '); } catch (e2) { } }
                    };

                    // First, because finding the thing on the canvas is usually what you want
                    // before doing anything to it. Closes the menu: the point is to look at it.
                    //
                    // A track frames whole: centerTrack fits its full width. Everything else
                    // here (annotation, SNP, oligo, amplicon, layer item) has no tgraph of its
                    // own, so it goes through zoomToEntry, which zooms to its coordinates on
                    // whichever track carries it. Sending those through centerTrack threw on
                    // tg.width and left the row doing nothing at all.
                    list.push({
                        label: 'Zoom to',
                        click: () => { close(); if (k === 'track') centerTrack(p); else zoomToEntry(p); },
                        move: () => { }
                    });
                    // Every row here belongs to a track, and the compounds live on that track:
                    // an entry carries it as p.track. Note showTypePicker sends TRACK rows
                    // straight to openOne(p), so this menu only ever sees annotations, SNPs,
                    // oligos, amplicons and layer items -- keying this off k === 'track' would
                    // have added a row nothing could reach.
                    list.push({
                        label: 'Zoom to compounds',
                        click: () => { close(); zoomToCompounds(trackOf(p)); },
                        move: () => { }
                    });
                    if (openOne) list.push({ label: 'Open ' + single + ' menu', click: () => { openOne(p); }, move: () => { } });
                    if (k !== 'track') list.push({ label: 'Remove', click: () => { close(); removeObject(p); this.setMessage(' Removed 1 ' + single + '. '); }, move: () => { } });
                    list.push({ label: 'Remove all others', click: () => { close(); removeAllOthers(p, k); }, move: () => { } });
                    list.push({ label: 'Deselect', click: () => { deselectEntry(p); backFn(); }, move: () => { } });
                    list.push({ label: '‹ Back', click: () => { backFn(); }, move: () => { } });
                    return list;
                };
                // One page of pick entries (PAGE per page), with More…/Previous paging.
                const renderPickPage = (topItems, pickEntries, offset, backItem, label) => {
                    const list = topItems.slice();
                    for (const e of pickEntries.slice(offset, offset + PAGE)) list.push(e);
                    const next = offset + PAGE;
                    if (offset > 0) list.push({ label: '‹ Previous ' + PAGE, click: () => { show(renderPickPage(topItems, pickEntries, Math.max(0, offset - PAGE), backItem, label), label); }, move: () => { } });
                    if (next < pickEntries.length) list.push({ label: 'More… (' + (pickEntries.length - next) + ')', click: () => { show(renderPickPage(topItems, pickEntries, next, backItem, label), label); }, move: () => { } });
                    list.push(backItem);
                    return list;
                };
                // Paginated picker for a type: each pick opens its per-item action menu.
                const showTypePicker = (picks, k, openOne, topItems) => {
                    const backItem = { label: '‹ Back', click: () => { openMain(); }, move: () => { } };
                    const reopen = () => showTypePicker(picks, k, openOne, topItems);
                    const pickEntries = picks.map((p) => (k === 'track'
                        // A track picks straight into its OWN menu (a ▸ submenu = all the "Open Track
                        // menu" items) — not the generic action page, so no "Remove all others" /
                        // "Deselect" in between.
                        ? { label: (p.label || k) + ' ▸', click: () => { if (openOne) openOne(p); }, move: () => { } }
                        : { label: (p.label || k), click: () => { show(itemMenu(p, k, openOne, reopen), (p.label || kindLabels[k] || k) + ' ▸'); }, move: () => { } }));
                    show(renderPickPage(topItems || [], pickEntries, 0, backItem, menuLabel(k)), menuLabel(k));
                };

                // `only`, when given, narrows this to a SINGLE selected entry. That is what lets
                // the root menu list the selected objects themselves: picking one lands directly
                // on that object's own action menu (picks.length === 1 short-circuits the picker
                // in every branch below) while the per-kind entry point still works unchanged.
                // Confirmed, undoable delete for a set of selected objects.
                //
                // Two things every delete in this menu has to do, and the existing oligo one did
                // only the first: ASK before destroying designs, and push onto the history stack
                // BEFORE touching anything so the answer to "I didn't mean that" is undo rather
                // than redesign. Sharing it means a new kind cannot quietly ship without both.
                const confirmDelete = async (targets, noun) => {
                    if (!targets || !targets.length) return;
                    const n = targets.length;
                    try {
                        const confirm = await exec('baja/lib/confirm.js',
                            'Delete ' + n + ' selected ' + noun + (n === 1 ? '' : 's')
                            + '? This removes ' + (n === 1 ? 'it' : 'them') + ' from the track.',
                            async () => {
                                close();
                                try { this.pushOntoHistory(); } catch (e) { }
                                let done = 0;
                                for (const p of targets) { try { removeObject(p); done++; } catch (e) { } }
                                try { if (this.wake) this.wake(); } catch (e) { }
                                this.setMessage(' Deleted ' + done + ' ' + noun + (done === 1 ? '' : 's')
                                    + '. Undo restores ' + (done === 1 ? 'it' : 'them') + '. ');
                            });
                        showModal(confirm);
                    } catch (e) {
                        try { this.setMessage(' Could not open the confirmation: ' + e + ' '); } catch (e2) { }
                    }
                };

                const openTypeMenu = (k, only) => {
                    const kl = kindLabels[k] || k;
                    const narrow = (arr) => (only ? arr.filter((s) => s === only || (s.ref && s.ref === only.ref)) : arr);
                    // Tracks: pick a SPECIFIC selected track, then show that track's
                    // own menu (the one that used to pop up on click, built in
                    // mouse-over-highlight.js and stashed on the selection entry).
                    if (k === 'track') {
                        // Match the info-panel Tracks child menu: selecting a track centers + selects
                        // it and opens its OWN menu — the stashed track menu (Design ▸ / Layers ▸ /
                        // Variants ▸ / …) when present, else a Layers/Variants/Design fallback.
                        const picks = narrow(sel.filter((s) => s.kind === 'track'));
                        const openOne = (p) => {
                            const t = p.track || p.ref;
                            // try { if (t && this.zoomToTrack) this.zoomToTrack(t, 0.15); else if (t && this.goToTrack) this.goToTrack(t); } catch (e) { }
                            // select() marks the TRACK only. selectTrackAndSeq() also sets
                            // markstart/markend to the whole track, which put the editor into a
                            // sequence selection nobody asked for just for opening this submenu --
                            // and that in turn brought up the Selected Sequence menu on top of it.
                            // Design ▸ below still selects the range, because it needs one.
                            try { if (t && t.select) t.select(); } catch (e) { }
                            const back = { label: '‹ Back', click: () => { openMain(); }, move: () => { } };
                            // A track gets the same explicit "Zoom to" as every other selected
                            // object. Explicit on purpose: opening a track's menu deliberately
                            // does NOT move the camera, so this is how you ask it to.
                            const zoomItem = { label: 'Zoom to', click: () => { close(); zoomToEntry(p); }, move: () => { } };
                            let child;
                            if (p.trackMenu && p.trackMenu.length) {
                                child = [zoomItem].concat(p.trackMenu, [back]);
                            } else {
                                const L = this.genegraph_panel_layout;
                                child = [
                                    zoomItem,
                                    { label: 'Layers ▸', click: () => { closeHandoff(); try { exec('baja/manchester/menu/track-layers-side-menu.js', t, L, this); } catch (e) { } }, move: () => { } },
                                    { label: 'Variants (' + ((t && t.snpindels || []).length) + ') ▸', click: () => { closeHandoff(); try { Promise.resolve(exec('baja/manchester/menu/mutations-menu.js', this, L)).catch(() => { }); } catch (e) { } }, move: () => { } },
                                    { label: 'Design ▸', click: () => { closeHandoff(); try { const __hasRange = (t && t.markstart != null && t.markend != null && t.markstart >= 0 && t.markend > t.markstart); if (!__hasRange && t && t.selectTrackAndSeq) t.selectTrackAndSeq(); } catch (e) { } try { Promise.resolve(exec('baja/manchester/menu/track-design-menu.js', this, t, L)).catch(() => { }); } catch (e) { } }, move: () => { } },
                                    back,
                                ];
                            }
                            const __tn = (p.label || (t && t.name) || 'Track');
                            try { child.__compactCols = true; child.__menuTitle = __tn; } catch (e) { }
                            show(child, __tn + ' ▸');
                        };
                        if (picks.length === 1) { openOne(picks[0]); return; }
                        if (picks.length > 1) { showTypePicker(picks, 'track', openOne, []); return; }
                    }
                    // Annotations (e.g. exon features): pick a specific selected
                    // annotation, then show ITS type-specific menu (the exon menu that
                    // used to pop up on click). Falls back to the annotation-type menu
                    // for annotations selected via lasso (no stashed menu).
                    if (k === 'ann') {
                        const picks = narrow(sel.filter((s) => s.kind === 'ann' && s.ref));
                        // Hide / Highlight / Delete, on EVERY annotation, whichever menu it
                        // goes on to show. Prepended rather than added to one of the two
                        // branches below, because an annotation that carries its own stashed
                        // menu and one that has to build a type menu are the same object to
                        // the user and should offer the same three things.
                        //
                        // Hide sets a flag the annotation's draw() honours -- reversible, and
                        // the row says which way it will go. Highlight is the annotation's own
                        // select()/deselect(). Delete goes through confirmDelete, so it asks
                        // first and pushes history like every other delete here.
                        const annActions = (p) => {
                            const a = p && p.ref;
                            if (!a) return [];
                            const nm = ('' + (p.label || a.name || 'annotation'));
                            const lit = (() => { try { return !!a.isSelected(); } catch (e) { return !!a.highlighted; } })();
                            return [
                                {
                                    // First, because finding it is what you do before doing
                                    // anything to it. zoomToEntry centres the entry's span on
                                    // its own track and pads it, so a short annotation still
                                    // gets a window rather than a single column.
                                    label: 'Zoom to ' + nm,
                                    move: () => { },
                                    click: () => { close(); zoomToEntry(p); }
                                },
                                {
                                    label: (a.hidden ? 'Show' : 'Hide') + ' ' + nm,
                                    move: () => { },
                                    click: () => {
                                        close();
                                        try { if (this.pushOntoHistory) this.pushOntoHistory(); } catch (e) { }
                                        a.hidden = !a.hidden;
                                        try { if (this.wake) this.wake(); } catch (e) { }
                                        try { this.setResultMessage(' ' + nm + (a.hidden ? ' hidden. ' : ' shown. ')); } catch (e) { }
                                    }
                                },
                                {
                                    label: (lit ? 'Clear highlight' : 'Highlight') + ' ' + nm,
                                    move: () => { },
                                    click: () => {
                                        close();
                                        try { if (lit) { a.deselect(); } else { a.select(); } }
                                        catch (e) { try { a.highlighted = !lit; } catch (e2) { } }
                                        try { if (this.wake) this.wake(); } catch (e) { }
                                        try { this.setResultMessage(' ' + nm + (lit ? ' highlight cleared. ' : ' highlighted. ')); } catch (e) { }
                                    }
                                },
                                {
                                    label: 'Delete ' + nm + '…',
                                    move: () => { },
                                    click: async () => { await confirmDelete([p], 'annotation'); }
                                }
                            ];
                        };

                        const openOne = (p) => {
                            const acts = annActions(p);
                            // Named for the annotation itself ('Exon 3 ▸'), not for the class of
                            // thing it is: by this point the user has already picked which one.
                            const __an = (p.label || 'Annotation') + ' ▸';
                            if (Array.isArray(p.annMenu) && p.annMenu.length) {
                                show(acts.concat(p.annMenu, [{ label: '‹ Back', click: () => { openMain(); }, move: () => { } }]), __an);
                            } else if (p.track) {
                                close();
                                try {
                                    Promise.resolve(exec('baja/manchester/menu/annotations-type-menu', this, this.genegraph_panel_layout, [p.ref], p.track))
                                        .then((mml) => { if (Array.isArray(mml)) show(acts.concat(mml, [{ label: '‹ Back', click: () => { openMain(); }, move: () => { } }]), __an); })
                                        .catch(() => { });
                                } catch (e) { }
                            } else {
                                // Neither a stashed menu nor a track to build one from. That
                                // used to show NOTHING -- the row opened and the panel stayed
                                // as it was. The three actions do not need either, so they are
                                // what it shows.
                                show(acts.concat([{ label: '‹ Back', click: () => { openMain(); }, move: () => { } }]), __an);
                            }
                        };
                        if (picks.length === 1) { openOne(picks[0]); return; }
                        if (picks.length > 1) {
                            // Type-level actions above the per-annotation picks. Delete was
                            // missing entirely for annotations: they could be removed one at a
                            // time from an item menu, but not as the set the user had selected.
                            const sub = [{
                                label: 'Delete selected…',
                                click: async () => { await confirmDelete(picks.slice(), 'annotation'); },
                                move: () => { }
                            }];
                            showTypePicker(picks, 'ann', openOne, sub);
                            return;
                        }
                    }
                    // Oligos: pick a SPECIFIC selected oligo, then open its per-oligo
                    // (ASO) menu — moved here out of the hover menu.
                    if (k === 'oligo') {
                        const picks = narrow(sel.filter((s) => s.kind === 'oligo' && s.ref));
                        const openOne = (p) => {
                            close();
                            try { Promise.resolve(exec('baja/manchester/menu/menu-for-single-aso.js', this, p.ref, this.genegraph_panel_layout)).catch(() => { }); } catch (e) { }
                        };
                        // Picked as a ROOT item (one specific oligo): open its own menu rather
                        // than a one-entry picker, which would be a click that asks the user to
                        // choose from a list of one.
                        if (only && picks.length === 1) { openOne(picks[0]); return; }
                        // Type-level operations that act on ALL selected oligos, listed
                        // first — before the per-oligo picks below.
                        const sub = [];
                        sub.push({
                            label: 'Delete selected…',
                            click: async () => { await confirmDelete(picks.slice(), 'oligo'); },
                            move: () => { }
                        });
                        sub.push({
                            label: 'Deselect all',
                            click: () => {
                                const targets = picks.slice();
                                close();
                                for (const p of targets) deselectEntry(p);
                                this.setMessage(' Deselected ' + targets.length + ' oligo(s). ');
                            }, move: () => { }
                        });
                        // With siRNA present this opens a seed-vs-full choice; otherwise
                        // it runs the full-sequence search directly.
                        sub.push({ label: 'Run off-targets…', click: () => { startOffTargets('oligo'); }, move: () => { } });
                        sub.push({ label: 'Modify Chemistry…', click: () => { modifyChemistrySelected('oligo'); }, move: () => { } });
                        // Export the selected oligos + their genomic coords + off-target hits as CSV.
                        sub.push({
                            label: 'Download off-targets (CSV): ' + picks.length + ' selected',
                            click: () => {
                                const refs = picks.map((p) => p.ref).filter(Boolean);
                                close();
                                try { exec('baja/manchester/menu/download-off-targets.js', this, this.genegraph_panel_layout, refs); } catch (e) { this.setMessage(' Could not export CSV: ' + e); }
                            }, move: () => { }
                        });
                        const attrsOn = !!(this.graph && this.graph.showOligoLabels);
                        sub.push({
                            label: (attrsOn ? 'Hide attribute labels' : 'Show attribute labels'),
                            click: () => {
                                close();
                                if (this.graph) this.graph.showOligoLabels = !attrsOn;
                                this.setMessage(!attrsOn ? ' Showing oligo attribute labels ' : ' Hiding oligo attribute labels ');
                                if (this.wake) this.wake();
                            }, move: () => { }
                        });
                        if (picks.length === 1) {
                            sub.push({ label: 'more...', click: () => { openOne(picks[0]); }, move: () => { } });
                            sub.push({ label: '‹ Back', click: () => { openMain(); }, move: () => { } });
                            show(sub, menuLabel('oligo'));
                        } else {
                            // Many oligos: paginated picker; each opens remove/others/deselect.
                            showTypePicker(picks, 'oligo', openOne, sub);
                        }
                        return;
                    }
                    // Amplicons: pick a SPECIFIC selected amplicon, then show its own
                    // object-specific menu (showOneAmpliconMenu). If only one is
                    // selected, skip the picker and open its menu directly.
                    if (k === 'amplicon' && typeof this.__showOneAmpliconMenu === 'function') {
                        const picks = narrow(sel.filter((s) => s.kind === 'amplicon' && s.ref));
                        const openOne = (p) => { close(); try { this.__showOneAmpliconMenu(this, p.track, p.ref, true); } catch (e) { } };
                        // Same as the oligo branch: a root pick goes straight to that amplicon.
                        if (only && picks.length === 1) { openOne(picks[0]); return; }
                        const sub = [
                            { label: 'Run off-targets…', click: () => { runOffTargets('amplicon'); }, move: () => { } },
                            { label: 'Modify Chemistry…', click: () => { modifyChemistrySelected('amplicon'); }, move: () => { } },
                            { label: 'Delete selected…', click: async () => { await confirmDelete(picks.slice(), 'amplicon'); }, move: () => { } }
                        ];
                        if (picks.length === 1) {
                            sub.push({ label: 'more...', click: () => { openOne(picks[0]); }, move: () => { } });
                            sub.push({ label: '‹ Back', click: () => { openMain(); }, move: () => { } });
                            show(sub, menuLabel('amplicon'));
                        } else {
                            showTypePicker(picks, 'amplicon', openOne, sub);
                        }
                        return;
                    }
                    const builder = objBuilder(k);
                    const track = (sel.find((s) => s.kind === k && s.track) || {}).track;
                    if (builder && track) {
                        let items = [];
                        try { items = builder(track, this) || []; } catch (e) { items = []; }
                        // Builders return a single wrapper ('Amplicons'/'Oligos') whose
                        // click opens the real object menu — invoke it directly so we
                        // don't stack another nesting level on top.
                        if (items.length === 1 && typeof items[0].click === 'function') {
                            close();
                            try { items[0].click(); } catch (e) { }
                            return;
                        }
                        if (items.length) {
                            show(items.concat([{ label: '‹ Back', click: () => { openMain(); }, move: () => { } }]), menuLabel(k));
                            return;
                        }
                    }
                    const sub = [
                        { label: 'Download as BED', click: () => { close(); this.exportSelection('bed', k); }, move: () => { } },
                        { label: 'Download as CSV', click: () => { close(); this.exportSelection('csv', k); }, move: () => { } },
                        { label: 'Download as TXT', click: () => { close(); this.exportSelection('txt', k); }, move: () => { } },
                        { label: 'Download as XLSX', click: () => { close(); this.exportSelection('xlsx', k); }, move: () => { } },
                        { label: 'Remove ' + kl.toLowerCase(), click: () => { close(); this.removeSelectedByKind(k); }, move: () => { } },
                    ];
                    sub.push({ label: '‹ Back', click: () => { openMain(); }, move: () => { } });
                    show(sub, menuLabel(k));
                };

                // The selection WINDOW's entries and this menu's ROOT are now the same list: each
                // selected object is a root item that opens its own tree of actions. Previously
                // the root was one entry per KIND ("Selected Oligos (5) ▸"), so reaching a
                // specific object meant kind -> picker -> object, and the window listing the
                // objects was a separate read-only card that could not be acted on. Deduped by
                // kind+label with a xN count, exactly as the card does, so the two cannot
                // disagree about what is selected.
                //
                // Kind entries are kept ONLY where they still earn their place: a kind with more
                // than one object gets an "All <kind>" item for acting on the group at once.
                const distinctSelection = () => {
                    const out = [];
                    const byKey = new Map();
                    const perKind = new Map();
                    for (const s of sel) {
                        if (!s) continue;
                        const label = '' + (s.label || (kindLabels[s.kind] || s.kind || 'item'));
                        const key = (s.kind || '') + '|' + label;
                        let e = byKey.get(key);
                        if (!e) { e = { kind: s.kind, label: label, count: 0, entry: s }; byKey.set(key, e); out.push(e); }
                        e.count++;
                        perKind.set(s.kind, (perKind.get(s.kind) || 0) + 1);
                    }
                    // GROUPED BY TYPE, biggest group first.
                    //
                    // Ungrouped, a lasso over a busy region interleaves oligos, annotations and
                    // SNPs in whatever order they were picked up, so related things are scattered
                    // down the list. Ordering by how many of each kind were selected puts what
                    // the user mostly caught at the top, which is nearly always what they were
                    // reaching for. Ties break on the kind name so the order is stable between
                    // openings rather than depending on iteration order.
                    const rank = (k) => perKind.get(k) || 0;
                    out.sort((a, b) => {
                        const d = rank(b.kind) - rank(a.kind);
                        if (d) return d;
                        if (a.kind !== b.kind) return ('' + a.kind).localeCompare('' + b.kind);
                        return 0;   // within a kind, keep selection order
                    });
                    return out;
                };

                // A selected sequence RANGE is derived from markstart/markend rather than stored
                // in __lassoSelection (dragging an arrow head edits it continuously, so a stored
                // copy goes stale). The card derives it per frame; the root does the same, so a
                // sequence selection appears here as its own root item.
                const sequenceRoots = () => {
                    const out = [];
                    try {
                        for (const t of (this.track || [])) {
                            if (!t || t.markstart == null || t.markend == null) continue;
                            if (!(t.markstart >= 0 && t.markend > t.markstart)) continue;
                            const toW = (m) => (m != null && t.xi != null && m < t.xi) ? (t.xi + m) : m;
                            const a = Math.floor(toW(t.markstart)), b = Math.ceil(toW(t.markend));
                            out.push({
                                label: (t.name || 'track') + ' ' + a + '–' + b + ' (' + Math.max(0, b - a) + ' nt) ▸',
                                click: () => {
                                    closeHandoff();
                                    try { Promise.resolve(exec('baja/manchester/menu/selected-sequence-menu.js', this, t, this.genegraph_panel_layout)).catch(() => { }); } catch (e) { }
                                },
                                move: () => { }
                            });
                        }
                    } catch (e) { }
                    return out;
                };

                // ANNOTATIONS and COMPOUNDS are branches rather than long runs of root items.
                // Defined at menu scope, not inside buildMain, because the selection CARD opens
                // them directly too: a lasso over a gene packages its compounds into one row, and
                // clicking that row has to land in the same place the menu item does.
                const annEntries = () => distinctSelection().filter((e) => e.kind === 'ann');
                const cpdEntries = () => distinctSelection().filter((e) => e.kind === 'oligo' || e.kind === 'amplicon');

                const entryItem = (e) => ({
                    label: e.label + (e.count > 1 ? '  ×' + e.count : '') + ' ▸',
                    click: () => { openTypeMenu(e.kind, e.entry); },
                    move: () => { }
                });

                // A paged list, so a branch with hundreds in it is still usable.
                const listPage = (entries, title, offset2) => {
                    const o2 = offset2 || 0;
                    const page = [{ label: title + '  (' + entries.length + ')', header: true, click: () => { }, move: () => { } }];
                    for (const e of entries.slice(o2, o2 + PAGE)) page.push(entryItem(e));
                    if (o2 > 0) page.push({ label: '‹ Previous ' + Math.min(PAGE, o2), click: () => { show(listPage(entries, title, Math.max(0, o2 - PAGE)), title + ' ▸'); }, move: () => { } });
                    if (o2 + PAGE < entries.length) page.push({ label: 'More… (' + (entries.length - o2 - PAGE) + ' of ' + entries.length + ' remaining)', click: () => { show(listPage(entries, title, o2 + PAGE), title + ' ▸'); }, move: () => { } });
                    page.push({ label: '‹ Back', click: () => { openMain(); }, move: () => { } });
                    return page;
                };

                const openAnnotationsBranch = () => { show(listPage(annEntries(), 'Annotations', 0), 'Annotations ▸'); };

                // Compounds are grouped by TYPE first -- siRNA, ASO, amplicon -- because that is
                // how a user thinks about them, and because a mixed lasso is otherwise a single
                // undifferentiated list of ids.
                const openCompoundsBranch = () => {
                    const items = cpdEntries();
                    if (!items.length) { try { this.setMessage(' No compounds selected. '); } catch (e) { } return; }

                    const refsOf = () => items.map((e) => e.entry && e.entry.ref).filter(Boolean);
                    const typeOf = (e) => {
                        try {
                            const r = e.entry && e.entry.ref;
                            const t = ('' + ((r && (r.type || r.modality || r.chemistry)) || '')).trim();
                            if (t) return t;
                        } catch (er) { }
                        return e.kind === 'amplicon' ? 'Amplicon' : 'Oligo';
                    };

                    // Frame every selected compound at once. The union of their spans, so the
                    // answer to "where are they" is one view rather than a tour.
                    const zoomToAll = () => {
                        try {
                            let lo = Infinity, hi = -Infinity, tr = null;
                            for (const e of items) {
                                const p = e.entry;
                                if (!p || !p.track) continue;
                                const a = (p.xi == null || p.xi === '') ? NaN : +p.xi;
                                const b = (p.xf == null || p.xf === '') ? a : +p.xf;
                                if (!isFinite(a)) continue;
                                tr = tr || p.track;
                                lo = Math.min(lo, a, isFinite(b) ? b : a);
                                hi = Math.max(hi, a, isFinite(b) ? b : a);
                            }
                            const ax = tr && (tr.grid || tr.tgraph);
                            if (!ax || !isFinite(lo) || !isFinite(hi)) { this.setMessage(' Those compounds have no coordinates to zoom to. '); return; }
                            const pad = Math.max(20, (hi - lo) * 0.15);
                            this.animateTo(ax.X(lo - pad), ax.X(hi + pad), ax.Y(-1.2), ax.Y(1.2));
                            if (this.wake) this.wake();
                            this.setMessage(' ' + items.length + ' compound' + (items.length === 1 ? '' : 's')
                                + ' — ' + Math.round(lo) + '–' + Math.round(hi) + ' on ' + ((tr && tr.name) || 'track') + ' ');
                        } catch (e) { try { this.setMessage(' Could not navigate: ' + e + ' '); } catch (e2) { } }
                    };

                    // Pick ONE by name, in the maximised searchable list rather than a side menu.
                    // Past a handful the useful interaction is "type ASO-42", not "scroll", and a
                    // side menu is bounded by the canvas height. The compound's TYPE rides along
                    // as the secondary column, which is what the by-type submenu used to be for.
                    const pickOne = () => {
                        close();
                        try {
                            exec('baja/lib/pick-list.js', {
                                title: 'Compounds',
                                subtitle: items.length + ' selected — type to filter',
                                items: items.map((e) => ({
                                    label: e.label + (e.count > 1 ? '  ×' + e.count : ''),
                                    sub: typeOf(e),
                                    ref: e
                                })),
                                onPick: (it) => {
                                    const e = it && it.ref;
                                    if (e) openTypeMenu(e.kind, e.entry);
                                }
                            });
                        } catch (er) { }
                    };

                    // The compound's TARGET site on the track (what it hybridises to), as
                    // opposed to the molecule that was synthesised. Both are wanted, and they
                    // are not the same string: a gapmer's synthesis sequence is the reverse
                    // complement of its target, and carries chemistry that the target does not.
                    const targetSeqOf = (e) => {
                        try {
                            const pe = e.entry, t = pe && pe.track;
                            if (!t || !t.getSequenceRange) return '';
                            const a = Math.min(+pe.xi, +pe.xf), b = Math.max(+pe.xi, +pe.xf);
                            if (!isFinite(a) || !isFinite(b)) return '';
                            return ('' + (t.getSequenceRange(a, b) || '')).toUpperCase();
                        } catch (er) { return ''; }
                    };
                    const synthSeqOf = (e) => {
                        const r = e.entry && e.entry.ref;
                        return '' + ((r && (r.synthesisSequence || r.sequence)) || '');
                    };
                    const nameOf = (e, i) => ('' + (e.label || ('compound ' + (i + 1)))).trim();

                    // navigator.clipboard needs a secure context; the textarea fallback keeps
                    // copy working over plain http rather than failing silently.
                    const copyText = async (txt, what, n) => {
                        if (!('' + txt).trim()) { this.setMessage(' No ' + what + ' to copy. '); return; }
                        const done = () => this.setMessage(' Copied ' + n + ' ' + what + '. ');
                        try {
                            if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); done(); return; }
                        } catch (e) { }
                        try {
                            const ta = document.createElement('textarea');
                            ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
                            document.body.appendChild(ta); ta.select();
                            document.execCommand('copy'); document.body.removeChild(ta);
                            done();
                        } catch (e) { this.setMessage(' Could not copy: ' + e + ' '); }
                    };

                    const copySeqs = (which) => {
                        const lines = [];
                        items.forEach((e, i) => {
                            const seq = which === 'target' ? targetSeqOf(e) : synthSeqOf(e);
                            if (seq) lines.push(nameOf(e, i) + '\t' + seq);
                        });
                        // name + TAB + sequence: pastes straight into a spreadsheet as two
                        // columns, and into a text editor as a readable list.
                        copyText(lines.join('\n'), (which === 'target' ? 'target sequences' : 'synthesis sequences'), lines.length);
                    };

                    // Every attribute the compounds carry, not a fixed column list: a gapmer and
                    // an siRNA do not have the same fields, and a fixed set would silently drop
                    // whichever ones this batch happens to use.
                    const downloadXlsx = () => {
                        try {
                            if (typeof XLSX === 'undefined') { this.setMessage(' XLSX library not available. '); return; }
                            const keys = [];
                            for (const e of items) {
                                const r = e.entry && e.entry.ref;
                                if (!r) continue;
                                for (const k of Object.keys(r)) {
                                    const v = r[k];
                                    if (v == null || typeof v === 'function' || typeof v === 'object') continue;
                                    if (k.indexOf('__') === 0) continue;   // internal render state
                                    if (keys.indexOf(k) < 0) keys.push(k);
                                }
                            }
                            keys.sort();
                            const head = ['name', 'type', 'track', 'chr', 'start', 'end',
                                'target_sequence', 'synthesis_sequence'].concat(keys);
                            const aoa = [head];
                            items.forEach((e, i) => {
                                const pe = e.entry, r = (pe && pe.ref) || {};
                                const row = [
                                    nameOf(e, i), typeOf(e), (pe && pe.track && pe.track.name) || '',
                                    (pe && pe.chr) || '', (pe && pe.xi != null) ? pe.xi : '',
                                    (pe && pe.xf != null) ? pe.xf : '',
                                    targetSeqOf(e), synthSeqOf(e)
                                ];
                                for (const k of keys) row.push(r[k] == null ? '' : r[k]);
                                aoa.push(row);
                            });
                            const ws = XLSX.utils.aoa_to_sheet(aoa);
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, ws, 'Compounds');
                            XLSX.writeFile(wb, 'compounds.xlsx');
                            this.setMessage(' Downloaded ' + items.length + ' compound'
                                + (items.length === 1 ? '' : 's') + ' with ' + head.length + ' columns. ');
                        } catch (e) { this.setMessage(' XLSX export failed: ' + e + ' '); }
                    };

                    const L = this.genegraph_panel_layout;
                    const page = [
                        // { label: 'Compounds  (' + items.length + ')', header: true, click: () => { }, move: () => { } },
                        { label: 'Choose a compound…', click: () => { pickOne(); }, move: () => { } },
                        { label: 'Run off-targets…', click: () => { startOffTargets('oligo'); }, move: () => { } },
                        { label: 'Zoom into', click: () => { close(); zoomToAll(); }, move: () => { } },
                        {
                            label: 'Modify chemistry', click: () => {
                                closeHandoff();
                                try { window.current = refsOf()[0]; } catch (e) { }
                                // compound-editor-panel-all.js BUILDS and RETURNS a toolbar; it
                                // does not mount itself, and the result used to be discarded
                                // here, so this did nothing at all.
                                //
                                // Mounting it into 'buttonMenuPanel' does not work either, in
                                // THIS editor: manchester/editor.js builds a buttonMenuPanel
                                // layout object but never places it in the main_layout it
                                // actually shows, so that slot is not rendered and
                                // setComponent on it is a silent no-op. (It IS a real slot in
                                // cpd/*.js and open-screen.js, which is why the shared script
                                // still returns the toolbar for them.)
                                //
                                // So its buttons are shown in a floating modal instead, in the
                                // same shape as the editor's "Play a script" panel
                                // (baja/lib/action-modal.js), reusing each button's own
                                // ionFunction. Being an overlay on document.body it is also
                                // immune to the other failure here -- a menu closing behind it
                                // restoring a panel over the top.
                                try {
                                    Promise.resolve(exec('baja/manchester/menu/compound-editor-panel-all.js', this, L))
                                        .then((panel) => {
                                            const btns = (panel && panel.data && panel.data.buttons) || [];
                                            const items = btns.filter((b) => b && b.label).map((b) => ({
                                                label: b.label,
                                                click: () => {
                                                    try {
                                                        const fn = getIonFunction(b.ionFunction);
                                                        if (typeof fn === 'function') fn();
                                                    } catch (e) { }
                                                }
                                            }));
                                            if (!items.length) { this.setMessage(' No compound tools available. '); return; }
                                            try {
                                                exec('baja/lib/action-modal.js', {
                                                    id: 'baja-compound-tools',
                                                    title: '⚗ Compound tools',
                                                    hint: 'Applies across the compounds on the canvas.',
                                                    items: items
                                                });
                                            } catch (e) { }
                                        })
                                        .catch(() => { });
                                } catch (e) { }
                            }, move: () => { }
                        },
                        { label: 'Copy target sequences', click: () => { close(); copySeqs('target'); }, move: () => { } },
                        { label: 'Copy synthesis sequences', click: () => { close(); copySeqs('synthesis'); }, move: () => { } },
                        { label: 'Download XLSX', click: () => { close(); downloadXlsx(); }, move: () => { } },
                        {
                            label: 'Delete (' + items.length + ')', click: async () => {
                                // Deleting designs is the one destructive action in this menu, so
                                // it ASKS first -- and pushes onto the history stack before
                                // touching anything, so an accepted delete is still undoable.
                                const targets = items.slice();
                                if (!targets.length) return;
                                try {
                                    const confirm = await exec('baja/lib/confirm.js',
                                        'Delete ' + targets.length + ' selected compound'
                                        + (targets.length === 1 ? '' : 's')
                                        + '? This removes them from the track.',
                                        async () => {
                                            close();
                                            try { this.pushOntoHistory(); } catch (e) { }
                                            // Only the compounds, and only the SELECTED ones --
                                            // the rest of the selection and the rest of the track
                                            // are left alone.
                                            let n = 0;
                                            for (const e of targets) { try { removeObject(e.entry); n++; } catch (er) { } }
                                            try { if (this.wake) this.wake(); } catch (e) { }
                                            this.setMessage(' Deleted ' + n + ' compound' + (n === 1 ? '' : 's') + '. Undo restores them. ');
                                        });
                                    showModal(confirm);
                                } catch (e) { this.setMessage(' Could not open the confirmation: ' + e + ' '); }
                            }, move: () => { }
                        },
                        { label: '‹ Back', click: () => { openMain(); }, move: () => { } }
                    ];
                    show(page, 'Compounds ▸');
                };

                const buildMain = (offset) => {
                    const off = offset || 0;
                    const menu = [];
                    // Make it unmistakable that this menu acts on the SELECTED items only
                    // (not everything on the canvas).
                    menu.push({ label: 'Selected  (' + sel.length + ') —', header: true, click: () => { }, move: () => { } });

                    for (const it of sequenceRoots()) menu.push(it);

                    const distinct = distinctSelection();

                    // Annotations and compounds are branches, built at menu scope (below).
                    if (annEntries().length) {
                        menu.push({
                            label: 'Annotations (' + annEntries().length + ') ▸',
                            click: () => { openAnnotationsBranch(); },
                            move: () => { }
                        });
                    }
                    if (cpdEntries().length) {
                        menu.push({
                            label: 'Compounds (' + cpdEntries().length + ') ▸',
                            click: () => { openCompoundsBranch(); },
                            move: () => { }
                        });
                    }
                    const restEntries = distinct.filter((e) => e.kind !== 'ann' && e.kind !== 'oligo' && e.kind !== 'amplicon');

                    // Everything else -- tracks, SNPs, layer items -- stays listed directly:
                    // there are rarely many, and one click to reach them is better than two.
                    for (const e of restEntries.slice(off, off + PAGE)) menu.push(entryItem(e));
                    // Paged the same way the type pickers are, so a big lasso does not produce a
                    // menu taller than the canvas.
                    // Paging, labelled with how many are left so a long selection never looks
                    // truncated. Every selected item is reachable: the pager walks the whole
                    // deduped list, and the per-kind entries below open the full set for a type.
                    if (off > 0) {
                        menu.push({ label: '‹ Previous ' + Math.min(PAGE, off) + ' of ' + restEntries.length, click: () => { show(buildMain(Math.max(0, off - PAGE)), 'Selection ▸'); }, move: () => { } });
                    }
                    if (off + PAGE < restEntries.length) {
                        const left = restEntries.length - off - PAGE;
                        menu.push({ label: 'More… (' + left + ' of ' + restEntries.length + ' remaining)', click: () => { show(buildMain(off + PAGE), 'Selection ▸'); }, move: () => { } });
                    }

                    // Group entries, in the same biggest-first order as the items above, so the
                    // two halves of the menu agree about which type dominates the selection.
                    const kindCounts = kindsPresent
                        .map((k) => ({ k: k, n: sel.filter((s) => s.kind === k).length }))
                        .sort((a, b) => (b.n - a.n) || ('' + a.k).localeCompare('' + b.k));
                    for (const kc of kindCounts) {
                        // Annotations and compounds already have a branch of their own above;
                        // a second entry for the same set would just be two doors to one room.
                        if (kc.k === 'ann' || kc.k === 'oligo' || kc.k === 'amplicon') continue;
                        if (kc.n > 1) menu.push({ label: 'All ' + (kindLabels[kc.k] || kc.k) + ' (' + kc.n + ') ▸', click: () => { openTypeMenu(kc.k); }, move: () => { } });
                    }

                    // Whole-selection actions below the per-object roots.
                    menu.push({ label: 'Download all as CSV', click: () => { close(); this.exportSelection('csv'); }, move: () => { } });
                    menu.push({ label: 'Download all as XLSX', click: () => { close(); this.exportSelection('xlsx'); }, move: () => { } });
                    menu.push({ label: 'Delete all selected', click: () => { close(); this.removeSelection(false); }, move: () => { } });
                    menu.push({ label: 'Keep only selected (delete others)', click: () => { close(); this.removeSelection(true); }, move: () => { } });
                    menu.push({
                        label: 'Clear selection',
                        click: () => {
                            close();
                            this.clearSelectionVisuals();
                            // ...and the sequence ranges, which are not part of __lassoSelection
                            // and so survived every previous "Clear selection".
                            const __seq = this.clearSequenceSelections();
                            this.__lassoSelection = [];
                            this.__selPanelBounds = null;
                            this.showDisplay = false;
                            if (this.wake) this.wake();
                            try {
                                this.setResultMessage(__seq
                                    ? (' Selection cleared, including the selected sequence on '
                                        + __seq + ' track' + (__seq === 1 ? '' : 's') + '. ')
                                    : ' Selection cleared. ');
                            } catch (e) { }
                        },
                        move: () => { }
                    });
                    return menu;
                };

                // Clicked a specific card ROW: that object is the root of the tree, so open its
                // own menu directly instead of the whole-selection list. A sequence range has no
                // kind branch in openTypeMenu -- it is not a lassoed object -- so it goes to the
                // Selected Sequence menu, which is exactly the tree rooted at that range.
                if (rootEntry) {
                    // A packaged card row ("Compounds (18)") opens the branch, not one object.
                    if (rootEntry.__group === 'compounds') { openCompoundsBranch(); return; }
                    if (rootEntry.__group === 'annotations') { openAnnotationsBranch(); return; }
                    if (rootEntry.kind === 'sequence' && rootEntry.track) {
                        this.setMessage(' ' + (rootEntry.label || 'sequence') + ' — choose an action ');
                        closeHandoff();
                        try { Promise.resolve(exec('baja/manchester/menu/selected-sequence-menu.js', this, rootEntry.track, this.genegraph_panel_layout)).catch(() => { }); } catch (e) { }
                        return;
                    }
                    if (rootEntry.kind) {
                        this.setMessage(' ' + (rootEntry.label || rootEntry.kind) + ' — choose an action ');
                        openTypeMenu(rootEntry.kind, rootEntry);
                        return;
                    }
                }

                this.setMessage(' ' + sel.length + ' selected — choose an action ');
                openMain();
            }

            // Remove only the selected items of one object type; the rest of the
            // selection stays selected.
            removeSelectedByKind(kind) {
                const all = this.__lassoSelection || [];
                const sub = all.filter((s) => s.kind === kind);
                if (!sub.length) return;
                try { this.pushOntoHistory(); } catch (e) { }
                const spliceOut = (arr, ref) => { if (Array.isArray(arr)) { const i = arr.indexOf(ref); if (i >= 0) { arr.splice(i, 1); return true; } } return false; };
                let removed = 0;
                for (const s of sub) {
                    const t = s.track;
                    if (!t) continue;
                    if (s.kind === 'track') {
                        if (this.removeTrack) { try { this.removeTrack(s.ref); removed++; continue; } catch (e) { } }
                    } else if (s.kind === 'ann') {
                        if (t.removeAnnotation) { try { t.removeAnnotation(s.ref); removed++; continue; } catch (e) { } }
                        if (spliceOut(t.annotations, s.ref)) removed++;
                    } else if (s.kind === 'snp') {
                        if (t.removesnp) { try { t.removesnp(s.ref); removed++; continue; } catch (e) { } }
                        if (spliceOut(t.snpindels, s.ref)) removed++;
                    } else if (s.kind === 'oligo') {
                        if (t.removeOligo) { try { t.removeOligo(s.ref); removed++; continue; } catch (e) { } }
                        if (spliceOut(t.oligos, s.ref)) removed++;
                    } else if (s.kind === 'amplicon') {
                        if (s.inOligos) {
                            if (t.removeOligo) { try { t.removeOligo(s.ref); removed++; continue; } catch (e) { } }
                            if (spliceOut(t.oligos, s.ref)) removed++;
                        }
                        else if (spliceOut(s.ampArr, s.ref)) removed++;
                        else if (spliceOut(t.ampliconResults, s.ref)) removed++;
                        else if (t.ampliconResults && spliceOut(t.ampliconResults.hits, s.ref)) removed++;
                    } else if (s.kind === 'layer' && s.layer) {
                        if (spliceOut(s.layer.intervals, s.ref) || spliceOut(s.layer.pts, s.ref)) removed++;
                    }
                }
                this.__lassoSelection = all.filter((s) => s.kind !== kind);
                if (!this.__lassoSelection.length) { this.__selPanelBounds = null; this.showDisplay = false; }
                const _kl = { ann: 'annotation(s)', snp: 'SNP/indel(s)', oligo: 'oligo(s)', amplicon: 'amplicon(s)', layer: 'layer item(s)' }[kind] || (kind + '(s)');
                this.setMessage(' Removed ' + removed + ' ' + _kl + '. ');
                try { this.rescale(); } catch (e) { }
                try { this.graph.rescale(); } catch (e) { }
                if (this.wake) this.wake();
            }

            // Rows [chr, start, end, name, type, track] for the current selection.
            // Optional `kind` restricts the rows to one object type.
            _selectionRows(kind) {
                const seqOf = (s) => {
                    try {
                        const o = s && s.ref; if (!o) return '';
                        return ('' + (o.synthesisSequence || o.sequence || o.guide || o.antisense || o.sense || o.seq || '')).trim();
                    } catch (e) { return ''; }
                };
                return (this.__lassoSelection || []).filter((s) => !kind || s.kind === kind).map((s) => ({
                    chr: s.chr != null ? ('' + s.chr) : '',
                    start: Math.floor(Math.min(s.xi, s.xf)),
                    end: Math.floor(Math.max(s.xi, s.xf)),
                    name: s.label || '',
                    type: s.kind || '',
                    track: (s.track && s.track.name) || '',
                    sequence: seqOf(s),
                }));
            }

            _download(filename, content, mime) {
                try {
                    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { } }, 150);
                } catch (e) { this.setMessage(' Download failed: ' + e); }
            }

            exportSelection(fmt, kind) {
                const rows = this._selectionRows(kind);
                if (!rows.length) return;
                const name = kind ? ('selection-' + kind) : 'selection';
                if (fmt === 'bed') {
                    const txt = rows.map((r) => [r.chr || '.', r.start, r.end, ('' + (r.name || '.')).replace(/\s+/g, '_')].join('\t')).join('\n') + '\n';
                    this._download(name + '.bed', txt, 'text/plain');
                } else if (fmt === 'csv') {
                    const esc = (v) => { v = '' + (v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
                    const head = ['chr', 'start', 'end', 'name', 'type', 'track', 'sequence'];
                    const txt = [head.join(',')].concat(rows.map((r) => [r.chr, r.start, r.end, r.name, r.type, r.track, r.sequence].map(esc).join(','))).join('\n') + '\n';
                    this._download(name + '.csv', txt, 'text/csv');
                } else if (fmt === 'txt') {
                    const txt = rows.map((r) => (r.name || '') + '\t' + (r.chr ? r.chr + ':' : '') + r.start + '-' + r.end + '\t' + r.type + (r.track ? '\t' + r.track : '')).join('\n') + '\n';
                    this._download(name + '.txt', txt, 'text/plain');
                } else if (fmt === 'xlsx') {
                    try {
                        if (typeof XLSX === 'undefined') { this.setMessage(' XLSX library not available. '); return; }
                        const aoa = [['chr', 'start', 'end', 'name', 'type', 'track', 'sequence']].concat(rows.map((r) => [r.chr, r.start, r.end, r.name, r.type, r.track, r.sequence]));
                        const ws = XLSX.utils.aoa_to_sheet(aoa);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, 'Selection');
                        XLSX.writeFile(wb, name + '.xlsx');
                    } catch (e) { this.setMessage(' XLSX export failed: ' + e); return; }
                } else if (fmt === 'fasta') {
                    const txt = rows.filter((r) => r.sequence).map((r) => '>' + (('' + (r.name || 'seq')).replace(/\s+/g, '_')) + (r.chr ? ' ' + r.chr + ':' + r.start + '-' + r.end : '') + '\n' + r.sequence).join('\n') + '\n';
                    if (!('' + txt).trim()) { this.setMessage(' No sequences to export. '); return; }
                    this._download(name + '.fasta', txt, 'text/plain');
                }
                this.setMessage(' Exported ' + rows.length + ' item(s) as ' + fmt.toUpperCase() + '. ');
            }

            // Remove the selected items, or (keepOnly) remove everything BUT them.
            removeSelection(keepOnly) {



                const sel = this.__lassoSelection || [];
                if (!sel.length) return;
                try { this.pushOntoHistory(); } catch (e) { }
                this.clearSelectionVisuals();   // restore original colors before mutating
                const spliceOut = (arr, ref) => { if (Array.isArray(arr)) { const i = arr.indexOf(ref); if (i >= 0) { arr.splice(i, 1); return true; } } return false; };
                if (keepOnly) {
                    const keep = new Set(sel.map((s) => s.ref));
                    // Scope to ONLY the layers that contain a selected item — leave the
                    // track's annotations/SNPs and any other layers untouched.
                    const layers = new Set(sel.filter((s) => s.kind === 'layer' && s.layer).map((s) => s.layer));
                    if (!layers.size) { this.setMessage(' No layer items selected — nothing to keep. '); return; }
                    for (const layer of layers) {
                        if (Array.isArray(layer.intervals)) layer.intervals = layer.intervals.filter((iv) => keep.has(iv));
                        if (Array.isArray(layer.pts)) layer.pts = layer.pts.filter((p) => keep.has(p));
                    }
                    this.setMessage(' Kept only the selected items in ' + layers.size + ' layer(s). ');
                } else {
                    let removed = 0;
                    for (const s of sel) {
                        const t = s.track;
                        if (!t) continue;
                        if (s.kind === 'ann') {
                            if (t.removeAnnotation) { try { t.removeAnnotation(s.ref); removed++; continue; } catch (e) { } }
                            if (spliceOut(t.annotations, s.ref)) removed++;
                        } else if (s.kind === 'snp') {
                            if (t.removesnp) { try { t.removesnp(s.ref); removed++; continue; } catch (e) { } }
                            if (spliceOut(t.snpindels, s.ref)) removed++;
                        } else if (s.kind === 'oligo') {
                            if (t.removeOligo) { try { t.removeOligo(s.ref); removed++; continue; } catch (e) { } }
                            if (spliceOut(t.oligos, s.ref)) removed++;
                        } else if (s.kind === 'amplicon') {
                            if (s.inOligos) {
                                if (t.removeOligo) { try { t.removeOligo(s.ref); removed++; continue; } catch (e) { } }
                                if (spliceOut(t.oligos, s.ref)) removed++;
                            }
                            else if (spliceOut(s.ampArr, s.ref)) removed++;
                            else if (spliceOut(t.ampliconResults, s.ref)) removed++;
                            else if (t.ampliconResults && spliceOut(t.ampliconResults.hits, s.ref)) removed++;
                        } else if (s.kind === 'layer' && s.layer) {
                            if (spliceOut(s.layer.intervals, s.ref) || spliceOut(s.layer.pts, s.ref)) removed++;
                        }
                    }
                    this.setMessage(' Removed ' + removed + ' selected item(s). ');
                }
                this.__lassoSelection = [];
                this.__selPanelBounds = null;
                try { this.rescale(); } catch (e) { }
                try { this.graph.rescale(); } catch (e) { }
                if (this.wake) this.wake();
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

                ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, -apple-system, Arial, sans-serif`;
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

                ctx.shadowColor = 'rgba(8, 22, 38, 0.45)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 6;

                // Parrot-tropical card: vivid orange gradient fill so mouse hints pop off
                // the canvas, with a bright cyan border and dark text.
                const grad = ctx.createLinearGradient(boxX, liftedBoxY, boxX + boxW, liftedBoxY + boxH);
                grad.addColorStop(0.0, '#ff8c1a');   // tropical orange
                grad.addColorStop(0.5, '#ff6f3c');   // coral orange
                grad.addColorStop(1.0, '#ffa733');   // amber
                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.fillStyle = grad;
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                roundRect(boxX, liftedBoxY, boxW, boxH, radius);
                ctx.strokeStyle = '#12c2e0';   // bright cyan border
                ctx.lineWidth = 2;
                ctx.stroke();

                roundRect(boxX + 2, liftedBoxY + 2, boxW - 4, boxH - 4, Math.max(1, radius - 2));
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';   // bright inner ring
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.shadowColor = 'rgba(18, 194, 224, 0.55)';    // cyan glow
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#08243a';                       // dark navy text for contrast
                ctx.fillText(text, textX, liftedBoxY + paddingY);

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;

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
                    if (this.showDisplay && this.track && this.track.length > 0) {
                        ctx.textAlign = 'left';
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'gray';
                        let font = `15px Arial`;
                        ctx.font = font;
                        ctx.fillStyle = 'lightGray';
                        let ocount = 0;
                        let i = 1;

                        if (this.folder && this.folder != undefined && this.folder.name != undefined) {
                            ctx.fillText('Folder: ' + this.folder.name, 20, 75);
                        }
                        if (this.file) {
                            ctx.fillText('File: ' + this.file, 20, 100);
                        } else {

                        }
                        // Info panel + lasso selection list are drawn at the END of
                        // redraw (via drawInfoPanel) so they render ABOVE the tracks.

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
                            // Top-left of the top strip. It was at the FOOT of the canvas, where
                            // the free-plan bar sits and where some devices do not show the
                            // canvas at all -- lifting it clear of the bar still left it in the
                            // part of the canvas that can be off screen. Same strip as the
                            // toast, which starts a line lower so the two never overlap.
                            ctx.fillText('(' + this.coords + ', ' + this.ycoords + ')', 6, this.__topStripY());

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

                        // A selection arrow head under the pointer (or one being dragged) reads
                        // as a resize handle, whatever the current mouse mode is.
                        let __overMark = !!this.__dragMark;
                        if (!__overMark) {
                            try {
                                const __ms = this.graph.__moveScreen;
                                if (__ms && Number.isFinite(__ms.x) && Number.isFinite(__ms.y)) {
                                    __overMark = !!this.__hitSelectionArrow(__ms.x, __ms.y);
                                }
                            } catch (e) { }
                        }
                        if (__overMark) {
                            style.cursor = 'col-resize';
                        } else if (mode === 'navigate') {
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
                    // Surface ERROR (orange) and RESULT/summary (cyan) messages as the on-canvas
                    // toast; transient working/status ("Loading…", "Uploading…") are not drawn.
                    if (this.message && (this.messageIsError || this.messageIsResult)) {
                        // Production-quality toast: a rounded navy card with a cyan
                        // accent bar and white text that WRAPS to stay on screen.
                        const msg = ('' + this.message).trim();
                        if (msg) {
                            ctx.save();
                            this.resetCanvasEffects(ctx);

                            const cw = ctx.canvas.width, ch = ctx.canvas.height;
                            const fontSize = isMobile() ? 12 : 14;
                            ctx.font = '600 ' + fontSize + 'px "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'top';

                            const padX = 14, padY = 10, lineH = fontSize + 6;
                            const maxCardW = Math.min(560, Math.max(160, cw - 40));
                            const maxTextW = maxCardW - padX * 2;

                            // Word-wrap (hard-break tokens longer than a line).
                            const words = msg.split(/\s+/);
                            const lines = [];
                            let cur = '';
                            for (let w of words) {
                                while (ctx.measureText(w).width > maxTextW && w.length > 1) {
                                    let k = w.length;
                                    while (k > 1 && ctx.measureText(w.slice(0, k)).width > maxTextW) k--;
                                    if (cur) { lines.push(cur); cur = ''; }
                                    lines.push(w.slice(0, k));
                                    w = w.slice(k);
                                }
                                const test = cur ? cur + ' ' + w : w;
                                if (cur && ctx.measureText(test).width > maxTextW) { lines.push(cur); cur = w; }
                                else cur = test;
                            }
                            if (cur) lines.push(cur);

                            const maxLines = 5;
                            let shown = lines;
                            if (lines.length > maxLines) {
                                shown = lines.slice(0, maxLines);
                                shown[maxLines - 1] = shown[maxLines - 1].replace(/.$/, '') + '…';
                            }

                            let textW = 0;
                            for (const l of shown) textW = Math.max(textW, ctx.measureText(l).width);
                            const cardW = Math.min(maxCardW, Math.ceil(textW) + padX * 2);
                            const cardH = padY * 2 + lineH * shown.length;

                            let cardX = Math.round((cw - cardW) / 2);
                            // TOP centre, immediately below the control-button row.
                            //
                            // Nothing is drawn at the FOOT of the canvas any more. Two reasons,
                            // and the second is the one that decides it: the free-plan bar is
                            // fixed to the bottom of the window and painted over the canvas, so
                            // a message there sat under the one piece of chrome a free user
                            // always has; and on some devices the foot of the canvas is not on
                            // screen at all, so a message there could be shown to nobody. Moving
                            // it up was not enough -- a reserve big enough for the bar is still a
                            // guess about where the viewport ends. The top strip is the part
                            // that is always visible.
                            //
                            // It also puts every message in ONE place: in-progress status
                            // already appears in the badge under these buttons (see setMessage),
                            // so results and errors now land in the same strip rather than at the
                            // opposite end of the canvas from the work that produced them.
                            //
                            // __topStripY() measures the button row rather than guessing at it,
                            // so moving or resizing that row moves the toast with it.
                            // One line below the coordinate readout, which shares this strip.
                            let cardY = this.__topStripY() + 18;
                            cardX = Math.max(8, Math.min(cardX, cw - cardW - 8));
                            // A canvas too short to hold the card below the buttons keeps it on
                            // screen rather than pushing it off the bottom.
                            cardY = Math.max(8, Math.min(cardY, Math.max(8, ch - cardH - 8)));

                            // Glow behind the card — ORANGE for error messages, cyan otherwise.
                            const __msgErr = !!this.messageIsError;
                            ctx.shadowColor = __msgErr ? 'rgba(255,140,66,0.95)' : 'rgba(26,163,189,0.90)';
                            ctx.shadowBlur = 20;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                            ctx.fillStyle = 'rgba(10,37,64,0.96)';   // navy card
                            this.roundRectPath(ctx, cardX, cardY, cardW, cardH, 9);
                            ctx.fill();
                            ctx.fill();                              // second pass to intensify the glow

                            this.resetCanvasEffects(ctx);
                            ctx.lineWidth = 1;
                            ctx.strokeStyle = __msgErr ? '#ff8c42' : '#1aa3bd';   // orange (error) / cyan border
                            this.roundRectPath(ctx, cardX, cardY, cardW, cardH, 9);
                            ctx.stroke();

                            ctx.fillStyle = '#ffffff';
                            let ty = cardY + padY;
                            for (const l of shown) { ctx.fillText(l, cardX + padX, ty); ty += lineH; }

                            ctx.restore();
                        }
                    }
                    // Bold centered "sunset orange" announcement (setSunsetMessage) — large
                    // gradient letters with a warm glow, centered on the canvas.
                    if (this.sunsetMessage) {
                        const smsg = ('' + this.sunsetMessage).trim();
                        if (smsg) {
                            ctx.save();
                            this.resetCanvasEffects(ctx);
                            const cw = ctx.canvas.width, ch = ctx.canvas.height;
                            const cx = cw / 2, cy = ch / 2;
                            let fs = Math.max(26, Math.round(Math.min(cw, ch) * 0.06));
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            // 80s / synthwave display face; falls back to a heavy sans until loaded.
                            const fam = '"Audiowide", "Impact", "Arial Black", system-ui, sans-serif';
                            // Shrink to fit the canvas width if the message is long.
                            ctx.font = fs + 'px ' + fam;
                            let tw = ctx.measureText(smsg).width;
                            const maxW = cw - 48;
                            if (tw > maxW) {
                                fs = Math.max(16, Math.floor(fs * maxW / tw));
                                ctx.font = fs + 'px ' + fam;
                                tw = ctx.measureText(smsg).width;
                            }
                            // Warm sunset gradient across the text (amber -> orange -> pink).
                            const grad = ctx.createLinearGradient(cx - tw / 2, cy, cx + tw / 2, cy);
                            grad.addColorStop(0, '#ffb020');
                            grad.addColorStop(0.5, '#ff6d3a');
                            grad.addColorStop(1, '#ff3d6e');
                            // Dark outline + warm glow so it pops off the canvas.
                            ctx.shadowColor = 'rgba(255,109,58,0.85)';
                            ctx.shadowBlur = 28;
                            ctx.lineJoin = 'round';
                            ctx.lineWidth = Math.max(3, Math.round(fs * 0.14));
                            ctx.strokeStyle = 'rgba(40,12,0,0.6)';
                            ctx.strokeText(smsg, cx, cy);
                            ctx.shadowColor = 'transparent';
                            ctx.fillStyle = grad;
                            ctx.fillText(smsg, cx, cy);
                            ctx.restore();
                        }
                    }
                    // Persistent title banner across the very top of the canvas (above all
                    // tracks) — e.g. a manuscript's title. Word-wrapped to the canvas width.
                    if (this.titleText) {
                        const ttl = ('' + this.titleText).trim();
                        if (ttl) {
                            ctx.save();
                            this.resetCanvasEffects(ctx);
                            const cw = ctx.canvas.width;
                            let fs = Math.max(13, Math.min(22, Math.round(cw * 0.015)));
                            const fam = '"Georgia", "Times New Roman", serif';
                            ctx.font = '600 ' + fs + 'px ' + fam;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            const maxW = cw - 40;
                            const words = ttl.split(/\s+/);
                            const lines = [];
                            let cur = '';
                            for (const w of words) {
                                const test = cur ? cur + ' ' + w : w;
                                if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
                                else cur = test;
                            }
                            if (cur) lines.push(cur);
                            const lineH = fs + 5;
                            const padY = 8;
                            const boxH = padY * 2 + lines.length * lineH;
                            ctx.fillStyle = 'rgba(18,26,44,0.86)';
                            ctx.fillRect(0, 0, cw, boxH);
                            ctx.fillStyle = '#ffd98a';
                            let ty = padY;
                            for (const l of lines) { ctx.fillText(l, cw / 2, ty); ty += lineH; }
                            ctx.restore();
                        }
                    }
                    // Brand icon centered on an empty canvas (startup) — shown instead of a
                    // text center-message; auto-hides as soon as a track is loaded.
                    try {
                        if (this.centerLogoUrl && this.__centerLogoImg && (!this.track || this.track.length === 0)) {
                            // Hold at full, then fade to nothing. Once faded the url is cleared
                            // so the redraw loop stops being woken for it.
                            const __el = Date.now() - (this.__centerLogoAt || 0);
                            const __hold = (this.__centerLogoHold == null) ? 1400 : this.__centerLogoHold;
                            const __fade = (this.__centerLogoFade == null) ? 1800 : this.__centerLogoFade;
                            let __a = 1;
                            if (__el > __hold) __a = 1 - ((__el - __hold) / __fade);
                            if (__a <= 0) {
                                this.centerLogoUrl = null;
                                this.__centerLogoImg = null;
                                this.__centerLogoImgUrl = null;
                                return;
                            }
                            // Still fading: keep the loop alive so the alpha actually animates.
                            if (this.wake) setTimeout(() => { try { this.wake(); } catch (e) { } }, 40);
                            const img = this.__centerLogoImg;
                            let iw = img.naturalWidth || 64, ih = img.naturalHeight || 64;
                            if (!iw || !ih) { iw = 64; ih = 64; }
                            const cw = ctx.canvas.width, ch = ctx.canvas.height;
                            const target = Math.max(120, Math.min(cw, ch) * 0.26);
                            const scale = target / Math.max(iw, ih);
                            const dw = iw * scale, dh = ih * scale;
                            ctx.save();
                            this.resetCanvasEffects(ctx);
                            ctx.globalAlpha = 0.92 * __a;
                            ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
                            ctx.restore();
                        }
                    } catch (e) { }
                    // Backend working signal is now the DOM "working" badge (a CSS-animated
                    // ring + a plain-language status line) managed in io-engine — it can't
                    // freeze if this redraw loop stalls. The old canvas-drawn spinner below is
                    // disabled to avoid a second (and sometimes static) ring.
                    try {
                        if (false && typeof window !== 'undefined' && window.__backendWorkCount > 0) {
                            const _t = Date.now() / 1000;
                            // Center over the tracks: the middle of the graph grid in
                            // screen space (fall back to the canvas center).
                            let _cx = ctx.canvas.width / 2, _cy = ctx.canvas.height / 2;
                            try {
                                const _g = this.graph && this.graph.grid;
                                if (_g) {
                                    const _sx = this.graph.X((_g.xmin + _g.xmax) / 2);
                                    const _sy = this.graph.Y((_g.ymin + _g.ymax) / 2);
                                    if (isFinite(_sx)) _cx = _sx;
                                    if (isFinite(_sy)) _cy = _sy;
                                }
                            } catch (e) { }
                            const _R = 42;
                            ctx.save();
                            ctx.lineWidth = 8;
                            ctx.lineCap = 'round';
                            ctx.beginPath();
                            ctx.arc(_cx, _cy, _R, 0, Math.PI * 2);
                            ctx.strokeStyle = 'rgba(1,28,60,0.15)';
                            ctx.stroke();
                            const _spin = _t * 3.2;
                            ctx.beginPath();
                            ctx.arc(_cx, _cy, _R, _spin, _spin + Math.PI * 0.8);
                            ctx.strokeStyle = 'rgba(1,28,60,0.85)';
                            ctx.stroke();
                            ctx.font = 'bold 18px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            ctx.fillStyle = 'rgba(1,28,60,0.85)';
                            // ctx.fillText('Searching…', _cx, _cy + _R + 12);
                            ctx.restore();
                        }
                    } catch (e) { }
                    if (this.mouse_message) {

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
                        ctx.font = `600 ${smallfontSize}px "Segoe UI", Arial, sans-serif`;

                        const padding = 6;
                        const text = this.mouse_message || "";
                        const metrics = ctx.measureText(text);
                        const textWidth = metrics.width;
                        const textHeight = smallfontSize * 1.2;
                        const bx = mx - padding, by = my - padding;
                        const bw = textWidth + padding * 2, bh = textHeight + padding * 2;

                        // Tropical card: navy fill, cyan border + left accent bar, white
                        // text — matches the info panel and the control buttons.
                        ctx.save();
                        ctx.shadowColor = 'rgba(16,24,40,0.35)';
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 3;
                        ctx.fillStyle = 'rgba(10,37,64,0.96)';
                        roundRectPath(ctx, bx, by, bw, bh, 8);
                        ctx.fill();
                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.lineWidth = 1.2;
                        ctx.strokeStyle = '#1aa3bd';
                        roundRectPath(ctx, bx, by, bw, bh, 8);
                        ctx.stroke();
                        ctx.fillStyle = '#1aa3bd';
                        roundRectPath(ctx, bx, by, 3.5, bh, 8);
                        ctx.fill();
                        ctx.restore();

                        ctx.fillStyle = '#ffffff';
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

                        // The nav buttons live at fixed SCREEN coordinates and are hit-tested in
                        // raw screen space. Force an identity transform here so no transform left
                        // over from track/scene drawing can shift them away from where the mouse
                        // expects them (the reported "buttons drift left at high zoom" desync).
                        ctx.save();
                        try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (e) { }
                        this.drawZoomButton(ctx);
                        this.drawZoomOutButton(ctx);
                        this.drawMoveButton(ctx);
                        this.drawBoxButton(ctx);
                        this.drawLassoButton(ctx);
                        this.drawSelectSeqButton(ctx);
                        this.drawContractHorizontalButton(ctx);
                        this.drawInfoButton(ctx);
                        this.drawControlHelp(ctx);
                        this.drawContractVerticalButton(ctx);
                        this.drawExpandHorizontalButton(ctx);
                        this.drawExpandVerticalButton(ctx);
                        this.drawControlButtonHover(ctx);
                        ctx.restore();
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
                    // Selection window is drawn here — above the tracks but BELOW the
                    // menus, so the side menu / center menu render on top of it.
                    try { this.drawHoverCrosshair(ctx); } catch (e) { }
                    // Info + selection panels are fixed-screen-coordinate overlays (hit-tested in
                    // raw screen space); draw them under an identity transform so nothing shifts them.
                    try { ctx.save(); try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (e) { } this.drawInfoPanel(ctx); ctx.restore(); } catch (e) { try { ctx.restore(); } catch (e2) { } }

                    // First track on a blank canvas → one-time "click here to see options"
                    // hint for ~10s. Detected as a 0→1 track transition seen by the draw
                    // loop (path-agnostic); a keep-alive wake() keeps it rendering.
                    try {
                        const n = (this.track && this.track.length) || 0;
                        if (!this.__selHintShown && n >= 1 && this.__prevTrackCount === 0) {
                            this.__selHintShown = true;
                            this.__selHintUntil = Date.now() + 3000;
                            this.__selHintTimer = setInterval(() => {
                                if (this.wake) this.wake();
                                if (!this.__selHintUntil || Date.now() >= this.__selHintUntil) {
                                    this.__selHintUntil = 0;
                                    clearInterval(this.__selHintTimer);
                                }
                            }, 60);
                        }
                        this.__prevTrackCount = n;
                        this.drawSelectionHint(ctx);
                    } catch (e) { }

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
                    // When the center (context) menu is up, don't also show the side menu.
                    if (menuToDraw && !this.menu) {
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
                    } else {
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

                    // The center-canvas "hold on… crunching" spinner is replaced by the upper-left
                    // window message spinner (a fixed DOM notice with a spinning ring). Show/hide it
                    // from the same showSprite flag; it animates via CSS (no per-frame canvas draw).
                    spriteObject = null;
                    try {
                        if (this.showSprite) this._showWorkSpinner(window.__workStatus || 'Working…');
                        else this._hideWorkSpinner();
                    } catch (e) { }

                }

            }

            setCenterParagraph(txt) {
                if (this.wake) this.wake();
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
                // Never build a track with NaN/null/zero-length coordinates (e.g. a failed
                // Ensembl lookup returning bad or missing start/end). Such a track corrupts
                // the shared layout and impacts other tracks — so notify the user and return
                // null here, BEFORE any track object exists; callers must bail on null.
                const s = +start, e = +end;
                if (!isFinite(s) || !isFinite(e) || s === e) {
                    try { this.setMessage(' A track failed to load: ' + (name || 'unknown') + ' '); } catch (ex) { }
                    return null;
                }
                let t = new Track(name, start, end, 2, strand)

                this.addTrack(t)
                this.notifyTrackListener();
                // Vertical spacing between stacked tracks (bump up for more breathing room).
                t.tgraph.yi = (this.track.length + 1) * (this.trackVerticalSpacing || 1.6);
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

                this.track.push(this.ensureUniqueTrackName(t))
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

        // Subscription check, run once the graph exists.
        //
        // Asked HERE as well as in the app shell because this is the object every editor and
        // viewer builds on: whatever route the user came in by, this has run. The shell polls
        // /free-quota for the live answer; this is the backstop that makes sure the question is
        // asked at all.
        //
        // TWO tries. One failure is a blip and must not label a paying user; a second says the
        // check is not answering, and the honest position then is that the subscription is
        // unproven -- the user is treated as free-tier and the badge says so. It is a display
        // decision: the metered calls are capped server-side either way.
        //
        // A later successful check clears both flags, so a subscriber who tripped this during a
        // network wobble gets the badge removed on the shell's next 20-second poll.
        try {
            setTimeout(async () => {
                let tries = 0;
                const attempt = async () => {
                    tries++;
                    try {
                        const SUB = await exec('lib/subscription.js');
                        const active = await SUB.checkSubscription();   // true / false / null
                        if (active === true) {
                            try { window.__bajaFreeTier = false; window.__bajaFreeUnverified = false; } catch (e) { }
                            return;
                        }
                        if (active === false) {
                            // A definite answer: not subscribed. Free tier, and not "unverified"
                            // -- the check worked, the user simply does not pay.
                            try { window.__bajaFreeTier = true; window.__bajaFreeUnverified = false; } catch (e) { }
                            return;
                        }
                    } catch (e) { }
                    // null or threw: unverified.
                    if (tries < 2) { setTimeout(attempt, 4000); return; }
                    try {
                        window.__bajaFreeTier = true;
                        window.__bajaFreeUnverified = true;
                        console.warn('subscription could not be verified after ' + tries + ' tries; treating as free tier');
                    } catch (e) { }
                };
                attempt();
            }, 1500);
        } catch (e) { }

        return resolve(gg)
    })

}
