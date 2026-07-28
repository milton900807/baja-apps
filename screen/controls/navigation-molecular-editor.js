function (graph) {

    return new Promise(async (resolve, reject) => {

        graph.setMouseMode("navigate")
        let buttons = []
        function drawBond(ctx, x1, y1, x2, y2, color = '#0a84ff', width = 2) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.restore();
        }

        function drawDoubleBond(ctx, x1, y1, x2, y2, color = '#0a84ff', width = 1.8, offset = 2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            drawBond(ctx, x1 + nx * offset, y1 + ny * offset, x2 + nx * offset, y2 + ny * offset, color, width);
            drawBond(ctx, x1 - nx * offset, y1 - ny * offset, x2 - nx * offset, y2 - ny * offset, color, width);
        }

        function drawTripleBond(ctx, x1, y1, x2, y2, color = '#0a84ff', width = 1.5, offset = 3) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            drawBond(ctx, x1, y1, x2, y2, color, width);
            drawBond(ctx, x1 + nx * offset, y1 + ny * offset, x2 + nx * offset, y2 + ny * offset, color, width);
            drawBond(ctx, x1 - nx * offset, y1 - ny * offset, x2 - nx * offset, y2 - ny * offset, color, width);
        }

        function drawAtomLabel(ctx, x, y, text, color = '#111') {
            ctx.save();
            ctx.font = 'bold 10px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth = 1;

            const w = Math.max(14, ctx.measureText(text).width + 8);
            const h = 14;
            const r = 4;

            ctx.beginPath();
            ctx.moveTo(x - w / 2 + r, y - h / 2);
            ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
            ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
            ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
            ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x, y + 0.5);
            ctx.restore();
        }

        function makeMolButton({ x, y, label, message, action, drawIcon }) {
            return {
                x,
                y,
                label,
                ionFunction: createIonFunction(async () => {
                    graph.clearMouseListeners();
                    graph.setMouseMode('none');
                    graph.setMessage(message || label);
                    await exec(action, graph);
                    graph.showMenu(null);
                    graph.showSideMenu(null);
                }),
                mouseOver: createIonFunction(() => {
                    graph.setMessage(message || label);
                }),
                draw: (grid, ctx, isHover, isDown) => {
                    const xx = grid.X(x);
                    const yy = grid.Y(y + 1);
                    const w = grid.screenWidth(1);
                    const h = grid.screenHeight(1);

                    const cx = xx + w / 2;
                    const cy = yy + h / 2;

                    drawIcon(ctx, xx, yy, w, h, cx, cy, isHover, isDown);
                }
            };
        }

        buttons = [
            makeMolButton({
                x: 0, y: 0,
                label: 'Benzene',
                message: 'Draw benzene ring',
                action: 'baja/screens/menu/molecule/draw-benzene-ring.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    const r = Math.min(w, h) * 0.23;
                    const pts = [];
                    for (let i = 0; i < 6; i++) {
                        const a = (-30 + i * 60) * Math.PI / 180;
                        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
                    }
                    for (let i = 0; i < 6; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % 6];
                        drawBond(ctx, p1.x, p1.y, p2.x, p2.y);
                    }
                    drawDoubleBond(ctx, pts[0].x, pts[0].y, pts[1].x, pts[1].y, '#0a84ff', 1.2, 1.2);
                    drawDoubleBond(ctx, pts[2].x, pts[2].y, pts[3].x, pts[3].y, '#0a84ff', 1.2, 1.2);
                    drawDoubleBond(ctx, pts[4].x, pts[4].y, pts[5].x, pts[5].y, '#0a84ff', 1.2, 1.2);
                }
            }),

            makeMolButton({
                x: 2, y: 0,
                label: 'Cyclohexane',
                message: 'Draw cyclohexane ring',
                action: 'baja/screens/menu/molecule/draw-cyclohexane-ring.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    const r = Math.min(w, h) * 0.23;
                    const pts = [];
                    for (let i = 0; i < 6; i++) {
                        const a = (-30 + i * 60) * Math.PI / 180;
                        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
                    }
                    for (let i = 0; i < 6; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % 6];
                        drawBond(ctx, p1.x, p1.y, p2.x, p2.y);
                    }
                }
            }),

            makeMolButton({
                x: 4, y: 0,
                label: 'Morpholine',
                message: 'Draw morpholine ring',
                action: 'baja/screens/menu/molecule/draw-morpholine-ring.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    const r = Math.min(w, h) * 0.23;
                    const pts = [];
                    for (let i = 0; i < 6; i++) {
                        const a = (-30 + i * 60) * Math.PI / 180;
                        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
                    }
                    for (let i = 0; i < 6; i++) {
                        drawBond(ctx, pts[i].x, pts[i].y, pts[(i + 1) % 6].x, pts[(i + 1) % 6].y);
                    }
                    drawAtomLabel(ctx, pts[0].x, pts[0].y, 'O');
                    drawAtomLabel(ctx, pts[3].x, pts[3].y, 'N');
                }
            }),

            makeMolButton({
                x: 6, y: 0,
                label: 'Piperazine',
                message: 'Draw piperazine ring',
                action: 'baja/screens/menu/molecule/draw-piperazine-ring.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    const r = Math.min(w, h) * 0.23;
                    const pts = [];
                    for (let i = 0; i < 6; i++) {
                        const a = (-30 + i * 60) * Math.PI / 180;
                        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
                    }
                    for (let i = 0; i < 6; i++) {
                        drawBond(ctx, pts[i].x, pts[i].y, pts[(i + 1) % 6].x, pts[(i + 1) % 6].y);
                    }
                    drawAtomLabel(ctx, pts[0].x, pts[0].y, 'N');
                    drawAtomLabel(ctx, pts[3].x, pts[3].y, 'N');
                }
            }),

            makeMolButton({
                x: 8, y: 0,
                label: 'OH',
                message: 'Draw hydroxyl group',
                action: 'baja/screens/menu/molecule/draw-hydroxyl-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 10, cy, cx + 2, cy);
                    drawAtomLabel(ctx, cx + 12, cy, 'OH');
                }
            }),

            makeMolButton({
                x: 10, y: 0,
                label: 'NH2',
                message: 'Draw amine group',
                action: 'baja/screens/menu/molecule/draw-amine-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 10, cy, cx + 1, cy);
                    drawAtomLabel(ctx, cx + 12, cy, 'NH2');
                }
            }),

            makeMolButton({
                x: 12, y: 0,
                label: 'COOH',
                message: 'Draw carboxyl group',
                action: 'baja/screens/menu/molecule/draw-carboxyl-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 3, cy);
                    drawDoubleBond(ctx, cx - 2, cy, cx + 10, cy - 8, '#0a84ff', 1.2, 1.2);
                    drawBond(ctx, cx - 2, cy, cx + 10, cy + 8);
                    drawAtomLabel(ctx, cx + 16, cy - 10, 'O');
                    drawAtomLabel(ctx, cx + 18, cy + 10, 'OH');
                }
            }),

            makeMolButton({
                x: 14, y: 0,
                label: 'CONH2',
                message: 'Draw amide group',
                action: 'baja/screens/menu/molecule/draw-amide-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 3, cy);
                    drawDoubleBond(ctx, cx - 2, cy, cx + 10, cy - 8, '#0a84ff', 1.2, 1.2);
                    drawBond(ctx, cx - 2, cy, cx + 10, cy + 8);
                    drawAtomLabel(ctx, cx + 16, cy - 10, 'O');
                    drawAtomLabel(ctx, cx + 20, cy + 10, 'NH2');
                }
            }),

            makeMolButton({
                x: 16, y: 0,
                label: 'COOR',
                message: 'Draw ester group',
                action: 'baja/screens/menu/molecule/draw-ester-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 3, cy);
                    drawDoubleBond(ctx, cx - 2, cy, cx + 10, cy - 8, '#0a84ff', 1.2, 1.2);
                    drawBond(ctx, cx - 2, cy, cx + 10, cy + 8);
                    drawAtomLabel(ctx, cx + 16, cy - 10, 'O');
                    drawAtomLabel(ctx, cx + 18, cy + 10, 'OR');
                }
            }),

            makeMolButton({
                x: 18, y: 0,
                label: 'CHO',
                message: 'Draw aldehyde group',
                action: 'baja/screens/menu/molecule/draw-aldehyde-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 2, cy);
                    drawDoubleBond(ctx, cx, cy, cx + 12, cy - 8, '#0a84ff', 1.2, 1.2);
                    drawAtomLabel(ctx, cx + 18, cy - 10, 'O');
                    drawAtomLabel(ctx, cx + 14, cy + 10, 'H');
                }
            }),

            makeMolButton({
                x: 20, y: 0,
                label: 'C=O',
                message: 'Draw ketone group',
                action: 'baja/screens/menu/molecule/draw-ketone-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 2, cy);
                    drawBond(ctx, cx + 2, cy, cx + 14, cy);
                    drawDoubleBond(ctx, cx, cy, cx, cy - 12, '#0a84ff', 1.2, 1.2);
                    drawAtomLabel(ctx, cx, cy - 17, 'O');
                }
            }),

            makeMolButton({
                x: 22, y: 0,
                label: 'O',
                message: 'Draw ether group',
                action: 'baja/screens/menu/molecule/draw-ether-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 4, cy);
                    drawBond(ctx, cx + 4, cy, cx + 14, cy);
                    drawAtomLabel(ctx, cx, cy, 'O');
                }
            }),

            makeMolButton({
                x: 24, y: 0,
                label: 'C=C',
                message: 'Draw alkene group',
                action: 'baja/screens/menu/molecule/draw-alkene-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawDoubleBond(ctx, cx - 12, cy, cx + 12, cy);
                }
            }),

            makeMolButton({
                x: 26, y: 0,
                label: 'C≡C',
                message: 'Draw alkyne group',
                action: 'baja/screens/menu/molecule/draw-alkyne-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawTripleBond(ctx, cx - 12, cy, cx + 12, cy);
                }
            }),

            makeMolButton({
                x: 28, y: 0,
                label: 'C≡N',
                message: 'Draw nitrile group',
                action: 'baja/screens/menu/molecule/draw-nitrile-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawTripleBond(ctx, cx - 12, cy, cx + 4, cy);
                    drawAtomLabel(ctx, cx + 14, cy, 'N');
                }
            }),

            makeMolButton({
                x: 30, y: 0,
                label: 'NO2',
                message: 'Draw nitro group',
                action: 'baja/screens/menu/molecule/draw-nitro-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 3, cy);
                    drawAtomLabel(ctx, cx + 2, cy, 'N');
                    drawDoubleBond(ctx, cx + 6, cy - 1, cx + 15, cy - 10, '#0a84ff', 1.2, 1.2);
                    drawBond(ctx, cx + 6, cy + 1, cx + 15, cy + 10);
                    drawAtomLabel(ctx, cx + 20, cy - 12, 'O');
                    drawAtomLabel(ctx, cx + 20, cy + 12, 'O');
                }
            }),

            makeMolButton({
                x: 32, y: 0,
                label: 'SO2',
                message: 'Draw sulfone group',
                action: 'baja/screens/menu/molecule/draw-sulfone-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 14, cy, cx - 4, cy);
                    drawBond(ctx, cx + 4, cy, cx + 14, cy);
                    drawAtomLabel(ctx, cx, cy, 'S');
                    drawDoubleBond(ctx, cx, cy - 2, cx, cy - 13, '#0a84ff', 1.2, 1.2);
                    drawDoubleBond(ctx, cx, cy + 2, cx, cy + 13, '#0a84ff', 1.2, 1.2);
                    drawAtomLabel(ctx, cx, cy - 18, 'O');
                    drawAtomLabel(ctx, cx, cy + 18, 'O');
                }
            }),

            makeMolButton({
                x: 34, y: 0,
                label: 'PO4',
                message: 'Draw phosphate group',
                action: 'baja/screens/menu/molecule/draw-phosphate-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawAtomLabel(ctx, cx, cy, 'P');
                    drawBond(ctx, cx, cy - 2, cx, cy - 14);
                    drawBond(ctx, cx, cy + 2, cx, cy + 14);
                    drawBond(ctx, cx - 2, cy, cx - 14, cy);
                    drawBond(ctx, cx + 2, cy, cx + 14, cy);
                    drawAtomLabel(ctx, cx, cy - 20, 'O');
                    drawAtomLabel(ctx, cx, cy + 20, 'O');
                    drawAtomLabel(ctx, cx - 20, cy, 'O');
                    drawAtomLabel(ctx, cx + 20, cy, 'O');
                }
            }),

            makeMolButton({
                x: 36, y: 0,
                label: 'F',
                message: 'Draw fluoro group',
                action: 'baja/screens/menu/molecule/draw-fluoro-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 10, cy, cx + 2, cy);
                    drawAtomLabel(ctx, cx + 14, cy, 'F');
                }
            }),

            makeMolButton({
                x: 38, y: 0,
                label: 'Cl',
                message: 'Draw chloro group',
                action: 'baja/screens/menu/molecule/draw-chloro-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 10, cy, cx + 2, cy);
                    drawAtomLabel(ctx, cx + 14, cy, 'Cl');
                }
            }),

            makeMolButton({
                x: 40, y: 0,
                label: 'Br',
                message: 'Draw bromo group',
                action: 'baja/screens/menu/molecule/draw-bromo-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 10, cy, cx + 2, cy);
                    drawAtomLabel(ctx, cx + 14, cy, 'Br');
                }
            }),

            makeMolButton({
                x: 42, y: 0,
                label: 'I',
                message: 'Draw iodo group',
                action: 'baja/screens/menu/molecule/draw-iodo-group.js',
                drawIcon: (ctx, xx, yy, w, h, cx, cy) => {
                    drawBond(ctx, cx - 10, cy, cx + 2, cy);
                    drawAtomLabel(ctx, cx + 14, cy, 'I');
                }
            })
        ];

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 50,
                'grid': {
                    xmin: 0,
                    xmax: xmac_,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons,
                'background': 'white'
            }
        }
        resolve(button_canvas)
    })
}
