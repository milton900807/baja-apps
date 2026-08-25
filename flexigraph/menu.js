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
            isIn(graph, xwc, ywc) {

                let xin = graph.X(xwc) + this.xoffset;
                let yin = graph.Y(ywc) + this.yoffset;
                let xot = graph.X(this.x);
                let yot = graph.Y(this.y);

                let totalMenuWidth = this.menu_width * this.columns + 20 * (this.columns - 1);
                let itemsPerColumn = this.getItemsPerColumn();

                let totalMenuHeight = itemsPerColumn * this.mheight;

                if (xin > xot && xin < (xot + totalMenuWidth) &&
                    yin > yot && yin < (yot + totalMenuHeight)) {
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
                            return await this.list[this.highlight].click(x, y);
                        }
                    }
                }

            }
            mouseMove(graph, x, y) {
                if (this.y === undefined) {
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

                if (isMobile() && !this.isdisplayed) {
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

                const itemsPerColumn = this.getItemsPerColumn();
                const borderPadding = 4;
                const itemRadius = 6;

                const px = grid.X(this.x) + this.xoffset;
                const py = grid.Y(this.y) + this.yoffset;
                const totalW = this.menu_width * this.columns + 20 * (this.columns - 1);
                const rowsH = itemsPerColumn * this.mheight;
                const titleH = this.title ? 24 : 0;

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

                if (this.title) {
                    ctx.font = this.titleFont || '600 13px Arial';
                    ctx.fillStyle = this.titleColor || '#111827';
                    ctx.textAlign = 'left';
                    ctx.fillText(this.title, panelX + 12, panelY + titleH / 2 + 1);
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
