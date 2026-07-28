function () {

    return new Promise(async (resolve, rej) => {

        let sfgSize = { w: 0, h: 0, dpr: 1 };
        let sfgBgBitmap = null;
        let sfgBgCanvas = null;
        let sfgData = null;
        let sfgOffset = 0;

        function prand(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }

        function strokeChunk(ctx, x, y, r, ang, w, colors) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ang);
            for (let i = 0; i < colors.length; i++) {
                ctx.strokeStyle = colors[i];
                ctx.lineWidth = w * (1 - i / colors.length) * 1.15;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(-r, 0);
                ctx.lineTo(r, 0);
                ctx.stroke();
            }
            ctx.restore();
        }

        function strokeArc(ctx, cx, cy, R, start, end, width, colors) {
            ctx.save();
            ctx.lineCap = "round";
            for (let i = 0; i < colors.length; i++) {
                ctx.strokeStyle = colors[i];
                ctx.lineWidth = width * (1 - i / colors.length) * 1.15;
                ctx.beginPath();
                ctx.arc(cx, cy, R, start, end);
                ctx.stroke();
            }
            ctx.restore();
        }

        function generateSunflowerData(w, h) {

            const cx = w * 0.54, cy = h * 0.56;
            const heads = [];
            const count = 7;
            for (let i = 0; i < count; i++) {
                const s = 777 + i * 31.7;
                const rx = (prand(s) - 0.5) * (w * 0.18);
                const ry = (prand(s + 1) - 0.2) * (h * 0.20);
                const R = Math.min(w, h) * (0.05 + prand(s + 2) * 0.035);
                const petals = 18 + Math.floor(prand(s + 3) * 14);
                const tilt = (prand(s + 4) - 0.5) * 0.6;
                heads.push({ x: cx + rx, y: cy + ry, R, petals, tilt });
            }

            const stems = heads.map((hd, i) => {
                const baseX = w * 0.5 + (prand(900 + i) - 0.5) * w * 0.12;
                const baseY = h * 0.78;
                const ctrlX = (hd.x + baseX) / 2 + (prand(901 + i) - 0.5) * w * 0.08;
                const ctrlY = (hd.y + baseY) / 2;
                return { x1: baseX, y1: baseY, cx: ctrlX, cy: ctrlY, x2: hd.x, y2: hd.y };
            });

            const leaves = [];
            for (let i = 0; i < 10; i++) {
                const s = 1200 + i * 13.7;
                const x = w * 0.5 + (prand(s) - 0.5) * w * 0.22;
                const y = h * (0.66 + prand(s + 1) * 0.18);
                const ang = (prand(s + 2) - 0.5) * 1.3;
                const len = Math.min(w, h) * (0.05 + prand(s + 3) * 0.03);
                leaves.push({ x, y, ang, len });
            }

            return { heads, stems, leaves };
        }

        function drawBeerStein(ctx, x, y, scale = 1) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);

            const width = 120;
            const height = 200;
            const radius = 18;

            ctx.beginPath();
            ctx.moveTo(-width / 2 + radius, 0);
            ctx.lineTo(-width / 2 + radius, height - radius);
            ctx.quadraticCurveTo(-width / 2 + radius, height, -width / 2 + radius * 2, height);
            ctx.lineTo(width / 2 - radius * 2, height);
            ctx.quadraticCurveTo(width / 2 - radius, height, width / 2 - radius, height - radius);
            ctx.lineTo(width / 2 - radius, 0);
            ctx.quadraticCurveTo(width / 2 - radius, -radius, width / 2 - radius * 2, -radius);
            ctx.lineTo(-width / 2 + radius * 2, -radius);
            ctx.quadraticCurveTo(-width / 2 + radius, -radius, -width / 2 + radius, 0);
            ctx.closePath();

            const glassGrad = ctx.createLinearGradient(0, 0, 0, height);
            glassGrad.addColorStop(0, "#ffd54f");
            glassGrad.addColorStop(0.5, "#ffca28");
            glassGrad.addColorStop(1, "#ffb300");
            ctx.fillStyle = glassGrad;
            ctx.fill();

            ctx.strokeStyle = "#d4af37";
            ctx.lineWidth = 4;
            ctx.stroke();

            function drawFoamBubble(cx, cy, r) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = "#fff8e1";
            for (let i = 0; i < 14; i++) {
                const angle = (i / 14) * Math.PI * 2;
                const radiusFoam = 12 + Math.random() * 6;
                const cx = Math.cos(angle) * (width / 2 - 15);
                const cy = Math.sin(angle) * 10 - 20;
                drawFoamBubble(cx, cy, radiusFoam);
            }

            ctx.beginPath();
            ctx.lineWidth = 10;
            ctx.strokeStyle = "#e0c085";

            const handleX = width / 2 - 5;
            const handleY = height / 2 - 20;
            ctx.arc(handleX, handleY, 55, -Math.PI / 4, Math.PI / 4, false);
            ctx.stroke();

            ctx.save();
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(-width / 2 + 10, 10);
            ctx.quadraticCurveTo(-width / 2 + 25, height / 2, -width / 2 + 10, height - 10);
            ctx.lineTo(-width / 2 + 25, height - 10);
            ctx.quadraticCurveTo(-width / 2 + 35, height / 2, -width / 2 + 25, 10);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function drawSunflower(ctx, x, y, scale = 1) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);

            ctx.save();
            ctx.lineWidth = 8;
            ctx.lineCap = "round";
            const stemGrad = ctx.createLinearGradient(0, 0, 0, 400);
            stemGrad.addColorStop(0, "#2c8c2c");
            stemGrad.addColorStop(1, "#0f5b1a");
            ctx.strokeStyle = stemGrad;
            ctx.beginPath();

            ctx.moveTo(0, 40);
            ctx.bezierCurveTo(-30, 180, 140, 320, 0, 860);
            ctx.stroke();
            ctx.restore();

            function leaf(offsetY, angle = -0.6, len = 90, width = 45) {
                ctx.save();
                ctx.translate(0, offsetY);
                ctx.rotate(angle);
                ctx.fillStyle = "#3aa33a";
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(width, -10, len, 0);
                ctx.quadraticCurveTo(width, 18, 0, 0);
                ctx.fill();
                ctx.restore();
            }
            leaf(220, -0.7, 110, 55);
            leaf(300, +0.8, 120, 60);

            function petal(radius = 90, length = 85, width = 34, color = "#f7b733") {
                ctx.fillStyle = color;
                ctx.beginPath();

                ctx.moveTo(0, -radius);
                ctx.quadraticCurveTo(width, -(radius + length * 0.45), 0, -(radius + length));
                ctx.quadraticCurveTo(-width, -(radius + length * 0.45), 0, -radius);
                ctx.fill();
            }

            ctx.save();
            const petals = 24;
            for (let i = 0; i < petals; i++) {
                ctx.rotate((Math.PI * 2) / petals);
                petal(92, 95, 36, "#f1a602");
            }
            ctx.restore();

            ctx.save();
            const petals2 = 20;
            ctx.rotate(Math.PI / petals2);
            for (let i = 0; i < petals2; i++) {
                ctx.rotate((Math.PI * 2) / petals2);
                petal(78, 80, 30, "#ffd24d");
            }
            ctx.restore();

            ctx.beginPath();
            ctx.fillStyle = "#5a3b17";
            ctx.arc(0, 0, 55, 0, Math.PI * 2);
            ctx.fill();

            const g = ctx.createRadialGradient(0, 0, 5, 0, 0, 48);
            g.addColorStop(0, "#7a4a1b");
            g.addColorStop(1, "#3b2610");
            ctx.beginPath();
            ctx.fillStyle = g;
            ctx.arc(0, 0, 48, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "rgba(0,0,0,0.35)";
            for (let i = 0; i < 90; i++) {
                const r = 10 + Math.random() * 36;
                const a = Math.random() * Math.PI * 2;
                ctx.beginPath();
                ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = "rgba(255,255,255,0.15)";
            ctx.beginPath();
            ctx.ellipse(-18, -18, 12, 8, -0.6, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        function buildSunflowerBackground(w, h, blurBack = 12) {

            w = Math.max(2, Math.floor(w | 0));
            h = Math.max(2, Math.floor(h | 0));

            const off = document.createElement("canvas");
            off.width = w; off.height = h;
            const ctx = off.getContext("2d");

            const wall = ctx.createLinearGradient(0, 0, 0, h);
            wall.addColorStop(0, "#1a2c55");
            wall.addColorStop(1, "#0f2243");
            ctx.fillStyle = wall;
            ctx.fillRect(0, 0, w, h);

            const wallLayer = document.createElement("canvas");
            wallLayer.width = w; wallLayer.height = h;
            const wc = wallLayer.getContext("2d");

            for (let i = 0; i < 80; i++) {
                const s = 5000 + i * 17.23;
                const x = prand(s) * w, y = prand(s + 1) * h * 0.7;
                const ang = (prand(s + 2) - 0.5) * 0.8;
                const r = 60 + prand(s + 3) * 140;
                strokeChunk(
                    wc, x, y, r, ang, 16 + prand(s + 4) * 12,
                    ["rgba(65,92,150,0.20)", "rgba(45,76,132,0.18)", "rgba(30,54,110,0.16)"]
                );
            }

            ctx.save();
            ctx.filter = `blur(${blurBack}px)`;
            ctx.drawImage(wallLayer, 0, 0);
            ctx.filter = "none";
            ctx.restore();

            const tableY = Math.floor(h * 0.82);
            const tableGrad = ctx.createLinearGradient(0, tableY - 40, 0, h);
            tableGrad.addColorStop(0, "#6d4b24");
            tableGrad.addColorStop(1, "#4c3419");
            ctx.fillStyle = tableGrad;
            ctx.fillRect(0, tableY, w, h - tableY);

            for (let i = 0; i < 60; i++) {
                const s = 6100 + i * 9.1;
                const x = prand(s) * w;
                const y = tableY + prand(s + 1) * (h - tableY);
                strokeChunk(
                    ctx, x, y, 90 + prand(s + 2) * 180, 0, 10 + prand(s + 3) * 6,
                    ["rgba(160,110,50,0.20)", "rgba(140,95,45,0.18)", "rgba(120,80,40,0.16)"]
                );
            }

            drawBeerStein(ctx, 200, 500, 1)

            ctx.restore();

            sfgBgCanvas = off;
            sfgBgBitmap = null;
            if (off.transferToImageBitmap) {
                try { sfgBgBitmap = off.transferToImageBitmap(); } catch { }
            }
        }

        function sunflowerLightSweep(ctx, w, h, t) {
            const sweepX = (t * 0.12) % (w + 400) - 200;
            const g = ctx.createLinearGradient(sweepX - 120, 0, sweepX + 120, 0);
            g.addColorStop(0, "rgba(255,255,255,0)");
            g.addColorStop(0.5, "rgba(255,250,210,0.10)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        function Vangogh(ctx, opts = {}) {
            const dpr = (opts.dpr ?? window.devicePixelRatio) || 1;
            const w = ctx.canvas.width, h = ctx.canvas.height;

            if (sfgSize.w !== w || sfgSize.h !== h || sfgSize.dpr !== dpr || !sfgData) {
                sfgSize = { w, h, dpr };
                sfgData = generateSunflowerData(w, h);
                buildSunflowerBackground(w, h, opts.blurBack ?? 1);
            }

            if (sfgBgBitmap) ctx.drawImage(sfgBgBitmap, 0, 0, w, h);
            else if (sfgBgCanvas) ctx.drawImage(sfgBgCanvas, 0, 0, w, h);
            else { ctx.fillStyle = "#1a2c55"; ctx.fillRect(0, 0, w, h); }

            sunflowerLightSweep(ctx, w, h, sfgOffset);

            sfgOffset = (sfgOffset + (opts.speed ?? 2)) % 100000;
        }

        let vvgSize = { w: 0, h: 0, dpr: 1 };
        let vvgBgBitmap = null;
        let vvgBgCanvas = null;
        let vvgData = null;
        let vvgOffset = 0;

        function prand(seed) { let x = Math.sin(seed) * 10000; return x - Math.floor(x); }

        function generateVvgData(w, h) {
            const starCount = Math.max(80, Math.floor((w * h) / 15000));
            const stars = [];
            for (let i = 0; i < starCount; i++) {
                const s = 1234.567 + i * 23.17;
                const x = prand(s) * w;
                const y = prand(s + 1) * h * 0.6;
                const r = 1.2 + prand(s + 2) * 2.4;
                const phase = prand(s + 3) * Math.PI * 2;
                stars.push({ x, y, r, phase });
            }
            return { stars };
        }

        function strokeSwirl(ctx, cx, cy, radius, turns, thickness, colors) {
            const steps = Math.max(80, Math.floor(radius * 2));
            ctx.lineCap = "round";
            for (let i = 0; i < colors.length; i++) {
                ctx.strokeStyle = colors[i];
                ctx.lineWidth = thickness * (1 - i / colors.length) * 1.1;
                ctx.beginPath();
                for (let t = 0; t <= steps; t++) {
                    const a = (t / steps) * Math.PI * 2 * turns;
                    const r = radius * (0.3 + 0.7 * t / steps);
                    const x = cx + Math.cos(a) * r;
                    const y = cy + Math.sin(a) * r * 0.55;
                    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }

        function strokesBand(ctx, y, w, density, palette, amp) {
            const count = Math.max(50, Math.floor(w / density));
            for (let i = 0; i < count; i++) {
                const s = 2000 + i * 19.3;
                const x = prand(s) * w;
                const r = 10 + prand(s + 1) * 40;
                const th = 2 + prand(s + 2) * 3;
                const yy = y + (prand(s + 3) - 0.5) * amp;
                strokeSwirl(ctx, x, yy, r, 0.6 + prand(s + 4) * 0.8, th, palette);
            }
        }

        function buildVvgBackground(w, h, blurBack = 2, dpr = 1) {

            const off = document.createElement("canvas");
            off.width = w; off.height = h;
            const ctx = off.getContext("2d");
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            const sky = ctx.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, "#0a1330");
            sky.addColorStop(0.45, "#0b1c4a");
            sky.addColorStop(1, "#0a1738");
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, w, h);

            const far = document.createElement("canvas");
            far.width = w; far.height = h;
            const fc = far.getContext("2d");

            const farPalette = [
                "rgba(44,94,170,0.25)",
                "rgba(28,74,150,0.22)",
                "rgba(24,58,120,0.20)"
            ];
            strokesBand(fc, h * 0.28, w, 16, farPalette, h * 0.12);
            strokesBand(fc, h * 0.40, w, 18, farPalette, h * 0.16);

            ctx.save();
            ctx.filter = `blur(${blurBack}px)`;
            ctx.drawImage(far, 0, 0);
            ctx.filter = "none";
            ctx.restore();

            const mid = document.createElement("canvas");
            mid.width = w; mid.height = h;
            const mc = mid.getContext("2d");
            const midPalette = [
                "rgba(72,130,210,0.30)",
                "rgba(98,160,235,0.28)",
                "rgba(64,116,200,0.25)"
            ];
            strokesBand(mc, h * 0.33, w, 14, midPalette, h * 0.12);
            strokesBand(mc, h * 0.46, w, 14, midPalette, h * 0.14);

            ctx.save();
            ctx.filter = "blur(6px)";
            ctx.drawImage(mid, 0, 0);
            ctx.filter = "none";
            ctx.restore();

            const nearPalette = [
                "rgba(140,190,255,0.32)",
                "rgba(210,235,255,0.25)",
                "rgba(255,255,255,0.18)"
            ];
            strokesBand(ctx, h * 0.38, w, 12, nearPalette, h * 0.12);

            const moonX = w * 0.82, moonY = h * 0.18, moonR = Math.min(w, h) * 0.06;
            const moonG = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 1.6);
            moonG.addColorStop(0, "rgba(255,235,170,0.9)");
            moonG.addColorStop(0.5, "rgba(255,220,140,0.45)");
            moonG.addColorStop(1, "rgba(255,220,140,0.05)");
            ctx.fillStyle = moonG;
            ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2); ctx.fill();

            if (vvgData && vvgData.stars) {
                vvgData.stars.forEach(s => {
                    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
                    g.addColorStop(0, "rgba(255,240,190,0.7)");
                    g.addColorStop(0.35, "rgba(255,240,190,0.35)");
                    g.addColorStop(1, "rgba(255,240,190,0.02)");
                    ctx.fillStyle = g;
                    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2); ctx.fill();
                });
            }

            ctx.fillStyle = "#0b1530";
            ctx.beginPath();
            ctx.moveTo(0, h * 0.72);
            for (let x = 0; x <= w; x += 20) {
                const y = h * 0.72 + Math.sin(x * 0.01) * 10 + Math.sin(x * 0.035) * 6;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

            vvgBgCanvas = off;
            vvgBgBitmap = null;
            if (off.transferToImageBitmap) {
                try { vvgBgBitmap = off.transferToImageBitmap(); } catch { }
            }
        }

        function drawTwinkleOverlay(ctx, stars, t) {
            if (!stars) return;
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];

                const a = 0.4 + 0.6 * Math.pow((Math.sin(t * 0.004 + s.phase) + 1) / 2, 3);
                ctx.fillStyle = `rgba(255,245,210,${a})`;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        function StaryNight(ctx, opts = {}) {
            const dpr = (opts.dpr ?? window.devicePixelRatio) || 1;
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;

            if (vvgSize.w !== w || vvgSize.h !== h || vvgSize.dpr !== dpr || !vvgData) {
                vvgSize = { w, h, dpr };
                vvgData = generateVvgData(w, h);
                buildVvgBackground(w, h, opts.blurBack ?? 20, dpr);
            }

            if (vvgBgBitmap) ctx.drawImage(vvgBgBitmap, 0, 0, w, h);
            else if (vvgBgCanvas) ctx.drawImage(vvgBgCanvas, 0, 0, w, h);
            else { ctx.fillStyle = "#0a1330"; ctx.fillRect(0, 0, w, h); }

            drawTwinkleOverlay(ctx, vvgData.stars, vvgOffset);

            vvgOffset = (vvgOffset + (opts.speed ?? 2)) % 100000;
        }

        let oceanOffset = 0;
        let oceanSize = { w: 0, h: 0 };
        let oceanData = null;
        let oceanBgBitmap = null;
        let oceanBgCanvas = null;

        function generateOceanData(w, h) {
            const layers = [

                { amp: h * 0.03, wave: w * 0.45, speed: 0.6, base: h * 0.62, color: "#0a2b44", alpha: 0.35, phase: Math.random() * Math.PI * 2 },
                { amp: h * 0.05, wave: w * 0.35, speed: 0.9, base: h * 0.67, color: "#0b3556", alpha: 0.45, phase: Math.random() * Math.PI * 2 },
                { amp: h * 0.07, wave: w * 0.28, speed: 1.2, base: h * 0.73, color: "#0c406a", alpha: 0.55, phase: Math.random() * Math.PI * 2 },
                { amp: h * 0.09, wave: w * 0.22, speed: 1.6, base: h * 0.78, color: "#0d4b7f", alpha: 0.65, phase: Math.random() * Math.PI * 2 },
            ];
            return { layers };
        }

        function buildOceanBackground(w, h, blurPx = 4) {
            const off = document.createElement('canvas');
            off.width = w; off.height = h;
            const c = off.getContext('2d');

            const sky = c.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, "#0b0f1a");
            sky.addColorStop(0.5, "#0c1422");
            sky.addColorStop(1, "#0a1018");
            c.fillStyle = sky; c.fillRect(0, 0, w, h);

            const sun = c.createRadialGradient(w * 0.75, h * 0.18, h * 0.02, w * 0.75, h * 0.18, h * 0.22);
            sun.addColorStop(0, "rgba(255, 230, 180, 0.12)");
            sun.addColorStop(1, "rgba(255, 230, 180, 0.00)");
            c.fillStyle = sun; c.beginPath(); c.arc(w * 0.75, h * 0.18, h * 0.22, 0, Math.PI * 2); c.fill();

            const horizon = c.createLinearGradient(0, h * 0.62, 0, h * 0.8);
            horizon.addColorStop(0, "rgba(80, 180, 255, 0.06)");
            horizon.addColorStop(1, "rgba(80, 180, 255, 0.00)");
            c.fillStyle = horizon; c.fillRect(0, h * 0.62, w, h * 0.18);

            const blurred = document.createElement('canvas');
            blurred.width = w; blurred.height = h;
            const bc = blurred.getContext('2d');
            bc.filter = `blur(${blurPx}px)`;
            bc.drawImage(off, 0, 0);
            bc.filter = 'none';

            oceanBgCanvas = blurred;
            oceanBgBitmap = null;
            if (blurred.transferToImageBitmap) {
                try { oceanBgBitmap = blurred.transferToImageBitmap(); } catch {  }
            }
        }

        function drawWaveLayer(c, layer, offset, w, h) {
            const { amp, wave, base, color, alpha, phase, speed } = layer;
            const twoPiOverWave = (Math.PI * 2) / wave;
            const phaseShift = (offset * speed) * twoPiOverWave + phase;

            c.save();
            c.fillStyle = color;
            c.globalAlpha = alpha;
            c.beginPath();
            c.moveTo(0, h);
            c.lineTo(0, base + amp * Math.sin(phaseShift));

            const step = Math.max(2, Math.floor(w / 240));
            for (let x = 0; x <= w; x += step) {
                const y = base + amp * Math.sin(twoPiOverWave * x + phaseShift);
                c.lineTo(x, y);
            }
            c.lineTo(w, h);
            c.closePath();
            c.fill();
            c.restore();
        }

        function sampleFrontWave(layer, x, offset) {
            const { amp, wave, base, phase, speed } = layer;
            const k = (Math.PI * 2) / wave;
            const θ = k * x + (offset * speed) * k + phase;
            const y = base + amp * Math.sin(θ);
            const dydx = amp * k * Math.cos(θ);
            return { y, dydx };
        }

        function drawBoat(c, x, y, angle, scale) {
            c.save();
            c.translate(x, y);
            c.rotate(angle);
            c.scale(scale, scale);

            c.fillStyle = "#5a371e";
            c.beginPath();
            c.moveTo(-80, 0);
            c.lineTo(80, 0);
            c.quadraticCurveTo(60, 28, 0, 36);
            c.quadraticCurveTo(-60, 28, -80, 0);
            c.closePath();
            c.fill();

            c.strokeStyle = "rgba(255,255,255,0.15)";
            c.lineWidth = 3;
            c.beginPath(); c.moveTo(-70, -2); c.lineTo(70, -2); c.stroke();

            c.fillStyle = "#d9e6f2";
            c.beginPath();
            c.moveTo(-20, -35);
            c.lineTo(20, -35);
            c.lineTo(28, -10);
            c.lineTo(-28, -10);
            c.closePath();
            c.fill();

            c.fillStyle = "#9ec7e8";
            c.fillRect(-14, -30, 12, 14);
            c.fillRect(4, -30, 12, 14);

            c.strokeStyle = "#cfcfcf"; c.lineWidth = 3;
            c.beginPath(); c.moveTo(0, -35); c.lineTo(0, -70); c.stroke();
            c.fillStyle = "#ff415b";
            c.beginPath();
            c.moveTo(0, -66); c.lineTo(20, -58); c.lineTo(0, -50); c.closePath(); c.fill();

            c.restore();
        }

        function OceanBoat(ctx, opts = {}) {
            const w = ctx.canvas.width, h = ctx.canvas.height;
            const BLUR_PX = opts.blur ?? 4;
            const SPEED = opts.waveSpeed ?? 2;
            const BOAT_X = w * 0.5;
            const BOAT_SCALE = Math.max(0.6, Math.min(1.2, Math.min(w, h) / 900));

            if (oceanSize.w !== w || oceanSize.h !== h) {
                oceanSize.w = w; oceanSize.h = h;
                oceanData = generateOceanData(w, h);
                buildOceanBackground(w, h, BLUR_PX);
            }

            if (oceanBgBitmap) {
                ctx.drawImage(oceanBgBitmap, 0, 0, w, h);
            } else if (oceanBgCanvas) {
                ctx.drawImage(oceanBgCanvas, 0, 0, w, h);
            } else {

                ctx.fillStyle = "#0b0f1a"; ctx.fillRect(0, 0, w, h);
            }

            const layers = oceanData.layers;

            ctx.save();
            ctx.globalAlpha = 0.06;
            ctx.fillStyle = "#cde8ff";
            ctx.beginPath();
            ctx.ellipse(w * 0.75, h * 0.18, w * 0.16, h * 0.045, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            for (let i = 0; i < layers.length; i++) {
                drawWaveLayer(ctx, layers[i], oceanOffset, w, h);
            }

            const front = layers[layers.length - 1];
            const { y: surfaceY, dydx } = sampleFrontWave(front, BOAT_X, oceanOffset);
            const angle = Math.atan(dydx);
            drawBoat(ctx, BOAT_X, surfaceY - 18, angle * 0.7, BOAT_SCALE);

            ctx.save();
            ctx.translate(BOAT_X, surfaceY);
            ctx.rotate(angle);
            ctx.globalAlpha = 0.18;
            ctx.strokeStyle = "#cfe9ff";
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            for (let i = 0; i <= 12; i++) {
                const t = i / 12;
                const x = -20 - t * 120;
                const y = Math.sin(t * Math.PI * 1.5) * 6;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();

            const vg = ctx.createRadialGradient(w * 0.5, h * 0.6, Math.min(w, h) * 0.25, w * 0.5, h * 0.6, Math.max(w, h) * 0.85);
            vg.addColorStop(0, "rgba(0,0,0,0)");
            vg.addColorStop(1, "rgba(0,0,0,0.45)");
            ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

            oceanOffset = (oceanOffset + SPEED) % (Math.max(...layers.map(l => l.wave)) || w);
        }

        let wallStreetTickerOffset = 0;
        let wallStreetBackgroundData = null;
        let wallStreetCanvasSize = { w: 0, h: 0 };

        function generateWallStreetData(w, h) {

            const candles = [];
            const top = h * 0.18, bottom = h * 0.52, bandH = bottom - top;
            const count = Math.max(40, Math.floor(w / 18)), step = w / count;
            for (let i = 0; i < count; i++) {
                const x = i * step + step * 0.5;
                const o = top + Math.random() * bandH;
                const cl = top + Math.random() * bandH;
                const hi = Math.min(o, cl) - Math.random() * (bandH * 0.08);
                const lo = Math.max(o, cl) + Math.random() * (bandH * 0.08);
                candles.push({ x, o, cl, hi, lo, bw: Math.max(3, step * 0.25) });
            }

            const makeSkyline = (baseY, wMax, hMax, gapMax) => {
                let x = 0, blocks = [];
                while (x < w) {
                    const bw = Math.max(28, Math.random() * wMax);
                    const bh = Math.max(30, Math.random() * hMax);
                    blocks.push({ x, bw, bh });
                    x += bw + Math.random() * gapMax;
                }
                return { baseY, blocks };
            };
            const skylineBack = makeSkyline(h * 0.62, 80, h * 0.18, 10);
            const skylineFront = makeSkyline(h * 0.70, 70, h * 0.14, 8);

            const symbolsArr = [];
            const syms = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.A", "JPM", "V", "MA", "BAC", "XOM", "UNH", "KO", "PEP", "HD", "NFLX", "INTC", "AMD", "CRM", "ORCL", "DIS", "GS", "C", "NKE", "WMT", "BA", "PFE", "ABBV", "MRK", "CVX", "T", "VZ", "ADBE"];
            for (let i = 0; i < 220; i++) {
                const s = syms[(Math.random() * syms.length) | 0];
                const size = (10 + Math.random() * 20) | 0;
                const x = Math.random() * w;
                const y = Math.random() * h * 0.9;
                symbolsArr.push({ s, size, x, y });
            }

            return { candles, skylineBack, skylineFront, symbolsArr };
        }

        function WallStreet(ctx, opts = {}) {
            const w = ctx.canvas.width, h = ctx.canvas.height;
            const BLUR_PX = opts.blur ?? 0;
            const TICKER_H = Math.max(24, Math.floor(h * 0.06));
            const TICKER_SPEED = opts.tickerSpeed ?? 2;

            if (wallStreetCanvasSize.w !== w || wallStreetCanvasSize.h !== h) {
                wallStreetBackgroundData = generateWallStreetData(w, h);
                wallStreetCanvasSize.w = w;
                wallStreetCanvasSize.h = h;
            }

            const { candles, skylineBack, skylineFront, symbolsArr } = wallStreetBackgroundData;

            const off = document.createElement("canvas");
            off.width = w; off.height = h;
            const oc = off.getContext("2d");

            const g = oc.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, "#0b0e12");
            g.addColorStop(0.5, "#0c1320");
            g.addColorStop(1, "#0a0f18");
            oc.fillStyle = g;
            oc.fillRect(0, 0, w, h);

            oc.save();
            oc.globalAlpha = 0.08; oc.strokeStyle = "#9ad1ff"; oc.lineWidth = 1;
            const gx = Math.max(40, Math.floor(w * 0.04)), gy = Math.max(30, Math.floor(h * 0.05));
            for (let x = 0; x <= w; x += gx) { oc.beginPath(); oc.moveTo(x + 0.5, 0); oc.lineTo(x + 0.5, h); oc.stroke(); }
            for (let y = 0; y <= h; y += gy) { oc.beginPath(); oc.moveTo(0, y + 0.5); oc.lineTo(w, y + 0.5); oc.stroke(); }
            oc.restore();

            oc.fillStyle = "#0e1a24";
            oc.beginPath(); oc.moveTo(0, skylineBack.baseY);
            skylineBack.blocks.forEach(b => {
                oc.lineTo(b.x, skylineBack.baseY - b.bh);
                oc.lineTo(b.x + b.bw, skylineBack.baseY - b.bh);
                oc.lineTo(b.x + b.bw, skylineBack.baseY);
            });
            oc.lineTo(w, skylineBack.baseY); oc.lineTo(w, h); oc.lineTo(0, h); oc.closePath(); oc.fill();

            oc.fillStyle = "#0a131b";
            oc.beginPath(); oc.moveTo(0, skylineFront.baseY);
            skylineFront.blocks.forEach(b => {
                oc.lineTo(b.x, skylineFront.baseY - b.bh);
                oc.lineTo(b.x + b.bw, skylineFront.baseY - b.bh);
                oc.lineTo(b.x + b.bw, skylineFront.baseY);
            });
            oc.lineTo(w, skylineFront.baseY); oc.lineTo(w, h); oc.lineTo(0, h); oc.closePath(); oc.fill();

            candles.forEach(cd => {
                const up = cd.cl < cd.o;
                oc.strokeStyle = up ? "rgba(90,215,125,0.55)" : "rgba(230,80,80,0.55)";
                oc.fillStyle = up ? "rgba(90,215,125,0.25)" : "rgba(230,80,80,0.25)";
                oc.beginPath(); oc.moveTo(cd.x, cd.hi); oc.lineTo(cd.x, cd.lo); oc.stroke();
                oc.fillRect(cd.x - cd.bw / 2, Math.min(cd.o, cd.cl), cd.bw, Math.abs(cd.cl - cd.o));
            });

            oc.save(); oc.globalAlpha = 0.09; oc.fillStyle = "#bfe3ff";
            symbolsArr.forEach(sy => {
                oc.font = `${sy.size}px Arial`;
                oc.fillText(sy.s, sy.x, sy.y);
            });
            oc.restore();

            const y = h - TICKER_H;
            const grad = oc.createLinearGradient(0, y, 0, h);
            grad.addColorStop(0, "rgba(10,20,28,0.8)");
            grad.addColorStop(1, "rgba(10,20,28,0.95)");
            oc.fillStyle = grad; oc.fillRect(0, y, w, TICKER_H);

            const entries = [
                ["AAPL", +1.24], ["MSFT", -0.58], ["NVDA", +2.10], ["AMZN", +0.33],
                ["TSLA", -1.12], ["META", +0.85], ["JPM", +0.18], ["V", -0.09],
                ["XOM", +0.44], ["UNH", -0.22], ["KO", +0.06], ["HD", -0.15]
            ];
            oc.font = `bold ${Math.floor(TICKER_H * 0.45)}px Arial`;
            oc.textBaseline = "middle";

            const textWidth = 140 * entries.length;
            let startX = -wallStreetTickerOffset;
            while (startX < w) {
                let xPos = startX;
                entries.forEach(([sym, d]) => {
                    const up = d >= 0;
                    oc.fillStyle = "#d7e9ff";
                    oc.fillText(sym, xPos, y + TICKER_H * 0.5);
                    oc.fillStyle = up ? "#74e39a" : "#ff8b8b";
                    oc.fillText((up ? " +" : " ") + d.toFixed(2) + "%", xPos + 58, y + TICKER_H * 0.5);
                    xPos += 140;
                });
                startX += textWidth;
            }
            wallStreetTickerOffset = (wallStreetTickerOffset + TICKER_SPEED) % textWidth;

            ctx.save();
            ctx.filter = `blur(${BLUR_PX}px)`;
            ctx.drawImage(off, 0, 0);
            ctx.filter = "none";
            ctx.restore();
        }

        const drawPokerBackground = (ctx) => {
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;

            function roundedRect(c, x, y, w, h, r) {
                c.beginPath();
                c.moveTo(x + r, y);
                c.arcTo(x + w, y, x + w, y + h, r);
                c.arcTo(x + w, y + h, x, y + h, r);
                c.arcTo(x, y + h, x, y, r);
                c.arcTo(x, y, x + w, y, r);
                c.closePath();
            }

            function drawSpotlight(c, x, y, r0, r1) {
                const g = c.createRadialGradient(x, y, r0, x, y, r1);
                g.addColorStop(0, "rgba(255,255,255,0.12)");
                g.addColorStop(1, "rgba(0,0,0,0)");
                c.fillStyle = g;
                c.beginPath();
                c.arc(x, y, r1, 0, Math.PI * 2);
                c.fill();
            }

            function drawFeltTable(c, cx, cy, rw, rh) {

                c.save();
                c.translate(cx, cy);
                c.rotate(-0.05);
                c.fillStyle = "#5a381e";
                roundedRect(c, -rw, -rh, rw * 2, rh * 2, Math.min(rw, rh) * 0.25);
                c.fill();

                c.save();
                c.globalCompositeOperation = "destination-out";
                roundedRect(c, -rw * 0.88, -rh * 0.88, rw * 1.76, rh * 1.76, Math.min(rw, rh) * 0.22);
                c.fill();
                c.restore();

                c.fillStyle = "#0c5a2a";
                roundedRect(c, -rw * 0.86, -rh * 0.86, rw * 1.72, rh * 1.72, Math.min(rw, rh) * 0.2);
                c.fill();

                c.strokeStyle = "rgba(255,255,255,0.06)";
                c.lineWidth = 6;
                c.beginPath();
                c.ellipse(0, 0, rw * 0.7, rh * 0.42, 0, 0, Math.PI * 2);
                c.stroke();

                c.restore();
            }

            function drawChip(c, x, y, r, base = "#d32f2f") {
                c.save();
                c.translate(x, y);

                c.fillStyle = base;
                c.beginPath();
                c.arc(0, 0, r, 0, Math.PI * 2);
                c.fill();

                c.strokeStyle = "white";
                c.lineWidth = r * 0.18;
                c.setLineDash([r * 0.35, r * 0.25]);
                c.beginPath();
                c.arc(0, 0, r * 0.78, 0, Math.PI * 2);
                c.stroke();
                c.setLineDash([]);

                c.fillStyle = "#f6f6f6";
                c.beginPath();
                c.arc(0, 0, r * 0.55, 0, Math.PI * 2);
                c.fill();

                c.restore();
            }

            function drawChipStack(c, x, y, r, n, color) {
                for (let i = 0; i < n; i++) {
                    drawChip(c, x + i * 1.2, y - i * (r * 0.55), r, color);
                }
            }

            function drawCard(c, x, y, w, h, rank = "A", suit = "♠", angle = 0) {
                c.save();
                c.translate(x, y);
                c.rotate(angle);

                c.fillStyle = "#ffffff";
                roundedRect(c, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.08);
                c.shadowColor = "rgba(0,0,0,0.3)";
                c.shadowBlur = 12;
                c.shadowOffsetY = 6;
                c.fill();
                c.shadowBlur = 0;
                c.shadowOffsetY = 0;
                c.strokeStyle = "rgba(0,0,0,0.08)";
                c.lineWidth = 1;
                c.stroke();

                const red = (suit === "♥" || suit === "♦");
                c.fillStyle = red ? "#c62828" : "#111";

                c.font = `${Math.floor(h * 0.16)}px Arial`;
                c.textAlign = "left";
                c.textBaseline = "top";
                c.fillText(rank, -w / 2 + w * 0.08, -h / 2 + h * 0.06);
                c.fillText(suit, -w / 2 + w * 0.08, -h / 2 + h * 0.26);

                c.textAlign = "right";
                c.textBaseline = "bottom";
                c.fillText(rank, w / 2 - w * 0.08, h / 2 - h * 0.06);
                c.fillText(suit, w / 2 - w * 0.08, h / 2 - h * 0.26);

                c.textAlign = "center";
                c.textBaseline = "middle";
                c.font = `${Math.floor(h * 0.3)}px Arial`;
                c.fillText(suit, 0, 0);

                c.restore();
            }

            function drawDealerButton(c, x, y, r = 22) {
                c.save();
                c.translate(x, y);
                c.fillStyle = "#fff";
                c.beginPath();
                c.arc(0, 0, r, 0, Math.PI * 2);
                c.fill();
                c.strokeStyle = "rgba(0,0,0,0.25)";
                c.lineWidth = 2;
                c.stroke();

                c.fillStyle = "#111";
                c.font = "bold 12px Arial";
                c.textAlign = "center";
                c.textBaseline = "middle";
                c.fillText("DEALER", 0, 0);
                c.restore();
            }

            function drawVignette(c) {
                const g = c.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.2, w / 2, h * 0.55, Math.max(w, h) * 0.7);
                g.addColorStop(0, "rgba(0,0,0,0)");
                g.addColorStop(1, "rgba(0,0,0,0.65)");
                c.fillStyle = g;
                c.fillRect(0, 0, w, h);
            }

            const off = document.createElement('canvas');
            off.width = w;
            off.height = h;
            const offctx = off.getContext('2d');

            const bg = offctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, "#1a1a1f");
            bg.addColorStop(1, "#0d0d10");
            offctx.fillStyle = bg;
            offctx.fillRect(0, 0, w, h);

            drawSpotlight(offctx, w * 0.25, h * 0.15, 10, Math.min(w, h) * 0.35);
            drawSpotlight(offctx, w * 0.75, h * 0.12, 10, Math.min(w, h) * 0.38);
            drawSpotlight(offctx, w * 0.55, h * 0.28, 10, Math.min(w, h) * 0.32);

            offctx.save();
            offctx.globalAlpha = 0.06;
            offctx.fillStyle = "#ffffff";
            const suits = ["♠", "♥", "♦", "♣"];
            offctx.font = "28px Arial";
            for (let yy = 40; yy < h; yy += 60) {
                for (let xx = 40; xx < w; xx += 60) {
                    const s = suits[(xx + yy) % suits.length];
                    offctx.fillText(s, xx, yy);
                }
            }
            offctx.restore();

            drawFeltTable(offctx, w * 0.5, h * 0.62, w * 0.42, h * 0.22);

            ctx.save();
            ctx.filter = 'blur(40px)';
            ctx.drawImage(off, 0, 0);
            ctx.filter = 'none';
            ctx.restore();

            drawVignette(ctx);

            ctx.save();
            ctx.globalAlpha = 0.18;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.ellipse(w * 0.5, h * 0.62, w * 0.28, h * 0.12, -0.05, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const cardW = Math.min(w, h) * 0.09;
            const cardH = cardW * 1.4;
            const baseX = w * 0.4;
            const baseY = h * 0.58;
            const gap = cardW * 0.12;

            drawCard(ctx, baseX + cardW * 0 + gap * 0, baseY, cardW, cardH, "A", "♠", -0.06);
            drawCard(ctx, baseX + cardW * 1 + gap * 1, baseY, cardW, cardH, "K", "♥", -0.02);
            drawCard(ctx, baseX + cardW * 2 + gap * 2, baseY, cardW, cardH, "K", "♦", +0.02);
            drawCard(ctx, baseX + cardW * 3 + gap * 3, baseY, cardW, cardH, "9", "♣", +0.05);
            drawCard(ctx, baseX + cardW * 4 + gap * 4, baseY, cardW, cardH, "A", "♥", +0.08);

            drawCard(ctx, w * 0.28, h * 0.72, cardW, cardH, "A", "♦", -0.35);
            drawCard(ctx, w * 0.32, h * 0.74, cardW, cardH, "A", "♣", -0.15);

            drawCard(ctx, w * 0.70, h * 0.73, cardW, cardH, "Q", "♥", +0.35);
            drawCard(ctx, w * 0.66, h * 0.75, cardW, cardH, "Q", "♠", +0.15);

            drawChipStack(ctx, w * 0.5, h * 0.67, Math.min(w, h) * 0.022, 6, "#1976d2");
            drawChipStack(ctx, w * 0.46, h * 0.69, Math.min(w, h) * 0.022, 4, "#2e7d32");
            drawChipStack(ctx, w * 0.54, h * 0.70, Math.min(w, h) * 0.022, 3, "#f9a825");
            drawChip(ctx, w * 0.58, h * 0.66, Math.min(w, h) * 0.022, "#d32f2f");
            drawChip(ctx, w * 0.56, h * 0.68, Math.min(w, h) * 0.022, "#ab47bc");

            drawDealerButton(ctx, w * 0.62, h * 0.78);

            ctx.save();
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 18;
            ctx.beginPath();
            ctx.ellipse(w * 0.5, h * 0.62, w * 0.44, h * 0.24, -0.05, Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();
            ctx.restore();
        }

        let pw = null;
        let ph = null;
        let pdpr = null;
        let bgBitmap = null;
        let bgCanvas = null;

        function PokerNight(ctx) {
            const pixelW = ctx.canvas.width;
            const pixelH = ctx.canvas.height;
            const dpr = window.devicePixelRatio || 1;

            const sizeChanged = (pw !== pixelW || ph !== pixelH);
            const dprChanged = (pdpr !== dpr);

            if (pw == null || ph == null || sizeChanged || dprChanged) {
                pw = pixelW;
                ph = pixelH;
                pdpr = dpr;
                paintBackground(ctx);
            }

            paintForeground(ctx);
        }

        function blitBackground(ctx) {
            if (bgBitmap) {
                ctx.drawImage(bgBitmap, 0, 0, ctx.canvas.width, ctx.canvas.height);
            } else if (bgCanvas) {
                ctx.drawImage(bgCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
            } else {

                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            }
        }

        function paintBackground(ctx) {
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;

            let off, offctx;
            if (typeof OffscreenCanvas !== 'undefined') {
                off = new OffscreenCanvas(w, h);
                offctx = off.getContext('2d');
            } else {
                off = document.createElement('canvas');
                off.width = w; off.height = h;
                offctx = off.getContext('2d');
            }

            offctx.clearRect(0, 0, w, h);
            const bg = offctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, "#1a1a1f");
            bg.addColorStop(1, "#0d0d10");
            offctx.fillStyle = bg;
            offctx.fillRect(0, 0, w, h);

            drawPokerBackground(offctx);

            bgBitmap = null;
            bgCanvas = null;
            if (off.transferToImageBitmap) {
                try {
                    bgBitmap = off.transferToImageBitmap();
                } catch {

                }
            }
            if (!bgBitmap) {
                try {
                    bgBitmap = awaitMaybeCreateImageBitmap(off);
                } catch {

                    bgCanvas = off;
                }
            }

        }

        async function awaitMaybeCreateImageBitmap(source) {
            if (typeof createImageBitmap === 'function') {
                return await createImageBitmap(source);
            }
            throw new Error('createImageBitmap not available');
        }

        function paintForeground(ctx) {
            blitBackground(ctx);
        }

        function drawGasthausScene(ctx, w, h) {
            const skyGradient = ctx.createLinearGradient(0, 0, 0, h);
            skyGradient.addColorStop(0, "#87CEEB");
            skyGradient.addColorStop(1, "#ffffff");
            ctx.fillStyle = skyGradient;
            ctx.fillRect(0, 0, w, h);

            const peaks = [
                { x: 0, y: h * 0.75 }, { x: w * 0.05, y: h * 0.6 }, { x: w * 0.12, y: h * 0.65 },
                { x: w * 0.2, y: h * 0.5 }, { x: w * 0.28, y: h * 0.58 }, { x: w * 0.35, y: h * 0.46 },
                { x: w * 0.42, y: h * 0.52 }, { x: w * 0.5, y: h * 0.48 }, { x: w * 0.6, y: h * 0.55 },
                { x: w * 0.7, y: h * 0.5 }, { x: w * 0.78, y: h * 0.58 }, { x: w * 0.85, y: h * 0.54 },
                { x: w * 0.93, y: h * 0.6 }, { x: w, y: h * 0.55 }, { x: w, y: h }, { x: 0, y: h }
            ];

            ctx.beginPath();
            peaks.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.fillStyle = "#3A4A64";
            ctx.fill();

            ctx.beginPath();
            for (let i = 1; i < peaks.length - 2; i++) {
                const p1 = peaks[i];
                const p2 = peaks[i + 1];
                if (p2.x < p1.x) {
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.lineTo(p2.x, h);
                    ctx.lineTo(p1.x, h);
                    ctx.closePath();
                }
            }
            ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
            ctx.fill();

            ctx.beginPath();
            for (let i = 1; i < peaks.length - 2; i++) {
                const p1 = peaks[i];
                const p2 = peaks[i + 1];
                if (p2.x > p1.x) {
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.lineTo(p2.x, h);
                    ctx.lineTo(p1.x, h);
                    ctx.closePath();
                }
            }
            ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
            ctx.fill();

            const fog = ctx.createLinearGradient(0, h * 0.75, 0, h);
            fog.addColorStop(0, "rgba(255,255,255,0)");
            fog.addColorStop(1, "rgba(255,255,255,0.3)");
            ctx.fillStyle = fog;
            ctx.fillRect(0, h * 0.75, w, h * 0.25);

            ctx.fillStyle = "#2e8b57";
            ctx.fillRect(0, h * 0.85, w, h * 0.15);

            const houseX = w * 0.25;
            const houseY = h * 0.45;
            const houseW = w * 0.5;
            const houseH = h * 0.4;

            ctx.fillStyle = "#fdf5e6";
            ctx.fillRect(houseX, houseY, houseW, houseH);

            ctx.strokeStyle = "#5c4033";
            ctx.lineWidth = 6;

            const beams = 5;
            for (let i = 0; i <= beams; i++) {
                const x = houseX + (houseW / beams) * i;
                ctx.beginPath();
                ctx.moveTo(x, houseY);
                ctx.lineTo(x, houseY + houseH);
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.moveTo(houseX, houseY + houseH / 2);
            ctx.lineTo(houseX + houseW, houseY + houseH / 2);
            ctx.stroke();

            for (let i = 0; i < beams; i++) {
                const x1 = houseX + (houseW / beams) * i;
                const x2 = houseX + (houseW / beams) * (i + 1);
                const y1 = houseY;
                const y2 = houseY + houseH / 2;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x2, y1);
                ctx.lineTo(x1, y2);
                ctx.stroke();
            }

            ctx.fillStyle = "#8b0000";
            ctx.beginPath();
            ctx.moveTo(houseX - 20, houseY);
            ctx.lineTo(houseX + houseW / 2, houseY - houseH * 0.75);
            ctx.lineTo(houseX + houseW + 20, houseY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            const windowW = houseW / 8;
            const windowH = houseH / 5;
            const windowPadding = houseW / 12;
            ctx.fillStyle = "#add8e6";

            for (let r = 0; r < 2; r++) {
                for (let c = 0; c < 3; c++) {
                    const wx = houseX + windowPadding + c * (windowW + windowPadding);
                    const wy = houseY + windowPadding + r * (windowH + windowPadding);
                    ctx.fillRect(wx, wy, windowW, windowH);
                    ctx.strokeRect(wx, wy, windowW, windowH);

                    ctx.fillStyle = "#8b4513";
                    ctx.fillRect(wx, wy + windowH, windowW, 8);
                    ctx.fillStyle = "green";
                    ctx.beginPath();
                    ctx.arc(wx + windowW / 4, wy + windowH + 4, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(wx + (windowW * 3) / 4, wy + windowH + 4, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = "#add8e6";
                }
            }

            const doorW = houseW / 6;
            const doorH = houseH / 3;
            const doorX = houseX + houseW / 2 - doorW / 2;
            const doorY = houseY + houseH - doorH;

            ctx.fillStyle = "#654321";
            ctx.fillRect(doorX, doorY, doorW, doorH);
            ctx.strokeRect(doorX, doorY, doorW, doorH);

            ctx.beginPath();
            ctx.arc(doorX + doorW - 10, doorY + doorH / 2, 3, 0, 2 * Math.PI);
            ctx.fillStyle = "gold";
            ctx.fill();

            ctx.fillStyle = "black";
            ctx.font = `${Math.floor(houseH / 10)}px serif`;
            ctx.textAlign = "center";
            ctx.fillText("Gasthaus", houseX + houseW / 2, houseY - 10);
        }
        const scenes = {
            white: (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, w, h);

            }
            ,
            black: (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, w, h);

            }
            ,
            gray: (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;
                ctx.fillStyle = 'lightGray';
                ctx.fillRect(0, 0, w, h);

            }
            ,

            sunset: (ctx) => {
                let gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
                gradient.addColorStop(0, "#FFA500");
                gradient.addColorStop(0.3, "#FFD580");
                gradient.addColorStop(0.6, "#87CEFA");
                gradient.addColorStop(1, "#E0FFFF");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            },
            twilightzone: (ctx, index) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;
                const centerX = w / 2;
                const centerY = h / 2;

                const bg = ctx.createLinearGradient(0, 0, 0, h);
                bg.addColorStop(0, "#2C3E50");
                bg.addColorStop(1, "#FD746C");
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, w, h);

            }
            ,
            starynight: (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                let sky = ctx.createLinearGradient(0, 0, 0, h);
                sky.addColorStop(0, "#0D1B2A");
                sky.addColorStop(1, "#1B263B");
                ctx.fillStyle = sky;
                ctx.fillRect(0, 0, w, h);

                const swirls = [
                    { x: w * 0.3, y: h * 0.3, r: 60 },
                    { x: w * 0.5, y: h * 0.4, r: 40 },
                    { x: w * 0.7, y: h * 0.25, r: 50 }
                ];
                ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
                ctx.lineWidth = 4;
                ctx.lineCap = "round";
                swirls.forEach(s => {
                    ctx.beginPath();
                    for (let a = 0; a < Math.PI * 2; a += 0.1) {
                        const x = s.x + Math.cos(a) * (s.r + 5 * Math.sin(a * 6));
                        const y = s.y + Math.sin(a) * (s.r + 5 * Math.sin(a * 6));
                        if (a === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                });

                const stars = Array.from({ length: 30 }).map(() => ({
                    x: Math.random() * w,
                    y: Math.random() * h * 0.6,
                    r: Math.random() * 2 + 1
                }));
                stars.forEach(star => {
                    const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.r * 4);
                    gradient.addColorStop(0, "rgba(255, 255, 200, 1)");
                    gradient.addColorStop(1, "rgba(255, 255, 200, 0)");
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(star.x, star.y, star.r * 4, 0, Math.PI * 2);
                    ctx.fill();
                });

                ctx.beginPath();
                ctx.moveTo(0, h);
                ctx.bezierCurveTo(w * 0.3, h * 0.7, w * 0.7, h * 0.9, w, h * 0.8);
                ctx.lineTo(w, h);
                ctx.closePath();
                ctx.fillStyle = "#0B132B";
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(w * 0.1, h);
                ctx.quadraticCurveTo(w * 0.11, h * 0.7, w * 0.13, h);
                ctx.closePath();
                ctx.fillStyle = "#1C2541";
                ctx.fill();
            },
            "cloudy-blue-sky": (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                const sky = ctx.createLinearGradient(0, 0, 0, h);
                sky.addColorStop(0, "#E7F3FF");
                sky.addColorStop(1, "#F9FCFF");
                ctx.fillStyle = sky;
                ctx.fillRect(0, 0, w, h);

            },

            "graph-paper": (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, w, h);

                const spacing = 25;

                ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
                ctx.lineWidth = 1;

                for (let x = spacing; x < w; x += spacing) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, h);
                    ctx.stroke();
                }

                for (let y = spacing; y < h; y += spacing) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }

                ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
                ctx.lineWidth = 1;

                for (let x = spacing * 5; x < w; x += spacing * 5) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, h);
                    ctx.stroke();
                }
                for (let y = spacing * 5; y < h; y += spacing * 5) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }
            },

            "draft-paper": (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                ctx.fillStyle = "#FAF3DD";
                ctx.fillRect(0, 0, w, h);

                ctx.strokeStyle = "rgba(0,0,0,0.1)";
                ctx.lineWidth = 1;

                for (let i = -h; i < w; i += 40) {
                    ctx.beginPath();
                    ctx.moveTo(i, 0);
                    ctx.lineTo(i + h, h);
                    ctx.stroke();
                }
                for (let i = 0; i < w + h; i += 40) {
                    ctx.beginPath();
                    ctx.moveTo(i, 0);
                    ctx.lineTo(i - h, h);
                    ctx.stroke();
                }
            },

            "blank-canvas": (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                ctx.fillStyle = "#FDFBF7";
                ctx.fillRect(0, 0, w, h);

                for (let i = 0; i < 300; i++) {
                    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.015})`;
                    const x = Math.random() * w;
                    const y = Math.random() * h;
                    ctx.fillRect(x, y, 1, 1);
                }
            },
            "back-of-the-envelope": (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                ctx.fillStyle = "#ffffffff";
                ctx.fillRect(0, 0, w, h);

                ctx.fillStyle = "rgba(0,0,0,0.04)";
                for (let y = 0; y < h; y += 40) {
                    for (let x = 0; x < w; x += 40) {
                        ctx.fillRect(x + 3, y + 7, 2, 2);
                        ctx.fillRect(x + 15, y + 22, 1.5, 1.5);
                        ctx.fillRect(x + 28, y + 10, 1, 1);
                    }
                }

                ctx.strokeStyle = "rgba(0,0,0,0.05)";
                ctx.lineWidth = 1;

                for (let y = 10; y < h; y += 22) {
                    ctx.beginPath();
                    for (let x = 0; x < w; x++) {

                        const offset = Math.sin(x * 0.01 + y * 0.1) * 1.5;
                        ctx.lineTo(x, y + offset);
                    }
                    ctx.stroke();
                }

                const crease = ctx.createLinearGradient(0, 0, w, h);
                crease.addColorStop(0, "rgba(255,255,255,0.05)");
                crease.addColorStop(0.5, "rgba(0,0,0,0.06)");
                crease.addColorStop(1, "rgba(255,255,255,0.05)");

                ctx.fillStyle = crease;
                ctx.fillRect(0, 0, w, h);

                const vign = ctx.createRadialGradient(
                    w / 2, h / 2, 0,
                    w / 2, h / 2, Math.max(w, h)
                );
                vign.addColorStop(0, "rgba(0,0,0,0.00)");
                vign.addColorStop(1, "rgba(0,0,0,0.10)");

                ctx.fillStyle = vign;
                ctx.fillRect(0, 0, w, h);
            },

            "sketch-pad": (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                ctx.fillStyle = "#FFFFF2";
                ctx.fillRect(0, 0, w, h);

                for (let i = 0; i < 150; i++) {
                    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
                    const x = Math.random() * w;
                    const y = Math.random() * h;
                    ctx.fillRect(x, y, 2, 2);
                }
            },

            sunrise: (ctx) => {
                let gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
                gradient.addColorStop(0, "#FFFAE3");
                gradient.addColorStop(0.3, "#FFD6A5");
                gradient.addColorStop(0.6, "#FFB5E8");
                gradient.addColorStop(1, "#C3F8FF");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            },
            ocean_view: (ctx) => {
                let gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
                gradient.addColorStop(0, "#4FACFE");
                gradient.addColorStop(0.5, "#00F2FE");
                gradient.addColorStop(1, "#43E97B");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            },
            darknight: (ctx) => {
                let gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
                gradient.addColorStop(0, "#0F2027");
                gradient.addColorStop(0.5, "#203A43");
                gradient.addColorStop(1, "#2C5364");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            },
            citylights: (ctx) => {
                let gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
                gradient.addColorStop(0, "#1D2671");
                gradient.addColorStop(0.4, "#C33764");
                gradient.addColorStop(0.7, "#FFD700");
                gradient.addColorStop(1, "#FFFAE3");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            },
            drawCactus: (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                const gradient = ctx.createLinearGradient(0, 0, 0, h);
                gradient.addColorStop(0, "#FF914D");
                gradient.addColorStop(0.4, "#FFD580");
                gradient.addColorStop(0.8, "#F5F5DC");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, w, h);
                ctx.save();
                const cactusHeight = 30;
                const cactusWidth = 6;
                const baseX = w - 20;
                const baseY = h - 10;

                ctx.beginPath();
                ctx.moveTo(baseX - cactusWidth / 2, baseY);
                ctx.lineTo(baseX - cactusWidth / 2, baseY - cactusHeight + 5);
                ctx.quadraticCurveTo(
                    baseX, baseY - cactusHeight,
                    baseX + cactusWidth / 2, baseY - cactusHeight + 5
                );
                ctx.lineTo(baseX + cactusWidth / 2, baseY);
                ctx.closePath();
                ctx.fillStyle = '#228B22';
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(baseX - cactusWidth / 2, baseY - cactusHeight / 2);
                ctx.quadraticCurveTo(
                    baseX - 10, baseY - cactusHeight / 2 - 3,
                    baseX - 6, baseY - cactusHeight / 2 - 8
                );
                ctx.lineTo(baseX - 4, baseY - cactusHeight / 2 - 8);
                ctx.quadraticCurveTo(
                    baseX - 6, baseY - cactusHeight / 2 - 3,
                    baseX - cactusWidth / 2 + 1, baseY - cactusHeight / 2
                );
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.ellipse(baseX, baseY + 2, 8, 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
                ctx.fill();

                ctx.restore();
            },
            mountainview: (ctx) => {
                let gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
                gradient.addColorStop(0, "#A1C4FD");
                gradient.addColorStop(0.4, "#C2E9FB");
                gradient.addColorStop(0.7, "#E0F7FA");
                gradient.addColorStop(1, "#ECE9E6");
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            },
            OceanBoat: (ctx) => {
                OceanBoat(ctx)
            },
            StaryNight: (ctx) => {
                StaryNight(ctx)
            },
            Vangogh: (ctx) => {
                Vangogh(ctx)
            },
            BavarianTown: (ctx) => {

                function drawHouses(ctx, w, h) {
                    drawHouse(ctx, w * 0.2, h * 0.7, 90, 100);
                    drawHouse(ctx, w * 0.4, h * 0.72, 80, 90);
                    drawHouse(ctx, w * 0.6, h * 0.69, 85, 95);
                }

                function drawHouse(ctx, x, y, width, height) {

                    ctx.fillStyle = '#fdf5e6';
                    ctx.fillRect(x, y, width, height);

                    ctx.fillStyle = '#8b0000';
                    ctx.beginPath();
                    ctx.moveTo(x - 10, y);
                    ctx.lineTo(x + width / 2, y - height / 2);
                    ctx.lineTo(x + width + 10, y);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();

                    ctx.strokeStyle = '#5c4033';
                    ctx.lineWidth = 4;

                    ctx.beginPath();
                    ctx.moveTo(x, y + height / 2);
                    ctx.lineTo(x + width, y + height / 2);
                    ctx.stroke();

                    for (let i = 1; i < 3; i++) {
                        const xi = x + (i * width) / 3;
                        ctx.beginPath();
                        ctx.moveTo(xi, y);
                        ctx.lineTo(xi, y + height);
                        ctx.stroke();
                    }

                    ctx.fillStyle = '#add8e6';
                    const winW = width / 6;
                    const winH = height / 5;
                    ctx.fillRect(x + width * 0.2, y + height * 0.25, winW, winH);
                    ctx.fillRect(x + width * 0.6, y + height * 0.25, winW, winH);

                    ctx.fillStyle = '#654321';
                    const dW = width / 4;
                    const dH = height / 3;
                    ctx.fillRect(x + width / 2 - dW / 2, y + height - dH, dW, dH);
                }

                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                const off = document.createElement('canvas');
                off.width = w;
                off.height = h;
                const offctx = off.getContext('2d');
                const sky = offctx.createLinearGradient(0, 0, 0, h);
                sky.addColorStop(0, "#87CEEB");
                sky.addColorStop(1, "#ffffff");
                offctx.fillStyle = sky;
                offctx.fillRect(0, 0, w, h);

                const mountainColor = "#a9a9a93c";
                offctx.fillStyle = mountainColor;
                offctx.beginPath();
                offctx.moveTo(0, h * 0.6);
                offctx.lineTo(w * 0.2, h * 0.3);
                offctx.lineTo(w * 0.4, h * 0.6);
                offctx.lineTo(w * 0.6, h * 0.35);
                offctx.lineTo(w * 0.8, h * 0.6);
                offctx.lineTo(w, h * 0.4);
                offctx.lineTo(w, h);
                offctx.lineTo(0, h);
                offctx.closePath();
                offctx.fill();

                function drawPineTree(ctx, x, y, width, height) {
                    ctx.fillStyle = "green";
                    const levels = 3;
                    for (let i = 0; i < levels; i++) {
                        const lw = width * (1 - i * 0.3);
                        const ly = y - i * (height / levels);
                        ctx.beginPath();
                        ctx.moveTo(x, ly);
                        ctx.lineTo(x - lw / 2, ly + height / levels);
                        ctx.lineTo(x + lw / 2, ly + height / levels);
                        ctx.closePath();
                        ctx.fill();
                    }

                    ctx.fillStyle = "#8b4513";
                    ctx.fillRect(x - width / 10, y, width / 5, height / 5);
                }

                drawPineTree(offctx, w * 0.1, h * 0.65, 40, 80);
                drawPineTree(offctx, w * 0.85, h * 0.68, 50, 90);
                drawPineTree(offctx, w * 0.5, h * 0.6, 30, 70);

                for (let i = 0; i < 50; i++) {
                    const houseW = 15 * 10;
                    const houseH = 15 + 0.2 * 10;
                    const houseX = 0.4 * w;
                    const houseY = h * (0.4 * 0.25);
                    drawHouse(offctx, houseX, houseY, houseW, houseH);
                }

                offctx.fillStyle = "#ccc";
                offctx.beginPath();
                offctx.moveTo(w * 0.3, h * 0.85);
                offctx.lineTo(w * 0.7, h * 0.85);
                offctx.lineTo(w * 0.75, h);
                offctx.lineTo(w * 0.25, h);
                offctx.closePath();
                offctx.fill();

                ctx.filter = 'blur(70px)';
                ctx.drawImage(off, 0, 0);
                ctx.filter = 'none';

            },
            PokerNight: (ctx) => {
                PokerNight(ctx)
            },

            BavarianFacade: (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                const off = document.createElement('canvas');
                off.width = w;
                off.height = h;
                const offCtx = off.getContext('2d');

                drawGasthausScene(offCtx, w, h);

                ctx.filter = 'blur(20px)';
                ctx.drawImage(off, 0, 0);
                ctx.filter = 'none';
            },
            WallStreet: (ctx) => {
                WallStreet(ctx)
            },

            distantMountains: (ctx) => {
                const w = ctx.canvas.width;
                const h = ctx.canvas.height;

                let skyGradient = ctx.createLinearGradient(0, 0, 0, h);
                skyGradient.addColorStop(0, "#87CEEB");
                skyGradient.addColorStop(1, "#E6F5FF");
                ctx.fillStyle = skyGradient;
                ctx.fillRect(0, 0, w, h);

                const peaks = [
                    { x: 0, y: h * 0.75 }, { x: w * 0.05, y: h * 0.6 }, { x: w * 0.12, y: h * 0.65 },
                    { x: w * 0.2, y: h * 0.5 }, { x: w * 0.28, y: h * 0.58 }, { x: w * 0.35, y: h * 0.46 },
                    { x: w * 0.42, y: h * 0.52 }, { x: w * 0.5, y: h * 0.48 }, { x: w * 0.6, y: h * 0.55 },
                    { x: w * 0.7, y: h * 0.5 }, { x: w * 0.78, y: h * 0.58 }, { x: w * 0.85, y: h * 0.54 },
                    { x: w * 0.93, y: h * 0.6 }, { x: w, y: h * 0.55 }, { x: w, y: h }, { x: 0, y: h }
                ];

                ctx.beginPath();
                peaks.forEach((p, i) => {
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.fillStyle = "#3A4A64";
                ctx.fill();

                ctx.beginPath();
                for (let i = 1; i < peaks.length - 2; i++) {
                    const p1 = peaks[i];
                    const p2 = peaks[i + 1];
                    if (p2.x < p1.x) {
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.lineTo(p2.x, h);
                        ctx.lineTo(p1.x, h);
                        ctx.closePath();
                    }
                }
                ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
                ctx.fill();

                ctx.beginPath();
                for (let i = 1; i < peaks.length - 2; i++) {
                    const p1 = peaks[i];
                    const p2 = peaks[i + 1];
                    if (p2.x > p1.x) {
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.lineTo(p2.x, h);
                        ctx.lineTo(p1.x, h);
                        ctx.closePath();
                    }
                }
                ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
                ctx.fill();

                const fog = ctx.createLinearGradient(0, h * 0.75, 0, h);
                fog.addColorStop(0, "rgba(255,255,255,0)");
                fog.addColorStop(1, "rgba(255,255,255,0.3)");
                ctx.fillStyle = fog;
                ctx.fillRect(0, h * 0.75, w, h * 0.25);
            }
        };
        resolve(scenes)

    })
}
