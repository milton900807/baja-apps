function () {
    return new Promise(async (resolve, reject) => {

        let Arrow = await exec('flexigraph/shapes/arrow.js')
        let Note = await exec('flexigraph/shapes/postit.js')
        let ANote = await exec('flexigraph/shapes/arrow-note.js')
        let LNote = await exec('flexigraph/shapes/simpler-note.js')
        let Icon = await exec('flexigraph/shapes/icon.js')

        const ShapeThemes = await exec('flexigraph/shapes/shape-themes')

        function clampDeg(deg) {
            let d = Number(deg);
            if (!Number.isFinite(d)) return 0;

            d = ((d + 180) % 360 + 360) % 360 - 180;

            if (d < -45) d = -45;
            if (d > 45) d = 45;
            return d;
        }

        const finalizeSvgPrimitive = (shape, srcJson) => {
            if (!shape) return shape;
            Shape._attachBBoxMethods(shape);
            Shape._attachCollisionMethods(shape);
            const theme_path = srcJson?.gfx?.path;
            if (theme_path && typeof theme_path === 'string' && theme_path.indexOf('.') > 0) {
                const parts = theme_path.split('.');
                if (parts.length === 2) {
                    const [category, themeKey] = parts;
                    const theme = ShapeThemes?.[category]?.[themeKey] || null;
                    if (theme && typeof shape.applyTheme === 'function') shape.applyTheme(theme);
                }
            }

            const rot = Shape._readRotationDeg(srcJson || {}, 0);
            if (
                ('rotationDeg' in shape) ||
                (srcJson && (srcJson.rotationDeg != null || srcJson.rotation != null || srcJson.rot != null || srcJson.angleDeg != null))
            ) {
                shape.rotationDeg = rot;
                Shape._attachRotationMethods(shape);
            }
            Shape._attachToJSONAll(shape, { deep: true });
            return shape;
        };




        function makeElasticNucleotideChain(shape, opts = {}) {
            const stiffness = opts.stiffness ?? 0.18;   // spring pull strength
            const damping = opts.damping ?? 0.82;       // trailing / string feel
            const iterations = opts.iterations ?? 10;   // constraint passes per frame
            const dragInfluence = opts.dragInfluence ?? 1.0;
            const maxSpeed = opts.maxSpeed ?? 2.5;

            // Pull out the nucleotide circles from the svg_group.
            // Assumes each nucleotide is a circle with cx/cy and there are bond lines between them.
            const all = Array.isArray(shape.shapes) ? shape.shapes : [];
            const nucleotides = all.filter(s => s && s.type === 'svg_group')
                .map(group => {
                    const circle = group.shapes?.find(x => x.type === 'circle');
                    const baseText = group.shapes?.find(x => x.type === 'text' && /^[ACGU]$/i.test(String(x.text || '')));
                    return circle ? { group, circle, baseText } : null;
                })
                .filter(Boolean);

            if (nucleotides.length < 2) return shape;

            // Build chain points from nucleotide centers
            const points = nucleotides.map((n, i) => ({
                i,
                x: n.circle.cx,
                y: n.circle.cy,
                px: n.circle.cx, // previous position for verlet-ish trailing
                py: n.circle.cy,
                vx: 0,
                vy: 0,
                pinned: false
            }));

            // Create neighbor links using original spacing as rest length
            const links = [];
            for (let i = 0; i < points.length - 1; i++) {
                const a = points[i];
                const b = points[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                links.push({
                    a: i,
                    b: i + 1,
                    rest: Math.sqrt(dx * dx + dy * dy) || 1
                });
            }

            function clampLen(vx, vy, max) {
                const m = Math.sqrt(vx * vx + vy * vy);
                if (m <= max || m === 0) return [vx, vy];
                const k = max / m;
                return [vx * k, vy * k];
            }

            function syncShapesFromPoints() {
                // move nucleotide visuals
                nucleotides.forEach((n, i) => {
                    const p = points[i];
                    const dx = p.x - n.circle.cx;
                    const dy = p.y - n.circle.cy;

                    // move the entire grouped nucleotide
                    if (typeof n.group.setX === 'function' && typeof n.group.setY === 'function') {
                        const cx = (n.group.getX() + n.group.getXf()) / 2;
                        const cy = (n.group.getY() + n.group.getYf()) / 2;
                        n.group.setX(n.group.getX() + dx);
                        n.group.setY(n.group.getY() + dy);
                    } else if (typeof Shape !== 'undefined' && Shape._translateShapeSafe) {
                        Shape._translateShapeSafe(n.group, dx, dy);
                    } else {
                        // fallback manual translate
                        translateDeep(n.group, dx, dy);
                    }
                });

                // redraw backbone bond lines between consecutive nucleotides
                // this assumes the chain lines are the pale horizontal lines in order
                const bondLines = all.filter(s => s && s.type === 'line' && s.style?.strokeWidth >= 1.5);

                for (let i = 0; i < Math.min(bondLines.length, points.length - 1); i++) {
                    const a = points[i];
                    const b = points[i + 1];
                    const line = bondLines[i];

                    line.x1 = a.x;
                    line.y1 = a.y;
                    line.x2 = b.x;
                    line.y2 = b.y;
                }
            }

            function translateDeep(s, dx, dy) {
                if (!s) return;
                if ('x' in s) s.x += dx;
                if ('y' in s) s.y += dy;
                if ('xf' in s) s.xf += dx;
                if ('yf' in s) s.yf += dy;
                if ('cx' in s) s.cx += dx;
                if ('cy' in s) s.cy += dy;
                if ('x1' in s) s.x1 += dx;
                if ('y1' in s) s.y1 += dy;
                if ('x2' in s) s.x2 += dx;
                if ('y2' in s) s.y2 += dy;
                if (Array.isArray(s.pts)) {
                    for (const p of s.pts) {
                        p.x += dx;
                        p.y += dy;
                    }
                }
                if (Array.isArray(s.shapes)) {
                    for (const child of s.shapes) translateDeep(child, dx, dy);
                }
            }

            function relaxConstraints() {
                for (let k = 0; k < iterations; k++) {
                    for (const link of links) {
                        const a = points[link.a];
                        const b = points[link.b];

                        let dx = b.x - a.x;
                        let dy = b.y - a.y;
                        let dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

                        const diff = (dist - link.rest) / dist;
                        const offX = dx * 0.5 * stiffness * diff;
                        const offY = dy * 0.5 * stiffness * diff;

                        if (!a.pinned) {
                            a.x += offX;
                            a.y += offY;
                        }
                        if (!b.pinned) {
                            b.x -= offX;
                            b.y -= offY;
                        }
                    }
                }
            }

            function step() {
                for (const p of points) {
                    if (p.pinned) continue;

                    // trailing feel
                    let vx = (p.x - p.px) * damping;
                    let vy = (p.y - p.py) * damping;

                    [vx, vy] = clampLen(vx, vy, maxSpeed);

                    p.px = p.x;
                    p.py = p.y;
                    p.x += vx;
                    p.y += vy;
                }

                relaxConstraints();
                syncShapesFromPoints();
            }

            // Find nearest nucleotide to a world point
            shape.findNearestNucleotide = function (wx, wy, maxDist = Infinity) {
                let best = -1;
                let bestD = maxDist * maxDist;
                for (let i = 0; i < points.length; i++) {
                    const dx = points[i].x - wx;
                    const dy = points[i].y - wy;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < bestD) {
                        bestD = d2;
                        best = i;
                    }
                }
                return best;
            };

            shape.pullNucleotide = function (index, wx, wy) {
                const p = points[index];
                if (!p) return;

                // pin dragged point directly to cursor
                p.pinned = true;
                p.px = p.x;
                p.py = p.y;
                p.x += (wx - p.x) * dragInfluence;
                p.y += (wy - p.y) * dragInfluence;

                step();
            };

            shape.releaseNucleotide = function (index) {
                const p = points[index];
                if (!p) return;
                p.pinned = false;
            };

            shape.stepElasticChain = step;
            shape._elasticPoints = points;
            shape._elasticLinks = links;

            return shape;
        }

        const Shape = class Shape {

            DefaultGfx = {
                drawRect(shape, grid, ctx) {
                    const sx = grid.X(shape.x);
                    const syTop = grid.Y(shape.y + shape.h);
                    const sw = grid.screenWidth(shape.w);
                    const sh = grid.screenHeight(shape.h);

                    ctx.lineWidth = shape.style.strokeWidth;
                    ctx.strokeStyle = shape.style.stroke || '#000';

                    Shape._applyShadow(ctx, shape.style);

                    let fillStyle = 'transparent';
                    if (shape.style.fill && shape.style.fill !== 'none') {
                        const shaded = Shape._getShadedFill(ctx, shape.style.fill, sx, syTop, sw, sh);
                        fillStyle = shaded || shape.style.fill;
                    }
                    ctx.fillStyle = fillStyle;

                    ctx.beginPath();
                    ctx.rect(sx, syTop, sw, sh);
                    if (shape.style.fill && shape.style.fill !== 'none') ctx.fill();
                    ctx.stroke();

                    Shape._clearShadow(ctx);
                },

                drawLine(shape, grid, ctx) {
                    ctx.strokeStyle = shape.style.stroke || '#000';
                    ctx.lineWidth = shape.style.strokeWidth || 1;

                    Shape._applyShadow(ctx, shape.style);

                    ctx.beginPath();
                    ctx.moveTo(grid.X(shape.x1), grid.Y(shape.y1));
                    ctx.lineTo(grid.X(shape.x2), grid.Y(shape.y2));
                    ctx.stroke();

                    Shape._clearShadow(ctx);
                },

                drawCircle(shape, grid, ctx) {
                    const sx = grid.X(shape.cx);
                    const sy = grid.Y(shape.cy);
                    const sr = grid.screenWidth(shape.r);

                    ctx.strokeStyle = shape.style.stroke || '#000';
                    ctx.lineWidth = shape.style.strokeWidth || 1;

                    Shape._applyShadow(ctx, shape.style);

                    let fillStyle = null;
                    if (shape.style.fill && shape.style.fill !== 'none') {
                        const shaded = Shape._getShadedFill(ctx, shape.style.fill, sx - sr, sy - sr, sr * 2, sr * 2);
                        fillStyle = shaded || shape.style.fill;
                    }
                    if (fillStyle) ctx.fillStyle = fillStyle;

                    ctx.beginPath();
                    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                    if (fillStyle) ctx.fill();
                    ctx.stroke();

                    Shape._clearShadow(ctx);
                },

                drawEllipse(shape, grid, ctx) {
                    const sx = grid.X(shape.cx);
                    const sy = grid.Y(shape.cy);
                    const srx = grid.screenWidth(shape.rx);
                    const sry = grid.screenHeight(shape.ry);

                    ctx.strokeStyle = shape.style.stroke || '#000';
                    ctx.lineWidth = shape.style.strokeWidth || 1;

                    Shape._applyShadow(ctx, shape.style);

                    let fillStyle = null;
                    if (shape.style.fill && shape.style.fill !== 'none') {
                        const shaded = Shape._getShadedFill(ctx, shape.style.fill, sx - srx, sy - sry, srx * 2, sry * 2);
                        fillStyle = shaded || shape.style.fill;
                    }

                    ctx.beginPath();
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.scale(srx, sry);
                    ctx.arc(0, 0, 1, 0, Math.PI * 2);
                    ctx.restore();

                    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
                    ctx.stroke();

                    Shape._clearShadow(ctx);
                },

                drawPoly(shape, grid, ctx) {
                    ctx.strokeStyle = shape.style.stroke || '#000';
                    ctx.lineWidth = shape.style.strokeWidth || 1;

                    Shape._applyShadow(ctx, shape.style);

                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    shape.pts.forEach(p => {
                        const sx = grid.X(p.x), sy = grid.Y(p.y);
                        minX = Math.min(minX, sx); minY = Math.min(minY, sy);
                        maxX = Math.max(maxX, sx); maxY = Math.max(maxY, sy);
                    });

                    let fillStyle = 'transparent';
                    if (shape.style.fill && shape.style.fill !== 'none') {
                        const shaded = Shape._getShadedFill(ctx, shape.style.fill, minX, minY, maxX - minX, maxY - minY);
                        fillStyle = shaded || shape.style.fill;
                    }

                    ctx.beginPath();
                    shape.pts.forEach((p, i) => {
                        const sx = grid.X(p.x), sy = grid.Y(p.y);
                        if (i === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    });
                    if (shape.isClosed) ctx.closePath();

                    if (shape.isClosed && shape.style.fill && shape.style.fill !== 'none') {
                        ctx.fillStyle = fillStyle;
                        ctx.fill();
                    }
                    ctx.stroke();

                    Shape._clearShadow(ctx);
                },

                drawText(shape, grid, ctx) {

                    shape.__defaultTextDraw?.(grid, ctx);
                },
                drawPath(shape, grid, ctx) {
                    const pathData = shape.d || '';
                    if (!pathData.trim()) return;

                    let path2d;
                    try {
                        path2d = new Path2D(pathData);
                    } catch (err) {
                        console.warn('Invalid SVG path data:', pathData, err);
                        return;
                    }

                    ctx.strokeStyle = shape.style.stroke || '#000';
                    ctx.lineWidth = shape.style.strokeWidth || 1;

                    Shape._applyShadow(ctx, shape.style);

                    ctx.save();
                    try {
                        // Match the same SVG -> world convention used by _makeCircle/_makeEllipse:
                        // x stays the same, y is flipped because SVG y grows downward.
                        const sx0 = grid.X(0);
                        const sy0 = grid.Y(0);
                        const sx1 = grid.X(1);
                        const sy1 = grid.Y(-1);

                        const scaleX = (sx1 - sx0) || 1;
                        const scaleY = (sy1 - sy0) || 1;

                        ctx.setTransform(scaleX, 0, 0, scaleY, sx0, sy0);

                        let fillStyle = null;
                        if (shape.style.fill && shape.style.fill !== 'none') {
                            // Use world-space bbox already stored on the shape
                            const bx = grid.X(shape.x);
                            const by = grid.Y(shape.y + shape.h);
                            const bw = grid.screenWidth(shape.w);
                            const bh = grid.screenHeight(shape.h);
                            const shaded = Shape._getShadedFill(ctx, shape.style.fill, bx, by, bw, bh);
                            fillStyle = shaded || shape.style.fill;
                        }

                        if (fillStyle) {
                            ctx.fillStyle = fillStyle;
                            ctx.fill(path2d);
                        }

                        if (shape.style.stroke && shape.style.stroke !== 'none') {
                            ctx.stroke(path2d);
                        }
                    } finally {
                        ctx.restore();
                        Shape._clearShadow(ctx);
                    }
                }
            };

            theme = 'default'

            static _n(v) {
                return (typeof v === 'number' && Number.isFinite(v)) ? v : 0;
            }

            static _isFinite(v) {
                return typeof v === 'number' && Number.isFinite(v);
            }

            static _rotPt(px, py, ox, oy, a) {
                const ca = Math.cos(a);
                const sa = Math.sin(a);
                const dx = px - ox;
                const dy = py - oy;
                return {
                    x: ox + dx * ca - dy * sa,
                    y: oy + dx * sa + dy * ca
                };
            }
            static buildFromJSON(json) {
                if (!json || typeof json !== 'object') return null;

                const type = json.type;
                if (!type) return null;
                const typeLower = String(type).toLowerCase();

                if (typeLower === 'mol' || typeLower === 'molecule') {
                    return Shape._buildMolFromJSON(json);
                }

                if (typeLower === 'svg_group' || typeLower.startsWith('svg_')) {
                    const svgShape = Shape._buildSvgFromJSON(json);
                    if (svgShape) return svgShape;
                }

                if (typeLower === 'svg_group') {
                    const childShapes = Array.isArray(json.shapes)
                        ? json.shapes.map(childJson => Shape._buildSvgFromJSON(childJson)).filter(Boolean)
                        : [];

                    const g = Shape._makeCompositeShape(childShapes);

                    if (json.rotationDeg != null || json.rotation != null || json.rot != null || json.angleDeg != null) {
                        g.rotationDeg = Shape._readRotationDeg(json, g.rotationDeg ?? 0);
                        Shape._ensureRotationAPI(g);
                    }

                    if (json.name != null) g.name = json.name;
                    if (json.id != null) g.id = json.id;
                    if (json.z != null) g.z = json.z;
                    if (json.locked != null) g.locked = json.locked;
                    if (json.hidden != null) g.hidden = json.hidden;

                    return g;
                }

                return Shape._buildSvgFromJSON(json);
            }

            static fromMolString(molString, opts = {}) {
                const parsed = Shape._parseMolString(molString);
                const shape = Shape._makeMolShape(parsed, opts);
                Shape._finalizeShape(shape);
                finalizeSvgPrimitive(shape, opts);

                return shape;
            }
            static _buildMolFromJSON(json) {
                if (typeof json.mol === 'string') {
                    return Shape.fromMolString(json.mol, json);
                }

                if (Array.isArray(json.atoms) && Array.isArray(json.bonds)) {
                    return Shape._makeMolShape({
                        atoms: json.atoms,
                        bonds: json.bonds
                    }, json);
                }

                return null;
            }

            static _parseMolString(molString) {
                if (typeof molString !== 'string' || !molString.trim()) {
                    throw new Error('MOL source must be a non-empty string');
                }

                const lines = molString.replace(/\r\n/g, '\n').split('\n');
                if (lines.length < 4) {
                    throw new Error('Invalid MOL file: too few lines');
                }

                const counts = lines[3] || '';
                const atomCount = parseInt(counts.slice(0, 3).trim(), 10);
                const bondCount = parseInt(counts.slice(3, 6).trim(), 10);

                if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) {
                    throw new Error('Invalid MOL file: bad counts line');
                }

                const atoms = [];
                const bonds = [];

                const atomStart = 4;
                const bondStart = atomStart + atomCount;

                for (let i = 0; i < atomCount; i++) {
                    const line = lines[atomStart + i] || '';
                    const x = parseFloat(line.slice(0, 10).trim());
                    const y = parseFloat(line.slice(10, 20).trim());
                    const z = parseFloat(line.slice(20, 30).trim());
                    const element = (line.slice(31, 34).trim() || 'C');

                    atoms.push({
                        x: Number.isFinite(x) ? x : 0,
                        y: Number.isFinite(y) ? y : 0,
                        z: Number.isFinite(z) ? z : 0,
                        element
                    });
                }

                for (let i = 0; i < bondCount; i++) {
                    const line = lines[bondStart + i] || '';
                    const a1 = parseInt(line.slice(0, 3).trim(), 10) - 1;
                    const a2 = parseInt(line.slice(3, 6).trim(), 10) - 1;
                    const order = parseInt(line.slice(6, 9).trim(), 10) || 1;

                    if (
                        Number.isInteger(a1) && Number.isInteger(a2) &&
                        atoms[a1] && atoms[a2]
                    ) {
                        bonds.push({ a1, a2, order });
                    }
                }

                return { atoms, bonds };
            }


            static _ensureInsideMethod(shape) {
                if (!shape || typeof shape.inside === 'function') return shape;

                shape.inside = function (grid, x, y) {
                    if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                    Shape._attachBBoxMethods?.(this);
                    if (typeof this.getX !== 'function' || typeof this.getY !== 'function' ||
                        typeof this.getXf !== 'function' || typeof this.getYf !== 'function') {
                        return false;
                    }

                    const x1 = this.getX(), y1 = this.getY(), x2 = this.getXf(), y2 = this.getYf();
                    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
                    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

                    const sx1 = grid.X(minX), sx2 = grid.X(maxX);
                    const sy1 = grid.Y(minY), sy2 = grid.Y(maxY);

                    const left = Math.min(sx1, sx2), right = Math.max(sx1, sx2);
                    const top = Math.min(sy1, sy2), bottom = Math.max(sy1, sy2);

                    return x >= left && x <= right && y >= top && y <= bottom;
                };

                return shape;
            }

            static _finalizeShape(shape) {
                if (!shape) return shape;

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);

                if ('rotationDeg' in shape) {

                    shape.rotationDeg = Shape._readRotationDeg(shape, shape.rotationDeg ?? 0);
                    Shape._attachRotationMethods(shape);
                }

                return shape;
            }

            static _ensureRotationAPI(obj) {
                if (!obj || typeof obj !== 'object') return obj;

                if (!('rotationDeg' in obj)) return obj;

                if (typeof obj.setRotation !== 'function') {
                    obj.setRotation = function (deg) {
                        const d = Number(deg);
                        if (!Number.isFinite(d)) return;
                        this.rotationDeg = clampDeg(d);
                    };
                }

                if (typeof obj.rotateByDeg !== 'function') {
                    obj.rotateByDeg = function (deltaDeg) {
                        const dd = Number(deltaDeg);
                        if (!Number.isFinite(dd) || !dd) return;
                        const cur = Number(this.rotationDeg) || 0;
                        this.setRotation(cur + dd);
                    };
                }

                return obj;
            }

            static _readRotationDeg(json, fallback = 0) {

                const cand = [
                    json.rotationDeg,
                    json.rotation,
                    json.rot,
                    json.angleDeg
                ].find(v => v !== undefined);

                const d = Number(cand);
                return Number.isFinite(d) ? clampDeg(d) : clampDeg(fallback);
            }

            static _attachRotationMethods(shape) {
                if (!shape || shape._rotationAttached) return shape;
                shape._rotationAttached = true;

                if (!('rotationDeg' in shape)) shape.rotationDeg = 0;

                if (typeof shape.setRotation !== 'function') {
                    shape.setRotation = function (deg) {
                        const d = Number(deg);
                        if (!Number.isFinite(d)) return;
                        this.rotationDeg = d;
                    };
                }

                if (typeof shape.rotateByDeg !== 'function') {
                    shape.rotateByDeg = function (deltaDeg) {
                        const dd = Number(deltaDeg);
                        if (!Number.isFinite(dd) || !dd) return;
                        const cur = Number(this.rotationDeg) || 0;
                        this.setRotation(cur + dd);
                    };
                }

                const degToRad = (d) => (Number(d) || 0) * Math.PI / 180;
                const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

                const getPivotWorld = (s) => {

                    if (s && typeof s.getPivot === 'function') {
                        try {
                            const p = s.getPivot();

                            if (Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1])) {
                                return { wx: p[0], wy: p[1] };
                            }
                            if (p && typeof p === 'object') {
                                if (isNum(p.wx) && isNum(p.wy)) return { wx: p.wx, wy: p.wy };
                                if (isNum(p.x) && isNum(p.y)) return { wx: p.x, wy: p.y };
                            }
                        } catch (e) {

                        }
                    }

                    if (s && isNum(s.cx) && isNum(s.cy)) return { wx: s.cx, wy: s.cy };

                    if (s && isNum(s.x) && isNum(s.y) && isNum(s.w) && isNum(s.h)) {

                        return { wx: s.x + s.w / 2, wy: s.y + s.h / 2 };
                    }

                    Shape._attachBBoxMethods?.(s);
                    if (s &&
                        typeof s.getX === 'function' && typeof s.getY === 'function' &&
                        typeof s.getXf === 'function' && typeof s.getYf === 'function'
                    ) {
                        const x1 = s.getX(), y1 = s.getY(), x2 = s.getXf(), y2 = s.getYf();
                        if ([x1, y1, x2, y2].every(isNum)) {
                            return { wx: (x1 + x2) / 2, wy: (y1 + y2) / 2 };
                        }
                    }

                    return { wx: 0, wy: 0 };
                };

                const _draw = (typeof shape.draw === 'function') ? shape.draw.bind(shape) : null;
                const _inside = (typeof shape.inside === 'function') ? shape.inside.bind(shape) : null;

                if (_draw) {
                    shape.draw = function (grid, ctx) {
                        const a = degToRad(this.rotationDeg);
                        if (!a) return _draw(grid, ctx);

                        const { wx, wy } = getPivotWorld(this);
                        const px = grid.X(wx);
                        const py = grid.Y(wy);

                        ctx.save();
                        ctx.translate(px, py);
                        ctx.rotate(a);
                        ctx.translate(-px, -py);

                        _draw(grid, ctx);

                        ctx.restore();
                    };
                }

                if (_inside) {
                    shape.inside = function (grid, mx, my, ctx) {
                        const a = degToRad(this.rotationDeg);
                        if (!a) return _inside(grid, mx, my, ctx);

                        const { wx, wy } = getPivotWorld(this);
                        const px = grid.X(wx);
                        const py = grid.Y(wy);

                        const dx = mx - px;
                        const dy = my - py;

                        const cosA = Math.cos(-a);
                        const sinA = Math.sin(-a);

                        const lx = dx * cosA - dy * sinA + px;
                        const ly = dx * sinA + dy * cosA + py;

                        return _inside(grid, lx, ly, ctx);
                    };
                }

                return shape;
            }

            static _rotateShapeSafe(s, angleRad, ox, oy) {
                if (!s) return;

                const n = Shape._n;
                const a = n(angleRad);
                const cx0 = n(ox);
                const cy0 = n(oy);

                if (!a) {

                    return;
                }

                const rot = (x, y) => Shape._rotPt(n(x), n(y), cx0, cy0, a);

                if ('x1' in s || 'y1' in s) {
                    const p1 = rot(s.x1, s.y1);
                    if ('x1' in s) s.x1 = p1.x;
                    if ('y1' in s) s.y1 = p1.y;
                }
                if ('x2' in s || 'y2' in s) {
                    const p2 = rot(s.x2, s.y2);
                    if ('x2' in s) s.x2 = p2.x;
                    if ('y2' in s) s.y2 = p2.y;
                }

                if (Array.isArray(s.pts)) {
                    for (const p of s.pts) {
                        if (!p) continue;
                        const rp = rot(p.x, p.y);
                        p.x = rp.x;
                        p.y = rp.y;
                    }
                }

                if ('cx' in s || 'cy' in s) {
                    const rp = rot(s.cx, s.cy);
                    if ('cx' in s) s.cx = rp.x;
                    if ('cy' in s) s.cy = rp.y;

                    if ('r' in s) {
                        const r = n(s.r);
                        if ('x' in s) s.x = s.cx - r;
                        if ('y' in s) s.y = s.cy - r;
                        if ('w' in s) s.w = 2 * r;
                        if ('h' in s) s.h = 2 * r;
                        if ('xf' in s) s.xf = s.cx + r;
                        if ('yf' in s) s.yf = s.cy + r;
                    } else if ('rx' in s || 'ry' in s) {
                        const rx = n(s.rx);
                        const ry = n(s.ry);
                        if ('x' in s) s.x = s.cx - rx;
                        if ('y' in s) s.y = s.cy - ry;
                        if ('w' in s) s.w = 2 * rx;
                        if ('h' in s) s.h = 2 * ry;
                        if ('xf' in s) s.xf = s.cx + rx;
                        if ('yf' in s) s.yf = s.cy + ry;
                    }
                }

                const hasRectBBox = ('x' in s) || ('y' in s) || ('xf' in s) || ('yf' in s);
                if (hasRectBBox) {
                    const x = n(s.x);
                    const y = n(s.y);
                    const xf = ('xf' in s) ? n(s.xf) : (('w' in s) ? x + n(s.w) : x);
                    const yf = ('yf' in s) ? n(s.yf) : (('h' in s) ? y + n(s.h) : y);

                    const minX = Math.min(x, xf);
                    const maxX = Math.max(x, xf);
                    const minY = Math.min(y, yf);
                    const maxY = Math.max(y, yf);

                    const w = maxX - minX;
                    const h = maxY - minY;

                    const c0x = minX + w / 2;
                    const c0y = minY + h / 2;

                    const rc = Shape._rotPt(c0x, c0y, cx0, cy0, a);

                    const nx = rc.x - w / 2;
                    const ny = rc.y - h / 2;

                    if ('x' in s) s.x = nx;
                    if ('y' in s) s.y = ny;

                    if ('w' in s) s.w = w;
                    if ('h' in s) s.h = h;

                    if ('xf' in s) s.xf = nx + w;
                    if ('yf' in s) s.yf = ny + h;
                }

                if (Array.isArray(s.shapes)) {
                    for (const child of s.shapes) {
                        Shape._rotateShapeSafe(child, a, cx0, cy0);
                    }
                }
            }

            static _attachSvgRotate(shape) {
                if (!shape || shape._svgRotateAttached) return shape;
                shape._svgRotateAttached = true;

                shape.svgRotate = function (angleRad, pivotX, pivotY) {

                    Shape._attachBBoxMethods(this);

                    const x1 = this.getX?.();
                    const y1 = this.getY?.();
                    const x2 = this.getXf?.();
                    const y2 = this.getYf?.();

                    const minX = Shape._isFinite(x1) && Shape._isFinite(x2) ? Math.min(x1, x2) : 0;
                    const maxX = Shape._isFinite(x1) && Shape._isFinite(x2) ? Math.max(x1, x2) : 0;
                    const minY = Shape._isFinite(y1) && Shape._isFinite(y2) ? Math.min(y1, y2) : 0;
                    const maxY = Shape._isFinite(y1) && Shape._isFinite(y2) ? Math.max(y1, y2) : 0;

                    const curCx = (minX + maxX) / 2;
                    const curCy = (minY + maxY) / 2;

                    const a = Shape._n(angleRad);
                    const ox = (pivotX == null) ? curCx : Shape._n(pivotX);
                    const oy = (pivotY == null) ? curCy : Shape._n(pivotY);

                    if (!a) return;

                    Shape._rotateShapeSafe(this, a, ox, oy);

                    Shape._attachBBoxMethods(this);
                };

                return shape;
            }

            static _attachCollisionMethods(shape) {
                if (!shape || shape._collisionAttached) return shape;
                shape._collisionAttached = true;
                Shape._attachBBoxMethods(shape);
                Shape._attachSvgTranslate(shape);
                const isNum = v => typeof v === 'number' && Number.isFinite(v);
                shape.getAabb = function (padding = 0) {
                    Shape._attachBBoxMethods(this);

                    const x1 = this.getX?.();
                    const y1 = this.getY?.();
                    const x2 = this.getXf?.();
                    const y2 = this.getYf?.();

                    if (![x1, y1, x2, y2].every(isNum)) return null;

                    const minX = Math.min(x1, x2) - padding;
                    const maxX = Math.max(x1, x2) + padding;
                    const minY = Math.min(y1, y2) - padding;
                    const maxY = Math.max(y1, y2) + padding;

                    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
                };

                shape.intersects = function (other, padding = 0) {
                    if (!other) return false;
                    Shape._attachCollisionMethods(other);

                    const a = this.getAabb(padding);
                    const b = other.getAabb(padding);
                    if (!a || !b) return false;

                    return !(
                        a.x2 < b.x1 ||
                        a.x1 > b.x2 ||
                        a.y2 < b.y1 ||
                        a.y1 > b.y2
                    );
                };

                shape.getMTV = function (other, padding = 0, axis = 'both') {
                    if (!other) return null;
                    Shape._attachCollisionMethods(other);

                    const a = this.getAabb(0);
                    const b = other.getAabb(0);
                    if (!a || !b) return null;

                    const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
                    const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);

                    if (overlapX <= 0 || overlapY <= 0) return null;

                    const pushX = overlapX + padding;
                    const pushY = overlapY + padding;

                    let useAxis = axis;
                    if (axis !== 'x' && axis !== 'y') {
                        useAxis = (pushX < pushY) ? 'x' : 'y';
                    }

                    const aCx = (a.x1 + a.x2) / 2;
                    const aCy = (a.y1 + a.y2) / 2;
                    const bCx = (b.x1 + b.x2) / 2;
                    const bCy = (b.y1 + b.y2) / 2;

                    if (useAxis === 'x') {
                        const sign = (aCx <= bCx) ? -1 : 1;
                        return { dx: sign * pushX, dy: 0, axis: 'x' };
                    } else {
                        const sign = (aCy <= bCy) ? -1 : 1;
                        return { dx: 0, dy: sign * pushY, axis: 'y' };
                    }
                };

                shape.nudge = function (dx, dy) {
                    Shape._translateShapeSafe(this, Shape._n(dx), Shape._n(dy));

                    Shape._attachBBoxMethods(this);
                };

                shape.resolveAgainst = function (other, options = {}) {
                    if (!other) return false;
                    Shape._attachCollisionMethods(other);

                    const padding = (typeof options.padding === 'number') ? options.padding : 0;
                    const axis = options.axis || 'both';
                    const strength = (typeof options.strength === 'number') ? options.strength : 1;

                    const mtv = this.getMTV(other, padding, axis);
                    if (!mtv) return false;

                    const halfDx = (mtv.dx * 0.5) * strength;
                    const halfDy = (mtv.dy * 0.5) * strength;

                    this.nudge(halfDx, halfDy);
                    other.nudge(-halfDx, -halfDy);

                    return true;
                };

                return shape;
            }

            static _translateShapeSafe(s, dx, dy) {
                if (!s || (!dx && !dy)) return;

                const n = Shape._n;

                if ('x' in s) s.x = n(s.x) + dx;
                if ('y' in s) s.y = n(s.y) + dy;
                if ('xf' in s) s.xf = n(s.xf) + dx;
                if ('yf' in s) s.yf = n(s.yf) + dy;

                if ('x1' in s) s.x1 = n(s.x1) + dx;
                if ('y1' in s) s.y1 = n(s.y1) + dy;
                if ('x2' in s) s.x2 = n(s.x2) + dx;
                if ('y2' in s) s.y2 = n(s.y2) + dy;

                if ('cx' in s) s.cx = n(s.cx) + dx;
                if ('cy' in s) s.cy = n(s.cy) + dy;

                if (Array.isArray(s.pts)) {
                    for (const p of s.pts) {
                        if (!p) continue;
                        p.x = n(p.x) + dx;
                        p.y = n(p.y) + dy;
                    }
                }

                if (Array.isArray(s.shapes)) {
                    for (const child of s.shapes) {
                        Shape._translateShapeSafe(child, dx, dy);
                    }
                }
            }

            static _attachSvgTranslate(shape) {
                if (!shape || shape._svgTranslateAttached) return shape;
                shape._svgTranslateAttached = true;

                shape.svgTranslate = function (cx, cy) {

                    Shape._attachBBoxMethods(this);

                    const x1 = this.getX?.();
                    const y1 = this.getY?.();
                    const x2 = this.getXf?.();
                    const y2 = this.getYf?.();

                    const minX = Shape._isFinite(x1) && Shape._isFinite(x2) ? Math.min(x1, x2) : 0;
                    const maxX = Shape._isFinite(x1) && Shape._isFinite(x2) ? Math.max(x1, x2) : 0;
                    const minY = Shape._isFinite(y1) && Shape._isFinite(y2) ? Math.min(y1, y2) : 0;
                    const maxY = Shape._isFinite(y1) && Shape._isFinite(y2) ? Math.max(y1, y2) : 0;

                    const curCx = (minX + maxX) / 2;
                    const curCy = (minY + maxY) / 2;

                    const nx = Shape._n(cx);
                    const ny = Shape._n(cy);

                    const dx = nx - curCx;
                    const dy = ny - curCy;

                    if (!dx && !dy) return;

                    Shape._translateShapeSafe(this, dx, dy);

                    Shape._attachBBoxMethods(this);
                };

                return shape;
            }

            static resolveCollisions(shapes, options = {}) {
                if (!Array.isArray(shapes) || shapes.length < 2) return;

                const padding = (typeof options.padding === 'number') ? options.padding : 0;
                const maxIterations = options.maxIterations ?? 50;
                const axis = options.axis || 'both';
                const strength = (typeof options.strength === 'number') ? options.strength : 1;

                for (const s of shapes) Shape._attachCollisionMethods(s);

                for (let iter = 0; iter < maxIterations; iter++) {
                    let movedAny = false;

                    for (let i = 0; i < shapes.length; i++) {
                        const a = shapes[i];
                        if (!a) continue;

                        for (let j = i + 1; j < shapes.length; j++) {
                            const b = shapes[j];
                            if (!b) continue;

                            if (a.resolveAgainst(b, { padding, axis, strength })) {
                                movedAny = true;
                            }
                        }
                    }

                    if (!movedAny) break;
                }
            }

            static breakComposite(shape) {

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

            static _attachBBoxMethods(shape) {
                if (!shape || shape._bboxAttached) return shape;
                shape._bboxAttached = true;



                const TEXT_BBOX = {
                    widthPerChar: 0.6,
                    heightFactor: 1.2,
                    minChars: 1,
                    paddingChars: 0.5,

                    baselineFactor: 0.8
                };

                const numOrNull = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
                const isNum = v => typeof v === 'number' && Number.isFinite(v);
                const toNum = v => {
                    const n = Number(v);
                    return Number.isFinite(n) ? n : null;
                };

                const isTextShape = s => {
                    const t = (s.type || '').toLowerCase();
                    return t === 'text' || t === 'svg_text';
                };

                const getTextAnchor = s => {
                    const a = (s.textAnchor ?? s.text_anchor ?? s.anchor ?? s.textAlign ?? 'middle');
                    return String(a).toLowerCase();
                };

                const getTextBaseline = s => {
                    const b = (s.textBaseline ?? s.text_baseline ?? s.baseline ?? 'middle');
                    return String(b).toLowerCase();
                };

                const getTextMetrics = s => {
                    const fs = isNum(s.fontSize) ? s.fontSize : 10;
                    const len = (String(s.text ?? '')).length || TEXT_BBOX.minChars;
                    const widthChars = len + TEXT_BBOX.paddingChars * 2;
                    const width = fs * widthChars * TEXT_BBOX.widthPerChar;
                    const height = fs * TEXT_BBOX.heightFactor;
                    return { fs, width, height };
                };

                shape.getLastTouched = () => {
                    return -1;
                }

                if (typeof shape.getX !== 'function') {
                    shape.getX = function () {

                        if (isTextShape(this) && isNum(this.x)) {
                            const { width } = getTextMetrics(this);
                            const anchor = getTextAnchor(this);

                            if (anchor === 'middle' || anchor === 'center') return this.x - width / 2;
                            if (anchor === 'end' || anchor === 'right') return this.x - width;

                            return this.x;
                        }

                        if (('cx' in this || 'cy' in this) && 'r' in this) {
                            const cx = toNum(this.cx);
                            const cy = toNum(this.cy);
                            const r = toNum(this.r);
                            if (cx != null && cy != null && r != null) {
                                const size = 2 * r;
                                this.x = cx - r;
                                this.y = cy - r;
                                this.w = size;
                                this.h = size;
                                this.xf = this.x + size;
                                this.yf = this.y + size;
                                return this.x;
                            }
                        }

                        if ('x' in this) return numOrNull(this.x) ?? 0;
                        if ('x1' in this && 'x2' in this) return Math.min(this.x1, this.x2);

                        if ('cx' in this && 'rx' in this) {
                            const cx = toNum(this.cx);
                            const rx = toNum(this.rx);
                            if (cx != null && rx != null) return cx - rx;
                        }

                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) => m == null ? p.x : Math.min(m, p.x), null);
                        }

                        return 0;
                    };
                }

                if (typeof shape.getY !== 'function') {
                    shape.getY = function () {

                        if (isTextShape(this) && isNum(this.y)) {
                            const { height } = getTextMetrics(this);
                            const baseline = getTextBaseline(this);

                            if (baseline === 'middle' || baseline === 'center') return this.y - height / 2;

                            if (baseline === 'top') return this.y;
                            if (baseline === 'bottom') return this.y - height;

                            const top = this.y - height * TEXT_BBOX.baselineFactor;
                            return top;
                        }

                        if (('cy' in this || 'cx' in this) && 'r' in this) {
                            const cy = toNum(this.cy);
                            const cx = toNum(this.cx);
                            const r = toNum(this.r);
                            if (cy != null && cx != null && r != null) {
                                const size = 2 * r;
                                this.y = cy - r;
                                this.x = cx - r;
                                this.w = size;
                                this.h = size;
                                this.xf = this.x + size;
                                this.yf = this.y + size;
                                return this.y;
                            }
                        }

                        if ('y' in this) return numOrNull(this.y) ?? 0;
                        if ('y1' in this && 'y2' in this) return Math.min(this.y1, this.y2);

                        if ('cy' in this && 'ry' in this) {
                            const cy = toNum(this.cy);
                            const ry = toNum(this.ry);
                            if (cy != null && ry != null) return cy - ry;
                        }

                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) => m == null ? p.y : Math.min(m, p.y), null);
                        }

                        return 0;
                    };
                }

                if (typeof shape.getXf !== 'function') {
                    shape.getXf = function () {

                        if (isTextShape(this) && isNum(this.x)) {
                            const { width } = getTextMetrics(this);
                            const anchor = getTextAnchor(this);

                            if (anchor === 'middle' || anchor === 'center') return this.x + width / 2;
                            if (anchor === 'end' || anchor === 'right') return this.x;

                            return this.x + width;
                        }

                        if (('cx' in this || 'cy' in this) && 'r' in this) {
                            const cx = toNum(this.cx);
                            const cy = toNum(this.cy);
                            const r = toNum(this.r);
                            if (cx != null && cy != null && r != null) {
                                const size = 2 * r;
                                this.x = cx - r;
                                this.y = cy - r;
                                this.w = size;
                                this.h = size;
                                this.xf = this.x + size;
                                this.yf = this.y + size;
                                return this.xf;
                            }
                        }

                        if ('xf' in this) return numOrNull(this.xf) ?? this.getX();

                        if ('x' in this && 'w' in this && toNum(this.x) != null && toNum(this.w) != null) {
                            const x = toNum(this.x);
                            const w = toNum(this.w);
                            return x + w;
                        }

                        if ('x1' in this && 'x2' in this) return Math.max(this.x1, this.x2);

                        if ('cx' in this && 'rx' in this) {
                            const cx = toNum(this.cx);
                            const rx = toNum(this.rx);
                            if (cx != null && rx != null) return cx + rx;
                        }

                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) => m == null ? p.x : Math.max(m, p.x), null);
                        }

                        return this.getX();
                    };
                }

                if (typeof shape.getYf !== 'function') {
                    shape.getYf = function () {

                        if (isTextShape(this) && isNum(this.y)) {
                            const { height } = getTextMetrics(this);
                            const baseline = getTextBaseline(this);

                            if (baseline === 'middle' || baseline === 'center') return this.y + height / 2;
                            if (baseline === 'top') return this.y + height;
                            if (baseline === 'bottom') return this.y;

                            const top = this.y - height * TEXT_BBOX.baselineFactor;
                            return top + height;
                        }

                        if (('cy' in this || 'cx' in this) && 'r' in this) {
                            const cy = toNum(this.cy);
                            const cx = toNum(this.cx);
                            const r = toNum(this.r);
                            if (cy != null && cx != null && r != null) {
                                const size = 2 * r;
                                this.y = cy - r;
                                this.x = cx - r;
                                this.w = size;
                                this.h = size;
                                this.xf = this.x + size;
                                this.yf = this.y + size;
                                return this.yf;
                            }
                        }

                        if ('yf' in this) return numOrNull(this.yf) ?? this.getY();

                        if ('y' in this && 'h' in this && toNum(this.y) != null && toNum(this.h) != null) {
                            const y = toNum(this.y);
                            const h = toNum(this.h);
                            return y + h;
                        }

                        if ('y1' in this && 'y2' in this) return Math.max(this.y1, this.y2);

                        if ('cy' in this && 'ry' in this) {
                            const cy = toNum(this.cy);
                            const ry = toNum(this.ry);
                            if (cy != null && ry != null) return cy + ry;
                        }

                        if (Array.isArray(this.pts) && this.pts.length) {
                            return this.pts.reduce((m, p) => m == null ? p.y : Math.max(m, p.y), null);
                        }

                        return this.getY();
                    };
                }

                if (typeof shape.setX !== 'function') {
                    shape.setX = function (newX) {
                        const curX = this.getX();
                        const nx = toNum(newX);
                        if (nx == null || !isNum(curX)) return;
                        const dx = nx - curX;
                        if (!dx) return;
                        Shape._translateShapeSafe(this, dx, 0);
                    };
                }

                if (typeof shape.setY !== 'function') {
                    shape.setY = function (newY) {
                        const curY = this.getY();
                        const ny = toNum(newY);
                        if (ny == null || !isNum(curY)) return;
                        const dy = ny - curY;
                        if (!dy) return;
                        Shape._translateShapeSafe(this, 0, dy);
                    };
                }
                Shape._attachApplyTheme(shape)
                return shape;
            }

            static _attachApplyTheme(shape) {

                shape.applyTheme = function applyTheme(theme, opts = {}) {

                    const options = {
                        deep: true,
                        overwrite: false,
                        ...opts
                    };

                    if (!theme || typeof theme !== 'object') return this;

                    const isGfxTheme =
                        typeof theme.drawRect === 'function' ||
                        typeof theme.drawLine === 'function' ||
                        typeof theme.drawCircle === 'function' ||
                        typeof theme.drawEllipse === 'function' ||
                        typeof theme.drawPoly === 'function' ||
                        typeof theme.drawText === 'function';

                    if (isGfxTheme) {
                        shape.gfx = theme;
                        if (options.deep) {
                            const kids = this.shapes || this.children || this.items;
                            if (Array.isArray(kids)) {
                                for (const k of kids) {
                                    if (!k) continue;
                                    Shape._attachApplyTheme(k);
                                    k.applyTheme(theme, options);
                                }
                            }
                        }
                        return this;
                    }

                    if (!this.style || typeof this.style !== 'object') this.style = {};
                    const s = this.style;

                    const canSetStyle = (k) => options.overwrite || s[k] == null;
                    const setStyle = (k, v) => {
                        if (v == null) return;
                        if (canSetStyle(k)) s[k] = v;
                    };

                    setStyle('stroke', theme.stroke);
                    setStyle('fill', theme.fill);
                    setStyle('strokeWidth', theme.strokeWidth ?? theme.lineWidth);
                    setStyle('opacity', theme.opacity);
                    setStyle('globalAlpha', theme.globalAlpha);

                    if (theme.shadow && typeof theme.shadow === 'object') {
                        if (!s.shadow || typeof s.shadow !== 'object') s.shadow = {};
                        const sh = s.shadow;
                        const th = theme.shadow;
                        if (options.overwrite || sh.color == null) sh.color = th.color;
                        if (options.overwrite || sh.blur == null) sh.blur = th.blur;
                        if (options.overwrite || sh.offsetX == null) sh.offsetX = th.offsetX;
                        if (options.overwrite || sh.offsetY == null) sh.offsetY = th.offsetY;
                    }

                    const t = String(this.type || '').toLowerCase();
                    const isText = (t === 'text' || t === 'svg_text');
                    if (isText) {
                        const canSetField = (k) => options.overwrite || this[k] == null;
                        if (theme.fontSize != null && canSetField('fontSize')) this.fontSize = theme.fontSize;
                        if (theme.fontFamily != null && canSetField('fontFamily')) this.fontFamily = theme.fontFamily;
                        if (theme.fontWeight != null && canSetField('fontWeight')) this.fontWeight = theme.fontWeight;
                        if (theme.textAnchor != null && canSetField('textAnchor')) this.textAnchor = theme.textAnchor;
                        if (theme.textBaseline != null && canSetField('textBaseline')) this.textBaseline = theme.textBaseline;

                        if (theme.textFill != null && canSetField('textFill')) this.textFill = theme.textFill;
                        if (theme.textBoxFill != null && canSetField('boxFill')) this.boxFill = theme.textBoxFill;
                        if (theme.textBoxStroke != null && canSetField('boxStroke')) this.boxStroke = theme.textBoxStroke;
                        if (theme.textBoxLineWidth != null && canSetField('boxLineWidth')) this.boxLineWidth = theme.textBoxLineWidth;
                    }

                    if (options.deep) {
                        const kids = this.shapes || this.children || this.items;
                        if (Array.isArray(kids)) {
                            for (const k of kids) {
                                if (!k) continue;
                                Shape._attachApplyTheme(k);
                                k.applyTheme(theme, options);
                            }
                        }
                    }

                    return this;
                };

                return shape;
            }

            static _translateShapeInternal(s, dx, dy) {
                if (!s || (!dx && !dy)) return;

                const isNum = v => typeof v === 'number' && Number.isFinite(v);

                if ('x' in s && isNum(s.x)) s.x += dx;
                if ('y' in s && isNum(s.y)) s.y += dy;
                if ('xf' in s && isNum(s.xf)) s.xf += dx;
                if ('yf' in s && isNum(s.yf)) s.yf += dy;

                if ('x1' in s && isNum(s.x1)) s.x1 += dx;
                if ('y1' in s && isNum(s.y1)) s.y1 += dy;
                if ('x2' in s && isNum(s.x2)) s.x2 += dx;
                if ('y2' in s && isNum(s.y2)) s.y2 += dy;

                if ('cx' in s && isNum(s.cx)) s.cx += dx;
                if ('cy' in s && isNum(s.cy)) s.cy += dy;

                if (Array.isArray(s.pts)) {
                    for (const p of s.pts) {
                        if (!p) continue;
                        if (isNum(p.x)) p.x += dx;
                        if (isNum(p.y)) p.y += dy;
                    }
                }

                if (Array.isArray(s.shapes)) {
                    for (const child of s.shapes) {
                        Shape._translateShapeInternal(child, dx, dy);
                    }
                }
            }

            static _translateShape(s, dx, dy) {

                Shape._translateShapeInternal(s, dx, dy);
            }

            static buildArrayFromJSON(ar) {
                let jarray = []
                for (let a of ar) {
                    let vla = Shape.buildFromJSON(a);
                    if (vla)
                        jarray.push(vla)
                }
                return jarray;
            }
            inside(grid, x, y) {
                const primitives = Shape.breakComposite(this);

                if (!primitives.length) {
                    Shape._attachBBoxMethods(this);

                    const x1 = this.getX();
                    const y1 = this.getY();
                    const x2 = this.getXf();
                    const y2 = this.getYf();

                    if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) {
                        return false;
                    }

                    const minX = Math.min(x1, x2);
                    const maxX = Math.max(x1, x2);
                    const minY = Math.min(y1, y2);
                    const maxY = Math.max(y1, y2);

                    return x >= minX && x <= maxX &&
                        y >= minY && y <= maxY;
                }

                for (let i = primitives.length - 1; i >= 0; i--) {
                    const s = primitives[i];
                    if (!s) continue;

                    if (typeof s.inside === 'function' && s !== this) {
                        if (s.inside(grid, x, y)) return true;
                        continue;
                    }

                    Shape._attachBBoxMethods(s);

                    const x1 = s.getX();
                    const y1 = s.getY();
                    const x2 = s.getXf();
                    const y2 = s.getYf();

                    if (![x1, y1, x2, y2].every(v => typeof v === 'number' && Number.isFinite(v))) {
                        continue;
                    }

                    const minX = Math.min(x1, x2);
                    const maxX = Math.max(x1, x2);
                    const minY = Math.min(y1, y2);
                    const maxY = Math.max(y1, y2);

                    if (x >= minX && x <= maxX &&
                        y >= minY && y <= maxY) {
                        return true;
                    }
                }

                return false;
            }

            // ==============================
            // PUBLIC ENTRY
            // ==============================
            static fromMolString(molString, opts = {}) {
                const parsed = Shape._parseMolString(molString);
                return Shape._makeMolShape(parsed, opts);
            }

            static _buildMolFromJSON(json) {
                if (typeof json.mol === 'string') {
                    return Shape.fromMolString(json.mol, json);
                }

                if (Array.isArray(json.atoms) && Array.isArray(json.bonds)) {
                    return Shape._makeMolShape({
                        atoms: json.atoms,
                        bonds: json.bonds
                    }, json);
                }

                return null;
            }

            // ==============================
            // MOL PARSER (V2000)
            // ==============================
            static _parseMolString(molString) {
                if (typeof molString !== 'string' || !molString.trim()) {
                    throw new Error('MOL string required');
                }

                const lines = molString.replace(/\r/g, '').split('\n');

                if (lines.length < 4) {
                    throw new Error('Invalid MOL file');
                }

                const counts = lines[3] || '';
                const atomCount = parseInt(counts.slice(0, 3).trim(), 10);
                const bondCount = parseInt(counts.slice(3, 6).trim(), 10);

                const atoms = [];
                const bonds = [];

                const atomStart = 4;
                const bondStart = atomStart + atomCount;

                for (let i = 0; i < atomCount; i++) {
                    const line = lines[atomStart + i] || '';

                    const x = parseFloat(line.slice(0, 10));
                    const y = parseFloat(line.slice(10, 20));
                    const z = parseFloat(line.slice(20, 30));
                    const element = (line.slice(31, 34).trim() || 'C');

                    atoms.push({
                        x: Number.isFinite(x) ? x : 0,
                        y: Number.isFinite(y) ? y : 0,
                        z: Number.isFinite(z) ? z : 0,
                        element
                    });
                }

                for (let i = 0; i < bondCount; i++) {
                    const line = lines[bondStart + i] || '';

                    const a1 = parseInt(line.slice(0, 3).trim(), 10) - 1;
                    const a2 = parseInt(line.slice(3, 6).trim(), 10) - 1;
                    const order = parseInt(line.slice(6, 9).trim(), 10) || 1;

                    if (atoms[a1] && atoms[a2]) {
                        bonds.push({ a1, a2, order });
                    }
                }

                return { atoms, bonds };
            }

            // ==============================
            // BALL + STICK BUILDER
            // ==============================
            static _makeMolShape(parsed, opts = {}) {
                const atoms = parsed?.atoms || [];
                const bonds = parsed?.bonds || [];

                if (!atoms.length) {
                    return Shape._makeCompositeShape([]);
                }

                const gfx = opts.gfx ?? Shape.getGfx?.() ?? Shape.DefaultGfx;

                const atomScale = opts.atomScale ?? 0.35;
                const bondWidth = opts.bondWidth ?? 0.08;

                // element colors
                const colors = {
                    H: '#ffffff',
                    C: '#444444',
                    N: '#2b6cff',
                    O: '#e53935',
                    S: '#d4b000',
                    P: '#ff8f00',
                    F: '#2e7d32',
                    CL: '#2e7d32',
                    BR: '#8d4b32',
                    I: '#6a1b9a'
                };

                // center + normalize
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                for (const a of atoms) {
                    minX = Math.min(minX, a.x);
                    minY = Math.min(minY, a.y);
                    maxX = Math.max(maxX, a.x);
                    maxY = Math.max(maxY, a.y);
                }

                const cx = (minX + maxX) / 2;
                const cy = (minY + maxY) / 2;
                const span = Math.max(maxX - minX, maxY - minY, 1);

                const scale = opts.scale ?? (6 / span);

                const worldAtoms = atoms.map(a => ({
                    ...a,
                    wx: (a.x - cx) * scale + (opts.x ?? 0),
                    wy: (-(a.y - cy)) * scale + (opts.y ?? 0)
                }));

                const shapes = [];

                // hydrogen diameter in rendered world units
                const hydrogenRadius = atomScale * 0.7;
                const hydrogenDiameter = hydrogenRadius * 2;
                const doubleBondOffset = hydrogenDiameter / 2;

                // ==========================
                // BONDS
                // ==========================
                for (const b of bonds) {
                    const a1 = worldAtoms[b.a1];
                    const a2 = worldAtoms[b.a2];
                    if (!a1 || !a2) continue;

                    const dx = a2.wx - a1.wx;
                    const dy = a2.wy - a1.wy;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;

                    const nx = -dy / len;
                    const ny = dx / len;

                    const makeBond = (ox, oy) => {
                        const line = Shape._makeLineFromWorld(
                            a1.wx + ox,
                            a1.wy + oy,
                            a2.wx + ox,
                            a2.wy + oy,
                            {
                                stroke: '#777',
                                strokeWidth: bondWidth,
                                'stroke-linecap': 'round'
                            },
                            gfx
                        );
                        if (line) shapes.push(line);
                    };

                    if (b.order === 2) {
                        makeBond(nx * doubleBondOffset, ny * doubleBondOffset);
                        makeBond(-nx * doubleBondOffset, -ny * doubleBondOffset);
                    } else if (b.order >= 3) {
                        makeBond(0, 0);
                        makeBond(nx * hydrogenDiameter, ny * hydrogenDiameter);
                        makeBond(-nx * hydrogenDiameter, -ny * hydrogenDiameter);
                    } else {
                        makeBond(0, 0);
                    }
                }

                // ==========================
                // ATOMS
                // ==========================
                for (const a of worldAtoms) {
                    const el = String(a.element || 'C').toUpperCase();
                    const fill = colors[el] || '#999';
                    const r = atomScale * (el === 'H' ? 0.7 : 1.0);

                    const circleEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');

                    circleEl.setAttribute('cx', String(a.wx));
                    circleEl.setAttribute('cy', String(-a.wy));
                    circleEl.setAttribute('r', String(r));
                    circleEl.setAttribute('fill', fill);
                    circleEl.setAttribute('stroke', '#222');
                    circleEl.setAttribute('stroke-width', '0.03');

                    const atomShape = Shape._makeCircle(circleEl, gfx);
                    atomShape.element = el;

                    shapes.push(atomShape);
                }

                const molShape = Shape._makeCompositeShape(shapes);

                molShape.type = 'mol';
                molShape.atoms = worldAtoms;
                molShape.bonds = bonds;
                molShape.mol = opts.mol ?? null;

                Shape._attachToJSONAll(molShape, { deep: true });

                return molShape;
            }

            static fromSvgString(svgString) {
                if (typeof svgString !== 'string') {
                    console.warn('fromSvgString expected a string, got:', typeof svgString, svgString);
                    throw new Error('SVG source must be a string');
                }
                const trimmed = svgString.trim();
                if (!trimmed) {
                    throw new Error('SVG string is empty');
                }
                function parseNum(el, attr, fallback = 0) {
                    const v = el.getAttribute(attr);
                    const n = v != null ? Number(v) : NaN;
                    return Number.isFinite(n) ? n : fallback;
                }

                function getShapeBounds(el) {
                    const tag = el.tagName.toLowerCase();
                    if (tag === 'rect') {
                        const x = parseNum(el, 'x');
                        const y = parseNum(el, 'y');
                        const w = parseNum(el, 'width');
                        const h = parseNum(el, 'height');
                        return { x, y, w, h };
                    } else if (tag === 'ellipse') {
                        const cx = parseNum(el, 'cx');
                        const cy = parseNum(el, 'cy');
                        const rx = parseNum(el, 'rx');
                        const ry = parseNum(el, 'ry');
                        return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry };
                    } else if (tag === 'circle') {
                        const cx = parseNum(el, 'cx');
                        const cy = parseNum(el, 'cy');
                        const r = parseNum(el, 'r');
                        return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
                    } else if (tag === 'line') {
                        const x1 = parseNum(el, 'x1');
                        const y1 = parseNum(el, 'y1');
                        const x2 = parseNum(el, 'x2');
                        const y2 = parseNum(el, 'y2');
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
                    const baseElements = Array.from(baseNodeList);

                    if (!baseElements.length) {
                        console.warn('fromSvgString: no base geometric elements (rect/line/poly*/circle/ellipse) found');
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

                    for (const el of baseElements) {
                        try {
                            const shape = Shape.createShapeFromSvgElement(el, Shape);
                            if (shape) {
                                shapes.push(shape);
                                const b = getShapeBounds(el);
                                expandBBox(b);
                            }
                        } catch (err) {
                            console.warn('Skipping unsupported SVG element:', el.tagName, err);
                        }
                    }

                    if (doc) {
                        const arrowLines = Array.from(svgRoot.querySelectorAll('line[marker-end]'));
                        for (const lineEl of arrowLines) {
                            try {
                                const x1 = parseNum(lineEl, 'x1');
                                const y1 = parseNum(lineEl, 'y1');
                                const x2 = parseNum(lineEl, 'x2');
                                const y2 = parseNum(lineEl, 'y2');

                                const dx = x2 - x1;
                                const dy = y2 - y1;
                                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                                const ux = dx / len;
                                const uy = dy / len;

                                const strokeWidth = parseNum(lineEl, 'stroke-width', 1.5);
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
                                    `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
                                );

                                const stroke = lineEl.getAttribute('stroke') || '#333';
                                const fill = lineEl.getAttribute('stroke') ||
                                    lineEl.getAttribute('fill') || '#333';
                                poly.setAttribute('stroke', stroke);
                                poly.setAttribute('fill', fill);

                                svgRoot.appendChild(poly);
                                try {
                                    const arrowShape = Shape.createShapeFromSvgElement(poly, Shape);
                                    if (arrowShape) {
                                        shapes.push(arrowShape);
                                        const b = getShapeBounds(lineEl);
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
                        console.warn('fromSvgString: no shapes created from geometry; continuing with text-only glyph if text exists');
                    }

                    const grouped = Shape.groupTextWithBackground(shapes, {
                        padding: 0
                    });

                    const finalShapes = (Array.isArray(grouped) && grouped.length) ? grouped : shapes;

                    let shape;
                    if (finalShapes.length === 1) {
                        shape = finalShapes[0];
                    } else if (finalShapes.length > 1) {
                        shape = Shape._makeCompositeShape(finalShapes);
                    } else {

                        shape = Shape._makeCompositeShape([]);
                    }

                    shape.svg = svgString;
                    return shape;

                }

                if (typeof DOMParser === 'undefined') {
                    if (typeof document !== 'undefined') {
                        const container = document.createElement('div');
                        container.innerHTML = trimmed;
                        const svgRoot = container.querySelector('svg');
                        if (!svgRoot) {
                            throw new Error('Provided string is not a valid SVG document (no <svg> found)');
                        }
                        return buildGlyphFromSvgRoot(svgRoot);
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

                return buildGlyphFromSvgRoot(svgRoot);
            }


            static fromPathHeavySvgString(svgString) {
                if (typeof svgString !== 'string') {
                    console.warn('fromPathHeavySvgString expected a string, got:', typeof svgString, svgString);
                    throw new Error('SVG source must be a string');
                }

                const trimmed = svgString.trim();
                if (!trimmed) {
                    throw new Error('SVG string is empty');
                }

                function parseNum(el, attr, fallback = 0) {
                    const v = el.getAttribute(attr);
                    if (v == null || v === '') return fallback;

                    // handles values like "900px"
                    const n = parseFloat(v);
                    return Number.isFinite(n) ? n : fallback;
                }

                function getViewBoxBounds(svgEl) {
                    const viewBox = svgEl.getAttribute('viewBox');
                    if (viewBox) {
                        const parts = viewBox.trim().split(/[\s,]+/).map(Number);
                        if (parts.length === 4 && parts.every(Number.isFinite)) {
                            const [x, y, w, h] = parts;
                            return { x, y, w, h };
                        }
                    }

                    const width = parseFloat(svgEl.getAttribute('width'));
                    const height = parseFloat(svgEl.getAttribute('height'));
                    if (Number.isFinite(width) && Number.isFinite(height)) {
                        return { x: 0, y: 0, w: width, h: height };
                    }

                    return null;
                }

                function getShapeBounds(el) {
                    const tag = el.tagName.toLowerCase();

                    if (tag === 'rect') {
                        const x = parseNum(el, 'x');
                        const y = parseNum(el, 'y');
                        const w = parseNum(el, 'width');
                        const h = parseNum(el, 'height');
                        return { x, y, w, h };
                    }

                    if (tag === 'ellipse') {
                        const cx = parseNum(el, 'cx');
                        const cy = parseNum(el, 'cy');
                        const rx = parseNum(el, 'rx');
                        const ry = parseNum(el, 'ry');
                        return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry };
                    }

                    if (tag === 'circle') {
                        const cx = parseNum(el, 'cx');
                        const cy = parseNum(el, 'cy');
                        const r = parseNum(el, 'r');
                        return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
                    }

                    if (tag === 'line') {
                        const x1 = parseNum(el, 'x1');
                        const y1 = parseNum(el, 'y1');
                        const x2 = parseNum(el, 'x2');
                        const y2 = parseNum(el, 'y2');
                        const xMin = Math.min(x1, x2);
                        const yMin = Math.min(y1, y2);
                        const xMax = Math.max(x1, x2);
                        const yMax = Math.max(y1, y2);
                        return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
                    }

                    if (tag === 'polyline' || tag === 'polygon') {
                        const pts = (el.getAttribute('points') || '')
                            .trim()
                            .split(/\s+/)
                            .map(pair => pair.split(',').map(Number))
                            .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

                        if (!pts.length) return null;

                        const xs = pts.map(([x]) => x);
                        const ys = pts.map(([, y]) => y);
                        const xMin = Math.min(...xs);
                        const yMin = Math.min(...ys);
                        const xMax = Math.max(...xs);
                        const yMax = Math.max(...ys);

                        return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
                    }

                    if (tag === 'path') {
                        // Best effort: prefer native SVG bbox if available
                        try {
                            if (typeof el.getBBox === 'function') {
                                const b = el.getBBox();
                                if (b && Number.isFinite(b.x) && Number.isFinite(b.y) &&
                                    Number.isFinite(b.width) && Number.isFinite(b.height)) {
                                    return { x: b.x, y: b.y, w: b.width, h: b.height };
                                }
                            }
                        } catch (e) {
                            // ignore
                        }

                        // Fallback: rough numeric extraction from the d attribute
                        const d = el.getAttribute('d') || '';
                        const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
                        if (nums && nums.length >= 2) {
                            const values = nums.map(Number).filter(Number.isFinite);
                            const xs = [];
                            const ys = [];
                            for (let i = 0; i < values.length - 1; i += 2) {
                                xs.push(values[i]);
                                ys.push(values[i + 1]);
                            }
                            if (xs.length && ys.length) {
                                const xMin = Math.min(...xs);
                                const yMin = Math.min(...ys);
                                const xMax = Math.max(...xs);
                                const yMax = Math.max(...ys);
                                return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
                            }
                        }

                        return null;
                    }

                    return null;
                }

                function buildShapeFromSvgRoot(svgRoot) {
                    if (!svgRoot || svgRoot.tagName.toLowerCase() !== 'svg') {
                        throw new Error('Provided string is not a valid SVG document (no <svg> found)');
                    }

                    const ns = svgRoot.namespaceURI || 'http://www.w3.org/2000/svg';
                    const doc = svgRoot.ownerDocument || (typeof document !== 'undefined' ? document : null);

                    // Added path support here
                    const baseElements = Array.from(
                        svgRoot.querySelectorAll('path,rect,line,polyline,polygon,circle,ellipse,text')
                    );

                    if (!baseElements.length) {
                        console.warn('fromPathHeavySvgString: no supported SVG elements found');
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

                    for (const el of baseElements) {
                        try {
                            const shape = Shape.createShapeFromSvgElement(el, Shape);
                            if (shape) {
                                shapes.push(shape);
                                expandBBox(getShapeBounds(el));
                            }
                        } catch (err) {
                            console.warn('Skipping unsupported SVG element:', el.tagName, err);
                        }
                    }

                    // Preserve existing arrowhead synthesis behavior for marker-based lines
                    if (doc) {
                        const arrowLines = Array.from(svgRoot.querySelectorAll('line[marker-end]'));
                        for (const lineEl of arrowLines) {
                            try {
                                const x1 = parseNum(lineEl, 'x1');
                                const y1 = parseNum(lineEl, 'y1');
                                const x2 = parseNum(lineEl, 'x2');
                                const y2 = parseNum(lineEl, 'y2');

                                const dx = x2 - x1;
                                const dy = y2 - y1;
                                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                                const ux = dx / len;
                                const uy = dy / len;
                                const strokeWidth = parseNum(lineEl, 'stroke-width', 1.5);
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
                                    `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
                                );

                                const stroke = lineEl.getAttribute('stroke') || '#333';
                                const fill = lineEl.getAttribute('stroke') ||
                                    lineEl.getAttribute('fill') || '#333';

                                poly.setAttribute('stroke', stroke);
                                poly.setAttribute('fill', fill);

                                svgRoot.appendChild(poly);
                                try {
                                    const arrowShape = Shape.createShapeFromSvgElement(poly, Shape);
                                    if (arrowShape) {
                                        shapes.push(arrowShape);
                                        expandBBox(getShapeBounds(poly));
                                    }
                                } finally {
                                    svgRoot.removeChild(poly);
                                }
                            } catch (err) {
                                console.warn('Failed to synthesize arrowhead for line:', err);
                            }
                        }
                    }

                    const grouped = Shape.groupTextWithBackground(shapes, { padding: 0 });
                    const finalShapes = (Array.isArray(grouped) && grouped.length) ? grouped : shapes;

                    let shape;
                    if (finalShapes.length === 1) {
                        shape = finalShapes[0];
                    } else if (finalShapes.length > 1) {
                        shape = Shape._makeCompositeShape(finalShapes);
                    } else {
                        shape = Shape._makeCompositeShape([]);
                    }

                    // Prefer computed bbox, then fall back to viewBox
                    const fallbackBounds = getViewBoxBounds(svgRoot);
                    const finalBounds = bbox || (
                        fallbackBounds
                            ? {
                                xMin: fallbackBounds.x,
                                yMin: fallbackBounds.y,
                                xMax: fallbackBounds.x + fallbackBounds.w,
                                yMax: fallbackBounds.y + fallbackBounds.h
                            }
                            : null
                    );

                    if (finalBounds) {
                        shape.x = finalBounds.xMin;
                        shape.y = finalBounds.yMin;
                        shape.width = finalBounds.xMax - finalBounds.xMin;
                        shape.height = finalBounds.yMax - finalBounds.yMin;
                    }

                    shape.svg = svgString;
                    return shape;
                }

                if (typeof DOMParser === 'undefined') {
                    if (typeof document !== 'undefined') {
                        const container = document.createElement('div');
                        container.innerHTML = trimmed;
                        const svgRoot = container.querySelector('svg');
                        return buildShapeFromSvgRoot(svgRoot);
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

                return buildShapeFromSvgRoot(svgRoot);
            }








            static _readStyle(el) {
                const fillAttr = el.getAttribute('fill');
                const strokeAttr = el.getAttribute('stroke');
                const swAttr = el.getAttribute('stroke-width');

                return {
                    fill: fillAttr != null ? fillAttr : 'none',
                    stroke: strokeAttr != null ? strokeAttr : 'black',
                    strokeWidth: swAttr != null ? parseFloat(swAttr) || 1 : 1
                };
            }
            static _translateShapeInternal = function (s, dx, dy) {
                if (!s || (!dx && !dy)) return;

                const isNum = v => typeof v === 'number' && Number.isFinite(v);

                if ('x' in s && isNum(s.x)) s.x += dx;
                if ('y' in s && isNum(s.y)) s.y += dy;
                if ('xf' in s && isNum(s.xf)) s.xf += dx;
                if ('yf' in s && isNum(s.yf)) s.yf += dy;

                if ('x1' in s && isNum(s.x1)) s.x1 += dx;
                if ('y1' in s && isNum(s.y1)) s.y1 += dy;
                if ('x2' in s && isNum(s.x2)) s.x2 += dx;
                if ('y2' in s && isNum(s.y2)) s.y2 += dy;

                if ('cx' in s && isNum(s.cx)) s.cx += dx;
                if ('cy' in s && isNum(s.cy)) s.cy += dy;

                if (Array.isArray(s.pts)) {
                    for (const p of s.pts) {
                        if (!p) continue;
                        if (isNum(p.x)) p.x += dx;
                        if (isNum(p.y)) p.y += dy;
                    }
                }

                if (Array.isArray(s.shapes)) {
                    for (const child of s.shapes) {
                        Shape._translateShapeInternal(child, dx, dy);
                    }
                }
            };

            static _makeCompositeShape(shapes) {
                const shape = {
                    type: 'svg_group',
                    shapes,
                    label: '',
                    themeName: '',
                    gfx: json.gfx,

                    draw(grid, ctx) {
                        for (const s of this.shapes) {
                            if (s && typeof s.draw === 'function') {
                                s.draw(grid, ctx);
                            }
                        }
                    },

                    inside(grid, wx, wy) {
                        return this.shapes.some(
                            s => s && typeof s.inside === 'function' && s.inside(grid, wx, wy)
                        );
                    },

                    drawSVG(grid, renderer, glyph) {
                        return renderer;
                    }
                };

                const numOrNull = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
                const safeMin = (a, b) => (a == null) ? b : (b == null ? a : Math.min(a, b));
                const safeMax = (a, b) => (a == null) ? b : (b == null ? a : Math.max(a, b));
                const isNum = v => typeof v === 'number' && Number.isFinite(v);
                shape._bboxAttached = true;
                shape.getX = function () {
                    let minX = null;
                    for (const s of this.shapes || []) {
                        if (!s) continue;
                        Shape._attachBBoxMethods(s);
                        const x = s.getX ? numOrNull(s.getX()) : null;
                        if (x != null) minX = safeMin(minX, x);
                    }
                    return minX ?? 0;
                };

                shape.getY = function () {
                    let minY = null;
                    for (const s of this.shapes || []) {
                        if (!s) continue;
                        Shape._attachBBoxMethods(s);
                        const y = s.getY ? numOrNull(s.getY()) : null;
                        if (y != null) minY = safeMin(minY, y);
                    }
                    return minY ?? 0;
                };

                shape.getXf = function () {
                    let maxX = null;
                    for (const s of this.shapes || []) {
                        if (!s) continue;
                        Shape._attachBBoxMethods(s);
                        const xf = s.getXf ? numOrNull(s.getXf()) : null;
                        if (xf != null) maxX = safeMax(maxX, xf);
                    }
                    return maxX ?? this.getX();
                };

                shape.getYf = function () {
                    let maxY = null;
                    for (const s of this.shapes || []) {
                        if (!s) continue;
                        Shape._attachBBoxMethods(s);
                        const yf = s.getYf ? numOrNull(s.getYf()) : null;
                        if (yf != null) maxY = safeMax(maxY, yf);
                    }
                    return maxY ?? this.getY();
                };

                function scaleChild(s, sx, sy, ox, oy) {
                    if (!s) return;

                    const scaleX = (v) => ox + (v - ox) * sx;
                    const scaleY = (v) => oy + (v - oy) * sy;

                    if ('x' in s && isNum(s.x)) s.x = scaleX(s.x);
                    if ('y' in s && isNum(s.y)) s.y = scaleY(s.y);

                    if ('w' in s && isNum(s.w)) s.w *= sx;
                    if ('h' in s && isNum(s.h)) s.h *= sy;
                    if ('xf' in s && isNum(s.xf)) s.xf = scaleX(s.xf);
                    if ('yf' in s && isNum(s.yf)) s.yf = scaleY(s.yf);

                    if ('x1' in s && isNum(s.x1)) s.x1 = scaleX(s.x1);
                    if ('y1' in s && isNum(s.y1)) s.y1 = scaleY(s.y1);
                    if ('x2' in s && isNum(s.x2)) s.x2 = scaleX(s.x2);
                    if ('y2' in s && isNum(s.y2)) s.y2 = scaleY(s.y2);

                    if ('cx' in s && isNum(s.cx)) s.cx = scaleX(s.cx);
                    if ('cy' in s && isNum(s.cy)) s.cy = scaleY(s.cy);

                    if ('r' in s && isNum(s.r)) s.r *= sx;
                    if ('rx' in s && isNum(s.rx)) s.rx *= sx;
                    if ('ry' in s && isNum(s.ry)) s.ry *= sy;

                    if (Array.isArray(s.pts)) {
                        for (const p of s.pts) {
                            if (!p) continue;
                            if (isNum(p.x)) p.x = scaleX(p.x);
                            if (isNum(p.y)) p.y = scaleY(p.y);
                        }
                    }

                    if (Array.isArray(s.shapes)) {
                        for (const child of s.shapes) {
                            scaleChild(child, sx, sy, ox, oy);
                        }
                    }

                    if ('fontSize' in s && isNum(s.fontSize)) {

                        let scaleFactor;
                        if (isNum(sx) && Math.abs(sx) > 1e-6) {
                            scaleFactor = sx;
                        } else if (isNum(sy) && Math.abs(sy) > 1e-6) {
                            scaleFactor = sy;
                        } else {
                            scaleFactor = 1;
                        }

                        if (Math.abs(scaleFactor) > 1e-6) {
                            s.fontSize = Math.max(1, s.fontSize * scaleFactor);
                        }
                    }
                }

                shape.setX = function (newX) {
                    const oldX = this.getX();
                    if (!isNum(newX) || !isNum(oldX)) return;
                    const dx = newX - oldX;
                    if (!dx) return;
                    for (const s of this.shapes || []) {
                        Shape._translateShapeInternal(s, dx, 0);
                    }
                };

                shape.setY = function (newY) {
                    const oldY = this.getY();
                    if (!isNum(newY) || !isNum(oldY)) return;
                    const dy = newY - oldY;
                    if (!dy) return;
                    for (const s of this.shapes || []) {
                        Shape._translateShapeInternal(s, 0, dy);
                    }
                };

                shape.setXf = function (newXf) {
                    const left = this.getX();
                    const right = this.getXf();
                    if (!isNum(newXf) || !isNum(left) || !isNum(right)) return;

                    const oldWidth = right - left;
                    const newWidth = newXf - left;

                    if (!isNum(oldWidth) || Math.abs(oldWidth) < 1e-6) {

                        const dx = newXf - right;
                        if (!dx) return;
                        for (const s of this.shapes || []) {
                            Shape._translateShapeInternal(s, dx, 0);
                        }
                        return;
                    }

                    const sx = newWidth / oldWidth;
                    if (!isNum(sx) || Math.abs(sx) < 1e-6) return;

                    for (const s of this.shapes || []) {
                        scaleChild(s, sx, 1, left, 0);
                    }
                };

                shape.setYf = function (newYf) {
                    const top = this.getY();
                    const bottom = this.getYf();
                    if (!isNum(newYf) || !isNum(top) || !isNum(bottom)) return;

                    const oldHeight = bottom - top;
                    const newHeight = newYf - top;

                    if (!isNum(oldHeight) || Math.abs(oldHeight) < 1e-6) {

                        const dy = newYf - bottom;
                        if (!dy) return;
                        for (const s of this.shapes || []) {
                            Shape._translateShapeInternal(s, 0, dy);
                        }
                        return;
                    }

                    const sy = newHeight / oldHeight;
                    if (!isNum(sy) || Math.abs(sy) < 1e-6) return;

                    for (const s of this.shapes || []) {
                        scaleChild(s, 1, sy, 0, top);
                    }
                };
                Shape._attachCollisionMethods(shape);
                Shape._finalizeShape(shape);
                finalizeSvgPrimitive(shape)

                return shape;
            }

            static ungroupTop(selected_glyphs) {
                try {
                    const newGlyphs = [];

                    for (let g of selected_glyphs) {
                        const shape = g;
                        const isTopGroup =
                            shape.type &&
                            String(shape.type).toLowerCase() === 'svg_group' &&
                            Array.isArray(shape.shapes);

                        if (!isTopGroup) {
                            newGlyphs.push(shape);
                            continue;
                        }

                        for (const childShape of shape.shapes) {
                            if (!childShape) continue;
                            newGlyphs.push(childShape);
                        }
                    }
                    return newGlyphs;

                } catch (err) {
                    console.error("Ungroup top-layer svg_group error:", err);
                }

            }

            breakApart() {
                return Shape.breakComposite(this);
            }
            static createShapeFromSvgElement(el, ShapeClass = Shape) {
                if (!el) throw new Error('createShapeFromSvgElement: element is required');

                const rawTag = (el.localName || el.tagName || '').toString();
                const tag = rawTag.includes(':')
                    ? rawTag.split(':').pop().toLowerCase()
                    : rawTag.toLowerCase();

                const factories = {
                    rect: ShapeClass._makeRect,
                    line: ShapeClass._makeLine,
                    circle: ShapeClass._makeCircle,
                    ellipse: ShapeClass._makeEllipse,
                    polyline: ShapeClass._makePolyline,
                    polygon: ShapeClass._makePolygon,
                    text: ShapeClass._makeText,
                    path: ShapeClass._makePath
                };

                const factory = factories[tag];
                if (!factory) {
                    throw new Error(`Unsupported SVG element: <${rawTag}>`);
                }

                return factory.call(ShapeClass, el, ShapeClass.getGfx?.() || ShapeClass.DefaultGfx);
            }
            static ___depreacategd___createShapeFromSvgElement(el, Shape) {
                if (!el) {
                    throw new Error('createShapeFromSvgElement: element is required');
                }

                const rawTag = (el.localName || el.tagName || '').toString();
                const tag = rawTag.includes(':')
                    ? rawTag.split(':').pop().toLowerCase()
                    : rawTag.toLowerCase();

                const factories = {
                    rect: Shape._makeRect,
                    line: Shape._makeLine,
                    circle: Shape._makeCircle,
                    ellipse: Shape._makeEllipse,
                    polyline: Shape._makePolyline,
                    polygon: Shape._makePolygon,
                    text: Shape._makeText,
                    path: Shape._makePath

                };

                const factory = factories[tag];
                if (!factory) {

                    throw new Error(`Unsupported SVG element: <${rawTag}>`);
                }

                return factory.call(Shape, el, Shape);
            }

            static _createShapeFromSvgElement(el, Shape) {
                const ls = Shape.createShapeFromSvgElement(el, Shape);
                Shape._attachSvgTranslate(ls);
            }

            static _createShapeFromSvgElement(el, Shape) {
                const tag = el.tagName.toLowerCase();
                const factories = {
                    rect: Shape._makeRect,
                    line: Shape._makeLine,
                    circle: Shape._makeCircle,
                    ellipse: Shape._makeEllipse,
                    polyline: Shape._makePolyline,
                    polygon: Shape._makePolygon,
                    text: Shape._makeText,
                    path: Shape._makePath

                };
                const factory = factories[tag];
                if (!factory) {
                    throw new Error(`Unsupported SVG element: <${tag}>`);
                }
                return factory(el, Shape);
            }

            static _applyShadow(ctx, style) {
                const s = (style && style.shadow) || {};
                ctx.shadowColor = s.color || 'rgba(0, 0, 0, 0.35)';
                ctx.shadowBlur = s.blur != null ? s.blur : 8;
                ctx.shadowOffsetX = s.offsetX != null ? s.offsetX : 3;
                ctx.shadowOffsetY = s.offsetY != null ? s.offsetY : 3;
            }

            static _clearShadow(ctx) {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            static _parseHexColor(color) {
                if (!color || typeof color !== 'string') return null;
                let c = color.trim();
                if (c[0] === '#') c = c.slice(1);
                if (c.length === 3) {

                    c = c.split('').map(ch => ch + ch).join('');
                }
                if (c.length !== 6) return null;
                const r = parseInt(c.slice(0, 2), 16);
                const g = parseInt(c.slice(2, 4), 16);
                const b = parseInt(c.slice(4, 6), 16);
                if ([r, g, b].some(v => Number.isNaN(v))) return null;
                return { r, g, b };
            }

            static _shadeColor(color, ratio) {

                const rgb = Shape._parseHexColor(color);
                if (!rgb) return color;

                const r = ratio >= 0
                    ? Math.round(rgb.r + (255 - rgb.r) * ratio)
                    : Math.round(rgb.r * (1 + ratio));
                const g = ratio >= 0
                    ? Math.round(rgb.g + (255 - rgb.g) * ratio)
                    : Math.round(rgb.g * (1 + ratio));
                const b = ratio >= 0
                    ? Math.round(rgb.b + (255 - rgb.b) * ratio)
                    : Math.round(rgb.b * (1 + ratio));

                const toHex = v => v.toString(16).padStart(2, '0');
                return '#' + toHex(r) + toHex(g) + toHex(b);
            }

            static _isFiniteNum(v) {
                return typeof v === 'number' && Number.isFinite(v);
            }

            static _getShadedFill(ctx, baseColor, x, y, w, h) {
                if (!baseColor || baseColor === 'none') return null;

                const parsed = Shape._parseHexColor(baseColor);
                if (!parsed) return baseColor;

                if (![x, y, w, h].every(Shape._isFiniteNum)) return baseColor;
                if (w === 0 && h === 0) return baseColor;

                if (w < 0) { x = x + w; w = -w; }
                if (h < 0) { y = y + h; h = -h; }

                if (![x, y, w, h].every(Shape._isFiniteNum)) return baseColor;

                const light = Shape._shadeColor(baseColor, 0.3);
                const dark = Shape._shadeColor(baseColor, -0.25);

                const x2 = x + w;
                const y2 = y + h;

                if (![x2, y2].every(Shape._isFiniteNum)) return baseColor;

                const grad = ctx.createLinearGradient(x, y, x2, y2);
                grad.addColorStop(0, light);
                grad.addColorStop(0.5, baseColor);
                grad.addColorStop(1, dark);
                return grad;
            }

            static _makeRect(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const x = parseFloat(el.getAttribute('x') || '0');
                const ySvg = parseFloat(el.getAttribute('y') || '0');
                const w = parseFloat(el.getAttribute('width') || '0');
                const h = parseFloat(el.getAttribute('height') || '0');
                const style = Shape._readStyle(el);

                const y = -(ySvg + h);

                const rotationDeg = Shape._readRotationDeg?.(style, 0) ?? Shape._readRotationDeg?.(el, 0) ?? 0;

                const fallbackDraw = function (grid, ctx) {
                    const sx = grid.X(this.x);
                    const syTop = grid.Y(this.y + this.h);
                    const sw = grid.screenWidth(this.w);
                    const sh = grid.screenHeight(this.h);

                    ctx.lineWidth = this.style.strokeWidth;
                    ctx.strokeStyle = this.style.stroke || '#000';

                    Shape._applyShadow(ctx, this.style);

                    let fillStyle = 'transparent';
                    if (this.style.fill && this.style.fill !== 'none') {
                        const shaded = Shape._getShadedFill(ctx, this.style.fill, sx, syTop, sw, sh);
                        fillStyle = shaded || this.style.fill;
                    }
                    ctx.fillStyle = fillStyle;

                    ctx.beginPath();
                    ctx.rect(sx, syTop, sw, sh);
                    if (this.style.fill && this.style.fill !== 'none') ctx.fill();
                    ctx.stroke();

                    Shape._clearShadow(ctx);
                };

                const shape = {
                    domain: 'svg',
                    type: 'rect',
                    x, y, w, h,
                    xf: x + w,
                    yf: y + h,
                    style,
                    rotationDeg,
                    themeName: '',
                    gfx,

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawRect === 'function') return g.drawRect(this, grid, ctx);

                        return fallbackDraw.call(this, grid, ctx);
                    },

                    getPivot() { return { wx: this.x + this.w / 2, wy: this.y + this.h / 2 }; },

                    inside(grid, x, y) {
                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                        const sx = grid.X(this.x);
                        const syTop = grid.Y(this.y + this.h);
                        const sw = grid.screenWidth(this.w);
                        const sh = grid.screenHeight(this.h);

                        const left = Math.min(sx, sx + sw);
                        const right = Math.max(sx, sx + sw);
                        const top = Math.min(syTop, syTop + sh);
                        const bottom = Math.max(syTop, syTop + sh);

                        const lw = (this.style && Number(this.style.strokeWidth)) || 0;
                        const tol = Math.max(2, lw * 0.5);

                        const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');
                        const hasStroke = !!(this.style && this.style.stroke && this.style.stroke !== 'none' && lw > 0);

                        if (hasFill) {
                            return (x >= left - tol && x <= right + tol && y >= top - tol && y <= bottom + tol);
                        }

                        if (hasStroke) {
                            const outer = (x >= left - tol && x <= right + tol && y >= top - tol && y <= bottom + tol);
                            if (!outer) return false;
                            const inner = (x >= left + tol && x <= right - tol && y >= top + tol && y <= bottom - tol);
                            return !inner;
                        }

                        return false;
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);

                finalizeSvgPrimitive(shape)
                return shape;
            }

            static _makeLine(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const x1 = parseFloat(el.getAttribute('x1') || '0');
                const y1Svg = parseFloat(el.getAttribute('y1') || '0');
                const x2 = parseFloat(el.getAttribute('x2') || '0');
                const y2Svg = parseFloat(el.getAttribute('y2') || '0');
                const style = Shape._readStyle(el);

                const y1 = -y1Svg;
                const y2 = -y2Svg;

                const rotationDeg = Shape._readRotationDeg?.(style, 0) ?? Shape._readRotationDeg?.(el, 0) ?? 0;

                const fallbackDraw = function (grid, ctx) {
                    ctx.strokeStyle = this.style.stroke || '#000';
                    ctx.lineWidth = this.style.strokeWidth || 1;

                    Shape._applyShadow(ctx, this.style);

                    ctx.beginPath();
                    ctx.moveTo(grid.X(this.x1), grid.Y(this.y1));
                    ctx.lineTo(grid.X(this.x2), grid.Y(this.y2));
                    ctx.stroke();

                    Shape._clearShadow(ctx);
                };

                const shape = {
                    domain: 'svg',
                    type: 'line',
                    x1, y1, x2, y2,
                    style,
                    rotationDeg,
                    gfx,
                    themeName: "",

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawLine === 'function') return g.drawLine(this, grid, ctx);
                        return fallbackDraw.call(this, grid, ctx);
                    },

                    getPivot() { return { wx: (this.x1 + this.x2) / 2, wy: (this.y1 + this.y2) / 2 }; },

                    inside(grid, x, y) {
                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                        const ax = grid.X(this.x1);
                        const ay = grid.Y(this.y1);
                        const bx = grid.X(this.x2);
                        const by = grid.Y(this.y2);

                        const lw = (this.style && Number(this.style.strokeWidth)) || 1;
                        const tol = Math.max(3, lw * 0.75);
                        const tol2 = tol * tol;

                        const minX = Math.min(ax, bx) - tol;
                        const maxX = Math.max(ax, bx) + tol;
                        const minY = Math.min(ay, by) - tol;
                        const maxY = Math.max(ay, by) + tol;
                        if (x < minX || x > maxX || y < minY || y > maxY) return false;

                        const abx = bx - ax, aby = by - ay;
                        const apx = x - ax, apy = y - ay;

                        const abLen2 = abx * abx + aby * aby;
                        if (abLen2 <= 1e-9) {
                            const dx = x - ax, dy = y - ay;
                            return (dx * dx + dy * dy) <= tol2;
                        }

                        let t = (apx * abx + apy * aby) / abLen2;
                        if (t < 0) t = 0;
                        else if (t > 1) t = 1;

                        const cx = ax + t * abx;
                        const cy = ay + t * aby;

                        const dx = x - cx, dy = y - cy;
                        return (dx * dx + dy * dy) <= tol2;
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);
                finalizeSvgPrimitive(shape)

                return shape;
            }
            static _makeLineFromWorld(x1, y1, x2, y2, styleOverrides = {}, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const isNum = v => typeof v === 'number' && Number.isFinite(v);
                if (![x1, y1, x2, y2].every(isNum)) return null;

                const svgNS = 'http://www.w3.org/2000/svg';
                const el = document.createElementNS(svgNS, 'line');

                el.setAttribute('x1', String(x1));
                el.setAttribute('y1', String(-y1));
                el.setAttribute('x2', String(x2));
                el.setAttribute('y2', String(-y2));

                if (styleOverrides && typeof styleOverrides === 'object') {
                    if (styleOverrides.stroke != null) el.setAttribute('stroke', String(styleOverrides.stroke));
                    if (styleOverrides.strokeWidth != null) el.setAttribute('stroke-width', String(styleOverrides.strokeWidth));
                    if (styleOverrides.fill != null) el.setAttribute('fill', String(styleOverrides.fill));
                    if (styleOverrides.opacity != null) el.setAttribute('opacity', String(styleOverrides.opacity));
                    if (styleOverrides['stroke-dasharray'] != null) el.setAttribute('stroke-dasharray', String(styleOverrides['stroke-dasharray']));
                    if (styleOverrides['stroke-linecap'] != null) el.setAttribute('stroke-linecap', String(styleOverrides['stroke-linecap']));
                    if (styleOverrides['stroke-linejoin'] != null) el.setAttribute('stroke-linejoin', String(styleOverrides['stroke-linejoin']));
                }

                return Shape._makeLine(el, gfx);
            }

            static _makeCircle(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const cx = parseFloat(el.getAttribute('cx') || '0');
                const cySvg = parseFloat(el.getAttribute('cy') || '0');
                const r = parseFloat(el.getAttribute('r') || '0');
                const style = Shape._readStyle(el);

                const cy = -cySvg;
                const rotationDeg = Shape._readRotationDeg?.(style, 0) ?? Shape._readRotationDeg?.(el, 0) ?? 0;

                const shape = {
                    domain: 'svg',
                    type: 'circle',
                    cx, cy, r,
                    x: cx - r,
                    y: cy - r,
                    w: 2 * r,
                    h: 2 * r,
                    xf: cx + r,
                    yf: cy + r,
                    style,
                    rotationDeg,
                    gfx,
                    themeName: "",

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawCircle === 'function') return g.drawCircle(this, grid, ctx);

                        const sx = grid.X(this.cx);
                        const sy = grid.Y(this.cy);
                        const sr = grid.screenWidth(this.r);

                        ctx.strokeStyle = this.style.stroke || '#000';
                        ctx.lineWidth = this.style.strokeWidth || 1;

                        Shape._applyShadow(ctx, this.style);

                        let fillStyle = null;
                        if (this.style.fill && this.style.fill !== 'none') {
                            const shaded = Shape._getShadedFill(ctx, this.style.fill, sx - sr, sy - sr, sr * 2, sr * 2);
                            fillStyle = shaded || this.style.fill;
                        }
                        if (fillStyle) ctx.fillStyle = fillStyle;

                        ctx.beginPath();
                        ctx.arc(sx, sy, sr, 0, 2 * Math.PI);
                        if (fillStyle) ctx.fill();
                        ctx.stroke();

                        Shape._clearShadow(ctx);
                    },

                    getPivot() { return { wx: this.cx, wy: this.cy }; },

                    inside(grid, x, y) {
                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                        const sx = grid.X(this.cx);
                        const sy = grid.Y(this.cy);
                        const sr = Math.abs(grid.screenWidth(this.r));

                        const dx = x - sx;
                        const dy = y - sy;
                        const dist2 = dx * dx + dy * dy;

                        const lw = (this.style && Number(this.style.strokeWidth)) || 0;
                        const tol = Math.max(2, lw * 0.5);

                        const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');

                        if (hasFill) {
                            const rOuter = sr + tol;
                            return dist2 <= rOuter * rOuter;
                        }

                        if (lw > 0) {
                            const rOuter = sr + tol;
                            const rInner = Math.max(0, sr - tol);
                            return dist2 <= rOuter * rOuter && dist2 >= rInner * rInner;
                        }

                        return false;
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);
                finalizeSvgPrimitive(shape)

                return shape;
            }
            static _makePath(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const d = String(el.getAttribute('d') || '').trim();
                if (!d) return null;

                const style = Shape._readStyle(el);

                const rotationDeg =
                    Shape._readRotationDeg?.(style, 0) ??
                    Shape._readRotationDeg?.(el, 0) ??
                    0;

                function computePathBounds(pathEl, pathData) {
                    try {
                        if (typeof pathEl.getBBox === 'function') {
                            const b = pathEl.getBBox();
                            if (
                                b &&
                                Number.isFinite(b.x) &&
                                Number.isFinite(b.y) &&
                                Number.isFinite(b.width) &&
                                Number.isFinite(b.height)
                            ) {
                                // Convert SVG bbox (y-down) into world bbox (y-up)
                                return {
                                    x: b.x,
                                    y: -b.y - b.height,
                                    w: b.width,
                                    h: b.height
                                };
                            }
                        }
                    } catch (err) {
                        // Detached nodes can fail here; use numeric fallback
                    }

                    const nums = (pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [])
                        .map(Number)
                        .filter(Number.isFinite);

                    if (nums.length < 2) {
                        return { x: 0, y: 0, w: 0, h: 0 };
                    }

                    const xs = [];
                    const ys = [];
                    for (let i = 0; i < nums.length - 1; i += 2) {
                        xs.push(nums[i]);
                        ys.push(nums[i + 1]);
                    }

                    if (!xs.length || !ys.length) {
                        return { x: 0, y: 0, w: 0, h: 0 };
                    }

                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minYSvg = Math.min(...ys);
                    const maxYSvg = Math.max(...ys);

                    return {
                        x: minX,
                        y: -maxYSvg,
                        w: maxX - minX,
                        h: maxYSvg - minYSvg
                    };
                }

                const bounds = computePathBounds(el, d);

                const shape = {
                    domain: 'svg',
                    type: 'path',
                    d,

                    x: bounds.x,
                    y: bounds.y,
                    w: bounds.w,
                    h: bounds.h,
                    xf: bounds.x + bounds.w,
                    yf: bounds.y + bounds.h,

                    style,
                    rotationDeg,
                    gfx,
                    themeName: "",

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawPath === 'function') {
                            return g.drawPath(this, grid, ctx);
                        }

                        let path2d;
                        try {
                            path2d = new Path2D(this.d);
                        } catch (err) {
                            console.warn('Invalid SVG path data:', this.d, err);
                            return;
                        }

                        ctx.strokeStyle = this.style.stroke || '#000';
                        ctx.lineWidth = 0.3;//this.style.strokeWidth || 1;

                        Shape._applyShadow(ctx, this.style);

                        ctx.save();
                        try {
                            const sx0 = grid.X(0);
                            const sy0 = grid.Y(0);
                            const sx1 = grid.X(1);
                            const sy1 = grid.Y(-1);

                            const scaleX = (sx1 - sx0) || 1;
                            const scaleY = (sy1 - sy0) || 1;

                            ctx.setTransform(scaleX, 0, 0, scaleY, sx0, sy0);

                            let fillStyle = null;
                            if (this.style.fill && this.style.fill !== 'none') {
                                const bx = grid.X(this.x);
                                const by = grid.Y(this.y + this.h);
                                const bw = grid.screenWidth(this.w);
                                const bh = grid.screenHeight(this.h);
                                const shaded = Shape._getShadedFill(ctx, this.style.fill, bx, by, bw, bh);
                                fillStyle = shaded || this.style.fill;
                            }

                            if (fillStyle) {
                                ctx.fillStyle = fillStyle;
                                ctx.fill(path2d);
                            }

                            if (this.style.stroke && this.style.stroke !== 'none') {
                                ctx.stroke(path2d);
                            }
                        } finally {
                            ctx.restore();
                            Shape._clearShadow(ctx);
                        }
                    },

                    getPivot() {
                        return {
                            wx: this.x + this.w / 2,
                            wy: this.y + this.h / 2
                        };
                    },

                    inside(grid, x, y) {
                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                        const left = grid.X(this.x);
                        const top = grid.Y(this.y + this.h);
                        const width = grid.screenWidth(this.w);
                        const height = grid.screenHeight(this.h);

                        const minX = Math.min(left, left + width);
                        const maxX = Math.max(left, left + width);
                        const minY = Math.min(top, top + height);
                        const maxY = Math.max(top, top + height);

                        const lw = (this.style && Number(this.style.strokeWidth)) || 1;
                        const tol = Math.max(3, lw);

                        return (
                            x >= minX - tol &&
                            x <= maxX + tol &&
                            y >= minY - tol &&
                            y <= maxY + tol
                        );
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);
                finalizeSvgPrimitive(shape);

                return shape;
            }

            static _makeEllipse(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const cx = parseFloat(el.getAttribute('cx') || '0');
                const cySvg = parseFloat(el.getAttribute('cy') || '0');
                const rx = parseFloat(el.getAttribute('rx') || '0');
                const ry = parseFloat(el.getAttribute('ry') || '0');
                const style = Shape._readStyle(el);

                const cy = -cySvg;
                const rotationDeg = Shape._readRotationDeg?.(style, 0) ?? Shape._readRotationDeg?.(el, 0) ?? 0;

                const shape = {
                    domain: 'svg',
                    type: 'ellipse',
                    cx, cy, rx, ry,
                    x: cx - rx,
                    y: cy - ry,
                    w: rx * 2,
                    h: ry * 2,
                    style,
                    rotationDeg,
                    gfx,
                    themeName: "",

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawEllipse === 'function') return g.drawEllipse(this, grid, ctx);

                        const sx = grid.X(this.cx);
                        const sy = grid.Y(this.cy);
                        const srx = grid.screenWidth(this.rx);
                        const sry = grid.screenHeight(this.ry);

                        ctx.strokeStyle = this.style.stroke || '#000';
                        ctx.lineWidth = this.style.strokeWidth || 1;

                        Shape._applyShadow(ctx, this.style);

                        let fillStyle = null;
                        if (this.style.fill && this.style.fill !== 'none') {
                            const shaded = Shape._getShadedFill(ctx, this.style.fill, sx - srx, sy - sry, srx * 2, sry * 2);
                            fillStyle = shaded || this.style.fill;
                        }

                        ctx.beginPath();
                        ctx.save();
                        ctx.translate(sx, sy);
                        ctx.scale(srx, sry);
                        ctx.arc(0, 0, 1, 0, Math.PI * 2);
                        ctx.restore();

                        if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
                        ctx.stroke();

                        Shape._clearShadow(ctx);
                    },

                    getPivot() { return { wx: this.cx, wy: this.cy }; },

                    inside(grid, x, y) {
                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                        const sx = grid.X(this.cx);
                        const sy = grid.Y(this.cy);
                        const srx = Math.abs(grid.screenWidth(this.rx));
                        const sry = Math.abs(grid.screenHeight(this.ry));
                        if (!(srx > 0) || !(sry > 0)) return false;

                        const dx = x - sx;
                        const dy = y - sy;

                        const lw = (this.style && Number(this.style.strokeWidth)) || 0;
                        const tolPx = Math.max(2, lw * 0.5);

                        const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');

                        if (hasFill) {
                            const rxOut = srx + tolPx;
                            const ryOut = sry + tolPx;
                            const vOut = (dx * dx) / (rxOut * rxOut) + (dy * dy) / (ryOut * ryOut);
                            return vOut <= 1.0;
                        }

                        if (lw > 0) {
                            const rxOut = srx + tolPx;
                            const ryOut = sry + tolPx;
                            const vOut = (dx * dx) / (rxOut * rxOut) + (dy * dy) / (ryOut * ryOut);

                            const rxIn = Math.max(0.0001, srx - tolPx);
                            const ryIn = Math.max(0.0001, sry - tolPx);
                            const vIn = (dx * dx) / (rxIn * rxIn) + (dy * dy) / (ryIn * ryIn);

                            return vOut <= 1.0 && vIn >= 1.0;
                        }

                        return false;
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);
                finalizeSvgPrimitive(shape)
                return shape;
            }

            static _makePolyline(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const ptsStr = el.getAttribute('points') || '';
                const pts = ptsStr.trim().split(/\s+/).map(p => {
                    const [x, y] = p.split(',').map(Number);
                    return { x, y: -y };
                });
                const style = Shape._readStyle(el);

                const rotationDeg = Shape._readRotationDeg?.(style, 0) ?? Shape._readRotationDeg?.(el, 0) ?? 0;

                const shape = {
                    domain: 'svg',
                    type: 'polyline',
                    pts,
                    isClosed: false,
                    style,
                    rotationDeg,
                    gfx,
                    themeName: "",

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawPoly === 'function') return g.drawPoly(this, grid, ctx);

                        ctx.strokeStyle = this.style.stroke || '#000';
                        ctx.lineWidth = this.style.strokeWidth || 1;

                        Shape._applyShadow(ctx, this.style);

                        ctx.beginPath();
                        this.pts.forEach((p, i) => {
                            const sx = grid.X(p.x);
                            const sy = grid.Y(p.y);
                            if (i === 0) ctx.moveTo(sx, sy);
                            else ctx.lineTo(sx, sy);
                        });
                        ctx.stroke();

                        Shape._clearShadow(ctx);
                    },

                    getPivot() {
                        Shape._attachBBoxMethods?.(this);
                        if (typeof this.getX === 'function') {
                            const x1 = this.getX(), y1 = this.getY(), x2 = this.getXf(), y2 = this.getYf();
                            return { wx: (x1 + x2) / 2, wy: (y1 + y2) / 2 };
                        }
                        return { wx: 0, wy: 0 };
                    },

                    inside(grid, x, y) {
                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;
                        if (!Array.isArray(this.pts) || this.pts.length < 2) return false;

                        const lw = (this.style && Number(this.style.strokeWidth)) || 1;
                        const tol = Math.max(3, lw * 0.75);
                        const tol2 = tol * tol;

                        const spts = this.pts.map(p => ({ sx: grid.X(p.x), sy: grid.Y(p.y) }));

                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        for (const p of spts) { minX = Math.min(minX, p.sx); minY = Math.min(minY, p.sy); maxX = Math.max(maxX, p.sx); maxY = Math.max(maxY, p.sy); }
                        if (x < minX - tol || x > maxX + tol || y < minY - tol || y > maxY + tol) return false;

                        for (let i = 0; i < spts.length - 1; i++) {
                            const ax = spts[i].sx, ay = spts[i].sy;
                            const bx = spts[i + 1].sx, by = spts[i + 1].sy;

                            const abx = bx - ax, aby = by - ay;
                            const apx = x - ax, apy = y - ay;

                            const abLen2 = abx * abx + aby * aby;
                            if (abLen2 <= 1e-9) {
                                const dx = x - ax, dy = y - ay;
                                if (dx * dx + dy * dy <= tol2) return true;
                                continue;
                            }

                            let t = (apx * abx + apy * aby) / abLen2;
                            if (t < 0) t = 0; else if (t > 1) t = 1;

                            const cx = ax + t * abx;
                            const cy = ay + t * aby;

                            const dx = x - cx, dy = y - cy;
                            if (dx * dx + dy * dy <= tol2) return true;
                        }

                        return false;
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);
                finalizeSvgPrimitive(shape)
                return shape;
            }

            static _makePolygon(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const ptsStr = el.getAttribute('points') || '';
                const pts = ptsStr.trim().split(/\s+/).map(p => {
                    const [x, y] = p.split(',').map(Number);
                    return { x, y: -y };
                });
                const style = Shape._readStyle(el);

                const rotationDeg = Shape._readRotationDeg?.(style, 0) ?? Shape._readRotationDeg?.(el, 0) ?? 0;

                const shape = {
                    domain: 'svg',
                    type: 'polygon',
                    pts,
                    isClosed: true,
                    style,
                    rotationDeg,
                    gfx,
                    themeName: "",

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawPoly === 'function') return g.drawPoly(this, grid, ctx);

                        ctx.strokeStyle = this.style.stroke || '#000';
                        ctx.lineWidth = this.style.strokeWidth || 1;

                        Shape._applyShadow(ctx, this.style);

                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        for (const p of this.pts) {
                            const sx = grid.X(p.x), sy = grid.Y(p.y);
                            minX = Math.min(minX, sx); minY = Math.min(minY, sy);
                            maxX = Math.max(maxX, sx); maxY = Math.max(maxY, sy);
                        }

                        let fillStyle = 'transparent';
                        if (this.style.fill && this.style.fill !== 'none') {
                            const shaded = Shape._getShadedFill(ctx, this.style.fill, minX, minY, maxX - minX, maxY - minY);
                            fillStyle = shaded || this.style.fill;
                        }

                        ctx.beginPath();
                        this.pts.forEach((p, i) => {
                            const sx = grid.X(p.x), sy = grid.Y(p.y);
                            if (i === 0) ctx.moveTo(sx, sy);
                            else ctx.lineTo(sx, sy);
                        });
                        ctx.closePath();

                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fillStyle = fillStyle;
                            ctx.fill();
                        }
                        ctx.stroke();

                        Shape._clearShadow(ctx);
                    },

                    getPivot() {
                        Shape._attachBBoxMethods?.(this);
                        if (typeof this.getX === 'function') {
                            const x1 = this.getX(), y1 = this.getY(), x2 = this.getXf(), y2 = this.getYf();
                            return { wx: (x1 + x2) / 2, wy: (y1 + y2) / 2 };
                        }
                        return { wx: 0, wy: 0 };
                    },

                    inside(grid, x, y) {
                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;
                        if (!Array.isArray(this.pts) || this.pts.length < 3) return false;

                        const lw = (this.style && Number(this.style.strokeWidth)) || 1;
                        const tol = Math.max(3, lw * 0.75);
                        const tol2 = tol * tol;

                        const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');
                        const hasStroke = !!(this.style && this.style.stroke && this.style.stroke !== 'none' && lw > 0);

                        const spts = this.pts.map(p => ({ sx: grid.X(p.x), sy: grid.Y(p.y) }))
                            .filter(p => Number.isFinite(p.sx) && Number.isFinite(p.sy));
                        if (spts.length < 3) return false;

                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        for (const p of spts) { minX = Math.min(minX, p.sx); minY = Math.min(minY, p.sy); maxX = Math.max(maxX, p.sx); maxY = Math.max(maxY, p.sy); }
                        if (x < minX - tol || x > maxX + tol || y < minY - tol || y > maxY + tol) return false;

                        if (hasFill) {
                            let inside = false;
                            for (let i = 0, j = spts.length - 1; i < spts.length; j = i++) {
                                const xi = spts[i].sx, yi = spts[i].sy;
                                const xj = spts[j].sx, yj = spts[j].sy;
                                const intersect = ((yi > y) !== (yj > y)) &&
                                    (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
                                if (intersect) inside = !inside;
                            }
                            if (inside) return true;
                        }

                        if (hasStroke || !hasFill) {
                            for (let i = 0; i < spts.length; i++) {
                                const a = spts[i];
                                const b = spts[(i + 1) % spts.length];

                                const ax = a.sx, ay = a.sy;
                                const bx = b.sx, by = b.sy;

                                const abx = bx - ax, aby = by - ay;
                                const apx = x - ax, apy = y - ay;

                                const abLen2 = abx * abx + aby * aby;
                                if (abLen2 <= 1e-9) {
                                    const dx = x - ax, dy = y - ay;
                                    if (dx * dx + dy * dy <= tol2) return true;
                                    continue;
                                }

                                let t = (apx * abx + apy * aby) / abLen2;
                                if (t < 0) t = 0; else if (t > 1) t = 1;

                                const cx = ax + t * abx;
                                const cy = ay + t * aby;

                                const dx = x - cx, dy = y - cy;
                                if (dx * dx + dy * dy <= tol2) return true;
                            }
                        }

                        return false;
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);
                finalizeSvgPrimitive(shape)
                return shape;
            }

            static _makeText(el, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const x = parseFloat(el.getAttribute('x') || '0');
                const ySvg = parseFloat(el.getAttribute('y') || '0');
                const text = el.textContent || '';
                const style = Shape._readStyle(el);

                const fontSizeAttr = el.getAttribute('font-size');
                const fontSize = fontSizeAttr != null ? (parseFloat(fontSizeAttr) || 10) : 10;

                const y = -ySvg;

                const textAnchor = (
                    el.getAttribute('text-anchor') ||
                    style.textAnchor ||
                    style['text-anchor'] ||
                    'start'
                );

                const rotationDeg = Shape._readRotationDeg?.(style, 0) ?? Shape._readRotationDeg?.(el, 0) ?? 0;

                const shape = {
                    domain: 'svg',
                    type: 'text',
                    x, y,
                    text,
                    style,
                    fontSize,
                    textAnchor,
                    rotationDeg,
                    gfx,
                    themeName: "",

                    __defaultTextDraw(grid, ctx) {
                        const unitY = typeof grid.screenHeight === 'function'
                            ? Math.abs(grid.screenHeight(1))
                            : 1;
                        const px = Math.max(1, unitY * this.fontSize);

                        const baseColor = this.style?.fill && this.style.fill !== 'none'
                            ? this.style.fill
                            : (this.style?.stroke || 'black');

                        const text = String(this.text ?? '');

                        ctx.save();
                        ctx.font = px + 'px sans-serif';

                        const a = String(this.textAnchor || 'start').toLowerCase();
                        ctx.textAlign = 'left';
                        (a === 'middle' || a === 'center') ? 'center' :
                            (a === 'end' || a === 'right') ? 'right' :
                                'left';

                        ctx.textBaseline = 'alphabetic';

                        const sx = grid.X(this.x);
                        const sy = grid.Y(this.y);

                        const m = ctx.measureText(text);
                        const textW = Math.max(0, m.width || 0);

                        const ascent = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : (px * 0.8);
                        const descent = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : (px * 0.2);
                        const textH = ascent + descent;

                        const padX = Math.max(4, px * 0.35);
                        const padY = Math.max(3, px * 0.25);
                        const r = Math.max(3, px * 0.35);

                        let boxX = sx - textW / 2;
                        if (ctx.textAlign === 'center') boxX = sx - textW / 2;
                        else if (ctx.textAlign === 'right') boxX = sx - textW;

                        const boxY = sy - ascent;

                        const rx = boxX - padX;
                        const ry = boxY - padY;
                        const rw = textW + padX * 2;
                        const rh = textH + padY * 2;

                        Shape._applyShadow(ctx, {
                            shadow: { color: 'rgba(0,0,0,0.45)', blur: 4, offsetX: 2, offsetY: 2 }
                        });

                        const roundRect = (ctx, x, y, w, h, r) => {
                            const rr = Math.max(0, Math.min(r, w / 2, h / 2));
                            ctx.beginPath();
                            ctx.moveTo(x + rr, y);
                            ctx.arcTo(x + w, y, x + w, y + h, rr);
                            ctx.arcTo(x + w, y + h, x, y + h, rr);
                            ctx.arcTo(x, y + h, x, y, rr);
                            ctx.arcTo(x, y, x + w, y, rr);
                            ctx.closePath();
                        };

                        roundRect(ctx, rx, ry, rw, rh, r);

                        ctx.fillStyle = this.boxFill ?? 'rgba(255,255,255,0.90)';
                        ctx.fill();

                        ctx.lineWidth = this.boxLineWidth ?? Math.max(1, px * 0.06);
                        ctx.strokeStyle = this.boxStroke ?? 'rgba(0,0,0,0.25)';
                        ctx.stroke();

                        ctx.fillStyle = this.textFill ?? baseColor;
                        ctx.fillText(text, boxX, sy);

                        Shape._clearShadow(ctx);
                        ctx.restore();
                    },

                    draw(grid, ctx) {
                        const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                        if (g && typeof g.drawText === 'function') return g.drawText(this, grid, ctx);
                        return this.__defaultTextDraw(grid, ctx);
                    },

                    getPivot() { return { wx: this.x, wy: this.y }; },

                    inside(grid, x, y, ctx) {

                        if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                        const sx = grid.X(this.x);
                        const sy = grid.Y(this.y);

                        const unitY = typeof grid.screenHeight === 'function'
                            ? Math.abs(grid.screenHeight(1))
                            : 1;
                        const px = Math.max(1, unitY * this.fontSize);

                        const pad = Math.max(3, px * 0.15);

                        let textW = 0;
                        let textH = px;

                        const str = String(this.text ?? '');
                        if (ctx && typeof ctx.measureText === 'function') {
                            try {
                                const prevFont = ctx.font;
                                const prevAlign = ctx.textAlign;
                                const prevBase = ctx.textBaseline;

                                ctx.font = px + 'px sans-serif';
                                ctx.textBaseline = 'alphabetic';
                                const m = ctx.measureText(str);

                                textW = Number(m.width) || 0;

                                const asc = Number(m.actualBoundingBoxAscent);
                                const desc = Number(m.actualBoundingBoxDescent);
                                if (Number.isFinite(asc) && Number.isFinite(desc) && (asc + desc) > 0) textH = asc + desc;
                                else textH = px * 1.1;

                                ctx.font = prevFont;
                                ctx.textAlign = prevAlign;
                                ctx.textBaseline = prevBase;
                            } catch { }
                        }

                        if (!(textW > 0)) {
                            const chars = Math.max(1, str.length);
                            textW = chars * px * 0.6;
                            textH = px * 1.1;
                        }

                        const a = String(this.textAnchor || 'start').toLowerCase();
                        let left, right;
                        left = sx - textW / 2; right = sx + textW / 2;

                        const top = sy - textH * 0.8;
                        const bottom = top + textH;

                        return (x >= left - pad && x <= right + pad && y >= top - pad && y <= bottom + pad);
                    }
                };

                Shape._attachBBoxMethods(shape);
                Shape._attachCollisionMethods(shape);
                if (('rotationDeg' in shape) && shape.rotationDeg) Shape._attachRotationMethods(shape);
                finalizeSvgPrimitive(shape)
                return shape;
            }

            static buildFromJSON(json) {
                if (!json || typeof json !== 'object') return null;

                const type = json.type;
                if (!type) return null;
                const typeLower = String(type).toLowerCase();

                if (typeLower === 'svg_group' || typeLower.startsWith('svg_')) {
                    const svgShape = Shape._buildSvgFromJSON(json);
                    if (svgShape) return svgShape;
                }

                if (typeLower === 'svg_group') {
                    const childShapes = Array.isArray(json.shapes)
                        ? json.shapes.map(childJson => Shape._buildSvgFromJSON(childJson)).filter(Boolean)
                        : [];

                    const g = Shape._makeCompositeShape(childShapes);

                    if (json.rotationDeg != null || json.rotation != null || json.rot != null || json.angleDeg != null) {
                        g.rotationDeg = Shape._readRotationDeg(json, g.rotationDeg ?? 0);
                        Shape._ensureRotationAPI(g);
                    }

                    if (json.name != null) g.name = json.name;
                    if (json.id != null) g.id = json.id;
                    if (json.z != null) g.z = json.z;
                    if (json.locked != null) g.locked = json.locked;
                    if (json.hidden != null) g.hidden = json.hidden;

                    return g;
                }

                return Shape._buildSvgFromJSON(json);
            }

            static groupTextWithBackground(shapes, options = {}) {
                if (!Array.isArray(shapes) || shapes.length === 0) return shapes || [];

                const padding = typeof options.padding === 'number' ? options.padding : 0;

                const textTypes = (options.textTypes || ['text', 'svg_text'])
                    .map(t => String(t).toLowerCase());
                const bgTypes = (options.backgroundTypes || [
                    'rect', 'svg_rect',
                    'circle', 'svg_circle',
                    'ellipse', 'svg_ellipse'
                ]).map(t => String(t).toLowerCase());

                const isText = s => !!s && textTypes.includes(String(s.type || '').toLowerCase());
                const isBg = s => !!s && bgTypes.includes(String(s.type || '').toLowerCase());
                const isNum = v => typeof v === 'number' && Number.isFinite(v);

                const getAabb = s => {
                    if (!s) return null;
                    Shape._attachBBoxMethods(s);
                    const x1 = s.getX();
                    const y1 = s.getY();
                    const x2 = s.getXf();
                    const y2 = s.getYf();
                    if (![x1, y1, x2, y2].every(isNum)) return null;
                    const minX = Math.min(x1, x2);
                    const maxX = Math.max(x1, x2);
                    const minY = Math.min(y1, y2);
                    const maxY = Math.max(y1, y2);
                    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
                };

                const containsPoint = (box, x, y, pad = 0) =>
                    x >= box.x1 - pad &&
                    x <= box.x2 + pad &&
                    y >= box.y1 - pad &&
                    y <= box.y2 + pad;

                const shapesCopy = [...shapes];

                const bboxes = new Map();
                const areas = new Map();
                for (const s of shapesCopy) {
                    const bb = getAabb(s);
                    if (!bb) continue;
                    bboxes.set(s, bb);
                    const area = (bb.x2 - bb.x1) * (bb.y2 - bb.y1);
                    if (isNum(area)) areas.set(s, Math.max(0, area));
                }

                if (!bboxes.size) return shapesCopy;

                const labelToBg = new Map();

                for (const lbl of shapesCopy) {
                    if (!isText(lbl)) continue;
                    const bb = bboxes.get(lbl);
                    if (!bb) continue;

                    const cx = (bb.x1 + bb.x2) / 2;
                    const cy = (bb.y1 + bb.y2) / 2;

                    let bestBg = null;
                    let bestArea = Infinity;

                    for (const bg of shapesCopy) {
                        if (!isBg(bg)) continue;
                        const bgBox = bboxes.get(bg);
                        if (!bgBox) continue;
                        if (!containsPoint(bgBox, cx, cy, padding)) continue;

                        const a = areas.get(bg);
                        if (!isNum(a)) continue;
                        if (a < bestArea) {
                            bestArea = a;
                            bestBg = bg;
                        }
                    }

                    if (bestBg) {
                        labelToBg.set(lbl, bestBg);
                    }
                }

                if (!labelToBg.size) return shapesCopy;

                const bgToLabels = new Map();
                for (const [lbl, bg] of labelToBg.entries()) {
                    if (!bgToLabels.has(bg)) bgToLabels.set(bg, []);
                    bgToLabels.get(bg).push(lbl);
                }

                const consumed = new Set();
                const result = [];

                for (const s of shapesCopy) {
                    if (!s || consumed.has(s)) continue;

                    const labels = bgToLabels.get(s);
                    if (!labels || !labels.length) {
                        result.push(s);
                        continue;
                    }

                    const children = [s, ...labels];
                    for (const c of children) consumed.add(c);

                    const composite = Shape._makeCompositeShape(children);

                    for (const key of ['name', 'url', 'comment', 'hl']) {
                        if (Object.prototype.hasOwnProperty.call(s, key)) {
                            composite[key] = s[key];
                        }
                    }
                    result.push(composite);
                }

                for (const s of shapesCopy) {
                    if (!s || consumed.has(s)) continue;
                    if (!result.includes(s)) result.push(s);
                }

                return result;
            }

            static groupTextWithBackground(shapes, options = {}) {
                if (!Array.isArray(shapes) || !shapes.length) return [];

                const padding = typeof options.padding === 'number' ? options.padding : 0;

                const textTypes = (options.textTypes || ['text', 'svg_text']).map(t => String(t).toLowerCase());
                const backgroundTypes = (options.backgroundTypes || [
                    'rect', 'svg_rect',
                    'circle', 'svg_circle',
                    'ellipse', 'svg_ellipse',
                    'polygon', 'svg_polygon',
                    'polyline', 'svg_polyline',
                    'svg_group'
                ]).map(t => String(t).toLowerCase());

                const isTextShape = s => !!s && textTypes.includes(String(s.type || '').toLowerCase());
                const isBackgroundShape = s => !!s && backgroundTypes.includes(String(s.type || '').toLowerCase());

                const isNum = v => typeof v === 'number' && Number.isFinite(v);

                const getAabb = (s) => {
                    if (!s) return null;
                    Shape._attachBBoxMethods(s);

                    const x1 = s.getX();
                    const y1 = s.getY();
                    const x2 = s.getXf();
                    const y2 = s.getYf();

                    if (![x1, y1, x2, y2].every(isNum)) return null;

                    const minX = Math.min(x1, x2);
                    const maxX = Math.max(x1, x2);
                    const minY = Math.min(y1, y2);
                    const maxY = Math.max(y1, y2);

                    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
                };

                const containsPoint = (box, x, y, pad = 0) => {
                    return (
                        x >= box.x1 - pad &&
                        x <= box.x2 + pad &&
                        y >= box.y1 - pad &&
                        y <= box.y2 + pad
                    );
                };

                const result = [...shapes];

                const consumed = new Set();

                const bboxes = new Map();
                for (const s of result) {
                    if (!s) continue;
                    bboxes.set(s, getAabb(s));
                }

                const labelToBackground = new Map();

                for (const s of result) {
                    if (!isTextShape(s)) continue;
                    if (consumed.has(s)) continue;

                    const box = bboxes.get(s);
                    if (!box) continue;

                    const cx = (box.x1 + box.x2) / 2;
                    const cy = (box.y1 + box.y2) / 2;

                    let bestBg = null;
                    let bestArea = Infinity;

                    for (const bg of result) {
                        if (!isBackgroundShape(bg)) continue;
                        if (bg === s) continue;
                        const bgBox = bboxes.get(bg);
                        if (!bgBox) continue;

                        if (!containsPoint(bgBox, cx, cy, padding)) continue;

                        const area = (bgBox.x2 - bgBox.x1) * (bgBox.y2 - bgBox.y1);
                        if (isNum(area) && area < bestArea) {
                            bestArea = area;
                            bestBg = bg;
                        }
                    }

                    if (bestBg) {
                        labelToBackground.set(s, bestBg);
                    }
                }

                if (!labelToBackground.size) {

                    return result;
                }

                const bgToLabels = new Map();
                for (const [label, bg] of labelToBackground.entries()) {
                    if (!bgToLabels.has(bg)) bgToLabels.set(bg, []);
                    bgToLabels.get(bg).push(label);
                }

                const newResult = [];

                for (const s of result) {
                    if (!s || consumed.has(s)) continue;

                    const labels = bgToLabels.get(s);
                    if (!labels || !labels.length) {

                        newResult.push(s);
                        continue;
                    }

                    const t = String(s.type || '').toLowerCase();
                    let baseChildren;

                    if (t === 'svg_group' && Array.isArray(s.shapes)) {
                        baseChildren = [...s.shapes];
                    } else {
                        baseChildren = [s];
                    }

                    for (const lbl of labels) {
                        if (!lbl) continue;
                        baseChildren.push(lbl);
                        consumed.add(lbl);
                    }

                    consumed.add(s);

                    const composite = Shape._makeCompositeShape(baseChildren);

                    for (const key of ['name', 'url', 'comment', 'hl']) {
                        if (s && Object.prototype.hasOwnProperty.call(s, key)) {
                            composite[key] = s[key];
                        }
                    }

                    newResult.push(composite);
                }

                for (const s of result) {
                    if (!s || consumed.has(s)) continue;
                    if (newResult.includes(s)) continue;
                    newResult.push(s);
                }

                return newResult;
            }

            static _resolveGfxThemeByName(name) {
                if (!name) return null;

                const registries = [
                    ShapeThemes,
                    ShapeThemes?.beach,
                    ShapeThemes?.timeline,
                    ShapeThemes?.dark,
                    ShapeThemes?.light
                ].filter(Boolean);

                for (const reg of registries) {
                    if (reg && reg[name]) return reg[name];
                }

                for (const reg of registries) {
                    for (const k in reg) {
                        const v = reg[k];
                        if (v && typeof v === "object" && v.name === name) return v;
                    }
                }

                return null;
            }

            static _applyGfxThemeToTree(root, gfxTheme, opts = {}) {
                if (!root || !gfxTheme) return;

                const options = { deep: true, overwrite: true, ...opts };

                const walk = (node) => {
                    if (!node) return;

                    Shape._attachApplyTheme(node);
                    node.applyTheme(gfxTheme, options);

                    const kids = node.shapes || node.children || node.items;
                    if (Array.isArray(kids)) kids.forEach(walk);
                };

                walk(root);
            }

            static _attachToJSONAll(obj, opts = {}) {
                if (!obj || typeof obj !== 'object') return obj;

                const options = {
                    deep: true,
                    overwrite: false,
                    ...opts
                };

                const safeRotDeg = (o) => {
                    if (typeof o.getRotationDeg === 'function') return o.getRotationDeg();
                    if (typeof o.rotationDeg === 'number') return o.rotationDeg;
                    if (typeof o.rotation === 'number') return o.rotation;
                    if (typeof o.rot === 'number') return o.rot;
                    if (typeof o.angleDeg === 'number') return o.angleDeg;
                    return 0;
                };

                const gfxToJSON = (gfx) => {
                    if (!gfx) return null;
                    const p = { 'path': gfx.path };
                    return (p == null) ? null : p;
                };

                const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

                const getChildren = (o) => {

                    if (Array.isArray(o.shapes)) return o.shapes;
                    if (Array.isArray(o.children)) return o.children;
                    if (Array.isArray(o.items)) return o.items;
                    return null;
                };

                const typeLower = String(obj.type || '').toLowerCase();

                if (typeof obj.toJSON === 'function' && !options.overwrite) {

                    if (options.deep) {
                        const kids = getChildren(obj);
                        if (Array.isArray(kids)) kids.forEach(k => Shape._attachToJSONAll(k, options));
                    }
                    return obj;
                }

                obj.toJSON = function () {
                    const o = this;
                    const t = o.type ?? null;
                    const tl = String(t || '').toLowerCase();

                    const json = { type: t };

                    if (o.name != null) json.name = o.name;
                    if (o.id != null) json.id = o.id;
                    if (o.z != null) json.z = o.z;
                    if (o.locked != null) json.locked = o.locked;
                    if (o.hidden != null) json.hidden = o.hidden;

                    if (o.style != null) json.style = o.style;

                    const rd = safeRotDeg(o);
                    if (rd != null) json.rotationDeg = rd;

                    const gfxPath = gfxToJSON(o.gfx);
                    if (gfxPath != null) json.gfx = gfxPath;

                    if (tl === 'svg_group' || tl === 'group' || Array.isArray(getChildren(o))) {

                        const kids = getChildren(o) || [];
                        json.type = (tl === 'group') ? 'svg_group' : (o.type || 'svg_group');
                        json.shapes = kids
                            .map(s => (s && typeof s.toJSON === 'function') ? s.toJSON() : null)
                            .filter(Boolean);

                        if (o.x != null) json.x = o.x;
                        if (o.y != null) json.y = o.y;
                        if (o.w != null) json.w = o.w;
                        if (o.h != null) json.h = o.h;
                        if (o.xf != null) json.xf = o.xf;
                        if (o.yf != null) json.yf = o.yf;

                        return json;
                    }

                    if (tl === 'note' || tl.startsWith('arrow-note') || tl.startsWith('simpler-note')) {
                        if (o.x != null) json.x = o.x;
                        if (o.y != null) json.y = o.y;
                        if (o.xf != null) json.xf = o.xf;
                        if (o.yf != null) json.yf = o.yf;
                        if (o.w != null) json.w = o.w;
                        if (o.h != null) json.h = o.h;
                        if (o.color != null) json.color = o.color;
                        if (o.comment != null) json.comment = o.comment;
                        if (o.hl != null) json.hl = !!o.hl;
                        if (o.url != null) json.url = o.url;
                        if (o.arrowDirection != null) json.arrowDirection = o.arrowDirection;

                        json.type = o.type;
                        return json;
                    }

                    if (tl === 'rect' || tl === 'svg_rect') {
                        json.type = (tl === 'svg_rect') ? 'svg_rect' : 'rect';
                        json.x = o.x ?? 0;
                        json.y = o.y ?? 0;
                        json.w = o.w ?? 0;
                        json.h = o.h ?? 0;
                        json.xf = o.xf ?? (json.x + json.w);
                        json.yf = o.yf ?? (json.y + json.h);
                        return json;
                    }

                    if (tl === 'line' || tl === 'svg_line') {
                        json.type = (tl === 'svg_line') ? 'svg_line' : 'line';
                        json.x1 = o.x1 ?? 0;
                        json.y1 = o.y1 ?? 0;
                        json.x2 = o.x2 ?? 0;
                        json.y2 = o.y2 ?? 0;
                        return json;
                    }

                    if (tl === 'circle' || tl === 'svg_circle') {
                        json.type = (tl === 'svg_circle') ? 'svg_circle' : 'circle';
                        json.cx = o.cx ?? 0;
                        json.cy = o.cy ?? 0;
                        json.r = o.r ?? 0;

                        json.x = o.x ?? (json.cx - json.r);
                        json.y = o.y ?? (json.cy - json.r);
                        json.w = o.w ?? (2 * json.r);
                        json.h = o.h ?? (2 * json.r);
                        json.xf = o.xf ?? (json.cx + json.r);
                        json.yf = o.yf ?? (json.cy + json.r);
                        return json;
                    }

                    if (tl === 'ellipse' || tl === 'svg_ellipse') {
                        json.type = (tl === 'svg_ellipse') ? 'svg_ellipse' : 'ellipse';
                        json.cx = o.cx ?? 0;
                        json.cy = o.cy ?? 0;
                        json.rx = o.rx ?? 0;
                        json.ry = o.ry ?? 0;

                        json.x = o.x ?? (json.cx - json.rx);
                        json.y = o.y ?? (json.cy - json.ry);
                        json.w = o.w ?? (json.rx * 2);
                        json.h = o.h ?? (json.ry * 2);
                        return json;
                    }

                    if (tl === 'polyline' || tl === 'polygon' || tl === 'svg_polyline' || tl === 'svg_polygon') {

                        json.type = o.type;
                        json.pts = Array.isArray(o.pts) ? o.pts.map(p => ({ x: p.x, y: p.y })) : [];
                        if (tl === 'polyline' || tl === 'svg_polyline') {
                            if (o.isClosed != null) json.isClosed = !!o.isClosed;
                        }
                        return json;
                    }

                    if (tl === 'text' || tl === 'svg_text') {
                        json.type = o.type;
                        json.x = o.x ?? 0;
                        json.y = o.y ?? 0;
                        json.text = o.text ?? '';
                        if (o.fontSize != null) json.fontSize = o.fontSize;

                        if (o.textAnchor != null) json.textAnchor = o.textAnchor;

                        if (o.boxFill != null) json.boxFill = o.boxFill;
                        if (o.boxStroke != null) json.boxStroke = o.boxStroke;
                        if (o.boxLineWidth != null) json.boxLineWidth = o.boxLineWidth;
                        if (o.textFill != null) json.textFill = o.textFill;

                        return json;
                    }

                    if (o.x != null) json.x = o.x;
                    if (o.y != null) json.y = o.y;
                    if (o.w != null) json.w = o.w;
                    if (o.h != null) json.h = o.h;
                    if (o.xf != null) json.xf = o.xf;
                    if (o.yf != null) json.yf = o.yf;

                    if (Array.isArray(o.pts)) json.pts = o.pts.map(p => ({ x: p.x, y: p.y }));

                    return json;
                };

                if (options.deep) {
                    const kids = getChildren(obj);
                    if (Array.isArray(kids)) kids.forEach(k => Shape._attachToJSONAll(k, options));
                }

                return obj;
            }

            static _buildSvgFromJSON(json, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                if (!json || typeof json !== 'object') return null;
                const rawType = json.type;
                if (!rawType) return null;
                const typeLower = String(rawType).toLowerCase();
                const primitiveType =
                    typeLower.startsWith('svg_') && typeLower !== 'svg_group'
                        ? typeLower.slice(4)
                        : typeLower;

                if (typeLower === 'svg_group') {
                    const childShapes = Array.isArray(json.shapes)
                        ? json.shapes.map(childJson => Shape._buildSvgFromJSON(childJson, gfx)).filter(Boolean)
                        : [];
                    const group = Shape._makeCompositeShape(childShapes);
                    const built = finalizeSvgPrimitive(group, json);
                    return built;
                }

                if (primitiveType === 'note') {
                    const note = new Note(json.x, json.y, json.xf, json.yf, json.color, json.rotationDeg);

                    note.name = json.name ?? null;
                    note.w = json.w ?? note.w ?? 1;
                    note.h = json.h ?? note.h ?? 1;
                    note.comment = json.comment ?? '';
                    note.hl = json.hl ?? false;
                    note.url = json.url ?? null;

                    note.rotationDeg = Shape._readRotationDeg(json, note.rotationDeg ?? 0);
                    Shape._ensureRotationAPI(note);

                    note.gfx = gfx;
                    if (gfx && typeof gfx.drawNote === 'function') {
                        const originalDraw = note.draw?.bind(note);
                        note.draw = function (grid, ctx) {
                            return gfx.drawNote(this, grid, ctx, originalDraw);
                        };
                    }

                    return finalizeSvgPrimitive(note, json);
                }

                if (primitiveType.startsWith('arrow-note')) {
                    const arrowNote = new ANote(json.x, json.y, json.xf, json.yf, json.color);
                    arrowNote.type = json.type;
                    arrowNote.name = json.name ?? null;
                    arrowNote.arrowDirection = json.arrowDirection;

                    arrowNote.w = json.w ?? arrowNote.w ?? 1;
                    arrowNote.h = json.h ?? arrowNote.h ?? 1;
                    arrowNote.comment = json.comment ?? '';
                    arrowNote.hl = json.hl ?? false;
                    arrowNote.url = json.url ?? null;

                    if ('rotationDeg' in arrowNote || json.rotationDeg != null || json.rotation != null || json.rot != null || json.angleDeg != null) {
                        arrowNote.rotationDeg = Shape._readRotationDeg(json, arrowNote.rotationDeg ?? 0);
                        Shape._ensureRotationAPI(arrowNote);
                    }

                    arrowNote.gfx = gfx;
                    if (gfx && typeof gfx.drawArrowNote === 'function') {
                        const originalDraw = arrowNote.draw?.bind(arrowNote);
                        arrowNote.draw = function (grid, ctx) {
                            return gfx.drawArrowNote(this, grid, ctx, originalDraw);
                        };
                    }

                    return finalizeSvgPrimitive(arrowNote, json);
                }

                if (primitiveType.startsWith('simpler-note')) {
                    const simpleNote = new ANote(json.x, json.y, json.xf, json.yf, json.color);
                    simpleNote.type = json.type;
                    simpleNote.name = json.name ?? null;
                    simpleNote.arrowDirection = json.arrowDirection;

                    simpleNote.w = json.w ?? simpleNote.w ?? 1;
                    simpleNote.h = json.h ?? simpleNote.h ?? 1;
                    simpleNote.comment = json.comment ?? '';
                    simpleNote.hl = json.hl ?? false;
                    simpleNote.url = json.url ?? null;

                    if ('rotationDeg' in simpleNote || json.rotationDeg != null || json.rotation != null || json.rot != null || json.angleDeg != null) {
                        simpleNote.rotationDeg = Shape._readRotationDeg(json, simpleNote.rotationDeg ?? 0);
                        Shape._ensureRotationAPI(simpleNote);
                    }

                    simpleNote.gfx = gfx;
                    if (gfx && typeof gfx.drawSimpleNote === 'function') {
                        const originalDraw = simpleNote.draw?.bind(simpleNote);
                        simpleNote.draw = function (grid, ctx) {
                            return gfx.drawSimpleNote(this, grid, ctx, originalDraw);
                        };
                    }

                    return finalizeSvgPrimitive(simpleNote, json);
                }

                if (primitiveType === 'rect') {
                    const style = json.style || { fill: 'none', stroke: 'black', strokeWidth: 1 };

                    const x = json.x ?? 0;
                    const y = json.y ?? 0;
                    const w = json.w ?? 0;
                    const h = json.h ?? 0;

                    const shape = {
                        type: 'rect',
                        x, y, w, h,
                        xf: json.xf ?? (x + w),
                        yf: json.yf ?? (y + h),
                        style,
                        rotationDeg: json.rotationDeg ?? 0,
                        gfx: json.gfx ?? gfx,
                        draw(grid, ctx) {
                            const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;

                            if (g && typeof g.drawRect === 'function') return g.drawRect(this, grid, ctx);

                            const sx = grid.X(this.x);
                            const syTop = grid.Y(this.y + this.h);
                            const sw = grid.screenWidth(this.w);
                            const sh = grid.screenHeight(this.h);

                            ctx.lineWidth = this.style.strokeWidth;
                            ctx.strokeStyle = this.style.stroke || '#000';

                            Shape._applyShadow(ctx, this.style);

                            let fillStyle = 'transparent';
                            if (this.style.fill && this.style.fill !== 'none') {
                                const shaded = Shape._getShadedFill(ctx, this.style.fill, sx, syTop, sw, sh);
                                fillStyle = shaded || this.style.fill;
                            }
                            ctx.fillStyle = fillStyle;

                            ctx.beginPath();
                            ctx.rect(sx, syTop, sw, sh);
                            if (this.style.fill && this.style.fill !== 'none') ctx.fill();
                            ctx.stroke();

                            Shape._clearShadow(ctx);
                        },

                        inside(grid, x, y) {
                            if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                            const sx = grid.X(this.x);
                            const syTop = grid.Y(this.y + this.h);
                            const sw = grid.screenWidth(this.w);
                            const sh = grid.screenHeight(this.h);

                            const left = Math.min(sx, sx + sw);
                            const right = Math.max(sx, sx + sw);
                            const top = Math.min(syTop, syTop + sh);
                            const bottom = Math.max(syTop, syTop + sh);

                            const lw = (this.style && Number(this.style.strokeWidth)) || 0;
                            const tol = Math.max(2, lw * 0.5);

                            const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');
                            const hasStroke = !!(this.style && this.style.stroke && this.style.stroke !== 'none' && lw > 0);

                            if (hasFill) {
                                return (x >= left - tol && x <= right + tol && y >= top - tol && y <= bottom + tol);
                            }

                            if (hasStroke) {
                                const outer = (x >= left - tol && x <= right + tol && y >= top - tol && y <= bottom + tol);
                                if (!outer) return false;
                                const inner = (x >= left + tol && x <= right - tol && y >= top + tol && y <= bottom - tol);
                                return !inner;
                            }

                            return false;
                        }
                    };

                    return finalizeSvgPrimitive(shape, json);
                }

                if (primitiveType === 'line') {
                    const style = json.style || { stroke: 'black', strokeWidth: 1 };

                    const x1 = json.x1 ?? 0;
                    const y1 = json.y1 ?? 0;
                    const x2 = json.x2 ?? 0;
                    const y2 = json.y2 ?? 0;

                    const shape = {
                        type: 'line',
                        x1, y1, x2, y2,
                        style, gfx: json.gfx,
                        rotationDeg: json.rotationDeg ?? 0,

                        draw(grid, ctx) {
                            const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                            if (g && typeof g.drawLine === 'function') return g.drawLine(this, grid, ctx);

                            ctx.strokeStyle = this.style.stroke || '#000';
                            ctx.lineWidth = this.style.strokeWidth || 1;

                            Shape._applyShadow(ctx, this.style);

                            ctx.beginPath();
                            ctx.moveTo(grid.X(this.x1), grid.Y(this.y1));
                            ctx.lineTo(grid.X(this.x2), grid.Y(this.y2));
                            ctx.stroke();

                            Shape._clearShadow(ctx);
                        },

                        inside(grid, x, y) {
                            if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                            const ax = grid.X(this.x1);
                            const ay = grid.Y(this.y1);
                            const bx = grid.X(this.x2);
                            const by = grid.Y(this.y2);

                            const lw = (this.style && Number(this.style.strokeWidth)) || 1;
                            const tol = Math.max(3, lw * 0.75);
                            const tol2 = tol * tol;

                            const minX = Math.min(ax, bx) - tol;
                            const maxX = Math.max(ax, bx) + tol;
                            const minY = Math.min(ay, by) - tol;
                            const maxY = Math.max(ay, by) + tol;
                            if (x < minX || x > maxX || y < minY || y > maxY) return false;

                            const abx = bx - ax, aby = by - ay;
                            const apx = x - ax, apy = y - ay;

                            const abLen2 = abx * abx + aby * aby;
                            if (abLen2 <= 1e-9) {
                                const dx = x - ax, dy = y - ay;
                                return (dx * dx + dy * dy) <= tol2;
                            }

                            let t = (apx * abx + apy * aby) / abLen2;
                            if (t < 0) t = 0;
                            else if (t > 1) t = 1;

                            const cx = ax + t * abx;
                            const cy = ay + t * aby;

                            const dx = x - cx, dy = y - cy;
                            return (dx * dx + dy * dy) <= tol2;
                        }
                    };

                    return finalizeSvgPrimitive(shape, json);
                }

                if (primitiveType === 'circle') {
                    const style = json.style || { fill: 'none', stroke: 'black', strokeWidth: 1 };

                    const cx = json.cx ?? 0;
                    const cy = json.cy ?? 0;
                    const r = json.r ?? 0;

                    const x = json.x ?? (cx - r);
                    const y = json.y ?? (cy - r);
                    const w = json.w ?? (2 * r);
                    const h = json.h ?? (2 * r);
                    const xf = json.xf ?? (cx + r);
                    const yf = json.yf ?? (cy + r);

                    const shape = {
                        type: 'circle',
                        cx, cy, r,
                        x, y, w, h, xf, yf,
                        style, gfx: json.gfx,
                        rotationDeg: json.rotationDeg ?? 0,

                        draw(grid, ctx) {
                            const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                            if (g && typeof g.drawCircle === 'function') return g.drawCircle(this, grid, ctx);

                            const sx = grid.X(this.cx);
                            const sy = grid.Y(this.cy);
                            const sr = grid.screenWidth(this.r);

                            ctx.strokeStyle = this.style.stroke || '#000';
                            ctx.lineWidth = this.style.strokeWidth || 1;

                            Shape._applyShadow(ctx, this.style);

                            let fillStyle = null;
                            if (this.style.fill && this.style.fill !== 'none') {
                                const shaded = Shape._getShadedFill(
                                    ctx,
                                    this.style.fill,
                                    sx - sr, sy - sr,
                                    sr * 2, sr * 2
                                );
                                fillStyle = shaded || this.style.fill;
                            }
                            if (fillStyle) ctx.fillStyle = fillStyle;

                            ctx.beginPath();
                            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                            if (fillStyle) ctx.fill();
                            ctx.stroke();

                            Shape._clearShadow(ctx);
                        },

                        inside(grid, x, y) {
                            if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                            const sx = grid.X(this.cx);
                            const sy = grid.Y(this.cy);
                            const sr = Math.abs(grid.screenWidth(this.r));

                            const dx = x - sx;
                            const dy = y - sy;
                            const dist2 = dx * dx + dy * dy;

                            const lw = (this.style && Number(this.style.strokeWidth)) || 0;
                            const tol = Math.max(2, lw * 0.5);

                            const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');

                            if (hasFill) {
                                const rOuter = sr + tol;
                                return dist2 <= rOuter * rOuter;
                            }

                            if (lw > 0) {
                                const rOuter = sr + tol;
                                const rInner = Math.max(0, sr - tol);
                                return dist2 <= rOuter * rOuter && dist2 >= rInner * rInner;
                            }

                            return false;
                        }
                    };

                    return finalizeSvgPrimitive(shape, json);
                }

                if (primitiveType === 'ellipse') {
                    const style = json.style || { fill: 'none', stroke: 'black', strokeWidth: 1 };

                    const cx = json.cx ?? 0;
                    const cy = json.cy ?? 0;
                    const rx = json.rx ?? 0;
                    const ry = json.ry ?? 0;

                    const x = json.x ?? (cx - rx);
                    const y = json.y ?? (cy - ry);
                    const w = json.w ?? (rx * 2);
                    const h = json.h ?? (ry * 2);

                    const shape = {
                        type: 'ellipse',
                        cx, cy, rx, ry,
                        x, y, w, h,
                        style, gfx: json.gfx,
                        rotationDeg: json.rotationDeg ?? 0,

                        draw(grid, ctx) {
                            const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                            if (g && typeof g.drawEllipse === 'function') return g.drawEllipse(this, grid, ctx);

                            const sx = grid.X(this.cx);
                            const sy = grid.Y(this.cy);
                            const srx = grid.screenWidth(this.rx);
                            const sry = grid.screenHeight(this.ry);

                            ctx.strokeStyle = this.style.stroke || '#000';
                            ctx.lineWidth = this.style.strokeWidth || 1;

                            Shape._applyShadow(ctx, this.style);

                            let fillStyle = null;
                            if (this.style.fill && this.style.fill !== 'none') {
                                const shaded = Shape._getShadedFill(
                                    ctx,
                                    this.style.fill,
                                    sx - srx, sy - sry,
                                    srx * 2, sry * 2
                                );
                                fillStyle = shaded || this.style.fill;
                            }

                            ctx.beginPath();
                            ctx.save();
                            ctx.translate(sx, sy);
                            ctx.scale(srx, sry);
                            ctx.arc(0, 0, 1, 0, Math.PI * 2);
                            ctx.restore();

                            if (fillStyle) {
                                ctx.fillStyle = fillStyle;
                                ctx.fill();
                            }
                            ctx.stroke();

                            Shape._clearShadow(ctx);
                        },

                        inside(grid, x, y) {
                            if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                            const sx = grid.X(this.cx);
                            const sy = grid.Y(this.cy);
                            const srx = Math.abs(grid.screenWidth(this.rx));
                            const sry = Math.abs(grid.screenHeight(this.ry));
                            if (!(srx > 0) || !(sry > 0)) return false;

                            const dx = x - sx;
                            const dy = y - sy;

                            const lw = (this.style && Number(this.style.strokeWidth)) || 0;
                            const tolPx = Math.max(2, lw * 0.5);

                            const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');

                            if (hasFill) {
                                const rxOut = srx + tolPx;
                                const ryOut = sry + tolPx;
                                const vOut = (dx * dx) / (rxOut * rxOut) + (dy * dy) / (ryOut * ryOut);
                                return vOut <= 1.0;
                            }

                            if (lw > 0) {
                                const rxOut = srx + tolPx;
                                const ryOut = sry + tolPx;
                                const vOut = (dx * dx) / (rxOut * rxOut) + (dy * dy) / (ryOut * ryOut);

                                const rxIn = Math.max(0.0001, srx - tolPx);
                                const ryIn = Math.max(0.0001, sry - tolPx);
                                const vIn = (dx * dx) / (rxIn * rxIn) + (dy * dy) / (ryIn * ryIn);

                                return vOut <= 1.0 && vIn >= 1.0;
                            }

                            return false;
                        }
                    };

                    return finalizeSvgPrimitive(shape, json);
                }

                if (primitiveType === 'polyline' || primitiveType === 'polygon') {
                    const style = json.style || { fill: 'none', stroke: 'black', strokeWidth: 1 };
                    const isClosed = primitiveType === 'polygon' || json.isClosed;
                    const pts = Array.isArray(json.pts) ? json.pts : [];

                    const shape = {
                        type: primitiveType,
                        pts,
                        isClosed,
                        style,
                        gfx: json.gfx ?? gfx,
                        rotationDeg: json.rotationDeg ?? 0,

                        draw(grid, ctx) {
                            const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                            if (g && typeof g.drawPoly === 'function') return g.drawPoly(this, grid, ctx);

                            ctx.strokeStyle = this.style.stroke || '#000';
                            ctx.lineWidth = this.style.strokeWidth || 1;

                            Shape._applyShadow(ctx, this.style);

                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            this.pts.forEach(p => {
                                const sx = grid.X(p.x);
                                const sy = grid.Y(p.y);
                                if (sx < minX) minX = sx;
                                if (sy < minY) minY = sy;
                                if (sx > maxX) maxX = sx;
                                if (sy > maxY) maxY = sy;
                            });

                            let fillStyle = 'transparent';
                            if (this.style.fill && this.style.fill !== 'none') {
                                const shaded = Shape._getShadedFill(ctx, this.style.fill, minX, minY, maxX - minX, maxY - minY);
                                fillStyle = shaded || this.style.fill;
                            }

                            ctx.beginPath();
                            this.pts.forEach((p, i) => {
                                const sx = grid.X(p.x);
                                const sy = grid.Y(p.y);
                                if (i === 0) ctx.moveTo(sx, sy);
                                else ctx.lineTo(sx, sy);
                            });

                            if (this.isClosed) ctx.closePath();

                            if (this.isClosed && this.style.fill && this.style.fill !== 'none') {
                                ctx.fillStyle = fillStyle;
                                ctx.fill();
                            }
                            ctx.stroke();

                            Shape._clearShadow(ctx);
                        },

                        inside(grid, x, y) {
                            if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;
                            if (!Array.isArray(this.pts) || this.pts.length < 2) return false;

                            const lw = (this.style && Number(this.style.strokeWidth)) || 1;
                            const tol = Math.max(3, lw * 0.75);
                            const tol2 = tol * tol;

                            const hasFill = !!(this.style && this.style.fill && this.style.fill !== 'none');
                            const hasStroke = !!(this.style && this.style.stroke && this.style.stroke !== 'none' && lw > 0);

                            const spts = this.pts
                                .map(p => ({ sx: grid.X(p.x), sy: grid.Y(p.y) }))
                                .filter(p => Number.isFinite(p.sx) && Number.isFinite(p.sy));

                            if (spts.length < 2) return false;
                            if (this.isClosed && spts.length < 3) return false;

                            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                            for (const p of spts) {
                                if (p.sx < minX) minX = p.sx;
                                if (p.sy < minY) minY = p.sy;
                                if (p.sx > maxX) maxX = p.sx;
                                if (p.sy > maxY) maxY = p.sy;
                            }
                            if (x < minX - tol || x > maxX + tol || y < minY - tol || y > maxY + tol) return false;

                            if (this.isClosed && hasFill) {
                                let inside = false;
                                for (let i = 0, j = spts.length - 1; i < spts.length; j = i++) {
                                    const xi = spts[i].sx, yi = spts[i].sy;
                                    const xj = spts[j].sx, yj = spts[j].sy;
                                    const intersect =
                                        ((yi > y) !== (yj > y)) &&
                                        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
                                    if (intersect) inside = !inside;
                                }
                                if (inside) return true;
                            }

                            const nSeg = this.isClosed ? spts.length : (spts.length - 1);
                            for (let i = 0; i < nSeg; i++) {
                                const a = spts[i];
                                const b = spts[(i + 1) % spts.length];

                                const ax = a.sx, ay = a.sy;
                                const bx = b.sx, by = b.sy;

                                const abx = bx - ax, aby = by - ay;
                                const apx = x - ax, apy = y - ay;

                                const abLen2 = abx * abx + aby * aby;
                                if (abLen2 <= 1e-9) {
                                    const dx = x - ax, dy = y - ay;
                                    if (dx * dx + dy * dy <= tol2) return true;
                                    continue;
                                }

                                let t = (apx * abx + apy * aby) / abLen2;
                                if (t < 0) t = 0;
                                else if (t > 1) t = 1;

                                const cx = ax + t * abx;
                                const cy = ay + t * aby;

                                const dx = x - cx, dy = y - cy;
                                if (dx * dx + dy * dy <= tol2) {
                                    if (!hasStroke && !hasFill) return false;
                                    return true;
                                }
                            }

                            return false;
                        }
                    };

                    return finalizeSvgPrimitive(shape, json);
                }

                if (primitiveType === 'path') {
                    const style = json.style || { fill: 'none', stroke: 'black', strokeWidth: 1 };

                    const d = String(json.d ?? '').trim();
                    if (!d) return null;

                    const x = json.x ?? 0;
                    const y = json.y ?? 0;
                    const w = json.w ?? json.width ?? 0;
                    const h = json.h ?? json.height ?? 0;

                    const shape = {
                        type: 'path',
                        d,
                        x,
                        y,
                        w,
                        h,
                        width: json.width ?? w,
                        height: json.height ?? h,
                        xf: json.xf ?? (x + w),
                        yf: json.yf ?? (y + h),
                        style,
                        className: json.className ?? json.class ?? '',
                        gfx: json.gfx ?? gfx,
                        rotationDeg: json.rotationDeg ?? 0,

                        draw(grid, ctx) {
                            debugger;
                            const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                            if (g && typeof g.drawPath === 'function') return g.drawPath(this, grid, ctx);

                            if (typeof Path2D === 'undefined') return;

                            let path2d;
                            try {
                                path2d = new Path2D(this.d);
                            } catch (err) {
                                console.warn('Invalid SVG path data:', this.d, err);
                                return;
                            }

                            ctx.strokeStyle = this.style.stroke || '#000';
                            ctx.lineWidth = this.style.strokeWidth || 1;

                            Shape._applyShadow(ctx, this.style);

                            ctx.save();

                            const baseX = Number.isFinite(this.x) ? this.x : 0;
                            const baseY = Number.isFinite(this.y) ? this.y : 0;

                            const sx = grid.X(baseX);
                            const sy = grid.Y(baseY);

                            const scaleX = Math.abs(grid.X(baseX + 1) - grid.X(baseX)) || 1;
                            const scaleY = Math.abs(grid.Y(baseY + 1) - grid.Y(baseY)) || 1;

                            ctx.translate(sx, sy);
                            ctx.scale(scaleX, scaleY);
                            ctx.translate(-baseX, -baseY);

                            let fillStyle = null;
                            if (this.style.fill && this.style.fill !== 'none') {
                                const shaded = Shape._getShadedFill(
                                    ctx,
                                    this.style.fill,
                                    grid.X(this.x || 0),
                                    grid.Y((this.y || 0) + (this.h || this.height || 0)),
                                    grid.screenWidth(this.w || this.width || 0),
                                    grid.screenHeight(this.h || this.height || 0)
                                );
                                fillStyle = shaded || this.style.fill;
                            }

                            if (fillStyle) {
                                ctx.fillStyle = fillStyle;
                                ctx.fill(path2d);
                            }

                            if (this.style.stroke && this.style.stroke !== 'none') {
                                ctx.stroke(path2d);
                            }

                            ctx.restore();
                            Shape._clearShadow(ctx);
                        },

                        inside(grid, x, y) {
                            if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                            const left = grid.X(this.x ?? 0);
                            const top = grid.Y((this.y ?? 0) + (this.h ?? this.height ?? 0));
                            const width = grid.screenWidth(this.w ?? this.width ?? 0);
                            const height = grid.screenHeight(this.h ?? this.height ?? 0);

                            const minX = Math.min(left, left + width);
                            const maxX = Math.max(left, left + width);
                            const minY = Math.min(top, top + height);
                            const maxY = Math.max(top, top + height);

                            const lw = (this.style && Number(this.style.strokeWidth)) || 1;
                            const tol = Math.max(3, lw);

                            return (
                                x >= minX - tol &&
                                x <= maxX + tol &&
                                y >= minY - tol &&
                                y <= maxY + tol
                            );
                        }
                    };

                    return finalizeSvgPrimitive(shape, json);
                }

                if (primitiveType === 'text') {
                    const style = json.style || { fill: 'black', stroke: 'none', strokeWidth: 1 };
                    const fontSize = json.fontSize ?? 10;

                    const x = json.x ?? 0;
                    const y = json.y ?? 0;

                    const textAnchor = (json.textAnchor ?? json['text-anchor'] ?? style.textAnchor ?? style['text-anchor'] ?? 'start');

                    const shape = {
                        type: 'text',
                        x,
                        y,
                        text: json.text || '',
                        style,
                        fontSize,
                        textAnchor,
                        gfx: json.gfx,
                        rotationDeg: json.rotationDeg ?? 0,

                        __defaultTextDraw(grid, ctx) {
                            const unitY = typeof grid.screenHeight === 'function'
                                ? Math.abs(grid.screenHeight(1))
                                : 1;
                            const px = Math.max(1, unitY * this.fontSize);

                            const baseColor = this.style?.fill && this.style.fill !== 'none'
                                ? this.style.fill
                                : (this.style?.stroke || 'black');

                            const text = String(this.text ?? '');

                            ctx.save();
                            ctx.font = px + 'px sans-serif';

                            const a = String(this.textAnchor || 'start').toLowerCase();
                            ctx.textAlign = 'left';
                            ctx.textAlign =
                                (a === 'middle' || a === 'center') ? 'center' :
                                    (a === 'end' || a === 'right') ? 'right' :
                                        'left';

                            ctx.textBaseline = 'alphabetic';

                            const sx = grid.X(this.x);
                            const sy = grid.Y(this.y);

                            const m = ctx.measureText(text);
                            const textW = Math.max(0, m.width || 0);

                            const ascent = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : (px * 0.8);
                            const descent = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : (px * 0.2);
                            const textH = ascent + descent;

                            const padX = Math.max(4, px * 0.35);
                            const padY = Math.max(3, px * 0.25);
                            const r = Math.max(3, px * 0.35);

                            let boxX = sx - textW / 2;


                            if (ctx.textAlign === 'center') boxX = sx - textW / 2;
                            else if (ctx.textAlign === 'right') boxX = sx - textW;

                            const boxY = sy - ascent;

                            const rx = boxX - padX;
                            const ry = boxY - padY;
                            const rw = textW + padX * 2;
                            const rh = textH + padY * 2;

                            Shape._applyShadow(ctx, {
                                shadow: { color: 'rgba(0,0,0,0.45)', blur: 4, offsetX: 2, offsetY: 2 }
                            });

                            const roundRect = (ctx, x, y, w, h, r) => {
                                const rr = Math.max(0, Math.min(r, w / 2, h / 2));
                                ctx.beginPath();
                                ctx.moveTo(x + rr, y);
                                ctx.arcTo(x + w, y, x + w, y + h, rr);
                                ctx.arcTo(x + w, y + h, x, y + h, rr);
                                ctx.arcTo(x, y + h, x, y, rr);
                                ctx.arcTo(x, y, x + w, y, rr);
                                ctx.closePath();
                            };

                            roundRect(ctx, rx, ry, rw, rh, r);

                            ctx.fillStyle = this.boxFill ?? 'rgba(255,255,255,0.90)';
                            ctx.fill();

                            ctx.lineWidth = this.boxLineWidth ?? Math.max(1, px * 0.06);
                            ctx.strokeStyle = this.boxStroke ?? 'rgba(0,0,0,0.25)';
                            ctx.stroke();

                            ctx.fillStyle = this.textFill ?? baseColor;

                            ctx.fillText(text, boxX + textW / 2, sy);

                            Shape._clearShadow(ctx);
                            ctx.restore();
                        },

                        draw(grid, ctx) {
                            const g = this.gfx || gfx || Shape.getGfx?.() || Shape.DefaultGfx;
                            if (g && typeof g.drawText === 'function') return g.drawText(this, grid, ctx);
                            return this.__defaultTextDraw(grid, ctx);
                        },

                        getPivot() {
                            return { wx: this.x, wy: this.y };
                        },

                        inside(grid, x, y, ctx) {
                            if (!grid || typeof x !== 'number' || typeof y !== 'number') return false;

                            const sx = grid.X(this.x);
                            const sy = grid.Y(this.y);

                            const unitY = typeof grid.screenHeight === 'function'
                                ? Math.abs(grid.screenHeight(1))
                                : 1;
                            const px = Math.max(1, unitY * this.fontSize);

                            const pad = Math.max(3, px * 0.15);

                            let textW = 0;
                            let textH = px;

                            const str = String(this.text ?? '');
                            if (ctx && typeof ctx.measureText === 'function') {
                                try {
                                    const prevFont = ctx.font;
                                    const prevAlign = ctx.textAlign;
                                    const prevBase = ctx.textBaseline;
                                    ctx.font = px + 'px sans-serif';
                                    ctx.textBaseline = 'alphabetic';
                                    const m = ctx.measureText(str);
                                    textW = Number(m.width) || 0;
                                    const asc = Number(m.actualBoundingBoxAscent);
                                    const desc = Number(m.actualBoundingBoxDescent);
                                    if (Number.isFinite(asc) && Number.isFinite(desc) && (asc + desc) > 0) {
                                        textH = asc + desc;
                                    } else {
                                        textH = px * 1.1;
                                    }

                                    ctx.font = prevFont;
                                    ctx.textAlign = prevAlign;
                                    ctx.textBaseline = prevBase;
                                } catch {
                                }
                            }

                            if (!(textW > 0)) {
                                const chars = Math.max(1, str.length);
                                textW = chars * px * 0.6;
                                textH = px * 1.1;
                            }

                            const a = String(this.textAnchor || 'start').toLowerCase();
                            let left, right;
                            if (a === 'middle' || a === 'center') {
                                left = sx - textW / 2;
                                right = sx + textW / 2;
                            } else if (a === 'end' || a === 'right') {
                                left = sx - textW;
                                right = sx;
                            } else {
                                left = sx;
                                right = sx + textW;
                            }

                            const top = sy - textH * 0.8;
                            const bottom = top + textH;

                            return (x >= left - pad && x <= right + pad && y >= top - pad && y <= bottom + pad);
                        }
                    };

                    return finalizeSvgPrimitive(shape, json);
                }

                Shape._readableRotationDeg = (shape) => {
                    if (typeof shape.getRotationDeg === 'function') return shape.getRotationDeg();
                    if (typeof shape.rotationDeg === 'number') return shape.rotationDeg;
                    if (typeof shape.rotation === 'number') return shape.rotation;
                    if (typeof shape.rot === 'number') return shape.rot;
                    if (typeof shape.angleDeg === 'number') return shape.angleDeg;
                    return 0;
                };

                Shape._baseToJSON = (shape) => {
                    const json = {
                        type: shape.type ?? null,

                        ...(shape.x != null ? { x: shape.x } : {}),
                        ...(shape.y != null ? { y: shape.y } : {}),
                        ...(shape.w != null ? { w: shape.w } : {}),
                        ...(shape.h != null ? { h: shape.h } : {}),
                        ...(shape.xf != null ? { xf: shape.xf } : {}),
                        ...(shape.yf != null ? { yf: shape.yf } : {}),

                        ...(shape.style != null ? { style: shape.style } : {}),

                        ...(shape.gfx != null ? { gfx: { 'path': shape.gfx.path } } : {}),

                        ...(shape.name != null ? { name: shape.name } : {}),

                        ...(shape.d != null ? { d: shape.d } : {}),
                        ...(shape.width != null ? { width: shape.width } : {}),
                        ...(shape.height != null ? { height: shape.height } : {}),
                        ...(shape.className != null ? { className: shape.className } : {}),

                        rotationDeg: Shape._readableRotationDeg(shape),
                    };

                    if (shape.id != null) json.id = shape.id;
                    if (shape.z != null) json.z = shape.z;
                    if (shape.locked != null) json.locked = shape.locked;
                    if (shape.hidden != null) json.hidden = shape.hidden;

                    return json;
                };

                return null;
            }

            getLastTouched() {
            }

            static _toSvgStringFromJSON(json, opts = {}, gfx = Shape.getGfx?.() || Shape.DefaultGfx) {
                const options = {
                    includeOuterSvg: true,
                    padding: 0,
                    flipY: false,
                    pretty: false,
                    ...opts,
                };

                const esc = (s) =>
                    String(s ?? "")
                        .replaceAll("&", "&amp;")
                        .replaceAll("<", "&lt;")
                        .replaceAll(">", "&gt;")
                        .replaceAll('"', "&quot;")
                        .replaceAll("'", "&apos;");

                const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

                const styleToAttrs = (style = {}) => {
                    const a = [];
                    const fill = style.fill ?? "none";
                    const stroke = style.stroke ?? "none";
                    const sw = style.strokeWidth ?? style["stroke-width"] ?? 1;

                    a.push(`fill="${esc(fill)}"`);
                    a.push(`stroke="${esc(stroke)}"`);
                    a.push(`stroke-width="${esc(sw)}"`);

                    if (style.opacity != null) a.push(`opacity="${esc(style.opacity)}"`);
                    if (style.fillOpacity != null) a.push(`fill-opacity="${esc(style.fillOpacity)}"`);
                    if (style.strokeOpacity != null) a.push(`stroke-opacity="${esc(style.strokeOpacity)}"`);
                    if (style.strokeLineCap != null) a.push(`stroke-linecap="${esc(style.strokeLineCap)}"`);
                    if (style.strokeLineJoin != null) a.push(`stroke-linejoin="${esc(style.strokeLineJoin)}"`);
                    if (style.strokeDasharray != null) a.push(`stroke-dasharray="${esc(style.strokeDasharray)}"`);

                    return a.join(" ");
                };

                const readRotationDeg = (j) => {
                    if (!j || typeof j !== "object") return 0;
                    if (Number.isFinite(+j.rotationDeg)) return +j.rotationDeg;
                    if (Number.isFinite(+j.rotation)) return +j.rotation;
                    if (Number.isFinite(+j.rot)) return +j.rot;
                    if (Number.isFinite(+j.angleDeg)) return +j.angleDeg;
                    return 0;
                };

                const applyRotate = (svg, deg, cx, cy) => {
                    const d = num(deg, 0);
                    if (!d) return svg;
                    const t = ` transform="rotate(${esc(d)} ${esc(num(cx))} ${esc(num(cy))})"`;

                    return svg.replace(/^(<\w+)(\s|>)/, `$1${t}$2`);
                };

                const boundsUnion = (A, B) => {
                    if (!A) return B;
                    if (!B) return A;
                    return {
                        minX: Math.min(A.minX, B.minX),
                        minY: Math.min(A.minY, B.minY),
                        maxX: Math.max(A.maxX, B.maxX),
                        maxY: Math.max(A.maxY, B.maxY),
                    };
                };

                const boundsFromRect = (x, y, w, h) => {
                    const x0 = num(x), y0 = num(y), ww = num(w), hh = num(h);
                    const x1 = x0 + ww, y1 = y0 + hh;
                    return { minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) };
                };

                const boundsFromPts = (pts) => {
                    if (!Array.isArray(pts) || pts.length === 0) return null;
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const p of pts) {
                        const x = num(p?.x), y = num(p?.y);
                        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                        minX = Math.min(minX, x); minY = Math.min(minY, y);
                        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                    }
                    if (!Number.isFinite(minX)) return null;
                    return { minX, minY, maxX, maxY };
                };

                const primitiveTypeOf = (rawType) => {
                    const typeLower = String(rawType || "").toLowerCase();
                    if (!typeLower) return null;
                    return (typeLower.startsWith("svg_") && typeLower !== "svg_group")
                        ? typeLower.slice(4)
                        : typeLower;
                };

                const emitRect = (j) => {
                    const x = num(j.x), y = num(j.y), w = num(j.w), h = num(j.h);
                    const style = j.style || { fill: "none", stroke: "black", strokeWidth: 1 };
                    let el = `<rect x="${esc(x)}" y="${esc(y)}" width="${esc(w)}" height="${esc(h)}" ${styleToAttrs(style)} />`;
                    const deg = readRotationDeg(j);
                    if (deg) el = applyRotate(el, deg, x + w / 2, y + h / 2);
                    return { svg: el, bounds: boundsFromRect(x, y, w, h) };
                };

                const emitLine = (j) => {
                    const x1 = num(j.x1), y1 = num(j.y1), x2 = num(j.x2), y2 = num(j.y2);
                    const style = j.style || { stroke: "black", strokeWidth: 1 };
                    let el = `<line x1="${esc(x1)}" y1="${esc(y1)}" x2="${esc(x2)}" y2="${esc(y2)}" ${styleToAttrs(style)} fill="none" />`;
                    const deg = readRotationDeg(j);
                    if (deg) el = applyRotate(el, deg, (x1 + x2) / 2, (y1 + y2) / 2);
                    const b = {
                        minX: Math.min(x1, x2), minY: Math.min(y1, y2),
                        maxX: Math.max(x1, x2), maxY: Math.max(y1, y2),
                    };
                    return { svg: el, bounds: b };
                };

                const emitCircle = (j) => {
                    const cx = num(j.cx), cy = num(j.cy), r = num(j.r);
                    const style = j.style || { fill: "none", stroke: "black", strokeWidth: 1 };
                    let el = `<circle cx="${esc(cx)}" cy="${esc(cy)}" r="${esc(r)}" ${styleToAttrs(style)} />`;
                    const deg = readRotationDeg(j);
                    if (deg) el = applyRotate(el, deg, cx, cy);
                    return { svg: el, bounds: boundsFromRect(cx - r, cy - r, r * 2, r * 2) };
                };

                const emitEllipse = (j) => {
                    const cx = num(j.cx), cy = num(j.cy), rx = num(j.rx), ry = num(j.ry);
                    const style = j.style || { fill: "none", stroke: "black", strokeWidth: 1 };
                    let el = `<ellipse cx="${esc(cx)}" cy="${esc(cy)}" rx="${esc(rx)}" ry="${esc(ry)}" ${styleToAttrs(style)} />`;
                    const deg = readRotationDeg(j);
                    if (deg) el = applyRotate(el, deg, cx, cy);
                    return { svg: el, bounds: boundsFromRect(cx - rx, cy - ry, rx * 2, ry * 2) };
                };

                const emitPoly = (j, kind) => {
                    const style = j.style || { fill: "none", stroke: "black", strokeWidth: 1 };
                    const pts = Array.isArray(j.pts) ? j.pts : [];
                    const points = pts.map(p => `${num(p?.x)},${num(p?.y)}`).join(" ");
                    let el = `<${kind} points="${esc(points)}" ${styleToAttrs(style)} />`;
                    const b = boundsFromPts(pts);
                    const deg = readRotationDeg(j);
                    if (deg && b) el = applyRotate(el, deg, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
                    return { svg: el, bounds: b };
                };

                const emitText = (j) => {
                    const x = num(j.x), y = num(j.y);
                    const style = j.style || { fill: "black", stroke: "none", strokeWidth: 1 };
                    const fontSize = num(j.fontSize, 10);
                    const anchor = j.textAnchor ?? j["text-anchor"] ?? style.textAnchor ?? style["text-anchor"] ?? "start";
                    const text = esc(j.text ?? "");

                    let el = `<text x="${esc(x)}" y="${esc(y)}" font-size="${esc(fontSize)}" text-anchor="${esc(anchor)}" ${styleToAttrs(style)}>${text}</text>`;
                    const deg = readRotationDeg(j);
                    if (deg) el = applyRotate(el, deg, x, y);

                    const approxW = Math.max(1, String(j.text ?? "").length) * fontSize * 0.6;
                    const approxH = fontSize * 1.1;
                    const b = boundsFromRect(x, y - approxH, approxW, approxH);
                    return { svg: el, bounds: b };
                };

                const emitNoteLike = (j, kind) => {

                    const g = j.gfx || gfx;
                    const hookName =
                        (kind === "note") ? "toSvgNote" :
                            (kind.startsWith("arrow-note")) ? "toSvgArrowNote" :
                                (kind.startsWith("simpler-note")) ? "toSvgSimpleNote" : null;

                    if (hookName && g && typeof g[hookName] === "function") {
                        const out = g[hookName](j);
                        if (typeof out === "string") {

                            const b = (j.x != null && j.y != null && j.w != null && j.h != null) ? boundsFromRect(j.x, j.y, j.w, j.h) : null;
                            return { svg: out, bounds: b };
                        }
                        if (out && typeof out === "object" && typeof out.svg === "string") return out;
                    }

                    const x = num(j.x), y = num(j.y);
                    const w = num(j.w ?? (num(j.xf) - x), 1);
                    const h = num(j.h ?? (num(j.yf) - y), 1);
                    const fill = j.color ?? (j.style?.fill ?? "#fff7a8");
                    const style = { ...(j.style || {}), fill, stroke: j.style?.stroke ?? "rgba(0,0,0,0.35)", strokeWidth: j.style?.strokeWidth ?? 1 };
                    const r = Math.max(0, Math.min(w, h) * 0.08);

                    let body = `<rect x="${esc(x)}" y="${esc(y)}" width="${esc(w)}" height="${esc(h)}" rx="${esc(r)}" ry="${esc(r)}" ${styleToAttrs(style)} />`;

                    if (String(kind).startsWith("arrow-note")) {
                        const dir = String(j.arrowDirection ?? "right").toLowerCase();
                        const cx = x + w / 2, cy = y + h / 2;
                        const s = Math.max(2, Math.min(w, h) * 0.25);
                        let pts;
                        if (dir === "left") pts = [{ x: x, y: cy }, { x: x - s, y: cy - s / 2 }, { x: x - s, y: cy + s / 2 }];
                        if (dir === "up") pts = [{ x: cx, y: y }, { x: cx - s / 2, y: y - s }, { x: cx + s / 2, y: y - s }];
                        if (dir === "down") pts = [{ x: cx, y: y + h }, { x: cx - s / 2, y: y + h + s }, { x: cx + s / 2, y: y + h + s }];
                        if (!pts) pts = [{ x: x + w, y: cy }, { x: x + w + s, y: cy - s / 2 }, { x: x + w + s, y: cy + s / 2 }];
                        const points = pts.map(p => `${p.x},${p.y}`).join(" ");
                        body += `\n<polygon points="${esc(points)}" ${styleToAttrs({ fill: style.stroke, stroke: "none" })} />`;
                    }

                    const desc = (j.comment || j.name || j.url) ? `<desc>${esc(JSON.stringify({ name: j.name ?? null, comment: j.comment ?? "", url: j.url ?? null }))}</desc>` : "";
                    let el = `<g data-type="${esc(kind)}">${desc}${body}</g>`;

                    const deg = readRotationDeg(j);
                    if (deg) el = el.replace(
                        /^<g\b/,
                        `<g transform="rotate(${esc(deg)} ${esc(x + w / 2)} ${esc(y + h / 2)})"`
                    );

                    return { svg: el, bounds: boundsFromRect(x, y, w, h) };
                };

                const build = (j) => {
                    if (!j || typeof j !== "object") return null;
                    const rawType = j.type;
                    if (!rawType) return null;

                    const typeLower = String(rawType).toLowerCase();
                    const prim = primitiveTypeOf(rawType);
                    if (!prim) return null;

                    if (typeLower === "svg_group") {
                        const kids = Array.isArray(j.shapes) ? j.shapes.map(build).filter(Boolean) : [];
                        const innerSvg = kids.map(k => k.svg).join(options.pretty ? "\n" : "");
                        const b = kids.reduce((acc, k) => boundsUnion(acc, k.bounds), null);
                        const el = `<g data-type="svg_group">${innerSvg}</g>`;
                        return { svg: el, bounds: b };
                    }

                    switch (prim) {
                        case "rect": return emitRect(j);
                        case "line": return emitLine(j);
                        case "circle": return emitCircle(j);
                        case "ellipse": return emitEllipse(j);
                        case "polyline": return emitPoly(j, "polyline");
                        case "polygon": return emitPoly(j, "polygon");
                        case "text": return emitText(j);

                        case "note": return emitNoteLike(j, "note");

                        default:
                            if (String(prim).startsWith("arrow-note")) return emitNoteLike(j, prim);
                            if (String(prim).startsWith("simpler-note")) return emitNoteLike(j, prim);
                            return null;
                    }
                };

                const built = build(json);
                if (!built) return null;

                if (!options.includeOuterSvg) return built.svg;

                const b = built.bounds || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
                const pad = num(options.padding, 0);
                const minX = b.minX - pad, minY = b.minY - pad;
                const maxX = b.maxX + pad, maxY = b.maxY + pad;
                const vbW = Math.max(1e-9, maxX - minX);
                const vbH = Math.max(1e-9, maxY - minY);

                const content = options.flipY
                    ? `<g transform="translate(0 ${esc(minY + maxY)}) scale(1 -1)">${built.svg}</g>`
                    : built.svg;

                const prettyNL = options.pretty ? "\n" : "";
                return (
                    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(minX)} ${esc(minY)} ${esc(vbW)} ${esc(vbH)}">` +
                    prettyNL +
                    content +
                    prettyNL +
                    `</svg>`
                );
            }

        }

        resolve(Shape)
    })
}
