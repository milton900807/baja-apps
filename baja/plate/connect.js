function () {

    return new Promise(async (resolve, reject) => {

        let Menu = await exec('flexigraph/menu')

        let Plate = await exec('baja/plate/plate')
        let MGrid = await exec('flexigraph/grid')
        let TableMatch = await exec('baja/table/table-matcher')
        let FunctionMatch = await exec('baja/table/function-matcher')
        class Connection {
            ref1 = null;
            ref2 = null;
            type;
            selected = false;
            visible = false;
            circleX = 0;
            circleY = 0;
            circleRadius = 15;
            option_menu = null;
            fun_menu = null;
            functionMenuY = 0;
            connections = []
            wx;
            wy;
            uid = uuid();
            name = ''

            catalyst = [];
            grid;

            table1;
            table2;

            constructor(refa, refb) {
                this.ref1 = refa;
                this.ref2 = refb;

                if (refa.uid) {
                    this.ref1 = refa.uid;
                    this.table1 = refa;
                }
                if (refb && refb.uid) {
                    this.refb = refb.uid;
                    this.table2 = refb;
                }
                this.grid = new MGrid(0, 0, 100, 100);
                this.circleRadius = 15;
            }

            find(uid) {
                if (uid === this.uid) {
                    return this;
                }
                for (let c of this.connections) {
                    return c.find(uid)
                }
                return null;
            }

            isValid(pt) {
                this.table1 = pt.getPlateWithUID(this.ref1);
                this.table2 = pt.getPlateWithUID(this.ref2);
                if (!this.table2 || !this.table1) {
                    return false
                }
                return true;
            }

            toJSON() {
                return {
                    ref1: this.ref1,
                    ref2: this.ref2,
                    type: this.type,
                    selected: this.selected,
                    visible: this.visible,
                    circleX: this.circleX,
                    circleY: this.circleY,
                    uid: this.uid,
                    circleRadius: this.circleRadius,
                    functionMenuY: this.functionMenuY,
                    connections: this.connections.map(connection => connection.toJSON())
                };
            }

            static buildConnectionFromJSON(jsonData, pt) {
                let ref1 = jsonData.ref1;
                let ref2 = jsonData.ref2;
                console.log('debubg');
                let connection = new Connection(ref1, ref2);
                connection.type = jsonData.type;
                connection.uid = jsonData.uid;
                connection.selected = jsonData.selected;
                connection.visible = jsonData.visible;
                connection.circleX = jsonData.circleX;
                connection.circleY = jsonData.circleY;
                connection.circleRadius = jsonData.circleRadius;
                if (Array.isArray(jsonData.connections)) {
                    connection.connections = jsonData.connections.map(conn => Connection.buildConnectionFromJSON(conn, pt));
                }
                return connection;
            }

            last_touched = -Infinity;
            getLastTouched (){
                return this.last_touched;
            }

            draw(pt, ctx) {
                let grid = pt.grid;
                for (let cc of this.connections) {
                    cc.draw(pt, ctx);
                }
                if (!this.table1 || typeof this.table1 === "string" || typeof this.table1 === "number") {

                    this.table1 = pt.getPlateWithUID(this.ref1);

                }
                if (!this.table2 || typeof this.table2 === "string" || typeof this.table2 === "number") {

                    this.table2 = pt.getPlateWithUID(this.ref2)
                }
                if (this.table1 && this.table2) {

                    if (this.type === 'creator' || typeof this.table1 === "string") {

                        let table2_screen_x = grid.X(this.table2.grid.xi);
                        let table2_screen_y = grid.Y(this.table2.grid.yi);
                        let table2_screen_w = grid.screenWidth(this.table2.grid.width);
                        let table2_screen_h = grid.screenHeight(this.table2.grid.height);
                        let table2_mid_x = table2_screen_x + table2_screen_w / 2;
                        let table2_mid_y = table2_screen_y + (-1) * table2_screen_h / 2;

                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 5;
                        ctx.shadowOffsetY = 5;
                        ctx.strokeStyle = 'rgba(100,100,100,0.8)'

                        ctx.setLineDash([5, 5]);

                        ctx.beginPath();
                        let scx = this.table1.circleX;
                        let scy = this.table1.functionMenuY;

                        ctx.moveTo(scx, scy);
                        ctx.lineTo(table2_mid_x, table2_mid_y);
                        ctx.stroke();

                        ctx.setLineDash([]);

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                    }

                    else {

                        let table1_screen_x = grid.X(this.table1.grid.xi);
                        let table1_screen_y = grid.Y(this.table1.grid.yi);
                        let table1_screen_w = grid.screenWidth(this.table1.grid.width);
                        let table1_screen_h = grid.screenHeight(this.table1.grid.height);
                        let table1_mid_x = table1_screen_x + table1_screen_w / 2;
                        let table1_mid_y = table1_screen_y + (-1) * table1_screen_h / 2;

                        let table2_screen_x = grid.X(this.table2.grid.xi);
                        let table2_screen_y = grid.Y(this.table2.grid.yi);
                        let table2_screen_w = grid.screenWidth(this.table2.grid.width);
                        let table2_screen_h = grid.screenHeight(this.table2.grid.height);
                        let table2_mid_x = table2_screen_x + table2_screen_w / 2;
                        let table2_mid_y = table2_screen_y + (-1) * table2_screen_h / 2;

                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 5;
                        ctx.shadowOffsetY = 5;

                        ctx.beginPath();
                        ctx.moveTo(table1_mid_x, table1_mid_y);
                        ctx.lineTo(table2_mid_x, table2_mid_y);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'black';
                        ctx.stroke();

                        let mid_x = (table1_mid_x + table2_mid_x) / 2;
                        let mid_y = (table1_mid_y + table2_mid_y) / 2;

                        this.circleX = mid_x;
                        this.circleY = mid_y;
                        this.grid.xi = grid.Xwc ( this.circleX )
                        this.grid.yi = grid.Ywc ( this.circleY )
                        this.grid.width = grid.worldWidth ( this.circleRadius )
                        this.grid.height = grid.worldHeight ( this.circleRadius )

                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 5;
                        ctx.shadowOffsetY = 5;

                        ctx.beginPath();
                        ctx.arc(mid_x, mid_y, this.circleRadius, 0, 2 * Math.PI);
                        ctx.fillStyle = this.option_menu ? 'lightRed' : 'lightBlue';
                        ctx.fill();
                        ctx.stroke();
                        ctx.fillStyle = 'black';
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('', mid_x, mid_y);

                        if (this.type) {
                            ctx.font = '14px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.fillText(this.type, this.circleX, this.circleY - this.circleRadius - 10);

                            let lineEndY = this.circleY + this.circleRadius + 50;
                            ctx.beginPath();
                            ctx.moveTo(this.circleX, this.circleY + this.circleRadius);
                            ctx.lineTo(this.circleX, lineEndY);
                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 2;
                            ctx.stroke();

                            let triangleHeight = 20;
                            let triangleBase = 30;
                            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                            ctx.shadowBlur = 10;
                            ctx.shadowOffsetX = 5;
                            ctx.shadowOffsetY = 5;
                            ctx.fillStyle = 'lightBlue';
                            ctx.beginPath();
                            ctx.moveTo(this.circleX, lineEndY + triangleHeight);
                            ctx.lineTo(this.circleX - triangleBase / 2, lineEndY);
                            ctx.lineTo(this.circleX + triangleBase / 2, lineEndY);
                            ctx.closePath();
                            ctx.fill();
                            ctx.stroke();
                            this.functionMenuY = lineEndY;
                        }
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                    }
                } else
                if (!this.table2) {
                    let table1_screen_x = grid.X(this.table1.grid.xi);
                    let table1_screen_y = grid.Y(this.table1.grid.yi);
                    let table1_screen_w = grid.screenWidth(this.table1.grid.width);
                    let table1_screen_h = grid.screenHeight(this.table1.grid.height);
                    let table1_mid_x = table1_screen_x + table1_screen_w / 2;
                    let table1_mid_y = table1_screen_y + (-1) * table1_screen_h / 2;

                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = 5;
                    ctx.shadowOffsetY = 5;
                    ctx.beginPath();
                    ctx.moveTo(table1_mid_x, table1_mid_y);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'black';
                    ctx.stroke();
                    let mid_x = table1_mid_x;
                    let mid_y = table1_mid_y;
                    this.circleX = mid_x;
                    this.circleY = mid_y;
                    this.grid.xi = grid.Xwc ( this.circleX )
                    this.grid.yi = grid.Ywc ( this.circleY )
                    this.grid.width = grid.worldWidth ( this.circleRadius )
                    this.grid.height = grid.worldHeight ( this.circleRadius )

                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = 5;
                    ctx.shadowOffsetY = 5;

                    ctx.beginPath();
                    ctx.arc(mid_x, mid_y, this.circleRadius, 0, 2 * Math.PI);
                    ctx.fillStyle = this.option_menu ? 'lightRed' : 'lightBlue';
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = 'black';
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('', mid_x, mid_y);

                    if (this.type) {
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(this.type, this.circleX, this.circleY - this.circleRadius - 10);

                        let lineEndY = this.circleY + this.circleRadius + 50;
                        ctx.beginPath();
                        ctx.moveTo(this.circleX, this.circleY + this.circleRadius);
                        ctx.lineTo(this.circleX, lineEndY);
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 2;
                        ctx.stroke();

                        let triangleHeight = 20;
                        let triangleBase = 30;
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 5;
                        ctx.shadowOffsetY = 5;
                        ctx.fillStyle = 'lightBlue';
                        ctx.beginPath();
                        ctx.moveTo(this.circleX, lineEndY + triangleHeight);
                        ctx.lineTo(this.circleX - triangleBase / 2, lineEndY);
                        ctx.lineTo(this.circleX + triangleBase / 2, lineEndY);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                        this.functionMenuY = lineEndY;
                    }
                    ctx.shadowBlur = 0;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;

                }

                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.strokeStyle = 'rgba(200,200,200,0.1)'

                ctx.beginPath();

                ctx.lineTo(this.circleX, this.circleY);
                for ( let c of this.connections){
                    ctx.lineTo(c.circleX, c.circleY + c.circleRadius);
                }
                ctx.stroke();

            }

            isOnCircle(mouseX, mouseY) {

                let distX = mouseX - this.circleX;
                let distY = mouseY - this.circleY;
                let distance = Math.sqrt(distX * distX + distY * distY);
                return distance <= this.circleRadius;
            }

            executeCatalyst() {
                for (let cat of this.catalyst) {
                    cat(this.table1, this.table2)
                }
            }

            fetchFunctions(pt) {

                let grid = pt.grid;
                if (!this.table1) {
                    this.table1 = pt.getPlateWithUID(this.ref1);
                }
                if (!this.table2) {
                    this.table2 = pt.getPlateWithUID(this.ref2)
                }
                pt.wb(null)

                this.fun_menu = new Menu('  ', grid.Xwc(this.circleX - 10), grid.Ywc(this.functionMenuY + 15))
                let menuList = []
                let f = FunctionMatch[this.type]
                let keys = Object.keys(f);
                for (let i of keys) {
                    menuList.push({
                        label: `${i} `,
                        click: async (scx, scy) => {
                            let fun = f[i]
                            let context = {
                                references: [this.table1.uid, this.table2.uid],
                                connections: [...this.connections]
                            }
                            let restable = await fun(this.type, pt, context)

                            if (restable) {
                                pt.setPlate(restable, (this.table1.grid.xi + this.table2.grid.xi) / 2, this.table1.grid.yi - 2)
                                let c = new Connection(this.uid, restable.uid)
                                c.type = 'creator'
                                this.connections.push(c);

                            }
                            pt.grid.rescale();

                        },
                        move: () => {
                        }
                    });
                }
                this.fun_menu.list = menuList;

                let t = {
                    id: 'conenction-function-menu',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: this.fun_menu
                }

                pt.wb (t)

            }

            isOnTriangle(mouseX, mouseY, grid) {
                let triangleHeight = 60;
                let triangleBase = 90;
                let lineEndY = this.functionMenuY;

                let vertex1 = { x: this.circleX, y: lineEndY + triangleHeight };
                let vertex2 = { x: this.circleX - triangleBase / 2, y: lineEndY };
                let vertex3 = { x: this.circleX + triangleBase / 2, y: lineEndY };

                let screenVertex1 = { x: grid.X(vertex1.x), y: grid.Y(vertex1.y) };
                let screenVertex2 = { x: grid.X(vertex2.x), y: grid.Y(vertex2.y) };
                let screenVertex3 = { x: grid.X(vertex3.x), y: grid.Y(vertex3.y) };
                let screenMouseX = grid.X(mouseX);
                let screenMouseY = grid.Y(mouseY);

                function area(x1, y1, x2, y2, x3, y3) {
                    return Math.abs((x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)) / 2);
                }

                let totalArea = area(screenVertex1.x, screenVertex1.y, screenVertex2.x, screenVertex2.y, screenVertex3.x, screenVertex3.y);

                let area1 = area(screenMouseX, screenMouseY, screenVertex2.x, screenVertex2.y, screenVertex3.x, screenVertex3.y);
                let area2 = area(screenVertex1.x, screenVertex1.y, screenMouseX, screenMouseY, screenVertex3.x, screenVertex3.y);
                let area3 = area(screenVertex1.x, screenVertex1.y, screenVertex2.x, screenVertex2.y, screenMouseX, screenMouseY);

                return totalArea === area1 + area2 + area3;
            }

            mouseUp(graph, x, y) {
                if (this.option_menu) {
                    this.option_menu.mouseUp(graph, graph.Xwc(x), graph.Ywc(y));

                    this.option_menu = null;
                }
                if (this.fun_menu) {
                    this.fun_menu.mouseUp(graph, graph.Xwc(x), graph.Ywc(y));

                    this.fun_menu = null;
                }
            }

            mouseMove(graph, x, y) {
                if (this.option_menu) {
                    this.option_menu.mouseMove(graph, graph.Xwc(x), graph.Ywc(y));
                } else {
                }
                if (this.fun_menu) {
                    this.fun_menu.mouseMove(graph, graph.Xwc(x), graph.Ywc(y));
                }
            }
            reset(graph, x, y) {
                this.option_menu = null;
                this.fun_menu = null;
            }

            analyzeRelationship(pt) {

                if (!this.table1) {
                    this.table1 = pt.getPlateWithUID(this.ref1);
                }
                if (!this.table2) {
                    this.table2 = pt.getPlateWithUID(this.ref2)
                }

                let grid = pt.grid;
                this.option_menu = new Menu('', grid.Xwc(this.circleX), grid.Ywc(this.circleY))
                let menuList = []
                for (let relationship of Object.keys(TableMatch)) {
                    let f = TableMatch[relationship]
                    if (f(this.table1, this.table2)) {
                        menuList.push({
                            label: `${relationship} `,
                            click: (scx, scy) => {
                                this.type = relationship;
                                pt.wb(null)

                            },
                            move: () => {
                            }
                        });

                    }
                }

                menuList.push({
                    label: `Delete`,
                    click: (scx, scy) => {
                        pt.removeConnection(this);
                        pt.wb(null)

                    },
                    move: () => {
                    }
                });

                this.option_menu.list = menuList;

                let t = {
                    id: 'conenction-options-menu',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: this.option_menu
                }

                pt.wb(t)
            }
        }
        resolve(Connection)
    })

}
