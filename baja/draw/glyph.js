function () {

    return new Promise(async (resolve, reject) => {

        const bsize = 20;
        const GridSVGRenderer = await exec('flexigraph/world-svg.js');

        let Shape = await exec('flexigraph/shapes/shape.js')
        const Menu = await exec('flexigraph/menu')
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

        let g = class Glyph {
            _highlight = true;
            name = null;
            uid = null;
            shape;
            margin = { top: 10, right: 10, bottom: 10, left: 10 };
            action = null;
            last_touched = -Infinity
            highlightbutton = null;
            type = 'default'
            theme = null;

            buttons = [
                {
                    name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.test_menu(bx, by, x, y, pt) },
                    highlight: async (bx, by, x, y, pt) => { return await this.dev_null('close', pt) }, color: 'lightcyan', highlight_color: 'cyan', letter: 'c'
                },

            ];
            constructor(shape, _type) {
                this.uid = uuid()
                this.shape = shape;
                this.type = _type;
            }

            inside(grid, x, y) {
                if (this.shape && typeof this.shape.inside === 'function') {
                    return this.shape.inside(grid, (x), (y))
                }
                return false;
            }

            onClose(grid, sx, sy, pt) {
                return this.onCloseButton(grid, sx, sy, pt);
            }
            onCloseButton(grid, sx, sy, pt) {
                try {
                    if (!this.shape || !grid) return false;

                    const circleForButton = (buttonIndex, buttonHeight) => {
                        const tw = grid.worldWidth(30 * this.buttons.length);
                        let init = grid.X(this.getX() + this.getWidth() - tw);
                        if (init < 0) init = grid.Xwc(0);

                        const buttonX = init + buttonIndex * 20;
                        let buttonY = grid.Y(this.getY());
                        const screen_height = grid.screenHeight(this.getHeight());

                        if (buttonY < 0 && (buttonY + screen_height) > 0) buttonY = 10;

                        const circleRadius = Math.min(20, buttonHeight) / 2;
                        const centerX = buttonX + 20 / 2;
                        const centerY = buttonY + buttonHeight / 2;

                        return { cx: centerX, cy: centerY, r: circleRadius };
                    };

                    const idx = this.buttons.findIndex(b => b && b.name === "close");
                    if (idx < 0) return false;

                    const btn = this.buttons[idx];
                    const { cx, cy, r } = circleForButton(idx, btn.height || 20);

                    const dx = sx - cx;
                    const dy = sy - cy;
                    const inside = (dx * dx + dy * dy) <= (r * r);

                    if (inside) {
                        this.highlightbutton = "close";
                        Promise.resolve(this.closeThis(cx, cy, sx, sy, pt)).catch(console.error);
                        return true;
                    }
                    return false;
                } catch (e) {
                    console.error("onCloseButton error:", e);
                    return false;
                }
            }

            async dev_null(button_name, pt) {
                this.highlightbutton = button_name
            }

            async closeThis(bx, by, mmx, mmy, pt) {
                pt.removeGlyph(this)
            }

            handleMouseUp(x, y, pt) {
                let msub = [
                    {
                        label: 'Remove',
                        click: async (x, y) => {
                            try {
                                pt.removeGlyphs([this])
                                pt.wb(null)
                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                    },
                    {
                        label: 'Edit Text',
                        click: async (x, y) => {
                            try {

                                const platetrack = pt;
                                let ref = null;

                                let e = {
                                    height: '500px',
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
                                        fontSize: 18,
                                        automaticLayout: true,
                                        padding: {
                                            top: 20,
                                            bottom: 20,
                                            left: 30,
                                            right: 30
                                        }
                                    },
                                    objects: platetrack.root,
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                                        })
                                    },
                                    code: ``,
                                    buttons: [
                                        {
                                            'label': ' Insert  ', 'color': 'black', action: (async () => {
                                                console.log('debubg');
                                                let activeContent = ref.getEditorText();
                                                let Glyph = await exec('baja/draw/glyph.js');
                                                this.shape.comment = activeContent;

                                                let g = new Glyph(arrow);
                                                g.setText(activeContent)
                                                platetrack.addGlyph(g);
                                                ref.hideEditor();
                                                platetrack.wb(null)
                                            }),
                                        },
                                        {
                                            'label': 'Close', 'color': 'red', 'action': (() => {
                                                ref.hideEditor()
                                                platetrack.wb(null)
                                            }),
                                        },
                                    ]
                                }
                                ref = platetrack.showTextEditor(e);
                                pt.wb(null)
                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                    },
                    {
                        label: 'Move',
                        click: async (x, y) => {
                            try {
                                let hd = {
                                    startX: null,
                                    startY: null,
                                    currentX: null,
                                    currentY: null,
                                    isDrawing: true,

                                    id: 'override-arrow-draw',

                                    draw: (grid, ctx) => {
                                    },
                                    keydown: (event) => {
                                    },
                                    mouseDownListener: async (x, y) => {
                                        if (hd.isDrawing) {
                                            hd.isDrawing = false;
                                            pt.wb(null)
                                            return;
                                        }
                                        hd.isDrawing = true;
                                        hd.startX = x;
                                        hd.startY = y;
                                        hd.currentX = x;
                                        hd.currentY = y;
                                    },

                                    mouseMoveListener: (x, y) => {
                                        if (hd.isDrawing && this.shape) {
                                            this.shape.x = (pt.grid.Xwc(x));
                                            this.shape.y = pt.grid.Ywc(y);
                                        }
                                    },

                                    mouseUpListener: async (x, y) => {
                                        let ref = null;
                                        hd.isDrawing = false;
                                        pt.wb(null)

                                    },
                                    close: () => {
                                    },
                                };
                                pt.wb(hd)
                                hd.startX = null;
                                hd.startY = null;
                                hd.currentX = null;
                                hd.currentY = null;
                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                    }
                ]

                const smenu = new Menu(msub, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * msub.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                let t = {
                    md: false,
                    id: 'glyph',
                    smenu: smenu,
                    mouseDownListener: async (x, y) => {

                    },
                    priority: true,
                    mouseMoveListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                            await smenu.mouseMove(pt.grid, mmx, mmy)
                        }

                    },
                    mouseUpListener: async (x, y) => {
                        let mmx = pt.grid.Xwc(x);
                        let mmy = pt.grid.Ywc(y);
                        if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                            await smenu.mouseUp(pt.grid, mmx, mmy)
                        } else {
                            pt.wb(null)
                        }
                    },
                    draw: (grid, ctx) => {
                    },
                    close: () => {
                        clearMenu();

                    },
                    menuManager: null,
                    smenu: smenu
                }
                setTimeout(() => {
                    pt.wb(t)
                    pt.menu = smenu;

                }, 100)
            }

            getShapeComment() {
                return this.shape?.comment;
            }
            setShapeComment(txt) {
                if (this.shape) {
                    this.shape.comment = txt;
                }
            }

            getHeight() {
                if (this.shape)
                    return this.shape.h;
            }
            getWidth() {
                if (this.shape)
                    return this.shape.w;
            }
            getX() {
                if (!this.shape) return;
                return typeof this.shape.getX === "function"
                    ? this.shape.getX()
                    : this.shape.x;
            }

            getY() {
                if (!this.shape) return;
                return typeof this.shape.getY === "function"
                    ? this.shape.getY()
                    : this.shape.y;
            }

            getXf() {
                if (!this.shape) return;
                return typeof this.shape.getXf === "function"
                    ? this.shape.getXf()
                    : this.shape.xf;
            }

            getYf() {
                if (!this.shape) return;
                return typeof this.shape.getYf === "function"
                    ? this.shape.getYf()
                    : this.shape.yf;
            }

            highlight() {
                this._highlight = true;
            }
            unhighlight() {
                this._highlight = false;
            }

            draw(g, ctx) {

                if (g && g.worldWidth) {
                    if (this.shape && typeof this.shape.draw === 'function') {
                        this.shape.draw(g.grid, ctx)
                    }
                }
                else
                    if (g && g.grid) {
                        if (this.shape && typeof this.shape.draw === 'function') {
                            this.shape.draw(g.grid, ctx)
                        }
                    }
            }
            setText(txt) {
                this.txt = txt;
            }
            getLastTouched() {
                return this.last_touched;
            }
            static nudgeUntilNoOverlap(shapes, options = {}) {
                if (!Array.isArray(shapes) || shapes.length < 2) return;

                const padding = Number.isFinite(options.padding) ? options.padding : 0;
                const maxIterations = options.maxIterations ?? 60;

                const axis = options.axis || 'both';

                const keepGroupsIntact = options.keepGroupsIntact !== false;

                const jitter = options.jitter ?? 1e-3;

                const isNum = v => typeof v === 'number' && Number.isFinite(v);

                const getAabb = (s) => {
                    if (!s) return null;
                    Shape._attachBBoxMethods(s);

                    const x1 = s.getX?.();
                    const y1 = s.getY?.();
                    const x2 = s.getXf?.();
                    const y2 = s.getYf?.();
                    if (![x1, y1, x2, y2].every(isNum)) return null;

                    const minX = Math.min(x1, x2);
                    const maxX = Math.max(x1, x2);
                    const minY = Math.min(y1, y2);
                    const maxY = Math.max(y1, y2);
                    return { minX, minY, maxX, maxY };
                };

                let items = shapes.filter(Boolean);

                if (!keepGroupsIntact) {

                    const flat = [];
                    for (const s of items) {
                        flat.push(...Shape.breakComposite(s));
                    }
                    items = flat.filter(Boolean);
                }

                for (let iter = 0; iter < maxIterations; iter++) {
                    let movedAny = false;

                    for (let i = 0; i < items.length; i++) {
                        const a = items[i];
                        const aBox = getAabb(a);
                        if (!aBox) continue;

                        for (let j = i + 1; j < items.length; j++) {
                            const b = items[j];
                            const bBox = getAabb(b);
                            if (!bBox) continue;

                            const overlapX = Math.min(aBox.maxX, bBox.maxX) - Math.max(aBox.minX, bBox.minX);
                            const overlapY = Math.min(aBox.maxY, bBox.maxY) - Math.max(aBox.minY, bBox.minY);

                            if (overlapX <= -padding || overlapY <= -padding) continue;

                            const pushX = overlapX + padding;
                            const pushY = overlapY + padding;

                            let useAxis;
                            if (axis === 'x') useAxis = 'x';
                            else if (axis === 'y') useAxis = 'y';
                            else useAxis = (pushX < pushY) ? 'x' : 'y';

                            const aCx = (aBox.minX + aBox.maxX) / 2;
                            const bCx = (bBox.minX + bBox.maxX) / 2;
                            const aCy = (aBox.minY + aBox.maxY) / 2;
                            const bCy = (bBox.minY + bBox.maxY) / 2;

                            const dx0 = (aCx - bCx) || (Math.random() - 0.5) * jitter;
                            const dy0 = (aCy - bCy) || (Math.random() - 0.5) * jitter;

                            if (useAxis === 'x' && isNum(pushX) && pushX > 0) {
                                const half = pushX / 2;
                                const sign = (dx0 <= 0) ? -1 : 1;
                                if (typeof a.setX === 'function') a.setX(a.getX() + sign * half);
                                if (typeof b.setX === 'function') b.setX(b.getX() - sign * half);
                                movedAny = true;
                            }

                            if (useAxis === 'y' && isNum(pushY) && pushY > 0) {
                                const half = pushY / 2;
                                const sign = (dy0 <= 0) ? -1 : 1;
                                if (typeof a.setY === 'function') a.setY(a.getY() + sign * half);
                                if (typeof b.setY === 'function') b.setY(b.getY() - sign * half);
                                movedAny = true;
                            }
                        }
                    }

                    if (!movedAny) break;
                }
            }

            drawButtons(graph, ctx) {
                ctx.lineWidth = 1;
                let index = 0;
                let tw = (graph.worldWidth(30 * this.buttons.length));
                let init = graph.X(this.getX() + this.getWidth() - tw);
                if (init < 0) {
                    init = graph.Xwc(0);
                }

                let screen_height = graph.screenHeight(this.getHeight());

                for (let button of this.buttons) {
                    let buttonX = init + index * bsize;
                    let buttonY = graph.Y(this.getY());
                    let buttonHeight = button.height;
                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    if (button.name === "close") {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;

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
                    index++;

                }

            }

            selectIt(pt) {

            }

            toJSON() {
                // Safely serialize objects, including functions and circular refs
                function safeSerialize(obj) {
                    const seen = new WeakSet();

                    return JSON.stringify(
                        obj,
                        (key, value) => {
                            // Preserve functions
                            if (typeof value === "function") {
                                return {
                                    __type: "function",
                                    source: value.toString()
                                };
                            }

                            // Handle circular references
                            if (typeof value === "object" && value !== null) {
                                if (seen.has(value)) {
                                    return "[Circular]";
                                }
                                seen.add(value);
                            }

                            return value;
                        },
                        2
                    );
                }

                // Safely convert shape
                function serializeShape(shape) {
                    if (!shape) return null;

                    try {
                        // Preferred path
                        if (typeof shape.toJSON === "function") {
                            return shape.toJSON();
                        }

                        // Fallback: shallow-clean copy
                        const plain = {};

                        for (const key in shape) {
                            try {
                                const value = shape[key];

                                // Skip DOM nodes / massive engine internals
                                if (
                                    value instanceof HTMLElement ||
                                    value instanceof Window
                                ) {
                                    continue;
                                }

                                // Preserve functions as strings
                                if (typeof value === "function") {
                                    plain[key] = value.toString();
                                } else {
                                    plain[key] = value;
                                }
                            } catch (err) {
                                plain[key] = `[Unreadable: ${err.message}]`;
                            }
                        }

                        // Final safety serialization pass
                        return JSON.parse(safeSerialize(plain));

                    } catch (err) {
                        console.error("Failed to serialize shape:", err);

                        return {
                            __error: "Shape serialization failed",
                            message: err.message
                        };
                    }
                }

                // Serialize action safely
                let actionSerialized = "{}";

                try {
                    actionSerialized = safeSerialize(this.action);
                } catch (err) {
                    console.error("Failed to serialize action:", err);
                }

                // Compress safely
                let compressedAction = actionSerialized;

                try {
                    compressedAction = __compress(actionSerialized);
                } catch (err) {
                    console.warn("Compression failed, using raw JSON:", err);
                }

                return {
                    _highlight: this._highlight ?? false,
                    name: this.name ?? "",
                    action: compressedAction,
                    txt: this.txt ?? "",
                    uid: this.uid ?? crypto.randomUUID?.() ?? String(Date.now()),
                    gfx: this.shape?.gfx?.path ?? null,
                    shape: serializeShape(this.shape)
                };
            }
            static buildFromJSON(json) {
                const glyph = new Glyph(null);
                glyph._highlight = json._highlight ?? true;

                if (json.action && json.action.length > 0) {

                    function deserializeObject(str, args) {
                        function reviver(value) {

                            if (typeof value === 'string') {
                                try {
                                    const fn = eval(`(${value})`);
                                    return fn
                                } catch (e) {
                                    console.warn('Failed to deserialize function:', value, e);
                                    return value;
                                }
                            }

                            if (typeof value === 'string') {
                                try {

                                    return eval(value);
                                } catch (e) {
                                    console.warn('Failed to deserialize arrow function:', value, e);
                                    return value;
                                }
                            }
                            return value;
                        }

                        try {
                            return reviver(str);
                        } catch (err) {
                            console.error('Failed to parse JSON:', err);
                            return null;
                        }
                    }

                    glyph.action = (__decompress(json.action))
                    glyph.action = deserializeObject(glyph.action)

                }

                glyph.name = json.name ?? null;
                glyph.txt = json.txt ?? null;
                glyph.uid = json.uid ?? uuid();
                if (json.shape && Shape.buildFromJSON) {
                    glyph.shape = Shape.buildFromJSON(json.shape);
                } else {
                    glyph.shape = json.shape;
                }

                if (json.gfx && json.gfx.path) {
                    const theme_path = glyph?.gfx?.path;
                    if (theme_path && typeof theme_path === 'string' && theme_path.indexOf('.') > 0) {
                        const parts = theme_path.split('.');
                        if (parts.length === 2) {
                            const [category, themeKey] = parts;
                            const theme = ShapeThemes?.[category]?.[themeKey] || null;
                            glyph.shape.applyTheme(theme)
                        }
                    }

                }

                return glyph;
            }

            static async fromSvgString___(svgString) {
                const Glyph = await exec('baja/draw/glyph.js');
                const ShapeModule = await exec('flexigraph/shapes/shape.js');

                if (typeof svgString !== 'string') {
                    console.warn('fromSvgString expected a string, got:', typeof svgString, svgString);
                    throw new Error('SVG source must be a string');
                }

                const trimmed = svgString.trim();
                if (!trimmed) {
                    throw new Error('SVG string is empty');
                }

                function parseNumSvg(el, attr, fallback) {
                    const v = el.getAttribute(attr);
                    const n = v != null ? Number(v) : NaN;
                    return Number.isFinite(n) ? n : (fallback != null ? fallback : 0);
                }

                function getSvgShapeBounds(el) {
                    const tag = el.tagName.toLowerCase();
                    if (tag === 'rect') {
                        const x = parseNumSvg(el, 'x');
                        const y = parseNumSvg(el, 'y');
                        const w = parseNumSvg(el, 'width');
                        const h = parseNumSvg(el, 'height');
                        return { x, y, w, h };
                    } else if (tag === 'ellipse') {
                        const cx = parseNumSvg(el, 'cx');
                        const cy = parseNumSvg(el, 'cy');
                        const rx = parseNumSvg(el, 'rx');
                        const ry = parseNumSvg(el, 'ry');
                        return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry };
                    } else if (tag === 'circle') {
                        const cx = parseNumSvg(el, 'cx');
                        const cy = parseNumSvg(el, 'cy');
                        const r = parseNumSvg(el, 'r');
                        return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
                    } else if (tag === 'line') {
                        const x1 = parseNumSvg(el, 'x1');
                        const y1 = parseNumSvg(el, 'y1');
                        const x2 = parseNumSvg(el, 'x2');
                        const y2 = parseNumSvg(el, 'y2');
                        const xMin = Math.min(x1, x2);
                        const yMin = Math.min(y1, y2);
                        const xMax = Math.max(x1, x2);
                        const yMax = Math.max(y1, y2);
                        return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
                    }
                    return null;
                }

                function buildGlyphFromSvgRoot(svgRoot) {
                    const ns = svgRoot.namespaceURI || 'http://www.w3.org/2000/svg';
                    const doc = svgRoot.ownerDocument || (typeof document !== 'undefined' ? document : null);

                    const baseNodeList = svgRoot.querySelectorAll(
                        'rect,line,polyline,polygon,circle,ellipse,text'
                    );
                    const baseElements = Array.prototype.slice.call(baseNodeList);

                    if (!baseElements.length) {
                        throw new Error('No supported graphical element found in SVG');
                    }

                    const shapes = [];
                    let bbox = null;

                    function expandBBox(b) {
                        if (!b) return;
                        if (!bbox) {
                            bbox = {
                                xMin: b.x,
                                yMin: b.y,
                                xMax: b.x + b.w,
                                yMax: b.y + b.h
                            };
                        } else {
                            bbox.xMin = Math.min(bbox.xMin, b.x);
                            bbox.yMin = Math.min(bbox.yMin, b.y);
                            bbox.xMax = Math.max(bbox.xMax, b.x + b.w);
                            bbox.yMax = Math.max(bbox.yMax, b.y + b.h);
                        }
                    }

                    for (let i = 0; i < baseElements.length; i++) {
                        const el = baseElements[i];
                        try {
                            const shape = Shape.createShapeFromSvgElement(el, ShapeModule);
                            if (shape) {
                                shapes.push(shape);
                                const b = getSvgShapeBounds(el);
                                expandBBox(b);
                            }
                        } catch (err) {
                            console.warn('Skipping unsupported SVG element:', el.tagName, err);
                        }
                    }

                    if (doc) {
                        const arrowLines = svgRoot.querySelectorAll('line[marker-end]');
                        for (let i = 0; i < arrowLines.length; i++) {
                            const lineEl = arrowLines[i];
                            try {
                                const x1 = parseNumSvg(lineEl, 'x1');
                                const y1 = parseNumSvg(lineEl, 'y1');
                                const x2 = parseNumSvg(lineEl, 'x2');
                                const y2 = parseNumSvg(lineEl, 'y2');

                                const dx = x2 - x1;
                                const dy = y2 - y1;
                                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                                const ux = dx / len;
                                const uy = dy / len;

                                const strokeWidth = parseNumSvg(lineEl, 'stroke-width', 1.5);
                                const arrowLen = strokeWidth * 5;
                                const arrowWidth = strokeWidth * 4;

                                const tipX = x2;
                                const tipY = y2;

                                const baseX = x2 - ux * arrowLen;
                                const baseY = y2 - uy * arrowLen;

                                const px = -uy;
                                const py = ux;

                                const leftX = baseX + px * (arrowWidth / 2);
                                const leftY = baseY + py * (arrowWidth / 2);
                                const rightX = baseX - px * (arrowWidth / 2);
                                const rightY = baseY - py * (arrowWidth / 2);

                                const poly = doc.createElementNS(ns, 'polygon');
                                poly.setAttribute(
                                    'points',
                                    tipX + ',' + tipY + ' ' +
                                    leftX + ',' + leftY + ' ' +
                                    rightX + ',' + rightY
                                );

                                const stroke = lineEl.getAttribute('stroke') || '#333';
                                const fill = lineEl.getAttribute('stroke') ||
                                    lineEl.getAttribute('fill') || '#333';
                                poly.setAttribute('stroke', stroke);
                                poly.setAttribute('fill', fill);

                                svgRoot.appendChild(poly);
                                try {
                                    const arrowShape = SvgGlyph.createShapeFromSvgElement(poly, ShapeModule);
                                    if (arrowShape) {
                                        shapes.push(arrowShape);
                                        const b = getSvgShapeBounds(lineEl);
                                        expandBBox(b);
                                    }
                                } finally {
                                    svgRoot.removeChild(poly);
                                }
                            } catch (err) {
                                console.warn('Failed to synthesize arrowhead for line:', err);
                            }
                        }
                    }

                    if (!shapes.length) {
                        throw new Error('Could not convert any SVG elements into shapes');
                    }

                    let shape;
                    if (shapes.length === 1) {
                        shape = shapes[0];
                    } else {
                        shape = Shape._makeCompositeShape(shapes);
                    }
                    const glyph = new Glyph(shape);

                    const textNodes = svgRoot.querySelectorAll('text');
                    const labels = [];
                    for (let i = 0; i < textNodes.length; i++) {
                        const t = (textNodes[i].textContent || '').trim();
                        if (t) labels.push(t);
                    }

                    if (labels.length) {

                        const label = labels.join('\n');

                        console.log('SvgGlyph.fromSvgString label:', label);

                        if (typeof glyph.setText === 'function') {
                            glyph.setText(label);
                        }
                        glyph.txt = label;
                        glyph.text = label;
                        if (glyph.shape) {
                            glyph.shape.text = label;
                        }
                    }

                    return glyph;
                }

                if (typeof DOMParser === 'undefined') {
                    if (typeof document !== 'undefined') {
                        const container = document.createElement('div');
                        container.innerHTML = trimmed;
                        const root = container.querySelector('svg');
                        if (!root) {
                            throw new Error('Provided string is not a valid SVG document (no <svg> found)');
                        }
                        return buildGlyphFromSvgRoot(root);
                    }
                    throw new Error('DOMParser is not available in this environment');
                }

                const parser = new DOMParser();

                let doc = parser.parseFromString(trimmed, 'image/svg+xml');
                let svgRoot = doc.documentElement;
                let nodeName = svgRoot && svgRoot.nodeName ? svgRoot.nodeName.toLowerCase() : null;

                if (nodeName === 'parsererror') {
                    console.warn('SVG parsererror (image/svg+xml):', svgRoot.textContent || '');
                    svgRoot = null;
                }

                if (!svgRoot || nodeName !== 'svg') {
                    try {
                        const htmlDoc = parser.parseFromString(trimmed, 'text/html');
                        const altSvg = htmlDoc.querySelector('svg');
                        if (altSvg) {
                            svgRoot = altSvg;
                            nodeName = 'svg';
                        }
                    } catch (e) {
                        console.warn('Fallback parse as text/html failed:', e);
                    }
                }

                if ((!svgRoot || nodeName !== 'svg') && typeof document !== 'undefined') {
                    try {
                        const container = document.createElement('div');
                        container.innerHTML = trimmed;
                        const altSvg2 = container.querySelector('svg');
                        if (altSvg2) {
                            svgRoot = altSvg2;
                            nodeName = 'svg';
                        }
                    } catch (e) {
                        console.warn('Manual DOM injection fallback failed:', e);
                    }
                }

                if (!svgRoot || nodeName !== 'svg') {
                    console.warn('fromSvgString: could not find <svg> root. nodeName was:', nodeName);
                    throw new Error('Provided string is not a valid SVG document');
                }

                return buildGlyphFromSvgRoot(svgRoot);
            }

            toSVG(grid, options = {}) {
                if (!grid) throw new Error("toSVG(grid) requires a grid");

                const renderer = new GridSVGRenderer(grid);
                if (options.width || options.height) {
                    renderer.setSize(options.width, options.height);
                }

                this.shape.drawSVG(grid, renderer);

                return renderer.toString();
            }
            toSVGElement(grid, options = {}) {
                if (!grid) throw new Error("toSVGElement(grid) requires a grid");

                const renderer = new GridSVGRenderer(grid);
                if (options.width || options.height) {
                    renderer.setSize(options.width, options.height);
                }

                this.shape.drawSVG(grid, renderer);
                return renderer.getElement();
            }

        }

        return resolve(g)
    })
}
