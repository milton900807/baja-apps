function (progress) {

    return new Promise(async (resolve, rej) => {

        let __leaving_for_signup = false;
        let ___firsttime = false;
        function createNucleotide({ chain, x, y }) {
            return {
                type: "svg_group",
                x,
                y,
                shapes: [
                    {
                        type: "ellipse",
                        cx: x,
                        cy: y,
                        rx: 24,
                        ry: 16,
                        style: {
                            fill: "#ECFDF3",
                            stroke: "#16A34A",
                            strokeWidth: 2
                        }
                    },
                    {
                        type: "text",
                        x: x,
                        y: y,
                        text: chain === "top" ? "A" : "U",
                        fontSize: 18,
                        style: {
                            fill: "#2563EB"
                        }
                    }
                ]
            };
        }



        let ___previous_selected_objects = null;


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


        function isValidFormulaString(str, allowedFunctions = []) {
            if (typeof str !== 'string') return false;

            str = str.trim();
            if (!str) return false;

            const allowed = allowedFunctions.map(f => f.toLowerCase());

            function hasBalancedParensAndBrackets(s) {
                const stack = [];
                const pairs = { ')': '(', ']': '[' };

                for (let ch of s) {
                    if (ch === '(' || ch === '[') {
                        stack.push(ch);
                    } else if (ch === ')' || ch === ']') {
                        if (stack.pop() !== pairs[ch]) return false;
                    }
                }

                return stack.length === 0;
            }

            function isValidTableReference(s) {
                // Supports:
                // ribogreen[Well]
                // ribogreen[Well,row]
                // ribogreen[Well and row5]
                // ribogreen[1:2][3:4]
                // ribogreen[1][2]
                const tableRefPattern =
                    /^[a-zA-Z_][a-zA-Z0-9_]*\[[a-zA-Z0-9_:\s,]+?\](?:\[[a-zA-Z0-9_:\s,]+?\])?$/;

                return tableRefPattern.test(s);
            }

            function isValidFunctionCall(s) {
                const match = s.match(/^([a-zA-Z_]\w*)\s*\((.*)\)$/);
                if (!match) return false;

                const functionName = match[1].toLowerCase();

                if (allowed.length > 0 && !allowed.includes(functionName)) {
                    return false;
                }

                return true;
            }

            if (!hasBalancedParensAndBrackets(str)) return false;

            // Direct table/group access like ribogreen[Well,row]
            if (isValidTableReference(str)) return true;

            // Function call like average(ribogreen[Well,row])
            if (isValidFunctionCall(str)) return true;

            // Numeric constants
            if (!isNaN(str)) return true;

            // Basic expressions containing table refs / functions / numbers
            const safeExpressionPattern = /^[a-zA-Z0-9_\[\]\(\),:\s+\-*/.^<>=!'"`]+$/;
            return safeExpressionPattern.test(str);
        }

        function detectDPI() {
            const div = document.createElement("div");
            div.style.width = "1in";
            div.style.height = "1in";
            div.style.position = "absolute";
            div.style.visibility = "hidden";

            document.body.appendChild(div);
            const dpi = div.offsetWidth;
            document.body.removeChild(div);

            return dpi;
        }
        function feetInchesToPx(feet, inches = 0) {
            const dpi = detectDPI();
            const totalInches = (feet * 12) + inches;
            return totalInches * dpi;
        }

        let Menu = await exec('flexigraph/menu.js');
        if (isMobile()) {
            Menu = await exec('flexigraph/menu-m.js')
        }
        if (progress) {
            progress(21)
        }

        let MGrid = await exec('flexigraph/grid.js');
        let HM = await exec('baja/history/HM')
        let GenericWell = await exec('baja/plate/well')
        if (progress) {
            progress(22)
        }

        let Glyph = await exec('baja/draw/glyph.js')

        if (progress) {
            progress(24)
        }

        let Plate = await exec('baja/plate/plate.js');

        if (progress) {
            progress(25)
        }

        let MPlot = await exec("flexigraph/plot.js");

        if (progress) {
            progress(27)
        }

        let Shape = await exec('flexigraph/shapes/shape.js')

        if (progress) {
            progress(28)
        }

        let MSGraph = await exec('lib/msgraph.js');

        if (progress) {
            progress(29)
        }

        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let scroll_y = 10;
        let scrollbarHeight = 25;
        let scrollbarWidth = 50;
        let scrollbarX = 20;
        let scrollbarY = 0;
        let scrollGrid = null;
        let text = '';
        let textActive = false;
        let cursorPos = 0;
        let textBoxX = 0;
        let textBoxY = 0;
        let textBoxWidth = 190;
        let textBoxHeight = 50;
        let selectText = false;
        let textStyle = 'search'
        let initBox = true;
        let selected_glyphs = [];
        let selectedPoints = []
        let clickedButtons = new Set();
        let buttonLabels = ["Exit Folder"];
        let sprite = null;

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


        function demoAttachToCanvas(canvas) {
            const ctx = canvas.getContext('2d');
            const sprite = new FinancialCalcSprite(canvas.width / 2, canvas.height / 2, 1);

            let last = performance.now();
            function frame(now) {
                const dt = Math.min((now - last) / 1000, 0.05);
                last = now;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                sprite.update(dt);
                sprite.draw(ctx);

                requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }

        function isObjectVisible(obj, canvas, grid = this.grid) {
            if (!obj || !obj.grid) return false;

            const sx = grid.X(obj.grid.xi);
            const sy = grid.Y(obj.grid.yi);
            const sw = grid.screenWidth(obj.grid.width);
            const sh = grid.screenHeight(obj.grid.height);

            const left = sx;
            const top = sy;
            const right = sx + sw;
            const bottom = sy + sh;

            return !(right < 0 || bottom < 0 || left > canvas.width || top > canvas.height);
        }

        function collectAllObjectsTopDown() {

            const glyphsTopDown = (this.glyphs || []).slice();
            const rootLikeDraw = (this.root || []).slice().reverse();
            const plots = (this.m_plots || []).slice();
            const maybeSel = this.selectedPlate ? [this.selectedPlate] : [];

            const all = [...rootLikeDraw, ...plots, ...maybeSel].filter(Boolean);

            all.sort((a, b) => {
                const aBg = a.isBackground ? 0 : 1;
                const bBg = b.isBackground ? 0 : 1;
                return aBg - bBg;
            });

            return [...glyphsTopDown, ...all];
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

        let delayMs = 500;

        function getOverlappingRanges(singleRange, ro) {

            if (!ro) {
                return;
            }


            const rangeArray = Object.keys(ro);

            const rangeRegex = /^(\w+)\[(.*?):(.*?)\]\[(.*?):(.*?)\]$/;

            const parseCoord = (value, isStart) => {
                if (value === "") return isStart ? -Infinity : Infinity;
                const num = Number(value);
                return isNaN(num) ? null : num;
            };

            const singleMatch = singleRange.match(rangeRegex);
            if (!singleMatch) {
                throw new Error("Invalid range format for singleRange. Must be in 'table[xi:xf][yi:yf]'.");
            }

            const singleTable = singleMatch[1];
            const singleXi = parseCoord(singleMatch[2], true);
            const singleXf = parseCoord(singleMatch[3], false);
            const singleYi = parseCoord(singleMatch[4], true);
            const singleYf = parseCoord(singleMatch[5], false);

            const overlappingRanges = [];

            for (const range of rangeArray) {
                const rangeMatch = range.match(rangeRegex);
                // if (!rangeMatch) {
                //     delete this.formulas[range];
                //     continue;
                // }

                const table = rangeMatch[1];
                const xi = parseCoord(rangeMatch[2], true);
                const xf = parseCoord(rangeMatch[3], false);
                const yi = parseCoord(rangeMatch[4], true);
                const yf = parseCoord(rangeMatch[5], false);

                if (singleTable === table) {
                    const xOverlap = singleXi <= xf && singleXf >= xi;
                    const yOverlap = singleYi <= yf && singleYf >= yi;

                    if (xOverlap && yOverlap) {
                        overlappingRanges.push(ro[range]);
                    }
                }
            }

            return overlappingRanges;
        }
        function removeFormulaForWell(wellRange, ro) {

            const rangeRegex = /^(\w+)\[(.*?):(.*?)\]\[(.*?):(.*?)\]$/;

            const match = wellRange.match(rangeRegex);
            if (!match) {
                throw new Error("Invalid range format. Must be in 'table[x:y][x:y]'.");
            }

            const table = match[1];
            const xi = match[2];
            const xf = match[3];
            const yi = match[4];
            const yf = match[5];

            if (xi !== xf || yi !== yf) {
                throw new Error("Only single wells can be removed. Use format like 'table[5:5][3:3]'.");
            }

            const key = `${table}[${xi}:${xf}][${yi}:${yf}]`;

            if (ro.hasOwnProperty(key)) {
                delete ro[key];
                return true;
            }

            return false;
        }

        function normalizeDegenerateIndices(expr) {
            return (expr || "").replace(/(\w+)\[(\d+):\d+\]\[(\d+):\d+\]/g, (_m, t, i, j) => `${t}[${i}][${j}]`);
        }

        function extractRefTokens(expr) {
            if (!expr) return [];

            const tokens = new Set();
            const s = normalizeDegenerateIndices(expr);

            const propertyConditionPattern = /(\w+\[\d+\]\.\w+(?:\s*(?:==|!=|>|<|>=|<=)\s*[^+\-*/^()]+)?)/g;
            let m;
            while ((m = propertyConditionPattern.exec(s)) !== null) {
                tokens.add(m[1].trim());
            }

            const doubleIndexPattern = /\b(\w+\[\d+\]\[\d+\])/g;
            while ((m = doubleIndexPattern.exec(s)) !== null) {
                tokens.add(m[1]);
            }

            const labelLikePattern = /\b(\w+\[(?:"[^"\n\r]*"|[^\[\]\s]+)\])/g;
            while ((m = labelLikePattern.exec(s)) !== null) {
                const tok = m[1];

                if (!/^\w+\[\d+\]\[\d+\]$/.test(tok)) tokens.add(tok);
            }

            return Array.from(tokens);
        }

        function isMissingValue(v) {
            if (v === null || v === undefined) return true;
            if (typeof v === "number" && Number.isNaN(v)) return true;
            if (Array.isArray(v)) return v.length === 0;

            if (typeof v === "object" && v && !("value" in v)) return true;
            return false;
        }

        function materializeMissingFields(missingMap, tables, opts = {}) {
            const { skipAutoLabel = true } = opts;
            const added = [];
            const skipped = [];

            if (!missingMap || typeof missingMap !== "object") {
                return { added, skipped };
            }

            const resolveTableByName = (name) => {
                if (!tables) return null;
                const target = String(name).toLowerCase();

                for (const t of Object.values(tables)) {
                    if (t && typeof t.name === "string" && t.name.toLowerCase() === target) {
                        return t;
                    }
                }

                for (const [k, t] of Object.entries(tables)) {
                    if (String(k).toLowerCase() === target) {
                        return t;
                    }
                }
                return null;
            };

            const hasExactlyTwoColumns = (table) =>
                table && Array.isArray(table.wells) && table.wells.length === 2;

            const hasLabelInFirstCol = (table, label) => {
                if (!table || !table.wells || !table.wells[0]) return false;

                const normalize = (v) => {
                    if (v == null) return "";
                    let s = String(v).trim();

                    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
                        s = s.slice(1, -1).trim();
                    }
                    return s.toLowerCase();
                };

                const want = normalize(label);
                const col0 = table.wells[0] || [];

                for (const well of col0) {
                    const v =
                        (well && (well.value ?? well.name)) ??
                        (typeof well === "string" ? well : undefined);
                    if (normalize(v) === want) return true;
                }
                return false;
            };

            for (const [tableName, labels] of Object.entries(missingMap)) {
                const table = resolveTableByName(tableName);

                if (!table) {

                    (labels || []).forEach((label) =>
                        skipped.push({ table: tableName, label, reason: "table_not_found" })
                    );
                    continue;
                }

                if (!hasExactlyTwoColumns(table)) {
                    (labels || []).forEach((label) =>
                        skipped.push({
                            table: table.name || tableName,
                            label,
                            reason: "not_two_columns",
                        })
                    );
                    continue;
                }

                for (const rawLabel of labels || []) {

                    if (hasLabelInFirstCol(table, rawLabel)) {
                        skipped.push({
                            table: table.name || tableName,
                            label: rawLabel,
                            reason: "already_exists",
                        });
                        continue;
                    }

                    if (typeof table.addRow !== "function") {
                        skipped.push({
                            table: table.name || tableName,
                            label: rawLabel,
                            reason: "no_addRow_method",
                        });
                        continue;
                    }

                    table.addRow([String(rawLabel), ""]);
                    table.setValueByIndex('first', 'last', rawLabel)
                    added.push({
                        table: table.name || tableName,
                        label: rawLabel,
                        value: "",
                    });
                }
            }

            return { added, skipped };
        }

        function findMissingRefs(formulas, tables, parseSingleVariable) {

            const tableObjs = tables instanceof Map
                ? Array.from(tables.values())
                : Array.isArray(tables)
                    ? tables
                    : Object.values(tables || {});

            const byNameLC = Object.create(null);
            const displayName = Object.create(null);
            for (const t of tableObjs) {
                if (t && typeof t.name === "string") {
                    const key = t.name.toLowerCase();
                    if (!(key in byNameLC)) {
                        byNameLC[key] = t;
                        displayName[key] = t.name;
                    }
                }
            }

            const hasTable = (name) => !!byNameLC[String(name).toLowerCase()];
            const getTable = (name) => byNameLC[String(name).toLowerCase()];
            const canonKey = (name) => String(name).toLowerCase();
            const tablesView = byNameLC;

            const valueFound = (out) =>
                !(out === null || out === undefined || (Array.isArray(out) && out.length === 0));

            const namedRefG = /([A-Za-z_]\w*)\[((?:"[^"\n\r]*")|(?:[^\[\]]+))\]/g;

            const rangeRefG = /([A-Za-z_]\w*)\[(\d+)(?::(\d+))?\]\[(\d+)(?::(\d+))?\]/g;

            const colOnlyRefG = /([A-Za-z_]\w*)\[(\d+)(?::(\d+))?\](?!\s*\[)/g;

            const missingTables = new Set();
            const missingFields = new Map();
            const missingIndices = new Map();
            const perFormula = {};

            const addMissField = (tName, lab) => {
                if (!missingFields.has(tName)) missingFields.set(tName, new Set());
                missingFields.get(tName).add(String(lab));
            };
            const addMissIndex = (tName, desc) => {
                if (!missingIndices.has(tName)) missingIndices.set(tName, new Set());
                missingIndices.get(tName).add(desc);
            };
            const ensurePerFormula = (fid, expr) => {
                if (!perFormula[fid]) perFormula[fid] = {
                    expression: expr,
                    missingTables: new Set(),
                    missingFields: [],
                    missingIndices: []
                };
                return perFormula[fid];
            };

            const fkeys = Array.isArray(formulas) ? formulas.map((_, i) => `#${i}`) : Object.keys(formulas || {});
            const fvalues = Array.isArray(formulas) ? formulas : fkeys.map(k => formulas[k]);

            for (let i = 0; i < fvalues.length; i++) {
                const fid = fkeys[i];
                let raw = fvalues[i];
                if (typeof raw !== "string") continue;

                raw = raw.trim();
                if (!raw) continue;
                if (raw.startsWith("=")) raw = raw.slice(1);

                const expr = raw;
                const seen = new Set();

                expr.replace(namedRefG, (full, tableRaw, rawLabel) => {
                    if (seen.has(full)) return full;
                    seen.add(full);

                    if (/^\d+:\d+$/.test(rawLabel)) return full;

                    const keyLC = canonKey(tableRaw);
                    const dispName = displayName[keyLC] || tableRaw;

                    const label = (rawLabel.startsWith('"') && rawLabel.endsWith('"'))
                        ? rawLabel.slice(1, -1)
                        : rawLabel;

                    const pf = ensurePerFormula(fid, expr);

                    if (!hasTable(tableRaw)) {
                        missingTables.add(dispName);
                        pf.missingTables.add(dispName);
                        return full;
                    }

                    let out;
                    try {
                        out = typeof parseSingleVariable === "function"
                            ? parseSingleVariable(`${keyLC}[${label}]`, tablesView)
                            : undefined;
                    } catch {
                        out = undefined;
                    }

                    if (!valueFound(out)) {
                        addMissField(dispName, label);
                        pf.missingFields.push({ table: dispName, field: label });
                    }
                    return full;
                });

                expr.replace(rangeRefG, (full, tableRaw, cs, ce, rs, re) => {
                    if (seen.has(full)) return full;
                    seen.add(full);

                    const keyLC = canonKey(tableRaw);
                    const dispName = displayName[keyLC] || tableRaw;
                    const pf = ensurePerFormula(fid, expr);

                    const colStart = parseInt(cs, 10);
                    const colEnd = ce ? parseInt(ce, 10) : colStart;
                    const rowStart = parseInt(rs, 10);
                    const rowEnd = re ? parseInt(re, 10) : rowStart;

                    if (!hasTable(tableRaw)) {
                        missingTables.add(dispName);
                        pf.missingTables.add(dispName);
                        return full;
                    }

                    const t = getTable(tableRaw);
                    for (let c = colStart; c <= colEnd; c++) {
                        if (!t?.wells?.[c]) {
                            addMissIndex(dispName, `col ${c}`);
                            pf.missingIndices.push({ table: dispName, index: `col ${c}` });
                            continue;
                        }
                        for (let r = rowStart; r <= rowEnd; r++) {
                            if (!t.wells[c][r]) {
                                addMissIndex(dispName, `col ${c}, row ${r}`);
                                pf.missingIndices.push({ table: dispName, index: `col ${c}, row ${r}` });
                            }
                        }
                    }
                    return full;
                });

                expr.replace(colOnlyRefG, (full, tableRaw, cs, ce) => {
                    if (seen.has(full)) return full;
                    seen.add(full);

                    const keyLC = canonKey(tableRaw);
                    const dispName = displayName[keyLC] || tableRaw;
                    const pf = ensurePerFormula(fid, expr);

                    const colStart = parseInt(cs, 10);
                    const colEnd = ce ? parseInt(ce, 10) : colStart;

                    if (!hasTable(tableRaw)) {
                        missingTables.add(dispName);
                        pf.missingTables.add(dispName);
                        return full;
                    }

                    const t = getTable(tableRaw);
                    for (let c = colStart; c <= colEnd; c++) {
                        if (!t?.wells?.[c]) {
                            addMissIndex(dispName, `col ${c}`);
                            pf.missingIndices.push({ table: dispName, index: `col ${c}` });
                        }
                    }
                    return full;
                });
            }

            const mapToObjArrays = (m) => {
                const out = {};
                for (const [k, v] of m.entries()) out[k] = Array.from(v);
                return out;
            };
            for (const k of Object.keys(perFormula)) {
                perFormula[k].missingTables = Array.from(perFormula[k].missingTables);
            }

            return {
                missingTables: Array.from(missingTables),
                missingFields: mapToObjArrays(missingFields),
                missingIndices: mapToObjArrays(missingIndices),
                perFormula
            };
        }

        let displayedOnce = false;
        function drawRoundedRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();

        }
        function getFadeAlpha(index, numRows) {
            if (index < 4) {
                return (index + 1) / 6;
            }
            return 1;
        }
        function getColumnValuesFromEncodedRange(pt, encodedRange, tableName) {

            const decoded = decodeStructure(`[${encodedRange}]`);

            const rangeString = `${tableName}${decoded}`;

            const { startx, endx, starty, endy } = parseTableString(rangeString, pt);

            const table = pt.getTableByName(tableName);
            if (!table) throw new Error(`Table not found: ${tableName}`);

            const maxRow = table.getLastRow()

            const fullRange = `${tableName}[${startx}:${endx}][${starty}:${maxRow}]`;

            const wells = table.getWellsByString(`[${startx}:${endx}][${starty}:${maxRow}]`);
            return wells.map(well => well.value);
        }

        function fetchValuesBySingleGroup(tables, table, groupName) {
            let values = [];
            if (table === 'all') {
                let v = [];
                for (let tname of Object.keys(tables)) {
                    v = v.concat(fetchValuesBySingleGroup(tables, tname, groupName))
                }
                return v;
            } else {
                const tableData = tables[table];
                if (!tableData || !tableData.wells) {
                    console.error(`Table ${table} not found or has no wells`);
                    return [];
                }
                const isIntegerGroupName = !isNaN(groupName) && Number.isInteger(parseFloat(groupName));
                for (let col = 0; col < tableData.wells.length; col++) {
                    for (let row = 0; row < tableData.wells[col].length; row++) {
                        const well = tableData.wells[col][row];
                        let gvals = []
                        if (well.group) {
                            gvals = Object.keys(well.group)
                        }
                        if (isIntegerGroupName && col === parseInt(groupName)) {
                            if (well.value != null) {
                                values.push({ uid: well.uid, value: well.value, group: gvals });
                            }
                        }
                        else if (well.group && well.group.hasOwnProperty(groupName)) {
                            if (well.value != null) {
                                values.push({ uid: well.uid, value: well.value, group: gvals });
                            }
                        }
                    }
                }
                return values;
            }
        }
        function fetchValuesByGroup(tables, table, groups, condition, notGroups) {
            let values = [];
            const tableData = tables[table];
            if (!tableData || !tableData.wells) {
                console.error(`Table ${table} not found or has no wells`);
                return [];
            }
            for (let col = 0; col < tableData.wells.length; col++) {
                for (let row = 0; row < tableData.wells[col].length; row++) {
                    const well = tableData.wells[col][row];
                    let belongsToGroups;
                    if (condition === "and") {
                        belongsToGroups = groups.every(group =>
                            typeof group === 'number'
                                ? group === col
                                : (typeof group === 'string' && group.startsWith('row')
                                    ? row === parseInt(group.replace('row', ''), 10)
                                    : well.group && well.group.hasOwnProperty(group))
                        );
                    } else {
                        belongsToGroups = groups.some(group =>
                            typeof group === 'number' ? group === col :
                                well.group && well.group.hasOwnProperty(group)
                        );
                    }
                    let belongsToNotGroups = notGroups.some(group =>
                        well.group && well.group.hasOwnProperty(group)
                    );
                    if (belongsToGroups && !belongsToNotGroups) {
                        if (well.value != null && well.group != null) {
                            values.push({ uid: well.uid, value: well.value, group: Object.keys(well.group) });
                        }
                    }
                }
            }
            return values;
        }

        function isvalidSingleColRowFormat(input) {
            const regex = /^\w+\[\d+:\d+\]$/;
            return regex.test(input);
        }

        function parseSingleVariable(token, tables) {
            const singleGroupAccessPattern = /^(\w+)\[(\w+)\]$/;
            const doubleIndexAccessPattern = /^(\w+)\[(\d+)\]\[(\d+)\]$/;
            const arrayAccessPattern = /^(\w+)\[(.+)\]$/;
            const propertyConditionPattern = /^(\w+)\[(\d+)\]\.(\w+)(?:\s*(==|!=|>|<|>=|<=)\s*(.+))?$/;

            let match;

            if ((match = token.match(doubleIndexAccessPattern))) {
                const table = match[1];
                const col = parseInt(match[2], 10);
                const row = parseInt(match[3], 10);
                const tableData = tables[table];

                if (!tableData || !tableData.wells || !tableData.wells[col] || !tableData.wells[col][row]) {

                    return null;
                }

                const well = tableData.wells[col][row];
                return well.value ?? well;
            }

            if ((match = token.match(singleGroupAccessPattern))) {
                const table = match[1];
                const groupName = match[2];
                return fetchValuesBySingleGroup(tables, table, groupName);
            }

            if ((match = token.match(propertyConditionPattern))) {
                const table = match[1];
                const columnIndex = parseInt(match[2], 10);
                const property = match[3];
                const operator = match[4];
                const value = match[5];
                const tableData = tables[table];

                if (!tableData || !tableData.wells[columnIndex]) {
                    console.error(`Table ${table} or column ${columnIndex} not found`);
                    return [];
                }

                const wells = tableData.wells[columnIndex];
                let result = [];

                wells.forEach(well => {
                    if (well.hasOwnProperty(property)) {
                        const wellValue = well[property];
                        if (operator && value !== undefined) {
                            switch (operator) {
                                case '==': if (wellValue == value) result.push(well.value); break;
                                case '!=': if (wellValue != value) result.push(well.value); break;
                                case '>': if (wellValue > value) result.push(well.value); break;
                                case '<': if (wellValue < value) result.push(well.value); break;
                                case '>=': if (wellValue >= value) result.push(well.value); break;
                                case '<=': if (wellValue <= value) result.push(well.value); break;
                                default: console.error(`Unsupported operator: ${operator}`);
                            }
                        } else {
                            result.push(well[property]);
                        }
                    }
                });

                return result;
            }

            if ((match = token.match(arrayAccessPattern))) {
                const table = match[1];
                const conditionPart = match[2];
                let condition = 'and';
                let groups = [];
                let notGroups = [];

                if (conditionPart.includes('not')) {
                    const parts = conditionPart.split('not');
                    groups = parts[0].split('and').map(g => g.trim());
                    notGroups = parts[1].split('and').map(g => g.trim());
                } else if (conditionPart.includes('and')) {
                    groups = conditionPart.split('and').map(g => g.trim());
                } else if (conditionPart.includes('or')) {
                    groups = conditionPart.split('or').map(g => g.trim());
                    condition = 'or';
                } else {
                    groups = [conditionPart.trim()];
                }

                const ngroups = groups.map(g => isNaN(parseInt(g)) ? g : parseInt(g));
                return fetchValuesByGroup(tables, table, ngroups, condition, notGroups);
            }

            console.log("Unrecognized token format: " + token);
            return [];
        }
        function expand_(v) {
            if (Array.isArray(v)) {

                if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null && 'value' in v[0]) {
                    return JSON.stringify(v.map(item => item.value));
                }
                console.log('debubg');

                return JSON.stringify(v);
            }

            if (typeof v === 'object' && v !== null && 'value' in v) {
                return JSON.stringify(v.value);
            }

            if (typeof v === 'number') {
                return v;
            }

            if (typeof v === 'boolean') {
                return v;
            }

            if (typeof v === 'string') {
                return JSON.stringify(v);
            }

            return 'null';
        }


        function generateExpressionsInRange(funcString, startIndex, endIndex) {
            const MAX_EXPRESSIONS = 1000;




            function deriveIterator(formula) {
                if (typeof formula !== "string") return "row";

                // Prefer explicit iterator tokens inside table selectors:
                // test2[col,UTC]
                // test2[row,UTC]
                // test2[col${i},UTC]
                // test2[row${i},UTC]
                const bracketPattern = /\[([^\]]+)\]/g;
                let match;

                while ((match = bracketPattern.exec(formula)) !== null) {
                    const parts = match[1].split(",").map(p => p.trim());

                    for (const part of parts) {
                        if (/^col(?:\$\{i\}|\d+)?$/i.test(part)) return "col";
                        if (/^row(?:\$\{i\}|\d+)?$/i.test(part)) return "row";
                    }
                }

                // Fallback for formulas containing bare iterator words elsewhere
                if (/\bcol\b|\bcol\$\{i\}/i.test(formula)) return "col";
                if (/\brow\b|\brow\$\{i\}/i.test(formula)) return "row";

                return "row";
            }

            function replaceStandaloneIterator(formula, iterator) {
                if (typeof formula !== "string") return formula;

                if (iterator === "col") {
                    return formula.replace(
                        /\bcol\b(?!\$\{i\})(?![a-zA-Z0-9_])/g,
                        "col${i}"
                    );
                }

                return formula.replace(
                    /\brow\b(?!\$\{i\})(?![a-zA-Z0-9_])/g,
                    "row${i}"
                );
            }

            const iterator = deriveIterator(funcString);
            funcString = replaceStandaloneIterator(funcString, iterator);

            const expressions = [];
            const cappedEndIndex = Math.min(endIndex, startIndex + MAX_EXPRESSIONS - 1);

            for (let i = startIndex; i <= cappedEndIndex; i++) {
                let updatedString = funcString
                    .replace(/\$\{i\}/g, String(i))
                    .replace(/\$\{y\}/g, String(i));

                updatedString = updatedString.replace(
                    /\[(\s*\d+\s*)\]/g,
                    (_match, p1) => `[${p1.trim()}]`
                );

                expressions.push(updatedString);
            }

            return expressions;
        }
        function parseTableStructure(input) {

            const pattern = /^(\w+)\[(.*?):(.*?)\]\[(.*?):(.*?)\]$/;
            const match = input.match(pattern);
            if (!match) return null;

            function parseCoord(value, isStart) {
                if (value === "") return isStart ? -Infinity : Infinity;
                const num = Number(value);
                return isNaN(num) ? null : num;
            }

            return {
                tableName: match[1],
                startX: parseCoord(match[2], true),
                stopX: parseCoord(match[3], false),
                startY: parseCoord(match[4], true),
                stopY: parseCoord(match[5], false),
            };
        }

        function cleanDictionary(dict) {
            for (const key in dict) {
                if (dict[key] === null || dict[key] === undefined || dict[key] === "") {
                    delete dict[key];
                }
            }
            return dict;
        }

        function extractTableNames(inputString) {

            const regex = /\b([a-zA-Z0-9_]+)\[/g;
            let match;
            const tableNames = new Set();

            while ((match = regex.exec(inputString)) !== null) {

                tableNames.add(match[1]);
            }

            return Array.from(tableNames);
        }

        function hashString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash);
        }

        function getArrowColor(fromRect, toRect) {
            const fromId = fromRect.uid || fromRect.name || `${fromRect.grid.xi},${fromRect.grid.yi}`;
            const toId = toRect.uid || toRect.name || `${toRect.grid.xi},${toRect.grid.yi}`;
            const key = `${fromId}→${toId}`;

            const hue = hashString(key) % 360;
            return `hsla(${hue}, 80%, 50%, 0.09)`;
        }

        function drawArrow__tables(ctx, fromRect, toRect, graph, label) {
            if (!fromRect || !toRect || !graph) return;
            const ARROW_ALPHA = 0.3;
            const ARROW_LINE_WIDTH = 1;
            const ARROW_HEAD_LENGTH = 24;
            const LABEL_OFFSET = 6;
            const LABEL_HALO_ALPHA = 0.3;
            const LABEL_FONT = "15px sans-serif";
            const END_PADDING = Math.max(ARROW_HEAD_LENGTH + 8, 12);
            const START_PADDING = 12;

            const fromX = graph.X(fromRect.grid.xi);
            const fromY = graph.Y(fromRect.grid.yi + fromRect.getHeight());
            const fromCenterX = fromX + graph.screenWidth(fromRect.getWidth()) / 2;
            const fromCenterY = fromY + graph.screenHeight(fromRect.getHeight()) / 2;

            const toX = graph.X(toRect.grid.xi);
            const toY = graph.Y(toRect.grid.yi + toRect.getHeight());
            const toWidth = graph.screenWidth(toRect.getWidth());
            const toHeight = graph.screenHeight(toRect.getHeight());
            const toCenterX = toX + toWidth / 2;
            const toCenterY = toY + toHeight / 2;

            const dx = toCenterX - fromCenterX;
            const dy = toCenterY - fromCenterY;
            const angle = Math.atan2(dy, dx);
            const ux = Math.cos(angle), uy = Math.sin(angle);

            const halfWidth = toWidth / 2;
            const halfHeight = toHeight / 2;
            const tanTheta = Math.abs(Math.tan(angle));

            let edgeX = toCenterX;
            let edgeY = toCenterY;

            if (tanTheta <= halfHeight / halfWidth) {
                edgeX = toCenterX + (dx > 0 ? -halfWidth : halfWidth);
                edgeY = toCenterY + (dx > 0 ? -halfWidth : halfWidth) * Math.tan(angle);
            } else {
                edgeY = toCenterY + (dy > 0 ? -halfHeight : halfHeight);
                edgeX = toCenterX + (dy > 0 ? -halfHeight : halfHeight) / Math.tan(angle);
            }

            const color = getArrowColor(fromRect, toRect);

            function drawArrowhead(px, py, ang) {
                const l = ARROW_HEAD_LENGTH;
                const x1 = px - l * Math.cos(ang - Math.PI / 6);
                const y1 = py - l * Math.sin(ang - Math.PI / 6);
                const x2 = px - l * Math.cos(ang + Math.PI / 6);
                const y2 = py - l * Math.sin(ang + Math.PI / 6);

                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.closePath();
                ctx.fill();
            }

            ctx.save();
            const prevComp = ctx.globalCompositeOperation;
            const prevAlpha = ctx.globalAlpha;
            const prevAlign = ctx.textAlign;
            const prevBase = ctx.textBaseline;

            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = ARROW_ALPHA;

            ctx.beginPath();
            ctx.moveTo(fromCenterX, fromCenterY);
            ctx.lineTo(edgeX, edgeY);
            ctx.strokeStyle = color;
            ctx.lineWidth = ARROW_LINE_WIDTH;
            ctx.stroke();

            ctx.fillStyle = color;

            if (label && label.length) {
                const sx = fromCenterX, sy = fromCenterY;
                const ex = edgeX, ey = edgeY;

                const totalLen = Math.hypot(ex - sx, ey - sy);
                const usableLen = Math.max(0, totalLen - (START_PADDING + END_PADDING));

                const midX = (sx + ex) / 2;
                const midY = (sy + ey) / 2;

                let textAngle = angle;
                if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
                    textAngle += Math.PI;
                }

                ctx.font = LABEL_FONT;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                const maxTextWidth = Math.max(0, usableLen - 8);

                function fitText(text, maxWidth) {
                    const full = ctx.measureText(text).width;
                    if (full <= maxWidth) return text;

                    const ell = "…";
                    const ellW = ctx.measureText(ell).width;
                    if (ellW > maxWidth) return "";

                    let lo = 0, hi = text.length;
                    while (lo < hi) {
                        const m = Math.ceil((lo + hi) / 2);
                        const w = ctx.measureText(text.slice(0, m) + ell).width;
                        if (w <= maxWidth) lo = m;
                        else hi = m - 1;
                    }
                    return text.slice(0, lo) + ell;
                }

                const fitted = fitText(label, maxTextWidth);

                if (fitted) {
                    ctx.save();
                    ctx.translate(midX, midY);
                    ctx.rotate(textAngle);
                    ctx.translate(0, -LABEL_OFFSET);

                    ctx.lineWidth = 3;
                    ctx.strokeStyle = `rgba(255,255,255,${LABEL_HALO_ALPHA})`;
                    ctx.strokeText(fitted, 0, 0);
                    ctx.fillStyle = color;
                    ctx.fillText(fitted, 0, 0);
                    ctx.restore();
                    const textWidth = ctx.measureText(fitted).width;
                    const halfLabel = textWidth / 2;
                    const maxAfter = usableLen / 2 - 4;
                    const desiredAfter = halfLabel + 10;
                    const after = Math.max(0, Math.min(maxAfter, desiredAfter));

                    const midArrowX = midX + ux * after;
                    const midArrowY = midY + uy * after;

                    ctx.fillStyle = color;
                    drawArrowhead(midArrowX, midArrowY, angle);
                }
            }

            ctx.globalCompositeOperation = prevComp;
            ctx.globalAlpha = prevAlpha;
            ctx.textAlign = prevAlign;
            ctx.textBaseline = prevBase;
            ctx.restore();
        }

        function drawArrowFromPoint(ctx, point, toRect, graph) {

            const fromX = graph.X(point.x); q
            const fromY = graph.Y(point.y);

            const toY = graph.Y(toRect.grid.yi + toRect.getHeight());
            const toX = graph.X(toRect.grid.xi);
            const toCenterX = toX + graph.screenWidth(toRect.getWidth()) / 2;
            const toCenterY = toY + graph.screenHeight(toRect.getHeight()) / 2;

            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toCenterX, toCenterY);
            ctx.strokeStyle = "rgba(208, 208, 233, 0.2)";
            ctx.lineWidth = 10;
            ctx.stroke();

            const angle = Math.atan2(toCenterY - fromY, toCenterX - fromX);
            const arrowheadLength = 10;

            const arrowX1 = toCenterX - arrowheadLength * Math.cos(angle - Math.PI / 6);
            const arrowY1 = toCenterY - arrowheadLength * Math.sin(angle - Math.PI / 6);

            const arrowX2 = toCenterX - arrowheadLength * Math.cos(angle + Math.PI / 6);
            const arrowY2 = toCenterY - arrowheadLength * Math.sin(angle + Math.PI / 6);

            ctx.beginPath();
            ctx.moveTo(toCenterX, toCenterY);
            ctx.lineTo(arrowX1, arrowY1);
            ctx.lineTo(arrowX2, arrowY2);
            ctx.lineTo(toCenterX, toCenterY);
            ctx.fillStyle = "black";
            ctx.fill();
        }

        stack = [];
        let colors = [
            '#EADDCA',
            '#C4A484',
            'magenta',
            'red',
            'blue',
            'lightGreen',
            'lightBlue',
            'orange',
            'lightGray',
            'lightRed',
        ]
        let buttons__ = []
        let index = 1
        for (let t of colors) {
            buttons__.push({
                x: index++, y: 0, label: '', ionFunction: createIonFunction(async (button) => {
                    selectedColor = t;
                }), background: t
            })
        }

        const arrowImg = new Image();
        arrowImg.src = "assets/img/icons/png/left-arrow-48x48-4817844.png";
        arrowImgLoaded = false;

        arrowImg.onload = () => {
            arrowImgLoaded = true;
        };
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

        let minObjectX = Infinity;
        let maxObjectX = -Infinity;

        let __indexcount = 0;
        let selectedListener = null;
        let __menu_pointer

        function forEachWell2D(table, cb) {
            if (!table || !table.wells) return;

            let xmin = 0, ymin = 0, xmax = -1, ymax = -1;

            if (table.grid) {

                xmin = Number.isFinite(table.grid.xmin) ? table.grid.xmin : 0;
                ymin = Number.isFinite(table.grid.ymin) ? table.grid.ymin : 0;
                const gxmax = Number.isFinite(table.grid.xmax) ? table.grid.xmax : (Array.isArray(table.wells) ? table.wells.length : 0);
                const gymax = Number.isFinite(table.grid.ymax) ? table.grid.ymax : (Array.isArray(table.wells?.[0]) ? table.wells[0].length : 0);
                xmax = gxmax - 1;
                ymax = gymax - 1;
            } else {

                const cols = Array.isArray(table.wells) ? table.wells.length : 0;
                const rows = cols > 0 && Array.isArray(table.wells[0]) ? table.wells[0].length : 0;
                xmax = cols - 1;
                ymax = rows - 1;
            }

            for (let x = xmin; x <= xmax; x++) {
                const col = table.wells[x];
                if (!Array.isArray(col)) continue;
                for (let y = ymin; y <= ymax; y++) {
                    const well = col[y];
                    if (well) cb(well, x, y);
                }
            }
        }

        function getWellGroupDictionaries(well) {
            const out = [];
            if (well && typeof well === 'object') {
                if (well.group && typeof well.group === 'object') out.push(well.group);
                if (well.groups && typeof well.groups === 'object') out.push(well.groups);
                if (well.obj && typeof well.obj === 'object') {
                    if (well.obj.group && typeof well.obj.group === 'object') out.push(well.obj.group);
                    if (well.obj.groups && typeof well.obj.groups === 'object') out.push(well.obj.groups);
                }
                if (well.meta && typeof well.meta === 'object') {
                    if (well.meta.group && typeof well.meta.group === 'object') out.push(well.meta.group);
                    if (well.meta.groups && typeof well.meta.groups === 'object') out.push(well.meta.groups);
                }
            }
            return out;
        }

        function wellHasGroupKey(well, key) {
            const dicts = getWellGroupDictionaries(well);
            for (const d of dicts) {
                if (d && Object.prototype.hasOwnProperty.call(d, key)) return true;
            }
            return false;
        }

        function findWellsByGroupKey2D(table, groupKey) {
            const refs = [];
            const seen = new Set();

            forEachWell2D(table, (well, ix, iy) => {
                if (!wellHasGroupKey(well, groupKey)) return;

                const wx = Number.isFinite(well.x) ? well.x : ix;
                const wy = Number.isFinite(well.y) ? well.y : iy;

                const k = `${wx},${wy}`;
                if (!seen.has(k)) {
                    seen.add(k);
                    refs.push({ x: wx, y: wy });
                }
            });

            return refs;
        }

        function extractGroupKeyTokens(calculation) {
            if (!calculation || typeof calculation !== 'string') return [];
            const tokens = [];
            const re = /([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*)\s*\]/g;
            let m;
            while ((m = re.exec(calculation)) !== null) {
                tokens.push({ tableName: m[1], groupKey: m[2] });
            }
            return tokens;
        }

        function collectRefsForCalculation(calculation, startY, stopY, getTablesByName) {
            if (!calculation || typeof calculation !== 'string') return [];
            const tokens = extractGroupKeyTokens(calculation);
            if (!tokens.length) return [];

            const tablesByName = typeof getTablesByName === 'function' ? getTablesByName() : undefined;

            const refs = [];
            const seen = new Set();

            for (const { tableName, groupKey } of tokens) {

                const table =
                    (tablesByName && tablesByName[tableName]) ||
                    (typeof this.getTableByName === 'function' ? this.getTableByName(tableName) : null);

                if (!table || !table.wells) continue;

                const wells = findWellsByGroupKey2D(table, groupKey);
                for (const w of wells) {
                    const k = `${tableName}:${w.x},${w.y}`;
                    if (!seen.has(k)) {
                        seen.add(k);
                        refs.push({ tableName, x: w.x, y: w.y });
                    }
                }
            }

            return refs;
        }

        function drawArrow(ctx, sx, sy, tx, ty, opts = {}) {

            const {
                padStart = 7,
                padEnd = 5,
                color = '#0a66ff',
                lineWidth = 1,
                headLength = 14,
                headWidth = 10,
                shadowColor = 'rgba(121, 85, 85, 0.25)',
                shadowBlur = 8,
                shadowOffsetX = 2,
                shadowOffsetY = 0
            } = opts;

            const dx = tx - sx;
            const dy = ty - sy;
            const len = Math.hypot(dx, dy) || 1;

            const ux = dx / len;
            const uy = dy / len;

            const usableLen = Math.max(0, len - (padStart + padEnd));
            if (usableLen <= 0) return;

            const ax = sx + ux * padStart;
            const ay = sy + uy * padStart;
            const ex = tx - ux * padEnd;
            const ey = ty - uy * padEnd;

            const hl = Math.min(headLength, usableLen * 0.5);
            const bx = ex - ux * hl;
            const by = ey - uy * hl;

            const nx = -uy;
            const ny = ux;

            const halfW = headWidth / 2;
            const leftBaseX = bx + nx * halfW;
            const leftBaseY = by + ny * halfW;
            const rightBaseX = bx - nx * halfW;
            const rightBaseY = by - ny * halfW;

            ctx.save();

            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetX = shadowOffsetX;
            ctx.shadowOffsetY = shadowOffsetY;

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(leftBaseX, leftBaseY);
            ctx.lineTo(rightBaseX, rightBaseY);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth * 0.9;
            ctx.stroke();

            ctx.restore();
        }

        function splitTopLevel(s, sepChar) {
            const parts = [];
            let cur = "";
            let dp = 0, db = 0, dc = 0, inStr = false, q = "";
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (inStr) {
                    cur += ch;
                    if (ch === q && s[i - 1] !== "\\") { inStr = false; q = ""; }
                    continue;
                }
                if (ch === '"' || ch === "'" || ch === "`") { inStr = true; q = ch; cur += ch; continue; }
                if (ch === "(") dp++;
                else if (ch === ")") dp = Math.max(0, dp - 1);
                else if (ch === "[") db++;
                else if (ch === "]") db = Math.max(0, db - 1);
                else if (ch === "{") dc++;
                else if (ch === "}") dc = Math.max(0, dc - 1);

                if (ch === sepChar && dp === 0 && db === 0 && dc === 0) {
                    parts.push(cur.trim());
                    cur = "";
                } else {
                    cur += ch;
                }
            }
            if (cur.trim()) parts.push(cur.trim());
            return parts;
        }

        const splitTopLevelPipes = (s) => splitTopLevel(s, "|");
        const splitTopLevelCommas = (s) => splitTopLevel(s, ",");

        const AGG_FNS = {
            average: (nums) => {
                const arr = nums.filter((x) => typeof x === "number" && !Number.isNaN(x));
                if (!arr.length) return undefined;
                const sum = arr.reduce((a, b) => a + b, 0);
                return sum / arr.length;
            },
            sum: (nums) => {
                const arr = nums.filter((x) => typeof x === "number" && !Number.isNaN(x));
                if (!arr.length) return undefined;
                return arr.reduce((a, b) => a + b, 0);
            },
            min: (nums) => {
                const arr = nums.filter((x) => typeof x === "number" && !Number.isNaN(x));
                return arr.length ? Math.min(...arr) : undefined;
            },
            max: (nums) => {
                const arr = nums.filter((x) => typeof x === "number" && !Number.isNaN(x));
                return arr.length ? Math.max(...arr) : undefined;
            },
            count: (vals) => vals.filter((v) => v !== undefined && v !== null).length,
        };

        function isAggregateCall(s) {

            const m = s.match(/^\s*([A-Za-z_]\w*)\s*\(([\s\S]+)\)\s*$/);
            return m ? { fn: m[1], inner: m[2] } : null;
        }

        function parseTableAndFields(spec) {
            const m = spec.trim().match(/^([A-Za-z_]\w*)\s*\[(.*)\]\s*$/);
            if (!m) return null;
            const table = sanitizeName(m[1]);
            const raw = m[2].trim();
            const fields = splitTopLevelCommas(raw).map((t) => t.trim()).filter(Boolean);
            return { table, fields };
        }

        async function generatePlateFromFormula(
            formula,
            pt,
            {
                name,
                compress = true,
                PlateCtor = Plate,
                WellCtor = GenericWell,
                enableAggregates = true,
            } = {}
        ) {
            if (typeof formula !== "string") throw new Error("formula must be a string");

            function splitTopLevel(s, sepChar) {
                const parts = [];
                let cur = "";
                let dp = 0, db = 0, dc = 0, inStr = false, q = "";
                for (let i = 0; i < s.length; i++) {
                    const ch = s[i];
                    if (inStr) {
                        cur += ch;
                        if (ch === q && s[i - 1] !== "\\") { inStr = false; q = ""; }
                        continue;
                    }
                    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; q = ch; cur += ch; continue; }
                    if (ch === "(") dp++;
                    else if (ch === ")") dp = Math.max(0, dp - 1);
                    else if (ch === "[") db++;
                    else if (ch === "]") db = Math.max(0, db - 1);
                    else if (ch === "{") dc++;
                    else if (ch === "}") dc = Math.max(0, dc - 1);

                    if (ch === sepChar && dp === 0 && db === 0 && dc === 0) {
                        parts.push(cur.trim());
                        cur = "";
                    } else {
                        cur += ch;
                    }
                }
                if (cur.trim()) parts.push(cur.trim());
                return parts;
            }
            const splitTopLevelPipes = (s) => splitTopLevel(s, "|");
            const splitTopLevelCommas = (s) => splitTopLevel(s, ",");

            const firstTableInExpr = (expr) => {
                const m = expr.match(/([A-Za-z_]\w*)\s*\[/);
                return m ? sanitizeName(m[1]) : null;
            };

            const normalizeValuesArray = (ret) => {
                const arr = ret && Array.isArray(ret.results) ? ret.results : [];
                return arr.map((v) => (v && typeof v === "object" && "value" in v ? v.value : v));
            };

            const extractKeyFromExpr = (expr) => {
                const m = expr.match(/^[A-Za-z_]\w*\[([^\]]+)\]\s*$/);
                return m ? m[1].trim() : expr.trim();
            };

            function findColumnIndexByHeader(plate, headerText) {
                if (!plate || !plate.wells || !plate.wells.length) return -1;
                const cols = plate.wells.length;
                for (let c = 0; c < cols; c++) {
                    const w = plate.wells[c]?.[0];
                    const val = w?.value != null ? String(w.value) : "";
                    if (val === headerText) return c;
                }
                return -1;
            }

            const assignMatch = formula.match(/^\s*([^=]+?)\s*=\s*(.+)\s*$/);
            if (assignMatch) {
                const lhsName = sanitizeName(assignMatch[1].trim());
                const rhsExpr = assignMatch[2].trim();

                if (enableAggregates) {
                    const agg = isAggregateCall(rhsExpr);
                    if (agg && AGG_FNS[agg.fn]) {
                        const tf = parseTableAndFields(agg.inner);
                        if (!tf) throw new Error(`Invalid aggregate inner expression: ${agg.inner}`);
                        const { table, fields } = tf;
                        const srcPlate = pt.getTableByName(table);
                        if (!srcPlate) throw new Error(`Table not found: ${table}`);

                        const fieldExprs = fields.map((f) => `${table}[${f}]`);
                        const evals = await Promise.all(
                            fieldExprs.map((e) => exec("baja/plate/ops/frun-object", e, pt))
                        );
                        const cols = evals.map(normalizeValuesArray);
                        const maxRow = cols.reduce((m, a) => Math.max(m, a.length), 0);
                        const HEADER_ROWS = 1;

                        let groupsForRows = new Array(maxRow).fill(undefined);
                        let refIDsForRows = new Array(maxRow).fill(undefined);

                        if (fields.length > 0) {
                            const firstKey = fields[0];
                            const colIdx = findColumnIndexByHeader(srcPlate, firstKey);
                            if (colIdx >= 0) {
                                const srcCol = srcPlate.wells[colIdx] || [];
                                const dataLen = Math.max(0, srcCol.length - 1);
                                for (let r = 0; r < maxRow; r++) {
                                    if (r < dataLen) {
                                        const w = srcCol[r + 1];
                                        groupsForRows[r] = w?.group ? { ...w.group } : undefined;
                                        refIDsForRows[r] = w?.uid;
                                    }
                                }
                            }
                        }

                        const aggFn = AGG_FNS[agg.fn];
                        const resultCol = new Array(maxRow);
                        for (let r = 0; r < maxRow; r++) {
                            const rowVals = cols.map((col) => col[r]);
                            resultCol[r] = aggFn(rowVals);
                        }

                        const out = new PlateCtor(name || lhsName, 1, Math.max(1, maxRow) + HEADER_ROWS);

                        {
                            const w = new WellCtor(`A1`);
                            w.value = sanitizeName(agg.fn);
                            w.label = "";
                            w.uid = uuid();
                            w.properties = { isHeader: true, refIDs: [] };
                            out.wells[0][0] = w;
                        }

                        for (let r = 0; r < Math.max(1, maxRow); r++) {
                            const outRow = r + HEADER_ROWS;
                            const w = new WellCtor(`A${outRow + 1}`);
                            w.value = resultCol[r];
                            w.label = "";
                            if (groupsForRows[r]) w.group = { ...groupsForRows[r] };
                            w.uid = uuid();
                            w.properties = {
                                formula: rhsExpr,
                                headerForColumn: sanitizeName(agg.fn),
                                refIDs: refIDsForRows[r] ? [refIDsForRows[r]] : [],
                            };
                            out.wells[0][outRow] = w;
                        }

                        if (compress && typeof out.removeEmptyRowsAndColumns === "function") {
                            out.removeEmptyRowsAndColumns();
                        }
                        return out;
                    }
                }

                const sections = splitTopLevelCommas(rhsExpr);

                function parseSection(sectionText) {
                    let s = sectionText.trim();
                    if (s.startsWith("(") && s.endsWith(")")) {
                        let depth = 0, fully = true;
                        for (let i = 0; i < s.length; i++) {
                            if (s[i] === "(") depth++;
                            else if (s[i] === ")") depth--;
                            if (depth === 0 && i < s.length - 1) { fully = false; break; }
                        }
                        if (fully) s = s.slice(1, -1).trim();
                    }

                    let exprPart = s, wherePart = null;
                    const whereMatch = s.match(/\s+where\s+/i);
                    if (whereMatch) {
                        const idx = whereMatch.index;
                        exprPart = s.slice(0, idx).trim();
                        wherePart = s.slice(idx + whereMatch[0].length).trim();
                    }

                    const exprs = splitTopLevelPipes(exprPart);
                    let where = null;
                    if (wherePart) {
                        const m = wherePart.match(/^\s*([A-Za-z_]\w*)\s+(is)\s+(.*)\s*$/i);
                        if (!m)
                            throw new Error(`Invalid where-clause: "${wherePart}". Expected "Field is Value".`);
                        const field = m[1];
                        const op = m[2].toLowerCase();
                        let value = m[3];
                        if (
                            (value.startsWith('"') && value.endsWith('"')) ||
                            (value.startsWith("'") && value.endsWith("'")) ||
                            (value.startsWith("`") && value.endsWith("`"))
                        ) {
                            value = value.slice(1, -1);
                        }
                        where = { field, op, value };
                    }
                    return { exprs, where };
                }

                const parsedSections = sections.map(parseSection);

                const sectionCols = [];
                const sectionGroups = [];
                const sectionRefIDs = [];
                const columnFormulas = [];
                const columnHeaders = [];
                let maxRow = 0;

                for (const sec of parsedSections) {
                    const { exprs, where } = sec;

                    const evals = await Promise.all(
                        exprs.map((e) => exec("baja/plate/ops/frun-object", e, pt))
                    );
                    let cols = evals.map(normalizeValuesArray);

                    let groupsForExprs = exprs.map(() => []);
                    let refIDsForExprs = exprs.map(() => []);

                    for (let ei = 0; ei < exprs.length; ei++) {
                        const e = exprs[ei];
                        const tableName = firstTableInExpr(e);
                        const key = extractKeyFromExpr(e);
                        if (!tableName) {

                            groupsForExprs[ei] = (cols[ei] || []).map(() => undefined);
                            refIDsForExprs[ei] = (cols[ei] || []).map(() => undefined);
                            continue;
                        }

                        const srcPlate = pt.getTableByName(tableName);
                        if (!srcPlate) {
                            groupsForExprs[ei] = (cols[ei] || []).map(() => undefined);
                            refIDsForExprs[ei] = (cols[ei] || []).map(() => undefined);
                            continue;
                        }

                        const colIdx = findColumnIndexByHeader(srcPlate, key);
                        if (colIdx < 0) {
                            groupsForExprs[ei] = (cols[ei] || []).map(() => undefined);
                            refIDsForExprs[ei] = (cols[ei] || []).map(() => undefined);
                            continue;
                        }

                        const srcCol = srcPlate.wells[colIdx] || [];

                        const dataLen = Math.max(0, srcCol.length - 1);
                        const groups = new Array(dataLen);
                        const ids = new Array(dataLen);

                        for (let r = 0; r < dataLen; r++) {
                            const w = srcCol[r + 1];
                            groups[r] = w?.group ? { ...w.group } : undefined;
                            ids[r] = w?.uid;
                        }

                        groupsForExprs[ei] = groups;
                        refIDsForExprs[ei] = ids;
                    }

                    if (where) {

                        let tableForWhere = null;
                        for (const e of exprs) {
                            const t = firstTableInExpr(e);
                            if (t) { tableForWhere = t; break; }
                        }
                        if (!tableForWhere) {
                            throw new Error(`Cannot resolve table for where-clause "${where.field}".`);
                        }
                        const fieldExpr = `${tableForWhere}[${where.field}]`;
                        const fieldEval = await exec("baja/plate/ops/frun-object", fieldExpr, pt);
                        const fieldValues = normalizeValuesArray(fieldEval);
                        const mask = fieldValues.map((v) => v === where.value);

                        cols = cols.map((col) => col.filter((_, i) => mask[i]));
                        groupsForExprs = groupsForExprs.map((gcol) => gcol.filter((_, i) => mask[i]));
                        refIDsForExprs = refIDsForExprs.map((rcol) => rcol.filter((_, i) => mask[i]));
                    }

                    const secMax = cols.reduce((m, a) => Math.max(m, a.length), 0);
                    if (secMax > maxRow) maxRow = secMax;

                    for (const e of exprs) {
                        const key = extractKeyFromExpr(e);
                        const header = where ? `${key} _${where.value}` : `${key}`;
                        columnHeaders.push(header);
                    }

                    sectionCols.push(cols);
                    sectionGroups.push(groupsForExprs);
                    sectionRefIDs.push(refIDsForExprs);
                    columnFormulas.push(...exprs);
                }

                const flattenedCols = sectionCols.flat();
                const flattenedGroups = sectionGroups.flat();
                const flattenedRefIDs = sectionRefIDs.flat();
                const totalCols = flattenedCols.length;

                if (totalCols === 0) {
                    flattenedCols.push([]);
                    flattenedGroups.push([]);
                    flattenedRefIDs.push([]);
                    columnHeaders.push("Column");
                }
                if (maxRow === 0) maxRow = 1;

                const HEADER_ROWS = 1;
                const out = new PlateCtor(name || lhsName, totalCols, maxRow + HEADER_ROWS);

                for (let c = 0; c < totalCols; c++) {
                    const w = new WellCtor(`${String.fromCharCode(65 + c)}1`);
                    w.value = columnHeaders[c] || `Col${c + 1}`;
                    w.value = sanitizeName(w.value)
                    w.label = "";
                    w.uid = uuid();
                    w.properties = { isHeader: true, refIDs: [] };
                    out.wells[c][0] = w;
                }

                for (let c = 0; c < totalCols; c++) {
                    const colValues = flattenedCols[c] || [];
                    const colGroups = flattenedGroups[c] || [];
                    const colRefIDs = flattenedRefIDs[c] || [];
                    const colFormula = columnFormulas[c] || rhsExpr;

                    for (let r = 0; r < maxRow; r++) {
                        const outRow = r + HEADER_ROWS;
                        const w = new WellCtor(`${String.fromCharCode(65 + c)}${outRow + 1}`);
                        w.value = r < colValues.length ? colValues[r] : undefined;
                        w.label = "";
                        if (r < colGroups.length && colGroups[r]) {

                            w.group = { ...colGroups[r] };
                        }
                        w.uid = uuid();
                        w.properties = {
                            formula: colFormula,
                            headerForColumn: columnHeaders[c],

                            refIDs: (r < colRefIDs.length && colRefIDs[r]) ? [colRefIDs[r]] : [],
                        };
                        out.wells[c][outRow] = w;
                    }
                }

                if (compress && typeof out.removeEmptyRowsAndColumns === "function") {
                    out.removeEmptyRowsAndColumns();
                }

                return out;
            }

            const m = formula.trim().match(/^([A-Za-z_]\w*)\[(.+)\]$/);
            if (!m) throw new Error(`Invalid formula: ${formula}. Expected "TableName[groups]"`);
            const tableName = sanitizeName(m[1]);
            const selectorRaw = m[2].trim();
            const src = pt.getTableByName(tableName);
            if (!src) throw new Error(`Table not found: ${tableName}`);

            function parseSelector(sel) {
                const notParts = sel.split(/\s+not\s+/i).map((s) => s.trim());
                const positivePart = notParts[0];
                const negPartJoined = notParts.slice(1).join(" and ");
                let condition = "and";
                let posTokens;
                if (/\sor\s/i.test(positivePart)) {
                    condition = "or";
                    posTokens = positivePart.split(/\sor\s/i).map((s) => s.trim());
                } else if (/\sand\s/i.test(positivePart)) {
                    condition = "and";
                    posTokens = positivePart.split(/\sand\s/i).map((s) => s.trim());
                } else {
                    posTokens = [positivePart];
                }

                const negTokens = negPartJoined
                    ? negPartJoined.split(/\sand\s/i).map((s) => s.trim())
                    : [];

                const normalize = (t) => {
                    if (/^row\d+$/i.test(t)) return t.toLowerCase();
                    const n = Number(t);
                    return Number.isInteger(n) ? n : t;
                };

                return {
                    condition,
                    groups: posTokens.filter(Boolean).map(normalize),
                    notGroups: negTokens.filter(Boolean).map(normalize),
                };
            }

            const { condition, groups, notGroups } = parseSelector(selectorRaw);

            function wellMatches(well, col, row) {
                const gobj = well && well.group ? well.group : null;
                const hasGroup = (g) => {
                    if (typeof g === "number") return col === g;
                    if (typeof g === "string" && /^row\d+$/.test(g)) {
                        const wantRow = parseInt(g.replace("row", ""), 10);
                        return row === wantRow;
                    }
                    return !!(gobj && Object.prototype.hasOwnProperty.call(gobj, g));
                };
                const positive = condition === "and" ? groups.every(hasGroup) : groups.some(hasGroup);
                const negative = notGroups.some(hasGroup);
                return positive && !negative;
            }

            const maxCol = src.wells.length;
            const maxRow = src.wells[0]?.length || 0;
            const out = new PlateCtor(name || `${tableName}_${selectorRaw}_`, maxCol, maxRow);

            for (let c = 0; c < maxCol; c++) {
                for (let r = 0; r < maxRow; r++) {
                    const w = src.wells[c][r];
                    if (!w) continue;
                    if (!wellMatches(w, c, r)) continue;
                    const nw = new WellCtor(`${String.fromCharCode(65 + c)}${r + 1}`);
                    nw.value = w.value;
                    nw.label = w.label;
                    if (w.group) nw.group = { ...w.group };
                    nw.uid = uuid();
                    nw.properties = { ...(w.properties || {}), formula, refIDs: [w.uid] };
                    out.wells[c][r] = nw;
                }
            }

            if (compress && typeof out.removeEmptyRowsAndColumns === "function") {
                out.removeEmptyRowsAndColumns();
            }
            return out;
        }

        function isInGlyph(x, y, glyph, grid) {
            if (!glyph || !glyph.shape) return false;
            const rootShape = glyph.shape;
            const hit = rootShape.inside(grid, x, y);
            if (hit) {
                return true;
            }
            else return false;
        }

        function createSingleFormulaPlate(label, formula, platetrack) {
            const WELL_SCREEN_WIDTH = 150;
            const WELL_SCREEN_HEIGHT = 24;

            const PlateCtor = Plate;
            const plateName = String(label || 'SingleFormula');

            const plate = new PlateCtor(plateName, 1, 1);
            plate.last_touched = new Date();
            plate.setPreferences?.('showInputs', true);

            plate.range = { xi: 0, xf: 1, yi: 0, yf: 0 };

            plate.grid.xmin = 0;
            plate.grid.ymin = 0;
            plate.grid.xmax = 2;
            plate.grid.ymax = 1;

            plate.grid.width = platetrack.grid.worldWidth(plate.grid.xmax * WELL_SCREEN_WIDTH);
            plate.grid.height = platetrack.grid.worldHeight(plate.grid.ymax * WELL_SCREEN_HEIGHT);
            plate.grid.yi = platetrack.grid.Ywc(100) - plate.grid.height;
            plate.grid.rescale?.();

            plate.wells = [];
            plate.wells[0] = [];
            plate.wells[1] = [];
            plate.wells[0][0] = new GenericWell('A1');
            plate.wells[1][0] = new GenericWell('B1');

            plate.wells[0][0].value = label;

            const valueStr = String(formula ?? '').trim();
            if (valueStr.startsWith('=')) {

                plate.formula = plate.formula || {};
                plate.formula['[1:1][0:0]'] = valueStr;
            } else {

                plate.wells[1][0].value = formula;
            }

            plate.applycolumnheaders?.();
            plate.applyrowheaders?.();
            platetrack.addNextAvailableX(plate);

            return plate;
        }

        async function exportBorderAtPixelsPerFoot(border, graph, desiredPixelsPerFoot, opts = {}) {
            const {
                download = false,
                filename,
                returnDataURL = true,
            } = opts;

            const worldLeft = border.getX();
            const worldRight = border.getXf();
            const worldTop = border.getYf();
            const worldBottom = border.getY();

            const screenLeft = Math.min(worldLeft, worldRight);
            const screenRight = Math.max(worldLeft, worldRight);
            const screenTop = Math.min(worldTop, worldBottom);
            const screenBottom = Math.max(worldTop, worldBottom);

            const screenRect = {
                x: screenLeft,
                y: screenTop,
                width: screenRight - screenLeft,
                height: screenBottom - screenTop,
            };

            const feetRect = border.getFeetRect();

            const worldScale = desiredPixelsPerFoot;

            const targetWidthPx = Math.max(1, Math.round(feetRect.width * worldScale));
            const targetHeightPx = Math.max(1, Math.round(feetRect.height * worldScale));

            const defaultName =
                filename || `border-${targetWidthPx}x${targetHeightPx}-${Math.round(screenRect.x)}-${Math.round(screenRect.y)}.png`;

            const res = await graph.exportHighResPNG(
                screenRect,
                { targetWidth: targetWidthPx, targetHeight: targetHeightPx },
                { download, filename: defaultName, returnDataURL }
            );

            return res;
        }

        const scenes = await exec('baja/plate/plate-track-backgrounds.js')

        let PlateTrack = class PlateTrack {
            ptracks = []
            description = '';
            users = {}
            path = null;
            type = null;
            owner = null;
            formulas = {}
            attr__displayComputationEvents = null;
            attr__ShowHelpMessages = false;
            attr__drawFormulaConnections = true;
            attr__showTablesMenu = false;
            attr__autoSave = true;
            attr__displayEvents = false;
            background_function = null;
            attr__hideWellDetailPopup = true;
            attr__AutoRunCalculation = false;
            attr__showGrid = false;
            attr__displayBookMarks = true;
            attr__showScrollbar = false;
            buttons = [];
            name;
            minObjectY;
            maxObjectY;
            isDraggingScrollbar = false;
            color = 'gray'
            activePlot = null;
            root = [];
            ops = []
            transferFunctions = [];
            trackFunctions = [];
            connections = []
            m_plots = []
            glyphs = []
            bookmarks = {}
            ljl_bookmarks = {}
            fixedAspectRatio = null;
            grid;
            mode = 'select';
            layoutTool = null;
            menu = null;
            options_menu = null;
            plate_menu = null;
            menu_vis = false;
            defaultWellWidthSc = 120;
            defaultWellHeightSc = 10;
            selectedPlate;
            ifun = 'hello world';
            fromPlate;
            toPlate;
            wb;
            wbid = null;
            file = `${generateNautName()}.bjb`
            static main_layout;
            __msg;
            __msgb;
            ___suspend_select = false;
            __formulaEdges = [];
            ____zooming = false;
            __msgc;
            uid;
            __tables_menu = null;
            __bookmark_menu = null;
            __canvas_width;
            __canvas_height;
            __not_connected = true;
            __selectionListeners = []
            __pointListeners = []
            __updateListener = []
            __stack = []
            __redostack = [];
            __stack_menu = null;
            __redo_stack_menu = null;
            __canvas__;
            __menu__ = null;
            ___selected_well_listener = null;
            menu_plate;
            interpreter_scope = '_'
            _lastUpdateTime = Date.now();
            ___formula_integrity_report

            constructor(name) {
                this.name = name;
                this.uid = uuid();
                this.grid = new MGrid(0, 0, 1, 1);
                this.grid.setxmax(1000);
                this.grid.setymax(1000);
                this.grid.setxmin(0);
                this.grid.setymin(0);
                this.grid.setInset(0, 0)
                this.grid.rescale();
                this.setMessage("");
                scrollGrid = new MGrid(scrollbarX, scrollbarY, scrollbarWidth, scrollbarHeight)
                scrollGrid.setInset(0, 0)

                scrollGrid.ymin = 0
                scrollGrid.ymax = 1
                scrollGrid.height = 10;
                scrollGrid.xi = 0;

                scrollGrid.rescale();
                scroll_y = 2;
                this.users['owner'] = getUser()
                if (isMobile()) {
                    this.attr__showTablesMenu = false;
                }

            }

            ___imageCaptureRect = null
            actionGlyph = [];
            async addActionGlyph(pt, text, action) {
                if (isMobile()) {
                    return;
                }
                function extractNames(arr) {
                    return arr
                        .filter(item => item && typeof item.name === 'string')
                        .map(item => item.name);
                }
                const __contains = (v) => {
                    let arr = extractNames(this.actionGlyph)
                    return arr.some(item =>
                        item && typeof item.getShapeComment === 'function' && item.getShapeComment().toLowerCase() === v
                    );
                }
                if (__contains(text)) {
                    return;
                }
                let gArrow = await exec('flexigraph/shapes/postit.js');
                let Glyph = await exec('baja/draw/glyph.js');
                let arrow = new gArrow(this.grid.Xwc(this.actionGlyph.length * 100 + 300), this.grid.Ywc(100), this.grid.Xwc(this.actionGlyph.length * 190 + 300), this.grid.Ywc(100), 'yellow');
                arrow.w = pt.grid.worldWidth(100)
                arrow.h = pt.grid.worldHeight(100)
                arrow.comment = text;
                let g = new Glyph(arrow);
                g.action = action;
                g.setText(text)
                this.actionGlyph.push(g)

            }


            async findEnterFormulaAnnotation() {
                for (const plate of this.root || []) {
                    const annotations = plate?.wellannotations || {};
                    for (const [range, annotation] of Object.entries(annotations)) {
                        const wantsFormula =
                            annotation?.visible !== false &&
                            String(annotation?.comment || '').trim().toLowerCase() === 'enter formula';

                        if (!wantsFormula) continue;

                        const formula = plate.formula?.[range];
                        if (typeof formula === 'string' && formula.trim().length > 0) {


                            if (isValidFormulaString(formula)) {
                                this.setMessage(`Running formula: ${formula}`);
                            } else {
                                this.setMessage(`Invalid formula: ${formula}`);
                                continue;
                            }


                            let fkey = plate.name + range;
                            let { tableName, startX, stopX, startY, stopY } = parseTableStructure(fkey)
                            let table = this.getTableByName(tableName);
                            const calculation = formula;
                            let callist = generateExpressionsInRange(calculation, startY, 1000)
                            if (callist && callist.length >= 1) {
                                let index = startY;
                                for (let icl of callist) {
                                    try {
                                        let v = await exec('baja/plate/ops/frun-object.js', icl, this);
                                        if (!v['results']) {
                                        } else {
                                            if (table.wells[0].length + 1 < index) {
                                                this.updateWells(v, tableName, startX, stopX, index, index);
                                            } else {
                                                table.addRow();
                                                this.updateWells(v, tableName, startX, stopX, index, index);
                                            }
                                        }
                                    } catch (exception) {
                                        this.tagError(tableName, startX, stopX, startY, stopY, calculation)
                                        stopY = index;
                                        break;
                                    }
                                    index++;

                                }

                            }
                            debugger;
                            delete plate.wellannotations[range];
                            delete plate.formula[range];


                            range = `[${startX}:${stopX}],[${startY}:${index}]`;
                            plate.formula[range] = formula;
                            return { plate, range, annotation };

                        }

                    }
                }
                return null;
            }

            async exportPNG(border, graph, desiredPixelsPerFoot) {
                return await exportBorderAtPixelsPerFoot(border, graph, desiredPixelsPerFoot)
            }

            addLabelTable(label, formula) {
                createSingleFormulaPlate(label, formula, this)

            }

            async paintWells() {

                let WellDisplay = await exec('baja/plate/views/well-display-factory')
                const keys = Object.keys(WellDisplay)
                let welld = await exec('py/openai/paint-wells.py', keys, this.root)

            }

            async createPlateFromFormula(formula) {

                function replaceCommasInParensButNotBrackets(str, replacement = ";") {
                    let depthRound = 0;
                    let depthSquare = 0;
                    let out = "";

                    for (let i = 0; i < str.length; i++) {
                        const ch = str[i];

                        if (ch === "(") depthRound++;
                        else if (ch === ")") depthRound = Math.max(0, depthRound - 1);
                        else if (ch === "[") depthSquare++;
                        else if (ch === "]") depthSquare = Math.max(0, depthSquare - 1);

                        if (ch === "," && depthRound > 0 && depthSquare === 0) {
                            out += replacement;
                        } else {
                            out += ch;
                        }
                    }

                    return out;
                }
                formula = replaceCommasInParensButNotBrackets(formula, '|')

                let p = await generatePlateFromFormula(formula, this)
                await this.panToNextSpot(100)
                this.addPlateWithConsistentWellSize(p)
                this.updateCalculations();
                return p;
            }

            getDistinctPlateNamesAndGroupKeys() {
                const plateNames = new Set();
                const groupKeys = new Set();

                const plates = Array.isArray(this.root) ? this.root : [];
                for (const plate of plates) {

                    if (plate && typeof plate.name === 'string' && plate.name.trim() !== '') {
                        plateNames.add(plate.name);
                    }

                    const wells2D = plate && Array.isArray(plate.wells) ? plate.wells : [];
                    for (const row of wells2D) {
                        if (!Array.isArray(row)) continue;
                        for (const well of row) {
                            const group = well && well.group;
                            if (group && typeof group === 'object') {
                                for (const k of Object.keys(group)) {
                                    if (typeof k === 'string' && k) groupKeys.add(k);
                                }
                            }
                        }
                    }
                }

                return {
                    plateNames: Array.from(plateNames),
                    groupKeys: Array.from(groupKeys),
                };
            }

            async zoomToSelectedWells(plate, { pad = 0.15 } = {}) {
                this.clearActionGlyphs();
                if (!plate) return;

                this.pushGrid?.();

                this.grid.rescale();
                if (plate.highlight) plate.highlight();

                let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
                let any = false;
                let selectedCount = 0;

                const cols = plate.wells?.length || 0;
                for (let c = 0; c < cols; c++) {
                    const col = plate.wells[c] || [];
                    const rows = col.length;

                    for (let r = 0; r < rows; r++) {
                        const w = col[r];
                        if (!w || !w.select) continue;

                        const wx = Number.isFinite(w.x) ? w.x : c;
                        const wy = Number.isFinite(w.y) ? w.y : r;
                        const ww = Number.isFinite(w.w) && w.w > 0 ? w.w : 1;
                        const wh = Number.isFinite(w.h) && w.h > 0 ? w.h : 1;

                        const x0 = wx;
                        const y0 = wy;
                        const x1 = wx + ww;
                        const y1 = wy + wh;

                        if (x0 < xmin) xmin = x0;
                        if (y0 < ymin) ymin = y0;
                        if (x1 > xmax) xmax = x1;
                        if (y1 > ymax) ymax = y1;

                        any = true;
                        selectedCount++;
                    }
                }

                if (!any) return;

                const minSpan = 1e-6;
                let bw = Math.max(xmax - xmin, minSpan);
                let bh = Math.max(ymax - ymin, minSpan);

                if (selectedCount === 1) {
                    const cx = (xmin + xmax) / 2;
                    const cy = (ymin + ymax) / 2;

                    const side = Math.max(bw, bh) * 2; // square + 2x padding

                    xmin = cx - side / 2;
                    xmax = cx + side / 2;
                    ymin = cy - side / 2;
                    ymax = cy + side / 2;
                } else {
                    // default multi-well padding
                    const px = bw * pad;
                    const py = bh * pad;

                    xmin -= px;
                    xmax += px;
                    ymin -= py;
                    ymax += py;
                }

                let ag = new AnimateGrid(this.grid);
                ag.animateTo(
                    plate.grid.X(xmin),
                    plate.grid.X(xmax),
                    plate.grid.Y(ymax),
                    plate.grid.Y(ymin),
                    60
                );

                this.setSelected?.(plate);

                if (plate.clk_drag) plate.clk_drag(this);
                else this.wb?.(null);
            }
            async zoomToAllTables(opts = {}) {
                this.clearActionGlyphs();
                const padding = opts.padding ?? 24;
                const animateMs = opts.animateMs ?? 0;
                const applyRescale = opts.applyRescale ?? true;

                if (!this.grid || !this.root || !Array.isArray(this.root) || this.root.length === 0) return;

                const rects = [];
                for (const node of this.root) {
                    if (!node) continue;

                    if (node.visible === false) continue;

                    const g = node.grid ?? node;
                    const xi = g?.xi, yi = g?.yi, w = g?.width, h = g?.height;

                    if (Number.isFinite(xi) && Number.isFinite(yi) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
                        rects.push({ xi, yi, w, h });
                    }
                }

                if (rects.length === 0) return;

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const r of rects) {
                    minX = Math.min(minX, r.xi);
                    minY = Math.min(minY, r.yi);
                    maxX = Math.max(maxX, r.xi + r.w);
                    maxY = Math.max(maxY, r.yi + r.h);
                }

                const unionW = Math.max(0, maxX - minX);
                const unionH = Math.max(0, maxY - minY);
                if (!(unionW > 0 && unionH > 0)) return;

                const tgtW0 = unionW + padding * 2;
                const tgtH0 = unionH + padding * 2;

                const worldSpanW = (this.grid.worldWidth && this.grid.width)
                    ? this.grid.worldWidth(this.grid.width) : (this.grid.width || tgtW0);
                const worldSpanH = (this.grid.worldHeight && this.grid.height)
                    ? this.grid.worldHeight(this.grid.height) : (this.grid.height || tgtH0);
                const aspect = (worldSpanW > 0 && worldSpanH > 0) ? (worldSpanW / worldSpanH) : 1;

                let tgtW = tgtW0;
                let tgtH = tgtH0;
                const needAspect = aspect;
                const haveAspect = tgtW0 / tgtH0;
                if (haveAspect < needAspect) {

                    tgtW = tgtH0 * needAspect;
                } else if (haveAspect > needAspect) {

                    tgtH = tgtW0 / needAspect;
                }

                const ucx = minX + unionW * 0.5;
                const ucy = minY + unionH * 0.5;
                const tgtXi = ucx - tgtW * 0.5;
                const tgtYi = ucy - tgtH * 0.5;

                const cur = {
                    xi: this.grid.xi ?? 0,
                    yi: this.grid.yi ?? 0,
                    w: this.grid.width ?? worldSpanW ?? tgtW,
                    h: this.grid.height ?? worldSpanH ?? tgtH,
                };

                const applyView = ({ xi, yi, w, h }) => {
                    if (typeof this.grid.setWorldRect === 'function') {
                        this.grid.setWorldRect(xi, yi, w, h);
                    } else {
                        this.grid.xi = xi;
                        this.grid.yi = yi;
                        this.grid.width = w;
                        this.grid.height = h;
                    }
                    if (applyRescale && typeof this.grid.rescale === 'function') this.grid.rescale();
                    this.generateTables?.();
                };

                if (!animateMs || animateMs <= 0) {

                    applyView({ xi: tgtXi, yi: tgtYi, w: tgtW, h: tgtH });
                    return;
                }

                const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
                const now = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
                const rAF = (cb) =>
                    (typeof requestAnimationFrame !== 'undefined')
                        ? requestAnimationFrame(cb)
                        : setTimeout(() => cb(now()), 16);

                const start = now();
                await new Promise((resolve) => {
                    const tick = (ts) => {
                        const t = Math.max(0, Math.min(1, (ts - start) / animateMs));
                        const e = easeOutCubic(t);

                        const xi = cur.xi + (tgtXi - cur.xi) * e;
                        const yi = cur.yi + (tgtYi - cur.yi) * e;
                        const w = cur.w + (tgtW - cur.w) * e;
                        const h = cur.h + (tgtH - cur.h) * e;

                        applyView({ xi, yi, w, h });

                        if (t >= 1) return resolve();
                        rAF(tick);
                    };
                    rAF(tick);
                });
            }

            async zoomToPlate___(plateName, opts = {}) {
                this.clearActionGlyphs();

                if (!this.grid || !this.root || !plateName) return;

                const plate = this.root.find(p =>
                    p && (p.name === plateName || p.id === plateName)
                );

                if (!plate || !plate.grid) return;

                this.deselectAll?.();

                if (plate.highlight) plate.highlight();

                this.grid.rescale?.();

                const g = plate.grid;

                const cols = Math.max(1, g.xmax || plate.cols || 1);
                const rows = Math.max(1, g.ymax || plate.rows || 1);

                const totalWidth = g.width;
                const totalHeight = g.height;
                const xi = g.xi;
                const yi = g.yi;

                if (
                    totalWidth == null ||
                    totalHeight == null ||
                    xi == null ||
                    yi == null ||
                    totalWidth <= 0 ||
                    totalHeight <= 0
                ) return;

                const centerX = xi + totalWidth / 2;
                const centerY = yi + totalHeight / 2;

                const currentWellW = totalWidth / cols;
                const currentWellH = totalHeight / rows;

                const targetWellW = opts.wellWidth ?? currentWellW;
                const targetWellH = opts.wellHeight ?? currentWellH;

                const scaleX = currentWellW / targetWellW;
                const scaleY = currentWellH / targetWellH;

                const scale = opts.scale ?? Math.max(scaleX, scaleY);

                let newWidth = this.grid.width * scale;
                let newHeight = this.grid.height * scale;

                const paddingCells = opts.paddingCells ?? 1;

                const minWidth = totalWidth + currentWellW * paddingCells * 2;
                const minHeight = totalHeight + currentWellH * paddingCells * 2;

                if (newWidth < minWidth) newWidth = minWidth;
                if (newHeight < minHeight) newHeight = minHeight;

                const gridAspect = this.grid.width / this.grid.height;
                const targetAspect = newWidth / newHeight;

                if (Number.isFinite(gridAspect) && gridAspect > 0) {
                    if (targetAspect < gridAspect) {
                        newWidth = newHeight * gridAspect;
                    } else if (targetAspect > gridAspect) {
                        newHeight = newWidth / gridAspect;
                    }
                }

                await this.zoomto(centerX, centerY, newWidth, newHeight);

                if (plate.name) {
                    LJScript.add(this.name, 'zoomoutplot ' + plate.name);
                }
            }


            // if (ch && ch.grid && this.__canvas__) {
            //     this.grid.rescale();

            //     // plate top in your coordinate convention
            //     const plateTopY = ch.grid.yi + ch.grid.height;

            //     // world coordinate at 20px from top of canvas
            //     const targetTopY = this.grid.Ywc(20);

            //     // how far current plate top is from desired top
            //     const dy = plateTopY - targetTopY;



            //     const newymin = this.grid.ymin + dy;
            //     const newymax = this.grid.ymax + dy;

            //     this.grid.ymin = newymin;
            //     this.grid.ymax = newymax;

            //     this.grid.rescale?.();
            // }




            async zoomintoplate(plate) {
                this.clearActionGlyphs();
                if (!plate) return;

                this.pushGrid();

                if (plate.typeof && plate.typeof === 'plot') {
                    this.zoomintoplot(plate);
                    return;
                }

                if (this.name) LJScript.add(this.name, 'zoomin ' + this.name);

                this.grid.rescale();
                if (plate.highlight) plate.highlight();

                // target visible well size in pixels
                const TARGET_W = 120;
                const TARGET_H = 14;

                const viewportW = this.grid.width;
                const viewportH = this.grid.height;


                const well = plate.wells?.[0]?.[0];
                if (!well) return;

                // current well size on screen
                const currentWellW = plate.grid.screenWidth(well.w || 1);
                const currentWellH = plate.grid.screenHeight(well.h || 1);

                // world units per pixel
                const worldPerPixelX = (well.w || 1) / TARGET_W;
                const worldPerPixelY = (well.h || 1) / TARGET_H;

                // preserve aspect ratio consistently
                const worldPerPixel = Math.max(worldPerPixelX, worldPerPixelY);

                // desired viewport size in world units
                const desiredWorldWidth = viewportW * worldPerPixel;
                const desiredWorldHeight = viewportH * worldPerPixel;

                // plate bounds
                const plateLeft = plate.grid.xi;
                const plateRight = plate.grid.xi + plate.grid.width;
                const plateTop = plate.grid.yi + plate.grid.height;

                const plateBottom = plate.grid.yi;

                const plateCenterX = (plateLeft + plateRight) / 2;
                const plateCenterY = (plateTop + plateBottom) / 2;

                // centered camera
                let xi = plateCenterX - desiredWorldWidth / 2;
                let xj = plateCenterX + desiredWorldWidth / 2;
                let ymin = plateCenterY - desiredWorldHeight / 2;
                let ymax = plateCenterY + desiredWorldHeight / 2;

                // clamp vertically
                if (ymin < plateTop) {
                    ymin = plateTop;
                    ymax = ymin + desiredWorldHeight;
                }

                if (ymax > plateBottom) {
                    ymax = plateBottom;
                    ymin = ymax - desiredWorldHeight;
                }

                this.____zooming = true;

                const ag = new AnimateGrid(this.grid);


                const plateTopY = plate.grid.yi + plate.grid.height;

                // world coordinate at 20px from top of canvas
                const targetTopY = this.grid.Ywc(20);

                // how far current plate top is from desired top
                const dy = (targetTopY - plateTop);



                // await ag.animateToSTOP(
                //     xi,
                //     xj,
                //     ymin,
                //     ymax,
                //     60,
                //     currentWellW,
                //     currentWellH,
                //     TARGET_W,
                //     TARGET_H,
                //     'top',
                //     dy
                // );

                this.____zooming = false;
                this.setSelected(plate);
                this.center(plate)
                this.setPlateTop20PxFromCanvasTop(plate);


            }
            getDefaultWellWidthSC(column_count) {
                if (((100 * column_count)) > this.grid.width) {
                    return this.defaultWellWidthSc;
                }
                let www = this.grid.worldWidth(100 * column_count)
                return www;

            }
            applyAssignmentWellTypes(assignBundle, opts = {}) {
                if (!assignBundle) return;

                const results = Array.isArray(assignBundle?.results) ? assignBundle.results
                    : Array.isArray(assignBundle?.items) ? assignBundle.items
                        : Array.isArray(assignBundle?.assignments) ? assignBundle.assignments
                            : Array.isArray(assignBundle) ? assignBundle
                                : null;

                if (!Array.isArray(results) || results.length === 0) return;

                const alsoSetValue = opts.alsoSetValue ?? false;
                const alsoAttachField = opts.alsoAttachField ?? false;

                let selectedWells = this.getSelectedWellsInOrder()
                if (!Array.isArray(selectedWells)) {
                    selectedWells = [];
                    const root = this.root || [];
                    for (const plate of root) {
                        const cols = plate?.wells || [];
                        for (let c = 0; c < cols.length; c++) {
                            const col = cols[c] || [];
                            for (let r = 0; r < col.length; r++) {
                                const w = col[r];
                                if (w && w.select) selectedWells.push(w);
                            }
                        }
                    }
                }
                if (!Array.isArray(selectedWells) || selectedWells.length === 0) return;

                const byUid = new Map();
                for (const w of selectedWells) {
                    console.log('debubg');
                    const uid = (w && (w.uid ?? w.id)) != null ? String(w.uid ?? w.id) : null;
                    if (uid) byUid.set(uid, w);
                }
                if (byUid.size === 0) return;

                const applyToWell = (well, item) => {
                    const wtype = item.wtype ?? item.chosen_option ?? null;
                    if (wtype != null) {
                        if (typeof well.setWellType === 'function') {
                            try { well.setWellType(wtype); } catch { }
                        } else {
                            well.type = wtype;
                        }
                    }

                    if (alsoSetValue && 'value' in item) {
                        if (typeof well.setValue === 'function') well.setValue(item.value);
                        else well.value = item.value;
                    }

                    const fieldsArr = Array.isArray(item.fields) ? item.fields
                        : Array.isArray(item.field) ? item.field
                            : null;

                    if (alsoAttachField && fieldsArr && fieldsArr.length) {
                        well.field = Array.from(new Set([...(well.field || []), ...fieldsArr]));
                    }
                };

                for (const res of results) {
                    if (!res) continue;
                    const uid = res.uid ?? res.id;
                    if (uid == null) continue;
                    const well = byUid.get(String(uid));
                    if (!well) continue;

                    applyToWell(well, res);

                    if ((well.uid ?? well.id) == null) {
                        well.uid = uid;
                    }
                }

                if (this.root?.length && this.grid && typeof this.grid.rescale === 'function') {
                    this.grid.rescale();
                }
                this.generateTables?.();
            }

            extractRefFromExpression(expr, getTablesByName) {

                try {
                    const parsed = parseSingleVariable(expr, getTablesByName());

                    const tName = parsed.tableName || parsed.table || parsed.name;
                    if (tName != null && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
                        return { tableName: tName, x: parsed.x, y: parsed.y };
                    }
                } catch (_) { }

                let m = String(expr).match(/^([A-Za-z_]\w*)\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]\s*$/);
                if (m) {
                    return { tableName: m[1], x: Number(m[2]), y: Number(m[3]) };
                }

                m = String(expr).match(/^([A-Za-z_]\w*)\s*\[\s*([A-Za-z]+)(\d+)\s*\]\s*$/);
                if (m) {
                    const col = m[2].toUpperCase();
                    const row = Number(m[3]);

                    let x = 0;
                    for (let i = 0; i < col.length; i++) {
                        x = x * 26 + (col.charCodeAt(i) - 64);
                    }
                    x -= 1;
                    const y = row - 1;
                    return { tableName: m[1], x, y };
                }

                return null;
            }

            collectRefsForCalculation(calculation, startY, stopY, getTablesByName) {
                const refs = [];

                const tokenPattern = /\b\w+(?:\[[^\]]+\])+/g;

                if (calculation.trim().startsWith('function')) {
                    for (let y = startY; y <= stopY; y++) {
                        let funcStr = calculation.trim();
                        const matched = funcStr.match(tokenPattern);
                        if (!matched) continue;

                        for (const rawToken of matched) {

                            let callist = generateExpressionsInRange(rawToken, y, y);
                            if (!callist || callist.length === 0) continue;

                            for (const expanded of callist) {
                                const ref = this.extractRefFromExpression(expanded, getTablesByName);
                                if (ref) refs.push(ref);
                            }
                        }
                    }
                } else {

                    const callist = generateExpressionsInRange(calculation.replace(/\s+/g, ''), startY, stopY);
                    if (callist && callist.length) {
                        for (const expanded of callist) {
                            const ref = this.extractRefFromExpression(expanded, getTablesByName);
                            if (ref) refs.push(ref);
                        }
                    } else {

                        const ref = this.extractRefFromExpression(calculation.replace(/\s+/g, ''), getTablesByName);
                        if (ref) refs.push(ref);
                    }
                }

                return refs;
            }
            removeRowsWithoutEdgeInSecondColumn(tableName) {
                const tt = this.getTableByName(tableName);
                if (!tt) return;

                const edges = this.__formulaEdges || [];
                if (!edges.length) return;

                const usedUids = new Set();
                for (const e of edges) {
                    if (e.fromW && e.fromW.uid != null) {
                        usedUids.add(e.fromW.uid);
                    }
                    if (e.toW && e.toW.uid != null) {
                        usedUids.add(e.toW.uid);
                    }
                }

                const getRowCount = () => {
                    if (Array.isArray(tt.rows)) {
                        return tt.rows.length;
                    }
                    if (Array.isArray(tt.wells) && tt.wells.length > 0 && Array.isArray(tt.wells[0])) {

                        return tt.wells[0].length;
                    }
                    return 0;
                };

                const getSecondColumnCell = (y) => {
                    const colIndex = 1;

                    if (Array.isArray(tt.rows)) {
                        const row = tt.rows[y];
                        if (!row || row.length <= colIndex) return null;
                        return row[colIndex];
                    }

                    if (Array.isArray(tt.wells) && tt.wells.length > colIndex) {
                        const col = tt.wells[colIndex];
                        if (!col || col.length <= y) return null;
                        return col[y];
                    }

                    return null;
                };

                const removeRowAt = (y) => {

                    if (typeof tt.removeRow === "function") {
                        tt.removeRow(y);
                        return;
                    }

                    if (Array.isArray(tt.rows)) {
                        tt.rows.splice(y, 1);
                    }

                    if (Array.isArray(tt.wells)) {
                        for (let x = 0; x < tt.wells.length; x++) {
                            if (Array.isArray(tt.wells[x]) && tt.wells[x].length > y) {
                                tt.wells[x].splice(y, 1);
                            }
                        }
                    }
                };

                for (let y = getRowCount() - 1; y >= 0; y--) {
                    const cell = getSecondColumnCell(y);
                    if (!cell) continue;

                    const uid = cell.uid;
                    if (uid == null) continue;

                    if (!usedUids.has(uid)) {

                        removeRowAt(y);
                    }
                }

                tt.fitRowsAndColumns();
            }

            recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation) {
                if (!calculation || startX == null || stopX == null || startY == null || stopY == null) {
                    console.log(" failed to rec ord the enget fcvor this " + tableName)
                    return;

                }
                let tt = this.getTableByName(tableName)
                const colSel = `${startX}:${stopX}`
                const rowSel = `${startY}:${stopY}`
                const wells = tt.getWellsByString(`[${colSel}][${rowSel}]`) || [];
                let fromWidth = 10;
                let fromHeight = 10;
                let fromScreenX = -1000
                let fromScreenY = -10000
                let fromUid = -1;
                let fromW = null;
                if (wells && wells.length > 0) {
                    fromWidth = wells[0].__screen_width;
                    fromHeight = wells[0].__screen_height;
                    fromScreenX = wells[0].__screen_x
                    fromScreenY = wells[0].__screen_y
                    fromUid = wells[0].uid;
                    fromW = wells[0]
                }

                if (!this.__formulaEdges) this.__formulaEdges = [];
                if (!this.__edgeSeen) this.__edgeSeen = new Set();

                const refs = collectRefsForCalculation.call(
                    this,
                    calculation,
                    startY,
                    stopY,
                    this.getTablesByName ? this.getTablesByName.bind(this) : undefined
                );
                if (!refs || refs.length === 0) return;

                const uniqRefs = [];
                const seenRef = new Set();
                for (const r of refs) {
                    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
                    const rk = `${r.tableName}:${r.x},${r.y}`;
                    if (!seenRef.has(rk)) {
                        seenRef.add(rk);
                        uniqRefs.push(r);
                    }
                }

                for (const ref of uniqRefs) {

                    let rt = this.getTableByName(ref.tableName)
                    const ek = `${tableName}:${startX},${startY}->${ref.tableName}:${ref.x},${ref.y}`;
                    const wells = rt.getWellsByString(`[${ref.x}:${ref.x}][${ref.y}:${ref.y}]`) || [];
                    let toWidth = fromWidth;
                    let toHeight = fromHeight;
                    let toScreenX = 0;
                    let toScreenY = 0;
                    let toUid = -1;
                    let toW = null;
                    if (wells && wells.length > 0) {
                        toW = wells[0]
                        toWidth = wells[0]?.__screen_width
                        toHeight = wells[0]?.__screen_height
                        toScreenX = wells[0].__screen_x
                        toScreenY = wells[0].__screen_y
                        toUid = wells[0].uid
                    }
                    if (this.__edgeSeen.has(ek)) {
                        continue;
                    }

                    this.__edgeSeen.add(ek);
                    this.__formulaEdges.push({
                        tableName,
                        fromW: fromW,
                        toW: toW,
                        fromUid: fromUid,
                        touid: toUid,
                        to_width: toWidth,
                        to_height: toHeight,
                        from_width: fromWidth,
                        from_height: fromHeight,
                        from: { x: fromScreenX, y: fromScreenY },
                        to: { x: toScreenX, y: toScreenY },
                        toTable: ref.tableName
                    });
                }
            }

            drawFormulaReverseDependencyArrows(plate, ctx, graph) {
                if (!this.__formulaEdges || this.__formulaEdges.length === 0) return;
                const table = this.getTableByName?.(plate.name);
                if (!table) return;

                const wells = table.getSelectedWellsInOrder?.() || [];
                if (!wells.length) return;

                ctx.save();
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 3]);

                const colors = [
                    '#1f77b4',
                    '#ff7f0e',
                    '#2ca02c',
                    '#d62728',
                    '#9467bd',
                    '#8c564b',
                    '#e377c2',
                    '#7f7f7f',
                    '#bcbd22',
                    '#17becf'
                ];
                let colorIndex = 0;

                for (const sw of wells) {
                    for (const edge of this.__formulaEdges) {

                        const targetTableName = edge.toTable || edge.tableName;
                        if (targetTableName !== table.name) continue;

                        if (sw.uid !== edge.touid) continue;
                        if (!edge.toW || !edge.fromW) continue;

                        const toW = edge.toW;
                        const fromW = edge.fromW;

                        const toWWidth = toW.__screen_width ?? 0;
                        const toWHeight = toW.__screen_height ?? 0;
                        const fromWWidth = fromW.__screen_width ?? 0;
                        const fromWHeight = fromW.__screen_height ?? 0;

                        const tailX = fromW.__screen_x + fromWWidth / 2;
                        const tailY = fromW.__screen_y + fromWHeight / 2;

                        const tipX = toW.__screen_x + toWWidth / 2;
                        const tipY = toW.__screen_y + toWHeight / 2;

                        const color = colors[colorIndex++ % colors.length];

                        drawArrow(ctx, tailX, tailY, tipX, tipY, {
                            color,
                            lineWidth: 2,
                            headLength: 18,
                            headWidth: 16,
                            shadowBlur: 3,
                            shadowColor: 'rgba(0,0,0,0.12)'
                        });
                    }
                }

                ctx.restore();
            }

            drawFormulaDependencyArrows(plate, ctx, graph) {
                if (!this.__formulaEdges || this.__formulaEdges.length === 0) return;
                const table = this.getTableByName?.(plate.name);
                if (!table) return;

                ctx.save();
                ctx.lineWidth = 1.25;
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = 'lightBlue'

                let wells = table.getSelectedWellsInOrder();

                for (let sw of wells) {
                    if (sw.group && sw.group['Total_Profit'])
                        console.log('debubg');

                    for (const edge of this.__formulaEdges) {
                        if (edge.tableName !== table.name) continue;
                        if (sw.uid === edge.fromUid) {

                            const sx = edge.fromW.__screen_x
                            const sy = edge.fromW.__screen_y
                            const tx = edge.toW.__screen_x
                            const ty = edge.toW.__screen_y
                            let fromW = edge.fromW.__screen_width;
                            let toW = edge.toW.__screen_width;
                            let fromH = edge.fromW.__screen_height;
                            let toH = edge.toW.__screen_height;
                            drawArrow(ctx, sx + fromW / 2, sy + fromH / 2, tx + toW / 2, ty + toH / 2, {
                                color: 'rgba(15, 255, 7, 0.7)',
                                lineWidth: 2,
                                headLength: 18,
                                headWidth: 16,
                                shadowBlur: 3,
                                shadowColor: 'rgba(0,0,0,0.1)'
                            });
                        }
                    }
                }

                ctx.restore();
            }

            worldToScreen(table, graph, wx, wy) {
                const gx = table.grid.X(wx);
                const gy = table.grid.Y(wy);
                return { x: graph.X(gx), y: graph.Y(gy) };
            }

            addSelectionListener(selectionListener) {
                this.__selectionListeners.push(selectionListener)
            }
            addPointListener(pointListener) {
                this.__pointListeners.push(pointListener)
            }
            setBackground(scene_type) {
                this.background_function = scenes[scene_type];
            }
            displayTopLevelTrack() {
                if (this.ptracks && this.ptracks.length > 0) {
                    function __decompress(compressedString) {
                        const chunkSize = 0x8000;
                        let binaryData = [];
                        for (let i = 0; i < compressedString.length; i += chunkSize) {
                            const chunk = compressedString.substring(i, i + chunkSize);
                            const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
                            binaryData.push(...chunkArray);
                        }
                        let jsonString = decompressJson(Uint8Array.from(binaryData));
                        return jsonString;
                    }
                    const udata = __decompress(this.ptracks[0])

                    this.copyFromJSON(udata)
                    this.ptracks[0] = this.capturestate()

                }
            }

            removeTableByName(nameToRemove) {
                const index = this.root.findIndex(item => item.name === nameToRemove);
                if (index !== -1) {
                    this.root.splice(index, 1);
                }

            }

            getNextObjectInDirection(direction, opts = {}) {
                const canvas = this.__canvas__;
                if (!canvas) throw new Error("Canvas not found; provide this.__canvas__.");

                const sx0 = opts.fromScreen?.x ?? canvas.width / 2;
                const sy0 = opts.fromScreen?.y ?? canvas.height / 2;

                const dir = {
                    right: { x: -1, y: 0 },
                    left: { x: 1, y: 0 },
                    up: { x: 0, y: 1 },
                    down: { x: 0, y: -1 },
                }[direction];
                if (!dir) throw new Error("direction must be one of: right, left, up, down");

                const perp = { x: -dir.y, y: dir.x };

                const stepPx = opts.stepPx ?? 23;
                const maxPx = opts.maxPx ?? Math.hypot(canvas.width, canvas.height);
                const thicknessPx = opts.thicknessPx ?? 14;
                const stripeStepPx = opts.stripeStepPx ?? 4;
                const includeBgs = !!opts.includeBackgrounds;

                const startObj = this.getPlate(this.grid.Xwc(sx0), this.grid.Ywc(sy0));

                if (startObj && !isObjectVisible.call(this, startObj, canvas)) {
                    if (includeBgs || !startObj.isBackground) return startObj;
                }

                const offsets = [0];
                for (let o = stripeStepPx; o <= thicknessPx; o += stripeStepPx) {
                    offsets.push(+o, -o);
                }

                for (const o of offsets) {
                    let pastStart = !startObj || !isObjectVisible.call(this, startObj, canvas);

                    for (let t = stepPx; t <= maxPx; t += stepPx) {
                        const sx = sx0 + dir.x * t + perp.x * o;
                        const sy = sy0 + dir.y * t + perp.y * o;

                        if (sx < 0 || sy < 0 || sx > canvas.width || sy > canvas.height) break;

                        const wx = this.grid.Xwc(sx);
                        const wy = this.grid.Ywc(sy);
                        const obj = this.getPlate(wx, wy);

                        if (!pastStart) {
                            if (obj !== startObj) pastStart = true;
                            continue;
                        }

                        if (obj && obj !== startObj && (includeBgs || !obj.isBackground)) {
                            return obj;
                        }
                    }
                }
                return null;
            }

            removeItemsByTableName(tableName) {
                const keysToRemove = [];

                for (const key in this.formulas) {
                    if (this.formulas.hasOwnProperty(key)) {
                        const value = this.formulas[key];

                        if (key.includes(tableName) || String(value).includes(tableName)) {
                            keysToRemove.push(key);
                        }
                    }
                }

                keysToRemove.forEach(key => {
                    delete this.formulas[key];
                });
            }

            addFormula(wellselections, formula) {

                this.formulas[wellselections] = formula;
            }

            async capturePlateState() {

                let t = {
                    "plate_track": this
                }

                let gs = JSON.stringify(t, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }
                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                return gs;
            }

            capturestate() {
                let gs = JSON.stringify(this, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }

                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                let binaryData = compressString(gs)
                const chunkSize = 0x8000;
                let stringData = '';
                for (let i = 0; i < binaryData.length; i += chunkSize) {
                    const chunk = binaryData.subarray(i, i + chunkSize);
                    stringData += String.fromCharCode.apply(null, chunk);
                }
                return stringData;
            }

            copyPlates() {
                let loadPlates = (obj) => {
                    let ps = [];
                    for (let a of obj) {
                        let p = Object.assign(new Plate(), a);
                        if (p.plates && p.plates.length > 0) {
                            p.plates = loadPlates(p.plates);
                        }
                        p.grid = Object.assign(new MGrid(), p.grid);

                        let wellsArray = [];
                        if (a.wells) {
                            for (let row of a.wells) {
                                let newRow = row.map(well => Object.assign(new GenericWell(), well));
                                wellsArray.push(newRow);
                            }
                        }
                        p.wells = wellsArray;

                        ps.push(p);
                    }
                    return ps;
                };
                return loadPlates(this.root)
            }
            getPTrackLocationMap() {
                const out = {};

                const decodePTrack = (packed) => {
                    if (!packed || typeof packed !== "string") return null;

                    const splitAt = packed.indexOf(":");
                    if (splitAt < 0) return null;

                    const uid = packed.substring(0, splitAt);
                    const content = packed.substring(splitAt + 1);

                    function __decompress(compressedString) {
                        const chunkSize = 0x8000;
                        let binaryData = [];

                        for (let i = 0; i < compressedString.length; i += chunkSize) {
                            const chunk = compressedString.substring(i, i + chunkSize);
                            binaryData.push(...Array.from(chunk, ch => ch.charCodeAt(0)));
                        }

                        return decompressJson(Uint8Array.from(binaryData));
                    }

                    try {
                        const json = JSON.parse(__decompress(content));
                        const pt = json.plate_track || json;

                        return {
                            uid,
                            name: pt.name || "Untitled",
                            depth: null
                        };
                    } catch (e) {
                        return {
                            uid,
                            name: "Unknown",
                            depth: null,
                            error: e
                        };
                    }
                };

                // ptracks.length === 0 means top level / current track
                out[0] = {
                    depth: 0,
                    name: this.name || "Top Level",
                    isCurrent: this.ptracks.length === 0,
                    isTopLevel: true
                };

                for (let i = 0; i < this.ptracks.length; i++) {
                    const decoded = decodePTrack(this.ptracks[i]);
                    if (!decoded) continue;

                    const depth = i + 1;

                    out[depth] = {
                        ...decoded,
                        depth,
                        isCurrent: depth === this.ptracks.length,
                        isTopLevel: false
                    };
                }

                return out;
            }

            drawPTrackLocationMap(ctx) {
                const locMap = this.getPTrackLocationMap?.();
                if (!locMap) return;

                const depth = this.ptracks?.length || 0;
                const items = Object.values(locMap).sort((a, b) => a.depth - b.depth);

                if (!items.length) return;

                ctx.save();

                // Background-map placement
                const x = 24;
                const y = 24;
                const rowH = 24;
                const pad = 12;
                const boxW = 260;
                const boxH = pad * 2 + items.length * rowH;

                ctx.globalAlpha = 0.18;
                ctx.fillStyle = "white";
                ctx.fillRect(x, y, boxW, boxH);

                ctx.globalAlpha = 0.75;
                ctx.font = "13px system-ui, sans-serif";
                ctx.textBaseline = "middle";

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const yy = y + pad + i * rowH + rowH / 2;
                    const isCurrent = item.depth === depth;

                    // connector line
                    if (i > 0) {
                        ctx.strokeStyle = "rgb(111, 0, 255)";
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x + 18, yy - rowH);
                        ctx.lineTo(x + 18, yy);
                        ctx.stroke();
                    }

                    // dot
                    ctx.beginPath();
                    ctx.arc(x + 18, yy, isCurrent ? 6 : 4, 0, Math.PI * 2);
                    ctx.fillStyle = isCurrent
                        ? "rgba(0, 0, 0, 0.95)"
                        : "rgba(255,255,255,0.45)";
                    ctx.fill();

                    // name
                    ctx.fillStyle = isCurrent
                        ? "rgba(0, 17, 255, 0.95)"
                        : "rgba(255,255,255,0.55)";

                }

                ctx.restore();
            }
            getCurrentPTrackLocationName() {
                const map = this.getPTrackLocationMap();
                const currentDepth = this.ptracks?.length || 0;
                return map[currentDepth]?.name || this.name || "Top Level";
            }

            popFolder() {

                let content = this.ptracks.pop();
                const uid = content.substring(0, content.indexOf(':'))
                content = content.substring(content.indexOf(':') + 1)
                let gs = JSON.stringify(this, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }
                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                let binaryData = compressString(gs)
                const chunkSize = 0x8000;
                let stringData = '';
                for (let i = 0; i < binaryData.length; i += chunkSize) {
                    const chunk = binaryData.subarray(i, i + chunkSize);
                    stringData += String.fromCharCode.apply(null, chunk);
                }
                function __decompress(compressedString) {
                    const chunkSize = 0x8000;
                    let binaryData = [];
                    for (let i = 0; i < compressedString.length; i += chunkSize) {
                        const chunk = compressedString.substring(i, i + chunkSize);
                        const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
                        binaryData.push(...chunkArray);
                    }
                    let jsonString = decompressJson(Uint8Array.from(binaryData));
                    return jsonString;
                }

                const previousState = this.capturestate();
                const udata = __decompress(content)
                this.copyFromJSON(udata)
                let folder = this.getPlateWithUID(uid)
                folder.wells[0][0].properties['package'] = previousState;
                this.deselectAll();
                this.unModal();
                this.selectPlate(folder);

            }
            replaceObject(newObject) {
                for (let i = 0; i < this.root.length; i++) {
                    if (this.root[i].uid === newObject.uid) {
                        this.root[i] = newObject;
                        return true;
                    }
                }
                return false;
            }

            selectPlateByUID(uid) {
                let pl = this.getPlateWithUID(uid)
                if (!pl) {
                    for (let r of this.m_plots) {
                        if (r.uid.toLowerCase() === uid.toLowerCase()) {
                            this.selectPlate(r)
                        }
                    }
                } else
                    this.selectPlate(pl)
            }

            pushFolder(uid, previousState) {
                if (!previousState) {
                    this.ptracks.push(uid + ':' + this.capturestate())
                } else {
                    this.ptracks.push(uid + ':' + previousState);
                }
            }

            copyFromJSON(fs) {
                if (typeof fs !== "object" || fs === null) {
                    console.warn("Invalid JSON object provided");
                    return;
                }
                if (fs.uid) {
                    this.udi = fs.uid;
                }

                Object.assign(this, fs);
                let gggrid = Object.assign(new MGrid(), fs.grid);
                const xmax = gggrid.xmax;
                const xmin = gggrid.xmin;
                const ymax = gggrid.ymax;
                const ymin = gggrid.ymin;
                const xRange = xmax - xmin;
                const yRange = ymax - ymin;
                if (yRange === 0) return false;
                if (fs.fixedAspectRatio) {
                    this.fixedAspectRatio = fs.fixedAspectRatio;
                } else
                    this.fixedAspectRatio = xRange / yRange;
                this.grid = gggrid;
                this.transferFunctions = [];

                if (fs.transferFunctions && fs.transferFunctions.length > 0) {
                    for (let tr of fs.transferFunctions) {
                        let tf = Object.assign(new TransferFunction(), tr);
                        if (tf.fun && typeof tf.fun === "string" && tf.fun.startsWith('function')) {
                            tf.fun = eval(tf.fun);
                        }
                        this.transferFunctions.push(tf);
                    }
                }
                let loadPlates = (obj) => {
                    let ps = [];
                    for (let a of obj) {

                        let p = Plate.buildPlateFromJSON(a)
                        if (p.plates && p.plates.length > 0) {
                            p.plates = loadPlates(p.plates);
                        }
                        p.grid = Object.assign(new MGrid(), p.grid);
                        let wellsArray = [];
                        if (a.wells) {
                            for (let row of a.wells) {
                                let newRow = row.map(well => Object.assign(new GenericWell(), well));
                                wellsArray.push(newRow);
                            }
                        }
                        p.wells = wellsArray;
                        ps.push(p);
                    }
                    return ps;
                };

                this.root = loadPlates(fs.root || []);
                this.ifun = fs.ifun;

                for (let r of this.root) {
                    r.attr__displayMenuButtons = true;
                }

                for (let t of this.transferFunctions) {
                    for (let f of this.root) {
                        let pl = f.getPlateWithUID(t.to?.uid);
                        if (pl) t.to = pl;
                        let pl2 = f.getPlateWithUID(t.from?.uid);
                        if (pl2) t.from = pl2;
                    }
                }

                this.connections = [];
                if (fs.connections) {
                    for (let con of fs.connections) {
                        let fcon = Connection.buildConnectionFromJSON(con, this);
                        this.connections.push(fcon);
                    }
                }

                function reconstituteFunction(jsonStr) {
                    const parsed = JSON.parse(jsonStr);
                    if (!parsed.__function__) {
                        throw new Error('No function string found');
                    }

                    const fnStr = parsed.__function__;

                    const revivedFn = eval('(' + fnStr + ')');

                    if (typeof revivedFn !== 'function') {
                        throw new Error('Reconstructed object is not a function');
                    }

                    return revivedFn;
                }
                if (fs.background_function) {
                    this.background_function = reconstituteFunction(fs.background_function)
                }

                this.m_plots = [];
                if (fs.m_plots && fs.m_plots.length > 0) {
                    for (let p of fs.m_plots) {
                        this.m_plots.push(MPlot.fromJSON(p));
                    }
                }

                this.trackFunctions = [];
                if (fs.trackFunctions && fs.trackFunctions.length > 0) {
                    for (let t of fs.trackFunctions) {
                        let funcObj = Object.assign(new WorkbenchFunction(), t);
                        let paramObj = {};

                        if (t.param) {
                            for (let key of Object.keys(t.param)) {
                                let plateRef = this.getPlateWithUID(t.param[key]?.uid);
                                paramObj[key] = plateRef || t.param[key];
                            }
                        }
                        funcObj.param = paramObj;
                        this.trackFunctions.push(funcObj);
                    }
                }
                this.glyphs = [];
                if (fs.glyphs) {
                    for (let g of fs.glyphs) {
                        let gg = Glyph.buildFromJSON(g);
                        if (gg) this.glyphs.push(gg);
                    }
                }
                this.selected_well = null;
                this.setSelected(null);
                this.init();
            }
            setSelected(__selected) {

                if (isMobile()) {
                    return;
                }

                if (this.___suspend_select) {
                    return;
                }
                if (typeof __selected === 'string')
                    return;
                this.selectedPlate = __selected;
                if (selectedListener && this.selectedPlate) {
                    selectedListener(this.selectedPlate.uid)
                }
                for (let s of this.__selectionListeners) {
                    s(this.selectedPlate)
                }


                if (__selected && __selected.selectIt) {
                    __selected.selectIt();
                }
                if (__selected && __selected.clk_drag) {
                    __selected.clk_drag(this)
                }
                if (!isMobile())
                    this.setMessage(__selected?.name, 2);
            }

            async setPointSelected(__selected, scx, scy, menuItems) {
                if (this.__pointListeners) {
                    for (let s of this.__pointListeners) {
                        s(__selected)
                    }
                }
                if (!__selected.name || __selected.name.length === 0) {
                    __selected.name = '_'
                }
                let m = [
                    {
                        label: `${__selected.name}`,
                        click: async () => {
                            const point = __selected;
                            let screen_ptheight = this.grid.worldHeight(this.grid.height);
                            let screen_ptwidth = this.grid.worldWidth(this.grid.width);
                            let screen_x = this.grid.Xwc(this.selectedPlate.grid.X(point.x));
                            let screen_y = this.grid.Ywc(this.selectedPlate.grid.Y(0));
                            let small_width = screen_ptwidth;
                            let small_height = screen_ptheight;

                            if (point.startX) {
                                screen_x = this.grid.Xwc(this.selectedPlate.grid.X(point.startX));
                                let endX = this.grid.Xwc(this.selectedPlate.grid.X(point.x))
                                let rect_x = Math.abs(endX - screen_x)
                                let rect_y = screen_y - small_height / 2;
                                await this.zoomtoX(screen_x, rect_y, rect_x, small_height);

                            } else {
                                let rect_x = screen_x - small_width / 2;
                                let rect_y = screen_y - small_height / 2;
                                await this.zoomtoX(rect_x, rect_y, small_width, small_height);
                            }
                            this.clearMenu();
                        }
                    }

                ]
                if (__selected.videoURL) {
                    m.push({
                        label: 'View video',
                        click: () => {

                            if (isMobile()) {
                                this.clearMenu();
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', {
                                    wid: 'youtube',
                                    data: {
                                        url: `${__selected.videoURL}`
                                    }
                                });
                            } else {
                                let you = showModal({
                                    wid: 'youtube',
                                    data: {
                                        url: `${__selected.videoURL}`
                                    }
                                }, 700, 500)
                            }

                        }
                    })
                }
                if (__selected.type === 'document') {
                    m.push({
                        label: "View PDF",
                        click: async () => {
                            const point = __selected
                            let host_ = window['env']['apiUrl']
                            try {
                                let rs = await LOADPDF(host_ + '/load-pdf', point.path, getUser(), 'user');
                                const newWindow = window.open(rs, '_blank');
                                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                }
                            } catch (exception) {
                            }
                            point.highlight = false;
                            point.isSelected = false;
                        }
                    })
                }

                let pointTypeMenus = await exec('baja/plots/point-menus')

                let adm = pointTypeMenus[__selected.type]
                if (adm) {
                    m = m.concat(adm(this, this.selectedPlate, __selected, scx, scy))
                }

                if (isMobile()) {
                    return;
                }

                setTimeout(() => {
                    this.clearActionGlyphs();
                    this.addActionGlyph(this, '' + __selected.name + '', () => {
                        this.clearActionGlyphs();
                        setTimeout(() => {
                            this.menu = new Menu(m, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200),
                                this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), "navy", 'rgb(205, 255, 155)', 2)
                            this.menu_vis = true;
                            this.menu_width = 550
                            this.menu_vis = true;

                        }, 1000)

                    })

                }, 300)
            }
            addPlateWithConsistentWellSize(newPlate, opts = {}) {
                if (!newPlate || !newPlate.grid) return newPlate;

                this.root = this.root || [];

                const refMode = opts.ref ?? 'median';
                const spacing = opts.spacing ?? 24;
                const place = opts.place ?? 'right';
                const useDefaultsIfEmpty = opts.useDefaultsIfEmpty ?? true;

                const plates = (this.root || []).filter(p => p && p.grid);
                const hasRef = plates.length > 0;

                const perWell = (p) => {
                    const ww = (p.grid.width || 0) / Math.max(1, p.grid.xmax || 1);
                    const wh = (p.grid.height || 0) / Math.max(1, p.grid.ymax || 1);
                    return { ww, wh, p };
                };

                let refWw, refWh;

                if (hasRef) {

                    const samples = plates.map(perWell);

                    if (refMode === 'first') {
                        refWw = samples[0].ww;
                        refWh = samples[0].wh;
                    } else if (refMode === 'largest') {
                        const byArea = [...samples].sort((a, b) => (b.ww * b.wh) - (a.ww * a.wh));
                        refWw = byArea[0].ww;
                        refWh = byArea[0].wh;
                    } else {

                        const m = (arr) => {
                            const s = [...arr].sort((a, b) => a - b);
                            const i = Math.floor(s.length / 2);
                            return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
                        };
                        refWw = m(samples.map(s => s.ww));
                        refWh = m(samples.map(s => s.wh));
                    }
                } else if (useDefaultsIfEmpty) {

                    const cols = Math.max(1, newPlate.grid.xmax || newPlate.cols || 1);
                    const rows = Math.max(1, newPlate.grid.ymax || newPlate.rows || 1);

                    const defaultWellWidth =
                        typeof this.getDefaultWellWidthSC === 'function'
                            ? this.getDefaultWellWidthSC(cols)
                            : 20;

                    const defaultWellHeight =
                        typeof this.defaultWellHeightSc === 'number'
                            ? this.defaultWellHeightSc
                            : 20;

                    refWw = defaultWellWidth;
                    refWh = defaultWellHeight;
                } else {

                    this.root.push(newPlate);
                    this.generateTables?.();
                    return newPlate;
                }

                const nx = Math.max(1, newPlate.grid.xmax || newPlate.cols || 1);
                const ny = Math.max(1, newPlate.grid.ymax || newPlate.rows || 1);

                if (typeof newPlate.setWidth === 'function') newPlate.setWidth(refWw * nx);
                else newPlate.grid.width = refWw * nx;

                if (typeof newPlate.setHeight === 'function') newPlate.setHeight(refWh * ny);
                else newPlate.grid.height = refWh * ny;

                if (typeof newPlate.grid.rescale === 'function') newPlate.grid.rescale();

                const groupBounds = () => {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                    for (const p of plates) {

                        minX = Math.min(minX, p.grid.xi);
                        maxX = Math.max(maxX, p.grid.xi + p.grid.width);

                        minY = Math.min(minY, p.grid.yi);
                        maxY = Math.max(maxY, p.grid.yi + p.grid.height);
                    }

                    return {
                        minX,
                        minY,
                        maxX,
                        maxY,
                        cx: (minX + maxX) * 0.5,
                        cy: (minY + maxY) * 0.5,
                    };
                };

                const placeNewPlate = () => {
                    if (!hasRef) {

                        newPlate.grid.xi = this.grid?.xi ?? 0;
                        newPlate.grid.yi = this.grid?.yi ?? 0;
                        return;
                    }

                    const gb = groupBounds();

                    if (place === 'below') {

                        const cx = gb.cx;
                        newPlate.grid.xi = cx - newPlate.grid.width * 0.5;

                        newPlate.grid.yi = gb.minY - spacing - 0;
                    } else {

                        const groupTop = gb.maxY;

                        newPlate.grid.xi = gb.maxX + spacing;

                        newPlate.grid.yi = groupTop - newPlate.grid.height;
                    }
                };

                placeNewPlate();

                const idx = this.root.findIndex(p => p && (p.name === newPlate.name));
                if (idx >= 0 && typeof this.replacePlate === 'function') {
                    this.replacePlate(this.root[idx], newPlate);
                } else if (idx >= 0) {
                    this.root[idx] = newPlate;
                } else {
                    this.root.push(newPlate);
                }

                this.generateTables?.();
                return newPlate;
            }

            getGridBounds() {
                items = this.root;
                if (!items || items.length === 0) {
                    return null;
                }
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;

                items.forEach(item => {
                    const { x, y, width, height } = item.grid;

                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x + width);
                    maxY = Math.max(maxY, y + height);
                });

                return {
                    minX,
                    minY,
                    maxX,
                    maxY,
                    width: maxX - minX,
                    height: maxY - minY
                };
            }

            async showMacroSteps(functions) {
                let interpreter = await exec('baja/engine/interpreter.js', this)
                let m = []
                let index = 0;
                for (let fun of functions) {
                    const i = index;
                    const t = {
                        label: fun.name,
                        click: async (xwc, ywc) => {
                            if (i > 0) {
                                for (let ii = 0; ii <= i; ii++) {
                                    interpreter.ref = this.interpreter_scope;
                                    await interpreter.run(functions[ii].function);
                                    await new Promise(resolve => setTimeout(resolve, 400));
                                    this.interpreter_scope = interpreter.ref;
                                }
                                functions.splice(0, i)
                                this.menu_vis = false;
                                this.menu = null;
                                if (m.length <= 0) {
                                    return;
                                }

                            } else {
                                interpreter.ref = this.interpreter_scope;
                                await interpreter.run(functions[0].function);
                                this.interpreter_scope = interpreter.ref
                            }

                            this.menu_vis = false;
                            this.menu = null;
                            if (functions.length <= 1) {
                                this.menu = null;
                                this.menu_vis = false;
                                m = [];
                                return;
                            } else {
                                setTimeout(() => {
                                    if (!m || m.length === 0) {
                                        this.menu = null;
                                        this.menu_vis = false;
                                        return;
                                    } else {
                                        functions.splice(0, 1)
                                        this.showMacroSteps(functions)
                                    }
                                }, 1000)
                            }

                        }
                    }
                    m.push(t);
                    index++;
                }
                const cols = 1;
                this.menu = new Menu(m, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                this.menu_vis = true;

            }

            hideDetailPopUp() {
                for (let r of this.root) {
                    r.setHideDetailsPopUp(this.attr__hideWellDetailPopup)
                }
            }
            updatePlotLineEquations() {
                for (let p of this.m_plots) {
                    for (let lineEquation of p.lineEquations) {
                        if (lineEquation.recalc) {
                            lineEquation.recalc(p.scatterData)
                        } else if (lineEquation?.type === 'regression') {

                        }
                    }
                }
            }
            updatePlots() {
                function formatNumber(num) {
                    if (num === null || num === undefined || isNaN(num)) return '';
                    const absNum = Math.abs(num);

                    if (absNum >= 1_000_000_000) {
                        return (num / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + 'B';
                    } else if (absNum >= 1_000_000) {
                        return (num / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
                    } else if (absNum >= 1_000) {

                        return num.toLocaleString('en-US').replace(/,/g, ' ');
                    } else {
                        return num.toString();
                    }
                }

                for (let p of this.m_plots) {
                    if (p.scatterData) {
                        for (let point of p.scatterData.points) {
                            if (point.xuid) {
                                let w = this.getWellByUID(point.xuid)
                                if (w) {
                                    point.x = w.value
                                }
                            }
                            if (point.yuid) {
                                let w = this.getWellByUID(point.yuid)
                                if (w) {
                                    point.y = w.value
                                }
                            }
                            if (point.formula) {
                                let years = point.x / (24 * 365);
                                let f = point.formula.replace(/eval\s*\[\s*t_years\s*\]/gi, `(${years})`);
                                exec('baja/plate/ops/frun-object.js', f, this).then(v => {
                                    point.y = v.results[0].value
                                    if (point.y < 0) {
                                        point.y = 0.00
                                    }
                                    point.name = formatNumber(point.y)
                                })
                            }
                        }
                    }
                }
                for (let p of this.m_plots) {
                    if (p.scatterData && p.type === 'timeline') {
                        for (let point of p.scatterData.points) {
                            if (point.xuid) {
                                let w = this.getWellByUID(point.xuid)
                                if (w) {
                                    point.x = w.value
                                }
                            }
                            if (point.yuid) {
                                let w = this.getWellByUID(point.yuid)
                                if (w) {
                                    point.name = w.value
                                }
                            }
                        }
                    }

                }
                this.updatePlotLineEquations();
            }

            copyFormulaFromAbove(address) {
                const match = address.match(/^(\w+)\[(.+):(.+)\]\[(.+):(.+)\]$/);
                if (!match) {
                    throw new Error(`Invalid address format: ${address}`);
                }

                const [, table, colStart, colEnd, rowStart, rowEnd] = match;

                function isNumeric(value) {
                    return !isNaN(value) && !isNaN(parseFloat(value));
                }

                if (!isNumeric(rowStart) || !isNumeric(rowEnd)) {
                    console.log(`Cannot handle non-numeric row values: ${rowStart}:${rowEnd}`);
                    return;
                }

                const rowStartNum = parseInt(rowStart, 10);
                const rowEndNum = parseInt(rowEnd, 10);
                const aboveRowStart = rowStartNum - 1;
                const aboveRowEnd = rowEndNum - 1;

                if (aboveRowStart < 0) {
                    console.log(`No rows above ${address} to copy from.`);
                    return;
                }

                const aboveAddress = `${table}[${colStart}:${colEnd}][${aboveRowStart}:${aboveRowEnd}]`;

                if (this.formulas.hasOwnProperty(aboveAddress)) {
                    console.log('debubg');
                    this.formulas[address] = this.formulas[aboveAddress];
                    console.log(`Copied formula from ${aboveAddress} to ${address}`);
                } else {
                    console.log(`No formula found at ${aboveAddress}`);
                }
            }

            highlightWell(address) {
                const match = address.match(/^(\w+)\[(.+):(.+)\]\[(.+):(.+)\]$/);
                if (!match) {
                    throw new Error(`Invalid address format: ${address}`);
                }

                const [, table, colStart, colEnd, rowStart, rowEnd] = match;

                function isNumeric(value) {
                    return !isNaN(value) && !isNaN(parseFloat(value));
                }

                if (!isNumeric(rowStart) || !isNumeric(rowEnd)) {
                    console.log(`Cannot handle non-numeric row values: ${rowStart}:${rowEnd}`);
                    return;
                }

                const rowStartNum = parseInt(rowStart, 10);
                const rowEndNum = parseInt(rowEnd, 10);
                const aboveRowStart = rowStartNum;
                const aboveRowEnd = rowEndNum;
                const aboveAddress = `[${colStart}:${colEnd}][${aboveRowStart}:${aboveRowEnd}]`;
                let p = this.getTableByName(table)
                if (p) {
                    p.selectWellsByString(aboveAddress, (w) => {
                        if (w.errorSelect) {
                            w.errorSelect();
                        }
                    })
                }
            }

            setGroup(address, key) {

                const match = address.match(/^(\w+)\[(.+):(.+)\]\[(.+):(.+)\]$/);

                if (!match) {
                    throw new Error(`Invalid address format: ${address}`);
                }

                const [, table, colStart, colEnd, rowStart, rowEnd] = match;

                function isNumeric(value) {
                    return !isNaN(value) && !isNaN(parseFloat(value));
                }

                if (!isNumeric(rowStart) || !isNumeric(rowEnd)) {
                    console.log(`Cannot handle non-numeric row values: ${rowStart}:${rowEnd}`);
                    return;
                }

                const rowStartNum = parseInt(rowStart, 10);
                const rowEndNum = parseInt(rowEnd, 10);
                const aboveRowStart = rowStartNum;
                const aboveRowEnd = rowEndNum;
                const aboveAddress = `[${colStart}:${colEnd}][${aboveRowStart}:${aboveRowEnd}]`;
                let p = this.getTableByName(table)
                if (p) {
                    let wells = p.getWellsByString(aboveAddress);
                    console.log(wells.length + " address " + aboveAddress + "\n\n")
                    for (let ww of wells) {
                        console.log(" key " + key)
                        ww.setGroup(key)
                    }

                }
            }

            async exportDataModel() {

                for (let r of this.root) {
                    r.__dirty = false;
                    if (r.getFormula) {
                        let f = r.getFormula();
                        if (f) {
                            let currentKeys = Object.keys(this.formulas);
                            for (let fk of Object.keys(f)) {
                                if (!currentKeys.includes(fk)) {
                                    if (f[fk] && f[fk].length > 0)
                                        this.formulas[r.name + fk] = f[fk];
                                }
                            }
                        }
                    }
                }

                let ref = null;
                let t =
                {
                    height: '200px',
                    editorOptions: {
                        language: 'bajabio',
                        value: "Enter LJ-script here",
                        theme: 'no-border-theme',
                        minimap: { enabled: false },
                        scrollbar: {
                            vertical: 'hidden',
                            horizontal: 'hidden',
                        },
                        lineNumbers: 'off',
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        folding: false,
                        highlightActiveIndentGuide: false,
                        renderLineHighlight: 'none',
                        renderLineHighlightOnlyWhenFocus: false,
                        renderWhitespace: 'none',
                        fontSize: 15,
                        automaticLayout: true,
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 30,
                            right: 30
                        }
                    },
                    objects: this.root,
                    keybinding: {
                        'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                        })
                    },
                    code: JSON.stringify(this.formulas),
                    buttons: [{
                        'label': 'Save', "color": 'blue', action: async () => {

                            function parseTableSyntax(input) {
                                const rangeRegex = /^([a-zA-Z_]\w*)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;
                                const fieldRegex = /^([a-zA-Z_]\w*)\[(\w+)\]$/;
                                let match = input.match(rangeRegex);
                                if (match) {
                                    return {
                                        type: "range",
                                        table: match[1],
                                        xi: parseInt(match[2], 10),
                                        xf: parseInt(match[3], 10),
                                        yi: parseInt(match[4], 10),
                                        yf: parseInt(match[5], 10),
                                    };
                                }
                                match = input.match(fieldRegex);
                                if (match) {
                                    return {
                                        type: "field",
                                        table: match[1],
                                        field: match[2],
                                    };
                                }

                                return null;
                            }
                            let code = ref.getEditorText();
                            const arr = code.split("\n");
                            for (let i of arr) {
                                const sp = i.split('=')
                                let key = sp[0]
                                let value = sp[1]
                                let f = parseTableSyntax(key)
                                if (f && f.table) {
                                    let tab = this.getTableByName(f.table)
                                    tab.formula[`[${f.xi}:${f.xf}][${f.yi}:${f.yf}]`] = value;
                                }

                            }
                        }
                    }, {

                        'label': 'Close', 'color': 'black', "action": () => {
                            ref.hideEditor();
                        }
                    }
                    ]
                }
                ref = await this.showTextEditor(t);

            }
            async addFormulaUI() {
                let ts = ''
                for (let r of this.root) {
                    r.__dirty = false;
                    if (r.getFormula) {
                        let f = r.getFormula();
                        if (f) {
                            let currentKeys = Object.keys(this.formulas);
                            for (let fk of Object.keys(f)) {
                                if (!currentKeys.includes(fk)) {
                                    if (f[fk] && f[fk].length > 0)
                                        ts += r.name + fk + '=' + f[fk] + '\n';
                                }
                            }
                        }
                    }
                }

                let ref = null;
                let t =
                {
                    height: '200px',
                    editorOptions: {
                        language: 'bajabio',
                        value: "Enter LJ-script here",
                        theme: 'no-border-theme',
                        minimap: { enabled: false },
                        scrollbar: {
                            vertical: 'hidden',
                            horizontal: 'hidden',
                        },
                        lineNumbers: 'off',
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        folding: false,
                        highlightActiveIndentGuide: false,
                        renderLineHighlight: 'none',
                        renderLineHighlightOnlyWhenFocus: false,
                        renderWhitespace: 'none',
                        fontSize: 15,
                        automaticLayout: true,
                        padding: {
                            top: 20,
                            bottom: 20,
                            left: 30,
                            right: 30
                        }
                    },
                    objects: this.root,
                    keybinding: {
                        'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                        })
                    },
                    code: ts,
                    buttons: [{
                        'label': 'Save', "color": 'blue', action: async () => {

                            function parseTableSyntax(input) {
                                const rangeRegex = /^([a-zA-Z_]\w*)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;
                                const fieldRegex = /^([a-zA-Z_]\w*)\[(\w+)\]$/;
                                let match = input.match(rangeRegex);
                                if (match) {
                                    return {
                                        type: "range",
                                        table: match[1],
                                        xi: parseInt(match[2], 10),
                                        xf: parseInt(match[3], 10),
                                        yi: parseInt(match[4], 10),
                                        yf: parseInt(match[5], 10),
                                    };
                                }
                                match = input.match(fieldRegex);
                                if (match) {
                                    return {
                                        type: "field",
                                        table: match[1],
                                        field: match[2],
                                    };
                                }

                                return null;
                            }
                            let code = ref.getEditorText();
                            const arr = code.split("\n");
                            for (let i of arr) {
                                const sp = i.split('=')
                                let key = sp[0]
                                let value = sp[1]
                                let f = parseTableSyntax(key)
                                if (f && f.table) {
                                    let tab = this.getTableByName(f.table)
                                    tab.formula[`[${f.xi}:${f.xf}][${f.yi}:${f.yf}]`] = value;
                                }

                            }
                        }
                    }, {

                        'label': 'Close', 'color': 'black', "action": () => {
                            ref.hideEditor();
                        }
                    }
                    ]
                }
                ref = await this.showTextEditor(t);

            }

            async updateCalculations() {




                this.__formulaEdges = []
                this.__edgeSeen = new Set();
                this.root = this.root.filter((obj, index, self) =>
                    index === self.findIndex(o => o.name === obj.name));

                const plate_jsons = []
                for (let p of this.root) {
                    p.reapplyHeaderWells();
                    plate_jsons.push(p.toValueFormulaJSON())
                    // if (p.findMissingFormulaReferences) {
                    //     let missing_fields = p.findMissingFormulaReferences(this)
                    //     if (missing_fields && missing_fields.length > 0) {
                    //     }
                    // }
                }
                if (this.root && this.root.length < 2) {
                    for (let plate of this.root) {
                        plate.clearErrors();
                        if (plate.name === 'Assumptions') {
                            this.addActionGlyph(this, "Click here to calculate PnL", async () => {
                                let t = this.getTableByName('Assumptions')
                                this.setMessage('PnL', 5)
                                let ts = (t.toValueFormulaJSON())
                                let pnl = await exec('py/openai/pnl.py', "Create profit and loss from assumptions table.", ts)
                                let r = await exec('baja/draw/data-model-to-tables-gpt', this, pnl)
                                await exec('baja/draw/data-model-to-tables-gpt', this, r)
                                this.movePlateVacant(this.root[this.root.length - 1])
                                this.updateCalculations();
                                this.killSprite();
                            })
                        }
                    }

                }
                else
                    if (this.root && this.root.length >= 2) {
                        let foundPnL = false;
                        for (let plate of this.root) {
                            if (plate.name && plate.name.toLowerCase() === 'pnl') {
                                foundPnL = true;
                            }
                        }
                        for (let plate of this.root) {
                            plate.clearErrors();
                            function extractNames(arr) {
                                return arr
                                    .filter(item => item && typeof item.name === 'string')
                                    .map(item => item.name);
                            }

                            if (this.root.length === 2 && plate.name === 'PnL' && foundPnL) {
                                this.addActionGlyph(this, "Click for 10 time table", async () => {
                                    this.setMessage("Timeline...", 5)
                                    let ls = [
                                    ]
                                    for (let p of this.root) {
                                        ls.push(p.toValueFormulaJSON())
                                    }
                                    let g = CurrentLayout.getStashed('graph')
                                    if (g)
                                        g.touchMe();
                                    let model3 = await exec('py/openai/time-money.py', ls)
                                    let rrr = await exec('baja/draw/data-model-to-tables-gpt', this, model3);
                                    this.movePlateVacant(this.root[this.root.length - 1])
                                    this.killSprite();
                                    this.zoomouttoFit();
                                    return this.updateCalculations();
                                })
                                this.addActionGlyph(this, "Click for cash-in-hand timeline", async () => {
                                    const pnl_timeline = () => {
                                        const pt = this;
                                        pt.setMessage("Generating Timeline...", 5)
                                        setTimeout(async () => {
                                            ls = [
                                            ]
                                            for (let p of this.root) {
                                                ls.push(p.toValueUID())
                                            }
                                            let model5 = await exec('py/openai/cash-in-hand-vs-time-for-timeline.py', ls)
                                            let v = await exec('baja/draw/data-model-to-tables-gpt', pt, model5, 'hidden')

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

                                            let wells = getWellsFromJSON(this.root, model5)
                                            for (let w of wells) {
                                                w.selectIt();
                                            }
                                            this.zoomouttoFit();
                                            pt.setMessage("Crunching more friggin numbers", 5)

                                            setTimeout(() => {
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
                                                plot.setWidth((1000))
                                                plot.setHeight((200))
                                                plot.name = generateNautName();
                                                plot.x_axis_label = "Time (quarters from start)";
                                                plot.y_axis_label = "Cashflow";
                                                plot.fitScaleToData = false;
                                                plot.grid.rescale();
                                                pt.updateCalculations();
                                                pt.layoutCompactTetris();
                                                pt.killSprite();
                                                setTimeout(() => {
                                                    this.setPlotCenter(plot)
                                                }, 3000)
                                                this.setMessage("Green arrows are input controls. NOTE: Not all are used...", 1);
                                            })
                                        }, 2000)
                                    }
                                    pnl_timeline()
                                    let ls = [
                                    ]
                                    for (let p of this.root) {
                                        ls.push(p.toValueFormulaJSON())
                                    }
                                    let g = CurrentLayout.getStashed('graph')
                                    if (g)
                                        g.touchMe();
                                    let model3 = await exec('py/openai/time-money.py', ls)
                                    let rrr = await exec('baja/draw/data-model-to-tables-gpt', this, model3);
                                    this.movePlateVacant(this.root[this.root.length - 1])
                                    this.killSprite();
                                    this.zoomouttoFit();
                                    return this.updateCalculations();
                                })
                            }

                        }
                    }

                function parseKey(key) {
                    const match = key.match(/^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/);
                    if (!match) return null;
                    const [, table, rowStart, rowEnd, colStart, colEnd] = match;
                    return {
                        table,
                        rowStart: parseInt(rowStart),
                        rowEnd: parseInt(rowEnd),
                        colStart: parseInt(colStart),
                        colEnd: parseInt(colEnd),
                        key
                    };
                }

                function isOverlap(a, b) {
                    return (
                        a.table === b.table &&
                        a.rowStart === b.rowStart &&
                        a.rowEnd === b.rowEnd &&
                        a.colStart <= b.colEnd &&
                        a.colEnd >= b.colStart
                    );
                }
                await this._updateAllCalculations__();
                await this._updateAllCalculations__();
            }
            async updateAllCalculations() {
                this.root = this.root.filter((obj, index, self) =>
                    index === self.findIndex(o => o.name === obj.name));

                function parseKey(key) {
                    const match = key.match(/^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/);
                    if (!match) return null;
                    const [, table, rowStart, rowEnd, colStart, colEnd] = match;
                    return {
                        table,
                        rowStart: parseInt(rowStart),
                        rowEnd: parseInt(rowEnd),
                        colStart: parseInt(colStart),
                        colEnd: parseInt(colEnd),
                        key
                    };
                }

                function isOverlap(a, b) {
                    return (
                        a.table === b.table &&
                        a.rowStart === b.rowStart &&
                        a.rowEnd === b.rowEnd &&
                        a.colStart <= b.colEnd &&
                        a.colEnd >= b.colStart
                    );
                }

                function removeOverlappingKeys(data) {
                    const parsed = Object.keys(data)
                        .map(parseKey)
                        .filter(Boolean);

                    const toRemove = new Set();

                    for (let i = 0; i < parsed.length; i++) {
                        for (let j = 0; j < parsed.length; j++) {
                            if (i === j) continue;
                            const a = parsed[i];
                            const b = parsed[j];

                            if (isOverlap(a, b)) {
                                const rangeA = a.colEnd - a.colStart;
                                const rangeB = b.colEnd - b.colStart;

                                if (rangeA > rangeB) {
                                    toRemove.add(a.key);
                                } else if (rangeB > rangeA) {
                                    toRemove.add(b.key);
                                } else if (a.key < b.key) {
                                    toRemove.add(a.key);
                                } else {
                                    toRemove.add(b.key);
                                }
                            }
                        }
                    }

                    const cleaned = {};
                    for (const key in data) {
                        if (!toRemove.has(key)) {
                            cleaned[key] = data[key];
                        }
                    }

                    return cleaned;
                }
                await this._updateSelectedCalculations__();
            }

            tagError(tableName, startX, stopX, startY, stopY, calculation) {
                let tt = this.getTableByName(tableName)
                const colSel = `${startX}:${stopX}`
                const rowSel = `${startY}:${stopY}`
                const wells = tt.getWellsByString(`[${colSel}][${rowSel}]`) || [];

                this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                for (let w of wells) {

                    w.setError('Failed to calculate');
                }
            }

            updateInputWells(formulas) {
                for (let key of Object.keys(formulas)) {

                }
            }

            async _updateSelectedCalculations__() {
                this.formulas = {}
                for (let r of this.root) {
                    r.__dirty = false;
                    if (r.getFormula) {
                        let f = r.getFormula();
                        if (f) {
                            let currentKeys = Object.keys(this.formulas);
                            for (let fk of Object.keys(f)) {
                                if (!currentKeys.includes(fk)) {
                                    if (f[fk] && f[fk].length > 0) {
                                        if (typeof f[fk] === "string" && f[fk].startsWith("=")) {
                                            f[fk] = f[fk].slice(1);
                                        }
                                        this.formulas[r.name + fk] = f[fk];

                                    }
                                }
                            }
                        }
                    }
                }
                this.formulas = cleanDictionary(this.formulas)
                this.updateInputWells(this.formulas)

                for (let plate of this.root) {
                    let st = plate.getSelectedWellsInOrder();

                    plate.clearErrors();
                    if (st && st.length > 0) {
                        let well_range = plate.getWellRange(st)
                        if (well_range) {
                            let fkey = plate.name + well_range;
                            let calculation = this.formulas[fkey];

                            if (calculation) {
                                calculation = calculation.trim();
                                this.setMessage(' ' + calculation, 2)
                                try {
                                    let well_ranges = fkey;
                                    let calculation_key = well_ranges;
                                    if (!calculation.startsWith('function'))
                                        calculation = calculation.replace(/\s+/g, '');

                                    if (calculation.startsWith('function')) {
                                        let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges);
                                        let table = this.getTableByName(tableName);

                                        if (startX === -Infinity) {
                                            startX = table.grid.xmin;
                                        }
                                        if (startY === -Infinity) {
                                            startY = table.grid.ymin;
                                        }
                                        if (stopX === Infinity) {
                                            stopX = table.grid.xmax - 1;
                                        }
                                        if (stopY === Infinity) {
                                            stopY = table.grid.ymax - 1;
                                        }
                                        for (let i = startY; i <= stopY; i++) {
                                            let function_string = calculation.trim();
                                            const tokenPattern = /\b\w+(?:\[[^\]]+\])+/g;
                                            let matchedTokens = function_string.match(tokenPattern);
                                            if (matchedTokens) {
                                                for (const rawToken of matchedTokens) {
                                                    try {
                                                        let token = rawToken.trim();
                                                        let callist = generateExpressionsInRange(token, i, i)
                                                        if (callist && callist.length >= 1) {
                                                            for (let icl of callist) {
                                                                let v = parseSingleVariable(icl, this.getTablesByName());
                                                                let value = expand_(v)
                                                                function_string = function_string.replace(token, value);
                                                            }
                                                        }
                                                    } catch (e) {
                                                        console.error(`Error parsing token ${token}:`, e);
                                                    }
                                                }
                                            }
                                            if (/^function\s*\(/.test(function_string)) {
                                                let randomName = 'fn_' + Math.floor(Math.random() * 1e6);
                                                function_string = function_string.replace(/^function\s*\(/, `function ${randomName}(`);
                                            }
                                            let func = new Function('x', `return (${function_string})(x);`);
                                            let fv = func(this);
                                            let v = {
                                                results: [fv]
                                            }
                                            plate.__hasFormulaError = false;

                                            this.updateWells(v, tableName, startX, stopX, i, i);
                                            this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                                        }
                                    } else {
                                        let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges)
                                        let callist = generateExpressionsInRange(calculation, startY, stopY)
                                        if (callist && callist.length >= 1) {
                                            let index = startY;

                                            for (let icl of callist) {
                                                try {
                                                    let v = await exec('baja/plate/ops/frun-object.js', icl, this);


                                                    if (typeof f === 'string') {
                                                        console.log('type should NOT be a string failed ' + exception)

                                                    } else {
                                                        if (!v['results']) {
                                                            this.highlightWell(calculation_key)
                                                            this.setMessage('Unable to calculate: ' + calculation_key + ' = ' + calculation, 2)
                                                            plate.__hasFormulaError = true;
                                                            this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                                        } else {
                                                            plate.__hasFormulaError = false;
                                                            this.updateWells(v, tableName, startX, stopX, index, index);
                                                            this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                                                            index++;
                                                        }
                                                    }
                                                } catch (exception) {
                                                    plate.__hasFormulaError = true;
                                                    this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                                }
                                            }
                                        } else {
                                            try {


                                                let v = await exec('baja/plate/ops/frun-object.js', calculation, this);
                                                if (!v['results']) {
                                                    plate.__hasFormulaError = true;
                                                    this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                                    this.setMessage('Failed to calculate: ' + calculation_key + ' = ' + calculation + '', 2)
                                                    if (v.message)
                                                        this.setMessage(v.message, -1)
                                                } else {

                                                    this.updateWells(v, tableName, startX, stopX, startY, stopY);
                                                    this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                                                }
                                            } catch (exception) {
                                                plate.__hasFormulaError = true;
                                                this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                            }
                                        }
                                    }

                                    plate.__hasFormulaError = false;

                                    this.attr__displayComputationEvents = null;

                                } catch (exception) {
                                    console.error(`Message: ${exception.message}`);
                                    console.error("Stack trace:");
                                    console.error(exception.stack);
                                    if (displayedOnce) {
                                        this.setMessage('Failed @ ' + calculation_key, 2)
                                        displayedOnce = true;
                                    }

                                    plate.__hasFormulaError = true;
                                    this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                    this.attr__displayComputationEvents = null;

                                }

                            }
                        }
                    }

                }
            }

            async _updatePlateCalculations__(plateobj) {
                if (!plateobj) return;
                this.formulas = {};
                plateobj.__dirty = false;

                if (typeof plateobj.getFormula === 'function') {
                    const f = plateobj.getFormula();
                    if (f) {
                        for (const fk of Object.keys(f)) {
                            if (f[fk] && f[fk].length > 0) {

                                this.formulas[plateobj.name + fk] = f[fk];
                            }
                        }
                    }
                }

                this.formulas = cleanDictionary(this.formulas);

                let displayedOnce = false;

                for (const calculation_key of Object.keys(this.formulas)) {
                    try {
                        let well_ranges = calculation_key;
                        let calculation = this.formulas[calculation_key];

                        if (calculation) calculation = calculation.trim();
                        if (!calculation.startsWith('function')) calculation = calculation.replace(/\s+/g, '');

                        if (calculation.startsWith('function')) {
                            let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges);
                            let table = this.getTableByName(tableName);
                            if (!table) continue;
                            if (table.resetHeaderWells) {
                                table.resetHeaderWells();
                            }

                            if (startX === -Infinity) startX = table.grid.xmin;
                            if (startY === -Infinity) startY = table.grid.ymin;
                            if (stopX === Infinity) stopX = table.grid.xmax - 1;
                            if (stopY === Infinity) stopY = table.grid.ymax - 1;

                            for (let i = startY; i <= stopY; i++) {
                                let function_string = calculation.trim();

                                const tokenPattern = /\b\w+(?:\[[^\]]+\])+/g;
                                const matchedTokens = function_string.match(tokenPattern);
                                if (matchedTokens) {
                                    for (const rawToken of matchedTokens) {
                                        try {
                                            const token = rawToken.trim();
                                            const callist = generateExpressionsInRange(token, i, i);
                                            if (callist && callist.length >= 1) {
                                                for (const icl of callist) {
                                                    const v = parseSingleVariable(icl, this.getTablesByName());
                                                    const value = expand_(v);
                                                    function_string = function_string.replace(token, value);
                                                }
                                            }
                                        } catch (e) {
                                            console.error(`Error parsing token ${rawToken}:`, e);
                                        }
                                    }
                                }

                                if (/^function\s*\(/.test(function_string)) {
                                    const randomName = 'fn_' + Math.floor(Math.random() * 1e6);
                                    function_string = function_string.replace(/^function\s*\(/, `function ${randomName}(`);
                                }

                                const func = new Function('x', `return (${function_string})(x);`);
                                const fv = func(this);
                                const v = { results: [fv] };

                                this.updateWells(v, tableName, startX, stopX, i, i);
                                this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                            }
                        } else {
                            let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges);
                            let callist = generateExpressionsInRange(calculation, startY, stopY);

                            if (callist && callist.length >= 1) {
                                let index = startY;
                                for (const icl of callist) {
                                    const v = await exec('baja/plate/ops/frun-object.js', icl, this);
                                    if (!v['results']) {
                                        this.highlightWell(calculation_key);
                                        this.setMessage('Unable to calculate: ' + calculation_key + ' = ' + calculation, 2);
                                        plateobj.__hasFormulaError = true;
                                        this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                    } else {
                                        this.updateWells(v, tableName, startX, stopX, index, index);
                                        this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                                        plateobj.__hasFormulaError = false;

                                        index++;
                                    }
                                }
                            } else {

                                debugger;


                                const v = await exec('baja/plate/ops/frun-object.js', calculation, this);
                                if (!v['results']) {
                                    this.setMessage('Unable to calculate: ' + calculation_key + ' = ' + calculation, 2);
                                    plateobj.__hasFormulaError = true;
                                    this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                    if (v.message) this.setMessage(v.message, -1);
                                } else {
                                    plateobj.__hasFormulaError = false;

                                    this.updateWells(v, tableName, startX, stopX, startY, stopY);
                                    this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                                }
                            }
                        }

                        this.attr__displayComputationEvents = null;
                    } catch (exception) {
                        console.error(`Message: ${exception.message}`);
                        console.error("Stack trace:");
                        console.error(exception.stack);
                        if (!displayedOnce) {
                            this.setMessage('Failed @ ' + calculation_key, 2);
                            displayedOnce = true;
                        }
                        this.attr__displayComputationEvents = null;
                    }
                }

                try {
                    const pl = plateobj;
                    if (pl &&
                        pl.wells && pl.wells[0] && pl.wells[0][0] &&
                        pl.wells[0][0].properties && pl.wells[0][0].properties['package']) {

                        const udata = __decompress(pl.wells[0][0].properties['package']);
                        if (udata) {
                            let ffs = Object.assign(new PlateTrack(), udata);
                            ffs.copyFromJSON(udata);
                            ffs.copyTables(this);
                            await ffs.updateCalculations();
                            this.copyTables(ffs);
                            pl.wells[0][0].properties['package'] = PlateTrack.compressToString(ffs);
                        }
                    }
                } catch (exception) {
                    console.error(`Message: ${exception.message}`);
                    console.error("Stack trace:");
                    console.error(exception.stack);
                    LJScript.add('_', `Calculation failed  ${exception.message}`);
                }

                try {
                    if (Array.isArray(this.ptracks)) {
                        let index = 0;
                        for (const raw of this.ptracks) {
                            const udata_uid = __decompress_with_uid(raw);
                            const ffs = udata_uid.content;
                            if (ffs) {
                                for (const rr of ffs.root) {
                                    if (plateobj && plateobj.uid === rr.uid) {
                                        rr.wells = plateobj.wells;
                                    }
                                }
                                this.ptracks[index] = udata_uid.uid + ':' + PlateTrack.compressToString(ffs);
                            }
                            index++;
                        }
                    }
                } catch (exception) {
                    console.error(`Message: ${exception.message}`);
                    console.error("Stack trace:");
                    console.error(exception.stack);
                    LJScript.add('_', `Calculation failed  ${exception.message}`);
                }
            }

            reapplyHeaderWells() {
                for (let r of this.root) {
                    if (r.reapplyHeaderWells) {
                        r.reapplyHeaderWells()
                    }
                }
            }

            async _updateAllCalculations__() {
                const pendingFormula = await this.findEnterFormulaAnnotation();
                if (pendingFormula) {
                    const { plate, range } = pendingFormula;
                    if (plate && range) {
                        this.deselectAll?.();
                        this.setSelected?.(plate);
                        const wells = plate.getWellsByString?.(range) || [];
                        for (const w of wells) w.select = true;
                        await this.zoomToSelectedWells?.(plate);
                        this.setMessage?.(`Enter formula in ${plate.name}${range}`, 2);
                        this.attr__displayComputationEvents = null;
                        return false;
                    }
                }
                this.formulas = {}
                for (let r of this.root) {

                    if (r.applyrowheaders) {
                        r.applyrowheaders();
                    }
                    if (r.applycolumnheaders) {
                        r.applycolumnheaders();
                    }
                    r.__dirty = false;
                    if (
                        r.plateType === 'package-export' &&
                        r.parent_reference
                    ) {
                        continue;
                    }

                    if (r.getFormula) {
                        let f = r.getFormula();
                        if (f) {
                            let currentKeys = Object.keys(this.formulas);
                            for (let fk of Object.keys(f)) {
                                if (!currentKeys.includes(fk)) {
                                    if (f[fk] && f[fk].length > 0)
                                        this.formulas[r.name + fk] = f[fk];
                                }
                            }
                        }
                    }
                }
                this.formulas = cleanDictionary(this.formulas)
                let missing = findMissingRefs(this.formulas, this.root, parseSingleVariable)
                if (missing.missingFields) {
                    console.warn(" There are some missing fields " + missing)

                }
                for (let calculation_key of Object.keys(this.formulas)) {
                    try {
                        let well_ranges = calculation_key;
                        let calculation = this.formulas[calculation_key]

                        if (calculation) {
                            calculation = calculation.trim();
                        }
                        if (!calculation.startsWith('function'))

                            calculation = calculation.replace(/\s+/g, '');

                        if (calculation.startsWith('function')) {
                            let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges);
                            let table = this.getTableByName(tableName);

                            if (startX === -Infinity) {
                                startX = table.grid.xmin;
                            }
                            if (startY === -Infinity) {
                                startY = table.grid.ymin;
                            }
                            if (stopX === Infinity) {
                                stopX = table.grid.xmax - 1;
                            }
                            if (stopY === Infinity) {
                                stopY = table.grid.ymax - 1;
                            }
                            for (let i = startY; i <= stopY; i++) {
                                let function_string = calculation.trim();
                                const tokenPattern = /\b\w+(?:\[[^\]]+\])+/g;
                                let matchedTokens = function_string.match(tokenPattern);
                                if (matchedTokens) {
                                    for (const rawToken of matchedTokens) {
                                        try {
                                            let token = rawToken.trim();
                                            let callist = generateExpressionsInRange(token, i, i)
                                            if (callist && callist.length >= 1) {
                                                for (let icl of callist) {
                                                    let v = parseSingleVariable(icl, this.getTablesByName());
                                                    let value = expand_(v)
                                                    function_string = function_string.replace(token, value);
                                                }
                                            }
                                        } catch (e) {
                                            table.__hasFormulaError = true;
                                            this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                            console.error(`Error parsing token ${token}:`, e);
                                        }
                                    }
                                }
                                if (/^function\s*\(/.test(function_string)) {
                                    let randomName = 'fn_' + Math.floor(Math.random() * 1e6);
                                    function_string = function_string.replace(/^function\s*\(/, `function ${randomName}(`);
                                }
                                let func = new Function('x', `return (${function_string})(x);`);
                                let fv = func(this);
                                let v = {
                                    results: [fv]
                                }
                                this.updateWells(v, tableName, startX, stopX, i, i);
                                this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                                table.__hasFormulaError = false;

                            }
                        } else {
                            let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges);
                            let table = this.getTableByName(tableName);

                            const isColumnBasedIteration = startY === stopY && startX !== stopX;
                            const iterStart = isColumnBasedIteration ? startX : startY;
                            const iterStop = isColumnBasedIteration ? stopX : stopY;

                            let callist = generateExpressionsInRange(calculation, iterStart, iterStop);

                            if (callist && callist.length >= 1) {
                                let index = iterStart;

                                for (let icl of callist) {
                                    // convert [i:i] or [row] -> [index:index]
                                    if (typeof icl === 'string') {
                                        icl = icl
                                            .replace(/\[i:i\]/g, `[${index}:${index}]`)
                                            .replace(/\[i\]/g, `[${index}:${index}]`)
                                            .replace(/\[row\]/g, `[${index}:${index}]`);
                                    }


                                    let v = await exec('baja/plate/ops/frun-object.js', icl, this);

                                    if (!v['results']) {
                                        this.highlightWell(calculation_key);
                                        table.__hasFormulaError = true;
                                        this.tagError(tableName, startX, stopX, startY, stopY, calculation);

                                        this.setMessage(
                                            'Unable to calculate: ' + calculation_key + ' = ' + calculation,
                                            2
                                        );
                                        return;
                                    }

                                    table.__hasFormulaError = false;

                                    if (isColumnBasedIteration) {
                                        this.updateWells(v, tableName, index, index, startY, stopY);
                                        this.recordFormulaEdges(tableName, index, index, startY, stopY, calculation);
                                    } else {
                                        this.updateWells(v, tableName, startX, stopX, index, index);
                                        this.recordFormulaEdges(tableName, startX, stopX, index, index, calculation);
                                    }

                                    index++;
                                }
                            } else {
                                let v = await exec('baja/plate/ops/frun-object.js', calculation, this);

                                if (!v['results']) {
                                    table.__hasFormulaError = true;
                                    this.tagError(tableName, startX, stopX, startY, stopY, calculation);
                                    this.setMessage(
                                        'Unable to calculate: ' + calculation_key + ' = ' + calculation,
                                        2
                                    );

                                    if (v.message) this.setMessage(v.message, -1);
                                    return;
                                }

                                table.__hasFormulaError = false;

                                this.updateWells(v, tableName, startX, stopX, startY, stopY);
                                this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);
                            }
                        }

                        this.attr__displayComputationEvents = null;

                    } catch (exception) {
                        console.error(`Message: ${exception.message}`);
                        console.error("Stack trace:");
                        console.error(exception.stack);
                        if (displayedOnce) {
                            this.setMessage('Failed @ ' + calculation_key, 2)
                            displayedOnce = true;
                        }

                        this.attr__displayComputationEvents = null;

                    }

                }
                for (let pl of this.root) {
                    try {
                        if (pl.wells[0][0] && pl.wells[0][0].properties && pl.wells[0][0].properties['package']) {
                            const udata = __decompress(pl.wells[0][0].properties['package'])
                            if (udata) {
                                let ffs = Object.assign(new PlateTrack(), udata)
                                ffs.copyFromJSON(udata)
                                ffs.copyTables(this)

                                await ffs.updateCalculations();
                                this.copyTables(ffs)
                                pl.wells[0][0].properties['package'] = PlateTrack.compressToString(ffs)
                            }
                        }

                    } catch (exception) {
                        console.error(`Message: ${exception.message}`);
                        console.error("Stack trace:");
                        console.error(exception.stack);
                        LJScript.add('_', `Calculation failed  ${exception.message}`)
                    }
                }
                let index = 0;
                for (let raw of this.ptracks) {
                    try {
                        const udata_uid = __decompress_with_uid(raw)
                        const ffs = udata_uid.content;
                        if (ffs) {
                            for (let r of this.root) {
                                for (let rr of ffs.root) {
                                    if (r.uid === rr.uid) {
                                        rr.wells = r.wells;
                                    }
                                }
                            }
                            this.ptracks[index] = udata_uid.uid + ':' + PlateTrack.compressToString(ffs)
                        }
                        index++;
                    } catch (exception) {
                        console.error(`Message: ${exception.message}`);
                        console.error("Stack trace:");
                        console.error(exception.stack);
                        LJScript.add('_', `Calculation failed  ${exception.message}`)
                    }
                }

            }

            copyTables(_pt) {
                for (let r of _pt.root) {
                    for (let rr of this.root) {
                        if (r.uid === rr.uid) {
                            rr.wells = r.wells;
                        }
                    }
                }
            }

            updateWells(v, tableName, startX, stopX, startY, stopY) {
                let r = v['results']
                let t = v['group']
                let table = this.getTableByName(tableName)

                if (table) {
                    let selected_wells = table.getWells(startX, stopX, startY, stopY)
                    for (let it of selected_wells) {
                        it.__hasFormula = true;
                        for (let io of r) {
                            let i;

                            if (typeof io === 'number') {
                                i = io;
                            }
                            else if (io && typeof io === 'string') {
                                i = io;
                            }
                            else if (io && typeof io.value !== 'undefined') {
                                i = io.value;
                            } else {
                                i = io;
                            }

                            if (i instanceof Date && !isNaN(i.valueOf())) {

                                it.value = new Date(i);
                            } else if (i !== undefined && !isNaN(i)) {

                                it.setValue(parseFloat(i).toFixed(4), true);
                            } else {

                                it.value = i;
                            }
                            if (!it.properties) {
                                it.properties = {};
                            }

                            if (t) {
                                it.setGroup(t);
                            }
                        }
                    }
                }
            }

            getFormulaForWell(range) {

                this.formulas = this.cle


                return getOverlappingRanges(range, this.formulas)
            }
            setFormulaForWell(range) {
                return removeFormulaForWell(range, this.formulas)
            }

            static compressToString(pt) {
                let gs = JSON.stringify(pt, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }
                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                let binaryData = compressString(gs)
                const chunkSize = 0x8000;
                let stringData = '';
                for (let i = 0; i < binaryData.length; i += chunkSize) {
                    const chunk = binaryData.subarray(i, i + chunkSize);
                    stringData += String.fromCharCode.apply(null, chunk);
                }
                return stringData;
            }

            getFormulaInRange(range) {
                const obj = this.formulas;
                const rangeMatch = range.match(/^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/);
                if (!rangeMatch) {
                    throw new Error("Invalid range format. Must be in 'tablename[rowStart:rowEnd][colStart:colEnd]'.");
                }
                const [_, tableName, rowStart, rowEnd, colStart, colEnd] = rangeMatch.map((val, idx) =>
                    idx > 1 ? parseInt(val, 10) : val
                );
                let f = []
                for (const key of Object.keys(obj)) {
                    const keyMatch = key.match(/^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/);
                    if (keyMatch) {
                        const [__, keyTableName, keyRowStart, keyRowEnd, keyColStart, keyColEnd] = keyMatch.map((val, idx) =>
                            idx > 1 ? parseInt(val, 10) : val
                        );
                        if (
                            tableName === keyTableName &&
                            rowStart >= keyRowStart &&
                            rowEnd <= keyRowEnd &&
                            colStart >= keyColStart &&
                            colEnd <= keyColEnd
                        ) {
                            f.push(key);
                        }
                    }
                }
                return f;
            }

            setActive(plot) {
                this.activePlot = plot;
            }
            addGlyphNoSelect(glyph) {
                this.glyphs.push(glyph)
            }
            addGlyph(glyph) {
                this.glyphs.push(glyph)
                this.selectGlyph__(glyph)
            }
            selectGlyph__(glyph) {
                this.clearActionGlyphs();
                selected_glyphs = []
                selected_glyphs.push(glyph)
                try {
                    let hd = {
                        selected_glyphs: selected_glyphs,
                        startX: null,
                        startY: null,
                        currentX: null,
                        currentY: null,
                        isDrawing: true,
                        isDragging: false,
                        priority: true,
                        id: 'glyph-override-move',

                        draw: (grid, ctx) => {
                            if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;
                            const isNum = v => typeof v === 'number' && Number.isFinite(v);
                            const now = Date.now();
                            const periodMs = 2000;
                            const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                            const pulse = (phase + 1) / 2;

                            const baseAlpha = 0.10;
                            const extraAlpha = 0.25;
                            const alpha = baseAlpha + extraAlpha * pulse;

                            const baseLineWidth = 2;
                            const extraLineWidth = 3;
                            const lineWidth = baseLineWidth + extraLineWidth * pulse;

                            const basePad = 4;
                            const extraPad = 10;
                            const pad = basePad + extraPad * pulse;

                            const local = t => String(t || '').toLowerCase();

                            const applyGlow = () => {
                                ctx.globalAlpha = alpha;
                                ctx.lineJoin = 'round';
                                ctx.lineCap = 'round';
                                ctx.strokeStyle = 'rgb(0, 255, 136)';
                                ctx.lineWidth = lineWidth;

                                ctx.shadowColor = 'rgba(9, 255, 0, 0.45)';
                                ctx.shadowBlur = 10 + 12 * pulse;
                                ctx.shadowOffsetX = 0;
                                ctx.shadowOffsetY = 0;
                            };

                            const strokeSegment = (x1w, y1w, x2w, y2w) => {
                                if (![x1w, y1w, x2w, y2w].every(isNum)) return;
                                const x1 = grid.X(x1w), y1 = grid.Y(y1w);
                                const x2 = grid.X(x2w), y2 = grid.Y(y2w);

                                ctx.beginPath();
                                ctx.moveTo(x1, y1);
                                ctx.lineTo(x2, y2);
                                ctx.stroke();
                            };

                            const strokePolyline = (ptsW, closed) => {
                                if (!Array.isArray(ptsW) || ptsW.length < 2) return;

                                ctx.beginPath();
                                for (let i = 0; i < ptsW.length; i++) {
                                    const p = ptsW[i];
                                    if (!p) continue;
                                    const xw = ('x' in p) ? p.x : p[0];
                                    const yw = ('y' in p) ? p.y : p[1];
                                    if (!isNum(xw) || !isNum(yw)) continue;
                                    const sx = grid.X(xw);
                                    const sy = grid.Y(yw);
                                    if (i === 0) ctx.moveTo(sx, sy);
                                    else ctx.lineTo(sx, sy);
                                }
                                if (closed) ctx.closePath();
                                ctx.stroke();
                            };

                            const strokeRectScreen = (sx, syTop, sw, sh, padPx) => {
                                if (![sx, syTop, sw, sh].every(isNum)) return;
                                const left = Math.min(sx, sx + sw) - padPx;
                                const right = Math.max(sx, sx + sw) + padPx;
                                const top = Math.min(syTop, syTop + sh) - padPx;
                                const bot = Math.max(syTop, syTop + sh) + padPx;

                                ctx.beginPath();
                                ctx.rect(left, top, right - left, bot - top);
                                ctx.stroke();
                            };

                            const padWorldXY = (padPx) => {

                                if (typeof grid.Xwc === 'function' && typeof grid.Ywc === 'function') {
                                    const x0 = grid.Xwc(0);
                                    const x1 = grid.Xwc(padPx);
                                    const y0 = grid.Ywc(0);
                                    const y1 = grid.Ywc(padPx);
                                    const dx = isNum(x0) && isNum(x1) ? Math.abs(x1 - x0) : 0;
                                    const dy = isNum(y0) && isNum(y1) ? Math.abs(y1 - y0) : 0;
                                    return { dx, dy };
                                }

                                return { dx: padPx, dy: padPx };
                            };

                            const outlineOne = (shape) => {
                                if (!shape) return;

                                if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                    Shape._attachBBoxMethods(shape);
                                }

                                const t = local(shape.type);

                                if (t === 'svg_group' || t === 'group' || (Array.isArray(shape.shapes) && shape.shapes.length)) {
                                    const kids = Array.isArray(shape.shapes) ? shape.shapes : [];
                                    for (const ch of kids) outlineOne(ch);
                                    return;
                                }

                                if (t === 'rect' || ('x' in shape && 'y' in shape && ('w' in shape || 'width' in shape))) {
                                    const x = shape.x ?? shape.getX?.();
                                    const y = shape.y ?? shape.getY?.();
                                    const w = shape.w ?? shape.width ?? (shape.getXf?.() - shape.getX?.());
                                    const h = shape.h ?? shape.height ?? (shape.getYf?.() - shape.getY?.());
                                    if (![x, y, w, h].every(isNum)) return;

                                    const sx = grid.X(x);
                                    const syTop = grid.Y(y + h);
                                    const sw = grid.screenWidth(w);
                                    const sh = grid.screenHeight(h);

                                    strokeRectScreen(sx, syTop, sw, sh, pad);
                                    return;
                                }
                                if (t === 'circle' || ('cx' in shape && 'cy' in shape && 'r' in shape)) {
                                    const cx = shape.cx ?? null;
                                    const cy = shape.cy ?? null;
                                    const r = shape.r ?? null;
                                    if (![cx, cy, r].every(isNum)) return;

                                    const sx = grid.X(cx);
                                    const sy = grid.Y(cy);
                                    const sr = Math.abs(grid.screenWidth(r));

                                    ctx.beginPath();
                                    ctx.arc(sx, sy, sr + pad, 0, 2 * Math.PI);
                                    ctx.stroke();
                                    return;
                                }

                                if (t === 'ellipse' || ('cx' in shape && 'cy' in shape && 'rx' in shape && 'ry' in shape)) {
                                    const cx = shape.cx ?? null;
                                    const cy = shape.cy ?? null;
                                    const rx = shape.rx ?? null;
                                    const ry = shape.ry ?? null;
                                    if (![cx, cy, rx, ry].every(isNum)) return;

                                    const sx = grid.X(cx);
                                    const sy = grid.Y(cy);
                                    const srx = Math.abs(grid.screenWidth(rx)) + pad;
                                    const sry = Math.abs(grid.screenHeight(ry)) + pad;

                                    ctx.beginPath();
                                    ctx.save();
                                    ctx.translate(sx, sy);
                                    ctx.scale(srx, sry);
                                    ctx.arc(0, 0, 1, 0, 2 * Math.PI);
                                    ctx.restore();
                                    ctx.stroke();
                                    return;
                                }

                                if (t === 'line' || (('x1' in shape) && ('y1' in shape) && ('x2' in shape) && ('y2' in shape))) {

                                    strokeSegment(shape.x1, shape.y1, shape.x2, shape.y2);
                                    return;
                                }

                                if (t === 'polyline' || t === 'polygon' || Array.isArray(shape.pts)) {
                                    const pts = shape.pts;
                                    const closed = (t === 'polygon') || !!shape.isClosed;

                                    strokePolyline(pts, closed);
                                    return;
                                }

                                if (t === 'text' || ('text' in shape && ('x' in shape) && ('y' in shape))) {

                                    const xw = shape.x ?? null;
                                    const yw = shape.y ?? null;
                                    if (![xw, yw].every(isNum)) return;

                                    const unitY = typeof grid.screenHeight === 'function'
                                        ? Math.abs(grid.screenHeight(1))
                                        : 1;
                                    const fontSize = shape.fontSize ?? 10;
                                    const px = Math.max(1, unitY * fontSize);

                                    const str = String(shape.text ?? '');
                                    const estW = Math.max(1, str.length) * px * 0.5;
                                    const estH = px * 1.1;

                                    const sx = grid.X(xw);
                                    const sy = grid.Y(yw);

                                    const padPx = Math.max(pad, px * 0.1);

                                    ctx.beginPath();
                                    ctx.rect(
                                        sx - estW / 2 - padPx,
                                        sy - estH / 2 - padPx,
                                        estW + 2 * padPx,
                                        estH + 2 * padPx
                                    );
                                    ctx.stroke();
                                    return;
                                }
                                if (t === 'svg_text' || ('svg_text' in shape && ('x' in shape) && ('y' in shape))) {

                                    const xw = shape.x ?? null;
                                    const yw = shape.y ?? null;
                                    if (![xw, yw].every(isNum)) return;

                                    const unitY = typeof grid.screenHeight === 'function'
                                        ? Math.abs(grid.screenHeight(1))
                                        : 1;
                                    const fontSize = shape.fontSize ?? 10;
                                    const px = Math.max(1, unitY * fontSize);

                                    const str = String(shape.text ?? '');
                                    const estW = Math.max(1, str.length) * px * 0.5;
                                    const estH = px * 1.1;

                                    const sx = grid.X(xw);
                                    const sy = grid.Y(yw);

                                    const padPx = Math.max(pad, px * 0.1);

                                    ctx.beginPath();
                                    ctx.rect(
                                        sx - estW / 2 - padPx,
                                        sy - estH / 2 - padPx,
                                        estW + 2 * padPx,
                                        estH + 2 * padPx
                                    );
                                    ctx.stroke();
                                    return;
                                }

                                const x1 = shape.getX?.();
                                const y1 = shape.getY?.();
                                const x2 = shape.getXf?.();
                                const y2 = shape.getYf?.();
                                if (![x1, y1, x2, y2].every(isNum)) return;

                                const { dx, dy } = padWorldXY(pad);
                                const minX = Math.min(x1, x2) - dx;
                                const maxX = Math.max(x1, x2) + dx;
                                const minY = Math.min(y1, y2) - dy;
                                const maxY = Math.max(y1, y2) + dy;

                                const sx = grid.X(minX);
                                const syTop = grid.Y(maxY);
                                const sw = grid.screenWidth(maxX - minX);
                                const sh = grid.screenHeight(maxY - minY);

                                strokeRectScreen(sx, syTop, sw, sh, 0);
                            };
                            ctx.save();
                            applyGlow();
                            for (const gshape of hd.selected_glyphs) {
                                if (!gshape || !gshape.shape) continue;
                                outlineOne(gshape.shape);
                            }

                            ctx.restore();
                        },

                        mouseDownListener: async (x, y) => {
                            const wx = this.grid.Xwc(x);
                            const wy = this.grid.Ywc(y);
                            for (let a of this.actionGlyph) {
                                if (a && a.inside(this.grid, (x), (y))) {
                                    if (a.action) {
                                        a.action(this)
                                    }
                                    return;
                                }
                            }
                            let newGlyph = this.getGlyph(wx, wy)
                            if (newGlyph) {
                                this.selectGlyph__(newGlyph)
                                return;
                            }
                            let insideAny = false;
                            if (hd.selected_glyphs) {
                                for (let gshape of hd.selected_glyphs) {
                                    if (!gshape || !gshape.shape) continue;
                                    const s = gshape.shape;
                                    if (s && s.inside(this.grid, x, y)) {
                                        insideAny = true;
                                    }

                                }
                            }

                            if (!insideAny) {
                                this.wb(null);
                                return;
                            }

                            hd.startX = x;
                            hd.startY = y;
                            hd.currentX = x;
                            hd.currentY = y;
                            hd.isDragging = true;
                            pushHistory(HM(this))

                            if (hd.selected_glyphs) {
                                for (let gshape of hd.selected_glyphs) {
                                    if (!gshape || !gshape.shape) continue;
                                    const shape = gshape.shape;

                                    if (shape.getX && shape.getY) {
                                        gshape._dragOffsetX = shape.getX() - wx;
                                        gshape._dragOffsetY = shape.getY() - wy;
                                    } else {
                                        gshape._dragOffsetX = 0;
                                        gshape._dragOffsetY = 0;
                                    }
                                }
                            }
                        },

                        mouseMoveListener: (x, y) => {
                            if (!hd.selected_glyphs) return;
                            if (!hd.isDragging) return;

                            const wx = this.grid.Xwc(x);
                            const wy = this.grid.Ywc(y);

                            for (let gshape of hd.selected_glyphs) {
                                if (!gshape || !gshape.shape) continue;

                                let shape = gshape.shape;
                                const offX = gshape._dragOffsetX ?? 0;
                                const offY = gshape._dragOffsetY ?? 0;

                                const targetX = wx + offX;
                                const targetY = wy + offY;

                                if (shape.setX) shape.setX(targetX);
                                else if ('x' in shape) shape.x = targetX;
                                else if ('cx' in shape) shape.cx = targetX;

                                if (shape.setY) shape.setY(targetY);
                                else if ('y' in shape) shape.y = targetY;
                                else if ('cy' in shape) shape.cy = targetY;
                            }
                        },

                        mouseUpListener: async (x, y) => {

                            hd.isDragging = false;
                        },

                        close: () => {
                            hd.isDragging = false;
                        }
                    };

                    setTimeout(() => {
                        hd.selected_glyphs = selected_glyphs;
                        this.wb(hd);
                        this.showMenuOptionsForGlyph();
                        hd.startX = null;
                        hd.startY = null;
                        hd.currentX = null;
                        hd.currentY = null;
                    }, 100);

                } catch (err) {
                    console.error('Failed to read from clipboard: ', err);
                }

            }


            appendNucleotideToAllGlyphs(selectedGlyph, createNucleotideFn) {
                if (!selectedGlyph || !selectedGlyph.shape) return null;

                if (!Array.isArray(this.glyphs)) {
                    this.glyphs = [];
                }

                debugger;
                const glyph = this.appendNucleotideToGlyph(selectedGlyph, createNucleotideFn);
                if (!glyph) return null;
                this.glyphs.push(glyph);
                return glyph;
            }

            appendNucleotideToGlyph(selectedGlyph, createNucleotideFn) {
                const flatten = (node, acc = []) => {
                    if (!node) return acc;

                    if (Array.isArray(node)) {
                        for (const item of node) flatten(item, acc);
                        return acc;
                    }

                    if (node.shape) {
                        flatten(node.shape, acc);
                        return acc;
                    }

                    acc.push(node);

                    if (Array.isArray(node.shapes)) {
                        for (const child of node.shapes) {
                            flatten(child, acc);
                        }
                    }

                    return acc;
                };

                const isNum = (v) => typeof v === "number" && Number.isFinite(v);

                const isBaseText = (shape) => {
                    if (!shape || shape.type !== "text") return false;
                    if (!isNum(shape.x) || !isNum(shape.y)) return false;

                    const txt = String(shape.text || "").trim().toUpperCase();
                    return ["A", "U", "G", "C", "T"].includes(txt);
                };

                const isEllipse = (shape) => {
                    return shape &&
                        shape.type === "ellipse" &&
                        isNum(shape.cx) &&
                        isNum(shape.cy);
                };

                const isHorizontalLine = (shape) => {
                    return shape &&
                        shape.type === "line" &&
                        isNum(shape.x1) &&
                        isNum(shape.y1) &&
                        isNum(shape.x2) &&
                        isNum(shape.y2) &&
                        Math.abs(shape.y1 - shape.y2) < 0.001;
                };

                const isVerticalLine = (shape) => {
                    return shape &&
                        shape.type === "line" &&
                        isNum(shape.x1) &&
                        isNum(shape.y1) &&
                        isNum(shape.x2) &&
                        isNum(shape.y2) &&
                        Math.abs(shape.x1 - shape.x2) < 0.001;
                };

                const allShapes = flatten(this.glyphs);

                const selectedShapes = flatten(selectedGlyph);
                if (!selectedShapes.length) return null;

                const selectedBaseShapes = selectedShapes.filter(isBaseText);
                if (!selectedBaseShapes.length) return null;

                // Use the selected glyph's nucleotide base text as anchor
                const selectedBase = selectedBaseShapes.reduce((max, s) => {
                    return s.x > max.x ? s : max;
                }, selectedBaseShapes[0]);

                // Find ellipse in selected glyph nearest to the selected base
                const selectedEllipses = selectedShapes.filter(isEllipse);
                const distSq = (a, b) => {
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    return dx * dx + dy * dy;
                };

                const selectedEllipse = selectedEllipses.length
                    ? selectedEllipses.reduce((best, e) => {
                        const cur = { x: e.cx, y: e.cy };
                        const bestPt = { x: best.cx, y: best.cy };
                        return distSq(cur, selectedBase) < distSq(bestPt, selectedBase) ? e : best;
                    }, selectedEllipses[0])
                    : null;

                // Find the backbone horizontal line nearest the selected glyph
                const horizontalLines = allShapes.filter(isHorizontalLine);
                if (!horizontalLines.length) return null;

                const anchorY = selectedEllipse ? selectedEllipse.cy : selectedBase.y;

                const backboneLine = horizontalLines.reduce((best, line) => {
                    const dBest = Math.abs(best.y1 - anchorY);
                    const dCur = Math.abs(line.y1 - anchorY);
                    return dCur < dBest ? line : best;
                }, horizontalLines[0]);

                const backboneY = backboneLine.y1;

                // Find vertical slot lines that intersect this backbone y
                const verticalLines = allShapes.filter(isVerticalLine).filter(line => {
                    const minY = Math.min(line.y1, line.y2);
                    const maxY = Math.max(line.y1, line.y2);
                    return backboneY >= minY - 0.001 && backboneY <= maxY + 0.001;
                });

                if (!verticalLines.length) return null;

                const slotXs = [...new Set(
                    verticalLines
                        .map(line => line.x1)
                        .filter(isNum)
                )].sort((a, b) => a - b);

                if (!slotXs.length) return null;

                // Use the ellipse center x if available, otherwise base x
                const currentX = selectedEllipse ? selectedEllipse.cx : selectedBase.x;

                // Estimate world-coordinate step
                let stepX = null;
                if (slotXs.length >= 2) {
                    const diffs = [];
                    for (let i = 1; i < slotXs.length; i++) {
                        const dx = slotXs[i] - slotXs[i - 1];
                        if (dx > 0) diffs.push(dx);
                    }
                    if (diffs.length) stepX = Math.min(...diffs);
                }

                if (!(isNum(stepX) && stepX > 0)) {
                    stepX = 74;
                }

                // Next slot to the right of current glyph
                let newX = slotXs.find(x => x > currentX + 0.001);
                if (!isNum(newX)) {
                    newX = currentX + stepX;
                }

                // Preserve world-coordinate offsets from the selected glyph
                const ellipseOffsetY = selectedEllipse ? (selectedEllipse.cy - backboneY) : 0;
                const baseOffsetY = selectedEllipse
                    ? (selectedBase.y - selectedEllipse.cy)
                    : 0;

                const factory = typeof createNucleotideFn === "function"
                    ? createNucleotideFn
                    : createNucleotide;

                // Build from backbone-aligned world coords
                const rawShape = factory({
                    chain: selectedBase.y > backboneY ? "top" : "bottom",
                    x: newX,
                    y: backboneY + ellipseOffsetY
                });

                if (!rawShape) return null;

                // Patch the raw factory output so it is in line with the actual strand geometry
                if (rawShape.type === "svg_group" && Array.isArray(rawShape.shapes)) {
                    rawShape.x = newX;
                    rawShape.y = backboneY + ellipseOffsetY;

                    for (const child of rawShape.shapes) {
                        if (!child) continue;

                        if (child.type === "ellipse") {
                            child.cx = newX;
                            child.cy = backboneY + ellipseOffsetY;

                            if (isNum(child.rx)) child.x = child.cx - child.rx;
                            if (isNum(child.ry)) child.y = child.cy - child.ry;
                            if (isNum(child.rx)) child.w = child.rx * 2;
                            if (isNum(child.ry)) child.h = child.ry * 2;
                        }

                        if (child.type === "text") {
                            child.x = newX;
                            child.y = (backboneY + ellipseOffsetY) + baseOffsetY;
                        }
                    }
                }

                const builtShape = Shape.buildFromJSON(rawShape);
                if (!builtShape) return null;

                return new Glyph(builtShape);
            }

            selectGlyphAll() {
                this.clearActionGlyphs();
                try {
                    let hd = {
                        selected_glyphs: null,
                        startX: null,
                        startY: null,
                        currentX: null,
                        currentY: null,
                        isDrawing: true,
                        isDragging: false,
                        priority: true,
                        id: 'glyph-override-move',
                        _raf: null,
                        _pendingMouse: null,

                        draw: (grid, ctx) => {
                            const items = hd.selected_glyphs;
                            if (!items || !items.length) return;

                            const isNum = v => typeof v === 'number' && Number.isFinite(v);
                            const local = t => String(t || '').toLowerCase();

                            const count = items.length;
                            const heavyMode = count <= 100;

                            let alpha = 0.2;
                            let lineWidth = 2;
                            let pad = 6;
                            let shadowBlur = 0;

                            if (heavyMode) {
                                const now = Date.now();
                                const periodMs = 2000;
                                const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                const pulse = (phase + 1) / 2;

                                alpha = 0.10 + 0.25 * pulse;
                                lineWidth = 2 + 3 * pulse;
                                pad = 4 + 10 * pulse;
                                shadowBlur = 10 + 12 * pulse;
                            }

                            const strokeSegment = (x1w, y1w, x2w, y2w) => {
                                if (![x1w, y1w, x2w, y2w].every(isNum)) return;

                                const x1 = grid.X(x1w);
                                const y1 = grid.Y(y1w);
                                const x2 = grid.X(x2w);
                                const y2 = grid.Y(y2w);

                                ctx.beginPath();
                                ctx.moveTo(x1, y1);
                                ctx.lineTo(x2, y2);
                                ctx.stroke();
                            };

                            const strokePolyline = (ptsW, closed) => {
                                if (!Array.isArray(ptsW) || ptsW.length < 2) return;

                                ctx.beginPath();
                                let started = false;

                                for (let i = 0; i < ptsW.length; i++) {
                                    const p = ptsW[i];
                                    if (!p) continue;

                                    const xw = ('x' in p) ? p.x : p[0];
                                    const yw = ('y' in p) ? p.y : p[1];
                                    if (!isNum(xw) || !isNum(yw)) continue;

                                    const sx = grid.X(xw);
                                    const sy = grid.Y(yw);

                                    if (!started) {
                                        ctx.moveTo(sx, sy);
                                        started = true;
                                    } else {
                                        ctx.lineTo(sx, sy);
                                    }
                                }

                                if (!started) return;
                                if (closed) ctx.closePath();
                                ctx.stroke();
                            };

                            const strokeRectScreen = (sx, syTop, sw, sh, padPx) => {
                                if (![sx, syTop, sw, sh].every(isNum)) return;

                                const left = Math.min(sx, sx + sw) - padPx;
                                const right = Math.max(sx, sx + sw) + padPx;
                                const top = Math.min(syTop, syTop + sh) - padPx;
                                const bot = Math.max(syTop, syTop + sh) + padPx;

                                ctx.beginPath();
                                ctx.rect(left, top, right - left, bot - top);
                                ctx.stroke();
                            };

                            const padWorldXY = (padPx) => {
                                if (typeof grid.Xwc === 'function' && typeof grid.Ywc === 'function') {
                                    const x0 = grid.Xwc(0);
                                    const x1 = grid.Xwc(padPx);
                                    const y0 = grid.Ywc(0);
                                    const y1 = grid.Ywc(padPx);

                                    const dx = isNum(x0) && isNum(x1) ? Math.abs(x1 - x0) : 0;
                                    const dy = isNum(y0) && isNum(y1) ? Math.abs(y1 - y0) : 0;
                                    return { dx, dy };
                                }

                                return { dx: padPx, dy: padPx };
                            };

                            const outlineOne = (shape, parentGlyphType = '') => {
                                if (!shape) return;

                                if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                    Shape._attachBBoxMethods(shape);
                                }

                                const t = local(shape.type);

                                if (t === 'svg_group' || t === 'group' || (Array.isArray(shape.shapes) && shape.shapes.length)) {
                                    const kids = Array.isArray(shape.shapes) ? shape.shapes : [];
                                    for (const ch of kids) outlineOne(ch, parentGlyphType);
                                    return;
                                }

                                if (
                                    parentGlyphType === 'svg' &&
                                    (t === 'rect' || ('x' in shape && 'y' in shape && ('w' in shape || 'width' in shape)))
                                ) {
                                    const x = shape.x ?? shape.getX?.();
                                    const y = shape.y ?? shape.getY?.();
                                    const w = shape.w ?? shape.width ?? (shape.getXf?.() - shape.getX?.());
                                    const h = shape.h ?? shape.height ?? (shape.getYf?.() - shape.getY?.());

                                    if (![x, y, w, h].every(isNum)) return;

                                    const sx = grid.X(x);
                                    const syTop = grid.Y(y + h);
                                    const sw = grid.screenWidth(w);
                                    const sh = grid.screenHeight(h);

                                    strokeRectScreen(sx, syTop, sw, sh, pad);
                                    return;
                                }

                                if (t === 'circle' || ('cx' in shape && 'cy' in shape && 'r' in shape)) {
                                    const cx = shape.cx ?? null;
                                    const cy = shape.cy ?? null;
                                    const r = shape.r ?? null;

                                    if (![cx, cy, r].every(isNum)) return;

                                    const sx = grid.X(cx);
                                    const sy = grid.Y(cy);
                                    const sr = Math.abs(grid.screenWidth(r));

                                    ctx.beginPath();
                                    ctx.arc(sx, sy, sr + pad, 0, 2 * Math.PI);
                                    ctx.stroke();
                                    return;
                                }

                                if (t === 'ellipse' || ('cx' in shape && 'cy' in shape && 'rx' in shape && 'ry' in shape)) {
                                    const cx = shape.cx ?? null;
                                    const cy = shape.cy ?? null;
                                    const rx = shape.rx ?? null;
                                    const ry = shape.ry ?? null;

                                    if (![cx, cy, rx, ry].every(isNum)) return;

                                    const sx = grid.X(cx);
                                    const sy = grid.Y(cy);
                                    const srx = Math.abs(grid.screenWidth(rx)) + pad;
                                    const sry = Math.abs(grid.screenHeight(ry)) + pad;

                                    ctx.save();
                                    ctx.beginPath();
                                    ctx.translate(sx, sy);
                                    ctx.scale(srx, sry);
                                    ctx.arc(0, 0, 1, 0, 2 * Math.PI);
                                    ctx.restore();
                                    ctx.stroke();
                                    return;
                                }

                                if (t === 'line' || (('x1' in shape) && ('y1' in shape) && ('x2' in shape) && ('y2' in shape))) {
                                    strokeSegment(shape.x1, shape.y1, shape.x2, shape.y2);
                                    return;
                                }

                                if (t === 'polyline' || t === 'polygon' || Array.isArray(shape.pts)) {
                                    const pts = shape.pts;
                                    const closed = (t === 'polygon') || !!shape.isClosed;
                                    strokePolyline(pts, closed);
                                    return;
                                }

                                if (t === 'text' || ('text' in shape && ('x' in shape) && ('y' in shape))) {
                                    const xw = shape.x ?? null;
                                    const yw = shape.y ?? null;
                                    if (![xw, yw].every(isNum)) return;

                                    const unitY = typeof grid.screenHeight === 'function'
                                        ? Math.abs(grid.screenHeight(1))
                                        : 1;
                                    const fontSize = shape.fontSize ?? 10;
                                    const px = Math.max(1, unitY * fontSize);

                                    const str = String(shape.text ?? '');
                                    const estW = Math.max(1, str.length) * px * 0.6;
                                    const estH = px * 1.1;

                                    const sx = grid.X(xw);
                                    const sy = grid.Y(yw);
                                    const padPx = Math.max(pad, px * 0.2);

                                    ctx.beginPath();
                                    ctx.rect(
                                        sx - estW / 2 - padPx,
                                        sy - estH / 2 - padPx,
                                        estW + 2 * padPx,
                                        estH + 2 * padPx
                                    );
                                    ctx.stroke();
                                    return;
                                }

                                const x1 = shape.getX?.();
                                const y1 = shape.getY?.();
                                const x2 = shape.getXf?.();
                                const y2 = shape.getYf?.();

                                if (![x1, y1, x2, y2].every(isNum)) return;

                                const { dx, dy } = padWorldXY(pad);
                                const minX = Math.min(x1, x2) - dx;
                                const maxX = Math.max(x1, x2) + dx;
                                const minY = Math.min(y1, y2) - dy;
                                const maxY = Math.max(y1, y2) + dy;

                                const sx = grid.X(minX);
                                const syTop = grid.Y(maxY);
                                const sw = grid.screenWidth(maxX - minX);
                                const sh = grid.screenHeight(maxY - minY);

                                strokeRectScreen(sx, syTop, sw, sh, 0);
                            };

                            ctx.save();
                            ctx.globalAlpha = alpha;
                            ctx.lineJoin = 'round';
                            ctx.lineCap = 'round';
                            ctx.strokeStyle = 'rgb(255, 0, 255)';
                            ctx.lineWidth = lineWidth;

                            if (heavyMode) {
                                ctx.shadowColor = 'rgba(0, 150, 255, 0.45)';
                                ctx.shadowBlur = shadowBlur;
                                ctx.shadowOffsetX = 0;
                                ctx.shadowOffsetY = 0;
                            } else {
                                ctx.shadowColor = 'transparent';
                                ctx.shadowBlur = 0;
                                ctx.shadowOffsetX = 0;
                                ctx.shadowOffsetY = 0;
                            }

                            for (const gshape of items) {
                                if (!gshape || !gshape.shape) continue;
                                outlineOne(gshape.shape, gshape.type || '');
                            }

                            ctx.restore();
                        },

                        mouseDownListener: async (x, y) => {
                            const wx = this.grid.Xwc(x);
                            const wy = this.grid.Ywc(y);

                            for (let a of this.actionGlyph) {
                                if (a && a.inside(this.grid, x, y)) {
                                    if (a.action) {
                                        a.action(this);
                                    }
                                    return;
                                }
                            }

                            let insideAny = false;

                            if (hd.selected_glyphs) {
                                for (let gshape of hd.selected_glyphs) {
                                    if (!gshape || !gshape.shape) continue;
                                    const s = gshape.shape;
                                    if (s && s.inside(this.grid, x, y)) {
                                        insideAny = true;
                                    }
                                }
                            }

                            if (!insideAny) {
                                this.wb(null);
                                return;
                            }

                            hd.startX = x;
                            hd.startY = y;
                            hd.currentX = x;
                            hd.currentY = y;
                            hd.isDragging = true;

                            pushHistory(HM(this));

                            if (hd.selected_glyphs) {
                                for (let gshape of hd.selected_glyphs) {
                                    if (!gshape || !gshape.shape) continue;
                                    const shape = gshape.shape;

                                    if (shape.getX && shape.getY) {
                                        gshape._dragOffsetX = shape.getX() - wx;
                                        gshape._dragOffsetY = shape.getY() - wy;
                                    } else {
                                        gshape._dragOffsetX = 0;
                                        gshape._dragOffsetY = 0;
                                    }
                                }
                            }
                        },

                        mouseMoveListener: (x, y) => {
                            if (!hd.selected_glyphs) return;
                            if (!hd.isDragging) return;

                            hd._pendingMouse = { x, y };
                            if (hd._raf) return;

                            hd._raf = requestAnimationFrame(() => {
                                hd._raf = null;

                                const p = hd._pendingMouse;
                                if (!p || !hd.isDragging || !hd.selected_glyphs) return;

                                const wx = this.grid.Xwc(p.x);
                                const wy = this.grid.Ywc(p.y);

                                for (let gshape of hd.selected_glyphs) {
                                    if (!gshape || !gshape.shape) continue;

                                    const shape = gshape.shape;
                                    const offX = gshape._dragOffsetX ?? 0;
                                    const offY = gshape._dragOffsetY ?? 0;

                                    const targetX = wx + offX;
                                    const targetY = wy + offY;

                                    if (shape.setX) shape.setX(targetX);
                                    else if ('x' in shape) shape.x = targetX;
                                    else if ('cx' in shape) shape.cx = targetX;

                                    if (shape.setY) shape.setY(targetY);
                                    else if ('y' in shape) shape.y = targetY;
                                    else if ('cy' in shape) shape.cy = targetY;
                                }
                            });
                        },

                        mouseUpListener: async (x, y) => {
                            hd.isDragging = false;

                            if (hd._raf) {
                                cancelAnimationFrame(hd._raf);
                                hd._raf = null;
                            }

                            hd._pendingMouse = null;
                        },

                        close: () => {
                            hd.isDragging = false;

                            if (hd._raf) {
                                cancelAnimationFrame(hd._raf);
                                hd._raf = null;
                            }

                            hd._pendingMouse = null;
                        }
                    };

                    setTimeout(() => {
                        hd.selected_glyphs = selected_glyphs;
                        this.wb(hd);

                        this.addActionGlyph(this, "Click here for options...", async () => {
                            setTimeout(() => {
                                this.clearActionGlyphs();
                                this.showMenuOptionsForGlyph();
                            }, 100);
                        });

                        hd.startX = null;
                        hd.startY = null;
                        hd.currentX = null;
                        hd.currentY = null;
                    }, 100);

                } catch (err) {
                    console.error('Failed to read from clipboard: ', err);
                }
            }

            addCenteredShape(grid, glyph) {
                if (!grid || !glyph || !glyph.shape) return;

                const shape = glyph.shape;

                if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                    Shape._attachBBoxMethods(shape);
                }

                const sx = grid.width * 0.5;
                const sy = grid.height * 0.5;
                const wxCenter = grid.Xwc(sx);
                const wyCenter = grid.Ywc(sy);

                const x1 = shape.getX(), y1 = shape.getY();
                const x2 = shape.getXf(), y2 = shape.getYf();
                if (![x1, y1, x2, y2].every(v => typeof v === "number" && Number.isFinite(v))) return;

                const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
                const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
                const wWorld = Math.max(1e-9, maxX - minX);
                const hWorld = Math.max(1e-9, maxY - minY);

                const worldToPxX = (w) => {
                    if (typeof grid.worldWidthToPx === "function") return grid.worldWidthToPx(w);
                    if (typeof grid.X === "function") return Math.abs(grid.X(grid.xmin + w) - grid.X(grid.xmin));

                    return null;
                };
                const worldToPxY = (h) => {
                    if (typeof grid.worldHeightToPx === "function") return grid.worldHeightToPx(h);
                    if (typeof grid.Y === "function") return Math.abs(grid.Y(grid.ymin + h) - grid.Y(grid.ymin));
                    return null;
                };

                const curPxW = worldToPxX(wWorld);
                const curPxH = worldToPxY(hWorld);
                if (!(curPxW > 0) || !(curPxH > 0)) return;

                const maxPxWidth = 80;
                const maxPxHeight = 40;
                const scale = Math.min(maxPxWidth / curPxW, maxPxHeight / curPxH);

                const cx = (minX + maxX) * 0.5;
                const cy = (minY + maxY) * 0.5;

                const applyScale = (s) => {
                    if (typeof shape.scale === "function") {
                        shape.scale(s, s, cx, cy);
                        return true;
                    }
                    if (typeof shape.setScale === "function") {
                        shape.setScale(s, s, cx, cy);
                        return true;
                    }

                    if (typeof shape.w === "number") shape.w *= s;
                    if (typeof shape.h === "number") shape.h *= s;
                    if (typeof shape.r === "number") shape.r *= s;
                    if (typeof shape.rx === "number") shape.rx *= s;
                    if (typeof shape.ry === "number") shape.ry *= s;

                    if (Array.isArray(shape.points)) {
                        for (const p of shape.points) {
                            if (!p) continue;

                            const px = (p.x ?? p[0]);
                            const py = (p.y ?? p[1]);
                            if (typeof px === "number" && typeof py === "number") {
                                const nx = cx + (px - cx) * s;
                                const ny = cy + (py - cy) * s;
                                if ("x" in p) { p.x = nx; p.y = ny; } else { p[0] = nx; p[1] = ny; }
                            }
                        }
                    }
                    return true;
                };

                applyScale(scale);

                Shape._attachBBoxMethods(shape);
                const nx1 = shape.getX(), ny1 = shape.getY();
                const nx2 = shape.getXf(), ny2 = shape.getYf();
                if (![nx1, ny1, nx2, ny2].every(v => typeof v === "number" && Number.isFinite(v))) return;

                const nminX = Math.min(nx1, nx2), nmaxX = Math.max(nx1, nx2);
                const nminY = Math.min(ny1, ny2), nmaxY = Math.max(ny1, ny2);
                const ncx = (nminX + nmaxX) * 0.5;
                const ncy = (nminY + nmaxY) * 0.5;

                const dx = wxCenter - ncx;
                const dy = wyCenter - ncy;

                const applyTranslate = (tx, ty) => {
                    if (typeof shape.translate === "function") {
                        shape.translate(tx, ty);
                        return true;
                    }
                    if (typeof shape.moveBy === "function") {
                        shape.moveBy(tx, ty);
                        return true;
                    }

                    if (typeof shape.x === "number") shape.x += tx;
                    if (typeof shape.y === "number") shape.y += ty;

                    if (Array.isArray(shape.points)) {
                        for (const p of shape.points) {
                            if (!p) continue;
                            if ("x" in p && "y" in p) { p.x += tx; p.y += ty; }
                            else if (Array.isArray(p) && p.length >= 2) { p[0] += tx; p[1] += ty; }
                        }
                    }

                    if (Array.isArray(shape.shapes)) {
                        for (const child of shape.shapes) {
                            if (!child) continue;
                            Shape._attachBBoxMethods(child);
                            if (typeof child.translate === "function") child.translate(tx, ty);
                            else {
                                if (typeof child.x === "number") child.x += tx;
                                if (typeof child.y === "number") child.y += ty;
                            }
                        }
                    }
                    return true;
                };

                applyTranslate(dx, dy);

                this.glyphs.push(glyph);
            }
            addAllRelativeToCenter(items) {
                const isNum = v => typeof v === 'number' && Number.isFinite(v);
                const local = t => String(t || '').toLowerCase();

                const getViewportCenterWorld = () => {
                    const w = this.grid.width;
                    const h = this.grid.height;
                    const sx = w / 2;
                    const sy = h / 2;

                    const cxw = this.grid.Xwc(sx);
                    const cyw = this.grid.Ywc(sy);

                    return { cxw, cyw };
                };

                const getShapesFromItem = (item) => {
                    if (!item) return [];

                    if (item.shape) return [item.shape];
                    if (Array.isArray(item.shapes)) return item.shapes;
                    if (Array.isArray(item.items)) return item.items;

                    if (item.type && (("x" in item) || ("cx" in item) || ("pts" in item) || ("shapes" in item))) return [item];
                    return [];
                };

                const walkShape = (shape, fn) => {
                    if (!shape) return;
                    const t = local(shape.type);

                    if (t === "svg_group" || t === "group" || Array.isArray(shape.shapes)) {
                        const kids = Array.isArray(shape.shapes) ? shape.shapes : [];
                        for (const ch of kids) walkShape(ch, fn);
                        return;
                    }
                    fn(shape);
                };

                const shiftShapePoints = (shape, dx, dy) => {
                    if (!shape) return;

                    if (typeof shape.translate === "function") {
                        shape.translate(dx, dy);
                        return;
                    }

                    const add = (obj, key, d) => { if (isNum(obj[key])) obj[key] += d; };

                    if ("x" in shape) add(shape, "x", dx);
                    if ("y" in shape) add(shape, "y", dy);

                    if ("cx" in shape) add(shape, "cx", dx);
                    if ("cy" in shape) add(shape, "cy", dy);

                    if ("x1" in shape) add(shape, "x1", dx);
                    if ("y1" in shape) add(shape, "y1", dy);
                    if ("x2" in shape) add(shape, "x2", dx);
                    if ("y2" in shape) add(shape, "y2", dy);

                    if (Array.isArray(shape.pts)) {
                        for (const p of shape.pts) {
                            if (!p) continue;
                            if (Array.isArray(p) && p.length >= 2) {
                                if (isNum(p[0])) p[0] += dx;
                                if (isNum(p[1])) p[1] += dy;
                            } else if (typeof p === "object") {
                                if ("x" in p && isNum(p.x)) p.x += dx;
                                if ("y" in p && isNum(p.y)) p.y += dy;
                            }
                        }
                    }

                    const shiftPointObj = (pt) => {
                        if (!pt) return;
                        if ("x" in pt && isNum(pt.x)) pt.x += dx;
                        if ("y" in pt && isNum(pt.y)) pt.y += dy;
                        if ("X" in pt && isNum(pt.X)) pt.X += dx;
                        if ("Y" in pt && isNum(pt.Y)) pt.Y += dy;
                    };

                    if (Array.isArray(shape.path)) {
                        for (const pt of shape.path) {
                            if (Array.isArray(pt) && pt.length >= 2) {
                                if (isNum(pt[0])) pt[0] += dx;
                                if (isNum(pt[1])) pt[1] += dy;
                            } else if (typeof pt === "object") {
                                shiftPointObj(pt);
                            }
                        }
                    }

                    if (Array.isArray(shape.d)) {
                        for (const cmd of shape.d) {
                            if (!cmd) continue;

                            shiftPointObj(cmd);
                            if ("x1" in cmd) add(cmd, "x1", dx);
                            if ("y1" in cmd) add(cmd, "y1", dy);
                            if ("x2" in cmd) add(cmd, "x2", dx);
                            if ("y2" in cmd) add(cmd, "y2", dy);
                        }
                    }
                };

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                const expand = (x, y) => {
                    if (!isNum(x) || !isNum(y)) return;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                };

                const bboxForShape = (shape) => {
                    if (!shape) return;

                    const t = local(shape.type);

                    if (t === "rect" && isNum(shape.x) && isNum(shape.y) && isNum(shape.w ?? shape.width) && isNum(shape.h ?? shape.height)) {
                        const w = shape.w ?? shape.width;
                        const h = shape.h ?? shape.height;
                        expand(shape.x, shape.y);
                        expand(shape.x + w, shape.y + h);
                        return;
                    }

                    if (t === "circle" && isNum(shape.cx) && isNum(shape.cy) && isNum(shape.r)) {
                        expand(shape.cx - shape.r, shape.cy - shape.r);
                        expand(shape.cx + shape.r, shape.cy + shape.r);
                        return;
                    }

                    if (t === "ellipse" && isNum(shape.cx) && isNum(shape.cy) && isNum(shape.rx) && isNum(shape.ry)) {
                        expand(shape.cx - shape.rx, shape.cy - shape.ry);
                        expand(shape.cx + shape.rx, shape.cy + shape.ry);
                        return;
                    }

                    if (t === "line" && isNum(shape.x1) && isNum(shape.y1) && isNum(shape.x2) && isNum(shape.y2)) {
                        expand(shape.x1, shape.y1);
                        expand(shape.x2, shape.y2);
                        return;
                    }

                    if ((t === "polyline" || t === "polygon") && Array.isArray(shape.pts)) {
                        for (const p of shape.pts) {
                            if (!p) continue;
                            const x = Array.isArray(p) ? p[0] : p.x;
                            const y = Array.isArray(p) ? p[1] : p.y;
                            expand(x, y);
                        }
                        return;
                    }

                    if (isNum(shape.x) && isNum(shape.y)) expand(shape.x, shape.y);
                    if (isNum(shape.cx) && isNum(shape.cy)) expand(shape.cx, shape.cy);
                    if (isNum(shape.x1) && isNum(shape.y1)) expand(shape.x1, shape.y1);
                    if (isNum(shape.x2) && isNum(shape.y2)) expand(shape.x2, shape.y2);

                    if (Array.isArray(shape.path)) {
                        for (const p of shape.path) {
                            if (!p) continue;
                            const x = Array.isArray(p) ? p[0] : p.x;
                            const y = Array.isArray(p) ? p[1] : p.y;
                            expand(x, y);
                        }
                    }
                    if (Array.isArray(shape.d)) {
                        for (const cmd of shape.d) {
                            if (!cmd) continue;
                            if (isNum(cmd.x) && isNum(cmd.y)) expand(cmd.x, cmd.y);
                            if (isNum(cmd.x1) && isNum(cmd.y1)) expand(cmd.x1, cmd.y1);
                            if (isNum(cmd.x2) && isNum(cmd.y2)) expand(cmd.x2, cmd.y2);
                        }
                    }
                };

                for (const item of (items || [])) {
                    const shapes = getShapesFromItem(item);
                    for (const s of shapes) {
                        walkShape(s, bboxForShape);
                    }
                }

                if (minX === Infinity) {
                    for (const i of (items || [])) this.glyphs.push(i);
                    return items;
                }

                const itemsCenterX = (minX + maxX) / 2;
                const itemsCenterY = (minY + maxY) / 2;

                const center = getViewportCenterWorld();
                const dx = (center.cxw - itemsCenterX);
                const dy = (center.cyw - itemsCenterY);

                for (const item of (items || [])) {
                    const shapes = getShapesFromItem(item);
                    for (const s of shapes) {
                        walkShape(s, (leaf) => shiftShapePoints(leaf, dx, dy));
                    }
                }

                for (const i of (items || [])) {
                    this.glyphs.push(i);
                }
                return items;
            }

            setBookmark(name) {
                if (!name || name.length === 0) {
                    this.bookmarks[`${generateNautName()}`] = Object.assign(new MGrid(), this.grid)
                } else {
                    this.bookmarks[`${name}`] = Object.assign(new MGrid(), this.grid)

                }
            }

            pushGrid() {
                if (!this.__stack) {
                    this.__stack = []
                }
                if (this.__stack) {
                    this.__stack.push(JSON.parse(JSON.stringify(this.grid)));
                    this.__redostack = [];
                    if (this.__stack.length > 10) {
                        this.__stack.shift();
                    }
                    this.buildMenu();
                }

            }

            touchStart = (evt) => {
                const touch = evt.changedTouches[0];
                const screenX = touch.screenX;
                const screenY = touch.screenY;
                this.mouseDown(screenX, screenY)
            }
            touchEnd = (evt) => {
                const touch = evt.changedTouches[0];
                const screenX = touch.screenX;
                const screenY = touch.screenY;
                this.mouseUp(screenX, screenY)
            }
            touchMove = (evt) => {
                const touch = evt.changedTouches[0];
                const screenX = touch.screenX;
                const screenY = touch.screenY;
                this.mouseMove(screenX, screenY)
            }

            hasModalMenusOpen() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);
                allDrawables.sort((a, b) => a.getLastTouched() - b.getLastTouched());
                for (let i = allDrawables.length - 1; i >= 0; i--) {
                    const obj = allDrawables[i];
                    if (obj.isModal && obj.isModal(this)) {
                        return true;
                    }
                }
                return false;
            }

            resetObjs() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);
                allDrawables.sort((a, b) => a.getLastTouched() - b.getLastTouched());
                for (let i = allDrawables.length - 1; i >= 0; i--) {
                    const obj = allDrawables[i];
                    obj.__resizing = false;
                    if (obj.closeMenu) {
                        obj.closeMenu();
                    }
                    if (obj.unModal) {
                        obj.unModal();
                    }
                }
                return null;
            }

            onResizeLocation(scx, scy) {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                allDrawables.sort((a, b) => a.getLastTouched() - b.getLastTouched());

                allDrawables.sort((a, b) => {
                    const aBg = a.isBackground ? 1 : 0;
                    const bBg = b.isBackground ? 1 : 0;
                    return aBg - bBg;
                });

                for (let i = allDrawables.length - 1; i >= 0; i--) {
                    const obj = allDrawables[i];
                    if (obj && obj.inResize && obj.inResize(scx, scy, this)) {
                        return obj;
                    }
                }

                return null;
            }
            getTableNames() {
                const namesArray = this.root.map(obj => obj.name);
                return namesArray;

            }

            getTablesAndTagNames() {
                const plates = Array.isArray(this.root) ? this.root : [];
                const namesArray = plates
                    .map(p => (p?.name ?? '').toString().trim())
                    .filter(Boolean);
                const seen = new Set(namesArray);
                for (const plate of plates) {
                    if (plate.getGroupKeys) {
                        const keys = plate.getGroupKeys() || [];
                        for (const k of keys) {
                            const t = (k ?? '').toString().trim();
                            if (t && !seen.has(t)) {
                                namesArray.push(t);
                                seen.add(t);
                            }
                        }
                    }
                }
                return namesArray;
            }

            collectGroupKeysFromPlate(plate) {
                const keys = new Set();
                const wells = plate?.wells ?? [];
                for (let c = 0; c < wells.length; c++) {
                    const col = wells[c]; if (!col) continue;
                    for (let r = 0; r < col.length; r++) {
                        const g = col[r]?.group; if (!g) continue;
                        if (typeof g === 'string') { const s = g.trim(); if (s) keys.add(s); }
                        else if (Array.isArray(g)) for (const v of g) if (typeof v === 'string' && v.trim()) keys.add(v.trim());
                        else if (typeof g === 'object') for (const k of Object.keys(g)) { const t = k.trim(); if (t) keys.add(t); }
                    }
                }
                return [...keys];
            }

            setNextToPlate(ch, chn, _y) {
                ch.grid.xi = chn.grid.xi + chn.grid.width + this.grid.worldWidth(100);
                ch.x = ch.grid.xi;
                if (_y)
                    ch.grid.yi = _y;
                else
                    ch.grid.yi = chn.grid.yi + chn.grid.height - ch.grid.height;
                ch.y = ch.grid.yi
            }
            onButtonClick(label) {
                switch (label) {
                    case "Exit Folder":

                        this.popFolder();
                        break;
                    case "Settings":
                        console.log("Settings button clicked");
                        break;
                    case "Profile":
                        console.log("Profile button clicked");
                        break;
                    case "Logout":
                        console.log("Logout button clicked");
                        break;
                    default:
                        console.log("Unknown button clicked");
                }
            }

            sortToBottom(selectedPlate) {
                if (!this.root || !Array.isArray(this.root)) return;

                this.root = this.root.sort((a, b) => {
                    if (a === selectedPlate) return 1;
                    if (b === selectedPlate) return -1;
                    return 0;
                });
                this.setSelected(null);
                this.deselectAll();
            }

            __no_widgets_zone = false;

            getActionGlyphFromMouseClick(x, y) {
                for (let a of this.actionGlyph) {
                    if (a && a.inside(this.grid, (x), (y))) {
                        return a;
                    }
                }
                return null

            }

            mouseDownViewerMode(x, y) {

                if (textActive) {
                    textActive = false;
                }
                for (let a of this.actionGlyph) {
                    if (a && a.inside(this.grid, (x), (y))) {
                        if (a.action) {
                            a.action(this)
                        }
                        return;
                    }
                }

                if (!isMobile() && scrollGrid && scrollGrid.heigtht > 0 && scrollGrid.width > 0) {
                    if (x >= scrollGrid.xi) {
                        this.isDraggingScrollbar = true;
                        scrollGrid.rescale();
                        scroll_y = scrollGrid.Ywc(y);
                        let range = (this.grid.ymax - this.grid.ymin);
                        this.grid.ymax = scroll_y + range / 2;
                        this.grid.ymin = scroll_y - range / 2;
                        if (this.grid.xmin > maxObjectX || this.grid.xmin > maxObjectX) {
                        }
                        return this.grid.rescale();
                    }
                }
                const pwx = this.grid.Xwc(x)
                const pwy = this.grid.Ywc(y)
                if (this.menu || this.__menu__ || this.hasModalMenusOpen()) {
                    return;
                }

                if (this.selectedPlate && this.selectedPlate.inButtons && this.selectedPlate.inButtons(x, y, this)) {
                    return;
                }

                if (this.wbid === null || !this.wbid.startsWith('glyph')) {
                    let gfs = this.getGlyph(x, y)
                    if (gfs) {
                        const alreadySelected =
                            Array.isArray(selected_glyphs) &&
                            selected_glyphs.includes(gfs);
                        if (!alreadySelected) {
                            selected_glyphs = []
                            this.selectGlyph__(gfs);
                            this.clearActionGlyphs();

                        }
                    } else {
                        selected_glyphs = []
                    }
                }
                let new_selected = this.getPlate(this.grid.Xwc(x), this.grid.Ywc(y))
                if (!new_selected && !this.selectedPlate) {
                    this.deselectAll()

                    return;
                }

                if (!this.selectedPlate) {
                    this.setSelected(new_selected)
                }
                else
                    if (new_selected && new_selected != this.selectedPlate) {
                        if (this.selectedPlate && this.selectedPlate.deselectAll) {
                            this.selectedPlate.deselectAll();
                        }
                        this.setSelected(new_selected)
                        this.selectedPlate.last_touched = new Date();
                        return;
                    }
                    else if (new_selected === this.selectedPlate) {
                        if (this.selectedPlate && this.selectedPlate.clk_drag) {
                            if (this.selectedPlate.deselectAll) {

                            }
                        }
                    }
                if (!new_selected) {
                    this.__no_widgets_zone = true;
                    if (this.selectedPlate && this.selectedPlate.deselectAll) {
                        this.selectedPlate.deselectAll();
                    }

                }

            }

            isGlyphSelected() {
                if (selected_glyphs && selected_glyphs.length > 0) {
                    return true;
                }
                return false;
            }
            keydown(event) {
                if (!event) return;



                if (event.ctrlKey) {
                    return;
                }






                const canvas = this.__canvas__;
                if (!canvas.hasFocus()) {
                    return
                }




                const collectTextShapes = (shape, out = []) => {
                    if (!shape) return out;

                    if (String(shape.type).toLowerCase() === 'svg_group' && Array.isArray(shape.shapes)) {
                        for (const child of shape.shapes) collectTextShapes(child, out);
                        return out;
                    }

                    if (String(shape.type).toLowerCase() === 'text' && ('text' in shape)) {
                        out.push(shape);
                    }

                    return out;
                };

                const targetTextShapes = [];
                for (const g of selected_glyphs) {
                    const s = g && g.shape;
                    collectTextShapes(s, targetTextShapes);
                }

                if (!targetTextShapes.length) return;

                if (!this._textEditOriginals) this._textEditOriginals = new Map();
                for (const s of targetTextShapes) {
                    if (!this._textEditOriginals.has(s)) {
                        this._textEditOriginals.set(s, String(s.text ?? ''));
                    }
                }

                const applyToTargets = (fn) => {
                    for (const s of targetTextShapes) {
                        s.text = fn(String(s.text ?? ''));

                        s._bbox = null;
                        s._bboxCache = null;
                    }
                };

                const k = event.key;


                if (k === 'Escape') {
                    for (const s of targetTextShapes) {
                        if (this._textEditOriginals.has(s)) {
                            s.text = this._textEditOriginals.get(s);
                        }
                        s._bbox = null;
                        s._bboxCache = null;
                    }
                    this._textEditOriginals.clear();
                    event.preventDefault();
                } else if (k === 'Backspace') {
                    applyToTargets(t => t.slice(0, -1));
                    event.preventDefault();
                } else if (k === 'Delete') {
                    applyToTargets(_ => '');
                    event.preventDefault();
                } else if (k === 'Enter') {

                    this._textEditOriginals.clear();
                    event.preventDefault();
                } else if (k === 'Tab') {
                    applyToTargets(t => t + '\t');
                    event.preventDefault();
                } else if (k && k.length === 1) {
                    applyToTargets(t => t + k);
                    event.preventDefault();
                } else {
                    return;
                }
            }

            mouseDown(x, y) {




                const xwc = this.grid.Xwc(x);
                const ywc = this.grid.Ywc(y);



                if (this.___imageCaptureRect && this.___imageCaptureRect.inside(x, y)) {
                    this.addActionGlyph(this, "Options...", () => {
                        this.showMenuOptionsForImageExport();
                    });
                }
                if (this.side_menu && this.side_menu.isIn(this.grid, xwc, ywc)) {
                    this.side_menu.mouseUp(this.grid, xwc, ywc)
                    this.updateCalculations();
                    return;
                }

                if (this.menu) {
                    return;
                }
                if (this.options_menu) {
                    this.options_menu.mouseUp(this.grid, xwc, ywc)
                    this.options_menu = null;
                    return;
                }

                let g = this.getGlyph(x, y);
                if (g && g.action) {
                    g.action(this)
                    return;
                }
                if (textActive) {
                    textActive = false;
                }
                for (let a of this.actionGlyph) {
                    if (a && a.inside(this.grid, (x), (y))) {
                        if (a.action) {
                            setTimeout(() => {
                                a.action(this)

                            }, 1000)
                        }
                        return;
                    }
                }
                if (!isMobile() && this.attr__showScrollbar && scrollGrid && scrollGrid.height > 0) {
                    if (x >= scrollGrid.xi) {
                        this.isDraggingScrollbar = true;
                        scrollGrid.rescale();
                        scroll_y = scrollGrid.Ywc(y);
                        let range = (this.grid.ymax - this.grid.ymin);
                        this.grid.ymax = scroll_y + range / 2;
                        this.grid.ymin = scroll_y - range / 2;
                        if (this.grid.xmin > maxObjectX || this.grid.xmin > maxObjectX) {
                        }
                        return this.grid.rescale();
                    }
                }
                if (this.selectedPlate && this.selectedPlate.inButtons && this.selectedPlate.inButtons(x, y, this)) {






                } else {
                    if (this.wbid === null || !this.wbid.startsWith('glyph')) {
                        let gfs = this.getGlyph(x, y)
                        if (gfs) {
                            this.selectGlyph__(gfs);
                            // setTimeout(() => {
                            //     this.appendNucleotideToAllGlyphs(gfs, createNucleotide);
                            // }, 2000)
                        }
                    }



                    let new_selected = this.getPlate(this.grid.Xwc(x), this.grid.Ywc(y))
                    if (!new_selected && !this.selectedPlate) {
                        this.deselectAll()
                        return;
                    }
                    if (!this.selectedPlate) {
                        this.setSelected(new_selected)
                    }
                    else
                        if (new_selected && new_selected != this.selectedPlate) {
                            if (this.selectedPlate && this.selectedPlate.deselectAll) {
                                this.selectedPlate.deselectAll();
                            }
                            this.setSelected(new_selected)
                            this.selectedPlate.last_touched = new Date();
                            return;
                        }
                        else if (new_selected === this.selectedPlate) {
                            if (this.selectedPlate && this.selectedPlate.clk_drag) {
                                if (this.selectedPlate.deselectAll) {

                                }
                            }
                        }
                    if (!new_selected) {
                        this.__no_widgets_zone = true;
                        if (this.selectedPlate && this.selectedPlate.deselectAll) {
                            // this.selectedPlate.deselectAll();
                        }

                    }
                }
            }

            getGlyph(x, y) {
                for (let i = this.glyphs.length - 1; i >= 0; i--) {
                    const glyph = this.glyphs[i];
                    if (isInGlyph(x, y, glyph, this.grid)) {
                        return glyph;
                    }
                }
                return null;
            }

            saveLJLBookmark(name, value) {
                this.ljl_bookmarks[name] = value;
            }

            isInAnyMenu(x, y) {
                const gridX = this.grid.Xwc(x);
                const gridY = this.grid.Ywc(y);
                if (this.attr__displayBookMarks) {
                    if (
                        this.__bookmark_menu &&
                        this.__bookmark_menu.isIn &&
                        this.__bookmark_menu.isIn(this.grid, gridX, gridY)
                    ) {
                        return 'bookmark';
                    }
                }

                if (this.attr__showTablesMenu && !this.attr__displayBookMarks && !isMobile()) {
                    if (
                        this.__tables_menu &&
                        this.__tables_menu.isIn &&
                        this.__tables_menu.isIn(this.grid, gridX, gridY)
                    ) {
                        return 'tables';
                    }
                }

                return null;
            }

            mouseUp(x, y) {
                if (isMobile()) {
                    return;
                }

                if (this.menu && this.menu_vis) {
                    this.menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    this.updateCalculations();
                    this.menu = null;
                    this.menu_vis = false;
                    return;
                }
                this.isDraggingScrollbar = false;
                if (this.attr__displayBookMarks) {
                    if (this.__bookmark_menu && this.__bookmark_menu.mouseUp && this.__bookmark_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        this.__bookmark_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                        this.menu_vis = false;
                        return;
                    }
                }
                if (this.attr__showTablesMenu && !this.attr__displayBookMarks && !isMobile()) {
                    if (this.__tables_menu && this.__tables_menu.mouseUp && this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        this.__tables_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                        this.menu_vis = false;

                        return;
                    }
                }
                let g = this.getGlyph(x, y);
                if (g && g.action) {
                    return;
                }

                if (!isMobile()) {
                    if (this.__tables_menu && this.__tables_menu.mouseUp && this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        this.menu_vis = false;

                        return;
                    }
                }
                if (this.wbid != null && this.wbid.startsWith('override'))
                    return;
                if (this.wbid != null && this.wbid.startsWith('glyph'))
                    return;

                const mmx = this.grid.Xwc(x)
                const mmy = this.grid.Ywc(y)
                let new_selected = this.getPlate(mmx, mmy)
                if (!new_selected && this.__no_widgets_zone) {
                    this.wb(null)
                    this.showMenu(null)
                    this.deselectAll()




                    return;
                }
            }

            handleKeyDown(event) {
                // Ignore Ctrl+Z (and Cmd+Z on Mac if you want)
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
                    this.selectedPlate.copyValues();
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
                    return;
                }

                if (this.selectedPlate && this.selectedPlate.handleKeyDown) {
                    this.selectedPlate.handleKeyDown(this, event);
                }
            }
            setTextActive(va) {
                textActive = va;
            }

            IsInTableMenu(x, y) {
                if (!this.__tables_menu) {
                    return false;
                }

                return this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
            }

            isCanvasVisible() {
                const canvas = this.__canvas__;
                if (!canvas) return false;

                const style = getComputedStyle(canvas);
                return (
                    canvas.isConnected &&
                    canvas.offsetParent !== null &&
                    style.visibility !== 'hidden' &&
                    style.display !== 'none'
                );
            }




            buildBookmarkMenu() {
                let ml = []
                let keys = Object.keys(this.bookmarks);
                for (let key of keys) {
                    ml.push({
                        label: `${key}`,
                        click: (xwc, ywc) => {

                            this.setMessage(key)
                            this.goToBookmark(this.bookmarks[key])

                        }
                    })
                }
                let cols = Math.ceil(ml.length / 20);
                this.__bookmark_menu = new Menu(ml, 0, 60, 'rgb(205, 255, 155)', 'navy', cols)
            }






            showSideMenu(list) {
                if (!list) {
                    this.side_menu = null;
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

                    const screen_width = this?.grid?.width ?? window.innerWidth ?? 800;
                    const screen_height = this?.grid?.height ?? window.innerHeight ?? 600;
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
                                ...safeList.map(item => ctx.measureText(getItemLabel(item)).width),
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


                    this.side_menu = new Menu(
                        safeList,
                        this.grid.Xwc(10),
                        this.grid.Ywc(10),
                        bg,
                        fg,
                        cols
                    );

                    this.side_menu.menu_width = menuWidth;
                }, 300);
            }





            showBookmarks() {
                let ml = []
                let keys = Object.keys(this.bookmarks);
                for (let key of keys) {
                    ml.push({
                        label: `${key}`,
                        click: (xwc, ywc) => {

                            this.setMessage(key)
                            this.goToBookmark(this.bookmarks[key])

                        }
                    })
                }
                ml.push({
                    label: `New bookmark...`,
                    click: async (xwc, ywc) => {
                        let attr_window = ''
                        let va = await prompt("Name", ["Bookmark name"], { "Bookmark name": attr_window }, 300, 300)
                        let m = va['Bookmark name']
                        this.setBookmark(m);

                    },
                    bg: 'orange',
                    fg: 'black'
                })
                ml.push({
                    label: this.attr__displayBookMarks ? 'Hide bookmarks on canvas' : 'Show bookmarks on canvas',
                    click: (xwc, ywc) => {
                        this.attr__displayBookMarks = !this.attr__displayBookMarks;
                    },
                    bg: 'orange',
                    fg: 'black'
                });

                ml.push({
                    label: `Delete bookmarks...`,
                    click: async (xwc, ywc) => {

                        setTimeout(async () => {
                            let ml = []
                            let keys = Object.keys(this.bookmarks);
                            for (let key of keys) {
                                ml.push({
                                    label: `${key}`,
                                    click: async (xwc, ywc) => {
                                        let confirm = await exec('baja/lib/confirm.js', 'Delete this bookmark?', async () => {
                                            delete this.bookmarks[key]
                                            setTimeout(() => {

                                                this.showBookmarks();

                                            }, 500)
                                        })
                                        showModal(confirm)

                                    },
                                    bg: 'lightRed',
                                    fg: 'black'
                                })
                            }
                            ml.push({
                                label: `Back to bookmarks`,
                                click: (xwc, ywc) => {
                                    this.showBookmarks();
                                }
                            })

                            let cols = Math.ceil(ml.length / 10);
                            this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                            this.menu.title = "Delete bookmark..."
                            this.menu_vis = true;
                        }, 100)

                    },
                    bg: 'orange',
                    fg: 'black'

                })

                ml.push({
                    label: `Delete all bookmarks...`,
                    click: async (xwc, ywc) => {

                        let confirm = await exec('baja/lib/confirm.js', 'Delete all bookmarks?', async () => {
                            setTimeout(async () => {
                                let ml = []
                                this.bookmarks = {}
                            }, 500)
                        })
                        showModal(confirm)

                    },
                    bg: 'orange',
                    fg: 'black'

                })
                let cols = Math.ceil(ml.length / 20);
                let graph = CurrentLayout.getStashed('graph')
                graph.showWindowMenu(ml, 10, 10, 400)

            }

            showViews() {
                let ml = []
                for (let key of this.ptracks) {
                    ml.push({
                        label: `${key.name}`,
                        click: (xwc, ywc) => {
                        },
                        bg: 'orange',
                        fg: 'black'

                    })
                }
                let cols = Math.ceil(ml.length / 20);
                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                this.menu.title = "Views..."
                this.menu_vis = true;

            }

            showYinYang() {
                let ml = []
                let keys = Object.keys(this.ljl_bookmarks);
                for (let key of keys) {
                    ml.push({
                        label: `${key}`,
                        click: async (xwc, ywc) => {
                            this.setMessage(key)
                            let code = this.ljl_bookmarks[key]
                            let interpreter = await exec('baja/engine/interpreter.js', this)
                            await interpreter.run(code);
                        }
                    })
                }

                if (this.ljl_bookmarks && Object.keys(this.ljl_bookmarks).length > 0) {
                    ml.push({
                        label: `Delete LJScript...`,
                        click: async (xwc, ywc) => {

                            setTimeout(async () => {
                                let ml = []
                                let keys = Object.keys(this.ljl_bookmarks);
                                for (let key of keys) {
                                    ml.push({
                                        label: `${key}`,
                                        click: async (xwc, ywc) => {
                                            let confirm = await exec('baja/lib/confirm.js', 'Delete this bookmark?', async () => {
                                                delete this.ljl_bookmarks[key]
                                                setTimeout(() => {

                                                    this.showBookmarks();

                                                }, 500)
                                            })
                                            showModal(confirm)

                                        },
                                        bg: 'lightRed',
                                        fg: 'black'
                                    })
                                }
                                ml.push({
                                    label: `Back to LJScript`,
                                    click: (xwc, ywc) => {
                                        this.showYinYang();
                                    }
                                })
                                let cols = Math.ceil(ml.length / 10);
                                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                                this.menu.title = "Delete bookmark..."
                                this.menu_vis = true;
                            }, 100)

                        },
                        bg: 'orange',
                        fg: 'black'

                    })
                    ml.push({
                        label: `Edit LJScript...`,
                        click: async (xwc, ywc) => {

                            setTimeout(async () => {
                                let ml = []
                                let keys = Object.keys(this.ljl_bookmarks);
                                for (let key of keys) {
                                    ml.push({
                                        label: `${key}`,
                                        click: async (xwc, ywc) => {
                                            setTimeout(async () => {

                                                let ref = null;

                                                let t =
                                                {
                                                    height: '200px',
                                                    editorOptions: {
                                                        language: 'bajabio',
                                                        value: "Enter LJ-script here",
                                                        theme: 'no-border-theme',
                                                        minimap: { enabled: false },
                                                        scrollbar: {
                                                            vertical: 'hidden',
                                                            horizontal: 'hidden',
                                                        },
                                                        lineNumbers: 'off',
                                                        lineDecorationsWidth: 0,
                                                        lineNumbersMinChars: 0,
                                                        overviewRulerLanes: 0,
                                                        hideCursorInOverviewRuler: true,
                                                        folding: false,
                                                        highlightActiveIndentGuide: false,
                                                        renderLineHighlight: 'none',
                                                        renderLineHighlightOnlyWhenFocus: false,
                                                        renderWhitespace: 'none',
                                                        fontSize: 15,
                                                        automaticLayout: true,
                                                        padding: {
                                                            top: 20,
                                                            bottom: 20,
                                                            left: 30,
                                                            right: 30
                                                        }
                                                    },
                                                    objects: this.root,
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                                        })
                                                    },
                                                    code: this.ljl_bookmarks[key],
                                                    buttons: [{
                                                        'label': 'Save', "color": 'blue', action: async () => {
                                                            let code = ref.getEditorText();
                                                            this.ljl_bookmarks[key] = code;
                                                        }
                                                    },
                                                    {
                                                        'label': 'Close', 'color': 'black', "action": () => {
                                                            ref.hideEditor();
                                                        }
                                                    }
                                                    ]
                                                }
                                                ref = await this.showTextEditor(t);

                                            }, 500)

                                        },
                                        bg: 'lightRed',
                                        fg: 'black'
                                    })
                                }
                                let cols = Math.ceil(ml.length / 10);
                                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                                this.menu.title = "Delete bookmark..."
                                this.menu_vis = true;
                            }, 100)

                        },
                        bg: 'orange',
                        fg: 'black'

                    })

                }

                ml.push({
                    label: `New LJScript...`,
                    click: async (xwc, ywc) => {
                        await exec('baja/table/show-flow-editor')
                    },
                    bg: 'orange',
                    fg: 'black'

                })
                ml.push({
                    label: `LJScript Library`,
                    click: async (xwc, ywc) => {
                        await exec('baja/table/show-ljscript-library', null, this)
                    },
                    bg: 'orange',
                    fg: 'black'

                })

                let cols = Math.ceil(ml.length / 20);
                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                this.menu.title = "Execute LJScript..."
                this.menu_vis = true;

            }

            displayOpsMenu() {
                let ml = []
                ml.push({
                    label: ``,
                    click: (xwc, ywc) => {
                        this.undo()
                    }
                })
                this.menu = new Menu(ml, this.grid.Xwc(10), this.grid.Ywc(20), 'rgb(0, 87, 163)', 'black')
            }

            mouseMove(x, y) {
                if (!isMobile() && this.attr__showScrollbar && scrollGrid && scrollGrid.height > 0) {
                    if (this.isDraggingScrollbar) {
                        scrollGrid.rescale();
                        scroll_y = scrollGrid.Ywc(y);
                        let range = (this.grid.ymax - this.grid.ymin);
                        this.grid.ymax = scroll_y + range / 2;
                        this.grid.ymin = scroll_y - range / 2;
                        this.grid.rescale();
                        return;
                    }
                }
                if (this.menu && this.menu.mouseMove) {
                    this.menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    return;
                }
                if (this.options_menu && this.options_menu.mouseMove) {
                    this.options_menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    return;
                }

                if (this.__stack_menu && this.__stack_menu.mouseMove) {
                    this.__stack_menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    return;
                }
                if (this.__redo_stack_menu && this.__redo_stack_menu.mouseMove) {
                    this.__redo_stack_menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    return;
                }
                if (this.attr__showTablesMenu) {
                    if (this.__tables_menu && this.__tables_menu.mouseMove) {
                        this.__tables_menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    }
                }

                let g = this.getGlyph(x, y);
                if (g && g.action) {
                    g.action(this)
                }

                if (this.selectedPlate && this.selectedPlate.inButtons && this.selectedPlate.inButtons(x, y, this)) {
                    return;
                }

                const pwx = this.grid.Xwc(x)
                const pwy = this.grid.Ywc(y)
                let obj = this.onResizeLocation(x, y);
                if (obj) {
                    obj.__resizing = true;
                }
                if (this.selectedPlate && this.selectedPlate.inside &&
                    (this.selectedPlate.inside(this.grid, pwx, pwy))) {
                    if (this.selectedPlate.selectIt) {
                    }
                    return;
                }
                if (this.selectedPlate && this.selectedPlate.__resizing) {
                    return;
                }

                if (this.selectedPlate && this.selectedPlate.__moving) {
                    return;
                }

                if (this.wb && this.wb.priority) {
                    return;
                }

                if (this.selectedPlate && this.selectedPlate.handleMouseOver) {
                    this.selectedPlate.handleMouseOver(x, y, this)
                }
            }
            getWellByUID(uid) {
                for (let r of this.root) {
                    let w = r.getWellByUID(uid)
                    if (w) {
                        return w;
                    }
                }
                return null;
            }

            getImage(capturePlate, scx, scy, screenwidth, screenheight) {

                return new Promise((resolve, reject) => {
                    try {
                        let offscreenCanvas = document.createElement('canvas');
                        offscreenCanvas.width = this.grid.width;
                        offscreenCanvas.height = this.grid.height;
                        let offscreenCtx = offscreenCanvas.getContext('2d');
                        offscreenCtx.fillStyle = 'white';
                        offscreenCtx.fillRect(0, 0, this.grid.width, this.grid.height);
                        MGrid.GP = true;
                        for (let p of this.root) {
                            if (p !== capturePlate) {
                                p.draw(this, offscreenCtx);
                            }
                        }
                        let clippedCanvas = document.createElement('canvas');
                        clippedCanvas.width = screenwidth;
                        clippedCanvas.height = screenheight;
                        let clippedCtx = clippedCanvas.getContext('2d');
                        clippedCtx.drawImage(
                            offscreenCanvas,
                            scx, scy,
                            screenwidth, screenheight,
                            0, 0,
                            screenwidth, screenheight
                        );

                        let dataUrl = clippedCanvas.toDataURL('image/png');

                        let clippedImage = new Image();
                        clippedImage.onload = () => resolve(clippedImage);
                        clippedImage.onerror = (err) => reject(err);
                        clippedImage.src = dataUrl;
                        let stringData = dataUrl.replace(/^data:image\/png;base64,/, '');
                        resolve(stringData)

                    } catch (err) {
                        reject(err);
                    }

                });
            }

            set___selected_well_listener(stl) {
                this.___selected_well_listener = stl;
            }

            pushHistoryOnSelectedWell() {
                let id = this.selectedPlate.getWellIndicies(this.selected_well)
                LJScript.add(this.selectedPlate.name, `update ${id.colIdx},${id.rowIdx} ` + this.selected_well.value)
                pushHistory(HM(this.selected_well))
                this.selected_well.__dirty = false;
            }

            getTablesByName() {
                let n = {}
                for (let r of this.root) {
                    n[r.name] = r;
                }
                return n;
            }

            restoreState(state) {
                if (state) {
                    this.grid.xi = state.xi;
                    this.grid.yi = state.yi;
                    this.grid.width = state.width;
                    this.grid.height = state.height;
                    this.grid.xinset = state.xinset;
                    this.grid.yinset = state.yinset;
                    this.grid.xmin = state.xmin;
                    this.grid.ymin = state.ymin;
                    this.grid.xmax = state.xmax;
                    this.grid.ymax = state.ymax;
                    this.grid.xscale = state.xscale;
                    this.grid.yscale = state.yscale;
                    this.grid.xshift = state.xshift;
                    this.grid.yshift = state.yshift;
                    this.grid.rescale();
                }
            }

            restoreGrid(state) {
                if (state) {
                    this.grid.xi = state.xi;
                    this.grid.yi = state.yi;
                    this.grid.width = state.width;
                    this.grid.height = state.height;
                    this.grid.xinset = state.xinset;
                    this.grid.yinset = state.yinset;
                    this.grid.xmin = state.xmin;
                    this.grid.ymin = state.ymin;
                    this.grid.xmax = state.xmax;
                    this.grid.ymax = state.ymax;
                    this.grid.xscale = state.xscale;
                    this.grid.yscale = state.yscale;
                    this.grid.xshift = state.xshift;
                    this.grid.yshift = state.yshift;
                    this.grid.rescale();

                }
            }
            buildMenu() {
                let ml = []
                if (this.__stack.length > 0) {
                    ml.push({
                        label: ``,
                        click: (xwc, ywc) => {
                            this.undo()
                        }
                    })
                }

                let rl = []
                if (this.__redostack.length > 0) {
                    rl.push({
                        label: ``,
                        click: (xwc, ywc) => {
                            this.redo()
                        }
                    })
                }
                this.grid.rescale();

                if (this.__stack && this.__stack.length > 0) {
                    this.__stack_menu = new Menu(ml, this.grid.Xwc(10), this.grid.Ywc(20), 'rgb(0, 87, 163)', 'black')
                    this.__stack_menu.menu_type = 'xx-small-left'
                }
                if (this.__redostack && this.__redostack.length > 0) {
                    this.__redo_stack_menu = new Menu(rl, this.grid.Xwc(10), this.grid.Ywc(20), 'lightGray', 'black')
                    this.__redo_stack_menu.menu_type = 'xx-small-right'
                }

            }
            popGrid() {
                if (this.__stack.length > 0) {
                    this.restoreGrid(this.__stack.pop());
                }
                this.buildMenu();
                return null;
            }
            canUndo() {
                return this.__stack.length > 0;
            }
            canRedo() {
                return this.__redostack.length > 0;
            }

            redo() {
                if (this.canRedo()) {
                    const nextState = this.__redostack.pop();
                    this.__stack.push(JSON.parse(JSON.stringify(this.grid)));
                    this.restoreGrid(nextState);
                    this.buildMenu();
                }
            }

            undo() {
                if (this.canUndo()) {
                    const previousState = this.__stack.pop();
                    this.__redostack.push(JSON.parse(JSON.stringify(this.grid)));

                    this.restoreGrid(previousState);
                    this.buildMenu();

                }
            }
            getParentPlate(plate) {
                let parent = []
                for (let t of this.transferFunctions) {
                    if (t.toPlate === plate) {
                        parent.push(t.fromPlate)
                    }
                }
                return parent;
            }

            highlightObjects(obja) {
                for (let p of obja) {
                    if (p.xrefid) {
                        this.selectReference([p.xrefid])
                    }
                    if (p.yrefid) {
                        this.selectReference([p.yrefid])
                    }
                }
            }

            async goToBookmark(togrid) {
                if (togrid == null) {
                    console.log(' the goto grid is not defined ')
                    return;
                }
                if (togrid.xmax && !togrid.getxmax) {
                    togrid = Object.assign(new MGrid(), togrid)
                }
                return new Promise(async (resolve, reject) => {
                    let increment_ = 170;
                    let fromCx = (this.grid.getxmax() - this.grid.getxmin()) / 2;
                    let toCx = (togrid.getxmax() - togrid.getxmin()) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.grid.getxmax() - togrid.getxmax()) / increment_;
                    let translateMinX = (this.grid.getxmin() - togrid.getxmin()) / increment_;
                    let translateMaxY = (this.grid.getymax() - togrid.getymax()) / increment_;
                    let translateMinY = (this.grid.getymin() - togrid.getymin()) / increment_;
                    let yc = (this.grid.getymax() - this.grid.getymin()) / 2;
                    let ytc = (togrid.getymax() - togrid.getymin());
                    let ydif = ytc - yc;
                    let yincr = ydif / increment_;
                    for (let i = 0; i < increment_; i++) {
                        let max = this.grid.getxmax() - translateMaxX;
                        let min = this.grid.getxmin() - translateMinX;
                        if (max > min) {
                            this.grid.setxmin((min))
                            this.grid.setxmax((max))
                        } else {
                            this.grid.setxmin(togrid.getxmin());
                            this.grid.setxmax(togrid.getxmax());
                            i = increment_;
                        }

                        max = this.grid.getymax() - translateMaxY;
                        min = this.grid.getymin() - translateMinY;

                        if (max > min) {
                            this.grid.setymin(this.grid.getymin() - translateMinY)
                            this.grid.setymax(this.grid.getymax() - translateMaxY)
                        } else {
                            this.grid.setymin(togrid.getymin())
                            this.grid.setymax(togrid.getymax())
                            i = increment_;
                        }
                        this.grid.rescale();
                        await sleep(10)
                    }
                    this.grid.setxmin(togrid.getxmin());
                    this.grid.setxmax(togrid.getxmax());
                    this.grid.setymin(togrid.getymin())
                    this.grid.setymax(togrid.getymax())
                    this.grid.rescale();
                    return resolve();

                });

            }

            addConnection(connection) {
                this.connections.push(connection)
            }

            removeConnection(connection) {
                this.connections = this.connections.filter(conn => conn !== connection);
            }

            _____delprecated____attachBBoxMethods(shape) {
                if (!shape || shape._bboxAttached) return shape;
                shape._bboxAttached = true;

                const numOrNull = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

                if (typeof shape.getX !== 'function') {
                    shape.getX = function () {
                        if ('x' in this) return numOrNull(this.x) ?? 0;
                        if ('x1' in this && 'x2' in this) return Math.min(this.x1, this.x2);
                        if ('cx' in this && 'r' in this) return this.cx - this.r;
                        if ('cx' in this && 'rx' in this) return this.cx - this.rx;
                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) =>
                                m == null ? p.x : Math.min(m, p.x), null);
                        }
                        return 0;
                    };
                }

                if (typeof shape.getY !== 'function') {
                    shape.getY = function () {
                        if ('y' in this) return numOrNull(this.y) ?? 0;
                        if ('y1' in this && 'y2' in this) return Math.min(this.y1, this.y2);
                        if ('cy' in this && 'r' in this) return this.cy - this.r;
                        if ('cy' in this && 'ry' in this) return this.cy - this.ry;
                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) =>
                                m == null ? p.y : Math.min(m, p.y), null);
                        }
                        return 0;
                    };
                }

                if (typeof shape.getXf !== 'function') {
                    shape.getXf = function () {
                        if ('xf' in this) return numOrNull(this.xf) ?? (this.getX());
                        if ('x' in this && 'w' in this) return this.x + this.w;
                        if ('x1' in this && 'x2' in this) return Math.max(this.x1, this.x2);
                        if ('cx' in this && 'r' in this) return this.cx + this.r;
                        if ('cx' in this && 'rx' in this) return this.cx + this.rx;
                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) =>
                                m == null ? p.x : Math.max(m, p.x), null);
                        }
                        return this.getX();
                    };
                }

                if (typeof shape.getYf !== 'function') {
                    shape.getYf = function () {
                        if ('yf' in this) return numOrNull(this.yf) ?? (this.getY());
                        if ('y' in this && 'h' in this) return this.y + this.h;
                        if ('y1' in this && 'y2' in this) return Math.max(this.y1, this.y2);
                        if ('cy' in this && 'r' in this) return this.cy + this.r;
                        if ('cy' in this && 'ry' in this) return this.cy + this.ry;
                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) =>
                                m == null ? p.y : Math.max(m, p.y), null);
                        }
                        return this.getY();
                    };
                }

                if (typeof shape.setX !== 'function') {
                    shape.setX = function (newX) {
                        const dx = newX - this.getX();
                        Shape._translateShape(this, dx, 0);
                    };
                }

                if (typeof shape.setY !== 'function') {
                    shape.setY = function (newY) {
                        const dy = newY - this.getY();
                        Shape._translateShape(this, 0, dy);
                    };
                }

                if (typeof shape.setXf !== 'function') {
                    shape.setXf = function (newXf) {
                        const dx = newXf - this.getXf();
                        Shape._translateShape(this, dx, 0);
                    };
                }

                if (typeof shape.setYf !== 'function') {
                    shape.setYf = function (newYf) {
                        const dy = newYf - this.getYf();
                        Shape._translateShape(this, 0, dy);
                    };
                }

                return shape;
            }

            lassoSelect(lassoPolygon, graph, x, y) {
                selected_glyphs = []
                let isPlotPointInPolygon = (plot, point, polygon) => {
                    let inside = false;
                    const x_ = (plot.grid.X(point.x));
                    let y_ = (plot.grid.Y(point.y));
                    if (point.scy) {
                        y_ = point.scy;
                    }
                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const xi = polygon[i].x, yi = polygon[i].y;
                        const xj = polygon[j].x, yj = polygon[j].y;
                        const intersect = ((yi > y_) !== (yj > y_)) &&
                            (x_ < (xj - xi) * (y_ - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                };

                let findPlatesInLasso = (objects, plates, lassoPolygon) => {
                    let checkPlates = (plateArray) => {
                        for (let plate of plateArray) {
                            if (isRectangleInPolygon(plate.grid.xi, plate.grid.yi, plate.grid.width, plate.grid.height, lassoPolygon)) {
                                objects.push(plate);
                            }
                            if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                                checkPlates(plate.plates);
                            }
                        }
                    };
                    checkPlates(plates);

                    this.removedDangelingConnections();
                    return objects;
                };

                let isPointInPolygon = (point, polygon) => {
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

                let isRectangleInPolygon = (x, y, width, height, polygon) => {
                    const topLeft = { x: x, y: y };
                    const topRight = { x: x + width, y: y };
                    const bottomLeft = { x: x, y: y + height };
                    const bottomRight = { x: x + width, y: y + height };

                    return (
                        isPointInPolygon(topLeft, polygon) &&
                        isPointInPolygon(topRight, polygon) &&
                        isPointInPolygon(bottomLeft, polygon) &&
                        isPointInPolygon(bottomRight, polygon)
                    );
                };

                let findGlyphsInLasso = (objects, glyphs, lassoPolygon) => {
                    if (!Array.isArray(glyphs) || !Array.isArray(lassoPolygon) || lassoPolygon.length < 3) {
                        return objects;
                    }

                    const grid = this.grid;
                    const isNumber = v => typeof v === 'number' && Number.isFinite(v);

                    for (const g of glyphs) {
                        if (!g) continue;

                        const shape = g.shape || g;
                        if (!shape) continue;

                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                            Shape._attachBBoxMethods(shape);
                        }

                        if (typeof shape.getX !== 'function' ||
                            typeof shape.getY !== 'function' ||
                            typeof shape.getXf !== 'function' ||
                            typeof shape.getYf !== 'function') {
                            continue;
                        }

                        const x1 = shape.getX();
                        const y1 = shape.getY();
                        const x2 = shape.getXf();
                        const y2 = shape.getYf();
                        if (![x1, y1, x2, y2].every(isNumber)) continue;

                        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
                        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

                        const cx = (minX + maxX) / 2;
                        const cy = (minY + maxY) / 2;

                        const scx = grid.X(cx);
                        const scy = grid.Y(cy);
                        if (![scx, scy].every(isNumber)) continue;

                        if (isPointInPolygon({ x: scx, y: scy }, lassoPolygon)) {
                            if (!objects.includes(g)) objects.push(g);
                        }
                    }

                    return objects;
                };

                let findPlotsInLasso = (objects, plots, lassoPolygon) => {
                    let checkPlots = (pArray) => {
                        for (let plate of pArray) {
                            if (isRectangleInPolygon(plate.grid.xi, plate.grid.yi, plate.grid.width, plate.grid.height, lassoPolygon)) {
                                objects.push(plate);
                            }
                            if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                                checkPlates(plate.plates);
                            }
                        }
                    };
                    checkPlots(plots);
                    return objects;
                };

                let findPointsInLasso = (plot, points, lassoPolygon) => {
                    points.forEach(point => {
                        if (isPlotPointInPolygon(plot, point, lassoPolygon)) {
                            point.highlight = true;
                            point.isSelected = true;
                        } else {
                            point.isSelected = false;
                        }
                    });
                };
                let findaObjectsLasso = (plot, points, lassoPolygon) => {
                };

                let objects = [];
                objects = findPlatesInLasso(objects, this.root, lassoPolygon);

                selected_glyphs = findGlyphsInLasso(selected_glyphs, this.glyphs, lassoPolygon);
                let menuList = [
                ]

                if (objects.length > 0) {

                    let haveplots = false;
                    for (let o of objects) {
                        if (typeof o == 'MPlot') {
                            haveplots = true;
                        }
                    }

                    if (haveplots) {
                        menuList.push({
                            label: `Delete tables or plots`,
                            click: (xwc, ywc) => {
                                for (let o of objects) {
                                    this.removePlate(o);
                                }
                            }
                        }
                        )

                        menuList.push({
                            label: `Remove`,
                            click: (xwc, ywc) => {
                                for (let plot of this.m_plots) {
                                    findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                                }
                            }
                        })

                    }
                }
                selectedPoints = []
                for (let plot of this.m_plots) {
                    findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                    let subselectedPoints = plot.getSelectedPoints();
                    selectedPoints = selectedPoints.concat(subselectedPoints);
                }

                if (selectedPoints && selectedPoints.length > 0) {
                    this.highlightObjects(selectedPoints)


                    menuList.push({
                        label: `Color`,
                        click: async (scx, scy) => {
                            this.clearMenu()

                            let __color = 'black'

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
                                                    wid: 'card',
                                                    data: {
                                                        cards: [
                                                            [

                                                                {
                                                                    'width': '100%',
                                                                    'height': "100px",
                                                                    "style.padding-top": '4px',
                                                                    "style.border": '1px',
                                                                    'component':
                                                                    {
                                                                        'wid': 'color-chooser',
                                                                        'width': '100%',

                                                                        "data": {
                                                                            "selectionListener": createIonFunction((_color) => {
                                                                                __color = _color;
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ],
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                    let findPointsInLasso = (plot, points, lassoPolygon) => {
                                                                        points.forEach(point => {
                                                                            if (isPlotPointInPolygon(plot, point, lassoPolygon)) {
                                                                                point.color = __color;
                                                                                point.isSelected = true;
                                                                            } else {
                                                                                point.isSelected = false;
                                                                            }
                                                                        });
                                                                    };
                                                                    for (let plot of this.m_plots) {
                                                                        findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                                                                    }
                                                                    this.clearMenu()

                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.reset('mainPanel');

                                                                })
                                                            },
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(async () => {
                                                                    this.clearMenu()

                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.reset('mainPanel');
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', sequence_input);
                        },

                        move: () => {
                        }
                    }
                    )

                    if (this.mode && this.mode === 'viewer') {
                        menuList.push({
                            label: `Remove`,
                            click: (xwc, ywc) => {
                                for (let plot of this.m_plots) {
                                    findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                                }
                            }
                        })
                        return;
                    }

                    menuList.push({
                        label: `Move Points`,
                        click: (xwc, ywc) => {
                            let mvPoints = [];
                            for (let plot of this.m_plots) {
                                let subselectedPoints = plot.getSelectedPoints();
                                for (let point of subselectedPoints) {
                                    point.highlight = true;
                                    if (point.isSelected) {
                                        mvPoints.push({ point: point, grid: plot.grid });
                                    }
                                }
                            }

                            let t = {
                                id: 'move-points',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                                priority: true
                            };

                            let dragStartX = 0;
                            let dragStartY = 0;
                            let dragging = false;
                            let kill = false;

                            t.draw = (grid, ctx) => {
                                for (let p of mvPoints) {
                                    p.point.highlight = true;
                                    p.point.isSelected = true;
                                }
                            };

                            t.close = () => {
                            };

                            t.mouseDownListener = (x, y) => {
                                dragStartX = x;
                                dragStartY = y;
                                dragging = true;
                                if (kill) {
                                    this.wb(null)
                                }
                            };

                            t.mouseMoveListener = (x, y) => {
                                if (!dragging)
                                    return;
                                let dx = x - dragStartX;
                                let dy = y - dragStartY;
                                for (let p of mvPoints) {
                                    p.point.highlight = true;
                                    p.point.isSelected = true;

                                    p.point.x += p.grid.worldWidth(dx);
                                    if (p.point.startX) {
                                        p.point.startX += p.grid.worldWidth(dx);
                                    }
                                    if (p.point.startY != null) {
                                        p.point.startY -= p.grid.worldHeight(dy);
                                    }
                                    p.point.y -= p.grid.worldHeight(dy);
                                    p.point.scy -= (dy);
                                }
                                dragStartX = x;
                                dragStartY = y;
                            };

                            t.mouseUpListener = async (x, y) => {
                                if (dragging) {
                                    kill = true;
                                }
                                dragging = false;
                            };

                            setTimeout(() => {
                                this.wb(t);

                                this.setMessage(" Click and drag to move the selected points...")
                                this.menu = null;
                                this.menu_vis = false;
                            }, 200)

                        },

                    })

                    if (this.selectedPlate && this.selectedPlate.typeof && this.selectedPlate.typeof === 'plot') {
                        menuList.push({
                            label: `Move to front`,
                            click: async (scx, scy) => {

                                function movePointToTop(plot, point) {
                                    const points = plot.scatterData.points;
                                    const index = points.indexOf(point);
                                    if (index === -1) return;

                                    points.splice(index, 1);

                                    points.unshift(point);

                                    plot.scatterData.points = points;
                                }

                                for (let plot of this.m_plots) {
                                    let subselectedPoints = plot.getSelectedPoints();
                                    for (let point of subselectedPoints) {
                                        movePointToTop(plot, point)
                                    }
                                }

                            },
                        },
                            {
                                label: `Move to back`,
                                click: async (scx, scy) => {

                                    function movePointToBottom(plot, point) {
                                        const points = plot.scatterData.points;
                                        const index = points.indexOf(point);
                                        if (index === -1) return;

                                        points.splice(index, 1);

                                        points.push(point);
                                        plot.scatterData.points = points;

                                    }
                                    for (let plot of this.m_plots) {
                                        let subselectedPoints = plot.getSelectedPoints();
                                        for (let point of subselectedPoints) {
                                            movePointToBottom(plot, point)
                                        }
                                    }
                                },
                            },
                        )
                    }

                    menuList.push(
                        {
                            label: `Set visible scope`,
                            click: async (scx, scy) => {

                                let mvPoints = [];
                                for (let plot of this.m_plots) {
                                    let subselectedPoints = plot.getSelectedPoints();
                                    for (let point of subselectedPoints) {
                                        point.highlight = true;
                                        if (point.isSelected) {
                                            mvPoints.push(point);
                                        }
                                    }
                                }

                                let m = []
                                m.push(
                                    {
                                        label: `Show on years`,
                                        click: async (scx, scy) => {
                                            for (let p of mvPoints) {
                                                p.showYears = true;
                                            }
                                        },
                                        move: () => { }
                                    },
                                    {
                                        label: `Show on months`,
                                        click: async (scx, scy) => {
                                            for (let p of mvPoints) {
                                                p.showMonths = true;
                                            }
                                        },
                                        move: () => { }
                                    },
                                    {
                                        label: `Show on days`,
                                        click: async (scx, scy) => {
                                            for (let p of mvPoints) {
                                                p.showDays = true;
                                            }
                                        },
                                        move: () => { }
                                    },
                                    {
                                        label: `Show on hours`,
                                        click: async (scx, scy) => {
                                            for (let p of mvPoints) {
                                                p.showHours = true;
                                            }
                                        },
                                        move: () => { }
                                    },
                                    {
                                        label: `Show on quarters`,
                                        click: async (scx, scy) => {
                                            for (let p of mvPoints) {
                                                p.showQuarters = true;
                                            }
                                        },
                                        move: () => { }
                                    },
                                    {
                                        label: `Show on All`,
                                        click: async (scx, scy) => {
                                            for (let p of mvPoints) {
                                                p.showHours = null;
                                                p.showMonths = null;
                                                p.showDays = null;
                                                p.showYears = null;
                                                p.showQuarters = null;
                                            }
                                        },
                                        move: () => { }
                                    }
                                );
                                this.wb(null)
                                const graph = CurrentLayout.getStashed('graph')
                                if (graph) {
                                    graph.showWindowMenu(m, 10, 10, 400)
                                }
                            },
                            move: () => {
                            }
                        });

                    menuList.push({
                        label: `Delete Points`,
                        click: (xwc, ywc) => {
                            for (let plot of this.m_plots) {
                                findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                                let subselectedPoints = plot.getSelectedPoints();
                                plot.removeSelectedPoints();
                            }
                        }
                    })

                }

                if (selectedPoints && selectedPoints.length === 1) {
                    menuList.push({
                        label: `Go to point`,
                        click: (xwc, ywc) => {
                            let w = selectedPoints[0]
                            if (w.xrefid)
                                this.zoomIntoObject(w.xrefid)
                            if (w.yrefid)
                                setTimeout(() => {
                                    this.zoomIntoObject(w.yrefid)
                                }, 20000)
                            showModal({
                                wid: 'json',
                                data: JSON.stringify(w)
                            })
                        }
                    })
                }
                if (objects && objects.length > 0) {
                    menuList.push({
                        label: `New Workbench`,
                        click: async (xwc, ywc) => {
                            const a = await exec('baja/package/trackpack', graph, this, objects);

                        }
                    })
                    menuList.push({
                        label: `New Folder`,
                        click: async (xwc, ywc) => {
                            const a = await exec('baja/package/trackpack', graph, this, objects);

                        }
                    })
                    menuList.push({
                        label: `Copy...`,
                        click: async (xwc, ywc) => {

                            let c = {
                                objectType: 'array_of_objects',
                                objects: objects
                            }
                            const copytable = HM(c);
                            navigator.clipboard.writeText(copytable).then(() => {

                                this.setMessage(" Tables copied")
                                console.log("Object copied to clipboard!");
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                        }
                    })
                } if (objects && objects.length > 0) {
                    menuList.push({
                        label: `Delete`,
                        click: async (xwc, ywc) => {
                            for (let o of objects) {
                                this.removePlate(o)
                            }
                        }
                    })
                }

                menuList.push({
                    label: `Select`,
                    click: async (xwc, ywc) => {
                        try {

                            this.selectGlyphAll();

                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err);
                            this.wb(null);
                        }

                    }
                })

                if (selected_glyphs && selected_glyphs.length > 0) {
                    menuList.push({
                        label: `Move`,
                        click: async (xwc, ywc) => {
                            try {
                                pushHistory(HM(this))
                                let clickIndex = 0;
                                let hd = {
                                    selected_glyphs: selected_glyphs,
                                    startX: null,
                                    startY: null,
                                    currentX: null,
                                    currentY: null,
                                    isDrawing: true,
                                    isDragging: false,
                                    priority: true,
                                    id: 'glyph-override-move',

                                    draw: (grid, ctx) => {
                                        if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;

                                        const isNumber = v => typeof v === 'number' && Number.isFinite(v);

                                        const now = Date.now();
                                        const periodMs = 2000;
                                        const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                        const pulse = (phase + 1) / 2;

                                        const basePad = 8;
                                        const extraPad = 12;
                                        const padFactor = basePad + extraPad * pulse;

                                        const baseAlpha = 0.10;
                                        const extraAlpha = 0.25;
                                        const alpha = baseAlpha + extraAlpha * pulse;

                                        const baseLineWidth = 2;
                                        const extraLineWidth = 3;
                                        const lineWidth = baseLineWidth + extraLineWidth * pulse;

                                        ctx.save();
                                        ctx.globalAlpha = alpha;
                                        ctx.lineJoin = 'round';
                                        ctx.lineCap = 'round';
                                        ctx.strokeStyle = 'rgba(0, 150, 255, 1)';

                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const shape = gshape.shape;

                                            if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                                Shape._attachBBoxMethods(shape);
                                            }
                                            if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) continue;

                                            const x1 = shape.getX();
                                            const y1 = shape.getY();
                                            const x2 = shape.getXf();
                                            const y2 = shape.getYf();
                                            if (![x1, y1, x2, y2].every(isNumber)) continue;

                                            const minX = Math.min(x1, x2) - padFactor;
                                            const maxX = Math.max(x1, x2) + padFactor;
                                            const minY = Math.min(y1, y2) - padFactor;
                                            const maxY = Math.max(y1, y2) + padFactor;

                                            const wWorld = maxX - minX;
                                            const hWorld = maxY - minY;

                                            const sx = grid.X(minX);
                                            const syTop = grid.Y(maxY);
                                            const sw = grid.screenWidth(wWorld);
                                            const sh = grid.screenHeight(hWorld);

                                            ctx.lineWidth = lineWidth;
                                            ctx.beginPath();
                                            ctx.rect(sx, syTop, sw, sh);
                                            ctx.stroke();
                                        }

                                        ctx.restore();
                                    },

                                    mouseDownListener: async (x, y) => {
                                        const wx = this.grid.Xwc(x);
                                        const wy = this.grid.Ywc(y);

                                        let insideAny = false;

                                        if (hd.selected_glyphs) {
                                            for (let gshape of hd.selected_glyphs) {
                                                if (!gshape || !gshape.shape) continue;
                                                const s = gshape.shape;

                                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                    Shape._attachBBoxMethods(s);
                                                }
                                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                                const x1 = Math.min(s.getX(), s.getXf());
                                                const x2 = Math.max(s.getX(), s.getXf());
                                                const y1 = Math.min(s.getY(), s.getYf());
                                                const y2 = Math.max(s.getY(), s.getYf());

                                                if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) {
                                                    insideAny = true;
                                                    break;
                                                }
                                            }
                                        }

                                        if (!insideAny) {
                                            this.wb(null);
                                            return;
                                        }

                                        hd.startX = x;
                                        hd.startY = y;
                                        hd.currentX = x;
                                        hd.currentY = y;
                                        hd.isDragging = true;
                                        clickIndex++;
                                        if (clickIndex > 1) {
                                            this.wb(null);
                                            this.deselectAll();
                                        }

                                        if (hd.selected_glyphs) {
                                            for (let gshape of hd.selected_glyphs) {
                                                if (!gshape || !gshape.shape) continue;
                                                const shape = gshape.shape;

                                                if (!shape.getX || !shape.getY) {
                                                    Shape._attachBBoxMethods(shape);
                                                }

                                                if (shape.getX && shape.getY) {
                                                    gshape._dragOffsetX = shape.getX() - wx;
                                                    gshape._dragOffsetY = shape.getY() - wy;
                                                } else {
                                                    gshape._dragOffsetX = 0;
                                                    gshape._dragOffsetY = 0;
                                                }
                                            }
                                        }
                                    },

                                    mouseMoveListener: (x, y) => {
                                        if (!hd.selected_glyphs) return;
                                        if (!hd.isDragging) return;

                                        const wx = this.grid.Xwc(x);
                                        const wy = this.grid.Ywc(y);

                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;

                                            let shape = gshape.shape;
                                            const offX = gshape._dragOffsetX ?? 0;
                                            const offY = gshape._dragOffsetY ?? 0;

                                            const targetX = wx + offX;
                                            const targetY = wy + offY;

                                            if (typeof shape.setX === 'function') shape.setX(targetX);
                                            else if ('x' in shape) shape.x = targetX;
                                            else if ('cx' in shape) shape.cx = targetX;

                                            if (typeof shape.setY === 'function') shape.setY(targetY);
                                            else if ('y' in shape) shape.y = targetY;
                                            else if ('cy' in shape) shape.cy = targetY;
                                        }
                                    },

                                    mouseUpListener: async (x, y) => {
                                        hd.isDragging = false;
                                    },

                                    close: () => {
                                        hd.isDragging = false;
                                        this.wbid = null

                                    }
                                };

                                setTimeout(() => {
                                    hd.selected_glyphs = selected_glyphs;
                                    this.wb(hd);

                                    hd.startX = null;
                                    hd.startY = null;
                                    hd.currentX = null;
                                    hd.currentY = null;
                                }, 100);

                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err);
                                this.wb(null);
                            }

                        }
                    })





                    let iscomposite = false;
                    for (let g of selected_glyphs) {
                        if (!g || !g.shape) continue;
                        const shape = g.shape;
                        iscomposite =
                            shape.type &&
                            String(shape.type).toLowerCase() === 'svg_group' &&
                            Array.isArray(shape.shapes);
                    }

                    let canGroupComposite = false;
                    let groupableGlyphs = [];

                    if (Array.isArray(selected_glyphs)) {
                        groupableGlyphs = selected_glyphs.filter(g => g && g.shape);

                        canGroupComposite = groupableGlyphs.length > 1;
                    }

                    if (canGroupComposite) {
                        menuList.push({
                            label: 'Group Selected',
                            click: async (xwc, ywc) => {
                                try {
                                    const glyphs = (selected_glyphs || []).filter(g => g && g.shape);
                                    if (glyphs.length <= 1) return;

                                    const childShapes = glyphs.map(g => g.shape);

                                    const compositeShape = Shape._makeCompositeShape(childShapes);

                                    const compositeGlyph = new Glyph(compositeShape);

                                    this.removeGlyphs(glyphs);

                                    this.addGlyph(compositeGlyph);

                                    selected_glyphs = [compositeGlyph];

                                } catch (err) {
                                    console.error('Group into composite error:', err);
                                }
                            }
                        });
                    }

                    menuList.push({
                        label: 'Show raw object',
                        click: async (xwc, ywc) => {
                            try {
                                const glyphs = (selected_glyphs || []).filter(g => g && g.shape);
                                if (glyphs.length <= 1) return;

                                const childShapes = glyphs.map(g => g.shape);

                                showModal({
                                    wid: 'json',
                                    data: JSON.stringify(childShapes)
                                })


                            } catch (err) {
                                console.error('Group into composite error:', err);
                            }
                        }
                    });
                    menuList.push({
                        label: `Group All`,
                        click: async (xwc, ywc) => {
                            try {
                                const glyphs = (this.glyphs || []).filter(g => g && g.shape);
                                if (glyphs.length <= 1) return;
                                const childShapes = glyphs.map(g => g.shape);
                                const compositeShape = Shape._makeCompositeShape(childShapes);
                                const compositeGlyph = new Glyph(compositeShape);
                                this.removeGlyphs(glyphs);
                                this.addGlyph(compositeGlyph);
                                selected_glyphs = [compositeGlyph];
                            } catch (err) {
                                console.error('Group into composite error:', err);
                            }
                        }
                    });

                    if (iscomposite) {
                        menuList.push({
                            label: `Ungroup`,
                            click: async (xwc, ywc) => {
                                try {
                                    if (!selected_glyphs || !selected_glyphs.length) return;

                                    const newGlyphs = [];
                                    function breakComposite(shape) {
                                        if (!shape) return [];
                                        const out = [];
                                        function visit(s) {
                                            if (!s) return;
                                            const t = (s.type || '').toLowerCase();
                                            if (t === 'svg_group' && Array.isArray(s.shapes)) {
                                                for (const child of s.shapes) {
                                                    visit(child);
                                                }
                                            } else {
                                                out.push(s);
                                            }
                                        }

                                        visit(shape);
                                        return out;
                                    }

                                    for (let g of selected_glyphs) {
                                        if (!g || !g.shape) continue;

                                        const shape = g.shape;
                                        const isComposite =
                                            shape.type &&
                                            String(shape.type).toLowerCase() === 'svg_group' &&
                                            Array.isArray(shape.shapes);

                                        if (!isComposite) continue;

                                        const parts = breakComposite(shape);

                                        for (const part of parts) {
                                            const newGlyph = new Glyph(part)
                                            newGlyphs.push(newGlyph);
                                        }
                                    }

                                    if (!newGlyphs.length) return;

                                    for (let g of selected_glyphs) {
                                        const shape = g?.shape;
                                        const isComposite =
                                            shape?.type &&
                                            String(shape.type).toLowerCase() === 'svg_group' &&
                                            Array.isArray(shape.shapes);

                                        if (isComposite) {
                                            this.removeGlyphs([g]);
                                        }
                                    }

                                    for (let ng of newGlyphs) {
                                        this.addGlyph(ng);
                                    }

                                    selected_glyphs = newGlyphs;

                                } catch (err) {
                                    console.error("Ungroup composite error:", err);
                                }
                            }
                        });
                    }

                    menuList.push({
                        label: `Resize glyph`,
                        click: async (xwc, ywc) => {
                            try {
                                this.wbid = 'glyph'

                                pushHistory(HM(this))

                                let clickIndex = 0;
                                let hd = {
                                    selected_glyphs: null,
                                    startX: null,
                                    startY: null,
                                    startWx: null,
                                    startWy: null,
                                    currentX: null,
                                    currentY: null,
                                    isResizing: false,
                                    isDrawing: true,
                                    isDragging: false,
                                    priority: true,
                                    id: 'glyph-override-resize',

                                    draw: (grid, ctx) => {
                                        if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;

                                        const isNumber = v => typeof v === 'number' && Number.isFinite(v);

                                        const now = Date.now();
                                        const periodMs = 2000;
                                        const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                        const pulse = (phase + 1) / 2;

                                        const basePad = 8;
                                        const extraPad = 12;
                                        const padFactor = basePad + extraPad * pulse;

                                        const baseAlpha = 0.10;
                                        const extraAlpha = 0.25;
                                        const alpha = baseAlpha + extraAlpha * pulse;

                                        const baseLineWidth = 2;
                                        const extraLineWidth = 3;
                                        const lineWidth = baseLineWidth + extraLineWidth * pulse;

                                        ctx.save();
                                        ctx.globalAlpha = alpha;
                                        ctx.lineJoin = 'round';
                                        ctx.lineCap = 'round';
                                        ctx.strokeStyle = 'rgba(0, 150, 255, 1)';

                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape) continue;
                                            const shape = gshape.shape || gshape;

                                            if (!shape) continue;

                                            if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                                Shape._attachBBoxMethods(shape);
                                            }
                                            if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) continue;

                                            const x1 = shape.getX();
                                            const y1 = shape.getY();
                                            const x2 = shape.getXf();
                                            const y2 = shape.getYf();
                                            if (![x1, y1, x2, y2].every(isNumber)) continue;

                                            const minX = Math.min(x1, x2) - padFactor;
                                            const maxX = Math.max(x1, x2) + padFactor;
                                            const minY = Math.min(y1, y2) - padFactor;
                                            const maxY = Math.max(y1, y2) + padFactor;

                                            const wWorld = maxX - minX;
                                            const hWorld = maxY - minY;

                                            const sx = grid.X(minX);
                                            const syTop = grid.Y(maxY);
                                            const sw = grid.screenWidth(wWorld);
                                            const sh = grid.screenHeight(hWorld);

                                            ctx.lineWidth = lineWidth;
                                            ctx.beginPath();
                                            ctx.rect(sx, syTop, sw, sh);
                                            ctx.stroke();

                                            const handleSize = 8;
                                            ctx.fillStyle = 'rgba(0, 150, 255, 0.9)';
                                            ctx.beginPath();
                                            ctx.rect(sx + sw - handleSize, syTop + sh - handleSize, handleSize, handleSize);
                                            ctx.fill();
                                        }

                                        ctx.restore();
                                    },

                                    mouseDownListener: async (x, y) => {

                                        const wx = this.grid.Xwc(x);
                                        const wy = this.grid.Ywc(y);

                                        const isNumber = v => typeof v === 'number' && Number.isFinite(v);
                                        let insideAny = false;

                                        if (hd.selected_glyphs) {
                                            for (let gshape of hd.selected_glyphs) {
                                                if (!gshape) continue;
                                                const s = gshape.shape || gshape;
                                                if (!s) continue;

                                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                    Shape._attachBBoxMethods(s);
                                                }
                                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                                const x1 = Math.min(s.getX(), s.getXf());
                                                const x2 = Math.max(s.getX(), s.getXf());
                                                const y1 = Math.min(s.getY(), s.getYf());
                                                const y2 = Math.max(s.getY(), s.getYf());

                                                if (![x1, x2, y1, y2].every(isNumber)) continue;

                                                if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) {
                                                    insideAny = true;
                                                    break;
                                                }
                                            }
                                        }

                                        hd.startX = x;
                                        hd.startY = y;
                                        hd.currentX = x;
                                        hd.currentY = y;
                                        hd.startWx = wx;
                                        hd.startWy = wy;
                                        hd.isResizing = true;

                                        if (hd.selected_glyphs) {
                                            for (let gshape of hd.selected_glyphs) {
                                                if (!gshape) continue;
                                                const s = gshape.shape || gshape;
                                                if (!s) continue;

                                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                    Shape._attachBBoxMethods(s);
                                                }
                                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                                gshape._resizeOrig = {
                                                    x1: s.getX(),
                                                    y1: s.getY(),
                                                    x2: s.getXf(),
                                                    y2: s.getYf()
                                                };

                                                const t = (s.type || '').toLowerCase();
                                                if ((t === 'text' || t === 'svg_text') && typeof s.fontSize === 'number') {
                                                    gshape._origFontSize = s.fontSize;
                                                }
                                            }
                                        }

                                        if (clickIndex > 1) {
                                            this.deselectAll();
                                            this.wb(null);
                                        }
                                        clickIndex++;
                                    },

                                    mouseMoveListener: (x, y) => {
                                        if (!hd.selected_glyphs) return;
                                        if (!hd.isResizing) return;

                                        const wx = this.grid.Xwc(x);
                                        const wy = this.grid.Ywc(y);

                                        const dxWorld = wx - hd.startWx;
                                        const dyWorld = wy - hd.startWy;

                                        const isNum = v => typeof v === 'number' && Number.isFinite(v);

                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape) continue;
                                            const shape = gshape.shape || gshape;
                                            if (!shape) continue;

                                            if (!hd.isResizing && typeof shape.update === 'function') {
                                                shape.update(wx, wy);
                                                continue;
                                            }

                                            if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                                Shape._attachBBoxMethods(shape);
                                            }

                                            const orig = gshape._resizeOrig;
                                            if (!orig) continue;

                                            const origX1 = orig.x1;
                                            const origY1 = orig.y1;
                                            const origX2 = orig.x2;
                                            const origY2 = orig.y2;

                                            const newXf = origX2 + dxWorld;
                                            const newYf = origY2 + dyWorld;

                                            const type = (shape.type || '').toLowerCase();

                                            const isText = (type === 'text' || type === 'svg_text') && isNum(shape.fontSize);
                                            if (isText && isNum(origX1) && isNum(origX2)) {
                                                const origWidth = origX2 - origX1;
                                                const newWidth = newXf - origX1;

                                                if (isNum(origWidth) && Math.abs(origWidth) > 1e-6 &&
                                                    isNum(newWidth) && newWidth > 0) {

                                                    const origFontSize = isNum(gshape._origFontSize)
                                                        ? gshape._origFontSize
                                                        : shape.fontSize;

                                                    const scale = newWidth / origWidth;
                                                    shape.fontSize = Math.max(1, origFontSize * scale);
                                                }

                                                continue;
                                            }

                                            const hasSetXfYf =
                                                typeof shape.setXf === 'function' &&
                                                typeof shape.setYf === 'function';

                                            const isRect = type === 'rect';
                                            const isCircle = type === 'circle';
                                            const isEllipse = type === 'ellipse';
                                            const isPolygon = type === 'polygon' || type === 'svg_polygon';

                                            const isCompositeGroup =
                                                ((type === 'svg_group') || (Array.isArray(shape.shapes) && shape.shapes.length > 0)) &&
                                                hasSetXfYf;

                                            if (isCompositeGroup) {

                                                shape.setXf(newXf);
                                                shape.setYf(newYf);
                                                continue;
                                            }

                                            if ((isRect || isCircle || isEllipse || isPolygon) && hasSetXfYf) {
                                                shape.setXf(newXf);
                                                shape.setYf(newYf);
                                                continue;
                                            }

                                        }
                                    },

                                    mouseUpListener: async (x, y) => {
                                        hd.isResizing = false;
                                    },

                                    close: () => {
                                        hd.isResizing = false;
                                        this.wbid = null

                                    }
                                };

                                setTimeout(() => {
                                    hd.selected_glyphs = selected_glyphs;
                                    this.wb(hd);
                                    hd.startX = null;
                                    hd.startY = null;
                                    hd.currentX = null;
                                    hd.currentY = null;

                                }, 100);

                            } catch (err) {
                                console.error('Failed to start resize tool: ', err);
                                this.wb(null);
                            }

                        }
                    });
                    menuList.push({
                        label: `Delete`,
                        click: async (xwc, ywc) => {
                            pushHistory(HM(this))
                            this.removeGlyphs(selected_glyphs)
                        }
                    });

                    menuList.push({
                        label: 'Send to back',
                        click: async (xwc, ywc) => {
                            for (let glyph of selected_glyphs) {
                                const idx = this.glyphs.findIndex(g => g.uid === glyph.uid);
                                if (idx === -1) return;
                                this.glyphs.splice(idx, 1);
                                this.glyphs.unshift(glyph);
                            }
                        }
                    });

                    menuList.push({
                        label: 'Bring to front',
                        click: async (xwc, ywc) => {
                            for (let glyph of selected_glyphs) {
                                const idx = this.glyphs.findIndex(g => g.uid === glyph.uid);
                                if (idx === -1) return;

                                this.glyphs.splice(idx, 1);
                                this.glyphs.push(glyph);
                            }
                        }
                    });

                }

                this.menu = new Menu(menuList, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * menuList.length / 2))
                this.menu_vis = true;
                if (this.wb)
                    this.wb(null)
            }

            showMenuOptionsForImageExport() {
                let menuList = []
                this.clearActionGlyphs();
                menuList.push({
                    label: `Move poster window`,
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this))

                            let clickIndex = 0;
                            let hd = {
                                selected_glyphs: null,
                                startX: null,
                                startY: null,
                                currentX: null,
                                currentY: null,
                                isDrawing: true,
                                isDragging: false,
                                priority: true,
                                id: 'glyph-override-move',

                                draw: (grid, ctx) => {
                                    if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;

                                    const isNumber = v => typeof v === 'number' && Number.isFinite(v);

                                    const now = Date.now();
                                    const periodMs = 2000;
                                    const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                    const pulse = (phase + 1) / 2;

                                    const basePad = 8;
                                    const extraPad = 12;
                                    const padFactor = basePad + extraPad * pulse;

                                    const baseAlpha = 0.10;
                                    const extraAlpha = 0.25;
                                    const alpha = baseAlpha + extraAlpha * pulse;

                                    const baseLineWidth = 2;
                                    const extraLineWidth = 3;
                                    const lineWidth = baseLineWidth + extraLineWidth * pulse;

                                    ctx.save();
                                    ctx.globalAlpha = alpha;
                                    ctx.lineJoin = 'round';
                                    ctx.lineCap = 'round';
                                    ctx.strokeStyle = 'rgba(0, 150, 255, 1)';

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;
                                        const shape = gshape.shape;

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }
                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) continue;

                                        const x1 = shape.getX();
                                        const y1 = shape.getY();
                                        const x2 = shape.getXf();
                                        const y2 = shape.getYf();
                                        if (![x1, y1, x2, y2].every(isNumber)) continue;

                                        const minX = Math.min(x1, x2) - padFactor;
                                        const maxX = Math.max(x1, x2) + padFactor;
                                        const minY = Math.min(y1, y2) - padFactor;
                                        const maxY = Math.max(y1, y2) + padFactor;

                                        const wWorld = maxX - minX;
                                        const hWorld = maxY - minY;

                                        const sx = grid.X(minX);
                                        const syTop = grid.Y(maxY);
                                        const sw = grid.screenWidth(wWorld);
                                        const sh = grid.screenHeight(hWorld);

                                        ctx.lineWidth = lineWidth;
                                        ctx.beginPath();
                                        ctx.rect(sx, syTop, sw, sh);
                                        ctx.stroke();
                                    }

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    let insideAny = false;

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const s = gshape.shape;

                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                Shape._attachBBoxMethods(s);
                                            }
                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                            const x1 = Math.min(s.getX(), s.getXf());
                                            const x2 = Math.max(s.getX(), s.getXf());
                                            const y1 = Math.min(s.getY(), s.getYf());
                                            const y2 = Math.max(s.getY(), s.getYf());

                                            if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) {
                                                insideAny = true;
                                                break;
                                            }
                                        }
                                    }

                                    if (!insideAny) {
                                        this.wb(null);
                                        return;
                                    }

                                    hd.startX = x;
                                    hd.startY = y;
                                    hd.currentX = x;
                                    hd.currentY = y;
                                    hd.isDragging = true;
                                    clickIndex++;
                                    if (clickIndex > 1) {
                                        this.wb(null);
                                        this.deselectAll();
                                    }

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const shape = gshape.shape;

                                            if (!shape.getX || !shape.getY) {
                                                Shape._attachBBoxMethods(shape);
                                            }

                                            if (shape.getX && shape.getY) {
                                                gshape._dragOffsetX = shape.getX() - wx;
                                                gshape._dragOffsetY = shape.getY() - wy;
                                            } else {
                                                gshape._dragOffsetX = 0;
                                                gshape._dragOffsetY = 0;
                                            }
                                        }
                                    }
                                },

                                mouseMoveListener: (x, y) => {
                                    if (!hd.selected_glyphs) return;
                                    if (!hd.isDragging) return;

                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;

                                        let shape = gshape.shape;
                                        const offX = gshape._dragOffsetX ?? 0;
                                        const offY = gshape._dragOffsetY ?? 0;

                                        const targetX = wx + offX;
                                        const targetY = wy + offY;

                                        if (typeof shape.setX === 'function') shape.setX(targetX);
                                        else if ('x' in shape) shape.x = targetX;
                                        else if ('cx' in shape) shape.cx = targetX;

                                        if (typeof shape.setY === 'function') shape.setY(targetY);
                                        else if ('y' in shape) shape.y = targetY;
                                        else if ('cy' in shape) shape.cy = targetY;
                                    }
                                },

                                mouseUpListener: async (x, y) => {
                                    hd.isDragging = false;
                                },

                                close: () => {
                                    hd.isDragging = false;
                                }
                            };

                            setTimeout(() => {
                                hd.selected_glyphs = selected_glyphs;
                                this.wb(hd);
                                hd.startX = null;
                                hd.startY = null;
                                hd.currentX = null;
                                hd.currentY = null;
                            }, 100);

                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err);
                            this.wb(null);
                        }

                    }
                })

                let iscomposite = false;
                let saveToPDF__ = this.___imageCaptureRect;
                if (saveToPDF__) {
                    menuList.push({
                        label: `Save window to PNG`,
                        click: async (xwc, ywc) => {

                            setTimeout(async () => {
                                let graph = CurrentLayout.getStashed('graph');
                                const desiredPixelsPerFoot = 200;

                                await exportBorderAtPixelsPerFoot(saveToPDF__, graph, desiredPixelsPerFoot);

                            }, 1000)
                        }
                    })
                }

                menuList.push({
                    label: `Resize poster window`,
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this))

                            let clickIndex = 0;
                            let hd = {
                                selected_glyphs: null,
                                startX: null,
                                startY: null,
                                startWx: null,
                                startWy: null,
                                currentX: null,
                                currentY: null,
                                isResizing: false,
                                isDrawing: true,
                                isDragging: false,
                                priority: true,
                                id: 'glyph-override-resize',

                                draw: (grid, ctx) => {
                                    if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;

                                    const isNumber = v => typeof v === 'number' && Number.isFinite(v);

                                    const now = Date.now();
                                    const periodMs = 2000;
                                    const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                    const pulse = (phase + 1) / 2;

                                    const basePad = 8;
                                    const extraPad = 12;
                                    const padFactor = basePad + extraPad * pulse;

                                    const baseAlpha = 0.10;
                                    const extraAlpha = 0.25;
                                    const alpha = baseAlpha + extraAlpha * pulse;

                                    const baseLineWidth = 2;
                                    const extraLineWidth = 3;
                                    const lineWidth = baseLineWidth + extraLineWidth * pulse;

                                    ctx.save();
                                    ctx.globalAlpha = alpha;
                                    ctx.lineJoin = 'round';
                                    ctx.lineCap = 'round';
                                    ctx.strokeStyle = 'rgba(0, 150, 255, 1)';

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;
                                        const shape = gshape.shape;

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }
                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) continue;

                                        const x1 = shape.getX();
                                        const y1 = shape.getY();
                                        const x2 = shape.getXf();
                                        const y2 = shape.getYf();
                                        if (![x1, y1, x2, y2].every(isNumber)) continue;

                                        const minX = Math.min(x1, x2) - padFactor;
                                        const maxX = Math.max(x1, x2) + padFactor;
                                        const minY = Math.min(y1, y2) - padFactor;
                                        const maxY = Math.max(y1, y2) + padFactor;

                                        const wWorld = maxX - minX;
                                        const hWorld = maxY - minY;

                                        const sx = grid.X(minX);
                                        const syTop = grid.Y(maxY);
                                        const sw = grid.screenWidth(wWorld);
                                        const sh = grid.screenHeight(hWorld);

                                        ctx.lineWidth = lineWidth;
                                        ctx.beginPath();
                                        ctx.rect(sx, syTop, sw, sh);
                                        ctx.stroke();

                                        const handleSize = 8;
                                        ctx.fillStyle = 'rgba(0, 150, 255, 0.9)';
                                        ctx.beginPath();
                                        ctx.rect(sx + sw - handleSize, syTop + sh - handleSize, handleSize, handleSize);
                                        ctx.fill();
                                    }

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    const isNumber = v => typeof v === 'number' && Number.isFinite(v);
                                    let insideAny = false;

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const s = gshape.shape;

                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                Shape._attachBBoxMethods(s);
                                            }
                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                            const x1 = Math.min(s.getX(), s.getXf());
                                            const x2 = Math.max(s.getX(), s.getXf());
                                            const y1 = Math.min(s.getY(), s.getYf());
                                            const y2 = Math.max(s.getY(), s.getYf());

                                            if (![x1, x2, y1, y2].every(isNumber)) continue;

                                            if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) {
                                                insideAny = true;

                                            }
                                        }
                                    }

                                    hd.startX = x;
                                    hd.startY = y;
                                    hd.currentX = x;
                                    hd.currentY = y;
                                    hd.startWx = wx;
                                    hd.startWy = wy;
                                    hd.isResizing = true;

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const s = gshape.shape;

                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                Shape._attachBBoxMethods(s);
                                            }
                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                            gshape._resizeOrig = {
                                                x1: s.getX(),
                                                y1: s.getY(),
                                                x2: s.getXf(),
                                                y2: s.getYf()
                                            };

                                            const t = (s.type || '').toLowerCase();
                                            if ((t === 'text' || t === 'svg_text') && typeof s.fontSize === 'number') {
                                                gshape._origFontSize = s.fontSize;
                                            }
                                        }
                                    }
                                    clickIndex++;

                                    if (clickIndex > 1) {
                                        this.deselectAll();
                                        this.wb(null);
                                    }
                                },

                                mouseMoveListener: (x, y) => {

                                    if (!hd.selected_glyphs) return;
                                    if (!hd.isResizing) return;

                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    const dxWorld = wx - hd.startWx;
                                    const dyWorld = wy - hd.startWy;

                                    const isNum = v => typeof v === 'number' && Number.isFinite(v);

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;
                                        const shape = gshape.shape;

                                        if (typeof shape.update === 'function') {
                                            shape.update(wx, wy);
                                            continue;
                                        }

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }

                                        const orig = gshape._resizeOrig;
                                        if (!orig) continue;

                                        const origX2 = orig.x2;
                                        const origY2 = orig.y2;

                                        const newXf = origX2 + dxWorld;
                                        const newYf = origY2 + dyWorld;

                                        const type = (shape.type || '').toLowerCase();

                                        const isText = (type === 'text' || type === 'svg_text') && isNum(shape.fontSize);
                                        if (isText && isNum(orig.x1) && isNum(orig.x2)) {
                                            const origWidth = orig.x2 - orig.x1;
                                            const newWidth = newXf - orig.x1;

                                            if (isNum(origWidth) && Math.abs(origWidth) > 1e-6 &&
                                                isNum(newWidth) && newWidth > 0) {

                                                const origFontSize = isNum(gshape._origFontSize)
                                                    ? gshape._origFontSize
                                                    : shape.fontSize;

                                                const scale = newWidth / origWidth;
                                                shape.fontSize = Math.max(1, origFontSize * scale);
                                            }

                                            continue;
                                        }

                                        const hasRectGeom =
                                            isNum(shape.x) && isNum(shape.w);

                                        const hasCircleGeom =
                                            isNum(shape.cx) && isNum(shape.r);

                                        const hasEllipseGeom =
                                            isNum(shape.cx) && isNum(shape.rx) && isNum(shape.ry);

                                        const isCompositeGroup =
                                            type === 'svg_group' &&
                                            typeof shape.setXf === 'function' &&
                                            typeof shape.setYf === 'function';

                                        if (isCompositeGroup) {
                                            shape.setXf(newXf);
                                            shape.setYf(newYf);
                                            continue;
                                        }

                                        if (
                                            typeof shape.setXf === 'function' &&
                                            typeof shape.setYf === 'function') {

                                            shape.setXf(newXf);
                                            shape.setYf(newYf);
                                            continue;
                                        }

                                    }
                                },

                                mouseUpListener: async (x, y) => {
                                    hd.isResizing = false;
                                },

                                close: () => {
                                    hd.isResizing = false;
                                }
                            };

                            setTimeout(() => {
                                hd.selected_glyphs = selected_glyphs;
                                this.wb(hd);
                                hd.startX = null;
                                hd.startY = null;
                                hd.currentX = null;
                                hd.currentY = null;
                            }, 100);

                        } catch (err) {
                            console.error('Failed to start resize tool: ', err);
                            this.wb(null);
                        }

                    }
                });

                menuList.push({
                    label: `Delete`,
                    click: async (xwc, ywc) => {
                        pushHistory(HM(this))
                        this.___imageCaptureRect = null;
                    }
                });

                this.showMenu(menuList)
                this.clearActionGlyphs();

            }

            setOptionsMenu(_menu) {

                if (this.mode && this.mode === 'viewer') {
                    return;
                }

                if (_menu && Array.isArray(_menu) && _menu.length > 0) {
                    const m = _menu;
                    const cols = 1;
                    const smenu2 = new Menu(
                        m,
                        this.grid.Xwc(this.grid.xi + 20),
                        this.grid.Ywc(this.grid.yi + 20),
                        'rgb(205, 255, 155)',
                        'black',
                        cols
                    );
                    return this.setOptionsMenu(smenu2);
                }

                setTimeout(() => {

                    this.options_menu = null;
                    this.options_menu = _menu;
                    this.options_menu.menu_width = 140;

                }, 300)
            }

            showMenuOptionsForGlyph() {
                let menuList = []
                this.clearActionGlyphs();
                menuList.push({
                    label: `Move`,
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this))

                            let clickIndex = 0;
                            let hd = {
                                selected_glyphs: null,
                                startX: null,
                                startY: null,
                                currentX: null,
                                currentY: null,
                                isDrawing: true,
                                isDragging: false,
                                priority: true,
                                id: 'glyph-override-move',

                                draw: (grid, ctx) => {
                                    if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;

                                    const isNumber = v => typeof v === 'number' && Number.isFinite(v);

                                    const now = Date.now();
                                    const periodMs = 2000;
                                    const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                    const pulse = (phase + 1) / 2;

                                    const basePad = 8;
                                    const extraPad = 12;
                                    const padFactor = basePad + extraPad * pulse;

                                    const baseAlpha = 0.10;
                                    const extraAlpha = 0.25;
                                    const alpha = baseAlpha + extraAlpha * pulse;

                                    const baseLineWidth = 2;
                                    const extraLineWidth = 3;
                                    const lineWidth = baseLineWidth + extraLineWidth * pulse;

                                    ctx.save();
                                    ctx.globalAlpha = alpha;
                                    ctx.lineJoin = 'round';
                                    ctx.lineCap = 'round';
                                    ctx.strokeStyle = 'rgba(0, 150, 255, 1)';

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;
                                        const shape = gshape.shape;

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }
                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) continue;

                                        const x1 = shape.getX();
                                        const y1 = shape.getY();
                                        const x2 = shape.getXf();
                                        const y2 = shape.getYf();
                                        if (![x1, y1, x2, y2].every(isNumber)) continue;

                                        const minX = Math.min(x1, x2) - padFactor;
                                        const maxX = Math.max(x1, x2) + padFactor;
                                        const minY = Math.min(y1, y2) - padFactor;
                                        const maxY = Math.max(y1, y2) + padFactor;

                                        const wWorld = maxX - minX;
                                        const hWorld = maxY - minY;

                                        const sx = grid.X(minX);
                                        const syTop = grid.Y(maxY);
                                        const sw = grid.screenWidth(wWorld);
                                        const sh = grid.screenHeight(hWorld);

                                        ctx.lineWidth = lineWidth;
                                        ctx.beginPath();
                                        ctx.rect(sx, syTop, sw, sh);
                                        ctx.stroke();
                                    }

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    let insideAny = false;

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const s = gshape.shape;

                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                Shape._attachBBoxMethods(s);
                                            }
                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                            const x1 = Math.min(s.getX(), s.getXf());
                                            const x2 = Math.max(s.getX(), s.getXf());
                                            const y1 = Math.min(s.getY(), s.getYf());
                                            const y2 = Math.max(s.getY(), s.getYf());

                                            if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) {
                                                insideAny = true;
                                                break;
                                            }
                                        }
                                    }

                                    if (!insideAny) {
                                        this.wb(null);
                                        return;
                                    }

                                    hd.startX = x;
                                    hd.startY = y;
                                    hd.currentX = x;
                                    hd.currentY = y;
                                    hd.isDragging = true;
                                    clickIndex++;
                                    if (clickIndex > 1) {
                                        this.wb(null);
                                        this.deselectAll();
                                    }

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const shape = gshape.shape;

                                            if (!shape.getX || !shape.getY) {
                                                Shape._attachBBoxMethods(shape);
                                            }

                                            if (shape.getX && shape.getY) {
                                                gshape._dragOffsetX = shape.getX() - wx;
                                                gshape._dragOffsetY = shape.getY() - wy;
                                            } else {
                                                gshape._dragOffsetX = 0;
                                                gshape._dragOffsetY = 0;
                                            }
                                        }
                                    }
                                },

                                mouseMoveListener: (x, y) => {
                                    if (!hd.selected_glyphs) return;
                                    if (!hd.isDragging) return;

                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;

                                        let shape = gshape.shape;
                                        const offX = gshape._dragOffsetX ?? 0;
                                        const offY = gshape._dragOffsetY ?? 0;

                                        const targetX = wx + offX;
                                        const targetY = wy + offY;

                                        if (typeof shape.setX === 'function') shape.setX(targetX);
                                        else if ('x' in shape) shape.x = targetX;
                                        else if ('cx' in shape) shape.cx = targetX;

                                        if (typeof shape.setY === 'function') shape.setY(targetY);
                                        else if ('y' in shape) shape.y = targetY;
                                        else if ('cy' in shape) shape.cy = targetY;
                                    }
                                },

                                mouseUpListener: async (x, y) => {
                                    hd.isDragging = false;
                                },

                                close: () => {
                                    hd.isDragging = false;
                                }
                            };

                            setTimeout(() => {
                                hd.selected_glyphs = selected_glyphs;
                                this.wb(hd);
                                hd.startX = null;
                                hd.startY = null;
                                hd.currentX = null;
                                hd.currentY = null;
                            }, 100);

                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err);
                            this.wb(null);
                        }

                    }
                })


                menuList.push({
                    label: 'Tighten',
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this));

                            const translateDeep = (s, dx, dy) => {
                                if (!s) return;

                                if ('x' in s) s.x += dx;
                                if ('y' in s) s.y += dy;
                                if ('xf' in s) s.xf += dx;
                                if ('yf' in s) s.yf += dy;

                                if ('x1' in s) s.x1 += dx;
                                if ('y1' in s) s.y1 += dy;
                                if ('x2' in s) s.x2 += dx;
                                if ('y2' in s) s.y2 += dy;

                                if ('cx' in s) s.cx += dx;
                                if ('cy' in s) s.cy += dy;

                                if ('x3' in s) s.x3 += dx;
                                if ('y3' in s) s.y3 += dy;
                                if ('x4' in s) s.x4 += dx;
                                if ('y4' in s) s.y4 += dy;

                                if (Array.isArray(s.pts)) {
                                    for (const p of s.pts) {
                                        if (!p) continue;
                                        if ('x' in p) p.x += dx;
                                        if ('y' in p) p.y += dy;
                                    }
                                }

                                if (Array.isArray(s.shapes)) {
                                    for (const child of s.shapes) translateDeep(child, dx, dy);
                                }
                            };

                            const getCircleData = (group) => {
                                if (!group?.shapes) return null;

                                const circle = group.shapes.find(
                                    s =>
                                        s &&
                                        s.type === 'circle' &&
                                        typeof s.cx === 'number' &&
                                        typeof s.cy === 'number'
                                );

                                if (!circle) return null;

                                let r = null;
                                if (typeof circle.r === 'number' && Number.isFinite(circle.r)) r = circle.r;
                                else if (typeof circle.rx === 'number' && Number.isFinite(circle.rx)) r = circle.rx;
                                else if (typeof circle.ry === 'number' && Number.isFinite(circle.ry)) r = circle.ry;

                                if (!(typeof r === 'number' && Number.isFinite(r) && r > 0)) return null;

                                return { circle, cx: circle.cx, cy: circle.cy, r };
                            };

                            const ensureBBox = (s) => {
                                if (!s) return null;

                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                    if (typeof Shape !== 'undefined' && Shape._attachBBoxMethods) {
                                        Shape._attachBBoxMethods(s);
                                    }
                                }

                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) return null;

                                const x1 = s.getX();
                                const y1 = s.getY();
                                const x2 = s.getXf();
                                const y2 = s.getYf();

                                if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) {
                                    return null;
                                }

                                return {
                                    x1: Math.min(x1, x2),
                                    y1: Math.min(y1, y2),
                                    x2: Math.max(x1, x2),
                                    y2: Math.max(y1, y2)
                                };
                            };

                            const getObjectCenter = (obj) => {
                                const c = getCircleData(obj);
                                if (c) return { x: c.cx, y: c.cy, r: c.r };

                                const box = ensureBBox(obj);
                                if (!box) return null;

                                return {
                                    x: (box.x1 + box.x2) / 2,
                                    y: (box.y1 + box.y2) / 2,
                                    r: Math.max(8, Math.min(box.x2 - box.x1, box.y2 - box.y1) * 0.5)
                                };
                            };

                            const buildNodeList = (rootShape) => {
                                if (!rootShape?.shapes?.length) return [];

                                const nodes = [];

                                for (const s of rootShape.shapes) {
                                    if (!s) continue;

                                    const c = getCircleData(s);
                                    if (!c) continue;

                                    nodes.push({
                                        object: s,
                                        x: c.cx,
                                        y: c.cy,
                                        r: c.r,
                                        px: c.cx,
                                        py: c.cy
                                    });
                                }

                                nodes.sort((a, b) => a.x - b.x);
                                return nodes;
                            };

                            const tightenNodesElasticAlongAxis = (nodes, opts = {}) => {
                                const {
                                    shrink = 0.78,
                                    springIters = 20,
                                    collisionIters = 12,
                                    springiness = 0.22,
                                    padding = 4
                                } = opts;

                                if (!nodes || nodes.length < 2) return false;

                                const originalCenters = nodes.map(n => ({ x: n.x, y: n.y }));

                                // Global chain axis from first to last node
                                let ax = nodes[nodes.length - 1].x - nodes[0].x;
                                let ay = nodes[nodes.length - 1].y - nodes[0].y;
                                let alen = Math.sqrt(ax * ax + ay * ay);

                                if (alen < 0.00001) {
                                    ax = 1;
                                    ay = 0;
                                    alen = 1;
                                }

                                const ux = ax / alen;
                                const uy = ay / alen;

                                // Perpendicular axis
                                const px = -uy;
                                const py = ux;

                                // Convert each node into axis coordinates:
                                // t = along-chain coordinate
                                // s = perpendicular coordinate (kept fixed)
                                for (const n of nodes) {
                                    n.t = n.x * ux + n.y * uy;
                                    n.s = n.x * px + n.y * py;
                                }

                                const links = [];
                                for (let i = 0; i < nodes.length - 1; i++) {
                                    const a = nodes[i];
                                    const b = nodes[i + 1];

                                    const distAlong = Math.abs(b.t - a.t) || 1;
                                    const minAllowed = a.r + b.r + padding;
                                    const rest = Math.max(minAllowed, distAlong * shrink);

                                    links.push({ a, b, rest });
                                }

                                const centroidT = nodes.reduce((sum, n) => sum + n.t, 0) / nodes.length;

                                const solveSprings = () => {
                                    for (let k = 0; k < springIters; k++) {
                                        for (const link of links) {
                                            const { a, b, rest } = link;

                                            let dt = b.t - a.t;
                                            let dist = Math.abs(dt) || 0.00001;
                                            let sign = dt >= 0 ? 1 : -1;

                                            const diff = dist - rest;
                                            const offset = 0.5 * springiness * diff * sign;

                                            a.t += offset;
                                            b.t -= offset;
                                        }
                                    }
                                };

                                const solveCollisions = () => {
                                    for (let k = 0; k < collisionIters; k++) {
                                        for (let i = 0; i < nodes.length; i++) {
                                            const a = nodes[i];

                                            for (let j = i + 1; j < nodes.length; j++) {
                                                const b = nodes[j];

                                                let dt = b.t - a.t;
                                                let dist = Math.abs(dt);
                                                const minDist = a.r + b.r + padding;

                                                if (dist >= minDist) continue;

                                                if (dist < 0.00001) {
                                                    dt = 0.0001;
                                                    dist = 0.0001;
                                                }

                                                const sign = dt >= 0 ? 1 : -1;
                                                const push = 0.5 * (minDist - dist) * sign;

                                                a.t -= push;
                                                b.t += push;
                                            }
                                        }
                                    }
                                };

                                for (let iter = 0; iter < 12; iter++) {
                                    solveSprings();
                                    solveCollisions();
                                }

                                // Recenter along axis only
                                const newCentroidT = nodes.reduce((sum, n) => sum + n.t, 0) / nodes.length;
                                const dtCenter = centroidT - newCentroidT;

                                for (const n of nodes) {
                                    n.t += dtCenter;
                                }

                                // Rebuild x/y from axis coordinates
                                for (const n of nodes) {
                                    n.x = n.t * ux + n.s * px;
                                    n.y = n.t * uy + n.s * py;
                                }

                                // Apply translations to objects
                                for (let i = 0; i < nodes.length; i++) {
                                    const n = nodes[i];
                                    const prev = originalCenters[i];
                                    const dx = n.x - prev.x;
                                    const dy = n.y - prev.y;
                                    translateDeep(n.object, dx, dy);
                                }

                                return true;
                            };

                            let changed = false;

                            if (selected_glyphs?.length) {
                                for (const gshape of selected_glyphs) {
                                    if (!gshape?.shape) continue;

                                    const nodes = buildNodeList(gshape.shape);
                                    if (nodes.length < 2) continue;

                                    const ok = tightenNodesElastic(nodes, {
                                        shrink: 0.78,     // smaller = tighter
                                        springIters: 18,
                                        collisionIters: 10,
                                        springiness: 0.22,
                                        padding: 4
                                    });

                                    if (ok) changed = true;
                                }
                            }

                            if (changed) {
                                if (typeof this.render === 'function') this.render();
                                if (typeof this.draw === 'function') this.draw();
                            }
                        } catch (err) {
                            console.error('Tighten Chain failed:', err);
                            this.wb(null);
                        }
                    }
                });







                menuList.push({
                    label: 'Elastic Move',
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this));

                            const RNA_COMPLEMENT = { A: 'U', U: 'A', G: 'C', C: 'G', T: 'A' };
                            const DNA_COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', U: 'A' };

                            const normalizeBase = (b, chemistry = 'RNA') => {
                                const x = String(b || '').toUpperCase().replace(/[^AUGCT]/g, '');
                                if (!x) return 'N';
                                const y = x[x.length - 1];
                                return chemistry === 'RNA' ? (y === 'T' ? 'U' : y) : (y === 'U' ? 'T' : y);
                            };

                            const isComplement = (a, b, chemistry = 'RNA') => {
                                const table = chemistry === 'RNA' ? RNA_COMPLEMENT : DNA_COMPLEMENT;
                                return table[normalizeBase(a, chemistry)] === normalizeBase(b, chemistry);
                            };

                            const pairColor = (a, b, chemistry = 'RNA') => {
                                const aa = normalizeBase(a, chemistry);
                                const bb = normalizeBase(b, chemistry);
                                if ((aa === 'A' && bb === 'U') || (aa === 'U' && bb === 'A') ||
                                    (aa === 'A' && bb === 'T') || (aa === 'T' && bb === 'A')) return '#2563EB';
                                if ((aa === 'G' && bb === 'C') || (aa === 'C' && bb === 'G')) return '#059669';
                                return '#9CA3AF';
                            };

                            const getBaseFromGlyphObject = (obj) => {
                                if (!obj?.shapes) return 'N';
                                for (const s of obj.shapes) {
                                    if (
                                        s &&
                                        s.type === 'text' &&
                                        typeof s.text === 'string' &&
                                        /^[ACGTU]$/i.test(s.text.trim())
                                    ) {
                                        return s.text.trim().toUpperCase();
                                    }
                                }
                                return 'N';
                            };

                            const estimateHairpinStem = (bases, minLoop = 3, chemistry = 'RNA') => {
                                const n = bases.length;
                                let best = null;

                                for (let stem = Math.floor((n - minLoop) / 2); stem >= 2; stem--) {
                                    for (let loop = minLoop; loop <= n - 2 * stem; loop++) {
                                        const leftStart = 0;
                                        const leftEnd = stem - 1;
                                        const rightStart = stem + loop;
                                        const rightEnd = rightStart + stem - 1;
                                        if (rightEnd >= n) continue;

                                        let matches = 0;
                                        let longest = 0;
                                        let run = 0;

                                        for (let i = 0; i < stem; i++) {
                                            const lb = bases[leftStart + i];
                                            const rb = bases[rightEnd - i];
                                            if (isComplement(lb, rb, chemistry)) {
                                                matches++;
                                                run++;
                                                longest = Math.max(longest, run);
                                            } else {
                                                run = 0;
                                            }
                                        }

                                        const candidate = {
                                            stemLen: stem,
                                            loopLen: loop,
                                            leftStart,
                                            leftEnd,
                                            rightStart,
                                            rightEnd,
                                            matches,
                                            longest
                                        };

                                        if (
                                            !best ||
                                            longest > best.longest ||
                                            (longest === best.longest && matches > best.matches) ||
                                            (longest === best.longest && matches === best.matches && stem > best.stemLen)
                                        ) {
                                            best = candidate;
                                        }
                                    }
                                }

                                return best;
                            };

                            const removeHairpinPairLines = (rootShape) => {
                                if (!rootShape?.shapes) return;
                                rootShape.shapes = rootShape.shapes.filter(s => !s?._hairpinPairLine);
                            };

                            const addHairpinPairLine = (rootShape, x1, y1, x2, y2, color = '#9CA3AF') => {
                                if (!rootShape?.shapes) return;
                                rootShape.shapes.push({
                                    type: 'line',
                                    x1, y1, x2, y2,
                                    _hairpinPairLine: true,
                                    style: {
                                        fill: 'none',
                                        stroke: color,
                                        strokeWidth: 1.6,
                                        strokeDasharray: '5 4'
                                    }
                                });
                            };

                            const translateDeep = (s, dx, dy) => {
                                if (!s) return;

                                if ('x' in s) s.x += dx;
                                if ('y' in s) s.y += dy;
                                if ('xf' in s) s.xf += dx;
                                if ('yf' in s) s.yf += dy;

                                if ('x1' in s) s.x1 += dx;
                                if ('y1' in s) s.y1 += dy;
                                if ('x2' in s) s.x2 += dx;
                                if ('y2' in s) s.y2 += dy;

                                if ('cx' in s) s.cx += dx;
                                if ('cy' in s) s.cy += dy;

                                if ('x3' in s) s.x3 += dx;
                                if ('y3' in s) s.y3 += dy;
                                if ('x4' in s) s.x4 += dx;
                                if ('y4' in s) s.y4 += dy;

                                if ('rx' in s && typeof s.rx === 'number' && !('cx' in s)) s.rx += dx;
                                if ('ry' in s && typeof s.ry === 'number' && !('cy' in s)) s.ry += dy;

                                if (Array.isArray(s.pts)) {
                                    for (const p of s.pts) {
                                        if (!p) continue;
                                        if ('x' in p) p.x += dx;
                                        if ('y' in p) p.y += dy;
                                    }
                                }

                                if (Array.isArray(s.shapes)) {
                                    for (const child of s.shapes) translateDeep(child, dx, dy);
                                }
                            };

                            const getCircleCenter = (group) => {
                                if (!group?.shapes) return null;
                                const circle = group.shapes.find(s => s && s.type === 'circle');
                                if (!circle) return null;
                                return { circle, x: circle.cx, y: circle.cy };
                            };

                            const buildElasticChain = (rootShape) => {
                                if (!rootShape?.shapes?.length) return null;

                                const all = rootShape.shapes.slice();

                                const isLine = (s) =>
                                    s &&
                                    s.type === 'line' &&
                                    typeof s.x1 === 'number' &&
                                    typeof s.y1 === 'number' &&
                                    typeof s.x2 === 'number' &&
                                    typeof s.y2 === 'number';

                                const isShapeObject = (s) => s && !isLine(s);

                                const ensureBBox = (s) => {
                                    if (!s) return null;

                                    if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                        if (typeof Shape !== 'undefined' && Shape._attachBBoxMethods) {
                                            Shape._attachBBoxMethods(s);
                                        }
                                    }

                                    if (!s.getX || !s.getY || !s.getXf || !s.getYf) return null;

                                    const x1 = s.getX();
                                    const y1 = s.getY();
                                    const x2 = s.getXf();
                                    const y2 = s.getYf();

                                    if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) {
                                        return null;
                                    }

                                    return {
                                        x1: Math.min(x1, x2),
                                        y1: Math.min(y1, y2),
                                        x2: Math.max(x1, x2),
                                        y2: Math.max(y1, y2)
                                    };
                                };

                                const pointInBox = (px, py, b, pad = 0) => {
                                    if (!b) return false;
                                    return (
                                        px >= b.x1 - pad &&
                                        px <= b.x2 + pad &&
                                        py >= b.y1 - pad &&
                                        py <= b.y2 + pad
                                    );
                                };

                                const dist2 = (x1, y1, x2, y2) => {
                                    const dx = x2 - x1;
                                    const dy = y2 - y1;
                                    return dx * dx + dy * dy;
                                };

                                const normalize = (x, y) => {
                                    const d = Math.sqrt(x * x + y * y) || 0.00001;
                                    return { x: x / d, y: y / d, d };
                                };

                                const getCircleData = (group) => {
                                    if (!group?.shapes) return null;

                                    const circle = group.shapes.find(
                                        s =>
                                            s &&
                                            s.type === 'circle' &&
                                            typeof s.cx === 'number' &&
                                            typeof s.cy === 'number'
                                    );

                                    if (!circle) return null;

                                    let r = null;
                                    if (typeof circle.r === 'number' && Number.isFinite(circle.r)) {
                                        r = circle.r;
                                    } else if (typeof circle.rx === 'number' && Number.isFinite(circle.rx)) {
                                        r = circle.rx;
                                    } else if (typeof circle.ry === 'number' && Number.isFinite(circle.ry)) {
                                        r = circle.ry;
                                    }

                                    if (!(typeof r === 'number' && Number.isFinite(r) && r > 0)) {
                                        return null;
                                    }

                                    return {
                                        circle,
                                        cx: circle.cx,
                                        cy: circle.cy,
                                        r
                                    };
                                };

                                const getObjectCenter = (obj) => {
                                    const circleData = getCircleData(obj);
                                    if (circleData) {
                                        return {
                                            x: circleData.cx,
                                            y: circleData.cy,
                                            r: circleData.r,
                                            isCircle: true
                                        };
                                    }

                                    const box = ensureBBox(obj);
                                    if (!box) {
                                        return { x: 0, y: 0, r: 0, isCircle: false };
                                    }

                                    return {
                                        x: (box.x1 + box.x2) / 2,
                                        y: (box.y1 + box.y2) / 2,
                                        r: 0,
                                        isCircle: false
                                    };
                                };

                                const shapeObjects = all.filter(isShapeObject);

                                const findHitObject = (x, y, exclude = null, pad = 6) => {
                                    let best = null;
                                    let bestD2 = Infinity;

                                    for (const s of shapeObjects) {
                                        if (!s || s === exclude) continue;

                                        const box = ensureBBox(s);
                                        if (!box) continue;
                                        if (!pointInBox(x, y, box, pad)) continue;

                                        const cx = (box.x1 + box.x2) / 2;
                                        const cy = (box.y1 + box.y2) / 2;
                                        const d = dist2(x, y, cx, cy);

                                        if (d < bestD2) {
                                            bestD2 = d;
                                            best = s;
                                        }
                                    }

                                    return best;
                                };

                                const endpointNodes = [];
                                const endpointToNode = new Map();
                                const lineObjects = all.filter(isLine);

                                for (const line of lineObjects) {
                                    const endAObj = findHitObject(line.x1, line.y1, null, 8);
                                    const endBObj = findHitObject(line.x2, line.y2, null, 8);

                                    if (endAObj) {
                                        const key = `${line.x1.toFixed(3)},${line.y1.toFixed(3)}`;
                                        if (!endpointToNode.has(key)) {
                                            const node = {
                                                key,
                                                x: line.x1,
                                                y: line.y1,
                                                px: line.x1,
                                                py: line.y1,
                                                pinned: false,
                                                locked: false,
                                                object: endAObj,
                                                attachedLines: new Set([line]),
                                                anchorDirX: 0,
                                                anchorDirY: 0
                                            };
                                            endpointToNode.set(key, node);
                                            endpointNodes.push(node);
                                        } else {
                                            endpointToNode.get(key).attachedLines.add(line);
                                        }
                                    }

                                    if (endBObj) {
                                        const key = `${line.x2.toFixed(3)},${line.y2.toFixed(3)}`;
                                        if (!endpointToNode.has(key)) {
                                            const node = {
                                                key,
                                                x: line.x2,
                                                y: line.y2,
                                                px: line.x2,
                                                py: line.y2,
                                                pinned: false,
                                                locked: false,
                                                object: endBObj,
                                                attachedLines: new Set([line]),
                                                anchorDirX: 0,
                                                anchorDirY: 0
                                            };
                                            endpointToNode.set(key, node);
                                            endpointNodes.push(node);
                                        } else {
                                            endpointToNode.get(key).attachedLines.add(line);
                                        }
                                    }
                                }

                                if (endpointNodes.length < 2) return null;

                                const links = [];
                                for (const line of lineObjects) {
                                    const keyA = `${line.x1.toFixed(3)},${line.y1.toFixed(3)}`;
                                    const keyB = `${line.x2.toFixed(3)},${line.y2.toFixed(3)}`;

                                    const a = endpointToNode.get(keyA);
                                    const b = endpointToNode.get(keyB);
                                    if (!a || !b || a === b) continue;

                                    const dx = b.x - a.x;
                                    const dy = b.y - a.y;

                                    links.push({
                                        a,
                                        b,
                                        line,
                                        rest: Math.sqrt(dx * dx + dy * dy) || 1
                                    });
                                }

                                if (links.length < 1) return null;

                                const points = endpointNodes.slice().sort((a, b) => a.x - b.x);

                                const dragState = {
                                    active: false,
                                    draggedIndex: -1,
                                    lockedIndex: -1,
                                    startMouse: { x: 0, y: 0 },
                                    basePositions: []
                                };

                                const neighborLinks = [];
                                for (let i = 0; i < points.length - 1; i++) {
                                    const a = points[i];
                                    const b = points[i + 1];
                                    const dx = b.x - a.x;
                                    const dy = b.y - a.y;
                                    neighborLinks.push({
                                        a,
                                        b,
                                        rest: Math.sqrt(dx * dx + dy * dy) || 1
                                    });
                                }

                                const objectBundles = new Map();
                                for (const node of points) {
                                    const obj = node.object;
                                    if (!obj) continue;

                                    const circleData = getCircleData(obj);
                                    const box = ensureBBox(obj);
                                    if (!box) continue;

                                    const cx = circleData ? circleData.cx : (box.x1 + box.x2) / 2;
                                    const cy = circleData ? circleData.cy : (box.y1 + box.y2) / 2;

                                    if (!(node.locked && (node.anchorDirX || node.anchorDirY))) {
                                        const dir = normalize(node.x - cx, node.y - cy);
                                        node.anchorDirX = dir.x;
                                        node.anchorDirY = dir.y;
                                    }

                                    if (!objectBundles.has(obj)) {
                                        objectBundles.set(obj, {
                                            object: obj,
                                            nodes: [],
                                            lines: new Set()
                                        });
                                    }

                                    const bundle = objectBundles.get(obj);
                                    bundle.nodes.push(node);

                                    for (const ln of node.attachedLines) {
                                        bundle.lines.add(ln);
                                    }
                                }

                                const syncVisuals = () => {
                                    for (const bundle of objectBundles.values()) {
                                        const obj = bundle.object;
                                        if (!obj) continue;

                                        let sumDx = 0;
                                        let sumDy = 0;
                                        let n = 0;

                                        for (const node of bundle.nodes) {
                                            const center = getObjectCenter(obj);
                                            sumDx += (node.x - center.x);
                                            sumDy += (node.y - center.y);
                                            n++;
                                        }

                                        if (n > 0) {
                                            translateDeep(obj, sumDx / n, sumDy / n);
                                        }

                                        const center = getObjectCenter(obj);
                                        for (const node of bundle.nodes) {
                                            node.x = center.x;
                                            node.y = center.y;
                                        }
                                    }

                                    for (const seg of links) {
                                        const aObj = seg.a.object;
                                        const bObj = seg.b.object;

                                        if (aObj && bObj) {
                                            const aCenter = getObjectCenter(aObj);
                                            const bCenter = getObjectCenter(bObj);

                                            seg.a.x = aCenter.x;
                                            seg.a.y = aCenter.y;
                                            seg.b.x = bCenter.x;
                                            seg.b.y = bCenter.y;

                                            seg.line.x1 = aCenter.x;
                                            seg.line.y1 = aCenter.y;
                                            seg.line.x2 = bCenter.x;
                                            seg.line.y2 = bCenter.y;
                                        } else {
                                            seg.line.x1 = seg.a.x;
                                            seg.line.y1 = seg.a.y;
                                            seg.line.x2 = seg.b.x;
                                            seg.line.y2 = seg.b.y;
                                        }
                                    }
                                };

                                const refreshRestLengths = () => {
                                    for (const link of links) {
                                        const dx = link.b.x - link.a.x;
                                        const dy = link.b.y - link.a.y;
                                        link.rest = Math.sqrt(dx * dx + dy * dy) || 1;
                                    }

                                    for (const link of neighborLinks) {
                                        const dx = link.b.x - link.a.x;
                                        const dy = link.b.y - link.a.y;
                                        link.rest = Math.sqrt(dx * dx + dy * dy) || 1;
                                    }
                                };

                                const freezeCurrentPose = () => {
                                    for (const p of points) {
                                        p.px = p.x;
                                        p.py = p.y;
                                    }
                                };

                                const solveNodeCollisions = (iterations = 4, minDist = 18) => {
                                    const minDist2 = minDist * minDist;

                                    for (let k = 0; k < iterations; k++) {
                                        for (let i = 0; i < points.length; i++) {
                                            const a = points[i];

                                            for (let j = i + 1; j < points.length; j++) {
                                                const b = points[j];

                                                let dx = b.x - a.x;
                                                let dy = b.y - a.y;
                                                let d2 = dx * dx + dy * dy;
                                                if (d2 >= minDist2) continue;

                                                let d = Math.sqrt(d2);
                                                if (d < 0.00001) {
                                                    dx = 0.0001;
                                                    dy = 0;
                                                    d = 0.0001;
                                                }

                                                const overlap = (minDist - d) / d;
                                                const ox = dx * 0.5 * overlap;
                                                const oy = dy * 0.5 * overlap;

                                                const aFixed = a.pinned || a.locked;
                                                const bFixed = b.pinned || b.locked;

                                                if (!aFixed && !bFixed) {
                                                    a.x -= ox;
                                                    a.y -= oy;
                                                    b.x += ox;
                                                    b.y += oy;
                                                } else if (aFixed && !bFixed) {
                                                    b.x += ox * 2;
                                                    b.y += oy * 2;
                                                } else if (!aFixed && bFixed) {
                                                    a.x -= ox * 2;
                                                    a.y -= oy * 2;
                                                }
                                            }
                                        }
                                    }
                                };

                                const solveLinks = (activeLinks, iterations = 12, stiffness = 0.18) => {
                                    for (let k = 0; k < iterations; k++) {
                                        for (const link of activeLinks) {
                                            const a = link.a;
                                            const b = link.b;

                                            let dx = b.x - a.x;
                                            let dy = b.y - a.y;
                                            let dist = Math.sqrt(dx * dx + dy * dy) || 0.00001;

                                            const diff = (dist - link.rest) / dist;
                                            const ox = dx * 0.5 * stiffness * diff;
                                            const oy = dy * 0.5 * stiffness * diff;

                                            if (!a.pinned && !a.locked) {
                                                a.x += ox;
                                                a.y += oy;
                                            }
                                            if (!b.pinned && !b.locked) {
                                                b.x -= ox;
                                                b.y -= oy;
                                            }
                                        }
                                    }
                                };

                                const settle = (damping = 0.08) => {
                                    for (const p of points) {
                                        if (p.pinned || p.locked) continue;

                                        const vx = (p.x - p.px) * damping;
                                        const vy = (p.y - p.py) * damping;

                                        p.px = p.x;
                                        p.py = p.y;
                                        p.x += vx;
                                        p.y += vy;
                                    }
                                };

                                const captureBasePositions = () => {
                                    dragState.basePositions = points.map(p => ({ x: p.x, y: p.y }));
                                };

                                const clearLocks = () => {
                                    for (const p of points) p.locked = false;
                                };

                                const chooseLockedTerminal = (draggedIndex) => {
                                    const leftDist = Math.abs(draggedIndex - 0);
                                    const rightDist = Math.abs((points.length - 1) - draggedIndex);
                                    return rightDist >= leftDist ? points.length - 1 : 0;
                                };

                                const applyAxialFalloffDrag = () => {
                                    if (!dragState.active) return;

                                    const dragged = points[dragState.draggedIndex];
                                    const locked = points[dragState.lockedIndex];
                                    if (!dragged || !locked) return;

                                    const baseDragged = dragState.basePositions[dragState.draggedIndex];
                                    const baseLocked = dragState.basePositions[dragState.lockedIndex];
                                    if (!baseDragged || !baseLocked) return;

                                    const mdx = dragged.x - dragState.startMouse.x;
                                    const mdy = dragged.y - dragState.startMouse.y;

                                    const axis0x = baseDragged.x - baseLocked.x;
                                    const axis0y = baseDragged.y - baseLocked.y;
                                    const axisLen = Math.sqrt(axis0x * axis0x + axis0y * axis0y) || 0.00001;
                                    const ux = axis0x / axisLen;
                                    const uy = axis0y / axisLen;

                                    const axialAmount = mdx * ux + mdy * uy;

                                    const lo = Math.min(dragState.draggedIndex, dragState.lockedIndex);
                                    const hi = Math.max(dragState.draggedIndex, dragState.lockedIndex);
                                    const totalSteps = Math.max(1, Math.abs(dragState.lockedIndex - dragState.draggedIndex));

                                    for (let i = lo; i <= hi; i++) {
                                        if (i === dragState.draggedIndex || i === dragState.lockedIndex) continue;

                                        const p = points[i];
                                        const base = dragState.basePositions[i];
                                        if (!p || !base) continue;

                                        const stepsFromDragged = Math.abs(i - dragState.draggedIndex);
                                        const t = stepsFromDragged / totalSteps;
                                        const influence = Math.pow(1 - t, 2);

                                        p.x = base.x + ux * axialAmount * influence;
                                        p.y = base.y + uy * axialAmount * influence;
                                    }

                                    locked.x = baseLocked.x;
                                    locked.y = baseLocked.y;
                                    locked.px = baseLocked.x;
                                    locked.py = baseLocked.y;
                                };

                                const step = () => {
                                    settle();
                                    applyAxialFalloffDrag();
                                    solveLinks(links, 10, 0.02);
                                    solveLinks(neighborLinks, 6, 0.10);
                                    solveNodeCollisions(0, 0);

                                    if (dragState.active && dragState.draggedIndex >= 0) {
                                        const p = points[dragState.draggedIndex];
                                        if (p) {
                                            p.px = p.x;
                                            p.py = p.y;
                                        }
                                    }

                                    syncVisuals();
                                };

                                const nearestPointIndex = (wx, wy, maxDist = 80) => {
                                    let best = -1;
                                    let bestD2 = maxDist * maxDist;

                                    for (let i = 0; i < points.length; i++) {
                                        if (points[i].locked) continue;

                                        const d = dist2(wx, wy, points[i].x, points[i].y);
                                        if (d < bestD2) {
                                            bestD2 = d;
                                            best = i;
                                        }
                                    }
                                    return best;
                                };

                                const foldChainIntoHairpin = (
                                    localPoints,
                                    localRootShape,
                                    {
                                        chemistry = 'RNA',
                                        stemGap = 28,
                                        loopRadius = 34,
                                        minLoop = 3,
                                        flipVertical = false
                                    } = {}
                                ) => {
                                    if (!localPoints || localPoints.length < 6) return false;

                                    const ordered = localPoints.slice();
                                    const n = ordered.length;

                                    const bases = ordered.map(p => getBaseFromGlyphObject(p.object));
                                    const hp = estimateHairpinStem(bases, minLoop, chemistry);
                                    if (!hp || hp.stemLen < 2) return false;

                                    const { stemLen, loopLen } = hp;
                                    const totalNeeded = stemLen * 2 + loopLen;
                                    if (totalNeeded > n) return false;

                                    let origCx = 0;
                                    let origCy = 0;
                                    for (const p of ordered) {
                                        origCx += p.x;
                                        origCy += p.y;
                                    }
                                    origCx /= ordered.length;
                                    origCy /= ordered.length;

                                    const segLens = [];
                                    for (let i = 0; i < n - 1; i++) {
                                        const dx = ordered[i + 1].x - ordered[i].x;
                                        const dy = ordered[i + 1].y - ordered[i].y;
                                        segLens.push(Math.sqrt(dx * dx + dy * dy) || 1);
                                    }
                                    const avgStep = segLens.length
                                        ? segLens.reduce((a, b) => a + b, 0) / segLens.length
                                        : 48;

                                    const anchor = ordered[0];
                                    const tail = ordered[n - 1];

                                    let axisX = tail.x - anchor.x;
                                    let axisY = tail.y - anchor.y;
                                    let axisLen = Math.sqrt(axisX * axisX + axisY * axisY);
                                    if (axisLen < 0.00001) {
                                        axisX = 1;
                                        axisY = 0;
                                        axisLen = 1;
                                    }

                                    if (axisX < 0) {
                                        axisX *= -1;
                                        axisY *= -1;
                                    }

                                    const ux = axisX / axisLen;
                                    const uy = axisY / axisLen;
                                    const px = uy;
                                    const py = -ux;

                                    const stemRise = avgStep * Math.max(0, stemLen - 1);
                                    const desiredLoopArc = avgStep * Math.max(1, loopLen - 1);
                                    const r = Math.max(loopRadius, desiredLoopArc / Math.PI);
                                    const loopArc = Math.PI * r;
                                    const halfGap = stemGap * 0.5;

                                    const stem1Start = {
                                        x: -ux * (stemRise * 0.5),
                                        y: -uy * (stemRise * 0.5)
                                    };
                                    const stem1End = {
                                        x: ux * (stemRise * 0.5),
                                        y: uy * (stemRise * 0.5)
                                    };

                                    const loopCenter = {
                                        x: stem1End.x + px * halfGap,
                                        y: stem1End.y + py * halfGap
                                    };

                                    const stem2Start = {
                                        x: stem1End.x + px * stemGap,
                                        y: stem1End.y + py * stemGap
                                    };
                                    const stem2End = {
                                        x: stem2Start.x - ux * stemRise,
                                        y: stem2Start.y - uy * stemRise
                                    };

                                    const sampleHairpinPath = (index) => {
                                        if (index < stemLen) {
                                            const t = stemLen <= 1 ? 0 : index / (stemLen - 1);
                                            return {
                                                x: stem1Start.x + (stem1End.x - stem1Start.x) * t,
                                                y: stem1Start.y + (stem1End.y - stem1Start.y) * t
                                            };
                                        }

                                        if (index < stemLen + loopLen) {
                                            const k = index - stemLen;
                                            const t = loopLen <= 1 ? 0.5 : k / (loopLen - 1);
                                            const theta = Math.PI - Math.PI * t;

                                            return {
                                                x: loopCenter.x + px * (halfGap * Math.cos(theta)) + ux * (r * Math.sin(theta)),
                                                y: loopCenter.y + py * (halfGap * Math.cos(theta)) + uy * (r * Math.sin(theta))
                                            };
                                        }

                                        const k = index - (stemLen + loopLen);
                                        const t = stemLen <= 1 ? 0 : k / (stemLen - 1);
                                        return {
                                            x: stem2Start.x + (stem2End.x - stem2Start.x) * t,
                                            y: stem2Start.y + (stem2End.y - stem2Start.y) * t
                                        };
                                    };

                                    for (let i = 0; i < totalNeeded; i++) {
                                        const pos = sampleHairpinPath(i);
                                        ordered[i].x = pos.x;
                                        ordered[i].y = pos.y;
                                        ordered[i].px = pos.x;
                                        ordered[i].py = pos.y;
                                    }

                                    for (let i = totalNeeded; i < n; i++) {
                                        const prev = ordered[i - 1];
                                        ordered[i].x = prev.x - ux * avgStep;
                                        ordered[i].y = prev.y - uy * avgStep;
                                        ordered[i].px = ordered[i].x;
                                        ordered[i].py = ordered[i].y;
                                    }

                                    if (flipVertical) {
                                        for (const p of ordered) {
                                            p.y = -p.y;
                                            p.py = -p.py;
                                        }
                                    }

                                    let newCx = 0;
                                    let newCy = 0;
                                    for (const p of ordered) {
                                        newCx += p.x;
                                        newCy += p.y;
                                    }
                                    newCx /= ordered.length;
                                    newCy /= ordered.length;

                                    const dx = origCx - newCx;
                                    const dy = origCy - newCy;

                                    for (const p of ordered) {
                                        p.x += dx;
                                        p.y += dy;
                                        p.px += dx;
                                        p.py += dy;
                                    }

                                    syncVisuals();
                                    refreshRestLengths();
                                    freezeCurrentPose();

                                    removeHairpinPairLines(localRootShape);

                                    for (let i = 0; i < stemLen; i++) {
                                        const leftNode = ordered[i];
                                        const rightNode = ordered[stemLen + loopLen + (stemLen - 1 - i)];

                                        const leftBase = getBaseFromGlyphObject(leftNode.object);
                                        const rightBase = getBaseFromGlyphObject(rightNode.object);

                                        if (!isComplement(leftBase, rightBase, chemistry)) continue;

                                        addHairpinPairLine(
                                            localRootShape,
                                            leftNode.x,
                                            leftNode.y,
                                            rightNode.x,
                                            rightNode.y,
                                            pairColor(leftBase, rightBase, chemistry)
                                        );
                                    }

                                    syncVisuals();
                                    return { stemLen, loopLen, loopArc, radius: r };
                                };

                                return {
                                    points,
                                    links,
                                    neighborLinks,
                                    step,
                                    nearestPointIndex,
                                    makeHairpin(opts = {}) {
                                        return foldChainIntoHairpin(points, rootShape, opts);
                                    },
                                    pinTo(index, wx, wy) {
                                        const p = points[index];
                                        if (!p) return;

                                        if (!dragState.active || dragState.draggedIndex !== index) {
                                            dragState.active = true;
                                            dragState.draggedIndex = index;
                                            dragState.lockedIndex = chooseLockedTerminal(index);
                                            dragState.startMouse = { x: wx, y: wy };
                                            captureBasePositions();
                                            clearLocks();

                                            if (points[dragState.lockedIndex]) {
                                                points[dragState.lockedIndex].locked = true;
                                            }
                                        }

                                        p.pinned = true;
                                        p.x = wx;
                                        p.y = wy;
                                        p.px = wx;
                                        p.py = wy;
                                    },
                                    commitDrag(index) {
                                        const p = points[index];
                                        if (!p) return;

                                        syncVisuals();
                                        solveNodeCollisions(1, 8);
                                        syncVisuals();

                                        refreshRestLengths();
                                        freezeCurrentPose();

                                        p.pinned = false;

                                        clearLocks();
                                        dragState.active = false;
                                        dragState.draggedIndex = -1;
                                        dragState.lockedIndex = -1;
                                        dragState.basePositions = [];
                                    },
                                    release(index) {
                                        const p = points[index];
                                        if (p) p.pinned = false;

                                        clearLocks();
                                        dragState.active = false;
                                        dragState.draggedIndex = -1;
                                        dragState.lockedIndex = -1;
                                        dragState.basePositions = [];
                                    }
                                };
                            };

                            let animFrame = null;

                            const hd = {
                                selected_glyphs,
                                isDragging: false,
                                draggedChain: null,
                                draggedGlyph: null,
                                draggedPointIndex: -1,
                                priority: true,
                                id: 'glyph-elastic-chain-move',

                                draw: (grid, ctx) => {
                                    if (!hd.selected_glyphs?.length) return;

                                    ctx.save();
                                    ctx.strokeStyle = 'rgba(0, 180, 255, 0.9)';
                                    ctx.lineWidth = 2;

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape?.shape) continue;
                                        const shape = gshape.shape;

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }

                                        const x1 = shape.getX?.();
                                        const y1 = shape.getY?.();
                                        const x2 = shape.getXf?.();
                                        const y2 = shape.getYf?.();

                                        if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) continue;

                                        const sx = grid.X(Math.min(x1, x2));
                                        const sy = grid.Y(Math.max(y1, y2));
                                        const sw = grid.screenWidth(Math.abs(x2 - x1));
                                        const sh = grid.screenHeight(Math.abs(y2 - y1));

                                        ctx.strokeRect(sx - 8, sy - 8, sw + 16, sh + 16);
                                    }

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    if (!hd.selected_glyphs?.length) {
                                        this.wb(null);
                                        return;
                                    }

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape?.shape) continue;

                                        const chain = buildElasticChain(gshape.shape);
                                        if (!chain) continue;

                                        // Uncomment this if you want immediate folding on click:
                                        // chain.makeHairpin({
                                        //     chemistry: 'RNA',
                                        //     stemGap: 26,
                                        //     loopRadius: 24,
                                        //     minLoop: 3,
                                        //     flipVertical: true
                                        // });

                                        const idx = chain.nearestPointIndex(wx, wy);
                                        if (idx >= 0) {
                                            hd.draggedGlyph = gshape;
                                            hd.draggedChain = chain;
                                            hd.draggedPointIndex = idx;
                                            hd.isDragging = true;
                                            chain.pinTo(idx, wx, wy);
                                            break;
                                        }
                                    }

                                    if (!hd.isDragging) {
                                        this.wb(null);
                                    }
                                },

                                mouseMoveListener: (x, y) => {
                                    if (!hd.isDragging || !hd.draggedChain) return;

                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    hd.draggedChain.pinTo(hd.draggedPointIndex, wx, wy);
                                    hd.draggedChain.step();
                                },

                                mouseUpListener: async () => {
                                    if (hd.draggedChain && hd.draggedPointIndex >= 0) {
                                        hd.draggedChain.commitDrag(hd.draggedPointIndex);

                                        let settleFrames = 18;
                                        const tick = () => {
                                            if (!hd.draggedChain || settleFrames <= 0) {
                                                if (animFrame) cancelAnimationFrame(animFrame);
                                                animFrame = null;
                                                return;
                                            }

                                            hd.draggedChain.step();
                                            settleFrames--;
                                            animFrame = requestAnimationFrame(tick);
                                        };

                                        animFrame = requestAnimationFrame(tick);
                                    }

                                    hd.isDragging = false;
                                    hd.draggedPointIndex = -1;
                                },

                                close: () => {
                                    hd.isDragging = false;
                                    hd.draggedChain = null;
                                    hd.draggedGlyph = null;
                                    hd.draggedPointIndex = -1;
                                    if (animFrame) cancelAnimationFrame(animFrame);
                                    animFrame = null;
                                    this.wbid = null;
                                }
                            };

                            setTimeout(() => {
                                hd.selected_glyphs = selected_glyphs;
                                this.wb(hd);
                            }, 100);

                        } catch (err) {
                            console.error('Elastic Chain Move failed:', err);
                            this.wb(null);
                        }
                    }
                });


                menuList.push({
                    label: 'Tethered Node Move',
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this));

                            const translateDeep = (s, dx, dy) => {
                                if (!s) return;

                                if ('x' in s) s.x += dx;
                                if ('y' in s) s.y += dy;
                                if ('xf' in s) s.xf += dx;
                                if ('yf' in s) s.yf += dy;

                                if ('x1' in s) s.x1 += dx;
                                if ('y1' in s) s.y1 += dy;
                                if ('x2' in s) s.x2 += dx;
                                if ('y2' in s) s.y2 += dy;

                                if ('cx' in s) s.cx += dx;
                                if ('cy' in s) s.cy += dy;

                                if ('x3' in s) s.x3 += dx;
                                if ('y3' in s) s.y3 += dy;
                                if ('x4' in s) s.x4 += dx;
                                if ('y4' in s) s.y4 += dy;

                                if ('rx' in s && typeof s.rx === 'number' && !('cx' in s)) s.rx += dx;
                                if ('ry' in s && typeof s.ry === 'number' && !('cy' in s)) s.ry += dy;

                                if (Array.isArray(s.pts)) {
                                    for (const p of s.pts) {
                                        if (!p) continue;
                                        if ('x' in p) p.x += dx;
                                        if ('y' in p) p.y += dy;
                                    }
                                }

                                if (Array.isArray(s.shapes)) {
                                    for (const child of s.shapes) translateDeep(child, dx, dy);
                                }
                            };

                            const ensureBBox = (s) => {
                                if (!s) return null;

                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                    if (typeof Shape !== 'undefined' && Shape._attachBBoxMethods) {
                                        Shape._attachBBoxMethods(s);
                                    }
                                }

                                if (!s.getX || !s.getY || !s.getXf || !s.getYf) return null;

                                const x1 = s.getX();
                                const y1 = s.getY();
                                const x2 = s.getXf();
                                const y2 = s.getYf();

                                if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) {
                                    return null;
                                }

                                return {
                                    x1: Math.min(x1, x2),
                                    y1: Math.min(y1, y2),
                                    x2: Math.max(x1, x2),
                                    y2: Math.max(y1, y2)
                                };
                            };

                            const pointInBox = (px, py, b, pad = 0) => {
                                if (!b) return false;
                                return (
                                    px >= b.x1 - pad &&
                                    px <= b.x2 + pad &&
                                    py >= b.y1 - pad &&
                                    py <= b.y2 + pad
                                );
                            };

                            const dist2 = (x1, y1, x2, y2) => {
                                const dx = x2 - x1;
                                const dy = y2 - y1;
                                return dx * dx + dy * dy;
                            };

                            const getCircleData = (group) => {
                                if (!group?.shapes) return null;

                                const circle = group.shapes.find(
                                    s =>
                                        s &&
                                        s.type === 'circle' &&
                                        typeof s.cx === 'number' &&
                                        typeof s.cy === 'number'
                                );

                                if (!circle) return null;

                                let r = null;
                                if (typeof circle.r === 'number' && Number.isFinite(circle.r)) {
                                    r = circle.r;
                                } else if (typeof circle.rx === 'number' && Number.isFinite(circle.rx)) {
                                    r = circle.rx;
                                } else if (typeof circle.ry === 'number' && Number.isFinite(circle.ry)) {
                                    r = circle.ry;
                                }

                                if (!(typeof r === 'number' && Number.isFinite(r) && r > 0)) {
                                    return null;
                                }

                                return {
                                    circle,
                                    cx: circle.cx,
                                    cy: circle.cy,
                                    r
                                };
                            };

                            const getObjectCenter = (obj) => {
                                const circleData = getCircleData(obj);
                                if (circleData) {
                                    return {
                                        x: circleData.cx,
                                        y: circleData.cy,
                                        r: circleData.r,
                                        isCircle: true
                                    };
                                }

                                const box = ensureBBox(obj);
                                if (!box) {
                                    return { x: 0, y: 0, r: 0, isCircle: false };
                                }

                                return {
                                    x: (box.x1 + box.x2) / 2,
                                    y: (box.y1 + box.y2) / 2,
                                    r: 0,
                                    isCircle: false
                                };
                            };

                            const buildTetheredNodeEditor = (rootShape) => {
                                if (!rootShape?.shapes?.length) return null;

                                const all = rootShape.shapes.slice();

                                const isLine = (s) =>
                                    s &&
                                    s.type === 'line' &&
                                    typeof s.x1 === 'number' &&
                                    typeof s.y1 === 'number' &&
                                    typeof s.x2 === 'number' &&
                                    typeof s.y2 === 'number';

                                const isShapeObject = (s) => s && !isLine(s);

                                const shapeObjects = all.filter(isShapeObject);
                                const lineObjects = all.filter(isLine);

                                const findHitObject = (x, y, exclude = null, pad = 6) => {
                                    let best = null;
                                    let bestD2 = Infinity;

                                    for (const s of shapeObjects) {
                                        if (!s || s === exclude) continue;

                                        const box = ensureBBox(s);
                                        if (!box) continue;
                                        if (!pointInBox(x, y, box, pad)) continue;

                                        const cx = (box.x1 + box.x2) / 2;
                                        const cy = (box.y1 + box.y2) / 2;
                                        const d = dist2(x, y, cx, cy);

                                        if (d < bestD2) {
                                            bestD2 = d;
                                            best = s;
                                        }
                                    }

                                    return best;
                                };

                                const endpointNodes = [];
                                const endpointToNode = new Map();

                                for (const line of lineObjects) {
                                    const endAObj = findHitObject(line.x1, line.y1, null, 8);
                                    const endBObj = findHitObject(line.x2, line.y2, null, 8);

                                    if (endAObj) {
                                        const key = `${line.x1.toFixed(3)},${line.y1.toFixed(3)}`;
                                        if (!endpointToNode.has(key)) {
                                            endpointToNode.set(key, {
                                                key,
                                                x: line.x1,
                                                y: line.y1,
                                                object: endAObj,
                                                attached: []
                                            });
                                            endpointNodes.push(endpointToNode.get(key));
                                        }
                                        endpointToNode.get(key).attached.push({ line, end: 'a' });
                                    }

                                    if (endBObj) {
                                        const key = `${line.x2.toFixed(3)},${line.y2.toFixed(3)}`;
                                        if (!endpointToNode.has(key)) {
                                            endpointToNode.set(key, {
                                                key,
                                                x: line.x2,
                                                y: line.y2,
                                                object: endBObj,
                                                attached: []
                                            });
                                            endpointNodes.push(endpointToNode.get(key));
                                        }
                                        endpointToNode.get(key).attached.push({ line, end: 'b' });
                                    }
                                }

                                if (!endpointNodes.length) return null;

                                const syncNodeFromObject = (node) => {
                                    const c = getObjectCenter(node.object);
                                    node.x = c.x;
                                    node.y = c.y;
                                };

                                const syncLinesForNode = (node) => {
                                    for (const ref of node.attached) {
                                        if (ref.end === 'a') {
                                            ref.line.x1 = node.x;
                                            ref.line.y1 = node.y;
                                        } else {
                                            ref.line.x2 = node.x;
                                            ref.line.y2 = node.y;
                                        }
                                    }
                                };

                                const syncAll = () => {
                                    for (const node of endpointNodes) {
                                        syncNodeFromObject(node);
                                        syncLinesForNode(node);
                                    }
                                };

                                const nearestNodeIndex = (wx, wy, maxDist = 80) => {
                                    let best = -1;
                                    let bestD2 = maxDist * maxDist;

                                    for (let i = 0; i < endpointNodes.length; i++) {
                                        const node = endpointNodes[i];
                                        const d = dist2(wx, wy, node.x, node.y);
                                        if (d < bestD2) {
                                            bestD2 = d;
                                            best = i;
                                        }
                                    }

                                    return best;
                                };

                                const moveNodeTo = (index, wx, wy) => {
                                    const node = endpointNodes[index];
                                    if (!node || !node.object) return false;

                                    const center = getObjectCenter(node.object);
                                    const dx = wx - center.x;
                                    const dy = wy - center.y;

                                    translateDeep(node.object, dx, dy);
                                    syncNodeFromObject(node);
                                    syncLinesForNode(node);
                                    return true;
                                };

                                syncAll();

                                return {
                                    nodes: endpointNodes,
                                    nearestNodeIndex,
                                    moveNodeTo,
                                    syncAll
                                };
                            };

                            let animFrame = null;

                            const hd = {
                                selected_glyphs,
                                isDragging: false,
                                draggedEditor: null,
                                draggedGlyph: null,
                                draggedNodeIndex: -1,
                                priority: true,
                                id: 'glyph-tethered-node-move',

                                draw: (grid, ctx) => {
                                    if (!hd.selected_glyphs?.length) return;

                                    ctx.save();
                                    ctx.strokeStyle = 'rgba(0, 180, 255, 0.9)';
                                    ctx.lineWidth = 2;

                                    for (const gshape of hd.selected_glyphs) {
                                        if (!gshape?.shape) continue;
                                        const shape = gshape.shape;

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }

                                        const x1 = shape.getX?.();
                                        const y1 = shape.getY?.();
                                        const x2 = shape.getXf?.();
                                        const y2 = shape.getYf?.();

                                        if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) continue;

                                        const sx = grid.X(Math.min(x1, x2));
                                        const sy = grid.Y(Math.max(y1, y2));
                                        const sw = grid.screenWidth(Math.abs(x2 - x1));
                                        const sh = grid.screenHeight(Math.abs(y2 - y1));

                                        ctx.strokeRect(sx - 8, sy - 8, sw + 16, sh + 16);
                                    }

                                    if (hd.draggedEditor?.nodes?.length) {
                                        ctx.fillStyle = 'rgba(0, 180, 255, 0.9)';
                                        for (const node of hd.draggedEditor.nodes) {
                                            const sx = grid.X(node.x);
                                            const sy = grid.Y(node.y);
                                            ctx.beginPath();
                                            ctx.arc(sx, sy, 4, 0, Math.PI * 2);
                                            ctx.fill();
                                        }
                                    }

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    if (!hd.selected_glyphs?.length) {
                                        this.wb(null);
                                        return;
                                    }

                                    for (const gshape of hd.selected_glyphs) {
                                        if (!gshape?.shape) continue;

                                        const editor = buildTetheredNodeEditor(gshape.shape);
                                        if (!editor) continue;

                                        const idx = editor.nearestNodeIndex(wx, wy);
                                        if (idx >= 0) {
                                            hd.draggedGlyph = gshape;
                                            hd.draggedEditor = editor;
                                            hd.draggedNodeIndex = idx;
                                            hd.isDragging = true;
                                            editor.moveNodeTo(idx, wx, wy);
                                            break;
                                        }
                                    }

                                    if (!hd.isDragging) {
                                        this.wb(null);
                                    }
                                },

                                mouseMoveListener: (x, y) => {
                                    if (!hd.isDragging || !hd.draggedEditor) return;

                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    hd.draggedEditor.moveNodeTo(hd.draggedNodeIndex, wx, wy);

                                    if (typeof this.render === 'function') this.render();
                                    if (typeof this.draw === 'function') this.draw();
                                },

                                mouseUpListener: async () => {
                                    if (hd.draggedEditor) {
                                        hd.draggedEditor.syncAll();
                                    }

                                    hd.isDragging = false;
                                    hd.draggedEditor = null;
                                    hd.draggedGlyph = null;
                                    hd.draggedNodeIndex = -1;

                                    if (animFrame) cancelAnimationFrame(animFrame);
                                    animFrame = null;
                                },

                                close: () => {
                                    hd.isDragging = false;
                                    hd.draggedEditor = null;
                                    hd.draggedGlyph = null;
                                    hd.draggedNodeIndex = -1;
                                    if (animFrame) cancelAnimationFrame(animFrame);
                                    animFrame = null;
                                    this.wbid = null;
                                }
                            };

                            setTimeout(() => {
                                hd.selected_glyphs = selected_glyphs;
                                this.wb(hd);
                            }, 100);

                        } catch (err) {
                            console.error('Tethered Node Move failed:', err);
                            this.wb(null);
                        }
                    }
                });


                menuList.push({
                    label: `Make Hairpin`,
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this));



                            const RNA_COMPLEMENT = { A: 'U', U: 'A', G: 'C', C: 'G', T: 'A' };
                            const DNA_COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', U: 'A' };

                            const normalizeBase = (b, chemistry = 'RNA') => {
                                const x = String(b || '').toUpperCase().replace(/[^AUGCT]/g, '');
                                if (!x) return 'N';
                                const y = x[x.length - 1];
                                return chemistry === 'RNA' ? (y === 'T' ? 'U' : y) : (y === 'U' ? 'T' : y);
                            };

                            const isComplement = (a, b, chemistry = 'RNA') => {
                                const table = chemistry === 'RNA' ? RNA_COMPLEMENT : DNA_COMPLEMENT;
                                return table[normalizeBase(a, chemistry)] === normalizeBase(b, chemistry);
                            };

                            const getBaseFromGlyphObject = (obj) => {
                                if (!obj?.shapes) return 'N';

                                for (const s of obj.shapes) {
                                    if (
                                        s &&
                                        s.type === 'text' &&
                                        typeof s.text === 'string' &&
                                        /^[ACGTU]$/i.test(s.text.trim())
                                    ) {
                                        return s.text.trim().toUpperCase();
                                    }
                                }
                                return 'N';
                            };

                            const removeHairpinPairLines = (rootShape) => {
                                if (!rootShape?.shapes) return;
                                rootShape.shapes = rootShape.shapes.filter(s => !s?._hairpinPairLine);
                            };

                            const addHairpinPairLine = (rootShape, x1, y1, x2, y2, color = '#9CA3AF') => {
                                rootShape.shapes.push({
                                    type: 'line',
                                    x1, y1, x2, y2,
                                    _hairpinPairLine: true,
                                    style: {
                                        fill: 'none',
                                        stroke: color,
                                        strokeWidth: 1.6,
                                        strokeDasharray: '5 4'
                                    }
                                });
                            };

                            const pairColor = (a, b, chemistry = 'RNA') => {
                                const aa = normalizeBase(a, chemistry);
                                const bb = normalizeBase(b, chemistry);
                                if ((aa === 'A' && bb === 'U') || (aa === 'U' && bb === 'A') ||
                                    (aa === 'A' && bb === 'T') || (aa === 'T' && bb === 'A')) return '#2563EB';
                                if ((aa === 'G' && bb === 'C') || (aa === 'C' && bb === 'G')) return '#059669';
                                return '#9CA3AF';
                            };

                            const estimateHairpinStem = (bases, minLoop = 3, chemistry = 'RNA') => {
                                const n = bases.length;
                                let best = null;

                                for (let stem = Math.floor((n - minLoop) / 2); stem >= 2; stem--) {
                                    for (let loop = minLoop; loop <= n - 2 * stem; loop++) {
                                        const leftStart = 0;
                                        const leftEnd = stem - 1;
                                        const rightStart = stem + loop;
                                        const rightEnd = rightStart + stem - 1;
                                        if (rightEnd >= n) continue;

                                        let matches = 0;
                                        let longest = 0;
                                        let run = 0;

                                        for (let i = 0; i < stem; i++) {
                                            const lb = bases[leftStart + i];
                                            const rb = bases[rightEnd - i];
                                            if (isComplement(lb, rb, chemistry)) {
                                                matches++;
                                                run++;
                                                longest = Math.max(longest, run);
                                            } else {
                                                run = 0;
                                            }
                                        }

                                        const candidate = {
                                            stemLen: stem,
                                            loopLen: loop,
                                            leftStart,
                                            leftEnd,
                                            rightStart,
                                            rightEnd,
                                            matches,
                                            longest
                                        };

                                        if (
                                            !best ||
                                            longest > best.longest ||
                                            (longest === best.longest && matches > best.matches) ||
                                            (longest === best.longest && matches === best.matches && stem > best.stemLen)
                                        ) {
                                            best = candidate;
                                        }
                                    }
                                }

                                return best;
                            };








                            const getCircleCenter = (group) => {
                                if (!group?.shapes) return null;
                                const circle = group.shapes.find(s => s && s.type === 'circle');
                                if (!circle) return null;
                                return {
                                    circle,
                                    x: circle.cx,
                                    y: circle.cy
                                };
                            };

                            const translateDeep = (s, dx, dy) => {
                                if (!s) return;

                                if ('x' in s) s.x += dx;
                                if ('y' in s) s.y += dy;
                                if ('xf' in s) s.xf += dx;
                                if ('yf' in s) s.yf += dy;

                                if ('x1' in s) s.x1 += dx;
                                if ('y1' in s) s.y1 += dy;
                                if ('x2' in s) s.x2 += dx;
                                if ('y2' in s) s.y2 += dy;

                                if ('cx' in s) s.cx += dx;
                                if ('cy' in s) s.cy += dy;

                                if (Array.isArray(s.pts)) {
                                    for (const p of s.pts) {
                                        if (!p) continue;
                                        p.x += dx;
                                        p.y += dy;
                                    }
                                }

                                if (Array.isArray(s.shapes)) {
                                    for (const child of s.shapes) translateDeep(child, dx, dy);
                                }
                            };

                            const buildElasticChain = (rootShape) => {
                                if (!rootShape?.shapes?.length) return null;

                                const getObjectCenter = (obj) => {
                                    const circleData = getCircleData(obj);
                                    if (circleData) {
                                        return {
                                            x: circleData.cx,
                                            y: circleData.cy
                                        };
                                    }

                                    const box = ensureBBox(obj);
                                    if (!box) return { x: 0, y: 0 };

                                    return {
                                        x: (box.x1 + box.x2) / 2,
                                        y: (box.y1 + box.y2) / 2
                                    };
                                };

                                const solveNodeCollisions = (iterations = 4, minDist = 18) => {
                                    const minDist2 = minDist * minDist;

                                    for (let k = 0; k < iterations; k++) {
                                        for (let i = 0; i < points.length; i++) {
                                            const a = points[i];

                                            for (let j = i + 1; j < points.length; j++) {
                                                const b = points[j];

                                                let dx = b.x - a.x;
                                                let dy = b.y - a.y;
                                                let d2 = dx * dx + dy * dy;

                                                if (d2 >= minDist2) continue;

                                                let d = Math.sqrt(d2);
                                                if (d < 0.00001) {
                                                    dx = 0.0001;
                                                    dy = 0;
                                                    d = 0.0001;
                                                }

                                                const overlap = (minDist - d) / d;
                                                const ox = dx * 0.5 * overlap;
                                                const oy = dy * 0.5 * overlap;

                                                const aFixed = a.pinned || a.locked;
                                                const bFixed = b.pinned || b.locked;

                                                if (!aFixed && !bFixed) {
                                                    a.x -= ox;
                                                    a.y -= oy;
                                                    b.x += ox;
                                                    b.y += oy;
                                                } else if (aFixed && !bFixed) {
                                                    b.x += ox * 2;
                                                    b.y += oy * 2;
                                                } else if (!aFixed && bFixed) {
                                                    a.x -= ox * 2;
                                                    a.y -= oy * 2;
                                                }
                                            }
                                        }
                                    }
                                };

                                const refreshRestLengths = () => {
                                    for (const link of links) {
                                        const dx = link.b.x - link.a.x;
                                        const dy = link.b.y - link.a.y;
                                        link.rest = Math.sqrt(dx * dx + dy * dy) || 1;
                                    }

                                    for (const link of neighborLinks) {
                                        const dx = link.b.x - link.a.x;
                                        const dy = link.b.y - link.a.y;
                                        link.rest = Math.sqrt(dx * dx + dy * dy) || 1;
                                    }
                                };

                                const freezeCurrentPose = () => {
                                    for (const p of points) {
                                        p.px = p.x;
                                        p.py = p.y;
                                    }
                                };

                                const all = rootShape.shapes.slice();

                                const isLine = (s) =>
                                    s &&
                                    s.type === 'line' &&
                                    typeof s.x1 === 'number' &&
                                    typeof s.y1 === 'number' &&
                                    typeof s.x2 === 'number' &&
                                    typeof s.y2 === 'number';

                                const isShapeObject = (s) => s && !isLine(s);

                                const ensureBBox = (s) => {
                                    if (!s) return null;

                                    if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                        if (typeof Shape !== 'undefined' && Shape._attachBBoxMethods) {
                                            Shape._attachBBoxMethods(s);
                                        }
                                    }

                                    if (!s.getX || !s.getY || !s.getXf || !s.getYf) return null;

                                    const x1 = s.getX();
                                    const y1 = s.getY();
                                    const x2 = s.getXf();
                                    const y2 = s.getYf();

                                    if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) {
                                        return null;
                                    }

                                    return {
                                        x1: Math.min(x1, x2),
                                        y1: Math.min(y1, y2),
                                        x2: Math.max(x1, x2),
                                        y2: Math.max(y1, y2)
                                    };
                                };

                                const pointInBox = (px, py, b, pad = 0) => {
                                    if (!b) return false;
                                    return (
                                        px >= b.x1 - pad &&
                                        px <= b.x2 + pad &&
                                        py >= b.y1 - pad &&
                                        py <= b.y2 + pad
                                    );
                                };

                                const dist2 = (x1, y1, x2, y2) => {
                                    const dx = x2 - x1;
                                    const dy = y2 - y1;
                                    return dx * dx + dy * dy;
                                };

                                const normalize = (x, y) => {
                                    const d = Math.sqrt(x * x + y * y) || 0.00001;
                                    return { x: x / d, y: y / d, d };
                                };

                                const translateDeep = (s, dx, dy) => {
                                    if (!s) return;

                                    if ('x' in s) s.x += dx;
                                    if ('y' in s) s.y += dy;
                                    if ('xf' in s) s.xf += dx;
                                    if ('yf' in s) s.yf += dy;

                                    if ('x1' in s) s.x1 += dx;
                                    if ('y1' in s) s.y1 += dy;
                                    if ('x2' in s) s.x2 += dx;
                                    if ('y2' in s) s.y2 += dy;

                                    if ('cx' in s) s.cx += dx;
                                    if ('cy' in s) s.cy += dy;

                                    if ('x3' in s) s.x3 += dx;
                                    if ('y3' in s) s.y3 += dy;
                                    if ('x4' in s) s.x4 += dx;
                                    if ('y4' in s) s.y4 += dy;

                                    if ('rx' in s && typeof s.rx === 'number' && !('cx' in s)) s.rx += dx;
                                    if ('ry' in s && typeof s.ry === 'number' && !('cy' in s)) s.ry += dy;

                                    if (Array.isArray(s.pts)) {
                                        for (const p of s.pts) {
                                            if (!p) continue;
                                            if ('x' in p) p.x += dx;
                                            if ('y' in p) p.y += dy;
                                        }
                                    }

                                    if (Array.isArray(s.shapes)) {
                                        for (const child of s.shapes) translateDeep(child, dx, dy);
                                    }
                                };

                                const getCircleData = (group) => {
                                    if (!group?.shapes) return null;

                                    const circle = group.shapes.find(
                                        s =>
                                            s &&
                                            s.type === 'circle' &&
                                            typeof s.cx === 'number' &&
                                            typeof s.cy === 'number'
                                    );

                                    if (!circle) return null;

                                    let r = null;
                                    if (typeof circle.r === 'number' && Number.isFinite(circle.r)) {
                                        r = circle.r;
                                    } else if (typeof circle.rx === 'number' && Number.isFinite(circle.rx)) {
                                        r = circle.rx;
                                    } else if (typeof circle.ry === 'number' && Number.isFinite(circle.ry)) {
                                        r = circle.ry;
                                    }

                                    if (!(typeof r === 'number' && Number.isFinite(r) && r > 0)) {
                                        return null;
                                    }

                                    return {
                                        circle,
                                        cx: circle.cx,
                                        cy: circle.cy,
                                        r
                                    };
                                };

                                const shapeObjects = all.filter(isShapeObject);

                                const findHitObject = (x, y, exclude = null, pad = 6) => {
                                    let best = null;
                                    let bestD2 = Infinity;

                                    for (const s of shapeObjects) {
                                        if (!s || s === exclude) continue;

                                        const box = ensureBBox(s);
                                        if (!box) continue;

                                        if (!pointInBox(x, y, box, pad)) continue;

                                        const cx = (box.x1 + box.x2) / 2;
                                        const cy = (box.y1 + box.y2) / 2;
                                        const d = dist2(x, y, cx, cy);

                                        if (d < bestD2) {
                                            bestD2 = d;
                                            best = s;
                                        }
                                    }

                                    return best;
                                };

                                const endpointNodes = [];
                                const endpointToNode = new Map();

                                const lineObjects = all.filter(isLine);

                                for (const line of lineObjects) {
                                    const endAObj = findHitObject(line.x1, line.y1, null, 8);
                                    const endBObj = findHitObject(line.x2, line.y2, null, 8);

                                    if (endAObj) {
                                        const key = `${line.x1.toFixed(3)},${line.y1.toFixed(3)}`;
                                        if (!endpointToNode.has(key)) {
                                            const node = {
                                                key,
                                                x: line.x1,
                                                y: line.y1,
                                                px: line.x1,
                                                py: line.y1,
                                                pinned: false,
                                                locked: false,
                                                object: endAObj,
                                                attachedLines: new Set([line]),
                                                anchorDirX: 0,
                                                anchorDirY: 0
                                            };
                                            endpointToNode.set(key, node);
                                            endpointNodes.push(node);
                                        } else {
                                            endpointToNode.get(key).attachedLines.add(line);
                                        }
                                    }

                                    if (endBObj) {
                                        const key = `${line.x2.toFixed(3)},${line.y2.toFixed(3)}`;
                                        if (!endpointToNode.has(key)) {
                                            const node = {
                                                key,
                                                x: line.x2,
                                                y: line.y2,
                                                px: line.x2,
                                                py: line.y2,
                                                pinned: false,
                                                locked: false,
                                                object: endBObj,
                                                attachedLines: new Set([line]),
                                                anchorDirX: 0,
                                                anchorDirY: 0
                                            };
                                            endpointToNode.set(key, node);
                                            endpointNodes.push(node);
                                        } else {
                                            endpointToNode.get(key).attachedLines.add(line);
                                        }
                                    }
                                }

                                if (endpointNodes.length < 2) return null;

                                const links = [];
                                for (const line of lineObjects) {
                                    const keyA = `${line.x1.toFixed(3)},${line.y1.toFixed(3)}`;
                                    const keyB = `${line.x2.toFixed(3)},${line.y2.toFixed(3)}`;

                                    const a = endpointToNode.get(keyA);
                                    const b = endpointToNode.get(keyB);

                                    if (!a || !b || a === b) continue;

                                    const dx = b.x - a.x;
                                    const dy = b.y - a.y;

                                    links.push({
                                        a,
                                        b,
                                        line,
                                        rest: Math.sqrt(dx * dx + dy * dy) || 1
                                    });
                                }

                                if (links.length < 1) return null;

                                const points = endpointNodes
                                    .slice()
                                    .sort((a, b) => a.x - b.x);

                                const dragState = {
                                    active: false,
                                    draggedIndex: -1,
                                    lockedIndex: -1,
                                    startMouse: { x: 0, y: 0 },
                                    basePositions: []
                                };

                                const neighborLinks = [];
                                for (let i = 0; i < points.length - 1; i++) {
                                    const a = points[i];
                                    const b = points[i + 1];
                                    const dx = b.x - a.x;
                                    const dy = b.y - a.y;
                                    neighborLinks.push({
                                        a,
                                        b,
                                        rest: Math.sqrt(dx * dx + dy * dy) || 1
                                    });
                                }

                                const objectBundles = new Map();

                                for (const node of points) {
                                    const obj = node.object;
                                    if (!obj) continue;

                                    const circleData = getCircleData(obj);
                                    const box = ensureBBox(obj);
                                    if (!box) continue;

                                    const cx = circleData ? circleData.cx : (box.x1 + box.x2) / 2;
                                    const cy = circleData ? circleData.cy : (box.y1 + box.y2) / 2;

                                    if (!(node.locked && (node.anchorDirX || node.anchorDirY))) {
                                        const dir = normalize(node.x - cx, node.y - cy);
                                        node.anchorDirX = dir.x;
                                        node.anchorDirY = dir.y;
                                    }

                                    if (!objectBundles.has(obj)) {
                                        objectBundles.set(obj, {
                                            object: obj,
                                            nodes: [],
                                            lines: new Set()
                                        });
                                    }

                                    const bundle = objectBundles.get(obj);
                                    bundle.nodes.push(node);

                                    for (const ln of node.attachedLines) {
                                        bundle.lines.add(ln);
                                    }
                                }

                                const syncVisuals = () => {
                                    for (const bundle of objectBundles.values()) {
                                        const obj = bundle.object;
                                        if (!obj) continue;

                                        let sumDx = 0;
                                        let sumDy = 0;
                                        let n = 0;

                                        for (const node of bundle.nodes) {
                                            const center = getObjectCenter(obj);
                                            sumDx += (node.x - center.x);
                                            sumDy += (node.y - center.y);
                                            n++;
                                        }

                                        if (n > 0) {
                                            translateDeep(obj, sumDx / n, sumDy / n);
                                        }

                                        const center = getObjectCenter(obj);
                                        for (const node of bundle.nodes) {
                                            node.x = center.x;
                                            node.y = center.y;
                                        }
                                    }

                                    for (const seg of links) {
                                        const aObj = seg.a.object;
                                        const bObj = seg.b.object;

                                        if (aObj && bObj) {
                                            const aCenter = getObjectCenter(aObj);
                                            const bCenter = getObjectCenter(bObj);

                                            seg.a.x = aCenter.x;
                                            seg.a.y = aCenter.y;
                                            seg.b.x = bCenter.x;
                                            seg.b.y = bCenter.y;

                                            seg.line.x1 = aCenter.x;
                                            seg.line.y1 = aCenter.y;
                                            seg.line.x2 = bCenter.x;
                                            seg.line.y2 = bCenter.y;
                                        } else {
                                            seg.line.x1 = seg.a.x;
                                            seg.line.y1 = seg.a.y;
                                            seg.line.x2 = seg.b.x;
                                            seg.line.y2 = seg.b.y;
                                        }
                                    }
                                };

                                const solveLinks = (activeLinks, iterations = 12, stiffness = 0.18) => {
                                    for (let k = 0; k < iterations; k++) {
                                        for (const link of activeLinks) {
                                            const a = link.a;
                                            const b = link.b;

                                            let dx = b.x - a.x;
                                            let dy = b.y - a.y;
                                            let dist = Math.sqrt(dx * dx + dy * dy) || 0.00001;

                                            const diff = (dist - link.rest) / dist;
                                            const ox = dx * 0.5 * stiffness * diff;
                                            const oy = dy * 0.5 * stiffness * diff;

                                            if (!a.pinned && !a.locked) {
                                                a.x += ox;
                                                a.y += oy;
                                            }
                                            if (!b.pinned && !b.locked) {
                                                b.x -= ox;
                                                b.y -= oy;
                                            }
                                        }
                                    }
                                };

                                const settle = (damping = 0.08) => {
                                    for (const p of points) {
                                        if (p.pinned || p.locked) continue;

                                        const vx = (p.x - p.px) * damping;
                                        const vy = (p.y - p.py) * damping;

                                        p.px = p.x;
                                        p.py = p.y;
                                        p.x += vx;
                                        p.y += vy;
                                    }
                                };

                                const captureBasePositions = () => {
                                    dragState.basePositions = points.map(p => ({ x: p.x, y: p.y }));
                                };

                                const clearLocks = () => {
                                    for (const p of points) p.locked = false;
                                };

                                const chooseLockedTerminal = (draggedIndex) => {
                                    const leftDist = Math.abs(draggedIndex - 0);
                                    const rightDist = Math.abs((points.length - 1) - draggedIndex);
                                    return rightDist >= leftDist ? points.length - 1 : 0;
                                };

                                const applyAxialFalloffDrag = () => {
                                    if (!dragState.active) return;

                                    const dragged = points[dragState.draggedIndex];
                                    const locked = points[dragState.lockedIndex];
                                    if (!dragged || !locked) return;

                                    const baseDragged = dragState.basePositions[dragState.draggedIndex];
                                    const baseLocked = dragState.basePositions[dragState.lockedIndex];
                                    if (!baseDragged || !baseLocked) return;

                                    const mdx = dragged.x - dragState.startMouse.x;
                                    const mdy = dragged.y - dragState.startMouse.y;

                                    const axis0x = baseDragged.x - baseLocked.x;
                                    const axis0y = baseDragged.y - baseLocked.y;
                                    const axisLen = Math.sqrt(axis0x * axis0x + axis0y * axis0y) || 0.00001;
                                    const ux = axis0x / axisLen;
                                    const uy = axis0y / axisLen;

                                    const axialAmount = mdx * ux + mdy * uy;

                                    const lo = Math.min(dragState.draggedIndex, dragState.lockedIndex);
                                    const hi = Math.max(dragState.draggedIndex, dragState.lockedIndex);
                                    const totalSteps = Math.max(1, Math.abs(dragState.lockedIndex - dragState.draggedIndex));

                                    for (let i = lo; i <= hi; i++) {
                                        if (i === dragState.draggedIndex || i === dragState.lockedIndex) continue;

                                        const p = points[i];
                                        const base = dragState.basePositions[i];
                                        if (!p || !base) continue;

                                        const stepsFromDragged = Math.abs(i - dragState.draggedIndex);
                                        const t = stepsFromDragged / totalSteps;
                                        const influence = Math.pow(1 - t, 2);

                                        p.x = base.x + ux * axialAmount * influence;
                                        p.y = base.y + uy * axialAmount * influence;
                                    }

                                    locked.x = baseLocked.x;
                                    locked.y = baseLocked.y;
                                    locked.px = baseLocked.x;
                                    locked.py = baseLocked.y;
                                };

                                const step = () => {
                                    settle();
                                    applyAxialFalloffDrag();
                                    solveLinks(links, 10, 0.02);
                                    solveLinks(neighborLinks, 6, 0.10);
                                    solveNodeCollisions(2, 16);
                                    syncVisuals();
                                };

                                const nearestPointIndex = (wx, wy, maxDist = 80) => {
                                    let best = -1;
                                    let bestD2 = maxDist * maxDist;

                                    for (let i = 0; i < points.length; i++) {
                                        if (points[i].locked) continue;

                                        const d = dist2(wx, wy, points[i].x, points[i].y);
                                        if (d < bestD2) {
                                            bestD2 = d;
                                            best = i;
                                        }
                                    }
                                    return best;
                                };

                                const nearestTerminalIndex = (wx, wy) => {
                                    if (!points.length) return -1;
                                    if (points.length === 1) return 0;

                                    const d0 = dist2(wx, wy, points[0].x, points[0].y);
                                    const d1 = dist2(wx, wy, points[points.length - 1].x, points[points.length - 1].y);
                                    return d0 <= d1 ? 0 : points.length - 1;
                                };

                                const foldIntoHairpinFromClickedEnd = (
                                    wx,
                                    wy,
                                    {
                                        chemistry = 'RNA',
                                        stemGap = 28,
                                        loopRadius = 34,
                                        minLoop = 3
                                    } = {}
                                ) => {
                                    if (!points || points.length < 6) return false;

                                    const clickedEnd = nearestTerminalIndex(wx, wy);
                                    if (clickedEnd < 0) return false;

                                    const reverse = clickedEnd === 0;
                                    const ordered = reverse ? points.slice().reverse() : points.slice();
                                    const n = ordered.length;

                                    const bases = ordered.map(p => getBaseFromGlyphObject(p.object));
                                    const hp = estimateHairpinStem(bases, minLoop, chemistry);
                                    if (!hp || hp.stemLen < 2) return false;

                                    const { stemLen, loopLen } = hp;
                                    const totalNeeded = stemLen * 2 + loopLen;
                                    if (totalNeeded > n) return false;

                                    // Save original center so the new hairpin stays in place.
                                    let origCx = 0;
                                    let origCy = 0;
                                    for (const p of ordered) {
                                        origCx += p.x;
                                        origCy += p.y;
                                    }
                                    origCx /= ordered.length;
                                    origCy /= ordered.length;

                                    // Original spacing
                                    const segLens = [];
                                    for (let i = 0; i < n - 1; i++) {
                                        const dx = ordered[i + 1].x - ordered[i].x;
                                        const dy = ordered[i + 1].y - ordered[i].y;
                                        segLens.push(Math.sqrt(dx * dx + dy * dy) || 1);
                                    }
                                    const avgStep = segLens.length
                                        ? segLens.reduce((a, b) => a + b, 0) / segLens.length
                                        : 48;

                                    const anchor = ordered[0];
                                    const tail = ordered[n - 1];

                                    let axisX = tail.x - anchor.x;
                                    let axisY = tail.y - anchor.y;
                                    let axisLen = Math.sqrt(axisX * axisX + axisY * axisY);
                                    if (axisLen < 0.00001) {
                                        axisX = 1;
                                        axisY = 0;
                                        axisLen = 1;
                                    }

                                    // Optional: keep overall direction consistent left -> right
                                    if (axisX < 0) {
                                        axisX *= -1;
                                        axisY *= -1;
                                    }

                                    const ux = axisX / axisLen;
                                    const uy = axisY / axisLen;

                                    // Perpendicular chosen so opening direction is stable in SVG coords
                                    const px = uy;
                                    const py = -ux;

                                    const stemRise = avgStep * Math.max(0, stemLen - 1);

                                    // Actually use loop arc length to define loop radius if needed
                                    const desiredLoopArc = avgStep * Math.max(1, loopLen - 1);
                                    const r = Math.max(loopRadius, desiredLoopArc / Math.PI);
                                    const loopArc = Math.PI * r;

                                    const halfGap = stemGap * 0.5;

                                    // Build hairpin in local coordinates first to avoid drift
                                    // Stem 1 goes from -stemRise/2 to +stemRise/2 along axis
                                    const stem1Start = {
                                        x: -ux * (stemRise * 0.5),
                                        y: -uy * (stemRise * 0.5)
                                    };
                                    const stem1End = {
                                        x: ux * (stemRise * 0.5),
                                        y: uy * (stemRise * 0.5)
                                    };

                                    // Arc center: offset from stem tip by half gap
                                    const loopCenter = {
                                        x: stem1End.x + px * halfGap,
                                        y: stem1End.y + py * halfGap
                                    };

                                    const stem2Start = {
                                        x: stem1End.x + px * stemGap,
                                        y: stem1End.y + py * stemGap
                                    };
                                    const stem2End = {
                                        x: stem2Start.x - ux * stemRise,
                                        y: stem2Start.y - uy * stemRise
                                    };

                                    const sampleHairpinPath = (index) => {
                                        // left stem
                                        if (index < stemLen) {
                                            const t = stemLen <= 1 ? 0 : index / (stemLen - 1);
                                            return {
                                                x: stem1Start.x + (stem1End.x - stem1Start.x) * t,
                                                y: stem1Start.y + (stem1End.y - stem1Start.y) * t
                                            };
                                        }

                                        // loop: use the actual semicircle arc
                                        if (index < stemLen + loopLen) {
                                            const k = index - stemLen;
                                            const t = loopLen <= 1 ? 0.5 : k / (loopLen - 1);
                                            const theta = Math.PI - Math.PI * t;

                                            return {
                                                x: loopCenter.x + px * (halfGap * Math.cos(theta)) + ux * (r * Math.sin(theta)),
                                                y: loopCenter.y + py * (halfGap * Math.cos(theta)) + uy * (r * Math.sin(theta))
                                            };
                                        }

                                        // right stem
                                        const k = index - (stemLen + loopLen);
                                        const t = stemLen <= 1 ? 0 : k / (stemLen - 1);
                                        return {
                                            x: stem2Start.x + (stem2End.x - stem2Start.x) * t,
                                            y: stem2Start.y + (stem2End.y - stem2Start.y) * t
                                        };
                                    };

                                    for (let i = 0; i < totalNeeded; i++) {
                                        const pos = sampleHairpinPath(i);
                                        ordered[i].x = pos.x;
                                        ordered[i].y = pos.y;
                                        ordered[i].px = pos.x;
                                        ordered[i].py = pos.y;
                                    }

                                    // Extra residues become tail continuation from stem2 end
                                    for (let i = totalNeeded; i < n; i++) {
                                        const prev = ordered[i - 1];
                                        ordered[i].x = prev.x - ux * avgStep;
                                        ordered[i].y = prev.y - uy * avgStep;
                                        ordered[i].px = ordered[i].x;
                                        ordered[i].py = ordered[i].y;
                                    }



                                    for (const p of ordered) {
                                        p.y = -p.y;
                                        p.py = -p.py;
                                    }
                                    // Recenter new geometry onto original center
                                    let newCx = 0;
                                    let newCy = 0;
                                    for (const p of ordered) {
                                        newCx += p.x;
                                        newCy += p.y;
                                    }
                                    newCx /= ordered.length;
                                    newCy /= ordered.length;

                                    const dx = origCx - newCx;
                                    const dy = origCy - newCy;

                                    for (const p of ordered) {
                                        p.x += dx;
                                        p.y += dy;
                                        p.px += dx;
                                        p.py += dy;
                                    }

                                    syncVisuals();
                                    refreshRestLengths();
                                    freezeCurrentPose();

                                    removeHairpinPairLines(rootShape);

                                    for (let i = 0; i < stemLen; i++) {
                                        const leftNode = ordered[i];
                                        const rightNode = ordered[stemLen + loopLen + (stemLen - 1 - i)];

                                        const leftBase = getBaseFromGlyphObject(leftNode.object);
                                        const rightBase = getBaseFromGlyphObject(rightNode.object);

                                        if (!isComplement(leftBase, rightBase, chemistry)) continue;

                                        addHairpinPairLine(
                                            rootShape,
                                            leftNode.x,
                                            leftNode.y,
                                            rightNode.x,
                                            rightNode.y,
                                            pairColor(leftBase, rightBase, chemistry)
                                        );
                                    }

                                    syncVisuals();
                                    return true;
                                };

                                return {
                                    points,
                                    links,
                                    neighborLinks,
                                    step,
                                    nearestPointIndex,
                                    nearestTerminalIndex,
                                    pinTo(index, wx, wy) {
                                        const p = points[index];
                                        if (!p) return;

                                        if (!dragState.active || dragState.draggedIndex !== index) {
                                            dragState.active = true;
                                            dragState.draggedIndex = index;
                                            dragState.lockedIndex = chooseLockedTerminal(index);
                                            dragState.startMouse = { x: wx, y: wy };
                                            captureBasePositions();
                                            clearLocks();

                                            if (points[dragState.lockedIndex]) {
                                                points[dragState.lockedIndex].locked = true;
                                            }
                                        }

                                        p.pinned = true;
                                        p.x = wx;
                                        p.y = wy;
                                        p.px = wx;
                                        p.py = wy;
                                    },
                                    commitDrag(index) {
                                        const p = points[index];
                                        if (!p) return;

                                        syncVisuals();
                                        solveNodeCollisions(1, 8);
                                        syncVisuals();

                                        refreshRestLengths();
                                        freezeCurrentPose();

                                        p.pinned = false;

                                        clearLocks();
                                        dragState.active = false;
                                        dragState.draggedIndex = -1;
                                        dragState.lockedIndex = -1;
                                        dragState.basePositions = [];
                                    },
                                    release(index) {
                                        const p = points[index];
                                        if (p) p.pinned = false;

                                        clearLocks();
                                        dragState.active = false;
                                        dragState.draggedIndex = -1;
                                        dragState.lockedIndex = -1;
                                        dragState.basePositions = [];
                                    },
                                    makeHairpinFromClick(wx, wy, opts = {}) {
                                        return foldIntoHairpinFromClickedEnd(wx, wy, opts);
                                    }
                                };
                            };

                            let changed = false;

                            if (selected_glyphs?.length) {
                                for (const gshape of selected_glyphs) {
                                    if (!gshape?.shape) continue;

                                    const chain = buildElasticChain(gshape.shape);
                                    if (!chain) continue;

                                    const ok = chain.makeHairpinFromClick(xwc, ywc, {
                                        chemistry: 'RNA',   // or 'DNA'
                                        stemGap: 128,
                                        loopRadius: 134,
                                        minLoop: 4
                                    });

                                    if (!ok) continue;

                                    for (let i = 0; i < 8; i++) {
                                        chain.step();
                                    }

                                    changed = true;
                                }
                            }

                            if (changed) {
                                if (typeof this.render === 'function') this.render();
                                if (typeof this.draw === 'function') this.draw();
                            }

                        } catch (err) {
                            console.error('Make Hairpin failed:', err);
                            this.wb(null);
                        }
                    }
                });

                let iscomposite = false;
                let saveToPDF__ = this.___imageCaptureRect;
                if (saveToPDF__) {
                    menuList.push({
                        label: `Save window to PDF`,
                        click: async (xwc, ywc) => {

                            setTimeout(async () => {
                                let graph = CurrentLayout.getStashed('graph');
                                const desiredPixelsPerFoot = 200;

                                await exportBorderAtPixelsPerFoot(saveToPDF__, graph, desiredPixelsPerFoot);

                            }, 1000)
                        }
                    })




                }




                menuList.push({
                    label: `Group All`,
                    click: async (xwc, ywc) => {
                        try {
                            const glyphs = (this.glyphs || []).filter(g => g && g.shape);
                            if (glyphs.length <= 1) return;
                            const childShapes = glyphs.map(g => g.shape);
                            const compositeShape = Shape._makeCompositeShape(childShapes);
                            const compositeGlyph = new Glyph(compositeShape);
                            this.removeGlyphs(glyphs);
                            this.addGlyph(compositeGlyph);
                            selected_glyphs = [compositeGlyph];
                        } catch (err) {
                            console.error('Group into composite error:', err);
                        }
                    }
                });

                menuList.push({
                    label: `Ungroup`,
                    click: async (xwc, ywc) => {
                        try {
                            if (!selected_glyphs || !selected_glyphs.length) return;

                            const newGlyphs = [];
                            function breakComposite(shape) {
                                if (!shape) return [];
                                const out = [];
                                function visit(s) {
                                    if (!s) return;
                                    const t = (s.type || '').toLowerCase();
                                    if (t === 'svg_group' && Array.isArray(s.shapes)) {
                                        for (const child of s.shapes) {
                                            visit(child);
                                        }
                                    } else {
                                        out.push(s);
                                    }
                                }

                                visit(shape);
                                return out;
                            }

                            for (let g of selected_glyphs) {
                                if (!g || !g.shape) continue;

                                const shape = g.shape;
                                const isComposite =
                                    shape.type &&
                                    String(shape.type).toLowerCase() === 'svg_group' &&
                                    Array.isArray(shape.shapes);

                                if (!isComposite) continue;

                                const parts = breakComposite(shape);

                                for (const part of parts) {
                                    const newGlyph = new Glyph(part)
                                    newGlyphs.push(newGlyph);
                                }
                            }

                            if (!newGlyphs.length) return;

                            for (let g of selected_glyphs) {
                                const shape = g?.shape;
                                const isComposite =
                                    shape?.type &&
                                    String(shape.type).toLowerCase() === 'svg_group' &&
                                    Array.isArray(shape.shapes);

                                if (isComposite) {
                                    this.removeGlyphs([g]);
                                }
                            }

                            for (let ng of newGlyphs) {
                                this.addGlyphNoSelect(ng);
                            }

                            selected_glyphs = newGlyphs;

                        } catch (err) {
                            console.error("Ungroup composite error:", err);
                        }
                    }
                });
                menuList.push({
                    label: `Rotate`,
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this));

                            let clickIndex = 0;

                            const isNum = v => typeof v === 'number' && Number.isFinite(v);

                            const collectNotes = (shape, out) => {
                                if (!shape) return;

                                if (
                                    (shape.type === 'Note') ||
                                    ('rotationDeg' in shape && typeof shape.setRotation === 'function')
                                ) {
                                    out.push(shape);
                                }
                                if (Array.isArray(shape.shapes)) {
                                    for (const c of shape.shapes) collectNotes(c, out);
                                }
                            };

                            const computePivotWorld = (shapes, fallbackWx, fallbackWy) => {
                                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                                let any = false;
                                for (const s of shapes || []) {
                                    if (!s) continue;
                                    if ((s.type === 'Note') || ('rotationDeg' in s && 'x' in s && 'y' in s)) {
                                        const cx = Number(s.x), cy = Number(s.y);
                                        const w = Number.isFinite(s.w) ? s.w : 0;
                                        const h = Number.isFinite(s.h) ? s.h : 0;
                                        if (Number.isFinite(cx) && Number.isFinite(cy)) {
                                            const x1 = cx - w / 2;
                                            const x2 = cx + w / 2;
                                            const y1 = cy - h / 2;
                                            const y2 = cy + h / 2;
                                            minX = Math.min(minX, x1, x2);
                                            maxX = Math.max(maxX, x1, x2);
                                            minY = Math.min(minY, y1, y2);
                                            maxY = Math.max(maxY, y1, y2);
                                            any = true;
                                            continue;
                                        }
                                    }
                                    Shape._attachBBoxMethods?.(s);
                                    if (typeof s.getX === 'function' && typeof s.getY === 'function' &&
                                        typeof s.getXf === 'function' && typeof s.getYf === 'function') {
                                        const x1 = s.getX(), y1 = s.getY(), x2 = s.getXf(), y2 = s.getYf();
                                        if ([x1, y1, x2, y2].every(isNum)) {
                                            minX = Math.min(minX, x1, x2);
                                            maxX = Math.max(maxX, x1, x2);
                                            minY = Math.min(minY, y1, y2);
                                            maxY = Math.max(maxY, y1, y2);
                                            any = true;
                                        }
                                    }
                                }

                                if (!any) return { px: fallbackWx, py: fallbackWy };
                                return { px: (minX + maxX) / 2, py: (minY + maxY) / 2 };
                            };

                            const shapes = (selected_glyphs || []).map(g => g?.shape).filter(Boolean);
                            const { px, py } = computePivotWorld(shapes, 0, 0);

                            let hd = {
                                selected_glyphs: null,
                                isDragging: false,
                                priority: true,
                                id: 'glyph-override-rotate-note',

                                pivotX: px,
                                pivotY: py,
                                lastAngle: null,

                                draw: (grid, ctx) => {
                                    if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;

                                    const now = Date.now();
                                    const periodMs = 2000;
                                    const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                    const pulse = (phase + 1) / 2;

                                    const alpha = 0.10 + 0.25 * pulse;
                                    const lineWidth = 10 * pulse;

                                    ctx.save();
                                    ctx.globalAlpha = alpha;
                                    ctx.lineJoin = 'round';
                                    ctx.lineCap = 'round';
                                    ctx.strokeStyle = 'rgba(0, 150, 255, 1)';
                                    ctx.lineWidth = lineWidth;

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;
                                        const s = gshape.shape;

                                        if ((s.type === 'Note') || ('rotationDeg' in s && 'x' in s && 'y' in s)) {
                                            const cx = Number(s.x), cy = Number(s.y);
                                            const w = Number.isFinite(s.w) ? s.w : 0;
                                            const h = Number.isFinite(s.h) ? s.h : 0;
                                            if (Number.isFinite(cx) && Number.isFinite(cy)) {
                                                const minX = cx - w / 2;
                                                const maxX = cx + w / 2;
                                                const minY = cy - h / 2;
                                                const maxY = cy + h / 2;

                                                const sx = grid.X(minX);
                                                const syTop = grid.Y(maxY);
                                                const sw = grid.screenWidth(maxX - minX);
                                                const sh = grid.screenHeight(maxY - minY);

                                                ctx.beginPath();
                                                ctx.rect(sx, syTop, sw, sh);
                                                ctx.stroke();
                                                continue;
                                            }
                                        }

                                        if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                        const x1 = s.getX(), y1 = s.getY(), x2 = s.getXf(), y2 = s.getYf();
                                        if (![x1, y1, x2, y2].every(isNum)) continue;

                                        const minX = Math.min(x1, x2);
                                        const maxX = Math.max(x1, x2);
                                        const minY = Math.min(y1, y2);
                                        const maxY = Math.max(y1, y2);

                                        const sx = grid.X(minX);
                                        const syTop = grid.Y(maxY);
                                        const sw = grid.screenWidth(maxX - minX);
                                        const sh = grid.screenHeight(maxY - minY);

                                        ctx.beginPath();
                                        ctx.rect(sx, syTop, sw, sh);
                                        ctx.stroke();
                                    }

                                    if (isNum(hd.pivotX) && isNum(hd.pivotY)) {
                                        const px = grid.X(hd.pivotX);
                                        const py = grid.Y(hd.pivotY);
                                        const r = 10 + 10 * pulse;

                                        ctx.beginPath();
                                        ctx.arc(px, py, r, 0, Math.PI * 2);
                                        ctx.stroke();

                                        ctx.beginPath();
                                        ctx.moveTo(px - r, py);
                                        ctx.lineTo(px + r, py);
                                        ctx.moveTo(px, py - r);
                                        ctx.lineTo(px, py + r);
                                        ctx.stroke();
                                    }

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    let insideAny = false;
                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const s = gshape.shape;

                                            if (typeof s.inside === 'function') {
                                                if (s.inside(this.grid, x, y)) { insideAny = true; break; }
                                            }
                                        }
                                    }
                                    if (!insideAny) {
                                        this.wb(null);
                                        return;
                                    }
                                    clickIndex++;
                                    if (clickIndex > 1) {

                                        return;
                                    }

                                    const shapes = (hd.selected_glyphs || []).map(g => g?.shape).filter(Boolean);
                                    const { px, py } = computePivotWorld(shapes, wx, wy);
                                    hd.pivotX = px;
                                    hd.pivotY = py;

                                    hd.lastAngle = Math.atan2(wy - hd.pivotY, wx - hd.pivotX);
                                    hd.isDragging = true;
                                },

                                mouseMoveListener: (x, y) => {
                                    if (!hd.selected_glyphs || !hd.isDragging) return;

                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    const a = Math.atan2(wy - hd.pivotY, wx - hd.pivotX);
                                    let delta = a - hd.lastAngle;
                                    hd.lastAngle = a;

                                    if (!delta) return;

                                    if (delta > Math.PI) delta -= 2 * Math.PI;
                                    if (delta < -Math.PI) delta += 2 * Math.PI;

                                    const deltaDeg = delta * (180 / Math.PI);

                                    for (const gshape of hd.selected_glyphs) {
                                        const root = gshape?.shape;
                                        if (!root) continue;

                                        const notes = [];
                                        collectNotes(root, notes);
                                        for (const n of notes) {
                                            if (!n) continue;

                                            if (typeof n.rotateByDeg === 'function') {
                                                n.rotateByDeg(deltaDeg);
                                            } else if (typeof n.setRotation === 'function') {
                                                n.setRotation((Number(n.rotationDeg) || 0) + deltaDeg);
                                            } else if ('rotationDeg' in n) {

                                                n.rotationDeg = clampDeg((Number(n.rotationDeg) || 0) + deltaDeg);
                                            }
                                        }
                                    }
                                },

                                mouseUpListener: async () => { hd.isDragging = false; },
                                close: () => { hd.isDragging = false; }
                            };

                            setTimeout(() => {
                                hd.selected_glyphs = selected_glyphs;
                                this.wb(hd);
                            }, 100);

                        } catch (err) {
                            console.error('Rotate glyph (Note) failed:', err);
                            this.wb(null);
                        }
                    }
                });

                menuList.push({
                    label: `Resize`,
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this))

                            let clickIndex = 0;
                            let hd = {
                                selected_glyphs: null,
                                startX: null,
                                startY: null,
                                startWx: null,
                                startWy: null,
                                currentX: null,
                                currentY: null,
                                isResizing: false,
                                isDrawing: true,
                                isDragging: false,
                                priority: true,
                                id: 'glyph-override-resize',

                                draw: (grid, ctx) => {
                                    if (!hd.selected_glyphs || !hd.selected_glyphs.length) return;

                                    const isNumber = v => typeof v === 'number' && Number.isFinite(v);

                                    const now = Date.now();
                                    const periodMs = 2000;
                                    const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                                    const pulse = (phase + 1) / 2;

                                    const basePad = 8;
                                    const extraPad = 12;
                                    const padFactor = basePad + extraPad * pulse;

                                    const baseAlpha = 0.10;
                                    const extraAlpha = 0.25;
                                    const alpha = baseAlpha + extraAlpha * pulse;

                                    const baseLineWidth = 2;
                                    const extraLineWidth = 3;
                                    const lineWidth = baseLineWidth + extraLineWidth * pulse;

                                    ctx.save();
                                    ctx.globalAlpha = alpha;
                                    ctx.lineJoin = 'round';
                                    ctx.lineCap = 'round';
                                    ctx.strokeStyle = 'rgba(0, 150, 255, 1)';

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;
                                        const shape = gshape.shape;

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }
                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) continue;

                                        const x1 = shape.getX();
                                        const y1 = shape.getY();
                                        const x2 = shape.getXf();
                                        const y2 = shape.getYf();
                                        if (![x1, y1, x2, y2].every(isNumber)) continue;

                                        const minX = Math.min(x1, x2) - padFactor;
                                        const maxX = Math.max(x1, x2) + padFactor;
                                        const minY = Math.min(y1, y2) - padFactor;
                                        const maxY = Math.max(y1, y2) + padFactor;

                                        const wWorld = maxX - minX;
                                        const hWorld = maxY - minY;

                                        const sx = grid.X(minX);
                                        const syTop = grid.Y(maxY);
                                        const sw = grid.screenWidth(wWorld);
                                        const sh = grid.screenHeight(hWorld);

                                        ctx.lineWidth = lineWidth;
                                        ctx.beginPath();
                                        ctx.rect(sx, syTop, sw, sh);
                                        ctx.stroke();

                                        const handleSize = 8;
                                        ctx.fillStyle = 'rgba(0, 150, 255, 0.9)';
                                        ctx.beginPath();
                                        ctx.rect(sx + sw - handleSize, syTop + sh - handleSize, handleSize, handleSize);
                                        ctx.fill();
                                    }

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    const isNumber = v => typeof v === 'number' && Number.isFinite(v);
                                    let insideAny = false;

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const s = gshape.shape;

                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                Shape._attachBBoxMethods(s);
                                            }
                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                            const x1 = Math.min(s.getX(), s.getXf());
                                            const x2 = Math.max(s.getX(), s.getXf());
                                            const y1 = Math.min(s.getY(), s.getYf());
                                            const y2 = Math.max(s.getY(), s.getYf());

                                            if (![x1, x2, y1, y2].every(isNumber)) continue;

                                            if (wx >= x1 && wx <= x2 && wy >= y1 && wy <= y2) {
                                                insideAny = true;

                                            }
                                        }
                                    }

                                    hd.startX = x;
                                    hd.startY = y;
                                    hd.currentX = x;
                                    hd.currentY = y;
                                    hd.startWx = wx;
                                    hd.startWy = wy;
                                    hd.isResizing = true;

                                    if (hd.selected_glyphs) {
                                        for (let gshape of hd.selected_glyphs) {
                                            if (!gshape || !gshape.shape) continue;
                                            const s = gshape.shape;

                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) {
                                                Shape._attachBBoxMethods(s);
                                            }
                                            if (!s.getX || !s.getY || !s.getXf || !s.getYf) continue;

                                            gshape._resizeOrig = {
                                                x1: s.getX(),
                                                y1: s.getY(),
                                                x2: s.getXf(),
                                                y2: s.getYf()
                                            };

                                            const t = (s.type || '').toLowerCase();
                                            if ((t === 'text' || t === 'svg_text') && typeof s.fontSize === 'number') {
                                                gshape._origFontSize = s.fontSize;
                                            }
                                        }
                                    }
                                    clickIndex++;

                                    if (clickIndex > 1) {
                                        this.deselectAll();
                                        this.wb(null);
                                    }
                                },

                                mouseMoveListener: (x, y) => {

                                    if (!hd.selected_glyphs) return;
                                    if (!hd.isResizing) return;

                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    const dxWorld = wx - hd.startWx;
                                    const dyWorld = wy - hd.startWy;

                                    const isNum = v => typeof v === 'number' && Number.isFinite(v);

                                    for (let gshape of hd.selected_glyphs) {
                                        if (!gshape || !gshape.shape) continue;
                                        const shape = gshape.shape;

                                        if (typeof shape.update === 'function') {
                                            shape.update(wx, wy);
                                            continue;
                                        }

                                        if (!shape.getX || !shape.getY || !shape.getXf || !shape.getYf) {
                                            Shape._attachBBoxMethods(shape);
                                        }

                                        const orig = gshape._resizeOrig;
                                        if (!orig) continue;

                                        const origX2 = orig.x2;
                                        const origY2 = orig.y2;

                                        const newXf = origX2 + dxWorld;
                                        const newYf = origY2 + dyWorld;

                                        const type = (shape.type || '').toLowerCase();

                                        const isText = (type === 'text' || type === 'svg_text') && isNum(shape.fontSize);
                                        if (isText && isNum(orig.x1) && isNum(orig.x2)) {
                                            const origWidth = orig.x2 - orig.x1;
                                            const newWidth = newXf - orig.x1;

                                            if (isNum(origWidth) && Math.abs(origWidth) > 1e-6 &&
                                                isNum(newWidth) && newWidth > 0) {

                                                const origFontSize = isNum(gshape._origFontSize)
                                                    ? gshape._origFontSize
                                                    : shape.fontSize;

                                                const scale = newWidth / origWidth;
                                                shape.fontSize = Math.max(1, origFontSize * scale);
                                            }

                                            continue;
                                        }

                                        const hasRectGeom =
                                            isNum(shape.x) && isNum(shape.w);

                                        const hasCircleGeom =
                                            isNum(shape.cx) && isNum(shape.r);

                                        const hasEllipseGeom =
                                            isNum(shape.cx) && isNum(shape.rx) && isNum(shape.ry);

                                        const isCompositeGroup =
                                            type === 'svg_group' &&
                                            typeof shape.setXf === 'function' &&
                                            typeof shape.setYf === 'function';

                                        if (isCompositeGroup) {
                                            shape.setXf(newXf);
                                            shape.setYf(newYf);
                                            continue;
                                        }

                                        if (
                                            typeof shape.setXf === 'function' &&
                                            typeof shape.setYf === 'function') {

                                            shape.setXf(newXf);
                                            shape.setYf(newYf);
                                            continue;
                                        }

                                    }
                                },

                                mouseUpListener: async (x, y) => {
                                    hd.isResizing = false;
                                },

                                close: () => {
                                    hd.isResizing = false;
                                }
                            };

                            setTimeout(() => {
                                hd.selected_glyphs = selected_glyphs;
                                this.wb(hd);
                                hd.startX = null;
                                hd.startY = null;
                                hd.currentX = null;
                                hd.currentY = null;
                            }, 100);

                        } catch (err) {
                            console.error('Failed to start resize tool: ', err);
                            this.wb(null);
                        }

                    }
                });

                menuList.push({
                    label: 'Send to back',
                    click: async (xwc, ywc) => {
                        pushHistory(HM(this))
                        for (let glyph of selected_glyphs) {
                            const idx = this.glyphs.findIndex(g => g.uid === glyph.uid);
                            if (idx === -1) return;

                            this.glyphs.splice(idx, 1);
                            this.glyphs.unshift(glyph);
                        }
                    }
                });

                menuList.push({
                    label: 'Copy',
                    click: async (xwc, ywc) => {
                        pushHistory(HM(this))
                        for (let glyph of selected_glyphs) {
                            const idx = this.glyphs.findIndex(g => g.uid === glyph.uid);
                            if (idx === -1) return;
                            this.glyphs.splice(idx, 1);
                            this.glyphs.unshift(glyph);
                        }

                        try {
                            const currentstate = 'glyphs_array:' + JSON.stringify(selected_glyphs)
                            navigator.clipboard.writeText(currentstate).then(() => {
                                console.log("Object copied to clipboard!");
                                pm.plateTrack.setMessage(" Copied ")
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                            console.log('JSON plate state written to clipboard as plain text.');
                        } catch (exception) {

                        }
                    }
                });


                menuList.push({
                    label: 'Paste',
                    click: async (xwc, ywc) => {
                        pushHistory(HM(this))
                        try {
                            const clipboardText = await navigator.clipboard.readText();

                            if (!clipboardText || !clipboardText.startsWith('glyphs_array:')) {
                                console.warn('Clipboard does not contain glyph data.');
                                pm.plateTrack.setMessage(" Invalid Paste ");
                                return;
                            }

                            const jsonText = clipboardText.replace('glyphs_array:', '');
                            const pastedGlyphs = JSON.parse(jsonText);

                            selected_glyphs = pastedGlyphs;

                            console.log('Glyph state pasted from clipboard:', selected_glyphs);
                            pm.plateTrack.setMessage(" Pasted ");
                        } catch (exception) {
                            console.error("Failed to paste object from clipboard:", exception);
                            pm.plateTrack.setMessage(" Paste Failed ");
                        }
                    }
                });

                menuList.push({
                    label: 'Bring to front',
                    click: async (xwc, ywc) => {
                        pushHistory(HM(this))

                        for (let glyph of selected_glyphs) {

                            const idx = this.glyphs.findIndex(g => g.uid === glyph.uid);
                            if (idx === -1) return;

                            this.glyphs.splice(idx, 1);
                            this.glyphs.push(glyph);
                        }
                    }
                });

                menuList.push({
                    label: '(experimental)',
                    click: async (xwc, ywc) => {
                        pushHistory(HM(this))

                        let sequenceTextEditor;
                        let descHook = createIonFunction((p) => {
                            sequenceTextEditor = p;
                        });

                        const txt = `Expand this network by splitting each of the existing nodes into more detailed components `;
                        let initalText = true;
                        setTimeout(() => {
                            let i = 0;
                            let currentText = '';
                            const interval = setInterval(() => {
                                currentText += txt[i];
                                if (!initalText) {
                                    sequenceTextEditor.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor.setContent(currentText);
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
                                                                <font color="navy">Write a short paragraph that describes the network graphic you want to create. </font>
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
                                                        placeholder: "Enter a paragraph that describes the graphic network you want to create.",
                                                        cursorStyle: "block"
                                                    },
                                                    onDidFocusEditorWidget: createIon(() => {
                                                        if (initalText)
                                                            sequenceTextEditor.setContent("")
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
                                                                let Shape = await exec('flexigraph/shapes/shape.js')
                                                                const Glyph = await exec('baja/draw/glyph.js');

                                                                setTimeout(async () => {
                                                                    let content = sequenceTextEditor.getContent();
                                                                    let em = new EngineMonitor((msg) => {
                                                                        this.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })

                                                                    let selectedNode = Shape._toSvgStringFromJSON(selected_glyphs[0].shape.toJSON())
                                                                    this.setMessage("Building model", 5)
                                                                    let vs = []
                                                                    for (let g of this.glyphs) {
                                                                        if (g && g.shape) {
                                                                            vs.push(Shape._toSvgStringFromJSON(g.shape.toJSON()))
                                                                        }
                                                                    }

                                                                    let r = await exec('py/openai/analytics/generate-svg-expand-network.py', content, { 'svg': selectedNode }, { "svg": vs });
                                                                    let svgg = r['svg']
                                                                    const shape = Shape.fromSvgString(svgg);
                                                                    this.addAllRelativeToCenter([new Glyph(shape)], this.grid)
                                                                    this.killSprite();

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

                    }
                });

                menuList.push({
                    label: 'Theme',
                    click: async (xwc, ywc) => {
                        const themes = await exec('flexigraph/shapes/shape-themes')
                        let tm = []
                        const gfxTheme = Object.keys(themes);
                        for (let g of gfxTheme) {
                            tm.push({
                                label: `${g}`,
                                click: async (xwc, ywc) => {
                                    const ttm = []
                                    for (let gg of Object.keys(themes[g])) {
                                        ttm.push({
                                            label: `${gg}`,
                                            click: async (xwc, ywc) => {
                                                for (let glyph of selected_glyphs) {
                                                    const gfxTheme = themes[g][gg];
                                                    const shape = glyph.shape;
                                                    Shape._attachApplyTheme(shape)
                                                    shape.applyTheme(gfxTheme);
                                                }
                                            }
                                        })

                                    }
                                    this.setMenu(ttm)

                                }

                            }
                            );
                        }

                        this.setMenu(tm)

                    }
                });
                menuList.push({
                    label: 'Draw line',
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this));

                            let clickIndex = 0;

                            const isNum = v => typeof v === 'number' && Number.isFinite(v);

                            const getSelectedCenterWorld = (selected) => {
                                const g0 = Array.isArray(selected) && selected.length ? selected[0] : null;
                                const s = g0?.shape;
                                if (!s) return null;

                                if (typeof s.getPivot === 'function') {
                                    const p = s.getPivot();
                                    if (p && isNum(p.wx) && isNum(p.wy)) return { wx: p.wx, wy: p.wy };
                                }

                                Shape._attachBBoxMethods?.(s);
                                if (typeof s.getX === 'function' && typeof s.getY === 'function' &&
                                    typeof s.getXf === 'function' && typeof s.getYf === 'function') {
                                    const x1 = s.getX(), y1 = s.getY(), x2 = s.getXf(), y2 = s.getYf();
                                    if ([x1, y1, x2, y2].every(isNum)) return { wx: (x1 + x2) / 2, wy: (y1 + y2) / 2 };
                                }

                                if (('x' in s) && ('y' in s)) {
                                    const cx = Number(s.x), cy = Number(s.y);
                                    if (isNum(cx) && isNum(cy)) return { wx: cx, wy: cy };
                                }

                                return null;
                            };

                            const selected_glyph = (selected_glyphs && selected_glyphs.length) ? selected_glyphs[0] : null;
                            const c = getSelectedCenterWorld(selected_glyphs);
                            if (!c || !selected_glyph) return;

                            const theme_path = selected_glyph?.gfx?.path || null;

                            let hd = {
                                startWx: c.wx,
                                startWy: c.wy,
                                endWx: c.wx,
                                endWy: c.wy,
                                isDrawing: true,
                                priority: true,
                                id: 'glyph-override-draw-line',

                                draw: (grid, ctx) => {
                                    if (!hd.isDrawing) return;
                                    if (![hd.startWx, hd.startWy, hd.endWx, hd.endWy].every(isNum)) return;

                                    const now = Date.now();
                                    const pulse = (Math.sin(now / 400) + 1) / 2;

                                    ctx.save();
                                    ctx.globalAlpha = 0.4 + 0.3 * pulse;
                                    ctx.lineWidth = 2 + 3 * pulse;
                                    ctx.strokeStyle = 'rgba(0,150,255,1)';
                                    ctx.lineCap = 'round';

                                    ctx.beginPath();
                                    ctx.moveTo(grid.X(hd.startWx), grid.Y(hd.startWy));
                                    ctx.lineTo(grid.X(hd.endWx), grid.Y(hd.endWy));
                                    ctx.stroke();

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    clickIndex++;

                                    if (clickIndex === 1) {
                                        hd.endWx = wx;
                                        hd.endWy = wy;
                                        hd.isDrawing = true;
                                        return;
                                    }

                                    if (clickIndex === 2) {
                                        hd.endWx = wx;
                                        hd.endWy = wy;

                                        const line = Shape._makeLineFromWorld(
                                            hd.startWx, hd.startWy,
                                            hd.endWx, hd.endWy,
                                            { stroke: '#0096ff', strokeWidth: 2 },
                                            Shape.getGfx?.() || Shape.DefaultGfx
                                        );

                                        if (line) {

                                            Shape._attachApplyTheme?.(line);

                                            line.gfx = line.gfx || {};
                                            if (theme_path) line.gfx.path = theme_path;

                                            let theme = null;
                                            if (theme_path && typeof theme_path === 'string' && theme_path.indexOf('.') > 0) {
                                                const parts = theme_path.split('.');
                                                if (parts.length === 2) {
                                                    const [category, themeKey] = parts;
                                                    theme = ShapeThemes?.[category]?.[themeKey] || null;
                                                }
                                            }
                                            if (theme && typeof line.applyTheme === 'function') {
                                                line.applyTheme(theme);
                                            }

                                            const newGlyph = new Glyph(line);

                                            const selIdx = this.glyphs.findIndex(g => g?.uid === selected_glyph.uid);
                                            if (selIdx >= 0) this.glyphs.splice(selIdx, 0, newGlyph);
                                            else this.addGlyphNoSelect(newGlyph);
                                        }

                                        this.wb(null);
                                    }
                                },

                                mouseMoveListener: (x, y) => {
                                    if (!hd.isDrawing) return;
                                    hd.endWx = this.grid.Xwc(x);
                                    hd.endWy = this.grid.Ywc(y);
                                },

                                mouseUpListener: () => { },
                                close: () => { hd.isDrawing = false; }
                            };

                            setTimeout(() => {
                                this.wb(hd);
                            }, 50);

                        } catch (err) {
                            console.error('Draw line (from selected center) failed:', err);
                            this.wb(null);
                        }
                    }
                });
                menuList.push({
                    label: '(45°) line ',
                    click: async (xwc, ywc) => {
                        try {
                            pushHistory(HM(this));

                            let clickIndex = 0;
                            const isNum = v => typeof v === 'number' && Number.isFinite(v);

                            const getSelectedCenterWorld = (selected) => {
                                const g0 = Array.isArray(selected) && selected.length ? selected[0] : null;
                                const s = g0?.shape;
                                if (!s) return null;

                                if (typeof s.getPivot === 'function') {
                                    const p = s.getPivot();
                                    if (p && isNum(p.wx) && isNum(p.wy)) return { wx: p.wx, wy: p.wy };
                                }

                                Shape._attachBBoxMethods?.(s);
                                if (typeof s.getX === 'function' && typeof s.getY === 'function' &&
                                    typeof s.getXf === 'function' && typeof s.getYf === 'function') {
                                    const x1 = s.getX(), y1 = s.getY(), x2 = s.getXf(), y2 = s.getYf();
                                    if ([x1, y1, x2, y2].every(isNum)) return { wx: (x1 + x2) / 2, wy: (y1 + y2) / 2 };
                                }

                                if (('x' in s) && ('y' in s)) {
                                    const cx = Number(s.x), cy = Number(s.y);
                                    if (isNum(cx) && isNum(cy)) return { wx: cx, wy: cy };
                                }

                                return null;
                            };

                            const selected_glyph = (selected_glyphs && selected_glyphs.length) ? selected_glyphs[0] : null;
                            const c = getSelectedCenterWorld(selected_glyphs);
                            if (!c || !selected_glyph) return;

                            const theme_path = selected_glyph?.gfx?.path || null;

                            const snap45 = (sx, sy, ex, ey) => {
                                const dx = ex - sx;
                                const dy = ey - sy;
                                const r = Math.hypot(dx, dy);
                                if (r < 1e-9) return { wx: ex, wy: ey };

                                const a = Math.atan2(dy, dx);
                                const step = Math.PI / 4;
                                const aSnap = Math.round(a / step) * step;

                                return {
                                    wx: sx + r * Math.cos(aSnap),
                                    wy: sy + r * Math.sin(aSnap)
                                };
                            };

                            let hd = {
                                startWx: c.wx,
                                startWy: c.wy,
                                endWx: c.wx,
                                endWy: c.wy,
                                isDrawing: true,
                                priority: true,
                                id: 'glyph-override-draw-line-45',

                                draw: (grid, ctx) => {
                                    if (!hd.isDrawing) return;
                                    if (![hd.startWx, hd.startWy, hd.endWx, hd.endWy].every(isNum)) return;

                                    const now = Date.now();
                                    const pulse = (Math.sin(now / 400) + 1) / 2;

                                    ctx.save();
                                    ctx.globalAlpha = 0.4 + 0.3 * pulse;
                                    ctx.lineWidth = 2 + 3 * pulse;
                                    ctx.strokeStyle = 'rgba(0,150,255,1)';
                                    ctx.lineCap = 'round';

                                    ctx.beginPath();
                                    ctx.moveTo(grid.X(hd.startWx), grid.Y(hd.startWy));
                                    ctx.lineTo(grid.X(hd.endWx), grid.Y(hd.endWy));
                                    ctx.stroke();

                                    ctx.restore();
                                },

                                mouseDownListener: async (x, y) => {
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);

                                    clickIndex++;

                                    if (clickIndex === 1) {
                                        const s = snap45(hd.startWx, hd.startWy, wx, wy);
                                        hd.endWx = s.wx;
                                        hd.endWy = s.wy;
                                        hd.isDrawing = true;
                                        return;
                                    }

                                    if (clickIndex === 2) {
                                        const s = snap45(hd.startWx, hd.startWy, wx, wy);
                                        hd.endWx = s.wx;
                                        hd.endWy = s.wy;

                                        const line = Shape._makeLineFromWorld(
                                            hd.startWx, hd.startWy,
                                            hd.endWx, hd.endWy,
                                            { stroke: '#0096ff', strokeWidth: 2 },
                                            Shape.getGfx?.() || Shape.DefaultGfx
                                        );

                                        if (line) {

                                            Shape._attachApplyTheme?.(line);
                                            line.gfx = line.gfx || {};
                                            if (theme_path) line.gfx.path = theme_path;

                                            if (theme_path && theme_path.indexOf('.') > 0) {
                                                const parts = theme_path.split('.');
                                                if (parts.length === 2) {
                                                    const [category, themeKey] = parts;
                                                    const theme = ShapeThemes?.[category]?.[themeKey] || null;
                                                    if (theme) line.applyTheme(theme);
                                                }
                                            }

                                            const newGlyph = new Glyph(line);

                                            const selIdx = this.glyphs.findIndex(g => g?.uid === selected_glyph.uid);
                                            if (selIdx >= 0) this.glyphs.splice(selIdx, 0, newGlyph);
                                            else this.addGlyphNoSelect(newGlyph);
                                        }

                                        this.wb(null);
                                    }
                                },

                                mouseMoveListener: (x, y) => {
                                    if (!hd.isDrawing) return;
                                    const wx = this.grid.Xwc(x);
                                    const wy = this.grid.Ywc(y);
                                    const s = snap45(hd.startWx, hd.startWy, wx, wy);
                                    hd.endWx = s.wx;
                                    hd.endWy = s.wy;
                                },

                                mouseUpListener: () => { },
                                close: () => { hd.isDrawing = false; }
                            };

                            setTimeout(() => {
                                this.wb(hd);
                            }, 50);

                        } catch (err) {
                            console.error('Line (45°) failed:', err);
                            this.wb(null);
                        }
                    }
                });

                if (selected_glyphs && selected_glyphs.length > 1) {
                    menuList.push({
                        label: 'Vertical Align',
                        click: async (xwc, ywc) => {
                            try {
                                pushHistory(HM(this));
                                if (!selected_glyphs || selected_glyphs.length < 2) return;

                                const isNum = v => typeof v === 'number' && Number.isFinite(v);

                                const getCenterWorld = (shape) => {
                                    if (!shape) return null;

                                    if (typeof shape.getPivot === 'function') {
                                        const p = shape.getPivot();
                                        if (p && isNum(p.wx) && isNum(p.wy)) return { wx: p.wx, wy: p.wy };
                                    }

                                    if ((shape.type === 'Note') || ('rotationDeg' in shape && 'x' in shape && 'y' in shape)) {
                                        const cx = Number(shape.x), cy = Number(shape.y);
                                        if (isNum(cx) && isNum(cy)) return { wx: cx, wy: cy };
                                    }

                                    Shape._attachBBoxMethods?.(shape);
                                    if (typeof shape.getX === 'function' && typeof shape.getY === 'function' &&
                                        typeof shape.getXf === 'function' && typeof shape.getYf === 'function') {
                                        const x1 = shape.getX(), y1 = shape.getY(), x2 = shape.getXf(), y2 = shape.getYf();
                                        if ([x1, y1, x2, y2].every(isNum)) return { wx: (x1 + x2) / 2, wy: (y1 + y2) / 2 };
                                    }

                                    return null;
                                };

                                const translateShapeWorld = (shape, dx, dy) => {
                                    if (!shape || !isNum(dx) || !isNum(dy)) return;

                                    const shift = (s) => {
                                        if (!s || typeof s !== 'object') return;

                                        if (typeof s.x === 'number') s.x += dx;
                                        if (typeof s.y === 'number') s.y += dy;

                                        if (typeof s.cx === 'number') s.cx += dx;
                                        if (typeof s.cy === 'number') s.cy += dy;

                                        if (typeof s.x1 === 'number') s.x1 += dx;
                                        if (typeof s.y1 === 'number') s.y1 += dy;
                                        if (typeof s.x2 === 'number') s.x2 += dx;
                                        if (typeof s.y2 === 'number') s.y2 += dy;

                                        if (Array.isArray(s.pts)) {
                                            for (const p of s.pts) {
                                                if (!p) continue;
                                                if (typeof p.x === 'number') p.x += dx;
                                                if (typeof p.y === 'number') p.y += dy;
                                            }
                                        }

                                        if (Array.isArray(s.shapes)) for (const c of s.shapes) shift(c);
                                    };

                                    shift(shape);
                                };

                                const refGlyph = selected_glyphs[0];
                                const refShape = refGlyph?.shape;
                                const refC = getCenterWorld(refShape);
                                if (!refC) return;

                                for (let i = 1; i < selected_glyphs.length; i++) {
                                    const g = selected_glyphs[i];
                                    const s = g?.shape;
                                    if (!s) continue;

                                    const c = getCenterWorld(s);
                                    if (!c) continue;

                                    const dx = refC.wx - c.wx;
                                    translateShapeWorld(s, dx, 0);

                                    Shape._attachBBoxMethods?.(s);
                                    Shape._attachCollisionMethods?.(s);
                                    Shape._ensureInsideMethod?.(s);
                                }

                            } catch (err) {
                                console.error('Vertical Align failed:', err);
                            }
                        }
                    });

                    menuList.push({
                        label: 'Duplicate selected',
                        click: async () => {
                            try {
                                pushHistory(HM(this));
                                if (!selected_glyphs || !selected_glyphs.length) return;

                                const dx = this.grid?.worldWidth ? this.grid.worldWidth(20) : 20;
                                const dy = this.grid?.worldHeight ? this.grid.worldHeight(20) : 20;

                                const deepCloneData = (obj) => {
                                    try { if (typeof structuredClone === 'function') return structuredClone(obj); } catch { }
                                    return JSON.parse(JSON.stringify(obj));
                                };

                                const nudgeShapeData = (s) => {
                                    if (!s || typeof s !== 'object') return;

                                    if (typeof s.x === 'number') s.x += dx;
                                    if (typeof s.y === 'number') s.y += dy;
                                    if (typeof s.cx === 'number') s.cx += dx;
                                    if (typeof s.cy === 'number') s.cy += dy;

                                    if (typeof s.x1 === 'number') s.x1 += dx;
                                    if (typeof s.y1 === 'number') s.y1 += dy;
                                    if (typeof s.x2 === 'number') s.x2 += dx;
                                    if (typeof s.y2 === 'number') s.y2 += dy;

                                    if (Array.isArray(s.shapes)) for (const c of s.shapes) nudgeShapeData(c);
                                    if (Array.isArray(s.pts)) for (const p of s.pts) { if (p) { if (typeof p.x === 'number') p.x += dx; if (typeof p.y === 'number') p.y += dy; } }
                                };

                                const newGlyphs = [];
                                const gfx = Shape.gfx || Shape.DefaultGfx;

                                for (const g of selected_glyphs) {
                                    const src = g?.shape;
                                    if (!src) continue;

                                    const data = deepCloneData(src);
                                    if (!data || typeof data !== 'object') continue;

                                    nudgeShapeData(data);
                                    let rebuilt = null;
                                    if (typeof data.type === 'string' && data.type.toLowerCase().startsWith('svg_')) {
                                        rebuilt = Shape._buildSvgFromJSON(data, gfx);
                                    } else {

                                        rebuilt = data;

                                        rebuilt.uid = uuid();
                                        rebuilt.gfx = rebuilt.gfx || gfx;
                                        Shape._attachBBoxMethods?.(rebuilt);
                                        Shape._attachCollisionMethods?.(rebuilt);
                                        Shape._attachApplyTheme?.(rebuilt);
                                        Shape._ensureInsideMethod?.(rebuilt);
                                        if (('rotationDeg' in rebuilt) && rebuilt.rotationDeg) Shape._attachRotationMethods?.(rebuilt);
                                    }

                                    if (!rebuilt) continue;

                                    const ng = new Glyph(rebuilt);
                                    this.addGlyphNoSelect(ng);
                                    newGlyphs.push(ng);
                                }

                                selected_glyphs = newGlyphs;

                            } catch (err) {
                                console.error('Duplicate selected failed:', err);
                            }
                        }
                    });

                }

                menuList.push({
                    label: `Delete`,
                    click: async (xwc, ywc) => {
                        pushHistory(HM(this))
                        this.removeGlyphs(selected_glyphs)
                    }
                });

                this.setOptionsMenu(menuList)
                this.clearActionGlyphs();

            }

            showMenu(menu) {
                this.setMenu(menu)
            }

            toJSON() {

                return {
                    name: this.name,
                    color: this.color,
                    type: this.type,
                    uid: this.uid,
                    file: this.file,
                    users: this.users,
                    ifun: this.ifun,
                    description: this.description,
                    owner: this.owner,
                    background_function: this.background_function
                        ? JSON.stringify({ __function__: this.background_function.toString() })
                        : null,
                    fixedAspectRatio: this.fixedAspectRatio,
                    ptracks: this.ptracks,
                    formulas: this.formulas,
                    attr__showTablesMenu: this.attr__showTablesMenu,
                    attr__drawFormulaConnections: this.attr__drawFormulaConnections,
                    attr__displayEvents: this.attr__displayEvents,
                    attr__hideWellDetailPopup: this.attr__hideWellDetailPopup,
                    attr__showGrid: this.attr__showGrid,
                    attr__displayBookMarks: this.attr__displayBookMarks,
                    bookmarks: this.bookmarks,
                    ljl_bookmarks: this.ljl_bookmarks,
                    mode: this.mode,
                    selectedPlate: this.selectedPlate ? this.selectedPlate.uid : null,
                    fromPlate: this.fromPlate ? this.fromPlate.uid : null,
                    toPlate: this.toPlate ? this.toPlate.uid : null,
                    root: this.root.map(plate => plate.toJSON()),
                    transferFunctions: this.transferFunctions.map(tf => tf.toJSON()),
                    trackFunctions: this.trackFunctions.map(tf => tf.toJSON()),
                    connections: this.connections.map(conn => conn.toJSON()),
                    m_plots: this.m_plots.map(plot => plot.toJSON()),
                    glyphs: this.glyphs.map(glyph => glyph.toJSON()),
                    grid: this.grid.toJSON(),
                    layoutTool: this.layoutTool ? this.layoutTool.toJSON() : null,
                    __msg: this.__msg,

                };
            }

            removeConnectionWithThisPlate(plate_id) {
                let c = []
            }

            addPlot(plot) {
                this.m_plots.push(plot)
                LJScript.add(this.name, 'new plot ' + plot.name)

            }

            async createPlotConfig(t) {

                const plot = parsePlotObject(t);
                this.m_plots.push(plot)
                plot.highlight();
            }

            sortHighlight() {
                this.m_plots.sort((a, b) => {
                    return (b._highlight === true) - (a._highlight === true);
                });
            }

            showTablesMenu(bol) {
                this.attr__showTablesMenu = bol;

            }
            getPlot(scx, scy) {
                for (let i = this.m_plots.length - 1; i >= 0; i--) {
                    let p = this.m_plots[i];
                    if (p._highlight === true && p.inside(this.grid, scx, scy, this)) {
                        return p;
                    }
                }

                for (let i = this.m_plots.length - 1; i >= 0; i--) {
                    let p = this.m_plots[i];
                    if (p.inside(this.grid, scx, scy, this)) {
                        return p;
                    }
                }
                return null;
            }

            getRef(ref) {
                for (let c of this.connections) {
                    if (c.uid === ref) {
                        return c;
                    }
                }
                let f = null;
                if (this.root && this.root.length > 0) {
                    for (let r of this.root) {
                        f = r.getRef(ref)
                        if (f) {
                            return f;
                        }
                    }
                }
                for (let c of this.m_plots) {
                    if (c.uid == ref) {
                        return ref;
                    }
                }
                return this;
            }

            init() {
                let colorWells = (type) => {
                    if (type === 'STD') {
                        return 'lightBlue'
                    } else
                        if (type === 'CTRL') {
                            return 'lightOrange'
                        } else {
                            return 'lightYellow';
                        }
                }
                let menuList = [
                ]

            }

            setWorkbench(wb) {
                if (this.wb != wb)
                    this.wb = wb;
            }

            updateworkbench(wb) {
                this.wb(wb);
            }

            unhighlightPlots() {
                const highlightedPlots = [];
                const unhighlightedPlots = [];

                for (let p of this.m_plots) {
                    if (p.isHighlighted()) {
                        p.unhighlight();
                        highlightedPlots.push(p);
                    } else {
                        unhighlightedPlots.push(p);
                    }
                }

                this.m_plots = [...unhighlightedPlots, ...highlightedPlots];
            }

            unhighlightAll() {
                this.menu = null;
                for (let r of this.root) {
                    r.unhighlight();
                }
                for (let p of this.m_plots) {
                    p.unhighlight();
                }
            }

            clearMenu() {
                setTimeout(() => {
                    this.menu = null;

                }, 200)
            }

            setMenu(_menu) {
                if (isMobile()) {
                    if (_menu.list && _menu.list.length > 0) {
                        exec('flexigraph/show-mobile-menu-no-reset.js', _menu.list)

                    } else {
                        exec('flexigraph/show-mobile-menu-no-reset.js', _menu)
                    }
                    return;
                }
                if (_menu && Array.isArray(_menu) && _menu.length > 0) {
                    const m = _menu;
                    const cols = 3;
                    const smenu2 = new Menu(
                        m,
                        this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200),
                        this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2),
                        'rgb(134, 240, 29)',
                        'black',
                        cols
                    );
                    return this.setMenu(smenu2);
                }
                setTimeout(() => {
                    this.wb(null)
                    this.menu = null;
                    this.menu = _menu;
                    this.menu_vis = true;
                }, 300)
            }

            showMenuWithTitle(title, m) {
                const cols = 2;
                this.menu = new Menu(m,
                    this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200),
                    this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', cols)

                this.menu.title = title;
                this.menu_vis = true;

            }

            deselectAll() {
                this.side_menu = null;
                this.menu = null;
                if (this.selectedPlate) {
                    if (this.selectedPlate.setMenu)
                        this.selectedPlate.setMenu(this, null)
                }
                this.setSelected(null);

                this.selectedPlate = null;
                for (let r of this.root) {
                    r.deselectAll();
                }
                for (let t of this.transferFunctions) {
                    t.deselectIt();
                }
                for (let t of this.trackFunctions) {
                    t.deselectIt();
                }
                for (let p of this.m_plots) {
                    if (p && p.deselectIt) p.deselectIt();
                }
            }

            getAllObjects() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            getAllPlates() {
                let allDrawables = [
                    ...(this.root || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            getAllPlots() {
                let allDrawables = [
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            getAllGlyphs() {
                let allDrawables = [
                    ...this.glyphs,
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            unModal() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                for (let i = allDrawables.length - 1; i >= 0; i--) {
                    const obj = allDrawables[i];
                    if (obj.unModal) {
                        obj.unModal();
                    }
                }
                this.menu = null
                this.menu_vis = null;
            }
            deselectWells() {
                this.pushState();

                this.menu = null;
                for (let r of this.root) {
                    r.deselectWells();
                }
            }
            removeRootplate(plate) {
                const index = this.root.indexOf(plate);
                if (index >= 0) {
                    this.root.splice(index, 1);
                }
                this.setSelected(null)

            }
            removePlot(plot) {
                this.deselectAll();
                const index = this.m_plots.indexOf(plot);
                if (index >= 0) {
                    this.m_plots.splice(index, 1);
                }
                this.setSelected(null)
            }

            selectPlate(plate) {
                this.setSelected(plate);
            }

            deselectPlateRoots() {
                this.pushState();

                for (let r of this.root) {
                    r.deselectPlateRoot();
                }
                for (let t of this.transferFunctions) {
                    t.deselectIt();
                }
                for (let t of this.trackFunctions) {
                    t.deselectIt();
                }
            }

            resetGrid() {
                this.grid = new MGrid(0, 0, 5, 5);
                this.grid.setxmax(2.5);
                this.grid.setymax(2.5);
                this.grid.setxmin(1);
                this.grid.setymin(1);
                this.grid.setInset(0, 0)
                this.grid.rescale();
            }

            createTable(name, rows, x, y) {
                const columns = Object.keys(rows[0]);
                let plate = new Plate(name, columns.length, rows.length);
                plate.wells = rows.map((rowData, rowIndex) => {

                    return columns.map((key, colIndex) => {
                        let well = new GenericWell(`${key}-${rowIndex}`);

                        well.value = rowData[key] || null;
                        well.name = `${key}`;

                        return well;
                    });
                });
                plate.plateType = 'data'
                plate.grid.width = 1;
                plate.grid.height = 1;
                plate.grid.xi = x;
                plate.grid.yi = y;
                this.grid.rescale();
                this.addNextAvailableX(plate)
                setTimeout(() => {
                    this.zoomintoplate(plate)

                }, 1000)
                return plate;
            }
            navigate(direction) {
                const xScaleIncrement = (this.grid.xmax - this.grid.xmin) * 0.1;
                const yScaleIncrement = (this.grid.ymax - this.grid.ymin) * 0.1;
                if (this.selected_well) {
                    let yc = this.selected_well.__screen_y;
                    let h = this.selected_well.__screen_height;
                    if (yc + h + 100 > this.grid.Y(this.grid.ymin)) {
                        this.grid.ymax -= yScaleIncrement;
                        this.grid.ymin -= yScaleIncrement;
                        this.grid.rescale();
                    } else if (yc - 100 < 0) {
                        this.grid.ymax += yScaleIncrement;
                        this.grid.ymin += yScaleIncrement;
                        this.grid.rescale();
                    }
                } else {
                    if (direction === 'down') {
                        this.grid.ymax -= yScaleIncrement;
                        this.grid.ymin -= yScaleIncrement;
                        this.grid.rescale();
                    } else if (direction === 'up') {
                        this.grid.ymax += yScaleIncrement;
                        this.grid.ymin += yScaleIncrement;
                        this.grid.rescale();
                    }
                    else if (direction === 'right') {
                        this.grid.xmax += xScaleIncrement;
                        this.grid.xmin += xScaleIncrement;
                        this.grid.rescale();
                    } else if (direction === 'left') {

                        this.grid.xmax -= xScaleIncrement;
                        this.grid.xmin -= xScaleIncrement;
                        this.grid.rescale();
                    }
                }

            }

            replacePlate(plate1, plate3) {
                const index = this.root.indexOf(plate1);
                if (index !== -1) {
                    this.root[index] = plate3;
                }
            }

            async separatePlatesOverTime2(opts = {}) {
                const spacing = opts.spacing ?? 24;
                const durationMs = opts.durationMs ?? 10_000;
                const iterationsPerFrame = opts.iterationsPerFrame ?? 6;
                const epsilon = opts.epsilon ?? 0.01;
                const renderEachFrame = opts.renderEachFrame ?? true;
                const keepStrictCenter = opts.keepStrictCenter ?? true;

                const explodeFrac = Math.max(0.05, Math.min(0.6, opts.explodeFrac ?? 0.25));
                const explodeStep = opts.explodeStep ?? 4;
                const wanderStep = opts.wanderStep ?? 2.2;
                const jitterReseedRate = opts.jitterReseedRate ?? 0.2;

                const alignStrength = opts.alignStrength ?? 0.12;
                const layoutPadding = opts.layoutPadding ?? 8;

                const plates = this.root?.filter(p => p?.grid) ?? [];
                if (plates.length <= 1) {
                    if (renderEachFrame) this.generateTables?.();
                    return;
                }

                const screenCenter = () => {
                    const xwc = this.grid.Xwc(0);
                    const ywc = this.grid.Ywc(0);
                    const W = this.grid.worldWidth(this.grid.width);
                    const H = this.grid.worldHeight(this.grid.height);
                    return { cx: xwc + W * 0.5, cy: ywc - H * 0.5 };
                };

                const cx = p => p.grid.xi + p.grid.width * 0.5;
                const cy = p => p.grid.yi + p.grid.height * 0.5;

                const groupBounds = () => {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const p of plates) {
                        minX = Math.min(minX, p.grid.xi);
                        minY = Math.min(minY, p.grid.yi);
                        maxX = Math.max(maxX, p.grid.xi + p.grid.width);
                        maxY = Math.max(maxY, p.grid.yi + p.grid.height);
                    }
                    return { minX, minY, maxX, maxY, cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5 };
                };

                const centerGroupExact = () => {
                    const { cx: scx, cy: scy } = screenCenter();
                    const { cx: gcx, cy: gcy } = groupBounds();
                    const dx = scx - gcx, dy = scy - gcy;
                    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return;
                    for (const p of plates) { p.grid.xi += dx; p.grid.yi += dy; }
                };

                const relaxOnceXY = () => {
                    let totalPen = 0;
                    for (let i = 0; i < plates.length; i++) {
                        for (let j = i + 1; j < plates.length; j++) {
                            const a = plates[i], b = plates[j];
                            const halfW = (a.grid.width + b.grid.width) * 0.5 + spacing;
                            const halfH = (a.grid.height + b.grid.height) * 0.5 + spacing;

                            const dx = cx(a) - cx(b);
                            const dy = cy(a) - cy(b);
                            const px = halfW - Math.abs(dx);
                            const py = halfH - Math.abs(dy);

                            if (px > 0 && py > 0) {
                                const sx = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
                                const sy = dy === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dy);
                                const pushX = (px * 0.5) * sx;
                                const pushY = (py * 0.5) * sy;
                                a.grid.xi += pushX; a.grid.yi += pushY;
                                b.grid.xi -= pushX; b.grid.yi -= pushY;
                                totalPen += (px + py);
                            }
                        }
                    }
                    return totalPen;
                };

                const countAssignmentsFor = (plate) => {
                    const name = plate?.name ?? plate?.id ?? "";
                    let count = 0;

                    if (this.formulas && typeof this.formulas === "object") {
                        for (const k in this.formulas) {
                            if (!Object.prototype.hasOwnProperty.call(this.formulas, k)) continue;
                            if (k.startsWith(name)) {
                                const v = this.formulas[k];

                                count += Array.isArray(v) ? v.length : (v ? 1 : 0);
                            }
                        }
                    }

                    if (count === 0 && plate.getFormula) {
                        const f = plate.getFormula();
                        if (f && typeof f === "object") {
                            for (const fk of Object.keys(f)) {
                                const v = f[fk];
                                count += Array.isArray(v) ? v.length : (v ? 1 : 0);
                            }
                        }
                    }

                    return count;
                };

                const items = plates.map(p => ({
                    p,
                    w: p.grid.width,
                    h: p.grid.height,
                    name: p?.name ?? "",
                    count: countAssignmentsFor(p)
                })).sort((a, b) => (a.count - b.count) || a.name.localeCompare(b.name));

                const { cx: scx } = screenCenter();
                const totalWidth = items.reduce((acc, it, i) =>
                    acc + it.w + (i > 0 ? spacing + layoutPadding : 0), 0);
                let runningX = scx - totalWidth * 0.5;

                const targetCx = new Map();
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    runningX += (i > 0 ? spacing + layoutPadding : 0);
                    const cxTarget = runningX + it.w * 0.5;
                    targetCx.set(it.p, cxTarget);
                    runningX += it.w;
                }

                const randUnit = () => {
                    const th = Math.random() * Math.PI * 2;
                    return { x: Math.cos(th), y: Math.sin(th) };
                };

                const drifts = plates.map(() => randUnit());

                for (const p of plates) {
                    p.grid.xi += (Math.random() - 0.5) * 1e-6;
                    p.grid.yi += (Math.random() - 0.5) * 1e-6;
                }

                if (this._separationCancel?.active) this._separationCancel.active = false;
                const token = { active: true };
                this._separationCancel = token;

                const now = (typeof performance !== "undefined" && performance.now)
                    ? () => performance.now()
                    : () => Date.now();

                const rAF = (cb) =>
                    (typeof requestAnimationFrame !== "undefined")
                        ? requestAnimationFrame(cb)
                        : setTimeout(() => cb(now()), 16);

                const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

                centerGroupExact();

                const start = now();

                await new Promise((resolve) => {
                    const tick = (ts) => {
                        if (!token.active) return resolve();

                        const t = Math.max(0, Math.min(1, (ts - start) / durationMs));
                        const inExplode = t < explodeFrac;
                        const explodeScale = inExplode ? (1 - t / explodeFrac) : 0;

                        const jitterScale = 1 - easeOutCubic(t);

                        for (let i = 0; i < plates.length; i++) {
                            const p = plates[i];

                            if (Math.random() < jitterReseedRate) drifts[i] = randUnit();

                            const dxExplode = drifts[i].x * explodeStep * explodeScale;
                            const dyExplode = drifts[i].y * explodeStep * explodeScale;

                            const jx = (Math.random() * 2 - 1) * wanderStep * jitterScale;
                            const jy = (Math.random() * 2 - 1) * wanderStep * jitterScale;

                            const tx = targetCx.get(p) ?? cx(p);
                            const springX = (tx - cx(p)) * alignStrength;

                            p.grid.xi += dxExplode + jx + springX;
                            p.grid.yi += dyExplode + jy;
                        }

                        let lastPen = 0;
                        for (let k = 0; k < iterationsPerFrame; k++) {
                            lastPen = relaxOnceXY();
                            if (lastPen < epsilon) break;
                        }

                        if (keepStrictCenter) centerGroupExact();
                        if (renderEachFrame) this.generateTables?.();

                        if ((lastPen < epsilon && !inExplode && jitterScale < 0.05) || t >= 1) return resolve();
                        rAF(tick);
                    };

                    rAF(tick);
                });

                for (let i = 0; i < 16; i++) {
                    const pen = relaxOnceXY();
                    if (pen < epsilon) break;
                }
                if (keepStrictCenter) centerGroupExact();
                this.generateTables?.();
            }

            layoutCompactTetris(opts = {}) {
                const platesRaw = this.root;
                const plotsRaw = this.m_plots;
                const glyphsRaw = this.glyphs || [];

                const grid = this.grid;
                grid.rescale();
                this.clearActionGlyphs();

                const duration = Math.max(0, opts.duration ?? 800);
                const staggerMs = Math.max(0, opts.stagger ?? 0);
                const easingName = opts.easing ?? "easeInOutCubic";
                const gutter = opts.gutter ?? grid.worldHeight(30);
                const margin = opts.margin ?? grid.worldHeight(0);
                const topToBottom = opts.topToBottom ?? true;
                const zoomToFit = !!opts.zoomToFit;
                const onUpdate = typeof opts.onUpdate === "function" ? opts.onUpdate : null;

                const plotHeightPad = opts.plotHeightPad ?? grid.worldHeight(100);

                const glyphHeightPad = opts.glyphHeightPad ?? grid.worldHeight(20);
                const glyphMaxW = opts.glyphMaxW ?? null;

                const Easings = {
                    linear: t => t,
                    easeOutQuad: t => 1 - (1 - t) * (1 - t),
                    easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
                };
                const ease = Easings[easingName] ?? Easings.easeInOutCubic;

                const lerp = (a, b, t) => a + (b - a) * t;

                grid.rescale();

                const isNum = v => typeof v === "number" && Number.isFinite(v);
                const n0 = v => (isNum(v) ? v : 0);

                const getGlyphShape = (g) => (g && g.shape) ? g.shape : g;

                const getAabbWorld = (shapeLike) => {
                    const s = getGlyphShape(shapeLike);
                    if (!s) return null;

                    if (typeof s.getAABB === "function") {
                        const bb = s.getAABB();
                        if (bb && isNum(bb.x) && isNum(bb.y) && isNum(bb.w) && isNum(bb.h)) return bb;
                    }
                    if (typeof s.getBBox === "function") {
                        const bb = s.getBBox();
                        if (bb && isNum(bb.x) && isNum(bb.y) && isNum(bb.w) && isNum(bb.h)) return bb;
                    }

                    const x = ("x" in s) ? n0(s.x) : n0(s.x1);
                    const y = ("y" in s) ? n0(s.y) : n0(s.y1);

                    let w = ("w" in s) ? n0(s.w) : 0;
                    let h = ("h" in s) ? n0(s.h) : 0;

                    if (!w && ("x1" in s) && ("x2" in s)) w = Math.abs(n0(s.x2) - n0(s.x1));
                    if (!h && ("y1" in s) && ("y2" in s)) h = Math.abs(n0(s.y2) - n0(s.y1));

                    if ((!w || !h) && s.type === "text" && typeof s.text === "string") {
                        const fs = isNum(s.fontSize) ? s.fontSize : 16;
                        const lines = s.text.split("\n");
                        const maxChars = Math.max(1, ...lines.map(L => L.length));
                        w = w || (maxChars * fs * 0.6);
                        h = h || (lines.length * fs * 1.2);
                    }

                    w = w || grid.worldWidth(40);
                    h = h || grid.worldHeight(20);

                    return { x, y, w, h };
                };

                const translateShapeWorld = (shapeLike, dx, dy) => {
                    const s = getGlyphShape(shapeLike);
                    if (!s || (!dx && !dy)) return;

                    if (typeof Shape !== "undefined" && typeof Shape._translateShapeSafe === "function") {
                        Shape._translateShapeSafe(s, dx, dy);
                        return;
                    }

                    const shift = (k) => { if (k in s) s[k] = n0(s[k]) + (k.startsWith("x") ? dx : dy); };

                    ["x", "y", "xf", "yf", "x1", "y1", "x2", "y2", "cx", "cy"].forEach(k => {
                        if (k in s) {
                            if (k.startsWith("x") || k === "cx") s[k] = n0(s[k]) + dx;
                            if (k.startsWith("y") || k === "cy") s[k] = n0(s[k]) + dy;
                        }
                    });

                    if (Array.isArray(s.points)) {
                        s.points = s.points.map(pt => ({
                            ...pt,
                            x: n0(pt.x) + dx,
                            y: n0(pt.y) + dy,
                        }));
                    }
                };

                const plateBoxes = platesRaw.map(p => {
                    const wWorld = p.getWidth();
                    const hWorld = p.getHeight();
                    const curTopWorldY = p.grid.yi;
                    return {
                        kind: "plate",
                        ref: p,
                        w: wWorld,
                        h: hWorld,
                        hEff: hWorld,
                        cur: { xw: p.grid.xi, yw: curTopWorldY },
                    };
                });

                const plotBoxes = plotsRaw.map(p => {
                    const wWorld = p.w;
                    const hWorld = p.h;
                    const cur = { xw: p.grid.xi, yw: p.grid.yi };
                    return {
                        kind: "plot",
                        ref: p,
                        w: wWorld,
                        h: hWorld,
                        hEff: hWorld + plotHeightPad,
                        cur,
                    };
                });

                const glyphBoxes = glyphsRaw
                    .map(g => {
                        const bb = getAabbWorld(g);
                        if (!bb) return null;

                        return {
                            kind: "glyph",
                            ref: g,
                            w: bb.w,
                            h: bb.h,
                            hEff: bb.h + glyphHeightPad,
                            cur: { xw: bb.x, yw: bb.y },
                        };
                    })
                    .filter(Boolean);

                const boxesMain = [...plateBoxes, ...plotBoxes];
                const boxesGlyph = [...glyphBoxes];

                if (boxesMain.length === 0 && boxesGlyph.length === 0) return;

                const shelfPack = (boxes, targetBlockW) => {
                    const shelves = [];
                    let shelf = { items: [], w: 0, h: 0 };

                    for (const b of boxes) {
                        const tileW = b.w + gutter;
                        const tileH = b.hEff + gutter;

                        if (shelf.w > 0 && shelf.w + tileW > targetBlockW && shelf.items.length > 0) {
                            shelves.push(shelf);
                            shelf = { items: [], w: 0, h: 0 };
                        }
                        shelf.items.push(b);
                        shelf.w += tileW;
                        shelf.h = Math.max(shelf.h, tileH);
                    }

                    if (shelf.items.length) shelves.push(shelf);
                    return shelves;
                };

                const totalAreaMain = boxesMain.reduce((acc, b) => acc + (b.w + gutter) * (b.hEff + gutter), 0) || 1;

                const viewW = grid.getxmax() - grid.getxmin();
                const viewH = grid.getymax() - grid.getymin();
                const viewAR = viewW / Math.max(viewH, 1e-6);
                const targetBlockWMain = Math.sqrt(totalAreaMain * viewAR);

                const shelvesMain = shelfPack(boxesMain, targetBlockWMain);

                const blockWMain = shelvesMain.length
                    ? (Math.max(...shelvesMain.map(s => s.w)) - gutter)
                    : 0;
                const blockHMain = shelvesMain.length
                    ? (shelvesMain.reduce((acc, s) => acc + s.h, 0) - gutter)
                    : 0;

                let targetBlockWGlyph = blockWMain || targetBlockWMain;
                if (glyphMaxW && isNum(glyphMaxW)) targetBlockWGlyph = Math.min(targetBlockWGlyph, glyphMaxW);

                const shelvesGlyph = shelfPack(boxesGlyph, targetBlockWGlyph);

                const blockWGlyph = shelvesGlyph.length
                    ? (Math.max(...shelvesGlyph.map(s => s.w)) - gutter)
                    : 0;
                const blockHGlyph = shelvesGlyph.length
                    ? (shelvesGlyph.reduce((acc, s) => acc + s.h, 0) - gutter)
                    : 0;

                const blockW = Math.max(blockWMain, blockWGlyph);
                const blockH = blockHMain + (shelvesGlyph.length ? (gutter + blockHGlyph) : 0);

                const cx = (grid.getxmin() + grid.getxmax()) / 2;
                const cy = (grid.getymin() + grid.getymax()) / 2;
                const startX = cx - blockW / 2;
                const startY = cy + blockH / 2;
                const verticalDir = topToBottom ? -1 : +1;

                let yCursor = startY;
                const targets = [];

                const emitShelves = (shelves, blockWForGroup) => {
                    for (const shelf of shelves) {
                        const shelfW = (shelf.w - gutter);
                        const shelfX = startX + (blockWForGroup - shelfW) / 2;
                        let xCursor = shelfX;

                        for (const b of shelf.items) {
                            targets.push({ box: b, target: { xw: xCursor, yw: yCursor } });
                            xCursor += (b.w + gutter);
                        }
                        yCursor += verticalDir * shelf.h;
                    }
                };

                {
                    const groupStartX = startX + (blockW - blockWMain) / 2;
                    const savedStartX = startX;

                    const _startX = startX;

                    for (const shelf of shelvesMain) {
                        const shelfW = (shelf.w - gutter);
                        const shelfX = groupStartX + (blockWMain - shelfW) / 2;
                        let xCursor = shelfX;

                        for (const b of shelf.items) {
                            targets.push({ box: b, target: { xw: xCursor, yw: yCursor } });
                            xCursor += (b.w + gutter);
                        }
                        yCursor += verticalDir * shelf.h;
                    }
                }

                if (shelvesGlyph.length) yCursor += verticalDir * gutter;

                {
                    const groupStartX = startX + (blockW - blockWGlyph) / 2;
                    for (const shelf of shelvesGlyph) {
                        const shelfW = (shelf.w - gutter);
                        const shelfX = groupStartX + (blockWGlyph - shelfW) / 2;
                        let xCursor = shelfX;

                        for (const b of shelf.items) {
                            targets.push({ box: b, target: { xw: xCursor, yw: yCursor } });
                            xCursor += (b.w + gutter);
                        }
                        yCursor += verticalDir * shelf.h;
                    }
                }

                const fit = {
                    xmin: startX - margin,
                    xmax: startX + blockW + margin,
                    ymax: startY + margin,
                    ymin: startY - blockH - margin,
                };

                const writePose = (box, pose) => {
                    if (box.kind === "plot") {
                        box.ref.x = pose.xw;
                        box.ref.y = pose.yw;
                    } else if (box.kind === "plate") {
                        box.ref.grid.xi = pose.xw;
                        box.ref.grid.yi = pose.yw - box.h;
                    } else if (box.kind === "glyph") {

                        const cur = box.cur || { xw: pose.xw, yw: pose.yw };
                        const dx = pose.xw + cur.xw;
                        const dy = pose.yw + cur.yw;
                        translateShapeWorld(box.ref, dx, dy);

                        box.cur = { xw: pose.xw, yw: pose.yw };
                    }
                };

                for (const { box } of targets) {
                    if (!box.cur) {
                        if (box.kind === "plot") {
                            box.cur = { xw: n0(box.ref.x), yw: n0(box.ref.y) };
                        } else if (box.kind === "plate") {
                            const hWorld = box.h;
                            box.cur = { xw: n0(box.ref.grid?.xi), yw: n0(box.ref.grid?.yi) + hWorld };
                        } else if (box.kind === "glyph") {
                            const bb = getAabbWorld(box.ref);
                            box.cur = bb ? { xw: bb.x, yw: bb.y } : { xw: 0, yw: 0 };
                        }
                    }
                }

                const t0 = performance.now();
                const n = targets.length;
                const starts = targets.map((_, i) => i * staggerMs);
                const ends = targets.map((_, i) => starts[i] + duration);

                const step = (now) => {
                    let allDone = true;

                    for (let i = 0; i < n; i++) {
                        const { box, target } = targets[i];
                        const startTime = t0 + starts[i];
                        const endTime = t0 + ends[i];

                        if (now < startTime) { allDone = false; continue; }

                        const raw = Math.min(1, (now - startTime) / Math.max(1, duration));
                        const e = ease(raw);

                        const xw = lerp(box.cur.xw, target.xw, e);
                        const yw = lerp(box.cur.yw, target.yw, e);
                        writePose(box, { xw, yw });

                        if (now < endTime) allDone = false;
                    }

                    onUpdate && onUpdate();

                    if (!allDone) {
                        requestAnimationFrame(step);
                    } else {

                        for (const { box, target } of targets) writePose(box, target);

                        if (zoomToFit) {
                            grid.zoom(fit.xmin, fit.xmax, fit.ymin, fit.ymax);
                        }
                        onUpdate && onUpdate();
                    }
                };

                if (n === 0 || duration === 0) {
                    for (const { box, target } of targets) writePose(box, target);
                    if (zoomToFit) grid.zoom(fit.xmin, fit.xmax, fit.ymin, fit.ymax);
                    onUpdate && onUpdate();
                    return;
                }

                requestAnimationFrame(step);
            }

            moveOneToVacant(_plot, opts = {}) {

                this.m_plots.push(_plot)
                const name = _plot.name;
                const platesRaw = this.root;
                const plotsRaw = this.m_plots;
                const grid = this.grid;
                grid.rescale();

                const duration = Math.max(0, opts.duration ?? 600);
                const easingName = opts.easing ?? "easeInOutCubic";
                const gutter = opts.gutter ?? grid.worldHeight(30);
                const margin = opts.margin ?? grid.worldHeight(0);
                const plotHeightPad = opts.plotHeightPad ?? grid.worldHeight(100);
                const onUpdate = typeof opts.onUpdate === "function" ? opts.onUpdate : null;

                const Easings = {
                    linear: t => t,
                    easeOutQuad: t => 1 - (1 - t) * (1 - t),
                    easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
                };
                const ease = Easings[easingName] ?? Easings.easeInOutCubic;
                const lerp = (a, b, t) => a + (b - a) * t;

                const plateBoxes = platesRaw
                    .filter(p => p && p.getWidth && p.getHeight && p.grid)
                    .map(p => {
                        const w = p.getWidth();
                        const h = p.getHeight();
                        const top = p.grid.yi + h;
                        return {
                            kind: "plate",
                            name: p.name ?? "",
                            ref: p,
                            w, h,
                            hEff: h,
                            cur: { xw: p.grid.xi, yw: top }
                        };
                    });

                const plotBoxes = plotsRaw
                    .filter(p => p && Number.isFinite(p.w) && Number.isFinite(p.h))
                    .map(p => {
                        const w = p.w;
                        const h = p.h;
                        const top = p.y;
                        return {
                            kind: "plot",
                            name: p.name ?? "",
                            ref: p,
                            w, h,
                            hEff: h + plotHeightPad,
                            cur: { xw: p.x, yw: top }
                        };
                    });

                const boxes = [...plateBoxes, ...plotBoxes];
                if (!boxes.length) return;

                let item = boxes.find(b => b.name === name);
                if (!item) item = boxes.find(b => (b.name || "").toLowerCase() === String(name || "").toLowerCase());
                if (!item) return;

                const obstacles = boxes.filter(b => b !== item);

                const xmin = grid.getxmin() + margin;
                const xmax = grid.getxmax() - margin;
                const ymin = grid.getymin() + margin;
                const ymax = grid.getymax() - margin;

                const rectAt = (b, xw, yw, useEff = false) => {
                    const hUse = useEff ? b.hEff : b.h;
                    const inf = gutter * 0.5;
                    return {
                        l: xw - inf,
                        r: xw + b.w + inf,
                        t: yw + inf,
                        b: (yw - hUse) - inf
                    };
                };
                const overlap = (a, c) => !(a.l >= c.r || a.r <= c.l || a.b >= c.t || a.t <= c.b);

                const obstacleRects = obstacles.map(o => rectAt(o, o.cur.xw, o.cur.yw, true));

                const sel = item;
                const stepX = Math.max(gutter, sel.w * 0.5);
                const stepY = Math.max(gutter, sel.hEff * 0.5);

                const xMinFit = xmin;
                const xMaxFit = Math.max(xmin, xmax - sel.w);
                const yMinFit = ymin + sel.hEff;
                const yMaxFit = Math.max(yMinFit, ymax);

                const candidates = [];
                for (let y = yMinFit; y <= yMaxFit; y += stepY) {
                    for (let x = xMinFit; x <= xMaxFit; x += stepX) {
                        candidates.push({ xw: x, yw: y });
                    }
                }

                const curCx = sel.cur.xw + sel.w * 0.5;
                const curCy = sel.cur.yw - sel.h * 0.5;
                candidates.sort((a, b) => {
                    const acx = a.xw + sel.w * 0.5, acy = a.yw - sel.h * 0.5;
                    const bcx = b.xw + sel.w * 0.5, bcy = b.yw - sel.h * 0.5;
                    const da = (acx - curCx) ** 2 + (acy - curCy) ** 2;
                    const db = (bcx - curCx) ** 2 + (bcy - curCy) ** 2;
                    return da - db;
                });

                let target = null;
                for (const c of candidates) {
                    const rSel = rectAt(sel, c.xw, c.yw, true);
                    let ok = true;
                    for (const ro of obstacleRects) {
                        if (overlap(rSel, ro)) { ok = false; break; }
                    }
                    if (ok) { target = c; break; }
                }

                if (!target) {

                    return;
                }

                const t0 = performance.now();
                const start = { xw: sel.cur.xw, yw: sel.cur.yw };
                const end = { xw: target.xw, yw: target.yw };

                const writePose = (box, pose) => {
                    if (box.kind === "plot") {
                        box.ref.x = pose.xw;
                        box.ref.y = pose.yw;
                    } else {
                        box.ref.grid.xi = pose.xw;
                        box.ref.grid.yi = pose.yw - box.h;
                    }
                };

                if (duration === 0) {
                    writePose(sel, end);
                    onUpdate && onUpdate();
                    return;
                }

                const step = (now) => {
                    const t = Math.min(1, (now - t0) / Math.max(1, duration));
                    const e = ease(t);
                    writePose(sel, { xw: lerp(start.xw, end.xw, e), yw: lerp(start.yw, end.yw, e) });
                    onUpdate && onUpdate();
                    if (t < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            }

            movePlateVacant(_plot, opts = {}) {
                const name = _plot.name;
                const platesRaw = this.root;
                const plotsRaw = this.m_plots;
                const grid = this.grid;
                grid.rescale();

                const duration = Math.max(0, opts.duration ?? 600);
                const easingName = opts.easing ?? "easeInOutCubic";
                const gutter = opts.gutter ?? grid.worldHeight(30);
                const margin = opts.margin ?? grid.worldHeight(0);
                const plotHeightPad = opts.plotHeightPad ?? grid.worldHeight(100);
                const onUpdate = typeof opts.onUpdate === "function" ? opts.onUpdate : null;

                const Easings = {
                    linear: t => t,
                    easeOutQuad: t => 1 - (1 - t) * (1 - t),
                    easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
                };
                const ease = Easings[easingName] ?? Easings.easeInOutCubic;
                const lerp = (a, b, t) => a + (b - a) * t;

                const plateBoxes = platesRaw
                    .filter(p => p && p.getWidth && p.getHeight && p.grid)
                    .map(p => {
                        const w = p.getWidth();
                        const h = p.getHeight();
                        const top = p.grid.yi + h;
                        return {
                            kind: "plate",
                            name: p.name ?? "",
                            ref: p,
                            w, h,
                            hEff: h,
                            cur: { xw: p.grid.xi, yw: top }
                        };
                    });

                const plotBoxes = plotsRaw
                    .filter(p => p && Number.isFinite(p.w) && Number.isFinite(p.h))
                    .map(p => {
                        const w = p.w;
                        const h = p.h;
                        const top = p.y;
                        return {
                            kind: "plot",
                            name: p.name ?? "",
                            ref: p,
                            w, h,
                            hEff: h + plotHeightPad,
                            cur: { xw: p.x, yw: top }
                        };
                    });

                const boxes = [...plateBoxes, ...plotBoxes];
                if (!boxes.length) return;

                let item = boxes.find(b => b.name === name);
                if (!item) item = boxes.find(b => (b.name || "").toLowerCase() === String(name || "").toLowerCase());
                if (!item) return;

                const obstacles = boxes.filter(b => b !== item);

                const xmin = grid.getxmin() + margin;
                const xmax = grid.getxmax() - margin;
                const ymin = grid.getymin() + margin;
                const ymax = grid.getymax() - margin;

                const rectAt = (b, xw, yw, useEff = false) => {
                    const hUse = useEff ? b.hEff : b.h;
                    const inf = gutter * 0.5;
                    return {
                        l: xw - inf,
                        r: xw + b.w + inf,
                        t: yw + inf,
                        b: (yw - hUse) - inf
                    };
                };
                const overlap = (a, c) => !(a.l >= c.r || a.r <= c.l || a.b >= c.t || a.t <= c.b);

                const obstacleRects = obstacles.map(o => rectAt(o, o.cur.xw, o.cur.yw, true));

                const sel = item;
                const stepX = Math.max(gutter, sel.w * 0.5);
                const stepY = Math.max(gutter, sel.hEff * 0.5);

                const xMinFit = xmin;
                const xMaxFit = Math.max(xmin, xmax - sel.w);
                const yMinFit = ymin + sel.hEff;
                const yMaxFit = Math.max(yMinFit, ymax);

                const candidates = [];
                for (let y = yMinFit; y <= yMaxFit; y += stepY) {
                    for (let x = xMinFit; x <= xMaxFit; x += stepX) {
                        candidates.push({ xw: x, yw: y });
                    }
                }

                const curCx = sel.cur.xw + sel.w * 0.5;
                const curCy = sel.cur.yw - sel.h * 0.5;
                candidates.sort((a, b) => {
                    const acx = a.xw + sel.w * 0.5, acy = a.yw - sel.h * 0.5;
                    const bcx = b.xw + sel.w * 0.5, bcy = b.yw - sel.h * 0.5;
                    const da = (acx - curCx) ** 2 + (acy - curCy) ** 2;
                    const db = (bcx - curCx) ** 2 + (bcy - curCy) ** 2;
                    return da - db;
                });

                let target = null;
                for (const c of candidates) {
                    const rSel = rectAt(sel, c.xw, c.yw, true);
                    let ok = true;
                    for (const ro of obstacleRects) {
                        if (overlap(rSel, ro)) { ok = false; break; }
                    }
                    if (ok) { target = c; break; }
                }

                if (!target) {

                    return;
                }

                const t0 = performance.now();
                const start = { xw: sel.cur.xw, yw: sel.cur.yw };
                const end = { xw: target.xw, yw: target.yw };

                const writePose = (box, pose) => {
                    if (box.kind === "plot") {
                        box.ref.x = pose.xw;
                        box.ref.y = pose.yw;
                    } else {
                        box.ref.grid.xi = pose.xw;
                        box.ref.grid.yi = pose.yw - box.h;
                    }
                };

                if (duration === 0) {
                    writePose(sel, end);
                    onUpdate && onUpdate();
                    return;
                }

                const step = (now) => {
                    const t = Math.min(1, (now - t0) / Math.max(1, duration));
                    const e = ease(t);
                    writePose(sel, { xw: lerp(start.xw, end.xw, e), yw: lerp(start.yw, end.yw, e) });
                    onUpdate && onUpdate();
                    if (t < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            }

            async centerPlateAndOrbitOthers(targetName, opts = {}) {
                const spacing = opts.spacing ?? 2;
                const layoutPadding = opts.layoutPadding ?? 8;
                const durationMs = opts.durationMs ?? 8_000;
                const iterationsPerFrame = opts.iterationsPerFrame ?? 6;
                const epsilon = opts.epsilon ?? 0.01;
                const renderEachFrame = opts.renderEachFrame ?? true;
                const alignStrengthCenter = opts.alignStrengthCenter ?? 0.35;
                const alignStrengthRing = opts.alignStrengthRing ?? 0.18;
                const jitterStep = opts.jitterStep ?? 1.2;
                const keepStrictCenter = opts.keepStrictCenter ?? true;

                const plates = this.root?.filter(p => p?.grid) ?? [];
                if (!plates.length) { this.generateTables?.(); return; }

                const screenCenter = () => {
                    const xwc = this.grid.Xwc(0);
                    const ywc = this.grid.Ywc(0);
                    const W = this.grid.worldWidth(this.grid.width);
                    const H = this.grid.worldHeight(this.grid.height);
                    return { cx: xwc + W * 0.5, cy: ywc - H * 0.5 };
                };

                const cx = p => p.grid.xi + p.grid.width * 0.5;
                const cy = p => p.grid.yi + p.grid.height * 0.5;

                const findTarget = (name) => plates.find(p => (p?.name ?? p?.id) === name) || null;

                const relaxOnceXY = () => {
                    let totalPen = 0;
                    for (let i = 0; i < plates.length; i++) {
                        for (let j = i + 1; j < plates.length; j++) {
                            const a = plates[i], b = plates[j];
                            const halfW = (a.grid.width + b.grid.width) * 0.5 + spacing;
                            const halfH = (a.grid.height + b.grid.height) * 0.5 + spacing;

                            const dx = cx(a) - cx(b);
                            const dy = cy(a) - cy(b);
                            const px = halfW - Math.abs(dx);
                            const py = halfH - Math.abs(dy);

                            if (px > 0 && py > 0) {
                                const sx = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
                                const sy = dy === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dy);
                                const pushX = (px * 0.5) * sx;
                                const pushY = (py * 0.5) * sy;
                                a.grid.xi += pushX; a.grid.yi += pushY;
                                b.grid.xi -= pushX; b.grid.yi -= pushY;
                                totalPen += (px + py);
                            }
                        }
                    }
                    return totalPen;
                };

                const randUnit = () => {
                    const th = Math.random() * Math.PI * 2;
                    return { x: Math.cos(th), y: Math.sin(th) };
                };

                const target = findTarget(targetName);
                if (!target) { this.generateTables?.(); return; }
                const others = plates.filter(p => p !== target);

                const { cx: scx, cy: scy } = screenCenter();
                const centerSpotlight = () => {
                    target.grid.xi = scx - target.grid.width * 0.5;
                    target.grid.yi = scy - target.grid.height * 0.5;
                };
                centerSpotlight();

                const totalArc = others.reduce((acc, p) => acc + (p.grid.width + spacing + layoutPadding), 0);
                let R = (totalArc / (2 * Math.PI));

                const spotRadius = 0.5 * Math.hypot(target.grid.width, target.grid.height);
                const maxOtherHalfDiag = Math.max(1, ...others.map(p => 0.5 * Math.hypot(p.grid.width, p.grid.height)));
                R = Math.max(R, spotRadius + maxOtherHalfDiag + spacing * 2);

                const items = others
                    .map(p => ({ p, key: p?.name ?? "" }))
                    .sort((a, b) => a.key.localeCompare(b.key));

                const baseAngle = -Math.PI / 2;
                const dTheta = (others.length > 0) ? (2 * Math.PI / others.length) : 0;

                const targets = new Map();
                items.forEach((it, i) => {
                    const th = baseAngle + i * dTheta;
                    const tx = scx + R * Math.cos(th);
                    const ty = scy + R * Math.sin(th);
                    targets.set(it.p, { tx, ty });
                });

                const drifts = plates.map(() => randUnit());

                const now = (typeof performance !== "undefined" && performance.now) ? () => performance.now() : () => Date.now();
                const rAF = (cb) =>
                    (typeof requestAnimationFrame !== "undefined")
                        ? requestAnimationFrame(cb)
                        : setTimeout(() => cb(now()), 16);

                const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
                const start = now();

                for (const p of plates) {
                    p.grid.xi += (Math.random() - 0.5) * 1e-6;
                    p.grid.yi += (Math.random() - 0.5) * 1e-6;
                }

                await new Promise((resolve) => {
                    const tick = (ts) => {
                        const t = Math.max(0, Math.min(1, (ts - start) / durationMs));
                        const jitterScale = 1 - easeOutCubic(t);

                        const dxSpot = scx - cx(target);
                        const dySpot = scy - cy(target);
                        target.grid.xi += dxSpot * alignStrengthCenter;
                        target.grid.yi += dySpot * alignStrengthCenter;

                        for (let i = 0; i < others.length; i++) {
                            const p = others[i];
                            const T = targets.get(p);
                            if (!T) continue;

                            const dx = T.tx - cx(p);
                            const dy = T.ty - cy(p);
                            p.grid.xi += dx * alignStrengthRing;
                            p.grid.yi += dy * alignStrengthRing;

                            if (Math.random() < 0.25) drifts[i] = randUnit();
                            p.grid.xi += drifts[i].x * jitterStep * jitterScale;
                            p.grid.yi += drifts[i].y * jitterStep * jitterScale;
                        }

                        let lastPen = 0;
                        for (let k = 0; k < iterationsPerFrame; k++) {
                            lastPen = relaxOnceXY();
                            if (lastPen < epsilon) break;
                        }

                        if (keepStrictCenter) centerSpotlight();

                        if (renderEachFrame) this.generateTables?.();

                        if ((lastPen < epsilon && jitterScale < 0.05) || t >= 1) return resolve();
                        rAF(tick);
                    };

                    rAF(tick);
                });

                for (let i = 0; i < 16; i++) {
                    const pen = relaxOnceXY();
                    if (pen < epsilon) break;
                }
                if (keepStrictCenter) centerSpotlight();
                this.generateTables?.();
            }

            async separatePlatesOverTime(opts = {}) {
                const spacing = opts.spacing ?? 24;
                const durationMs = opts.durationMs ?? 10_000;
                const iterationsPerFrame = opts.iterationsPerFrame ?? 6;
                const epsilon = opts.epsilon ?? 0.01;
                const renderEachFrame = opts.renderEachFrame ?? true;
                const keepStrictCenter = opts.keepStrictCenter ?? true;

                const explodeFrac = Math.max(0.05, Math.min(0.6, opts.explodeFrac ?? 0.25));
                const explodeStep = opts.explodeStep ?? 4;
                const wanderStep = opts.wanderStep ?? 2.2;
                const jitterReseedRate = opts.jitterReseedRate ?? 0.2;

                const plates = this.root?.filter(p => p?.grid) ?? [];
                if (plates.length <= 1) {
                    if (renderEachFrame) this.generateTables?.();
                    return;
                }

                const screenCenter = () => {
                    const xwc = this.grid.Xwc(0);
                    const ywc = this.grid.Ywc(0);
                    const W = this.grid.worldWidth(this.grid.width);
                    const H = this.grid.worldHeight(this.grid.height);
                    return { cx: xwc + W * 0.5, cy: ywc - H * 0.5 };
                };

                const cx = p => p.grid.xi + p.grid.width * 0.5;
                const cy = p => p.grid.yi + p.grid.height * 0.5;

                const groupBounds = () => {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const p of plates) {
                        minX = Math.min(minX, p.grid.xi);
                        minY = Math.min(minY, p.grid.yi);
                        maxX = Math.max(maxX, p.grid.xi + p.grid.width);
                        maxY = Math.max(maxY, p.grid.yi + p.grid.height);
                    }
                    return { minX, minY, maxX, maxY, cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5 };
                };

                const centerGroupExact = () => {
                    const { cx: scx, cy: scy } = screenCenter();
                    const { cx: gcx, cy: gcy } = groupBounds();
                    const dx = scx - gcx, dy = scy - gcy;
                    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return;
                    for (const p of plates) { p.grid.xi += dx; p.grid.yi += dy; }
                };

                const relaxOnceXY = () => {
                    let totalPen = 0;
                    for (let i = 0; i < plates.length; i++) {
                        for (let j = i + 1; j < plates.length; j++) {
                            const a = plates[i], b = plates[j];
                            const halfW = (a.grid.width + b.grid.width) * 0.5 + spacing;
                            const halfH = (a.grid.height + b.grid.height) * 0.5 + spacing;

                            const dx = cx(a) - cx(b);
                            const dy = cy(a) - cy(b);
                            const px = halfW - Math.abs(dx);
                            const py = halfH - Math.abs(dy);

                            if (px > 0 && py > 0) {
                                const sx = dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx);
                                const sy = dy === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dy);
                                const pushX = (px * 0.5) * sx;
                                const pushY = (py * 0.5) * sy;
                                a.grid.xi += pushX; a.grid.yi += pushY;
                                b.grid.xi -= pushX; b.grid.yi -= pushY;
                                totalPen += (px + py);
                            }
                        }
                    }
                    return totalPen;
                };

                const randUnit = () => {

                    const th = Math.random() * Math.PI * 2;
                    return { x: Math.cos(th), y: Math.sin(th) };
                };

                const drifts = plates.map(() => randUnit());

                for (const p of plates) {
                    p.grid.xi += (Math.random() - 0.5) * 1e-6;
                    p.grid.yi += (Math.random() - 0.5) * 1e-6;
                }

                if (this._separationCancel?.active) this._separationCancel.active = false;
                const token = { active: true };
                this._separationCancel = token;

                const now = (typeof performance !== "undefined" && performance.now)
                    ? () => performance.now()
                    : () => Date.now();

                const rAF = (cb) =>
                    (typeof requestAnimationFrame !== "undefined")
                        ? requestAnimationFrame(cb)
                        : setTimeout(() => cb(now()), 16);

                const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

                centerGroupExact();

                const start = now();

                await new Promise((resolve) => {
                    const tick = (ts) => {
                        if (!token.active) return resolve();

                        const t = Math.max(0, Math.min(1, (ts - start) / durationMs));
                        const inExplode = t < explodeFrac;
                        const explodeScale = inExplode ? (1 - t / explodeFrac) : 0;

                        const jitterScale = 1 - easeOutCubic(t);

                        for (let i = 0; i < plates.length; i++) {
                            const p = plates[i];

                            if (Math.random() < jitterReseedRate) drifts[i] = randUnit();

                            const dxExplode = drifts[i].x * explodeStep * explodeScale;
                            const dyExplode = drifts[i].y * explodeStep * explodeScale;

                            const jx = (Math.random() * 2 - 1) * wanderStep * jitterScale;
                            const jy = (Math.random() * 2 - 1) * wanderStep * jitterScale;

                            p.grid.xi += dxExplode + jx;
                            p.grid.yi += dyExplode + jy;
                        }

                        let lastPen = 0;
                        for (let k = 0; k < iterationsPerFrame; k++) {
                            lastPen = relaxOnceXY();
                            if (lastPen < epsilon) break;
                        }

                        if (keepStrictCenter) centerGroupExact();
                        if (renderEachFrame) this.generateTables?.();

                        if ((lastPen < epsilon && !inExplode && jitterScale < 0.05) || t >= 1) return resolve();
                        rAF(tick);
                    };

                    rAF(tick);
                });

                for (let i = 0; i < 16; i++) {
                    const pen = relaxOnceXY();
                    if (pen < epsilon) break;
                }
                if (keepStrictCenter) centerGroupExact();
                this.generateTables?.();
            }

            cancelPlateSeparation() {
                if (this._separationCancel) this._separationCancel.active = false;
            }

            addNextAvailableX(pl) {
                if (pl.rescaleDimensions) {
                    pl.rescaleDimensions(this);
                }

                const alreadyExists = this.root.some(item => item.name === pl.name);



                if (alreadyExists) {
                    this.setMessage(" You already have a table with that name..");
                    setTimeout(() => {
                        this.setMessage(" You can change the name of the table and then add this.");
                    }, 3000);
                    return;
                }

                let added = false;

                if (pl.wells) {
                    this.root.push(pl);
                    added = true;
                } else if (pl && pl.typeof === 'plot') {
                    this.m_plots.push(pl);
                    added = true;
                }

                this.generateTables();

                const placed =
                    this.root.find(t => t.name === pl.name) ||
                    this.m_plots.find(t => t.name === pl.name) ||
                    pl;
            }

            async panToNextSpot(width, height) {
                return new Promise((resolve) => {
                    const nextX = this.findNextAvailableXY();
                    if (!Number.isFinite(nextX) || nextX <= 0) return resolve('complete');

                    const viewW = this.grid.xmax - this.grid.xmin;
                    const viewCenter = this.grid.xmin + viewW / 2;

                    const rectCenter = nextX + (width || 0) / 2;

                    const direction = rectCenter > viewCenter ? 1 : -1;
                    const overshootRatio = 0.10;
                    const targetCenter = rectCenter + direction * viewW * overshootRatio;

                    const targetXmin = targetCenter - viewW / 2;
                    const targetXmax = targetCenter + viewW / 2;

                    let currentXmin = this.grid.xmin;
                    let currentXmax = this.grid.xmax;

                    const stepRatio = 0.10;
                    const maxStep = viewW * stepRatio;
                    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

                    const advancing = async () => {
                        while (
                            (direction > 0 && currentXmin < targetXmin) ||
                            (direction < 0 && currentXmin > targetXmin)
                        ) {
                            const remaining = Math.abs(targetXmin - currentXmin);
                            const delta = Math.min(remaining, maxStep) * direction;

                            currentXmin += delta;
                            currentXmax += delta;

                            this.grid.xmin = currentXmin;
                            this.grid.xmax = currentXmax;
                            this.grid.rescale();

                            await sleep(100);
                        }

                        this.grid.xmin = targetXmin;
                        this.grid.xmax = targetXmax;
                        this.grid.rescale();

                        resolve('complete');
                    };

                    advancing();
                });
            }

            async panToNextSpotY(height) {
                return new Promise((resolve) => {
                    const nextY = this.findNextAvailableY();
                    if (!nextY || nextY <= 0) {
                        return resolve('complete');
                    }

                    const diffy = this.grid.ymax - this.grid.ymin;

                    let targetYmin = nextY - (diffy - height) / 2;

                    const direction = targetYmin > this.grid.ymin ? 1 : -1;
                    const overshoot = diffy * 0.30;

                    targetYmin += direction * overshoot;

                    let targetYmax = targetYmin + diffy;

                    let currentYmin = this.grid.ymin;
                    let currentYmax = this.grid.ymax;

                    const stepRatio = 0.10;
                    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

                    const remaining = Math.abs(targetYmin - currentYmin);
                    const step = remaining * stepRatio;

                    const stepLoop = async () => {
                        while (
                            (direction > 0 && currentYmin < targetYmin) ||
                            (direction < 0 && currentYmin > targetYmin)
                        ) {
                            currentYmin += step * direction;
                            currentYmax = currentYmin + diffy;

                            if (
                                (direction > 0 && currentYmin > targetYmin) ||
                                (direction < 0 && currentYmin < targetYmin)
                            ) {
                                currentYmin = targetYmin;
                                currentYmax = currentYmin + diffy;
                            }

                            this.grid.ymin = currentYmin;
                            this.grid.ymax = currentYmax;
                            this.grid.rescale();
                            await sleep(100);
                        }

                        resolve('complete');
                    };

                    stepLoop();
                });
            }

            findNextAvailableXY(padding = 2) {
                let maxRightX = -Infinity;
                padding = 100;
                const allObjects = [
                    ...this.root.slice().reverse(),
                    this.selectedPlate,
                    ...this.glyphs
                ].filter(obj => obj && obj.grid);

                for (const obj of allObjects) {
                    const grid = obj.grid;
                    if (!grid) continue;

                    grid.rescale();

                    const rightX = this.grid.X(obj.grid.xi) + this.grid.screenWidth(obj.grid.width);
                    if (rightX > maxRightX) {
                        maxRightX = rightX;

                    }
                }

                for (const obj of this.m_plots) {
                    const grid = obj.grid;
                    if (!grid) continue;
                    const rightX = (obj.grid.xi + obj.grid.width);
                    if (rightX > maxRightX) {
                        maxRightX = rightX;
                    }
                }

                const newX = this.grid.Xwc(maxRightX + padding);
                return newX;
            }
            findNextAvailableY(padding = 100) {
                let maxBottomY = -Infinity;

                const allObjects = [
                    ...this.root.slice().reverse(),
                    this.selectedPlate,
                    ...this.glyphs
                ].filter(obj => obj && obj.grid);

                for (const obj of allObjects) {
                    const grid = obj.grid;
                    if (!grid) continue;

                    grid.rescale();

                    const bottomY = this.grid.Y(obj.grid.yi + obj.getHeight(this));
                    if (bottomY > maxBottomY) {
                        maxBottomY = bottomY;
                    }
                }

                for (const obj of this.m_plots) {
                    const grid = obj.grid;
                    if (!grid) continue;

                    const bottomY = (grid.yi + grid.height);
                    if (bottomY > maxBottomY) {
                        maxBottomY = bottomY;
                    }
                }

                const newY = this.grid.Ywc(maxBottomY + padding);
                return newY;
            }

            addNextAvailablePlates(plates) {

                if (!Array.isArray(plates) || plates.length === 0)
                    return;

                plates = plates.filter(pl => pl && pl.grid);

                if (plates.length === 0)
                    return;

                const prevLast =
                    this.root.length
                        ? this.root[this.root.length - 1]
                        : null;

                // -------------------------------------------------
                // match scale of previous plate
                // -------------------------------------------------
                if (prevLast && prevLast.grid) {

                    const targetXScale = prevLast.grid.xscale;
                    const targetYScale = prevLast.grid.yscale;

                    for (const pl of plates) {

                        const g = pl.grid;

                        const worldW = g.xmax - g.xmin;
                        const worldH = g.ymax - g.ymin;

                        const xinset = g.xinset ?? 0;
                        const yinset = g.yinset ?? 0;

                        g.width =
                            targetXScale * worldW +
                            2 * xinset;

                        g.height =
                            targetYScale * worldH +
                            2 * yinset;

                        g.xscale = targetXScale;
                        g.yscale = targetYScale;

                        if (typeof g.rescale === "function")
                            g.rescale();

                        if ("xshift" in g)
                            g.xshift =
                                xinset - g.xmin * g.xscale;

                        if ("yshift" in g)
                            g.yshift =
                                yinset - g.ymin * g.yscale;
                    }
                }

                const gutterX = this.grid.worldWidth(20);

                // -------------------------------------------------
                // normalize bounds
                // -------------------------------------------------
                const makeBounds = ({
                    left,
                    right,
                    top,
                    bottom,
                    source
                }) => {

                    return {
                        xi: Math.min(left, right),
                        yi: Math.min(top, bottom),
                        width: Math.abs(right - left),
                        height: Math.abs(bottom - top),
                        source
                    };
                };

                // -------------------------------------------------
                // overlap test
                // -------------------------------------------------
                const overlaps = (a, b) => !(
                    a.xi + a.width <= b.xi ||
                    b.xi + b.width <= a.xi ||
                    a.yi + a.height <= b.yi ||
                    b.yi + b.height <= a.yi
                );

                // -------------------------------------------------
                // plate bounds
                // -------------------------------------------------
                const getPlateBounds = plate => {

                    const g = plate?.grid;

                    if (!g)
                        return null;

                    const left = g.xi;
                    const right = g.xi + g.width;

                    const top = g.yi;
                    const bottom = g.yi + g.height;

                    if (
                        ![
                            left,
                            right,
                            top,
                            bottom
                        ].every(Number.isFinite)
                    )
                        return null;

                    return makeBounds({
                        left,
                        right,
                        top,
                        bottom,
                        source: plate
                    });
                };

                // -------------------------------------------------
                // plot bounds
                // plot y-axis is inverted:
                // y = TOP edge
                // y - h = BOTTOM edge
                // -------------------------------------------------
                const getPlotBounds = plot => {

                    if (!plot)
                        return null;

                    const left = plot.x;
                    const right = plot.x + plot.w;

                    const top = plot.y;
                    const bottom = plot.y - plot.h;

                    if (
                        ![
                            left,
                            right,
                            top,
                            bottom
                        ].every(Number.isFinite)
                    )
                        return null;

                    return makeBounds({
                        left,
                        right,
                        top,
                        bottom,
                        source: plot
                    });
                };

                // -------------------------------------------------
                // collect blockers
                // -------------------------------------------------
                const existingObjects = [

                    ...(this.root || [])
                        .map(getPlateBounds)
                        .filter(Boolean),

                    ...(this.m_plots || [])
                        .map(getPlotBounds)
                        .filter(Boolean)
                ];

                // -------------------------------------------------
                // initial position
                // -------------------------------------------------
                let startX;
                let startY;

                if (prevLast && prevLast.grid) {

                    startX =
                        prevLast.grid.xi +
                        prevLast.grid.width +
                        gutterX;

                    startY =
                        prevLast.grid.yi;

                } else {

                    const viewLeft =
                        this.grid.Xwc(0);

                    const viewTop =
                        this.grid.Ywc(0);

                    const worldWidth =
                        this.grid.worldWidth(
                            this.grid.width
                        );

                    const first = plates[0];

                    startX =
                        viewLeft +
                        (
                            worldWidth -
                            first.grid.width
                        ) / 2;

                    startY = viewTop;
                }

                // -------------------------------------------------
                // place plates
                // -------------------------------------------------
                let cursorX = startX;

                const placedPlates = [];

                for (const pl of plates) {

                    const g = pl.grid;

                    g.xi = cursorX;
                    g.yi = startY;

                    let guard = 0;

                    while (guard++ < 1000) {

                        const plateBounds = getPlateBounds(pl);

                        const blockers = [
                            ...existingObjects,
                            ...placedPlates
                        ];

                        const hit =
                            blockers.find(b =>
                                overlaps(plateBounds, b)
                            );

                        if (!hit)
                            break;

                        g.xi =
                            hit.xi +
                            hit.width +
                            gutterX;
                    }

                    placedPlates.push(
                        getPlateBounds(pl)
                    );

                    cursorX =
                        g.xi +
                        g.width +
                        gutterX;
                }

                // -------------------------------------------------
                // finalize
                // -------------------------------------------------
                this.root.push(...plates);

                this.generateTables();

                this.selectedPlate = plates[0];
            }

            newRoot(name, plateType, x, y) {
                let ch;
                if (y == null) {
                    y = 1;
                }
                let plates = []
                for (let r of this.root) {
                    plates = r.getPlates(plates, Math.floor(y));
                }
                if (x == null) {
                    x = plates.length * 2;
                }
                ch = new Plate(name, x, y)
                ch.completeNullValues();
                ch.setType(plateType);
                if (this.root && this.root.length > 0) {
                    let lastPlate = this.getLastTouchedPlate()
                    this.root.push(ch)
                    this.setPlatePositionNextTo(ch.name, lastPlate.name)

                } else {

                    ch.grid.width = 1;
                    ch.grid.height = 1;
                    ch.grid.yi = 1;

                    this.addNextAvailableX(ch)
                }
                setTimeout(() => {
                    this.zoomintoplate(ch)
                }, 1000)

            }
            newSimplePlate(name, x, y, nextToPlate, startY) {
                x = parseInt(x)
                y = parseInt(y)
                let ch;
                if (y == null) {
                    y = 1;
                }
                let nextAvailableX = 0;
                for (const table of this.root) {
                    const tableRightBoundary = table.grid.xi + table.grid.width;
                    nextAvailableX = Math.max(nextAvailableX, tableRightBoundary);
                }
                ch = new Plate(name, x, y)

                this.addNextAvailableX(ch)

                ch.completeNullValues();
                ch.setType('data');
                ch.grid.width = 1;
                ch.grid.height = 1;

                if (nextToPlate) {

                    let wd = x / (nextToPlate.grid.xmax - nextToPlate.grid.xmin)
                    let hd = y / ((nextToPlate.grid.ymax - nextToPlate.grid.ymin))
                    if (hd === 0) {
                        hd = 1
                    }
                    ch.grid.width = nextToPlate.grid.width * wd;
                    ch.grid.height = nextToPlate.grid.height * hd;
                    ch.grid.rescale();
                    this.setPlatePositionNextTo(name, nextToPlate.name, startY)
                } else {
                    this.addNextAvailableX(ch)

                }

                return ch;
            }

            setPlatePositionNextTo(table, nextToTable, _y) {

                let ch = this.getTableByName(table);
                let chn = this.getTableByName(nextToTable);

                let nextToPlate = chn;

                ch.grid.xi = chn.grid.xi + chn.grid.width + this.grid.worldWidth(40);

                const x = ch.grid.xmax;
                const y = ch.grid.ymax;

                ch.grid.width = 1;
                ch.grid.height = 1;

                let wd = x / (nextToPlate.grid.xmax - nextToPlate.grid.xmin)
                let hd = y / ((nextToPlate.grid.ymax - nextToPlate.grid.ymin))
                if (hd === 0) {
                    hd = 1
                }
                ch.grid.width = nextToPlate.grid.width * wd;
                ch.grid.height = nextToPlate.grid.height * hd;

                if (_y)
                    ch.grid.yi = _y;
                else
                    ch.grid.yi = chn.grid.yi + chn.grid.height - ch.grid.height;

                ch.grid.rescale();

            }

            setPlate(ch, x, y) {
                if (y == null) {
                    y = 1;
                }
                this.resetState()
                let plates = []
                for (let r of this.root) {
                    plates = r.getPlates(plates, Math.floor(y));
                }
                if (x == null) {
                    x = plates.length * 2;
                }

                this.grid.rescale();

                ch.grid.xi = x;
                ch.grid.yi = y;
                this.root.push(ch)

                return ch;
            }

            appendPlate(ch) {
                this.resetState()
                let isObjectNotVisible = (xscreen_min_, xscreen_max, yscreen_min_, yscreen_max) => {
                    const canvasWidth = this.grid.xi;
                    const canvasHeight = this.grid.height;
                    const isOutsideHorizontal = (xscreen_max < 0 && xscreen_min_ < 0) || (xscreen_min_ > canvasWidth && xscreen_max > canvasWidth);
                    const isOutsideVertical = (yscreen_max < 0 && yscreen_min_ < 0) || (yscreen_min_ > canvasHeight && yscreen_max > canvasHeight);
                    return isOutsideHorizontal || isOutsideVertical;
                }

                let ob = []
                let mxax = 0;
                let myax = 0;
                let nextToPlate = null;
                for (let r of this.root) {
                    let ysc = this.grid.Y(r.grid.yi + r.getHeight(this));
                    let xsc = this.grid.X(r.grid.xi);
                    let yscreen_height = this.grid.screenHeight(r.getHeight(this));
                    let screen_width = this.grid.screenWidth(r.getWidth(this));
                    if (isObjectNotVisible(xsc, xsc + screen_width, ysc, ysc + yscreen_height)) {
                        if (mxax < xsc + screen_width) {
                            mxax = this.grid.Xwc(xsc) + this.grid.worldWidth(screen_width);
                            myax = r.grid.yi;
                            ob.push(r)
                            nextToPlate = r;
                        }
                    }
                }
                this.root.push(ch)
                if (nextToPlate) {
                    let nextAvailableX = 0;
                    for (const table of this.root) {
                        const tableRightBoundary = table.grid.xi + table.grid.width;
                        nextAvailableX = Math.max(nextAvailableX, tableRightBoundary);
                    }
                    const x__ = ch.grid.xmax;
                    const y__ = ch.grid.ymax;
                    ch.grid.xi = nextAvailableX + 1;
                    ch.grid.width = 1;
                    ch.grid.height = 1;
                    let wd = x__ / (nextToPlate.grid.xmax - nextToPlate.grid.xmin)
                    let hd = y__ / ((nextToPlate.grid.ymax - nextToPlate.grid.ymin))
                    if (hd === 0) {
                        hd = 1
                    }
                    ch.grid.width = nextToPlate.grid.width * wd;
                    ch.grid.height = nextToPlate.grid.height * hd;
                    ch.grid.rescale();
                    this.setPlatePositionNextTo(ch.name, nextToPlate.name, nextToPlate.grid.yi + nextToPlate.grid.height - ch.grid.height)
                } else {

                    if (!myax) {
                        myax = 1;
                    }
                    if (!mxax) {
                        mxax = 1;
                    }
                    ch.grid.height = 1;
                    this.grid.rescale();
                    ch.grid.xi = mxax + this.grid.worldWidth(30);
                    ch.grid.yi = myax;

                    const cols = 2;
                    const ml = this.generateTableMenu();
                    this.__tables_menu = new Menu(ml,
                        this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200),
                        this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)

                    return ch;
                }
            }

            generateTableMenu() {
                const ml = this.generateTables();
                const cols = 2;
                this.__tables_menu = new Menu(ml,
                    this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200),
                    this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
            }

            getTablesAndPlots() {
                let p = []
                for (let r of this.root) {
                    p.push(r)
                }
                for (let r of this.m_plots) {
                    p.push(r)
                }
                return p;
            }

            clearPlateListeners() {
                selectedListener = null;
            }
            setSelectedListener(__selectedListener) {
                selectedListener = __selectedListener;
            }

            generateTables() {

                let p = []
                let keys = Object.keys(this.bookmarks);
                for (let key of keys) {
                    p.push({
                        label: `${key}`,
                        click: (xwc, ywc) => {
                            this.setMessage(key)
                            this.goToBookmark(this.bookmarks[key])

                        }
                    })
                }
                for (let r of this.root) {
                    if (!r.hidden) {
                        p.push({
                            label: `${r.name}`,
                            click: (xwc, ywc) => {

                                r.selectIt();

                                this.zoomintoplate(r);
                                this.selectPlate(r)
                            }
                        })
                    }
                }
                for (let r of this.m_plots) {
                    p.push({
                        label: `${r.name} (plot)`,
                        click: async (xwc, ywc) => {
                            this.grid.rescale();

                            let padding = -1;

                            let totalWidth = r.w;
                            let xi = r.x;
                            await this.zoomto(xi - totalWidth / 2, r.y - (r.h + r.h / 2), totalWidth + totalWidth, r.h * 2)

                            this.wb(null)
                            this.selectPlate(r)

                        },
                        bg: "navy",
                        fg: "white"
                    })
                }

                return p;
            }

            resetState() {

                this.toPlate = null;
                this.fromPlate = null;
            }

            appendPlot(ch) {
                this.resetState()

                ch.w = 1
                ch.grid.width = 1;
                let maxXi = 0;
                let maxYi = 1;

                for (let r of this.root) {
                    const { xi, yi } = r.getMaxCoordinates();
                    maxXi = Math.max(maxXi, xi);
                    maxYi = Math.min(maxYi, yi);
                }

                this.grid.rescale();
                ch.grid.width = 1;
                ch.grid.height = 1;
                ch.w = 1;
                ch.h = 1;
                ch.highlight();
                ch.w = 1;
                ch.x = maxXi + 2;
                ch.y = maxYi;
                ch.grid.xi = maxXi + 2;
                ch.grid.yi = maxYi + 1;
                this.m_plots.push(ch)
                return ch;
            }

            setPlot(ch) {
                this.grid.rescale();
                ch.highlight();
                this.
                    m_plots.push(ch)
                LJScript.add(this.name, 'new plot ' + ch.name)

            }
            setPlotCenter(ch) {
                this.grid.rescale();
                ch.highlight();
                this.m_plots.push(ch)
                let w = (ch.w);
                let h = (ch.h);

                if (this.__canvas__)
                    ch.x = this.grid.Xwc((this.grid.width - (this.grid.width - this.__canvas__.width)) / 2) - w;
                else
                    ch.x = this.grid.Xwc(this.grid.width / 2) - w;
                ch.y = this.grid.Ywc(this.grid.height / 2) + h / 2;
                LJScript.add(this.name, 'new plot ' + ch.name)
            }
            setPlotCenter(ch) {
                this.grid.rescale();
                ch.highlight();
                this.m_plots.push(ch);

                const w = ch.w;
                const h = ch.h;

                const canvasWidth = this.__canvas__ ? this.__canvas__.width : this.grid.width;
                const canvasHeight = this.__canvas__ ? this.__canvas__.height : this.grid.height;

                ch.x = this.grid.Xwc(canvasWidth / 2) - w / 2;
                ch.y = this.grid.Ywc(canvasHeight / 2) + h / 2;

                LJScript.add(this.name, 'new plot ' + ch.name);
            }

            center(ch) {
                if (ch && ch.grid) {
                    this.grid.rescale();
                    let w = (ch.grid.width);

                    if (this.__canvas__) {

                        const centerScreenWorldCoordinates = this.grid.Xwc(this.__canvas__.width / 2) - (w / 2);

                        const currentPositionX = ch.grid.xi;
                        const currentPositionXf = ch.grid.xi + ch.grid.width;

                        const dx = currentPositionX - centerScreenWorldCoordinates;

                        const newxmin = this.grid.xmin + dx;
                        const newxmax = this.grid.xmax + dx;

                        this.grid.xmin = newxmin;
                        this.grid.xmax = newxmax;
                        this.grid.rescale?.();

                    }
                }
            }
            setPlateTop20PxFromCanvasTop(ch) {





                if (!(ch?.grid && this?.grid && this.__canvas__)) return;

                this.grid.rescale?.();

                const iterations = 60;
                const intervalMs = 10;
                const tolerance = 0.5;
                const maxDurationMs = 5000;

                let i = 0;
                const startTime = Date.now();

                const timer = setInterval(() => {
                    if (!(this.__canvas__ && this.grid && ch.grid)) {
                        clearInterval(timer);
                        return;
                    }

                    if (Date.now() - startTime >= maxDurationMs) {
                        clearInterval(timer);
                        return;
                    }

                    const plateTopY = ch.grid.yi + ch.grid.height;
                    const targetTopY = this.grid.Ywc(20);
                    const remainingDy = plateTopY - targetTopY;

                    if (Math.abs(remainingDy) <= tolerance) {
                        clearInterval(timer);
                        return;
                    }

                    const remainingSteps = Math.max(1, iterations - i);
                    const stepDy = remainingDy / remainingSteps;

                    this.grid.ymin += stepDy;
                    this.grid.ymax += stepDy;
                    this.grid.rescale?.();

                    try {
                        if (this.__canvas__) {
                            this.refresh?.();
                            this.render?.();
                        }
                    } catch (e) {
                        clearInterval(timer);
                        console.error("redraw failed in setPlateTop20PxFromCanvasTop:", e);
                    }

                    i++;

                    if (i >= iterations) {
                        clearInterval(timer);
                    }
                }, intervalMs);
            }
            newDRoot(name, plateType, columns, rows, x, y) {
                let ch;
                if (y == null) {
                    y = 1;
                }
                let plates = []
                for (let r of this.root) {
                    plates = r.getPlates(plates, Math.floor(y));
                }
                if (x == null) {
                    x = plates.length * 2;
                }
                ch = new Plate(name, columns, rows)
                ch.setType(plateType);
                ch.grid.width = 1;
                ch.grid.height = 1;
                ch.grid.xi = x;
                ch.grid.yi = y;
                this.root.push(ch)
                this.resetGrid();
                this.grid.rescale();
                this.alignPlates();

                return ch;
            }

            setAspectRatio(va) {
                this.grid.setAspectRatioIteratively(va, 9)
            }
            decreaseAspectratio() {
                this.grid.decreaseAspectratio(10, 10)
            }
            pinchY(v) {
                this.grid.pinchY(10, v)

            }
            pinchX(v) {
                this.grid.pinchX(10, v)

            }

            async zoomtolastplate() {
                this.zoomintoplate(this.root[this.root.length - 1])
            }

            addNextAvailablePlates(plates) {
                if (!Array.isArray(plates) || plates.length === 0) return;

                plates = plates.filter(pl => pl && pl.grid);
                if (plates.length === 0) return;

                const prevLast = this.root.length ? this.root[this.root.length - 1] : null;

                if (prevLast && prevLast.grid) {
                    const targetXScale = prevLast.grid.xscale;
                    const targetYScale = prevLast.grid.yscale;

                    for (const pl of plates) {
                        const g = pl.grid;

                        const worldW = (g.xmax - g.xmin);
                        const worldH = (g.ymax - g.ymin);

                        const xinset = g.xinset ?? 0;
                        const yinset = g.yinset ?? 0;

                        g.width = targetXScale * worldW + 2 * xinset;
                        g.height = targetYScale * worldH + 2 * yinset;

                        g.xscale = targetXScale;
                        g.yscale = targetYScale;

                        if (typeof g.rescale === "function") g.rescale();

                        if ("xshift" in g) g.xshift = xinset - g.xmin * g.xscale;
                        if ("yshift" in g) g.yshift = yinset - g.ymin * g.yscale;
                    }
                }

                const gutterX = this.grid.worldWidth(20);

                let startX;
                let topY;

                if (prevLast && prevLast.grid) {
                    startX = prevLast.grid.xi + prevLast.grid.width + gutterX;

                    // shared top edge based on previous plate
                    topY = prevLast.grid.yi + prevLast.grid.height;
                } else {
                    const viewLeft = this.grid.Xwc(0);
                    const viewTop = this.grid.Ywc(0);
                    const worldWidth = this.grid.worldWidth(this.grid.width);
                    const first = plates[0];

                    startX = viewLeft + (worldWidth - first.grid.width) / 2;

                    // shared top edge for first insertion
                    topY = viewTop + first.grid.height;
                }

                let cursorX = startX;

                for (const pl of plates) {
                    pl.grid.xi = cursorX;

                    // yi is bottom-left, so convert shared top edge into yi
                    pl.grid.yi = topY - pl.grid.height;

                    cursorX += pl.grid.width + gutterX;
                }

                this.root.push(...plates);
                this.generateTables();
                this.selectedPlate = plates[0];
            }

            getDefaultWellWidthSC(column_count) {
                if (((100 * column_count)) > this.grid.width) {
                    return this.defaultWellWidthSc;
                }
                let www = this.grid.worldWidth(100 * column_count)
                return www;

            }

            async zoomintoplot(plate) {

                this.clearActionGlyphs();

                if (!plate) return;

                this.deselectAll();

                if (plate.highlight) plate.highlight();

                this.grid.rescale();

                const totalWidth = plate.w;
                const totalHeight = plate.h;
                const xi = plate.x;
                const yi = plate.y;
                const expandFactor = 2.2;
                const newWidth = totalWidth * expandFactor;
                const newHeight = totalHeight * expandFactor;

                const centerX = xi + totalWidth / 2;
                const centerY = yi + totalHeight / 2;

                const zoomX = centerX - newWidth / 2;
                const zoomY = centerY - newHeight / 2;

                await this.zoomto(centerX, zoomY, newWidth, newHeight);

                if (plate.name) {
                    LJScript.add(this.name, 'zoomoutplot ' + plate.name);
                }
            }

            async zoomintotimeline(plate) {

                this.clearActionGlyphs();

                if (!plate) return;
                this.deselectAll();

                if (plate.highlight) plate.highlight();

                this.grid.rescale();

                const totalWidth = plate.w;
                const totalHeight = plate.h;
                const xi = plate.x;
                const yi = plate.y;

                const expandFactor = 0.2;
                const newWidth = totalWidth * expandFactor;
                const newHeight = totalHeight;

                const centerX = xi + totalWidth / 2;
                const centerY = yi + totalHeight / 2;

                const zoomX = centerX - newWidth / 2;
                const zoomY = centerY - newHeight;

                await this.zoomto(centerX, zoomY, newWidth, newHeight);

                if (plate.name) {
                    LJScript.add(this.name, 'zoomoutplot ' + plate.name);
                }
            }

            async zoomtoFit(opts = {}) {
                const grid = this.grid;
                const plates = this.root ?? [];
                const plots = this.m_plots ?? [];

                const pad = opts.pad ?? grid.worldWidth(60);
                const preserveAspect = opts.preserveAspect ?? true;
                const frames = Math.max(1, opts.frames ?? 260);

                if ((!plates || plates.length === 0) && (!plots || plots.length === 0)) return;

                this.pushGrid?.();
                if (typeof AnimateGrid !== "undefined") AnimateGrid.INTERUPT = true;
                grid.rescale();

                let minX = Infinity, maxX = -Infinity;
                let minY = Infinity, maxY = -Infinity;

                for (const p of plates) {
                    if (!p || !p.grid || !p.getWidth || !p.getHeight) continue;
                    const w = p.getWidth();
                    const h = p.getHeight();
                    const left = p.grid.xi;
                    const right = left + w;
                    const bottom = p.grid.yi;
                    const top = bottom + h;

                    if (left < minX) minX = left;
                    if (right > maxX) maxX = right;
                    if (bottom < minY) minY = bottom;
                    if (top > maxY) maxY = top;
                }

                for (const p of plots) {
                    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.getWidth()) || !Number.isFinite(p.getHeight())) continue;
                    const left = p.x;
                    const right = p.x + p.getWidth();
                    const top = p.y;
                    const bottom = p.y + p.getHeight();

                    if (left < minX) minX = left;
                    if (right > maxX) maxX = right;
                    if (bottom < minY) minY = bottom;
                    if (top > maxY) maxY = top;
                }

                if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return;

                minX -= pad; maxX += pad;
                minY -= pad; maxY += pad;

                if (preserveAspect) {
                    const curW = grid.getxmax() - grid.getxmin();
                    const curH = grid.getymax() - grid.getymin();
                    const targetAR = curW / Math.max(curH, 1e-9);

                    let boxW = maxX - minX;
                    let boxH = maxY - minY;
                    const boxAR = boxW / Math.max(boxH, 1e-9);

                    const cx = (minX + maxX) * 0.5;
                    const cy = (minY + maxY) * 0.5;

                    if (boxAR > targetAR) {

                        boxH = boxW / targetAR;
                    } else {

                        boxW = boxH * targetAR;
                    }

                    minX = cx - boxW * 0.5;
                    maxX = cx + boxW * 0.5;
                    minY = cy - boxH * 0.5;
                    maxY = cy + boxH * 0.5;
                }

                const ag = new AnimateGrid(grid);
                ag.animateTo(minX, maxX, minY, maxY, frames);
            }

            setPlateCenter(plate) {
                this.addNextAvailableX(plate)
            }

            async zoomouttoFit(opts = {}) {
                this.clearActionGlyphs();

                const grid = this.grid;
                const plates = this.root ?? [];
                const plots = this.m_plots ?? [];

                const preserveAspect = opts.preserveAspect ?? true;
                const frames = Math.max(1, opts.frames ?? 260);

                const marginFrac = 0.4

                if ((!plates || plates.length === 0) && (!plots || plots.length === 0)) return;

                this.pushGrid?.();
                if (typeof AnimateGrid !== "undefined") AnimateGrid.INTERUPT = true;
                grid.rescale();

                let minX = Infinity, maxX = -Infinity;
                let minY = Infinity, maxY = -Infinity;

                for (const p of plates) {
                    if (!p || !p.grid || !p.getWidth || !p.getHeight) continue;
                    const w = p.getWidth();
                    const h = p.getHeight();
                    const left = p.grid.xi;
                    const right = left + w;
                    const bottom = p.grid.yi;
                    const top = bottom + h;

                    if (left < minX) minX = left;
                    if (right > maxX) maxX = right;
                    if (bottom < minY) minY = bottom;
                    if (top > maxY) maxY = top;
                }

                for (const p of plots) {
                    const getW = typeof p.getWidth === "function" ? p.getWidth() : Number.NaN;
                    const getH = typeof p.getHeight === "function" ? p.getHeight() : Number.NaN;
                    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
                        !Number.isFinite(getW) || !Number.isFinite(getH)) continue;

                    console.log('debubg');
                    const left = p.x;
                    const right = p.x + getW;
                    const top = p.y;
                    const bottom = p.y + getH;

                    if (left < minX) minX = left;
                    if (right > maxX) maxX = right;
                    if (bottom < minY) minY = bottom;
                    if (top > maxY) maxY = top;
                }

                if (!Number.isFinite(minX) || !Number.isFinite(maxX) ||
                    !Number.isFinite(minY) || !Number.isFinite(maxY)) return;

                if (preserveAspect) {
                    const curW = grid.getxmax() - grid.getxmin();
                    const curH = grid.getymax() - grid.getymin();
                    const targetAR = curW / Math.max(curH, 1e-9);

                    let boxW = Math.abs(maxX - minX);
                    let boxH = Math.abs(maxY - minY);
                    const boxAR = boxW / Math.max(boxH, 1e-9);

                    const cx = (minX + maxX) * 0.5;
                    const cy = (minY + maxY) * 0.5;

                    if (boxAR > targetAR) {

                        boxH = boxW / targetAR;
                    } else {

                        boxW = boxH * targetAR;
                    }

                    minX = cx - boxW * 0.5;
                    maxX = cx + boxW * 0.5;
                    minY = cy - boxH * 0.5;
                    maxY = cy + boxH * 0.5;
                }

                const cx = (minX + maxX) * 0.5;
                const cy = (minY + maxY) * 0.5;
                const scale = (1 / (1 - marginFrac));
                const halfW = Math.abs(maxX - minX) * 0.5 * scale;
                const halfH = Math.abs(maxY - minY) * 0.5 * scale;

                minX = cx - halfW;
                maxX = cx + halfW;
                minY = cy - halfH;
                maxY = cy + halfH;

                const ag = new AnimateGrid(grid);
                ag.animateTo(minX, maxX, minY, maxY, frames);
            }

            async zoomoutofplot(plate) {
                this.clearActionGlyphs();
                if (!plate) return;

                this.deselectAll();
                if (plate.highlight) plate.highlight();

                this.grid.rescale();

                const bufferPxLR = 20;
                const availPxW = Math.max(1, this.grid.width - bufferPxLR * 2);

                const worldPerPx = plate.w / availPxW;

                const viewWorldW = worldPerPx * this.grid.width;
                const viewWorldH = worldPerPx * this.grid.height;

                const centerX = plate.x + plate.w / 2;
                const centerY = plate.y - plate.h / 2;

                await this.zoomto(centerX, centerY, viewWorldW, viewWorldH);

                if (plate.name) {
                    LJScript.add(this.name, 'zoomoutplot ' + plate.name);
                }
            }

            async zoomto(cx, cy, width, height) {
                this.pushGrid();
                this.clearActionGlyphs();

                AnimateGrid.INTERUPT = true;
                this.grid.rescale();

                const halfW = width / 2;
                const halfH = height / 2;

                const xmin = cx - halfW;
                const xmax = cx + halfW;
                const ymin = cy - halfH;
                const ymax = cy + halfH;

                const ag = new AnimateGrid(this.grid);
                ag.animateTo(xmin, xmax, ymin, ymax, 60);
            }

            async zoomtoX(x, y, width, height) {
                this.pushGrid();
                this.clearActionGlyphs();

                AnimateGrid.INTERUPT = true;
                this.grid.rescale();

                const xmin = x;
                const xmax = x + width;

                const ymin = this.grid.ymin;
                const ymax = this.grid.ymax;

                const ag = new AnimateGrid(this.grid);
                ag.animateTo(xmin, xmax, ymin, ymax, 70);
            }

            pushState() {
            }

            hasTable(uid) {
                for (let r of this.root) {
                    if (r.uid === uid)
                        return true;
                }
                return false;
            }

            async zoomtfit() {
                this.clearActionGlyphs();

                this.pushGrid();
                let xmin = 0;
                let xmax = 0;
                let ymin = 0;
                let ymax = 0;
                this.alignPlates();
                this.grid.rescale();

                let index = 0;
                for (let r of this.root) {
                    const childBounds = r.findBounds();
                    if (index === 0) {
                        xmin = childBounds.xmin;
                        xmax = childBounds.xmax;
                        ymin = childBounds.ymin;
                        ymax = childBounds.ymax;
                    } else {
                        xmin = Math.min(xmin, childBounds.xmin);
                        xmax = Math.max(xmax, childBounds.xmax);
                        ymin = Math.min(ymin, childBounds.ymin);
                        ymax = Math.max(ymax, childBounds.ymax);
                    }
                    index++;
                }
                for (let p of this.m_plots) {

                    const childBounds = p.findBounds();

                }

                if (isNaN(xmin) || isNaN(xmax) || isNaN(ymin) || isNaN(ymax) ||
                    xmin == null || xmax == null || ymin == null || ymax == null ||
                    xmin === undefined || xmax === undefined || ymin === undefined || ymax === undefined
                ) {
                    return null;
                }

                let ag = new AnimateGrid(this.grid);
                this.grid.rescale();
                const width = xmax - xmin;
                const height = ymax - ymin;

                let windowWidth = width;
                let windowHeight = height;

                const boxAspectRatio = width / height;

                const windowAspectRatio = windowWidth / windowHeight;

                let newWidth, newHeight;

                if (boxAspectRatio > windowAspectRatio) {

                    newWidth = windowWidth;
                    newHeight = newWidth / boxAspectRatio;
                } else {

                    newHeight = windowHeight;
                    newWidth = newHeight * boxAspectRatio;
                }

                const marginX = 2
                const marginY = 2

                await ag.animateTo(xmin - marginX, xmax + marginX, ymin - marginY - 5, ymax + marginY + 5, 50);

            }

            reset(path) {

                pushHistory(HM(this))

                this.killSprite();

                this.file = generateNautName() + '.bjb';
                let graph = CurrentLayout.getStashed('graph')
                graph.file = '';
                LJScript.reset();

                this.clearPlates();
                this.clearTransferfunctions();
                this.resetGrid();
                this.clearPlots();
                this.clearGlyphs();
                this.formulas = {}
                this.bookmarks = {}
                this.uid = uuid();
                if (path)
                    window.history.pushState({ 'rna-screen': {} }, 'platetrack', path);

                const uid = this.uid;
                const name = this.name;

                this.path = null;
                this.formulas = {};
                this.minObjectY = undefined;
                this.maxObjectY = undefined;
                this.root = [];
                this.ops = [];
                this.transferFunctions = [];
                this.trackFunctions = [];
                this.connections = [];
                this.m_plots = [];
                this.glyphs = [];
                this.bookmarks = {};
                this.ljl_bookmarks = {};
                this.mode = 'select';
                this.menu = null;
                this.plate_menu = null;
                this.menu_vis = false;
                this.defaultWellWidthSc = 0.1;
                this.defaultWellHeightSc = 0.01;
                this.selectedPlate = null;
                this.fromPlate = null;
                this.toPlate = null;
                this.file = `${generateNautName()}.bjb`;
                this.__msg = null;
                this.__msgb = null;
                this.__msgc = null;
                this.__tables_menu = null;

                this.__menu__ = null;
                this._lastUpdateTime = Date.now();
                this.grid = new MGrid(0, 0, 1, 1);
                this.grid.setxmax(1000);
                this.grid.setymax(1000);
                this.grid.setxmin(0);
                this.grid.setymin(0);
                this.grid.setInset(0, 0);
                this.grid.rescale();

            }

            clearPlots() {
                this.m_plots = []
            }
            clearGlyphs() {
                this.glyphs = []
            }
            clearActionGlyphs() {
                this.actionGlyph = []
            }

            clearPlates() {

                this.root = [];
                this.transferFunctions = [];
                this.trackFunctions = [];
                this.connections = []
            }
            clearAllFormulas() {
                this.formulas = {}

                for (let r of this.root) {
                    r.clearAllFormulas();
                }
            }
            getTransferFunctions(fromPlate, f) {
                if (!f) {
                    f = [];
                }
                for (let tf of this.transferFunctions) {
                    if (tf.from == fromPlate) {
                        f.push(tf);
                        this.getTransferFunctions(tf.to, f);
                    }
                }
                return f;
            }
            getFunction(x, y) {
                let xs = this.grid.X(x);
                let ys = this.grid.Y(y);

                for (let t of this.transferFunctions) {

                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);
                    let screenWidth = t.screenWidth;

                    if (tsx - screenWidth < xs && tsx + screenWidth > xs &&
                        tsy + 30 > ys && tsy - 30 < ys) {
                        return t;
                    }
                }

                for (let t of this.trackFunctions) {
                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);
                    let w = this.grid.screenWidth(t.w);
                    let h = this.grid.screenHeight(t.h);

                    if (tsx < xs && (tsx + w) > xs &&
                        tsy < ys && tsy + h > ys) {
                        return t;
                    }
                }
            }

            getTransferFunction(x, y) {
                let xs = this.grid.X(x);
                let ys = this.grid.Y(y);
                for (let t of this.transferFunctions) {
                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);

                    console.log(" tsx " + tsx + '' + t.screenWidth);
                    if (tsx - t.screenWidth < xs && tsx + t.screenWidth > xs &&
                        tsy + 40 > ys && tsy - 40 < ys) {
                        return t;
                    }
                }
            }
            getTrackFunction(x, y) {
                let xs = this.grid.X(x);
                let ys = this.grid.Y(y);

                for (let t of this.trackFunctions) {
                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);
                    let w = this.grid.screenWidth(t.w);
                    let h = this.grid.screenHeight(t.h);

                    if (tsx < xs && (tsx + w) > xs &&
                        tsy < ys && tsy + h > ys) {
                        return t;
                    }
                }
            }

            getObjectByName(name) {
                let ob = this.getTableByName(name)
                if (!ob) {
                    ob = this.getPlotByName(name)
                }
                if (!ob) {
                    ob = this.getEquationFromPlot(name)
                }
                return ob;
            }




            getTableByName(name) {

                if (!name || name.length <= 0) {
                    return null;
                }

                for (let r of this.root) {
                    if (r.name.toLowerCase() === name.toLowerCase()) {
                        return r;
                    }
                }
                return null;
            }





            getEquationFromPlot(name) {

                function extractSingleNumericValue(input) {
                    let v = input;

                    // Handles [[{ value: "31.98629", ... }]]
                    while (Array.isArray(v) && v.length === 1) {
                        v = v[0];
                    }

                    // Handles { value: "31.98629", ... }
                    if (v && typeof v === "object" && "value" in v) {
                        v = v.value;
                    }

                    const n = Number(v);

                    if (!Number.isFinite(n)) {
                        throw new Error(`Expected numeric value, got: ${JSON.stringify(input)}`);
                    }

                    return n;
                }
                for (let plot of this.m_plots) {

                    if (
                        plot &&
                        Array.isArray(plot.lineEquations)
                    ) {
                        for (let eq of plot.lineEquations) {
                            // match by label
                            if (eq.label === name) {
                                return {
                                    name: eq.label,
                                    lineEquations: [eq],
                                    grid: this.grid,

                                    // solve for x from y
                                    X(yValue) {
                                        yValue = extractSingleNumericValue(yValue);
                                        debugger;
                                        const results = [];

                                        this.lineEquations.forEach(line => {
                                            const { mfunction } = line;

                                            if (mfunction) {
                                                results.push(mfunction(this.grid));
                                                return;
                                            }

                                            const { slope, intercept } = line;

                                            if (slope !== 0) {
                                                const x = (yValue - intercept) / slope;
                                                results.push(x);
                                            } else {
                                                results.push({
                                                    line,
                                                    x: null,
                                                    error: "Horizontal line - no unique x for given y"
                                                });
                                            }
                                        });

                                        if (results && results.length === 1) {
                                            return results[0]
                                        }



                                        return results;
                                    },

                                    Y(xValue) {
                                        xValue = extractSingleNumericValue(xValue);

                                        const results = [];

                                        this.lineEquations.forEach(line => {
                                            const { slope, intercept } = line;
                                            const y = slope * xValue + intercept;

                                            results.push(y);
                                        });

                                        return results;
                                    }
                                };
                            }
                        }
                    }
                }

                return null;
            }

            getPlotByName(name) {
                for (let r of this.m_plots) {
                    if (r.name.toLowerCase() === name.toLowerCase()) {
                        return r;
                    }
                }
                return null;
            }
            trimAssumptionRows() {
                const tableName = "Assumptions";
                const table = this.getTableByName?.(tableName);
                if (!table || typeof table.removeRow !== "function") return;

                table.resetWellGroups();

                const col0 = table.wells?.[0];
                if (!Array.isArray(col0) || col0.length === 0) return;

                const normalize = (v) => {
                    if (v == null) return "";
                    let s = String(v).trim();
                    if (
                        (s.startsWith('"') && s.endsWith('"')) ||
                        (s.startsWith("'") && s.endsWith("'"))
                    ) {
                        s = s.slice(1, -1).trim();
                    }
                    return s.toLowerCase();
                };

                const formulas = this.formulas || {};
                const corpusParts = [];
                for (const [k, v] of Object.entries(formulas)) {
                    if (typeof k === "string" && k) corpusParts.push(k);
                    if (typeof v === "string" && v) corpusParts.push(v);
                }
                const corpus = corpusParts.join(" ");
                if (!corpus) return;

                const headerWell = col0[0];
                const headerText = normalize(headerWell?.value ?? headerWell?.name);
                const hasHeaderRow =
                    headerWell?.properties?.isHeader === true || headerText === "label";

                const firstRemovableRow = hasHeaderRow ? 1 : 1;

                const removedRowIndices = [];

                for (let y = col0.length - 1; y >= firstRemovableRow; y--) {
                    const w = col0[y];
                    const labelRaw = w?.value ?? w?.name;
                    const label = String(labelRaw ?? "").trim();
                    if (!label) continue;

                    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const re = new RegExp(`\\b${tableName}\\s*\\[\\s*${escaped}\\s*\\]`, "i");

                    if (!re.test(corpus)) {
                        table.removeRow(y);
                        removedRowIndices.push(y);
                    }
                }

                if (removedRowIndices.length) {

                    this.formulas = this._rewriteFormulaKeysForDeletedRows(
                        this.formulas,
                        tableName,
                        removedRowIndices
                    );
                }

                table.fitRowsAndColumns?.();
                this.grid?.rescale?.();
                this.generateTables?.();
                table.adjustDimensionsToFitScale(this);
            }

            _rewriteFormulaKeysForDeletedRows(formulasObj, tableName, removedRows) {
                if (!formulasObj || typeof formulasObj !== "object") return formulasObj;

                const removed = Array.from(new Set(removedRows))
                    .filter((n) => Number.isInteger(n))
                    .sort((a, b) => a - b);

                const shift = (idx) => {

                    let c = 0;
                    for (let i = 0; i < removed.length; i++) {
                        if (removed[i] < idx) c++;
                        else break;
                    }
                    return idx - c;
                };

                const keyRe = new RegExp(`^${tableName}\\[(\\d+):(\\d+)\\]\\[(\\d+):(\\d+)\\]$`);

                const out = {};
                for (const [k, v] of Object.entries(formulasObj)) {
                    const m = typeof k === "string" ? k.match(keyRe) : null;
                    if (!m) {
                        out[k] = v;
                        continue;
                    }

                    const xi = parseInt(m[1], 10);
                    const xf = parseInt(m[2], 10);
                    const yi = parseInt(m[3], 10);
                    const yf = parseInt(m[4], 10);

                    const intersectsDeleted = removed.some((r) => r >= yi && r <= yf);
                    if (intersectsDeleted) continue;

                    const nYi = shift(yi);
                    const nYf = shift(yf);

                    const newKey = `${tableName}[${xi}:${xf}][${nYi}:${nYf}]`;
                    out[newKey] = v;
                }

                return out;
            }

            getPlateWithUID(uid) {
                if (!uid) {
                    return null;
                }

                if (this.uid === uid) {
                    return this;
                }
                else {
                    for (let p of this.root) {
                        let vp = p.getPlateWithUID(uid);
                        if (vp) {
                            return vp;
                        }
                    }

                    for (let con of this.connections) {
                        return con.find(uid)
                    }

                }
            }
            clearTransferfunctions() {
                this.transferFunctions = [];
            }

            searchByName(nameToSearch) {
                if (nameToSearch === this.name) {
                    return this;
                }
                const arraysToSearch = [this.root, this.transferFunctions, this.trackFunctions, this.connections, this.m_plots, this.glyphs];
                const normalizedSearchName = nameToSearch.toLowerCase();
                const results = [];
                for (const array of arraysToSearch) {
                    for (const obj of array) {

                        if (obj.name && obj.name.toLowerCase() === normalizedSearchName) {
                            results.push(obj);
                        }
                    }
                }
                return results;
            }
            getRefByName(name) {
                return this.searchByName(name)
            }

            getLastTouchedPlate() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),

                ].filter(obj => obj && obj.getLastTouched() !== undefined);
                allDrawables = allDrawables.sort((a, b) => a.getLastTouched() - b.getLastTouched());

                return allDrawables[0]
            }

            getPlate(wx, wy) {

                for (let i = this.glyphs.length - 1; i >= 0; i--) {
                    const glyph = this.glyphs[i];
                    if (glyph.inside && glyph.inside(this.grid, wx, wy, true)) {
                        return glyph;
                    }
                }

                const allObjects = [
                    ...this.root.slice().reverse(),
                    ...this.m_plots,
                    this.selectedPlate,
                ].filter(obj => obj);

                allObjects.sort((a, b) => {
                    const aBg = a.isBackground ? 0 : 1;
                    const bBg = b.isBackground ? 0 : 1;
                    return aBg - bBg;
                });

                for (let i = allObjects.length - 1; i >= 0; i--) {
                    const obj = allObjects[i];
                    if (obj.inside && obj.inside(this.grid, wx, wy, true)) {
                        return obj;
                    }
                }

                return null;
            }

            getSelectedWells() {
                let w = []
                for (let r of this.root) {
                    let se = r.getSelectedWellsInOrder()
                    if (se && se.length > 0) {
                        w = w.concat(se);
                    }
                }
                return w;

            }

            getSelectedWellsInOrder() {
                let w = []
                for (let r of this.root) {
                    let se = r.getSelectedWellsInOrder()
                    w = w.concat(se);

                }
                return w;
            }

            async pasteValuesasTagsSelectedWells() {
                const vtext = await navigator.clipboard.readText();
                for (let r of this.root) {
                    let se = await r.getSelectedWellsInOrder()
                    let js = JSON.parse(vtext)
                    let se_len = js.length;
                    for (let i = 0; i < se_len; i++) {
                        if (i < se.length) {
                            let v = js[i].value
                            se[i].setGroup(v)
                        }
                    }
                }
            }

            async pasteIntoSelectedWells(__text) {
                if (!__text) {
                    __text = await navigator.clipboard.readText();
                }

                function parseTable(text) {
                    return text
                        .trim()
                        .split(/\r?\n/)
                        .map(row => row.split(/\t|,/).map(cell => cell.trim()));
                }

                function isWellName(value) {
                    return /^[A-Z]+\d+$/i.test(String(value || '').trim());
                }

                function isNumeric(value) {
                    return value !== '' && !isNaN(Number(value));
                }

                let table = parseTable(__text);
                if (!table.length) return;


                debugger;

                // Remove header row like: Well RFU1 RFU2
                const hasHeader = table[0].some(cell =>
                    !isNumeric(cell) && !isWellName(cell)
                );
                // Remove first column if it contains well IDs like B1, B2, C1...
                const hasWellColumn =
                    table.length > 0 &&
                    table.every(row => isWellName(row[0]));

                if (hasWellColumn) {
                    table = table.map(row => row.slice(1));
                }

                const wells = this.selectedPlate.wells; // wells[col][row]

                const selected = [];

                for (let col = 0; col < wells.length; col++) {
                    for (let row = 0; row < wells[col].length; row++) {
                        const well = wells[col][row];

                        if (well && well.select === true) {
                            selected.push({ col, row, well });
                        }
                    }
                }

                if (!selected.length) return;

                const minCol = Math.min(...selected.map(s => s.col));
                const maxCol = Math.max(...selected.map(s => s.col));
                const minRow = Math.min(...selected.map(s => s.row));
                const maxRow = Math.max(...selected.map(s => s.row));

                const selectedColCount = maxCol - minCol + 1;
                const selectedRowCount = maxRow - minRow + 1;

                const pasteRowCount = table.length;
                const pasteColCount = Math.max(...table.map(row => row.length));

                const rowsToPaste = Math.min(pasteRowCount, selectedRowCount);
                const colsToPaste = Math.min(pasteColCount, selectedColCount);

                this.selectedPlate.clearRowHeaderGroups?.();
                this.selectedPlate.clearColumnHeaderGroups?.();

                for (let pasteCol = 0; pasteCol < colsToPaste; pasteCol++) {
                    for (let pasteRow = 0; pasteRow < rowsToPaste; pasteRow++) {
                        const targetCol = minCol + pasteCol;
                        const targetRow = minRow + pasteRow;

                        // IMPORTANT: wells[col][row]
                        const targetWell = wells[targetCol]?.[targetRow];

                        if (!targetWell || targetWell.select !== true) continue;

                        const value = table[pasteRow]?.[pasteCol];

                        if (value !== undefined) {
                            targetWell.setValue(value);
                        }
                    }
                }

                this.selectedPlate.reapplyHeaderWells?.();
                this.repaint?.();
            }
            async pasteIntoMappedColumns(mappingJson, __text) {

                function detectDelimiter(text) {
                    const delimiters = ['\n', '\t', ',', ';', '|'];
                    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
                    if (lines.length === 0) return ',';
                    const scored = delimiters.map(delim => {
                        const counts = lines.map(line => line.split(delim).length);
                        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
                        const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
                        const stddev = Math.sqrt(variance);
                        return { delim, avg, consistency: 1 / (stddev + 1e-4) };
                    }).sort((a, b) => (b.consistency - a.consistency) || (b.avg - a.avg));
                    return scored[0].delim;
                }

                function parseTable(text) {
                    const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
                    const delim = detectDelimiter(text);
                    return rows
                        .filter(r => r.trim().length > 0)
                        .map(r => r.split(delim).map(c => c.trim()));
                }

                function topTargetForSrcCol(targets) {
                    if (!targets || targets.length === 0) return null;

                    return targets.slice().sort((a, b) =>
                        (b.confidence - a.confidence) ||
                        ((b.column?.toLowerCase() === 'well id') - (a.column?.toLowerCase() === 'well id'))
                    )[0];
                }

                function lettersToIndex(letters) {
                    let sum = 0;
                    for (let i = 0; i < letters.length; i++) sum = sum * 26 + (letters.charCodeAt(i) - 64);
                    return sum - 1;
                }

                function parseWellId(wellLike) {
                    if (!wellLike || typeof wellLike !== 'string') return null;
                    const s = wellLike.toUpperCase().trim();
                    const m = s.match(/^([A-Z]+)\s*0*([0-9]+)$/);
                    if (!m) return null;
                    const rowIdx = lettersToIndex(m[1]);
                    const colIdx = parseInt(m[2], 10) - 1;
                    if (rowIdx < 0 || colIdx < 0) return null;
                    return { colIdx, rowIdx };
                }

                function safeSetWellField(well, fieldName, value) {
                    if (!well) return;
                    if (typeof well.setField === 'function') {
                        well.setField(fieldName, value);
                    } else if (typeof well.setValue === 'function') {
                        well.setValue(value);
                    } else {
                        if (!well.obj || typeof well.obj !== 'object') well.obj = {};
                        well.obj[fieldName] = value;
                    }
                }

                const getTableByName = (name) => {
                    if (typeof this?.getTableByName === 'function') return this.getTableByName(name);
                    if (Array.isArray(this?.root)) return this.root.find(t => t.name === name || t.table === name);
                    return null;
                };

                if (!__text) __text = await navigator.clipboard.readText();
                if (!__text || !__text.trim()) return;

                const mapEntries = Array.isArray(mappingJson?.mapping) ? mappingJson.mapping : [];

                const bestTargetsBySrc = new Map();
                for (const entry of mapEntries) {
                    const best = topTargetForSrcCol(entry.targets || []);
                    if (best) bestTargetsBySrc.set(entry.src_col, best);
                }

                const wellSrcCols = [...bestTargetsBySrc.entries()]
                    .filter(([, t]) => String(t.column || '').toLowerCase() === 'well id')
                    .map(([src]) => src);

                const table = parseTable(__text);
                if (table.length === 0) return;

                const header = table[0].map(h => (h || '').trim());
                const headerLower = header.map(h => h.toLowerCase());
                const dataRows = table.slice(1);

                const idxOfHeader = (name) => headerLower.indexOf(String(name || '').toLowerCase());

                const wellHeaderIdx = wellSrcCols
                    .map(n => ({ n, idx: idxOfHeader(n) }))
                    .filter(x => x.idx >= 0);

                const perTableOps = new Map();

                function resolveWellForRow(row) {

                    for (const cand of wellHeaderIdx) {
                        const parsed = parseWellId(row[cand.idx]);
                        if (parsed) return parsed;
                    }

                    for (const src of wellSrcCols) {
                        const idx = idxOfHeader(src);
                        if (idx >= 0) {
                            const parsed = parseWellId(row[idx]);
                            if (parsed) return parsed;
                        }
                    }
                    return null;
                }

                dataRows.forEach((row) => {
                    const wellCoords = resolveWellForRow(row);
                    for (const [src, target] of bestTargetsBySrc) {
                        const destCol = String(target.column || '');
                        if (destCol.toLowerCase() === 'well id') continue;
                        const tableName = target.table;
                        if (!tableName) continue;

                        const srcIdx = idxOfHeader(src);
                        if (srcIdx < 0) continue;

                        if (!perTableOps.has(tableName)) perTableOps.set(tableName, []);
                        perTableOps.get(tableName).push({
                            well: wellCoords,
                            field: destCol,
                            value: row[srcIdx]
                        });
                    }
                });

                for (const [tableName, ops] of perTableOps.entries()) {
                    const tableObj = getTableByName(tableName);
                    if (!tableObj) continue;

                    const byField = new Map();
                    for (const op of ops) {
                        if (!byField.has(op.field)) byField.set(op.field, []);
                        byField.get(op.field).push(op);
                    }

                    for (const [header_value, fieldOps] of byField.entries()) {

                        let cwells = null;
                        if (typeof tableObj.getColumnByHeader === 'function') {
                            try { cwells = tableObj.getColumnByHeader(header_value); } catch (_) { }
                        }

                        if (Array.isArray(cwells)) {

                            let seq = 0;
                            for (const { well, value } of fieldOps) {
                                let targetWell = null;
                                if (well && Number.isInteger(well.rowIdx) && cwells[well.rowIdx]) {
                                    targetWell = cwells[well.rowIdx];
                                } else if (seq < cwells.length) {
                                    targetWell = cwells[seq++];
                                }
                                if (targetWell) {
                                    safeSetWellField(targetWell, header_value, value);
                                }
                            }
                            continue;
                        }

                        if (!tableObj.wells) continue;
                        for (const { well, value } of fieldOps) {
                            if (!well) continue;
                            const { colIdx, rowIdx } = well;
                            if (!tableObj.wells[colIdx] || !tableObj.wells[colIdx][rowIdx]) continue;
                            const wellObj = tableObj.wells[colIdx][rowIdx];
                            safeSetWellField(wellObj, header_value, value);
                        }
                    }
                }
            }

            async pasteIntoSelectedWellsASAddresses() {
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableToArray(input) {
                    return input
                        .split('\n')
                        .map(row => row.split(/[\t,]+/).map(cell => cell.trim()))
                        .map(row => row.map(cell => cell === '' ? '' : cell))
                }
                let text = await navigator.clipboard.readText();
                try {
                    if (isStringArray(text)) {
                        function parseToArray(input) {
                            try {
                                const parsed = JSON.parse(input);
                                return Array.isArray(parsed) ? parsed : [parsed];
                            } catch (e) {
                                return input
                                    .split(/[\n,\t\s]+/)
                                    .map(item => item.trim())
                                    .filter(item => item);
                            }
                        }
                        let parsedArray = parseToArray(text);
                        let selectedWells = await this.selectedPlate.getSelectedWellsInOrder();
                        let index = 0;

                        for (let i = 0; i < selectedWells.length && index < parsedArray.length; i++) {
                            selectedWells[i].setAddress(parsedArray[index++]);
                        }
                    } else {
                        let parsedData = parseTableToArray(text);
                        let r = this.selectedPlate;
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numRows = parsedData.length;
                        let numCols = parsedData[0].length;
                        let index = 0;
                        for (let row = 0; row < numRows; row++) {
                            for (let col = 0; col < numCols; col++) {
                                if (index < selectedWells.length) {
                                    const currentValue = selectedWells[index].getValue();
                                    const newValue = parsedData[row][col];
                                    selectedWells[index].setAddress(newValue);
                                    index++;
                                }
                            }
                        }
                    }
                } catch (exception) {
                    let lines = text.split('\n');

                    for (let r of this.root) {
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numLines = lines.length;

                        for (let i = 0; i < numLines; i++) {
                            if (i < selectedWells.length) {
                                selectedWells[i].setAddress(lines[i]);
                            }
                        }
                    }
                }
            }

            async pasteAndJoinOnAddressColumn(paste_address_column, destination_column) {

                if (!paste_address_column) {
                    paste_address_column = 0;
                }

                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableArray(input) {
                    return input
                        .split('\n')
                        .map(row => {

                            let leadingDelimiters = row.match(/^([\t,]+)/);
                            let result = [];

                            if (leadingDelimiters) {
                                let emptyCells = leadingDelimiters[0].split(/[\t,]/).length - 1;
                                for (let i = 0; i < emptyCells; i++) {
                                    result.push('');
                                }
                                row = row.slice(leadingDelimiters[0].length);
                            }

                            let cells = row.split(/[\t,]+/);
                            result = result.concat(cells.map(cell => cell.trim()));

                            return result;
                        });
                }

                let text = await navigator.clipboard.readText();
                let parsedData = parseTableArray(text);
                const r = this.selectedPlate;
                r.deselectAll();
                r.selectColumnAtRow(0, destination_column)
                let selectedWells = await r.getSelectedWellsInOrder();
                let numRows = parsedData.length;
                let numCols = parsedData[0].length;

                let start = r.wells.length;
                for (let i = 0; i < numCols; i++)
                    r.insertCol(r.wells.length)

                for (let row = 0; row < numRows; row++) {
                    const columns = parsedData[row];
                    let y = 0;
                    for (let s of selectedWells) {

                        if (('' + s.position).trim() === ('' + parsedData[row][paste_address_column]).trim()) {

                            for (let i = start; i < r.wells.length; i++) {
                                r.setValueByIndex(i, y, parsedData[row][i - start])
                            }
                        }
                        y++;
                    }

                }
            }
            joinOnAddress__(p1, p2, columnIndex) {
                this.deselectAll();
                if (!p1 || !p1.wells || !p1.wells.length) return;
                if (!p2 || !p2.wells || !p2.wells.length) return;
                const addressToValue = new Map();
                for (let x = 0; x < p1.wells.length; x++) {
                    const col = p1.wells[x];
                    if (!Array.isArray(col)) continue;
                    for (let y = 0; y < col.length; y++) {
                        const well = col[y];
                        if (!well || well.position == null) continue;

                        const key = String(well.position).trim().toUpperCase();
                        if (!key) continue;

                        addressToValue.set(key, well.value);
                    }
                }
                p2.addColumn(p1?.name || 'Joined');
                const x = columnIndex;
                const col = p2.wells[x];
                for (let y = 1; y < col.length; y++) {
                    const well = col[y];
                    const key = String(well.value).trim().toUpperCase();
                    if (!key || !addressToValue.has(key)) continue;
                    const v = addressToValue.get(key);
                    p2.wells[p2.wells.length - 1][y].setValue(v);
                }
                this.deselectAll();
            }

            joinOnAddressColumn(p1, c1, p2, c2) {

                if (typeof this.deselectAll === 'function') {
                    this.deselectAll();
                }

                const addressToValue = new Map();

                if (!p1 || !p1.wells || !p1.wells.length) return;

                const srcNumCols = p1.wells.length;

                for (let x = 0; x < srcNumCols; x++) {
                    const col = p1.wells[x];
                    if (!col) continue;

                    for (let y = 0; y < col.length; y++) {
                        const well = col[y];
                        if (!well || well.position == null) continue;

                        const key = String(well.position).trim().toUpperCase();

                        addressToValue.set(key, well.value);
                    }
                }

                if (!addressToValue.size || !p2 || !p2.wells || !p2.wells.length) {
                    return;
                }

                const destNumCols = p2.wells.length;

                for (let x = 0; x < destNumCols; x++) {
                    const col = p2.wells[x];
                    if (!col) continue;

                    for (let y = 0; y < col.length; y++) {
                        const well = col[y];
                        if (!well || well.position == null) continue;

                        const key = String(well.position).trim().toUpperCase();
                        if (addressToValue.has(key)) {
                            const v = addressToValue.get(key);

                            if (typeof p2.setValueByIndex === 'function') {
                                p2.setValueByIndex(x, y, v);
                            } else {
                                well.value = v;
                            }
                        }
                    }
                }

                if (typeof this.deselectAll === 'function') {
                    this.deselectAll();
                }
            }
            join(p1, c1, p2, c2) {
                const r = p1;
                this.deselectAll();
                r.deselectAll();
                r.selectColumnAtRow(0, c1)
                let selectedWells = r.getSelectedWellsInOrder();
                let numRows = p1.wells[0].length;
                let numCols = p1.wells.length;
                let start = p2.wells.length;
                for (let i = 0; i < numCols; i++)
                    p2.insertCol(p2.wells.length)
                for (let row = 0; row < numRows; row++) {
                    let y = 0;

                    for (let s of selectedWells) {

                        if (p2.wells[c2][row] && p2.wells[c2][row].value) {

                            if (('' + s.value).trim() === ('' + p2.wells[c2][row].value).trim()) {
                                for (let i = start; i < p2.wells.length; i++) {
                                    p2.setValueByIndex(i, row, s.value)
                                }
                            }
                        }
                        y++;
                    }
                }
                this.deselectAll();

            }

            async pasteAndJoinOnValueColumn(paste_address_column, destination_column) {
                if (!paste_address_column) {
                    paste_address_column = 0;
                }
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableArray(input) {
                    return input
                        .split('\n')
                        .map(row => {

                            let leadingDelimiters = row.match(/^([\t,]+)/);
                            let result = [];

                            if (leadingDelimiters) {
                                let emptyCells = leadingDelimiters[0].split(/[\t,]/).length - 1;
                                for (let i = 0; i < emptyCells; i++) {
                                    result.push('');
                                }
                                row = row.slice(leadingDelimiters[0].length);
                            }

                            let cells = row.split(/[\t,]+/);
                            result = result.concat(cells.map(cell => cell.trim()));

                            return result;
                        });
                }

                let text = await navigator.clipboard.readText();
                let parsedData = parseTableArray(text);
                const r = this.selectedPlate;
                r.deselectAll();
                r.selectColumnAtRow(0, destination_column)

                let selectedWells = await r.getSelectedWellsInOrder();
                let numRows = parsedData.length;
                let numCols = parsedData[0].length;

                let start = r.wells.length;
                for (let i = 0; i < numCols; i++)
                    r.insertCol(r.wells.length)

                for (let row = 0; row < numRows; row++) {
                    const columns = parsedData[row];
                    let y = 0;
                    for (let s of selectedWells) {

                        if (('' + s.value).trim() === ('' + parsedData[row][paste_address_column]).trim()) {

                            for (let i = start; i < r.wells.length; i++) {
                                r.setValueByIndex(i, y, parsedData[row][i - start])
                            }
                        }
                        y++;
                    }

                }
            }

            async pastePrependIntoSelectedWells(text, insertionText) {
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }

                function parseTableToArray(input) {
                    return input
                        .split('\n')
                        .map(row => row.split(/[\t,]+/).map(cell => cell.trim()))
                        .map(row => row.map(cell => cell === '' ? '' : cell))
                }

                if (!text) {
                    text = await navigator.clipboard.readText();
                }

                try {
                    if (isStringArray(text)) {
                        function parseToArray(input) {
                            try {
                                const parsed = JSON.parse(input);
                                return Array.isArray(parsed) ? parsed : [parsed];
                            } catch (e) {
                                return input
                                    .split(/[\n,\t\s]+/)
                                    .map(item => item.trim())
                                    .filter(item => item);
                            }
                        }

                        if (!insertionText) {
                            insertionText = '';
                        }

                        let parsedArray = parseToArray(text);
                        let selectedWells = await this.selectedPlate.getSelectedWellsInOrder();
                        let index = 0;

                        for (let i = 0; i < selectedWells.length && index < parsedArray.length; i++) {
                            selectedWells[i].setValue(parsedArray[index++] + insertionText + selectedWells[i].getValue());
                        }
                    } else {
                        let parsedData = parseTableToArray(text);

                        for (let r of this.root) {
                            let selectedWells = await r.getSelectedWellsInOrder();
                            let numRows = parsedData.length;
                            let numCols = parsedData[0].length;
                            let index = 0;

                            for (let row = 0; row < numRows; row++) {
                                for (let col = 0; col < numCols; col++) {
                                    if (index < selectedWells.length) {
                                        const currentValue = selectedWells[index].getValue();
                                        const newValue = parsedData[row][col];
                                        selectedWells[index].setValue(newValue + insertionText + currentValue);
                                        index++;
                                    }
                                }
                            }
                        }
                    }
                } catch (exception) {
                    let lines = text.split('\n');

                    for (let r of this.root) {
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numLines = lines.length;

                        for (let i = 0; i < numLines; i++) {
                            if (i < selectedWells.length) {
                                selectedWells[i].setValue(lines[i]);
                            }
                        }
                    }
                }
            }

            selectWells(n) {
                for (let r of this.root) {
                    r.selectWells(n)
                }
            }
            applyValuesToPlateField(field, n) {
                for (let r of this.root) {
                    r.applyValuesToPlateField(field, n)
                }
            }

            getSelectedPlate() {
                return this.selectedPlate;
            }
            isPositionOccupied(x, y, newPlate, existingPlates) {
                for (let plate of existingPlates) {

                    if (
                        x >= plate.grid.xi &&
                        x < plate.grid.xi + plate.grid.width &&
                        y >= plate.grid.yi &&
                        y < plate.grid.yi + plate.grid.height
                    ) {
                        return true;
                    }
                }

                return false;
            }

            findEmptyLocation(newPlate) {

                let existingPlates = this.selectedPlate.plates;

                const gridWidth = this.selectedPlate.grid.width;
                const gridHeight = this.selectedPlate.grid.height;

                for (let x = 0; x < gridWidth; x++) {
                    for (let y = 0; y < gridHeight; y++) {

                        if (!this.isPositionOccupied(x, y, newPlate, existingPlates)) {
                            return { x, y };
                        }
                    }
                }

                return null;
            }

            getCanvasDimensions() {
                return this.__canvas_width, this.__canvas_height
            }
            applyHeaders() {
                for (let i of this.root) {
                    i.applycolumnheaders()
                    i.applyrowheaders();
                }

            }

            showTextEditor(c1) {
                if (isMobile()) {
                    return;
                }


                for (let i of this.root) {
                    i.applycolumnheaders()
                }

                if (!c1) {
                    c1 = {
                        height: '200px',
                        width: '500px',
                        editorOptions: {
                            language: 'bajabio',

                            theme: 'no-border-theme',
                            minimap: { enabled: false },
                            scrollbar: {
                                vertical: 'hidden',
                                horizontal: 'hidden',
                            },
                            lineNumbers: 'off',
                            lineDecorationsWidth: 0,
                            lineNumbersMinChars: 0,
                            overviewRulerLanes: 0,
                            hideCursorInOverviewRuler: true,
                            folding: false,
                            highlightActiveIndentGuide: false,
                            renderLineHighlight: 'none',
                            renderLineHighlightOnlyWhenFocus: false,
                            renderWhitespace: 'none',
                            fontSize: 18,
                            automaticLayout: true,
                            padding: {
                                top: 20,
                                bottom: 20,
                                left: 30,
                                right: 30
                            }
                        },
                        objects: this.root,
                        keybinding: {
                            'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                            })
                        },
                        code: ``,
                        buttons: [
                            {
                                'label': ' Insert  ', 'color': 'black', action: (async () => {
                                    let activeContent = editor.code;
                                    let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), this);
                                    let index = 0;
                                    let r = v['results']
                                    let t = v['tags']
                                    for (let i of r) {
                                        if (selected_wells[index]) {
                                            if (!isNaN(i)) {
                                                selected_wells[index].value = parseFloat(i).toFixed(2)
                                            } else {
                                                selected_wells[index].value = i;
                                            } for (let tag of t) {
                                                selected_wells[index].setGroup(tag)
                                            }
                                        }
                                        index++;
                                        if (index >= selected_wells.length)
                                            break;
                                    }
                                }),
                            },
                            {
                                'label': 'Close', 'color': 'red', 'action': (() => {
                                    this.__canvas__.hideEditor();
                                }),
                            },

                        ]
                    }

                }

                if (isMobile()) {

                    return c1

                } else {
                    let obj = CurrentLayout.getStashed('graph-canvas')
                    return obj.setEditor(c1);
                }

            }

            addChildPlate(dim, name) {
                if (!this.selectedPlate) {
                    return;
                }
                let p;
                if (dim === 384) {
                    p = new Plate(name, 24, 16)
                } else {
                    p = new Plate(name, 12, 8)
                }
                p.grid.xi = 0;
                p.grid.yi = this.selectedPlate.grid.yi - 2;
                p.grid.width = 1;
                p.grid.height = 1;
                return p;
            }

            addTrackFunction(wb) {
                this.trackFunctions.push(wb)
            }

            async exec() {
                this.transferFunctions.sort((xia, xib) => { return (xib.y - xia.y) });
                for (let t of this.transferFunctions) {
                    if (!t.complete) {
                        await t.exec();
                        t.complete = true;
                    }
                }
            }

            async execTrackFunctions() {
                this.trackFunctions.sort((xia, xib) => { return (xib.y - xia.y) });
                for (let t of this.trackFunctions) {
                    await t.exec(this);
                    t.complete = true;
                }
            }

            executeFrom(plate) {
                this.transferFunctions.sort((xia, xib) => { return (xib.y - xia.y) });
                let tf = this.getTransferFunctions(plate);
                for (let t of tf) {
                    t.exec();
                }
            }

            setMode(mode) {
                this.mode = mode;
                if (this.mode === 'dilution') {
                    this.layoutTool = new DilutionTool(this);
                }
            }
            getLayoutTool() {
                return this.layoutTool;
            }
            getMode() {
                return this.mode;
            }
            select(scx, scy) {
                this.grid.rescale();
                let x = this.grid.Xwc(scx);
                let y = this.grid.Ywc(scy);
            }

            searchByUid(uid) {

                if (uid === this.uid) {
                    return this;
                }

                let results = [];
                let searchPlatesAndWells = (plates) => {
                    for (let plate of plates) {

                        if (plate.uid === uid) {
                            results.push({ type: 'plate', object: plate });
                        }

                        for (let row of plate.wells) {
                            for (let well of row) {
                                if (well && well.uid === uid) {
                                    results.push({ type: 'well', object: well, parent: plate.uid });
                                }
                            }
                        }

                        if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                            searchPlatesAndWells(plate.plates);
                        }
                    }
                };

                let searchPlotsAndPoints = (plots) => {
                    for (let plot of plots) {

                        if (plot.uid === uid) {
                            results.push({ type: 'plot', object: plot });
                        }

                        for (let point of plot.scatterData.points) {
                            if (point.uid === uid) {
                                results.push({ type: 'point', object: point });
                            }
                        }
                    }
                };

                searchPlatesAndWells(this.root);
                searchPlotsAndPoints(this.m_plots);
                return results;
            }

            replace(newObject) {
                let uid = newObject.uid
                let results = [];
                let searchPlatesAndWells = (plates) => {
                    for (let plate of plates) {

                        if (plate.uid === uid) {
                            plate.buildFromJSON(newObject)
                        }

                        for (let row of plate.wells) {
                            for (let well of row) {
                                if (well && well.uid === uid) {
                                    plate.loadFromJSON(newObject)
                                }
                            }
                        }

                        if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                            searchPlatesAndWells(plate.plates);
                        }
                    }
                };

                let searchPlotsAndPoints = (plots) => {
                    for (let plot of plots) {

                        if (plot.uid === uid) {

                        }

                        for (let point of plot.scatterData.points) {
                            if (point.uid === uid) {

                            }
                        }
                    }
                };

                searchPlatesAndWells(this.root);

                return results;
            }

            selectReference(ref) {
                for (let r of ref) {
                    let rs = this.searchByUid(r)

                    for (let object of rs) {
                        if (object['object'].selectIt) {
                            object['object'].selectIt();
                        }
                    }
                }
            }

            zoomIntoObject(uid) {
                this.clearActionGlyphs();

                let varray = this.searchByUid(uid)
                if (varray != null && varray.length > 0) {
                    let v = varray[0]
                    if (varray[0].type === 'well') {
                        let plateo = this.getPlateWithUID(v.parent)
                        plateo.gotoWell(uid, this)
                    }
                }
            }

            async checkForSelections() {
                for (let plot of this.m_plots) {
                    let sel = plot.getSelectedPoints();
                    for (let s of sel) {
                        if (s.ref) {
                            this.selectReference(s.ref)
                        }
                    }
                }
            }
            drawVerticalScrollbar(ctx) {
                let ymin = Infinity
                let ymax = -Infinity
                let xmin = Infinity
                let xmax = -Infinity

                const updateBounds = (y) => {
                    if (y < ymin) ymin = y;
                    if (y > ymax) ymax = y;
                };
                const updateXBounds = (x) => {
                    if (x < xmin) xmin = x;
                    if (x > xmax) xmax = x;
                };







                for (let plate of this.root) {
                    updateBounds(plate.grid.yi);
                    updateBounds(plate.grid.yi + plate.grid.height);
                    updateXBounds(plate.grid.xi);
                    updateXBounds(plate.grid.xi + plate.grid.width);
                }

                for (let tf of this.transferFunctions) {
                    updateBounds(tf.y);

                }

                for (let tf of this.trackFunctions) {
                    updateBounds(tf.y);
                }

                for (let conn of this.connections) {
                    updateBounds(conn.y);
                }

                for (let plot of this.m_plots) {
                    if (plot.grid) {
                        updateBounds(this.grid.Ywc(plot.grid.yi));
                        updateBounds(this.grid.Ywc(plot.grid.yi + plot.grid.height));
                        updateXBounds(this.grid.Xwc(plot.grid.xi));
                        updateXBounds(this.grid.Xwc(plot.grid.xi + plot.grid.width));
                    }
                }

                for (let glyph of this.glyphs) {
                    updateBounds(glyph.y);
                    updateXBounds(glyph.x);

                }

                this.minObjectY = ymin;
                this.maxObjectY = ymax;
                minObjectX = xmin;
                maxObjectX = xmax;

                scrollbarHeight = ctx.canvas.height;
                scrollbarX = ctx.canvas.width - scrollbarWidth - 2;
                scrollGrid.ymin = this.minObjectY
                scrollGrid.ymax = this.maxObjectY
                scrollGrid.height = scrollbarHeight;
                scrollGrid.xi = scrollbarX;

                if (this.attr__showScrollbar && scrollGrid && ctx) {
                    scrollGrid.rescale();

                    const trackX = Number.isFinite(scrollGrid.xi) ? scrollGrid.xi : 0;
                    const trackY = Number.isFinite(scrollGrid.yi) ? scrollGrid.yi : 0;
                    const trackW = Number.isFinite(scrollGrid.width) && scrollGrid.width > 0 ? scrollGrid.width : 0;
                    const trackH = Number.isFinite(scrollGrid.height) && scrollGrid.height > 0 ? scrollGrid.height : 0;

                    if (trackW <= 0 || trackH <= 0) {
                        return;
                    }

                    const safeScrollY = Number.isFinite(scroll_y) ? scroll_y : 0;

                    let mappedY = trackY;
                    if (typeof scrollGrid.Y === 'function') {
                        try {
                            const candidate = scrollGrid.Y(safeScrollY);
                            if (Number.isFinite(candidate)) {
                                mappedY = candidate;
                            }
                        } catch (e) {

                        }
                    }

                    const rawThumbH = 20;
                    const thumbH = Math.max(4, Math.min(trackH, rawThumbH));
                    let thumbY = mappedY - thumbH / 2;

                    const minThumbY = trackY;
                    const maxThumbY = trackY + trackH - thumbH;
                    if (!Number.isFinite(thumbY)) {
                        thumbY = minThumbY;
                    } else {
                        thumbY = Math.min(Math.max(thumbY, minThumbY), maxThumbY);
                    }

                    ctx.save();

                    if (typeof ctx.roundRect !== 'function') {
                        ctx.roundRect = function (x, y, w, h, r) {
                            const radius = Math.max(0, Math.min(r || 0, Math.min(w, h) / 2));
                            this.beginPath();
                            this.moveTo(x + radius, y);
                            this.lineTo(x + w - radius, y);
                            this.quadraticCurveTo(x + w, y, x + w, y + radius);
                            this.lineTo(x + w, y + h - radius);
                            this.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
                            this.lineTo(x + radius, y + h);
                            this.quadraticCurveTo(x, y + h, x, y + h - radius);
                            this.lineTo(x, y + radius);
                            this.quadraticCurveTo(x, y, x + radius, y);
                            this.closePath();
                        };
                    }

                    let trackGradient = null;
                    try {
                        trackGradient = ctx.createLinearGradient(trackX, trackY, trackX + trackW, trackY);
                        trackGradient.addColorStop(0, '#d0e6f8');
                        trackGradient.addColorStop(1, '#b0d0e0');
                    } catch (e) {

                    }

                    ctx.fillStyle = trackGradient || '#c0d6e6';

                    ctx.beginPath();
                    ctx.roundRect(trackX, trackY, trackW, trackH, 6);
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    let thumbGradient = null;
                    try {
                        thumbGradient = ctx.createLinearGradient(trackX, thumbY, trackX, thumbY + thumbH);
                        thumbGradient.addColorStop(0, '#6ca8d9');
                        thumbGradient.addColorStop(1, '#3b6c93');
                    } catch (e) {

                    }
                    ctx.fillStyle = thumbGradient || '#4f7fa8';

                    const thumbX = trackX + 1;
                    const thumbW = Math.max(2, trackW - 2);

                    ctx.beginPath();
                    ctx.roundRect(thumbX, thumbY, thumbW, thumbH, 5);
                    ctx.fill();

                    ctx.shadowColor = 'rgba(0,0,0,0.25)';
                    ctx.shadowBlur = 6;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 2;

                    ctx.beginPath();
                    ctx.roundRect(thumbX, thumbY, thumbW, thumbH, 5);
                    ctx.fill();

                    ctx.restore();
                }

            }

            drawGrid(ctx, width, height) {
                ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
                ctx.lineWidth = 0.5;

                for (let x = 0; x <= width; x += 10) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }

                for (let y = 0; y <= height; y += 10) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }
            }

            drawNautilusShell(ctx, width, height) {
                const centerX = width / 2;
                const centerY = height / 2;

                const a = 10;
                const b = 0.2;

                ctx.strokeStyle = "rgba(10,10,50,0.08)";
                ctx.lineWidth = 1;
                ctx.clearRect(0, 0, width, height)
                ctx.beginPath();

                for (let theta = 0; theta < 10 * Math.PI; theta += 0.05) {
                    const r = a * Math.exp(b * theta);
                    const x = centerX + r * Math.cos(theta);
                    const y = centerY + r * Math.sin(theta);

                    if (theta === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }

                ctx.stroke();
            }

            drawTextBox(ctx, text, cursorPos, x, y, width, height, isSelected, style) {
                let styles = {
                    data: {
                        bgColor: 'lightCyan',
                        borderColor: 'purple',
                        textColor: 'yellow',
                        cursorColor: 'rgba(255,100,100,0.6)'
                    },
                    search: {
                        bgColor: isSelected ? 'rgba(255,255,150,0.9)' : 'rgba(255,255,100,0.9)',
                        borderColor: isSelected ? '#ffcc00' : '#999999',
                        textColor: isSelected ? '#333333' : '#888888',
                        cursorColor: 'rgba(255,100,100,0.6)'
                    }
                };

                let chosenStyle = styles[style] || styles.data;
                let bgColor = chosenStyle.bgColor;
                let borderColor = chosenStyle.borderColor;
                let textColor = chosenStyle.textColor;
                let cursorColor = chosenStyle.cursorColor;

                let radius = 10;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.fillStyle = bgColor;

                ctx.font = '11px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                let textWidth = ctx.measureText(text).width;

                if (textWidth + 20 > width) {
                    width = textWidth + 20;
                }

                drawRoundedRect(ctx, x, y, width, height, radius);
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.strokeStyle = borderColor;
                ctx.stroke();

                ctx.fillStyle = textColor;
                let textX = x + 10;
                let textY = y + height / 2;

                let canvasWidth = ctx.canvas.width;
                let canvasHeight = ctx.canvas.height;
                if (textX < 0) textX = 0;
                else if (textX + ctx.measureText(text).width > canvasWidth) {
                    textX = canvasWidth - ctx.measureText(text).width - 10;
                }
                if (textY < 0) textY = 0;
                else if (textY > canvasHeight) {
                    textY = canvasHeight - height / 2;
                }

                ctx.fillText(text, textX, textY);

                if (!isSelected && text && typeof text === 'string') {
                    let cursorX = textX + ctx.measureText(text.slice(0, cursorPos)).width;
                    ctx.beginPath();
                    ctx.moveTo(cursorX, textY - 10);
                    ctx.lineTo(cursorX, textY + 10);
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = cursorColor;
                    ctx.stroke();
                    ctx.strokeStyle = borderColor;
                }

                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            isTextActive() {
                return textActive;
            }
            setTextActive(v) {
                textActive = v;
            }

            findMinXCoordinate() {
                let minX = Infinity;

                for (const a of this.root) {
                    if (a?.grid?.xi !== undefined) {
                        minX = Math.min(minX, a.grid.xi);
                    }
                }

                for (const a of this.m_plots) {
                    if (a?.grid?.xi !== undefined) {
                        const worldXi = (a.grid.xi);
                        minX = Math.min(minX, worldXi);
                    }
                }

                return minX === Infinity ? null : minX;
            }

            findMaxXCoordinate() {
                let maxX = -Infinity;
                for (const a of this.root) {
                    if (a?.grid?.xi !== undefined && a?.grid?.width !== undefined) {
                        const rightEdge = a.grid.xi + a.grid.width;
                        maxX = Math.max(maxX, rightEdge);
                    }
                }
                for (const a of this.m_plots) {
                    if (a?.grid?.xi !== undefined && a?.grid?.width !== undefined) {
                        const rightEdge = (a.grid.xi) + this.grid.worldWidth(a.grid.width);
                        maxX = Math.max(maxX, rightEdge);
                    }
                }
                return maxX === -Infinity ? null : maxX;
            }
            findMinYCoordinate() {
                let minY = Infinity;

                for (const a of this.root) {
                    if (a?.grid?.yi !== undefined) {
                        minY = Math.min(minY, a.grid.yi);
                    }
                }

                for (const a of this.m_plots) {
                    if (a?.grid?.yi !== undefined) {
                        const worldYi = (a.grid.yi);
                        minY = Math.min(minY, worldYi);
                    }
                }

                return minY === Infinity ? null : minY;
            }
            findMaxYCoordinate() {
                let maxY = -Infinity;
                for (const a of this.root) {
                    if (a?.grid?.yi !== undefined && a?.grid?.height !== undefined) {
                        const bottomEdge = a.grid.yi + this.grid.worldHeight(a.grid.height);
                        maxY = Math.max(maxY, bottomEdge);
                    }
                }

                for (const a of this.m_plots) {
                    if (a?.grid?.yi !== undefined && a?.grid?.height !== undefined) {
                        const bottomEdge = a.grid.yi + this.grid.worldHeight(a.grid.height);
                        maxY = Math.max(maxY, bottomEdge);
                    }
                }

                return maxY === -Infinity ? null : maxY;
            }

            getPlateBoundingRectangle() {
                let minX = this.findMinXCoordinate();
                let maxX = this.findMaxXCoordinate();
                let minY = this.findMinYCoordinate();
                let maxY = this.findMaxYCoordinate();

                let width = maxX - minX;
                let height = maxY - minY;

                if (width > height) {
                    const diff = width - height;
                    minY -= diff / 2;
                    maxY += diff / 2;
                } else if (height > width) {
                    const diff = height - width;
                    minX -= diff / 2;
                    maxX += diff / 2;
                }

                if ([minX, maxX, minY, maxY].some(v => v === null)) {
                    return null;
                }

                return {
                    x: minX,
                    y: minY,
                    width: maxX - minX,
                    height: maxY - minY
                };
            }

            viewAll() {
                let r = this.getPlateBoundingRectangle();

                this.zoomto(r.x, r.y, r.width, r.height)
                this.fixedAspectRatio = 1;
            }

            resizePlatesToEqualizeCellSize() {
                for (let r of this.root) {
                    r.rescaleDimensions(this)
                }
            }

            adjustOverlappedObjects() {
                let allDrawables = [...(this.root || []), ...(this.m_plots || [])]
                function isOverlapping(grid1, grid2) {
                    return !(grid1.xi + grid1.width <= grid2.xi ||
                        grid2.xi + grid2.width <= grid1.xi ||
                        grid1.yi + grid1.height <= grid2.yi ||
                        grid2.yi + grid2.height <= grid1.yi);
                }
                const isOverlappingP = (grid1, grid2) => {
                    return !(this.grid.Xwc(grid1.xi) + this.grid.worldWidth(grid1.width) <= grid2.xi ||
                        grid2.xi + grid2.width <= this.grid.Xwc(grid1.xi) ||
                        this.grid.Ywc(grid1.yi) + this.grid.worldHeight(grid1.height) <= grid2.yi ||
                        grid2.yi + grid2.height <= this.grid.Ywc(grid1.yi));
                }
                const isOverlappingPP = (grid1, grid2) => {
                    let grid1X = this.grid.Xwc(grid1.xi);
                    let grid1Width = this.grid.worldWidth(grid1.width);
                    let grid1Y = this.grid.Ywc(grid1.yi);
                    let grid1Height = this.grid.worldHeight(grid1.height);

                    let grid2X = this.grid.Xwc(grid2.xi);
                    let grid2Width = this.grid.worldWidth(grid2.width);
                    let grid2Y = this.grid.Ywc(grid2.yi);
                    let grid2Height = this.grid.worldHeight(grid2.height);

                    return !(
                        grid1X + grid1Width <= grid2X ||
                        grid2X + grid2Width <= grid1X ||
                        grid1Y + grid1Height <= grid2Y ||
                        grid2Y + grid2Height <= grid1Y
                    );
                };

                const getSeparationVectorP = (grid1, grid2) => {
                    let grid1X = this.grid.Xwc(grid1.xi);
                    let grid1Width = this.grid.worldWidth(grid1.width);
                    let grid1Y = this.grid.Ywc(grid1.yi);
                    let grid1Height = this.grid.worldHeight(grid1.height);

                    let dx1 = grid2.xi - (grid1X + grid1Width);
                    let dx2 = (grid2.xi + grid2.width) - grid1X;
                    let dy1 = grid2.yi - (grid1Y + grid1Height);
                    let dy2 = (grid2.yi + grid2.height) - grid1Y;

                    if (dx1 > 0 || dx2 < 0 || dy1 > 0 || dy2 < 0) {

                        return { x: 0, y: 0 };
                    }

                    let xOffset = Math.abs(dx1) < Math.abs(dx2) ? dx1 : dx2;
                    let yOffset = Math.abs(dy1) < Math.abs(dy2) ? dy1 : dy2;

                    return Math.abs(xOffset) < Math.abs(yOffset) ? { x: xOffset, y: 0 } : { x: 0, y: yOffset };
                };

                const isOverlappingPlot_plate = (plot_grid, grid2) => {
                    let grid1X = this.grid.Xwc(plot_grid.xi);
                    let grid1Width = this.grid.worldWidth(plot_grid.width);
                    let grid1Y = this.grid.Ywc(plot_grid.yi);
                    let grid1Height = this.grid.worldHeight(plot_grid.height);
                    let grid2X = (grid2.xi);
                    let grid2Width = (grid2.width);
                    let grid2Y = (grid2.yi);
                    let grid2Height = (grid2.height);
                    return !(
                        grid1X + grid1Width <= grid2X ||
                        grid2X + grid2Width <= grid1X ||
                        grid1Y + grid1Height <= grid2Y ||
                        grid2Y + grid2Height <= grid1Y
                    );
                }

                const getVectorPlot_plate = (grid1, grid2) => {
                    let grid1X = this.grid.Xwc(grid1.xi);
                    let grid1Width = this.grid.worldWidth(grid1.width);
                    let grid1Y = this.grid.Ywc(grid1.yi);
                    let grid1Height = this.grid.worldHeight(grid1.height);

                    let grid2X = (grid2.xi);
                    let grid2Width = (grid2.width);
                    let grid2Y = (grid2.yi);
                    let grid2Height = (grid2.height);

                    let dx1 = grid2X - (grid1X + grid1Width);
                    let dx2 = (grid2X + grid2Width) - grid1X;
                    let dy1 = grid2Y - (grid1Y + grid1Height);
                    let dy2 = (grid2Y + grid2Height) - grid1Y;

                    if (dx1 > 0 || dx2 < 0 || dy1 > 0 || dy2 < 0) {

                        return { x: 0, y: 0 };
                    }

                    let xOffset = Math.abs(dx1) < Math.abs(dx2) ? dx1 : dx2;
                    let yOffset = Math.abs(dy1) < Math.abs(dy2) ? dy1 : dy2;

                    return Math.abs(xOffset) < Math.abs(yOffset) ? { x: xOffset, y: 0 } : { x: 0, y: yOffset };
                };

                function getSeparationVector(grid1, grid2) {
                    let dx1 = grid2.xi - (grid1.xi + grid1.width);
                    let dx2 = (grid2.xi + grid2.width) - grid1.xi;
                    let dy1 = grid2.yi - (grid1.yi + grid1.height);
                    let dy2 = (grid2.yi + grid2.height) - grid1.yi;

                    let xOffset = Math.abs(dx1) < Math.abs(dx2) ? dx1 : dx2;
                    let yOffset = Math.abs(dy1) < Math.abs(dy2) ? dy1 : dy2;

                    if (Math.abs(xOffset) < Math.abs(yOffset)) {
                        return { x: xOffset, y: 0 };
                    } else {
                        return { x: 0, y: yOffset };
                    }
                }

                let maxIterations = allDrawables.length * 20;
                let iterations = 0;
                let adjusted = true;

                while (adjusted && iterations < maxIterations) {
                    adjusted = false;
                    iterations++;

                    for (let i = 0; i < allDrawables.length; i++) {
                        for (let j = 0; j < allDrawables.length; j++) {

                            if ((allDrawables[i].typeof && allDrawables[i].typeof === 'plot') ||
                                (allDrawables[j].typeof && allDrawables[j].typeof === 'plot')) {

                            } else {
                                if (i !== j && isOverlapping(allDrawables[i].grid, allDrawables[j].grid)) {
                                    let move = getSeparationVector(allDrawables[i].grid, allDrawables[j].grid);
                                    let objectA = allDrawables[i];
                                    let objectB = allDrawables[j];

                                    objectA.grid.xi += move.x / 2;

                                    objectB.grid.xi -= move.x / 2;

                                    if (objectA.x) objectA.x = objectA.grid.xi;
                                    if (objectA.y) objectA.y = objectA.grid.yi;
                                    if (objectB.x) objectB.x = objectB.grid.xi;
                                    if (objectB.y) objectB.y = objectB.grid.yi;

                                    adjusted = true;
                                }
                            }
                        }
                    }
                }
            }
            pindex = 0;

            getVisiblePlots() {
                return this.m_plots.filter(obj => {
                    const { xi, yi, width, height } = obj.grid;

                    return (
                        xi + width > 0 &&
                        yi + height > 0 &&
                        xi < this.grid.width &&
                        yi < this.grid.height
                    );
                });
            }

            panGridSlide(direction, opts = {}) {
                const canvas = this.__canvas__;
                if (!canvas) throw new Error("Canvas not found; provide this.__canvas__.");

                if (this.__panRaf__) {
                    cancelAnimationFrame(this.__panRaf__);
                    this.__panRaf__ = null;
                }

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

                const wx0 = this.grid.Xwc(sx0);
                const wy0 = this.grid.Ywc(sy0);
                const wx1 = this.grid.Xwc(sx0 + dxScreen);
                const wy1 = this.grid.Ywc(sy0 + dyScreen);
                const dxWorld = wx1 - wx0;
                const dyWorld = wy1 - wy0;

                const xmin0 = this.grid.getxmin();
                const ymin0 = this.grid.getymin();
                const xmax0 = this.grid.getxmax();
                const ymax0 = this.grid.getymax();

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

                    this.grid.setxmin(xmin);
                    this.grid.setxmax(xmax);
                    this.grid.setymin(ymin);
                    this.grid.setymax(ymax);
                    this.grid.rescale();

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

            _drawBlurryBubble(
                ctx,
                cx,
                cy,
                text,
                {
                    font = '20px Arial',
                    padX = 16,
                    padY = 10,
                    radius = 1,
                    blurPx = 1,
                    baseFill = 'rgba(255,255,255,0.6)',
                    blurFill = 'rgba(255,255,255,0.9)',
                    stroke = 'rgba(0,0,0,0.10)',
                    textFill = 'navy',
                    glowColor = 'rgba(0,0,0,0.25)',
                } = {}
            ) {
                ctx.save();

                const prevFont = ctx.font;
                const prevAlign = ctx.textAlign;
                const prevBaseline = ctx.textBaseline;

                ctx.font = font;

                const m = ctx.measureText(text);
                const ascent = m.actualBoundingBoxAscent || 16;
                const descent = m.actualBoundingBoxDescent || 6;
                const textH = ascent + descent;
                const textW = Math.max(2, m.width);

                const x = cx - (textW / 2) - padX;
                const y = cy - (textH / 2) - padY;
                const w = textW + padX * 2;
                const h = textH + padY * 2;

                const tr = ctx.getTransform();
                const scale = Math.hypot(tr.a, tr.b) || 1;
                const blurComp = blurPx / scale;
                const lineW = 1 / scale;

                const X = Math.round(x);
                const Y = Math.round(y);
                const W = Math.round(w);
                const H = Math.round(h);
                const CX = Math.round(cx);
                const CY = Math.round(cy);

                const r = Math.min(radius, Math.min(W, H) * 0.5);
                const roundRect = () => {
                    ctx.beginPath();
                    ctx.moveTo(X + r, Y);
                    ctx.lineTo(X + W - r, Y);
                    ctx.quadraticCurveTo(X + W, Y, X + W, Y + r);
                    ctx.lineTo(X + W, Y + H - r);
                    ctx.quadraticCurveTo(X + W, Y + H, X + W - r, Y + H);
                    ctx.lineTo(X + r, Y + H);
                    ctx.quadraticCurveTo(X, Y + H, X, Y + H - r);
                    ctx.lineTo(X, Y + r);
                    ctx.quadraticCurveTo(X, Y, X + r, Y);
                    ctx.closePath();
                };

                ctx.save();
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = Math.max(8, 18 / scale);
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.fillStyle = 'rgba(0,0,0,0)';
                roundRect();
                ctx.fill();
                ctx.restore();

                ctx.filter = `blur(${blurComp}px)`;
                ctx.fillStyle = blurFill;
                roundRect();
                ctx.fill();

                ctx.filter = 'none';
                ctx.fillStyle = baseFill;
                roundRect();
                ctx.fill();

                if (stroke) {
                    ctx.strokeStyle = stroke;
                    ctx.lineWidth = lineW;
                    roundRect();
                    ctx.stroke();
                }

                ctx.shadowColor = 'rgba(0,0,0,0)';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = textFill;
                ctx.fillText(text, CX, CY);

                ctx.font = prevFont;
                ctx.textAlign = prevAlign;
                ctx.textBaseline = prevBaseline;
                ctx.restore();
            }

            async addPlateUsingJSONModel(data) {

                const platetrack = this;

                const Plate = await exec('baja/plate/plate.js');
                const GenericWell = await exec('baja/plate/well.js');

                const WELL_SCREEN_WIDTH = 120;
                const WELL_SCREEN_HEIGHT = 24;

                const coerce = (v) => {
                    if (typeof v === 'number' || v === null || v === undefined || typeof v === 'boolean') return v;
                    const s = String(v);
                    if (/[0-9].*[-/\.].*[0-9]/.test(s)) return s;
                    if (/^[+-]?\d+(\.\d+)?$/.test(s)) return Number(s);
                    return v;
                };

                function sizeGrid(plate, cols, rows) {
                    plate.grid.xmin = 0;
                    plate.grid.ymin = 0;
                    plate.grid.xmax = Math.max(1, cols);
                    plate.grid.ymax = Math.max(1, rows);
                    plate.grid.width = platetrack.grid.worldWidth(plate.grid.xmax * WELL_SCREEN_WIDTH);
                    plate.grid.height = platetrack.grid.worldHeight(plate.grid.ymax * WELL_SCREEN_HEIGHT);
                    plate.grid.yi = platetrack.grid.Ywc(100) - plate.grid.height;
                    plate.grid.rescale?.();
                }

                function setCell(plate, c, r, val) {
                    const w = plate.wells?.[c]?.[r];
                    if (!w) return;
                    if (typeof w.setValue === 'function') w.setValue(val);
                    else w.value = val;
                }

                const created = [];

                for (const spec of data.table_specs) {
                    const name = spec.name || 'Table';
                    const columns = Array.isArray(spec.columns) && spec.columns.length ? spec.columns : ['Label', 'Value'];
                    const rowsData = Array.isArray(spec.rows) ? spec.rows : [];

                    const totalCols = columns.length;
                    const totalRows = rowsData.length + 1;

                    const xi = 0;
                    const yi = 0;
                    const xf = Math.max(0, totalCols - 1);
                    const yf = Math.max(0, totalRows - 1);

                    const plate = new Plate(name, 1, 1);
                    plate.last_touched = new Date();
                    plate.setPreferences?.('showInputs', true);
                    plate.range = { xi, xf, yi, yf };

                    plate.wells = [];
                    for (let c = xi; c <= xf; c++) {
                        const col = [];
                        for (let r = yi; r <= yf; r++) {
                            const label = `${String.fromCharCode(65 + (c - xi))}${(r - yi) + 1}`;
                            col[r] = new GenericWell(label);
                        }
                        plate.wells[c] = col;
                    }

                    sizeGrid(plate, xf - xi + 1, yf - yi + 1);

                    for (let c = xi; c <= xf; c++) {
                        setCell(plate, c, yi, columns[c - xi]);
                    }

                    for (let i = 0; i < rowsData.length; i++) {
                        const rowObj = rowsData[i] || {};
                        const r = yi + 1 + i;
                        for (let c = xi; c <= xf; c++) {
                            const key = columns[c - xi];
                            setCell(plate, c, r, coerce(rowObj[key]));
                        }
                    }

                    if (plate?.wells?.[xi]?.[yi]) plate.wells[xi][yi].value = plate.name;

                    platetrack.addNextAvailableX(plate);
                    plate.applycolumnheaders?.();
                    plate.applyrowheaders?.();

                    created.push(plate);
                }

                return created;
            }

            __swipe = false;
            draw(ctx) {


                if (!ctx && !ctx.canvas) {
                    return;
                }


                if (!MSGraph.isLoggedIn()) {
                    if (!__leaving_for_signup) {
                        setTimeout(() => {
                            setTimeout(() => {
                                __leaving_for_signup = true;
                                signup();
                            }, 25000)
                        }, 300000)

                    }
                }

                if (!this.__swipe) {
                    captureSwipes(ctx.canvas, (direction) => {
                        if (this.wbid === "override-box")
                            return;

                        this.panGridSlide(direction, { fromScreen: { x: this.grid.width / 2, y: this.grid.height / 2 } })
                        setTimeout(() => {

                            let obj = this.getNextObjectInDirection(direction, { fromScreen: { x: this.grid.width / 2, y: this.grid.height / 2 } })

                            if (obj && obj.wells) {
                                this.center(obj)
                            } else {
                                this.center(obj)
                            }

                        }, 100)
                    });
                    this.__swipe = true;
                }
                if (ctx.canvas)
                    this.__canvas__ = ctx.canvas;




                const selected_objects = this.getSelectedWells();
                if (selected_objects.length > 0 && ___previous_selected_objects !== selected_objects.length) {
                    ___previous_selected_objects = selected_objects.length;
                    this.showSideMenu([
                        {
                            'label': 'Deselect Cells (' + selected_objects.length + ')', click: () => {
                                setTimeout(() => {
                                    this.showSideMenu(null);
                                    this.deselectAll();
                                }, 50)
                            }
                        }
                    ])
                }






                if (this.__canvas__ && this.menu && this.menu.getItemsPerColumn) {
                    let screenMenuWidth = this.menu.menu_width * this.menu.columns + 20 * (this.menu.columns - 1);
                    let itemsPerColumn = this.menu.getItemsPerColumn();
                    let screenMenuHeight = itemsPerColumn * this.menu.mheight;

                    let x_screen_coordinate = this.__canvas__.width / 2 - screenMenuWidth / 2;
                    let y_screen_coordinate = this.__canvas__.height / 2 - screenMenuHeight;

                    this.menu.x = this.grid.Xwc(x_screen_coordinate);
                    this.menu.y = this.grid.Ywc(y_screen_coordinate);
                }
                this.pindex++;
                this.pindex = 0;
                if (!sharedObjectListeners || Object.keys(sharedObjectListeners).length === 0) {
                    if (this.owner === getUser()) {
                    }
                    sharedObjectListeners[this.uid] = (data) => {
                        const dstate = (data.state)
                        if (dstate.owner === getUser()) {
                            return;
                        }
                        let objects = this.searchByUid(dstate.uid)
                        if (objects && objects.length > 0) {
                            for (let object of objects) {
                                reconstituteObject(object.object, dstate)
                            }
                        }
                    }

                }

                if (this.isMobile) {
                    let _width = this.grid.width;
                    let _height = this.grid.height;

                    const _gridAspectRatio = Math.abs(_width / _height);

                    const _isClose = (a, b, epsilon = 0.01) => Math.abs(a - b) < epsilon;
                    const _targetAspectRatio = 2.5;

                    if (!_isClose(_gridAspectRatio, _targetAspectRatio)) {
                        if (_gridAspectRatio > _targetAspectRatio) {

                            _width = _height * _targetAspectRatio;
                        } else {

                            _height = _width / _targetAspectRatio;
                        }

                        this.grid.width = 1920;
                        this.grid.height = 1200;
                    }
                } else {
                    this.grid.width = this.__canvas__.width;
                    this.grid.height = this.__canvas__.height;
                }
                this.grid.rescale();
                this.defaultWellHeightSc = this.grid.worldHeight(24)
                this.defaultWellWidthSc = this.grid.worldWidth(120)
                if (this.___selected_well_listener && this.selected_well && this.selectedPlate && this.selectedPlate.getSelectedWellsInOrder) {








                    this.___selected_well_listener(this.selectedPlate.getSelectedWellsInOrder())
                }





                if (ctx != null && ctx != undefined) {
                    if (this.background_function) {
                        try {
                            this.background_function(ctx)
                        } catch (exception) {
                            let str = exception.message;
                            if (typeof str !== 'string') return '';
                            str = str.trim();
                            const match = str.match(/^\S+/);
                            if (match && match[0]) {
                                try {
                                    this.background_function = scenes[match[0]]
                                    this.background_function(ctx)
                                } catch (exception2) {
                                    this.background_function = null;
                                }
                            }

                        }

                    } else {

                    }

                    if (this.attr__showGrid)
                        this.drawGrid(ctx, ctx.canvas.width, ctx.canvas.height)





                    this.updatePlots();

                    const now = Date.now();

                    if (this.attr__AutoRunCalculation) {
                        if (!this._lastUpdateTime) {
                            this._lastUpdateTime = now;
                        }
                        if (now - this._lastUpdateTime >= 5000) {
                            this.updateCalculations();
                            this.updatePlots();
                            this._lastUpdateTime = now;
                        }
                    }

                    try {
                        if (this.attr__autoSave) {
                            if (!this._lastAutoSaveTime) {
                                this._lastAutoSaveTime = now;
                            }
                            let lastPushTime = getLastHistoryPushTime();

                            if (!lastPushTime) {
                                lastPushTime = new Date(now);
                            }

                            const lastPushMillis = lastPushTime;
                            const lastSaveMillis = this._lastAutoSaveTime;
                            if (lastPushMillis > lastSaveMillis) {
                                if (now - this._lastAutoSaveTime >= 15000) {

                                }
                            } else {

                            }
                        }

                        if (!this.owner) {
                            this.owner = getUser();
                        }
                    } catch (exception) {
                        console.log("Failed to update share status");
                    }

                    if (this.formulas && Object.keys(this.formulas).length > 0 && this.attr__drawFormulaConnections) {
                        let keys = Object.keys(this.formulas);
                        for (let k of keys) {
                            try {
                                const from = extractTableNames(k)[0];
                                const fromtable = this.getTableByName(from);
                                const tolist = extractTableNames(this.formulas[k]);

                                const formula_t = this.formulas[k]
                                for (let t of tolist) {
                                    const totable = this.getTableByName(t);
                                    drawArrow__tables(ctx, fromtable, totable, this.grid, t);
                                }
                            } catch (exception) {
                                console.log("Formula error " + exception);
                            }
                        }
                    }

                    this.checkForSelections();

                    let xmax = this.grid.xmax;
                    let xmin = this.grid.xmin;
                    let ymax = this.grid.ymax;
                    let ymin = this.grid.ymin;

                    let xRange = xmax - xmin;
                    let yRange = ymax - ymin;

                    this.fixedAspectRatio = 1;

                    if (this.fixedAspectRatio) {
                        const aspect = this.fixedAspectRatio;
                        const centerX = (xmax + xmin) / 2;
                        const centerY = (ymax + ymin) / 2;

                        const currentXRange = xmax - xmin;
                        const currentYRange = ymax - ymin;

                        const currentAspect = currentXRange / currentYRange;

                        if (currentAspect > aspect) {

                            const newYRange = currentXRange / aspect;
                            ymin = centerY - newYRange / 2;
                            ymax = centerY + newYRange / 2;
                        } else if (currentAspect < aspect) {

                            const newXRange = currentYRange * aspect;
                            xmin = centerX - newXRange / 2;
                            xmax = centerX + newXRange / 2;
                        }
                    }
                    else {
                        if (xRange > yRange) {

                            const centerY = (ymax + ymin) / 2;
                            ymin = centerY - xRange / 2;
                            ymax = centerY + xRange / 2;
                        } else {

                            const centerX = (xmax + xmin) / 2;
                            xmin = centerX - yRange / 2;
                            xmax = centerX + yRange / 2;
                        }
                    }

                    const xRangeFinal = xmax - xmin;
                    const yRangeFinal = ymax - ymin;

                    if (yRangeFinal <= 0) {

                        const epsilon = 1e-6;
                        const centerY = (ymax + ymin) / 2;
                        ymin = centerY - epsilon;
                        ymax = centerY + epsilon;
                    }

                    // this.grid.xmin = xmin;
                    // this.grid.xmax = xmax;
                    // this.grid.ymin = ymin;
                    // this.grid.ymax = ymax;
                    this.grid.rescale();

                    ctx.fillStyle = "black";
                    ctx.strokeStyle = "rgba(169, 215, 253, 0.1)";
                    ctx.lineWidth = 1;
                    const fontSize = 15;
                    ctx.font = `${fontSize}px Arial`;
                    ctx.textAlign = "left";
                    ctx.fillStyle = "black";





                    if (this.attr__displayEvents) {
                        const textList = LJScript.getEvents().slice(-10);
                        const numRows = textList.length;
                        const fontSize = 15;
                        const startY = this.grid.height / 6;
                        ctx.font = `${fontSize}px Arial`;
                        ctx.textAlign = "center";
                        ctx.fillStyle = "white";

                        for (let i = 0; i < textList.length; i++) {
                            let y = startY + i * fontSize * 1.2 + 300;
                            let alpha = getFadeAlpha(i, numRows);
                            ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
                            ctx.fillText(textList[i], 150, y);
                        }
                    }

                    const drawObj = (obj) => {
                        if (obj.drawPlot) {
                            obj.drawPlot(this, ctx);
                        } else if (obj.draw) {
                            obj.draw(this, ctx);
                            this.drawFormulaDependencyArrows(obj, ctx, this.grid);
                            this.drawFormulaReverseDependencyArrows(obj, ctx, this.grid)
                        }
                    };

                    const nonGlyphObjects = [
                        ...this.root,
                        ...this.m_plots
                    ].filter(obj => obj);
                    const glyphObjects = this.glyphs.filter(obj => obj);
                    for (let fromtable of [...nonGlyphObjects, ...glyphObjects]) {
                        if (fromtable.input_to && fromtable.input_to.length > 0) {
                            for (let uid of fromtable.input_to) {
                                let totable = this.getPlateWithUID(uid);
                                if (totable) {
                                    drawArrow(ctx, fromtable, totable, this.grid, ' ');
                                }
                            }
                        }
                    }

                    if (isMobile() && this.mode && this.mode === 'viewer' && nonGlyphObjects && nonGlyphObjects.length === 1) {
                        if (nonGlyphObjects[0].isMaximized && !nonGlyphObjects[0].isMaximized()) {
                            nonGlyphObjects[0].setMaximized(true)
                        }
                    }
                    const index = nonGlyphObjects.indexOf(this.selectedPlate);
                    if (index !== -1) {
                        const [selected] = nonGlyphObjects.splice(index, 1);
                        nonGlyphObjects.push(selected);
                    }
                    nonGlyphObjects.sort((a, b) => {
                        const aBg = a.isBackground ? 0 : 1;
                        const bBg = b.isBackground ? 0 : 1;
                        return aBg - bBg;
                    });

                    const allObjects = [...nonGlyphObjects, ...glyphObjects];

                    for (let obj of allObjects) {
                        this.drawPackageExportParentLine(obj, ctx);
                        drawObj(obj);
                    }

                    if (!isMobile()) {
                        if (this.__stack && this.__stack.length > 0) {
                            if (!this.__stack_menu || !this.__stack_menu.draw) {
                                this.__stack = [];
                                this.__redostack = [];
                            } else {

                            }
                        }

                        if (this.__redostack && this.__redostack.length > 0) {
                            this.__redo_stack_menu.x = this.grid.Xwc(10);
                            if (this.__stack && this.__stack.length > 0) {

                            }
                        }

                        if (this.menu_plate) {
                            this.menu_plate.x = this.grid.Xwc(10);
                            this.menu_plate.y = this.grid.Ywc(10);
                            this.menu_plate.draw(ctx, this.grid);
                        }

                        if (this.attr__displayBookMarks) {
                            this.buildBookmarkMenu();
                            this.__bookmark_menu.menu_width = 120;
                            this.__bookmark_menu.x = this.grid.Xwc(2);
                            this.__bookmark_menu.y = this.grid.Ywc(70);
                            this.__bookmark_menu.draw(ctx, this.grid);

                            if (___firsttime) {

                            }

                        } else
                            if (this.__tables_menu && this.__tables_menu.draw && this.attr__showTablesMenu) {
                                this.__tables_menu.list = this.generateTables();

                                this.__tables_menu.x = this.grid.Xwc(2);
                                this.__tables_menu.y = this.grid.Ywc(70);
                                this.__tables_menu.draw(ctx, this.grid);
                            } else if (this.attr__showTablesMenu) {
                                let m = this.generateTables();
                                let cols = Math.ceil(m.length / 10);
                                this.__tables_menu = new Menu(m, 0, 40, 'rgb(205, 255, 155)', 'navy', cols)

                                this.__tables_menu.x = this.grid.Xwc(2);
                                this.__tables_menu.y = this.grid.Ywc(70);
                                this.__tables_menu.draw(ctx, this.grid);

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

                            // menuToDraw.x = this.grid.Xwc(100);
                            // menuToDraw.y = this.grid.Ywc(100);

                            _applySideMenuBgAlpha(this, fadeState.alpha);
                            if (fadeState.alpha > 0.001 && menuToDraw.draw) {
                                menuToDraw.draw(ctx, this.grid);
                            }
                            if (!presentNow && fadeState.alpha <= 0.001) {
                                this.__last_side_menu_ref = null;
                            }
                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'black';
                        }




                    }

                    if (this.activePlot) {
                        this.activePlot.drawPlot(this.grid, ctx, this.activePlot.grid);
                    }
                    ctx.fillStyle = 'black'

                    if (this.msgType === 10 && this.__msgc) {
                        const centerX = this.grid.xi + this.grid.width / 2;
                        const centerY = this.grid.yi + this.grid.height / 2;
                        sprite = new FinancialCalcSpriteWithStatus(centerX - 18, centerY - 18, 1, {
                            messages: [
                                this.__msgc
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

                    if (this.___imageCaptureRect) {
                        this.___imageCaptureRect.draw(ctx)
                    }

                    if (this.__msgb) {
                        const text = this.__msgb;
                        const font = '20px Arial';
                        const msgX = ctx.canvas.width / 2;
                        const msgY = 40;



                        this._drawBlurryBubble(ctx, msgX, msgY, text, {
                            font,
                            padX: 20,
                            padY: 12,
                            radius: 10,
                            blurPx: 12,
                            baseFill: 'rgba(57, 49, 78, 0.97)',
                            blurFill: 'rgba(255,255,255,0.9)',
                            stroke: 'rgb(163, 0, 109)',
                            textFill: 'yellow',
                            align: 'center',
                            baseline: 'middle'
                        });
                    } else
                        if (this.__msgc) {

                            const text = this.__msgc;
                            const font = '20px Arial';
                            const msgX = ctx.canvas.width / 2;
                            const msgY = 40;

                            this._drawBlurryBubble(ctx, msgX, msgY, text, {
                                font,
                                padX: 18,
                                padY: 8,
                                radius: 10,
                                blurPx: 10,
                                baseFill: 'rgba(255,255,255,0.45)',
                                blurFill: 'rgba(255,255,255,0.85)',
                                stroke: 'rgba(0,0,0,0.10)',
                                textFill: 'black',
                                align: 'center',
                                baseline: 'top'
                            });
                        }
                        else
                            if (this.__msg) {

                                const text = this.__msg;
                                const font = '20px Arial';
                                const msgX = ctx.canvas.width / 2;
                                const msgY = 40;

                                this._drawBlurryBubble(ctx, msgX, msgY, text, {
                                    font,
                                    padX: 18,
                                    padY: 8,
                                    radius: 10,
                                    blurPx: 10,
                                    baseFill: 'rgba(255,255,255,0.45)',
                                    blurFill: 'rgba(255,255,255,0.85)',
                                    stroke: 'rgba(0,0,0,0.10)',
                                    textFill: 'black',
                                    align: 'center',
                                    baseline: 'top'
                                });
                            }

                    if (sprite && sprite === 5) {

                        const centerX = this.grid.xi + this.grid.width / 2;
                        const centerY = this.grid.yi + this.grid.height / 2;
                        sprite = new FinancialCalcSpriteWithStatus(centerX - 18, centerY - 18, 1, {
                            messages: [
                                "Engine vLJ18.908e4b (1min)",
                                "crunching more numbers...",
                                "Can take up to 2 min",
                                "Normalizing distributions...",
                                "Activating recurrent memory units...",
                                "Synchronizing distributed nodes...",
                                "Simulating inference pathways...",
                                "Generating model...",
                                "Testing robustness...",
                                "Compressing model checkpoints...",
                                "Validating accuracy across benchmarks...",
                                "Mapping semantic relationships...",
                                "Aligning multi-modal embeddings...",
                                "Finalizing inference graph...",
                                "Rendering AI output pipelines...",
                                "Model build complete"
                            ]
                            ,
                            showTimer: true,
                            timerPrefix: 'Elapsed',
                            timerOffsetY: 36,
                            messageMinDelay: 1,
                            messageMaxDelay: 4,
                            onAllMessagesShown: () => console.log("All status messages displayed.")
                        });
                    }

                    if (sprite && sprite.update) {
                        sprite.update(0.05);
                        sprite.draw(ctx);
                        return
                    }

                    if (this.actionGlyph) {
                        for (const _a of this.actionGlyph) {
                            _a.draw(this, ctx);
                        }
                    }

                    if (__menu_pointer && !isMobile() && this.attr__ShowHelpMessages) {
                        const text = __menu_pointer;
                        const msgX = 100;
                        const msgY = 52;
                        const padding = 20;
                        const radius = 10;

                        ctx.font = "bold 14px 'Segoe UI', Arial, sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";

                        const metrics = ctx.measureText(text);
                        const textWidth = metrics.width;
                        const textHeight = 14;

                        const rectX = msgX - textWidth / 2 - padding / 2;
                        const rectY = msgY - textHeight / 2 - padding / 2;
                        const rectWidth = textWidth + padding;
                        const rectHeight = textHeight + padding;

                        const boxColor = "transparent";
                        const textColor = "#7351eeff";
                        const borderColor = "#7351eeff";
                        const shadowColor = "rgba(0, 0, 0, 0.2)";

                        const triangleHeight = 10;
                        const triangleHalfWidth = 8;
                        const stemHeight = 8;
                        const stemWidth = 4;

                        const arrowTipX = msgX;
                        const arrowTipY = rectY - triangleHeight - stemHeight;

                        ctx.save();
                        ctx.shadowColor = shadowColor;
                        ctx.shadowBlur = 2;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                        ctx.fillStyle = boxColor;
                        ctx.strokeStyle = borderColor;
                        ctx.lineWidth = 2;

                        ctx.beginPath();
                        ctx.moveTo(arrowTipX, arrowTipY);
                        ctx.lineTo(arrowTipX - triangleHalfWidth, arrowTipY + triangleHeight);
                        ctx.lineTo(arrowTipX + triangleHalfWidth, arrowTipY + triangleHeight);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.rect(
                            arrowTipX - stemWidth / 2,
                            arrowTipY + triangleHeight,
                            stemWidth,
                            stemHeight
                        );
                        ctx.fill();
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(rectX + radius, rectY);
                        ctx.lineTo(rectX + rectWidth - radius, rectY);
                        ctx.quadraticCurveTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + radius);
                        ctx.lineTo(rectX + rectWidth, rectY + rectHeight - radius);
                        ctx.quadraticCurveTo(rectX + rectWidth, rectY + rectHeight, rectX + rectWidth - radius, rectY + rectHeight);
                        ctx.lineTo(rectX + radius, rectY + rectHeight);
                        ctx.quadraticCurveTo(rectX, rectY + rectHeight, rectX, rectY + rectHeight - radius);
                        ctx.lineTo(rectX, rectY + radius);
                        ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();

                        ctx.restore();

                        ctx.fillStyle = textColor;
                        ctx.fillText(text, msgX, msgY);
                    }

                    if (this.menu && this.menu_vis && !isMobile()) {
                        if (!this.menu.list || this.menu.list.length <= 0) {
                            this.menu_vis = false;
                            this.menu
                        } else {

                            if (!this.__offscreen__) {
                                this.__offscreen__ = document.createElement('canvas');
                            }

                            const off = this.__offscreen__;
                            off.width = ctx.canvas.width;
                            off.height = ctx.canvas.height;

                            const octx = off.getContext('2d');
                            octx.clearRect(0, 0, off.width, off.height);
                            octx.drawImage(ctx.canvas, 0, 0);

                            ctx.save();
                            ctx.filter = 'blur(1px)';
                            ctx.drawImage(off, 0, 0);
                            ctx.restore();

                            ctx.save();
                            ctx.filter = 'none';
                            ctx.fillStyle = 'rgba(255,255,255,0.30)';
                            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                            ctx.restore();

                            this.menu.draw(ctx, this.grid);
                        }
                    } else {
                        ctx.filter = 'none';
                    }



                    if (this.options_menu) {
                        let ___x = this.grid.Xwc(this.grid.xi + 20);
                        let ___y = this.grid.Ywc(this.grid.yi + 20);
                        this.options_menu.x = ___x;
                        this.options_menu.y = ___y;
                        this.options_menu.draw(ctx, this.grid);
                    }

                    if (!isMobile() && this.attr__showScrollbar) {
                        this.drawVerticalScrollbar(ctx);
                    }

                    if (textActive) {
                        ctx.fillStyle = 'rgba(255,255,255,0.83)';
                        ctx.fillRect(this.grid.xi, this.grid.yi, this.grid.width, this.grid.height);

                        const centerX = this.grid.xi + this.grid.width / 2;
                        const centerY = this.grid.yi + this.grid.height / 2;

                        const textBoxX = centerX - textBoxWidth / 2;
                        const textBoxY = centerY - textBoxHeight / 2;

                        this.drawTextBox(ctx, text, cursorPos, textBoxX, textBoxY, textBoxWidth,
                            textBoxHeight, selectText, textStyle);
                    }

                }

            }

            newTable(table_name) {
                this.unModal();
                text = table_name;
                textActive = true;
                initBox = true;
                cursorPos = text.length;
            }

            killSprite() {
                sprite = null;
                this.actionGlyph = [];
            }
            getNearestEdgePoint(fromPlate, toPlate) {
                const a = fromPlate.grid;
                const b = toPlate.grid;

                const acx = a.xi + a.width / 2;
                const acy = a.yi + a.height / 2;
                const bcx = b.xi + b.width / 2;
                const bcy = b.yi + b.height / 2;

                const dx = bcx - acx;
                const dy = bcy - acy;

                const halfW = a.width / 2;
                const halfH = a.height / 2;

                if (dx === 0 && dy === 0) {
                    return { x: acx, y: acy };
                }

                const scale = Math.min(
                    Math.abs(halfW / dx),
                    Math.abs(halfH / dy)
                );

                return {
                    x: acx + dx * scale,
                    y: acy + dy * scale
                };
            }

            drawPackageExportParentLine(plate, ctx) {
                if (!plate) return;
                if (plate.plateType !== "package-export") return;
                if (!plate.parent_reference) return;

                const parent = this.getPlateWithUID?.(plate.parent_reference);
                if (!parent || !parent.grid || !plate.grid) return;

                const from = this.getNearestEdgePoint(plate, parent);
                const to = this.getNearestEdgePoint(parent, plate);

                drawArrow(
                    ctx,
                    this.grid.X(from.x),
                    this.grid.Y(from.y),
                    this.grid.X(to.x),
                    this.grid.Y(to.y),
                    {
                        color: "lightGray",
                        lineWidth: 3,
                        headLength: 18,
                        headWidth: 14,
                        shadowBlur: 3,
                        shadowColor: "rgba(0,0,0,0.15)"
                    }
                );
            }
            updateSprite(_msg) {

                this.actionGlyph = [];

                if (!sprite) {
                    const centerX = this.grid.xi + this.grid.width / 2;
                    const centerY = this.grid.yi + this.grid.height / 2;
                    sprite = new FinancialCalcSpriteWithStatus(centerX - 18, centerY - 18, 1, {
                        messages: [
                            "Bootstrapping AI engine v" + (Math.random() * 100).toFixed(2),
                            "Finalizing inference graph...",
                            "Rendering AI output pipelines...",
                            "Model build complete"
                        ]
                        ,
                        showTimer: true,
                        timerPrefix: 'Elapsed',
                        timerOffsetY: 36,
                        messageMinDelay: 1,
                        messageMaxDelay: 45,
                        onAllMessagesShown: () => console.log("All status messages displayed.")

                    })
                }
            }

            setMessage(_msg, msgType) {

                this._msgTimers = this._msgTimers || {};

                const clearTimer = (key) => {
                    if (this._msgTimers[key]) {
                        clearTimeout(this._msgTimers[key]);
                        this._msgTimers[key] = null;
                    }
                };

                if (msgType === 1) {
                    this.__msgb = _msg;
                    clearTimer("msgb");
                    this._msgTimers.msgb = setTimeout(() => {
                        this.__msgb = null;
                        this._msgTimers.msgb = null;
                    }, 5000);

                } else
                    if (msgType === 1.1) {
                        this.__msgb = _msg;
                        clearTimer("msgb");
                        this._msgTimers.msgb = setTimeout(() => {
                            this.__msgb = null;
                            this._msgTimers.msgb = null;
                        }, 10000);

                    } else if (msgType === 2) {
                        this.__msgc = _msg;
                        clearTimer("msgc");
                        this._msgTimers.msgc = setTimeout(() => {
                            this.__msgc = null;
                            this._msgTimers.msgc = null;
                        }, 3500);

                    } else if (msgType === 3) {
                        this.__msgc = _msg;
                        clearTimer("msgc");
                        this._msgTimers.msgc = setTimeout(() => {
                            this.__msgc = null;
                            this._msgTimers.msgc = null;
                        }, 200);

                    } else if (msgType === 5) {
                        sprite = 5;

                    } else if (msgType === 8) {
                        if (CurrentLayout.getStashed('mode') === 'viewer') {
                            console.log("This message only displays in the editor");
                        } else {
                            __menu_pointer = _msg;
                            clearTimer("menu_pointer");
                            this._msgTimers.menu_pointer = setTimeout(() => {
                                __menu_pointer = null;
                                this._msgTimers.menu_pointer = null;
                            }, 3000);
                        }

                    } else if (msgType === 9) {
                        this.__msgc = _msg;
                        clearTimer("msgc");
                        this._msgTimers.msgc = setTimeout(() => {
                            this.__msgc = null;
                            this._msgTimers.msgc = null;
                        }, 200);

                    }
                    else if (msgType === 10) {
                        this.__msgc = _msg;
                        clearTimer("msgc");
                        sprite = 10;
                    }
                    else {
                        this.__msg = _msg;
                        this.fade = 7;
                        clearTimer("msg");
                        this._msgTimers.msg = setTimeout(() => {
                            this.__msg = null;
                            this._msgTimers.msg = null;
                        }, 3000);
                    }
            }

            removeFunction(pf) {

                let index = this.transferFunctions.indexOf(pf)
                if (index >= 0) {
                    this.transferFunctions.splice(index, 1);
                }
            }
            removeWBFunction(pf) {
                let index = this.trackFunctions.indexOf(pf)
                if (index >= 0) {
                    let wf = this.trackFunctions[index]
                    wf.removePlots()
                    this.trackFunctions.splice(index, 1);
                }
            }

            removePlate(plate) {
                this.deselectAll();
                if (plate === this.selectedPlate) {
                    this.setSelected(null);
                }
                const index = this.root.indexOf(plate);
                if (index >= 0) {
                    this.root.splice(index, 1);
                } else {
                    for (let r of this.root) {
                        r.removePlate(plate)
                    }
                }
                this.setSelected(null)

            }

            removeGlyphs(gl) {
                this.___imageCaptureRect = null;
                for (let g of gl) {
                    const index = this.glyphs.indexOf(g);
                    if (index >= 0) {
                        this.glyphs.splice(index, 1);
                    }
                }
            }

            removedDangelingConnections() {

                let remE = []
                for (let c of this.connections) {
                    if (!c.isValid(this)) {
                        remE.push(c)
                    }
                }
                for (let r of remE) {
                    this.removeConnection(r)
                }

            }

            removedDangelingFunctions() {
                let rfun = []
                for (let ft of this.transferFunctions) {
                    if (this.root.indexOf(ft.toPlate) < 0) {
                        rfun.push(ft);
                    }
                    else if (this.root.indexOf(ft.fromPlate) < 0) {
                        rfun.push(ft);
                    }
                }

                for (let r of rfun) {
                    let i = this.transferFunctions.indexOf(r);
                    this.transferFunctions.splice(i, 1)
                }
            }

            async savePT() {

                const graph = CurrentLayout.getStashed('graph')
                if (!graph) {
                    return;
                }
                if (!graph.file)
                    graph.file = generateNautName();
                await exec('baja/table/io/autosave-bajabio.js', graph, '', graph.file)

            }

            alignPlates() {
                let plates = this.root;
                this.grid.rescale();
                let screenx = 0.5;
                for (let i = 0; i < plates.length; i++) {
                    for (let j = i + 1; j < plates.length; j++) {
                        const plate1 = plates[i];
                        const plate2 = plates[j];
                        if (plate1.overlapsWithX(plate2) && plate1.overlapsWithY(plate2)) {
                            const overlapAmount = (plate1.grid.xi + plate1.grid.width * 2) - plate2.grid.xi + screenx;
                            plate1.shiftX(overlapAmount);
                        }
                    }
                }

            }
            applyAssignmentsToPlates(assignments, options) {
                const plates = this.root;

                const PlateCtor = Plate;
                const WellCtor = GenericWell;

                function parseKey(key) {
                    const rx = /^(.+?)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;
                    const m = key.match(rx);
                    if (!m) return null;
                    const [, name, sx0, sx1, sy0, sy1] = m;
                    return {
                        name: name.trim(),
                        x0: Number(sx0),
                        x1: Number(sx1),
                        y0: Number(sy0),
                        y1: Number(sy1),
                    };
                }
                function addRowsUntil(plate, rowIndex) {
                    plate.wells = plate.wells || [];
                    if (!plate.wells[0]) {
                        plate.insertCol && plate.insertCol(0);
                        plate.wells[0] = [];
                        plate.wells[0][0] = WellCtor ? new WellCtor('A1') : { value: undefined, label: 'A1' };
                    }
                    if (typeof plate.getLastRow === 'function' && typeof plate.addRow === 'function') {
                        while (plate.getLastRow() < rowIndex) plate.addRow();
                    } else {
                        for (var c = 0; c < plate.wells.length; c++) {
                            while ((plate.wells[c] ? plate.wells[c].length : 0) <= rowIndex) {
                                var r = plate.wells[c] ? plate.wells[c].length : 0;
                                plate.wells[c] = plate.wells[c] || [];
                                var label = String.fromCharCode(65 + c) + (r + 1);
                                plate.wells[c][r] = plate.wells[c][r] || (WellCtor ? new WellCtor(label) : { value: undefined, label: label });
                            }
                        }
                    }
                }

                function ensureWell(plate, c, r) {
                    ensureCols(plate, c);
                    addRowsUntil(plate, r);
                    plate.wells[c] = plate.wells[c] || [];
                    if (!plate.wells[c][r]) {
                        var label = String.fromCharCode(65 + c) + (r + 1);
                        plate.wells[c][r] = WellCtor ? new WellCtor(label) : { value: undefined, label: label };
                    }
                    return plate.wells[c][r];
                }

                function ensureCols(plate, upToColIdx) {
                    plate.wells = plate.wells || [];
                    while (plate.wells.length <= upToColIdx) {
                        var c = plate.wells.length;
                        plate.insertCol && plate.insertCol(c);
                        plate.wells[c] = plate.wells[c] || [];
                        if (!plate.wells[c][0]) {
                            var label = String.fromCharCode(65 + c) + '1';
                            plate.wells[c][0] = WellCtor ? new WellCtor(label) : { value: undefined, label: label };
                        }
                    }
                }

                function coerce(val) {
                    const t = String(val).trim();
                    if (t === "") return t;
                    if (t === "true") return true;
                    if (t === "false") return false;
                    if (/^[+-]?\d+(\.\d+)?$/.test(t)) {
                        const n = Number(t);
                        if (!Number.isNaN(n)) return n;
                    }
                    return val;
                }

                const opts = Object.assign(
                    { targetField: "value", coerceTypes: true, strictBounds: false },
                    options || {}
                );

                for (const [rawKey, rawValue] of Object.entries(assignments)) {
                    const parsed = parseKey(rawKey);
                    if (!parsed) {
                        console.warn(`Skipping malformed key: ${rawKey}`);
                        continue;
                    }

                    const { name, x0, x1, y0, y1 } = parsed;

                    if (x0 < 0 || x1 < 0 || y0 < 0 || y1 < 0) {
                        const msg = `Negative indices not supported for key "${rawKey}"`;
                        if (opts.strictBounds) throw new RangeError(msg);
                        console.warn(msg + " — skipping.");
                        continue;
                    }

                    const xStart = Math.min(x0, x1);
                    const xEnd = Math.max(x0, x1);
                    const yStart = Math.min(y0, y1);
                    const yEnd = Math.max(y0, y1);

                    const hintCols = xEnd + 1;
                    const hintRows = yEnd + 1;

                    function findPlate(name) { return (plates).find(p => p && p.name === name) || null; }

                    let plate = findPlate(name) || ensurePlate(name, hintCols, hintRows);

                    ensureCols(plate, xEnd);
                    addRowsUntil(plate, yEnd);

                    const valueToSet = opts.coerceTypes ? coerce(rawValue) : rawValue;

                    for (let x = xStart; x <= xEnd; x++) {
                        for (let y = yStart; y <= yEnd; y++) {

                            const well = ensureWell(plate, x, y);
                            well[opts.targetField] = valueToSet;
                            well.selectIt();
                        }
                    }

                    plate.last_touched = new Date();
                }
            }

            applyAssignmentsToPlates__dep(assignments, options) {

                const plates = this.root;
                function parseKey(key) {
                    const rx = /^(.+?)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;
                    const m = key.match(rx);
                    if (!m) return null;
                    const [, name, sx0, sx1, sy0, sy1] = m;
                    return {
                        name: name.trim(),
                        x0: Number(sx0),
                        x1: Number(sx1),
                        y0: Number(sy0),
                        y1: Number(sy1),
                    };
                }
                function coerce(val) {
                    const t = String(val).trim();
                    if (t === "") return t;
                    if (t === "true") return true;
                    if (t === "false") return false;
                    if (/^[+-]?\d+(\.\d+)?$/.test(t)) {
                        const n = Number(t);
                        if (!Number.isNaN(n)) return n;
                    }
                    return val;
                }
                const opts = Object.assign(
                    { targetField: "value", coerceTypes: true, strictBounds: false },
                    options || {}
                );
                const plateMap = new Map();
                for (const p of plates) plateMap.set(p.name, p);

                for (const [rawKey, rawValue] of Object.entries(assignments)) {
                    const parsed = parseKey(rawKey);
                    if (!parsed) {
                        console.warn(`Skipping malformed key: ${rawKey}`);
                        continue;
                    }
                    const { name, x0, x1, y0, y1 } = parsed;

                    const plate = plateMap.get(name);
                    if (!plate) {
                        console.warn(`No plate named "${name}" found for key "${rawKey}"`);
                        continue;
                    }

                    const wells = plate.wells;
                    const maxX = wells.length - 1;
                    const maxY = wells[0] ? wells[0].length - 1 : -1;

                    if (maxX < 0 || maxY < 0) {
                        console.warn(`Plate "${name}" has empty wells for key "${rawKey}"`);
                        continue;
                    }

                    const xStart = Math.min(x0, x1);
                    const xEnd = Math.max(x0, x1);
                    const yStart = Math.min(y0, y1);
                    const yEnd = Math.max(y0, y1);

                    const valueToSet = opts.coerceTypes ? coerce(rawValue) : rawValue;

                    for (let x = xStart; x <= xEnd; x++) {
                        for (let y = yStart; y <= yEnd; y++) {
                            if (x < 0 || y < 0 || x > maxX || y > maxY) {
                                const msg = `Index [${x}:${y}] out of bounds for plate "${name}" (maxX=${maxX}, maxY=${maxY}) from key "${rawKey}"`;
                                if (opts.strictBounds) throw new RangeError(msg);
                                console.warn(msg + " — skipping.");
                                continue;
                            }
                            const well = wells[x][y];
                            if (!well) {
                                const msg = `Missing well at [${x}][${y}] for plate "${name}" from key "${rawKey}"`;
                                if (opts.strictBounds) throw new Error(msg);
                                console.warn(msg + " — skipping.");
                                continue;
                            }
                            well[opts.targetField] = valueToSet;
                        }
                    }
                }
            }

        }
        return resolve(PlateTrack)
    })

}
