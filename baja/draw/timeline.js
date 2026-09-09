function (pm, grid, start_date, end_date) {

    const platetrack = pm.plateTrack;

    // ------------------------------------------------------------------
    // Visual constants for the drag preview
    // ------------------------------------------------------------------
    const STYLE = {
        fill: 'rgba(37, 99, 235, 0.07)',
        stroke: '#2563eb',
        baseline: '#1e293b',
        tick: '#475569',
        text: '#0f172a',
        muted: '#64748b',
        labelBg: 'rgba(255, 255, 255, 0.94)',
        labelBorder: 'rgba(15, 23, 42, 0.18)',
        font: '12px Inter, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif',
        fontBold: '600 12px Inter, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif',
        fontSmall: '11px Inter, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif'
    };

    const MIN_WIDTH_PX = 400;
    const MIN_HEIGHT_PX = 220;
    const DEFAULT_WIDTH_PX = 800;
    const DEFAULT_HEIGHT_PX = 300;
    const ACCENT = '#2563eb';
    const MS_PER_HOUR = 1000 * 60 * 60;
    const MS_PER_DAY = MS_PER_HOUR * 24;

    // ------------------------------------------------------------------
    // Date helpers
    // ------------------------------------------------------------------
    function dateFromCanvasX(x, xMin, xMax, start, end) {
        const totalCanvasRange = xMax - xMin;
        const totalTimeRange = end.getTime() - start.getTime();
        if (!isFinite(totalCanvasRange) || totalCanvasRange === 0) return new Date(start);
        const normalizedX = (x - xMin) / totalCanvasRange;
        return new Date(start.getTime() + normalizedX * totalTimeRange);
    }

    function isValidDate(d) {
        return d instanceof Date && !isNaN(d.getTime());
    }

    function toDate(d) {
        if (isValidDate(d)) return d;
        const parsed = new Date(d);
        return isValidDate(parsed) ? parsed : null;
    }

    function fmtShort(d) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function fmtLong(d) {
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }

    function describeSpan(start, end) {
        const ms = Math.abs(end - start);
        const days = Math.round(ms / MS_PER_DAY);
        if (days < 1) {
            const hours = Math.max(1, Math.round(ms / MS_PER_HOUR));
            return hours === 1 ? '1 hour' : `${hours} hours`;
        }
        if (days < 60) return days === 1 ? '1 day' : `${days} days`;

        const months = Math.round(days / 30.4375);
        if (months < 24) return `${months} months`;

        const years = Math.floor(months / 12);
        const rem = months % 12;
        const y = years === 1 ? '1 year' : `${years} years`;
        if (rem === 0) return y;
        return `${y} ${rem} ${rem === 1 ? 'month' : 'months'}`;
    }

    // Ensure a sane, ordered range with a non-zero span.
    function normalizeRange(start, end) {
        let s = toDate(start) || new Date();
        let e = toDate(end);
        if (!e) {
            e = new Date(s);
            e.setFullYear(s.getFullYear() + 1);
        }
        if (e < s) {
            const t = s; s = e; e = t;
        }
        if (e.getTime() === s.getTime()) {
            e = new Date(s.getTime() + MS_PER_DAY);
        }
        return { start: s, end: e };
    }

    if (!grid) {
        const r = normalizeRange(start_date, end_date);
        start_date = r.start;
        end_date = r.end;
    }

    // ------------------------------------------------------------------
    // Canvas drawing helpers (screen coordinates)
    // ------------------------------------------------------------------
    function roundedRectPath(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function drawPill(ctx, text, cx, cy, options = {}) {
        const {
            font = STYLE.font,
            color = STYLE.text,
            bg = STYLE.labelBg,
            border = STYLE.labelBorder,
            padX = 8,
            padY = 4,
            align = 'center'
        } = options;

        ctx.save();
        ctx.font = font;
        ctx.textBaseline = 'middle';
        const w = ctx.measureText(text).width + padX * 2;
        const h = 20 + (padY - 4) * 2;
        let x = cx - w / 2;
        if (align === 'left') x = cx;
        if (align === 'right') x = cx - w;
        const y = cy - h / 2;

        ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = bg;
        roundedRectPath(ctx, x, y, w, h, h / 2);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(text, x + w / 2, cy + 0.5);
        ctx.restore();
        return { x, y, w, h };
    }

    // ------------------------------------------------------------------
    // Drag handler
    // ------------------------------------------------------------------
    const hd = {
        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,
        id: 'override-arrow-draw',

        rect: () => {
            const x = Math.min(hd.startX, hd.currentX);
            const y = Math.min(hd.startY, hd.currentY);
            const w = Math.abs(hd.currentX - hd.startX);
            const h = Math.abs(hd.currentY - hd.startY);
            return { x, y, w, h };
        },

        reset: () => {
            hd.startX = null;
            hd.startY = null;
            hd.currentX = null;
            hd.currentY = null;
        },

        // Dates to show while dragging. When a parent grid supplies the
        // time scale, the end follows the cursor; otherwise the preset range.
        previewDates: () => {
            if (grid && isValidDate(start_date) && isValidDate(end_date)) {
                const mdate = grid.Xwc(hd.currentX + grid.xi * 2);
                const d = dateFromCanvasX(mdate, grid.xmin, grid.xmax, start_date, end_date);
                return normalizeRange(start_date, d);
            }
            return normalizeRange(start_date, end_date);
        },

        draw: (g, ctx) => {
            if (hd.startX === null || hd.startY === null) return;
            const r = hd.rect();
            if (r.w < 2 && r.h < 2) return;

            ctx.save();

            // Selection frame
            ctx.fillStyle = STYLE.fill;
            roundedRectPath(ctx, r.x, r.y, r.w, r.h, 6);
            ctx.fill();
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = STYLE.stroke;
            ctx.stroke();
            ctx.setLineDash([]);

            // Corner handles
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = STYLE.stroke;
            ctx.lineWidth = 1.5;
            for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
                ctx.beginPath();
                ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            // Timeline preview inside the frame
            const showPreview = r.w >= 140 && r.h >= 60;
            if (showPreview) {
                const inset = Math.min(28, r.w * 0.08);
                const x0 = r.x + inset;
                const x1 = r.x + r.w - inset;
                const yb = r.y + r.h * 0.62;

                // Baseline
                ctx.strokeStyle = STYLE.baseline;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x0, yb);
                ctx.lineTo(x1, yb);
                ctx.stroke();

                // Ticks (end caps taller, interior ticks shorter)
                const tickCount = r.w >= 600 ? 8 : r.w >= 320 ? 4 : 2;
                ctx.strokeStyle = STYLE.tick;
                ctx.lineWidth = 1.5;
                for (let i = 0; i <= tickCount; i++) {
                    const tx = x0 + (x1 - x0) * (i / tickCount);
                    const th = (i === 0 || i === tickCount) ? 10 : 5;
                    ctx.beginPath();
                    ctx.moveTo(tx, yb - th);
                    ctx.lineTo(tx, yb + th);
                    ctx.stroke();
                }

                // Milestone dots at both ends
                ctx.fillStyle = ACCENT;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                for (const tx of [x0, x1]) {
                    ctx.beginPath();
                    ctx.arc(tx, yb, 5.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }

                // Date labels
                const { start, end } = hd.previewDates();
                const labelY = yb + 22;
                if (r.w >= 260) {
                    drawPill(ctx, fmtShort(start), x0, labelY, { align: 'left', font: STYLE.fontBold });
                    drawPill(ctx, fmtShort(end), x1, labelY, { align: 'right', font: STYLE.fontBold });
                }

                // Span summary above the baseline
                if (r.h >= 90) {
                    const summary = `${describeSpan(start, end)}`;
                    drawPill(ctx, summary, (x0 + x1) / 2, yb - 22, {
                        font: STYLE.fontSmall,
                        color: STYLE.muted
                    });
                }
            }

            // Size readout in the frame's lower-right corner
            ctx.font = STYLE.fontSmall;
            ctx.fillStyle = STYLE.muted;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            const w = Math.max(Math.round(r.w), MIN_WIDTH_PX);
            const h = Math.max(Math.round(r.h), MIN_HEIGHT_PX);
            ctx.fillText(`${w} × ${h}`, r.x + r.w - 6, r.y + r.h - 4);

            ctx.restore();
        },

        keydown: (event) => {
            if (event.key === 'Escape') {
                hd.cancel();
            }
        },

        cancel: () => {
            hd.reset();
            platetrack.wb(null);
            platetrack.setMessage('');
        },

        mouseDownListener: async (x, y) => {
            hd.startX = x;
            hd.startY = y;
            hd.currentX = x;
            hd.currentY = y;

            if (grid && !isValidDate(start_date)) {
                const mdate = grid.Xwc(x + grid.xi * 2);
                start_date = dateFromCanvasX(mdate, grid.xmin, grid.xmax, start_date || new Date(), end_date || new Date());
            }
        },

        mouseMoveListener: (x, y) => {
            if (hd.isDrawing && hd.startX !== null) {
                hd.currentX = x;
                hd.currentY = y;
            }
        },

        mouseUpListener: async (x, y) => {
            if (!hd.isDrawing || hd.startX === null) return;

            hd.currentX = x;
            hd.currentY = y;

            if (grid && isValidDate(start_date) && isValidDate(end_date)) {
                const mdate = grid.Xwc(x + grid.xi * 2);
                end_date = dateFromCanvasX(mdate, grid.xmin, grid.xmax, start_date, end_date);
            }

            const r = normalizeRange(start_date, end_date);
            start_date = r.start;
            end_date = r.end;

            hd.openDialog();
        },

        openDialog: () => {
            let titleBox = null;
            const defaultTitle = `${fmtShort(start_date)} – ${fmtShort(end_date)}`;

            const finish = () => {
                hideAllModal();
                hd.reset();
                platetrack.wb(null);
                setTimeout(() => {
                    CurrentLayout.reset('mainPanel');
                }, 300);
            };

            const sectionLabel = (text) => ({
                'width': '100%',
                'component': {
                    wid: 'html',
                    data: `<div style="padding:14px 16px 4px;font:600 11px/1.2 Inter,'Segoe UI',system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#64748b;">${text}</div>`
                }
            });

            const main_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `
                                    <div style="padding:16px 16px 8px;border-bottom:1px solid #e2e8f0;font-family:Inter,'Segoe UI',system-ui,sans-serif;">
                                        <div style="font-size:18px;font-weight:600;color:#0f172a;">New timeline</div>
                                        <div style="margin-top:4px;font-size:13px;color:#64748b;">
                                            ${fmtLong(start_date)} &rarr; ${fmtLong(end_date)}
                                            <span style="color:#94a3b8;">&middot; ${describeSpan(start_date, end_date)}</span>
                                        </div>
                                    </div>`
                            }
                        },
                        sectionLabel('Title'),
                        {
                            'width': '100%',
                            'component': {
                                wid: 'input-textfield',
                                data: {
                                    'show-button': false,
                                    'title': 'Timeline title',
                                    'text': defaultTitle,
                                    'ionHookFunction': createIonFunction((input_box) => {
                                        titleBox = input_box;
                                    })
                                }
                            }
                        },
                        sectionLabel('Start date'),
                        {
                            'width': '100%',
                            'height': '100vh',
                            'component': {
                                wid: 'calendar-chooser',
                                data: {
                                    date: start_date,
                                    select: createIonFunction((_date) => {
                                        start_date = toDate(_date) || start_date;
                                    })
                                }
                            }
                        },
                        sectionLabel('End date'),
                        {
                            'width': '100%',
                            'height': '100vh',
                            'component': {
                                wid: 'calendar-chooser',
                                data: {
                                    date: end_date,
                                    select: createIonFunction((_date) => {
                                        end_date = toDate(_date) || end_date;
                                    })
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Create timeline',
                                            ionFunction: createIonFunction(async () => {
                                                const typed = titleBox && typeof titleBox.value === 'string' ? titleBox.value.trim() : '';
                                                await hd.createTimeline(typed || defaultTitle);
                                                finish();
                                            })
                                        },
                                        {
                                            label: 'Cancel',
                                            background: '#ffffff',
                                            color: '#0f172a',
                                            borderColor: '#c8ced6',
                                            ionFunction: createIonFunction(() => {
                                                finish();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
                }
            };

            CurrentLayout.clearComponent('mainPanel');
            CurrentLayout.setComponent('mainPanel', main_layout);
        },

        createTimeline: async (title) => {
            const r = normalizeRange(start_date, end_date);
            start_date = r.start;
            end_date = r.end;

            const MPlot = await exec('flexigraph/plot');

            const spanMs = end_date - start_date;
            const spanHours = spanMs / MS_PER_HOUR;

            // Two milestones anchor the range. `date` lets the renderer
            // re-derive x whenever the plot's start/end are edited later.
            const points = [
                { x: 0, y: 0.1, name: fmtShort(start_date), date: start_date, color: ACCENT },
                { x: spanHours, y: 0.1, name: fmtShort(end_date), date: end_date, color: ACCENT }
            ];
            const scatterData = { points };

            const plot = new MPlot(scatterData);
            plot.type = 'timeline';
            plot.startDate = start_date;
            plot.endDate = end_date;
            plot.name = title;
            plot.x_axis_label = '';
            plot.y_axis_label = '';
            plot.fitScaleToData = false;
            if (typeof plot.setTheme === 'function') {
                plot.setTheme('timeline-clean');
            }
            plot.grid.zoom(0, spanHours, 0, 1);

            // Size and position from the dragged frame, with sensible minimums.
            const pgrid = platetrack.grid;
            let widthPx = DEFAULT_WIDTH_PX;
            let heightPx = DEFAULT_HEIGHT_PX;
            let left = hd.startX;
            let top = hd.startY;
            if (hd.startX !== null && hd.currentX !== null) {
                const rect = hd.rect();
                if (rect.w > 20 || rect.h > 20) {
                    widthPx = Math.max(rect.w, MIN_WIDTH_PX);
                    heightPx = Math.max(rect.h, MIN_HEIGHT_PX);
                }
                left = rect.x;
                top = rect.y;
            }

            plot.x = pgrid.Xwc(left);
            plot.y = pgrid.Ywc(top);
            plot.setWidth(pgrid.worldWidth(widthPx));
            plot.setHeight(pgrid.worldHeight(heightPx));
            plot.grid.rescale();

            platetrack.m_plots.push(plot);
            if (typeof platetrack.setSelected === 'function') {
                try { platetrack.setSelected(plot); } catch (e) { /* selection is optional */ }
            }
            return plot;
        },

        close: () => {
        }
    };

    platetrack.setMessage('Drag a rectangle where the timeline should go. Press Esc to cancel.');
    platetrack.wb(hd);
    hd.reset();
}
