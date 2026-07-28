import os, json, math

OUT = '/mnt/data/molecule_tools_example_style'

header = "function (platetrack, formula) {\n\n    try {\n\n"
footer = "\n    } catch (err) {\n        console.error('Draw tool failed:', err);\n        platetrack.wb(null);\n    }\n}"

HELPERS = r'''
        const addAtomLabel = (Shape, Glyph, tx, ty, label) => {
            try {
                const svgNS = 'http://www.w3.org/2000/svg';
                const el = document.createElementNS(svgNS, 'text');
                el.setAttribute('x', String(tx));
                el.setAttribute('y', String(-ty));
                el.setAttribute('text-anchor', 'middle');
                el.setAttribute('font-size', '14');
                el.setAttribute('fill', '#111');
                el.textContent = label;
                const textShape = Shape._makeText(
                    el,
                    Shape.getGfx?.() || Shape.DefaultGfx
                );
                if (textShape) {
                    textShape.textFill = '#111';
                    textShape.boxFill = 'rgba(255,255,255,0.90)';
                    textShape.boxStroke = 'rgba(0,0,0,0.25)';
                    textShape.boxLineWidth = 1;
                    platetrack.addGlyphNoSelect(new Glyph(textShape));
                }
            } catch (err) {
                console.warn('Atom label failed:', err);
            }
        };

        const addBond = (Shape, Glyph, x1, y1, x2, y2, style = {}) => {
            const line = Shape._makeLineFromWorld(
                x1, y1,
                x2, y2,
                Object.assign({
                    stroke: '#0096ff',
                    strokeWidth: 2,
                    'stroke-linecap': 'round'
                }, style),
                Shape.getGfx?.() || Shape.DefaultGfx
            );
            if (line) {
                platetrack.addGlyphNoSelect(new Glyph(line));
            }
        };

        const getBondLen = (grid, pxTarget = 120) => {
            const worldPerPxX = Math.abs(grid.Xwc(1) - grid.Xwc(0)) || 0.01;
            return pxTarget * worldPerPxX;
        };

        const hexPts = (cx, cy, r, startDeg = -30) => {
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const a = (startDeg + i * 60) * Math.PI / 180;
                pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
            }
            return pts;
        };

        const ringFromPts = (Shape, Glyph, pts, bondStyle = {}) => {
            for (let i = 0; i < pts.length; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % pts.length];
                addBond(Shape, Glyph, p1.x, p1.y, p2.x, p2.y, bondStyle);
            }
        };

        const chainPts = (cx, cy, step, anglesDeg) => {
            const pts = [{ x: cx, y: cy }];
            let x = cx, y = cy;
            for (const deg of anglesDeg) {
                const a = deg * Math.PI / 180;
                x += step * Math.cos(a);
                y += step * Math.sin(a);
                pts.push({ x, y });
            }
            return pts;
        };
'''


def wrap_mouse_down(body, tool_id, err_label):
    return header + f"""        let hd = {{
            priority: true,
            id: '{tool_id}',

            mouseDownListener: async (x, y) => {{
                try {{
                    const grid = platetrack.grid;
                    const wx = grid.Xwc(x);
                    const wy = grid.Ywc(y);

                    let Shape = await exec('flexigraph/shapes/shape.js');
                    const Glyph = await exec('baja/draw/glyph.js');
{HELPERS}
{body}
                    platetrack.wb(null);

                }} catch (err) {{
                    console.error('{err_label} failed:', err);
                    platetrack.wb(null);
                }}
            }},

            mouseMoveListener: () => {{}},
            mouseUpListener: () => {{}},
            close: () => {{}}
        }};

        setTimeout(() => {{
            platetrack.wb(hd);
        }}, 50);""" + footer


def standalone_chain(name, labels, angles, extras=None):
    body = """
                    const bondLen = getBondLen(grid, 120);
                    const pts = chainPts(wx, wy, bondLen, [%s]);
                    for (let i = 0; i < pts.length - 1; i++) {
                        addBond(Shape, Glyph, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                    }
    """ % ", ".join(str(a) for a in angles)
    for idx, label in labels.items():
        body += f"                    addAtomLabel(Shape, Glyph, pts[{idx}].x, pts[{idx}].y, '{label}');\n"
    if extras:
        body += extras + "\n"
    return wrap_mouse_down(body, name.replace('.js',''), name.replace('.js','').replace('-', ' '))


def ring_tool(name, hetero=None, aromatic=False, startDeg=-30):
    body = f"""
                    const bondLen = getBondLen(grid, 120);
                    const r = bondLen;
                    const pts = hexPts(wx, wy, r, {startDeg});
                    ringFromPts(Shape, Glyph, pts);
    """
    if aromatic:
        body += "                    for (let i of [0, 2, 4]) { const p1 = pts[i]; const p2 = pts[(i+1)%6]; const dx = p2.x - p1.x; const dy = p2.y - p1.y; const len = Math.sqrt(dx*dx + dy*dy) || 1; const nx = -dy / len; const ny = dx / len; const inset = bondLen * 0.12; addBond(Shape, Glyph, p1.x + nx*inset, p1.y + ny*inset, p2.x + nx*inset, p2.y + ny*inset, { strokeWidth: 1.5 }); }\n"
    if hetero:
        for idx, label in hetero.items():
            body += f"                    addAtomLabel(Shape, Glyph, pts[{idx}].x, pts[{idx}].y, '{label}');\n"
    return wrap_mouse_down(body, name.replace('.js',''), name.replace('.js','').replace('-', ' '))


def halide_tool(name, label):
    body = f"""
                    const bondLen = getBondLen(grid, 120);
                    const x2 = wx + bondLen;
                    const y2 = wy;
                    addBond(Shape, Glyph, wx, wy, x2, y2);
                    addAtomLabel(Shape, Glyph, x2, y2, '{label}');
    """
    return wrap_mouse_down(body, name.replace('.js',''), name.replace('.js','').replace('-', ' '))


def carbonyl_tool(name, tail_label=None, right_atoms=None, extra_single=False):
    body = """
                    const bondLen = getBondLen(grid, 120);
                    const c = { x: wx, y: wy };
                    const o = { x: wx + bondLen, y: wy };
                    const off = bondLen * 0.08;
                    addBond(Shape, Glyph, c.x, c.y + off, o.x, o.y + off);
                    addBond(Shape, Glyph, c.x, c.y - off, o.x, o.y - off);
                    addAtomLabel(Shape, Glyph, o.x, o.y, 'O');
    """
    if extra_single:
        body += "                    const left = { x: wx - bondLen, y: wy }; addBond(Shape, Glyph, left.x, left.y, c.x, c.y);\n"
    if tail_label:
        body += f"                    const t = {{ x: wx - bondLen, y: wy }}; addBond(Shape, Glyph, t.x, t.y, c.x, c.y); addAtomLabel(Shape, Glyph, t.x, t.y, '{tail_label}');\n"
    if right_atoms:
        for dxmul, dyfrac, label in right_atoms:
            body += f"                    const p = {{ x: wx + bondLen*{dxmul}, y: wy + bondLen*{dyfrac} }}; addBond(Shape, Glyph, o.x, o.y, p.x, p.y); addAtomLabel(Shape, Glyph, p.x, p.y, '{label}');\n"
    return wrap_mouse_down(body, name.replace('.js',''), name.replace('.js','').replace('-', ' '))


def extend_tool(name):
    code = r'''function (platetrack, formula) {

    try {

        let clickIndex = 0;

        let hd = {
            startWx: null,
            startWy: null,
            endWx: null,
            endWy: null,
            isDrawing: false,
            priority: true,
            id: 'glyph-override-extend-carbon-bond',

            draw: (grid, ctx) => {
                if (!hd.isDrawing) return;
                if (![hd.startWx, hd.startWy, hd.endWx, hd.endWy].every(v => typeof v === 'number' && Number.isFinite(v))) return;

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
                const grid = platetrack.grid;
                const wx = grid.Xwc(x);
                const wy = grid.Ywc(y);
                clickIndex++;

                if (clickIndex === 1) {
                    const node = findNearestExistingNode(platetrack, wx, wy, grid);
                    if (!node) {
                        clickIndex = 0;
                        hd.isDrawing = false;
                        hd.startWx = null;
                        hd.startWy = null;
                        hd.endWx = null;
                        hd.endWy = null;
                        return;
                    }
                    hd.startWx = node.x;
                    hd.startWy = node.y;
                    const preview = snappedEndpointFromPointer(grid, hd.startWx, hd.startWy, wx, wy);
                    hd.endWx = preview.x;
                    hd.endWy = preview.y;
                    hd.isDrawing = true;
                    return;
                }

                if (clickIndex === 2) {
                    const snapped = snappedEndpointFromPointer(grid, hd.startWx, hd.startWy, wx, wy);
                    hd.endWx = snapped.x;
                    hd.endWy = snapped.y;

                    let Shape = await exec('flexigraph/shapes/shape.js');
                    const Glyph = await exec('baja/draw/glyph.js');

                    const line = Shape._makeLineFromWorld(
                        hd.startWx, hd.startWy,
                        hd.endWx, hd.endWy,
                        { stroke: '#0096ff', strokeWidth: 2, 'stroke-linecap': 'round' },
                        Shape.getGfx?.() || Shape.DefaultGfx
                    );

                    if (line) {
                        const glyph = new Glyph(line);
                        platetrack.addGlyphNoSelect(glyph);
                    }

                    platetrack.wb(null);
                }
            },

            mouseMoveListener: (x, y) => {
                if (!hd.isDrawing) return;
                const grid = platetrack.grid;
                const wx = grid.Xwc(x);
                const wy = grid.Ywc(y);
                const snapped = snappedEndpointFromPointer(grid, hd.startWx, hd.startWy, wx, wy);
                hd.endWx = snapped.x;
                hd.endWy = snapped.y;
            },

            mouseUpListener: () => {},
            close: () => { hd.isDrawing = false; }
        };

        function snappedEndpointFromPointer(grid, startWx, startWy, rawWx, rawWy) {
            const pxTarget = 120;
            const worldPerPxX = Math.abs(grid.Xwc(1) - grid.Xwc(0)) || 0.01;
            const bondLen = pxTarget * worldPerPxX;
            let dx = rawWx - startWx;
            let dy = rawWy - startWy;
            if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) { dx = 1; dy = 0; }
            const step = 30 * Math.PI / 180;
            const angle = Math.atan2(dy, dx);
            const snappedAngle = Math.round(angle / step) * step;
            return {
                x: startWx + bondLen * Math.cos(snappedAngle),
                y: startWy + bondLen * Math.sin(snappedAngle)
            };
        }

        function findNearestExistingNode(platetrack, wx, wy, grid) {
            const hitRadiusPx = 20;
            const hitRadiusWorld = Math.abs(grid.Xwc(hitRadiusPx) - grid.Xwc(0)) || 0.2;
            const candidates = collectLineEndpoints(platetrack);
            if (!candidates.length) return null;
            let best = null;
            let bestDist = Infinity;
            for (const p of candidates) {
                const dx = p.x - wx;
                const dy = p.y - wy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < hitRadiusWorld && d < bestDist) {
                    best = p;
                    bestDist = d;
                }
            }
            return best;
        }

        function collectLineEndpoints(platetrack) {
            const pts = [];
            const seen = new Set();
            const addPt = (x, y) => {
                if (!(typeof x === 'number' && Number.isFinite(x))) return;
                if (!(typeof y === 'number' && Number.isFinite(y))) return;
                const key = `${x.toFixed(4)}|${y.toFixed(4)}`;
                if (seen.has(key)) return;
                seen.add(key);
                pts.push({ x, y });
            };
            const visitShape = (shape) => {
                if (!shape) return;
                if (shape.type === 'line') {
                    addPt(shape.x1, shape.y1);
                    addPt(shape.x2, shape.y2);
                }
                if ('x1' in shape && 'y1' in shape) addPt(shape.x1, shape.y1);
                if ('x2' in shape && 'y2' in shape) addPt(shape.x2, shape.y2);
                if (Array.isArray(shape.shapes)) {
                    for (const child of shape.shapes) visitShape(child);
                }
                if (shape.shape && shape.shape !== shape) visitShape(shape.shape);
            };
            const pools = [platetrack?.glyphs, platetrack?.drawables, platetrack?.items, platetrack?.wbv?.glyphs, platetrack?.model?.glyphs];
            for (const pool of pools) {
                if (!Array.isArray(pool)) continue;
                for (const g of pool) visitShape(g);
            }
            return pts;
        }

        setTimeout(() => {
            platetrack.wb(hd);
        }, 50);

    } catch (err) {
        console.error('Extend carbon bond failed:', err);
        platetrack.wb(null);
    }
}'''
    return code

files = {}
files['draw-methyl-group.js'] = standalone_chain('draw-methyl-group.js', {}, [0])
files['draw-ethyl-group.js'] = standalone_chain('draw-ethyl-group.js', {}, [0, -60])
files['draw-propyl-group.js'] = standalone_chain('draw-propyl-group.js', {}, [0, -60, 0])
files['draw-hydroxyl-group.js'] = standalone_chain('draw-hydroxyl-group.js', {1:'O'}, [0])
files['draw-amine-group.js'] = standalone_chain('draw-amine-group.js', {1:'N'}, [0])
files['draw-dimethylamine-group.js'] = standalone_chain('draw-dimethylamine-group.js', {1:'N'}, [0]) + ''
files['draw-carboxyl-group.js'] = carbonyl_tool('draw-carboxyl-group.js', right_atoms=[(2,0,'OH')])
files['draw-amide-group.js'] = carbonyl_tool('draw-amide-group.js', right_atoms=[(2,0,'NH2')])
files['draw-ester-group.js'] = carbonyl_tool('draw-ester-group.js', right_atoms=[(2,0,'OR')])
files['draw-ether-group.js'] = standalone_chain('draw-ether-group.js', {1:'O'}, [0,0])
files['draw-aldehyde-group.js'] = carbonyl_tool('draw-aldehyde-group.js')
files['draw-ketone-group.js'] = carbonyl_tool('draw-ketone-group.js', extra_single=True)
files['draw-alkene-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const off = bondLen * 0.08;
                    addBond(Shape, Glyph, wx, wy + off, wx + bondLen, wy + off);
                    addBond(Shape, Glyph, wx, wy - off, wx + bondLen, wy - off);
""", 'glyph-override-draw-alkene-group', 'alkene group draw')
files['draw-alkyne-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const off = bondLen * 0.10;
                    addBond(Shape, Glyph, wx, wy, wx + bondLen, wy);
                    addBond(Shape, Glyph, wx, wy + off, wx + bondLen, wy + off, { strokeWidth: 1.5 });
                    addBond(Shape, Glyph, wx, wy - off, wx + bondLen, wy - off, { strokeWidth: 1.5 });
""", 'glyph-override-draw-alkyne-group', 'alkyne group draw')
files['draw-nitrile-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const off = bondLen * 0.10;
                    const x2 = wx + bondLen;
                    addBond(Shape, Glyph, wx, wy, x2, wy);
                    addBond(Shape, Glyph, wx, wy + off, x2, wy + off, { strokeWidth: 1.5 });
                    addBond(Shape, Glyph, wx, wy - off, x2, wy - off, { strokeWidth: 1.5 });
                    addAtomLabel(Shape, Glyph, x2, wy, 'N');
""", 'glyph-override-draw-nitrile-group', 'nitrile group draw')
files['draw-nitro-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const n = { x: wx + bondLen, y: wy };
                    addBond(Shape, Glyph, wx, wy, n.x, n.y);
                    addAtomLabel(Shape, Glyph, n.x, n.y, 'N');
                    const o1 = { x: n.x + bondLen * 0.85, y: n.y + bondLen * 0.5 };
                    const o2 = { x: n.x + bondLen * 0.85, y: n.y - bondLen * 0.5 };
                    addBond(Shape, Glyph, n.x, n.y, o1.x, o1.y);
                    addBond(Shape, Glyph, n.x, n.y, o2.x, o2.y);
                    addAtomLabel(Shape, Glyph, o1.x, o1.y, 'O');
                    addAtomLabel(Shape, Glyph, o2.x, o2.y, 'O');
""", 'glyph-override-draw-nitro-group', 'nitro group draw')
files['draw-sulfonamide-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const s = { x: wx + bondLen, y: wy };
                    addBond(Shape, Glyph, wx, wy, s.x, s.y);
                    addAtomLabel(Shape, Glyph, s.x, s.y, 'S');
                    const o1 = { x: s.x + bondLen * 0.7, y: s.y + bondLen * 0.45 };
                    const o2 = { x: s.x + bondLen * 0.7, y: s.y - bondLen * 0.45 };
                    const n = { x: s.x + bondLen * 0.95, y: s.y };
                    addBond(Shape, Glyph, s.x, s.y, o1.x, o1.y);
                    addBond(Shape, Glyph, s.x, s.y, o2.x, o2.y);
                    addBond(Shape, Glyph, s.x, s.y, n.x, n.y);
                    addAtomLabel(Shape, Glyph, o1.x, o1.y, 'O');
                    addAtomLabel(Shape, Glyph, o2.x, o2.y, 'O');
                    addAtomLabel(Shape, Glyph, n.x, n.y, 'NH2');
""", 'glyph-override-draw-sulfonamide-group', 'sulfonamide group draw')
files['draw-sulfone-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const s = { x: wx + bondLen, y: wy };
                    addBond(Shape, Glyph, wx, wy, s.x, s.y);
                    addBond(Shape, Glyph, s.x, s.y, s.x + bondLen, s.y);
                    addAtomLabel(Shape, Glyph, s.x, s.y, 'S');
                    const o1 = { x: s.x + bondLen * 0.6, y: s.y + bondLen * 0.5 };
                    const o2 = { x: s.x + bondLen * 0.6, y: s.y - bondLen * 0.5 };
                    addBond(Shape, Glyph, s.x, s.y, o1.x, o1.y);
                    addBond(Shape, Glyph, s.x, s.y, o2.x, o2.y);
                    addAtomLabel(Shape, Glyph, o1.x, o1.y, 'O');
                    addAtomLabel(Shape, Glyph, o2.x, o2.y, 'O');
""", 'glyph-override-draw-sulfone-group', 'sulfone group draw')
files['draw-thiol-group.js'] = standalone_chain('draw-thiol-group.js', {1:'S'}, [0])
files['draw-phosphate-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const p = { x: wx + bondLen, y: wy };
                    addBond(Shape, Glyph, wx, wy, p.x, p.y);
                    addAtomLabel(Shape, Glyph, p.x, p.y, 'P');
                    const arms = [
                        { x: p.x + bondLen * 0.7, y: p.y + bondLen * 0.5, label: 'O' },
                        { x: p.x + bondLen * 0.7, y: p.y - bondLen * 0.5, label: 'O' },
                        { x: p.x, y: p.y + bondLen * 0.75, label: 'O' }
                    ];
                    for (const a of arms) { addBond(Shape, Glyph, p.x, p.y, a.x, a.y); addAtomLabel(Shape, Glyph, a.x, a.y, a.label); }
""", 'glyph-override-draw-phosphate-group', 'phosphate group draw')
files['draw-fluoro-group.js'] = halide_tool('draw-fluoro-group.js','F')
files['draw-chloro-group.js'] = halide_tool('draw-chloro-group.js','Cl')
files['draw-bromo-group.js'] = halide_tool('draw-bromo-group.js','Br')
files['draw-iodo-group.js'] = halide_tool('draw-iodo-group.js','I')
files['draw-phenyl-group.js'] = ring_tool('draw-phenyl-group.js', aromatic=True)
files['draw-benzene-ring.js'] = ring_tool('draw-benzene-ring.js', aromatic=True)
files['draw-cyclohexane-ring.js'] = ring_tool('draw-cyclohexane-ring.js')
files['draw-morpholine-ring.js'] = ring_tool('draw-morpholine-ring.js', hetero={0:'O', 3:'N'})
files['draw-piperazine-ring.js'] = ring_tool('draw-piperazine-ring.js', hetero={0:'N', 3:'N'})
files['extend-carbon-bond.js'] = extend_tool('extend-carbon-bond.js')

# special dimethylamine overwrite for branched geometry
files['draw-dimethylamine-group.js'] = wrap_mouse_down("""
                    const bondLen = getBondLen(grid, 120);
                    const n = { x: wx + bondLen, y: wy };
                    addBond(Shape, Glyph, wx, wy, n.x, n.y);
                    addAtomLabel(Shape, Glyph, n.x, n.y, 'N');
                    const m1 = { x: n.x + bondLen * 0.8, y: n.y + bondLen * 0.5 };
                    const m2 = { x: n.x + bondLen * 0.8, y: n.y - bondLen * 0.5 };
                    addBond(Shape, Glyph, n.x, n.y, m1.x, m1.y);
                    addBond(Shape, Glyph, n.x, n.y, m2.x, m2.y);
""", 'glyph-override-draw-dimethylamine-group', 'dimethylamine group draw')

manifest = []
for fname, content in files.items():
    path = os.path.join(OUT, fname)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    manifest.append(fname)

with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump({'files': manifest}, f, indent=2)

print('wrote', len(files), 'files')
