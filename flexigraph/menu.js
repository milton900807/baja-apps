function () {
    return new Promise(async (resolve, reject) => {

        function getContrastColor(inputColor, context) {

            function toRGB(color) {

                context.fillStyle = color;
                const rgb = context.fillStyle;

                if (/^#[0-9A-F]{6}$/i.test(rgb)) {
                    const bigint = parseInt(rgb.slice(1), 16);
                    return {
                        r: (bigint >> 16) & 255,
                        g: (bigint >> 8) & 255,
                        b: bigint & 255
                    };
                } else if (rgb.startsWith("rgb")) {
                    const match = rgb.match(/\d+/g);
                    return { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) };
                } else {
                    throw new Error("Invalid color format");
                }
            }
            try {
                const { r, g, b } = toRGB(inputColor);

                const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);

                return luminance > 0.5 ? '#000000' : '#FFFFFF';
            } catch (error) {
                console.error("Error processing color:", error);
                return '#000000';
            }
        }
        function drawChevronRight(ctx, x, y, size, color, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY) {
            ctx.save();

            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetX = shadowOffsetX;
            ctx.shadowOffsetY = shadowOffsetY;

            ctx.fillStyle = color;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - size, y - size);
            ctx.lineTo(x - size, y - size / 2);
            ctx.lineTo(x - 2 * size, y - size / 2);
            ctx.lineTo(x - 2 * size, y + size / 2);
            ctx.lineTo(x - size, y + size / 2);
            ctx.lineTo(x - size, y + size);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }
        function drawChevronLeft(ctx, x, y, size, color, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY) {

            ctx.save();

            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetX = shadowOffsetX;
            ctx.shadowOffsetY = shadowOffsetY;

            ctx.fillStyle = color;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + size, y - size);
            ctx.lineTo(x + size, y - size / 2);
            ctx.lineTo(x + 2 * size, y - size / 2);
            ctx.lineTo(x + 2 * size, y + size / 2);
            ctx.lineTo(x + size, y + size / 2);
            ctx.lineTo(x + size, y + size);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        function drawCircle(ctx, x, y, radius) {

            if (radius < 100) {

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                ctx.lineWidth = 0;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();

                ctx.shadowColor = 'transparent';

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = 1;
            } else {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                ctx.lineWidth = 0;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = 1;
            }
        }

        function drawRoundedRect(ctx, x, y, width, height, radius, mt) {
            let color = 'rgb(32, 255, 251)'
            if (this.highlight >= 0) {
                color = this.sg;
            }

            if (mt === 'xx-small-left') {
                return drawChevronLeft(ctx, x - 5, y, 8, color, 'rgba(0, 0, 0, 0.5)', 10, 5, 5);
            } else if (mt === 'xx-small-right') {
                return drawChevronRight(ctx, x + 15, y, 8, color, 'rgba(0, 0, 0, 0.5)', 10, 5, 5);

            }

            if (width < 70) {
                drawRRect(ctx, x, y, width, height);
            } else {
                ctx.shadowColor = 'rgba(10, 10, 10, 0.6)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.lineWidth = 0;

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
                ctx.shadowColor = 'transparent';

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.lineWidth = 1;
            }

        }
        function drawRRect(ctx, x, y, width, height) {

            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 5;
            ctx.shadowOffsetY = 5;
            ctx.lineWidth = 0;

            ctx.beginPath();
            ctx.rect(x, y, width, height);
            ctx.closePath();
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.lineWidth = 1;
        }

        function menuRoundPath(ctx, x, y, w, h, r) {
            const rr = Math.max(0, Math.min(r, w / 2, h / 2));
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + w, y, x + w, y + h, rr);
            ctx.arcTo(x + w, y + h, x, y + h, rr);
            ctx.arcTo(x, y + h, x, y, rr);
            ctx.arcTo(x, y, x + w, y, rr);
            ctx.closePath();
        }

        let Menu = class Menu {
            name;
            x = 0;
            y = 0;
            color = 'white';
            list = []
            mx = -1;
            my = -1;
            highlight = -1;
            mheight = 34;
            xoffset = 0;
            yoffset = 0;
            menu_width = 300;
            title = ''
            // Discreet mode: a side menu opens as just its title chip and expands to the full
            // item list only while the pointer is over it. A menu that pops open at full size
            // covers the canvas the user is working on. Set by showSideMenu(); center menus and
            // mobile menus are never collapsed.
            collapsible = false
            collapsed = false
            collapsedW = 0
            collapsedH = 26
            sg = '#eef2f8'
            sf = '#1d4ed8'
            bg = 'rgba(255,255,255,0)'
            fg = '#344054'
            activeitems = []
            scrollIndex = 0;
            scrollTimer = null;
            columns = 1;
            menu_type = null;
            titleFont = '600 13px Arial'
            titleColor = '#111827'
            isdisplayed = false;

            static removeDuplicateLabels(items) {
                const seenLabels = new Set();
                return items.filter(item => {
                    if (seenLabels.has(item.label)) {
                        return false;
                    }
                    seenLabels.add(item.label);
                    return true;
                });
            }

            constructor(list, x, y, bg, fg, columns = 1) {
                this.x = x;
                this.y = y;

                const seenLabels = new Set();
                try {
                    this.list = list.filter(item => {
                        if (item && item.label && !seenLabels.has(item.label)) {
                            seenLabels.add(item.label);
                            return true;
                        }
                        return false;
                    });
                } catch (exception) {

                    console.log ( " exception " + this.list )

                }

                this.columns = columns;
                if (bg) this.bg = bg;
                if (fg) this.fg = fg;

            }
            // Bounds of whatever is currently on screen: the title chip when collapsed, the
            // full panel when expanded. Everything (hit-testing, hover, click) works off this
            // so collapsed and expanded stay consistent.
            __bounds(graph) {
                const xot = graph.X(this.x);
                const yot = graph.Y(this.y);
                if (this.collapsible && this.collapsed) {
                    // Prefer the rect actually drawn — on mobile the bar is bottom-anchored in
                    // screen space and bears no relation to this.x / this.y.
                    if (this.__chipRect) return this.__chipRect;
                    return { x: xot, y: yot, w: (this.collapsedW || this.menu_width || 140), h: this.collapsedH };
                }
                const w = this.menu_width * this.columns + 20 * (this.columns - 1);
                const h = this.getItemsPerColumn() * this.mheight;
                return { x: xot, y: yot, w: w, h: h };
            }
            isIn(graph, xwc, ywc) {

                let xin = graph.X(xwc) + this.xoffset;
                let yin = graph.Y(ywc) + this.yoffset;
                const b = this.__bounds(graph);

                if (xin > b.x && xin < (b.x + b.w) &&
                    yin > b.y && yin < (b.y + b.h)) {
                    return true;
                }
                this.highlight = -1;
                return false;
            }
            dehighlight() {
                this.highlight = -1;
            }
            async mouseUp(graph, x, y) {
                if (this.y === undefined) {
                    return;
                }
                // Collapsed: the chip is a target for hovering, not for choosing an item —
                // clicking it must not fire whatever item happens to sit under the pointer.
                if (this.collapsible && this.collapsed) {
                    if (this.isIn(graph, x, y)) {
                        this.collapsed = false;
                        // Repaint now: on mobile this is what opens the full menu, and without a
                        // wake the tap appears to do nothing until some other event redraws.
                        try { const g = CurrentLayout.getStashed('graph'); if (g && g.wake) g.wake(); } catch (e) { }
                    }
                    return;
                }
                if (this.isIn(graph, x, y)) {
                    let xsc = graph.X(x);
                    let ysc = graph.Y(y);

                    let column = Math.floor((xsc - graph.X(this.x)) / (this.menu_width + 20));
                    let diff = Math.abs(graph.Y(this.y) - ysc + 16);
                    let row = Math.round(diff / this.mheight);
                    let itemsPerColumn = this.getItemsPerColumn();
                    this.highlight = column * itemsPerColumn + row + this.scrollIndex;
                    if (this.highlight < this.list.length) {
                        if (this.list[this.highlight] && this.list[this.highlight].click) {
                            // Remember the item being clicked. A submenu opened from inside this
                            // handler is titled after it -- "Layers", "Models" -- which is the
                            // name the user just chose and so the one that says where they are.
                            //
                            // Kept with a TIMESTAMP rather than cleared on the next tick. Most
                            // submenus open through showSideMenuDelayed, which defers by 100ms,
                            // so a next-tick clear wiped the name before the menu it belonged to
                            // ever opened -- the title worked only for menus shown immediately.
                            // showSideMenu consumes it, and the timestamp stops a click that
                            // opened no menu from leaving a name behind for an unrelated one.
                            const __it = this.list[this.highlight];
                            try {
                                // Strip the decoration so the chip carries the NAME: the ▸ or
                                // ... that says it opens something, and a trailing "(12)" count
                                // that belongs to the parent list rather than to this menu.
                                const __lbl = ('' + ((__it && __it.label) || ''))
                                    .replace(/\s*[▸►]\s*$/, '')
                                    .replace(/\.\.\.$/, '')
                                    .replace(/\s*\(\d[\d,]*\)\s*$/, '')
                                    .trim();
                                graph.__menuParent = __lbl ? { label: __lbl, t: Date.now() } : null;
                            } catch (e) { }
                            return await __it.click(x, y);
                        }
                    }
                }

            }
            mouseMove(graph, x, y) {
                if (this.y === undefined) {
                    return;
                }

                // Expand on hover, collapse again on leave. isIn() is evaluated against the
                // CURRENT state, so a collapsed menu only expands when the pointer is over the
                // title chip, and an expanded one only collapses when the pointer leaves the
                // whole panel — not the moment it leaves the chip.
                if (this.collapsible && !((typeof isMobile === 'function') && isMobile())) {
                    const over = this.isIn(graph, x, y);
                    if (over && this.collapsed) { this.collapsed = false; this.highlight = -1; return; }
                    if (!over && !this.collapsed) { this.collapsed = true; this.highlight = -1; this.stopScrolling(); return; }
                    if (this.collapsed) { this.highlight = -1; return; }
                }

                if (this.isIn(graph, x, y)) {
                    let xsc = graph.X(x);
                    let ysc = graph.Y(y);

                    let column = Math.floor((xsc - graph.X(this.x)) / (this.menu_width + 20));

                    let diff = Math.abs(graph.Y(this.y) - ysc + 16);
                    let row = Math.round(diff / this.mheight);

                    let itemsPerColumn = this.getItemsPerColumn();
                    this.highlight = column * itemsPerColumn + row + this.scrollIndex;

                    if (this.highlight >= this.list.length) {
                        this.highlight = -1;
                    }
                } else {
                    this.highlight = -1;
                    this.stopScrolling();
                }
            }
            startScrolling(visibleItemCount) {
                this.scrollTimer = setInterval(() => {
                    this.scrollIndex = Math.min(this.scrollIndex + 1, this.list.length - visibleItemCount);
                }, 1000);
            }
            stopScrolling() {
                if (this.scrollTimer) {
                    clearInterval(this.scrollTimer);
                    this.scrollTimer = null;
                }
            }
            getVisibleItemCount(grid) {
                if (grid.height) {
                    let availableHeight = grid.height - grid.Y(this.y) - 15;
                    return Math.min(this.list.length, Math.floor(availableHeight / this.mheight));
                } else if (grid.canvas) {
                    let availableHeight = grid.canvas.height - grid.Y(this.y) - 15;
                    return Math.min(this.list.length, Math.floor(availableHeight / this.mheight));
                } else {
                    return 0;
                }
            }
            getItemsPerColumn() {
                if (!this.columns || this.columns <= 0) {
                    this.columns = 1;
                }
                return Math.ceil(this.list.length / this.columns);
            }

            draw(ctx, grid) {

                if (isMobile() && !(this.collapsible && this.collapsed) && !this.isdisplayed) {
                    const genegraph_panel_layout = CurrentLayout.getStashed('mainPanel')
                    const graph = CurrentLayout.getStashed('graph')

                    exec('flexigraph/show-mobile-menu.js', 0, 0, this.list, graph, genegraph_panel_layout, 'mainPanel')
                    this.isdisplayed = true;
                    return;
                }

                ctx.textBaseline = 'middle';
                if (!this.list) return;

                ctx.save();

                // Center menus flag this: blur + dim the whole canvas behind the menu
                // so it stands out. Drawing the canvas onto itself with a blur filter
                // frosts the already-rendered background; the panel below draws sharp.
                if (this.blurBackground) {
                    try {
                        const cnv = ctx.canvas;
                        ctx.save();
                        ctx.filter = 'blur(5px)';
                        ctx.drawImage(cnv, 0, 0, cnv.width, cnv.height);
                        ctx.filter = 'none';
                        ctx.fillStyle = 'rgba(8,22,38,0.32)';
                        ctx.fillRect(0, 0, cnv.width, cnv.height);
                        ctx.restore();
                    } catch (e) { }
                }

                // ---- Collapsed: draw ONLY the title chip -------------------------------
                // A small pill with the menu's title and a chevron. Hovering it expands the
                // full panel (see mouseMove); this keeps a side menu from covering the canvas
                // until the user actually reaches for it.
                if (this.collapsible && this.collapsed) {
                    const __mob = (typeof isMobile === 'function') && isMobile();
                    const label = ('' + (this.title || 'Menu'));
                    ctx.font = this.titleFont || (__mob ? '700 15px Arial' : '700 12px Arial');
                    const tw = ctx.measureText(label).width;
                    let w, h, cx, cy;
                    if (__mob) {
                        // Anchor to the BOTTOM of the canvas, centred and finger-sized: on a
                        // phone the menu's own x/y can be anywhere (or off-screen), and a small
                        // inline pill is neither reachable nor tappable.
                        const cw = (ctx.canvas && ctx.canvas.width) || 360;
                        const ch = (ctx.canvas && ctx.canvas.height) || 640;
                        h = 44;
                        w = Math.min(Math.max(Math.ceil(tw + 56), 180), Math.max(160, cw - 32));
                        cx = Math.round((cw - w) / 2);
                        cy = Math.round(ch - h - 18);
                    } else {
                        h = this.collapsedH;
                        w = Math.ceil(tw + 34);
                        cx = grid.X(this.x) + this.xoffset;
                        cy = grid.Y(this.y) + this.yoffset;
                    }
                    // Remember exactly what was drawn so hit-testing matches it (the bar is in
                    // screen space and has no relation to this.x / this.y).
                    this.__chipRect = { x: cx, y: cy, w: w, h: h };
                    this.collapsedW = w;
                    const r = h / 2;
                    ctx.save();
                    ctx.shadowColor = 'rgba(16,24,40,0.22)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetY = 3;
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(cx, cy, w, h, r);
                    else {
                        ctx.moveTo(cx + r, cy); ctx.lineTo(cx + w - r, cy);
                        ctx.quadraticCurveTo(cx + w, cy, cx + w, cy + r);
                        ctx.lineTo(cx + w, cy + h - r);
                        ctx.quadraticCurveTo(cx + w, cy + h, cx + w - r, cy + h);
                        ctx.lineTo(cx + r, cy + h);
                        ctx.quadraticCurveTo(cx, cy + h, cx, cy + h - r);
                        ctx.lineTo(cx, cy + r);
                        ctx.quadraticCurveTo(cx, cy, cx + r, cy);
                    }
                    ctx.closePath();
                    ctx.fillStyle = this.sunset ? '#ffb45c' : 'rgba(255,255,255,0.98)';
                    ctx.fill();
                    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(16,24,40,0.22)';
                    ctx.stroke();
                    ctx.fillStyle = this.titleColor || '#111827';
                    ctx.textBaseline = 'middle';
                    if (__mob) {
                        ctx.textAlign = 'center';
                        ctx.fillText(label, cx + w / 2, cy + h / 2 + 0.5);
                    } else {
                        ctx.textAlign = 'left';
                        ctx.fillText(label, cx + 12, cy + h / 2 + 0.5);
                    }
                    ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    ctx.strokeStyle = this.titleColor || '#111827';
                    ctx.beginPath();
                    if (__mob) {
                        // Chevron UP — the full menu opens upward from the bottom bar.
                        const ax = cx + w - 20, ay = cy + h / 2;
                        ctx.moveTo(ax - 5, ay + 3); ctx.lineTo(ax, ay - 2); ctx.lineTo(ax + 5, ay + 3);
                    } else {
                        const ax = cx + w - 15, ay = cy + h / 2;
                        ctx.moveTo(ax - 3, ay - 3); ctx.lineTo(ax + 1, ay); ctx.lineTo(ax - 3, ay + 3);
                    }
                    ctx.stroke();
                    ctx.restore();
                    ctx.restore();     // matches the ctx.save() at the top of draw()
                    return;
                }

                const itemsPerColumn = this.getItemsPerColumn();
                const borderPadding = 4;
                const itemRadius = 6;

                const px = grid.X(this.x) + this.xoffset;
                const py = grid.Y(this.y) + this.yoffset;
                const totalW = this.menu_width * this.columns + 20 * (this.columns - 1);
                const rowsH = itemsPerColumn * this.mheight;
                // An external title is drawn OUTSIDE (above) the panel, so it reserves no
                // in-panel header height; an internal title still does.
                const titleH = (this.title && !this.externalTitle) ? 24 : 0;

                // Unified menu panel: white card with soft shadow + neutral border
                const panelX = px;
                const panelY = py - titleH;
                const panelW = totalW;
                const panelH = rowsH + titleH + borderPadding;

                ctx.save();
                ctx.shadowColor = 'rgba(16,24,40,0.22)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 5;
                let __panelFill = this.panelBg || 'rgba(255,255,255,0.98)';
                if (this.sunset) {
                    // Orange sunset gradient (top-down): golden -> orange -> deep sunset.
                    try {
                        const __g = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
                        __g.addColorStop(0, '#ffd08a');
                        __g.addColorStop(0.5, '#ff9e5e');
                        __g.addColorStop(1, '#f56b4a');
                        __panelFill = __g;
                    } catch (e) { }
                }
                ctx.fillStyle = __panelFill;
                menuRoundPath(ctx, panelX, panelY, panelW, panelH, 10);
                ctx.fill();
                ctx.restore();

                ctx.lineWidth = 1;
                ctx.strokeStyle = this.panelBorder || '#d4dae3';
                menuRoundPath(ctx, panelX, panelY, panelW, panelH, 10);
                ctx.stroke();

                // Short attention glow burst when the menu first appears: a cyan
                // ring that pulses a couple of times and fades over ~0.8s.
                try {
                    if (this.__born == null) this.__born = Date.now();
                    const gel = Date.now() - this.__born;
                    const GDUR = 800;
                    if (gel < GDUR) {
                        const f = 1 - gel / GDUR;                                  // 1 -> 0
                        const pulse = 0.5 + 0.5 * Math.abs(Math.sin((gel / GDUR) * Math.PI * 2));
                        const a = f * pulse;
                        ctx.save();
                        ctx.shadowColor = 'rgba(26,163,189,' + (0.9 * a).toFixed(3) + ')';
                        ctx.shadowBlur = 12 + 24 * a;
                        ctx.lineWidth = 2 + 3 * a;
                        ctx.strokeStyle = 'rgba(26,163,189,' + (0.85 * a).toFixed(3) + ')';
                        menuRoundPath(ctx, panelX, panelY, panelW, panelH, 10);
                        ctx.stroke();
                        ctx.restore();
                        if (typeof window !== 'undefined') {
                            const gg = CurrentLayout.getStashed('graph');
                            if (gg && gg.wake) gg.wake();   // keep the loop painting the glow
                        }
                    }
                } catch (e) { }

                if (this.title && !this.externalTitle) {
                    ctx.font = this.titleFont || '600 13px Arial';
                    ctx.fillStyle = this.titleColor || '#111827';
                    ctx.textAlign = 'left';
                    ctx.fillText(this.title, panelX + 12, panelY + titleH / 2 + 1);
                } else if (this.title && this.externalTitle) {
                    // Track name as a VERTICAL chip (rotated 90°) running along the menu's
                    // right edge; flips to the left edge when there's no room on the right.
                    try {
                        ctx.save();
                        ctx.font = this.titleFont || '700 12px Arial';
                        const tw = ctx.measureText(this.title).width;
                        const chipPadX = 8, chipThick = 18;            // pill thickness across the edge
                        const chipLen = tw + chipPadX * 2;             // pill length along the edge
                        const gap = 5;
                        const cy = panelY + panelH / 2;                // vertical center of the panel
                        // Right edge by default; flip left if the pill would overflow the canvas.
                        let side = 1;
                        let centerX = panelX + panelW + gap + chipThick / 2;
                        try {
                            const cw = (ctx.canvas && ctx.canvas.width) || 0;
                            if (cw && centerX + chipThick / 2 > cw - 2) { side = -1; centerX = panelX - gap - chipThick / 2; }
                        } catch (e) { }
                        ctx.translate(centerX, cy);
                        ctx.rotate(-Math.PI / 2);                      // text reads bottom-to-top
                        ctx.shadowColor = 'rgba(16,24,40,0.28)';
                        ctx.shadowBlur = 8; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 3;
                        ctx.fillStyle = 'rgba(11,37,69,0.94)';        // navy pill
                        menuRoundPath(ctx, -chipLen / 2, -chipThick / 2, chipLen, chipThick, 6);
                        ctx.fill();
                        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                        ctx.fillStyle = '#ffd9a0';                     // warm text
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(this.title, 0, 0.5);
                        ctx.restore();
                    } catch (e) { }
                }

                for (let i = 0; i < this.list.length; i++) {
                    const column = Math.floor(i / itemsPerColumn);
                    const row = i % itemsPerColumn;
                    const menuItem = this.list[i];
                    if (!menuItem) continue;
                    const columnXOffset = column * (this.menu_width + 20);

                    const x = px + columnXOffset + borderPadding;
                    const y = py + (row * this.mheight) + borderPadding;
                    const width = this.menu_width - 2 * borderPadding;
                    const height = this.mheight - 2 * borderPadding;

                    const isHi = this.highlight === i;

                    // Separator rows render as a thin divider
                    if (menuItem.type === 'separator') {
                        ctx.strokeStyle = '#e5e8ee';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x + 8, y + height / 2);
                        ctx.lineTo(x + width - 8, y + height / 2);
                        ctx.stroke();
                        continue;
                    }

                    // Row background: hover highlight (with an accent bar) or a per-item bg
                    if (isHi) {
                        ctx.fillStyle = menuItem.sg || this.sg || '#eef2f8';
                        menuRoundPath(ctx, x, y, width, height, itemRadius);
                        ctx.fill();
                        ctx.fillStyle = '#2f6feb';
                        menuRoundPath(ctx, x, y, 3, height, 1.5);
                        ctx.fill();
                    } else if (menuItem.bg) {
                        ctx.fillStyle = menuItem.bg;
                        menuRoundPath(ctx, x, y, width, height, itemRadius);
                        ctx.fill();
                    }

                    // Label: left-aligned, ellipsis-truncated
                    if (menuItem.label) {
                        ctx.font = '14px Arial';
                        ctx.fillStyle = isHi ? (menuItem.sf || this.sf || '#1d4ed8')
                            : (menuItem.fg || this.fg || '#344054');
                        ctx.textAlign = 'left';

                        let textToDisplay = menuItem.label;
                        const availableWidth = width - 24;
                        while (textToDisplay.length && ctx.measureText(textToDisplay + '…').width > availableWidth) {
                            textToDisplay = textToDisplay.slice(0, -1);
                        }
                        if (textToDisplay !== menuItem.label) textToDisplay += '…';

                        ctx.fillText(textToDisplay, x + 12, y + height / 2);
                    }
                }

                ctx.restore();
            }

            toJSON() {
                return {
                    name: this.name,
                    x: this.x,
                    y: this.y,
                    color: this.color,
                    list: this.list.map(item => ({
                        label: item.label,
                        click: item.click ? '[Function]' : null
                    })),
                    mx: this.mx,
                    my: this.my,
                    highlight: this.highlight,
                    mheight: this.mheight,
                    xoffset: this.xoffset,
                    yoffset: this.yoffset,
                    menu_width: this.menu_width,
                    title: this.title,
                    sg: this.sg,
                    sf: this.sf,
                    bg: this.bg,
                    fg: this.fg,
                    activeitems: this.activeitems,
                    scrollIndex: this.scrollIndex,
                    columns: this.columns,
                    menu_type: this.menu_type
                };
            }

        }

        resolve(Menu)
    })
}
