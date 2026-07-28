function () {

    return new Promise(async (resolve, reject) => {
        const SVG_NS = "http://www.w3.org/2000/svg";

        class GridSVGRenderer {

            constructor(grid) {

                this.grid = {
                    xmin: grid.xmin,
                    xmax: grid.xmax,
                    ymin: grid.ymin,
                    ymax: grid.ymax
                };

                this.worldWidth = this.grid.xmax - this.grid.xmin;
                this.worldHeight = this.grid.ymax - this.grid.ymin;

                this.svg = document.createElementNS(SVG_NS, "svg");
                this.svg.setAttribute("xmlns", SVG_NS);

                this.svg.setAttribute(
                    "viewBox",
                    `${this.grid.xmin} ${this.grid.ymin} ${this.worldWidth} ${this.worldHeight}`
                );
            }

            setSize(widthPx, heightPx) {
                if (widthPx != null) this.svg.setAttribute("width", widthPx);
                if (heightPx != null) this.svg.setAttribute("height", heightPx);
            }

            worldX(xwc) {
                return xwc;
            }

            worldY(ywc) {

                return this.grid.ymax - ywc + this.grid.ymin;
            }

            line(x1, y1, x2, y2, attrs = {}) {
                const el = document.createElementNS(SVG_NS, "line");
                el.setAttribute("x1", this.worldX(x1));
                el.setAttribute("y1", this.worldY(y1));
                el.setAttribute("x2", this.worldX(x2));
                el.setAttribute("y2", this.worldY(y2));

                this._applyAttrs(el, attrs);
                this.svg.appendChild(el);
                return el;
            }

            rect(x, y, w, h, attrs = {}) {
                const el = document.createElementNS(SVG_NS, "rect");

                const xSvg = this.worldX(x);

                const ySvgTop = this.worldY(y + h);

                el.setAttribute("x", xSvg);
                el.setAttribute("y", ySvgTop);
                el.setAttribute("width", w);
                el.setAttribute("height", h);

                this._applyAttrs(el, attrs);
                this.svg.appendChild(el);
                return el;
            }

            text(x, y, textContent, attrs = {}) {
                const el = document.createElementNS(SVG_NS, "text");
                el.setAttribute("x", this.worldX(x));
                el.setAttribute("y", this.worldY(y));
                el.textContent = textContent;

                this._applyAttrs(el, attrs);
                this.svg.appendChild(el);
                return el;
            }
            polyline(points, attrs = {}) {
                const el = document.createElementNS(SVG_NS, "polyline");
                const pts = points
                    .map(p => `${this.worldX(p.x)},${this.worldY(p.y)}`)
                    .join(" ");

                el.setAttribute("points", pts);
                this._applyAttrs(el, attrs);
                this.svg.appendChild(el);
                return el;
            }

            getElement() {
                return this.svg;
            }
            toString() {
                const serializer = new XMLSerializer();
                return serializer.serializeToString(this.svg);
            }

            _applyAttrs(el, attrs) {
                for (const k in attrs) {
                    if (attrs[k] != null) {
                        el.setAttribute(k, String(attrs[k]));
                    }
                }
            }
        }

        return resolve(GridSVGRenderer);
    })
}
