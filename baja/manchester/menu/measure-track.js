function (graph, genegraph_panel_layout) {
    graph.setMessage(" Click and drag on a track to count bases...")
    graph.clearMouseListeners();
    graph.selectOff();
    let selectedTrack = null;
    let mouseDown = false;
    let hl = null;
    let current = -1;
    let start = 0
    graph.setMouseMode('none')

    graph.addMouseDownListener(async (x, y) => {
        mouseDown = true;

        let selectedtrackIndex = graph.getTrack(x, y);
        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
            selectedTrack = graph.track[selectedtrackIndex]

            let t = selectedTrack.tgraph.xi;
            start = selectedTrack.tgraph.Xwc(x - t * 2);

            hl = (ctx, graph) => {
                if (current <= start) return;

                const dist = Math.abs(current - start);

                const xi = graph.X(selectedTrack.tgraph.X(start));
                const xf = graph.X(selectedTrack.tgraph.X(current));
                const yi = graph.Y(selectedTrack.tgraph.Y(0));

                const left = Math.min(xi, xf);
                const right = Math.max(xi, xf);

                const baseTickWorld = 10;
                const pxPer10 =
                    Math.abs(
                        graph.X(selectedTrack.tgraph.X(start + baseTickWorld)) -
                        graph.X(selectedTrack.tgraph.X(start))
                    ) || 0;

                let tickWorld = baseTickWorld;
                if (pxPer10 < 18) {
                    tickWorld *= Math.ceil(18 / Math.max(pxPer10, 0.001));
                }

                const firstTickWorld = Math.ceil(start / tickWorld) * tickWorld;
                const majorEvery = tickWorld * 10;

                ctx.save();

                const barH = 44;
                const r = barH / 2;
                const top = yi - r;
                const bottom = yi + r;

                const pillPath = () => {
                    ctx.beginPath();
                    ctx.moveTo(left + r, top);
                    ctx.lineTo(right - r, top);
                    ctx.arc(right - r, yi, r, -Math.PI / 2, Math.PI / 2);
                    ctx.lineTo(left + r, bottom);
                    ctx.arc(left + r, yi, r, Math.PI / 2, -Math.PI / 2);
                    ctx.closePath();
                };

                ctx.shadowBlur = 12;
                ctx.shadowColor = "rgba(0,0,0,0.35)";
                pillPath();
                ctx.fillStyle = "rgba(120,0,0,0.15)";
                ctx.fill();

                ctx.shadowBlur = 0;
                const g = ctx.createLinearGradient(0, top, 0, bottom);
                g.addColorStop(0.00, "rgba(255,180,180,0.55)");
                g.addColorStop(0.20, "rgba(220,60,60,0.60)");
                g.addColorStop(0.50, "rgba(160,0,0,0.65)");
                g.addColorStop(0.80, "rgba(220,60,60,0.60)");
                g.addColorStop(1.00, "rgba(120,0,0,0.55)");

                pillPath();
                ctx.fillStyle = g;
                ctx.fill();

                const glossTop = yi - barH * 0.28;
                const glossBot = yi - barH * 0.06;
                const gg = ctx.createLinearGradient(0, glossTop, 0, glossBot);
                gg.addColorStop(0.0, "rgba(255,255,255,0.00)");
                gg.addColorStop(0.5, "rgba(255,255,255,0.22)");
                gg.addColorStop(1.0, "rgba(255,255,255,0.00)");

                ctx.save();
                pillPath();
                ctx.clip();
                ctx.fillStyle = gg;
                ctx.fillRect(left, glossTop, right - left, glossBot - glossTop);
                ctx.restore();

                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "rgba(80,0,0,0.55)";
                pillPath();
                ctx.stroke();

                ctx.lineWidth = 2;
                ctx.strokeStyle = "rgba(255,255,255,0.75)";
                ctx.font = "12px Arial";
                ctx.fillStyle = "rgba(255,255,255,0.90)";
                ctx.textBaseline = "middle";

                const tickSmall = 10;
                const tickMajor = 16;

                const drawLabel = (text, x, y) => {
                    const w = ctx.measureText(text).width;
                    ctx.fillStyle = "rgba(0,0,0,0.45)";
                    ctx.fillRect(x - 4, y - 8, w + 8, 16);
                    ctx.fillStyle = "rgba(255,255,255,0.90)";
                    ctx.fillText(text, x, y);
                };

                for (let w = firstTickWorld; w <= current; w += tickWorld) {
                    const xTick = graph.X(selectedTrack.tgraph.X(w));
                    const isMajor =
                        Math.abs(w / majorEvery - Math.round(w / majorEvery)) < 1e-9;

                    ctx.beginPath();
                    ctx.moveTo(xTick, yi - (isMajor ? tickMajor : tickSmall));
                    ctx.lineTo(xTick, yi + (isMajor ? tickMajor : tickSmall));
                    ctx.stroke();

                    const label = String(Math.round(w - start));
                    drawLabel(label, xTick + 4, yi - barH / 2 - 12);
                }
                const endLabel = String(Math.round(current - start));

                ctx.font = "14px Arial";
                ctx.textBaseline = "middle";

                const w = ctx.measureText(endLabel).width;
                const lx = right + 12;
                const ly = yi;

                ctx.fillStyle = "rgba(0,0,0,0.45)";
                ctx.fillRect(lx - 6, ly - 10, w + 12, 20);

                ctx.fillStyle = "rgba(255,255,255,0.95)";
                ctx.fillText(endLabel, lx, ly);
                ctx.restore();
            };

            graph.highlightmethod = hl;

        } else {
            graph.setMessage(" Please click on a track")
            return;
        }
    })

    graph.addMouseMoveListener(async (x, y) => {
        if (mouseDown && selectedTrack) {
            let t = selectedTrack.tgraph.xi;
            current = selectedTrack.tgraph.Xwc(x - t * 2);
        }
    })
    graph.addMouseUpListener(async (x, y) => {
        mouseDown = false;
    })

}
