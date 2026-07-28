function () {

    return new Promise(async (resolve, reject) => {

        let randomNumber = Math.random() * 0.1 + 0.8;
        let difference = 0.05;
        let secondNumber = randomNumber + difference;

        function updateNumbers() {

            randomNumber = 0.95;
            secondNumber = 0.9

            return [randomNumber, secondNumber]
        }

        function drawPunchyArrow(ctx, x, y, w, h, opts = {}) {
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            const arrowDepthPct = clamp(opts.arrowDepthPct ?? 0.10, 0.05, 0.35);

            const shaftLen = clamp(h * 0.55, 8, 36);
            const headSize = clamp(h * 0.35, 6, 18);
            const thickness = clamp(h * 0.18, 2, 8);
            const innerPad = clamp(h * 0.08, 2, 8);

            const tipX = clamp(
                x + w * arrowDepthPct,
                x + innerPad + headSize,
                x + w - innerPad - headSize
            );
            const tipY = y + h / 2;

            const shaftEndX = tipX - headSize;
            const startX = Math.max(x + innerPad, shaftEndX - shaftLen);
            const startY = tipY;
            const halfT = thickness / 2;

            const pathShaft = () => {
                ctx.beginPath();
                ctx.moveTo(startX, startY - halfT);
                ctx.lineTo(shaftEndX, startY - halfT);
                ctx.arc(shaftEndX, startY, halfT, -Math.PI / 2, Math.PI / 2);
                ctx.lineTo(startX, startY + halfT);
                ctx.arc(startX, startY, halfT, Math.PI / 2, -Math.PI / 2, true);
                ctx.closePath();
            };

            const pathHead = () => {
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(shaftEndX, tipY - headSize * 0.6);
                ctx.lineTo(shaftEndX, tipY + headSize * 0.6);
                ctx.closePath();
            };

            ctx.save();

            ctx.fillStyle = "rgba(140, 255, 0, 0.35)";
            ctx.strokeStyle = "rgba(11, 9, 4, 0.4)";
            ctx.lineWidth = clamp(thickness * 0.33, 1, 2);

            pathShaft();
            ctx.fill();
            ctx.stroke();

            pathHead();
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }

        function generateRandomRGBAColor() {
            const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const randomFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(5);

            const red = randomInt(0, 255);
            const green = randomInt(0, 255);
            const blue = randomInt(0, 255);
            const alpha = randomFloat(0.1, 0.2);

            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        }

        function generateColor(percent) {
            percent = Math.max(0, Math.min(100, percent));
            const red = Math.floor((100 - percent) * 255 / 100);
            const green = Math.floor(percent * 255 / 100);
            const color = '#' + componentToHex(red) + '00' + componentToHex(green);
            return color;
        }
        let HM = await exec('baja/history/HM')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')

        function calculateFontSizeWell(wellWidth, wellHeight, text, ctx) {
            let fontSize = 100;
            ctx.font = `${fontSize}px Arial`;
            if (this.font) {
                ctx.font = `${fontSize}px ${this.font}`;
            }

            let textWidth = ctx.measureText(text).width;
            let textHeight = fontSize;

            while (textWidth > wellWidth - 5 || textHeight > wellHeight - 5) {
                fontSize--;
                ctx.font = `${fontSize}px Arial`;
                if (this.font) {
                    ctx.font = `${fontSize}px ${this.font}`;
                }

                textWidth = ctx.measureText(text).width;
                textHeight = fontSize;
            }

            return fontSize;
        }

        function checkAndCastToNumber(input) {

            if (typeof input === 'number') {
                return input;
            }
            if (input === null) {
                return '';
            }
            if (typeof input === 'string') {
                if (input.trim().startsWith('=')) {
                } else
                    input = input.trim().replace(/,/g, '');
            } else {
                return input;

            }

            const numberPattern = /^-?\d+(\.\d+)?$/;
            if (numberPattern.test(input)) {
                const number = Number(input);
                return Number.isInteger(number) ? parseInt(number, 10) : number;
            }
            return input;
        }

        const truncateTextCached = (text, maxWidth, ctx) => {
            if (!truncateTextCached.cache) truncateTextCached.cache = new Map();

            const key = `${text}-${maxWidth}`;
            if (truncateTextCached.cache.has(key)) {
                return truncateTextCached.cache.get(key);
            }

            let truncated = text;
            while (ctx.measureText(truncated).width > maxWidth && truncated.length > 0) {
                truncated = truncated.slice(0, -1);
            }
            const result = truncated + (truncated.length < text.length ? '...' : '');
            truncateTextCached.cache.set(key, result);
            return result;
        };

        function generateTimestamp() {
            const now = new Date();

            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');

            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }

        function isDateLikeString(value) {
            if (typeof value !== "string") return false;
            const str = value.trim();
            if (!str || /^[+-]?\d+(\.\d+)?$/.test(str)) return false;
            const datePatterns = [

                /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
                /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,

                /^\d{1,2}[-.]\d{1,2}[-.]\d{2,4}$/,

                /^(?:\d{1,2}\s)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[ ,.-]*\d{1,2}[, ]*\d{2,4}$/i,

                /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[ ,.-]+.+\d{4}$/i,
            ];

            if (datePatterns.some(rx => rx.test(str))) return true;

            const parsed = Date.parse(str);
            return !Number.isNaN(parsed);
        }

        let GenericWell = class GenericWell {
            name = 'unknown';
            score;
            font;
            obj = '';
            concentration;
            wellType;
            select = false;
            structure;
            group = {};
            bgcolor = null;
            fgcolor = 'black';
            color = null;
            attr__showGroups = false;
            attr__showBorder = true;
            value;
            source;
            compoundId;
            idt;
            props;
            position;
            properties = {};
            icon;
            stdv;
            slope
            intercept
            rSquared
            formula = '';
            uid;
            x;
            y;
            w;
            h;
            equations = []
            __highlight__ = false;

            skin_transient;
            skin_type;
            __error_select;
            __screen_y;
            __screen_x;
            __screen_width;
            __screen_height;
            __dirty = false;
            __previousValue;
            __previousSkin;
            textSelected = false;
            timeSelected = null;
            __hasFormula = false;
            __hasError = false;
            __errorMessage = null;
            __errorAt = null;

            constructor(name, value, obj, group) {
                this.name = name;
                this.has_formula_time_set = Date.now()
                this.position = name;
                this.uid = uuid();
                this.group = group;

                if (typeof value === 'string') {
                    const cleanedValue = value.trim().replace(/,/g, '');

                    if (isDateLikeString(cleanedValue)) {
                        this.value = cleanedValue.length > 0 ? cleanedValue : null;
                    } else {

                        const num = Number(cleanedValue);
                        if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(cleanedValue)) {
                            this.value = num;
                        } else {
                            this.value = cleanedValue.length > 0 ? cleanedValue : null;
                        }
                    }
                } else if (typeof value === 'number') {
                    this.value = value;
                } else {
                    this.value = value != null && value.toString().length > 0 ? value.toString() : null;
                }

                this.obj = obj;
            }
            setFormula(formula) {

            }

            setError(message) {
                this.__hasError = true;
                this.__errorMessage = typeof message === 'string' ? message : null;
                this.__errorAt = Date.now();
                this.__error_select = true;
            }

            clearError() {
                this.__hasError = false;
                this.__errorMessage = null;
                this.__errorAt = null;
                this.__error_select = false;
                if (this.__hasFormula) {
                    this.has_formula_time_set = Date.now()
                    this.__hasFormula = false;
                }
            }

            hasError() {
                return !!this.__hasError;
            }

            __drawErrorOverlay(ctx, screen_x, screen_y, screen_width, screen_height) {
                if (!this.__hasError) return;

                const t = this.__errorAt ? (Date.now() - this.__errorAt) / 1000 : 0;
                const pulse = 0.29 + 0.09 * Math.sin(t * 4.0);

                ctx.save();
                ctx.fillStyle = `rgba(220, 30, 30, ${pulse.toFixed(3)})`;
                ctx.fillRect(screen_x, screen_y, screen_width, screen_height);

                ctx.lineWidth = Math.max(2, Math.min(screen_width, screen_height) / 30);
                ctx.strokeStyle = 'rgba(200, 0, 0, 0.95)';
                ctx.strokeRect(screen_x, screen_y, screen_width, screen_height);

                const badgeSize = Math.max(10, Math.min(screen_width, screen_height) * 0.28);
                const bx = screen_x + screen_width - badgeSize - 4;
                const by = screen_y + 4;
                const r = 4;

                if (typeof ctx.roundRect === 'function') {
                    ctx.fillStyle = 'rgba(200, 0, 0, 0.95)';
                    ctx.beginPath();
                    ctx.roundRect(bx, by, badgeSize, badgeSize, r);
                    ctx.fill();
                } else {

                    ctx.fillStyle = 'rgba(200, 0, 0, 0.95)';
                    ctx.fillRect(bx, by, badgeSize, badgeSize);
                }

                ctx.fillStyle = 'white';
                ctx.font = `${Math.max(9, badgeSize * 0.7)}px Arial`;
                if (this.font) {
                    ctx.font = `${fontSize}px ${this.font}`;
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('!', bx + badgeSize / 2, by + badgeSize / 2);

                ctx.restore();
            }

            renderErrorOverlay(graph, grid, ctx) {
                if (!this.__hasError) return;
                const sx = this.__screen_x != null ? this.__screen_x : graph.X(grid.X(this.x));
                const sy = this.__screen_y != null ? this.__screen_y : graph.Y(grid.Y(this.y));
                const sw = this.__screen_width != null ? this.__screen_width : graph.screenWidth(grid.screenWidth(this.w));
                const sh = this.__screen_height != null ? this.__screen_height : graph.screenHeight(grid.screenHeight(this.h));
                this.__drawErrorOverlay(ctx, sx, sy, sw, sh);
            }

            setColor(color_) {
                this.color = color_
                this.fg = getContrastColor(this.color, "#000000")
            }
            clearGroups() {
                this.group = {};
            }
            appendGroups(newGroups) {
                if (!this.group) {
                    this.group = {};
                }
                if (Array.isArray(newGroups)) {
                    for (let groupKey of newGroups) {
                        if (groupKey != null && groupKey.length > 0) {

                            if (!this.group[groupKey]) {
                                this.group[groupKey] = [];
                            }
                            if (groupKey != null && groupKey.startsWith('[')) {
                                return;
                            }
                            this.group[groupKey] = this.group[groupKey].concat(newGroups[groupKey]);
                        }
                    }

                } else {
                    for (let groupKey in newGroups) {
                        if (groupKey != null && groupKey.length > 0) {

                            if (newGroups.hasOwnProperty(groupKey)) {
                                if (!this.group[groupKey]) {
                                    this.group[groupKey] = [];
                                }

                                if (groupKey != null && groupKey.startsWith('[')) {
                                    return;
                                }
                                this.group[groupKey] = this.group[groupKey].concat(newGroups[groupKey]);
                            }
                        }
                    }
                }
            }

            getGroups() {
                return this.group;
            }

            getGroup(groupName) {
                if (!this.group) {
                    return null;
                }
                return this.group[groupName];
            }

            resetGroup(group) {
                if (Array.isArray(group)) {
                    this.group = group.reduce((acc, item) => {
                        acc[item] = Date.now();
                        return acc;
                    }, {});
                } else {
                    this.group = group;
                }
            }

            isHeader() {
                try {

                    if (!this.group) {
                        return false;
                    }

                    const headerKeys = new Set([
                        'column_header',
                        'row_header',
                        'columnheader',
                        'rowheader',
                        'header'
                    ]);

                    const keys = Object.keys(this.group);
                    if (keys.length === 0) return false;

                    for (const key of keys) {
                        if (typeof key === 'string' && headerKeys.has(key.toLowerCase())) {
                            return true;
                        }
                    }

                    return false;
                } catch (err) {
                    console.warn('isHeader() check failed:', err);
                    return false;
                }
            }

            setGroup(__group) {

                if (!this.group) {
                    this.group = {};
                }

                if (!__group || __group === null) {
                    return;
                }

                if (
                    __group &&
                    typeof __group.toLowerCase === 'function' &&
                    __group.toLowerCase() === "_value_"
                ) {
                    return;
                }
                __group = String(__group);
                __group = __group.trim().replace(/-/g, '_');
                __group = __group.trim().replace(/\s+/g, '_');
                __group = __group.replace(/[^a-zA-Z0-9_]/g, '_');
                __group = __group.replace(/_+/g, '_');
                if (!__group || __group.length <= 0) {
                    return;
                }
                if (!__group || !this.group) {
                    return;
                } else {

                    if (__group === 'None' || __group === "TRUE" || __group === 'FALSE') {
                        return;
                    }

                    this.group[__group] = [generateTimestamp()];
                }
            }
            setConcentration(_concentration) {
                this.concentration = checkAndCastToNumber(_concentration);
            }
            setObj(obj) {
                this.obj = obj;
            }

            parseSpecialValue(value, context) {
                let cleanedValue = value.trim().replace(/,/g, '');
                let isNegative = false;

                if (cleanedValue.startsWith('(') && cleanedValue.endsWith(')')) {
                    cleanedValue = cleanedValue.substring(1, cleanedValue.length - 1);
                    isNegative = true;
                }

                if (cleanedValue.startsWith('$')) {

                    context.value = parseFloat(cleanedValue.substring(1));
                    if (isNegative) context.value = -context.value;
                    context.setGroup('dollar');
                } else if (cleanedValue.endsWith('%')) {

                    context.value = parseFloat(cleanedValue.substring(0, cleanedValue.length - 1));
                    if (isNegative) context.value = -context.value;
                    context.skin_type = 'PERCENT';
                    context.setGroup('percent');
                }
            }

            reset() {
                this.name = null;
                this.score = null;
                this.obj = null;
                this.concentration = null;
                this.structure = null;
                this.value = null;
                this.source = null;
                this.compoundId = null;
                this.idt = null;
                this.props = null;
                this.dye = null;
                this.properties = null;
                this.slope = null;
                this.intercept = null;
                this.rSquared = null;

                this.attr__showBorder = null;
                this.attr__showGroups = null;

            }
            toJSON() {
                return {
                    name: this.name,
                    font: this.font,
                    score: this.score,
                    attr__showBorder: this.attr__showBorder,
                    attr__showGroups: this.attr__showGroups,
                    obj: this.obj,
                    concentration: this.concentration,
                    wellType: this.wellType,
                    structure: this.structure,
                    group: this.group,
                    bgcolor: this.bgcolor,
                    fgcolor: this.fgcolor,
                    color: this.color,
                    value: this.value,
                    source: this.source,
                    compoundId: this.compoundId,
                    idt: this.idt,
                    props: this.props,
                    dye: this.dye,
                    position: this.position,
                    properties: this.properties,
                    slope: this.slope,
                    intercept: this.intercept,
                    rSquared: this.rSquared,
                    formula: this.formula,
                    uid: this.uid,
                    x: this.x,
                    y: this.y,
                    icon: this.icon ? this.icon : null,
                    equations: this.equations,
                    __highlight__: this.__highlight__,
                    skin_transient: this.skin_transient,
                    skin_type: this.skin_type,
                    __screen_y: this.__screen_y,
                    __screen_x: this.__screen_x,
                    __screen_height: this.__screen_height,
                    __hasError: this.__hasError,
                    __errorMessage: this.__errorMessage,
                    __errorAt: this.__errorAt
                };
            }

            deepCopy() {
                let copiedWell = new GenericWell(this.name, this.value, this.obj, this.group);

                if (this.group && Object.keys(this.group).length > 0) {
                    let keys = Object.keys(this.group)
                    for (let key of keys) {
                        copiedWell.setGroup(key)
                    }
                }

                copiedWell.attr__showBorder = this.attr__showBorder;
                copiedWell.attr__showGroups = this.attr__showGroups;
                copiedWell.score = this.score;
                copiedWell.concentration = this.concentration;
                copiedWell.wellType = this.wellType;
                copiedWell.structure = this.structure;
                copiedWell.formula = this.formula;
                copiedWell.font = this.font;
                copiedWell.color = this.color;
                copiedWell.source = this.source;
                copiedWell.compoundId = this.compoundId;
                copiedWell.idt = this.idt;
                copiedWell.dye = this.dye;
                copiedWell.position = this.position;
                copiedWell.slope = this.slope;
                copiedWell.intercept = this.intercept;
                copiedWell.rSquared = this.rSquared;
                copiedWell.skin_transient = this.skin_transient;
                copiedWell.skin_type = this.skin_type;
                if (this.icon)
                    copiedWell.icon = JSON.parse(JSON.stringify(this.icon))
                copiedWell.properties = JSON.parse(JSON.stringify(this.properties));
                return copiedWell;
            }
            copyWell(_well) {

                this.attr__showBorder = _well.attr__showBorder;
                this.attr__showGroups = _well.attr__showGroups;
                this.score = _well.score;
                this.concentration = _well.concentration;
                this.wellType = _well.wellType;
                this.structure = _well.structure;
                this.color = _well.color;
                this.source = _well.source;
                this.compoundId = _well.compoundId;
                this.idt = _well.idt;
                this.dye = _well.dye;
                this.position = _well.position;
                this.font = _well.font;
                this.slope = _well.slope;
                this.intercept = _well.intercept;
                this.rSquared = _well.rSquared;
                this.skin_transient = _well.skin_transient;
                this.skin_type = _well.skin_type;
                this.formula = _well.formula;

                this.properties = JSON.parse(JSON.stringify(_well.properties));
                if (_well.group) {
                    let keys = Object.keys(_well.group)
                    for (let key of keys) {
                        this.setGroup(key)
                    }
                }

                if (this.skin_type && this.skin_type.toLowerCase() === 'address')
                    this.position = _well.value;
                else
                    this.value = _well.value;
            }

            getObj() {
                return this.obj;
            }

            setAddress(addr) {
                this.position = addr;
            }

            setGroupName(groupName) {
                if (!groupName || groupName === null || groupName.length <= 0) {
                    return;
                }
                this.group[groupName];
            }
            removeGroup(key) {

                if (this.group.hasOwnProperty(key)) {
                    delete this.group[key];
                }
            }

            hasGroup(groupName) {
                if (this.group && this.group[groupName]) {
                    return true;
                }
                else return false;
            }

            isComputationWell() {
                if (this.value === null) {
                    return false;
                }
                if (this.wellType != null && (this.wellType === 'header' || this.wellType + ''.toLowerCase() === 'comment')) {
                    return false;
                }
                return typeof this.value === 'number' && !isNaN(this.value);
            }

            drawMinimalValue(graph, grid, ctx, x, y, preferences) {
                if (!ctx) {
                    return;
                }
                let screen_x = graph.X(grid.X(x));
                let screen_y = graph.Y(grid.Y(y));
                this.__screen_x = screen_x;
                this.__screen_y = screen_y;
                let wellWidth = graph.screenWidth(grid.screenWidth(this.w));
                let wellHeight = graph.screenHeight(grid.screenHeight(this.h));
                let screen_height = wellHeight;
                let screen_width = wellWidth;
                if (this.skin_transient && screen_width > 30 && screen_height > 10) {
                    return this.skin_transient(graph, grid, ctx, min, max, x, y, this, preferences);
                }

                if (this.color) {
                    ctx.fillStyle = this.color;
                    ctx.fillRect(this.__screen_x, this.__screen_y, this.__screen_width, this.__screen_height);
                } else {
                    if (this.group && Object.keys(this.group).length > 0) {
                        let groupKeys = Object.keys(this.group);
                        let segmentWidth = screen_width / groupKeys.length;

                        groupKeys.forEach((groupKey, index) => {
                            if (!preferences[groupKey]) {
                                preferences[groupKey] = generateRandomRGBAColor();
                            }
                            let fillColor = preferences[groupKey] || 'rgba(120,120,250,0.2)';
                            let rect_x = screen_x + (index * segmentWidth);

                            ctx.fillStyle = fillColor;

                            ctx.fillRect(rect_x, screen_y, segmentWidth, screen_height);
                        });
                    } else {
                        ctx.fillStyle = this.bgcolor || '#F5F5F5';
                        ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                    }
                }

                if (this.select) {

                    if (this.__dirty) {
                        ctx.fillStyle = 'rgba(255, 0, 255, 0.3)'
                    } else
                        ctx.fillStyle = 'magenta';

                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                } else {
                    ctx.strokeStyle = this.equations ? "rgba(120, 120, 100, 1)" : '#D3D3D3';
                    ctx.lineWidth = this.equations ? 1 * scaleFactor : 1;
                    ctx.shadowBlur = this.equations ? 10 * scaleFactor : 0;
                    ctx.shadowColor = this.equations ? "rgba(40, 0, 0, 0.7)" : "transparent";
                    ctx.strokeRect(screen_x, screen_y, screen_width, screen_height);
                }
                ctx.stroke();
            }

            drawSimpleValue(graph, grid, ctx, x, y) {
                if (!ctx) {
                    return;
                }

                if (!this.__parsedValue && typeof this.value === 'string') {
                    let cleanedValue = this.value.trim().replace(/,/g, '');
                    if (!isNaN(cleanedValue) && cleanedValue !== "") {

                        this.__parsedValue = parseFloat(cleanedValue);
                        this.value = Number.isInteger(this.__parsedValue) ? parseInt(this.__parsedValue) : this.__parsedValue;
                    } else if (cleanedValue.startsWith('$') || cleanedValue.endsWith('%')) {
                        if (cleanedValue.startsWith('$')) {
                            this.value = parseFloat(cleanedValue.substring(1));
                            this.setGroup('dollar');
                        } else if (cleanedValue.endsWith('%')) {
                            this.value = parseFloat(cleanedValue.slice(0, -1));
                            this.skin_type = 'PERCENT';
                            this.setGroup('percent');
                        }
                    }
                } else if (this.value === null || this.value === null) {
                    this.value = '';
                } else if (this.value === 'null') {
                    this.value = '';
                }
                let screen_x = graph.X(grid.X(x));
                let screen_y = graph.Y(grid.Y(y));

                this.__screen_x = screen_x;
                this.__screen_y = screen_y;
                let wellWidth = graph.screenWidth(grid.screenWidth(this.w));
                let wellHeight = graph.screenHeight(grid.screenHeight(this.h));
                let centerX = graph.X(grid.X(x)) + wellWidth / 2;
                let centerY = graph.Y(grid.Y(y)) + wellHeight / 2;

                let offset = 2;
                ctx.fillStyle = "lightBlue";
                ctx.fillRect(graph.X(grid.X(x)) + offset, graph.Y(grid.Y(y)) + offset,
                    wellWidth - offset * 2, wellHeight - offset);

                if (this.value != null) {
                    let text = this.getValue();
                    let fontSize = calculateFontSizeWell(wellWidth - 10, wellHeight - 10, text, ctx);
                    ctx.font = `${fontSize}px Arial`;

                    if (this.font) {
                        ctx.font = `${fontSize}px ${this.font}`;
                    }

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'black';
                    if (this.fgcolor) {
                        ctx.fillStyle = this.fgcolor;
                    }
                    ctx.fillText(text, Math.floor(centerX), Math.floor(centerY));
                }

                ctx.stroke();
            }

            getName() {
                return this.name;
            }

            setName(_name) {
                this.name = _name;
            }

            selectIt() {
                this.select = true;
                this.textSelected = true;
                this.timeSelected = Date.now();
            }

            deselectIt() {
                this.select = false;
                this.textSelected = false;
                this.__dirty = false;
                this.__previousValue = null;

            }

            resetState() {
                this.__dirty = false;
                this.__previousValue = null;
            }
            setValue(original, update_without_history_stack) {
                let v = original;



                if (typeof v === 'string' && v.length > 10000) {
                    console.log("WILL NOT LOAD DATA THAT LARGE INTO WELLS");
                    return;
                }

                try {
                    if (typeof v === 'string') {
                        const numericRegex = /^-?\d+(\.\d+)?$/;

                        const originalString = v;
                        const noComma = v.replace(/,/g, "");

                        const trimmed = noComma.trim();

                        if (trimmed.startsWith('=')) {
                            const afterEq = trimmed.slice(1).replace(/,/g, '').trim();

                            this.formula = trimmed;
                            this.has_formula_time_set = Date.now()
                            this.__hasFormula = true;
                            v = originalString;


                            // if (numericRegex.test(afterEq)) {

                            //     v = afterEq.includes('.')
                            //         ? parseFloat(afterEq)
                            //         : parseInt(afterEq, 10);
                            // } else {

                            //     v = originalString;
                            // }
                        }

                        else if (!/[-/]/.test(trimmed)) {
                            if (numericRegex.test(trimmed)) {
                                v = trimmed.includes('.')
                                    ? parseFloat(trimmed)
                                    : parseInt(trimmed, 10);
                            } else {
                                v = originalString;
                            }
                        }

                        else {
                            v = originalString;
                        }
                    }
                } catch (exception) {
                    console.error("Error in setValue parsing:", exception);
                    v = original;
                }

                if (!update_without_history_stack) {
                    if (!this.__dirty) {
                        pushHistory(HM(this));
                        this.__previousValue = this.value;
                        this.__dirty = true;
                    }
                }

                this.value = v;

                if (this.__dirty) {
                    shareObject(this);
                }
            }

            setWellType(wtype) {
                this.skin_type = wtype;
                if (this.skin_type)
                    this.skin_transient = WellDisplay[this.skin_type]
                else {
                    this.skin_transient = null
                }
            }

            setValueByType(txt) {

                if (this.skin_type === 'CONCENTRATION') {
                    if (typeof txt === 'string') {

                        txt = txt.trim().replace(/,/g, '');
                    }
                    const concentrationValue = parseFloat(txt);
                    this.concentration = isNaN(concentrationValue) ? null : concentrationValue;
                } else {
                    this.value = txt;
                }
            }

            drawAnnotations(graph, grid, ctx, min, max, x, y, scw, sch, preferences) {
                if (!ctx) return;
                if (!this.__previousValue || !this.select) {
                    this.__dirty = false;
                }

                const [w, h] = updateNumbers();
                this.w = w; this.h = h;
                if (w) this.__screen_width = scw;
                if (h) { sch = graph.screenHeight(grid.screenHeight(h)); this.__screen_height = sch; }

                if (this.value != null && Array.isArray(this.value)) {
                    this.value = this.value[0] + '';
                } else if (typeof this.value === 'Date') {
                    this.value = this.value.toString();
                } else if (this.value === '0') {
                    this.value = 0;
                } else if (this.__parsedValue && typeof this.value === 'string') {
                    let cleaned = this.value.replace(/,/g, '').trim();
                    const num__ = parseFloat(cleaned);
                    if (!isNaN(num__) && isFinite(num__) && this.value.trim() !== "") {
                        this.value = num__;
                    }
                    const num = cleaned.startsWith('$') ? parseFloat(cleaned.substring(1)) :
                        cleaned.endsWith('%') ? parseFloat(cleaned.slice(0, -1)) : parseFloat(cleaned);
                    if (!isNaN(num)) {
                        this.value = num;
                        if (cleaned.startsWith('$')) this.setGroup('dollar');
                        if (cleaned.endsWith('%')) { this.skin_type = 'PERCENT'; this.setGroup('percent'); }
                    }
                } else if (this.value === null || this.value === 'null') {
                    this.value = '';
                }

                if (!this.skin_type) this.skin_transient = null;

                if (this.__dirty && this.obj && typeof this.obj === 'string' && this.obj.startsWith('=')) {
                    this.skin_transient = WellDisplay['EXCEL_STYLE_TEXT'];
                } else if (this.skin_type && !this.skin_transient) {
                    this.skin_transient = WellDisplay[this.skin_type];
                }

                this.x = x; this.y = y;

                const screen_x = graph.X(grid.X(x));
                const screen_y = graph.Y(grid.Y(y));
                this.__screen_x = screen_x; this.__screen_y = screen_y;

                const screen_width = this.__screen_width || scw;
                const screen_height = this.__screen_height || sch;

                if (screen_height < 5 || screen_width < 10) {
                    return this.drawMinimal(graph, grid, ctx, min, max, x, y, preferences);
                }

                const scaleFactor = Math.min(screen_width, screen_height) / 30;

                let baseFontSize = Math.max(8, 8 * scaleFactor);

                if (this.group && Object.keys(this.group).length > 0) {
                    let groupKeys = Object.keys(this.group);
                    let segmentWidth = screen_width / groupKeys.length;

                    groupKeys.forEach((groupKey, index) => {
                        if (!preferences[groupKey]) {
                            preferences[groupKey] = generateRandomRGBAColor();
                        }
                        let fillColor = preferences[groupKey] || 'rgba(120,120,250,0.2)';
                        let rect_x = screen_x + (index * segmentWidth);

                        ctx.fillStyle = fillColor;

                        ctx.fillRect(rect_x, screen_y, segmentWidth, screen_height);
                    });
                }




                const applyFontSize = (size) => {
                    size = 10;
                    if (this.font) {
                        ctx.font = `${size}px ${this.font}`;
                    } else {
                        ctx.font = `${size}pt Arial`;
                    }
                };

                applyFontSize(baseFontSize);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let drewBackground = false;

                const now = Date.now();
                const lastGone = this.has_formula_time_set;
                const missingMs = (now - lastGone);

                if (this.skin_transient && screen_width > 30 && screen_height > 10) {
                    this.skin_transient(graph, grid, ctx, min, max, x, y, this, preferences);
                    if (!this.isHeader() && preferences && preferences.showInputs) {
                        if (!this.__hasFormula && missingMs > 10_000) {
                            ctx.save();
                            const inset = Math.max(2, Math.round(Math.min(screen_width, screen_height) * 0.03));
                            const ax = screen_x + inset;
                            const ay = screen_y + inset;
                            const aw = Math.max(1, screen_width - inset * 2);
                            const ah = Math.max(1, screen_height - inset * 2);
                            drawPunchyArrow(ctx, ax, ay, aw, ah, { arrowDepthPct: 0.01 });
                            ctx.restore();
                        }
                    }
                    return;
                }

                if (!drewBackground) {
                    ctx.fillStyle = this.color || 'transparent';
                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                }

                if (!this.isHeader() && preferences && preferences.showInputs) {
                    if (!this.__hasFormula && missingMs > 10_000) {
                        ctx.save();
                        const inset = Math.max(2, Math.round(Math.min(screen_width, screen_height) * 0.03));
                        const ax = screen_x + inset;
                        const ay = screen_y + inset;
                        const aw = Math.max(1, screen_width - inset * 2);
                        const ah = Math.max(1, screen_height - inset * 2);
                        drawPunchyArrow(ctx, ax, ay, aw, ah, { arrowDepthPct: 0.01 });
                        ctx.restore();
                    }
                }

                if (this.attr__showGroups && this.group && Object.keys(this.group).length > 0) {
                    const keys = Object.keys(this.group).filter(k => !k.toLowerCase().includes('header'));
                    const segH = screen_height / keys.length;
                    keys.forEach((key, i) => {
                        const fillColor = preferences[key] ||= generateRandomRGBAColor();
                        ctx.fillStyle = fillColor;
                        const cx = screen_x + screen_width - segH / 2;
                        const cy = screen_y + (i + 0.5) * segH;
                        const r = segH / 3;
                        ctx.beginPath();
                        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                        ctx.fill();
                    });
                }

                if (this.select) {
                    ctx.fillStyle = this.__dirty ? 'rgba(255, 0, 255, 0.3)' : 'magenta';
                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                } else if (this.attr__showBorder) {
                    ctx.strokeStyle = this.equations ? "rgba(85, 125, 255, 0.7)" : '#D3D3D3';
                    ctx.lineWidth = this.equations ? scaleFactor : 1;
                    ctx.shadowColor = this.equations ? "rgba(0, 0, 0, 0.7)" : "transparent";
                    ctx.strokeRect(screen_x, screen_y, screen_width, screen_height);
                }

                ctx.fillStyle = this.fgcolor || 'black';
                ctx.shadowBlur = 0;

                let displayValue = '';
                if (typeof this.value === 'string') {
                    displayValue = this.value;
                } else if (this.value != null) {
                    try {
                        displayValue = Number.isInteger(this.value)
                            ? this.value.toString()
                            : this.value.toFixed(5);
                    } catch (e) {
                        displayValue = this.value != null ? this.value.toString() : '';
                    }
                }

                if (this.group && (this.group['dollar'] || this.group['$'])) {
                    const num = parseFloat(displayValue);
                    if (!isNaN(num)) {
                        displayValue = '$' + new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }).format(num);
                    }
                }

                if (displayValue) {

                    let testFontSize = baseFontSize;
                    const maxWidth = screen_width * 0.85;
                    const maxHeight = screen_height * 0.85;

                    while (true) {
                        applyFontSize(testFontSize);
                        const m = ctx.measureText(displayValue);

                        const textWidth = m.width;
                        const ascent = m.actualBoundingBoxAscent ?? testFontSize;
                        const descent = m.actualBoundingBoxDescent ?? (testFontSize * 0.25);
                        const textHeight = ascent + descent;

                        if (textWidth > maxWidth || textHeight > maxHeight) {
                            testFontSize = Math.max(6, testFontSize - 1);
                            applyFontSize(testFontSize);
                            break;
                        }
                        testFontSize += 1;
                        if (testFontSize >= screen_height) {
                            testFontSize = screen_height;
                            applyFontSize(testFontSize);
                            break;
                        }
                    }
                    displayValue = truncateTextCached(displayValue, screen_width - 10, ctx);

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(
                        displayValue,
                        screen_x + screen_width / 2,
                        screen_y + screen_height / 2
                    );
                }

                if (this.attr__showGroups && this.group && screen_width > 150 && screen_height > 50) {
                    const keysText = Object.keys(this.group).join(", ");
                    const groupFont = Math.max(baseFontSize - 4, 6);
                    applyFontSize(groupFont);

                    const text = truncateTextCached(keysText, screen_width - 10, ctx);

                }

                if (this.obj) {
                    const wellWidth = this.__screen_width;
                    const wellHeight = this.__screen_height;
                    const posX = graph.X(grid.X(x));
                    const posY = graph.Y(grid.Y(y));
                    const iconSize = Math.min(wellWidth, wellHeight) * 0.5;
                    const iconX = posX + wellWidth - iconSize - 6;
                    const iconY = posY + (wellHeight - iconSize) / 2;

                    ctx.fillStyle = "rgba(10, 40, 100, 0.91)";
                    ctx.beginPath();
                    ctx.roundRect(iconX, iconY, iconSize, iconSize, 3);
                    ctx.fill();

                    ctx.fillStyle = "white";
                    const triangleSize = iconSize * 0.5;
                    const triX = iconX + iconSize / 2.2;
                    const triY = iconY + iconSize / 2;
                    ctx.beginPath();
                    ctx.moveTo(triX - triangleSize / 2, triY - triangleSize / 1.5);
                    ctx.lineTo(triX + triangleSize / 2, triY);
                    ctx.lineTo(triX - triangleSize / 2, triY + triangleSize / 1.5);
                    ctx.closePath();
                    ctx.fill();
                }

                if (this.__hasError) {
                    this.__drawErrorOverlay(ctx, screen_x, screen_y, screen_width, screen_height);
                }
            }

            getConcentration() {
                if (this.concentration && typeof this.concentration === 'number') {
                    return this.concentration.toFixed(5)
                }
                if (this.concentration === null || this.concentration === undefined) {
                    this.concentration = '';
                }
                return this.concentration;
            }

            getValue() {
                if (typeof this.value === 'string') {
                    this.value = checkAndCastToNumber(this.value)
                }

                if (this.value && typeof this.value === 'number') {

                    let v = this.value;
                    if (this.skin_type && this.skin_type.toLowerCase() === 'percent') {

                        return v;
                    }

                    if (!Number.isInteger(this.value)) {
                        return v.toFixed(5)
                    } else {
                        return v;
                    }
                } else {
                    return this.value;
                }
            }

            getWidth() {
                return this.w;
            }
            getHeight() {
                return this.h;
            }

            drawMinimal(graph, grid, ctx, min, max, x, y, preferences) {

                this.w = updateNumbers()[0]
                this.h = updateNumbers()[1]
                if (this.w) {
                    this.__screen_width = graph.screenWidth(grid.screenWidth(this.w));
                }
                if (this.h) {
                    this.__screen_height = graph.screenHeight(grid.screenHeight(this.h));
                }

                const screen_x = graph.X(grid.X(x));
                const screen_y = graph.Y(grid.Y(y));
                this.__screen_x = screen_x;
                this.__screen_y = screen_y;

                if (!ctx) {
                    return;
                }

                if (this.__highlight__) {
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = "magenta";
                } else {
                    ctx.shadowBlur = 0;
                }

                if (this.skin_transient) {
                    return this.skin_transient(graph, grid, ctx, min, max, x, y, this);
                }

                if (!this.__parsedValue && typeof this.value === 'string') {
                    let cleanedValue = this.value.trim().replace(/,/g, '');
                    if (!isNaN(cleanedValue) && cleanedValue !== "") {

                        this.__parsedValue = parseFloat(cleanedValue);

                        this.value = Number.isInteger(this.__parsedValue) ? parseInt(this.__parsedValue) : this.__parsedValue;
                    } else if (cleanedValue.startsWith('$') || cleanedValue.endsWith('%')) {
                        if (cleanedValue.startsWith('$')) {
                            this.value = parseFloat(cleanedValue.substring(1));
                            this.skin_type = 'DOLLAR';
                            this.setGroup('dollar');
                        } else if (cleanedValue.endsWith('%')) {
                            this.value = parseFloat(cleanedValue.slice(0, -1));
                            this.skin_type = 'PERCENT';
                            this.setGroup('percent');
                        }
                    }
                } else if (this.value === null || this.value === null) {
                    this.value = '';
                } else if (this.value === 'null') {
                    this.value = '';
                }

                let offset = 0;

                let screen_width = this.__screen_width - offset * 2;
                let screen_height = this.__screen_height - offset;
                const scaleFactor = Math.min(screen_width, screen_height) / 60;
                let fontSize = 8 * scaleFactor;
                if (fontSize < 7) {
                    fontSize = 7
                }
                if (this.color) {
                    ctx.fillStyle = this.color;
                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);

                } else
                    if (this.group && Object.keys(this.group).length > 0) {
                        let groupKeys = Object.keys(this.group);
                        let segmentWidth = screen_width / groupKeys.length;

                        groupKeys.forEach((groupKey, index) => {

                            if (!preferences[groupKey]) {
                                preferences[groupKey] = generateRandomRGBAColor();
                            }
                            let fillColor = preferences[groupKey] || 'rgba(20,220,50,0.6)';
                            let rect_x = screen_x + (index * segmentWidth);
                            ctx.fillStyle = fillColor;
                            ctx.fillRect(rect_x, screen_y, segmentWidth, screen_height);
                        });
                    } else {

                        ctx.fillStyle = this.bgcolor || 'lightGray';
                        ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                    }

                if (this.select) {
                    ctx.fillStyle = 'magenta';
                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);
                }

                ctx.shadowBlur = 0;
            }

            loadFromJSON(jsonObj) {
                this.name = jsonObj.name || 'unknown';
                this.value = jsonObj.value;
                this.obj = jsonObj.obj;
                this.group = jsonObj.group || {};
                this.font = jsonObj.font;
                this.score = jsonObj.score;
                this.concentration = jsonObj.concentration;
                this.wellType = jsonObj.wellType;
                this.structure = jsonObj.structure;
                this.bgcolor = jsonObj.bgcolor;
                this.fgcolor = jsonObj.fgcolor || 'black';
                this.color = jsonObj.color;
                this.source = jsonObj.source;
                this.compoundId = jsonObj.compoundId;
                this.idt = jsonObj.idt;
                this.props = jsonObj.props;
                this.dye = jsonObj.dye;
                this.position = jsonObj.position;
                this.properties = jsonObj.properties || {};
                this.icon = jsonObj.icon ? JSON.parse(JSON.stringify(jsonObj.icon)) : null;
                this.slope = jsonObj.slope;
                this.intercept = jsonObj.intercept;
                this.rSquared = jsonObj.rSquared;
                this.formula = jsonObj.formula || '';
                this.uid = jsonObj.uid || uuid();
                this.x = jsonObj.x;
                this.y = jsonObj.y;
                this.w = jsonObj.w;
                this.h = jsonObj.h;
                this.equations = jsonObj.equations || [];
                this.__highlight__ = jsonObj.__highlight__ || false;
                this.skin_transient = jsonObj.skin_transient;
                this.skin_type = jsonObj.skin_type;
                this.__screen_y = jsonObj.__screen_y;
                this.__screen_x = jsonObj.__screen_x;
                this.__screen_width = jsonObj.__screen_width;
                this.__screen_height = jsonObj.__screen_height;
                this.attr__showGroups = jsonObj.attr__showGroups !== undefined ? jsonObj.attr__showGroups : true;
                this.attr__showBorder = jsonObj.attr__showBorder !== undefined ? jsonObj.attr__showBorder : true;
                this.__hasError = !!jsonObj.__hasError;
                this.__errorMessage = jsonObj.__errorMessage || null;
                this.__errorAt = jsonObj.__errorAt || null;
            }

        }

        resolve(GenericWell)

    })
}
