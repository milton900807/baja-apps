function (pm) {
    return new Promise(async (resolve, reject) => {
        let fixAngleTo90 = false;
        const platetrack = pm.plateTrack;
        let GenericWell = await exec('baja/plate/well')
        let Menu = await exec('flexigraph/menu.js');
        let MGrid = await exec('flexigraph/grid.js');
        let HM = await exec('baja/history/HM')
        let Plate = await exec('baja/plate/plate-transparent.js');
        let va = await prompt("Polygon Name", ["Name"], { "Name": '' }, 300, 300);
        let name = va['Name'] || generateNautName();

        platetrack.setMessage("Click to set points. Double-click to finish.");
        let menu = null;
        let button_canvas2 = await exec('manchester/controls/draw-polygon-panel-plates.js', pm, fixAngleTo90)
        CurrentLayout.setComponent('buttonMenuPanel', button_canvas2)

        const drawOptionsMenu = (x, y) => {
            const pt = platetrack;

            let ml = []

            ml.push({
                label: fixAngleTo90 ? `Disable Fix 90°` : `Enable Fix 90°`,
                click: async (xwc, ywc) => {
                    fixAngleTo90 = !fixAngleTo90;
                }
            });
            ml.push({
                label: `Set scale`,
                click: async (xwc, ywc) => {

                    let va = await prompt("Polygon Name", ["Width", "Height"], { "Width": 100, "Height": 100 }, 300, 300);
                    let wid = va['Width']
                    let hid = va['Height']

                    platetrack.grid.setxmax ( wid )
                    platetrack.grid.setymax ( hid )
                    platetrack.grid.rescale ();

                }
            });

        }

        const polygon = {
            points: [],
            isDrawing: true,
            id: 'polygon-draw',

            draw: (grid, ctx) => {
                if (polygon.points.length === 0) return;

                ctx.save();

                ctx.beginPath();
                ctx.moveTo(platetrack.grid.X(polygon.points[0].x), platetrack.grid.Y(polygon.points[0].y));

                const pointCount = polygon.points.length;

                for (let i = 1; i < pointCount; i++) {
                    ctx.lineTo(platetrack.grid.X(polygon.points[i].x), platetrack.grid.Y(polygon.points[i].y));
                }

                if (!polygon.isDrawing) ctx.closePath();

                ctx.strokeStyle = 'rgba(10, 10, 200, 0.8)';
                ctx.lineWidth = 5;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 4;
                ctx.shadowOffsetY = 4;

                ctx.stroke();

                if (polygon.isDrawing && pointCount > 1) {
                    const p1 = polygon.points[pointCount - 2];
                    const p2 = polygon.points[pointCount - 1];

                    ctx.beginPath();
                    ctx.setLineDash([10, 5]);
                    ctx.strokeStyle = 'lightgrey';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = 'transparent';

                    ctx.moveTo(platetrack.grid.X(p1.x), platetrack.grid.Y(p1.y));
                    ctx.lineTo(platetrack.grid.X(p2.x), platetrack.grid.Y(p2.y));

                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                if (!polygon.isDrawing) {
                    ctx.fillStyle = 'rgba(10, 10, 200, 0.3)';
                    ctx.fill();
                }

                ctx.fillStyle = 'grey';
                ctx.font = '14px Arial';
                const offsetPixels = 15;

                for (let i = 0; i < polygon.points.length - (polygon.isDrawing ? 1 : 0); i++) {
                    const p1 = polygon.points[i];
                    const p2 = polygon.points[(i + 1) % polygon.points.length];

                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;

                    const screenX = grid.X(mx);
                    const screenY = grid.Y(my);

                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const length = Math.hypot(dx, dy);

                    const perpX = -dy;
                    const perpY = dx;
                    const perpLength = Math.hypot(perpX, perpY);
                    const normPerpX = (perpX / perpLength) * offsetPixels;
                    const normPerpY = (perpY / perpLength) * offsetPixels;

                    const textX = screenX + normPerpX;
                    const textY = screenY + normPerpY;

                    ctx.fillText(`${length.toFixed(2)}`, textX, textY);
                }

                drawAcuteAngleArcs(ctx, platetrack.grid, polygon.points);

                ctx.restore();

                if (menu) {
                    ctx.fillStyle = 'rgba(255,255,255,0.83)';
                    menu.draw(ctx, grid);
                }
            }

            ,

            mouseDownListener: (_x, _y) => {
                if (!polygon.isDrawing) return;

                let x = platetrack.grid.Xwc(_x);
                let y = platetrack.grid.Ywc(_y);
                polygon.points.push({ x, y });
                platetrack.setMessage(`Points: ${polygon.points.length}. Double-click to finish.`);

                drawOptionsMenu(x, y)

            },

            mouseMoveListener: (_x, _y) => {
                if (menu) {
                    let x = platetrack.grid.Xwc(_x);
                    let y = platetrack.grid.Ywc(_y);
                    menu.mouseMove(platetrack.grid, x, y);
                }

                if (polygon.isDrawing && polygon.points.length > 1) {
                    const g = platetrack.grid;
                    let x = g.Xwc(_x);
                    let y = g.Ywc(_y);

                    const hoverRadius = 10;
                    const lastIndex = polygon.points.length - 1;

                    for (let i = 0; i < lastIndex-1; i++) {
                        const point = polygon.points[i];
                        const screenX = g.X(point.x);
                        const screenY = g.Y(point.y);
                        const dist = Math.hypot(_x - screenX, _y - screenY);

                        if (dist <= hoverRadius) {
                            point.highlight = true;
                        }
                    }

                    if (fixAngleTo90) {
                        const prev = polygon.points[polygon.points.length - 2];
                        const dx = _x - g.X(prev.x);
                        const dy = _y - g.Y(prev.y);

                        if (Math.abs(dx) > Math.abs(dy)) {
                            y = prev.y;
                        } else {
                            x = prev.x;
                        }
                    }

                    polygon.points[lastIndex] = { x, y };
                }
            },

            mouseUpListener: (_x, _y) => {

                let x = platetrack.grid.Xwc(_x);
                let y = platetrack.grid.Ywc(_y);

                if ( menu ){
                    menu.mouseUp ( platetrack.grid, x, y )
                }

                menu = null;

            },

            keydown: (event) => {
                if (event.key === 'Escape') {
                    polygon.isDrawing = false;
                    platetrack.wb(null);
                    platetrack.setMessage("Polygon drawing canceled.");
                }
            },

            close: () => { },
            priority: true
        };

        function drawAcuteAngleArcs(ctx, grid, points) {
            if (points.length < 3) return;

            ctx.save();
            ctx.strokeStyle = 'lightgrey';
            ctx.fillStyle = 'black';
            ctx.font = '16px Arial';
            ctx.lineWidth = 2;

            const arcRadius = 20;

            for (let i = 0; i < points.length; i++) {
                const prev = points[(i - 1 + points.length) % points.length];
                const current = points[i];
                const next = points[(i + 1) % points.length];

                const cx = grid.X(current.x);
                const cy = grid.Y(current.y);

                const anglePrev = Math.atan2(grid.Y(prev.y) - grid.Y(current.y), grid.X(prev.x) - grid.X(current.x));
                const angleNext = Math.atan2(grid.Y(next.y) - grid.Y(current.y), grid.X(next.x) - grid.X(current.x));

                let angleDiff = angleNext - anglePrev;

                while (angleDiff < 0) angleDiff += 2 * Math.PI;
                while (angleDiff >= 2 * Math.PI) angleDiff -= 2 * Math.PI;

                const angleDeg = (angleDiff * 180) / Math.PI;

                ctx.beginPath();
                ctx.arc(cx, cy, arcRadius, anglePrev, angleNext, false);
                ctx.stroke();

                const bisectAngle = anglePrev + angleDiff / 2;
                const textX = cx + (arcRadius + 15) * Math.cos(bisectAngle);
                const textY = cy + (arcRadius + 15) * Math.sin(bisectAngle);

                ctx.fillText(`${angleDeg.toFixed(1)}°`, textX, textY);
            }

            ctx.restore();
        }

        platetrack.wb(polygon);

        resolve();
    });
}
