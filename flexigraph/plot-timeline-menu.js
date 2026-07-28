function (plot) {

    const m1 = [
        {
            label: `Goto...`,
            __date: '',
            click: async (scx, scy) => {

                let menu = [

                    {
                        label: `Now`,
                        __date: '',
                        click: async (scx, scy) => {
                            const now = new Date();
                            const currentOffsetHours = (now.getTime() - this.startDate.getTime()) / hourToMs;
                            const nowXm = this.grid.X(currentOffsetHours - 1);
                            const nowXp = this.grid.X(currentOffsetHours + 1);
                            let screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                            let screen_xm = pt.grid.Xwc(nowXm);
                            let screen_xp = pt.grid.Xwc(nowXp);
                            let screen_y = pt.grid.Ywc(this.grid.Y(0));
                            let small_width = Math.abs(screen_xm - screen_xp);
                            let small_height = screen_ptheight;
                            let rect_y = screen_y - small_height / 2;
                            await pt.zoomto(screen_xm, rect_y, small_width, small_height);
                            CurrentLayout.reset('mainPanel');

                        },
                        move: () => {
                        }
                    }
                    ,
                    {
                        label: `Current day`,
                        __date: '',
                        click: async (scx, scy) => {
                            const now = new Date();
                            const centerOffset = (now.getTime() - this.startDate.getTime()) / hourToMs;
                            const range = 12;
                            const xm = this.grid.X(centerOffset - range);
                            const xp = this.grid.X(centerOffset + range);
                            const screen_xm = pt.grid.Xwc(xm);
                            const screen_xp = pt.grid.Xwc(xp);
                            const screen_y = pt.grid.Ywc(this.grid.Y(0));
                            const screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                            const width = Math.abs(screen_xm - screen_xp);
                            const height = screen_ptheight;
                            await pt.zoomto(screen_xm, screen_y - height / 2, width, height);
                            CurrentLayout.reset('mainPanel');
                        },
                        move: () => { }
                    },
                    {
                        label: `Current week`,
                        __date: '',
                        click: async (scx, scy) => {
                            const now = new Date();
                            const centerOffset = (now.getTime() - this.startDate.getTime()) / hourToMs;
                            const range = 84;
                            const xm = this.grid.X(centerOffset - range);
                            const xp = this.grid.X(centerOffset + range);
                            const screen_xm = pt.grid.Xwc(xm);
                            const screen_xp = pt.grid.Xwc(xp);
                            const screen_y = pt.grid.Ywc(this.grid.Y(0));
                            const screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                            const width = Math.abs(screen_xm - screen_xp);
                            const height = screen_ptheight;
                            await pt.zoomto(screen_xm, screen_y - height / 2, width, height);
                            CurrentLayout.reset('mainPanel');
                        },
                        move: () => { }
                    },
                    {
                        label: `Current month`,
                        __date: '',
                        click: async (scx, scy) => {
                            const now = new Date();
                            const centerOffset = (now.getTime() - this.startDate.getTime()) / hourToMs;
                            const range = 360;
                            const xm = this.grid.X(centerOffset - range);
                            const xp = this.grid.X(centerOffset + range);
                            const screen_xm = pt.grid.Xwc(xm);
                            const screen_xp = pt.grid.Xwc(xp);
                            const screen_y = pt.grid.Ywc(this.grid.Y(0));
                            const screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                            const width = Math.abs(screen_xm - screen_xp);
                            const height = screen_ptheight;
                            await pt.zoomto(screen_xm, screen_y - height / 2, width, height);
                            CurrentLayout.reset('mainPanel');
                        },
                        move: () => { }
                    },
                    {
                        label: `Current year`,
                        __date: '',
                        click: async (scx, scy) => {
                            const now = new Date();
                            const centerOffset = (now.getTime() - this.startDate.getTime()) / hourToMs;
                            const range = 4380;
                            const xm = this.grid.X(centerOffset - range);
                            const xp = this.grid.X(centerOffset + range);
                            const screen_xm = pt.grid.Xwc(xm);
                            const screen_xp = pt.grid.Xwc(xp);
                            const screen_y = pt.grid.Ywc(this.grid.Y(0));
                            const screen_ptheight = pt.grid.worldHeight(pt.grid.height);
                            const width = Math.abs(screen_xm - screen_xp);
                            const height = screen_ptheight;
                            await pt.zoomto(screen_xm, screen_y - height / 2, width, height);
                            CurrentLayout.reset('mainPanel');
                        },
                        move: () => { }
                    }
                ]

                const graph = CurrentLayout.getStashed('graph')
                if (graph) {
                    graph.showWindowMenu(menu, 10, 10, 400)
                }

            },
            move: () => {
            }
        }
    ]

    const m2 = [
        {
            label: `Add milestone...`,
            __date: '',
            click: async (scx, scy) => {
                let lasso = {
                    id: 'point-add-to-timeline',
                    priority: true,
                    mouseMoveListener: (x, y) => {
                        scx_ = x;
                        scy_ = y - 10;
                        this.grid.rescale();

                        let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                        this.__scx_ = x;
                        this.__scy_ = y;

                        this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                    },
                    mouseUpListener: async (x, y) => {
                        let va = await prompt("(Optional)", ["Text", "URL or Teams ID"], { "Text": '' }, 300, 450)
                        let m = va['Text']
                        let url = va['URL or Teams ID']
                        if (m != null) {
                            let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                            let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                            this.__scx_ = x;
                            this.__scy_ = y;
                            this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                            const yvalue = this.grid.Ywc(y)
                            const _point = {
                                x: tx,
                                y: ty,
                                type: 'milestone',
                                name: `${m}`,
                                color: 'red',
                            };

                            if (isTeamsMeetingId(url)) {
                                url = constructTeamsMeetingUrl(url)
                            }

                            if (isYouTubeVideo(url) || isTeamsMeetingUrl(url)) {
                                _point.videoURL = url;
                                _point.iconSize = this.grid.worldWidth(30)

                            } else if (url) {
                                _point.url = url;
                            }
                            this.scatterData.points.push(_point);
                            pt.wb(null)

                        } else {
                        }
                    },
                    mouseDownListener: (x, y) => {
                    },
                    draw: (grid, ctx) => {
                        ctx.lineWidth = 2;
                        ctx.fillStyle = 'black';
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'left';

                        ctx.fillText(this.__date, this.__scx_, this.__scy_)
                    },
                    menuManager: null
                }
                pt.wb(lasso)

            },
            move: () => {
            }
        },
        {
            label: `Draw Interval`,
            __date: '',
            click: async (scx, scy) => {

                let arr = null;
                let isDrawing = false;
                let md = false;

                const Arrow = await exec('flexigraph/shapes/arrow');
                let lasso = {
                    id: 'point-add-to-timeline',
                    priority: true,
                    mouseMoveListener: (x, y) => {
                        if (arr) {
                            const xxi = this.grid.Xwc(x - this.grid.xi * 2);
                            arr.xf = xxi;
                            arr.yf = arr.y;
                        }
                    },

                    mouseUpListener: async (x, y) => {
                        md = false;

                    },
                    mouseDownListener: async (x, y) => {

                        if (isDrawing) {
                            const start = formatTimeLabel(
                                arr.x,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            const end = formatTimeLabel(
                                arr.xf,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            let va = await prompt("(Optional)", ["Comment", "URL or Teams ID"], { "Comment": '' }, 300, 420)
                            let m = va['Comment']
                            let url = va['URL or Teams ID']

                            let _name = `${start} - ${end}`;
                            if (m && m.length > 0) {
                                _name = m;
                            }

                            const point = {
                                x: arr.xf,
                                y: arr.y,
                                type: 'interval',
                                startX: arr.x,
                                name: _name,
                                color: 'black',
                            }

                            if (isTeamsMeetingId(url)) {
                                url = constructTeamsMeetingUrl(url)
                            }

                            let iconn = getLJIcon(point.name)
                            if (iconn) {
                                point.icon = iconn;
                            }

                            if (isYouTubeVideo(url) || isTeamsMeetingUrl(url)) {
                                point.iconSize = this.grid.worldWidth(30)
                                point.videoURL = url;
                            }
                            this.scatterData.points.push(point);
                            arr = null;
                            if (pt) {
                                pt.wb(null)
                            }

                            isDrawing = false;

                        } else {
                            md = true;
                            isDrawing = true;
                            const xxi = this.grid.Xwc(x - this.grid.xi * 2);
                            const yyi = this.grid.Ywc(y - this.grid.yi * 2);
                            arr = new Arrow(xxi, yyi, xxi, yyi, 'black');
                        }
                    },
                    draw: (grid, ctx) => {
                        ctx.lineWidth = 2;
                        ctx.fillStyle = 'black';
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'left';

                        if (arr) {
                            ctx.lineWidth = 2;
                            ctx.fillStyle = 'black';

                            arr.draw(this.grid, ctx);

                            const startLabel = formatTimeLabel(
                                arr.x,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            const endLabel = formatTimeLabel(
                                arr.xf,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            ctx.font = '14px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';

                            const x = this.grid.X(arr.x);
                            const xf = this.grid.X(arr.xf);
                            const y = this.grid.Y(arr.y);

                            const paddingX = 8;
                            const paddingY = 6;

                            {
                                const textWidth = ctx.measureText(startLabel).width;
                                const textHeight = 14;

                                const ovalWidth = textWidth + 2 * paddingX;
                                const ovalHeight = textHeight + 2 * paddingY;
                                const centerX = x + textWidth / 2;
                                const centerY = y;

                                ctx.beginPath();
                                ctx.ellipse(centerX, centerY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                                ctx.fillStyle = 'white';
                                ctx.fill();
                                ctx.strokeStyle = 'black';
                                ctx.stroke();

                                ctx.fillStyle = 'black';
                                ctx.fillText(startLabel, centerX, centerY);
                            }

                            {
                                const textWidth = ctx.measureText(endLabel).width;
                                const textHeight = 14;

                                const ovalWidth = textWidth + 2 * paddingX;
                                const ovalHeight = textHeight + 2 * paddingY;
                                const centerX = xf + textWidth / 2;
                                const centerY = y;

                                ctx.beginPath();
                                ctx.ellipse(centerX, centerY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                                ctx.fillStyle = 'white';
                                ctx.fill();
                                ctx.strokeStyle = 'black';
                                ctx.stroke();

                                ctx.fillStyle = 'black';
                                ctx.fillText(endLabel, centerX, centerY);
                            }

                            {
                                const totalCanvasRange = this.grid.xmax - this.grid.xmin;
                                const totalTimeRange = this.endDate.getTime() - this.startDate.getTime();

                                const normalizedStart = (arr.x - this.grid.xmin) / totalCanvasRange;
                                const normalizedEnd = (arr.xf - this.grid.xmin) / totalCanvasRange;

                                const startTimestamp = this.startDate.getTime() + normalizedStart * totalTimeRange;
                                const endTimestamp = this.startDate.getTime() + normalizedEnd * totalTimeRange;

                                const diffMs = endTimestamp - startTimestamp;
                                const diffMinutesTotal = diffMs / (1000 * 60);
                                const diffHoursTotal = diffMinutesTotal / 60;
                                const diffDaysTotal = diffHoursTotal / 24;
                                const diffWeeksTotal = diffDaysTotal / 7;

                                let intervalLabel = '';

                                if (diffWeeksTotal >= 1) {
                                    const weeks = Math.floor(diffWeeksTotal);
                                    const days = Math.round((diffWeeksTotal - weeks) * 7);
                                    intervalLabel = `${weeks} wk${weeks !== 1 ? 's' : ''}`;
                                    if (days > 0) {
                                        intervalLabel += ` ${days} d`;
                                    }
                                } else if (diffDaysTotal >= 1) {
                                    const days = Math.floor(diffDaysTotal);
                                    const hours = Math.round((diffDaysTotal - days) * 24);
                                    intervalLabel = `${days} d${days !== 1 ? 's' : ''}`;
                                    if (hours > 0) {
                                        intervalLabel += ` ${hours} h`;
                                    }
                                } else if (diffHoursTotal >= 1) {
                                    const hours = Math.floor(diffHoursTotal);
                                    const minutes = Math.round((diffHoursTotal - hours) * 60);
                                    intervalLabel = `${hours} h`;
                                    if (minutes > 0) {
                                        intervalLabel += ` ${minutes} min`;
                                    }
                                } else {
                                    const minutes = Math.max(1, Math.round(diffMinutesTotal));
                                    intervalLabel = `${minutes} min`;
                                }

                                const midX = (x + xf) / 2;
                                const textWidth = ctx.measureText(intervalLabel).width;
                                const textHeight = 14;

                                const ovalWidth = textWidth + 2 * paddingX;
                                const ovalHeight = textHeight + 2 * paddingY;
                                const centerX = midX;
                                const centerY = y - 25;

                                ctx.beginPath();
                                ctx.ellipse(centerX, centerY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                                ctx.fillStyle = 'white';
                                ctx.fill();

                                ctx.fillStyle = 'black';
                                ctx.fillText(intervalLabel, centerX, centerY);
                            }

                        }
                    },
                    menuManager: null
                }
                pt.wb(lasso)

            },
            move: () => {
            }
        },
        {
            label: `Set progress arrow`,
            __date: '',
            click: async (scx, scy) => {
                function getRandomTransparentColor() {
                    const r = Math.floor(0.1 * 256);
                    const g = Math.floor(0.1 * 256);
                    const b = Math.floor(0.2 * 256);
                    const a = 0.9;
                    return `rgba(${r}, ${g}, ${b}, ${a})`;
                }
                let arr = null;
                let isDrawing = false;
                let md = false;

                const Arrow = await exec('flexigraph/shapes/arrow');

                md = true;
                isDrawing = true;
                let y = 0;
                let x = 0;
                const xxi = 0;
                const yyi = 0;
                arr = new Arrow(xxi, yyi, xxi, yyi, getRandomTransparentColor());

                let lasso = {
                    id: 'point-add-to-timeline',
                    priority: true,
                    mouseMoveListener: (x, y) => {
                        if (arr) {
                            const xxi = this.grid.Xwc(x - this.grid.xi * 2);
                            const yyi = this.grid.Ywc(y - this.grid.yi * 2);
                            arr.y = yyi;
                            arr.xf = xxi;

                            arr.yf = arr.y;
                        }
                    },

                    mouseUpListener: async (x, y) => {
                        md = false;

                    },
                    mouseDownListener: async (x, y) => {

                        if (isDrawing) {
                            const start = formatTimeLabel(
                                arr.x,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            const end = formatTimeLabel(
                                arr.xf,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            let va = await prompt("(Optional)", ["Comment", "URL or Teams ID"], { "Comment": '' }, 300, 420)
                            let m = va['Comment']
                            let url = va['URL or Teams ID']

                            let _name = `${start} - ${end}`;
                            if (m && m.length > 0) {
                                _name = m;
                            }

                            const point = {
                                x: arr.xf,
                                y: arr.y,
                                type: 'progress',
                                startX: arr.x,
                                name: _name,
                                color: getRandomTransparentColor(),
                            }

                            if (isTeamsMeetingId(url)) {
                                url = constructTeamsMeetingUrl(url)
                            }

                            if (isYouTubeVideo(url) || isTeamsMeetingUrl(url)) {
                                point.iconSize = this.grid.worldWidth(30)
                                point.videoURL = url;
                            }

                            this.scatterData.points = this.scatterData.points.filter(p => p.name !== "progress");

                            this.scatterData.points.push(point);
                            arr = null;
                            if (pt) {
                                pt.wb(null)
                            }

                            isDrawing = false;

                        } else {
                        }
                    },
                    draw: (grid, ctx) => {
                        ctx.lineWidth = 2;
                        ctx.fillStyle = 'black';
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'left';

                        if (arr) {
                            ctx.lineWidth = 2;
                            ctx.fillStyle = 'black';

                            arr.draw(this.grid, ctx);

                            const startLabel = formatTimeLabel(
                                arr.x,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            const endLabel = formatTimeLabel(
                                arr.xf,
                                this.grid.xmin,
                                this.grid.xmax,
                                this.startDate,
                                this.endDate
                            );

                            ctx.font = '14px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';

                            const x = this.grid.X(arr.x);
                            const xf = this.grid.X(arr.xf);
                            const y = this.grid.Y(arr.y);

                            const paddingX = 8;
                            const paddingY = 6;

                            {
                                const textWidth = ctx.measureText(startLabel).width;
                                const textHeight = 14;

                                const ovalWidth = textWidth + 2 * paddingX;
                                const ovalHeight = textHeight + 2 * paddingY;
                                const centerX = x + textWidth / 2;
                                const centerY = y;

                                ctx.beginPath();
                                ctx.ellipse(centerX, centerY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                                ctx.fillStyle = 'white';
                                ctx.fill();
                                ctx.strokeStyle = 'black';
                                ctx.stroke();

                                ctx.fillStyle = 'black';
                                ctx.fillText(startLabel, centerX, centerY);
                            }

                            {
                                const textWidth = ctx.measureText(endLabel).width;
                                const textHeight = 14;

                                const ovalWidth = textWidth + 2 * paddingX;
                                const ovalHeight = textHeight + 2 * paddingY;
                                const centerX = xf + textWidth / 2;
                                const centerY = y;

                                ctx.beginPath();
                                ctx.ellipse(centerX, centerY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                                ctx.fillStyle = 'white';
                                ctx.fill();
                                ctx.strokeStyle = 'black';
                                ctx.stroke();

                                ctx.fillStyle = 'black';
                                ctx.fillText(endLabel, centerX, centerY);
                            }

                            {
                                const totalCanvasRange = this.grid.xmax - this.grid.xmin;
                                const totalTimeRange = this.endDate.getTime() - this.startDate.getTime();

                                const normalizedStart = (arr.x - this.grid.xmin) / totalCanvasRange;
                                const normalizedEnd = (arr.xf - this.grid.xmin) / totalCanvasRange;

                                const startTimestamp = this.startDate.getTime() + normalizedStart * totalTimeRange;
                                const endTimestamp = this.startDate.getTime() + normalizedEnd * totalTimeRange;

                                const diffMs = endTimestamp - startTimestamp;
                                const diffMinutesTotal = diffMs / (1000 * 60);
                                const diffHoursTotal = diffMinutesTotal / 60;
                                const diffDaysTotal = diffHoursTotal / 24;
                                const diffWeeksTotal = diffDaysTotal / 7;

                                let intervalLabel = '';

                                if (diffWeeksTotal >= 1) {
                                    const weeks = Math.floor(diffWeeksTotal);
                                    const days = Math.round((diffWeeksTotal - weeks) * 7);
                                    intervalLabel = `${weeks} wk${weeks !== 1 ? 's' : ''}`;
                                    if (days > 0) {
                                        intervalLabel += ` ${days} d`;
                                    }
                                } else if (diffDaysTotal >= 1) {
                                    const days = Math.floor(diffDaysTotal);
                                    const hours = Math.round((diffDaysTotal - days) * 24);
                                    intervalLabel = `${days} d${days !== 1 ? 's' : ''}`;
                                    if (hours > 0) {
                                        intervalLabel += ` ${hours} h`;
                                    }
                                } else if (diffHoursTotal >= 1) {
                                    const hours = Math.floor(diffHoursTotal);
                                    const minutes = Math.round((diffHoursTotal - hours) * 60);
                                    intervalLabel = `${hours} h`;
                                    if (minutes > 0) {
                                        intervalLabel += ` ${minutes} min`;
                                    }
                                } else {
                                    const minutes = Math.max(1, Math.round(diffMinutesTotal));
                                    intervalLabel = `${minutes} min`;
                                }

                                const midX = (x + xf) / 2;
                                const textWidth = ctx.measureText(intervalLabel).width;
                                const textHeight = 14;

                                const ovalWidth = textWidth + 2 * paddingX;
                                const ovalHeight = textHeight + 2 * paddingY;
                                const centerX = midX;
                                const centerY = y - 25;

                                ctx.beginPath();
                                ctx.ellipse(centerX, centerY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                                ctx.fillStyle = 'white';
                                ctx.fill();

                                ctx.fillStyle = 'black';
                                ctx.fillText(intervalLabel, centerX, centerY);
                            }

                        }
                    },
                    menuManager: null
                }
                pt.wb(lasso)

            },
            move: () => {
            }
        },
        {
            label: `Add PDF...`,
            __date: '',
            click: async (scx, scy) => {
                let startx = this.grid.xmin;
                let lasso = {
                    id: 'point-add-to-timeline',
                    priority: true,
                    mouseMoveListener: (x, y) => {
                        this.__scx_ = x;
                        this.__scy_ = y - 10;
                        let tx = (this.grid.Xwc(this.__scx_ - this.grid.xi * 2))
                        this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                    },
                    mouseUpListener: async (x, y) => {
                        let va = await prompt("Name", ["Name"], { "Name": '' }, 300, 300)
                        let m = va['Name']
                        if (m != null) {
                            let __color = 'rgba(0, 87, 163, 0.5)'
                            let progressBar;
                            let w = {
                                wid: 'progress',
                                componentRef: 'progressBar',
                                data: {
                                    'progress': 0,
                                    'progressBar': createIonFunction((progessBar) => {
                                        progressBar = progessBar;
                                    })
                                }
                            }

                            let design_params_panel_layout = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'html',
                                                    data: '<hr>'
                                                }
                                            },

                                            {
                                                'width': '100%',
                                                'component': w
                                            },
                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '90%',
                                                'component':
                                                {

                                                    wid: 'simple-file-browser',
                                                    width: '100%',
                                                    height: '100%',
                                                    refCallback: innerComponentCallback,
                                                    data: {
                                                        "ionfunction.cmd": createIonFunction((element) => {

                                                        }),

                                                        width: '100%',
                                                        columns: 3,
                                                        showSearch: true,
                                                        drive: 'user',
                                                        user: getUser(),
                                                        root: getUser(),
                                                        "ionfunction.fileClick": createIonFunction(async (element) => {
                                                            path = element.path;
                                                            name = element.name;
                                                            infoPrompt(" " + name + " selected.")
                                                        }),
                                                        "ionfunction.openfile": createIonFunction(async (file, text) => {

                                                        }
                                                        ),
                                                        "ionfunction.path": createIonFunction(async (_path, nodes) => {
                                                            path = _path;

                                                        })
                                                    }
                                                }
                                            },
                                            {
                                                'width': '100%',
                                                'component': {
                                                    wid: 'simple-file-upload',
                                                    data: {
                                                        'showUploadButton': false,
                                                        'getUploadFolder': createIonFunction(() => {
                                                        }),
                                                        'getRef': createIonFunction((ref) => {
                                                            file_drop_object = ref;
                                                        }),
                                                        'onDropToBlob': createIonFunction(async (file) => {
                                                        }),
                                                        'fileFunction': createIonFunction(async (file) => {
                                                            if (!file) {
                                                                console.error("No file selected for upload.");
                                                                return { error: "No file selected" };
                                                            }
                                                            const user = getUser();
                                                            const type = "data";
                                                            const chunkSize = 5 * 1024 * 1024;
                                                            const totalChunks = Math.ceil(file.size / chunkSize);
                                                            let uploadedChunks = 0;

                                                            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                                                                const start = chunkIndex * chunkSize;
                                                                const end = Math.min(start + chunkSize, file.size);
                                                                const chunk = file.slice(start, end);

                                                                const formData = new FormData();
                                                                formData.append("user", user);
                                                                formData.append("type", type);
                                                                formData.append("file", chunk, file.name);
                                                                if (path) {
                                                                    formData.append("path", path);
                                                                }
                                                                try {

                                                                    let host_ = window['env']['apiUrl']
                                                                    const response = await fetch(host_ + '/upload', {
                                                                        method: 'POST',
                                                                        body: formData
                                                                    })

                                                                    const result = await response.json();
                                                                    if (!response.ok || result.failed) {
                                                                        console.error(`Error uploading chunk ${chunkIndex}:`, result.failed);
                                                                        return { error: `Upload failed at chunk ${chunkIndex}` };
                                                                    }

                                                                    uploadedChunks++;
                                                                    progressBar((uploadedChunks / totalChunks) * 100)

                                                                    console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
                                                                    setTimeout(async () => {
                                                                        await comp.refresh();
                                                                    }, 700)

                                                                } catch (error) {
                                                                    console.error("Upload failed:", error);
                                                                    return { error: "Network or server error during upload" };
                                                                }
                                                            }

                                                        })
                                                    }
                                                }
                                            },
                                        ]
                                    ]
                                }
                            }

                            let sequence_input = {
                                wid: 'card',
                                "height": "500px",
                                data: {
                                    "style.padding-top": '1px',
                                    "style.border": '1px',
                                    "style.height": "500px",
                                    cards: [
                                        [
                                            {

                                                'width': '100%',
                                                'component': {
                                                    wid: 'card',
                                                    data: {
                                                        cards: [
                                                            [

                                                                {
                                                                    'width': '100%',
                                                                    'height': "100px",
                                                                    "style.padding-top": '4px',
                                                                    "style.border": '1px',
                                                                    'component':
                                                                    {
                                                                        'wid': 'color-chooser',
                                                                        'width': '100%',

                                                                        "data": {
                                                                            "selectionListener": createIonFunction((_color) => {
                                                                                __color = _color;
                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ],
                                                            [
                                                                {
                                                                    'component': design_params_panel_layout
                                                                }
                                                            ]
                                                        ]
                                                    }
                                                }
                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();

                                                                    this.__scx_ = x;
                                                                    this.__scy_ = y - 10;
                                                                    let tx = (this.grid.Xwc(this.__scx_ - this.grid.xi * 2))
                                                                    let ty = (this.grid.Ywc(this.__scy_ - this.grid.yi * 2))
                                                                    this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                                                    const yvalue = this.grid.Ywc(y)
                                                                    const _point = {
                                                                        x: tx,
                                                                        y: ty,
                                                                        startX: tx,
                                                                        path: path,
                                                                        name: `${m}`,
                                                                        color: __color,
                                                                        filename: name,
                                                                        type: 'document'
                                                                    }
                                                                    this.scatterData.points.push(_point);
                                                                    pt.setPointSelected(_point)
                                                                    pt.wb(null)
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.reset('mainPanel');
                                                                })
                                                            },
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.reset('mainPanel');
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', sequence_input);
                        }
                    },
                    mouseDownListener: (x, y) => {

                        this.__scx_ = x;
                        this.__scy_ = y - 10;
                        let tx = (this.grid.Xwc(this.__scx_ - this.grid.xi * 2))
                        this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)

                    },
                    draw: (grid, ctx) => {
                        ctx.lineWidth = 2;
                        ctx.fillStyle = 'black';
                        ctx.font = '14px Arial';
                        ctx.textAlign = 'left';

                        ctx.fillText(this.__date, this.__scx_, this.__scy_)
                    },
                    menuManager: null
                }
                pt.wb(lasso)

            },
            move: () => {
            }
        },
        {
            label: `Import Microsoft Calendar`,
            __date: '',
            click: async (scx, scy) => {
                if (!this.uid) {
                    this.uid = uuid();
                }

                let confirm = await exec('baja/lib/confirm.js', 'Has your work been saved first?', async () => {

                    setTimeout(() => {

                        const iiiddd = this.uid;
                        showModal({
                            wid: 'calendar-import',
                            data: {
                                'fetchCalendar': createIonFunction(async (start, end) => {
                                    pt.ifun = `
                                        async function(pm, calendar_import_file) {
                                            pm.selectPlateByUID('${iiiddd}')
                                            let cale = await exec('baja/calendar/ms-events', pm.selectedPlate,  calendar_import_file);
                                            pm.selectedPlate.scatterData.points.push(...cale);
                                        }
                                    `;

                                    let ob = await exec('baja/table/io/save-yakro-service.js', pt, 'current_state.bjb');
                                })
                            }
                        }, 250, 200)
                    }, 1000)
                })
                showModal(confirm)
            }
        },
        {
            label: 'Paste points...',
            click: async (scx, scy) => {
                let menu = [
                    {
                        label: `Paste (label text|time-duration) Serial`,
                        __date: '',
                        click: async (scx, scy) => {
                            let start_date = this.startDate;
                            const vtext = await navigator.clipboard.readText();
                            function parseDurationToMilliseconds(durationStr) {
                                const timeUnits = [
                                    { unit: 'minutes', aliases: ['min', 'minutes?'], multiplier: 60 * 1000 },
                                    { unit: 'hours', aliases: ['h', 'hours?'], multiplier: 60 * 60 * 1000 },
                                    { unit: 'days', aliases: ['days?'], multiplier: 24 * 60 * 60 * 1000 },
                                    { unit: 'weeks', aliases: ['weeks?'], multiplier: 7 * 24 * 60 * 60 * 1000 },
                                    { unit: 'months', aliases: ['months?'], multiplier: 'months' },
                                    { unit: 'quarters', aliases: ['quarters?'], multiplier: 'quarters' },
                                    { unit: 'years', aliases: ['years?'], multiplier: 'years' }
                                ];

                                for (const { aliases, multiplier } of timeUnits) {
                                    for (const alias of aliases) {
                                        const regex = new RegExp(`(\\d+(?:\\.\\d+)?)[–-](\\d+(?:\\.\\d+)?)\\s*${alias}`, 'i');
                                        const match = durationStr.match(regex);
                                        if (match) {
                                            const value = Math.max(parseFloat(match[1]), parseFloat(match[2]));
                                            return typeof multiplier === 'number'
                                                ? { milliseconds: value * multiplier }
                                                : { amount: value, unit: multiplier };
                                        }
                                    }
                                }

                                for (const { aliases, multiplier } of timeUnits) {
                                    for (const alias of aliases) {
                                        const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${alias}`, 'i');
                                        const match = durationStr.match(regex);
                                        if (match) {
                                            const value = parseFloat(match[1]);
                                            return typeof multiplier === 'number'
                                                ? { milliseconds: value * multiplier }
                                                : { amount: value, unit: multiplier };
                                        }
                                    }
                                }

                                return { milliseconds: 0 };
                            }

                            function replaceRangeWithMax(input) {
                                return input.replace(/(\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)/g, (_, start, end) => {
                                    return Math.max(parseFloat(start), parseFloat(end));
                                });
                            }

                            function addDuration(date, duration) {
                                const result = new Date(date);

                                if (typeof duration === 'number') {
                                    result.setTime(result.getTime() + duration);
                                    return result;
                                }

                                if (duration && typeof duration === 'object') {
                                    if ('milliseconds' in duration && typeof duration.milliseconds === 'number') {
                                        result.setTime(result.getTime() + duration.milliseconds);
                                        return result;
                                    }

                                    const { amount, unit } = duration;
                                    if (typeof amount === 'number') {
                                        switch (unit) {
                                            case 'months':
                                                result.setMonth(result.getMonth() + amount);
                                                break;
                                            case 'quarters':
                                                result.setMonth(result.getMonth() + 3 * amount);
                                                break;
                                            case 'years':
                                                result.setFullYear(result.getFullYear() + amount);
                                                break;
                                            default:

                                                result.setTime(result.getTime() + amount);
                                                break;
                                        }
                                        return result;
                                    }
                                }

                                return result;
                            }

                            function generateTimeline(startDateStr, tasks) {
                                let currentStart = new Date(startDateStr);
                                const timeline = [];

                                for (const [comment, durationStr] of tasks) {
                                    console.log(`Duration for "${durationStr}":`);

                                    let dstri = replaceRangeWithMax(durationStr);
                                    let duration = parseDurationToMilliseconds(dstri);

                                    if (duration.milliseconds) {
                                        duration = duration.milliseconds;
                                    }

                                    const durationInDays = duration / (1000 * 60 * 60 * 24);
                                    console.log(`Duration for "${comment}": ${durationInDays.toFixed(2)} days`);

                                    const start = new Date(currentStart);
                                    const end = addDuration(start, duration);

                                    timeline.push({
                                        comment,
                                        start: start.toISOString(),
                                        end: end.toISOString()
                                    });

                                    currentStart = end;
                                }

                                return timeline;
                            }

                            function convertTextToArray(text) {
                                const lines = text.trim().split('\n');
                                const result = lines.map(line => {
                                    const parts = line.split('\t');
                                    if (parts.length === 2) {
                                        return [parts[0].trim(), parts[1].trim()];
                                    } else {
                                        const lastSpaceIndex = line.lastIndexOf(' ');
                                        const description = line.slice(0, lastSpaceIndex).trim();
                                        const duration = line.slice(lastSpaceIndex + 1).trim();
                                        return [description, duration];
                                    }
                                });
                                return result;
                            }
                            function dateFromX(x, xMin, xMax, start, end) {
                                const totalCanvasRange = xMax - xMin;
                                const totalTimeRange = end.getTime() - start.getTime();
                                const normalizedX = (x - xMin) / totalCanvasRange;
                                const date = new Date(start.getTime() + normalizedX * totalTimeRange);
                                return date;
                            }
                            function getXFromDate(date, xMin, xMax, start, end) {
                                const totalCanvasRange = xMax - xMin;
                                const totalTimeRange = end.getTime() - start.getTime();
                                const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

                                const normalizedTime = timeSinceStart / totalTimeRange;
                                return xMin + normalizedTime * totalCanvasRange;
                            }
                            function convertToTimelinePoints(events, xMin, xMax, startDate, endDate, currentY) {
                                if (events.length === 0) return [];
                                const globalStart = startDate;
                                const globalEnd = endDate;

                                return events.map((event, index) => {
                                    const startDate = new Date(event.start);
                                    const endDate = new Date(event.end);

                                    const point = {
                                        x: getXFromDate(endDate, xMin, xMax, globalStart, globalEnd),
                                        y: currentY,
                                        type: 'interval',
                                        startX: getXFromDate(startDate, xMin, xMax, globalStart, globalEnd),
                                        name: event.comment,
                                        color: 'black'
                                    };
                                    return point;
                                });
                            }

                            let interaction_user = {
                                id: 'plot-export-menu',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                                smenu: smenu
                            }
                            interaction_user.draw = (grid, ctx) => {
                            }
                            interaction_user.mouseDownListener = (x, y) => {
                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                const starting_date = dateFromX(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                const yvalue = this.grid.Ywc(y)
                                let t = convertTextToArray(vtext)
                                let events = generateTimeline(starting_date, t)
                                const timelinePoints = convertToTimelinePoints(events, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate, ty);
                                for (let t of timelinePoints)
                                    this.scatterData.points.push(t)

                                pt.wb(null)

                            }

                            interaction_user.close = () => {
                                smenu = null;

                            }
                            interaction_user.mouseMoveListener = (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                pt.grid.rescale();
                                this.grid.rescale();
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    smenu.mouseMove(pt.grid, mmx, mmy)
                                }
                            }
                            interaction_user.mouseUpListener = async (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    await smenu.mouseUp(pt.grid, mmx, mmy)
                                }
                                pt.wb(null)
                            }
                            pt.wb(interaction_user)

                        },
                        move: () => {
                        }
                    },
                    {
                        label: `Paste (label-text|time-duration) Concurrent`,
                        __date: '',
                        click: async (scx, scy) => {
                            let start_date = this.startDate;

                            const vtext = await navigator.clipboard.readText();
                            function parseDurationToMilliseconds(durationStr) {
                                const regexes = [
                                    { regex: /(\d+)[–-](\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)[–-](\d+)\s*months?/i, multiplier: 'months' },
                                    { regex: /(\d+)[–-](\d+)\s*quarters?/i, multiplier: 'quarters' },
                                    { regex: /(\d+)[–-](\d+)\s*years?/i, multiplier: 'years' },
                                    { regex: /(\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                                    { regex: /(\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                                    { regex: /(\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                                    { regex: /(\d+)\s*months?/i, multiplier: 'months' },
                                    { regex: /(\d+)\s*quarters?/i, multiplier: 'quarters' },
                                    { regex: /(\d+)\s*years?/i, multiplier: 'years' },
                                ];

                                for (const { regex, multiplier } of regexes) {
                                    const match = durationStr.match(regex);
                                    if (match) {
                                        const value = match[2] ? parseInt(match[2]) : parseInt(match[1]);
                                        if (typeof multiplier === 'number') {
                                            return { milliseconds: value * multiplier };
                                        } else {
                                            return { amount: value, unit: multiplier };
                                        }
                                    }
                                }

                                return { milliseconds: 0 };
                            }

                            function addDuration(date, duration) {
                                const result = new Date(date);

                                if (typeof duration === 'number') {
                                    result.setTime(result.getTime() + duration);
                                    return result;
                                }

                                if (duration && typeof duration === 'object') {
                                    if ('milliseconds' in duration && typeof duration.milliseconds === 'number') {
                                        result.setTime(result.getTime() + duration.milliseconds);
                                        return result;
                                    }

                                    const { amount, unit } = duration;
                                    if (typeof amount === 'number') {
                                        switch (unit) {
                                            case 'months':
                                                result.setMonth(result.getMonth() + amount);
                                                break;
                                            case 'quarters':
                                                result.setMonth(result.getMonth() + 3 * amount);
                                                break;
                                            case 'years':
                                                result.setFullYear(result.getFullYear() + amount);
                                                break;
                                            default:

                                                result.setTime(result.getTime() + amount);
                                                break;
                                        }
                                        return result;
                                    }
                                }

                                return result;
                            }
                            function convertToMillisecondsUsingUnit(baseDate, amount, unit) {
                                const start = new Date(baseDate);
                                const end = new Date(start);

                                switch (unit) {
                                    case 'months':
                                        end.setMonth(start.getMonth() + amount);
                                        break;
                                    case 'quarters':
                                        end.setMonth(start.getMonth() + amount * 3);
                                        break;
                                    case 'years':
                                        end.setFullYear(start.getFullYear() + amount);
                                        break;
                                    default:
                                        return 0;
                                }

                                return end.getTime() - start.getTime();
                            }
                            function replaceRangeWithMax(input) {
                                return input.replace(/(\d+)[–-](\d+)/g, (_, start, end) => {
                                    return Math.max(parseInt(start), parseInt(end));
                                });
                            }

                            function generateTimeline(startDateStr, tasks) {
                                const baseDate = new Date(startDateStr);
                                const timeline = [];

                                for (const [comment, durationStr] of tasks) {

                                    console.log(`Duration for "${durationStr}": `);
                                    let dstri = replaceRangeWithMax(durationStr)
                                    let duration = parseDurationToMilliseconds(dstri);

                                    const start = new Date(baseDate);
                                    if (duration.milliseconds) {
                                        duration = duration.milliseconds
                                    }

                                    const durationInDays = duration / (1000 * 60 * 60 * 24);
                                    console.log(`Duration for "${comment}": ${durationInDays.toFixed(2)} days`);
                                    const end = addDuration(start, duration);
                                    timeline.push({
                                        comment,
                                        start: start.toISOString(),
                                        end: end.toISOString()
                                    });
                                }

                                return timeline;
                            }

                            function convertTextToArray(text) {
                                const lines = text.trim().split('\n');
                                const result = lines.map(line => {
                                    const parts = line.split('\t');
                                    if (parts.length === 2) {
                                        return [parts[0].trim(), parts[1].trim()];
                                    } else {
                                        const lastSpaceIndex = line.lastIndexOf(' ');
                                        const description = line.slice(0, lastSpaceIndex).trim();
                                        const duration = line.slice(lastSpaceIndex + 1).trim();
                                        return [description, duration];
                                    }
                                });
                                return result;
                            }

                            function dateFromX(x, xMin, xMax, start, end) {
                                const totalCanvasRange = xMax - xMin;
                                const totalTimeRange = end.getTime() - start.getTime();
                                const normalizedX = (x - xMin) / totalCanvasRange;
                                const date = new Date(start.getTime() + normalizedX * totalTimeRange);
                                return date;
                            }
                            function getXFromDate(date, xMin, xMax, start, end) {
                                const totalCanvasRange = xMax - xMin;
                                const totalTimeRange = end.getTime() - start.getTime();
                                const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

                                const normalizedTime = timeSinceStart / totalTimeRange;
                                return xMin + normalizedTime * totalCanvasRange;
                            }

                            function convertToTimelinePoints(events, xMin, xMax, startDate, endDate, currentY) {
                                if (events.length === 0) return [];
                                const globalStart = startDate;
                                const globalEnd = endDate;

                                const yStep = 0.1;

                                return events.map((event, index) => {
                                    const startDate = new Date(event.start);
                                    const endDate = new Date(event.end);

                                    const point = {
                                        x: getXFromDate(endDate, xMin, xMax, globalStart, globalEnd),
                                        y: currentY,
                                        type: 'interval',
                                        startX: getXFromDate(startDate, xMin, xMax, globalStart, globalEnd),
                                        name: event.comment,
                                        color: 'black'
                                    };

                                    currentY += yStep;
                                    return point;
                                });
                            }

                            let interaction_user = {
                                id: 'plot-export-menu',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                                smenu: smenu
                            }
                            interaction_user.draw = (grid, ctx) => {
                            }
                            interaction_user.mouseDownListener = (x, y) => {
                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                                const starting_date = dateFromX(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                                const yvalue = this.grid.Ywc(y)
                                let t = convertTextToArray(vtext)
                                let events = generateTimeline(starting_date, t)
                                const timelinePoints = convertToTimelinePoints(events, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate, ty);
                                for (let t of timelinePoints)
                                    this.scatterData.points.push(t)
                            }
                            interaction_user.close = () => {
                                smenu = null;
                                this.clk_drag(pt)

                            }
                            interaction_user.mouseMoveListener = (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                pt.grid.rescale();
                                this.grid.rescale();
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    smenu.mouseMove(pt.grid, mmx, mmy)
                                }
                            }
                            interaction_user.mouseUpListener = async (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    await smenu.mouseUp(pt.grid, mmx, mmy)
                                }
                                pt.wb(null)
                            }
                            pt.wb(interaction_user)

                        },
                        move: () => {
                        }
                    },

                ]

                const graph = CurrentLayout.getStashed('graph')
                if (graph) {
                    graph.showWindowMenu(menu, 10, 10, 400)
                }

            }
        }

    ];

    let menuList = []
    menuList.push({
        label: this.isBackground ? "Unlock from background" : "Lock to background",
        __date: '',
        click: async (scx, scy) => {
            this.isBackground = !this.isBackground;

        }
    });
    menuList.push({
        label: this.showNowBar ? "Hide [now] mark" : "Show [now] mark",
        __date: '',
        click: async (scx, scy) => {
            this.showNowBar = !this.showNowBar;
        }
    });
    menuList.push(
        {
            label: `Plot Name`,
            click: async (scx, scy) => {

                let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300)
                let m = va['Name']
                if (m != null) {
                    this.name = m;
                }

            },
            move: () => {
            }
        });
    menuList.push(
        {
            label: `Set start time...`,
            __date: '',
            click: async (scx, scy) => {

                let start_date = null;
                let end_date = null;

                let startTimePanel = null;
                const startPanel = createIonFunction((hook) => {
                    startTimePanel = hook;
                });
                let endTimePanel = null;
                const endnPanel = createIonFunction((hook) => {
                    endTimePanel = hook;
                });

                let main_layout = {
                    wid: 'card',
                    height: '100%',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [

                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'html',
                                        data: `<hr> Start date `
                                    }
                                },

                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'calendar-chooser',
                                        refCallback: startPanel,
                                        data: {
                                            select: createIonFunction((_date) => {
                                            })
                                        }
                                    }
                                },
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Yes', ionFunction: createIonFunction(async () => {

                                                        function calculateXRange(startDate, endDate) {
                                                            if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
                                                                throw new Error("Both startDate and endDate must be valid Date objects.");
                                                            }

                                                            const spanMs = endDate - startDate;
                                                            const xMin = 0;
                                                            const xMax = spanMs / (1000 * 60 * 60);

                                                            return { xMin, xMax };
                                                        }

                                                        let start = new Date(startTimePanel.getValue());

                                                        this.startDate = new Date(this.startDate);
                                                        this.endDate = new Date(this.endDate);

                                                        let duration = this.endDate - this.startDate;

                                                        let newEndDate = new Date(start.getTime() + duration);

                                                        this.startDate = start;
                                                        this.endDate = newEndDate;

                                                        const { xMin, xMax } = calculateXRange(this.startDate, this.endDate);
                                                        this.grid.zoom(xMin, xMax, 0, 1);
                                                        hideAllModal();
                                                        CurrentLayout.reset('mainPanel')

                                                    })
                                                },
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                        hideAllModal();
                                                        setTimeout(() => {
                                                            CurrentLayout.reset('mainPanel')
                                                        }, 300)

                                                    })
                                                }
                                            ]
                                        }
                                    }
                                }

                            ]]
                    }
                }

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', main_layout);

            },
            move: () => {
            }
        });

    menuList.push(
        {
            label: `Set Time Range`,
            __date: '',
            click: async (scx, scy) => {

                let start_date = null;
                let end_date = null;

                let startTimePanel = null;
                const startPanel = createIonFunction((hook) => {
                    startTimePanel = hook;
                });
                let endTimePanel = null;
                const endnPanel = createIonFunction((hook) => {
                    endTimePanel = hook;
                });

                let main_layout = {
                    wid: 'card',
                    height: '100%',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [

                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'html',
                                        data: `<hr> Start date `
                                    }
                                },

                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'calendar-chooser',
                                        refCallback: startPanel,
                                        data: {
                                            select: createIonFunction((_date) => {
                                            })
                                        }
                                    }
                                },
                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'html',
                                        data: `<hr> End date `
                                    }
                                },
                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'calendar-chooser',
                                        refCallback: endnPanel,
                                        data: {
                                            select: createIonFunction((_date) => {
                                            })
                                        }

                                    }
                                },
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Yes', ionFunction: createIonFunction(async () => {

                                                        function calculateXRange(startDate, endDate) {
                                                            if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
                                                                throw new Error("Both startDate and endDate must be valid Date objects.");
                                                            }

                                                            const spanMs = endDate - startDate;
                                                            const xMin = 0;
                                                            const xMax = spanMs / (1000 * 60 * 60);

                                                            return { xMin, xMax };
                                                        }
                                                        this.startDate = startTimePanel.getValue();
                                                        this.endDate = endTimePanel.getValue();
                                                        const { xMin, xMax } = calculateXRange(this.startDate, this.endDate);
                                                        this.grid.zoom(xMin, xMax, 0, 1);
                                                        hideAllModal();
                                                        CurrentLayout.reset('mainPanel')

                                                    })
                                                },
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                        hideAllModal();
                                                        setTimeout(() => {
                                                            CurrentLayout.reset('mainPanel')
                                                        }, 300)

                                                    })
                                                }
                                            ]
                                        }
                                    }
                                }

                            ]]
                    }
                }

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', main_layout);

            },
            move: () => {
            }
        });

}
menuList.push(
    {
        label: `Import timeline from file`,
        __date: '',
        click: async (scx, scy) => {
            if (!this.uid) {
                this.uid = uuid();
            }
            let v = await exec('baja/table/io/import-timeline-into-timeline.js', this)
            showModal(v)
        }
    })

menuList.push(
    {
        label: `Save plot`,
        __date: '',
        click: async (scx, scy) => {
            if (!this.uid) {
                this.uid = uuid();
            }
            let cross_reactive_card = {
                wid: 'card',
                data: {
                    "style.padding-top": '10px',
                    cards: [
                        [

                            {
                                'width': '90%',
                                'component': {
                                    wid: 'html',
                                    data: `<hr>Cross-reactive options`
                                }
                            },
                            {

                                'width': '100%',
                                'component': {
                                    wid: 'multi-select',
                                    data: {
                                        'list': ['Define time range when recreated.', 'Define new name when recreated.'],
                                        'ionfunction': createIonFunction(async (vlist_selected) => {

                                            let variants = []
                                            let keys = Object.keys(vlist_selected[0])
                                            for (let key of keys) {
                                                if (vlist_selected[0][key])
                                                    variants.push(key)
                                            }
                                        })
                                    }
                                },

                            },
                        ]]
                }
            }
            showModal(cross_reactive_card, 400, 200)

        }
    })
menuList.push(
    {
        label: `Publish plot`, click: async (x, y) => {
            let cross_reactive_card = {
                wid: 'card',
                data: {
                    "style.padding-top": '10px',
                    cards: [
                        [

                            {
                                'width': '90%',
                                'component': {
                                    wid: 'html',
                                    data: `<hr>Configuration: `
                                }
                            },
                            {

                                'width': '100%',
                                'component': {
                                    wid: 'multi-select',
                                    data: {
                                        'list': ['Define time range when recreated.', 'Define new name when recreated.'],
                                        'ionfunction': createIonFunction(async (vlist_selected) => {
                                            try {
                                                hideAllModal();
                                                if (vlist_selected['Define time range when recreated.']) {
                                                    this.config_script.set_time_on_init = true;
                                                }
                                                setTimeout(async () => {
                                                    await exec('baja/table/io/publish-yakro-plot.js', this, '/')
                                                }, 500)
                                            } catch (exception) { }
                                        })
                                    }
                                },
                            },
                        ]]
                }
            }
            showModal(cross_reactive_card, 500, 300)

        }
    },
)

menuList.push(
    {
        label: `Open plot`,
        __date: '',
        click: async (scx, scy) => {
            if (!this.uid) {
                this.uid = uuid();
            }
            let v = await exec('baja/table/io/open-yakro-plot.js', this)
            showModal(v)
        }
    })
menuList.push(
    {
        label: `Delete all timeline points`,
        __date: '',
        click: async (scx, scy) => {
            let confirm = await exec('baja/lib/confirm.js', 'Delete all?', async () => {
                this.scatterData.points = [];
            })
            showModal(confirm)
        }
    })
menuList.push(
    {
        label: `Link table to point...`,
        __date: '',

        click: async (scx, scy) => {

            let startx = this.grid.xmin;
            let __point;

            smenu = null;
            pt.clearMenu();
            pt.setMessage(" Click time/date on timeline you want to link table.")
            let t = {
                id: 'link-table',
                mouseMoveListener: null,
                mouseUpListener: null,
                mouseDownListener: null,
                draw: null,
                menuManager: null,
                smenu: smenu
            }
            t.draw = (grid, ctx) => {
                if (this.__date) {

                    if (__point && __point.startX !== undefined && x !== undefined) {
                        const startX = grid.X(__point.startX);
                        const y = grid.Y(__point.y)
                        const x = grid.Y(__point.x)
                        const arrowY = y - 10;
                        const color = __point.color || 'black';
                        const arrowSize = 24;
                        const direction = startX < x ? 1 : -1;

                        ctx.strokeStyle = color;
                        ctx.lineWidth = 4.5;
                        ctx.beginPath();
                        ctx.moveTo(startX, arrowY);
                        ctx.lineTo(x - direction * 12, arrowY);
                        ctx.stroke();

                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.moveTo(x, arrowY);
                        ctx.lineTo(x - direction * arrowSize, arrowY - 10);
                        ctx.lineTo(x - direction * arrowSize, arrowY + 10);
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.lineWidth = 2;
                    ctx.fillStyle = 'black';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'left';
                    console.log(" scx " + this.__scx_)
                    ctx.fillText(this.__date, this.__scx_, this.__scy_)
                    ctx.fill();
                }
            }
            t.mouseDownListener = (x, y) => {
                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                const yvalue = this.grid.Ywc(y)
                if (!__point) {
                    pt.setSelectedListener((uid) => {
                        if (__point && uid) {
                            let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                            let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                            this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                            __point.x = tx;
                            const ref = pt.getPlate(pt.grid.Xwc(x), pt.grid.Ywc(y))
                            if (ref) {
                                __point.ref = uid;
                                __point.drawHighlight = (pt, ctx) => {

                                    const ob = pt.getPlateWithUID(__point.ref)
                                    if (ob) {
                                        if (ob) {
                                            drawArrowFromPoint(ctx, __point, ob, this.grid, pt, true);
                                        }
                                    }

                                }
                                this.scatterData.points.push(__point)
                                pt.clearPlateListeners();
                            }
                        }
                    })

                    __point = {
                        x: tx,
                        bajabio: tx,
                        y: ty,
                        startX: tx,
                        name: 'link',
                        type: 'link'
                    }

                } else {
                }

            }
            t.close = () => {

            }
            t.mouseMoveListener = (x, y) => {

                this.__scx_ = x;

                this.__scy_ = y;
                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                const yvalue = this.grid.Ywc(y)
                if (__point)
                    __point.bjb = tx;
            }
            t.mouseUpListener = async (x, y) => {

            }

            pt.wb(t)
        },
        move: () => {
        }
    });

menuList.push(
);

menuList.push(
    {
        label: `Paste (label-text|time-duration) Concurrent`,
        __date: '',
        click: async (scx, scy) => {
            let start_date = this.startDate;

            const vtext = await navigator.clipboard.readText();
            function parseDurationToMilliseconds(durationStr) {
                const regexes = [
                    { regex: /(\d+)[–-](\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                    { regex: /(\d+)[–-](\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                    { regex: /(\d+)[–-](\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                    { regex: /(\d+)[–-](\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                    { regex: /(\d+)[–-](\d+)\s*months?/i, multiplier: 'months' },
                    { regex: /(\d+)[–-](\d+)\s*quarters?/i, multiplier: 'quarters' },
                    { regex: /(\d+)[–-](\d+)\s*years?/i, multiplier: 'years' },
                    { regex: /(\d+)\s*minutes?/i, multiplier: 60 * 1000 },
                    { regex: /(\d+)\s*hours?/i, multiplier: 60 * 60 * 1000 },
                    { regex: /(\d+)\s*days?/i, multiplier: 24 * 60 * 60 * 1000 },
                    { regex: /(\d+)\s*weeks?/i, multiplier: 7 * 24 * 60 * 60 * 1000 },
                    { regex: /(\d+)\s*months?/i, multiplier: 'months' },
                    { regex: /(\d+)\s*quarters?/i, multiplier: 'quarters' },
                    { regex: /(\d+)\s*years?/i, multiplier: 'years' },
                ];

                for (const { regex, multiplier } of regexes) {
                    const match = durationStr.match(regex);
                    if (match) {
                        const value = match[2] ? parseInt(match[2]) : parseInt(match[1]);
                        if (typeof multiplier === 'number') {
                            return { milliseconds: value * multiplier };
                        } else {
                            return { amount: value, unit: multiplier };
                        }
                    }
                }

                return { milliseconds: 0 };
            }

            function addDuration(date, duration) {
                const result = new Date(date);

                if (typeof duration === 'number') {
                    result.setTime(result.getTime() + duration);
                    return result;
                }

                if (duration && typeof duration === 'object') {
                    if ('milliseconds' in duration && typeof duration.milliseconds === 'number') {
                        result.setTime(result.getTime() + duration.milliseconds);
                        return result;
                    }

                    const { amount, unit } = duration;
                    if (typeof amount === 'number') {
                        switch (unit) {
                            case 'months':
                                result.setMonth(result.getMonth() + amount);
                                break;
                            case 'quarters':
                                result.setMonth(result.getMonth() + 3 * amount);
                                break;
                            case 'years':
                                result.setFullYear(result.getFullYear() + amount);
                                break;
                            default:

                                result.setTime(result.getTime() + amount);
                                break;
                        }
                        return result;
                    }
                }

                return result;
            }
            function convertToMillisecondsUsingUnit(baseDate, amount, unit) {
                const start = new Date(baseDate);
                const end = new Date(start);

                switch (unit) {
                    case 'months':
                        end.setMonth(start.getMonth() + amount);
                        break;
                    case 'quarters':
                        end.setMonth(start.getMonth() + amount * 3);
                        break;
                    case 'years':
                        end.setFullYear(start.getFullYear() + amount);
                        break;
                    default:
                        return 0;
                }

                return end.getTime() - start.getTime();
            }
            function replaceRangeWithMax(input) {
                return input.replace(/(\d+)[–-](\d+)/g, (_, start, end) => {
                    return Math.max(parseInt(start), parseInt(end));
                });
            }

            function generateTimeline(startDateStr, tasks) {
                const baseDate = new Date(startDateStr);
                const timeline = [];

                for (const [comment, durationStr] of tasks) {

                    console.log(`Duration for "${durationStr}": `);
                    let dstri = replaceRangeWithMax(durationStr)
                    let duration = parseDurationToMilliseconds(dstri);

                    const start = new Date(baseDate);
                    if (duration.milliseconds) {
                        duration = duration.milliseconds
                    }

                    const durationInDays = duration / (1000 * 60 * 60 * 24);
                    console.log(`Duration for "${comment}": ${durationInDays.toFixed(2)} days`);
                    const end = addDuration(start, duration);
                    timeline.push({
                        comment,
                        start: start.toISOString(),
                        end: end.toISOString()
                    });
                }

                return timeline;
            }

            function convertTextToArray(text) {
                const lines = text.trim().split('\n');
                const result = lines.map(line => {
                    const parts = line.split('\t');
                    if (parts.length === 2) {
                        return [parts[0].trim(), parts[1].trim()];
                    } else {
                        const lastSpaceIndex = line.lastIndexOf(' ');
                        const description = line.slice(0, lastSpaceIndex).trim();
                        const duration = line.slice(lastSpaceIndex + 1).trim();
                        return [description, duration];
                    }
                });
                return result;
            }

            function dateFromX(x, xMin, xMax, start, end) {
                const totalCanvasRange = xMax - xMin;
                const totalTimeRange = end.getTime() - start.getTime();
                const normalizedX = (x - xMin) / totalCanvasRange;
                const date = new Date(start.getTime() + normalizedX * totalTimeRange);
                return date;
            }
            function getXFromDate(date, xMin, xMax, start, end) {
                const totalCanvasRange = xMax - xMin;
                const totalTimeRange = end.getTime() - start.getTime();
                const timeSinceStart = new Date(date).getTime() - new Date(start).getTime();

                const normalizedTime = timeSinceStart / totalTimeRange;
                return xMin + normalizedTime * totalCanvasRange;
            }

            function convertToTimelinePoints(events, xMin, xMax, startDate, endDate, currentY) {
                if (events.length === 0) return [];
                const globalStart = startDate;
                const globalEnd = endDate;

                const yStep = 0.1;

                return events.map((event, index) => {
                    const startDate = new Date(event.start);
                    const endDate = new Date(event.end);

                    const point = {
                        x: getXFromDate(endDate, xMin, xMax, globalStart, globalEnd),
                        y: currentY,
                        type: 'interval',
                        startX: getXFromDate(startDate, xMin, xMax, globalStart, globalEnd),
                        name: event.comment,
                        color: 'black'
                    };

                    currentY += yStep;
                    return point;
                });
            }

            let interaction_user = {
                id: 'plot-export-menu',
                mouseMoveListener: null,
                mouseUpListener: null,
                mouseDownListener: null,
                draw: null,
                menuManager: null,
                smenu: smenu
            }
            interaction_user.draw = (grid, ctx) => {
            }
            interaction_user.mouseDownListener = (x, y) => {
                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                let ty = (this.grid.Ywc(y - this.grid.yi * 2))
                const starting_date = dateFromX(tx, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate)
                const yvalue = this.grid.Ywc(y)
                let t = convertTextToArray(vtext)
                let events = generateTimeline(starting_date, t)
                const timelinePoints = convertToTimelinePoints(events, this.grid.xmin, this.grid.xmax, this.startDate, this.endDate, ty);
                for (let t of timelinePoints)
                    this.scatterData.points.push(t)
            }
            interaction_user.close = () => {
                smenu = null;
                this.clk_drag(pt)

            }
            interaction_user.mouseMoveListener = (x, y) => {
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                pt.grid.rescale();
                this.grid.rescale();
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseMove(pt.grid, mmx, mmy)
                }
            }
            interaction_user.mouseUpListener = async (x, y) => {
                let mmx = pt.grid.Xwc(x);
                let mmy = pt.grid.Ywc(y);
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    await smenu.mouseUp(pt.grid, mmx, mmy)
                }
                pt.wb(null)
            }
            pt.wb(interaction_user)

        },
        move: () => {
        }
    });
