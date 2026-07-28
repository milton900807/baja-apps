function (MGrid) {

    return new Promise(async (resolve, reject) => {

        const laneChangeThemes = await exec('flexigraph/plot-lane-change-themes.js')

        const strokeColor = "#2a6b2a";
        const STROKE_W = 6;

        if (!MGrid)
            MGrid = await exec('flexigraph/grid')
        const dayAbbr = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

        const Track = await exec('baja/bio/track-flexi')

        let HM = await exec('baja/history/HM')
        function getZoomedFontSize(pt, base) {
            const theme = getThemeSafe(this);
            const min = theme?.fonts?.min ?? 14;
            const max = theme?.fonts?.max ?? 18;
            const z = pt?.zoom ?? 1;
            return Math.max(min, Math.min(max, Math.round(base * z)));
        }



        function makeLineEquationObject(name, lineEquations, grid) {
            const matchingLines = lineEquations.filter(line => line.name === name);

            if (!matchingLines.length) {
                throw new Error(`No line equations found with name: ${name}`);
            }

            return {
                name,
                lineEquations: matchingLines,
                grid,

                // X(yValue): solve for x from y
                X(yValue) {
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
                            results.push({ line, x });
                        } else {
                            results.push({
                                line,
                                x: null,
                                error: "Horizontal line - no unique x for given y"
                            });
                        }
                    });

                    return results;
                },

                // Y(xValue): solve for y from x
                Y(xValue) {
                    const results = [];

                    this.lineEquations.forEach(line => {
                        const { slope, intercept } = line;
                        const y = slope * xValue + intercept;

                        results.push({ line, y });
                    });

                    return results;
                }
            };
        }
        function rectsOverlap(a, b) {
            return (
                a.x < b.x + b.w &&
                a.x + a.w > b.x &&
                a.y < b.y + b.h &&
                a.y + a.h > b.y
            );
        }
        function findNonOverlappingY(baseBox, previousLabels, canvasHeight, gapY = 4) {
            const maxIters = 100;
            let dir = -1;
            let steps = 0;
            let y = baseBox.y;

            while (steps < maxIters) {
                const test = { ...baseBox, y };
                const hasOverlap = previousLabels.some(r => rectsOverlap(test, r));
                if (!hasOverlap) return y;

                y += dir * (baseBox.h + gapY);
                steps++;

                if (y < 0) {
                    dir = 1;
                    y = baseBox.y + (baseBox.h + gapY);
                }

                if (y + baseBox.h > canvasHeight) {
                    y = Math.max(0, Math.min(canvasHeight - baseBox.h, y));
                    break;
                }
            }

            return Math.max(0, Math.min(canvasHeight - baseBox.h, baseBox.y));
        }

        function ensureInitialXRange(self) {
            if (self._initialXRange == null) {
                self._initialXRange = self.grid.xmax - self.grid.xmin;
            }
        }

        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        function getZoomedFontSize(self, basePx) {
            ensureInitialXRange(self);
            const currentRange = self.grid.xmax - self.grid.xmin;
            if (currentRange <= 0) return basePx;

            const zoomRatio = self._initialXRange / currentRange;

            const scale = Math.sqrt(zoomRatio);

            const scaled = clamp(basePx * scale, basePx * 0.8, basePx * 4.0);
            return Math.round(scaled);
        }

        function getNonOverlapping(
            baseY,
            labelBox,
            previousBoxes,
            step = 2,
            maxAttempts = 1000,
            minY = 20,
            maxY = 5000
        ) {
            const xBuffer = 60;
            const yBuffer = 20;

            for (let i = 0; i < maxAttempts; i++) {

                const direction = i % 2 === 0 ? 1 : -1;
                const magnitude = Math.ceil((i + 1) / 2);
                const offset = direction * magnitude * step;

                const testY = baseY + offset;

                if (testY < minY || testY + labelBox.h > maxY) {
                    continue;
                }

                const testBox = {
                    x: labelBox.x,
                    y: testY,
                    w: labelBox.w,
                    h: labelBox.h
                };

                const collision = previousBoxes.some(prev => {
                    const expandedPrev = {
                        x: prev.x - xBuffer / 2,
                        y: prev.y - yBuffer / 2,
                        w: prev.w + xBuffer,
                        h: prev.h + yBuffer
                    };
                    return !(
                        testBox.x + testBox.w < expandedPrev.x ||
                        testBox.x > expandedPrev.x + expandedPrev.w ||
                        testBox.y + testBox.h < expandedPrev.y ||
                        testBox.y > expandedPrev.y + expandedPrev.h
                    );
                });

                if (!collision) {
                    return testY;
                }
            }

            return Math.max(minY, Math.min(baseY, maxY - labelBox.h));
        }

        const hourToMs = 3600 * 1000;
        const dayToMs = 24 * hourToMs;
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const quarterMap = { 0: 'Q1', 3: 'Q2', 6: 'Q3', 9: 'Q4' };

        let Menu = await exec('flexigraph/menu')
        function isYouTubeVideo(url) {
            if (!url) return false;

            try {
                const parsedUrl = new URL(url);
                const hostname = parsedUrl.hostname.toLowerCase();

                const isYouTubeDomain = hostname === "youtube.com" ||
                    hostname === "www.youtube.com" ||
                    hostname === "m.youtube.com" ||
                    hostname === "youtu.be";

                if (!isYouTubeDomain) return false;

                if (hostname === "youtu.be") {

                    return parsedUrl.pathname.length > 1;
                }

                return parsedUrl.pathname === "/watch" && parsedUrl.searchParams.has("v");

            } catch (e) {
                return false;
            }
        }
        function isTeamsMeetingUrl(url) {
            if (!url) return false;

            try {
                const parsedUrl = new URL(url);
                const hostname = parsedUrl.hostname.toLowerCase();

                const isTeamsDomain = hostname === "teams.microsoft.com" ||
                    hostname.endsWith(".sharepoint.com") ||
                    hostname.endsWith(".1drv.ms");

                if (!isTeamsDomain) return false;

                const path = parsedUrl.pathname.toLowerCase();

                if (hostname === "teams.microsoft.com") {

                    return path.startsWith("/l/meetup-join/");
                }

                const isRecording = path.endsWith(".mp4") || parsedUrl.href.includes("/_layouts/15/Doc.aspx");

                return isRecording;

            } catch (e) {
                return false;
            }
        }

        function constructTeamsMeetingUrl(meetingId, options = {}) {
            if (!meetingId || typeof meetingId !== 'string') {
                throw new Error("Invalid or missing meeting ID");
            }

            const encodedMeetingId = encodeURIComponent(meetingId);
            const baseUrl = "https://teams.microsoft.com/l/meetup-join/";
            const context = {
                Tid: options.tenantId || "YOUR_TENANT_ID",
                Oid: options.userObjectId || "YOUR_USER_OBJECT_ID"
            };

            const contextParam = encodeURIComponent(JSON.stringify(context));
            return `${baseUrl}${encodedMeetingId}/0?context=${contextParam}`;
        }

        function isTeamsMeetingId(id) {
            if (typeof id !== "string") return false;
            const pattern = /^19:meeting_[\w\-]+@thread\.(v2|tacv2)$/i;
            return pattern.test(id.trim());
        }

        let LogGrid = await exec('flexigraph/grid-with-logscales.js')
        let CompositePlot = await exec('flexigraph/composite-plot', MGrid)
        let smenu;

        const bsize = 25;
        let cdic;
        function drawRoundedRectShadow(ctx, x, y, width, height, radius) {
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
            ctx.fill();
        }

        const _ISO_SIGNED_RE = /^([+-]?\d{1,6})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
        function parseHistoricalISOToDate(iso) {
            const m = String(iso).trim().match(_ISO_SIGNED_RE);
            if (!m) return new Date(iso);
            const y = parseInt(m[1], 10);
            const mo = parseInt(m[2], 10) - 1;
            const d = parseInt(m[3], 10);
            const hh = m[4] ? parseInt(m[4], 10) : 0;
            const mm = m[5] ? parseInt(m[5], 10) : 0;
            const ss = m[6] ? parseInt(m[6], 10) : 0;
            return new Date(Date.UTC(y, mo, d, hh, mm, ss));
        }
        function ensureDateUTC(x) {
            if (x instanceof Date) return new Date(x.getTime());
            if (x && typeof x === "object" && typeof x.date === "string")
                return parseHistoricalISOToDate(x.date);
            return typeof x === "string" ? parseHistoricalISOToDate(x) : new Date(x);
        }
        function toMillis(x) { return ensureDateUTC(x).getTime(); }
        function formatYearLabelFromAstronomical(y) {
            return y <= 0 ? `${1 - y} BCE` : `${y}`;
        }

        function yearToMillis(y) {

            return y * 365.2425 * 24 * 3600 * 1000;
        }
        function millisToYear(ms) {
            return ms / (365.2425 * 24 * 3600 * 1000);
        }

        function formatTimeLabel(x, xMin, xMax, start, end) {
            return formatTime(x, xMin, xMax, start, end)
        }

        function formatTime(x, xMin, xMax, start, end) {
            const startMs = toMillis(start);
            const endMs = toMillis(end);
            const totalCanvasRange = xMax - xMin;
            const totalTimeRange = endMs - startMs;
            const normalizedX = (x - xMin) / totalCanvasRange;
            const t = startMs + normalizedX * totalTimeRange;
            return new Date(t);
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

        const integerAxis = (ctx, _grid, minVal, maxVal) => {
            const tickCount = 5;
            const range = maxVal - minVal;
            const tickInterval = Math.round(range / tickCount);
            ctx.lineWidth = 0;
            ctx.shadowBlur = 0;

            for (let i = 0; i <= tickCount; i++) {
                const value = Math.round(minVal + i * tickInterval);
                const position = _grid.Y(value);
                const cxmin = _grid.X(_grid.xmin);

                ctx.moveTo(cxmin, position);
                ctx.lineTo(cxmin - 5, position);

                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let text = `${value}`;

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        };

        const dollarAxis = (ctx, _grid, minVal, maxVal) => {

            const formatCurrency = (value) => {
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000_000) {
                        return `$${(value / 1_000_000).toFixed(1)}M`;
                    } else if (Math.abs(value) >= 1_000) {
                        return `$${(value / 1_000).toFixed(1)}K`;
                    } else {
                        return `$${value.toFixed(2)}`;
                    }
                } else {
                    return 'N/A';
                }
            }
            const tickCount = 5;
            const range = maxVal - minVal;
            const tickInterval = range / tickCount;
            ctx.lineWidth = 0;
            ctx.shadowBlur = 0;
            for (let i = 0; i <= tickCount; i++) {
                const value = minVal + i * tickInterval;
                const position = _grid.Y(value);
                const cxmin = _grid.X(_grid.xmin);

                ctx.moveTo(cxmin, position);
                ctx.lineTo(cxmin - 5, position);

                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let text;
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000_000) {
                        text = `$${(value / 1_000_000).toFixed(1)}M`;
                    } else {
                        try {
                            text = formatCurrency(value)
                        } catch (exception) {

                        }
                    }
                } else {
                    text = 'N/A';
                }

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        }
        const percentAxis = (ctx, _grid, minVal, maxVal) => {
            const tickCount = 5;
            const range = maxVal - minVal;
            const tickInterval = range / tickCount;
            ctx.lineWidth = 0;
            ctx.shadowBlur = 0;

            for (let i = 0; i <= tickCount; i++) {
                const value = minVal + i * tickInterval;
                const position = _grid.Y(value);
                const cxmin = _grid.X(_grid.xmin);

                ctx.moveTo(cxmin, position);
                ctx.lineTo(cxmin - 5, position);

                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let text;
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000_000) {
                        text = `${(value / 1_000_000).toFixed(1)}M%`;
                    } else if (Math.abs(value) >= 1_000) {
                        text = `${(value / 1_000).toFixed(1)}K%`;
                    } else {
                        text = `${value.toFixed(1)}%`;
                    }
                } else {
                    text = 'N/A';
                }

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        };

        const thousandsAxis = (ctx, _grid, minVal, maxVal) => {
            const tickCount = 5;
            const range = maxVal - minVal;
            const tickInterval = range / tickCount;
            ctx.lineWidth = 0;
            ctx.shadowBlur = 0;

            for (let i = 0; i <= tickCount; i++) {
                const value = minVal + i * tickInterval;
                const position = _grid.Y(value);
                const cxmin = _grid.X(_grid.xmin);

                ctx.moveTo(cxmin, position);
                ctx.lineTo(cxmin - 5, position);

                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let text;
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000) {
                        text = `${(value / 1_000).toFixed(1)}K`;
                    } else {
                        text = `${value.toFixed(1)}`;
                    }
                } else {
                    text = 'N/A';
                }

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        };



        const colorOutOfBounds = 'lightRed';

        function isOutsideViewport(x, y, sw, sh_height) {
            return x < 0 || y < 0 || x > sw || y > sh_height;
        }
        function analyzePoints(allScatterData) {
            const points = allScatterData.points;

            const xValues = points.map(point => parseFloat(point.x));
            const areAllFloats = xValues.every(value => !isNaN(value));

            if (areAllFloats) {

                const xmin = Math.min(...xValues);
                const xmax = Math.max(...xValues);
                return { xmin, xmax };
            } else {

                const areAllStrings = points.every(point => typeof point.x === "string");
                if (areAllStrings) {

                    const xmin = 0;
                    const xmax = points.length;
                    return { xmin, xmax };
                } else {
                    console.log("x values must all be either castable to floats or strings.");
                    const xmin = 0;
                    const xmax = points.length;
                    return { xmin, xmax };

                }
            }
        }
        function drawArrowFromPoint(ctx, point, toRect, graph, pt, highlight) {
            const fromX = graph.X(point.x);
            const fromY = graph.Y(point.y);
            const toY = pt.grid.Y(toRect.grid.yi);
            const toX = pt.grid.X(toRect.grid.xi);
            const toCenterX = toX + pt.grid.screenWidth(toRect.getWidth()) / 2;
            const toCenterY = toY - pt.grid.screenHeight(toRect.getHeight());

            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toCenterX, toCenterY);
            if (highlight)
                ctx.strokeStyle = "rgba(36, 175, 255, 0.5)";
            else
                ctx.strokeStyle = "rgba(149, 216, 179, 0.5)";
            ctx.lineWidth = 10;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(fromX, fromY, 3, 0, Math.PI * 2);
            ctx.fillStyle = "red";
            ctx.fill();
            ctx.strokeStyle = "rgba(12, 34, 5, 0.8)";
            ctx.lineWidth = 2;
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

        function isMouseOverArrow(mouseX, mouseY, point, graph, pt, tolerance = 5) {
            const fromX = graph.X(point.startX);
            const toCenterX = graph.X(point.x);
            let pointY = graph.Y(point.y);
            if (point.scy)
                pointY = point.scy;
            const horizontalDistance = distanceFromPointToHorizontalSegment(mouseX, fromX, toCenterX);
            const verticalDistance = Math.abs(mouseY - pointY);

            return (horizontalDistance <= tolerance && verticalDistance <= tolerance);
        }

        function getXFromDate(date, xMin, xMax, start, end) {
            const totalCanvasRange = xMax - xMin;
            const totalTimeRange = end.getTime() - start.getTime();
            const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

            const normalizedTime = timeSinceStart / totalTimeRange;
            return xMin + normalizedTime * totalCanvasRange;
        }

        function distanceFromPointToHorizontalSegment(px, x1, x2) {

            if (px < x1) {
                return x1 - px;
            } else if (px > x2) {
                return px - x2;
            } else {
                return 0;
            }
        }

        function distanceFromPointToLineSegment(px, py, x1, y1, x2, y2) {
            const A = px - x1;
            const B = py - y1;
            const C = x2 - x1;
            const D = y2 - y1;

            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;

            let xx, yy;

            if (param < 0) {
                xx = x1;
                yy = y1;
            } else if (param > 1) {
                xx = x2;
                yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }

            const dx = px - xx;
            const dy = py - yy;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function stringToPattern(str, flags = '') {
            const escapedStr = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escapedStr, flags);
        }
        function getRandomColor() {

            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            const a = 1
            return `rgb(${r},${g},${b})`;
        }

        let parseInput = (inputString) => {
            const parsedObj = {};
            const lines = inputString.trim().split('\n');
            lines.forEach(line => {
                const [key, value] = line.split('=');
                if (key !== undefined && value !== undefined) {
                    parsedObj[key.trim()] = value.trim();
                } else {
                    console.warn(`Invalid line format: ${line}`);
                }
            });

            return parsedObj;
        }
        let highlightTab = null;
        let ref;

        const scatter = 'scatter';
        const barchart = 'barchart'
        const pie = 'pie'
        const timeline = 'timeline';
        const minIconSize = 48;

        let comp;
        let innerComponentCallback = createIonFunction(async (innerComponent) => {
            comp = innerComponent;
            setTimeout(async () => {
                await comp.refresh();
            }, 700)
        });
        function _fmtDateMDY(d) {

            const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
            return `${mo} ${d.getDate()}, ${d.getFullYear()}`;
        }
        function normalizedRect(x, y, w, h) {
            const nx = Math.min(x, x + w);
            const ny = Math.min(y, y + h);
            const nw = Math.abs(w);
            const nh = Math.abs(h);
            return { x: nx, y: ny, w: nw, h: nh };
        }

        function drawResizeHandle(ctx, brx, bry, size, active, __callout) {
            ctx.save();

            const fillBase = active ? 'rgba(0, 255, 255, 1)' : 'rgba(224,255,255,0.35)';
            const strokeBase = active ? 'rgba(63, 10, 255, 0.95)' : 'rgba(0,140,180,0.55)';
            const chevronInk = active ? 'rgba(0,110,150,0.95)' : 'rgba(0,110,150,0.7)';
            const glowColor = 'rgba(255, 0, 234, 0.45)';

            ctx.lineWidth = active ? 2 : 1.5;
            ctx.shadowColor = active ? glowColor : 'rgba(0,0,0,0.15)';
            ctx.shadowBlur = active ? 5 : 2;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;

            ctx.beginPath();
            ctx.moveTo(brx, bry);
            ctx.lineTo(brx - size, bry);
            ctx.lineTo(brx, bry - size);
            ctx.closePath();
            ctx.fillStyle = fillBase;
            ctx.fill();

            ctx.strokeStyle = strokeBase;
            ctx.stroke();

            ctx.shadowBlur = active ? 4 : 1;
            ctx.lineCap = 'butt';

            const leg = Math.max(6, size * 0.65);
            const legThick = Math.max(2, Math.floor(size * 0.12));
            ctx.lineWidth = legThick;
            ctx.strokeStyle = strokeBase;

            ctx.beginPath();
            ctx.moveTo(brx - 0.5, bry - 0.5);
            ctx.lineTo(brx - leg, bry - 0.5);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(brx - 0.5, bry - 0.5);
            ctx.lineTo(brx - 0.5, bry - leg);
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.lineWidth = Math.max(1, Math.floor(size * 0.08));
            ctx.strokeStyle = chevronInk;

            const d1 = size * 0.25;
            const d2 = size * 0.45;
            const d3 = size * 0.65;
            const len = Math.max(6, size * 0.24);

            const drawChevron = (off) => {
                ctx.beginPath();
                ctx.moveTo(brx - off - len, bry - off);
                ctx.lineTo(brx - off, bry - off - len);
                ctx.stroke();
            };
            drawChevron(d1);
            drawChevron(d2);
            drawChevron(d3);

            if (active) {
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.beginPath();
                ctx.arc(brx - 1, bry - 1, Math.max(2, size * 0.08), 0, Math.PI * 2);
                ctx.fill();
            }

            if (__callout) {

                const text = 'Resize window',
                    show = true,
                    font = '13px Arial',
                    textColor = '#000',
                    bg = 'rgba(255,255,255,0.95)',
                    border = 'rgba(0,0,0,0.25)',
                    padX = 8,
                    padY = 5,
                    gap = 8,
                    shaftWidth = 2,
                    headSize = 7,
                    glow = true,
                    offsetX = 30,
                    offsetY = 30,
                    __cornerTarget = 0.35

                if (show && text) {
                    ctx.save();
                    ctx.font = font;

                    const m = ctx.measureText(text);
                    const textW = Math.ceil(m.width);
                    const textH = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 11;
                    const boxW = textW + 2 * padX;
                    const boxH = textH + 2 * padY;

                    const triRight = brx;
                    const triBottom = bry;

                    const boxX = Math.round(triRight + offsetX);
                    const boxY = Math.round(triBottom + offsetY);

                    if (glow) {
                        ctx.shadowColor = 'rgba(0,0,0,0.25)';
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 1;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    const rr = (c, x, y, w, h, r = 6) => {
                        c.beginPath();
                        c.moveTo(x + r, y);
                        c.lineTo(x + w - r, y);
                        c.quadraticCurveTo(x + w, y, x + w, y + r);
                        c.lineTo(x + w, y + h - r);
                        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                        c.lineTo(x + r, y + h);
                        c.quadraticCurveTo(x, y + h, x, y + h - r);
                        c.lineTo(x, y + r);
                        c.quadraticCurveTo(x, y, x + r, y);
                        c.closePath();
                    };
                    ctx.fillStyle = bg;
                    ctx.strokeStyle = border;
                    ctx.lineWidth = 1;
                    rr(ctx, boxX, boxY, boxW, boxH, 6);
                    ctx.fill();
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = textColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, boxX + boxW / 2, boxY + boxH / 2);

                    const t = Math.max(0, Math.min(1, __cornerTarget));
                    const hitX = brx - size * t;
                    const hitY = bry - size * t;

                    const baseX = boxX;
                    const baseY = boxY;
                    const dx = hitX - baseX;
                    const dy = hitY - baseY;
                    const lenLine = Math.max(1, Math.hypot(dx, dy));
                    const ux = dx / lenLine, uy = dy / lenLine;

                    const startX = baseX + ux * gap;
                    const startY = baseY + uy * gap;

                    const endX = hitX - ux * headSize;
                    const endY = hitY - uy * headSize;

                    if (glow) {
                        ctx.shadowColor = 'rgba(0,0,0,0.3)';
                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 1;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                    ctx.lineWidth = shaftWidth;
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();

                    ctx.fillStyle = 'rgba(0,0,0,0.9)';
                    ctx.beginPath();
                    ctx.moveTo(hitX, hitY);
                    ctx.lineTo(
                        hitX - ux * headSize - uy * headSize * 0.6,
                        hitY - uy * headSize + ux * headSize * 0.6
                    );
                    ctx.lineTo(
                        hitX - ux * headSize + uy * headSize * 0.6,
                        hitY - uy * headSize - ux * headSize * 0.6
                    );
                    ctx.closePath();
                    ctx.fill();

                    ctx.restore();
                }

            }

            ctx.restore();
        }

        function _utcDate(y, m, d = 1, hh = 0, mm = 0, ss = 0) {
            return new Date(Date.UTC(y, m, d, hh, mm, ss));
        }
        function _yearLabel(astronomicalYear) {
            return astronomicalYear <= 0 ? `${1 - astronomicalYear} BCE` : `${astronomicalYear}`;
        }

        function drawWrappedText(ctx, text, x, startY, maxWidth, lineHeight) {
            const words = String(text || '').split(/\s+/);
            let line = '';
            let y = startY;

            const drawLine = (ln) => {
                if (!ln) return;
                ctx.textAlign = 'center';
                ctx.fillText(ln, x, y);
                y += lineHeight;
            };

            for (let i = 0; i < words.length; i++) {
                const test = line ? line + ' ' + words[i] : words[i];
                if (ctx.measureText(test).width > maxWidth && line) {
                    drawLine(line);
                    line = words[i];
                } else {
                    line = test;
                }
            }
            drawLine(line);
            return y;
        }

        const HANDLE_W = 16;
        const HANDLE_H = 26;
        const HIT_TOLERANCE_X = 6;
        const HIT_TOLERANCE_Y = 6;

        function hitHandle(point, mouseX, mouseY, w = HANDLE_W, h = HANDLE_H) {
            if (point.start_scx == null || point.end_scx == null || point.scy == null) return null;

            const halfW = w / 2 + HIT_TOLERANCE_X;
            const halfH = h / 2 + HIT_TOLERANCE_Y;

            const startLeft = point.start_scx - halfW;
            const startTop = point.scy - halfH;
            const endLeft = point.end_scx - halfW;
            const endTop = point.scy - halfH;

            const overStart = (
                mouseX >= startLeft && mouseX <= startLeft + 2 * halfW &&
                mouseY >= startTop && mouseY <= startTop + 2 * halfH
            );
            if (overStart) return "start";

            const overEnd = (
                mouseX >= endLeft && mouseX <= endLeft + 2 * halfW &&
                mouseY >= endTop && mouseY <= endTop + 2 * halfH
            );
            if (overEnd) return "end";

            const nearLineY = Math.abs(mouseY - point.scy) <= halfH;
            const nearStartX = Math.abs(mouseX - point.start_scx) <= halfW + 4;
            const nearEndX = Math.abs(mouseX - point.end_scx) <= halfW + 4;

            if (nearLineY && nearStartX) return "start";
            if (nearLineY && nearEndX) return "end";

            return null;
        }

        function drawVerticalHandle(
            ctx,
            x,
            centerY,
            baseColor,
            opts = {},
            _time_label
        ) {

            const {

                highlight = false,
                selected = false,

                width = (typeof HANDLE_W !== "undefined" ? HANDLE_W : 6),
                height = (typeof HANDLE_H !== "undefined" ? Math.max(18, HANDLE_H) : 26),
                radius = 3,

                labelOffset = 6,
                labelFontSize = 12,
                labelFontFamily = "Arial",
                textColor,

                shadow = null,
                labelShadow = null,
                master = true,

                formatDate,
                timeZone,
                dateStyle = "medium",
                timeStyle = "short"
            } = opts;

            const w = width;
            const h = Math.max(18, height);
            const r = radius;
            const left = x - w / 2;
            const top = centerY - h / 2;

            let labelText = "";
            if (_time_label != null) {
                const d = _time_label instanceof Date
                    ? _time_label
                    : (typeof _time_label === "number" ? new Date(_time_label) : null);

                if (d && !isNaN(d.getTime())) {
                    if (typeof formatDate === "function") {
                        labelText = String(formatDate(d));
                    } else {
                        const fmt = new Intl.DateTimeFormat(undefined, {
                            dateStyle,
                            timeStyle,
                            ...(timeZone ? { timeZone } : {})
                        });
                        labelText = fmt.format(d);
                    }
                } else {

                    labelText = String(_time_label);
                }
            }

            ctx.save();

            ctx.lineWidth = (highlight || selected) ? 3 : 2;
            ctx.strokeStyle = baseColor;

            let fillGradient = ctx.createLinearGradient(left, top, left, top + h);
            if (selected) {

                fillGradient.addColorStop(0, "rgba(255, 102, 153, 0.95)");
                fillGradient.addColorStop(1, "rgba(255, 51, 102, 0.8)");
            } else if (highlight) {

                fillGradient.addColorStop(0, "rgba(255,255,255,1.0)");
                fillGradient.addColorStop(1, "rgba(230,255,230,0.95)");
            } else {

                fillGradient.addColorStop(0, "rgba(255,255,255,0.95)");
                fillGradient.addColorStop(1, "rgba(245,245,245,0.9)");
            }
            ctx.fillStyle = fillGradient;

            if (shadow) {
                applyShadow(ctx, shadow, master);
            } else if (master && (highlight || selected)) {
                ctx.shadowColor = selected ? "rgba(255,0,128,0.8)" : baseColor;
                ctx.shadowBlur = selected ? 12 : 8;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 1;
            }

            ctx.beginPath();
            ctx.moveTo(left + r, top);
            ctx.arcTo(left + w, top, left + w, top + h, r);
            ctx.arcTo(left + w, top + h, left, top + h, r);
            ctx.arcTo(left, top + h, left, top, r);
            ctx.arcTo(left, top, left + w, top, r);
            ctx.closePath();
            ctx.fill();

            clearShadow(ctx);
            ctx.stroke();

            if (labelText) {
                ctx.font = `${labelFontSize}px ${labelFontFamily}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";

                const padX = 6;
                const padY = 3;
                const textWidth = ctx.measureText(labelText).width;
                const pillW = textWidth + padX * 2;
                const pillH = labelFontSize + padY * 2;
                const pillX = x - pillW / 2;
                const pillY = top - labelOffset - pillH;

                if (labelShadow) {
                    applyShadow(ctx, labelShadow, master);
                } else {

                    if (master && (highlight || selected)) {
                        ctx.shadowColor = selected ? "rgba(255,0,128,0.25)" : "rgba(0,0,0,0.18)";
                        ctx.shadowBlur = selected ? 10 : 6;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 2;
                    }
                }

                ctx.fillStyle = "rgba(255,255,255,0.95)";
                ctx.strokeStyle = selected ? "rgba(255, 60, 130, 0.9)" : baseColor;
                ctx.lineWidth = 1;

                ctx.beginPath();
                const rr = 6;
                ctx.moveTo(pillX + rr, pillY);
                ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, rr);
                ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, rr);
                ctx.arcTo(pillX, pillY + pillH, pillX, pillY, rr);
                ctx.arcTo(pillX, pillY, pillX + pillW, pillY, rr);
                ctx.closePath();
                ctx.fill();

                clearShadow(ctx);
                ctx.stroke();

                ctx.fillStyle = textColor || (selected ? "rgba(255, 60, 130, 1)" : baseColor);
                ctx.fillText(labelText, x, pillY + pillH - padY);
            }

            ctx.restore();
        }

        function updateHandleHover(points, mouseX, mouseY) {

            let hovered = null;

            for (let i = points.length - 1; i >= 0; i--) {
                const p = points[i];

                if (!p.isSelected) { p.hoverHandle = null; continue; }

                const which = hitHandle(p, mouseX, mouseY);
                if (which) {
                    p.hoverHandle = which;
                    if (!hovered) hovered = { point: p, handle: which, index: i };
                } else {
                    p.hoverHandle = null;
                }
            }

            if (hovered) {
                for (let i = points.length - 1; i >= 0; i--) {
                    if (i !== hovered.index) points[i].hoverHandle = null;
                }
            }

            if (typeof canvas !== "undefined") {
                canvas.style.cursor = hovered ? "ew-resize" : "default";
            }

            return hovered;
        }

        const DEFAULT_THEME = {
            name: "default-classic",
            colors: { handle: "#2a6b2a", text: "#222", line: "#2a6b2a", background: "#ffffff" },
            effects: {
                strokeWidth: 7,
                displayTextWrapper: false,
                shadows: { enabled: true }
            },
            fonts: { family: "Arial", weight: "400" },
            sizes: { plot: { minTiny: 25, minSmall: 25, insetX: 25, insetY: 25 } },
            surfaces: {
                panel: {
                    bg: "#ffffff",
                    border: { color: "rgba(0,0,0,0.12)", width: 1, radius: 8 },
                    shadow: null,
                    resizing: { fill: "rgba(240,151,227,0.10)", shadow: null },
                    highlight: { shadow: null }
                }
            },
            states: { broken: { fill: "red", overlay: "rgba(100,30,90,0.7)", textFont: "12px Arial" } }
        };

        const THEMES = {
            "classic-light": {
                name: "classic-light",
                colors: {
                    handle: "#2a6b2a",
                    text: "#222",
                    line: "#22e922ff",
                    background: "#ffffff"
                },
                effects: {
                    strokeWidth: 5,
                    displayTextWrapper: false,
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(0,0,0,0.25)", blur: 6, offsetX: 0, offsetY: 2 },
                        text: { color: "rgba(0,0,0,0.15)", blur: 4, offsetX: 0, offsetY: 1 }
                    }
                },
                fonts: { family: "Arial", weight: "400", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 25, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#ffffff",
                        border: { color: "rgba(0,0,0,0.12)", width: 1, radius: 8 },
                        shadow: { color: "rgba(0,0,0,0.08)", blur: 8, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(240,151,227,0.10)",
                            shadow: { color: "rgba(0,0,0,0.25)", blur: 11, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(0,0,0,0.20)", blur: 10, offsetX: 0, offsetY: 2 }
                        }
                    }
                },
                states: { broken: { fill: "red", overlay: "rgba(100,30,90,0.7)", textFont: "22px Arial" } }
            },

            "midnight-dark": {
                name: "midnight-dark",
                colors: {
                    handle: "#4fd1c5",
                    text: "#1eff00ff",
                    line: "#4fd1c5",
                    background: "#0b0c10"
                },
                effects: {
                    strokeWidth: 4,
                    displayTextWrapper: false,
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(79,209,197,0.6)", blur: 12, offsetX: 0, offsetY: 0 },
                        text: { color: "rgba(0,0,0,0.7)", blur: 8, offsetX: 0, offsetY: 2 }
                    }
                },
                fonts: { family: "Roboto Mono", weight: "500", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 25, insetX: 0, insetY: 125 } },
                surfaces: {
                    panel: {
                        bg: "#0b0c10",
                        border: { color: "rgba(255,255,255,0.08)", width: 1, radius: 8 },
                        shadow: { color: "rgba(0,0,0,0.6)", blur: 14, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(79,209,197,0.08)",
                            shadow: { color: "rgba(0,0,0,0.45)", blur: 12, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(79,209,197,0.25)", blur: 12, offsetX: 0, offsetY: 0 }
                        }
                    }
                },
                states: { broken: { fill: "#5d001e", overlay: "rgba(255,0,80,0.5)", textFont: "12px Arial" } }
            },

            "ocean-breeze": {
                name: "ocean-breeze",
                colors: {
                    handle: "#0077b6",
                    text: "#003049",
                    line: "#00b4d8",
                    background: "#caf0f8"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(0,119,182,0.5)", blur: 10, offsetX: 0, offsetY: 1 },
                        text: { color: "rgba(0,0,0,0.2)", blur: 5, offsetX: 0, offsetY: 1 }
                    }
                },
                fonts: { family: "Lato", weight: "400", sizeMain: 14, sizeSmall: 18, min: 22 },
                sizes: { plot: { minTiny: 25, minSmall: 25, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#e6f7ff",
                        border: { color: "rgba(0,60,100,0.12)", width: 1, radius: 8 },
                        shadow: { color: "rgba(0,80,120,0.15)", blur: 10, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(0,180,216,0.08)",
                            shadow: { color: "rgba(0,80,120,0.25)", blur: 10, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(0,119,182,0.20)", blur: 10, offsetX: 0, offsetY: 1 }
                        }
                    }
                },
                states: { broken: { fill: "#ffecd1", overlay: "rgba(200,50,50,0.45)", textFont: "18px Arial" } }
            },

            "solar-flare": {
                name: "solar-flare",
                colors: {
                    handle: "#ff6b35",
                    text: "#2b2d42",
                    line: "#ff6b35",
                    background: "#fff3e0"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(255,107,53,0.5)", blur: 8, offsetX: 0, offsetY: 1 },
                        text: { color: "rgba(255,107,53,0.2)", blur: 4, offsetX: 0, offsetY: 1 }
                    }
                },
                fonts: { family: "Montserrat", weight: "500", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 25, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#fff7eb",
                        border: { color: "rgba(255,107,53,0.25)", width: 1, radius: 8 },
                        shadow: { color: "rgba(255,140,0,0.18)", blur: 10, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(255,107,53,0.08)",
                            shadow: { color: "rgba(255,140,0,0.28)", blur: 11, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(255,140,0,0.30)", blur: 12, offsetX: 0, offsetY: 2 }
                        }
                    }
                },
                states: { broken: { fill: "#ffe8cc", overlay: "rgba(200,60,60,0.45)", textFont: "22px Arial" } }
            },

            "neon-grid": {
                name: "neon-grid",
                colors: {
                    handle: "#39ff14",
                    text: "#e0ffe0",
                    line: "#39ff14",
                    background: "#0d0221"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(57,255,20,0.8)", blur: 16, offsetX: 0, offsetY: 0 },
                        text: { color: "rgba(57,255,20,0.4)", blur: 10, offsetX: 0, offsetY: 0 }
                    }
                },
                fonts: { family: "Orbitron", weight: "600", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 25, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#0d0221",
                        border: { color: "rgba(57,255,20,0.25)", width: 1, radius: 8 },
                        shadow: { color: "rgba(0,0,0,0.7)", blur: 16, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(57,255,20,0.06)",
                            shadow: { color: "rgba(57,255,20,0.30)", blur: 12, offsetX: 0, offsetY: 0 }
                        },
                        highlight: {
                            shadow: { color: "rgba(57,255,20,0.35)", blur: 14, offsetX: 0, offsetY: 0 }
                        }
                    }
                },
                states: { broken: { fill: "#2b0039", overlay: "rgba(255,0,255,0.35)", textFont: "22px Arial" } }
            },

            "autumn-fields": {
                name: "autumn-fields",
                colors: {
                    handle: "#d77a61",
                    text: "#382923",
                    line: "#d77a61",
                    background: "#f7e7ce"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(215,122,97,0.4)", blur: 6, offsetX: 0, offsetY: 2 },
                        text: { color: "rgba(0,0,0,0.25)", blur: 4, offsetX: 0, offsetY: 1 }
                    }
                },
                fonts: { family: "Georgia", weight: "400", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 15, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#fbf1dc",
                        border: { color: "rgba(100,60,40,0.18)", width: 1, radius: 8 },
                        shadow: { color: "rgba(90,60,40,0.18)", blur: 8, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(215,122,97,0.08)",
                            shadow: { color: "rgba(90,60,40,0.28)", blur: 10, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(215,122,97,0.25)", blur: 10, offsetX: 0, offsetY: 2 }
                        }
                    }
                },
                states: { broken: { fill: "#ffd8c2", overlay: "rgba(160,40,40,0.45)", textFont: "18px Arial" } }
            },

            "cyberpunk-pink": {
                name: "cyberpunk-pink",
                colors: {
                    handle: "#ff00ff",
                    text: "#ffe6ff",
                    line: "#ff00ff",
                    background: "#0a0014"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(255,0,255,0.8)", blur: 14, offsetX: 0, offsetY: 0 },
                        text: { color: "rgba(255,0,255,0.3)", blur: 6, offsetX: 0, offsetY: 0 }
                    }
                },
                fonts: { family: "Courier New", weight: "700", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 15, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#0a0014",
                        border: { color: "rgba(255,0,255,0.18)", width: 1, radius: 8 },
                        shadow: { color: "rgba(0,0,0,0.7)", blur: 14, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(255,0,255,0.06)",
                            shadow: { color: "rgba(255,0,255,0.28)", blur: 12, offsetX: 0, offsetY: 0 }
                        },
                        highlight: {
                            shadow: { color: "rgba(255,0,255,0.35)", blur: 14, offsetX: 0, offsetY: 0 }
                        }
                    }
                },
                states: { broken: { fill: "#23001f", overlay: "rgba(255,0,160,0.45)", textFont: "16px Arial" } }
            },

            "forest-mist": {
                name: "forest-mist",
                colors: {
                    handle: "#2e8b57",
                    text: "#1b4332",
                    line: "#2e8b57",
                    background: "#d8f3dc"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(46,139,87,0.5)", blur: 8, offsetX: 0, offsetY: 2 },
                        text: { color: "rgba(0,0,0,0.15)", blur: 4, offsetX: 0, offsetY: 1 }
                    }
                },
                fonts: { family: "Nunito", weight: "500", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 25, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#edf6f0",
                        border: { color: "rgba(30,100,70,0.16)", width: 1, radius: 8 },
                        shadow: { color: "rgba(30,100,70,0.16)", blur: 9, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(46,139,87,0.08)",
                            shadow: { color: "rgba(30,100,70,0.28)", blur: 10, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(46,139,87,0.28)", blur: 10, offsetX: 0, offsetY: 2 }
                        }
                    }
                },
                states: { broken: { fill: "#ccebd7", overlay: "rgba(160,40,40,0.45)", textFont: "16px Arial" } }
            },

            "slate-tech": {
                name: "slate-tech",
                colors: {
                    handle: "#5bc0de",
                    text: "#e6edf3",
                    line: "#5bc0de",
                    background: "#1c1f26"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(91,192,222,0.6)", blur: 10, offsetX: 0, offsetY: 1 },
                        text: { color: "rgba(0,0,0,0.4)", blur: 6, offsetX: 0, offsetY: 1 }
                    }
                },
                fonts: { family: "Segoe UI", weight: "500", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 35, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#15181f",
                        border: { color: "rgba(255,255,255,0.08)", width: 1, radius: 8 },
                        shadow: { color: "rgba(0,0,0,0.55)", blur: 12, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(91,192,222,0.08)",
                            shadow: { color: "rgba(0,0,0,0.45)", blur: 12, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(91,192,222,0.28)", blur: 12, offsetX: 0, offsetY: 1 }
                        }
                    }
                },
                states: { broken: { fill: "#2a2d36", overlay: "rgba(200,60,60,0.45)", textFont: "22px Arial" } }
            },

            "vintage-paper": {
                name: "vintage-paper",
                colors: {
                    handle: "#b5651d",
                    text: "#3e2723",
                    line: "#795548",
                    background: "#f5deb3"
                },
                effects: {
                    shadows: {
                        enabled: true,
                        handle: { color: "rgba(181,101,29,0.4)", blur: 6, offsetX: 0, offsetY: 2 },
                        text: { color: "rgba(0,0,0,0.2)", blur: 4, offsetX: 0, offsetY: 1 }
                    }
                },
                fonts: { family: "Times New Roman", weight: "400", sizeMain: 18, sizeSmall: 16, min: 14 },
                sizes: { plot: { minTiny: 15, minSmall: 35, insetX: 25, insetY: 25 } },
                surfaces: {
                    panel: {
                        bg: "#fff1cc",
                        border: { color: "rgba(121,85,72,0.22)", width: 1, radius: 8 },
                        shadow: { color: "rgba(121,85,72,0.20)", blur: 8, offsetX: 0, offsetY: 2 },
                        resizing: {
                            fill: "rgba(181,101,29,0.08)",
                            shadow: { color: "rgba(121,85,72,0.28)", blur: 10, offsetX: 0, offsetY: 2 }
                        },
                        highlight: {
                            shadow: { color: "rgba(121,85,72,0.30)", blur: 10, offsetX: 0, offsetY: 2 }
                        }
                    }
                },
                states: { broken: { fill: "#ffe0b3", overlay: "rgba(160,40,40,0.45)", textFont: "22px Arial" } }
            }
        };

        THEMES["purple-rain"] = {
            name: "purple-rain",
            colors: {
                handle: "#7b2cbf",
                text: "#f2e9ff",
                line: "#9d4edd",
                arrow: "#c77dff",
                panelBg: "#240046",
                panelBorder: "#5a189a",
                background: "#10002b"
            },
            fonts: {
                family: "Inter, system-ui, sans-serif",
                size: 12,
                weight: 500
            },
            sizes: {
                handleRadius: 6,
                arrowSize: 8,
                panelRadius: 6,
                lineWidth: 2
            },
            effects: {
                strokeWidth: 2,
                displayTextWrapper: true,
                shadows: {
                    enabled: true,
                    line: { color: "rgba(157,78,221,0.45)", blur: 8, offsetX: 0, offsetY: 2 },
                    arrow: { color: "rgba(199,125,255,0.5)", blur: 10, offsetX: 0, offsetY: 3 },
                    panel: { color: "rgba(0,0,0,0.5)", blur: 14, offsetX: 0, offsetY: 4 },
                    text: { color: "rgba(0,0,0,0.6)", blur: 4, offsetX: 0, offsetY: 1 }
                }
            },
            surfaces: {
                panelOpacity: 0.9
            }
        };

        THEMES["raspberry-beret"] = {
            name: "raspberry-beret",
            colors: {
                handle: "#a4133c",
                text: "#3a0a1a",
                line: "#ff4d6d",
                arrow: "#ff758f",
                panelBg: "#fff0f3",
                panelBorder: "#ff8fa3",
                background: "#ffffff"
            },
            fonts: {
                family: "Inter, system-ui, sans-serif",
                size: 12,
                weight: 500
            },
            sizes: {
                handleRadius: 6,
                arrowSize: 8,
                panelRadius: 6,
                lineWidth: 2
            },
            effects: {
                strokeWidth: 2,
                displayTextWrapper: true,
                shadows: {
                    enabled: true,
                    line: { color: "rgba(255,77,109,0.35)", blur: 6, offsetX: 0, offsetY: 2 },
                    arrow: { color: "rgba(255,117,143,0.4)", blur: 8, offsetX: 0, offsetY: 2 },
                    panel: { color: "rgba(0,0,0,0.15)", blur: 10, offsetX: 0, offsetY: 3 },
                    text: { color: "rgba(0,0,0,0.25)", blur: 3, offsetX: 0, offsetY: 1 }
                }
            },
            surfaces: {
                panelOpacity: 0.95
            }
        };

        THEMES["yellow"] = {
            name: "yellow",
            colors: {
                handle: "#fca311",
                text: "#3a2e00",
                line: "#ffbe0b",
                arrow: "#ffd60a",
                panelBg: "#fff9db",
                panelBorder: "#fca311",
                background: "#ffffff"
            },
            fonts: {
                family: "Inter, system-ui, sans-serif",
                size: 12,
                weight: 500
            },
            sizes: {
                handleRadius: 6,
                arrowSize: 8,
                panelRadius: 6,
                lineWidth: 2
            },
            effects: {
                strokeWidth: 2,
                displayTextWrapper: true,
                shadows: {
                    enabled: true,
                    line: { color: "rgba(252,163,17,0.35)", blur: 6, offsetX: 0, offsetY: 2 },
                    arrow: { color: "rgba(255,214,10,0.4)", blur: 8, offsetX: 0, offsetY: 2 },
                    panel: { color: "rgba(0,0,0,0.2)", blur: 10, offsetX: 0, offsetY: 3 },
                    text: { color: "rgba(0,0,0,0.3)", blur: 3, offsetX: 0, offsetY: 1 }
                }
            },
            surfaces: {
                panelOpacity: 0.95
            }
        };

        THEMES["angry-bird"] = {
            name: "angry-bird",
            colors: {
                handle: "#d00000",
                text: "#2b0000",
                line: "#ff0000",
                arrow: "#ff4d4d",
                panelBg: "#fff1f1",
                panelBorder: "#d00000",
                background: "#ffffff"
            },
            fonts: {
                family: "Inter, system-ui, sans-serif",
                size: 12,
                weight: 600
            },
            sizes: {
                handleRadius: 7,
                arrowSize: 9,
                panelRadius: 6,
                lineWidth: 3
            },
            effects: {
                strokeWidth: 3,
                displayTextWrapper: true,
                shadows: {
                    enabled: true,
                    line: { color: "rgba(208,0,0,0.5)", blur: 8, offsetX: 1, offsetY: 3 },
                    arrow: { color: "rgba(255,0,0,0.6)", blur: 10, offsetX: 1, offsetY: 4 },
                    panel: { color: "rgba(0,0,0,0.35)", blur: 12, offsetX: 1, offsetY: 4 },
                    text: { color: "rgba(0,0,0,0.4)", blur: 4, offsetX: 0, offsetY: 1 }
                }
            },
            surfaces: {
                panelOpacity: 0.95
            }
        };

        THEMES["clockwork-orange"] = {
            name: "clockwork-orange",
            colors: {
                handle: "#fb8500",
                text: "#2b1d00",
                line: "#ff9f1c",
                arrow: "#ffb703",
                panelBg: "#fff4e6",
                panelBorder: "#fb8500",
                background: "#ffffff"
            },
            fonts: {
                family: "Inter, system-ui, sans-serif",
                size: 12,
                weight: 500
            },
            sizes: {
                handleRadius: 6,
                arrowSize: 8,
                panelRadius: 6,
                lineWidth: 2
            },
            effects: {
                strokeWidth: 2,
                displayTextWrapper: true,
                shadows: {
                    enabled: true,
                    line: { color: "rgba(251,133,0,0.4)", blur: 6, offsetX: 0, offsetY: 2 },
                    arrow: { color: "rgba(255,183,3,0.45)", blur: 8, offsetX: 0, offsetY: 3 },
                    panel: { color: "rgba(0,0,0,0.25)", blur: 10, offsetX: 0, offsetY: 3 },
                    text: { color: "rgba(0,0,0,0.3)", blur: 3, offsetX: 0, offsetY: 1 }
                }
            },
            surfaces: {
                panelOpacity: 0.95
            }
        };

        function mergeTheme(base, over) {
            if (!over || typeof over !== "object") return base;
            const out = { ...base };
            for (const k of ["colors", "effects", "fonts", "sizes", "surfaces", "states"]) {
                out[k] = { ...(base[k] || {}), ...(over[k] || {}) };
            }
            return out;
        }

        function isTheme(obj) {
            return obj && typeof obj === "object" && obj.colors && obj.surfaces && obj.surfaces.panel;
        }

        function getThemeSafe(ctx) {

            if (isTheme(ctx.theme)) return ctx.theme;

            const tmap = (typeof THEMES !== "undefined" && THEMES) || {};
            const byName = (ctx.themeName && tmap[ctx.themeName]) || null;

            if (isTheme(byName)) return mergeTheme(DEFAULT_THEME, byName);

            if (isTheme(tmap["classic-light"])) return mergeTheme(DEFAULT_THEME, tmap["classic-light"]);

            return DEFAULT_THEME;
        }

        function wrapText(ctx, text, maxWidth) {
            const words = String(text || '').split(' ');
            const lines = [];
            let line = '';
            for (const word of words) {
                const test = line ? `${line} ${word}` : word;
                if (ctx.measureText(test).width > maxWidth && line) {
                    lines.push(line);
                    line = word;
                } else {
                    line = test;
                }
            }
            if (line) lines.push(line);
            return lines;
        }

        function formatDurationLabel(startTs, endTs) {
            const diffMs = endTs - startTs;
            const diffMinutes = diffMs / (1000 * 60);
            const diffHours = diffMinutes / 60;
            const diffDays = diffHours / 24;

            if (diffDays >= 7) return `${(diffDays / 7).toFixed(1)} wk`;
            if (diffDays >= 1) return `${diffDays.toFixed(1)} d`;
            if (diffHours >= 1) return `${diffHours.toFixed(1)} h`;
            return `${diffMinutes.toFixed(1)} min`;
        }

        function applyShadow(ctx, spec, masterEnabled = true) {
            if (!masterEnabled || !spec) return;
            ctx.shadowColor = spec.color || 'transparent';
            ctx.shadowBlur = spec.blur ?? 0;
            ctx.shadowOffsetX = spec.offsetX ?? 0;
            ctx.shadowOffsetY = spec.offsetY ?? 0;
        }
        function applySelectShadow(ctx, spec, masterEnabled = true) {
            ctx.shadowColor = 'magenta';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 2;
        }
        function clearShadow(ctx) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        function addIntervalWithoutOverlap(scatterData, newPoint, grid, opts = {}) {
            const laneHeight = opts.laneHeight ?? 24;
            const marginY = opts.marginY ?? 2;
            const preferredY = (typeof newPoint.y === 'number')
                ? newPoint.y
                : (grid.ymin + grid.ymax) / 2;

            const normInterval = p => {
                const a = Math.min(p.startX, p.x);
                const b = Math.max(p.startX, p.x);
                return { a, b, y: p.y };
            };
            const overlapsX = (p, q) => {
                const P = normInterval(p);
                const Q = normInterval(q);

                return !(P.b < Q.a || Q.b < P.a);
            };

            const clampY = y => Math.max(grid.ymin, Math.min(grid.ymax, y));

            function isYFree(yCandidate) {
                for (const p of scatterData.points) {
                    if (!overlapsX(p, newPoint)) continue;
                    if (typeof p.y !== 'number') continue;

                    if (Math.abs(p.y - yCandidate) < (laneHeight - marginY)) {
                        return false;
                    }
                }
                return true;
            }

            const overlapping = scatterData.points.filter(p => overlapsX(p, newPoint));

            if (overlapping.length === 0) {
                newPoint.y = clampY(preferredY);
                scatterData.points.push(newPoint);
                return newPoint;
            }

            const laneIndex = y => Math.round((y - grid.ymin) / laneHeight);
            const laneY = idx => grid.ymin + idx * laneHeight;

            const occ = new Set();
            for (const p of overlapping) {
                if (typeof p.y !== 'number') continue;
                occ.add(laneIndex(p.y));
            }

            const maxLanes = Math.max(1, Math.floor((grid.ymax - grid.ymin) / laneHeight));

            const startLane = laneIndex(clampY(preferredY));
            const candidates = [];
            for (let k = 0; k < maxLanes; k++) {
                const d = Math.floor((k + 1) / 2) * (k % 2 === 0 ? 1 : -1);
                const idx = startLane + d;
                if (idx >= 0 && idx < maxLanes) candidates.push(idx);
            }

            for (const idx of candidates) {
                if (!occ.has(idx)) {
                    const yTry = laneY(idx);
                    if (isYFree(yTry)) {
                        newPoint.y = clampY(yTry);
                        scatterData.points.push(newPoint);
                        return newPoint;
                    }
                }
            }

            const step = Math.max(4, Math.floor(laneHeight / 3));
            let yDown = clampY(preferredY), yUp = clampY(preferredY);
            for (let i = 0; i < 1_000; i++) {

                yDown = clampY(yDown - step);
                if (isYFree(yDown)) {
                    newPoint.y = yDown;
                    scatterData.points.push(newPoint);
                    return newPoint;
                }

                yUp = clampY(yUp + step);
                if (isYFree(yUp)) {
                    newPoint.y = yUp;
                    scatterData.points.push(newPoint);
                    return newPoint;
                }

                if (yDown <= grid.ymin && yUp >= grid.ymax) break;
            }

            newPoint.y = clampY(preferredY);
            scatterData.points.push(newPoint);
            return newPoint;
        }

        function ellipsize(ctx, text, maxW) {
            if (ctx.measureText(text).width <= maxW) return text;
            const ELL = "…";
            let lo = 0, hi = text.length;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                const cand = text.slice(0, mid) + ELL;
                if (ctx.measureText(cand).width <= maxW) lo = mid; else hi = mid - 1;
            }
            return (lo <= 0) ? ELL : text.slice(0, lo) + ELL;
        }
        function indexPointsByName(points) {
            const map = new Map();
            for (const p of points) map.set(p.name, p);
            return map;
        }

        function drawArrowhead(ctx, x, y, angle, size = 7) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-size, size * 0.6);
            ctx.lineTo(-size, -size * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function bezierControls(p1, p2, arc = 0.25) {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            const lift = Math.max(40, dist * arc);
            const dir = dx === 0 ? 1 : Math.sign(dx);

            const c1 = { x: p1.x + dx * 0.25, y: p1.y - lift };
            const c2 = { x: p1.x + dx * 0.75, y: p2.y - lift };

            if (Math.abs(dx) < 30) {
                c1.x = p1.x + 60 * dir;
                c2.x = p2.x + 60 * dir;
            }

            return [c1, c2];
        }

        function cubicAt(p0, c1, c2, p3, t) {
            const mt = 1 - t;
            const x = mt ** 3 * p0.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * p3.x;
            const y = mt ** 3 * p0.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * p3.y;
            return { x, y };
        }

        function cubicTangentAngle(p0, c1, c2, p3, t) {
            const mt = 1 - t;
            const dx = 3 * mt ** 2 * (c1.x - p0.x) + 6 * mt * t * (c2.x - c1.x) + 3 * t ** 2 * (p3.x - c2.x);
            const dy = 3 * mt ** 2 * (c1.y - p0.y) + 6 * mt * t * (c2.y - c1.y) + 3 * t ** 2 * (p3.y - c2.y);
            return Math.atan2(dy, dx);
        }
        function getTargetPoint(points, name) {
            for (const p of points) {
                if (p.name === name) {
                    return p
                }
            }
            return null;
        }

        function drawPointConnections(ctx, points, opts = {}) {
            const {
                stroke = "#444",
                width = 1.5,
                labelFont = "12px sans-serif",
                labelPadding = 3,
                showBidirectional = false,
            } = opts;
            ctx.save();
            ctx.lineWidth = width;
            ctx.strokeStyle = stroke;
            ctx.fillStyle = stroke;
            for (const owner of points) {
                if (!owner.connections?.length) continue;
                for (const conn of owner.connections) {
                    if (!conn) continue;

                    const target = conn.name;

                    let targetPoint = getTargetPoint(points, target);
                    if (!targetPoint) continue;
                    const p0 = owner;
                    const p3 = targetPoint;
                    const [c1, c2] = bezierControls(p0, p3, 0.25);

                    ctx.beginPath();
                    ctx.moveTo(p0.x, p0.y);
                    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
                    ctx.stroke();

                    const tEnd = 0.975;
                    const end = cubicAt(p0, c1, c2, p3, tEnd);
                    const theta = cubicTangentAngle(p0, c1, c2, p3, tEnd);
                    drawArrowhead(ctx, end.x, end.y, theta, 7);

                    if (conn.txt) {
                        const mid = cubicAt(p0, c1, c2, p3, 0.5);
                        ctx.save();
                        ctx.font = labelFont;
                        const metrics = ctx.measureText(conn.txt);
                        const w = metrics.width + labelPadding * 2;
                        const h = 14 + labelPadding * 2;

                        ctx.fillStyle = "rgba(255,255,255,0.9)";
                        ctx.beginPath();
                        ctx.roundRect(mid.x - w / 2, mid.y - h - 4, w, h, 6);
                        ctx.fill();

                        ctx.fillStyle = "#111";
                        ctx.fillText(conn.txt, mid.x - w / 2 + labelPadding, mid.y - 4 + labelPadding + 10);
                        ctx.restore();
                    }
                }
            }

            ctx.restore();
        }

        function lanechange(point, ctx, xstart, ystart, x, y, opts = {}) {
            const {
                tension = 0.35,
                stroke = "#c5b2f0ff",
                width = 2,
                dash = null,
                head = true,
                headLen = 12,
                headWidth = 10,
                shadow = null,

                textColor = "#222",
                font = "14px Arial",
                textBg = null,
                textPad = 4,
                followTangent = true,
                crisp = false,
            } = opts;

            point.end_scx = x;
            point.start_scx = xstart;
            point.start_scy = ystart;
            point.end_scy = y;

            let text = point.name

            if (!text) {
                text = ''
            }

            const cubicPoint = (t, p0, p1, p2, p3) => {
                const mt = 1 - t;
                return (
                    mt * mt * mt * p0 +
                    3 * mt * mt * t * p1 +
                    3 * mt * t * t * p2 +
                    t * t * t * p3
                );
            };
            const cubicTangent = (t, p0, p1, p2, p3) => {
                const mt = 1 - t;
                return 3 * (
                    mt * mt * (p1 - p0) +
                    2 * mt * t * (p2 - p1) +
                    t * t * (p3 - p2)
                );
            };

            const dx = x - xstart;
            const dy = y - ystart;
            const len = Math.hypot(dx, dy) || 1;

            const ux = dx / len;
            const uy = dy / len;

            const px = -uy;
            const py = ux;

            const along = tension * len;
            const lateral = Math.min(24, 0.15 * len);

            const c1x = xstart + ux * (along * 0.6) + px * lateral;
            const c1y = ystart + uy * (along * 0.6) + py * lateral;

            const c2x = x - ux * (along * 0.6) - px * lateral;
            const c2y = y - uy * (along * 0.6) - py * lateral;

            ctx.save();

            if (shadow) {
                ctx.shadowBlur = shadow.blur ?? 0;
                ctx.shadowColor = shadow.color ?? "rgba(0,0,0,0.25)";
                ctx.shadowOffsetX = shadow.offsetX ?? 0;
                ctx.shadowOffsetY = shadow.offsetY ?? 0;
            }

            ctx.lineWidth = width;
            ctx.strokeStyle = stroke;
            if (dash) ctx.setLineDash(dash);

            ctx.beginPath();
            ctx.moveTo(xstart, ystart);
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
            ctx.stroke();

            if (head) {

                const tx = x - c2x;
                const ty = y - c2y;
                const tlen = Math.hypot(tx, ty) || 1;

                const vx = tx / tlen;
                const vy = ty / tlen;
                const px = -vy;
                const py = vx;

                const baseX = x - vx * headLen;
                const baseY = y - vy * headLen;
                const leftX = baseX + px * (headWidth / 2);
                const leftY = baseY + py * (headWidth / 2);
                const rightX = baseX - px * (headWidth / 2);
                const rightY = baseY - py * (headWidth / 2);

                const prevDash = ctx.getLineDash();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(leftX, leftY);
                ctx.lineTo(rightX, rightY);
                ctx.closePath();
                ctx.fillStyle = stroke;
                ctx.fill();

                ctx.lineJoin = "round";
                ctx.miterLimit = 0;
                ctx.lineWidth = Math.max(1, width);
                ctx.strokeStyle = stroke;
                ctx.stroke();

                ctx.setLineDash(prevDash);
            }

            if (text) {
                const t = 0.5;
                let mx = cubicPoint(t, xstart, c1x, c2x, x);
                let my = cubicPoint(t, ystart, c1y, c2y, y);
                if (crisp) {
                    mx = Math.round(mx) + 0.5;
                    my = Math.round(my) + 0.5;
                }

                const tx = cubicTangent(t, xstart, c1x, c2x, x);
                const ty = cubicTangent(t, ystart, c1y, c2y, y);
                let angle = Math.atan2(ty, tx);

                const prevDash = ctx.getLineDash();
                ctx.setLineDash([]);
                const prevShadow = { blur: ctx.shadowBlur, color: ctx.shadowColor, offsetX: ctx.shadowOffsetX, offsetY: ctx.shadowOffsetY };
                if (!shadow) {
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "transparent";
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                }

                ctx.save();
                ctx.font = font;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                const metrics = ctx.measureText(text);
                const tw = Math.max(metrics.width, 1);
                const th = Math.max(
                    Math.abs(metrics.actualBoundingBoxAscent || 0) + Math.abs(metrics.actualBoundingBoxDescent || 0),
                    parseInt(font, 10) || 14
                );

                const w = tw + (textPad * 2);
                const h = th + (textPad * 2);
                const ca = Math.cos(angle);
                const sa = Math.sin(angle);
                const rotatedH = Math.abs(w * sa) + Math.abs(h * ca);

                let useAngle = (followTangent ? angle : 0);
                const halfH = rotatedH / 2;
                const canvasH = ctx.canvas?.height ?? Number.POSITIVE_INFINITY;

                if (followTangent && (my - halfH < 0 || my + halfH > canvasH)) {
                    const TWO_PI = Math.PI * 2;

                    let a = angle % TWO_PI;
                    if (a <= -Math.PI) a += TWO_PI;
                    if (a > Math.PI) a -= TWO_PI;

                    if (a > Math.PI / 2) a -= Math.PI;
                    if (a < -Math.PI / 2) a += Math.PI;

                    angle = a;
                }

                ctx.translate(mx, my);
                if (useAngle !== 0) ctx.rotate(useAngle);

                if (textBg) {
                    const rw = w;
                    const rh = h;
                    const x0 = -rw / 2;
                    const y0 = -rh / 2;
                    const r = Math.min(8, rh / 2);
                    ctx.beginPath();
                    ctx.moveTo(x0 + r, y0);
                    ctx.arcTo(x0 + rw, y0, x0 + rw, y0 + rh, r);
                    ctx.arcTo(x0 + rw, y0 + rh, x0, y0 + rh, r);
                    ctx.arcTo(x0, y0 + rh, x0, y0, r);
                    ctx.arcTo(x0, y0, x0 + rw, y0, r);
                    ctx.closePath();
                    ctx.fillStyle = textBg;
                    ctx.fill();
                }

                ctx.fillStyle = textColor;
                ctx.fillText(text, 0, 0);

                ctx.restore();
                ctx.setLineDash(prevDash);
                ctx.shadowBlur = prevShadow.blur;
                ctx.shadowColor = prevShadow.color;
                ctx.shadowOffsetX = prevShadow.offsetX;
                ctx.shadowOffsetY = prevShadow.offsetY;
            }

            point.isInside = (
                mx, my,
            ) => {
                const {
                    tension = 0.35,
                    width = 2,
                    hitPadding = 6,
                    startRadius = 8,
                    endRadius = 10,
                } = opts;
                const dist2 = (ax, ay, bx, by) => {
                    const dx = ax - bx, dy = ay - by;
                    return dx * dx + dy * dy;
                };
                const clamp01 = t => t < 0 ? 0 : (t > 1 ? 1 : t);

                const cubic = (t, p0, p1, p2, p3) => {
                    const mt = 1 - t;
                    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
                };
                const dcubic = (t, p0, p1, p2, p3) => {
                    const mt = 1 - t;
                    return 3 * (mt * mt * (p1 - p0) + 2 * mt * t * (p2 - p1) + t * t * (p3 - p2));
                };
                const d2cubic = (t, p0, p1, p2, p3) => {
                    return 6 * ((1 - t) * (p2 - 2 * p1 + p0) + t * (p3 - 2 * p2 + p1));
                };

                const B = (t, x0, y0, x1, y1, x2, y2, x3, y3) => ({
                    x: cubic(t, x0, x1, x2, x3),
                    y: cubic(t, y0, y1, y2, y3),
                });
                const dB = (t, x0, y0, x1, y1, x2, y2, x3, y3) => ({
                    x: dcubic(t, x0, x1, x2, x3),
                    y: dcubic(t, y0, y1, y2, y3),
                });
                const d2B = (t, x0, y0, x1, y1, x2, y2, x3, y3) => ({
                    x: d2cubic(t, x0, x1, x2, x3),
                    y: d2cubic(t, y0, y1, y2, y3),
                });

                function closestT(mx, my, x0, y0, x1, y1, x2, y2, x3, y3) {

                    const SAMPLES = 64;
                    let bestT = 0, bestD2 = Infinity;
                    for (let i = 0; i <= SAMPLES; i++) {
                        const t = i / SAMPLES;
                        const p = B(t, x0, y0, x1, y1, x2, y2, x3, y3);
                        const d2 = dist2(mx, my, p.x, p.y);
                        if (d2 < bestD2) { bestD2 = d2; bestT = t; }
                    }

                    let t = bestT;
                    for (let it = 0; it < 8; it++) {
                        const p = B(t, x0, y0, x1, y1, x2, y2, x3, y3);
                        const v1 = dB(t, x0, y0, x1, y1, x2, y2, x3, y3);
                        const v2 = d2B(t, x0, y0, x1, y1, x2, y2, x3, y3);

                        const rx = p.x - mx, ry = p.y - my;
                        const Dp = 2 * (v1.x * rx + v1.y * ry);
                        const Dpp = 2 * ((v2.x * rx + v2.y * ry) + (v1.x * v1.x + v1.y * v1.y));

                        if (Dpp === 0) break;
                        const tNext = clamp01(t - Dp / Dpp);
                        if (Math.abs(tNext - t) < 1e-5) { t = tNext; break; }
                        t = tNext;
                    }
                    return t;
                }

                const xend = point.end_scx;
                const xstart = point.start_scx;
                const ystart = point.start_scy;
                const yend = point.end_scy;
                const dx = xend - xstart;
                const dy = yend - ystart;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len, uy = dy / len;
                const px = -uy, py = ux;
                const along = tension * len;
                const lateral = Math.min(24, 0.15 * len);
                const c1x = xstart + ux * (along * 0.6) + px * lateral;
                const c1y = ystart + uy * (along * 0.6) + py * lateral;
                const c2x = xend - ux * (along * 0.6) - px * lateral;
                const c2y = yend - uy * (along * 0.6) - py * lateral;
                const d2Start = dist2(mx, my, xstart, ystart);
                if (d2Start <= startRadius * startRadius) {
                    return true

                }

                const d2End = dist2(mx, my, xend, yend);
                if (d2End <= endRadius * endRadius) {
                    return true;

                }

                const t = closestT(mx, my, xstart, ystart, c1x, c1y, c2x, c2y, xend, yend);
                const p = B(t, xstart, ystart, c1x, c1y, c2x, c2y, xend, yend);
                const d = Math.hypot(mx - p.x, my - p.y);

                const threshold = (Math.max(1, width) / 2) + hitPadding;

                if (d <= threshold) {
                    return true;

                }

                return false;

            };

            ctx.restore();

            return { c1x, c1y, c2x, c2y };
        }

        function distributeIntervalPointsY(points, grid, opts = {}) {
            const yPadFrac = opts.yPadFrac ?? 0.06;
            const minLaneSpacing = opts.minLaneSpacing ?? 0;
            const onlyIfMissingY = !!opts.onlyIfMissingY;

            const randomizeWhenNoOverlap = opts.randomizeWhenNoOverlap ?? true;
            const pseudoLaneCount = Math.max(1, opts.pseudoLaneCount ?? 6);
            const jitterFrac = opts.jitterFrac ?? 0.12;
            const seed = opts.seed ?? 1;

            if (!points || !points.length) return 0;
            const yMin = grid.ymin;
            const yMax = grid.ymax;
            const yRange = (yMax - yMin) || 1;

            const intervals = [];
            for (const p of points) {
                if (!p || p.type !== "interval") continue;
                if (onlyIfMissingY && p.y != null) continue;

                const a = p.startX;
                const b = p.x;
                if (a == null || b == null) continue;

                const x0 = Math.min(a, b);
                const x1 = Math.max(a, b);

                intervals.push({ p, x0, x1 });
            }
            if (!intervals.length) return 0;

            intervals.sort((A, B) => (A.x0 - B.x0) || (A.x1 - B.x1));

            const events = [];
            for (const it of intervals) {
                events.push({ x: it.x0, kind: +1 });
                events.push({ x: it.x1, kind: -1 });
            }

            events.sort((a, b) => (a.x - b.x) || (a.kind - b.kind));

            let active = 0, maxActive = 0;
            for (const e of events) {
                active += e.kind;
                if (active > maxActive) maxActive = active;
            }
            const laneCount = Math.max(1, maxActive);

            const pad = yRange * yPadFrac;
            const usableMin = yMin + pad;
            const usableMax = yMax - pad;
            const usableRange = Math.max(0.000001, usableMax - usableMin);

            const computeLaneY = (count) => {
                let spacing = (count <= 1) ? usableRange : (usableRange / (count - 1));

                if (minLaneSpacing > 0) {
                    const needed = minLaneSpacing * (count - 1);
                    if (needed <= usableRange) spacing = minLaneSpacing;
                    else spacing = (count <= 1) ? usableRange : (usableRange / (count - 1));
                }

                const ys = new Array(count);
                if (count === 1) {
                    ys[0] = usableMin + usableRange / 2;
                } else {
                    for (let i = 0; i < count; i++) ys[i] = usableMin + i * spacing;
                }
                return { ys, spacing };
            };

            const usePseudo = randomizeWhenNoOverlap && laneCount === 1 && pseudoLaneCount > 1;
            const effectiveLaneCount = usePseudo ? pseudoLaneCount : laneCount;

            const { ys: laneY, spacing: laneSpacing } = computeLaneY(effectiveLaneCount);

            if (!usePseudo) {

                const laneEnd = new Array(effectiveLaneCount).fill(-Infinity);

                const pickLane = (startX) => {
                    let bestFree = -1;
                    let bestFreeEnd = Infinity;

                    let bestAny = 0;
                    let bestAnyEnd = laneEnd[0];

                    for (let i = 0; i < effectiveLaneCount; i++) {
                        const end = laneEnd[i];

                        if (end < bestAnyEnd) {
                            bestAnyEnd = end;
                            bestAny = i;
                        }

                        if (end <= startX) {
                            if (end < bestFreeEnd) {
                                bestFreeEnd = end;
                                bestFree = i;
                            }
                        }
                    }
                    return (bestFree !== -1) ? bestFree : bestAny;
                };

                for (const it of intervals) {
                    const iLane = pickLane(it.x0);
                    laneEnd[iLane] = it.x1;

                    const j = (jitterFrac > 0 && effectiveLaneCount > 1)
                        ? (hashRand01(intervalSeed(it), seed) - 0.5) * laneSpacing * jitterFrac
                        : 0;

                    it.p.y = clamp(laneY[iLane] + j, yMin, yMax);
                }

                return laneCount;
            }

            for (const it of intervals) {

                const r = hashRand01(intervalSeed(it), seed);
                const iLane = Math.floor(r * effectiveLaneCount);

                const j = (effectiveLaneCount > 1)
                    ? (hashRand01(intervalSeed(it) + 1337, seed) - 0.5) * laneSpacing * jitterFrac
                    : 0;

                it.p.y = clamp(laneY[iLane] + j, yMin, yMax);
            }

            return 1;

            function clamp(v, lo, hi) {
                return Math.max(lo, Math.min(hi, v));
            }

            function intervalSeed(it) {

                const a = Math.floor(it.x0 * 1000);
                const b = Math.floor(it.x1 * 1000);
                return (a * 73856093) ^ (b * 19349663);
            }

            function hashRand01(s, globalSeed) {

                let x = (s ^ (globalSeed | 0)) | 0;
                x ^= x << 13;
                x ^= x >>> 17;
                x ^= x << 5;

                return ((x >>> 0) / 4294967296);
            }
        }

        this._textMeasureCache = new Map();
        this._textMeasureCacheMax = 2000;

        function measuredText(ctx, font, text) {
            const key = font + "|" + text;
            const hit = this._textMeasureCache.get(key);
            if (hit != null) return hit;
            ctx.font = font;
            const w = ctx.measureText(text).width;
            this._textMeasureCache.set(key, w);
            if (this._textMeasureCache.size > this._textMeasureCacheMax) {

                const first = this._textMeasureCache.keys().next().value;
                this._textMeasureCache.delete(first);
            }
            return w;
        };

        const MAX_YEAR_TICKS = 24;
        const MAX_MONTH_TICKS = 60;
        const MAX_DAY_TICKS = 120;
        const MAX_HOUR_TICKS = 160;
        const MAX_TOTAL_TICKS = 400;

        const strideFor = (count, max) => Math.max(1, Math.ceil(count / Math.max(1, max)));

        let totalTicksDrawn = 0;
        const canDrawMore = (n = 1) => (totalTicksDrawn + n) <= MAX_TOTAL_TICKS;
        const noteDrawn = (n = 1) => { totalTicksDrawn += n; };

        let MPlot = class MPlot {

            __date;
            __scx_;
            __scy_;
            ___hover;
            ___pointMenuItems;

            maximize = false;
            typeof = 'plot'
            startDate = new Date(2020, 0, 1)
            endDate = new Date()
            tabHeight = 40;
            tabWidth = 40;
            aspectRatio = 0;
            config_script = {};
            grid;
            resizing = false;
            scaleType = null;
            type = 'scatter'
            _highlight = true;
            x = 1000;
            y = 0;
            w = 1;
            h = 1;
            x_axis_label = ''
            y_axis_label = ''
            data = null;
            name = '';
            highlightPatterns = []
            layers = []
            mode = null;
            fitScaleToData = true;
            fitYAxisMilestones = true;
            lineColor = 'lightGray'
            drawErrors = false;
            pointColor = getRandomColor()
            errorBarColor = 'gray';
            lineEquations = []
            showPointLabels = false;
            showTopMenuBar = false;

            backgroundColor = 'transparent';
            uid;
            drawBackground = true;
            last_touched = -Infinity;
            code = null;
            broken = false;
            __resizing = false;
            __moving = false;
            margin = { top: 0, right: 0, bottom: 0, left: -100 };
            showEquation = true;
            showNowBar = true;
            sigmoid = null;
            progress = null;
            formatAxis = null;
            isBackground = true;
            buttons = [
                {
                    name: "move", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.setMoveListeners(pt, x, y) },
                    highlight: async (bx, by, x, y, pt) => { return await this.highlightButton('move') }, color: 'lightcyan'
                },
                {
                    name: "minimize", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return await this.displayContextSpecificMenuItems(pt) },
                    highlight: async (bx, by, x, y, pt) => { return await this.highlightButton('minimize') }, color: 'lightcyan'
                },
                {
                    name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return await this.closePlot(pt) },
                    highlight: async () => { return await this.highlightButton("close") }, color: 'lightcyan'
                },
            ];
            themeName = null;
            theme = null;

            constructor(scatterData, Grid) {
                this.uid = uuid()
                this.scatterData = scatterData;
                this.name = generateNautName();
                if (Grid)
                    this.grid = new Grid(this.x, this.y, this.w, this.h);
                else
                    this.grid = new MGrid(this.x, this.y, this.w, this.h);
                this.grid.setInset(0, 0)
                this.tabWidth = 20;
                this.tabGap = 5;
                this.margin = { top: 0, right: 0, bottom: 0, left: 0 };

                Object.keys(THEMES).forEach(k => {
                    THEMES[k].fonts = { ...(THEMES[k].fonts || {}), max: 18 };
                });

                this.themeName = this.themeName || "classic-light";
                this.theme = getThemeSafe(this);

                this.setTheme = (nameOrObj) => {
                    const tmap = (typeof THEMES !== "undefined" && THEMES) || {};
                    if (typeof nameOrObj === "string" && tmap[nameOrObj]) {
                        this.themeName = nameOrObj;
                        this.theme = mergeTheme(DEFAULT_THEME, tmap[nameOrObj]);
                    } else if (typeof nameOrObj === "object") {
                        this.themeName = "custom";
                        this.theme = mergeTheme(DEFAULT_THEME, nameOrObj);
                    } else {

                        this.themeName = "default-classic";
                        this.theme = DEFAULT_THEME;
                    }
                };
            }

            selectTheme(str) {
                this.themeName = str;
                this.theme = mergeTheme(THEMES.light, THEMES[this.themeName]);
                this.setTheme = (nameOrObj) => {
                    if (typeof nameOrObj === 'string' && THEMES[nameOrObj]) {
                        this.themeName = nameOrObj;
                        this.theme = mergeTheme(THEMES.light, THEMES[nameOrObj]);
                    } else if (typeof nameOrObj === 'object') {
                        this.themeName = 'custom';
                        this.theme = mergeTheme(THEMES.light, nameOrObj);
                    }
                }

            }

            async closePlot(pt) {

                let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete this?', async () => {
                    setTimeout(() => {
                        pt.removePlot(this)

                    }, 1000)

                })
                showModal(confirm)
            }
            isMaximized() {
                return this.maximize
            }
            setMaximized(__maximize) {
                this.maximize = __maximize;
            }
            async dev_null(bx, by, mmx, mmy) {
                highlightTab = null;

            }
            async highlightButton(name) {
                highlightTab = name;
            }

            connectPoints(fromName, toName, txt = "") {
                if (!Array.isArray(this.scatterData.points)) return false;

                let from = null;
                let to = null;

                for (const p of this.scatterData.points) {
                    if (p.name === fromName) from = p;
                    else if (p.name === toName) to = p;
                    if (from && to) break;
                }

                if (!from || !to) return false;

                if (!Array.isArray(from.connections)) from.connections = [];

                const exists = from.connections.some(c => c.to === toName);
                if (exists) return false;

                from.connections.push({ to: toName, txt });

                return true;
            }

            async applyIcons() {

                const nameCounts = this.scatterData.points.reduce((counts, point) => {
                    if (point.name) {
                        const key = point.name.slice(0, 15);
                        counts[key] = (counts[key] || 0) + 1;
                    }
                    return counts;
                }, {});

                function addRedLineToSvg(svgDataUrl) {

                    const base64 = svgDataUrl.split(',')[1];
                    const decodedSvg = decodeURIComponent(escape(atob(base64)));

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(decodedSvg, "image/svg+xml");
                    const svgElem = doc.documentElement;

                    let x = 0, y = 0, width = 100, height = 100;
                    const viewBoxAttr = svgElem.getAttribute("viewBox");
                    if (viewBoxAttr) {
                        const parts = viewBoxAttr.trim().split(/\s+/).map(Number);
                        if (parts.length === 4) {
                            [x, y, width, height] = parts;
                        }
                    } else {
                        width = parseFloat(svgElem.getAttribute("width")) || 100;
                        height = parseFloat(svgElem.getAttribute("height")) || 100;

                    }

                    const centerY = y + height / 2;

                    const redLine = doc.createElementNS("http://www.w3.org/2000/svg", "line");
                    redLine.setAttribute("x1", x);
                    redLine.setAttribute("y1", centerY);
                    redLine.setAttribute("x2", x + width);
                    redLine.setAttribute("y2", centerY);
                    redLine.setAttribute("stroke", "red");
                    redLine.setAttribute("stroke-width", "2");

                    const targetGroup = svgElem.querySelector("g") || svgElem;
                    targetGroup.appendChild(redLine);

                    const serializer = new XMLSerializer();
                    const modifiedSvg = serializer.serializeToString(svgElem);
                    const encodedSvg = btoa(unescape(encodeURIComponent(modifiedSvg)));

                    return 'data:image/svg+xml;base64,' + encodedSvg;
                }
                function addPurpleROverlayToSvg(svgDataUrl) {

                    const base64 = svgDataUrl.split(',')[1];
                    const decodedSvg = decodeURIComponent(escape(atob(base64)));

                    const parser = new DOMParser();
                    const doc = parser.parseFromString(decodedSvg, "image/svg+xml");
                    const svgElem = doc.documentElement;

                    let x = 0, y = 0, width = 48, height = 48;
                    const viewBoxAttr = svgElem.getAttribute("viewBox");
                    if (viewBoxAttr) {
                        const parts = viewBoxAttr.trim().split(/\s+/).map(Number);
                        if (parts.length === 4) {
                            [x, y, width, height] = parts;
                        }
                    } else {
                        width = parseFloat(svgElem.getAttribute("width")) || 100;
                        height = parseFloat(svgElem.getAttribute("height")) || 100;
                    }

                    const centerX = x + width / 2;
                    const centerY = y + height / 2;

                    const text = doc.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", centerX);
                    text.setAttribute("y", centerY);
                    text.setAttribute("fill", "purple");
                    text.setAttribute("font-size", Math.min(width, height) / 3);
                    text.setAttribute("font-weight", "bold");
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("dominant-baseline", "middle");
                    text.textContent = "R";

                    const targetGroup = svgElem.querySelector("g") || svgElem;
                    targetGroup.appendChild(text);

                    const serializer = new XMLSerializer();
                    const modifiedSvg = serializer.serializeToString(svgElem);
                    const encodedSvg = btoa(unescape(encodeURIComponent(modifiedSvg)));

                    return 'data:image/svg+xml;base64,' + encodedSvg;
                }
                this.scatterData.points.forEach(async point => {
                    point.img = null;
                    point.icon = null;
                    if (point.name) {
                        let newsvg64bitImage = await getLJIcon(point.name)
                        if (newsvg64bitImage != null && typeof newsvg64bitImage === 'string') {

                            const key = point.name.slice(0, 15);

                            if (nameCounts[key] && nameCounts[key] > 1) {
                                newsvg64bitImage = addPurpleROverlayToSvg(newsvg64bitImage)
                            }

                            if (point.name.startsWith('canceled')) {
                                newsvg64bitImage = addRedLineToSvg(newsvg64bitImage)
                            }
                            point.icon = newsvg64bitImage
                            point.iconSize = null;
                        }
                        point.img = null;
                    }
                });
            }

            clearIcons() {

            }

            createMinimizedMenu(bx, by, x, y, pt) {
                let m = [
                    {
                        label: 'Hide rows',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Top 10',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Bottom 10',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Set rows...',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                ]

                m.unshift({
                    label: 'Show all rows',
                    click: async (x, y) => {
                    },
                    move: () => {
                    },
                },
                )
                pt.wb(null)

                const smenu = new Menu(m, pt.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
                pt.setMenu(smenu)
            }

            showYAxisTickOptions(pt) {
                let ml = []

                ml.push({
                    label: `Floating points`,
                    click: (xwc, ywc) => {
                        this.formatAxis = null;
                    },
                    bg: 'orange',
                    fg: 'black'

                })

                ml.push({
                    label: `Integer`,
                    click: (xwc, ywc) => {
                        this.formatAxis = integerAxis;
                    },
                    bg: 'orange',
                    fg: 'black'

                })
                ml.push({
                    label: `$Millions`,
                    click: (xwc, ywc) => {
                        this.formatAxis = dollarAxis;
                    },
                    bg: 'orange',
                    fg: 'black'

                })
                ml.push({
                    label: `$Thousands`,
                    click: async (xwc, ywc) => {

                        this.formatAxis = thousandsAxis;

                    },
                    bg: 'orange',
                    fg: 'black'
                })

                ml.push({
                    label: `Percent`,
                    click: async (xwc, ywc) => {

                        this.formatAxis = percentAxis;

                    },
                    bg: 'orange',
                    fg: 'black'
                })
                let cols = Math.ceil(ml.length / 20);
                pt.menu = new Menu(ml, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                pt.menu_vis = true;
            }

            isModal() {
                if (smenu) {
                    return true;
                }

                return false;
            }

            ____callout = true;

            highlight() {
                this._highlight = true;
                this.showTopMenuBar = true;
                this.resizing = false;
            }

            unhighlight() {
                this.__resizing = false;
                this.__moving = false;
                this._highlight = false;
                this.showTopMenuBar = false;
                this.resizing = false;
                this.deselectPoints()
            }

            highlight_points(regex) {

            }
            deselectIt() {
                this.showTopMenuBar = false;
                this.unhighlight();
            }

            getLastTouched() {
                return this.last_touched;
            }

            deselectPoints() {
                this.___hover = null;

                this.scatterData.points.forEach(point => {
                    point.isSelected = false;
                    point.highlight = false;
                });
            }

            getSelectedPoints() {
                let sel = []
                this.scatterData.points.forEach(point => {
                    if (point.isSelected) {
                        sel.push(point)
                    }
                });
                return sel;
            }

            colorSelectedPoints(color) {
                this.scatterData.points.forEach(point => {
                    if (point.isSelected) {
                        point.color = color;
                    }
                });

            }

            append(newScatterData) {
                if (newScatterData && newScatterData.points) {
                    this.scatterData.points = this.scatterData.points.concat(newScatterData.points);
                }
            }

            findBounds() {

                let xmin = this.grid.xi;
                let xmax = this.grid.xi + (this.grid.width);
                let ymin = this.grid.yi + this.grid.height;
                let ymax = this.grid.yi;

                return { xmin, xmax, ymin, ymax };
            }

            hideUnhighlighted() {
                this.hide_unhighlighted = true;
            }

            showUnhighlighted() {

                this.hide_unhighlighted = false;
            }

            showAll() {
                this.hide_unhighlighted = false;
            }
            lassoSelect(lassoPolygon, graph) {
                let isPointInPolygon = (point, polygon) => {
                    let inside = false;
                    const x = (this.grid.X((point.x)));
                    const y = (this.grid.Y((point.y)));

                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const xi = polygon[i].x, yi = polygon[i].y;
                        const xj = polygon[j].x, yj = polygon[j].y;
                        const intersect = ((yi > y) !== (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;

                }
                let selected = []
                this.scatterData.points.forEach(point => {
                    if (isPointInPolygon(point, lassoPolygon)) {
                        point.isSelected = true;
                        point.highlight = true;
                        selected.push(point)
                    } else {
                        point.isSelected = false;
                    }
                });
                showModal({
                    wid: 'json',
                    data: JSON.stringify(selected)
                })
            }

            setymax(ymax) {
                this.grid.setymax(ymax);
                this.fitScaleToData = false;
            }
            setxmax(xmax) {
                this.grid.setxmax(xmax);
                this.fitScaleToData = false;
            }
            setxmin(xmin) {
                this.grid.setxmin(xmin)
                this.fitScaleToData = false;
            }

            setymin(ymin) {
                this.grid.setymin(ymin)
                this.fitScaleToData = false;

            }
            addLineEquation(line) {
                this.lineEquations.push(line);
            }

            updateEquations() {

                debugger;

                for (let l of this.lineEquations) {

                    if (l.recalc) {
                        l.recalc(this.scatterData)
                    }

                }


            }


            sortAscending() {
                this.scatterData.points.sort((a, b) => a.y - b.y);

                this.scatterData.points.forEach((point, index) => {
                    point.x = index;
                });
            }

            sortDescending() {
                this.scatterData.points.sort((a, b) => b.y - a.y);

                this.scatterData.points.forEach((point, index) => {
                    point.x = index;
                });
            }

            plotLines(_grid, ctx) {
                if (this.fitScaleToData) {
                    const xmin = Math.min(...this.scatterData.points.map(p => p.x));
                    const xmax = Math.max(...this.scatterData.points.map(p => p.x));
                    const ymin = Math.min(...this.scatterData.points.map(p => p.y));
                    const ymax = Math.max(...this.scatterData.points.map(p => p.y));
                    _grid.zoom(xmin, xmax, ymin, ymax);
                    _grid.rescale();
                }

                let globalYMin = Infinity;
                let globalYMax = -Infinity;
                let equationsText = "";
                const labelOffsetY = 1;
                let labelYPositions = [];

                this.drawScatter(_grid, ctx)

                this.lineEquations.forEach((line, index) => {
                    const { slope, intercept, label, color, rSquared } = line;

                    if (slope != null && intercept != null) {
                        const xMin = _grid.xmin;
                        const xMax = _grid.xmax;
                        const yMin = slope * xMin + intercept;
                        const yMax = slope * xMax + intercept;

                        globalYMin = Math.min(globalYMin, yMin, yMax);
                        globalYMax = Math.max(globalYMax, yMin, yMax);

                        const xScreenMin = _grid.X(xMin);
                        const yScreenMin = _grid.Y(yMin);
                        const xScreenMax = _grid.X(xMax);
                        const yScreenMax = _grid.Y(yMax);

                        if (rSquared != null) {
                            const parsedRSquared = typeof rSquared === 'string' ? parseFloat(rSquared) : rSquared;

                            ctx.beginPath();
                            ctx.moveTo(xScreenMin, yScreenMin);
                            ctx.lineTo(xScreenMax, yScreenMax);
                            ctx.strokeStyle = color || 'black';
                            ctx.lineWidth = 2;
                            ctx.stroke();

                            const labelX = (xScreenMin + xScreenMax) / 2;
                            let labelY = (yScreenMin + yScreenMax) / 2 + 20;
                            while (labelYPositions.some(pos => Math.abs(labelY - pos) < labelOffsetY)) {
                                labelY -= labelOffsetY;
                            }
                            labelYPositions.push(labelY);
                            const rSquaredText = ` (R²: ${parsedRSquared.toFixed(2)})`;
                            ctx.font = '12px Arial';
                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'lightGray';

                            if (this.showEquation) {
                                ctx.fillText(`${label}${rSquaredText}`, labelX + 5, labelY - 5);
                            }

                            ctx.lineWidth = 1;
                            ctx.shadowBlur = 0;
                            equationsText += `${label} y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}\n${label}${rSquaredText}`;
                        }

                    } else if (line.mfunction) {
                        try {
                            line.mfunction(_grid, ctx, line.data);
                        } catch (exception) {
                            console.log(' --> ' + exception);
                        }
                    }
                });

                if (this.type === 'line') {
                    _grid.setymin(globalYMin);
                    _grid.setymax(globalYMax + 0.1 * globalYMax);
                    _grid.rescale();
                }

                if (this.showEquation) {
                    ctx.fillStyle = 'black';
                    ctx.font = '15px Arial';
                    const lineHeight = 20;
                    equationsText.split("\n").forEach((equation, i) => {
                        ctx.fillText(equation, (_grid.xi) + 250, (_grid.yi) + i * lineHeight + Math.floor(_grid.height / 2));
                    });
                }
            }

            solveForY(xValue) {
                if (!this.lineEquations || !Array.isArray(this.lineEquations)) {
                    throw new Error("lineEquations must be defined and an array.");
                }

                const results = [];

                this.lineEquations.forEach(line => {
                    const { slope, intercept } = line;

                    const y = slope * xValue + intercept;
                    results.push({ line, y });
                });

                return results;
            }
            solveForX(yValue) {
                if (!this.lineEquations || !Array.isArray(this.lineEquations)) {
                    throw new Error("lineEquations must be defined and an array.");
                }

                const results = [];

                this.lineEquations.forEach(line => {
                    const { mfunction } = line;
                    if (mfunction) {
                        return mfunction(this.grid)
                    } else {
                        const { slope, intercept } = line;
                        if (slope !== 0) {
                            const x = (yValue - intercept) / slope;
                            results.push({ line, x });
                        } else {
                            results.push({ line, x: null, error: "Horizontal line - no unique x for given y" });
                        }
                    }
                });

                return results;
            }



            drawSTDVERROR = (graph, ctx) => {
                if (!this.scatterData || !this.scatterData.points || this.scatterData.points.length === 0) {
                    return;
                }
                const barWidth = 20;
                this.scatterData.points.forEach(point => {
                    const xScreen = graph.X(this.grid.X(point.x));
                    const yScreen = graph.Y(this.grid.Y(point.y)) + graph.Y(this.grid.Y(point["stdDev"]));
                    ctx.fillStyle = point.pointColor || 'navy';
                    ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, this.grid.Y(point.y) - yScreen);
                    const error = point['stdDev'];
                    const upperError = graph.Y(this.grid.Y(point['stdDev'] + error)) + graph.Y(this.grid.Y(point.y));
                    const lowerError = yScreen;
                    ctx.strokeStyle = this.errorBarColor || 'gray';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(xScreen, upperError);
                    ctx.lineTo(xScreen, lowerError);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, upperError);
                    ctx.lineTo(xScreen + 5, upperError);
                    ctx.stroke();
                });
            };
            drawWithErrorBars = (ctx, config) => {

                if (!this.scatterData || !this.scatterData.points || this.scatterData.points.length === 0) {
                    return;
                }

                const { errorBarXKey, errorBarYKey, errorBarKey } = config;

                this.scatterData.points.forEach(point => {
                    const xScreen = this.grid.X(point[errorBarXKey]);
                    const yScreen = this.grid.Y(point[errorBarYKey]);

                    ctx.fillStyle = this.pointColor || 'red';
                    ctx.beginPath();
                    ctx.arc(xScreen, yScreen, 3, 0, 2 * Math.PI);
                    ctx.fill();

                    const error = point[errorBarKey];
                    const upperError = this.grid.Y(point[errorBarYKey] + error);
                    const lowerError = this.grid.Y(point[errorBarYKey] - error);

                    ctx.strokeStyle = this.errorBarColor || 'gray';
                    ctx.lineWidth = 1;
                    ctx.beginPath();

                    ctx.moveTo(xScreen, upperError);
                    ctx.lineTo(xScreen, lowerError);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, upperError);
                    ctx.lineTo(xScreen + 5, upperError);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, lowerError);
                    ctx.lineTo(xScreen + 5, lowerError);
                    ctx.stroke();
                })
            }

            plotAggregatedBarChartWithErrors(graph, ctx) {
                let xmin = Infinity;
                let xmax = -Infinity;
                let ymin = Infinity;
                let ymax = -Infinity;
                if (!this.grid || !this.grid.rescale) {
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                    this.scatterData.points.forEach(point => {
                        const xValue = point.x;
                        const yValue = point.y;
                        const stdDev = point.stdDev;
                        if (typeof xValue === 'number') {
                            xmin = Math.min(xmin, xValue);
                            xmax = Math.max(xmax, xValue);
                        }
                        ymin = Math.min(ymin, yValue - stdDev);
                        ymax = Math.max(ymax, yValue + stdDev);
                    });
                    if (xmin === Infinity || xmax === -Infinity) {
                        return;
                    }
                    if (ymin === Infinity || ymax === -Infinity) {
                        return;
                    }

                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                } else {
                    graph.rescale();
                    this.scatterData.points.forEach(point => {
                        const xValue = point.x;
                        const yValue = point.y;
                        const stdDev = point.stdDev;
                        if (typeof xValue === 'number') {
                            xmin = Math.min(xmin, xValue);
                            xmax = Math.max(xmax, xValue);
                        }
                        ymin = Math.min(ymin, yValue - stdDev);
                        ymax = Math.max(ymax, yValue + stdDev);
                    });
                    if (xmin === Infinity || xmax === -Infinity) {
                        return;
                    }
                    if (ymin === Infinity || ymax === -Infinity) {
                        return;
                    }

                    this.grid.rescale();
                    ctx.fillStyle = 'rgba(55, 55, 255, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.moveTo((this.grid.X(this.grid.xmin)) - 2, (this.grid.Y(this.grid.ymin)));
                    ctx.lineTo((this.grid.X(this.grid.xmin)) - 2, (this.grid.Y(this.grid.ymax)));
                    ctx.stroke();
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    if (this.aspectRatio === 1) {

                    } else {

                    }
                    this.grid.rescale();
                    this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                    this.grid.rescale();
                    if (this._highlight) {
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                        const rectWidth = this.grid.width;
                        const rectHeight = this.grid.height;
                        const cornerSize = 20;
                        const rectX = this.grid.xi - cornerSize / 2;
                        const rectY = this.grid.yi - cornerSize / 2;

                        let radius = 10;
                        let centerX_crescent = graph.X(this.grid.xi + this.grid.width) + 10 - radius - 5;
                        let centerY_crescent = graph.Y(this.grid.yi) + 10 - radius - 5;
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                        ctx.shadowOffsetX = 4;
                        ctx.shadowOffsetY = 4;
                        ctx.beginPath();
                        ctx.arc(centerX_crescent, centerY_crescent, radius, 0, Math.PI * 2, false);
                        ctx.fillStyle = 'rgba(255, 55, 55, 0.3)';
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(centerX_crescent + radius / 2, centerY_crescent, radius, 0, Math.PI * 2, false);
                        ctx.fillStyle = 'rgba(20, 20, 100, 0.3)';
                        ctx.fill();

                        ctx.shadowColor = "transparent";
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    } else {
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    }
                }
                ctx.font = "10px Arial";

                const barWidth = (this.grid.width) / (this.scatterData.length * 3);
                this.scatterData.forEach((point, index) => {
                    const xScreen = this.grid.X(index);
                    const yScreen = this.grid.Y(point.y);

                    ctx.fillStyle = 'rgb(0, 87, 163)';
                    ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, this.grid.Y(this.grid.ymin) - yScreen);

                    const upperError = this.grid.Y(point.y + point.stdDev);
                    const lowerError = this.grid.Y(point.y - point.stdDev);
                    ctx.strokeStyle = 'gray';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(xScreen, upperError);
                    ctx.lineTo(xScreen, lowerError);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, upperError);
                    ctx.lineTo(xScreen + 5, upperError);
                    ctx.moveTo(xScreen - 5, lowerError);
                    ctx.lineTo(xScreen + 5, lowerError);
                    ctx.stroke();
                });

                if (this.name && this.name != 'untitled') {
                    ctx.fillStyle = 'lightBlue';
                    ctx.font = '21px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(this.name, this.grid.xi + this.grid.width / 2, this.grid.yi - 10);
                }
            }

            isHighlighted() {
                return this._highlight;
            }

            pieChart(graph, ctx) {

                const worldCenterX = (this.grid.xmax + this.grid.xmin) / 2;
                const worldCenterY = (this.grid.ymax + this.grid.ymin) / 2;
                const radiusWorld = Math.min(this.grid.xmax - this.grid.xmin, this.grid.ymax - this.grid.ymin) / 4;
                const centerX = grid.X(worldCenterX);
                const centerY = grid.Y(worldCenterY);
                const radius = radiusWorld * this.grid.xscale;
                let startAngle = 0;
                const total = data.reduce((sum, d) => sum + d.percentage, 0);
                this.scatterData.points.forEach((item) => {
                    const sliceAngle = (item.percentage / total) * 2 * Math.PI;
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                    ctx.closePath();
                    ctx.fillStyle = `hsl(${Math.random() * 360}, 70%, 70%)`;
                    ctx.fill();
                    const midAngle = startAngle + sliceAngle / 2;
                    const labelX = centerX + Math.cos(midAngle) * radius * 0.7;
                    const labelY = centerY + Math.sin(midAngle) * radius * 0.7;
                    ctx.fillStyle = "navy";
                    ctx.font = "14px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(item.name, labelX, labelY);
                    startAngle += sliceAngle;
                });
            }

            plotBarChart(graph, ctx) {

                if (!this.grid || !this.grid.rescale) {
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;
                        return null;
                    }
                    const ymin = Math.min(...validPoints.map(p => p.y));
                    const ymax = Math.max(...validPoints.map(p => p.y));
                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                } else {
                    graph.rescale();
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;

                        return null;
                    }
                    this.grid.rescale();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 20;

                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    if (this.aspectRatio === 1) {
                        this.grid.width = sw;
                        this.grid.height = sw;
                    } else {

                    }

                    const ymax = Math.max(...validPoints.map(p => p.y));

                    this.setxmax(xmax)
                    this.setymax(ymax)
                    this.grid.rescale();
                    this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                    let labels = this.scatterData.points.map(point => point.name ?? point.x);

                    const data = this.scatterData.points.map(point => point.y);
                    if (labels.length > 0 && !this.grid.xmax)
                        this.grid.setxmax(labels.length)
                    this.grid.rescale();

                    ctx.font = "13px Arial";
                    const barWidth = (this.grid.width) / (labels.length * 3);
                    labels.forEach((label, index) => {
                        const xScreen = (this.grid.X(index));
                        const yScreen = (this.grid.Y(data[index]));
                        ctx.fillStyle = 'rgba(0, 87, 163, 1)'

                        if (this.scatterData.points[index].isSelected) {
                            ctx.fillStyle = 'rgba(221, 0, 255, 0.8)';
                        } else
                            if (this.scatterData.points[index]?.color) {
                                ctx.fillStyle = this.scatterData.points[index].color;
                            }

                        ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, (this.grid.Y(this.grid.ymin)) - yScreen);
                        ctx.save();
                        ctx.translate(xScreen, (this.grid.Y(this.grid.ymin) + 10));
                        ctx.rotate(-Math.PI / 4);
                        ctx.fillStyle = 'gray';
                        ctx.textAlign = 'right';
                        ctx.fillText(label, 0, 0);
                        ctx.restore();
                        if (this.scatterData.points[index].stdDev && (this.scatterData.points[index].stdDev != NaN)) {
                            const stdv = this.scatterData.points[index].stdDev;
                            const upperError = (this.grid.Y(data[index] + stdv));
                            const lowerError = (this.grid.Y(data[index] - stdv));
                            let scrDv = this.grid.Y(stdv);

                            ctx.strokeStyle = 'orange';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(xScreen, upperError);
                            ctx.lineTo(xScreen, lowerError);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(xScreen - 5, upperError);
                            ctx.lineTo(xScreen + 5, upperError);
                            ctx.moveTo(xScreen - 5, lowerError);
                            ctx.lineTo(xScreen + 5, lowerError);
                            ctx.stroke();
                        }
                    });

                    if (this.name && this.name != 'untitled') {
                        ctx.fillStyle = 'lightGray';
                        ctx.font = '21px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(this.name, this.grid.xi + this.grid.width / 2, this.grid.yi - 10);
                    }

                    if (this._highlight) {
                        const arrowSize = 15;
                        const rectWidth = Math.abs(this.grid.width);
                        const rectHeight = Math.abs(this.grid.height);
                        const cornerSize = 30;
                        const bottomRightStartX = this.grid.xi + rectWidth + 65;
                        const bottomRightStartY = this.grid.yi + rectHeight + 65;
                        const cornerX = bottomRightStartX - cornerSize
                        const cornerY = bottomRightStartY - cornerSize

                        {

                            const rect = normalizedRect(this.grid.xi, this.grid.yi, this.grid.width, this.grid.height);

                            const sw = rect.w, sh_height = rect.h;
                            const base = Math.min(sw, sh_height);
                            if (base >= 20) {
                                const size = Math.max(10, Math.min(24, Math.round(base * 0.12)));
                                const pad = Math.max(2, Math.round(size * 0.2));
                                const brx = rect.x + rect.w - pad;
                                const bry = rect.y + rect.h - pad;
                                const active = !!(this.resizing || this.__resizing);
                                if (this.showMenuBar)
                                    drawResizeHandle(ctx, cornerX, cornerY, arrowSize)

                                const hbSize = size + pad;
                                this.__resizeHandle = {
                                    x: brx - hbSize,
                                    y: bry - hbSize,
                                    w: hbSize,
                                    h: hbSize,
                                };
                            } else {
                            }
                        }

                        if (this.resizing) {
                            ctx.fillStyle = "cyan";
                            ctx.strokeStyle = "lightCyan";
                            ctx.lineWidth = 4;
                            ctx.shadowBlur = 10;
                            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";

                        }

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = "transparent";
                    }
                }
            }

            distributeYValues(pointType) {
                if (!pointType) {
                    pointType = 'interval'
                }
                distributeIntervalPointsY(this.scatterData.points, this.grid, {
                    yPadFrac: 0.08,
                    minLaneSpacing: 0,
                    onlyIfMissingY: false
                });
            }

            plotBarChartDoseResponse(graph, ctx) {
                if (!this.grid || !this.grid.rescale) {
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;
                        return null;
                    }
                    const ymin = Math.min(...validPoints.map(p => p.y));
                    const ymax = Math.max(...validPoints.map(p => p.y));
                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                } else {
                    graph.rescale();
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;

                        return null;
                    }
                    this.grid.rescale();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 0;

                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    if (this.aspectRatio === 1) {
                        this.grid.width = sw;
                        this.grid.height = sw;
                    } else {

                    }

                    const ymax = Math.max(...validPoints.map(p => p.y));

                    this.setxmax(xmax)
                    this.setymax(ymax)
                    this.grid.rescale();
                    this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                    let labels = this.scatterData.points.map(point => point.name ?? point.x);

                    const data = this.scatterData.points.map(point => point.y);
                    if (labels.length > 0 && !this.grid.xmax)
                        this.grid.setxmax(labels.length)
                    this.grid.rescale();

                    ctx.font = "13px Arial";
                    const barWidth = (this.grid.width) / (labels.length * 3);
                    labels.forEach((label, index) => {
                        const xScreen = (this.grid.X(index));
                        const yScreen = (this.grid.Y(data[index]));
                        ctx.fillStyle = 'rgb(0, 87, 163, 0.5)'

                        ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, (this.grid.Y(this.grid.ymin)) - yScreen);
                        ctx.save();
                        ctx.translate(xScreen, (this.grid.Y(this.grid.ymin) + 10));
                        ctx.rotate(-Math.PI / 4);
                        ctx.fillStyle = 'gray';
                        ctx.textAlign = 'right';
                        ctx.fillText(label, 0, 0);
                        ctx.restore();
                        const stdv = this.scatterData.points[index].stdDev;
                        if (stdv) {
                            const upperError = (this.grid.Y(data[index] + stdv));
                            const lowerError = (this.grid.Y(data[index] - stdv));
                            let scrDv = this.grid.Y(stdv);

                            ctx.strokeStyle = 'gray';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(xScreen, upperError);
                            ctx.lineTo(xScreen, lowerError);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(xScreen - 5, upperError);
                            ctx.lineTo(xScreen + 5, upperError);
                            ctx.moveTo(xScreen - 5, lowerError);
                            ctx.lineTo(xScreen + 5, lowerError);
                            ctx.stroke();
                        }
                    });

                    if (this.name) {
                        ctx.fillStyle = 'lightGray';
                        ctx.font = '21px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(this.name, this.grid.xi + this.grid.width / 2, this.grid.yi - 10);
                    }

                    if (this._highlight) {
                        const rectWidth = this.getWidth();
                        const rectHeight = this.getHeight();
                        const arrowSize = 15;

                        ctx.fillStyle = "lightCyan";
                        ctx.strokeStyle = "lightCyan";
                        ctx.lineWidth = 2;
                        ctx.shadowBlur = 6;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                        const bottomRightStartX = this.grid.xi + rectWidth + 40;
                        const bottomRightStartY = this.grid.yi + rectHeight + 40;
                        ctx.beginPath();
                        ctx.moveTo(bottomRightStartX, bottomRightStartY);
                        ctx.lineTo(bottomRightStartX - arrowSize, bottomRightStartY);
                        ctx.lineTo(bottomRightStartX, bottomRightStartY - arrowSize);
                        ctx.closePath();
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = "transparent";
                    }
                }

                if (this.sigmoid != null) {
                    function sigmoid(x, min, max, ic50, slope) {
                        return min + (max - min) / (1 + Math.pow(10, (Math.log10(ic50 + 1e-6) - x) * slope));
                    }
                    ctx.strokeStyle = 'red';
                    ctx.beginPath();
                    for (let x = this.grid.xmin; x <= this.grid.xmax; x += 0.1) {
                        const y = sigmoid(x, this.sigmoid.min, this.sigmoid.max, this.sigmoid.ic50, this.sigmoid.slope);
                        const xWorld = this.grid.X(x);
                        const yWorld = this.grid.Y(y);
                        if (x === this.grid.xmin)
                            ctx.moveTo(xWorld, yWorld);
                        else
                            ctx.lineTo(xWorld, yWorld);
                    }
                }
            }

            static fromJSON = (data) => {
                if (Array.isArray(data)) {
                    let composite = new CompositePlot()
                    for (let chunk of data) {
                        composite.addPlot(this.fromJSON(chunk));
                    }
                    composite.name = data.name;
                    composite.w = composite.composites[0].w;
                    composite.h = composite.composites[0].h;
                    composite.x = composite.composites[0].x;
                    composite.y = composite.composites[0].y;
                    return composite
                }
                else if (data.composites) {
                    let c = CompositePlot.buildFromJSON(data, MGrid, MPlot)
                    return c;
                }
                else if (data.oligos) {
                    const tr = Track.Track.fromJSONObject(data)
                    return tr;
                }
                else {
                    const plot = new MPlot(data.scatterData);
                    plot.config_script = data.config_script || {};
                    if (data.lineEquations && data.lineEquations.length > 0) {
                        plot.lineEquations = data.lineEquations.map(eq => {
                            if (eq.mfunction && typeof eq.mfunction === 'string') {
                                try {
                                    eq.mfunction = new Function(`return ${decodeURIComponent(eq.mfunction)}`)();
                                } catch (e) {
                                    console.error('Failed to decode mfunction:', e);
                                }
                            }
                            return eq;
                        });
                    }
                    plot.name = data.name;
                    plot.mode = data.mode;
                    plot.startDate = new Date(data.startDate);
                    plot.endDate = new Date(data.endDate);
                    plot.scaleType = data.scaleType;
                    plot.grid.xmin = data.grid.xmin;
                    plot.grid.xmax = data.grid.xmax;
                    plot.grid.ymin = data.grid.ymin;
                    plot.grid.ymax = data.grid.ymax;
                    plot.maximize = data.maximize;
                    plot.isBackground = data.isBackground;
                    plot.x = data.x;
                    plot.y = data.y;
                    plot.backgroundColor = data.backgroundColor;
                    plot.w = data.w;
                    plot.h = data.h;
                    plot.uid = data.uid;
                    plot.type = data.type;
                    plot.theme = data.theme;
                    plot.themeName = data.themeName;
                    plot.lineColor = data.lineColor;
                    plot.pointColor = data.pointColor;
                    plot.errorBarColor = data.errorBarColor;
                    plot.fitScaleToData = data.fitScaleToData;

                    if (data.formatAxis && typeof data.formatAxis === 'string') {
                        try {
                            plot.formatAxis = new Function(`return ${atob(data.formatAxis)}`)();
                        } catch (e) {
                            console.error('Failed to decode integerAxis:', e);
                        }
                    }

                    return plot;
                }

            }

            fitData() {

                this.fitScaleToData = true;
            }

            async toPNG(pt) {

                const graph = pt.grid;

                graph.width = 1500
                graph.height = 1500
                let offscreenCanvas = document.createElement('canvas');
                offscreenCanvas.width = graph.width;
                offscreenCanvas.height = graph.height;

                let offscreenCtx = offscreenCanvas.getContext('2d');
                offscreenCtx.fillStyle = 'white';
                offscreenCtx.fillRect(0, 0, graph.width, graph.height);
                MGrid.GP = true;
                let ng = this.grid.clone();
                ng.width = graph.width - 600;
                ng.height = graph.height - 600;
                ng.xi = 300
                ng.yi = 300
                ng.rescale();
                this.highlight = false;

                this.drawPlot(pt, offscreenCtx, ng, true)

                let dataURL = offscreenCanvas.toDataURL('image/png');
                let link = document.createElement('a');
                link.href = dataURL;
                link.download = this.name + ".png";
                link.click();
                MGrid.GP = false;
            }

            clk_drag(pt) {

                if (!pt) {
                    return;
                }
                if (!pt.selectedPlate) {
                    pt.setSelected(this)
                }
                this.selectIt()

                if (pt.wbid != null && pt.wbid === 'click_and_drag' + this.name) {
                    return;
                }

                if (this.type === 'timeline') {

                    this.unModal();
                }

                let keydown = (event) => {
                    if (event.ctrlKey && event.key !== 'Control') {
                        return;
                    }
                    if (event.key == 'Control') {
                        return;
                    }
                    if (event.key === 'Backspace') {
                    }
                    else if (event.key === 'Enter') {
                    }
                    if (event.key === 'Tab') {
                    }
                    else if (event.key === 'Delete') {
                    }
                    if (/^[a-zA-Z0-9!.\-%$*&#@()[\]{}_ :,=\/+*^]$/.test(event.key)) {
                    }
                    this.handleKeyDown(pt, event)
                }

                let px = 0;
                let py = 0;
                let md = false;

                let mouseDownListener = async (x, y) => {
                    if (!isMobile()) {
                        if (this.inButtons(x, y, pt)) {
                            return;
                        }
                    }

                    md = true;
                    px = pt.grid.Xwc(x);
                    py = pt.grid.Ywc(y);
                    this.___hover = null;

                    let a = pt.getActionGlyphFromMouseClick(x, y)
                    if (a) {
                        a.action(pt)
                        return
                    }

                    this.___hover = updateHandleHover(this.scatterData.points, x, y);
                    if (this.___hover) {

                        let move_endpoint = {
                            md: true,
                            id: 'move_endpoint' + this.name,
                            mouseMoveListener: (x, y) => {
                                if (move_endpoint.md) {
                                    let mmx = this.grid.Xwc((x) - this.grid.xi * 2);
                                    if (this.___hover.handle === 'end')
                                        this.___hover.point.x = mmx + this.grid.worldWidth(20);
                                    else
                                        this.___hover.point.startX = mmx;
                                }
                            },
                            mouseUpListener: (x, y) => {
                                move_endpoint.md = false;
                                setTimeout(() => {
                                    this.deselectAll();
                                    pt.wb(null)
                                }, 500)

                            },
                            mouseDownListener: (x, y) => {

                            },
                            keydown: keydown,
                            init: () => {
                            },
                            close: () => {
                            },
                            priority: true,
                            draw: (grid, ctx) => {
                            },
                            menuManager: null,
                        }
                        if (pt && pt.wb)
                            pt.wb(move_endpoint)
                        return;
                    }

                    for (const p of this.scatterData.points) {
                        if (p.isInside) {
                            if (p.isInside(x, y)) {
                                if (p.highlight) {
                                    pushHistory(HM(this))

                                    pt.setPointSelected(p, x, y);

                                    let t = {
                                        id: 'mmove-points',
                                        mouseMoveListener: null,
                                        mouseUpListener: null,
                                        mouseDownListener: null,
                                        draw: null,
                                        menuManager: null,
                                        priority: true
                                    };

                                    let dragStartX = x;
                                    let dragStartY = y;
                                    let dragging = true;
                                    t.draw = (grid, ctx) => {
                                        p.highlight = true;
                                        p.isSelected = true;
                                    };

                                    t.close = () => {
                                        console.log("close ")
                                    };

                                    t.mouseDownListener = (_x, _y) => {
                                        dragStartX = _x;
                                        dragStartY = _y;
                                        dragging = true;
                                    };

                                    t.mouseMoveListener = (_x, _y) => {

                                        if (!dragging) {

                                            return;
                                        }
                                        let dx = _x - dragStartX;
                                        let dy = _y - dragStartY;
                                        p.highlight = true;
                                        p.isSelected = true;

                                        p.x += this.grid.worldWidth(dx);
                                        if (p.startX != null) {
                                            p.startX += this.grid.worldWidth(dx);

                                        }
                                        if (p.startY != null) {
                                            p.startY -= this.grid.worldHeight(dy);

                                        }
                                        p.y -= this.grid.worldHeight(dy);
                                        dragStartX = _x;
                                        dragStartY = _y;
                                    };

                                    t.mouseUpListener = async (x, y) => {
                                        pt.wb(null)

                                        setTimeout(() => {
                                            this.clk_drag(pt)

                                        }, 100)
                                        dragging = false;
                                    };
                                    pt.wb(t);
                                    return;
                                }
                            }
                        }
                    }

                };

                let mouseMoveListener = async (x, y) => {
                    this.grid.rescale();
                    let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                    this.__scx_ = x;
                    this.__scy_ = y;

                    const scx = x;
                    const scy = y;

                    this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                    this.deselectPoints();
                    this.selectIt();
                    if (this.inButtons(x, y, pt)) {
                        return;
                    }

                    if (!md) {

                        this.___hover = updateHandleHover(this.scatterData.points, x, y);
                        if (this.___hover) {

                            let move_endpoint = {
                                md: true,
                                id: 'move_endpoint' + this.name,
                                mouseMoveListener: (x, y) => {
                                    if (move_endpoint.md) {
                                        let mmx = this.grid.Xwc((x) - this.grid.xi * 2);
                                        if (this.___hover.handle === 'end')
                                            this.___hover.point.x = mmx + this.grid.worldWidth(20);
                                        else
                                            this.___hover.point.startX = mmx;
                                    }
                                },
                                mouseUpListener: (x, y) => {
                                    move_endpoint.md = false;
                                    setTimeout(() => {
                                        this.deselectAll();
                                        pt.wb(null)
                                    }, 500)

                                },
                                mouseDownListener: (x, y) => {

                                },
                                keydown: keydown,
                                init: () => {
                                },
                                close: () => {
                                },
                                priority: true,
                                draw: (grid, ctx) => {
                                },
                                menuManager: null,
                            }
                            if (pt && pt.wb)
                                pt.wb(move_endpoint)
                            return;
                        }

                        this.scatterData.points.forEach(point => {
                            if (point.isInside) {
                                if (point.isInside(x, y)) {
                                    point.highlight = true;
                                    point.isSelected = true;
                                }
                            }
                            else
                                if (pt && point && point.startX) {
                                    let pxstart = this.grid.X(point.startX)
                                    let pxend = this.grid.X(point.x)
                                    if (pxstart - 5 <= scx && pxend + 5 >= scx) {
                                        point.highlight = true;
                                        point.isSelected = true;
                                    }
                                    const px = this.grid.X(point.x);
                                    let py = this.grid.Y(point.y)
                                    if (point.scy) {
                                        py = point.scy
                                    }
                                    const dx = Math.abs(scx - px);
                                    const xThreshold = 7;
                                    const dy = Math.abs(scy - py);
                                    const yThreshold = 7;
                                    if (dx < xThreshold && dy < yThreshold) {
                                        point.highlight = true;
                                        point.isSelected = true;

                                    }
                                    const spx = this.grid.X(point.startX);
                                    const dx2 = Math.abs(scx - spx);
                                    if (dx2 < xThreshold && dy < yThreshold) {
                                        point.highlight = true;
                                        point.isSelected = true;
                                    }
                                    if (isMouseOverArrow(scx, scy, point, this.grid, pt, 5)) {
                                        point.highlight = true;
                                        point.isSelected = true;
                                    }
                                } else if (pt && point) {
                                    const px = this.grid.X(point.x);
                                    const dx = Math.abs(scx - px);
                                    let py = this.grid.Y(point.y);
                                    if (point.scy) {
                                        py = point.scy;
                                    }
                                    const dy = Math.abs(scy - py);
                                    const xThreshold = 7;
                                    const yThreshold = 7;
                                    if (dx < xThreshold && dy < yThreshold) {
                                        point.highlight = true;
                                        point.isSelected = true;
                                    }
                                }
                        });
                    }

                    if (md) {
                        pt.clearActionGlyphs();
                        let xd = px - pt.grid.Xwc(x);
                        let yd = py - pt.grid.Ywc(y);
                        pt.grid.setxmin(pt.grid.getxmin() + xd);
                        pt.grid.setxmax(pt.grid.getxmax() + xd);

                        if (!this.isMaximized()) {
                            pt.grid.setymin(pt.grid.getymin() + yd);
                            pt.grid.setymax(pt.grid.getymax() + yd);
                        }
                        pt.grid.rescale();
                    } else {
                        this.___hover = updateHandleHover(this.scatterData.points, x, y);

                    }

                }
                let mouseUpListener = async (x, y) => {

                    px = 0;
                    py = 0;
                    md = false;
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    smenu = null;
                    let b = this.buttons;
                    let init = (this.grid.xi + this.grid.width - (bsize * this.buttons.length));
                    if (init < 0) {
                        init = (0)
                    }
                    let index = 0;
                    this.deselectPoints();

                    if (pt.menu && pt.menu_vis) {
                        return;
                    }

                    for (let button of b) {
                        let buttonX = init + index * bsize;

                        let buttonY = (this.grid.yi - (this.margin.top));
                        let screen_height = (this.getHeight());
                        if (buttonY < 0 && (buttonY + screen_height) > 0) {
                            buttonY = 10;
                        }
                        let bbw = bsize;
                        index++;
                        if (
                            x >= buttonX &&
                            x <= buttonX + bbw &&
                            y >= buttonY &&
                            y <= buttonY + button.height
                        ) {
                            button.action(x, y, x, y, pt)
                            return true;
                        }
                    }

                    let scx = x;
                    let scy = y;
                    this.__moving = false;
                    this.grid.rescale();
                    if (init < 0) {
                        init = (0)
                    }
                    let sel = []
                    this.scatterData.points.forEach(point => {
                        if (point.isInside) {
                            if (point.isInside(x, y)) {
                                point.highlight = true;
                                point.isSelected = true;
                                sel.push(point)
                            }
                        }
                        else
                            if (pt && point && point.startX) {
                                let pxstart = this.grid.X(point.startX)
                                let pxend = this.grid.X(point.x)
                                if (pxstart - 5 <= scx && pxend + 5 >= scx) {
                                    point.highlight = true;
                                    point.isSelected = true;
                                    sel.push(point)
                                }
                                const px = this.grid.X(point.x);
                                let py = this.grid.Y(point.y)
                                if (point.scy) {
                                    py = point.scy
                                }
                                const dx = Math.abs(scx - px);
                                const xThreshold = 7;
                                const dy = Math.abs(scy - py);
                                const yThreshold = 7;
                                if (dx < xThreshold && dy < yThreshold) {
                                    point.highlight = true;
                                    point.isSelected = true;
                                    sel.push(point)

                                }
                                const spx = this.grid.X(point.startX);
                                const dx2 = Math.abs(scx - spx);
                                if (dx2 < xThreshold && dy < yThreshold) {
                                    point.highlight = true;
                                    point.isSelected = true;
                                    sel.push(point)

                                }
                                if (isMouseOverArrow(scx, scy, point, this.grid, pt, 5)) {
                                    point.highlight = true;
                                    point.isSelected = true;
                                    sel.push(point)

                                }
                            } else if (pt && point) {
                                const px = this.grid.X(point.x);
                                const dx = Math.abs(scx - px);

                                let py = this.grid.Y(point.y);
                                if (point.scy) {
                                    py = point.scy;
                                }

                                const dy = Math.abs(scy - py);

                                const xThreshold = 7;
                                const yThreshold = 7;
                                if (dx < xThreshold && dy < yThreshold) {
                                    point.highlight = true;
                                    point.isSelected = true;
                                    sel.push(point)

                                }
                            }
                    });

                    sel = sel.filter((item => {
                        const seen = new Set();
                        return item => {
                            const key = `${item.type}::${item.name}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        };
                    })());

                    if (sel && sel.length >= 1) {
                        let point = sel[0]
                        pt.setPointSelected(point, x, y);
                    } else {

                    }
                }

                let t = {
                    id: 'click_and_drag' + this.name,
                    mouseMoveListener: mouseMoveListener,
                    mouseUpListener: mouseUpListener,
                    mouseDownListener: mouseDownListener,
                    keydown: keydown,
                    init: () => {
                    },
                    close: () => {
                        smenu = null;
                    },
                    priority: true,
                    draw: (grid, ctx) => {
                    },
                    menuManager: null,
                    smenu: null
                }
                if (pt && pt.wb)
                    pt.wb(t)
            }

            async applyConfig(code, plateTrack) {
                let allScatterData = {
                    points: []
                };
                if (typeof code === 'object') {
                    cdic = code;
                } else
                    cdic = parseInput(code);
                let name = code.name;
                let xvalues_expression = cdic['x']
                let yvalues_expression = cdic['y']
                let stdDev_expression = cdic['stdDev']

                let yvalObjectBool = false;
                let color = cdic['color']
                if (!color) {
                    color = 'blue'
                }
                if (!xvalues_expression) {
                    xvalues_expression = 'index'
                }
                let yvalues = await exec('baja/plate/ops/frun-object', yvalues_expression, plateTrack);
                let stdDev_values = []
                if (stdDev_expression) {
                    stdDev_values = await exec('baja/plate/ops/frun-object', stdDev_expression, plateTrack);
                }

                let stdDevs = stdDev_values?.results || [];

                if (xvalues_expression.startsWith('index')) {
                    let i = 0;
                    for (let yv of yvalues.results) {
                        let stdDev = stdDevs[i]?.value ?? null;
                        if (typeof yv === 'object' && yv !== null && 'value' in yv && 'uid' in yv) {
                            yvalObjectBool = true;
                            allScatterData.points.push({
                                x: i,
                                y: yv.value,
                                name: `${yv.value}`,
                                color: color,
                                yrefid: yv.uid,
                                stdDev: stdDev
                            });
                        } else {
                            allScatterData.points.push({
                                x: i,
                                y: yv,
                                name: `${yv}`,
                                color: color,
                                stdDev: stdDev
                            });
                        }
                        i++;
                    }
                } else {
                    let xvalues = await exec('baja/plate/ops/frun-object', xvalues_expression, plateTrack);
                    let i = 0;
                    for (let xv of xvalues.results) {
                        let yv = yvalues.results[i];
                        let stdDev = stdDevs[i]?.value ?? null;

                        if (typeof xv === 'object' && xv !== null && 'value' in xv && 'uid' in xv) {
                            allScatterData.points.push({
                                x: xv.value,
                                y: yv.value,
                                name: `${xv.value}`,
                                color: color,
                                xrefid: xv.uid,
                                yrefid: yv.uid,
                                stdDev: stdDev
                            });
                        } else {
                            allScatterData.points.push({
                                x: xv,
                                y: yv,
                                name: `${xv}`,
                                color: color,
                                stdDev: stdDev
                            });
                        }
                        i++;
                    }

                }

                if (yvalObjectBool) {
                    allScatterData.points = allScatterData.points.filter(point => {
                        const yValue = typeof point.y === 'object' && 'value' in point ? point.y.value : point.y;
                        return typeof yValue === 'number' && !isNaN(yValue);
                    });
                } else {
                    allScatterData.points = allScatterData.points.filter(point => {
                        return typeof point.y === 'number' && !isNaN(point.y);
                    });
                }

                if (cdic['type']) {
                    if (cdic['type'].startsWith('barchart')) {

                    }
                    else if (cdic['type'] === 'pie') {
                    }
                    else {
                        allScatterData.points = allScatterData.points.filter(point => {
                            return typeof point.x === 'number' && !isNaN(point.x);
                        });
                    }

                    if (cdic['type'].indexOf('aggregate') > 0) {
                        const aggregatedData = {};
                        allScatterData.points.forEach(point => {
                            if (!aggregatedData[point.name]) {
                                aggregatedData[point.name] = [];
                            }
                            aggregatedData[point.name].push(point.y);
                        });
                        const aggregatedPoints = [];
                        Object.keys(aggregatedData).forEach(xValue => {
                            const yValues = aggregatedData[xValue];
                            const mean = yValues.reduce((sum, val) => sum + val, 0) / yValues.length;
                            const variance = yValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / yValues.length;
                            const stdDev = Math.sqrt(variance);
                            aggregatedPoints.push({
                                x: xValue,
                                y: mean,
                                stdDev: stdDev,
                                name: xValue
                            });
                        });
                        allScatterData.points = aggregatedPoints;
                    }

                }
                this.config_script = cdic;
                this.name = name;
                if (!this.name) {
                    this.name = generateNautName();
                }
                if (cdic['type']) {
                    this.type = cdic['type']
                } else {
                    this.type = null;
                }
                this.scatterData = allScatterData;

                if (cdic['equation']) {
                    if (cdic["equation"].toLowerCase() === 'linearregression') {
                        let eqLabel = ''
                        if (cdic['equation_label']) {
                            eqLabel = cdic['equation_label']
                        }


                        function linearRegression(allScatterData) {
                            const points = allScatterData.points;
                            if (points.length === 0) {
                                throw new Error("The points array is empty.");
                            }
                            const x = points.map(point => point.x);
                            const y = points.map(point => point.y);
                            const n = points.length;
                            const sumX = x.reduce((sum, xi) => sum + xi, 0);
                            const sumY = y.reduce((sum, yi) => sum + yi, 0);
                            const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
                            const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
                            const meanX = sumX / n;
                            const meanY = sumY / n;
                            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                            const intercept = meanY - slope * meanX;
                            const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
                            const ssResidual = points.reduce(
                                (sum, point) => sum + Math.pow(point.y - (slope * point.x + intercept), 2),
                                0
                            );
                            const rSquared = 1 - ssResidual / ssTotal;

                            return { slope, intercept, rSquared };
                        }




                        const { slope, intercept, rSquared } = linearRegression(allScatterData);

                        this.addLineEquation({
                            type: 'regression',
                            slope: slope,
                            intercept: intercept,
                            label: `${m}`,
                            color: 'black',
                            rSquared: rSquared,
                            recalc(points) {
                                const updated = linearRegression(points);
                                this.slope = updated.slope;
                                this.intercept = updated.intercept;
                                this.rSquared = updated.rSquared;
                                return this;

                            }
                        });
                    }
                }
                if (cdic['sort']) {
                    if (cdic.sort.toLowerCase() === 'descending') {
                        this.sortDescending()
                    } else if (cdic.sort.toLowerCase() == 'ascending') {
                        this.sortAscending();
                    }
                }
                this.fitScaleToData = true;
                this.x_axis_label = cdic['x-label']
                this.y_axis_label = cdic['y-label']
                if (cdic['ymin'] != null) {
                    this.grid.ymin = parseFloat(cdic['ymin'])
                }
                if (cdic['ymax'] != null) {
                    this.grid.ymax = parseFloat(cdic['ymax'])
                }
                if (cdic['xmin'] != null) {
                    this.grid.xmin = parseFloat(cdic['xmin'])
                }
                if (cdic['xmax'] != null) {
                    this.grid.xmax = parseFloat(cdic['xmax'])
                }

                const result = analyzePoints(allScatterData);
                this.lineColor = 'blue';
                this.pointColor = 'red';
                this.errorBarColor = 'gray';
            }

            setScale(type) {
                if (type === 'log') {
                    this.grid = LogGrid.fromGrid(this.grid)
                    this.grid.xLogScale = true
                    this.grid.yLogScale = true;

                }
                else if (type === 'logx') {
                    this.grid = LogGrid.fromGrid(this.grid)
                    this.grid.xLogScale = true;
                    this.grid.yLogScale = false;

                } if (type === 'logy') {
                    this.grid = LogGrid.fromGrid(this.grid)
                    this.grid.xLogScale = false;
                    this.grid.yLogScale = true;

                }
                else if (type === 'linear') {
                    this.grid = MGrid.fromGrid(this.grid)
                }
                this.grid.rescale();
                this.scaleType = type;

            }

            isMouseInTab(px, py) {
                highlightTab = null;
                const nameTabX = this.grid.xi - this.margin.left;
                const optionsTabX = nameTabX + this.tabWidth + this.tabGap;
                const moveTabX = optionsTabX + this.tabWidth + this.tabGap;

                const tabY = this.grid.yi - this.tabHeight - 25;
                const isInMoveTab = px >= nameTabX && px <= (nameTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 25);
                const isInOptionsTab = px >= optionsTabX && px <= (optionsTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 20);

                if (isInOptionsTab) {
                    highlightTab = 'options'
                    return 'options';
                }

                if (isInMoveTab) {
                    highlightTab = 'move'
                    this.__moving = true;
                    return 'move';
                }

                if (this.mode === '__viewer') {
                    return;
                }

                this.grid.rescale();
                let x = px;
                let y = py;
                let b = this.buttons;
                let init = (this.grid.xi + this.grid.width - (bsize * this.buttons.length));
                if (init < 0) {
                    init = (0)
                }
                let index = 0;
                for (let button of b) {
                    let buttonX = init + index * bsize;

                    let buttonY = (this.grid.yi - (this.margin.top));
                    let screen_height = (this.getHeight());
                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }

                    let bbw = bsize;
                    index++;
                    if (
                        x >= buttonX &&
                        x <= buttonX + bbw &&
                        y >= buttonY &&
                        y <= buttonY + button.height
                    ) {
                        button.highlight()
                        return button.name;
                    }
                }

                return null;
            }
            async getContextMenuItems(pt) {
                let m = [];
                if (this.type === timeline)
                    m = this.buildTimelineMenu(pt, m);
                m = m.concat(this.getOptionsMenuList(pt));

                if (this.___pointMenuItems) {
                    m = m.concat(this.___pointMenuItems);
                }

                const seenLabels = new Set();
                m = m.filter(item => {
                    if (item && item.label && !seenLabels.has(item.label)) {
                        seenLabels.add(item.label);
                        return true;
                    }
                    return false;
                });

                return m;

            }

            async getViewerMenuItems(pt) {
                let m = await exec('flexigraph/menuitems/viewer', pt, this)
                return m;
            }

            async displayContextSpecificMenuItems(pt) {
                let m = []
                if (this.type === timeline) {
                    m = this.buildTimelineMenu(pt, m);
                }
                if (isMobile()) {
                    exec('flexigraph/show-mobile-menu.js', 0, 0, m, null, null, 'mainPanel')
                } else {
                    m = this.getOptionsMenuList(pt)
                    const smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 3)

                    setTimeout(() => {
                        pt.setMenu(smenu)
                    }, 200)
                }
            }

            unModal() {
                smenu = null;
                this.unhighlight();
            }

            normalizeTimePoints(graph) {
                const screen_ = 200;
                let xwm = graph.worldWidth(this.grid.worldWidth(screen_))

                const xMin = this.grid.xmin;
                const xMax = this.grid.xmax;

                const totalCanvasRange = xMax - xMin;

                const startMs = toMillis(this.startDate);
                const endMs = toMillis(this.endDate);
                const totalTimeRange = endMs - startMs;

                if (!isFinite(totalCanvasRange) || totalCanvasRange === 0) return;
                if (!isFinite(totalTimeRange) || totalTimeRange === 0) return;

                for (const p of this.scatterData.points) {
                    if (!p || !p.date) continue;

                    const t = toMillis(p.date);
                    if (!isFinite(t)) continue;

                    const normalized = (t - startMs) / totalTimeRange;
                    p.x = xMin + normalized * totalCanvasRange;
                }
            }

            async gotoCenterTime(pt) {
                const startDate = this.startDate;
                const endDate = this.endDate;
                const startMs = startDate.getTime();
                const endMs = endDate.getTime();
                const rangeMs = endMs - startMs;
                const centerMs = (startMs + endMs) / 2;
                const windowMs = rangeMs * 0.10;
                const halfMs = windowMs / 2;
                const windowStart = new Date(centerMs - halfMs);
                const windowEnd = new Date(centerMs + halfMs);

                const xstart = timeToX(
                    windowStart,
                    this.grid.xmin,
                    this.grid.xmax,
                    startDate,
                    endDate
                );

                const xend = timeToX(
                    windowEnd,
                    this.grid.xmin,
                    this.grid.xmax,
                    startDate,
                    endDate
                );

                const xstartSc = this.grid.X(xstart);
                const xendSc = this.grid.X(xend);

                const screen_xm = pt.grid.Xwc(xstartSc);
                const screen_xp = pt.grid.Xwc(xendSc);

                const width = Math.abs(screen_xp - screen_xm);

                const centerX = (screen_xm + screen_xp) / 2;

                await pt.zoomto(centerX, this.grid.Y(0), this.grid.height, width);
            }

            buildTimelineMenu(pt, menuList) {
                let path = ''
                let name = ''
                let __file = null;
                let scx_;
                let scy_;
                menuList.push({
                    label: this.isBackground ? "Unlock from background" : "Lock to background",
                    __date: '',
                    click: async (scx, scy) => {
                        this.isBackground = !this.isBackground;

                    }
                });
                menuList.push({
                    label: this.showNowBar ? "Hide [now] mark" : "Show [now] mark",
                    __date: '',
                    click: async (scx, scy) => {
                        this.showNowBar = !this.showNowBar;
                    }
                });
                menuList.push({
                    label: this.maximize ? "Default (un-maximize) size" : "Maximize",
                    __date: '',
                    click: async (scx, scy) => {
                        this.maximize = !this.maximize;
                        if (this.maximize) {

                        }
                    }
                });
                menuList.push(
                    {
                        label: `Plot Name`,
                        click: async (scx, scy) => {

                            let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300)
                            let m = va['Name']
                            if (m != null) {
                                this.name = m;
                            }

                        },
                        move: () => {
                        }
                    }); menuList.push(
                        {
                            label: `Apply icons`,
                            click: async (scx, scy) => {

                                this.applyIcons()

                            },
                            move: () => {
                            }
                        });
                menuList.push(
                    {
                        label: `Set start time...`,
                        __date: '',
                        click: async (scx, scy) => {

                            let start_date = null;
                            let end_date = null;

                            let startTimePanel = null;
                            const startPanel = createIonFunction((hook) => {
                                startTimePanel = hook;
                            });
                            let endTimePanel = null;
                            const endnPanel = createIonFunction((hook) => {
                                endTimePanel = hook;
                            });

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
                                                'component': {
                                                    wid: 'html',
                                                    data: `<hr> Start date `
                                                }
                                            },

                                            {
                                                'width': '100%',
                                                'height': '100vh',
                                                'component': {
                                                    wid: 'calendar-chooser',
                                                    refCallback: startPanel,
                                                    data: {
                                                        select: createIonFunction((_date) => {
                                                        })
                                                    }
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {

                                                                    function calculateXRange(startDate, endDate, { origin = 'start' } = {}) {
                                                                        const toDate = (v) => (v instanceof Date ? new Date(v.getTime()) : new Date(v));
                                                                        const s = toDate(startDate);
                                                                        const e = toDate(endDate);

                                                                        if (isNaN(s)) throw new Error("startDate must be a valid Date (or parseable).");
                                                                        if (isNaN(e)) throw new Error("endDate must be a valid Date (or parseable).");

                                                                        const HOUR_MS = 3600 * 1000;

                                                                        let originDate;
                                                                        if (origin === 'start') {
                                                                            originDate = s;
                                                                        } else if (origin === 'year0') {

                                                                            originDate = new Date(Date.UTC(0, 0, 1, 0, 0, 0));
                                                                        } else {

                                                                            originDate = toDate(origin);
                                                                            if (isNaN(originDate)) throw new Error("origin is not a valid Date/instant.");
                                                                        }

                                                                        const toHoursFromOrigin = (d) => (d.getTime() - originDate.getTime()) / HOUR_MS;

                                                                        let xMin = toHoursFromOrigin(s);
                                                                        let xMax = toHoursFromOrigin(e);

                                                                        if (xMax < xMin) [xMin, xMax] = [xMax, xMin];

                                                                        return { xMin, xMax, origin: originDate.toISOString() };
                                                                    }

                                                                    let start = new Date(startTimePanel.getValue());

                                                                    this.startDate = new Date(this.startDate);
                                                                    this.endDate = new Date(this.endDate);

                                                                    let duration = this.endDate - this.startDate;

                                                                    let newEndDate = new Date(start.getTime() + duration);

                                                                    this.startDate = start;
                                                                    this.endDate = newEndDate;

                                                                    const { xMin, xMax } = calculateXRange(this.startDate, this.endDate);
                                                                    this.grid.zoom(xMin, xMax, 0, 1);
                                                                    hideAllModal();
                                                                    setTimeout(() => {
                                                                        CurrentLayout.reset('mainPanel')
                                                                    }, 300)

                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                    setTimeout(() => {
                                                                        CurrentLayout.reset('mainPanel')
                                                                    }, 300)

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
                            CurrentLayout.setComponent('mainPanel', main_layout);

                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `Set Time Range`,
                        __date: '',
                        click: async (scx, scy) => {

                            let start_date = null;
                            let end_date = null;

                            let startTimePanel = null;
                            const startPanel = createIonFunction((hook) => {
                                startTimePanel = hook;
                            });
                            let endTimePanel = null;
                            const endnPanel = createIonFunction((hook) => {
                                endTimePanel = hook;
                            });

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
                                                'component': {
                                                    wid: 'html',
                                                    data: `<hr> Start date `
                                                }
                                            },

                                            {
                                                'width': '100%',
                                                'height': '100vh',
                                                'component': {
                                                    wid: 'calendar-chooser',
                                                    refCallback: startPanel,
                                                    data: {
                                                        select: createIonFunction((_date) => {
                                                            start_date = _date;
                                                        })
                                                    }
                                                }
                                            },
                                            {
                                                'width': '100%',
                                                'height': '100vh',
                                                'component': {
                                                    wid: 'html',
                                                    data: `<hr> End date `
                                                }
                                            },
                                            {
                                                'width': '100%',
                                                'height': '100vh',
                                                'component': {
                                                    wid: 'calendar-chooser',
                                                    refCallback: endnPanel,
                                                    data: {
                                                        select: createIonFunction((_date) => {
                                                            end_date = _date;
                                                        })
                                                    }

                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Yes', ionFunction: createIonFunction(async () => {
                                                                    function calculateXRange(startDate, endDate, { origin = 'start' } = {}) {
                                                                        const toDate = (v) => (v instanceof Date ? new Date(v.getTime()) : new Date(v));
                                                                        const s = toDate(startDate);
                                                                        const e = toDate(endDate);

                                                                        if (isNaN(s)) throw new Error("startDate must be a valid Date (or parseable).");
                                                                        if (isNaN(e)) throw new Error("endDate must be a valid Date (or parseable).");

                                                                        const HOUR_MS = 3600 * 1000;

                                                                        let originDate;
                                                                        if (origin === 'start') {
                                                                            originDate = s;
                                                                        } else if (origin === 'year0') {

                                                                            originDate = new Date(Date.UTC(0, 0, 1, 0, 0, 0));
                                                                        } else {

                                                                            originDate = toDate(origin);
                                                                            if (isNaN(originDate)) throw new Error("origin is not a valid Date/instant.");
                                                                        }

                                                                        const toHoursFromOrigin = (d) => (d.getTime() - originDate.getTime()) / HOUR_MS;

                                                                        let xMin = toHoursFromOrigin(s);
                                                                        let xMax = toHoursFromOrigin(e);

                                                                        if (xMax < xMin) [xMin, xMax] = [xMax, xMin];

                                                                        return { xMin, xMax, origin: originDate.toISOString() };
                                                                    }

                                                                    this.startDate = startTimePanel.getValue();
                                                                    this.endDate = endTimePanel.getValue();

                                                                    const { xMin, xMax } = calculateXRange(this.startDate, this.endDate);
                                                                    this.grid.zoom(xMin, xMax, 0, 1);
                                                                    hideAllModal();
                                                                    CurrentLayout.reset('mainPanel')

                                                                })
                                                            },
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                    setTimeout(() => {
                                                                        CurrentLayout.reset('mainPanel')
                                                                    }, 300)

                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }

                                        ]]
                                }
                            }

                            setTimeout(() => {
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', main_layout);

                            }, 400)

                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `Import timeline from file`,
                        __date: '',
                        click: async (scx, scy) => {
                            if (!this.uid) {
                                this.uid = uuid();
                            }
                            let v = await exec('baja/table/io/import-timeline-into-timeline.js', this)
                            showModal(v)
                        }
                    })

                menuList.push(
                    {
                        label: `Import Microsoft Calendar`,
                        __date: '',
                        click: async (scx, scy) => {
                            if (!this.uid) {
                                this.uid = uuid();
                            }

                            let confirm = await exec('baja/lib/confirm.js', 'Has your work been saved first?', async () => {

                                setTimeout(() => {

                                    const iiiddd = this.uid;
                                    showModal({
                                        wid: 'calendar-import',
                                        data: {
                                            'fetchCalendar': createIonFunction(async (start, end) => {
                                                pt.ifun = `
                                        async function(pm, calendar_import_file) {
                                            pm.selectPlateByUID('${iiiddd}')
                                            let cale = await exec('baja/calendar/ms-events', pm.selectedPlate,  calendar_import_file);
                                            pm.selectedPlate.scatterData.points.push(...cale);
                                        }
                                    `;

                                                let ob = await exec('baja/table/io/save-yakro-service.js', pt, 'current_state.bjb');
                                            })
                                        }
                                    }, 250, 200)
                                }, 1000)
                            })
                            showModal(confirm)
                        }
                    },
                    {
                        label: 'Paste points...',
                        click: async (scx, scy) => {
                            let menu = [
                                {
                                    label: `Paste (label text|time-duration) Serial`,
                                    __date: '',
                                    click: async (scx, scy) => {
                                        let start_date = this.startDate;
                                        const vtext = await navigator.clipboard.readText();
                                        function parseDurationToMilliseconds(durationStr) {
                                            const timeUnits = [
                                                { unit: 'minutes', aliases: ['min', 'minutes?'], multiplier: 60 * 1000 },
                                                { unit: 'hours', aliases: ['h', 'hours?'], multiplier: 60 * 60 * 1000 },
                                                { unit: 'days', aliases: ['days?'], multiplier: 24 * 60 * 60 * 1000 },
                                                { unit: 'weeks', aliases: ['weeks?'], multiplier: 7 * 24 * 60 * 60 * 1000 },
                                                { unit: 'months', aliases: ['months?'], multiplier: 'months' },
                                                { unit: 'quarters', aliases: ['quarters?'], multiplier: 'quarters' },
                                                { unit: 'years', aliases: ['years?'], multiplier: 'years' }
                                            ];

                                            for (const { aliases, multiplier } of timeUnits) {
                                                for (const alias of aliases) {
                                                    const regex = new RegExp(`(\\d+(?:\\.\\d+)?)[–-](\\d+(?:\\.\\d+)?)\\s*${alias}`, 'i');
                                                    const match = durationStr.match(regex);
                                                    if (match) {
                                                        const value = Math.max(parseFloat(match[1]), parseFloat(match[2]));
                                                        return typeof multiplier === 'number'
                                                            ? { milliseconds: value * multiplier }
                                                            : { amount: value, unit: multiplier };
                                                    }
                                                }
                                            }

                                            for (const { aliases, multiplier } of timeUnits) {
                                                for (const alias of aliases) {
                                                    const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${alias}`, 'i');
                                                    const match = durationStr.match(regex);
                                                    if (match) {
                                                        const value = parseFloat(match[1]);
                                                        return typeof multiplier === 'number'
                                                            ? { milliseconds: value * multiplier }
                                                            : { amount: value, unit: multiplier };
                                                    }
                                                }
                                            }

                                            return { milliseconds: 0 };
                                        }

                                        function replaceRangeWithMax(input) {
                                            return input.replace(/(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)/g, (_, start, end) => {
                                                return Math.max(parseFloat(start), parseFloat(end));
                                            });
                                        }

                                        function addDuration(date, duration) {
                                            const result = new Date(date);

                                            if (typeof duration === 'number') {
                                                result.setTime(result.getTime() + duration);
                                                return result;
                                            }

                                            if (duration && typeof duration === 'object') {
                                                if ('milliseconds' in duration && typeof duration.milliseconds === 'number') {
                                                    result.setTime(result.getTime() + duration.milliseconds);
                                                    return result;
                                                }

                                                const { amount, unit } = duration;
                                                if (typeof amount === 'number') {
                                                    switch (unit) {
                                                        case 'months':
                                                            result.setMonth(result.getMonth() + amount);
                                                            break;
                                                        case 'quarters':
                                                            result.setMonth(result.getMonth() + 3 * amount);
                                                            break;
                                                        case 'years':
                                                            result.setFullYear(result.getFullYear() + amount);
                                                            break;
                                                        default:

                                                            result.setTime(result.getTime() + amount);
                                                            break;
                                                    }
                                                    return result;
                                                }
                                            }

                                            return result;
                                        }

                                        function generateTimeline(startDateStr, tasks) {
                                            let currentStart = new Date(startDateStr);
                                            const timeline = [];

                                            for (const [comment, durationStr] of tasks) {
                                                console.log(`Duration for "${durationStr}":`);

                                                let dstri = replaceRangeWithMax(durationStr);
                                                let duration = parseDurationToMilliseconds(dstri);

                                                if (duration.milliseconds) {
                                                    duration = duration.milliseconds;
                                                }

                                                const durationInDays = duration / (1000 * 60 * 60 * 24);
                                                console.log(`Duration for "${comment}": ${durationInDays.toFixed(2)} days`);

                                                const start = new Date(currentStart);
                                                const end = addDuration(start, duration);

                                                timeline.push({
                                                    comment,
                                                    start: start.toISOString(),
                                                    end: end.toISOString()
                                                });

                                                currentStart = end;
                                            }

                                            return timeline;
                                        }

                                        function convertTextToArray(text) {
                                            const lines = text.trim().split('\n');
                                            const result = lines.map(line => {
                                                const parts = line.split('\t');
                                                if (parts.length === 2) {
                                                    return [parts[0].trim(), parts[1].trim()];
                                                } else {
                                                    const lastSpaceIndex = line.lastIndexOf(' ');
                                                    const description = line.slice(0, lastSpaceIndex).trim();
                                                    const duration = line.slice(lastSpaceIndex + 1).trim();
                                                    return [description, duration];
                                                }
                                            });
                                            return result;
                                        }
                                        function dateFromX(x, xMin, xMax, start, end) {
                                            const totalCanvasRange = xMax - xMin;
                                            const totalTimeRange = end.getTime() - start.getTime();
                                            const normalizedX = (x - xMin) / totalCanvasRange;
                                            const date = new Date(start.getTime() + normalizedX * totalTimeRange);
                                            return date;
                                        }
                                        function getXFromDate(date, xMin, xMax, start, end) {
                                            const totalCanvasRange = xMax - xMin;
                                            const totalTimeRange = end.getTime() - start.getTime();
                                            const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

                                            const normalizedTime = timeSinceStart / totalTimeRange;
                                            return xMin + normalizedTime * totalCanvasRange;
                                        }
                                        function convertToTimelinePoints(events, xMin, xMax, startDate, endDate, currentY) {
                                            if (events.length === 0) return [];
                                            const globalStart = startDate;
                                            const globalEnd = endDate;

                                            return events.map((event, index) => {
                                                const startDate = new Date(event.start);
                                                const endDate = new Date(event.end);

                                                const point = {
                                                    x: getXFromDate(endDate, xMin, xMax, globalStart, globalEnd),
                                                    y: currentY,
                                                    type: 'interval',
                                                    startX: getXFromDate(startDate, xMin, xMax, globalStart, globalEnd),
                                                    name: event.comment,
                                                    color: 'black'
                                                };
                                                return point;
                                            });
                                        }

                                        let interaction_user = {
                                            id: 'plot-export-menu',
                                            mouseMoveListener: null,
                                            mouseUpListener: null,
                                            mouseDownListener: null,
                                            draw: null,
                                            menuManager: null,
                                            smenu: smenu
                                        }
                                        interaction_user.draw = (grid, ctx) => {
                                        }
                                        interaction_user.mouseDownListener = (x, y) => {
                                            let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                            let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                            const starting_date = dateFromX(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                            const yvalue = this.grid.Ywc(y)
                                            let t = convertTextToArray(vtext)
                                            let events = generateTimeline(starting_date, t)
                                            const timelinePoints = convertToTimelinePoints(events, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate, ty);
                                            for (let t of timelinePoints)
                                                this.scatterData.points.push(t)

                                            pt.wb(null)

                                        }

                                        interaction_user.close = () => {
                                            smenu = null;

                                        }
                                        interaction_user.mouseMoveListener = (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            pt.grid.rescale();
                                            this.grid.rescale();
                                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                                smenu.mouseMove(pt.grid, mmx, mmy)
                                            }
                                        }
                                        interaction_user.mouseUpListener = async (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                                await smenu.mouseUp(pt.grid, mmx, mmy)
                                            }
                                            pt.wb(null)
                                        }
                                        pt.wb(interaction_user)

                                    },
                                    move: () => {
                                    }
                                },
                                {
                                    label: `Paste (label-text|time-duration) Concurrent`,
                                    __date: '',
                                    click: async (scx, scy) => {
                                        let start_date = this.startDate;

                                        const vtext = await navigator.clipboard.readText();
                                        function parseDurationToMilliseconds(durationStr) {
                                            const regexes = [
                                                { regex: /(\d+)[–-](\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                                                { regex: /(\d+)[–-](\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                                                { regex: /(\d+)[–-](\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                                                { regex: /(\d+)[–-](\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                                                { regex: /(\d+)[–-](\d+)\s*months?/i, multiplier: 'months' },
                                                { regex: /(\d+)[–-](\d+)\s*quarters?/i, multiplier: 'quarters' },
                                                { regex: /(\d+)[–-](\d+)\s*years?/i, multiplier: 'years' },
                                                { regex: /(\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                                                { regex: /(\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                                                { regex: /(\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                                                { regex: /(\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                                                { regex: /(\d+)\s*months?/i, multiplier: 'months' },
                                                { regex: /(\d+)\s*quarters?/i, multiplier: 'quarters' },
                                                { regex: /(\d+)\s*years?/i, multiplier: 'years' },
                                            ];

                                            for (const { regex, multiplier } of regexes) {
                                                const match = durationStr.match(regex);
                                                if (match) {
                                                    const value = match[2] ? parseInt(match[2]) : parseInt(match[1]);
                                                    if (typeof multiplier === 'number') {
                                                        return { milliseconds: value * multiplier };
                                                    } else {
                                                        return { amount: value, unit: multiplier };
                                                    }
                                                }
                                            }

                                            return { milliseconds: 0 };
                                        }

                                        function addDuration(date, duration) {
                                            const result = new Date(date);

                                            if (typeof duration === 'number') {
                                                result.setTime(result.getTime() + duration);
                                                return result;
                                            }

                                            if (duration && typeof duration === 'object') {
                                                if ('milliseconds' in duration && typeof duration.milliseconds === 'number') {
                                                    result.setTime(result.getTime() + duration.milliseconds);
                                                    return result;
                                                }

                                                const { amount, unit } = duration;
                                                if (typeof amount === 'number') {
                                                    switch (unit) {
                                                        case 'months':
                                                            result.setMonth(result.getMonth() + amount);
                                                            break;
                                                        case 'quarters':
                                                            result.setMonth(result.getMonth() + 3 * amount);
                                                            break;
                                                        case 'years':
                                                            result.setFullYear(result.getFullYear() + amount);
                                                            break;
                                                        default:

                                                            result.setTime(result.getTime() + amount);
                                                            break;
                                                    }
                                                    return result;
                                                }
                                            }

                                            return result;
                                        }
                                        function convertToMillisecondsUsingUnit(baseDate, amount, unit) {
                                            const start = new Date(baseDate);
                                            const end = new Date(start);

                                            switch (unit) {
                                                case 'months':
                                                    end.setMonth(start.getMonth() + amount);
                                                    break;
                                                case 'quarters':
                                                    end.setMonth(start.getMonth() + amount * 3);
                                                    break;
                                                case 'years':
                                                    end.setFullYear(start.getFullYear() + amount);
                                                    break;
                                                default:
                                                    return 0;
                                            }

                                            return end.getTime() - start.getTime();
                                        }
                                        function replaceRangeWithMax(input) {
                                            return input.replace(/(\d+)[–-](\d+)/g, (_, start, end) => {
                                                return Math.max(parseInt(start), parseInt(end));
                                            });
                                        }

                                        function generateTimeline(startDateStr, tasks) {
                                            const baseDate = new Date(startDateStr);
                                            const timeline = [];

                                            for (const [comment, durationStr] of tasks) {

                                                console.log(`Duration for "${durationStr}": `);
                                                let dstri = replaceRangeWithMax(durationStr)
                                                let duration = parseDurationToMilliseconds(dstri);

                                                const start = new Date(baseDate);
                                                if (duration.milliseconds) {
                                                    duration = duration.milliseconds
                                                }

                                                const durationInDays = duration / (1000 * 60 * 60 * 24);
                                                console.log(`Duration for "${comment}": ${durationInDays.toFixed(2)} days`);
                                                const end = addDuration(start, duration);
                                                timeline.push({
                                                    comment,
                                                    start: start.toISOString(),
                                                    end: end.toISOString()
                                                });
                                            }

                                            return timeline;
                                        }

                                        function convertTextToArray(text) {
                                            const lines = text.trim().split('\n');
                                            const result = lines.map(line => {
                                                const parts = line.split('\t');
                                                if (parts.length === 2) {
                                                    return [parts[0].trim(), parts[1].trim()];
                                                } else {
                                                    const lastSpaceIndex = line.lastIndexOf(' ');
                                                    const description = line.slice(0, lastSpaceIndex).trim();
                                                    const duration = line.slice(lastSpaceIndex + 1).trim();
                                                    return [description, duration];
                                                }
                                            });
                                            return result;
                                        }

                                        function dateFromX(x, xMin, xMax, start, end) {
                                            const totalCanvasRange = xMax - xMin;
                                            const totalTimeRange = end.getTime() - start.getTime();
                                            const normalizedX = (x - xMin) / totalCanvasRange;
                                            const date = new Date(start.getTime() + normalizedX * totalTimeRange);
                                            return date;
                                        }
                                        function getXFromDate(date, xMin, xMax, start, end) {
                                            const totalCanvasRange = xMax - xMin;
                                            const totalTimeRange = end.getTime() - start.getTime();
                                            const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

                                            const normalizedTime = timeSinceStart / totalTimeRange;
                                            return xMin + normalizedTime * totalCanvasRange;
                                        }

                                        function convertToTimelinePoints(events, xMin, xMax, startDate, endDate, currentY) {
                                            if (events.length === 0) return [];
                                            const globalStart = startDate;
                                            const globalEnd = endDate;

                                            const yStep = 0.1;

                                            return events.map((event, index) => {
                                                const startDate = new Date(event.start);
                                                const endDate = new Date(event.end);

                                                const point = {
                                                    x: getXFromDate(endDate, xMin, xMax, globalStart, globalEnd),
                                                    y: currentY,
                                                    type: 'interval',
                                                    startX: getXFromDate(startDate, xMin, xMax, globalStart, globalEnd),
                                                    name: event.comment,
                                                    color: 'black'
                                                };

                                                currentY += yStep;
                                                return point;
                                            });
                                        }

                                        let interaction_user = {
                                            id: 'plot-export-menu',
                                            mouseMoveListener: null,
                                            mouseUpListener: null,
                                            mouseDownListener: null,
                                            draw: null,
                                            menuManager: null,
                                            smenu: smenu
                                        }
                                        interaction_user.draw = (grid, ctx) => {
                                        }
                                        interaction_user.mouseDownListener = (x, y) => {
                                            let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                            let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                            const starting_date = dateFromX(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                            const yvalue = this.grid.Ywc(y)
                                            let t = convertTextToArray(vtext)
                                            let events = generateTimeline(starting_date, t)
                                            const timelinePoints = convertToTimelinePoints(events, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate, ty);
                                            for (let t of timelinePoints)
                                                this.scatterData.points.push(t)
                                        }
                                        interaction_user.close = () => {
                                            smenu = null;
                                            this.clk_drag(pt)

                                        }
                                        interaction_user.mouseMoveListener = (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            pt.grid.rescale();
                                            this.grid.rescale();
                                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                                smenu.mouseMove(pt.grid, mmx, mmy)
                                            }
                                        }
                                        interaction_user.mouseUpListener = async (x, y) => {
                                            let mmx = pt.grid.Xwc(x);
                                            let mmy = pt.grid.Ywc(y);
                                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                                await smenu.mouseUp(pt.grid, mmx, mmy)
                                            }
                                            pt.wb(null)
                                        }
                                        pt.wb(interaction_user)

                                    },
                                    move: () => {
                                    }
                                },

                            ]

                            const graph = CurrentLayout.getStashed('graph')
                            if (graph) {
                                graph.showWindowMenu(menu, 10, 10, 400)
                            }

                        }
                    }

                )

                menuList.push(

                    {
                        label: `Add PDF...`,
                        __date: '',
                        click: async (scx, scy) => {
                            let startx = this.grid.xmin;
                            let lasso = {
                                id: 'point-add-to-timeline',
                                priority: true,
                                mouseMoveListener: (x, y) => {
                                    this.__scx_ = x;
                                    this.__scy_ = y - 10;
                                    let tx = (this.grid.Xwc(this.__scx_ - this.grid.xi * 2))
                                    this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                },
                                mouseUpListener: async (x, y) => {
                                    let va = await prompt("Name", ["Name"], { "Name": '' }, 300, 300)
                                    let m = va['Name']
                                    if (m != null) {
                                        let __color = 'rgba(0, 87, 163, 0.5)'
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
                                                            'component': w
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
                                                                    root: getUser(),
                                                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                                                        path = element.path;
                                                                        name = element.name;
                                                                        infoPrompt(" " + name + " selected.")
                                                                    }),
                                                                    "ionfunction.openfile": createIonFunction(async (file, text) => {

                                                                    }
                                                                    ),
                                                                    "ionfunction.path": createIonFunction(async (_path, nodes) => {
                                                                        path = _path;

                                                                    })
                                                                }
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
                                                                            console.error("No file selected for upload.");
                                                                            return { error: "No file selected" };
                                                                        }
                                                                        const user = getUser();
                                                                        const type = "data";
                                                                        const chunkSize = 5 * 1024 * 1024;
                                                                        const totalChunks = Math.ceil(file.size / chunkSize);
                                                                        let uploadedChunks = 0;

                                                                        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                                                                            const start = chunkIndex * chunkSize;
                                                                            const end = Math.min(start + chunkSize, file.size);
                                                                            const chunk = file.slice(start, end);

                                                                            const formData = new FormData();
                                                                            formData.append("user", user);
                                                                            formData.append("type", type);
                                                                            formData.append("file", chunk, file.name);
                                                                            if (path) {
                                                                                formData.append("path", path);
                                                                            }
                                                                            try {

                                                                                let host_ = window['env']['apiUrl']
                                                                                const response = await fetch(host_ + '/upload', {
                                                                                    method: 'POST',
                                                                                    body: formData
                                                                                })

                                                                                const result = await response.json();
                                                                                if (!response.ok || result.failed) {
                                                                                    console.error(`Error uploading chunk ${chunkIndex}:`, result.failed);
                                                                                    return { error: `Upload failed at chunk ${chunkIndex}` };
                                                                                }

                                                                                uploadedChunks++;
                                                                                progressBar((uploadedChunks / totalChunks) * 100)

                                                                                console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                                                                                setTimeout(async () => {
                                                                                    await comp.refresh();
                                                                                }, 700)

                                                                            } catch (error) {
                                                                                console.error("Upload failed:", error);
                                                                                return { error: "Network or server error during upload" };
                                                                            }
                                                                        }

                                                                    })
                                                                }
                                                            }
                                                        },
                                                    ]
                                                ]
                                            }
                                        }

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
                                                                        [
                                                                            {
                                                                                'component': design_params_panel_layout
                                                                            }
                                                                        ]
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

                                                                                this.__scx_ = x;
                                                                                this.__scy_ = y - 10;
                                                                                let tx = (this.grid.Xwc(this.__scx_ - this.grid.xi * 2))
                                                                                let ty = (this.grid.Ywc(this.__scy_ - this.grid.yi * 2))
                                                                                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                                                const yvalue = this.grid.Ywc(y)
                                                                                const _point = {
                                                                                    x: tx,
                                                                                    y: ty,
                                                                                    startX: tx,
                                                                                    path: path,
                                                                                    name: `${m}`,
                                                                                    color: __color,
                                                                                    filename: name,
                                                                                    type: 'document'
                                                                                }
                                                                                this.scatterData.points.push(_point);
                                                                                pt.setPointSelected(_point)
                                                                                pt.wb(null)
                                                                                CurrentLayout.clearComponent('mainPanel')
                                                                                CurrentLayout.reset('mainPanel');
                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Close', ionFunction: createIonFunction(async () => {
                                                                                hideAllModal();
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
                                    }
                                },
                                mouseDownListener: (x, y) => {

                                    this.__scx_ = x;
                                    this.__scy_ = y - 10;
                                    let tx = (this.grid.Xwc(this.__scx_ - this.grid.xi * 2))
                                    this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)

                                },
                                draw: (grid, ctx) => {
                                    ctx.lineWidth = 2;
                                    ctx.fillStyle = 'black';
                                    ctx.font = '14px Arial';
                                    ctx.textAlign = 'left';

                                    ctx.fillText(this.__date, this.__scx_, this.__scy_)
                                },
                                menuManager: null
                            }
                            pt.wb(lasso)

                        },
                        move: () => {
                        }
                    }
                )

                menuList.push(
                    {
                        label: `Save plot`,
                        __date: '',
                        click: async (scx, scy) => {
                            if (!this.uid) {
                                this.uid = uuid();
                            }
                            let cross_reactive_card = {
                                wid: 'card',
                                data: {
                                    "style.padding-top": '10px',
                                    cards: [
                                        [

                                            {
                                                'width': '90%',
                                                'component': {
                                                    wid: 'html',
                                                    data: `<hr>Cross-reactive options`
                                                }
                                            },
                                            {

                                                'width': '100%',
                                                'component': {
                                                    wid: 'multi-select',
                                                    data: {
                                                        'list': ['Define time range when recreated.', 'Define new name when recreated.'],
                                                        'ionfunction': createIonFunction(async (vlist_selected) => {

                                                            let variants = []
                                                            let keys = Object.keys(vlist_selected[0])
                                                            for (let key of keys) {
                                                                if (vlist_selected[0][key])
                                                                    variants.push(key)
                                                            }
                                                        })
                                                    }
                                                },

                                            },
                                        ]]
                                }
                            }
                            showModal(cross_reactive_card, 400, 200)

                        }
                    })
                menuList.push(
                    {
                        label: `Publish plot`, click: async (x, y) => {
                            let cross_reactive_card = {
                                wid: 'card',
                                data: {
                                    "style.padding-top": '10px',
                                    cards: [
                                        [

                                            {
                                                'width': '90%',
                                                'component': {
                                                    wid: 'html',
                                                    data: `<hr>Configuration: `
                                                }
                                            },
                                            {

                                                'width': '100%',
                                                'component': {
                                                    wid: 'multi-select',
                                                    data: {
                                                        'list': ['Define time range when recreated.', 'Define new name when recreated.'],
                                                        'ionfunction': createIonFunction(async (vlist_selected) => {
                                                            try {
                                                                hideAllModal();
                                                                if (vlist_selected['Define time range when recreated.']) {
                                                                    this.config_script.set_time_on_init = true;
                                                                }
                                                                setTimeout(async () => {
                                                                    await exec('baja/table/io/publish-yakro-plot.js', this, '/')
                                                                }, 500)
                                                            } catch (exception) { }
                                                        })
                                                    }
                                                },
                                            },
                                        ]]
                                }
                            }
                            showModal(cross_reactive_card, 500, 300)

                        }
                    },
                )

                menuList.push(
                    {
                        label: `Open plot`,
                        __date: '',
                        click: async (scx, scy) => {
                            if (!this.uid) {
                                this.uid = uuid();
                            }
                            let v = await exec('baja/table/io/open-yakro-plot.js', this)
                            showModal(v)
                        }
                    })
                menuList.push(
                    {
                        label: `Delete all timeline points`,
                        __date: '',
                        click: async (scx, scy) => {
                            let confirm = await exec('baja/lib/confirm.js', 'Delete all?', async () => {
                                this.scatterData.points = [];
                            })
                            showModal(confirm)
                        }
                    })
                menuList.push(
                    {
                        label: `Link table to point...`,
                        __date: '',

                        click: async (scx, scy) => {

                            let startx = this.grid.xmin;
                            let __point;

                            smenu = null;
                            pt.clearMenu();
                            pt.setMessage(" Click time/date on timeline you want to link table.")
                            let t = {
                                id: 'link-table',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                                smenu: smenu
                            }
                            t.draw = (grid, ctx) => {
                                if (this.__date) {

                                    if (__point && __point.startX !== undefined && x !== undefined) {
                                        const startX = grid.X(__point.startX);
                                        const y = grid.Y(__point.y)
                                        const x = grid.Y(__point.x)
                                        const arrowY = y - 10;
                                        const color = __point.color || 'black';
                                        const arrowSize = 24;
                                        const direction = startX < x ? 1 : -1;

                                        ctx.strokeStyle = color;
                                        ctx.lineWidth = 4.5;
                                        ctx.beginPath();
                                        ctx.moveTo(startX, arrowY);
                                        ctx.lineTo(x - direction * 12, arrowY);
                                        ctx.stroke();

                                        ctx.fillStyle = color;
                                        ctx.beginPath();
                                        ctx.moveTo(x, arrowY);
                                        ctx.lineTo(x - direction * arrowSize, arrowY - 10);
                                        ctx.lineTo(x - direction * arrowSize, arrowY + 10);
                                        ctx.closePath();
                                        ctx.fill();
                                    }
                                    ctx.lineWidth = 2;
                                    ctx.fillStyle = 'black';
                                    ctx.font = '14px Arial';
                                    ctx.textAlign = 'left';
                                    console.log(" scx " + this.__scx_)
                                    ctx.fillText(this.__date, this.__scx_ + 10, this.__scy_)
                                    ctx.fill();
                                }
                            }
                            t.mouseDownListener = (x, y) => {
                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                const yvalue = this.grid.Ywc(y)
                                if (!__point) {
                                    pt.setSelectedListener((uid) => {
                                        if (__point && uid) {
                                            let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                            let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                            this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                            __point.x = tx;
                                            const ref = pt.getPlate(pt.grid.Xwc(x), pt.grid.Ywc(y))
                                            if (ref) {
                                                __point.ref = uid;
                                                __point.drawHighlight = (pt, ctx) => {

                                                    const ob = pt.getPlateWithUID(__point.ref)
                                                    if (ob) {
                                                        if (ob) {
                                                            drawArrowFromPoint(ctx, __point, ob, this.grid, pt, true);
                                                        }
                                                    }

                                                }
                                                this.scatterData.points.push(__point)
                                                pt.clearPlateListeners();
                                            }
                                        }
                                    })

                                    __point = {
                                        x: tx,
                                        bajabio: tx,
                                        y: ty,
                                        startX: tx,
                                        name: 'link',
                                        type: 'link'
                                    }

                                } else {
                                }

                            }
                            t.close = () => {

                            }
                            t.mouseMoveListener = (x, y) => {

                                this.__scx_ = x;

                                this.__scy_ = y;
                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                const yvalue = this.grid.Ywc(y)
                                if (__point)
                                    __point.bjb = tx;
                            }
                            t.mouseUpListener = async (x, y) => {

                            }

                            pt.wb(t)
                        },
                        move: () => {
                        }
                    });

                menuList.push(
                );

                menuList.push(
                    {
                        label: `Paste (label-text|time-duration) Concurrent`,
                        __date: '',
                        click: async (scx, scy) => {
                            let start_date = this.startDate;

                            const vtext = await navigator.clipboard.readText();
                            function parseDurationToMilliseconds(durationStr) {
                                const regexes = [
                                    { regex: /(\d+)[–-](\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*months?/i, multiplier: 'months' },
                                    { regex: /(\d+)[–-](\d+)\s*quarters?/i, multiplier: 'quarters' },
                                    { regex: /(\d+)[–-](\d+)\s*years?/i, multiplier: 'years' },
                                    { regex: /(\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                                    { regex: /(\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                                    { regex: /(\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)\s*months?/i, multiplier: 'months' },
                                    { regex: /(\d+)\s*quarters?/i, multiplier: 'quarters' },
                                    { regex: /(\d+)\s*years?/i, multiplier: 'years' },
                                ];

                                for (const { regex, multiplier } of regexes) {
                                    const match = durationStr.match(regex);
                                    if (match) {
                                        const value = match[2] ? parseInt(match[2]) : parseInt(match[1]);
                                        if (typeof multiplier === 'number') {
                                            return { milliseconds: value * multiplier };
                                        } else {
                                            return { amount: value, unit: multiplier };
                                        }
                                    }
                                }

                                return { milliseconds: 0 };
                            }

                            function addDuration(date, duration) {
                                const result = new Date(date);

                                if (typeof duration === 'number') {
                                    result.setTime(result.getTime() + duration);
                                    return result;
                                }

                                if (duration && typeof duration === 'object') {
                                    if ('milliseconds' in duration && typeof duration.milliseconds === 'number') {
                                        result.setTime(result.getTime() + duration.milliseconds);
                                        return result;
                                    }

                                    const { amount, unit } = duration;
                                    if (typeof amount === 'number') {
                                        switch (unit) {
                                            case 'months':
                                                result.setMonth(result.getMonth() + amount);
                                                break;
                                            case 'quarters':
                                                result.setMonth(result.getMonth() + 3 * amount);
                                                break;
                                            case 'years':
                                                result.setFullYear(result.getFullYear() + amount);
                                                break;
                                            default:

                                                result.setTime(result.getTime() + amount);
                                                break;
                                        }
                                        return result;
                                    }
                                }

                                return result;
                            }
                            function convertToMillisecondsUsingUnit(baseDate, amount, unit) {
                                const start = new Date(baseDate);
                                const end = new Date(start);

                                switch (unit) {
                                    case 'months':
                                        end.setMonth(start.getMonth() + amount);
                                        break;
                                    case 'quarters':
                                        end.setMonth(start.getMonth() + amount * 3);
                                        break;
                                    case 'years':
                                        end.setFullYear(start.getFullYear() + amount);
                                        break;
                                    default:
                                        return 0;
                                }

                                return end.getTime() - start.getTime();
                            }
                            function replaceRangeWithMax(input) {
                                return input.replace(/(\d+)[–-](\d+)/g, (_, start, end) => {
                                    return Math.max(parseInt(start), parseInt(end));
                                });
                            }

                            function generateTimeline(startDateStr, tasks) {
                                const baseDate = new Date(startDateStr);
                                const timeline = [];

                                for (const [comment, durationStr] of tasks) {

                                    console.log(`Duration for "${durationStr}": `);
                                    let dstri = replaceRangeWithMax(durationStr)
                                    let duration = parseDurationToMilliseconds(dstri);

                                    const start = new Date(baseDate);
                                    if (duration.milliseconds) {
                                        duration = duration.milliseconds
                                    }

                                    const durationInDays = duration / (1000 * 60 * 60 * 24);
                                    console.log(`Duration for "${comment}": ${durationInDays.toFixed(2)} days`);
                                    const end = addDuration(start, duration);
                                    timeline.push({
                                        comment,
                                        start: start.toISOString(),
                                        end: end.toISOString()
                                    });
                                }

                                return timeline;
                            }

                            function convertTextToArray(text) {
                                const lines = text.trim().split('\n');
                                const result = lines.map(line => {
                                    const parts = line.split('\t');
                                    if (parts.length === 2) {
                                        return [parts[0].trim(), parts[1].trim()];
                                    } else {
                                        const lastSpaceIndex = line.lastIndexOf(' ');
                                        const description = line.slice(0, lastSpaceIndex).trim();
                                        const duration = line.slice(lastSpaceIndex + 1).trim();
                                        return [description, duration];
                                    }
                                });
                                return result;
                            }

                            function dateFromX(x, xMin, xMax, start, end) {
                                const totalCanvasRange = xMax - xMin;
                                const totalTimeRange = end.getTime() - start.getTime();
                                const normalizedX = (x - xMin) / totalCanvasRange;
                                const date = new Date(start.getTime() + normalizedX * totalTimeRange);
                                return date;
                            }
                            function getXFromDate(date, xMin, xMax, start, end) {
                                const totalCanvasRange = xMax - xMin;
                                const totalTimeRange = end.getTime() - start.getTime();
                                const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

                                const normalizedTime = timeSinceStart / totalTimeRange;
                                return xMin + normalizedTime * totalCanvasRange;
                            }

                            function convertToTimelinePoints(events, xMin, xMax, startDate, endDate, currentY) {
                                if (events.length === 0) return [];
                                const globalStart = startDate;
                                const globalEnd = endDate;

                                const yStep = 0.1;

                                return events.map((event, index) => {
                                    const startDate = new Date(event.start);
                                    const endDate = new Date(event.end);

                                    const point = {
                                        x: getXFromDate(endDate, xMin, xMax, globalStart, globalEnd),
                                        y: currentY,
                                        type: 'interval',
                                        startX: getXFromDate(startDate, xMin, xMax, globalStart, globalEnd),
                                        name: event.comment,
                                        color: 'black'
                                    };

                                    currentY += yStep;
                                    return point;
                                });
                            }

                            let interaction_user = {
                                id: 'plot-export-menu',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                                smenu: smenu
                            }
                            interaction_user.draw = (grid, ctx) => {
                            }
                            interaction_user.mouseDownListener = (x, y) => {
                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                const starting_date = dateFromX(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                const yvalue = this.grid.Ywc(y)
                                let t = convertTextToArray(vtext)
                                let events = generateTimeline(starting_date, t)
                                const timelinePoints = convertToTimelinePoints(events, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate, ty);
                                for (let t of timelinePoints)
                                    this.scatterData.points.push(t)
                            }
                            interaction_user.close = () => {
                                smenu = null;
                                this.clk_drag(pt)

                            }
                            interaction_user.mouseMoveListener = (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                pt.grid.rescale();
                                this.grid.rescale();
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    smenu.mouseMove(pt.grid, mmx, mmy)
                                }
                            }
                            interaction_user.mouseUpListener = async (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    await smenu.mouseUp(pt.grid, mmx, mmy)
                                }
                                pt.wb(null)
                            }
                            pt.wb(interaction_user)

                        },
                        move: () => {
                        }
                    });

                const m1 = [
                    {
                        label: this.maximize ? 'Zoom out' : 'Zoom in',
                        __date: '',
                        click: async (scx, scy) => {

                            if (this.maximize) {

                                if (this.type === 'timeline') {
                                    await pt.zoomoutofplot(this)
                                } else {
                                    await pt.zoomoutofplot(this)
                                }
                            } else {

                                if (this.type === 'timeline') {
                                    await pt.zoomintotimeline(this)
                                } else {
                                    await pt.zoomintoplot(this)
                                }
                            }
                            this.maximize = !this.maximize

                        }
                    },
                    {
                        label: `Data...`,
                        __date: '',
                        click: async (scx, scy) => {
                            const m1_sub = [
                                {
                                    label: `Life expectancy`,
                                    __date: '',
                                    click: async (scx, scy) => {

                                        let start_date = formatTime(this.grid.xmin, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                        let end_date = formatTime(this.grid.xmax, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)

                                        let sequenceTextEditor;
                                        let descHook = createIonFunction((p) => {
                                            sequenceTextEditor = p;
                                        });

                                        let pointColor = 'red'

                                        const txt = `
                                                 `;
                                        let initalText = true;
                                        let i = 0;

                                        let sequence_input = {
                                            wid: 'card',
                                            "height": "500px",
                                            data: {
                                                "style.padding-top": '1px',
                                                "style.padding-bottom": '10px',
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

                                                   Write a description of the life expectancy context you want to capture ( ${start_date} - ${end_date} ) for example do you want to show the life expectancy every 10 years?:
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
                                                            'height': "100px",
                                                            "style.padding-top": '4px',
                                                            "style.border": '1px',
                                                            'component':
                                                            {
                                                                'wid': 'color-chooser',
                                                                'width': '100%',

                                                                "data": {
                                                                    "selectionListener": createIonFunction((_color) => {
                                                                        if (typeof _color === 'string') {
                                                                            if (_color.startsWith('#')) {
                                                                                point = _color
                                                                            }
                                                                        } else {
                                                                            point = `rgba(${_color["rgb"]['r']},${_color['rgb']['g']},${_color['rgb']['b']},${_color['rgb']['a']})`
                                                                        }

                                                                    })
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

                                                                                pushHistory(HM(pt))

                                                                                pt.setMessage("AI mode...", 5)
                                                                                hideAllModal();
                                                                                CurrentLayout.reset('mainPanel')
                                                                                let interval = null;
                                                                                let em = new EngineMonitor((msg) => {
                                                                                    pt.updateSprite(msg)
                                                                                });
                                                                                em.addProgressListener(async (v) => {
                                                                                    if (v >= 100) {
                                                                                    }
                                                                                })
                                                                                let content = sequenceTextEditor.getContent();
                                                                                pt.setMessage("Building model", 5)
                                                                                let model = await exec('py/openai/milestones-date-constrained-public-health.py', em, content, start_date.toISOString(), end_date.toISOString())
                                                                                for (let v of model.milestones) {
                                                                                    v.color = pointColor
                                                                                    this.scatterData.points.push(v)
                                                                                }
                                                                                showModal({
                                                                                    wid: 'json',
                                                                                    data: JSON.stringify(model)
                                                                                })
                                                                                pt.killSprite();

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
                                }]
                            pt.setMenu(m1_sub)

                        },
                        move: () => {
                        }
                    },

                    {
                        label: `Goto time`,
                        __date: '',
                        click: async (scx, scy) => {

                            const getMenuItems = (__startDate, __endDate, grid, pt) => {
                                const hourToMs = 3600 * 1000;
                                const now = new Date();
                                const nowMs = now.getTime();
                                const startMs = __startDate.getTime();
                                const endMs = __endDate.getTime();
                                const totalHours = (endMs - startMs) / hourToMs;

                                const items = [];

                                const addItem = (label, start_date, end_date) => {
                                    items.push({
                                        label,
                                        __date: '',
                                        click: async () => {

                                            const xstart = timeToX(
                                                start_date,
                                                (this.grid.xmin),
                                                (this.grid.xmax),
                                                this.startDate,
                                                this.endDate
                                            );
                                            const xend = timeToX(
                                                end_date,
                                                (this.grid.xmin),
                                                (this.grid.xmax),
                                                this.startDate,
                                                this.endDate
                                            );

                                            const xstartsc = this.grid.X(xstart)
                                            const xendsc = this.grid.X(xend)
                                            const screen_xm = pt.grid.Xwc(xstartsc - 100);
                                            const screen_xp = pt.grid.Xwc(xendsc + 100);
                                            const screen_y = pt.grid.Ywc(grid.Y(0));
                                            const screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                                            const width = Math.abs(screen_xm - screen_xp);
                                            const height = screen_ptheight;

                                            await pt.zoomto(screen_xm, this.grid.Y(0), this.grid.height, width);

                                            CurrentLayout.reset('mainPanel');
                                        },
                                        move: () => { }
                                    });
                                };

                                const getMonthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);

                                const getMonthEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

                                const getYearStart = (d) => new Date(d.getFullYear(), 0, 1);

                                const getDayEnd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
                                const getDayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

                                const getHourEnd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 59, 59, 999);
                                const getHourStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);

                                const getYearEnd = (d) => new Date(d.getFullYear(), 11, 31, 23, 59, 59);

                                const getWeekStart = (d) => {
                                    const copy = new Date(d);
                                    const day = copy.getDay();
                                    copy.setDate(copy.getDate() - day);
                                    copy.setHours(0, 0, 0, 0);
                                    return copy;
                                };

                                const getWeekEnd = (d) => {
                                    const start = getWeekStart(d);
                                    const end = new Date(start);
                                    end.setDate(end.getDate() + 6);
                                    end.setHours(23, 59, 59, 999);
                                    return end;
                                };

                                const startDate = this.startDate;
                                const endDate = this.endDate;

                                addItem("Current Hour", getHourStart(now), getHourEnd(now));

                                addItem("Current Day", getDayStart(now), getDayEnd(now));

                                addItem("Current Month", getMonthStart(now), getMonthEnd(now));

                                addItem("Current Year", getYearStart(now), getYearEnd(now));

                                addItem("First Week", getWeekStart(startDate), getWeekEnd(startDate));

                                addItem("First Month", getMonthStart(startDate), getMonthEnd(startDate));

                                addItem("First Year", getYearStart(startDate), getYearEnd(startDate));

                                addItem("Last Week", getWeekStart(endDate), getWeekEnd(endDate));

                                addItem("Last Month", getMonthStart(endDate), getMonthEnd(endDate));

                                addItem("Last Year", getYearStart(endDate), getYearEnd(endDate));
                                return items;
                            }
                            let menu = getMenuItems(this.startDate, this.endDate, this.grid, pt);

                            const graph = CurrentLayout.getStashed('graph')
                            if (graph) {
                                graph.showWindowMenu(menu, 10, 10, 400)
                            }

                        },
                        move: () => {
                        }
                    },

                    {
                        label: `Export...`,
                        __date: '',
                        click: async (scx, scy) => {

                            const getMenuItems = () => {
                                const items = [];

                                const addItem = (label, clk) => {
                                    items.push({
                                        label,
                                        click: async () => {
                                            clk()
                                        },
                                        move: () => { }
                                    });
                                };
                                addItem("Export to Gannt", () => {
                                    this.exportTimelinesToGantt({
                                        format: "csv",
                                        dateOut: "date",
                                        taskKey: "label",
                                        filename: 'download.csv'
                                    }
                                    )
                                });
                                return items;
                            }
                            let menu = getMenuItems();
                            const graph = CurrentLayout.getStashed('graph')
                            if (graph) {
                                graph.showWindowMenu(menu, 10, 10, 400)
                            }
                        },
                        move: () => {
                        }
                    },

                    {

                        label: `Add Pts`,
                        __date: '',
                        click: async (scx, scy) => {

                            let submenu = [
                                {
                                    label: `Milestone`,
                                    __date: '',
                                    click: async (scx, scy) => {
                                        let lasso = {
                                            id: 'point-add-to-timeline',
                                            priority: true,
                                            mouseMoveListener: (x, y) => {
                                                scx_ = x;
                                                scy_ = y - 10;
                                                this.grid.rescale();

                                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                this.__scx_ = x;
                                                this.__scy_ = y;

                                                this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                            },
                                            mouseUpListener: async (x, y) => {
                                                let va = await prompt("(Optional)", ["Text", "URL or Teams ID"], { "Text": '' }, 300, 450)
                                                let m = va['Text']
                                                let url = va['URL or Teams ID']
                                                if (m != null) {
                                                    let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                    let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                                    this.__scx_ = x;
                                                    this.__scy_ = y;
                                                    this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                    const yvalue = this.grid.Ywc(y)
                                                    const _point = {
                                                        x: tx,
                                                        y: ty,
                                                        type: 'milestone',
                                                        name: `${m}`,
                                                        color: 'red',
                                                    };

                                                    if (isTeamsMeetingId(url)) {
                                                        url = constructTeamsMeetingUrl(url)
                                                    }

                                                    if (isYouTubeVideo(url) || isTeamsMeetingUrl(url)) {
                                                        _point.videoURL = url;
                                                        _point.iconSize = this.grid.worldWidth(30)

                                                    } else if (url) {
                                                        _point.url = url;
                                                    }
                                                    this.scatterData.points.push(_point);
                                                    pt.wb(null)

                                                } else {
                                                }
                                            },
                                            mouseDownListener: (x, y) => {
                                            },
                                            draw: (grid, ctx) => {
                                                ctx.save();

                                                ctx.font = '14px Arial';
                                                ctx.textAlign = 'left';
                                                ctx.textBaseline = 'top';

                                                const dateObj = new Date(this.__date);
                                                const localDateText = dateObj.toLocaleDateString();

                                                const rounded = new Date(Math.floor(dateObj.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000));
                                                const localTimeText = rounded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                                const offsetX = 10;
                                                const offsetY = -10;

                                                const baseX = this.__scx_ + offsetX;
                                                const baseY = this.__scy_ + offsetY;

                                                ctx.strokeStyle = 'white';
                                                ctx.lineWidth = 3;

                                                ctx.strokeText(localDateText, baseX, baseY);
                                                ctx.fillStyle = 'black';
                                                ctx.fillText(localDateText, baseX, baseY);

                                                const lineHeight = 16;
                                                ctx.strokeText(localTimeText, baseX, baseY + lineHeight);
                                                ctx.fillText(localTimeText, baseX, baseY + lineHeight);

                                                ctx.restore();

                                            },
                                            menuManager: null
                                        }
                                        setTimeout(() => {
                                            pt.wb(lasso)

                                        }, 1000)

                                    },
                                    move: () => {
                                    }
                                },

                                {
                                    label: `(PDF) Point`,
                                    __date: '',
                                    click: async (scx, scy) => {
                                        let lasso = {
                                            id: 'point-add-to-timeline',
                                            priority: true,
                                            mouseMoveListener: (x, y) => {
                                                scx_ = x;
                                                scy_ = y - 10;
                                                this.grid.rescale();

                                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                this.__scx_ = x;
                                                this.__scy_ = y;

                                                this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                            },
                                            mouseUpListener: async (x, y) => {
                                                let va = await prompt("Name", ["Name"], { "Name": '' }, 300, 300)
                                                let m = va['Name']
                                                if (m != null) {
                                                    let __color = 'rgba(0, 87, 163, 0.5)'
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
                                                                        'component': w
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
                                                                                        console.error("No file selected for upload.");
                                                                                        return { error: "No file selected" };
                                                                                    }
                                                                                    const user = getUser();
                                                                                    const type = "data";
                                                                                    const chunkSize = 5 * 1024 * 1024;
                                                                                    const totalChunks = Math.ceil(file.size / chunkSize);
                                                                                    let uploadedChunks = 0;

                                                                                    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                                                                                        const start = chunkIndex * chunkSize;
                                                                                        const end = Math.min(start + chunkSize, file.size);
                                                                                        const chunk = file.slice(start, end);

                                                                                        const formData = new FormData();
                                                                                        formData.append("user", user);
                                                                                        formData.append("type", type);
                                                                                        formData.append("file", chunk, file.name);
                                                                                        if (path) {
                                                                                            formData.append("path", path);
                                                                                        }
                                                                                        try {

                                                                                            let host_ = window['env']['apiUrl']
                                                                                            const response = await fetch(host_ + '/upload', {
                                                                                                method: 'POST',
                                                                                                body: formData
                                                                                            })

                                                                                            const result = await response.json();
                                                                                            if (!response.ok || result.failed) {
                                                                                                console.error(`Error uploading chunk ${chunkIndex}:`, result.failed);
                                                                                                return { error: `Upload failed at chunk ${chunkIndex}` };
                                                                                            }

                                                                                            uploadedChunks++;
                                                                                            progressBar((uploadedChunks / totalChunks) * 100)

                                                                                            console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                                                                                            setTimeout(async () => {
                                                                                                await comp.refresh();
                                                                                            }, 700)

                                                                                        } catch (error) {
                                                                                            console.error("Upload failed:", error);
                                                                                            return { error: "Network or server error during upload" };
                                                                                        }
                                                                                    }

                                                                                })
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
                                                                                root: getUser(),
                                                                                "ionfunction.fileClick": createIonFunction(async (element) => {
                                                                                    path = element.path;
                                                                                    name = element.name;
                                                                                    infoPrompt(" " + name + " selected.")
                                                                                }),
                                                                                "ionfunction.openfile": createIonFunction(async (file, text) => {

                                                                                }
                                                                                ),
                                                                                "ionfunction.path": createIonFunction(async (_path, nodes) => {
                                                                                    path = _path;

                                                                                })
                                                                            }
                                                                        }
                                                                    },

                                                                ]
                                                            ]
                                                        }
                                                    }

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
                                                                                    [
                                                                                        {
                                                                                            'component': design_params_panel_layout
                                                                                        }
                                                                                    ]
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

                                                                                            this.__scx_ = x;
                                                                                            this.__scy_ = y - 10;
                                                                                            let tx = (this.grid.Xwc(this.__scx_ - this.grid.xi * 2))
                                                                                            let ty = (this.grid.Ywc(this.__scy_ - this.grid.yi * 2))
                                                                                            this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                                                            const yvalue = this.grid.Ywc(y)
                                                                                            const _point = {
                                                                                                x: tx,
                                                                                                y: ty,
                                                                                                startX: tx,
                                                                                                path: path,
                                                                                                name: `${m}`,
                                                                                                color: __color,
                                                                                                filename: name,
                                                                                                type: 'document'
                                                                                            }
                                                                                            this.scatterData.points.push(_point);
                                                                                            pt.setPointSelected(_point)
                                                                                            pt.wb(null)
                                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                                            CurrentLayout.reset('mainPanel');
                                                                                        })
                                                                                    },
                                                                                    {
                                                                                        label: 'Close', ionFunction: createIonFunction(async () => {
                                                                                            hideAllModal();
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
                                                }
                                            },
                                            mouseDownListener: (x, y) => {
                                            },
                                            draw: (grid, ctx) => {
                                                ctx.save();

                                                ctx.font = '14px Arial';
                                                ctx.textAlign = 'left';
                                                ctx.textBaseline = 'top';

                                                const dateObj = new Date(this.__date);
                                                const localDateText = dateObj.toLocaleDateString();

                                                const rounded = new Date(Math.floor(dateObj.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000));
                                                const localTimeText = rounded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                                                const offsetX = 10;
                                                const offsetY = -10;

                                                const baseX = this.__scx_ + offsetX;
                                                const baseY = this.__scy_ + offsetY;

                                                ctx.strokeStyle = 'white';
                                                ctx.lineWidth = 3;

                                                ctx.strokeText(localDateText, baseX, baseY);
                                                ctx.fillStyle = 'black';
                                                ctx.fillText(localDateText, baseX, baseY);

                                                const lineHeight = 16;
                                                ctx.strokeText(localTimeText, baseX, baseY + lineHeight);
                                                ctx.fillText(localTimeText, baseX, baseY + lineHeight);

                                                ctx.restore();

                                            },
                                            menuManager: null
                                        }
                                        pt.wb(lasso)

                                    },
                                    move: () => {
                                    }
                                },
                                {
                                    label: `Interval`,
                                    __date: '',
                                    click: async (scx, scy) => {

                                        let yyi = 0;

                                        pt.setMessage(" Click start.")
                                        let arr = null;
                                        let isDrawing = false;
                                        let md = false;

                                        const Arrow = await exec('flexigraph/shapes/arrow');
                                        let lasso = {
                                            id: 'point-add-to-timeline' + Math.random,
                                            mouseMoveListener: (x, y) => {

                                                scx_ = x;
                                                scy_ = y - 10;
                                                this.grid.rescale();

                                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                this.__scx_ = x;
                                                this.__scy_ = y;

                                                this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                if (arr) {
                                                    const xxi = this.grid.Xwc(x - this.grid.xi * 2);
                                                    arr.xf = xxi;
                                                    arr.yf = arr.y;
                                                }

                                            },

                                            mouseUpListener: async (x, y) => {
                                                if (isDrawing) {
                                                    const start = formatTimeLabel(
                                                        arr.x,
                                                        this.grid.xmin,
                                                        this.grid.xmax,
                                                        this.startDate,
                                                        this.endDate
                                                    );

                                                    const end = formatTimeLabel(
                                                        arr.xf,
                                                        this.grid.xmin,
                                                        this.grid.xmax,
                                                        this.startDate,
                                                        this.endDate
                                                    );

                                                    let va = await prompt("(Optional)", ["Comment", "URL or Teams ID"], { "Comment": '' }, 300, 420)
                                                    let m = va['Comment']
                                                    let url = va['URL or Teams ID']

                                                    let _name = `${start} - ${end}`;
                                                    if (m && m.length > 0) {
                                                        _name = m;
                                                    }
                                                    const ysc = y;

                                                    const point = {
                                                        x: arr.xf,
                                                        y: yyi,
                                                        type: 'interval',
                                                        startX: arr.x,
                                                        name: _name,
                                                        color: 'black',
                                                    }

                                                    let iconn = await getLJIcon(point.name)
                                                    if (iconn) {
                                                        point.img = null;
                                                        point.icon = iconn;
                                                    }

                                                    if (isTeamsMeetingId(url)) {
                                                        url = constructTeamsMeetingUrl(url)
                                                    }

                                                    if (isYouTubeVideo(url) || isTeamsMeetingUrl(url)) {
                                                        point.iconSize = this.grid.worldWidth(30)
                                                        point.videoURL = url;
                                                    }
                                                    this.scatterData.points.push(point);
                                                    arr = null;
                                                    if (pt) {
                                                        pt.wb(null)
                                                    }

                                                    isDrawing = false;
                                                    pt.wb(null)
                                                }
                                                md = false;

                                            },
                                            mouseDownListener: async (x, y) => {

                                                md = true;
                                                isDrawing = true;
                                                const xxi = this.grid.Xwc((x - 2 * this.grid.xi));
                                                yyi = this.grid.Ywc((y - this.grid.yi * 2));
                                                arr = new Arrow(xxi, yyi, xxi, yyi, 'black');

                                            },
                                            draw: (_____grid, ctx) => {
                                                const grid = this.grid;

                                                const drawArrow = (ctx, x1, y1, x2, y2) => {
                                                    const headLen = 12;
                                                    const angle = Math.atan2(y2 - y1, x2 - x1);

                                                    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
                                                    grad.addColorStop(0, '#4F46E5');
                                                    grad.addColorStop(1, '#22D3EE');

                                                    ctx.save();
                                                    ctx.lineWidth = 5;
                                                    ctx.lineCap = 'round';
                                                    ctx.strokeStyle = grad;

                                                    ctx.shadowColor = 'rgba(79,70,229,0.6)';
                                                    ctx.shadowBlur = 12;
                                                    ctx.shadowOffsetX = 0;
                                                    ctx.shadowOffsetY = 0;

                                                    ctx.beginPath();
                                                    ctx.moveTo(x1, y1);
                                                    ctx.lineTo(x2, y2);
                                                    ctx.stroke();

                                                    ctx.beginPath();
                                                    ctx.moveTo(x2, y2);
                                                    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
                                                    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
                                                    ctx.closePath();
                                                    ctx.fillStyle = grad;
                                                    ctx.fill();

                                                    ctx.restore();
                                                };

                                                const drawPill = (ctx, cx, cy, text, opts = {}) => {
                                                    const {
                                                        paddingX = 10,
                                                        paddingY = 6,
                                                        font = '13px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial',
                                                        fill = '#FFFFFF',
                                                        stroke = '#111827',
                                                        textFill = '#111827',
                                                        shadow = 'rgba(0,0,0,0.25)',
                                                        strokeWidth = 1
                                                    } = opts;

                                                    ctx.save();
                                                    ctx.font = font;
                                                    ctx.textAlign = 'center';
                                                    ctx.textBaseline = 'middle';

                                                    const textWidth = ctx.measureText(text).width;
                                                    const w = textWidth + 2 * paddingX;
                                                    const h = 14 + 2 * paddingY;

                                                    ctx.shadowColor = shadow;
                                                    ctx.shadowBlur = 8;
                                                    ctx.shadowOffsetX = 0;
                                                    ctx.shadowOffsetY = 2;

                                                    ctx.beginPath();
                                                    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
                                                    ctx.fillStyle = fill;
                                                    ctx.fill();

                                                    ctx.shadowColor = 'transparent';
                                                    if (strokeWidth > 0) {
                                                        ctx.lineWidth = strokeWidth;
                                                        ctx.strokeStyle = stroke;
                                                        ctx.stroke();
                                                    }

                                                    ctx.fillStyle = textFill;
                                                    ctx.fillText(text, cx, cy);
                                                    ctx.restore();
                                                };

                                                const abbrTime = (d) => {

                                                    let h = d.getHours();
                                                    const m = d.getMinutes();
                                                    const suffix = h >= 12 ? 'p' : 'a';
                                                    h = h % 12 || 12;
                                                    const mm = m === 0 ? '' : ':' + String(m).padStart(2, '0');
                                                    return `${h}${mm}${suffix}`;
                                                };

                                                ctx.save();
                                                ctx.lineWidth = 2;
                                                ctx.fillStyle = '#111827';
                                                ctx.font = '14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
                                                ctx.textAlign = 'left';
                                                if (arr) {

                                                    const x = grid.X(arr.x);
                                                    const xf = grid.X(arr.xf);
                                                    const y = grid.Y(arr.y);

                                                    drawArrow(ctx, x, y, xf, y);

                                                    {
                                                        const totalCanvasRange = grid.xmax - grid.xmin;
                                                        const totalTimeRange = this.endDate.getTime() - this.startDate.getTime();

                                                        const normalizedStart = (arr.x - grid.xmin) / totalCanvasRange;
                                                        const normalizedEnd = (arr.xf - grid.xmin) / totalCanvasRange;

                                                        const startTimestamp = this.startDate.getTime() + normalizedStart * totalTimeRange;
                                                        const endTimestamp = this.startDate.getTime() + normalizedEnd * totalTimeRange;

                                                        const diffMs = endTimestamp - startTimestamp;
                                                        const diffMinutesTotal = diffMs / (1000 * 60);
                                                        const diffHoursTotal = diffMinutesTotal / 60;
                                                        const diffDaysTotal = diffHoursTotal / 24;
                                                        const diffWeeksTotal = diffDaysTotal / 7;

                                                        let intervalLabel = '';
                                                        if (diffWeeksTotal >= 1) {
                                                            const weeks = Math.floor(diffWeeksTotal);
                                                            const days = Math.round((diffWeeksTotal - weeks) * 7);
                                                            intervalLabel = `${weeks} wk${weeks !== 1 ? 's' : ''}` + (days > 0 ? ` ${days} d` : '');
                                                        } else if (diffDaysTotal >= 1) {
                                                            const days = Math.floor(diffDaysTotal);
                                                            const hours = Math.round((diffDaysTotal - days) * 24);
                                                            intervalLabel = `${days} d${days !== 1 ? 's' : ''}` + (hours > 0 ? ` ${hours} h` : '');
                                                        } else if (diffHoursTotal >= 1) {
                                                            const hours = Math.floor(diffHoursTotal);
                                                            const minutes = Math.round((diffHoursTotal - hours) * 60);
                                                            intervalLabel = `${hours} h` + (minutes > 0 ? ` ${minutes} min` : '');
                                                        } else {
                                                            const minutes = Math.max(1, Math.round(diffMinutesTotal));
                                                            intervalLabel = `${minutes} min`;
                                                        }

                                                        const midX = (x + xf) / 2;
                                                        drawPill(ctx, midX, y - 46, intervalLabel, {
                                                            fill: 'rgba(17,24,39,0.85)',
                                                            stroke: '#111827',
                                                            textFill: '#FFFFFF',
                                                            shadow: 'rgba(0,0,0,0.25)',
                                                            paddingX: 10,
                                                            paddingY: 6
                                                        });
                                                    }
                                                }

                                                ctx.save();
                                                ctx.font = '14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
                                                ctx.textAlign = 'left';
                                                ctx.textBaseline = 'top';

                                                const dateObj = new Date(this.__date);
                                                const localDateText = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

                                                const rounded = new Date(Math.floor(dateObj.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000));
                                                const localTimeText = abbrTime(rounded);

                                                const offsetX = 10;
                                                const offsetY = -10;
                                                const baseX = this.__scx_ + offsetX;
                                                const baseY = this.__scy_ + offsetY;

                                                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                                                ctx.lineWidth = 3;

                                                ctx.strokeText(localDateText, baseX, baseY);
                                                ctx.fillStyle = '#111827';
                                                ctx.fillText(localDateText, baseX, baseY);

                                                const lineHeight = 16;
                                                ctx.strokeText(localTimeText, baseX, baseY + lineHeight);
                                                ctx.fillText(localTimeText, baseX, baseY + lineHeight);

                                                ctx.restore();
                                                ctx.restore();
                                            }
                                            ,
                                            menuManager: null
                                        }
                                        pt.wb(lasso)

                                    },
                                    move: () => {
                                    }
                                }
                            ]
                            pt.setMenu(submenu)

                        }

                    },

                    {
                        label: `(x+y) Arrow `,
                        __date: '',
                        click: async (scx, scy) => {

                            let yyi = 0;

                            pt.setMessage(" Click start.")
                            let arr = null;
                            let isDrawing = false;
                            let md = false;

                            const Arrow = await exec('flexigraph/shapes/arrow');
                            let lasso = {
                                id: 'point-add-xy2d-' + Math.random(),
                                mouseMoveListener: (x, y) => {
                                    scx_ = x;
                                    scy_ = y - 10;
                                    this.grid.rescale();

                                    const tx = this.grid.Xwc(x - this.grid.xi * 2);
                                    this.__scx_ = x;
                                    this.__scy_ = y;
                                    this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);

                                    if (arr) {
                                        const xxi = this.grid.Xwc(x - this.grid.xi * 2);
                                        const yyi_now = this.grid.Ywc(y - this.grid.yi * 2);
                                        arr.xf = xxi;
                                        arr.yf = yyi_now;
                                    }
                                },

                                mouseUpListener: async (x, y) => {
                                    if (isDrawing) {
                                        const start = formatTimeLabel(
                                            arr.x,
                                            this.grid.xmin,
                                            this.grid.xmax,
                                            this.startDate,
                                            this.endDate
                                        );

                                        const end = formatTimeLabel(
                                            arr.xf,
                                            this.grid.xmin,
                                            this.grid.xmax,
                                            this.startDate,
                                            this.endDate
                                        );

                                        let va = await prompt("(Optional)", ["Comment", "URL or Teams ID"], { "Comment": '' }, 300, 420);
                                        if (!va) {
                                            pt.wb(null)
                                            return;
                                        }
                                        let m = va['Comment'];
                                        let url = va['URL or Teams ID'];

                                        let _name = `${start} - ${end}`;
                                        if (m && m.length > 0) _name = m;

                                        const point = {
                                            x: arr.xf,
                                            y: arr.yf,
                                            type: 'lanechange',
                                            themeKey: laneChangeThemes.ocean,
                                            startX: arr.x,
                                            startY: arr.y,
                                            name: _name,
                                            color: 'black',
                                            name: m,
                                            txt: m
                                        };

                                        let iconn = await getLJIcon(point.name);
                                        if (iconn) {
                                            point.img = null;
                                            point.icon = iconn;
                                        }

                                        if (isTeamsMeetingId(url)) url = constructTeamsMeetingUrl(url);
                                        if (isYouTubeVideo(url) || isTeamsMeetingUrl(url)) {
                                            point.iconSize = this.grid.worldWidth(30);
                                            point.videoURL = url;
                                        }

                                        pushHistory(HM(this))

                                        this.scatterData.points.push(point);
                                        arr = null;
                                        if (pt) pt.wb(null);

                                        isDrawing = false;
                                        pt.wb(null);
                                    }
                                    md = false;
                                },

                                mouseDownListener: async (x, y) => {
                                    md = true;
                                    isDrawing = true;

                                    const xxi = this.grid.Xwc(x - 2 * this.grid.xi);
                                    const yyi0 = this.grid.Ywc(y - this.grid.yi * 2);

                                    arr = new Arrow(xxi, yyi0, xxi, yyi0, 'black');
                                },

                                draw: (_____grid, ctx) => {
                                    const grid = this.grid;

                                    const drawArrow = (ctx, x1, y1, x2, y2) => {
                                        const headLen = 12;
                                        const angle = Math.atan2(y2 - y1, x2 - x1);

                                        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
                                        grad.addColorStop(0, '#4F46E5');
                                        grad.addColorStop(1, '#22D3EE');

                                        ctx.save();
                                        ctx.lineWidth = 5;
                                        ctx.lineCap = 'round';
                                        ctx.strokeStyle = grad;

                                        ctx.shadowColor = 'rgba(79,70,229,0.6)';
                                        ctx.shadowBlur = 12;
                                        ctx.shadowOffsetX = 0;
                                        ctx.shadowOffsetY = 0;

                                        ctx.beginPath();
                                        ctx.moveTo(x1, y1);
                                        ctx.lineTo(x2, y2);
                                        ctx.stroke();

                                        ctx.beginPath();
                                        ctx.moveTo(x2, y2);
                                        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
                                        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
                                        ctx.closePath();
                                        ctx.fillStyle = grad;
                                        ctx.fill();

                                        ctx.restore();
                                    };

                                    const drawPill = (ctx, cx, cy, text, opts = {}) => {
                                        const {
                                            paddingX = 10,
                                            paddingY = 6,

                                            font = '9px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial',
                                            fill = '#FFFFFF',
                                            stroke = '#111827',
                                            textFill = '#111827',
                                            shadow = 'rgba(0,0,0,0.25)',
                                            strokeWidth = 1
                                        } = opts;

                                        ctx.save();
                                        ctx.font = font;
                                        ctx.textAlign = 'center';
                                        ctx.textBaseline = 'middle';

                                        const textWidth = ctx.measureText(text).width;
                                        const approxTextH = 9 + 2;
                                        const w = textWidth + 2 * paddingX;
                                        const h = approxTextH + 2 * paddingY;

                                        ctx.shadowColor = shadow;
                                        ctx.shadowBlur = 8;
                                        ctx.shadowOffsetX = 0;
                                        ctx.shadowOffsetY = 2;

                                        ctx.beginPath();
                                        ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
                                        ctx.fillStyle = fill;
                                        ctx.fill();

                                        ctx.shadowColor = 'transparent';
                                        if (strokeWidth > 0) {
                                            ctx.lineWidth = strokeWidth;
                                            ctx.strokeStyle = stroke;
                                            ctx.stroke();
                                        }

                                        ctx.fillStyle = textFill;
                                        ctx.fillText(text, cx, cy);
                                        ctx.restore();
                                    };

                                    const abbrTime = (d) => {
                                        let h = d.getHours();
                                        const m = d.getMinutes();
                                        const suffix = h >= 12 ? 'p' : 'a';
                                        h = h % 12 || 12;
                                        const mm = m === 0 ? '' : ':' + String(m).padStart(2, '0');
                                        return `${h}${mm}${suffix}`;
                                    };

                                    ctx.save();
                                    ctx.lineWidth = 2;
                                    ctx.fillStyle = '#111827';
                                    ctx.font = '14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
                                    ctx.textAlign = 'left';

                                    if (arr) {

                                        const x1 = grid.X(arr.x);
                                        const y1 = grid.Y(arr.y);
                                        const x2 = grid.X(arr.xf);
                                        const y2 = grid.Y(arr.yf);

                                        drawArrow(ctx, x1, y1, x2, y2);

                                        {
                                            const totalCanvasRange = grid.xmax - grid.xmin;
                                            const totalTimeRange = this.endDate.getTime() - this.startDate.getTime();

                                            const normalizedStart = (arr.x - grid.xmin) / totalCanvasRange;
                                            const normalizedEnd = (arr.xf - grid.xmin) / totalCanvasRange;

                                            const startTimestamp = this.startDate.getTime() + normalizedStart * totalTimeRange;
                                            const endTimestamp = this.startDate.getTime() + normalizedEnd * totalTimeRange;

                                            const diffMs = endTimestamp - startTimestamp;
                                            const diffMinutesTotal = diffMs / (1000 * 60);
                                            const diffHoursTotal = diffMinutesTotal / 60;
                                            const diffDaysTotal = diffHoursTotal / 24;
                                            const diffWeeksTotal = diffDaysTotal / 7;

                                            let intervalLabel = '';
                                            if (diffWeeksTotal >= 1) {
                                                const weeks = Math.floor(diffWeeksTotal);
                                                const days = Math.round((diffWeeksTotal - weeks) * 7);
                                                intervalLabel = `${weeks} wk${weeks !== 1 ? 's' : ''}` + (days > 0 ? ` ${days} d` : '');
                                            } else if (diffDaysTotal >= 1) {
                                                const days = Math.floor(diffDaysTotal);
                                                const hours = Math.round((diffDaysTotal - days) * 24);
                                                intervalLabel = `${days} d${days !== 1 ? 's' : ''}` + (hours > 0 ? ` ${hours} h` : '');
                                            } else if (diffHoursTotal >= 1) {
                                                const hours = Math.floor(diffHoursTotal);
                                                const minutes = Math.round((diffHoursTotal - hours) * 60);
                                                intervalLabel = `${hours} h` + (minutes > 0 ? ` ${minutes} min` : '');
                                            } else {
                                                const minutes = Math.max(1, Math.round(diffMinutesTotal));
                                                intervalLabel = `${minutes} min`;
                                            }

                                            const midX = (x1 + x2) / 2;
                                            const midY = (y1 + y2) / 2;

                                            drawPill(ctx, midX, midY - 16, intervalLabel, {
                                                fill: 'rgba(17,24,39,0.85)',
                                                stroke: '#111827',
                                                textFill: '#FFFFFF',
                                                shadow: 'rgba(0,0,0,0.25)',
                                                paddingX: 8,
                                                paddingY: 4
                                            });
                                        }

                                        {

                                            const dyWorld = Math.abs(arr.yf - arr.y);

                                            const formatDelta = (v) => {
                                                if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
                                                if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
                                                if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
                                                if (v < 1 && v > 0) return v.toPrecision(3);
                                                return Number.isInteger(v) ? String(v) : v.toFixed(2);
                                            };

                                            const yLabel = `Δy ${formatDelta(dyWorld)}`;
                                            const midX = (x1 + x2) / 2;
                                            const midY = (y1 + y2) / 2;

                                            const angle = Math.atan2(y2 - y1, x2 - x1);
                                            const nx = -Math.sin(angle);
                                            const ny = Math.cos(angle);
                                            const sideOffset = 18;

                                            drawPill(ctx, midX + nx * sideOffset, midY + ny * sideOffset, yLabel, {
                                                fill: '#F9FAFB',
                                                stroke: '#111827',
                                                textFill: '#111827',
                                                shadow: 'rgba(0,0,0,0.15)',
                                                paddingX: 8,
                                                paddingY: 4
                                            });
                                        }
                                    }

                                    ctx.save();
                                    ctx.font = '14px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial';
                                    ctx.textAlign = 'left';
                                    ctx.textBaseline = 'top';

                                    const dateObj = new Date(this.__date);
                                    const localDateText = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

                                    const rounded = new Date(Math.floor(dateObj.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000));
                                    const localTimeText = abbrTime(rounded);

                                    const offsetX = 10;
                                    const offsetY = -10;
                                    const baseX = this.__scx_ + offsetX;
                                    const baseY = this.__scy_ + offsetY;

                                    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                                    ctx.lineWidth = 3;

                                    ctx.strokeText(localDateText, baseX, baseY);
                                    ctx.fillStyle = '#111827';
                                    ctx.fillText(localDateText, baseX, baseY);

                                    const lineHeight = 16;
                                    ctx.strokeText(localTimeText, baseX, baseY + lineHeight);
                                    ctx.fillText(localTimeText, baseX, baseY + lineHeight);

                                    ctx.restore();
                                    ctx.restore();
                                },
                                menuManager: null
                            }

                            pt.wb(lasso)

                        },
                        move: () => {
                        }
                    },
                    {
                        label: 'Select',
                        click: () => {
                            const submenu = [
                                {
                                    label: `Select Time range`,
                                    __date: '',
                                    click: async (scx, scy) => {
                                        let yyi = 0;
                                        pt.setMessage(" Click start.")
                                        let arr = null;
                                        let isDrawing = false;
                                        let md = false;
                                        const Arrow = await exec('flexigraph/shapes/arrow');
                                        let lasso = {
                                            id: 'select-timeline',
                                            priority: true,
                                            mouseMoveListener: (x, y) => {
                                                scx_ = x;
                                                scy_ = y - 10;
                                                this.grid.rescale();
                                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                this.__scx_ = x;
                                                this.__scy_ = y;
                                                this.__date = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                if (arr) {
                                                    const xxi = this.grid.Xwc(x - this.grid.xi * 2);
                                                    arr.xf = xxi;
                                                    arr.yf = arr.y;
                                                }
                                            },
                                            mouseUpListener: async (x, y) => {

                                                if (isDrawing) {
                                                    let options = this.get_select_(pt, arr.x, arr.xf)
                                                    let smenu = new Menu(options, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * options.length / 1), 'rgb(205, 255, 155)', 'navy', 1)
                                                    pt.setMenu(smenu)
                                                    arr = null;
                                                    this.__date = null;
                                                }

                                                md = false;
                                            },
                                            mouseDownListener: async (x, y) => {
                                                if (isDrawing) {
                                                    let options = this.get_select_(pt, arr.x, arr.xf)
                                                    let smenu = new Menu(options, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * options.length / 1), 'rgb(205, 255, 155)', 'navy', 1)
                                                    pt.setMenu(smenu)
                                                    arr = null;
                                                    this.__date = null;

                                                } else {
                                                    md = true;
                                                    pt.setMessage(" Click end.")
                                                    isDrawing = true;
                                                    const xxi = this.grid.Xwc((x - 2 * this.grid.xi));
                                                    yyi = this.grid.Ywc((y - this.grid.yi * 2));
                                                    arr = new Arrow(xxi, yyi, xxi, yyi, 'black');
                                                }
                                            },
                                            close: () => {
                                                arr = null;
                                            },
                                            draw: (grid, ctx) => {
                                                {

                                                    if (this.__date) {
                                                        ctx.lineWidth = 2;
                                                        ctx.fillStyle = 'black';
                                                        ctx.font = '14px Arial';
                                                        ctx.textAlign = 'left';
                                                        ctx.fillText(this.__date, this.__scx_ + 10, this.__scy_)
                                                    }

                                                    if (arr && arr.x && arr.xf) {
                                                        const x = this.grid.X(arr.x);
                                                        const xf = this.grid.X(arr.xf);
                                                        const y = this.grid.Y(arr.y);
                                                        const ymin = this.grid.Y(this.grid.ymin);
                                                        const ymax = this.grid.Y(this.grid.ymax);
                                                        const stripeWidth = 10;
                                                        const color1 = 'rgba(82, 131, 222, 0.59)';
                                                        for (let stripeX = x; stripeX < xf; stripeX += stripeWidth * 2) {

                                                            ctx.fillStyle = color1;
                                                            ctx.fillRect(stripeX, ymin, stripeWidth, ymax - ymin);
                                                        }
                                                    }
                                                }

                                            },
                                            menuManager: null
                                        }
                                        pt.wb(lasso)

                                    },
                                    move: () => {
                                    }
                                }, {
                                    label: `Select points by name`,
                                    click: async (scx, scy) => {
                                        let va = await prompt("Point text: ", ["Name"], { "Name": "" }, 900, 250)
                                        let m = va['Name']
                                        for (let p of this.scatterData.points) {
                                            if (p.name && p.name.toLowerCase().indexOf(m) >= 0) {
                                                p.isSelected = true;
                                                p.highlight = true;
                                            }
                                        }
                                    },
                                    move: () => {
                                    }
                                },

                            ]

                            if (pt)
                                pt.setMenu(submenu)

                        }
                    },

                    {
                        label: `Theme`,
                        click: async (scx, scy) => {
                            try {

                                const themeKeys = Object.keys(THEMES);
                                const current = this.themeName || "classic-light";

                                const pretty = (s) =>
                                    s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

                                const items = themeKeys.map((key) => {
                                    const t = THEMES[key];
                                    const handleColor = t?.colors?.handle || "#888";
                                    const checked = (key === current) ? "✓ " : "";

                                    const dot = "●";

                                    return {
                                        label: `${checked}${pretty(key)}  ${dot}`,
                                        color: handleColor,
                                        click: async () => {
                                            try {

                                                if (typeof this.setTheme === "function") {
                                                    this.setTheme(key);
                                                } else if (typeof this.selectTheme === "function") {
                                                    this.selectTheme(key);
                                                }

                                                pt.setMenu && pt.setMenu(null);
                                                pt.requestRedraw && pt.requestRedraw();
                                            } catch (e) {
                                                console.warn("Theme apply error:", e);
                                            }
                                        }
                                    };
                                });

                                items.push({ label: "—", disabled: true });
                                items.push({
                                    label: "Random Theme",
                                    click: async () => {
                                        const k = themeKeys[Math.floor(Math.random() * themeKeys.length)];
                                        try {
                                            if (typeof this.setTheme === "function") {
                                                this.setTheme(k);
                                            } else if (typeof this.selectTheme === "function") {
                                                this.selectTheme(k);
                                            }
                                            pt.setMenu && pt.setMenu(null);
                                            pt.requestRedraw && pt.requestRedraw();
                                        } catch (e) {
                                            console.warn("Random theme apply error:", e);
                                        }
                                    }
                                });

                                const itemHeight = 20;
                                const menuWidth = 280;
                                const menuX = pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - menuWidth / 2);
                                const menuY = pt.grid.Ywc(
                                    pt.grid.yi + pt.grid.height / 2 - (itemHeight * items.length) / 2
                                );

                                const bg = 'rgba(255,255,255,0.95)';
                                const fg = 'navy';
                                const border = 2;

                                pt.menu = null;
                                setTimeout(() => {
                                    const smenu = new Menu(items, menuX, menuY, bg, fg, border);
                                    pt.setMenu(smenu);

                                }, 1000)
                            } catch (exception) {
                                console.warn("Failed to open Theme menu:", exception);
                            }
                        }
                    },
                    {
                        label: `Advanced`,
                        click: async (scx, scy) => {
                            const submenu = [
                                {
                                    label: `Distribute Y`,
                                    click: async (scx, scy) => {
                                        this.distributeYValues()
                                    }
                                }
                                ,
                                {
                                    label: `Specific Interval`,
                                    __date: '',
                                    click: async (scx, scy) => {
                                        let hd = {
                                            startX: null,
                                            startY: null,
                                            currentX: null,
                                            currentY: null,
                                        }

                                        let name = '';

                                        let start_date = new Date();
                                        let end_date = new Date();
                                        end_date.setFullYear(start_date.getFullYear() + 1);
                                        if (this.startDate) {
                                            start_date = this.startDate
                                        }
                                        if (this.endDate) {
                                            end_date = this.endDate
                                        }

                                        let main_layout = {
                                            wid: 'card-column',
                                            height: '100%',
                                            componentRef: 'timeInterval',
                                            data: {
                                                cards: [
                                                    [{
                                                        'width': '100%',
                                                        "style.padding-top": '4px',
                                                        "style.border": '1px',
                                                        "title": "Text:",
                                                        'component':
                                                        {
                                                            'wid': 'input-textfield',
                                                            'data': {
                                                                'title': 'Title',
                                                                'text': '',

                                                                'blocking': false,
                                                                'show-button': false,
                                                                'ionHookFunction': createIonFunction((w) => {
                                                                    name = w;
                                                                }),
                                                            }
                                                        }
                                                    }],
                                                    [

                                                        {
                                                            'width': '10vw',
                                                            'height': '100vh',
                                                            'component': {
                                                                wid: 'html',
                                                                data: `<hr> Start date `
                                                            }
                                                        },

                                                        {
                                                            'width': '20vw',
                                                            'height': '100vh',
                                                            'component': {
                                                                wid: 'calendar-chooser',
                                                                data: {
                                                                    date: dateToString(start_date),
                                                                    select: createIonFunction((_date) => {

                                                                        start_date = _date;
                                                                    })
                                                                }
                                                            }
                                                        }], [
                                                        {
                                                            'width': '100%',
                                                            'height': '10vh',
                                                            'component': {
                                                                wid: 'html',
                                                                data: `<hr>  `
                                                            }
                                                        }, {
                                                            'width': '10vw',
                                                            'height': '100vh',
                                                            'component': {
                                                                wid: 'html',
                                                                data: `<hr> End date `
                                                            }
                                                        },
                                                        {
                                                            'width': '20vw',
                                                            'height': '100vh',
                                                            'component': {
                                                                wid: 'calendar-chooser',
                                                                data: {
                                                                    date: dateToString(end_date),
                                                                    select: createIonFunction((_date) => {
                                                                        end_date = _date;
                                                                    })
                                                                }

                                                            }
                                                        }],

                                                    [
                                                        {
                                                            'title': '',
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'mt-button', data: {
                                                                    buttons: [
                                                                        {
                                                                            label: 'Yes', ionFunction: createIonFunction(async () => {

                                                                                hideAllModal();

                                                                                if (!name) {

                                                                                    infoPrompt(" Please label the inteval")
                                                                                    return;

                                                                                }

                                                                                const spanMs = end_date - start_date;
                                                                                const spanHours = spanMs / (1000 * 60 * 60);
                                                                                const numberOfPoints = 2;
                                                                                const dataPoints = [];
                                                                                const scatterData = { points: dataPoints };

                                                                                const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
                                                                                const formattedDate = start_date.toLocaleDateString('en-US', options);
                                                                                const formattedDate2 = end_date.toLocaleDateString('en-US', options);

                                                                                let i = 0;
                                                                                let fraction = i / (numberOfPoints - 1);
                                                                                let pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                                                let xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                                                let y = 0.1;

                                                                                const options2 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                                                const formattedDate3 = start_date.toLocaleDateString('en-US', options2);
                                                                                dataPoints.push({ x: xHours, y, name: formattedDate3 });
                                                                                i = 1;

                                                                                fraction = i / (numberOfPoints - 1);
                                                                                pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                                                xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                                                y = 0.1;
                                                                                const options4 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                                                const formattedDate4 = end_date.toLocaleDateString('en-US', options4);
                                                                                dataPoints.push({ x: xHours, y, name: formattedDate4 });
                                                                                const xMin = this.grid.xmin;
                                                                                const xMax = this.grid.xmax;
                                                                                const globalStart = this.startDate;
                                                                                const globalEnd = this.endDate;
                                                                                const point = {
                                                                                    x: getXFromDate(end_date, xMin, xMax, globalStart, globalEnd),
                                                                                    y: hd.currentY,
                                                                                    type: 'interval',
                                                                                    startX: getXFromDate(start_date, xMin, xMax, globalStart, globalEnd),
                                                                                    name: name,
                                                                                    color: 'black'
                                                                                }

                                                                                this.scatterData.points.push(point);
                                                                                hd.startX = null;
                                                                                hd.startY = null;
                                                                                hd.currentX = null;
                                                                                hd.currentY = null;

                                                                                pt.wb(null)

                                                                                hd.startX = null;
                                                                                hd.startY = null;
                                                                                hd.currentX = null;
                                                                                hd.currentY = null;

                                                                                setTimeout(() => {

                                                                                    CurrentLayout.reset('mainPanel')

                                                                                }, 300)

                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                                hideAllModal();
                                                                                hd.startX = null;
                                                                                hd.startY = null;
                                                                                hd.currentX = null;
                                                                                hd.currentY = null;
                                                                                pt.wb(null)

                                                                                setTimeout(() => {
                                                                                    CurrentLayout.reset('mainPanel')
                                                                                }, 300)

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
                                        CurrentLayout.setComponent('mainPanel', main_layout);

                                    },
                                    move: () => {
                                    }
                                },

                                {
                                    label: `Background color`,
                                    click: (scx, scy) => {
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
                                                                                            if (typeof _color === 'string') {
                                                                                                if (_color.startsWith('#')) {
                                                                                                    this.backgroundColor = _color
                                                                                                }
                                                                                            } else {
                                                                                                this.backgroundColor = `rgba(${_color["rgb"]['r']},${_color['rgb']['g']},${_color['rgb']['b']},${_color['rgb']['a']})`
                                                                                            }
                                                                                            infoPrompt('' + this.backgroundColor, 600, 200);
                                                                                        })
                                                                                    }
                                                                                }
                                                                            },
                                                                        ]
                                                                    ]
                                                                }
                                                            }

                                                        },
                                                        {
                                                            'component': {
                                                                wid: 'mt-button', data: {
                                                                    buttons: [
                                                                        {
                                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                                hideAllModal();
                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Apply', ionFunction: createIonFunction(async () => {
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

                                        showModal(sequence_input, 500, 150);

                                    },
                                    move: () => {
                                    }
                                }
                            ]

                            pt.setMenu(submenu)

                        }
                    },

                    {
                        label: `Delete`,
                        click: async (scx, scy) => {
                            let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                                pt.removePlot(this)
                                pt.wb(null)
                            })
                            showModal(confirm)

                        },
                        move: () => {
                        }
                    },

                ];

                if (this.backgroundColor !== 'transparent') {

                    m1.push(

                        {
                            label: `Transparent background`,
                            click: (scx, scy) => {
                                this.backgroundColor = 'transparent'
                            },
                            move: () => {
                            }
                        },

                    )
                }

                m1.push(
                    {
                        label: 'Extend timeline...',
                        click: async () => {

                            function fmtISODate(d) {
                                return d.toISOString().split('T')[0];
                            }
                            function extendPlotByFraction(plot, frac, where = 'end', splitTotalForBoth = true) {
                                if (!plot || !plot.startDate || !plot.endDate) return;

                                const durationMs = plot.endDate - plot.startDate;
                                if (durationMs <= 0) return;

                                const totalDeltaMs = durationMs * frac;

                                let newStart = new Date(plot.startDate);
                                let newEnd = new Date(plot.endDate);

                                if (where === 'end') {
                                    newEnd = new Date(plot.endDate.getTime() + totalDeltaMs);
                                } else if (where === 'start') {
                                    newStart = new Date(plot.startDate.getTime() - totalDeltaMs);
                                } else if (where === 'both') {

                                    const perSide = splitTotalForBoth ? totalDeltaMs / 2 : totalDeltaMs;
                                    newStart = new Date(plot.startDate.getTime() - perSide);
                                    newEnd = new Date(plot.endDate.getTime() + perSide);
                                }

                                plot.startDate = newStart;
                                plot.endDate = newEnd;

                                const xRange = plot.grid.xmax - plot.grid.xmin;
                                let newXmin = plot.grid.xmin;
                                let newXmax = plot.grid.xmax;

                                if (where === 'end') {
                                    newXmax = plot.grid.xmax + xRange * frac;
                                } else if (where === 'start') {
                                    newXmin = plot.grid.xmin - xRange * frac;
                                } else if (where === 'both') {
                                    const perSideFrac = splitTotalForBoth ? frac / 2 : frac;
                                    newXmin = plot.grid.xmin - xRange * perSideFrac;
                                    newXmax = plot.grid.xmax + xRange * perSideFrac;
                                }

                                plot.grid.zoom(newXmin, newXmax, plot.grid.ymin, plot.grid.ymax);
                                plot.grid.rescale();

                                plot.name = `${fmtISODate(plot.startDate)} - ${fmtISODate(plot.endDate)}`;

                                console.log(
                                    `Extended ${where}${where === 'both' ? (splitTotalForBoth ? ' (total ' + (frac * 100) + '%)' : ' (each ' + (frac * 100) + '% = total ' + (frac * 200) + '%)') : ''}` +
                                    ` → start=${plot.startDate.toISOString()}, end=${plot.endDate.toISOString()}`
                                );
                            }

                            const menuItems = [
                                {
                                    label: 'How far in the future?',
                                    click: async () => {
                                        let va = await prompt("Describe: e.g. 2 hours, Tomorrow this time", ["Time"], { "Time": "" }, 300, 400)
                                        let m = va['Time']
                                        if (m != null) {
                                            let model = await exec('py/openai/adjust-start-time.py', m, this.endDate)
                                            if (model && model.datetime) {
                                                let d = new Date(model.datetime)
                                                const totalCanvasRange = this.grid.xmax - this.grid.xmin;
                                                const totalTimeRange = this.endDate.getTime() - this.startDate.getTime();
                                                const normalizedTime = (d - this.startDate.getTime()) / totalTimeRange;
                                                const x = this.grid.xmin + normalizedTime * totalCanvasRange;
                                                this.grid.xmax = x;
                                                this.endDate = d

                                            } else {
                                                infoPrompt(" I could not determine the time from your text. ")
                                            }
                                        }
                                    }
                                },
                                {
                                    label: 'How far in the past?',
                                    click: async () => {
                                        let va = await prompt("Describe: e.g. 2 hours, Tomorrow this time", ["Time"], { "Time": "" }, 300, 400)
                                        let m = va['Time']
                                        if (m != null) {
                                            let model = await exec('py/openai/adjust-start-time.py', m, this.endDate)
                                            if (model && model.datetime) {
                                                let d = new Date(model.datetime)
                                                const totalCanvasRange = this.grid.xmax - this.grid.xmin;
                                                const totalTimeRange = this.endDate.getTime() - this.startDate.getTime();
                                                const normalizedTime = (d - this.startDate.getTime()) / totalTimeRange;
                                                const x = this.grid.xmin + normalizedTime * totalCanvasRange;
                                                this.grid.xmin = x;
                                                this.startDate = d

                                            } else {
                                                infoPrompt(" I could not determine the time from your text. ")
                                            }
                                        }
                                    }
                                },

                                {
                                    label: '10% on the end',
                                    click: async () => {

                                        extendPlotByFraction(this, 0.10, 'end');
                                    }
                                },
                                {
                                    label: '10% on the start',
                                    click: async () => {

                                        extendPlotByFraction(this, 0.10, 'start');
                                    }
                                },
                                {
                                    label: '10% split on both ends (total 10%)',
                                    click: async () => {

                                        extendPlotByFraction(this, 0.10, 'both', true);
                                    }
                                },

                                {
                                    label: '10% on both ends (total 20%)',
                                    click: async () => {

                                        extendPlotByFraction(this, 0.10, 'both', false);
                                    }
                                }
                            ];
                            let smenu = new Menu(menuItems, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * menuItems.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
                            pt.setMenu(smenu)
                        }

                    }
                )

                m1.push(
                    {
                        label: 'Add items...',
                        click: async () => {

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
                                    sequenceTextEditor.setContent('');
                                    clearInterval(interval)
                                    return;
                                }
                                sequenceTextEditor.setContent(currentText);
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
                                                            Write out items to add to the gantt chart: One on each line.  Click on the sample text below to start:
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
                                                            placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
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
                                                                label: 'Build', ionFunction: createIonFunction(async () => {
                                                                    pt.setMessage("AI mode...", 5)
                                                                    hideAllModal();
                                                                    CurrentLayout.reset('mainPanel')

                                                                    let interval = null;
                                                                    let em = new EngineMonitor((msg) => {
                                                                        pt.updateSprite(msg)
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    let content = sequenceTextEditor.getContent();
                                                                    pt.setMessage("Building model", 5)
                                                                    let model = await exec('py/openai/timeline.py', em, content)

                                                                    setTimeout(() => {

                                                                        const __startDate = new Date(model.window.start);
                                                                        const __endDate = new Date(model.window.end);
                                                                        const __xMin = Math.min(...this.scatterData.points.map(p => p.startX));
                                                                        const __xMax = Math.max(...this.scatterData.points.map(p => p.x));
                                                                        if (__startDate < this.startDate) {
                                                                            this.startDate = __startDate;
                                                                        }
                                                                        if (__endDate > this.endDate) {
                                                                            this.endDate = __endDate;
                                                                        }
                                                                        for (let iv of model.intervals) {
                                                                            addIntervalWithoutOverlap(this.scatterData, iv, this.grid)
                                                                        }
                                                                        pt.killSprite()

                                                                    }, 1000)

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

                    })

                m1.push(

                    {
                        label: `Puiblish Timeline`,
                        __date: '',
                        click: async (scx, scy) => {

                            const publicPublish = async () => {
                                let canvas = CurrentLayout.getStashed('graph-canvas');
                                if (canvas.canvas) {
                                    canvas = canvas.canvas;
                                }
                                const graph = CurrentLayout.getStashed('graph')
                                const genegraph_panel_layout = CurrentLayout.getStashed('mainPanel')
                                let domCanvas = canvas.getElement ? canvas.getElement() : canvas;
                                let pngBase64 = domCanvas.nativeElement.toDataURL('image/png');

                                console.log(pngBase64);

                                let im = pngBase64.replace(/^data:image\/png;base64,/, '');
                                await exec('screen/io/save-timeline-to-public.js', graph, genegraph_panel_layout, '', '/app/cpd/editor', im)
                            }
                            publicPublish();
                        },
                        move: () => {
                        }
                    },
                )

                m1.push(
                    {
                        label: 'More...',
                        click: async () => {
                            const graph = CurrentLayout.getStashed('graph')
                            if (graph) {
                                graph.showWindowMenu(menuList, 10, 10, 400)
                            }
                        }
                    }
                )

                return m1;

            }

            centerOn(xv) {
                let sx = this.grid.X(xv)
                return sx;
            }

            getOptionsMenuList(pt) {
                debugger;
                let menuList = []
                menuList.push(
                    {
                        label: `Title`,
                        click: async (scx, scy) => {
                            let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300)
                            let m = va['Name']
                            if (m != null) {
                                this.name = m;
                            }
                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `Copy`,
                        click: async (scx, scy) => {

                            try {
                                let t = JSON.stringify(this.toJSON())
                                navigator.clipboard.writeText(t).then(() => {
                                    console.log("Object copied to clipboard!");
                                }).catch(err => {
                                    console.error("Failed to copy object to clipboard: ", err);
                                });
                            } catch (exception) {

                            }
                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `Download PNG`,
                        click: async (scx, scy) => {
                            await this.toPNG(pt)
                        },
                        move: () => {
                        }
                    });

                if (this.type === 'timeline') {
                    return this.buildTimelineMenu(pt, menuList)
                }
                menuList.push(
                    {
                        label: `Set axis range`,
                        click: async (scx, scy) => {
                            let options = this.getXAxisMenuOptions(pt)
                            let smenu = new Menu(options, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * options.length / 2), 'rgb(205, 255, 155)', 'navy', 2)

                            let t = {
                                id: 'plot-export-menu',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                                smenu: smenu
                            }
                            t.draw = (grid, ctx) => {
                            }
                            t.mouseDownListener = (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                                }
                            }
                            t.close = () => {
                                smenu = null;

                            }
                            t.mouseMoveListener = (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                pt.grid.rescale();
                                this.grid.rescale();
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    smenu.mouseMove(pt.grid, mmx, mmy)
                                }
                            }
                            t.mouseUpListener = async (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    await smenu.mouseUp(pt.grid, mmx, mmy)
                                }
                                pt.wb(null)
                            }
                            pt.wb(t)

                        },
                        move: () => {
                        }
                    });

                if (this.lineEquations && this.lineEquations.length > 0) {
                    menuList.push(
                        {
                            label: `Copy equations`,
                            click: async (scx, scy) => {
                                try {
                                    function getEquationsText(lineEquations) {
                                        return lineEquations.map(({ slope, intercept, label, color, rSquared }, index) => {
                                            return `y = ${slope}x + ${intercept}`;
                                        }).join("\n");
                                    }
                                    let t = getEquationsText(this.lineEquations)
                                    navigator.clipboard.writeText(t).then(() => {
                                        console.log("Object copied to clipboard!");
                                    }).catch(err => {
                                        console.error("Failed to copy object to clipboard: ", err);
                                    });
                                } catch (exception) {

                                }
                            },
                            move: () => {
                            }
                        });
                }
                menuList.push(
                    {
                        label: `Configuration`,
                        click: async (scx, scy) => {
                            function objectToString(obj) {
                                return Object.entries(obj)
                                    .map(([key, value]) => `${key}=${value}`)
                                    .join('\n');
                            }

                            let st = formatForEditing(flattenJson(formatFloats(this.buildCurrentConfig())))
                            if (!st) {
                                st = ''
                            }
                            let pm = CurrentLayout.getStashed('plate-track')
                            let t =
                            {
                                height: '200px',
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
                                    fontSize: 15,
                                    automaticLayout: true,
                                    padding: {
                                        top: 20,
                                        bottom: 20,
                                        left: 30,
                                        right: 30
                                    }
                                },
                                objects: pt.root,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                    })
                                },
                                code: st,
                                buttons: [{
                                    'label': 'Update', "color": 'blue', action: async () => {
                                        let code = ref.getEditorText();
                                        let config = parseEditedFormat(code)

                                        await this.applyConfig(config, pt);
                                        ref.hideEditor();
                                    }
                                },
                                {
                                    'label': 'Close', 'color': 'black', "action": () => {
                                        ref.hideEditor();
                                    }
                                }
                                ]
                            }

                            t.objects = pt.root;
                            ref = await pt.showTextEditor(t);

                        },
                        move: () => {
                        }
                    });

                if (this.type === scatter) {
                    menuList.push({
                        label: 'IC50',
                        click: async (sx, sy) => {
                            smenu = null;
                            this.progress = 10

                            function extractDoseResponse(scatterData) {
                                const doses = [];
                                const responses = [];
                                scatterData.points.forEach(point => {
                                    doses.push(point.x);
                                    responses.push(point.y);
                                });
                                return {
                                    doses,
                                    responses
                                };
                            }

                            let engineMonitor = new EngineMonitor((msg) => {
                                pt.setMessage(msg)
                            });
                            engineMonitor.addProgressListener(async (v) => {
                                this.progress = (v);
                            })

                            this.progress = 30;
                            let { doses, responses } = extractDoseResponse(this.scatterData)
                            let ic50js = await exec('py/baja/dose-response/bayesian-ic50.py', engineMonitor, doses, responses);
                            this.progress = 100;
                            const drawDoseResponseCurve = (grid, ctx, data) => {
                                const doseResponse = data['dose-response'];
                                const { IC50, top, bottom, hill_slope, doses, responses } = doseResponse;

                                function sigmoid(dose) {
                                    return bottom + (top - bottom) / (1 + Math.pow(dose / IC50, hill_slope));
                                }

                                const minDose = Math.min(...doses);
                                const maxDose = Math.max(...doses);
                                const numPoints = 500;
                                grid.setymax(top)
                                grid.setymin(bottom)
                                grid.rescale();

                                const polygonPoints = [];
                                for (let i = 0; i < numPoints; i++) {
                                    const dose = minDose * Math.pow(maxDose / minDose, i / (numPoints - 1));
                                    const response = sigmoid(dose);
                                    polygonPoints.push([dose, response]);
                                }

                                const polygon = polygonPoints;

                                ctx.strokeStyle = 'black';
                                ctx.lineWidth = 2;
                                ctx.beginPath();
                                let scx = grid.X(polygon[0][0]);
                                ctx.moveTo(scx, grid.Y(polygon[0][1]));
                                for (let i = 1; i < polygon.length; i++) {
                                    let lx = grid.X(polygon[i][0]);
                                    let ly = grid.Y(polygon[i][1]);
                                    ctx.lineTo(lx, ly);
                                }
                                ctx.stroke();

                                const IC50X = grid.X(IC50);
                                ctx.strokeStyle = 'red';
                                ctx.setLineDash([5, 5]);
                                ctx.beginPath();
                                ctx.moveTo(IC50X, grid.Y(top));
                                ctx.lineTo(IC50X, grid.Y(bottom));
                                ctx.stroke();
                                ctx.setLineDash([]);

                                ctx.fillStyle = 'black';
                                ctx.font = '14px Arial';
                                ctx.textAlign = 'left';

                                const textX = IC50X + 10;
                                const textY = grid.Y(top) + 30;

                                ctx.fillText(`IC50: ${IC50.toFixed(2)} `, textX, textY);

                            }

                            this.addLineEquation({
                                name: 'Bayesian Dose-response',
                                data: JSON.parse(ic50js),
                                mfunction: drawDoseResponseCurve
                            })
                        }

                    }
                    )

                    menuList.push({
                        label: 'Polynomial fit',
                        click: async (sx, sy) => {
                            function extractDoseResponse(scatterData) {
                                const doses = [];
                                const responses = [];
                                scatterData.points.forEach(point => {
                                    doses.push(point.x);
                                    responses.push(point.y);
                                });
                                return {
                                    doses,
                                    responses
                                };
                            }

                            let engineMonitor = new EngineMonitor((msg) => {
                                pt.setMessage(msg)
                            });
                            engineMonitor.addProgressListener(async (v) => {
                                this.progress = (v);
                            })
                            let { doses, responses } = extractDoseResponse(this.scatterData)
                            let polyfit = await exec('py/baja/dose-response/polyfit.py', engineMonitor, doses, responses);

                            const drawPolynomialCurve = (grid, ctx, polynomialData) => {
                                const { coefficients, degree } = polynomialData;

                                function evaluatePolynomial(x) {
                                    return coefficients.reduce((sum, coeff, index) => sum + coeff * Math.pow(x, index), 0);
                                }

                                ctx.strokeStyle = 'blue';
                                ctx.lineWidth = 2;
                                ctx.beginPath();

                                const xMin = grid.xmin;
                                const xMax = grid.xmax;
                                const steps = 500;
                                const stepSize = (xMax - xMin) / steps;

                                let x = xMin;
                                let y = evaluatePolynomial(x);
                                let scx = grid.X(x);
                                let scy = grid.Y(y);
                                ctx.moveTo(scx, scy);

                                for (let i = 1; i <= steps; i++) {
                                    x += stepSize;
                                    y = evaluatePolynomial(x);
                                    scx = grid.X(x);
                                    scy = grid.Y(y);
                                    ctx.lineTo(scx, scy);
                                }

                                ctx.stroke();

                                ctx.fillStyle = 'black';
                                ctx.font = '14px Arial';
                                ctx.textAlign = 'left';
                                const textX = grid.X(grid.xmax) - 150;
                                const textY = grid.Y(grid.ymax) + 30;

                                ctx.fillText(` ${polynomialData.expression}`, textX, textY);
                            }
                            this.addLineEquation({
                                name: ' LJ fit',
                                data: JSON.parse(polyfit),
                                mfunction: drawPolynomialCurve
                            })

                        }
                    }
                    )
                }

                if (this.showEquation) {
                    menuList.push(
                        {
                            label: `Hide equations`,
                            click: async (scx, scy) => {
                                this.showEquation = false;
                            },
                            move: () => {
                            }
                        });

                } else {
                    menuList.push(
                        {
                            label: `Show equations`,
                            click: async (scx, scy) => {
                                this.showEquation = true;

                            },
                            move: () => {
                            }
                        });

                }

                if (this.scaleType !== 'log') {
                    menuList.push(
                        {
                            label: `Set log scale`,
                            click: async (scx, scy) => {
                                this.setScale('log')
                            },
                            move: () => {
                            }
                        });

                }

                if (this.scaleType !== 'logx') {
                    menuList.push(
                        {
                            label: `Set X-axis log scale`,
                            click: async (scx, scy) => {
                                this.setScale('logx')
                            },
                            move: () => {
                            }
                        });

                }
                if (this.scaleType !== 'logy') {
                    menuList.push(
                        {
                            label: `Set Y-axis log scale`,
                            click: async (scx, scy) => {
                                this.setScale('logy')
                            },
                            move: () => {
                            }
                        });

                }

                if (this.scaleType !== 'linear') {
                    menuList.push(
                        {
                            label: `Set linear scale`,
                            click: async (scx, scy) => {
                                this.setScale('linear')
                            },
                            move: () => {
                            }
                        });

                }
                menuList.push(
                    {
                        label: `Add linear regression... `,
                        click: async (scx, scy) => {

                            let va = await prompt("Label", ["Label"], { "Label": this.labelX }, 300, 300)
                            let m = va['Label']

                            if (m === null || m.length === 0) {
                                m = generateNautName();
                            }



                            function linearRegression(allScatterData) {
                                const points = allScatterData.points;
                                if (points.length === 0) {
                                    throw new Error("The points array is empty.");
                                }
                                const x = points.map(point => point.x);
                                const y = points.map(point => point.y);
                                const n = points.length;
                                const sumX = x.reduce((sum, xi) => sum + xi, 0);
                                const sumY = y.reduce((sum, yi) => sum + yi, 0);
                                const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
                                const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
                                const meanX = sumX / n;
                                const meanY = sumY / n;
                                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                                const intercept = meanY - slope * meanX;
                                const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
                                const ssResidual = points.reduce(
                                    (sum, point) => sum + Math.pow(point.y - (slope * point.x + intercept), 2),
                                    0
                                );
                                const rSquared = 1 - ssResidual / ssTotal;

                                return { slope, intercept, rSquared };
                            }


                            const { slope, intercept, rSquared } = linearRegression(this.scatterData);
                            this.type = "line";
                            this.addLineEquation({
                                type: 'regression',
                                slope: slope,
                                intercept: intercept,
                                label: `${m}`,
                                color: 'black',
                                rSquared: rSquared,
                                recalc(points) {
                                    const updated = linearRegression(points);
                                    this.slope = updated.slope;
                                    this.intercept = updated.intercept;
                                    this.rSquared = updated.rSquared;
                                    return this;

                                }
                            });
                        },
                        move: () => {
                        }
                    });

                if (this.showPointLabels) {
                    menuList.push(
                        {
                            label: `Hide point labels`,
                            click: async (scx, scy) => {
                                this.showPointLabels = false;
                            },
                            move: () => {
                            }
                        });
                } else {
                    menuList.push(
                        {
                            label: `Show point labels`,
                            click: async (scx, scy) => {

                                this.showPointLabels = true;

                            },
                            move: () => {
                            }
                        });

                }
                menuList.push(
                    {
                        label: `Delete`,
                        click: async (scx, scy) => {
                            let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                                pt.removePlot(this)
                                pt.wb(null)
                            })
                            showModal(confirm)

                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `Background color`,
                        click: (scx, scy) => {

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
                                                                                if (typeof _color === 'string') {
                                                                                    if (_color.startsWith('#')) {
                                                                                        this.backgroundColor = _color
                                                                                    }
                                                                                } else {
                                                                                    this.backgroundColor = `rgba(${_color["rgb"]['r']},${_color['rgb']['g']},${_color['rgb']['b']},${_color['rgb']['a']})`
                                                                                }
                                                                                infoPrompt('' + this.backgroundColor, 600, 200);
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ]
                                                        ]
                                                    }
                                                }

                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
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

                            showModal(sequence_input, 500, 150);

                        },
                        move: () => {
                        }
                    });

                if (this.type === scatter) {

                    menuList.push(
                        {
                            label: `Lasso Select`,
                            click: (scx, scy) => {
                                let lassoPolygon = [];
                                let isDrawing = false;
                                let lasso = {
                                    id: 'lasso-select-table',
                                    priority: true,
                                    mouseMoveListener: (x, y) => {
                                        if (!isDrawing) return;
                                        lassoPolygon.push({ x: x, y: y });
                                    },
                                    mouseUpListener: (x, y) => {
                                        if (!isDrawing) {

                                            return;
                                        }

                                        isDrawing = false;
                                        lassoPolygon.push({ x: x, y: y });

                                        if (lassoPolygon.length > 1) {
                                            lassoPolygon.push({ x: lassoPolygon[0].x, y: lassoPolygon[0].y });
                                        }

                                        let scPolygon = lassoPolygon.map(point => {
                                            return {
                                                x: (point.x),
                                                y: (point.y)
                                            };
                                        });
                                        pt.lassoSelect(scPolygon, pt.grid);
                                    },
                                    mouseDownListener: (x, y) => {
                                        isDrawing = true;
                                        lassoPolygon = [{ x: x, y: y }];
                                    },
                                    draw: (grid, ctx) => {
                                        ctx.strokeStyle = 'black';
                                        ctx.lineWidth = 2;

                                        if (lassoPolygon && lassoPolygon.length > 0) {
                                            ctx.beginPath();
                                            ctx.moveTo((lassoPolygon[0].x), (lassoPolygon[0].y));
                                            for (let i = 1; i < lassoPolygon.length; i++) {
                                                let lx = (lassoPolygon[i].x);
                                                let ly = (lassoPolygon[i].y);
                                                ctx.lineTo(lx, ly);
                                            }
                                            if (!isDrawing)
                                                ctx.closePath();
                                            ctx.stroke();
                                        }
                                    },
                                    menuManager: null
                                }
                                pt.wb(lasso)

                            },
                            move: () => {
                            }
                        });

                }

                menuList.push(
                    {
                        label: `X Axis labels`,
                        click: async (scx, scy) => {
                            let va = await prompt("Label", ["Label"], { "Label": this.labelX }, 300, 300)
                            let m = va['Label']
                            if (m != null) {
                                this.x_axis_label = m;
                            }
                        },
                        move: () => {
                        }
                    });
                menuList.push(
                    {
                        label: `Y Axis labels`,
                        click: async (scx, scy) => {
                            let va = await prompt("Label", ["Label"], { "Label": this.labelY }, 300, 300)
                            let m = va['Label']
                            if (m != null) {
                                this.y_axis_label = m;
                            }

                        },
                        move: () => {
                        }
                    });

                if (this.type === barchart) {

                    menuList.push(
                        {
                            label: `Y axis ticks`,
                            click: async (scx, scy) => {

                                this.showYAxisTickOptions(pt)

                            },
                            move: () => {
                            }
                        });

                    menuList.push(
                        {
                            label: `Ascending`,
                            click: async (scx, scy) => {
                                this.sortAscending();
                            },
                            move: () => {
                            }
                        });
                    menuList.push(
                        {
                            label: `Descending`,
                            click: async (scx, scy) => {
                                this.sortDescending();
                            },
                            move: () => {
                            }
                        });

                }
                else if (this.type === scatter) {
                    menuList.push(
                        {
                            label: `Sort...`,
                            click: async (scx, scy) => {

                                if (type === scatter) {

                                    function sortScatterDataByY(scatterPlotData) {
                                        scatterPlotData.points.sort((a, b) => a.y - b.y);
                                    }
                                    this.scatterData = sortScatterDataByY(this.scatterData)

                                }

                            },
                            move: () => {
                            }
                        });
                }

                return menuList;

            }

            mouseMove(x, y) {

            }

            setExportListeners(bx, by, pt) {
                let mm = this.getExportMenuList(pt)
                this.highlight();
                smenu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
                let t = {
                    id: 'plot-export-menu',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: smenu
                }
                t.draw = (grid, ctx) => {
                    if (smenu)
                        smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                    }
                }
                t.close = () => {
                    smenu = null;
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }
                }
                t.mouseUpListener = async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)
                    }
                }
                pt.wb(t)
            }

            displayXAxisMenuOptions(bx, by, pt) {
                let mm = this.getXAxisMenuOptions(pt)
                smenu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
                let t = {
                    id: 'plot-export-menu',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: smenu
                }
                t.draw = (grid, ctx) => {
                    if (smenu)
                        smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                    } else {
                        smenu = null
                        pt.wb(null)
                    }
                }
                t.close = () => {
                    smenu = null;
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }
                }
                t.mouseUpListener = async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)
                    }
                }
                pt.wb(t)
            }

            isMajorityXStrings() {
                if (this.scatterData && this.scatterData.points) {
                    const totalPoints = this.scatterData.points.length;
                    const stringXCount = this.scatterData.points.filter(point => typeof point.x === 'string').length;
                    return stringXCount > totalPoints / 2;
                }
                return false;

            }

            getExportMenuList(pt) {
                let menuList = []
                menuList.push(
                    {
                        label: `Download image (PNG)`,
                        click: async (scx, scy) => {

                            await this.toPNG(pt)

                        },
                        move: () => {
                        }
                    });
                return menuList
            }

            getXAxisMenuOptions(pt) {
                let _grid = this.grid;
                const menuList = [
                    {
                        label: `ymin ${_grid.ymin}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymin", ["ymin"], { "ymin": _grid.ymin.toFixed(3) }, 300, 300);
                            let m = va['ymin'];
                            if (m != null) {
                                this.fitScaleToData = false;
                                this.setymin(parseFloat(m));
                                console.log("Y min changed " + _grid.ymin);
                            }
                        },
                        move: () => { }
                    },

                    {
                        label: `xmin ${_grid.xmin}`,
                        click: async (scx, scy) => {
                            let va = await prompt("xmin", ["xmin"], { "xmin": _grid.xmin.toFixed(3) }, 300, 300);
                            let m = va['xmin'];
                            if (m != null) {
                                this.setxmin(parseFloat(m));
                                console.log("X min changed " + _grid.xmin);
                            }
                        },
                        move: () => { }
                    },

                    {
                        label: `ymax ${_grid.ymax}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymax", ["ymax"], { "ymax": _grid.ymax.toFixed(3) }, 300, 300);
                            let m = va['ymax'];
                            if (m != null) {
                                this.setymax(parseFloat(m));
                                console.log("Y max changed " + _grid.ymax);
                            }
                        },
                        move: () => { }
                    },

                    {
                        label: `xmax ${_grid.xmax}`,
                        click: async (scx, scy) => {
                            let va = await prompt("xmax", ["xmax"], { "xmax": _grid.xmax.toFixed(3) }, 300, 300);
                            let m = va['xmax'];
                            if (m != null) {
                                this.setxmax(parseFloat(m));
                                console.log("X max changed " + _grid.xmax);
                            }
                        },
                        move: () => { }
                    },

                ];
                return menuList
            }

            get_select_(pt, _xstart, _xend) {
                let _grid = this.grid;
                const menuList = [
                    {
                        label: `Copy to new timeline`,
                        click: async (scx, scy) => {
                            let start_date = formatTime(_xstart, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                            let end_date = formatTime(_xend, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                            let rstart = _xstart
                            let rend = _xend;
                            let dataPoints = []

                            dataPoints.push({
                                x: 0,
                                y: this.grid.ymax / 2
                            })
                            dataPoints.push({
                                x: _xend - _xstart,
                                y: this.grid.ymax / 2
                            })
                            let scatpts = {
                                points: dataPoints
                            }
                            const plot = new MPlot(scatpts);
                            plot.startDate = new Date(start_date);
                            plot.endDate = new Date(end_date);
                            plot.type = 'timeline';
                            let _name = `${start_date} - ${end_date}`;
                            plot.name = _name;

                            const xMin = _xstart;
                            const xMax = _xend;

                            plot.grid.rescale();
                            plot.grid.xmin = 0;
                            plot.grid.zoom(0, _xend - _xstart, 0, 1);
                            plot.x_axis_label = "Time (Years)";
                            plot.y_axis_label = "Sample Metric";
                            plot.x = pt.grid.Xwc(this.grid.X(_xend));
                            plot.y = pt.grid.Ywc(this.grid.yi + this.grid.height + 100);
                            plot.setWidth(pt.grid.worldWidth(400))
                            plot.setHeight(pt.grid.worldHeight(200))
                            plot.grid.rescale();
                            pt.m_plots.push(plot)
                            setTimeout(() => {
                                if (plot)
                                    pt.zoomintoplot(plot)
                            }, 399)
                            const dp = []
                            for (let _point of this.scatterData.points) {
                                if (_point.startX !== undefined) {
                                    let pointStartDate = formatTime(_point.startX, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);
                                    let pointEndDate = formatTime(_point.x, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);

                                    if (pointEndDate && pointStartDate) {
                                        const overlapsRange =
                                            (pointStartDate >= start_date && pointStartDate <= end_date) ||
                                            (pointEndDate >= start_date && pointEndDate <= end_date) ||
                                            (pointStartDate < start_date && pointEndDate > end_date);

                                        if (overlapsRange) {
                                            const point2 = JSON.parse(JSON.stringify(_point));
                                            point2.startX = timeToX(pointStartDate, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate);
                                            point2.x = timeToX(pointEndDate, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate);
                                            point2.start_scx = null;
                                            point2.scx = null;
                                            point2.end_scx = null;
                                            point2.scy = null;
                                            dp.push(point2);
                                        }
                                    }
                                } else if (_point.x >= _xstart && _point.x <= _xend) {
                                    let pointX = formatTime(_point.x, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);
                                    const point2 = JSON.parse(JSON.stringify(_point));
                                    point2.x = timeToX(pointX, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate);
                                    point2.scx = null;
                                    point2.scy = null;

                                    dp.push(point2);
                                }
                            }
                            plot.scatterData.points.push(...dp)

                        },
                        move: () => { }
                    },

                    {
                        label: `Crop`,
                        click: async (scx, scy) => {
                            let start_date = formatTime(_xstart, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                            let end_date = formatTime(_xend, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                            let dataPoints = []
                            dataPoints.push({
                                x: 0,
                                y: this.grid.ymax / 2
                            })
                            dataPoints.push({
                                x: _xend - _xstart,
                                y: this.grid.ymax / 2
                            })
                            let scatpts = {
                                points: dataPoints
                            }

                            const plot = this;
                            plot.startDate = new Date(start_date);
                            plot.endDate = new Date(end_date);
                            plot.grid.rescale();
                            plot.grid.xmin = 0;
                            plot.grid.zoom(0, _xend - _xstart, 0, 1);
                            plot.grid.rescale();
                            plot.scatterData.points.push(...dataPoints)

                        },
                        move: () => { }
                    },

                    {
                        label: `Remove points...`,
                        click: async (scx, scy) => {
                            const removePointsInRange = (_xstart, _xend) => {
                                const points = this.scatterData.points;

                                const minX = Math.min(...points.map(p => p.x));
                                const maxX = Math.max(...points.map(p => p.x));

                                this.scatterData.points = points.filter(point => {
                                    const isInRange = point.x >= _xstart && point.startX <= _xend;
                                    const isEdge = point.x === minX || point.x === maxX;
                                    return !isInRange || isEdge;
                                });
                            };
                            let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                                removePointsInRange(_xstart, _xend)
                            })
                            showModal(confirm)

                        },
                        move: () => { }
                    },
                ];
                menuList.push(
                    {
                        label: 'Add Items',
                        click: async () => {

                            function fmtISODate(d) {
                                return d.toISOString().split('T')[0];
                            }
                            const menuItems = [
                                {
                                    label: 'Milestones',
                                    click: async () => {

                                        let sequenceTextEditor;
                                        let descHook = createIonFunction((p) => {
                                            sequenceTextEditor = p;
                                        });
                                        let progressBar;

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
                                                                data: 'Describe the model you want.  Include what assumptions you want and what the final output should be'
                                                            }

                                                        },
                                                        {
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'text-editor',
                                                                refCallback: descHook,
                                                                data: {
                                                                    height: "200px",
                                                                    showButton: false,
                                                                    editorOptions: { language: 'text', automaticLayout: true },
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
                                                                            label: 'Build', ionFunction: createIonFunction(async () => {

                                                                                hideAllModal();
                                                                                setTimeout(() => {
                                                                                    let prog_panel = {
                                                                                        wid: 'card',
                                                                                        "height": "500px",
                                                                                        data: {
                                                                                            "style.padding-top": '1px',
                                                                                            "style.border": '1px',
                                                                                            "style.height": "500px",
                                                                                            cards: [
                                                                                                [
                                                                                                    {
                                                                                                        'component': {
                                                                                                            wid: 'progress',
                                                                                                            componentRef: 'progressBar',
                                                                                                            data: {
                                                                                                                'progress': 0,
                                                                                                                'progressBar': createIonFunction((progessBar) => {
                                                                                                                    progressBar = progessBar;
                                                                                                                })
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                ]]
                                                                                        }
                                                                                    }

                                                                                }, 1000)

                                                                                let interval = null;

                                                                                function startProgressUpdater() {
                                                                                    let value = 4;
                                                                                    interval = setInterval(() => {
                                                                                        value += 10;
                                                                                        if (value > 100) {
                                                                                            value = 100;
                                                                                            clearInterval(interval);
                                                                                        }
                                                                                        progressBar(value);
                                                                                    }, 10000);
                                                                                }
                                                                                let em = new EngineMonitor((msg) => {
                                                                                    pt.updateSprite(msg)
                                                                                });
                                                                                em.addProgressListener(async (v) => {
                                                                                    if (v >= 100) {
                                                                                    }
                                                                                })
                                                                                let content = sequenceTextEditor.getContent();

                                                                                let start_date = formatTime(_xstart, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                                                let end_date = formatTime(_xend, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)

                                                                                pt.setMessage("Building model", 5)
                                                                                let model = await exec('py/openai/milestones-date-constrained.py', em, content, start_date.toISOString(), end_date.toISOString())
                                                                                showModal({
                                                                                    wid: 'json',
                                                                                    data: JSON.stringify(model)
                                                                                })
                                                                                for (let pt of model.milestones) {

                                                                                    const _point = {
                                                                                        x: timeToX(pt.date, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate),
                                                                                        y: 0.2,
                                                                                        type: 'milestone',
                                                                                        name: `${pt.name}`,
                                                                                        color: 'red',
                                                                                        url: pt.url
                                                                                    };
                                                                                    this.scatterData.points.push(_point);

                                                                                }

                                                                                pt.killSprite()

                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                                hideAllModal();
                                                                            })
                                                                        }

                                                                    ]

                                                                }
                                                            }
                                                        }
                                                    ]]
                                            }
                                        }
                                        showModal(sequence_input, 550, 500);

                                    }
                                },
                                {
                                    label: 'Estimated intervals',
                                    click: async () => {
                                    }
                                },
                            ];
                            let smenu = new Menu(menuItems, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * menuItems.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
                            pt.setMenu(smenu)
                        }

                    }
                )

                return menuList
            }

            getNameMenuOptions(pt) {
                let menuList = []

                menuList.push(
                    {
                        label: `Title: ${this.name}`,
                        click: async (scx, scy) => {
                            let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300);
                            let m = va['Name'];
                            if (m != null) {
                                this.name = (m);
                            }
                        },
                        move: () => {
                        }
                    },
                    {
                        label: `Type: ${this.type}`,
                        click: async (scx, scy) => {
                            let va = await prompt("Type", ["Type"], { "Type": this.type }, 300, 300);
                            let m = va['Type'];
                            if (m != null) {
                                this.type = (m);
                            }
                        },
                        move: () => {
                        }
                    },

                );
                menuList.push(
                    {
                        label: `Configuration`,
                        click: async (scx, scy) => {

                            function objectToString(obj) {
                                return Object.entries(obj)
                                    .map(([key, value]) => `${key}=${value}`)
                                    .join('\n');
                            }
                            let st = JSON.stringify(this.config_script);
                            if (!st) {
                                st = ''
                            }
                            let pm = CurrentLayout.getStashed('plate-track')
                            let canvas = CurrentLayout.getStashed('graph-canvas')
                            let t =
                            {
                                height: '200px',
                                editorOptions: {
                                    language: 'bajabio',
                                    value: JSON.stringify(this.config_script),
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
                                objects: pt.root,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                        alert(" go ")
                                    })
                                },
                                code: st,
                                buttons: [{
                                    'label': 'Update', "color": 'blue', action: async () => {
                                        let code = ref.getEditorText();
                                        await this.applyConfig(code, pt);
                                        ref.hideEditor();
                                    }
                                },
                                {
                                    'label': 'Close', 'color': 'black', "action": () => {
                                        ref.hideEditor();
                                    }
                                }
                                ]
                            }

                            t.objects = pt.root;
                            ref = await pt.showTextEditor(t);

                        },
                        move: () => {
                        }
                    });

                if (this.scaleType !== 'log') {
                    menuList.push(
                        {
                            label: `Set log scale`,
                            click: async (scx, scy) => {
                                this.setScale('log')
                            },
                            move: () => {
                            }
                        });

                }
                if (this.scaleType !== 'linear') {
                    menuList.push(
                        {
                            label: `Set linear scale`,
                            click: async (scx, scy) => {
                                this.setScale('linear')
                            },
                            move: () => {
                            }
                        });

                }

                if (this.showPointLabels) {
                    menuList.push(
                        {
                            label: `Hide point labels`,
                            click: async (scx, scy) => {
                                this.showPointLabels = false;
                            },
                            move: () => {
                            }
                        });
                } else {
                    menuList.push(
                        {
                            label: `Show point labels`,
                            click: async (scx, scy) => {

                                this.showPointLabels = true;

                            },
                            move: () => {
                            }
                        });

                }

                return menuList
            }

            getYAxisMenuOptions(pt) {
                let menuList = []
                menuList.push(
                    {
                        label: `ymin ${this.grid.ymin}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymin", ["ymin"], { "ymin": this.grid.ymin }, 300, 300);
                            let m = va['ymin'];
                            if (m != null) {
                                this.grid.ymin = parseInt(m);
                            }
                        },
                        move: () => {
                        }
                    },
                    {
                        label: `ymax ${this.grid.ymax}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymax", ["ymax"], { "ymax": this.grid.ymax }, 300, 300);
                            let m = va['ymax'];
                            if (m != null) {
                                this.grid.ymax = parseInt(m);
                            }
                        },
                        move: () => {
                        }
                    }
                );
                return menuList
            }

            drawTabs(ctx) {
                if (CurrentLayout.getStashed('mode') === 'viewer') {
                    return;
                }
                if (MGrid.GP) return;
                ctx.lineWidth = 1;
                const nameTabX = this.grid.xi - this.margin.left;
                const optionsTabX = nameTabX + this.tabWidth + this.tabGap;
                const moveTabX = optionsTabX + this.tabWidth + this.tabGap;
                const tabY = this.grid.yi - this.tabHeight;

                const drawTab = (x, color, highlight, text, icon) => {
                    if (icon && icon.draw) {
                        const iconX = x;
                        const iconY = tabY;
                        icon.draw(ctx, iconX, iconY, 20, 20);
                        return;
                    }

                    ctx.fillStyle = highlight ? 'rgba(255, 255, 0, 1)' : color;
                    ctx.fillRect(x, tabY, this.tabWidth, this.tabHeight);
                    ctx.strokeStyle = 'black';
                    ctx.strokeRect(x, tabY, this.tabWidth, this.tabHeight);

                    if (text) {
                        ctx.fillStyle = 'black';
                        ctx.font = '16px Arial';
                        ctx.textAlign = 'center';
                        const textX = x + this.tabWidth / 2;
                        const textY = tabY + this.tabHeight / 2 + 6;
                        ctx.fillText(text, textX, textY);
                    }

                };

                const icons = {

                    move: {
                        draw: (ctx, x, y, width, height) => {

                            let circleRadius = Math.min(width, height) / 2;
                            let centerX = x + width / 2;
                            let centerY = y + height / 2;

                            ctx.fillStyle = 'lightCyan';

                            if (highlightTab === 'move') {
                                ctx.fillStyle = 'cyan';
                            }

                            ctx.beginPath();
                            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                            ctx.fill();

                            ctx.shadowBlur = 0;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 1;
                            let arrowLength = circleRadius * 0.8;
                            let arrowHead = 2;

                            ctx.beginPath();
                            ctx.moveTo(centerX, centerY - arrowLength);
                            ctx.lineTo(centerX, centerY - arrowLength + arrowHead);
                            ctx.lineTo(centerX - arrowHead, centerY - arrowLength + arrowHead);
                            ctx.moveTo(centerX, centerY - arrowLength + arrowHead);
                            ctx.lineTo(centerX + arrowHead, centerY - arrowLength + arrowHead);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(centerX, centerY + arrowLength);
                            ctx.lineTo(centerX, centerY + arrowLength - arrowHead);
                            ctx.lineTo(centerX - arrowHead, centerY + arrowLength - arrowHead);
                            ctx.moveTo(centerX, centerY + arrowLength - arrowHead);
                            ctx.lineTo(centerX + arrowHead, centerY + arrowLength - arrowHead);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(centerX - arrowLength, centerY);
                            ctx.lineTo(centerX - arrowLength + arrowHead, centerY);
                            ctx.lineTo(centerX - arrowLength + arrowHead, centerY - arrowHead);
                            ctx.moveTo(centerX - arrowLength + arrowHead, centerY);
                            ctx.lineTo(centerX - arrowLength + arrowHead, centerY + arrowHead);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(centerX + arrowLength, centerY);
                            ctx.lineTo(centerX + arrowLength - arrowHead, centerY);
                            ctx.lineTo(centerX + arrowLength - arrowHead, centerY - arrowHead);
                            ctx.moveTo(centerX + arrowLength - arrowHead, centerY);
                            ctx.lineTo(centerX + arrowLength - arrowHead, centerY + arrowHead);
                            ctx.stroke();
                        }
                    },
                };

                if (this.showTopMenuBar)
                    drawTab(nameTabX, 'lightYellow', highlightTab === 'move', '', icons.move);

                ctx.textAlign = 'left';
            }

            async handleKeyDown(scx, scy, plateTrack) {

            }

            async handleMouseOver(scx, scy, pt) {

                this.__moving = false;
                this.grid.rescale();
                let x = scx;
                let y = scy;
                let b = this.buttons;
                let tw = (((30 * b.length)))
                let init = (this.grid.xi + this.grid.width - this.buttons.length * bsize);
                if (init < 0) {
                    init = (0)
                }
                let index = 0;
                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = (this.grid.yi - (this.margin.top));
                    let screen_height = (this.getHeight());
                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }

                    let bbw = bsize;
                    index++;
                    if (
                        x >= buttonX &&
                        x <= buttonX + bbw &&
                        y >= buttonY &&
                        y <= buttonY + button.height
                    ) {
                        return await button.highlight(buttonX, buttonY, x, y);
                    }
                }
            }

            async handleMouseOver_viewer(scx, scy, pt) {

                this.scatterData.points.forEach(point => {
                    point.highlight = false;
                })

                this.__moving = false;
                this.grid.rescale();
                let init = (this.grid.xi + this.grid.width - this.buttons.length * bsize);
                if (init < 0) {
                    init = (0)
                }
                this.scatterData.points.forEach(point => {
                    if (pt && point && point.startX) {
                        if (isMouseOverArrow(scx, scy, point, this.grid, pt, 5)) {
                            point.highlight = true;
                        }
                    } else if (pt && point) {
                        const px = pt.grid.X(point.x);
                        const py = pt.grid.Y(point.y);
                        const dx = scx - px;
                        const dy = scy - py;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const radius = 16;
                        if (distance < radius) {
                            point.highlight = true;
                        }
                    }
                })
            }

            async handleMouseUp(scx, scy, pt) {

            }
            removeSelectedPoints() {
                let removePoints = []
                for (let point of this.scatterData.points) {
                    if (point.isSelected) {
                        removePoints.push(point)
                    }
                }
                this.scatterData.points = this.scatterData.points.filter(point => !removePoints.includes(point));
            }
            removePoint(point) {
                let removePoints = []
                removePoints.push(point)
                this.scatterData.points = this.scatterData.points.filter(point => !removePoints.includes(point));
            }

            moveSelectedPoints(pt) {
                let mvPoints = [];
                for (let point of this.scatterData.points) {
                    if (point.isSelected) {
                        mvPoints.push(point);
                    }
                }
                let t = {
                    id: 'move-points',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                };

                let dragStartX = 0;
                let dragStartY = 0;
                let dragging = false;
                t.priority = true;
                t.draw = (grid, ctx) => {
                };

                t.close = () => {
                };

                t.mouseDownListener = (x, y) => {
                    let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                    let mmy = this.grid.Ywc(y + this.grid.yi * 2);
                    dragStartX = mmx;
                    dragStartY = mmy;
                    dragging = true;
                };

                t.mouseMoveListener = (x, y) => {
                    if (!dragging)
                        return;
                    let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                    let mmy = this.grid.Ywc(y + this.grid.yi * 2);

                    let dx = mmx - dragStartX;
                    let dy = mmy - dragStartY;

                    for (let point of mvPoints) {
                        point.x += dx;
                        if (point.startX) {
                            point.startX += dx;
                        }
                        if (p.startY != null) {
                            p.startY += (dy);
                        }
                        point.y += dy;
                    }

                    dragStartX = mmx;
                    dragStartY = mmy;

                    pt.grid.rescale();
                    this.grid.rescale();
                };

                t.mouseUpListener = async (x, y) => {
                    dragging = false;

                    pt.wb(null)
                };

                setTimeout(() => {
                    pt.wb(t);
                }, 200);

            }
            moveSelectedPointsVerticalOnly(pt) {
                let mvPoints = [];
                for (let point of this.scatterData.points) {
                    if (point.isSelected) {
                        mvPoints.push(point);
                    }
                }

                let t = {
                    id: 'move-points',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                };

                let dragStartX = 0;
                let dragStartY = 0;
                let dragging = false;

                t.draw = (grid, ctx) => {
                };

                t.close = () => {
                };

                t.mouseDownListener = (x, y) => {
                    let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                    let mmy = this.grid.Ywc(y + this.grid.yi * 2);
                    dragStartX = mmx;
                    dragStartY = mmy;
                    dragging = true;
                };

                t.mouseMoveListener = (x, y) => {
                    if (!dragging)
                        return;
                    let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                    let mmy = this.grid.Ywc(y + this.grid.yi * 2);

                    let dx = mmx - dragStartX;
                    let dy = mmy - dragStartY;

                    for (let point of mvPoints) {
                        point.y += dy;
                        if (point.startY) {
                            point.startY += dy;
                        }
                    }

                    dragStartX = mmx;
                    dragStartY = mmy;

                    pt.grid.rescale();
                    this.grid.rescale();
                };

                t.mouseUpListener = async (x, y) => {
                    dragging = false;

                    pt.wb(null)
                };

                setTimeout(() => {
                    pt.wb(t);
                }, 200);

            }

            close() {
                let pm = CurrentLayout.getStashed('plate-track')
                setTimeout(() => {
                    pt.removePlot(this);
                    pt.wb(null)

                }, 1000);

            }

            handleButtonClick(mouseX, mouseY, pt) {

                if (this.mode === '__viewer' || pt.mode === 'viewer') {
                    return;
                }
                const px = mouseX;
                const py = mouseY;
                const screenHeight = this.getHeight();
                const screenWidth = this.getWidth();
                const sy = this.grid.yi;
                const nameTabX = this.grid.xi - this.margin.left;
                const optionsTabX = nameTabX + this.tabWidth + this.tabGap;
                const moveTabX = optionsTabX + this.tabWidth + this.tabGap;
                const tabY = this.grid.yi - this.tabHeight - 25;
                const isInMoveTab = px >= nameTabX && px <= (nameTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 25);
                if (isInMoveTab) {
                    highlightTab = 'move'
                    this.__moving = true;
                    return 'move';
                }
                if ((sy + screenHeight) < 0) return;
                let index = 0;
                let init = (this.grid.xi + this.grid.width - this.buttons.length * bsize);
                if (init < 0) init = 0;

                for (let button of this.buttons) {
                    let buttonX = init + index * bsize;
                    let buttonY = this.grid.yi - this.margin.top;
                    let buttonHeight = button.height;

                    if (buttonY < 0 && (buttonY + screenHeight) > 0) {
                        buttonY = 10;
                    }

                    if (
                        mouseX >= buttonX && mouseX <= buttonX + bsize &&
                        mouseY >= buttonY && mouseY <= buttonY + buttonHeight
                    ) {
                        if (typeof button.onClick === 'function') {

                        }
                        return button.name;
                    }

                    index++;
                }

                return null;
            }
            async handleMouseDown(scx, scy, pt) {
                this.deselectPoints();

                let path = ''
                let name = ''
                let activeTab = this.handleButtonClick(scx, scy, pt);
                if (activeTab) {
                    if (activeTab === 'move') {
                        await this.setMoveListeners(pt, scx, scy)
                        highlightTab = 'move'
                        this.__moving = true;
                        return 'move';
                    } else if (activeTab === 'minimize') {
                        await this.setOptionListeners(scx, scy, pt)
                    } else if (activeTab === 'close') {
                        setTimeout(async () => {
                            let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                                pt.removePlot(this)
                                pt.wb(null)
                            })
                            showModal(confirm)
                        }, 200)
                        return;
                    }
                }
                this.unhighlight()
                pt.wb(null)

            }

            async handleMouseDown__viewer(scx, scy, pt) {

            }

            async getViewerMenuForPoint(point, pt) {

                let m = []

                m.push(
                    {
                        label: `Color`,
                        click: async (scx, scy) => {
                            pt?.clearMenu()

                            let __color = point.color

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
                                                                    point.color = __color;
                                                                    pt.clearMenu()

                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.reset('mainPanel');

                                                                })
                                                            },
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(async () => {
                                                                    pt.clearMenu()

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

                let descHook = createIonFunction(() => {

                })

                m.push(
                    {
                        label: `Abstract`,
                        click: async (scx, scy) => {
                            if (point.abstract) {

                                let abstract_display = {
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
                                                              ${point.name}
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
                                                            text: (point.abstract + '\n\n\nAuthors: ' + point.journal + '\n\nAffiliations: ' + point.affiliations + '\n\n\nJournal: ' + point.authors),
                                                            editorOptions: {
                                                                language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                                suggestOnTriggerCharacters: false,
                                                                quickSuggestions: false,
                                                                parameterHints: { enabled: false },
                                                                minimap: { enabled: false },
                                                                fontFamily: "Courier New, monospace",
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
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                        hideAllModal();
                                                                        pt.setMenu(null)
                                                                        CurrentLayout.reset('mainPanel')

                                                                    })
                                                                },

                                                            ]

                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                CurrentLayout.setComponent('mainPanel', abstract_display)
                            } else {
                                pt.setMessage("Loading abstract")
                                let rf = await exec('py/extract/abstract_from_doi.py', point.doi);
                                infoPrompt(point.name + ':\n' + rf['abstract'], 800, 600)
                                pt.clearMenu()
                            }
                        },

                        move: () => {
                        }
                    })
                if (point.authors) {
                    m.push(
                        {
                            label: `Authors`,
                            click: async (scx, scy) => {

                                infoPrompt(point.authors)
                                pt.clearMenu()

                            },

                            move: () => {
                            }
                        })
                }

                if (point.url) {
                    m.push(

                        {
                            label: 'Link',
                            click: async (scx, scy) => {
                                const newWindow = window.open(point.url, '_blank');

                            }
                        }

                    )
                }

                return m;
            }

            async getSelectionElementsMenu(point, pt) {
                const m = []

                m.push(
                    {
                        label: `Zoom to point...`,
                        click: async (scx, scy) => {

                            this.grid.rescale();
                            let screen_x = (this.grid.X(point.x));
                            let screen_y = (point.scy);
                            if (point.startX) {
                                screen_x = this.grid.X(point.startX);
                                let endX = this.grid.X(point.x)
                                let rect_x = Math.abs(endX - screen_x)
                                let width = pt.grid.worldWidth(rect_x + pt.grid.xinset)
                                let height = pt.grid.worldHeight(rect_x + pt.grid.yinset)
                                let totalWidth = width;
                                let factor = 0.20;
                                let fl = totalWidth * factor
                                let flh = height * factor
                                let xi = pt.grid.Xwc(screen_x + pt.grid.xinset)
                                let yi = pt.grid.Ywc(screen_y + pt.grid.yinset) - (height / 2)
                                await pt.zoomto(xi, yi, width, height)

                            } else {
                                screen_y = (this.grid.Y(0));
                                screen_x = (this.grid.X(point.x));
                                let small_width = pt.grid.worldWidth(200);
                                let small_height = pt.grid.worldHeight(200 + pt.grid.yinset)
                                let rect_x = pt.grid.Xwc(screen_x) - small_width / 2;
                                let rect_y = pt.grid.Ywc(screen_y + pt.grid.yinset) - small_height / 2;
                                await pt.zoomto(rect_x, rect_y, small_width, small_height);
                            }
                        },
                        move: () => {
                        }
                    });

                if (point.startX) {
                    m.push(
                        {
                            label: `Expand into new timeline`,
                            click: async (scx, scy) => {
                                let start_date = formatTime(point.startX, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                let end_date = formatTime(point.x, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                let rstart = point.startX
                                let rend = point.x;
                                let dataPoints = []

                                for (let _point of this.scatterData.points) {
                                    if (_point.startX !== undefined) {
                                        const pstart = (_point.startX);
                                        const pend = (_point.x);

                                        if (pstart <= rend && pend >= rstart) {
                                            const point2 = JSON.parse(JSON.stringify(_point));
                                            dataPoints.push(point2)
                                        }
                                    }
                                    else if (_point.x > point.startX && _point.x <= point.x) {
                                        const point2 = JSON.parse(JSON.stringify(_point));
                                        dataPoints.push(point2)
                                    }
                                }
                                let scatpts = {
                                    points: dataPoints
                                }
                                const plot = new MPlot(scatpts);
                                plot.startDate = (start_date);
                                plot.endDate = (end_date);
                                plot.type = 'timeline'
                                plot.name = point.name;
                                const xMin = Math.min(...dataPoints.map(p => p.startX));
                                const xMax = Math.max(...dataPoints.map(p => p.x));
                                plot.grid.zoom(xMin, xMax, 0, 1);
                                plot.x_axis_label = "Time (Years)";
                                plot.y_axis_label = "Sample Metric";
                                plot.x = pt.grid.Xwc(this.grid.X(point.x));
                                plot.y = pt.grid.Ywc(this.grid.yi + this.grid.height + 18);
                                plot.setWidth(pt.grid.worldWidth(400))
                                plot.setHeight(pt.grid.worldHeight(200))
                                plot.grid.rescale();
                                pt.m_plots.push(plot)
                                setTimeout(() => {
                                    if (plot)
                                        pt.zoomintoplot(plot)
                                }, 299)
                            },
                            move: () => {
                            }
                        });
                }

                m.push(
                    {
                        label: `Bookmark point`,
                        click: async (scx, scy) => {

                            this.grid.rescale();
                            let screen_x = (this.grid.X(point.x));
                            let screen_y = (point.scy);
                            if (point.startX) {
                                screen_x = this.grid.X(point.startX);
                                let endX = this.grid.X(point.x)
                                let rect_x = Math.abs(endX - screen_x)
                                let width = pt.grid.worldWidth(rect_x + pt.grid.xinset)
                                let height = pt.grid.worldHeight(rect_x + pt.grid.yinset)
                                let totalWidth = width;
                                let factor = 0.20;
                                let fl = totalWidth * factor
                                let flh = height * factor
                                let xi = pt.grid.Xwc(screen_x + pt.grid.xinset)
                                let yi = pt.grid.Ywc(screen_y + pt.grid.yinset) - (height / 2)
                                await pt.zoomto(xi, yi, width, height)

                            } else {
                                screen_y = (this.grid.Y(0));
                                screen_x = (this.grid.X(point.x));
                                let small_width = pt.grid.worldWidth(200);
                                let small_height = pt.grid.worldHeight(200 + pt.grid.yinset)
                                let rect_x = pt.grid.Xwc(screen_x) - small_width / 2;
                                let rect_y = pt.grid.Ywc(screen_y + pt.grid.yinset) - small_height / 2;
                                await pt.zoomto(rect_x, rect_y, small_width, small_height);
                            }
                            setTimeout(async () => {
                                pt.setMessage(" Bookmark set: " + point.name)
                                await pt.setBookmark(point.name);

                            }, 1000)

                        },
                        move: () => {
                        }
                    });
                m.push(
                    {
                        label: `Color`,
                        click: async (scx, scy) => {

                            let color__ = 'blue'
                            let sequence_input = {
                                wid: 'card',
                                "height": "100px",
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
                                                                                color__ = _color;
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ]
                                                        ]
                                                    }
                                                }

                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    point.color = color__
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
                            showModal(sequence_input, 500, 200)

                        },
                        move: () => {
                        }
                    });

                if (pt.mode && pt.mode === 'viewer') {

                } else {

                    m.push(
                        {
                            label: `Edit text...`,
                            click: async (scx, scy) => {
                                let va = await prompt("", ["Txt"], { "Txt": point.name }, 300, 300)
                                let m__ = va['Txt']
                                if (m__ != null) {
                                    point.name = m__;
                                    point.img = null;
                                    point.icon = getLJIcon(point.name)
                                }
                            },
                            move: () => {
                            }
                        });
                    m.push(
                        {
                            label: `Edit date/time...`,
                            click: async (scx, scy) => {
                                let end_date = formatTime(point.x, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                let start_date = formatTime(point.startX, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                let main_layout = {
                                    wid: 'card-column',
                                    height: '100%',
                                    componentRef: 'timeInterval',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'width': '100%',
                                                    "style.padding-top": '4px',
                                                    "style.border": '1px',
                                                    'component':
                                                    {
                                                        'wid': 'html',
                                                        'data': ` <h5> Edit date range </h5>`,
                                                    }
                                                },
                                                {
                                                    'width': '100%',
                                                    "style.padding-top": '4px',
                                                    "style.border": '1px',
                                                    "title": "Text:",
                                                    'component':
                                                    {
                                                        'wid': 'input-textfield',
                                                        'data': {
                                                            'title': 'Title',
                                                            'text': point.name,

                                                            'blocking': false,
                                                            'show-button': false,
                                                            'ionHookFunction': createIonFunction((w) => {
                                                                point.name = w.value;
                                                            }),
                                                        }
                                                    }
                                                }

                                            ],
                                            [

                                                {
                                                    'width': '10vw',
                                                    'height': '100vh',
                                                    'component': {
                                                        wid: 'html',
                                                        data: `<hr> Start date `
                                                    }
                                                },

                                                {
                                                    'width': '20vw',
                                                    'height': '100vh',
                                                    'component': {
                                                        wid: 'calendar-chooser',
                                                        data: {
                                                            date: dateToString(start_date),
                                                            select: createIonFunction((_date) => {

                                                                start_date = _date;
                                                            })
                                                        }
                                                    }
                                                }], [
                                                {
                                                    'width': '100%',
                                                    'height': '10vh',
                                                    'component': {
                                                        wid: 'html',
                                                        data: `<hr>  `
                                                    }
                                                }, {
                                                    'width': '10vw',
                                                    'height': '100vh',
                                                    'component': {
                                                        wid: 'html',
                                                        data: `<hr> End date `
                                                    }
                                                },
                                                {
                                                    'width': '20vw',
                                                    'height': '100vh',
                                                    'component': {
                                                        wid: 'calendar-chooser',
                                                        data: {
                                                            date: dateToString(end_date),
                                                            select: createIonFunction((_date) => {
                                                                end_date = _date;
                                                            })
                                                        }

                                                    }
                                                }],

                                            [
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        pt.wb(null)
                                                                        setTimeout(() => {
                                                                            CurrentLayout.reset('mainPanel')
                                                                        }, 300)
                                                                    })
                                                                },
                                                                {
                                                                    label: 'Yes', ionFunction: createIonFunction(async () => {
                                                                        if (!point.name) {
                                                                            infoPrompt(" Please label the inteval")
                                                                            return;

                                                                        }

                                                                        point.x = timeToX(end_date, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                                        point.startX = timeToX(start_date, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)

                                                                        if (point.startX > point.x) {
                                                                            infoPrompt(" Start date is greater than end date... ")
                                                                            return;
                                                                        }

                                                                        pt.wb(null)

                                                                        setTimeout(() => {
                                                                            CurrentLayout.reset('mainPanel')
                                                                        }, 300)
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
                                CurrentLayout.setComponent('mainPanel', main_layout);

                            },
                            move: () => {
                            }
                        });

                }

                m.push(
                    {
                        label: `Color`,
                        click: async (scx, scy) => {

                            let color__ = 'blue'
                            let sequence_input = {
                                wid: 'card',
                                "height": "100px",
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
                                                                                color__ = _color;
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ]
                                                        ]
                                                    }
                                                }

                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    point.color = color__
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
                            showModal(sequence_input, 500, 200)

                        },
                        move: () => {
                        }
                    });
                m.push(
                    {
                        label: `Visible scope`,
                        click: async (scx, scy) => {
                            let m = []
                            m.push(
                                {
                                    label: `Show on years`,
                                    click: async (scx, scy) => {
                                        point.showYears = true;
                                    },
                                    move: () => { }
                                },

                                {
                                    label: `Show on months`,
                                    click: async (scx, scy) => {
                                        point.showMonths = true;
                                    },
                                    move: () => { }
                                },

                                {
                                    label: `Show on days`,
                                    click: async (scx, scy) => {
                                        point.showDays = true;
                                    },
                                    move: () => { }
                                },
                                {
                                    label: `Show on hours`,
                                    click: async (scx, scy) => {
                                        point.showHours = true;
                                    },
                                    move: () => { }
                                },
                                {
                                    label: `Show on All`,
                                    click: async (scx, scy) => {
                                        point.showHours = null;
                                        point.showMonths = null;
                                        point.showDays = null;
                                        point.showYears = null;
                                        point.showQuarters = null;
                                    },
                                    move: () => { }
                                }

                            );
                            pt.wb(null)
                            const menu = new Menu(m, pt.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200),
                                pt.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 2)

                            const graph = CurrentLayout.getStashed('graph')
                            if (graph) {
                                graph.showWindowMenu(m, 10, 10, 400)
                            }

                        },
                        move: () => {
                        }
                    });

                if (!pt.mode || pt.mode !== 'viewer') {
                    m.push(

                        {
                            label: 'Move X&Y',
                            click: async (scx, scy) => {
                                pt.setMenu(null)

                                let mvPoints = []
                                for (let point of this.scatterData.points) {
                                    if (point.isSelected) {
                                        point.isHighlighted = true;
                                        mvPoints.push(point);
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
                                        p.highlight = true;
                                        p.isSelected = true;
                                    }
                                };

                                t.close = () => {
                                };

                                t.mouseDownListener = (x, y) => {
                                    dragStartX = x;
                                    dragStartY = y;
                                    dragging = true;
                                    if (kill) {
                                        pt.wb(null)
                                    }
                                };

                                t.mouseMoveListener = (x, y) => {
                                    if (!dragging)
                                        return;
                                    let dx = x - dragStartX;
                                    let dy = y - dragStartY;
                                    for (let p of mvPoints) {
                                        p.highlight = true;
                                        p.isSelected = true;

                                        p.x += this.grid.worldWidth(dx);
                                        if (p.startX) {
                                            p.startX += this.grid.worldWidth(dx);
                                        }
                                        if (p.startY) {
                                            p.startY += this.grid.worldHeight(dy);
                                        }

                                        p.y -= this.grid.worldHeight(dy);
                                        p.scy -= (dy);
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
                                    pt.wb(t);

                                    pt.setMessage(" Click and drag to move the selected points...")
                                    pt.menu = null;
                                    pt.menu_vis = false;
                                }, 200)

                            }
                        }

                    )
                }
                if (point.url) {
                    m.push(

                        {
                            label: 'Link',
                            click: async (scx, scy) => {
                                const newWindow = window.open(point.url, '_blank');

                            }
                        }

                    )
                }

                if (point.startX) {
                    m.push(

                        {
                            label: 'Edit time interval length',
                            click: async (scx, scy) => {
                                let va = await prompt("Describe the time.  e.g. 2 hours, 1 day", ["Time"], { "Time": "" }, 300, 300)
                                let m = va['Time']
                                if (m != null) {

                                    let sdate = formatTime(point.startX, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                    let model = await exec('py/openai/get-time-range.py', m, sdate.toISOString())

                                    if (model && model.datetime) {
                                        let d = new Date(model.datetime)
                                        const __xw = timeToX(
                                            d,
                                            this.grid.xmin,
                                            this.grid.xmax,
                                            this.startDate,
                                            this.endDate
                                        );
                                        point.x = __xw
                                    } else {
                                        infoPrompt(" I could not determine the time from your text. ")
                                    }

                                }
                            }
                        }

                    )
                }

                m.push(
                    {
                        label: `Move vertical`,
                        click: async (scx, scy) => {
                            let mvPoints = [];
                            for (let point of this.scatterData.points) {
                                if (point.isSelected) {
                                    mvPoints.push(point);
                                }
                            }

                            pt.setMessage(" Click and drag on the point you want to move ")

                            let t = {
                                id: 'move-points',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                            };

                            let dragStartX = 0;
                            let dragStartY = 0;
                            let dragging = false;

                            t.draw = (grid, ctx) => {
                            };

                            t.close = () => {
                            };

                            t.mouseDownListener = (x, y) => {
                                let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                                let mmy = this.grid.Ywc(y + this.grid.yi * 2);
                                dragStartX = mmx;
                                dragStartY = mmy;
                                dragging = true;
                            };

                            t.mouseMoveListener = (x, y) => {
                                if (!dragging)
                                    return;
                                let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                                let mmy = this.grid.Ywc(y + this.grid.yi * 2);

                                let dx = mmx - dragStartX;
                                let dy = mmy - dragStartY;
                                point.y += dy;
                                dragStartX = mmx;
                                dragStartY = mmy;

                                pt.grid.rescale();
                                this.grid.rescale();
                            };

                            t.mouseUpListener = async (x, y) => {
                                dragging = false;

                                pt.wb(null)
                            };

                            setTimeout(() => {
                                pt.wb(t);
                            }, 200);

                        },
                        move: () => {
                        }
                    });

                m.push(
                    {
                        label: `Remove`,
                        click: async (scx, scy) => {

                            let confirm = await exec('baja/lib/confirm.js', 'Remove point?', async () => {
                                let removePoints = [point]
                                this.scatterData.points = this.scatterData.points.filter(point => !removePoints.includes(point));
                            })
                            showModal(confirm)
                        },
                        move: () => {
                        }
                    });

                if (point.type === 'document') {
                    m.push({
                        label: 'Upload PDF', 'ionfunction': createIonFunction(async () => {

                            let host_ = window['env']['apiUrl']
                            try {
                                let rs = await LOADPDF(host_ + '/load-pdf', point.path, getUser(), 'user');
                                const newWindow = window.open(rs, '_blank');
                                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                                }
                            } catch (exception) {

                                let __color = 'rgba(0, 87, 163, 0.5)'
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
                                                                if (!file) {
                                                                    console.error("No file selected for upload.");
                                                                    return { error: "No file selected" };
                                                                }
                                                                let __file = file;
                                                                const user = getUser();
                                                                const type = "data";
                                                                const chunkSize = 5 * 1024 * 1024;
                                                                const totalChunks = Math.ceil(file.size / chunkSize);
                                                                let uploadedChunks = 0;

                                                                for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                                                                    const start = chunkIndex * chunkSize;
                                                                    const end = Math.min(start + chunkSize, file.size);
                                                                    const chunk = file.slice(start, end);
                                                                    const formData = new FormData();
                                                                    formData.append("user", user);
                                                                    formData.append("type", type);
                                                                    formData.append("file", chunk, file.name);

                                                                    try {
                                                                        if (path) {
                                                                            formData.append("path", path);
                                                                        }

                                                                        let host_ = window['env']['apiUrl']
                                                                        const response = await fetch(host_ + '/upload', {
                                                                            method: 'POST',
                                                                            body: formData
                                                                        })

                                                                        const result = await response.json();
                                                                        if (!response.ok || result.failed) {
                                                                            console.error(`Error uploading chunk ${chunkIndex}:`, result.failed);
                                                                            return { error: `Upload failed at chunk ${chunkIndex}` };
                                                                        }

                                                                        uploadedChunks++;
                                                                        progressBar((uploadedChunks / totalChunks) * 100)

                                                                        console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                                                                    } catch (error) {
                                                                        console.error("Upload failed:", error);
                                                                        return { error: "Network or server error during upload" };
                                                                    }
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
                                                            root: getUser(),
                                                            "ionfunction.fileClick": createIonFunction(async (element) => {
                                                                let name = element.name;
                                                                path = element.path;
                                                                infoPrompt(" " + name + " selected.")
                                                            }),
                                                            "ionfunction.openfile": createIonFunction(async (file, text) => {
                                                            }
                                                            ),
                                                            "ionfunction.path": createIonFunction(async (_path, nodes) => {
                                                                path = _path;
                                                            })
                                                        }
                                                    }
                                                }
                                            ]
                                        ]
                                    }
                                }

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
                                                                [
                                                                    {
                                                                        'component': design_params_panel_layout
                                                                    }
                                                                ]
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
                                                                        let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                                        let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                                                        this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                                        const yvalue = this.grid.Ywc(y)
                                                                        this.scatterData.points.push({
                                                                            x: tx,
                                                                            y: ty,
                                                                            startX: this.grid.xmin,
                                                                            path: path,
                                                                            ref: this.uid,
                                                                            name: `${point.name}`,
                                                                            color: __color,
                                                                            filename: point.name,
                                                                            type: 'document'
                                                                        });

                                                                        CurrentLayout.reset('mainPanel');
                                                                    })
                                                                },
                                                                {
                                                                    label: 'Close', ionFunction: createIonFunction(async () => {
                                                                        hideAllModal();
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
                            }
                        }
                        )
                    })
                }

                else if (point.type === 'milestone') {

                    m.push(
                        {
                            label: `Move vertical`,
                            click: async (scx, scy) => {
                                let mvPoints = [];
                                for (let point of this.scatterData.points) {
                                    if (point.isSelected) {
                                        mvPoints.push(point);
                                    }
                                }

                                let t = {
                                    id: 'move-points',
                                    mouseMoveListener: null,
                                    mouseUpListener: null,
                                    mouseDownListener: null,
                                    draw: null,
                                    menuManager: null,
                                };

                                let dragStartX = 0;
                                let dragStartY = 0;
                                let dragging = false;

                                t.draw = (grid, ctx) => {
                                };

                                t.close = () => {
                                };

                                t.mouseDownListener = (x, y) => {
                                    let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                                    let mmy = this.grid.Ywc(y + this.grid.yi * 2);
                                    dragStartX = mmx;
                                    dragStartY = mmy;
                                    dragging = true;
                                };

                                t.mouseMoveListener = (x, y) => {
                                    if (!dragging)
                                        return;
                                    let mmx = this.grid.Xwc(x + this.grid.xi * 2);
                                    let mmy = this.grid.Ywc(y + this.grid.yi * 2);

                                    let dx = mmx - dragStartX;
                                    let dy = mmy - dragStartY;
                                    point.y += dy;

                                    if (point.startY != null) {
                                        point.startY += dy;
                                    }

                                    dragStartX = mmx;
                                    dragStartY = mmy;

                                    pt.grid.rescale();
                                    this.grid.rescale();
                                };

                                t.mouseUpListener = async (x, y) => {
                                    dragging = false;

                                    pt.wb(null)
                                };

                                setTimeout(() => {
                                    pt.wb(t);
                                }, 200);

                            },
                            move: () => {
                            }
                        });

                    return this.activateMilestone(m, point, pt)
                }
                else if (point.type === 'progress') {

                }
                return m;
            }

            activateMilestone(m, point, pt) {

                if (point.videoURL) {
                    m.push(
                        {
                            label: `View video`,
                            click: async (scx, scy) => {
                                let you = showModal({
                                    wid: 'youtube',
                                    data: {
                                        url: `${point.videoURL}`
                                    }
                                }, 700, 500)

                            },
                            move: () => {
                            }
                        });
                }

                if (point.ref) {
                    m.push(
                        {
                            label: `Remove link`,
                            click: async (scx, scy) => {
                                point.ref = null;
                            },
                            move: () => {
                            }
                        });

                }

                m.push(
                    {
                        label: `Link table to point`,
                        __date: '',
                        click: async (scx, scy) => {
                            let startx = this.grid.xmin;
                            let __point = point;

                            pt.setSelectedListener((uid) => {
                                if (__point && uid) {
                                    point.ref = uid;
                                    pt.clearPlateListeners();
                                }
                            })

                            smenu = null;
                            pt.clearMenu();
                            pt.setMessage(' Select the table to link')
                            let t = {
                                id: 'link-table',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                                smenu: smenu
                            }
                            t.draw = (grid, ctx) => {
                                if (this.__date) {

                                    if (__point && __point.startX !== undefined && x !== undefined) {
                                        const startX = grid.X(__point.startX);
                                        const y = grid.Y(__point.y)
                                        const x = grid.Y(__point.x)
                                        const arrowY = y - 10;
                                        const color = __point.color || 'black';
                                        const arrowSize = 24;
                                        const direction = startX < x ? 1 : -1;

                                        ctx.strokeStyle = color;
                                        ctx.lineWidth = 4.5;
                                        ctx.beginPath();
                                        ctx.moveTo(startX, arrowY);
                                        ctx.lineTo(x - direction * 12, arrowY);
                                        ctx.stroke();

                                        ctx.fillStyle = color;
                                        ctx.beginPath();
                                        ctx.moveTo(x, arrowY);
                                        ctx.lineTo(x - direction * arrowSize, arrowY - 10);
                                        ctx.lineTo(x - direction * arrowSize, arrowY + 10);
                                        ctx.closePath();
                                        ctx.fill();
                                    }
                                    ctx.lineWidth = 2;
                                    ctx.fillStyle = 'black';
                                    ctx.font = '14px Arial';
                                    ctx.textAlign = 'left';
                                    ctx.fillText(this.__date, this.__scx_, this.__scy_)
                                    ctx.fill();
                                }
                            }
                            t.mouseDownListener = (x, y) => {
                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                const yvalue = this.grid.Ywc(y)
                                if (!__point) {

                                } else {
                                }

                            }
                            t.close = () => {

                            }
                            t.mouseMoveListener = (x, y) => {

                                this.__scx_ = x;

                                this.__scy_ = y;
                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                const yvalue = this.grid.Ywc(y)
                                if (__point)
                                    __point.bjb = tx;
                            }
                            t.mouseUpListener = async (x, y) => {

                            }

                            pt.wb(t)
                        },
                        move: () => {
                        }
                    });

                this.___pointMenuItems = m;
                return m;

            }

            async setOptionListeners(bx, by, pt) {
                let m = this.getOptionsMenuList(pt)
                pt.wb(null)
                smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
                let active = false;
                let t = {
                    id: 'plot-options-menu' + Math.random(),
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                }
                t.draw = (grid, ctx) => {
                    active = true;

                    if (smenu)
                        smenu.draw(ctx, grid)
                }
                t.close = () => {
                    smenu = null;
                }
                t.mouseDownListener = (x, y) => {
                    if (!active)
                        return;
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    }
                    else {
                        smenu = null;
                        setTimeout(() => {
                            this.clk_drag(pt)
                        }, 500)
                    }
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }

                }
                t.mouseUpListener = async (x, y) => {
                    if (!active)
                        return;

                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)

                    }
                    smenu = null;

                },

                    setTimeout(() => {
                        pt.wb(t)

                    }, 200)

            }
            updateScatteredDataToHandleIncrememtn() {
                this.scatterData.points = this.scatterData.points.map((point, index) => {
                    return {
                        ...point,
                        name: point.x,
                        x: index
                    };
                });

            }
            async setMoveListeners(pt, x, y) {

                pt.setMessage(" Move... ")

                let m = await exec('baja/plate/views/move-plot.js', pt, this, x, y)
                pt.wb({
                    id: 'plot-move',
                    priority: true,
                    mouseMoveListener: m.mouseMoveListener,
                    mouseUpListener: m.mouseUpListener,
                    mouseDownListener: m.mouseDownListener,
                    draw: m.draw,
                    menuManager: m.menuManager
                })
            }

            updateHighlightTab(px, py) {
                highlightTab = this.isMouseInTab(px, py);
            }

            showMenuBar(v) {
                this.showTopMenuBar = false;
            }

            buildCurrentConfig() {
                this.config_script.plot = {
                    lineColor: this.lineColor,
                    pointColor: this.pointColor,
                    errorBarColor: 'lightBlue',
                    w: this.w,
                    h: this.h,
                    x: this.x,
                    y: this.y,
                    fitScaleToData: this.fitScaleToData
                };
                return this.config_script;
            }

            toJSON() {
                return {
                    name: this.name,
                    uid: this.uid,
                    startDate: this.startDate,
                    endDate: this.endDate,
                    isBackground: this.isBackground,
                    maximize: this.maximize,
                    theme: this.theme,
                    backgroundColor: this.backgroundColor,
                    scaleType: this.scaleType,
                    mode: this.mode,
                    scatterData: this.scatterData,
                    lineEquations: this.lineEquations.map(eq => {

                        if (typeof eq.mfunction === 'function') {
                            return {
                                ...eq,
                                mfunction: encodeURIComponent(eq.mfunction.toString())
                            };
                        }
                        return eq;
                    }),
                    showEquation: this.showEquation,
                    config_script: this.buildCurrentConfig(),
                    grid: {
                        xmin: this.grid.xmin,
                        xmax: this.grid.xmax,
                        ymin: this.grid.ymin,
                        ymax: this.grid.ymax,
                    },
                    x: this.x,
                    y: this.y,
                    w: this.w,
                    h: this.h,
                    type: this.type,
                    lineColor: this.lineColor,
                    pointColor: this.pointColor,
                    errorBarColor: this.errorBarColor,
                    fitScaleToData: this.fitScaleToData,

                    formatAxis: typeof this.formatAxis === 'function'
                        ? btoa(this.formatAxis.toString())
                        : null,
                };
            }

            draw(graph) {
                this.drawPlot(graph, graph.canvas.getCTX(), this.grid, true)
            }

            drawProgressBar(ctx, progress, xi, yi, w, h) {

                const barHeight = 30;
                const barWidth = w * 0.8;
                const x = xi + (w - barWidth) / 2;
                const y = yi + (h - barHeight) / 2;

                const clampedProgress = Math.max(0, Math.min(progress, 100));

                const fillWidth = (clampedProgress / 100) * barWidth;

                console.log(' x ' + x + " y " + y)

                ctx.fillStyle = '#ddd';
                ctx.fillRect(x, y, barWidth, barHeight);

                ctx.fillStyle = 'rgb(0, 87, 163)';
                ctx.fillRect(x, y, fillWidth, barHeight);

                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, barWidth, barHeight);

                ctx.fillStyle = '#000';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.round(clampedProgress)}%`, x + barWidth / 2, y + barHeight / 2);
            }

            setWidth(_w) {
                this.w = _w;
            }
            setHeight(_h) {
                this.h = _h;
            }

            selectIt() {
                this.highlight()
            }

            deselectAll() {
                this._highlight = false;
                this.showTopMenuBar = false;
                this.unhighlight();
            }

            drawScatter(_grid, ctx, hideAxis) {
                if (this.fitScaleToData) {
                    const xmin = Math.min(...this.scatterData.points.map(p => p.x));
                    const xmax = Math.max(...this.scatterData.points.map(p => p.x));
                    const ymin = Math.min(...this.scatterData.points.map(p => p.y));
                    const ymax = Math.max(...this.scatterData.points.map(p => p.y));
                    _grid.zoom(xmin, xmax, ymin, ymax);
                    _grid.rescale();

                }
                const graph = _grid;
                const xmin = 0;
                const xmax = this.scatterData.points.length;
                let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                if (validPoints.length === 0) {
                    console.warn("No valid points to calculate ymax.");
                    return null;
                }

                const maxX = Math.max(...this.scatterData.points.map(p => p.x));
                const maxY = Math.max(...this.scatterData.points.map(p => p.y));

                this.grid.setymax(maxY);
                this.grid.setymin(0)
                this.grid.setxmin(0);
                this.grid.rescale();
                ctx.fillStyle = 'rgba(55, 55, 255, 0.3)';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 20;

                let sw = graph.screenWidth(this.w)
                if (this.aspectRatio === 1) {
                    this.grid.width = sw;
                    this.grid.height = sw;
                }
                this.grid.rescale();
                ctx.lineWidth = 3;
                ctx.setLineDash([2, 6]);
                ctx.strokeStyle = 'lightGray';

                ctx.beginPath();
                ctx.moveTo((this.grid.X(this.grid.xmin)), (this.grid.Y(this.grid.ymin)));
                ctx.lineTo((this.grid.X(this.grid.xmax)), (this.grid.Y(this.grid.ymin)));
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(this.grid.X(this.grid.xmin), this.grid.Y(this.grid.ymin));
                ctx.lineTo(this.grid.X(this.grid.xmin), this.grid.Y(this.grid.ymax));
                ctx.stroke();
                ctx.shadowBlur = 1;
                ctx.lineWidth = 1;

                if (!hideAxis)
                    this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                const labels = this.scatterData.points.map(point => point.name);
                const data = this.scatterData.points.map(point => point.y);

                if (labels.length > 0 && !this.grid.xmax)
                    this.grid.setxmax(labels.length)

                this.grid.rescale();
                if (this._highlight) {

                    const rectWidth = this.grid.width;
                    const rectHeight = this.grid.height;
                    const cornerSize = 20;
                    const rectX = this.grid.xi - cornerSize / 2;
                    const rectY = this.grid.yi - cornerSize / 2;
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                    ctx.shadowOffsetX = 4;
                    ctx.shadowOffsetY = 4;

                    let radius = 10;
                    let centerX_crescent = graph.X(this.grid.xi + this.grid.width) + 10 - radius - 5;
                    let centerY_crescent = graph.Y(this.grid.yi) + 10 - radius - 5;
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                    ctx.shadowOffsetX = 4;
                    ctx.shadowOffsetY = 4;
                    ctx.beginPath();
                    ctx.arc(centerX_crescent, centerY_crescent, radius, 0, Math.PI * 2, false);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(centerX_crescent + radius / 2, centerY_crescent, radius, 0, Math.PI * 2, false);
                    ctx.fillStyle = 'rgba(20, 20, 100, 0.3)';
                    ctx.fill();

                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;

                    ctx.shadowColor = "transparent";
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                } else {
                    ctx.shadowBlur = 0;
                }

                for (let point of this.scatterData.points) {
                    const xwidth = this.grid.screenWidth(this.w);
                    const xScreen = this.grid.X(point.x);
                    const yScreen = this.grid.Y(point.y);
                    let highlightColor = 'navy';

                    for (let { pattern, color } of this.highlightPatterns) {
                        pattern = stringToPattern(pattern);
                        if (pattern.test(point.name)) {
                            highlightColor = color;
                            break;
                        }
                    }

                    if (!highlightColor && this.hide_unhighlighted) {
                        return;
                    }

                    if (highlightColor) {
                        ctx.fillStyle = "green";
                        if (point.color) ctx.fillStyle = point.color;
                    } else {
                        if (point.color) ctx.fillStyle = point.color;
                    }

                    ctx.beginPath();
                    ctx.lineWidth = 1;

                    if (point.isSelected) {
                        ctx.fillStyle = 'magenta';
                        ctx.lineWidth = 10;
                    }

                    ctx.arc(xScreen, yScreen, 3, 0, 2 * Math.PI);
                    ctx.fill();

                    if (xwidth > 300 && this.showPointLabels) {
                        const randomSignX = Math.random() < 0.5 ? -1 : 1;
                        const randomSignY = Math.random() < 0.5 ? -1 : 1;
                        let randoff = Math.random() * 50 + 50;
                        if (!point.offfsetx) {
                            point.offfsetx = randomSignX * (Math.random() * randoff) - 10;
                        }
                        if (!point.offfsety) {
                            point.offfsety = randomSignY * (Math.random() * randoff) - 10;
                        }
                        const textX = xScreen + point.offfsetx;
                        const textY = yScreen + point.offfsety;
                        if (highlightColor) ctx.fillStyle = highlightColor;
                        else ctx.fillStyle = 'rgba(100,30,90,0.7)';
                        ctx.font = "12px Arial";
                        ctx.fillText(point.name, textX - 10, textY);
                        ctx.stroke();

                        const textMetrics = ctx.measureText(point.name);
                        const textMidX = textX + textMetrics.width / 2;
                        const textMidY = textY - 6;
                        ctx.strokeStyle = 'rgba(250,250,250,0.3)';
                        ctx.fillStyle = 'rgba(250,250,250,0.3)';
                        ctx.beginPath();
                        ctx.moveTo(xScreen, yScreen);
                        ctx.lineTo(textMidX, textMidY);
                        ctx.stroke();
                    }
                }

                if (this.grid.width > 100) {

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'lightGray';
                    ctx.font = "20px Arial";
                    if (this.name && this.name.toLowerCase() != 'untitled')
                        ctx.fillText(`${this.name}`, this.grid.xi + (this.grid.width / 2), this.grid.yi - 5);

                    ctx.fillStyle = 'transparent';
                    ctx.font = "12px Arial";
                    ctx.stroke();
                }

                if (this.drawErrors) {
                    this.drawWithErrorBars(ctx, {
                        errorBarXKey: 'x',
                        errorBarYKey: 'average',
                        errorBarKey: 'stdDev'
                    });
                }

                ctx.shadowBlur = 0;
                ctx.shadowColor = "transparent";

            }

            getFirstPointDate() {
                return formatTime(this.grid.xmin, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
            }
            getLastPointDate() {
                return formatTime(this.grid.xmax, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
            }

            static buildWaterfallFromGroups(wells, opts = {}) {
                const {
                    groupKey = 'category',
                    sequence = undefined,
                    totals = [],
                    treatAsExpense = [],
                    balanceTo = undefined,
                } = opts;

                const arr = Array.isArray(wells) ? wells : [];
                if (!arr.length) return [];

                const norm = s => String(s || '').trim().toLowerCase();

                const getLabel = (w) => {
                    if (typeof groupKey === 'function') {
                        return String(groupKey(w) ?? '');
                    }

                    const g = w?.group ?? {};
                    return String(g[groupKey] ?? '');
                };

                const sums = new Map();
                const seenOrder = [];
                for (const w of arr) {
                    const label = getLabel(w);
                    if (!label) continue;
                    const v = Number(w?.value);
                    if (!Number.isFinite(v)) continue;

                    if (!sums.has(label)) {
                        sums.set(label, 0);
                        seenOrder.push(label);
                    }
                    sums.set(label, sums.get(label) + v);
                }

                const totalSet = new Set(totals.map(norm));
                const expenseSet = new Set(treatAsExpense.map(norm));

                let balancingItem = null;
                if (balanceTo && balanceTo.label) {
                    const targetLabel = balanceTo.label;
                    const targetNorm = norm(targetLabel);
                    const children = Array.isArray(balanceTo.children) ? balanceTo.children : [];
                    const otherLabel = balanceTo.otherLabel || 'Other';

                    if (sums.has(targetLabel)) {
                        const totalAbs = Math.abs(Number(sums.get(targetLabel)) || 0);

                        let childAbsSum = 0;
                        for (const c of children) {
                            if (sums.has(c)) {
                                childAbsSum += Math.abs(Number(sums.get(c)) || 0);
                            }
                        }

                        const diff = totalAbs - childAbsSum;

                        if (diff > 1e-9) {
                            balancingItem = { name: otherLabel, value: -Math.abs(diff) };

                            if (sums.has(otherLabel)) {
                                sums.set(otherLabel, (Number(sums.get(otherLabel)) || 0) + balancingItem.value);
                            } else {
                                sums.set(otherLabel, balancingItem.value);
                                seenOrder.push(otherLabel);
                            }
                        }

                        if (!totalSet.has(targetNorm)) {
                            totalSet.add(targetNorm);
                        }
                    }
                }

                const remaining = seenOrder.filter(L => !sequence || !sequence.includes(L));
                const ordered = sequence ? [...sequence, ...remaining] : seenOrder.slice();

                const points = [];
                for (const label of ordered) {
                    if (!sums.has(label)) continue;

                    const isTotal = totalSet.has(norm(label));
                    if (isTotal) {
                        points.push({ name: label, isTotal: true });
                        continue;
                    }

                    let v = Number(sums.get(label)) || 0;
                    if (expenseSet.has(norm(label))) {
                        v = -Math.abs(v);
                    }
                    points.push({ name: label, y: v });
                }

                return points;
            }

            plotWaterfall(graph, ctx) {

                const items = (this.scatterData && Array.isArray(this.scatterData.points))
                    ? this.scatterData.points.slice()
                    : [];
                if (!items.length) {
                    this.broken = true;
                    return null;
                }

                let running = 0;
                const bars = [];
                for (let i = 0; i < items.length; i++) {
                    const p = items[i] || {};
                    const isTotal = !!p.isTotal;
                    const dy = Number(p.y);
                    let start, end, value;

                    if (isTotal) {
                        start = 0;
                        end = running;
                        value = end - start;
                    } else {
                        start = running;
                        end = running + (Number.isFinite(dy) ? dy : 0);
                        value = end - start;
                        running = end;
                    }

                    bars.push({
                        i,
                        name: (typeof p.name === 'string' ? p.name : (p.name?.toString() || `#${i + 1}`)),
                        color: p.color || null,
                        isTotal,
                        start, end, value
                    });
                }

                let ymin = 0, ymax = 0;
                for (const b of bars) {
                    ymin = Math.min(ymin, b.start, b.end);
                    ymax = Math.max(ymax, b.start, b.end);
                }
                if (ymin === ymax) ymax = ymin + 1;

                const n = bars.length;
                const xmin = -0.5;
                const xmax = n - 0.5;

                if (!this.grid || !this.grid.rescale) {
                    const xi = graph.X(this.x);
                    const yi = graph.Y(this.y);
                    const sw = graph.screenWidth(this.w);
                    const sh_height = graph.screenHeight ? graph.screenHeight(this.h) : sw;

                    this.grid = new MGrid(xi, yi, sw, sh_height);
                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                } else {
                    graph.rescale();

                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);

                    const sw = graph.screenWidth(this.w);
                    const sh_height = graph.screenHeight ? graph.screenHeight(this.h) : sw;

                    if (this.aspectRatio === 1) {
                        this.grid.width = sw;
                        this.grid.height = sw;
                    } else {
                        this.grid.width = sw;
                        this.grid.height = sh_height;
                    }

                    this.setxmax?.(xmax);
                    this.setymax?.(ymax);

                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                }

                const grid = this.grid;

                const catWidthWorld = 1;
                const barWorld = 0.66 * catWidthWorld;
                const halfBarWorld = barWorld / 2;
                const connectorWidth = 2;

                const baseLineY = grid.Y(0);

                const fmt = (val) => {
                    const abs = Math.abs(val);
                    if (abs >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1) + 'B';
                    if (abs >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
                    if (abs >= 1_000) return (val / 1_000).toFixed(1) + 'K';
                    if (!Number.isInteger(val)) return val.toFixed(2);
                    return String(val);
                };

                const positiveFill = (b) => b.color || 'rgba(20,120,20,0.85)';
                const negativeFill = (b) => b.color || 'rgba(180,40,40,0.85)';
                const totalFill = (b) => b.color || 'rgba(32,82,149,0.90)';
                const borderColor = 'rgba(0,0,0,0.25)';

                const pickPx = (fallback) => {
                    try {
                        if (typeof getZoomedFontSize === 'function') {
                            return Math.max(8, Number(getZoomedFontSize(this, fallback)) || fallback);
                        }
                    } catch { }
                    return fallback;
                };
                const labelFontPx = pickPx(12);
                const catFontPx = pickPx(11);

                ctx.save();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#222';
                ctx.beginPath();
                ctx.moveTo(grid.X(xmin), baseLineY);
                ctx.lineTo(grid.X(xmax), baseLineY);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.lineWidth = 1;
                ctx.strokeStyle = borderColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                for (let i = 0; i < bars.length; i++) {
                    const b = bars[i];

                    const cx = i;
                    const xL = grid.X(cx - halfBarWorld);
                    const xR = grid.X(cx + halfBarWorld);

                    const y0 = grid.Y(b.start);
                    const y1 = grid.Y(b.end);
                    const top = Math.min(y0, y1);
                    const h = Math.abs(y1 - y0);

                    const fillStyle = b.isTotal ? totalFill(b) : (b.value >= 0 ? positiveFill(b) : negativeFill(b));

                    ctx.fillStyle = fillStyle;
                    ctx.strokeStyle = borderColor;
                    const wpx = Math.max(1, xR - xL);
                    const hpx = Math.max(1, h);

                    if (typeof ctx.roundRect === 'function') {
                        ctx.beginPath();
                        ctx.roundRect(xL, top, wpx, hpx, 3);
                        ctx.fill();
                        ctx.stroke();
                    } else {
                        ctx.fillRect(xL, top, wpx, hpx);
                        ctx.strokeRect(xL, top, wpx, hpx);
                    }

                    if (i > 0 && !b.isTotal) {
                        const prev = bars[i - 1];
                        const yPrevEnd = grid.Y(prev.end);
                        const yThisStart = grid.Y(b.start);
                        const xConnL = grid.X(prev.i + halfBarWorld);
                        const xConnR = grid.X(b.i - halfBarWorld);

                        ctx.save();
                        ctx.lineWidth = connectorWidth;
                        ctx.strokeStyle = 'rgba(100,100,100,0.6)';
                        ctx.setLineDash([5, 4]);
                        ctx.beginPath();
                        ctx.moveTo(xConnL, yPrevEnd);
                        ctx.lineTo(xConnR, yThisStart);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.restore();
                    }

                    ctx.save();
                    ctx.font = `${labelFontPx}px Arial`;
                    ctx.fillStyle = 'black';
                    const valText = fmt(b.isTotal ? b.end : b.value);
                    const midX = (xL + xR) / 2;
                    const labelPadding = 4;
                    const labelY = (b.end >= b.start)
                        ? (top - labelPadding)
                        : (top + h + labelFontPx);
                    ctx.fillText(valText, midX, labelY);
                    ctx.restore();

                    ctx.save();
                    ctx.font = `${catFontPx}px Arial`;
                    ctx.fillStyle = 'black';

                    const basePad = 8;
                    const catY = Math.max(baseLineY + basePad, grid.Y(grid.ymin) - 18);
                    const midXText = (xL + xR) / 2;

                    ctx.translate(midXText, catY);
                    ctx.rotate(-Math.PI / 4);
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';
                    ctx.fillText(b.name, 0, 0);
                    ctx.restore();

                    b.isInside = (mx, my) => {
                        const left = Math.min(xL, xR);
                        const right = Math.max(xL, xR);
                        const tpx = Math.min(y0, y1);
                        const bpx = Math.max(y0, y1);
                        return (mx >= left + 15 && mx <= right - 15 && my >= tpx - 5 && my <= bpx + 5);
                    };
                }

                ctx.restore();

                ctx.save();
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 1;
                for (let i = 0; i < n; i++) {
                    const x = grid.X(i);
                    ctx.beginPath();
                    ctx.moveTo(x, baseLineY - 3);
                    ctx.lineTo(x, baseLineY + 3);
                    ctx.stroke();
                }
                ctx.restore();

                if (typeof this.drawAxisLabels === 'function') {
                    this.drawAxisLabels(ctx, grid, this.x_axis_label || '', this.y_axis_label || '');
                }

                if (this.name && this.name !== 'untitled') {
                    ctx.fillStyle = 'lightGray';
                    ctx.font = '21px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(this.name, grid.xi + grid.width / 2, this.grid.yi - 10);
                }

                if (this._highlight) {

                    if (this.resizing) {

                        const rect = normalizedRect(this.grid.xi, this.grid.yi, this.grid.width, this.grid.height);
                        const sw = rect.w, sh_height = rect.h;
                        const base = Math.min(sw, sh_height);
                        if (base >= 20) {
                            const size = Math.max(10, Math.min(24, Math.round(base * 0.12)));
                            const pad = Math.max(2, Math.round(size * 0.2));

                            const brx = rect.x + rect.w - pad;
                            const bry = rect.y + rect.h - pad;

                            const active = !!(this.resizing || this.__resizing);
                            if (this.showMenuBar)
                                drawResizeHandle(ctx, brx + 40, bry + 40, size, true, this.____callout);

                            const hbSize = size + pad;
                            this.__resizeHandle = {
                                x: brx - hbSize,
                                y: bry - hbSize,
                                w: hbSize,
                                h: hbSize,
                            };
                        }
                    } else {

                        if (this.showMenuBar) {

                            const rect = normalizedRect(this.grid.xi, this.grid.yi, this.grid.width, this.grid.height);
                            const sw = rect.w, sh_height = rect.h;
                            const base = Math.min(sw, sh_height);
                            if (base >= 20) {
                                const size = Math.max(10, Math.min(24, Math.round(base * 0.12)));
                                const pad = Math.max(2, Math.round(size * 0.2));

                                const brx = rect.x + rect.w - pad;
                                const bry = rect.y + rect.h - pad;

                                const active = !!(this.resizing || this.__resizing);
                                drawResizeHandle(ctx, brx + 40, bry + 40, size, false, this.____callout);

                                const hbSize = size + pad;
                                this.__resizeHandle = {
                                    x: brx - hbSize,
                                    y: bry - hbSize,
                                    w: hbSize,
                                    h: hbSize,
                                };
                            }
                        }
                    }

                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "transparent";
                }

                return true;
            }

            static buildWaterfallFromGroups(wells, opts = {}) {
                const {

                    valueResolver = null,
                    labelResolver = null,
                    groupKey = 'category',

                    pairLabelResolver = null,
                } = opts;

                const arr = Array.isArray(wells) ? wells.slice() : [];
                if (!arr.length) return [];

                const clean = (s) => (s == null ? '' : String(s).trim());

                const getLabelFromGroup = (w) => {
                    if (!groupKey) return '';
                    if (typeof groupKey === 'function') return clean(groupKey(w));
                    const g = w?.group ?? {};
                    return (g && typeof g === 'object' && !Array.isArray(g) && Object.prototype.hasOwnProperty.call(g, groupKey))
                        ? clean(g[groupKey])
                        : '';
                };

                const getLabel = (w) => {
                    if (!w) return '';

                    if (typeof labelResolver === 'function') {
                        const v = labelResolver(w);
                        if (v != null && String(v).trim() !== '') return clean(v);
                    }

                    const viaGroup = getLabelFromGroup(w);
                    if (viaGroup) return viaGroup;

                    if (typeof w.value === 'string' && w.value.trim() !== '') return w.value.trim();
                    if (typeof w.label === 'string' && w.label.trim() !== '') return w.label.trim();
                    if (typeof w.name === 'string' && w.name.trim() !== '') return w.name.trim();
                    if (typeof w.position === 'string' && w.position.trim() !== '') return w.position.trim();
                    return '';
                };

                const getVal = (w) => {
                    if (!w) return null;

                    if (typeof valueResolver === 'function') {
                        const v = valueResolver(w);
                        return v === undefined ? null : v;
                    }

                    const v = w.value;
                    const n = Number(v);
                    if (Number.isFinite(n)) return n;

                    const candidates = [
                        w?.amount, w?.numericValue, w?.val, w?.v,
                        w?.properties?.value, w?.obj?.value, w?.score
                    ];
                    for (const c of candidates) {
                        const nn = Number(c);
                        if (Number.isFinite(nn)) return nn;
                    }

                    return v ?? null;
                };

                const buildPairLabel = (L, R, lx, ly) => {
                    if (typeof pairLabelResolver === 'function') {
                        const custom = pairLabelResolver(L, R, lx, ly);
                        if (custom != null && String(custom).trim() !== '') return String(custom);
                    }
                    if (lx && ly && lx !== ly) return `${lx} \u2192 ${ly}`;
                    return lx || ly || '';
                };

                const mid = Math.ceil(arr.length / 2);
                const firstHalf = arr.slice(0, mid);
                const secondHalf = arr.slice(mid);

                const points = firstHalf.map((left, index) => {
                    const right = secondHalf[index] || null;
                    const lx = getLabel(left);
                    const ly = right ? getLabel(right) : '';
                    return {
                        x: getVal(left),
                        xuid: left?.uid ?? null,
                        y: right ? getVal(right) : null,
                        yuid: right?.uid ?? null,
                        stdDev: right?.stdDev ?? null,
                        name: buildPairLabel(left, right, lx, ly)
                    };
                });

                return points;
            }

            drawPlot(pt, ctx, fixed) {

                const resolvePointTheme = (baseTheme, point) => {
                    let t = baseTheme || {};
                    if (point.themeKey && typeof point.themeKey === "string" && THEMES?.[point.themeKey]) {
                        t = deepMerge(t, THEMES[point.themeKey]);
                    }
                    if (point.theme && typeof point.theme === "object") {
                        t = deepMerge(t, point.theme);
                    }
                    return t;
                };

                const clampFontLocal = (pt, fonts, base) => {
                    const min = fonts?.min ?? 12;
                    const max = fonts?.max ?? 20;
                    const z = (typeof getZoomedFontSize === "function")
                        ? getZoomedFontSize.call(this, pt, base)
                        : base;
                    return Math.max(min, Math.min(max, Math.round(z)));
                };

                const rgbaFromHex = (hex, alpha = 0.10) => {
                    if (!hex || typeof hex !== "string") return `rgba(162,223,154,${alpha})`;
                    const h = hex.replace("#", "").trim();
                    const parse = (i) => parseInt(h.slice(i, i + 2), 16);
                    let r, g, b;
                    if (h.length === 3) {
                        r = parseInt(h[0] + h[0], 16);
                        g = parseInt(h[1] + h[1], 16);
                        b = parseInt(h[2] + h[2], 16);
                    } else {
                        r = parse(h.length >= 2 ? 0 : 0);
                        g = parse(h.length >= 4 ? 2 : 0);
                        b = parse(h.length >= 6 ? 4 : 0);
                    }
                    return `rgba(${r},${g},${b},${alpha})`;
                };

                const wrapThenTruncate = (ctx, text, maxW) => {
                    const words = String(text || "").split(/\s+/);
                    const lines = [];
                    let line = "";

                    for (const w of words) {
                        const test = line ? `${line} ${w}` : w;

                        if (ctx.measureText(test).width <= maxW) {
                            line = test;
                        } else {

                            if (line) lines.push(line);

                            if (ctx.measureText(w).width > maxW) {
                                lines.push(ellipsize(ctx, w, maxW));
                                line = "";
                            } else {
                                line = w;
                            }
                        }
                    }

                    if (line) lines.push(line);

                    for (let i = 0; i < lines.length; i++) {
                        if (ctx.measureText(lines[i]).width > maxW) {
                            lines[i] = ellipsize(ctx, lines[i], maxW);
                        }
                    }

                    return lines;
                };

                const ellipsize = (c, text, maxW) => {
                    if (c.measureText(text).width <= maxW) return text;
                    const E = "…";
                    let lo = 0, hi = text.length;
                    while (lo < hi) {
                        const mid = (lo + hi + 1) >> 1;
                        const s = text.slice(0, mid) + E;
                        (c.measureText(s).width <= maxW) ? (lo = mid) : (hi = mid - 1);
                    }
                    return (lo <= 0) ? E : text.slice(0, lo) + E;
                };

                const drawRoundedRect = (ctx, x, y, w, h, r) => {
                    ctx.beginPath();
                    ctx.moveTo(x + r, y);
                    ctx.arcTo(x + w, y, x + w, y + h, r);
                    ctx.arcTo(x + w, y + h, x, y + h, r);
                    ctx.arcTo(x, y + h, x, y, r);
                    ctx.arcTo(x, y, x + w, y, r);
                    ctx.closePath();
                };

                const drawHandlesIfSelected = (point) => {
                    if (!point || !point.isSelected) return;
                    const start_tm = formatTime(point.startX, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);
                    const end_tm = formatTime(point.x, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);
                    const common = { shadow: SH.handle, master: SH_ENABLED, selected: false, highlight: false };
                    const color = colors.handle || baseColor;

                    if (this.___hover && point.hoverHandle && this.___hover.handle) {
                        const active = this.___hover.handle;
                        if (active === "end") {
                            drawVerticalHandle(ctx, point.end_scx, point.scy, color, { ...common, selected: true, highlight: true }, end_tm);
                            drawVerticalHandle(ctx, point.start_scx, point.scy, color, common, start_tm);
                        } else {
                            drawVerticalHandle(ctx, point.start_scx, point.scy, color, { ...common, selected: true, highlight: true }, start_tm);
                            drawVerticalHandle(ctx, point.end_scx, point.scy, color, common, end_tm);
                        }
                    } else {
                        drawVerticalHandle(ctx, point.start_scx, point.scy, color, common, start_tm);
                        drawVerticalHandle(ctx, point.end_scx, point.scy, color, common, end_tm);
                    }

                    const prevIsInside = point.isInside;
                    point.isInside = (mx, my, verticalOffset = 3) => {
                        const w = 6, h = Math.max(18, HANDLE_H);
                        const startLeft = point.start_scx - w / 2, startTop = point.scy - h / 2;
                        const endLeft = point.end_scx - w / 2, endTop = point.scy - h / 2;
                        const overStart = (mx >= startLeft && mx <= startLeft + w && my >= startTop && my <= startTop + h);
                        const overEnd = (mx >= endLeft && mx <= endLeft + w && my >= endTop && my <= endTop + h);
                        return prevIsInside(mx, my, verticalOffset) || overStart || overEnd;
                    };

                    point.handleHitTest = (mx, my) => {
                        const w = 6, h = Math.max(18, HANDLE_H);
                        const startLeft = point.start_scx - w / 2, startTop = point.scy - h / 2;
                        const endLeft = point.end_scx - w / 2, endTop = point.scy - h / 2;
                        if (mx >= startLeft && mx <= startLeft + w && my >= startTop && my <= startTop + h) return "start";
                        if (mx >= endLeft && mx <= endLeft + w && my >= endTop && my <= endTop + h) return "end";
                        return null;
                    };
                };

                const theme = getThemeSafe(this);
                const colors = (theme && theme.colors) || {};
                const fonts = (theme && theme.fonts) || {};
                const sizes = (theme && theme.sizes) || {};
                const effects = (theme && theme.effects) || {};
                const surfaces = (theme && theme.surfaces) || {};
                const states = (theme && theme.states) || {};

                const panel = (surfaces && surfaces.panel) || {};
                const plotSizes = (sizes && sizes.plot) || { minTiny: 15, minSmall: 35, insetX: 25, insetY: 25 };
                const panelShadow = panel.shadow || null;
                const resizeShadow = panel.resizing && panel.resizing.shadow || null;
                const highlightShadow = panel.highlight && panel.highlight.shadow || null;
                const brokenState = (states && states.broken) || { fill: "red", overlay: "rgba(100,30,90,0.7)" };

                const previousLabels = [];
                const graph = pt.grid;

                const clampFont = (base) => {
                    const min = (fonts.min != null) ? fonts.min : 14;
                    const max = (fonts.max != null) ? fonts.max : 18;
                    const z = (typeof getZoomedFontSize === "function")
                        ? getZoomedFontSize.call(this, pt, base)
                        : base;
                    return Math.max(min, Math.min(max, Math.round(z)));
                };
                if (this.w <= 0.11) this.w = 1;
                if (this.h <= 0.11) this.h = 1;

                const STROKE_W = effects.strokeWidth ?? 1;

                const strokeColor = colors.line || surfaces.panel || "#2a6b2a";

                const SH = effects.shadows || {};
                const SH_ENABLED = !!SH.enabled;
                const SH_LINE = SH.line || null;
                const SH_ARROW = SH.arrow || SH_LINE || null;
                const SH_LABEL = SH.label || (surfaces.panel && surfaces.panel.shadow) || null;
                const SH_TEXT = SH.text || null;

                const TICK_H = sizes.tickHeight ?? 20;
                const HEAD_SIZE = sizes.headSize ?? 25;
                const PAD_X = sizes.paddingX ?? 8;
                const PAD_Y = sizes.paddingY ?? 4;
                const RADIUS = sizes.radius ?? 8;
                const LABEL_GAP = sizes.labelGap ?? 4;
                const ARROW_LEN = sizes.arrowHeadLength ?? 10;
                const ARROW_W = sizes.arrowHeadWidth ?? 16;
                const TICK_BASE_OFF = sizes.tickBaseOffset ?? 20;
                const HANDLE_H = sizes.handleHeight ?? 26;
                const textColor = colors.text || "#222";
                const labelBg = surfaces.panel?.bg || "#fff";
                const arrowFill = rgbaFromHex(colors.line || "#2a6b2a", 1);

                let sw = graph.screenWidth(this.w);
                let sh_height = graph.screenHeight(this.h) + 10;

                if (sw < plotSizes.minTiny || sh_height < plotSizes.minTiny) return;
                if (sw < plotSizes.minSmall && sh_height < plotSizes.minSmall) return;

                const grid = this.grid;

                const axis = this.grid.Y(this.grid.ymin);

                clearShadow(ctx);

                const isFixed = (typeof fixed !== "undefined") ? !!fixed : (this.fixed === true);
                if (!isFixed) {
                    const insetX = (plotSizes.insetX != null) ? plotSizes.insetX : 25;
                    const insetY = (plotSizes.insetY != null) ? plotSizes.insetY : 25;
                    grid.setInset(insetX, insetY);
                    grid.xi = graph.X(this.x);
                    grid.yi = graph.Y(this.y);
                    grid.height = sh_height;
                    grid.width = sw;
                }
                grid.rescale();
                graph.rescale();

                if (this.broken || !this.scatterData || !this.scatterData.points) {
                    ctx.fillStyle = brokenState.fill || "red";
                    ctx.fillRect(grid.xi, grid.yi, grid.width, grid.height);
                    ctx.fillStyle = brokenState.overlay || "rgba(100,30,90,0.7)";
                    ctx.font = (brokenState.textFont || "22px Arial");
                    ctx.fillText(brokenState.text || "", grid.xi + 8, grid.yi + 28);

                    return;
                }

                const drawLineAndArrow = (leftX, rightX, y, arrowX) => {

                    ctx.lineWidth = STROKE_W;
                    ctx.strokeStyle = strokeColor;

                    ctx.beginPath();
                    ctx.moveTo(leftX.from, y);
                    ctx.lineTo(leftX.to, y);
                    applyShadow(ctx, SH_LINE, SH_ENABLED);
                    ctx.stroke();
                    clearShadow(ctx);

                    ctx.beginPath();
                    ctx.moveTo(rightX.from, y);
                    ctx.lineTo(rightX.to, y);
                    applyShadow(ctx, SH_LINE, SH_ENABLED);
                    ctx.stroke();
                    clearShadow(ctx);

                    ctx.beginPath();
                    ctx.moveTo(arrowX, y);
                    ctx.lineTo(arrowX - ARROW_LEN, y - ARROW_W / 2);
                    ctx.lineTo(arrowX - ARROW_LEN, y + ARROW_W / 2);
                    ctx.closePath();
                    ctx.fillStyle = arrowFill;
                    applyShadow(ctx, SH_ARROW, SH_ENABLED);
                    ctx.fill();
                    clearShadow(ctx);
                };

                const drawSelectedLineAndArrow = (leftX, rightX, y, arrowX) => {
                    ctx.lineWidth = STROKE_W;
                    ctx.strokeStyle = strokeColor;

                    ctx.beginPath();
                    ctx.moveTo(leftX.from, y);
                    ctx.lineTo(leftX.to, y);
                    applySelectShadow(ctx, SH_LINE, SH_ENABLED);
                    ctx.stroke();
                    clearShadow(ctx);

                    ctx.beginPath();
                    ctx.moveTo(rightX.from, y);
                    ctx.lineTo(rightX.to, y);
                    applySelectShadow(ctx, SH_LINE, SH_ENABLED);
                    ctx.stroke();
                    clearShadow(ctx);

                    ctx.beginPath();
                    ctx.moveTo(arrowX, y);
                    ctx.lineTo(arrowX - ARROW_LEN, y - ARROW_W / 2);
                    ctx.lineTo(arrowX - ARROW_LEN, y + ARROW_W / 2);
                    ctx.closePath();
                    ctx.fillStyle = arrowFill;
                    applySelectShadow(ctx, SH_ARROW, SH_ENABLED);
                    ctx.fill();
                    clearShadow(ctx);
                };

                if (this.drawBackground && !this.isMaximized()) {

                    const bg = this.backgroundColor || panel.bg || "transparent";

                    if (this.__resizing || this.__moving) {
                        const rezFill = (panel.resizing && panel.resizing.fill) || "rgba(240,151,227,0.10)";
                        applyShadow(ctx, resizeShadow, true);
                        ctx.fillStyle = rezFill;
                        ctx.fillRect(graph.X(this.x), graph.Y(this.y), sw, sh_height);
                        clearShadow(ctx);
                    }

                    ctx.fillStyle = bg;
                    ctx.fillRect(grid.xi, grid.yi, grid.width, grid.height);
                    clearShadow(ctx);

                    if (panel.border && panel.border.width) {
                        ctx.lineWidth = panel.border.width;
                        ctx.strokeStyle = panel.border.color || "rgba(0,0,0,0.15)";

                        ctx.strokeRect(grid.xi, grid.yi, grid.width, grid.height);
                    }

                    if (this._highlight && highlightShadow) {
                        applyShadow(ctx, highlightShadow, true);

                        ctx.fillStyle = "transparent";
                        ctx.fillRect(grid.xi, grid.yi, grid.width, grid.height);
                        clearShadow(ctx);
                    }
                }

                ctx.shadowBlur = 0;
                if (!MGrid.GP && this.showTopMenuBar) {

                    if (this.isMaximized()) {
                    } else {
                        if (this.showTopMenuBar)
                            this.drawButtons(ctx, pt.grid)
                    }
                }
                if (this.progress) {
                    if (this.progress === 100) {
                        this.progress = null;
                    }
                    this.drawProgressBar(ctx, this.progress, (this.grid.xi), (this.grid.yi), sw, sh_height);
                    return;
                }
                ctx.textAlign = 'left';
                if (this.type && this.type === 'dose-response') {
                    this.plotBarChartDoseResponse(graph, ctx)
                } else
                    if (this.type && this.type.startsWith('bar')) {
                        if (this.type.indexOf('aggregate') > 0) {
                            this.plotBarChart(graph, ctx);
                        } else
                            this.plotBarChart(graph, ctx);
                        if (this.lineEquations != null && this.lineEquations.length > 0) {
                            this.plotLines(grid, ctx, true);
                        }
                        return;
                    } else if (this.type && this.type === 'pie') {
                        this.pieChart(graph, ctx)
                    } else if (this.type === scatter) {
                        this.drawScatter(graph, ctx)
                    } else if (this.type && (this.type === 'waterfall' || this.type === 'bar-waterfall')) {
                        this.plotWaterfall(graph, ctx);
                        if (this.lineEquations != null && this.lineEquations.length > 0) {
                            this.plotLines(this.grid, ctx);
                        }
                        return;
                    }
                    else if (this.type && this.type === 'timeline') {
                        const cymin = this.grid.Y(this.grid.ymin);

                        if (typeof this.startDate === 'string' || typeof this.endDate === 'string') {
                            this.startDate = new Date(this.startDate);
                            this.endDate = new Date(this.endDate);
                        }

                        this.normalizeTimePoints(graph);

                        if (this.maximize || cymin > ctx.canvas.height && this.grid.yi < (ctx.canvas.height / 2)) {
                            this.grid.height = ctx.canvas.height + 100;
                            this.grid.yi = -10;
                            this.showTopMenuBar = false;
                        }
                        if (this.grid.height < 0) {
                            this.grid.height = pt.worldHeight(500)
                        }

                        this.grid.rescale();
                        const tickBaseY = ctx.canvas.height;
                        const timelinePoints = this.scatterData.points;
                        if (!timelinePoints || timelinePoints.length === 0) return;
                        const grid = this.grid;
                        grid.setInset(100, 50)
                        const xMin = this.grid.xmin;
                        const xMax = this.grid.xmax;
                        grid.rescale();
                        if (this.name && this.name !== 'untitled') {
                            ctx.save();
                            ctx.font = '28px Arial';
                            ctx.fillStyle = 'rgba(200, 200, 200, 0.15)';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';

                            const centerX = this.grid.xi + this.grid.width / 2;
                            const centerY = this.grid.yi + this.grid.height + (100);

                            ctx.translate(centerX, centerY);

                            ctx.fillText(this.name, 0, 0);

                            ctx.restore();
                        }

                        for (let pl of pt.m_plots) {
                            if (pl != this) {
                                const last_D = pl.getLastPointDate();
                                const start_D = pl.getFirstPointDate();
                                const tstart_D = this.getFirstPointDate();

                                if (tstart_D > start_D && tstart_D < last_D) {

                                    const xw = (timeToX(this.startDate, pl.grid.xmin, pl.grid.xmax, start_D, last_D));
                                    const plxsc = pl.grid.X(xw);

                                    const startX = this.grid.X(this.grid.xmin);
                                    const startY = this.grid.yi;
                                    const endX = plxsc;
                                    const endY = pl.grid.Y(0);
                                    ctx.shadowColor = 'transparent';
                                    ctx.shadowBlur = 0;
                                    ctx.shadowOffsetX = 0;
                                    ctx.shadowOffsetY = 0;
                                    ctx.strokeStyle = 'lightGray';

                                    ctx.shadowColor = 'transparent';
                                    ctx.shadowBlur = 0;
                                    ctx.shadowOffsetX = 0;
                                    ctx.shadowOffsetY = 0;
                                    ctx.strokeStyle = 'lightBlue';
                                    ctx.lineWidth = 1;
                                    ctx.beginPath();
                                    ctx.moveTo(startX, startY);
                                    ctx.lineTo(endX, endY);
                                    ctx.stroke();
                                }
                                if (this.endDate > start_D && this.endDate < last_D) {
                                    const xw = timeToX(this.endDate, pl.grid.xmin, pl.grid.xmax, start_D, last_D);
                                    const plxsc = pl.grid.X(xw);
                                    const startX = this.grid.X(this.grid.xmax);
                                    const startY = this.grid.yi;
                                    const endX = plxsc;
                                    const endY = pl.grid.Y(0);
                                    ctx.shadowColor = 'transparent';
                                    ctx.shadowBlur = 0;
                                    ctx.shadowOffsetX = 0;
                                    ctx.shadowOffsetY = 0;

                                    ctx.strokeStyle = 'lightGray';
                                    ctx.lineWidth = 1;
                                    ctx.beginPath();
                                    ctx.moveTo(startX, startY);
                                    ctx.lineTo(endX, endY);
                                    ctx.stroke();
                                }

                            }
                        }

                        const timelineY = grid.Y(grid.ymin);

                        ctx.save();
                        ctx.lineWidth = 3;
                        ctx.strokeStyle = '#222';
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 2;

                        ctx.beginPath();
                        ctx.moveTo(grid.X(xMin), timelineY);
                        ctx.lineTo(grid.X(xMax), timelineY);
                        ctx.stroke();
                        const baseTheme = getThemeSafe(this);

                        ctx.restore();
                        const maxY = Math.max(...this.scatterData.points.map(p => p.y));
                        ctx.beginPath();
                        ctx.moveTo(grid.X(xMin), timelineY);
                        ctx.lineTo(grid.X(xMax), timelineY);
                        ctx.stroke();
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        let found_one_highlighted = false;
                        const drawnLabelBoxes = [];

                        const behindLabels = [];
                        const labelLayer = [];

                        const sortedPoints = this.scatterData.points;

                        const paddingX = 10, paddingY = 2, radius = 8, fontSize = 16;
                        const pxPerHour = this.grid.X(this.grid.xmin + 1) - this.grid.X(this.grid.xmin);
                        const pxPerDay = pxPerHour * 24;
                        const pxPerMonth = pxPerDay * 30;
                        const pxPerYear = pxPerMonth * 12;
                        const showHours = pxPerHour >= 15;
                        const showDays = pxPerDay >= 10;
                        const showMonths = pxPerMonth >= 45;
                        const showYears = pxPerYear >= 10;

                        for (const point of sortedPoints) {
                            if (point.y > this.grid.ymax) {
                                point.y = this.grid.ymax;
                            }

                            let x = grid.X(point.x);
                            let y = grid.Y(point.y);

                            if (this.maximize || cymin > ctx.canvas.height && this.grid.yi < (ctx.canvas.height / 2)) {
                                if (y - 200 < 0) {
                                    y = 400;
                                }
                            }

                            let showpoint = true;
                            if (point.showHours) {
                                if (showHours) {
                                    showpoint = true;
                                } else {
                                    showpoint = false;
                                }
                            }
                            if (point.showDays) {
                                if (showDays || showHours) {
                                    showpoint = true;
                                } else {
                                    showpoint = false;
                                }
                            }
                            if (point.showHours) {
                                if (showHours) {
                                    showpoint = true;
                                } else {
                                    showpoint = false;
                                }
                            }
                            if (point.showMonths) {
                                if (showMonths) {
                                    showpoint = true;
                                } else {
                                    showpoint = false;
                                }
                            } if (point.showYears) {
                                if (showYears) {
                                    showpoint = true;
                                } else {
                                    showpoint = false;
                                }
                            }

                            if (y > ctx.canvas.height)
                                showpoint = false;

                            if (showpoint && (
                                point.type === 'interval'
                                    ? (
                                        (() => {
                                            const a = Math.min(point.startX, point.x);
                                            const b = Math.max(point.startX, point.x);
                                            return !(b < grid.xmin || a > grid.xmax);
                                        })()
                                    )
                                    : (point.x >= grid.xmin && point.x <= grid.xmax)
                            )) {
                                if (x >= 0 && x <= ctx.canvas.width || point.startX) {
                                    ctx.font = '11px Arial';
                                    const labelText = typeof point.name === 'string' ? point.name : point.name?.toString() || '';
                                    const labelWidth = ctx.measureText(labelText).width;
                                    const labelHeight = 20;
                                    let labelBox = {
                                        x: x - labelWidth / 2,
                                        y: this.grid.Y(this.grid.ymin),
                                        w: labelWidth,
                                        h: labelHeight
                                    };

                                    previousLabels.push({
                                        x: labelBox.x,
                                        y: y,
                                        w: labelBox.w,
                                        h: labelBox.h
                                    });

                                    let label = point.name;
                                    let pxwidth10 = grid.worldWidth(50)
                                    if (point.ref) {
                                        const ob = pt.getPlateWithUID(point.ref);
                                        if (ob && ob != this) {
                                            drawArrowFromPoint(ctx, point, ob, this.grid, pt);
                                        }
                                    }
                                    if (point.x < this.xmin || point.x > this.xmax || (point.startX !== undefined && (point.startX < this.xmin || point.startX > this.xmax))) {

                                    } else {
                                        ctx.beginPath();
                                        ctx.lineWidth = 1;
                                        if (point.isSelected) {
                                            ctx.fillStyle = getRandomColor();
                                        } else {

                                            ctx.beginPath();
                                            ctx.lineWidth = 1;
                                            ctx.fillStyle = 'darkGray';
                                            if (point.color) {
                                                ctx.fillStyle = point.color;
                                            }
                                        }
                                        if (typeof label === 'number') {
                                            if (Number.isInteger(label) && Math.abs(label) >= 1000) {
                                                const absValue = Math.abs(label);
                                                if (absValue >= 1_000_000_000) {
                                                    label = (label / 1_000_000_000).toFixed(1) + 'B';
                                                } else if (absValue >= 1_000_000) {
                                                    label = (label / 1_000_000).toFixed(1) + 'M';
                                                } else {
                                                    label = (label / 1_000).toFixed(1) + 'K';
                                                }
                                            } else if (!Number.isInteger(label)) {
                                                label = label.toFixed(2);
                                            }
                                        }
                                        if (point.highlight) {
                                            if (point.drawHighlight) {
                                                point.drawHighlight(pt, ctx);
                                            } else {
                                                ctx.shadowColor = 'blue';
                                                ctx.shadowBlur = 10;
                                            }
                                        }
                                        ctx.font = '10px Arial';
                                        ctx.textAlign = 'center';
                                        ctx.textBaseline = 'bottom';
                                        ctx.fillStyle = point.color || 'navy';
                                        if (point.type === "interval") {
                                            const deepMerge = (a = {}, b = {}) => {
                                                const out = { ...a };
                                                for (const k in b) {
                                                    const v = b[k];
                                                    out[k] = (v && typeof v === "object" && !Array.isArray(v))
                                                        ? deepMerge(a[k] || {}, v)
                                                        : v;
                                                }
                                                return out;
                                            };

                                            const drawLabel = (rectX, rectY, rectW, rectH, lines, midX, midY, lineHeight, fontSize) => {
                                                const parenFontPx = 9;
                                                const normalFontPx = fontSize;
                                                const bgPadX = 8;
                                                const bgPadY = 5;

                                                ctx.fillStyle = textColor;
                                                ctx.textBaseline = "middle";

                                                const safeLines = lines.map(s => String(s ?? ""));
                                                const joined = safeLines.join("\n");
                                                const singleLineJoined = safeLines.join(" ");

                                                const tailMatch = joined.match(/(\s*\([^)]*\))\s*$/s);
                                                const hasTrailing = !!tailMatch;
                                                const smallStartPos = hasTrailing
                                                    ? (tailMatch.index ?? (joined.length - tailMatch[0].length))
                                                    : null;

                                                const measureLineWidth = (segments) => {
                                                    let total = 0;
                                                    for (const seg of segments) {
                                                        ctx.font = `${seg.small ? parenFontPx : normalFontPx}px ${fontFamily}`;
                                                        total += ctx.measureText(seg.text).width;
                                                    }
                                                    return total;
                                                };

                                                const drawMixedLine = (segments, centerX, y) => {
                                                    const totalW = measureLineWidth(segments);
                                                    let x = centerX - totalW / 2;

                                                    for (const seg of segments) {
                                                        ctx.font = `${seg.small ? parenFontPx : normalFontPx}px ${fontFamily}`;
                                                        const w = ctx.measureText(seg.text).width;
                                                        ctx.fillText(seg.text, x, y);
                                                        x += w;
                                                    }
                                                };

                                                const lineStarts = [];
                                                {
                                                    let pos = 0;
                                                    for (let i = 0; i < safeLines.length; i++) {
                                                        lineStarts.push(pos);
                                                        pos += safeLines[i].length;
                                                        if (i !== safeLines.length - 1) pos += 1;
                                                    }
                                                }

                                                let maxRenderedLineWidth = 0;
                                                for (let i = 0; i < safeLines.length; i++) {
                                                    const text = safeLines[i];
                                                    let segments;

                                                    if (!hasTrailing) {
                                                        segments = [{ text, small: false }];
                                                    } else {
                                                        const start = lineStarts[i];
                                                        const end = start + text.length;

                                                        if (end <= smallStartPos) {
                                                            segments = [{ text, small: false }];
                                                        } else if (start >= smallStartPos) {
                                                            segments = [{ text, small: true }];
                                                        } else {
                                                            const localSmallStart = smallStartPos - start;
                                                            const prefix = text.slice(0, localSmallStart);
                                                            const suffix = text.slice(localSmallStart);
                                                            segments = [];
                                                            if (prefix) segments.push({ text: prefix, small: false });
                                                            if (suffix) segments.push({ text: suffix, small: true });
                                                        }
                                                    }

                                                    maxRenderedLineWidth = Math.max(maxRenderedLineWidth, measureLineWidth(segments));
                                                }

                                                const textHeight = lineHeight * safeLines.length;
                                                const neededRectW = maxRenderedLineWidth + bgPadX * 2;
                                                const neededRectH = textHeight + bgPadY * 2;

                                                ctx.font = `${normalFontPx}px ${fontFamily}`;
                                                const fullLabelWidth = ctx.measureText(singleLineJoined).width;
                                                const availableInnerWidth = rectW - bgPadX * 2;
                                                const useRotatedLabel = fullLabelWidth > availableInnerWidth && fullLabelWidth < 300;

                                                if (useRotatedLabel) {
                                                    const rotatedW = fullLabelWidth + bgPadX * 2;
                                                    const rotatedH = normalFontPx + bgPadY * 2;

                                                    ctx.save();
                                                    ctx.translate(midX, midY);
                                                    ctx.rotate(-Math.PI / 4);

                                                    ctx.fillStyle = labelBg;
                                                    drawRoundedRect(ctx, -rotatedW / 2, -rotatedH / 2, rotatedW, rotatedH, RADIUS);
                                                    applyShadow(ctx, SH_LABEL, SH_ENABLED);
                                                    ctx.fill();
                                                    clearShadow(ctx);

                                                    ctx.fillStyle = textColor;
                                                    ctx.textAlign = "center";
                                                    ctx.textBaseline = "middle";
                                                    applyShadow(ctx, SH_TEXT, SH_ENABLED);
                                                    ctx.font = `${normalFontPx}px ${fontFamily}`;
                                                    ctx.fillText(singleLineJoined, 0, 0);
                                                    clearShadow(ctx);

                                                    ctx.restore();
                                                    return;
                                                }

                                                const finalRectW = Math.max(rectW, neededRectW);
                                                const finalRectH = Math.max(rectH, neededRectH);
                                                const finalRectX = midX - finalRectW / 2;
                                                const finalRectY = midY - finalRectH / 2;

                                                ctx.fillStyle = labelBg;
                                                drawRoundedRect(ctx, finalRectX, finalRectY, finalRectW, finalRectH, RADIUS);
                                                applyShadow(ctx, SH_LABEL, SH_ENABLED);
                                                ctx.fill();
                                                clearShadow(ctx);

                                                ctx.fillStyle = textColor;
                                                ctx.textAlign = "left";
                                                ctx.textBaseline = "middle";
                                                applyShadow(ctx, SH_TEXT, SH_ENABLED);

                                                for (let i = 0; i < safeLines.length; i++) {
                                                    const text = safeLines[i];
                                                    const y = midY - textHeight / 2 + i * lineHeight + lineHeight / 2;

                                                    if (!hasTrailing) {
                                                        drawMixedLine([{ text, small: false }], midX, y);
                                                        continue;
                                                    }

                                                    const start = lineStarts[i];
                                                    const end = start + text.length;

                                                    if (end <= smallStartPos) {
                                                        drawMixedLine([{ text, small: false }], midX, y);
                                                        continue;
                                                    }

                                                    if (start >= smallStartPos) {
                                                        drawMixedLine([{ text, small: true }], midX, y);
                                                        continue;
                                                    }

                                                    const localSmallStart = smallStartPos - start;
                                                    const prefix = text.slice(0, localSmallStart);
                                                    const suffix = text.slice(localSmallStart);

                                                    const segments = [];
                                                    if (prefix) segments.push({ text: prefix, small: false });
                                                    if (suffix) segments.push({ text: suffix, small: true });

                                                    drawMixedLine(segments, midX, y);
                                                }

                                                clearShadow(ctx);
                                            };

                                            const setIntervalHitTest = (startX, endX, yMid, rect, arrowX) => {
                                                point.isInside = (mx, my, vOff = 3) => {
                                                    const yTop = yMid - vOff, yBot = yMid + vOff;
                                                    const overLine = (my >= yTop && my <= yBot && mx >= startX && mx <= endX);
                                                    const arrowBox = { x: arrowX - ARROW_LEN, y: yMid - ARROW_W / 2, w: ARROW_LEN, h: ARROW_W };
                                                    const overArrow = (mx >= arrowBox.x && mx <= arrowBox.x + arrowBox.w && my >= arrowBox.y && my <= arrowBox.y + arrowBox.h);
                                                    const overText = (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h);
                                                    return overLine || overArrow || overText;
                                                };
                                            };

                                            const theme = resolvePointTheme(baseTheme, point);

                                            const { colors = {}, fonts = {}, sizes = {}, effects = {}, surfaces = {} } = theme;

                                            const xsc = this.grid.X(point.startX);
                                            const ysc = y;

                                            const mainFontSize = fonts.sizeMain ?? 12;
                                            const smallFontSize = fonts.sizeSmall ?? 11;
                                            const fontFamily = fonts.family || "Arial";
                                            const baseColor = point.color || strokeColor;

                                            const fontMainPx = clampFontLocal.call(this, pt, fonts, mainFontSize);
                                            ctx.font = `${fontMainPx}px ${fontFamily}`;

                                            const tickBaseY = ctx.canvas.height - TICK_BASE_OFF;

                                            const { startDate, endDate } = this;
                                            const totalCanvasRange = xMax - xMin;
                                            const totalTimeRange = endDate.getTime() - startDate.getTime();
                                            const normStartX = (point.startX - xMin) / totalCanvasRange;
                                            const normEndX = (point.x - xMin) / totalCanvasRange;
                                            const startTs = startDate.getTime() + normStartX * totalTimeRange;
                                            const endTs = startDate.getTime() + normEndX * totalTimeRange;
                                            const timeLabel = formatDurationLabel(startTs, endTs);
                                            const fullLabel = point.name ? `${point.name} ${timeLabel}` : timeLabel;

                                            const inMax = this.maximize || (cymin > ctx.canvas.height && this.grid.yi < (ctx.canvas.height / 2));
                                            const tipY = inMax ? (tickBaseY - TICK_H - 4) : (timelineY - TICK_H - 4 - 1 + 16);
                                            const tipX = x;
                                            const dx = tipX - xsc;
                                            const dy = tipY - ysc;
                                            const angle = Math.atan2(dy, dx);
                                            const headLenX = HEAD_SIZE * Math.cos(angle);

                                            const lineEndX = tipX - headLenX;
                                            const xLength = lineEndX - xsc;
                                            const shaftStartX = tipX - (headLenX + xLength);

                                            const canvasLeft = 0, canvasRight = ctx.canvas.width;
                                            const visibleLineStart = Math.max(xsc, canvasLeft);
                                            const visibleLineEnd = Math.min(lineEndX, canvasRight);

                                            const visibleLineLength = visibleLineEnd - visibleLineStart;

                                            if ((point.name || timeLabel) && visibleLineLength > 0) {
                                                const midX = visibleLineStart + visibleLineLength / 2;
                                                const midY = inMax ? (ysc - (tipY / 4)) : ysc;

                                                ctx.save();

                                                let fontSize = clampFontLocal.call(this, pt, fonts, smallFontSize);
                                                const MIN_FONT = 8;
                                                const maxTextW = 25 + (inMax
                                                    ? Math.max(Math.abs(lineEndX - shaftStartX))
                                                    : (visibleLineLength - PAD_X * 2));

                                                let labelLines = [];
                                                let textW = 0;
                                                let textH = 0;
                                                let candidate = "";

                                                if (maxTextW > 0) {
                                                    while (true) {
                                                        ctx.font = `${fontSize}px ${fontFamily}`;
                                                        candidate = ellipsize(ctx, fullLabel, maxTextW);
                                                        const wrapped = wrapThenTruncate(ctx, fullLabel, maxTextW);
                                                        const lh = fontSize + 2;
                                                        const longest = wrapped.length ? Math.max(...wrapped.map(line => ctx.measureText(line).width)) : 0;

                                                        if (longest <= maxTextW || fontSize <= MIN_FONT) {
                                                            labelLines = wrapped;
                                                            textW = longest;
                                                            textH = lh * wrapped.length;
                                                            break;
                                                        }
                                                        const overBy = longest - maxTextW;
                                                        fontSize -= (overBy > maxTextW * 0.25) ? 2 : 1;
                                                        if (fontSize < MIN_FONT) fontSize = MIN_FONT;

                                                    }
                                                }

                                                const midYAdjusted = Math.min(midY, tickBaseY - textH - 4);
                                                const rect = {
                                                    x: midX - textW / 2 - PAD_X,
                                                    y: midYAdjusted - textH / 2 - PAD_Y,
                                                    w: textW + PAD_X * 2,
                                                    h: textH + PAD_Y * 2
                                                };
                                                const boxCenterY = rect.y + rect.h / 2;

                                                point.start_scx = shaftStartX;
                                                point.end_scx = lineEndX;
                                                point.scy = boxCenterY;

                                                drawHandlesIfSelected(point);

                                                if (boxCenterY < tickBaseY) {

                                                    if (point.isSelected) {
                                                        drawSelectedLineAndArrow(
                                                            { from: shaftStartX, to: rect.x - LABEL_GAP },
                                                            { from: rect.x + rect.w + LABEL_GAP, to: lineEndX },
                                                            boxCenterY,
                                                            lineEndX
                                                        );
                                                    } else {
                                                        drawLineAndArrow(
                                                            { from: shaftStartX, to: rect.x - LABEL_GAP },
                                                            { from: rect.x + rect.w + LABEL_GAP, to: lineEndX },
                                                            boxCenterY,
                                                            lineEndX
                                                        );
                                                    }

                                                    if (labelLines.length) {

                                                        drawLabel(rect.x, rect.y, rect.w, rect.h, labelLines, midX, midYAdjusted, fontSize, fontSize);

                                                    }
                                                }

                                                setIntervalHitTest(point.start_scx, point.end_scx, boxCenterY, rect, lineEndX);

                                                ctx.restore();
                                            }
                                        } else if (point.type === 'lanechange') {
                                            let tt = point.txt;
                                            if (this.isMaximized()) {

                                            } else {

                                                if (point.themeKey) {
                                                    lanechange(point, ctx, this.grid.X(point.startX), this.grid.Y(point.startY), this.grid.X(point.x), this.grid.Y(point.y), point.themeKey);

                                                } else {

                                                    lanechange(point, ctx, this.grid.X(point.startX), this.grid.Y(point.startY), this.grid.X(point.x), this.grid.Y(point.y),
                                                        { tension: 0.01, width: 5, dash: [6, 4], shadow: { blur: 8 }, text: tt, textBg: "white" });

                                                }
                                            }
                                        }

                                        else
                                            if (point.type === 'progress') {
                                                let baseColor = 'rgba(20,100,10,0.4)';
                                                if (point.color) {
                                                    baseColor = point.color;
                                                }
                                                const lineWidth = 4;
                                                const headSize = 7;
                                                const tickHeight = 4;
                                                ctx.font = '14px Arial';
                                                ctx.lineWidth = 1;

                                                const xsc = this.grid.X(point.startX);
                                                const ysc = this.grid.Y(point.y);
                                                const nameWidth = ctx.measureText(point.name).width;
                                                const nameHeight = 14;
                                                let labelY = timelineY - tickHeight - 4;
                                                let filenameY = labelY - 1;
                                                const adjustedFilenameY = y;
                                                const tipX = x;
                                                const tipY = adjustedFilenameY;
                                                const dx = tipX - xsc;
                                                const dy = tipY - ysc;
                                                const angle = Math.atan2(dy, dx);
                                                const headLengthX = headSize * Math.cos(angle);
                                                const headLengthY = headSize * Math.sin(angle);
                                                const lineEndX = tipX - headLengthX;
                                                const lineEndY = tipY - headLengthY;
                                                const xLength = lineEndX - xsc;
                                                const yLength = lineEndY - ysc;
                                                const isXInverted = Math.sign(xLength) !== Math.sign(Math.cos(angle));
                                                const isYInverted = Math.sign(yLength) !== Math.sign(Math.sin(angle));

                                                const shaftStartX = tipX - (headLengthX + xLength);
                                                const shaftStartY = tipY - (headLengthY + yLength);
                                                const arrowHeadLength = lineWidth * 13.5;
                                                const arrowHeadWidth = lineWidth * 12.8;

                                                const totalCanvasRange = xMax - xMin;
                                                const totalTimeRange = this.endDate.getTime() - this.startDate.getTime();
                                                const normalizedStartX = (point.startX - xMin) / totalCanvasRange;
                                                const normalizedEndX = (point.x - xMin) / totalCanvasRange;

                                                const startTimestamp = this.startDate.getTime() + normalizedStartX * totalTimeRange;
                                                const endTimestamp = this.startDate.getTime() + normalizedEndX * totalTimeRange;

                                                const diffMinutes = (endTimestamp - startTimestamp) / (1000 * 60);
                                                const diffHours = diffMinutes / 60;
                                                const diffDays = diffHours / 24;
                                                let timeLabel = '';
                                                if (diffDays >= 7) timeLabel = `${(diffDays / 7).toFixed(1)} wk`;
                                                else if (diffDays >= 1) timeLabel = `${diffDays.toFixed(1)} d`;
                                                else if (diffHours >= 1) timeLabel = `${diffHours.toFixed(1)} h`;
                                                else timeLabel = `${diffMinutes.toFixed(1)} min`;

                                                const midX = (xsc + lineEndX) / 2;
                                                let midY = (ysc + lineEndY) / 2;
                                                const fullLabel = point.name ? `${point.name} (${timeLabel})` : timeLabel;
                                                let labelText = fullLabel;
                                                const maxWidth = Math.abs(xLength) - paddingX * 2;
                                                if ((point.name || timeLabel) && ctx.measureText(labelText).width > maxWidth) {
                                                    const paddingX = 10, paddingY = 6, radius = 6, fontSize = 11;
                                                    ctx.save();
                                                    ctx.font = `${fontSize}px Arial`;
                                                    ctx.textAlign = 'center';
                                                    ctx.textBaseline = 'middle';

                                                    const ellipsis = '...';
                                                    let truncated = labelText;
                                                    while (ctx.measureText(truncated + ellipsis).width > maxWidth && truncated.length > 0) {
                                                        truncated = truncated.slice(0, -1);
                                                    }
                                                    labelText = truncated + ellipsis;

                                                    const textWidth = ctx.measureText(labelText).width;
                                                    const textHeight = fontSize;

                                                    let midYAdjusted = midY;
                                                    const verticalStep = fontSize + 4;
                                                    let attempts = 0;
                                                    const maxAttempts = 10;

                                                    while (attempts < maxAttempts) {
                                                        const labelBox = {
                                                            x: midX - textWidth / 2,
                                                            y: midYAdjusted - textHeight / 2,
                                                            w: textWidth,
                                                            h: textHeight + paddingY * 2
                                                        };

                                                        const collision = drawnLabelBoxes.some(prev =>
                                                            !(labelBox.x + labelBox.w < prev.x ||
                                                                labelBox.x > prev.x + prev.w ||
                                                                labelBox.y + labelBox.h < prev.y ||
                                                                labelBox.y > prev.y + prev.h)
                                                        );

                                                        if (!collision) {
                                                            drawnLabelBoxes.push(labelBox);
                                                            break;
                                                        }

                                                        midYAdjusted -= verticalStep;
                                                        attempts++;
                                                    }

                                                    const boxCenterY = midYAdjusted;
                                                    ctx.strokeStyle = baseColor;
                                                    ctx.lineWidth = 10;

                                                    ctx.shadowColor = 'rgba(7, 4, 4, 0.5)';
                                                    ctx.shadowBlur = 4;
                                                    ctx.shadowOffsetX = 3;
                                                    ctx.shadowOffsetY = 3;

                                                    ctx.beginPath();
                                                    ctx.moveTo(shaftStartX, boxCenterY);
                                                    ctx.lineTo(midX - textWidth / 2 - paddingX, boxCenterY);
                                                    ctx.stroke();

                                                    ctx.beginPath();
                                                    ctx.moveTo(midX + textWidth / 2 + paddingX, boxCenterY);
                                                    ctx.lineTo(lineEndX - arrowHeadLength, boxCenterY);
                                                    ctx.stroke();

                                                    ctx.beginPath();
                                                    ctx.moveTo(lineEndX, boxCenterY);
                                                    ctx.lineTo(lineEndX - arrowHeadLength, boxCenterY - arrowHeadWidth / 2);
                                                    ctx.lineTo(lineEndX - arrowHeadLength, boxCenterY + arrowHeadWidth / 2);
                                                    ctx.closePath();
                                                    ctx.fillStyle = baseColor;
                                                    ctx.fill();

                                                    ctx.shadowColor = 'transparent';
                                                    ctx.shadowBlur = 0;
                                                    ctx.shadowOffsetX = 0;
                                                    ctx.shadowOffsetY = 0;

                                                    ctx.beginPath();
                                                    ctx.moveTo(midX - textWidth / 2 - paddingX + radius, boxCenterY - textHeight / 2 - paddingY);
                                                    ctx.arcTo(midX + textWidth / 2 + paddingX, boxCenterY - textHeight / 2 - paddingY, midX + textWidth / 2 + paddingX, boxCenterY + textHeight / 2 + paddingY, radius);
                                                    ctx.arcTo(midX + textWidth / 2 + paddingX, boxCenterY + textHeight / 2 + paddingY, midX - textWidth / 2 - paddingX, boxCenterY + textHeight / 2 + paddingY, radius);
                                                    ctx.arcTo(midX - textWidth / 2 - paddingX, boxCenterY + textHeight / 2 + paddingY, midX - textWidth / 2 - paddingX, boxCenterY - textHeight / 2 - paddingY, radius);
                                                    ctx.arcTo(midX - textWidth / 2 - paddingX, boxCenterY - textHeight / 2 - paddingY, midX + textWidth / 2 + paddingX, boxCenterY - textHeight / 2 - paddingY, radius);
                                                    ctx.closePath();

                                                    point.start_scx = shaftStartX;
                                                    point.end_scx = lineEndX;
                                                    point.scy = boxCenterY;

                                                    ctx.fill();
                                                    ctx.strokeStyle = baseColor;
                                                    ctx.lineWidth = 2;
                                                    ctx.stroke();

                                                    ctx.fillStyle = 'white';
                                                    if (point.textColor) {
                                                        ctx.fillStyle = point.textColor;
                                                    }
                                                    ctx.fillText(labelText, midX, boxCenterY);
                                                    ctx.restore();

                                                } else {

                                                    ctx.beginPath();
                                                    ctx.moveTo(shaftStartX, lineEndY);
                                                    ctx.lineTo(lineEndX, lineEndY);
                                                    ctx.strokeStyle = baseColor;
                                                    ctx.lineWidth = lineWidth;
                                                    ctx.stroke();

                                                    point.start_scx = shaftStartX;
                                                    point.end_scx = lineEndX;
                                                    point.scy = lineEndY;

                                                    ctx.beginPath();
                                                    ctx.moveTo(lineEndX, lineEndY);
                                                    ctx.lineTo(lineEndX - arrowHeadLength, lineEndY - arrowHeadWidth / 2);
                                                    ctx.lineTo(lineEndX - arrowHeadLength, lineEndY + arrowHeadWidth / 2);
                                                    ctx.closePath();
                                                    ctx.fillStyle = baseColor;
                                                    ctx.fill();
                                                }

                                            }
                                        if (point.highlight) {
                                            ctx.shadowColor = 'transparent';
                                            ctx.shadowBlur = 0;
                                            ctx.shadowOffsetX = 0;
                                            ctx.shadowOffsetY = 0;
                                        }
                                        if (point.type === 'document') {
                                            if (cymin > ctx.canvas.height) {

                                                const iconWidth = 20;
                                                const iconHeight = 25;
                                                const foldSize = 6;

                                                const x = this.grid.X(point.x);
                                                const timelineY = tickBaseY;
                                                const topY = timelineY - iconHeight - 40;

                                                ctx.save();
                                                ctx.translate(x - iconWidth / 2, topY);

                                                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                                                ctx.shadowBlur = 4;
                                                ctx.shadowOffsetX = 2;
                                                ctx.shadowOffsetY = 2;

                                                ctx.beginPath();
                                                ctx.moveTo(0, 0);
                                                ctx.lineTo(iconWidth - foldSize, 0);
                                                ctx.lineTo(iconWidth, foldSize);
                                                ctx.lineTo(iconWidth, iconHeight);
                                                ctx.lineTo(0, iconHeight);
                                                ctx.closePath();
                                                ctx.fillStyle = point.color || 'darkGray';
                                                ctx.fill();

                                                ctx.shadowColor = 'transparent';
                                                ctx.shadowBlur = 0;
                                                ctx.shadowOffsetX = 0;
                                                ctx.shadowOffsetY = 0;

                                                ctx.beginPath();
                                                ctx.moveTo(iconWidth - foldSize, 0);
                                                ctx.lineTo(iconWidth - foldSize, foldSize);
                                                ctx.lineTo(iconWidth, foldSize);
                                                ctx.closePath();
                                                ctx.fillStyle = 'white';
                                                ctx.fill();

                                                ctx.restore();

                                                const tickHeight = 10;
                                                ctx.strokeStyle = point.color || 'darkgreen';
                                                ctx.lineWidth = 2;
                                                ctx.beginPath();
                                                ctx.moveTo(x, timelineY);
                                                ctx.lineTo(x, timelineY - tickHeight);
                                                ctx.stroke();

                                                ctx.fillStyle = point.color || 'darkgreen';
                                                ctx.textAlign = 'center';
                                                ctx.textBaseline = 'bottom';

                                                ctx.font = '14px Arial';
                                                ctx.fillText(`${point.name}`, x, topY - 4);

                                                if (point.filename) {
                                                    ctx.font = '12px Arial';
                                                    ctx.fillText(`${point.filename}`, x, topY - 20);
                                                }

                                            } else {

                                                const iconWidth = 20;
                                                const iconHeight = 25;
                                                const foldSize = 6;
                                                const topY = timelineY - iconHeight - 10;

                                                ctx.save();
                                                ctx.translate(x - iconWidth / 2, topY);

                                                ctx.shadowColor = 'rgb(0, 157, 255)';
                                                ctx.shadowBlur = 4;
                                                ctx.shadowOffsetX = 2;
                                                ctx.shadowOffsetY = 2;

                                                ctx.beginPath();
                                                ctx.moveTo(0, 0);
                                                ctx.lineTo(iconWidth - foldSize, 0);
                                                ctx.lineTo(iconWidth, foldSize);
                                                ctx.lineTo(iconWidth, iconHeight);
                                                ctx.lineTo(0, iconHeight);
                                                ctx.closePath();
                                                ctx.fillStyle = point.color || 'darkGray';
                                                ctx.fill();

                                                ctx.shadowColor = 'transparent';
                                                ctx.shadowBlur = 0;
                                                ctx.shadowOffsetX = 0;
                                                ctx.shadowOffsetY = 0;

                                                ctx.beginPath();
                                                ctx.moveTo(iconWidth - foldSize, 0);
                                                ctx.lineTo(iconWidth - foldSize, foldSize);
                                                ctx.lineTo(iconWidth, foldSize);
                                                ctx.closePath();
                                                ctx.fillStyle = 'white';
                                                ctx.fill();

                                                ctx.restore();

                                                const tickHeight = 10;
                                                ctx.strokeStyle = point.color || 'darkgreen';
                                                ctx.lineWidth = 2;
                                                ctx.beginPath();
                                                ctx.moveTo(x, timelineY);
                                                ctx.lineTo(x, timelineY - tickHeight);
                                                ctx.stroke();

                                                ctx.fillStyle = point.color || 'darkgreen';
                                                ctx.textAlign = 'center';
                                                ctx.textBaseline = 'bottom';
                                                ctx.font = '14px Arial';
                                                ctx.fillText(`${point.name}`, x, topY - 4);
                                                if (point.filename) {
                                                    ctx.font = '12px Arial';
                                                    ctx.fillText(`${point.filename}`, x, topY - 20);
                                                }
                                            }
                                        }
                                        else if (point.type === 'milestone') {
                                            const TL_THEME = this.theme || THEMES.timeline_default || THEMES["classic-light"];
                                            const { colors: TLC = {}, fonts: TLF = {}, sizes: TLS = {}, effects: TLE = {}, surfaces: TLSURF = {} } = TL_THEME;
                                            const SH = TLE?.shadows || {};
                                            const SH_ENABLED = !!SH.enabled;
                                            const cText = TLC.text ?? "#222";
                                            const cLine = TLC.line ?? "#999";
                                            const cArrow = TLC.arrow ?? cLine;
                                            const cPanelBg = TLC.panelBg ?? TLC.background ?? "rgba(255,255,255,0.95)";
                                            const cPanelBorder = TLC.panelBorder ?? "rgba(0,0,0,0.15)";

                                            const fontFamily = TLF.family ?? "Arial";
                                            const baseFontSize = (typeof TLF.size === "number") ? TLF.size : 12;
                                            const fontWeight = TLF.weight ?? 500;

                                            const lineWidth = (typeof TLS.lineWidth === "number") ? TLS.lineWidth : 1;
                                            const panelRadius = (typeof TLS.panelRadius === "number") ? TLS.panelRadius : 8;
                                            const panelOpacity = (typeof TLSURF.panelOpacity === "number") ? TLSURF.panelOpacity : 0.95;

                                            const SH_LINE = SH.line || { color: "rgba(0,0,0,0.20)", blur: 8, offsetX: 0, offsetY: 2 };
                                            const SH_ARROW = SH.arrow || SH_LINE;
                                            const SH_PANEL = SH.panel || { color: "rgba(0,0,0,0.20)", blur: 10, offsetX: 0, offsetY: 3 };
                                            const SH_TEXT = SH.text || { color: "rgba(0,0,0,0.15)", blur: 4, offsetX: 0, offsetY: 1 };

                                            const applyShadow = (kind) => {
                                                if (!SH_ENABLED) {
                                                    ctx.shadowColor = "transparent";
                                                    ctx.shadowBlur = 0;
                                                    ctx.shadowOffsetX = 0;
                                                    ctx.shadowOffsetY = 0;
                                                    return;
                                                }
                                                const s =
                                                    (kind === "panel") ? SH_PANEL :
                                                        (kind === "arrow") ? SH_ARROW :
                                                            (kind === "text") ? SH_TEXT :
                                                                SH_LINE;
                                                ctx.shadowColor = s.color ?? "rgba(0,0,0,0.2)";
                                                ctx.shadowBlur = s.blur ?? 0;
                                                ctx.shadowOffsetX = s.offsetX ?? 0;
                                                ctx.shadowOffsetY = s.offsetY ?? 0;
                                            };

                                            const withAlpha = (color, a) => {
                                                if (typeof color !== "string") return `rgba(255,255,255,${a})`;
                                                const hex = color.replace("#", "");
                                                if (hex.length === 3) {
                                                    const r = parseInt(hex[0] + hex[0], 16);
                                                    const g = parseInt(hex[1] + hex[1], 16);
                                                    const b = parseInt(hex[2] + hex[2], 16);
                                                    return `rgba(${r},${g},${b},${a})`;
                                                }
                                                if (hex.length === 6) {
                                                    const r = parseInt(hex.slice(0, 2), 16);
                                                    const g = parseInt(hex.slice(2, 4), 16);
                                                    const b = parseInt(hex.slice(4, 6), 16);
                                                    return `rgba(${r},${g},${b},${a})`;
                                                }
                                                return `rgba(255,255,255,${a})`;
                                            };

                                            if (this.fitYAxisMilestones) {
                                                if (point.y * 1.1 > this.grid.ymax) this.grid.ymax = point.y * 1.5;
                                                this.grid.rescale();
                                            }

                                            let fs = baseFontSize;
                                            if (typeof point.fontSize === "number") fs = point.fontSize;
                                            else if (point.fontSize === "large") fs = Math.max(18, baseFontSize + 8);

                                            const font = `${fontWeight} ${fs}px ${fontFamily}`;
                                            ctx.font = font;

                                            const nameWidth = ctx.measureText(point.name).width;
                                            const nameHeight = fs + 1;
                                            const paddingX = 2;
                                            const paddingY = 6;
                                            const maxWidth = 500;
                                            const boxWidth = Math.min(nameWidth, maxWidth) + paddingX * 2;

                                            const DAY_MS = 24 * 60 * 60 * 1000;
                                            const ONE_MONTH_MS = 12 * (30 * DAY_MS);
                                            const hasPubmed = Array.isArray(point.pubmed_results) && point.pubmed_results.length > 0;

                                            const xminW = this.grid.Xwc(0);
                                            const xmaxW = this.grid.Xwc(ctx.canvas.width);
                                            const tA = formatTime(xminW, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);
                                            const tB = formatTime(xmaxW, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);
                                            const spanMs = Math.abs(tB.getTime() - tA.getTime());
                                            const showAbstracts = hasPubmed && spanMs <= ONE_MONTH_MS;

                                            const abstractFontSize = Math.max(12, Math.round(fs * 0.85));
                                            const abstractLineHeight = Math.round(abstractFontSize * 1.25);
                                            let abstractsHeight = 0;

                                            if (showAbstracts) {
                                                ctx.save();
                                                ctx.font = `${fontWeight} ${abstractFontSize}px ${fontFamily}`;
                                                const N = Math.min(3, point.pubmed_results.length);
                                                for (let i = 0; i < N; i++) {
                                                    const p = point.pubmed_results[i];
                                                    abstractsHeight += abstractLineHeight;

                                                    const body = p.abstract || p.title || "";
                                                    const words = body.split(/\s+/);
                                                    let line = "";
                                                    let lines = 0;
                                                    for (const w of words) {
                                                        const test = line ? line + " " + w : w;
                                                        if (ctx.measureText(test).width > maxWidth && line) {
                                                            lines++;
                                                            line = w;
                                                        } else {
                                                            line = test;
                                                        }
                                                    }
                                                    if (line) lines++;
                                                    abstractsHeight += lines * abstractLineHeight;
                                                    abstractsHeight += Math.round(abstractLineHeight * 0.25);
                                                }
                                                ctx.restore();
                                            }

                                            const baseTitleBlock = nameHeight + paddingY * 2;
                                            const boxHeight = baseTitleBlock + (showAbstracts ? abstractsHeight : 0);

                                            const nameBox = { x: x - boxWidth / 2, y, w: boxWidth, h: boxHeight };
                                            const adjustedBoxY = findNonOverlappingY(
                                                { x: nameBox.x, y, w: nameBox.w, h: boxHeight },
                                                previousLabels,
                                                ctx.canvas.height,
                                                6
                                            );
                                            const adjustedFilenameY = adjustedBoxY + paddingY + nameHeight;

                                            previousLabels.push({ x: nameBox.x, y: adjustedBoxY, w: nameBox.w, h: boxHeight });

                                            point.isInside = (mx, my) =>
                                                mx >= nameBox.x &&
                                                mx <= nameBox.x + nameBox.w &&
                                                my >= adjustedBoxY &&
                                                my <= adjustedBoxY + boxHeight;

                                            behindLabels.push(() => {
                                                ctx.save();
                                                ctx.beginPath();
                                                ctx.moveTo(x, axis);
                                                ctx.lineTo(x, adjustedBoxY + boxHeight);

                                                ctx.strokeStyle = point.highlight ? cArrow : cLine;
                                                ctx.lineWidth = point.highlight ? Math.max(2, lineWidth) : Math.max(1, lineWidth * 0.5);

                                                applyShadow(point.highlight ? "arrow" : "line");
                                                ctx.stroke();
                                                ctx.restore();
                                            });

                                            labelLayer.push(() => {

                                                ctx.save();
                                                applyShadow("panel");
                                                ctx.fillStyle = (panelOpacity < 1) ? withAlpha(cPanelBg, panelOpacity) : cPanelBg;
                                                ctx.strokeStyle = cPanelBorder;
                                                ctx.lineWidth = Math.max(1, lineWidth);

                                                ctx.beginPath();
                                                ctx.roundRect(nameBox.x, adjustedBoxY, nameBox.w, boxHeight, panelRadius);
                                                ctx.fill();
                                                ctx.stroke();
                                                ctx.restore();

                                                ctx.save();
                                                ctx.textAlign = "center";
                                                ctx.textBaseline = "top";
                                                ctx.font = font;
                                                applyShadow("text");
                                                ctx.fillStyle = cText;

                                                let nameText = point.name;
                                                if (ctx.measureText(nameText).width > maxWidth) {
                                                    while (ctx.measureText(nameText + "...").width > maxWidth && nameText.length > 0) {
                                                        nameText = nameText.slice(0, -1);
                                                    }
                                                    nameText += "...";
                                                }

                                                ctx.fillText(nameText, x, adjustedBoxY + paddingY);

                                                if (point.filename) {
                                                    ctx.fillStyle = cLine;
                                                    ctx.fillText(point.filename, x, adjustedFilenameY);
                                                }
                                                ctx.restore();

                                                if (this._xAxisDaysVisible) {

                                                    this.grid.rescale();
                                                    const tx = this.grid.Xwc(x - this.grid.xi * 2);
                                                    const d = formatTime(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);

                                                    const STEP = 15 * 60 * 1000;
                                                    const rounded = new Date(Math.round(d.getTime() / STEP) * STEP);

                                                    const yyyy = rounded.getUTCFullYear();
                                                    const mm2 = String(rounded.getUTCMonth() + 1).padStart(2, "0");
                                                    const dd2 = String(rounded.getUTCDate()).padStart(2, "0");
                                                    const dateLine = `${yyyy}-${mm2}-${dd2}`;

                                                    const hh = String(rounded.getUTCHours()).padStart(2, "0");
                                                    const min = String(rounded.getUTCMinutes()).padStart(2, "0");
                                                    const timeLine = `${hh}:${min} UTC`;

                                                    ctx.save();

                                                    const fsTime = Math.max(10, baseFontSize - 2);
                                                    ctx.font = `${Math.max(600, fontWeight)} ${fsTime}px ${fontFamily}`;
                                                    ctx.textAlign = "center";
                                                    ctx.textBaseline = "middle";

                                                    let yMid = adjustedBoxY + (boxHeight * 2);

                                                    const padX = 8;
                                                    const padY = 6;
                                                    const lineGap = 3;

                                                    const w1 = ctx.measureText(dateLine).width;
                                                    const w2 = ctx.measureText(timeLine).width;
                                                    const textW = Math.max(w1, w2);

                                                    const pillW = textW + padX * 2;
                                                    const pillH = (fsTime * 2) + lineGap + padY * 2;

                                                    const xCenter = x;
                                                    const pillX = xCenter - pillW / 2;
                                                    const pillY = yMid - pillH / 2;

                                                    applyShadow("panel");
                                                    const bg = (panelOpacity < 1)
                                                        ? withAlpha(cPanelBg, Math.min(1, panelOpacity + 0.15))
                                                        : cPanelBg;

                                                    ctx.fillStyle = bg;
                                                    ctx.strokeStyle = cPanelBorder;
                                                    ctx.lineWidth = 1;

                                                    ctx.beginPath();
                                                    ctx.roundRect(pillX, pillY, pillW, pillH, Math.min(10, pillH / 2));
                                                    ctx.fill();
                                                    ctx.stroke();

                                                    applyShadow("text");
                                                    ctx.fillStyle = cText;

                                                    const y1 = yMid - (fsTime / 2) - (lineGap / 2);
                                                    const y2 = yMid + (fsTime / 2) + (lineGap / 2);

                                                    ctx.fillText(dateLine, xCenter, y1);
                                                    ctx.fillText(timeLine, xCenter, y2);

                                                    ctx.restore();
                                                }

                                                if (showAbstracts) {
                                                    ctx.save();
                                                    ctx.textBaseline = "top";
                                                    ctx.font = `${fontWeight} ${abstractFontSize}px ${fontFamily}`;
                                                    applyShadow("text");

                                                    let yCursor = adjustedBoxY + baseTitleBlock + Math.round(abstractLineHeight * 0.25);
                                                    const N = Math.min(3, point.pubmed_results.length);

                                                    for (let i = 0; i < N; i++) {
                                                        const p = point.pubmed_results[i];
                                                        const ym = (p.pubdate || "").slice(0, 7);
                                                        const header = `${p.journal ? " — " + p.journal : ""}${ym ? " (" + ym + ")" : ""}`;

                                                        ctx.globalAlpha = 0.85;
                                                        ctx.fillStyle = cLine;
                                                        yCursor = drawWrappedText(ctx, header, x, yCursor, maxWidth, abstractLineHeight);
                                                        ctx.globalAlpha = 1;

                                                        ctx.fillStyle = cText;
                                                        yCursor = drawWrappedText(ctx, p.abstract || p.title || "(no abstract)", x, yCursor, maxWidth, abstractLineHeight);
                                                        yCursor += Math.round(abstractLineHeight * 0.25);
                                                    }
                                                    ctx.restore();
                                                }

                                                if (point.img || (point.icon && !point.icon.toString().endsWith('...'))) {
                                                    let wellWidth = grid.screenWidth(pxwidth10);
                                                    if (point.iconSize) wellWidth = grid.screenWidth(point.iconSize);
                                                    if (wellWidth <= 16) wellWidth = 16;

                                                    const iconSize = wellWidth * 0.5;

                                                    ctx.save();
                                                    ctx.font = font;
                                                    const textW = Math.min(ctx.measureText(point.name).width, maxWidth);
                                                    ctx.restore();

                                                    const iconX = x - (textW / 2) - iconSize - 6;
                                                    const iconY = adjustedBoxY + paddingY;

                                                    let img = point.img;
                                                    if (!img) {
                                                        try {
                                                            img = new Image();
                                                            img.onload = function () { point.img = img; };
                                                            if (typeof point.icon === 'string') img.src = point.icon;
                                                        } catch (e) {
                                                            point.icon = null;
                                                            point.img = null;
                                                        }
                                                    } else {
                                                        ctx.save();
                                                        applyShadow("panel");
                                                        try { ctx.drawImage(img, iconX, iconY, iconSize, iconSize); }
                                                        catch (e) { point.img = null; }
                                                        ctx.restore();
                                                    }
                                                }

                                                if (point.videoURL) {
                                                    let wellWidth = grid.screenWidth(pxwidth10);
                                                    if (point.iconSize) wellWidth = this.grid.screenWidth(point.iconSize);
                                                    if (wellWidth <= 10) wellWidth = 10;

                                                    const iconSize = wellWidth * 0.5;
                                                    const iconCenterY = adjustedBoxY - 15;
                                                    const iconX = x - iconSize / 2;
                                                    const iconY = iconCenterY - iconSize / 2;

                                                    ctx.save();

                                                    ctx.beginPath();
                                                    ctx.strokeStyle = cLine;
                                                    ctx.lineWidth = Math.max(1, lineWidth);
                                                    applyShadow("line");
                                                    ctx.moveTo(x, adjustedBoxY);
                                                    ctx.lineTo(x, iconCenterY);
                                                    ctx.stroke();

                                                    applyShadow(point.highlight ? "arrow" : "panel");
                                                    ctx.fillStyle = withAlpha(cPanelBg, 0.55);
                                                    ctx.strokeStyle = cPanelBorder;
                                                    ctx.lineWidth = Math.max(1, lineWidth);
                                                    ctx.beginPath();
                                                    ctx.roundRect(iconX, iconY, iconSize, iconSize, 3);
                                                    ctx.fill();
                                                    ctx.stroke();

                                                    ctx.shadowColor = "transparent";
                                                    ctx.shadowBlur = 0;
                                                    ctx.shadowOffsetX = 0;
                                                    ctx.shadowOffsetY = 0;

                                                    ctx.fillStyle = cArrow || cText;
                                                    const triangleSize = iconSize * 0.5;
                                                    const triX = x + triangleSize * 0.15;
                                                    const triY = iconY + iconSize / 2;

                                                    ctx.beginPath();
                                                    ctx.moveTo(triX - triangleSize / 2, triY - triangleSize / 1.5);
                                                    ctx.lineTo(triX + triangleSize / 2, triY);
                                                    ctx.lineTo(triX - triangleSize / 2, triY + triangleSize / 1.5);
                                                    ctx.closePath();
                                                    ctx.fill();

                                                    ctx.restore();
                                                }
                                            });
                                        }

                                        if (point.highlight) {
                                            ctx.shadowColor = 'transparent';
                                            ctx.shadowBlur = 0;
                                            ctx.shadowOffsetX = 0;
                                            ctx.shadowOffsetY = 0;
                                        }

                                    }

                                }
                            }
                        }

                        for (const fn of behindLabels) fn();
                        for (const fn of labelLayer) fn();
                        if (!found_one_highlighted) {
                            this.___pointMenuItems = null;
                        }
                        this.drawXAxisTimeTicks(ctx, grid, xMin, xMax)
                        const tickCount = 6;
                        ctx.font = '12px Arial';
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';

                        if (this.name && !(this.name.toLowerCase() === 'untitled')) {

                        }
                        if (this._highlight) {

                            const rectWidth = Math.abs(this.grid.width);
                            const rectHeight = Math.abs(this.grid.height);

                            const x = (this.grid.width >= 0) ? this.grid.xi : (this.grid.xi + this.grid.width);
                            const y = (this.grid.height >= 0) ? this.grid.yi : (this.grid.yi + this.grid.height);

                            const brx = x + rectWidth;
                            const bry = y + rectHeight;

                            const handleSize = 30;

                            drawResizeHandle(ctx, brx + 40, bry + 40, handleSize, !!this.resizing, true);

                        } else {
                            ctx.shadowBlur = 1;
                        }
                        return;
                    }
                    else {
                        if (!this.grid || !this.grid.rescale) {
                            this.grid.xi = graph.X(this.x);
                            this.grid.yi = graph.Y(this.y);
                            let sw = graph.screenWidth(this.w)
                            this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                            const xmin = 0;
                            let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                            if (validPoints.length === 0) {
                                console.warn("No valid points to calculate ymax.");
                                return null;
                            }
                            const ymin = Math.min(...validPoints.map(p => p.y));
                            const ymax = Math.max(...validPoints.map(p => p.y));

                            this.grid.zoom(xmin, xmax, ymin, ymax);
                            this.grid.rescale();
                        } else {

                        }
                        if (this._highlight) {
                            ctx.strokeStyle = 'gray';
                        } else {
                            ctx.strokeStyle = 'lightGray';
                        }

                        ctx.setLineDash([]);
                        ctx.shadowColor = 'black';
                        ctx.strokeStyle = 'gray';
                        ctx.beginPath();
                        ctx.textAlign = 'left';
                        ctx.strokeStyle = 'rgba(2, 6, 44, 0.7)';
                        this.plotLines(grid, ctx);
                    }
                if (this._highlight) {
                    const arrowSize = 15;
                    const rectWidth = Math.abs(this.grid.width);
                    const rectHeight = Math.abs(this.grid.height);
                    const cornerSize = 30;

                    const bottomRightStartX = this.grid.xi + rectWidth + 65;
                    const bottomRightStartY = this.grid.yi + rectHeight + 65;

                    const cornerX = bottomRightStartX - cornerSize
                    const cornerY = bottomRightStartY - cornerSize

                    ctx.fillStyle = "navy";
                    ctx.strokeStyle = "lightCyan";
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 1;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;

                    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                    if (this.resizing) {
                        ctx.fillStyle = "black";
                        ctx.strokeStyle = "lightCyan";
                        ctx.lineWidth = 4;
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";

                    }

                    drawResizeHandle(ctx, cornerX, cornerY, arrowSize)

                    ctx.beginPath();
                    ctx.moveTo(cornerX, cornerY);
                    ctx.lineTo(cornerX - arrowSize, cornerY);
                    ctx.lineTo(cornerX, cornerY - arrowSize);
                    ctx.closePath();
                    ctx.fill();

                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;

                    ctx.shadowColor = "transparent";
                } else {
                    ctx.shadowBlur = 1;
                }
                ctx.setLineDash([]);

                if (this.showTopMenuBar)
                    this.drawButtons(ctx, pt.grid)

            }

            drawAxisTicks(ctx, _grid, minVal, maxVal) {
                const tickCount = 5;
                const range = maxVal - minVal;
                const tickInterval = range / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                try {
                    if (this.formatAxis) {
                        return this.formatAxis(ctx, _grid, minVal, maxVal)
                    }
                } catch (exception) {

                }

                for (let i = 0; i <= tickCount; i++) {
                    const value = minVal + i * tickInterval;
                    const position = _grid.Y(value);
                    const cxmin = _grid.X(_grid.xmin);

                    ctx.moveTo(cxmin, position);
                    ctx.lineTo(cxmin - 5, position);

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    let text;

                    if (value instanceof Date || (!isNaN(Date.parse(value)) && typeof value === 'string')) {

                        const dateObj = value instanceof Date ? value : new Date(value);
                        text = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                        ctx.beginPath();
                        ctx.moveTo(x, tickBaseY);
                        ctx.lineTo(x, tickBaseY - 10);
                        ctx.stroke();

                    } else if (typeof value === 'number' && !isNaN(value)) {

                        text = value.toFixed(2);
                    } else if (!isNaN(parseFloat(value))) {

                        text = parseFloat(value).toFixed(1);
                    } else {
                        text = 'N/A';
                    }

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = cxmin - 30 - ovalWidth / 2;
                    const textY = position;

                    ctx.beginPath();

                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }
                ctx.fillStyle = 'transparent';
                ctx.strokStyle = 'white';

            }

            drawLogAxisTicks(ctx, _grid, minVal, maxVal, logBase = 10) {
                const tickCount = 5;
                const minThreshold = 1e-10;
                const safeMinVal = minVal > 0 ? minVal : minThreshold;

                const logMin = Math.log(safeMinVal) / Math.log(logBase);
                const logMax = Math.log(maxVal) / Math.log(logBase);
                const logRange = logMax - logMin;

                const tickInterval = logRange / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                for (let i = 0; i <= tickCount; i++) {

                    const logValue = logMin + i * tickInterval;
                    const value = Math.pow(logBase, logValue);
                    const position = _grid.Y(value);
                    const cxmin = _grid.X(_grid.xmin);

                    ctx.moveTo(cxmin, position);
                    ctx.lineTo(cxmin - 5, position);

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = value < 1 ? value.toPrecision(3) : value.toFixed(0);

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = cxmin - 30 - ovalWidth / 2;
                    const textY = position;

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }

                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'white';
            }

            drawXAxisTicks(ctx, _grid, minVal, maxVal) {
                const tickCount = 7;
                const range = maxVal - minVal;
                const tickInterval = range / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;
                ctx.offset
                for (let i = 0; i <= tickCount; i++) {
                    const value = minVal + i * tickInterval;

                    const position = _grid.X(value);
                    const cymin = _grid.Y(_grid.ymin);

                    ctx.moveTo(position, cymin);
                    ctx.lineTo(position, cymin + 5);

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = (typeof value === 'number' && !isNaN(value))
                        ? value.toFixed(1)
                        : (parseFloat(value) ? parseFloat(value).toFixed(1) : 'N/A');

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = position;
                    const textY = cymin + 12 - ovalWidth / 2 + 20

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }
                ctx.fillStyle = 'white';
                ctx.strokStyle = 'white';
            }

            drawXAxisLogTicks(ctx, _grid, minVal, maxVal, logBase = 10) {
                const tickCount = 7;
                const minThreshold = 1e-10;
                const safeMinVal = minVal > 0 ? minVal : minThreshold;

                const logMin = Math.log(safeMinVal) / Math.log(logBase);
                const logMax = Math.log(maxVal) / Math.log(logBase);
                const logRange = logMax - logMin;

                const tickInterval = logRange / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                for (let i = 0; i <= tickCount; i++) {

                    const logValue = logMin + i * tickInterval;
                    const value = Math.pow(logBase, logValue);

                    const position = _grid.X(value);
                    const cymin = _grid.Y(_grid.ymin);

                    ctx.moveTo(position, cymin);
                    ctx.lineTo(position, cymin + 5);

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = value < 1 ? value.toPrecision(3) : value.toFixed(0);

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = position;
                    const textY = cymin + 24;

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }

                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'white';
            }

            drawButtons(ctx) {
                if (!this.showTopMenuBar) {
                    return;
                }
                if (CurrentLayout.getStashed('mode') === 'viewer') {
                    return;
                }

                this.grid.rescale();
                let screen_height = (this.getHeight());
                let screen_width = (this.getWidth());
                let sy = (this.grid.yi);
                if ((sy + screen_height) < 0) {
                    return;
                }
                let index = 0;
                let b = this.buttons;
                let init = (this.grid.xi + this.grid.width - this.buttons.length * bsize);
                if (init < 0) {
                    init = (0);
                }
                ctx.lineWidth = 1;
                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = (this.grid.yi - (this.margin.top));
                    let buttonHeight = button.height;

                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 2;
                    ctx.shadowOffsetX = 1;
                    ctx.shadowOffsetY = 1;
                    if (button.name === "close") {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;

                        ctx.fillStyle = button.color;

                        if (highlightTab === button.name) {
                            ctx.fillStyle = 'cyan';
                        }

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 2;

                        let padding = 5;
                        let x1 = centerX - circleRadius + padding;
                        let y1 = centerY - circleRadius + padding;
                        let x2 = centerX + circleRadius - padding;
                        let y2 = centerY + circleRadius - padding;

                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.moveTo(x1, y2);
                        ctx.lineTo(x2, y1);
                        ctx.stroke();
                    }
                    else if (button.name === "move") {

                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;

                        ctx.fillStyle = 'lightCyan';
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        let arrowLength = circleRadius * 0.8;
                        let arrowHead = 2;

                        ctx.beginPath();
                        ctx.moveTo(centerX, centerY - arrowLength);
                        ctx.lineTo(centerX, centerY - arrowLength + arrowHead);
                        ctx.lineTo(centerX - arrowHead, centerY - arrowLength + arrowHead);
                        ctx.moveTo(centerX, centerY - arrowLength + arrowHead);
                        ctx.lineTo(centerX + arrowHead, centerY - arrowLength + arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX, centerY + arrowLength);
                        ctx.lineTo(centerX, centerY + arrowLength - arrowHead);
                        ctx.lineTo(centerX - arrowHead, centerY + arrowLength - arrowHead);
                        ctx.moveTo(centerX, centerY + arrowLength - arrowHead);
                        ctx.lineTo(centerX + arrowHead, centerY + arrowLength - arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX - arrowLength, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY - arrowHead);
                        ctx.moveTo(centerX - arrowLength + arrowHead, centerY);
                        ctx.lineTo(centerX - arrowLength + arrowHead, centerY + arrowHead);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(centerX + arrowLength, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY - arrowHead);
                        ctx.moveTo(centerX + arrowLength - arrowHead, centerY);
                        ctx.lineTo(centerX + arrowLength - arrowHead, centerY + arrowHead);
                        ctx.stroke();

                    }

                    else if (button.name === "minimize") {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.font = `${circleRadius}px Arial`;
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('M', centerX, centerY);

                    } else {

                        ctx.fillStyle = button.color;
                        ctx.fillRect(buttonX, buttonY, bsize, buttonHeight);

                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.strokeStyle = 'black';
                        ctx.strokeRect(buttonX, buttonY, bsize, buttonHeight);
                        ctx.fillStyle = 'black';
                        ctx.font = '9px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillText(button.name, centerX, centerY);
                    }

                    index++;
                }
                if (this.____callout) {
                    setTimeout(() => {
                        this.____callout = false;
                    }, 6000)
                    this.drawButtonCallouts(ctx, {
                        labels: { close: 'Delete', move: 'Move', minimize: 'Menu' }
                    });
                }
            }

            drawButtonCallouts(ctx, opts = {}) {
                if (!this.showTopMenuBar) return;
                if (CurrentLayout.getStashed('mode') === 'viewer') return;

                const {
                    labels = {},
                    font = '11px Arial',
                    textColor = '#000',
                    strokeColor = '#111',
                    fillColor = '#111',
                    labelBg = 'rgba(255,255,255,0.95)',
                    labelBorder = 'rgba(0,0,0,0.25)',
                    gap = 7,
                    arrowHead = 7,
                    shaftWidth = 2,
                    minShaft = 28,
                    labelPadX = 7,
                    labelPadY = 4,
                    maxLabelLen = 4,
                    tierBump = 8,
                    haloRadius = 4,
                    haloColor = 'rgba(255,255,255,0.9)',
                    glow = true
                } = opts;

                this.grid.rescale();
                const screenH = this.getHeight();
                const sy = this.grid.yi;
                if ((sy + screenH) < 0) return;

                const b = this.buttons || [];
                if (!b.length) return;

                const resolveBsize = () => {
                    if (typeof bsize === 'number') return bsize;
                    if (typeof this.bsize === 'number') return this.bsize;
                    return 20;
                };
                const BTN = resolveBsize();

                let init = (this.grid.xi + this.grid.width - this.buttons.length * BTN);
                if (init < 0) init = 0;

                const oneWord = (s) => {
                    if (!s) return '';
                    const m = String(s).match(/[A-Za-z0-9_]+/);
                    return (m ? m[0] : String(s)).slice(0, maxLabelLen);
                };
                const intersects = (a, b) => (
                    a.x < b.x + b.w && a.x + a.w > b.x &&
                    a.y < b.y + b.h && a.y + a.h > b.y
                );
                const roundRect = (c, x, y, w, h, r = 6) => {
                    c.beginPath();
                    c.moveTo(x + r, y);
                    c.lineTo(x + w - r, y);
                    c.quadraticCurveTo(x + w, y, x + w, y + r);
                    c.lineTo(x + w, y + h - r);
                    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                    c.lineTo(x + r, y + h);
                    c.quadraticCurveTo(x, y + h, x, y + h - r);
                    c.lineTo(x, y + r);
                    c.quadraticCurveTo(x, y, x + r, y);
                    c.closePath();
                };

                const placed = [];
                ctx.save();

                let index = 0;
                for (const button of b) {

                    const buttonX = init + index * BTN;
                    let buttonY = (this.grid.yi - (this.margin.top));
                    const buttonHeight = button.height;

                    if (buttonY < 0 && (buttonY + screenH) > 0) {
                        buttonY = 10;
                    }

                    const centerX = buttonX + BTN / 2;
                    const centerY = buttonY + buttonHeight / 2;

                    const labelText = oneWord(labels[button.name] ?? button.name);

                    ctx.save();
                    ctx.font = font;
                    const metrics = ctx.measureText(labelText);
                    const textW = Math.ceil(metrics.width);
                    const textH = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) || 11;
                    const boxW = textW + 2 * labelPadX;
                    const boxH = textH + 2 * labelPadY;

                    let boxX = Math.round(centerX - boxW / 2);
                    let boxY = Math.round(centerY - (boxH + gap + minShaft));

                    const candidate = { x: boxX, y: boxY, w: boxW, h: boxH };
                    while (placed.some(p => intersects(candidate, p))) {
                        candidate.y -= (boxH + tierBump);
                    }

                    const currentShaft = (centerY - (candidate.y + boxH + gap));
                    if (currentShaft < minShaft) {
                        const delta = (minShaft - currentShaft);
                        candidate.y -= delta;

                        while (placed.some(p => intersects(candidate, p))) {
                            candidate.y -= (boxH + tierBump);
                        }
                    }

                    boxX = candidate.x;
                    boxY = candidate.y;

                    if (glow) {
                        ctx.shadowColor = 'rgba(0,0,0,0.25)';
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 1;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    ctx.fillStyle = labelBg;
                    ctx.strokeStyle = labelBorder;
                    ctx.lineWidth = 1;
                    roundRect(ctx, boxX, boxY, boxW, boxH, 6);
                    ctx.fill();
                    ctx.stroke();

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = textColor;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(labelText, boxX + boxW / 2, boxY + boxH / 2);

                    const shaftStartX = centerX;
                    const shaftStartY = boxY + boxH + gap;
                    const shaftEndX = centerX;
                    const shaftEndY = centerY;

                    if (glow) {
                        ctx.shadowColor = 'rgba(0,0,0,0.3)';
                        ctx.shadowBlur = 4;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 1;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = shaftWidth;
                    ctx.beginPath();
                    ctx.moveTo(shaftStartX, shaftStartY);
                    ctx.lineTo(shaftEndX, shaftEndY - arrowHead);
                    ctx.stroke();

                    ctx.shadowBlur = glow ? 4 : 0;

                    if (haloRadius > 0) {
                        ctx.save();
                        ctx.shadowBlur = 0;
                        ctx.fillStyle = haloColor;
                        ctx.beginPath();
                        ctx.arc(shaftEndX, shaftEndY, haloRadius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }

                    ctx.fillStyle = fillColor;
                    ctx.beginPath();
                    ctx.moveTo(shaftEndX, shaftEndY);
                    ctx.lineTo(shaftEndX - arrowHead, shaftEndY - arrowHead);
                    ctx.lineTo(shaftEndX + arrowHead, shaftEndY - arrowHead);
                    ctx.closePath();
                    ctx.fill();

                    placed.push({ x: boxX, y: boxY, w: boxW, h: boxH });

                    ctx.restore();
                    index++;
                }

                ctx.restore();
            }

            drawAxisLabels(ctx, grid, x_axis_label, y_axis_label) {
                const axisLabelFont = '13px Arial';
                const labelPadding = 40;
                const backgroundPadding = 10;

                function drawOvalBackground(cx, cy, width, height, fillStyle) {
                    ctx.beginPath();
                    ctx.moveTo(cx - width / 2 + height / 2, cy);
                    ctx.arc(cx + width / 2 - height / 2, cy, height / 2, Math.PI / 2, -Math.PI / 2, false);
                    ctx.arc(cx - width / 2 + height / 2, cy, height / 2, -Math.PI / 2, Math.PI / 2, false);
                    ctx.closePath();
                    ctx.fillStyle = fillStyle;
                    ctx.fill();
                }

                if (grid.width > 100) {

                    if (y_axis_label) {
                        ctx.save();
                        ctx.translate(grid.xi - labelPadding - 50, grid.yi + grid.height / 2);
                        ctx.rotate(-Math.PI / 2);
                        ctx.textAlign = 'center';
                        ctx.font = axisLabelFont;

                        const textWidth = ctx.measureText(y_axis_label).width;
                        const textHeight = 16;
                        const ovalWidth = textWidth + backgroundPadding * 2;
                        const ovalHeight = textHeight + backgroundPadding * 2;

                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 2;

                        ctx.fillStyle = 'black';
                        ctx.fillText(y_axis_label, 0, 0);

                        ctx.restore();
                    }

                    if (x_axis_label) {
                        ctx.textAlign = 'center';
                        grid.rescale();
                        ctx.font = axisLabelFont;

                        const xCenter = grid.xi + grid.width / 2;
                        const yPos = grid.yi + grid.height + labelPadding;
                        const textWidth = ctx.measureText(x_axis_label).width;
                        const textHeight = 16;
                        const ovalWidth = textWidth + backgroundPadding * 2;
                        const ovalHeight = textHeight + backgroundPadding * 2;

                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 3;

                        ctx.fillStyle = 'black';
                        ctx.fillText(x_axis_label, xCenter, yPos);
                    }

                    if (this.grid.yLogScale) {
                        this.drawLogAxisTicks(ctx, this.grid, this.grid.ymin, this.grid.ymax, this.grid.yLogBase);
                    } else {
                        this.drawAxisTicks(ctx, this.grid, this.grid.ymin, this.grid.ymax, true);
                    }
                    if (this.type === scatter) {
                        if (this.grid.xLogScale) {
                            this.drawXAxisLogTicks(ctx, this.grid, this.grid.xmin, this.grid.xmax, this.grid.xLogBase);
                        } else {
                            this.drawXAxisTicks(ctx, this.grid, this.grid.xmin, this.grid.xmax, true);
                        }
                    } else if (this.type === timeline) {
                        this.drawXAxisTimeTicks(ctx, this.grid, this.grid.xmin, this.grid.xmax);
                    } else if (this.type === 'line' || this.type === 'linear') {
                        this.drawXAxisTicks(ctx, this.grid, this.grid.xmin, this.grid.xmax, true);
                    }
                }
            }

            drawXAxisTimeTicks(ctx, _grid, minVal, maxVal, showQuarters = false, themeOverride = null) {
                const startDate = this.startDate;
                const endDate = this.endDate;

                const TL_THEME = themeOverride || this.theme || THEMES.timeline_default || THEMES["classic-light"];
                const { colors: TLC = {}, fonts: TLF = {}, sizes: TLS = {}, effects: TLE = {}, surfaces: TLSURF = {} } = TL_THEME;

                const SH = (TLE?.shadows || {});
                const SH_ENABLED = !!SH.enabled;

                const cHandle = TLC.handle ?? "#2a6b2a";
                const cText = TLC.text ?? "#222";
                const cLine = TLC.line ?? "#999";
                const cArrow = TLC.arrow ?? cLine;
                const cPanelBg = TLC.panelBg ?? TLC.background ?? "rgba(255,255,255,0.95)";
                const cPanelBorder = TLC.panelBorder ?? "rgba(0,0,0,0.15)";

                const fontFamily = TLF.family ?? "Arial";
                const baseFontSize = (typeof TLF.size === "number" ? TLF.size : 12);

                const lineWidth = (typeof TLS.lineWidth === "number" ? TLS.lineWidth : 1);
                const panelOpacity = (typeof TLSURF.panelOpacity === "number" ? TLSURF.panelOpacity : 0.95);

                const SH_LINE = SH.line || { color: "rgba(0,0,0,0.20)", blur: 8, offsetX: 0, offsetY: 2 };
                const SH_ARROW = SH.arrow || SH_LINE;
                const SH_PANEL = SH.panel || { color: "rgba(0,0,0,0.20)", blur: 10, offsetX: 0, offsetY: 3 };
                const SH_TEXT = SH.text || { color: "rgba(0,0,0,0.15)", blur: 4, offsetX: 0, offsetY: 1 };

                const applyShadow = (kind) => {
                    if (!SH_ENABLED) {
                        ctx.shadowColor = "transparent";
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        return;
                    }
                    const s =
                        (kind === "panel") ? SH_PANEL :
                            (kind === "arrow") ? SH_ARROW :
                                (kind === "text") ? SH_TEXT :
                                    SH_LINE;

                    ctx.shadowColor = s.color ?? "rgba(0,0,0,0.2)";
                    ctx.shadowBlur = s.blur ?? 0;
                    ctx.shadowOffsetX = s.offsetX ?? 0;
                    ctx.shadowOffsetY = s.offsetY ?? 0;
                };

                ctx.lineWidth = lineWidth;
                ctx.shadowBlur = 0;

                const cymin = _grid.Y(_grid.ymin);

                const visMinWorld = (this.grid.Xwc(-this.grid.xi * 2));
                const visMaxWorld = (this.grid.Xwc(ctx.canvas.width - this.grid.xi * 2));

                const vMin = Math.max(minVal, Math.min(visMinWorld, visMaxWorld));
                const vMax = Math.min(maxVal, Math.max(visMinWorld, visMaxWorld));
                if (!(vMax > vMin)) return;

                const startMs = startDate.getTime();
                const viewStartMs = startMs + vMin * hourToMs;
                const viewEndMs = startMs + vMax * hourToMs;
                const viewStartDate = new Date(viewStartMs);
                const viewEndDate = new Date(viewEndMs);

                const startYear = viewStartDate.getUTCFullYear();
                const endYear = viewEndDate.getUTCFullYear();
                const yearsSpan = Math.max(1, endYear - startYear + 1);

                const allowMonths = (yearsSpan < 10);
                const forceYearsOnly = (yearsSpan > 100);

                const pxPerHour = _grid.X(vMin + 1) - _grid.X(vMin);
                const pxPerDay = pxPerHour * 24;
                const pxPerMonth = pxPerDay * 30;

                const spanMs = Math.max(1, viewEndMs - viewStartMs);
                const spanHours = spanMs / hourToMs;
                const spanDays = spanMs / dayToMs;

                const monthsVisible = allowMonths && (pxPerMonth >= 18) && !forceYearsOnly;

                const showDaysUnderMonths = monthsVisible && (pxPerMonth >= 110) && (pxPerDay >= 10);

                const daysVisible = (pxPerDay >= 10);
                const hoursVisible = (pxPerHour >= 14);

                this._xAxisDaysVisible = !!daysVisible;
                this._xAxisHoursVisible = !!hoursVisible;
                this._xAxisMonthsVisible = !!monthsVisible;
                this._xAxisForceYearsOnly = !!forceYearsOnly;

                if (this.maximize || (cymin > ctx.canvas.height && this.grid.yi < (ctx.canvas.height / 2))) {
                    this.drawXAxisTimeTicks_HEIGHT(ctx, _grid, minVal, maxVal, showQuarters, themeOverride);
                    return;
                }

                const MAX_TOTAL_TICKS = 380;
                const MAX_YEAR_TICKS = 60;
                const MAX_MONTH_TICKS = 72;
                const MAX_DAY_TICKS = 220;
                const MAX_HOUR_TICKS = 160;

                const MIN_VISIBLE_LABELS = 10;

                let totalTicksDrawn = 0;
                let totalLabelsDrawn = 0;

                const canDrawMore = (n = 1) => (totalTicksDrawn + n) <= MAX_TOTAL_TICKS;
                const noteTick = (n = 1) => { totalTicksDrawn += n; };
                const noteLabel = (n = 1) => { totalLabelsDrawn += n; };
                const strideFor = (count, max) => Math.max(1, Math.ceil(count / Math.max(1, max)));

                const xLeft = _grid.xi;
                const xRight = _grid.xi + _grid.width;
                const isXVisible = (x) => (x >= xLeft - 1 && x <= xRight + 1);

                const YEAR_PILL_Y = cymin + 35;
                const MONTH_LABEL_Y = cymin + 11 + 4 + 25;
                const QUARTER_Y = cymin + 11 + 4 + 60;
                const DAY_NUM_Y = cymin + 10;
                const DAY_ABBR_Y = cymin + 22;
                const HOUR_Y = cymin + 10;

                const drawTick = (x, len, major, strokeOverride = null) => {
                    if (!isXVisible(x)) return false;
                    if (!canDrawMore(1)) return false;
                    ctx.beginPath();
                    ctx.moveTo(x, cymin);
                    ctx.lineTo(x, cymin + len);
                    ctx.strokeStyle = strokeOverride || (major ? cText : cLine);
                    applyShadow("line");
                    ctx.stroke();
                    noteTick(1);
                    return true;
                };

                const drawYearPill = (x, year) => {
                    if (!isXVisible(x)) return false;
                    const yearLabel = _yearLabel(year);

                    ctx.save();
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.font = `700 ${Math.max(12, baseFontSize + 2)}px ${fontFamily}`;

                    const textWidth = ctx.measureText(yearLabel).width;
                    const padding = 8;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 20;

                    applyShadow("panel");
                    ctx.beginPath();
                    ctx.ellipse(x, YEAR_PILL_Y, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = (panelOpacity < 1) ? _withAlpha(cPanelBg, panelOpacity) : cPanelBg;
                    ctx.fill();

                    ctx.lineWidth = 1;
                    ctx.strokeStyle = cPanelBorder;
                    ctx.stroke();

                    applyShadow("text");
                    ctx.fillStyle = cText;
                    ctx.fillText(yearLabel, x, YEAR_PILL_Y);
                    ctx.restore();

                    noteLabel(1);
                    return true;
                };

                const drawMonthLabel = (x, m) => {
                    if (!isXVisible(x)) return false;
                    const label = monthNames[m];

                    ctx.save();
                    applyShadow("text");
                    ctx.font = `${baseFontSize}px ${fontFamily}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = cText;
                    ctx.translate(x, MONTH_LABEL_Y);
                    ctx.rotate(-Math.PI / 4);
                    ctx.fillText(label, 0, 0);
                    ctx.restore();

                    noteLabel(1);
                    return true;
                };

                const drawQuarterLabel = (x, m) => {
                    const q = quarterMap[m];
                    if (!q || !isXVisible(x)) return false;

                    ctx.save();
                    applyShadow("text");
                    ctx.font = `${Math.max(10, baseFontSize - 1)}px ${fontFamily}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = cLine;
                    ctx.fillText(q, x, QUARTER_Y);
                    ctx.restore();

                    noteLabel(1);
                    return true;
                };

                const drawDayLabel = (x, d, isWeekend) => {
                    if (!isXVisible(x)) return false;

                    ctx.save();
                    applyShadow("text");
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";

                    const dayNumColor = isWeekend ? (cArrow || cText) : cText;
                    const dayAbbrColor = isWeekend ? (cArrow || cLine) : cLine;

                    ctx.font = `${Math.max(10, baseFontSize - 1)}px ${fontFamily}`;
                    ctx.fillStyle = dayNumColor;
                    ctx.fillText(`${d.getUTCDate()}`, x, DAY_NUM_Y);

                    ctx.font = `${Math.max(8, baseFontSize - 3)}px ${fontFamily}`;
                    ctx.fillStyle = dayAbbrColor;
                    ctx.fillText(dayAbbr[d.getUTCDay()], x, DAY_ABBR_Y);

                    ctx.restore();

                    noteLabel(1);
                    return true;
                };

                const drawHourLabel = (x, d) => {
                    if (!isXVisible(x)) return false;
                    const h = d.getUTCHours();

                    ctx.save();
                    applyShadow("text");
                    ctx.font = `${Math.max(8, baseFontSize - 3)}px ${fontFamily}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = cLine;
                    ctx.fillText(`${h}:00`, x, HOUR_Y);
                    ctx.restore();

                    noteLabel(1);
                    return true;
                };

                const shadeWeekend = (x0, x1) => {

                    const top = _grid.Y(_grid.ymax);
                    const h = _grid.Y(_grid.ymin) - _grid.Y(_grid.ymax);
                    ctx.save();
                    ctx.fillStyle = _withAlpha(cPanelBg, 0.10);
                    ctx.fillRect(x0, top, x1 - x0, h);
                    ctx.restore();
                };

                const maxYearPills = 10;
                const yearPillStride = Math.max(1, Math.ceil(yearsSpan / maxYearPills));
                const yearTickStride = strideFor(yearsSpan, MAX_YEAR_TICKS);

                const monthsSpanApprox = yearsSpan * 12;
                const monthTickStride = monthsVisible ? Math.min(
                    strideFor(monthsSpanApprox, MAX_MONTH_TICKS),
                    strideFor(monthsSpanApprox, Math.max(MIN_VISIBLE_LABELS, 12))
                ) : Infinity;

                const dayCount = Math.max(1, Math.floor(spanDays) + 1);
                const dayTickStride = (daysVisible && !forceYearsOnly) ? Math.min(
                    strideFor(dayCount, MAX_DAY_TICKS),
                    strideFor(dayCount, Math.max(MIN_VISIBLE_LABELS, 1))
                ) : Infinity;

                const hourCount = Math.max(1, Math.floor(spanHours) + 1);
                const hourTickStride = (hoursVisible && !forceYearsOnly) ? Math.min(
                    strideFor(hourCount, MAX_HOUR_TICKS),
                    strideFor(hourCount, Math.max(MIN_VISIBLE_LABELS, 1))
                ) : Infinity;

                {
                    let yCur = new Date(viewStartMs);
                    yCur.setUTCMonth(0, 1);
                    yCur.setUTCHours(0, 0, 0, 0);
                    if (yCur.getTime() > viewStartMs) {
                        yCur = _utcDate(yCur.getUTCFullYear() - 1, 0, 1);
                    }

                    const hardYearLoopCap = 5000;

                    for (let guard = 0; guard < hardYearLoopCap && yCur.getTime() <= viewEndMs; guard++) {
                        if (!canDrawMore(1)) break;

                        const ms = yCur.getTime();
                        if (ms >= viewStartMs && ms <= viewEndMs) {
                            const y = yCur.getUTCFullYear();

                            if (((y - startYear) % yearTickStride) === 0) {
                                const x = _grid.X((ms - startMs) / hourToMs);
                                if (drawTick(x, 11, true)) {
                                    if (((y - startYear) % yearPillStride) === 0) {
                                        drawYearPill(x, y);
                                    }
                                }
                            }
                        }

                        yCur = _utcDate(yCur.getUTCFullYear() + 1, 0, 1);
                    }
                }

                if (monthsVisible) {
                    let mCur = new Date(viewStartMs);
                    mCur.setUTCDate(1);
                    mCur.setUTCHours(0, 0, 0, 0);
                    if (mCur.getTime() > viewStartMs) {
                        mCur = _utcDate(mCur.getUTCFullYear(), mCur.getUTCMonth() - 1, 1);
                    }

                    let monthIdx = 0;
                    const hardMonthLoopCap = 4000;

                    for (let guard = 0; guard < hardMonthLoopCap && mCur.getTime() <= viewEndMs; guard++, monthIdx++) {
                        if (!canDrawMore(1)) break;

                        const ms = mCur.getTime();
                        if (ms >= viewStartMs && ms <= viewEndMs) {
                            if ((monthIdx % monthTickStride) === 0) {
                                const m = mCur.getUTCMonth();
                                const x = _grid.X((ms - startMs) / hourToMs);
                                if (drawTick(x, 5, false)) {
                                    drawMonthLabel(x, m);
                                    if (showQuarters && quarterMap[m] !== undefined) drawQuarterLabel(x, m);
                                }
                            }
                        }

                        mCur = _utcDate(mCur.getUTCFullYear(), mCur.getUTCMonth() + 1, 1);
                    }
                }

                const wantDays =
                    !forceYearsOnly &&
                    daysVisible &&
                    spanDays >= 1.5 &&
                    (showDaysUnderMonths || !monthsVisible);

                const wantHours =
                    !forceYearsOnly &&
                    hoursVisible &&
                    spanHours <= 72 &&
                    !monthsVisible;

                if (wantDays) {
                    let dCur = new Date(viewStartMs);
                    dCur.setUTCHours(0, 0, 0, 0);
                    if (dCur.getTime() < viewStartMs) dCur = new Date(dCur.getTime() + dayToMs);

                    let dayIdx = 0;
                    const hardDayLoopCap = 12000;

                    for (let guard = 0; guard < hardDayLoopCap && dCur.getTime() <= viewEndMs; guard++, dayIdx++) {
                        if (!canDrawMore(1)) break;

                        if ((dayIdx % dayTickStride) !== 0) {
                            dCur = new Date(dCur.getTime() + dayToMs);
                            continue;
                        }

                        const dayMs = dCur.getTime();
                        const x = _grid.X((dayMs - startMs) / hourToMs);
                        const isWeekend = (dCur.getUTCDay() === 0 || dCur.getUTCDay() === 6);

                        if (isWeekend && pxPerDay >= 6) {
                            const next = new Date(dayMs + dayToMs);
                            const x2 = _grid.X((next.getTime() - startMs) / hourToMs);
                            if (isXVisible(x) || isXVisible(x2)) {
                                shadeWeekend(Math.max(xLeft, x), Math.min(xRight, x2));
                            }
                        }

                        const weekendStroke = isWeekend ? (cArrow || cText) : null;
                        if (drawTick(x, 5, true, weekendStroke)) {
                            drawDayLabel(x, dCur, isWeekend);
                        }

                        dCur = new Date(dayMs + dayToMs);
                    }
                }

                if (wantHours) {
                    let hCur = new Date(viewStartMs);
                    hCur.setUTCMinutes(0, 0, 0);

                    const stepMs = hourTickStride * hourToMs;
                    const snapped = hCur.getTime() - (hCur.getTime() % stepMs);
                    hCur = new Date(snapped);

                    const hardHourLoopCap = 40000;

                    for (let guard = 0; guard < hardHourLoopCap && hCur.getTime() <= viewEndMs; guard++) {
                        if (!canDrawMore(1)) break;

                        if (hCur.getTime() >= viewStartMs) {
                            const x = _grid.X((hCur.getTime() - startMs) / hourToMs);
                            if (drawTick(x, 3, false)) drawHourLabel(x, hCur);
                        }

                        hCur = new Date(hCur.getTime() + stepMs);
                    }
                }

                if (totalLabelsDrawn < 10) {
                    const needed = 10 - totalLabelsDrawn;

                    const pickLabelAndMs = (t) => {
                        const ms = viewStartMs + t * (viewEndMs - viewStartMs);
                        const d = new Date(ms);

                        if (forceYearsOnly) return { text: _yearLabel(d.getUTCFullYear()), ms };
                        if (monthsVisible) return { text: monthNames[d.getUTCMonth()], ms };
                        if (daysVisible && spanDays >= 1) return { text: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, ms };
                        return { text: _yearLabel(d.getUTCFullYear()), ms };
                    };

                    ctx.save();
                    applyShadow("text");
                    ctx.font = `${Math.max(9, baseFontSize - 2)}px ${fontFamily}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = cLine;

                    const fallbackY = cymin + 80;

                    for (let i = 0; i < needed && canDrawMore(1); i++) {
                        const t = (i + 1) / (needed + 1);
                        const { text, ms } = pickLabelAndMs(t);
                        const world = (ms - startMs) / hourToMs;
                        const x = _grid.X(world);
                        if (!isXVisible(x)) continue;

                        if (drawTick(x, 2, false)) {
                            ctx.fillText(text, x, fallbackY);
                            noteLabel(1);
                        }
                    }

                    ctx.restore();
                }

                {
                    const xStart = _grid.X(vMin);
                    const xEnd = _grid.X(vMax);

                    const labelY = cymin + 62;
                    const padX = 8, pillH = 18;

                    ctx.save();
                    ctx.font = `${baseFontSize}px ${fontFamily}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";

                    const fmtMDY_BCE = (d) => {
                        const m = d.getUTCMonth() + 1;
                        const da = d.getUTCDate();
                        const y = d.getUTCFullYear();
                        return `${m}/${da}/${_yearLabel(y)}`;
                    };

                    const drawPill = (x, text) => {
                        if (!isXVisible(x)) return;
                        const w = ctx.measureText(text).width + padX * 2;
                        applyShadow("panel");
                        ctx.beginPath();
                        ctx.ellipse(x, labelY, w / 2, pillH / 2, 0, 0, Math.PI * 2);
                        ctx.fillStyle = (panelOpacity < 1) ? _withAlpha(cPanelBg, panelOpacity) : cPanelBg;
                        ctx.fill();
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = cPanelBorder;
                        ctx.stroke();

                        applyShadow("text");
                        ctx.fillStyle = cText;
                        ctx.fillText(text, x, labelY);
                    };

                    drawPill(xStart, fmtMDY_BCE(viewStartDate));
                    drawPill(xEnd, fmtMDY_BCE(viewEndDate));

                    ctx.restore();
                    noteLabel(2);
                }

                if (this.showNowBar && canDrawMore(1)) {
                    const now = new Date();
                    const nowWorld = (now.getTime() - startMs) / hourToMs;
                    if (nowWorld >= vMin && nowWorld <= vMax) {
                        const nowX = _grid.X(nowWorld);
                        if (isXVisible(nowX)) {
                            ctx.save();
                            const nowColor = cArrow || cHandle || cLine;
                            applyShadow("arrow");

                            ctx.beginPath();
                            ctx.moveTo(nowX, cymin + 20);
                            ctx.lineTo(nowX, cymin - 5);
                            ctx.strokeStyle = nowColor;
                            ctx.lineWidth = Math.max(2, lineWidth);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(nowX, cymin - 5);
                            ctx.lineTo(nowX - 5, cymin + 5);
                            ctx.lineTo(nowX + 5, cymin + 5);
                            ctx.closePath();
                            ctx.fillStyle = nowColor;
                            ctx.fill();

                            applyShadow("text");
                            ctx.font = `${Math.max(9, baseFontSize - 2)}px ${fontFamily}`;
                            ctx.fillStyle = nowColor;
                            ctx.textAlign = "center";
                            ctx.textBaseline = "top";
                            const nowLabel = `${now.getUTCMonth() + 1}/${now.getUTCDate()} ${now.getUTCHours()}:${now.getUTCMinutes().toString().padStart(2, "0")} UTC`;
                            ctx.fillText(nowLabel, nowX, cymin + 35);

                            ctx.restore();
                            noteLabel(1);
                            noteTick(1);
                        }
                    }
                }

                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = lineWidth;

                function _withAlpha(color, a) {
                    if (typeof color !== "string") return `rgba(255,255,255,${a})`;
                    const c = color.trim();

                    const m = c.match(/^(rgba|hsla)\((.+)\)$/i);
                    if (m) {
                        const parts = m[2].split(",").map(s => s.trim());
                        if (parts.length >= 4) parts[3] = String(a);
                        else parts.push(String(a));
                        return `${m[1]}(${parts.join(", ")})`;
                    }

                    const m2 = c.match(/^(rgb|hsl)\((.+)\)$/i);
                    if (m2) return `${m2[1]}a(${m2[2]}, ${a})`;

                    const hex = c.replace("#", "");
                    if (hex.length === 3) {
                        const r = parseInt(hex[0] + hex[0], 16);
                        const g = parseInt(hex[1] + hex[1], 16);
                        const b = parseInt(hex[2] + hex[2], 16);
                        return `rgba(${r},${g},${b},${a})`;
                    }
                    if (hex.length === 6) {
                        const r = parseInt(hex.slice(0, 2), 16);
                        const g = parseInt(hex.slice(2, 4), 16);
                        const b = parseInt(hex.slice(4, 6), 16);
                        return `rgba(${r},${g},${b},${a})`;
                    }

                    return `rgba(255,255,255,${a})`;
                }
            }

            drawXAxisTimeTicks_HEIGHT(ctx, _grid, minVal, maxVal, showQuarters = true) {
                const startDate = this.startDate;
                const hourToMs = 3600 * 1000;
                const rawStartTime = startDate.getTime() + minVal * hourToMs;
                const rawEndTime = startDate.getTime() + maxVal * hourToMs;
                const timeSpan = rawEndTime - rawStartTime;
                const pad = timeSpan * 0.10;
                const viewStartTime = rawStartTime - pad;
                const viewEndTime = rawEndTime + pad;

                const xstart = (this.grid.Xwc(-this.grid.xi * 2));
                const xend = (this.grid.Xwc(ctx.canvas.width - this.grid.xi * 2));
                const screendisplayStart = formatTime(xstart, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);
                const screendisplayEnd = formatTime(xend, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);

                const screenStartDate = new Date(screendisplayStart);
                const screenEndDate = new Date(screendisplayEnd);

                ctx.lineWidth = 1;
                ctx.shadowBlur = 0;

                let cymin = _grid.Y(_grid.ymin);
                const canvasWidth = ctx.canvas.width;

                if (cymin > ctx.canvas.height) {
                    const tickBaseY = ctx.canvas.height - 20;

                    const pxPerHour = _grid.X(minVal + 1) - _grid.X(minVal);
                    const pxPerDay = pxPerHour * 24;
                    const pxPerMonth = pxPerDay * 30;

                    const showMonths = pxPerMonth >= 45;
                    const showDays = pxPerDay >= 20;
                    const showHours = pxPerHour >= 10;

                    const viewStartDate = new Date(viewStartTime);
                    const viewEndDate = new Date(viewEndTime);
                    const startYear = viewStartDate.getFullYear();
                    const endYear = viewEndDate.getFullYear();
                    const yearSpan = endYear - startYear + 1;

                    const canvasX0 = _grid.X(minVal);
                    const canvasX1 = _grid.X(maxVal);
                    const pixelSpan = Math.abs(canvasX1 - canvasX0);
                    const pxPerYear = pixelSpan / yearSpan;

                    let yearInterval = 1;
                    if (pxPerYear < 100) yearInterval = 5;
                    if (pxPerYear < 60) yearInterval = 10;
                    if (pxPerYear < 30) yearInterval = 20;
                    if (pxPerYear < 15) yearInterval = 100;

                    const isIntervalYear = (y) => y % yearInterval === 0;

                    for (let year = startYear; year <= endYear; year++) {
                        for (let m = 0; m < 12; m++) {
                            const isJan = m === 0;
                            const isQuarter = quarterMap[m] !== undefined;
                            if (!isIntervalYear(year) && !showMonths && !(showQuarters && isQuarter)) continue;

                            const date = new Date(year, m, 1);

                            const ms = date.getTime();
                            const hourOffset = (ms - startDate.getTime()) / hourToMs;
                            const position = _grid.X(hourOffset);
                            if (position < 0 || position > canvasWidth) continue;

                            const isMajor = isJan && isIntervalYear(year);
                            const tickLength = isMajor ? 8 : 5;

                            ctx.beginPath();
                            ctx.moveTo(position, tickBaseY);
                            ctx.lineTo(position, tickBaseY - tickLength);
                            ctx.strokeStyle = isMajor ? '#000' : '#999';
                            ctx.stroke();

                            const textY = tickBaseY - tickLength - 4;

                            if (isMajor) {
                                const yearLabel = `${year}`;
                                ctx.save();
                                ctx.font = 'bold 14px Arial';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';

                                const textWidth = ctx.measureText(yearLabel).width;
                                const ovalWidth = textWidth + 16;
                                const ovalHeight = 20;
                                const textOvalY = tickBaseY - 30;

                                if (position - ovalWidth / 2 >= 0 && position + ovalWidth / 2 <= canvasWidth) {
                                    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
                                    ctx.shadowBlur = 6;
                                    ctx.shadowOffsetX = 0;
                                    ctx.shadowOffsetY = 2;

                                    ctx.beginPath();
                                    ctx.ellipse(position, textOvalY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                                    ctx.fill();
                                    ctx.lineWidth = 1;
                                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                                    ctx.stroke();

                                    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                                    ctx.shadowBlur = 2;
                                    ctx.fillStyle = '#111';
                                    ctx.fillText(yearLabel, position, textOvalY);
                                }
                                ctx.restore();
                            } else if (showMonths) {
                                const monthLabel = monthNames[m];
                                ctx.save();
                                ctx.font = '24px Arial';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'bottom';

                                if (position >= 0 && position <= canvasWidth) {
                                    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
                                    ctx.shadowBlur = 6;
                                    ctx.shadowOffsetX = 0;
                                    ctx.shadowOffsetY = 2;

                                    ctx.fillStyle = '#444';
                                    ctx.translate(position, textY - 5);
                                    ctx.fillText(monthLabel, 0, 0);
                                    ctx.restore();

                                    if (showQuarters && isQuarter) {
                                        const quarterLabel = quarterMap[m];
                                        ctx.font = '10px Arial';
                                        ctx.fillStyle = '#666';
                                        ctx.textAlign = 'center';
                                        ctx.fillText(quarterLabel, position, textY - 45);
                                    }
                                }
                            } else if (showQuarters && isQuarter) {
                                const quarterLabel = quarterMap[m];
                                if (position >= 0 && position <= canvasWidth) {
                                    ctx.font = '11px Arial';
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'bottom';
                                    ctx.fillStyle = '#666';
                                    ctx.fillText(quarterLabel, position, textY - 30);
                                }
                            }
                        }
                    }

                    if (showDays) {
                        const oneDayMs = 24 * hourToMs;
                        let dayTs = new Date(Math.max(viewStartTime, screenStartDate.getTime()));
                        dayTs.setHours(0, 0, 0, 0);
                        let ts = dayTs.getTime();
                        const maxDays = 1000;
                        let dayCount = 0;

                        while (ts <= viewEndTime && dayCount++ < maxDays) {
                            const date = new Date(ts);
                            const hourOffset = (ts - startDate.getTime()) / hourToMs;
                            const position = _grid.X(hourOffset);

                            if (position >= 0 && position <= canvasWidth) {
                                ctx.beginPath();
                                ctx.moveTo(position, tickBaseY);
                                ctx.lineTo(position, tickBaseY - 5);
                                ctx.strokeStyle = '#777';
                                ctx.stroke();

                                const label = `${date.getDate()}`;
                                const dayLabel = dayAbbr[date.getDay()];
                                ctx.font = '12px Arial';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'bottom';
                                ctx.fillStyle = '#555';
                                ctx.fillText(label, position, tickBaseY - 30);
                                ctx.font = '16px Arial';
                                ctx.fillText(dayLabel, position, tickBaseY - 50);
                            }

                            ts += oneDayMs;
                        }
                    }

                    if (showHours && pxPerHour >= 20) {
                        const maxTicks = 10000;
                        let tickCount = 0;

                        let stepMs = 15 * 60 * 1000;
                        let formatFn = (date) => {
                            const h = date.getHours();
                            const m = date.getMinutes().toString().padStart(2, '0');
                            return `${h}:${m}`;
                        };

                        if (pxPerHour >= 20 && pxPerHour < 100) {
                            stepMs = 60 * 60 * 1000;
                            formatFn = (date) => `${date.getHours()}:00`;
                        } else if (pxPerHour >= 100) {
                            stepMs = 30 * 60 * 1000;
                            formatFn = (date) => {
                                const h = date.getHours();
                                const m = date.getMinutes().toString().padStart(2, '0');
                                return `${h}:${m}`;
                            };
                        }

                        let startMs = screenStartDate.getTime();
                        startMs -= startMs % stepMs;
                        let currentTime = new Date(startMs);

                        while (currentTime <= screenEndDate && tickCount++ < maxTicks) {
                            const positionC = timeToX(
                                currentTime,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );
                            const position = this.grid.X(positionC);

                            if (position >= 0 && position <= canvasWidth) {
                                ctx.beginPath();
                                ctx.moveTo(position, tickBaseY);
                                ctx.lineTo(position, tickBaseY - 3);
                                ctx.strokeStyle = '#aaa';
                                ctx.stroke();

                                const label = formatFn(currentTime);
                                ctx.font = '9px Arial';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'bottom';
                                ctx.fillStyle = '#888';
                                ctx.fillText(label, position, tickBaseY - 8);
                            }

                            currentTime = new Date(currentTime.getTime() + stepMs);
                        }
                    }
                }

                if (this.showNowBar) {
                    const now = new Date();
                    const currentOffsetHours = (now.getTime() - startDate.getTime()) / hourToMs;
                    const nowX = _grid.X(currentOffsetHours);

                    cymin = ctx.canvas.height - 10;

                    if (nowX >= _grid.X(minVal) && nowX <= _grid.X(maxVal)) {
                        ctx.shadowColor = '#2bff00';
                        ctx.shadowBlur = 4;

                        ctx.beginPath();
                        ctx.moveTo(nowX, cymin + 20);
                        ctx.lineTo(nowX, cymin - 15);
                        ctx.strokeStyle = 'blue';
                        ctx.lineWidth = 4;
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(nowX, cymin - 15);
                        ctx.lineTo(nowX - 5, cymin + 15);
                        ctx.lineTo(nowX + 5, cymin + 15);
                        ctx.closePath();
                        ctx.fillStyle = 'blue';
                        ctx.fill();

                        ctx.shadowColor = 'transparent';
                        ctx.shadowBlur = 0;

                        ctx.font = '10px Arial';
                        ctx.fillStyle = 'blue';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';

                        const nowLabel = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
                        ctx.fillText(nowLabel, nowX, cymin - 20);
                    }
                }

                if (this.maximize) {

                    const centerDateMs = (screenStartDate.getTime() + screenEndDate.getTime()) / 2;
                    const centerDate = new Date(centerDateMs);
                    ctx.save();
                    ctx.font = 'bold 48px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'rgba(50, 50, 50, 0.08)';
                    const centerX = ctx.canvas.width / 2;
                    const centerY = ctx.canvas.height / 2;

                    const centerDateLabel = centerDate.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });

                    ctx.fillText(centerDateLabel, centerX, centerY);
                    ctx.restore();
                }

            }

            getHeight() {
                return this.grid.height;
            }

            getWidth(pt) {
                return this.grid.width;
            }

            inside(grid, x, y, convert) {
                if (smenu) {
                    return true;
                }
                grid.rescale();
                let screen_width = (this.getWidth());
                let screen_height = (this.getHeight())
                let scy = (y)
                let scx = (x)
                if (convert) {
                    scx = grid.X(x)
                    scy = grid.Y(y)
                }

                let _scy = (this.grid.yi);
                let _sc = (this.grid.xi);
                let value = this.isMouseInTab(x, y)
                if (value != null) {
                    return true;
                }

                if (scx > _sc - this.margin.left && scx < _sc + screen_width + this.margin.right) {

                    if (scy > _scy - this.margin.top &&
                        scy < _scy + screen_height + this.margin.bottom) {

                        return true;
                    }
                }

                return false;

            }

            drawRegions(context, grid, toleranceFactor = 0.25) {
                const rect_screen_height = Math.abs(grid.height);
                const rect_screen_width = Math.abs(grid.width);
                const rectYi = grid.yi;
                const rectXi = grid.xi;

                const regions = {
                    "bottom center": [rectXi + rect_screen_width / 2, rectYi + rect_screen_height],
                    "bottom right": [rectXi + rect_screen_width, rectYi + rect_screen_height],
                    "bottom left": [rectXi, rectYi + rect_screen_height],
                    "upper right": [rectXi + rect_screen_width, rectYi],
                    "upper center": [rectXi + rect_screen_width / 2, rectYi],
                    "upper left": [rectXi, rectYi],
                    "left center": [rectXi, rectYi + rect_screen_height / 2],
                    "right center": [rectXi + rect_screen_width, rectYi + rect_screen_height / 2],
                };

                context.strokeStyle = 'blue';
                for (const [_, [x, y]] of Object.entries(regions)) {
                    context.strokeRect(x - rect_screen_width * toleranceFactor / 2, y - rect_screen_height * toleranceFactor / 2, rect_screen_width * toleranceFactor, rect_screen_height * toleranceFactor);
                }
            }

            isCloseToPoint(x, y, position, toleranceFactor = 0.25) {

                let rect_screen_height = Math.abs((this.grid.height));
                let rect_screen_width = Math.abs((this.grid.width));
                let rectYi = (this.grid.yi);
                let rectXi = (this.grid.xi);

                let scy = (y);
                let scx = (x);

                let target_x = 0, target_y = 0;

                switch (position.toLowerCase()) {
                    case "bottom center":
                        target_x = rectXi + rect_screen_width / 2;
                        target_y = rectYi + rect_screen_height;
                        break;
                    case "bottom right":
                        target_x = rectXi + rect_screen_width;
                        target_y = rectYi + rect_screen_height;
                        break;
                    case "bottom left":
                        target_x = rectXi;
                        target_y = rectYi + rect_screen_height;
                        break;
                    case "upper right":
                        target_x = rectXi + rect_screen_width;
                        target_y = rectYi;
                        break;
                    case "upper center":
                        target_x = rectXi + rect_screen_width / 2;
                        target_y = rectYi;
                        break;
                    case "upper left":
                        target_x = rectXi;
                        target_y = rectYi;
                        break;
                    case "left center":
                        target_x = rectXi;
                        target_y = rectYi + rect_screen_height / 2;
                        break;
                    case "right center":
                        target_x = rectXi + rect_screen_width;
                        target_y = rectYi + rect_screen_height / 2;
                        break;
                    default:
                        throw new Error("Invalid position specified");
                }

                let tolerance_x = rect_screen_width * toleranceFactor;
                let tolerance_y = rect_screen_height * toleranceFactor;

                return (
                    Math.abs(scy - target_y) <= tolerance_y &&
                    Math.abs(scx - target_x) <= tolerance_x
                );
            }

            bottomCenter(grid, x, y) {

                let rect_screen_height = Math.abs(grid.screenHeight(this.grid.height));
                let rect_screen_width = Math.abs(grid.screenWidth(this.grid.width));
                let rectYi = grid.Y(this.grid.yi);
                let rectXi = grid.X(this.grid.xi);

                let scy = grid.Y(y);
                let scx = grid.X(x);

                let center_x = rectXi + rect_screen_width / 2;
                let center_y = rectYi + rect_screen_height;

                let tolerance_x = rect_screen_width * toleranceFactor;
                let tolerance_y = rect_screen_height * toleranceFactor;

                return (
                    Math.abs(scy - center_y) <= tolerance_y &&
                    Math.abs(scx - center_x) <= tolerance_x
                );
            }

            inButtons(x, y, pt) {
                let b = this.buttons;
                let init = (this.grid.xi + this.grid.width - (bsize * this.buttons.length));
                if (init < 0) {
                    init = (0)
                }
                let index = 0;
                for (let button of b) {
                    let buttonX = init + index * bsize;

                    let buttonY = (this.grid.yi - (this.margin.top));
                    let screen_height = (this.getHeight());
                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }

                    let bbw = bsize;
                    index++;
                    if (
                        x >= buttonX &&
                        x <= buttonX + bbw &&
                        y >= buttonY &&
                        y <= buttonY + button.height
                    ) {
                        button.highlight()
                        return true;
                    }
                }
                return false;
            }

            inResize(mouseX, mouseY) {

                const rectWidth = Math.abs(this.grid.width);
                const rectHeight = Math.abs(this.grid.height);
                const cornerSize = 40;
                const bottomRightStartX = this.grid.xi + rectWidth + 40;
                const bottomRightStartY = this.grid.yi + rectHeight + 40;

                const cornerX = bottomRightStartX - cornerSize
                const cornerY = bottomRightStartY - cornerSize
                return (
                    mouseX >= cornerX &&
                    mouseX <= cornerX + cornerSize &&
                    mouseY >= cornerY &&
                    mouseY <= cornerY + cornerSize
                );

            }

            exportTimelinesToGantt(opts = {}) {
                const {
                    format = "csv",
                    dateOut = "date",
                    taskKey = "label",
                    filename
                } = opts;

                const points = (this.scatterData && this.scatterData.points) || [];

                const toDate = (x) =>
                    formatTime(x, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate);

                const outDate = (d) => {
                    if (!d) return "";
                    if (dateOut === "iso") return d.toISOString();

                    const y = d.getUTCFullYear();
                    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
                    const day = String(d.getUTCDate()).padStart(2, "0");
                    return `${y}-${m}-${day}`;
                };

                const getLabel = (p) =>
                    p[taskKey] ?? p.name ?? p.title ?? p.text ?? p.id ?? "Untitled";

                const tasks = [];
                const milestones = [];

                for (const p of points) {
                    if (p?.type === "interval") {

                        const s = toDate(p.startX);
                        const e = toDate(p.x);
                        if (!s || !e) continue;
                        tasks.push({
                            task: String(getLabel(p)),
                            start: outDate(s),
                            end: outDate(e),
                            progress: p.progress ?? "",
                            resources: Array.isArray(p.assignees)
                                ? p.assignees.join(";")
                                : (p.owner ?? p.resource ?? ""),
                            notes: p.notes ?? p.description ?? ""
                        });
                    } else {

                        const tp = p.x ?? p.startX;
                        if (tp == null) continue;
                        const d = toDate(tp);
                        if (!d) continue;
                        milestones.push({
                            task: String(getLabel(p)),
                            date: outDate(d),
                            milestone: true,
                            notes: p.notes ?? p.description ?? ""
                        });
                    }
                }

                const csvq = (s) => {
                    const v = s == null ? "" : String(s);
                    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
                };

                const asCSV = () => {
                    const headers = [
                        "Task", "Start", "End", "Milestone", "Progress", "Resources", "Notes"
                    ];
                    const rows = [];
                    for (const t of tasks) {
                        rows.push([
                            csvq(t.task), t.start, t.end, "", csvq(t.progress ?? ""),
                            csvq(t.resources ?? ""), csvq(t.notes ?? "")
                        ]);
                    }
                    for (const m of milestones) {
                        rows.push([
                            csvq(m.task), m.date, m.date, "TRUE", "", "", csvq(m.notes ?? "")
                        ]);
                    }
                    return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
                };

                const asJSON = () => JSON.stringify({ tasks, milestones }, null, 2);

                const asMermaid = () => {
                    const lines = [];
                    lines.push("gantt");
                    lines.push("    dateFormat  YYYY-MM-DD");
                    lines.push("    axisFormat  %Y-%m-%d");
                    lines.push("    title Timeline Export");

                    if (tasks.length) {
                        lines.push("    section Schedule");
                        for (const t of tasks) {
                            const id = String(t.task).toLowerCase().replace(/[^a-z0-9]+/g, "-");
                            lines.push(`    ${String(t.task).replace(/:/g, "-")} :${id}, ${t.start}, ${t.end}`);
                        }
                    }
                    if (milestones.length) {
                        lines.push("    section Milestones");
                        for (const m of milestones) {
                            const id = String(m.task).toLowerCase().replace(/[^a-z0-9]+/g, "-");
                            lines.push(`    ${String(m.task).replace(/:/g, "-")} :milestone, ${id}, ${m.date}, 0d`);
                        }
                    }
                    return lines.join("\n");
                };

                const out =
                    format === "json" ? asJSON() :
                        format === "mermaid" ? asMermaid() :
                            asCSV();

                // optional browser download
                if (typeof window !== "undefined" && filename) {
                    const mime = format === "json" ? "application/json"
                        : format === "mermaid" ? "text/plain"
                            : "text/csv";
                    const blob = new Blob([out], { type: mime });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const ext = format === "json" ? ".json" : format === "mermaid" ? ".mmd" : ".csv";
                    a.download = filename.endsWith(ext) ? filename : filename + ext;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                }

                return out;
            }

        }
        return resolve(MPlot)
    })

}
