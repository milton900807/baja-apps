function () {

    return new Promise(async (resolve, rej) => {
        let Menu = await exec('flexigraph/menu.js');
        if (isMobile()) {
            Menu = await exec('flexigraph/menu-m.js')
        }
        let MGrid = await exec('flexigraph/grid.js');
        let HM = await exec('baja/history/HM')
        let GenericWell = await exec('baja/plate/well')
        let Glyph = await exec('baja/draw/glyph.js')
        let Plate = await exec('baja/plate/plate.js');
        let MPlot = await exec("flexigraph/plot.js");

        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let scroll_y = 10;
        let scrollbarHeight = 25;
        let scrollbarWidth = 15;
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
        let pointTypeMenus = await exec('baja/plots/point-menus')
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
                stroke = 'rgba(0,0,0,0.08)'
            } = {}) {
                ctx.save();

                const prevFont = ctx.font;
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

                const scaleX = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
                const blurComp = blurPx / (scaleX || 1);

                ctx.filter = `blur(${blurComp}px)`;
                this._fillRoundedRect(ctx, x, y, w, h, radius, blurFill);

                ctx.filter = 'none';
                this._fillRoundedRect(ctx, x, y, w, h, radius, baseFill);
                if (stroke) this._drawRoundedRect(ctx, x, y, w, h, radius, stroke, 1);

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
            new FinancialCalcSpriteWithStatus(x, y, 1, {
                initialNote: 'This will take about a minute…',
                initialNoteDuration: 1500,
                estimatedTotalSeconds: 60,
                showProgressBarDuringNote: false,
                doneMessage: 'Complete'
            });

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
                if (!rangeMatch) {
                    throw new Error(`Invalid range format in rangeArray: '${range}'. Must be in 'table[xi:xf][yi:yf]'.`);
                }

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
            const variablePattern = /\$\{[^}]+\}/g;

            if (!variablePattern.test(funcString)) {
                return [funcString];
            }

            const expressions = [];

            for (let i = startIndex; i <= endIndex; i++) {

                let updatedString = funcString
                    .replace(/\$\{i\}/g, String(i))
                    .replace(/\$\{y\}/g, String(i));

                updatedString = updatedString.replace(/\[(\s*\d+\s*)\]/g, (match, p1) => `[${p1.trim()}]`);

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
            return `hsl(${hue}, 80%, 50%)`;
        }

        function drawArrow__tables(ctx, fromRect, toRect, graph, label) {
            if (!fromRect || !toRect || !graph) return;

            const ARROW_ALPHA = 0.15;
            const ARROW_LINE_WIDTH = 1;
            const ARROW_HEAD_LENGTH = 24;
            const LABEL_OFFSET = 6;
            const LABEL_HALO_ALPHA = 0.6;
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
            const prevFont = ctx.font;
            const prevAlign = ctx.textAlign;
            const prevBase = ctx.textBaseline;

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = ARROW_ALPHA;

            ctx.beginPath();
            ctx.moveTo(fromCenterX, fromCenterY);
            ctx.lineTo(edgeX, edgeY);
            ctx.strokeStyle = color;
            ctx.lineWidth = ARROW_LINE_WIDTH;
            ctx.stroke();

            ctx.fillStyle = color;
            drawArrowhead(edgeX, edgeY, angle);

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

                ctx.font = prevFont || '13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const maxTextWidth = Math.max(0, usableLen - 8);

                function fitText(text, maxWidth) {
                    if (maxWidth <= 0) return '';
                    const full = ctx.measureText(text).width;
                    if (full <= maxWidth) return text;

                    const ell = '…';
                    const ellW = ctx.measureText(ell).width;
                    if (ellW > maxWidth) return '';

                    let lo = 0, hi = text.length;
                    while (lo < hi) {
                        const m = Math.ceil((lo + hi) / 2);
                        const w = ctx.measureText(text.slice(0, m) + ell).width;
                        if (w <= maxWidth) lo = m; else hi = m - 1;
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

                    const textWidth = ctx.measureText(fitted).width;

                    ctx.restore();

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
            ctx.font = prevFont;
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
        let selectedColor = 'magenta'
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

        const scenes = await exec('baja/plate/plate-track-backgrounds.js')

        let lastCompletedTime = 0;
        let inProgress = false;
        let __previousPushTime = Date.now()

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
            plate_menu = null;
            menu_vis = false;
            defaultWellWidthSc = 0.1;
            defaultWellHeightSc = 0.01;
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

            __formulaEdges = [];

            __msgc;
            uid;
            __tables_menu = null;
            __bookmark_menu = null;
            attr__displayBookMarks = false;
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
                scrollGrid.rescale();
                scroll_y = 2;
                this.users['owner'] = getUser()

                if (isMobile()) {
                    this.attr__showTablesMenu = false;
                }
            }

            async paintWells() {

                let WellDisplay = await exec('baja/plate/views/well-display-factory')
                const keys = Object.keys(WellDisplay)
                let welld = await exec('py/openai/paint-wells.py', keys, this.root)

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

            async zoomToAllTables(opts = {}) {
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

            async zoomToPlate(plateName, opts = {}) {
                const padding = opts.padding ?? 24;
                const animateMs = opts.animateMs ?? 0;
                const applyRescale = opts.applyRescale ?? true;

                if (!this.grid || !this.root || !plateName) return;

                const plate = this.root.find(p => p && (p.name === plateName || p.id === plateName));
                if (!plate || !plate.grid) return;

                const pminX = plate.grid.xi;
                const pminY = plate.grid.yi;
                const pW = plate.grid.width;
                const pH = plate.grid.height;

                const tgtW0 = pW + padding * 2;
                const tgtH0 = pH + padding * 2;

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

                const pcx = pminX + pW * 0.5;
                const pcy = pminY + pH * 0.5;
                const tgtXi = pcx - tgtW * 0.5;
                const tgtYi = pcy - tgtH * 0.5;

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
                    const ek = `${tableName}:${startX},${stopX}->${ref.tableName}:${ref.x},${ref.y}`;
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
                                color: '#c83353ff',
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
                console.log('debubg');
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
            }

            setPointSelected(__selected, scx, scy, menuItems) {
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

                let adm = pointTypeMenus[__selected.type]
                if (adm) {
                    m = m.concat(adm(this, this.selectedPlate, __selected))
                }
                setTimeout(() => {
                    this.menu = new Menu(m, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200),
                        this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
                    this.menu_vis = true;
                    this.menu_width = 550
                    this.menu_vis = true;
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
                        refWw = byArea[0].ww; refWh = byArea[0].wh;
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
                    const defaultWellWidth = typeof this.getDefaultWellWidthSC === 'function'
                        ? this.getDefaultWellWidthSC(cols) : 20;
                    const defaultWellHeight = (typeof this.defaultWellHeightSc === 'number'
                        ? this.defaultWellHeightSc : 20);
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
                        minY = Math.min(minY, p.grid.yi);
                        maxX = Math.max(maxX, p.grid.xi + p.grid.width);
                        maxY = Math.max(maxY, p.grid.yi + p.grid.height);
                    }
                    return { minX, minY, maxX, maxY, cx: (minX + maxX) * 0.5, cy: (minY + maxY) * 0.5 };
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
                        newPlate.grid.yi = gb.minY - spacing - newPlate.grid.height;
                    } else {

                        const cy = gb.cy;
                        newPlate.grid.xi = gb.maxX + spacing;
                        newPlate.grid.yi = cy - newPlate.grid.height * 0.5;
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

            updatePlots() {
                for (let p of this.m_plots) {
                    if (p.scatterData && p.type != 'timeline') {
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
                for (let plate of this.root) {
                    plate.clearErrors();
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

            async _updateAllCalculations__() {

                this.formulas = {}
                for (let r of this.root) {

                    if (r.applyrowheaders) {
                        r.applyrowheaders();
                    }
                    if (r.applycolumnheaders) {
                        r.applycolumnheaders();
                    }
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
                this.formulas = cleanDictionary(this.formulas)
                let missing = findMissingRefs(this.formulas, this.root, parseSingleVariable)
                if (missing.missingFields) {
                    materializeMissingFields(missing.missingFields, this.root)
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
                            let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges)
                            let table = this.getTableByName(tableName);

                            let callist = generateExpressionsInRange(calculation, startY, stopY)
                            if (callist && callist.length >= 1) {
                                let index = startY;

                                for (let icl of callist) {
                                    let v = await exec('baja/plate/ops/frun-object.js', icl, this);
                                    if (!v['results']) {
                                        this.highlightWell(calculation_key)
                                        table.__hasFormulaError = true;
                                        this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                        this.setMessage('Unable to calculate: ' + calculation_key + ' = ' + calculation, 2)
                                        return;

                                    } else {
                                        table.__hasFormulaError = false;

                                        this.updateWells(v, tableName, startX, stopX, index, index);
                                        this.recordFormulaEdges(tableName, startX, stopX, startY, stopY, calculation);

                                        index++;
                                    }
                                }
                            } else {
                                let v = await exec('baja/plate/ops/frun-object.js', calculation, this);
                                if (!v['results']) {
                                    table.__hasFormulaError = true;
                                    this.tagError(tableName, startX, stopX, startY, stopY, calculation)

                                    this.setMessage('Unable to calculate: ' + calculation_key + ' = ' + calculation + '', 2)
                                    if (v.message)
                                        this.setMessage(v.message, -1)
                                    return;
                                } else {

                                    table.__hasFormulaError = false;

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

            addGlyph(glyph) {
                this.glyphs.push(glyph)
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

            mouseDown(x, y) {
                if (textActive) {
                    textActive = false;
                }
                if (!isMobile()) {
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
                this.isDraggingScrollbar = false;
                if (this.menu) {
                    this.menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    this.menu = null;
                    this.menu_vis = false;
                    return;
                }
                if (this.attr__displayBookMarks) {
                    if (this.__bookmark_menu && this.__bookmark_menu.mouseUp && this.__bookmark_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        this.__bookmark_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                        return;
                    }
                }
                if (this.attr__showTablesMenu && !this.attr__displayBookMarks && !isMobile()) {
                    if (this.__tables_menu && this.__tables_menu.mouseUp && this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        this.__tables_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                        return;
                    }
                }

                if (!isMobile()) {
                    if (this.__tables_menu && this.__tables_menu.mouseUp && this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        return;
                    }
                }
                if (this.wbid != null && this.wbid.startsWith('override'))
                    return;

                const mmx = this.grid.Xwc(x)
                const mmy = this.grid.Ywc(y)
                let new_selected = this.getPlate(mmx, mmy)
                if (!new_selected && this.__no_widgets_zone) {
                    this.wb(null)
                    this.deselectAll()
                    return;
                }
            }

            handleKeyDown(event) {
                console.log('debubg');
                if (!textActive) {
                    return;
                }
                textStyle = 'search'
                const handleCharacterInput = (key) => {
                    try {

                        console.log(' key ' + key)
                        if (cursorPos <= 0) {
                            text = '' + key;
                            cursorPos = 1;
                        } else {
                            text = text.slice(0, cursorPos) + key;
                        }
                    } catch (exception) {
                        text = '';
                    }
                    cursorPos++;
                };

                const handleBackspace = () => {
                    if (initBox) {
                        text = ''
                        cursorPos = 0
                        initBox = false;
                        return;
                    }
                    if (cursorPos > 0) {
                        text = text.slice(0, cursorPos - 1) + text.slice(cursorPos);
                        cursorPos -= 1;
                    }
                    if (cursorPos < 0)
                        cursorPos = 0;
                };

                const handleEnter = () => {
                    textActive = false;
                    this.newRoot(text, 'data', 1, 1)
                    text = '';

                }
                switch (event.key) {
                    case 'Backspace':
                        handleBackspace();
                        break;
                    case 'Enter':
                        handleEnter();
                        break;
                    case 'Escape':
                        textActive = false;
                        break;

                    default:
                        initBox = false;
                        if (/^[a-zA-Z0-9!_ ]$/.test(event.key)) {
                            handleCharacterInput(event.key)
                            break;
                        } else {
                            console.log('Non-alphanumeric key pressed: ' + event.key);
                        }
                        break;
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

                if (this.menu && this.menu.mouseMove) {
                    this.menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
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

                if (this.selectedPlate && this.selectedPlate.inButtons && this.selectedPlate.inButtons(x, y, this)) {
                    return;
                }
                if (!isMobile() && this.attr__showScrollbar) {
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

            lassoSelect(lassoPolygon, graph, x, y) {

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

                let isPointInPolygon = (point, polygon) => {
                    if (!polygon) {
                        return false;
                    }
                    let inside = false;

                    const x = (this.grid.X(point.x));
                    let y = (this.grid.Y(point.y));
                    if (point.scy) {
                        y_ = point.scy;
                    }

                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const xi = polygon[i].x, yi = polygon[i].y;
                        const xj = polygon[j].x, yj = polygon[j].y;
                        const intersect = ((yi > y) !== (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
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

                let findGlyphsInLasso = (objects, glyphs, lassoPolygon) => {
                    let checkPlates = (plateArray) => {
                        for (let g of plateArray) {
                            let t = [{ x: g.getX(), y: g.getY() }, { x: g.getXf(), y: g.getYf() }];
                            for (let i of t) {
                                if (i.x) {
                                    if (isPointInPolygon(i, lassoPolygon)) {
                                        objects.push(g)
                                    }
                                }
                            }
                        }
                    };
                    checkPlates(glyphs);
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

                        }
                    })

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
                this.menu = new Menu(menuList, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * menuList.length / 2))
                this.menu_vis = true;
                if (this.wb)
                    this.wb(null)
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
                setTimeout(() => {
                    this.wb(null)
                    this.menu = null;
                    this.menu = _menu;
                    this.menu_vis = true;
                }, 200)
            }

            deselectAll() {
                this.menu = null;
                if (this.selectedPlate) {
                    if (this.selectedPlate.setMenu)
                        this.selectedPlate.setMenu(this, null)
                    if (this.selectedPlate && this.selectedPlate.deselectAll)
                        this.setSelected(null);

                }
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
                    p.deselectIt();
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
                const grid = this.grid;
                grid.rescale();

                const duration = Math.max(0, opts.duration ?? 800);
                const staggerMs = Math.max(0, opts.stagger ?? 0);
                const easingName = opts.easing ?? "easeInOutCubic";
                const gutter = opts.gutter ?? grid.worldHeight(30);
                const margin = opts.margin ?? grid.worldHeight(0);
                const topToBottom = opts.topToBottom ?? true;
                const zoomToFit = !!opts.zoomToFit;
                const onUpdate = typeof opts.onUpdate === "function" ? opts.onUpdate : null;

                const plotHeightPad = opts.plotHeightPad ?? grid.worldHeight(100);

                const Easings = {
                    linear: t => t,
                    easeOutQuad: t => 1 - (1 - t) * (1 - t),
                    easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
                };
                const ease = Easings[easingName] ?? Easings.easeInOutCubic;

                const X = v => grid.X(v);
                const Y = v => grid.Y(v);
                const Xwc = v => grid.Xwc(v);
                const Ywc = v => grid.Ywc(v);
                const lerp = (a, b, t) => a + (b - a) * t;

                grid.rescale();

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

                const boxes = [...plateBoxes, ...plotBoxes];
                if (boxes.length === 0) return;

                const totalArea = boxes.reduce((acc, b) => acc + (b.w + gutter) * (b.hEff + gutter), 0) || 1;
                const viewW = grid.getxmax() - grid.getxmin();
                const viewH = grid.getymax() - grid.getymin();
                const viewAR = viewW / Math.max(viewH, 1e-6);
                const targetBlockW = Math.sqrt(totalArea * viewAR);

                const shelves = [];
                {
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
                }

                const blockW = Math.max(...shelves.map(s => s.w)) - (shelves.length ? gutter : 0);
                const blockH = shelves.reduce((acc, s) => acc + s.h, 0) - (shelves.length ? gutter : 0);

                const cx = (grid.getxmin() + grid.getxmax()) / 2;
                const cy = (grid.getymin() + grid.getymax()) / 2;
                const startX = cx - blockW / 2;
                const startY = cy + blockH / 2;
                const verticalDir = topToBottom ? -1 : +1;

                let yCursor = startY;
                const targets = [];
                for (const shelf of shelves) {
                    const shelfX = startX + (blockW - (shelf.w - gutter)) / 2;
                    let xCursor = shelfX;
                    for (const b of shelf.items) {

                        targets.push({ box: b, target: { xw: xCursor, yw: yCursor } });
                        xCursor += (b.w + gutter);
                    }
                    yCursor += verticalDir * shelf.h;
                }

                const fit = {
                    xmin: startX - margin,
                    xmax: startX + blockW + margin,
                    ymax: startY + margin,
                    ymin: startY - blockH - margin,
                };

                const t0 = performance.now();
                const n = targets.length;
                const starts = targets.map((_, i) => i * staggerMs);
                const ends = targets.map((_, i) => starts[i] + duration);

                const writePose = (box, pose) => {
                    if (box.kind === "plot") {

                        box.ref.x = pose.xw;
                        box.ref.y = pose.yw;
                    } else {

                        box.ref.grid.xi = pose.xw;
                        box.ref.grid.yi = pose.yw - box.h;
                    }
                };

                for (const { box } of targets) {
                    if (!box.cur) {
                        if (box.kind === "plot") {
                            box.cur = { xw: box.ref.x, yw: box.ref.y };
                        } else {
                            const hWorld = box.h;
                            box.cur = { xw: box.ref.grid.xi, yw: box.ref.grid.yi + hWorld };
                        }
                    }
                }

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
                        onUpdate && onUpdate();
                        if (zoomToFit) {

                            onUpdate && onUpdate();
                        }
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

                if (!this.root.some(item => item.name === pl.name)) {
                    if (pl.wells)
                        this.root.push(pl);
                    else if (pl.typeof === 'plot') {
                        this.m_plots.push(pl)
                    }
                } else {
                    this.setMessage(" You already have a table with that name..");
                    setTimeout(() => {
                        this.setMessage(" You can change the name of the table and then add this.");
                    }, 3000);
                    return;
                }

                const viewLeft = this.grid.Xwc(0);
                const viewRight = this.grid.Xwc(this.grid.width);
                const viewTop = this.grid.Ywc(0);
                const viewBottom = this.grid.Ywc(this.grid.height);

                const cx = (viewLeft + viewRight) / 2;
                const cy = (viewTop + viewBottom) / 2;

                pl.grid.xi = cx - (pl.grid.width / 2);
                pl.grid.yi = cy - (pl.grid.height / 2);

                this.generateTables();
                this.setSelected(pl);

                const p = this.root.find(t => t.name === pl.name) || pl;
                const newCx = (this.grid.Xwc(0) + this.grid.Xwc(this.grid.width)) / 2;
                const newCy = (this.grid.Ywc(0) + this.grid.Ywc(this.grid.height)) / 2;
                p.grid.xi = newCx - (p.grid.width / 2);
                p.grid.yi = newCy - (p.grid.height / 2);
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
                if (!Array.isArray(plates) || plates.length === 0) return;

                let leftMost = plates.reduce((min, pl) =>
                    pl.grid.xi < min.grid.xi ? pl : min
                );

                this.root.push(...plates);

                let xwc = this.grid.Xwc(0);
                let ywc = this.grid.Ywc(0);
                let world_height = this.grid.worldHeight(this.grid.height);
                let world_width = this.grid.worldWidth(this.grid.width);

                let newRootX = xwc + (world_width - leftMost.grid.width) / 2;
                let newRootY = ywc - (world_height + leftMost.grid.height) / 2;

                let offsetX = newRootX - leftMost.grid.xi;
                let offsetY = newRootY - leftMost.grid.yi;

                for (let pl of plates) {
                    pl.grid.xi += offsetX;
                    pl.grid.yi += offsetY;
                }

                this.generateTables();
                this.selectedPlate = leftMost;
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
                    p.push({
                        label: `${r.name}`,
                        click: (xwc, ywc) => {

                            r.selectIt();

                            this.zoomintoplate(r);
                            this.selectPlate(r)
                        }
                    })
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

            async zoomintoplate(plate) {
                if (!plate) {
                    return;
                }
                this.pushGrid();
                if (plate.typeof && plate.typeof === 'plot') {
                    this.zoomintoplot(plate)
                    return;
                }
                function calculateGridHeight(grid, cellSizeInPixels) {
                    const worldCellSize = 1;
                    const worldHeight = grid.ymax - grid.ymin;
                    const numberOfCells = worldHeight / worldCellSize;

                    const heightInPixels = numberOfCells * cellSizeInPixels;
                    grid.setHeight(heightInPixels);

                    grid.rescale();

                    return heightInPixels;
                }

                if (this.name)
                    LJScript.add(this.name, 'zoomin ' + this.name)

                this.grid.rescale();
                if (plate.highlight) {
                    plate.highlight();
                }

                let ch = 24;
                let cw = 100;

                if (plate.plateType === 'package') {
                    ch = 60;
                    cw = 200;
                }

                if (plate.grid.ymax === 1) {
                    ch = 250;
                }

                let pixh = this.grid.height;
                let pixw = this.grid.width;
                let ycc = pixh / ch;
                let xcc = pixw / cw;
                let xwcc = plate.grid.screenWidth(xcc)
                let totalWidth = plate.grid.width;
                let factor = 0.20;
                let fl = totalWidth * factor
                let xi = plate.grid.xi - fl
                this.setSelected(plate)
                await this.zoomto(xi, plate.grid.yi + plate.grid.height, totalWidth + (2 * fl), plate.grid.yi + plate.grid.height)
                if (plate.clk_drag)
                    plate.clk_drag(this)
                else
                    this.wb(null);
            }

            getDefaultWellWidthSC(column_count) {
                if (((100 * column_count)) > this.grid.width) {
                    return this.defaultWellWidthSc;
                }
                let www = this.grid.worldWidth(100 * column_count)
                return www;

            }

            async zoomintoplot(plate) {
                if (!plate) {
                    return;
                }

                this.deselectAll();

                if (plate.highlight) {
                    plate.highlight();
                }

                this.grid.rescale();

                const totalWidth = plate.w;
                const totalHeight = plate.h;
                const xi = plate.x;
                const yi = plate.y;

                const expandFactor = 1.2;
                const newWidth = totalWidth * expandFactor;
                const newHeight = totalHeight * expandFactor;

                const centerX = xi + totalWidth / 2;
                const centerY = yi - totalHeight / 2;

                const zoomX = centerX - newWidth / 2;
                const zoomY = centerY - newHeight / 2;

                await this.zoomto(zoomX, zoomY, newWidth, newHeight);

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

            async zoomto(x, y, width, height) {
                this.pushGrid();
                AnimateGrid.INTERUPT = true;
                this.grid.rescale();
                let xii = x;
                let yii = y;
                let xmax = xii + width - this.grid.worldWidth(this.__canvas__.width - this.grid.width);

                let xmin = xii;
                let ymax = yii;
                let ymin = yii;
                let ag = new AnimateGrid(this.grid);
                ag.animateTo(xmin, xmax, ymin, ymax, 60);
            }

            async zoomtoX(x, y, width, height) {
                this.pushGrid();
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

            getTableByName(name) {
                for (let r of this.root) {
                    if (r.name.toLowerCase() === name.toLowerCase()) {
                        return r;
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
                        w = w.concat(r.getSelectedWells());
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

                if (!__text) {
                    __text = await navigator.clipboard.readText();
                }

                try {

                    function detectDelimiter(text) {
                        const delimiters = ['\n', '\t', ',', ';', '|', ' '];

                        const lines = text.split('\n');
                        const scores = {};

                        for (const delim of delimiters) {
                            const counts = lines.map(line => line.split(delim).length);
                            const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
                            const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
                            const stddev = Math.sqrt(variance);

                            scores[delim] = {
                                averageFields: avg,
                                consistency: 1 / (stddev + 0.0001),
                            };
                        }

                        const best = Object.entries(scores).sort((a, b) => {
                            return b[1].consistency - a[1].consistency || b[1].averageFields - a[1].averageFields;
                        })[0][0];

                        return best;
                    }

                    const delim = detectDelimiter(__text);

                    if (!delim && isStringArray(__text)) {
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
                        let parsedArray = parseToArray(__text);
                        let selectedWells = await this.selectedPlate.getSelectedWellsInOrder();
                        let index = 0;

                        for (let i = 0; i < selectedWells.length && index < parsedArray.length; i++) {
                            selectedWells[i].setValue(parsedArray[index++]);
                        }
                    } else {

                        let parsedData = __text.split(delim);
                        const is1DArray = parsedData.every(item => typeof item !== 'object' || !Array.isArray(item));
                        if (is1DArray) {
                            for (let r of this.root) {
                                let selectedWells = await r.getSelectedWellsInOrder();

                                if (is1DArray) {

                                    let count = Math.min(parsedData.length, selectedWells.length);
                                    for (let i = 0; i < count; i++) {
                                        selectedWells[i].setValue(parsedData[i]);
                                    }
                                } else {

                                    let index = 0;
                                    let numRows = parsedData.length;
                                    let numCols = parsedData[0].length;

                                    for (let row = 0; row < numRows; row++) {
                                        for (let col = 0; col < numCols; col++) {
                                            if (index < selectedWells.length) {
                                                selectedWells[index].setValue(parsedData[row][col]);
                                                index++;
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            for (let r of this.root) {
                                let selectedWells = await r.getSelectedWellsInOrder();
                                let parsedData = __text.split(delim);
                                let numRows = parsedData.length;
                                let numCols = parsedData[0].length;
                                let index = 0;
                                for (let row = 0; row < numRows; row++) {
                                    for (let col = 0; col < numCols; col++) {
                                        if (index < selectedWells.length) {

                                            const newValue = parsedData[row][col];
                                            selectedWells[index].setValue(newValue);
                                            index++;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (exception) {
                    let lines = __text.split('\n');

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

            async pasteIntoSelectedWellsMatchAddresses() {
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableToArray(input) {
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
                            selectedWells[i].setValue(parsedArray[index++] + insertionText + selectedWells[i].getValue());
                        }
                    } else {
                        let parsedData = parseTableToArray(text);
                        for (let r of this.root) {
                            let selectedWells = await r.getSelectedWellsInOrder();
                            let numRows = parsedData.length;
                            let numCols = parsedData[0].length;
                            let index = 0;

                            let indexToWellAddress = (index, __cols) => {
                                const rowLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                                let row = Math.floor(index / __cols);
                                let col = (index % __cols) + 1;
                                if (row >= rowLetters.length) {
                                    throw new Error('Row index out of range');
                                }
                                let rowLetter = rowLetters.charAt(row);
                                return `${rowLetter}${col}`;
                            }
                            let generateWellAddresses = (rows, cols) => {
                                let wellAddresses = [];
                                for (let index = 0; index < rows * cols; index++) {
                                    wellAddresses.push(indexToWellAddress(index, cols));
                                }
                                return wellAddresses;
                            }
                            let welladdr = generateWellAddresses(parsedData.length, parsedData[0].length)
                            for (let row = 0; row < numRows; row++) {
                                for (let col = 0; col < numCols; col++) {
                                    const newValue = parsedData[row][col];
                                    for (let s of selectedWells) {
                                        if (s.position === welladdr[index]) {
                                            selectedWells[index].setValue(newValue);
                                        }
                                    }
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
                                selectedWells[i].setValue(lines[i]);
                            }
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

            joinOnAddressColumn(p1, c1, p2, c2) {
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

                            if (('' + s.position).trim() === ('' + p2.wells[c2][row].value).trim()) {
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
                scrollGrid.rescale();
                if (this.attr__showScrollbar) {

                    ctx.fillStyle = 'lightBlue';
                    ctx.fillRect(scrollGrid.xi, scrollGrid.yi, scrollGrid.width, scrollGrid.height);
                    ctx.fillStyle = 'darkGray';
                    ctx.fillRect(scrollGrid.xi, scrollGrid.Y(scroll_y) - 10, scrollGrid.width, 20);
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

            _drawBlurryBubble(ctx, cx, cy, text, {
                font = '20px Arial',
                padX = 16,
                padY = 10,
                radius = 10,
                blurPx = 10,
                baseFill = 'rgba(255,255,255,0.6)',
                blurFill = 'rgba(255,255,255,0.9)',
                stroke = 'rgba(0,0,0,0.10)',
                textFill = 'black',
                align = 'center',
                baseline = 'middle'
            } = {}) {
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
                const scale = Math.hypot(tr.a, tr.b);
                const blurComp = blurPx / (scale || 1);

                const r = Math.min(radius, Math.min(w, h) * 0.5);
                const roundRect = () => {
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
                };

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
                    ctx.lineWidth = 1 / (scale || 1);
                    roundRect();
                    ctx.stroke();
                }

                ctx.textAlign = align;
                ctx.textBaseline = baseline;
                ctx.fillStyle = textFill;
                ctx.fillText(text, cx, cy);

                ctx.font = prevFont;
                ctx.textAlign = prevAlign;
                ctx.textBaseline = prevBaseline;
                ctx.restore();
            }

            __swipe = false;
            draw(ctx) {

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

                        }, 300)

                    });
                    this.__swipe = true;
                }
                this.__canvas__ = ctx.canvas;

                if (this.__canvas__ && this.menu) {
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
                        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
                        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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

                    this.grid.xmin = xmin;
                    this.grid.xmax = xmax;
                    this.grid.ymin = ymin;
                    this.grid.ymax = ymax;
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
                            this.__bookmark_menu.menu_width = 100;
                            this.__bookmark_menu.x = this.grid.Xwc(2);
                            this.__bookmark_menu.y = this.grid.Ywc(70);
                            this.__bookmark_menu.draw(ctx, this.grid);

                        } else
                            if (this.__tables_menu && this.__tables_menu.draw && this.attr__showTablesMenu) {
                                this.__tables_menu.list = this.generateTables();
                                this.__tables_menu.menu_width = 100;
                                this.__tables_menu.x = this.grid.Xwc(2);
                                this.__tables_menu.y = this.grid.Ywc(70);
                                this.__tables_menu.draw(ctx, this.grid);
                            } else if (this.attr__showTablesMenu) {
                                let m = this.generateTables();
                                let cols = Math.ceil(m.length / 10);
                                this.__tables_menu = new Menu(m, 0, 40, 'rgb(205, 255, 155)', 'navy', cols)
                                this.__tables_menu.menu_width = 100;
                                this.__tables_menu.x = this.grid.Xwc(2);
                                this.__tables_menu.y = this.grid.Ywc(70);
                                this.__tables_menu.draw(ctx, this.grid);

                            }
                    }

                    if (this.activePlot) {
                        this.activePlot.drawPlot(this.grid, ctx, this.activePlot.grid);
                    }
                    ctx.fillStyle = 'black'

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
                            baseFill: 'rgba(255,255,255,0.55)',
                            blurFill: 'rgba(255,255,255,0.9)',
                            stroke: 'rgba(0,0,0,0.10)',
                            textFill: 'black',
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

                    if (sprite && sprite === 5) {

                        const centerX = this.grid.xi + this.grid.width / 2;
                        const centerY = this.grid.yi + this.grid.height / 2;
                        sprite = new FinancialCalcSpriteWithStatus(centerX - 18, centerY - 18, 1, {
                            messages: [
                                "Engine vLJ18.908e4b",
                                "Loading modules...",
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
                            messageMaxDelay: 45,
                            onAllMessagesShown: () => console.log("All status messages displayed.")
                        });
                    } else if (sprite && sprite.update) {
                        sprite.update(0.05);
                        sprite.draw(ctx);
                        return
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

                        this.menu.draw(ctx, this.grid);
                    }

                    if (!isMobile()) {
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
            }

            updateSprite(_msg) {

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

                if (sprite) {
                    sprite.currentStatus = _msg;
                }
            }

            setMessage(_msg, msgType) {

                if (msgType === 1) {
                    this.__msgb = _msg;
                    setTimeout(() => {
                        this.__msgb = null;
                    }, 7000)

                }
                else if (msgType === 2) {
                    this.__msgc = _msg;
                    setTimeout(() => {
                        this.__msgc = null;
                    }, 1500)

                }
                else if (msgType === 3) {
                    this.__msgc = _msg;
                    setTimeout(() => {
                        this.__msgc = null;
                    }, 200)

                } else if (msgType === 5) {

                    sprite = 5;

                }
                else if (msgType === 8) {
                    if (CurrentLayout.getStashed('mode') === 'viewer') {
                        console.log(" This message only displays in the editor ")
                    } else {
                        __menu_pointer = _msg;
                        setTimeout(() => {
                            __menu_pointer = null;
                        }, 3000)
                    }
                }
                else if (msgType === 9) {
                    this.__msgc = _msg;
                    setTimeout(() => {
                        this.__msgc = null;
                    }, 200)
                }

                else {
                    this.__msg = _msg;
                    this.fade = 7;
                    setTimeout(() => {
                        this.__msg = null;
                    }, 3000)
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
            async add(ensembleId, x, y, source) {
                ensembleId = ensembleId.trim();
                if (ensembleId.startsWith('NM_') || ensembleId.startsWith('NC_')) {
                    let mapped = await exec('py/ensembl/ncbi_to_ensembl.py', ensembleId)
                    if (mapped && mapped.length == 1) {
                        this.setMessage(" Loading..." + JSON.stringify(mapped))
                        return this.add(mapped[0], x, y, source)
                    }
                    return this.addNCBI(ensembleId)
                } else {
                    let prefix = null;
                    let genomes = ["HG19", "GRCH38"];
                    if (source && genomes.includes(source.toUpperCase())) {
                        prefix = `https://rest.ensembl.org`;

                    } else {
                        prefix = `https://rest.ensembl.org`;

                    }
                    if (ensembleId.indexOf('.') > 0) {
                        ensembleId = ensembleId.substring(0, ensembleId.indexOf('.'))
                    }
                    let js = {}
                    try {

                        if (ensembleId.toUpperCase().startsWith("ENST")) {

                            this.setMessage(' Loading... ' + ensembleId)
                            console.log('debubg');
                            let host_ = window['env']['apiUrl']
                            let try_local = host_ + `/transcript/${ensembleId}`;
                            js = await GETJSON(try_local);

                            let jsm = js[0]
                            for (let jl of js) {
                                if (jl.feature === 'transcript') {
                                    jsm = jl
                                    break;
                                }
                            }

                            let desc = jsm.attributes.gene_name + ';' + jsm.attributes.transcript_name
                            let geneID = jsm.attributes.ID;

                            let start = parseInt(jsm['start'])
                            let end = parseInt(jsm['end'])

                            let strand = jsm['strand']
                            let chr = jsm['seqname']

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
                            const match = t.chr.match(regex);
                            if (match) {
                                t.chr = parseInt(match[0], 10);
                            }

                            console.log(" chromosome :" + t.chr);
                            t.description = desc;
                            t.geneID = geneID
                            if (x) {
                                t.tgraph.xi = x;
                            }
                            if (y) {
                                t.tgraph.yi = y;
                                this.graph.setymax(t.tgraph.yi + 1);
                                this.graph.setymin(t.tgraph.yi - 10);
                            } else {
                                this.graph.setymax(t.tgraph.yi + 2);
                                this.graph.setymin(t.tgraph.yi - 2);
                            }
                            let xm = 0.1 * t.tgraph.width
                            this.graph.setxmin(t.tgraph.xi - xm);
                            this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);
                            let offset = t.tgraph.width / 6
                            setTimeout(() => {
                                this.animateTo(t.tgraph.xi - offset,
                                    t.tgraph.xi + t.tgraph.width + offset,
                                    t.tgraph.yi - Math.abs(t.tgraph.height) - 10,
                                    t.tgraph.yi + t.tgraph.height + 10)
                                this.setMouseMode('navigate')
                            }, 500)
                            this.graph.rescale();
                            let ensembl_sequence = prefix + `/sequence/id/${ensembleId}?content-type=text/plain`;
                            let fasta = await GETXT(ensembl_sequence)
                            fasta = fasta.trim();
                            if (t.strand < 0) {
                                let temp = '';
                                for (let c = fasta.length - 1; c >= 0; c--) {   // >= 0: c > 0 dropped fasta[0], leaving the minus-strand sequence one base short
                                    temp += fasta[c]
                                }
                                t.setSequence(temp)
                            } else {
                                t.setSequence(fasta)
                            }
                            let annotations = this.createTrackFromLocal(js);
                            for (let an of annotations) {
                                t.add(an)
                            }
                            t.generateORF();
                            return;
                        } else {
                            js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);

                        }

                    } catch (exception) {
                        js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);

                    }

                    if (!js) {
                        console.log(" ensembl " + prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`)
                        js = await GETJSON(prefix + `/lookup/id/${ensembleId}?expand=1;content-type=application/json`);
                    }

                    if (js) {
                        if (js['object_type'] === 'Gene') {
                            let t = await this.loadEnsembleGene(js, prefix)
                            return t;
                        } else {

                            let species = js['species']
                            let chromosome = js['seq_region_name']
                            let start = +js['start']
                            let end = +js['end']
                            let strand = js['strand']
                            let geneID = js['Parent']
                            let desc = js['display_name']
                            let t = this.createTrack(ensembleId, start, end, strand);

                            t.transcriptID = ensembleId;
                            t.species = species;
                            t.chr = chromosome;
                            t.description = desc;
                            t.geneID = geneID
                            if (x) {
                                t.tgraph.xi = x;
                            }
                            if (y) {
                                t.tgraph.yi = y;
                                this.graph.setymax(t.tgraph.yi + 1);
                                this.graph.setymin(t.tgraph.yi - 10);
                            } else {
                                this.graph.setymax(t.tgraph.yi + 2);
                                this.graph.setymin(t.tgraph.yi - 2);
                            }
                            let xm = 0.1 * t.tgraph.width
                            this.graph.setxmin(t.tgraph.xi - xm);
                            this.graph.setxmax(t.tgraph.xi + t.tgraph.width + xm);
                            let offset = t.tgraph.width / 6
                            setTimeout(() => {
                                this.animateTo(t.tgraph.xi - offset,
                                    t.tgraph.xi + t.tgraph.width + offset,
                                    t.tgraph.yi - Math.abs(t.tgraph.height) - 10,
                                    t.tgraph.yi + t.tgraph.height + 10)
                                this.setMouseMode('navigate')
                            }, 500)
                            this.graph.rescale();
                            let ensembl_sequence = prefix + `/sequence/id/${ensembleId}?content-type=text/plain`;
                            let fasta = await GETXT(ensembl_sequence)
                            fasta = fasta.trim();
                            if (t.strand < 0) {
                                let temp = '';
                                for (let c = fasta.length - 1; c >= 0; c--) {   // >= 0: c > 0 dropped fasta[0], leaving the minus-strand sequence one base short
                                    temp += fasta[c]
                                }
                                t.setSequence(temp)
                            } else {
                                t.setSequence(fasta)
                            }
                            this.buildENSEMBLAnnotations(t, js);
                            return t;
                        }
                    }
                }
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

        }
        return resolve(PlateTrack)
    })

}
