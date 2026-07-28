function () {

    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js');

        class Monomer {
            x;
            y;
            symb;
            constructor(symb, x, y) {
                this.x = x;
                this.y = y;
                this.symb = symb;
            }
            draw(grid, ctx) {

                ctx.fillRect(grid.X(x), grid.Y(y), grid.screenWidth(1), grid.screenHeight(1), 'blue');
            }
        }
        class Polymer {
            monomer = [];
            grid;

            constructor() {
                const xi = 0;
                const yi = 0;
                const wi = 100;
                const hi = 100;
                this.grid = new MGrid(xi, yi, wi, hi);
                this.grid.setxmax(100);
                this.grid.setymax(1);
                this.grid.setxmin(0);
                this.grid.setymin(0);
                this.grid.setInset(0, 0)
                this.grid.rescale();
            }

            draw(x, y, w, h, ctx) {
                this.grid.setWidth(w);
                this.grid.setHeight(h);
                this.grid.xi = x; this.grid.yi = y;
                this.grid.rescale();
                for (let m of this.monomer) {
                    m.draw(this.grid, ctx)
                }
            }
        }
        resolve({ Monomer: Monomer, Polymer: Polymer })
    });

}
