function () {

    return new Promise(async (resolve, reject) => {

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        class AnimateGrid {

            static INTERUPT = false;
            grid;

            constructor(grid) {
                this.grid = grid;
                AnimateGrid.INTERUPT = false;

            }

            async zoomAspectRatio(xmin, xmax, _ymin, _ymax, aspectRatio = 1, increment = 56) {

                let dx = xmax - xmin;

                let dy = dx / aspectRatio;

                let yc = (this.grid.getymax() + this.grid.getymin()) / 2;
                let ymin = yc - dy / 2;
                let ymax = yc + dy / 2;

                if (ymin < _ymin) {
                    ymin = _ymin;
                    ymax = ymin + dy;
                }

                if (ymax > _ymax) {
                    ymax = _ymax;
                    ymin = ymax - dy;
                }
                await this.animateTo(xmin, xmax, ymin, ymax, increment);
            }

            async zoomWithAspectRatio(xmin, xmax, ymin, ymax, increment = 159) {
                return new Promise(async (resolve) => {

                    let increment_ = increment;

                    let translateMaxX = (this.grid.getxmax() - xmax) / increment_;
                    let translateMinX = (this.grid.getxmin() - xmin) / increment_;
                    let translateMaxY = (this.grid.getymax() - ymax) / increment_;
                    let translateMinY = (this.grid.getymin() - ymin) / increment_;

                    for (let i = 0; i < increment_; i++) {

                        if (AnimateGrid.INTERUPT) {
                            return;
                        }

                        let max = this.grid.getxmax() - translateMaxX;
                        let min = this.grid.getxmin() - translateMinX;
                        if (max > min) {
                            this.grid.setxmin(min);
                            this.grid.setxmax(max);
                        }

                        max = this.grid.getymax() - translateMaxY;
                        min = this.grid.getymin() - translateMinY;

                        if (max > min) {
                            this.grid.setymin(min);
                            this.grid.setymax(max);
                        } else {
                            this.grid.setymin(ymin);
                            this.grid.setymax(ymax);
                            i = increment_;
                        }

                        await sleep(10);
                    }

                    this.grid.setxmin(xmin);
                    this.grid.setxmax(xmax);
                    this.grid.setymin(ymin);
                    this.grid.setymax(ymax);
                    this.grid.rescale();

                    return resolve();
                });
            }
            async animateToSTOP(
                xmin, xmax, ymin, ymax, increment,
                wellWorldW = 1, wellWorldH = 1,
                targetPxW = 200, targetPxH = 50,
                anchor = 'center', anchorTopY = null,
                lockWorldPerPixel = null
            ) {
                return new Promise(async (resolve, reject) => {
                    try {
                        const steps = increment || 20;
                        const EPS = 1e-9;

                        const sxmin = this.grid.getxmin();
                        const sxmax = this.grid.getxmax();
                        const symin = this.grid.getymin();
                        const symax = this.grid.getymax();

                        if (
                            Math.abs(sxmin - xmin) < EPS &&
                            Math.abs(sxmax - xmax) < EPS &&
                            Math.abs(symin - ymin) < EPS &&
                            Math.abs(symax - ymax) < EPS
                        ) {
                            return resolve();
                        }

                        const minWFromPixels = (wellWorldW * this.grid.width) / targetPxW;
                        const minHFromPixels = (wellWorldH * this.grid.height) / targetPxH;

                        const lockW = lockWorldPerPixel
                            ? lockWorldPerPixel * this.grid.width
                            : minWFromPixels;

                        const lockH = lockWorldPerPixel
                            ? lockWorldPerPixel * this.grid.height
                            : minHFromPixels;

                        const buildFinalTarget = () => {

                            let txmin = xmin, txmax = xmax, tymin = ymin, tymax = ymax;

                            let tW = txmax - txmin;
                            let tH = tymax - tymin;

                            const finalW = lockWorldPerPixel ? lockW : Math.max(tW, lockW);
                            const finalH = lockWorldPerPixel ? lockH : Math.max(tH, lockH);

                            const cx = (txmin + txmax) / 2;
                            txmin = cx - finalW / 2;
                            txmax = cx + finalW / 2;

                            if (anchor === 'top' && anchorTopY != null) {
                                tymin = anchorTopY;
                                tymax = anchorTopY + finalH;
                            } else if (anchor === 'bottom') {
                                const bottom = tymax;
                                tymin = bottom - finalH;
                                tymax = bottom;
                            } else {
                                const cy = (tymin + tymax) / 2;
                                tymin = cy - finalH / 2;
                                tymax = cy + finalH / 2;
                            }

                            return { txmin, txmax, tymin, tymax, finalW, finalH };
                        };

                        const { txmin, txmax, tymin, tymax, finalW, finalH } = buildFinalTarget();

                        if (
                            Math.abs(sxmin - txmin) < EPS &&
                            Math.abs(sxmax - txmax) < EPS &&
                            Math.abs(symin - tymin) < EPS &&
                            Math.abs(symax - tymax) < EPS
                        ) {
                            this.grid.setxmin(txmin);
                            this.grid.setxmax(txmax);
                            this.grid.setymin(tymin);
                            this.grid.setymax(tymax);
                            this.grid.rescale();
                            return resolve();
                        }

                        const dxmin = (txmin - sxmin) / steps;
                        const dxmax = (txmax - sxmax) / steps;
                        const dymin = (tymin - symin) / steps;
                        const dymax = (tymax - symax) / steps;

                        const alignYWithAnchor = (height) => {
                            let yMin, yMax;
                            if (anchor === 'top' && anchorTopY != null) {
                                yMin = anchorTopY;
                                yMax = anchorTopY + height;
                            } else if (anchor === 'bottom') {
                                const bottom = tymax;
                                yMin = bottom - height;
                                yMax = bottom;
                            } else {
                                const cy = (tymin + tymax) / 2;
                                yMin = cy - height / 2;
                                yMax = cy + height / 2;
                            }
                            return [yMin, yMax];
                        };

                        for (let i = 1; i <= steps; i++) {
                            if (AnimateGrid.INTERUPT) return resolve();

                            const nxmin = sxmin + dxmin * i;
                            const nxmax = sxmax + dxmax * i;
                            const nymin = symin + dymin * i;
                            const nymax = symax + dymax * i;

                            if (nxmax > nxmin && nymax > nymin) {
                                this.grid.setxmin(nxmin);
                                this.grid.setxmax(nxmax);
                                this.grid.setymin(nymin);
                                this.grid.setymax(nymax);
                            }

                            this.grid.rescale();

                            let curW = this.grid.getxmax() - this.grid.getxmin();
                            let curH = this.grid.getymax() - this.grid.getymin();

                            const widthAtTarget = Math.abs(curW - finalW) <= EPS;
                            const heightAtTarget = Math.abs(curH - finalH) <= EPS;

                            if (widthAtTarget || heightAtTarget) {
                                const cx = (txmin + txmax) / 2;
                                const [anchoredYMin, anchoredYMax] = alignYWithAnchor(

                                    widthAtTarget ? curH : finalH
                                );

                                let outXMin, outXMax;
                                if (widthAtTarget) {
                                    outXMin = cx - finalW / 2;
                                    outXMax = cx + finalW / 2;
                                } else {

                                    outXMin = cx - curW / 2;
                                    outXMax = cx + curW / 2;
                                }

                                const outYMin = anchoredYMin;
                                const outYMax = anchoredYMax;

                                this.grid.setxmin(outXMin);
                                this.grid.setxmax(outXMax);
                                this.grid.setymin(outYMin);
                                this.grid.setymax(outYMax);
                                this.grid.rescale();
                                return resolve();
                            }

                            if (
                                Math.abs(this.grid.getxmin() - txmin) <= EPS &&
                                Math.abs(this.grid.getxmax() - txmax) <= EPS &&
                                Math.abs(this.grid.getymin() - tymin) <= EPS &&
                                Math.abs(this.grid.getymax() - tymax) <= EPS
                            ) {
                                return resolve();
                            }

                            await sleep(10);
                        }

                        this.grid.setxmin(txmin);
                        this.grid.setxmax(txmax);
                        this.grid.setymin(tymin);
                        this.grid.setymax(ymax);
                        this.grid.rescale();

                        const wW = this.grid.getxmax() - this.grid.getxmin();
                        const wH = this.grid.getymax() - this.grid.getymin();
                        if (Math.abs(wW - finalW) > EPS || Math.abs(wH - finalH) > EPS) {

                            const cx = (this.grid.getxmin() + this.grid.getxmax()) / 2;
                            const [yMinAdj, yMaxAdj] = alignYWithAnchor(finalH);
                            this.grid.setxmin(cx - finalW / 2);
                            this.grid.setxmax(cx + finalW / 2);
                            this.grid.setymin(yMinAdj);
                            this.grid.setymax(yMaxAdj);
                            this.grid.rescale();
                        }

                        return resolve();
                    } catch (err) {
                        return reject(err);
                    }
                });
            }

            async animateTo(
                xmin, xmax, ymin, ymax, increment,
                wellWorldW = 1, wellWorldH = 1,
                targetPxW = 200, targetPxH = 50,
                anchor = 'center', anchorTopY = null,
                lockWorldPerPixel = null
            ) {
                console.log('[animateTo] ENTER', {
                    xmin, xmax, ymin, ymax, increment,
                    wellWorldW, wellWorldH, targetPxW, targetPxH,
                    anchor, anchorTopY, lockWorldPerPixel
                });

                return new Promise(async (resolve, reject) => {
                    try {
                        const steps = increment || 20;
                        console.log('[animateTo] steps =', steps);

                        let cxmin = this.grid.getxmin();
                        let cxmax = this.grid.getxmax();
                        let cymin = this.grid.getymin();
                        let cymax = this.grid.getymax();

                        console.log('[animateTo] current grid', { cxmin, cxmax, cymin, cymax });

                        if (cxmin === xmin && cxmax === xmax && cymin === ymin && cymax === ymax) {
                            console.log('[animateTo] already at target bounds, resolving immediately');
                            return resolve();
                        }

                        const dMaxX = (cxmax - xmax) / steps;
                        const dMinX = (cxmin - xmin) / steps;
                        const dMaxY = (cymax - ymax) / steps;
                        const dMinY = (cymin - ymin) / steps;

                        const MIN_WORLD_SIZE = 0.001;

                        const lockW = MIN_WORLD_SIZE;
                        const lockH = MIN_WORLD_SIZE;

                        const EPS = 1e-9;

                        const applyClampToExactScale = () => {

                            let wxmin = this.grid.getxmin();
                            let wxmax = this.grid.getxmax();
                            let wymin = this.grid.getymin();
                            let wymax = this.grid.getymax();

                            let wW = wxmax - wxmin;
                            let wH = wymax - wymin;

                            if (wW < lockW - EPS) {
                                const cx = (wxmin + wxmax) / 2;
                                wxmin = cx - lockW / 2;
                                wxmax = cx + lockW / 2;
                                wW = lockW;
                            }

                            if (wH < lockH - EPS) {
                                if (anchor === 'top' && anchorTopY != null) {
                                    wymin = anchorTopY;
                                    wymax = anchorTopY + lockH;
                                } else if (anchor === 'bottom') {
                                    const bottom = wymax;
                                    wymin = bottom - lockH;
                                    wymax = bottom;
                                } else {
                                    const cy = (wymin + wymax) / 2;
                                    wymin = cy - lockH / 2;
                                    wymax = cy + lockH / 2;
                                }
                                wH = lockH;
                            }

                            this.grid.setxmin(wxmin);
                            this.grid.setxmax(wxmax);
                            this.grid.setymin(wymin);
                            this.grid.setymax(wymax);
                        };

                        for (let i = 0; i < steps; i++) {
                            if (AnimateGrid.INTERUPT) {
                                console.log('[animateTo] INTERRUPTED at step', i);
                                return resolve();
                            }

                            let max = cxmax - dMaxX * i;
                            let min = cxmin - dMinX * i;
                            if (max > min) {
                                this.grid.setxmin(min);
                                this.grid.setxmax(max);
                            }

                            max = cymax - dMaxY * i;
                            min = cymin - dMinY * i;
                            if (max > min) {
                                this.grid.setymin(min);
                                this.grid.setymax(max);
                            } else {

                                this.grid.setymin(ymin);
                                this.grid.setymax(ymax);
                            }

                            applyClampToExactScale();

                            const wW = this.grid.getxmax() - this.grid.getxmin();
                            const wH = this.grid.getymax() - this.grid.getymin();

                            const closeToScale =
                                Math.abs(wW - lockW) <= EPS &&
                                Math.abs(wH - lockH) <= EPS;

                            const gxmin = this.grid.getxmin();
                            const gxmax = this.grid.getxmax();
                            const gymin = this.grid.getymin();
                            const gymax = this.grid.getymax();

                            const closeToTarget =
                                Math.abs(gxmin - xmin) <= EPS &&
                                Math.abs(gxmax - xmax) <= EPS &&
                                Math.abs(gymin - ymin) <= EPS &&
                                Math.abs(gymax - ymax) <= EPS;

                            if (closeToScale && closeToTarget) {
                                console.log('[animateTo] early-exit: scale & target reached at step', i, {
                                    gxmin, gxmax, gymin, gymax, wW, wH
                                });
                                this.grid.rescale();
                                return resolve();
                            }

                            this.grid.rescale();
                            await sleep(10);
                        }

                        console.log('[animateTo] finished all steps, applying final snap');

                        this.grid.setxmin(xmin);
                        this.grid.setxmax(xmax);
                        this.grid.setymin(ymin);
                        this.grid.setymax(ymax);
                        applyClampToExactScale();
                        this.grid.rescale();

                        console.log('[animateTo] EXIT normally with final bounds', {
                            xmin: this.grid.getxmin(),
                            xmax: this.grid.getxmax(),
                            ymin: this.grid.getymin(),
                            ymax: this.grid.getymax()
                        });

                        return resolve();
                    } catch (err) {
                        console.error('[animateTo] ERROR', err);
                        return reject(err);
                    }
                });
            }

        }
        resolve(AnimateGrid)

    })

}
